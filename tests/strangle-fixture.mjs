// بازار ساختگیِ آزمون‌های «استرانگل بازی» — مشترک میان دسته‌های ۳۲۱ و ۳۲۲.
// قیمت قراردادها بلک-شولز است و ردیف‌ها هم‌شکل پاسخ واقعی `/api/history`.

import { bsPrice } from '../core/bs.mjs';
import { buildLabMarket } from '../core/strangle-lab.mjs';
import { near } from './harness.mjs';

export const EXPIRY = 20250220;
export const STRIKES = [];
for (let K = 700; K <= 1300; K += 50) STRIKES.push(K);
export const dteOf = (dt) => Math.round((Date.UTC(2025, 1, 20) - Date.UTC(Math.trunc(dt / 1e4), Math.trunc(dt % 1e4 / 100) - 1, dt % 100)) / 864e5);

/** بازار ساختگی با قیمت بلک-شولز؛ `skip` قیمت چند قرارداد را در چند روز برمی‌دارد. */
export function fixture(path, { skip = {}, sigma = 0.4 } = {}) {
  const rows = STRIKES.map((K) => ({
    uaInsCode: 'UA', lval30_UA: 'پایه', strikePrice: K, expiryGregorian: EXPIRY, endDate: 14031202,
    insCode_C: `C${K}`, insCode_P: `P${K}`, lVal18AFC_C: `ض${K}`, lVal18AFC_P: `ط${K}`, contractSize: 0,
  }));
  rows.push({ uaInsCode: 'OTHER', lval30_UA: 'دیگر', strikePrice: 100, expiryGregorian: 20250320, insCode_C: 'X', insCode_P: '' });
  const dates = [];
  let d = Date.UTC(2025, 0, 5);
  for (let i = 0; i < path.length; i += 1) { dates.push(Number(new Date(d).toISOString().slice(0, 10).replace(/-/g, ''))); d += 2 * 864e5; }
  const dailies = { UA: { rows: dates.map((date, i) => ({ date, close: path[i], last: path[i] })) } };
  for (const K of STRIKES) {
    for (const side of ['call', 'put']) {
      const ins = `${side === 'call' ? 'C' : 'P'}${K}`;
      dailies[ins] = { rows: dates.map((date, i) => {
        const close = bsPrice(side, path[i], K, dteOf(date) / 365, 0.3, 0, sigma);
        return { date, close, last: 0, first: close * 0.95, low: close * 0.9, high: close * 1.1, value: close * 1000 * (10 + (K % 7)), vol: 10 + (K % 7) };
      })
        .filter((row, i) => !(skip[ins] || []).includes(i)) };
    }
  }
  const market = buildLabMarket({ rows, dailies, uaIns: 'UA', expiry: EXPIRY, from: dates[0], to: dates.at(-1), size: 1000 });
  return { rows, dailies, dates, market };
}

export const FEES = { option: 0.00103, exercise: 0.0005 };
export const SIDES_OK = (st) => ['call', 'put'].every((side) => near(st.trades.filter((t) => t.side === side).reduce((a, t) => a + t.premium, 0), st.bySide[side].received));
export const UP = [1000, 1005, 1020, 1045, 1070, 1090, 1110, 1120, 1140, 1150, 1160, 1170];
