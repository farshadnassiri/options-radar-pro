// نمودار بازده — امضای مشترک همه تب‌ها.
//
// از نقاط شکست دقیق کشیده می‌شود، نه از نمونه‌برداری. ناحیه سود و ناحیه زیان
// جدا رنگ می‌شوند، قیمت‌های اعمال خط‌چین می‌خورند و نقاط سربه‌سری دایره
// می‌گیرند. قیمت پایه فعلی خط نارنجی است.

import { chartPoints, analyzePayoff } from '/core/payoff.mjs';
import { analyzeMixed, isSingleExpiry } from '/core/mixed.mjs';

const money = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—');

export function payoffSvg(legs, netCash, opt = {}) {
  // تقویمی و مورب، موتور دیگری لازم دارند: در سررسید پای نزدیک، پای دور
  // هنوز زنده است و ارزش زمانی دارد.
  let points, analysis;
  if (isSingleExpiry(legs)) {
    ({ points, analysis } = chartPoints(legs, netCash, { fees: opt.fees, padPct: opt.padPct ?? 0.35 }));
  } else {
    analysis = analyzeMixed(legs, netCash, {
      fees: opt.fees, spot: opt.spot, sigma: opt.sigma,
      rFree: opt.rFree, divYield: opt.divYield,
    });
    points = analysis.points.filter((_, i) => i % 3 === 0);
  }
  const spot = opt.spot;
  const W = opt.width ?? 760, H = opt.height ?? 280;
  const pad = { t: 16, r: 14, b: 32, l: 14 };

  const xs = points.map((p) => p.S);
  const ys = points.map((p) => p.pnl).filter(Number.isFinite);
  if (!ys.length) return { svg: '<div class="note">نمودار قابل رسم نیست.</div>', analysis };

  let xMin = Math.min(...xs, spot ?? Infinity);
  let xMax = Math.max(...xs, spot ?? -Infinity);
  let yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 0);
  const padY = (yMax - yMin) * 0.12 || 1;
  yMin -= padY; yMax += padY;

  const X = (v) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);
  const y0 = Y(0);

  const areas = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (!Number.isFinite(a.pnl) || !Number.isFinite(b.pnl)) continue;
    const cls = (a.pnl + b.pnl) / 2 >= 0 ? 'fill-gain' : 'fill-loss';
    areas.push(`<path class="${cls}" d="M${X(a.S)},${y0} L${X(a.S)},${Y(a.pnl)} L${X(b.S)},${Y(b.pnl)} L${X(b.S)},${y0} Z"/>`);
  }

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.S).toFixed(1)},${Y(p.pnl).toFixed(1)}`).join(' ');

  const strikes = analysis.strikes.map((k) => `
    <line class="strike" x1="${X(k)}" y1="${pad.t}" x2="${X(k)}" y2="${H - pad.b}"/>
    <text x="${X(k)}" y="${H - pad.b + 12}" text-anchor="middle">${money(k)}</text>`).join('');

  const bes = analysis.breakevens.filter((b) => b >= xMin && b <= xMax).map((b) => `
    <circle class="be" cx="${X(b)}" cy="${y0}" r="4"/>
    <text class="lbl" x="${X(b)}" y="${y0 - 8}" text-anchor="middle">${money(b)}</text>`).join('');

  const spotLine = Number.isFinite(spot) && spot >= xMin && spot <= xMax
    ? `<line class="spot" x1="${X(spot)}" y1="${pad.t}" x2="${X(spot)}" y2="${H - pad.b}"/>
       <text class="lbl" x="${X(spot)}" y="${pad.t - 4}" text-anchor="middle" style="fill:var(--warn)">پایه ${money(spot)}</text>` : '';

  const ticks = [yMin + padY, 0, yMax - padY].map((v) => `
    <line class="grid-line" x1="${pad.l}" y1="${Y(v)}" x2="${W - pad.r}" y2="${Y(v)}"/>
    <text x="${W - pad.r}" y="${Y(v) - 3}" text-anchor="end">${money(v)}</text>`).join('');

  return {
    analysis,
    svg: `<svg class="payoff" viewBox="0 0 ${W} ${H}" role="img" aria-label="نمودار بازده در سررسید">
      ${ticks}${areas.join('')}${strikes}${spotLine}
      <line class="zero" x1="${pad.l}" y1="${y0}" x2="${W - pad.r}" y2="${y0}"/>
      <path class="curve" d="${line}"/>${bes}
    </svg>`,
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
