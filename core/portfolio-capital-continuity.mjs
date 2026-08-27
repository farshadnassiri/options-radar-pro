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

function priorLineage(previous, initialCapitalRial, sessionId) {
  if (previous == null) return { ok: true, lineage: [] };
  if (!isObject(previous)
    || previous.version !== PORTFOLIO_CAPITAL_CONTINUITY_VERSION
    || previous.ok !== true
    || !['ready', 'exhausted'].includes(previous.state)
    || previous.analysisVersion !== PORTFOLIO_DOSSIER_ANALYSIS_VERSION
    || !finiteNonNegative(previous.finalCapitalRial)
    || !Array.isArray(previous.lineage) || previous.lineage.length === 0
    || previous.lineage.some((row) => !validLineageRow(row))) {
    return { ok: false, reason: 'invalidPrevious' };
  }
  const last = previous.lineage.at(-1);
  if (last.sessionId !== previous.sourceSessionId
    || last.portfolioId !== previous.sourcePortfolioId
    || last.baseIns !== previous.baseIns
    || !sameMoment(last.closedAt, previous.closedAt)
    || last.initialCapitalRial !== previous.initialCapitalRial
    || last.realizedRial !== previous.realizedRial
    || last.finalCapitalRial !== previous.finalCapitalRial) {
    return { ok: false, reason: 'invalidPrevious' };
  }
  if (previous.state === 'exhausted' || previous.finalCapitalRial === 0) {
    return { ok: false, reason: 'exhaustedPrevious' };
  }
  if (previous.finalCapitalRial !== initialCapitalRial) {
    return { ok: false, reason: 'capitalMismatch' };
  }
  if (previous.lineage.some((row) => row.sessionId === sessionId)) {
    return { ok: false, reason: 'duplicateSession' };
  }
  return { ok: true, lineage: structuredClone(previous.lineage) };
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

  const prior = priorLineage(previous, initialCapitalRial, sourceSessionId);
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
