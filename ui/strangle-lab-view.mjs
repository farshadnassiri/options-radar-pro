// نمای «استرانگل فروش در بوتهٔ آزمایش» — فقط رشتهٔ HTML و SVG، بی DOM.
//
// چرا جدا از تب: نمودارها و کارت‌ها تابع خالص‌اند و در نود هم بار می‌شوند تا
// رقم فارسی، «نداشته» و پنهان‌ماندنِ آینده آزمون داشته باشند — همان قاعدهٔ
// `ui/radar-columns.mjs`. وارداتِ نسبی به همین دلیل است.
//
// رنگ هیچ‌جا اینجا نوشته نمی‌شود: هر خط و ناحیه یک کلاس دارد و رنگش از
// توکن‌های `ui/style.css` می‌آید (قاعدهٔ ۲-۶).

import { fmt, faDigits, axisNum } from './fmt.mjs';
import { historyDateLabel, historyDayName } from '../core/history.mjs';
import { SIDE_FA, CLOSE_REASON, BRANCH_OPTIONS } from '../core/strangle-lab.mjs';

export const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[c]));

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

export const dateFa = (d) => faDigits(historyDateLabel(d));
export const shortDateFa = (d) => faDigits(historyDateLabel(d).slice(5));
export const dayNameFa = (d) => historyDayName(d) || '';

/** پول با نشانه و واحد؛ بی‌عدد «—». */
export function money(v, { sign = false } = {}) {
  if (!fin(v)) return '—';
  const text = fmt.rialText(Math.abs(v));
  if (!sign) return v < 0 ? `−${text}` : text;
  return v > 0 ? `+${text}` : v < 0 ? `−${text}` : text;
}

export const tone = (v) => (!fin(v) ? 'flat' : v > 0 ? 'gain' : v < 0 ? 'loss' : 'flat');
export const pct = (v, digits = 1) => (fin(v) ? `${faDigits(v.toFixed(digits))}٪` : '—');
export const price = (v) => (fin(v) ? fmt.num(v) : '—');
export const strikeFa = (K) => (fin(K) ? fmt.int(K) : '—');

/** متن کامل یک اقدام، با قیمت اعمال. */
export function actionText(a) {
  if (!a || a.kind === 'hold') return 'نگه‌داشتن';
  if (a.kind === 'open') return 'ورود';
  if (a.kind === 'close') return 'بستن کامل';
  if (a.kind === 'algo') return 'پیشنهاد الگوریتم';
  if (a.kind === 'roll') {
    return a.strike == null ? `بستن ${SIDE_FA[a.side]}`
      : `رول ${SIDE_FA[a.side]} به ${strikeFa(Number(a.strike))}`;
  }
  return '—';
}

export const reasonText = (r) => CLOSE_REASON[r] ?? r ?? '—';
export const srcBadge = (src) => (src === 'model' ? '<span class="sl-badge model" title="قیمت مدل: بلک-شولز با IVِ آخرین روزِ معامله‌شده">مدل</span>'
  : src === 'intrinsic' ? '<span class="sl-badge intrinsic" title="روز سررسید: ارزش ذاتی">ذاتی</span>' : '');

// ═════════════════════════ نمودارهای SVG ═════════════════════════

// پهنای جعبهٔ دید: نمودار نیم‌پهنا ۷۶۰ و تمام‌پهنا ۱۲۰۰ واحد، تا قلمِ محور
// (توکن `--fs-axis`) در هر دو اندازهٔ واقعیِ یکسانی بماند.
const HALF = 760, FULL = 1200, PAD = { l: 96, r: 16, t: 16, b: 30 };

function scaler(n, lo, hi, h, W = HALF) {
  const span = hi - lo || Math.abs(hi) || 1;
  const x = (i) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v) => PAD.t + (1 - (v - lo) / span) * (h - PAD.t - PAD.b);
  return { x, y };
}

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

/** خط با شکاف: نقطهٔ بی‌عدد خط را می‌برد، پل نمی‌زند. */
function linePath(values, x, y, { step = false } = {}) {
  let d = '', open = false, prev = null;
  values.forEach((v, i) => {
    if (!fin(v)) { open = false; prev = null; return; }
    if (!open) { d += `M${x(i).toFixed(1)},${y(v).toFixed(1)}`; open = true; }
    else if (step && prev != null) d += `H${x(i).toFixed(1)}V${y(v).toFixed(1)}`;
    else d += `L${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    prev = v;
  });
  return d;
}

function axes(ticks, y, h, n, x, dates, every, W = HALF) {
  const grid = ticks.map((v) => `<line class="sl-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`
    + `<text class="sl-axis" x="${PAD.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(axisNum(v))}</text>`).join('');
  const labels = dates.map((d, i) => (i % every === 0 || i === n - 1
    ? `<text class="sl-axis" x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(shortDateFa(d))}</text>` : '')).join('');
  return grid + labels;
}

/** ستون‌های کلیک‌پذیرِ هر روز، با راهنمای بومی. */
function hitColumns(n, x, h, tips, upTo, W = HALF) {
  const w = n > 1 ? (W - PAD.l - PAD.r) / (n - 1) : 20;
  return tips.map((tip, i) => (i > upTo ? '' : `<rect class="sl-hit" data-day="${i}" x="${(x(i) - w / 2).toFixed(1)}" y="${PAD.t}" width="${w.toFixed(1)}" height="${h - PAD.t - PAD.b}"><title>${esc(tip)}</title></rect>`)).join('');
}

/**
 * کانال قیمت: قیمت پایه میان دو قیمت اعمال، روزبه‌روز.
 * روزهای بعد از `upTo` کشیده نمی‌شوند مگر `reveal` — آزمون بی‌نگاه به آینده.
 */
export function channelSvg({ days, calls, puts, upTo, cursor, reveal = false, marks = [] }) {
  const n = days.length;
  const h = 260, W = HALF;
  const show = (arr) => arr.map((v, i) => (reveal || i <= upTo ? v : NaN));
  const S = show(days.map((d) => d.S));
  const C = calls.map((v, i) => (i <= upTo ? v : NaN));
  const P = puts.map((v, i) => (i <= upTo ? v : NaN));
  const all = [...S, ...C, ...P].filter(fin);
  if (!all.length) return '<p class="note">داده‌ای برای کشیدن نیست.</p>';
  const span = Math.max(...all) - Math.min(...all) || Math.max(...all) * 0.05;
  const lo = Math.min(...all) - span * 0.08, hi = Math.max(...all) + span * 0.08;
  const { x, y } = scaler(n, lo, hi, h);
  const every = Math.max(1, Math.ceil(n / 8));
  const band = [];
  for (let i = 0; i < n; i += 1) if (fin(C[i]) && fin(P[i])) band.push(i);
  let area = '';
  if (band.length) {
    area = `M${band.map((i) => `${x(i).toFixed(1)},${y(C[i]).toFixed(1)}`).join('L')}`
      + `L${band.slice().reverse().map((i) => `${x(i).toFixed(1)},${y(P[i]).toFixed(1)}`).join('L')}Z`;
  }
  const tips = days.map((d, i) => `${dateFa(d.date)} — پایه ${fmt.int(d.S)}${fin(C[i]) ? `، کال ${fmt.int(C[i])}` : ''}${fin(P[i]) ? `، پوت ${fmt.int(P[i])}` : ''}`);
  const dots = marks.map((m) => (fin(S[m.i]) ? `<circle class="sl-mark ${esc(m.cls)}" cx="${x(m.i).toFixed(1)}" cy="${y(S[m.i]).toFixed(1)}" r="5"><title>${esc(m.tip)}</title></circle>` : '')).join('');
  const cur = fin(cursor) && cursor < n ? `<line class="sl-cursor" x1="${x(cursor).toFixed(1)}" x2="${x(cursor).toFixed(1)}" y1="${PAD.t}" y2="${h - PAD.b}"/>` : '';
  return `<svg class="sl-chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="قیمت پایه میان دو قیمت اعمال">
    ${axes(niceTicks(lo, hi), y, h, n, x, days.map((d) => d.date), every)}
    ${area ? `<path class="sl-band" d="${area}"/>` : ''}
    <path class="sl-line call" d="${linePath(C, x, y, { step: true })}"/>
    <path class="sl-line put" d="${linePath(P, x, y, { step: true })}"/>
    <path class="sl-line spot" d="${linePath(S, x, y)}"/>
    ${dots}${cur}
    ${hitColumns(n, x, h, tips, reveal ? n - 1 : upTo)}
  </svg>`;
}

/**
 * سود و زیان روزانه با خط حد سود و حد ضرر، و مسیرهای مقایسه‌ای.
 * `overlays`: [{ series, cls, label }] — هر کدام کلاسِ رنگِ خودش را دارد.
 */
export function pnlSvg({ series, dates, tp, sl, upTo = Infinity, cursor, overlays = [] }) {
  const n = dates.length;
  const h = 260, W = HALF;
  const own = series.map((v, i) => (i <= upTo ? v : NaN));
  const vals = [...own, ...overlays.flatMap((o) => o.series), 0, fin(tp) ? tp : 0, fin(sl) ? -sl : 0].filter(fin);
  if (vals.length <= 3 && !own.some(fin)) return '<p class="note">هنوز سود و زیانی برای کشیدن نیست.</p>';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const { x, y } = scaler(n, lo, hi, h);
  const every = Math.max(1, Math.ceil(n / 8));
  const zero = y(0).toFixed(1);
  const area = (() => {
    const pts = own.map((v, i) => (fin(v) ? i : -1)).filter((i) => i >= 0);
    if (pts.length < 2) return '';
    return `M${x(pts[0]).toFixed(1)},${zero}L${pts.map((i) => `${x(i).toFixed(1)},${y(own[i]).toFixed(1)}`).join('L')}L${x(pts.at(-1)).toFixed(1)},${zero}Z`;
  })();
  const ref = (v, cls, label) => (fin(v) ? `<line class="sl-ref ${cls}" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`
    + `<text class="sl-ref-label ${cls}" x="${W - PAD.r - 4}" y="${(y(v) - 4).toFixed(1)}" text-anchor="end">${esc(label)}</text>` : '');
  const tips = dates.map((d, i) => `${dateFa(d)} — سود و زیان ${money(own[i], { sign: true })}`);
  const cur = fin(cursor) && cursor < n ? `<line class="sl-cursor" x1="${x(cursor).toFixed(1)}" x2="${x(cursor).toFixed(1)}" y1="${PAD.t}" y2="${h - PAD.b}"/>` : '';
  return `<svg class="sl-chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="سود و زیان روزانه">
    ${axes(niceTicks(lo, hi), y, h, n, x, dates, every)}
    <line class="sl-zero" x1="${PAD.l}" x2="${W - PAD.r}" y1="${zero}" y2="${zero}"/>
    ${ref(tp, 'tp', 'حد سود')}${ref(fin(sl) ? -sl : NaN, 'sl', 'حد ضرر')}
    ${area ? `<path class="sl-area" d="${area}"/>` : ''}
    ${overlays.map((o) => `<path class="sl-line overlay ${esc(o.cls)}" d="${linePath(o.series, x, y)}"><title>${esc(o.label)}</title></path>`).join('')}
    <path class="sl-line pnl" d="${linePath(own, x, y)}"/>
    ${cur}
    ${hitColumns(n, x, h, tips, Math.min(n - 1, upTo))}
  </svg>`;
}

/**
 * بادبزن همهٔ مسیرها: هر مسیر یک خط کم‌رنگ؛ چند مسیر کلیدی پررنگ.
 * `highlights`: [{ series, cls, label }].
 */
export function fanSvg({ paths, dates, highlights = [], maxLines = 600 }) {
  const n = dates.length;
  const h = 380, W = FULL;
  const step = Math.max(1, Math.ceil(paths.length / maxLines));
  const shown = paths.filter((_, i) => i % step === 0);
  const vals = [0, ...shown.flatMap((p) => p.series), ...highlights.flatMap((p) => p.series)].filter(fin);
  if (vals.length < 2) return '<p class="note">مسیری برای کشیدن نیست.</p>';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;
  const { x, y } = scaler(n, lo, hi, h, W);
  const every = Math.max(1, Math.ceil(n / 12));
  const zero = y(0).toFixed(1);
  return `<svg class="sl-chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="بادبزن سود و زیان همهٔ مسیرها">
    ${axes(niceTicks(lo, hi, 6), y, h, n, x, dates, every, W)}
    <line class="sl-zero" x1="${PAD.l}" x2="${W - PAD.r}" y1="${zero}" y2="${zero}"/>
    ${shown.map((p) => `<path class="sl-fan ${tone(p.final)}" d="${linePath(p.series, x, y)}"/>`).join('')}
    ${highlights.map((p) => `<path class="sl-line hl ${esc(p.cls)}" d="${linePath(p.series, x, y)}"><title>${esc(p.label)}: ${esc(money(p.final, { sign: true }))}</title></path>`).join('')}
  </svg>${step > 1 ? `<p class="note">از ${fmt.int(paths.length)} مسیر، ${fmt.int(shown.length)} مسیر کشیده شد تا نمودار خوانا بماند؛ آمارها روی همهٔ مسیرهاست.</p>` : ''}`;
}

/** توزیع نتیجهٔ نهایی، با نشانه‌گذاریِ مسیرهای کلیدی. */
export function histSvg({ finals, markers = [], bins = 24 }) {
  const vals = finals.filter(fin);
  if (!vals.length) return '<p class="note">هیچ مسیری نتیجهٔ نهایی معلوم ندارد.</p>';
  const h = 300, W = FULL;
  let lo = Math.min(...vals, ...markers.map((m) => m.value).filter(fin));
  let hi = Math.max(...vals, ...markers.map((m) => m.value).filter(fin));
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const width = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - lo) / width))] += 1;
  const top = Math.max(...counts);
  const bx = (v) => PAD.l + ((v - lo) / (hi - lo)) * (W - PAD.l - PAD.r);
  const by = (c) => h - PAD.b - (c / top) * (h - PAD.t - PAD.b);
  const bars = counts.map((c, k) => {
    const a = lo + k * width, mid = a + width / 2;
    return `<rect class="sl-bar ${tone(mid)}" x="${bx(a).toFixed(1)}" y="${by(c).toFixed(1)}" width="${Math.max(1, bx(a + width) - bx(a) - 1).toFixed(1)}" height="${(h - PAD.b - by(c)).toFixed(1)}"><title>${esc(`${money(a, { sign: true })} تا ${money(a + width, { sign: true })}: ${fmt.int(c)} مسیر`)}</title></rect>`;
  }).join('');
  const ticks = niceTicks(lo, hi, 5).map((v) => `<text class="sl-axis" x="${bx(v).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(axisNum(v))}</text>`).join('');
  const marks = markers.filter((m) => fin(m.value)).map((m, k) => `<line class="sl-marker ${esc(m.cls)}" x1="${bx(m.value).toFixed(1)}" x2="${bx(m.value).toFixed(1)}" y1="${PAD.t}" y2="${h - PAD.b}"/>`
    + `<text class="sl-marker-label ${esc(m.cls)}" x="${bx(m.value).toFixed(1)}"  y="${PAD.t + 16 + (k % 3) * 24}" text-anchor="middle">${esc(m.label)}</text>`).join('');
  const zero = lo < 0 && hi > 0 ? `<line class="sl-zero" x1="${bx(0).toFixed(1)}" x2="${bx(0).toFixed(1)}" y1="${PAD.t}" y2="${h - PAD.b}"/>` : '';
  return `<svg class="sl-chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="توزیع نتیجهٔ نهایی مسیرها">${bars}${zero}${marks}${ticks}</svg>`;
}

// ═════════════════════════ اجزای HTML ═════════════════════════

/**
 * سنجهٔ حد ضرر ← صفر ← حد سود. نشانگر روی سود و زیان فعلی؛ بیرون از بازه
 * روی لبه می‌ماند و برچسبش می‌گوید از کدام طرف رد شده.
 */
export function gaugeHtml({ pnl, tp, sl, trigger = NaN }) {
  if (!fin(tp) || !fin(sl) || tp <= 0 || sl <= 0) return '';
  const span = tp + sl;
  const at = (v) => Math.max(0, Math.min(100, ((v + sl) / span) * 100));
  const pos = fin(pnl) ? at(pnl) : null;
  return `<div class="sl-gauge" role="meter" aria-valuemin="${-sl}" aria-valuemax="${tp}" aria-valuenow="${fin(pnl) ? pnl : 0}" aria-label="فاصله تا حد سود و حد ضرر">
    <div class="sl-gauge-track">
      <span class="sl-gauge-zero" style="inset-inline-start:${at(0).toFixed(1)}%"></span>
      ${fin(trigger) ? `<span class="sl-gauge-trig" style="inset-inline-start:${at(-trigger).toFixed(1)}%" title="آستانهٔ تعدیل"></span>` : ''}
      ${pos != null ? `<span class="sl-gauge-dot ${tone(pnl)}" style="inset-inline-start:${pos.toFixed(1)}%"></span>` : ''}
    </div>
    <div class="sl-gauge-labels"><span>حد ضرر ${esc(money(-sl))}</span><span>صفر</span><span>حد سود ${esc(money(tp))}</span></div>
  </div>`;
}

const STEP_CLASS = { open: 'open', hold: 'hold', roll: 'adjust', close: 'close' };

/**
 * خط زمان: هر روز یک گره. روزهای پس از `cursor` «آینده»اند و تاریخشان
 * دیده می‌شود ولی قیمتشان نه.
 */
export function timelineHtml({ days, steps, cursor, view, done, closedAt = Infinity }) {
  const byI = new Map(steps.map((s) => [s.i, s]));
  return `<ol class="sl-timeline" role="list">${days.map((d, i) => {
    const s = byI.get(i);
    let cls = 'future', label = 'آینده';
    if (s) {
      const kind = s.action?.kind || 'hold';
      cls = STEP_CLASS[kind] || 'hold';
      label = actionText(s.action);
      if (s.ev?.missing?.length) { cls = 'missing'; label = 'بی‌قیمت'; }
      else if (kind === 'hold' && s.ev?.rec?.kind && s.ev.rec.kind !== 'hold') { cls = 'ignored'; label = 'پیشنهاد نادیده'; }
      if (s.error) { cls = 'error'; label = s.error; }
    } else if (i === cursor && !done) { cls = 'pending'; label = 'در انتظار تصمیم'; }
    else if (done && i > closedAt) { cls = 'after'; label = 'پس از بستن معامله'; }
    const trig = s?.ev?.zone && s.ev.zone !== 'calm' ? ' trig' : '';
    const clickable = s || (i === cursor && !done);
    return `<li class="sl-node ${cls}${trig}${i === view ? ' viewing' : ''}">
      <button type="button" class="sl-node-btn" data-act="view" data-day="${i}" ${clickable ? '' : 'disabled'} title="${esc(`${dateFa(d.date)} ${dayNameFa(d.date)} — ${label}`)}">
        <span class="sl-node-dot" aria-hidden="true"></span>
        <span class="sl-node-date">${esc(shortDateFa(d.date))}</span>
        <span class="sl-node-dte">${faDigits(String(d.dte))}ر</span>
      </button></li>`;
  }).join('')}</ol>`;
}

/** جدول «اگر آن روز…»: سطر = روز، ستون = گزینه، خانه = نتیجهٔ نهایی. */
export function whatIfHtml({ rows, options, best }) {
  if (!rows.length) return '<p class="note">هنوز روزی برای مقایسه نیست — دست‌کم یک روز را پشت سر بگذار.</p>';
  const all = rows.flatMap((r) => r.cells.map((c) => c.final)).filter(fin);
  const scale = Math.max(1, ...all.map(Math.abs));
  const cell = (c, chosen) => {
    if (!c.action) return '<td class="sl-wi-na">—</td>';
    const strength = fin(c.final) ? Math.min(1, Math.abs(c.final) / scale) : 0;
    const level = Math.ceil(strength * 4);
    const isChosen = c.key === chosen;
    return `<td class="sl-wi ${tone(c.final)} lv${level}${isChosen ? ' chosen' : ''}${fin(best) && fin(c.final) && Math.abs(c.final - best) < 1e-6 ? ' best' : ''}" title="${esc(actionText(c.action))}">
      <b>${esc(money(c.final, { sign: true }))}</b><small>${esc(actionText(c.action))}</small></td>`;
  };
  return `<div class="history-table-wrap"><table class="sl-wi-table">
    <thead><tr><th>روز</th><th>انتخاب شما</th>${options.map((o) => `<th>${esc(BRANCH_OPTIONS[o] || o)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr><th scope="row" data-day="${r.i}" class="sl-wi-day">${esc(shortDateFa(r.date))}</th>
      <td class="sl-wi-mine">${esc(r.chosenText || '')}</td>
      ${options.map((o) => cell(r.cells.find((c) => c.opt === o) || { action: null }, r.chosen)).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

/** تراشه‌های تصمیمِ یک مسیر. */
export function choiceChips(choices = [], max = 8) {
  if (!choices.length) return '<span class="sl-chip quiet">بدون انشعاب</span>';
  const shown = choices.slice(0, max).map((c) => `<span class="sl-chip ${c.action?.kind || 'hold'}" title="${esc(dateFa(c.date))}">${esc(shortDateFa(c.date))}: ${esc(actionText(c.action))}</span>`).join('');
  return shown + (choices.length > max ? `<span class="sl-chip quiet">+${faDigits(String(choices.length - max))}</span>` : '');
}
