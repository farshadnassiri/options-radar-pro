// خروجی جامع بک‌تست سریع — همهٔ آنچه گام سوم ساخته، در یک دفترکار.
//
// خواستهٔ صریح: «هیچ اطلاعاتی جا نیفتد». پس قاعده اینجا برعکس بقیهٔ برنامه
// است: در رابط، ستونِ کم‌اثر حذف می‌شود تا جدول خوانا بماند؛ در این فایل هر
// چیزی که محاسبه شده می‌آید، حتی اگر کاربر امروز به آن نگاه نکند. فایل برای
// خواندن روی صفحه نیست، برای کار کردن روی آن است.
//
// یک برگ به ازای هر واحد تحلیلی، نه یک برگ بلند با ردیف‌های جداکننده: برگ
// جداگانه فیلتر و نمودار و PivotTable می‌گیرد، بخشِ داخل یک برگ نمی‌گیرد.
//
// قاعدهٔ ۲-۴ تا داخل فایل ادامه دارد. خانهٔ خالی یعنی «مشاهده نشد»؛ هیچ‌جا
// صفر جای نبود نمی‌نشیند، چون کسی که ستون را در اکسل جمع می‌زند نباید
// صفرهایی را بشمارد که هرگز وجود نداشته‌اند.

import { historyDateLabel, daysBetween } from '../core/history.mjs';
import { legDaysToExpiry, ivSummary } from '../core/leg-iv.mjs';
import { stamp } from './export.mjs';
import { sheet, sheetParts, workbook, downloadWorkbook } from './workbook.mjs';

const date = (value) => (Number(value) > 0 ? historyDateLabel(value) : '');
const clock = (second) => {
  const s = Number(second);
  if (!Number.isFinite(s)) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const sideFa = (side) => (side === 'sell' ? 'فروش' : 'خرید');
const kindFa = (kind) => ({ call: 'کال', put: 'پوت', underlying: 'سهم پایه' }[kind] || kind || '');

/** ستون‌های تکرارشوندهٔ یک پا، هر جا که پا در ردیف باز می‌شود. */
const LEG_HEAD = ['شماره پا', 'نام پا', 'نوع', 'جهت', 'نسبت', 'اندازه قرارداد', 'قیمت اعمال', 'سررسید'];
const legHead = (leg, index) => [
  index + 1, leg?.name || '', kindFa(leg?.kind), sideFa(leg?.side),
  Number(leg?.ratio) || 1, Number(leg?.size) || NaN,
  Number(leg?.strike) || NaN, date(leg?.expiry),
];

const GREEK_HEAD = ['دلتا', 'گاما', 'وگا', 'تتا', 'رو'];
const greekValues = (g) => [g?.delta, g?.gamma, g?.vega, g?.theta, g?.rho]
  .map((v) => (Number.isFinite(v) ? v : NaN));

/**
 * برگ سرشناسه: این فایل از چه ساخته شده.
 *
 * بدون این برگ، فایل شش ماه بعد قابل بازخوانی نیست: معلوم نیست با چه مبنای
 * قیمتی، چه تعداد واحد و چه نرخ بدون ریسکی ساخته شده، و عددهایش با فایل
 * دیگری از همان استراتژی نمی‌خواند بی‌آنکه کسی بفهمد چرا.
 */
function headerSheet({ ua, strategyName, comboName, replay, params, timeframeSeconds, intradayDate, generatedAt }) {
  const rows = [
    ['نماد پایه', ua?.name || ''],
    ['کد نماد پایه', String(ua?.ins || '')],
    ['استراتژی', strategyName || ''],
    ['ترکیب قراردادها', comboName || ''],
    ['تاریخ ورود', date(replay?.startDate)],
    ['تاریخ خروج', date(replay?.endDate)],
    ['طول بازه (روز تقویمی)', daysBetween(replay?.startDate, replay?.endDate)],
    ['سررسید نزدیک‌ترین پا', date(replay?.expiry)],
    ['مبنای قیمت ورود', replay?.entryBasis || ''],
    ['مبنای قیمت خروج', replay?.exitBasis || ''],
    ['تعداد پا', replay?.priced?.length || 0],
    ['تایم‌فریم گام سوم (ثانیه)', Number(timeframeSeconds) || NaN],
    ['روز بازپخش درون‌روزی', date(intradayDate)],
    ['سرمایه درگیر', replay?.entry?.capital?.value],
    ['مبنای سرمایه', replay?.entry?.capital?.label || replay?.entry?.capital?.mode || ''],
    ['سرمایه تقریبی است (چند سررسید)', replay?.approximateCapital ? 'بله' : 'خیر'],
    ['جریان نقدی ناخالص ورود', replay?.entry?.gross],
    ['کارمزد ورود', replay?.entry?.fee],
    ['جریان نقدی خالص ورود', replay?.entry?.netCash],
    ['مبلغ پرداختی ورود', replay?.entry?.cashPaid],
    ['مبلغ دریافتی ورود', replay?.entry?.cashReceived],
    ['وجه تضمین خالص ورود', replay?.entry?.margin?.marginNet],
    ['بیشترین زیان نظری', replay?.entry?.payoff?.maxLoss],
    ['بیشترین سود نظری', replay?.entry?.payoff?.maxProfit],
    ['— پارامترهای تلاطم ضمنی —', ''],
    ['نرخ بدون ریسک سالانه', params?.rFree],
    ['بازده نقدی سالانه پایه', params?.divYield],
    ['کف جست‌وجوی تلاطم', params?.ivLo],
    ['سقف جست‌وجوی تلاطم', params?.ivHi],
    ['روز سال — مخرج زمان', params?.yearDays],
    ['زمان ساخت فایل', generatedAt || ''],
  ];
  return sheet('سرشناسه', ['شاخص', 'مقدار'], rows, [260, 260]);
}

/** برگ راهنما: هر عددی که ممکن است بد فهمیده شود، اینجا تعریف دارد. */
function guideSheet() {
  const rows = [
    ['خانهٔ خالی', 'یعنی مشاهده نشد. صفر نیست. ستونی که خانهٔ خالی دارد را با آگاهی از همین جمع بزن.'],
    ['تلاطم ضمنی هر پا', 'از قیمت مشاهده‌شدهٔ خودِ همان پا، قیمت پایهٔ همان لحظه و روز مانده تا سررسید همان پا. پای سهم پایه تلاطم ضمنی ندارد.'],
    ['روز مانده تا سررسید', 'برای هر پا جدا حساب می‌شود. در استراتژی تقویمی دو پا دو عدد دارند و یکی‌کردنشان عددِ غلطِ قابل‌قبول می‌سازد.'],
    ['یونانی‌ها', 'هر پا با تلاطم ضمنی خودش. یونانی کل موقعیت جمع علامت‌دار و وزن‌دار پاهاست. ستون «ناقص» یعنی دست‌کم یک پا تلاطم نداشته و جمع کامل نیست.'],
    ['ثانیهٔ مشاهده‌شده', 'واحد «چه مدت در سود» ثانیهٔ مشاهده است نه ثانیهٔ تقویمی: بین دو معامله هیچ مشاهده‌ای نداریم و شمردنش ادعای چیزی است که ندیده‌ایم.'],
    ['سطل تایم‌فریم', 'فقط از ثانیه‌هایی ساخته می‌شود که همهٔ پاها در آن قیمت مشاهده‌شده داشته‌اند. سطل بی‌معامله اصلاً ساخته نشده است.'],
    ['سن مشاهده', 'فاصلهٔ آخرین معاملهٔ آن پا تا لحظهٔ ردیف. سن بالا یعنی قیمت آن پا کهنه است، هرچند ردیف تازه باشد.'],
    ['ماتریس ورود × خروج', 'آفست بین دو لحظه از روز، روی همهٔ روزهای بازه. ارزش‌گذاری مشاهده‌ای است و تضمین اجرای هم‌زمان نیست.'],
    ['محدودیت اجرا', 'قیمت تاریخی و آخرین معامله، مظنهٔ قابل اجرای هم‌زمان نیستند. این گزارش ابزار تحلیل است، نه تضمین اجرا و نه توصیهٔ معامله.'],
  ];
  return sheet('راهنما', ['موضوع', 'توضیح'], rows, [190, 700]);
}

/** برگ پاهای ورود: هر پا با قیمت، وزن و جریان نقدی خودش. */
function entryLegsSheet(replay) {
  const rows = (replay?.priced || []).map((leg, index) => [
    ...legHead(leg, index), String(leg.ins || ''),
    leg.price, legDaysToExpiry(leg, replay?.startDate),
    leg.entryVolume, leg.entryTrades, leg.entryValue,
    leg.entryValueEstimated ? 'برآوردی' : 'رسمی',
  ]);
  return sheet('پاهای ورود',
    [...LEG_HEAD, 'کد قرارداد', 'قیمت ورود', 'روز تا سررسید در ورود', 'حجم روز ورود', 'تعداد معامله', 'ارزش معامله', 'مبنای ارزش'],
    rows);
}

/** برگ مسیر روزانه: هر روز یک ردیف، با یونانی و تلاطم کل موقعیت. */
function dailySheet(replay) {
  const rows = (replay?.rows || []).map((r) => [
    date(r.date), r.dayName, r.holdingDays, r.daysToExpiry,
    r.status === 'ok' ? 'معتبر' : r.status === 'liquidity' ? 'حذف نقدشوندگی' : 'فاقد داده',
    r.baseClose, r.baseDailyPct, r.baseCumulativePct, r.baseVolume, r.baseValue,
    r.grossPnl, r.entryFee, r.exitFee, r.totalFees, r.netPnl, r.pnlDelta, r.returnPct, r.drawdown,
    r.margin, r.marginNet, r.conditionalMargin,
    ...greekValues(r.greeks), r.greeks?.incomplete ? 'بله' : 'خیر',
    r.meanIvPct,
  ]);
  return sheetParts('مسیر روزانه', [
    'تاریخ', 'روز هفته', 'روز نگهداری', 'روز تا سررسید', 'وضعیت',
    'پایانی پایه', 'تغییر روز ٪', 'تغییر از ورود ٪', 'حجم پایه', 'ارزش پایه',
    'سود ناخالص', 'کارمزد ورود', 'کارمزد خروج', 'کل کارمزد', 'سود خالص', 'تغییر روز', 'بازده ٪', 'افت از قله',
    'وجه تضمین', 'وجه تضمین خالص', 'وجه تضمین شرطی',
    ...GREEK_HEAD, 'یونانی ناقص', 'میانگین تلاطم پاها ٪',
  ], rows);
}

/** برگ روز × پا: ریزترین تفکیک مسیر روزانه، با تلاطم و یونانی هر پا. */
function dailyLegSheet(replay) {
  const rows = [];
  for (const r of replay?.rows || []) {
    (r.perLeg || []).forEach((leg, index) => {
      const priced = replay.priced?.[index];
      rows.push([
        date(r.date), ...legHead(priced, index),
        legDaysToExpiry(priced, r.date),
        leg.entryPrice, leg.exitPrice, leg.grossPnl, leg.entryFee, leg.exitFee, leg.netPnl, leg.pnlDelta,
        leg.ivPct, ...greekValues(leg.greeks),
        leg.volume, leg.trades, leg.value, leg.valueEstimated ? 'برآوردی' : 'رسمی',
      ]);
    });
  }
  return sheetParts('روز × پا', [
    'تاریخ', ...LEG_HEAD, 'روز تا سررسید',
    'قیمت ورود', 'قیمت روز', 'اثر ناخالص', 'کارمزد ورود', 'کارمزد خروج', 'اثر خالص', 'تغییر نسبت به روز قبل',
    'تلاطم ضمنی ٪', ...GREEK_HEAD,
    'حجم', 'تعداد معامله', 'ارزش معامله', 'مبنای ارزش',
  ], rows);
}

/** برگ سطل‌های تایم‌فریم — همان چیزی که گام سوم روی صفحه نشان می‌دهد. */
function bucketSheet(buckets) {
  const rows = (buckets || []).map((b) => [
    date(b.date), clock(b.startSecond), clock(b.endSecond), b.observations, b.seconds,
    b.openPnl, b.closePnl, b.highPnl, b.lowPnl, b.changePnl, b.stepPnl,
    b.openReturnPct, b.returnPct, b.basePrice, b.basePct,
    b.volume, b.trades, b.baseVolume, b.freshPct, b.maxAgeSec, b.meanIvPct,
  ]);
  return sheetParts('سطل تایم‌فریم', [
    'تاریخ', 'از', 'تا', 'مشاهده', 'ثانیه',
    'باز', 'بسته', 'بیشینه', 'کمینه', 'تغییر سطل', 'تغییر پیاپی',
    'بازده باز ٪', 'بازده بسته ٪', 'قیمت پایه', 'تغییر پایه ٪',
    'حجم پاها', 'تعداد معامله', 'حجم پایه', 'سهم مشاهدهٔ تازه ٪', 'بیشترین سن ثانیه', 'میانگین تلاطم پاها ٪',
  ], rows);
}

/** برگ سطل × پا. */
function bucketLegSheet(buckets, priced) {
  const rows = [];
  for (const b of buckets || []) {
    (b.perLeg || []).forEach((leg, index) => {
      rows.push([
        date(b.date), clock(b.startSecond), ...legHead(priced?.[index], index),
        legDaysToExpiry(priced?.[index], b.date),
        leg.price, leg.priceChange, leg.netPnl, leg.changePnl, leg.ivPct,
        leg.cumulativeVolume, leg.tradeCount, leg.ageSec,
      ]);
    });
  }
  return sheetParts('سطل × پا', [
    'تاریخ', 'از', ...LEG_HEAD, 'روز تا سررسید',
    'قیمت', 'تغییر قیمت در سطل', 'اثر خالص', 'تغییر اثر در سطل', 'تلاطم ضمنی ٪',
    'حجم تجمعی', 'تعداد معامله', 'سن ثانیه',
  ], rows);
}

/** برگ «چه مدت در سود، چه مدت در زیان» — به تفکیک روز و در کل. */
function holdingSheet(holding) {
  const rows = (holding?.days || []).map((d) => [
    date(d.date), d.points, clock(d.firstSecond), clock(d.lastSecond),
    d.observedSeconds, d.positiveSeconds, d.negativeSeconds, d.flatSeconds,
    d.positivePct, d.openPnl, d.closePnl, d.changePnl, d.bestPnl, d.worstPnl,
    d.closeReturnPct, d.basePct, d.volume,
  ]);
  // ردیف جمع در پایین همان برگ، نه در برگی جدا: کسی که روزها را می‌بیند
  // همان‌جا باید کل را هم ببیند تا مجبور نشود خودش جمع بزند و اشتباه کند.
  if (holding?.days?.length) {
    rows.push(['— کل بازه —', holding.days.reduce((sum, d) => sum + d.points, 0), '', '',
      holding.observedSeconds, holding.positiveSeconds, holding.negativeSeconds, holding.flatSeconds,
      holding.positivePct, NaN, NaN, NaN,
      Math.max(...holding.days.map((d) => d.bestPnl)), Math.min(...holding.days.map((d) => d.worstPnl)),
      NaN, NaN, holding.days.reduce((sum, d) => sum + d.volume, 0)]);
    rows.push(['— درصد در زیان —', holding.negativePct, '', '', '', '', '', '', '', NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN]);
    rows.push(['— روز مثبت / منفی —', holding.positiveDays, holding.negativeDays, holding.dayCount,
      '', '', '', '', '', NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN]);
  }
  return sheet('مدت در سود و زیان', [
    'تاریخ', 'نقطه', 'اولین مشاهده', 'آخرین مشاهده',
    'ثانیه مشاهده‌شده', 'ثانیه در سود', 'ثانیه در زیان', 'ثانیه بی‌تغییر',
    'درصد در سود', 'باز', 'بسته', 'تغییر روز', 'بیشینه', 'کمینه',
    'بازده پایان ٪', 'تغییر پایه ٪', 'حجم',
  ], rows);
}

/** برگ «رفتار هر بازه از روز» — تجمیع همهٔ روزها روی ساعت. */
function timeOfDaySheet(clockRows) {
  const rows = (clockRows || []).map((r) => [
    clock(r.startSecond), clock(r.endSecond), r.days, r.upDays, r.downDays, r.flatDays,
    r.meanChange, r.medianChange, r.upPct, r.consistencyPct, r.meanVolume,
  ]);
  return sheet('رفتار بازه‌های روز', [
    'از', 'تا', 'روز', 'صعودی', 'نزولی', 'بی‌تغییر',
    'میانگین تغییر', 'میانه تغییر', 'درصد صعودی', 'یکنواختی جهت ٪', 'میانگین حجم',
  ], rows);
}

/**
 * برگ ماتریس ورود × خروج، به شکل بلند تا در اکسل Pivot بخورد.
 *
 * شکل بلند (هر جفت یک ردیف) عمدی است: ماتریس مربعی در اکسل نه فیلتر
 * می‌شود نه مرتب، و کاربر برای «بهترین ده جفت» باید چشمی بگردد.
 */
function entryExitSheet(matrix) {
  const rows = (matrix?.cells || []).map((c) => [
    clock(c.entrySecond), clock(c.exitSecond), c.samples,
    c.meanPnl, c.medianPnl, c.winPct, c.bestPnl, c.worstPnl,
  ]);
  return sheetParts('ورود × خروج', [
    'ثانیه ورود', 'ثانیه خروج', 'نمونه',
    'میانگین آفست', 'میانه آفست', 'درصد سودده', 'بهترین', 'بدترین',
  ], rows);
}

/** خلاصهٔ هر سرِ ماتریس: بهترین ساعت ورود و بهترین ساعت خروج. */
function entryExitEdgeSheet(matrix) {
  const rows = [
    ...(matrix?.entries || []).map((e) => ['ورود', clock(e.second), e.pairs, e.samples, e.medianPnl, e.meanPnl, e.winPct]),
    ...(matrix?.exits || []).map((e) => ['خروج', clock(e.second), e.pairs, e.samples, e.medianPnl, e.meanPnl, e.winPct]),
  ];
  return sheet('بهترین ساعت', ['سر', 'ساعت', 'جفت', 'نمونه', 'میانه آفست', 'میانگین آفست', 'درصد سودده'], rows);
}

/** برگ نوار درون‌روزی: همهٔ نقاط روز بازپخش‌شده، بدون نمونه‌گیری. */
function intradaySheet(points) {
  const rows = (points || []).map((r) => [
    clock(r.second), r.netPnl, r.returnPct, r.basePrice, r.basePct,
    r.eventVolume, r.eventTrades, r.cumulativeVolume,
    r.baseSecondVolume, r.baseCumulativeVolume, r.baseAgeSec,
    r.activeLegs, r.maxAgeSec, r.allFresh ? 'بله' : 'خیر', r.meanIvPct,
  ]);
  return sheetParts('نوار درون‌روز', [
    'زمان', 'آفست خالص', 'بازده ٪', 'قیمت پایه', 'تغییر پایه ٪',
    'حجم ثانیه', 'معاملهٔ ثانیه', 'حجم تجمعی',
    'حجم ثانیهٔ پایه', 'حجم تجمعی پایه', 'سن پایه',
    'پای فعال', 'بیشترین سن', 'همه تازه', 'میانگین تلاطم پاها ٪',
  ], rows);
}

/** برگ نوار درون‌روز × پا. */
function intradayLegSheet(points, priced) {
  const rows = [];
  for (const r of points || []) {
    (r.perLeg || []).forEach((leg, index) => {
      rows.push([
        clock(r.second), ...legHead(priced?.[index], index),
        leg.exitPrice, leg.pricePct, leg.netPnl, leg.grossPnl, leg.entryFee, leg.exitFee,
        leg.ivPct, leg.secondVolume, leg.cumulativeVolume, leg.tradeCount,
        clock(leg.lastTradeSecond), leg.ageSec, leg.observedNow ? 'بله' : 'خیر',
      ]);
    });
  }
  return sheetParts('درون‌روز × پا', [
    'زمان', ...LEG_HEAD,
    'قیمت', 'تغییر از اولین معامله ٪', 'اثر خالص', 'اثر ناخالص', 'کارمزد ورود', 'کارمزد خروج',
    'تلاطم ضمنی ٪', 'حجم ثانیه', 'حجم تجمعی', 'تعداد معامله',
    'آخرین معامله', 'سن ثانیه', 'در همین ثانیه معامله شد',
  ], rows);
}

/**
 * برگ خلاصهٔ تلاطم: هر پا در هر تایم‌فریم، یک ردیف.
 *
 * همان جدولی که روی صفحه است، ولی اینجا با شمار مشاهده و شمار نقاط بی‌تلاطم
 * کنار هم — تا معلوم باشد میانگین روی چند مشاهده ایستاده است.
 */
function ivSummarySheet({ replay, intraday, buckets }) {
  const frames = [
    ['روزانه', (replay?.rows || []).filter((r) => r.status !== 'missing')],
    ['درون‌روز', intraday || []],
    ['سطل تایم‌فریم', buckets || []],
  ];
  const rows = [];
  (replay?.priced || []).forEach((leg, index) => {
    if (leg.kind !== 'call' && leg.kind !== 'put') return;
    for (const [name, list] of frames) {
      if (!list.length) continue;
      const s = ivSummary(list.map((point) => point.legIvPct?.[index]));
      rows.push([...legHead(leg, index), name, s.samples, s.gaps, s.first, s.last, s.changePp, s.min, s.max, s.mean]);
    }
  });
  return sheet('خلاصه تلاطم', [
    ...LEG_HEAD, 'تایم‌فریم', 'مشاهده', 'بی‌تلاطم', 'ابتدا ٪', 'انتها ٪', 'تغییر (واحد درصد)', 'کمینه ٪', 'بیشینه ٪', 'میانگین ٪',
  ], rows);
}

/** برگ شاخص‌های کلی بازه. */
function summarySheet(replay) {
  const s = replay?.summary || {};
  const rows = [
    ['روز معتبر', s.validDays], ['روز فاقد داده', s.missingDays], ['روز حذف‌شده نقدشوندگی', s.liquidityDays],
    ['روز مثبت', s.positiveDays], ['روز منفی', s.negativeDays], ['روز بی‌تغییر', s.flatDays],
    ['درصد روز مثبت', s.positivePct], ['درصد روز منفی', s.negativePct], ['درصد روز بی‌تغییر', s.flatPct],
    ['میانگین سود روزانه', s.meanPnl], ['میانه سود روزانه', s.medianPnl], ['انحراف معیار سود', s.pnlStdDev],
    ['میانگین بازده ٪', s.meanReturn], ['میانه بازده ٪', s.medianReturn], ['انحراف معیار بازده', s.returnStdDev],
    ['میانگین روز سودده', s.avgGain], ['میانگین روز زیان‌ده', s.avgLoss],
    ['نسبت سود به زیان', Number.isFinite(s.profitFactor) ? s.profitFactor : NaN],
    ['بیشترین افت از قله', s.maxDrawdown],
    ['بلندترین رشتهٔ روز مثبت', s.longestPositive], ['بلندترین رشتهٔ روز منفی', s.longestNegative],
    ['همبستگی بازده با پایه', s.returnBaseCorrelation],
    ['بهترین روز', s.best ? date(s.best.date) : ''], ['سود بهترین روز', s.best?.netPnl],
    ['بدترین روز', s.worst ? date(s.worst.date) : ''], ['سود بدترین روز', s.worst?.netPnl],
    ['اولین روز سوددهی', s.firstProfit ? date(s.firstProfit.date) : 'رخ نداد'],
    ['روز تا اولین سود', s.firstProfit?.holdingDays],
    ['نتیجهٔ روز پایانی', s.last?.netPnl], ['بازده روز پایانی ٪', s.last?.returnPct],
    ['سرمایه درگیر', s.capital], ['مبنای سرمایه', s.capitalLabel || ''],
    ['وجه تضمین', s.margin], ['وجه تضمین خالص', s.marginNet], ['وجه تضمین شرطی', s.conditionalMargin],
  ];
  return sheet('شاخص کل بازه', ['شاخص', 'مقدار'], rows, [260, 200]);
}

/**
 * دفترکار کامل.
 *
 * هر برگ فقط وقتی ساخته می‌شود که داده‌اش وجود داشته باشد. برگ خالی در
 * اکسل بدتر از نبودِ برگ است: کاربر بازش می‌کند، چیزی نمی‌بیند، و نمی‌داند
 * داده نبوده یا خروجی خراب شده.
 */
export function buildBacktestWorkbook(ctx = {}) {
  const { replay, intraday = [], buckets = [], holding, timeOfDay, entryExit } = ctx;
  const sheets = [
    headerSheet(ctx),
    guideSheet(),
    summarySheet(replay),
    entryLegsSheet(replay),
    ...dailySheet(replay),
    ...dailyLegSheet(replay),
  ];
  if (buckets.length) sheets.push(...bucketSheet(buckets), ...bucketLegSheet(buckets, replay?.priced));
  if (holding?.days?.length) sheets.push(holdingSheet(holding));
  if (timeOfDay?.length) sheets.push(timeOfDaySheet(timeOfDay));
  if (entryExit?.cells?.length) sheets.push(...entryExitSheet(entryExit), entryExitEdgeSheet(entryExit));
  if (intraday.length) sheets.push(...intradaySheet(intraday), ...intradayLegSheet(intraday, replay?.priced));
  sheets.push(ivSummarySheet({ replay, intraday, buckets }));
  return workbook(sheets);
}

export function downloadBacktestExcel(ctx = {}) {
  const base = (ctx.ua?.name || 'backtest').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 24);
  downloadWorkbook(`backtest-${base}-${stamp()}`, buildBacktestWorkbook(ctx));
}
