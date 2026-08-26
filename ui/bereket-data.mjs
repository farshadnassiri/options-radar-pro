// بارگذارهای «سفره پر برکت بازار».
//
// `core/` به شبکه دست نمی‌زند، پس دروازهٔ زمان توابع دریافت را تزریقی
// می‌گیرد. این فایل همان توابع است — و **تنها** جایی که این تب با شبکه
// حرف می‌زند.
//
// اینکه یک فایل جدا شده، خودش بند معماری سند را اجرا می‌کند: هیچ بخشی از
// موتور پیشنهاد، رابط، یا محاسبات حق دسترسی مستقیم به کلاینت داده را
// ندارد. اگر روزی `ui/tabs/bereket.mjs` مستقیم `fetch` صدا بزند، در دیف
// پیداست و نگهبان هم می‌گیردش.
//
// همهٔ درخواست‌ها به `/api/hist` می‌روند که فقط داده‌های **تاریخ‌دار** را
// می‌دهد. هیچ نقطهٔ لایوی اینجا صدا زده نمی‌شود، چون در یک جلسهٔ سفر در
// زمان، «الان» معنی ندارد.

const memo = new Map();

/** کش درون‌مرورگری. روز تمام‌شده دیگر عوض نمی‌شود، پس عمرش تا بستن تب است. */
async function once(key, make) {
  if (memo.has(key)) return memo.get(key);
  const promise = make().catch((error) => { memo.delete(key); throw error; });
  memo.set(key, promise);
  return promise;
}

export function clearBereketCache() { memo.clear(); }

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `درخواست ناموفق (${response.status})`);
  return body;
}

const compact = (date) => String(Math.trunc(Number(date) || 0));

/** سری روزانهٔ یک ابزار. `n=0` یعنی از اولین روز موجود. */
export async function loadDailies(ins, { n = 0 } = {}) {
  const key = `daily|${ins}|${n}`;
  const body = await once(key, () => getJson(`/api/dailies?ins=${encodeURIComponent(ins)}&n=${n}`));
  return body?.[String(ins)]?.rows || [];
}

/** ریزمعاملهٔ یک ابزار در یک روز تکمیل‌شده. */
export async function loadTrades(ins, date) {
  const key = `trades|${ins}|${compact(date)}`;
  const body = await once(key, () => getJson(`/api/hist?kind=trades&ins=${encodeURIComponent(ins)}&date=${compact(date)}`));
  return body?.rows || [];
}

/** رویدادهای دفتر سفارش یک ابزار در یک روز تکمیل‌شده. */
export async function loadBookEvents(ins, date) {
  const key = `book|${ins}|${compact(date)}`;
  const body = await once(key, () => getJson(`/api/hist?kind=book&ins=${encodeURIComponent(ins)}&date=${compact(date)}`));
  return body?.events || [];
}

/**
 * دامنهٔ مجاز و وضعیت نماد در یک روز.
 *
 * هر دو برای تشخیص صف لازم‌اند: یک سمت خالیِ دفتر تنها وقتی صف است که
 * سمت دیگر روی حد دامنه نشسته باشد. بی این، «بی‌مظنه» و «صف» یکی
 * می‌شدند و درمانشان یکی نیست.
 */
export async function loadDayMeta(ins, date, second) {
  const day = compact(date);
  const [threshold, state] = await Promise.all([
    once(`th|${ins}|${day}`, () => getJson(`/api/hist?kind=threshold&ins=${encodeURIComponent(ins)}&date=${day}`)).catch(() => null),
    once(`st|${ins}|${day}`, () => getJson(`/api/hist?kind=state&ins=${encodeURIComponent(ins)}&date=${day}`)).catch(() => null),
  ]);
  return {
    limitLow: lastBefore(threshold?.rows, second, 'psGelStaMin'),
    limitHigh: lastBefore(threshold?.rows, second, 'psGelStaMax'),
    state: lastBefore(state?.rows, second, 'cEtaval', ''),
    stateTitle: lastBefore(state?.rows, second, 'cEtavalTitle', ''),
  };
}

/**
 * آخرین مقدار یک میدان تا یک ثانیه.
 *
 * دامنهٔ قیمت می‌تواند در طول روز عوض شود و وضعیت نماد هم همین‌طور. گرفتن
 * آخرین رکورد روز، وضعیت ساعت دوازده را به ساعت ده نسبت می‌داد.
 */
function lastBefore(rows = [], second, field, fallback = NaN) {
  if (!Array.isArray(rows) || !rows.length) return fallback;
  const cut = Number(second);
  let best = null;
  for (const row of rows) {
    const at = hmsToSecond(row?.hEven);
    if (Number.isFinite(cut) && at > cut) continue;
    if (!best || at >= best.at) best = { at, row };
  }
  if (!best) return fallback;
  const value = best.row?.[field];
  return typeof fallback === 'string' ? String(value ?? fallback).trim() : Number(value);
}

function hmsToSecond(value) {
  const raw = String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(6, '0').slice(-6);
  return Number(raw.slice(0, 2)) * 3600 + Number(raw.slice(2, 4)) * 60 + Number(raw.slice(4, 6));
}

/** فهرست جلسه‌های ذخیره‌شده. */
export async function listSessions() {
  const body = await getJson('/api/bereket/sessions');
  return body?.sessions || [];
}

/** خواندن یک جلسه. */
export async function loadSession(id) {
  return getJson(`/api/bereket/session?id=${encodeURIComponent(id)}`);
}

/**
 * ذخیرهٔ جلسه.
 *
 * حذفی در کار نیست و این تابع هم حذف ندارد: سند می‌گوید هر جلسه از لحظهٔ
 * شروع ثبت و قفل می‌شود، حتی جلسه‌ای که کاربر رهایش کند.
 */
export async function saveSession(session) {
  const id = String(session?.id || '');
  const response = await fetch(`/api/bereket/session?id=${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'جلسه ذخیره نشد');
  return body;
}

/**
 * بارگذارهای آمادهٔ تزریق به دروازهٔ زمان.
 *
 * امضاها دقیقاً همان‌اند که `createTimeGate` انتظار دارد. اگر عوض شوند،
 * دروازه بی‌صدا خالی برمی‌گرداند — پس همین‌جا و همان‌جا باید با هم بمانند.
 */
export function gateLoaders() {
  return {
    dailies: (ins) => loadDailies(ins),
    trades: (ins, date) => loadTrades(ins, date),
    book: (ins, date) => loadBookEvents(ins, date),
  };
}
