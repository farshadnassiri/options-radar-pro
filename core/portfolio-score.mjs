// امتیاز یک طرح سرمایه‌دار سبد — برش هفتم فاز ۳.
//
// حالا برای هر طرح می‌دانیم چقدر سرمایه قفل می‌کند و در نقاط قیمتیِ خودِ
// مأموریت چه سود و زیانی می‌سازد. آنچه نداریم یک عدد مقایسه‌پذیر است: دو
// طرح با دو سرمایه و دو پروفایل ریسک را نمی‌شود کنار هم گذاشت.
//
// سه قاعده که این فایل را شکل داده‌اند:
//
// **امتیازی که نشود گفت از کجا آمده، امتیاز نیست.** هر جزء نام دارد،
// وزنش اعلام‌شده است، و مقدار خامش کنار سهمش در خروجی می‌ماند. عددِ تنها
// بدون اجزا، اعتماد می‌سازد بدون اینکه لیاقتش را داشته باشد.
//
// **صفر یعنی صفر، نه «نمی‌دانم».** جزئی که ورودی‌اش `null` است خودش
// `null` می‌ماند و کل امتیاز را `null` می‌کند. اگر جای دادهٔ نبوده صفر
// بگذاریم، طرحِ بی‌داده «بد» دیده می‌شود نه «نامعلوم» — و کاربر به‌جای
// اینکه برود داده را پیدا کند، طرح را دور می‌اندازد.
//
// **امتیاز جای دروازه را نمی‌گیرد.** طرحی که سقف زیان مأموریت را شکسته،
// امتیاز پایین نمی‌گیرد؛ اصلاً امتیاز نمی‌گیرد. امتیازِ پایینِ قابل
// مقایسه یعنی «بد ولی در دسترس»، و این طرح در دسترس نیست.
//
// اینجا هیچ رتبه‌بندی و مرتب‌سازی و انتخاب «بهترین» نیست. فقط امتیاز یک
// طرح. کیفیت داده هم امتیاز نمی‌گیرد و جدا گزارش می‌شود: نمی‌دانستن را
// نمی‌شود با وزن جبران کرد.

import {
  PORTFOLIO_EVALUATION_VERSION, portfolioPlanEvaluation,
} from './portfolio-evaluation.mjs';

export const PORTFOLIO_SCORE_VERSION = 1;

export const PORTFOLIO_SCORE_REASONS = Object.freeze({
  invalidEvaluation: 'ارزیابی بازده معتبر و قابل بازسازی همین جلسه لازم است',
  missionLossCapExceeded: 'بیشترین زیان طرح از سقف زیان مأموریت بیشتر است',
  unlimitedRiskBreach: 'طرح ریسک نامحدود دارد و مأموریت آن را مجاز نکرده',
  missingObjective: 'هدف سود قفل‌شدهٔ مأموریت در دسترس نیست',
});

/**
 * وزن اجزا — سیاستِ اعلام‌شده، نه ادعای دادهٔ بازار.
 *
 * جمعشان یک است تا امتیاز در همان مقیاسِ اجزا بماند. این عددها قابل بحثند
 * و همین‌جا عوض می‌شوند؛ چیزی که قابل بحث نیست این است که پنهان نباشند.
 */
export const PORTFOLIO_SCORE_WEIGHTS = Object.freeze({
  missionAlignment: 0.40,
  targetProgress: 0.25,
  riskHeadroom: 0.25,
  budgetFit: 0.10,
});

export const PORTFOLIO_SCORE_COMPONENTS = Object.freeze({
  missionAlignment: 'بازده طرح در نقاط قیمتیِ مأموریت، بر سرمایهٔ لازم',
  targetProgress: 'سود طرح در نقاط مأموریت، بر هدف سود قفل‌شده',
  riskHeadroom: 'فاصلهٔ بیشترین زیان تا سقف زیان مأموریت',
  budgetFit: 'فاصلهٔ سرمایهٔ لازم تا بودجهٔ قفل‌شدهٔ خانواده',
});

const text = (value) => String(value ?? '').trim();
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const finite = (value) => (Number.isFinite(value) ? value : null);

function fail(reason, evaluation, extra = {}) {
  return {
    version: PORTFOLIO_SCORE_VERSION,
    ok: false,
    why: PORTFOLIO_SCORE_REASONS[reason],
    reason,
    sessionId: text(evaluation?.sessionId),
    candidateId: text(evaluation?.candidateId),
    now: evaluation?.now ? { ...evaluation.now } : null,
    ineligible: extra.ineligible === true,
    score: null,
    components: extra.components ?? null,
    quality: extra.quality ?? null,
  };
}

/**
 * نقطهٔ سنجش: بدترین نقطهٔ مأموریت وقتی بیش از یکی باشد، وگرنه همان یکی.
 *
 * بدترین را می‌گیریم نه میانگین را. میانگینِ دو کرانِ بازه عددی می‌سازد که
 * در هیچ‌کدام از دو حالت رخ نمی‌دهد.
 */
function judgedPoint(evaluation) {
  if (evaluation.worst) return evaluation.worst;
  return evaluation.points.length === 1 ? evaluation.points[0] : null;
}

/**
 * امتیاز یک طرح ارزیابی‌شده.
 *
 * `evaluation` باید همان خروجی `portfolioPlanEvaluation` برای همین جلسه،
 * همین snapshot و همین طرح باشد.
 */
export function portfolioPlanScore(session, candidateSet, evidence, entry, capital, evaluation) {
  if (evaluation?.version !== PORTFOLIO_EVALUATION_VERSION || evaluation?.ok !== true) {
    return fail('invalidEvaluation', evaluation);
  }
  const canonical = portfolioPlanEvaluation(session, candidateSet, evidence, entry, capital);
  if (!canonical.ok || !sameJson(canonical, evaluation)) {
    return fail('invalidEvaluation', evaluation);
  }

  // ── دروازه پیش از امتیاز ──────────────────────────────────────────
  const cap = evaluation.risk.missionLossCap;
  if (cap.unlimitedRiskBreach === true) {
    return fail('unlimitedRiskBreach', evaluation, { ineligible: true, quality: evaluation.quality });
  }
  if (cap.exceeded === true) {
    return fail('missionLossCapExceeded', evaluation, { ineligible: true, quality: evaluation.quality });
  }

  const targetProfitRial = Number(session?.lockedMission?.objective?.targetProfitRial);
  if (!(Number.isFinite(targetProfitRial) && targetProfitRial > 0)) {
    return fail('missingObjective', evaluation, { quality: evaluation.quality });
  }

  const point = judgedPoint(evaluation);
  const capitalRial = Number(evaluation.capitalBasis.totalRial);
  const raw = {
    // دید پرنوسانِ بدون نقطهٔ صریح، اینجا `null` می‌ماند نه صفر: طرح در
    // نقطه‌ای زیان نداده، ما نقطه‌ای برای سنجیدن نداریم.
    missionAlignment: point && capitalRial > 0 ? point.pnlRial / capitalRial : null,
    targetProgress: point ? point.pnlRial / targetProfitRial : null,
    riskHeadroom: finite(cap.capRial) !== null && finite(cap.worstLossRial) !== null
      && cap.capRial > 0 ? 1 - (cap.worstLossRial / cap.capRial) : null,
    budgetFit: Number(capital.budget.targetRial) > 0
      ? 1 - (Number(capital.budget.requiredRial) / Number(capital.budget.targetRial)) : null,
  };

  const components = {};
  let score = 0;
  let unknown = false;
  for (const key of Object.keys(PORTFOLIO_SCORE_WEIGHTS)) {
    const weight = PORTFOLIO_SCORE_WEIGHTS[key];
    const value = finite(raw[key]);
    const contribution = value === null ? null : weight * value;
    if (value === null) unknown = true; else score += contribution;
    components[key] = {
      label: PORTFOLIO_SCORE_COMPONENTS[key], weight, value, contribution,
    };
  }

  return {
    version: PORTFOLIO_SCORE_VERSION,
    ok: true,
    why: '',
    reason: null,
    sessionId: text(evaluation.sessionId),
    candidateId: text(evaluation.candidateId),
    now: { ...evaluation.now },
    ineligible: false,
    // یک جزءِ نامعلوم کل امتیاز را نامعلوم می‌کند. جمعِ ناقص، عددی است که
    // شبیه امتیاز کامل دیده می‌شود.
    score: unknown ? null : score,
    unknownComponents: Object.keys(components).filter((k) => components[k].value === null),
    components,
    basis: {
      capitalRial,
      targetProfitRial,
      judgedPoint: point ? { code: point.code, pnlRial: point.pnlRial } : null,
      note: 'امتیاز فقط بین طرح‌های همین مأموریت مقایسه‌پذیر است.',
    },
    // کیفیت داده امتیاز نمی‌گیرد و وزن نمی‌خورد؛ نمی‌دانستن را نمی‌شود
    // با وزن جبران کرد. کنار امتیاز می‌ماند تا دیده شود.
    quality: evaluation.quality,
  };
}
