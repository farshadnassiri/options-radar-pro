// ۱۱۹. UI مأموریت — مرور، قفل و عکس شروع
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { generateCandidates } from '../../core/bereket-candidates.mjs';
import { chooseCandidates } from '../../core/bereket-session.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { createPortfolioMission } from '../../core/portfolio-mission.mjs';
import { recordPortfolioTransaction, setPortfolioMission } from '../../core/portfolio-session.mjs';
import { createTimeGate } from '../../core/time-gate.mjs';
import {
  activatePortfolioMissionDraft, createPortfolioAllocationDraft, createPortfolioMissionDraft, createPortfolioOutlookDraft, createPortfolioRiskDraft, createPortfolioStepOneDraft, previewPortfolioMission,
} from '../../ui/portfolio-mission-form.mjs';


// ═════════════════════ ۱۱۹. UI مأموریت — مرور، قفل و عکس شروع ═════════════════════
//
// آخرین مرحله باید قرارداد کامل را بدون هدف پنهان بسازد و snapshot همان
// لحظه را با مدرک کیفیت قفل کند؛ پیشنهاد و چیدمان سبد هنوز بیرون این برش است.
group('۱۱۹. UI مأموریت — مرور، قفل و عکس شروع');
{
  const setup = createPortfolioStepOneDraft({
    id: 'pt-review-ui', baseIns: '900001', capitalToman: '۱٬۰۰۰٬۰۰۰٬۰۰۰',
    reserveToman: '۲۰۰٬۰۰۰٬۰۰۰', startDate: 20260521, startSecond: 9 * 3600,
    endDate: 20260621, endSecond: 12 * 3600 + 1800, grain: 'halfHour', createdAt: 123,
  });
  const outlook = createPortfolioOutlookDraft(setup.draft, {
    direction: 'bullish', targetPriceToman: '۱۲٬۰۰۰', rangeLowToman: '۱۱٬۰۰۰',
    rangeHighToman: '۱۳٬۰۰۰', volatilityView: 'higher', expectedVolatilityPct: '۴۵',
    confidencePct: '۷۰', thesis: 'انتظار شکست مقاومت',
  });
  const risk = createPortfolioRiskDraft(outlook.draft, {
    maxLossPct: '۸', maxDrawdownPct: '۱۵', minFreeCapitalPct: '۲۰',
    maxMarginUsePct: '۶۰', allowUnlimitedRisk: 'no',
    minUnderlyingDailyValueToman: '۱۰٬۰۰۰٬۰۰۰٬۰۰۰',
    minOptionDailyValueToman: '۱۰۰٬۰۰۰٬۰۰۰', minOpenInterest: '۱۰۰',
    maxSpreadPct: '۸', maxBookTakePct: '۳۰', requireFullBook: 'yes',
  });
  const allocation = createPortfolioAllocationDraft(risk.draft, [
    { familyId: 'income', pct: '۳۰' }, { familyId: 'vertical', pct: '۴۰' },
  ]);
  const objective = {
    objectiveMode: 'growth', returnBase: 'allocatable',
    targetReturnPct: '۱۲٫۵', maxHoldingDays: '۳۰',
  };
  const preview = previewPortfolioMission(allocation.draft, objective);
  check('مرور کامل درصد فارسی و افق صریح را به قرارداد هسته می‌دهد',
    preview.ok && preview.mission.objective.targetReturnPct === 12.5
    && preview.mission.objective.maxHoldingDays === 30);
  check('سود هدف فقط از مبنای انتخاب‌شده کاربر محاسبه می‌شود',
    preview.mission.objective.targetProfitRial === 1_000_000_000);
  check('هدف، مبنا، درصد یا افق گمشده پیش‌فرض نمی‌گیرد',
    !previewPortfolioMission(allocation.draft, { ...objective, objectiveMode: '' }).ok
    && !previewPortfolioMission(allocation.draft, { ...objective, returnBase: '' }).ok
    && !previewPortfolioMission(allocation.draft, { ...objective, targetReturnPct: '' }).ok
    && !previewPortfolioMission(allocation.draft, { ...objective, maxHoldingDays: '' }).ok);
  check('افق اعشاری یا بازده متنی بی‌صدا تبدیل نمی‌شود',
    !previewPortfolioMission(allocation.draft, { ...objective, maxHoldingDays: '۲٫۵' }).ok
    && !previewPortfolioMission(allocation.draft, { ...objective, targetReturnPct: 'دوازده' }).ok);
  check('مرور بدون تخصیص معتبر ساخته نمی‌شود',
    !previewPortfolioMission(risk.draft, objective).ok);

  const locked = createPortfolioMissionDraft(allocation.draft, objective);
  check('قفل مرحله پنجم mission را داخل session پیش‌نویس ثبت می‌کند',
    locked.ok && locked.draft.step === 'mission'
    && locked.draft.session.mission.id === 'mission-pt-review-ui');
  check('نسخه تخصیص ورودی هنگام قفل مأموریت تغییر نمی‌کند',
    !allocation.draft.session.mission && locked.draft.session !== allocation.draft.session);
  const snapshot = {
    universe: { rows: [], quality: makeDataQuality({
      kind: 'estimated', source: 'current-watch-fallback', asOf: setup.draft.session.start,
      reason: 'فهرست همان تاریخ در آرشیو نبود',
    }) },
    daily: { rows: [{ date: 20260520 }], quality: makeDataQuality({
      kind: 'observed', source: 'historical-daily', sufficient: true,
    }) },
    intraday: { trade: null, quality: makeDataQuality({
      kind: 'missing', source: 'historical-trades', reason: 'ریزمعامله‌ای ثبت نشده است',
    }) },
    book: { quote: null, quality: makeDataQuality({
      kind: 'missing', source: 'best-limits-history', reason: 'دفتر قابل بازسازی نبود',
    }) },
  };
  const active = activatePortfolioMissionDraft(locked.draft, snapshot);
  check('فعال‌سازی فقط در همان لحظه شروع و با snapshot قفل‌شده انجام می‌شود',
    active.ok && active.draft.step === 'active'
    && active.draft.snapshot.at.date === 20260521
    && active.draft.snapshot.at.second === 9 * 3600);
  check('خوراک ناکافی عدد نمی‌سازد و بدترین کیفیت را نگه می‌دارد',
    active.draft.snapshot.quality.missing && !active.draft.snapshot.quality.sufficient
    && active.draft.snapshot.intraday.trade === null);
  check('دلیل نبود داده تا هشدارهای session حفظ می‌شود',
    active.draft.session.dataWarnings.some((row) => row.includes('ریزمعامله'))
    && active.draft.session.dataWarnings.some((row) => row.includes('دفتر')));
  check('فعال‌سازی بدون draft مأموریت رد می‌شود',
    !activatePortfolioMissionDraft(allocation.draft, snapshot).ok);

  const tab = readSrc('../ui/tabs/portfolio-time.mjs');
  const adapter = readSrc('../ui/portfolio-mission-form.mjs');
  const css = readSrc('../ui/style.css');
  check('مرحله مرور چهار ورودی هدف را بدون radio انتخاب‌شده دارد',
    ['pt-objective', 'pt-return-base', 'pt-target-return', 'pt-max-holding', 'pt-start-mission']
      .every((id) => tab.includes(`id="${id}"`))
    && tab.includes('name="pt-objective" value="${value}"><span>')
    && tab.includes('name="pt-return-base" value="${value}"><span>'));
  check('مرور نهایی پنج ایستگاه و مسیر بازگشت به هر بخش دارد',
    ['setup', 'outlook', 'risk', 'allocation', 'objective']
      .every((step) => tab.includes(`data-pt-edit="${step}"`)));
  check('مرور نهایی ورودی‌های ثبت‌شده و سرمایه تخصیص‌نیافته را کامل نشان می‌دهد',
    ['سرمایه شروع', 'ذخیره', 'تلاطم مورد انتظار', 'دلیل:', 'افت کل',
      'ریسک نامحدود', 'موقعیت باز', 'مصرف عمق', 'تخصیص‌نیافته', 'مبنای بازده ثبت نشده']
      .every((text) => tab.includes(text)));
  check('قرارداد کامل اول با create و سپس با set هسته قفل می‌شود',
    adapter.includes('createPortfolioMission(allocationDraft.session, parsed.input)')
    && adapter.includes('setPortfolioMission(allocationDraft.session, parsed.input)'));
  check('عکس شروع از time gate و بارگذار تاریخی ساخته می‌شود',
    tab.includes('createTimeGate({') && tab.includes('gateLoaders()')
    && tab.includes('/api/history/universe?date='));
  check('کیفیت و علت ناکافی در رابط دیده می‌شوند',
    ['pt-snapshot-kind', 'pt-snapshot-sufficient', 'pt-snapshot-source',
      'pt-snapshot-at', 'pt-snapshot-reasons'].every((id) => tab.includes(`id="${id}"`)));
  check('مرحله پنجم پیشنهاد یا چیدمان استراتژی را شروع نمی‌کند',
    !tab.includes('generateCandidates') && !tab.includes('chooseCandidates')
    && !tab.includes('recordPortfolioTransaction'));
  check('مرور و کیفیت در دسکتاپ شبکه‌ای و در موبایل تک‌ستونه‌اند',
    css.includes('.pt-final-review-grid') && css.includes('.pt-snapshot-grid')
    && css.includes('.pt-allocation-totals, .pt-mission-objective-grid, .pt-final-review-grid, .pt-snapshot-grid { grid-template-columns: 1fr; }'));
  check('پس از قفل، مرحله جاری در نوار موبایل ناپدید نمی‌شود',
    tab.includes("review.classList.toggle('active', stage === 'review' || stage === 'active')"));
}
