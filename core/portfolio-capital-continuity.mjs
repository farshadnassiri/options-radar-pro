// قرارداد تداوم سرمایه بین دو جلسه — برش سوم فاز ۷.
//
// این ماژول هیچ سرمایه‌ای را حساب نمی‌کند. تنها خروجی کامل و قطعی تحلیل
// پرونده را با منشأ آن بسته‌بندی می‌کند تا جلسه بعد بتواند آگاهانه از آن
// استفاده کند. ساخت جلسه بعد و اتصال فرم، مسئولیت برش‌های بعدی است.

import {
  PORTFOLIO_DOSSIER_ANALYSIS_VERSION, portfolioDossierAnalysis,
} from './portfolio-dossier-analysis.mjs';

export const PORTFOLIO_CAPITAL_CONTINUITY_VERSION = 1;

export const PORTFOLIO_CAPITAL_CONTINUITY_REASONS = Object.freeze({
  incompleteDossier: 'پرونده بسته‌شده سرمایه قطعی و کامل ندارد',
  missingIdentity: 'هویت جلسه، سبد یا نماد پایه کامل نیست',
  missingClosedAt: 'لحظه بستن جلسه کامل یا همسان نیست',
  invalidCapital: 'سرمایه نهایی برای انتقال معتبر نیست',
  invalidPrevious: 'قرارداد تداوم قبلی معتبر نیست',
  exhaustedPrevious: 'سرمایه قرارداد قبلی تمام شده و قابل ادامه نیست',
  capitalMismatch: 'سرمایه شروع جلسه با سرمایه نهایی قرارداد قبلی برابر نیست',
  duplicateSession: 'یک جلسه نمی‌تواند دوباره در زنجیره سرمایه ثبت شود',
});

const text = (value) => String(value ?? '').trim();
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const finiteNonNegative = (value) => Number.isFinite(value) && value >= 0;

function rejected(reason, why = '') {
  return {
    version: PORTFOLIO_CAPITAL_CONTINUITY_VERSION,
    ok: false,
    why: why || PORTFOLIO_CAPITAL_CONTINUITY_REASONS[reason],
    reason,
    state: null,
    analysisVersion: null,
    sourceSessionId: null,
    sourcePortfolioId: null,
    baseIns: null,
    closedAt: null,
    initialCapitalRial: null,
    realizedRial: null,
    finalCapitalRial: null,
    lineage: [],
  };
}

function validMoment(value) {
  return isObject(value)
    && Number.isInteger(value.date) && value.date > 0
    && Number.isFinite(value.second) && value.second >= 0;
}

function sameMoment(left, right) {
  return validMoment(left) && validMoment(right)
    && left.date === right.date && left.second === right.second;
}

function validLineageRow(row) {
  return isObject(row)
    && text(row.sessionId) && text(row.portfolioId) && text(row.baseIns)
    && validMoment(row.closedAt)
    && finiteNonNegative(row.initialCapitalRial)
    && Number.isFinite(row.realizedRial)
    && finiteNonNegative(row.finalCapitalRial);
}

function validationFailure(reason = 'invalidPrevious') {
  return {
    ok: false,
    why: PORTFOLIO_CAPITAL_CONTINUITY_REASONS[reason],
    reason,
    continuity: null,
  };
}

function canonicalLineageRow(row) {
  return {
    sessionId: text(row.sessionId),
    portfolioId: text(row.portfolioId),
    baseIns: text(row.baseIns),
    closedAt: { date: row.closedAt.date, second: row.closedAt.second },
    initialCapitalRial: row.initialCapitalRial,
    realizedRial: row.realizedRial,
    finalCapitalRial: row.finalCapitalRial,
  };
}

/**
 * قرارداد انتقالی خوانده‌شده از JSON را بدون ساختن عدد مالی canonical می‌کند.
 * اگر هویت جلسه تازه داده شود، هم‌سرمایه‌بودن و تازه‌بودن هر دو شناسه هم
 * همین‌جا سنجیده می‌شوند تا فرم و سرور دو تعریف متفاوت از lineage نداشته باشند.
 */
export function validatePortfolioCapitalContinuity(value, {
  initialCapitalRial = null, sessionId = '', portfolioId = '',
} = {}) {
  if (!isObject(value)
    || value.version !== PORTFOLIO_CAPITAL_CONTINUITY_VERSION
    || value.ok !== true
    || value.why !== '' || value.reason !== null
    || !['ready', 'exhausted'].includes(value.state)
    || value.analysisVersion !== PORTFOLIO_DOSSIER_ANALYSIS_VERSION
    || !text(value.sourceSessionId) || !text(value.sourcePortfolioId)
    || !text(value.baseIns) || !validMoment(value.closedAt)
    || !finiteNonNegative(value.initialCapitalRial)
    || !Number.isFinite(value.realizedRial)
    || !finiteNonNegative(value.finalCapitalRial)
    || !Array.isArray(value.lineage) || value.lineage.length === 0) {
    return validationFailure();
  }

  const lineage = [];
  const sessionIds = new Set();
  const portfolioIds = new Set();
  for (const raw of value.lineage) {
    if (!validLineageRow(raw)) return validationFailure();
    const row = canonicalLineageRow(raw);
    if (row.finalCapitalRial - row.initialCapitalRial !== row.realizedRial) {
      return validationFailure('capitalMismatch');
    }
    if (sessionIds.has(row.sessionId) || portfolioIds.has(row.portfolioId)) {
      return validationFailure('duplicateSession');
    }
    const prior = lineage.at(-1);
    if (prior && prior.finalCapitalRial !== row.initialCapitalRial) {
      return validationFailure('capitalMismatch');
    }
    sessionIds.add(row.sessionId);
    portfolioIds.add(row.portfolioId);
    lineage.push(row);
  }

  const last = lineage.at(-1);
  if (last.sessionId !== text(value.sourceSessionId)
    || last.portfolioId !== text(value.sourcePortfolioId)
    || last.baseIns !== text(value.baseIns)
    || !sameMoment(last.closedAt, value.closedAt)
    || last.initialCapitalRial !== value.initialCapitalRial
    || last.realizedRial !== value.realizedRial
    || last.finalCapitalRial !== value.finalCapitalRial) {
    return validationFailure();
  }
  if (value.finalCapitalRial - value.initialCapitalRial !== value.realizedRial) {
    return validationFailure('capitalMismatch');
  }
  if ((value.state === 'exhausted') !== (value.finalCapitalRial === 0)) {
    return validationFailure();
  }
  if (initialCapitalRial !== null) {
    if (!finiteNonNegative(initialCapitalRial)
      || value.finalCapitalRial !== initialCapitalRial) {
      return validationFailure('capitalMismatch');
    }
  }
  const nextSessionId = text(sessionId);
  const nextPortfolioId = text(portfolioId);
  if ((nextSessionId && sessionIds.has(nextSessionId))
    || (nextPortfolioId && portfolioIds.has(nextPortfolioId))) {
    return validationFailure('duplicateSession');
  }

  return {
    ok: true,
    why: '',
    reason: null,
    continuity: {
      version: PORTFOLIO_CAPITAL_CONTINUITY_VERSION,
      ok: true,
      why: '',
      reason: null,
      state: value.state,
      analysisVersion: value.analysisVersion,
      sourceSessionId: text(value.sourceSessionId),
      sourcePortfolioId: text(value.sourcePortfolioId),
      baseIns: text(value.baseIns),
      closedAt: { date: value.closedAt.date, second: value.closedAt.second },
      initialCapitalRial: value.initialCapitalRial,
      realizedRial: value.realizedRial,
      finalCapitalRial: value.finalCapitalRial,
      lineage,
    },
  };
}

function priorLineage(previous, initialCapitalRial, sessionId, portfolioId) {
  if (previous == null) return { ok: true, lineage: [] };
  if (previous.state === 'exhausted' || previous.finalCapitalRial === 0) {
    return { ok: false, reason: 'exhaustedPrevious' };
  }
  const checked = validatePortfolioCapitalContinuity(previous, {
    initialCapitalRial, sessionId, portfolioId,
  });
  return checked.ok
    ? { ok: true, lineage: structuredClone(checked.continuity.lineage) }
    : { ok: false, reason: checked.reason };
}

/**
 * سرمایه قطعی یک پرونده بسته را برای مصرف آگاهانه در جلسه بعد حمل می‌کند.
 * `previous` اختیاری است و فقط منشأهای قطعی زنجیره قبلی را ادامه می‌دهد.
 */
export function portfolioCapitalContinuity(session, dossier, { previous = null } = {}) {
  const analysis = portfolioDossierAnalysis(session, dossier);
  if (!analysis.ok || !analysis.complete) {
    return rejected('incompleteDossier', analysis.why);
  }

  const sourceSessionId = text(session?.id);
  const sourcePortfolioId = text(session?.portfolioId);
  const baseIns = text(session?.baseIns);
  if (!sourceSessionId || !sourcePortfolioId || !baseIns) return rejected('missingIdentity');
  if (!sameMoment(session?.closedAt, dossier?.closedAt)) return rejected('missingClosedAt');

  const { initialCapitalRial, realizedRial, finalCapitalRial } = analysis;
  if (!finiteNonNegative(initialCapitalRial)
    || !Number.isFinite(realizedRial)
    || !finiteNonNegative(finalCapitalRial)) {
    return rejected('invalidCapital');
  }

  const prior = priorLineage(previous, initialCapitalRial, sourceSessionId, sourcePortfolioId);
  if (!prior.ok) return rejected(prior.reason);

  const source = {
    sessionId: sourceSessionId,
    portfolioId: sourcePortfolioId,
    baseIns,
    closedAt: { date: session.closedAt.date, second: session.closedAt.second },
    initialCapitalRial,
    realizedRial,
    finalCapitalRial,
  };

  return {
    version: PORTFOLIO_CAPITAL_CONTINUITY_VERSION,
    ok: true,
    why: '',
    reason: null,
    state: finalCapitalRial === 0 ? 'exhausted' : 'ready',
    analysisVersion: analysis.version,
    sourceSessionId,
    sourcePortfolioId,
    baseIns,
    closedAt: { ...source.closedAt },
    initialCapitalRial,
    realizedRial,
    finalCapitalRial,
    lineage: [...prior.lineage, source],
  };
}
