// ۱۶۸. مدل رشد سرمایه چندجلسه‌ای و کارت روند

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  PORTFOLIO_CAPITAL_CONTINUITY_VERSION, portfolioCapitalContinuity,
} from '../../core/portfolio-capital-continuity.mjs';
import {
  PORTFOLIO_CAPITAL_GROWTH_VERSION, portfolioCapitalGrowth,
} from '../../core/portfolio-capital-growth.mjs';
import { createPortfolioDossierSave } from '../../server/portfolio-dossier-store.mjs';
import { portfolioCapitalContinuityView } from '../../ui/portfolio-capital-continuity-view.mjs';
import { portfolioCapitalGrowthView } from '../../ui/portfolio-capital-growth-view.mjs';
import { dossierRecordView } from '../../ui/portfolio-closeout-view.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

function continuity168(points) {
  const lineage = points.map(([initialCapitalRial, finalCapitalRial], index) => ({
    sessionId: `growth-168-session-${index + 1}`,
    portfolioId: `growth-168-portfolio-${index + 1}`,
    baseIns: String(900_000 + index),
    closedAt: { date: 20260801 + index, second: 36_000 + index },
    initialCapitalRial,
    realizedRial: finalCapitalRial - initialCapitalRial,
    finalCapitalRial,
  }));
  const last = lineage.at(-1);
  return {
    version: PORTFOLIO_CAPITAL_CONTINUITY_VERSION,
    ok: true,
    why: '',
    reason: null,
    state: last.finalCapitalRial === 0 ? 'exhausted' : 'ready',
    analysisVersion: 1,
    sourceSessionId: last.sessionId,
    sourcePortfolioId: last.portfolioId,
    baseIns: last.baseIns,
    closedAt: { ...last.closedAt },
    initialCapitalRial: last.initialCapitalRial,
    realizedRial: last.realizedRial,
    finalCapitalRial: last.finalCapitalRial,
    lineage,
  };
}

group('۱۶۸. مدل رشد سرمایه چندجلسه‌ای و کارت روند');
{
  const single168 = portfolioCapitalGrowth(continuity168([[1_000, 1_200]]));
  check('پرونده مستقل یک نقطه نسخه‌دار با هویت و سرمایه کامل می‌سازد',
    single168.ok && single168.version === PORTFOLIO_CAPITAL_GROWTH_VERSION
    && single168.rows.length === 1
    && single168.rows[0].sessionId === 'growth-168-session-1'
    && single168.rows[0].portfolioId === 'growth-168-portfolio-1'
    && single168.rows[0].initialCapitalRial === 1_000
    && single168.rows[0].realizedRial === 200
    && single168.rows[0].finalCapitalRial === 1_200);
  check('تغییر سفر و تجمعی فقط در مدل هسته محاسبه می‌شوند',
    single168.rows[0].changeRial === 200 && single168.rows[0].changePct === 20
    && single168.rows[0].cumulativeChangeRial === 200
    && single168.rows[0].cumulativeChangePct === 20);
  check('رشد، افت و بدون تغییر وضعیت صریح دارند', (() => {
    const growth = portfolioCapitalGrowth(continuity168([[100, 120]])).rows[0];
    const decline = portfolioCapitalGrowth(continuity168([[100, 80]])).rows[0];
    const flat = portfolioCapitalGrowth(continuity168([[100, 100]])).rows[0];
    return growth.state === 'growth' && decline.state === 'decline' && flat.state === 'flat';
  })());

  const two168 = portfolioCapitalGrowth(continuity168([[1_000, 1_200], [1_200, 900]]));
  check('دو سفر قدیم به جدید می‌مانند و افت دوم از پایه خودش سنجیده می‌شود',
    two168.ok && two168.rows.length === 2
    && two168.rows[0].sessionId.endsWith('-1') && two168.rows[1].sessionId.endsWith('-2')
    && two168.rows[1].changeRial === -300 && two168.rows[1].changePct === -25);
  check('تغییر تجمعی آخر نسبت به سرمایه شروع نخست است',
    two168.changeRial === -100 && two168.changePct === -10
    && two168.state === 'decline'
    && two168.rows[1].cumulativeChangeRial === -100
    && two168.rows[1].cumulativeChangePct === -10);

  const three168 = portfolioCapitalGrowth(
    continuity168([[1_000, 1_200], [1_200, 900], [900, 900]]),
  );
  check('continuity سه‌سفره سه نقطه با شناسه، نماد و لحظه خودش می‌سازد',
    three168.ok && three168.rows.length === 3
    && three168.rows.every((row, index) => row.index === index + 1
      && row.baseIns === String(900_000 + index)
      && row.closedAt.date === 20260801 + index)
    && three168.rows[2].state === 'flat');

  const zero168 = portfolioCapitalGrowth(continuity168([[0, 100]]));
  check('سرمایه شروع صفر مبلغ و وضعیت را نگه می‌دارد اما درصد نمی‌سازد',
    zero168.ok && zero168.state === 'growth' && zero168.changeRial === 100
    && zero168.changePct === null && zero168.percentageWhy.includes('صفر')
    && zero168.rows[0].changePct === null
    && zero168.rows[0].cumulativeChangePct === null);
  check('نسخه خراب و گسست سرمایه fail-closed و بدون ردیف نیمه‌معتبرند', (() => {
    const version = continuity168([[100, 120]]);
    version.version = 99;
    const gap = continuity168([[100, 120], [120, 140]]);
    gap.lineage[1].initialCapitalRial = 119;
    const invalid = [portfolioCapitalGrowth(version), portfolioCapitalGrowth(gap)];
    return invalid.every((row) => !row.ok && row.reason === 'invalidContinuity'
      && row.rows.length === 0 && row.changePct === null);
  })());

  const growthView168 = portfolioCapitalGrowthView(three168);
  check('مدل نمایش مبلغ، درصد و شناسه‌ها را با رقم فارسی آماده می‌کند',
    growthView168.ok && growthView168.rows.length === 3
    && growthView168.rows[0].changeText.includes('۲۰')
    && growthView168.rows[1].changePctText.includes('۲۵')
    && growthView168.rows[2].sessionText.includes('۱۶۸')
    && !/[0-9]/.test(growthView168.summaryText + growthView168.rows[0].closedAtText));
  check('مدل نمایش برای درصد نامعلوم خط تیره و علت صریح دارد', (() => {
    const view = portfolioCapitalGrowthView(zero168);
    return view.ok && view.changePctText === '—' && view.percentageWhy.includes('صفر')
      && view.rows[0].changePctText === '—' && view.rows[0].percentageWhy.includes('صفر');
  })());
  check('ورودی خراب کارت یا درصد نیمه‌معتبر نمی‌سازد', (() => {
    const view = portfolioCapitalGrowthView(portfolioCapitalGrowth({}));
    return !view.ok && view.rows.length === 0 && view.summaryText.includes('دسترس نیست');
  })());

  const firstFx168 = portfolioFixture('growth-168-restored-first');
  const firstClosed168 = closeoutPortfolioSession(
    firstFx168.sessionWith(BULLISH_OUTLOOK, WIDE_RISK), firstFx168.evidence, { force: true },
  );
  const firstContinuity168 = portfolioCapitalContinuity(
    firstClosed168.session, firstClosed168.dossier,
  );
  const secondFx168 = portfolioFixture('growth-168-restored-second');
  const secondSession168 = structuredClone(secondFx168.sessionWith(BULLISH_OUTLOOK, WIDE_RISK));
  secondSession168.capital.initialRial = firstContinuity168.finalCapitalRial;
  const secondClosed168 = closeoutPortfolioSession(
    secondSession168, secondFx168.evidence, { force: true },
  );
  const saved168 = createPortfolioDossierSave(
    secondClosed168.session, secondClosed168.dossier,
    { savedAt: 168, capitalContinuity: firstContinuity168 },
  );
  const restored168 = dossierRecordView(JSON.parse(JSON.stringify(saved168.record)));
  const continuityView168 = portfolioCapitalContinuityView(
    restored168.session, restored168.dossier,
    { previous: restored168.capitalContinuity },
  );
  const restoredGrowth168 = portfolioCapitalGrowth(continuityView168.continuity);
  check('پرونده دوم بازیابی‌شده دو سفر واقعی را به مدل روند وصل می‌کند',
    saved168.ok && restored168.ok && continuityView168.ok && restoredGrowth168.ok
    && restoredGrowth168.rows.length === 2
    && restoredGrowth168.rows[0].sessionId === firstClosed168.session.id
    && restoredGrowth168.rows[1].sessionId === secondClosed168.session.id);

  const tab168 = readSrc('../ui/tabs/portfolio-time.mjs');
  const css168 = readSrc('../ui/style.css');
  check('تب مدل هسته و نمایش را مصرف می‌کند و محاسبه درصد مالی ندارد',
    tab168.includes('portfolioCapitalGrowth(dossierContinuity.continuity)')
    && tab168.includes('portfolioCapitalGrowthView(')
    && tab168.includes('pt-capital-growth-rows'));
  check('بازیابی پرونده کارت مرحله مرور و روند را واقعاً آشکار می‌کند',
    tab168.includes('reviewStep.hidden = false;\n      paintProgress(\'active\');')
    && tab168.includes('paintDossier(restored);'));
  check('کارت روند در موبایل تک‌ستونه و رنگ‌ها فقط از توکن‌اند',
    css168.includes('.pt-capital-growth-rows')
    && css168.includes('.pt-capital-growth-rows, .pt-capital-growth-rows dl { grid-template-columns: minmax(0, 1fr); }')
    && css168.includes('var(--gain)') && css168.includes('var(--loss)'));
}
