// ۳۲۵. اسکنر آپشن — ترکیب آزاد سهم، کال و پوت (۱۴۰۵/۰۷/۱۳)
//
// خواستهٔ صاحب پروژه: «اسکنر دنبال استراتژی آماده نمی‌گردد؛ سهم پایه، کال
// و پوت را با نسبت‌های مختلف ترکیب می‌کند و آن‌هایی را که سود می‌دهند مرتب
// می‌کند… با قیمت سرخطی که همان لحظه قابل اجراست، با کارمزد و وجه تضمین؛
// فیلتر دید بازار، سرمایه، احتمال سود، زیان و نقدشوندگی؛ باز کردن هر
// ترکیب با یک کلیک در نمودار سود و زیان.»
//
//   الف  اجزا: نسبت‌ها، سود و زیان سریع، احتمال سریع، نام، دید، نقدشوندگی
//   ب    اسکن کامل روی بازار ساختگی هم‌شکل دیده‌بان
//   ج    کارت و سیم‌کشی

import { check, group, near, readSrc } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { defaults } from '../../core/settings.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { evaluate } from '../../core/evaluate.mjs';
import {
  primitiveRatios, quickPayoff, quickPop, classifyCombo, marketView, liquidityScore, comboScan, scannerConfig,
} from '../../core/combo-scanner.mjs';
import { cardHtml, sparkSvg } from '../../ui/combo-scanner-view.mjs';

const leg = (kind, side, strike, price, ratio = 1, size = 1000) => ({ kind, side, strike, price, ratio, size });

group('۳۲۵-الف. اجزا');
{
  const r2 = primitiveRatios(2, 3);
  check('نسبت‌های دوتایی تا ۳: هفت‌تا، بی تکرار مضرب‌ها', r2.length === 7 && !r2.some(([a, b]) => a === 2 && b === 2) && r2.some(([a, b]) => a === 2 && b === 3));
  const bull = quickPayoff([leg('call', 'buy', 1000, 50), leg('call', 'sell', 1100, 20)]);
  check('اسپرد صعودی کال: زیان محدود = بدهی، سود محدود = عرض − بدهی', near(bull.minPnl, -30000) && near(bull.maxPnl, 70000) && Math.abs(bull.slopeUp) < 1e-9);
  check('فروش برهنهٔ کال: زیان نامحدود', quickPayoff([leg('call', 'sell', 1000, 50)]).minPnl === -Infinity);
  check('نسبت ۱:۲ فروش کال (یک خرید، دو فروش) زیان نامحدود دارد', quickPayoff([leg('call', 'buy', 1000, 50), leg('call', 'sell', 1100, 20, 2)]).minPnl === -Infinity);
  check('کاوردکال (سهم + فروش کال) زیان محدود است', Number.isFinite(quickPayoff([leg('underlying', 'buy', 0, 1000), leg('call', 'sell', 1100, 30)]).minPnl));
  check('کارمزد در سود و زیان سریع هست', quickPayoff([leg('call', 'buy', 1000, 50)], { option: 0.001 }).cash < -50000);

  // احتمال سریع همان مدل `evaluate` است، روی همان منحنی.
  const S = 1000, days = 30, sigma = 0.4;
  const legs = [{ kind: 'call', side: 'buy', strike: 950, ratio: 1, size: 1000 }, { kind: 'call', side: 'sell', strike: 1050, ratio: 1, size: 1000 }];
  const quotes = [{ ask: 80, askQty: 10, bid: 78, bidQty: 10 }, { bid: 30, bidQty: 10, ask: 32, askQty: 10 }];
  const s0 = { ...defaults(), feeOption: 0, priceBasis: 'BOOK' };
  const ev = evaluate({ legs, quotes, ctx: { S, Sclose: S, days, size: 1000, qty: 1, settings: s0, sigmaHist: sigma, greeks: false } });
  const qp = quickPop(quickPayoff([leg('call', 'buy', 950, 80), leg('call', 'sell', 1050, 30)]), S, days / s0.dayCountYear, sigma);
  check('احتمال سود سریع با احتمال `evaluate` یکی است', near(qp, ev.popPct, 0.5), `${qp} / ${ev.popPct}`);

  check('نام‌های کتابی', classifyCombo([leg('call', 'buy', 1000, 1), leg('call', 'sell', 1100, 1)]).name === 'اسپرد صعودی کال'
    && classifyCombo([leg('put', 'sell', 1000, 1), leg('put', 'buy', 1100, 1)]).name === 'اسپرد نزولی پوت'
    && classifyCombo([leg('call', 'sell', 1000, 1), leg('put', 'sell', 1000, 1)]).name === 'فروش استرادل'
    && classifyCombo([leg('underlying', 'buy', 0, 1), leg('call', 'sell', 1100, 1)]).name === 'کاوردکال'
    && classifyCombo([leg('call', 'buy', 900, 1), leg('call', 'sell', 1000, 1, 2), leg('call', 'buy', 1100, 1)]).name === 'پروانه کال');
  const odd = classifyCombo([leg('call', 'sell', 1000, 1, 2), leg('call', 'buy', 1100, 1, 3)]);
  check('نسبت ۲:۳ نام کتابی ندارد: «ترکیب سفارشی (بی‌نام)»', odd.name === 'ترکیب سفارشی' && odd.named === false);

  const lin = (a, b) => (x) => a * x + b;
  check('دید بازار از منحنی: صعودی، نزولی، نوسانی، خنثی',
    marketView(lin(1, -1000), 1000) === 'bull' && marketView(lin(-1, 1000), 1000) === 'bear'
    && marketView((x) => Math.abs(x - 1000) - 30, 1000) === 'vol' && marketView((x) => 50 - Math.abs(x - 1000), 1000) === 'neutral');
  check('اسپرد نزولیِ در سود (بالا رفتن پایه بدتر، پایین آمدن فرقی نمی‌کند) نزولی است', marketView((x) => (x > 1000 ? 1000 - x : 0) + 50, 1000) === 'bear');
  const liq = liquidityScore({ spreadWorstPct: 5, maxQty: 4 }, [{ kind: 'call', side: 'sell', quote: { trades: 3, oi: 10 } }, { kind: 'call', side: 'buy', quote: { trades: 0, vol: 0 } }]);
  check('نقدشوندگی از ۴، با علت هر بند', liq.of === 4 && liq.score === 3 && liq.parts.find((p) => p.label === 'معامله امروز').ok === false);
}

/** بازار ساختگی هم‌شکل دیده‌بان: دو پایه، قیمت بلک-شولز با اسپرد ۴٪. */
function market() {
  const rows = [];
  const mk = (ua, name, S, step, days, end, sig) => {
    for (let K = S - step * 5; K <= S + step * 5; K += step) {
      const T = days / 365, c = bsPrice('call', S, K, T, 0.3, 0, sig), p = bsPrice('put', S, K, T, 0.3, 0, sig);
      const r = (x) => Math.max(1, Math.round(x));
      rows.push({ uaInsCode: ua, lval30_UA: name, pDrCotVal_UA: S, pClosing_UA: S, priceYesterday_UA: S,
        strikePrice: K, remainedDay: days, endDate: end, contractSize: 1000,
        insCode_C: `${ua}C${K}`, lVal18AFC_C: `ض${name}${K}`, pDrCotVal_C: r(c), pClosing_C: r(c), priceYesterday_C: r(c),
        pMeDem_C: r(c * 0.98), pMeOf_C: r(c * 1.02), qTitMeDem_C: 15, qTitMeOf_C: 12, qTotTran5J_C: 40, zTotTran_C: 8, qTotCap_C: 9e7, oP_C: 500, yesterdayOP_C: 480,
        insCode_P: `${ua}P${K}`, lVal18AFC_P: `ط${name}${K}`, pDrCotVal_P: r(p), pClosing_P: r(p), priceYesterday_P: r(p),
        pMeDem_P: r(p * 0.98), pMeOf_P: r(p * 1.02), qTitMeDem_P: 15, qTitMeOf_P: 12, qTotTran5J_P: 40, zTotTran_P: 8, qTotCap_P: 9e7, oP_P: 500, yesterdayOP_P: 480 });
    }
  };
  mk('U1', 'ملی', 8100, 200, 24, 20261029, 0.42);
  mk('U2', 'خود', 2400, 100, 38, 20261112, 0.5);
  // قراردادی بی تقاضا: نباید پای فروشی بسازد.
  const dead = rows.find((r) => r.insCode_C === 'U1C8300');
  dead.pMeDem_C = 0; dead.qTitMeDem_C = 0;
  return buildChain(rows);
}

group('۳۲۵-ب. اسکن کامل');
{
  const chain = market();
  const settings = defaults();
  const cfg = { minPop: 55, maxLossPerSet: 20e6, minLiquidity: 2 };
  const res = comboScan({ chain, uaKeys: ['U1', 'U2'], settings, scanner: cfg, sigmaByUa: { U1: 0.42, U2: 0.5 } });
  const all = res.groups.flatMap((g) => [g.best, ...g.variants]);
  check('اسکن ترکیب پیدا می‌کند و قیف شمرده است', res.totalCombos > 20 && res.funnel.built > 1000 && res.funnel.unlimited > 0, `${res.totalCombos} / ${res.funnel.built}`);
  check('همه ریسک محدود و زیر سقف زیان هر ست', all.every((r) => Number.isFinite(r.maxLoss) && !r.unlimitedLoss && r.maxLoss <= 20e6 + 1));
  check('همه بالای کف احتمال سود و نقدشوندگی', all.every((r) => r.popPct >= 55 - 1e-9 && r.liquidity.score >= 2));
  const quote = (ins) => { for (const ua of chain.values()) for (const ex of ua.expiryList) for (const row of ex.strikeList) for (const q of [row.call, row.put]) if (q.ins === ins) return q; return null; };
  check('قیمت هر پا سرخط همان سمت است: فروش به تقاضا، خرید به عرضه',
    all.every((r) => r.legsCard.every((l) => l.kind === 'underlying' || l.price === (l.side === 'sell' ? quote(l.ins).bid : quote(l.ins).ask))));
  check('قرارداد بی تقاضا هیچ پای فروشی نمی‌سازد', !all.some((r) => r.legsCard.some((l) => l.ins === 'U1C8300' && l.side === 'sell')));
  const key = (r) => r.retStaticMonthPct;
  check('گروه‌ها بر بازده ماهانهٔ «اگر قیمت ثابت بماند» مرتب‌اند', res.groups.every((g, i) => i === 0 || key(res.groups[i - 1].best) >= key(g.best) - 1e-9));
  check('هر گروه یک مجموعهٔ قرارداد است و کارتش بهترین نسبت', new Set(res.groups.map((g) => g.key)).size === res.groups.length
    && res.groups.every((g) => g.variants.every((v) => v.groupKey === g.key && key(v) <= key(g.best) + 1e-9)));
  check('بازده ماهانه از بازده «ثابت ماندن» و روز مانده', all.every((r) => near(r.retStaticMonthPct, (r.retStaticPct * settings.daysPerMonth) / r.days, 1e-6)));
  check('هر ردیف داده نمودار دارد و تابعی همراهش نیست (از ریسه کلون می‌شود)', all.every((r) => r.chart?.legs?.length && r.payoff === undefined && Array.isArray(r.spark))
    && (() => { try { structuredClone(res); return true; } catch { return false; } })());
  const pop = comboScan({ chain, uaKeys: ['U1', 'U2'], settings, scanner: { ...cfg, sort: 'pop' }, sigmaByUa: { U1: 0.42, U2: 0.5 } });
  check('مرتب‌سازی «احتمال سود بیشتر»', pop.groups.every((g, i) => i === 0 || pop.groups[i - 1].best.popPct >= g.best.popPct - 1e-9));
  const bears = comboScan({ chain, uaKeys: ['U1', 'U2'], settings, scanner: { ...cfg, view: 'bear' }, sigmaByUa: { U1: 0.42, U2: 0.5 } });
  check('فیلتر دید بازار', bears.groups.length > 0 && bears.groups.every((g) => g.best.view === 'bear'));
  const capped = comboScan({ chain, uaKeys: ['U1', 'U2'], settings, scanner: { ...cfg, maxCapital: 2e6 }, sigmaByUa: { U1: 0.42, U2: 0.5 } });
  check('فیلتر سرمایهٔ لازم', capped.groups.every((g) => g.best.capital <= 2e6 + 1));
  const noSigma = comboScan({ chain, uaKeys: ['U1'], settings, scanner: cfg });
  check('بی تلاطم تاریخی هم احتمال سود دارد (تلاطم ضمنی)', noSigma.groups.length > 0 && noSigma.groups.every((g) => Number.isFinite(g.best.popPct)));
  check('پیکربندی مرز دارد', scannerConfig({ maxLegs: 9, maxRatio: 99, view: 'x' }).maxLegs === 3 && scannerConfig({ maxRatio: 99 }).maxRatio === 4 && scannerConfig({ view: 'x' }).view === 'all');
  const tiny = comboScan({ chain, uaKeys: ['U1'], settings, scanner: { ...cfg, maxBuilt: 50 } });
  check('سقف ساخت گفته می‌شود', tiny.funnel.truncated === true && tiny.funnel.built === 50);
}

group('۳۲۵-ج. کارت و سیم‌کشی');
{
  const chain = market();
  const res = comboScan({ chain, uaKeys: ['U1'], settings: defaults(), scanner: { minPop: 50, maxLossPerSet: 30e6, minLiquidity: 0 }, sigmaByUa: { U1: 0.42 } });
  const g = res.groups[0];
  const html = cardHtml(g, 0);
  const text = html.replace(/<[^>]*>/g, ' ');
  check('کارت همهٔ اعداد تصمیم را دارد', ['بازده ماهانه', 'احتمال سود', 'بیشترین زیان', 'سرمایهٔ لازم', 'قابل اجرا', 'نقدشوندگی', 'نمودار'].every((t) => text.includes(t)));
  check('کارت پاها را با سمت و نسبت و قیمت سرخط دارد', g.best.legsCard.every((l) => html.includes(`cs-leg ${l.side}`)) && text.includes(' به '));
  check('متن کارت رقم لاتین ندارد', !/[0-9]/.test(text), text.match(/[0-9]+/)?.[0]);
  check('بهترین کارت قاب جدا دارد', html.includes('cs-card best'));
  check('منحنی کوچک سود و زیان کشیده می‌شود', sparkSvg(g.best.spark, g.best.spot).includes('cs-spark-line'));
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('زیرتب «اسکنر آپشن» در رصد لحظه‌ای', /id: 'scanner', title: 'اسکنر آپشن'[^}]*mod: '\/ui\/tabs\/combo-scanner\.mjs'/.test(dash));
  const worker = readSrc('../worker/scan-worker.mjs');
  check('اسکن در ریسهٔ غربال اجرا می‌شود', worker.includes("m.type === 'combo-scan'") && worker.includes('comboScan({'));
  const tab = readSrc('../ui/tabs/combo-scanner.mjs') + readSrc('../ui/combo-scanner-view.mjs');
  check('نمودار سود و زیان با یک کلیک', tab.includes('mountPayoff(') && tab.includes('data-cs-chart'));
  check('فیلترها در مرورگر می‌مانند (فیلتر دلخواه)', tab.includes('localStorage.setItem(STORE'));
}
