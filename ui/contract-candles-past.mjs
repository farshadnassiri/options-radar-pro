// دادهٔ تب «کندل بازار در گذشته»: همان بدنهٔ داشبورد زنده، برای یک روز گذشته.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵): «یک تب دیگر با نام کندل بازار در گذشته…
// دقیقاً همه آیتم‌های تب فعلی، با این تفاوت که کاربر یک تاریخ در گذشته را
// انتخاب می‌کند.»
//
// هیچ محاسبهٔ تازه‌ای اینجا نیست. فهرست قراردادهای زندهٔ آن روز از
// `/api/history/universe?date=` می‌آید (بایگانی همان روز، وگرنه دفتر
// قراردادها — قرارداد سررسیدشده هم هست)، قیمت همان روز از `/api/dailies`
// (و برای قراردادِ از تابلو رفته، منبع تک‌روزهٔ `asOf`)، و از آن به بعد همان
// `priceHistoryRows` و `decisionDashboardSnapshot` که زنجیرهٔ تاریخی و
// داشبورد زنده می‌سازند. اولین/کمینه/بیشینه از **همان ردیف روزانه** است،
// پس پاسخ هم‌جلسه است و `mergeRangeInfo` آن را می‌پذیرد.
//
// ساخته نمی‌شود: دفتر سفارش گذشته (مظنه صفر، تلاطم اجرایی خالی)، و روزی
// که ردیف روزانه ندارد (قرارداد بی‌معامله کندل ندارد، نه کندلی از روز دیگر).

import { fetchDailies } from './daily-intake.mjs';
import { priceHistoryRows, dailyAt } from '../core/history-chain.mjs';
import { decisionDashboardSnapshot } from '../core/decision-dashboard.mjs';

const BATCH = 200;

/** شمار روز تقویمی از تاریخ خواسته تا امروز — برای `n` فهرست روزانه. */
export function daysBack(date, today) {
  const parse = (v) => {
    const s = String(v).replace(/\D/g, '');
    return s.length === 8 ? Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) : NaN;
  };
  const d = (parse(today) - parse(date)) / 86400000;
  return Number.isFinite(d) && d >= 0 ? Math.min(2000, Math.ceil(d) + 10) : 0;
}

/** نمادهای پایهٔ فهرست آن روز، با شمار قرارداد هر کدام. */
export function pastUnderlyings(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const ins = String(row?.uaInsCode ?? '');
    if (!ins) continue;
    if (!map.has(ins)) map.set(ins, { ins, name: String(row.lval30_UA || '').trim() || ins, contracts: 0, expiries: new Set() });
    const item = map.get(ins);
    item.contracts += (row.insCode_C ? 1 : 0) + (row.insCode_P ? 1 : 0);
    item.expiries.add(String(row.expiryGregorian || row.endDate || ''));
  }
  return [...map.values()].map((u) => ({ ...u, expiries: u.expiries.size })).sort((a, b) => b.contracts - a.contracts || a.name.localeCompare(b.name, 'fa'));
}

/** فهرست قراردادهای آن روز. */
export async function fetchPastUniverse(date, { fetcher = fetch } = {}) {
  const response = await fetcher(`/api/history/universe?date=${Number(date)}`, { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok || body?.error) throw new Error(body?.error || `پاسخ ${response.status}`);
  return body;
}

/**
 * بدنهٔ هم‌شکل `/api/live-dashboard` برای یک روز گذشته، و پاسخ‌های «اطلاعات»
 * هم‌شکل `/api/infos` (اولین/کمینه/بیشینه) از ردیف روزانهٔ همان روز.
 */
export function buildPastDay(rows = [], dailyByIns = {}, date = 0, settings = {}) {
  const priced = priceHistoryRows(rows, dailyByIns, date);
  const universe = decisionDashboardSnapshot(priced.rows, settings);
  const infos = {};
  const seriesOf = (ins) => {
    const box = dailyByIns?.[ins];
    return Array.isArray(box) ? box : (box?.rows || []);
  };
  const codes = new Set();
  for (const row of rows) for (const key of ['uaInsCode', 'insCode_C', 'insCode_P']) if (row?.[key]) codes.add(String(row[key]));
  for (const ins of codes) {
    const day = dailyAt(seriesOf(ins), date);
    if (!day) continue;
    infos[ins] = { first: Number(day.first) || 0, low: Number(day.low) || 0, high: Number(day.high) || 0, last: Number(day.last) || 0, close: Number(day.close) || 0, yday: Number(day.yday) || 0, trades: Number(day.trades) || 0 };
  }
  return {
    payload: { universe, session: { current: false, date: Number(date), past: true }, at: Date.now(), snapshotAt: 0, historyDate: Number(date) },
    infos,
    coverage: { legsPriced: priced.legsPriced, legsTotal: priced.legsTotal, basesMissing: priced.basesMissing, legsFailed: priced.legsFailed, basesFailed: priced.basesFailed },
  };
}

/**
 * قیمت همان روزِ نمادهای انتخابی را می‌گیرد و روز را می‌سازد. `onProgress`
 * پیشرفت دسته‌ها را می‌گوید؛ خطای یک دسته بقیه را نمی‌اندازد و شمرده می‌شود.
 */
export async function loadPastDay({ date, rows = [], underlyings = [], settings = {}, today, fetcher = fetch, onProgress = () => {}, signal } = {}) {
  const want = new Set(underlyings.map(String));
  const picked = rows.filter((row) => !want.size || want.has(String(row?.uaInsCode ?? '')));
  const codes = [...new Set(picked.flatMap((row) => [row.uaInsCode, row.insCode_C, row.insCode_P]).filter(Boolean).map(String))];
  const n = daysBack(date, today);
  const dailyByIns = {};
  let failed = 0, done = 0;
  for (let i = 0; i < codes.length; i += BATCH) {
    signal?.throwIfAborted?.();
    const part = codes.slice(i, i + BATCH);
    try {
      const got = await fetchDailies(part, { asOf: date, n, fetcher, signal });
      Object.assign(dailyByIns, got.byIns);
    } catch (error) {
      if (signal?.aborted) throw error;
      failed += part.length;
      for (const ins of part) dailyByIns[ins] = { rows: [], error: String(error?.message || error) };
    }
    done += part.length;
    onProgress({ done, total: codes.length });
  }
  return { ...buildPastDay(picked, dailyByIns, date, settings), requested: codes.length, failed };
}
