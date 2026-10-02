// خلاصهٔ رتبهٔ تلاطم هر پایه، برای جاهای دیگر برنامه.
//
// ساختن IVR یک پایه تاریخچهٔ یک‌ساله می‌خواهد و فقط تب «رتبه و صدک تلاطم»
// آن را می‌سازد. هر بار که آنجا ساخته شد، یک خلاصهٔ کوچک (IVR، IVP، پله و
// روزِ داده) اینجا می‌ماند تا انتخابگر نماد، نقشهٔ بازار و تب‌های استراتژی
// بی‌درخواستِ تازه نشانش دهند — با تاریخش، چون ممکن است چند روز پیش ساخته
// شده باشد. حافظهٔ مرورگر فقط یک راحتی است: نبودنش یعنی نشانی نیست، نه خطا.

import { fmt, faDigits } from './fmt.mjs';
import { historyDateLabel, daysBetween } from '../core/history.mjs';

const KEY = 'options-radar:vol-rank-summary';
const CAP = 300;
const STALE_DAYS = 7;
const isNum = (value) => Number.isFinite(value);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));

const storageOf = (storage) => {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
};

function readAll(storage) {
  try { return JSON.parse(storageOf(storage)?.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

/** خلاصه از خروجی `buildVolHistory`؛ بی شاخصِ امروز، هیچ. */
export function volSummaryOf(history, { ua, lookback } = {}) {
  const cur = history?.current;
  if (!ua || !cur || !isNum(cur.ivPct)) return null;
  return {
    ua: String(ua), date: cur.date, live: Boolean(cur.live),
    ivPct: cur.ivPct, ivr: history.rank?.ivr, ivp: history.rank?.ivp,
    regimeId: history.regime?.id || 'unknown', regimeLabel: history.regime?.label || '',
    tone: history.regime?.tone || 'neutral',
    lookback: Number(lookback) || history.params?.lookback || 0,
    // تلاطم تاریخیِ هم‌افق، برای «IV ÷ HV» در میز تلاطم.
    hvPct: history.rows?.at(-1)?.hv?.[history.params?.hvWindow] ?? NaN,
    hvWindow: history.params?.hvWindow || 0,
  };
}

export function saveVolSummary(summary, storage) {
  if (!summary?.ua) return;
  try {
    const all = readAll(storage);
    all[summary.ua] = { ...summary, at: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > CAP) {
      keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0)).slice(0, keys.length - CAP).forEach((k) => delete all[k]);
    }
    storageOf(storage)?.setItem(KEY, JSON.stringify(all));
  } catch { /* حافظهٔ مرورگر در دسترس نیست یا پر است */ }
}

export function readVolSummary(ua, storage) {
  if (!ua) return null;
  const hit = readAll(storage)[String(ua)];
  return hit && isNum(hit.ivPct) ? hit : null;
}

/** «کهنه» یعنی دادهٔ خلاصه بیش از یک هفته پیش از امروز است. */
export function volSummaryStale(summary, today) {
  const gap = daysBetween(summary?.date, today);
  return isNum(gap) && gap > STALE_DAYS;
}

const rank = (value) => (isNum(value) ? fmt.int(Math.round(value)) : '—');

/** نشانِ کوچک کنار نام نماد. بی خلاصه، رشتهٔ خالی — نه «—» در هر ردیف. */
export function volChipHtml(summary, { today = 0 } = {}) {
  if (!summary) return '';
  const stale = today ? volSummaryStale(summary, today) : false;
  const title = `تلاطم ضمنی ${fmt.pct(summary.ivPct)}٪ · ${summary.regimeLabel || ''} · داده ${faDigits(historyDateLabel(summary.date))}${stale ? ' (کهنه)' : ''} — جزئیات در «رتبه و صدک تلاطم»`;
  return `<span class="vr-chip" data-tone="${esc(summary.tone)}"${stale ? ' data-stale="true"' : ''} title="${esc(title)}">IVR ${rank(summary.ivr)} · IVP ${rank(summary.ivp)}</span>`;
}

/** کاشیِ نقشهٔ بازار: [عنوان، مقدار، توضیح]. */
export function volTileParts(summary, { today = 0 } = {}) {
  if (!summary) return ['رتبهٔ تلاطم', '—', 'هنوز ساخته نشده — تب «رتبه و صدک تلاطم»'];
  const stale = today ? volSummaryStale(summary, today) : false;
  return [
    'رتبهٔ تلاطم',
    `IVR ${rank(summary.ivr)} · IVP ${rank(summary.ivp)}`,
    `${summary.regimeLabel || '—'} · IV ${fmt.pct(summary.ivPct)}٪ · ${faDigits(historyDateLabel(summary.date))}${stale ? ' (کهنه)' : ''}`,
  ];
}
