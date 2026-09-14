// ۲۴۶. یکپارچه‌سازی صفحهٔ رصد زندهٔ بازار
//
// گزارش صاحب پروژه (۱۴۰۵/۰۶/۲۳)، هشت قلم. آن‌ها که قاعدهٔ خالص دارند
// اینجا قفل می‌شوند؛ بقیه با ادعای متنِ منبع.

import { check, near, group, readSrc } from '../harness.mjs';
import {
  contractBreakeven, breakevenGap, breakevenGapPct, activeOptionsBoard,
  marketMapRows, EQUAL_MAP_METRIC, twoSidedChain, chainSideMax, contractAnalytics,
} from '../../core/decision-dashboard.mjs';
import { SCOPE_LEVELS, resolveScope, needsTape, shouldFetchRange } from '../../ui/live-dashboard-scope.mjs';
import { candleDomain, candleGeometry, candlePoints, dayPositionPct } from '../../ui/candle-points.mjs';

group('۲۴۶. رصد زنده — سربه‌سر، دامنهٔ یگانه و دریافت‌های لازم');

// ————— ۱. سربه‌سر و فاصله‌اش —————
const call246 = { kind: 'call', strike: 1000, last: 120, spot: 1050 };
const put246 = { kind: 'put', strike: 1000, last: 120, spot: 950 };
check('سربه‌سر کال پریمیوم را به اعمال اضافه و پوت کم می‌کند',
  contractBreakeven(call246) === 1120 && contractBreakeven(put246) === 880);

// مهم‌ترین ادعای این قلم: دو سمت با یک علامت خوانده نمی‌شوند. هر دو قرارداد
// دقیقاً ۷۰ ریال تا سربه‌سر فاصله دارند — یکی به بالا و یکی به پایین — و
// اگر تفاضل خام نوشته می‌شد، پوت ‎−۷۰‎ درمی‌آمد یعنی «رد شده‌ایم».
check('فاصله تا سربه‌سر در هر دو سمت «چقدر مانده» را می‌گوید، نه تفاضل خام',
  breakevenGap(call246) === 70 && breakevenGap(put246) === 70);
check('فاصله درصدی بر قیمت جاری همان پایه تقسیم می‌شود',
  near(breakevenGapPct(call246), (70 / 1050) * 100, 1e-9)
  && near(breakevenGapPct(put246), (70 / 950) * 100, 1e-9));

// قیمت جاری از سربه‌سر گذشته باشد، علامت منفی می‌شود — همان چیزی که ستون
// رنگ می‌کند.
check('گذشتن از سربه‌سر علامت منفی می‌گیرد',
  breakevenGap({ kind: 'call', strike: 1000, last: 50, spot: 1200 }) === -150
  && breakevenGap({ kind: 'put', strike: 1000, last: 50, spot: 700 }) === -250);

check('بدون پریمیوم یا بدون قیمت پایه هیچ عددی ساخته نمی‌شود',
  Number.isNaN(contractBreakeven({ kind: 'call', strike: 1000, last: 0, spot: 1050 }))
  && Number.isNaN(breakevenGap({ kind: 'call', strike: 1000, last: 120, spot: 0 }))
  && Number.isNaN(breakevenGapPct({ kind: 'put', strike: 0, last: 120, spot: 900 })));

// تابلوی پرمعامله و زنجیره باید یک عدد بگویند — استخراج قاعده نباید عدد
// تابلو را جابه‌جا کرده باشد.
const board246 = activeOptionsBoard([call246, put246], {});
check('تابلوی پرمعامله همان سه عدد زنجیره را می‌دهد',
  board246.rows.every((row) => row.breakeven === contractBreakeven(row)
    && row.breakevenGap === breakevenGap(row) && row.breakevenGapPct === breakevenGapPct(row)));

// ————— ۲ و ۶. یک انتخاب، نه دو —————
check('چهار سطح دامنه همان چهار سطح قبلی‌اند',
  SCOPE_LEVELS.map(([key]) => key).join(',') === 'market,underlying,expiry,contract');

const full246 = { uaIns: '11', endDate: '14051215', contractIns: '991' };
check('سطح درخواستی وقتی انتخاب پشتیبانی‌اش می‌کند دست‌نخورده می‌ماند',
  resolveScope('contract', full246).level === 'contract'
  && resolveScope('market', full246).level === 'market');
check('درخواست سطحی که انتخاب ندارد تا نزدیک‌ترین سطح دارای داده پایین می‌آید',
  resolveScope('contract', { uaIns: '11', endDate: '14051215' }).level === 'expiry'
  && resolveScope('expiry', { uaIns: '11' }).level === 'underlying'
  && resolveScope('underlying', {}).level === 'market');
check('سطح ناشناخته به کل بازار برمی‌گردد و انتخاب را خراب نمی‌کند',
  resolveScope('کهکشان', full246).level === 'market'
  && resolveScope('کهکشان', full246).uaIns === '11');

// ————— ۸. دریافت فقط وقتی لازم است —————
check('ریزمعامله فقط برای نمای ریزمعامله در دامنه قرارداد گرفته می‌شود',
  needsTape('contract', 'tape') === true
  && needsTape('contract', 'table') === false
  && needsTape('expiry', 'tape') === false);

const now246 = 1_000_000;
check('بخش دیده‌نشده هیچ درخواستی نمی‌زند، حتی وقتی هیچ کشی ندارد',
  shouldFetchRange({ visible: false, cached: undefined, now: now246 }) === false);
check('سررسید تازه بی‌درنگ گرفته می‌شود',
  shouldFetchRange({ visible: true, cached: undefined, now: now246 }) === true);
check('کشِ تازه دوباره گرفته نمی‌شود و کشِ کهنه می‌شود',
  shouldFetchRange({ visible: true, cached: { at: now246 - 5_000 }, now: now246 }) === false
  && shouldFetchRange({ visible: true, cached: { at: now246 - 45_000 }, now: now246 }) === true);

// ————— ۴. کندل افقی —————
const candle246 = { low: 80, first: 90, last: 110, close: 105, high: 120, yday: 100 };
check('دامنهٔ محور از کمینه تا بیشینهٔ روز است',
  candleDomain(candle246).lo === 80 && candleDomain(candle246).hi === 120);
// پایانی دیروز بیرونِ بازهٔ امروز (نمادی که با شکاف باز شده) نباید از قاب
// بیفتد، وگرنه خطِ مرجعِ همهٔ درصدها نامرئی می‌شود.
const gap246 = { ...candle246, yday: 140 };
check('پایانی دیروزِ بیرون از بازهٔ امروز، دامنه را باز می‌کند',
  candleDomain(gap246).hi === 140 && Number.isFinite(candleGeometry(gap246).ydayAt));
check('بدون پایانی دیروز، خط مرجع ساخته نمی‌شود',
  Number.isNaN(candleGeometry({ ...candle246, yday: 0 }).ydayAt));
const geo246 = candleGeometry(candle246);
check('بدنه از اولین تا آخرین کشیده می‌شود و جهتش از همان دو قیمت می‌آید',
  near(geo246.bodyLeft, candlePoints(candle246)[1].x, 1e-9) && geo246.rising === true
  && candleGeometry({ ...candle246, first: 110, last: 90 }).rising === false);
check('بدنهٔ روزِ بی‌حرکت هم پهنای دیدنی دارد',
  candleGeometry({ ...candle246, first: 100, last: 100 }).bodyWidth >= 3);
check('جای قیمت در بازهٔ امروز درصدی خوانده می‌شود و روز بی‌بازه عددی نمی‌سازد',
  near(dayPositionPct(candle246, 90), 25, 1e-9)
  && Number.isNaN(dayPositionPct({ low: 100, high: 100 }, 100)));

// ————— ادعاهای متنِ منبع —————
const dash246 = readSrc('../ui/tabs/live-market-dashboard.mjs');
const map246 = readSrc('../ui/live-market-map.mjs');
const table246 = readSrc('../ui/table.mjs');
const css246 = readSrc('../ui/style.css');

check('۱. سربه‌سر و فاصله‌اش ستون آمادهٔ زنجیره‌اند',
  dash246.includes("col('breakeven', 'سربه‌سر'") && dash246.includes("col('breakevenGapPct', 'فاصله تا سربه‌سر ٪'")
  && map246.includes('breakevenGapPct: breakevenGapPct(row)'));
check('۱. ستون علامت‌دار هر دو علامت را رنگ می‌کند، نه فقط منفی را',
  table246.includes("const isPos = c.sign && isNum && Number.isFinite(v) && v > 0;")
  && table246.includes("${isPos ? ' pos' : ''}") && css246.includes('td.pos, dd.pos { color: var(--gain);'));
check('۲ و ۶. هیچ کشوی موازی نماد و سررسید در صفحه نمانده',
  !dash246.includes('id="dd-underlying"') && !dash246.includes('id="dd-expiry"')
  && !dash246.includes('id="dd-contract"') && !dash246.includes('decision-scope-controls')
  && dash246.includes('resolveScope(scopeLevel, marketExplorer.selection())'));
check('۳. نمودارهای نبض بازار از صفحه و از مخزن برداشته شده‌اند',
  !dash246.includes('mountLiveMarketPulse') && !dash246.includes('dd-market-pulse')
  && !dash246.includes('/api/books') && !css246.includes('.pulse-card'));
check('۵ و ۷. صفحه نوار تب دارد و بخش تاشوی «تحلیل‌های تکمیلی» برداشته شده',
  dash246.includes('class="dd-tabbar" role="tablist"') && dash246.includes('role="tab"')
  && !dash246.includes('decision-advanced') && css246.includes('.dd-tabbar {'));
check('۸. تیک خودکار دیگر ریزمعامله و بازهٔ روزانه را بی‌دلیل نمی‌گیرد',
  dash246.includes('if (!needsTape(pick.level, viewOf()?.[2]))')
  && map246.includes('shouldFetchRange({ visible: isVisible(), cached: rangeCache.get(key), now: Date.now() })')
  && dash246.includes('isVisible: explorerVisible'));

// ————————————————————————————————————————————————————————————————
// دور دوم گزارش (۱۴۰۵/۰۶/۲۳): نگاه باز لحظه‌ای، زنجیرهٔ دوطرفه،
// نقشهٔ هم‌اندازه، و هرس نماها.
// ————————————————————————————————————————————————————————————————
group('۲۴۶-ب. زنجیرهٔ دوطرفه، نقشهٔ هم‌اندازه و نگاه باز لحظه‌ای');

// ————— ۳. نقشه‌ای که همه نمادها را هم‌اندازه نشان می‌دهد —————
const uni246 = { underlyings: [
  { ins: '11', name: 'اهرم', value: 9_000_000, changePct: 3 },
  { ins: '22', name: 'کم‌معامله', value: 120, changePct: -1 },
  { ins: '33', name: 'بی‌معامله', value: 0, changePct: 0 },
] };
const weighted246 = marketMapRows(uni246, 'value');
check('نقشهٔ وزنی، نماد کم‌معامله را به نواری باریک تبدیل می‌کند',
  weighted246[0].mapWeight / weighted246[1].mapWeight > 1000);
const equal246 = marketMapRows(uni246, EQUAL_MAP_METRIC);
check('در حالت هم‌اندازه هر سه خانه دقیقاً یک وزن دارند',
  equal246.length === 3 && equal246.every((row) => row.mapWeight === 1));
// رنگ همچنان از تغییر واقعی می‌آید؛ فقط اندازه از داده جدا شده.
check('هم‌اندازه‌بودن، تغییر واقعی نماد را پاک نمی‌کند',
  equal246.map((row) => row.changePct).join(',') === '3,-1,0');
// و هیچ عددی برای سنجه ساخته نمی‌شود — راهنما باید «اندازه یکسان» بگوید.
check('حالت هم‌اندازه عددِ سنجه نمی‌سازد', equal246.every((row) => Number.isNaN(row.metricValue)));

// ————— ۳. زنجیرهٔ دوطرفه —————
const pair246 = [
  { kind: 'call', ins: 'c1', strike: 900, oi: 40 }, { kind: 'put', ins: 'p1', strike: 900, oi: 12 },
  { kind: 'call', ins: 'c2', strike: 1000, oi: 90 }, { kind: 'put', ins: 'p2', strike: 1000, oi: 30 },
  { kind: 'call', ins: 'c3', strike: 1100, oi: 7 },
];
const chain246 = twoSidedChain(pair246, 1050);
check('هر قیمت اعمال یک ردیف است و دو سمتش کنار هم می‌نشینند',
  chain246.rows.length === 3 && chain246.rows[1].call.ins === 'c2' && chain246.rows[1].put.ins === 'p2');
check('سمتی که قرارداد ندارد خالی می‌ماند، نه اینکه ردیف حذف شود',
  chain246.rows[2].call.ins === 'c3' && chain246.rows[2].put === null);
// ═══ «در سود» برای دو سمت یک شرط نیست ═══
// کال وقتی اعمالش زیر قیمت جاری است و پوت وقتی بالای آن. با یک شرط مشترک،
// یکی از دو سمت کاملاً وارونه رنگ می‌شود.
check('در سودبودن از دید هر سمت جدا خوانده می‌شود',
  chain246.rows.map((row) => `${row.callItm ? 'c' : '-'}${row.putItm ? 'p' : '-'}`).join('|') === 'c-|c-|-p');
check('خط قیمت جاری بالای نخستین اعمالِ بالاتر از پایه می‌نشیند', chain246.spotIndex === 2);
check('بی‌قیمتِ پایه، خط کشیده نمی‌شود و «در سود» ادعا نمی‌شود',
  twoSidedChain(pair246, 0).spotIndex === -1 && twoSidedChain(pair246, 0).rows[0].callItm === null);
check('مقیاس نوار موقعیت باز میان دو سمت مشترک است', chainSideMax(chain246.rows, 'oi') === 90);
check('قرارداد بدون قیمت اعمال وارد زنجیره نمی‌شود',
  twoSidedChain([{ kind: 'call', strike: 0 }], 100).rows.length === 0);

// ————— ادعاهای متنِ منبع، دور دوم —————
const mapB246 = readSrc('../ui/live-market-map.mjs');
const openB246 = readSrc('../ui/tabs/open-view.mjs');
const dashB246 = readSrc('../ui/tabs/live-market-dashboard.mjs');

check('۲. پنل «روی ردیف کلیک کن» و کل بخش جزئیات قرارداد برداشته شد',
  !mapB246.includes('برای دیدن اطلاعات کامل یک قرارداد')
  && !mapB246.includes('lmm-contract-detail') && !mapB246.includes('function paintContract('));
check('۳. زنجیرهٔ دوطرفه پیش‌فرض است و جدول تخت گزینهٔ کنار آن',
  mapB246.includes("data-lmm-layout=\"paired\"") && mapB246.includes("data-lmm-layout=\"flat\"")
  && mapB246.includes("localStorage.getItem('options-radar:market-map-chain-layout') || 'paired'"));
check('۳. گزینهٔ «همه هم‌اندازه» در هر دو نقشه هست',
  mapB246.includes("label: 'همه هم‌اندازه'") && mapB246.includes('metric === EQUAL_MAP_METRIC'));
check('۱. نگاه باز پیش‌فرض لحظه‌ای است و گزینهٔ تاریخی کنارش',
  openB246.includes("data-ov-mode=\"live\"") && openB246.includes("data-ov-mode=\"history\"")
  && openB246.includes("localStorage.getItem('options-radar:open-view-mode') || 'live'"));
// مهم‌ترین بخش قلم ۱: مسیر لحظه‌ای نه تاریخ می‌پرسد نه تاریخچهٔ روزانه می‌گیرد.
check('۱. مسیر لحظه‌ای نه دکمه دارد نه تاریخچهٔ روزانه می‌گیرد',
  openB246.includes('async function loadLive()') && openB246.includes('fillExpiriesFromContracts()')
  && !/async function loadLive\(\)[\s\S]*?\n  }/.exec(openB246)?.[0].includes('/api/dailies')
  && openB246.includes("if (isLive() && baseSelect.value) void loadLive();"));
check('۱. کنترل‌های تاریخی در حالت لحظه‌ای پنهان می‌شوند، نه اینکه بی‌کار بمانند',
  openB246.includes("root.querySelectorAll('[data-ov-history]').forEach((node) => { node.hidden = isLive(); })")
  && (openB246.match(/data-ov-history/g) || []).length >= 8);
check('۴. نمای «همان جدول، مرتب بر ستون دیگر» در هیچ فهرستی نمانده',
  !dashB246.includes("'value-bars'") && !dashB246.includes("'volume-bars'")
  && !dashB246.includes("'gainers-bars'") && !dashB246.includes("'iv-bars'")
  && !dashB246.includes("'bar-asc'"));

// ————————————————————————————————————————————————————————————————
// دور سوم گزارش: ستون‌های انتخابی زنجیرهٔ دوطرفه و سنجه‌های تازهٔ قرارداد.
// ————————————————————————————————————————————————————————————————
group('۲۴۶-پ. سنجه‌های قرارداد و انتخابگر ستون زنجیره');

const P246 = { rFree: 0.3, divYield: 0, yearDays: 365 };
const itm246 = { kind: 'call', strike: 2000, last: 180, spot: 2100, days: 30, ivPct: 45, oi: 500, volume: 250 };
const a246 = contractAnalytics(itm246, P246);

check('یونانی‌ها از همان تلاطم ردیف ساخته می‌شوند و در دامنهٔ معتبرند',
  a246.delta > 0 && a246.delta < 1 && a246.gamma > 0 && a246.vega > 0 && a246.theta < 0);
// دلتای پوت هم‌اعمال باید منفی باشد — علامت، خودش یک ادعاست.
check('دلتای پوت منفی است و دلتای کال مثبت',
  contractAnalytics({ ...itm246, kind: 'put' }, P246).delta < 0);

// ═══ اهرم ساده و اهرم مؤثر یکی نیستند ═══
// اهرم ساده می‌گوید یک قرارداد چند برابر خودِ سهم را کنترل می‌کند؛ مؤثر
// همان را در دلتا می‌زند، یعنی «یک درصد حرکت پایه چند درصد روی پریمیوم».
check('اهرم ساده نسبت قیمت پایه به پریمیوم است',
  near(a246.leverage, 2100 / 180, 1e-9));
check('اهرم مؤثر همان اهرم ضربدر قدرمطلق دلتا است',
  near(a246.effectiveLeverage, a246.leverage * Math.abs(a246.delta), 1e-9)
  && a246.effectiveLeverage < a246.leverage);

// ارزش ذاتی ۱۰۰، پریمیوم ۱۸۰ ← اگر پایه تکان نخورد، ۸۰ از ۱۸۰ می‌سوزد.
check('بازده سناریوی بی‌حرکت از ارزش ذاتی همان سمت می‌آید',
  near(a246.staticReturnPct, ((100 - 180) / 180) * 100, 1e-9));
// و اختیار بی‌ارزشِ ذاتی، دقیقاً ‎−۱۰۰‎ — نه عددی نزدیک به آن.
check('اختیار خارج از سود در سناریوی بی‌حرکت دقیقاً همه‌چیز را می‌بازد',
  contractAnalytics({ ...itm246, strike: 2500 }, P246).staticReturnPct === -100);

// فرسایش عددیِ ساده باید با تتای مدل هم‌جهت و هم‌مرتبه باشد — اگر یکی از
// این دو روزی خراب شود، این ادعا می‌گیردش.
check('فرسایش روزانه با تتای مدل هم‌مرتبه است',
  near(a246.timeValuePerDay, 80 / 30, 1e-9) && Math.abs(a246.timeValuePerDay + a246.theta) < 1);
check('گردش به موقعیت باز، حجم امروز تقسیم بر تعهد انباشته است',
  near(a246.turnoverRatio, 0.5, 1e-9));

// ═══ ورودی که نیست، عدد نمی‌سازد ═══
const blank246 = contractAnalytics({ kind: 'call', strike: 2000, last: 0, spot: 0, days: 0, ivPct: NaN }, P246);
check('بی‌پریمیوم و بی‌تلاطم، هیچ ستونی عدد نمی‌سازد',
  ['delta', 'gamma', 'leverage', 'effectiveLeverage', 'timeValuePerDay', 'staticReturnPct', 'turnoverRatio']
    .every((key) => Number.isNaN(blank246[key])));
check('ردیف بدون سمت (گروه یا سررسید) یونانی نمی‌گیرد',
  Number.isNaN(contractAnalytics({ strike: 2000, last: 180, spot: 2100, days: 30, ivPct: 45 }, P246).delta));

// ————— انتخابگر ستون —————
const mapC246 = readSrc('../ui/live-market-map.mjs');
const dashC246 = readSrc('../ui/tabs/live-market-dashboard.mjs');

check('زنجیرهٔ دوطرفه از همان کاتالوگ ستونِ جدول تخت می‌خواند، نه فهرست جدا',
  mapC246.includes('const PAIRED_CATALOG = contractColumns.filter(')
  && !mapC246.includes('const PAIRED_COLS = ['));
check('ستون‌هایی که در چیدمان قرینه معنی ندارند کنار گذاشته شده‌اند',
  mapC246.includes("const PAIRED_SKIP = new Set(['title', 'kindLabel', 'strike', 'expiryText', 'uaName'])"));
check('انتخاب ستون ذخیره می‌شود و «همه» و «نمای آماده» دارد',
  mapC246.includes("localStorage.setItem('options-radar:market-map-paired-cols'")
  && mapC246.includes("data-paired-act=\"all\"") && mapC246.includes("data-paired-act=\"base\""));
// ترتیب نمایش از کاتالوگ می‌آید نه از ترتیب تیک‌زدن، وگرنه دو بار
// عوض‌کردن یک ستون کل جدول را جابه‌جا می‌کند.
check('ترتیب ستون‌ها از کاتالوگ می‌آید، نه از ترتیب تیک‌زدن',
  mapC246.includes('const pairedCols = () => PAIRED_CATALOG.filter((item) => pairedKeys.includes(item.key))'));
check('زنجیره بدون ستون ممکن نیست',
  mapC246.includes('else if (pairedKeys.length === 1) { box.checked = true; return; }'));

const NEW_COLS = ['delta', 'gamma', 'theta', 'vega', 'rho', 'probItmPct', 'leverage', 'effectiveLeverage',
  'timeValuePerDay', 'timeDecayPctPerDay', 'timeValueAnnualPct', 'staticReturnPct', 'premiumPctStrike', 'turnoverRatio'];
check('هر چهارده سنجهٔ تازه ستون خودش را در کاتالوگ دارد',
  NEW_COLS.every((key) => dashC246.includes(`col('${key}'`)),
  NEW_COLS.filter((key) => !dashC246.includes(`col('${key}'`)).join('، '));
check('گاما با قالب «کوچک» نوشته می‌شود تا در ستون صفر نشود',
  dashC246.includes("col('gamma', 'گاما', 'small'"));
check('یونانی‌ها با فرض‌های خودِ کاربر ساخته می‌شوند، نه عدد سرخود',
  dashC246.includes('const greekParams = () => ({')
  && dashC246.includes('yearDays: Number(state.settings.dayCountYear) > 0'));
