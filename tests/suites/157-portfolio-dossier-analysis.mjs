// ۱۵۷. سرمایه نهایی و فاصله از هدف

import { check, group, near, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  PORTFOLIO_DOSSIER_ANALYSIS_VERSION, portfolioDossierAnalysis,
} from '../../core/portfolio-dossier-analysis.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';
import { portfolioDossierAnalysisView } from '../../ui/portfolio-dossier-analysis-view.mjs';

group('۱۵۷. سرمایه نهایی و فاصله از هدف');
{
  const fx157 = portfolioFixture('dossier-analysis-157');
  const mission157 = fx157.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const closed157 = closeoutPortfolioSession(mission157, fx157.evidence, { force: true });
  const analysis157 = portfolioDossierAnalysis(closed157.session, closed157.dossier);
  check('جلسه تخت با سند کامل تحلیل می‌شود',
    analysis157.ok && analysis157.complete
    && analysis157.version === PORTFOLIO_DOSSIER_ANALYSIS_VERSION, analysis157.why);
  check('سرمایه نهایی از سرمایه شروع و تحقق‌یافته جدا ساخته می‌شود',
    analysis157.initialCapitalRial === 10_000_000
    && analysis157.realizedRial === 0
    && analysis157.finalCapitalRial === 10_000_000);
  check('مبنای اولیه و درصد بازده صریح‌اند',
    analysis157.returnBase === 'initial' && analysis157.returnBaseRial === 10_000_000
    && analysis157.realizedReturnPct === 0);
  check('هدف و فاصله، اجزای جدا هستند',
    analysis157.targetReturnPct === 25 && analysis157.targetProfitRial === 2_500_000
    && analysis157.targetGapRial === -2_500_000 && analysis157.targetGapPct === -25
    && analysis157.targetState === 'missed');

  const allocSession157 = JSON.parse(JSON.stringify(mission157));
  allocSession157.capital.reserveRial = 2_000_000;
  allocSession157.capital.allocatableRial = 8_000_000;
  allocSession157.lockedMission.objective.returnBase = 'allocatable';
  allocSession157.lockedMission.objective.targetReturnPct = 10;
  const allocClosed157 = closeoutPortfolioSession(allocSession157, fx157.evidence, { force: true });
  const allocDossier157 = JSON.parse(JSON.stringify(allocClosed157.dossier));
  allocDossier157.realized.totalRial = 1_000_000;
  const alloc157 = portfolioDossierAnalysis(allocClosed157.session, allocDossier157);
  check('مبنای قابل تخصیص از سرمایه کل جدا می‌ماند',
    alloc157.complete && alloc157.returnBase === 'allocatable'
    && alloc157.returnBaseRial === 8_000_000
    && near(alloc157.realizedReturnPct, 12.5));
  check('رسیدن به هدف فقط با فاصله معلوم حکم می‌گیرد',
    alloc157.targetProfitRial === 800_000 && alloc157.targetGapRial === 200_000
    && near(alloc157.targetGapPct, 2.5) && alloc157.targetState === 'met');

  const open157 = JSON.parse(JSON.stringify(closed157.dossier));
  open157.positions = { total: 1, open: 1, closed: 0, openIds: ['position-open'], openQty: 2 };
  const openAnalysis157 = portfolioDossierAnalysis(closed157.session, open157);
  check('تعهد باز سرمایه نهایی و بازده را null می‌کند',
    openAnalysis157.ok && !openAnalysis157.complete
    && openAnalysis157.finalCapitalRial === null
    && openAnalysis157.realizedReturnPct === null
    && openAnalysis157.targetState === null
    && openAnalysis157.issues.some((row) => row.code === 'openPositions'));

  const unknown157 = JSON.parse(JSON.stringify(closed157.dossier));
  unknown157.realized.totalRial = null;
  unknown157.realized.unknown = ['position-unknown'];
  const unknownAnalysis157 = portfolioDossierAnalysis(closed157.session, unknown157);
  check('تحقق‌یافته ناقص با صفر پر نمی‌شود',
    unknownAnalysis157.realizedRial === null && unknownAnalysis157.finalCapitalRial === null
    && unknownAnalysis157.issues.some((row) => row.code === 'unknownRealized'));

  const noAccounting157 = JSON.parse(JSON.stringify(closed157.dossier));
  noAccounting157.accounting = null;
  noAccounting157.accountingWhy = 'دفتر ناقص است';
  const noAccountingAnalysis157 = portfolioDossierAnalysis(closed157.session, noAccounting157);
  check('حسابداری ناقص عدد نهایی نمی‌گیرد و علتش می‌ماند',
    noAccountingAnalysis157.finalCapitalRial === null
    && noAccountingAnalysis157.issues.some((row) => row.code === 'missingAccounting'
      && row.detail === 'دفتر ناقص است'));
  const halfAccounting157 = JSON.parse(JSON.stringify(closed157.dossier));
  delete halfAccounting157.accounting.fees.totalRial;
  check('بودن پوسته حسابداری جای جزء گمشده را نمی‌گیرد',
    portfolioDossierAnalysis(closed157.session, halfAccounting157)
      .issues.some((row) => row.code === 'missingAccounting'));

  const noCapital157 = JSON.parse(JSON.stringify(closed157.session));
  noCapital157.capital.initialRial = null;
  const noCapitalAnalysis157 = portfolioDossierAnalysis(noCapital157, closed157.dossier);
  check('سرمایه شروع نامعلوم، صفر فرض نمی‌شود',
    noCapitalAnalysis157.initialCapitalRial === null
    && noCapitalAnalysis157.finalCapitalRial === null
    && noCapitalAnalysis157.issues.some((row) => row.code === 'missingCapital'));

  const oddBase157 = JSON.parse(JSON.stringify(closed157.session));
  oddBase157.lockedMission.objective.returnBase = 'something';
  const oddBaseAnalysis157 = portfolioDossierAnalysis(oddBase157, closed157.dossier);
  check('مبنای ناشناخته حدس زده نمی‌شود',
    oddBaseAnalysis157.returnBase === null && oddBaseAnalysis157.realizedReturnPct === null
    && oddBaseAnalysis157.issues.some((row) => row.code === 'unknownReturnBase'));
  const missingBase157 = JSON.parse(JSON.stringify(closed157.session));
  missingBase157.lockedMission.objective.returnBase = 'allocatable';
  missingBase157.capital.allocatableRial = null;
  const missingBaseAnalysis157 = portfolioDossierAnalysis(missingBase157, closed157.dossier);
  check('مقدار گمشده مبنای معتبر هم عدد نمی‌گیرد',
    missingBaseAnalysis157.returnBaseRial === null
    && missingBaseAnalysis157.realizedReturnPct === null
    && missingBaseAnalysis157.issues.some((row) => row.code === 'missingReturnBase'));
  check('پرونده ناهم‌هویت هیچ عددی نمی‌گیرد', (() => {
    const dossier = JSON.parse(JSON.stringify(closed157.dossier));
    dossier.sessionId = 'other-session';
    const out = portfolioDossierAnalysis(closed157.session, dossier);
    return !out.ok && out.reason === 'idMismatch' && out.finalCapitalRial === null;
  })());
  check('نسخه ناشناخته پرونده رد می‌شود', (() => {
    const dossier = JSON.parse(JSON.stringify(closed157.dossier));
    dossier.version = 99;
    return portfolioDossierAnalysis(closed157.session, dossier).reason === 'invalidDossier';
  })());

  const view157 = portfolioDossierAnalysisView(analysis157);
  check('نمایش سرمایه و هدف، تومان و رقم فارسی است',
    view157.initialText === '۱٬۰۰۰٬۰۰۰ تومان'
    && view157.finalText === '۱٬۰۰۰٬۰۰۰ تومان'
    && view157.targetProfitText === '۲۵۰٬۰۰۰ تومان'
    && view157.targetReturnText.includes('۲۵') && view157.targetReturnText.endsWith('٪'));
  check('فاصله منفی لحن زیان و حکم خودش را دارد',
    view157.targetGapText === '−۲۵۰٬۰۰۰ تومان'
    && view157.targetTone === 'loss' && view157.targetStateLabel === 'هدف محقق نشد');
  const unknownView157 = portfolioDossierAnalysisView(unknownAnalysis157);
  check('نمایش نامعلوم خط تیره است، نه صفر',
    unknownView157.finalText === '—' && unknownView157.realizedReturnText === '—'
    && unknownView157.targetStateLabel === 'نتیجه نامعلوم');

  const coreSrc157 = readSrc('../core/portfolio-dossier-analysis.mjs');
  check('تحلیل پرونده قیمت یا بازار نمی‌خواند',
    !/walkBook|buildChain|portfolioSessionEligibility|lastPrice|closingPrice|fetch\(/.test(coreSrc157));
  const viewCode157 = readSrc('../ui/portfolio-dossier-analysis-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const arithmetic157 = viewCode157.match(/analysis\.[A-Za-z]+\s*[*+\-\/]\s*/g) || [];
  check('لایه نمایش جز تبدیل ریال به تومان حساب مالی ندارد',
    arithmetic157.length === 0 && /rial\s*\/\s*10/.test(viewCode157), arithmetic157.join('، '));
}
