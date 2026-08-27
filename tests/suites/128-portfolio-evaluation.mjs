// ۱۲۸. ارزیابی بازده و ریسک طرح سرمایه‌دار سبد

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { analyzePayoff, pnlAtExpiry } from '../../core/payoff.mjs';
import { portfolioEntryPlan } from '../../core/portfolio-entry.mjs';
import { portfolioCapitalRequirement } from '../../core/portfolio-capital.mjs';
import {
  PORTFOLIO_EVALUATION_VERSION, portfolioPlanEvaluation,
} from '../../core/portfolio-evaluation.mjs';

group('۱۲۸. ارزیابی بازده و ریسک طرح سرمایه‌دار سبد');
{
  const fx128 = portfolioFixture('eval-128');
  const at128 = fx128.at;
  const capitalInputs128 = fx128.capitalInputs;
  const session128 = fx128.session;
  const evidence128 = fx128.evidence;
  const candidateSet128 = fx128.candidateSet;
  const sessionWith128 = fx128.sessionWith;
  const bullishOutlook128 = BULLISH_OUTLOOK;
  const longCall128 = fx128.longCall;
  const strangle128 = fx128.strangle;

  check('پیش‌شرط آزمون: طرح بدهکار و طرح بستانکار هر دو مبنای سرمایه گرفتند',
    longCall128.capital.ok && strangle128.capital.ok,
    `${longCall128.capital.why} | ${strangle128.capital.why}`);

  const evalOf128 = (plan, session = session128) => portfolioPlanEvaluation(
    session, candidateSet128, evidence128, plan.entry, plan.capital,
  );
  const bullish128 = evalOf128(longCall128);

  // ── بند ۱: فقط خروجی سرمایهٔ قانونی همان جلسه ────────────────────────
  check('طرح سرمایه‌دار معتبر ارزیابی می‌گیرد',
    bullish128.ok && bullish128.version === PORTFOLIO_EVALUATION_VERSION, bullish128.why);
  check('شناسهٔ جلسه، نامزد و لحظه از مبنای سرمایه می‌آیند',
    bullish128.sessionId === 'pt-eval-128'
    && bullish128.candidateId === longCall128.capital.candidateId
    && bullish128.now.date === at128.date && bullish128.now.second === at128.second);

  const forged128 = JSON.parse(JSON.stringify(longCall128.capital));
  forged128.components.totalRial = Math.round(forged128.components.totalRial / 2);
  check('مبنای سرمایهٔ دست‌ساز بازده نمی‌گیرد',
    evalOf128({ entry: longCall128.entry, capital: forged128 }).reason === 'invalidCapital');

  const staleMoment128 = JSON.parse(JSON.stringify(longCall128.capital));
  staleMoment128.now = { date: 20260520, second: 10 * 3600 };
  check('مبنای سرمایهٔ ناهم‌لحظه رد می‌شود',
    evalOf128({ entry: longCall128.entry, capital: staleMoment128 }).reason === 'invalidCapital');

  const crossed128 = evalOf128({ entry: strangle128.entry, capital: longCall128.capital });
  check('طرح ورودِ یک نامزد با سرمایهٔ نامزد دیگر جفت نمی‌شود',
    crossed128.reason === 'invalidCapital');

  const idle128 = { ...session128, state: 'draft' };
  check('جلسهٔ غیرفعال ارزیابی نمی‌گیرد',
    portfolioPlanEvaluation(idle128, candidateSet128, evidence128,
      longCall128.entry, longCall128.capital).reason === 'inactiveSession');

  const noMission128 = { ...session128, lockedMission: { liquidity: session128.lockedMission.liquidity } };
  check('مأموریت بدون دید بازار و قیود ریسک ارزیابی نمی‌گیرد',
    portfolioPlanEvaluation(noMission128, candidateSet128, evidence128,
      longCall128.entry, longCall128.capital).reason === 'invalidMission');

  // ── بند ۲: همان موتور مشترک، با VWAP و حجم خودِ طرح ──────────────────
  const expectedLegs128 = longCall128.entry.legs.map((leg) => ({
    kind: leg.kind, side: leg.side,
    ratio: leg.ratio * longCall128.entry.executableQty,
    size: leg.size,
    strike: leg.kind === 'underlying' ? null : leg.strike,
    price: leg.execution.vwap,
  }));
  const expectedNet128 = longCall128.entry.entryCashRial - longCall128.capital.components.feeRial;
  const expectedAnalysis128 = analyzePayoff(expectedLegs128, expectedNet128, {
    fees: capitalInputs128.fees,
  });
  check('جریان نقد ورود پس از کارمزد صریح گزارش می‌شود',
    bullish128.entry.cashRial === longCall128.entry.entryCashRial
    && bullish128.entry.feeRial === longCall128.capital.components.feeRial
    && near(bullish128.entry.cashAfterFeesRial, expectedNet128));
  check('حجم اجرایی همان حجم طرح است و کوچک نشده',
    bullish128.executableQty === longCall128.entry.executableQty
    && bullish128.audit.untouched.executableQty === longCall128.entry.executableQty);
  check('سربه‌سری و بیشترین سود و زیان دقیقاً همان خروجی موتور مشترک‌اند',
    JSON.stringify(bullish128.payoff.breakevensRial) === JSON.stringify(expectedAnalysis128.breakevens)
    && bullish128.payoff.unlimitedProfit === expectedAnalysis128.unlimitedProfit
    && bullish128.payoff.unlimitedLoss === expectedAnalysis128.unlimitedLoss);
  check('ماژول موتور بازده موازی نمی‌سازد',
    /analyzePayoff|pnlAtExpiry/.test(readSrc('../core/portfolio-evaluation.mjs'))
    && !/Math\.max\(0,\s*S\s*-/.test(readSrc('../core/portfolio-evaluation.mjs')));

  // ── بند ۳: نقاط قیمتی، فقط آنچه مأموریت صریح گفته ────────────────────
  check('دید صعودی فقط قیمت هدف قفل‌شده را گزارش می‌کند',
    bullish128.points.length === 1 && bullish128.points[0].code === 'target'
    && bullish128.points[0].priceRial === 11_400
    && bullish128.direction.code === 'bullish');
  check('سود و زیان نقطهٔ هدف از همان موتور مشترک درمی‌آید',
    near(bullish128.points[0].pnlRial,
      pnlAtExpiry(expectedLegs128, 11_400, expectedNet128, { fees: capitalInputs128.fees })));

  const neutral128 = evalOf128(longCall128, sessionWith128({
    direction: 'neutral', volatilityView: 'lower', confidencePct: 55,
    rangeLowRial: 9_800, rangeHighRial: 10_600, thesis: 'انتظار ماندن در بازه',
  }));
  check('دید خنثی هر دو کران بازه را گزارش می‌کند',
    neutral128.ok && neutral128.points.length === 2
    && neutral128.points[0].code === 'rangeLow' && neutral128.points[0].priceRial === 9_800
    && neutral128.points[1].code === 'rangeHigh' && neutral128.points[1].priceRial === 10_600,
    neutral128.why);
  check('بدترین کران جدا و درست علامت‌گذاری می‌شود',
    neutral128.worst !== null
    && neutral128.worst.pnlRial === Math.min(...neutral128.points.map((p) => p.pnlRial)));

  const volatileBare128 = evalOf128(longCall128, sessionWith128({
    direction: 'volatile', volatilityView: 'higher', confidencePct: 60,
    expectedVolatilityPct: 45, thesis: 'انتظار جهش، بدون جهت مشخص',
  }));
  check('دید پرنوسانِ بدون قیمت صریح، هیچ نقطه‌ای نمی‌سازد',
    volatileBare128.ok && volatileBare128.points.length === 0 && volatileBare128.worst === null,
    volatileBare128.why);
  // توضیحِ فایل عمداً از `expectedVolatilityPct` نام می‌برد تا بگوید چرا
  // استفاده نمی‌شود. ادعا باید کدِ واقعی را بسنجد نه متن را، وگرنه به آدم‌ها
  // یاد می‌دهد توضیح ننویسند.
  const evalCode128 = readSrc('../core/portfolio-evaluation.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('از تلاطم مورد انتظار قیمت ساخته نمی‌شود',
    !/expectedVolatilityPct/.test(evalCode128));

  const volatileWide128 = evalOf128(longCall128, sessionWith128({
    direction: 'volatile', volatilityView: 'higher', confidencePct: 60,
    expectedVolatilityPct: 45, rangeLowRial: 9_000, rangeHighRial: 12_000,
    thesis: 'انتظار جهش تا کران‌های ثبت‌شده',
  }));
  check('دید پرنوسان با بازهٔ صریح، فقط همان کران‌ها را گزارش می‌کند',
    volatileWide128.points.map((p) => p.code).join(',') === 'rangeLow,rangeHigh');

  // ── بند ۴: نامتناهی نامتناهی می‌ماند، سقف مأموریت جدا ───────────────
  check('سود نامحدود با عدد بزرگ جایگزین نمی‌شود',
    bullish128.payoff.unlimitedProfit === true
    && bullish128.payoff.maxProfitRial === null
    && bullish128.payoff.maxProfitPct === null);
  check('بیشترین زیانِ طرح بدهکار عدد متناهی و مثبت است',
    bullish128.payoff.unlimitedLoss === false && bullish128.payoff.maxLossRial > 0
    && near(bullish128.payoff.maxLossRial, expectedAnalysis128.maxLoss));

  const strangleEval128 = evalOf128(strangle128);
  check('زیان نامحدود صریح اعلام می‌شود و عدد نمی‌گیرد',
    strangleEval128.ok && strangleEval128.payoff.unlimitedLoss === true
    && strangleEval128.payoff.maxLossRial === null
    && strangleEval128.risk.missionLossCap.worstLossRial === null,
    strangleEval128.why);
  check('زیان نامحدود هر سقف متناهی مأموریت را رد می‌کند',
    strangleEval128.risk.missionLossCap.exceeded === true
    && strangleEval128.risk.missionLossCap.unlimitedRiskBreach === true
    && strangleEval128.risk.missionLossCap.allowUnlimitedRisk === false);
  // یافتهٔ بازِ این دسته در ۱۴۰۵/۰۶/۰۵ بسته شد: موتور دیگر اختیارِ در سود را
  // بی‌قید اعمال‌شده فرض نمی‌کند، پس بیشترین زیانِ کال ساده همان پرمیوم است
  // و با مقدار همان نقطه می‌خواند. ادعای پین‌شده برداشته شد.
  check('سقف زیان مأموریت جدا از بیشترین زیان موتور سنجیده می‌شود',
    bullish128.risk.missionLossCap.maxLossPct === 5
    && bullish128.risk.missionLossCap.capitalBaseRial === 10_000_000
    && bullish128.risk.missionLossCap.capRial === 500_000
    && bullish128.risk.missionLossCap.exceeded
      === (bullish128.payoff.maxLossRial > 500_000));

  // ── بند ۵: کارمزد تسویه صریح و هم‌snapshot، کیفیت تا خروجی ──────────
  const noExercise128 = JSON.parse(JSON.stringify(session128));
  delete noExercise128.startSnapshot.capitalInputs.fees.exercise;
  check('نبود نرخ کارمزد اعمال، ارزیابی را رد می‌کند',
    portfolioPlanEvaluation(noExercise128, candidateSet128, evidence128,
      longCall128.entry, longCall128.capital).reason === 'missingSettlementFees');

  const noSellStock128 = JSON.parse(JSON.stringify(session128));
  delete noSellStock128.startSnapshot.capitalInputs.fees.sellStock;
  check('نبود نرخ سهم، ارزیابی را رد می‌کند — نیمی از نمودار بی‌کارمزد نمی‌ماند',
    portfolioPlanEvaluation(noSellStock128, candidateSet128, evidence128,
      longCall128.entry, longCall128.capital).reason === 'missingSettlementFees');

  const missingQuality128 = JSON.parse(JSON.stringify(session128));
  missingQuality128.startSnapshot.capitalInputs.fees.quality = makeDataQuality({
    kind: 'missing', source: 'locked-broker-settings', asOf: at128,
    sufficient: false, reason: 'نرخ کارمزد در تنظیمات کارگزار ثبت نشده',
  });
  // کیفیت گمشدهٔ کارمزد یک لایه پایین‌تر، در خود مبنای سرمایه، گیر می‌افتد؛
  // پس بازسازی قانونی اینجا شکست می‌خورد و ارزیابی به دروازهٔ تسویه نمی‌رسد.
  // چیزی که این ادعا تضمین می‌کند این است: عددی بیرون نمی‌آید.
  const missingQualityEval128 = portfolioPlanEvaluation(missingQuality128, candidateSet128,
    evidence128, longCall128.entry, longCall128.capital);
  check('کیفیت گمشدهٔ کارمزد هیچ بازده‌ای تولید نمی‌کند',
    missingQualityEval128.ok === false && missingQualityEval128.payoff === null
    && missingQualityEval128.points.length === 0
    && missingQualityEval128.reason === 'invalidCapital');

  const estimated128 = JSON.parse(JSON.stringify(session128));
  estimated128.startSnapshot.capitalInputs.fees.quality = makeDataQuality({
    kind: 'estimated', source: 'locked-broker-settings', asOf: at128,
    sufficient: true, reason: 'نرخ کارمزد از تنظیمات پیش‌فرض کارگزار برآورد شده',
  });
  const estimatedEntry128 = portfolioEntryPlan(estimated128, candidateSet128, evidence128,
    longCall128.capital.candidateId);
  const estimatedCapital128 = portfolioCapitalRequirement(estimated128, candidateSet128,
    evidence128, estimatedEntry128);
  const estimatedEval128 = portfolioPlanEvaluation(estimated128, candidateSet128, evidence128,
    estimatedEntry128, estimatedCapital128);
  check('کیفیت برآوردی و علتش تا خروجی ارزیابی می‌ماند',
    estimatedEval128.ok && estimatedEval128.quality.kind === 'estimated'
    && /برآورد/.test(String(estimatedEval128.audit.settlement.quality.reason)),
    estimatedEval128.why);
  check('نرخ‌های تسویه در ممیزی خروجی ثبت می‌شوند',
    bullish128.audit.settlement.rates.exercise === 0.0005
    && bullish128.audit.settlement.rates.buyStock === 0.003
    && bullish128.audit.settlement.rates.sellStock === 0.009);

  // ── بند ۶: بازده بر سرمایه، فقط از جمع سرمایهٔ لازم ─────────────────
  const total128 = longCall128.capital.components.totalRial;
  check('بازده نقطهٔ هدف فقط با جمع سرمایهٔ لازم حساب می‌شود',
    near(bullish128.points[0].returnPct, (bullish128.points[0].pnlRial / total128) * 100));
  check('مبنای سرمایه کنار بازده نگه داشته می‌شود',
    bullish128.capitalBasis.totalRial === total128
    && bullish128.capitalBasis.kind === longCall128.capital.basis.kind
    && bullish128.capitalBasis.label === longCall128.capital.basis.label);
  check('ارزیابی بودجهٔ خانواده را دست نمی‌زند',
    bullish128.audit.untouched.budgetTargetRial === longCall128.capital.budget.targetRial
    && bullish128.audit.untouched.budgetRequiredRial === longCall128.capital.budget.requiredRial);
  check('مبنای بازدهِ هدفِ مأموریت با مبنای سرمایهٔ طرح اشتباه نمی‌شود',
    !/returnBase/.test(evalCode128));

  // ── مرز قلم: امتیاز، رتبه و احتمال هنوز ساخته نمی‌شوند ──────────────
  check('ماژول امتیاز و رتبه و احتمال نمی‌سازد',
    !/scoreCandidate|rankCandidates|probability/.test(evalCode128));
}
