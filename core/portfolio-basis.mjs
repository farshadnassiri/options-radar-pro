// مبنای بازده — مخرج کسر، صریح و انتخابی.
//
// یک عدد درصدی بدون نامِ مخرجش، عدد نیست؛ شایعه است. «۲۲۰٪ سود» روی بدهکار
// پرداختی یعنی یک چیز و روی ارزش اسمی قرارداد یعنی چیز کاملاً دیگری، و
// «−۱۴۵٪ زیان» هم غلط نیست: در فروش برهنه، زیان سقف ندارد ولی وجه تضمینِ
// بلوکه‌شده دارد، پس نسبتشان به‌سادگی از ۱۰۰ رد می‌شود.
//
// راه‌حل، بریدن عدد روی ۱۰۰− نیست — آن جعلِ داده است. راه‌حل این است که
// مخرج نام داشته باشد، کاربر بتواند عوضش کند، و هر جا زیان از مخرج رد شد
// خودِ گزارش این را بگوید نه اینکه پنهانش کند.
//
// یک قاعده در سراسر این فایل: مخرجِ نامعلوم یا نامثبت، بازدهِ `null`
// می‌سازد و دلیلش را می‌گوید. هرگز به مبنای دیگری نمی‌افتد و هرگز صفر
// نمی‌شود — `Number(null)` صفر است و همین‌جا بارها گاز گرفته است.

export const RETURN_BASIS_VERSION = 1;

/** مخرجی که هیچ‌وقت جای دیگری نمی‌نشیند. */
const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const EPS = 1e-9;

export const BASIS_REASONS = {
  missing: 'مخرج در دادهٔ ورود ثبت نشده است',
  nonPositive: 'مخرج صفر یا منفی است و کسر معنا ندارد',
  unknownBasis: 'مبنای خواسته‌شده تعریف نشده است',
  noPnl: 'سود یا زیان این ردیف عدد معتبر نیست',
};

/**
 * چهار مبنا، به ترتیبی که یک معامله‌گر سراغشان می‌رود.
 *
 * `floor` می‌گوید آیا −۱۰۰٪ روی این مبنا کفِ نظری است یا نه. برای مبناهایی
 * که کف دارند، عبور از ۱۰۰− نشانهٔ چیز عجیبی است؛ برای بقیه، وضع عادی است.
 */
export const RETURN_BASES = [
  {
    id: 'gross',
    label: 'سرمایهٔ درگیر ناخالص',
    short: 'درگیر ناخالص',
    hint: 'وجه تضمین بلوکه‌شده به‌علاوهٔ بدهکار پرداختی، پیش از کسر پریمیوم دریافتی',
    floor: true,
  },
  {
    id: 'net',
    label: 'سرمایهٔ درگیر خالص',
    short: 'درگیر خالص',
    hint: 'همان مخرج تاریخی برنامه: وجه تضمین پس از کسر پریمیوم، یا بیشترین زیان ممکن',
    floor: false,
  },
  {
    id: 'cash',
    label: 'پریمیوم یا بدهکار خالص',
    short: 'نقد خالص',
    hint: 'قدر مطلق پول جابه‌جاشدهٔ لحظهٔ ورود؛ «چند برابر آنچه گرفتم یا دادم»',
    floor: false,
  },
  {
    id: 'notional',
    label: 'ارزش اسمی قرارداد',
    short: 'ارزش اسمی',
    hint: 'قیمت پایه × اندازهٔ قرارداد × تعداد؛ اثر اهرم را از عدد بیرون می‌کشد',
    floor: false,
  },
];

export const DEFAULT_RETURN_BASIS = 'gross';

const BY_ID = new Map(RETURN_BASES.map((row) => [row.id, row]));

/** مبنای معتبر، وگرنه پیش‌فرض. برای خواندن ورودی کاربر. */
export function normalizeBasis(basisId) {
  return BY_ID.has(String(basisId ?? '')) ? String(basisId) : DEFAULT_RETURN_BASIS;
}

export function basisMeta(basisId) {
  return BY_ID.get(String(basisId ?? '')) || null;
}

/**
 * مقدار مخرج برای یک ورود.
 *
 * `entry` همان چیزی است که موتور تاریخ در `replay.entry` می‌سازد و ورکر
 * عیناً حملش می‌کند: `marginGross`، `marginNet`، `netCash`، `capital`،
 * `notional`.
 */
export function basisDenominator(entry, basisId) {
  const meta = basisMeta(basisId);
  if (!meta) return { ok: false, value: null, basisId: String(basisId ?? ''), label: '', why: BASIS_REASONS.unknownBasis };

  const marginGross = finite(entry?.marginGross);
  const marginNet = finite(entry?.marginNet);
  const netCash = finite(entry?.netCash);
  const capital = finite(entry?.capital);
  const notional = finite(entry?.notional);

  let value = null;
  if (meta.id === 'gross') {
    // بدهکار پرداختی هم پول درگیر است، حتی وقتی کارگزار چیزی بلوکه نمی‌کند:
    // خرید کال، وجه تضمین صفر دارد ولی همهٔ پولش رفته است.
    const debit = netCash === null ? null : Math.max(0, -netCash);
    value = marginGross === null || debit === null ? null : marginGross + debit;
  } else if (meta.id === 'net') {
    value = capital;
  } else if (meta.id === 'cash') {
    value = netCash === null ? null : Math.abs(netCash);
  } else if (meta.id === 'notional') {
    value = notional;
  }

  if (value === null) {
    return { ok: false, value: null, basisId: meta.id, label: meta.label, why: BASIS_REASONS.missing };
  }
  if (!(value > EPS)) {
    return { ok: false, value, basisId: meta.id, label: meta.label, why: BASIS_REASONS.nonPositive };
  }
  return { ok: true, value, basisId: meta.id, label: meta.label, why: '' };
}

/**
 * بازده روی مبنای خواسته‌شده.
 *
 * `beyondBasis` وقتی درست است که زیان از خودِ مخرج رد شده باشد. این پرچم
 * جای بریدن عدد را می‌گیرد: عدد واقعی می‌ماند و رابط می‌تواند کنارش
 * توضیح بگذارد که چرا از ۱۰۰− گذشته است.
 */
export function returnOnBasis(netPnl, entry, basisId) {
  const pnl = finite(netPnl);
  const den = basisDenominator(entry, basisId);
  if (!den.ok) {
    return { pct: null, ok: false, basisId: den.basisId, basisLabel: den.label, denominator: den.value, beyondBasis: false, why: den.why };
  }
  if (pnl === null) {
    return { pct: null, ok: false, basisId: den.basisId, basisLabel: den.label, denominator: den.value, beyondBasis: false, why: BASIS_REASONS.noPnl };
  }
  const pct = (pnl / den.value) * 100;
  return {
    pct, ok: true,
    basisId: den.basisId, basisLabel: den.label, denominator: den.value,
    beyondBasis: pct < -100,
    why: '',
  };
}

/**
 * ارزش اسمی یک ترکیب: قیمت پایه × مجموع اندازهٔ کنترل‌شده.
 *
 * فقط از پاهای قیمت‌خورده ساخته می‌شود. اگر قیمت پایه یا اندازهٔ یک پا
 * نامعلوم باشد، کل عدد `null` می‌ماند — نه اینکه آن پا صفر شمرده شود و
 * ارزش اسمی بی‌صدا کوچک‌تر از واقع دربیاید.
 */
export function notionalOf(legs, spot, units = 1) {
  const price = finite(spot);
  const count = finite(units);
  if (price === null || !(price > 0) || count === null || !(count > 0)) return null;
  const list = Array.isArray(legs) ? legs : [];
  if (!list.length) return null;
  let total = 0;
  for (const leg of list) {
    const size = finite(leg?.size);
    const ratio = finite(leg?.ratio);
    if (size === null || ratio === null) return null;
    total += Math.abs(ratio) * Math.abs(size);
  }
  if (!(total > 0)) return null;
  return price * total * count;
}
