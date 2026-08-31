// خواندن JSON بی‌آنکه شناسه‌ها آسیب ببینند.
//
// ═══ چرا لازم شد ═══
//
// شناسهٔ ابزار TSETMC هفده رقم دارد:
//
//     ۶۲۶۳۰۷۱۶۳۸۱۳۸۰۶۷۷
//
// بزرگ‌ترین عدد صحیحی که جاوااسکریپت **دقیق** نگه می‌دارد
// ۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۱ است — شانزده رقم. هر شناسهٔ هفده‌رقمی از این مرز
// رد می‌شود، و اگر بالادست آن را به‌شکل **عدد** بفرستد (نه رشته)،
// `JSON.parse` بی‌هیچ خطایی ارقام انتهایی را گرد می‌کند:
//
//     JSON.parse('{"insCode":62630716381380677}').insCode
//     → 62630716381380680        ← سه رقم آخر عوض شد
//
// نتیجه‌اش خطای بی‌صداست: شناسهٔ گردشده به هیچ قراردادی نمی‌خورد، هر
// درخواست قیمتی رویش خالی برمی‌گردد، و ردیف «بی‌داده» به نظر می‌رسد نه
// «خراب». هیچ‌جای برنامه هم نمی‌تواند بفهمد، چون عدد سالم به نظر می‌آید.
//
// ═══ راه‌حل ═══
//
// شناسه هرگز عدد نمی‌شود. **پیش از** `JSON.parse`، هر میدانِ شناسه که
// به‌شکل عدد آمده باشد در خودِ متن گیومه می‌گیرد. از آن به بعد رشته است و
// می‌ماند.
//
// این کار روی متن انجام می‌شود نه روی شیء، و دلیلش ساده است: تا وقتی
// `JSON.parse` اجرا شود، رقم‌ها از دست رفته‌اند. هیچ تابعی نمی‌تواند
// بعدش درستشان کند.

/** میدان‌هایی که شناسه‌اند و باید رشته بمانند. */
export const ID_FIELDS = [
  'insCode', 'insCode2', 'insCode3', 'insCode4',
  'uaInsCode', 'insCode_C', 'insCode_P',
  'instrumentID', 'iAnsCode', 'cIsin',
];

/** بزرگ‌ترین عدد صحیحی که خواندنش امن است. */
export const MAX_SAFE = Number.MAX_SAFE_INTEGER;   // ۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۱

/** آیا این رشتهٔ رقمی از مرز امن رد شده. */
export function unsafeDigits(text) {
  const s = String(text ?? '').trim();
  return /^\d+$/.test(s) && (s.length > 15) && Number(s) > MAX_SAFE;
}

const escapeKey = (key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * گیومه‌گذاری میدان‌های شناسه در **متن** JSON.
 *
 * فقط عددِ بی‌گیومه را می‌گیرد؛ اگر بالادست از قبل رشته فرستاده باشد،
 * الگو نمی‌خورد و چیزی عوض نمی‌شود.
 *
 * الگو عمداً محافظه‌کار است: کلید باید در گیومه باشد و مقدار باید یک
 * دنبالهٔ رقمِ خالص باشد. عدد اعشاری، منفی، نمایی و `null` دست نمی‌خورند
 * — هیچ‌کدام شناسه نیستند و دست‌زدن به آن‌ها یعنی خراب‌کردنِ چیزی که سالم
 * بود.
 */
export function quoteIdFields(text, fields = ID_FIELDS) {
  let out = String(text ?? '');
  for (const key of fields) {
    out = out.replace(
      new RegExp(`("${escapeKey(key)}"\\s*:\\s*)(\\d+)(\\s*[,}\\]])`, 'g'),
      '$1"$2"$3',
    );
  }
  return out;
}

/**
 * `JSON.parse` با شناسه‌های سالم.
 *
 * ورودی **متن** است، نه شیء — و این نکتهٔ اصلی است. هر جا `res.json()`
 * صدا زده شود، کار از دست رفته؛ باید `res.text()` گرفت و این را صدا زد.
 */
export function parseJsonSafe(text, fields = ID_FIELDS) {
  return JSON.parse(quoteIdFields(text, fields));
}

/** خواندن یک پاسخ HTTP با همان قاعده. */
export async function readJsonSafe(response, fields = ID_FIELDS) {
  return parseJsonSafe(await response.text(), fields);
}

/**
 * شناسه به شکل رشتهٔ قابل‌اعتماد — یا `null` اگر قابل‌اعتماد نیست.
 *
 * `null` یعنی «این شناسه را نمی‌شود به کار برد»، نه «شناسه ندارد». عددی
 * که از مرز امن رد شده و به‌شکل `number` رسیده، ممکن است همان لحظه
 * گردشده باشد؛ به‌کار بردنش یعنی درخواست قیمت برای قراردادی که وجود
 * ندارد. شمردنش بهتر از استفاده‌اش است.
 */
export function safeId(value) {
  if (typeof value === 'string') {
    const s = value.trim();
    return /^\d{1,20}$/.test(s) ? s : null;
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return null;
    return Number.isSafeInteger(value) ? String(value) : null;
  }
  return null;
}
