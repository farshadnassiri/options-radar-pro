// ۱۳۰. رتبه‌بندی و کوتاه‌فهرست طرح‌های سبد

import { check, group, near, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { bookCapacity, walkBook } from '../../core/exec.mjs';
import { createPortfolioMission } from '../../core/portfolio-mission.mjs';
import { portfolioCandidates } from '../../core/portfolio-candidates.mjs';
import { portfolioEntryPlan } from '../../core/portfolio-entry.mjs';
import { portfolioCapitalRequirement } from '../../core/portfolio-capital.mjs';
import { portfolioPlanEvaluation } from '../../core/portfolio-evaluation.mjs';
import { portfolioPlanScore } from '../../core/portfolio-score.mjs';
import { rankPlanScores } from '../../core/portfolio-ranking.mjs';
import { byId } from '../../strategies/catalog.mjs';

group('۱۳۰. رتبه‌بندی و کوتاه‌فهرست طرح‌های سبد');
{
  const at130 = { date: 20260521, second: 10 * 3600 };
  const observed130 = makeDataQuality({
    kind: 'observed', source: 'locked-broker-settings', asOf: at130, sufficient: true,
  });
  const executable130 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: at130, sufficient: true,
    details: { levelsKnown: 2, levelsTotal: 2 },
  });
  const book130 = ({ bid, ask, qty = 40 }) => [
    { level: 1, bid, bidQty: qty, ask, askQty: qty, second: at130.second },
    { level: 2, bid: bid - 2, bidQty: qty, ask: ask + 2, askQty: qty, second: at130.second },
  ];
  const contracts130 = [];
  for (const strike of [9000, 9500, 10_000, 10_500, 11_000, 11_500, 12_000]) {
    contracts130.push({
      ins: `call-${strike}`, kind: 'call', strike, expiry: 20260620, size: 1000,
      quote: { book: book130({ bid: 68, ask: 72 }), close: 70, quality: executable130 },
    });
    contracts130.push({
      ins: `put-${strike}`, kind: 'put', strike, expiry: 20260620, size: 1000,
      quote: { book: book130({ bid: 78, ask: 82 }), close: 80, quality: executable130 },
    });
  }
  const capitalInputs130 = {
    fees: { option: 0.001, buyStock: 0.003, sellStock: 0.009, exercise: 0.0005, quality: observed130 },
    margin: {
      spotCloseRial: 10_200,
      params: { A: 0.20, B: 0.10, C: 10_000, maint: 0.70, bBasis: 'SPOT' },
      creditMode: 'FULL', nakedComboMargin: 'MAX_PLUS_PREMIUM', quality: observed130,
    },
  };
  const capital130 = {
    initialRial: 10_000_000, reserveRial: 0, reservePct: 0,
    allocatableRial: 10_000_000, assignedRial: 0, unassignedRial: 10_000_000,
  };
  const baseSession130 = {
    id: 'pt-eval-130', portfolioId: 'pf-130', baseIns: '900001', state: 'active',
    start: at130, end: { date: 20260620, second: 12 * 3600 },
    capital: capital130,
    lockedAllocations: [
      { familyId: 'single', pct: 20, targetRial: 2_000_000 },
      { familyId: 'vol', pct: 80, targetRial: 8_000_000 },
    ],
    startSnapshot: {
      at: at130, spot: 10_200, contracts: contracts130, capitalInputs: capitalInputs130,
    },
  };

  const missionInput130 = (outlook) => ({
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
  const sessionWith130 = (outlook) => {
    const made = createPortfolioMission(baseSession130, missionInput130(outlook));
    if (!made.ok) throw new Error(`مأموریت آزمون ساخته نشد: ${made.why}`);
    return { ...baseSession130, lockedMission: made.mission };
  };

  const bullishOutlook130 = {
    direction: 'bullish', volatilityView: 'higher', confidencePct: 70,
    targetPriceRial: 11_400, thesis: 'انتظار رشد پس از گزارش فصلی',
  };
  const session130 = sessionWith130(bullishOutlook130);

  const evidence130 = {
    ok: true,
    now: { ...at130 },
    rows: contracts130.flatMap((contract) => ['buy', 'sell'].map((side) => {
      const executableQty = Math.floor(bookCapacity(contract.quote.book, side, 0, Infinity, 0.5));
      const execution = walkBook(contract.quote.book, executableQty, side, 0, 0.5);
      return {
        candidateId: `${contract.ins}:${side}`, ins: contract.ins, side,
        verdict: 'accepted', accepted: true, executableQty,
        execution: {
          vwap: execution.vwap, top: execution.top, filled: execution.filled,
          levels: execution.levels, maxBookTakePct: 50,
        },
        quality: { candidate: executable130, book: executable130 },
      };
    })),
  };
  const candidateSet130 = portfolioCandidates(
    session130, [byId('long-call'), byId('short-strangle')], evidence130,
  );
  const planFor130 = (defId, session = session130) => {
    const candidate = candidateSet130.candidates.find((row) => row.defId === defId);
    const entry = portfolioEntryPlan(session, candidateSet130, evidence130, candidate.id);
    const capital = portfolioCapitalRequirement(session, candidateSet130, evidence130, entry);
    return { entry, capital };
  };

  const longCall130 = planFor130('long-call');
  const strangle130 = planFor130('short-strangle');

  // سقف زیان ۵٪ برای این طرح‌ها تنگ است و همه را نامعتبر می‌کند؛ برای
  // سنجیدن خودِ امتیاز به مأموریتی با سقف بازتر لازم داریم. سقف تنگ
  // پایین‌تر، جداگانه سنجیده می‌شود.
  const wideRisk130 = {
    maxLossPct: 50, maxDrawdownPct: 60, minFreeCapitalPct: 10,
    maxMarginUsePct: 40, allowUnlimitedRisk: false,
  };
  const sessionRisk130 = (outlook, risk) => {
    const made = createPortfolioMission(baseSession130, { ...missionInput130(outlook), risk });
    if (!made.ok) throw new Error(`مأموریت آزمون ساخته نشد: ${made.why}`);
    return { ...baseSession130, lockedMission: made.mission };
  };

  const wide130 = sessionRisk130(bullishOutlook130, wideRisk130);
  const evalWide130 = portfolioPlanEvaluation(
    wide130, candidateSet130, evidence130, longCall130.entry, longCall130.capital,
  );
  const scoreOf130 = (session, evaluation, plan = longCall130) => portfolioPlanScore(
    session, candidateSet130, evidence130, plan.entry, plan.capital, evaluation,
  );
  const wideScore130 = scoreOf130(wide130, evalWide130);

  // امتیازهای واقعی این چیدمان: یکی واجد، یکی ردشده به‌علت سقف زیان،
  // یکی ردشده به‌علت ریسک نامحدود، و یکی بی‌امتیاز به‌علت نبود نقطه.
  const tightScore130 = scoreOf130(session130, portfolioPlanEvaluation(
    session130, candidateSet130, evidence130, longCall130.entry, longCall130.capital,
  ));
  const strangleScore130 = scoreOf130(wide130, portfolioPlanEvaluation(
    wide130, candidateSet130, evidence130, strangle130.entry, strangle130.capital,
  ), strangle130);
  const volSession130 = sessionRisk130({
    direction: 'volatile', volatilityView: 'higher', confidencePct: 60,
    expectedVolatilityPct: 45, thesis: 'انتظار جهش، بدون قیمت صریح',
  }, wideRisk130);
  const volScore130 = scoreOf130(volSession130, portfolioPlanEvaluation(
    volSession130, candidateSet130, evidence130, longCall130.entry, longCall130.capital,
  ));
  // امتیاز نامعلوم از همان طرحِ کال می‌آید (فقط دید بازار فرق دارد)، پس
  // شناسهٔ نامزدش با ردیف واجد یکی است. برای چیدن در یک جدول، شناسه‌اش
  // جدا می‌شود — همان چیزی که در عمل رخ می‌دهد وقتی نامزد دیگری همین
  // وضع را داشته باشد. تکراری‌بودن جداگانه سنجیده می‌شود.
  const volRow130 = { ...volScore130, candidateId: 'c-vol' };
  check('پیش‌شرط آزمون: یک امتیاز واجد، یک ردشده، یک نامعلوم',
    wideScore130.ok && Number.isFinite(wideScore130.score)
    && strangleScore130.ineligible === true && volScore130.score === null,
    `${wideScore130.why} | ${strangleScore130.reason} | ${volScore130.why}`);

  /** همان امتیاز واقعی، با شناسه و عدد دیگر — برای سنجیدن خودِ چیدن. */
  const variant130 = (candidateId, score) => ({
    ...JSON.parse(JSON.stringify(wideScore130)), candidateId, score,
  });

  // ── بند ۱: همه از یک جلسه و یک لحظه و یک مأموریت ────────────────────
  const ok130 = rankPlanScores([wideScore130, strangleScore130, volRow130]);
  check('فهرست هم‌جلسه و هم‌لحظه چیده می‌شود',
    ok130.ok && ok130.sessionId === 'pt-eval-130'
    && ok130.now.date === at130.date && ok130.now.second === at130.second, ok130.why);

  const otherSession130 = { ...variant130('c-other', 1), sessionId: 'pt-eval-999' };
  check('امتیاز از جلسهٔ دیگر کل فراخوانی را رد می‌کند، نه اینکه بیفتد',
    rankPlanScores([wideScore130, otherSession130]).reason === 'mixedSession');
  const otherMoment130 = { ...variant130('c-moment', 1), now: { date: 20260520, second: 10 * 3600 } };
  check('امتیاز از لحظهٔ دیگر هم کل فراخوانی را رد می‌کند',
    rankPlanScores([wideScore130, otherMoment130]).reason === 'mixedMoment');
  const otherMission130 = variant130('c-mission', 1);
  otherMission130.basis = { ...otherMission130.basis, targetProfitRial: 99_999 };
  check('امتیاز از مأموریت دیگر هم رد می‌شود',
    rankPlanScores([wideScore130, otherMission130]).reason === 'mixedMission');
  check('ورودی بدشکل امتیاز حساب نمی‌شود',
    rankPlanScores([wideScore130, { score: 5 }]).reason === 'badScore');
  check('نامزد تکراری رد می‌شود',
    rankPlanScores([wideScore130, variant130(wideScore130.candidateId, 2)])
      .reason === 'duplicateCandidate');
  check('فهرست خالی و سقف نامعتبر رد می‌شوند',
    rankPlanScores([]).reason === 'emptyInput'
    && rankPlanScores([wideScore130], { limit: 0 }).reason === 'invalidLimit'
    && rankPlanScores([wideScore130], { limit: 2.5 }).reason === 'invalidLimit');

  // ── بند ۲: ترتیب قطعی، مستقل از ترتیب ورودی ─────────────────────────
  const tied130 = [
    variant130('c-bbb', 5), variant130('c-aaa', 5),
    variant130('c-ccc', 9), variant130('c-ddd', 1),
  ];
  const order130 = (rows) => rankPlanScores(rows, { limit: 4 }).ranked
    .map((row) => `${row.rank}:${row.candidateId}`).join(' ');
  check('امتیاز بیشتر بالاتر می‌نشیند',
    order130(tied130) === '1:c-ccc 2:c-aaa 3:c-bbb 4:c-ddd', order130(tied130));
  check('برابری با شناسهٔ نامزد حل می‌شود، نه با ترتیب ورودی',
    order130(tied130) === order130([...tied130].reverse())
    && order130(tied130) === order130([tied130[3], tied130[0], tied130[2], tied130[1]]),
    `${order130(tied130)}  |  ${order130([...tied130].reverse())}`);
  check('و دوبار اجرای همان فهرست، همان جدول را می‌دهد',
    JSON.stringify(rankPlanScores(tied130)) === JSON.stringify(rankPlanScores(tied130)));

  // ── بند ۳: ردشده و نامعلوم رتبه نمی‌گیرند ───────────────────────────
  check('طرح ردشده و طرح بی‌امتیاز در جدول رتبه نمی‌آیند',
    ok130.ranked.length === 1 && ok130.ranked[0].candidateId === wideScore130.candidateId
    && ok130.withoutScore.length === 2);
  check('و «ردشده» از «نامعلوم» جدا می‌ماند، با علت هرکدام',
    ok130.withoutScore.some((row) => row.kind === 'ineligible'
      && row.reason === 'unlimitedRiskBreach' && row.why.length > 0)
    && ok130.withoutScore.some((row) => row.kind === 'unknownScore'
      && row.unknownComponents.includes('missionAlignment')));
  check('شمارش‌ها با فهرست‌ها می‌خوانند',
    ok130.counts.total === 3 && ok130.counts.ranked === 1
    && ok130.counts.ineligible === 1 && ok130.counts.unknownScore === 1);
  check('طرحی که سقف زیان مأموریت را شکسته هم رتبه نمی‌گیرد',
    rankPlanScores([tightScore130]).ranked.length === 0);

  // ── بند ۴: علت جایگاه ───────────────────────────────────────────────
  const row130 = ok130.ranked[0];
  check('هر ردیف می‌گوید کدام جزء بالا بردش و کدام پایین کشیدش',
    row130.lifted !== null && row130.lifted.contribution > 0
    && row130.lifted.contribution
      === Math.max(...Object.values(row130.components)
        .map((c) => (Number.isFinite(c.contribution) ? c.contribution : -Infinity)))
    && typeof row130.lifted.label === 'string' && row130.lifted.label.length > 0);
  const bearish130 = sessionRisk130({
    direction: 'bearish', volatilityView: 'lower', confidencePct: 65,
    targetPriceRial: 9_000, thesis: 'انتظار افت',
  }, wideRisk130);
  const bearRank130 = rankPlanScores([scoreOf130(bearish130, portfolioPlanEvaluation(
    bearish130, candidateSet130, evidence130, longCall130.entry, longCall130.capital,
  ))]);
  check('جزء پایین‌کشنده وقتی هست، گزارش می‌شود',
    bearRank130.ranked[0].dragged !== null
    && bearRank130.ranked[0].dragged.contribution < 0
    && bearRank130.ranked[0].dragged.code === 'missionAlignment',
    JSON.stringify(bearRank130.ranked[0].dragged));

  // ── بند ۵: سقف کوتاه‌فهرست، بدون پرکردن ─────────────────────────────
  const many130 = rankPlanScores(tied130, { limit: 2 });
  check('کوتاه‌فهرست سقف صریح می‌گیرد',
    many130.shortlist.length === 2 && many130.limit === 2
    && many130.shortlist[0].candidateId === 'c-ccc');
  check('و اگر واجدها کمتر از سقف باشند، کمتر برمی‌گردد — پر نمی‌شود',
    ok130.shortlist.length === 1 && ok130.limit === 3
    && ok130.counts.shortlist === 1);
  check('سقف پیش‌فرض سه است',
    rankPlanScores(tied130).limit === 3 && rankPlanScores(tied130).shortlist.length === 3);

  // ── بند ۶: هیچ عدد مالی تازه‌ای ─────────────────────────────────────
  const rankCode130 = readSrc('../core/portfolio-ranking.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('ماژول هیچ عدد مالی تازه‌ای نمی‌سازد',
    !/Rial\s*[*/+-]|\*\s*qty|pnl\s*[*/]/.test(rankCode130)
    && !/analyzePayoff|pnlAtExpiry|entryFees|strategyMargin/.test(rankCode130));
  check('و امتیاز را بازمحاسبه نمی‌کند',
    !/weight\s*\*/.test(rankCode130));
}
