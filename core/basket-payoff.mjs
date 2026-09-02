// بازده سبد در برابر قیمت نماد پایه — شکل‌دادن داده، جدا از رسم.
//
// همهٔ نمودارهای دیگرِ سبد محور افقی‌شان زمان است. این یکی زمان را از محور
// برمی‌دارد و قیمت نماد پایه را می‌گذارد: «وقتی سهم اینجا بود، سبد کجا
// بود؟» — همان منحنی سود و زیانی که هر معامله‌گر اختیار در ذهن دارد، ولی
// از دادهٔ واقعیِ همان دوره، نه از فرمولِ سررسید.
//
// دو تفاوت با منحنی سررسیدِ کتابی، که پنهان نمی‌شوند:
//
//   این منحنی **مسیر** است نه تابع. یک قیمت می‌تواند چند بار تکرار شود و
//   هر بار بازده متفاوتی داشته باشد، چون ارزش زمانی و نوسان‌پذیری هم عوض
//   شده‌اند. برای همین نقطه‌ها به ترتیب زمان به هم وصل می‌شوند و رنگشان
//   زمان را می‌گوید؛ وگرنه خطی که از روی خودش رد می‌شود خوانا نیست.
//
//   لحظه‌ای که قیمت پایه یا ارزش سبد معلوم نیست، نقطه‌ای ندارد. جایش با
//   قیمت لحظهٔ قبل پر نمی‌شود — همان قاعده‌ای که کل برنامه دارد: خالی صفر
//   نیست و خالی، «مثل قبلی» هم نیست.

const num = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

export const MIN_BIN_POINTS = 12;
export const DEFAULT_BINS = 24;

/**
 * نقطه‌های نمودار، به ترتیب زمان.
 *
 * `skipped` می‌گوید چند لحظه جا ماند و چرا — بی این عدد، نمودارِ کم‌نقطه
 * از نمودارِ کم‌داده قابل تشخیص نیست.
 */
export function payoffPoints({ basket = null, basePrices = [], labels = [] } = {}) {
  const path = basket?.path || [];
  const prices = Array.isArray(basePrices) ? basePrices : [];
  const points = [];
  let noPrice = 0, noReturn = 0, noBoth = 0;
  for (let index = 0; index < path.length; index += 1) {
    const raw = num(prices[index]);
    const price = raw !== null && raw > 0 ? raw : null;
    const pct = num(path[index]?.returnPct);
    if (price === null && pct === null) { noBoth += 1; continue; }
    if (price === null) { noPrice += 1; continue; }
    if (pct === null) { noReturn += 1; continue; }
    points.push({ index, price, pct, label: String(labels[index] ?? '') });
  }
  const priceList = points.map((point) => point.price);
  const pctList = points.map((point) => point.pct);
  return {
    points,
    skipped: { noPrice, noReturn, noBoth, total: noPrice + noReturn + noBoth },
    // قیمت ورود، نه کمینهٔ محور: خط عمودیِ نمودار باید جایی باشد که معامله
    // از آنجا شروع شد، و آن نخستین لحظهٔ **دارای نقطه** است.
    entryPrice: points[0]?.price ?? null,
    finalPrice: points.at(-1)?.price ?? null,
    finalPct: points.at(-1)?.pct ?? null,
    priceRange: priceList.length ? [Math.min(...priceList), Math.max(...priceList)] : null,
    pctRange: pctList.length ? [Math.min(...pctList), Math.max(...pctList)] : null,
  };
}

/**
 * میانگین بازده در هر پلهٔ قیمت.
 *
 * وقتی دانه‌بندی یک‌دقیقه‌ای است، سیصد نقطه روی هم می‌افتند و مسیر خوانا
 * نیست. این خط می‌گوید «در این محدودهٔ قیمت، سبد به‌طور میانگین کجا بود» —
 * و چون میانگین است، شمارِ نمونه‌اش هم می‌آید تا پله‌ای که یک نقطه دارد با
 * پله‌ای که سی نقطه دارد یکسان خوانده نشود.
 *
 * پلهٔ بی‌نمونه ردیف نمی‌گیرد؛ صفر نیست، نبود است.
 */
export function payoffBins(points = [], bins = DEFAULT_BINS) {
  const list = Array.isArray(points) ? points : [];
  const count = Math.max(2, Math.trunc(num(bins) ?? DEFAULT_BINS));
  if (list.length < MIN_BIN_POINTS) return [];
  const prices = list.map((point) => point.price);
  const low = Math.min(...prices), high = Math.max(...prices);
  if (!(high > low)) return [];
  const width = (high - low) / count;
  const buckets = Array.from({ length: count }, () => ({ sum: 0, samples: 0, low: 0, high: 0 }));
  for (let index = 0; index < count; index += 1) {
    buckets[index].low = low + (width * index);
    buckets[index].high = low + (width * (index + 1));
  }
  for (const point of list) {
    // آخرین قیمت دقیقاً روی مرز بالاست و `floor` آن را به پلهٔ ناموجودِ
    // بعدی می‌فرستد؛ به پلهٔ آخر چسبانده می‌شود.
    const slot = Math.min(count - 1, Math.floor((point.price - low) / width));
    buckets[slot].sum += point.pct;
    buckets[slot].samples += 1;
  }
  return buckets
    .filter((bucket) => bucket.samples > 0)
    .map((bucket) => ({
      price: (bucket.low + bucket.high) / 2,
      low: bucket.low, high: bucket.high,
      pct: bucket.sum / bucket.samples,
      samples: bucket.samples,
    }));
}

/**
 * حساسیت سبد به قیمت پایه — شیب خط برازش، بر حسب «درصد بازده به ازای هر
 * یک درصد حرکت پایه».
 *
 * برای سبد اختیار این عدد ثابت نیست و همین است که مهم است: عددِ نزدیک صفر
 * یعنی سبد واقعاً خنثی به جهت بوده، و عددِ بزرگ یعنی آنچه «استراتژی
 * غیرجهت‌دار» نامیده می‌شد، در عمل یک شرط جهت‌دار بوده.
 *
 * کمتر از دو نقطه، یا قیمتی که اصلاً تکان نخورده، شیب ندارد — `null`.
 */
export function payoffSlope(points = [], entryPrice = null) {
  const list = (Array.isArray(points) ? points : []).filter((point) => num(point?.price) > 0);
  const base = num(entryPrice) ?? list[0]?.price ?? null;
  if (list.length < 2 || base === null || !(base > 0)) return null;
  const xs = list.map((point) => ((point.price / base) - 1) * 100);
  const ys = list.map((point) => point.pct);
  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let top = 0, bottom = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = xs[index] - meanX;
    top += dx * (ys[index] - meanY);
    bottom += dx * dx;
  }
  if (!(bottom > 0)) return null;
  return top / bottom;
}
