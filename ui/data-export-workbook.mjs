// دفترکار تب «خروجی دیتا»: یک برگ برای هر ابزار، در تایم‌فریم خواسته‌شده.

import {
  BLANK_VERDICT_LABEL, DATA_EXPORT_KIND_LABEL, EMPTY_STATUS, blankAuditSummary, dataExportCandles,
  dataExportCoverageRows, dataExportFrame, dataExportOutcome, dataExportRouteSplit,
  dataExportSessionRows, dataExportTradeRows,
} from '../core/data-export.mjs';
import { tradeTimeLabel } from '../core/backtest.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { sheet } from './xlsx.mjs';

const dateText = (value) => String(Math.trunc(Number(value) || 0));
// ═══ چرا تاریخ شمسی کنار میلادی می‌نشیند، نه به‌جایش ═══
//
// خواستهٔ صریح صاحب پروژه. میلادی می‌ماند چون همان است که از بالادست
// آمده و کلیدِ تطبیق با هر منبع دیگری است؛ شمسی اضافه می‌شود چون کسی که
// فایل را می‌خواند با آن فکر می‌کند. جایگزینی یکی با دیگری، یک واقعیتِ
// موجود را حذف می‌کرد.
//
// رقم لاتین می‌ماند و نه فارسی: این خانه در اکسل مرتب و پالایه می‌شود و
// «۱۴۰۵/۰۶/۲۵» نه مرتب می‌شود نه با تایپِ کاربر جور درمی‌آید. قاعدهٔ رقمِ
// فارسی برای نمایشِ برنامه است، نه برای دادهٔ داخل فایل — بقیهٔ ستون‌های
// همین فایل هم لاتین‌اند.
//
// تاریخِ نادرست خانهٔ **خالی** می‌گیرد، نه «—»: خانهٔ نانوشته در اکسل
// خالی است و همان است که قاعدهٔ ۲-۴ می‌خواهد.
const jalaliText = (value) => {
  const label = historyDateLabel(value);
  return label === '—' ? '' : label;
};
const cancelText = (row) => row.canceledKnown ? (row.canceled ? 'باطل' : 'فعال') : 'نامعلوم';

// ═══ چرا ستون‌های «مشتق» جدا شدند ═══
//
// گزارش صاحب پروژه: «فایل‌های اکسل سنگین و پرحجمی می‌سازد». سه ستونِ
// «ارزش خام»، «اندازه قرارداد» و «ارزش با اندازه قرارداد» هیچ واقعیتِ
// تازه‌ای ندارند — هر سه حاصل‌ضرب ستون‌هایی‌اند که همان‌جا هستند، و دو
// تایشان عددهای ده تا سیزده رقمی‌اند که بدترین نسبت فشرده‌سازی را دارند.
// اندازهٔ قرارداد هم در برگ «پوشش دریافت» ستون خودش را دارد، پس با
// خاموش‌کردنشان هیچ عددی از دست نمی‌رود؛ فقط دوباره حساب نمی‌شود.
export const DATA_EXPORT_HEADERS = [
  'تاریخ میلادی', 'تاریخ شمسی', 'ساعت', 'شماره معامله', 'قیمت (ریال)', 'حجم',
  'وضعیت ابطال', 'منبع',
];
export const DATA_EXPORT_DERIVED_HEADERS = [
  'ارزش خام (ریال)', 'اندازه قرارداد', 'ارزش با اندازه قرارداد (ریال)',
];
export const DATA_EXPORT_CANDLE_HEADERS = [
  'تاریخ میلادی', 'تاریخ شمسی', 'ساعت شروع', 'باز', 'بیشترین', 'کمترین', 'بسته',
  'حجم', 'ارزش (ریال)', 'تعداد معامله', 'تعداد باطل', 'منبع',
];
export const DATA_EXPORT_CANDLE_DERIVED_HEADERS = [
  'اندازه قرارداد', 'ارزش با اندازه قرارداد (ریال)',
];

export function buildDataExportSheets({
  instruments = [], pairs = [], items = {}, range = {}, complete = false, note = '',
  outcome = null, audit = [], frame = 'tick', derived = false,
} = {}) {
  const tf = dataExportFrame(frame);
  const coverage = dataExportCoverageRows(instruments, pairs, items, audit);
  const failed = coverage.filter((row) => row.status === 'خطا' || row.status === 'درخواست نرفت').length;
  const empty = coverage.filter((row) => row.status !== 'داده آمد' && row.status !== 'خطا'
    && row.status !== 'درخواست نرفت').length;
  const confirmedQuiet = coverage.filter((row) => row.status === EMPTY_STATUS.quiet).length;
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
  const route = dataExportRouteSplit(pairs, items);
  const routeLine = route.total
    ? `تاریخی: ${route.history.total} ابزار/روز، ${route.history.ok} داده آورد · `
      + `نوار زنده: ${route.live.total} ابزار/روز، ${route.live.ok} داده آورد`
      + `${route.history.total && !route.history.ok ? ' — هیچ روزِ بسته‌شده‌ای داده نیاورد' : ''}`
    : '—';
  const summary = sheet('راهنما', ['شاخص', 'مقدار'], [
    ['نتیجهٔ دریافت', verdict],
    ['از تاریخ', `${dateText(range.from)}${jalaliText(range.from) ? ` — ${jalaliText(range.from)} شمسی` : ''}`],
    ['تا تاریخ', `${dateText(range.to)}${jalaliText(range.to) ? ` — ${jalaliText(range.to)} شمسی` : ''}`],
    ['تعداد دارایی پایه', instruments.filter((item) => item.kind === 'underlying').length],
    ['تعداد قرارداد اختیار', instruments.filter((item) => item.kind !== 'underlying').length],
    ['جفت ابزار/روز', pairs.length],
    ['ابزار/روز دارای داده', result.ok],
    // «بدون معامله» فقط وقتی که تابلوی روزانه هم همان را بگوید.
    ['خالی', `${empty} ابزار/روز — ${confirmedQuiet} تای آن با تابلوی روزانه «بدون معامله» تأیید شد`],
    ['خطا یا دریافت‌نشده', failed],
    // ═══ چرا این خط بالاتر از همه‌چیز است ═══
    //
    // فایل گزارش‌شده ۱٬۳۱۶ ابزار/روز را از مسیر تاریخی خواست و هیچ‌کدام
    // داده نیاورد، ولی برای فهمیدنش باید ۱٬۳۴۹ ردیفِ برگ پوشش را دستی
    // دسته‌بندی می‌کردی. یک خط همان را می‌گوید.
    ['تفکیک مسیر', routeLine],
    ['بازبینی خالی‌ها با تابلوی روزانه', blankLine],
    ...(blanks.worst ? [['بدترین مورد نیامدن', `کد ${blanks.worst.ins} در ${blanks.worst.date} — تابلو ${blanks.worst.dailyTrades} معامله`]] : []),
    ['پنجرهٔ ساعت', 'ردیف‌های برگ هر ابزار فقط جلسهٔ پیوستهٔ ۹:۰۰ تا ۱۲:۳۰ است؛ شمار ردیف‌های بیرون از این بازه در برگ پوشش می‌آید.'],
    ['تایم‌فریم', tf.seconds
      ? `${tf.label} — هر ردیف یک سطل زمانی است که مبدأش ۹:۰۰ است. سطلِ بی‌معامله ردیف ندارد و هیچ قیمتی درون‌یابی نشده.`
      : `${tf.label} — هر ردیف یک اجرای گزارش‌شدهٔ بورس است.`],
    ['ستون‌های مشتق', derived
      ? 'روشن — ارزش خام، اندازه قرارداد و ارزش با اندازه قرارداد در برگ هر ابزار آمده‌اند.'
      : 'خاموش برای کوچک‌ماندن فایل. هر سه حاصل‌ضرب ستون‌های موجودند و اندازهٔ قرارداد در برگ «پوشش دریافت» ستون دارد.'],
    ['پوشش دفتر قراردادها', complete ? 'کامل' : 'ناقص — همه قراردادها تضمین نمی‌شود'],
    ['یادداشت منبع', note || '—'],
    ['تعریف ردیف', tf.seconds
      ? 'هر ردیف یک شمع است: باز/بسته اولین و آخرین قیمتِ مشاهده‌شدهٔ همان سطل، و حجم و ارزش جمعِ معامله‌های باطل‌نشدهٔ آن.'
      : 'هر ردیف یک اجرای گزارش‌شده بورس است؛ یک اجرای حجمی به واحدهای منفرد شکسته نمی‌شود.'],
    ['برگ خالی یعنی چه', 'برگ خالی به‌خودی‌خود یعنی ریزمعامله‌ای نیامد — نه اینکه معامله‌ای نشده. ستون «وضعیت» در برگ «پوشش دریافت» این دو را از هم و از خطا جدا می‌کند.'],
  ], [150, 430]);

  const auditByKey = new Map((audit || []).map((row) => [row.key, row]));
  const coverageSheet = sheet('پوشش دریافت', [
    'نماد پایه', 'نماد ابزار', 'نوع', 'کد ابزار', 'اندازه قرارداد',
    'تاریخ میلادی', 'تاریخ شمسی', 'کل ردیف',
    'فعال', 'باطل', 'وضعیت', 'حکم خالی‌بودن', 'معاملهٔ تابلوی روزانه', 'مسیر',
    'پاسخ بالادست', 'منبع', 'خطا',
  ], coverage.map((row) => {
    const seen = auditByKey.get(`${row.date}:${row.ins}`) || null;
    const hit = items?.[`${row.date}:${row.ins}`] || {};
    return [
      row.baseName, row.name, DATA_EXPORT_KIND_LABEL[row.kind] || row.kind, row.ins,
      Number.isFinite(row.size) && row.size > 0 ? row.size : '',
      row.date, jalaliText(row.date),
      row.rows, row.active, row.canceled, row.status,
      seen ? BLANK_VERDICT_LABEL[seen.verdict] : '—',
      seen && Number.isFinite(seen.dailyTrades) ? seen.dailyTrades : '',
      hit.variant ? `پرچم ${hit.variant}` : '',
      // خالیِ بی‌شرح همان چیزی است که چهار نوبت تشخیص را کور کرد.
      hit.upstream ? (hit.upstreamAlt && hit.upstreamAlt !== hit.upstream
        ? `${hit.upstream} / ${hit.upstreamAlt}` : hit.upstream) : '',
      row.source, row.error,
    ];
  }), [100, 120, 95, 140, 100, 95, 95, 75, 65, 65, 100, 250, 110, 85, 200, 80, 260]);

  const instrumentSheets = instruments.map((instrument) => {
    // خواستهٔ صریح: «هر روز معاملاتی از ساعت ۹ الی ۱۲:۳۰». ردیفِ بیرون از
    // این پنجره حذف می‌شود ولی شمارش‌شده — نه بی‌صدا.
    const { rows } = dataExportSessionRows(dataExportTradeRows(instrument, pairs, items));
    const title = instrument.kind === 'underlying' ? `پایه ${instrument.name}` : instrument.name;
    const size = instrument.kind === 'underlying' ? 1 : Number(instrument.size) || 0;
    if (tf.seconds) {
      const bars = dataExportCandles(rows, tf.seconds);
      return sheet(title,
        derived ? [...DATA_EXPORT_CANDLE_HEADERS, ...DATA_EXPORT_CANDLE_DERIVED_HEADERS] : DATA_EXPORT_CANDLE_HEADERS,
        bars.map((bar) => [
          bar.date, jalaliText(bar.date), tradeTimeLabel(bar.time),
          bar.open, bar.high, bar.low, bar.close,
          bar.volume, bar.value, bar.trades, bar.canceled, bar.source,
          ...(derived ? [size > 0 ? size : NaN, size > 0 ? bar.value * size : NaN] : []),
        ]),
        [95, 95, 85, 95, 95, 95, 95, 90, 130, 95, 85, 85, ...(derived ? [95, 150] : [])]);
    }
    if (rows.length > 1048575) throw new Error(`ریزمعاملهٔ ${instrument.name} از سقف یک شیت اکسل بیشتر است؛ بازه را کوتاه‌تر کن یا تایم‌فریم را بالا ببر.`);
    return sheet(title,
      derived ? [...DATA_EXPORT_HEADERS, ...DATA_EXPORT_DERIVED_HEADERS] : DATA_EXPORT_HEADERS,
      rows.map((row) => [
        row.date, jalaliText(row.date), tradeTimeLabel(row.time), row.sequence,
        row.price, row.quantity, cancelText(row), row.source,
        ...(derived ? [row.rawValue, row.contractSize, row.contractValue] : []),
      ]),
      [95, 95, 75, 85, 95, 80, 90, 85, ...(derived ? [120, 95, 150] : [])]);
  });

  return [summary, coverageSheet, ...instrumentSheets];
}

export function dataExportFilename(range = {}, frame = 'tick') {
  // نامِ فایل تایم‌فریم را می‌گوید، وگرنه دو اجرا با دو تفکیکِ متفاوت
  // هم‌نام می‌شوند و در پوشهٔ دانلود از هم جدا نمی‌شوند.
  return `options-data-${dateText(range.from)}-${dateText(range.to)}-${dataExportFrame(frame).id}`;
}
