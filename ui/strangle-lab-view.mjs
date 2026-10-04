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
// منفی با «−» همان‌طور که پول نوشته می‌شود؛ خط‌تیرهٔ لاتین کنار رقم فارسی گم می‌شود.
export const pct = (v, digits = 1) => {
  if (!fin(v)) return '—';
  const text = Math.abs(v).toFixed(digits);
  return `${v < 0 && Number(text) !== 0 ? '−' : ''}${faDigits(text)}٪`;
};
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
export const HALF = 760, FULL = 1200;
const PAD = { l: 96, r: 16, t: 16, b: 30 };

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

const roundFor = (unit) => (v) => (!fin(v) ? null : unit === 'money' ? Math.round(v) : Math.round(v * 100) / 100);

/**
 * نمودار خطیِ تعاملی — یک سازنده برای همهٔ نمودارهای این تب.
 *
 * خروجی یک جعبه است با `data-model`: همان عددهایی که کشیده شده، تا تب با
 * هاور خط عمودی، نقطهٔ هر سری و راهنمای دقیق را نشان دهد. سریِ پنهان
 * (`hidden`) نه کشیده می‌شود و نه در راهنما می‌آید.
 *
 *   series  [{ key, label, cls, values, step?, full? }]  — `full` یعنی آینده را هم نشان بده
 *   bars    [{ key, label, cls, values }]  ستون‌های روزانه، کنار هم
 *   band    { upper, lower }  ناحیهٔ میان دو سری (کانال قیمت اعمال)
 *   area    کلید سری‌ای که تا صفر سایه می‌خورد
 *   areas   [{ key, cls }]  چند سایه به ترتیب (برای نمودار انباشتهٔ روی هم)
 *   سریِ `noLine` کشیده نمی‌شود ولی در راهنما می‌آید
 *   cloud   [{ values, final }]  ابرِ مسیرها — کشیده می‌شود، در راهنما نمی‌آید
 *   refs    [{ value, label, cls }]  خط‌های افقی (حد سود، حد ضرر)
 *   marks   [{ i, key, cls, tip }]  نقطه‌های رویداد روی یک سری
 *   notes   [متنِ هر روز]  سطر اول راهنما (مثلاً اقدام آن روز)
 */
export function lineChart({
  id, dates, W = HALF, h = 260, series = [], bars = [], band = null, area = null, areas = [], cloud = [], refs = [], marks = [],
  notes = [], upTo = Infinity, cursor = NaN, hidden = new Set(), unit = 'money', zero = unit === 'money', label = '',
  pctBase = NaN, pctLabel = 'سرمایه',
}) {
  const n = dates.length;
  const clip = (arr, full) => arr.map((v, i) => (full || i <= upTo ? v : NaN));
  const S = series.filter((s) => !hidden.has(s.key)).map((s) => ({ ...s, vals: clip(s.values, s.full) }));
  const B = bars.filter((b) => !hidden.has(b.key)).map((b) => ({ ...b, vals: clip(b.values, b.full) }));
  const cloudOn = cloud.length && !hidden.has('cloud');
  const all = [...S.flatMap((s) => s.vals), ...B.flatMap((b) => b.vals), ...refs.map((r) => r.value)];
  if (cloudOn) for (const c of cloud) for (const v of c.values) all.push(v);
  if (band) for (const k of [band.upper, band.lower]) for (const v of clip(k, false)) all.push(v);
  if (zero) all.push(0);
  const vals = all.filter(fin);
  if (!vals.length || !S.some((s) => s.vals.some(fin)) && !B.length) return '<p class="note sl-empty">داده‌ای برای کشیدن نیست — دست‌کم یک سری را روشن کن.</p>';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
  lo -= pad; hi += pad;
  const plotW = W - PAD.l - PAD.r;
  const x = (i) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (h - PAD.t - PAD.b);
  const every = Math.max(1, Math.ceil(n / (W > HALF ? 12 : 8)));
  const grid = niceTicks(lo, hi, W > HALF ? 6 : 4).map((v) => `<line class="sl-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`
    + `<text class="sl-axis" x="${PAD.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(axisNum(v))}</text>`).join('');
  const xlabels = dates.map((d, i) => (i % every === 0 || i === n - 1
    ? `<text class="sl-axis" x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(shortDateFa(d))}</text>` : '')).join('');
  const z = fin(y(0)) && lo < 0 && hi > 0 ? `<line class="sl-zero" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>` : '';

  let bandSvg = '';
  if (band) {
    const up = clip(band.upper, false), dn = clip(band.lower, false);
    const idx = up.map((v, i) => (fin(v) && fin(dn[i]) ? i : -1)).filter((i) => i >= 0);
    if (idx.length) {
      bandSvg = `<path class="sl-band" d="M${idx.map((i) => `${x(i).toFixed(1)},${y(up[i]).toFixed(1)}`).join('L')}L${idx.slice().reverse().map((i) => `${x(i).toFixed(1)},${y(dn[i]).toFixed(1)}`).join('L')}Z"/>`;
    }
  }
  const areaOf = (key, cls) => {
    const a = S.find((q) => q.key === key);
    if (!a) return '';
    const idx = a.vals.map((v, i) => (fin(v) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return '';
    const y0 = y(Math.max(lo, Math.min(hi, 0))).toFixed(1);
    // سریِ پله‌ای سایهٔ پله‌ای می‌خواهد، وگرنه لبهٔ سایه از خطش جدا می‌شود.
    const pts = idx.map((i, k) => (a.step && k > 0
      ? `${x(i).toFixed(1)},${y(a.vals[idx[k - 1]]).toFixed(1)}L${x(i).toFixed(1)},${y(a.vals[i]).toFixed(1)}`
      : `${x(i).toFixed(1)},${y(a.vals[i]).toFixed(1)}`)).join('L');
    return `<path class="${cls}" d="M${x(idx[0]).toFixed(1)},${y0}L${pts}L${x(idx.at(-1)).toFixed(1)},${y0}Z"/>`;
  };
  const areaSvg = (area ? areaOf(area, 'sl-area') : '') + areas.map((a) => areaOf(a.key, `sl-area2 ${esc(a.cls)}`)).join('');
  const slot = plotW / Math.max(1, n - 1);
  const bw = Math.max(2, Math.min(16, (slot * 0.75) / Math.max(1, B.length)));
  const base = y(Math.max(lo, Math.min(hi, 0)));
  const barSvg = B.map((b, k) => b.vals.map((v, i) => {
    if (!fin(v) || v === 0) return '';
    const bx = x(i) - (B.length * bw) / 2 + k * bw;
    const top = Math.min(y(v), base), ht = Math.max(1, Math.abs(y(v) - base));
    return `<rect class="sl-bar2 ${esc(b.cls)} ${v > 0 ? 'up' : 'down'}" x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${ht.toFixed(1)}"/>`;
  }).join('')).join('');
  const cloudSvg = cloudOn ? cloud.map((c) => `<path class="sl-fan ${tone(c.final)}" d="${linePath(c.values, x, y)}"/>`).join('') : '';
  const lines = S.filter((s) => !s.noLine).map((s) => `<path class="sl-line ${esc(s.cls)}" d="${linePath(s.vals, x, y, { step: s.step })}"/>`).join('');
  const refSvg = refs.filter((r) => fin(r.value)).map((r) => `<line class="sl-ref ${esc(r.cls)}" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(r.value).toFixed(1)}" y2="${y(r.value).toFixed(1)}"/>`
    + `<text class="sl-ref-label ${esc(r.cls)}" x="${W - PAD.r - 4}" y="${(y(r.value) - 5).toFixed(1)}" text-anchor="end">${esc(r.label)}</text>`).join('');
  const markSvg = marks.map((m) => {
    const s = S.find((q) => q.key === m.key);
    const v = s?.vals[m.i];
    return fin(v) ? `<circle class="sl-mark ${esc(m.cls)}" cx="${x(m.i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="6" data-tip="${esc(m.tip)}"/>` : '';
  }).join('');
  const cur = fin(cursor) && cursor < n ? `<line class="sl-cursor" x1="${x(cursor).toFixed(1)}" x2="${x(cursor).toFixed(1)}" y1="${PAD.t}" y2="${h - PAD.b}"/>` : '';
  const model = {
    n, W, h, lo, hi, padL: PAD.l, padR: PAD.r, padT: PAD.t, padB: PAD.b, dates,
    // درصدِ سود و زیان در راهنمای هاور: نسبت به همین مبنا (معمولاً سرمایه).
    pctBase: fin(pctBase) && pctBase > 0 ? pctBase : null, pctLabel,
    upTo: fin(upTo) ? upTo : n - 1,
    notes: notes.map((t, i) => (i <= upTo ? t || '' : '')),
    series: S.map((s) => ({ label: s.label, cls: s.cls, unit: s.unit || unit, v: s.vals.map(roundFor(s.unit || unit)) })),
    bars: B.map((b) => ({ label: b.label, cls: b.cls, unit: b.unit || unit, v: b.vals.map(roundFor(b.unit || unit)) })),
  };
  return `<div class="sl-chartbox" data-chart="${esc(id)}" data-model="${esc(JSON.stringify(model))}">
    <svg class="sl-chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">
      ${grid}${xlabels}${bandSvg}${areaSvg}${z}${cloudSvg}${barSvg}${refSvg}${lines}${markSvg}${cur}
      <line class="sl-cross" x1="0" x2="0" y1="${PAD.t}" y2="${h - PAD.b}" visibility="hidden"/>
      <g class="sl-cross-dots"></g>
    </svg></div>`;
}

/** نمونهٔ کوچکِ خط یا ستونِ یک سری، با همان کلاس نمودار. */
export function keySvg(cls, bar = false) {
  return bar
    ? `<svg class="sl-keysvg" viewBox="0 0 26 10" aria-hidden="true"><rect class="sl-bar2 ${esc(cls)} up" x="7" y="1" width="12" height="8"/></svg>`
    : `<svg class="sl-keysvg" viewBox="0 0 26 10" aria-hidden="true"><line class="sl-line ${esc(cls)}" x1="1" y1="5" x2="25" y2="5"/></svg>`;
}

/** تراشه‌های راهنمای نمودار: هر کدام یک سری را روشن و خاموش می‌کند. */
export function legendChips(id, items = [], hidden = new Set()) {
  return `<div class="sl-legend sl-lgs" role="group" aria-label="سری‌های نمودار">${items.map((it) => {
    const on = !hidden.has(it.key);
    // نمونهٔ خط همان کلاسِ خودِ سری است: رنگ، ضخامت و خط‌چین یکی‌اند.
    return `<button type="button" class="sl-lg${on ? ' on' : ''}" data-act="toggle-series" data-chart="${esc(id)}" data-key="${esc(it.key)}" aria-pressed="${on}">
      ${keySvg(it.cls, it.bar)}${esc(it.label)}</button>`;
  }).join('')}</div>`;
}

/** متن راهنمای یک نقطه — همان قالب پول یا قیمت که در جدول‌هاست. */
export function tipValue(v, unit = 'money') {
  if (v == null || !fin(v)) return '—';
  if (unit === 'price') return fmt.num(v);
  if (unit === 'pct') return pct(v, 2);
  return money(v, { sign: true });
}

/**
 * نوار عمر هر پا: هر قراردادِ فروخته‌شده یک نوار، از روز فروش تا روز
 * بازخرید (یا تا امروزِ آزمایش اگر هنوز باز است). پهنای نوار عمر پاست و
 * برچسبش قیمت اعمال و پرمیوم. کلیک، کارت کامل همان پا را باز می‌کند.
 */
export function legGanttSvg({ dates, trades = [], upTo, sel = -1, mult = 1 }) {
  const n = dates.length;
  if (!trades.length) return '';
  const W = FULL, lane = 34, top = 8, h = top + trades.length * lane + 30;
  const plotW = W - PAD.l - PAD.r - 150;
  const x = (i) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const every = Math.max(1, Math.ceil(n / 12));
  const grid = dates.map((d, i) => (i % every === 0 || i === n - 1
    ? `<line class="sl-grid" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${top}" y2="${h - 24}"/><text class="sl-axis" x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(shortDateFa(d))}</text>` : '')).join('');
  const bars = trades.map((t, k) => {
    const end = t.closeDay ?? Math.min(upTo, n - 1);
    const x0 = x(t.openDay), x1 = Math.max(x(end), x0 + 10);
    const yy = top + k * lane + 4;
    const tip = `${SIDE_FA[t.side]} ${strikeFa(t.strike)}\nفروش ${dateFa(dates[t.openDay])} به ${price(t.openPrice)}\nپرمیوم ${money(t.premium)}`
      + (t.closeDay != null ? `\nبازخرید ${dateFa(dates[t.closeDay])} به ${price(t.closePrice)}\nسود و زیان این پا ${money(t.realized, { sign: true })}` : '\nهنوز باز');
    void mult;
    // برچسبِ نوار کوتاه بیرونِ نوار می‌نشیند؛ نتیجهٔ هر پا در ستون انتهایی.
    const text = `${SIDE_FA[t.side]} ${strikeFa(t.strike)}، ${money(t.premium)}`;
    const inside = x1 - x0 > text.length * 9 + 16;
    return `<g class="sl-gantt-leg ${t.side}${t.closeDay == null ? ' open' : ''}${k === sel ? ' sel' : ''}" data-act="leg-sel" data-k="${k}" data-tip="${esc(tip)}" role="button" tabindex="0" aria-label="${esc(`${SIDE_FA[t.side]} ${strikeFa(t.strike)}`)}">
      <rect x="${x0.toFixed(1)}" y="${yy}" width="${(x1 - x0).toFixed(1)}" height="${lane - 8}" rx="8"/>
      <text class="sl-gantt-label" x="${(inside ? x0 + 8 : x1 + 6).toFixed(1)}" y="${yy + lane / 2}" text-anchor="start">${esc(text)}</text>
      ${t.closeDay != null ? `<text class="sl-gantt-res ${tone(t.realized)}" x="${W - PAD.r}" y="${yy + lane / 2}" text-anchor="end">${esc(money(t.realized, { sign: true }))}</text>` : ''}
    </g>`;
  }).join('');
  return `<div class="sl-chartbox sl-gantt"><svg class="sl-chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="عمر هر پا">${grid}${bars}</svg></div>`;
}

/** توزیع نتیجهٔ نهایی، با نشانه‌گذاریِ مسیرهای کلیدی. هر ستون راهنمای خودش را دارد. */
export function histSvg({ finals, markers = [], bins = 24 }) {
  const vals = finals.filter(fin);
  if (!vals.length) return '<p class="note">هیچ مسیری نتیجهٔ نهایی معلوم ندارد.</p>';
  const W = FULL, h = 300;
  let lo = Math.min(...vals, ...markers.map((m) => m.value).filter(fin));
  let hi = Math.max(...vals, ...markers.map((m) => m.value).filter(fin));
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const width = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - lo) / width))] += 1;
  const top = Math.max(...counts);
  const bx = (v) => PAD.l + ((v - lo) / (hi - lo)) * (W - PAD.l - PAD.r);
  const by = (c) => h - PAD.b - (c / top) * (h - PAD.t - PAD.b - 50);
  const bars = counts.map((c, k) => {
    const a = lo + k * width, mid = a + width / 2;
    const tip = `${money(a, { sign: true })} تا ${money(a + width, { sign: true })}\n${fmt.int(c)} مسیر (${pct((c / vals.length) * 100)})`;
    return `<rect class="sl-bar ${tone(mid)}" x="${bx(a).toFixed(1)}" y="${by(c).toFixed(1)}" width="${Math.max(1, bx(a + width) - bx(a) - 1).toFixed(1)}" height="${(h - PAD.b - by(c)).toFixed(1)}" data-tip="${esc(tip)}"/>`;
  }).join('');
  const ticks = niceTicks(lo, hi, 6).map((v) => `<text class="sl-axis" x="${bx(v).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(axisNum(v))}</text>`).join('');
  const marks = markers.filter((m) => fin(m.value)).map((m, k) => `<line class="sl-marker ${esc(m.cls)}" x1="${bx(m.value).toFixed(1)}" x2="${bx(m.value).toFixed(1)}" y1="${PAD.t}" y2="${h - PAD.b}" data-tip="${esc(`${m.label}: ${money(m.value, { sign: true })}`)}"/>`
    + `<text class="sl-marker-label ${esc(m.cls)}" x="${bx(m.value).toFixed(1)}" y="${PAD.t + 16 + (k % 3) * 22}" text-anchor="middle">${esc(m.label)}</text>`).join('');
  const zero = lo < 0 && hi > 0 ? `<line class="sl-zero" x1="${bx(0).toFixed(1)}" x2="${bx(0).toFixed(1)}" y1="${PAD.t}" y2="${h - PAD.b}"/>` : '';
  return `<div class="sl-chartbox"><svg class="sl-chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="توزیع نتیجهٔ نهایی مسیرها">${bars}${zero}${marks}${ticks}</svg></div>`;
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
 * خط زمان دایره‌ای: هر روز یک دایره.
 *
 * حلقهٔ دایره می‌گوید آن روز چه شد (ورود، نگه‌داشتن، تعدیل، بستن، بی‌قیمت،
 * پیشنهادِ نادیده)، و رنگِ درونش می‌گوید سود و زیانِ همان روز مثبت بود یا
 * منفی. راهنمای هر دایره خلاصهٔ روز را دارد؛ کلیک، کارت کامل همان روز را
 * زیر خط زمان باز می‌کند. روزهای پس از روزِ جاری «آینده»اند: تاریخ دارند،
 * قیمت ندارند.
 */
export function timelineHtml({ days, steps, cursor, view, done, closedAt = Infinity }) {
  const byI = new Map(steps.map((s) => [s.i, s]));
  let prevPnl = NaN;
  return `<ol class="sl-timeline" role="list">${days.map((d, i) => {
    const s = byI.get(i);
    let cls = 'future', label = 'آینده', dayTone = '';
    let tip = `${dateFa(d.date)} ${dayNameFa(d.date)}\n${faDigits(String(d.dte))} روز تا سررسید`;
    if (s) {
      const kind = s.action?.kind || 'hold';
      cls = STEP_CLASS[kind] || 'hold';
      label = actionText(s.action);
      if (s.ev?.missing?.length) { cls = 'missing'; label = 'بی‌قیمت'; }
      else if (kind === 'hold' && s.ev?.rec?.kind && s.ev.rec.kind !== 'hold') { cls = 'ignored'; label = 'پیشنهاد نادیده'; }
      if (s.error) { cls = 'error'; label = s.error; }
      const change = fin(s.pnl) && fin(prevPnl) ? s.pnl - prevPnl : NaN;
      dayTone = tone(change);
      tip += `\nپایه ${fmt.int(d.S)}\nاقدام: ${label}\nسود و زیان ${money(s.pnl, { sign: true })}`
        + (fin(change) ? `\nتغییر امروز ${money(change, { sign: true })}` : '');
      if (s.sides) tip += `\nاثر کال ${money(s.sides.call.cum, { sign: true })} · اثر پوت ${money(s.sides.put.cum, { sign: true })}`;
      if (fin(s.pnl)) prevPnl = s.pnl;
    } else if (i === cursor && !done) { cls = 'pending'; label = 'در انتظار تصمیم'; tip += '\nامروزِ آزمایش — در انتظار تصمیم'; }
    else if (done && i > closedAt) { cls = 'after'; label = 'پس از بستن معامله'; tip += '\nمعامله پیش‌تر بسته شده'; }
    const trig = s?.ev?.zone && s.ev.zone !== 'calm' ? ' trig' : '';
    const clickable = s || (i === cursor && !done);
    return `<li class="sl-node ${cls}${trig}${i === view ? ' viewing' : ''}">
      <button type="button" class="sl-node-btn" data-act="view" data-day="${i}" ${clickable ? '' : 'disabled'} data-tip="${esc(tip)}" aria-label="${esc(`${dateFa(d.date)} — ${label}`)}">
        <span class="sl-node-dot ${dayTone}" aria-hidden="true"></span>
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
export function choiceChips(choices = [], max = 10) {
  if (!choices.length) return '<span class="sl-chip quiet">بدون انشعاب</span>';
  const shown = choices.slice(0, max).map((c) => `<span class="sl-chip ${c.action?.kind || 'hold'}" title="${esc(dateFa(c.date))}">${esc(shortDateFa(c.date))}: ${esc(actionText(c.action))}</span>`).join('');
  return shown + (choices.length > max ? `<span class="sl-chip quiet">+${faDigits(String(choices.length - max))}</span>` : '');
}
