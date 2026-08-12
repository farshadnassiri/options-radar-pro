// ارزش‌گذاری چند-سررسیدی — برای تقویمی و مورب.
//
// موتور بازده در سررسید یک فرض دارد: همه پاها هم‌زمان سررسید می‌شوند. برای
// اسپرد عمودی و باترفلای و کندور درست است. برای تقویمی غلط است:
//
//   در تاریخ سررسید پای نزدیک، پای دور هنوز زنده است و ارزش زمانی دارد.
//   اگر مثل موتور تکه‌ای-خطی هر دو را ارزش ذاتی بگیریم، فروش و خرید یک قیمت
//   اعمال همدیگر را صفر می‌کنند و کل تقویمی «بدهکار محض با سود صفر» درمی‌آید.
//   یعنی هر ترکیب تقویمی از غربال می‌افتد؛ که همان چیزی است که آزمون گرفت.
//
// پس افق ارزش‌گذاری را سررسید نزدیک‌ترین پا می‌گیریم:
//
//   پای سررسید‌شده   ارزش ذاتی
//   پای زنده         قیمت بلک-شولز با زمان باقی‌مانده T = (روز پا − افق) / ۳۶۵
//
// این تابع دیگر تکه‌ای-خطی نیست، پس سربه‌سری با نمونه‌برداری و تنصیف پیدا
// می‌شود نه با ریشه دقیق. عدد خروجی تقریبی است و ردیف برچسب می‌خورد.
//
// فرض صریح و مهم: تلاطم پای زنده تا افق ثابت می‌ماند. در بازار ایران این فرض
// سخاوتمندانه است. سود تقویمی عمدتاً از همین تلاطم می‌آید، نه از قیمت پایه.

import { num, ok, EPS } from './num.mjs';
import { signedQty } from './payoff.mjs';
import { bsPrice, intrinsic } from './bs.mjs';

/** آیا پاهای این ترکیب سررسید یکسان دارند. */
export function isSingleExpiry(legs) {
  const ds = legs.filter((l) => l.kind !== 'underlying').map((l) => Math.round(num(l.days, 0)));
  return new Set(ds).size <= 1;
}

/**
 * تحلیل چند-سررسیدی. خروجی، همان شکل analyzePayoff را دارد تا بقیه سیستم
 * نفهمد کدام موتور جواب داده — به‌جز پرچم approx و note.
 */
export function analyzeMixed(legs, netCash, opt = {}) {
  const fees = opt.fees || { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };
  const r = num(opt.rFree, 0.3);
  const q = num(opt.divYield, 0);
  const spot = num(opt.spot, 0);
  const sigma = (l) => {
    const v = num(l.sigma, num(opt.sigma, 0.6));
    return v > 0 ? v : 0.6;
  };

  const optLegs = legs.filter((l) => l.kind !== 'underlying');
  const horizon = Math.min(...optLegs.map((l) => num(l.days, 0)));

  const value = (S) => {
    let v = num(netCash, 0);
    let sharesAfter = 0;
    for (const l of legs) {
      const qy = signedQty(l);
      if (l.kind === 'underlying') { v += qy * S; sharesAfter += qy; continue; }
      const K = num(l.strike);
      const daysLeft = num(l.days, 0) - horizon;
      if (daysLeft <= 0) {
        const intr = intrinsic(l.kind, S, K);
        v += qy * intr;
        if (intr > 0) {
          v -= Math.abs(qy) * K * num(fees.exercise);
          sharesAfter += l.kind === 'call' ? qy : -qy;
        }
      } else {
        // پای زنده: با قیمت نظری بسته می‌شود، پس کارمزد معامله می‌دهد
        const px = bsPrice(l.kind, S, K, daysLeft / 365, r, q, sigma(l));
        v += qy * px - Math.abs(qy) * px * num(fees.option);
      }
    }
    if (Math.abs(sharesAfter) > EPS) {
      const f = sharesAfter > 0 ? num(fees.sellStock) : num(fees.buyStock);
      v -= Math.abs(sharesAfter) * S * f;
    }
    return v;
  };

  // ——— نمونه‌برداری روی بازه معنی‌دار قیمت پایه ———
  const ks = [...new Set(optLegs.map((l) => num(l.strike)))].sort((a, b) => a - b);
  const anchor = spot > 0 ? spot : (ks[0] || 1);
  const lo = Math.max(anchor * 0.35, 1);
  const hi = anchor * 2.2;
  const N = 400;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const S = lo + ((hi - lo) * i) / N;
    pts.push({ S, pnl: value(S) });
  }

  // ——— سربه‌سری با تنصیف روی تغییر علامت ———
  const breakevens = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (!ok(a.pnl) || !ok(b.pnl)) continue;
    if ((a.pnl < 0 && b.pnl > 0) || (a.pnl > 0 && b.pnl < 0)) {
      let x0 = a.S, x1 = b.S;
      for (let k = 0; k < 60; k++) {
        const m = (x0 + x1) / 2;
        if ((value(m) > 0) === (b.pnl > 0)) x1 = m; else x0 = m;
      }
      breakevens.push((x0 + x1) / 2);
    }
  }

  // ——— بیشترین سود و زیان از نمونه، به‌علاوه رفتار دو انتها ———
  let maxProfit = -Infinity, maxLoss = Infinity, atMaxProfit = NaN, atMaxLoss = NaN;
  for (const p of pts) {
    if (!ok(p.pnl)) continue;
    if (p.pnl > maxProfit) { maxProfit = p.pnl; atMaxProfit = p.S; }
    if (p.pnl < maxLoss) { maxLoss = p.pnl; atMaxLoss = p.S; }
  }
  const tailSlope = (pts[N].pnl - pts[N - 1].pnl) / (pts[N].S - pts[N - 1].S);
  const unlimitedProfit = tailSlope > EPS;
  const unlimitedLoss = tailSlope < -EPS;

  // ——— بازه‌های سود، برای احتمال سود ———
  const regions = [];
  let open = null;
  for (const p of pts) {
    if (p.pnl > 0 && open == null) open = p.S;
    if (p.pnl <= 0 && open != null) { regions.push([open, p.S]); open = null; }
  }
  if (open != null) regions.push([open, Infinity]);

  return {
    approx: true,
    horizonDays: horizon,
    breakevens: breakevens.map((x) => Math.round(x * 1e6) / 1e6),
    maxProfit: unlimitedProfit ? Infinity : maxProfit,
    maxLoss: unlimitedLoss ? Infinity : (maxLoss === Infinity ? Infinity : -maxLoss),
    maxLossSigned: maxLoss,
    atMaxProfit, atMaxLoss,
    atZero: value(1),
    nodes: pts.filter((_, i) => i % 8 === 0),
    points: pts,
    segments: null,
    regions,
    slopeLeft: (pts[1].pnl - pts[0].pnl) / (pts[1].S - pts[0].S),
    slopeRight: tailSlope,
    strikes: ks,
    unlimitedProfit, unlimitedLoss,
    at: value,
    note: `ارزش‌گذاری در سررسید پای نزدیک، ${horizon} روز. پای دور با قیمت نظری بسته می‌شود و تلاطمش ثابت فرض شده.`,
  };
}

/**
 * انتخاب خودکار موتور. بقیه سیستم فقط این را صدا می‌زند و لازم نیست بداند
 * کدام موتور جواب داده.
 */
export async function analyzeAuto(legs, netCash, opt = {}) {
  const { analyzePayoff } = await import('./payoff.mjs');
  return isSingleExpiry(legs) ? analyzePayoff(legs, netCash, opt) : analyzeMixed(legs, netCash, opt);
}
