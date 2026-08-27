// ۱۶۷. چرخه lineage سرمایه تا پرونده جلسه دوم

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  portfolioCapitalContinuity, validatePortfolioCapitalContinuity,
} from '../../core/portfolio-capital-continuity.mjs';
import {
  createPortfolioDossierSave, loadPortfolioDossierSave, restorePortfolioDossierSave,
  savePortfolioDossier,
} from '../../server/portfolio-dossier-store.mjs';
import {
  createPortfolioMissionSave, loadPortfolioMissionSave, restorePortfolioMissionSave,
  savePortfolioMissionDraft,
} from '../../server/portfolio-mission-store.mjs';
import {
  activatePortfolioMissionDraft, createPortfolioAllocationDraft,
  createPortfolioMissionDraft, createPortfolioOutlookDraft,
  createPortfolioRiskDraft, createPortfolioStepOneDraft,
} from '../../ui/portfolio-mission-form.mjs';
import {
  attachPortfolioCapitalContinuity, portfolioCapitalContinuityView,
} from '../../ui/portfolio-capital-continuity-view.mjs';
import { dossierRecordView } from '../../ui/portfolio-closeout-view.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

group('۱۶۷. چرخه lineage سرمایه تا پرونده جلسه دوم');
{
  const firstFx167 = portfolioFixture('lineage-167-first');
  const firstMission167 = firstFx167.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const firstClosed167 = closeoutPortfolioSession(
    firstMission167, firstFx167.evidence, { force: true },
  );
  const firstContinuity167 = portfolioCapitalContinuity(
    firstClosed167.session, firstClosed167.dossier,
  );

  const setup167 = createPortfolioStepOneDraft({
    id: 'lineage-167-second', baseIns: '900002',
    capitalToman: String(firstContinuity167.finalCapitalRial / 10), reserveToman: '0',
    startDate: 20260622, startSecond: 9 * 3600,
    endDate: 20260722, endSecond: 12 * 3600,
    grain: 'daily', createdAt: 167,
  });
  const attached167 = attachPortfolioCapitalContinuity(setup167.draft, firstContinuity167);
  const outlook167 = createPortfolioOutlookDraft(attached167.draft, {
    direction: 'bullish', targetPriceToman: '12000', rangeLowToman: '11000',
    rangeHighToman: '13000', volatilityView: 'higher', expectedVolatilityPct: '40',
    confidencePct: '70', thesis: 'آزمون چرخه دوم',
  });
  const risk167 = createPortfolioRiskDraft(outlook167.draft, {
    maxLossPct: '10', maxDrawdownPct: '20', minFreeCapitalPct: '10',
    maxMarginUsePct: '50', allowUnlimitedRisk: 'no',
    minUnderlyingDailyValueToman: '10000000', minOptionDailyValueToman: '1000000',
    minOpenInterest: '10', maxSpreadPct: '8', maxBookTakePct: '30',
    requireFullBook: 'no',
  });
  const allocation167 = createPortfolioAllocationDraft(risk167.draft, [
    { familyId: 'income', pct: '50' },
  ]);
  const mission167 = createPortfolioMissionDraft(allocation167.draft, {
    objectiveMode: 'growth', returnBase: 'initial',
    targetReturnPct: '10', maxHoldingDays: '20',
  });
  const snapshot167 = {
    quality: makeDataQuality({
      kind: 'observed', source: 'lineage-lifecycle-test',
      asOf: setup167.draft.session.start, sufficient: true,
    }),
  };
  const active167 = activatePortfolioMissionDraft(mission167.draft, snapshot167);
  const lifecycle167 = [attached167, outlook167, risk167, allocation167, mission167, active167];
  const continuityJson167 = JSON.stringify(firstContinuity167);

  check('قرارداد از setup تا active بدون تغییر JSON حمل می‌شود',
    lifecycle167.every((row) => row.ok
      && JSON.stringify(row.draft.capitalContinuity) === continuityJson167));
  check('جلسه دوم فقط continuity هم‌سرمایه و با دو شناسه تازه دارد', (() => {
    const session = active167.draft.session;
    const checked = validatePortfolioCapitalContinuity(active167.draft.capitalContinuity, {
      initialCapitalRial: session.capital.initialRial,
      sessionId: session.id,
      portfolioId: session.portfolioId,
    });
    return checked.ok && session.capital.initialRial === firstContinuity167.finalCapitalRial
      && session.id !== firstContinuity167.sourceSessionId
      && session.portfolioId !== firstContinuity167.sourcePortfolioId;
  })());

  const missionSaves167 = lifecycle167.map((row, index) => createPortfolioMissionSave(
    row.draft, { savedAt: 1_000 + index },
  ));
  check('سرور continuity را در همه مراحل و JSON round-trip صریح می‌پذیرد',
    missionSaves167.every((row) => row.ok
      && restorePortfolioMissionSave(JSON.parse(JSON.stringify(row.record))).ok
      && JSON.stringify(row.record.draft.capitalContinuity) === continuityJson167));
  check('نسخه ناشناخته، ردیف ناقص و منشأ دست‌کاری‌شده fail-closed هستند', (() => {
    const corruptions = [
      (row) => { row.draft.capitalContinuity.version = 99; },
      (row) => { delete row.draft.capitalContinuity.lineage[0].portfolioId; },
      (row) => { row.draft.capitalContinuity.sourceSessionId = 'tampered-source'; },
    ];
    return corruptions.every((corrupt) => {
      const row = structuredClone(missionSaves167[0].record);
      corrupt(row);
      return !restorePortfolioMissionSave(row).ok;
    });
  })());
  check('شناسه تکراری و پیوستگی سرمایه دست‌کاری‌شده رد می‌شوند', (() => {
    const duplicate = structuredClone(missionSaves167[0].record);
    duplicate.draft.capitalContinuity.lineage.push(
      structuredClone(duplicate.draft.capitalContinuity.lineage[0]),
    );
    const capital = structuredClone(missionSaves167[0].record);
    capital.draft.capitalContinuity.lineage[0].finalCapitalRial -= 1;
    return !restorePortfolioMissionSave(duplicate).ok
      && !restorePortfolioMissionSave(capital).ok;
  })());
  check('نبود continuity همچنان جلسه مستقل معتبر است',
    createPortfolioMissionSave(setup167.draft, { savedAt: 2_000 }).ok);

  const secondClosed167 = closeoutPortfolioSession(
    active167.draft.session, { ok: true, rows: [] }, { force: true },
  );
  const secondContinuity167 = portfolioCapitalContinuity(
    secondClosed167.session, secondClosed167.dossier,
    { previous: active167.draft.capitalContinuity },
  );
  check('بستن جلسه دوم lineage را قدیم به جدید و با اتصال دقیق سرمایه می‌سازد',
    secondContinuity167.ok && secondContinuity167.lineage.length === 2
    && secondContinuity167.lineage[0].sessionId === firstClosed167.session.id
    && secondContinuity167.lineage[1].sessionId === secondClosed167.session.id
    && secondContinuity167.lineage[0].finalCapitalRial
      === secondContinuity167.lineage[1].initialCapitalRial);

  const dossierSave167 = createPortfolioDossierSave(
    secondClosed167.session, secondClosed167.dossier,
    { savedAt: 3_000, capitalContinuity: firstContinuity167 },
  );
  const dossierRound167 = restorePortfolioDossierSave(
    JSON.parse(JSON.stringify(dossierSave167.record)),
  );
  check('پرونده دوم continuity قبلی را با اعتبارسنجی و JSON round-trip نگه می‌دارد',
    dossierSave167.ok && dossierRound167.ok
    && JSON.stringify(dossierRound167.record.capitalContinuity) === continuityJson167);
  check('continuity خراب در پرونده بی‌صدا حذف نمی‌شود', (() => {
    const row = structuredClone(dossierSave167.record);
    row.capitalContinuity.lineage[0].sessionId = row.session.id;
    return !restorePortfolioDossierSave(row).ok;
  })());

  const temp167 = fs.mkdtempSync(path.join(os.tmpdir(), 'options-radar-lineage-167-'));
  try {
    const missionDir = path.join(temp167, 'missions');
    const dossierDir = path.join(temp167, 'dossiers');
    const firstMissionSave167 = await savePortfolioMissionDraft(
      missionDir, attached167.draft, { savedAt: 4_000 },
    );
    const activeMissionSave167 = await savePortfolioMissionDraft(
      missionDir, active167.draft, { savedAt: 4_001, expectedSavedAt: 4_000 },
    );
    const loadedMission167 = await loadPortfolioMissionSave(
      missionDir, active167.draft.session.id,
    );
    check('فایل سرور continuity را تا active بدون تغییر نگه می‌دارد',
      firstMissionSave167.ok && activeMissionSave167.ok && loadedMission167.ok
      && JSON.stringify(loadedMission167.record.draft.capitalContinuity) === continuityJson167);

    const savedDossier167 = await savePortfolioDossier(
      dossierDir, secondClosed167.session, secondClosed167.dossier,
      { savedAt: 5_000, capitalContinuity: firstContinuity167 },
    );
    const loadedDossier167 = await loadPortfolioDossierSave(
      dossierDir, secondClosed167.session.id,
    );
    const restoredView167 = dossierRecordView(loadedDossier167.record);
    const continuityView167 = portfolioCapitalContinuityView(
      restoredView167.session, restoredView167.dossier,
      { previous: restoredView167.capitalContinuity },
    );
    check('refresh پرونده دوم هر دو سفر را در کارت lineage برمی‌گرداند',
      savedDossier167.ok && loadedDossier167.ok && restoredView167.ok
      && continuityView167.ok && continuityView167.lineageRows.length === 2
      && continuityView167.lineageRows[0].sessionText.includes('lineage-۱۶۷-first')
      && continuityView167.lineageRows[1].sessionText.includes('lineage-۱۶۷-second'));
  } finally {
    fs.rmSync(temp167, { recursive: true, force: true });
  }

  const tab167 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب previous معتبر را هم هنگام ذخیره و هم هنگام بازیابی مصرف می‌کند',
    tab167.includes('capitalContinuity: draft.capitalContinuity')
    && tab167.includes('previous: view.capitalContinuity')
    && tab167.includes('...dossierContinuity.lineageRows.map'));
}
