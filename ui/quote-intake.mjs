// دروازهٔ ورودِ مظنهٔ زنده — `/api/live-trades` · `/api/books` · `/api/infos`.
//
// ═══ چهارمین دروازه، و چرا این یکی بیشترین خونریزی را داشت ═══
//
// سه تای قبلی هر کدام یک یا دو مصرف‌کننده داشتند. این سه مسیر در **ده**
// فایل صدا زده می‌شوند، و سه تای‌شان — «موقعیت‌های من»، «تحلیل رول»،
// و پویشگر — بندِ یکسانی داشتند که **اصلاً `response.ok` را نمی‌دید**:
//
//     fetch(`/api/books?ins=${q}`).then((r) => r.json())
//
// یعنی پاسخِ ۵۰۰ یا ۴۰۰ هم `json()` می‌شد و به‌جای دفترِ سفارش می‌نشست.
// `mergeInsPayloads` در آن شیء هیچ کدِ ابزاری پیدا نمی‌کرد، پس **هر**
// ابزار «دفتر ندارد» می‌شد: یک خطای سرور، به‌شکلِ بازارِ بی‌عمق.
//
// و سقفِ `/api/books` دویست کد است؛ رد شدن از آن یک ۴۰۰ می‌دهد که دقیقاً
// همین‌طور بی‌صدا بلعیده می‌شد.
//
// ═══ چرا «خالی» اینجا هم سه چیز است ═══
//
// همان قاعدهٔ `ui/hist-intake.mjs`: سرور حالا برای دفترِ خالی و نوارِ
// خالی شکلِ خامِ پاسخ را همراه می‌کند. فهرستِ واقعاً خالی یعنی «سطحی ثبت
// نشده» و واقعیتِ بازار است؛ پاسخی که فهرست نیست یعنی خرابی.
//
// ولی یک تفاوتِ مهم با مسیرهای تاریخی: **نوارِ خالی در بازارِ بسته اصلاً
// خبر نیست.** پس فازِ بازار پیش از هر حکمی خوانده می‌شود، وگرنه هر شبِ
// بعد از ساعت معاملات، همهٔ ابزارها «مشکوک» می‌شوند.

import { num } from '../core/num.mjs';
import { LIVE_INS_CAP } from '../core/live-quote.mjs';
import { INS_CAP, insBatches, mergeInsPayloads } from '../core/ins-batches.mjs';

/** حالت‌های یک ابزار در پاسخِ مظنهٔ زنده. */
export const QUOTE_STATE = {
  rows: 'داده آمد',
  quiet: 'بالادست گفت رکوردی نیست',
  closed: 'بازار باز نبود',
  blank: 'خالی برگشت، بی‌تأیید',
  missing: 'ابزار در پاسخ نبود',
  error: 'خطای دریافت',
};

const listOf = (value) => (Array.isArray(value?.rows) ? value.rows
  : (Array.isArray(value?.book) ? value.book : null));

/**
 * حکمِ یک ابزار.
 *
 * `marketOpen === false` پیش از «خالی» می‌آید و عمدی است: نوارِ خالی در
 * بازارِ بسته واقعیتِ ساعت است، نه نشانهٔ خرابی. بی این ترتیب، هر اجرای
 * شبانه یک بستهٔ «مشکوک» تولید می‌کرد و هشدار بی‌معنا می‌شد.
 */
export function quoteVerdict(value, { marketOpen = null } = {}) {
  if (!value) return { state: 'missing', rows: 0, usable: false };
  if (value.error) return { state: 'error', rows: 0, usable: false, why: String(value.error) };

  const list = listOf(value);
  // `/api/infos` فهرست ندارد؛ رکوردِ عددی است. نبودنِ فهرست برایش «خالی»
  // نیست — وجودِ خودِ رکورد کافی است.
  if (list === null) return { state: 'rows', rows: 1, usable: true };
  if (list.length) return { state: 'rows', rows: list.length, usable: true };

  if (marketOpen === false) return { state: 'closed', rows: 0, usable: true };
  if (value.upstreamKind === 'emptyList') {
    return { state: 'quiet', rows: 0, usable: true, upstream: String(value.upstream || '') };
  }
  return { state: 'blank', rows: 0, usable: false, upstream: String(value.upstream || '') };
}

/** پاسخِ خطادارِ یک درخواست، با همان شکلی که حکم می‌فهمد. */
const asError = (why) => ({ error: String(why) });

/**
 * یک درخواست، با بررسیِ `response.ok`.
 *
 * پرتاب نمی‌کند: مصرف‌کننده باید بتواند بگوید **کدام** تکه نرسید، نه
 * اینکه کلِ جدول با یک `throw` خالی شود.
 */
async function pull(url, { fetcher, signal }) {
  try {
    const response = await fetcher(url, { cache: 'no-store', signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      return { ok: false, payload: null, why: payload?.error || `پاسخ ${response.status}` };
    }
    return { ok: true, payload, why: '' };
  } catch (error) {
    // قطعِ عمدیِ درخواست خطا نیست؛ حکمِ «نرسید» هم برایش صادر نمی‌شود.
    if (error?.name === 'AbortError') throw error;
    return { ok: false, payload: null, why: String(error?.message || error) };
  }
}

/**
 * نوارِ زندهٔ چند ابزار، تکه‌تکه.
 *
 * `payload` هم برمی‌گردد چون `liveQuoteBook()` و `bookQuoteBook()` روی
 * شکلِ خامِ پاسخ کار می‌کنند و نباید مجبور شوند عوض شوند.
 */
export async function fetchLiveTape(codes = [], { fetcher = fetch, signal } = {}) {
  const wanted = [...new Set((codes || []).map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!wanted.length) return emptyBatch();
  const parts = [];
  const errors = [];
  let envelope = null;
  let market = null; let at = 0; let source = '';
  for (const part of insBatches(wanted, LIVE_INS_CAP)) {
    const got = await pull(`/api/live-trades?ins=${part.join(',')}`, { fetcher, signal });
    if (!got.ok) { errors.push({ codes: part, why: got.why }); continue; }
    parts.push(got.payload?.items || {});
    // ═══ چرا بدنهٔ خام دست‌نخورده حمل می‌شود ═══
    //
    // `liveTapeDay()` سومین ورودیِ `liveDayOf` را لازم دارد و از آن
    // `source` و `archived` و `boardUnavailable` را می‌خواند. فراخوانی
    // که فقط `market` و `at` بدهد **بی‌صدا** «منبع نامعلوم» می‌گیرد — و
    // همین یک بار کلِ «نگاه باز چندروزه» را از کار انداخت. پس دروازه
    // بدنه را بازسازی نمی‌کند، همان که آمد را نگه می‌دارد.
    if (envelope === null) envelope = got.payload;
    if (market === null) market = got.payload?.market || null;
    at = Math.max(at, num(got.payload?.at, 0));
    source = source || String(got.payload?.source || '');
  }
  return { ...shape(wanted, parts, errors, { market, at, source }), envelope };
}

/** دفترِ سفارشِ چند ابزار. */
export async function fetchBooks(codes = [], { fetcher = fetch, signal } = {}) {
  return batched(codes, '/api/books', INS_CAP.books, { fetcher, signal });
}

/** اطلاعات جاریِ چند ابزار. */
export async function fetchInfos(codes = [], { fetcher = fetch, signal } = {}) {
  return batched(codes, '/api/infos', INS_CAP.books, { fetcher, signal });
}

/**
 * دفتر و اطلاعات با هم — همان بندی که در سه تب تکرار شده بود.
 *
 * هر تکه یک بار می‌رود و هر دو مسیر موازی‌اند، دقیقاً مثل قبل. تفاوت
 * این است که حالا اگر یکی‌شان بیفتد، نامش گفته می‌شود.
 */
export async function fetchQuotes(codes = [], { fetcher = fetch, signal } = {}) {
  const [books, infos] = await Promise.all([
    fetchBooks(codes, { fetcher, signal }),
    fetchInfos(codes, { fetcher, signal }),
  ]);
  return { books, infos, summary: mergeSummaries([books.summary, infos.summary]) };
}

async function batched(codes, path, cap, { fetcher, signal }) {
  const wanted = [...new Set((codes || []).map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!wanted.length) return emptyBatch();
  const parts = [];
  const errors = [];
  for (const part of insBatches(wanted, cap)) {
    const got = await pull(`${path}?ins=${part.join(',')}`, { fetcher, signal });
    if (!got.ok) { errors.push({ codes: part, why: got.why }); continue; }
    parts.push(got.payload || {});
  }
  return shape(wanted, parts, errors, {});
}

function emptyBatch() {
  return {
    payload: {}, byIns: {}, verdicts: {}, errors: [],
    market: null, at: 0, source: '', summary: quoteSummary({}),
  };
}

function shape(wanted, parts, errors, { market = null, at = 0, source = '' }) {
  const merged = mergeInsPayloads(wanted, parts);
  const open = market ? market.open !== false : null;
  const failed = new Set(errors.flatMap((e) => e.codes));
  const verdicts = {};
  for (const ins of wanted) {
    // کدی که تکه‌اش اصلاً نرسید، «نبود» نیست — «نگرفتیم» است، و علتش
    // همان خطای تکه است.
    if (failed.has(ins) && !merged.payload[ins]) {
      verdicts[ins] = quoteVerdict(asError(errors.find((e) => e.codes.includes(ins))?.why || 'تکه نرسید'));
      continue;
    }
    verdicts[ins] = quoteVerdict(merged.payload[ins], { marketOpen: open });
  }
  return {
    payload: merged.payload, byIns: merged.payload, verdicts, errors,
    market, at, source, summary: quoteSummary(verdicts, { market }),
  };
}

/** جمع‌بندیِ یک بسته. */
export function quoteSummary(verdicts = {}, { market = null } = {}) {
  const list = Object.values(verdicts || {});
  const of = (state) => list.filter((v) => v.state === state).length;
  return {
    total: list.length,
    rows: of('rows'), quiet: of('quiet'), closed: of('closed'),
    blank: of('blank'), missing: of('missing'), error: of('error'),
    // «قابلِ تکیه» یعنی می‌دانیم چه رسید — داده، تأییدِ خالی، یا بازارِ بسته.
    trusted: of('rows') + of('quiet') + of('closed'),
    marketOpen: market ? market.open !== false : null,
  };
}

function mergeSummaries(list = []) {
  const keys = ['total', 'rows', 'quiet', 'closed', 'blank', 'missing', 'error', 'trusted'];
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const s of list) for (const k of keys) out[k] += num(s?.[k], 0);
  out.marketOpen = list.find((s) => s?.marketOpen !== null && s?.marketOpen !== undefined)?.marketOpen ?? null;
  return out;
}

/** جملهٔ هشدار، یا رشتهٔ خالی وقتی همه‌چیز رسیده. */
export function quoteWarning(summary) {
  if (!summary || !summary.total || summary.trusted === summary.total) return '';
  const parts = [];
  if (summary.error) parts.push(`${summary.error} ابزار خطا دادند`);
  if (summary.missing) parts.push(`${summary.missing} ابزار در پاسخ نبودند`);
  if (summary.blank) parts.push(`${summary.blank} ابزار خالی و بی‌تأیید برگشتند`);
  if (!parts.length) return '';
  return `${parts.join(' · ')} — مظنهٔ این‌ها را نداریم،`
    + ' پس ردیفشان با قیمتِ قدیمی یا خالی نشان داده می‌شود، نه با مظنهٔ حالا.';
}
