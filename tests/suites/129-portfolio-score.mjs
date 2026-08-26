// ۱۲۹. امتیاز طرح سرمایه‌دار سبد

import { check, group, near, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { bookCapacity, walkBook } from '../../core/exec.mjs';
import { createPortfolioMission } from '../../core/portfolio-mission.mjs';
import { portfolioCandidates } from '../../core/portfolio-candidates.mjs';
import { portfolioEntryPlan } from '../../core/portfolio-entry.mjs';
import { portfolioCapitalRequirement } from '../../core/portfolio-capital.mjs';
import { portfolioPlanEvaluation } from '../../core/portfolio-evaluation.mjs';
import {
  PORTFOLIO_SCORE_VERSION, PORTFOLIO_SCORE_WEIGHTS, portfolioPlanScore,
} from '../../core/portfolio-score.mjs';
import { byId } from '../../strategies/catalog.mjs';

group('۱۲۹. امتیاز طرح سرمایه‌دار سبد');
{
  const at129 = { date: 20260521, second: 10 * 3600 };
  const observed129 = makeDataQuality({
    kind: 'observed', source: 'locked-broker-settings', asOf: at129, sufficient: true,
  });
  const executable129 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: at129, sufficient: true,
    details: { levelsKnown: 2, levelsTotal: 2 },
  });
  const book129 = ({ bid, ask, qty = 40 }) => [
    { level: 1, bid, bidQty: qty, ask, askQty: qty, second: at129.second },
    { level: 2, bid: bid - 2, bidQty: qty, ask: ask + 2, askQty: qty, second: at129.second },
  ];
  const contracts129 = [];
  for (const strike of [9000, 9500, 10_000, 10_500, 11_000, 11_500, 12_000]) {
    contracts129.push({
      ins: `call-${strike}`, kind: 'call', strike, expiry: 20260620, size: 1000,
      quote: { book: book129({ bid: 68, ask: 72 }), close: 70, quality: executable129 },
    });
    contracts129.push({
      ins: `put-${strike}`, kind: 'put', strike, expiry: 20260620, size: 1000,
      quote: { book: book129({ bid: 78, ask: 82 }), close: 80, quality: executable129 },
    });
  }
  const capitalInputs129 = {
    fees: { option: 0.001, buyStock: 0.003, sellStock: 0.009, exercise: 0.0005, quality: observed129 },
    margin: {
      spotCloseRial: 10_200,
      params: { A: 0.20, B: 0.10, C: 10_000, maint: 0.70, bBasis: 'SPOT' },
      creditMode: 'FULL', nakedComboMargin: 'MAX_PLUS_PREMIUM', quality: observed129,
    },
  };
  const capital129 = {
    initialRial: 10_000_000, reserveRial: 0, reservePct: 0,
    allocatableRial: 10_000_000, assignedRial: 0, unassignedRial: 10_000_000,
  };
  const baseSession129 = {
    id: 'pt-eval-129', portfolioId: 'pf-129', baseIns: '900001', state: 'active',
    start: at129, end: { date: 20260620, second: 12 * 3600 },
    capital: capital129,
    lockedAllocations: [
      { familyId: 'single', pct: 20, targetRial: 2_000_000 },
      { familyId: 'vol', pct: 80, targetRial: 8_000_000 },
    ],
    startSnapshot: {
      at: at129, spot: 10_200, contracts: contracts129, capitalInputs: capitalInputs129,
    },
  };

  const missionInput129 = (outlook) => ({
    objective: { mode: 'growth', returnBase: 'initial', targetReturnPct: 25, maxHoldingDays: 30 },
    outlook,
    risk: {
      maxLossPct: 5, maxDrawdownPct: 20, minFreeCapitalPct: 10,
      maxMarginUsePct: 40, allowUnlimitedRisk: false,
    },
    liquidity: {
      minUnderlyingDailyValueRial: 100_000_000,
      minOptionDailyValueRial: 10_000_000,
      minOpenInterest: 100,
      maxSpreadPct: 8,
      maxBookTakePct: 50,
      requireFullBook: false,
    },
    replay: { grain: 'daily' },
  });

  /** جلسه‌ای با همان همه‌چیز، فقط دید بازارش فرق دارد. */
  const sessionWith129 = (outlook) => {
    const made = createPortfolioMission(baseSession129, missionInput129(outlook));
    if (!made.ok) throw new Error(`مأموریت آزمون ساخته نشد: ${made.why}`);
    return { ...baseSession129, lockedMission: made.mission };
  };

  const bullishOutlook129 = {
    direction: 'bullish', volatilityView: 'higher', confidencePct: 70,
    targetPriceRial: 11_400, thesis: 'انتظار رشد پس از گزارش فصلی',
  };
  const session129 = sessionWith129(bullishOutlook129);

  const evidence129 = {
    ok: true,
    now: { ...at129 },
    rows: contracts129.flatMap((contract) => ['buy', 'sell'].map((side) => {
      const executableQty = Math.floor(bookCapacity(contract.quote.book, side, 0, Infinity, 0.5));
      const execution = walkBook(contract.quote.book, executableQty, side, 0, 0.5);
      return {
        candidateId: `${contract.ins}:${side}`, ins: contract.ins, side,
        verdict: 'accepted', accepted: true, executableQty,
        execution: {
          vwap: execution.vwap, top: execution.top, filled: execution.filled,
          levels: execution.levels, maxBookTakePct: 50,
        },
        quality: { candidate: executable129, book: executable129 },
      };
    })),
  };
  const candidateSet129 = portfolioCandidates(
    session129, [byId('long-call'), byId('short-strangle')], evidence129,
  );
  const planFor129 = (defId, session = session129) => {
    const candidate = candidateSet129.candidates.find((row) => row.defId === defId);
    const entry = portfolioEntryPlan(session, candidateSet129, evidence129, candidate.id);
    const capital = portfolioCapitalRequirement(session, candidateSet129, evidence129, entry);
    return { entry, capital };
  };

  const longCall129 = planFor129('long-call');
  const strangle129 = planFor129('short-strangle');

  // سقف زیان ۵٪ برای این طرح‌ها تنگ است و همه را نامعتبر می‌کند؛ برای
  // سنجیدن خودِ امتیاز به مأموریتی با سقف بازتر لازم داریم. سقف تنگ
  // پایین‌تر، جداگانه سنجیده می‌شود.
  const wideRisk129 = {
    maxLossPct: 50, maxDrawdownPct: 60, minFreeCapitalPct: 10,
    maxMarginUsePct: 40, allowUnlimitedRisk: false,
  };
  const sessionRisk129 = (outlook, risk) => {
    const made = createPortfolioMission(baseSession129, { ...missionInput129(outlook), risk });
    if (!made.ok) throw new Error(`مأموریت آزمون ساخته نشد: ${made.why}`);
    return { ...baseSession129, lockedMission: made.mission };
  };

  const wide129 = sessionRisk129(bullishOutlook129, wideRisk129);
  const evalWide129 = portfolioPlanEvaluation(
    wide129, candidateSet129, evidence129, longCall129.entry, longCall129.capital,
  );
  const scoreOf129 = (session, evaluation, plan = longCall129) => portfolioPlanScore(
    session, candidateSet129, evidence129, plan.entry, plan.capital, evaluation,
  );
  const wideScore129 = scoreOf129(wide129, evalWide129);

  check('پیش‌شرط: با سقف بازتر، طرح از دروازهٔ زیان رد می‌شود',
    evalWide129.ok && evalWide129.risk.missionLossCap.exceeded === false, evalWide129.why);

  // ── بند ۱: فقط ارزیابی قانونی همان جلسه ─────────────────────────────
  check('طرح ارزیابی‌شدهٔ معتبر امتیاز می‌گیرد',
    wideScore129.ok && wideScore129.version === PORTFOLIO_SCORE_VERSION
    && wideScore129.ineligible === false, wideScore129.why);
  const forgedEval129 = JSON.parse(JSON.stringify(evalWide129));
  forgedEval129.points[0].pnlRial *= 3;
  check('ارزیابی دست‌ساز امتیاز نمی‌گیرد',
    scoreOf129(wide129, forgedEval129).reason === 'invalidEvaluation');
  const staleEval129 = JSON.parse(JSON.stringify(evalWide129));
  staleEval129.now = { date: 20260520, second: 10 * 3600 };
  check('ارزیابی ناهم‌لحظه امتیاز نمی‌گیرد',
    scoreOf129(wide129, staleEval129).reason === 'invalidEvaluation');
  check('ارزیابی ردشده امتیاز نمی‌گیرد',
    portfolioPlanScore(wide129, candidateSet129, evidence129, longCall129.entry,
      longCall129.capital, { version: 1, ok: false }).reason === 'invalidEvaluation');

  // ── بند ۲: هر جزء نام و وزن و مقدار خام دارد ────────────────────────
  const keys129 = Object.keys(PORTFOLIO_SCORE_WEIGHTS);
  check('وزن اجزا اعلام‌شده است و جمعشان یک می‌شود',
    near(keys129.reduce((sum, k) => sum + PORTFOLIO_SCORE_WEIGHTS[k], 0), 1, 1e-9));
  check('هر جزء نام، وزن، مقدار خام و سهمش را همراه دارد',
    keys129.every((k) => {
      const c = wideScore129.components[k];
      return c && typeof c.label === 'string' && c.label.length > 0
        && c.weight === PORTFOLIO_SCORE_WEIGHTS[k]
        && Number.isFinite(c.value) && near(c.contribution, c.weight * c.value, 1e-9);
    }));
  check('امتیاز کل دقیقاً جمع سهم اجزاست، نه عددی جدا',
    near(wideScore129.score,
      keys129.reduce((sum, k) => sum + wideScore129.components[k].contribution, 0), 1e-9));
  check('مبنای امتیاز کنارش می‌ماند',
    wideScore129.basis.capitalRial === longCall129.capital.components.totalRial
    && wideScore129.basis.targetProfitRial === wide129.lockedMission.objective.targetProfitRial
    && wideScore129.basis.judgedPoint.code === 'target');

  // ── بند ۳: دادهٔ نبوده صفر نمی‌شود ──────────────────────────────────
  const volatileWide129b = sessionRisk129({
    direction: 'volatile', volatilityView: 'higher', confidencePct: 60,
    expectedVolatilityPct: 45, thesis: 'انتظار جهش، بدون قیمت صریح',
  }, wideRisk129);
  const volEval129 = portfolioPlanEvaluation(
    volatileWide129b, candidateSet129, evidence129, longCall129.entry, longCall129.capital,
  );
  const volScore129 = scoreOf129(volatileWide129b, volEval129);
  check('بدون نقطهٔ قیمتی، اجزای وابسته null می‌مانند نه صفر',
    volScore129.ok && volScore129.components.missionAlignment.value === null
    && volScore129.components.targetProgress.value === null
    && volScore129.components.missionAlignment.contribution === null, volScore129.why);
  check('و یک جزء نامعلوم، کل امتیاز را نامعلوم می‌کند',
    volScore129.score === null
    && volScore129.unknownComponents.join(',') === 'missionAlignment,targetProgress');
  check('اجزای مستقل از نقطه همچنان عدد دارند',
    Number.isFinite(volScore129.components.riskHeadroom.value)
    && Number.isFinite(volScore129.components.budgetFit.value));
  check('کیفیت داده وزن نمی‌خورد و جدا گزارش می‌شود',
    wideScore129.quality === undefined ? false
      : wideScore129.quality.kind === evalWide129.quality.kind
        && !Object.keys(wideScore129.components).includes('quality')
        && !Object.keys(PORTFOLIO_SCORE_WEIGHTS).includes('quality'));

  // ── بند ۴: شکستن دروازه یعنی بی‌امتیاز، نه کم‌امتیاز ────────────────
  const tightEval129 = portfolioPlanEvaluation(
    session129, candidateSet129, evidence129, longCall129.entry, longCall129.capital,
  );
  const tightScore129 = scoreOf129(session129, tightEval129);
  check('شکستن سقف زیان مأموریت یعنی بی‌امتیاز، با علت نام‌بُرده',
    tightScore129.ok === false && tightScore129.ineligible === true
    && tightScore129.score === null
    && tightScore129.reason === 'missionLossCapExceeded');

  const strangleWideEval129 = portfolioPlanEvaluation(
    wide129, candidateSet129, evidence129, strangle129.entry, strangle129.capital,
  );
  const strangleScore129 = scoreOf129(wide129, strangleWideEval129, strangle129);
  check('ریسک نامحدودِ اجازه‌داده‌نشده یعنی بی‌امتیاز، نه امتیاز پایین',
    strangleScore129.ok === false && strangleScore129.ineligible === true
    && strangleScore129.score === null
    && strangleScore129.reason === 'unlimitedRiskBreach');

  // ── بند ۵: زیان در نقطهٔ مأموریت، امتیاز هم‌ترازی مثبت نمی‌گیرد ─────
  const bearish129 = sessionRisk129({
    direction: 'bearish', volatilityView: 'lower', confidencePct: 65,
    targetPriceRial: 9_000, thesis: 'انتظار افت پس از گزارش',
  }, wideRisk129);
  const bearEval129 = portfolioPlanEvaluation(
    bearish129, candidateSet129, evidence129, longCall129.entry, longCall129.capital,
  );
  const bearScore129 = scoreOf129(bearish129, bearEval129);
  check('کالِ خریداری‌شده در قیمت هدفِ نزولی زیان می‌دهد',
    bearEval129.ok && bearEval129.points[0].pnlRial < 0, bearEval129.why);
  check('و امتیاز هم‌ترازی‌اش منفی می‌شود، نه مثبت',
    bearScore129.ok && bearScore129.components.missionAlignment.value < 0
    && bearScore129.components.missionAlignment.contribution < 0
    && bearScore129.components.targetProgress.value < 0);
  check('امتیاز کلِ طرحِ ناهم‌تراز از امتیاز طرحِ هم‌تراز کمتر است',
    bearScore129.score < wideScore129.score,
    `${bearScore129.score?.toFixed(3)} در برابر ${wideScore129.score?.toFixed(3)}`);

  // ── بند ۶: نه رتبه، نه مرتب‌سازی، نه «بهترین» ───────────────────────
  const scoreCode129 = readSrc('../core/portfolio-score.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('ماژول رتبه‌بندی و مرتب‌سازی و انتخاب بهترین نمی‌کند',
    !/\.sort\(|rank|best|top\b/i.test(scoreCode129));
  check('و توزیع احتمال نمی‌سازد',
    !/probability|distribution|normal|erf/i.test(scoreCode129));
}
