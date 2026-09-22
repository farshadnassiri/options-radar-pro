// دروازهٔ ورودِ دادهٔ تاریخ‌دار — یک در برای `/api/hist`.
//
// ═══ سومین دروازه، و چرا شکلش فرق دارد ═══
//
// `ui/tape-intake.mjs` یک نوع داده داشت و `ui/daily-intake.mjs` هم یک
// نوع. `/api/hist` **نُه** نوع دارد و هر کدام قراردادِ پاسخِ خودش را:
// ریزمعامله حکمِ تطبیق با تابلو می‌آورد، دفترِ سفارش رویداد می‌دهد،
// `closing` برگهٔ پوشش دارد، و `daily` یک رکوردِ تک با مهرِ تاریخ.
//
// پس اینجا یک جدول است، نه یک زنجیرهٔ `if`: هر نوع می‌گوید ردیف‌هایش
// کجاست و خالی‌بودنش را چطور باید خواند. جدول بودنش همان دلیلِ
// `HISTORICAL_PATHS` را دارد — نُه تابعِ تقریباً یکسان، نُه جای فراموش‌کردن.
//
// ═══ «خالی» اینجا سه چیز است، نه دو ═══
//
// سرور حالا شکلِ خامِ پاسخ را همراه می‌کند (`core/upstream-shape.mjs`).
// این یعنی می‌شود گفت:
//
//   بالادست فهرستی داد که خالی بود   →  `quiet` — واقعیتِ بازار است
//   بالادست چیزی داد که فهرست نیست   →  `blank` — خرابی است
//   اصلاً پاسخی نبود                 →  `blank`
//
// تا امروز هر سه `[]` می‌شدند و تبِ سفر در زمان هر سه را «آن لحظه دفتری
// نبود» می‌خواند — یعنی روی خرابیِ بالادست، جلسهٔ معاملاتی می‌ساخت.

import { num } from '../core/num.mjs';

/** حالت‌های یک پاسخِ تاریخ‌دار. */
export const HIST_STATE = {
  rows: 'داده آمد',
  quiet: 'بالادست گفت رکوردی نداشت',
  blank: 'خالی برگشت، بی‌تأیید',
  unverified: 'داده آمد، تأییدنشده',
  throttled: 'سهمیهٔ بالادست بسته شد',
  missing: 'پاسخی نیامد',
  error: 'خطای دریافت',
};

/**
 * قراردادِ هر نوع: ردیف‌ها کجاست.
 *
 * `trades` و `book` نامِ میدانِ خودشان را دارند چون سرور نرمالشان کرده.
 * بقیه خام‌اند و زیرِ `rows` می‌نشینند.
 */
const ROWS_FIELD = {
  book: 'events',
  trades: 'rows',
  state: 'rows', threshold: 'rows', closing: 'rows',
};

/** نوع‌هایی که رکوردِ تک می‌دهند، نه فهرست. */
const SINGLE_ROW = new Set(['daily', 'clientType', 'instrument']);

/** ردیف‌های یک پاسخ، هر نوعی که باشد. */
export function histRows(kind, body) {
  if (SINGLE_ROW.has(kind)) return body?.row ? [body.row] : [];
  const list = body?.[ROWS_FIELD[kind] || 'rows'];
  return Array.isArray(list) ? list : [];
}

/**
 * حکمِ یک پاسخ.
 *
 * ترتیب عمدی است و همان ترتیبِ `tapeVerdict` را دارد: **سهمیه و خطا
 * مقدم‌اند**، چون دربارهٔ رسیدنِ داده حرف می‌زنند نه دربارهٔ بازار. تا
 * وقتی نمی‌دانیم داده رسید یا نه، هیچ حرفی دربارهٔ آن روز نمی‌شود زد.
 */
export function histVerdict(kind, body) {
  if (!body) return { kind, state: 'missing', rows: 0, usable: false };
  if (body.throttled) return { kind, state: 'throttled', rows: 0, usable: false };
  if (body.error) return { kind, state: 'error', rows: 0, usable: false, why: String(body.error) };

  const rows = histRows(kind, body).length;

  // ── رکوردِ تک: مهرِ تاریخ حرفِ آخر را می‌زند ──────────────────────
  //
  // `found:false` یعنی رکوردی نبود؛ `dated:false` یعنی رکورد هست ولی
  // قرارداد نمی‌کند که رکوردِ **آن روز** باشد. دومی «داده آمد» است ولی
  // «تأییدشده» نیست — و همین تفاوت، درسِ R3-01 بود.
  if (SINGLE_ROW.has(kind)) {
    if (body.found === false) return { kind, state: 'blank', rows: 0, usable: false, why: String(body.why || '') };
    if (body.dated === false) return { kind, state: 'unverified', rows, usable: true, why: String(body.why || '') };
    return { kind, state: 'rows', rows, usable: true };
  }

  if (rows) {
    // دفترِ سفارش می‌تواند ردیف بگیرد و رویدادِ معتبری نسازد. آن حالت
    // «داده آمد» نیست.
    if (kind === 'closing' && body.coverage && body.coverage.complete === false) {
      return { kind, state: 'unverified', rows, usable: true, why: String(body.coverage.note || '') };
    }
    return { kind, state: 'rows', rows, usable: true };
  }

  // ── خالی: شکلِ خامِ پاسخ می‌گوید کدام خالی ────────────────────────
  if (body.upstreamKind === 'emptyList') {
    return { kind, state: 'quiet', rows: 0, usable: true, upstream: String(body.upstream || '') };
  }
  return {
    kind, state: 'blank', rows: 0, usable: false,
    upstream: String(body.upstream || ''),
    // ردیف آمد ولی هیچ رویدادی نساخت — خبرِ بدتری از «رکوردی نبود».
    droppedRows: Math.trunc(num(body.droppedRows, 0)),
  };
}

/** یک نوع، یک ابزار، یک روز. */
export async function fetchHist(kind, ins, date, { fetcher = fetch, signal } = {}) {
  const query = `kind=${encodeURIComponent(String(kind))}`
    + `&ins=${encodeURIComponent(String(ins))}&date=${encodeURIComponent(String(date))}`;
  const response = await fetcher(`/api/hist?${query}`, { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const why = body?.error || `پاسخ ${response.status}`;
    return { body: null, verdict: histVerdict(kind, { error: why }), rows: [] };
  }
  return { body, verdict: histVerdict(kind, body), rows: histRows(kind, body) };
}

/**
 * چند نوع برای یک ابزار/روز، با هم.
 *
 * `loadDayMeta` دو نوع را موازی می‌خواست و هر دو را در `catch` می‌انداخت؛
 * حالا هر کدام حکمِ خودش را دارد و هیچ‌کدام دیگری را نمی‌اندازد.
 */
export async function fetchHistKinds(kinds = [], ins, date, { fetcher = fetch, signal } = {}) {
  const list = [...new Set(kinds.map((k) => String(k || '')).filter(Boolean))];
  const settled = await Promise.all(list.map(async (kind) => {
    try {
      return [kind, await fetchHist(kind, ins, date, { fetcher, signal })];
    } catch (error) {
      const why = error?.message || String(error);
      return [kind, { body: null, verdict: histVerdict(kind, { error: why }), rows: [] }];
    }
  }));
  const byKind = Object.fromEntries(settled);
  const verdicts = Object.fromEntries(settled.map(([kind, got]) => [kind, got.verdict]));
  return { byKind, verdicts, summary: histSummary(verdicts) };
}

/** جمع‌بندیِ چند حکم. */
export function histSummary(verdicts = {}) {
  const list = Object.values(verdicts || {});
  const of = (state) => list.filter((v) => v.state === state).length;
  return {
    total: list.length,
    rows: of('rows'), quiet: of('quiet'), blank: of('blank'),
    unverified: of('unverified'), throttled: of('throttled'),
    missing: of('missing'), error: of('error'),
    // «قابلِ تکیه» یعنی می‌دانیم چه رسید — چه داده بود چه تأییدِ خالی.
    // `unverified` عمداً اینجا نیست: داده دارد ولی پشتوانه ندارد.
    trusted: of('rows') + of('quiet'),
    // نوع‌هایی که نامشان در هشدار می‌آید.
    lost: list.filter((v) => !v.usable).map((v) => v.kind),
  };
}

/** جملهٔ هشدار، یا رشتهٔ خالی وقتی همه‌چیز رسیده. */
export function histWarning(summary) {
  if (!summary || !summary.total || summary.trusted === summary.total) return '';
  if (summary.throttled) {
    return 'سهمیهٔ بالادست بسته شد؛ این ابزار/روز کامل پرسیده نشد —'
      + ' آنچه اینجاست تمامِ آن روز نیست.';
  }
  const parts = [];
  if (summary.blank) parts.push(`${summary.blank} نوع خالی و بی‌تأیید برگشت`);
  if (summary.missing) parts.push(`${summary.missing} نوع پاسخی نداد`);
  if (summary.error) parts.push(`${summary.error} نوع خطا داد`);
  if (summary.unverified) parts.push(`${summary.unverified} نوع تأییدنشده است`);
  if (!parts.length) return '';
  return `${parts.join(' · ')}${summary.lost.length ? ` (${summary.lost.join('، ')})` : ''}`
    + ' — این لحظه با دادهٔ ناقص بازسازی می‌شود.';
}
