// رتبه نهایی گزینه‌های واقعاً اجراپذیر در شروع، با دفتر پایان.
// تصمیم شروع فقط از snapshot شروع می‌آید؛ داده پایان صرفاً نتیجه را می‌سنجد.

import { entryFees, grossCash } from './payoff.mjs';
import { walkBook } from './exec.mjs';
import { portfolioRankedPlans } from './portfolio-plans.mjs';
import { portfolioEntryPlan } from './portfolio-entry.mjs';
import { portfolioCapitalRequirement } from './portfolio-capital.mjs';
import { activeSnapshot } from './portfolio-snapshot.mjs';
import { momentKey } from './trading-calendar.mjs';

export const PORTFOLIO_FINAL_RANKING_VERSION = 1;

const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value);
const OPPOSITE = Object.freeze({ buy: 'sell', sell: 'buy' });

function fail(reason, why) {
  return {
    version: PORTFOLIO_FINAL_RANKING_VERSION, ok: false, reason, why,
    ranked: [], withoutRank: [], selected: [], best: null, worst: null,
  };
}

function startSession(session) {
  return {
    ...session,
    state: 'active',
    now: { ...session.start },
    momentSnapshot: undefined,
    events: [],
    counters: { event: 0, transaction: 0, position: 0, execution: 0, lot: 0 },
  };
}

function closingResult(entry, capital, snapshot, fees, takePct) {
  const contracts = new Map((snapshot.contracts || []).map((row) => [text(row.ins), row]));
  const exitLegs = [];
  for (const leg of entry.legs || []) {
    const contract = contracts.get(text(leg.ins));
    const side = OPPOSITE[leg.side];
    const per = leg.kind === 'underlying'
      ? num(leg.ratio) * num(leg.size) : num(leg.ratio);
    const book = contract?.quote?.book;
    if (!side || !(per > 0) || !Array.isArray(book) || !book.length) {
      return { ok: false, why: `دفتر پایان ${text(leg.ins) || 'یک پا'} موجود نیست` };
    }
    const walked = walkBook(book, per, side, 0, takePct);
    if (!walked.full || walked.filled !== per || !Number.isFinite(walked.vwap)) {
      return { ok: false, why: `عمق پایان ${text(leg.ins)} برای یک واحد کافی نیست` };
    }
    exitLegs.push({
      kind: leg.kind, side, ratio: leg.ratio, size: leg.size,
      strike: leg.strike, price: walked.vwap,
    });
  }
  const exitCashRial = grossCash(exitLegs);
  const exitFeeRial = entryFees(exitLegs, fees);
  const entryFeeRial = num(capital.components?.feeRial);
  const entryCashRial = num(entry.entryCashRial);
  const capitalRial = num(capital.components?.totalRial);
  if (![exitCashRial, exitFeeRial, entryFeeRial, entryCashRial, capitalRial]
    .every(Number.isFinite) || !(capitalRial > 0)) {
    return { ok: false, why: 'مبنای مالی کامل نیست' };
  }
  const realizedRial = exitCashRial + entryCashRial - exitFeeRial - entryFeeRial;
  return {
    ok: true, exitCashRial, exitFeeRial, entryCashRial, entryFeeRial,
    capitalRial, realizedRial, returnPct: realizedRial / capitalRial * 100,
  };
}

/** رتبهٔ بازده یک واحد از همه طرح‌های رتبه‌دارِ شروع در دفتر پایان. */
export function portfolioFinalRanking(session, startEvidence) {
  if (!session?.start || !session?.now) return fail('noSession', 'جلسه کامل در دسترس نیست');
  if (!startEvidence?.ok
    || momentKey(startEvidence.now) !== momentKey(session.start)) {
    return fail('staleStartEvidence', 'مدرک اجراپذیری شروع هم‌لحظه نیست');
  }
  const snapshot = activeSnapshot(session);
  if (!snapshot || momentKey(snapshot.at) !== momentKey(session.now)) {
    return fail('missingEndSnapshot', 'عکس پایان هم‌لحظه ساعت جلسه نیست');
  }
  const fees = session.startSnapshot?.capitalInputs?.fees;
  if (!Number.isFinite(num(fees?.option))) return fail('missingFees', 'نرخ کارمزد قفل‌شده موجود نیست');

  const start = startSession(session);
  const plans = portfolioRankedPlans(start, startEvidence);
  if (!plans.ok) return fail('noPlans', plans.why);
  const takePct = num(session.lockedMission?.liquidity?.maxBookTakePct) / 100;
  const ranked = [];
  const withoutRank = plans.ranking.withoutScore.map((row) => ({
    candidateId: text(row.candidateId), defId: text(row.defId), why: text(row.why),
  }));

  for (const plan of plans.ranking.ranked) {
    const candidateId = text(plan.candidateId);
    const entry = portfolioEntryPlan(start, plans.set, startEvidence, candidateId, { quantity: 1 });
    if (!entry.ok) {
      withoutRank.push({ candidateId, defId: text(plan.defId), why: entry.why });
      continue;
    }
    const capital = portfolioCapitalRequirement(start, plans.set, startEvidence, entry);
    if (!capital.ok) {
      withoutRank.push({ candidateId, defId: text(plan.defId), why: capital.why });
      continue;
    }
    const result = closingResult(entry, capital, snapshot, fees, takePct);
    if (!result.ok) {
      withoutRank.push({ candidateId, defId: text(plan.defId), why: result.why });
      continue;
    }
    ranked.push({ candidateId, defId: text(plan.defId), ...result });
  }
  ranked.sort((a, b) => (b.returnPct - a.returnPct)
    || (a.candidateId < b.candidateId ? -1 : 1));
  ranked.forEach((row, index) => {
    row.rank = index + 1;
    row.percentile = ranked.length === 1 ? 100
      : ((ranked.length - 1 - index) / (ranked.length - 1)) * 100;
  });
  const selectedIds = new Set((session.events || [])
    .filter((event) => event?.transactionKind === 'open' && event?.data?.candidateId)
    .map((event) => text(event.data.candidateId)));
  const selected = ranked.filter((row) => selectedIds.has(row.candidateId));
  for (const id of selectedIds) {
    if (!ranked.some((row) => row.candidateId === id)) {
      const missing = withoutRank.find((row) => row.candidateId === id);
      if (!missing) withoutRank.push({ candidateId: id, defId: '', why: 'گزینه انتخابی در پایان داده کافی ندارد' });
    }
  }
  return {
    version: PORTFOLIO_FINAL_RANKING_VERSION, ok: true, why: '', reason: null,
    start: { ...session.start }, end: { ...session.now },
    ranked, withoutRank, selected,
    best: ranked[0] || null, worst: ranked[ranked.length - 1] || null,
    counts: { ranked: ranked.length, withoutRank: withoutRank.length, selected: selected.length },
  };
}
