import { buildChain, underlyingList } from '../../core/chain.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { historyDateLabel, normalizeHistoryDate } from '../../core/history.mjs';
import {
  MISSION_DIRECTIONS, MISSION_OBJECTIVES, MISSION_REPLAY_GRAINS,
  MISSION_RETURN_BASES, MISSION_VOLATILITY_VIEWS,
} from '../../core/portfolio-mission.mjs';
import { createTimeGate } from '../../core/time-gate.mjs';
import { GROUPS as STRATEGY_FAMILIES } from '../../strategies/catalog.mjs';
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
        <section class="card pt-card">
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
        </section>

        <section class="card pt-card">
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
            <label class="field"><span>حداقل ارزش روزانه نماد پایه</span><input id="pt-underlying-value" type="text" inputmode="numeric" placeholder="تومان" aria-describedby="pt-underlying-value-error"><small class="pt-field-error" id="pt-underlying-value-error" hidden></small></label>
            <label class="field"><span>حداقل ارزش روزانه اختیار</span><input id="pt-option-value" type="text" inputmode="numeric" placeholder="تومان" aria-describedby="pt-option-value-error"><small class="pt-field-error" id="pt-option-value-error" hidden></small></label>
            <label class="field"><span>حداقل موقعیت باز</span><input id="pt-open-interest" type="text" inputmode="numeric" placeholder="تعداد" aria-describedby="pt-open-interest-error"><small class="pt-field-error" id="pt-open-interest-error" hidden></small></label>
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

          <section class="pt-eligibility" id="pt-eligibility" aria-labelledby="pt-eligibility-title" hidden>
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
  let setupDraft = null, outlookDraft = null, riskDraft = null, allocationDraft = null;
  let missionDraft = null, draft = null;
  let eligibilityRows = [], eligibilityFilter = 'all';
  let allocationRowId = 0;
  // شناسه دیگر ثابت نیست: ادامه‌دادن یک جلسه یعنی همان شناسه سرور را
  // برداشتن، وگرنه هر بار یک جلسه تازه ساخته می‌شد و «ادامه» معنایی
  // نداشت.
  let draftId = `pt-ui-${Date.now()}`;
  // زمان ثبت سرور، هم برچسب وضعیت است و هم قفل خوش‌بینانه PUT بعدی.
  let lastSavedAt = null;
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
    const snapshot = {
      universe,
      daily,
      intraday: { trade: point.trade, quality: point.tradeQuality },
      book: { quote: point.quote, quality: point.bookQuality },
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

  function lockMissionEditor() {
    root.dataset.missionActive = 'true';
    root.querySelectorAll('input, select, textarea, button').forEach((control) => {
      if (!control.closest('#pt-eligibility')) control.disabled = true;
    });
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
    loadedIns = ins; dates = []; $('pt-dates').hidden = true;
    $('pt-feed-status').textContent = 'در حال دریافت روزهای معاملاتی…';
    try {
      const response = await fetch(`/api/dailies?ins=${encodeURIComponent(ins)}&n=0`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
      dates = (payload?.[ins]?.rows || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean).sort((a, b) => a - b);
      if (!dates.length) throw new Error('برای این نماد روز معاملاتی ثبت نشده است');
      mountCalendars();
      $('pt-feed-status').textContent = `${fmt.int(dates.length)} روز معاملاتی آماده است`;
      $('pt-feed-status').removeAttribute('data-error');
      clearErrors();
    } catch (error) {
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
      ? symbols.map((row) => `<option value="${esc(row.ins)}">${esc(row.name || 'نماد بدون نام')}</option>`).join('')
      : '<option value="">نمادی در فهرست نیست</option>';
    if (symbols.some((row) => String(row.ins) === keep)) base.value = keep;
    $('pt-review-base').textContent = base.selectedOptions[0]?.textContent || 'انتخاب نشده';
    $('pt-feed-status').textContent = symbols.length ? `${fmt.int(symbols.length)} نماد پایه آماده است` : 'فهرست نمادها خالی است';
    if (symbols.length) $('pt-feed-status').removeAttribute('data-error');
    $('pt-retry').hidden = symbols.length > 0;
    if (base.value) loadDates();
  }

  function currentDraft() {
    return createPortfolioStepOneDraft({
      id: draftId, baseIns: base.value,
      capitalToman: capital.value, reserveToman: reserve.value,
      startDate: Number($('pt-start-date').dataset.value), startSecond: Number($('pt-start-time').value),
      endDate: Number($('pt-end-date').dataset.value), endSecond: Number($('pt-end-time').value),
      grain: $('pt-grain').value, createdAt: Date.now(),
    });
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
  async function persist(next) {
    if (resuming || !next?.session?.id) return;
    const state = $('pt-persist-state');
    state.removeAttribute('data-error');
    state.textContent = 'در حال ثبت روی سرور…';
    const saved = await saveMissionDraft(next, { expectedSavedAt: lastSavedAt });
    if (!saved.ok) {
      state.dataset.error = 'true';
      state.textContent = saved.conflict
        ? `روی سرور ثبت نشد — ${saved.why} جلسه را از فهرست دوباره باز کن.`
        : `روی سرور ثبت نشد — ${saved.why}`;
      return;
    }
    lastSavedAt = saved.savedAt;
    state.textContent = `روی سرور ثبت شد · ${faDigits(new Date(saved.savedAt).toLocaleTimeString('fa-IR', { hour12: false }))}`;
    refreshSessions();
  }

  /** فهرست جلسه‌های سرور. خطای خواندن، فهرست خالیِ «سالم» نشان نمی‌دهد. */
  async function refreshSessions() {
    const pick = $('pt-resume-pick'), state = $('pt-resume-state');
    const listed = await listMissionSaves();
    if (!listed.ok) {
      pick.innerHTML = '<option value="">فهرست خوانده نشد</option>';
      state.dataset.error = 'true';
      state.textContent = `فهرست جلسه‌ها خوانده نشد — ${listed.why}`;
      return;
    }
    state.removeAttribute('data-error');
    const rows = listed.sessions.filter((row) => row?.id && row.id !== draftId);
    if (!rows.length) {
      pick.innerHTML = '<option value="">جلسه‌ای برای ادامه نیست</option>';
      state.textContent = 'هنوز جلسه‌ای روی سرور ذخیره نشده است.';
      return;
    }
    // برچسب ردیف، شناسه خام نیست. شناسه هم رقم لاتین دارد (قاعده ۲-۳) و
    // هم به کاربر نمی‌گوید کدام سفر است؛ تاریخ شروع و مرحله می‌گوید.
    pick.innerHTML = rows.map((row) => {
      const day = Number(row?.start?.date);
      const when = Number.isFinite(day) && day > 0 ? faDigits(historyDateLabel(day)) : 'تاریخ نامعلوم';
      return `<option value="${esc(row.id)}">${esc(when)} — ${esc(missionSaveLabel(row))}</option>`;
    }).join('');
    state.textContent = `${fmt.int(rows.length)} جلسه روی سرور ذخیره شده است.`;
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

      base.value = inputs.setup.baseIns;
      loadedIns = '';
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

  capital.oninput = () => { paintCapital(); invalidateSetupDraft(); };
  reserve.oninput = () => { paintCapital(); invalidateSetupDraft(); };
  capital.onblur = () => formatMoneyInput(capital); reserve.onblur = () => formatMoneyInput(reserve);
  base.onchange = () => { loadedIns = ''; clearErrors(); invalidateSetupDraft(); loadDates(); };
  $('pt-start-time').onchange = () => { reviewDates(); invalidateSetupDraft(); };
  $('pt-end-time').onchange = () => { reviewDates(); invalidateSetupDraft(); };
  $('pt-grain').onchange = () => { $('pt-review-grain').textContent = $('pt-grain').selectedOptions[0]?.textContent || '—'; clearErrors(); invalidateSetupDraft(); };
  $('pt-retry').onclick = () => api.retryFeed();
  $('pt-resume-open').onclick = async () => {
    const id = $('pt-resume-pick').value;
    const state = $('pt-resume-state');
    if (!id) { state.dataset.error = 'true'; state.textContent = 'اول یک جلسه را انتخاب کن.'; return; }
    state.removeAttribute('data-error');
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
      draft = active.draft;
      paintSnapshot(active.draft.snapshot);
      paintEligibility(active.draft.session);
      paintProgress('active');
      $('pt-mission-state').textContent = active.draft.snapshot.quality.sufficient
        ? 'مأموریت و عکس شروع قفل شدند؛ هنوز هیچ پیشنهاد یا معامله‌ای ساخته نشده است.'
        : 'مأموریت قفل شد؛ عکس شروع ناکافی است و علت‌ها بدون جایگزینی عدد نمایش داده شده‌اند.';
      await persist(active.draft);
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
    unwatch?.(); unfeed?.(); setupDraft = null; outlookDraft = null; riskDraft = null;
    allocationDraft = null; missionDraft = null; draft = null;
  };
}
