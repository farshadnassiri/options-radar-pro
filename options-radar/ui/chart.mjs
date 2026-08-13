// نمودار بازده — امضای مشترک همه تب‌ها.
//
// از نقاط شکست دقیق کشیده می‌شود، نه از نمونه‌برداری. ناحیه سود و ناحیه زیان
// جدا رنگ می‌شوند، قیمت‌های اعمال خط‌چین می‌خورند و نقاط سربه‌سری دایره
// می‌گیرند. قیمت پایه فعلی خط نارنجی است.
//
// دو سطح دارد:
//
//   payoffSvg   یک رشته SVG ایستا. برای چاپ و جایی که تعامل لازم نیست.
//   mountPayoff نمودار تعامل‌پذیر: زوم با غلتک، پیمایش با کشیدن، و خط
//               راهنمای متحرک که سود و زیان را سر هر قیمت پایه می‌خواند.
//
// چرا زوم فقط روی محور قیمت پایه است: محور عمودی همیشه از داده همان بازه
// دوباره حساب می‌شود، پس بزرگ‌نمایی یک ناحیه باریک، خودش قد نمودار را هم
// پر می‌کند. زوم دوبعدی اینجا فقط نمودار را کج می‌کرد.

import { chartPoints, analyzePayoff } from '/core/payoff.mjs';
import { analyzeMixed, isSingleExpiry } from '/core/mixed.mjs';

const money = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—');
const MIN_SPAN = 1e-6;

/** عدد کوتاه محور: میلیون و هزار خلاصه می‌شوند تا برچسب‌ها روی هم نیفتند. */
function axisNum(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}G`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`;
  return money(v);
}

/**
 * گام خوانا: ۱ ، ۲ ، ۵ در توان ده.
 *
 * قبلاً محور عمودی سه مقدار ثابت داشت — کف و صفر و سقف — و هر وقت صفر به
 * یکی از دو سر نزدیک می‌شد، دو برچسب روی هم می‌افتادند. گام گرد این را حل
 * می‌کند و عددهای محور را هم خواندنی می‌کند.
 */
function niceStep(span, count) {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function ticksFor(lo, hi, count) {
  if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  const step = niceStep(hi - lo, count);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    if (out.length > 40) break;
  }
  return out;
}

/** موتور درست را انتخاب می‌کند و نقاط رسم را می‌دهد. */
function seriesFor(legs, netCash, opt) {
  if (isSingleExpiry(legs)) {
    const { points, analysis } = chartPoints(legs, netCash, { fees: opt.fees, padPct: opt.padPct ?? 0.35 });
    return { points, analysis };
  }
  const analysis = analyzeMixed(legs, netCash, {
    fees: opt.fees, spot: opt.spot, sigma: opt.sigma,
    rFree: opt.rFree, divYield: opt.divYield,
  });
  return { points: analysis.points.filter((_, i) => i % 3 === 0), analysis };
}

/**
 * بدنه رسم. روی یک بازه دلخواه از محور قیمت پایه کار می‌کند، پس هم برای
 * نمای اول و هم برای هر سطح زوم یکی است.
 */
function frame(points, analysis, opt, xMin, xMax) {
  const spot = opt.spot;
  const W = opt.width ?? 760, H = opt.height ?? 280;
  // حاشیه چپ جا برای برچسب محور عمودی باز می‌کند و حاشیه پایین برای دو ردیف
  // برچسب: قیمت اعمال بالای محور، و مقیاس قیمت پایه زیر آن.
  const pad = { t: 20, r: 16, b: 40, l: 54 };

  // فقط نقاط داخل بازه، به‌علاوه دو نقطه لبه که خط تا لبه قاب برسد
  const at = analysis.at;
  const inRange = points.filter((p) => p.S >= xMin && p.S <= xMax);
  const seq = [{ S: xMin, pnl: at(xMin) }, ...inRange, { S: xMax, pnl: at(xMax) }]
    .filter((p) => Number.isFinite(p.pnl))
    .sort((a, b) => a.S - b.S);

  if (seq.length < 2) return null;

  const ys = seq.map((p) => p.pnl);
  let yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 0);
  const padY = (yMax - yMin) * 0.12 || 1;
  yMin -= padY; yMax += padY;

  const X = (v) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);
  const y0 = Y(0);

  const areas = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i], b = seq[i + 1];
    const cls = (a.pnl + b.pnl) / 2 >= 0 ? 'fill-gain' : 'fill-loss';
    areas.push(`<path class="${cls}" d="M${X(a.S)},${y0} L${X(a.S)},${Y(a.pnl)} L${X(b.S)},${Y(b.pnl)} L${X(b.S)},${y0} Z"/>`);
  }

  const line = seq.map((p, i) => `${i ? 'L' : 'M'}${X(p.S).toFixed(1)},${Y(p.pnl).toFixed(1)}`).join(' ');

  // ——— محور عمودی: گام گرد، برچسب سمت چپ، صفر جدا کشیده می‌شود ———
  const yTicks = ticksFor(yMin, yMax, 4).filter((v) => Math.abs(Y(v) - y0) > 9 || v === 0);
  const grid = yTicks.map((v) => `
    <line class="grid-line" x1="${pad.l}" y1="${Y(v)}" x2="${W - pad.r}" y2="${Y(v)}"/>
    <text x="${pad.l - 6}" y="${Y(v) + 3}" text-anchor="end">${axisNum(v)}</text>`).join('');

  // ——— محور افقی: مقیاس قیمت پایه، زیر خط محور ———
  // قیمت اعمال خودش برچسب دارد و اغلب دقیقاً روی یک گام گرد می‌افتد. اگر هر
  // دو کشیده شوند، دو عدد یکسان زیر هم می‌نشینند. پس گامی که نزدیک یک قیمت
  // اعمال است حذف می‌شود و برچسب دقیق‌تر — همان قیمت اعمال — می‌ماند.
  const shownStrikes = analysis.strikes.filter((k) => k >= xMin && k <= xMax);
  const xTicks = ticksFor(xMin, xMax, 6)
    .filter((v) => !shownStrikes.some((k) => Math.abs(X(k) - X(v)) < 20))
    .map((v) => `
    <line class="grid-line" x1="${X(v)}" y1="${H - pad.b}" x2="${X(v)}" y2="${H - pad.b + 4}"/>
    <text x="${X(v)}" y="${H - pad.b + 15}" text-anchor="middle">${axisNum(v)}</text>`).join('');

  // قیمت اعمال بالای محور می‌نشیند تا با مقیاس قیمت پایه قاطی نشود
  const strikes = shownStrikes.map((k) => `
    <line class="strike" x1="${X(k)}" y1="${pad.t}" x2="${X(k)}" y2="${H - pad.b}"/>
    <text class="lbl strike-lbl" x="${X(k)}" y="${H - pad.b - 5}" text-anchor="middle">${axisNum(k)}</text>`).join('');

  const bes = analysis.breakevens.filter((b) => b >= xMin && b <= xMax).map((b) => `
    <circle class="be" cx="${X(b)}" cy="${y0}" r="4"/>
    <text class="lbl" x="${X(b)}" y="${y0 - 9}" text-anchor="middle">${money(b)}</text>`).join('');

  const spotLine = Number.isFinite(spot) && spot >= xMin && spot <= xMax
    ? `<line class="spot" x1="${X(spot)}" y1="${pad.t}" x2="${X(spot)}" y2="${H - pad.b}"/>
       <text class="lbl" x="${X(spot)}" y="${pad.t - 6}" text-anchor="middle" style="fill:var(--warn)">پایه ${money(spot)}</text>` : '';

  const svg = `<svg class="payoff" viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار بازده در سررسید">
      ${grid}${areas.join('')}${strikes}${spotLine}
      <line class="axis" x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}"/>
      ${xTicks}
      <line class="zero" x1="${pad.l}" y1="${y0}" x2="${W - pad.r}" y2="${y0}"/>
      <path class="curve" d="${line}"/>${bes}
      <g class="cursor" hidden>
        <line class="cur-x" y1="${pad.t}" y2="${H - pad.b}"/>
        <circle class="cur-dot" r="3.5"/>
      </g>
    </svg>`;

  return { svg, W, H, pad, X, Y, y0, xMin, xMax, yMin, yMax };
}

/** نمای اول: بازه‌ای که قیمت‌های اعمال و قیمت پایه را با حاشیه در بر می‌گیرد. */
function homeRange(points, analysis, opt) {
  const xs = points.map((p) => p.S).filter(Number.isFinite);
  let lo = Math.min(...xs), hi = Math.max(...xs);
  if (Number.isFinite(opt.spot)) { lo = Math.min(lo, opt.spot); hi = Math.max(hi, opt.spot); }
  if (!(hi > lo)) { lo = Math.max(0, lo - 1); hi = lo + 2; }
  return [lo, hi];
}

/** رشته SVG ایستا — همان امضای قبلی، برای جاهایی که تعامل لازم نیست. */
export function payoffSvg(legs, netCash, opt = {}) {
  const { points, analysis } = seriesFor(legs, netCash, opt);
  const ys = points.map((p) => p.pnl).filter(Number.isFinite);
  if (!ys.length) return { svg: '<div class="note">نمودار قابل رسم نیست.</div>', analysis };
  const [lo, hi] = homeRange(points, analysis, opt);
  const f = frame(points, analysis, opt, lo, hi);
  return { analysis, svg: f ? f.svg : '<div class="note">نمودار قابل رسم نیست.</div>' };
}

/**
 * نمودار تعامل‌پذیر.
 *
 *   غلتک          زوم حول همان نقطه‌ای که نشانگر رویش است
 *   کشیدن         پیمایش افقی
 *   حرکت نشانگر   خط راهنما و خواندن سود و زیان سر همان قیمت پایه
 *   دوبار کلیک    برگشت به نمای اول
 *
 * برمی‌گرداند { analysis, reset, destroy }.
 */
export function mountPayoff(host, legs, netCash, opt = {}) {
  const { points, analysis } = seriesFor(legs, netCash, opt);
  const ys = points.map((p) => p.pnl).filter(Number.isFinite);
  if (!ys.length) {
    host.innerHTML = '<div class="note">نمودار قابل رسم نیست.</div>';
    return { analysis, reset() {}, destroy() {} };
  }

  const [homeLo, homeHi] = homeRange(points, analysis, opt);
  let lo = homeLo, hi = homeHi;
  let geo = null;

  host.innerHTML = `
    <div class="chart-box">
      <div class="chart-canvas"></div>
      <div class="chart-tools">
        <span class="chart-read">غلتک برای زوم ، کشیدن برای پیمایش ، دوبار کلیک برای نمای اول</span>
        <span class="sp"></span>
        <button type="button" class="ghost" data-act="out">−</button>
        <button type="button" class="ghost" data-act="in">+</button>
        <button type="button" class="ghost" data-act="home">نمای اول</button>
      </div>
    </div>`;

  const canvas = host.querySelector('.chart-canvas');
  const read = host.querySelector('.chart-read');

  function render() {
    geo = frame(points, analysis, opt, lo, hi);
    canvas.innerHTML = geo ? geo.svg : '<div class="note">بازه بیش از حد باریک است.</div>';
  }
  render();

  // ——— تبدیل مختصات صفحه به قیمت پایه ———
  // viewBox مقیاس می‌خورد، پس نسبت افقی داخل قاب گرفته می‌شود نه پیکسل خام.
  function priceAt(ev) {
    const svg = canvas.querySelector('svg');
    if (!svg || !geo) return NaN;
    const b = svg.getBoundingClientRect();
    if (!b.width) return NaN;
    const vx = ((ev.clientX - b.left) / b.width) * geo.W;
    const inner = geo.W - geo.pad.l - geo.pad.r;
    const t = (vx - geo.pad.l) / (inner || 1);
    return lo + t * (hi - lo);
  }

  function clampRange(nextLo, nextHi) {
    // بازه هرگز وارونه یا صفر نمی‌شود، و از صفر پایین‌تر نمی‌رود
    if (!(nextHi - nextLo > MIN_SPAN)) return;
    lo = Math.max(0, nextLo);
    hi = Math.max(lo + MIN_SPAN, nextHi);
    render();
  }

  function zoomAt(pivot, factor) {
    const p = Number.isFinite(pivot) ? pivot : (lo + hi) / 2;
    clampRange(p - (p - lo) * factor, p + (hi - p) * factor);
  }

  const onWheel = (ev) => {
    ev.preventDefault();
    zoomAt(priceAt(ev), ev.deltaY > 0 ? 1.15 : 1 / 1.15);
  };

  // ——— پیمایش با کشیدن ———
  let drag = null;
  const onDown = (ev) => {
    if (ev.button !== 0) return;
    drag = { x: ev.clientX, lo, hi };
    canvas.classList.add('dragging');
    canvas.setPointerCapture?.(ev.pointerId);
  };
  const onMove = (ev) => {
    if (drag) {
      const svg = canvas.querySelector('svg');
      const b = svg?.getBoundingClientRect();
      if (!b?.width) return;
      const inner = geo.W - geo.pad.l - geo.pad.r;
      const perPx = (drag.hi - drag.lo) / ((b.width * inner) / geo.W || 1);
      const dx = (ev.clientX - drag.x) * perPx;
      // در راست‌به‌چپ هم محور قیمت از چپ به راست بالا می‌رود، پس علامت ثابت است
      clampRange(drag.lo - dx, drag.hi - dx);
      return;
    }
    showCursor(priceAt(ev));
  };
  const onUp = (ev) => {
    drag = null;
    canvas.classList.remove('dragging');
    canvas.releasePointerCapture?.(ev.pointerId);
  };

  // ——— خط راهنما ———
  function showCursor(S) {
    const svg = canvas.querySelector('svg');
    const g = svg?.querySelector('.cursor');
    if (!g || !geo || !Number.isFinite(S)) return;
    const pnl = analysis.at(S);
    if (!Number.isFinite(pnl)) { g.setAttribute('hidden', ''); return; }
    const x = geo.X(S);
    const y = Math.min(Math.max(geo.Y(pnl), geo.pad.t), geo.H - geo.pad.b);
    g.removeAttribute('hidden');
    g.querySelector('.cur-x').setAttribute('x1', x);
    g.querySelector('.cur-x').setAttribute('x2', x);
    g.querySelector('.cur-dot').setAttribute('cx', x);
    g.querySelector('.cur-dot').setAttribute('cy', y);
    read.innerHTML = `پایه <b>${money(S)}</b> — سود و زیان `
      + `<b style="color:${pnl >= 0 ? 'var(--gain)' : 'var(--loss)'}">${money(pnl)}</b>`;
  }
  function hideCursor() {
    canvas.querySelector('.cursor')?.setAttribute('hidden', '');
    read.textContent = 'غلتک برای زوم ، کشیدن برای پیمایش ، دوبار کلیک برای نمای اول';
  }

  const reset = () => { lo = homeLo; hi = homeHi; render(); };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', hideCursor);
  canvas.addEventListener('dblclick', reset);
  host.querySelector('[data-act="home"]').addEventListener('click', reset);
  host.querySelector('[data-act="in"]').addEventListener('click', () => zoomAt(NaN, 1 / 1.3));
  host.querySelector('[data-act="out"]').addEventListener('click', () => zoomAt(NaN, 1.3));

  return {
    analysis,
    reset,
    destroy() {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', hideCursor);
      canvas.removeEventListener('dblclick', reset);
    },
  };
}

/** نمودار تفاضل دو موقعیت — ورودی تصمیم رول. */
export function diffSvg(fn, xMin, xMax, opt = {}) {
  const W = opt.width ?? 760, H = opt.height ?? 240;
  const pad = { t: 16, r: 14, b: 30, l: 14 };
  const N = 160;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const S = xMin + ((xMax - xMin) * i) / N;
    pts.push({ S, v: fn(S) });
  }
  const vs = pts.map((p) => p.v).filter(Number.isFinite);
  let yMin = Math.min(...vs, 0), yMax = Math.max(...vs, 0);
  const py = (yMax - yMin) * 0.12 || 1;
  yMin -= py; yMax += py;
  const X = (v) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);
  const y0 = Y(0);

  const areas = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const cls = (a.v + b.v) / 2 >= 0 ? 'fill-gain' : 'fill-loss';
    areas.push(`<path class="${cls}" d="M${X(a.S)},${y0} L${X(a.S)},${Y(a.v)} L${X(b.S)},${Y(b.v)} L${X(b.S)},${y0} Z"/>`);
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.S).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');

  // نقاط تغییر علامت: مرز تصمیم
  const cross = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if ((a.v < 0 && b.v > 0) || (a.v > 0 && b.v < 0)) {
      const t = -a.v / (b.v - a.v);
      const S = a.S + t * (b.S - a.S);
      cross.push(S);
    }
  }
  const dots = cross.map((S) => `<circle class="be" cx="${X(S)}" cy="${y0}" r="4"/>
    <text class="lbl" x="${X(S)}" y="${y0 - 8}" text-anchor="middle">${money(S)}</text>`).join('');
  const spotLine = Number.isFinite(opt.spot) && opt.spot >= xMin && opt.spot <= xMax
    ? `<line class="spot" x1="${X(opt.spot)}" y1="${pad.t}" x2="${X(opt.spot)}" y2="${H - pad.b}"/>` : '';

  return {
    crossings: cross,
    svg: `<svg class="payoff" viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار تفاضل دو موقعیت">
      ${areas.join('')}${spotLine}
      <line class="zero" x1="${pad.l}" y1="${y0}" x2="${W - pad.r}" y2="${y0}"/>
      <path class="curve" d="${line}"/>${dots}
    </svg>`,
  };
}
