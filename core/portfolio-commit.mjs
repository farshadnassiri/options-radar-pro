// ثبت طرح انتخاب‌شده در دفتر رویداد — برش دهم و پایانی فاز ۳.
//
// کاربر کوتاه‌فهرست را می‌بیند ولی نمی‌تواند کاری با آن بکند. فاز ۴
// (تشکیل سبد و حسابداری) روی «موقعیت ثبت‌شده» بنا می‌شود، پس تا انتخاب
// کاربر جایی ثبت نشود شروع نمی‌شود.
//
// چهار مرز:
//
// **فقط طرحی که همین حالا رتبه دارد.** رتبه از زنجیرهٔ تازه بازساخته
// می‌شود، نه از چیزی که فراخوان می‌فرستد. طرح ردشده یا بی‌امتیاز، حتی با
// شناسهٔ درست، ثبت نمی‌شود — با علت نام‌بُرده.
//
// **رویدادی که نشود از رویش طرح را بازساخت، سند نیست.** پاها با VWAP،
// حجم اجرایی، مبنای سرمایه، امتیاز و اجزایش، و کیفیت داده همه در خود
// رویداد می‌مانند. فردا که موتور عوض شد، این سند باید هنوز بگوید آن روز
// چه چیزی و با چه عددی ثبت شد.
//
// **تکرار بی‌صدا یعنی دو موقعیت به‌جای یکی.** همان نامزد در همان لحظه
// دوبار ثبت نمی‌شود؛ دو طرح مختلف آزادند.
//
// **بودجه کوچک نمی‌شود، رد می‌شود.** ثبتی که از بودجهٔ قفل‌شدهٔ خانواده
// بگذرد رد می‌شود. کوچک‌کردن بی‌خبرِ حجم یعنی کاربر چیزی بگیرد که انتخاب
// نکرده بود.

import { ledgerRoomFor } from './portfolio-ledger.mjs';
import { portfolioRankedPlans } from './portfolio-plans.mjs';
import { portfolioEntryPlan } from './portfolio-entry.mjs';
import { portfolioCapitalRequirement } from './portfolio-capital.mjs';
import { portfolioPlanEvaluation } from './portfolio-evaluation.mjs';
import { portfolioPlanScore } from './portfolio-score.mjs';
import { PORTFOLIO_SCHEMA_VERSION, recordPortfolioTransaction } from './portfolio-session.mjs';

export const PORTFOLIO_COMMIT_VERSION = 1;

export const PORTFOLIO_COMMIT_REASONS = Object.freeze({
  noPlans: 'طرح‌های قابل ثبت این جلسه ساخته نشدند',
  unknownCandidate: 'این نامزد در طرح‌های همین لحظه نیست',
  notRanked: 'فقط طرحی که همین حالا رتبه دارد ثبت می‌شود',
  alreadyCommitted: 'این طرح در همین لحظه ثبت شده است',
  invalidQuantity: 'حجم انتخابی با ظرفیت و داده همین لحظه سازگار نیست',
  familyBudgetExceeded: 'سرمایهٔ لازم از بودجهٔ باقی‌ماندهٔ خانواده بیشتر است',
  missionRiskBreached: 'این ثبت قیود ریسک مأموریت را می‌شکند',
  ledgerRejected: 'دفتر رویداد این ثبت را نپذیرفت',
});

const text = (value) => String(value ?? '').trim();
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function fail(reason, detail = '', extra = {}) {
  return {
    version: PORTFOLIO_COMMIT_VERSION,
    ok: false,
    why: detail ? `${PORTFOLIO_COMMIT_REASONS[reason]} — ${detail}` : PORTFOLIO_COMMIT_REASONS[reason],
    reason,
    session: extra.session ?? null,
    event: null,
    positionId: '',
    budget: extra.budget ?? null,
    breaches: extra.breaches ?? [],
  };
}

/** ثبت‌های پیشین همین جلسه که از این ماژول آمده‌اند. */
function committedPlans(session) {
  return (session?.events || [])
    .filter((event) => event?.type === 'transaction' && event?.data?.commitVersion === PORTFOLIO_COMMIT_VERSION);
}

/**
 * بودجهٔ باقی‌ماندهٔ یک خانواده.
 *
 * از خودِ دفتر رویداد درمی‌آید، نه از شمارنده‌ای جدا: شمارندهٔ موازی روزی
 * با دفتر اختلاف پیدا می‌کند و آن‌وقت هیچ‌کدام سند نیستند.
 */
export function familyBudgetState(session, familyId, targetRial) {
  const spentRial = committedPlans(session)
    .filter((event) => text(event.familyId) === text(familyId))
    .reduce((sum, event) => sum + Number(event.data.capitalRial || 0), 0);
  const target = Number(targetRial);
  return {
    familyId: text(familyId),
    targetRial: Number.isFinite(target) ? target : null,
    spentRial,
    remainingRial: Number.isFinite(target) ? target - spentRial : null,
  };
}

/**
 * ثبت یک طرح رتبه‌دار.
 *
 * `evidence` همان مدرک اجراپذیری هم‌لحظه است. رتبه از زنجیرهٔ تازه
 * بازساخته می‌شود تا «رتبه‌دار بودن» ادعای فراخوان نباشد.
 */
export function commitPortfolioPlan(session, evidence, candidateId, { at = null, quantity = null } = {}) {
  const wanted = text(candidateId);
  const plans = portfolioRankedPlans(session, evidence);
  if (!plans.ok) return fail('noPlans', plans.why);

  const ranked = plans.ranking.ranked.find((row) => text(row.candidateId) === wanted);
  if (!ranked) {
    const aside = plans.ranking.withoutScore.find((row) => text(row.candidateId) === wanted);
    if (aside) return fail('notRanked', `${aside.kind === 'ineligible' ? 'کنار گذاشته شده' : 'امتیاز نامعلوم'}: ${aside.why}`);
    return fail('unknownCandidate', wanted);
  }

  let source = plans.sources.get(wanted);
  if (quantity !== null && quantity !== undefined) {
    const entry = portfolioEntryPlan(session, plans.set, evidence, wanted, { quantity });
    if (!entry.ok) return fail('invalidQuantity', entry.why);
    const capital = portfolioCapitalRequirement(session, plans.set, evidence, entry);
    if (!capital.ok) return fail('invalidQuantity', capital.why);
    const evaluation = portfolioPlanEvaluation(session, plans.set, evidence, entry, capital);
    if (!evaluation.ok) return fail('invalidQuantity', evaluation.why);
    const score = portfolioPlanScore(session, plans.set, evidence, entry, capital, evaluation);
    if (!score.ok) return fail('invalidQuantity', score.why);
    source = { ...source, entry, capital, evaluation, score };
  }
  const { entry, capital, evaluation, score } = source;

  const moment = at ?? session.now ?? session.startSnapshot?.at ?? session.start;
  if (committedPlans(session).some((event) => text(event.data.candidateId) === wanted
    && event.at?.date === moment?.date && event.at?.second === moment?.second)) {
    return fail('alreadyCommitted', wanted);
  }

  const familyId = text(entry.family);
  const budget = familyBudgetState(session, familyId, capital.budget.targetRial);
  const capitalRial = Number(capital.components.totalRial);
  if (Number.isFinite(budget.remainingRial) && capitalRial > budget.remainingRial) {
    return fail('familyBudgetExceeded',
      `${capitalRial} در برابر باقی‌ماندهٔ ${budget.remainingRial}`, { budget });
  }

  // بودجهٔ خانواده تنها قید نیست: سرمایهٔ آزاد و سقف وجه تضمین هم روی کل
  // جلسه‌اند و بدون سنجیدنشان هر ثبت تازه تا حدی کورکورانه است.
  const room = ledgerRoomFor(session, {
    capitalRial,
    marginRial: Number(capital.components.marginRial || 0),
  });
  if (room.ok && room.breaches.length) {
    return fail('missionRiskBreached',
      room.breaches.map((row) => `${row.label}: ${row.wouldBePct.toFixed(1)}٪ در برابر ${row.limitPct}٪`).join(' ،'),
      { budget, breaches: room.breaches });
  }

  // سند: هرچه لازم است تا فردا بشود همین طرح را بازساخت، بدون اینکه به
  // نسخهٔ امروزِ موتورها تکیه کند.
  const data = {
    commitVersion: PORTFOLIO_COMMIT_VERSION,
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    candidateId: wanted,
    defId: text(source.defId),
    rank: ranked.rank,
    executableQty: entry.executableQty,
    capitalRial,
    entryCashRial: Number(entry.entryCashRial),
    legs: entry.legs.map((leg) => ({
      ins: leg.ins, kind: leg.kind, side: leg.side, ratio: leg.ratio, size: leg.size,
      strike: leg.strike, expiry: leg.expiry,
      vwap: Number(leg.execution?.vwap),
      filled: Number(leg.execution?.filled),
    })),
    capital: {
      components: copy(capital.components),
      basis: copy(capital.basis),
      versions: { entry: entry.version, capital: capital.version },
    },
    score: {
      value: score.score,
      components: copy(score.components),
      basis: copy(score.basis),
      version: score.version,
    },
    payoff: copy(evaluation.payoff),
    missionLossCap: copy(evaluation.risk.missionLossCap),
    // کیفیت داده و پرچم برآوردی داخل خود سند می‌ماند. سندی که کیفیتش را
    // نبرد، فردا شبیه دادهٔ قطعی خوانده می‌شود.
    quality: copy(evaluation.quality),
    evaluationVersion: evaluation.version,
  };

  const recorded = recordPortfolioTransaction(session, {
    kind: 'open',
    at: moment,
    strategyId: text(source.defId),
    familyId,
    qty: entry.executableQty,
    executions: entry.legs.map((leg) => ({
      ins: leg.ins, side: leg.side,
      qty: Number(leg.execution?.filled),
      price: Number(leg.execution?.vwap),
    })),
    data,
  });
  if (!recorded.ok) return fail('ledgerRejected', recorded.why, { budget });

  const nextBudget = familyBudgetState(recorded.session, familyId, capital.budget.targetRial);
  return {
    version: PORTFOLIO_COMMIT_VERSION,
    ok: true,
    why: '',
    reason: null,
    session: recorded.session,
    event: recorded.event,
    positionId: recorded.positionId,
    transactionId: recorded.transactionId,
    candidateId: wanted,
    rank: ranked.rank,
    budget: nextBudget,
  };
}
