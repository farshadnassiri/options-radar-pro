import { buildChain, underlyingList } from '../../core/chain.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { historyDateLabel, normalizeHistoryDate } from '../../core/history.mjs';
import {
  MISSION_DIRECTIONS, MISSION_OBJECTIVES, MISSION_REPLAY_GRAINS,
  MISSION_RETURN_BASES, MISSION_VOLATILITY_VIEWS,
} from '../../core/portfolio-mission.mjs';
import { createTimeGate } from '../../core/time-gate.mjs';
import { GROUPS as STRATEGY_FAMILIES } from '../../strategies/catalog.mjs';
import { portfolioSessionProposals } from '../portfolio-proposals.mjs';
import { breachText, portfolioLedgerView } from '../portfolio-ledger-view.mjs';
import {
  closeDoneText, closeFailureText, portfolioSessionPositionsView,
} from '../portfolio-positions-view.mjs';
import {
  PORTFOLIO_COMMIT_REASONS, PORTFOLIO_COMMIT_VERSION, commitPortfolioPlan,
} from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import { portfolioSessionValuation } from '../../core/portfolio-valuation.mjs';
import { portfolioDossierAnalysis } from '../../core/portfolio-dossier-analysis.mjs';
import { portfolioDossierWeaknesses } from '../../core/portfolio-dossier-weakness.mjs';
import { portfolioDossierComparison } from '../../core/portfolio-dossier-compare.mjs';
import { portfolioCapitalGrowth } from '../../core/portfolio-capital-growth.mjs';
import { momentKey } from '../../core/trading-calendar.mjs';
import { stepPortfolioSession } from '../../core/portfolio-clock.mjs';
import { portfolioMomentSnapshot } from '../../core/portfolio-snapshot.mjs';
import { portfolioClockView, stepResultText } from '../portfolio-clock-view.mjs';
import { loadMomentContracts } from '../portfolio-snapshot-data.mjs';
import { createPortfolioHistoryRequestGate } from '../portfolio-history-request.mjs';
import { payoffSummaryText, portfolioPayoffView } from '../portfolio-payoff-view.mjs';
import { portfolioWatchView } from '../portfolio-watch-view.mjs';
import { portfolioDossierAnalysisView } from '../portfolio-dossier-analysis-view.mjs';
import { portfolioDossierWeaknessView } from '../portfolio-dossier-weakness-view.mjs';
import { portfolioDossierComparisonView } from '../portfolio-dossier-compare-view.mjs';
import { downloadPortfolioDossier } from '../portfolio-dossier-export.mjs';
import {
  attachPortfolioCapitalContinuity, portfolioCapitalContinuityView,
} from '../portfolio-capital-continuity-view.mjs';
import { portfolioCapitalGrowthView } from '../portfolio-capital-growth-view.mjs';
import {
  closeoutPreflight, closeoutView, dossierRecordView,
} from '../portfolio-closeout-view.mjs';
import { mountPayoff } from '../chart.mjs';
import { feesOf, marginParamsOf } from '../../core/settings.mjs';
import {
  activatePortfolioMissionDraft, createPortfolioAllocationDraft, createPortfolioMissionDraft,
  createPortfolioOutlookDraft, createPortfolioRiskDraft,
  createPortfolioStepOneDraft, parseIntegerInput, parsePercentInput, parseTomanInput,
  previewPortfolioAllocations,
  previewPortfolioCapital, previewPortfolioRisk,
} from '../portfolio-mission-form.mjs';
import { gateLoaders } from '../bereket-data.mjs';
import {
  filterPortfolioEligibilityRows, portfolioSessionEligibility,
} from '../portfolio-eligibility.mjs';
import { listMissionSaves, loadMissionSave, saveMissionDraft } from '../portfolio-mission-data.mjs';
import {
  listDossiers, loadDossier, persistDossierView,
} from '../portfolio-dossier-data.mjs';
import { missionSaveLabel, resumeMissionRecord } from '../portfolio-mission-resume.mjs';
import { mountDateWheel } from '../datewheel.mjs';
import { fmt, faDigits } from '../fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const TIME_OPTIONS = [
  [9 * 3600, '۰۹:۰۰'], [9 * 3600 + 30 * 60, '۰۹:۳۰'],
  [10 * 3600, '۱۰:۰۰'], [10 * 3600 + 30 * 60, '۱۰:۳۰'],
  [11 * 3600, '۱۱:۰۰'], [11 * 3600 + 30 * 60, '۱۱:۳۰'],
  [12 * 3600, '۱۲:۰۰'], [12 * 3600 + 30 * 60, '۱۲:۳۰'],
];

const timeOptions = (selected) => TIME_OPTIONS.map(([value, label]) =>
  `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');

const grainOptions = () => Object.entries(MISSION_REPLAY_GRAINS).map(([value, row]) =>
  `<option value="${value}"${value === 'halfHour' ? ' selected' : ''}>${row.label}</option>`).join('');

const directionCards = () => Object.entries(MISSION_DIRECTIONS).map(([value, label], index) =>
  `<label class="pt-choice"><input type="radio" name="pt-direction" value="${value}"${index === 0 ? ' checked' : ''}><span><b>${label}</b><small>${({ bullish: 'انتظار حرکت رو به بالا', neutral: 'ماندن در یک محدوده', bearish: 'انتظار حرکت رو به پایین', volatile: 'حرکت بزرگ، مستقل از جهت' })[value]}</small></span></label>`).join('');

const volatilityCards = () => Object.entries(MISSION_VOLATILITY_VIEWS).map(([value, label], index) =>
  `<label class="pt-choice compact"><input type="radio" name="pt-volatility" value="${value}"${index === 1 ? ' checked' : ''}><span><b>${label}</b></span></label>`).join('');

const familyOptions = (selected = '') => `<option value="">انتخاب خانواده…</option>${Object.entries(STRATEGY_FAMILIES)
  .map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('')}`;

const objectiveCards = () => Object.entries(MISSION_OBJECTIVES).map(([value, label]) =>
  `<label class="pt-choice compact"><input type="radio" name="pt-objective" value="${value}"><span><b>${label}</b></span></label>`).join('');

const returnBaseCards = () => Object.entries(MISSION_RETURN_BASES).map(([value, label]) =>
  `<label><input type="radio" name="pt-return-base" value="${value}"><span>${label}</span></label>`).join('');

export async function mount(root, { state, api }) {
  root.innerHTML = `<div class="pt-studio">
    <section class="pt-hero">
      <div><p class="eyebrow">بازی تصمیم در گذشته · بدون اطلاعات پنهان</p>
        <h1>استودیوی سفر زمانی سبد</h1>
        <p>سرمایه و لحظه ورود را مشخص کن؛ در مراحل بعد سیستم فقط استراتژی‌هایی را می‌سنجد که همان لحظه واقعاً امکان ساخت داشته‌اند.</p></div>
      <div class="pt-hero-orbit" aria-hidden="true"><b>۱</b><span>سرمایه</span><i></i><b>۲</b><span>زمان</span></div>
    </section>

    <nav class="pt-progress" aria-label="مراحل ساخت سبد">
      <div class="active" id="pt-progress-setup" aria-current="step"><b>۱</b><span>زمان و سرمایه</span><small>در حال تکمیل</small></div>
      <div id="pt-progress-outlook"><b>۲</b><span>انتظار بازار</span><small>قفل</small></div>
      <div id="pt-progress-risk"><b>۳</b><span>ریسک و نقدشوندگی</span><small>قفل</small></div>
      <div id="pt-progress-allocation"><b>۴</b><span>تخصیص خانواده‌ها</span><small>قفل</small></div>
      <div id="pt-progress-review"><b>۵</b><span>مرور و شروع</span><small>قفل</small></div>
    </nav>

    <section class="pt-layout">
      <div class="pt-main">
        <section class="card pt-card" data-pt-setup>
          <div class="section-head"><div><p class="eyebrow">مرحله نخست · بخش یک</p><h2>سرمایه‌ای که با خودت به گذشته می‌بری</h2></div><span>واحد ورود: تومان</span></div>
          <div class="pt-form-grid pt-money-grid">
            <label class="field" id="pt-capital-field"><span>ارزش پورتفو در شروع</span>
              <input id="pt-capital" type="text" inputmode="numeric" value="۱٬۰۰۰٬۰۰۰٬۰۰۰" aria-describedby="pt-capital-hint pt-capital-error">
              <small class="hint" id="pt-capital-hint">نمونه: یک میلیارد تومان</small><small class="pt-field-error" id="pt-capital-error" hidden></small></label>
            <label class="field" id="pt-reserve-field"><span>ذخیره نقدی کنارگذاشته‌شده</span>
              <input id="pt-reserve" type="text" inputmode="numeric" value="۰" aria-describedby="pt-reserve-hint pt-reserve-error">
              <small class="hint" id="pt-reserve-hint">این مبلغ وارد تخصیص استراتژی‌ها نمی‌شود.</small><small class="pt-field-error" id="pt-reserve-error" hidden></small></label>
          </div>
          <div class="pt-capital-board" aria-live="polite">
            <article><span>سرمایه کل</span><b id="pt-total">—</b><small>تومان</small></article>
            <article><span>ذخیره</span><b id="pt-reserve-view">—</b><small id="pt-reserve-pct">—</small></article>
            <article class="accent"><span>قابل تخصیص</span><b id="pt-allocatable">—</b><small>مبنای بودجه خانواده‌ها</small></article>
          </div>
          <aside class="pt-capital-source" id="pt-capital-source" hidden>
            <b>سرمایه از پرونده قبلی</b><p id="pt-capital-source-text"></p>
          </aside>
        </section>

        <section class="card pt-card" data-pt-setup>
          <div class="section-head"><div><p class="eyebrow">مرحله نخست · بخش دو</p><h2>کدام نماد، در کدام لحظه؟</h2></div><b id="pt-feed-status" role="status" aria-live="polite">در حال دریافت فهرست نمادها…</b></div>
          <div class="pt-symbol-row">
            <label class="field" id="pt-base-field"><span>نماد پایه</span><select id="pt-base"><option value="">در حال دریافت…</option></select><small class="hint">نام و تاریخ واقعی پنهان نمی‌شود.</small><small class="pt-field-error" id="pt-base-error" hidden></small></label>
            <button type="button" class="ghost" id="pt-retry" hidden>تلاش دوباره</button>
          </div>
          <div class="pt-date-grid" id="pt-dates" hidden>
            <section><div class="pt-date-title"><div><span>شروع سفر</span><b>روز ورود و چیدمان سبد</b></div><label>ساعت شروع<select id="pt-start-time">${timeOptions(9 * 3600)}</select></label></div><div id="pt-start-date"></div><small class="pt-field-error" id="pt-start-error" hidden></small></section>
            <section><div class="pt-date-title"><div><span>پایان سفر</span><b>آخرین لحظه داوری</b></div><label>ساعت پایان<select id="pt-end-time">${timeOptions(12 * 3600 + 30 * 60)}</select></label></div><div id="pt-end-date"></div><small class="pt-field-error" id="pt-end-error" hidden></small></section>
          </div>
          <div class="pt-form-grid pt-grain-row">
            <label class="field" id="pt-grain-field"><span>تایم‌فریم پخش فیلم سبد</span><select id="pt-grain">${grainOptions()}</select><small class="hint">تایم‌فریم ریزتر، رویدادها و نقاط نمودار بیشتری دارد.</small><small class="pt-field-error" id="pt-grain-error" hidden></small></label>
          </div>
        </section>

        <section class="card pt-card pt-outlook-card" id="pt-outlook-step" aria-labelledby="pt-outlook-title" hidden>
          <div class="section-head"><div><p class="eyebrow">مرحله دوم · انتظار تو</p><h2 id="pt-outlook-title">بازار را در پایان این سفر چطور می‌بینی؟</h2></div><span class="pt-stage-badge">بدون دیدن آینده</span></div>

          <fieldset class="pt-fieldset" id="pt-direction-field"><legend>جهت مورد انتظار</legend><div class="pt-choice-grid" id="pt-direction">${directionCards()}</div><small class="pt-field-error" id="pt-direction-error" hidden></small></fieldset>

          <div class="pt-form-grid pt-outlook-price-grid">
            <label class="field"><span>قیمت هدف</span><input id="pt-target-price" type="text" inputmode="numeric" placeholder="تومان" aria-describedby="pt-target-hint pt-target-error"><small class="hint" id="pt-target-hint">برای دید صعودی یا نزولی لازم است.</small><small class="pt-field-error" id="pt-target-error" hidden></small></label>
            <label class="field"><span>کران پایین بازه</span><input id="pt-range-low" type="text" inputmode="numeric" placeholder="تومان" aria-describedby="pt-range-hint pt-range-error"><small class="hint" id="pt-range-hint">دو کران را با هم وارد کن.</small><small class="pt-field-error" id="pt-range-error" hidden></small></label>
            <label class="field"><span>کران بالای بازه</span><input id="pt-range-high" type="text" inputmode="numeric" placeholder="تومان" aria-describedby="pt-range-hint pt-range-error"></label>
          </div>

          <section class="pt-scenario" aria-labelledby="pt-scenario-title">
            <div><p class="eyebrow">تصویر فشرده فرض تو</p><h3 id="pt-scenario-title">خط سناریوی قیمت</h3></div>
            <div class="pt-scenario-track" id="pt-scenario-track" data-direction="bullish"><i></i><span class="low" id="pt-marker-low" hidden></span><span class="target" id="pt-marker-target" hidden></span><span class="high" id="pt-marker-high" hidden></span></div>
            <div class="pt-scenario-values"><span>پایین<b id="pt-scenario-low">—</b></span><span>هدف<b id="pt-scenario-target">—</b></span><span>بالا<b id="pt-scenario-high">—</b></span></div>
            <p id="pt-scenario-note">اعداد این خط، انتظار خود تو هستند؛ قیمت مشاهده‌شده یا پیش‌بینی سیستم نیستند.</p>
          </section>

          <fieldset class="pt-fieldset" id="pt-volatility-field"><legend>انتظار تلاطم</legend><div class="pt-choice-grid pt-volatility-grid" id="pt-volatility">${volatilityCards()}</div><small class="pt-field-error" id="pt-volatility-error" hidden></small></fieldset>

          <div class="pt-outlook-detail-grid">
            <label class="field"><span>تلاطم مورد انتظار</span><input id="pt-expected-volatility" type="text" inputmode="decimal" placeholder="درصد" aria-describedby="pt-expected-volatility-hint pt-expected-volatility-error"><small class="hint" id="pt-expected-volatility-hint">برای دید پرنوسان لازم است.</small></label>
            <label class="field pt-confidence"><span>درجه اطمینان <output id="pt-confidence-view">۷۰٪</output></span><input id="pt-confidence" type="range" min="0" max="100" step="5" value="70" aria-describedby="pt-confidence-error"><small class="pt-field-error" id="pt-confidence-error" hidden></small></label>
          </div>
          <small class="pt-field-error" id="pt-expected-volatility-error" hidden></small>

          <label class="field pt-thesis"><span>دلیل تصمیم و چیزی که انتظار داری رخ دهد</span><textarea id="pt-thesis" maxlength="2000" rows="4" placeholder="مثلاً انتظار دارم بعد از شکست مقاومت، قیمت با تلاطم بیشتر رشد کند." aria-describedby="pt-thesis-count pt-thesis-error"></textarea><small class="hint" id="pt-thesis-count">۰ از ۲٬۰۰۰ نویسه</small><small class="pt-field-error" id="pt-thesis-error" hidden></small></label>
          <div class="pt-stage-actions"><button type="button" class="primary" id="pt-save-outlook">ثبت انتظار بازار</button><p class="pt-save-state" id="pt-outlook-state" role="status" aria-live="polite">ابتدا فرض خود را کامل کن.</p></div>
        </section>

        <section class="card pt-card pt-risk-card" id="pt-risk-step" aria-labelledby="pt-risk-title" hidden>
          <div class="section-head"><div><p class="eyebrow">مرحله سوم · مرزهای بقا</p><h2 id="pt-risk-title">پیش از سود، حد تحمل سبد را مشخص کن</h2></div><span class="pt-stage-badge">بدون مقدار پنهان</span></div>

          <div class="pt-risk-input-grid">
            <label class="field"><span>سقف زیان هر معامله</span><input id="pt-max-loss" type="text" inputmode="decimal" placeholder="درصد" aria-describedby="pt-max-loss-hint pt-max-loss-error"><small class="hint" id="pt-max-loss-hint">نسبت به سرمایه قابل تخصیص</small><small class="pt-field-error" id="pt-max-loss-error" hidden></small></label>
            <label class="field"><span>سقف افت کل سبد</span><input id="pt-max-drawdown" type="text" inputmode="decimal" placeholder="درصد" aria-describedby="pt-max-drawdown-hint pt-max-drawdown-error"><small class="hint" id="pt-max-drawdown-hint">باید حداقل برابر سقف زیان معامله باشد.</small><small class="pt-field-error" id="pt-max-drawdown-error" hidden></small></label>
            <label class="field"><span>حداقل سرمایه آزاد</span><input id="pt-min-free" type="text" inputmode="decimal" placeholder="درصد" aria-describedby="pt-min-free-hint pt-min-free-error"><small class="hint" id="pt-min-free-hint">همیشه خارج از موقعیت‌ها نگه داشته می‌شود.</small><small class="pt-field-error" id="pt-min-free-error" hidden></small></label>
            <label class="field"><span>سقف مصرف وجه تضمین</span><input id="pt-max-margin" type="text" inputmode="decimal" placeholder="درصد" aria-describedby="pt-max-margin-hint pt-max-margin-error"><small class="hint" id="pt-max-margin-hint">جمع آن با سرمایه آزاد نباید از صد بگذرد.</small><small class="pt-field-error" id="pt-max-margin-error" hidden></small></label>
          </div>

          <fieldset class="pt-fieldset pt-binary-field" id="pt-unlimited-field"><legend>آیا استراتژی با ریسک نظری نامحدود مجاز است؟</legend><div class="pt-binary" id="pt-unlimited"><label><input type="radio" name="pt-unlimited" value="no"><span>خیر، فقط ریسک محدود</span></label><label><input type="radio" name="pt-unlimited" value="yes"><span>بله، با رعایت سایر سقف‌ها</span></label></div><small class="pt-field-error" id="pt-unlimited-error" hidden></small></fieldset>

          <section class="pt-budget" aria-labelledby="pt-budget-title">
            <div><p class="eyebrow">بودجه روی سرمایه قابل تخصیص</p><h3 id="pt-budget-title">نقشه درگیری سرمایه</h3></div>
            <div class="pt-budget-track" id="pt-budget-track"><i class="free" id="pt-budget-free-bar"></i><i class="margin" id="pt-budget-margin-bar"></i><i class="flex" id="pt-budget-flex-bar"></i></div>
            <div class="pt-budget-values">
              <article><span>حداقل آزاد</span><b id="pt-budget-free-pct">—</b><small id="pt-budget-free-rial">—</small></article>
              <article><span>سقف وجه تضمین</span><b id="pt-budget-margin-pct">—</b><small id="pt-budget-margin-rial">—</small></article>
              <article><span>بخش انعطاف‌پذیر</span><b id="pt-budget-flex-pct">—</b><small>اختصاص‌نیافته بین دو سقف</small></article>
            </div>
            <p>این نمودار پیشنهاد تخصیص نیست؛ فقط مرزهایی را که خودت ثبت کرده‌ای روی سرمایه نشان می‌دهد.</p>
          </section>

          <div class="section-head pt-subhead"><div><p class="eyebrow">دروازه اجرای واقعی</p><h3>حداقل کیفیت نقدشوندگی</h3></div></div>
          <div class="pt-liquidity-grid">
            <label class="field"><span>حداقل ارزش روزانه نماد پایه</span><input id="pt-underlying-value" type="text" inputmode="numeric" placeholder="تومان" aria-describedby="pt-underlying-value-hint pt-underlying-value-error"><small class="hint" id="pt-underlying-value-hint">صفر یعنی این فیلتر غیرفعال است.</small><small class="pt-field-error" id="pt-underlying-value-error" hidden></small></label>
            <label class="field"><span>حداقل ارزش روزانه اختیار</span><input id="pt-option-value" type="text" inputmode="numeric" placeholder="تومان" aria-describedby="pt-option-value-hint pt-option-value-error"><small class="hint" id="pt-option-value-hint">صفر یعنی این فیلتر غیرفعال است.</small><small class="pt-field-error" id="pt-option-value-error" hidden></small></label>
            <label class="field"><span>حداقل موقعیت باز</span><input id="pt-open-interest" type="text" inputmode="numeric" placeholder="تعداد" aria-describedby="pt-open-interest-hint pt-open-interest-error"><small class="hint" id="pt-open-interest-hint">برای تاریخی که آرشیو موقعیت باز ندارد، صفر وارد کن تا فقط دفتر واقعی سنجیده شود.</small><small class="pt-field-error" id="pt-open-interest-error" hidden></small></label>
            <label class="field"><span>حداکثر اسپرد خرید/فروش</span><input id="pt-max-spread" type="text" inputmode="decimal" placeholder="درصد" aria-describedby="pt-max-spread-error"><small class="pt-field-error" id="pt-max-spread-error" hidden></small></label>
            <label class="field"><span>حداکثر مصرف عمق دفتر</span><input id="pt-book-take" type="text" inputmode="decimal" placeholder="درصد" aria-describedby="pt-book-take-error"><small class="pt-field-error" id="pt-book-take-error" hidden></small></label>
          </div>
          <fieldset class="pt-fieldset pt-binary-field" id="pt-full-book-field"><legend>پنج سطح کامل دفتر سفارش الزامی است؟</legend><div class="pt-binary" id="pt-full-book"><label><input type="radio" name="pt-full-book" value="yes"><span>بله، دفتر کامل لازم است</span></label><label><input type="radio" name="pt-full-book" value="no"><span>خیر، کفایت ثبت‌شده سنجیده شود</span></label></div><small class="pt-field-error" id="pt-full-book-error" hidden></small></fieldset>

          <div class="pt-stage-actions"><button type="button" class="primary" id="pt-save-risk">ثبت مرزهای ریسک و اجرا</button><p class="pt-save-state" id="pt-risk-state" role="status" aria-live="polite">همه مرزها باید صریح وارد شوند.</p></div>
        </section>

        <section class="card pt-card pt-allocation-card" id="pt-allocation-step" aria-labelledby="pt-allocation-title" hidden>
          <div class="section-head"><div><p class="eyebrow">مرحله چهارم · نقشه سرمایه</p><h2 id="pt-allocation-title">سرمایه را بین خانواده‌های استراتژی تقسیم کن</h2></div><span class="pt-stage-badge">بدون پخش پنهان</span></div>
          <p class="pt-allocation-intro">هر خانواده و درصدش را خودت انتخاب کن. باقیمانده تا صد درصد نقد و تخصیص‌نیافته می‌ماند و بعداً بی‌صدا بین ردیف‌ها پخش نمی‌شود.</p>

          <div class="pt-allocation-head" aria-hidden="true"><span>خانواده استراتژی</span><span>درصد سرمایه قابل تخصیص</span><span>بودجه زنده</span><span></span></div>
          <div class="pt-allocation-rows" id="pt-allocation-rows"></div>
          <button type="button" class="ghost pt-add-allocation" id="pt-add-allocation">افزودن خانواده</button>
          <small class="pt-field-error" id="pt-allocation-error" hidden></small>

          <section class="pt-allocation-summary" aria-live="polite" aria-labelledby="pt-allocation-summary-title">
            <div><p class="eyebrow">جمع زنده</p><h3 id="pt-allocation-summary-title">تراز تخصیص</h3></div>
            <div class="pt-allocation-totals">
              <article><span>جمع درصدها</span><b id="pt-allocation-total">۰٪</b></article>
              <article><span>فاصله تا صد</span><b id="pt-allocation-remaining">۱۰۰٪</b></article>
              <article><span>بودجه تخصیص‌یافته</span><b id="pt-allocation-assigned">—</b><small>تومان</small></article>
              <article><span>سرمایه تخصیص‌نیافته</span><b id="pt-allocation-unassigned">—</b><small>تومان</small></article>
            </div>
          </section>

          <div class="pt-stage-actions"><button type="button" class="primary" id="pt-save-allocation">ثبت تخصیص خانواده‌ها</button><p class="pt-save-state" id="pt-allocation-state" role="status" aria-live="polite">دست‌کم یک خانواده و درصد آن را وارد کن.</p></div>
        </section>

        <section class="card pt-card pt-mission-card" id="pt-review-step" aria-labelledby="pt-review-title" hidden>
          <div class="section-head"><div><p class="eyebrow">مرحله پنجم · مرور و قفل</p><h2 id="pt-review-title">قواعد سفر را یک‌جا ببین و مأموریت را شروع کن</h2></div><span class="pt-stage-badge">آخرین نقطه قابل ویرایش</span></div>
          <p class="pt-allocation-intro">هیچ هدف مالی از طرف سیستم انتخاب نمی‌شود. چهار ورودی زیر را صریح ثبت کن؛ سپس قرارداد کامل و عکس دادهٔ همان لحظه قفل می‌شوند.</p>

          <fieldset class="pt-fieldset" id="pt-objective-field"><legend>هدف اصلی مأموریت</legend><div class="pt-choice-grid" id="pt-objective">${objectiveCards()}</div><small class="pt-field-error" id="pt-objective-error" hidden></small></fieldset>
          <fieldset class="pt-fieldset pt-binary-field" id="pt-return-base-field"><legend>مبنای سنجش بازده هدف</legend><div class="pt-binary" id="pt-return-base">${returnBaseCards()}</div><small class="pt-field-error" id="pt-return-base-error" hidden></small></fieldset>
          <div class="pt-form-grid pt-mission-objective-grid">
            <label class="field"><span>بازده هدف</span><input id="pt-target-return" type="text" inputmode="decimal" placeholder="درصد" aria-describedby="pt-target-return-error"><small class="pt-field-error" id="pt-target-return-error" hidden></small></label>
            <label class="field"><span>حداکثر افق نگهداری</span><input id="pt-max-holding" type="text" inputmode="numeric" placeholder="روز معاملاتی" aria-describedby="pt-max-holding-error"><small class="pt-field-error" id="pt-max-holding-error" hidden></small></label>
          </div>

          <section class="pt-final-review" aria-labelledby="pt-final-review-title">
            <div><p class="eyebrow">بازبینی نهایی</p><h3 id="pt-final-review-title">پنج ایستگاه تصمیم</h3></div>
            <div class="pt-final-review-grid">
              <article><span>زمان و سرمایه</span><b id="pt-final-setup">—</b><button type="button" class="ghost" data-pt-edit="setup">ویرایش</button></article>
              <article><span>انتظار بازار</span><b id="pt-final-outlook">—</b><button type="button" class="ghost" data-pt-edit="outlook">ویرایش</button></article>
              <article><span>ریسک و اجرا</span><b id="pt-final-risk">—</b><button type="button" class="ghost" data-pt-edit="risk">ویرایش</button></article>
              <article><span>تخصیص و نقد آزاد</span><b id="pt-final-allocation">—</b><button type="button" class="ghost" data-pt-edit="allocation">ویرایش</button></article>
              <article><span>هدف و افق</span><b id="pt-final-objective">ثبت نشده</b><button type="button" class="ghost" data-pt-edit="objective">ویرایش</button></article>
            </div>
          </section>

          <section class="pt-snapshot" id="pt-snapshot" aria-live="polite">
            <div><p class="eyebrow">عکس شروع قابل ممیزی</p><h3>کیفیت خوراک در لحظه ورود</h3></div>
            <div class="pt-snapshot-grid">
              <article><span>وضعیت کل</span><b id="pt-snapshot-kind">هنوز ساخته نشده</b></article>
              <article><span>کفایت</span><b id="pt-snapshot-sufficient">—</b></article>
              <article><span>منبع</span><b id="pt-snapshot-source">—</b></article>
              <article><span>لحظه</span><b id="pt-snapshot-at">—</b></article>
            </div>
            <ul id="pt-snapshot-reasons"><li>پس از قفل مأموریت، دادهٔ روزانه، ریزمعامله، دفتر سفارش و فهرست قراردادهای همان تاریخ بررسی می‌شوند.</li></ul>
          </section>

          <section class="pt-eligibility pt-live" id="pt-eligibility" aria-labelledby="pt-eligibility-title" hidden>
            <div class="pt-eligibility-head">
              <div><p class="eyebrow">مدرک خام اجراپذیری</p><h3 id="pt-eligibility-title">حکم قراردادها در لحظه شروع</h3></div>
              <div class="pt-eligibility-filters" aria-label="فیلتر حکم قراردادها">
                <button type="button" class="ghost" data-pt-eligibility-filter="all" aria-pressed="true">همه</button>
                <button type="button" class="ghost" data-pt-eligibility-filter="accepted" aria-pressed="false">پذیرفته</button>
                <button type="button" class="ghost" data-pt-eligibility-filter="rejected" aria-pressed="false">ردشده</button>
              </div>
            </div>
            <p class="pt-save-state" id="pt-eligibility-state" role="status" aria-live="polite">پس از فعال‌شدن جلسه، حکم‌های عکس قفل‌شده اینجا می‌آیند.</p>
            <table class="pt-eligibility-table">
              <thead><tr><th>قرارداد</th><th>سمت</th><th>حکم</th><th>علت‌های رد</th><th>کیفیت</th><th>سقف اجرا</th></tr></thead>
              <tbody id="pt-eligibility-body"></tbody>
            </table>
          </section>

          <section class="pt-closeout pt-live" id="pt-closeout" aria-labelledby="pt-closeout-title" hidden>
            <div class="pt-closeout-head">
              <div><p class="eyebrow">پایان جلسه</p><h3 id="pt-closeout-title">بستن جلسه و پروندهٔ پایان</h3></div>
              <button type="button" class="ghost" id="pt-closeout-do" data-pt-keep-enabled="true">بستن جلسه</button>
            </div>
            <p class="pt-field-error" id="pt-closeout-warn" hidden></p>
            <p class="pt-save-state" id="pt-closeout-state" role="status" aria-live="polite"></p>
            <div class="pt-closeout-dossier" id="pt-closeout-dossier" hidden>
              <dl class="pt-closeout-figures" id="pt-closeout-figures"></dl>
              <section class="pt-dossier-analysis" id="pt-dossier-analysis" aria-labelledby="pt-dossier-analysis-title">
                <h4 id="pt-dossier-analysis-title">سرمایه نهایی و فاصله از هدف</h4>
                <dl class="pt-dossier-analysis-figures" id="pt-dossier-analysis-figures"></dl>
                <p class="pt-dossier-analysis-state" id="pt-dossier-analysis-state"></p>
                <ul class="pt-dossier-analysis-issues" id="pt-dossier-analysis-issues" hidden></ul>
              </section>
              <section class="pt-dossier-analysis" id="pt-final-ranking" aria-labelledby="pt-final-ranking-title">
                <h4 id="pt-final-ranking-title">رتبه انتخاب‌ها در پایان بازی</h4>
                <dl class="pt-dossier-analysis-figures" id="pt-final-ranking-figures"></dl>
                <p class="pt-dossier-analysis-state" id="pt-final-ranking-state"></p>
              </section>
              <section class="pt-capital-continuity" id="pt-capital-continuity" aria-labelledby="pt-capital-continuity-title">
                <div class="pt-capital-continuity-head">
                  <div><p class="eyebrow">سفر بعدی</p><h4 id="pt-capital-continuity-title">ادامه زنجیره سرمایه</h4></div>
                  <b id="pt-capital-continuity-amount">—</b>
                </div>
                <dl class="pt-capital-continuity-source" id="pt-capital-continuity-source"></dl>
                <section class="pt-capital-growth" id="pt-capital-growth" aria-labelledby="pt-capital-growth-title">
                  <div class="pt-capital-growth-head">
                    <h5 id="pt-capital-growth-title">روند قطعی سرمایه</h5>
                    <b id="pt-capital-growth-summary">—</b>
                  </div>
                  <p id="pt-capital-growth-state" role="status">روند پس از اعتبارسنجی زنجیره آماده می‌شود.</p>
                  <div class="pt-capital-growth-rows" id="pt-capital-growth-rows"></div>
                </section>
                <p id="pt-capital-continuity-state" role="status" aria-live="polite"></p>
                <button type="button" class="primary" id="pt-capital-continuity-do" aria-describedby="pt-capital-continuity-state" disabled>جلسه بعد با این سرمایه</button>
              </section>
              <section class="pt-dossier-weakness" id="pt-dossier-weakness" aria-labelledby="pt-dossier-weakness-title">
                <div class="pt-dossier-weakness-head">
                  <h4 id="pt-dossier-weakness-title">یافته‌های مستند پرونده</h4>
                  <b id="pt-dossier-weakness-summary"></b>
                </div>
                <div class="pt-dossier-weakness-rows" id="pt-dossier-weakness-rows"></div>
              </section>
              <div class="pt-dossier-export" id="pt-dossier-export">
                <button type="button" class="ghost" id="pt-dossier-export-do" aria-describedby="pt-dossier-export-state" disabled>دانلود Excel پرونده</button>
                <p id="pt-dossier-export-state" role="status" aria-live="polite">پرونده‌ای برای خروجی آماده نیست.</p>
              </div>
              <section class="pt-dossier-compare" id="pt-dossier-compare" aria-labelledby="pt-dossier-compare-title">
                <div class="pt-dossier-compare-head">
                  <h4 id="pt-dossier-compare-title">مقایسه با نزدیک‌ترین پرونده قدیمی‌تر</h4>
                  <b id="pt-dossier-compare-base"></b>
                </div>
                <p class="pt-dossier-compare-state" id="pt-dossier-compare-state" role="status" aria-live="polite"></p>
                <div class="pt-dossier-compare-identities" id="pt-dossier-compare-identities" hidden></div>
                <div class="pt-dossier-compare-metrics" id="pt-dossier-compare-metrics"></div>
                <div class="pt-dossier-compare-findings" id="pt-dossier-compare-findings"></div>
              </section>
              <p class="pt-closeout-open" id="pt-closeout-open" hidden></p>
              <table class="pt-closeout-table" id="pt-closeout-table" hidden>
                <thead><tr><th>موقعیت</th><th>حجم بسته‌شده</th><th>نقد خروج</th><th>تحقق‌یافته</th></tr></thead>
                <tbody id="pt-closeout-body"></tbody>
              </table>
            </div>
          </section>

          <section class="pt-watch pt-live" id="pt-watch" aria-labelledby="pt-watch-title" hidden>
            <div class="pt-watch-head">
              <div><p class="eyebrow">پایش قیود ریسک</p><h3 id="pt-watch-title">آنچه از لحظهٔ ثبت عوض شده</h3></div>
              <b class="pt-watch-headline" id="pt-watch-headline">—</b>
            </div>
            <table class="pt-watch-table" id="pt-watch-table" hidden>
              <thead><tr><th>قید</th><th>حکم</th><th>اکنون</th><th>حد</th><th>فاصله</th><th>تغییر</th></tr></thead>
              <tbody id="pt-watch-body"></tbody>
            </table>
          </section>

          <section class="pt-clock pt-live" id="pt-clock" aria-labelledby="pt-clock-title" hidden>
            <div class="pt-clock-head">
              <div><p class="eyebrow">ساعت جلسه</p><h3 id="pt-clock-title">لحظه‌ای که جلسه روی آن ایستاده</h3></div>
              <b class="pt-clock-now" id="pt-clock-now">—</b>
            </div>
            <div class="pt-clock-steps" id="pt-clock-steps" role="group" aria-label="پله‌های زمانی"></div>
            <p class="pt-save-state" id="pt-clock-state" role="status" aria-live="polite">جلسه روی لحظهٔ شروع ایستاده است.</p>
            <p class="pt-field-error" id="pt-clock-warn" hidden></p>
          </section>

          <section class="pt-ledger pt-live" id="pt-ledger" aria-labelledby="pt-ledger-title" hidden>
            <div class="pt-ledger-head">
              <div><p class="eyebrow">دفتر سرمایه</p><h3 id="pt-ledger-title">چقدر درگیر شده و چقدر جا مانده</h3></div>
            </div>
            <p class="pt-save-state" id="pt-ledger-state" role="status" aria-live="polite">پس از فعال‌شدن جلسه، وضعیت سرمایه اینجا می‌آید.</p>
            <dl class="pt-ledger-figures" id="pt-ledger-figures"></dl>
            <table class="pt-ledger-table">
              <thead><tr><th>قید ریسک</th><th>اکنون</th><th>حد مأموریت</th><th>فاصله</th><th>حکم</th></tr></thead>
              <tbody id="pt-ledger-risk"></tbody>
            </table>
            <p class="pt-ledger-families" id="pt-ledger-families"></p>
            <p class="pt-field-error" id="pt-ledger-unpriced" hidden></p>
          </section>

          <section class="pt-positions pt-live" id="pt-positions" aria-labelledby="pt-positions-title" hidden>
            <div class="pt-positions-head">
              <div><p class="eyebrow">موقعیت‌های جلسه</p><h3 id="pt-positions-title">چه چیزی در دست است</h3></div>
            </div>
            <p class="pt-save-state" id="pt-positions-state" role="status" aria-live="polite">پس از نخستین ثبت، موقعیت‌ها اینجا می‌آیند.</p>
            <div class="pt-table-scroll">
            <table class="pt-positions-table">
              <thead><tr><th>موقعیت</th><th>وضعیت</th><th>حجم</th><th>سرمایه (تومان)</th><th>ارزش جاری (تومان)</th><th>سود تحقق‌نیافته (تومان)</th><th>سود تحقق‌یافته (تومان)</th><th>پاها</th><th>کیفیت</th><th>مدیریت حجم</th></tr></thead>
              <tbody id="pt-positions-body"></tbody>
            </table>
            </div>
            <p class="pt-positions-total" id="pt-positions-total"></p>
            <div class="pt-payoff" id="pt-payoff">
              <div class="pt-payoff-head">
                <p class="eyebrow">منحنی بازده سبد در سررسید</p>
                <b id="pt-payoff-summary">—</b>
              </div>
              <div class="pt-payoff-chart" id="pt-payoff-chart"></div>
              <p class="pt-save-state" id="pt-payoff-state" role="status" aria-live="polite"></p>
            </div>
            <p class="pt-field-error" id="pt-positions-undocumented" hidden></p>
          </section>

          <section class="pt-proposals pt-live" id="pt-proposals" aria-labelledby="pt-proposals-title" hidden>
            <div class="pt-proposals-head">
              <div><p class="eyebrow">پیشنهاد اجراپذیر</p><h3 id="pt-proposals-title">طرح‌های در دسترس با این مأموریت</h3></div>
            </div>
            <p class="pt-save-state" id="pt-proposals-state" role="status" aria-live="polite">پس از فعال‌شدن جلسه، طرح‌های در دسترس اینجا می‌آیند.</p>
            <table class="pt-proposals-table">
              <thead><tr><th>رتبه</th><th>استراتژی</th><th>امتیاز</th><th>سرمایه لازم (تومان)</th><th>بیشترین سود (تومان)</th><th>بیشترین زیان (تومان)</th><th>چرا این جایگاه</th><th>کیفیت</th><th>انتخاب</th></tr></thead>
              <tbody id="pt-proposals-body"></tbody>
            </table>
            <p class="eyebrow" id="pt-proposals-aside-title" hidden>کنار گذاشته‌شده‌ها و نامعلوم‌ها</p>
            <table class="pt-proposals-table pt-proposals-aside-table" id="pt-proposals-aside" hidden>
              <thead><tr><th>استراتژی</th><th>وضعیت</th><th>علت</th><th>کیفیت</th></tr></thead>
              <tbody id="pt-proposals-aside-body"></tbody>
            </table>
          </section>

          <div class="pt-stage-actions"><button type="button" class="primary" id="pt-start-mission">قفل مأموریت و عکس شروع</button><p class="pt-save-state" id="pt-mission-state" role="status" aria-live="polite">هدف، مبنای بازده، درصد هدف و افق نگهداری را صریح وارد کن.</p></div>
          <small class="pt-field-error" id="pt-mission-error" hidden></small>
        </section>
      </div>

      <aside class="card pt-review">
        <p class="eyebrow">پیش‌نویس زنده</p><h2>گذرنامه سفر</h2>
        <dl><div><dt>سرمایه قابل تخصیص</dt><dd id="pt-review-capital">—</dd></div><div><dt>نماد پایه</dt><dd id="pt-review-base">انتخاب نشده</dd></div><div><dt>شروع</dt><dd id="pt-review-start">انتخاب نشده</dd></div><div><dt>پایان</dt><dd id="pt-review-end">انتخاب نشده</dd></div><div><dt>پخش مسیر</dt><dd id="pt-review-grain">نیم‌ساعته</dd></div><div><dt>انتظار بازار</dt><dd id="pt-review-outlook">ثبت نشده</dd></div><div><dt>اطمینان</dt><dd id="pt-review-confidence">—</dd></div><div><dt>مرز سرمایه آزاد / وجه تضمین</dt><dd id="pt-review-risk">ثبت نشده</dd></div><div><dt>دروازه نقدشوندگی</dt><dd id="pt-review-liquidity">ثبت نشده</dd></div><div><dt>تخصیص خانواده‌ها</dt><dd id="pt-review-allocation">ثبت نشده</dd></div></dl>
        <div class="pt-honesty"><b>تعهد این بازی</b><p>قیمت آینده، قراردادهای بعدی و نتیجه نهایی در لحظه انتخاب سبد وارد پیشنهاد نمی‌شوند.</p></div>
        <section class="pt-resume" id="pt-resume">
          <p class="eyebrow">ادامه سفر</p>
          <label class="field"><span>جلسه‌های ذخیره‌شده روی سرور</span><select id="pt-resume-pick" aria-describedby="pt-resume-state"><option value="">در حال خواندن…</option></select></label>
          <button type="button" class="ghost" id="pt-resume-open">ادامه همین جلسه</button>
          <p class="pt-save-state" id="pt-resume-state" role="status" aria-live="polite">فهرست جلسه‌ها هنوز خوانده نشده است.</p>
        </section>
        <button type="button" class="primary" id="pt-save-step">ثبت پیش‌نویس مرحله اول</button>
        <p class="pt-save-state" id="pt-save-state" role="status" aria-live="polite">هنوز چیزی ثبت نشده است.</p>
        <p class="pt-save-state" id="pt-persist-state" role="status" aria-live="polite">هنوز روی سرور ثبت نشده است.</p>
      </aside>
    </section>
  </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const capital = $('pt-capital'), reserve = $('pt-reserve'), base = $('pt-base');
  const outlookStep = $('pt-outlook-step'), riskStep = $('pt-risk-step');
  const allocationStep = $('pt-allocation-step'), allocationRowsRoot = $('pt-allocation-rows');
  const reviewStep = $('pt-review-step');
  let chain = new Map(), symbols = [], dates = [], loadedIns = '';
  const historyRequests = createPortfolioHistoryRequestGate();
  let setupDraft = null, outlookDraft = null, riskDraft = null, allocationDraft = null;
  let missionDraft = null, draft = null;
  let eligibilityRows = [], eligibilityFilter = 'all';
  let dossierSummaries = [], dossierCompareToken = 0;
  let dossierExportView = null, dossierExportBusy = false;
  let dossierContinuity = null, capitalContinuitySeed = null, continuityDraftCounter = 0;
  let allocationRowId = 0;
  // شناسه دیگر ثابت نیست: ادامه‌دادن یک جلسه یعنی همان شناسه سرور را
  // برداشتن، وگرنه هر بار یک جلسه تازه ساخته می‌شد و «ادامه» معنایی
  // نداشت.
  let draftId = `pt-ui-${Date.now()}`;
  // زمان ثبت سرور، هم برچسب وضعیت است و هم قفل خوش‌بینانه PUT بعدی.
  let lastSavedAt = null;
  // ثبت مرحله‌ها باید به همان ترتیبی به سرور برسد که کاربر آن‌ها را
  // تأیید کرده است. کلیک سریع روی چند مرحله نباید پاسخ دیرترِ مرحلهٔ
  // قبلی را روی زمان نسخهٔ تازه بنویسد یا active را جلوتر از allocation
  // به ذخیره‌ساز برساند.
  let persistQueue = Promise.resolve();
  // حین بازسازی، همان دکمه‌های مرحله صدا زده می‌شوند. بدون این پرچم، هر
  // مرحله دوباره روی سرور نوشته می‌شد و رکوردی که تازه خواندیم را با
  // خودش بازنویسی می‌کرد.
  let resuming = false;

  function clearErrors() {
    root.querySelectorAll('.pt-field-error').forEach((node) => { node.hidden = true; node.textContent = ''; });
    root.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
    $('pt-save-state')?.removeAttribute('data-error');
    $('pt-outlook-state')?.removeAttribute('data-error');
    $('pt-risk-state')?.removeAttribute('data-error');
    $('pt-allocation-state')?.removeAttribute('data-error');
    $('pt-mission-state')?.removeAttribute('data-error');
  }

  function selectedValue(name) {
    return root.querySelector(`input[name="${name}"]:checked`)?.value || '';
  }

  function paintProgress(stage = 'setup') {
    const setup = $('pt-progress-setup'), outlook = $('pt-progress-outlook');
    const risk = $('pt-progress-risk'), allocation = $('pt-progress-allocation');
    const review = $('pt-progress-review');
    setup.classList.toggle('active', stage === 'setup');
    setup.classList.toggle('done', stage !== 'setup');
    setup.toggleAttribute('aria-current', stage === 'setup');
    setup.querySelector('small').textContent = stage === 'setup' ? 'در حال تکمیل' : 'کامل';
    outlook.classList.toggle('active', stage === 'outlook');
    outlook.classList.toggle('done', ['risk', 'allocation', 'review', 'active'].includes(stage));
    outlook.toggleAttribute('aria-current', stage === 'outlook');
    outlook.querySelector('small').textContent = stage === 'outlook' ? 'در حال تکمیل' : stage === 'setup' ? 'قفل' : 'کامل';
    risk.classList.toggle('active', stage === 'risk');
    risk.classList.toggle('done', ['allocation', 'review', 'active'].includes(stage));
    risk.toggleAttribute('aria-current', stage === 'risk');
    risk.querySelector('small').textContent = stage === 'risk' ? 'در حال تکمیل'
      : ['allocation', 'review', 'active'].includes(stage) ? 'کامل' : 'قفل';
    allocation.classList.toggle('active', stage === 'allocation');
    allocation.classList.toggle('done', stage === 'review' || stage === 'active');
    allocation.toggleAttribute('aria-current', stage === 'allocation');
    allocation.querySelector('small').textContent = stage === 'allocation' ? 'در حال تکمیل'
      : stage === 'review' || stage === 'active' ? 'کامل' : 'قفل';
    review.classList.toggle('active', stage === 'review' || stage === 'active');
    review.classList.toggle('done', stage === 'active');
    review.toggleAttribute('aria-current', stage === 'review' || stage === 'active');
    review.querySelector('small').textContent = stage === 'review' ? 'در حال تکمیل'
      : stage === 'active' ? 'قفل‌شده' : 'قفل';
  }

  function resetAllocationRows() {
    allocationRowsRoot.innerHTML = '';
    allocationRowId = 0;
  }

  function invalidateSetupDraft() {
    if (!setupDraft) return;
    setupDraft = null; outlookDraft = null; riskDraft = null; allocationDraft = null; missionDraft = null; draft = null;
    root.removeAttribute('data-draft-ready');
    root.removeAttribute('data-outlook-ready');
    root.removeAttribute('data-risk-ready');
    root.removeAttribute('data-allocation-ready');
    root.removeAttribute('data-mission-ready');
    outlookStep.hidden = true;
    riskStep.hidden = true;
    allocationStep.hidden = true;
    reviewStep.hidden = true;
    resetAllocationRows();
    paintProgress('setup');
    $('pt-save-step').textContent = 'ثبت دوباره پیش‌نویس مرحله اول';
    $('pt-save-state').textContent = 'ورودی مرحله نخست تغییر کرد؛ برای ادامه دوباره ثبتش کن.';
    $('pt-review-outlook').textContent = 'ثبت نشده';
    $('pt-review-confidence').textContent = '—';
    $('pt-review-risk').textContent = 'ثبت نشده';
    $('pt-review-liquidity').textContent = 'ثبت نشده';
    $('pt-review-allocation').textContent = 'ثبت نشده';
  }

  function invalidateOutlookDraft() {
    if (!outlookDraft) return;
    outlookDraft = null; riskDraft = null; allocationDraft = null; missionDraft = null;
    draft = setupDraft;
    root.removeAttribute('data-outlook-ready');
    root.removeAttribute('data-risk-ready');
    root.removeAttribute('data-allocation-ready');
    root.removeAttribute('data-mission-ready');
    riskStep.hidden = true;
    allocationStep.hidden = true;
    reviewStep.hidden = true;
    resetAllocationRows();
    paintProgress('outlook');
    $('pt-save-outlook').textContent = 'ثبت دوباره انتظار بازار';
    $('pt-outlook-state').textContent = 'فرض بازار تغییر کرد؛ نسخه تازه را ثبت کن.';
    $('pt-review-risk').textContent = 'ثبت نشده';
    $('pt-review-liquidity').textContent = 'ثبت نشده';
    $('pt-review-allocation').textContent = 'ثبت نشده';
  }

  function invalidateRiskDraft() {
    if (!riskDraft) return;
    riskDraft = null; allocationDraft = null; missionDraft = null; draft = outlookDraft;
    root.removeAttribute('data-risk-ready');
    root.removeAttribute('data-allocation-ready');
    root.removeAttribute('data-mission-ready');
    allocationStep.hidden = true;
    reviewStep.hidden = true;
    resetAllocationRows();
    paintProgress('risk');
    $('pt-save-risk').textContent = 'ثبت دوباره مرزهای ریسک و اجرا';
    $('pt-risk-state').textContent = 'مرزها تغییر کردند؛ نسخه تازه را ثبت کن.';
    $('pt-review-liquidity').textContent = 'ثبت نشده';
    $('pt-review-allocation').textContent = 'ثبت نشده';
  }

  function invalidateAllocationDraft() {
    if (draft?.step !== 'allocation') return;
    allocationDraft = null; missionDraft = null; draft = riskDraft;
    root.removeAttribute('data-allocation-ready');
    root.removeAttribute('data-mission-ready');
    reviewStep.hidden = true;
    paintProgress('allocation');
    $('pt-save-allocation').textContent = 'ثبت دوباره تخصیص خانواده‌ها';
    $('pt-allocation-state').textContent = 'تخصیص تغییر کرد؛ نسخه تازه را ثبت کن.';
    $('pt-review-allocation').textContent = 'ثبت نشده';
  }

  function showError(why) {
    clearErrors();
    const text = String(why || 'ورودی این مرحله کامل نیست');
    const target = text.includes('ذخیره') ? 'reserve'
      : text.includes('سرمایه شروع') ? 'capital'
        : text.includes('نماد پایه') ? 'base'
          : text.includes('تایم‌فریم') ? 'grain'
            : text.includes('پایان') || text.includes('لحظه') ? 'end' : 'start';
    const error = $(`pt-${target}-error`), control = $(`pt-${target}`) || $(`pt-${target}-time`);
    if (error) { error.textContent = text; error.hidden = false; }
    control?.setAttribute('aria-invalid', 'true');
    $('pt-save-state').textContent = text;
    $('pt-save-state').dataset.error = 'true';
  }

  function showOutlookError(why) {
    clearErrors();
    const text = String(why || 'انتظار بازار کامل نیست');
    const target = text.includes('قیمت هدف') ? 'target'
      : text.includes('کران') || text.includes('بازه قیمت') ? 'range'
        : text.includes('تلاطم') ? 'expected-volatility'
          : text.includes('اطمینان') ? 'confidence'
            : text.includes('دلیل') || text.includes('متن انتظار') ? 'thesis' : 'direction';
    const error = $(`pt-${target}-error`);
    const control = target === 'direction' ? $('pt-direction')
      : target === 'range' ? $('pt-range-low')
        : target === 'target' ? $('pt-target-price') : $(`pt-${target}`);
    if (error) { error.textContent = text; error.hidden = false; }
    control?.setAttribute('aria-invalid', 'true');
    $('pt-outlook-state').textContent = text;
    $('pt-outlook-state').dataset.error = 'true';
  }

  function showRiskError(why) {
    clearErrors();
    const text = String(why || 'مرزهای ریسک و اجرا کامل نیست');
    const target = text.includes('سقف زیان') ? 'max-loss'
      : text.includes('سقف افت') ? 'max-drawdown'
        : text.includes('سرمایه آزاد') ? 'min-free'
          : text.includes('وجه تضمین') ? 'max-margin'
            : text.includes('ریسک نامحدود') ? 'unlimited'
              : text.includes('نماد پایه') ? 'underlying-value'
                : text.includes('ارزش روزانه اختیار') ? 'option-value'
                  : text.includes('موقعیت باز') ? 'open-interest'
                    : text.includes('اسپرد') ? 'max-spread'
                      : text.includes('مصرف عمق') ? 'book-take' : 'full-book';
    const error = $(`pt-${target}-error`), control = $(`pt-${target}`);
    if (error) { error.textContent = text; error.hidden = false; }
    control?.setAttribute('aria-invalid', 'true');
    $('pt-risk-state').textContent = text;
    $('pt-risk-state').dataset.error = 'true';
  }

  function showAllocationError(why) {
    clearErrors();
    const text = String(why || 'تخصیص خانواده‌ها کامل نیست');
    $('pt-allocation-error').textContent = text;
    $('pt-allocation-error').hidden = false;
    $('pt-allocation-rows').setAttribute('aria-invalid', 'true');
    $('pt-allocation-state').textContent = text;
    $('pt-allocation-state').dataset.error = 'true';
  }

  function showMissionError(why) {
    clearErrors();
    const text = String(why || 'قرارداد کامل مأموریت معتبر نیست');
    const target = text.includes('هدف مأموریت') ? 'objective'
      : text.includes('مبنای بازده') ? 'return-base'
        : text.includes('بازده هدف') ? 'target-return'
          : text.includes('روز نگهداری') ? 'max-holding' : 'mission';
    const error = $(`pt-${target}-error`);
    const control = target === 'objective' ? $('pt-objective')
      : target === 'return-base' ? $('pt-return-base')
        : target === 'target-return' ? $('pt-target-return')
          : target === 'max-holding' ? $('pt-max-holding') : reviewStep;
    if (error) { error.textContent = text; error.hidden = false; }
    control?.setAttribute('aria-invalid', 'true');
    $('pt-mission-state').textContent = text;
    $('pt-mission-state').dataset.error = 'true';
  }

  function moneyText(value) {
    return Number.isFinite(value) ? fmt.int(value) : '—';
  }

  function paintCapital() {
    const result = previewPortfolioCapital({ capitalToman: capital.value, reserveToman: reserve.value });
    $('pt-total').textContent = result.ok ? moneyText(result.plan.initialRial / 10) : '—';
    $('pt-reserve-view').textContent = result.ok ? moneyText(result.plan.reserveRial / 10) : '—';
    $('pt-reserve-pct').textContent = result.ok ? `${fmt.pct(result.plan.reserveRial / result.plan.initialRial * 100)}٪ از کل` : '—';
    $('pt-allocatable').textContent = result.ok ? moneyText(result.plan.allocatableRial / 10) : '—';
    $('pt-review-capital').textContent = result.ok ? `${moneyText(result.plan.allocatableRial / 10)} تومان` : '—';
  }

  function formatMoneyInput(input) {
    const value = parseTomanInput(input.value);
    if (Number.isFinite(value)) input.value = fmt.int(value);
    paintCapital();
  }

  function optionalMoneyText(input) {
    const value = parseTomanInput(input.value);
    return Number.isFinite(value) ? fmt.int(value) : '—';
  }

  function formatOptionalMoney(input) {
    if (!input.value.trim()) return;
    const value = parseTomanInput(input.value);
    if (Number.isFinite(value)) input.value = fmt.int(value);
  }

  function paintOutlook() {
    const direction = selectedValue('pt-direction');
    const confidence = Number($('pt-confidence').value);
    const low = $('pt-range-low'), target = $('pt-target-price'), high = $('pt-range-high');
    $('pt-confidence-view').textContent = `${fmt.int(confidence)}٪`;
    $('pt-thesis-count').textContent = `${fmt.int($('pt-thesis').value.length)} از ${fmt.int(2000)} نویسه`;
    $('pt-scenario-low').textContent = optionalMoneyText(low);
    $('pt-scenario-target').textContent = optionalMoneyText(target);
    $('pt-scenario-high').textContent = optionalMoneyText(high);
    $('pt-marker-low').hidden = !Number.isFinite(parseTomanInput(low.value));
    $('pt-marker-target').hidden = !Number.isFinite(parseTomanInput(target.value));
    $('pt-marker-high').hidden = !Number.isFinite(parseTomanInput(high.value));
    $('pt-scenario-track').dataset.direction = direction;
    $('pt-review-outlook').textContent = setupDraft ? (MISSION_DIRECTIONS[direction] || 'ثبت نشده') : 'ثبت نشده';
    $('pt-review-confidence').textContent = setupDraft ? `${fmt.int(confidence)}٪` : '—';
  }

  function currentRiskForm() {
    return {
      maxLossPct: $('pt-max-loss').value,
      maxDrawdownPct: $('pt-max-drawdown').value,
      minFreeCapitalPct: $('pt-min-free').value,
      maxMarginUsePct: $('pt-max-margin').value,
      allowUnlimitedRisk: selectedValue('pt-unlimited'),
      minUnderlyingDailyValueToman: $('pt-underlying-value').value,
      minOptionDailyValueToman: $('pt-option-value').value,
      minOpenInterest: $('pt-open-interest').value,
      maxSpreadPct: $('pt-max-spread').value,
      maxBookTakePct: $('pt-book-take').value,
      requireFullBook: selectedValue('pt-full-book'),
    };
  }

  function paintRisk() {
    const result = previewPortfolioRisk(outlookDraft, currentRiskForm());
    const budget = result.ok ? result.budget : null;
    const freePct = budget?.minFreeCapitalPct ?? 0;
    const marginPct = budget?.maxMarginUsePct ?? 0;
    const flexPct = budget?.flexiblePct ?? 0;
    $('pt-budget-free-bar').style.flexBasis = `${freePct}%`;
    $('pt-budget-margin-bar').style.flexBasis = `${marginPct}%`;
    $('pt-budget-flex-bar').style.flexBasis = `${flexPct}%`;
    $('pt-budget-free-pct').textContent = budget ? `${fmt.pct(freePct)}٪` : '—';
    $('pt-budget-margin-pct').textContent = budget ? `${fmt.pct(marginPct)}٪` : '—';
    $('pt-budget-flex-pct').textContent = budget ? `${fmt.pct(flexPct)}٪` : '—';
    $('pt-budget-free-rial').textContent = budget ? `${moneyText(budget.minFreeCapitalRial / 10)} تومان` : '—';
    $('pt-budget-margin-rial').textContent = budget ? `${moneyText(budget.maxMarginUseRial / 10)} تومان` : '—';
    $('pt-review-risk').textContent = budget ? `${fmt.pct(freePct)}٪ آزاد · ${fmt.pct(marginPct)}٪ تضمین` : 'ثبت نشده';
  }

  function allocationRows() {
    return [...allocationRowsRoot.querySelectorAll('.pt-allocation-row')].map((row) => ({
      familyId: row.querySelector('select')?.value || '',
      pct: row.querySelector('input')?.value || '',
    }));
  }

  function addAllocationRow({ familyId = '', pct = '' } = {}) {
    const rowId = ++allocationRowId;
    allocationRowsRoot.insertAdjacentHTML('beforeend', `<div class="pt-allocation-row" data-row-id="${rowId}">
      <label><span>خانواده</span><select aria-label="خانواده استراتژی ردیف ${rowId}">${familyOptions(familyId)}</select></label>
      <label><span>درصد</span><input type="text" inputmode="decimal" value="${esc(pct)}" placeholder="درصد" aria-label="درصد تخصیص ردیف ${rowId}"></label>
      <output class="pt-allocation-budget" aria-label="بودجه خانواده">—</output>
      <button type="button" class="ghost pt-remove-allocation" aria-label="حذف ردیف تخصیص">حذف</button>
    </div>`);
  }

  function paintAllocation() {
    const preview = previewPortfolioAllocations(riskDraft, allocationRows());
    const total = preview.totalPct || 0;
    const remaining = preview.remainingPct ?? (100 - total);
    $('pt-allocation-total').textContent = `${fmt.pct(total)}٪`;
    $('pt-allocation-remaining').textContent = remaining >= 0
      ? `${fmt.pct(remaining)}٪`
      : `${fmt.pct(Math.abs(remaining))}٪ بیش از سقف`;
    $('pt-allocation-remaining').toggleAttribute('data-error', remaining < 0);
    $('pt-allocation-assigned').textContent = preview.ok ? moneyText(preview.plan.assignedRial / 10) : '—';
    $('pt-allocation-unassigned').textContent = preview.ok ? moneyText(preview.plan.unassignedRial / 10) : '—';
    const budgets = preview.ok ? preview.session.allocations : [];
    allocationRowsRoot.querySelectorAll('.pt-allocation-budget').forEach((output, index) => {
      output.textContent = budgets[index] ? `${moneyText(budgets[index].targetRial / 10)} تومان` : '—';
    });
  }

  function currentMissionForm() {
    return {
      objectiveMode: selectedValue('pt-objective'),
      returnBase: selectedValue('pt-return-base'),
      targetReturnPct: $('pt-target-return').value,
      maxHoldingDays: $('pt-max-holding').value,
    };
  }

  function paintFinalReview() {
    if (!allocationDraft) return;
    const session = allocationDraft.session;
    const momentText = (point) => {
      const time = TIME_OPTIONS.find(([second]) => second === point.second)?.[1] || '—';
      return `${faDigits(historyDateLabel(point.date))} ساعت ${time}`;
    };
    $('pt-final-setup').textContent = [
      `نماد ${base.selectedOptions[0]?.textContent || session.baseIns}`,
      `سرمایه شروع ${moneyText(session.capital.initialRial / 10)} تومان`,
      `ذخیره ${moneyText(session.capital.reserveRial / 10)} تومان`,
      `قابل تخصیص ${moneyText(session.capital.allocatableRial / 10)} تومان`,
      `شروع ${momentText(session.start)}`, `پایان ${momentText(session.end)}`,
      `پخش ${MISSION_REPLAY_GRAINS[allocationDraft.replay.grain]?.label || '—'}`,
    ].join(' · ');
    const outlook = allocationDraft.outlook;
    const outlookParts = [
      MISSION_DIRECTIONS[outlook.direction],
      `دید تلاطم ${MISSION_VOLATILITY_VIEWS[outlook.volatilityView]}`,
      `اطمینان ${fmt.pct(outlook.confidencePct)}٪`,
    ];
    if (Number.isFinite(outlook.targetPriceRial)) outlookParts.push(`هدف ${moneyText(outlook.targetPriceRial / 10)} تومان`);
    if (Number.isFinite(outlook.rangeLowRial) && Number.isFinite(outlook.rangeHighRial)) {
      outlookParts.push(`بازه ${moneyText(outlook.rangeLowRial / 10)} تا ${moneyText(outlook.rangeHighRial / 10)} تومان`);
    }
    if (Number.isFinite(outlook.expectedVolatilityPct)) outlookParts.push(`تلاطم مورد انتظار ${fmt.pct(outlook.expectedVolatilityPct)}٪`);
    outlookParts.push(`دلیل: ${outlook.thesis}`);
    $('pt-final-outlook').textContent = outlookParts.join(' · ');
    const risk = allocationDraft.risk, liquidity = allocationDraft.liquidity;
    $('pt-final-risk').textContent = [
      `زیان معامله ${fmt.pct(risk.maxLossPct)}٪`, `افت کل ${fmt.pct(risk.maxDrawdownPct)}٪`,
      `سرمایه آزاد ${fmt.pct(risk.minFreeCapitalPct)}٪`, `وجه تضمین ${fmt.pct(risk.maxMarginUsePct)}٪`,
      `ریسک نامحدود ${risk.allowUnlimitedRisk ? 'مجاز' : 'غیرمجاز'}`,
      `ارزش روزانه پایه ${moneyText(liquidity.minUnderlyingDailyValueRial / 10)} تومان`,
      `ارزش روزانه اختیار ${moneyText(liquidity.minOptionDailyValueRial / 10)} تومان`,
      `موقعیت باز ${fmt.int(liquidity.minOpenInterest)}`, `اسپرد ${fmt.pct(liquidity.maxSpreadPct)}٪`,
      `مصرف عمق ${fmt.pct(liquidity.maxBookTakePct)}٪`, `پنج سطح ${liquidity.requireFullBook ? 'الزامی' : 'غیرالزامی'}`,
    ].join(' · ');
    $('pt-final-allocation').textContent = [
      ...session.allocations.map((row) => `${row.label} ${fmt.pct(row.pct)}٪ / ${moneyText(row.targetRial / 10)} تومان`),
      `جمع ${moneyText(session.capital.assignedRial / 10)} تومان`,
      `تخصیص‌نیافته ${moneyText(session.capital.unassignedRial / 10)} تومان`,
    ].join(' · ');
    const objective = MISSION_OBJECTIVES[selectedValue('pt-objective')] || 'هدف ثبت نشده';
    const returnBase = MISSION_RETURN_BASES[selectedValue('pt-return-base')] || 'مبنای بازده ثبت نشده';
    const target = parsePercentInput($('pt-target-return').value);
    const horizon = parseIntegerInput($('pt-max-holding').value);
    $('pt-final-objective').textContent = Number.isFinite(target) && Number.isFinite(horizon)
      ? `${objective} · مبنا ${returnBase} · بازده هدف ${fmt.pct(target)}٪ · حداکثر ${fmt.int(horizon)} روز`
      : `${objective} · ${returnBase}`;
  }

  async function startSnapshot(session) {
    const at = session.start;
    const failures = [];
    const rawLoaders = gateLoaders();
    const feedLabels = { dailies: 'داده روزانه', trades: 'ریزمعامله', book: 'دفتر سفارش' };
    const safe = (name, fallback) => async (...args) => {
      try { return await rawLoaders[name](...args); }
      catch (error) {
        failures.push(`${feedLabels[name]}: ${String(error?.message || 'خوراک دریافت نشد')}`);
        return fallback;
      }
    };
    const gate = createTimeGate({
      sessionId: session.id,
      now: at,
      days: dates,
      load: {
        dailies: safe('dailies', []),
        trades: safe('trades', []),
        book: safe('book', []),
      },
    });
    const loadUniverse = async () => {
      try {
        const response = await fetch(`/api/history/universe?date=${encodeURIComponent(String(at.date))}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.error) throw new Error(payload.error || 'فهرست تاریخی دریافت نشد');
        return {
          rows: Array.isArray(payload.rows) ? payload.rows : [],
          quality: payload.quality || makeDataQuality({
            kind: 'missing', source: 'watch-archive', asOf: at,
            reason: 'مدرک کیفیت فهرست قراردادها در پاسخ ثبت نشده است',
          }),
        };
      } catch (error) {
        const reason = String(error?.message || 'فهرست تاریخی دریافت نشد');
        failures.push(`فهرست قراردادها: ${reason}`);
        return {
          rows: [],
          quality: makeDataQuality({ kind: 'missing', source: 'watch-archive', asOf: at, reason }),
        };
      }
    };
    const [daily, point, universe] = await Promise.all([
      gate.history(session.baseIns), gate.snapshot(session.baseIns), loadUniverse(),
    ]);
    const priced = await loadMomentContracts(session, at, { days: dates });
    if (priced.warnings.length) failures.push(...priced.warnings);
    const settings = state.settings;
    const snapshot = {
      universe,
      daily,
      intraday: { trade: point.trade, quality: point.tradeQuality },
      book: { quote: point.quote, quality: point.bookQuality },
      // شکلی که موتورهای سبد مصرف می‌کنند. تا پیش از این ساخته نمی‌شد و
      // حکم و ترکیب و پیشنهاد در برنامهٔ زنده هیچ‌وقت داده نمی‌دیدند.
      spot: priced.spot ?? (Number(point.trade?.price) > 0 ? Number(point.trade.price) : null),
      underlyingDailyValueRial: Number(priced.baseTrade?.value ?? point.trade?.value) || null,
      contracts: priced.rows.map((row) => ({
        ins: row.ins, name: row.name, kind: row.kind, strike: row.strike,
        expiry: row.expiry, size: row.size,
        underlyingDailyValueRial: Number(priced.baseTrade?.value ?? point.trade?.value) || null,
        optionDailyValueRial: Number(row.trade?.value) || null,
        openInterest: Number.isFinite(Number(row.openInterest)) ? Number(row.openInterest) : null,
        quality: row.quality,
        asOf: row.quality?.asOf ?? null,
        quote: row.quote ?? { book: row.book, close: row.close, quality: row.bookQuality },
      })),
      // نرخ‌ها همین‌جا قفل می‌شوند؛ بعد از این بازخوانی نمی‌شوند.
      capitalInputs: {
        fees: { ...feesOf(settings), quality: priced.baseBookQuality ?? point.bookQuality },
        margin: {
          spotCloseRial: Number(priced.spot ?? point.trade?.price) || 0,
          params: marginParamsOf(settings),
          creditMode: settings.marginCreditMode || 'FULL',
          nakedComboMargin: settings.marginNakedCombo || 'MAX_PLUS_PREMIUM',
          quality: priced.baseBookQuality ?? point.bookQuality,
        },
      },
    };
    if (failures.length) {
      snapshot.quality = makeDataQuality({
        kind: 'missing', source: 'portfolio-start-feed', asOf: at, reasons: failures,
      });
    }
    return snapshot;
  }

  function paintSnapshot(snapshot) {
    const quality = snapshot?.quality;
    const sourceLabels = {
      'portfolio-start-snapshot': 'عکس شروع سبد',
      'portfolio-start-feed': 'خوراک شروع سبد',
      'watch-archive': 'بایگانی دیده‌بان',
      'current-watch-fallback': 'جایگزین دیده‌بان امروز',
      'historical-daily': 'تاریخچه روزانه',
      'historical-trades': 'ریزمعامله تاریخی',
      'best-limits-history': 'دفتر سفارش تاریخی',
      'time-gate-snapshot': 'دروازه زمان',
    };
    $('pt-snapshot-kind').textContent = quality?.label || 'فاقد داده';
    $('pt-snapshot-sufficient').textContent = quality?.sufficient ? 'کافی' : 'ناکافی';
    $('pt-snapshot-source').textContent = sourceLabels[quality?.source] || quality?.source || 'نامشخص';
    const at = snapshot?.at;
    $('pt-snapshot-at').textContent = at?.date
      ? `${faDigits(historyDateLabel(at.date))} · ${fmt.int(Math.trunc(at.second / 3600)).padStart(2, '۰')}:${fmt.int(Math.trunc(at.second % 3600 / 60)).padStart(2, '۰')}`
      : '—';
    const reasons = quality?.reasons?.length ? quality.reasons : ['هیچ هشدار کیفیتی ثبت نشده است.'];
    const list = $('pt-snapshot-reasons');
    list.innerHTML = '';
    for (const reason of reasons) {
      const item = document.createElement('li');
      item.textContent = reason;
      list.append(item);
    }
    $('pt-snapshot').dataset.quality = quality?.kind || 'missing';
  }

  function eligibilityQuality(row) {
    const candidate = row?.quality?.candidate?.label || 'فاقد مدرک نامزد';
    const book = row?.quality?.book?.label || 'فاقد مدرک دفتر';
    return `${candidate} · ${book}`;
  }

  function paintEligibilityRows() {
    const visible = filterPortfolioEligibilityRows(eligibilityRows, eligibilityFilter);
    const body = $('pt-eligibility-body');
    body.innerHTML = visible.length ? visible.map((row) => {
      const side = row.side === 'buy' ? 'خرید' : row.side === 'sell' ? 'فروش' : '—';
      const verdict = row.accepted ? 'پذیرفته' : 'ردشده';
      const reasons = row.reasons?.length
        ? row.reasons.map((reason) => reason.label).join('؛ ')
        : 'بدون علت رد';
      const qty = row.executableQty === null ? '—' : fmt.int(row.executableQty);
      return `<tr data-verdict="${row.accepted ? 'accepted' : 'rejected'}">
        <td data-label="قرارداد">${esc(row.name || row.candidateId)}</td>
        <td data-label="سمت">${side}</td>
        <td data-label="حکم"><b>${verdict}</b></td>
        <td data-label="علت‌های رد">${esc(reasons)}</td>
        <td data-label="کیفیت">${esc(eligibilityQuality(row))}</td>
        <td data-label="سقف اجرا">${qty}</td>
      </tr>`;
    }).join('') : '<tr class="pt-eligibility-empty"><td colspan="6">در این فیلتر قراردادی نیست.</td></tr>';
    root.querySelectorAll('[data-pt-eligibility-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.ptEligibilityFilter === eligibilityFilter));
    });
  }

  function paintEligibility(session) {
    const section = $('pt-eligibility');
    const evidence = portfolioSessionEligibility(session);
    if (!evidence.ok) {
      eligibilityRows = [];
      section.hidden = true;
      return;
    }
    eligibilityRows = evidence.rows;
    eligibilityFilter = 'all';
    section.hidden = false;
    const accepted = evidence.rows.filter((row) => row.accepted).length;
    $('pt-eligibility-state').textContent = `${fmt.int(evidence.rows.length)} حکم از عکس قفل‌شده · ${fmt.int(accepted)} پذیرفته · ${fmt.int(evidence.rows.length - accepted)} ردشده`;
    paintEligibilityRows();
  }

  // پیشنهادها از همان مدرکی ساخته می‌شوند که بالا رسم شد؛ اینجا دوباره
  // ساخته نمی‌شود و هیچ عددی هم اینجا حساب نمی‌شود.
  // جلسه‌ای که پیشنهادها از رویش ساخته شده. ثبت، جلسهٔ تازه برمی‌گرداند و
  // همین‌جا جایگزین می‌شود تا بودجهٔ باقی‌مانده و «ثبت‌شده»ها در رسم بعدی
  // درست دربیایند.
  let proposalSession = null;
  const committedIds = new Set();

  // نوار سرمایه پیش از پیشنهادها رسم می‌شود، چون همان چیزی است که
  // می‌گوید آیا ثبت بعدی اصلاً جا دارد. هیچ عددی اینجا حساب نمی‌شود؛ هر
  // رقم از مدل نمایش می‌آید.
  // ساعت بالای همهٔ بخش‌ها می‌نشیند، چون همهٔ آن‌ها به لحظهٔ جاری بند
  // هستند. هیچ گامی اینجا برداشته نمی‌شود؛ فقط نشان داده می‌شود چه
  // ممکن است.
  // نوار هشدار بالای همه‌چیز است، حتی بالای ساعت: کاربری که باید
  // اسکرول کند تا هشدارِ شکسته را ببیند، آن را نمی‌بیند.
  // پروندهٔ پایان. تا وقتی جلسه بسته نشده، فقط دکمه و هشدارِ پیش از
  // بستن دیده می‌شود.
  let closeoutArmed = false;
  let closeoutSaving = false;
  function paintCloseout(session) {
    const section = $('pt-closeout');
    if (!session || session.state === 'draft') { section.hidden = true; return; }
    section.hidden = false;
    const closed = session.state === 'closed';
    $('pt-closeout-do').hidden = closed;
    if (closed) return;
    dossierExportView = null;
    dossierContinuity = null;
    $('pt-dossier-export-do').disabled = true;
    $('pt-dossier-export-state').textContent = 'پرونده‌ای برای خروجی آماده نیست.';
    $('pt-capital-continuity-do').disabled = true;
    $('pt-capital-continuity-amount').textContent = '—';
    $('pt-capital-continuity-source').innerHTML = '';
    $('pt-capital-growth-summary').textContent = '—';
    $('pt-capital-growth-state').textContent = 'روند پس از اعتبارسنجی زنجیره آماده می‌شود.';
    $('pt-capital-growth-rows').innerHTML = '';
    $('pt-capital-continuity-state').textContent = 'سرمایه قطعی پس از بستن کامل پرونده آماده می‌شود.';
    // تصمیم پیش از عمل گرفته می‌شود: اگر پس از بستن بگوییم «راستی، سه
    // موقعیت باز بود»، دیگر کاری نمی‌شود کرد.
    const pre = closeoutPreflight(session);
    $('pt-closeout-warn').hidden = !pre.ok || !pre.warningText;
    $('pt-closeout-warn').textContent = pre.ok ? pre.warningText : pre.why;
    $('pt-closeout-do').textContent = pre.ok && pre.needsConfirm && closeoutArmed
      ? 'تأیید می‌کنم؛ ببند' : 'بستن جلسه';
  }

  function paintDossier(view) {
    const box = $('pt-closeout-dossier');
    box.hidden = false;
    dossierExportView = view;
    dossierExportBusy = false;
    $('pt-dossier-export-do').disabled = false;
    $('pt-dossier-export-state').textContent = 'خروجی نسخه‌دار پرونده آماده است.';
    $('pt-closeout-state').textContent = `${view.headlineText} · ${view.positionsText}`;
    // تحقق‌یافته و تحقق‌نیافته دو جای جدا: کنارِ هم نشستنشان یعنی
    // خواننده جمعشان می‌کند، و آن جمع هیچ‌کدام نیست.
    const figures = [
      ['سود و زیان تحقق‌یافته', view.realized.totalText, view.realized.tone],
      ['حسابداری جلسه', view.accountingText || view.accountingWhy, ''],
    ];
    $('pt-closeout-figures').innerHTML = figures
      .map(([label, value, tone]) => `<div><dt>${esc(label)}</dt>`
        + `<dd class="${esc(tone)}">${esc(value)}</dd></div>`).join('');
    // تمام حساب‌های سرمایه و هدف در core انجام شده‌اند. تب فقط مدل آمادهٔ
    // نمایش را می‌چیند؛ همین تابع برای پرونده زنده و بازیابی‌شده مشترک است.
    const analysis = portfolioDossierAnalysis(view.session, view.dossier);
    const analyzed = portfolioDossierAnalysisView(analysis);
    const analysisRows = analyzed.ok ? [
      ['سرمایه شروع', analyzed.initialText, ''],
      ['تحقق‌یافته', analyzed.realizedText, ''],
      ['سرمایه نهایی', analyzed.finalText, ''],
      [`مبنای هدف — ${analyzed.returnBaseLabel}`, analyzed.returnBaseText, ''],
      ['بازده تحقق‌یافته', analyzed.realizedReturnText, ''],
      ['هدف مأموریت', `${analyzed.targetReturnText} · ${analyzed.targetProfitText}`, ''],
      ['فاصله از هدف', `${analyzed.targetGapPctText} · ${analyzed.targetGapText}`, analyzed.targetTone],
    ] : [];
    $('pt-dossier-analysis-figures').innerHTML = analysisRows
      .map(([label, value, tone]) => `<div><dt>${esc(label)}</dt>`
        + `<dd class="${esc(tone)}">${esc(value)}</dd></div>`).join('');
    $('pt-dossier-analysis-state').textContent = analyzed.ok
      ? analyzed.targetStateLabel : analyzed.why;
    const issues = $('pt-dossier-analysis-issues');
    issues.hidden = !analyzed.ok || analyzed.issues.length === 0;
    issues.innerHTML = analyzed.ok ? analyzed.issues.map((row) => `<li>${esc(row.label)}`
      + `${row.detail ? ` — ${esc(row.detail)}` : ''}</li>`).join('') : '';
    const ranking = view.ranking;
    const rankRows = ranking.available ? [
      ...(ranking.best ? [['بهترین استراتژی', `${ranking.best.defText} · رتبه ${ranking.best.rankText} · ${ranking.best.returnText}`, ranking.best.tone]] : []),
      ...(ranking.worst ? [['بدترین استراتژی', `${ranking.worst.defText} · رتبه ${ranking.worst.rankText} · ${ranking.worst.returnText}`, ranking.worst.tone]] : []),
      ...ranking.selected.map((row) => [
        'انتخاب کاربر', `${row.defText} · رتبه ${row.rankText} · صدک ${row.percentileText} · ${row.returnText}`,
        row.tone,
      ]),
    ] : [];
    $('pt-final-ranking-figures').innerHTML = rankRows.map(([label, value, tone]) =>
      `<div><dt>${esc(label)}</dt><dd class="${esc(tone)}">${esc(value)}</dd></div>`).join('');
    $('pt-final-ranking-state').textContent = ranking.available
      ? `${ranking.countsText}${ranking.withoutRankText ? ` · ${ranking.withoutRankText}` : ''}`
      : ranking.why;
    dossierContinuity = view.capitalContinuity
      ? portfolioCapitalContinuityView(view.session, view.dossier, {
        previous: view.capitalContinuity,
      })
      : portfolioCapitalContinuityView(view.session, view.dossier);
    $('pt-capital-continuity-amount').textContent = dossierContinuity.capitalText;
    $('pt-capital-continuity-source').innerHTML = [
      ['نماد پایه', dossierContinuity.baseText],
      ['جلسه منشأ', dossierContinuity.sourceSessionText],
      ['سبد منشأ', dossierContinuity.sourcePortfolioText],
      ['لحظه بستن', dossierContinuity.closedAtText],
      ...dossierContinuity.lineageRows.map((row) => [
        `سفر ${row.indexText}`,
        `جلسه ${row.sessionText} · سبد ${row.portfolioText} · نماد ${row.baseText}`
          + ` · ${row.initialText} ← ${row.finalText} · بسته‌شده ${row.closedAtText}`,
      ]),
    ].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
    const capitalGrowth = portfolioCapitalGrowthView(
      portfolioCapitalGrowth(dossierContinuity.continuity),
    );
    $('pt-capital-growth-summary').textContent = capitalGrowth.summaryText;
    $('pt-capital-growth-summary').className = capitalGrowth.ok ? capitalGrowth.changeTone : '';
    $('pt-capital-growth-state').textContent = capitalGrowth.ok
      ? capitalGrowth.percentageWhy : capitalGrowth.why;
    $('pt-capital-growth-state').hidden = capitalGrowth.ok && !capitalGrowth.percentageWhy;
    $('pt-capital-growth-state').toggleAttribute('data-error', !capitalGrowth.ok);
    $('pt-capital-growth-rows').innerHTML = capitalGrowth.ok
      ? capitalGrowth.rows.map((row) => `<article data-state="${esc(row.state)}">
          <header><b>سفر ${esc(row.indexText)}</b><span class="${esc(row.tone)}">${esc(row.stateLabel)}</span></header>
          <p>جلسه ${esc(row.sessionText)} · سبد ${esc(row.portfolioText)} · نماد ${esc(row.baseText)} · ${esc(row.closedAtText)}</p>
          <dl>
            <div><dt>سرمایه شروع</dt><dd>${esc(row.initialText)}</dd></div>
            <div><dt>تحقق‌یافته</dt><dd class="${esc(row.tone)}">${esc(row.realizedText)}</dd></div>
            <div><dt>سرمایه نهایی</dt><dd>${esc(row.finalText)}</dd></div>
            <div><dt>تغییر سفر</dt><dd class="${esc(row.tone)}">${esc(row.changeText)} · ${esc(row.changePctText)}</dd>
              ${row.percentageWhy ? `<small>${esc(row.percentageWhy)}</small>` : ''}</div>
            <div><dt>تغییر تجمعی</dt><dd class="${esc(row.cumulativeTone)}">${esc(row.cumulativeChangeText)} · ${esc(row.cumulativeChangePctText)}</dd>
              ${row.cumulativePercentageWhy ? `<small>${esc(row.cumulativePercentageWhy)}</small>` : ''}</div>
          </dl>
        </article>`).join('') : '';
    $('pt-capital-continuity-state').textContent = dossierContinuity.available
      ? 'سرمایه قطعی آماده انتقال است؛ نماد و تاریخ جلسه بعد را خودت انتخاب می‌کنی.'
      : dossierContinuity.why;
    $('pt-capital-continuity-state').toggleAttribute('data-error', !dossierContinuity.available);
    $('pt-capital-continuity-do').disabled = !dossierContinuity.available;
    $('pt-capital-continuity-do').textContent = dossierContinuity.actionLabel;
    const weakness = portfolioDossierWeaknessView(
      portfolioDossierWeaknesses(view.session, view.dossier),
    );
    $('pt-dossier-weakness-summary').textContent = weakness.ok
      ? weakness.summaryText : weakness.why;
    $('pt-dossier-weakness-rows').innerHTML = weakness.ok ? weakness.rows.map((row) => {
      const evidence = row.evidence.length
        ? `<dl>${row.evidence.map((item) => `<div><dt>${esc(item.label)}</dt>`
          + `<dd>${esc(item.valueText)}</dd></div>`).join('')}</dl>` : '';
      return `<article data-severity="${esc(row.severity)}" data-code="${esc(row.code)}">
        <header><h5>${esc(row.title)}</h5><span>${esc(row.severityLabel)}</span></header>
        <p>${esc(row.description)}</p>${evidence}</article>`;
    }).join('') : '';
    // تعهدِ باز حتی پس از بستن صریح می‌ماند.
    $('pt-closeout-open').hidden = !view.openText;
    $('pt-closeout-open').textContent = view.openText;
    const table = $('pt-closeout-table');
    table.hidden = view.realized.rows.length === 0;
    $('pt-closeout-body').innerHTML = view.realized.rows.map((row) => `<tr>
      <td data-label="موقعیت">${esc(row.idText)}</td>
      <td data-label="حجم بسته‌شده">${esc(row.closedQtyText)}</td>
      <td data-label="نقد خروج">${esc(row.exitCashText)}</td>
      <td data-label="تحقق‌یافته" class="${esc(row.tone)}">${esc(row.realizedText)}</td>
    </tr>`).join('');
    if (view.realized.unknownText) {
      $('pt-closeout-warn').hidden = false;
      $('pt-closeout-warn').textContent = view.realized.unknownText;
    }
    // مقایسه مستقل و ناهمگام است: شکست خواندن پرونده قبلی نباید کارت
    // پرونده فعلی را که همین حالا کامل رسم شده، پس بزند.
    void paintPreviousDossierComparison(view);
  }

  $('pt-dossier-export-do').onclick = async () => {
    if (!dossierExportView || dossierExportBusy) return;
    const view = dossierExportView;
    const button = $('pt-dossier-export-do'), status = $('pt-dossier-export-state');
    dossierExportBusy = true;
    button.disabled = true;
    button.textContent = 'در حال ساخت Excel…';
    status.removeAttribute('data-error');
    status.textContent = 'در حال ساخت فایل از سند همین پرونده…';
    try {
      const result = await downloadPortfolioDossier(view.session, view.dossier, {
        capitalContinuity: dossierContinuity?.continuity,
      });
      // اگر در فاصلهٔ ساخت، پروندهٔ دیگری روی کارت نشست، نتیجهٔ قدیمی نباید
      // متن یا حالت کارت تازه را بازنویسی کند؛ finally پایین فقط در همان
      // حالت، قفل را باز می‌کند.
      if (view !== dossierExportView) return;
      if (!result.ok) {
        status.dataset.error = 'true';
        status.textContent = `خروجی ساخته نشد — ${result.why}`;
        return;
      }
      status.textContent = `فایل ${faDigits(result.name)}.xlsx ساخته شد.`;
    } catch (error) {
      if (view !== dossierExportView) return;
      status.dataset.error = 'true';
      status.textContent = `خروجی ساخته نشد — ${error?.message || 'خطای نامعلوم'}`;
    } finally {
      if (view === dossierExportView) {
        dossierExportBusy = false;
        button.disabled = false;
        button.textContent = 'دانلود Excel پرونده';
      }
    }
  };

  function beginNextSessionFromDossier(view) {
    if (!view?.available || !view.continuity) return;
    if (capitalContinuitySeed?.sourceSessionId === view.continuity.sourceSessionId) return;
    capitalContinuitySeed = structuredClone(view.continuity);
    continuityDraftCounter += 1;
    draftId = `pt-ui-${Date.now()}-${continuityDraftCounter}`;
    lastSavedAt = null;
    setupDraft = null; outlookDraft = null; riskDraft = null; allocationDraft = null;
    missionDraft = null; draft = null;
    ['draft-ready', 'outlook-ready', 'risk-ready', 'allocation-ready', 'mission-ready', 'mission-active']
      .forEach((name) => root.removeAttribute(`data-${name}`));
    outlookStep.hidden = true; riskStep.hidden = true; allocationStep.hidden = true; reviewStep.hidden = true;
    resetAllocationRows(); paintProgress('setup'); clearErrors();
    root.querySelectorAll('[data-pt-setup] input, [data-pt-setup] select, [data-pt-setup] button')
      .forEach((control) => { control.disabled = false; });
    root.querySelectorAll('[data-pt-setup]').forEach((card) => {
      card.dataset.collapsed = 'false';
      const expand = card.querySelector('[data-pt-expand]');
      if (expand) expand.textContent = 'جمع کن';
    });
    $('pt-save-step').disabled = false;
    capital.value = view.capitalInputText;
    reserve.value = '۰';
    if (!base.querySelector('option[value=""]')) {
      base.insertAdjacentHTML('afterbegin', '<option value="">نماد پایه را انتخاب کن</option>');
    }
    base.value = '';
    historyRequests.invalidate();
    loadedIns = '';
    resetHistoryDates();
    $('pt-review-base').textContent = 'انتخاب نشده';
    $('pt-review-start').textContent = 'انتخاب نشده';
    $('pt-review-end').textContent = 'انتخاب نشده';
    $('pt-capital-source').hidden = false;
    $('pt-capital-source-text').textContent = `${view.capitalText} از جلسه ${view.sourceSessionText}`
      + ` · بسته‌شده در ${view.closedAtText}`;
    $('pt-save-step').textContent = 'ثبت پیش‌نویس مرحله اول';
    $('pt-save-state').textContent = 'سرمایه قطعی منتقل شد؛ نماد و تاریخ‌های جلسه تازه را صریح انتخاب کن.';
    $('pt-persist-state').textContent = 'جلسه تازه هنوز روی سرور ثبت نشده است.';
    $('pt-capital-continuity-do').disabled = true;
    $('pt-capital-continuity-do').textContent = 'فرم جلسه بعد آماده شد';
    paintCapital();
    root.querySelector('[data-pt-setup]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('pt-capital-continuity-do').onclick = () => beginNextSessionFromDossier(dossierContinuity);

  async function paintPreviousDossierComparison(current) {
    const token = ++dossierCompareToken;
    const state = $('pt-dossier-compare-state');
    const identities = $('pt-dossier-compare-identities');
    $('pt-dossier-compare-base').textContent = '';
    identities.hidden = true;
    identities.innerHTML = '';
    $('pt-dossier-compare-metrics').innerHTML = '';
    $('pt-dossier-compare-findings').innerHTML = '';

    const currentKey = momentKey(current?.dossier?.closedAt);
    const previous = dossierSummaries
      .filter((row) => row.id !== current?.session?.id
        && Number.isFinite(momentKey(row.closedAt))
        && momentKey(row.closedAt) < currentKey)
      .sort((left, right) => momentKey(right.closedAt) - momentKey(left.closedAt))[0];
    if (!previous) {
      state.textContent = 'پرونده قدیمی‌تری برای مقایسه ثبت نشده است.';
      return;
    }

    state.textContent = 'در حال خواندن پرونده قدیمی‌تر…';
    const loaded = await loadDossier(previous.id);
    if (token !== dossierCompareToken) return;
    if (!loaded.ok) {
      state.textContent = loaded.notFound
        ? 'پرونده قدیمی‌تر دیگر روی سرور نیست؛ پرونده فعلی همچنان نمایش داده می‌شود.'
        : `مقایسه خوانده نشد — ${loaded.why}`;
      return;
    }
    const older = dossierRecordView(loaded.record);
    if (!older.ok) {
      state.textContent = `پرونده قدیمی‌تر مقایسه‌پذیر نیست — ${older.why}`;
      return;
    }
    const compared = portfolioDossierComparison(
      older.session, older.dossier, current.session, current.dossier,
    );
    const shown = portfolioDossierComparisonView(compared);
    if (!shown.ok) {
      state.textContent = shown.why;
      return;
    }

    state.textContent = 'تغییرها فقط تفاوت دو سند پیاپی‌اند.';
    $('pt-dossier-compare-base').textContent = shown.baseStateText;
    identities.hidden = false;
    identities.innerHTML = [
      ['قدیمی‌تر', shown.older], ['جدیدتر', shown.newer],
    ].map(([label, row]) => `<article><span>${label}</span><b>${esc(row.closedText)}</b>`
      + `<small>نماد ${esc(row.baseText)} · پرونده ${esc(row.idText)}</small></article>`).join('');
    $('pt-dossier-compare-metrics').innerHTML = shown.rows.map((row) => `<article data-metric="${esc(row.key)}">
      <h5>${esc(row.label)}</h5><dl>
        <div><dt>قدیمی‌تر</dt><dd>${esc(row.olderText)}</dd></div>
        <div><dt>جدیدتر</dt><dd>${esc(row.newerText)}</dd></div>
        <div><dt>${esc(row.changeLabel)}</dt><dd>${esc(row.deltaText)}</dd></div>
      </dl></article>`).join('');
    $('pt-dossier-compare-findings').innerHTML = shown.findingGroups.map((group) => {
      const rows = group.rows.length
        ? `<ul>${group.rows.map((row) => `<li data-code="${esc(row.code)}">${esc(row.title)}</li>`).join('')}</ul>`
        : `<p>${esc(group.emptyText)}</p>`;
      return `<article data-kind="${esc(group.key)}"><h5>${esc(group.label)}</h5>${rows}</article>`;
    }).join('');
  }

  $('pt-closeout').onclick = async () => {
    const button = $('pt-closeout-do');
    if (!proposalSession || proposalSession.state === 'closed') return;
    if (closeoutSaving) return;
    const pre = closeoutPreflight(proposalSession);
    // بستنِ زودهنگام یا با تعهدِ باز، یک کلیک نیست.
    if (pre.ok && pre.needsConfirm && !closeoutArmed) {
      closeoutArmed = true;
      button.textContent = 'تأیید می‌کنم؛ ببند';
      $('pt-closeout-state').textContent = 'برای بستن، دوباره بزن.';
      return;
    }
    const startEvidence = portfolioSessionEligibility(proposalSession, {
      snapshot: proposalSession.startSnapshot, at: proposalSession.start,
    });
    const view = closeoutView(proposalSession, portfolioSessionEligibility(proposalSession),
      { force: true, startEvidence });
    closeoutArmed = false;
    if (!view.ok) { $('pt-closeout-state').textContent = view.why; return; }
    // بستن در موتور خالص است، اما وضعیت محلی فقط پس از مدرک ثبت سرور
    // عوض می‌شود. تا آن لحظه `proposalSession` همان جلسه فعال می‌ماند.
    closeoutSaving = true;
    button.disabled = true;
    button.textContent = 'در حال ذخیره…';
    $('pt-closeout-state').textContent = 'در حال ذخیره پرونده روی سرور…';
    const persisted = draft?.capitalContinuity
      ? await persistDossierView(view, { capitalContinuity: draft.capitalContinuity })
      : await persistDossierView(view);
    closeoutSaving = false;
    if (!persisted.ok) {
      button.disabled = false;
      closeoutArmed = pre.ok && pre.needsConfirm;
      paintCloseout(proposalSession);
      $('pt-closeout-state').textContent = `پرونده روی سرور ثبت نشد: ${persisted.why}`;
      return;
    }
    // پس از بستن، هیچ‌کدام از دکمه‌های معامله و گام نباید کار کنند —
    // جلسه دیگر فعال نیست و موتورها هم ردشان می‌کنند.
    proposalSession = persisted.session;
    paintProposals(persisted.session);
    paintDossier(persisted.view);
    root.querySelectorAll('[data-pt-commit], [data-pt-increase], [data-pt-reduce], [data-pt-close], [data-pt-step], [data-pt-adjust-qty]')
      .forEach((control) => { control.disabled = true; });
    button.hidden = true;
  };

  function paintWatch(session) {
    const section = $('pt-watch');
    const table = $('pt-watch-table');
    const view = portfolioWatchView(session, portfolioSessionEligibility(session));
    if (!view.ok) {
      // «هنوز موقعیتی نیست» هشدار نیست؛ نوار اصلاً نمی‌آید.
      section.hidden = true;
      return;
    }
    section.hidden = false;
    section.dataset.tone = view.tone;
    $('pt-watch-headline').textContent = view.headlineText;
    $('pt-watch-headline').className = `pt-watch-headline ${view.tone}`;
    // وقتی همه‌چیز رعایت شده، جدول بسته می‌ماند و فقط یک جمله می‌آید.
    // هشدارِ همیشگی بعد از چند بار نادیده گرفته می‌شود.
    table.hidden = view.quiet;
    if (view.quiet) { $('pt-watch-body').innerHTML = ''; return; }
    $('pt-watch-body').innerHTML = view.rows.map((row) => `<tr data-state="${esc(row.state)}">
      <td data-label="قید">${esc(row.label)}${row.basisLabel
        ? `<br><small>${esc(row.basisLabel)}</small>` : ''}</td>
      <td data-label="حکم"><b>${esc(row.stateLabel)}</b></td>
      <td data-label="اکنون">${esc(row.currentText)}${row.why
        ? `<br><small>${esc(row.why)}</small>` : ''}</td>
      <td data-label="حد">${esc(row.limitText)}</td>
      <td data-label="فاصله">${esc(row.headroomText)}</td>
      <td data-label="تغییر">${esc(row.changeText || '—')}${row.atCommitText
        ? `<br><small>در ثبت: ${esc(row.atCommitText)}</small>` : ''}</td>
    </tr>`).join('');
  }

  function paintClock(session) {
    const section = $('pt-clock');
    if (!session?.now?.date) { section.hidden = true; return; }
    section.hidden = false;
    const view = portfolioClockView(session, { days: dates, expiryDate: expiryOf(session) });
    $('pt-clock-now').textContent = view.nowText;
    $('pt-clock-steps').innerHTML = view.steps.map((step) => `<button type="button"
      class="ghost" data-pt-step="${esc(step.key)}"${step.enabled ? '' : ' disabled'}
      title="${esc(step.enabled ? step.toText : step.why)}">${esc(step.label)}</button>`).join('');
    // وقتی هیچ پله‌ای ممکن نیست، سکوت یعنی کاربر فکر می‌کند رابط خراب
    // است.
    $('pt-clock-warn').hidden = view.anyEnabled;
    $('pt-clock-warn').textContent = view.anyEnabled ? '' : view.blockedWhy;
  }

  /** نزدیک‌ترین سررسیدِ موقعیت‌های باز، برای پلهٔ «تا سررسید». */
  function expiryOf(session) {
    const expiries = (session?.events || [])
      .flatMap((event) => event?.data?.legs || [])
      .map((leg) => Number(leg?.expiry)).filter((value) => value > 0);
    return expiries.length ? Math.min(...expiries) : 0;
  }

  function paintLedger(session) {
    const section = $('pt-ledger');
    const view = portfolioLedgerView(session);
    if (!view.ok) {
      // علت را می‌گوییم؛ نوارِ خالی شبیه «همه‌چیز صفر است» دیده می‌شود.
      section.hidden = view.reason === 'noSession';
      $('pt-ledger-state').textContent = view.why;
      $('pt-ledger-figures').innerHTML = '';
      $('pt-ledger-risk').innerHTML = '<tr class="pt-ledger-empty"><td colspan="5">—</td></tr>';
      $('pt-ledger-families').textContent = '';
      $('pt-ledger-unpriced').hidden = true;
      return;
    }
    section.hidden = false;
    $('pt-ledger-state').textContent = view.headlineText;
    const figures = [
      ['سرمایهٔ جلسه', `${view.baseTomanText} تومان`],
      ['درگیر', `${view.committedTomanText} تومان`],
      ['آزاد', `${view.freeTomanText} تومان · ${view.freePctText}`],
      ...view.components.map((row) => [row.label, `${row.tomanText} تومان`]),
    ];
    $('pt-ledger-figures').innerHTML = figures
      .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
    $('pt-ledger-risk').innerHTML = view.risks.map((row) => `<tr data-state="${esc(row.state)}">
      <td data-label="قید ریسک">${esc(row.label)}</td>
      <td data-label="اکنون">${esc(row.currentText)}</td>
      <td data-label="حد مأموریت">${esc(row.limitText)}</td>
      <td data-label="فاصله">${esc(row.headroomText)}<br><small>${esc(row.headroomLabel)}</small></td>
      <td data-label="حکم"><b>${esc(row.stateLabel)}</b></td>
    </tr>`).join('');
    $('pt-ledger-families').textContent = view.families.length
      ? view.families.map((row) => `${row.label}: ${row.tomanText} تومان (${row.countText} ثبت)`).join(' · ')
      : '';
    // شمردنِ نداشته‌ها، نه پنهان‌کردنشان.
    $('pt-ledger-unpriced').hidden = !view.unpriced;
    $('pt-ledger-unpriced').textContent = view.unpriced ? view.unpriced.why : '';
  }

  // موقعیت‌ها زیر نوار سرمایه: اول چقدر جا مانده، بعد چه چیزی در دست
  // است، بعد چه می‌شود ثبت کرد. هیچ عددی اینجا حساب نمی‌شود.
  // نمودار موجود مصرف می‌شود، نه SVG تازه: دو ظاهر برای یک چیز یعنی
  // دو جا که باید هم‌زمان درست بمانند.
  let payoffChart = null;
  function paintPayoff(session) {
    const host = $('pt-payoff-chart');
    const view = portfolioPayoffView(session);
    if (payoffChart) { payoffChart.destroy(); payoffChart = null; }
    if (!view.ok) {
      // نمودارِ خالی چیزی نمی‌گوید؛ علت می‌گوید.
      host.innerHTML = '';
      $('pt-payoff-summary').textContent = '—';
      $('pt-payoff-state').textContent = view.why;
      return;
    }
    $('pt-payoff-summary').textContent = payoffSummaryText(view);
    // زیانِ نامحدود کنار نمودار گفته می‌شود، چون منحنی در لبه بریده
    // می‌شود و بریدگی شبیه سقفِ زیان دیده می‌شود.
    $('pt-payoff-state').textContent = `${view.positionsText} · اعمال‌ها ${view.strikesText}`
      + (view.unlimitedLoss ? ' · زیان در این سمت سقف ندارد؛ لبهٔ نمودار سقف نیست.' : '');
    payoffChart = mountPayoff(host, view.chart.legs, view.chart.netCashRial,
      view.chart.options);
  }

  function paintPositions(session) {
    const section = $('pt-positions');
    // ارزش‌گذاری از همان مدرک هم‌لحظه‌ای می‌آید که حکم اجراپذیری از آن
    // ساخته شد. اگر نشود ارزش‌گذاری کرد، جدول نمی‌شکند — ستون‌ها ساکت
    // می‌مانند و علتش بالای جدول می‌آید.
    const valuation = portfolioSessionValuation(session, portfolioSessionEligibility(session));
    const view = portfolioSessionPositionsView(session, valuation);
    const candidateByPosition = new Map((session?.events || [])
      .filter((event) => event?.type === 'transaction' && event?.data?.candidateId)
      .map((event) => [String(event.positionId), String(event.data.candidateId)]));
    const warn = $('pt-positions-undocumented');
    if (!view.ok) {
      section.hidden = view.reason === 'noSession';
      $('pt-positions-state').textContent = view.why;
      $('pt-positions-body').innerHTML = '<tr class="pt-positions-empty"><td colspan="10">—</td></tr>';
      $('pt-positions-total').textContent = '';
      warn.hidden = true;
      return;
    }
    section.hidden = false;
    // جدول خالی شبیه «چیزی نمی‌دانیم» است؛ جمله می‌گوید هنوز ثبتی نشده.
    $('pt-positions-state').textContent = view.empty ? view.note : view.countsText;
    $('pt-positions-body').innerHTML = view.rows.length ? view.rows.map((row) => `<tr data-status="${esc(row.status)}" data-documented="${row.documented}">
      <td data-label="موقعیت">${esc(row.defLabel)}<br><small>${esc(row.familyLabelFromId)} · ${esc(row.idText)}</small></td>
      <td data-label="وضعیت"><b>${esc(row.statusLabel)}</b></td>
      <td data-label="حجم">${esc(row.openQtyText)}${row.openQtyText === row.initialQtyText ? '' : `<br><small>از ${esc(row.initialQtyText)}</small>`}</td>
      <td data-label="سرمایه">${esc(row.capitalTomanText)}</td>
      <td data-label="ارزش جاری">${esc(row.valueTomanText)}${row.valuedWhy
        ? `<br><small>${esc(row.valuedWhy)}</small>` : ''}</td>
      <td data-label="سود تحقق‌نیافته" class="${esc(row.unrealizedTone)}">${esc(row.unrealizedTomanText)}</td>
      <td data-label="سود تحقق‌یافته" class="${esc(row.realizedTone)}">${esc(row.realizedTomanText)}${row.realizedWhy
        ? `<br><small>${esc(row.realizedWhy)}</small>` : ''}</td>
      <td data-label="پاها">${row.legTexts.length
        ? row.legTexts.map((leg) => `<div>${esc(leg)}</div>`).join('')
        : `<span class="pt-positions-why">${esc(row.why || '—')}</span>`}</td>
      <td data-label="کیفیت">${esc(row.qualityLabel)}${row.qualityReason ? `<br><small>${esc(row.qualityReason)}</small>` : ''}</td>
      <td data-label="مدیریت حجم">${row.closable
        ? `<div class="pt-position-manage"><label><span>حجم</span><input type="text" inputmode="numeric"
            data-pt-adjust-qty="${esc(row.id)}" aria-label="حجم تغییر ${esc(row.idText)}"
            placeholder="تا ${esc(row.openQtyText)}"></label>
          <div><button type="button" class="ghost" data-pt-increase="${esc(row.id)}"
            data-pt-candidate="${esc(candidateByPosition.get(row.id) || '')}">افزایش</button>
          <button type="button" class="ghost" data-pt-reduce="${esc(row.id)}">کاهش</button>
          <button type="button" class="ghost" data-pt-close="${esc(row.id)}">آفست کامل</button></div></div>`
        : '—'}</td>
    </tr>`).join('') : '<tr class="pt-positions-empty"><td colspan="10">—</td></tr>';
    // جمعِ کل فقط وقتی نوشته می‌شود که کامل باشد؛ وگرنه علتش.
    const total = $('pt-positions-total');
    total.textContent = view.valuationText || view.valuationWhy;
    total.className = `pt-positions-total ${view.valuationText ? view.valuationTone : ''}`.trim();
    warn.hidden = !view.undocumentedText;
    warn.textContent = view.undocumentedText;
  }

  function paintProposals(session) {
    proposalSession = session;
    // یک نقطهٔ فراخوانی: نوار سرمایه و پیشنهادها همیشه از یک جلسه ساخته
    // می‌شوند. دو فراخوانی جدا یعنی روزی یکی جا می‌ماند و کاربر وضعیت یک
    // جلسه را کنار پیشنهاد جلسهٔ دیگر می‌بیند.
    paintWatch(session);
    paintCloseout(session);
    paintClock(session);
    paintLedger(session);
    paintPositions(session);
    paintPayoff(session);
    // این مجموعه کشِ رابط نیست؛ هر بار از دفتر immutable جلسه ساخته
    // می‌شود تا refresh طرح مصرف‌شده را دوباره قابل ثبت نشان ندهد.
    committedIds.clear();
    for (const event of session?.events || []) {
      if (event?.type === 'transaction'
        && event?.data?.commitVersion === PORTFOLIO_COMMIT_VERSION
        && event?.data?.candidateId) committedIds.add(String(event.data.candidateId));
    }
    const section = $('pt-proposals');
    const evidence = portfolioSessionEligibility(session);
    const view = portfolioSessionProposals(session, evidence);
    const asideTable = $('pt-proposals-aside');
    const asideTitle = $('pt-proposals-aside-title');
    if (!view.ok) {
      // جدول خالی چیزی نمی‌گوید؛ علت می‌گوید.
      section.hidden = view.reason === 'inactiveSession';
      $('pt-proposals-state').textContent = view.why;
      $('pt-proposals-body').innerHTML = '<tr class="pt-proposals-empty"><td colspan="9">—</td></tr>';
      asideTable.hidden = true;
      asideTitle.hidden = true;
      return;
    }
    section.hidden = false;
    $('pt-proposals-state').textContent = view.countsText;
    $('pt-proposals-body').innerHTML = view.shortlist.length ? view.shortlist.map((row) => `<tr>
      <td data-label="رتبه">${esc(row.rankText)}</td>
      <td data-label="استراتژی">${esc(row.defLabel)}<br><small>${esc(row.familyLabel)}</small></td>
      <td data-label="امتیاز"><b>${esc(row.scoreText)}</b></td>
      <td data-label="سرمایه لازم">${esc(row.capitalTomanText)}</td>
      <td data-label="بیشترین سود">${esc(row.maxProfitTomanText)}</td>
      <td data-label="بیشترین زیان">${esc(row.maxLossTomanText)}</td>
      <td data-label="چرا این جایگاه">${esc(row.liftedText)}${row.draggedText === '—' ? '' : `<br><small>کاهنده: ${esc(row.draggedText)}</small>`}</td>
      <td data-label="کیفیت">${esc(row.qualityLabel)}${row.qualityReason ? `<br><small>${esc(row.qualityReason)}</small>` : ''}</td>
      <td data-label="انتخاب">${committedIds.has(row.candidateId)
        ? '<b class="pt-committed">ثبت شد</b>'
        : `<div class="pt-proposal-commit"><label><span>حجم</span><input type="text" inputmode="numeric"
            data-pt-quantity="${esc(row.candidateId)}" aria-label="حجم ${esc(row.defLabel)}"
            placeholder="تا ${esc(row.executableQtyText)}"></label>
          <button type="button" class="ghost" data-pt-commit="${esc(row.candidateId)}">انتخاب و ثبت</button></div>`}</td>
    </tr>`).join('') : '<tr class="pt-proposals-empty"><td colspan="9">هیچ طرحی با این مأموریت رتبه نگرفت.</td></tr>';

    asideTable.hidden = view.setAside.length === 0;
    asideTitle.hidden = view.setAside.length === 0;
    $('pt-proposals-aside-body').innerHTML = view.setAside.map((row) => `<tr class="pt-proposals-aside" data-kind="${esc(row.kind)}">
      <td data-label="استراتژی">${esc(row.defLabel)}</td>
      <td data-label="وضعیت"><b>${esc(row.kindLabel)}</b></td>
      <td data-label="علت">${esc(row.why)}${row.unknownText ? `<br><small>${esc(row.unknownText)}</small>` : ''}</td>
      <td data-label="کیفیت">${esc(row.qualityLabel)}</td>
    </tr>`).join('');
  }

  /**
   * مراحل ویزارد پس از قفل.
   *
   * قفل‌شدن جای مرحله را کم نمی‌کرد: اندازه‌گیری مرورگر نشان داد نوار
   * هشدار ۲۴۶۰ پیکسل (و در موبایل ۵۱۹۲) از بالای صفحه فاصله دارد، یعنی
   * کاربر باید کل ویزارد را رد کند تا بفهمد قیدی شکسته.
   *
   * جمع‌شدن یعنی **کوچک‌شدن، نه ناپدیدشدن**: سرِ هر مرحله می‌ماند تا
   * کاربر بداند چه قفل کرده، و با یک دکمه باز می‌شود — برای دیدن، نه
   * ویرایش؛ قفل ویرایش سرِ جایش است.
   */
  const WIZARD_STEPS = ['pt-outlook-step', 'pt-risk-step', 'pt-allocation-step',
    'pt-review-step'];

  function collapseWizard() {
    const cards = [root.querySelector('.pt-main > .pt-card'),
      ...WIZARD_STEPS.map((id) => $(id))].filter(Boolean);
    for (const card of cards) {
      card.dataset.collapsed = 'true';
      const head = card.querySelector('.section-head');
      if (!head || head.querySelector('[data-pt-expand]')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost pt-expand';
      button.dataset.ptExpand = card.id || 'setup';
      button.textContent = 'نمایش';
      // این دکمه باید بعد از قفل هم کار کند، پس از قفلِ عمومی مستثناست.
      button.dataset.ptKeepEnabled = 'true';
      head.append(button);
    }
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pt-expand]');
    if (!button) return;
    const card = button.closest('.pt-card');
    const open = card.dataset.collapsed !== 'true';
    card.dataset.collapsed = open ? 'true' : 'false';
    button.textContent = open ? 'نمایش' : 'جمع کن';
  });

  function lockMissionEditor() {
    root.dataset.missionActive = 'true';
    root.querySelectorAll('input, select, textarea, button').forEach((control) => {
      if (!control.closest('#pt-eligibility') && !control.closest('#pt-proposals')
        && !control.closest('#pt-ledger') && !control.closest('#pt-positions')
        && !control.closest('#pt-clock') && !control.closest('#pt-watch')
        && !control.closest('#pt-closeout')
        && control.dataset.ptKeepEnabled !== 'true') control.disabled = true;
    });
    collapseWizard();
  }

  function reviewDates() {
    const start = Number($('pt-start-date').dataset.value), end = Number($('pt-end-date').dataset.value);
    const startLabel = dates.includes(start) ? faDigits(historyDateLabel(start)) : '';
    const endLabel = dates.includes(end) ? faDigits(historyDateLabel(end)) : '';
    const startTime = $('pt-start-time').selectedOptions[0]?.textContent || '';
    const endTime = $('pt-end-time').selectedOptions[0]?.textContent || '';
    $('pt-review-start').textContent = startLabel ? `${startLabel} · ${startTime}` : 'انتخاب نشده';
    $('pt-review-end').textContent = endLabel ? `${endLabel} · ${endTime}` : 'انتخاب نشده';
  }

  function resetHistoryDates() {
    dates = [];
    $('pt-dates').hidden = true;
    $('pt-start-date').dataset.value = '';
    $('pt-end-date').dataset.value = '';
    reviewDates();
  }

  function paintEndCalendar() {
    const start = Number($('pt-start-date').dataset.value);
    const allowed = dates.filter((date) => date >= start);
    const old = Number($('pt-end-date').dataset.value);
    const selected = allowed.includes(old) ? old : allowed.at(-1);
    mountDateWheel($('pt-end-date'), allowed, selected, () => { reviewDates(); clearErrors(); invalidateSetupDraft(); }, { empty: 'روز پایانی معتبری وجود ندارد.' });
    reviewDates();
  }

  function mountCalendars() {
    const oldStart = Number($('pt-start-date').dataset.value);
    const selected = dates.includes(oldStart) ? oldStart : dates[Math.max(0, dates.length - 20)];
    mountDateWheel($('pt-start-date'), dates, selected, () => { paintEndCalendar(); clearErrors(); invalidateSetupDraft(); }, { empty: 'روز معاملاتی برای شروع وجود ندارد.' });
    paintEndCalendar();
    $('pt-dates').hidden = false;
  }

  async function loadDates() {
    const ins = String(base.value || '');
    $('pt-review-base').textContent = base.selectedOptions[0]?.textContent || 'انتخاب نشده';
    if (!ins || ins === loadedIns) return;
    const ticket = historyRequests.begin(ins);
    loadedIns = ins;
    resetHistoryDates();
    $('pt-feed-status').textContent = 'در حال دریافت روزهای معاملاتی…';
    try {
      const response = await fetch(`/api/dailies?ins=${encodeURIComponent(ins)}&n=0`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
      const nextDates = (payload?.[ins]?.rows || [])
        .map((row) => normalizeHistoryDate(row.date)).filter(Boolean).sort((a, b) => a - b);
      if (!nextDates.length) throw new Error('برای این نماد روز معاملاتی ثبت نشده است');
      if (!historyRequests.accepts(ticket, base.value)) return;
      dates = nextDates;
      mountCalendars();
      $('pt-feed-status').textContent = `${fmt.int(dates.length)} روز معاملاتی آماده است`;
      $('pt-feed-status').removeAttribute('data-error');
      clearErrors();
    } catch (error) {
      if (!historyRequests.accepts(ticket, base.value)) return;
      loadedIns = '';
      $('pt-feed-status').textContent = String(error?.message || 'تاریخچه دریافت نشد');
      $('pt-feed-status').dataset.error = 'true';
    }
  }

  function paintSymbols(watch) {
    const keep = base.value;
    chain = buildChain(watch?.rows || []);
    symbols = underlyingList(chain, state.settings);
    base.innerHTML = symbols.length
      ? `${capitalContinuitySeed ? '<option value="">نماد پایه را انتخاب کن</option>' : ''}`
        + symbols.map((row) => `<option value="${esc(row.ins)}">${esc(row.name || 'نماد بدون نام')}</option>`).join('')
      : '<option value="">نمادی در فهرست نیست</option>';
    if (symbols.some((row) => String(row.ins) === keep)) base.value = keep;
    else if (capitalContinuitySeed) base.value = '';
    $('pt-review-base').textContent = base.selectedOptions[0]?.textContent || 'انتخاب نشده';
    $('pt-feed-status').textContent = symbols.length ? `${fmt.int(symbols.length)} نماد پایه آماده است` : 'فهرست نمادها خالی است';
    if (symbols.length) $('pt-feed-status').removeAttribute('data-error');
    $('pt-retry').hidden = symbols.length > 0;
    if (base.value) loadDates();
  }

  function currentDraft() {
    const made = createPortfolioStepOneDraft({
      id: draftId, baseIns: base.value,
      capitalToman: capital.value, reserveToman: reserve.value,
      startDate: Number($('pt-start-date').dataset.value), startSecond: Number($('pt-start-time').value),
      endDate: Number($('pt-end-date').dataset.value), endSecond: Number($('pt-end-time').value),
      grain: $('pt-grain').value, createdAt: Date.now(),
    });
    return made.ok && capitalContinuitySeed
      ? attachPortfolioCapitalContinuity(made.draft, capitalContinuitySeed) : made;
  }

  function currentOutlookDraft() {
    return createPortfolioOutlookDraft(setupDraft, {
      direction: selectedValue('pt-direction'),
      targetPriceToman: $('pt-target-price').value,
      rangeLowToman: $('pt-range-low').value,
      rangeHighToman: $('pt-range-high').value,
      volatilityView: selectedValue('pt-volatility'),
      expectedVolatilityPct: $('pt-expected-volatility').value,
      confidencePct: $('pt-confidence').value,
      thesis: $('pt-thesis').value,
    });
  }

  function currentRiskDraft() {
    return createPortfolioRiskDraft(outlookDraft, currentRiskForm());
  }

  function currentAllocationDraft() {
    return createPortfolioAllocationDraft(riskDraft, allocationRows());
  }

  /**
   * ثبت پیش‌نویس مرحله جاری روی سرور.
   *
   * قاعده یکی است: **ناموفق هرگز موفق نمایش داده نمی‌شود.** شبکه قطع،
   * ۵۰۰ سرور و تعارض نسخه، هر سه پیام خطای خودشان را کنار همین کنترل
   * می‌گذارند. اگر این تابع ساکت شکست بخورد، کاربر با خیال راحت تب را
   * می‌بندد و کار نیم‌ساعتش را از دست می‌دهد.
   */
  async function persistNow(next) {
    const state = $('pt-persist-state');
    state.removeAttribute('data-error');
    state.textContent = 'در حال ثبت روی سرور…';
    const saved = await saveMissionDraft(next, { expectedSavedAt: lastSavedAt });
    if (!saved.ok) {
      state.dataset.error = 'true';
      state.textContent = saved.conflict
        ? `روی سرور ثبت نشد — ${saved.why} جلسه را از فهرست دوباره باز کن.`
        : `روی سرور ثبت نشد — ${saved.why}`;
      return saved;
    }
    lastSavedAt = saved.savedAt;
    state.textContent = `روی سرور ثبت شد · ${faDigits(new Date(saved.savedAt).toLocaleTimeString('fa-IR', { hour12: false }))}`;
    refreshSessions();
    return saved;
  }

  async function persist(next) {
    if (resuming || !next?.session?.id) return;
    const operation = persistQueue.then(() => persistNow(next));
    // شکست یک ثبت، صف را برای تلاش صریح بعدی مسموم نمی‌کند؛ خود فراخوان
    // همچنان نتیجهٔ شکست را می‌گیرد و حق ندارد آن را موفق نشان دهد.
    persistQueue = operation.catch(() => {});
    return operation;
  }

  /** فهرست جلسه‌ها و پرونده‌های سرور. خطا، فهرست خالیِ «سالم» نیست. */
  async function refreshSessions() {
    const pick = $('pt-resume-pick'), state = $('pt-resume-state');
    const [listed, dossiers] = await Promise.all([listMissionSaves(), listDossiers()]);
    dossierSummaries = dossiers.ok
      ? dossiers.dossiers.filter((row) => row?.id && !row.broken) : [];
    if (!listed.ok && !dossiers.ok) {
      pick.innerHTML = '<option value="">فهرست خوانده نشد</option>';
      state.dataset.error = 'true';
      state.textContent = `فهرست‌های سرور خوانده نشدند — ${listed.why} · ${dossiers.why}`;
      return;
    }
    const missionRows = listed.ok
      ? listed.sessions.filter((row) => row?.id && row.id !== draftId) : [];
    const dossierRows = dossiers.ok ? dossiers.dossiers.filter((row) => row?.id) : [];
    const options = [];
    for (const row of dossierRows) {
      if (row.broken) {
        options.push(`<option value="" data-kind="broken" disabled>پرونده خراب — ${esc(row.why || 'خوانده نشد')}</option>`);
        continue;
      }
      const day = Number(row?.closedAt?.date);
      const when = Number.isFinite(day) && day > 0 ? faDigits(historyDateLabel(day)) : 'تاریخ نامعلوم';
      options.push(`<option value="${esc(row.id)}" data-kind="dossier">${esc(when)} — پرونده بسته‌شده</option>`);
    }
    for (const row of missionRows) {
      // برچسب ردیف، شناسه خام نیست. شناسه هم رقم لاتین دارد (قاعده ۲-۳) و
      // هم به کاربر نمی‌گوید کدام سفر است؛ تاریخ شروع و مرحله می‌گوید.
      const day = Number(row?.start?.date);
      const when = Number.isFinite(day) && day > 0 ? faDigits(historyDateLabel(day)) : 'تاریخ نامعلوم';
      options.push(`<option value="${esc(row.id)}" data-kind="mission">${esc(when)} — ${esc(missionSaveLabel(row))}</option>`);
    }
    if (!options.length) {
      pick.innerHTML = '<option value="">جلسه‌ای برای ادامه نیست</option>';
      state.textContent = 'هنوز جلسه‌ای روی سرور ذخیره نشده است.';
      return;
    }
    pick.innerHTML = options.join('');
    const failures = [!listed.ok ? `جلسه‌ها: ${listed.why}` : '',
      !dossiers.ok ? `پرونده‌ها: ${dossiers.why}` : ''].filter(Boolean);
    if (failures.length) state.dataset.error = 'true';
    else state.removeAttribute('data-error');
    state.textContent = failures.length
      ? `${fmt.int(options.length)} ردیف خوانده شد؛ ${failures.join(' · ')}`
      : `${fmt.int(options.length)} جلسه یا پرونده روی سرور ذخیره شده است.`;
  }

  /**
   * رکورد ذخیره‌شده را به فرم برمی‌گرداند.
   *
   * مرحله‌ها با همان دکمه‌هایی بازساخته می‌شوند که کاربر می‌زند، نه با یک
   * مسیر موازی. اگر مسیر دومی برای ساختن draft وجود داشت، روزی یکی از دو
   * مسیر اعتبارسنجی تازه‌ای می‌گرفت و آن‌یکی نه — و پیش‌نویسِ ادامه‌داده‌شده
   * از قیدی رد می‌شد که پیش‌نویسِ تازه از آن رد نمی‌شود.
   */
  async function applyResumed(record) {
    const { inputs } = record;
    resuming = true;
    try {
      draftId = record.id;
      lastSavedAt = record.savedAt;
      capitalContinuitySeed = record.draft.capitalContinuity
        ? structuredClone(record.draft.capitalContinuity) : null;

      base.value = inputs.setup.baseIns;
      historyRequests.invalidate();
      loadedIns = '';
      resetHistoryDates();
      await loadDates();
      if (!dates.includes(inputs.setup.startDate) || !dates.includes(inputs.setup.endDate)) {
        return { ok: false, why: 'روزهای ذخیره‌شده در تقویم این نماد نیستند' };
      }
      $('pt-start-date').dataset.value = String(inputs.setup.startDate);
      mountCalendars();
      $('pt-end-date').dataset.value = String(inputs.setup.endDate);
      paintEndCalendar();
      $('pt-start-time').value = String(inputs.setup.startSecond);
      $('pt-end-time').value = String(inputs.setup.endSecond);
      $('pt-grain').value = inputs.setup.grain;
      capital.value = inputs.setup.capitalToman;
      reserve.value = inputs.setup.reserveToman;
      formatMoneyInput(capital); formatMoneyInput(reserve);
      paintCapital();
      $('pt-save-step').onclick();
      if (!setupDraft) return { ok: false, why: 'مرحله نخست از رکورد ذخیره‌شده بازسازی نشد' };

      if (inputs.outlook) {
        setRadio('pt-direction', inputs.outlook.direction);
        setRadio('pt-volatility', inputs.outlook.volatilityView);
        $('pt-target-price').value = inputs.outlook.targetPriceToman;
        $('pt-range-low').value = inputs.outlook.rangeLowToman;
        $('pt-range-high').value = inputs.outlook.rangeHighToman;
        $('pt-expected-volatility').value = inputs.outlook.expectedVolatilityPct;
        $('pt-confidence').value = inputs.outlook.confidencePct;
        $('pt-thesis').value = inputs.outlook.thesis;
        $('pt-save-outlook').onclick();
        if (!outlookDraft) return { ok: false, why: 'انتظار بازار از رکورد ذخیره‌شده بازسازی نشد' };
      }

      if (inputs.risk) {
        $('pt-max-loss').value = inputs.risk.maxLossPct;
        $('pt-max-drawdown').value = inputs.risk.maxDrawdownPct;
        $('pt-min-free').value = inputs.risk.minFreeCapitalPct;
        $('pt-max-margin').value = inputs.risk.maxMarginUsePct;
        $('pt-underlying-value').value = inputs.risk.minUnderlyingDailyValueToman;
        $('pt-option-value').value = inputs.risk.minOptionDailyValueToman;
        $('pt-open-interest').value = inputs.risk.minOpenInterest;
        $('pt-max-spread').value = inputs.risk.maxSpreadPct;
        $('pt-book-take').value = inputs.risk.maxBookTakePct;
        setRadio('pt-unlimited', inputs.risk.allowUnlimitedRisk);
        setRadio('pt-full-book', inputs.risk.requireFullBook);
        $('pt-save-risk').onclick();
        if (!riskDraft) return { ok: false, why: 'قیود ریسک از رکورد ذخیره‌شده بازسازی نشد' };
      }

      if (inputs.allocation) {
        resetAllocationRows();
        inputs.allocation.forEach((row) => addAllocationRow(row));
        $('pt-save-allocation').onclick();
        if (!allocationDraft) return { ok: false, why: 'تخصیص خانواده‌ها از رکورد ذخیره‌شده بازسازی نشد' };
      }

      if (inputs.mission) {
        setRadio('pt-objective', inputs.mission.objectiveMode);
        setRadio('pt-return-base', inputs.mission.returnBase);
        $('pt-target-return').value = inputs.mission.targetReturnPct;
        $('pt-max-holding').value = inputs.mission.maxHoldingDays;
        paintFinalReview();
      }

      if (record.readOnly) {
        draft = record.draft;
        paintSnapshot(record.session.startSnapshot);
      }
      paintEligibility(record.session);
      paintProposals(record.session);
      paintProgress(record.stage);
      return { ok: true, why: '' };
    } finally {
      resuming = false;
    }
  }

  function setRadio(name, value) {
    const input = root.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  capital.oninput = () => {
    capitalContinuitySeed = null;
    $('pt-capital-source').hidden = true;
    paintCapital(); invalidateSetupDraft();
  };
  reserve.oninput = () => { paintCapital(); invalidateSetupDraft(); };
  capital.onblur = () => formatMoneyInput(capital); reserve.onblur = () => formatMoneyInput(reserve);
  base.onchange = () => {
    historyRequests.invalidate(); loadedIns = ''; resetHistoryDates();
    clearErrors(); invalidateSetupDraft(); loadDates();
  };
  $('pt-start-time').onchange = () => { reviewDates(); invalidateSetupDraft(); };
  $('pt-end-time').onchange = () => { reviewDates(); invalidateSetupDraft(); };
  $('pt-grain').onchange = () => { $('pt-review-grain').textContent = $('pt-grain').selectedOptions[0]?.textContent || '—'; clearErrors(); invalidateSetupDraft(); };
  $('pt-retry').onclick = () => api.retryFeed();
  $('pt-resume-open').onclick = async () => {
    const pick = $('pt-resume-pick');
    const id = pick.value;
    const kind = pick.selectedOptions[0]?.dataset.kind || 'mission';
    const state = $('pt-resume-state');
    if (!id) { state.dataset.error = 'true'; state.textContent = 'اول یک جلسه را انتخاب کن.'; return; }
    state.removeAttribute('data-error');
    if (kind === 'dossier') {
      state.textContent = 'در حال خواندن پرونده از سرور…';
      const loaded = await loadDossier(id);
      if (!loaded.ok) {
        state.dataset.error = 'true';
        state.textContent = loaded.notFound ? 'این پرونده روی سرور نیست.' : `پرونده خوانده نشد — ${loaded.why}`;
        return;
      }
      const restored = dossierRecordView(loaded.record);
      if (!restored.ok) {
        state.dataset.error = 'true';
        state.textContent = `این پرونده نمایش‌پذیر نیست — ${restored.why}`;
        return;
      }
      // پرونده در کارت مرحله مرور رسم می‌شود. این مرحله در شروع فرم hidden
      // است و paintProgress فقط نوار پیشرفت را عوض می‌کند؛ پس بازیابی باید
      // خود کارت را نیز آشکار کند تا پرونده و روند سرمایه واقعاً دیده شوند.
      reviewStep.hidden = false;
      paintProgress('active');
      paintSnapshot(restored.session.startSnapshot);
      paintProposals(restored.session);
      paintDossier(restored);
      lockMissionEditor();
      root.querySelectorAll('[data-pt-commit], [data-pt-close], [data-pt-step]')
        .forEach((control) => { control.disabled = true; });
      $('pt-closeout-do').hidden = true;
      state.textContent = 'پرونده بسته‌شده از سرور باز شد؛ همه کنترل‌های معامله فقط‌خواندنی‌اند.';
      return;
    }
    state.textContent = 'در حال خواندن جلسه از سرور…';
    const loaded = await loadMissionSave(id);
    if (!loaded.ok) {
      state.dataset.error = 'true';
      state.textContent = loaded.notFound ? 'این جلسه روی سرور نیست.' : `جلسه خوانده نشد — ${loaded.why}`;
      return;
    }
    // رکورد را دوباره می‌سنجیم. سرور هم سنجیده، ولی اینجاست که ریال به
    // تومان برمی‌گردد و رکوردی که از نظر قرارداد درست است می‌تواند به
    // ورودی فرم برنگردد.
    const restored = resumeMissionRecord(loaded.record);
    if (!restored.ok) {
      state.dataset.error = 'true';
      state.textContent = `این جلسه ادامه‌پذیر نیست — ${restored.why}`;
      return;
    }
    const applied = await applyResumed(restored.record);
    if (!applied.ok) {
      state.dataset.error = 'true';
      state.textContent = `ادامه ناموفق — ${applied.why}`;
      return;
    }
    if (restored.record.readOnly) {
      lockMissionEditor();
      state.textContent = 'جلسه فعال است؛ مأموریت و عکس شروع قفل‌اند و فقط خوانده می‌شوند.';
    } else {
      state.textContent = `ادامه از ${missionSaveLabel(restored.record)}.`;
    }
    $('pt-persist-state').textContent = `آخرین ثبت سرور · ${faDigits(new Date(restored.record.savedAt).toLocaleTimeString('fa-IR', { hour12: false }))}`;
  };
  $('pt-save-step').onclick = () => {
    const result = currentDraft();
    if (!result.ok) { showError(result.why); return; }
    clearErrors(); setupDraft = result.draft; draft = result.draft; root.dataset.draftReady = 'true';
    $('pt-save-state').removeAttribute('data-error');
    $('pt-save-state').textContent = 'مرحله نخست ثبت شد؛ حالا انتظار خودت از بازار را ثبت کن.';
    $('pt-save-step').textContent = 'به‌روزرسانی پیش‌نویس مرحله اول';
    outlookStep.hidden = false; paintProgress('outlook'); paintOutlook();
    persist(result.draft);
  };

  root.querySelectorAll('input[name="pt-direction"], input[name="pt-volatility"]').forEach((input) => {
    input.onchange = () => { clearErrors(); invalidateOutlookDraft(); paintOutlook(); };
  });
  ['pt-target-price', 'pt-range-low', 'pt-range-high', 'pt-expected-volatility', 'pt-thesis'].forEach((id) => {
    $(id).oninput = () => { clearErrors(); invalidateOutlookDraft(); paintOutlook(); };
  });
  ['pt-target-price', 'pt-range-low', 'pt-range-high'].forEach((id) => {
    $(id).onblur = () => { formatOptionalMoney($(id)); paintOutlook(); };
  });
  $('pt-confidence').oninput = () => { clearErrors(); invalidateOutlookDraft(); paintOutlook(); };
  $('pt-save-outlook').onclick = () => {
    const result = currentOutlookDraft();
    if (!result.ok) { showOutlookError(result.why); return; }
    clearErrors(); outlookDraft = result.draft; draft = result.draft; root.dataset.outlookReady = 'true';
    $('pt-outlook-state').removeAttribute('data-error');
    $('pt-outlook-state').textContent = 'انتظار بازار ثبت شد؛ هنوز مأموریت فعال و آینده آشکار نشده است.';
    $('pt-save-outlook').textContent = 'به‌روزرسانی انتظار بازار';
    riskStep.hidden = false; paintProgress('risk'); paintOutlook(); paintRisk();
    persist(result.draft);
  };

  const riskInputIds = ['pt-max-loss', 'pt-max-drawdown', 'pt-min-free', 'pt-max-margin',
    'pt-underlying-value', 'pt-option-value', 'pt-open-interest', 'pt-max-spread', 'pt-book-take'];
  riskInputIds.forEach((id) => {
    $(id).oninput = () => { clearErrors(); invalidateRiskDraft(); paintRisk(); };
  });
  ['pt-underlying-value', 'pt-option-value', 'pt-open-interest'].forEach((id) => {
    $(id).onblur = () => { formatOptionalMoney($(id)); paintRisk(); };
  });
  root.querySelectorAll('input[name="pt-unlimited"], input[name="pt-full-book"]').forEach((input) => {
    input.onchange = () => { clearErrors(); invalidateRiskDraft(); paintRisk(); };
  });
  $('pt-save-risk').onclick = () => {
    const result = currentRiskDraft();
    if (!result.ok) { showRiskError(result.why); return; }
    clearErrors(); riskDraft = result.draft; draft = result.draft; root.dataset.riskReady = 'true';
    $('pt-risk-state').textContent = 'مرزهای ریسک و اجرا ثبت شدند؛ مأموریت هنوز فعال نشده است.';
    $('pt-save-risk').textContent = 'به‌روزرسانی مرزهای ریسک و اجرا';
    $('pt-review-liquidity').textContent = 'دروازه کامل ثبت شد';
    resetAllocationRows(); addAllocationRow();
    allocationStep.hidden = false;
    paintProgress('allocation'); paintRisk(); paintAllocation();
    persist(result.draft);
  };

  $('pt-add-allocation').onclick = () => {
    clearErrors(); invalidateAllocationDraft(); addAllocationRow(); paintAllocation();
  };
  allocationRowsRoot.oninput = () => { clearErrors(); invalidateAllocationDraft(); paintAllocation(); };
  allocationRowsRoot.onchange = () => { clearErrors(); invalidateAllocationDraft(); paintAllocation(); };
  allocationRowsRoot.onclick = (event) => {
    const button = event.target.closest('.pt-remove-allocation');
    if (!button) return;
    clearErrors(); invalidateAllocationDraft();
    button.closest('.pt-allocation-row')?.remove();
    paintAllocation();
  };
  $('pt-save-allocation').onclick = () => {
    const result = currentAllocationDraft();
    if (!result.ok) { showAllocationError(result.why); paintAllocation(); return; }
    clearErrors(); allocationDraft = result.draft; missionDraft = null; draft = result.draft; root.dataset.allocationReady = 'true';
    $('pt-allocation-state').textContent = 'تخصیص ثبت شد؛ مأموریت، عکس شروع و پیشنهاد هنوز فعال نشده‌اند.';
    $('pt-save-allocation').textContent = 'به‌روزرسانی تخصیص خانواده‌ها';
    const plan = previewPortfolioAllocations(riskDraft, allocationRows()).plan;
    $('pt-review-allocation').textContent = `${fmt.pct(plan.allocationPct)}٪ تخصیص · ${fmt.pct(100 - plan.allocationPct)}٪ آزاد`;
    reviewStep.hidden = false;
    paintProgress('review'); paintAllocation(); paintFinalReview();
    persist(result.draft);
  };

  root.querySelectorAll('input[name="pt-objective"], input[name="pt-return-base"]').forEach((input) => {
    input.onchange = () => { clearErrors(); missionDraft = null; root.removeAttribute('data-mission-ready'); paintFinalReview(); };
  });
  ['pt-target-return', 'pt-max-holding'].forEach((id) => {
    $(id).oninput = () => { clearErrors(); missionDraft = null; root.removeAttribute('data-mission-ready'); paintFinalReview(); };
  });
  reviewStep.onclick = (event) => {
    const button = event.target.closest('[data-pt-edit]');
    if (!button) return;
    const target = ({
      setup: root.querySelector('.pt-main > .pt-card'),
      outlook: outlookStep, risk: riskStep, allocation: allocationStep, objective: reviewStep,
    })[button.dataset.ptEdit];
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('pt-proposals').onclick = async (event) => {
    const button = event.target.closest('[data-pt-commit]');
    if (!button || !proposalSession) return;
    const candidateId = button.dataset.ptCommit;
    const quantityInput = $('pt-proposals').querySelector(`[data-pt-quantity="${CSS.escape(candidateId)}"]`);
    const quantity = parseIntegerInput(quantityInput?.value);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      $('pt-proposals-state').textContent = 'حجم انتخابی را به‌صورت عدد صحیح مثبت وارد کن.';
      quantityInput?.setAttribute('aria-invalid', 'true');
      return;
    }
    quantityInput?.removeAttribute('aria-invalid');
    button.disabled = true;
    if (quantityInput) quantityInput.disabled = true;
    const evidence = portfolioSessionEligibility(proposalSession);
    const done = commitPortfolioPlan(proposalSession, evidence, candidateId, { quantity });
    if (!done.ok) {
      // شکست ثبت هیچ‌وقت شبیه موفقیت نشان داده نمی‌شود — و «کدام قید و
      // چقدر عبور» بخشی از همان خبر است، نه چیزی که کاربر باید حدس بزند.
      //
      // متنِ خودِ موتور اینجا استفاده نمی‌شود چون درصدهایش رقم لاتین‌اند؛
      // قالب‌بندی کار لایهٔ نمایش است. علتِ خام از همان جدول موتور می‌آید
      // تا دو متن برای یک حالت وجود نداشته باشد.
      const detail = breachText(done.breaches);
      $('pt-proposals-state').textContent = detail
        ? `${PORTFOLIO_COMMIT_REASONS[done.reason]} — ${detail}`
        : done.why;
      button.disabled = false;
      if (quantityInput) quantityInput.disabled = false;
      return;
    }
    const nextDraft = draft?.step === 'active'
      ? { ...draft, session: done.session, snapshot: done.session.startSnapshot }
      : null;
    const saved = nextDraft ? await persist(nextDraft) : null;
    if (!saved?.ok) {
      $('pt-proposals-state').textContent = `موقعیت نهایی نشد — ${saved?.why || 'جلسه فعال قابل ذخیره نبود'}`;
      button.disabled = false;
      if (quantityInput) quantityInput.disabled = false;
      return;
    }
    draft = nextDraft;
    paintProposals(done.session);
    const remaining = done.budget.remainingRial;
    $('pt-proposals-state').textContent = `ثبت شد — حجم ${fmt.int(quantity)} · موقعیت ${faDigits(done.positionId)}`
      + `${Number.isFinite(remaining) ? ` · باقی‌ماندهٔ خانواده ${fmt.int(remaining / 10)} تومان` : ''}`;
  };

  /**
   * قراردادهای عکسِ جاری، دوباره قیمت‌گذاری‌شده در لحظهٔ تازه.
   *
   * هویتِ قراردادها از بایگانی همان تاریخ می‌آید و **قیمتشان** از دفتر
   * سفارشِ لحظهٔ تازه. قراردادی که برای آن لحظه دفتری ندارد، بی‌قیمت می‌ماند و
   * `portfolioMomentSnapshot` خودش «فاقد داده» علامتش می‌زند — اینجا با
   * قیمتِ لحظهٔ قبل پر نمی‌شود.
   */
  async function repriceAt(session, at) {
    const priced = await loadMomentContracts(session, at, { days: dates });
    return { rows: priced.rows, spot: priced.spot, universe: priced.universe };
  }

  $('pt-clock').onclick = async (event) => {
    const button = event.target.closest('[data-pt-step]');
    if (!button || button.disabled || !proposalSession) return;
    const stepped = stepPortfolioSession(proposalSession, button.dataset.ptStep,
      { days: dates, expiryDate: expiryOf(proposalSession) });
    if (!stepped.ok) {
      // «تقویم تمام شد» و «از پایان جلسه رد می‌شود» دو چیزند و متن
      // خودشان را دارند.
      $('pt-clock-state').textContent = stepResultText(stepped);
      return;
    }
    root.querySelectorAll('[data-pt-step]').forEach((control) => { control.disabled = true; });
    $('pt-clock-state').textContent = 'در حال بریدن خوراک‌ها در لحظهٔ تازه…';
    const { rows, spot, universe } = await repriceAt(stepped.session, stepped.to);
    const built = portfolioMomentSnapshot(stepped.session, stepped.to, { spot, rows, universe });
    if (!built.ok) {
      $('pt-clock-state').textContent = built.why;
      paintClock(proposalSession);
      return;
    }
    const next = { ...stepped.session, momentSnapshot: built.snapshot };
    const nextDraft = draft?.step === 'active'
      ? { ...draft, session: next, snapshot: next.startSnapshot } : null;
    const saved = nextDraft ? await persist(nextDraft) : null;
    if (!saved?.ok) {
      paintClock(proposalSession);
      $('pt-clock-state').textContent = `حرکت زمان نهایی نشد — ${saved?.why || 'جلسه فعال قابل ذخیره نبود'}`;
      return;
    }
    draft = nextDraft;
    // هر چهار بخش فقط پس از تأیید سرور از همین یک نقطه دوباره رسم می‌شوند.
    paintEligibility(next);
    paintProposals(next);
    $('pt-clock-state').textContent = stepResultText(stepped);
    // جدولِ خالی به‌خاطر نبودِ داده، شبیه «هیچ فرصتی نیست» دیده می‌شود.
    // این تفاوت باید صریح گفته شود، نه از روی جدول حدس زده.
    const short = built.snapshot.quality?.sufficient === false;
    $('pt-clock-warn').hidden = !short;
    $('pt-clock-warn').textContent = short
      ? `عکسِ این لحظه ناکافی است — ${faDigits(String(built.missing.count))} قرارداد بدون داده`
        + `${built.missing.spot ? ' و قیمت پایه ناموجود' : ''}؛`
        + ' جدول‌های زیر کمتر از واقعیت‌اند.'
      : '';
  };

  $('pt-positions').onclick = async (event) => {
    const button = event.target.closest('[data-pt-increase], [data-pt-reduce], [data-pt-close]');
    if (!button || !proposalSession) return;
    const positionId = button.dataset.ptIncrease || button.dataset.ptReduce || button.dataset.ptClose;
    const input = $('pt-positions').querySelector(`[data-pt-adjust-qty="${CSS.escape(positionId)}"]`);
    const needsQty = Boolean(button.dataset.ptIncrease || button.dataset.ptReduce);
    const quantity = needsQty ? parseIntegerInput(input?.value) : undefined;
    if (needsQty && (!Number.isSafeInteger(quantity) || quantity <= 0)) {
      $('pt-positions-state').textContent = 'حجم تغییر را به‌صورت عدد صحیح مثبت وارد کن.';
      input?.setAttribute('aria-invalid', 'true');
      return;
    }
    input?.removeAttribute('aria-invalid');
    const rowControls = button.closest('.pt-position-manage')?.querySelectorAll('button, input') || [];
    rowControls.forEach((control) => { control.disabled = true; });
    const evidence = portfolioSessionEligibility(proposalSession);
    const operationId = `adjust-${proposalSession.id}-${positionId}-${proposalSession.events.length + 1}`;
    const done = button.dataset.ptIncrease
      ? commitPortfolioPlan(proposalSession, evidence, button.dataset.ptCandidate, {
        quantity, positionId, operationId,
      })
      : closePortfolioPosition(proposalSession, evidence, positionId,
        button.dataset.ptReduce ? { qty: quantity } : {});
    if (!done.ok) {
      // شکست بستن هیچ‌وقت شبیه موفقیت نشان داده نمی‌شود — و وقتی دفتر
      // سفارش کم‌عمق است، عددِ ممکن بخشی از همان خبر است.
      $('pt-positions-state').textContent = button.dataset.ptIncrease ? done.why : closeFailureText(done);
      rowControls.forEach((control) => { control.disabled = false; });
      return;
    }
    const nextDraft = draft?.step === 'active'
      ? { ...draft, session: done.session, snapshot: done.session.startSnapshot } : null;
    const saved = nextDraft ? await persist(nextDraft) : null;
    if (!saved?.ok) {
      $('pt-positions-state').textContent = `تغییر حجم نهایی نشد — ${saved?.why || 'جلسه فعال قابل ذخیره نبود'}`;
      rowControls.forEach((control) => { control.disabled = false; });
      return;
    }
    draft = nextDraft;
    // جدول موقعیت‌ها و نوار سرمایه فقط پس از تأیید سرور با جلسه تازه رسم می‌شوند.
    paintProposals(done.session);
    $('pt-positions-state').textContent = button.dataset.ptIncrease
      ? `حجم افزایش یافت — ${fmt.int(quantity)} قرارداد · lot ${faDigits(done.lotId)}`
      : closeDoneText(done);
  };

  $('pt-eligibility').onclick = (event) => {
    const button = event.target.closest('[data-pt-eligibility-filter]');
    if (!button) return;
    eligibilityFilter = button.dataset.ptEligibilityFilter;
    paintEligibilityRows();
  };
  $('pt-start-mission').onclick = async () => {
    const locked = createPortfolioMissionDraft(allocationDraft, currentMissionForm());
    if (!locked.ok) { showMissionError(locked.why); return; }
    clearErrors();
    const sourceDraft = allocationDraft;
    missionDraft = locked.draft;
    root.dataset.missionReady = 'true';
    root.setAttribute('aria-busy', 'true');
    $('pt-start-mission').disabled = true;
    $('pt-mission-state').textContent = 'در حال بریدن خوراک‌ها دقیقاً در لحظه شروع…';
    try {
      const snapshot = await startSnapshot(missionDraft.session);
      if (allocationDraft !== sourceDraft) throw new Error('تخصیص هنگام ساخت عکس شروع تغییر کرد؛ دوباره قفل کن');
      const active = activatePortfolioMissionDraft(missionDraft, snapshot);
      if (!active.ok) throw new Error(active.why);
      const saved = await persist(active.draft);
      if (!saved?.ok) throw new Error(saved?.why || 'جلسه فعال روی سرور ثبت نشد');
      draft = active.draft;
      paintSnapshot(active.draft.snapshot);
      paintEligibility(active.draft.session);
      paintProposals(active.draft.session);
      paintProgress('active');
      $('pt-mission-state').textContent = active.draft.snapshot.quality.sufficient
        ? 'مأموریت و عکس شروع قفل شدند؛ هنوز هیچ پیشنهاد یا معامله‌ای ساخته نشده است.'
        : 'مأموریت قفل شد؛ عکس شروع ناکافی است و علت‌ها بدون جایگزینی عدد نمایش داده شده‌اند.';
      lockMissionEditor();
    } catch (error) {
      missionDraft = null;
      root.removeAttribute('data-mission-ready');
      showMissionError(error?.message || 'عکس شروع قفل نشد');
      $('pt-start-mission').disabled = false;
    } finally {
      root.removeAttribute('aria-busy');
    }
  };

  paintCapital(); paintOutlook(); paintRisk(); paintAllocation();
  // فهرست جلسه‌ها همان اول خوانده می‌شود تا کاربر پیش از پر کردن دوباره
  // مرحله یک ببیند که پیش‌نویس نیمه‌کاره‌ای روی سرور دارد.
  refreshSessions();
  const unwatch = api.subscribeWatch(paintSymbols);
  const unfeed = api.onFeed((feed) => {
    if (feed.status === 'failed') {
      $('pt-feed-status').textContent = feed.error || 'دریافت فهرست نمادها ناموفق بود';
      $('pt-feed-status').dataset.error = 'true'; $('pt-retry').hidden = false;
    }
  });
  return () => {
    historyRequests.invalidate();
    unwatch?.(); unfeed?.(); setupDraft = null; outlookDraft = null; riskDraft = null;
    allocationDraft = null; missionDraft = null; draft = null;
  };
}
