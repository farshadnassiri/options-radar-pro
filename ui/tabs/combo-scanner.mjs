// زیرتب «اسکنر آپشن» در رصد لحظه‌ای بازار.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۳): ترکیب آزاد سهم پایه، کال و پوت با
// نسبت‌های مختلف؛ کارتی و دیداری، «تا معامله‌گر با یک نگاه ساده بتواند
// تصمیم بگیرد». هر کارت: نماد و نام ترکیب (یا «بی‌نام»)، دید بازار، روز تا
// سررسید، پاها با قیمت سرخط، بازده ماهانه اگر قیمت پایه ثابت بماند،
// احتمال سود، بیشترین زیان، سرمایهٔ لازم، چند ست قابل اجراست، نقدشوندگی،
// منحنی کوچک سود و زیان، و باز کردن همان ترکیب در نمودار با یک کلیک.
//
// محاسبه در `core/combo-scanner.mjs` و در ریسهٔ غربال است؛ این فایل فقط
// فیلتر می‌گیرد، نتیجه را می‌کشد و نمودار را سوار می‌کند.

import { fmt, faDigits, faNum, faClock } from '/ui/fmt.mjs';
import { runComboScan, onChain, pushRows, chainState } from '/ui/scanner.mjs';
import { mountPayoff } from '/ui/chart.mjs';
import {
  SCANNER_DEFAULTS, SCANNER_VIEWS, SCANNER_SORTS, scannerConfig,
} from '/core/combo-scanner.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { esc, pct, tone, shortRial, SIDE_FA, legLine, cardHtml } from '/ui/combo-scanner-view.mjs';

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
  let cfg = scannerConfig({ ...SCANNER_DEFAULTS, ...readStore() });
  let uaPick = readStore().uaPick || '';
  let live = false, busy = false, timer = null, result = null, picked = null, chart = null, lastAt = 0;
  // یک نگاه: اول ۲۴ کارت، بقیه با «نمایش بیشتر».
  const PAGE = 24;
  let shown = PAGE;
  const byId = new Map();

  root.innerHTML = `
    <section class="cs-hero">
      <div>
        <p class="cs-eyebrow"><i></i> جست‌وجوی زنده در کل بازار اختیار</p>
        <h2>اسکنر آپشن</h2>
        <p class="cs-lead">سهم پایه، کال و پوت را با نسبت‌های مختلف ترکیب می‌کند و ترکیب‌های <b class="gain">پربازده</b> با <b class="accent">ریسک محدود</b> را پیدا می‌کند؛ حتی آن‌هایی که اسم ندارند.</p>
      </div>
      <div class="cs-hero-ctl">
        <button type="button" class="cs-live" id="cs-live" aria-pressed="false"><i></i><span>زنده</span></button>
        <span class="cs-clock" id="cs-clock">—</span>
        <button type="button" class="btn" id="cs-run">اسکن کن</button>
      </div>
    </section>
    <section class="card cs-filters" id="cs-filters"></section>
    <div class="cs-summary"><span id="cs-summary" role="status" aria-live="polite">هنوز اسکن نزدی — «اسکن کن» را بزن.</span>
      <div class="cs-sort" role="tablist">${SCANNER_SORTS.map(([id, label]) => `<button type="button" role="tab" data-cs-sort="${id}" aria-selected="${cfg.sort === id}">${label}</button>`).join('')}</div></div>
    <div class="cs-grid" id="cs-grid"></div>
    <section class="card cs-detail" id="cs-detail" hidden></section>
    <p class="note cs-funnel" id="cs-funnel"></p>
    <p class="note">عددها با هر اسکن عوض می‌شوند. قیمت هر پا سرخط همان لحظه است (فروش به بهترین تقاضا، خرید به بهترین عرضه)، با کارمزد و وجه تضمین طبق ضوابط. «بازده ماهانه» یعنی اگر قیمت پایه تا سررسید همین بماند. هیچ کارتی پیشنهاد خرید یا فروش نیست.</p>`;

  const $ = (id) => root.querySelector(`#${id}`);

  function save() { writeStore({ ...cfg, uaPick }); }

  const seg = (key, list, val) => `<div class="cs-seg" role="radiogroup">${list.map(([v, t]) => `<button type="button" data-cs-set="${key}" data-v="${v}" aria-pressed="${String(val) === String(v)}">${t}</button>`).join('')}</div>`;
  const numField = (key, label, val, unit, step = 1) => `<label class="cs-field"><span>${label}</span><input type="number" min="0" step="${step}" data-cs-num="${key}" value="${fin(val) ? val : ''}" dir="ltr"><small>${unit}</small></label>`;

  function activeCount() {
    let n = 0;
    if (cfg.view !== 'all') n += 1;
    if (cfg.maxCapital > 0) n += 1;
    if (cfg.minPop > 0) n += 1;
    if (cfg.maxLossPerSet > 0) n += 1;
    if (cfg.minLiquidity > 0) n += 1;
    if (uaPick) n += 1;
    return n;
  }

  function paintFilters() {
    const list = chainState.list || [];
    $('cs-filters').innerHTML = `
      <div class="cs-filter-head"><b>⚙ فیلترها <span class="cs-badge">${faDigits(String(activeCount()))}</span></b>
        <span class="note">فیلترها همین‌جا در مرورگر می‌مانند (فیلتر دلخواه).</span>
        <button type="button" class="ghost cs-mini" data-cs-reset>بازگشت به پیش‌فرض</button></div>
      <div class="cs-filter-grid">
        <div class="cs-fld"><span>دید بازار</span>${seg('view', SCANNER_VIEWS, cfg.view)}</div>
        <label class="cs-field"><span>نماد پایه</span><select data-cs-ua><option value="">کل بازار (${fmt.int(list.length)} نماد)</option>${list.map((u) => `<option value="${esc(u.ins)}"${String(u.ins) === uaPick ? ' selected' : ''}>${esc(faDigits(u.name))}</option>`).join('')}</select></label>
        ${numField('minPop', 'احتمال سود دست‌کم', cfg.minPop, '٪', 5)}
        ${numField('maxLossM', 'زیان هر ست حداکثر', cfg.maxLossPerSet / MILLION, 'میلیون ریال', 1)}
        ${numField('maxCapitalM', 'سرمایهٔ لازم حداکثر', cfg.maxCapital > 0 ? cfg.maxCapital / MILLION : NaN, 'میلیون ریال · خالی یعنی بی‌سقف', 1)}
        <div class="cs-fld"><span>نقدشوندگی دست‌کم</span>${seg('minLiquidity', [0, 1, 2, 3, 4].map((n) => [n, faDigits(`${n}/۴`)]), cfg.minLiquidity)}</div>
        <div class="cs-fld"><span>سررسید (روز)</span><div class="cs-range">${numField('minDays', 'از', cfg.minDays, 'روز')}${numField('maxDays', 'تا', cfg.maxDays, 'روز')}</div></div>
        <div class="cs-fld"><span>پاها و نسبت</span>${seg('maxLegs', [[2, 'دو پا'], [3, 'تا سه پا']], cfg.maxLegs)}${seg('maxRatio', [[1, 'فقط ۱:۱'], [2, 'تا ۲'], [3, 'تا ۳']], cfg.maxRatio)}</div>
        <label class="cs-check"><input type="checkbox" data-cs-stock ${cfg.allowStock ? 'checked' : ''}> خرید سهم پایه هم پا باشد</label>
      </div>
      ${cfg.maxLegs >= 3 && !uaPick ? '<p class="note warn">سه‌پایه روی کل بازار ده‌ها هزار ترکیب می‌سازد؛ اسکن کندتر است و ممکن است به سقف برسد. یک نماد انتخاب کن.</p>' : ''}`;
  }

  function summaryText(res) {
    const f = res.funnel;
    return `${fmt.int(res.totalCombos)} ترکیب در ${fmt.int(res.totalGroups)} گروه · ${fmt.int(res.uaCount)} نماد · وجه تضمین طبق ضوابط · ${faNum((res.ms / 1000).toFixed(1))} ثانیه${f.truncated ? ' · به سقف ساخت رسید' : ''}`;
  }

  function funnelText(f) {
    return `از ${fmt.int(f.built)} ترکیب ساخته‌شده روی ${fmt.int(f.expiries)} سررسید: ${fmt.int(f.unlimited)} زیان نامحدود، ${fmt.int(f.overLoss)} زیان بیش از سقف، ${fmt.int(f.noProfit)} بی سود، ${fmt.int(f.quickPop)} احتمال سود کم، ${fmt.int(f.unexecutable)} غیرقابل اجرا با سرخط، ${fmt.int(f.filtered)} بیرون از فیلترها؛ ${fmt.int(f.kept)} ماند.${f.evalCapped ? ` ${fmt.int(f.evalCapped)} ترکیبِ کم‌امتیازتر به ارزیابی کامل نرسید.` : ''}`;
  }

  function paintGrid() {
    const grid = $('cs-grid');
    if (!result) { grid.innerHTML = ''; return; }
    if (!result.groups.length) {
      grid.innerHTML = '<p class="empty-note">با این فیلترها ترکیبی نماند. احتمال سود یا سقف زیان را شل‌تر کن، یا دید بازار را «همه» بگذار.</p>';
      return;
    }
    const left = result.groups.length - shown;
    grid.innerHTML = result.groups.slice(0, shown).map((g, i) => cardHtml(g, i)).join('')
      + (left > 0 ? `<button type="button" class="ghost cs-more" data-cs-more>نمایش ${fmt.int(Math.min(PAGE, left))} گروه دیگر (${fmt.int(left)} مانده)</button>` : '');
  }

  function variantsHtml(group) {
    if (!group?.variants?.length) return '';
    return `<h4 class="cs-sub">همین قراردادها با نسبت‌های دیگر</h4><div class="cs-variants">${[group.best, ...group.variants].map((v) => `<button type="button" class="cs-variant${v.id === picked?.id ? ' on' : ''}" data-cs-chart="${esc(v.id)}">
      ${v.legsCard.map((l) => `${SIDE_FA[l.side]} ${faDigits(String(l.ratio))}`).join(' + ')} · بازده ${pct(v.retStaticMonthPct)} · احتمال ${pct(v.popPct, 0)} · زیان ${shortRial(v.maxLoss)}</button>`).join('')}</div>`;
  }

  function showDetail(id) {
    const r = byId.get(id);
    if (!r) return;
    picked = r;
    const group = result.groups.find((g) => g.key === r.groupKey);
    const host = $('cs-detail');
    host.hidden = false;
    const fees = { buyStock: s().feeBuyStock, sellStock: s().feeSellStock, option: s().feeOption, exercise: s().feeExercise };
    host.innerHTML = `
      <div class="cs-detail-top">
        <div>
          <p class="cs-eyebrow2">نمونهٔ زنده، اسکن ساعت ${esc(faClock(new Date(lastAt || Date.now())))}</p>
          <h3>${esc(faDigits(r.uaName))} · ${esc(r.comboName)}${r.named ? '' : ' <small>(بی‌نام)</small>'} <span class="cs-view ${r.view}">${esc(r.viewLabel)}</span></h3>
          <ul class="cs-legs big">${r.legsCard.map(legLine).join('')}</ul>
          <p class="note">سررسید ${esc(faDigits(historyDateLabel(r.endDate)))} · ${fmt.int(r.days)} روز · قیمت پایه ${fmt.money(r.spot)}</p>
        </div>
        <button type="button" class="ghost cs-mini" data-cs-close>✕ بستن</button>
      </div>
      <div class="cs-detail-grid">
        <div class="cs-big"><b class="${tone(r.retStaticMonthPct)}">${pct(r.retStaticMonthPct)}</b><span>بازده ماهانه، اگر قیمت ${esc(faDigits(r.uaName))} ثابت بماند</span></div>
        <div class="cs-big"><b>${pct(r.popPct)}</b><span>احتمال سود</span></div>
        <div class="cs-big"><b class="loss">${esc(fmt.rialText(r.maxLoss))}</b><span>بیشترین زیان · سرمایهٔ لازم ${esc(fmt.rialText(r.capital))}</span></div>
      </div>
      <div id="cs-chart" class="cs-chart"></div>
      <dl class="cs-kv">
        <dt>نقد خالص امروز</dt><dd class="${tone(r.netCash)}">${esc(fmt.rialText(r.netCash))}</dd>
        <dt>کارمزد ورود</dt><dd>${esc(fmt.rialText(r.entryFee))}</dd>
        <dt>وجه تضمین</dt><dd>${esc(fmt.rialText(r.margin))}</dd>
        <dt>بیشترین سود</dt><dd class="gain">${r.unlimitedProfit ? 'نامحدود' : esc(fmt.rialText(r.maxProfit))}</dd>
        <dt>سربه‌سر</dt><dd>${(r.breakevens || []).map((b) => fmt.money(b)).join('، ') || '—'}</dd>
        <dt>بازده دوره (بهترین حالت)</dt><dd>${pct(r.retMaxPct)}</dd>
        <dt>قابل اجرا با سرخط</dt><dd>${fin(r.maxQty) ? `${fmt.int(r.maxQty)} ست` : '—'}${r.binding ? ` <small>(قید: ${esc(r.binding)})</small>` : ''}</dd>
        <dt>نقدشوندگی</dt><dd>${(r.liquidity?.parts || []).map((p) => `<span class="cs-chip ${p.ok ? 'ok' : 'no'}">${p.ok ? '✔' : '✘'} ${esc(p.label)}</span>`).join(' ')}</dd>
      </dl>
      ${variantsHtml(group)}`;
    chart?.destroy();
    chart = mountPayoff(host.querySelector('#cs-chart'), r.chart.legs, r.chart.netCash, {
      fees, spot: r.spot, width: 760, height: 280, sigma: r.sigmaUse, rFree: s().rFree, divYield: s().divYield,
    });
    root.querySelectorAll('.cs-card').forEach((c) => c.classList.toggle('picked', c.dataset.csId === r.id || c.dataset.csId === group?.best?.id));
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function run() {
    if (busy) return;
    if (!chainState.list.length) { $('cs-summary').textContent = 'زنجیرهٔ بازار هنوز نرسیده؛ چند ثانیه صبر کن.'; return; }
    busy = true;
    $('cs-run').disabled = true; $('cs-run').textContent = 'در حال اسکن…';
    $('cs-summary').textContent = 'در حال ترکیب سهم، کال و پوت…';
    try {
      const res = await runComboScan({ uaKeys: uaPick ? [uaPick] : [], settings: s(), scanner: cfg });
      if (res.error) { $('cs-summary').textContent = `خطا: ${res.error}`; return; }
      result = res; lastAt = Date.now(); shown = PAGE;
      byId.clear();
      for (const g of res.groups) for (const v of [g.best, ...g.variants]) byId.set(v.id, v);
      $('cs-summary').textContent = summaryText(res);
      $('cs-funnel').textContent = funnelText(res.funnel);
      $('cs-clock').textContent = faClock(new Date(lastAt));
      paintGrid();
      if (picked && byId.has(picked.id)) showDetail(picked.id);
      else { $('cs-detail').hidden = true; picked = null; }
    } finally {
      busy = false;
      $('cs-run').disabled = false; $('cs-run').textContent = 'اسکن کن';
    }
  }

  function setLive(on) {
    live = on;
    $('cs-live').setAttribute('aria-pressed', String(on));
    clearInterval(timer);
    if (on) { run(); timer = setInterval(run, Math.max(15, num(s().watchIntervalSec) * 4) * 1000); }
  }
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  root.addEventListener('click', (e) => {
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
      cfg = scannerConfig({ ...cfg, [key]: Number.isFinite(Number(raw)) && key !== 'view' ? Number(raw) : raw });
      save(); paintFilters(); return;
    }
    if (el.hasAttribute('data-cs-more')) { shown += PAGE; paintGrid(); return; }
    if (el.hasAttribute('data-cs-reset')) { cfg = scannerConfig(SCANNER_DEFAULTS); uaPick = ''; save(); paintFilters(); return; }
    if (el.dataset.csChart || el.dataset.csVariants) { showDetail(el.dataset.csChart || el.dataset.csVariants); return; }
    if (el.hasAttribute('data-cs-close')) { $('cs-detail').hidden = true; chart?.destroy(); chart = null; picked = null; return; }
    if (el.dataset.csId && !e.target.closest('button')) showDetail(el.dataset.csId);
  });
  root.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('[data-cs-id]');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showDetail(card.dataset.csId); }
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
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
