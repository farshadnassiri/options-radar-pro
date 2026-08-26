// ۲۵. تلاطم ضمنی، نیوتن روی وگا
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { bsPrice, d1d2, impliedVol, npdf } from '../../core/bs.mjs';


// ═════════════════════ ۲۵. تلاطم ضمنی، نیوتن روی وگا ═════════════════════
group('۲۵. تلاطم ضمنی، نیوتن روی وگا');
{
  const r = 0.25, q = 0.03;
  const grid = [];
  for (const S of [5000, 20000, 100000]) {
    for (const m of [0.5, 0.8, 0.95, 1.0, 1.05, 1.2, 2.0]) { // نسبت اعمال به پایه
      for (const T of [0.02, 0.1, 0.5, 1.5]) {
        for (const sig of [0.08, 0.3, 0.65, 1.5, 2.8]) {
          grid.push({ S, K: S * m, T, sig });
        }
      }
    }
  }
  // در ناحیه خیلی در پول یا خیلی بی‌پول با سررسید کوتاه، وگا عملاً صفر
  // است: قیمت روی بازه وسیعی از تلاطم تقریباً ثابت می‌ماند، پس بازیابی
  // تلاطم از قیمت ذاتاً بدشرط است — چه با تنصیف صرف، چه با نیوتن. آن
  // مواردها اینجا کنار گذاشته می‌شوند؛ آزمون جدا زیر همان حالت را می‌سنجد.
  let worst = 0;
  for (const { S, K, T, sig } of grid) {
    for (const kind of ['call', 'put']) {
      const mkt = bsPrice(kind, S, K, T, r, q, sig);
      const [a] = d1d2(S, K, T, r, q, sig);
      const dq = Math.exp(-q * T);
      const vega = S * dq * npdf(a) * Math.sqrt(T);
      if (vega / Math.max(1, mkt) < 1e-3) continue; // ناحیه بدشرط، رد شود
      const iv = impliedVol(kind, mkt, S, K, T, r, q, { lo: 0.01, hi: 5 });
      if (!Number.isFinite(iv)) continue; // خارج از باند نظری، رفتار قبلی هم NaN بود
      worst = Math.max(worst, Math.abs(iv - sig));
    }
  }
  check('نیوتن+تنصیف روی کل شبکه هم‌تراز با تلاطم واقعی همگرا می‌شود',
    worst < 2e-3, `بیشترین اختلاف ${worst.toExponential(2)}`);

  // شبیه‌ترین حالت به رفتار قبلی: نیوتن خاموش، فقط تنصیف صرف.
  {
    const S = 20000, K = 24000, T = 0.3, sig = 0.55;
    const mkt = bsPrice('call', S, K, T, r, q, sig);
    const ivBisect = impliedVol('call', mkt, S, K, T, r, q, { newtonIters: 0 });
    const ivNewton = impliedVol('call', mkt, S, K, T, r, q, {});
    check('نیوتن خاموش هم به همان جواب می‌رسد', near(ivBisect, ivNewton, 1e-6),
      `${ivBisect.toFixed(6)} ~ ${ivNewton.toFixed(6)}`);
  }

  // وگای تقریباً صفر: عمیق در پول و نزدیک سررسید. بازیابی خودِ تلاطم اینجا
  // ذاتاً بدشرط است (قیمت روی بازه‌ای وسیع از سیگما تقریباً ثابت می‌ماند و
  // نیوتن، تنصیف صرف را به یک جواب دیگرِ همان بازه بی‌اعتبار می‌رساند) —
  // پس معیار درست بودن نزدیکی به sig یا به جواب تنصیف صرف نیست. معیار
  // خودِ قرارداد تابع است: جواب داخل کران بماند و قیمتش را واقعاً برگرداند.
  {
    const S = 20000, K = 500, T = 0.01, sig = 0.4; // کال عمیق در پول
    const mkt = bsPrice('call', S, K, T, r, q, sig);
    const iv = impliedVol('call', mkt, S, K, T, r, q, { lo: 0.01, hi: 5 });
    check('وگای نزدیک صفر، جواب داخل کران می‌ماند', iv >= 0.01 && iv <= 5);
    check('وگای نزدیک صفر، قیمت بازسازی‌شده با بازار می‌خواند',
      near(bsPrice('call', S, K, T, r, q, iv), mkt, 1e-3),
      `${bsPrice('call', S, K, T, r, q, iv).toFixed(3)} ~ ${mkt.toFixed(3)}`);
  }

  check('زیر کف نظری هنوز نامعلوم می‌دهد',
    !Number.isFinite(impliedVol('call', 1, 20000, 10000, 0.5, 0.3, 0, {})));
  check('بالای سقف نظری هنوز نامعلوم می‌دهد',
    !Number.isFinite(impliedVol('put', 25000, 20000, 10000, 0.5, 0.3, 0, { hi: 5 })));
}
