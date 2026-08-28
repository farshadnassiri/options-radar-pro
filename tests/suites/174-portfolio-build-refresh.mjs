// ۱۷۴. تشکیل سبد با حجم صریح و ماندگاری پس از refresh

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioCapitalLedger } from '../../core/portfolio-ledger.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import {
  activatePortfolioMissionDraft, createPortfolioAllocationDraft,
  createPortfolioMissionDraft, createPortfolioOutlookDraft,
  createPortfolioRiskDraft, createPortfolioStepOneDraft,
} from '../../ui/portfolio-mission-form.mjs';
import { resumeMissionRecord } from '../../ui/portfolio-mission-resume.mjs';
import {
  loadPortfolioMissionSave, savePortfolioMissionDraft,
} from '../../server/portfolio-mission-store.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';

group('۱۷۴. تشکیل سبد با حجم صریح و ماندگاری پس از refresh');
{
  const fx174 = portfolioFixture('build-refresh-174');
  const id174 = `build-refresh-174-${process.pid}`;
  const setup174 = createPortfolioStepOneDraft({
    id: id174, baseIns: fx174.baseSession.baseIns,
    capitalToman: '1000000000', reserveToman: '0',
    startDate: fx174.at.date, startSecond: fx174.at.second,
    endDate: 20260620, endSecond: 12 * 3600,
    grain: 'daily', createdAt: 174,
  });
  const outlook174 = createPortfolioOutlookDraft(setup174.draft, {
    direction: 'bullish', targetPriceToman: '1140',
    rangeLowToman: '', rangeHighToman: '', volatilityView: 'higher',
    expectedVolatilityPct: '35', confidencePct: '70',
    thesis: 'تشکیل واقعی سبد با حجم انتخابی کاربر',
  });
  const risk174 = createPortfolioRiskDraft(outlook174.draft, {
    maxLossPct: '50', maxDrawdownPct: '60', minFreeCapitalPct: '10',
    maxMarginUsePct: '40', allowUnlimitedRisk: 'yes',
    minUnderlyingDailyValueToman: '10000000',
    minOptionDailyValueToman: '1000000', minOpenInterest: '100',
    maxSpreadPct: '8', maxBookTakePct: '50', requireFullBook: 'no',
  });
  const allocation174 = createPortfolioAllocationDraft(risk174.draft, [
    { familyId: 'single', pct: '30' },
    { familyId: 'vertical', pct: '40' },
    { familyId: 'vol', pct: '30' },
  ]);
  const mission174 = createPortfolioMissionDraft(allocation174.draft, {
    objectiveMode: 'growth', returnBase: 'initial',
    targetReturnPct: '18', maxHoldingDays: '30',
  });
  const quality174 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history',
    asOf: fx174.at, sufficient: true,
  });
  const activated174 = activatePortfolioMissionDraft(mission174.draft, {
    quality: quality174,
    spot: fx174.baseSession.startSnapshot.spot,
    contracts: fx174.contracts,
    capitalInputs: fx174.capitalInputs,
  });
  const active174 = activated174.draft;
  const plans174 = portfolioRankedPlans(active174.session, fx174.evidence);
  const candidate174 = plans174.ranking?.ranked?.[0]?.candidateId || '';
  const capacity174 = plans174.sources?.get(candidate174)?.entry?.executableQty;
  const quantity174 = Math.max(1, Math.min(3, Number(capacity174) || 1));
  const committed174 = commitPortfolioPlan(active174.session, fx174.evidence,
    candidate174, { quantity: quantity174 });

  check('پیش‌شرط: جلسه یک‌میلیاردی با پیشنهاد کافی ساخته می‌شود',
    setup174.ok && outlook174.ok && risk174.ok && allocation174.ok
    && mission174.ok && activated174.ok && plans174.ok && candidate174,
    plans174.why || activated174.why);
  check('حجم صریح کاربر، نه کل ظرفیت، وارد رویداد می‌شود',
    committed174.ok && committed174.event.qty === quantity174
    && committed174.event.data.executableQty === quantity174
    && quantity174 <= capacity174, committed174.why);
  check('شناسه‌های Session/Portfolio ثابت و شناسه‌های دفتر پایدار ساخته می‌شوند',
    committed174.session.id === active174.session.id
    && committed174.session.portfolioId === active174.session.portfolioId
    && committed174.positionId && committed174.transactionId
    && committed174.event.id && committed174.event.lotId
    && committed174.event.executions.every((row) => row.id));
  check('سرمایه یک میلیاردی تغییر نمی‌کند و دفتر بلافاصله درگیر/آزاد را جدا می‌کند', (() => {
    const ledger = portfolioCapitalLedger(committed174.session);
    return ledger.ok && committed174.session.capital.initialRial === 10_000_000_000
      && ledger.committed.totalRial > 0
      && ledger.free.rial === 10_000_000_000 - ledger.committed.totalRial;
  })());

  const dir174 = await fs.mkdtemp(path.join(os.tmpdir(), 'options-radar-build-refresh-'));
  try {
    const first174 = await savePortfolioMissionDraft(dir174, active174, { savedAt: 1_000 });
    const nextDraft174 = {
      ...active174,
      session: committed174.session,
      snapshot: committed174.session.startSnapshot,
    };
    const second174 = await savePortfolioMissionDraft(dir174, nextDraft174, {
      savedAt: 2_000, expectedSavedAt: 1_000,
    });
    const loaded174 = await loadPortfolioMissionSave(dir174, id174);
    const resumed174 = loaded174.ok ? resumeMissionRecord(loaded174.record) : loaded174;

    check('سرور ابتدا active خالی و سپس فقط رویداد افزوده‌شده را می‌پذیرد',
      first174.ok && second174.ok && second174.record.savedAt === 2_000,
      second174.why);
    check('پس از refresh همان یک موقعیت و سند کامل ورود برمی‌گردد',
      loaded174.ok && resumed174.ok && resumed174.record.readOnly
      && loaded174.record.draft.session.events.length === 1
      && JSON.stringify(loaded174.record.draft.session.events[0])
        === JSON.stringify(committed174.event), loaded174.why || resumed174.why);
    check('شمارنده‌ها و همه شناسه‌ها پس از JSON/file round-trip عیناً می‌مانند',
      JSON.stringify(loaded174.record.draft.session.counters)
        === JSON.stringify(committed174.session.counters)
      && loaded174.record.draft.session.id === id174
      && loaded174.record.draft.session.portfolioId === active174.session.portfolioId);
    check('طرح ثبت‌شده پس از refresh دوباره در همان لحظه ثبت نمی‌شود',
      commitPortfolioPlan(loaded174.record.draft.session, fx174.evidence,
        candidate174, { quantity: quantity174 }).reason === 'alreadyCommitted');
    check('دفتر سرمایه بازسازی‌شده همان مبلغ درگیر و آزاد را گزارش می‌کند', (() => {
      const before = portfolioCapitalLedger(committed174.session);
      const after = portfolioCapitalLedger(loaded174.record.draft.session);
      return before.ok && after.ok
        && before.committed.totalRial === after.committed.totalRial
        && before.free.rial === after.free.rial;
    })());
  } finally {
    await fs.rm(dir174, { recursive: true, force: true });
  }
  check('دایرکتوری دقیق آزمون سرور پس از پایان پاک می‌شود',
    await fs.access(dir174).then(() => false, () => true));

  const entrySrc174 = readSrc('../core/portfolio-entry.mjs');
  check('حجم انتخابی بزرگ‌تر از ظرفیت رد می‌شود و clamp پنهان ندارد',
    entrySrc174.includes("return fail('quantityExceedsCapacity'")
    && !/requested\s*=\s*Math\.min/.test(entrySrc174));

  const tabSrc174 = readSrc('../ui/tabs/portfolio-time.mjs');
  const handler174 = tabSrc174.slice(tabSrc174.indexOf("$('pt-proposals').onclick"),
    tabSrc174.indexOf('async function repriceAt'));
  check('رابط حجم را صریح می‌گیرد و تا پاسخ سرور دوبار کلیک را می‌بندد',
    tabSrc174.includes('data-pt-quantity=')
    && handler174.indexOf('button.disabled = true') < handler174.indexOf('commitPortfolioPlan('));
  check('جلسه فقط پس از ثبت موفق سرور وارد رابط می‌شود',
    handler174.indexOf('await persist(nextDraft)') < handler174.indexOf('draft = nextDraft')
    && handler174.indexOf('draft = nextDraft') < handler174.indexOf('paintProposals(done.session)'));
  check('علامت ثبت‌شده پس از refresh از دفتر session بازسازی می‌شود، نه cache تب',
    /committedIds\.clear\(\)[\s\S]{0,280}event\?\.data\?\.commitVersion/.test(tabSrc174));
}
