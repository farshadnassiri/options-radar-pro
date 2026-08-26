// ۱۱۷. UI مأموریت — ریسک و نقدشوندگی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { generateCandidates } from '../../core/bereket-candidates.mjs';
import {
  portfolioMissionRiskBudget, validateMissionLiquidity, validateMissionRisk,
} from '../../core/portfolio-mission.mjs';
import { createPortfolioSession } from '../../core/portfolio-session.mjs';
import {
  createPortfolioOutlookDraft, createPortfolioRiskDraft, createPortfolioStepOneDraft, parseIntegerInput, previewPortfolioRisk,
} from '../../ui/portfolio-mission-form.mjs';


// ═════════════════════ ۱۱۷. UI مأموریت — ریسک و نقدشوندگی ═════════════════════
//
// مرزهای ریسک و اجرا باید پیش از تخصیص خانواده‌ها مستقل، صریح و بدون
// پیش‌فرض مالی اعتبارسنجی شوند و نمودار بودجه فقط از همان قرارداد بیاید.
group('۱۱۷. UI مأموریت — ریسک و نقدشوندگی');
{
  const risk = {
    maxLossPct: 8, maxDrawdownPct: 15, minFreeCapitalPct: 20,
    maxMarginUsePct: 60, allowUnlimitedRisk: false,
  };
  const liquidity = {
    minUnderlyingDailyValueRial: 100_000_000_000,
    minOptionDailyValueRial: 1_000_000_000, minOpenInterest: 100,
    maxSpreadPct: 8, maxBookTakePct: 30, requireFullBook: true,
  };
  check('قرارداد مستقل ریسک بدون بخش‌های دیگر مأموریت معتبر می‌شود',
    validateMissionRisk(risk).ok);
  check('قرارداد ریسک ورودی را تغییر نمی‌دهد',
    validateMissionRisk(risk).risk !== risk && risk.maxLossPct === 8);
  check('زیان معامله بزرگ‌تر از افت کل رد می‌شود',
    !validateMissionRisk({ ...risk, maxLossPct: 20 }).ok);
  check('جمع سرمایه آزاد و وجه تضمین بالای صد رد می‌شود',
    !validateMissionRisk({ ...risk, maxMarginUsePct: 90 }).ok);
  check('ریسک نامحدود بدون انتخاب صریح رد می‌شود',
    !validateMissionRisk({ ...risk, allowUnlimitedRisk: undefined }).ok);
  check('قرارداد مستقل نقدشوندگی همه دروازه‌ها را نگه می‌دارد',
    validateMissionLiquidity(liquidity).ok);
  check('موقعیت باز اعشاری از دروازه نقدشوندگی عبور نمی‌کند',
    !validateMissionLiquidity({ ...liquidity, minOpenInterest: 1.5 }).ok);
  check('اسپرد صفر و انتخاب متنی دفتر کامل رد می‌شوند',
    !validateMissionLiquidity({ ...liquidity, maxSpreadPct: 0 }).ok
    && !validateMissionLiquidity({ ...liquidity, requireFullBook: 'yes' }).ok);

  const made = createPortfolioSession({
    id: 'pt-risk-session', baseIns: '900001',
    start: { date: 20260521, second: 9 * 3600 },
    end: { date: 20260621, second: 12 * 3600 + 1800 },
    initialCapitalRial: 10_000_000_000, reservePct: 20,
  });
  const budget = portfolioMissionRiskBudget(made.session, risk);
  check('بودجه دیداری فقط از سرمایه قابل تخصیص و ریسک معتبر می‌آید',
    budget.ok && budget.budget.allocatableRial === 8_000_000_000
    && budget.budget.minFreeCapitalRial === 1_600_000_000
    && budget.budget.maxMarginUseRial === 4_800_000_000
    && budget.budget.flexiblePct === 20);
  check('بودجه با ریسک نامعتبر عدد نمی‌سازد',
    !portfolioMissionRiskBudget(made.session, { ...risk, maxMarginUsePct: 90 }).ok);
  check('عدد صحیح فارسی برای موقعیت باز خوانده می‌شود', parseIntegerInput('۱٬۲۵۰') === 1250);

  const setup = createPortfolioStepOneDraft({
    id: 'pt-risk-ui', baseIns: '900001', capitalToman: '۱٬۰۰۰٬۰۰۰٬۰۰۰',
    reserveToman: '۲۰۰٬۰۰۰٬۰۰۰', startDate: 20260521, startSecond: 9 * 3600,
    endDate: 20260621, endSecond: 12 * 3600 + 1800, grain: 'halfHour', createdAt: 123,
  });
  const outlook = createPortfolioOutlookDraft(setup.draft, {
    direction: 'bullish', targetPriceToman: '۱۲٬۰۰۰',
    rangeLowToman: '۱۱٬۰۰۰', rangeHighToman: '۱۳٬۰۰۰',
    volatilityView: 'higher', expectedVolatilityPct: '۴۵', confidencePct: '۷۰',
    thesis: 'انتظار شکست مقاومت',
  });
  const riskForm = {
    maxLossPct: '۸', maxDrawdownPct: '۱۵', minFreeCapitalPct: '۲۰',
    maxMarginUsePct: '۶۰', allowUnlimitedRisk: 'no',
    minUnderlyingDailyValueToman: '۱۰٬۰۰۰٬۰۰۰٬۰۰۰',
    minOptionDailyValueToman: '۱۰۰٬۰۰۰٬۰۰۰', minOpenInterest: '۱۰۰',
    maxSpreadPct: '۸', maxBookTakePct: '۳۰', requireFullBook: 'yes',
  };
  const riskDraft = createPortfolioRiskDraft(outlook.draft, riskForm);
  check('مرحله ریسک همان session و outlook را حفظ می‌کند',
    riskDraft.ok && riskDraft.draft.session === outlook.draft.session
    && riskDraft.draft.outlook === outlook.draft.outlook && outlook.draft.step === 'outlook');
  check('ارزش روزانه تومان فقط یک بار به ریال تبدیل می‌شود',
    riskDraft.draft.liquidity.minUnderlyingDailyValueRial === 100_000_000_000
    && riskDraft.draft.liquidity.minOptionDailyValueRial === 1_000_000_000);
  check('مرحله سوم فقط risk و liquidity معتبر اضافه می‌کند',
    riskDraft.draft.step === 'risk' && !('objective' in riskDraft.draft));
  check('پیش‌نمایش UI با همان بودجه هسته یکی است',
    previewPortfolioRisk(outlook.draft, riskForm).budget.minFreeCapitalRial === 1_600_000_000);
  check('مرحله ریسک بدون outlook معتبر ساخته نمی‌شود',
    !createPortfolioRiskDraft(setup.draft, riskForm).ok);
  check('درصد متنی یا انتخاب گمشده بی‌صدا پیش‌فرض نمی‌شود',
    !createPortfolioRiskDraft(outlook.draft, { ...riskForm, maxLossPct: 'هشت' }).ok
    && !createPortfolioRiskDraft(outlook.draft, { ...riskForm, requireFullBook: '' }).ok);

  const tab = readSrc('../ui/tabs/portfolio-time.mjs');
  const css = readSrc('../ui/style.css');
  check('مرحله ریسک همه یازده ورودی صریح را دارد',
    ['pt-max-loss', 'pt-max-drawdown', 'pt-min-free', 'pt-max-margin', 'pt-unlimited',
      'pt-underlying-value', 'pt-option-value', 'pt-open-interest', 'pt-max-spread',
      'pt-book-take', 'pt-full-book', 'pt-save-risk'].every((id) => tab.includes(`id="${id}"`)));
  check('مرحله ریسک فقط بعد از outlook معتبر باز می‌شود',
    tab.includes('riskStep.hidden = false') && tab.includes('outlookDraft = result.draft')
    && tab.includes('invalidateOutlookDraft()'));
  check('نمودار بودجه از preview مشترک تغذیه می‌شود',
    tab.includes('previewPortfolioRisk(outlookDraft') && tab.includes('minFreeCapitalRial'));
  check('مرحله ریسک پیشنهاد یا ذخیره پنهان نمی‌سازد',
    !tab.includes('generateCandidates') && !tab.includes('localStorage'));
  check('بودجه، انتخاب‌های دوحالته و موبایل سبک مستقل دارند',
    css.includes('.pt-budget-track') && css.includes('.pt-binary input:checked + span')
    && css.includes('.pt-risk-input-grid, .pt-liquidity-grid, .pt-binary, .pt-budget-values { grid-template-columns: 1fr; }'));
}
