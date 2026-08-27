// تحلیل سرمایهٔ پرونده پایان — برش پنجم فاز ۶.
//
// این ماژول قیمت نمی‌گیرد و موقعیت باز را mark نمی‌کند. سرمایه نهایی فقط
// برای جلسهٔ تخت با سود و زیان تحقق‌یافته و حسابداری کامل معنا دارد؛ در
// بقیه حالت‌ها نبود عدد همراه علت برمی‌گردد.

import { PORTFOLIO_CLOSEOUT_VERSION } from './portfolio-closeout.mjs';
import { MISSION_RETURN_BASES } from './portfolio-mission.mjs';

export const PORTFOLIO_DOSSIER_ANALYSIS_VERSION = 1;

export const PORTFOLIO_DOSSIER_ANALYSIS_REASONS = Object.freeze({
  noSession: 'جلسه بسته‌شده برای تحلیل در دسترس نیست',
  invalidDossier: 'پرونده پایان معتبر نیست',
  idMismatch: 'شناسه پرونده با شناسه جلسه یکی نیست',
  openPositions: 'جلسه با تعهد باز بسته شده و سرمایه نهایی معلوم نیست',
  unknownRealized: 'جمع سود و زیان تحقق‌یافته کامل نیست',
  missingAccounting: 'حسابداری پرونده کامل نیست',
  missingCapital: 'سرمایه شروع جلسه معلوم نیست',
  unknownReturnBase: 'مبنای بازده هدف شناخته نمی‌شود',
  missingReturnBase: 'مقدار مبنای بازده هدف معلوم نیست',
  zeroReturnBase: 'مبنای بازده هدف مثبت نیست و درصد ساخته نمی‌شود',
  invalidTarget: 'درصد هدف مأموریت معتبر نیست',
});

const text = (value) => String(value ?? '').trim();
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function rejected(reason) {
  return {
    version: PORTFOLIO_DOSSIER_ANALYSIS_VERSION,
    ok: false,
    why: PORTFOLIO_DOSSIER_ANALYSIS_REASONS[reason],
    reason,
    complete: false,
    issues: [],
    initialCapitalRial: null,
    realizedRial: null,
    finalCapitalRial: null,
    returnBase: null,
    returnBaseRial: null,
    realizedReturnPct: null,
    targetReturnPct: null,
    targetProfitRial: null,
    targetGapPct: null,
    targetGapRial: null,
    targetState: null,
  };
}

function issue(code, detail = '') {
  return {
    code,
    label: PORTFOLIO_DOSSIER_ANALYSIS_REASONS[code],
    detail: text(detail),
  };
}

/** سرمایه نهایی و فاصله از هدف، فقط از سند بسته‌شده. */
export function portfolioDossierAnalysis(session, dossier) {
  if (!isObject(session) || session.state !== 'closed') return rejected('noSession');
  if (!isObject(dossier) || dossier.version !== PORTFOLIO_CLOSEOUT_VERSION) {
    return rejected('invalidDossier');
  }
  if (!text(session.id) || dossier.sessionId !== session.id) return rejected('idMismatch');

  const initial = session.capital?.initialRial;
  const realized = dossier.realized?.totalRial;
  const objective = session.lockedMission?.objective;
  const returnBase = text(objective?.returnBase);
  const targetReturnPct = objective?.targetReturnPct;
  const issues = [];

  if (!Number.isFinite(initial) || initial < 0) issues.push(issue('missingCapital'));
  if (!Number.isInteger(dossier.positions?.open) || dossier.positions.open < 0) {
    return rejected('invalidDossier');
  }
  if (dossier.positions.open > 0) {
    issues.push(issue('openPositions', `${dossier.positions.open} موقعیت باز`));
  }
  if (!Number.isFinite(realized)) issues.push(issue('unknownRealized'));
  if (!isObject(dossier.accounting)
    || !Number.isInteger(dossier.accounting.entries?.count)
    || !Number.isInteger(dossier.accounting.exits?.count)
    || !Number.isFinite(dossier.accounting.fees?.totalRial)) {
    issues.push(issue('missingAccounting', dossier.accountingWhy));
  }
  if (!Object.prototype.hasOwnProperty.call(MISSION_RETURN_BASES, returnBase)) {
    issues.push(issue('unknownReturnBase', returnBase));
  }
  if (!Number.isFinite(targetReturnPct) || targetReturnPct < 0) {
    issues.push(issue('invalidTarget'));
  }

  let returnBaseRial = null;
  if (returnBase === 'initial' && Number.isFinite(initial)) returnBaseRial = initial;
  if (returnBase === 'allocatable' && Number.isFinite(session.capital?.allocatableRial)) {
    returnBaseRial = session.capital.allocatableRial;
  }
  if (Object.prototype.hasOwnProperty.call(MISSION_RETURN_BASES, returnBase)
    && !Number.isFinite(returnBaseRial)) {
    issues.push(issue('missingReturnBase'));
  }
  if (Number.isFinite(returnBaseRial) && returnBaseRial <= 0) {
    issues.push(issue('zeroReturnBase'));
  }

  const complete = issues.length === 0;
  const finalCapitalRial = complete ? initial + realized : null;
  const realizedReturnPct = complete ? (realized / returnBaseRial) * 100 : null;
  const targetProfitRial = complete ? (returnBaseRial * targetReturnPct) / 100 : null;
  const targetGapRial = complete ? realized - targetProfitRial : null;
  const targetGapPct = complete ? realizedReturnPct - targetReturnPct : null;

  return {
    version: PORTFOLIO_DOSSIER_ANALYSIS_VERSION,
    ok: true,
    why: complete ? '' : issues.map((row) => row.label).join('؛ '),
    reason: null,
    complete,
    issues,
    initialCapitalRial: Number.isFinite(initial) ? initial : null,
    realizedRial: Number.isFinite(realized) ? realized : null,
    finalCapitalRial,
    returnBase: Object.prototype.hasOwnProperty.call(MISSION_RETURN_BASES, returnBase)
      ? returnBase : null,
    returnBaseRial: Number.isFinite(returnBaseRial) ? returnBaseRial : null,
    realizedReturnPct,
    targetReturnPct: Number.isFinite(targetReturnPct) && targetReturnPct >= 0
      ? targetReturnPct : null,
    targetProfitRial,
    targetGapPct,
    targetGapRial,
    targetState: complete ? (targetGapRial >= 0 ? 'met' : 'missed') : null,
  };
}
