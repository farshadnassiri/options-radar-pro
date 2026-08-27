// رتبه‌بندی و کوتاه‌فهرست طرح‌های سبد — برش هشتم فاز ۳.
//
// هر طرح امتیاز قابل حسابرسی دارد، ولی هیچ‌جا کنار هم چیده نمی‌شوند.
// اینجا فقط چیده و توضیح داده می‌شوند — هیچ عدد مالی تازه‌ای ساخته
// نمی‌شود.
//
// چهار قاعده:
//
// **همه از یک لحظه، یا هیچ‌کدام.** امتیازی از جلسه یا لحظهٔ دیگر کل
// فراخوانی را رد می‌کند، نه اینکه بی‌صدا از فهرست بیفتد. ردیفی که ناپدید
// شود، در گزارشِ «رد شد» هم دیده نمی‌شود.
//
// **ترتیب قطعی است.** امتیاز برابر با شکنندهٔ نام‌بُرده حل می‌شود، نه با
// ترتیب ورودی. مرتب‌سازی ناپایدار یعنی دو بار اجرا، دو جدول — و کاربر
// نمی‌فهمد کدام را دیده بود.
//
// **نامعلوم ته جدول نمی‌رود.** طرحِ بی‌امتیاز و طرحِ ردشده رتبه نمی‌گیرند
// و در بخش جدا با علتشان می‌مانند. ته جدول یعنی «بد»، و این دربارهٔ چیزی
// که نمی‌دانیم دروغ است.
//
// **رتبه بدون علت، همان امتیازِ بی‌اجزاست.** هر ردیف می‌گوید کدام جزء
// بالا بردش و کدام پایین کشیدش.

import { PORTFOLIO_SCORE_VERSION } from './portfolio-score.mjs';

export const PORTFOLIO_RANKING_VERSION = 1;

export const PORTFOLIO_RANKING_REASONS = Object.freeze({
  emptyInput: 'فهرست امتیازها معتبر نیست',
  mixedSession: 'همهٔ امتیازها باید از یک جلسه باشند',
  mixedMoment: 'همهٔ امتیازها باید از یک لحظه باشند',
  mixedMission: 'همهٔ امتیازها باید از یک مأموریت قفل‌شده باشند',
  badScore: 'ورودی باید خروجی معتبر امتیازدهی باشد',
  duplicateCandidate: 'یک نامزد دوبار در فهرست آمده است',
  invalidLimit: 'سقف کوتاه‌فهرست باید عدد صحیح مثبت باشد',
});

const text = (value) => String(value ?? '').trim();

function fail(reason) {
  return {
    version: PORTFOLIO_RANKING_VERSION,
    ok: false,
    why: PORTFOLIO_RANKING_REASONS[reason],
    reason,
    ranked: [],
    withoutScore: [],
    shortlist: [],
    counts: null,
  };
}

/** آیا شیء، خروجی امتیازدهی است — نه چیزی که شبیهش ساخته شده. */
function shaped(row) {
  return !!row && typeof row === 'object'
    && row.version === PORTFOLIO_SCORE_VERSION
    && Number.isInteger(row.now?.date) && Number.isInteger(row.now?.second)
    && text(row.sessionId) !== '' && text(row.candidateId) !== '';
}

/**
 * کدام جزء بیشترین سهم را داشت و کدام بیشترین کاهش را.
 *
 * سهمِ صفر نه بالابرنده است نه پایین‌کشنده، پس هیچ‌کدام نمی‌شود. جزءِ
 * نامعلوم هم اینجا نمی‌آید — دربارهٔ چیزی که نمی‌دانیم نمی‌شود گفت طرح را
 * بالا برده یا پایین کشیده.
 */
function drivers(components) {
  let lifted = null;
  let dragged = null;
  for (const key of Object.keys(components)) {
    const share = components[key]?.contribution;
    if (!Number.isFinite(share) || share === 0) continue;
    if (share > 0 && (lifted === null || share > lifted.contribution)) {
      lifted = { code: key, label: components[key].label, contribution: share };
    }
    if (share < 0 && (dragged === null || share < dragged.contribution)) {
      dragged = { code: key, label: components[key].label, contribution: share };
    }
  }
  return { lifted, dragged };
}

/**
 * چیدن امتیازهای یک مأموریت.
 *
 * `limit` سقف کوتاه‌فهرست است. اگر واجدها کمتر از سقف باشند، کمتر
 * برمی‌گردد — با چیزی پر نمی‌شود.
 */
export function rankPlanScores(scores, { limit = 3 } = {}) {
  if (!Array.isArray(scores) || scores.length === 0) return fail('emptyInput');
  if (!Number.isInteger(limit) || limit <= 0) return fail('invalidLimit');
  if (!scores.every(shaped)) return fail('badScore');

  const first = scores[0];
  const sessionId = text(first.sessionId);
  const now = { date: first.now.date, second: first.now.second };
  const seen = new Set();
  for (const row of scores) {
    if (text(row.sessionId) !== sessionId) return fail('mixedSession');
    if (row.now.date !== now.date || row.now.second !== now.second) return fail('mixedMoment');
    const candidateId = text(row.candidateId);
    if (seen.has(candidateId)) return fail('duplicateCandidate');
    seen.add(candidateId);
  }

  // هدف سود قفل‌شده تنها اثر مأموریت است که تا اینجا حمل شده؛ اختلافش
  // یعنی دو مأموریت، و دو مأموریت را نمی‌شود در یک جدول چید.
  const targets = new Set(scores.filter((row) => row.ok === true)
    .map((row) => row.basis?.targetProfitRial));
  if (targets.size > 1) return fail('mixedMission');

  const scored = [];
  const withoutScore = [];
  for (const row of scores) {
    const candidateId = text(row.candidateId);
    if (row.ok === true && Number.isFinite(row.score)) {
      scored.push({ candidateId, row });
      continue;
    }
    withoutScore.push({
      candidateId,
      // «چرا رتبه ندارد» دو حالت جداست و یکی کردنشان اطلاعات را از بین
      // می‌برد: ردشده یعنی در دسترس نیست، بی‌امتیاز یعنی نمی‌دانیم.
      kind: row.ineligible === true ? 'ineligible' : 'unknownScore',
      reason: row.reason ?? null,
      why: text(row.why),
      unknownComponents: Array.isArray(row.unknownComponents) ? row.unknownComponents.slice() : [],
      quality: row.quality ?? null,
    });
  }

  // شکنندهٔ برابری: شناسهٔ نامزد، صعودی. نه ترتیب ورودی، نه ترتیب کلیدها —
  // هر دو از بیرون می‌آیند و پایدار نیستند.
  scored.sort((a, b) => (b.row.score - a.row.score)
    || (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0));
  withoutScore.sort((a, b) => (a.candidateId < b.candidateId ? -1
    : a.candidateId > b.candidateId ? 1 : 0));

  const ranked = scored.map((entry, index) => {
    const { lifted, dragged } = drivers(entry.row.components);
    return {
      rank: index + 1,
      candidateId: entry.candidateId,
      score: entry.row.score,
      lifted,
      dragged,
      components: entry.row.components,
      basis: entry.row.basis,
      quality: entry.row.quality ?? null,
    };
  });

  return {
    version: PORTFOLIO_RANKING_VERSION,
    ok: true,
    why: '',
    reason: null,
    sessionId,
    now,
    ranked,
    withoutScore,
    // کمتر از سقف یعنی کمتر از سقف. جای خالی با چیزی پر نمی‌شود.
    shortlist: ranked.slice(0, limit),
    limit,
    counts: {
      total: scores.length,
      ranked: ranked.length,
      ineligible: withoutScore.filter((row) => row.kind === 'ineligible').length,
      unknownScore: withoutScore.filter((row) => row.kind === 'unknownScore').length,
      shortlist: Math.min(limit, ranked.length),
    },
  };
}
