// استخراج ضعف‌های مستند پرونده — برش هفتم فاز ۶.
//
// این خروجی علت روان‌شناختی یا توصیه نمی‌سازد. هر یافته فقط می‌گوید کدام
// سند چه وضعیتی را ثبت کرده و شاهد خام همان گزاره را کنار آن نگه می‌دارد.

import { PORTFOLIO_CLOSEOUT_VERSION } from './portfolio-closeout.mjs';
import { portfolioDossierAnalysis } from './portfolio-dossier-analysis.mjs';

export const PORTFOLIO_DOSSIER_WEAKNESS_VERSION = 1;

export const DOSSIER_WEAKNESS_SEVERITIES = Object.freeze({
  critical: 'نیازمند توجه فوری',
  warning: 'نیازمند بازبینی',
  notice: 'داده ناکافی',
});

const text = (value) => String(value ?? '').trim();
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function fail(why) {
  return {
    version: PORTFOLIO_DOSSIER_WEAKNESS_VERSION,
    ok: false, why, findings: [], counts: null, quiet: false,
  };
}

function finding(code, severity, title, description, evidence) {
  return { code, severity, title, description, evidence: copy(evidence) };
}

function alertFinding(alert) {
  const state = text(alert?.state);
  const code = text(alert?.code);
  const label = text(alert?.label) || code;
  if (!code || !['breached', 'near', 'unknown'].includes(state)) return null;
  const evidence = {
    alertCode: code,
    state,
    stateLabel: text(alert.stateLabel),
    limitPct: Number.isFinite(alert.limitPct) ? alert.limitPct : null,
    currentPct: Number.isFinite(alert.currentPct) ? alert.currentPct : null,
    headroomPct: Number.isFinite(alert.headroomPct) ? alert.headroomPct : null,
    limitRial: Number.isFinite(alert.limitRial) ? alert.limitRial : null,
    currentRial: Number.isFinite(alert.currentRial) ? alert.currentRial : null,
    headroomRial: Number.isFinite(alert.headroomRial) ? alert.headroomRial : null,
    why: text(alert.why),
  };
  if (state === 'breached') {
    return finding(`risk-breached:${code}`, 'critical', `${label} شکسته ثبت شد`,
      'هشدار لحظه بستن، این قید را در حالت شکسته ثبت کرده است.', evidence);
  }
  if (state === 'near') {
    return finding(`risk-near:${code}`, 'warning', `${label} نزدیک حد ثبت شد`,
      'هشدار لحظه بستن، فاصله این قید تا حد را در ناحیه نزدیک ثبت کرده است.', evidence);
  }
  return finding(`risk-unknown:${code}`, 'notice', `${label} نامعلوم ثبت شد`,
    'هشدار لحظه بستن برای این قید عدد کافی نداشته است.', evidence);
}

const dataIssueTitles = Object.freeze({
  unknownRealized: 'جمع تحقق‌یافته کامل نیست',
  missingAccounting: 'حسابداری پرونده کامل نیست',
  missingCapital: 'سرمایه شروع پرونده معلوم نیست',
  unknownReturnBase: 'مبنای بازده هدف شناخته نمی‌شود',
  missingReturnBase: 'مقدار مبنای بازده هدف معلوم نیست',
  zeroReturnBase: 'مبنای بازده هدف مثبت نیست',
  invalidTarget: 'هدف مأموریت معتبر نیست',
});

/** پرونده معتبر → یافته‌های مستند، با ترتیب و کد پایدار. */
export function portfolioDossierWeaknesses(session, dossier) {
  if (!isObject(session) || session.state !== 'closed') {
    return fail('جلسه بسته‌شده برای تحلیل ضعف در دسترس نیست');
  }
  if (!isObject(dossier) || dossier.version !== PORTFOLIO_CLOSEOUT_VERSION) {
    return fail('نسخه پرونده پایان ناشناخته یا پشتیبانی‌نشده است');
  }
  if (!text(session.id) || dossier.sessionId !== session.id) {
    return fail('شناسه پرونده با شناسه جلسه یکی نیست');
  }
  if (!isObject(dossier.positions) || !Array.isArray(dossier.alerts)) {
    return fail('ساختار پرونده پایان برای تحلیل ضعف ناقص است');
  }

  const rows = [];
  const analysis = portfolioDossierAnalysis(session, dossier);
  if (!analysis.ok) return fail(analysis.why);

  if (dossier.positions.open > 0) {
    rows.push(finding('open-commitment', 'critical', 'جلسه با تعهد باز بسته شد',
      'پرونده در لحظه بستن، موقعیت باز باقی‌مانده را ثبت کرده است.', {
        openCount: dossier.positions.open,
        openQty: dossier.positions.openQty,
        openIds: copy(dossier.positions.openIds || []),
      }));
  }

  for (const alert of dossier.alerts) {
    const row = alertFinding(alert);
    if (row) rows.push(row);
  }

  for (const row of analysis.issues) {
    if (!Object.prototype.hasOwnProperty.call(dataIssueTitles, row.code)) continue;
    rows.push(finding(`data:${row.code}`, 'notice', dataIssueTitles[row.code],
      'داده لازم برای ساخت نتیجه مالی قطعی در پرونده کامل نیست.', {
        issueCode: row.code,
        detail: text(row.detail),
      }));
  }
  // نبود هشدار وقتی هیچ موقعیت بازی نیست، ضعف داده نیست؛ قیدی برای سنجش
  // وجود نداشته است. علت هشدار فقط کنار تعهد باز به یافته داده تبدیل می‌شود.
  if (text(dossier.alertsWhy) && dossier.positions.open > 0) {
    rows.push(finding('data:alerts', 'notice', 'هشدارهای پایان کامل نیستند',
      'پرونده علت ناتوانی در ساخت هشدارهای پایان را ثبت کرده است.', {
        detail: text(dossier.alertsWhy),
      }));
  }

  if (dossier.early === true) {
    rows.push(finding('early-close', 'warning', 'جلسه پیش از پایان بازه بسته شد',
      'لحظه بستن پرونده پیش از پایان قفل‌شده مأموریت است.', {
        closedAt: copy(dossier.closedAt),
        plannedEnd: copy(dossier.end),
      }));
  }

  // نامعلوم شکست نیست. حکم هدف فقط از تحلیل کامل می‌آید.
  if (analysis.complete && analysis.targetState === 'missed') {
    rows.push(finding('target-missed', 'warning', 'هدف مأموریت محقق نشد',
      'بازده تحقق‌یافته کامل، پایین‌تر از هدف قفل‌شده مأموریت است.', {
        realizedReturnPct: analysis.realizedReturnPct,
        targetReturnPct: analysis.targetReturnPct,
        targetGapPct: analysis.targetGapPct,
        targetGapRial: analysis.targetGapRial,
      }));
  }

  const severityRank = { critical: 0, warning: 1, notice: 2 };
  const unique = [...new Map(rows.map((row) => [row.code, row])).values()]
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
      || left.code.localeCompare(right.code));
  const count = (severity) => unique.filter((row) => row.severity === severity).length;
  return {
    version: PORTFOLIO_DOSSIER_WEAKNESS_VERSION,
    ok: true,
    why: '',
    findings: unique,
    counts: {
      total: unique.length,
      critical: count('critical'),
      warning: count('warning'),
      notice: count('notice'),
    },
    quiet: unique.length === 0,
  };
}
