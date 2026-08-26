// ۱۱۶. UI مأموریت — انتظار بازار
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { generateCandidates } from '../../core/bereket-candidates.mjs';
import {
  MISSION_DIRECTIONS, MISSION_VOLATILITY_VIEWS, validateMissionOutlook,
} from '../../core/portfolio-mission.mjs';
import {
  createPortfolioOutlookDraft, createPortfolioStepOneDraft, parsePercentInput,
} from '../../ui/portfolio-mission-form.mjs';


// ═══════════════════════ ۱۱۶. UI مأموریت — انتظار بازار ═══════════════════════
//
// این مرحله باید outlook را مستقل از هدف، ریسک و نقدشوندگی اعتبارسنجی کند؛
// فرم حق ندارد برای عبور از قرارداد کامل، ورودی‌های هنوز پرسیده‌نشده بسازد.
group('۱۱۶. UI مأموریت — انتظار بازار');
{
  const bullish = {
    direction: 'bullish', targetPriceRial: 120_000,
    rangeLowRial: 110_000, rangeHighRial: 130_000,
    volatilityView: 'higher', expectedVolatilityPct: 45,
    confidencePct: 70, thesis: 'انتظار شکست مقاومت',
  };
  const checked = validateMissionOutlook(bullish);
  check('اعتبارسنج مستقل outlook بدون هدف و ریسک کامل می‌شود',
    checked.ok && checked.outlook.targetPriceRial === 120_000);
  check('اعتبارسنج outlook ورودی را تغییر نمی‌دهد',
    bullish.thesis === 'انتظار شکست مقاومت' && !Object.is(checked.outlook, bullish));
  check('دید خنثی بدون دو کران از هسته رد می‌شود',
    !validateMissionOutlook({ ...bullish, direction: 'neutral', targetPriceRial: null,
      rangeLowRial: null, rangeHighRial: null }).ok);
  check('دید پرنوسان بدون درصد تلاطم از هسته رد می‌شود',
    !validateMissionOutlook({ ...bullish, direction: 'volatile', expectedVolatilityPct: null }).ok);
  check('هدف بیرون بازه از اعتبارسنج مشترک عبور نمی‌کند',
    !validateMissionOutlook({ ...bullish, targetPriceRial: 140_000 }).ok);
  check('درصد فارسی با ممیز فارسی خوانده می‌شود', parsePercentInput('۴۵٫۵') === 45.5);
  check('درصد متنی بی‌صدا عدد نمی‌شود', Number.isNaN(parsePercentInput('هفتاد')));

  const setup = createPortfolioStepOneDraft({
    id: 'pt-outlook-test', baseIns: '900001',
    capitalToman: '۱٬۰۰۰٬۰۰۰٬۰۰۰', reserveToman: '۲۰۰٬۰۰۰٬۰۰۰',
    startDate: 20260521, startSecond: 9 * 3600,
    endDate: 20260621, endSecond: 12 * 3600 + 1800,
    grain: 'halfHour', createdAt: 123,
  });
  const outlook = createPortfolioOutlookDraft(setup.draft, {
    direction: 'bullish', targetPriceToman: '۱۲٬۰۰۰',
    rangeLowToman: '۱۱٬۰۰۰', rangeHighToman: '۱۳٬۰۰۰',
    volatilityView: 'higher', expectedVolatilityPct: '۴۵٫۵',
    confidencePct: '۷۰', thesis: '  انتظار شکست مقاومت  ',
  });
  check('آداپتر مرحله دوم draft مرحله نخست را حفظ می‌کند',
    outlook.ok && outlook.draft.session === setup.draft.session
    && outlook.draft.replay === setup.draft.replay && setup.draft.step === 'setup');
  check('قیمت تومان فقط یک بار در outlook به ریال تبدیل می‌شود',
    outlook.draft.outlook.targetPriceRial === 120_000
    && outlook.draft.outlook.rangeLowRial === 110_000);
  check('مرحله دوم فقط outlook معتبر به draft می‌افزاید',
    outlook.draft.step === 'outlook' && !('objective' in outlook.draft)
    && !('risk' in outlook.draft) && !('liquidity' in outlook.draft));
  check('قیمت هدف متنی حتی با بازه معتبر نادیده گرفته نمی‌شود',
    !createPortfolioOutlookDraft(setup.draft, {
      direction: 'neutral', targetPriceToman: 'هدف من', rangeLowToman: '۱۱٬۰۰۰',
      rangeHighToman: '۱۳٬۰۰۰', volatilityView: 'stable', confidencePct: '۷۰', thesis: 'بازه',
    }).ok);
  check('مرحله دوم بدون draft مرحله نخست ساخته نمی‌شود',
    !createPortfolioOutlookDraft(null, bullish).ok);

  const tab = readSrc('../ui/tabs/portfolio-time.mjs');
  const css = readSrc('../ui/style.css');
  check('مرحله انتظار همه ورودی‌های صریح کاربر را دارد',
    ['pt-direction', 'pt-target-price', 'pt-range-low', 'pt-range-high',
      'pt-volatility', 'pt-expected-volatility', 'pt-confidence', 'pt-thesis', 'pt-save-outlook']
      .every((id) => tab.includes(`id="${id}"`)));
  check('کارت‌های جهت و تلاطم مستقیم از کاتالوگ هسته می‌آیند',
    tab.includes('Object.entries(MISSION_DIRECTIONS)')
    && tab.includes('Object.entries(MISSION_VOLATILITY_VIEWS)'));
  check('مرحله دوم فقط پس از draft مرحله نخست باز می‌شود',
    tab.includes('id="pt-outlook-step"') && tab.includes('outlookStep.hidden = false')
    && tab.includes('invalidateSetupDraft()'));
  check('خط سناریو انتظار را از داده واقعی جا نمی‌زند',
    tab.includes('قیمت مشاهده‌شده یا پیش‌بینی سیستم نیستند'));
  check('UI برای outlook فقط آداپتر مرحله‌ای قرارداد را مصرف می‌کند',
    tab.includes('createPortfolioOutlookDraft(setupDraft')
    && !tab.includes('generateCandidates'));
  check('draft انتظار همچنان فقط در حافظه تب است',
    tab.includes("root.dataset.outlookReady = 'true'")
    && !tab.includes('localStorage') && !tab.includes('saveSession'));
  check('کارت‌ها، خط سناریو و اطمینان سبک بصری مستقل دارند',
    css.includes('.pt-choice input:checked + span')
    && css.includes('.pt-scenario-track') && css.includes('.pt-confidence'));
  check('مرحله انتظار در موبایل تک‌ستونه می‌شود',
    css.includes('.pt-choice-grid, .pt-volatility-grid, .pt-outlook-price-grid, .pt-outlook-detail-grid,')
    && css.includes('.pt-risk-input-grid, .pt-liquidity-grid, .pt-binary, .pt-budget-values { grid-template-columns: 1fr; }'));
}
