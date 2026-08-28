// ۱۷۸. سفر یکپارچه استودیو تا Excel و جلسه بعد

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { check, group } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { stepPortfolioSession } from '../../core/portfolio-clock.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioCapitalLedger } from '../../core/portfolio-ledger.mjs';
import { portfolioSessionPositions } from '../../core/portfolio-positions.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { portfolioMomentSnapshot } from '../../core/portfolio-snapshot.mjs';
import {
  loadPortfolioDossierSave, savePortfolioDossier,
} from '../../server/portfolio-dossier-store.mjs';
import {
  loadPortfolioMissionSave, savePortfolioMissionDraft,
} from '../../server/portfolio-mission-store.mjs';
import {
  attachPortfolioCapitalContinuity, portfolioCapitalContinuityView,
} from '../../ui/portfolio-capital-continuity-view.mjs';
import {
  downloadPortfolioDossier, portfolioDossierWorkbook,
} from '../../ui/portfolio-dossier-export.mjs';
import {
  activatePortfolioMissionDraft, createPortfolioAllocationDraft,
  createPortfolioMissionDraft, createPortfolioOutlookDraft,
  createPortfolioRiskDraft, createPortfolioStepOneDraft,
} from '../../ui/portfolio-mission-form.mjs';
import { resumeMissionRecord } from '../../ui/portfolio-mission-resume.mjs';
import { buildXlsx } from '../../ui/xlsx.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';

const clone = (value) => structuredClone(value);

group('۱۷۸. سفر یکپارچه استودیو تا Excel و جلسه بعد');
{
  const fx178 = portfolioFixture('final-browser-journey-178');
  const id178 = `final-browser-journey-178-${process.pid}`;
  const setup178 = createPortfolioStepOneDraft({
    id: id178, baseIns: fx178.baseSession.baseIns,
    capitalToman: '1000000000', reserveToman: '0',
    startDate: fx178.at.date, startSecond: fx178.at.second,
    endDate: 20260620, endSecond: 12 * 3600,
    grain: 'halfHour', createdAt: 178,
  });
  const outlook178 = createPortfolioOutlookDraft(setup178.draft, {
    direction: 'bullish', targetPriceToman: '1140',
    rangeLowToman: '', rangeHighToman: '', volatilityView: 'higher',
    expectedVolatilityPct: '35', confidencePct: '70',
    thesis: 'پذیرش یکپارچه سفر از فرم تا جلسه بعد',
  });
  const risk178 = createPortfolioRiskDraft(outlook178.draft, {
    maxLossPct: '50', maxDrawdownPct: '60', minFreeCapitalPct: '10',
    maxMarginUsePct: '40', allowUnlimitedRisk: 'yes',
    minUnderlyingDailyValueToman: '10000000',
    minOptionDailyValueToman: '1000000', minOpenInterest: '100',
    maxSpreadPct: '8', maxBookTakePct: '50', requireFullBook: 'no',
  });
  const allocation178 = createPortfolioAllocationDraft(risk178.draft, [
    { familyId: 'single', pct: '30' },
    { familyId: 'vertical', pct: '40' },
    { familyId: 'vol', pct: '30' },
  ]);
  const mission178 = createPortfolioMissionDraft(allocation178.draft, {
    objectiveMode: 'growth', returnBase: 'initial',
    targetReturnPct: '18', maxHoldingDays: '30',
  });
  const quality178 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history',
    asOf: fx178.at, sufficient: true,
  });
  const activated178 = activatePortfolioMissionDraft(mission178.draft, {
    quality: quality178,
    spot: fx178.baseSession.startSnapshot.spot,
    contracts: fx178.contracts,
    capitalInputs: fx178.capitalInputs,
  });
  const active178 = activated178.draft;
  const plans178 = portfolioRankedPlans(active178.session, fx178.evidence);
  const candidate178 = plans178.ranking?.ranked?.[0]?.candidateId || '';
  const opened178 = commitPortfolioPlan(active178.session, fx178.evidence,
    candidate178, { quantity: 3 });

  check('فرم یک میلیارد تومان تا active با تخصیص ۳۰/۴۰/۳۰ کامل می‌شود',
    setup178.ok && outlook178.ok && risk178.ok && allocation178.ok
    && mission178.ok && activated178.ok
    && active178.session.capital.initialRial === 10_000_000_000
    && active178.session.lockedAllocations.map((row) => row.pct).join('/') === '30/40/30');
  check('پیشنهاد اجراپذیر با حجم صریح و همه شناسه‌های دفتر ثبت می‌شود',
    plans178.ok && opened178.ok && opened178.event.qty === 3
    && opened178.positionId && opened178.transactionId && opened178.lotId
    && opened178.executionIds.every(Boolean), opened178.why || plans178.why);

  const days178 = [20260521, 20260524, 20260525, 20260526, 20260620];
  const stepped178 = stepPortfolioSession(opened178.session, 'm15', { days: days178 });
  const rowsAt178 = fx178.contracts.map((contract) => ({
    ins: contract.ins, kind: contract.kind, strike: contract.strike,
    expiry: contract.expiry, size: contract.size,
    book: contract.quote.book.map((level) => ({ ...level, second: stepped178.to.second })),
    close: contract.quote.close,
  }));
  const snapshot178 = portfolioMomentSnapshot(stepped178.session, stepped178.to, {
    spot: fx178.baseSession.startSnapshot.spot + 50, rows: rowsAt178,
  });
  const moved178 = { ...stepped178.session, momentSnapshot: snapshot178.snapshot };
  const movedEvidence178 = clone(fx178.evidence);
  movedEvidence178.now = { ...moved178.now };
  const increased178 = commitPortfolioPlan(moved178, movedEvidence178, candidate178, {
    quantity: 2, positionId: opened178.positionId, operationId: 'journey-178-increase',
  });
  const reduced178 = closePortfolioPosition(increased178.session, movedEvidence178,
    opened178.positionId, { qty: 4 });
  const offset178 = closePortfolioPosition(reduced178.session, movedEvidence178,
    opened178.positionId);
  const finalPosition178 = portfolioSessionPositions(offset178.session);
  const finalLedger178 = portfolioCapitalLedger(offset178.session);

  check('حرکت، افزایش، کاهش FIFO و آفست کامل در یک مسیر انجام می‌شوند',
    stepped178.ok && snapshot178.ok && increased178.ok && reduced178.ok && offset178.ok
    && reduced178.event.consumedLots.length === 2
    && reduced178.event.consumedLots[0].lotId === opened178.lotId
    && reduced178.event.consumedLots[1].lotId === increased178.lotId
    && finalPosition178.closed.length === 1 && finalLedger178.committed.totalRial === 0,
    offset178.why || reduced178.why || increased178.why);

  const end178 = { ...active178.session.end };
  const endQuality178 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: end178, sufficient: true,
  });
  const endContracts178 = fx178.contracts.map((contract, index) => ({
    ...contract,
    quote: {
      ...contract.quote,
      book: contract.quote.book.map((level) => ({
        ...level,
        bid: level.bid + (index % 3) * 8,
        ask: level.ask + (index % 3) * 8,
        second: end178.second,
      })),
      quality: endQuality178,
    },
  }));
  const atEnd178 = {
    ...offset178.session,
    now: end178,
    momentSnapshot: {
      at: end178, spot: fx178.baseSession.startSnapshot.spot,
      contracts: endContracts178, capitalInputs: fx178.capitalInputs,
      quality: endQuality178,
    },
  };
  const endEvidence178 = clone(fx178.evidence);
  endEvidence178.now = end178;
  const out178 = closeoutPortfolioSession(atEnd178, endEvidence178, {
    at: end178, startEvidence: fx178.evidence,
  });
  check('پایان، سرمایه قطعی و رتبه انتخاب روی همان دفتر ساخته می‌شوند',
    out178.ok && out178.dossier.finalRanking.ok
    && out178.dossier.finalRanking.selected.length === 1
    && out178.dossier.finalRanking.best && out178.dossier.finalRanking.worst
    && Number.isFinite(out178.dossier.realized.totalRial), out178.why);

  const root178 = await fs.mkdtemp(path.join(os.tmpdir(), 'options-radar-final-journey-'));
  const missionDir178 = path.join(root178, 'missions');
  const dossierDir178 = path.join(root178, 'dossiers');
  let xlsx178 = null;
  try {
    const missionSave178 = await savePortfolioMissionDraft(missionDir178, {
      ...active178, session: atEnd178, snapshot: atEnd178.startSnapshot,
    }, { savedAt: 1_000 });
    const missionLoad178 = await loadPortfolioMissionSave(missionDir178, id178);
    const missionResume178 = missionLoad178.ok ? resumeMissionRecord(missionLoad178.record) : missionLoad178;
    check('refresh میانی همه هویت‌ها، شمارنده‌ها، ساعت و snapshot را عیناً برمی‌گرداند',
      missionSave178.ok && missionLoad178.ok && missionResume178.ok
      && JSON.stringify(missionLoad178.record.draft.session.events)
        === JSON.stringify(atEnd178.events)
      && JSON.stringify(missionLoad178.record.draft.session.counters)
        === JSON.stringify(atEnd178.counters)
      && JSON.stringify(missionLoad178.record.draft.session.momentSnapshot)
        === JSON.stringify(atEnd178.momentSnapshot));

    const dossierSave178 = await savePortfolioDossier(
      dossierDir178, out178.session, out178.dossier, { savedAt: 2_000 },
    );
    const dossierLoad178 = await loadPortfolioDossierSave(dossierDir178, id178);
    const restored178 = dossierLoad178.record;
    check('refresh پایان همان یک پرونده و همان رتبه‌ها را برمی‌گرداند',
      dossierSave178.ok && dossierLoad178.ok
      && JSON.stringify(restored178.session.events) === JSON.stringify(out178.session.events)
      && JSON.stringify(restored178.dossier.finalRanking)
        === JSON.stringify(out178.dossier.finalRanking));

    const continuityView178 = portfolioCapitalContinuityView(
      restored178.session, restored178.dossier,
    );
    const book178 = portfolioDossierWorkbook(restored178.session, restored178.dossier, {
      generatedAt: 178_178, capitalContinuity: continuityView178.continuity,
    });
    const download178 = await downloadPortfolioDossier(
      restored178.session, restored178.dossier, {
        generatedAt: 178_178,
        capitalContinuity: continuityView178.continuity,
        downloadImpl: async (_name, sheets) => {
          xlsx178 = await buildXlsx(sheets);
          return xlsx178.length;
        },
      },
    );
    check('دانلود از پرونده بازیابی‌شده فایل کامل و فشرده می‌سازد',
      continuityView178.available && book178.ok && download178.ok
      && xlsx178?.[0] === 0x50 && xlsx178.length < 80_000
      && book178.sheets.some((row) => row.name === 'رتبه نهایی')
      && book178.sheets.some((row) => row.name === 'لات‌های FIFO'));

    const nextId178 = `${id178}-next`;
    const nextSetup178 = createPortfolioStepOneDraft({
      id: nextId178, baseIns: '900002',
      capitalToman: continuityView178.capitalInputText, reserveToman: '0',
      startDate: 20260621, startSecond: 10 * 3600,
      endDate: 20260721, endSecond: 12 * 3600,
      grain: 'daily', createdAt: 179,
    });
    const attached178 = attachPortfolioCapitalContinuity(
      nextSetup178.draft, continuityView178.continuity,
    );
    const nextSave178 = await savePortfolioMissionDraft(
      missionDir178, attached178.draft, { savedAt: 3_000 },
    );
    const nextLoad178 = await loadPortfolioMissionSave(missionDir178, nextId178);
    check('جلسه دوم فقط با سرمایه قطعی و lineage همان پرونده ذخیره و بازیابی می‌شود',
      nextSetup178.ok && attached178.ok && nextSave178.ok && nextLoad178.ok
      && nextLoad178.record.draft.session.id === nextId178
      && nextLoad178.record.draft.session.portfolioId !== out178.session.portfolioId
      && nextLoad178.record.draft.session.capital.initialRial
        === continuityView178.continuity.finalCapitalRial
      && JSON.stringify(nextLoad178.record.draft.capitalContinuity)
        === JSON.stringify(continuityView178.continuity));
  } finally {
    await fs.rm(root178, { recursive: true, force: true });
  }
  check('همه فایل‌های مأموریت، پرونده و Excel موقت دقیقاً پاک می‌شوند',
    await fs.access(root178).then(() => false, () => true));
}
