// زنجیرهٔ طرح‌های یک جلسه، از مدرک اجراپذیری تا رتبه.
//
// چرا جداست: هم لایهٔ نمایش این زنجیره را لازم دارد و هم ثبت طرح. اگر هر
// کدام خودش بسازدش، روزی یکی‌شان عوض می‌شود و آن‌وقت کاربر چیزی را ثبت
// می‌کند که با آنچه دیده بود یکی نیست — و هیچ آزمونی این را نمی‌گیرد.
//
// اینجا هیچ عدد تازه‌ای ساخته نمی‌شود؛ فقط موتورهای موجود پشت سر هم صدا
// زده می‌شوند و کنار هر رتبه، منبعش نگه داشته می‌شود.

import { portfolioCandidates } from './portfolio-candidates.mjs';
import { portfolioEntryPlan } from './portfolio-entry.mjs';
import { portfolioCapitalRequirement } from './portfolio-capital.mjs';
import { portfolioPlanEvaluation } from './portfolio-evaluation.mjs';
import { portfolioPlanScore } from './portfolio-score.mjs';
import { rankPlanScores } from './portfolio-ranking.mjs';
import { activeSnapshot } from './portfolio-snapshot.mjs';

export const PORTFOLIO_PLANS_REASONS = Object.freeze({
  inactiveSession: 'طرح‌ها فقط برای جلسهٔ فعال ساخته می‌شوند',
  missingEvidence: 'مدرک اجراپذیری هم‌لحظه برای ساخت طرح لازم است',
  noCandidates: 'با مأموریت قفل‌شده و مدرک این لحظه، هیچ ترکیبی ساخته نشد',
  noPlans: 'هیچ ترکیبی طرح ورود و مبنای سرمایهٔ کامل نداشت',
  rankFailed: 'چیدن امتیازها ممکن نشد',
});

const text = (value) => String(value ?? '').trim();

function fail(reason, now = null) {
  return {
    ok: false,
    why: PORTFOLIO_PLANS_REASONS[reason],
    reason,
    now,
    ranking: null,
    sources: new Map(),
  };
}

/**
 * همهٔ طرح‌های قابل ساخت این جلسه، چیده‌شده.
 *
 * `sources` برای هر شناسهٔ نامزد، طرح ورود و مبنای سرمایه و ارزیابی و
 * امتیازش را نگه می‌دارد — همان چیزهایی که برای نمایش یا ثبت لازم‌اند و
 * نباید دوباره ساخته شوند.
 */
export function portfolioRankedPlans(session, evidence, { limit = 3 } = {}) {
  if (!session || session.state !== 'active') return fail('inactiveSession');
  const now = activeSnapshot(session)?.at ?? null;
  if (!evidence?.ok || !Array.isArray(evidence.rows)) return fail('missingEvidence', now);

  const set = portfolioCandidates(session, [], evidence);
  if (!set.ok || !Array.isArray(set.candidates) || set.candidates.length === 0) {
    return fail('noCandidates', now);
  }

  const sources = new Map();
  const scores = [];
  for (const candidate of set.candidates) {
    const entry = portfolioEntryPlan(session, set, evidence, candidate.id);
    if (!entry.ok) continue;
    const capital = portfolioCapitalRequirement(session, set, evidence, entry);
    if (!capital.ok) continue;
    // ارزیابیِ ردشده هم امتیاز می‌رود تا در بخش کنارگذاشته‌ها با علتش دیده
    // شود. حذفش یعنی کاربر نفهمد چیزی بوده و رد شده.
    const evaluation = portfolioPlanEvaluation(session, set, evidence, entry, capital);
    const score = portfolioPlanScore(session, set, evidence, entry, capital, evaluation);
    sources.set(text(score.candidateId), {
      candidate, defId: candidate.defId, entry, capital, evaluation, score,
    });
    scores.push(score);
  }
  if (scores.length === 0) return fail('noPlans', now);

  const ranking = rankPlanScores(scores, { limit });
  if (!ranking.ok) return fail('rankFailed', now);

  return { ok: true, why: '', reason: null, now: ranking.now, set, ranking, sources };
}
