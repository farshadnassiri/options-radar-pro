// ۱۷۵. حرکت مسیر، تغییر حجم، آفست و ماندگاری پس از refresh

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { check, group, near, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { stepPortfolioSession } from '../../core/portfolio-clock.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioCapitalLedger } from '../../core/portfolio-ledger.mjs';
import { portfolioSessionPositions } from '../../core/portfolio-positions.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { portfolioMomentSnapshot } from '../../core/portfolio-snapshot.mjs';
import { portfolioSessionValuation } from '../../core/portfolio-valuation.mjs';
import {
  loadPortfolioMissionSave, savePortfolioMissionDraft,
} from '../../server/portfolio-mission-store.mjs';
import { portfolioSessionEligibility } from '../../ui/portfolio-eligibility.mjs';
import {
  activatePortfolioMissionDraft, createPortfolioAllocationDraft,
  createPortfolioMissionDraft, createPortfolioOutlookDraft,
  createPortfolioRiskDraft, createPortfolioStepOneDraft,
} from '../../ui/portfolio-mission-form.mjs';
import { resumeMissionRecord } from '../../ui/portfolio-mission-resume.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';

group('۱۷۵. حرکت مسیر، تغییر حجم، آفست و ماندگاری پس از refresh');
{
  const fx175 = portfolioFixture('path-adjust-175');
  const id175 = `path-adjust-175-${process.pid}`;
  const setup175 = createPortfolioStepOneDraft({
    id: id175, baseIns: fx175.baseSession.baseIns,
    capitalToman: '1000000000', reserveToman: '0',
    startDate: fx175.at.date, startSecond: fx175.at.second,
    endDate: 20260620, endSecond: 12 * 3600,
    grain: 'halfHour', createdAt: 175,
  });
  const outlook175 = createPortfolioOutlookDraft(setup175.draft, {
    direction: 'bullish', targetPriceToman: '1140',
    rangeLowToman: '', rangeHighToman: '', volatilityView: 'higher',
    expectedVolatilityPct: '35', confidencePct: '70',
    thesis: 'حرکت، تغییر حجم و آفست قابل بازپخش',
  });
  const risk175 = createPortfolioRiskDraft(outlook175.draft, {
    maxLossPct: '50', maxDrawdownPct: '60', minFreeCapitalPct: '10',
    maxMarginUsePct: '40', allowUnlimitedRisk: 'yes',
    minUnderlyingDailyValueToman: '10000000',
    minOptionDailyValueToman: '1000000', minOpenInterest: '100',
    maxSpreadPct: '8', maxBookTakePct: '50', requireFullBook: 'no',
  });
  const allocation175 = createPortfolioAllocationDraft(risk175.draft, [
    { familyId: 'single', pct: '30' },
    { familyId: 'vertical', pct: '40' },
    { familyId: 'vol', pct: '30' },
  ]);
  const mission175 = createPortfolioMissionDraft(allocation175.draft, {
    objectiveMode: 'growth', returnBase: 'initial',
    targetReturnPct: '18', maxHoldingDays: '30',
  });
  const quality175 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history',
    asOf: fx175.at, sufficient: true,
  });
  const activated175 = activatePortfolioMissionDraft(mission175.draft, {
    quality: quality175,
    spot: fx175.baseSession.startSnapshot.spot,
    contracts: fx175.contracts,
    capitalInputs: fx175.capitalInputs,
  });
  const active175 = activated175.draft;
  const startEvidence175 = fx175.evidence;
  const plans175 = portfolioRankedPlans(active175.session, startEvidence175);
  const candidate175 = plans175.ranking?.ranked?.[0]?.candidateId || '';
  const opened175 = commitPortfolioPlan(active175.session, startEvidence175,
    candidate175, { quantity: 3 });

  check('پیش‌شرط: جلسه یک‌میلیاردی و ورود سه‌واحدی ساخته می‌شود',
    activated175.ok && startEvidence175.ok && plans175.ok && opened175.ok
    && opened175.event.qty === 3, opened175.why || plans175.why);

  const days175 = [20260521, 20260524, 20260525, 20260526, 20260620];
  const stepped175 = stepPortfolioSession(opened175.session, 'm15', { days: days175 });
  const rows175 = fx175.contracts.map((contract) => ({
    ins: contract.ins, kind: contract.kind, strike: contract.strike,
    expiry: contract.expiry, size: contract.size,
    book: contract.quote.book.map((level) => ({ ...level, second: stepped175.to.second })),
    close: contract.quote.close,
  }));
  const snapshot175 = portfolioMomentSnapshot(stepped175.session, stepped175.to, {
    spot: fx175.baseSession.startSnapshot.spot + 50, rows: rows175,
  });
  const moved175 = {
    ...stepped175.session,
    momentSnapshot: snapshot175.snapshot,
  };
  const movedEvidence175 = JSON.parse(JSON.stringify(fx175.evidence));
  movedEvidence175.now = { ...moved175.now };

  check('ساعت فقط جلو می‌رود و عکس تازه دقیقاً هم‌لحظه آن است',
    stepped175.ok && snapshot175.ok && movedEvidence175.ok
    && moved175.now.second > opened175.session.now.second
    && moved175.momentSnapshot.at.second === moved175.now.second,
    stepped175.why || snapshot175.why || movedEvidence175.why);
  check('عکس ناقص با قیمت قبلی پر نمی‌شود و معامله‌ای نمی‌سازد', (() => {
    const missing = portfolioMomentSnapshot(stepped175.session, stepped175.to, {
      spot: null, rows: [],
    });
    const blind = { ...stepped175.session, momentSnapshot: missing.snapshot };
    const evidence = portfolioSessionEligibility(blind);
    const out = closePortfolioPosition(blind, evidence, opened175.positionId, { qty: 1 });
    return missing.ok && missing.snapshot.contracts.length === 0
      && missing.snapshot.spot === null && !out.ok
      && out.session === null && blind.events.length === opened175.session.events.length;
  })());

  const increased175 = commitPortfolioPlan(moved175, movedEvidence175, candidate175, {
    quantity: 2, positionId: opened175.positionId, operationId: 'adjust-175-increase',
  });
  const afterIncrease175 = portfolioSessionPositions(increased175.session);
  check('افزایش صریح همان Position را با Lot دوم و شناسه‌های تازه نگه می‌دارد',
    increased175.ok && increased175.kind === 'increase'
    && increased175.positionId === opened175.positionId
    && increased175.lotId !== opened175.event.lotId
    && afterIncrease175.open[0].openQty === 5
    && afterIncrease175.open[0].lots.length === 2
    && increased175.executionIds.every((id) => id), increased175.why);
  check('افزایش بیش از ظرفیت یا تکرار همان شناسه عملیات clamp نمی‌شود',
    commitPortfolioPlan(moved175, movedEvidence175, candidate175, {
      quantity: 10_000, positionId: opened175.positionId,
    }).reason === 'invalidQuantity'
    && commitPortfolioPlan(increased175.session, movedEvidence175, candidate175, {
      quantity: 2, positionId: opened175.positionId, operationId: 'adjust-175-increase',
    }).reason === 'repeatedOperation');

  const beforeReduceLedger175 = portfolioCapitalLedger(increased175.session);
  const reduced175 = closePortfolioPosition(increased175.session, movedEvidence175,
    opened175.positionId, { qty: 4 });
  const reducedPosition175 = portfolioSessionPositions(reduced175.session).open[0];
  const reducedLedger175 = portfolioCapitalLedger(reduced175.session);
  const reducedValue175 = portfolioSessionValuation(reduced175.session, movedEvidence175);
  check('کاهش چهارواحدی FIFO، Lot نخست و یک واحد از Lot دوم را مصرف می‌کند',
    reduced175.ok && reduced175.event.consumedLots.length === 2
    && reduced175.event.consumedLots[0].lotId === opened175.event.lotId
    && reduced175.event.consumedLots[0].qty === 3
    && reduced175.event.consumedLots[1].lotId === increased175.lotId
    && reduced175.event.consumedLots[1].qty === 1
    && reducedPosition175.openQty === 1
    && reducedPosition175.lots[0].remainingQty === 0
    && reducedPosition175.lots[1].remainingQty === 1, reduced175.why);
  check('کاهش، سود تحقق‌یافته و سود تحقق‌نیافته باقی‌مانده را جدا نگه می‌دارد',
    Number.isFinite(reduced175.realizedRial)
    && reducedValue175.ok && reducedValue175.totals.complete
    && Number.isFinite(reducedValue175.totals.unrealizedRial)
    && reduced175.event.data.realizedRial === reduced175.realizedRial);
  check('سرمایه آزادشده از دفتر خارج می‌شود و فقط Lot باز درگیر می‌ماند',
    reducedLedger175.ok && reducedLedger175.committed.count === 1
    && reducedLedger175.committed.totalRial < beforeReduceLedger175.committed.totalRial
    && reducedLedger175.free.rial > beforeReduceLedger175.free.rial);
  check('حجم کسری در کاهش رد می‌شود، نه اینکه به عدد صحیح بریده شود',
    closePortfolioPosition(increased175.session, movedEvidence175,
      opened175.positionId, { qty: 1.5 }).reason === 'invalidQty');

  const dir175 = await fs.mkdtemp(path.join(os.tmpdir(), 'options-radar-path-adjust-'));
  try {
    const draftAt175 = (session) => ({
      ...active175, session, snapshot: session.startSnapshot,
    });
    const savedStart175 = await savePortfolioMissionDraft(dir175, active175, { savedAt: 1_000 });
    const savedOpen175 = await savePortfolioMissionDraft(dir175, draftAt175(opened175.session), {
      savedAt: 2_000, expectedSavedAt: 1_000,
    });
    const savedMove175 = await savePortfolioMissionDraft(dir175, draftAt175(moved175), {
      savedAt: 3_000, expectedSavedAt: 2_000,
    });

    const backwards175 = {
      ...moved175, now: { ...opened175.session.now },
      momentSnapshot: opened175.session.momentSnapshot,
    };
    const rejectedBackwards175 = await savePortfolioMissionDraft(dir175,
      draftAt175(backwards175), { savedAt: 3_500, expectedSavedAt: 3_000 });

    const savedIncrease175 = await savePortfolioMissionDraft(dir175,
      draftAt175(increased175.session), { savedAt: 4_000, expectedSavedAt: 3_000 });
    const savedReduce175 = await savePortfolioMissionDraft(dir175,
      draftAt175(reduced175.session), { savedAt: 5_000, expectedSavedAt: 4_000 });
    const duplicate175 = await savePortfolioMissionDraft(dir175,
      draftAt175(reduced175.session), { savedAt: 5_500, expectedSavedAt: 4_000 });
    const loaded175 = await loadPortfolioMissionSave(dir175, id175);
    const resumed175 = loaded175.ok ? resumeMissionRecord(loaded175.record) : loaded175;

    check('سرور ورود، حرکت، افزایش و کاهش را فقط با نسخه مورد انتظار می‌پذیرد',
      savedStart175.ok && savedOpen175.ok && savedMove175.ok
      && savedIncrease175.ok && savedReduce175.ok
      && !duplicate175.ok && duplicate175.conflict, duplicate175.why);
    check('سرور عقب‌بردن ساعت یا عکس ناهم‌لحظه را رد می‌کند',
      !rejectedBackwards175.ok && /ساعت/.test(rejectedBackwards175.why),
      rejectedBackwards175.why);
    check('پس از refresh لحظه، Position، Lotها، رویدادها و شمارنده‌ها عیناً برمی‌گردند',
      loaded175.ok && resumed175.ok
      && JSON.stringify(loaded175.record.draft.session.now) === JSON.stringify(reduced175.session.now)
      && JSON.stringify(loaded175.record.draft.session.momentSnapshot)
        === JSON.stringify(reduced175.session.momentSnapshot)
      && JSON.stringify(loaded175.record.draft.session.events)
        === JSON.stringify(reduced175.session.events)
      && JSON.stringify(loaded175.record.draft.session.counters)
        === JSON.stringify(reduced175.session.counters));
    check('درخواست تکراری هیچ رویداد اضافه‌ای روی دیسک نگذاشته است',
      loaded175.record.draft.session.events.length === reduced175.session.events.length);

    const restoredPosition175 = portfolioSessionPositions(loaded175.record.draft.session).open[0];
    check('سود تحقق‌یافته خروج جزئی پس از refresh روی همان Position می‌ماند',
      restoredPosition175.realizedKnown
      && near(restoredPosition175.realizedRial, reduced175.realizedRial, 1e-9));

    const restoredLedger175 = portfolioCapitalLedger(loaded175.record.draft.session);
    check('دفتر سرمایه پس از refresh با قبل دقیقاً همسان است',
      restoredLedger175.ok
      && near(restoredLedger175.committed.totalRial, reducedLedger175.committed.totalRial, 1e-9)
      && near(restoredLedger175.free.rial, reducedLedger175.free.rial, 1e-9));

    const closed175 = closePortfolioPosition(loaded175.record.draft.session,
      movedEvidence175, opened175.positionId);
    const savedClose175 = await savePortfolioMissionDraft(dir175, draftAt175(closed175.session), {
      savedAt: 6_000, expectedSavedAt: 5_000,
    });
    const final175 = await loadPortfolioMissionSave(dir175, id175);
    const finalLedger175 = portfolioCapitalLedger(final175.record.draft.session);
    check('آفست کاملِ بازیابی‌شده موقعیت را می‌بندد و کل سرمایه را آزاد می‌کند',
      closed175.ok && savedClose175.ok
      && portfolioSessionPositions(final175.record.draft.session).closed.length === 1
      && finalLedger175.committed.totalRial === 0
      && finalLedger175.free.rial === finalLedger175.baseRial);
  } finally {
    await fs.rm(dir175, { recursive: true, force: true });
  }
  check('دایرکتوری دقیق آزمون مسیر پس از پایان پاک می‌شود',
    await fs.access(dir175).then(() => false, () => true));

  const tab175 = readSrc('../ui/tabs/portfolio-time.mjs');
  // مسیر گام زمانی از دکمه بیرون آمد و `advanceClock` شد تا پخش خودکار
  // همان مسیر را برود؛ ترتیبِ «اول سرور، بعد رسم» همان‌جاست.
  const clock175 = tab175.slice(tab175.indexOf('async function advanceClock('),
    tab175.indexOf("$('pt-positions').onclick"));
  const adjust175 = tab175.slice(tab175.indexOf("$('pt-positions').onclick"),
    tab175.indexOf("$('pt-eligibility').onclick"));
  check('رابط حرکت ساعت را پیش از رسم لحظه تازه روی سرور ثبت می‌کند',
    clock175.indexOf('await persist(nextDraft)') < clock175.indexOf('paintEligibility(next)')
    && clock175.indexOf('await persist(nextDraft)') < clock175.indexOf('paintProposals(next)'));
  check('رابط افزایش، کاهش و آفست را با حجم صریح و تأیید سرور مدیریت می‌کند',
    tab175.includes('data-pt-increase=') && tab175.includes('data-pt-reduce=')
    && tab175.includes('data-pt-adjust-qty=')
    && adjust175.indexOf('await persist(nextDraft)') < adjust175.indexOf('paintProposals(done.session)'));
}
