// نگهبان مرز سرور — صحت‌سنجی هر چیزی که از بیرون می‌آید.
//
// سرور روی ۱۲۷٫۰٫۰٫۱ گوش می‌دهد، پس مهاجم شبکه ندارد. ولی «فقط محلی است»
// دلیل نمی‌شود ورودی صحت‌سنجی نشود: هر صفحه‌ای در همان مرورگر می‌تواند به
// این نقاط پایانی درخواست بدهد، و یک اشتباه در ساخت مسیر یعنی خواندن فایل
// بیرون از پوشه پروژه.
//
// این توابع خالص‌اند و بی‌نیاز از سرور آزمون می‌شوند. سرور فقط صدایشان
// می‌زند و به جواب اعتماد می‌کند.

import path from 'node:path';

/** کد ابزار تی‌اس‌ای‌تی‌ام‌سی فقط رقم است و طولش محدود. */
export function validIns(x) {
  return typeof x === 'string' && /^\d{1,32}$/.test(x);
}

/** تاریخ میلادی فشرده‌ای که می‌تواند امن داخل مسیر بالادست قرار بگیرد. */
export function validCompactDate(x) {
  return typeof x === 'string' && /^(?:19|20)\d{6}$/.test(x);
}

/**
 * مسیرهای تاریخ‌دار بالادست.
 *
 * مرز معماری در یک جدول: هر مسیری که `{date}` دارد، فقط برای روزِ
 * **تکمیل‌شده** است. این‌ها منبع لایو نیستند و نباید در طول همان روز
 * معاملاتی خوانده شوند — داده‌شان یا هنوز ساخته نشده یا هنوز نهایی نشده.
 *
 * جدول بودنش عمدی است. هفت تابع تقریباً یکسان، هفت جای فراموش‌کردنِ
 * اعتبارسنجی است؛ اینجا فقط یک دروازه هست و همه از آن رد می‌شوند.
 */
export const HISTORICAL_PATHS = {
  book:       (ins, date) => `/BestLimits/${ins}/${date}`,
  closing:    (ins, date) => `/ClosingPrice/GetClosingPriceHistory/${ins}/${date}`,
  daily:      (ins, date) => `/ClosingPrice/GetClosingPriceDaily/${ins}/${date}`,
  trades:     (ins, date) => `/Trade/GetTradeHistory/${ins}/${date}/true`,
  // ═══ چرا یک مسیرِ دومِ هم‌معنی ═══
  //
  // پرچمِ آخرِ `GetTradeHistory` در تابلو همیشه یک‌جور رفتار نمی‌کند: برای
  // بعضی ابزار/روزها نسخهٔ `true` فهرست خالی برمی‌گرداند و همان درخواست با
  // `false` ردیف دارد. تا امروز خالیِ اولی «بدون معامله» خوانده می‌شد و
  // دومی هرگز پرسیده نمی‌شد — یعنی یک پاسخِ خالی، به حسابِ واقعیتِ بازار
  // گذاشته می‌شد. این مسیر فقط وقتی به کار می‌رود که اولی خالی برگردد.
  tradesAlt:  (ins, date) => `/Trade/GetTradeHistory/${ins}/${date}/false`,
  state:      (ins, date) => `/MarketData/GetInstrumentState/${ins}/${date}`,
  threshold:  (ins, date) => `/MarketData/GetStaticThreshold/${ins}/${date}`,
  instrument: (ins, date) => `/Instrument/GetInstrumentHistory/${ins}/${date}`,
  clientType: (ins, date) => `/ClientType/GetClientTypeHistory/${ins}/${date}`,
};

export const HISTORICAL_KINDS = Object.keys(HISTORICAL_PATHS);

/** مسیر تاریخ‌دار، یا null اگر نوع یا کد یا تاریخ معتبر نباشد. */
export function historicalPath(kind, ins, date) {
  const build = Object.prototype.hasOwnProperty.call(HISTORICAL_PATHS, kind)
    ? HISTORICAL_PATHS[kind] : null;
  if (!build || !validIns(ins) || !validCompactDate(date)) return null;
  return build(ins, date);
}

/**
 * شناسهٔ جلسهٔ شبیه‌سازی.
 *
 * شناسه مستقیم نام فایل می‌شود، پس همان چیزی که `safeStaticPath` را لازم
 * کرد اینجا هم لازم است — با این تفاوت که اینجا اصلاً اجازهٔ جداکننده
 * نمی‌دهیم: نقطه و اسلش و بک‌اسلش هیچ‌کدام در مجموعهٔ مجاز نیستند، پس
 * «..» ساخته هم نمی‌شود.
 */
export function validSessionId(x) {
  return typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x);
}

/** مسیر تاریخچه تک‌معامله؛ فقط پس از اعتبارسنجی اجزای مسیر ساخته می‌شود. */
export function historicalTradesPath(ins, date) {
  return historicalPath('trades', ins, date);
}

/** همان، با پرچمِ دیگر — فقط برای وقتی که مسیر اول خالی برگردد. */
export function historicalTradesAltPath(ins, date) {
  return historicalPath('tradesAlt', ins, date);
}

/**
 * فهرست کد جداشده با ویرگول، با شرحِ آنچه افتاد.
 *
 * ═══ چرا این تابع شرح می‌دهد و `parseInsList` فقط فهرست می‌دهد ═══
 *
 * ممیزی ۱۴۰۵/۰۶/۲۹: نسخهٔ قبلی با رسیدن به سقف حلقه را **می‌شکست** و
 * ساکت برمی‌گشت — نه خطا، نه فهرستِ حذف‌شده‌ها. بازتولیدِ ۲۰۱ شناسه
 * دقیقاً ۲۰۰ تا برگرداند و شناسهٔ دویست‌ویکم بی‌صدا ناپدید شد.
 *
 * پیامدش از یک عددِ کم بدتر است: خروجی دیتا همهٔ کدها را یکجا به
 * `/api/dailies` می‌فرستد، پس برای بیش از ۲۰۰ ابزار **راست‌آزماییِ
 * خالی‌ها** برای انتهای انتخاب کور می‌شد — یعنی دقیقاً همان سازوکاری که
 * باید بگوید «داده نیامد»، خودش بی‌صدا از کار می‌افتاد.
 *
 * حالا شمارشِ سه‌گانه برمی‌گردد و سرور با آن تصمیم می‌گیرد:
 *   codes      کدهای معتبرِ یکتا، تا سقف
 *   requested  شمارِ کدهای معتبرِ یکتا پیش از سقف
 *   invalid    شمارِ تکه‌هایی که اصلاً کد نبودند
 *   overflow   چند کدِ معتبر به‌خاطر سقف جا ماندند
 */
export function parseInsRequest(raw, max = 200) {
  const seen = new Set();
  let invalid = 0;
  for (const part of String(raw ?? '').split(',')) {
    const code = part.trim();
    if (!code) continue;
    if (!validIns(code)) { invalid += 1; continue; }
    seen.add(code);
  }
  const all = [...seen];
  return {
    codes: all.slice(0, max),
    requested: all.length,
    invalid,
    overflow: Math.max(0, all.length - max),
  };
}

/**
 * فهرست کد جداشده با ویرگول. هر چیزی که کد معتبر نیست دور ریخته می‌شود،
 * تکراری حذف می‌شود، و تعداد سقف می‌خورد.
 *
 * سقف اینجا نه برای امنیت که برای مهار است: هر کد یک درخواست بالادست است.
 *
 * برای مسیری که باید اضافه‌درخواست را **رد** کند نه ببُرد،
 * `parseInsRequest` را صدا بزنید؛ این یکی فقط فهرست می‌دهد.
 */
export function parseInsList(raw, max = 200) {
  return parseInsRequest(raw, max).codes;
}

/**
 * مسیر امن زیر ریشه، یا null.
 *
 * نسخه قبلی با `file.startsWith(ROOT)` مرز می‌گرفت. آن مقایسه رشته‌ای است،
 * نه مقایسه مسیر، پس پوشه هم‌نام‌شروع کنار ریشه از آن رد می‌شد:
 *
 *   ریشه   /x/options-radar
 *   قبول   /x/options-radar-private/secret.env     ← همان پیشوند را دارد
 *
 * `path.relative` این را نمی‌گذارد: هر مسیری بیرون از ریشه، مسیر نسبی‌اش
 * با «..» شروع می‌شود.
 *
 * رمزگشایی درصدی هم لازم است، وگرنه %2e%2e%2f همان ../ است و از فیلتر
 * می‌گذرد چون نرمال‌سازی بعد از رمزگشایی انجام می‌شود نه قبلش.
 */
export function safeStaticPath(root, pathname, indexFile = '/ui/index.html') {
  if (typeof pathname !== 'string') return null;

  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel.includes('\0')) return null;                 // بایت صفر، مسیر را در لایه‌های پایین می‌برد
  if (rel === '' || rel === '/') rel = indexFile;
  if (!rel.startsWith('/')) rel = `/${rel}`;

  const file = path.resolve(root, `.${rel}`);
  const inside = path.relative(root, file);
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return file;
}

export class BodyTooLarge extends Error {
  constructor(limit) {
    super(`بدنه درخواست از سقف ${limit} بایت گذشت`);
    this.name = 'BodyTooLarge';
    this.limit = limit;
  }
}

/**
 * بدنه درخواست با سقف.
 *
 * نسخه قبلی تا هر اندازه‌ای در حافظه جمع می‌کرد. یک درخواست تنها می‌توانست
 * حافظه را پر کند. سقف حین دریافت سنجیده می‌شود نه بعدش، وگرنه سقف کاری
 * نکرده است.
 */
export async function readBody(stream, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) throw new BodyTooLarge(maxBytes);
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}
