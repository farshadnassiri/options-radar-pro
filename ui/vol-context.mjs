// زمینهٔ تلاطم برای تب‌های تاریخی: بارگذاری مشترک و نوار نمایش.
//
// تاریخچهٔ تلاطم هر پایه یک بار در هر نشست ساخته می‌شود (قیمت روزانهٔ
// پایه + پرونده‌های روزانهٔ قراردادها) و همهٔ تب‌ها از همان حافظه می‌خوانند.
// این مسیر هیچ ساختی آغاز نمی‌کند (`build=0`): اگر پرونده‌های روزانه کم
// باشند، نوار می‌گوید پوشش چقدر است و ساختن در تب «رتبه و صدک تلاطم» است.
// عددها از `core/vol-rank.mjs` و `core/vol-context.mjs`؛ اینجا فقط رشته.

import { fmt, faDigits, ltr } from './fmt.mjs';
import { fetchDailies } from './daily-intake.mjs';
import { historyDateLabel, normalizeHistoryDate } from '../core/history.mjs';
import { tehranDateNumber } from '../core/tehran-day.mjs';
import { buildVolHistory, panelObservations, volParams, volRangeFor, VOL_DEFAULTS } from '../core/vol-rank.mjs';
import { volContextAt, volContextBetween, VOL_CONTEXT_WHY, VOL_HINDSIGHT_LABEL, VOL_HINDSIGHT_NOTE } from '../core/vol-context.mjs';
import { volDeskLinkHtml } from './vol-desk-link.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const isNum = (value) => Number.isFinite(value);
const pct = (value) => (isNum(value) ? `${fmt.pct(value)}٪` : '—');
const rank = (value) => (isNum(value) ? fmt.int(Math.round(value)) : '—');
const signed = (value, unit = ' واحد') => (isNum(value) ? `${ltr(`${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt.pct(Math.abs(value))}`)}${unit}` : '—');
const dateLabel = (value) => faDigits(historyDateLabel(value));

const memo = new Map();

/**
 * همان پارامترهایی که کاربر در تب «رتبه و صدک تلاطم» برگزیده — وگرنه
 * عددِ اینجا با عدد آنجا یکی نمی‌شد.
 */
function rankOpts() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem('options-radar:vol-rank') || '{}') || {};
    const pick = (key) => (saved[key] !== undefined ? saved[key] : VOL_DEFAULTS[key]);
    return { lookback: Number(pick('lookback')), method: pick('method'), targetDays: Number(pick('targetDays')), priceBasis: pick('priceBasis'), hvWindow: Number(pick('hvWindow')) };
  } catch { return { lookback: VOL_DEFAULTS.lookback, method: VOL_DEFAULTS.method, targetDays: VOL_DEFAULTS.targetDays, priceBasis: VOL_DEFAULTS.priceBasis, hvWindow: VOL_DEFAULTS.hvWindow }; }
}

/**
 * تاریخچهٔ تلاطم یک پایه که `from`…`to` را بپوشاند (به‌علاوهٔ بازهٔ رتبه
 * پیش از `from`). یک بار در هر نشست برای هر پایه و بازه.
 */
export function loadVolContext(ua, { from = 0, to = 0, settings = {}, fetcher = (...a) => fetch(...a) } = {}) {
  const code = String(ua || '');
  if (!code) return Promise.resolve(null);
  const today = tehranDateNumber();
  const end = Math.min(normalizeHistoryDate(to) || today, today);
  const start = normalizeHistoryDate(from) || end;
  const opts = rankOpts();
  const range = volRangeFor(opts.lookback, start);
  const sig = [opts.lookback, opts.method, opts.targetDays, opts.priceBasis, opts.hvWindow].join(',');
  const key = `${code}:${range.from}:${end}:${sig}`;
  // بازهٔ کوچک‌ترِ داخلِ بازهٔ ساخته‌شده هم همان را می‌خواند.
  for (const [k, value] of memo) {
    const [c, f, t, g] = k.split(':');
    if (c === code && g === sig && Number(f) <= range.from && Number(t) >= end) return value;
  }
  const job = (async () => {
    const [daily, response] = await Promise.all([
      fetchDailies([code], { n: 0, fetcher }),
      fetcher(`/api/vol/history?ua=${encodeURIComponent(code)}&from=${range.from}&to=${end}&build=0`, { cache: 'no-store' }),
    ]);
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
    const history = buildVolHistory({
      baseRows: daily.byIns?.[code]?.rows || [], observations: panelObservations(body.contracts, body.panels, opts.priceBasis),
      from: range.from, params: volParams(opts), settings,
    });
    return { ua: code, history, coverage: { have: body.have, days: body.days, missing: body.missing } };
  })();
  memo.set(key, job);
  job.catch(() => memo.delete(key));
  return job;
}

const coverageNote = (loaded) => (loaded?.coverage?.missing
  ? `پوشش ${faDigits(loaded.coverage.have)} از ${faDigits(loaded.coverage.days)} روز؛ روزهای بی‌پرونده را تب «رتبه و صدک تلاطم» می‌سازد.`
  : '');

/** یک خانهٔ نوار: تلاطم یک روز. */
export function volContextCell(ctx, label) {
  if (!ctx?.ok) {
    return `<div class="vc-cell" data-empty="true"><small>${esc(label)}</small><b>—</b><span>${esc(VOL_CONTEXT_WHY[ctx?.why] || '')}</span></div>`;
  }
  return `<div class="vc-cell" data-tone="${esc(ctx.regime.tone)}"><small>${esc(label)} · ${dateLabel(ctx.date)}${ctx.carried ? ' (حمل‌شده)' : ''}</small>
    <b>IV ${pct(ctx.ivPct)}</b>
    <span>IVR ${rank(ctx.ivr)} · IVP ${rank(ctx.ivp)} · ${esc(ctx.regime.label)}</span>
    <span>HV ${faDigits(ctx.hvWindow)} روزه ${pct(ctx.hvPct)}${isNum(ctx.ratio) ? ` · IV÷HV ${fmt.num(ctx.ratio)}` : ''}</span></div>`;
}

/** نوار ورود/خروج با تغییر، و ستونِ جدای «پس‌نگری». خالص. */
export function volContextPairHtml(pair, { ua = null, note = '', hindsight = true } = {}) {
  if (!pair) return '';
  const { entry, exit } = pair;
  const hs = entry?.ok && isNum(entry.hindsight?.fwdRv)
    ? `<div class="vc-cell vc-hindsight" title="${esc(VOL_HINDSIGHT_NOTE)}"><small>${esc(VOL_HINDSIGHT_LABEL)} · تحقق‌یافتهٔ بعد از ورود</small>
        <b>${pct(entry.hindsight.fwdRv)}</b><span>IV ورود منهای آن: ${signed(entry.hindsight.fwdEdge)}</span><span>${esc(entry.hindsight.fwdEdge > 0 ? 'پریمیوم گران درآمد' : entry.hindsight.fwdEdge < 0 ? 'پریمیوم ارزان درآمد' : '')}</span></div>`
    : '';
  return `<div class="vc-strip" role="group" aria-label="زمینهٔ تلاطم">
    ${volContextCell(entry, 'تلاطم در ورود')}
    ${exit ? volContextCell(exit, 'تلاطم در خروج') : ''}
    ${exit ? `<div class="vc-cell"><small>تغییر میان ورود و خروج</small><b>${signed(pair.ivChange)}</b><span>IVP ${signed(pair.ivpChange, '')}</span></div>` : ''}
    ${hindsight ? hs : ''}
    ${ua?.ins ? `<div class="vc-cell vc-link">${volDeskLinkHtml(ua, { label: 'میز تلاطم' })}</div>` : ''}
  </div>${note ? `<p class="note">${esc(note)}</p>` : ''}`;
}

/**
 * نوار را روی میزبان سوار می‌کند. `entry`/`exit` تاریخ‌اند (`exit` اختیاری).
 * خطا نوار را خالی نمی‌گذارد: می‌گوید چه نشد.
 */
export async function paintVolContext(host, { ua, name = '', entry, exit = 0, settings = {}, hindsight = true } = {}) {
  if (!host) return null;
  if (!ua || !entry) { host.innerHTML = ''; return null; }
  host.innerHTML = '<p class="note">در حال خواندن زمینهٔ تلاطم…</p>';
  try {
    const loaded = await loadVolContext(ua, { from: entry, to: exit || entry, settings });
    const pair = exit ? volContextBetween(loaded.history, entry, exit) : { entry: volContextAt(loaded.history, entry), exit: null };
    host.innerHTML = volContextPairHtml(pair, { ua: { ins: String(ua), name }, note: coverageNote(loaded), hindsight });
    return pair;
  } catch (e) {
    host.innerHTML = `<p class="note">زمینهٔ تلاطم خوانده نشد: ${esc(faDigits(String(e?.message || e)))}</p>`;
    return null;
  }
}

/** زمینهٔ چند تاریخ از یک پایه، برای ستون‌های جدول (آزمون همه، خروجی). */
export async function volContextsFor(ua, dates = [], { settings = {} } = {}) {
  const list = dates.map(normalizeHistoryDate).filter(Boolean);
  if (!ua || !list.length) return new Map();
  const loaded = await loadVolContext(ua, { from: Math.min(...list), to: Math.max(...list), settings });
  return new Map(list.map((date) => [date, volContextAt(loaded.history, date)]));
}

/**
 * جدول روزانهٔ تلاطم یک پایه در بازه — برای برگ خروجی. ستون «پس‌نگری»
 * جداست و نامش همین را می‌گوید. خالص.
 */
export function volContextTable(history, from, to, name = '') {
  const a = normalizeHistoryDate(from) || 0, b = normalizeHistoryDate(to) || 99999999;
  const params = history?.params || {};
  const headers = ['پایه', 'تاریخ', 'IV شاخص ٪', 'IVR', 'IVP', `HV ${params.hvWindow || ''} روزه ٪`, 'IV منهای HV', 'IV ÷ HV', 'وضعیت (از IVP)', 'علت نبود شاخص', `${VOL_HINDSIGHT_LABEL}: تحقق‌یافتهٔ روزهای بعد ٪`];
  const rows = (history?.rows || []).filter((row) => row.date >= a && row.date <= b).map((row) => {
    const ctx = volContextAt(history, row.date);
    const own = ctx.ok && ctx.date === row.date;
    const cell = (value) => (isNum(value) ? Math.round(value * 100) / 100 : '');
    return [name, historyDateLabel(row.date), cell(row.ivPct), cell(row.ivr), cell(row.ivp), cell(row.hvMatch), cell(row.spread), cell(row.ratio),
      own ? ctx.regime.label : '', isNum(row.ivPct) ? '' : (row.why || ''), cell(row.fwdRv)];
  });
  return { headers, rows };
}
