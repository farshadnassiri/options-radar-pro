// آماره‌های انتخابی، با و بدون وزن.
//
// کاربر می‌خواهد بتواند بپرسد «میانهٔ بازده این دسته چند بود؟» و بعد همان
// سؤال را با «میانگین» یا «کمترین» تکرار کند، و گاهی هم بخواهد ترکیب‌های
// پرمعامله وزن بیشتری داشته باشند. این فایل فقط همین است — و یک قاعده:
//
//   نمونهٔ نامعتبر شمرده نمی‌شود، ولی شمارشش گزارش می‌شود.
//
// آماره‌ای که روی سه نمونه از بیست نمونه ساخته شده با آماره‌ای که روی هر
// بیست‌تا ساخته شده فرق دارد، و کسی که فقط عدد را می‌بیند این فرق را
// نمی‌بیند. پس هر خروجی، `samples` و `skipped` را هم با خودش می‌برد.

export const PORTFOLIO_STATS_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

export const STATISTICS = [
  { id: 'median', label: 'میانه', hint: 'مقاوم به پرت؛ نیمی بالاتر، نیمی پایین‌تر' },
  { id: 'mean', label: 'میانگین', hint: 'حساس به پرت، ولی جمع‌پذیر' },
  { id: 'min', label: 'کمترین', hint: 'بدترین نمونهٔ دسته' },
  { id: 'max', label: 'بیشترین', hint: 'بهترین نمونهٔ دسته' },
  { id: 'p25', label: 'چارک پایین', hint: 'یک‌چهارم نمونه‌ها از این بدتر بوده‌اند' },
  { id: 'p75', label: 'چارک بالا', hint: 'یک‌چهارم نمونه‌ها از این بهتر بوده‌اند' },
];

export const DEFAULT_STATISTIC = 'median';

const STAT_BY_ID = new Map(STATISTICS.map((row) => [row.id, row]));

export const normalizeStatistic = (id) => (STAT_BY_ID.has(String(id ?? '')) ? String(id) : DEFAULT_STATISTIC);
export const statisticMeta = (id) => STAT_BY_ID.get(String(id ?? '')) || null;

export const WEIGHTINGS = [
  { id: 'equal', label: 'هم‌وزن', hint: 'هر ترکیب یک رأی؛ ساده و بی‌طرف' },
  {
    id: 'value',
    label: 'وزن ارزش معامله',
    hint: 'ترکیبی که روز ورود بیشتر معامله شده، بیشتر شمرده می‌شود؛ اگر ارزش هیچ ترکیبی ثبت نشده باشد، دسته وزن نمی‌گیرد',
  },
];

export const DEFAULT_WEIGHTING = 'equal';

const WEIGHT_BY_ID = new Map(WEIGHTINGS.map((row) => [row.id, row]));
export const normalizeWeighting = (id) => (WEIGHT_BY_ID.has(String(id ?? '')) ? String(id) : DEFAULT_WEIGHTING);
export const weightingMeta = (id) => WEIGHT_BY_ID.get(String(id ?? '')) || null;

/**
 * چندک وزن‌دار — تعریف «مرکز جرم».
 *
 * وزن‌ها تجمعی می‌شوند و مرزِ `q` روی **مرکز** وزن هر نمونه می‌افتد، با
 * درون‌یابی خطی بین دو مرکز مجاور.
 *
 * چرا این تعریف و نه تعریف درون‌یابی نوع ۷ که `holdingPeriodProfile` به کار
 * می‌برد: در نوع ۷، دو نمونه با وزن‌های ۹ و ۱ همان میانه‌ای را می‌دهند که
 * دو نمونهٔ هم‌وزن می‌دهند — یعنی وزن عملاً نادیده گرفته می‌شود. وقتی کل
 * هدفِ این قابلیت این است که ترکیب‌های پرمعامله سنگین‌تر شمرده شوند، تعریفی
 * که وزن را بی‌اثر می‌کند به درد نمی‌خورد.
 *
 * بهایش این است که برای نمونه‌های هم‌وزن، چارک‌ها اندکی با جدول «افق
 * نگهداری» در تب آزمایشگاه فرق می‌کنند: آنجا چارکِ [۱،۲،۳،۴] می‌شود ۱٫۷۵ و
 * اینجا ۱٫۵. هر دو تعریف استاندارد‌اند؛ این یکی وزن را محترم می‌شمارد.
 */
function weightedQuantile(pairs, q) {
  if (!pairs.length) return null;
  const sorted = [...pairs].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, row) => sum + row.weight, 0);
  if (!(total > 0)) return null;
  const target = q * total;
  let seen = 0;
  for (let index = 0; index < sorted.length; index++) {
    const half = sorted[index].weight / 2;
    const centre = seen + half;
    if (target <= centre) {
      if (index === 0) return sorted[0].value;
      const previous = sorted[index - 1];
      const previousCentre = seen - (previous.weight / 2);
      const span = centre - previousCentre;
      if (!(span > 0)) return sorted[index].value;
      const share = (target - previousCentre) / span;
      return previous.value + ((sorted[index].value - previous.value) * share);
    }
    seen += sorted[index].weight;
  }
  return sorted.at(-1).value;
}

/**
 * یک آماره روی مجموعه‌ای از `{ value, weight }`.
 *
 * `weight` نامعتبر یا نامثبت، نمونه را از وزن‌دهی بیرون می‌گذارد نه از
 * آماره: با وزن‌دهی هم‌وزن همچنان شمرده می‌شود. اگر وزن‌دهی «ارزش» خواسته
 * شده باشد و هیچ نمونه‌ای وزن معتبر نداشته باشد، خروجی `null` است و دلیلش
 * گفته می‌شود — نه اینکه بی‌صدا به هم‌وزن برگردد و کاربر خیال کند وزن‌دهی
 * اعمال شده است.
 */
export function statOf(samples, statistic = DEFAULT_STATISTIC, weighting = DEFAULT_WEIGHTING) {
  const stat = normalizeStatistic(statistic);
  const mode = normalizeWeighting(weighting);
  const list = Array.isArray(samples) ? samples : [];
  const pairs = [];
  let skipped = 0;
  let weightless = 0;
  for (const item of list) {
    const value = finite(item?.value);
    if (value === null) { skipped += 1; continue; }
    const raw = finite(item?.weight);
    const weight = mode === 'value' ? (raw !== null && raw > 0 ? raw : null) : 1;
    if (weight === null) { weightless += 1; continue; }
    pairs.push({ value, weight });
  }
  const base = { statistic: stat, weighting: mode, samples: pairs.length, skipped, weightless };
  if (!pairs.length) {
    return {
      ...base,
      value: null,
      why: mode === 'value' && weightless > 0
        ? 'هیچ ترکیبی در این دسته ارزش معاملهٔ ثبت‌شده ندارد'
        : 'نمونهٔ معتبری در این دسته نیست',
    };
  }
  let value = null;
  if (stat === 'mean') {
    const total = pairs.reduce((sum, row) => sum + row.weight, 0);
    value = total > 0 ? pairs.reduce((sum, row) => sum + (row.value * row.weight), 0) / total : null;
  } else if (stat === 'min') value = Math.min(...pairs.map((row) => row.value));
  else if (stat === 'max') value = Math.max(...pairs.map((row) => row.value));
  else if (stat === 'p25') value = weightedQuantile(pairs, 0.25);
  else if (stat === 'p75') value = weightedQuantile(pairs, 0.75);
  else value = weightedQuantile(pairs, 0.5);
  return { ...base, value, why: '' };
}

/** میانهٔ ساده — برای جاهایی که وزن و انتخاب آماره معنا ندارد. */
export function medianOf(values) {
  const list = (Array.isArray(values) ? values : []).map(finite).filter((value) => value !== null);
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** میانگین ساده. */
export function meanOf(values) {
  const list = (Array.isArray(values) ? values : []).map(finite).filter((value) => value !== null);
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}
