// دروازهٔ ورودِ تابلوی روزانه — یک در، برای همهٔ تب‌ها.
//
// ═══ چرا این ماژول لازم شد ═══
//
// `ui/tape-intake.mjs` همین کار را برای ریزمعامله کرد. ولی تابلوی روزانه
// **مرجعِ سنجشِ ریزمعامله** است: هر حکمِ «کامل» یا «ناقص» در کلِ برنامه
// روی آن بنا شده. وقتی خودِ مرجع خالی برگردد و کسی نفهمد، آن حکم‌ها
// بی‌پشتوانه می‌شوند — و این بدتر از نبودِ حکم است، چون شبیهِ حکم است.
//
// و خالی‌بودن سه علت دارد که فقط یکی‌شان واقعیتِ بازار است:
//
//   ۱. قراردادِ سررسیدشده از تابلو حذف شده → واقعی، و `asOf` برایش هست
//   ۲. سهمیهٔ بالادست                      → `HTTP 200` با آرایهٔ خالی
//   ۳. ابزارِ واقعاً بی‌تاریخچه            → نادر
//
// در خروجیِ واقعیِ ۲۰۲۶۰۷۱۴ تا ۲۰۲۶۰۹۲۱، از ۱۵۹ ابزار فقط **۱۰** تا
// تابلو داشتند و هیچ‌جای برنامه این را نگفت — برگ راهنما حتی نوشت «هر
// ابزارِ درخواست‌شده تابلوی روزانه‌اش پاسخ گرفت».
//
// ═══ و یک نکتهٔ شکلی ═══
//
// پاسخِ `/api/dailies` یک شیءِ کلید‌دار بر حسبِ کدِ ابزار است، و حالا یک
// کلیدِ `__meta` هم دارد. پنج جای رابط `Object.entries(payload)` را خام
// می‌پیمودند و `__meta` برایشان یک «ابزار» می‌شد. این دروازه آن را جدا
// می‌کند، پس هیچ مصرف‌کننده‌ای لازم نیست دربارهٔ شکلِ پاسخ چیزی بداند.

import { num } from '../core/num.mjs';

const n = (x) => num(x);

/** حالت‌های یک ابزار در پاسخِ تابلوی روزانه. */
export const DAILY_STATE = {
  rows: 'تاریخچه آمد',
  blank: 'تابلوی روزانه خالی برگشت',
  missing: 'ابزار در پاسخ نبود',
  error: 'خطای دریافت',
};

/** کلیدی که ابزار نیست و نباید مثل ابزار پیموده شود. */
export const META_KEY = '__meta';

/** حکمِ یک ابزار. */
export function dailyVerdict(value) {
  if (!value) return { state: 'missing', rows: 0, usable: false };
  if (value.error) return { state: 'error', rows: 0, usable: false, why: String(value.error) };
  const rows = Array.isArray(value.rows) ? value.rows.length : 0;
  if (!rows) return { state: 'blank', rows: 0, usable: false, fallbackTried: value.fallbackTried === true };
  return { state: 'rows', rows, usable: true, source: String(value.source || '') };
}

/**
 * یک بستهٔ تابلوی روزانه، با حکمِ هر ابزار.
 *
 * `byIns` فقط ابزارهاست — `__meta` از آن جدا شده. `meta` شمارشِ سرور را
 * دارد و `suspectThrottled` می‌گوید آیا الگوی سهمیه دیده شده.
 */
export async function fetchDailies(codes = [], { asOf = 0, n: count = 0, fetcher = fetch, signal } = {}) {
  const wanted = [...new Set((codes || []).map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!wanted.length) return { byIns: {}, verdicts: {}, meta: null, summary: dailySummary({}) };
  const query = `ins=${wanted.join(',')}&n=${Math.max(0, Math.trunc(n(count)))}`
    + `${asOf ? `&asOf=${encodeURIComponent(String(asOf))}` : ''}`;
  const response = await fetcher(`/api/dailies?${query}`, { signal });
  const payload = await response.json();
  if (!response.ok || payload?.error) throw new Error(payload?.error || `پاسخ ${response.status}`);

  const meta = payload?.[META_KEY] || null;
  const byIns = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (key === META_KEY) continue;
    byIns[key] = value;
  }
  const verdicts = {};
  for (const ins of wanted) verdicts[ins] = dailyVerdict(byIns[ins]);
  return { byIns, verdicts, meta, summary: dailySummary(verdicts, meta) };
}

/** جمع‌بندیِ یک بسته. */
export function dailySummary(verdicts = {}, meta = null) {
  const list = Object.values(verdicts || {});
  const of = (state) => list.filter((v) => v.state === state).length;
  const withRows = of('rows');
  return {
    total: list.length,
    rows: withRows, blank: of('blank'), missing: of('missing'), error: of('error'),
    // «بی‌مرجع» یعنی این ابزار هیچ تابلویی ندارد، پس هر حکمی دربارهٔ
    // ریزمعامله‌اش تأییدنشده می‌ماند.
    unreferenced: list.length - withRows,
    suspectThrottled: Boolean(meta?.suspectThrottled),
    note: String(meta?.note || ''),
  };
}

/**
 * جملهٔ هشدار، یا رشتهٔ خالی وقتی هر ابزار تابلو دارد.
 *
 * عمداً می‌گوید **چه چیزی از دست می‌رود**، نه فقط چند تا خالی بود:
 * بی تابلو، ریزمعاملهٔ همان ابزار سنجیده نمی‌شود.
 */
export function dailyWarning(summary) {
  if (!summary || !summary.total || !summary.unreferenced) return '';
  if (summary.suspectThrottled) return summary.note;
  const parts = [];
  if (summary.blank) parts.push(`${summary.blank} ابزار تابلوی روزانه‌شان خالی برگشت`);
  if (summary.missing) parts.push(`${summary.missing} ابزار در پاسخ نبودند`);
  if (summary.error) parts.push(`${summary.error} ابزار خطا دادند`);
  return `${parts.join(' · ')} — ریزمعاملهٔ این‌ها با هیچ مرجعی سنجیده نمی‌شود،`
    + ' پس حکمِ «کامل» یا «ناقص» برایشان صادر نخواهد شد.';
}
