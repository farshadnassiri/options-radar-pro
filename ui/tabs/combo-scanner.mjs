// زیرتب «اسکنر آپشن» در رصد لحظه‌ای بازار.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۳): ترکیب آزاد سهم پایه، کال و پوت با
// نسبت‌های مختلف؛ کارتی و دیداری، «تا معامله‌گر با یک نگاه ساده بتواند
// تصمیم بگیرد».
//
// دور دوم (همان روز):
//   ۱. پیشنهاد بر اساس دفتر سفارش و شرایط لحظه‌ای؛ اگر سهم یا کال یا پوتی
//      را نمی‌شود خرید یا فروخت، پیشنهاد نشود — یا کاربر شرط را انتخاب کند
//   ۲. «؟» برای همهٔ بخش‌ها
//   ۳. فاصله تا سربه‌سر با درصدش
//   ۴. با چه حجمی می‌شود اجرا کرد و ارزش ریالی‌اش
//   ۵. فیلتر روی نتیجه‌ها
//   ۶. سود و زیان بازه‌ای و شرطی، گرافیکی و تعاملی
//   ۷. «ست» چیست و چقدر می‌شود اجرا کرد؛ پلکان دفتر سفارش
//   ۸. نمودارهای کوچک دقیق
//
// محاسبه در `core/combo-scanner.mjs` و در ریسهٔ غربال است؛ این فایل فیلتر
// می‌گیرد، نتیجه را می‌کشد، راهنما و خوانش نمودار را سیم‌کشی می‌کند.

import { fmt, faDigits, faNum, faClock } from '/ui/fmt.mjs';
import { runComboScan, onChain, pushRows, chainState } from '/ui/scanner.mjs';
import { mountPayoff } from '/ui/chart.mjs';
import {
  SCANNER_DEFAULTS, SCANNER_VIEWS, SCANNER_SORTS, EXEC_RULES, scannerConfig, executionLadder,
} from '/core/combo-scanner.mjs';
import { historyDateLabel } from '/core/history.mjs';
import {
  esc, pct, tone, shortRial, SIDE_FA, legLine, cardHtml, rulerHtml, readAt, scenarioLines, breakevenText,
  ladderHtml, execSummary, setText, filterGroups, emptyResultFilter, RESULT_SORTS,
} from '/ui/combo-scanner-view.mjs';
import { helpIcon } from '/ui/combo-scanner-help.mjs';
import { patchHTML } from '/ui/morph.mjs';

const STORE = 'options-radar:combo-scanner';
const MILLION = 1e6;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; }
}
function writeStore(v) {
  try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* فقط همین نشست */ }
}

export async function mount(root, { state, api }) {
  const s = () => state.settings;
  const stored = readStore();
  let cfg = scannerConfig({ ...SCANNER_DEFAULTS, ...stored });
  let uaPick = stored.uaPick || '';
  let rf = { ...emptyResultFilter(), ...(stored.rf || {}) };
  let live = false, busy = false, timer = null, result = null, picked = null, chart = null, lastAt = 0;
  // شناسهٔ جزئیاتی که تازه‌سازی‌اش تا بیرون آمدنِ کاربر از کنترلِ درونش عقب افتاد.
  let pendingId = '';
  let barMarkup = '';
  // یک نگاه: اول ۲۴ کارت، بقیه با «نمایش بیشتر».
  const PAGE = 24;
  let shown = PAGE;
  const byId = new Map();

  root.innerHTML = `
    <section class="cs-hero">
      <div>
        <p class="cs-eyebrow"><i></i> جست‌وجوی زنده در کل بازار اختیار</p>
        <h2>اسکنر آپشن ${helpIcon('hero')}</h2>
        <p class="cs-lead">سهم پایه، کال و پوت را با نسبت‌های مختلف ترکیب می‌کند و ترکیب‌های <b class="gain">پربازده</b> با <b class="accent">ریسک محدود</b> را پیدا می‌کند؛ حتی آن‌هایی که اسم ندارند.</p>
      </div>
      <div class="cs-hero-ctl">
        <button type="button" class="cs-live" id="cs-live" aria-pressed="false"><i></i><span>زنده</span></button>${helpIcon('live')}
        <span class="cs-clock" id="cs-clock">—</span>
        <button type="button" class="btn" id="cs-run">اسکن کن</button>${helpIcon('run')}
      </div>
    </section>
    <section class="card cs-filters" id="cs-filters"></section>
    <div class="cs-summary"><span id="cs-summary" role="status" aria-live="polite">هنوز اسکن نزدی — «اسکن کن» را بزن.</span>
      <div class="cs-sort" role="tablist">${SCANNER_SORTS.map(([id, label]) => `<button type="button" role="tab" data-cs-sort="${id}" aria-selected="${cfg.sort === id}">${label}</button>`).join('')}${helpIcon('sort')}</div></div>
    <section class="cs-results" id="cs-results" hidden></section>
    <div class="cs-grid" id="cs-grid"></div>
    <section class="card cs-detail" id="cs-detail" hidden></section>
    <p class="note cs-funnel" id="cs-funnel"></p>
    <p class="note">عددها با هر اسکن عوض می‌شوند. قیمت هر پا همین لحظه قابل اجراست (فروش به بهترین تقاضا، خرید به بهترین عرضه)، با کارمزد و وجه تضمین طبق ضوابط. «بازده ماهانه» یعنی اگر قیمت پایه تا سررسید همین بماند. هیچ کارتی پیشنهاد خرید یا فروش نیست.</p>
    <div class="sl-tip cs-tip" role="tooltip" hidden></div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const tipBox = root.querySelector('.cs-tip');

  function save() { writeStore({ ...cfg, uaPick, rf }); }

  const seg = (key, list, val) => `<div class="cs-seg" role="radiogroup">${list.map(([v, t]) => `<button type="button" data-cs-set="${key}" data-v="${v}" aria-pressed="${String(val) === String(v)}">${t}</button>`).join('')}</div>`;
  const numField = (key, label, val, unit, help, step = 1) => `<label class="cs-field"><span>${label} ${help ? helpIcon(help) : ''}</span><input type="number" min="0" step="${step}" data-cs-num="${key}" value="${fin(val) ? val : ''}" dir="ltr"><small>${unit}</small></label>`;

  function activeCount() {
    let n = 0;
    if (cfg.view !== 'all') n += 1;
    if (cfg.maxCapital > 0) n += 1;
    if (cfg.minPop > 0) n += 1;
    if (cfg.maxLossPerSet > 0) n += 1;
    if (cfg.minLiquidity > 0) n += 1;
    if (cfg.minSets > 1) n += 1;
    if (uaPick) n += 1;
    return n;
  }

  function paintFilters() {
    const list = chainState.list || [];
    $('cs-filters').innerHTML = `
      <div class="cs-filter-head"><b>⚙ فیلترها <span class="cs-badge">${faDigits(String(activeCount()))}</span></b>${helpIcon('filters')}
        <span class="note">فیلترها همین‌جا در مرورگر می‌مانند (فیلتر دلخواه).</span>
        <button type="button" class="ghost cs-mini" data-cs-reset>بازگشت به پیش‌فرض</button></div>
      <div class="cs-fld cs-exec-rule"><span>شرط اجرا ${helpIcon('execRule')}</span>${seg('execRule', EXEC_RULES, cfg.execRule)}</div>
      <div class="cs-filter-grid">
        <div class="cs-fld"><span>دید بازار ${helpIcon('view')}</span>${seg('view', SCANNER_VIEWS, cfg.view)}</div>
        <label class="cs-field"><span>نماد پایه ${helpIcon('ua')}</span><select data-cs-ua><option value="">کل بازار (${fmt.int(list.length)} نماد)</option>${list.map((u) => `<option value="${esc(u.ins)}"${String(u.ins) === uaPick ? ' selected' : ''}>${esc(faDigits(u.name))}</option>`).join('')}</select></label>
        ${numField('minPop', 'احتمال سود دست‌کم', cfg.minPop, '٪', 'minPop', 5)}
        ${numField('maxLossM', 'زیان هر ست حداکثر', cfg.maxLossPerSet / MILLION, 'میلیون ریال', 'maxLoss', 1)}
        ${numField('maxCapitalM', 'سرمایهٔ لازم هر ست حداکثر', cfg.maxCapital > 0 ? cfg.maxCapital / MILLION : NaN, 'میلیون ریال · خالی یعنی بی‌سقف', 'maxCapital', 1)}
        ${numField('minSets', 'حجم شدنی دست‌کم', cfg.minSets, 'ست', 'minSets', 1)}
        <div class="cs-fld"><span>نقدشوندگی دست‌کم ${helpIcon('liquidity')}</span>${seg('minLiquidity', [0, 1, 2, 3, 4].map((n) => [n, faDigits(`${n}/۴`)]), cfg.minLiquidity)}</div>
        <div class="cs-fld"><span>سررسید (روز) ${helpIcon('days')}</span><div class="cs-range">${numField('minDays', 'از', cfg.minDays, 'روز')}${numField('maxDays', 'تا', cfg.maxDays, 'روز')}</div></div>
        <div class="cs-fld"><span>پاها و نسبت ${helpIcon('legs')}</span>${seg('maxLegs', [[2, 'دو پا'], [3, 'تا سه پا']], cfg.maxLegs)}${seg('maxRatio', [[1, 'فقط ۱:۱'], [2, 'تا ۲'], [3, 'تا ۳']], cfg.maxRatio)}</div>
        <label class="cs-check"><input type="checkbox" data-cs-stock ${cfg.allowStock ? 'checked' : ''}> خرید سهم پایه هم پا باشد ${helpIcon('stock')}</label>
      </div>
      ${cfg.maxLegs >= 3 && !uaPick ? '<p class="note warn">سه‌پایه روی کل بازار ده‌ها هزار ترکیب می‌سازد؛ اسکن کندتر است و ممکن است به سقف برسد. یک نماد انتخاب کن.</p>' : ''}`;
  }

  // ── فیلتر نتیجه‌ها (بی اسکن دوباره) ───────────────────────────────
  // `quiet`: اسکنِ خودکار (۱۴۰۵/۰۷/۱۸). نوارِ فیلتر هر اسکن از نو ساخته
  // می‌شد: کشوییِ بازِ «همهٔ نمادها» بسته می‌شد و جست‌وجوی در حال تایپ
  // فوکوسش را از دست می‌داد. قالبِ یکسان دوباره نوشته نمی‌شود و تیکِ خودکار
  // زیرِ دستِ کاربر چیزی را عوض نمی‌کند.
  function paintResultsBar({ quiet = false } = {}) {
    const host = $('cs-results');
    if (!result?.groups?.length) { host.hidden = true; return; }
    host.hidden = false;
    const uas = [...new Map(result.groups.map((g) => [g.best.uaIns, g.best.uaName])).entries()];
    const count = (ua) => result.groups.filter((g) => g.best.uaIns === ua).length;
    const html = `<div class="cs-results-bar">
      <b>فیلتر نتیجه‌ها ${helpIcon('results')}</b>
      <input type="search" data-cs-rf="q" placeholder="نماد یا قرارداد…" value="${esc(rf.q)}">
      <select data-cs-rf="ua"><option value="">همهٔ نمادها</option>${uas.map(([ins, name]) => `<option value="${esc(ins)}"${rf.ua === ins ? ' selected' : ''}>${esc(faDigits(name))} (${fmt.int(count(ins))})</option>`).join('')}</select>
      <select data-cs-rf="kind">${[['all', 'همهٔ ترکیب‌ها'], ['named', 'فقط بااسم'], ['custom', 'فقط بی‌نام']].map(([v, t]) => `<option value="${v}"${rf.kind === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <select data-cs-rf="cash">${[['all', 'نقد: همه'], ['credit', 'نقد دریافتی امروز'], ['debit', 'نقد پرداختی امروز']].map(([v, t]) => `<option value="${v}"${rf.cash === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <select data-cs-rf="legs">${[['all', 'همهٔ پاها'], ['2', 'دوپایه'], ['3', 'سه‌پایه'], ['stock', 'با سهم پایه'], ['nostock', 'بی سهم پایه']].map(([v, t]) => `<option value="${v}"${rf.legs === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <label class="cs-inline">حجم شدنی دست‌کم <input type="number" min="1" step="1" data-cs-rf="minSets" value="${rf.minSets}" dir="ltr"> ست</label>
      <select data-cs-rf="sort"><option value="">مرتب: همان مرتب‌سازی اسکن</option>${RESULT_SORTS.map(([v, t]) => `<option value="${v}"${rf.sort === v ? ' selected' : ''}>مرتب: ${t}</option>`).join('')}</select>
      <button type="button" class="ghost cs-mini" data-cs-rf-reset>پاک کردن</button>
    </div>`;
    if (html === barMarkup || (quiet && host.contains(document.activeElement))) return;
    host.innerHTML = html;
    barMarkup = html;
  }

  const visibleGroups = () => (result ? filterGroups(result.groups, rf) : []);

  function summaryText(res) {
    const f = res.funnel;
    const shownN = visibleGroups().length;
    const book = res.bookFetch ? ` · دفتر سفارش ${fmt.int(res.bookFetch.asked)} نماد گرفته شد${res.bookFetch.note ? ` (${res.bookFetch.note})` : ''}` : '';
    return `${fmt.int(res.totalCombos)} ترکیب در ${fmt.int(res.totalGroups)} گروه${shownN !== res.groups.length ? ` · ${fmt.int(shownN)} گروه با فیلتر نتیجه‌ها` : ''} · ${fmt.int(res.uaCount)} نماد · وجه تضمین طبق ضوابط${book} · ${faNum((res.ms / 1000).toFixed(1))} ثانیه${f.truncated ? ' · به سقف ساخت رسید' : ''}`;
  }

  function funnelText(res) {
    const f = res.funnel;
    const book = res.cfg?.execRule === 'book'
      ? ` شرط دفتر زنده: ${fmt.int(f.noBook)} قرارداد بی دفتر تازه، ${fmt.int(f.notTradable)} نماد غیرمجاز، ${fmt.int(f.stockNoBook)} سهم پایه بی عرضهٔ واقعی کنار رفتند${res.firstPass ? ` (گذر اول روی سرخط دیده‌بان ${fmt.int(res.firstPass.groups)} گروه داشت)` : ''}.` : '';
    return `از ${fmt.int(f.built)} ترکیب ساخته‌شده روی ${fmt.int(f.expiries)} سررسید: ${fmt.int(f.unlimited)} زیان نامحدود، ${fmt.int(f.overLoss)} زیان بیش از سقف، ${fmt.int(f.noProfit)} بی سود، ${fmt.int(f.quickPop)} احتمال سود کم، ${fmt.int(f.unexecutable)} غیرقابل اجرا، ${fmt.int(f.filtered)} بیرون از فیلترها؛ ${fmt.int(f.kept)} ماند.${f.evalCapped ? ` ${fmt.int(f.evalCapped)} ترکیبِ کم‌امتیازتر به ارزیابی کامل نرسید.` : ''}${book}`;
  }

  /** پلکان کارت‌هایی که ریسه نساخته (پس از شصت گروه اول)، همین‌جا و فقط برای کارت‌های دیده‌شده. */
  function ensureLadder(r) {
    if (r.ladder || !r.evLegs) return;
    try {
      r.ladder = executionLadder({ legs: r.evLegs, quotes: r.quotes, ctx: r.ctx, settings: { ...s(), priceBasis: 'BOOK', showUnexecutable: false }, maxSets: r.maxQty, monthDays: s().daysPerMonth });
    } catch { r.ladder = []; }
  }

  function paintGrid() {
    const grid = $('cs-grid');
    if (!result) { grid.innerHTML = ''; return; }
    const list = visibleGroups();
    if (!list.length) {
      grid.innerHTML = result.groups.length
        ? '<p class="empty-note">فیلتر نتیجه‌ها همه را کنار گذاشت؛ «پاک کردن» را بزن.</p>'
        : `<p class="empty-note">${cfg.execRule === 'book' ? 'با دفتر سفارش زندهٔ همین لحظه ترکیب شدنی‌ای با این فیلترها نماند. ' : 'با این فیلترها ترکیبی نماند. '}احتمال سود یا سقف زیان را شل‌تر کن، دید بازار را «همه» بگذار، یا شرط اجرا را «سرخط دیده‌بان» کن.</p>`;
      return;
    }
    const page = list.slice(0, shown);
    for (const g of page) ensureLadder(g.best);
    const left = list.length - shown;
    // وصله، نه جایگزینی (۱۴۰۵/۰۷/۱۸): اسکنِ زنده کارت‌ها را درجا تازه
    // می‌کند و فوکوس و هاورِ کارت زیرِ دست نمی‌پرد.
    patchHTML(grid, page.map((g, i) => cardHtml(g, i)).join('')
      + (left > 0 ? `<button type="button" class="ghost cs-more" data-cs-more>نمایش ${fmt.int(Math.min(PAGE, left))} گروه دیگر (${fmt.int(left)} مانده)</button>` : ''));
  }

  function variantsHtml(group) {
    if (!group?.variants?.length) return '';
    return `<h4 class="cs-sub">همین قراردادها با نسبت‌های دیگر ${helpIcon('card-variants')}</h4><div class="cs-variants">${[group.best, ...group.variants].map((v) => `<button type="button" class="cs-variant${v.id === picked?.id ? ' on' : ''}" data-cs-chart="${esc(v.id)}">
      ${v.legsCard.map((l) => `${SIDE_FA[l.side]} ${faDigits(String(l.ratio))}`).join(' + ')} · بازده ${pct(v.retStaticMonthPct)} · احتمال ${pct(v.popPct, 0)} · زیان ${shortRial(v.maxLoss)}</button>`).join('')}</div>`;
  }

  // `quiet`: تازه‌سازی پس از اسکن (۱۴۰۵/۰۷/۱۸). گزارش صاحب پروژه: «بعد از
  // چند ثانیه نمودارها بسته می‌شود و دوباره باید دریافت اطلاعات کنم.» اسکنِ
  // زنده هر بار جزئیات را از نو می‌ساخت و با `scrollIntoView` کاربر را از هر
  // جای صفحه — حتی از تبِ دیگرِ رصد لحظه‌ای — به آن برمی‌گرداند. حالا فقط
  // انتخابِ کاربر پیمایش می‌کند؛ تازه‌سازی همان بزرگ‌نماییِ نمودار و همان جای
  // لغزنده را نگه می‌دارد، و اگر کاربر وسطِ کار با کنترلی درون جزئیات است، تا
  // بیرون آمدنش صبر می‌کند.
  function showDetail(id, { quiet = false } = {}) {
    const r = byId.get(id);
    if (!r) return;
    const host = $('cs-detail');
    const same = picked?.id === id && !host.hidden;
    if (quiet && same && host.contains(document.activeElement) && document.activeElement.matches('input, select, textarea')) { pendingId = id; return; }
    pendingId = '';
    const range = same ? chart?.view?.() : null;
    const slide = same ? host.querySelector('[data-cs-slide]')?.value : undefined;
    picked = r;
    ensureLadder(r);
    const group = result.groups.find((g) => g.key === r.groupKey);
    host.hidden = false;
    const fees = { buyStock: s().feeBuyStock, sellStock: s().feeSellStock, option: s().feeOption, exercise: s().feeExercise };
    const ex = execSummary(r);
    host.innerHTML = `
      <div class="cs-detail-top">
        <div>
          <p class="cs-eyebrow2">نمونهٔ زنده، اسکن ساعت ${esc(faClock(new Date(lastAt || Date.now())))} · ${r.bookLive ? 'قیمت و حجم از دفتر سفارش زنده' : 'سرخط دیده‌بان (سطح اول)'}</p>
          <h3>${esc(faDigits(r.uaName))} · ${esc(r.comboName)}${r.named ? '' : ' <small>(بی‌نام)</small>'} <span class="cs-view ${r.view}">${esc(r.viewLabel)}</span></h3>
          <ul class="cs-legs big">${r.legsCard.map(legLine).join('')}</ul>
          <p class="note">${setText(r)} · سررسید ${esc(faDigits(historyDateLabel(r.endDate)))} · ${fmt.int(r.days)} روز · قیمت پایه ${fmt.money(r.spot)}</p>
        </div>
        <button type="button" class="ghost cs-mini" data-cs-close>✕ بستن</button>
      </div>
      <div class="cs-detail-grid">
        <div class="cs-big"><b class="${tone(r.retStaticMonthPct)}">${pct(r.retStaticMonthPct)}</b><span>بازده ماهانه، اگر قیمت ${esc(faDigits(r.uaName))} ثابت بماند</span></div>
        <div class="cs-big"><b>${pct(r.popPct)}</b><span>احتمال سود</span></div>
        <div class="cs-big"><b class="loss">${esc(fmt.rialText(r.maxLoss))}</b><span>بیشترین زیان یک ست · سرمایهٔ لازم ${esc(fmt.rialText(r.capital))}</span></div>
        <div class="cs-big"><b>${esc(ex.text)}</b><span>${fin(ex.netCash) ? `نقد امروز ${esc(fmt.rialText(ex.netCash))} · سرمایهٔ کل ${esc(fmt.rialText(ex.capital))}` : 'حجم شدنی همین لحظه'}</span></div>
      </div>
      <h4 class="cs-sub">اگر قیمت ${esc(faDigits(r.uaName))} در سررسید … ${helpIcon('detail-ruler')}</h4>
      ${rulerHtml(r, { interactive: true })}
      <h4 class="cs-sub">سود و زیان، بازه‌به‌بازه ${helpIcon('detail-scenarios')}</h4>
      <ul class="cs-scn-list">${scenarioLines(r).map((x) => `<li class="${x.sign}${x.here ? ' here' : ''}">${esc(x.text)}</li>`).join('')}</ul>
      <p class="note">سربه‌سر: ${breakevenText(r)}</p>
      <h4 class="cs-sub">با چه حجمی؟ پلکان دفتر سفارش ${helpIcon('detail-ladder')}</h4>
      <p class="note">${setText(r)}. قیمت هر پا برای هر حجم، میانگین سطرهایی از دفتر است که لازم دارد.</p>
      ${ladderHtml(r.ladder || [])}
      <h4 class="cs-sub">نمودار کامل ${helpIcon('detail-chart')}</h4>
      <div id="cs-chart" class="cs-chart"></div>
      <dl class="cs-kv">
        <dt>نقد خالص امروز (یک ست)</dt><dd class="${tone(r.netCash)}">${esc(fmt.rialText(r.netCash))}</dd>
        <dt>کارمزد ورود</dt><dd>${esc(fmt.rialText(r.entryFee))}</dd>
        <dt>وجه تضمین</dt><dd>${esc(fmt.rialText(r.margin))}</dd>
        <dt>بیشترین سود</dt><dd class="gain">${r.unlimitedProfit ? 'نامحدود' : esc(fmt.rialText(r.maxProfit))}</dd>
        <dt>بازده دوره (بهترین حالت)</dt><dd>${pct(r.retMaxPct)}</dd>
        <dt>قید حجم</dt><dd>${r.binding ? esc(r.binding) : '—'}</dd>
        <dt>نقدشوندگی</dt><dd>${(r.liquidity?.parts || []).map((p) => `<span class="cs-chip ${p.ok ? 'ok' : 'no'}">${p.ok ? '✔' : '✘'} ${esc(p.label)}</span>`).join(' ')}</dd>
      </dl>
      ${variantsHtml(group)}`;
    chart?.destroy();
    chart = mountPayoff(host.querySelector('#cs-chart'), r.chart.legs, r.chart.netCash, {
      fees, spot: r.spot, width: 760, height: 280, sigma: r.sigmaUse, rFree: s().rFree, divYield: s().divYield,
      ...(range ? { initRange: range } : {}),
    });
    const slider = slide != null ? host.querySelector('[data-cs-slide]') : null;
    if (slider) { slider.value = slide; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    root.querySelectorAll('.cs-card').forEach((c) => c.classList.toggle('picked', c.dataset.csId === group?.best?.id));
    if (!quiet) host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ترکیبی که در اسکنِ تازه نیامد، جزئیاتش بسته نمی‌شود (۱۴۰۵/۰۷/۱۸): همان
  // آخرین عددها می‌مانند، با برچسبی که می‌گوید مالِ کدام اسکن‌اند.
  function markGone() {
    const host = $('cs-detail');
    let note = host.querySelector('[data-cs-gone]');
    if (!note) { host.insertAdjacentHTML('afterbegin', '<p class="note warn" data-cs-gone></p>'); note = host.querySelector('[data-cs-gone]'); }
    note.textContent = `این ترکیب در اسکن ساعت ${faClock(new Date(lastAt))} دیگر نیامد؛ عددهای زیر مال آخرین اسکنی است که در آن بود.`;
  }

  // `auto`: تیکِ «زنده» (۱۴۰۵/۰۷/۱۸). اسکنِ خودکار روی نتیجهٔ موجود جملهٔ
  // «در حال…» نمی‌گذارد، «نمایش بیشتر» را به ۲۴ کارت برنمی‌گرداند، و با خطا
  // یا پاسخِ خالی آخرین نتیجهٔ خوب را پاک نمی‌کند — فقط می‌گوید این دور چه شد.
  async function run({ auto = false } = {}) {
    if (busy) return;
    const quiet = auto && Boolean(result);
    if (!chainState.list.length) { if (!quiet) $('cs-summary').textContent = 'زنجیرهٔ بازار هنوز نرسیده؛ چند ثانیه صبر کن.'; return; }
    busy = true;
    $('cs-run').disabled = true; $('cs-run').textContent = 'در حال اسکن…';
    if (!quiet) $('cs-summary').textContent = 'در حال ترکیب سهم، کال و پوت…';
    try {
      const res = await runComboScan({
        uaKeys: uaPick ? [uaPick] : [], settings: s(), scanner: cfg,
        onStage: (stage, info) => {
          if (quiet) return;
          if (stage === 'one') $('cs-summary').textContent = `گذر اول: ${fmt.int(info.totalGroups)} گروه نامزد روی سرخط دیده‌بان؛ در حال گرفتن دفتر سفارش…`;
          if (stage === 'book') $('cs-summary').textContent = `در حال گرفتن دفتر سفارش زندهٔ ${fmt.int(info.asked)} نماد…`;
        },
      });
      const kept = `کارت‌ها همان اسکن ساعت ${faClock(new Date(lastAt))} هستند.`;
      if (res.error) {
        $('cs-summary').textContent = quiet ? `${summaryText(result)}؛ اسکن خودکار ساعت ${faClock(new Date())} ناموفق بود (${res.error}). ${kept}` : `خطا: ${res.error}`;
        return;
      }
      if (quiet && !res.groups.length && result.groups.length) {
        $('cs-summary').textContent = `${summaryText(result)}؛ اسکن خودکار ساعت ${faClock(new Date())} ترکیبی نیافت. ${kept}`;
        return;
      }
      result = res; lastAt = Date.now();
      if (!auto) shown = PAGE;
      byId.clear();
      for (const g of res.groups) for (const v of [g.best, ...g.variants]) byId.set(v.id, v);
      paintResultsBar({ quiet: auto });
      $('cs-summary').textContent = summaryText(res);
      $('cs-funnel').textContent = funnelText(res);
      $('cs-clock').textContent = faClock(new Date(lastAt));
      paintGrid();
      if (picked && byId.has(picked.id)) showDetail(picked.id, { quiet: true });
      else if (picked) markGone();
    } finally {
      busy = false;
      $('cs-run').disabled = false; $('cs-run').textContent = 'اسکن کن';
    }
  }

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  function setLive(on) {
    live = on;
    $('cs-live').setAttribute('aria-pressed', String(on));
    clearInterval(timer);
    if (on) { run(); timer = setInterval(() => run({ auto: true }), Math.max(15, num(s().watchIntervalSec) * 4) * 1000); }
  }

  // ── راهنمای «؟» و خوانش نمودار کوچک ─────────────────────────────
  function placeTip(html, x, y) {
    tipBox.innerHTML = html;
    tipBox.hidden = false;
    const w = tipBox.offsetWidth, h = tipBox.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + h > window.innerHeight - 8) top = y - h - 14;
    tipBox.style.left = `${Math.max(8, left)}px`;
    tipBox.style.top = `${Math.max(8, top)}px`;
  }
  const hideTip = () => { tipBox.hidden = true; };
  function sparkRead(box, clientX) {
    const r = byId.get(box.dataset.csSpark);
    if (!r) return null;
    const rect = box.querySelector('svg').getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const lo = Number(box.dataset.lo), hi = Number(box.dataset.hi);
    return readAt(r, lo + t * (hi - lo));
  }
  root.addEventListener('pointermove', (e) => {
    const help = e.target.closest?.('[data-help]');
    if (help && root.contains(help)) { placeTip(`<div class="sl-tip-help">${esc(help.dataset.help)}</div>`, e.clientX, e.clientY); return; }
    const box = e.target.closest?.('[data-cs-spark]');
    if (box && root.contains(box)) {
      const rd = sparkRead(box, e.clientX);
      if (rd) { placeTip(`<div class="cs-tip-read ${rd.pnl >= 0 ? 'gain' : 'loss'}">${esc(rd.text)}</div>`, e.clientX, e.clientY); return; }
    }
    if (!tipBox.hidden) hideTip();
  });
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('focusin', (e) => {
    const help = e.target.closest?.('[data-help]');
    if (!help) return;
    const b = help.getBoundingClientRect();
    placeTip(`<div class="sl-tip-help">${esc(help.dataset.help)}</div>`, b.left, b.bottom);
  });
  root.addEventListener('focusout', (e) => { if (e.target.closest?.('[data-help]')) hideTip(); });
  // تازه‌سازیِ عقب‌افتاده همین که کاربر از جزئیات بیرون آمد.
  $('cs-detail').addEventListener('focusout', (e) => {
    if (!pendingId || $('cs-detail').contains(e.relatedTarget)) return;
    const id = pendingId;
    pendingId = '';
    if (byId.has(id)) showDetail(id, { quiet: true });
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-help]')) { e.stopPropagation(); return; }
    const el = e.target.closest('button, [data-cs-id]');
    if (!el || !root.contains(el)) return;
    if (el.id === 'cs-run') { run(); return; }
    if (el.id === 'cs-live') { setLive(!live); return; }
    if (el.dataset.csSort) {
      cfg = scannerConfig({ ...cfg, sort: el.dataset.csSort }); save();
      root.querySelectorAll('[data-cs-sort]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.csSort === cfg.sort)));
      run(); return;
    }
    if (el.dataset.csSet) {
      const key = el.dataset.csSet, raw = el.dataset.v;
      cfg = scannerConfig({ ...cfg, [key]: Number.isFinite(Number(raw)) && !['view', 'execRule'].includes(key) ? Number(raw) : raw });
      save(); paintFilters(); return;
    }
    if (el.hasAttribute('data-cs-more')) { shown += PAGE; paintGrid(); return; }
    if (el.hasAttribute('data-cs-rf-reset')) { rf = emptyResultFilter(); save(); paintResultsBar(); shown = PAGE; paintGrid(); $('cs-summary').textContent = summaryText(result); return; }
    if (el.hasAttribute('data-cs-reset')) { cfg = scannerConfig(SCANNER_DEFAULTS); uaPick = ''; save(); paintFilters(); return; }
    if (el.dataset.csChart || el.dataset.csVariants) { showDetail(el.dataset.csChart || el.dataset.csVariants); return; }
    if (el.hasAttribute('data-cs-close')) { $('cs-detail').hidden = true; chart?.destroy(); chart = null; picked = null; return; }
    if (el.dataset.csId && !e.target.closest('button')) showDetail(el.dataset.csId);
  });
  root.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('[data-cs-id]');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showDetail(card.dataset.csId); }
  });
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.csSlide) {
      // ترکیبِ «دیگر نیامده» هنوز در جزئیات است و لغزنده‌اش باید کار کند.
      const r = byId.get(el.dataset.csSlide) || (picked?.id === el.dataset.csSlide ? picked : null);
      const out = el.closest('.cs-ruler')?.querySelector('[data-cs-readout]');
      if (r && out) {
        const rd = readAt(r, Number(el.value));
        out.textContent = rd.text;
        out.className = `cs-readout ${rd.pnl >= 0 ? 'gain' : 'loss'}`;
      }
      return;
    }
    if (el.dataset.csRf === 'q') { rf = { ...rf, q: el.value }; save(); shown = PAGE; paintGrid(); $('cs-summary').textContent = summaryText(result); }
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.csRf && el.dataset.csRf !== 'q') {
      const k = el.dataset.csRf;
      rf = { ...rf, [k]: k === 'minSets' ? Math.max(1, Math.round(Number(el.value) || 1)) : el.value };
      save(); shown = PAGE; paintGrid(); $('cs-summary').textContent = summaryText(result); return;
    }
    if (el.dataset.csNum) {
      const v = el.value === '' ? NaN : Number(el.value);
      const key = el.dataset.csNum;
      if (key === 'maxLossM') cfg = scannerConfig({ ...cfg, maxLossPerSet: fin(v) ? v * MILLION : SCANNER_DEFAULTS.maxLossPerSet });
      else if (key === 'maxCapitalM') cfg = scannerConfig({ ...cfg, maxCapital: fin(v) ? v * MILLION : 0 });
      else cfg = scannerConfig({ ...cfg, [key]: fin(v) ? v : SCANNER_DEFAULTS[key] });
      save(); paintFilters(); return;
    }
    if (el.matches('[data-cs-ua]')) { uaPick = el.value; save(); paintFilters(); return; }
    if (el.matches('[data-cs-stock]')) { cfg = scannerConfig({ ...cfg, allowStock: el.checked }); save(); }
  });

  paintFilters();
  // فهرست نماد هر ۵ ثانیه با زنجیره می‌رسد؛ فیلترها فقط وقتی دوباره کشیده
  // می‌شوند که خودِ فهرست عوض شده باشد، وگرنه عددِ در حال تایپ پاک می‌شد.
  let listSig = '';
  const offChain = onChain((cs) => {
    const sig = (cs.list || []).map((u) => u.ins).join(',');
    if (sig === listSig) return;
    listSig = sig;
    if (!root.contains(document.activeElement) || !document.activeElement.matches('input, select')) paintFilters();
  });
  const offWatch = api.subscribeWatch((w) => pushRows(w, !w.changed));
  return () => { offWatch(); offChain(); clearInterval(timer); chart?.destroy(); };
}

