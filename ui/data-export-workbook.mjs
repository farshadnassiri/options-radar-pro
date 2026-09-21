// دفترکار تب «خروجی دیتا»: یک برگ برای هر ابزار، در تایم‌فریم خواسته‌شده.

import {
  BLANK_VERDICT_LABEL, DATA_EXPORT_KIND_LABEL, EMPTY_STATUS, blankAuditSummary, dataExportCandles,
  dataExportCoverageRows, dataExportFrame, dataExportListingBasis, dataExportOutcome,
  dataExportRouteSplit, dataExportSessionRows, dataExportTradeRows,
  DEFAULT_SESSION_WINDOW, clockLabel, BUCKET_STATE,
} from '../core/data-export.mjs';
import { tradeTimeLabel } from '../core/backtest.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { sheet } from './xlsx.mjs';

const n = (value) => Math.trunc(Number(value) || 0);

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
  // در جدولِ پیوسته، سطلِ ساختگی باید خودش را معرفی کند: خانه‌های قیمتش
  // خالی است و بی این ستون، «خالی» با «نیامد» یکی دیده می‌شود.
  'معامله شد',
];

// ═══════════════ سقفِ یک شیت، و چرا دیگر پرتاب نمی‌کند ═══════════════
//
// معیار پذیرشِ ۸ ممیزی: «خروجی بزرگ به چند بخش تقسیم شود و مجموع
// رکوردها با دادهٔ معتبر ورودی برابر بماند.»
//
// رفتار قبلی صادق بود ولی بن‌بست: از ۱٬۰۴۸٬۵۷۵ ردیف بیشتر، **خطا**. برشِ
// بی‌صدا نبود — و همین خوب بود — ولی کاربری که کلِ بازه را می‌خواست هیچ
// راهی جز کوتاه‌کردنِ بازه نداشت، یعنی خواستهٔ اصلی برآورده نمی‌شد.
//
// حالا همان ابزار چند برگ می‌گیرد: «اهرم»، «اهرم (۲)»، … هر برگ سرستونِ
// خودش را دارد و ترتیبِ ردیف‌ها دست‌نخورده می‌ماند، پس چسباندنشان همان
// جدولِ اول است. هیچ ردیفی نه حذف می‌شود نه تکرار.
export const SHEET_ROW_CAP = 1048575;

const faNumber = (value) => String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export function splitSheets(title, headers, rows, widths, cap = SHEET_ROW_CAP) {
  const size = Math.max(1, Math.trunc(Number(cap) || 0) || SHEET_ROW_CAP);
  if (rows.length <= size) return [sheet(title, headers, rows, widths)];
  const parts = [];
  for (let at = 0; at < rows.length; at += size) {
    const index = (at / size) + 1;
    parts.push(sheet(index === 1 ? title : `${title} (${faNumber(index)})`,
      headers, rows.slice(at, at + size), widths));
  }
  return parts;
}
export const DATA_EXPORT_CANDLE_DERIVED_HEADERS = [
  'اندازه قرارداد', 'ارزش با اندازه قرارداد (ریال)',
];

export function buildDataExportSheets({
  instruments = [], pairs = [], items = {}, range = {}, complete = false, note = '',
  outcome = null, audit = [], frame = 'tick', derived = false, dailyMissing = [],
  window = DEFAULT_SESSION_WINDOW, continuous = false, coverageWarnings = [],
} = {}) {
  const tf = dataExportFrame(frame);
  const coverage = dataExportCoverageRows(instruments, pairs, items, audit, window);
  const failed = coverage.filter((row) => row.status === 'خطا' || row.status === 'درخواست نرفت').length;
  // ═══ چرا شمارش از `rows` می‌آید و نه از متنِ وضعیت ═══
  //
  // وضعیت حالا حکمِ بازبینی است و هفت مقدار دارد، نه سه تا. شمردنِ «خالی»
  // با «هر چیزی که داده‌آمد نیست» پس از بند ۳ غلط می‌شد: پاسخِ **ناقص**
  // ردیف دارد ولی برچسبش «داده آمد» نیست، و اگر خالی شمرده شود همان
  // اشتباهِ وارونه ساخته می‌شود. شکلِ پاسخ را `rows` می‌گوید، نه برچسب.
  const empty = coverage.filter((row) => row.rows === 0).length;
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
  // ═══ چرا این خط هفت عدد شد ═══
  //
  // بند ۳ ممیزی: بازبینی فقط پاسخ‌های **کاملاً خالی** را می‌دید، پس فایل
  // هیچ‌جا نمی‌توانست بگوید یک ابزار/روز «آمد ولی بریده آمد». حالا هر
  // ابزار/روزِ پاسخ‌گرفته حکمی دارد و همه‌شان اینجا شمرده می‌شوند —
  // «تطبیق‌شده» هم، چون بی آن، نبودِ ایراد با نبودِ بررسی یکی دیده می‌شود.
  const blankLine = blanks.total
    ? `${blanks.matched} تطبیق‌شده · ${blanks.partial} ناقص · `
      + `${blanks.missing} تابلو معامله ثبت کرده ولی ریزمعامله نیامد · `
      + `${blanks.quiet} واقعاً بی‌معامله · ${blanks.surplus} تضاد با تابلو · `
      + `${blanks.open} جلسه تمام‌نشده · ${blanks.unknown} بی تابلوی روزانه`
    : '—';
  const basis = dataExportListingBasis(instruments, pairs);
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
    // ═══ چرا «انجام نشد» سطرِ خودش را دارد ═══
    //
    // ممیزی ۱۴۰۵/۰۶/۲۹ بند ۴: سقفِ ۲۰۰تاییِ `/api/dailies` بی‌صدا می‌بُرید،
    // پس برای انتخابی بزرگ‌تر، انتهای فهرست **راست‌آزمایی نمی‌شد** و
    // خالی‌هایش «تابلوی روزانه در دست نیست» می‌گرفتند — که همان حکمِ
    // «نمی‌دانیم» است ولی علتش دریافتِ ما بود، نه بالادست. این دو باید
    // در فایل از هم جدا بمانند.
    // ═══ چرا «تلاش دریافت» یک سطرِ خلاصه هم دارد ═══
    //
    // اعلامِ درستِ کسری جای دریافتِ داده را نمی‌گیرد. کسی که فایل را
    // بعداً باز می‌کند باید بداند برای پرکردنِ این شکاف چقدر تلاش شده —
    // وگرنه «نیامد» و «نپرسیدیم» یک شکل دارند.
    // ═══ R5-01: چرا این جمله بازنویسی شد ═══
    //
    // شمارنده دریافتِ اولیه را نمی‌شمرد، پس پس از یک تلاشِ تکمیلیِ
    // تمام‌شده عددِ ستون «۱ بار» می‌شد و همین سطر می‌گفت «هر ابزار/روز یک
    // بار پرسیده شد» — یعنی فایل، تلاشی را که واقعاً رفته بود انکار
    // می‌کرد. حالا `۱` یعنی فقط دورِ اول، `۲` به بالا یعنی تلاشِ دوباره،
    // و `۰` یعنی اصلاً درخواستش نرفت. هر سه عدد اینجا نوشته می‌شوند چون
    // هر سه معنای متفاوتی دارند.
    ['تلاش دریافت', (() => {
      const tried = coverage.filter((row) => row.attempts > 1).length;
      const once = coverage.filter((row) => row.attempts === 1).length;
      const never = coverage.filter((row) => row.attempts === 0).length;
      const most = Math.max(0, ...coverage.map((row) => row.attempts));
      return `شمارِ ستون «تلاش دریافت» دورهای پرسیدن است، از خودِ دورِ اول:`
        + ` ${once} ابزار/روز یک بار · ${tried} ابزار/روز بیش از یک بار (بیشینه ${most} بار)`
        + ` · ${never} ابزار/روز اصلاً درخواستشان نرفت.`
        + `${tried ? '' : ' برای کم‌داشته‌ها دکمهٔ «تلاش تکمیلی» در همان تب هست.'}`;
    })()],
    // ═══ R5-06: «از کدام در آمد» خودش بخشی از جواب است ═══
    //
    // تابلوی روزانه دو مسیر دارد: فهرستِ یکجا (`GetClosingPriceDailyList`)
    // که برای قراردادِ منقضی خالی برمی‌گردد، و تک‌روزِ سرور
    // (`GetClosingPriceDaily`) که هنوز جواب می‌دهد. حکمِ هر دو یکی است،
    // ولی کسی که فایل را باز می‌کند حق دارد بداند کدام ردیف با کدام
    // مرجع سنجیده شده.
    ['راست‌آزمایی انجام‌نشده', (() => {
      const list = (audit || []).filter((row) => row.referenceSource === 'list').length;
      const day = (audit || []).filter((row) => row.referenceSource === 'day').length;
      const head = (dailyMissing || []).length
        ? `${(dailyMissing || []).length} ابزار تابلوی روزانه‌شان پاسخ نگرفت، پس خالی‌هایشان راست‌آزمایی نشد.`
        : 'هر ابزارِ درخواست‌شده تابلوی روزانه‌اش پاسخ گرفت.';
      return `${head} مبنای سنجش: ${list} ابزار/روز از فهرستِ روزانهٔ همین تب`
        + `${day ? ` · ${day} ابزار/روز از تابلوی تک‌روزِ سرور — این‌ها اغلب قراردادِ منقضی‌اند که از فهرستِ یکجا حذف شده‌اند` : ''}`
        + `${blanks.unknown ? ` · ${blanks.unknown} ابزار/روز هیچ مرجعی نداشتند` : ''}.`;
    })()],
    ...(blanks.worst ? [['بدترین مورد نیامدن', `کد ${blanks.worst.ins} در ${blanks.worst.date} — تابلو ${blanks.worst.dailyTrades} معامله`]] : []),
    ...(blanks.worstPartial ? [['بدترین پاسخِ ناقص',
      `کد ${blanks.worstPartial.ins} در ${blanks.worstPartial.date} — تابلو ${blanks.worstPartial.dailyTrades} معامله`
      + ` و ${blanks.worstPartial.dailyVolume} حجم، نوار ${blanks.worstPartial.tapeTrades} معامله`
      + ` و ${blanks.worstPartial.tapeVolume} حجم`]] : []),
    // «چند ردیف آمد» اثباتِ «کامل آمد» نیست، و فایل باید همین را بنویسد.
    ['معیار کامل‌بودن', 'هر ابزار/روز با شمارِ معاملهٔ فعال و حجمِ تابلوی روزانهٔ همان روز سنجیده می‌شود.'
      + ' حجم معیارِ اول است چون معاملهٔ باطل حجمش صفر است؛ اختلافِ شمار تا اندازهٔ ردیف‌های باطل توضیح دارد و بیشتر از آن «ناقص» است.'
      + ' روزی که جلسه‌اش تمام نشده سنجیده نمی‌شود.'],
    // ═══ چرا این سطر عددِ واقعیِ اجرا را می‌نویسد ═══
    //
    // بند ۶ ممیزی: متنِ راهنما «۹:۰۰ تا ۱۲:۳۰» را **ثابت** نوشته بود، پس
    // اگر روزی پنجره عوض می‌شد فایل همچنان عددِ قدیمی را ادعا می‌کرد.
    // حالا پنجره یک مقدار است و پالایه، شمع‌سازی و همین جمله از یک جا
    // می‌خوانند.
    ['پنجرهٔ ساعت', `ردیف‌های برگ هر ابزار فقط ${clockLabel(window.start)} تا ${clockLabel(window.end)}`
      + ' (شاملِ ثانیهٔ پایان) است؛ شمار ردیف‌های بیرون از این بازه در ستون'
      + ' «خارج از پنجرهٔ انتخابی» برگ پوشش می‌آید، و ستون «خارج از جلسهٔ بازار» همان شمار را'
      + ' نسبت به جلسهٔ رسمیِ ۰۹:۰۰ تا ۱۲:۳۰ می‌دهد.'
      + `${window.custom ? ' این پنجره را خودِ شما انتخاب کرده‌اید، پیش‌فرض ۰۹:۰۰:۰۰ تا ۱۲:۳۰:۰۰ است.' : ''}`],
    ['جدول زمانی', continuous
      ? 'پیوسته — هر روزِ درخواست‌شده تمام سطل‌های پنجره را دارد، حتی روزی که داده‌اش اصلاً نرسیده.'
        + ' خانه‌های قیمتِ سطلِ بی‌معامله **خالی** است و هیچ قیمتی درون‌یابی یا از سطل قبل تکرار نشده.'
        + ' ستون «معامله شد» چهار حالت دارد: «بله» معامله شد · «خیر» تابلو هم صفر است، پس واقعاً نشد ·'
        + ' «دریافت نشد» تابلو معامله ثبت کرده ولی ریزمعامله نیامد · «نامعلوم» دریافتِ آن روز ناقص یا بی‌مرجع بود،'
        + ' پس دربارهٔ این دقیقه نمی‌توان حکم داد.'
      : 'فشرده — فقط سطلی که معامله داشته ردیف دارد. برای جدولِ تمام‌دقیقه‌ها گزینهٔ «جدول زمانی پیوسته» را روشن کنید.'],
    ['تایم‌فریم', tf.seconds
      ? `${tf.label} — هر ردیف یک سطل زمانی است که مبدأش ۹:۰۰ است. سطلِ بی‌معامله ردیف ندارد و هیچ قیمتی درون‌یابی نشده. معاملهٔ حراج پایانی (۱۲:۳۰:۰۰) در سطلِ آخرِ همان روز می‌نشیند، نه در سطلی تازه.`
      : `${tf.label} — هر ردیف یک اجرای گزارش‌شدهٔ بورس است.`],
    ['ستون‌های مشتق', derived
      ? 'روشن — ارزش خام، اندازه قرارداد و ارزش با اندازه قرارداد در برگ هر ابزار آمده‌اند.'
      : 'خاموش برای کوچک‌ماندن فایل. هر سه حاصل‌ضرب ستون‌های موجودند و اندازهٔ قرارداد در برگ «پوشش دریافت» ستون دارد.'],
    // ═══ چرا «مبنای تاریخ عرضه» یک سطر شد ═══
    //
    // ممیزی فایلِ m5: ۵۸ ابزار/روز اصلاً درخواست نرفته بودند و هر ۵۸تا
    // پوت بودند، چون کرانِ پایینیِ عمرشان از اولین روزِ دیده‌شدن آمده بود
    // نه از تاریخ عرضه. حالا کفِ سری آن‌ها را برمی‌گرداند — ولی تا وقتی
    // اسکن دفتر تاریخ عرضهٔ رسمی را نیاورده، این هنوز یک **مشاهده** است و
    // فایل باید همین را بگوید، نه اینکه مثل تاریخِ رسمی نشانش دهد.
    ['مبنای تاریخ عرضه', basis.total
      ? `${basis.official} قرارداد از ${basis.total} تاریخ عرضهٔ رسمی دارند`
        + `${basis.observed ? ` · برای ${basis.observed} قرارداد آغازِ عمر از اولین روزِ دیده‌شدنِ دفتر آمده و با سریِ خودش (کال و پوتِ هم‌اعمال) هم‌تراز شده` : ''}`
        + `${basis.recovered ? ` — ${basis.recovered} ابزار/روز که پیش از این هم‌ترازی اصلاً درخواست نمی‌رفت` : ''}`
      : '—'],
    ['پوشش دفتر قراردادها', complete ? 'کامل' : 'ناقص — همه قراردادها تضمین نمی‌شود'],
    // ═══ R4-05: قفلی که برداشته شد، باید اینجا نوشته شود ═══
    //
    // ساختِ ناتمامِ دفتر دیگر دکمه را نمی‌بندد — چون قفلی که کاربر
    // نمی‌تواند بازش کند محافظت نیست. ولی اگر همین‌جا نوشته نشود،
    // «قفل برداشته شد» به «انگار مشکلی نبود» ترجمه می‌شود، و فایلی
    // که ناقص است کامل به نظر می‌رسد.
    ['کم‌داشتهٔ دفتر هنگام خروجی', (coverageWarnings || []).length
      ? (coverageWarnings || []).join(' · ')
      : 'دفتر هنگام ساختِ این فایل کم‌داشته‌ای نداشت'],
    ['یادداشت منبع', note || '—'],
    ['تعریف ردیف', tf.seconds
      ? 'هر ردیف یک شمع است: باز/بسته اولین و آخرین قیمتِ مشاهده‌شدهٔ همان سطل، و حجم و ارزش جمعِ معامله‌های باطل‌نشدهٔ آن.'
      : 'هر ردیف یک اجرای گزارش‌شده بورس است؛ یک اجرای حجمی به واحدهای منفرد شکسته نمی‌شود.'],
    ['برگ خالی یعنی چه', 'برگ خالی به‌خودی‌خود یعنی ریزمعامله‌ای نیامد — نه اینکه معامله‌ای نشده. ستون «وضعیت» در برگ «پوشش دریافت» این دو را از هم و از خطا جدا می‌کند.'],
  ], [150, 430]);

  const auditByKey = new Map((audit || []).map((row) => [row.key, row]));
  // ═══ دو ستونی که اینجا عوض شدند ═══
  //
  // «بیرون از جلسه» **اضافه** شد: برگ راهنما وعده‌اش را می‌داد ولی ستونش
  // در فایل نبود، و بی آن تفاوتِ «کل ردیف» با ردیف‌های برگ ابزار بی‌شرح
  // می‌ماند.
  //
  // «مسیر» به «پرچم درخواست» **تغییر نام** داد چون محتوایش هیچ‌وقت مسیر
  // نبود: `hit.variant` می‌گوید پاسخ از کدام پرچمِ endpoint تاریخی آمد
  // (`true`، `false`، یا «هر دو را زدیم و خالی بود»). مسیرِ واقعی —
  // تاریخی یا نوار زنده — همان ستون «منبع» است، و برگ‌های ابزار هم همین
  // نام را برای همان چیز دارند.
  const coverageSheet = sheet('پوشش دریافت', [
    'نماد پایه', 'نماد ابزار', 'نوع', 'کد ابزار', 'اندازه قرارداد',
    'تاریخ میلادی', 'تاریخ شمسی', 'کل ردیف',
    // دو ستون، چون دو مفهوم‌اند: جلسهٔ رسمیِ بازار، و پنجره‌ای که کاربر
    // برای همین فایل انتخاب کرده. یکی‌کردنشان همان F-02 بود.
    'فعال', 'باطل', 'خارج از جلسهٔ بازار', 'خارج از پنجرهٔ انتخابی',
    'وضعیت', 'حکم خالی‌بودن',
    'معاملهٔ تابلوی روزانه', 'کسریِ نسبت به تابلو', 'تلاش دریافت',
    'پرچم درخواست', 'پاسخ بالادست', 'منبع', 'خطا',
  ], coverage.map((row) => {
    const seen = auditByKey.get(`${row.date}:${row.ins}`) || null;
    const hit = items?.[`${row.date}:${row.ins}`] || {};
    return [
      row.baseName, row.name, DATA_EXPORT_KIND_LABEL[row.kind] || row.kind, row.ins,
      Number.isFinite(row.size) && row.size > 0 ? row.size : '',
      row.date, jalaliText(row.date),
      row.rows, row.active, row.canceled, row.outside, row.outsideWindow, row.status,
      seen ? BLANK_VERDICT_LABEL[seen.verdict] : '—',
      // ═══ R5-05: ستونِ تابلو از هر مرجعی که هست پر می‌شود ═══
      //
      // اولویت با مرجعِ خودِ این تب است (کلِ تاریخِ روزانه، یکجا)، ولی اگر
      // نداشت و سرور برای همین ابزار/روز مرجع داشته، همان می‌نشیند. بی
      // این، ستونِ «کسری» عدد داشت و ستونِ پشتوانه‌اش خالی بود — یعنی
      // فایل عددی می‌نوشت که خودش نمی‌توانست توجیهش کند.
      seen && Number.isFinite(seen.dailyTrades) ? seen.dailyTrades
        : (Number.isFinite(hit.reference?.trades) ? hit.reference.trades : ''),
      // ═══ F-01: کسری، وقتی هیچ مسیری با تابلو نخواند ═══
      //
      // سرور حالا پاسخ‌ها را با تابلوی روزانه می‌سنجد و اگر هیچ‌کدام
      // تطبیق نکرد، پرحجم‌ترین را با عددِ کسری برمی‌گرداند. بی این ستون،
      // فایل «بهترینِ آنچه داریم» را مثل «همهٔ آنچه هست» نشان می‌داد.
      hit.complete === false && hit.shortfall
        ? `${n(hit.shortfall.trades)} معامله / ${n(hit.shortfall.volume)} حجم`
        : (hit.complete === true ? 'تطبیق کامل' : ''),
      // «۱ بار» یعنی همان دورِ اول و بس؛ عددِ بزرگ‌تر یعنی تلاشِ تکمیلی
      // رویش رفته و باز نیامده. این تفاوت، تفاوتِ «نپرسیدیم» و «پرسیدیم
      // و نداد» است.
      row.attempts > 0 ? `${row.attempts} بار` : '',
      hit.variant ? `پرچم ${hit.variant}` : '',
      // خالیِ بی‌شرح همان چیزی است که چهار نوبت تشخیص را کور کرد.
      hit.upstream ? (hit.upstreamAlt && hit.upstreamAlt !== hit.upstream
        ? `${hit.upstream} / ${hit.upstreamAlt}` : hit.upstream) : '',
      row.source, row.error,
    ];
  }), [100, 120, 95, 140, 100, 95, 95, 75, 65, 65, 110, 120, 100, 250, 110, 140, 85, 100, 200, 80, 260]);

  const instrumentSheets = instruments.flatMap((instrument) => {
    // ردیفِ بیرون از پنجره حذف می‌شود ولی شمارش‌شده — نه بی‌صدا.
    const { rows } = dataExportSessionRows(dataExportTradeRows(instrument, pairs, items, window));
    const title = instrument.kind === 'underlying' ? `پایه ${instrument.name}` : instrument.name;
    const size = instrument.kind === 'underlying' ? 1 : Number(instrument.size) || 0;
    if (tf.seconds) {
      // روزهای **درخواست‌شدهٔ همین ابزار** و حکمِ پوششِ هرکدام، تا جدولِ
      // پیوسته روزِ دریافت‌نشده را هم بیاورد و «نیامد» را از «نشد» جدا کند.
      const mine = (pairs || []).filter((pair) => String(pair.ins) === String(instrument.ins));
      const dates = mine.map((pair) => pair.date);
      const verdictByDate = {};
      for (const pair of mine) {
        const seen = auditByKey.get(pair.key);
        if (seen) verdictByDate[pair.date] = seen.verdict;
      }
      const bars = dataExportCandles(rows, tf.seconds, { window, continuous, dates, verdictByDate });
      return splitSheets(title,
        derived ? [...DATA_EXPORT_CANDLE_HEADERS, ...DATA_EXPORT_CANDLE_DERIVED_HEADERS] : DATA_EXPORT_CANDLE_HEADERS,
        bars.map((bar) => [
          bar.date, jalaliText(bar.date), tradeTimeLabel(bar.time),
          bar.open, bar.high, bar.low, bar.close,
          bar.volume, bar.value, bar.trades, bar.canceled, bar.source,
          // چهار حالت، نه دو تا: «نیامد» هرگز «نشد» خوانده نمی‌شود.
          BUCKET_STATE[bar.state] || (bar.traded === false ? BUCKET_STATE.unknown : BUCKET_STATE.traded),
          ...(derived ? [size > 0 ? size : NaN, size > 0 ? bar.value * size : NaN] : []),
        ]),
        [95, 95, 85, 95, 95, 95, 95, 90, 130, 95, 85, 85, 80, ...(derived ? [95, 150] : [])]);
    }
    return splitSheets(title,
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
