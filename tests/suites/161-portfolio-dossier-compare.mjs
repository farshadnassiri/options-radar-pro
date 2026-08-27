// ۱۶۱. مقایسهٔ دو پروندهٔ پیاپی

import { check, group, near, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { portfolioDossierComparison } from '../../core/portfolio-dossier-compare.mjs';
import { portfolioDossierComparisonView } from '../../ui/portfolio-dossier-compare-view.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

group('۱۶۱. مقایسهٔ دو پروندهٔ پیاپی');
{
  const oldFx161 = portfolioFixture('compare-old-161');
  const newFx161 = portfolioFixture('compare-new-161');
  const oldClosed161 = closeoutPortfolioSession(
    oldFx161.sessionWith(BULLISH_OUTLOOK, WIDE_RISK), oldFx161.evidence,
    { at: { date: 20260620, second: 12 * 3600 } },
  );
  const newClosed161 = closeoutPortfolioSession(
    newFx161.sessionWith(BULLISH_OUTLOOK, WIDE_RISK), newFx161.evidence,
    { at: { date: 20260621, second: 12 * 3600 } },
  );
  const oldDossier161 = clone(oldClosed161.dossier);
  const newDossier161 = clone(newClosed161.dossier);
  oldDossier161.realized.totalRial = 1_000_000;
  newDossier161.realized.totalRial = 2_000_000;
  oldDossier161.alerts = [
    { code: 'old-limit', label: 'قید قدیمی', state: 'breached', stateLabel: 'شکسته' },
    { code: 'shared-limit', label: 'عنوان قدیمی مشترک', state: 'near', stateLabel: 'نزدیک' },
  ];
  newDossier161.alerts = [
    { code: 'shared-limit', label: 'متن کاملاً تازه برای همان کد', state: 'near', stateLabel: 'نزدیک' },
    { code: 'new-limit', label: 'قید تازه', state: 'breached', stateLabel: 'شکسته' },
    { code: 'quality', label: 'کیفیت', state: 'unknown', stateLabel: 'نامعلوم' },
  ];

  const compared161 = portfolioDossierComparison(
    oldClosed161.session, oldDossier161, newClosed161.session, newDossier161,
  );
  check('دو پرونده معتبر فقط با ترتیب قدیمی به جدید پذیرفته می‌شوند', compared161.ok,
    compared161.why);
  check('هویت هر دو پرونده و یکسانی نماد پایه می‌ماند',
    compared161.older.sessionId === oldClosed161.session.id
    && compared161.newer.sessionId === newClosed161.session.id
    && compared161.older.closedAt.date === 20260620
    && compared161.newer.closedAt.date === 20260621
    && compared161.sameBaseIns === true);
  check('بازده هر طرف و دلتا جداست',
    near(compared161.metrics.realizedReturnPct.older, 10)
    && near(compared161.metrics.realizedReturnPct.newer, 20)
    && near(compared161.metrics.realizedReturnPct.delta, 10));
  check('فاصله از هدف هر طرف و دلتا جداست',
    near(compared161.metrics.targetGapPct.older, -15)
    && near(compared161.metrics.targetGapPct.newer, -5)
    && near(compared161.metrics.targetGapPct.delta, 10));
  check('شمار هر شدت، قدیمی و جدید و دلتا دارد',
    ['critical', 'warning', 'notice'].every((severity) => {
      const row = compared161.metrics.severityCounts[severity];
      return Number.isInteger(row.older) && Number.isInteger(row.newer)
        && Number.isInteger(row.delta);
    }) && compared161.metrics.severityCounts.notice.delta === 1);
  check('یافته افزوده و دیگر ثبت‌نشده با کد پایدار جدا می‌شوند',
    compared161.findings.added.includes('risk-breached:new-limit')
    && compared161.findings.added.includes('risk-unknown:quality')
    && compared161.findings.resolved.includes('risk-breached:old-limit'));
  check('تفاوت متن و ترتیب، یافته مشترک را تازه نمی‌کند',
    compared161.findings.shared.includes('risk-near:shared-limit')
    && !compared161.findings.added.includes('risk-near:shared-limit')
    && [...compared161.findings.added].sort((a, b) => a.localeCompare(b))
      .every((code, index) => code === compared161.findings.added[index]));

  const unknownOld161 = clone(oldDossier161);
  unknownOld161.realized.totalRial = null;
  unknownOld161.realized.unknown = ['missing-161'];
  const unknown161 = portfolioDossierComparison(
    oldClosed161.session, unknownOld161, newClosed161.session, newDossier161,
  );
  check('بازده نامعلوم صفر نمی‌شود و دلتا نمی‌گیرد',
    unknown161.metrics.realizedReturnPct.older === null
    && unknown161.metrics.realizedReturnPct.delta === null
    && unknown161.metrics.realizedReturnPct.newer !== null);
  check('فاصله هدف نامعلوم نیز دلتا نمی‌گیرد',
    unknown161.metrics.targetGapPct.older === null
    && unknown161.metrics.targetGapPct.delta === null);
  check('ترتیب وارونه رد می‌شود',
    !portfolioDossierComparison(
      newClosed161.session, newDossier161, oldClosed161.session, oldDossier161,
    ).ok);
  check('نسخه و هویت ناسازگار رد می‌شوند', (() => {
    const badVersion = clone(oldDossier161), badId = clone(newDossier161);
    badVersion.version = 99;
    badId.sessionId = 'other-161';
    return !portfolioDossierComparison(
      oldClosed161.session, badVersion, newClosed161.session, newDossier161,
    ).ok && !portfolioDossierComparison(
      oldClosed161.session, oldDossier161, newClosed161.session, badId,
    ).ok;
  })());
  check('تفاوت نماد پایه صریح می‌ماند', (() => {
    const otherBase = clone(newClosed161.session);
    otherBase.baseIns = '900002';
    return portfolioDossierComparison(
      oldClosed161.session, oldDossier161, otherBase, newDossier161,
    ).sameBaseIns === false;
  })());

  const shown161 = portfolioDossierComparisonView(compared161);
  check('نمایش درصد و رقم فارسی دارد',
    shown161.ok && shown161.rows.slice(0, 2).every((row) => row.olderText.endsWith('٪'))
    && shown161.rows.some((row) => row.deltaText.startsWith('+'))
    && !/[0-9]/.test(shown161.rows.map((row) => `${row.olderText}${row.newerText}${row.deltaText}`).join('')));
  const unknownShown161 = portfolioDossierComparisonView(unknown161);
  check('نمایش دلتا نامعلوم خط تیره است',
    unknownShown161.rows.find((row) => row.key === 'realized-return')?.deltaText === '—');
  check('نمایش فقط افزایش و کاهش یا ثبت‌شدن را توصیف می‌کند', (() => {
    const source = readSrc('../ui/portfolio-dossier-compare-view.mjs')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return !/بهتر|بدتر|علت/.test(source)
      && shown161.rows.every((row) => /افزایش|کاهش|بدون تغییر|نامعلوم/.test(row.changeLabel));
  })());

  const tab161 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('کارت مقایسه و خانه‌هایش داخل پرونده هستند',
    ['pt-dossier-compare', 'pt-dossier-compare-title', 'pt-dossier-compare-state',
      'pt-dossier-compare-identities', 'pt-dossier-compare-metrics',
      'pt-dossier-compare-findings'].every((id) => tab161.includes(`id="${id}"`)));
  check('تب نزدیک‌ترین پرونده قدیمی‌تر را از خلاصه‌ها پیدا می‌کند',
    /momentKey\(row\.closedAt\)\s*<\s*currentKey/.test(tab161)
    && /momentKey\(right\.closedAt\)\s*-\s*momentKey\(left\.closedAt\)/.test(tab161));
  check('پرونده قبلی فقط از مرز داده خوانده می‌شود',
    /await loadDossier\(previous\.id\)/.test(tab161)
    && /portfolioDossierComparison\(/.test(tab161)
    && !/fetch\(/.test(tab161.slice(
      tab161.indexOf('async function paintPreviousDossierComparison'),
      tab161.indexOf("$('pt-closeout').onclick"),
    )));
  check('خطای مقایسه پس از رسم پرونده فعلی مستقل می‌ماند',
    tab161.indexOf('void paintPreviousDossierComparison(view)') > tab161.indexOf("$('pt-closeout-body').innerHTML")
    && /if \(!loaded\.ok\) \{[\s\S]*?return;[\s\S]*?const older/.test(tab161));
  check('کد یافته فقط برای ممیزی است و به کاربر نشان داده نمی‌شود',
    /data-code="\$\{esc\(row\.code\)\}"/.test(tab161)
    && !/>\$\{esc\(row\.code\)\}</.test(tab161));

  const css161 = readSrc('../ui/style.css');
  check('کارت مقایسه در موبایل یک ستون و بدون عرض اجباری است',
    /\.pt-dossier-compare \{ min-width: 0;/.test(css161)
    && /\.pt-dossier-compare-identities, \.pt-dossier-compare-metrics,\n\s*\.pt-dossier-compare-findings \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css161));
  check('کارت مقایسه کنترل تعاملی تازه ندارد',
    !/<(?:button|input|select)[^>]*pt-dossier-compare/.test(tab161));
}
