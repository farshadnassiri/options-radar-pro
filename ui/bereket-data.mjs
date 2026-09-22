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

import { fetchDailies } from './daily-intake.mjs';
import { fetchHist, fetchHistKinds, histWarning } from './hist-intake.mjs';

const memo = new Map();

/**
 * کش درون‌مرورگری. روز تمام‌شده دیگر عوض نمی‌شود، پس عمرش تا بستن تب است.
 *
 * ═══ چرا شکست کش نمی‌شود ═══
 *
 * تا پیش از دروازه، خطای HTTP یک `throw` بود و `catch` کلید را پاک
 * می‌کرد، پس تلاشِ بعدی دوباره می‌پرسید. دروازه عمداً پرتاب نمی‌کند —
 * حکمِ `error` برمی‌گرداند تا مصرف‌کننده بتواند نامِ آنچه نرسید را
 * بگوید. بی این بند، همان تغییر یک پسرفت می‌شد: **یک** پاسخِ خراب تا
 * پایانِ نشست می‌ماند و هیچ تلاشِ دوباره‌ای ممکن نبود.
 */
async function once(key, make) {
  if (memo.has(key)) return memo.get(key);
  const promise = make().then((value) => {
    if (unusable(value)) memo.delete(key);
    return value;
  }).catch((error) => { memo.delete(key); throw error; });
  memo.set(key, promise);
  return promise;
}

/** حکمی که ارزشِ نگه‌داشتن ندارد: نرسید، پس بعداً دوباره بپرس. */
function unusable(value) {
  const states = value?.verdict ? [value.verdict.state]
    : Object.values(value?.verdicts || {}).map((v) => v.state);
  return states.some((state) => state === 'error' || state === 'missing' || state === 'throttled');
}

export function clearBereketCache() { memo.clear(); }

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `درخواست ناموفق (${response.status})`);
  return body;
}

const compact = (date) => String(Math.trunc(Number(date) || 0));

/**
 * سری روزانهٔ یک ابزار، همراهِ حکمش.
 *
 * ═══ چرا حکم هم برمی‌گردد ═══
 *
 * «آرایهٔ خالی» در این تب دو معنیِ کاملاً متفاوت دارد که یک شکل‌اند:
 * ابزاری که آن روز معامله نشده، و ابزاری که تابلویش **اصلاً نیامده**.
 * `contractsAliveAt` با اولی قرارداد را کنار می‌گذارد — و با دومی هم
 * همان کار را می‌کرد، بی آنکه کسی بفهمد یک قرارداد از جلسه افتاد.
 * حکم همین را جدا می‌کند.
 */
export async function loadDailiesVerdict(ins, { n = 0 } = {}) {
  const key = `daily|${ins}|${n}`;
  return once(key, async () => {
    const got = await fetchDailies([ins], { n });
    return { rows: got.byIns?.[String(ins)]?.rows || [], verdict: got.verdicts[String(ins)] };
  });
}

/** سری روزانهٔ یک ابزار. `n=0` یعنی از اولین روز موجود. */
export async function loadDailies(ins, { n = 0 } = {}) {
  return (await loadDailiesVerdict(ins, { n })).rows;
}

/**
 * ریزمعاملهٔ یک ابزار در یک روز، همراهِ حکمش.
 *
 * ═══ چرا حکم، و چرا اینجا از همه مهم‌تر است ═══
 *
 * سرور از چهار دور ممیزی به این‌سو `complete` · `verified` · `quiet` ·
 * `throttled` را با هر پاسخ می‌فرستد و این بارگذار **همه‌شان را دور
 * می‌ریخت** (`body?.rows || []`). یعنی نوارِ سهمیه‌خورده — که `HTTP 200`
 * با آرایهٔ خالی است — «آن روز معامله‌ای نشد» خوانده می‌شد، و تبِ سفر در
 * زمان رویش یک جلسهٔ معاملاتیِ ساکت می‌ساخت که هرگز وجود نداشت.
 */
export async function loadTradesVerdict(ins, date) {
  const key = `trades|${ins}|${compact(date)}`;
  return once(key, () => fetchHist('trades', ins, compact(date)));
}

/** ریزمعاملهٔ یک ابزار در یک روز تکمیل‌شده. */
export async function loadTrades(ins, date) {
  return (await loadTradesVerdict(ins, date)).rows;
}

/** رویدادهای دفتر سفارش، همراهِ حکمشان. */
export async function loadBookEventsVerdict(ins, date) {
  const key = `book|${ins}|${compact(date)}`;
  return once(key, () => fetchHist('book', ins, compact(date)));
}

/** رویدادهای دفتر سفارش یک ابزار در یک روز تکمیل‌شده. */
export async function loadBookEvents(ins, date) {
  return (await loadBookEventsVerdict(ins, date)).rows;
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
  // ═══ چرا `catch(() => null)` برداشته شد ═══
  //
  // نسخهٔ قبلی هر دو درخواست را در `catch` می‌انداخت و `null` می‌داد؛
  // `lastBefore` هم رویش `NaN` و `''` برمی‌گرداند. نتیجه: «دامنه را
  // نگرفتیم» و «دامنه‌ای اعلام نشده» یک شکل می‌شدند — و تشخیصِ صف
  // دقیقاً روی همین دو تکیه دارد. حالا هر نوع حکمِ خودش را دارد و
  // هیچ‌کدام دیگری را نمی‌اندازد.
  const got = await once(`meta|${ins}|${day}`,
    () => fetchHistKinds(['threshold', 'state'], ins, day));
  const threshold = got.byKind.threshold;
  const state = got.byKind.state;
  return {
    limitLow: lastBefore(threshold?.rows, second, 'psGelStaMin'),
    limitHigh: lastBefore(threshold?.rows, second, 'psGelStaMax'),
    state: lastBefore(state?.rows, second, 'cEtaval', ''),
    stateTitle: lastBefore(state?.rows, second, 'cEtavalTitle', ''),
    // و آنچه نرسید، با نام. بی این، «—» در رابط یعنی «نبود»، در حالی که
    // می‌تواند «نگرفتیم» باشد.
    verdicts: got.verdicts,
    trusted: got.summary.trusted === got.summary.total,
    note: histWarning(got.summary),
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
