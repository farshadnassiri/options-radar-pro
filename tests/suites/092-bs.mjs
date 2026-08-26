// ۹۱. ممیزی عددی یونانی‌ها — تعریف مشتق و مرجع بیرونی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { bsGreeks, bsPrice, histVol } from '../../core/bs.mjs';


// ═══════════════════ ۹۱. ممیزی عددی یونانی‌ها ═══════════════════
//
// خواستهٔ کاربر این بود که صحت محاسبهٔ یونانی‌ها با منابع فارسی تطبیق داده
// شود. آنچه از منابع فارسی به‌دست آمد، **قرارداد واحد** است نه فرمول تازه:
// دلتا حساسیت به قیمت پایه، گاما نرخ تغییر دلتا، وگا اثر یک **واحد درصد**
// تلاطم، تتا افت ارزش در یک **روز**. همان چیزی که `core/bs.mjs` بالای فایل
// اعلام کرده.
//
// ولی «منبع گفته» ادعای ضعیفی است و شش ماه بعد قابل بازسنجی نیست. آنچه
// اینجا نوشته می‌شود قوی‌تر است: هر یونانی، تعریفش را روی خودِ تابع قیمت
// می‌دهد. اگر دلتا واقعاً مشتق قیمت نسبت به پایه باشد، باید با تفاضل
// مرکزیِ `bsPrice` بخواند — و اگر کسی فردا علامت یا مخرجی را عوض کند،
// همین‌جا رد می‌شود، بی‌آنکه لازم باشد کسی سایتی را دوباره بخواند.
//
// مرجع بیرونی هم هست: مثال استاندارد هال (S=49، K=50، r=۵٪، σ=۲۰٪،
// T=۰٫۳۸۴۶ سال) که در متن‌های فارسیِ مشتقات هم همان اعداد نقل می‌شود.
group('۹۱. ممیزی عددی یونانی‌ها — تعریف مشتق و مرجع بیرونی');
{
  const Y91 = 365;
  const cases91 = [
    { kind: 'call', S: 10000, K: 10500, T: 90 / Y91, r: 0.30, q: 0.00, sig: 0.55 },
    { kind: 'put', S: 10000, K: 9500, T: 45 / Y91, r: 0.30, q: 0.02, sig: 0.75 },
    { kind: 'call', S: 24000, K: 24000, T: 200 / Y91, r: 0.22, q: 0.05, sig: 0.35 },
    { kind: 'put', S: 5000, K: 6200, T: 15 / Y91, r: 0.30, q: 0.00, sig: 1.20 },
  ];

  const relOk = (got, want, tol) => Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));

  let deltaOk = true, gammaOk = true, vegaOk = true, thetaOk = true, rhoOk = true;
  const detail91 = [];
  for (const c of cases91) {
    const g = bsGreeks(c.kind, c.S, c.K, c.T, c.r, c.q, c.sig, Y91);
    // دلتا: ∂V/∂S با تفاضل مرکزی
    const hS = c.S * 1e-4;
    const dNum = (bsPrice(c.kind, c.S + hS, c.K, c.T, c.r, c.q, c.sig)
      - bsPrice(c.kind, c.S - hS, c.K, c.T, c.r, c.q, c.sig)) / (2 * hS);
    if (!relOk(g.delta, dNum, 1e-5)) { deltaOk = false; detail91.push(`دلتا ${g.delta.toFixed(6)}≠${dNum.toFixed(6)}`); }

    // گاما: ∂²V/∂S² با تفاضل مرکزی دوم
    const gNum = (bsPrice(c.kind, c.S + hS, c.K, c.T, c.r, c.q, c.sig)
      - 2 * bsPrice(c.kind, c.S, c.K, c.T, c.r, c.q, c.sig)
      + bsPrice(c.kind, c.S - hS, c.K, c.T, c.r, c.q, c.sig)) / (hS * hS);
    if (!relOk(g.gamma, gNum, 1e-3)) { gammaOk = false; detail91.push(`گاما ${g.gamma}≠${gNum}`); }

    // وگا: اثر یک واحد درصد تلاطم، یعنی ∂V/∂σ ÷ ۱۰۰
    const hV = 1e-5;
    const vNum = (bsPrice(c.kind, c.S, c.K, c.T, c.r, c.q, c.sig + hV)
      - bsPrice(c.kind, c.S, c.K, c.T, c.r, c.q, c.sig - hV)) / (2 * hV) / 100;
    if (!relOk(g.vega, vNum, 1e-5)) { vegaOk = false; detail91.push(`وگا ${g.vega}≠${vNum}`); }

    // تتا: افت ارزش در گذشت یک روز تقویمی، یعنی −∂V/∂T ÷ روزِ سال
    const hT = 1e-7;
    const tNum = -(bsPrice(c.kind, c.S, c.K, c.T + hT, c.r, c.q, c.sig)
      - bsPrice(c.kind, c.S, c.K, c.T - hT, c.r, c.q, c.sig)) / (2 * hT) / Y91;
    if (!relOk(g.theta, tNum, 1e-4)) { thetaOk = false; detail91.push(`تتا ${g.theta}≠${tNum}`); }

    // رو: اثر یک واحد درصد نرخ بهره
    const hR = 1e-6;
    const rNum = (bsPrice(c.kind, c.S, c.K, c.T, c.r + hR, c.q, c.sig)
      - bsPrice(c.kind, c.S, c.K, c.T, c.r - hR, c.q, c.sig)) / (2 * hR) / 100;
    if (!relOk(g.rho, rNum, 1e-4)) { rhoOk = false; detail91.push(`رو ${g.rho}≠${rNum}`); }
  }
  check('دلتا همان ∂قیمت/∂پایه است — تفاضل مرکزی روی ۴ قرارداد', deltaOk, detail91.filter((x) => x.startsWith('دلتا')).join(' '));
  check('گاما همان ∂دلتا/∂پایه است', gammaOk, detail91.filter((x) => x.startsWith('گاما')).join(' '));
  check('وگا به‌ازای یک واحد درصد تلاطم است، نه یک واحد', vegaOk, detail91.filter((x) => x.startsWith('وگا')).join(' '));
  check('تتا به‌ازای یک روز تقویمی است و علامتش افت را می‌گوید', thetaOk, detail91.filter((x) => x.startsWith('تتا')).join(' '));
  check('رو به‌ازای یک واحد درصد نرخ است', rhoOk, detail91.filter((x) => x.startsWith('رو')).join(' '));

  // تساوی‌های تحلیلی که هر پیاده‌سازی درست باید بدهد
  const S91 = 10000, K91 = 10200, T91 = 120 / Y91, r91 = 0.28, q91 = 0.03, s91 = 0.62;
  const gc = bsGreeks('call', S91, K91, T91, r91, q91, s91, Y91);
  const gp = bsGreeks('put', S91, K91, T91, r91, q91, s91, Y91);
  check('برابری خرید و فروش: دلتای کال منهای دلتای پوت برابر e^(−qT) است',
    near(gc.delta - gp.delta, Math.exp(-q91 * T91), 1e-9), `${(gc.delta - gp.delta).toFixed(9)}`);
  check('گاما و وگای کال و پوت هم‌اعمال یکی است',
    near(gc.gamma, gp.gamma, 1e-12) && near(gc.vega, gp.vega, 1e-12));
  check('برابری خرید و فروش: رو‌ی کال منهای رو‌ی پوت برابر K·T·e^(−rT)÷۱۰۰ است',
    near(gc.rho - gp.rho, (K91 * T91 * Math.exp(-r91 * T91)) / 100, 1e-9));
  check('برابری قیمت خرید و فروش برقرار است',
    near(bsPrice('call', S91, K91, T91, r91, q91, s91) - bsPrice('put', S91, K91, T91, r91, q91, s91),
      S91 * Math.exp(-q91 * T91) - K91 * Math.exp(-r91 * T91), 1e-7));

  // مرجع بیرونی: مثال کلاسیک هال. اعداد منتشرشده — دلتا ۰٫۵۲۲، گاما ۰٫۰۶۶،
  // وگا ۱۲٫۱ (به‌ازای ۱۰۰٪ تلاطم، یعنی ۰٫۱۲۱ به‌ازای یک واحد درصد)،
  // تتا سالانه ۴٫۳۱− و رو ۸٫۹۱.
  const hull = bsGreeks('call', 49, 50, 0.3846, 0.05, 0, 0.20, 365);
  check('مثال مرجع: دلتا ۰٫۵۲۲', Math.abs(hull.delta - 0.522) < 0.001, hull.delta.toFixed(4));
  check('مثال مرجع: گاما ۰٫۰۶۶', Math.abs(hull.gamma - 0.066) < 0.001, hull.gamma.toFixed(4));
  check('مثال مرجع: وگا ۱۲٫۱ به‌ازای صد واحد درصد', Math.abs(hull.vega * 100 - 12.1) < 0.1, (hull.vega * 100).toFixed(3));
  check('مثال مرجع: تتا سالانه ۴٫۳۱−', Math.abs(hull.theta * 365 + 4.31) < 0.02, (hull.theta * 365).toFixed(3));
  check('مثال مرجع: رو ۸٫۹۱ به‌ازای صد واحد درصد', Math.abs(hull.rho * 100 - 8.91) < 0.02, (hull.rho * 100).toFixed(3));

  // تلاطم تاریخی: سالانه‌سازی با ریشهٔ روز معاملاتی — همان قراردادی که
  // منابع فارسی هم می‌گویند (آن‌ها ۲۵۰ یا ۲۵۲ می‌گیرند؛ عدد از تنظیمات
  // می‌آید، پس قرارداد سنجیده می‌شود نه یک عدد ثابت).
  const daily91 = 0.02;
  const closes91 = [];
  let px91 = 1000;
  for (let i = 0; i < 400; i += 1) { closes91.push(px91); px91 *= Math.exp(((i % 2) ? 1 : -1) * daily91); }
  const hv240 = histVol(closes91, 240);
  const hv252 = histVol(closes91, 252);
  check('تلاطم تاریخی با ریشهٔ روز معاملاتی سالانه می‌شود',
    near(hv252 / hv240, Math.sqrt(252 / 240), 1e-9), `${hv240.toFixed(4)} و ${hv252.toFixed(4)}`);
  check('تلاطم تاریخی انحراف معیار بازده لگاریتمی است',
    Math.abs(hv240 - daily91 * Math.sqrt(240)) < 1e-3, hv240.toFixed(5));
}
