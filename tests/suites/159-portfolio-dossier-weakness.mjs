// ۱۵۹. استخراج ضعف‌های مستند پرونده

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  portfolioDossierWeaknesses,
} from '../../core/portfolio-dossier-weakness.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';
import { portfolioDossierWeaknessView } from '../../ui/portfolio-dossier-weakness-view.mjs';

group('۱۵۹. استخراج ضعف‌های مستند پرونده');
{
  const fx159 = portfolioFixture('dossier-weakness-159');
  const mission159 = fx159.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const closed159 = closeoutPortfolioSession(mission159, fx159.evidence, { force: true });
  const dossier159 = JSON.parse(JSON.stringify(closed159.dossier));
  dossier159.positions = {
    total: 1, open: 1, closed: 0, openIds: ['position-open-159'], openQty: 3,
  };
  dossier159.alerts = [
    { code: 'maxMarginUse', label: 'سقف وجه تضمین', state: 'breached', stateLabel: 'شکسته', limitPct: 40, currentPct: 46, headroomPct: -6, limitRial: 4_000_000, currentRial: 4_600_000, headroomRial: -600_000 },
    { code: 'missionLossCap', label: 'سقف زیان مأموریت', state: 'near', stateLabel: 'نزدیک شکستن', limitPct: 50, currentPct: 43, headroomPct: 7 },
    { code: 'unrealizedLoss', label: 'زیان تحقق‌نیافته', state: 'unknown', stateLabel: 'نامعلوم', why: 'یک موقعیت قیمت نشد' },
    { code: 'minFreeCapital', label: 'سرمایه آزاد', state: 'clear', stateLabel: 'رعایت شده' },
  ];
  dossier159.realized.totalRial = null;
  dossier159.realized.unknown = ['position-open-159'];

  const result159 = portfolioDossierWeaknesses(closed159.session, dossier159);
  check('پرونده معتبر یافته‌های مستند می‌سازد',
    result159.ok && !result159.quiet && result159.findings.length >= 6, result159.why);
  const codes159 = result159.findings.map((row) => row.code);
  check('هر یافته کد یکتا و پایدار دارد',
    new Set(codes159).size === codes159.length
    && ['open-commitment', 'risk-breached:maxMarginUse',
      'risk-near:missionLossCap', 'risk-unknown:unrealizedLoss',
      'data:unknownRealized', 'early-close']
      .every((code) => codes159.includes(code)));
  check('تعهد باز شاهد حجم و شناسه‌های خودش را دارد', (() => {
    const row = result159.findings.find((item) => item.code === 'open-commitment');
    return row?.severity === 'critical' && row.evidence.openCount === 1
      && row.evidence.openQty === 3 && row.evidence.openIds[0] === 'position-open-159';
  })());
  check('شکسته و نزدیک شدت یکسان نمی‌گیرند',
    result159.findings.find((row) => row.code === 'risk-breached:maxMarginUse')?.severity === 'critical'
    && result159.findings.find((row) => row.code === 'risk-near:missionLossCap')?.severity === 'warning');
  check('قید رعایت‌شده یافته نمی‌سازد', !codes159.some((code) => code.includes('minFreeCapital')));
  check('هشدار نامعلوم شکست جا زده نمی‌شود',
    result159.findings.find((row) => row.code === 'risk-unknown:unrealizedLoss')?.severity === 'notice');
  check('تحلیل ناقص، نرسیدن به هدف نمی‌سازد', !codes159.includes('target-missed'));
  check('شدت‌ها و سپس کد، ترتیب پایدار می‌سازند', (() => {
    const rank = { critical: 0, warning: 1, notice: 2 };
    return result159.findings.every((row, index, all) => index === 0
      || rank[all[index - 1].severity] < rank[row.severity]
      || (rank[all[index - 1].severity] === rank[row.severity]
        && all[index - 1].code.localeCompare(row.code) <= 0));
  })());

  const missed159 = portfolioDossierWeaknesses(closed159.session, closed159.dossier);
  check('نرسیدن قطعی به هدف شاهد عددی خودش را دارد', (() => {
    const row = missed159.findings.find((item) => item.code === 'target-missed');
    return row?.severity === 'warning' && row.evidence.targetGapRial === -2_500_000
      && row.evidence.targetReturnPct === 25;
  })());
  check('بستن زودهنگام لحظه بسته و پایان برنامه را نگه می‌دارد', (() => {
    const row = missed159.findings.find((item) => item.code === 'early-close');
    return row?.evidence.closedAt?.date === closed159.dossier.closedAt.date
      && row.evidence.plannedEnd?.date === closed159.dossier.end.date;
  })());

  const calmSession159 = JSON.parse(JSON.stringify(mission159));
  calmSession159.lockedMission.objective.targetReturnPct = 0;
  const calmClosed159 = closeoutPortfolioSession(calmSession159, fx159.evidence, {
    at: calmSession159.end, force: false,
  });
  const calm159 = portfolioDossierWeaknesses(calmClosed159.session, calmClosed159.dossier);
  check('پرونده سالم می‌تواند خروجی آرام بدون یافته داشته باشد',
    calm159.ok && calm159.quiet && calm159.findings.length === 0 && calm159.counts.total === 0,
    calm159.why);
  check('نسخه ناشناخته رد می‌شود', (() => {
    const dossier = JSON.parse(JSON.stringify(closed159.dossier));
    dossier.version = 99;
    return !portfolioDossierWeaknesses(closed159.session, dossier).ok;
  })());
  check('پرونده ناهم‌هویت رد می‌شود', (() => {
    const dossier = JSON.parse(JSON.stringify(closed159.dossier));
    dossier.sessionId = 'other';
    return !portfolioDossierWeaknesses(closed159.session, dossier).ok;
  })());

  const shown159 = portfolioDossierWeaknessView(result159);
  check('مدل نمایش شدت و شرح مستند را نگه می‌دارد',
    shown159.ok && shown159.rows.length === result159.findings.length
    && shown159.rows.every((row) => row.severityLabel && row.title && row.description));
  const money159 = shown159.rows.find((row) => row.code === 'risk-breached:maxMarginUse')
    ?.evidence.find((row) => row.key === 'headroomRial')?.valueText;
  check('شاهد مالی تومان و رقم فارسی است',
    money159 === '−۶۰٬۰۰۰ تومان' && !/[0-9]/.test(money159));
  check('شاهد درصدی واحد خودش را دارد',
    shown159.rows.find((row) => row.code === 'risk-near:missionLossCap')
      ?.evidence.some((row) => row.key === 'headroomPct' && row.valueText.endsWith('٪')));
  const calmView159 = portfolioDossierWeaknessView(calm159);
  check('نمایش آرام ادعای ضعف ساختگی ندارد',
    calmView159.quiet && calmView159.rows.length === 0 && calmView159.summaryText.includes('یافته‌ای ندارد'));

  const core159 = readSrc('../core/portfolio-dossier-weakness.mjs');
  check('استخراج ضعف قیمت یا شبکه نمی‌خواند',
    !/fetch\(|walkBook|buildChain|portfolioSessionEligibility|lastPrice|closingPrice/.test(core159));
  check('متن یافته علت‌سازی و قضاوت ثبت‌نشده ندارد',
    !/تصمیم بد|اشتباه کردی|از ترس|از طمع/.test(core159));
  const viewCode159 = readSrc('../ui/portfolio-dossier-weakness-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('نمایش شاهد مالی جز ریال به تومان حساب نمی‌کند',
    /value\s*\/\s*10/.test(viewCode159)
    && !/value\s*[*+\-]\s*/.test(viewCode159));
}
