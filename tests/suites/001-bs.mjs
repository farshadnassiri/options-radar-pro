// ۱. بلک-شولز و یونانی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import {
  bsGreeks, bsPrice, histVol, impliedVol, ncdf, ninv, priceQuantile, probBelow,
} from '../../core/bs.mjs';


// ═══════════════════════════ ۱. موتور بلک-شولز ═══════════════════════════
group('۱. بلک-شولز و یونانی');
{
  const S = 10000, K = 11000, T = 0.25, r = 0.30, q = 0.05, sig = 0.65;
  const c = bsPrice('call', S, K, T, r, q, sig);
  const p = bsPrice('put', S, K, T, r, q, sig);
  check('برابری خرید و فروش', near(c - p, S * Math.exp(-q * T) - K * Math.exp(-r * T), 1e-8),
    `اختلاف ${(c - p - (S * Math.exp(-q * T) - K * Math.exp(-r * T))).toExponential(2)}`);

  for (const kind of ['call', 'put']) {
    const g = bsGreeks(kind, S, K, T, r, q, sig);
    const h = S * 1e-4;
    const dNum = (bsPrice(kind, S + h, K, T, r, q, sig) - bsPrice(kind, S - h, K, T, r, q, sig)) / (2 * h);
    const gNum = (bsPrice(kind, S + h, K, T, r, q, sig) - 2 * bsPrice(kind, S, K, T, r, q, sig)
      + bsPrice(kind, S - h, K, T, r, q, sig)) / (h * h);
    const vNum = (bsPrice(kind, S, K, T, r, q, sig + 0.005) - bsPrice(kind, S, K, T, r, q, sig - 0.005)) / 1;
    const ht = 1e-5;
    const tNum = -((bsPrice(kind, S, K, T + ht, r, q, sig) - bsPrice(kind, S, K, T - ht, r, q, sig)) / (2 * ht)) / 365;
    const rNum = (bsPrice(kind, S, K, T, r + 0.005, q, sig) - bsPrice(kind, S, K, T, r - 0.005, q, sig)) / 1;
    check(`دلتا ${kind}`, near(g.delta, dNum, 1e-4), `${g.delta.toFixed(6)} ~ ${dNum.toFixed(6)}`);
    check(`گاما ${kind}`, near(g.gamma, gNum, 1e-3));
    check(`وگا ${kind}`, near(g.vega, vNum, 1e-3));
    check(`تتا ${kind}`, near(g.theta, tNum, 1e-4), `${g.theta.toFixed(3)} ~ ${tNum.toFixed(3)}`);
    check(`رو ${kind}`, near(g.rho, rNum, 1e-3));
  }

  for (const kind of ['call', 'put']) {
    const mkt = bsPrice(kind, S, K, T, r, q, 0.87);
    const iv = impliedVol(kind, mkt, S, K, T, r, q, { lo: 0.01, hi: 5 });
    check(`رفت و برگشت تلاطم ضمنی ${kind}`, near(iv, 0.87, 1e-4), `${iv.toFixed(6)}`);
  }
  check('تلاطم ضمنی زیر ارزش ذاتی → نامعلوم', !Number.isFinite(impliedVol('call', 1, 20000, 10000, 0.5, 0.3, 0, {})));

  const closes = Array.from({ length: 60 }, (_, i) => 1000 * Math.exp(0.01 * Math.sin(i)));
  check('تلاطم تاریخی عدد متناهی می‌دهد', Number.isFinite(histVol(closes, 240)));

  // معکوس نرمال استاندارد (برای صدک قیمت — قلم الف-۱، تصویر آینده)
  check('ninv(۰٫۵) صفر است', near(ninv(0.5), 0, 1e-9), ninv(0.5));
  for (const x of [-2.5, -1, -0.3, 0.7, 1.8, 3]) {
    check(`رفت و برگشت ninv(ncdf(${x}))`, near(ninv(ncdf(x)), x, 1e-6), ninv(ncdf(x)));
  }
  check('ninv بیرون از (۰،۱) نامعلوم می‌دهد', !Number.isFinite(ninv(0)) && !Number.isFinite(ninv(1)) && !Number.isFinite(ninv(-0.1)));

  // صدک قیمت: عکس probBelow است
  {
    const S2 = 100000, T2 = 30 / 365, sig2 = 0.5;
    for (const p of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const L = priceQuantile(S2, p, T2, sig2);
      check(`صدک ${p * 100}٪ با probBelow سازگار است`, near(probBelow(S2, L, T2, sig2), p, 1e-6),
        `${probBelow(S2, L, T2, sig2)} ~ ${p}`);
    }
    const L05 = priceQuantile(S2, 0.5, T2, sig2);
    check('میانه توزیع لگاریتم-نرمال زیر قیمت پایه است (روند صفر یعنی میانگین نه میانه)',
      L05 < S2, L05);
    const levels = [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => priceQuantile(S2, p, T2, sig2));
    check('صدک‌ها یکنوا صعودی‌اند', levels.every((v, i) => i === 0 || v > levels[i - 1]), levels.join(' , '));
  }
}
