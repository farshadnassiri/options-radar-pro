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
    const receivedAt = now();
    if (body.error) throw new Error(body.error);
    if (String(body.ua) !== String(ins)) throw new Error('پاسخ مال نماد دیگری است');
    const ctx = intradayContext(getSettings(), { holidays: calendar?.holidays || [], holidaysKnown: Boolean(calendar?.known) });
    // ساعت سرور، نه آخرین قاب: «اکنون» کهنه نباید شرط را برقرار کند (گزارش ۳۷۱۲e1a، بند ۲).
    const nowSecond = Number.isFinite(body.nowSecond) ? body.nowSecond + (now() - receivedAt) / 1000 : NaN;
    const model = deskModel({ days: deskDays(body, ctx), today: body.today, ctx, summary: readVolSummary(ins), compareDays: 10, nowSecond });
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
    /** مقدارِ کهنه‌تر از دو دورِ تازه‌سازی دیگر داده نمی‌شود. */
    get: (ins) => (now() - (at.get(String(ins)) || 0) <= 2 * VOL_WATCH_TTL_MS ? values.get(String(ins)) || null : null),
  };
}
