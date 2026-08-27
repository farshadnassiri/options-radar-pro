// ۱۲۹. امتیاز طرح سرمایه‌دار سبد

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioPlanEvaluation } from '../../core/portfolio-evaluation.mjs';
import {
  PORTFOLIO_SCORE_VERSION, PORTFOLIO_SCORE_WEIGHTS, portfolioPlanScore,
} from '../../core/portfolio-score.mjs';

group('۱۲۹. امتیاز طرح سرمایه‌دار سبد');
{
  const fx129 = portfolioFixture('score-129');
  const session129 = fx129.session;
  const evidence129 = fx129.evidence;
  const candidateSet129 = fx129.candidateSet;
  const bullishOutlook129 = BULLISH_OUTLOOK;
  const longCall129 = fx129.longCall;
  const strangle129 = fx129.strangle;
  const wideRisk129 = WIDE_RISK;
  const sessionRisk129 = fx129.sessionWith;

  // سقف زیان تنگِ پیش‌فرض چیدمان، این طرح‌ها را نامعتبر می‌کند؛ برای
  // سنجیدن خودِ امتیاز به مأموریتی با سقف بازتر لازم داریم. سقف تنگ
  // جداگانه سنجیده می‌شود.
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
