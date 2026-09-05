// ۲۲۴. دیده‌بان شرطی — چند شرط، آستانهٔ نسبی، و دامنهٔ چند نمادی
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «سیستم شرط گذاری قابلیت اجرا روی یک ترکیب خاص یا روی یک ترکیب عمومی
// بدون مشخص کردن اعمالها رو داشته باشد… حتی انتخاب نمادهای مختلف امکان
// پذیر باشه… مثلا بگیم بول کال اسپردهایی با حداکثر زیان ۱۵ درصد و حداکثر
// سود ۴۰ درصد در میان همه نمادها… یا مثلا بول کال اسپرد در یک ترکیب خاص
// وقتی فاصله اسپرد رسید به ۹۰ درصد فاصله ۵ روز گذشته شان.»
//
// هر دو مثال، عیناً، در گروه‌های ب و ج آزموده می‌شوند.

import { check, group, near } from '../harness.mjs';
import {
  checkCondition, checkRule, conditionNote, evaluateWatch, inScope,
  normalizeCondition, normalizeWatchRule, referenceValue, thresholdOf,
  watchDistance, watchRuleNote, watchSnapshot,
} from '../../core/watch-rule.mjs';

/** عکسِ ساختگی یک ترکیب — فقط میدان‌هایی که شرط‌ها می‌خوانند. */
const snap = (over = {}) => ({
  key: 'k1', label: 'ترکیب یک', strategyId: 'bull-call-spread', strategyName: 'Bull Call Spread',
  baseIns: '9', baseName: 'اهرم',
  current: 2400, coveragePct: 60, roomPct: 40, gainedPct: 50, rank: 40, vsMeanPct: 5,
  maxProfit: 1600, maxLoss: 2400, returnPct: 45, lossPct: 12, rewardRisk: 0.67,
  perDayPct: 1.5, monthlyPct: 45, beWidthPct: 8, beLowPct: -3, beHighPct: 4,
  legValue: 9e9, legVolume: 1200, basePrice: 54000, daysLeft: 30,
  dayLow: 2200, dayHigh: 2600,
  history: { current: [2000, 2100, 2200, 2300, 2500, 2400] },
  ...over,
});

group('۲۲۴-الف. ساختِ شرط و قاعده');
{
  check('شرطِ معتبر ساخته می‌شود و پنجره‌اش وقتی مرجع نسبی است می‌ماند',
    normalizeCondition({ metric: 'current', op: 'ge', value: 90, ref: 'windowMean', windowDays: 5 })
      .condition.windowDays === 5);
  check('و در مرجعِ مطلق، پنجره صفر می‌شود چون معنی ندارد',
    normalizeCondition({ metric: 'lossPct', op: 'le', value: 15 }).condition.windowDays === 0);
  check('سنجهٔ ناشناخته رد می‌شود',
    normalizeCondition({ metric: 'هرچه', op: 'ge', value: 1 }).ok === false);
  check('آستانهٔ غیرعددی رد می‌شود',
    normalizeCondition({ metric: 'current', op: 'ge', value: 'زیاد' }).ok === false);
  // پنجرهٔ متحرک روی سنجه‌ای که تاریخچه ندارد، عددی نمی‌سازد. رد کردنش در
  // همین‌جا بهتر از ساختنِ قاعده‌ای است که هرگز آتش نمی‌کند و کاربر
  // نمی‌فهمد چرا.
  const badWindow = normalizeCondition({ metric: 'maxLoss', op: 'le', value: 90, ref: 'windowMean' });
  check('و پنجرهٔ متحرک روی سنجهٔ بی‌تاریخچه، همان‌جا رد می‌شود',
    badWindow.ok === false && badWindow.why.includes('تاریخچه'), badWindow.why);
  check('قاعدهٔ بی‌شرط ساخته نمی‌شود',
    normalizeWatchRule({ conditions: [] }).ok === false);
  check('جملهٔ قاعده هم دامنه را می‌گوید هم شرط‌ها را',
    watchRuleNote(normalizeWatchRule({
      strategyIds: ['bull-call-spread'],
      conditions: [{ metric: 'lossPct', op: 'le', value: 15 }, { metric: 'returnPct', op: 'ge', value: 40 }],
    }).rule).includes(' و '));
  check('و هیچ رقم لاتینی در جمله نمی‌ماند',
    !/[0-9]/.test(conditionNote({ metric: 'current', op: 'ge', value: 90, ref: 'windowMean', windowDays: 5 })),
    conditionNote({ metric: 'current', op: 'ge', value: 90, ref: 'windowMean', windowDays: 5 }));
}

group('۲۲۴-ب. «حداکثر زیان ۱۵٪ و حداکثر سود ۴۰٪، در میان همهٔ نمادها»');
{
  const rule = normalizeWatchRule({
    name: 'اسپرد ارزان',
    strategyIds: ['bull-call-spread'],
    conditions: [
      { metric: 'lossPct', op: 'le', value: 15 },
      { metric: 'returnPct', op: 'ge', value: 40 },
    ],
  }).rule;
  check('هر دو شرط برقرارند، پس قاعده می‌گیرد',
    checkRule(rule, snap()).held === true);
  // ═══ «و»، نه «یا» ═══
  //
  // دو قاعدهٔ جدا این را نمی‌ساخت: هرکدام جدا آتش می‌کردند و کاربر
  // ترکیبی می‌گرفت که فقط یکی از دو شرط را دارد.
  check('یک شرطِ ناکام کافی است که کل قاعده نگیرد',
    checkRule(rule, snap({ returnPct: 30 })).held === false);
  check('و همان‌جا می‌گوید کدام شرط چه دید',
    checkRule(rule, snap({ returnPct: 30 })).parts[1].value === 30);

  // دامنه: بی فهرست نماد، هر نمادی. با فهرست، فقط همان‌ها.
  check('بی فهرست نماد، ترکیبِ هر نمادی در دامنه است',
    inScope(rule, snap({ baseIns: '77' })) === true);
  const narrowed = { ...rule, baseIns: ['9'] };
  check('با فهرست نماد، فقط همان نمادها',
    inScope(narrowed, snap({ baseIns: '9' })) === true
    && inScope(narrowed, snap({ baseIns: '77' })) === false);
  check('و استراتژیِ دیگر در دامنه نیست',
    inScope(rule, snap({ strategyId: 'short-strangle' })) === false);

  // ═══ نسنجیدنی، برقرار نیست ═══
  //
  // استرانگل فروش زیانِ نامحدود دارد. قیدِ «حداکثر زیان زیر ۱۵٪» رویش
  // آتش نمی‌کند، و علتش گفته می‌شود.
  const naked = checkCondition({ metric: 'lossPct', op: 'le', value: 15, ref: 'abs' },
    snap({ lossPct: NaN }));
  check('سنجه‌ای که عدد ندارد، شرط را برقرار نمی‌کند و علتش گفته می‌شود',
    naked.held === false && naked.why.includes('عدد ندارد'), naked.why);
}

group('۲۲۴-ج. «وقتی فاصله رسید به ۹۰٪ فاصلهٔ ۵ روز گذشته‌شان»');
{
  const condition = { metric: 'current', op: 'ge', value: 90, ref: 'windowMean', windowDays: 5 };
  // پنجره **پیش از** نقطهٔ آخر بسته می‌شود: [2000,2100,2200,2300,2500]
  // میانگین ۲٬۲۲۰ و ۹۰٪ آن ۱٬۹۹۸.
  check('مرجع، میانگینِ پنج نقطهٔ پیش از امروز است — نه شاملِ خودِ امروز',
    near(referenceValue(condition, snap()), 2220), `${referenceValue(condition, snap())}`);
  check('و آستانه، همان ضرب در درصدِ خواسته‌شده',
    near(thresholdOf(condition, snap()), 1998), `${thresholdOf(condition, snap())}`);
  check('فاصلهٔ ۲٬۴۰۰ از آن آستانه بالاتر است، پس شرط می‌گیرد',
    checkCondition(condition, snap()).held === true);
  check('و فاصلهٔ ۱٬۹۰۰ نمی‌گیرد',
    checkCondition(condition, snap({ current: 1900 })).held === false);
  check('پنجرهٔ کوتاه‌تر، مرجع دیگری می‌دهد',
    near(referenceValue({ ...condition, windowDays: 2 }, snap()), 2400),
    `${referenceValue({ ...condition, windowDays: 2 }, snap())}`);
  check('کمینه و بیشینهٔ پنجره هم مرجع می‌شوند',
    referenceValue({ ...condition, ref: 'windowMin' }, snap()) === 2000
    && referenceValue({ ...condition, ref: 'windowMax' }, snap()) === 2500);
  check('کف و سقف امروز هم مرجع‌اند',
    referenceValue({ metric: 'current', ref: 'dayLow' }, snap()) === 2200
    && referenceValue({ metric: 'current', ref: 'dayHigh' }, snap()) === 2600);
  // تاریخچهٔ تک‌نقطه‌ای پنجره نمی‌سازد؛ آستانه `NaN` می‌شود و شرط برقرار
  // نیست — نه اینکه پنجره را با همان یک نقطه پر کند.
  const thin = snap({ history: { current: [2400] } });
  check('تاریخچهٔ ناکافی، آستانه نمی‌سازد و شرط را برقرار نمی‌کند',
    !Number.isFinite(thresholdOf(condition, thin))
    && checkCondition(condition, thin).why.includes('مرجع'));

  // و همین شرط، قفل‌شده روی یک ترکیبِ مشخص.
  const pinned = normalizeWatchRule({ comboKey: 'k1', conditions: [condition] }).rule;
  check('قاعده می‌تواند به یک ترکیبِ مشخص قفل شود',
    inScope(pinned, snap()) === true && inScope(pinned, snap({ key: 'k2' })) === false);
}

group('۲۲۴-د. آتش، آرامش، و شمارش');
{
  const rule = normalizeWatchRule({
    strategyIds: ['bull-call-spread'], cooldownSec: 60,
    conditions: [{ metric: 'returnPct', op: 'ge', value: 40 }],
  }).rule;
  const rows = [snap(), snap({ key: 'k2', returnPct: 10 }), snap({ key: 'k3', baseIns: '77' })];
  const first = evaluateWatch({ rules: [rule], snapshots: rows, prev: {}, nowMs: 1000 });
  check('روی هر ترکیبی که شرط را دارد آتش می‌کند، در هر نمادی',
    first.fired.length === 2 && first.fired.map((one) => one.comboKey).join(',') === 'k1,k3',
    first.fired.map((one) => one.comboKey).join('،'));
  check('و هر آتش، عددی که دید و آستانه‌ای که سنجید را حمل می‌کند',
    first.fired[0].parts[0].value === 45 && first.fired[0].parts[0].threshold === 40);
  check('شمارندهٔ قاعده یکی بالا می‌رود، نه به تعداد ترکیب‌ها',
    first.rules[0].firedCount === 1 && first.rules[0].lastFiredAt === 1000);
  const quiet = evaluateWatch({ rules: first.rules, snapshots: rows, prev: first.prev, nowMs: 30000 });
  check('در دورهٔ آرامش دوباره آتش نمی‌کند',
    quiet.fired.length === 0);
  const later = evaluateWatch({ rules: first.rules, snapshots: rows, prev: first.prev, nowMs: 90000 });
  check('و پس از آرامش دوباره می‌کند',
    later.fired.length === 2);
  check('قاعدهٔ خاموش اصلاً سنجیده نمی‌شود',
    evaluateWatch({ rules: [{ ...rule, enabled: false }], snapshots: rows, nowMs: 1000 })
      .fired.length === 0);
  // `matched` جدا از `fired` است: کاربر باید بتواند پیش از تأیید ببیند
  // قاعده همین حالا روی چند ترکیب می‌نشیند، بی آنکه زنگی بخورد.
  check('پیش‌نمایش، همهٔ ترکیب‌های منطبق را می‌دهد حتی وقتی آرامش جلوی زنگ را گرفته',
    quiet.matched.get(rule.id).length === 2);

  // عبور، به سنجشِ قبلی نیاز دارد و در نخستین سنجش آتش نمی‌کند.
  const cross = normalizeWatchRule({
    conditions: [{ metric: 'current', op: 'crossUp', value: 2300 }],
  }).rule;
  check('«عبور» در نخستین سنجش آتش نمی‌کند',
    evaluateWatch({ rules: [cross], snapshots: [snap()], prev: {}, nowMs: 1 }).fired.length === 0);
  check('ولی در لحظهٔ رد شدن از خط، می‌کند',
    evaluateWatch({ rules: [cross], snapshots: [snap()],
      prev: { k1: snap({ current: 2200 }) }, nowMs: 1 }).fired.length === 1);
}

group('۲۲۴-ه. عکسِ ردیفِ رادار');
{
  const row = {
    key: 'bull::x', def: { id: 'bull-call-spread', name: 'Bull Call Spread' }, strikes: [50000, 54000],
    gap: { current: 2400, coveragePct: 60, roomPct: 40, gainedPct: 50, daysLeft: 30 },
    metrics: { maxProfit: 1600, maxLoss: 2400, returnPct: 45, lossPct: 12, legValue: 9e9 },
    verdict: { rank: 40, vsMean: 5 },
    series: { points: [{ current: 2000, coveragePct: 50, basePrice: 52000 }, { current: 2400, coveragePct: 60, basePrice: 54000 }] },
  };
  const one = watchSnapshot(row, { baseIns: '9', baseName: 'اهرم', basePrice: 54000 });
  check('عکس، هر سه خانوادهٔ سنجه را از یک ردیف برمی‌دارد',
    one.current === 2400 && one.returnPct === 45 && one.rank === 40 && one.basePrice === 54000);
  check('و تاریخچه‌اش را هم، تا آستانهٔ نسبی کار کند',
    one.history.current.join(',') === '2000,2400');
  // ── رگرسیون: «کف امروز» کفِ امروز است، نه کفِ بازه ──────────────────
  //
  // گزارش صاحب پروژه: «کف امروز و سقف امروز در واقع کف و سقف کل بازهٔ
  // تاریخی‌اند. ریزمعامله‌های امروز وارد محاسبهٔ این دو مرجع نمی‌شوند.»
  // درست بود: `Math.min`/`Math.max` روی نقاطِ سریِ **روزانهٔ بازه** اجرا
  // می‌شد، پس شرطِ «۵٪ بالاتر از کف امروز» در عمل روی کفِ سه‌ماهه
  // می‌نشست. حالا اگر دفترِ امروز داده نشود، عدد **نداریم** — و نداشتن،
  // بهتر از عددِ اشتباه است.
  check('بی دفترِ مشاهده‌های امروز، «کف/سقف امروز» عدد ندارد و از سریِ تاریخی پر نمی‌شود',
    !Number.isFinite(one.dayLow) && !Number.isFinite(one.dayHigh));
  const withDay = watchSnapshot(row, { baseIns: '9', baseName: 'اهرم', basePrice: 54000,
    day: { low: 2350, high: 2500 } });
  check('و با دفترِ امروز، همان عددهای امروز می‌آیند نه کمینه و بیشینهٔ بازه',
    withDay.dayLow === 2350 && withDay.dayHigh === 2500);
  check('نامِ استراتژی و نماد پایه هم می‌آیند، چون متنِ هشدار بی آن‌ها معلق است',
    one.strategyName === 'Bull Call Spread' && one.baseName === 'اهرم');
}

group('۲۲۴-و. بن‌بستِ «عبور» در پیش‌نمایش');
{
  // گزارش صاحب پروژه: «ساخت شرط عبور از آستانه عملاً بن‌بست دارد. عملگر
  // پیش‌فرض به مقدار قبلی نیاز دارد؛ در پیش‌نمایش مقدار قبلی وجود ندارد،
  // پس صفر ترکیب منطبق می‌شود و دکمهٔ ذخیره و شروع رصد غیرفعال می‌ماند.»
  //
  // پیش‌نمایش یک سنجش است و عبور در یک سنجش **قابل مشاهده نیست**. پس در
  // پیش‌نمایش «رد شد» مثل «آن‌سوی خط هست» سنجیده می‌شود، و زنگِ واقعی
  // همچنان فقط در لحظهٔ عبور می‌زند.
  const condition = { metric: 'current', op: 'crossUp', value: 2000, ref: 'abs', windowDays: 0 };
  const snapshot = { key: 'k', current: 2400 };
  const cold = checkCondition(condition, snapshot, null);
  check('بی پیش‌نمایش، نخستین سنجش هیچ عبوری نمی‌بیند — و این درست است',
    cold.held === false && cold.why.includes('سنجش قبلی'));
  const preview = checkCondition(condition, snapshot, null, { previewCross: true });
  check('در پیش‌نمایش، همان شرط روی همان عدد منطبق می‌شود',
    preview.held === true && preview.preview === true);
  const below = checkCondition(condition, { key: 'k', current: 1900 }, null, { previewCross: true });
  check('و پیش‌نمایش، شرطِ برقرارنشده را برقرار نمی‌کند',
    below.held === false);
  // و مهم‌تر: پیش‌نمایش نباید به رصد نشت کند. با مقدارِ قبلیِ موجود،
  // «عبور» همان عبورِ واقعی است.
  const real = checkCondition(condition, snapshot, { current: 2100 }, { previewCross: true });
  check('با وجودِ مقدارِ قبلی، عبور همان عبورِ واقعی است و نه «بودن»',
    real.held === false && real.why === 'عبوری رخ نداد');
}

group('۲۲۴-ز. فاصله تا برقرار شدنِ قاعده — برای اولویتِ سهمیهٔ زنده');
{
  const rule = { id: 'r1', enabled: true, conditions: [
    { metric: 'returnPct', op: 'ge', value: 40, ref: 'abs', windowDays: 0 },
    { metric: 'lossPct', op: 'le', value: 20, ref: 'abs', windowDays: 0 },
  ] };
  check('ترکیبی که هر دو شرط را دارد، فاصله‌اش صفر است',
    watchDistance(rule, { returnPct: 45, lossPct: 12 }) === 0);
  // «و» است، پس بدترین شرط ملاک است نه بهترین.
  const far = watchDistance(rule, { returnPct: 20, lossPct: 12 });
  const close = watchDistance(rule, { returnPct: 38, lossPct: 12 });
  check('و هرچه دورتر، عدد بزرگ‌تر — پس مرتب‌سازی صعودی یعنی نزدیک‌ترین اول',
    far > close && close > 0);
  check('سنجهٔ نداشته، فاصله نمی‌سازد؛ عددِ ساختگی جایش نمی‌نشیند',
    !Number.isFinite(watchDistance(rule, { returnPct: NaN, lossPct: 12 })));
}
