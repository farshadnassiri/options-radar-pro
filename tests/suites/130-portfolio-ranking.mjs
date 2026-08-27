// ۱۳۰. رتبه‌بندی و کوتاه‌فهرست طرح‌های سبد

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioPlanEvaluation } from '../../core/portfolio-evaluation.mjs';
import { portfolioPlanScore } from '../../core/portfolio-score.mjs';
import { rankPlanScores } from '../../core/portfolio-ranking.mjs';

group('۱۳۰. رتبه‌بندی و کوتاه‌فهرست طرح‌های سبد');
{
  const fx130 = portfolioFixture('rank-130');
  const at130 = fx130.at;
  const session130 = fx130.session;
  const evidence130 = fx130.evidence;
  const candidateSet130 = fx130.candidateSet;
  const bullishOutlook130 = BULLISH_OUTLOOK;
  const longCall130 = fx130.longCall;
  const strangle130 = fx130.strangle;
  const wideRisk130 = WIDE_RISK;
  const sessionRisk130 = fx130.sessionWith;

  const wide130 = sessionRisk130(bullishOutlook130, wideRisk130);
  const scoreOf130 = (session, evaluation, plan = longCall130) => portfolioPlanScore(
    session, candidateSet130, evidence130, plan.entry, plan.capital, evaluation,
  );
  const evalOf130 = (session, plan = longCall130) => portfolioPlanEvaluation(
    session, candidateSet130, evidence130, plan.entry, plan.capital,
  );
  const wideScore130 = scoreOf130(wide130, evalOf130(wide130));

  // امتیازهای واقعی این چیدمان: یکی واجد، یکی ردشده به‌علت سقف زیان،
  // یکی ردشده به‌علت ریسک نامحدود، و یکی بی‌امتیاز به‌علت نبود نقطه.
  const tightScore130 = scoreOf130(session130, evalOf130(session130));
  const strangleScore130 = scoreOf130(wide130, evalOf130(wide130, strangle130), strangle130);
  const volSession130 = sessionRisk130({
    direction: 'volatile', volatilityView: 'higher', confidencePct: 60,
    expectedVolatilityPct: 45, thesis: 'انتظار جهش، بدون قیمت صریح',
  }, wideRisk130);
  const volScore130 = scoreOf130(volSession130, evalOf130(volSession130));

  // امتیاز نامعلوم از همان طرحِ کال می‌آید (فقط دید بازار فرق دارد)، پس
  // شناسهٔ نامزدش با ردیف واجد یکی است. برای چیدن در یک جدول شناسه‌اش جدا
  // می‌شود؛ تکراری‌بودن جداگانه سنجیده می‌شود.
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
    ok130.ok && ok130.sessionId === fx130.baseSession.id
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
