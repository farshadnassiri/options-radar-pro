import { normalizeHistoryDate } from '../core/history.mjs';

/** تاریخچهٔ کامل، با همان منبع دومِ آزمون همه برای قراردادهای سررسیدشده. */
export async function loadHistoricalDailies(codes, baseIns, fetcher = fetch) {
  const seriesByIns = {}, errors = {};
  const request = async (wanted, asOf = 0) => {
    const batches = Array.from({ length: Math.ceil(wanted.length / 70) }, (_, i) => wanted.slice(i * 70, (i + 1) * 70));
    const payloads = await Promise.all(batches.map(async (part) => {
      const response = await fetcher(`/api/dailies?ins=${part.join(',')}&n=0${asOf ? `&asOf=${asOf}` : ''}`);
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
      return payload;
    }));
    for (const payload of payloads) for (const [ins, value] of Object.entries(payload)) {
      seriesByIns[ins] = value.rows || [];
      if (value.error || value.fallbackError) errors[ins] = String(value.error || value.fallbackError);
    }
  };
  await request(codes);
  // روز مرجع از سری واقعی پایه می‌آید، نه از ساعت رایانه یا قیمت حدسی.
  const asOf = Math.max(0, ...(seriesByIns[String(baseIns)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean));
  const empty = codes.filter((ins) => !seriesByIns[ins]?.length && !errors[ins]);
  if (asOf && empty.length) await request(empty, asOf);
  return { seriesByIns, errors };
}
