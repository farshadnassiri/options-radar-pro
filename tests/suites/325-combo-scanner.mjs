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
  liveBook, ladderPoints, executionLadder, payoffScenarios, curveAt,
} from '../../core/combo-scanner.mjs';
import {
  cardHtml, sparkSvg, scenarioLines, breakevenText, rulerHtml, readAt, ladderHtml, execSummary, setText, filterGroups, emptyResultFilter, priceWindow, curvePoints,
} from '../../ui/combo-scanner-view.mjs';
import { HELP } from '../../ui/combo-scanner-help.mjs';

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
  const cfg = { minPop: 55, maxLossPerSet: 20e6, minLiquidity: 2, execRule: 'watch' };
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
  check('هر ردیف داده نمودار دارد و تابعی همراهش نیست (از ریسه کلون می‌شود)', all.every((r) => r.chart?.legs?.length && r.payoff === undefined && r.curve?.segs?.length)
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
  const res = comboScan({ chain, uaKeys: ['U1'], settings: defaults(), scanner: { minPop: 50, maxLossPerSet: 30e6, minLiquidity: 0, execRule: 'watch' }, sigmaByUa: { U1: 0.42 } });
  const g = res.groups[0];
  const html = cardHtml(g, 0);
  const text = html.replace(/<[^>]*>/g, ' ');
  check('کارت همهٔ اعداد تصمیم را دارد', ['بازده ماهانه', 'احتمال سود', 'بیشترین زیان', 'سرمایهٔ لازم', 'سربه‌سر', 'اجرای شدنی', 'نقدشوندگی', 'نمودار'].every((t) => text.includes(t)));
  check('کارت پاها را با سمت و نسبت و قیمت سرخط دارد', g.best.legsCard.every((l) => html.includes(`cs-leg ${l.side}`)) && text.includes(' به '));
  check('متن کارت رقم لاتین ندارد', !/[0-9]/.test(text), text.match(/[0-9]+/)?.[0]);
  check('بهترین کارت قاب جدا دارد', html.includes('cs-card best'));
  check('منحنی کوچک سود و زیان کشیده می‌شود', sparkSvg(g.best).includes('cs-spark-line'));
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('زیرتب «اسکنر آپشن» در رصد لحظه‌ای', /id: 'scanner', title: 'اسکنر آپشن'[^}]*mod: '\/ui\/tabs\/combo-scanner\.mjs'/.test(dash));
  const worker = readSrc('../worker/scan-worker.mjs');
  check('اسکن در ریسهٔ غربال اجرا می‌شود', worker.includes("m.type === 'combo-scan'") && worker.includes('comboScan({'));
  const tab = readSrc('../ui/tabs/combo-scanner.mjs') + readSrc('../ui/combo-scanner-view.mjs');
  check('نمودار سود و زیان با یک کلیک', tab.includes('mountPayoff(') && tab.includes('data-cs-chart'));
  check('فیلترها در مرورگر می‌مانند (فیلتر دلخواه)', tab.includes('localStorage.setItem(STORE'));
}

// ═══ دور دوم (۱۴۰۵/۰۷/۱۳): دفتر سفارش، پلکان، سناریو، نمودار دقیق، فیلتر، راهنما ═══

/** دفتر پنج‌سطحی ساختگی روی همهٔ قراردادها و سهم پایه، با زمان دریافت. */
function withBooks(chain, now, { halt = null } = {}) {
  for (const ua of chain.values()) {
    ua.book = [{ bid: ua.last - 1, bidQty: 60000, ask: ua.last + 1, askQty: 40000 }, { bid: ua.last - 2, bidQty: 60000, ask: ua.last + 3, askQty: 90000 }];
    ua.bookAt = now; ua.state = 'A';
    for (const ex of ua.expiryList) for (const row of ex.strikeList) for (const q of [row.call, row.put]) {
      q.book = [0, 1, 2, 3, 4].map((k) => ({ bid: Math.max(1, Math.round(q.bid * (1 - 0.04 * k))), bidQty: 5 + 3 * k, ask: Math.round(q.ask * (1 + 0.04 * k)), askQty: 4 + 3 * k }));
      q.bookAt = now; q.state = q.ins === halt ? 'IS' : 'AS'; q.depth = true;
    }
  }
  return chain;
}

group('۳۲۵-د. شرط اجرا با دفتر سفارش زنده');
{
  const settings = defaults();
  const cfg = { minPop: 55, maxLossPerSet: 20e6, minLiquidity: 0 };
  const bare = comboScan({ chain: market(), uaKeys: ['U1', 'U2'], settings, scanner: cfg, sigmaByUa: { U1: 0.42, U2: 0.5 } });
  check('پیش‌فرض «فقط شدنی با دفتر زنده»: بی دفتر سفارش هیچ پیشنهادی نیست، با علت', scannerConfig({}).execRule === 'book' && bare.totalCombos === 0 && bare.funnel.noBook > 0 && bare.funnel.stockNoBook > 0);
  const now = 1_700_000_000_000;
  const chain = withBooks(market(), now, { halt: 'U1P8100' });
  const res = comboScan({ chain, uaKeys: ['U1', 'U2'], settings, scanner: cfg, sigmaByUa: { U1: 0.42, U2: 0.5 }, now });
  const all = res.groups.flatMap((g) => [g.best, ...g.variants]);
  check('با دفتر زنده ترکیب‌های شدنی پیدا می‌شوند و منبعشان «دفتر زنده» است', all.length > 10 && all.every((r) => r.bookLive));
  check('نماد متوقف (وضعیت غیرمجاز) در هیچ ترکیبی نیست', res.funnel.notTradable > 0 && !all.some((r) => r.legsCard.some((l) => l.ins === 'U1P8100')));
  check('قیمت هر پا سرخطِ دفتر زنده است', all.every((r) => r.legsCard.every((l, i) => l.kind === 'underlying' || l.price === (l.side === 'sell' ? r.quotes[i].book[0].bid : r.quotes[i].book[0].ask))));
  const stale = comboScan({ chain, uaKeys: ['U1'], settings, scanner: cfg, sigmaByUa: { U1: 0.42 }, now: now + 10 * 60 * 1000 });
  check('دفتر کهنه‌تر از سقف «زنده» نیست', stale.totalCombos === 0 && stale.funnel.noBook > 0);
  check('liveBook: بی وضعیت یعنی نمی‌دانیم، و پیشنهاد نمی‌شود', !liveBook({ book: [{ bid: 1 }], bookAt: now }, scannerConfig({}), now).ok && liveBook({ book: [{ bid: 1 }], bookAt: now, state: 'A' }, scannerConfig({}), now).ok);
  const big = comboScan({ chain, uaKeys: ['U1', 'U2'], settings, scanner: { ...cfg, minSets: 15 }, sigmaByUa: { U1: 0.42, U2: 0.5 }, now });
  check('فیلتر حجم شدنی دست‌کم', big.groups.every((g) => g.best.maxQty >= 15));

  // پلکان اجرا
  const b = res.groups[0].best;
  const pts = ladderPoints(b.evLegs, b.quotes, b.maxQty);
  check('نقاط پلکان از سطح‌های دفتر می‌آید و به سقف حجم ختم می‌شود', pts[0] === 1 && pts[pts.length - 1] === b.maxQty && pts.length > 2, pts.join(','));
  const lad = b.ladder;
  check('پلکان: هر پله همان ترکیب با همان حجم سنجیده شده', lad.length >= 2 && lad[0].n === 1 && near(lad[0].retStaticMonthPct, b.retStaticMonthPct, 1e-6) && near(lad[0].netCash, b.netCash, 1e-6));
  check('با حجم بیشتر، قیمت میانگین بدتر و بازده کمتر یا برابر', lad.every((x, i) => i === 0 || x.retStaticMonthPct <= lad[i - 1].retStaticMonthPct + 1e-9) && lad.at(-1).retStaticMonthPct < lad[0].retStaticMonthPct);
  check('نقد و سرمایهٔ کل با حجم بزرگ می‌شود', Math.abs(lad.at(-1).netCash) > Math.abs(lad[0].netCash) && lad.at(-1).capital > lad[0].capital);
  check('شمار قرارداد هر پله = جمع نسبت‌ها × ست', lad.every((x) => x.contracts === b.legsCard.filter((l) => l.kind !== 'underlying').reduce((a, l) => a + l.ratio, 0) * x.n));
  check('خلاصهٔ اجرا: بیشترین ست و ارزش ریالی‌اش', execSummary(b).sets === b.maxQty && Number.isFinite(execSummary(b).netCash) && execSummary(b).capital > 0);
  check('«ست» به زبان ساده گفته می‌شود', /^هر ست = (فروش|خرید)/.test(setText(b)) && setText(b).includes('قرارداد'));
  const lh = ladderHtml(lad);
  check('جدول پلکان؛ پله‌های ضعیف کم‌رنگ', lh.includes('cs-ladder') && (lad.some((x) => x.retStaticMonthPct < lad[0].retStaticMonthPct / 2) ? lh.includes('class="weak"') : true));
  const again = executionLadder({ legs: b.evLegs, quotes: b.quotes, ctx: b.ctx, settings: { ...settings, priceBasis: 'BOOK' }, maxSets: b.maxQty, monthDays: settings.daysPerMonth });
  check('پلکان در رابط هم همان عدد ریسه را می‌دهد', again.length === lad.length && again.every((x, i) => near(x.retStaticMonthPct, lad[i].retStaticMonthPct, 1e-9)));
}

group('۳۲۵-هـ. سناریوی شرطی، نمودار دقیق، فیلتر نتیجه، راهنما');
{
  // اسپرد صعودی کال روی ۱۰۰۰: زیر ۱۰۰۰ زیان ثابت، بالای ۱۱۰۰ سود ثابت.
  const curve = { segs: [{ lo: 0, hi: 1000, a: 0, b: -30000 }, { lo: 1000, hi: 1100, a: 1000, b: -1030000 }, { lo: 1100, hi: Infinity, a: 0, b: 70000 }] };
  const sc = payoffScenarios(curve, 1050);
  check('بازه‌ها در ریشه شکسته می‌شوند و هر کدام یک علامت دارند', sc.length === 4 && sc[0].sign === 'loss' && sc[0].trend === 'flat'
    && sc[1].sign === 'loss' && near(sc[1].hi, 1030) && sc[2].sign === 'profit' && sc[3].open && sc[3].trend === 'flat');
  check('درصد فاصلهٔ هر مرز از قیمت فعلی', near(sc[1].hiPct, ((1030 - 1050) / 1050) * 100));
  const r = { id: 'x', uaName: 'ملی', spot: 1050, curve, capital: 30000, maxLoss: 30000, scenarios: sc,
    beList: [{ price: 1030, pct: ((1030 - 1050) / 1050) * 100 }], legsCard: [{ kind: 'call', strike: 1000, side: 'buy', ratio: 1 }, { kind: 'call', strike: 1100, side: 'sell', ratio: 1 }] };
  const lines = scenarioLines(r);
  check('جمله‌های شرطی: زیان ثابت، سربه‌سر، سود ثابت', lines[0].text.startsWith('زیر') && lines[0].text.includes('زیان ثابت') && lines.at(-1).text.startsWith('بالای') && lines.at(-1).text.includes('سود ثابت'));
  check('بازهٔ قیمت فعلی نشان دارد', lines.filter((x) => x.here).length === 1 && lines.find((x) => x.here).sign === 'profit');
  check('سربه‌سر با درصد فاصله', breakevenText(r).includes('٪') && breakevenText(r).includes('−'));
  const rd = readAt(r, 1100);
  check('خوانش هر قیمت: سود یا زیان و درصد سرمایه', near(rd.pnl, 70000) && rd.text.includes('سود') && near(rd.capPct, (70000 / 30000) * 100));
  check('خط‌کش: باند هر بازه، تیک سربه‌سر، قیمت فعلی، و لغزنده در حالت تعاملی', (rulerHtml(r).match(/cs-band /g) || []).length >= 3 && rulerHtml(r).includes('cs-be-tick') && rulerHtml(r, { interactive: true }).includes('data-cs-slide'));
  // نمودار کوچک دقیق: نقاط همان مرزهای منحنی است، نه نمونه
  const win = priceWindow(r);
  const pts = curvePoints(r, win);
  check('نمودار کوچک از مرزهای واقعی منحنی کشیده می‌شود', pts.some(([x]) => x === 1000) && pts.some(([x]) => x === 1100) && pts.some(([x]) => near(x, 1030))
    && pts.every(([x, y]) => near(y, curveAt(curve, x), 1e-6)));
  const svg = sparkSvg(r);
  check('ناحیهٔ سود و زیان جدا و بی clipPath (شناسهٔ مشترک کارت‌ها همان باگ پیشین بود)', svg.includes('cs-spark-gain') && svg.includes('cs-spark-loss') && !svg.includes('clipPath'));
  check('بازهٔ نمایش دست‌کم ±۲۰٪ و همهٔ مرزها', win.lo <= 1050 * 0.8 + 1e-9 && win.hi >= 1050 * 1.2 - 1e-9);

  // فیلتر نتیجه
  const mk = (id, o) => ({ key: id, count: 1, variants: [], best: { id, uaIns: o.ua, uaName: o.ua, comboName: o.named ? 'اسپرد صعودی کال' : 'ترکیب سفارشی', named: o.named, netCash: o.cash, legsCard: o.legs, maxQty: o.sets, retStaticMonthPct: o.ret, popPct: 60, maxLoss: o.loss, capital: 1, beList: [{ pct: o.be }], ladder: [] } });
  const L2 = [{ kind: 'call', name: 'ضملی1' }, { kind: 'put', name: 'طملی2' }];
  const gs = [mk('a', { ua: 'ملی', named: true, cash: 100, legs: L2, sets: 3, ret: 10, loss: 5, be: -5 }), mk('b', { ua: 'خود', named: false, cash: -50, legs: [...L2, { kind: 'underlying', name: 'خود' }], sets: 12, ret: 30, loss: 9, be: 2 })];
  const ef = emptyResultFilter();
  check('فیلتر نتیجه: نماد، بااسم/بی‌نام، نقد، پا، حجم، جست‌وجو', filterGroups(gs, { ...ef, ua: 'ملی' }).length === 1 && filterGroups(gs, { ...ef, kind: 'custom' })[0].key === 'b'
    && filterGroups(gs, { ...ef, cash: 'credit' })[0].key === 'a' && filterGroups(gs, { ...ef, legs: 'stock' })[0].key === 'b'
    && filterGroups(gs, { ...ef, minSets: 10 }).length === 1 && filterGroups(gs, { ...ef, q: 'طملی2' }).length === 2);
  check('مرتب‌سازی نتیجه: کمترین زیان، دورترین سربه‌سر', filterGroups(gs, { ...ef, sort: 'loss' })[0].key === 'a' && filterGroups(gs, { ...ef, sort: 'room' })[0].key === 'a');

  // راهنما
  const tab = readSrc('../ui/tabs/combo-scanner.mjs') + readSrc('../ui/combo-scanner-view.mjs');
  const used = [...tab.matchAll(/helpIcon\('([^']+)'\)/g)].map((m) => m[1])
    .concat([...tab.matchAll(/numField\('[^']+', '[^']+', [^,]+, '[^']*', '([^']+)'/g)].map((m) => m[1]));
  const missing = [...new Set(used)].filter((k) => !HELP[k]);
  check('هر «؟» متن دارد و همهٔ بخش‌ها «؟» دارند', used.length >= 30 && !missing.length && ['execRule', 'card-exec', 'card-ladder', 'card-be', 'detail-ruler', 'results'].every((k) => used.includes(k)), missing.join('،'));
  check('متن راهنما اصطلاح لاتین ندارد', Object.values(HELP).every((t) => !/[A-Za-z]{3,}/.test(t)));
}
