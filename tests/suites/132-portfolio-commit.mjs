// ۱۳۲. ثبت طرح انتخاب‌شده در دفتر رویداد

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import {
  PORTFOLIO_COMMIT_VERSION, commitPortfolioPlan, familyBudgetState,
} from '../../core/portfolio-commit.mjs';

group('۱۳۲. ثبت طرح انتخاب‌شده در دفتر رویداد');
{
  const fx132 = portfolioFixture('commit-132');
  // بودجهٔ پیش‌فرض چیدمان برای خانوادهٔ تک‌پایه ۲ میلیون است و طرح‌های این
  // چیدمان بیشتر می‌خواهند — یعنی هر ثبتی درست و بجا رد می‌شود. برای
  // سنجیدن خودِ ثبت، بودجه بزرگ می‌شود؛ ردِ بودجه پایین‌تر جدا سنجیده
  // می‌شود.
  const roomy132 = JSON.parse(JSON.stringify(fx132.baseSession));
  roomy132.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const wide132 = {
    ...roomy132,
    lockedMission: fx132.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const plans132 = portfolioRankedPlans(wide132, fx132.evidence);
  check('پیش‌شرط: زنجیره طرح‌های رتبه‌دار می‌سازد',
    plans132.ok && plans132.ranking.ranked.length > 1
    && plans132.ranking.withoutScore.length > 0, plans132.why);

  const topId132 = plans132.ranking.ranked[0].candidateId;
  const done132 = commitPortfolioPlan(wide132, fx132.evidence, topId132);

  // ── بند ۱: فقط طرحِ رتبه‌دارِ همین لحظه ──────────────────────────────
  check('طرح رتبه‌دار ثبت می‌شود',
    done132.ok && done132.version === PORTFOLIO_COMMIT_VERSION
    && done132.rank === 1 && done132.positionId.length > 0, done132.why);
  const asideId132 = plans132.ranking.withoutScore[0].candidateId;
  const refused132 = commitPortfolioPlan(wide132, fx132.evidence, asideId132);
  check('طرح کنارگذاشته یا بی‌امتیاز ثبت نمی‌شود، با علت نام‌بُرده',
    refused132.ok === false && refused132.reason === 'notRanked'
    && refused132.why.length > PORTFOLIO_COMMIT_VERSION, refused132.why);
  check('شناسهٔ ناشناخته از «رتبه ندارد» جدا می‌ماند',
    commitPortfolioPlan(wide132, fx132.evidence, 'یک-شناسهٔ-جعلی').reason === 'unknownCandidate');
  check('بدون مدرک اجراپذیری هیچ ثبتی انجام نمی‌شود',
    commitPortfolioPlan(wide132, { ok: false }, topId132).reason === 'noPlans');
  check('جلسهٔ غیرفعال ثبت نمی‌گیرد',
    commitPortfolioPlan({ ...wide132, state: 'draft' }, fx132.evidence, topId132)
      .reason === 'noPlans');
  // «رتبه‌دار بودن» ادعای فراخوان نیست؛ از زنجیرهٔ تازه بازساخته می‌شود.
  const commitCode132 = readSrc('../core/portfolio-commit.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('رتبه از زنجیرهٔ تازه بازساخته می‌شود، نه از ورودی',
    /portfolioRankedPlans\(session, evidence\)/.test(commitCode132)
    && !/ranking\s*[,)]/.test(commitCode132.split('export function commitPortfolioPlan')[1] || ''));

  // ── بند ۲: سند باید طرح را کامل نگه دارد ────────────────────────────
  const data132 = done132.event.data;
  const source132 = plans132.sources.get(topId132);
  check('سند شناسهٔ نامزد، رتبه، حجم اجرایی و لحظه را نگه می‌دارد',
    data132.candidateId === topId132 && data132.rank === 1
    && data132.executableQty === source132.entry.executableQty
    && done132.event.at.date === fx132.at.date
    && done132.event.at.second === fx132.at.second);
  check('پاها با VWAP و حجم پرشده در سند می‌مانند',
    Array.isArray(data132.legs) && data132.legs.length === source132.entry.legs.length
    && data132.legs.every((leg, index) => leg.vwap === source132.entry.legs[index].execution.vwap
      && leg.filled === source132.entry.legs[index].execution.filled
      && leg.ins === source132.entry.legs[index].ins));
  check('مبنای سرمایه و اجزایش عیناً در سند می‌مانند',
    data132.capitalRial === source132.capital.components.totalRial
    && JSON.stringify(data132.capital.components)
      === JSON.stringify(source132.capital.components)
    && data132.capital.basis.kind === source132.capital.basis.kind);
  check('امتیاز و اجزایش در سند می‌مانند — رتبه بدون علت سند نیست',
    data132.score.value === source132.score.score
    && JSON.stringify(data132.score.components)
      === JSON.stringify(source132.score.components));
  check('بیشترین سود و زیان و سقف زیان مأموریت هم در سند هستند',
    data132.payoff.unlimitedProfit === source132.evaluation.payoff.unlimitedProfit
    && data132.missionLossCap.capRial
      === source132.evaluation.risk.missionLossCap.capRial);
  check('نسخهٔ هر موتور ثبت می‌شود تا فردا بشود سند را خواند',
    Number.isInteger(data132.commitVersion) && Number.isInteger(data132.schemaVersion)
    && Number.isInteger(data132.capital.versions.entry)
    && Number.isInteger(data132.evaluationVersion));
  check('اجراها در خود رویداد شناسه می‌گیرند',
    done132.event.executions.length === source132.entry.legs.length
    && done132.event.executions.every((row) => String(row.id).length > 0));

  // ─── حجم صریح کاربر: دوباره‌قیمت‌گذاری، نه کوچک‌کردن ظاهری ─────────
  const selectedQty132 = Math.max(1, Math.floor(source132.entry.executableQty / 2));
  const sized132 = commitPortfolioPlan(wide132, fx132.evidence, topId132, {
    quantity: selectedQty132,
  });
  check('کاربر می‌تواند حجم صحیحی کمتر از ظرفیت واقعی را صریح ثبت کند',
    sized132.ok && sized132.event.data.executableQty === selectedQty132
    && sized132.event.qty === selectedQty132, sized132.why);
  check('هر پا برای همان حجم انتخابی دوباره از دفتر پر می‌شود',
    sized132.ok && sized132.event.data.legs.every((leg) => leg.filled === selectedQty132 * leg.ratio)
    && sized132.event.executions.every((execution, index) =>
      execution.qty === sized132.event.data.legs[index].filled));
  check('حجم کمتر، سند سرمایه همان حجم را می‌گیرد نه سرمایه ظرفیت کامل را',
    sized132.ok && sized132.event.data.capitalRial < done132.event.data.capitalRial);
  check('حجم صفر، کسری و بزرگ‌تر از ظرفیت صریح رد می‌شوند',
    [0, 1.5, source132.entry.executableQty + 1].every((quantity) =>
      commitPortfolioPlan(wide132, fx132.evidence, topId132, { quantity }).reason === 'invalidQuantity'));

  // ── بند ۳: تکرار رد، دو طرح مختلف مجاز ──────────────────────────────
  check('همان نامزد در همان لحظه دوبار ثبت نمی‌شود',
    commitPortfolioPlan(done132.session, fx132.evidence, topId132)
      .reason === 'alreadyCommitted');
  const secondId132 = plans132.ranking.ranked
    .find((row) => row.candidateId !== topId132).candidateId;
  const second132 = commitPortfolioPlan(done132.session, fx132.evidence, secondId132);
  check('ولی طرح دوم مجاز است و موقعیت جدا می‌گیرد',
    second132.ok && second132.positionId !== done132.positionId,
    second132.why);
  check('دفتر رویداد هر دو ثبت را نگه می‌دارد',
    second132.session.events.length === wide132.events.length + 2);

  // ── بند ۴: بودجه رد می‌کند، کوچک نمی‌کند ────────────────────────────
  const family132 = done132.event.familyId;
  const budget132 = familyBudgetState(second132.session, family132,
    plans132.sources.get(topId132).capital.budget.targetRial);
  check('مصرف خانواده پس از ثبت به‌روز می‌شود',
    budget132.spentRial > 0 && budget132.remainingRial === budget132.targetRial - budget132.spentRial);
  check('گزارش ثبت، بودجهٔ تازه را همراه دارد',
    done132.budget.familyId === family132 && done132.budget.spentRial > 0);

  // بودجهٔ تنگ: باید رد شود، نه اینکه حجم را بی‌خبر کوچک کند.
  const tightBudget132 = JSON.parse(JSON.stringify(wide132));
  for (const row of tightBudget132.lockedAllocations) row.targetRial = 1000;
  const tightPlans132 = portfolioRankedPlans(tightBudget132, fx132.evidence);
  const tightId132 = tightPlans132.ok && tightPlans132.ranking.ranked.length
    ? tightPlans132.ranking.ranked[0].candidateId : null;
  check('ثبتی که از بودجهٔ خانواده بگذرد رد می‌شود',
    tightId132 === null
    || commitPortfolioPlan(tightBudget132, fx132.evidence, tightId132)
      .reason === 'familyBudgetExceeded',
    tightId132 === null ? 'با بودجهٔ تنگ هیچ طرحی رتبه نگرفت' : 'رد شد');
  check('و حجم اجرایی هیچ‌جا کوچک نمی‌شود',
    !/Math\.min\([^)]*executableQty|executableQty\s*=\s*Math\./.test(commitCode132)
    && !/quantity\s*=\s*Math\./.test(commitCode132));

  // ── بند ۵: کیفیت داده در خود سند ────────────────────────────────────
  check('کیفیت داده داخل سند می‌ماند',
    data132.quality && data132.quality.kind === source132.evaluation.quality.kind);
  const estimated132 = JSON.parse(JSON.stringify(wide132));
  estimated132.startSnapshot.capitalInputs.fees.quality = makeDataQuality({
    kind: 'estimated', source: 'locked-broker-settings', asOf: fx132.at,
    sufficient: true, reason: 'نرخ کارمزد از تنظیمات پیش‌فرض کارگزار برآورد شده',
  });
  const estPlans132 = portfolioRankedPlans(estimated132, fx132.evidence);
  const estDone132 = commitPortfolioPlan(estimated132, fx132.evidence,
    estPlans132.ranking.ranked[0].candidateId);
  check('پرچم برآوردی و علتش تا داخل سند می‌روند',
    estDone132.ok && estDone132.event.data.quality.kind === 'estimated'
    && /برآورد/.test(String(estDone132.event.data.quality.reason)),
    estDone132.why);

  // ── مرز قلم ─────────────────────────────────────────────────────────
  check('ثبت هیچ عدد مالی تازه‌ای نمی‌سازد',
    !/analyzePayoff|pnlAtExpiry|strategyMargin|entryFees|walkBook/.test(commitCode132));
  check('جلسهٔ ورودی دست‌نخورده می‌ماند و جلسهٔ تازه برمی‌گردد',
    wide132.events.length === 0 && done132.session !== wide132
    && done132.session.events.length === 1);
}
