// سرمایه لازم طرح ورود سبد، فقط از طرح اجرایی قابل بازسازی و ورودی‌های
// مالی صریح همان snapshot.
//
// این مرز حجم دفتر را تغییر نمی‌دهد. بدهکار، وجه تضمین و کارمزد را جدا
// نگه می‌دارد و سقف بودجه را فقط گزارش می‌کند. عدد گمشده با صفر یا تنظیم
// پیش‌فرض جایگزین نمی‌شود.

import { combineDataQuality, isDataQuality, makeDataQuality } from './data-quality.mjs';
import { strategyMargin } from './margin.mjs';
import { entryFees } from './payoff.mjs';
import { PORTFOLIO_ENTRY_VERSION, portfolioEntryPlan } from './portfolio-entry.mjs';
import { EPS } from './num.mjs';
import { activeSnapshot, snapshotWithinSession } from './portfolio-snapshot.mjs';

export const PORTFOLIO_CAPITAL_VERSION = 1;

export const PORTFOLIO_CAPITAL_REASONS = Object.freeze({
  inactiveSession: 'سرمایه ورود فقط برای جلسهٔ فعال محاسبه می‌شود',
  invalidEntry: 'طرح ورود معتبر و قابل بازسازی همین جلسه لازم است',
  missingEntryQuality: 'کیفیت اجرای یکی از پاهای طرح ورود فاقد داده است',
  missingFeeInputs: 'نرخ و کیفیت صریح کارمزد ورود در snapshot موجود نیست',
  missingMarginInputs: 'پارامتر و کیفیت صریح وجه تضمین در snapshot موجود نیست',
  missingMarginClose: 'قیمت پایانی معتبر پای فروش در snapshot موجود نیست',
  invalidCapital: 'مبنای سرمایه از داده‌های موجود قابل محاسبه نیست',
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

function blankComponents() {
  return {
    debitRial: null,
    creditRial: null,
    feeRial: null,
    marginRial: null,
    totalRial: null,
  };
}

function fail(code, session = null, entry = null, extra = {}) {
  return {
    version: PORTFOLIO_CAPITAL_VERSION,
    ok: false,
    why: PORTFOLIO_CAPITAL_REASONS[code],
    reason: { code, label: PORTFOLIO_CAPITAL_REASONS[code] },
    sessionId: text(session?.id) || null,
    candidateId: text(entry?.candidateId),
    now: activeSnapshot(session)?.at ? { ...activeSnapshot(session).at } : null,
    executableQty: null,
    components: blankComponents(),
    basis: null,
    quality: null,
    budget: null,
    ...extra,
  };
}

function sameJson(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function qualityList(values) {
  const rows = values.filter((value) => isDataQuality(value));
  return rows.length === values.length && rows.every((row) => row.kind !== 'missing')
    ? rows : null;
}

function entryQuality(entry) {
  const qualities = qualityList((entry?.legs || []).map((leg) => leg?.quality));
  if (!qualities?.length) return null;
  return combineDataQuality(qualities, {
    source: 'portfolio-entry-capacity', asOf: entry.now,
  });
}

function explicitFees(snapshot, legs) {
  const input = snapshot?.capitalInputs?.fees;
  if (!input || !isDataQuality(input.quality) || input.quality.kind === 'missing') return null;
  const needed = new Set();
  for (const leg of legs) {
    if (leg.kind === 'underlying') needed.add(leg.side === 'buy' ? 'buyStock' : 'sellStock');
    else needed.add('option');
  }
  const fees = {};
  for (const key of needed) {
    if (!own(input, key)) return null;
    const rate = Number(input[key]);
    if (!(Number.isFinite(rate) && rate >= 0)) return null;
    fees[key] = rate;
  }
  return { fees, quality: copy(input.quality) };
}

function rawContracts(snapshot) {
  if (Array.isArray(snapshot?.contracts)) return snapshot.contracts;
  if (Array.isArray(snapshot?.universe?.contracts)) return snapshot.universe.contracts;
  if (Array.isArray(snapshot?.universe?.rows)) return snapshot.universe.rows;
  return [];
}

function contractIndex(snapshot) {
  const out = new Map();
  for (const row of rawContracts(snapshot)) {
    const ins = text(own(row, 'ins') ? row.ins : row?.id);
    if (!ins) continue;
    const list = out.get(ins) || [];
    list.push(row);
    out.set(ins, list);
  }
  return out;
}

function pricedLegs(entry, qty = 1) {
  return entry.legs.map((leg) => ({
    kind: leg.kind,
    side: leg.side,
    ratio: Number(leg.ratio) * qty,
    size: Number(leg.size),
    strike: leg.kind === 'underlying' ? null : Number(leg.strike),
    // موتور پوشش فقط ترتیب و برابری سررسید را لازم دارد. تاریخ قفل‌شده
    // همان اطلاعات را بدون تبدیل تقویمی و بدون حدس حفظ می‌کند.
    days: leg.kind === 'underlying' ? NaN : Number(leg.expiry),
    price: Number(leg.execution?.vwap),
  }));
}

function validMarginParams(value) {
  if (!value || typeof value !== 'object') return false;
  return Number.isFinite(Number(value.A)) && Number(value.A) >= 0
    && Number.isFinite(Number(value.B)) && Number(value.B) >= 0
    && Number.isFinite(Number(value.C)) && Number(value.C) > 0
    && Number.isFinite(Number(value.maint)) && Number(value.maint) >= 0 && Number(value.maint) <= 1
    && value.bBasis === 'SPOT';
}

function explicitMargin(snapshot, entry) {
  const input = snapshot?.capitalInputs?.margin;
  if (!input || !isDataQuality(input.quality) || input.quality.kind === 'missing'
    || !(Number(input.spotCloseRial) > 0) || !validMarginParams(input.params)
    || !['FULL', 'LESS_WIDTH', 'WIDTH'].includes(input.creditMode)
    || !['MAX_PLUS_PREMIUM', 'SUM'].includes(input.nakedComboMargin)) return null;

  const contracts = contractIndex(snapshot);
  const closes = {};
  const qualities = [input.quality];
  for (let index = 0; index < entry.legs.length; index += 1) {
    const leg = entry.legs[index];
    if (leg.kind === 'underlying' || leg.side !== 'sell') continue;
    const matches = contracts.get(text(leg.ins)) || [];
    if (matches.length !== 1) return { closeMissing: true };
    const quote = matches[0]?.quote && typeof matches[0].quote === 'object'
      ? matches[0].quote : matches[0];
    const close = Number(quote?.close);
    if (!(close > 0) || !isDataQuality(quote?.quality) || quote.quality.kind === 'missing') {
      return { closeMissing: true };
    }
    closes[index] = close;
    qualities.push(quote.quality);
  }
  return {
    ctx: {
      S: Number(input.spotCloseRial),
      closes,
      params: {
        A: Number(input.params.A), B: Number(input.params.B), C: Number(input.params.C),
        maint: Number(input.params.maint), bBasis: 'SPOT',
      },
      creditMode: input.creditMode,
      nakedComboMargin: input.nakedComboMargin,
      // سرمایه این برش بر وجه تضمین ناخالص بنا می‌شود. بستانکار ورود یک
      // جزء جداست و اجازه ندارد مبلغ بلوکه‌شده را تا صفر محو کند.
      capitalMode: 'GROSS',
    },
    quality: combineDataQuality(qualities, {
      source: 'portfolio-margin-inputs', asOf: snapshot.at,
    }),
  };
}

function allocationOf(session, entry) {
  const rows = (session?.lockedAllocations || [])
    .filter((row) => text(row?.familyId) === text(entry?.family));
  if (rows.length !== 1) return null;
  const targetRial = Number(rows[0].targetRial);
  if (!(targetRial > 0) || entry?.budget?.targetRial !== targetRial) return null;
  return { row: rows[0], targetRial };
}

/**
 * مبنای سرمایه یک طرح ورود قابل بازسازی.
 *
 * `candidateSet` و `evidence` عمداً دوباره گرفته می‌شوند تا طرح ورودی با
 * همان موتور ورود و همان snapshot بازسازی شود؛ صرف شباهت شکل JSON کافی
 * نیست. `capitalInputs` داخل `session.startSnapshot` نیز باید نرخ کارمزد،
 * پارامتر وجه تضمین و کیفیت هرکدام را صریح نگه دارد.
 */
export function portfolioCapitalRequirement(session, candidateSet, evidence, entry) {
  if (!session || session.state !== 'active') return fail('inactiveSession', session, entry);
  const snapshot = activeSnapshot(session);
  if (!snapshot || !snapshotWithinSession(session, snapshot)
    || entry?.version !== PORTFOLIO_ENTRY_VERSION || entry?.ok !== true
    || text(entry.sessionId) !== text(session.id) || !sameMoment(entry.now, snapshot.at)) {
    return fail('invalidEntry', session, entry);
  }

  const canonical = portfolioEntryPlan(session, candidateSet, evidence, entry.candidateId, {
    quantity: entry.executableQty,
  });
  if (!canonical.ok || !sameJson(canonical, entry)) return fail('invalidEntry', session, entry);
  const allocation = allocationOf(session, entry);
  if (!allocation) return fail('invalidBudget', session, entry);

  const executionQuality = entryQuality(entry);
  if (!executionQuality) return fail('missingEntryQuality', session, entry);
  const feeInput = explicitFees(snapshot, entry.legs);
  if (!feeInput) {
    return fail('missingFeeInputs', session, entry, { quality: executionQuality });
  }

  const unitLegs = pricedLegs(entry, 1);
  const fullLegs = pricedLegs(entry, entry.executableQty);
  const unitFeeRial = entryFees(unitLegs, feeInput.fees);
  const feeRial = entryFees(fullLegs, feeInput.fees);
  if (!(Number.isFinite(unitFeeRial) && unitFeeRial >= 0
    && Number.isFinite(feeRial) && feeRial >= 0)) {
    return fail('invalidCapital', session, entry);
  }

  const hasShortOption = entry.legs.some((leg) => leg.kind !== 'underlying' && leg.side === 'sell');
  let unitMarginRial = 0;
  let marginRial = 0;
  let marginQuality = makeDataQuality({
    kind: 'observed', source: 'portfolio-no-short-option', asOf: snapshot.at,
    sufficient: true, reason: 'طرح پای فروش اختیار ندارد و وجه تضمین آن به‌طور ساختاری صفر است',
  });
  let marginAudit = null;
  if (hasShortOption) {
    const marginInput = explicitMargin(snapshot, entry);
    if (!marginInput) return fail('missingMarginInputs', session, entry);
    if (marginInput.closeMissing) return fail('missingMarginClose', session, entry);
    const unit = strategyMargin(unitLegs, marginInput.ctx);
    const full = strategyMargin(fullLegs, marginInput.ctx);
    unitMarginRial = Number(unit.margin);
    marginRial = Number(full.margin);
    marginQuality = marginInput.quality;
    marginAudit = copy(full);
  }

  const debitRial = Math.max(0, -Number(entry.entryCashRial));
  const creditRial = Math.max(0, Number(entry.entryCashRial));
  const unitDebitRial = Math.max(0, -Number(entry.unitEntryCashRial));
  const totalRial = debitRial + marginRial + feeRial;
  const unitTotalRial = unitDebitRial + unitMarginRial + unitFeeRial;
  if (![debitRial, creditRial, unitDebitRial, unitMarginRial, marginRial,
    unitFeeRial, feeRial, totalRial, unitTotalRial].every(Number.isFinite)
    || totalRial < 0 || !(unitTotalRial > 0)
    || (creditRial > EPS && !(marginRial > 0))) {
    return fail('invalidCapital', session, entry);
  }

  const overallQuality = combineDataQuality([
    executionQuality, feeInput.quality, ...(hasShortOption ? [marginQuality] : []),
  ], { source: 'portfolio-capital-requirement', asOf: snapshot.at });
  const maxQty = Math.max(0, Math.floor(allocation.targetRial / unitTotalRial));
  const exceeded = totalRial > allocation.targetRial;
  const basis = creditRial > EPS
    ? { kind: 'CREDIT_MARGIN', label: 'وجه تضمین ناخالص بستانکار به‌علاوه کارمزد ورود' }
    : marginRial > EPS
      ? { kind: 'DEBIT_AND_MARGIN', label: 'بدهکار خالص، وجه تضمین و کارمزد ورود' }
      : { kind: 'NET_DEBIT', label: 'بدهکار خالص واقعی به‌علاوه کارمزد ورود' };

  return {
    version: PORTFOLIO_CAPITAL_VERSION,
    ok: true,
    why: '',
    reason: null,
    sessionId: text(session.id),
    candidateId: text(entry.candidateId),
    now: { ...snapshot.at },
    executableQty: entry.executableQty,
    components: {
      debitRial,
      creditRial,
      feeRial,
      marginRial,
      totalRial,
    },
    unit: {
      debitRial: unitDebitRial,
      feeRial: unitFeeRial,
      marginRial: unitMarginRial,
      totalRial: unitTotalRial,
    },
    basis,
    quality: overallQuality,
    audit: {
      entry: {
        version: entry.version, sessionId: entry.sessionId,
        candidateId: entry.candidateId, now: { ...entry.now },
      },
      fee: { rates: copy(feeInput.fees), quality: copy(feeInput.quality) },
      margin: marginAudit === null ? {
        required: false, quality: marginQuality,
      } : {
        required: true,
        grossRial: marginRial,
        netAfterCreditRial: marginAudit.marginNet,
        comboRule: marginAudit.comboRule,
        components: marginAudit.components,
        quality: marginQuality,
      },
    },
    budget: {
      familyId: text(allocation.row.familyId),
      targetRial: allocation.targetRial,
      requiredRial: totalRial,
      exceeded,
      maxQty,
      binding: exceeded ? {
        code: 'familyCapitalExceeded',
        label: 'سرمایه لازم ظرفیت کامل از بودجهٔ قفل‌شدهٔ خانواده بیشتر است',
      } : null,
      entryExecutableQty: entry.executableQty,
      note: 'ظرفیت دفتر طرح ورود تغییر نکرده است؛ سقف سرمایه جداگانه گزارش می‌شود.',
    },
  };
}
