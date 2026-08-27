// مقایسهٔ دو پروندهٔ پیاپی — برش نهم و پایانی فاز ۶.
//
// این ماژول نتیجهٔ مالی یا یافتهٔ تازه‌ای نمی‌سازد. هر دو طرف را به
// تحلیل سرمایه و استخراج ضعف موجود می‌دهد و فقط دو خروجی نسخه‌دار را
// کنار هم می‌گذارد. تفاوت، شاهد علت یا حکم بهتر/بدتر بودن نیست.

import { PORTFOLIO_CLOSEOUT_VERSION } from './portfolio-closeout.mjs';
import { portfolioDossierAnalysis } from './portfolio-dossier-analysis.mjs';
import { portfolioDossierWeaknesses } from './portfolio-dossier-weakness.mjs';
import { momentKey } from './trading-calendar.mjs';

export const PORTFOLIO_DOSSIER_COMPARE_VERSION = 1;

const text = (value) => String(value ?? '').trim();
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const copyMoment = (value) => ({ date: Number(value?.date), second: Number(value?.second) });

function fail(why) {
  return {
    version: PORTFOLIO_DOSSIER_COMPARE_VERSION,
    ok: false,
    why,
    older: null,
    newer: null,
    sameBaseIns: null,
    metrics: null,
    findings: null,
  };
}

function validatePair(session, dossier, label) {
  if (!isObject(session) || session.state !== 'closed' || !text(session.id)) {
    return `${label} جلسه بسته‌شده معتبر نیست`;
  }
  if (!isObject(dossier) || dossier.version !== PORTFOLIO_CLOSEOUT_VERSION) {
    return `${label} نسخه پرونده پایان معتبر نیست`;
  }
  if (dossier.sessionId !== session.id) return `${label} شناسه پرونده و جلسه یکی نیست`;
  if (!text(session.baseIns)) return `${label} نماد پایه معلوم نیست`;
  const sessionClosed = momentKey(session.closedAt);
  const dossierClosed = momentKey(dossier.closedAt);
  if (!Number.isFinite(sessionClosed) || sessionClosed !== dossierClosed) {
    return `${label} لحظه بستن پرونده و جلسه یکی نیست`;
  }
  return '';
}

function metric(older, newer) {
  return {
    older: Number.isFinite(older) ? older : null,
    newer: Number.isFinite(newer) ? newer : null,
    // نبود عدد در هر طرف، نبود delta است؛ هرگز صفر جایگزین نمی‌شود.
    delta: Number.isFinite(older) && Number.isFinite(newer) ? newer - older : null,
  };
}

const sortedCodes = (findings) => [...new Set((findings || [])
  .map((row) => text(row?.code)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** دو پرونده معتبر با ترتیب قدیمی → جدید را مقایسه می‌کند. */
export function portfolioDossierComparison(olderSession, olderDossier, newerSession, newerDossier) {
  const invalidOlder = validatePair(olderSession, olderDossier, 'پرونده قدیمی:');
  if (invalidOlder) return fail(invalidOlder);
  const invalidNewer = validatePair(newerSession, newerDossier, 'پرونده جدید:');
  if (invalidNewer) return fail(invalidNewer);

  if (momentKey(olderDossier.closedAt) >= momentKey(newerDossier.closedAt)) {
    return fail('ترتیب پرونده‌ها باید از قدیمی به جدید باشد');
  }

  const olderAnalysis = portfolioDossierAnalysis(olderSession, olderDossier);
  const newerAnalysis = portfolioDossierAnalysis(newerSession, newerDossier);
  const olderWeakness = portfolioDossierWeaknesses(olderSession, olderDossier);
  const newerWeakness = portfolioDossierWeaknesses(newerSession, newerDossier);
  if (!olderAnalysis.ok || !newerAnalysis.ok || !olderWeakness.ok || !newerWeakness.ok) {
    return fail([olderAnalysis.why, newerAnalysis.why, olderWeakness.why, newerWeakness.why]
      .filter(Boolean).join('؛ ') || 'تحلیل یکی از پرونده‌ها ساخته نشد');
  }

  const olderCodes = sortedCodes(olderWeakness.findings);
  const newerCodes = sortedCodes(newerWeakness.findings);
  const olderSet = new Set(olderCodes), newerSet = new Set(newerCodes);
  const added = newerCodes.filter((code) => !olderSet.has(code));
  const resolved = olderCodes.filter((code) => !newerSet.has(code));
  const shared = newerCodes.filter((code) => olderSet.has(code));
  const titles = {};
  for (const row of [...olderWeakness.findings, ...newerWeakness.findings]) {
    if (text(row?.code)) titles[row.code] = text(row.title) || row.code;
  }

  return {
    version: PORTFOLIO_DOSSIER_COMPARE_VERSION,
    ok: true,
    why: '',
    older: {
      sessionId: olderSession.id,
      baseIns: olderSession.baseIns,
      closedAt: copyMoment(olderDossier.closedAt),
    },
    newer: {
      sessionId: newerSession.id,
      baseIns: newerSession.baseIns,
      closedAt: copyMoment(newerDossier.closedAt),
    },
    sameBaseIns: olderSession.baseIns === newerSession.baseIns,
    metrics: {
      realizedReturnPct: metric(
        olderAnalysis.realizedReturnPct, newerAnalysis.realizedReturnPct,
      ),
      targetGapPct: metric(olderAnalysis.targetGapPct, newerAnalysis.targetGapPct),
      severityCounts: {
        critical: metric(olderWeakness.counts.critical, newerWeakness.counts.critical),
        warning: metric(olderWeakness.counts.warning, newerWeakness.counts.warning),
        notice: metric(olderWeakness.counts.notice, newerWeakness.counts.notice),
      },
    },
    findings: { added, resolved, shared, titles },
  };
}
