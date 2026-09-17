// دفترکار تب «خروجی دیتا»: یک برگ برای هر ابزار، بدون ادغام ریزمعامله‌ها.

import {
  BLANK_VERDICT_LABEL, DATA_EXPORT_KIND_LABEL, blankAuditSummary, dataExportCoverageRows,
  dataExportOutcome, dataExportSessionRows, dataExportTradeRows,
} from '../core/data-export.mjs';
import { tradeTimeLabel } from '../core/backtest.mjs';
import { sheet } from './xlsx.mjs';

const dateText = (value) => String(Math.trunc(Number(value) || 0));
const cancelText = (row) => row.canceledKnown ? (row.canceled ? 'باطل' : 'فعال') : 'نامعلوم';

export const DATA_EXPORT_HEADERS = [
  'تاریخ میلادی', 'ساعت', 'شماره معامله', 'قیمت (ریال)', 'حجم', 'ارزش خام (ریال)',
  'اندازه قرارداد', 'ارزش با اندازه قرارداد (ریال)', 'وضعیت ابطال', 'منبع',
];

export function buildDataExportSheets({
  instruments = [], pairs = [], items = {}, range = {}, complete = false, note = '',
  outcome = null, audit = [],
} = {}) {
  const coverage = dataExportCoverageRows(instruments, pairs, items);
  const failed = coverage.filter((row) => row.status === 'خطا' || row.status === 'درخواست نرفت').length;
  const empty = coverage.filter((row) => row.status === 'بدون معامله').length;
  const result = outcome || dataExportOutcome(pairs, items);
  // ═══ چرا «صفر ریزمعامله» بالای برگ راهنما می‌نشیند ═══
  //
  // فایلِ گزارش‌شدهٔ صاحب پروژه ۸۳ برگ داشت و هیچ داده‌ای. برگ راهنما
  // شمارِ شیت و جفت را می‌گفت ولی هیچ‌جا نمی‌گفت «هیچ‌کدام داده نیاورد» —
  // و کسی که فایل را بعداً باز کند، باید همین را اول ببیند.
  const blanks = blankAuditSummary(audit);
  const verdict = result.blank
    ? `هیچ ریزمعامله‌ای دریافت نشد${result.topReason ? ` — علت غالب: ${result.topReason[0]}` : ''}`
    : `${result.trades} ریزمعامله از ${result.ok} ابزار/روز`;
  // ═══ چرا «بی‌معامله» دیگر یک عدد تنها نیست ═══
  //
  // فایل گزارش‌شده ۵۹ ابزار/روز را «بدون معامله» خواند، از جمله خودِ نماد
  // پایه را در یک روز عادیِ بازار. تابلوی روزانه همان را تکذیب می‌کند، و
  // این سطر همان تکذیب است.
  const blankLine = blanks.total
    ? `${blanks.missing} ابزار/روز تابلو معامله ثبت کرده ولی ریزمعامله نیامد · `
      + `${blanks.quiet} واقعاً بی‌معامله · ${blanks.unknown} بی تابلوی روزانه`
    : '—';
  const summary = sheet('راهنما', ['شاخص', 'مقدار'], [
    ['نتیجهٔ دریافت', verdict],
    ['از تاریخ', dateText(range.from)], ['تا تاریخ', dateText(range.to)],
    ['تعداد دارایی پایه', instruments.filter((item) => item.kind === 'underlying').length],
    ['تعداد قرارداد اختیار', instruments.filter((item) => item.kind !== 'underlying').length],
    ['جفت ابزار/روز', pairs.length],
    ['ابزار/روز دارای داده', result.ok],
    ['بدون معامله', empty], ['خطا یا دریافت‌نشده', failed],
    ['بازبینی خالی‌ها با تابلوی روزانه', blankLine],
    ...(blanks.worst ? [['بدترین مورد نیامدن', `کد ${blanks.worst.ins} در ${blanks.worst.date} — تابلو ${blanks.worst.dailyTrades} معامله`]] : []),
    ['پنجرهٔ ساعت', 'ردیف‌های برگ هر ابزار فقط جلسهٔ پیوستهٔ ۹:۰۰ تا ۱۲:۳۰ است؛ شمار ردیف‌های بیرون از این بازه در برگ پوشش می‌آید.'],
    ['پوشش دفتر قراردادها', complete ? 'کامل' : 'ناقص — همه قراردادها تضمین نمی‌شود'],
    ['یادداشت منبع', note || '—'],
    ['تعریف ردیف', 'هر ردیف یک اجرای گزارش‌شده بورس است؛ یک اجرای حجمی به واحدهای منفرد شکسته نمی‌شود.'],
    ['بدون معامله در برابر خطا', 'برگ خالیِ یک قرارداد یعنی آن روز معامله‌ای نشده؛ برای تشخیص خطا به برگ «پوشش دریافت» نگاه کن.'],
  ], [150, 430]);

  const auditByKey = new Map((audit || []).map((row) => [row.key, row]));
  const coverageSheet = sheet('پوشش دریافت', [
    'نماد پایه', 'نماد ابزار', 'نوع', 'کد ابزار', 'تاریخ میلادی', 'کل ردیف',
    'فعال', 'باطل', 'وضعیت', 'حکم خالی‌بودن', 'معاملهٔ تابلوی روزانه', 'مسیر', 'منبع', 'خطا',
  ], coverage.map((row) => {
    const seen = auditByKey.get(`${row.date}:${row.ins}`) || null;
    const hit = items?.[`${row.date}:${row.ins}`] || {};
    return [
      row.baseName, row.name, DATA_EXPORT_KIND_LABEL[row.kind] || row.kind, row.ins, row.date,
      row.rows, row.active, row.canceled, row.status,
      seen ? BLANK_VERDICT_LABEL[seen.verdict] : '—',
      seen && Number.isFinite(seen.dailyTrades) ? seen.dailyTrades : '',
      hit.variant ? `پرچم ${hit.variant}` : '',
      row.source, row.error,
    ];
  }), [100, 120, 95, 140, 95, 75, 65, 65, 100, 250, 110, 85, 80, 260]);

  const instrumentSheets = instruments.map((instrument) => {
    // خواستهٔ صریح: «هر روز معاملاتی از ساعت ۹ الی ۱۲:۳۰». ردیفِ بیرون از
    // این پنجره حذف می‌شود ولی شمارش‌شده — نه بی‌صدا.
    const { rows } = dataExportSessionRows(dataExportTradeRows(instrument, pairs, items));
    if (rows.length > 1048575) throw new Error(`ریزمعاملهٔ ${instrument.name} از سقف یک شیت اکسل بیشتر است؛ بازه را کوتاه‌تر کن.`);
    const title = instrument.kind === 'underlying' ? `پایه ${instrument.name}` : instrument.name;
    return sheet(title, DATA_EXPORT_HEADERS, rows.map((row) => [
      row.date, tradeTimeLabel(row.time), row.sequence, row.price, row.quantity, row.rawValue,
      row.contractSize, row.contractValue, cancelText(row), row.source,
    ]), [95, 75, 85, 95, 80, 120, 95, 150, 90, 85]);
  });

  return [summary, coverageSheet, ...instrumentSheets];
}

export function dataExportFilename(range = {}) {
  return `options-data-${dateText(range.from)}-${dateText(range.to)}`;
}
