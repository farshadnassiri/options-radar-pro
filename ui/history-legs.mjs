// قاعده‌های انتخابِ دستیِ پاها در «تحلیل تاریخی استراتژی».
//
// ═══ چرا بیرون از تب ═══
//
// این دو قاعده تصمیم‌های واقعی‌اند — کدام قرارداد پیش‌فرض باشد، و کِی ترکیب
// اصلاً معتبر نیست — ولی داخل `mount` هیچ‌کدام آزمون‌پذیر نبودند. درسِ
// ثبت‌شدهٔ همین مخزن: «آزمونِ تابع، جای‌نگه‌دار و مرزِ نمایش را نمی‌بیند»؛
// و چیزی که اصلاً وارد نمی‌شود، حتی آزمونِ تابع هم ندارد.
//
// وابستگیِ نسبی است، نه `/ui/...`: همان قاعده‌ای که `ui/handoff.mjs` و
// `ui/strategy-history.mjs` را در Node قابل اجرا نگه می‌دارد.

const num = (value) => Number(value);

/**
 * قراردادِ پیش‌فرضِ یک پا.
 *
 * ═══ ایرادی که این تابع برای آن ساخته شد ═══
 *
 * گزارش ۱۴۰۵/۰۶/۱۷: «دو انتخابگر پای Bull Call Spread به‌صورت پیش‌فرض یک
 * قرارداد یکسان را انتخاب می‌کنند … این حالت از نظر ساختار اسپرد هم معتبر
 * نیست.» هر دو انتخابگر همان فهرست را می‌گرفتند و هیچ پیش‌فرضی نمی‌خورد،
 * پس هر دو روی گزینهٔ اول می‌نشستند.
 *
 * خودِ استراتژی جواب را دارد: `slot` می‌گوید این پا کدام قیمتِ اعمال است —
 * موتور هم با `set[t.slot - 1]` همین را می‌خواند. پس پیش‌فرض،
 * `slot`اُمین قیمتِ اعمالِ **متمایز** است.
 *
 * `hasSeries` می‌گوید کدام قرارداد در بازهٔ بارگذاری‌شده قیمت دارد. اگر
 * هیچ‌کدام نداشته باشند، فهرستِ کامل مبنا می‌شود: پیش‌فرضِ ساختاراً درست از
 * پیش‌فرضِ تصادفی بهتر است، حتی وقتی قیمتی در کار نیست.
 */
export function defaultLegIns(list = [], leg = {}, hasSeries = () => false) {
  const pool0 = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!pool0.length) return '';
  const priced = pool0.filter((c) => hasSeries(String(c.ins)) === true);
  const pool = priced.length ? priced : pool0;
  const strikes = [...new Set(pool.map((c) => num(c.strike)))].sort((a, b) => a - b);
  const slot = Math.max(1, Math.trunc(num(leg.slot) || 1));
  const want = strikes[Math.min(slot - 1, strikes.length - 1)];
  return String((pool.find((c) => num(c.strike) === want) || pool[0]).ins);
}

/**
 * چرا این انتخاب معتبر نیست — یا رشتهٔ خالی وقتی هست.
 *
 * دو پایی که در استراتژی دو قیمتِ اعمال (یا دو سررسید) متفاوت‌اند، نباید یک
 * قرارداد باشند: آن‌وقت ترکیب روی خودش خنثی می‌شود و هر عددی که موتور
 * بسازد بی‌معنی است. جلوگیری پیش از محاسبه، از توضیحِ بعدِ محاسبه بهتر است.
 */
export function manualLegProblem(defLegs = [], chosen = []) {
  const need = (Array.isArray(defLegs) ? defLegs : []).filter((t) => t?.kind !== 'underlying');
  const picked = (Array.isArray(chosen) ? chosen : []).filter((x) => x && x.ins);
  if (picked.length < need.length) return 'برای هر پا یک قرارداد انتخاب کن.';
  for (let a = 0; a < picked.length; a += 1) {
    for (let b = a + 1; b < picked.length; b += 1) {
      const same = String(picked[a].ins) === String(picked[b].ins);
      const shouldDiffer = picked[a].slot !== picked[b].slot || picked[a].exp !== picked[b].exp;
      if (same && shouldDiffer) {
        return 'دو پای این استراتژی باید دو قرارداد متفاوت باشند؛ الان هر دو یکی‌اند.';
      }
    }
  }
  return '';
}
