import { applyLiveScope } from './live-scope.mjs';
import { normalizeHistoryDate } from '../core/history.mjs';
import { fetchDailies } from './daily-intake.mjs';

/** تاریخچهٔ کامل، با همان منبع دومِ آزمون همه برای قراردادهای سررسیدشده. */
/**
 * ── دو منبع، یک سری ────────────────────────────────────────────────
 *
 * گزارش صاحب پروژه (۱۴۰۵/۰۶/۲۵): «امروز ۲۴ است ولی در تقویم انتخابگر تا
 * ۲۳ آمده… برای روزهای قبل دیتای تاریخی داریم و برای روز جاری هم قیمت‌ها
 * را داریم.»
 *
 * دقیقاً همین است: دفتر روزانهٔ بالادست ردیفِ یک روز را تا **پایان** همان
 * روز منتشر نمی‌کند. پس هر فهرست تاریخی که فقط از `/api/dailies` ساخته
 * شود، تا شب یک روز عقب است — و کاربر روزی را که قیمتش روی تابلو هست
 * نمی‌تواند انتخاب کند.
 *
 * `includeToday` همان «اندپوینت دوم» است: عکس زندهٔ تابلو به انتهای سری
 * چسبانده می‌شود. هیچ‌وقت پرتاب نمی‌کند و شکستش سری را خراب نمی‌کند —
 * `liveNote` می‌گوید چه شد، و ردیف امروز صریحاً «بسته‌نشده» علامت می‌خورد.
 */
export async function loadHistoricalDailies(codes, baseIns, fetcher = fetch, { onProgress = () => {}, signal, tolerateErrors = false, includeToday = true, tapeFor = 'bases' } = {}) {
  const seriesByIns = {}, errors = {};
  const request = async (wanted, asOf = 0) => {
    let done = 0;
    const phase = asOf ? 'fallback' : 'daily';
    onProgress({ phase, done, total: wanted.length });
    const batches = Array.from({ length: Math.ceil(wanted.length / 70) }, (_, i) => wanted.slice(i * 70, (i + 1) * 70));
    await Promise.all(batches.map(async (part) => {
      try {
        signal?.throwIfAborted();
        // R5-14: از دروازهٔ مشترک، تا `__meta` وارد پیمایشِ ابزارها نشود
        // و خالی‌بودنِ تابلو از «تاریخچه ندارد» جدا بماند.
        const payload = (await fetchDailies(part, { asOf, fetcher, signal })).byIns;
        for (const ins of part) {
          const value = payload[ins];
          seriesByIns[ins] = Array.isArray(value?.rows) ? value.rows : [];
          // ═══ چرا `fallbackNote` هم خطا شمرده می‌شود ═══
          //
          // بند ۵ ممیزی: منبع جایگزین یک endpoint **تک‌روزه** است و
          // حلقهٔ بازه ندارد. برگشتنِ «چند ردیف» اثبات نمی‌کند روزِ
          // خواسته‌شده در دست است — و نمونهٔ واقعی نشان داد می‌تواند یک
          // عکسِ پیش‌جلسه با قیمتِ دیروز باشد. سرور حالا می‌گوید پوشش داد
          // یا نه؛ سکوت در برابر این پیام یعنی همان ادعای بی‌پشتوانه.
          const error = value?.error || value?.fallbackError || value?.fallbackNote
            || (!Array.isArray(value?.rows) ? 'پاسخ معتبر این ابزار دریافت نشد' : '');
          if (error) errors[ins] = String(error);
        }
      } catch (error) {
        if (signal?.aborted || !tolerateErrors) throw error;
        for (const ins of part) { seriesByIns[ins] = []; errors[ins] = String(error.message || error); }
      } finally {
        done += part.length;
        if (!signal?.aborted) onProgress({ phase, done, total: wanted.length });
      }
    }));
  };
  await request(codes);
  // روز مرجع از سری واقعی پایه می‌آید، نه از ساعت رایانه یا قیمت حدسی.
  const asOf = Math.max(0, ...(seriesByIns[String(baseIns)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean));
  const empty = codes.filter((ins) => !seriesByIns[ins]?.length && !errors[ins]);
  if (asOf && empty.length) await request(empty, asOf);
  if (!includeToday) return { seriesByIns, errors, liveNote: '', liveDate: 0 };
  const live = await applyLiveScope(seriesByIns, { fetcher, tapeFor });
  return { seriesByIns: live.series, errors, liveNote: live.note, liveDate: live.date || 0 };
}
