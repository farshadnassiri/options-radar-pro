// تب استراتژی — یکی برای همه.
//
// هر تب استراتژی از همین فایل ساخته می‌شود و تفاوتشان فقط شناسه الگو است.
// این نتیجه مستقیم آن تصمیم معماری است: چون هیچ استراتژی محاسبه‌گر جدا ندارد،
// هیچ تبی هم رابط جدا لازم ندارد.
//
// ساختار هر صفحه:
//   انتخاب نماد ، کنترل‌ها ، شاخص‌های کلیدی ، نوار تشخیص ،
//   جدول مرتب‌شدنی ، پانل جزئیات ردیف

import { byId } from '/strategies/catalog.mjs';
import { COLUMNS, columnsForStrategy } from '/core/evaluate.mjs';
import { analyzePayoff, scenarioGrid } from '/core/payoff.mjs';
import { manualCompare, manualNote } from '/core/manual-price.mjs';
import { analyzeMixed, isSingleExpiry } from '/core/mixed.mjs';
import { timeMachine } from '/core/timemachine.mjs';
import { priceQuantile } from '/core/bs.mjs';
import { gregorianToJalali } from '/core/jalali.mjs';
import { radarProfile, applyRadarFilters, filterLimit, isFlagFilter } from '/core/strategy-radar.mjs';
import { makeTable, funnelBar, changedIds } from '/ui/table.mjs';
import { fmt, faNum, faDigits, coverageInfo, signTone, ltr, offsetCell } from '/ui/fmt.mjs';
import { makePicker } from '/ui/picker.mjs';
import { mountPayoff, payoffAt } from '/ui/chart.mjs';
import { sameUnderlyingCandidates, compareLabel, compareFullLabel, MAX_COMPARE } from '/ui/compare.mjs';
import { handoffPlan, goHandoff, strategyLinkPlan, strategyLinkTargets } from '/ui/handoff.mjs';
import { mountScenarioPanel } from '/ui/scenario-panel.mjs';
import { runScan, onChain, pushRows, chainState } from '/ui/scanner.mjs';
import { mountSubtabs } from '/ui/subtabs.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { HISTORY_CHAIN_BASES } from '/core/history-chain.mjs';
import { historyDates, liveTapeFor, runHistoryScan } from '/ui/strategy-history.mjs';
import { MOMENT_GRAINS } from '/core/intraday-grid.mjs';
import { sessionTrail, trailNote } from '/core/session-trail.mjs';
import { gapPathChart } from '/ui/gap-charts.mjs';
// نامِ تازه، نه از سرِ سلیقه: داخلِ `showDetail` تابعِ محلیِ `mountChart`
// نمودارِ سود و زیان را سوار می‌کند و همین نام را دارد. دو `mountChart`
// در یک فایل، خطایی می‌سازد که فقط در زمان اجرا دیده می‌شود.
import { mountChart as mountEcharts } from '/ui/chart-host.mjs';
import { logError } from '/ui/errlog.mjs';

/** dEven عددی (مثلاً ۲۰۲۶۰۱۰۱) به تاریخ شمسی خوانا. */
function jalaliFromDEven(dEven) {
  const s2 = String(dEven);
  if (s2.length !== 8) return faDigits(s2);
  const gy = +s2.slice(0, 4), gm = +s2.slice(4, 6), gd = +s2.slice(6, 8);
  const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
  return faDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

// نمای «رصد» اینجا نیست: برای هر استراتژی از `core/strategy-radar.mjs`
// ساخته می‌شود و مختصِ خودش است. بقیهٔ نماها مشترک‌اند و برای همه یکی.
const VIEWS = {
  // نمای خلاصه، ترتیبِ خواندن یک ردیف است: چه چیزی، چند روز، چقدر نقد،
  // سربه‌سری کجاست و چقدر با آن فاصله داریم، سود و زیان و درصدهایشان، و بعد
  // سرمایه و اجرا.
  //
  // «فاصله تا سربه‌سری ٪» و «بیشترین زیان ٪ سرمایه» تازه‌اند. ستون‌هایشان از
  // قبل در قرارداد ستونی بود ولی در هیچ نمای آماده‌ای نبود — یعنی عملاً کسی
  // نمی‌دیدشان. عدد ریالیِ زیان بدون درصد، دو ترکیب با سرمایهٔ متفاوت را
  // قابل مقایسه نمی‌کند.
  // سررسید، قیمت اعمال و نام قرارداد پاها: «روز مانده» نمی‌گوید کدام
  // سررسید، و بدون نام قرارداد نمی‌شود سفارش را در سامانه کارگزار پیدا کرد.
  //
  // سربه‌سری‌ها ستون جدا گرفتند. یک ستونِ فهرستی («۹۴٬۰۰۰ , ۱۰۸٬۰۰۰») نه
  // مرتب می‌شود نه با ردیف کناری مقایسه — و استرادل و کندور همیشه دو تا
  // دارند. ستون فهرستی در انتخابگر می‌ماند، برای وقتی که بیش از چهار باشد.
  //
  // ارزش معاملات پاها هم ستون جدا گرفت، به همان دلیل سربه‌سری‌ها: مجموع
  // گردش یک ترکیب نمی‌گوید گردش پخش است یا روی یک پا جمع شده، و پایی که
  // امروز نخوابیده با پایی که خوابیده در یک عدد گم می‌شود. کنار «هزینه
  // اجرا» نشسته چون هر دو یک سؤال را جواب می‌دهند: این ردیف را می‌شود بست؟
  خلاصه: ['underlying', 'legNames', 'expiryLabel', 'strikes', 'days', 'cashLabel', 'netCash',
    'be1', 'be1DistPct', 'be2', 'be2DistPct', 'beRoomPct',
    'maxProfit', 'maxProfitPct', 'retMaxPct', 'maxLoss', 'maxLossPct', 'rewardRisk',
    'capital', 'margin', 'marginNet', 'marginPart1', 'marginPart2', 'marginPart3', 'marginPart4',
    'retMonthPct', 'popPct',
    'legValue1', 'legValue2', 'legValue3', 'legValue4',
    'execCost', 'maxQty', 'binding',
    'qualityLabel', 'warn'],
  سرمایه: ['underlying', 'legsText', 'days', 'capital', 'capitalLabel', 'margin', 'marginNet',
    'marginPart1', 'marginPart2', 'marginPart3', 'marginPart4', 'marginToMaxLoss',
    'marginRequired', 'marginNote', 'conditionalMargin', 'netCash', 'maxLoss', 'retMaxPct', 'retAnnPct', 'warn'],
  یونانی: ['underlying', 'legsText', 'days', 'delta', 'gamma', 'vega', 'theta', 'rho',
    'thetaToCapitalPct', 'sigmaUse', 'ivMeanPct', 'hvPct', 'ivHvSpreadPp', 'popPct', 'capital', 'warn'],
  // تفکیک پا، نمای جدا دارد نه ستون‌های اضافه روی نمای «یونانی»: با چهار پا
  // بیست‌وچهار ستون می‌شود و جدولی که باید در یک نگاه خوانده شود، افقی
  // اسکرول می‌خورد.
  'یونانی پاها': ['underlying', 'legNames', 'days',
    'legIv1', 'legIv2', 'legIv3', 'legIv4',
    'legdelta1', 'legdelta2', 'legdelta3', 'legdelta4',
    'leggamma1', 'leggamma2', 'leggamma3', 'leggamma4',
    'legvega1', 'legvega2', 'legvega3', 'legvega4',
    'legtheta1', 'legtheta2', 'legtheta3', 'legtheta4',
    'delta', 'gamma', 'vega', 'theta', 'warn'],
  اجرا: ['underlying', 'legsText', 'days', 'execCost', 'costCommission', 'costCrossing',
    'costSlippage', 'costFunding', 'maxQty', 'binding', 'qualityLabel', 'warn'],
  همه: COLUMNS.map((c) => c.key),
};

export async function mount(root, { tab, state, api }) {
  const def = tab.def || byId(tab.id);
  // کنترل‌های محلی این تب (priceBasis، rankBy، ...) روی state.settings
  // مشترک نمی‌نشینند — آن شیء همان چیزی است که تب تنظیمات با آن فرم
  // می‌سازد و بقیه تب‌ها (برترین موقعیت‌ها، رول، موقعیت‌های من) هم زنده
  // می‌خوانندش؛ تغییر اینجا بدون این لایه، بی‌صدا روی همه‌شان اثر می‌گذاشت.
  const overrides = {};
  const s = () => ({ ...state.settings, ...overrides });
  let disposeScen = null;
  let rows = [];
  let picked = null;
  // نمایهٔ رادارِ همین استراتژی — ستون‌های آغازین، مرتب‌سازی و فیلترهایی
  // که برای این ساختار معنی دارند. کاورد کال با «بازده ایستا» شروع
  // می‌شود و پروانه با «سود به زیان»؛ هیچ‌کدام کدِ جدا ندارند.
  const profile = radarProfile(def);
  const VIEWS_HERE = { رصد: profile.columns, ...VIEWS };
  let view = 'رصد';
  // مقدارِ هر فیلتر: عدد برای فیلترِ عددی، `true` برای پرچمی. کلیدِ
  // نبوده یعنی خاموش، پس فیلترِ دست‌نخورده هیچ ردیفی را نمی‌اندازد.
  const filterValues = {};
  let filterReport = { dropped: 0, missing: 0 };
  // ردیف‌هایی که پس از فیلتر واقعاً روی جدول‌اند. شاخص‌های کلیدی باید
  // همین‌ها را بشمارند نه کلِ اسکن را: کارتی که «۸۰ ردیف قابل اجرا»
  // می‌گوید در حالی که جدول دوازده ردیف دارد، دو حرفِ متفاوت است.
  let shown = [];
  let busy = false;
  let hasScanned = false;
  const NOT_SCANNED_MSG = 'هنوز اسکن نزدی — نماد را انتخاب کن و دکمه اسکن را بزن.';
  let qty = s().qtyDefault;
  // دورهٔ نوسازیِ رصدِ زنده، ثانیه — انتخابِ کاربر، نه عددِ سخت‌کدشده.
  // پیش از این `watchIntervalSec * 3` بود و هیچ‌جا دیده نمی‌شد؛ کسی که
  // می‌خواست تندتر یا کندتر ببیند، راهی نداشت. کف ۵ ثانیه است چون هر
  // نوسازی یک اسکنِ دومرحله‌ای کامل است و تندتر از آن یعنی صف درخواست.
  let refreshSec = Math.max(5, Math.round(s().watchIntervalSec * 3) || 15);
  // حجم یک ردیف، همان حجمی است که هنگام اسکنِ آن ردیف در کنترل بوده و در
  // خود ردیف ثبت شده. پنل جزئیات و انتقال به بک‌تست باید همان را ادامه
  // دهند، نه `qtyDefault` تنظیمات — وگرنه کاربر حجم را ۳۰۰ می‌کند، جدول
  // ۳۰۰ قرارداد نشان می‌دهد و پنل کنارش هنوز یک قرارداد را می‌سنجد.
  const unitsOf = (r) => Math.max(1, Math.trunc(Number(r?.qty) || qty || 1));
  // آخرین اسکن دومرحله‌ای تمام‌شده — پایه مقایسه برای نشان «تغییر کرد»ی
  // اسکن پیوسته بعدی. اولین اسکن هر نشست null می‌ماند، پس چیزی فلش نمی‌زند.
  let lastFullRows = null;
  let flashTimer = null;

  root.innerHTML = `
    <div class="page-head">
      <h2>${ltr(def.name)}</h2>
      <p>${def.feasible
        ? `${def.dir}${def.note ? ' — ' + def.note : ''}`
        : `<span class="tag warn">اجرا در تابلو ممکن نیست</span> ${def.infeasibleWhy}`}</p>
    </div>

    <section class="card">
      <h3>نماد پایه</h3>
      <p class="note">انتخابی، نه تایپی. جست‌وجو فقط فهرست را کوتاه می‌کند. همین انتخاب، هم رصد زنده را می‌سازد و هم رصد تاریخی.</p>
      <div id="pick"></div>
    </section>

    <!-- زیرتب‌ها فقط **منبع** جدول را عوض می‌کنند، نه خودِ جدول.
         شاخص‌ها، فیلترها، جدول و پانل جزئیات پایین‌تر مشترک‌اند و همان
         ستون‌ها را دارند — وگرنه «همان جدول، تاریخ دیگر» ادعای توخالی
         می‌شد و دو عدد از دو مسیر با هم مقایسه می‌شدند. -->
    <div id="modes"></div>

    <div data-panel="live">
      <section class="card">
        <h3>کنترل اسکن</h3>
        <p class="note">حجم من، مقیاس کل ردیف است: هر عدد ریالی جدول، نمودار و پنل جزئیات برای همین تعداد قرارداد حساب می‌شود — نه یک دست. مبنای قیمت و حالت اجرا روی قیمت اجرای هر پا اثر می‌گذارند.</p>
        <div class="grid" id="ctrl"></div>
        <div class="bar" style="margin-top:12px">
          <button class="btn" id="run">اسکن</button>
          <label class="field row" style="margin:0"><input type="checkbox" id="auto"> <label for="auto">رصد زنده</label></label>
          <span class="field row" style="margin:0;flex-wrap:nowrap"><label for="c-refresh" style="white-space:nowrap">دوره — ثانیه</label>
            <input type="number" id="c-refresh" min="5" max="600" step="5" style="width:5rem"></span>
          <span class="sp"></span>
          <span id="status" class="picker-sum" role="status" aria-live="polite"></span>
        </div>
        <div class="scan-progress" id="progress" style="display:none"><div class="scan-progress-fill" id="progress-fill"></div></div>
      </section>
    </div>

    <div data-panel="history">
      <section class="card">
        <h3>رصد تاریخی</h3>
        <p class="note">همان ستون‌ها، همان محاسبه — با قیمتِ یک روزِ گذشته. دفترِ سفارشِ گذشته وجود ندارد، پس اعداد این حالت مرجع‌اند و ادعای اجرا ندارند.</p>
        <div class="grid">
          <div class="field">
            <label for="h-basis">مبنای قیمت آن روز</label>
            <select id="h-basis">${HISTORY_CHAIN_BASES.map(([key, label], at) => `<option value="${key}"${at === 1 ? ' selected' : ''}>${label}</option>`).join('')}</select>
          </div>
        </div>
        <div id="h-dates" style="margin-top:12px"></div>
        <div class="bar" style="margin-top:12px">
          <button class="btn" id="h-run" disabled>جدول همان روز را بساز</button>
          <span class="sp"></span>
          <span id="h-status" class="picker-sum" role="status" aria-live="polite">اول نماد پایه را انتخاب کن.</span>
        </div>
        <p class="note" id="h-note"></p>
      </section>
    </div>

    <div data-panel="trail">
      <section class="card">
        <h3>ردِ جلسه — یک ترکیب، از بازگشایی تا حالا</h3>
        <p class="note">ردیفی را از جدول انتخاب کن، بعد اینجا ببین بهای بازکردنِ همان ترکیب امروز چه مسیری رفته. فقط برای یک ترکیب، چون ریزمعاملهٔ هر پا یک درخواست جداست.</p>
        <div class="grid">
          <div class="field">
            <label for="t-grain">دانه‌بندی</label>
            <select id="t-grain">${MOMENT_GRAINS.filter((g) => g.minutes > 0).map((g) => `<option value="${g.id}"${g.id === 'm30' ? ' selected' : ''}>${g.label}</option>`).join('')}</select>
          </div>
        </div>
        <div class="bar" style="margin-top:12px">
          <button class="btn" id="t-run" disabled>مسیر امروز را بکش</button>
          <span class="sp"></span>
          <span id="t-status" class="picker-sum" role="status" aria-live="polite">هنوز ردیفی انتخاب نشده.</span>
        </div>
        <div id="t-chart" style="margin-top:12px;min-height:340px"></div>
        <p class="note" id="t-note"></p>
        <div id="t-table"></div>
      </section>
    </div>

    <div class="kpis" id="kpis"></div>
    <section class="card">
      <h3>نوار تشخیص</h3>
      <p class="note">ترکیب‌هایی که افتادند، اینجا شمرده می‌شوند. خالی بودن جدول در بازار ایران خطای برنامه نیست، واقعیت نقدشوندگی است.</p>
      <div id="funnel"></div>
    </section>

    <section class="card" id="filters-card">
      <div class="section-head">
        <div><p class="eyebrow">پارامترهای همین استراتژی</p><h3>فیلتر جدول</h3></div>
        <button class="ghost" type="button" id="filters-clear">پاک کردن همه</button>
      </div>
      <p class="note">${profile.note}</p>
      <div class="grid" id="filters"></div>
      <p class="note" id="filters-report" role="status" aria-live="polite"></p>
    </section>

    <div class="bar" style="margin-bottom:8px">
      <span class="picker-sum">نمای ستون‌ها:</span>
      <div class="chips" id="views"></div>
    </div>
    <div id="table"></div>

    <section class="card" id="detail-card" style="margin-top:16px;display:none">
      <h3 id="detail-title">جزئیات ردیف</h3>
      <div class="detail" id="detail"></div>
      <div id="scen-wrap"></div>
      <div id="tm-wrap" style="margin-top:16px"></div>
    </section>`;

  // ——— انتخابگر ———
  // اشاره‌گر به تازه‌سازی فهرست روزهای تاریخی. جدا از خودِ تابع است چون
  // انتخابگر می‌تواند همان لحظهٔ ساخت رویداد بدهد، و تابعِ واقعی پایین‌تر
  // — کنار بقیهٔ رصدِ تاریخی — تعریف می‌شود.
  let refreshDates = null;
  const picker = makePicker(root.querySelector('#pick'), {
    onChange: () => {
      setStatus();
      if (auto.checked) run();
      // فهرست روزهای تاریخی مالِ همان نماد است؛ با عوض شدن انتخاب باید
      // دور ریخته شود، وگرنه کاربر روزی را می‌بیند که برای نمادِ قبلی
      // داده داشت.
      refreshDates?.();
    },
  });
  if (chainState.list.length) picker.setList(chainState.list);
  const offChain = onChain((cs) => picker.setList(cs.list));

  // ——— کنترل‌ها ———
  const ctrl = root.querySelector('#ctrl');
  const ctrlDefs = [
    ['qty', 'حجم من (قرارداد)', 'num'],
    ['priceBasis', 'مبنای قیمت', 'pick'],
    ['execMode', 'حالت اجرا', 'pick'],
    ['rankBy', 'مبنای رتبه‌بندی', 'pick'],
    ['minDays', 'روز از', 'num'],
    ['maxDays', 'روز تا', 'num'],
    ['comboWindowPct', 'پنجره قیمت اعمال ٪', 'num'],
    ['minReturnPct', 'حداقل بازده دوره ٪', 'num'],
    ['showUnexecutable', 'نمایش غیرقابل اجرا', 'bool'],
  ];
  const { SCHEMA } = await import('/core/settings.mjs');
  for (const [key, label, kind] of ctrlDefs) {
    const f = SCHEMA.find((x) => x.key === key);
    const w = document.createElement('div');
    w.className = kind === 'bool' ? 'field row' : 'field';
    const val = key === 'qty' ? qty : (s()[key] ?? f.def);
    if (kind === 'bool') {
      w.innerHTML = `<input type="checkbox" id="c-${key}" ${val ? 'checked' : ''}><label for="c-${key}">${label}</label>`;
    } else if (kind === 'pick') {
      w.innerHTML = `<label for="c-${key}">${label}</label><select id="c-${key}">${
        f.options.map(([v, t]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    } else {
      w.innerHTML = `<label for="c-${key}">${label}</label><input type="number" id="c-${key}" value="${val}">`;
    }
    ctrl.appendChild(w);
    const node = w.querySelector(`#c-${key}`);
    node.addEventListener('change', () => {
      const v = kind === 'bool' ? node.checked : kind === 'num' ? Number(node.value) : node.value;
      if (key === 'qty') qty = Math.max(1, v);
      else overrides[key] = v;
      if (auto.checked) run(); else setStatus('تنظیم عوض شد — اسکن را بزن.');
    });
  }

  const auto = root.querySelector('#auto');
  const statusEl = root.querySelector('#status');
  const setStatus = (t) => {
    statusEl.textContent = t || (picker.count()
      ? `${fmt.int(picker.count())} نماد انتخاب شده${rows.length ? ` — ${fmt.int(rows.length)} ردیف` : ''}`
      : 'نمادی انتخاب نشده');
  };

  // ——— نماها ———
  const viewsHost = root.querySelector('#views');
  for (const name of Object.keys(VIEWS_HERE)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = name;
    b.setAttribute('aria-pressed', name === view ? 'true' : 'false');
    b.addEventListener('click', () => {
      view = name;
      for (const x of viewsHost.children) x.setAttribute('aria-pressed', x.textContent === name ? 'true' : 'false');
      buildTable();
    });
    viewsHost.appendChild(b);
  }

  // ——— جدول ———
  let table = null;
  // ستون‌های «ارزش معاملات پای n» به تعداد پاهای همین استراتژی بریده
  // می‌شوند. «پای ۴» یک اسپرد دوپا همیشه «—» است و فقط پهنا می‌گیرد.
  // نمای «همه» معاف است، چون معنی‌اش «هر ستونی که هست» است، و انتخابگر هم
  // هر چهار را نگه می‌دارد — ترکیب دستی می‌تواند پای بیشتری داشته باشد.
  const legCount = (def.legs || []).length;
  const fitsLegs = (k) => {
    const m = /^legValue(\d+)$/.exec(k);
    return !m || Number(m[1]) <= legCount;
  };

  // سرستون هر پا، خودِ پا را می‌گوید نه فقط شماره‌اش — «ارزش معاملات پای ۲
  // — فروش کال». قاعده‌اش در `columnsForStrategy` است، کنار خودِ قرارداد
  // ستونی، تا آزمون بتواند بی‌نیاز از مرورگر بسنجدش.
  const colsAll = columnsForStrategy(def);

  function buildTable() {
    const wanted = view === 'همه' ? VIEWS_HERE[view] : VIEWS_HERE[view].filter(fitsLegs);
    const cols = wanted.map((k) => colsAll.find((c) => c.key === k)).filter(Boolean);
    // نمای «رصد» با معیارِ خودِ همان استراتژی مرتب می‌شود، نه با مبنای
    // رتبه‌بندیِ عمومیِ تنظیمات: کاورد کال با بازده ایستا، پروانه با سود
    // به زیان، آربیتراژ با بازده سالانه.
    table = makeTable(root.querySelector('#table'), cols, {
      sortKey: view === 'رصد' ? profile.sortKey : s().rankBy, onPick: showDetail,
      // نما نقطه شروع است، نه قفس: هر ستون دیگری از قرارداد ستونی مشترک را
      // می‌شود اضافه یا کم کرد، و انتخاب هر استراتژی و هر نما جدا می‌ماند.
      // `colsAll` همان قرارداد مشترک است با سرستون پاهای همین استراتژی، تا
      // انتخابگر هم همان نامی را نشان بدهد که روی جدول می‌نشیند.
      all: colsAll, storeKey: `${def.id}:${view}`,
    });
    table.set(visibleRows());
    if (!hasScanned) table.setEmptyMessage(NOT_SCANNED_MSG);
  }

  // ——— فیلترهای مختصِ همین استراتژی ———
  //
  // فیلتر روی **نتیجهٔ اسکن** می‌نشیند، نه روی درخواست: عوض‌کردنش دوباره
  // شبکه نمی‌خواهد و جدول همان لحظه کوچک و بزرگ می‌شود. چیزی که ورودیِ
  // اسکن است (بازهٔ روز، پنجرهٔ قیمت اعمال، …) بالا در «کنترل اسکن» مانده.
  function visibleRows() {
    const out = applyRadarFilters(rows, filterValues, profile.filters);
    filterReport = { dropped: out.dropped, missing: out.missing };
    shown = out.rows;
    return shown;
  }

  const reportEl = root.querySelector('#filters-report');
  function drawFilterReport() {
    const on = profile.filters.filter((f) => (isFlagFilter(f) ? filterValues[f.key] === true
      : filterLimit(filterValues[f.key]) !== null));
    if (!on.length) { reportEl.textContent = 'هیچ فیلتری روشن نیست — همهٔ ردیف‌های اسکن نمایش داده می‌شوند.'; return; }
    // ═══ عددِ صفر هم باید نوشته شود ═══
    //
    // گزارش صاحب پروژه: «گزارش فیلتر تعداد ردیف‌های افتاده به‌خاطر
    // نداشتن داده را نمی‌گوید.» تا امروز این بند فقط وقتی چاپ می‌شد که
    // عددش صفر نبود — پس خواننده نمی‌توانست بفهمد «هیچ ردیفی به‌خاطر
    // نبودِ داده نیفتاد» یا «اصلاً شمرده نشده». دو حالتِ کاملاً متفاوت،
    // یک ظاهر. حالا همیشه هر دو عدد نوشته می‌شوند.
    const missing = filterReport.missing;
    const why = filterReport.dropped === 0
      ? 'هیچ ردیفی نیفتاد'
      : `${fmt.int(filterReport.dropped - missing)} ردیف چون شرط را رد کردند و `
        + `${fmt.int(missing)} ردیف چون این عدد را اصلاً ندارند`;
    reportEl.textContent = `${fmt.int(on.length)} فیلتر روشن؛ از ${fmt.int(rows.length)} ردیف `
      + `${fmt.int(filterReport.dropped)} تا افتاد — ${why}.`;
  }

  function repaint() {
    table.set(visibleRows());
    drawKpis();
    drawFilterReport();
  }

  const filtersHost = root.querySelector('#filters');
  for (const f of profile.filters) {
    const w = document.createElement('div');
    w.className = isFlagFilter(f) ? 'field row' : 'field';
    const id = `f-${f.key}`;
    if (isFlagFilter(f)) {
      w.innerHTML = `<input type="checkbox" id="${id}"><label for="${id}">${f.label}</label>`;
    } else {
      w.innerHTML = `<label for="${id}">${f.label}${f.unit ? ` <span class="unit">${f.unit}</span>` : ''}</label>`
        + `<input type="number" id="${id}" step="any" placeholder="بدون شرط">`;
    }
    filtersHost.appendChild(w);
    w.querySelector(`#${id}`).addEventListener('input', (e) => {
      if (isFlagFilter(f)) {
        if (e.target.checked) filterValues[f.key] = true; else delete filterValues[f.key];
      } else {
        // کادرِ خالی یعنی «شرطی نگذاشتم»، نه «حداقل صفر» — همان قاعده‌ای
        // که `filterLimit` نگه می‌دارد و اینجا هم از همان می‌آید تا دو
        // تعریفِ متفاوت از «خاموش» نداشته باشیم.
        const v = filterLimit(e.target.value);
        if (v === null) delete filterValues[f.key]; else filterValues[f.key] = v;
      }
      repaint();
    });
  }
  root.querySelector('#filters-clear').addEventListener('click', () => {
    for (const key of Object.keys(filterValues)) delete filterValues[key];
    for (const node of filtersHost.querySelectorAll('input')) {
      if (node.type === 'checkbox') node.checked = false; else node.value = '';
    }
    repaint();
  });

  buildTable();
  drawFilterReport();

  // ——— شاخص‌های کلیدی ———
  function drawKpis() {
    const rows = shown;
    const ok = rows.filter((r) => Number.isFinite(r.retMonthPct));
    const best = ok[0];
    const med = (arr) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)] : NaN);
    const medMonth = med(ok.map((r) => r.retMonthPct));
    const items = [
      ['ردیف قابل اجرا', fmt.int(rows.filter((r) => r.executable).length), `از ${fmt.int(rows.length)}`, ''],
      ['بهترین بازده ماهانه', best ? `${fmt.pct(best.retMonthPct)}٪` : '—', best?.underlying || '', best ? signTone(best.retMonthPct) : ''],
      ['میانه بازده ماهانه', `${fmt.pct(medMonth)}٪`, '', signTone(medMonth)],
      ['میانه احتمال سود', `${fmt.pct(med(rows.map((r) => r.popPct).filter(Number.isFinite)))}٪`, '', ''],
      ['میانه هزینه اجرا', fmt.money(med(rows.map((r) => r.execCost).filter(Number.isFinite))), `${fmt.int(def.legs.length)} پا`, ''],
      ['زیان نامحدود', fmt.int(rows.filter((r) => r.unlimitedLoss).length), 'ردیف', ''],
      ['عمق کامل', fmt.int(rows.filter((r) => r.quality === 'exact').length), 'ردیف مرحله دو', ''],
      ['بستانکار', fmt.int(rows.filter((r) => r.isCredit).length), 'ردیف', ''],
    ];
    root.querySelector('#kpis').innerHTML = items.map(([k, v, sub, c]) => `
      <div class="kpi"><div class="k">${k}</div><div class="v ${c}">${v}</div><div class="s">${sub}</div></div>`).join('');
  }

  // ——— پانل جزئیات ———
  let chart = null;
  let chartRange = null; // بازه زوم/پن چارت، برای نگه داشتن روی رفرش پیوسته همان ردیف
  let compareIds = new Set(); // موقعیت‌های مقایسه‌ای تیک‌خورده، برای همین ردیف انتخاب‌شده
  // قیمتِ دستیِ هر پا برای ردیفِ انتخاب‌شده. با عوض شدن ردیف پاک می‌شود:
  // «۶۰۰ ریال» برای پای یک ترکیب، برای ترکیب دیگر معنی ندارد.
  let manualPrices = {};
  function showDetail(r) {
    const sameRow = picked && picked.id === r.id;
    if (chart) chartRange = chart.view();
    if (!sameRow) { compareIds = new Set(); manualPrices = {}; }
    picked = r;
    const card = root.querySelector('#detail-card');
    card.style.display = '';
    root.querySelector('#detail-title').textContent = `${r.underlying} — ${r.legsText}`;

    const fees = { buyStock: s().feeBuyStock, sellStock: s().feeSellStock, option: s().feeOption, exercise: s().feeExercise };
    const single = isSingleExpiry(r.__legs);
    const candidates = sameUnderlyingCandidates(rows, r);
    const chartOpt = {
      fees, spot: r.S, width: 720, height: 260,
      sigma: r.sigmaUse, rFree: s().rFree, divYield: s().divYield,
      ...(sameRow && chartRange ? { initRange: chartRange } : {}),
    };
    const an = single
      ? analyzePayoff(r.__legs, r.netCash, { fees })
      : analyzeMixed(r.__legs, r.netCash, { fees, spot: r.S, sigma: r.sigmaUse, rFree: s().rFree, divYield: s().divYield });
    const grid = Array.from({ length: 11 }, (_, i) => {
      const pct = -s().shockPct * 2 + (i * s().shockPct * 4) / 10;
      const S2 = r.S * (1 + pct / 100);
      return { pct, S: S2, pnl: an.at(S2) };
    });

    const legRows = r.legPrices.map((l, at) => `
      <tr>
        <td>${l.side === 'sell' ? 'فروش' : 'خرید'} ${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت')}</td>
        <td class="n">${l.strike ? fmt.money(l.strike) : '—'}</td>
        <td class="n">${fmt.money(l.price)}</td>
        <td class="n">${fmt.money(l.mid)}</td>
        <td class="n">${Number.isFinite(l.spreadPct) ? faNum(l.spreadPct.toFixed(1)) : '—'}</td>
        <td class="n">${Number.isFinite(l.slipPct) ? faNum(l.slipPct.toFixed(2)) : '—'}</td>
        <td class="n">${fmt.int(l.filled)}</td>
        <td class="n">${fmt.int(l.short)}</td>
        <td>${l.source || '—'}</td>
        <td class="n"><input type="number" step="any" min="0" class="manual-price" data-leg="${at}"
          value="${manualPrices[at] ?? ''}" placeholder="—" style="width:7rem"></td>
      </tr>`).join('');

    const costRows = r.costRows.map((c) => `
      <tr><td>${c.leg}</td><td class="n">${fmt.money(c.commission)}</td>
      <td class="n">${fmt.money(c.crossing)}</td><td class="n">${fmt.money(c.slippage)}</td></tr>`).join('');

    const limitRows = r.sizeLimits.map((l) => `
      <tr><td>${l.what}</td><td class="n">${fmt.int(l.max)}</td>
      <td>${l.what === r.binding ? '<span class="tag warn">مقیدکننده</span>' : ''}</td></tr>`).join('');

    // قالب سود و زیان باید هم در سناریوی قطعی و هم تصویر احتمالاتی یکی باشد.
    // `signTone` برای NaN/∞ کلاس خالی می‌دهد؛ پس «—» به دروغ قرمز یا سبز
    // نمی‌شود و هیچ سود و زیانی هم برای کامل‌کردن سلول ساخته نمی‌کنیم.
    const pnlCell = (pnl) => `<td class="n ${signTone(pnl)}">${fmt.money(pnl)}</td>`;
    const scenRows = grid.map((g) => `
      <tr><td class="n">${faNum(g.pct.toFixed(0))}٪</td><td class="n">${fmt.money(g.S)}</td>
      ${pnlCell(g.pnl)}</tr>`).join('');

    // تصویر آینده — ریسک و ریوارد بر اساس صدک‌های محتمل قیمت پایه (قلم
    // الف-۱، سؤال ۳). همان مدل لگاریتم-نرمال با روند صفر که popPct هم
    // از آن می‌آید؛ مسیر واقعی قیمت نیست، توزیع آماری است.
    const horizonT = (r.horizonDays ?? r.days) / 365;
    const riskRows = [5, 25, 50, 75, 95].map((pct) => {
      const level = priceQuantile(r.S, pct / 100, horizonT, r.sigmaUse);
      return { pct, level, pnl: Number.isFinite(level) ? an.at(level) : NaN };
    }).filter((x) => Number.isFinite(x.level));
    const riskTableRows = riskRows.map((x) => `
      <tr><td class="n">${faNum(x.pct)}٪</td><td class="n">${fmt.money(x.level)}</td>
      ${pnlCell(x.pnl)}</tr>`).join('');

    root.querySelector('#detail').innerHTML = `
      <div>
        <div id="chart"></div>
        <div class="legend">
          ${an.approx ? `<span style="color:var(--warn)">${an.note}</span>` : ''}
          <span>سربه‌سری: ${an.breakevens.map((b) => fmt.money(b)).join(' , ') || '—'}</span>
          <span>بیشترین سود: ${fmt.money(an.maxProfit)}</span>
          <span>بیشترین زیان: <b style="color:${Number.isFinite(an.maxLoss) ? 'inherit' : 'var(--loss)'}">${fmt.money(an.maxLoss)}</b></span>
        </div>
        <!-- نوارِ پیوند: هر مقصد در صفحهٔ جدا باز می‌شود، پس جدولِ زنده
             پشتِ سر می‌ماند و کاربر جای خودش را از دست نمی‌دهد. -->
        <div class="detail-actions">${strategyLinkTargets(r, { strategyId: def.id }).map((item) => `
          <button class="ghost" type="button" data-link="${item.to}" title="${item.why}">${item.label}</button>`).join('')}</div>
        <div id="cmp-picker"></div>
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">قیمت و عمق هر پا</h4>
        <table class="mini">
          <thead><tr><th>پا</th><th>اعمال</th><th>قیمت اجرا</th><th>میانه</th><th>اسپرد ٪</th><th>افت ٪</th><th>پرشده</th><th>کمبود</th><th>منبع</th><th>قیمت دستی</th></tr></thead>
          <tbody>${legRows}</tbody>
        </table>
        <div id="manual-out"></div>
      </div>
      <div>
        <dl class="kv">
          <dt>جهت نقدی</dt><dd>${r.cashLabel}</dd>
          <dt>نقد خالص</dt><dd>${fmt.money(r.netCash)}</dd>
          <dt>اگر همین حالا ببندی — دفتر سفارش</dt>
          <dd>${offsetCell(r)}</dd>
          <dt>اگر با آخرین معامله تسویه کنی <span class="unit">مرجع</span></dt>
          <dd class="${signTone(r.settleLastPnl)}">${fmt.money(r.settleLastPnl)}</dd>
          <dt>اگر با قیمت پایانی تسویه کنی <span class="unit">مرجع</span></dt>
          <dd class="${signTone(r.settleClosePnl)}">${fmt.money(r.settleClosePnl)}</dd>
          <dt>سرمایه درگیر</dt><dd>${fmt.money(r.capital)}</dd>
          <dt>مبنای سرمایه</dt><dd>${r.capitalLabel}</dd>
          <dt>وجه تضمین</dt><dd>${fmt.money(r.margin)}</dd>
          <dt>تضمین شرطی</dt><dd>${fmt.money(r.conditionalMargin)}</dd>
          <dt>پوشش</dt><dd><span class="tag ${coverageInfo(r.coverage).tone}">${coverageInfo(r.coverage).label}</span></dd>
          <dt>سقف زیان</dt><dd><span class="tag ${r.unlimitedLoss ? 'loss' : 'gain'}">${r.unlimitedLoss ? 'نامحدود — ریسک‌دار' : 'محدود'}</span></dd>
          <dt>بازده دوره</dt><dd>${fmt.pct(r.retMaxPct)}٪</dd>
          <dt>بازده ماهانه</dt><dd>${fmt.pct(r.retMonthPct)}٪</dd>
          <dt>احتمال سود</dt><dd>${fmt.pct(r.popPct)}٪</dd>
          <dt>دلتا</dt><dd>${fmt.num(r.delta)}</dd>
          <dt>تتا روزانه</dt><dd>${fmt.money(r.theta)}</dd>
          <dt>تلاطم مبنا</dt><dd>${fmt.num(r.sigmaUse)}</dd>
          <dt>کیفیت داده</dt><dd>${r.qualityLabel}</dd>
        </dl>
        <p class="note" style="margin:10px 0 2px">${r.marginNote}</p>
        ${r.leggingRisk ? `<p class="note" style="color:var(--warn)">ریسک لنگ‌زدن: سفارش ترکیبی در تابلو نیست. اگر پای فروش پر شود و پای خرید نه، وجه تضمین ${fmt.money(r.conditionalMargin)} همان لحظه مطالبه می‌شود${r.leggingUnlimited ? ' و موقعیت باقی‌مانده زیان نامحدود دارد' : ''}.</p>` : ''}

        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">تفکیک هزینه اجرا — جمع ${fmt.money(r.execCost)}</h4>
        <table class="mini">
          <thead><tr><th>پا</th><th>کارمزد</th><th>عبور از اسپرد</th><th>افت مظنه</th></tr></thead>
          <tbody>${costRows}
            <tr><td>هزینه فرصت وجه تضمین</td><td class="n" colspan="3">${fmt.money(r.costFunding)}</td></tr></tbody>
        </table>

        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">سقف حجم — مقید به ${r.binding}</h4>
        <table class="mini"><tbody>${limitRows}</tbody></table>

        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">سناریو در سررسید</h4>
        <table class="mini">
          <thead><tr><th>تغییر پایه</th><th>قیمت پایه</th><th>سود و زیان</th></tr></thead>
          <tbody>${scenRows}</tbody>
        </table>

        ${riskTableRows ? `
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">تصویر آینده — ریسک و ریوارد احتمالاتی</h4>
        <p class="note" style="color:var(--warn)">توزیع لگاریتم-نرمال با روند صفر — همان مدلی که «احتمال سود» از آن
          می‌آید. مسیر واقعی قیمت نیست: دامنه نوسان روزانه، توقف نماد، و پرش‌های بازار ایران این مدل را نمی‌بیند.</p>
        <table class="mini">
          <thead><tr><th>احتمال زیر این قیمت ماندن</th><th>قیمت پایه</th><th>سود و زیان</th></tr></thead>
          <tbody>${riskTableRows}</tbody>
        </table>` : ''}
      </div>`;

    // ——— مقایسه با موقعیت‌های دیگر هم‌نماد (قلم الف-۱ بک‌لاگ) ———
    // «مشابه» یعنی فقط هم‌نماد؛ محدودتر کردنش گزینه‌های جالب را پنهان می‌کرد.
    // منحنی مقایسه‌ای فقط از payoffAt می‌آید، نه رسم کامل — روی مقیاس همین
    // نمودار سوار می‌شود، نه نمودار جدا.
    compareIds = new Set([...compareIds].filter((id) => candidates.some((c) => c.id === id)));
    function mountChart() {
      const compare = candidates
        .filter((c) => compareIds.has(c.id))
        .slice(0, MAX_COMPARE)
        .map((c) => ({
          at: payoffAt(c.__legs, c.netCash, { fees, spot: c.S, sigma: c.sigmaUse, rFree: s().rFree, divYield: s().divYield }),
          label: compareLabel(c),
          full: compareFullLabel(c),
        }));
      chart?.destroy();
      chart = mountPayoff(root.querySelector('#chart'), r.__legs, r.netCash, { ...chartOpt, compare });
    }
    function renderCmpPicker() {
      const box = root.querySelector('#cmp-picker');
      if (!candidates.length) { box.innerHTML = ''; return; }
      box.innerHTML = `
        <p class="note" style="margin:10px 0 4px">مقایسه با موقعیت‌های دیگر همین نماد — حداکثر ${fmt.int(MAX_COMPARE)} هم‌زمان</p>
        <div class="cmp-list">
          ${candidates.map((c) => {
            const checked = compareIds.has(c.id);
            const disabled = !checked && compareIds.size >= MAX_COMPARE;
            return `<label class="cmp-row">
              <input type="checkbox" data-id="${c.id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
              <span>${c.strategy ? `${c.strategy} — ` : ''}${c.legsText}</span>
            </label>`;
          }).join('')}
        </div>`;
      box.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          if (e.target.checked) compareIds.add(e.target.dataset.id); else compareIds.delete(e.target.dataset.id);
          renderCmpPicker();
          mountChart();
        });
      });
    }
    renderCmpPicker();

    // ——— قیمت دستی: «اگر بتوانم این پا را با این قیمت بگیرم» ———
    //
    // نتیجه **کنارِ** عددِ بازار می‌نشیند، نه جایش. اگر جایگزین می‌شد،
    // چند دقیقه بعد کسی نمی‌دانست کدام عدد از بازار آمده و کدام را خودش
    // تایپ کرده.
    const manualOut = root.querySelector('#manual-out');
    function drawManual() {
      const cmp = manualCompare(r.__legs || [], manualPrices, { fees });
      // ── جهتِ «بهتر»، سطر به سطر ────────────────────────────────────
      //
      // `signTone(b - a)` برای «نقد خالص» و «بیشترین سود» درست است، ولی
      // برای «بیشترین زیان» وارونه: موتور زیان را **اندازه** می‌نویسد
      // (عدد مثبت)، پس کم‌شدنش خبرِ خوب است و با تفاضلِ خام قرمز
      // درمی‌آمد. عکس گرفتن همین را نشان داد.
      const line = (label, pick, { money = true, lowerIsBetter = false } = {}) => {
        const a = pick(cmp.base), b = pick(cmp.manual);
        const text = (value) => (money ? fmt.money(value) : (Number.isFinite(value) ? fmt.num(value) : '—'));
        const delta = lowerIsBetter ? a - b : b - a;
        return `<tr><td>${label}</td><td class="n">${text(a)}</td>
          <td class="n ${cmp.anyManual ? signTone(delta) : ''}">${text(b)}</td></tr>`;
      };
      const beText = (side) => (side.breakevens.length ? side.breakevens.map((b) => fmt.money(b)).join(' , ') : '—');
      manualOut.innerHTML = `
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">اگر با قیمت دستی پر شود</h4>
        <table class="mini">
          <thead><tr><th>سنجه</th><th>با قیمت بازار</th><th>با قیمت تو</th></tr></thead>
          <tbody>
            ${line('نقد خالص', (x) => x.netCash)}
            ${line('بیشترین سود', (x) => x.maxProfit)}
            ${line('بیشترین زیان', (x) => x.maxLoss, { lowerIsBetter: true })}
            ${line('سود به زیان', (x) => x.rewardRisk, { money: false })}
            <tr><td>سربه‌سری</td><td class="n">${beText(cmp.base)}</td>
              <td class="n">${beText(cmp.manual)}</td></tr>
          </tbody>
        </table>
        <p class="note"${cmp.anyManual ? ' style="color:var(--warn)"' : ''}>${manualNote(cmp)}</p>`;
    }
    drawManual();
    for (const input of root.querySelectorAll('.manual-price')) {
      input.addEventListener('input', (event) => {
        const at = Number(event.target.dataset.leg);
        const raw = event.target.value;
        if (raw === '') delete manualPrices[at]; else manualPrices[at] = raw;
        drawManual();
      });
    }

    // ——— سناریو، حساسیت، عمق دفتر ———
    disposeScen?.();
    disposeScen = mountScenarioPanel(root.querySelector('#scen-wrap'), r, {
      rFree: s().rFree, divYield: s().divYield, yearDays: s().dayCountYear,
      units: unitsOf(r),
    });

    // ——— پیوند به بقیهٔ برنامه ———
    //
    // بک‌تست نقشهٔ خودش را دارد (تاریخ و مبنای ورود و خروج)، بقیه نقشهٔ
    // مشترک را. هر دو از یک مسیر بیرون می‌روند تا رفتارِ «صفحهٔ جدا» یکی
    // بماند.
    for (const button of root.querySelectorAll('[data-link]')) {
      button.addEventListener('click', () => {
        const to = button.dataset.link;
        const plan = to === 'backtest'
          ? handoffPlan(r, {
            from: 'strategy', strategyId: def.id, strategyName: def.name,
            units: unitsOf(r), entryBasis: 'LAST', exitBasis: 'LAST',
          })
          : strategyLinkPlan(r, { to, strategyId: def.id, strategyName: def.name, units: unitsOf(r) });
        if (plan) goHandoff(state, plan, to);
      });
    }

    // نمودار بعد از نشستن قالب سوار می‌شود، چون به اندازه واقعی قاب نیاز دارد
    mountChart();
    // ردیفِ تازه یعنی ردِ جلسهٔ تازه — دکمه‌اش همین‌جا زنده می‌شود.
    trailReady();

    // ——— ماشین زمان (قلم پ-۴ بک‌لاگ) ———
    const tmWrap = root.querySelector('#tm-wrap');
    tmWrap.innerHTML = `<button class="ghost" type="button" id="tm-btn">ماشین زمان — اگر همین ترکیب را چند روز پیش می‌گرفتم</button>
      <div id="tm-out"></div>`;
    tmWrap.querySelector('#tm-btn').addEventListener('click', (e) => runTimeMachine(r, tmWrap.querySelector('#tm-out'), e.currentTarget));
  }

  async function runTimeMachine(r, out, btn) {
    if (!r.uaIns) { out.innerHTML = '<p class="note">نماد پایه این ردیف شناخته نشد.</p>'; return; }
    if (!(r.sigmaUse > 0)) { out.innerHTML = '<p class="note">تلاطم مبنا نامعتبر است؛ شبیه‌سازی ممکن نیست.</p>'; return; }
    if (btn.disabled) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'در حال محاسبه…';
    out.innerHTML = '<p class="note">در حال دریافت تاریخچه قیمت پایه…</p>';
    try {
      let res;
      try {
        res = await (await fetch(`/api/daily?ins=${r.uaIns}&n=${s().volDays}`)).json();
      } catch (e) {
        out.innerHTML = `<p class="note" style="color:var(--loss)">دریافت تاریخچه ناموفق: ${e.message}</p>`;
        return;
      }
      if (res.error) {
        out.innerHTML = `<p class="note" style="color:var(--loss)">دریافت تاریخچه ناموفق: ${res.error}</p>`;
        return;
      }
      const closes = (res.rows || []).filter((x) => x.close > 0);
      if (closes.length < 2) { out.innerHTML = '<p class="note">تاریخچه کافی برای این نماد نیست.</p>'; return; }

      const tm = timeMachine(r.__legs, closes, {
        daysToday: r.days, sigma: r.sigmaUse, rFree: s().rFree, divYield: s().divYield,
        yearDays: s().dayCountYear, contractSize: s().contractSize,
      });
      const rows2 = tm.map((x) => `
        <tr><td>${jalaliFromDEven(x.date)}</td><td class="n">${fmt.money(x.S)}</td>
          <td class="n">${fmt.int(x.daysLeft)}</td>
          ${pnlCell(x.pnl)}</tr>`).join('');
      out.innerHTML = `
        <p class="note" style="color:var(--warn)">شبیه‌سازی بلک-شولز با تلاطم امروز (${fmt.num(r.sigmaUse)})
          روی قیمت پایانی تاریخی پایه — نه قیمت واقعی اختیار در آن روز. دیده‌بان تاریخچه مظنه ذخیره نمی‌کند،
          پس این عدد راهنماست، ادعای اجرا ندارد.</p>
        <table class="mini">
          <thead><tr><th>تاریخ</th><th>قیمت پایه آن‌روز</th><th>روز تا سررسید آن‌روز</th><th>سود/زیان شبیه‌سازی‌شده</th></tr></thead>
          <tbody>${rows2}</tbody>
        </table>`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // ——— اجرای اسکن ———
  let timer = null;
  const runBtn = root.querySelector('#run');
  const progressWrap = root.querySelector('#progress');
  const progressFill = root.querySelector('#progress-fill');
  const setProgress = (pct) => {
    if (pct == null) { progressWrap.style.display = 'none'; return; }
    progressWrap.style.display = '';
    progressFill.style.width = `${pct}%`;
  };
  async function run() {
    if (busy) return;
    const keys = picker.selected();
    if (!keys.length) { setStatus('نمادی انتخاب نشده'); return; }
    busy = true;
    runBtn.disabled = true;
    runBtn.textContent = 'در حال اسکن…';
    setStatus('مرحله یک — غربال روی سطح اول…');
    setProgress(5);
    if (!hasScanned) { hasScanned = true; table.setEmptyMessage(null); }
    table.setLoading(true);
    try {
      await runScan({
        defId: def.id, uaKeys: keys, settings: s(), qty,
        onStage: (stage, res) => {
          if (res.error) { setStatus(`خطا: ${res.error}`); setProgress(null); table.setLoading(false); return; }
          if (stage === 'one') {
            rows = res.rows;
            funnelBar(root.querySelector('#funnel'), res.funnel);
            table.set(visibleRows());
            drawKpis();
            drawFilterReport();
            setStatus(`مرحله یک در ${fmt.int(res.ms)} میلی‌ثانیه — ${fmt.int(res.total)} ردیف، ${fmt.int(rows.length)} نمایش. مرحله دو…`);
            setProgress(50);
          } else {
            const byId2 = new Map(res.rows.map((r) => [r.id, r]));
            rows = rows.map((r) => byId2.get(r.id) || r);
            // اسکن پیوسته: ردیفی که مبنای رتبه‌بندی‌اش نسبت به آخرین اسکن
            // تمام‌شده عوض شده، فلش می‌گیرد — همان قرارداد نیمه‌کاره
            // rowClass در table.mjs، حالا با چیزی که واقعاً می‌نویسدش.
            const changed = changedIds(lastFullRows, rows, s().rankBy);
            for (const r of rows) r.__flash = changed.has(r.id);
            // افت مظنه رتبه‌ها را زیر و رو می‌کند، پس دوباره مرتب می‌شود
            // — ولی با **همان ستونی که کاربر رویش نشسته**، نه با مبنای
            // رتبه‌بندیِ تنظیمات. پیش از این هر تیکِ رصدِ زنده ترتیب را
            // پس می‌گرفت: کسی که روی «فاصله تا سربه‌سری» مرتب کرده بود،
            // چند ثانیه بعد بی‌آنکه چیزی کلیک کند سر از «بازده ماهانه»
            // درمی‌آورد.
            const keepSort = table.sortKey();
            table.set(visibleRows());
            table.sortBy(keepSort);
            drawKpis();
            drawFilterReport();
            if (picked) { const f = byId2.get(picked.id); if (f) showDetail(f); }
            setStatus(`مرحله دو کامل — عمق ${fmt.int(res.asked || 0)} نماد گرفته شد. ${fmt.int(rows.length)} ردیف.`);
            setProgress(100);
            lastFullRows = rows;
            clearTimeout(flashTimer);
            if (changed.size) {
              // rows را جدا می‌گیریم، نه از بستار — اگر تیک بعدی زودتر از
              // ۱۷۰۰ میلی‌ثانیه برسد، rows بیرونی عوض شده ولی این آرایه
              // همان فهرستی می‌ماند که واقعاً فلش گرفت.
              const flashedRows = rows;
              flashTimer = setTimeout(() => {
                for (const r of flashedRows) r.__flash = false;
                table.redraw();
              }, 1700);
            }
          }
        },
      });
    } finally {
      busy = false;
      runBtn.disabled = false;
      runBtn.textContent = 'اسکن';
      if (progressWrap.style.display !== 'none') setProgress(100);
      setTimeout(() => setProgress(null), 400);
    }
  }

  runBtn.addEventListener('click', run);
  const refreshEl = root.querySelector('#c-refresh');
  refreshEl.value = String(refreshSec);
  const armTimer = () => {
    clearInterval(timer);
    if (auto.checked) timer = setInterval(run, refreshSec * 1000);
  };
  refreshEl.addEventListener('change', () => {
    const v = Math.round(Number(refreshEl.value));
    refreshSec = Number.isFinite(v) ? Math.min(600, Math.max(5, v)) : refreshSec;
    refreshEl.value = String(refreshSec);
    armTimer();
  });
  auto.addEventListener('change', () => {
    if (auto.checked) run();
    armTimer();
  });

  // اشتراک عکس لحظه‌ای فقط تا وقتی این تب باز است
  const offWatch = api.subscribeWatch((w) => {
    pushRows(w, !w.changed);
  });

  // ——— رصد تاریخی: همان جدول، تاریخِ دیگر (بندِ ۸) ———
  //
  // انتخابگرِ نماد مشترک است، پس «همین ترکیبی که زنده می‌بینم، سه هفته
  // پیش چه شکلی بود» یک کلیک است نه چیدنِ دوبارهٔ همه‌چیز. آنچه عوض
  // می‌شود فقط منبعِ قیمت است؛ ستون‌ها، فیلترها و پانل جزئیات همان‌اند.
  const hBasis = root.querySelector('#h-basis');
  const hStatus = root.querySelector('#h-status');
  const hNote = root.querySelector('#h-note');
  const hRun = root.querySelector('#h-run');
  const hDates = root.querySelector('#h-dates');
  let hDate = 0;
  let hLoadedFor = '';
  let hBusy = false;

  const hSetStatus = (text) => { hStatus.textContent = text; };

  /**
   * روزهای قابل انتخاب، از سری روزانهٔ خودِ نماد پایه.
   *
   * تقویمِ کامل نمی‌سازیم: روزی که نماد داده ندارد، انتخابش کاربر را به
   * جدولِ خالی می‌برد بی آنکه بداند چرا.
   */
  async function refreshHistoryDates() {
    const key = picker.selected()[0];
    if (!key) {
      hLoadedFor = ''; hDate = 0; hRun.disabled = true;
      hDates.innerHTML = '';
      hSetStatus('اول نماد پایه را انتخاب کن.');
      return;
    }
    if (hLoadedFor === key) return;
    hLoadedFor = key;
    hDate = 0;
    hRun.disabled = true;
    hSetStatus('در حال گرفتن روزهای موجود…');
    try {
      const dates = await historyDates(key);
      if (hLoadedFor !== key) return;                 // انتخاب وسط راه عوض شد
      mountDateWheel(hDates, dates, dates.at(-1) ?? null, (date) => {
        hDate = Number(date) || 0;
        hRun.disabled = !hDate;
        if (hDate) hSetStatus(`روز انتخاب‌شده: ${historyDateLabel(hDate)}`);
      }, { empty: 'این نماد در بازهٔ اخیر روزِ داده‌داری ندارد.' });
      hDate = dates.at(-1) ?? 0;
      hRun.disabled = !hDate;
      hSetStatus(dates.length
        ? `${fmt.int(dates.length)} روز داده‌دار — روزی را انتخاب کن.`
        : 'برای این نماد روزی با داده پیدا نشد.');
    } catch (error) {
      if (hLoadedFor !== key) return;
      hLoadedFor = '';
      logError('روزهای تاریخی استراتژی', error);
      hSetStatus(`گرفتن روزها ناموفق: ${error.message}`);
    }
  }

  async function runHistory() {
    if (hBusy) return;
    const key = picker.selected()[0];
    if (!key || !hDate) { hSetStatus('نماد و روز را انتخاب کن.'); return; }
    hBusy = true;
    hRun.disabled = true;
    const label = hRun.textContent;
    hRun.textContent = 'در حال ساخت…';
    hSetStatus(`در حال ساخت جدول ${historyDateLabel(hDate)}…`);
    table.setLoading(true);
    if (!hasScanned) { hasScanned = true; table.setEmptyMessage(null); }
    try {
      const out = await runHistoryScan({
        def, uaIns: key, date: hDate, basis: hBasis.value, settings: s(), qty,
      });
      rows = out.rows || [];
      funnelBar(root.querySelector('#funnel'), out.funnel);
      const keepSort = table.sortKey();
      table.set(visibleRows());
      table.sortBy(keepSort);
      drawKpis();
      drawFilterReport();
      // پانل جزئیاتِ ردیفِ زندهٔ قبلی روی دادهٔ روزِ دیگر معنی ندارد.
      picked = null;
      root.querySelector('#detail-card').style.display = 'none';
      trailReady();
      hNote.textContent = [out.note, out.universeNote].filter(Boolean).join(' — ');
      hSetStatus(`${historyDateLabel(hDate)} — ${fmt.int(rows.length)} ردیف.`);
      setStatus(`جدول از ${historyDateLabel(hDate)} ساخته شد — ${fmt.int(rows.length)} ردیف.`);
    } catch (error) {
      table.setLoading(false);
      logError('رصد تاریخی استراتژی', error);
      hSetStatus(`ساخت جدول ناموفق: ${error.message}`);
    } finally {
      hBusy = false;
      hRun.disabled = !hDate;
      hRun.textContent = label;
    }
  }

  refreshDates = () => { hLoadedFor = ''; refreshHistoryDates(); };
  hRun.addEventListener('click', runHistory);
  hBasis.addEventListener('change', () => { if (rows.length && hDate) runHistory(); });

  // ——— ردِ جلسه: یک ترکیب، از بازگشایی تا حالا (بندِ ۱۰) ———
  //
  // ورودی‌اش ردیفِ انتخاب‌شدهٔ همان جدول است، پس «این ترکیب امروز چه
  // کرده» ادامهٔ همان کلیکی است که جزئیات را باز کرد — نه چیدنِ دوباره.
  // ارتفاعِ صریحِ `#t-chart` در قالب بالا حدس نیست: `mountChart` بومِ
  // echarts را به اندازهٔ ظرف می‌سازد و ظرفِ بی‌ارتفاع بومِ صفر می‌دهد —
  // نموداری که کشیده می‌شود ولی دیده نمی‌شود. قاعده‌های `.gap-chart` به
  // پوستهٔ `gap-skin` محدودند و به این تب نمی‌رسند.
  const tGrain = root.querySelector('#t-grain');
  const tRun = root.querySelector('#t-run');
  const tStatus = root.querySelector('#t-status');
  const tNote = root.querySelector('#t-note');
  const tTable = root.querySelector('#t-table');
  let tBusy = false;

  /** دکمه فقط وقتی زنده است که ردیفی انتخاب شده و کدهایش را داریم. */
  function trailReady() {
    const ok = !!picked && (picked.legIns || []).length > 0;
    tRun.disabled = !ok || tBusy;
    if (!picked) tStatus.textContent = 'هنوز ردیفی انتخاب نشده — از جدول یکی را کلیک کن.';
    else if (!ok) tStatus.textContent = 'این ردیف کد ابزارِ پا ندارد، پس نوارِ معامله‌اش خوانده نمی‌شود.';
    else tStatus.textContent = `${picked.underlying} — ${picked.legsText}`;
  }

  async function runTrail() {
    if (tBusy || !picked) return;
    const row = picked;
    tBusy = true;
    tRun.disabled = true;
    const label = tRun.textContent;
    tRun.textContent = 'در حال خواندن نوار…';
    tStatus.textContent = 'در حال گرفتن ریزمعاملهٔ پاها…';
    try {
      const codes = [...(row.legIns || [])];
      if (row.uaIns) codes.push(String(row.uaIns));
      const { tape, at, errors } = await liveTapeFor(codes);
      // سقفِ زمان، ساعتِ همین لحظه است نه پایان جلسه: ستونی که هنوز
      // نرسیده، ستونِ خالی است نه ستونِ بی‌معامله، و خطِ صافِ تا انتهای
      // روز را خواننده «بازار تکان نخورد» می‌خواند.
      const now = new Date(at || Date.now());
      const until = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const fees = { buyStock: s().feeBuyStock, sellStock: s().feeSellStock, option: s().feeOption };
      const trail = sessionTrail({
        legs: row.__legs || [], tapeByIns: tape, grain: tGrain.value,
        fees, uaIns: String(row.uaIns || ''), until,
      });
      const points = trail.points.map((point) => ({ label: point.label, current: point.netCash }));
      await mountEcharts(root.querySelector('#t-chart'),
        gapPathChart({ points }, { title: `نقد خالصِ ورود — ${row.legsText}` }),
        { empty: 'هیچ لحظه‌ای عددِ کامل ندارد.' });
      const failed = Object.keys(errors || {});
      tNote.textContent = [
        trailNote(trail),
        failed.length ? `${fmt.int(failed.length)} پا نوارِ معامله‌اش خوانده نشد.` : '',
      ].filter(Boolean).join(' ');
      // ── کارنامهٔ هر پا: همیشه، نه فقط وقتی نمودار ساخته شد ──────────
      //
      // ترکیب چهارپا با یک پای بی‌معامله هیچ نقطهٔ کاملی ندارد. تا امروز
      // خروجی‌اش یک جملهٔ بن‌بست بود؛ حالا این جدول می‌گوید **کدام** پا
      // ساکت است، تا خواننده بداند مشکل از بازار است نه از برنامه.
      const clock = (second) => (Number.isFinite(second)
        ? faDigits(`${String(Math.floor(second / 3600)).padStart(2, '0')}:${String(Math.floor((second % 3600) / 60)).padStart(2, '0')}`)
        : '—');
      // کلاسِ رنگ روی **سلول** می‌نشیند نه روی ردیف: قاعدهٔ عمومیِ پوسته
      // `td.loss` است (`ui/style.css`)، پس `class="loss"` روی `<tr>`
      // بی‌اثر بود. رنگ هم تنها نشانه نیست — واژه هم نوشته می‌شود، چون
      // رنگ به تنهایی برای کوررنگ کافی نیست.
      const legHtml = (trail.legReport || []).map((leg) => `
        <tr>
          <td>${leg.name}</td><td class="n">${fmt.int(leg.trades)}</td>
          <td class="n">${clock(leg.first)}</td><td class="n">${clock(leg.last)}</td>
          <td class="${leg.silent ? 'loss' : ''}">${leg.silent ? '<b>امروز معامله نشده</b>' : 'فعال'}</td></tr>`).join('');
      const rowsHtml = trail.points.filter((point) => point.complete).map((point) => `
        <tr><td>${point.label}</td><td class="n">${fmt.money(point.netCash)}</td>
        <td class="n">${fmt.int(Math.round(point.maxAgeSec / 60))}</td>
        <td class="n">${fmt.int(Math.round(point.spanSec / 60))}</td></tr>`).join('');
      tTable.innerHTML = `
        ${legHtml ? `
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">کارنامهٔ هر پا در جلسهٔ امروز</h4>
        <table class="mini">
          <thead><tr><th>پا</th><th>تعداد معامله</th><th>اولین</th><th>آخرین</th><th>وضعیت</th></tr></thead>
          <tbody>${legHtml}</tbody>
        </table>` : ''}
        ${rowsHtml ? `
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">لحظه‌های دارای عددِ کامل</h4>
        <table class="mini">
          <thead><tr><th>ساعت</th><th>نقد خالص</th>
            <th>سنِ کهنه‌ترین پا <span class="unit">دقیقه</span></th>
            <th>فاصلهٔ پاها <span class="unit">دقیقه</span></th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>` : ''}`;
      const mute = (trail.legReport || []).filter((leg) => leg.silent);
      tStatus.textContent = trail.complete
        ? `${fmt.int(trail.complete)} لحظهٔ کامل از ${fmt.int(trail.moments)} — تغییر ${fmt.money(trail.change)}`
        : mute.length
          ? `${fmt.int(mute.length)} پا امروز معامله نشده (${mute.map((leg) => leg.name).join('، ')}) — جدول زیر را ببین.`
          : 'در هیچ لحظه‌ای همهٔ پاها با هم قیمت نداشتند.';
    } catch (error) {
      logError('ردِ جلسهٔ استراتژی', error);
      tStatus.textContent = `خواندن نوار ناموفق: ${error.message}`;
    } finally {
      tBusy = false;
      tRun.textContent = label;
      trailReady();
    }
  }

  tRun.addEventListener('click', runTrail);
  trailReady();

  // ——— نوار زیرتب: کدام منبع جدول را می‌سازد ———
  //
  // رفتن به «رصد تاریخی» رصدِ زنده را می‌خواباند. بی این، حلقه چند ثانیه
  // بعد جدولِ تاریخی را با دادهٔ امروز پاک می‌کرد و کاربر نمی‌فهمید چرا.
  mountSubtabs(root.querySelector('#modes'), [
    { id: 'live', label: 'رصد زنده', hint: 'تابلوی همین حالا، با نوسازی دوره‌ای' },
    { id: 'history', label: 'رصد تاریخی', hint: 'همان ستون‌ها، با قیمتِ یک روزِ گذشته' },
    { id: 'trail', label: 'ردِ جلسه', hint: 'یک ترکیب، از بازگشایی تا همین لحظه' },
  ], {
    root,
    onChange: (id) => {
      if (id === 'history') {
        if (auto.checked) { auto.checked = false; armTimer(); setStatus('رصد زنده خوابید — جدول حالا از تاریخ ساخته می‌شود.'); }
        refreshHistoryDates();
      }
      if (id === 'trail') trailReady();
    },
  });

  setStatus();
  return () => { offWatch(); offChain(); picker.dispose?.(); clearInterval(timer); clearTimeout(flashTimer); chart?.destroy(); disposeScen?.(); };
}
