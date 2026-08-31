// استخراج قرارداد از پاسخِ «همهٔ ابزارهای یک روز».
//
//     /ClosingPrice/GetInstrmentsHistoryInDay/{YYYYMMDD}
//
// این مسیر تنها جایی است که TSETMC تاریخ می‌گیرد و **فهرست همان روز** را
// می‌دهد. اهمیتش برای این پروژه یک چیز است: قراردادی که پارسال سررسید شد،
// در پاسخِ روزهای پارسال هست، هرچند در تابلوی امروز نیست. کل درمانِ
// سوگیری بقا از همین یک نقطه می‌آید.
//
// ═══ چرا استخراجش این‌قدر دفاعی است ═══
//
// شکل پاسخ در طول سال‌ها ثابت نمانده: گاهی `insCode` بالای ردیف است و
// مشخصات تو‌ی یک شیء تودرتو، گاهی برعکس. یک مسیرِ سفتِ `row.a.b.c` روزی
// بی‌صدا صفر ردیف می‌دهد و کسی نمی‌فهمد که کل یک سال از قلم افتاده. پس
// همهٔ شیءهای تودرتو دیده می‌شوند و آن‌که بیشترین میدانِ ابزارمانند را
// دارد، برنده است.
//
// این ماژول شبکه نمی‌زند. گرفتنِ پاسخ کار `tools/roster-scan.mjs` است؛
// اینجا فقط «این JSON، چه قراردادهایی داشت» — و همان است که آزمون می‌شود.

import { rosterIntake } from './option-roster.mjs';

/** همهٔ شیءهای تودرتو، بازگشتی. */
export function* deepObjects(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) yield* deepObjects(item, depth + 1);
    return;
  }
  yield value;
  for (const item of Object.values(value)) yield* deepObjects(item, depth + 1);
}

const INSTRUMENT_KEYS = ['insCode', 'instrumentID', 'cIsin', 'lVal18AFC', 'lVal30', 'yVal', 'flow'];

const firstFilled = (obj, ...keys) => {
  for (const key of keys) {
    const v = obj?.[key];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
};

/**
 * ردیفِ خامِ پاسخ → شکلِ ورودی دفتر.
 *
 * ادغام از پرمیدان‌ترین شیء شروع می‌شود و میدانِ پرشده هرگز با خالی
 * بازنویسی نمی‌شود؛ وگرنه یک شیء تودرتوی کم‌محتوا می‌تواند نامی را که
 * لایهٔ بالاتر داشت پاک کند — و نام، منبعِ قیمت اعمال و سررسید است.
 */
export function instrumentFields(row) {
  const scored = [];
  for (const obj of deepObjects(row)) {
    const score = INSTRUMENT_KEYS.reduce((n, key) => n + (key in obj ? 1 : 0), 0);
    if (score >= 2) scored.push([score, obj]);
  }
  scored.sort((a, b) => b[0] - a[0]);

  const merged = {};
  for (const [, obj] of scored) {
    for (const [key, value] of Object.entries(obj)) {
      if (merged[key] === undefined || merged[key] === null || merged[key] === '') merged[key] = value;
    }
  }
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && typeof value === 'object') continue;
      if (merged[key] === undefined || merged[key] === null || merged[key] === '') merged[key] = value;
    }
  }

  const ins = String(firstFilled(merged, 'insCode', 'InsCode') ?? '').trim();
  if (!ins) return null;
  return {
    ins,
    symbol: String(firstFilled(merged, 'lVal18AFC', 'Symbol', 'symbol') ?? '').trim(),
    name: String(firstFilled(merged, 'lVal30', 'Name', 'name') ?? '').trim(),
    id: String(firstFilled(merged, 'instrumentID', 'InstrumentID') ?? '').trim(),
  };
}

/** آرایهٔ ردیف‌های پاسخ، هر شکلی که داشته باشد. */
export function unwrapDay(payload) {
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
  if (!payload || typeof payload !== 'object') return [];
  for (const key of [
    'closingPriceDailyHistoryWithInstDetails',
    'closingPriceDailyHistory',
    'closingPriceDaily',
    'instrumentHistory',
  ]) {
    if (Array.isArray(payload[key])) return payload[key].filter((x) => x && typeof x === 'object');
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && (!value.length || (value[0] && typeof value[0] === 'object'))) {
      return value.filter((x) => x && typeof x === 'object');
    }
  }
  return [];
}

/**
 * پاسخِ یک روز → ردیف‌های دفتر، با «آن روز» به‌عنوان دیده‌شدن.
 *
 * `first` و `last` هر دو همان روزند؛ ادغامِ روزهای بعدی است که عمر را
 * پهن می‌کند. اگر اینجا بازهٔ فرضی می‌گذاشتیم، عمرِ ساختگی می‌شد.
 */
export function scanDay(payload, date) {
  const day = Number(String(date).replace(/[^\d]/g, '')) || 0;
  const raw = [];
  for (const row of unwrapDay(payload)) {
    const fields = instrumentFields(row);
    if (fields) raw.push({ ...fields, first: day, last: day });
  }
  const intake = rosterIntake(raw);
  return { date: day, instruments: raw.length, ...intake };
}

/** روزهای یک بازه — پنجشنبه و جمعه انداخته می‌شوند، بورس تهران بسته است. */
export function tradingDays(from, to) {
  const parse = (v) => {
    const s = String(v).replace(/[^\d]/g, '');
    if (s.length !== 8) return null;
    return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  };
  const a = parse(from), b = parse(to);
  if (!a || !b || b < a) return [];
  const out = [];
  for (let d = a; d <= b; d = new Date(d.getTime() + 86400000)) {
    const wd = d.getUTCDay();          // ۴ پنجشنبه، ۵ جمعه
    if (wd === 4 || wd === 5) continue;
    out.push(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
  }
  return out;
}

/** مسیر نسبیِ همان روز روی بالادست. */
export const dayPath = (date) => `/ClosingPrice/GetInstrmentsHistoryInDay/${String(date).replace(/[^\d]/g, '')}`;
