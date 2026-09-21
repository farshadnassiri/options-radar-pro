// دسته‌بندی فهرست ابزار، و کنترلِ اینکه هیچ کدی جا نماند.
//
// ═══ چرا این ماژول لازم شد ═══
//
// ممیزی ۱۴۰۵/۰۶/۲۹، بند ۴: سقفِ هر مسیرِ دسته‌ای در سرور بی‌صدا **می‌بُرید**.
// ۲۰۱ شناسه می‌رفت و ۲۰۰ تا برمی‌گشت. حالا سرور اضافه‌درخواست را با ۴۱۳ رد
// می‌کند — ولی ردِ صریح تنها نیمی از کار است: مصرف‌کننده باید بتواند فهرستِ
// بلند را **درست** دسته کند، و مهم‌تر، بگوید هر کدِ درخواست‌شده چه شد.
//
// ═══ چرا «پاسخ آمد» با «کد جواب گرفت» یکی نیست ═══
//
// مسیرهای دسته‌ای پاسخشان یک شیء کلید‌دار است. کدی که کلیدش در پاسخ نیست،
// در مصرف‌کننده به «داده‌ای نداشت» ترجمه می‌شد — یعنی یک شکستِ دریافت به
// یک ادعای غلط دربارهٔ بازار تبدیل می‌شد. `missingInsCodes` همان شکاف را
// نام می‌برد تا بالا برود و دیده شود (معیار پذیرشِ ۲ و ۷ ممیزی).
//
// سقف‌ها از خودِ سرور می‌آیند و اینجا تکرار شده‌اند چون مرورگر
// `server/guard.mjs` را وارد نمی‌کند؛ دستهٔ ۲۷۷ هر دو طرف را کنار هم
// می‌گذارد تا از هم دور نیفتند.

/** سقف هر درخواست، به تفکیک مسیر. همان اعدادی که سرور اعمال می‌کند. */
export const INS_CAP = {
  liveTrades: 24,
  hist: 60,
  dailies: 200,
  books: 200,
  infos: 200,
};

/**
 * فهرست کد را به دسته‌های هم‌اندازه می‌شکند، بی آنکه چیزی بیفتد.
 *
 * تکراری‌ها یک بار می‌آیند (سرور هم همین کار را می‌کند، پس دستهٔ ۲۰۱تایی
 * که ۲ تکراری دارد در واقع ۱۹۹ کد است و نباید بی‌دلیل دو تکه شود) و
 * رشتهٔ خالی کنار می‌رود.
 */
export function insBatches(codes = [], cap = 200) {
  const size = Math.max(1, Math.trunc(Number(cap) || 0) || 200);
  const seen = new Set();
  for (const code of codes || []) {
    const text = String(code ?? '').trim();
    if (text) seen.add(text);
  }
  const all = [...seen];
  const out = [];
  for (let at = 0; at < all.length; at += size) out.push(all.slice(at, at + size));
  return out;
}

/**
 * کدهایی که درخواست رفتند و در پاسخ کلیدی ندارند.
 *
 * `payload` همان شیءِ کلید‌دارِ مسیرهای دسته‌ای است. خروجی فهرستِ کدهای
 * گمشده است — خالی یعنی «هر کدِ درخواست‌شده یک ردیف دارد»، که تنها شکلِ
 * قابل‌قبول است.
 */
export function missingInsCodes(requested = [], payload = {}) {
  const has = payload && typeof payload === 'object' ? payload : {};
  const seen = new Set();
  const out = [];
  for (const code of requested || []) {
    const text = String(code ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (!Object.prototype.hasOwnProperty.call(has, text)) out.push(text);
  }
  return out;
}

/**
 * چند دسته‌پاسخ را در یک شیء جمع می‌کند و گمشده‌ها را نام می‌برد.
 *
 * خروجی: `{ payload, missing, batches }`. مصرف‌کننده هرگز نباید فقط
 * `payload` را بردارد و `missing` را دور بریزد؛ همان دور ریختن بود که
 * بند ۷ ممیزی را ساخت.
 */
export function mergeInsPayloads(requested = [], parts = []) {
  const payload = {};
  for (const part of parts || []) {
    if (!part || typeof part !== 'object') continue;
    for (const [code, value] of Object.entries(part)) payload[code] = value;
  }
  // ═══ R5-09: «پاسخ گرفت» با «ردیف داد» یکی نیست ═══
  //
  // `missing` فقط کدهایی را می‌شمرد که اصلاً در پاسخ نبودند. ولی بالادست
  // وقتی سهمیه را می‌بندد، پاسخِ **موفق با آرایهٔ خالی** می‌دهد — پس هر
  // کد در پاسخ هست و `missing` صفر می‌شود.
  //
  // در فایلِ واقعیِ ۲۰۲۶۰۷۱۴ تا ۲۰۲۶۰۹۲۱ همین شد: از ۱۵۹ ابزار فقط ۱۰
  // تا تابلوی روزانه داشتند، و برگ راهنما نوشت «هر ابزارِ درخواست‌شده
  // تابلوی روزانه‌اش پاسخ گرفت». جمله درست بود و معنایش غلط.
  const blank = (requested || []).map(String)
    .filter((code) => {
      const value = payload[code];
      if (!value) return false;                       // این «نبود» است، نه «خالی»
      const rows = Array.isArray(value?.rows) ? value.rows : (Array.isArray(value) ? value : null);
      return Array.isArray(rows) && rows.length === 0;
    });
  return {
    payload, missing: missingInsCodes(requested, payload),
    blank, batches: (parts || []).length,
  };
}
