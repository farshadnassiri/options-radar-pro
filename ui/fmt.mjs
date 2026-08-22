// قالب‌بندی عدد — یک منبع، برای کل رابط.
//
// همه عددها فارسی نوشته می‌شوند: رقم فارسی، جداکننده هزارگان «٬»، اعشار «٫»،
// و منفی با نشانه ریاضی «−» نه خط تیره.
//
// چرا با دست و نه با toLocaleString('fa-IR'):
//
//   ۱. آن تابع پیش از عدد منفی یک نشانه نامرئی (U+200E) می‌گذارد. داخل SVG
//      و داخل ویژگی‌های HTML این نشانه دردسر می‌شود و در آزمون هم دیده
//      نمی‌شود ولی مقایسه رشته را می‌شکند.
//   ۲. خروجی‌اش به نسخه ICU مرورگر بند است. همان کد روی دو مرورگر دو جور
//      درمی‌آید و آزمون واحد چیزی را قفل نمی‌کند.
//
// پس در انگلیسی قالب می‌دهیم — که رفتارش تعریف‌شده است — و بعد نویسه‌ها را
// برمی‌گردانیم. تبدیل، تابع خالص است و آزمون‌پذیر.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** هر رشته‌ای را فارسی‌نویس می‌کند: رقم، جداکننده، اعشار، منفی. */
export function faNum(s) {
  return String(s)
    .replace(/[0-9]/g, (d) => FA_DIGITS[+d])
    .replace(/,/g, '٬')
    .replace(/\./g, '٫')
    .replace(/-/g, '−');
}

/** فقط رقم‌ها را برمی‌گرداند و به جداکننده دست نمی‌زند. برای متن آمیخته. */
export function faDigits(s) {
  return String(s).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

/** برعکس — برای خواندن ورودی کاربر که ممکن است فارسی تایپ کند. */
export function toEnDigits(s) {
  return String(s)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٬/g, '')
    .replace(/٫/g, '.')
    .replace(/−/g, '-');
}

/**
 * حروف عربی رایج در داده‌های رسمی بورس (ي، ك) را به معادل فارسی‌شان
 * (ی، ک) برمی‌گرداند، نیم‌فاصله را به فاصله ساده تبدیل می‌کند، و trim
 * می‌زند — برای جست‌وجوی متنی، نه نمایش. کاربری که «كامل» یا «علي» تایپ
 * می‌کند باید همان چیزی را پیدا کند که با «کامل»/«علی» پیدا می‌شد.
 */
export function normFa(s) {
  return String(s || '').replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/‌/g, ' ').trim();
}

/**
 * «−۰» را به «۰» ساده می‌کند. گرد کردن یک عدد منفی خیلی کوچک (مثلاً سود و
 * زیان ۰٫۴- ریال، یا دلتای ۰٫۰۰۰۴۰۰۰۰-) به دقت نمایش، ریاضی صفر می‌دهد ولی
 * `Math.round`/`toFixed` رشته «-0» یا «-0.00» برمی‌گردانند — به چشم انگار
 * هنوز کمی زیان مانده، در حالی که عدد واقعی دقیقاً صفر است.
 */
const stripNegZero = (s) => s.replace(/^-0(\.0+)?$/, (m) => m.slice(1));

const grouped = (v) => faNum(stripNegZero(Math.round(v).toLocaleString('en-US')));

export const fmt = {
  money: (v) => (Number.isFinite(v) ? grouped(v)
    : v === Infinity ? '∞' : v === -Infinity ? '−∞' : '—'),
  pct: (v) => (Number.isFinite(v) ? faNum(stripNegZero(v.toFixed(2))) : '—'),
  /**
   * شاخه‌بندی (گروه‌بندی‌شده ≥۱۰۰۰ ، چهار رقم اعشار زیر ۱ ، دو رقم اعشار
   * بین این دو) روی v خام تصمیم گرفته می‌شد، بعد toFixed گرد می‌کرد. یک
   * عددی مثل ۹۹۹٫۹۹۶ چون خودش زیر ۱۰۰۰ بود شاخه بدون گروه‌بندی می‌رفت،
   * ولی toFixed(2) به «1000.00» گرد می‌کرد — چاپ می‌شد «۱۰۰۰٫۰۰» بدون
   * جداکننده هزارگان، برخلاف هر عدد دیگری که همان ۱۰۰۰ را نشان می‌دهد.
   * رفع: بعد از گرد کردن اول، شاخه دوباره از روی مقدار گردشده تعیین
   * می‌شود — همان ایده «مرز گرد شدن» دور ۳۱ («−۰»).
   */
  num: (v) => {
    if (!Number.isFinite(v)) return '—';
    const decimalsFor = (x) => (Math.abs(x) >= 1000 ? null : Math.abs(x) < 1 ? 4 : 2);
    const d1 = decimalsFor(v);
    if (d1 === null) return grouped(v);
    const r = Number(v.toFixed(d1));
    const d2 = decimalsFor(r);
    return d2 === null ? grouped(r) : faNum(stripNegZero(r.toFixed(d2)));
  },
  int: (v) => (Number.isFinite(v) ? grouped(v) : '—'),
  // پرچم دو حالته. `text` جوابگو نبود: `String(true)` می‌شد «true» و ستون
  // فارسی، وسطش یک واژه انگلیسی می‌گرفت. نامعلوم هم باید از «خیر» جدا
  // بماند — «نمی‌دانم» با «نه» یکی نیست.
  bool: (v) => (v == null ? '—' : v ? 'بله' : 'خیر'),
  text: (v) => (v == null ? '—' : faDigits(String(v))),
  list: (v) => (Array.isArray(v)
    ? (v.length ? v.map((x) => (typeof x === 'number' ? grouped(x) : faDigits(x))).join(' , ') : '—')
    : faDigits(String(v ?? '—'))),
  // فهرست مبالغ، هم‌ترتیب با پاهای ترکیب.
  //
  // `list` جوابگو نبود: خانه بی‌داده را از `grouped` رد می‌کند و رشته
  // «NaN» می‌سازد — یک واژه انگلیسی وسط ستون فارسی. `pctList` هم جوابگو
  // نیست چون خانه بی‌داده را حذف می‌کند و با حذف، شماره پاها یکی جلو
  // می‌افتد: خانه دوم فهرست دیگر با ستون «ارزش معاملات پای ۲» یکی نیست.
  // پس هر خانه سر جای خودش می‌ماند و بی‌داده «—» می‌گیرد.
  moneyList: (v) => {
    const arr = Array.isArray(v) ? v : (v == null ? [] : [v]);
    return arr.length ? arr.map((x) => fmt.money(x)).join(' , ') : '—';
  },
  // فهرست درصدها. `list` برای عدد از `grouped` رد می‌شود که تا رقم صحیح
  // گرد می‌کند — برای ریال درست است، برای درصد نه: ۱۰٫۲۹٪ و ۱۰٫۹۴٪ هر دو
  // «۱۰» می‌شدند و همان تفاوتی که ستون برایش ساخته شده گم می‌شد.
  pctList: (v) => {
    const arr = Array.isArray(v) ? v : (Number.isFinite(v) ? [v] : []);
    const kept = arr.filter((x) => Number.isFinite(x));
    return kept.length ? kept.map((x) => faNum(stripNegZero(x.toFixed(2)))).join(' , ') : '—';
  },
  // نام قرارداد، شناسه است نه عدد. «طهرم7058» با رقم فارسی می‌شود
  // «طهرم۷۰۵۸» که دیگر در جست‌وجوی کارگزار پیدا نمی‌شود و کپی‌کردنش هم
  // به جایی نمی‌رسد. پس رقم دست‌نخورده می‌ماند و فقط جهتش جدا می‌شود تا
  // حرف فارسی و رقم لاتین کنار هم جابه‌جا نشوند.
  sym: (v) => {
    const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
    const kept = arr.filter((x) => x != null && String(x) !== '');
    return kept.length ? kept.map((x) => ltr(String(x))).join(' , ') : '—';
  },
};

/**
 * عدد کوتاه محور نمودار: هزار و میلیون و میلیارد.
 *
 * پسوند فارسی است ولی داخل SVG می‌نشیند، جایی که جهت‌دهی دوسویه دردسر
 * می‌سازد. قاعده «‎.payoff text» جهت را چپ‌به‌راست و جداشده می‌گیرد تا هم
 * نشانه منفی سر جایش بماند و هم حرف فارسی وارونه نشود.
 *
 * همان دسته «مرز گرد شدن» دور ۳۹ (fmt.num): واحد روی رقم خام تصمیم گرفته
 * می‌شد. عددی مثل ۹۹۹٬۹۶۰ خودش زیر ۱ میلیون بود، شاخه «هزار» را می‌رفت،
 * ولی گرد کردن به «۱۰۰۰ هزار» می‌رسید — باید «۱ م» می‌شد. یک بار رندر با
 * واحد اول، بعد دوباره از روی مقدار گردشده تصمیم می‌گیرد.
 */
function axisTier(x) {
  const a = Math.abs(x);
  if (a >= 1e9) {
    const dec = a >= 1e10 ? 0 : 1;
    return { text: `${faNum((x / 1e9).toFixed(dec))} میلیارد`, rounded: Number((x / 1e9).toFixed(dec)) * 1e9 };
  }
  if (a >= 1e6) {
    const dec = a >= 1e7 ? 0 : 1;
    return { text: `${faNum((x / 1e6).toFixed(dec))} م`, rounded: Number((x / 1e6).toFixed(dec)) * 1e6 };
  }
  if (a >= 1e4) {
    const r = Math.round(x / 1e3);
    return { text: `${faNum(r.toString())} هزار`, rounded: r * 1e3 };
  }
  return null;
}

export function axisNum(v) {
  if (!Number.isFinite(v)) return '—';
  const first = axisTier(v);
  if (!first) return fmt.money(v);
  const second = axisTier(first.rounded);
  return second ? second.text : fmt.money(first.rounded);
}

/** فاصله زمانی تا الان، به فارسی خوانا. */
export function faAgo(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 10) return 'همین الان';
  if (s < 60) return `${faDigits(s)} ثانیه پیش`;
  const m = Math.round(s / 60);
  if (m < 60) return `${faDigits(m)} دقیقه پیش`;
  const h = Math.round(m / 60);
  if (h < 24) return `${faDigits(h)} ساعت پیش`;
  return `${faDigits(Math.round(h / 24))} روز پیش`;
}

/** ساعت دیواری، برای «آخرین دریافت». */
export function faClock(d = new Date()) {
  const p = (n) => faDigits(String(n).padStart(2, '0'));
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * برچسب و رنگ حالت پوشش (core/margin.mjs → coverage().state). خام موتور
 * انگلیسی است («full» ، «naked» ...) و به‌تنهایی نمی‌گوید کدام حالت واقعاً
 * ریسک‌دار است؛ این نگاشت آن تفکیک را صریح می‌کند — پوشش کامل کم‌ریسک است،
 * لخت و ناقص ریسک‌دارند. اینجاست نه در یک تب خاص، چون تابع خالص و
 * آزمون‌پذیر است و ممکن است بیش از یک صفحه به آن نیاز داشته باشد.
 */
const COVERAGE_INFO = {
  full: { label: 'کامل — همه پای فروش پوشش دارد', tone: 'gain' },
  partial: { label: 'ناقص — بخشی از پای فروش لخت است', tone: 'warn' },
  naked: { label: 'لخت — بدون پوشش', tone: 'loss' },
  none: { label: 'بدون پای فروش', tone: 'flat' },
};
export const coverageInfo = (state) => COVERAGE_INFO[state] || { label: state || '—', tone: 'flat' };

/**
 * کلاس رنگ کارت KPI برای برچسبی که علامت سود/زیان دارد — مبلغ («سود و زیان
 * جاری») یا نسبتش («بازده روی سرمایه»). بقیه کارت‌ها (سرمایه درگیر، تعداد
 * موقعیت) خنثی می‌مانند. اینجاست تا با style.css (.kpi:has(.v.gain/.loss))
 * هم‌قرارداد و در بیش از یک تب قابل‌استفاده و آزمون‌پذیر باشد.
 *
 * `isGain` می‌تواند `null`/`undefined` باشد — یعنی «هنوز عددی برای قضاوت
 * نیست» (مثلاً صفر موقعیت، بازده روی سرمایه نامعلوم)؛ چنین کارتی هم باید
 * بی‌رنگ بماند، نه این‌که falsy بودن null آن را قرمز نشان دهد.
 */
export function kpiTone(label, isGain) {
  if (isGain == null) return '';
  return /سود|بازده/.test(label) ? (isGain ? 'gain' : 'loss') : '';
}

/**
 * کلاس رنگ کارت KPI مستقیم از علامت یک عدد — «بهترین/میانه بازده ماهانه»
 * در تب‌های استراتژی و برترین موقعیت‌ها، جایی که خودِ عدد ماهیتاً سود یا
 * زیان است، نه یک شمارنده خنثی مثل «ردیف قابل اجرا». عدد نامتناهی (چون
 * ردیفی موجود نیست) خنثی می‌ماند.
 */
/**
 * نام لاتین داخل متن راست‌به‌چپ.
 *
 * نام استراتژی‌ها انگلیسی است و در جمله فارسی می‌نشیند. یک دونهٔ لاتین خودش
 * درست می‌افتد، ولی نشانه‌های خنثی کنارش — خط تیره، پرانتز، دونقطه — به بافت
 * می‌چسبند و ترتیب را به‌هم می‌ریزند: «Covered Call — مطالعه‌ای» می‌تواند
 * وارونه دیده شود.
 *
 * FSI/PDI نام را در یک جزیرهٔ جهت‌دار می‌بندد تا بیرونش بی‌اثر بماند. عمداً
 * به‌جای CSS انتخاب شد، چون در متن ساده هم کار می‌کند — `option` و `title`
 * و `textContent` هیچ‌کدام از `unicode-bidi` اثر نمی‌گیرند.
 */
export const ltr = (value) => (value == null ? '' : `\u2068${value}\u2069`);

/**
 * کلاس رنگ یک عدد. منفی قرمز، بقیه بی‌رنگ.
 *
 * جدول مجازی‌سازی‌شده از قدیم این کار را می‌کرد، ولی هر جدول دیگری که با
 * رشتهٔ قالبی ساخته می‌شود عدد منفی را بی‌رنگ می‌گذاشت. حالا همه از یک
 * جا می‌خوانند.
 */
export const negClass = (value) => (Number.isFinite(value) && value < 0 ? 'neg' : '');

/** سلول عددی آمادهٔ جدول‌های رشته‌ای: تک‌عرض، چپ‌چین، و منفیِ قرمز. */
export const numCell = (value, kind = 'money', extra = '') =>
  `<td class="n ${negClass(value)} ${extra}">${fmt[kind](value)}</td>`;

export function signTone(value) {
  return Number.isFinite(value) ? (value >= 0 ? 'gain' : 'loss') : '';
}

/**
 * سلول «اگر همین حالا ببندی».
 *
 * وقتی سمت خروجِ یک پا خالی است، موتور عمداً عددی نمی‌سازد. اینجا هم نباید
 * «—» خنثی چاپ شود: خالی‌بودن می‌تواند «هنوز نیامده» خوانده شود، در حالی که
 * حرفِ این ردیف روشن است — آفست ممکن نیست. نام پای بی‌عرضه هم می‌آید، چون
 * کاربر باید بداند کدام پا گیر است.
 */
export function offsetCell(row) {
  if (row?.offsettable === false) {
    const where = (row.noExitLegs || []).map((x) => ltr(String(x))).join(' , ');
    return `<span class="tag warn">آفست ناممکن</span>${where ? ` <span class="unit">${where}</span>` : ''}`;
  }
  return `<span class="${negClass(row?.instantClosePnl)}" style="color:${signTone(row?.instantClosePnl) === 'gain' ? 'var(--gain)' : 'var(--loss)'}">${fmt.money(row?.instantClosePnl)}</span>`;
}

/**
 * پیام خام `stat.lastError` سرور (server/server.mjs) از `${e.name}: ${e.message}`
 * جاوااسکریپت می‌آید — مثل «TypeError: fetch failed» یا «AbortError: The
 * operation was aborted» — که برای کاربر فارسی‌زبان چیزی نمی‌گوید. این تابع
 * علت محتمل را می‌گوید؛ متن خام برای کسی که بخواهد جزئیات فنی را ببیند در
 * title/tooltip همان عنصر می‌ماند، نه اینجا حذف می‌شود.
 */
const BRAND = 'رصد استراتژی آپشن';

/**
 * عنوان تب مرورگر برای تب باز. کاربری که چند تب مرورگر کنار هم باز دارد
 * (مثلاً یکی زنجیره اختیار، یکی موقعیت‌های من) با نگاه به نوار تب مرورگر
 * می‌فهمد کدام‌یک این است، بدون کلیک روی هرکدام.
 */
export function pageTitle(tabTitle) {
  return tabTitle ? `${tabTitle} — ${BRAND}` : BRAND;
}

export function humanizeUpstreamError(raw) {
  if (!raw) return null;
  const s = String(raw);
  if (/abort/i.test(s)) return 'زمان پاسخ بالادست تمام شد';
  if (/fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|network/i.test(s)) return 'اتصال به بالادست برقرار نشد';
  if (/^Error:\s*HTTP\s*(\d+)/i.test(s)) {
    const code = s.match(/HTTP\s*(\d+)/i)[1];
    return `بالادست خطای HTTP ${faDigits(code)} داد`;
  }
  if (/SyntaxError/i.test(s)) return 'پاسخ بالادست جیسون معتبر نبود';
  return 'خطای فنی نامشخص — برای جزئیات نشانگر را روی این متن نگه دار';
}
