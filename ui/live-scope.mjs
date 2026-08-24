// دامنهٔ داده: «تا آخرین روز بسته‌شده» یا «تا همین لحظه».
//
// دو تب — تحلیل تاریخی استراتژی و آزمون همه استراتژی‌ها — همین انتخاب را
// دارند و هر دو باید دقیقاً یک رفتار نشان بدهند. اگر هرکدام نسخهٔ خودش را
// می‌داشت، شش ماه بعد یکی روز جاری را جور دیگری می‌چسباند و هیچ‌کس
// نمی‌فهمید کدام درست است. پس مسیر یکی است و اینجا می‌نشیند.
//
// این ماژول فقط «چسباندن» را انجام می‌دهد؛ خودِ قاعده — کدام ابزار ردیف
// می‌گیرد، کدام روز مهر می‌خورد — در `core/live-day.mjs` است و جدا آزمون
// می‌شود.

import { liveDayOf, liveDayRows, mergeLiveDay } from '../core/live-day.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { fmt, faClock, faDigits } from './fmt.mjs';

export const SCOPE_CLOSED = 'closed';
export const SCOPE_LIVE = 'live';

/** گزینه‌های انتخابگر. حالت پیش‌فرض همان رفتار قبلی است، نه رفتار تازه. */
export const SCOPE_OPTIONS = [
  [SCOPE_CLOSED, 'تا آخرین روز بسته‌شده'],
  [SCOPE_LIVE, 'از روز مبدأ تا همین لحظه'],
];

export const scopeOptionsMarkup = (selected = SCOPE_CLOSED) => SCOPE_OPTIONS
  .map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`)
  .join('');

/**
 * ردیف روز جاری را روی سری‌های روزانه می‌نشاند.
 *
 * هیچ‌وقت پرتاب نمی‌کند. شکست — چه شبکه، چه روزی که به عکس نمی‌چسبد —
 * یعنی `ok: false` و برگشتِ **همان** سری‌های ورودی: حالت قبلی هرگز به‌خاطر
 * این قابلیت خراب نمی‌شود. `note` می‌گوید چه شد.
 */
export async function applyLiveScope(seriesByIns, { fetcher = fetch } = {}) {
  const total = Object.keys(seriesByIns || {}).length;
  try {
    const response = await fetcher('/api/history/universe', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'عکس لحظه‌ای دریافت نشد');
    const day = liveDayOf(payload.market, payload.at);
    if (!day.ok) {
      return {
        ok: false, series: seriesByIns, date: 0, at: payload.at ?? null,
        note: `عکس لحظه‌ای به روز جاری نسبت داده نشد${day.why ? ` — ${day.why}` : ''}؛ همان روزهای بسته‌شده مبنا ماند.`,
      };
    }
    const merged = mergeLiveDay(seriesByIns, liveDayRows(payload.rows, { date: day.date }), { date: day.date });
    return { ok: true, ...merged, at: payload.at ?? null, note: scopeNote(merged, { total, at: payload.at }) };
  } catch (error) {
    return {
      ok: false, series: seriesByIns, date: 0, at: null,
      note: `عکس لحظه‌ای دریافت نشد (${error.message})؛ همان روزهای بسته‌شده مبنا ماند.`,
    };
  }
}

/**
 * جمله‌ای که کاربر می‌خواند. جدا و خالص است چون تنها چیزی است که از صحت
 * این مسیر می‌بیند، و باید مستقیم آزمون شود نه از دل رابط بیرون کشیده شود.
 *
 * هرگز بیش از عدد ادعا نمی‌کند: اگر هیچ نمادی امروز معامله نشده باشد،
 * جمله همین را می‌گوید — نه «به‌روز شد».
 */
export function scopeNote(result, { total = 0, at = null } = {}) {
  // برچسب تاریخ هم رقم فارسی می‌گیرد؛ همان کاری که تقویم برنامه می‌کند
  const label = faDigits(historyDateLabel(result?.date));
  const clock = Number.isFinite(Number(at)) && Number(at) > 0 ? ` (ساعت ${faClock(new Date(Number(at)))})` : '';
  const touched = (result?.added || 0) + (result?.updated || 0);
  if (!touched) {
    return `تا ${label}${clock} هیچ‌کدام از ${fmt.int(total)} نماد امروز معامله‌ای نداشتند؛ ردیف لحظه‌ای ساخته نشد.`;
  }
  const parts = [];
  if (result.added) parts.push(`${fmt.int(result.added)} نماد ردیف تازهٔ امروز گرفت`);
  if (result.updated) parts.push(`${fmt.int(result.updated)} نماد ردیف امروزش تازه شد`);
  return `تا ${label}${clock} · ${parts.join(' و ')} از ${fmt.int(total)} نماد. این روز بسته نشده و ارقامش نهایی نیست.`;
}
