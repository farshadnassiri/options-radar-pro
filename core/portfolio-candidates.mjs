// ساخت ترکیب خام سبد فقط از قراردادهای عکس قفل‌شده و حکم‌های پذیرفته.
//
// این مرز قیمت، امتیاز یا پیشنهاد نمی‌سازد. هویت قرارداد از snapshot می‌آید
// و اجازهٔ استفاده از هر سمت فقط از مدرک اجراپذیری همان لحظه. تولید ساختار
// همچنان منحصراً بر عهدهٔ bereket-candidates است.

import { generateCandidates } from './bereket-candidates.mjs';
import { num } from './num.mjs';
import { CATALOG } from '../strategies/catalog.mjs';
import { activeSnapshot, snapshotWithinSession } from './portfolio-snapshot.mjs';

export const PORTFOLIO_CANDIDATES_VERSION = 1;

export const PORTFOLIO_CANDIDATE_REASONS = Object.freeze({
  inactiveSession: 'ترکیب فقط برای جلسهٔ فعال ساخته می‌شود',
  missingSnapshot: 'عکس قفل‌شدهٔ معتبر جلسه موجود نیست',
  mismatchedEvidence: 'حکم اجراپذیری متعلق به عکس قفل‌شدهٔ این لحظه نیست',
  missingSpot: 'قیمت نماد پایه در عکس قفل‌شده موجود نیست',
  unallocatedFamily: 'خانواده در تخصیص قفل‌شده بودجهٔ مثبت ندارد',
  missingContracts: 'قرارداد کامل و قابل ترکیب در عکس قفل‌شده موجود نیست',
  rejectedLegs: 'حکم پذیرفته برای همهٔ پاها و سمت‌های لازم موجود نیست',
  noStructuralCombo: 'قراردادهای پذیرفته ترکیب ساختاری کامل نمی‌سازند',
});

const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const text = (value) => String(value ?? '').trim();

function sameMoment(left, right) {
  return Number.isInteger(left?.date) && left.date > 0
    && Number.isInteger(left?.second) && left.second >= 0
    && left.date === right?.date && left.second === right?.second;
}

function reason(code) {
  return { code, label: PORTFOLIO_CANDIDATE_REASONS[code] };
}

function fail(code, now = null, sessionId = null) {
  return {
    version: PORTFOLIO_CANDIDATES_VERSION,
    ok: false,
    why: PORTFOLIO_CANDIDATE_REASONS[code],
    // بقیهٔ ماژول‌ها علت را با کد برمی‌گردانند؛ نبودش اینجا یعنی
    // مصرف‌کننده ناچار روی متن فارسی شرط بگذارد.
    reason: code,
    sessionId,
    now,
    candidates: [],
    truncated: false,
    audit: { definitions: [], incompleteContracts: [] },
  };
}

function rawContracts(snapshot) {
  if (Array.isArray(snapshot?.contracts)) return snapshot.contracts;
  if (Array.isArray(snapshot?.universe?.contracts)) return snapshot.universe.contracts;
  if (Array.isArray(snapshot?.universe?.rows)) return snapshot.universe.rows;
  return [];
}

/**
 * فقط پنج جزء هویت لازم را از عکس برمی‌دارد. هیچ قیمت، حجم دفتر یا getter
 * مالی به مولد منتقل نمی‌شود. فیلد ناقص با مقدار پیش‌فرض ترمیم نمی‌شود.
 */
function snapshotContracts(snapshot) {
  const contracts = [];
  const incomplete = [];
  rawContracts(snapshot).forEach((row, index) => {
    const ins = text(own(row, 'ins') ? row.ins : row?.id);
    const kind = text(row?.kind);
    const strike = Number(row?.strike);
    const expiry = Math.trunc(Number(row?.expiry));
    const size = Number(row?.size);
    const missing = [];
    if (!ins) missing.push('ins');
    if (kind !== 'call' && kind !== 'put') missing.push('kind');
    if (!(Number.isFinite(strike) && strike > 0)) missing.push('strike');
    if (!(Number.isInteger(expiry) && expiry > 0)) missing.push('expiry');
    if (!(Number.isFinite(size) && size > 0)) missing.push('size');
    if (missing.length) {
      incomplete.push({ index, ins, missing });
      return;
    }
    contracts.push({ ins, kind, strike, expiry, size, name: text(row?.name) });
  });
  return { contracts, incomplete };
}

function snapshotSpot(snapshot) {
  const values = [
    own(snapshot, 'spot') ? snapshot.spot : undefined,
    own(snapshot?.underlying, 'spot') ? snapshot.underlying.spot : undefined,
    own(snapshot, 'underlyingPrice') ? snapshot.underlyingPrice : undefined,
  ];
  for (const value of values) {
    const spot = num(value, NaN);
    if (spot > 0) return spot;
  }
  return NaN;
}

function verdictIns(row) {
  const explicit = text(row?.ins);
  if (explicit) return explicit;
  const id = text(row?.candidateId);
  const side = text(row?.side);
  const suffix = side ? `:${side}` : '';
  return suffix && id.endsWith(suffix) ? id.slice(0, -suffix.length) : id;
}

function verdictIndex(evidence) {
  const out = new Map();
  for (const row of Array.isArray(evidence?.rows) ? evidence.rows : []) {
    const side = text(row?.side);
    const ins = verdictIns(row);
    if (!ins || (side !== 'buy' && side !== 'sell')) continue;
    out.set(`${ins}:${side}`, {
      candidateId: text(row?.candidateId),
      ins,
      side,
      accepted: row?.accepted === true && row?.verdict === 'accepted',
    });
  }
  return out;
}

function allocationIndex(session) {
  const out = new Map();
  for (const row of Array.isArray(session?.lockedAllocations) ? session.lockedAllocations : []) {
    const family = text(row?.familyId);
    const targetRial = num(row?.targetRial, NaN);
    if (family && targetRial > 0) out.set(family, row);
  }
  return out;
}

/**
 * ساخت ترکیب‌های خام و قابل اجرا برای یک جلسه فعال.
 *
 * قراردادها و spot از عکسِ **لحظهٔ جاری** خوانده می‌شوند — که تا پیش از
 * نخستین گام زمانی، همان عکسِ شروع است. `evidence` همان خروجی حکم‌های
 * جلسه است و باید `now` هم‌لحظه با snapshot داشته باشد؛ این قید عوض
 * نشده، فقط لحظه‌اش دیگر لزوماً لحظهٔ شروع نیست.
 */
export function portfolioCandidates(session, defs = [], evidence = {}, options = {}) {
  if (!session || session.state !== 'active') return fail('inactiveSession');
  const snapshot = activeSnapshot(session);
  if (!snapshot || !snapshotWithinSession(session, snapshot)) {
    return fail('missingSnapshot', null, text(session.id) || null);
  }
  if (!evidence?.ok || !sameMoment(evidence.now, snapshot.at)) {
    return fail('mismatchedEvidence', snapshot.at, text(session.id) || null);
  }

  const spot = snapshotSpot(snapshot);
  if (!(spot > 0)) return fail('missingSpot', snapshot.at, text(session.id) || null);

  const allocations = allocationIndex(session);
  const normalized = snapshotContracts(snapshot);
  const verdicts = verdictIndex(evidence);
  const catalog = new Map(CATALOG.map((def) => [def.id, def]));
  const requested = Array.isArray(defs) && defs.length ? defs : CATALOG;
  const definitions = [...new Set(requested.map((def) => text(def?.id ?? def)))]
    .map((id) => catalog.get(id)).filter(Boolean);
  const allowedDefs = definitions.filter((def) => allocations.has(text(def?.group)));
  const allowed = (contract, template) => verdicts.get(`${contract.ins}:${template.side}`)?.accepted === true;

  const generated = generateCandidates(allowedDefs, normalized.contracts, spot, {
    ...options,
    contractAllowed: allowed,
  });

  const byDefinition = new Map();
  const candidates = generated.candidates.map((candidate) => {
    const def = allowedDefs.find((row) => row.id === candidate.defId);
    const family = text(def?.group);
    byDefinition.set(candidate.defId, (byDefinition.get(candidate.defId) || 0) + 1);
    return {
      ...candidate,
      family,
      allocation: { ...allocations.get(family) },
      legs: candidate.legs.map((leg) => {
        if (leg.kind === 'underlying') return { ...leg, eligibilityRef: null };
        const verdict = verdicts.get(`${leg.ins}:${leg.side}`);
        return { ...leg, eligibilityRef: verdict?.candidateId || `${leg.ins}:${leg.side}` };
      }),
    };
  });

  const auditDefinitions = definitions.map((def) => {
    const family = text(def?.group);
    const allocation = allocations.get(family);
    const generatedCount = byDefinition.get(def.id) || 0;
    let emptyReason = null;
    if (!allocation) emptyReason = reason('unallocatedFamily');
    else if (!normalized.contracts.length) emptyReason = reason('missingContracts');
    else if (!generatedCount) {
      const needsOption = (def.legs || []).filter((leg) => leg.kind !== 'underlying');
      const hasRejectedSide = needsOption.some((leg) => normalized.contracts
        .some((contract) => contract.kind === leg.kind && !allowed(contract, leg)));
      emptyReason = reason(hasRejectedSide ? 'rejectedLegs' : 'noStructuralCombo');
    }
    return {
      defId: text(def?.id),
      family,
      allocationRial: allocation ? num(allocation.targetRial, NaN) : null,
      generated: generatedCount,
      emptyReason,
    };
  });

  return {
    version: PORTFOLIO_CANDIDATES_VERSION,
    ok: true,
    why: '',
    sessionId: text(session.id),
    now: { ...snapshot.at },
    candidates,
    truncated: generated.truncated,
    audit: {
      definitions: auditDefinitions,
      incompleteContracts: normalized.incomplete,
    },
  };
}
