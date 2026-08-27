// ظرفیت مشترک و قیمت اجرایی ورود ترکیب سبد.
//
// این مرز فقط ترکیبی را قیمت می‌زند که `portfolioCandidates` برای همان
// جلسه و همان snapshot ساخته باشد. قیمت هر پا دوباره برای حجم مشترک از
// دفتر قفل‌شده پیموده می‌شود؛ آخرین، پایانی، میانه و مدل هیچ fallbackی
// نیستند. سقف بودجه فقط گزارش می‌شود و حجم اجرایی را پنهانی تغییر نمی‌دهد.

import { bookCapacity, walkBook } from './exec.mjs';
import { grossCash } from './payoff.mjs';
import { validateMissionLiquidity } from './portfolio-mission.mjs';
import { PORTFOLIO_CANDIDATES_VERSION } from './portfolio-candidates.mjs';
import { candidateId as stableCandidateId } from './bereket-candidates.mjs';
import { num } from './num.mjs';
import { byId } from '../strategies/catalog.mjs';
import { activeSnapshot, snapshotWithinSession } from './portfolio-snapshot.mjs';

export const PORTFOLIO_ENTRY_VERSION = 1;

export const PORTFOLIO_ENTRY_REASONS = Object.freeze({
  inactiveSession: 'طرح ورود فقط برای جلسهٔ فعال ساخته می‌شود',
  missingSnapshot: 'عکس قفل‌شدهٔ معتبر جلسه موجود نیست',
  invalidCandidateSet: 'خروجی معتبر ترکیب‌های همین جلسه لازم است',
  candidateNotFound: 'ترکیب در خروجی معتبر این جلسه پیدا نشد',
  mismatchedEvidence: 'حکم اجراپذیری متعلق به عکس قفل‌شدهٔ این لحظه نیست',
  invalidLiquidity: 'قید مصرف عمق مأموریت معتبر نیست',
  contractMismatch: 'هویت یا مشخصات پای ترکیب با snapshot یکسان نیست',
  rejectedLeg: 'حکم پذیرفتهٔ همان قرارداد و سمت موجود نیست',
  missingBook: 'دفتر سفارش لازم برای قیمت‌گذاری موجود نیست',
  missingCapacity: 'ظرفیت واقعی یکی از پاها در snapshot فاقد داده است',
  incompleteExecution: 'حجم مشترک از دفتر یکی از پاها کامل پر نشد',
  unknownCash: 'جمع نقد ورود به‌دلیل عدد گمشده نامعلوم است',
  invalidBudget: 'بودجهٔ قفل‌شدهٔ خانواده معتبر نیست',
});

const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const text = (value) => String(value ?? '').trim();
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function sameMoment(left, right) {
  return Number.isInteger(left?.date) && left.date > 0
    && Number.isInteger(left?.second) && left.second >= 0
    && left.date === right?.date && left.second === right?.second;
}

function fail(code, session = null, candidateId = '') {
  return {
    version: PORTFOLIO_ENTRY_VERSION,
    ok: false,
    why: PORTFOLIO_ENTRY_REASONS[code],
    reason: { code, label: PORTFOLIO_ENTRY_REASONS[code] },
    sessionId: text(session?.id) || null,
    candidateId: text(candidateId),
    now: activeSnapshot(session)?.at ? { ...activeSnapshot(session).at } : null,
    executableQty: null,
    legs: [],
    unitEntryCashRial: null,
    entryCashRial: null,
    budget: null,
  };
}

function rawContracts(snapshot) {
  if (Array.isArray(snapshot?.contracts)) return snapshot.contracts;
  if (Array.isArray(snapshot?.universe?.contracts)) return snapshot.universe.contracts;
  if (Array.isArray(snapshot?.universe?.rows)) return snapshot.universe.rows;
  return [];
}

function directContract(row) {
  const ins = text(own(row, 'ins') ? row.ins : row?.id);
  const kind = text(row?.kind);
  const strike = Number(row?.strike);
  const expiry = Math.trunc(Number(row?.expiry));
  const size = Number(row?.size);
  if (!ins || (kind !== 'call' && kind !== 'put')
    || !(Number.isFinite(strike) && strike > 0)
    || !(Number.isInteger(expiry) && expiry > 0)
    || !(Number.isFinite(size) && size > 0)) return null;
  const quote = row?.quote && typeof row.quote === 'object' ? row.quote : row;
  return { ins, kind, strike, expiry, size, name: text(row?.name), quote };
}

function contractIndex(snapshot) {
  const out = new Map();
  for (const row of rawContracts(snapshot)) {
    const contract = directContract(row);
    if (!contract) continue;
    const list = out.get(contract.ins) || [];
    list.push(contract);
    out.set(contract.ins, list);
  }
  return out;
}

function verdictIndex(evidence) {
  const out = new Map();
  for (const row of Array.isArray(evidence?.rows) ? evidence.rows : []) {
    const id = text(row?.candidateId);
    if (id) out.set(id, row);
  }
  return out;
}

function quoteBook(quote) {
  return quote && Array.isArray(quote.book) ? quote.book : null;
}

function perCombo(leg) {
  const ratio = num(leg?.ratio, NaN);
  if (!(ratio > 0)) return NaN;
  return leg?.kind === 'underlying' ? ratio * num(leg?.size, NaN) : ratio;
}

function sameContract(leg, contract) {
  return leg?.kind === contract.kind
    && text(leg?.ins) === contract.ins
    && num(leg?.strike, NaN) === contract.strike
    && Math.trunc(num(leg?.expiry, NaN)) === contract.expiry
    && num(leg?.size, NaN) === contract.size;
}

function underlyingContract(session, leg) {
  const raw = activeSnapshot(session)?.underlying;
  if (!raw || typeof raw !== 'object') return null;
  const quote = raw.quote && typeof raw.quote === 'object' ? raw.quote : raw;
  return {
    ins: text(raw.ins ?? session.baseIns), kind: 'underlying', strike: null,
    expiry: null, size: num(leg?.size, NaN), name: text(raw.name), quote,
  };
}

function acceptedVerdict(verdicts, leg) {
  if (leg?.kind === 'underlying') return { candidateId: null, accepted: true, quality: null };
  const verdict = verdicts.get(text(leg?.eligibilityRef));
  const suffix = `:${text(verdict?.side)}`;
  const verdictIns = text(verdict?.ins)
    || (suffix && text(verdict?.candidateId).endsWith(suffix)
      ? text(verdict?.candidateId).slice(0, -suffix.length)
      : text(verdict?.candidateId));
  if (!verdict || verdict.accepted !== true || verdict.verdict !== 'accepted'
    || text(verdict.side) !== text(leg.side) || verdictIns !== text(leg.ins)
    || !verdict.quality?.book) return null;
  return verdict;
}

function validCandidateShape(session, candidate) {
  const def = byId(text(candidate?.defId));
  const legs = Array.isArray(candidate?.legs) ? candidate.legs : [];
  const allocation = (session?.lockedAllocations || [])
    .find((row) => text(row?.familyId) === text(candidate?.family));
  if (!def || def.group !== text(candidate?.family) || def.legs.length !== legs.length
    || !allocation || !(num(allocation.targetRial, NaN) > 0)
    || text(candidate?.allocation?.familyId) !== text(allocation.familyId)
    || num(candidate?.allocation?.targetRial, NaN) !== num(allocation.targetRial, NaN)
    || num(candidate?.allocation?.pct, NaN) !== num(allocation.pct, NaN)
    || stableCandidateId(def.id, legs) !== text(candidate?.id)) return null;
  for (let index = 0; index < def.legs.length; index += 1) {
    const template = def.legs[index];
    const leg = legs[index];
    if (template.kind !== leg?.kind || template.side !== leg?.side
      || num(template.ratio, NaN) !== num(leg?.ratio, NaN)) return null;
  }
  return { def, allocation };
}

function sameNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(right)
    && Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

/**
 * طرح ورود برای یک شناسه ترکیب موجود در خروجی `portfolioCandidates`.
 * حجم خروجی همیشه ظرفیت کامل ساختار است؛ بودجه فقط سقف جداگانه می‌دهد.
 */
export function portfolioEntryPlan(session, candidateSet, evidence, candidateId) {
  if (!session || session.state !== 'active') return fail('inactiveSession', session, candidateId);
  const snapshot = activeSnapshot(session);
  if (!snapshot || !snapshotWithinSession(session, snapshot)) {
    return fail('missingSnapshot', session, candidateId);
  }
  if (!candidateSet?.ok || candidateSet.version !== PORTFOLIO_CANDIDATES_VERSION
    || text(candidateSet.sessionId) !== text(session.id)
    || !sameMoment(candidateSet.now, snapshot.at)) {
    return fail('invalidCandidateSet', session, candidateId);
  }
  const candidate = (candidateSet.candidates || []).find((row) => text(row?.id) === text(candidateId));
  if (!candidate) return fail('candidateNotFound', session, candidateId);
  const candidateShape = validCandidateShape(session, candidate);
  if (!candidateShape) return fail('invalidCandidateSet', session, candidateId);
  if (!evidence?.ok || !sameMoment(evidence.now, snapshot.at)) {
    return fail('mismatchedEvidence', session, candidateId);
  }

  const liquidity = validateMissionLiquidity(session.lockedMission?.liquidity);
  if (!liquidity.ok) return fail('invalidLiquidity', session, candidateId);
  const takePct = liquidity.liquidity.maxBookTakePct / 100;
  const contracts = contractIndex(snapshot);
  const verdicts = verdictIndex(evidence);
  const prepared = [];

  for (const leg of Array.isArray(candidate.legs) ? candidate.legs : []) {
    const per = perCombo(leg);
    if (!(per > 0) || (leg.side !== 'buy' && leg.side !== 'sell')) {
      return fail('contractMismatch', session, candidateId);
    }
    let contract;
    if (leg.kind === 'underlying') {
      contract = underlyingContract(session, leg);
      if (!contract) return fail('missingBook', session, candidateId);
    } else {
      const matches = contracts.get(text(leg.ins)) || [];
      if (matches.length !== 1 || !sameContract(leg, matches[0])) {
        return fail('contractMismatch', session, candidateId);
      }
      contract = matches[0];
    }

    const verdict = acceptedVerdict(verdicts, leg);
    if (!verdict) return fail('rejectedLeg', session, candidateId);
    const book = quoteBook(contract.quote);
    if (!book?.length) return fail('missingBook', session, candidateId);
    const capacityUnits = bookCapacity(book, leg.side, 0, Infinity, takePct);
    if (!(Number.isFinite(capacityUnits) && capacityUnits > 0)) {
      return fail('missingCapacity', session, candidateId);
    }
    if (leg.kind !== 'underlying') {
      const judgedCapacity = num(verdict.executableQty, NaN);
      if (!Number.isFinite(judgedCapacity)
        || Math.floor(capacityUnits) !== Math.floor(judgedCapacity)) {
        return fail('mismatchedEvidence', session, candidateId);
      }
      const judgedWalk = walkBook(book, judgedCapacity, leg.side, 0, takePct);
      if (!judgedWalk.full
        || !sameNumber(num(verdict.execution?.vwap, NaN), judgedWalk.vwap)
        || !sameNumber(num(verdict.execution?.top, NaN), judgedWalk.top)
        || !sameNumber(num(verdict.execution?.filled, NaN), judgedWalk.filled)
        || num(verdict.execution?.levels, NaN) !== judgedWalk.levels) {
        return fail('mismatchedEvidence', session, candidateId);
      }
    }
    prepared.push({ leg, contract, verdict, book, per, capacityUnits, maxQty: Math.floor(capacityUnits / per) });
  }

  if (!prepared.length || prepared.some((row) => !(row.maxQty > 0))) {
    return fail('missingCapacity', session, candidateId);
  }
  const executableQty = Math.min(...prepared.map((row) => row.maxQty));
  const priced = [];
  const legs = [];
  for (const row of prepared) {
    const need = executableQty * row.per;
    const walked = walkBook(row.book, need, row.leg.side, 0, takePct);
    if (!walked.full || walked.filled !== need || !(walked.vwap > 0)) {
      return fail('incompleteExecution', session, candidateId);
    }
    const quality = copy(row.verdict?.quality?.book ?? row.contract.quote?.quality ?? null);
    const pricedLeg = {
      ...row.leg,
      ins: row.leg.kind === 'underlying' ? row.contract.ins : row.leg.ins,
      price: walked.vwap,
    };
    priced.push(pricedLeg);
    legs.push({
      ins: pricedLeg.ins,
      kind: row.leg.kind,
      side: row.leg.side,
      ratio: row.leg.ratio,
      size: row.leg.size,
      strike: row.leg.kind === 'underlying' ? null : row.contract.strike,
      expiry: row.leg.kind === 'underlying' ? null : row.contract.expiry,
      eligibilityRef: row.leg.eligibilityRef ?? null,
      need,
      capacityUnits: row.capacityUnits,
      maxComboQty: row.maxQty,
      quality,
      execution: {
        filled: walked.filled,
        vwap: walked.vwap,
        top: walked.top,
        levels: walked.levels,
        slipPct: walked.slipPct,
        maxBookTakePct: liquidity.liquidity.maxBookTakePct,
      },
    });
  }

  if (priced.some((leg) => !(Number.isFinite(leg.price) && leg.price > 0))) {
    return fail('unknownCash', session, candidateId);
  }
  const unitEntryCashRial = grossCash(priced);
  const entryCashRial = unitEntryCashRial * executableQty;
  if (!Number.isFinite(unitEntryCashRial) || !Number.isFinite(entryCashRial)) {
    return fail('unknownCash', session, candidateId);
  }

  const targetRial = num(candidateShape.allocation.targetRial, NaN);
  if (!(Number.isFinite(targetRial) && targetRial > 0)) {
    return fail('invalidBudget', session, candidateId);
  }
  const unitDebitRial = Math.max(0, -unitEntryCashRial);
  const requiredRial = Math.max(0, -entryCashRial);
  const maxQty = unitDebitRial > 0
    ? Math.max(0, Math.floor(targetRial / unitDebitRial))
    : executableQty;
  const exceeded = requiredRial > targetRial;

  return {
    version: PORTFOLIO_ENTRY_VERSION,
    ok: true,
    why: '',
    reason: null,
    sessionId: text(session.id),
    candidateId: text(candidate.id),
    defId: text(candidate.defId),
    family: text(candidate.family),
    now: { ...snapshot.at },
    executableQty,
    legs,
    unitEntryCashRial,
    entryCashRial,
    budget: {
      targetRial,
      requiredRial,
      exceeded,
      maxQty,
      binding: exceeded ? {
        code: 'familyBudgetExceeded',
        label: 'ورود ظرفیت کامل از بودجهٔ قفل‌شدهٔ خانواده بیشتر است',
      } : null,
      note: 'حجم اجرایی با بودجه کوچک نشده است؛ سقف بودجه جداگانه گزارش می‌شود.',
    },
  };
}
