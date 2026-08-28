// مدل نمایش پیشنهادهای سبد — برش نهم فاز ۳.
//
// زنجیرهٔ موتور کامل است: حکم اجراپذیری، ترکیب، قیمت ورود، سرمایهٔ لازم،
// ارزیابی بازده، امتیاز، رتبه‌بندی. هیچ‌کدام هنوز به چشم کاربر نمی‌رسند.
// این ماژول همان خروجی را به چیزی تبدیل می‌کند که بشود نشان داد — و
// **فقط** همان.
//
// سه مرز:
//
// **هیچ عدد مالی تازه‌ای اینجا ساخته نمی‌شود.** هر عددی که نمایش داده
// می‌شود باید در ورودی عیناً موجود باشد. تنها کاری که با عدد می‌شود
// قالب‌بندی است و تبدیل ریال به تومان برای نمایش. اگر لایهٔ نمایش عدد
// بسازد، هیچ آزمونی جلویش را نمی‌گیرد و کاربر تفاوتش را نمی‌بیند.
//
// **امتیاز بدون علت نمایش داده نمی‌شود.** هر ردیف می‌گوید کدام جزء
// بالا بردش و کدام پایین کشیدش. عددِ تنها اعتماد می‌سازد بدون اینکه
// لیاقتش را داشته باشد.
//
// **«نامعلوم» شبیه «بد» نمی‌شود.** طرح ردشده و طرح بی‌امتیاز در دو بخش
// جدا با علت خودشان می‌مانند، نه ته همان جدول.
//
// اینجا DOM نیست و رشته‌های HTML ساخته نمی‌شوند؛ تب خودش رسم می‌کند.

import { fmt, faDigits } from './fmt.mjs';
import { PORTFOLIO_PLANS_REASONS, portfolioRankedPlans } from '../core/portfolio-plans.mjs';
import { GROUPS as STRATEGY_FAMILIES, byId } from '../strategies/catalog.mjs';

// علت‌ها از خودِ زنجیره می‌آیند؛ دو متن برای یک حالت یعنی روزی یکی‌شان
// عوض می‌شود و کاربر دو جواب متفاوت برای یک چیز می‌بیند.
export const PROPOSALS_REASONS = PORTFOLIO_PLANS_REASONS;

const text = (value) => String(value ?? '').trim();

/**
 * ریال به تومان، فقط برای نمایش.
 *
 * تقسیم بر ده تبدیل واحد است نه محاسبهٔ تازه؛ همان کاری که تب از قبل
 * برای سرمایه و بودجه می‌کند. عدد نامعتبر «—» می‌شود، نه صفر.
 */
const toman = (rial) => (Number.isFinite(rial) ? fmt.int(rial / 10) : '—');

/** برچسب خوانا برای یک جزء امتیاز، با سهمش. */
function driverText(driver) {
  if (!driver) return '—';
  return `${driver.label} (${fmt.num(driver.contribution)})`;
}

function planLabel(candidateId, defId) {
  const def = defId ? byId(defId) : null;
  return {
    defLabel: def?.fa || def?.name || faDigits(candidateId),
    familyLabel: STRATEGY_FAMILIES[text(def?.group)] || text(def?.group) || '—',
  };
}

/** کیفیت داده، با علتش. کیفیت برآوردی پنهان نمی‌شود. */
function qualityText(quality) {
  if (!quality) return { label: '—', reason: '' };
  return {
    label: faDigits(quality.label || quality.kind || '—'),
    reason: faDigits(text(quality.reason)),
  };
}

function fail(reason, now = null, why = '') {
  return {
    ok: false,
    why: why || PROPOSALS_REASONS[reason],
    reason,
    now,
    shortlist: [],
    setAside: [],
    counts: null,
    limit: 0,
  };
}

function rejectedEvidenceWhy(evidence) {
  const rows = Array.isArray(evidence?.rows) ? evidence.rows : [];
  if (!rows.length || rows.some((row) => row?.accepted === true)) return '';
  const reasons = new Map();
  for (const row of rows) {
    for (const reason of Array.isArray(row?.reasons) ? row.reasons : []) {
      const label = text(reason?.label);
      if (label) reasons.set(label, (reasons.get(label) || 0) + 1);
    }
  }
  const primary = [...reasons.entries()].sort((a, b) => (b[1] - a[1])
    || (a[0] < b[0] ? -1 : 1))[0]?.[0] || 'مدرک اجراپذیری کافی نیست';
  return `پیشنهادی ساخته نشد: ${faDigits(String(rows.length))} حکم متعلق به نماد پایه بررسی شد و همه رد شدند. علت غالب: ${faDigits(primary)}`;
}

/**
 * پیشنهادهای یک جلسهٔ فعال.
 *
 * `evidence` همان مدرک اجراپذیریِ هم‌لحظه است — تب از قبل دارد و اینجا
 * دوباره ساخته نمی‌شود.
 */
export function portfolioSessionProposals(session, evidence, { limit = 3 } = {}) {
  const now = session?.startSnapshot?.at ?? null;

  const plans = portfolioRankedPlans(session, evidence, { limit });
  if (!plans.ok) {
    const detail = plans.reason === 'noCandidates' ? rejectedEvidenceWhy(evidence) : '';
    return fail(plans.reason, now, detail);
  }
  const ranked = plans.ranking;

  const byCandidate = plans.sources;

  const shortlist = ranked.shortlist.map((row) => {
    const source = byCandidate.get(row.candidateId);
    const payoff = source?.evaluation?.payoff ?? null;
    const quality = qualityText(source?.evaluation?.quality);
    return {
      rank: row.rank,
      rankText: faDigits(String(row.rank)),
      candidateId: row.candidateId,
      ...planLabel(row.candidateId, source?.defId),
      score: row.score,
      scoreText: fmt.num(row.score),
      executableQty: source?.entry?.executableQty ?? null,
      executableQtyText: Number.isSafeInteger(source?.entry?.executableQty)
        ? fmt.int(source.entry.executableQty) : '—',
      liftedText: driverText(row.lifted),
      draggedText: driverText(row.dragged),
      capitalTomanText: toman(row.basis?.capitalRial),
      // سود و زیانِ نامحدود عدد نمی‌گیرد؛ همان چیزی که موتور گفت.
      maxProfitTomanText: payoff && payoff.unlimitedProfit ? 'نامحدود' : toman(payoff?.maxProfitRial),
      maxLossTomanText: payoff && payoff.unlimitedLoss ? 'نامحدود' : toman(payoff?.maxLossRial),
      judgedPointText: row.basis?.judgedPoint
        ? `${toman(row.basis.judgedPoint.pnlRial)} تومان` : '—',
      qualityLabel: quality.label,
      qualityReason: quality.reason,
    };
  });

  const setAside = ranked.withoutScore.map((row) => {
    const source = byCandidate.get(row.candidateId);
    const quality = qualityText(row.quality ?? source?.evaluation?.quality);
    return {
      candidateId: row.candidateId,
      ...planLabel(row.candidateId, source?.defId),
      // «در دسترس نیست» و «نمی‌دانیم» دو چیزند و یکی نمی‌شوند.
      kind: row.kind,
      kindLabel: row.kind === 'ineligible' ? 'کنار گذاشته شد' : 'امتیاز نامعلوم',
      why: faDigits(row.why || '—'),
      unknownText: row.unknownComponents.length
        ? faDigits(row.unknownComponents.join('، ')) : '',
      qualityLabel: quality.label,
      qualityReason: quality.reason,
    };
  });

  return {
    ok: true,
    why: '',
    reason: null,
    now: ranked.now,
    limit: ranked.limit,
    shortlist,
    setAside,
    counts: ranked.counts,
    countsText: `${faDigits(String(ranked.counts.total))} ترکیب · `
      + `${faDigits(String(ranked.counts.ranked))} رتبه‌دار · `
      + `${faDigits(String(ranked.counts.ineligible))} کنار گذاشته · `
      + `${faDigits(String(ranked.counts.unknownScore))} نامعلوم`,
  };
}
