// تب موقعیت‌های من — فاز ۷.
//
// موقعیت‌هایی که واقعاً اجرا کرده‌ای، با قیمت ورود واقعی خودت. ارزش‌گذاری هر
// لحظه یعنی هزینه بستن موقعیت در بازار، نه پریمیومی که گرفتی.
//
// ═══ از «عدد» به «روند» ═══
//
// این تب تا امروز یک عکس بود: کارتِ «سود و زیان جاری» می‌گفت همین حالا چقدر
// در سود یا زیانی و هیچ نمی‌گفت این عدد از کجا آمده. همان موقعیت می‌توانست
// دیروز دو برابر در سود باشد و کاربر هرگز نفهمد.
//
// حالا کنار هر عدد، سه روند هست — روزانه از تاریخچهٔ پایانی، درون‌روزی از
// نوار معاملهٔ امروز، و دنبالهٔ همین جلسه از قیمت‌گیری هر پانزده ثانیه — و
// یک ستونِ «تغییر امروز» که مبنایش آخرین روزِ **پیش از** امروز است، نه
// حدس. موتورشان `core/position-track.mjs` است و قاعده‌اش یکی است: لحظه‌ای
// که حتی یک پا در آن قیمت ندارد، نقطه نمی‌شود.
//
// ═══ سررسیدگذشته از باز جدا شد ═══
//
// بالادست گاهی آخرین قیمتِ قراردادِ منقضی را تکرار می‌کند و این تب آن را
// مثل قیمتِ زنده می‌خورد: موقعیتی که ماه‌ها پیش تسویه شده بود، «سود و زیان
// الان» داشت و در جمعِ سبد می‌نشست. حالا موقعیتِ سررسیدگذشته نه قیمت
// می‌گیرد، نه ارزش‌گذاری می‌شود، و در جدول خودش با علتش می‌نشیند.

import { markToMarket, captureEntryRisk, blankPosition } from '/core/positions.mjs';
import {
  positionOpenState, trackInstruments, dailyPnlSeries, intradayPnlSeries,
  appendSessionTick, trackStats, changeSince,
} from '/core/position-track.mjs';
import {
  positionStatus, validateExit, realizedPnl, realizedSummary,
} from '/core/position-close.mjs';
import {
  portfolioGreeks, expiryCalendar, breakevenRoom, portfolioDailySeries,
} from '/core/positions-portfolio.mjs';
import {
  TRACK_MODES, trackMode, trackRows, trackChartOption, trackStatsHtml, trackNote,
} from '/ui/positions-track-view.mjs';
import { closeFormHtml, readClose, closedRowNote } from '/ui/positions-close.mjs';
import {
  portfolioGreeksHtml, expiryCalendarHtml, breakevenCell, realizedKpisHtml,
} from '/ui/positions-summary-view.mjs';
import { chartGroup } from '/ui/chart-host.mjs';
import { sparkline } from '/ui/gap-charts.mjs';
import { draftFromPlan, intakeFormHtml, readIntake } from '/ui/positions-intake.mjs';
import { positionRollPlan, goHandoff } from '/ui/handoff.mjs';
import { editFormHtml, readEdit, needsEntryClose } from '/ui/positions-edit.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { todayJalali, gregorianToJalali, parseJalali, daysSinceJalali } from '/core/jalali.mjs';
import { marginParamsOf } from '/core/settings.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { mountPayoff } from '/ui/chart.mjs';
import { fmt } from '/ui/table.mjs';
import { faDigits, faClock, kpiTone } from '/ui/fmt.mjs';
import { onChain, chainState, pushRows, chainDetail } from '/ui/scanner.mjs';
import { attachExportsIn } from '/ui/export.mjs';
import { ivParams } from '/core/leg-iv.mjs';
import { tehranDateNumber } from '/core/live-day.mjs';
import { normalizeHistoryDate } from '/core/history.mjs';
import { GREEKS, monitorSnapshot, monitorStance } from '/core/monitor.mjs';
import { emptyReason } from '/ui/feed-state.mjs';

const KINDS = [
  ['covered-call', 'کاوردکال — سهم + فروش کال'],
  ['short-call', 'فروش کال بدون پوشش'],
  ['short-put', 'فروش پوت'],
  ['long-call', 'خرید کال'],
  ['long-put', 'خرید پوت'],
];

const displayName = (name, identifier, fallback) => {
  const text = String(name || '').trim();
  return text && text !== String(identifier || '') ? text : fallback;
};

export async function mount(root, { state, api }) {
  const s = () => state.settings;
  const feesNow = () => ({
    buyStock: s().feeBuyStock, sellStock: s().feeSellStock,
    option: s().feeOption, exercise: s().feeExercise,
  });
  const riskOptions = () => ({
    fees: feesNow(), params: marginParamsOf(s()),
    creditMode: s().creditSpreadMargin, capitalMode: s().capitalMode,
  });
  let positions = [];
  let quotesByIns = new Map();
  let quotesAt = 0;
  let uaList = [];
  let feed = { status: 'idle', error: '' };
  let expanded = null;
  let chart = null;
  let chartRange = null;
  let chartFor = null;

  // ——— روند ———
  // تاریخچهٔ روزانهٔ همهٔ پاها، یک بار در هر بار بارگذاری. نوار درون‌روزی
  // اما فقط با درخواست صریح کاربر گرفته می‌شود: `/api/live-trades` هر بار
  // تازه می‌رود و گرفتنش در هر رفرشِ پانزده‌ثانیه‌ای، بارِ بالادست را بی
  // آنکه کسی خواسته باشد چند برابر می‌کرد.
  let dailyByIns = {};
  let dailyNote = '';
  let tapeByIns = {};
  let tapeAt = 0;
  let tapeNote = '';
  const sessionTicks = new Map();
  let trackModeId = TRACK_MODES[0].id;
  // دو دستهٔ جدا: نمودارِ روندِ یک موقعیت با عوض شدنِ حالت آزاد و دوباره
  // سوار می‌شود، ولی منحنیِ سبد باید سرِ جایش بماند. یک دستهٔ مشترک یعنی
  // هر بار که پنل روند خالی می‌شد، منحنیِ سبد هم با آن می‌رفت.
  const charts = chartGroup();
  const sumCharts = chartGroup();
  // پیش‌نویسِ رسیده از «در جست‌وجوی استراتژی‌ها»، و موقعیتِ در حال ویرایش.
  let draft = null;
  let draftNote = '';
  let editing = null;
  // موقعیتِ در حالِ بستن، و قیمت‌های پیشنهادیِ خروجش در لحظهٔ باز شدنِ برگه.
  // قیمتِ پیشنهادی **یخ می‌زند**: اگر هر پانزده ثانیه با مظنهٔ تازه عوض
  // می‌شد، عددی که کاربر داشت تایپ می‌کرد زیر دستش می‌پرید.
  let closing = null;
  let closeSuggest = [];

  const todayNumber = () => tehranDateNumber();
  const posKey = (p, at) => String(p?.id || `#${at}`);
  /** تاریخ ورود به عدد فشردهٔ میلادی؛ صفر یعنی ثبت نشده. */
  const entryDateNumber = (p) => {
    const date = parseJalali(p?.entryDate);
    if (!date) return 0;
    return (date.getUTCFullYear() * 10000) + ((date.getUTCMonth() + 1) * 100) + date.getUTCDate();
  };

  root.innerHTML = `
    <div class="page-head">
      <h2>موقعیت‌های من</h2>
      <p>پریمیوم دریافتی تا سررسید سود تحقق‌یافته نیست. موقعیت فروش هر روز به قیمت روز بدهی است،
         پس ارزش‌گذاری اینجا هزینه بستن در بازار است.</p>
    </div>

    <div class="kpis" id="kpis"></div>

    <section class="card" id="intake-card" style="display:none">
      <h3 id="intake-title">ترکیب رسیده از جست‌وجوی استراتژی‌ها</h3>
      <div id="intake"></div>
      <div class="bar" style="margin-top:12px">
        <button class="btn" id="intake-save">ثبت این موقعیت</button>
        <button class="ghost" id="intake-drop">انصراف</button>
        <span class="sp"></span>
        <span id="intake-msg" class="saved" role="status" aria-live="polite"></span>
      </div>
    </section>

    <section class="card">
      <h3>افزودن موقعیت</h3>
      <p class="note">قیمت معامله برای سود و زیان است؛ قیمت‌های پایانی روز ورود فقط برای ثبت ثابت وجه تضمین و مخرج بازده‌اند.</p>
      <div class="grid" id="form"></div>
      <div class="bar" style="margin-top:12px">
        <button class="btn" id="add">افزودن</button>
        <span class="sp"></span>
        <span id="msg" class="saved" role="status" aria-live="polite"></span>
      </div>
    </section>

    <section class="card" id="summary-card" style="display:none">
      <h3>نگاه سبد</h3>
      <div id="sum-greeks"></div>
      <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">منحنی سود و زیان کل سبد</h4>
      <div class="pos-track-chart" id="sum-chart"></div>
      <p class="note" id="sum-chart-note"></p>
      <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">تقویم سررسید</h4>
      <div id="sum-calendar"></div>
    </section>

    <section class="card">
      <h3>موقعیت‌های باز</h3>
      <p class="note" id="daily-note"></p>
      <div class="scroll" style="max-height:none"><table class="data" id="list"></table></div>
    </section>

    <section class="card" id="close-card" style="display:none">
      <h3 id="close-title">بستن موقعیت</h3>
      <div id="close-form"></div>
      <div class="bar" style="margin-top:12px">
        <button class="btn" id="close-save">ثبت خروج</button>
        <button class="ghost" id="close-cancel">انصراف</button>
        <span class="sp"></span>
        <span id="close-msg" class="saved" role="status" aria-live="polite"></span>
      </div>
    </section>

    <section class="card" id="closed-card" style="display:none">
      <h3>بسته‌شده</h3>
      <p class="note">سود این‌ها تحقق یافته و دیگر با بازار تکان نمی‌خورد. عددشان از قیمت خروجی می‌آید که خودت ثبت کرده‌ای، نه از مظنهٔ امروز.</p>
      <div id="closed-kpis"></div>
      <div class="scroll" style="max-height:none"><table class="data" id="closed-list"></table></div>
    </section>

    <section class="card" id="gone-card" style="display:none">
      <h3>سررسیدگذشته</h3>
      <p class="note">این موقعیت‌ها دیگر قیمت نمی‌گیرند و ارزش‌گذاری نمی‌شوند. قرارداد پس از سررسید حذف می‌شود و اگر بالادست آخرین قیمتش را تکرار کند، آن قیمتِ معامله نیست. برای بایگانی می‌مانند، نه برای جمعِ سبد.</p>
      <div class="scroll" style="max-height:none"><table class="data" id="gone-list"></table></div>
    </section>

    <section class="card" id="edit-card" style="display:none">
      <h3 id="edit-title">ویرایش موقعیت</h3>
      <div id="edit"></div>
      <div class="bar" style="margin-top:12px">
        <button class="btn" id="edit-save">ثبت ویرایش</button>
        <button class="ghost" id="edit-cancel">انصراف</button>
        <span class="sp"></span>
        <span id="edit-msg" class="saved" role="status" aria-live="polite"></span>
      </div>
    </section>

    <section class="card" id="det-card" style="display:none">
      <h3 id="det-title">جزئیات موقعیت</h3>
      <div class="detail" id="det"></div>
    </section>

    <section class="card" id="track-card" style="display:none">
      <h3 id="track-title">روند سود و زیان</h3>
      <div class="bar" id="track-modes" role="group" aria-label="سرچشمهٔ روند"></div>
      <div id="track-stats"></div>
      <div class="pos-track-chart" id="track-chart"></div>
      <p class="note" id="track-note"></p>
      <div class="bar" id="track-actions"></div>
    </section>`;

  // هر ظرف جدول، دکمهٔ خروجی خودش را می‌گیرد. ظرف‌ها در همین قالب‌اند حتی
  // وقتی خالی‌اند، و خواندن لحظهٔ کلیک انجام می‌شود — پس یک بار کافی است.
  attachExportsIn(root, 'positions');


  // ——————————————— فرم ———————————————
  const form = root.querySelector('#form');
  const F = {};
  const field = (key, label, kind, extra = '') => {
    const w = document.createElement('div');
    w.className = 'field';
    const controlId = `f-${key}`;
    const labelId = `${controlId}-label`;
    if (kind === 'select') w.innerHTML = `<label for="${controlId}">${label}</label><select id="${controlId}">${extra}</select>`;
    else if (kind === 'wheel') w.innerHTML = `<span class="field-label" id="${labelId}">${label}</span><div id="${controlId}" role="group" aria-labelledby="${labelId}"></div>`;
    else w.innerHTML = `<label for="${controlId}">${label}</label><input type="${kind}" id="${controlId}" ${extra}>`;
    form.appendChild(w);
    F[key] = w.querySelector(`#${controlId}`);
    return F[key];
  };

  // فهرست روزهای قابل انتخاب برای تاریخ ورود. تاریخ ورود موقعیتِ ثبت‌شده
  // همیشه در گذشته است، پس فقط عقب می‌رود؛ یک سال و نیم برای موقعیت‌های
  // اختیار — که سررسیدشان چند ماهه است — با فاصله زیاد کافی است.
  const entryDateOptions = () => {
    const out = [];
    const now = new Date();
    for (let back = 0; back < 540; back++) {
      const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - back));
      out.push(Number(`${day.getUTCFullYear()}${String(day.getUTCMonth() + 1).padStart(2, '0')}${String(day.getUTCDate()).padStart(2, '0')}`));
    }
    return out;
  };
  // میلادی به شمسی، به همان قالبی که `parseJalali` می‌خواند.
  const jalaliOf = (compact) => {
    const text = String(compact);
    const [jy, jm, jd] = gregorianToJalali(Number(text.slice(0, 4)), Number(text.slice(4, 6)), Number(text.slice(6, 8)));
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
  };

  field('kind', 'نوع موقعیت', 'select', KINDS.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''));
  field('ua', 'نماد پایه', 'select', '<option value="">— انتخاب کن —</option>');
  field('exp', 'سررسید', 'select', '');
  field('opt', 'قرارداد اختیار', 'select', '');
  field('date', 'تاریخ ورود (شمسی)', 'wheel');
  field('qty', 'تعداد قرارداد', 'number', 'value="1" min="1"');
  field('sPrice', 'قیمت پایانی پایه در ورود', 'number', 'value="0"');
  field('stockPrice', 'قیمت خرید سهم (فقط کاوردکال)', 'number', 'value="0"');
  field('oPrice', 'قیمت ورود اختیار', 'number', 'value="0"');
  field('oClose', 'قیمت پایانی اختیار در ورود', 'number', 'value="0"');

  const entryDates = entryDateOptions();
  mountDateWheel(F.date, entryDates, entryDates[0], () => {}, { empty: 'تاریخی در دسترس نیست.' });
  const entryDateValue = () => {
    const picked = Number(F.date.dataset.value);
    return picked ? jalaliOf(picked) : todayJalali();
  };

  // فهرست خالی هم باید حرف بزند. «— انتخاب کن —» روی فهرست بی‌نماد،
  // کاربر را دنبال چیزی می‌فرستد که آنجا نیست.
  function uaPlaceholder() {
    if (uaList.length) return '— انتخاب کن —';
    return emptyReason({ listCount: 0, feedStatus: feed.status, error: feed.error }).text;
  }

  function refreshUaOptions() {
    const cur = F.ua.value;
    F.ua.innerHTML = `<option value="">${uaPlaceholder()}</option>`
      + uaList.map((u) => `<option value="${u.ins}" ${u.ins === cur ? 'selected' : ''}>${displayName(u.name, u.ins, 'دارایی پایه بدون نام')}</option>`).join('');
  }

  let detail = null;
  F.ua.addEventListener('change', async () => {
    if (!F.ua.value) return;
    const res = await chainDetail(F.ua.value);
    if (res.error) return;
    detail = res.ua;
    F.exp.innerHTML = detail.expiries.map((ex, i) => `<option value="${i}">${faDigits(ex.days)} روز</option>`).join('');
    F.sPrice.value = Math.round(detail.close || detail.last || 0);
    F.stockPrice.value = Math.round(detail.last || detail.close || 0);
    fillOptions();
  });
  F.exp.addEventListener('change', fillOptions);
  F.kind.addEventListener('change', fillOptions);

  function wantPut() { return F.kind.value.includes('put'); }

  function fillOptions() {
    if (!detail) return;
    const ex = detail.expiries[Number(F.exp.value) || 0];
    if (!ex) return;
    const put = wantPut();
    F.opt.innerHTML = ex.strikes.map((st) => {
      const q = put ? st.put : st.call;
      return `<option value="${q.ins}" data-strike="${st.strike}" data-size="${st.size}" data-days="${ex.days}" data-expiry="${normalizeHistoryDate(ex.endDate)}" data-bid="${q.bid}" data-ask="${q.ask}" data-close="${q.close}">
        ${displayName(q.name, q.ins, 'قرارداد اختیار بدون نام')} — اعمال ${fmt.money(st.strike)} — تقاضا ${fmt.money(q.bid)}</option>`;
    }).join('');
    const first = F.opt.selectedOptions[0];
    if (first) {
      F.oPrice.value = Math.round(Number(first.dataset.bid) || Number(first.dataset.close) || 0);
      F.oClose.value = Math.round(Number(first.dataset.close) || 0);
    }
  }
  F.opt.addEventListener('change', () => {
    const o = F.opt.selectedOptions[0];
    if (o) {
      F.oPrice.value = Math.round(Number(o.dataset.bid) || Number(o.dataset.close) || 0);
      F.oClose.value = Math.round(Number(o.dataset.close) || 0);
    }
  });

  const msg = root.querySelector('#msg');
  let flashTimer = null;
  const flash = (t, bad) => {
    msg.textContent = t;
    msg.style.color = bad ? 'var(--loss)' : 'var(--gain)';
    // تایمر پیام قبلی لغو می‌شود — وگرنه اگر دو flash نزدیک هم بیایند
    // (مثلاً افزودن سریع دو موقعیت)، تایمر اولی پیام دومی را زودتر از
    // موعد پاک می‌کرد.
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { msg.textContent = ''; }, 3000);
  };

  const addBtn = root.querySelector('#add');
  addBtn.addEventListener('click', async () => {
    if (addBtn.disabled) return;
    const o = F.opt.selectedOptions[0];
    if (!o || !F.ua.value) { flash('نماد پایه و قرارداد را انتخاب کن.', true); return; }
    addBtn.disabled = true;
    try {
      const strike = Number(o.dataset.strike);
      // اندازه از مشخصات همان قرارداد می‌آید. اگر تابلو نداده باشد،
      // پیش‌فرض اعلامی تنظیمات می‌نشیند و کاربر همان‌جا خبردار می‌شود —
      // چون اندازه در هر عدد پولی این موقعیت ضرب خواهد شد.
      const specSize = Number(o.dataset.size);
      const size = specSize > 0 ? specSize : Number(s().contractSize) || 0;
      if (!(size > 0)) { flash('اندازه قرارداد معلوم نیست؛ در تنظیمات مقدارش را بگذار.', true); return; }
      if (!(specSize > 0)) {
        flash(`اندازه قرارداد از تابلو نیامد؛ پیش‌فرض تنظیمات (${size}) به کار رفت.`);
      }
      const days = Number(o.dataset.days);
      const kind = F.kind.value;
      const put = wantPut();
      const entrySpot = Number(F.sPrice.value);
      const stockPrice = Number(F.stockPrice.value);
      const optionPrice = Number(F.oPrice.value);
      const optionClose = Number(F.oClose.value);
      if (!(entrySpot > 0)) { flash('قیمت پایانی پایه در روز ورود را وارد کن.', true); return; }
      if (kind === 'covered-call' && !(stockPrice > 0)) { flash('قیمت واقعی خرید سهم را وارد کن.', true); return; }
      if (!(optionPrice > 0)) { flash('قیمت معامله اختیار را وارد کن.', true); return; }
      if (!(optionClose > 0)) { flash('قیمت پایانی اختیار در روز ورود را وارد کن.', true); return; }
      const legs = [];
      if (kind === 'covered-call') {
        legs.push({ kind: 'underlying', side: 'buy', ratio: 1, size, price: stockPrice, ins: F.ua.value });
      }
      legs.push({
        kind: put ? 'put' : 'call',
        side: kind.startsWith('long') ? 'buy' : 'sell',
        ratio: 1, size, strike, days,
        // سررسید روی خودِ پا می‌نشیند تا روز مانده در هر روزِ آینده از
        // تاریخ درآید نه از تفریق. موقعیت‌های ذخیره‌شدهٔ قدیمی این را
        // ندارند و مسیر جایگزینِ «روز ورود منهای روز نگهداری» را می‌گیرند.
        expiry: Number(o.dataset.expiry) || 0,
        price: optionPrice, entryClose: optionClose,
        ins: o.value, name: o.textContent.split('—')[0].trim(),
      });

      const position = {
        ...blankPosition(),
        title: `${KINDS.find(([v]) => v === kind)[1].split('—')[0].trim()} ${detail.name}`,
        uaIns: F.ua.value, uaName: detail.name,
        entryDate: entryDateValue(), entrySpot,
        qty: Math.max(1, Number(F.qty.value) || 1),
        legs,
      };
      position.entryRisk = captureEntryRisk(position, riskOptions());
      if (!position.entryRisk.available) { flash(position.entryRisk.reason, true); return; }
      positions.push(position);
      await save();
      flash('موقعیت افزوده شد.');
      render();
    } finally {
      addBtn.disabled = false;
    }
  });

  async function save({ quiet = false } = {}) {
    try {
      await fetch('/api/positions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(positions),
      });
    } catch { if (!quiet) flash('ذخیره نشد.', true); }
  }

  // ——————————————— ارزش‌گذاری ———————————————
  function quoteFor(leg) {
    const q = quotesByIns.get(leg.ins);
    if (q) return q;
    return { bid: 0, ask: 0, last: 0, close: 0 };
  }

  /**
   * روز مانده تا سررسیدِ **امروز** برای هر پا.
   *
   * موقعیت‌های ذخیره‌شدهٔ قدیمی سررسید ندارند و فقط «روز مانده در لحظهٔ
   * ورود» را نگه داشته‌اند. روز مانده امروز = همان عدد منهای روز نگهداری —
   * و چون هر دو تقویمی‌اند، این تفریق دقیق است نه تقریب. سررسید از روی آن
   * ساخته نمی‌شود؛ تاریخِ ساختگی بدتر از عددِ داده‌شده است.
   *
   * موقعیت تازه سررسید واقعی دارد و `undefined` می‌گیرد تا از همان استفاده
   * شود.
   */
  const daysLeftOf = (p, daysHeld) => p.legs.map((leg) => {
    if (leg.kind === 'underlying') return undefined;
    if (Number.isFinite(Number(leg.expiry)) && Number(leg.expiry) > 0) return undefined;
    const atEntry = Number(leg.days);
    if (!Number.isFinite(atEntry)) return undefined;
    return Math.max(0, atEntry - Number(daysHeld || 0));
  });

  /**
   * یونانی و تلاطم ضمنی موقعیتِ باز، در همین لحظه.
   *
   * قیمتِ مبنا همان `markPrice` است که سود و زیان از آن آمده — نه یک مبنای
   * دوم. اگر دو مبنا بود، «تلاطم ضمنی این پا» و «سود این پا» دو قیمت
   * متفاوت را می‌گفتند و هیچ‌کدام غلط به نظر نمی‌رسید.
   */
  function greeksOf(p, m, spot) {
    return monitorSnapshot(p.legs, {
      spot,
      prices: m.perLeg.map((leg) => leg.markPrice),
      date: tehranDateNumber(),
      days: daysLeftOf(p, m.daysHeld),
    }, ivParams(s(), {}));
  }

  function evalPos(p) {
    const fees = feesNow();
    const uaQ = quotesByIns.get(p.uaIns) || {};
    const spot = uaQ.last || uaQ.close || p.legs.find((l) => l.kind === 'underlying')?.price || 0;
    const quotes = p.legs.map((l) => (l.kind === 'underlying' ? uaQ : quoteFor(l)));
    const m = markToMarket(p, quotes, {
      ...riskOptions(), fees, spot, spotClose: uaQ.close || spot,
      basis: s().priceBasis === 'BOOK' ? 'BOOK' : s().priceBasis,
    });
    return { m, spot, quotes, fees, greeks: greeksOf(p, m, spot) };
  }

  // ——————————————— روند ———————————————
  //
  // سری روزانه در هر رندر از نو ساخته می‌شود ولی در همان رندر کش می‌شود:
  // جدول، کارت‌ها و پنل روند هر سه همان سری را می‌خواهند و ساختنش سه بار،
  // سه پیمایش روی تاریخچهٔ همهٔ پاهاست.
  let seriesCache = new Map();
  function dailySeries(p, at) {
    const key = posKey(p, at);
    if (!seriesCache.has(key)) {
      seriesCache.set(key, dailyPnlSeries(p, dailyByIns, {
        fees: feesNow(), basis: 'CLOSE', from: entryDateNumber(p), to: todayNumber(),
      }));
    }
    return seriesCache.get(key);
  }

  /**
   * «سود و زیان امروز» — تغییر نسبت به آخرین روزِ **پیش از** امروز.
   *
   * مبنایش قیمت پایانیِ همان روز است، نه قیمتِ دیروزِ تابلو: `/api/infos`
   * در ساعت بازار `close` را برای **امروز** می‌دهد، و اگر مبنا از آن ساخته
   * می‌شد، «تغییر امروز» در طول روز با خودش هم نمی‌خواند.
   */
  const todayChange = (p, at, pnlTotal) =>
    changeSince(dailySeries(p, at), { now: pnlTotal, date: todayNumber() });

  function render() {
    seriesCache = new Map();
    const today = todayNumber();
    // سه سطل، از یک تابع: بسته‌شده مقدم بر سررسیدگذشته است، چون موقعیتی که
    // اسفند بسته شده با رسیدنِ سررسیدِ خرداد نباید بی‌صدا به بایگانی بپرد و
    // سودِ تحقق‌یافته‌اش از جمع بیفتد.
    const listed = positions.map((p, at) => ({ p, at, state: positionStatus(p, today) }));
    const openRows = listed.filter((x) => x.state.id === 'open');
    const closedRows = listed.filter((x) => x.state.id === 'closed');
    const goneRows = listed.filter((x) => x.state.id === 'expired');
    const evals = openRows.map(({ p, at, state }) => ({ p, at, state, ...evalPos(p) }));

    // دنبالهٔ همین جلسه از همان ارزش‌گذاری‌ای می‌آید که جدول نشان می‌دهد؛
    // کلیدش زمانِ **قیمت‌گیری** است نه زمانِ رندر، پس رندرِ دوباره با همان
    // قیمت‌ها نقطهٔ تکراری نمی‌سازد.
    if (quotesAt > 0) {
      for (const { p, at, m, spot } of evals) {
        const key = posKey(p, at);
        sessionTicks.set(key, appendSessionTick(sessionTicks.get(key), {
          at: quotesAt, pnlTotal: m.pnlTotal, pnl: m.pnl, spot,
        }));
      }
    }

    // سلول یونانی: مرتبهٔ بزرگی این پنج عدد یکی نیست — گاما ۱۰ به توان منفی
    // هفت و وگا ریالی — پس `fmt.small` رقم اعشار را از خود عدد می‌گیرد.
    const gk = (value) => (Number.isFinite(value) ? fmt.small(value) : '—');
    const ivPctCell = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
    const legsText = (p) => p.legs.map((l) => `${l.side === 'sell' ? '−' : '+'}${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت') + ' ' + fmt.money(l.strike)}`).join(' ');
    const moneyTone = (value) => `style="color:${value >= 0 ? 'var(--gain)' : 'var(--loss)'}"`;

    const rows = evals.map(({ p, at, state, m, spot, greeks }) => {
      const change = todayChange(p, at, m.pnlTotal);
      const trend = dailySeries(p, at).points.slice(-30).map((point) => point.pnlTotal);
      return `
      <tr data-i="${at}" style="cursor:pointer" tabindex="0" role="button" aria-label="جزئیات موقعیت ${p.title || '—'}">
        <td>${p.title || '—'}</td>
        <td>${displayName(p.uaName, p.uaIns, 'دارایی پایه بدون نام')}</td>
        <td>${legsText(p)}</td>
        <td class="n">${fmt.int(p.qty)}</td>
        <td class="n">${p.entryDate ? faDigits(p.entryDate) : '—'}</td>
        <td class="n">${m.daysHeld == null ? '—' : fmt.int(m.daysHeld)}</td>
        <td class="n">${state.known && Number.isFinite(state.daysToExpiry) ? fmt.int(state.daysToExpiry) : '—'}</td>
        <td class="n">${fmt.money(m.capital * p.qty)}</td>
        <td class="n">${fmt.money(m.currentMargin * p.qty)}</td>
        <td class="n" ${moneyTone(m.pnlTotal)}>${fmt.money(m.pnlTotal)}</td>
        <td class="n" ${change.available ? moneyTone(change.change) : ''}
          title="${change.available ? `مبنا: ${faDigits(historyDateLabel(change.baseDate))}` : change.reason}">
          ${change.available ? fmt.money(change.change) : '—'}</td>
        <td>${sparkline(trend, { label: `روند سود و زیان ${p.title || ''}` })}</td>
        <td class="n">${fmt.pct(m.retPct)}</td>
        <td class="n">${fmt.pct(m.retMonthPct)}</td>
        <td class="n">${fmt.money(m.ifHeld.atSpot * p.qty)}</td>
        ${breakevenCell(breakevenRoom(spot, m.ifHeld.breakevens))}
        ${GREEKS.map(({ key }) => `<td class="n">${gk(greeks.greeks?.[key])}</td>`).join('')}
        <td class="n">${ivPctCell(greeks.meanIvPct)}</td>
        <td>${positionRollPlan(p) ? `<button class="ghost" data-roll="${at}" title="همین موقعیت را در تب تحلیل رول باز کن">رول</button>` : ''}
            <button class="ghost" data-close="${at}">بستن</button>
            <button class="ghost" data-edit="${at}">ویرایش</button>
            <button class="ghost" data-del="${at}">حذف</button></td>
      </tr>`;
    }).join('');

    root.querySelector('#list').innerHTML = openRows.length ? `
      <thead><tr>
        <th>عنوان</th><th>پایه</th><th>پاها</th><th>تعداد</th><th>تاریخ ورود</th><th>روز</th>
        <th>روز تا سررسید</th>
        <th>سرمایه روز ورود</th><th>وجه تضمین امروز</th><th>سود و زیان الان</th><th>تغییر امروز</th><th>روند</th><th>بازده از ورود ٪</th><th>ماهانه ٪</th><th>اگر تا سررسید بماند</th><th title="فاصلهٔ قیمت پایه تا نزدیک‌ترین سربه‌سری">اتاق سربه‌سر</th>${GREEKS.map(({ label }) => `<th>${label}</th>`).join('')}<th>تلاطم ضمنی</th><th></th>
      </tr></thead><tbody>${rows}</tbody>`
      : `<tbody><tr><td style="padding:16px;color:var(--muted)">${positions.length ? 'موقعیت بازی نمانده — همه یا بسته شده‌اند یا سررسیدشان گذشته.' : 'موقعیتی ثبت نشده. از فرم بالا اضافه کن، یا از «در جست‌وجوی استراتژی‌ها» یک ترکیب را بفرست اینجا.'}</td></tr></tbody>`;

    // ——— بسته‌شده ———
    const realized = realizedSummary(closedRows.map((x) => x.p), { fees: feesNow() });
    root.querySelector('#closed-card').style.display = closedRows.length ? '' : 'none';
    if (closedRows.length) {
      root.querySelector('#closed-kpis').innerHTML = realizedKpisHtml(realized);
      root.querySelector('#closed-list').innerHTML = `
        <thead><tr><th>عنوان</th><th>پایه</th><th>پاها</th><th>تعداد</th><th>تاریخ ورود</th><th>تاریخ خروج</th>
          <th>نگه‌داری</th><th>سود تحقق‌یافته</th><th>بازده ٪</th><th>ماهانه ٪</th><th>یادداشت</th><th></th></tr></thead>
        <tbody>${closedRows.map(({ p, at }) => {
    const done = realizedPnl(p, { fees: feesNow() });
    return `
          <tr>
            <td>${p.title || '—'}</td>
            <td>${displayName(p.uaName, p.uaIns, 'دارایی پایه بدون نام')}</td>
            <td>${legsText(p)}</td>
            <td class="n">${fmt.int(p.qty)}</td>
            <td class="n">${p.entryDate ? faDigits(p.entryDate) : '—'}</td>
            <td class="n">${faDigits(p.exit?.date || '—')}</td>
            <td class="n">${closedRowNote(done)}</td>
            <td class="n" ${done.available ? moneyTone(done.pnlTotal) : ''}>${done.available ? fmt.money(done.pnlTotal) : '—'}</td>
            <td class="n">${fmt.pct(done.retPct)}</td>
            <td class="n">${fmt.pct(done.retMonthPct)}</td>
            <td>${p.exit?.note || '—'}</td>
            <td><button class="ghost" data-reopen="${at}">بازکردن دوباره</button>
                <button class="ghost" data-del="${at}">حذف</button></td>
          </tr>`;
  }).join('')}</tbody>`;
    }

    // ——— نگاه سبد ———
    // فقط از موقعیت‌های **باز** ساخته می‌شود: بسته‌شده دیگر ریسکی ندارد و
    // سررسیدگذشته دیگر قیمتی ندارد؛ جمع‌کردنشان در یونانی یا تقویم، عددی
    // می‌سازد که هیچ تصمیمی از آن درنمی‌آید.
    root.querySelector('#summary-card').style.display = openRows.length ? '' : 'none';
    if (openRows.length) {
      root.querySelector('#sum-greeks').innerHTML = portfolioGreeksHtml(portfolioGreeks(
        evals.map(({ p, greeks }) => ({
          title: p.title || 'موقعیت بی‌عنوان', qty: p.qty,
          greeks: greeks.greeks, incomplete: greeks.incomplete === true,
        })),
      ));
      // منحنیِ سبد از همان سری‌های روزانهٔ تک‌تک موقعیت‌ها ساخته می‌شود —
      // نه از یک محاسبهٔ دوم — تا جمعِ منحنی با جمعِ ستونِ جدول بخواند.
      const curve = portfolioDailySeries(openRows.map(({ p, at }) => ({
        title: p.title || 'موقعیت بی‌عنوان',
        entryDate: entryDateNumber(p),
        series: dailySeries(p, at),
      })));
      const curveRows = trackRows(curve, 'daily');
      const curveHost = root.querySelector('#sum-chart');
      if (curveRows.length) {
        sumCharts.set('portfolio', curveHost, (echarts, tokens) => trackChartOption(curveRows, tokens, { name: 'سود و زیان سبد' }));
      } else {
        sumCharts.disposeAll();
        curveHost.innerHTML = `<p class="empty-note">${curve.reason || 'نقطه‌ای برای منحنی سبد نیست'}</p>`;
      }
      root.querySelector('#sum-chart-note').textContent = [
        trackNote(curve, 'daily'),
        curve.skippedBefore
          ? `منحنی از ${faDigits(historyDateLabel(curve.from))} شروع می‌شود — دیرترین روزِ ورودِ موقعیت‌های باز؛ ${faDigits(curve.skippedBefore)} روزِ قدیمی‌تر کنار گذاشته شد چون همهٔ موقعیت‌ها هنوز باز نشده بودند.`
          : '',
      ].filter(Boolean).join(' ');

      const marginByKey = new Map(evals.map(({ p, at, m }) => [posKey(p, at), m.currentMargin * p.qty]));
      root.querySelector('#sum-calendar').innerHTML = expiryCalendarHtml(expiryCalendar(
        openRows.map((x) => x.p),
        {
          today, horizonDays: 90,
          marginOf: (pos) => {
            const at = positions.indexOf(pos);
            return marginByKey.has(posKey(pos, at)) ? marginByKey.get(posKey(pos, at)) : NaN;
          },
        },
      ));
    }

    // ——— سررسیدگذشته ———
    // بی هیچ عدد زنده: نه سود و زیان، نه بازده، نه یونانی. آنچه می‌ماند
    // همان چیزی است که کاربر خودش ثبت کرده بود.
    root.querySelector('#gone-card').style.display = goneRows.length ? '' : 'none';
    if (goneRows.length) {
      root.querySelector('#gone-list').innerHTML = `
        <thead><tr><th>عنوان</th><th>پایه</th><th>پاها</th><th>تعداد</th><th>تاریخ ورود</th><th>سررسید</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>${goneRows.map(({ p, at, state }) => `
          <tr>
            <td>${p.title || '—'}</td>
            <td>${displayName(p.uaName, p.uaIns, 'دارایی پایه بدون نام')}</td>
            <td>${legsText(p)}</td>
            <td class="n">${fmt.int(p.qty)}</td>
            <td class="n">${p.entryDate ? faDigits(p.entryDate) : '—'}</td>
            <td class="n">${faDigits(historyDateLabel(state.expiry))}</td>
            <td><span class="tag warn">${state.reason}</span></td>
            <td><button class="ghost" data-del="${at}">حذف</button></td>
          </tr>`).join('')}</tbody>`;
    }

    for (const b of root.querySelectorAll('[data-del]')) {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (b.disabled) return;
        const i = Number(b.dataset.del);
        const p = positions[i];
        // موقعیت دستی برخلاف کش سرور یا تنظیمات، از بازار بازتولید نمی‌شود
        // — قیمت ورود و تاریخ فقط همین‌جا ثبت شده‌اند. یک کلیک نباید بی‌درنگ
        // نابودش کند.
        if (!confirm(`موقعیت «${p?.title || '—'}» برای همیشه حذف شود؟ این کار بازگشت‌پذیر نیست.`)) return;
        b.disabled = true;
        positions.splice(i, 1);
        // نمایه‌ها جابه‌جا شدند؛ هر انتخابِ نمایه‌ای باید بسته شود وگرنه
        // پنل باز، موقعیتِ دیگری را نشان می‌دهد بی‌آنکه کسی چیزی کلیک کند.
        expanded = null;
        editing = null;
        await save();
        await loadDailies();
        render();
      });
    }
    for (const b of root.querySelectorAll('[data-roll]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const plan = positionRollPlan(positions[Number(b.dataset.roll)]);
        if (plan) goHandoff(state, plan, 'roll');
      });
    }
    for (const b of root.querySelectorAll('[data-close]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closing = Number(b.dataset.close);
        // قیمتِ پیشنهادی همان لحظه یخ می‌زند و دیگر با رفرش عوض نمی‌شود.
        closeSuggest = evalPos(positions[closing]).m.perLeg.map((leg) => leg.markPrice);
        root.querySelector('#close-form').dataset.for = '';
        drawClose();
      });
    }
    for (const b of root.querySelectorAll('[data-reopen]')) {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (b.disabled) return;
        const i = Number(b.dataset.reopen);
        const p = positions[i];
        // بازکردنِ دوباره، برگهٔ خروج را دور می‌ریزد و سودِ تحقق‌یافته را با
        // خودش می‌برد. اشتباهِ ثبت شدنی است، ولی بی‌پرسش نه.
        if (!confirm(`برگهٔ خروج «${p?.title || '—'}» پاک شود و موقعیت دوباره باز شمرده شود؟`)) return;
        b.disabled = true;
        delete positions[i].exit;
        await save();
        render();
        await priceAll();
      });
    }
    for (const b of root.querySelectorAll('[data-edit]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        editing = Number(b.dataset.edit);
        drawEdit();
      });
    }
    for (const tr of root.querySelectorAll('#list tbody tr[data-i]')) {
      tr.addEventListener('click', () => { expanded = Number(tr.dataset.i); drawDetail(); });
      // فقط وقتی خودِ ردیف تمرکز دارد، نه وقتی Enter روی دکمه «حذف» تودرتو
      // زده می‌شود — آن دکمه رویداد کلیک خودش را دارد، keydown هم بهش بسنده
      // می‌کند و نباید تا ردیف حباب بزند و جزئیات را هم باز کند.
      tr.addEventListener('keydown', (e) => {
        if (e.target !== tr) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        expanded = Number(tr.dataset.i);
        drawDetail();
      });
    }

    const tot = evals.reduce((a, x) => a + x.m.pnlTotal, 0);
    const capitalComplete = evals.every((x) => Number.isFinite(x.m.capital));
    const cap = capitalComplete ? evals.reduce((a, x) => a + x.m.capital * x.p.qty, 0) : NaN;
    const currentMarginComplete = evals.every((x) => Number.isFinite(x.m.currentMargin));
    const currentMargin = currentMarginComplete
      ? evals.reduce((a, x) => a + x.m.currentMargin * x.p.qty, 0)
      : NaN;
    // جمعِ «تغییر امروز» فقط وقتی عدد است که **همهٔ** موقعیت‌های باز مبنای
    // روز پیش داشته باشند. جمعِ نصفه، عددی می‌سازد که کوچک‌تر از واقعیت
    // است و هیچ‌جا نمی‌گوید چرا — همان خطای «صفر به‌جای نداشته».
    const changes = evals.map((x) => todayChange(x.p, x.at, x.m.pnlTotal));
    const changeComplete = changes.length > 0 && changes.every((x) => x.available);
    const changeSum = changeComplete ? changes.reduce((a, x) => a + x.change, 0) : NaN;
    // بدون موقعیت، سود و زیان جاری دقیقاً صفر است ولی چیزی برای «در سود
    // بودن» وجود ندارد؛ بدون سرمایه درگیر، بازده روی سرمایه هم نامعلوم
    // است (fmt.pct(NaN) → «—٪»). هر دو باید بی‌رنگ بمانند، نه سبز پیش‌فرض —
    // قبلاً یک isGain مشترک (tot>=0) به هر دو کارت می‌رسید و صفر موقعیت را
    // هم «در سود» رنگ می‌کرد.
    const pnlGain = openRows.length ? tot >= 0 : null;
    const roiGain = cap > 0 ? tot >= 0 : null;
    root.querySelector('#kpis').innerHTML = [
      ['موقعیت باز', fmt.int(openRows.length), goneRows.length ? `${faDigits(goneRows.length)} سررسیدگذشته` : '', null],
      ['سرمایه روز ورود', fmt.money(cap), capitalComplete ? 'ریال' : 'مبنای ورود ناقص است', null],
      ['وجه تضمین امروز', fmt.money(currentMargin), currentMarginComplete ? 'ریال' : 'قیمت پایانی ناقص است', null],
      ['سود و زیان جاری', fmt.money(tot), pnlGain == null ? '' : pnlGain ? 'در سود' : 'در زیان', pnlGain],
      ['تغییر امروز', fmt.money(changeSum),
        changeComplete ? 'نسبت به پایانی روز پیش' : 'مبنای روز پیش برای همهٔ موقعیت‌ها نیست',
        changeComplete ? changeSum >= 0 : null],
      ['بازده از ورود', `${fmt.pct(cap > 0 ? (tot / cap) * 100 : NaN)}٪`, '', roiGain],
      ['قیمت‌گیری', quotesByIns.size ? `${fmt.int(quotesByIns.size)} نماد` : 'بی‌قیمت — قیمت‌گیری نشد', '', null],
    ].map(([k, v, sub, gain]) => `<div class="kpi"><div class="k">${k}</div>
      <div class="v ${kpiTone(k, gain)}">${v}</div><div class="s">${sub}</div></div>`).join('');

    root.querySelector('#daily-note').textContent = dailyNote;
    if (closing != null) drawClose();
    if (editing != null) drawEdit();
    if (expanded != null) drawDetail();
  }

  function drawDetail() {
    const p = positions[expanded];
    // فقط موقعیتِ باز پنل جزئیات دارد: هر عددی که برای بسته‌شده یا
    // سررسیدگذشته آنجا نوشته شود — بازده، وجه تضمین، یونانی — از مظنهٔ
    // امروز می‌آید، برای موقعیتی که دیگر در بازار نیست.
    if (!p || positionStatus(p, todayNumber()).id !== 'open') {
      root.querySelector('#det-card').style.display = 'none';
      root.querySelector('#track-card').style.display = 'none';
      chart?.destroy(); chart = null; chartFor = null;
      charts.disposeAll();
      return;
    }
    const { m, spot, fees, greeks } = evalPos(p);
    // قیمت‌گیری هر پانزده ثانیه دوباره صدا می‌زند؛ اگر همان موقعیت باز است
    // نه یک موقعیت دیگر، زوم/پن چارت باید بماند نه هر بار به نمای اول برگردد
    const sameRow = chartFor === expanded;
    if (chart) chartRange = chart.view();
    root.querySelector('#det-card').style.display = '';
    root.querySelector('#det-title').textContent = `${p.title} — ${displayName(p.uaName, p.uaIns, 'دارایی پایه بدون نام')}`;

    const gk = (value) => (Number.isFinite(value) ? fmt.small(value) : '—');
    const ivPctCell = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
    // جمله‌های جهت‌گیری از `monitorStance` می‌آیند و متن ثابتِ خودِ برنامه‌اند،
    // نه دادهٔ بالادست؛ یک بار ساخته می‌شوند نه چهار بار.
    const stance = monitorStance(greeks.greeks || {});
    const legRows = m.perLeg.map((l, i) => `
      <tr>
        <td>${l.side === 'sell' ? 'فروش' : 'خرید'} ${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت') + ' ' + fmt.money(l.strike)}</td>
        <td class="n">${fmt.money(l.entryPrice)}</td>
        <td class="n">${fmt.money(l.markPrice)}</td>
        <td class="n">${fmt.int(l.units)}</td>
        <td class="n">${fmt.money(l.feeIn + l.feeOut)}</td>
        <td class="n" style="color:${l.pnl >= 0 ? 'var(--gain)' : 'var(--loss)'}">${fmt.money(l.pnl)}</td>
        <td class="n">${ivPctCell(greeks.ivPct[i])}</td>
        ${GREEKS.map(({ key }) => `<td class="n">${gk(greeks.byLeg[i]?.[key])}</td>`).join('')}
      </tr>`).join('');

    // سطر جمع، همان سهم‌های وزن‌دار است — نه محاسبه‌ای دوم. ستون هر پا
    // وزن‌نخورده است، پس جمعِ چشمی ستون‌ها با این سطر یکی نمی‌شود و همین در
    // یادداشت زیر جدول گفته می‌شود.
    const greekTotals = `<tr class="mini-total"><td>جمع موقعیت — وزن‌دار</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td>
      <td class="n">${ivPctCell(greeks.meanIvPct)}</td>${GREEKS.map(({ key }) => `<td class="n">${gk(greeks.greeks?.[key])}</td>`).join('')}</tr>`;

    root.querySelector('#det').innerHTML = `
      <div>
        <div id="det-chart"></div>
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">تفکیک هر پا — برای یک دست قرارداد</h4>
        <table class="mini">
          <thead><tr><th>پا</th><th>قیمت ورود</th><th>قیمت بستن</th><th>سهم درگیر</th><th>کارمزد رفت و برگشت</th><th>سود و زیان</th><th>تلاطم ضمنی</th>${GREEKS.map(({ label }) => `<th>${label}</th>`).join('')}</tr></thead>
          <tbody>${legRows}${greekTotals}</tbody>
        </table>
        <p class="note" style="margin-top:10px">قیمت بستن، مظنه مخالف است: موقعیت خرید روی تقاضا بسته می‌شود و موقعیت فروش روی عرضه بازخرید می‌شود.</p>
        <p class="note">${greeks.incomplete ? 'یونانی جمعِ موقعیت ساخته نشد چون دست‌کم یک پا تلاطم ضمنی ندارد؛ عددِ ناقص با فرض صفر برای آن پا ساخته نمی‌شود.' : `همین حالا این موقعیت <b>${stance.delta}</b> است، نسبت به حرکت بزرگ <b>${stance.gamma}</b>، نسبت به تلاطم <b>${stance.vega}</b>، و <b>${stance.theta}</b>.`} یونانی ستونِ هر پا وزن‌نخورده است — همان چیزی که بلک‌شولز برای یک سهم داده؛ وزن و علامت فقط در سطر جمع اعمال می‌شود. تلاطم ضمنی از همان قیمت بستن درمی‌آید که سود و زیان از آن آمده، و پارامترهایش در تنظیمات، بخش «یونانی‌ها، تلاطم و احتمال» قابل تغییرند.</p>
      </div>
      <div>
        <dl class="kv">
          <dt>جریان نقد ورود</dt><dd>${fmt.money(m.entryNet)}</dd>
          <dt>ارزش بستن الان</dt><dd>${fmt.money(m.closeNet)}</dd>
          <dt>سود و زیان یک دست</dt><dd>${fmt.money(m.pnl)}</dd>
          <dt>سود و زیان کل</dt><dd>${fmt.money(m.pnlTotal)}</dd>
          <dt>سرمایه روز ورود</dt><dd>${fmt.money(m.capital)}</dd>
          <dt>مبنای سرمایه</dt><dd>${m.capitalLabel}</dd>
          <dt>وجه تضمین روز ورود</dt><dd>${fmt.money(m.entryMargin)}${m.entryMarginApprox ? ' (برآوردی)' : ''}</dd>
          <dt>خالص سرمایه تضمینی ورود</dt><dd>${fmt.money(m.entryMarginNet)}</dd>
          <dt>وجه تضمین لازم امروز</dt><dd>${fmt.money(m.currentMargin)}</dd>
          <dt>تضمین شرطی امروز</dt><dd>${fmt.money(m.currentConditionalMargin)}</dd>
          <dt>روز نگه‌داری</dt><dd>${m.daysHeld == null ? '—' : fmt.int(m.daysHeld)}</dd>
          <dt>بازده از ورود</dt><dd>${fmt.pct(m.retPct)}٪</dd>
          <dt>بازده ماهانه</dt><dd>${fmt.pct(m.retMonthPct)}٪</dd>
        </dl>
        ${!m.entryRiskAvailable ? `
          <div class="note" id="entry-risk-fix" style="margin-top:12px">
            <p>${m.entryRiskReason}. برای محاسبه بازده، داده تاریخی واقعی را ثبت کن.</p>
            <label for="entry-risk-spot">قیمت پایانی پایه در ورود</label>
            <input type="number" id="entry-risk-spot" value="${Number(p.entrySpot) > 0 ? Number(p.entrySpot) : ''}">
            ${p.legs.map((l, i) => l.side === 'sell' && l.kind !== 'underlying' ? `
              <label for="entry-risk-close-${i}">قیمت پایانی ${l.kind === 'call' ? 'کال' : 'پوت'} ${fmt.money(l.strike)} در ورود</label>
              <input type="number" id="entry-risk-close-${i}" data-entry-close="${i}" value="${Number(l.entryClose) > 0 ? Number(l.entryClose) : ''}">` : '').join('')}
            <button class="btn" id="entry-risk-save" style="margin-top:8px">ثبت مبنای ورود</button>
          </div>` : `
          <p class="note" style="margin-top:10px">بازده = سود و زیان جاری ÷ سرمایه ثابت روز ورود. وجه تضمین امروز فقط برای نیاز نقدینگی نمایش داده می‌شود و مخرج بازده را تغییر نمی‌دهد.</p>`}
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">اگر تا سررسید نگه داری</h4>
        <dl class="kv">
          <dt>در قیمت فعلی پایه</dt><dd>${fmt.money(m.ifHeld.atSpot)}</dd>
          <dt>بیشترین سود</dt><dd>${fmt.money(m.ifHeld.maxProfit)}</dd>
          <dt>بیشترین زیان</dt><dd>${fmt.money(m.ifHeld.maxLoss)}</dd>
          <dt>سربه‌سری</dt><dd>${m.ifHeld.breakevens.map((b) => fmt.money(b)).join(' , ') || '—'}</dd>
        </dl>
        <p class="note" style="margin-top:10px">برای تصمیم رول همین موقعیت، به تب تحلیل رول برو.</p>
      </div>`;

    chart?.destroy();
    chart = mountPayoff(root.querySelector('#det-chart'), p.legs, m.entryNet, {
      fees, spot, width: 720, height: 250,
      ...(sameRow && chartRange ? { initRange: chartRange } : {}),
    });
    chartFor = expanded;
    drawTrack();

    const riskSave = root.querySelector('#entry-risk-save');
    if (riskSave) riskSave.addEventListener('click', async () => {
      const entrySpot = Number(root.querySelector('#entry-risk-spot')?.value);
      if (!(entrySpot > 0)) { flash('قیمت پایانی پایه در روز ورود را وارد کن.', true); return; }
      p.entrySpot = entrySpot;
      for (const input of root.querySelectorAll('[data-entry-close]')) {
        const close = Number(input.value);
        if (!(close > 0)) { flash('همه قیمت‌های پایانی اختیار در ورود لازم‌اند.', true); return; }
        p.legs[Number(input.dataset.entryClose)].entryClose = close;
      }
      const snapshot = captureEntryRisk(p, riskOptions());
      if (!snapshot.available) { flash(snapshot.reason, true); return; }
      p.entryRisk = snapshot;
      await save();
      flash('مبنای ثابت روز ورود ثبت شد.');
      render();
    });
  }

  // ——————————————— پنل روند ———————————————
  //
  // سه سرچشمه، یک نمودار. سرچشمه را کاربر عوض می‌کند و هیچ‌کدام دیگری را
  // پر نمی‌کند: اگر نوار امروز گرفته نشده باشد، حالت درون‌روزی **خالی**
  // می‌ماند و می‌گوید چرا — نه اینکه سری روزانه را به‌جایش نشان دهد.
  function trackSeriesOf(p, at, mode) {
    if (mode === 'session') return { points: sessionTicks.get(posKey(p, at)) || [], gaps: [], reason: '' };
    if (mode === 'intraday') return intradayPnlSeries(p, tapeByIns, { fees: feesNow(), date: todayNumber() });
    return dailySeries(p, at);
  }

  const CHANGE_LABEL = {
    daily: 'تغییر از اولین روزِ دارای قیمت کامل',
    intraday: 'تغییر از اولین لحظهٔ امروز',
    session: 'تغییر از ابتدای این جلسه',
  };

  function drawTrack() {
    const at = expanded;
    const p = positions[at];
    const card = root.querySelector('#track-card');
    if (!p) { card.style.display = 'none'; charts.disposeAll(); return; }
    card.style.display = '';
    const mode = trackMode(trackModeId).id;
    root.querySelector('#track-title').textContent = `روند سود و زیان — ${p.title || '—'}`;
    root.querySelector('#track-modes').innerHTML = TRACK_MODES.map((item) => `
      <button type="button" class="ghost" data-track="${item.id}" title="${item.hint}"
        aria-pressed="${item.id === mode ? 'true' : 'false'}">${item.label}</button>`).join('');

    const series = trackSeriesOf(p, at, mode);
    const rows = trackRows(series, mode);
    const stats = trackStats(series.points || []);
    root.querySelector('#track-stats').innerHTML = trackStatsHtml(stats, { changeLabel: CHANGE_LABEL[mode] });
    const extra = mode === 'intraday' && tapeAt ? ` آخرین دریافت نوار: ${faClock(new Date(tapeAt))}.` : '';
    root.querySelector('#track-note').textContent = `${trackNote(series, mode)}${extra}${tapeNote && mode === 'intraday' ? ` ${tapeNote}` : ''}`;

    // نوار امروز فقط با درخواست صریح گرفته می‌شود، و هزینه‌اش پیش از کلیک
    // نوشته می‌شود — نه بعدش. عددی که بعد از فشردن دکمه معلوم شود، هشدار
    // نیست؛ عذرخواهی است.
    const actions = root.querySelector('#track-actions');
    const codes = trackInstruments(p);
    actions.innerHTML = mode === 'intraday'
      ? `<button class="ghost" id="tape-get">${tapeAt ? 'گرفتن دوبارهٔ نوار امروز' : 'گرفتن نوار امروز'}</button>
         <span class="unit">${faDigits(codes.length)} قرارداد در یک درخواست</span>`
      : '';

    const host = root.querySelector('#track-chart');
    if (rows.length) {
      charts.set('track', host, (echarts, tokens) => trackChartOption(rows, tokens));
    } else {
      charts.disposeAll();
      host.innerHTML = `<p class="empty-note">${trackNote(series, mode)}</p>`;
    }

    for (const button of root.querySelectorAll('[data-track]')) {
      button.addEventListener('click', () => {
        trackModeId = trackMode(button.dataset.track).id;
        drawTrack();
      });
    }
    const tapeBtn = root.querySelector('#tape-get');
    if (tapeBtn) tapeBtn.addEventListener('click', async () => {
      if (tapeBtn.disabled) return;
      tapeBtn.disabled = true;
      const label = tapeBtn.textContent;
      tapeBtn.textContent = 'در حال دریافت…';
      try { await loadTape(p); } finally { tapeBtn.disabled = false; tapeBtn.textContent = label; }
      drawTrack();
    });
  }

  // ——————————————— بستن موقعیت ———————————————
  function drawClose() {
    const p = positions[closing];
    const card = root.querySelector('#close-card');
    if (!p) { card.style.display = 'none'; return; }
    card.style.display = '';
    root.querySelector('#close-title').textContent = `بستن موقعیت — ${p.title || '—'}`;
    const host = root.querySelector('#close-form');
    // مثل فرم ویرایش: رفرشِ پانزده‌ثانیه‌ای نباید آنچه کاربر تایپ کرده را
    // پاک کند، پس فرم فقط با عوض شدنِ موقعیت از نو ساخته می‌شود.
    if (host.dataset.for !== String(closing)) {
      host.dataset.for = String(closing);
      host.innerHTML = closeFormHtml(p, { today: todayJalali(), suggested: closeSuggest });
    }
  }

  const closeMsg = root.querySelector('#close-msg');
  const dropClose = () => {
    closing = null;
    closeSuggest = [];
    root.querySelector('#close-form').dataset.for = '';
    root.querySelector('#close-card').style.display = 'none';
    closeMsg.textContent = '';
  };
  root.querySelector('#close-cancel').addEventListener('click', dropClose);
  root.querySelector('#close-save').addEventListener('click', async () => {
    const p = positions[closing];
    if (!p) return;
    const read = readClose(root.querySelector('#close-form'), p);
    // سنجش کارِ موتور است، نه فرم: همان قاعده‌ها باید در آزمون هم بگزند.
    const checked = validateExit(p, read);
    if (!checked.ok) { closeMsg.textContent = checked.reason; closeMsg.style.color = 'var(--loss)'; return; }
    positions[closing] = { ...p, exit: checked.exit };
    dropClose();
    // موقعیتِ بسته دیگر پنل جزئیات و روندِ زنده ندارد.
    expanded = null;
    editing = null;
    await save();
    flash('خروج ثبت شد؛ سود این موقعیت از این پس تحقق‌یافته است.');
    render();
    await priceAll();
  });

  // ——————————————— ویرایش ———————————————
  function drawEdit() {
    const p = positions[editing];
    const card = root.querySelector('#edit-card');
    if (!p) { card.style.display = 'none'; return; }
    card.style.display = '';
    root.querySelector('#edit-title').textContent = `ویرایش موقعیت — ${p.title || '—'}`;
    const host = root.querySelector('#edit');
    // فرم فقط وقتی از نو ساخته می‌شود که موقعیتِ دیگری باشد. قیمت‌گیری هر
    // پانزده ثانیه `render` را صدا می‌زند و ساختنِ دوبارهٔ فرم، هر چیزی را
    // که کاربر تایپ کرده بود پاک می‌کرد.
    if (host.dataset.for !== String(editing)) {
      host.dataset.for = String(editing);
      host.innerHTML = editFormHtml(p);
    }
  }

  root.querySelector('#edit-cancel').addEventListener('click', () => {
    editing = null;
    root.querySelector('#edit').dataset.for = '';
    root.querySelector('#edit-card').style.display = 'none';
  });

  const editMsg = root.querySelector('#edit-msg');
  root.querySelector('#edit-save').addEventListener('click', async () => {
    const p = positions[editing];
    if (!p) return;
    const read = readEdit(root.querySelector('#edit'), p);
    if (!read.ok) { editMsg.textContent = read.reason; editMsg.style.color = 'var(--loss)'; return; }
    const next = read.position;
    const snapshot = captureEntryRisk(next, riskOptions());
    if (!snapshot.available) { editMsg.textContent = snapshot.reason; editMsg.style.color = 'var(--loss)'; return; }
    next.entryRisk = snapshot;
    positions[editing] = next;
    editing = null;
    root.querySelector('#edit').dataset.for = '';
    root.querySelector('#edit-card').style.display = 'none';
    // تاریخ ورود ممکن است عوض شده باشد، پس بازهٔ تاریخچه هم عوض می‌شود.
    await save();
    await loadDailies();
    flash('ویرایش ثبت شد.');
    render();
  });

  // ——————————————— پذیرش ترکیب از جست‌وجوی استراتژی‌ها ———————————————
  const intakeMsg = root.querySelector('#intake-msg');
  function drawIntake() {
    const card = root.querySelector('#intake-card');
    if (!draft) { card.style.display = 'none'; return; }
    card.style.display = '';
    root.querySelector('#intake-title').textContent = draft.comboName
      ? `ترکیب رسیده — ${draft.title} · ${draft.comboName}`
      : `ترکیب رسیده — ${draft.title}`;
    const host = root.querySelector('#intake');
    if (host.dataset.ready !== '1') { host.dataset.ready = '1'; host.innerHTML = intakeFormHtml(draft); }
    intakeMsg.textContent = draftNote;
    intakeMsg.style.color = 'var(--muted)';
  }

  function dropIntake() {
    draft = null;
    draftNote = '';
    const host = root.querySelector('#intake');
    host.dataset.ready = '';
    host.innerHTML = '';
    root.querySelector('#intake-card').style.display = 'none';
  }

  root.querySelector('#intake-drop').addEventListener('click', dropIntake);
  root.querySelector('#intake-save').addEventListener('click', async () => {
    if (!draft) return;
    const read = readIntake(root.querySelector('#intake'), draft);
    if (!read.ok) { intakeMsg.textContent = read.reason; intakeMsg.style.color = 'var(--loss)'; return; }
    const position = { ...blankPosition(), ...read.position };
    const snapshot = captureEntryRisk(position, riskOptions());
    if (!snapshot.available) { intakeMsg.textContent = snapshot.reason; intakeMsg.style.color = 'var(--loss)'; return; }
    position.entryRisk = snapshot;
    positions.push(position);
    dropIntake();
    await save();
    await loadDailies();
    flash('موقعیت از ترکیب رسیده ثبت شد.');
    render();
    await priceAll();
  });

  /**
   * قیمت پایانی امروزِ پاهای پیش‌نویس، برای خانهٔ «پایانی روز ورود».
   *
   * فقط وقتی معنی دارد که روز ورودِ پیش‌نویس همین امروز باشد — ردیفِ
   * تاریخی روزِ دیگری دارد و قیمت پایانیِ امروز برای آن، عددِ غلط است. در
   * آن حالت خانه خالی می‌ماند و کاربر خودش پرش می‌کند.
   */
  async function fillDraftCloses() {
    if (!draft) return;
    if (draft.entryDate !== todayJalali()) {
      draftNote = 'روز ورود این ترکیب امروز نیست، پس قیمت پایانی روز ورود پیش‌پر نشد.';
      return;
    }
    const needs = draft.legs.filter((leg) => needsEntryClose(leg) && leg.ins);
    if (!needs.length) return;
    try {
      const infos = await (await fetch(`/api/infos?ins=${needs.map((leg) => leg.ins).join(',')}`)).json();
      let filled = 0;
      for (const leg of needs) {
        const close = Number(infos[leg.ins]?.close);
        if (close > 0) { leg.entryClose = close; filled += 1; }
      }
      draftNote = filled === needs.length
        ? 'قیمت پایانی امروزِ پاهای فروش پیش‌پر شد.'
        : `${faDigits(needs.length - filled)} پای فروش قیمت پایانی امروز نداشت؛ خانه‌اش را خودت پر کن.`;
    } catch {
      draftNote = 'قیمت پایانی امروز گرفته نشد؛ خانه‌های پایانی را خودت پر کن.';
    }
  }

  async function takePlan() {
    const plan = state.handoff?.to === 'positions' ? state.handoff : null;
    if (!plan) return;
    state.handoff = null;
    const made = draftFromPlan(plan, { today: todayJalali() });
    if (!made.ok) { flash(made.reason, true); return; }
    draft = made.draft;
    draftNote = '';
    await fillDraftCloses();
    drawIntake();
  }

  // ——————————————— داده ———————————————
  async function load() {
    try { positions = await (await fetch('/api/positions')).json(); }
    catch { positions = []; }
    // رکوردهای قدیمیِ قابل بازسازی (مثلاً کاوردکال که قیمت خرید سهم را
    // دارد) یک بار به عکس فوری نسخه جدید مهاجرت می‌شوند. فروش لختِ فاقد
    // قیمت پایه ورود عمداً خودکار با قیمت امروز پر نمی‌شود.
    let migrated = false;
    for (const p of positions) {
      if (p.entryRisk?.version === 1 && Number.isFinite(p.entryRisk.capital)) continue;
      const snapshot = captureEntryRisk(p, riskOptions());
      if (!snapshot.available) continue;
      if (!(Number(p.entrySpot) > 0) && snapshot.entrySpot > 0) p.entrySpot = snapshot.entrySpot;
      p.entryRisk = snapshot;
      migrated = true;
    }
    if (migrated) await save({ quiet: true });
    await loadDailies();
    render();
  }

  /**
   * تاریخچهٔ روزانهٔ همهٔ پاها — یک درخواست دسته‌ای، نه یکی به‌ازای هر پا.
   *
   * `n` از قدیمی‌ترین روزِ ورودِ ثبت‌شده درمی‌آید، نه از یک عددِ ثابت:
   * گرفتنِ همیشهٔ کلِ تاریخچه برای موقعیتی که دیروز باز شده، اسراف است و
   * گرفتنِ سی روزِ ثابت برای موقعیتی که شش ماه باز بوده، روندش را می‌بُرد.
   * حاشیهٔ ده روز برای تعطیلی‌هاست.
   */
  async function loadDailies() {
    const codes = new Set();
    for (const p of positions) for (const ins of trackInstruments(p)) codes.add(ins);
    if (!codes.size) { dailyByIns = {}; dailyNote = ''; return; }
    const held = positions.map((p) => Number(daysSinceJalali(p.entryDate)) || 0);
    const need = Math.min(900, Math.max(30, ...held) + 10);
    try {
      const res = await (await fetch(`/api/dailies?ins=${[...codes].join(',')}&n=${need}`)).json();
      dailyByIns = res && typeof res === 'object' ? res : {};
      const empty = [...codes].filter((ins) => !(dailyByIns[ins]?.rows || []).length);
      dailyNote = empty.length
        ? `تاریخچهٔ روزانهٔ ${faDigits(empty.length)} قرارداد خالی آمد؛ روند و «تغییر امروز» برای موقعیتِ دربرگیرنده‌اش ساخته نمی‌شود.`
        : `تاریخچهٔ روزانهٔ ${faDigits(codes.size)} قرارداد گرفته شد.`;
    } catch (e) {
      dailyByIns = {};
      dailyNote = `تاریخچهٔ روزانه گرفته نشد: ${faDigits(e.message)}. روند روزانه و «تغییر امروز» تا دریافت بعدی خالی می‌مانند.`;
    }
  }

  /** نوار ریزمعاملهٔ امروزِ یک موقعیت — فقط با درخواست صریح کاربر. */
  async function loadTape(p) {
    const codes = trackInstruments(p).slice(0, 24);
    if (!codes.length) { tapeNote = 'شناسه‌ای برای گرفتن نوار نیست.'; return; }
    try {
      const res = await (await fetch(`/api/live-trades?ins=${codes.join(',')}`)).json();
      if (res?.error) { tapeByIns = {}; tapeNote = faDigits(res.error); return; }
      tapeByIns = res?.items || {};
      tapeAt = Number(res?.at) || Date.now();
      // بازارِ بسته و نمادِ بی‌معامله دو چیزند و نوارِ خالی هر دو را
      // یک‌شکل نشان می‌دهد؛ پس فاز بازار همراه جمله می‌آید.
      tapeNote = res?.market?.open === false ? `بازار باز نیست — ${faDigits(res.market.why || '')}` : '';
    } catch (e) {
      tapeByIns = {};
      tapeNote = `نوار امروز گرفته نشد: ${faDigits(e.message)}`;
    }
  }

  async function priceAll() {
    // فقط موقعیتِ باز قیمت می‌گیرد. سررسیدگذشته پاسخش گاهی آخرین قیمتِ
    // پیش از حذف است و به ارزش‌گذاری راه پیدا می‌کرد؛ بسته‌شده هم عددش
    // تحقق یافته و هیچ مظنه‌ای دیگر تکانش نمی‌دهد. هر دو فقط بارِ بی‌جهتِ
    // بالادست بودند.
    const today = todayNumber();
    const codes = new Set();
    for (const p of positions) {
      if (positionStatus(p, today).id !== 'open') continue;
      if (p.uaIns) codes.add(p.uaIns);
      for (const l of p.legs) if (l.ins) codes.add(l.ins);
    }
    if (!codes.size) return;
    try {
      const q = [...codes].join(',');
      const [books, infos] = await Promise.all([
        fetch(`/api/books?ins=${q}`).then((r) => r.json()),
        fetch(`/api/infos?ins=${q}`).then((r) => r.json()),
      ]);
      quotesByIns = new Map();
      for (const ins of codes) {
        const b = books[ins]?.book || [];
        const i2 = infos[ins] || {};
        quotesByIns.set(ins, {
          bid: b[0]?.bid || 0, bidQty: b[0]?.bidQty || 0,
          ask: b[0]?.ask || 0, askQty: b[0]?.askQty || 0,
          last: i2.last || 0, close: i2.close || 0, low: i2.low || 0, high: i2.high || 0,
          state: i2.state, staleSec: i2.staleSec, book: b,
        });
      }
      // مهر زمانیِ همین دسته قیمت. دنبالهٔ جلسه با همین کلید نقطه می‌گیرد،
      // پس رندرِ دوباره با قیمت‌های یکسان نقطهٔ تکراری نمی‌سازد.
      quotesAt = Date.now();
      render();
    } catch { /* نوار بالا خبر می‌دهد */ }
  }

  const offFeed = api.onFeed((f) => { feed = f; refreshUaOptions(); });
  const offChain = onChain((cs) => { uaList = cs.list; refreshUaOptions(); });
  if (chainState.list.length) { uaList = chainState.list; refreshUaOptions(); }
  const offWatch = api.subscribeWatch((w) => pushRows(w, !w.changed));

  await load();
  await takePlan();
  await priceAll();
  const timer = setInterval(priceAll, 15000);
  return () => {
    offChain(); offWatch(); offFeed();
    clearInterval(timer); clearTimeout(flashTimer);
    chart?.destroy();
    charts.disposeAll();
    sumCharts.disposeAll();
  };
}
