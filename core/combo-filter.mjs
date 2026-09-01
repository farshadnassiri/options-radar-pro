// پالایهٔ ترکیب — کدام ردیف در جدول بماند.
//
// ═══ چرا لازم شد ═══
//
// پس از بسته شدن باگِ شناسه، شمار ترکیب از ۱۲۱۹ به ۳۴۶۹ رفت و هر
// استراتژیِ دوقیمت‌اعمالی همان ۱۹۹ ردیف کاملش را ساخت. این درست است، ولی
// سه هزار ردیف با چشم خوانده نمی‌شود. صاحب پروژه پالایه خواست — «مثلا بر
// اساس حداکثر سود، زیان، فاصله از سربه‌سری ۱ و ۲، ارزش معاملات».
//
// ═══ دو قاعده که این فایل رویشان ساخته شده ═══
//
// **خالی، صفر نیست.** ردیفی که سربه‌سری دوم ندارد (اسپردِ یک‌طرفه فقط یک
// نقطه دارد) با قیدِ «سربه‌سری دوم زیر ۱۰٪» **کنار نمی‌رود** — چون
// چیزی نیست که بسنجیم. کنار گذاشتنش یعنی ادعای «۱۰٪ نبود»، در حالی که
// حقیقت «سنجیده نشد» است.
//
// **هر قید بگوید چند تا انداخت.** پالایه‌ای که فقط عددِ نهایی می‌دهد،
// کاربر را وادار می‌کند یکی‌یکی خاموش و روشن کند تا بفهمد کدام سخت‌گیر
// بوده.

import { num } from './num.mjs';

/**
 * میدان‌های پالایه‌پذیر.
 *
 * `pick` مقدار را از ردیف بیرون می‌کشد و `null` می‌دهد اگر نبود — و
 * «نبود» با «صفر» یکی نیست.
 */
export const FILTER_FIELDS = [
  {
    id: 'maxProfit', label: 'حداکثر سود', unit: 'ریال',
    hint: 'سقف سود در سررسید. فروش برهنه سقف دارد، خرید معمولاً نه.',
    pick: (row) => finite(row?.entry?.maxProfit),
  },
  {
    id: 'maxLoss', label: 'حداکثر زیان', unit: 'ریال',
    hint: 'اندازهٔ زیان، مثبت. در فروش برهنه بی‌نهایت است و با هیچ سقفی کنار نمی‌رود.',
    pick: (row) => finite(row?.entry?.maxLoss),
  },
  {
    id: 'breakevenGap1', label: 'فاصله تا سربه‌سری ۱', unit: 'درصد',
    hint: 'فاصلهٔ نزدیک‌ترین نقطهٔ سربه‌سری از قیمت پایه در روز ورود، بر حسب درصد.',
    pick: (row) => gapPct(row, 0),
  },
  {
    id: 'breakevenGap2', label: 'فاصله تا سربه‌سری ۲', unit: 'درصد',
    hint: 'برای ترکیب دوسمته. ردیفی که نقطهٔ دوم ندارد با این قید کنار نمی‌رود.',
    pick: (row) => gapPct(row, 1),
  },
  {
    id: 'breakevenWidth', label: 'پهنای بین دو سربه‌سری', unit: 'درصد',
    hint: 'پنجره‌ای که قیمت پایه می‌تواند در آن بماند و ترکیب زیان ندهد.',
    pick: (row) => {
      const be = breakevens(row);
      const spot = finite(row?.entry?.spot);
      if (be.length < 2 || !(spot > 0)) return null;
      return ((be[be.length - 1] - be[0]) / spot) * 100;
    },
  },
  {
    id: 'entryValue', label: 'ارزش معاملهٔ ورود', unit: 'ریال',
    hint: 'جمع ارزش معاملهٔ پاها در روز ورود. کم بودنش یعنی ترکیب روی کاغذ هست و در بازار نه.',
    pick: (row) => finite(row?.entry?.legValue),
  },
  {
    id: 'capital', label: 'سرمایهٔ درگیر', unit: 'ریال',
    hint: 'مخرج بازده — همان که در سرشناسه تعریفش آمده.',
    pick: (row) => finite(row?.entry?.capital),
  },
  {
    id: 'margin', label: 'وجه تضمین خالص', unit: 'ریال',
    pick: (row) => finite(row?.entry?.marginNet),
  },
  {
    id: 'days', label: 'روز تا سررسید', unit: 'روز',
    pick: (row) => {
      const days = (row?.legs || []).map((leg) => finite(leg?.days)).filter((d) => d != null);
      return days.length ? Math.min(...days) : null;
    },
  },
  {
    id: 'returnPct', label: 'بازده پایان بازه', unit: 'درصد',
    pick: (row) => finite(row?.final?.returnPct),
  },
];

const finite = (v) => (Number.isFinite(v) ? v : null);

/** نقاط سربه‌سری، مرتب و بی‌تکرار. */
export function breakevens(row) {
  const list = row?.entry?.breakevens;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => num(v, NaN)).filter(Number.isFinite))].sort((a, b) => a - b);
}

/** فاصلهٔ nامین سربه‌سری از قیمت پایه، بر حسب درصد. */
function gapPct(row, index) {
  const be = breakevens(row);
  const spot = finite(row?.entry?.spot);
  if (!(spot > 0) || index >= be.length) return null;
  return (Math.abs(be[index] - spot) / spot) * 100;
}

export const FIELD_BY_ID = new Map(FILTER_FIELDS.map((f) => [f.id, f]));

/** محدودهٔ خالی — یعنی این قید خاموش است. */
export function emptyRange() { return { min: null, max: null }; }

/**
 * یک ردیف، در برابر یک قید.
 *
 * سه جواب دارد و هر سه لازم‌اند: `pass`، `fail`، و `unknown` برای وقتی
 * که خودِ مقدار نیست. `unknown` **رد نمی‌شود** — ردیف می‌ماند و جداگانه
 * شمرده می‌شود.
 */
export function testField(row, id, range) {
  const field = FIELD_BY_ID.get(id);
  if (!field) return 'pass';
  const lo = finite(num(range?.min, NaN));
  const hi = finite(num(range?.max, NaN));
  if (lo == null && hi == null) return 'pass';
  const value = field.pick(row);
  if (value == null) return 'unknown';
  if (lo != null && value < lo) return 'fail';
  if (hi != null && value > hi) return 'fail';
  return 'pass';
}

/**
 * پالایش یک فهرست، با گزارشِ اینکه هر قید چند تا انداخت.
 *
 * `dropped` به تفکیک قید است، نه یک عدد سرجمع: قیدی که همه را می‌اندازد
 * باید بی‌درنگ پیدا شود.
 */
export function applyComboFilter(rows = [], ranges = {}) {
  const active = Object.keys(ranges).filter((id) => {
    const r = ranges[id];
    return FIELD_BY_ID.has(id) && (finite(num(r?.min, NaN)) != null || finite(num(r?.max, NaN)) != null);
  });
  if (!active.length) {
    return {
      rows, kept: rows.length, total: rows.length, dropped: {}, unknown: {}, active: [],
      indexes: null,
    };
  }

  const dropped = Object.fromEntries(active.map((id) => [id, 0]));
  const unknown = Object.fromEntries(active.map((id) => [id, 0]));
  const kept = [];
  // اندیسِ ردیف‌های مانده. ماتریسِ سود و زیان ردیف‌ها را **با اندیس**
  // می‌شناسد، پس هرکس این فهرست را کوتاه کند باید ماتریس را هم با همین
  // اندیس‌ها کوتاه کند — وگرنه مسیر روزانهٔ هر ردیف به ردیف دیگری
  // می‌چسبد و هیچ‌چیز خطا نمی‌دهد.
  const indexes = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    let ok = true;
    for (const id of active) {
      const verdict = testField(row, id, ranges[id]);
      if (verdict === 'unknown') { unknown[id] += 1; continue; }
      // شمارش برای **همهٔ** قیدهایی که این ردیف را می‌اندازند، نه فقط
      // اولی: وگرنه «کدام قید سخت‌گیر است» به ترتیبِ تعریف بند می‌شد.
      if (verdict === 'fail') { dropped[id] += 1; ok = false; }
    }
    if (ok) { kept.push(row); indexes.push(i); }
  }
  return { rows: kept, kept: kept.length, total: rows.length, dropped, unknown, active, indexes };
}

/** یک جمله از نتیجهٔ پالایش — همان که بالای جدول می‌نشیند. */
export function filterNote(result) {
  if (!result || !result.active?.length) return '';
  const iso = (n) => `⁨${Number(n).toLocaleString('fa-IR')}⁩`;
  const gone = result.total - result.kept;
  // «مقدارش نبود» حتی وقتی چیزی کنار نرفته هم خبرِ لازمی است: یعنی آن قید
  // روی بخشی از ردیف‌ها اصلاً اعمال نشده، و کاربر باید بداند نتیجه‌اش
  // «همه گذشتند» نیست، «همه سنجیده نشدند» است.
  const unmeasured = result.active.filter((id) => result.unknown[id] > 0)
    .map((id) => `${FIELD_BY_ID.get(id).label} ${iso(result.unknown[id])}`);
  if (!gone) {
    const tail = unmeasured.length ? `؛ ${unmeasured.join('، ')} مقدارش نبود و سنجیده نشد` : '';
    return `${iso(result.total)} ترکیب، هیچ‌کدام با قیدهای فعلی کنار نرفت${tail}.`;
  }
  const worst = [...result.active]
    .sort((a, b) => (result.dropped[b] || 0) - (result.dropped[a] || 0))
    .filter((id) => result.dropped[id] > 0)
    .slice(0, 3)
    .map((id) => `${FIELD_BY_ID.get(id).label} ${iso(result.dropped[id])}`);
  const head = `${iso(result.kept)} از ${iso(result.total)} ترکیب ماند`;
  const why = worst.length ? `؛ بیشترین کنارگذاری: ${worst.join('، ')}` : '';
  const gap = unmeasured.length ? `؛ ${unmeasured.join('، ')} مقدارش نبود و سنجیده نشد` : '';
  return `${head}${why}${gap}.`;
}
