import { normalizeHistoryDate } from '../core/history.mjs';

/** تاریخچهٔ کامل، با همان منبع دومِ آزمون همه برای قراردادهای سررسیدشده. */
export async function loadHistoricalDailies(codes, baseIns, fetcher = fetch, { onProgress = () => {}, signal, tolerateErrors = false } = {}) {
  const seriesByIns = {}, errors = {};
  const request = async (wanted, asOf = 0) => {
    let done = 0;
    const phase = asOf ? 'fallback' : 'daily';
    onProgress({ phase, done, total: wanted.length });
    const batches = Array.from({ length: Math.ceil(wanted.length / 70) }, (_, i) => wanted.slice(i * 70, (i + 1) * 70));
    await Promise.all(batches.map(async (part) => {
      try {
        signal?.throwIfAborted();
        const response = await fetcher(`/api/dailies?ins=${part.join(',')}&n=0${asOf ? `&asOf=${asOf}` : ''}`, { signal });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
        for (const ins of part) {
          const value = payload[ins];
          seriesByIns[ins] = Array.isArray(value?.rows) ? value.rows : [];
          const error = value?.error || value?.fallbackError || (!Array.isArray(value?.rows) ? 'پاسخ معتبر این ابزار دریافت نشد' : '');
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
  return { seriesByIns, errors };
}
