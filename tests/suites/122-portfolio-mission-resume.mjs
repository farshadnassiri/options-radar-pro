// ۱۲۱. ادامهٔ مأموریت — بازسازی فرم و صداقت شبکه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { MISSION_REPLAY_GRAINS } from '../../core/portfolio-mission.mjs';
import {
  activatePortfolioSession, createPortfolioSession, setFamilyAllocations, setPortfolioMission,
} from '../../core/portfolio-session.mjs';
import { createPortfolioMissionSave } from '../../server/portfolio-mission-store.mjs';
import { MISSION_RESUME_STEPS, missionSaveLabel, resumeMissionRecord } from '../../ui/portfolio-mission-resume.mjs';
import { listMissionSaves, loadMissionSave, saveMissionDraft } from '../../ui/portfolio-mission-data.mjs';
import { GROUPS as STRAT_GROUPS122 } from '../../strategies/catalog.mjs';

// ═════════════════════ ۱۲۱. ادامهٔ مأموریت سفر زمانی ═════════════════════
//
// بند ۲ پذیرش می‌گوید ادامه باید «دقیقاً» آخرین مرحلهٔ معتبر و همهٔ
// ورودی‌های صریح را بازسازی کند و دادهٔ ناقص را صریح رد کند. پس آزمون
// اصلی این دسته یک رفت‌وبرگشت است: تومان → ریال → تومان، و ادعا اینکه
// عددی که برمی‌گردد همان است که کاربر تایپ کرده بود، نه چیزی نزدیک به آن.
group('۱۲۱. ادامهٔ مأموریت — بازسازی فرم و صداقت شبکه');
{
  const replay122 = { grain: 'halfHour', grainSeconds: MISSION_REPLAY_GRAINS.halfHour.seconds };
  const outlook122 = {
    direction: 'bullish', targetPriceRial: 120_000, rangeLowRial: 110_000,
    rangeHighRial: 130_000, volatilityView: 'higher', expectedVolatilityPct: 45,
    confidencePct: 70, thesis: 'انتظار شکست مقاومت',
  };
  const risk122 = {
    maxLossPct: 8, maxDrawdownPct: 15, minFreeCapitalPct: 20,
    maxMarginUsePct: 60, allowUnlimitedRisk: false,
  };
  const liquidity122 = {
    minUnderlyingDailyValueRial: 100_000_000_000,
    minOptionDailyValueRial: 1_000_000_000,
    minOpenInterest: 100, maxSpreadPct: 8, maxBookTakePct: 30,
    requireFullBook: true,
  };
  const made122 = createPortfolioSession({
    id: 'pt-resume-001', baseIns: '900001',
    start: { date: 20260521, second: 9 * 3600 },
    end: { date: 20260621, second: 12 * 3600 },
    initialCapitalRial: 10_000_000_000, reserveRial: 2_000_000_000,
    createdAt: 100,
  });
  const allocated122 = setFamilyAllocations(made122.session, [
    { familyId: 'income', label: STRAT_GROUPS122.income, pct: 60 },
    { familyId: 'vertical', label: STRAT_GROUPS122.vertical, pct: 30 },
  ]);
  const missionInput122 = {
    objective: { mode: 'growth', returnBase: 'allocatable', targetReturnPct: 12.5, maxHoldingDays: 30 },
    replay: { grain: replay122.grain }, outlook: outlook122, risk: risk122, liquidity: liquidity122,
  };
  const missioned122 = setPortfolioMission(allocated122.session, missionInput122);

  const draftAt = (step, session) => ({
    step,
    session,
    replay: replay122,
    ...(MISSION_RESUME_STEPS.indexOf(step) >= 1 ? { outlook: outlook122 } : {}),
    ...(MISSION_RESUME_STEPS.indexOf(step) >= 2 ? { risk: risk122, liquidity: liquidity122 } : {}),
    ...(MISSION_RESUME_STEPS.indexOf(step) >= 4 ? { mission: session.mission } : {}),
  });
  const recordAt = (step, session) => createPortfolioMissionSave(draftAt(step, session), { savedAt: 1700 }).record;

  // ─── بند ۲: بازسازی دقیق، نه تقریبی ───────────────────────────────
  const missionRecord = recordAt('mission', missioned122.session);
  const resumed = resumeMissionRecord(missionRecord);
  check('رکورد مرحله مأموریت بازسازی می‌شود', resumed.ok, resumed.why);
  check('مرحله ذخیره‌شده حفظ می‌شود', resumed.record?.step === 'mission');
  check('مرحله نمایشی مأموریت، «مرور» است', resumed.record?.stage === 'review');

  const setupIn = resumed.record?.inputs?.setup;
  check('سرمایه ریال به همان تومان ورودی برمی‌گردد', setupIn?.capitalToman === '1000000000',
    String(setupIn?.capitalToman));
  check('ذخیره احتیاطی هم به تومان برمی‌گردد', setupIn?.reserveToman === '200000000',
    String(setupIn?.reserveToman));
  check('نماد پایه، تایم‌فریم و دو لحظه بازسازی می‌شوند',
    setupIn?.baseIns === '900001' && setupIn?.grain === 'halfHour'
    && setupIn?.startDate === 20260521 && setupIn?.startSecond === 9 * 3600
    && setupIn?.endDate === 20260621 && setupIn?.endSecond === 12 * 3600);

  const outlookIn = resumed.record?.inputs?.outlook;
  check('انتظار بازار با همه ورودی‌های صریح برمی‌گردد',
    outlookIn?.direction === 'bullish' && outlookIn?.volatilityView === 'higher'
    && outlookIn?.confidencePct === '70' && outlookIn?.thesis === 'انتظار شکست مقاومت');
  check('قیمت هدف و کران‌ها به تومان برمی‌گردند',
    outlookIn?.targetPriceToman === '12000' && outlookIn?.rangeLowToman === '11000'
    && outlookIn?.rangeHighToman === '13000');

  const riskIn = resumed.record?.inputs?.risk;
  check('قیود ریسک و نقدشوندگی کامل برمی‌گردند',
    riskIn?.maxLossPct === '8' && riskIn?.maxDrawdownPct === '15'
    && riskIn?.minFreeCapitalPct === '20' && riskIn?.maxMarginUsePct === '60'
    && riskIn?.minOpenInterest === '100' && riskIn?.maxSpreadPct === '8');
  check('انتخاب دوگزینه‌ای به همان صورت صریح برمی‌گردد',
    riskIn?.allowUnlimitedRisk === 'no' && riskIn?.requireFullBook === 'yes');
  check('ارزش روزانه ریالی به تومان برمی‌گردد',
    riskIn?.minUnderlyingDailyValueToman === '10000000000'
    && riskIn?.minOptionDailyValueToman === '100000000');

  check('تخصیص خانواده‌ها با درصدشان برمی‌گردد',
    resumed.record?.inputs?.allocation?.length === 2
    && resumed.record.inputs.allocation[0].familyId === 'income'
    && resumed.record.inputs.allocation[0].pct === '60');
  check('هدف مأموریت برمی‌گردد',
    resumed.record?.inputs?.mission?.objectiveMode === 'growth'
    && resumed.record.inputs.mission.returnBase === 'allocatable'
    && resumed.record.inputs.mission.targetReturnPct === '12.5');

  // ─── مرحلهٔ زودتر نباید داده مراحل بعدی را جعل کند ─────────────────
  const setupOnly = resumeMissionRecord(recordAt('setup', made122.session));
  check('مرحله نخست بازسازی می‌شود', setupOnly.ok, setupOnly.why);
  check('مرحله نخست هیچ ورودی مرحله بعد نمی‌سازد',
    setupOnly.record?.inputs?.outlook === null && setupOnly.record?.inputs?.risk === null
    && setupOnly.record?.inputs?.allocation === null && setupOnly.record?.inputs?.mission === null);

  // ─── بند ۲: دادهٔ ناقص و نسخهٔ ناشناخته، صریح رد ────────────────────
  const badVersion = resumeMissionRecord({ ...missionRecord, schemaVersion: 99 });
  check('نسخه ناشناخته صریح رد می‌شود', !badVersion.ok && /نسخه/.test(badVersion.why), badVersion.why);

  const noRisk = JSON.parse(JSON.stringify(missionRecord));
  delete noRisk.draft.risk;
  check('مرحله‌ای که قیود ریسکش نیست رد می‌شود، نه اینکه پیش‌فرض بگیرد',
    !resumeMissionRecord(noRisk).ok, resumeMissionRecord(noRisk).why);

  const halfRisk = JSON.parse(JSON.stringify(missionRecord));
  delete halfRisk.draft.risk.maxDrawdownPct;
  check('نبودِ یک قید ریسک هم کل بازسازی را رد می‌کند', !resumeMissionRecord(halfRisk).ok);

  const vagueChoice = JSON.parse(JSON.stringify(missionRecord));
  vagueChoice.draft.risk.allowUnlimitedRisk = null;
  check('انتخاب دوگزینه‌ای غیرصریح رد می‌شود، نه اینکه «خیر» فرض شود',
    !resumeMissionRecord(vagueChoice).ok);

  const oddRial = JSON.parse(JSON.stringify(missionRecord));
  oddRial.draft.session.capital.initialRial = 10_000_000_001;
  check('ریالی که به تومان صحیح برنمی‌گردد رد می‌شود، نه گرد',
    !resumeMissionRecord(oddRial).ok);

  const idMismatch = JSON.parse(JSON.stringify(missionRecord));
  idMismatch.draft.session.id = 'pt-resume-002';
  check('ناهمخوانی شناسه رکورد و جلسه رد می‌شود', !resumeMissionRecord(idMismatch).ok);

  const unknownStep = JSON.parse(JSON.stringify(missionRecord));
  unknownStep.draft.step = 'somewhere';
  check('مرحله ناشناخته رد می‌شود', !resumeMissionRecord(unknownStep).ok);
  check('برچسب مرحله ناشناخته حدس نمی‌زند', missionSaveLabel({ step: 'somewhere' }) === 'مرحلهٔ نامعلوم');

  // ─── بند ۳: جلسهٔ فعال فقط‌خواندنی ─────────────────────────────────
  const activated122 = activatePortfolioSession(missioned122.session, {
    snapshot: { universe: { rows: [], quality: makeDataQuality({
      kind: 'missing', source: 'watch-archive',
      asOf: made122.session.start, reason: 'بایگانی همان روز موجود نیست',
    }) } },
  });
  const activeRecord = createPortfolioMissionSave({
    ...draftAt('mission', missioned122.session),
    step: 'active', session: activated122.session,
    snapshot: activated122.session.startSnapshot,
  }, { savedAt: 1700 }).record;
  const activeResumed = resumeMissionRecord(activeRecord);
  check('جلسه فعال بازسازی می‌شود', activeResumed.ok, activeResumed.why);
  check('جلسه فعال فقط‌خواندنی برمی‌گردد', activeResumed.record?.readOnly === true);
  check('پیش‌نویس نیمه‌کاره فقط‌خواندنی نیست', resumed.record?.readOnly === false);
  check('برچسب جلسه فعال، قفل‌بودن را می‌گوید', /قفل/.test(missionSaveLabel({ step: 'active' })));

  // ─── بند ۴: ذخیره ناموفق هرگز موفق نمایش داده نشود ─────────────────
  const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  const offline = await saveMissionDraft(draftAt('mission', missioned122.session), {
    fetchImpl: async () => { throw new Error('شبکه قطع است'); },
  });
  check('شبکه قطع، ذخیره ناموفق برمی‌گرداند', !offline.ok && /شبکه قطع/.test(offline.why), offline.why);

  const conflict = await saveMissionDraft(draftAt('mission', missioned122.session), {
    expectedSavedAt: 1600,
    fetchImpl: async () => jsonResponse(409, { error: 'نسخه ذخیره‌شده تازه‌تر است' }),
  });
  check('تعارض نسخه به‌عنوان تعارض برمی‌گردد، نه موفق',
    !conflict.ok && conflict.conflict === true, conflict.why);

  const lying = await saveMissionDraft(draftAt('mission', missioned122.session), {
    fetchImpl: async () => jsonResponse(200, { ok: true }),
  });
  check('۲۰۰ بدون زمان ثبت، موفق حساب نمی‌شود', !lying.ok && lying.savedAt === null, lying.why);

  let sentBody = null;
  const good = await saveMissionDraft(draftAt('mission', missioned122.session), {
    expectedSavedAt: 1700,
    fetchImpl: async (url, options) => {
      sentBody = JSON.parse(options.body);
      return jsonResponse(200, { ok: true, savedAt: 1800, step: 'mission', state: 'draft' });
    },
  });
  check('ذخیره موفق، زمان ثبت سرور را برمی‌گرداند', good.ok && good.savedAt === 1800, good.why);
  check('قفل خوش‌بینانه در بدنه فرستاده می‌شود', sentBody?.expectedSavedAt === 1700);
  check('نسخه قرارداد در بدنه فرستاده می‌شود', sentBody?.schemaVersion === 1);

  const noId = await saveMissionDraft({ step: 'setup', session: {} }, { fetchImpl: async () => jsonResponse(200, {}) });
  check('پیش‌نویس بدون شناسه اصلاً فرستاده نمی‌شود', !noId.ok);

  const listed = await listMissionSaves({
    fetchImpl: async () => jsonResponse(200, { count: 1, sessions: [{ id: 'pt-resume-001', step: 'mission' }] }),
  });
  check('فهرست جلسه‌ها خوانده می‌شود', listed.ok && listed.sessions.length === 1);
  const listFailed = await listMissionSaves({ fetchImpl: async () => jsonResponse(500, { error: 'خطای سرور' }) });
  check('فهرست ناموفق، فهرست خالیِ «موفق» نمی‌دهد', !listFailed.ok && listFailed.sessions.length === 0);

  const missing = await loadMissionSave('pt-resume-404', {
    fetchImpl: async () => jsonResponse(404, { error: 'جلسه پیدا نشد' }),
  });
  check('جلسه نبوده، صریح گزارش می‌شود', !missing.ok && missing.notFound === true);

  // ─── بند ۱ و ۵: مرز برش ────────────────────────────────────────────
  const dataSrc = readSrc('../ui/portfolio-mission-data.mjs');
  check('کلاینت ادامه، سه نقطه سرور را می‌شناسد',
    dataSrc.includes('/api/portfolio/sessions') && dataSrc.includes('/api/portfolio/session'));
  // الگو کاربردِ واقعی را می‌گیرد، نه واژه را در توضیح. اگر «localStorage»
  // متن هم رد می‌شد، هر کامنتی که قاعده را توضیح دهد آزمون را می‌شکست و
  // آدم یاد می‌گرفت توضیح ننویسد.
  const usesLocalStorage = (src) => /localStorage\s*[.[]/.test(src);
  check('منبع حقیقت مرورگر نیست — localStorage در مسیر ادامه صدا زده نمی‌شود',
    !usesLocalStorage(dataSrc) && !usesLocalStorage(readSrc('../ui/portfolio-mission-resume.mjs')));

  // ─── اتصال تب: بندهای ۱، ۳ و ۴ در خودِ رابط ────────────────────────
  const tabSrc = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب، ثبت روی سرور را از کلاینت ادامه می‌گیرد',
    tabSrc.includes("from '../portfolio-mission-data.mjs'") && tabSrc.includes('saveMissionDraft'));
  check('تب برای بازسازی از همان اعتبارسنج مشترک استفاده می‌کند',
    tabSrc.includes('resumeMissionRecord'));
  check('هر پنج مرحله روی سرور ثبت می‌شوند',
    (tabSrc.match(/persist\((?:result|active)\.draft\)/g) || []).length === 5,
    String((tabSrc.match(/persist\((?:result|active)\.draft\)/g) || []).length));
  check('شناسه جلسه دیگر ثابتِ هر بار mount نیست', /let draftId = /.test(tabSrc));
  check('قفل خوش‌بینانه با زمان ثبت سرور فرستاده می‌شود',
    /expectedSavedAt: lastSavedAt/.test(tabSrc));
  check('بازسازی، خودش دوباره روی سرور نمی‌نویسد',
    /if \(resuming \|\| !next\?\.session\?\.id\) return;/.test(tabSrc));
  check('جلسه فعال پس از ادامه قفل می‌شود',
    /restored\.record\.readOnly[\s\S]{0,80}lockMissionEditor\(\)/.test(tabSrc));
  check('خطای ثبت روی سرور به کاربر نشان داده می‌شود',
    tabSrc.includes('pt-persist-state') && /روی سرور ثبت نشد/.test(tabSrc));
  check('ردیف فهرست، شناسه خام را نشان نمی‌دهد — تاریخ و مرحله را می‌دهد',
    /faDigits\(historyDateLabel\(day\)\)/.test(tabSrc) && !/>\$\{esc\(row\.id\)\} —/.test(tabSrc));
  check('کنترل ادامه و فهرست جلسه‌ها در رابط هست',
    tabSrc.includes('pt-resume-pick') && tabSrc.includes('pt-resume-open'));
  check('تب مستقیم به نقطه‌های مأموریت fetch نمی‌زند',
    !tabSrc.includes("fetch('/api/portfolio") && !tabSrc.includes('fetch(`/api/portfolio'));

  const resumeSrc = readSrc('../ui/portfolio-mission-resume.mjs');
  check('بازسازی به DOM و شبکه دست نمی‌زند',
    !/document\.|fetch\(/.test(resumeSrc));
  check('پیشنهاد استراتژی و تشکیل سبد وارد این برش نشده‌اند',
    !/suggest|portfolio-build/i.test(resumeSrc) && !/suggest/i.test(dataSrc));
}
