// ۱۲۰. ذخیره نسخه‌دار مأموریت روی سرور
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { MISSION_REPLAY_GRAINS } from '../../core/portfolio-mission.mjs';
import {
  activatePortfolioSession, createPortfolioSession, setFamilyAllocations, setPortfolioMission,
} from '../../core/portfolio-session.mjs';
import {
  PORTFOLIO_MISSION_SAVE_STEPS, PORTFOLIO_MISSION_SAVE_VERSION, createPortfolioMissionSave, listPortfolioMissionSaves, loadPortfolioMissionSave, portfolioMissionSaveSummary, restorePortfolioMissionSave, savePortfolioMissionDraft, validatePortfolioMissionSaveTransition,
} from '../../server/portfolio-mission-store.mjs';
import { GROUPS as STRAT_GROUPS48 } from '../../strategies/catalog.mjs';


// ═════════════════════ ۱۲۰. ذخیره نسخه‌دار مأموریت روی سرور ═════════════════════
//
// فایل سرور منبع حقیقت است. هر رکورد باید از همان قراردادهای هسته دوباره
// ساخته شود و جلسه فعال نتواند به پیش‌نویس یا قفل متفاوت برگردد.
group('۱۲۰. ذخیره نسخه‌دار مأموریت روی سرور');
{
  const replay = { grain: 'halfHour', grainSeconds: MISSION_REPLAY_GRAINS.halfHour.seconds };
  const outlook = {
    direction: 'bullish', targetPriceRial: 120_000, rangeLowRial: 110_000,
    rangeHighRial: 130_000, volatilityView: 'higher', expectedVolatilityPct: 45,
    confidencePct: 70, thesis: 'انتظار شکست مقاومت',
  };
  const risk = {
    maxLossPct: 8, maxDrawdownPct: 15, minFreeCapitalPct: 20,
    maxMarginUsePct: 60, allowUnlimitedRisk: false,
  };
  const liquidity = {
    minUnderlyingDailyValueRial: 100_000_000_000,
    minOptionDailyValueRial: 1_000_000_000,
    minOpenInterest: 100, maxSpreadPct: 8, maxBookTakePct: 30,
    requireFullBook: true,
  };
  const made = createPortfolioSession({
    id: 'pt-store-001', baseIns: '900001',
    start: { date: 20260521, second: 9 * 3600 },
    end: { date: 20260621, second: 12 * 3600 },
    initialCapitalRial: 10_000_000_000, reserveRial: 2_000_000_000,
    createdAt: 100,
  });
  const allocated = setFamilyAllocations(made.session, [
    { familyId: 'income', label: STRAT_GROUPS48.income, pct: 60 },
    { familyId: 'vertical', label: STRAT_GROUPS48.vertical, pct: 30 },
  ]);
  const missionInput120 = {
    objective: { mode: 'growth', returnBase: 'allocatable', targetReturnPct: 12.5, maxHoldingDays: 30 },
    replay: { grain: replay.grain }, outlook, risk, liquidity,
  };
  const missioned = setPortfolioMission(allocated.session, missionInput120);
  const snapshot120 = {
    universe: { rows: [], quality: makeDataQuality({
      kind: 'missing', source: 'watch-archive',
      asOf: made.session.start, reason: 'بایگانی همان روز موجود نیست',
    }) },
  };
  const activated = activatePortfolioSession(missioned.session, { snapshot: snapshot120 });
  const setupDraft120 = { step: 'setup', session: made.session, replay };
  const outlookDraft120 = { ...setupDraft120, step: 'outlook', outlook };
  const riskDraft120 = { ...outlookDraft120, step: 'risk', risk, liquidity };
  const allocationDraft120 = { ...riskDraft120, step: 'allocation', session: allocated.session };
  const missionDraft120 = {
    ...allocationDraft120, step: 'mission', session: missioned.session,
    mission: missioned.session.mission,
  };
  const activeDraft120 = {
    ...missionDraft120, step: 'active', session: activated.session,
    snapshot: activated.session.startSnapshot,
  };

  check('نسخه و مراحل ذخیره صریح و بسته‌اند',
    PORTFOLIO_MISSION_SAVE_VERSION === 1
    && PORTFOLIO_MISSION_SAVE_STEPS.join(',') === 'setup,outlook,risk,allocation,mission,active');
  const setupSave120 = createPortfolioMissionSave(setupDraft120, { savedAt: 1_000 });
  check('مرحله نخست معتبر با شناسه و زمان سرور بسته‌بندی می‌شود',
    setupSave120.ok && setupSave120.record.id === 'pt-store-001'
    && setupSave120.record.savedAt === 1_000);
  check('رکورد پس از JSON round-trip همه ورودی‌های صریح را نگه می‌دارد', (() => {
    const round = restorePortfolioMissionSave(JSON.parse(JSON.stringify(setupSave120.record)));
    return round.ok && round.record.draft.replay.grain === 'halfHour'
      && round.record.draft.session.capital.reserveRial === 2_000_000_000;
  })());
  check('نسخه ناشناخته صریح رد می‌شود', (() => {
    const row = JSON.parse(JSON.stringify(setupSave120.record));
    row.schemaVersion = 99;
    return !restorePortfolioMissionSave(row).ok;
  })());
  check('نسخه ناشناخته خود session هم رد می‌شود', (() => {
    const row = JSON.parse(JSON.stringify(setupSave120.record));
    row.draft.session.schemaVersion = 99;
    return !restorePortfolioMissionSave(row).ok;
  })());
  check('شناسه رکورد و جلسه باید یکی باشد', (() => {
    const row = JSON.parse(JSON.stringify(setupSave120.record));
    row.id = 'pt-store-other';
    return !restorePortfolioMissionSave(row).ok;
  })());
  check('جلسه ناقص بدون شمارنده‌های پایدار ذخیره نمی‌شود', (() => {
    const row = JSON.parse(JSON.stringify(setupSave120.record));
    delete row.draft.session.counters.lot;
    return !restorePortfolioMissionSave(row).ok;
  })());
  check('مرحله انتظار ناقص بی‌صدا به مرحله قبلی برنمی‌گردد',
    !createPortfolioMissionSave({ ...outlookDraft120, outlook: null }, { savedAt: 1_001 }).ok);
  check('مرحله ریسک ناقص ذخیره نمی‌شود',
    !createPortfolioMissionSave({ ...riskDraft120, liquidity: null }, { savedAt: 1_002 }).ok);
  check('سرمایه دستکاری‌شده از اعتبارسنج تخصیص عبور نمی‌کند', (() => {
    const draft = JSON.parse(JSON.stringify(allocationDraft120));
    draft.session.capital.assignedRial += 1;
    return !createPortfolioMissionSave(draft, { savedAt: 1_003 }).ok;
  })());
  const missionSave120 = createPortfolioMissionSave(missionDraft120, { savedAt: 1_004 });
  check('مأموریت کامل از قرارداد هسته بازتولید و ذخیره می‌شود',
    missionSave120.ok && missionSave120.record.draft.mission.id === 'mission-pt-store-001');
  const activeSave120 = createPortfolioMissionSave(activeDraft120, { savedAt: 2_000 });
  check('جلسه فعال با مأموریت و عکس شروع قفل‌شده بازسازی می‌شود',
    activeSave120.ok && activeSave120.record.draft.session.state === 'active'
    && activeSave120.record.draft.session.startSnapshot.quality.missing, activeSave120.why);
  check('دستکاری مأموریت قفل‌شده جلسه فعال رد می‌شود', (() => {
    if (!activeSave120.ok) return false;
    const row = JSON.parse(JSON.stringify(activeSave120.record));
    row.draft.session.lockedMission.objective.targetReturnPct = 99;
    return !restorePortfolioMissionSave(row).ok;
  })());
  check('جلسه فعال دوباره به پیش‌نویس برنمی‌گردد',
    activeSave120.ok
    && !validatePortfolioMissionSaveTransition(activeSave120.record, setupSave120.record).ok);
  check('خلاصه فهرست فقط اطلاعات لازم برای ادامه را می‌دهد', (() => {
    if (!activeSave120.ok) return false;
    const row = portfolioMissionSaveSummary(activeSave120.record);
    return row?.id === 'pt-store-001' && row.step === 'active' && row.state === 'active'
      && !('draft' in row);
  })());

  const temp120 = fs.mkdtempSync(path.join(os.tmpdir(), 'options-radar-portfolio-store-'));
  try {
    const first = await savePortfolioMissionDraft(temp120, setupDraft120, { savedAt: 1_000 });
    const loaded = await loadPortfolioMissionSave(temp120, 'pt-store-001');
    check('ذخیره اتمیک و بازیابی از فایل سرور همسان‌اند',
      first.ok && loaded.ok && JSON.stringify(first.record) === JSON.stringify(loaded.record)
      && !fs.readdirSync(temp120).some((name) => name.endsWith('.tmp')));
    const second = await savePortfolioMissionDraft(temp120, activeDraft120, {
      savedAt: 2_000, expectedSavedAt: 1_000,
    });
    check('پیش‌نویس معتبر می‌تواند با کنترل نسخه به جلسه فعال برسد',
      second.ok && second.record.draft.session.state === 'active');
    const concurrent = await Promise.all([
      savePortfolioMissionDraft(temp120, activeDraft120, { savedAt: 3_000, expectedSavedAt: 2_000 }),
      savePortfolioMissionDraft(temp120, activeDraft120, { savedAt: 3_001, expectedSavedAt: 2_000 }),
    ]);
    check('دو autosave هم‌زمان نمی‌توانند کنترل نسخه را دور بزنند',
      concurrent.filter((row) => row.ok).length === 1
      && concurrent.filter((row) => row.conflict).length === 1);
    const stale = await savePortfolioMissionDraft(temp120, activeDraft120, {
      savedAt: 4_000, expectedSavedAt: 1_000,
    });
    check('نوشتن کهنه روی نسخه تازه با تعارض صریح رد می‌شود',
      !stale.ok && stale.conflict === true);
    fs.writeFileSync(path.join(temp120, 'broken.json'), '{', 'utf8');
    const listed = await listPortfolioMissionSaves(temp120);
    check('فهرست جلسه‌ها فایل خراب را پنهان نمی‌کند',
      listed.ok && listed.records.some((row) => row.id === 'broken' && row.broken));
  } finally {
    fs.rmSync(temp120, { recursive: true, force: true });
  }

  const server120 = readSrc('../server/server.mjs');
  check('سرور فهرست، ذخیره و بازیابی دارد و حذف جلسه ارائه نمی‌کند',
    server120.includes("p === '/api/portfolio/sessions'")
    && server120.includes("p === '/api/portfolio/session'")
    && server120.includes('savePortfolioMissionDraft(PORTFOLIO_MISSION_DIR')
    && !server120.includes("p === '/api/portfolio/session' && req.method === 'DELETE'"));
}

// ═══════════════════════════ گزارش ═══════════════════════════
