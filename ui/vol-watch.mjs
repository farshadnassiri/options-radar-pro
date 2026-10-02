// سنجه‌های تلاطم نمادهای پایه برای دیده‌بان شرطی.
//
// همان داده و موتور میز تلاطم (`/api/vol/intraday` ← `core/vol-desk.mjs`)؛
// هر پایه حداکثر هر شصت ثانیه یک بار از سرورِ محلی پرسیده می‌شود و هیچ
// ساختی آغاز نمی‌شود. خطا سنجه را `NaN` می‌گذارد، نه صفر.

import { readVolSummary } from './vol-rank-store.mjs';
import { deskFrom } from './vol-desk-view.mjs';
import { tehranDateNumber } from '../core/tehran-day.mjs';
import { intradayContext } from '../core/vol-intraday.mjs';
import { deskDays, deskModel, volWatchValues } from '../core/vol-desk.mjs';

export const VOL_WATCH_TTL_MS = 60000;

export function makeVolWatch({ getSettings = () => ({}), fetcher = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  const values = new Map();
  const at = new Map();
  let calendar = null;
  async function one(ins) {
    const today = tehranDateNumber();
    const body = await (await fetcher(`/api/vol/intraday?ua=${encodeURIComponent(ins)}&from=${deskFrom(today, 10)}&to=${today}&grain=m5&mode=trades`, { cache: 'no-store' })).json();
    if (body.error) throw new Error(body.error);
    const ctx = intradayContext(getSettings(), { holidays: calendar?.holidays || [], holidaysKnown: Boolean(calendar?.known) });
    const model = deskModel({ days: deskDays(body, ctx), today: body.today, ctx, summary: readVolSummary(ins), compareDays: 10 });
    return volWatchValues(model);
  }
  return {
    /** پایه‌هایی که کهنه‌اند را تازه می‌کند؛ هرگز پرتاب نمی‌کند. */
    async refresh(list = []) {
      if (!calendar) {
        try { calendar = await (await fetcher('/api/vol/calendar', { cache: 'no-store' })).json(); } catch { calendar = { known: false, holidays: [] }; }
      }
      const due = [...new Set(list.map(String).filter(Boolean))].filter((ins) => now() - (at.get(ins) || 0) >= VOL_WATCH_TTL_MS);
      await Promise.all(due.map(async (ins) => {
        at.set(ins, now());
        try { values.set(ins, await one(ins)); } catch { values.delete(ins); }
      }));
    },
    get: (ins) => values.get(String(ins)) || null,
  };
}
