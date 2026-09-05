// ۲۳۰. هشدارِ رادار در ساعت بازار — و چیزی که نباید ادعا شود
//
// ═══ گزارشی که این دسته جوابش است ═══
//
// «رادار بدون داشتن قیمت زنده، اعلان زنده می‌فرستد. در آزمون، وضعیت
// ۰ ترکیب با قیمت زنده بود؛ با این حال شرط فاصله ≥ ۰ روی قیمت تاریخی
// اجرا شد و ده‌ها اعلان ثبت کرد. علت این است که هشدار روی همهٔ ردیف‌ها
// اجرا می‌شود، نه فقط ردیف‌های دارای قیمت زنده.»
//
// این بدترین ایرادِ آن گزارش بود: هشداری که کاربر آن را «اکنون» می‌خواند
// و عددش مالِ روزِ سنجش است، از نبودِ هشدار بدتر است — چون بی‌خبری را با
// خبرِ غلط عوض می‌کند.
//
// سه ایرادِ دیگرِ همان خانواده هم اینجاست: سنجه‌ها با قیمتِ زنده دوباره
// حساب نمی‌شدند، قیمتِ نماد پایه عمداً `NaN` فرستاده می‌شد، و رصد روی
// بازهٔ تاریخی هم روشن می‌شد.

import { check, group, readSrc } from '../harness.mjs';
import { alertDistance, alertMetric, alertSnapshot, evaluateAlerts } from '../../core/gap-alert.mjs';
import { expiryShortfall } from '../../core/radar-history.mjs';
import { comboLiveQuote, liveQuoteBook } from '../../core/live-quote.mjs';
import { measureGap } from '../../core/spread-gap.mjs';
import { comboMetrics } from '../../core/radar-metrics.mjs';

group('۲۳۰-الف. هشدار فقط روی ردیفِ زنده');
{
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  // با چرخشِ سهمیه، شرطِ «زنده بودن» تنگ‌تر هم شد: هشدار فقط روی
  // ردیف‌هایی می‌نشیند که در **همین تیک** اندازه‌گیری شده‌اند، نه حتی
  // ردیفی که عددِ زندهٔ تیکِ قبل را نگه داشته.
  check('حلقهٔ هشدار روی ردیف‌های همین تیک می‌چرخد، نه روی همهٔ ردیف‌ها',
    src.includes('if (!keys.has(row.key)) continue;')
    && src.includes('runAlerts(applied.fresh_keys)'));
  check('و بی رصدِ روشن یا بی ردیفِ تازه، اصلاً سنجیده نمی‌شود',
    src.includes('if (!rules.length || !liveTimer) return;')
    && src.includes('if (!keys.size) return;'));
  check('«زنده» یعنی پاهای هم‌زمانِ قیمت‌دار، نه هر پاسخی که عددی داشت',
    src.includes('comboLiveQuote({ legs: row.legs, book: liveBook, nowSec })'));
  check('و در منبعِ دفتر، سمتِ درستِ هر پا با عمقِ خواسته‌شده',
    src.includes('comboBookQuote({ legs: row.legs, book: liveBook, minUnits: depth })'));
}

group('۲۳۰-ب. عددِ زنده، همه‌جا زنده');
{
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  // «سود، زیان و بازده با قیمت زنده دوباره محاسبه نمی‌شوند … فاصله از
  // ۱٬۱۲۴ به ۲٬۲۴۸ رسید، اما حداکثر سود ٪ همچنان ۴۲۷٫۴۹٪ باقی ماند.»
  check('سنجه‌های کامل هم با قیمتِ زنده از نو ساخته می‌شوند، نه فقط فاصله',
    src.includes('legs: row.legs, prices, spot, rowByIns: {},'));
  check('و ارزش و حجمِ معامله از تابلوی روزانه نگه داشته می‌شوند، چون مظنهٔ زنده آن‌ها را نمی‌دهد',
    src.includes('legValue: row.daily?.metrics?.legValue ?? metrics.legValue'));
  check('خاموش‌شدنِ رصد، عددِ روزِ سنجش را برمی‌گرداند',
    src.includes('function restoreDaily()') && /stopWatch|stopLive[\s\S]{0,600}restoreDaily\(\)/.test(src));
  // «شرط قیمت نماد پایه در رادار هیچ‌وقت کار نمی‌کند. رادار مقدار قیمت
  // پایه را هنگام ساخت هشدار عمداً NaN می‌فرستد.»
  check('قیمتِ نماد پایه زنده گرفته می‌شود و به عکسِ هشدار می‌رسد',
    src.includes('reserve: ua?.ins ? [String(ua.ins)] : []')
    && src.includes('basePrice: liveBase,'));
  check('و همان اسپاتِ زنده مبنای وجه تضمین می‌شود',
    src.includes('const spot = Number.isFinite(liveBase) && liveBase > 0 ? liveBase : row.daily?.spot ?? row.spot;'));
}

group('۲۳۰-ج. رصدِ زنده روی بازهٔ گذشته روشن نمی‌شود');
{
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  // «قراردادها و روزهای مانده بر اساس پایان بازهٔ انتخابی ساخته می‌شوند،
  // نه امروز. با انتخاب یک بازهٔ قدیمی ممکن است قرارداد منقضی یا
  // روزماندهٔ تاریخی رصد شود.»
  check('روزِ سنجش با امروز سنجیده می‌شود، و ناهم‌خوانی، رصد را روشن نمی‌کند',
    src.includes('function liveDayGate()')
    && /if \(!gate\.ok\) \{[\s\S]{0,120}\$\('gr-live'\)\.checked = false;/.test(src));
  check('و علتش گفته می‌شود، نه اینکه تیک بی‌صدا برگردد',
    src.includes('روز سنجشِ این ساخت'));
}

group('۲۳۰-د. توقف و هم‌پوشانی درخواست‌ها');
{
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  check('توقف، نسل را عوض می‌کند و درخواستِ جاری را لغو',
    src.includes('liveGen += 1') && src.includes('liveJob?.abort()'));
  check('پاسخِ نسلِ خاموش‌شده دور ریخته می‌شود',
    src.includes('if (gen !== liveGen || !mounted) return;'));
  check('و تیکِ تازه روی پاسخِ نیامده سوار نمی‌شود',
    src.includes('if (liveBusy) return;'));
}

group('۲۳۰-ه. سهمیهٔ زنده، با اولویتِ کاربر');
{
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  // «برنامه اولین ۲۴ شناسهٔ تولیدشده را برمی‌دارد؛ مرتب‌سازی بر حجم،
  // ارزش معامله یا نزدیکی به شرط انجام نمی‌شود.»
  check('سهمیه از موتور می‌آید، نه از بریدنِ فهرستِ پاها',
    src.includes('planLiveQuotes({') && !src.includes('.map((leg) => String(leg.ins)))].slice(0, 24)'));
  check('و کاربر می‌تواند اولویت را انتخاب کند',
    src.includes('id="gr-live-priority"') && src.includes('LIVE_PRIORITIES.map'));
  check('«نزدیک‌ترین به شرط» از فاصلهٔ خودِ قاعده‌ها ساخته می‌شود',
    src.includes('function nearScore()') && src.includes('alertDistance(rules, snapshot)'));
  check('و شمارِ سهمیه‌گرفته و بیرون‌مانده نوشته می‌شود',
    src.includes('ترکیب سهمیه گرفت') && src.includes('ترکیب بیرون ماند'));
}

group('۲۳۰-و. «کف امروز» یعنی کفِ امروز');
{
  // مرجعِ کف و سقف پیش از این کمینه و بیشینهٔ کل بازهٔ تاریخی بود.
  const dry = alertSnapshot({ gap: { current: 2400 }, day: null });
  check('بی دفترِ امروز، درصدِ کف و سقف عدد ندارد',
    !Number.isFinite(dry.fromDayLowPct) && !Number.isFinite(dry.fromDayHighPct));
  const wet = alertSnapshot({ gap: { current: 2400 }, day: { low: 2000, high: 3000 } });
  check('و با دفترِ امروز، از همان عددهای امروز ساخته می‌شود',
    Math.abs(wet.fromDayLowPct - 20) < 1e-9 && Math.abs(wet.fromDayHighPct + 20) < 1e-9);
  check('برچسبِ سنجه هم همان چیزی را می‌گوید که سنجیده می‌شود',
    alertMetric('fromDayLowPct').label.includes('مشاهده‌شده')
    && alertMetric('fromDayHighPct').label.includes('مشاهده‌شده'));
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  check('و رابط، دفترِ امروز را از مشاهده‌های همین رصد می‌سازد',
    src.includes('dayRange.observe(row.key, gap.current, { date: today })')
    && src.includes('day: dayRange.date === today ? dayRange.get(row.key) : null'));
}

group('۲۳۰-ز. فاصله تا هشدار — برای اولویت سهمیه');
{
  const rules = [{ id: 'r1', enabled: true, metric: 'coveragePct', op: 'ge', value: 80 }];
  check('ترکیبی که شرط را دارد، فاصله‌اش صفر است',
    alertDistance(rules, { coveragePct: 90 }) === 0);
  check('و هرچه دورتر، عدد بزرگ‌تر',
    alertDistance(rules, { coveragePct: 40 }) > alertDistance(rules, { coveragePct: 70 }));
  check('قاعدهٔ خاموش یا خارج از دامنه، فاصله نمی‌سازد',
    !Number.isFinite(alertDistance([{ ...rules[0], enabled: false }], { coveragePct: 90 }))
    && !Number.isFinite(alertDistance([{ ...rules[0], strategyId: 'x' }],
      { coveragePct: 90, strategyId: 'y' })));
}

group('۲۳۰-ح. علتِ نبودِ ساختارِ مورب، درست گفته می‌شود');
{
  // «در نمونه فقط یک سررسید فعال بود، بنابراین Diagonal Call/Put قابل
  // ساخت نبود. پیام برنامه پیشنهاد بررسی قیمت‌ها را می‌دهد و نمی‌گوید
  // این استراتژی حداقل دو سررسید نیاز دارد.»
  const defs = [{ name: 'Diagonal Call Spread', expiries: 2 }, { name: 'Bull Call Spread', expiries: 1 }];
  const one = expiryShortfall(defs, { kept: 1 });
  check('ساختارِ دو سررسیدی با یک سررسید، صریح نام برده می‌شود',
    one.short.join(',') === 'Diagonal Call Spread' && one.need === 2 && one.kept === 1);
  check('و پیام می‌گوید مسئله قیمت نیست، ساختار است',
    one.note.includes('سررسید هم‌زمان می‌خواهد') && one.note.includes('مسئله، قیمتِ ابزارها نیست'));
  check('با دو سررسید، شکایتی نیست',
    expiryShortfall(defs, { kept: 2 }).note === '');
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  check('و رادار همین پیام را به‌جای «قیمت‌ها را بررسی کن» می‌دهد',
    src.includes('const shortfall = expiryShortfall(defs, win);') && src.includes('shortfall.note'));
}

group('۲۳۰-ط. موجِ هشدار، و دفترچه‌ای که برای هر تب جداست');
{
  const src = readSrc('../ui/gap-alarm.mjs');
  // «کارت‌های صفحه به ۶ مورد و دفترچه به ۲۰۰ مورد محدود است؛ بنابراین
  // بخشی از رخدادهای یک موج بزرگ از دفترچه حذف می‌شود. دفترچهٔ رادار و
  // دیده‌بان نیز مشترک است و رخدادهای دو بخش مخلوط می‌شوند.»
  check('دو دفترچهٔ جدا، یکی برای هر تب',
    src.includes("radar: 'gap-alerts:log:radar'") && src.includes("watch: 'gap-alerts:log:watch'"));
  check('و خواندن، نوشتن و پاک‌کردن هر سه دامنه می‌گیرند',
    /export function readLog\(scope = 'radar'\)/.test(src)
    && /export function writeLog\(rows, scope = 'radar'\)/.test(src)
    && /export function clearLog\(scope = 'radar'\)/.test(src));
  check('سقفِ دفترچه بالا رفت تا موجِ بزرگ خودش را بیرون نیندازد',
    src.includes('const LOG_MAX = 1000;'));
  check('موج، همه‌اش در دفترچه می‌ماند ولی صفحه را با صدها کارت پر نمی‌کند',
    src.includes('export function deliverBurst(') && src.includes('const BURST_CARDS = 4;')
    && src.includes('ترکیب دیگر در همین لحظه'));
  check('و صدا یک بار پخش می‌شود، نه به تعداد ترکیب‌ها',
    src.includes('sound: sound && at === 0'));
  const radar = readSrc('../ui/tabs/spread-radar.mjs');
  check('رادار موج را از همان مسیر می‌رساند و دفترچهٔ خودش را می‌خواند',
    radar.includes("deliverBurst(result.fired, { host: $('gr-alarm-host'), scope: 'radar', kind: 'gap' })")
    && radar.includes("readLog('radar')") && radar.includes("clearLog('radar')"));
}

group('۲۳۰-ی. یک تیکِ کامل، سرتاسر — از دفترِ مظنه تا زنگ');
{
  // این گروه، ادعای متنی نیست: همان زنجیره‌ای را می‌سازد که رابط در هر
  // تیک می‌سازد — دفترِ مظنه، فیلترِ هم‌زمانی، فاصله، سنجه‌ها، عکسِ شرط،
  // و موتورِ هشدار — و روی خروجی حکم می‌دهد.
  const legs = [
    { ins: '11', kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 50000, name: 'ض۵۰' },
    { ins: '22', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 54000, name: 'ض۵۴' },
  ];
  const rule = { id: 'r1', enabled: true, metric: 'current', op: 'ge', value: 0,
    cooldownSec: 0, firedCount: 0, lastFiredAt: 0 };

  const tick = (items, nowSec) => {
    const book = liveQuoteBook({ at: 1, items });
    const quote = comboLiveQuote({ legs, book, nowSec });
    if (!quote.ok) return { quote, snapshots: {} };
    const gap = measureGap({ legs, prices: book.prices, strategyId: 'bull-call-spread', scale: 'raw', units: 1 });
    const metrics = comboMetrics({ legs, prices: book.prices, spot: 52000, rowByIns: {},
      settings: {}, daysLeft: 30, scale: 'raw', units: 1 });
    const snapshot = alertSnapshot({ gap, day: null, basePrice: 52000 });
    return { quote, gap, metrics, snapshots: { k: snapshot } };
  };

  const noon = 12 * 3600;
  const fresh = { 11: { summary: { lastPrice: 1500, lastTime: 115900 } },
    22: { summary: { lastPrice: 376, lastTime: 115930 } } };
  const doubled = { 11: { summary: { lastPrice: 3000, lastTime: 115900 } },
    22: { summary: { lastPrice: 752, lastTime: 115930 } } };
  const apart = { 11: { summary: { lastPrice: 1500, lastTime: 90000 } },
    22: { summary: { lastPrice: 376, lastTime: 115930 } } };

  const one = tick(fresh, noon);
  const two = tick(doubled, noon);
  check('پاهای هم‌زمان، ترکیبِ زنده می‌سازند و فاصله عدد می‌گیرد',
    one.quote.ok === true && one.gap.ok === true && one.metrics.ok === true);
  // ═══ همان چیزی که گزارش دید ═══
  // «در بازپخش کنترل‌شده قیمت پاها دو برابر شد؛ فاصله از ۱٬۱۲۴ به ۲٬۲۴۸
  // رسید، اما حداکثر سود ٪ همچنان ۴۲۷٫۴۹٪ باقی ماند.»
  check('قیمتِ پاها که دو برابر شود، فاصله هم دو برابر می‌شود',
    Math.abs(two.gap.current - one.gap.current * 2) < 1e-6);
  check('و بازده دیگر ثابت نمی‌ماند — سنجه‌ها هم با همان قیمت از نو ساخته می‌شوند',
    Number.isFinite(one.metrics.returnPct) && Number.isFinite(two.metrics.returnPct)
    && Math.abs(two.metrics.returnPct - one.metrics.returnPct) > 1,
    `${one.metrics.returnPct?.toFixed(2)} → ${two.metrics.returnPct?.toFixed(2)}`);

  // ═══ و آنچه اصلاً نباید زنگ بزند ═══
  // «وضعیت ۰ ترکیب با قیمت زنده بود؛ با این حال شرط فاصله ≥ ۰ روی قیمت
  // تاریخی اجرا شد و ده‌ها اعلان ثبت کرد.» ترکیبی که مظنهٔ هم‌زمان ندارد،
  // اصلاً وارد نگاشتِ عکس‌ها نمی‌شود، پس موتور چیزی برای سنجیدن ندارد.
  const dead = tick(apart, noon);
  check('پاهای ناهم‌زمان، ترکیب را از نگاشتِ عکس‌ها بیرون می‌گذارند',
    dead.quote.ok === false && Object.keys(dead.snapshots).length === 0);
  check('و موتورِ هشدار روی نگاشتِ خالی هیچ زنگی نمی‌زند، حتی با شرطِ «فاصله ≥ ۰»',
    evaluateAlerts({ rules: [rule], snapshots: dead.snapshots, prev: {}, nowMs: 1000 }).fired.length === 0);
  check('ولی روی ترکیبِ زنده، همان شرط می‌زند — پس خاموشی از ناتوانی نیست',
    evaluateAlerts({ rules: [rule], snapshots: one.snapshots, prev: {}, nowMs: 1000 }).fired.length === 1);
}

group('۲۳۰-ک. آنچه رابط نشان می‌دهد، همان است که هشدار می‌سنجد');
{
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  // «در رادار، متن وضعیت قیمت زندهٔ اهرم را ۱۱۱٬۰۱۲ نشان داد، ولی ستون
  // قیمت نماد پایه همچنان ۵۵٬۵۴۷ بود. هشدار رادار عدد زنده را می‌گیرد،
  // اما جدول عدد تاریخی را نمایش می‌دهد.» دو عددِ متفاوت برای یک چیز،
  // روی یک صفحه.
  check('ستونِ قیمت نماد پایه هم عددِ زنده می‌گیرد',
    src.includes('row.spot = spot;'));
  check('و خاموش‌شدنِ رصد همان ستون را به عددِ روز سنجش برمی‌گرداند',
    src.includes('spot: row.spot }') && src.includes('row.spot = row.daily.spot;'));

  // «پس از تغییر بازه و ساخت ۷۸ ترکیب، تیک رصد زنده روشن ماند، وضعیت
  // خاموش بود و توضیح همچنان اطلاعات اجرای قبلی با ۱۰۵ ترکیب را نشان
  // می‌داد.» سه چیز باید با هم عوض شوند: تیک، وضعیت، توضیح.
  check('توقفِ رصد، تیک را هم برمی‌دارد نه فقط وضعیت را',
    /function stopLive\(\)[\s\S]{0,2000}box\.checked = false;/.test(src));
  check('و توضیح را با ساختِ فعلی از نو می‌نویسد، نه با ساختِ قبلی',
    /function stopLive\(\)[\s\S]{0,2000}note\.textContent = rows\.length \? livePriorityNote\(\) : '—';/.test(src));
  check('ساختِ تازه، ردیف‌ها را پیش از توقفِ رصد خالی می‌کند',
    /function hideResults\(\) \{[\s\S]{0,400}rows = \[\];\n    stopLive\(\);/.test(src));
  check('و روشن‌شدن، تیک را صریح می‌گذارد تا با وضعیت یکی بماند',
    /\$\('gr-live'\)\.checked = true;[\s\S]{0,120}روشن — هر ۱۰ ثانیه/.test(src));

  // «اولویت ترتیب جدول واقعاً از مرتب‌سازی جدول پیروی نمی‌کند … هر ۲۴
  // شناسهٔ درخواست زنده دقیقاً ثابت ماند.»
  check('اولویتِ «ترتیب جدول» از دیدِ واقعیِ جدول می‌آید',
    src.includes('function priorityScore()') && src.includes('listedOrderScore(table.get())'));
  check('و همان امتیاز به برنامه‌ریزِ سهمیه داده می‌شود',
    src.includes('score: priorityScore(),'));
}

group('۲۳۰-ل. دو منبعِ مظنه و چرخشِ سهمیه، در رابط');
{
  const radar = readSrc('../ui/tabs/spread-radar.mjs');
  const watch = readSrc('../ui/tabs/watchtower.mjs');
  for (const [name, src, prefix] of [['رادار', radar, 'gr'], ['دیده‌بان', watch, 'wt']]) {
    check(`${name}: منبعِ مظنه انتخابی است — معامله یا دفترِ قابل اجرا`,
      src.includes(`id="${prefix}-live-source"`) && src.includes('LIVE_SOURCES.map'));
    check(`${name}: منبعِ دفتر از مسیرِ خودش گرفته می‌شود، با سقفِ بزرگ‌ترش`,
      src.includes("source === 'book' ? '/api/books' : '/api/live-trades'")
      && src.includes("liveSource($('" + prefix + "-live-source').value).id === 'book' ? BOOK_INS_CAP : LIVE_INS_CAP"));
    check(`${name}: چرخشِ سهمیه هست و مکان‌نمایش از خودِ برنامه‌ریز می‌آید`,
      src.includes(`id="${prefix}-live-rotate"`) && src.includes('plan.nextStart'));
    check(`${name}: عددِ زندهٔ پوسیده به عددِ روز سنجش برمی‌گردد`,
      src.includes('LIVE_KEEP_MS') && src.includes('row.liveAt = 0;'));
    check(`${name}: و طولِ دورِ چرخش به کاربر گفته می‌شود`,
      src.includes('یک دورِ کاملِ چرخش'));
  }
  // هشدار روی عددِ نگه‌داشته نمی‌نشیند — فقط روی اندازه‌گیریِ همین تیک.
  check('در رادار، هشدار فقط روی ترکیب‌های همین تیک سنجیده می‌شود',
    radar.includes('runAlerts(applied.fresh_keys)'));
  check('و در دیده‌بان، عکسِ شرط فقط برای ترکیب‌های همین تیک ساخته می‌شود',
    watch.includes('freshKeys.add(row.key);') && watch.includes('snapshots.push(watchSnapshot(row, {')
    && !watch.includes('for (const { row, ua } of built) {\n        const quote = comboLiveQuote'));
}
