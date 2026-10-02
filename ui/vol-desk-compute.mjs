// نقطه‌های میز تلاطم بیرون از نخ اصلی.
//
// یک ریسهٔ مشترک برای همهٔ میزهای صفحه (`worker/vol-desk-worker.mjs`) با کشِ
// خودش. اگر ریسه در دسترس نبود (محیط آزمون، مرورگر محدود) یا شکست، همان
// `deskDays` همین‌جا اجرا می‌شود — نتیجه یکی است، فقط کندتر.

import { intradayContext } from '../core/vol-intraday.mjs';
import { deskDays } from '../core/vol-desk.mjs';

let worker = null, broken = false, nextId = 0;
const waiting = new Map();

function ensureWorker() {
  if (broken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker('/worker/vol-desk-worker.mjs', { type: 'module' });
    worker.onmessage = (event) => {
      const m = event.data || {};
      const job = waiting.get(m.id);
      if (!job) return;
      waiting.delete(m.id);
      if (m.error) job.reject(new Error(m.error)); else job.resolve(m.days);
    };
    worker.onerror = () => {
      broken = true;
      for (const job of waiting.values()) job.fallback();
      waiting.clear();
      try { worker.terminate(); } catch { /* رفته */ }
      worker = null;
    };
    return worker;
  } catch { broken = true; return null; }
}

const inline = (api, settings, calendar) => deskDays(api, intradayContext(settings || {}, {
  holidays: calendar?.holidays || [], holidaysKnown: Boolean(calendar?.known),
}));

/** همان خروجی `deskDays(api, ctx)`، با `raw` هر روز. */
export function computeDeskDays(api, settings, calendar) {
  const w = ensureWorker();
  if (!w) return Promise.resolve(inline(api, settings, calendar));
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const fallback = () => { try { resolve(inline(api, settings, calendar)); } catch (e) { reject(e); } };
    waiting.set(id, { resolve, reject, fallback });
    w.postMessage({ id, api, settings, holidays: calendar?.holidays || [], holidaysKnown: Boolean(calendar?.known) });
  }).then((days) => {
    const raw = new Map((api?.days || []).map((day) => [day.date, day]));
    return days.map((day) => (day.raw ? day : { ...day, raw: raw.get(day.date) }));
  });
}
