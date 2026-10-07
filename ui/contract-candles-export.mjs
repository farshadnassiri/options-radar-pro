// خروجی اکسل تب «کندل قیمت امروز قراردادها» — همهٔ عددهای همان گزینش.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵): «یک خروجی کامل اکسل از این دیتا بساز.»
// چهار برگ: کندل هر قرارداد با همهٔ شاخص‌ها، آمار هر شاخص به تفکیک کال و
// پوت، کندل نمادهای پایه، و راهنما (گزینش، زمان عکس، قاعدهٔ جفت پایه و
// روایت). عدد نامعلوم خالی می‌ماند، نه صفر.

import { sheet, downloadXlsx, tidy } from './xlsx.mjs';
import { CANDLE_POINTS, POINT_LABEL, CANDLE_METRICS, candleStats } from '../core/contract-candles.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { IV_WHY_LABEL } from '../core/live-market.mjs';

const n = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? tidy(Number(v)) : '');
const kindText = (kind) => (kind === 'put' ? 'پوت' : 'کال');
const RANGE_SOURCE = { info: 'هم‌لحظه', infoLag: 'چند ثانیه قبل، گسترده با آخرین', otherSession: 'جلسهٔ دیگر — کنار گذاشته شد', none: 'دریافت نشد' };

export const CANDLE_EXPORT_HEADERS = [
  'قرارداد', 'نماد پایه', 'نوع', 'سررسید', 'روز مانده', 'قیمت اعمال', 'فاصله اعمال از پایه ٪',
  ...CANDLE_POINTS.map((p) => `${POINT_LABEL[p]} (ریال)`), 'پایانی دیروز (ریال)',
  ...CANDLE_POINTS.map((p) => `${POINT_LABEL[p]} ٪ تغییر`),
  ...CANDLE_POINTS.map((p) => `پایهٔ جفتِ ${POINT_LABEL[p]}`),
  ...CANDLE_POINTS.map((p) => `تلاطم ${POINT_LABEL[p]} ٪`), ...CANDLE_POINTS.map((p) => `علت نبود تلاطم ${POINT_LABEL[p]}`),
  ...CANDLE_POINTS.map((p) => `پریمیوم ${POINT_LABEL[p]} ٪ پایه`),
  ...CANDLE_POINTS.map((p) => `ارزش زمانی ${POINT_LABEL[p]} ٪ پایه`),
  'تلاطم مظنه خرید ٪', 'تلاطم میانه ٪', 'تلاطم مظنه فروش ٪', 'تلاطم آخرین (زنجیره) ٪',
  'دامنه روز ٪', 'جای آخرین در بازه ٪', 'دلتا', 'اهرم ساده', 'اهرم مؤثر',
  'سربه‌سر', 'فاصله تا سربه‌سر (ریال)', 'فاصله تا سربه‌سر ٪', 'سربه‌سر وزنی زنجیره', 'فاصله از سربه‌سر وزنی', 'فاصله از سربه‌سر وزنی ٪', 'فاصله مظنه ٪',
  'مظنه خرید', 'مظنه فروش', 'حجم', 'ارزش معامله (ریال)', 'تعداد معامله', 'موقعیت باز', 'تغییر موقعیت باز', 'تغییر موقعیت باز ٪',
  'تغییر پایه ٪', 'منبع کمینه/بیشینه', 'منبع بازهٔ پایه', 'غیرعادی',
];

export function candleExportRow(r, flags = new Map()) {
  return [
    r.name, r.uaName, kindText(r.kind), historyDateLabel(r.endDate), n(r.days), n(r.strike), n(r.moneynessPct),
    ...CANDLE_POINTS.map((p) => n(r[p])), n(r.yday),
    ...CANDLE_POINTS.map((p) => n(r.points.change[p])),
    ...CANDLE_POINTS.map((p) => n(r.ua[p])),
    ...CANDLE_POINTS.map((p) => n(r.points.iv[p])),
    ...CANDLE_POINTS.map((p) => (Number.isFinite(r.points.iv[p]) ? '' : IV_WHY_LABEL[r.ivWhy[p]] || r.ivWhy[p] || '')),
    ...CANDLE_POINTS.map((p) => n(r.points.premium[p])),
    ...CANDLE_POINTS.map((p) => n(r.points.timeValue[p])),
    n(r.ivBidPct), n(r.ivMidPct), n(r.ivAskPct), n(r.ivPct),
    n(r.dayRangePct), n(r.dayPositionPct), n(r.delta), n(r.leverage), n(r.effectiveLeverage),
    n(r.breakeven), n(r.breakevenGap), n(r.breakevenGapPct), n(r.chainBreakeven), n(r.beVsChain), n(r.beVsChainPct), n(r.spreadPct),
    n(r.bid), n(r.ask), n(r.volume), n(r.value), n(r.trades), n(r.oi), n(r.oiChange), n(r.oiChangePct),
    n(r.uaChangePct), RANGE_SOURCE[r.rangeSource] || r.rangeSource, RANGE_SOURCE[r.uaRangeSource] || r.uaRangeSource,
    flags.has(r.ins) ? flags.get(r.ins).map((f) => (f === 'value' ? 'ارزش معامله' : 'دامنه روز')).join('، ') : '',
  ];
}

/** برگ‌های فایل؛ خالص، تا آزمون بی مرورگر بسازدش. */
export function buildCandleSheets({ records = [], uaDays = [], flags = new Map(), filterLines = [], narrative = [], at = '' } = {}) {
  const statRows = [];
  for (const m of CANDLE_METRICS) {
    const stats = candleStats(records, m.key);
    for (const kind of ['all', 'call', 'put']) {
      const s = stats[kind];
      statRows.push([m.label, kind === 'all' ? 'همه' : kindText(kind), s.count, n(s.min), n(s.q1), n(s.median), n(s.q3), n(s.max), s.positive, s.negative]);
    }
  }
  const uaRows = uaDays.map((u) => [u.name, n(u.first), n(u.low), n(u.high), n(u.tradeLast), n(u.close), n(u.yday), n(u.changePct), RANGE_SOURCE[u.rangeSource] || u.rangeSource]);
  const guide = [
    ['زمان عکس', at],
    ['شمار قرارداد', records.length],
    ...filterLines.map((line) => ['گزینش', line]),
    ['کندل', 'کمینه، اولین، آخرین، پایانی و بیشینهٔ امروز. آخرین، پایانی، حجم، ارزش و موقعیت باز از همان عکس زنجیره؛ اولین/کمینه/بیشینه از پاسخ اطلاعات هم‌جلسه.'],
    ['جفت پایه برای تلاطم', 'کال: کمینه↔کمینهٔ پایه، بیشینه↔بیشینهٔ پایه. پوت: کمینه↔بیشینهٔ پایه، بیشینه↔کمینهٔ پایه. اولین↔اولین، آخرین↔قیمت پایهٔ زنجیره، پایانی↔پایانی. زمان واقعی نقطه‌ها معلوم نیست؛ تلاطم کندلی تقریبی است.'],
    ['سربه‌سر وزنی زنجیره', 'میانگین سربه‌سرِ (اعمال ± آخرین) قراردادهای همان نماد، سررسید و سمت، با وزن ارزش معاملات — همان تعریف نگاه باز و استرانگل بازی.'],
    ['غیرعادی', 'دامنهٔ روز یا ارزش معامله بالاتر از چارک سوم + ۱٫۵ × فاصلهٔ میان‌چارکی هم‌گروهان (همان نماد، سررسید و نوع؛ دست‌کم پنج عضو).'],
    ...narrative.map((line) => ['روایت', line]),
  ];
  return [
    sheet('کندل قراردادها', CANDLE_EXPORT_HEADERS, records.map((r) => candleExportRow(r, flags))),
    sheet('آمار شاخص‌ها', ['شاخص', 'نوع', 'شمار', 'کمینه', 'چارک اول', 'میانه', 'چارک سوم', 'بیشینه', 'مثبت', 'منفی'], statRows),
    sheet('نمادهای پایه', ['نماد', 'اولین', 'کمینه', 'بیشینه', 'آخرین', 'پایانی', 'پایانی دیروز', 'تغییر ٪', 'منبع بازه'], uaRows),
    sheet('راهنما', ['مورد', 'شرح'], guide, [140, 900]),
  ];
}

export function downloadCandleWorkbook(args, stamp) {
  return downloadXlsx(`contract-candles-${stamp}`, buildCandleSheets(args));
}
