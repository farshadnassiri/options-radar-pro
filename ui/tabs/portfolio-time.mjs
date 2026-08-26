import { buildChain, underlyingList } from '../../core/chain.mjs';
import { historyDateLabel, normalizeHistoryDate } from '../../core/history.mjs';
import {
  MISSION_DIRECTIONS, MISSION_REPLAY_GRAINS, MISSION_VOLATILITY_VIEWS,
} from '../../core/portfolio-mission.mjs';
import {
  createPortfolioOutlookDraft, createPortfolioStepOneDraft,
  parseTomanInput, previewPortfolioCapital,
} from '../portfolio-mission-form.mjs';
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
      <div><b>۳</b><span>ریسک و نقدشوندگی</span><small>قفل</small></div>
      <div><b>۴</b><span>تخصیص خانواده‌ها</span><small>قفل</small></div>
      <div><b>۵</b><span>مرور و شروع</span><small>قفل</small></div>
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
      </div>

      <aside class="card pt-review">
        <p class="eyebrow">پیش‌نویس زنده</p><h2>گذرنامه سفر</h2>
        <dl><div><dt>سرمایه قابل تخصیص</dt><dd id="pt-review-capital">—</dd></div><div><dt>نماد پایه</dt><dd id="pt-review-base">انتخاب نشده</dd></div><div><dt>شروع</dt><dd id="pt-review-start">انتخاب نشده</dd></div><div><dt>پایان</dt><dd id="pt-review-end">انتخاب نشده</dd></div><div><dt>پخش مسیر</dt><dd id="pt-review-grain">نیم‌ساعته</dd></div><div><dt>انتظار بازار</dt><dd id="pt-review-outlook">ثبت نشده</dd></div><div><dt>اطمینان</dt><dd id="pt-review-confidence">—</dd></div></dl>
        <div class="pt-honesty"><b>تعهد این بازی</b><p>قیمت آینده، قراردادهای بعدی و نتیجه نهایی در لحظه انتخاب سبد وارد پیشنهاد نمی‌شوند.</p></div>
        <button type="button" class="primary" id="pt-save-step">ثبت پیش‌نویس مرحله اول</button>
        <p class="pt-save-state" id="pt-save-state" role="status" aria-live="polite">هنوز چیزی ثبت نشده است.</p>
      </aside>
    </section>
  </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const capital = $('pt-capital'), reserve = $('pt-reserve'), base = $('pt-base');
  const outlookStep = $('pt-outlook-step');
  let chain = new Map(), symbols = [], dates = [], loadedIns = '', setupDraft = null, draft = null;
  const draftId = `pt-ui-${Date.now()}`;

  function clearErrors() {
    root.querySelectorAll('.pt-field-error').forEach((node) => { node.hidden = true; node.textContent = ''; });
    root.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
    $('pt-save-state')?.removeAttribute('data-error');
    $('pt-outlook-state')?.removeAttribute('data-error');
  }

  function selectedValue(name) {
    return root.querySelector(`input[name="${name}"]:checked`)?.value || '';
  }

  function paintProgress(stage = 'setup') {
    const setup = $('pt-progress-setup'), outlook = $('pt-progress-outlook');
    setup.classList.toggle('active', stage === 'setup');
    setup.classList.toggle('done', stage !== 'setup');
    setup.toggleAttribute('aria-current', stage === 'setup');
    setup.querySelector('small').textContent = stage === 'setup' ? 'در حال تکمیل' : 'کامل';
    outlook.classList.toggle('active', stage === 'outlook');
    outlook.toggleAttribute('aria-current', stage === 'outlook');
    outlook.querySelector('small').textContent = stage === 'outlook' ? 'در حال تکمیل' : 'قفل';
  }

  function invalidateSetupDraft() {
    if (!setupDraft) return;
    setupDraft = null; draft = null;
    root.removeAttribute('data-draft-ready');
    root.removeAttribute('data-outlook-ready');
    outlookStep.hidden = true;
    paintProgress('setup');
    $('pt-save-step').textContent = 'ثبت دوباره پیش‌نویس مرحله اول';
    $('pt-save-state').textContent = 'ورودی مرحله نخست تغییر کرد؛ برای ادامه دوباره ثبتش کن.';
    $('pt-review-outlook').textContent = 'ثبت نشده';
    $('pt-review-confidence').textContent = '—';
  }

  function invalidateOutlookDraft() {
    if (draft?.step !== 'outlook') return;
    draft = setupDraft;
    root.removeAttribute('data-outlook-ready');
    $('pt-save-outlook').textContent = 'ثبت دوباره انتظار بازار';
    $('pt-outlook-state').textContent = 'فرض بازار تغییر کرد؛ نسخه تازه را ثبت کن.';
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

  capital.oninput = () => { paintCapital(); invalidateSetupDraft(); };
  reserve.oninput = () => { paintCapital(); invalidateSetupDraft(); };
  capital.onblur = () => formatMoneyInput(capital); reserve.onblur = () => formatMoneyInput(reserve);
  base.onchange = () => { loadedIns = ''; clearErrors(); invalidateSetupDraft(); loadDates(); };
  $('pt-start-time').onchange = () => { reviewDates(); invalidateSetupDraft(); };
  $('pt-end-time').onchange = () => { reviewDates(); invalidateSetupDraft(); };
  $('pt-grain').onchange = () => { $('pt-review-grain').textContent = $('pt-grain').selectedOptions[0]?.textContent || '—'; clearErrors(); invalidateSetupDraft(); };
  $('pt-retry').onclick = () => api.retryFeed();
  $('pt-save-step').onclick = () => {
    const result = currentDraft();
    if (!result.ok) { showError(result.why); return; }
    clearErrors(); setupDraft = result.draft; draft = result.draft; root.dataset.draftReady = 'true';
    $('pt-save-state').removeAttribute('data-error');
    $('pt-save-state').textContent = 'مرحله نخست ثبت شد؛ حالا انتظار خودت از بازار را ثبت کن.';
    $('pt-save-step').textContent = 'به‌روزرسانی پیش‌نویس مرحله اول';
    outlookStep.hidden = false; paintProgress('outlook'); paintOutlook();
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
    clearErrors(); draft = result.draft; root.dataset.outlookReady = 'true';
    $('pt-outlook-state').removeAttribute('data-error');
    $('pt-outlook-state').textContent = 'انتظار بازار ثبت شد؛ هنوز مأموریت فعال و آینده آشکار نشده است.';
    $('pt-save-outlook').textContent = 'به‌روزرسانی انتظار بازار';
    paintOutlook();
  };

  paintCapital(); paintOutlook();
  const unwatch = api.subscribeWatch(paintSymbols);
  const unfeed = api.onFeed((feed) => {
    if (feed.status === 'failed') {
      $('pt-feed-status').textContent = feed.error || 'دریافت فهرست نمادها ناموفق بود';
      $('pt-feed-status').dataset.error = 'true'; $('pt-retry').hidden = false;
    }
  });
  return () => { unwatch?.(); unfeed?.(); setupDraft = null; draft = null; };
}
