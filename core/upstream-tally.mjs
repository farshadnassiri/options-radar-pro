// شمارشِ بارِ بالادست، به تفکیکِ سرویس.
//
// ═══ چرا عددِ کل کافی نیست ═══
//
// گزارش عملیاتیِ ۱۴۰۵/۰۶/۱۶: «در حدود ۱۸ دقیقه تست، سلامت سرور ۲۰۸۲ درخواست،
// ۳۹۴ cache hit، ۵۶۷ انتظار سهمیه و ۱۵۷ خطای HTTP 502 ثبت کرد … عمدهٔ خطاها
// هنگام باز شدن مقصدهای تاریخی/ساخت دفتر رخ داد.»
//
// «عمدتاً» یعنی حدس. با چهار عددِ کل نمی‌شود گفت کدام سرویس سهمیه را خورده،
// پس هر تصمیمی دربارهٔ کم‌کردن بار — کشِ دیسکی، سقفِ هم‌زمانی، TTL بلندتر —
// روی حدس ساخته می‌شود. صاحب پروژه هم همین را صریح گفته بود: «⚠ اول اندازه
// بگیر.»
//
// این ماژول ابزارِ همان اندازه‌گیری است و هیچ سیاستی اعمال نمی‌کند: فقط
// می‌گوید هر سرویس چند درخواست، چند خطا و چند کش‌خور داشته.
//
// خالص و بی‌وابستگی است تا آزمون‌پذیر بماند؛ سرور فقط صدایش می‌زند.

/**
 * خانوادهٔ یک مسیرِ بالادست — مسیر بدون شناسه‌ها.
 *
 * شناسهٔ ابزار و شمارهٔ روز و تاریخِ فشرده همه عددی‌اند، پس هر قطعهٔ کاملاً
 * عددی به `*` تبدیل می‌شود. `/ClosingPrice/GetClosingPriceDailyList/۱۷۹…/0`
 * و همان مسیر برای هر قرارداد دیگر، یک خانواده‌اند — و همین است که سؤال
 * «کدام سرویس؟» را جواب می‌دهد.
 *
 * پرسمان (`?…`) بریده می‌شود: `_=<timestamp>` ضدِ کشِ CDN است نه بخشی از
 * هویتِ سرویس.
 */
export function upstreamFamily(pathname) {
  const clean = String(pathname ?? '').split('?')[0].split('#')[0];
  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return '/';
  return `/${parts.map((part) => (/^\d+$/.test(part) ? '*' : part)).join('/')}`;
}

const ZERO = () => ({ requests: 0, errors: 0, cacheHits: 0 });

/**
 * شمارندهٔ زندهٔ سرور.
 *
 * `snapshot()` مرتب‌شده بر اساس درخواست برمی‌گردد، چون سؤالِ همیشگی «کدام
 * سرویس بیشترین بار را داشت» است. `limit` جلوی بزرگ‌شدنِ بی‌مرزِ پاسخِ
 * سلامت را می‌گیرد.
 */
export function makeUpstreamTally() {
  const byFamily = new Map();
  const bucket = (pathname) => {
    const key = upstreamFamily(pathname);
    let row = byFamily.get(key);
    if (!row) { row = ZERO(); byFamily.set(key, row); }
    return row;
  };
  return {
    request: (pathname) => { bucket(pathname).requests += 1; },
    error: (pathname) => { bucket(pathname).errors += 1; },
    cacheHit: (pathname) => { bucket(pathname).cacheHits += 1; },
    /** پرمصرف‌ترین سرویس‌ها، بیشترین اول. */
    snapshot(limit = 12) {
      return [...byFamily.entries()]
        .map(([family, row]) => ({ family, ...row }))
        .sort((a, b) => b.requests - a.requests || b.errors - a.errors)
        .slice(0, Math.max(0, limit));
    },
    /** سرویسی که بیشترین خطا را داده، یا `null` وقتی هیچ خطایی نبوده. */
    worstError() {
      let worst = null;
      for (const [family, row] of byFamily) {
        if (!row.errors) continue;
        if (!worst || row.errors > worst.errors) worst = { family, ...row };
      }
      return worst;
    },
    reset() { byFamily.clear(); },
  };
}
