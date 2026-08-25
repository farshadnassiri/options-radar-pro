// سفره پر برکت بازار — شبیه‌ساز سفر در زمان با کاربر در حلقه.
//
// این تب بک‌تست نیست. بک‌تست می‌پرسد «اگر این قاعده را اجرا می‌کردم چه
// می‌شد؟» و جوابش را یک‌جا می‌دهد. اینجا کاربر به یک لحظه در گذشته منتقل
// می‌شود، فقط داده تا همان لحظه را می‌بیند، **نظرش را می‌نویسد**، موقعیت
// می‌سازد، **انتظارش را قفل می‌کند**، و بعد جلو می‌رود و می‌بیند چه شد.
//
// هدف یادگیری است نه سیگنال. پس محصول اصلی این تب، سود و زیان نیست؛
// تجزیهٔ «چرا سود یا زیان رخ داد» است — و مهم‌تر از آن، فاصلهٔ بین آنچه
// کاربر انتظار داشت و آنچه شد.
//
// ═══ هیچ داده‌ای اینجا مستقیم گرفته نمی‌شود ═══
//
// همهٔ داده از `core/time-gate.mjs` رد می‌شود و بارگذارهایش در
// `ui/bereket-data.mjs` است. این تب حتی یک `fetch` ندارد. اگر داشت، بندِ
// اول مشخصات — که هیچ چیزی از بعد از لحظهٔ جاری به کاربر نرسد — به یک
// خواهش تبدیل می‌شد.
//
// ═══ چه چیزی در این فاز هست و چه نیست ═══
//
// ساختار را کاربر خودش از فهرست برمی‌دارد. موتور پیشنهاد و پرتفوی سایه
// فاز بعدی‌اند و این تب جایشان را باز گذاشته. عمدی است: ماشینِ جلسه —
// قفل انتظار، پرش با رویداد میانی، خروجِ اجراشدنی — باید پیش از موتور
// رتبه‌بندی درست کار کند، وگرنه موتور روی زمینِ لرزان می‌نشیند.

import { CATALOG, byId, buildLegs } from '/strategies/catalog.mjs';
import { buildChain } from '/core/chain.mjs';
import { feesOf, marginParamsOf } from '/core/settings.mjs';
import { flattenActiveContracts, historyDateLabel, normalizeHistoryDate } from '/core/history.mjs';
import { ivParams } from '/core/leg-iv.mjs';
import { createTimeGate } from '/core/time-gate.mjs';
import {
  tradingDays, snapToTradingDay, shiftTradingDays, moment, momentsBetween,
  STEPS, INTRADAY_START_SECOND, INTRADAY_END_SECOND,
} from '/core/trading-calendar.mjs';
import { regimeSeries, regimeAt, regimeLabel, regimeRuleText, stratifiedPick } from '/core/regime.mjs';
import {
  blankSession, recordView, lockExpectation, canAdvance, advanceTo, recordEvent,
  closeSession, sessionSummary, lastDecision, VIEW_DIRECTIONS, IV_VIEWS, SESSION_STATES,
  RIAL_PER_TOMAN,
} from '/core/bereket-session.mjs';
import { executableAt } from '/core/bereket-exec.mjs';
import { markMoment, marginAt } from '/core/bereket-value.mjs';
import { decomposePnl } from '/core/bereket-pnl.mjs';
import {
  EXIT_RULES, EXIT_RULE_BY_KEY, NO_OPTION_STOP_NOTE,
  walkMoments, attemptClose, makeEvent, eventSummary,
} from '/core/bereket-events.mjs';
import { aliasMap, indexSeries, moneynessLabel, sizeLabel, dayLabel, leakCheck, reveal } from '/core/bereket-anon.mjs';
import { bookAt } from '/core/book-history.mjs';
import { markAt } from '/core/intraday-mark.mjs';
import * as feed from '/ui/bereket-data.mjs';
import { chart } from '/ui/track-chart.mjs';
import { fmt, faDigits } from '/ui/fmt.mjs';
import { logError } from '/ui/errlog.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const fin = (value) => Number.isFinite(Number(value));
const money = (value) => (fin(value) ? fmt.money(value) : '—');
const small = (value) => (fin(value) ? fmt.small(Number(value)) : '—');
const int = (value) => (fin(value) ? fmt.int(value) : '—');
const pctCell = (value) => (fin(value) ? `${fmt.pct(value)}٪` : '—');
const nameOf = (entity, fallback = 'بدون نام') => {
  const value = String(entity?.name || '').trim();
  return value && value !== String(entity?.ins || '') ? value : fallback;
};
const errorText = (error, fallback) => (/fetch failed|network|failed to fetch/i.test(String(error?.message || error))
  ? 'اتصال به منبع داده برقرار نشد.' : (String(error?.message || '').trim() || fallback));

const table = (headers, rows, empty = 'داده‌ای نیست.') => (rows.length
  ? `<table class="history-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.join('')}</tr>`).join('')}</tbody></table>`
  : `<p class="empty-note">${esc(empty)}</p>`);
const td = (html, tone = '') => `<td${tone ? ` class="${tone}"` : ''}>${html}</td>`;
const kpis = (items) => items.map(([label, value, tone = '']) => `<div class="kpi"><span>${esc(label)}</span><strong class="${tone}">${value}</strong></div>`).join('');
const headBlock = (eyebrow, title, note = '') => `<div class="section-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div>${note ? `<span>${esc(note)}</span>` : ''}</div>`;

/** ساعت‌های شروع پیشنهادی. سند خواسته ابتدا، میانه و پایان جلسه. */
const START_HOURS = [
  [INTRADAY_START_SECOND, 'ابتدای جلسه — ۰۹:۰۰'],
  [10 * 3600 + 1800, 'میانهٔ جلسه — ۱۰:۳۰'],
  [INTRADAY_END_SECOND, 'پایان جلسه — ۱۲:۳۰'],
];

export async function mount(root, { state }) {
  let chain = new Map();
  let ua = null;
  let contracts = [];
  let baseRows = [];            // سری روزانهٔ کامل پایه (فقط برای ساخت تقویم و انتخاب تاریخ)
  let calendar = [];
  let regimeRows = [];
  let session = null;
  let gate = null;
  let aliases = {};
  let position = null;          // { legs, size, entryPrices, entryExec, openedAt }
  let rules = [];
  let track = [];
  let events = [];
  let lastStep = null;

  const $ = (id) => root.querySelector(`#${id}`);
  const ivP = () => ivParams(state.settings, {});
  const fees = () => feesOf(state.settings);
  const marginP = () => marginParamsOf(state.settings);
  const anonOn = () => !!session?.anonymous;
  const capitalRial = () => Number(state.settings.bkCapitalToman || 0) * RIAL_PER_TOMAN;

  root.innerHTML = `
  <section class="backtest-hero"><div><p class="eyebrow">یادگیری، نه سیگنال</p><h1>سفره پر برکت بازار</h1><p>به یک لحظه در گذشته برو، فقط داده تا همان لحظه را ببین، نظرت را بنویس، موقعیت بساز، انتظارت را قفل کن، و جلو برو.</p></div><span id="bk-hero-state">جلسه‌ای باز نیست</span></section>

  <section class="card" id="bk-start-card"><div class="section-head"><div><p class="eyebrow">گام اول</p><h2>شروع جلسه</h2></div><b id="bk-status" role="status" aria-live="polite">در حال دریافت نمادها…</b></div>
    <div class="backtest-form">
      <label>نماد پایه<select id="bk-base"><option value="">در حال دریافت…</option></select></label>
      <label>انتخاب لحظهٔ شروع<select id="bk-mode">
        <option value="strat">تصادفی لایه‌بندی‌شده</option>
        <option value="manual">دستی</option>
      </select></label>
      <label>ساعت شروع<select id="bk-hour">${START_HOURS.map(([sec, label]) => `<option value="${sec}">${esc(label)}</option>`).join('')}</select></label>
      <label id="bk-date-wrap" hidden>تاریخ شروع<select id="bk-date"></select></label>
      <label class="check"><input type="checkbox" id="bk-anon" checked> حالت ناشناس</label>
      <label class="check"><input type="checkbox" id="bk-practice"> جلسهٔ تمرینی — از آمار بیرون</label>
      <button type="button" class="primary" id="bk-start" disabled>شروع جلسه</button>
    </div>
    <p class="backtest-table-note" id="bk-regime-note"></p>
    <p class="backtest-table-note" id="bk-survivor-note">فهرست قراردادها از دیده‌بان <b>امروز</b> ساخته می‌شود، پس قراردادی که داخل همین بازه سررسید شده در جلسه دیده نمی‌شود. این سوگیری بقاست و تا وقتی دیده‌بان روزانه ضبط نشود، برطرف نمی‌شود — عدد جلسه با آن خوش‌بین‌تر از واقعیت است.</p>
  </section>

  <section id="bk-live" hidden>
    <section class="card">${headBlock('لحظهٔ جاری', 'تصویر بازار', 'فقط تا همین لحظه')}
      <div class="backtest-kpis" id="bk-now-kpis"></div>
      <div id="bk-now-chart" class="backtest-chart"></div>
      <p class="backtest-table-note" id="bk-anon-note"></p>
    </section>

    <section class="card" id="bk-view-card">${headBlock('گام دوم', 'نظرت چیست؟', 'اجباری، پیش از ساختن موقعیت')}
      <div class="backtest-form">
        <label>جهت<select id="bk-dir">${Object.entries(VIEW_DIRECTIONS).map(([key, label]) => `<option value="${key}">${esc(label)}</option>`).join('')}</select></label>
        <label>بزرگی حرکت مورد انتظار<input id="bk-move" type="number" step="0.5" value="5"><span class="unit">درصد</span></label>
        <label>افق<input id="bk-horizon" type="number" min="1" max="120" step="1" value="10"><span class="unit">روز معاملاتی</span></label>
        <label>درجهٔ اطمینان<input id="bk-conf" type="range" min="0" max="100" step="5" value="60"><output id="bk-conf-out">۶۰٪</output></label>
        <label>تلاطم ضمنی<select id="bk-ivview">${Object.entries(IV_VIEWS).map(([key, label]) => `<option value="${key}">${esc(label)}</option>`).join('')}</select></label>
        <label>نگاه کلان<input id="bk-macro" type="text" placeholder="اختیاری"></label>
      </div>
      <label class="wide">دلیل — اجباری<textarea id="bk-reason" rows="2" placeholder="چرا این نظر را داری؟ ماه‌ها بعد، همین جمله تنها چیزی است که هنوز می‌ارزد."></textarea></label>
      <button type="button" class="primary" id="bk-save-view">ثبت نظر</button>
      <p class="backtest-table-note" id="bk-view-note"></p>
    </section>

    <section class="card" id="bk-build-card" hidden>${headBlock('گام سوم', 'ساختن موقعیت', 'قیمت از دفتر همان لحظه')}
      <div class="backtest-form">
        <label>ساختار<select id="bk-structure"></select></label>
        <label>تعداد قرارداد<input id="bk-size" type="number" min="1" step="1" value="1"></label>
        <button type="button" class="ghost" id="bk-price">سنجش اجراپذیری</button>
      </div>
      <div id="bk-exec"></div>
      <button type="button" class="primary" id="bk-open" disabled>باز کردن موقعیت</button>
      <p class="backtest-table-note">موتور پیشنهاد و پرتفوی سایه در فاز بعدی می‌آیند. تا آن موقع ساختار را خودت برمی‌داری و همین تب اجراپذیری‌اش را در دفتر همان لحظه می‌سنجد.</p>
    </section>

    <section class="card" id="bk-expect-card" hidden>${headBlock('گام چهارم', 'انتظارت را قفل کن', 'پس از قفل، ویرایش نمی‌شود')}
      <label class="wide">انتظار — اجباری<textarea id="bk-expect" rows="2" placeholder="تا افقی که گفتی، انتظار داری چه بشود؟"></textarea></label>
      <div class="backtest-form">
        <label>قیمت هدف پایه<input id="bk-target" type="number" step="0.5" placeholder="درصد"><span class="unit">درصد</span></label>
        <button type="button" class="primary" id="bk-lock">قفل انتظار</button>
      </div>
      <p class="backtest-table-note" id="bk-expect-note">بدون این قفل، پرش ممکن نیست. دلیلش این است که آدم بعد از دیدن نتیجه انتظارش را بازنویسی می‌کند و خودش هم متوجه نمی‌شود؛ آن‌وقت تفکیک «پیش‌بینی غلط بود» از «ساختار غلط بود» برای همیشه ناممکن است.</p>
    </section>

    <section class="card" id="bk-rules-card" hidden>${headBlock('اختیاری', 'قواعد خروج', 'فقط چیزهایی که اجرا می‌شوند')}
      <div class="backtest-form">
        <label>قاعده<select id="bk-rule-kind">${EXIT_RULES.map((rule) => `<option value="${rule.key}">${esc(rule.label)}</option>`).join('')}</select></label>
        <label>آستانه<input id="bk-rule-value" type="number" step="0.5"></label>
        <button type="button" class="ghost" id="bk-rule-add">افزودن</button>
      </div>
      <div id="bk-rules"></div>
      <p class="backtest-table-note">${esc(NO_OPTION_STOP_NOTE)}</p>
    </section>

    <section class="card" id="bk-jump-card" hidden>${headBlock('گام پنجم', 'پرش زمانی', 'موتور قدم‌به‌قدم جلو می‌رود')}
      <div class="backtest-form">
        <label>پله<select id="bk-step">${STEPS.map((step) => `<option value="${step.key}">${esc(step.label)}</option>`).join('')}</select></label>
        <button type="button" class="primary" id="bk-jump" disabled>پرش</button>
        <button type="button" class="ghost" id="bk-close-pos" disabled>بستن موقعیت همین حالا</button>
      </div>
      <p class="backtest-table-note" id="bk-jump-note"></p>
    </section>

    <section class="card" id="bk-track-card" hidden>${headBlock('مسیر', 'چه شد و چرا', 'باقی‌مانده همیشه دیده می‌شود')}
      <div class="backtest-kpis" id="bk-track-kpis"></div>
      <div id="bk-pnl-chart" class="backtest-chart"></div>
      <div id="bk-decomp"></div>
      <p class="backtest-table-note" id="bk-residual"></p>
    </section>

    <section class="card" id="bk-events-card" hidden>${headBlock('میانهٔ راه', 'رویدادها', 'هر کدام با مهر زمانی دقیق')}
      <div id="bk-events"></div>
      <p class="backtest-table-note" id="bk-events-note"></p>
    </section>

    <section class="card">${headBlock('پایان', 'بستن جلسه', 'نام و تاریخ فقط اینجا فاش می‌شوند')}
      <div class="backtest-form">
        <button type="button" class="ghost" id="bk-end">پایان جلسه</button>
        <button type="button" class="ghost" id="bk-abandon">رها کردن جلسه</button>
      </div>
      <div id="bk-reveal"></div>
      <p class="backtest-table-note">جلسهٔ رهاشده هم در آمار شمرده می‌شود و در گزارش جدا نمایش داده می‌شود — رها کردن جلسه‌ای که دارد بد پیش می‌رود، خودش یک الگوی رفتاری است.</p>
    </section>
  </section>`;

  const setStatus = (text, isError = false) => {
    const node = $('bk-status');
    node.textContent = text;
    node.toggleAttribute('data-error', isError);
  };

  // ——————————————————————— بارگذاری اولیه ———————————————————————

  try {
    const response = await fetch('/api/history/universe');
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'فهرست دریافت نشد');
    chain = buildChain(payload.rows || []);
    $('bk-base').innerHTML = '<option value="">نماد پایه را انتخاب کن</option>'
      + [...chain.values()].sort((a, b) => a.name.localeCompare(b.name, 'fa'))
        .map((item) => `<option value="${esc(item.ins)}">${esc(nameOf(item, 'دارایی پایه'))} — ${fmt.int(item.contracts)} قرارداد</option>`).join('');
    setStatus(`${fmt.int(chain.size)} نماد پایه آماده است.`);
  } catch (error) {
    setStatus(errorText(error, 'فهرست قراردادهای فعال دریافت نشد.'), true);
  }

  $('bk-structure').innerHTML = CATALOG.map((def) => `<option value="${esc(def.id)}">${esc(def.name)} — ${esc(def.fa)}</option>`).join('');
  $('bk-regime-note').textContent = `قاعدهٔ رژیم بازار: ${regimeRuleText({ windowDays: state.settings.bkRegimeWindow, thresholdPct: state.settings.bkRegimeThresholdPct })} همین قاعده در تنظیمات قابل تغییر است و در گزارش پایان جلسه هم نوشته می‌شود.`;

  // ——————————————————————— انتخاب نماد و تاریخ ———————————————————————

  $('bk-base').addEventListener('change', async () => {
    const ins = $('bk-base').value;
    ua = ins ? chain.get(ins) : null;
    $('bk-start').disabled = true;
    if (!ua) return;
    setStatus('در حال دریافت سری روزانهٔ پایه…');
    try {
      baseRows = await feed.loadDailies(ins);
      calendar = tradingDays(baseRows);
      regimeRows = regimeSeries(baseRows, {
        windowDays: state.settings.bkRegimeWindow,
        thresholdPct: state.settings.bkRegimeThresholdPct,
      });
      const months = Math.max(1, Number(state.settings.bkLookbackMonths) || 3);
      const cutoff = calendar[Math.max(0, calendar.length - Math.round(months * 21))] || calendar[0];
      const window = regimeRows.filter((row) => row.date >= cutoff);
      $('bk-date').innerHTML = window.map((row) => `<option value="${row.date}">${faDigits(historyDateLabel(row.date))} — ${esc(regimeLabel(row.regime))}</option>`).join('');
      $('bk-start').disabled = !window.length;
      setStatus(`${fmt.int(calendar.length)} روز معاملاتی، ${fmt.int(window.length)} روز در بازهٔ انتخاب.`);
    } catch (error) {
      setStatus(errorText(error, 'سری روزانهٔ پایه دریافت نشد.'), true);
      logError(error, 'bereket:base');
    }
  });

  $('bk-mode').addEventListener('change', () => {
    $('bk-date-wrap').hidden = $('bk-mode').value !== 'manual';
  });
  $('bk-conf').addEventListener('input', () => {
    $('bk-conf-out').textContent = `${faDigits($('bk-conf').value)}٪`;
  });

  // ——————————————————————— شروع جلسه ———————————————————————

  $('bk-start').addEventListener('click', async () => {
    if (!ua) return;
    const months = Math.max(1, Number(state.settings.bkLookbackMonths) || 3);
    const cutoff = calendar[Math.max(0, calendar.length - Math.round(months * 21))] || calendar[0];
    const window = regimeRows.filter((row) => row.date >= cutoff);
    const id = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let startDate;
    if ($('bk-mode').value === 'manual') {
      startDate = normalizeHistoryDate($('bk-date').value);
    } else {
      const picked = stratifiedPick(window, { seed: id, count: 1 });
      startDate = picked.picks[0]?.date || 0;
      if (picked.missing.length) {
        setStatus(`در این بازه رژیم ${picked.missing.map(regimeLabel).join(' و ')} وجود نداشت، پس انتخاب واقعاً لایه‌بندی‌شده نبود.`);
      }
    }
    startDate = snapToTradingDay(calendar, startDate, -1);
    if (!startDate) { setStatus('تاریخ شروع معتبری پیدا نشد.', true); return; }

    session = blankSession({
      id,
      start: { date: startDate, second: Number($('bk-hour').value) },
      capitalRial: capitalRial(),
      anonymous: $('bk-anon').checked,
      manualStart: $('bk-mode').value === 'manual',
      practice: $('bk-practice').checked,
      regime: regimeAt(regimeRows, startDate),
      createdAt: Date.now(),
    });
    contracts = flattenActiveContracts(ua, state.settings.blockedExpiries || '');
    aliases = aliasMap(session.seed, [String(ua.ins), ...contracts.map((c) => String(c.ins))]);
    gate = createTimeGate({ sessionId: id, now: session.start, load: feed.gateLoaders(), days: calendar });
    position = null; rules = []; track = []; events = []; lastStep = null;

    // کارت شروع بسته می‌شود. تا وقتی باز بود، خودِ انتخابگر نماد نام
    // واقعی را روی صفحه نگه می‌داشت — نشتی که ممیزی مرورگری گرفت. هر
    // ناشناس‌سازی دیگری در این تب بی‌اثر بود اگر همان یک `select` می‌ماند.
    $('bk-start-card').hidden = true;
    $('bk-live').hidden = false;
    $('bk-build-card').hidden = true;
    $('bk-expect-card').hidden = true;
    $('bk-rules-card').hidden = true;
    $('bk-jump-card').hidden = true;
    await save();
    await paintNow();
  });

  // ——————————————————————— تصویر بازار ———————————————————————

  async function paintNow() {
    if (!session || !gate) return;
    const now = gate.now();
    $('bk-hero-state').textContent = `${SESSION_STATES[session.state]} · ${anonOn() ? dayLabel(now.date, session.start.date, calendar) : faDigits(historyDateLabel(now.date))}`;

    const history = await gate.history(String(ua.ins));
    const rows = history.rows || [];
    const shown = anonOn() ? indexSeries(rows).rows : rows;
    const spotRow = rows[rows.length - 1] || null;
    const snapshot = await gate.snapshot(String(ua.ins)).catch(() => null);
    const spot = Number(snapshot?.trade?.price) || Number(spotRow?.close) || NaN;

    $('bk-now-kpis').innerHTML = kpis([
      ['لحظه', anonOn() ? dayLabel(now.date, session.start.date, calendar) : faDigits(historyDateLabel(now.date)),],
      ['ساعت', faDigits(clock(now.second))],
      ['رژیم بازار', esc(regimeLabel(regimeAt(regimeRows, now.date)))],
      ['قیمت پایه', anonOn() ? '—' : money(spot)],
      ['سرمایهٔ جلسه', `${money(session.capitalRial / RIAL_PER_TOMAN)} تومان`],
      ['روز جلسه', dayLabel(now.date, session.start.date, calendar)],
    ]);
    chart($('bk-now-chart'), shown.map((row) => ({ date: row.date, close: Number(row.close) })),
      [{ key: 'close', label: anonOn() ? 'قیمت شاخص‌شده' : 'قیمت پایانی', color: 'var(--series-1)' }],
      { money: !anonOn(), xLabel: 'روز', yLabel: anonOn() ? 'شاخص از ۱۰۰' : 'ریال' });

    $('bk-anon-note').textContent = anonOn()
      ? 'حالت ناشناس روشن است: نام نماد، تاریخ واقعی، قیمت‌های اعمال و اندازهٔ عددی قرارداد پنهان‌اند. آنچه برای تصمیم لازم است — تلاطم، نقدشوندگی، موقعیت باز، روز مانده و فاصله از پایه — سر جایش هست. نام و تاریخ در پایان جلسه فاش می‌شوند.'
      : 'حالت ناشناس خاموش است. اگر گذشتهٔ این نماد را می‌شناسی، نتیجهٔ این جلسه بیشتر حافظه‌ات را می‌سنجد تا تحلیلت را.';

    // نگهبان نشت: آنچه در حالت ناشناس روی صفحه است نباید نام یا تاریخ داشته باشد.
    if (anonOn()) {
      const leak = leakCheck($('bk-now-kpis').textContent + $('bk-anon-note').textContent,
        { names: [nameOf(ua, '')], dates: [now.date, session.start.date] });
      if (!leak.clean) logError(new Error(`نشت حالت ناشناس: ${leak.found.map((f) => f.value).join('، ')}`), 'bereket:anon');
    }
    await paintTrack();
  }

  const clock = (second) => {
    const value = Math.max(0, Math.trunc(Number(second) || 0));
    return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}`;
  };

  // ——————————————————————— نظر ———————————————————————

  $('bk-save-view').addEventListener('click', async () => {
    const result = recordView(session, {
      direction: $('bk-dir').value,
      movePct: Number($('bk-move').value),
      horizonDays: Number($('bk-horizon').value),
      confidence: Number($('bk-conf').value) / 100,
      ivView: $('bk-ivview').value,
      macro: $('bk-macro').value,
      reason: $('bk-reason').value,
    });
    $('bk-view-note').textContent = result.ok ? 'نظر ثبت شد و دیگر عوض نمی‌شود.' : result.why;
    $('bk-view-note').toggleAttribute('data-error', !result.ok);
    if (!result.ok) return;
    session = result.session;
    $('bk-build-card').hidden = false;
    $('bk-rules-card').hidden = false;
    await save();
  });

  // ——————————————————————— ساختن موقعیت ———————————————————————

  let priced = null;

  $('bk-price').addEventListener('click', async () => {
    priced = null;
    $('bk-open').disabled = true;
    const def = byId($('bk-structure').value);
    if (!def || !gate) return;
    $('bk-exec').innerHTML = '<p class="empty-note">در حال سنجش دفتر همان لحظه…</p>';
    try {
      const built = await buildPosition(def, Number($('bk-size').value) || 1);
      priced = built;
      $('bk-exec').innerHTML = execMarkup(built);
      $('bk-open').disabled = !built.exec.ok;
    } catch (error) {
      $('bk-exec').innerHTML = `<p class="empty-note" data-error>${esc(errorText(error, 'سنجش اجراپذیری ممکن نشد.'))}</p>`;
      logError(error, 'bereket:price');
    }
  });

  /**
   * ساخت پاهای یک ساختار از زنجیره، با قیمت و دفترِ همان لحظه.
   *
   * قیمت اعمال‌ها ساده انتخاب می‌شوند: نزدیک‌ترین به پایه، و بعدی‌ها به
   * ترتیب بالاتر. فاز بعد این را به موتور پیشنهاد می‌سپارد که همهٔ
   * ترکیبات معقول را بسازد؛ اینجا فقط یک ترکیب معقول لازم است تا ماشین
   * جلسه قابل آزمودن باشد.
   */
  async function buildPosition(def, size) {
    const now = gate.now();
    const snapshot = await gate.snapshot(String(ua.ins));
    const history = await gate.history(String(ua.ins), { lookback: 1 });
    const spot = Number(snapshot?.trade?.price) || Number(history.rows?.[0]?.close) || NaN;
    if (!(spot > 0)) throw new Error('در این لحظه قیمتی برای پایه نبود.');

    // قراردادهایی که در همان روز واقعاً وجود داشتند: ردیف روزانه دارند.
    const alive = [];
    for (const contract of contracts) {
      const rows = await feed.loadDailies(String(contract.ins)).catch(() => []);
      if (rows.some((row) => normalizeHistoryDate(row.date) === now.date)) alive.push(contract);
    }
    if (!alive.length) throw new Error('هیچ قراردادی در این تاریخ ردیف روزانه نداشت؛ یا نماد اشتباه است یا تاریخ بیرون از عمر قراردادهاست.');

    const expiries = [...new Set(alive.map((c) => c.expiry))].sort((a, b) => a - b);
    const wantExp = expiries.slice(0, Math.max(1, def.expiries));
    const pool = alive.filter((c) => wantExp.includes(c.expiry));
    const strikeList = [...new Set(pool.map((c) => Number(c.strike)))].sort((a, b) => a - b);
    if (strikeList.length < def.strikes) throw new Error(`این ساختار ${def.strikes} قیمت اعمال می‌خواهد و در این تاریخ ${strikeList.length} تا موجود بود.`);
    const centre = strikeList.reduce((best, k) => (Math.abs(k - spot) < Math.abs(best - spot) ? k : best), strikeList[0]);
    const from = Math.max(0, Math.min(strikeList.indexOf(centre), strikeList.length - def.strikes));
    const strikes = strikeList.slice(from, from + def.strikes);

    const pick = (kind, slot, exp) => pool.find((c) => c.kind === kind
      && Number(c.strike) === strikes[slot - 1] && c.expiry === wantExp[Math.min(exp, wantExp.length - 1)]);

    const legs = [];
    const books = {};
    const meta = {};
    for (const template of def.legs) {
      if (template.kind === 'underlying') {
        legs.push({ kind: 'underlying', side: template.side, ratio: template.ratio, size: 1, ins: String(ua.ins), strike: undefined });
        continue;
      }
      const contract = pick(template.kind, template.slot, template.exp);
      if (!contract) throw new Error('یکی از پاهای این ساختار در این تاریخ قرارداد نداشت.');
      legs.push({
        kind: template.kind, side: template.side, ratio: template.ratio,
        size: Number(contract.size) || state.settings.contractSize,
        strike: Number(contract.strike), ins: String(contract.ins),
        expiry: contract.expiry, name: contract.name,
      });
    }
    for (const leg of legs) {
      // رویدادها را سرور نرمال کرده و `ui/bereket-data.mjs` همان را
      // برمی‌گرداند. نسخهٔ اول دوباره `normalizeBookEvents` می‌زد و چون
      // ورودی دیگر میدان‌های خام را نداشت، همه‌چیز دور ریخته می‌شد و دفتر
      // همیشه خالی درمی‌آمد — بدون هیچ خطایی، فقط «دفتری نبود».
      books[leg.ins] = bookAt(await feed.loadBookEvents(leg.ins, now.date).catch(() => []), now.second);
      meta[leg.ins] = await feed.loadDayMeta(leg.ins, now.date, now.second).catch(() => ({}));
    }
    const exec = executableAt({
      legs, books, meta, fees: fees(), contractSize: state.settings.contractSize,
      takePct: Number(state.settings.bkTakePct) || 30, qty: Math.max(1, size),
      capitalAvailable: session.capitalRial,
    });
    const prices = (exec.priced || []).map((leg) => Number(leg.price));
    const marginState = marginAt({
      legs, prices, spot, params: marginP(), contractSize: state.settings.contractSize,
      creditPolicy: state.settings.bkCreditSpreadMargin,
    });
    return { def, legs, size: Math.max(1, size), spot, books, meta, exec, prices, marginState, at: now };
  }

  /**
   * برچسب یک پا، با احترام به حالت ناشناس.
   *
   * هستهٔ محاسبه برچسب خودش را می‌سازد و قیمت اعمال تویش هست — که برای
   * دفتر خطا درست است و برای صفحه غلط. پس هر متنی که کاربر می‌بیند از
   * همین‌جا می‌آید و در حالت ناشناس فقط فاصله از پایه را می‌گوید.
   */
  const legLabelFor = (leg, spot) => (leg.kind === 'underlying' ? 'سهم پایه'
    : `${leg.side === 'sell' ? 'فروش' : 'خرید'} ${leg.kind === 'call' ? 'کال' : 'پوت'} ${anonOn() ? moneynessLabel(leg.strike, spot, leg.kind) : fmt.int(leg.strike)}`);

  /**
   * دلیلِ صفر شدن اجراپذیری، بازساخته از شمارهٔ پا.
   *
   * `exec.why` را مستقیم چاپ نمی‌کنیم چون قیمت اعمال دارد. هسته شمارهٔ پا
   * را می‌دهد و رابط برچسب خودش را می‌سازد؛ همان تفکیکی که کل حالت ناشناس
   * روی آن ایستاده.
   */
  function execWhy(built) {
    const { exec, legs, spot } = built;
    if (exec.ok) return '';
    if (exec.missing?.length) {
      const names = exec.missing.map((row) => legLabelFor(legs[row.index], spot)).join('، ');
      return `در آن لحظه برای ${names} دفتری نبود؛ این ساختار ساختنی نیست.`;
    }
    if (exec.blocked?.length) {
      const names = exec.blocked.map((row) => `${legLabelFor(legs[row.index], spot)}: ${row.label}`).join('، ');
      const tail = exec.unverifiedQueue ? ' دامنهٔ مجاز آن روز را نداشتیم، پس صف بودنش تأییدنشده است.' : '';
      return `${names}. تا وقتی صف باز نشود این ساختار ساختنی نیست.${tail}`;
    }
    return `عمق کافی نبود — قید: ${exec.binding}`;
  }

  /**
   * نام قید مقیدکننده، بدون قیمت اعمال.
   *
   * موتور اجرا شمارهٔ پا را می‌دهد؛ اگر قید از پا نیامده باشد — سرمایه یا
   * موقعیت باز — همان متن موتور امن است و مستقیم می‌نشیند.
   */
  function bindingLabel(built) {
    const { exec, legs, spot } = built;
    const at = Number(exec.bindingIndex);
    if (!anonOn() || !Number.isInteger(at) || at < 0 || !legs[at]) return exec.binding;
    const leg = legs[at];
    const side = leg.side === 'sell' ? 'تقاضای' : 'عرضهٔ';
    return `عمق ${side} ${legLabelFor(leg, spot)}`;
  }

  function execMarkup(built) {
    const { exec, marginState, legs, spot } = built;
    const rows = legs.map((leg, at) => {
      const price = Number(exec.priced?.[at]?.price);
      return [
        td(esc(legLabelFor(leg, spot))), td(anonOn() ? esc(aliases[leg.ins] || '—') : esc(leg.name || leg.ins)),
        td(money(price)), td(pctCell(exec.spreadPctByLeg?.[at])),
        td(esc(sizeLabel(leg.size, state.settings.contractSize))),
      ];
    });
    const head = exec.ok
      ? kpis([
        ['سقف قرارداد', int(exec.max)],
        ['قید مقیدکننده', esc(bindingLabel(built))],
        ['بدترین لغزش', pctCell(exec.slipPct)],
        ['هزینهٔ اجرا', money(exec.cost?.total)],
        ['وجه تضمین بلوکه', money(marginState.blocked) + (marginState.estimated ? ' · تخمینی' : '')],
        ['سرمایهٔ درگیر', money(marginState.capital?.value)],
      ])
      : '';
    return `${head}
      ${table(['پا', 'قرارداد', 'قیمت اجرا', 'اسپرد', 'اندازه'], rows)}
      <p class="backtest-table-note"${exec.ok ? '' : ' data-error'}>${esc(exec.ok ? (marginState.estimated ? 'عدد وجه تضمین اسپرد بستانکار تخمینی است و با صورتحساب واقعی تطبیق داده نشده.' : 'هر پا جدا اجرا می‌شود؛ سفارش ترکیبی در تابلو وجود ندارد.') : execWhy(built))}</p>`;
  }

  $('bk-open').addEventListener('click', async () => {
    if (!priced?.exec?.ok) return;
    const filled = Math.min(priced.size, priced.exec.max);
    position = {
      legs: priced.legs, size: filled, entryPrices: priced.prices,
      entryCost: priced.exec.cost, openedAt: gate.now(), spotAtEntry: priced.spot,
      marginState: priced.marginState, def: priced.def,
    };
    track = [markMoment({
      legs: position.legs, prices: position.entryPrices, entryPrices: position.entryPrices,
      spot: priced.spot, date: position.openedAt.date, second: position.openedAt.second, params: ivP(),
    })];
    $('bk-expect-card').hidden = false;
    $('bk-build-card').hidden = true;
    session = recordEvent(session, {
      kind: 'open', detail: `${priced.def.name} — ${filled} قرارداد`, at: position.openedAt,
    }).session;
    await save();
    await paintTrack();
  });

  // ——————————————————————— قفل انتظار ———————————————————————

  $('bk-lock').addEventListener('click', async () => {
    const result = lockExpectation(session, {
      text: $('bk-expect').value,
      targetPricePct: Number($('bk-target').value),
    });
    $('bk-expect-note').textContent = result.ok
      ? 'انتظار قفل شد. حالا می‌توانی جلو بروی.'
      : result.why;
    $('bk-expect-note').toggleAttribute('data-error', !result.ok);
    if (!result.ok) return;
    session = result.session;
    $('bk-jump-card').hidden = false;
    $('bk-jump').disabled = false;
    $('bk-close-pos').disabled = false;
    $('bk-expect').disabled = true;
    $('bk-target').disabled = true;
    $('bk-lock').disabled = true;
    await save();
  });

  // ——————————————————————— قواعد خروج ———————————————————————

  $('bk-rule-add').addEventListener('click', () => {
    const key = $('bk-rule-kind').value;
    const value = Number($('bk-rule-value').value);
    if (!Number.isFinite(value)) return;
    rules = [...rules, { key, value }];
    paintRules();
  });
  root.addEventListener('click', (event) => {
    const index = event.target?.dataset?.ruleDrop;
    if (index === undefined) return;
    rules = rules.filter((_, at) => at !== Number(index));
    paintRules();
  });
  function paintRules() {
    $('bk-rules').innerHTML = table(['قاعده', 'مبنا', 'آستانه', ''],
      rules.map((rule, at) => [
        td(esc(EXIT_RULE_BY_KEY[rule.key]?.label || rule.key)),
        td(esc(EXIT_RULE_BY_KEY[rule.key]?.basis || '—')),
        td(`${faDigits(String(rule.value))} ${esc(EXIT_RULE_BY_KEY[rule.key]?.unit || '')}`),
        td(`<button type="button" class="ghost" data-rule-drop="${at}">حذف</button>`),
      ]), 'هنوز قاعده‌ای نگذاشته‌ای. بدون قاعده، فقط کال مارجین و سررسید موقعیت را می‌بندند.');
  }
  paintRules();

  // ——————————————————————— پرش ———————————————————————

  $('bk-jump').addEventListener('click', async () => {
    const gateOk = canAdvance(session);
    if (!gateOk.ok) { $('bk-jump-note').textContent = gateOk.why; $('bk-jump-note').setAttribute('data-error', ''); return; }
    $('bk-jump-note').removeAttribute('data-error');
    $('bk-jump').disabled = true;
    $('bk-jump-note').textContent = 'در حال قدم‌زدن در فاصله…';
    try { await jump($('bk-step').value); }
    catch (error) {
      $('bk-jump-note').textContent = errorText(error, 'پرش ممکن نشد.');
      $('bk-jump-note').setAttribute('data-error', '');
      logError(error, 'bereket:jump');
    }
    $('bk-jump').disabled = session.state !== 'open';
  });

  async function jump(stepKey) {
    const expiry = Math.min(...position.legs.filter((leg) => leg.expiry).map((leg) => leg.expiry));
    const advance = gate.advance(stepKey, {
      expiryDate: Number.isFinite(expiry) ? expiry : 0,
      grainSeconds: Number(state.settings.bkStepGrainSec) || 900,
    });
    if (!advance.ok) { $('bk-jump-note').textContent = advance.why; $('bk-jump-note').setAttribute('data-error', ''); return; }

    // قدم‌های میانی — روزانه، مگر آخرین روز که ریز است. گرفتن دفتر هر
    // قدمِ یک‌ربعی برای دو ماه، هزاران درخواست است و تب را می‌بندد؛ پس
    // ریزدانگی فقط جایی می‌نشیند که واقعاً چیزی برای دیدن هست.
    const coarse = dedupeDays(advance.moments);
    const cache = new Map();
    const stepData = async (point) => {
      const key = `${point.date}|${point.second}`;
      if (cache.has(key)) return cache.get(key);
      const value = await snapshotAt(point);
      cache.set(key, value);
      return value;
    };
    const feedStep = (at, point) => cache.get(`${point.date}|${point.second}`) || null;
    for (const point of coarse) await stepData(point);

    const walked = walkMoments({
      moments: coarse, feed: feedStep, legs: position.legs, size: position.size,
      rules, params: marginP(), fees: fees(), contractSize: state.settings.contractSize,
      takePct: Number(state.settings.bkTakePct) || 30,
      expiryDate: Number.isFinite(expiry) ? expiry : 0,
      maxProfit: position.marginState?.payoff?.maxProfit,
      maxLoss: position.marginState?.maxLoss,
    });
    events = [...events, ...walked.events];
    for (const event of walked.events) {
      session = recordEvent(session, { kind: event.kind, detail: event.detail || event.kindLabel, at: event.at }).session;
    }

    for (const point of coarse) {
      const step = cache.get(`${point.date}|${point.second}`);
      if (!step) continue;
      track = [...track, markMoment({
        legs: position.legs, prices: step.prices, entryPrices: position.entryPrices,
        spot: step.spot, date: point.date, second: point.second,
        days: position.legs.map((leg) => (leg.expiry ? daysTo(leg.expiry, point.date) : undefined)),
        params: ivP(),
      })];
      if (walked.closedAt && point.date === walked.closedAt.date && point.second === walked.closedAt.second) break;
    }

    const landing = walked.closedAt || advance.moments[advance.moments.length - 1] || gate.now();
    const moved = advanceTo(session, landing);
    if (moved.ok) session = moved.session;
    gate = createTimeGate({ sessionId: session.id, now: landing, load: feed.gateLoaders(), days: calendar });
    lastStep = { walked, truncated: advance.truncated, rolled: advance.rolled };

    if (!walked.open) {
      position = { ...position, closedAt: walked.closedAt };
      $('bk-jump').disabled = true;
      $('bk-close-pos').disabled = true;
    }
    // جملهٔ نتیجه **بعد از** رنگ‌آمیزی نوشته می‌شود. نسخهٔ اول پیش از آن
    // می‌نوشت، پس لحظه‌ای وجود داشت که نوشته بود «تمام شد» و صفحه هنوز
    // لحظهٔ قبلی را نشان می‌داد.
    await save();
    await paintNow();
    paintEvents();
    $('bk-jump-note').textContent = jumpNote(lastStep);
  }

  const daysTo = (expiry, date) => {
    const a = normalizeHistoryDate(date), b = normalizeHistoryDate(expiry);
    if (!a || !b) return undefined;
    return Math.max(0, Math.round((Date.UTC(Math.floor(b / 10000), Math.floor((b % 10000) / 100) - 1, b % 100)
      - Date.UTC(Math.floor(a / 10000), Math.floor((a % 10000) / 100) - 1, a % 100)) / 86400000));
  };

  /** یک قدم در هر روز — و در روز آخر، همان لحظهٔ دقیق. */
  function dedupeDays(moments = []) {
    const byDay = new Map();
    for (const point of moments) byDay.set(point.date, point);
    return [...byDay.values()];
  }

  /** وضعیت یک لحظه: قیمت پاها، دفترها، و روز مانده. */
  async function snapshotAt(point) {
    const prices = [];
    const books = {};
    const meta = {};
    let spot = NaN;
    let halted = false, haltWhy = '';
    for (const leg of position.legs) {
      const trades = await feed.loadTrades(leg.ins, point.date).catch(() => []);
      const mark = markAt(trades, point.second);
      prices.push(mark ? mark.price : NaN);
      books[leg.ins] = bookAt(await feed.loadBookEvents(leg.ins, point.date).catch(() => []), point.second);
      const dayMeta = await feed.loadDayMeta(leg.ins, point.date, point.second).catch(() => ({}));
      meta[leg.ins] = dayMeta;
      if (dayMeta.state && !String(dayMeta.state).toUpperCase().startsWith('A')) {
        halted = true; haltWhy = `${dayMeta.stateTitle || dayMeta.state}`;
      }
    }
    const baseTrades = await feed.loadTrades(String(ua.ins), point.date).catch(() => []);
    const baseMark = markAt(baseTrades, point.second);
    spot = baseMark ? baseMark.price : NaN;
    const pnl = prices.reduce((sum, price, at) => {
      const entry = position.entryPrices[at];
      if (!Number.isFinite(price) || !Number.isFinite(entry)) return sum;
      const leg = position.legs[at];
      const sign = leg.side === 'sell' ? -1 : 1;
      return sum + sign * (Number(leg.ratio) || 1) * (Number(leg.size) || 1) * (price - entry);
    }, 0);
    const expiry = Math.min(...position.legs.filter((leg) => leg.expiry).map((leg) => leg.expiry));
    return {
      spot, prices, books, meta, halted, haltWhy,
      daysLeft: Number.isFinite(expiry) ? daysTo(expiry, point.date) : NaN,
      pnl: pnl * position.size,
      equity: session.capitalRial,
    };
  }

  function jumpNote(step) {
    const parts = [];
    if (step.rolled) parts.push('پله از پایان جلسه رد شد و به ابتدای جلسهٔ بعد رفت.');
    if (step.truncated) parts.push('قدم‌های میانی به سقف خوردند؛ بخشی از فاصله ریز بررسی نشد.');
    const summary = eventSummary(step.walked.events);
    parts.push(summary.note);
    if (!step.walked.open) parts.push('موقعیت بسته شد.');
    return parts.join(' ');
  }

  $('bk-close-pos').addEventListener('click', async () => {
    if (!position) return;
    const now = gate.now();
    const step = await snapshotAt(now);
    // بستن دستی از `attemptClose` رد می‌شود نه از یک «قاعده‌ای که همیشه
    // شلیک می‌کند». نسخهٔ اول همان ترفند را زد و کار نکرد: آستانهٔ
    // بی‌نهایت از `Number.isFinite` رد نمی‌شود، پس قاعده هرگز شلیک
    // نمی‌کرد و دکمه بی‌صدا هیچ کاری نمی‌کرد. مسیر مستقیم هم صادق‌تر است:
    // بستن دستی قاعده نیست، تصمیم است.
    const tried = attemptClose({
      legs: position.legs, size: position.size, books: step.books, meta: step.meta,
      fees: fees(), contractSize: state.settings.contractSize,
      takePct: Number(state.settings.bkTakePct) || 30,
    });
    const made = [makeEvent(tried.closed ? 'exitDone' : (tried.kind === 'queueBlocked' ? 'queueBlocked' : 'exitFailed'), now, {
      detail: tried.closed
        ? `بستن دستی — ${tried.filled} قرارداد`
        : `بستن دستی خواسته شد ولی در مظنهٔ همان لحظه ممکن نبود — ${tried.why}`,
      filled: tried.filled,
    })];
    events = [...events, ...made];
    for (const event of made) {
      session = recordEvent(session, { kind: event.kind, detail: event.detail, at: event.at }).session;
    }
    if (tried.closed) { position = { ...position, closedAt: now }; $('bk-jump').disabled = true; $('bk-close-pos').disabled = true; }
    await save();
    paintEvents();
    await paintTrack();
  });

  // ——————————————————————— مسیر و تجزیه ———————————————————————

  async function paintTrack() {
    if (!position || track.length < 1) { $('bk-track-card').hidden = true; return; }
    $('bk-track-card').hidden = false;
    const decomposed = decomposePnl({
      legs: position.legs, track,
      entryCost: position.entryCost, exitCost: null,
      marginNet: position.marginState?.blocked || 0,
      rFree: ivP().rFree, days: track.length - 1,
      residualWarnPct: Number(state.settings.bkResidualWarnPct) || 20,
    });
    const last = track[track.length - 1];
    $('bk-track-kpis').innerHTML = kpis([
      ['سود و زیان ناخالص', money(decomposed.gross * position.size)],
      ['هزینه‌ها', money(decomposed.costs * position.size)],
      ['خالص', money(decomposed.net * position.size)],
      ['دلتای موقعیت', small(last?.totals?.delta)],
      ['وگای موقعیت', small(last?.totals?.vega)],
      ['پوشش تجزیه', pctCell(decomposed.coverage)],
    ]);
    chart($('bk-pnl-chart'), track.map((row, at) => ({ date: row.date, second: row.second, pnl: row.grossPnl * position.size, at })),
      [{ key: 'pnl', label: 'سود و زیان ناخالص', color: 'var(--series-1)' }],
      { money: true, xLabel: 'مسیر', yLabel: 'ریال' });
    $('bk-decomp').innerHTML = table(['قلم', 'دسته', 'ریال'],
      decomposed.rows.map((row) => [
        td(esc(row.label)),
        td(esc(row.kind === 'cost' ? 'هزینه' : row.kind === 'residual' ? 'باقی‌مانده' : 'عامل بازار')),
        td(money(row.rial * position.size), row.rial < 0 ? 'neg' : row.rial > 0 ? 'pos' : ''),
      ]));
    $('bk-residual').textContent = decomposed.residualNote;
    $('bk-residual').toggleAttribute('data-error', decomposed.residualWarn);
  }

  function paintEvents() {
    if (!events.length) { $('bk-events-card').hidden = true; return; }
    $('bk-events-card').hidden = false;
    $('bk-events').innerHTML = table(['لحظه', 'رویداد', 'شرح'],
      events.map((event) => [
        td(esc(anonOn() ? `${dayLabel(event.at.date, session.start.date, calendar)} ${clock(event.at.second)}` : faDigits(event.stamp))),
        td(esc(event.kindLabel)),
        td(esc(event.detail || '—')),
      ]));
    $('bk-events-note').textContent = eventSummary(events).note;
  }

  // ——————————————————————— پایان ———————————————————————

  $('bk-end').addEventListener('click', () => finish(false));
  $('bk-abandon').addEventListener('click', () => finish(true));

  async function finish(abandoned) {
    const result = closeSession(session, { abandoned, closedAt: Date.now() });
    if (!result.ok) return;
    session = result.session;
    await save();
    const revealed = reveal({ session, aliases, names: Object.fromEntries([[String(ua.ins), nameOf(ua, '')], ...contracts.map((c) => [String(c.ins), c.name || ''])]) });
    const summary = sessionSummary(session);
    $('bk-reveal').innerHTML = revealed.ok
      ? `${kpis([
        ['نماد', esc(nameOf(ua, '—'))],
        ['تاریخ شروع', faDigits(historyDateLabel(revealed.startDate))],
        ['تاریخ پایان', faDigits(historyDateLabel(revealed.endDate))],
        ['رژیم شروع', esc(regimeLabel(session.regime))],
        ['وضعیت', esc(summary.stateLabel)],
        ['در آمار', summary.inStats ? 'بله' : 'خیر — تمرینی'],
      ])}<p class="backtest-table-note">${esc(regimeRuleText({ windowDays: state.settings.bkRegimeWindow, thresholdPct: state.settings.bkRegimeThresholdPct }))}</p>`
      : `<p class="empty-note">${esc(revealed.why)}</p>`;
    $('bk-jump').disabled = true;
    $('bk-close-pos').disabled = true;
    $('bk-hero-state').textContent = summary.stateLabel;
    // جلسه بسته شد، پس نام دیگر رازی نیست و کارت شروع می‌تواند برگردد.
    $('bk-start-card').hidden = false;
  }

  async function save() {
    try { await feed.saveSession(session); }
    catch (error) { logError(error, 'bereket:save'); }
  }
}
