// ۲۳۲. رادارِ مختصِ هر استراتژی — نمایه، فیلتر، و ردیفی که عددش را ندارد
//
// ═══ خواسته‌ای که این دسته جوابش است ═══
//
// «در هر کدوم از استراتژیهای سمت راست … با توجه به ویژگی خاص خودش یک
// جدول تهیه کن با پارامترهای قابل انتخاب … مثلا برای کاوردکال بر اساس
// حداکثر سود، فاصله از سربه‌سری و بقیه پارامترها قابل تنظیم باشه.»
//
// ═══ چرا رفتار، نه متن ═══
//
// درسِ دو نوبت پیش: `check('…', src.includes('x'))` وقتی هم سبز می‌ماند
// که `x` غلط ساخته شده باشد. پس منطق در `core/strategy-radar.mjs` است و
// اینجا خودِ رفتار سنجیده می‌شود: کدام ستون درمی‌آید، کدام فیلتر کدام
// ردیف را می‌اندازد، و ردیفی که عددِ فیلترشده را ندارد چه سرنوشتی دارد.

import { check, group } from '../harness.mjs';
import { COLUMNS } from '../../core/evaluate.mjs';
import { CATALOG, byId } from '../../strategies/catalog.mjs';
import {
  RADAR_FILTERS, applyRadarFilters, filterByKey, filterLimit, isFlagFilter, passesFilter, radarProfile,
} from '../../core/strategy-radar.mjs';

group('۲۳۲ رادار استراتژی — نمایه');

const KEYS = new Set(COLUMNS.map((column) => column.key));

// ═══ هر سی‌وشش استراتژی نمایه دارد و هیچ کلیدِ اشتباهی در آن نیست ═══
//
// این همان ادعایی است که یک غلط املایی در فهرستِ ستون‌ها را می‌گیرد. بی
// آن، «retMonthPc» بی‌صدا یک ستون کم می‌کرد و هیچ‌کس نمی‌فهمید.
const profiles = CATALOG.map((def) => [def, radarProfile(def)]);
check('هر ۳۶ استراتژی نمایهٔ رادار دارد', profiles.length === 36 && profiles.every(([, p]) => p.columns.length > 0));
check('هیچ کلیدِ ناشناخته‌ای در هیچ نمایه‌ای نیست', profiles.every(([, p]) => p.unknown.length === 0));
check('هر ستونِ هر نمایه در قرارداد ستونیِ موتور هست', profiles.every(([, p]) => p.columns.every((key) => KEYS.has(key))));
check('هر فیلترِ هر نمایه در فهرست فیلترها هست', profiles.every(([, p]) => p.filters.every((f) => !!filterByKey(f.key))));
check('مبنای مرتب‌سازیِ هر نمایه، ستونی واقعی است', profiles.every(([, p]) => KEYS.has(p.sortKey)));
check('هر نمایه دست‌کم شش فیلتر دارد، وگرنه «قابل تنظیم» ادعای توخالی است',
  profiles.every(([, p]) => p.filters.length >= 6));
check('نام نماد، پاها و روز مانده در هر نمایه هست — بی این‌ها ردیف قابل بازبینی نیست',
  profiles.every(([, p]) => ['underlying', 'legNames', 'days'].every((key) => p.columns.includes(key))));

// ═══ ستونِ پا به تعداد پاهای همان استراتژی بریده می‌شود ═══
//
// «ارزش معاملات پای ۴» در یک اسپردِ دوپا همیشه «—» است و فقط پهنا
// می‌گیرد. این همان قاعده‌ای است که تا امروز فقط در رابط بود و با متن
// سنجیده می‌شد؛ حالا خالص است.
const two = radarProfile(byId('bull-call-spread'));
const four = radarProfile(byId('iron-condor')) || radarProfile(byId('long-call-butterfly'));
check('استراتژی دوپا ستون «ارزش معاملات پای ۳» نمی‌گیرد',
  two.legs === 2 && two.columns.includes('legValue2') && !two.columns.includes('legValue3'));
check('و استراتژی با پای بیشتر، می‌گیرد', four.legs >= 3 && four.columns.includes('legValue3'));
check('فیلترِ پای نبوده هم حذف می‌شود، نه اینکه همیشه صفر ردیف بدهد',
  !two.filters.some((f) => f.field === 'legValue3'));

// ═══ مثالِ صریحِ صاحب پروژه: کاورد کال ═══
const cc = radarProfile(byId('covered-call'));
check('کاورد کال با «حداکثر سود» و «فاصله از سربه‌سری» در نگاه اول',
  cc.columns.includes('maxProfit') && cc.columns.includes('beRoomPct') && cc.columns.includes('be1DistPct'));
check('و فیلترهایش همان دو را دارند',
  cc.filters.some((f) => f.key === 'minMaxProfit') && cc.filters.some((f) => f.key === 'minBeRoomPct'));
check('و «بازده ایستا» — اگر قیمت تکان نخورد چه می‌شود — هم ستون دارد هم مبنای مرتب‌سازی است',
  cc.columns.includes('retStaticPct') && cc.sortKey === 'retStaticPct');
check('و وجه تضمین و دارایی قفل‌شده، چون کاورد کال سهم می‌خوابانَد',
  cc.columns.includes('sharesLocked') && cc.columns.includes('blockedAsset'));

// ═══ نمایه‌ها واقعاً با هم فرق دارند، وگرنه «مختص خودش» حرف است ═══
const distinct = new Set(profiles.map(([, p]) => p.columns.join('|')));
check('نمایهٔ خانواده‌های مختلف یکی نیست', distinct.size >= 8);
const sorts = new Set(profiles.map(([, p]) => p.sortKey));
check('و مبنای مرتب‌سازی‌شان هم یکی نیست', sorts.size >= 5);
check('پروانه با «سود به زیان» شروع می‌شود، آربیتراژ با «بازده سالانه»',
  radarProfile(byId('long-call-butterfly')).sortKey === 'rewardRisk'
  && radarProfile(byId('box')).sortKey === 'retAnnPct');
check('تقویمی با «تتا به سرمایه» — چون موضوعش سرعتِ آب‌رفتنِ پای نزدیک است',
  radarProfile(byId('calendar-call')).sortKey === 'thetaToCapitalPct'
  && radarProfile(byId('calendar-call')).columns.includes('legIv2'));

group('۲۳۲ رادار استراتژی — فیلتر');

const F = (key) => filterByKey(key);
check('فهرست فیلترها کلید تکراری ندارد', new Set(RADAR_FILTERS.map((f) => f.key)).size === RADAR_FILTERS.length);
check('و هر فیلتر روی کلیدی از ردیف کار می‌کند، نه روی عددِ ساختهٔ خودش',
  RADAR_FILTERS.every((f) => typeof f.field === 'string' && f.field.length > 0));
check('فیلتر پرچمی از عددی جدا شناخته می‌شود',
  isFlagFilter(F('onlyExecutable')) && !isFlagFilter(F('minMaxProfit')));

// ═══ مقایسه‌ها ═══
check('«حداقل» یعنی بزرگ‌تر یا مساوی', passesFilter({ maxProfit: 100 }, F('minMaxProfit'), 100).pass
  && !passesFilter({ maxProfit: 99 }, F('minMaxProfit'), 100).pass);
check('«سقف» یعنی کوچک‌تر یا مساوی', passesFilter({ margin: 100 }, F('maxMargin'), 100).pass
  && !passesFilter({ margin: 101 }, F('maxMargin'), 100).pass);
check('سقفِ زیان روی قدرمطلق می‌نشیند، چون زیان منفی نوشته می‌شود',
  passesFilter({ maxLoss: -80 }, F('maxLossCap'), 100).pass
  && !passesFilter({ maxLoss: -120 }, F('maxLossCap'), 100).pass);
check('فیلترِ خاموش (مقدارِ نبوده) هیچ ردیفی را نمی‌اندازد',
  passesFilter({ maxProfit: NaN }, F('minMaxProfit'), undefined).pass
  && passesFilter({}, F('minMaxProfit'), null).pass);
// `Number('')` صفر است، و صفر شرطِ معتبری است. اگر کادرِ خالی از راهِ
// `Number` رد شود، کاربر چیزی ننوشته و جدول شرطِ «حداقل صفر» می‌گیرد —
// که ردیف‌های بی‌عدد را می‌اندازد بی آنکه کسی فیلتری روشن کرده باشد.
check('کادرِ خالی، فیلترِ «حداقل صفر» نمی‌سازد',
  filterLimit('') === null && filterLimit('  ') === null && filterLimit(undefined) === null
  && passesFilter({ maxProfit: NaN }, F('minMaxProfit'), '').pass === true);
check('ولی صفرِ نوشته‌شده یک شرطِ واقعی است',
  filterLimit(0) === 0 && filterLimit('0') === 0
  && passesFilter({ maxProfit: -5 }, F('minMaxProfit'), 0).pass === false
  && passesFilter({ maxProfit: 5 }, F('minMaxProfit'), '0').pass === true);

// ═══ «نامحدود» عددِ نداشته نیست ═══
//
// فروشِ برهنه زیانِ نامحدود دارد. اگر `-Infinity` مثل `NaN` رفتار کند،
// «سقف زیان ۱۰۰» آن ردیف را با علتِ «داده ندارد» می‌انداخت — در حالی که
// داده دارد و همان داده می‌گوید نباید بگذرد.
check('زیانِ نامحدود از سقفِ زیان رد نمی‌شود، و «بی‌داده» هم شمرده نمی‌شود',
  passesFilter({ maxLoss: -Infinity }, F('maxLossCap'), 1e12).pass === false
  && passesFilter({ maxLoss: -Infinity }, F('maxLossCap'), 1e12).missing === false);
check('سودِ نامحدود از هر «حداقل سود»ی می‌گذرد',
  passesFilter({ maxProfit: Infinity }, F('minMaxProfit'), 1e12).pass);
check('و پرچمِ زیان نامحدود، فیلترِ وارونهٔ خودش را دارد',
  passesFilter({ unlimitedLoss: true }, F('noUnlimitedLoss'), true).pass === false
  && passesFilter({ unlimitedLoss: false }, F('noUnlimitedLoss'), true).pass === true);

// ═══ ردیفی که عددش را ندارد، نمی‌گذرد — ولی بی‌صدا نمی‌افتد ═══
//
// این تصمیمِ قاعدهٔ صداقت عددی است: ردیفی با `popPct = NaN` **ثابت
// نکرده** که احتمال سودش پنجاه درصد است. پس می‌افتد، و جدا شمرده می‌شود
// تا خالی‌بودنِ جدول با «شرطم سخت بود» اشتباه گرفته نشود.
const missing = passesFilter({ popPct: NaN }, F('minPopPct'), 50);
check('ردیفِ بی‌عدد از فیلترِ عددی نمی‌گذرد', missing.pass === false);
check('و علتش «نداشتنِ داده» ثبت می‌شود، نه «رد شرط»', missing.missing === true);

const rows = [
  { id: 'a', maxProfit: 300, beRoomPct: 12, popPct: 70, executable: true, unlimitedLoss: false },
  { id: 'b', maxProfit: 150, beRoomPct: 4, popPct: 55, executable: true, unlimitedLoss: false },
  { id: 'c', maxProfit: 900, beRoomPct: NaN, popPct: 80, executable: false, unlimitedLoss: true },
];
const none = applyRadarFilters(rows, {}, cc.filters);
check('بی هیچ فیلترِ روشنی، همهٔ ردیف‌ها می‌مانند', none.rows.length === 3 && none.dropped === 0);

const one = applyRadarFilters(rows, { minMaxProfit: 200 }, cc.filters);
check('یک فیلترِ روشن، همان‌قدر که باید می‌اندازد',
  one.rows.map((r) => r.id).join(',') === 'a,c' && one.dropped === 1 && one.missing === 0);

const both = applyRadarFilters(rows, { minMaxProfit: 200, minBeRoomPct: 10 }, cc.filters);
check('دو فیلتر با «و» جمع می‌شوند', both.rows.map((r) => r.id).join(',') === 'a');
check('و ردیفی که به‌خاطرِ نبودِ داده افتاد، جدا شمرده می‌شود',
  both.dropped === 2 && both.missing === 1);
check('و شمارشِ هر فیلتر جداگانه گزارش می‌شود',
  both.by.minMaxProfit === 1 && both.by.minBeRoomPct === 2);

const flagged = applyRadarFilters(rows, { onlyExecutable: true }, cc.filters);
check('فیلترِ پرچمی فقط با تیک کار می‌کند',
  flagged.rows.map((r) => r.id).join(',') === 'a,b' && flagged.missing === 0);
check('و پرچمِ تیک‌نخورده فیلتر را روشن نمی‌کند',
  applyRadarFilters(rows, { onlyExecutable: false }, cc.filters).rows.length === 3);

check('فیلتری که در نمایهٔ این استراتژی نیست، اعمال نمی‌شود',
  applyRadarFilters(rows, { minVega: 99 }, cc.filters).rows.length === 3);

check('ورودی دست‌نخورده می‌ماند — فیلتر آرایهٔ تازه می‌دهد',
  rows.length === 3 && none.rows !== rows);

group('۲۳۲ تازگیِ عدد — نمادِ متوقف نباید زنده به نظر برسد');

// ═══ خواسته‌ای که این بخش جوابش است (بندِ ۵) ═══
//
// «هدف این قسمت اینه که موقعیتها را بتوانیم در سریعترین زمان ممکن رصد
// کنیم و مشخصاتشون را بدونیم.»
//
// در جدولی که ادعایش «زنده» است، نمادِ متوقف و نمادِ فعال یک شکل داشتند:
// `rowQuality` سن و وضعیت را می‌سنجید ولی فقط پرچمِ متنی می‌ساخت، و
// پرچم‌ها هم به ردیف نمی‌رسیدند. حالا هر دو ستون دارند و مرتب و فیلتر
// می‌شوند.

const { rowQuality } = await import('../../core/exec.mjs');

const leg = (staleSec, state, extra = {}) => ({
  exec: { quality: 'depth', short: 0, ...extra },
  quote: { ...(staleSec === undefined ? {} : { staleSec }), ...(state ? { state } : {}) },
});

const fresh = rowQuality([leg(3, 'A'), leg(9, 'A')], { staleSec: 900 });
check('سنِ مظنه، کهنه‌ترینِ پاهاست نه میانگین', fresh.staleSecMax === 9);
check('و وضعیت، وقتی همهٔ پاها مجازند، «مجاز» است',
  fresh.stateLabel === 'مجاز' && fresh.tradable === true);

const stopped = rowQuality([leg(3, 'A'), leg(5, 'I')], { staleSec: 900 });
check('یک پای متوقف، کلِ ترکیب را متوقف می‌کند',
  stopped.tradable === false && stopped.stateLabel.startsWith('متوقف'));
check('و پرچمِ متنی‌اش هم سرِ جایش می‌ماند', stopped.flags.includes('نماد مجاز نیست'));

// ═══ «نداشتن» با «صفر» یکی نیست ═══
//
// تابلو برای بعضی ابزارها اصلاً `staleSec` نمی‌دهد. اگر نبودش صفر خوانده
// شود، ستون «تازه» نشان می‌دهد — بدترین خطای ممکن در ستونی که کارش
// گفتنِ تازگی است.
const silent = rowQuality([leg(undefined, ''), leg(undefined, '')], { staleSec: 900 });
check('سنِ نداشته صفر نمی‌شود، `NaN` می‌ماند', !Number.isFinite(silent.staleSecMax));
check('و وضعیتِ نداشته نه «مجاز» است نه «متوقف»',
  silent.stateLabel === '' && silent.tradable === null);
check('پایی که سن دارد و پایی که ندارد، سنِ همان یکی را می‌دهد',
  rowQuality([leg(12, 'A'), leg(undefined, 'A')], { staleSec: 900 }).staleSecMax === 12);

// ═══ ستون و فیلتر، در هر ۳۶ نمایه ═══
check('«سنِ مظنه» و «وضعیت نماد» در دُمِ هر نمایه‌اند',
  profiles.every(([, p]) => p.columns.includes('staleSecMax') && p.columns.includes('stateLabel')));
check('و فیلترِ سقفِ سن و فیلترِ نمادِ مجاز هم در هر نمایه هست',
  profiles.every(([, p]) => p.filters.some((f) => f.key === 'maxStaleSec')
    && p.filters.some((f) => f.key === 'onlyTradable')));
check('«سقف سنِ مظنه» با عملگرِ سقف کار می‌کند، نه کف',
  passesFilter({ staleSecMax: 30 }, F('maxStaleSec'), 60).pass
  && !passesFilter({ staleSecMax: 90 }, F('maxStaleSec'), 60).pass);
// ردیفی که سنش را نمی‌داند، «تازه‌تر از ۶۰ ثانیه» را ثابت نکرده.
check('ردیفِ بی‌سن از فیلترِ سن نمی‌گذرد و علتش «نداشتنِ داده» است',
  passesFilter({ staleSecMax: NaN }, F('maxStaleSec'), 60).pass === false
  && passesFilter({ staleSecMax: NaN }, F('maxStaleSec'), 60).missing === true);
check('«فقط نمادِ مجاز» وضعیتِ نامعلوم را مجاز نمی‌شمارد',
  passesFilter({ tradable: true }, F('onlyTradable'), true).pass === true
  && passesFilter({ tradable: null }, F('onlyTradable'), true).pass === false
  && passesFilter({ tradable: false }, F('onlyTradable'), true).pass === false);
