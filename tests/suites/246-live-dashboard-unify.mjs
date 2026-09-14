// ۲۴۶. یکپارچه‌سازی صفحهٔ رصد زندهٔ بازار
//
// گزارش صاحب پروژه (۱۴۰۵/۰۶/۲۳)، هشت قلم. آن‌ها که قاعدهٔ خالص دارند
// اینجا قفل می‌شوند؛ بقیه با ادعای متنِ منبع.

import { check, near, group, readSrc } from '../harness.mjs';
import { contractBreakeven, breakevenGap, breakevenGapPct, activeOptionsBoard } from '../../core/decision-dashboard.mjs';
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
