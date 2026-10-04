// تب «استرانگل فروش در بوتهٔ آزمایش».
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۲): «بک‌تست و اصلاح استرانگل فروش را به
// راحتی و با سرعت و با دیتای همان زمان انجام بدهیم.» روزبه‌روز: پایان هر
// روز، پیشنهاد الگوریتم با دادهٔ پایانیِ همان روز؛ انتخاب کاربر؛ روز بعد.
//
// هیچ محاسبهٔ مالی اینجا نیست. موتور `core/strangle-lab.mjs` است و نمودارها
// و کارت‌ها `ui/strangle-lab-view.mjs`. این فایل فقط داده می‌آورد، وضعیت
// آزمایش را نگه می‌دارد و رویدادها را سیم‌کشی می‌کند.
//
// ═══ بی‌نگاه به آینده ═══
//
// تا وقتی کاربر روزی را پشت سر نگذاشته، قیمت آن روز روی صفحه نمی‌آید (مگر
// با کلید صریح «نمایش آینده»). بخش مقایسه که ذاتاً همهٔ آینده را می‌بیند،
// جدا و با همین برچسب است.
//
// ═══ ماندگاری ═══
//
// آزمایش‌ها در حافظهٔ مرورگر می‌مانند: تنظیم، ورود و تصمیم‌ها — نه قیمت‌ها.
// قیمت هر بار از همان مسیر تاریخی تازه گرفته می‌شود.

import {
  LAB_DEFAULTS, LAB_CHOICES, SIDES, SIDE_FA, POLICIES, BRANCH_OPTIONS,   labConfig, labBases, labExpiries, pickExpiry, buildLabMarket, pricingContext,
  strikeBoard, pickEntry, openPosition, evaluateDay, applyAction, adjustCandidate, defendAction,
  runPath, planDecider, pathStats, labMargin, enumeratePaths, pathsSummary, percentileOf,
  whatIfMatrix, actionKey,
} from '/core/strangle-lab.mjs';
import { parseJalaliRange, todayCompact, daysBefore, buildLine } from '/core/history-range.mjs';
import { historyDateLabel, daysBetween, normalizeHistoryDate } from '/core/history.mjs';
import { defaults, feesOf, marginParamsOf } from '/core/settings.mjs';
import { dailiesFor } from '/ui/strategy-history.mjs';
import { fmt, faDigits } from '/ui/fmt.mjs';
import { logError } from '/ui/errlog.mjs';
import {
  esc, money, tone, pct, price, strikeFa, dateFa, shortDateFa, dayNameFa, actionText, reasonText,
  srcBadge, channelSvg, pnlSvg, fanSvg, histSvg, gaugeHtml, timelineHtml, whatIfHtml, choiceChips,
} from '/ui/strangle-lab-view.mjs';

const STORE = 'strangle-lab.v1';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const uid = () => `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    return raw && Array.isArray(raw.list) ? raw : { list: [] };
  } catch { return { list: [] }; }
}
function writeStore(store) {
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) { logError('ذخیرهٔ آزمایش استرانگل', e, 'warn'); }
}

/** تاریخ شمسیِ نمایشی از تاریخ فشردهٔ میلادی (رقم لاتین، برای فیلد ورودی). */
const jalaliInput = (compact) => faDigits(historyDateLabel(compact));

/** پارامترهای فرم قواعد: [کلید، برچسب، نوع، راهنما]. */
const RULE_FIELDS = [
  ['ورود (۲.۱ و ۲.۲)', [
    ['dteLo', 'روز تا سررسید از', 'num', 'بازهٔ پیشنهادی ۴۵ تا ۵۰ روز'],
    ['dteHi', 'تا', 'num'],
    ['entryMethod', 'روش انتخاب قیمت اعمال', 'pick'],
    ['deltaLo', 'دلتای هدف از', 'num', 'قدرمطلق دلتا؛ ۰٫۱۶ تا ۰٫۲۰ یعنی احتمال موفقیت ۷۰ تا ۸۰٪'],
    ['deltaHi', 'تا', 'num'],
    ['otmPct', 'فاصله از پایه (٪)', 'num', 'فقط در روش «درصد فاصله»'],
  ]],
  ['سرمایه (۱.۰)', [
    ['qty', 'تعداد قرارداد (لات)', 'num'],
    ['capitalMult', 'ضریب سرمایه به وجه تضمین', 'num', '۳ یعنی فقط حدود ۳۳٪ سرمایه درگیر وجه تضمین است'],
    ['varLimitPct', 'سقف زیان حساب (٪ سرمایه)', 'num', 'بند ۱.۲ — محدودهٔ ایمن ۱۰ تا ۱۵٪'],
  ]],
  ['حد سود و ضرر (۲.۳ و ۵)', [
    ['tpPct', 'حد سود (٪ پرمیوم اولیه)', 'num', '۱۰۰٪ یعنی کل پرمیوم — عملاً نگه‌داشتن تا سررسید'],
    ['slPct', 'حد ضرر (٪ پرمیوم اولیه)', 'num'],
  ]],
  ['تعدیل (۳)', [
    ['trigLo', 'آستانهٔ تعدیل از (٪ سود هدف)', 'num'],
    ['trigHi', 'تا (٪)', 'num', 'بالاتر از این «تعدیل دیرهنگام» است، ولی باز تعدیل پیشنهاد می‌شود'],
    ['trigBasis', 'زیان شناور شمرده شود', 'pick', '«از آخرین تعدیل» همان خوانش ۳.۲.۳ است'],
    ['matchRule', 'برابری پرمیوم (۳.۲.۲)', 'pick', 'قیمت‌های اعمال گسسته‌اند؛ برابری دقیق کم پیش می‌آید'],
  ]],
  ['استرادل (۴)', [
    ['ratio3x', 'آستانهٔ ناپایداری (برابر)', 'num'],
    ['straddleExitDays', 'روزهای پایانی برای خروج', 'num'],
    ['unstableEarly', 'ناپایدار با روز زیاد', 'pick'],
    ['breakevenRule', 'خروج سربه‌سر (۵.۳)', 'pick'],
  ]],
  ['داده', [
    ['fees', 'کارمزد معامله و اعمال (از تنظیمات)', 'bool'],
    ['modelFill', 'قیمت مدل برای روز بی‌معامله', 'bool', 'بلک-شولز با IVِ آخرین روزِ معامله‌شده؛ هر جا بنشیند برچسب «مدل» دارد'],
    ['exitFallback', 'اگر روز خروج یکی از پاها معامله نشد', 'pick', 'قیمت ساخته نمی‌شود؛ یا بستن در آخرین روزِ واقعیِ قیمت‌دار، یا نتیجهٔ نامعلوم'],
  ]],
];

function rulesFormHtml(cfg, prefix = 'cfg') {
  return RULE_FIELDS.map(([title, fields]) => `<fieldset class="sl-rules-group"><legend>${esc(title)}</legend>${fields.map(([key, label, kind, hint]) => {
    const id = `${prefix}-${key}`;
    const help = hint ? `<small class="sl-hint">${esc(hint)}</small>` : '';
    if (kind === 'bool') {
      return `<label class="sl-check" for="${id}"><input type="checkbox" id="${id}" data-cfg="${key}" ${cfg[key] ? 'checked' : ''}> ${esc(label)}${help}</label>`;
    }
    if (kind === 'pick') {
      return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" data-cfg="${key}">${LAB_CHOICES[key]
        .map(([v, t]) => `<option value="${v}"${cfg[key] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>${help}</div>`;
    }
    const step = /delta/.test(key) ? '0.01' : '1';
    return `<div class="field"><label for="${id}">${esc(label)}</label><input type="number" id="${id}" data-cfg="${key}" step="${step}" value="${esc(cfg[key])}" dir="ltr">${help}</div>`;
  }).join('')}</fieldset>`).join('');
}

function readRules(host, base) {
  const out = { ...base };
  for (const el of host.querySelectorAll('[data-cfg]')) {
    const key = el.dataset.cfg;
    if (el.type === 'checkbox') out[key] = el.checked;
    else if (el.tagName === 'SELECT') out[key] = el.value;
    else out[key] = Number(String(el.value).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }
  return labConfig(out);
}

export async function mount(root, { state } = {}) {
  const settings = () => ({ ...defaults(), ...(state?.settings || {}) });
  let store = readStore();
  let exp = null;          // آزمایش فعال (ماندگار)
  let draft = null;        // پیش‌نویس تنظیم (ماندگار نیست)
  let market = null, ctx = null;
  let universe = null;     // { key, rows, note, build }
  let view = null;         // روزی که پنل تصمیم نشان می‌دهد
  let choice = null;       // گزینهٔ انتخاب‌شده در پنل تصمیم
  let editMode = 'replay';
  let cmpTab = 'paths';
  let cmpOpts = { mode: 'trigger', options: ['algo', 'hold', 'close'], cap: 2000, from: 'entry', policy: 'algo' };
  let wiOpts = { continuation: 'algo', options: ['algo', 'hold', 'close', 'defend'] };
  let entryPolicy = 'algo';
  let overlayIds = new Set();
  let busy = '';
  let alive = true;
  const memo = new Map();
  const remember = (key, make) => {
    if (memo.has(key)) return memo.get(key);
    if (memo.size > 600) memo.clear();
    const value = make();
    memo.set(key, value);
    return value;
  };

  root.innerHTML = `
    <div class="page-head sl-head">
      <h2>🧪 استرانگل فروش در بوتهٔ آزمایش</h2>
      <p>یک استرانگل فروش را در تاریخی از گذشته باز کن و روزبه‌روز جلو برو. پایان هر روز، الگوریتم با دادهٔ پایانیِ همان روز
         پیشنهاد می‌دهد و تو تصمیم می‌گیری. هر تصمیمی را بعداً می‌توانی عوض کنی، و همهٔ مسیرهای ممکن را کنار هم ببینی.</p>
    </div>
    <section class="card sl-saved" id="sl-saved"></section>
    <div id="sl-main"></div>`;
  const savedHost = root.querySelector('#sl-saved');
  const main = root.querySelector('#sl-main');

  // ═════════════════════════ کمک‌ها ═════════════════════════

  const cfgOf = () => labConfig(exp?.cfg || draft?.cfg || LAB_DEFAULTS);
  const fees = () => (cfgOf().fees ? feesOf(settings()) : { option: 0, exercise: 0 });
  const makeCtx = () => {
    const s = settings();
    ctx = market ? pricingContext(market, { r: s.rFree, q: s.divYield, yearDays: s.dayCountYear, modelFill: cfgOf().modelFill }) : null;
    memo.clear();
  };
  const save = () => {
    if (!exp) return;
    exp.updated = Date.now();
    const at = store.list.findIndex((x) => x.id === exp.id);
    if (at >= 0) store.list[at] = exp; else store.list.unshift(exp);
    writeStore(store);
    renderSaved();
  };
  const setBusy = (text) => { busy = text; if (text) main.querySelector('.sl-busy-line')?.replaceChildren(document.createTextNode(text)); };

  async function fetchUniverse(from, to) {
    const key = `${from}-${to}`;
    if (universe?.key === key && universe.rows.length) return universe;
    const res = await fetch(`/api/history/universe?from=${from}&to=${to}`, { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok || payload?.error) throw new Error(payload?.error || `پاسخ ${res.status}`);
    universe = { key, rows: Array.isArray(payload.rows) ? payload.rows : [], note: payload.note || '', build: payload.build || null };
    return universe;
  }

  async function loadMarket({ from, to, uaIns, expiry, size }) {
    const rows = universe.rows.filter((r) => String(r.uaInsCode) === String(uaIns));
    const codes = [String(uaIns)];
    for (const r of rows) {
      if (normalizeHistoryDate(Number(r.expiryGregorian) || Number(r.endDate)) !== Number(expiry)) continue;
      if (r.insCode_C) codes.push(r.insCode_C);
      if (r.insCode_P) codes.push(r.insCode_P);
    }
    let verdicts = {};
    const dailies = await dailiesFor(codes, { includeToday: Number(to) >= todayCompact(), onVerdicts: (v) => { verdicts = v; } });
    const failed = Object.values(verdicts).filter((v) => v && v.state && v.state !== 'rows').length;
    market = buildLabMarket({ rows: universe.rows, dailies, uaIns, expiry, from, to, size });
    market.failed = failed;
    makeCtx();
    return market;
  }

  // ═════════════════════════ آزمایش‌های ذخیره‌شده ═════════════════════════

  function renderSaved() {
    const list = store.list;
    savedHost.innerHTML = `<div class="section-head"><div><p class="eyebrow">آزمایش‌های من</p>
        <h3>${list.length ? `${faDigits(String(list.length))} آزمایش ذخیره‌شده` : 'هنوز آزمایشی نساخته‌ای'}</h3></div>
        <button type="button" class="btn" data-act="new">＋ آزمایش تازه</button></div>
      ${list.length ? `<div class="sl-saved-list">${list.map((x) => `<div class="sl-saved-item${exp?.id === x.id ? ' active' : ''}">
          <button type="button" class="sl-saved-open" data-act="open" data-id="${esc(x.id)}">
            <b>${esc(x.name)}</b>
            <small>${esc(x.uaName)}، ${esc(dateFa(x.from))} تا ${esc(dateFa(x.to))}</small>
            <small class="${tone(x.final)}">${x.done ? `نتیجه ${esc(money(x.final, { sign: true }))}` : `در جریان، ${faDigits(String(Object.keys(x.decisions || {}).length))} تصمیم`}</small>
          </button>
          <button type="button" class="ghost sl-mini" data-act="dup" data-id="${esc(x.id)}" title="رونوشت">⧉</button>
          <button type="button" class="ghost sl-mini" data-act="del" data-id="${esc(x.id)}" title="حذف">✕</button>
        </div>`).join('')}</div>` : '<p class="note">آزمایش‌ها در همین مرورگر می‌مانند: تنظیم، ورود و همهٔ تصمیم‌ها — قیمت‌ها هر بار تازه گرفته می‌شوند.</p>'}`;
  }

  // ═════════════════════════ تنظیم ═════════════════════════

  function newDraft() {
    const today = todayCompact();
    const from = daysBefore(today, 75);
    draft = {
      fromText: jalaliInput(from), toText: jalaliInput(daysBefore(today, 25)),
      from: 0, to: 0, uaIns: '', uaName: '', expiry: 0, size: Number(settings().contractSize) || 1000,
      entry: { call: null, put: null }, cfg: { ...LAB_DEFAULTS }, step: 1, search: '', name: '',
    };
    exp = null; market = null; ctx = null; universe = null;
  }

  function renderSetup(message = '') {
    const d = draft;
    const cfg = labConfig(d.cfg);
    const bases = universe ? labBases(universe.rows) : [];
    const shownBases = d.search ? bases.filter((b) => b.name.includes(d.search.trim())) : bases;
    const expiries = d.uaIns && universe ? labExpiries(universe.rows, d.uaIns) : [];
    const suggested = d.from ? pickExpiry(expiries, d.from, cfg) : null;
    const presets = [[45, 'ورود ۴۵ روز پیش'], [90, '۳ ماه پیش'], [180, '۶ ماه پیش'], [365, 'یک سال پیش']];

    let entryHtml = '';
    if (market && ctx && d.step >= 3) {
      const day0 = market.days[0];
      if (!day0) {
        entryHtml = '<p class="note warn">در این بازه پایه هیچ روزِ معامله‌ای ندارد.</p>';
      } else {
        const board = strikeBoard(ctx, 0);
        const auto = pickEntry(ctx, cfg, 0);
        if (d.entry.call == null && d.entry.put == null) d.entry = { call: auto.call, put: auto.put };
        const st = openPosition(ctx, cfg, d.entry, 0, fees());
        const margin = st.state ? labMargin(ctx, cfg, st.state.legs, 0, marginParamsOf(settings())) : NaN;
        const capital = margin * cfg.capitalMult;
        const cell = (row, side) => {
          const c = row[side];
          if (!c) return '<td class="sl-board-na">—</td>';
          const picked = Number(d.entry[side]) === row.strike;
          const can = fin(c.price) && c.price > 0;
          const inBand = fin(c.delta) && Math.abs(c.delta) >= cfg.deltaLo && Math.abs(c.delta) <= cfg.deltaHi;
          return `<td class="sl-board-cell ${side}${picked ? ' picked' : ''}${inBand ? ' band' : ''}">
            <button type="button" data-act="pick-strike" data-side="${side}" data-strike="${row.strike}" ${can ? '' : 'disabled'} title="${esc(c.sym)}">
              <b>${price(c.price)}</b>${srcBadge(c.src)}<small>Δ ${fin(c.delta) ? faDigits(c.delta.toFixed(2)) : '—'}، IV ${fin(c.iv) ? pct(c.iv * 100, 0) : '—'}</small>
            </button></td>`;
        };
        entryHtml = `
          <div class="sl-entry-head">
            <div><p class="eyebrow">روز ورود</p><b>${esc(dateFa(day0.date))} ${esc(dayNameFa(day0.date))}</b>
              ${day0.date !== d.from ? `<small class="note">تاریخ انتخابی روز معاملاتی نبود؛ اولین روزِ معامله‌شده.</small>` : ''}</div>
            <div><p class="eyebrow">قیمت پایه</p><b>${fmt.int(day0.S)}</b></div>
            <div><p class="eyebrow">روز تا سررسید</p><b>${faDigits(String(day0.dte))}</b></div>
            <div><p class="eyebrow">روزهای آزمایش</p><b>${faDigits(String(market.days.length))}</b></div>
            <div><p class="eyebrow">پوشش قیمت قراردادها</p><b>${pct(market.coverage.pct, 0)}</b></div>
          </div>
          ${market.failed ? `<p class="note warn">تاریخچهٔ ${faDigits(String(market.failed))} ابزار دریافت نشد؛ دوباره «دریافت قیمت‌ها» را بزن.</p>` : ''}
          ${auto.note ? `<p class="note">${esc(auto.note)}</p>` : ''}
          <div class="bar sl-entry-tools">
            <button type="button" class="ghost" data-act="auto-entry">انتخاب خودکار (${esc(cfg.entryMethod === 'delta' ? `دلتای ${faDigits(cfg.deltaLo.toFixed(2))} تا ${faDigits(cfg.deltaHi.toFixed(2))}` : `${faDigits(String(cfg.otmPct))}٪ فاصله`)})</button>
            <span class="note">روی قیمتِ هر خانه بزن تا کال یا پوتِ ورود شود. خانه‌های رنگی در بازهٔ دلتای هدف‌اند.</span>
          </div>
          <div class="history-table-wrap sl-board-wrap"><table class="sl-board">
            <thead><tr><th>کال (پایانی، دلتا، IV)</th><th>قیمت اعمال</th><th>فاصله از پایه</th><th>پوت (پایانی، دلتا، IV)</th></tr></thead>
            <tbody>${board.map((row) => `<tr class="${Math.abs(row.otmPct) < 2.5 ? 'atm' : ''}">${cell(row, 'call')}<th scope="row">${strikeFa(row.strike)}</th>
              <td class="${tone(row.otmPct)}">${pct(row.otmPct)}</td>${cell(row, 'put')}</tr>`).join('')}</tbody>
          </table></div>
          <div class="sl-entry-sum">
            ${st.error ? `<p class="note warn">${esc(st.error)}</p>` : `
              <div class="kpi"><span>کال فروش</span><b>${strikeFa(d.entry.call)}</b><small>${price(st.state.legs.call.open)} ${srcBadge(st.state.legs.call.src)}</small></div>
              <div class="kpi"><span>پوت فروش</span><b>${strikeFa(d.entry.put)}</b><small>${price(st.state.legs.put.open)} ${srcBadge(st.state.legs.put.src)}</small></div>
              <div class="kpi"><span>پرمیوم دریافتی</span><b class="gain">${esc(money(st.state.initialCredit))}</b><small>${faDigits(String(cfg.qty))} لات × ${fmt.int(market.size)}</small></div>
              <div class="kpi"><span>وجه تضمین</span><b>${esc(money(margin))}</b><small>قاعدهٔ ترکیبی استرانگل</small></div>
              <div class="kpi"><span>سرمایهٔ لازم (×${faDigits(String(cfg.capitalMult))})</span><b>${esc(money(capital))}</b><small>بند ۱.۱</small></div>`}
          </div>`;
      }
    }

    main.innerHTML = `
      <div class="sl-setup">
        <section class="card sl-step${d.step === 1 ? ' current' : ''}">
          <div class="section-head"><div><p class="eyebrow">گام ۱</p><h3>بازهٔ معامله</h3></div></div>
          <div class="bar sl-dates">
            <div class="field"><label for="sl-from">تاریخ ورود (شمسی)</label><input id="sl-from" type="text" dir="ltr" value="${esc(d.fromText)}" placeholder="۱۴۰۴/۰۵/۰۱"></div>
            <div class="field"><label for="sl-to">تاریخ خروج (شمسی)</label><input id="sl-to" type="text" dir="ltr" value="${esc(d.toText)}" placeholder="۱۴۰۴/۰۶/۲۰"></div>
            <button type="button" class="btn" data-act="load-universe">دریافت قراردادهای بازه</button>
          </div>
          <div class="sl-presets">${presets.map(([n, t]) => `<button type="button" class="sl-chip-btn" data-act="preset" data-n="${n}">${esc(t)}</button>`).join('')}
            <span class="note">خروج پیش‌فرض ۵۰ روز بعد از ورود است؛ اگر بعد از سررسید باشد، سررسید پایان آزمایش است.</span></div>
          ${universe ? `<p class="note">${faDigits(String(universe.rows.length))} جفت قرارداد در بازه، ${faDigits(String(bases.length))} پایه${universe.note ? ` — ${esc(universe.note)}` : ''}</p>
            ${universe.build ? `<p class="note">${buildLine(universe.build)}</p>` : ''}` : ''}
        </section>

        ${universe ? `<section class="card sl-step${d.step === 2 ? ' current' : ''}">
          <div class="section-head"><div><p class="eyebrow">گام ۲</p><h3>نماد پایه و سررسید</h3></div></div>
          ${bases.length ? `<div class="bar">
            <div class="field"><label for="sl-search">جست‌وجوی پایه</label><input id="sl-search" type="search" value="${esc(d.search)}" placeholder="نام نماد…"></div>
            <div class="field sl-grow"><label for="sl-base">نماد پایه</label><select id="sl-base"><option value="">— انتخاب کن —</option>${shownBases
              .map((b) => `<option value="${esc(b.ins)}"${b.ins === d.uaIns ? ' selected' : ''}>${esc(b.name)}، ${faDigits(String(b.contracts))} قرارداد</option>`).join('')}</select></div>
            <div class="field"><label for="sl-size">اندازهٔ قرارداد</label><input id="sl-size" type="number" dir="ltr" value="${esc(d.size)}"><small class="sl-hint">از تنظیمات؛ فهرست تاریخی اندازه نمی‌دهد</small></div>
          </div>` : '<p class="note warn">در این بازه هیچ قراردادی در دفتر نیست. اگر دفتر در حال ساخت است، کمی بعد دوباره «دریافت» بزن.</p>'}
          ${expiries.length ? `<div class="sl-expiries">${expiries.map((e) => {
            const dte = daysBetween(d.from, e.expiry);
            const isSug = suggested?.expiry === e.expiry;
            return `<button type="button" class="sl-exp${Number(d.expiry) === e.expiry ? ' picked' : ''}${isSug ? ' suggested' : ''}" data-act="pick-expiry" data-expiry="${e.expiry}" ${dte > 0 ? '' : 'disabled'}>
              <b>${esc(dateFa(e.expiry))}</b><small>${dte > 0 ? `${faDigits(String(dte))} روز تا سررسید` : 'پیش از ورود سررسید شده'}</small>
              <small>${faDigits(String(e.strikes))} قیمت اعمال${isSug ? (suggested.inRange ? '، پیشنهاد ۲.۱' : '، نزدیک‌ترین به ۴۵–۵۰') : ''}</small></button>`;
          }).join('')}</div>
          <div class="bar"><button type="button" class="btn" data-act="load-market" ${d.expiry ? '' : 'disabled'}>دریافت قیمت‌های روزانه</button></div>` : ''}
        </section>` : ''}

        ${d.step >= 3 ? `<section class="card sl-step current">
          <div class="section-head"><div><p class="eyebrow">گام ۳</p><h3>ورود و قواعد</h3></div></div>
          ${entryHtml}
          <details class="sl-rules" ${d.rulesOpen ? 'open' : ''}><summary>قواعد الگوریتم و پارامترها</summary>
            <div class="sl-rules-grid" id="sl-rules">${rulesFormHtml(cfg)}</div>
            <div class="bar"><button type="button" class="ghost" data-act="rules-reset">بازگشت به پیش‌فرض متن الگوریتم</button></div>
          </details>
          <div class="bar sl-start">
            <div class="field sl-grow"><label for="sl-name">نام آزمایش</label><input id="sl-name" type="text" value="${esc(d.name || `${d.uaName} ${dateFa(market?.days[0]?.date || d.from)}`)}"></div>
            <button type="button" class="btn sl-go" data-act="start" ${market?.days?.length ? '' : 'disabled'}>🚀 شروع آزمایش</button>
          </div>
        </section>` : ''}
        ${message ? `<p class="note warn sl-msg" role="alert">${esc(message)}</p>` : ''}
        <p class="note sl-busy-line" aria-live="polite">${esc(busy)}</p>
      </div>`;
  }

  // ═════════════════════════ آزمایش ═════════════════════════

  const decider = () => planDecider(exp.decisions, 'hold');

  function currentRun() {
    const key = `run|${JSON.stringify(exp.decisions)}|${exp.cursor}|${JSON.stringify(exp.cfg)}|${exp.entry.call}|${exp.entry.put}`;
    return remember(key, () => runPath(ctx, cfgOf(), exp.entry, { decide: decider(), upTo: exp.cursor, fees: fees() }));
  }

  /** «مسیر من» برای مقایسه: تصمیم‌های ثبت‌شده و برای بقیهٔ روزها یک سیاست. */
  function myFullRun(policy = 'algo') {
    const key = `full|${policy}|${JSON.stringify(exp.decisions)}|${exp.cursor}|${JSON.stringify(exp.cfg)}|${exp.entry.call}|${exp.entry.put}`;
    return remember(key, () => {
      const own = planDecider(exp.decisions, 'hold');
      const rest = POLICIES[policy]?.decide || POLICIES.hold.decide;
      return runPath(ctx, cfgOf(), exp.entry, { decide: (i, ev, st) => (i < exp.cursor ? own(i, ev, st) : rest(ev)), fees: fees() });
    });
  }

  function policyRun(policy, cfg = cfgOf(), entry = exp.entry) {
    const key = `pol|${policy}|${JSON.stringify(cfg)}|${entry.call}|${entry.put}`;
    return remember(key, () => runPath(ctx, cfg, entry, { decide: planDecider({}, policy), fees: fees() }));
  }

  function capitalOf() {
    const key = `cap|${JSON.stringify(exp.cfg)}|${exp.entry.call}|${exp.entry.put}`;
    if (memo.has(key)) return memo.get(key);
    const cfg = cfgOf();
    const st = openPosition(ctx, cfg, exp.entry, 0, fees());
    const margin = st.state ? labMargin(ctx, cfg, st.state.legs, 0, marginParamsOf(settings())) : NaN;
    const out = { margin, capital: margin * cfg.capitalMult };
    memo.set(key, out);
    return out;
  }

  /** وضعیتِ آغاز روز `v` و ارزیابیِ آن روز، از اجرای جاری. */
  function dayContext(run, v) {
    if (run.pending && run.pending.i === v) return { st: run.pending.state, ev: run.pending.ev, pending: true };
    const step = run.steps.find((s) => s.i === v);
    if (!step || v === 0) return null;
    const prev = [...run.steps].reverse().find((s) => s.i < v);
    return { st: prev.state, ev: step.ev, step, pending: false };
  }

  /** گزینه‌های پنل تصمیم یک روز. */
  function dayOptions(st, v, ev) {
    const cfg = cfgOf();
    const list = [];
    const push = (id, title, action, desc, extra = {}) => {
      if (!action) return;
      list.push({ id, title, action, desc, key: actionKey(action), ...extra });
    };
    push('algo', 'پیشنهاد الگوریتم', ev.rec.action, ev.rec.text, { recommended: true });
    push('hold', 'نگه‌داشتن', { kind: 'hold' }, 'بدون دستکاری؛ روز بعد دوباره سنجیده می‌شود.');
    push('close', 'بستن کامل', { kind: 'close' }, 'خروج از هر دو سمت به قیمت پایانی امروز.');
    if (ev.winning && !ev.straddle) {
      const cand = ev.candidate || adjustCandidate(ctx, cfg, st, v, ev);
      if (cand?.strike) {
        push('adjust', 'تعدیل گام اول (۳.۲)', { kind: 'roll', side: ev.winning, strike: cand.strike },
          `بستن ${SIDE_FA[ev.winning]} سودده و فروش ${strikeFa(cand.strike)} با پرمیوم ${price(cand.price)} (هدف ${price(cand.target)}${fin(cand.gapPct) ? `، اختلاف ${pct(cand.gapPct)}` : ''}).`);
      }
    }
    const def = ev.losing ? defendAction(ctx, st, v, ev) : null;
    push('defend', 'رول دفاعی سمت زیان‌ده', def, def ? `${SIDE_FA[def.side]} زیان‌ده یک قیمت اعمال دورتر از بازار: ${strikeFa(def.strike)}.` : '');
    const seen = new Set();
    return list.filter((o) => {
      if (o.id !== 'algo' && seen.has(o.key)) return false;
      seen.add(o.key);
      return true;
    }).map((o) => ({ ...o, dup: list.find((x) => x.id === 'algo')?.key === o.key && o.id !== 'algo' }));
  }

  /** پیش‌نمایش یک اقدام: پاها، جریان نقد امروز، سود هدف تازه. */
  function preview(st, v, ev, action) {
    const res = applyAction(ctx, cfgOf(), st, v, action, ev, fees());
    if (res.error) return { error: res.error };
    const s = res.state;
    const cash = (s.received - st.received) - (s.paid - st.paid);
    const after = s.closed ? null : evaluateDay(ctx, cfgOf(), s, v);
    return { state: s, cash, fee: s.fees - st.fees, maxProfit: after?.maxProfit ?? NaN, closed: s.closed, final: s.finalPnl };
  }

  function futureOf(v, action, policy = 'algo') {
    const key = `fut|${v}|${actionKey(action)}|${policy}|${JSON.stringify(exp.decisions)}|${JSON.stringify(exp.cfg)}|${exp.entry.call}|${exp.entry.put}`;
    return remember(key, () => {
      const own = planDecider(exp.decisions, 'hold');
      const rest = POLICIES[policy].decide;
      return runPath(ctx, cfgOf(), exp.entry, { decide: (i, e, st) => (i < v ? own(i, e, st) : i === v ? action : rest(e)), fees: fees() }).final;
    });
  }

  function legLine(side, leg, mark) {
    if (!leg) return `<div class="sl-leg ${side} closed"><span class="sl-leg-side">${SIDE_FA[side]}</span><b>بسته</b></div>`;
    const sym = market.strikes.find((s) => s.strike === leg.strike)?.[side]?.sym || '';
    const move = mark ? mark.price - leg.open : NaN;
    return `<div class="sl-leg ${side}">
      <span class="sl-leg-side">${SIDE_FA[side]} فروش</span>
      <b class="sl-leg-k">${strikeFa(leg.strike)}</b>
      <span class="sl-leg-sym">${fmt.sym(sym)}</span>
      <span>ورود ${price(leg.open)} ${srcBadge(leg.src)}</span>
      <span>امروز ${mark ? `${price(mark.price)} ${srcBadge(mark.src)}` : '<i class="warn">نداشته</i>'}</span>
      <span class="${tone(-move)}">${fin(move) ? `${move > 0 ? '▲' : move < 0 ? '▼' : ''} ${price(Math.abs(move))}` : ''}</span>
    </div>`;
  }

  function heroHtml(run) {
    const cfg = cfgOf();
    const { margin, capital } = capitalOf();
    const done = !!run.done;
    const lastStep = run.steps[run.steps.length - 1];
    const ev = done ? lastStep.ev : run.pending?.ev || lastStep.ev;
    const st = done ? run.state : run.pending?.state || lastStep.state;
    const pnl = done ? run.final : ev.pnl;
    const initial = run.steps[0].state.initialCredit;
    const tp = (cfg.tpPct / 100) * initial, sl = (cfg.slPct / 100) * initial;
    const stats = pathStats(run, capital);
    const day0 = market.days[0], dayNow = market.days[Math.min(ev.i ?? 0, market.days.length - 1)];
    const todayMargin = !done && st && !st.closed ? labMargin(ctx, cfg, st.legs, ev.i, marginParamsOf(settings())) : NaN;
    const status = done ? (st.reason === 'incomplete' ? ['warn', 'نتیجه نامعلوم'] : ['shut', `بسته — ${reasonText(st.reason)}`])
      : ev.straddle ? ['warn', 'استرادل'] : st.adjustments ? ['open', `تعدیل‌شده ×${faDigits(String(st.adjustments))}`] : ['open', 'باز'];
    const varHit = fin(stats.minPct) && -stats.minPct > cfg.varLimitPct;
    return `<section class="card sl-hero">
      <div class="sl-hero-top">
        <div class="sl-hero-title">
          <p class="eyebrow">استرانگل فروش — ${faDigits(String(cfg.qty))} لات</p>
          <h3>${esc(market.uaName)} <small>سررسید ${esc(dateFa(market.expiry))}</small></h3>
          <span class="pill ${status[0]}">${esc(status[1])}</span>
        </div>
        <div class="sl-hero-pnl ${tone(pnl)}">
          <span>${done ? 'سود و زیان نهایی' : `سود و زیان پایان ${esc(shortDateFa(dayNow.date))}`}</span>
          <b>${esc(money(pnl, { sign: true }))}</b>
          <small>${pct(capital > 0 && fin(pnl) ? (pnl / capital) * 100 : NaN, 2)} سرمایه، ${pct(initial > 0 && fin(pnl) ? (pnl / initial) * 100 : NaN, 0)} پرمیوم اولیه</small>
        </div>
      </div>
      <div class="sl-legs">${SIDES.map((side) => legLine(side, done ? null : st.legs[side], done ? null : ev.marks?.[side])).join('')}</div>
      ${gaugeHtml({ pnl, tp, sl, trigger: done ? NaN : (cfg.trigLo / 100) * ev.maxProfit - (cfg.trigBasis === 'sinceEntry' ? st.initialRef : st.refPnl) })}
      <div class="sl-kpis">
        <div class="kpi"><span>پرمیوم اولیه</span><b>${esc(money(initial))}</b></div>
        <div class="kpi"><span>سود هدف جاری</span><b>${esc(money(done ? NaN : ev.maxProfit))}</b><small>اگر همهٔ پاهای باز بی‌ارزش شوند</small></div>
        <div class="kpi"><span>زیان شناور</span><b class="${ev.zone === 'calm' ? '' : 'loss'}">${pct(done ? NaN : ev.floatPct)}</b><small>آستانه ${faDigits(String(cfg.trigLo))}–${faDigits(String(cfg.trigHi))}٪</small></div>
        <div class="kpi"><span>سرمایه (×${faDigits(String(cfg.capitalMult))} وجه تضمین)</span><b>${esc(money(capital))}</b><small>وجه تضمین ورود ${esc(money(margin))}</small></div>
        <div class="kpi"><span>وجه تضمین امروز</span><b>${esc(money(todayMargin))}</b><small>${pct(capital > 0 ? (todayMargin / capital) * 100 : NaN, 0)} سرمایه</small></div>
        <div class="kpi"><span>بدترین افت مسیر</span><b class="${varHit ? 'loss' : ''}">${pct(stats.minPct, 2)}</b><small>سقف ۱.۲: ${faDigits(String(cfg.varLimitPct))}٪ سرمایه${varHit ? ' — رد شد' : ''}</small></div>
        <div class="kpi"><span>پایه</span><b>${fmt.int(dayNow.S)}</b><small class="${tone(dayNow.S - day0.S)}">${pct(((dayNow.S - day0.S) / day0.S) * 100)} از ورود</small></div>
        <div class="kpi"><span>روزها</span><b>${faDigits(String(Math.max(0, (ev.i ?? 0))))} / ${faDigits(String(market.days.length - 1))}</b><small>${faDigits(String(dayNow.dte))} روز تا سررسید</small></div>
      </div>
    </section>`;
  }

  function decisionHtml(run) {
    const cfg = cfgOf();
    if (run.done && (view == null || view >= market.days.length - 1 || !run.steps.some((s) => s.i === view && s.i > 0))) {
      const st = run.state;
      return `<section class="card sl-decide done">
        <div class="section-head"><div><p class="eyebrow">پایان آزمایش</p><h3>${esc(reasonText(st.reason))} — ${esc(money(run.final, { sign: true }))}</h3></div></div>
        <p class="note">${st.reason === 'incomplete' ? 'قیمت پایانی روز آخر برای یکی از پاها نبود؛ سود نهایی ساخته نمی‌شود. «قیمت مدل» یا «آخرین روزِ قیمت‌دار» را در قواعد روشن کن، یا تاریخ خروج را عوض کن.'
          : st.reason === 'exitEarly' ? `روز خروج یکی از پاها معامله نشد؛ معامله در ${esc(dateFa(market.days[st.closedAt].date))} — آخرین روزی که همهٔ پاها قیمت پایانی واقعی داشتند — بسته شد.`
            : 'برای تغییر هر تصمیم، روی همان روز در خط زمان بزن. در بخش مقایسه ببین مسیرهای دیگر به کجا می‌رسیدند.'}</p>
        <div class="bar"><button type="button" class="ghost" data-act="save-branch">ذخیرهٔ این مسیر به‌عنوان شاخه</button>
          <button type="button" class="ghost" data-act="undo">↶ برگشت یک روز</button></div>
      </section>`;
    }
    const v = view ?? run.pending?.i;
    const dc = v != null ? dayContext(run, v) : null;
    if (!dc) return '';
    const { st, ev, step, pending } = dc;
    const day = market.days[v];
    const opts = dayOptions(st, v, ev);
    const selId = selectedId(dc, opts, v);
    const stored = exp.decisions[day.date];
    const custom = choice?.id === 'custom' ? choice
      : selId === 'custom' && stored?.kind === 'roll' ? { side: stored.side, strike: stored.strike == null ? 'none' : String(stored.strike) }
        : { side: ev.winning || 'put', strike: '' };
    const board = strikeBoard(ctx, v);
    const blocked = ev.missing.length > 0;
    const card = (o) => {
      const pv = preview(st, v, ev, o.action);
      const fut = exp.reveal ? futureOf(v, o.action, exp.revealPolicy || 'algo') : NaN;
      const selected = o.id === selId;
      return `<button type="button" class="sl-opt${o.recommended ? ' rec' : ''}${selected && !blocked ? ' selected' : ''}" data-act="choose" data-id="${o.id}" ${blocked && o.id !== 'hold' ? 'disabled' : ''} aria-pressed="${selected ? 'true' : 'false'}">
        <span class="sl-opt-title">${o.recommended ? '<span class="sl-badge rec">پیشنهاد</span>' : ''}${esc(o.title)}${o.dup ? ' <small>(همان پیشنهاد)</small>' : ''}</span>
        <b class="sl-opt-action">${esc(actionText(o.action))}</b>
        <span class="sl-opt-desc">${esc(o.desc)}</span>
        ${pv.error ? `<span class="sl-opt-err">${esc(pv.error)}</span>` : `<span class="sl-opt-meta">
          ${o.action.kind === 'hold' ? '' : `<span>نقد امروز <b class="${tone(pv.cash)}">${esc(money(pv.cash, { sign: true }))}</b></span>`}
          ${pv.closed ? `<span>سود نهایی <b class="${tone(pv.final)}">${esc(money(pv.final, { sign: true }))}</b></span>` : `<span>سود هدف بعدی ${esc(money(pv.maxProfit))}</span>`}
          ${pv.state && !pv.closed && o.action.kind === 'roll' ? `<span>پاها: ${SIDES.map((sd) => (pv.state.legs[sd] ? `${SIDE_FA[sd]} ${strikeFa(pv.state.legs[sd].strike)}` : `${SIDE_FA[sd]} بسته`)).join('، ')}</span>` : ''}
          ${exp.reveal ? `<span class="sl-future">تا پایان (${esc(POLICIES[exp.revealPolicy || 'algo'].label)}): <b class="${tone(fut)}">${esc(money(fut, { sign: true }))}</b></span>` : ''}
        </span>`}
      </button>`;
    };
    const sideBoard = board.map((row) => row[custom.side]).filter(Boolean);
    const customAction = custom.strike === '' ? null : { kind: 'roll', side: custom.side, strike: custom.strike === 'none' ? null : Number(custom.strike) };
    const customPv = customAction ? preview(st, v, ev, customAction) : null;
    const zoneText = { calm: 'آرام', band: 'در محدودهٔ تعدیل', beyond: 'فراتر از محدوده' }[ev.zone] || '';

    return `<section class="card sl-decide${pending ? ' pending' : ' past'}">
      <div class="section-head">
        <div><p class="eyebrow">${pending ? 'تصمیم پایان روز' : 'بازبینی تصمیم گذشته'}</p>
          <h3>${esc(dateFa(day.date))} <small>${esc(dayNameFa(day.date))}، ${faDigits(String(day.dte))} روز تا سررسید</small></h3></div>
        <div class="sl-decide-nav">
          <button type="button" class="ghost sl-mini" data-act="view-prev" ${v > 1 ? '' : 'disabled'} title="روز قبل">→</button>
          <button type="button" class="ghost sl-mini" data-act="view-next" ${v < (run.pending?.i ?? market.days.length - 1) ? '' : 'disabled'} title="روز بعد">←</button>
        </div>
      </div>
      <div class="sl-day-facts">
        <span>پایه <b>${fmt.int(day.S)}</b> <small class="${tone(day.S - market.days[v - 1].S)}">${pct(((day.S - market.days[v - 1].S) / market.days[v - 1].S) * 100)}</small></span>
        ${SIDES.map((sd) => (st.legs[sd] ? `<span>${SIDE_FA[sd]} ${strikeFa(st.legs[sd].strike)}: <b>${ev.marks[sd] ? price(ev.marks[sd].price) : '<i class="warn">نداشته</i>'}</b> ${srcBadge(ev.marks[sd]?.src)}</span>` : '')).join('')}
        <span>سود و زیان <b class="${tone(ev.pnl)}">${esc(money(ev.pnl, { sign: true }))}</b></span>
        <span>زیان شناور <b>${pct(ev.floatPct)}</b> <span class="sl-zone ${ev.zone}">${esc(zoneText)}</span></span>
        ${ev.straddle ? `<span>نسبت پرمیوم <b>${fin(ev.ratio) ? faDigits(ev.ratio.toFixed(2)) : '∞'}×</b> <span class="sl-zone ${ev.unstable ? 'beyond' : 'calm'}">${ev.unstable ? 'ناپایدار' : 'پایدار'}</span></span>` : ''}
      </div>
      <p class="sl-rec-text"><span class="sl-badge rec">الگوریتم</span> ${esc(ev.rec.text)}${ev.rec.detail ? ` ${esc(ev.rec.detail)}` : ''}</p>
      ${blocked ? '<p class="note warn">برای ادامه «نگه‌داشتن» را ثبت کن، یا «قیمت مدل» را در قواعد روشن کن.</p>' : ''}
      <div class="sl-opts">${opts.map(card).join('')}
        <div class="sl-opt custom${selId === 'custom' ? ' selected' : ''}">
          <span class="sl-opt-title">تعدیل سفارشی</span>
          <div class="bar sl-custom">
            <select data-act="custom-side" aria-label="سمت">${SIDES.map((sd) => `<option value="${sd}"${custom.side === sd ? ' selected' : ''}>${SIDE_FA[sd]}</option>`).join('')}</select>
            <select data-act="custom-strike" aria-label="قیمت اعمال تازه" ${blocked ? 'disabled' : ''}>
              <option value="">— قیمت اعمال تازه —</option>
              <option value="none"${custom.strike === 'none' ? ' selected' : ''}>فقط بستن این سمت</option>
              ${board.filter((row) => row[custom.side]).map((row) => {
                const c = row[custom.side];
                const can = fin(c.price) && c.price > 0;
                return `<option value="${row.strike}" ${can ? '' : 'disabled'}${String(custom.strike) === String(row.strike) ? ' selected' : ''}>${strikeFa(row.strike)}، ${price(c.price)}${c.src === 'model' ? ' (مدل)' : ''}، Δ ${fin(c.delta) ? faDigits(c.delta.toFixed(2)) : '—'}</option>`;
              }).join('')}
            </select>
          </div>
          ${customPv ? (customPv.error ? `<span class="sl-opt-err">${esc(customPv.error)}</span>`
            : `<span class="sl-opt-meta"><span>نقد امروز <b class="${tone(customPv.cash)}">${esc(money(customPv.cash, { sign: true }))}</b></span>
              ${exp.reveal ? `<span class="sl-future">تا پایان: <b>${esc(money(futureOf(v, customAction, exp.revealPolicy || 'algo'), { sign: true }))}</b></span>` : ''}</span>`) : `<span class="sl-opt-desc">${faDigits(String(sideBoard.length))} قیمت اعمال در این سمت</span>`}
        </div>
      </div>
      <div class="bar sl-decide-actions">
        ${pending ? `
          <button type="button" class="btn sl-go" data-act="commit">ثبت و رفتن به روز بعد ←</button>
          <button type="button" class="ghost" data-act="skip-to-trigger" title="روزهای آرام را با «نگه‌داشتن» رد می‌کند تا روزی که الگوریتم کاری پیشنهاد کند">⏩ تا روز تصمیم بعدی</button>
          <button type="button" class="ghost" data-act="auto-algo">⏭ پیروی از الگوریتم تا پایان</button>
          <button type="button" class="ghost" data-act="undo" ${exp.cursor > 1 ? '' : 'disabled'}>↶ برگشت یک روز</button>`
        : `<label class="sl-check"><input type="radio" name="sl-edit" value="replay" ${editMode === 'replay' ? 'checked' : ''} data-act="edit-mode"> تصمیم‌های بعدی بازپخش شوند</label>
          <label class="sl-check"><input type="radio" name="sl-edit" value="cut" ${editMode === 'cut' ? 'checked' : ''} data-act="edit-mode"> از همین روز دوباره جلو بروم</label>
          <button type="button" class="btn" data-act="commit-edit">اعمال تغییر این روز</button>
          <button type="button" class="ghost" data-act="view-pending">رفتن به روز جاری</button>`}
        <span class="sp"></span>
        <label class="sl-check" title="نتیجهٔ نهایی هر گزینه را نشان می‌دهد — یعنی نگاه به آینده"><input type="checkbox" data-act="reveal" ${exp.reveal ? 'checked' : ''}> نمایش آینده</label>
        ${exp.reveal ? `<select data-act="reveal-policy" aria-label="ادامه پس از این روز">${Object.entries(POLICIES).map(([k, p]) => `<option value="${k}"${(exp.revealPolicy || 'algo') === k ? ' selected' : ''}>ادامه: ${esc(p.label)}</option>`).join('')}</select>` : ''}
      </div>
    </section>`;
  }

  function journalHtml(run) {
    const rows = run.steps.map((s) => {
      const ev = s.ev;
      const legs = s.state.legs;
      return `<tr data-day="${s.i}" class="${s.i === view ? 'viewing' : ''}">
        <th scope="row"><button type="button" class="linklike" data-act="view" data-day="${s.i}">${esc(shortDateFa(s.date))}</button></th>
        <td>${fmt.int(ev.S)}</td>
        <td>${ev.marks?.call ? `${price(ev.marks.call.price)} ${srcBadge(ev.marks.call.src)}` : (s.i === 0 ? price(legs.call?.open) : '—')}</td>
        <td>${ev.marks?.put ? `${price(ev.marks.put.price)} ${srcBadge(ev.marks.put.src)}` : (s.i === 0 ? price(legs.put?.open) : '—')}</td>
        <td class="${tone(s.pnl)}">${esc(money(s.pnl, { sign: true }))}</td>
        <td>${pct(ev.floatPct)}</td>
        <td><small>${esc(s.i === 0 ? 'ورود' : ev.rec?.text?.split(':')[0] || '')}</small></td>
        <td><b>${esc(actionText(s.action))}</b>${s.error ? ` <small class="warn">${esc(s.error)}</small>` : ''}</td>
        <td>${legs.call ? strikeFa(legs.call.strike) : '—'} / ${legs.put ? strikeFa(legs.put.strike) : '—'}</td>
      </tr>`;
    }).join('');
    return `<details class="card sl-journal"><summary><b>دفتر روزانه</b> <small>${faDigits(String(run.steps.length))} روز</small></summary>
      <div class="history-table-wrap"><table class="sl-journal-table">
        <thead><tr><th>روز</th><th>پایه</th><th>کال</th><th>پوت</th><th>سود و زیان</th><th>زیان شناور</th><th>الگوریتم</th><th>اقدام</th><th>کال / پوت پس از اقدام</th></tr></thead>
        <tbody>${rows}</tbody></table></div></details>`;
  }

  function strikePaths(run) {
    const n = market.days.length;
    const calls = new Array(n).fill(NaN), puts = new Array(n).fill(NaN);
    for (const s of run.steps) {
      const legs = s.state.closed ? null : s.state.legs;
      // روزِ اقدام هنوز با پاهای قبلی شروع شده؛ خط پله‌ای از روز بعد عوض می‌شود.
      calls[s.i] = legs?.call?.strike ?? NaN;
      puts[s.i] = legs?.put?.strike ?? NaN;
    }
    if (run.pending) {
      calls[run.pending.i] = run.pending.state.legs.call?.strike ?? NaN;
      puts[run.pending.i] = run.pending.state.legs.put?.strike ?? NaN;
    }
    return { calls, puts };
  }

  // ═════════════════════════ مقایسه ═════════════════════════

  function pathsKey() {
    return `paths|${JSON.stringify(cmpOpts)}|${JSON.stringify(exp.cfg)}|${exp.entry.call}|${exp.entry.put}|${cmpOpts.from === 'cursor' ? `${JSON.stringify(exp.decisions)}|${exp.cursor}` : ''}`;
  }

  function comparePaths() {
    const key = pathsKey();
    if (memo.has(key)) return memo.get(key);
    const t0 = performance.now();
    const fromCursor = cmpOpts.from === 'cursor';
    const out = enumeratePaths(ctx, cfgOf(), exp.entry, {
      mode: cmpOpts.mode, options: cmpOpts.options, cap: cmpOpts.cap, fees: fees(),
      prefix: fromCursor ? planDecider(exp.decisions, 'hold') : null,
      branchFrom: fromCursor ? exp.cursor : 0,
    });
    out.ms = performance.now() - t0;
    memo.set(key, out);
    return out;
  }

  function cmpPathsHtml() {
    const res = comparePaths();
    if (res.error) return `<p class="note warn">${esc(res.error)}</p>`;
    const { capital } = capitalOf();
    const sum = pathsSummary(res.paths);
    const mine = myFullRun(cmpOpts.policy);
    const base = Object.fromEntries(Object.keys(POLICIES).map((k) => [k, policyRun(k)]));
    const known = res.paths.filter((p) => fin(p.final));
    const best = known.reduce((a, b) => (!a || b.final > a.final ? b : a), null);
    const worst = known.reduce((a, b) => (!a || b.final < a.final ? b : a), null);
    const dates = market.days.map((d) => d.date);
    const rank = percentileOf(res.paths, mine.final);
    const sorted = [...known].sort((a, b) => b.final - a.final);
    const top = cmpOpts.list === 'worst' ? sorted.slice(-10).reverse() : sorted.slice(0, 10);
    const optBox = (id, label) => `<label class="sl-check"><input type="checkbox" data-act="cmp-opt" value="${id}" ${cmpOpts.options.includes(id) ? 'checked' : ''}> ${esc(label)}</label>`;
    const row = (label, cls, run) => `<tr><th scope="row"><span class="sl-key ${cls}"></span>${esc(label)}</th>
      <td class="${tone(run.final)}">${esc(money(run.final, { sign: true }))}</td><td>${pct(capital > 0 ? (run.final / capital) * 100 : NaN, 2)}</td>
      <td>${faDigits(String(run.state?.adjustments ?? run.adjustments ?? 0))}</td><td>${esc(reasonText(run.state?.reason ?? run.reason))}</td>
      <td>${pct(percentileOf(res.paths, run.final), 0)}</td></tr>`;
    return `
      <div class="bar sl-cmp-controls">
        <div class="field"><label for="cmp-mode">نقطه‌های انشعاب</label><select id="cmp-mode" data-act="cmp-mode">
          <option value="trigger"${cmpOpts.mode === 'trigger' ? ' selected' : ''}>فقط روزهایی که الگوریتم کاری پیشنهاد کرد</option>
          <option value="every"${cmpOpts.mode === 'every' ? ' selected' : ''}>همهٔ روزها</option></select></div>
        <div class="field"><label for="cmp-from">از کجا</label><select id="cmp-from" data-act="cmp-from">
          <option value="entry"${cmpOpts.from === 'entry' ? ' selected' : ''}>از روز ورود</option>
          <option value="cursor"${cmpOpts.from === 'cursor' ? ' selected' : ''}>از امروزِ آزمایش (با تصمیم‌های من تا اینجا)</option></select></div>
        <div class="field"><label for="cmp-cap">سقف مسیر</label><select id="cmp-cap" data-act="cmp-cap">${[200, 1000, 2000, 5000, 10000]
          .map((c) => `<option value="${c}"${cmpOpts.cap === c ? ' selected' : ''}>${fmt.int(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="cmp-policy">ادامهٔ مسیر من</label><select id="cmp-policy" data-act="cmp-policy">${Object.entries(POLICIES)
          .map(([k, p]) => `<option value="${k}"${cmpOpts.policy === k ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
        <fieldset class="sl-inline"><legend>گزینه‌ها در هر انشعاب</legend>${Object.entries(BRANCH_OPTIONS).map(([k, t]) => optBox(k, t)).join('')}</fieldset>
      </div>
      <p class="note">${fmt.int(res.paths.length)} مسیر در ${faDigits(Math.max(1, Math.round(res.ms)).toString())} میلی‌ثانیه${res.truncated ? ` — <b class="warn">به سقف رسید؛ از آن به بعد فقط شاخهٔ پیشنهاد الگوریتم دنبال شد</b>` : ''}${sum.unknown ? `، ${fmt.int(sum.unknown)} مسیر نتیجهٔ نامعلوم (قیمت روز آخر نبود)` : ''}.</p>
      <div class="sl-kpis">
        <div class="kpi"><span>بهترین</span><b class="gain">${esc(money(sum.max, { sign: true }))}</b></div>
        <div class="kpi"><span>میانه</span><b class="${tone(sum.median)}">${esc(money(sum.median, { sign: true }))}</b><small>صدک ۲۵ تا ۷۵: ${esc(money(sum.p25, { sign: true }))} تا ${esc(money(sum.p75, { sign: true }))}</small></div>
        <div class="kpi"><span>بدترین</span><b class="loss">${esc(money(sum.min, { sign: true }))}</b></div>
        <div class="kpi"><span>مسیرهای سودده</span><b>${pct(sum.winRate, 0)}</b></div>
        <div class="kpi"><span>رتبهٔ مسیر من</span><b>${pct(rank, 0)}</b><small>از مسیرها بدتر از مسیر من بودند</small></div>
      </div>
      <div class="sl-legend"><span class="sl-key mine"></span>مسیر من <span class="sl-key algo"></span>الگوریتم کامل <span class="sl-key exits"></span>فقط حد سود و ضرر
        <span class="sl-key hold"></span>نگه‌داشتن <span class="sl-key best"></span>بهترین <span class="sl-key worst"></span>بدترین</div>
      ${fanSvg({ paths: res.paths, dates, highlights: [
        best && { series: best.series, cls: 'best', label: 'بهترین', final: best.final },
        worst && { series: worst.series, cls: 'worst', label: 'بدترین', final: worst.final },
        { series: base.hold.series, cls: 'hold', label: 'نگه‌داشتن', final: base.hold.final },
        { series: base.exitsOnly.series, cls: 'exits', label: 'فقط حد سود و ضرر', final: base.exitsOnly.final },
        { series: base.algo.series, cls: 'algo', label: 'الگوریتم کامل', final: base.algo.final },
        { series: mine.series, cls: 'mine', label: 'مسیر من', final: mine.final },
      ].filter(Boolean) })}
      <h4 class="sl-sub">توزیع نتیجهٔ نهایی</h4>
      ${histSvg({ finals: res.paths.map((p) => p.final), markers: [
        { value: mine.final, cls: 'mine', label: 'من' }, { value: base.algo.final, cls: 'algo', label: 'الگوریتم' },
        { value: base.hold.final, cls: 'hold', label: 'نگه‌داشتن' }] })}
      <div class="history-table-wrap"><table class="sl-cmp-table">
        <thead><tr><th>مسیر</th><th>نتیجه</th><th>٪ سرمایه</th><th>تعدیل</th><th>پایان</th><th>صدک</th></tr></thead>
        <tbody>${row(`مسیر من (ادامه: ${POLICIES[cmpOpts.policy].label})`, 'mine', mine)}${row('الگوریتم کامل', 'algo', base.algo)}
          ${row('فقط حد سود و ضرر', 'exits', base.exitsOnly)}${row('نگه‌داشتن تا پایان', 'hold', base.hold)}
          ${best ? row('بهترین مسیر', 'best', best) : ''}${worst ? row('بدترین مسیر', 'worst', worst) : ''}</tbody></table></div>
      <div class="section-head sl-sub-head"><h4 class="sl-sub">${cmpOpts.list === 'worst' ? 'ده مسیر بدتر' : 'ده مسیر برتر'}</h4>
        <div class="bar"><button type="button" class="sl-chip-btn${cmpOpts.list !== 'worst' ? ' on' : ''}" data-act="cmp-list" data-v="best">برترها</button>
        <button type="button" class="sl-chip-btn${cmpOpts.list === 'worst' ? ' on' : ''}" data-act="cmp-list" data-v="worst">بدترها</button></div></div>
      <div class="history-table-wrap"><table class="sl-cmp-table">
        <thead><tr><th>#</th><th>نتیجه</th><th>تصمیم‌ها در انشعاب‌ها</th><th>تعدیل</th><th>پایان</th><th></th></tr></thead>
        <tbody>${top.map((p, k) => `<tr><td>${faDigits(String(k + 1))}</td><td class="${tone(p.final)}">${esc(money(p.final, { sign: true }))}</td>
          <td class="sl-chips">${choiceChips(p.choices)}</td><td>${faDigits(String(p.adjustments))}</td><td>${esc(reasonText(p.reason))}</td>
          <td><button type="button" class="ghost sl-mini" data-act="load-path" data-id="${p.id}" title="این مسیر مسیر من شود (مسیر فعلی شاخه می‌شود)">بارگذاری</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function cmpWhatIfHtml() {
    const key = `wi|${JSON.stringify(wiOpts)}|${JSON.stringify(exp.decisions)}|${exp.cursor}|${JSON.stringify(exp.cfg)}`;
    let res = memo.get(key);
    if (!res) {
      res = whatIfMatrix(ctx, cfgOf(), exp.entry, exp.decisions, { ...wiOpts, fees: fees(), upTo: exp.cursor });
      memo.set(key, res);
    }
    if (res.error) return `<p class="note warn">${esc(res.error)}</p>`;
    for (const r of res.rows) {
      const step = res.base.steps.find((s) => s.i === r.i);
      r.chosenText = actionText(step?.action);
    }
    const best = Math.max(...res.rows.flatMap((r) => r.cells.map((c) => c.final)).filter(fin));
    return `<div class="bar sl-cmp-controls">
        <div class="field"><label for="wi-cont">بعد از آن روز</label><select id="wi-cont" data-act="wi-cont">
          ${[['algo', 'پیروی از الگوریتم'], ['hold', 'نگه‌داشتن تا پایان'], ['exitsOnly', 'فقط حد سود و ضرر'], ['user', 'همان تصمیم‌های بعدی من']]
            .map(([k, t]) => `<option value="${k}"${wiOpts.continuation === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <fieldset class="sl-inline"><legend>ستون‌ها</legend>${Object.entries(BRANCH_OPTIONS).map(([k, t]) => `<label class="sl-check"><input type="checkbox" data-act="wi-opt" value="${k}" ${wiOpts.options.includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</fieldset>
      </div>
      <p class="note">هر خانه: اگر در آن روز آن گزینه را انتخاب می‌کردی (و تا روز قبل همان تصمیم‌های خودت)، نتیجهٔ نهایی چه می‌شد. خانهٔ قاب‌دار انتخاب خودت است؛ خانهٔ ستاره‌دار بهترین کل جدول.</p>
      ${whatIfHtml({ rows: res.rows, options: wiOpts.options, best })}`;
  }

  function cmpEntriesHtml() {
    const S = market.days[0].S;
    const strikes = market.strikes.map((s) => s.strike);
    const ci = strikes.indexOf(Number(exp.entry.call)), pi = strikes.indexOf(Number(exp.entry.put));
    const calls = strikes.slice(Math.max(0, ci - 3), ci + 4).filter((K) => K >= S * 0.97);
    const puts = strikes.slice(Math.max(0, pi - 3), pi + 4).filter((K) => K <= S * 1.03);
    const key = `entries|${entryPolicy}|${JSON.stringify(exp.cfg)}|${calls.join()}|${puts.join()}`;
    let grid = memo.get(key);
    if (!grid) {
      grid = puts.map((P) => calls.map((C) => (C < P ? null : { C, P, run: policyRun(entryPolicy, cfgOf(), { call: C, put: P }) })));
      memo.set(key, grid);
    }
    const all = grid.flat().filter((c) => c && fin(c.run.final)).map((c) => c.run.final);
    const scale = Math.max(1, ...all.map(Math.abs));
    const best = Math.max(...all);
    return `<div class="bar sl-cmp-controls">
        <div class="field"><label for="en-pol">مدیریت پس از ورود</label><select id="en-pol" data-act="entry-policy">${Object.entries(POLICIES)
          .map(([k, p]) => `<option value="${k}"${entryPolicy === k ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
      </div>
      <p class="note">اگر روز ورود قیمت‌های اعمال دیگری فروخته بودی. سطر = پوت، ستون = کال. برای شروع آزمایشی تازه با همان ورود، روی خانه بزن.</p>
      <div class="history-table-wrap"><table class="sl-wi-table">
        <thead><tr><th>پوت \\ کال</th>${calls.map((C) => `<th>${strikeFa(C)}${C === Number(exp.entry.call) ? ' ●' : ''}</th>`).join('')}</tr></thead>
        <tbody>${grid.map((rowCells, r) => `<tr><th scope="row">${strikeFa(puts[r])}${puts[r] === Number(exp.entry.put) ? ' ●' : ''}</th>${rowCells.map((c) => {
          if (!c) return '<td class="sl-wi-na">—</td>';
          if (c.run.error) return `<td class="sl-wi-na" title="${esc(c.run.error)}">بی‌قیمت</td>`;
          const lv = fin(c.run.final) ? Math.ceil(Math.min(1, Math.abs(c.run.final) / scale) * 4) : 0;
          const mine = c.C === Number(exp.entry.call) && c.P === Number(exp.entry.put);
          return `<td class="sl-wi ${tone(c.run.final)} lv${lv}${mine ? ' chosen' : ''}${c.run.final === best ? ' best' : ''}">
            <button type="button" class="linklike" data-act="entry-try" data-call="${c.C}" data-put="${c.P}"><b>${esc(money(c.run.final, { sign: true }))}</b>
            <small>${faDigits(String(c.run.state?.adjustments ?? 0))} تعدیل، ${esc(reasonText(c.run.state?.reason))}</small></button></td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  const SENS = [
    ['trigLo', 'آستانهٔ تعدیل (٪)', [5, 10, 15, 20, 30], (v) => ({ trigLo: v, trigHi: Math.max(v, v + 5) })],
    ['slPct', 'حد ضرر (٪ پرمیوم)', [50, 100, 150, 200, 300]],
    ['tpPct', 'حد سود (٪ پرمیوم)', [25, 50, 75, 100]],
    ['ratio3x', 'قانون n برابر', [2, 2.5, 3, 4]],
    ['straddleExitDays', 'روزهای پایانی استرادل', [3, 7, 14]],
    ['matchRule', 'برابری پرمیوم', LAB_CHOICES.matchRule.map(([k]) => k)],
    ['trigBasis', 'مبنای زیان شناور', LAB_CHOICES.trigBasis.map(([k]) => k)],
    ['unstableEarly', 'استرادل ناپایدار زودهنگام', LAB_CHOICES.unstableEarly.map(([k]) => k)],
  ];

  function cmpParamsHtml() {
    const cfg = cfgOf();
    const label = (key, v) => {
      const pick = LAB_CHOICES[key]?.find(([k]) => k === v);
      return pick ? pick[1] : faDigits(String(v));
    };
    const rows = SENS.map(([key, title, values, make]) => {
      const cells = values.map((v) => {
        const run = policyRun('algo', labConfig({ ...cfg, ...(make ? make(v) : { [key]: v }) }));
        return { v, run, current: cfg[key] === v };
      });
      const finals = cells.map((c) => c.run.final).filter(fin);
      // ستاره فقط وقتی معنا دارد که مقدارها با هم فرق کنند.
      const top = finals.length && Math.max(...finals) - Math.min(...finals) > 1e-6 ? Math.max(...finals) : NaN;
      return `<tr><th scope="row">${esc(title)}</th>${cells.map((c) => `<td class="sl-sens ${tone(c.run.final)}${c.current ? ' chosen' : ''}${c.run.final === top ? ' best' : ''}">
        <button type="button" class="linklike" data-act="sens-apply" data-key="${key}" data-v="${esc(c.v)}" title="این مقدار در قواعد آزمایش بنشیند">
        <small>${esc(label(key, c.v))}</small><b>${esc(money(c.run.final, { sign: true }))}</b><small>${faDigits(String(c.run.state?.adjustments ?? 0))} تعدیل</small></button></td>`).join('')}</tr>`;
    }).join('');
    return `<p class="note">هر پارامتر جداگانه عوض می‌شود و بقیه همان قواعد فعلی می‌مانند؛ مدیریت «الگوریتم کامل» است. خانهٔ قاب‌دار مقدار فعلی است؛ با زدن هر خانه، همان مقدار در قواعد آزمایش می‌نشیند.</p>
      <div class="history-table-wrap"><table class="sl-sens-table"><tbody>${rows}</tbody></table></div>`;
  }

  function cmpBranchesHtml() {
    const list = exp.branches || [];
    if (!list.length) return '<p class="note">هنوز شاخه‌ای نداری. با «ذخیرهٔ این مسیر به‌عنوان شاخه»، یا وقتی تصمیم روزی گذشته را عوض می‌کنی، مسیر قبلی این‌جا می‌ماند.</p>';
    return `<p class="note">شاخه‌ها مسیرهای کامل‌اند (تصمیم‌های ثبت‌شده و برای بقیه «${esc(POLICIES.algo.label)}»). تیک «روی نمودار» شاخه را کنار مسیر خودت روی نمودار سود و زیان می‌کشد.</p>
      <div class="history-table-wrap"><table class="sl-cmp-table"><thead><tr><th>شاخه</th><th>نتیجه</th><th>تصمیم‌ها</th><th>تعدیل</th><th>روی نمودار</th><th></th></tr></thead>
      <tbody>${list.map((b) => {
        const run = runPath(ctx, cfgOf(), exp.entry, { decide: planDecider(b.decisions, 'algo'), fees: fees() });
        return `<tr><th scope="row">${esc(b.name)}<small class="note"> ${esc(dateFa(Number(new Date(b.at).toISOString().slice(0, 10).replace(/-/g, ''))))}</small></th>
          <td class="${tone(run.final)}">${esc(money(run.final, { sign: true }))}</td><td>${faDigits(String(Object.keys(b.decisions).length))}</td>
          <td>${faDigits(String(run.state?.adjustments ?? 0))}</td>
          <td><input type="checkbox" data-act="overlay" data-id="${esc(b.id)}" ${overlayIds.has(b.id) ? 'checked' : ''} aria-label="روی نمودار"></td>
          <td><button type="button" class="ghost sl-mini" data-act="branch-load" data-id="${esc(b.id)}">بارگذاری</button>
            <button type="button" class="ghost sl-mini" data-act="branch-del" data-id="${esc(b.id)}" title="حذف">✕</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function compareHtml() {
    const tabs = [['paths', 'همهٔ مسیرها'], ['whatif', 'اگر آن روز…'], ['entries', 'ورودهای دیگر'], ['params', 'حساسیت قواعد'], ['branches', `شاخه‌های من (${faDigits(String((exp.branches || []).length))})`]];
    let body = '';
    try {
      body = cmpTab === 'paths' ? cmpPathsHtml() : cmpTab === 'whatif' ? cmpWhatIfHtml() : cmpTab === 'entries' ? cmpEntriesHtml()
        : cmpTab === 'params' ? cmpParamsHtml() : cmpBranchesHtml();
    } catch (e) {
      logError('مقایسهٔ مسیرهای استرانگل', e);
      body = `<p class="note warn">مقایسه ساخته نشد: ${esc(e.message)}</p>`;
    }
    return `<section class="card sl-compare">
      <div class="section-head"><div><p class="eyebrow">مقایسهٔ احتمالات، این بخش آینده را می‌بیند</p><h3>اگر جور دیگری تصمیم می‌گرفتم؟</h3></div></div>
      <div class="sl-tabs" role="tablist">${tabs.map(([id, t]) => `<button type="button" role="tab" class="sl-tab${cmpTab === id ? ' on' : ''}" aria-selected="${cmpTab === id}" data-act="cmp-tab" data-tab="${id}">${esc(t)}</button>`).join('')}</div>
      <div class="sl-cmp-body">${body}</div>
    </section>`;
  }

  function renderLab() {
    if (!market || !ctx) return;
    const run = currentRun();
    if (run.error) {
      main.innerHTML = `<section class="card"><h3>آزمایش اجرا نشد</h3><p class="note warn">${esc(run.error)}</p>
        <button type="button" class="btn" data-act="reconfig">بازگشت به تنظیم</button></section>`;
      return;
    }
    const n = market.days.length;
    const upTo = run.done ? n - 1 : run.pending?.i ?? n - 1;
    if (view == null || view > upTo || view < 1) view = run.done ? null : run.pending?.i;
    exp.done = !!run.done;
    exp.final = run.final;
    const cfg = cfgOf();
    const initial = run.steps[0].state.initialCredit;
    const { calls, puts } = strikePaths(run);
    const marks = run.steps.filter((s) => s.i > 0 && s.action && s.action.kind !== 'hold')
      .map((s) => ({ i: s.i, cls: s.action.kind, tip: `${dateFa(s.date)}: ${actionText(s.action)}` }));
    const overlays = (exp.branches || []).filter((b) => overlayIds.has(b.id)).map((b, k) => ({
      series: runPath(ctx, cfg, exp.entry, { decide: planDecider(b.decisions, 'algo'), fees: fees() }).series,
      cls: `branch b${(k % 4) + 1}`, label: b.name,
    }));
    if (exp.reveal) {
      const fut = myFullRun(exp.revealPolicy || 'algo');
      overlays.unshift({ series: fut.series.map((v, i) => (i >= upTo ? v : NaN)), cls: 'future', label: 'ادامهٔ مسیر (آینده)' });
    }
    main.innerHTML = `
      <div class="bar sl-labbar">
        <input class="sl-title-input" id="sl-exp-name" value="${esc(exp.name)}" aria-label="نام آزمایش">
        <span class="sp"></span>
        <button type="button" class="ghost" data-act="save-branch">ذخیره به‌عنوان شاخه</button>
        <button type="button" class="ghost" data-act="rules-toggle">قواعد</button>
        <button type="button" class="ghost" data-act="reconfig">تنظیم دوباره</button>
        <button type="button" class="ghost" data-act="restart" title="همهٔ تصمیم‌ها پاک می‌شود؛ مسیر فعلی شاخه می‌شود">↺ از نو</button>
      </div>
      ${exp.rulesOpen ? `<section class="card sl-rules-card"><div class="sl-rules-grid" id="sl-rules">${rulesFormHtml(cfg, 'lab')}</div>
        <div class="bar"><button type="button" class="btn" data-act="rules-apply">اعمال قواعد</button>
        <button type="button" class="ghost" data-act="rules-reset">پیش‌فرض متن الگوریتم</button>
        <span class="note">تصمیم‌های ثبت‌شده می‌مانند؛ تصمیم‌های «پیشنهاد الگوریتم» با قواعد تازه دوباره ساخته می‌شوند.</span></div></section>` : ''}
      ${heroHtml(run)}
      <section class="card sl-time">
        <div class="section-head"><div><p class="eyebrow">خط زمان معامله</p><h3>${esc(dateFa(market.days[0].date))} تا ${esc(dateFa(market.days[n - 1].date))}</h3></div>
          <div class="sl-legend"><span class="sl-dotkey open"></span>ورود <span class="sl-dotkey hold"></span>نگه‌داشتن <span class="sl-dotkey adjust"></span>تعدیل
          <span class="sl-dotkey close"></span>بستن <span class="sl-dotkey ignored"></span>پیشنهاد نادیده <span class="sl-dotkey missing"></span>بی‌قیمت <span class="sl-dotkey pending"></span>امروز</div></div>
        ${timelineHtml({ days: market.days, steps: run.steps, cursor: run.pending?.i, view, done: run.done, closedAt: run.state?.closedAt ?? Infinity })}
        <div class="sl-charts">
          <div><h4 class="sl-sub">قیمت پایه میان دو قیمت اعمال</h4>
            <div class="sl-legend"><span class="sl-key spot"></span>پایه <span class="sl-key call"></span>کال <span class="sl-key put"></span>پوت</div>
            ${channelSvg({ days: market.days, calls, puts, upTo, cursor: view, reveal: exp.reveal, marks })}</div>
          <div><h4 class="sl-sub">سود و زیان روزانه</h4>
            <div class="sl-legend"><span class="sl-key pnl"></span>مسیر من${overlays.map((o) => ` <span class="sl-key ${esc(o.cls)}"></span>${esc(o.label)}`).join('')}</div>
            ${pnlSvg({ series: run.series, dates: market.days.map((d) => d.date), tp: (cfg.tpPct / 100) * initial, sl: (cfg.slPct / 100) * initial, upTo, cursor: view, overlays })}</div>
        </div>
      </section>
      ${decisionHtml(run)}
      ${journalHtml(run)}
      ${compareHtml()}`;
    const node = main.querySelector('.sl-node.viewing, .sl-node.pending');
    const strip = main.querySelector('.sl-timeline');
    if (node && strip) strip.scrollLeft += node.getBoundingClientRect().left - strip.getBoundingClientRect().left - strip.clientWidth / 2;
    save();
  }

  // ═════════════════════════ کنش‌ها ═════════════════════════

  function snapshotBranch(name) {
    exp.branches = exp.branches || [];
    exp.branches.unshift({ id: uid(), name, decisions: structuredClone(exp.decisions), at: Date.now() });
    exp.branches = exp.branches.slice(0, 30);
  }

  function commitAt(v, action, via) {
    const date = market.days[v].date;
    exp.decisions[date] = { ...action, via };
  }

  /** گزینهٔ انتخاب‌شدهٔ پنل: انتخاب تازهٔ کاربر، وگرنه پیشنهاد (روز جاری) یا همان تصمیم ثبت‌شده (روز گذشته). */
  function selectedId(dc, opts, v) {
    if (choice?.id) return choice.id;
    if (dc.pending) return 'algo';
    const stored = exp.decisions[market.days[v].date];
    if (stored?.via && opts.some((o) => o.id === stored.via)) return stored.via;
    return opts.find((o) => o.key === actionKey(dc.step.action))?.id || 'custom';
  }

  function chosenAction(run, v) {
    const dc = dayContext(run, v);
    if (!dc) return null;
    const opts = dayOptions(dc.st, v, dc.ev);
    const id = selectedId(dc, opts, v);
    if (id === 'custom') {
      const c = choice?.id === 'custom' ? choice : null;
      if (!c || c.strike === '' || c.strike == null) return null;
      return { action: { kind: 'roll', side: c.side, strike: c.strike === 'none' ? null : Number(c.strike) }, via: 'custom' };
    }
    const o = opts.find((x) => x.id === id);
    return o ? { action: o.action, via: o.id } : null;
  }

  async function startFromDraft() {
    const d = draft;
    const cfg = readRules(main, d.cfg);
    exp = {
      id: uid(), name: main.querySelector('#sl-name')?.value?.trim() || `${d.uaName}`,
      created: Date.now(), updated: Date.now(),
      from: d.from, to: d.to, uaIns: d.uaIns, uaName: d.uaName, expiry: d.expiry, size: d.size,
      entry: { ...d.entry }, cfg, decisions: {}, cursor: 1, branches: [], reveal: false,
    };
    draft = null; view = null; choice = null;
    makeCtx();
    renderLab();
  }

  async function openExperiment(id) {
    const found = store.list.find((x) => x.id === id);
    if (!found) return;
    exp = structuredClone(found);
    draft = null; view = null; choice = null; overlayIds = new Set();
    main.innerHTML = '<section class="card"><p class="note sl-busy-line">در حال دریافت قراردادها و قیمت‌های روزانهٔ همان بازه…</p></section>';
    renderSaved();
    try {
      await fetchUniverse(exp.from, exp.to);
      await loadMarket(exp);
      if (!alive) return;
      renderLab();
    } catch (e) {
      logError('بازکردن آزمایش استرانگل', e);
      main.innerHTML = `<section class="card"><h3>داده دریافت نشد</h3><p class="note warn">${esc(e.message)}</p>
        <button type="button" class="btn" data-act="open" data-id="${esc(id)}">تلاش دوباره</button></section>`;
    }
  }

  async function onClick(ev) {
    const el = ev.target.closest('[data-act], [data-day]');
    if (!el || !root.contains(el)) return;
    const act = el.dataset.act || (el.matches('.sl-hit, .sl-wi-day') ? 'view' : '');
    if (!act) return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return; // با change رسیدگی می‌شود
    try {
      switch (act) {
        case 'new': newDraft(); renderSaved(); renderSetup(); break;
        case 'open': await openExperiment(el.dataset.id); break;
        case 'dup': {
          const src = store.list.find((x) => x.id === el.dataset.id);
          if (!src) break;
          const copy = { ...structuredClone(src), id: uid(), name: `${src.name} (رونوشت)`, created: Date.now() };
          store.list.unshift(copy); writeStore(store); renderSaved();
          break;
        }
        case 'del': {
          const src = store.list.find((x) => x.id === el.dataset.id);
          if (!src || !window.confirm(`آزمایش «${src.name}» حذف شود؟`)) break;
          store.list = store.list.filter((x) => x.id !== src.id);
          writeStore(store);
          if (exp?.id === src.id) { newDraft(); renderSetup(); }
          renderSaved();
          break;
        }
        case 'preset': {
          const today = todayCompact();
          const from = daysBefore(today, Number(el.dataset.n));
          const to = Math.min(today, daysBefore(from, -50));
          draft.fromText = jalaliInput(from); draft.toText = jalaliInput(to);
          renderSetup();
          break;
        }
        case 'load-universe': {
          draft.fromText = main.querySelector('#sl-from').value;
          draft.toText = main.querySelector('#sl-to').value;
          const parsed = parseJalaliRange(draft.fromText, draft.toText);
          if (!parsed.ok) { renderSetup(parsed.error); break; }
          draft.from = parsed.range.from; draft.to = parsed.range.to;
          draft.uaIns = ''; draft.expiry = 0; draft.step = 2; market = null;
          busy = 'در حال دریافت فهرست قراردادهای بازه…'; renderSetup();
          try { await fetchUniverse(draft.from, draft.to); busy = ''; renderSetup(); }
          catch (e) { busy = ''; logError('فهرست قراردادهای بازه', e); renderSetup(`فهرست قراردادها دریافت نشد: ${e.message}`); }
          break;
        }
        case 'pick-expiry':
          draft.expiry = Number(el.dataset.expiry); draft.step = 2; market = null; renderSetup(); break;
        case 'load-market': {
          draft.size = Number(main.querySelector('#sl-size')?.value) || draft.size;
          busy = 'در حال دریافت قیمت‌های روزانهٔ پایه و همهٔ قراردادهای این سررسید…'; renderSetup();
          try {
            await loadMarket(draft);
            draft.entry = { call: null, put: null }; draft.step = 3; busy = ''; renderSetup();
          } catch (e) { busy = ''; logError('قیمت‌های روزانهٔ استرانگل', e); renderSetup(`قیمت‌ها دریافت نشد: ${e.message}`); }
          break;
        }
        case 'pick-strike': {
          draft.cfg = readRules(main, draft.cfg);
          draft.entry = { ...draft.entry, [el.dataset.side]: Number(el.dataset.strike) };
          renderSetup();
          break;
        }
        case 'auto-entry': {
          draft.cfg = readRules(main, draft.cfg); makeCtx();
          const auto = pickEntry(ctx, labConfig(draft.cfg), 0);
          draft.entry = { call: auto.call, put: auto.put };
          renderSetup();
          break;
        }
        case 'rules-reset':
          if (draft) { draft.cfg = { ...LAB_DEFAULTS, qty: labConfig(draft.cfg).qty }; makeCtx(); renderSetup(); }
          else if (exp) { exp.cfg = { ...LAB_DEFAULTS, qty: cfgOf().qty }; makeCtx(); renderLab(); }
          break;
        case 'start': await startFromDraft(); break;
        case 'reconfig': {
          draft = {
            fromText: jalaliInput(exp.from), toText: jalaliInput(exp.to), from: exp.from, to: exp.to,
            uaIns: exp.uaIns, uaName: exp.uaName, expiry: exp.expiry, size: exp.size, entry: { ...exp.entry },
            cfg: { ...exp.cfg }, step: 3, search: '', name: exp.name,
          };
          exp = null; makeCtx(); renderSaved(); renderSetup();
          break;
        }
        case 'rules-toggle': exp.rulesOpen = !exp.rulesOpen; renderLab(); break;
        case 'rules-apply': exp.cfg = readRules(main, exp.cfg); makeCtx(); renderLab(); break;
        case 'restart':
          if (!window.confirm('همهٔ تصمیم‌ها پاک شود و آزمایش از روز ورود شروع شود؟ مسیر فعلی به‌عنوان شاخه می‌ماند.')) break;
          snapshotBranch(`پیش از شروع دوباره، ${faDigits(String(Object.keys(exp.decisions).length))} تصمیم`);
          exp.decisions = {}; exp.cursor = 1; view = null; choice = null; memo.clear(); renderLab();
          break;
        case 'view': {
          const d = Number(el.dataset.day);
          if (!Number.isFinite(d) || d < 1) break;
          const run = currentRun();
          const upTo = run.done ? market.days.length - 1 : run.pending?.i;
          if (d > upTo) break;
          view = d; choice = null; renderLab();
          root.querySelector('.sl-decide')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          break;
        }
        case 'view-prev': view = Math.max(1, (view ?? exp.cursor) - 1); choice = null; renderLab(); break;
        case 'view-next': view = (view ?? exp.cursor) + 1; choice = null; renderLab(); break;
        case 'view-pending': view = null; choice = null; renderLab(); break;
        case 'choose': choice = { id: el.dataset.id }; renderLab(); break;
        case 'commit': {
          const run = currentRun();
          const v = run.pending?.i;
          if (v == null) break;
          const picked = chosenAction(run, v);
          if (!picked) break;
          const pv = preview(run.pending.state, v, run.pending.ev, picked.action);
          if (pv.error) { window.alert(pv.error); break; }
          commitAt(v, picked.action, picked.via);
          exp.cursor = v + 1; view = null; choice = null; renderLab();
          break;
        }
        case 'skip-to-trigger': {
          // امروز صریحاً «نگه‌داشتن» می‌شود؛ بعد روزهای آرام تا اولین روزی
          // که الگوریتم کاری پیشنهاد کند.
          for (let g = 0; g < 500; g += 1) {
            const run = currentRun();
            if (!run.pending) break;
            if (g > 0 && run.pending.ev.rec.kind !== 'hold') break;
            commitAt(run.pending.i, { kind: 'hold' }, 'hold');
            exp.cursor = run.pending.i + 1;
          }
          view = null; choice = null; renderLab();
          break;
        }
        case 'auto-algo': {
          let guard = 0;
          for (;;) {
            const run = currentRun();
            if (!run.pending || guard++ > 400) break;
            commitAt(run.pending.i, run.pending.ev.rec.action, 'algo');
            exp.cursor = run.pending.i + 1;
          }
          view = null; choice = null; renderLab();
          break;
        }
        case 'undo': {
          const dates = Object.keys(exp.decisions).map(Number).sort((a, b) => a - b);
          const run = currentRun();
          const target = run.pending ? run.pending.i - 1 : Math.min(run.state?.closedAt ?? exp.cursor, market.days.length - 2);
          if (target < 1) break;
          const date = market.days[target].date;
          for (const d of dates) if (d >= date) delete exp.decisions[d];
          exp.cursor = target; view = null; choice = null; renderLab();
          break;
        }
        case 'commit-edit': {
          const run = currentRun();
          const v = view;
          const picked = v != null ? chosenAction(run, v) : null;
          if (!picked) { window.alert('اول یکی از گزینه‌ها را انتخاب کن.'); break; }
          const dc = dayContext(run, v);
          const pv = preview(dc.st, v, dc.ev, picked.action);
          if (pv.error) { window.alert(pv.error); break; }
          snapshotBranch(`پیش از تغییر ${shortDateFa(market.days[v].date)}`);
          commitAt(v, picked.action, picked.via);
          if (editMode === 'cut') {
            for (const d of Object.keys(exp.decisions).map(Number)) if (d > market.days[v].date) delete exp.decisions[d];
            exp.cursor = v + 1;
          }
          memo.clear(); view = editMode === 'cut' ? null : v; choice = null; renderLab();
          break;
        }
        case 'save-branch': {
          const name = window.prompt('نام شاخه:', `شاخه ${faDigits(String((exp.branches || []).length + 1))}`);
          if (name == null) break;
          snapshotBranch(name.trim() || 'شاخه');
          cmpTab = 'branches'; renderLab();
          break;
        }
        case 'branch-load': {
          const b = exp.branches.find((x) => x.id === el.dataset.id);
          if (!b) break;
          snapshotBranch(`پیش از بارگذاری «${b.name}»`);
          exp.decisions = structuredClone(b.decisions);
          exp.cursor = market.days.length; view = null; choice = null; memo.clear(); renderLab();
          break;
        }
        case 'branch-del':
          exp.branches = exp.branches.filter((x) => x.id !== el.dataset.id);
          overlayIds.delete(el.dataset.id); renderLab();
          break;
        case 'load-path': {
          const res = comparePaths();
          const p = res.paths.find((x) => String(x.id) === el.dataset.id);
          if (!p) break;
          snapshotBranch('پیش از بارگذاری مسیر مقایسه');
          // تصمیم‌های پیش از انشعاب (اگر مقایسه از امروز بود) می‌مانند؛
          // روزهای بی‌انشعاب «نگه‌داشتن»اند، پس همان مسیر بازسازی می‌شود.
          const keep = cmpOpts.from === 'cursor' ? Object.fromEntries(Object.entries(exp.decisions).filter(([d]) => Number(d) < market.days[exp.cursor]?.date)) : {};
          exp.decisions = keep;
          for (const c of p.choices) exp.decisions[c.date] = { ...c.action, via: 'path' };
          exp.cursor = market.days.length; view = null; choice = null; memo.clear(); renderLab();
          break;
        }
        case 'cmp-tab': cmpTab = el.dataset.tab; renderLab(); break;
        case 'cmp-list': cmpOpts = { ...cmpOpts, list: el.dataset.v }; renderLab(); break;
        case 'entry-try': {
          if (!window.confirm('آزمایش تازه‌ای با همین ورود ساخته شود؟ (آزمایش فعلی دست نمی‌خورد)')) break;
          const copy = { ...structuredClone(exp), id: uid(), name: `${exp.name}، ورود ${faDigits(el.dataset.put)}/${faDigits(el.dataset.call)}`,
            entry: { call: Number(el.dataset.call), put: Number(el.dataset.put) }, decisions: {}, cursor: 1, branches: [], created: Date.now() };
          store.list.unshift(copy); writeStore(store);
          exp = copy; view = null; choice = null; memo.clear(); renderLab();
          break;
        }
        case 'sens-apply': {
          const key = el.dataset.key;
          const raw = el.dataset.v;
          const value = typeof LAB_DEFAULTS[key] === 'number' ? Number(raw) : raw;
          exp.cfg = { ...exp.cfg, [key]: value, ...(key === 'trigLo' ? { trigHi: Math.max(Number(raw), Number(raw) + 5) } : {}) };
          memo.clear(); renderLab();
          break;
        }
        default: break;
      }
    } catch (e) {
      logError(`استرانگل در بوتهٔ آزمایش — ${act}`, e);
      window.alert(`خطا: ${e.message}`);
    }
  }

  function onChange(ev) {
    const el = ev.target;
    const act = el.dataset?.act;
    try {
      if (el.id === 'sl-base') {
        draft.uaIns = el.value;
        draft.uaName = labBases(universe.rows).find((b) => b.ins === el.value)?.name || '';
        draft.expiry = pickExpiry(labExpiries(universe.rows, el.value), draft.from, labConfig(draft.cfg))?.expiry || 0;
        draft.step = 2; market = null;
        renderSetup();
        return;
      }
      if (el.id === 'sl-size') { draft.size = Number(el.value) || draft.size; if (market) { market.size = draft.size; makeCtx(); } renderSetup(); return; }
      if (el.id === 'sl-exp-name') { exp.name = el.value.trim() || exp.name; save(); return; }
      if (el.dataset?.cfg && draft && main.querySelector('.sl-setup')) {
        draft.cfg = readRules(main, draft.cfg); draft.rulesOpen = true; makeCtx(); renderSetup();
        return;
      }
      if (!act || !exp) return;
      switch (act) {
        case 'custom-side': choice = { id: 'custom', side: el.value, strike: '' }; renderLab(); break;
        case 'custom-strike': choice = { id: 'custom', side: choice?.side || root.querySelector('[data-act="custom-side"]').value, strike: el.value }; renderLab(); break;
        case 'edit-mode': editMode = el.value; break;
        case 'reveal': exp.reveal = el.checked; renderLab(); break;
        case 'reveal-policy': exp.revealPolicy = el.value; renderLab(); break;
        case 'cmp-mode': cmpOpts = { ...cmpOpts, mode: el.value }; renderLab(); break;
        case 'cmp-from': cmpOpts = { ...cmpOpts, from: el.value }; renderLab(); break;
        case 'cmp-cap': cmpOpts = { ...cmpOpts, cap: Number(el.value) }; renderLab(); break;
        case 'cmp-policy': cmpOpts = { ...cmpOpts, policy: el.value }; renderLab(); break;
        case 'cmp-opt': {
          const set = new Set(cmpOpts.options);
          if (el.checked) set.add(el.value); else set.delete(el.value);
          if (!set.size) set.add('algo');
          cmpOpts = { ...cmpOpts, options: Object.keys(BRANCH_OPTIONS).filter((k) => set.has(k)) };
          renderLab();
          break;
        }
        case 'wi-cont': wiOpts = { ...wiOpts, continuation: el.value }; renderLab(); break;
        case 'wi-opt': {
          const set = new Set(wiOpts.options);
          if (el.checked) set.add(el.value); else set.delete(el.value);
          if (!set.size) set.add('algo');
          wiOpts = { ...wiOpts, options: Object.keys(BRANCH_OPTIONS).filter((k) => set.has(k)) };
          renderLab();
          break;
        }
        case 'entry-policy': entryPolicy = el.value; renderLab(); break;
        case 'overlay': if (el.checked) overlayIds.add(el.dataset.id); else overlayIds.delete(el.dataset.id); renderLab(); break;
        default: break;
      }
    } catch (e) {
      logError(`استرانگل در بوتهٔ آزمایش — ${act || el.id}`, e);
    }
  }

  function onInput(ev) {
    if (ev.target.id !== 'sl-search' || !draft) return;
    draft.search = ev.target.value;
    renderSetup();
    const box = root.querySelector('#sl-search');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }

  function onKey(ev) {
    if (!exp || ev.target.closest('input, select, textarea')) return;
    if (ev.key === 'Enter' && root.querySelector('[data-act="commit"]')) { ev.preventDefault(); root.querySelector('[data-act="commit"]').click(); }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKey);

  renderSaved();
  if (store.list.length) await openExperiment(store.list[0].id);
  else { newDraft(); renderSetup(); }

  return () => {
    alive = false;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('keydown', onKey);
  };
}
