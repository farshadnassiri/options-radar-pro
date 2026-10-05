// تب «استرانگل فروش در بوتهٔ آزمایش».
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۲): «بک‌تست و اصلاح استرانگل فروش را به
// راحتی و با سرعت و با دیتای همان زمان انجام بدهیم.» روزبه‌روز: پایان هر
// روز، پیشنهاد الگوریتم با دادهٔ پایانیِ همان روز؛ انتخاب کاربر؛ روز بعد.
//
// دور دوم (همان روز): نمودارهای تعاملی با هاور، حجم قابل تنظیم با اسلایدر،
// تغییر روزانهٔ پایه و دو پا، اثر انباشتهٔ هر پا، اثر نقدی و وجه تضمینِ هر
// پیشنهاد، کارت کامل هر دایرهٔ خط زمان، سری‌های قابل حذف و افزودن، و
// کارنامهٔ پایان معامله با همهٔ مسیرهای ممکن.
//
// هیچ محاسبهٔ مالی اینجا نیست. موتور `core/strangle-lab.mjs` است و نمودارها
// و کارت‌ها `ui/strangle-lab-view.mjs`. این فایل فقط داده می‌آورد، وضعیت
// آزمایش را نگه می‌دارد و رویدادها را سیم‌کشی می‌کند.
//
// ═══ بی‌نگاه به آینده ═══
//
// تا وقتی کاربر روزی را پشت سر نگذاشته، قیمت آن روز روی صفحه نمی‌آید (مگر
// با کلید صریح «نمایش آینده»). بخش مقایسه و کارنامه که ذاتاً همهٔ آینده را
// می‌بینند، جدا و با همین برچسب‌اند.
//
// ═══ ماندگاری ═══
//
// آزمایش‌ها در حافظهٔ مرورگر می‌مانند: تنظیم، ورود و تصمیم‌ها — نه قیمت‌ها.

import {
  LAB_DEFAULTS, LAB_CHOICES, SIDES, SIDE_FA, POLICIES, BRANCH_OPTIONS, GRADE_BANDS,
  labConfig, labBases, labExpiries, pickExpiry, buildLabMarket, pricingContext,
  strikeBoard, pickEntry, openPosition, applyAction, adjustCandidate, defendAction,
  runPath, planDecider, pathStats, labMargin, enumeratePaths, pathsSummary, percentileOf,
  whatIfMatrix, actionKey, actionImpact, gradeReport, slForced, compareFinals, liquidityNotes, ivAt, deltaAt, weightedBreakevens, BASIS_FA, labReturnBase,
} from '/core/strangle-lab.mjs';
import { todayCompact, daysBefore, buildLine, calendarDays } from '/core/history-range.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { helpIcon } from '/ui/strangle-lab-help.mjs';
import { downloadStrangleExcel } from '/ui/strangle-lab-export.mjs';
import { historyDateLabel, daysBetween, normalizeHistoryDate } from '/core/history.mjs';
import { defaults, feesOf, marginParamsOf } from '/core/settings.mjs';
import { dailiesFor } from '/ui/strategy-history.mjs';
import { fmt, faDigits } from '/ui/fmt.mjs';
import { logError } from '/ui/errlog.mjs';
import { dayQuote } from '/core/price-change.mjs';
import {
  esc, money, tone, pct, price, strikeFa, dateFa, shortDateFa, dayNameFa, actionText, reasonText,
  srcBadge, lineChart, legendChips, tipValue, histSvg, gaugeHtml, timelineHtml, whatIfHtml, choiceChips, FULL, legGanttSvg, keySvg,
  moneyPct, legName, exactRial,
} from '/ui/strangle-lab-view.mjs';

const STORE = 'strangle-lab.v1';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
// نمرهٔ ذخیره‌شده فقط برای همان تصمیم‌ها، قواعد و ورود معتبر است. گزارش
// آزمون ۸۳e5888 مورد ۵: پس از تغییر گذشته، نمرهٔ قدیمی تا بازکردن دوبارهٔ
// کارنامه در فهرست می‌ماند.
const gradeKeyOf = (x) => JSON.stringify([x?.decisions || {}, x?.cfg || {}, x?.entry || {}]);
const uid = () => `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** روزِ `n` روز بعد از یک تاریخ فشرده (`daysBefore` عدد منفی نمی‌پذیرد). */
const addDays = (compact, n) => {
  const p = String(compact);
  const d = new Date(Date.UTC(+p.slice(0, 4), +p.slice(4, 6) - 1, +p.slice(6, 8)) + n * 864e5);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};
const toEn = (v) => String(v ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    return raw && Array.isArray(raw.list) ? raw : { list: [] };
  } catch { return { list: [] }; }
}
function writeStore(store) {
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) { logError('ذخیرهٔ آزمایش استرانگل', e, 'warn'); }
}


// ═════════════════════════ فرم قواعد: اسلایدر، دکمه، کلید ═════════════════════════

/** مرزهای اسلایدرِ هر پارامتر عددی. */
const RANGES = {
  dteLo: [7, 120, 1], dteHi: [7, 120, 1],
  deltaLo: [0.05, 0.5, 0.01], deltaHi: [0.05, 0.5, 0.01], otmPct: [1, 40, 0.5],
  capitalMult: [1, 10, 0.5], varLimitPct: [5, 50, 1],
  tpPct: [10, 300, 5], slPct: [10, 500, 10],
  trigLo: [1, 60, 1], trigHi: [1, 90, 1],
  ratio3x: [1.5, 6, 0.5], straddleExitDays: [0, 30, 1],
};

const UNIT = { otmPct: '٪', varLimitPct: '٪', tpPct: '٪', slPct: '٪', trigLo: '٪', trigHi: '٪', ratio3x: '×', capitalMult: '×', dteLo: ' روز', dteHi: ' روز', straddleExitDays: ' روز', qty: ' قرارداد' };
const showNum = (key, v) => `${faDigits(String(Number(v)))}${UNIT[key] || ''}`;

/** پارامترهای فرم قواعد: [کلید، برچسب، نوع، راهنما]. */
const RULE_FIELDS = [
  ['ورود (۲.۱ و ۲.۲)', 'سررسید و قیمت اعمالِ روز ورود.', [
    ['dteLo', 'کمترین روز تا سررسید', 'num', 'متن الگوریتم: ۴۵ تا ۵۰ روز'],
    ['dteHi', 'بیشترین روز تا سررسید', 'num'],
    ['entryMethod', 'روش انتخاب قیمت اعمال', 'pick'],
    ['deltaLo', 'دلتای هدف — از', 'num', '۰٫۱۶ تا ۰٫۲۰ یعنی احتمال موفقیت حدود ۷۰ تا ۸۰٪'],
    ['deltaHi', 'دلتای هدف — تا', 'num'],
    ['otmPct', 'فاصله از پایه', 'num', 'فقط در روش «درصد فاصله»'],
  ]],
  ['سرمایه (۱.۰)', 'سرمایهٔ تخصیصی و سقف ریسک حساب.', [
    ['capitalMult', 'ضریب سرمایه به وجه تضمین', 'num', '۳ برابر یعنی فقط حدود ۳۳٪ سرمایه درگیر وجه تضمین است'],
    ['varLimitPct', 'سقف زیان حساب', 'num', 'بند ۱.۲ — محدودهٔ ایمن ۱۰ تا ۱۵٪ سرمایه'],
  ]],
  ['حد سود و ضرر (۲.۳ و ۵)', 'هر دو نسبت به پرمیوم دریافتیِ روز ورود.', [
    ['tpPct', 'حد سود', 'num', '۱۰۰٪ یعنی کل پرمیوم — عملاً نگه‌داشتن تا سررسید'],
    ['slPct', 'حد ضرر', 'num', '۱۰۰٪ یعنی زیانی برابر کل پرمیوم (ریسک به ریوارد ۱:۱)'],
    ['slForce', 'حد ضرر اجباری (۵.۲ «خروج بی‌قیدوشرط»)', 'bool', 'روشن: روز رسیدن به حد ضرر هر تصمیمی بستن کامل اجرا می‌شود. خاموش: فقط پیشنهاد است'],
  ]],
  ['تعدیل (۳)', 'کی و چطور سمت سودده نزدیک‌تر فروخته شود.', [
    ['trigLo', 'آستانهٔ تعدیل — از', 'num', 'درصدی از سود هدفِ جاری (۳.۱)'],
    ['trigHi', 'آستانهٔ تعدیل — تا', 'num', 'بالاتر از این «تعدیل دیرهنگام» است، ولی باز تعدیل پیشنهاد می‌شود'],
    ['trigBasis', 'زیان شناور از کجا شمرده شود', 'pick', '«از آخرین تعدیل» همان خوانش ۳.۲.۳ است'],
    ['matchRule', 'برابری پرمیوم (۳.۲.۲)', 'pick', 'قیمت‌های اعمال گسسته‌اند؛ برابری دقیق کم پیش می‌آید'],
  ]],
  ['استرادل (۴)', 'وقتی دو قیمت اعمال یکی شدند.', [
    ['ratio3x', 'آستانهٔ ناپایداری', 'num', 'پرمیوم سمت بزرگ‌تر ≥ این ضریب × سمت کوچک‌تر'],
    ['straddleExitDays', 'روزهای پایانی برای خروج', 'num'],
    ['unstableEarly', 'ناپایدار با روز زیاد', 'pick'],
    ['breakevenRule', 'خروج سربه‌سر (۵.۳)', 'pick'],
  ]],
  ['قیمت ورود و خروج', 'روز ورود به چه قیمتی فروختی و روز خروج به چه قیمتی پس خریدی.', [
    ['entryBasis', 'قیمت فروشِ روز ورود', 'pick', 'برای فروشنده «بیشترین» خوش‌شانس‌ترین و «کمترین» بدشانس‌ترین فروش است'],
    ['manualEntryCall', 'قیمت انتخابی ورود کال', 'price', 'فقط با «قیمت انتخابی»'],
    ['manualEntryPut', 'قیمت انتخابی ورود پوت', 'price', 'فقط با «قیمت انتخابی»'],
    ['manualFree', 'سناریوی فرضی برای قیمت انتخابی', 'bool', 'خاموش: قیمت انتخابی فقط بین کمترین و بیشترین معاملهٔ همان روز پذیرفته می‌شود. روشن: هر عددی، با برچسب «فرضی»'],
    ['exitBasis', 'قیمت بازخریدِ روز خروج', 'pick', 'برای فروشنده «کمترین» خوش‌شانس‌ترین و «بیشترین» بدشانس‌ترین خرید است'],
    ['manualExitCall', 'قیمت انتخابی خروج کال', 'price', 'برای کالی که روز خروج در دست است'],
    ['manualExitPut', 'قیمت انتخابی خروج پوت', 'price', 'برای پوتی که روز خروج در دست است'],
  ]],
  ['داده', 'وقتی قیمتی نیست، چه شود.', [
    ['fees', 'کارمزد معامله و اعمال (از تنظیمات)', 'bool'],
    ['staleQuotes', 'ردیف با قیمت ولی بی‌معامله (حجم صفر)', 'pick', 'پایانیِ چنین روزی مانده از روزهای قبل است؛ پیش‌فرض «نداشته» است و ورود و تعدیل با آن ممکن نیست'],
    ['modelFill', 'قیمت مدل برای روز بی‌معامله', 'bool', 'بلک-شولز با IVِ آخرین روزِ معامله‌شده؛ هر جا بنشیند برچسب «مدل» دارد'],
    ['exitFallback', 'اگر روز خروج یکی از پاها معامله نشد', 'pick', 'قیمت ساخته نمی‌شود؛ یا بستن در آخرین روزِ واقعیِ قیمت‌دار، یا نتیجهٔ نامعلوم'],
  ]],
];

const GROUP_HELP = { 'ورود (۲.۱ و ۲.۲)': 'rules-entry', 'سرمایه (۱.۰)': 'rules-capital', 'حد سود و ضرر (۲.۳ و ۵)': 'rules-tpsl',
  'تعدیل (۳)': 'rules-adjust', 'استرادل (۴)': 'rules-straddle', 'قیمت ورود و خروج': 'entryBasis', 'داده': 'rules-data' };

function rulesFormHtml(cfg, prefix = 'cfg', only = null) {
  return RULE_FIELDS.filter(([title]) => !only || only.includes(title)).map(([title, note, fields]) => `<fieldset class="sl-rules-group"><legend>${esc(title)} ${helpIcon(GROUP_HELP[title])}</legend>
    <p class="sl-hint">${esc(note)}</p>${fields.map(([key, label, kind, hint]) => {
    const id = `${prefix}-${key}`;
    const help = hint ? `<small class="sl-hint">${esc(hint)}</small>` : '';
    if (kind === 'bool') {
      return `<label class="sl-switch" for="${id}"><input type="checkbox" role="switch" id="${id}" data-cfg="${key}" ${cfg[key] ? 'checked' : ''}>
        <span class="sl-switch-track" aria-hidden="true"></span><span>${esc(label)}${help}</span></label>`;
    }
    if (kind === 'pick') {
      return `<div class="sl-field"><span class="sl-field-label">${esc(label)}</span><div class="sl-seg" role="radiogroup" aria-label="${esc(label)}">${LAB_CHOICES[key]
        .map(([v, t]) => `<label class="sl-seg-item${cfg[key] === v ? ' on' : ''}"><input type="radio" name="${id}" value="${v}" data-cfg="${key}" ${cfg[key] === v ? 'checked' : ''}>${esc(t)}</label>`).join('')}</div>${help}</div>`;
    }
    if (kind === 'price') {
      const basis = /Entry/.test(key) ? cfg.entryBasis : cfg.exitBasis;
      return `<div class="sl-field${basis === 'manual' ? '' : ' sl-dim'}"><label for="${id}" class="sl-field-label">${esc(label)}</label>
        <input type="number" id="${id}" data-cfg="${key}" min="0" step="any" value="${cfg[key] > 0 ? esc(cfg[key]) : ''}" dir="ltr" placeholder="ریال" ${basis === 'manual' ? '' : 'disabled'}>${help}</div>`;
    }
    const [min, max, step] = RANGES[key] || [0, 100, 1];
    return `<div class="sl-field sl-slider"><label for="${id}" class="sl-field-label">${esc(label)} <output for="${id}" data-out="${key}">${showNum(key, cfg[key])}</output></label>
      <input type="range" id="${id}" data-cfg="${key}" min="${min}" max="${max}" step="${step}" value="${esc(cfg[key])}">${help}</div>`;
  }).join('')}</fieldset>`).join('');
}

function readRules(host, base) {
  const out = { ...base };
  for (const el of host.querySelectorAll('[data-cfg]')) {
    const key = el.dataset.cfg;
    if (el.type === 'checkbox') out[key] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[key] = el.value; }
    else if (el.tagName === 'SELECT') out[key] = el.value;
    else if (el.disabled) continue;
    else out[key] = Number(toEn(el.value)) || 0;
  }
  return labConfig(out);
}

/**
 * حجم معامله — مثل بقیهٔ برنامه، «تعداد قرارداد»؛ نه لات، نه اندازهٔ
 * قرارداد (آن از تنظیمات می‌آید). فیلد عددی با دو دکمهٔ کم و زیاد.
 */
function qtyHtml(q) {
  return `<div class="sl-qty" role="group" aria-label="حجم معامله">
    <label class="sl-field-label" for="sl-qty-input">حجم معامله</label>
    <button type="button" class="sl-qty-btn" data-act="qty-step" data-d="-1" aria-label="یکی کمتر">−</button>
    <input id="sl-qty-input" type="number" min="1" max="10000" step="1" value="${q}" data-act="qty-input" dir="ltr" aria-label="تعداد قرارداد">
    <button type="button" class="sl-qty-btn" data-act="qty-step" data-d="1" aria-label="یکی بیشتر">+</button>
    <span class="sl-hint">قرارداد</span>
  </div>`;
}

/** دکمه‌های گزینه‌ای (به‌جای منوی کشویی). */
const seg = (group, value, options) => `<div class="sl-seg" role="radiogroup">${options.map(([v, t]) => `<button type="button" class="sl-seg-item${String(v) === String(value) ? ' on' : ''}" role="radio" aria-checked="${String(v) === String(value)}" data-act="seg" data-group="${group}" data-v="${esc(v)}">${esc(t)}</button>`).join('')}</div>`;

/** سری‌های پیش‌فرضِ خاموشِ هر نمودار. */
const HIDDEN_DEFAULT = {
  channel: [], pnl: [], legs: [], prices: [], premium: ['net'],
  fan: ['exits', 'hold', 'top2', 'top3', 'top4', 'top5'],
};

export async function mount(root, { state } = {}) {
  const settings = () => ({ ...defaults(), ...(state?.settings || {}) });
  let store = readStore();
  let exp = null;          // آزمایش فعال (ماندگار)
  let draft = null;        // پیش‌نویس تنظیم (ماندگار نیست)
  let market = null, ctx = null;
  let universe = null;     // { key, rows, note, build }
  let view = null;         // روزی که کارت روز و پنل تصمیم نشان می‌دهند
  let choice = null;       // گزینهٔ انتخاب‌شده در پنل تصمیم
  let editMode = 'replay';
  let cmpTab = 'paths';
  let cmpOpts = { mode: 'trigger', options: ['algo', 'hold', 'close'], cap: 2000, from: 'entry', policy: 'algo', list: 'best' };
  let wiOpts = { continuation: 'algo', options: ['algo', 'hold', 'close', 'defend'] };
  let entryPolicy = 'algo';
  let overlayIds = new Set();
  let legSel = -1;         // پای انتخاب‌شده در نمودار پرمیوم
  let labTab = 'decide';   // زیرتبِ فعالِ آزمایش
  let chartSel = 'channel'; // نمودارِ فعالِ زیرتبِ نمودارها
  const hidden = Object.fromEntries(Object.entries(HIDDEN_DEFAULT).map(([k, v]) => [k, new Set(v)]));
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
      <h2>🧪 استرانگل بازی</h2>
      <p>یک استرانگل فروش را در تاریخی از گذشته باز کن و روزبه‌روز جلو برو. پایان هر روز، الگوریتم با دادهٔ پایانیِ همان روز
         پیشنهاد می‌دهد — با سود و زیان، نقد و وجه تضمینِ هر گزینه — و تو تصمیم می‌گیری. هر تصمیمی را بعداً می‌توانی عوض کنی،
         همهٔ مسیرهای ممکن را کنار هم ببینی، و در پایان کارنامه بگیری.</p>
    </div>
    <section class="card sl-saved" id="sl-saved"></section>
    <div id="sl-main"></div>
    <div class="sl-tip" role="tooltip" hidden></div>`;
  const savedHost = root.querySelector('#sl-saved');
  const main = root.querySelector('#sl-main');
  const tipBox = root.querySelector('.sl-tip');

  // ═════════════════════════ کمک‌ها ═════════════════════════

  const cfgOf = () => labConfig(exp?.cfg || draft?.cfg || LAB_DEFAULTS);
  const fees = () => (cfgOf().fees ? feesOf(settings()) : { option: 0, exercise: 0 });
  const mparams = () => marginParamsOf(settings());
  const makeCtx = () => {
    const s = settings();
    ctx = market ? pricingContext(market, { r: s.rFree, q: s.divYield, yearDays: s.dayCountYear, modelFill: cfgOf().modelFill, useStale: cfgOf().staleQuotes === 'use' }) : null;
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
  const sig = () => `${JSON.stringify(exp.cfg)}|${exp.entry.call}|${exp.entry.put}`;
  // نام قرارداد هر قیمت اعمال — هر جا قیمت اعمالی نشان داده می‌شود، نامش هم.
  const symOf = (side, K) => market?.strikes.find((x) => x.strike === Number(K))?.[side]?.sym || '';
  const actText = (a) => actionText(a, symOf);
  const leg = (side, K) => legName(side, K, symOf);
  // مبنای درصد سود و زیان: همان «سرمایهٔ درگیر» بقیهٔ برنامه (capitalBase).
  const retBase = () => {
    if (!ctx) return NaN;
    const entry = exp?.entry || draft?.entry;
    return remember(`ret|${JSON.stringify(cfgOf())}|${entry?.call}|${entry?.put}|${settings().capitalMode}`, () => {
      const st = openPosition(ctx, cfgOf(), entry, 0, fees());
      return st.state ? labReturnBase(ctx, cfgOf(), st.state.legs, 0, mparams(), settings().capitalMode || 'NET').value : NaN;
    });
  };
  const pl = (v) => moneyPct(v, retBase());
  const leg_ = (side, K) => legName(side, K, symOf);
  // جای پیمایش: رندر دوباره نباید کاربر را به بالای صفحه پرت کند.
  const stageEl = () => document.getElementById('stage');
  const stageY = () => stageEl()?.scrollTop ?? 0;
  const restoreY = (y) => { const el = stageEl(); if (el && fin(y)) el.scrollTop = y; };

  async function fetchUniverse(from, to) {
    const key = `${from}-${to}`;
    if (universe?.key === key && universe.rows.length) return universe;
    const res = await fetch(`/api/history/universe?from=${from}&to=${to}`, { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok || payload?.error) throw new Error(payload?.error || `پاسخ ${res.status}`);
    universe = { key, rows: Array.isArray(payload.rows) ? payload.rows : [], note: payload.note || '', build: payload.build || null };
    return universe;
  }

  async function loadMarket({ from, to, uaIns, expiry }) {
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
    // اندازهٔ قرارداد از تنظیمات می‌آید؛ کاربر این‌جا با آن کاری ندارد.
    market = buildLabMarket({ rows: universe.rows, dailies, uaIns, expiry, from, to, size: Number(settings().contractSize) || 1000 });
    market.failed = failed;
    makeCtx();
    return market;
  }

  // ═════════════════════════ آزمایش‌های ذخیره‌شده ═════════════════════════

  function renderSaved() {
    const list = store.list;
    savedHost.innerHTML = `<div class="section-head"><div><p class="eyebrow">آزمایش‌های من</p>
        <h3>${list.length ? `${faDigits(String(list.length))} آزمایش ذخیره‌شده` : 'هنوز آزمایشی نساخته‌ای'} ${helpIcon('saved')}</h3></div>
        <button type="button" class="btn" data-act="new">＋ آزمایش تازه</button></div>
      ${list.length ? `<div class="sl-saved-list">${list.map((x) => `<div class="sl-saved-item${exp?.id === x.id ? ' active' : ''}">
          <button type="button" class="sl-saved-open" data-act="open" data-id="${esc(x.id)}">
            <b>${esc(x.name)}</b>
            <small>${esc(x.uaName)}، ${esc(dateFa(x.from))} تا ${esc(dateFa(x.to))}</small>
            <small class="${tone(x.final)}">${x.done ? `نتیجه ${esc(pl(x.final))}${x.grade && x.gradeKey === gradeKeyOf(x) ? ` — نمره ${esc(x.grade)}` : ''}` : `در جریان، ${faDigits(String(Object.keys(x.decisions || {}).length))} تصمیم`}</small>
          </button>
          <button type="button" class="ghost sl-mini" data-act="dup" data-id="${esc(x.id)}" title="رونوشت">⧉</button>
          <button type="button" class="ghost sl-mini" data-act="del" data-id="${esc(x.id)}" title="حذف">✕</button>
        </div>`).join('')}</div>` : '<p class="note">آزمایش‌ها در همین مرورگر می‌مانند: تنظیم، ورود و همهٔ تصمیم‌ها — قیمت‌ها هر بار تازه گرفته می‌شوند.</p>'}`;
  }

  // ═════════════════════════ تنظیم ═════════════════════════

  function newDraft() {
    const today = todayCompact();
    draft = {
      from: daysBefore(today, 75), to: daysBefore(today, 25), uaIns: '', uaName: '', expiry: 0,
      entry: { call: null, put: null }, cfg: { ...LAB_DEFAULTS }, step: 1, reach: 1, search: '', name: '',
    };
    exp = null; market = null; ctx = null; universe = null;
  }

  const STEPS = [[1, 'تاریخ ورود و خروج'], [2, 'نماد و سررسید'], [3, 'حجم، ورود و قیمت'], [4, 'قواعد الگوریتم']];

  /**
   * تنظیم، گام‌به‌گام: هر بار فقط یک گام دیده می‌شود تا صفحه شلوغ نشود.
   * گام‌هایی که رسیده‌ای کلیک‌پذیرند؛ گام بعد فقط وقتی باز می‌شود که دادهٔ
   * لازمش آمده باشد.
   */
  function renderSetup(message = '') {
    const keepY = stageY();
    const d = draft;
    const cfg = labConfig(d.cfg);
    const bases = universe ? labBases(universe.rows) : [];
    const shownBases = d.search ? bases.filter((b) => b.name.includes(d.search.trim())) : bases;
    const expiries = d.uaIns && universe ? labExpiries(universe.rows, d.uaIns) : [];
    const suggested = d.from ? pickExpiry(expiries, d.from, cfg) : null;
    const stepper = `<nav class="sl-stepper" aria-label="گام‌های تنظیم">${helpIcon('stepper')}${STEPS.map(([n, t]) => `<button type="button" class="sl-stepbtn${d.step === n ? ' on' : ''}${n < d.step ? ' done' : ''}" data-act="goto-step" data-n="${n}" ${n <= d.reach ? '' : 'disabled'}>
      <span class="sl-stepnum">${faDigits(String(n))}</span>${esc(t)}</button>`).join('<span class="sl-stepline" aria-hidden="true"></span>')}</nav>`;

    let body = '';
    if (d.step === 1) {
      const span = daysBetween(d.from, d.to);
      body = `<section class="card sl-step current">
        <div class="section-head"><div><p class="eyebrow">گام ۱</p><h3>تاریخ ورود و خروج ${helpIcon('range')}</h3></div>
          <div class="sl-span"><span>ورود</span><b>${esc(dateFa(d.from))}</b><span>خروج</span><b>${esc(dateFa(d.to))}</b>
          <span class="sl-chip ${span > 0 ? '' : 'loss'}">${span > 0 ? `${faDigits(String(span))} روز` : 'خروج باید بعد از ورود باشد'}</span></div></div>
        <div class="sl-cals">
          <div><span class="field-label">تاریخ ورود</span><div id="sl-cal-from"></div></div>
          <div><span class="field-label">تاریخ خروج</span><div id="sl-cal-to"></div></div>
        </div>
        <div class="bar"><span class="sp"></span><button type="button" class="btn" data-act="load-universe" ${span > 0 ? '' : 'disabled'}>دریافت قراردادهای این بازه ←</button></div>
      </section>`;
    } else if (d.step === 2) {
      body = `<section class="card sl-step current">
        <div class="section-head"><div><p class="eyebrow">گام ۲</p><h3>نماد پایه و سررسید ${helpIcon('base')}</h3></div></div>
        ${universe ? `<p class="note">${faDigits(String(universe.rows.length))} جفت قرارداد در بازه، ${faDigits(String(bases.length))} پایه${universe.note ? ` — ${esc(universe.note)}` : ''}</p>
          ${universe.build ? `<p class="note">${buildLine(universe.build)}</p>` : ''}` : ''}
        ${bases.length ? `<div class="bar">
          <div class="field"><label for="sl-search">جست‌وجوی پایه</label><input id="sl-search" type="search" value="${esc(d.search)}" placeholder="نام نماد…"></div>
          <div class="field sl-grow"><label for="sl-base">نماد پایه</label><select id="sl-base"><option value="">— انتخاب کن —</option>${shownBases
            .map((b) => `<option value="${esc(b.ins)}"${b.ins === d.uaIns ? ' selected' : ''}>${esc(b.name)}، ${faDigits(String(b.contracts))} قرارداد</option>`).join('')}</select></div>
        </div>` : '<p class="note warn">در این بازه هیچ قراردادی در دفتر نیست. اگر دفتر در حال ساخت است، کمی بعد دوباره «دریافت» بزن.</p>'}
        ${expiries.length ? `<h4 class="sl-sub">سررسید ${helpIcon('expiry')}</h4><div class="sl-expiries">${expiries.map((e) => {
          const dte = daysBetween(d.from, e.expiry);
          const isSug = suggested?.expiry === e.expiry;
          return `<button type="button" class="sl-exp${Number(d.expiry) === e.expiry ? ' picked' : ''}${isSug ? ' suggested' : ''}" data-act="pick-expiry" data-expiry="${e.expiry}" ${dte > 0 ? '' : 'disabled'}>
            <b>${esc(dateFa(e.expiry))}</b><small>${dte > 0 ? `${faDigits(String(dte))} روز تا سررسید` : 'پیش از ورود سررسید شده'}</small>
            <small>${faDigits(String(e.strikes))} قیمت اعمال${isSug ? (suggested.inRange ? '، پیشنهاد الگوریتم' : '، نزدیک‌ترین به ۴۵ تا ۵۰ روز') : ''}</small></button>`;
        }).join('')}</div>` : ''}
        <div class="bar"><button type="button" class="ghost" data-act="goto-step" data-n="1">→ گام قبل</button><span class="sp"></span>
          <button type="button" class="btn" data-act="load-market" ${d.expiry ? '' : 'disabled'}>دریافت قیمت‌های روزانه ←</button></div>
      </section>`;
    } else if (d.step === 3) {
      let entryHtml = '<p class="note">قیمت‌ها هنوز نیامده‌اند.</p>';
      const day0 = market?.days[0];
      if (market && ctx && !day0) entryHtml = '<p class="note warn">در این بازه پایه هیچ روزِ معامله‌ای ندارد.</p>';
      else if (market && ctx) {
        const board = strikeBoard(ctx, 0);
        const auto = pickEntry(ctx, cfg, 0);
        if (d.entry.call == null && d.entry.put == null) d.entry = { call: auto.call, put: auto.put };
        const st = openPosition(ctx, cfg, d.entry, 0, fees());
        const margin = st.state ? labMargin(ctx, cfg, st.state.legs, 0, mparams()) : NaN;
        const capital = margin * cfg.capitalMult;
        const cell = (row, side) => {
          const c = row[side];
          if (!c) return '<td class="sl-board-na">—</td>';
          const picked = Number(d.entry[side]) === row.strike;
          const can = fin(c.price) && c.price > 0;
          const inBand = fin(c.delta) && Math.abs(c.delta) >= cfg.deltaLo && Math.abs(c.delta) <= cfg.deltaHi;
          const raw = day0.raw?.[side]?.[row.strike] || {};
          return `<td class="sl-board-cell ${side}${picked ? ' picked' : ''}${inBand ? ' band' : ''}">
            <button type="button" data-act="pick-strike" data-side="${side}" data-strike="${row.strike}" ${can ? '' : 'disabled'}
              data-tip="${esc(`${c.sym}\nپایانی ${price(c.price)}، آخرین ${price(raw.last)}\nاولین ${price(raw.first)}، کمترین ${price(raw.low)}، بیشترین ${price(raw.high)}\nدلتا ${fin(c.delta) ? faDigits(c.delta.toFixed(3)) : '—'}، تلاطم ضمنی ${fin(c.iv) ? pct(c.iv * 100) : '—'}`)}">
              <b>${price(c.price)}</b>${srcBadge(c.src)}<small class="sl-sym">${fmt.sym(c.sym)}</small><small>Δ ${fin(c.delta) ? faDigits(c.delta.toFixed(2)) : '—'}، IV ${fin(c.iv) ? pct(c.iv * 100, 0) : '—'}</small>
            </button></td>`;
        };
        entryHtml = `
          <div class="sl-entry-head">${helpIcon('entry-head')}
            <div><p class="eyebrow">روز ورود</p><b>${esc(dateFa(day0.date))} ${esc(dayNameFa(day0.date))}</b>
              ${day0.date !== d.from ? '<small class="note">روز انتخابی معاملاتی نبود؛ اولین روزِ معامله‌شده.</small>' : ''}</div>
            <div><p class="eyebrow">قیمت پایه</p><b>${fmt.int(day0.S)}</b></div>
            <div><p class="eyebrow">روز تا سررسید</p><b>${faDigits(String(day0.dte))}</b></div>
            <div><p class="eyebrow">روزهای آزمایش</p><b>${faDigits(String(market.days.length))}</b>
              <small class="note">پایان مؤثر ${esc(dateFa(market.days.at(-1).date))}${market.days.at(-1).dte <= 0 ? ' (سررسید)' : normalizeHistoryDate(d.to) > market.days.at(-1).date ? ' (آخرین روز معاملاتی بازه)' : ''}</small></div>
            <div><p class="eyebrow">پوشش قیمت</p><b>${pct(market.coverage.pct, 0)}</b>
              <small class="note" title="ردیفی که قیمت دارد ولی حجم معامله‌اش صفر است در پوشش معامله شمرده نمی‌شود">معاملهٔ واقعی؛ ردیف ${pct(market.coverage.recordPct, 0)}</small></div>
            ${qtyHtml(cfg.qty)} ${helpIcon('volume')}
          </div>
          ${market.failed ? `<p class="note warn">تاریخچهٔ ${faDigits(String(market.failed))} ابزار دریافت نشد؛ دوباره «دریافت قیمت‌ها» را بزن.</p>` : ''}
          <div class="sl-setup-split">
            <div>
              <div class="bar sl-entry-tools">
                ${seg('entry-method', cfg.entryMethod, LAB_CHOICES.entryMethod)}
                <button type="button" class="ghost" data-act="auto-entry">✨ انتخاب خودکار</button> ${helpIcon('entryBoard')}
              </div>
              ${auto.note ? `<p class="note">${esc(auto.note)}</p>` : ''}
              <div class="history-table-wrap sl-board-wrap"><table class="sl-board">
                <thead><tr><th>کال (پایانی، دلتا، IV)</th><th>قیمت اعمال</th><th>فاصله از پایه</th><th>پوت (پایانی، دلتا، IV)</th></tr></thead>
                <tbody>${board.map((row) => `<tr class="${Math.abs(row.otmPct) < 2.5 ? 'atm' : ''}">${cell(row, 'call')}<th scope="row">${strikeFa(row.strike)}</th>
                  <td class="${tone(row.otmPct)}">${pct(row.otmPct)}</td>${cell(row, 'put')}</tr>`).join('')}</tbody>
              </table></div>
            </div>
            <div class="sl-setup-side">
              <div class="sl-rules-grid one" id="sl-rules">${rulesFormHtml(cfg, 'cfg', ['قیمت ورود و خروج'])}</div>
              ${st.error ? `<p class="note warn" role="alert">${esc(st.error)}</p>` : ''}
              ${st.error ? '' : liquidityNotes(ctx, cfg, st.state.legs, 0).map((x) => `<p class="note warn">حجم ${fmt.int(x.qty)} قرارداد ${esc(leg(x.side, x.strike))} از کل حجم معاملهٔ همان روز (${fmt.int(x.vol)} قرارداد) بیشتر است؛ نتیجه فرض می‌کند کل حجم به همین قیمت اجرا شده — نتیجهٔ نظری، نه قابل اجرا.</p>`).join('')}
              <div class="sl-entry-sum">
                ${st.error ? ['کال فروش', 'پوت فروش', 'پرمیوم دریافتی', 'وجه تضمین', 'سرمایهٔ لازم'].map((t) => `<div class="kpi"><span>${t}</span><b>—</b><small>&nbsp;</small></div>`).join('') : `
                  <div class="kpi"><span>کال فروش ${helpIcon('kpi-entry-legs')}</span><b>${strikeFa(d.entry.call)}</b><small>${fmt.sym(symOf('call', d.entry.call))}، ${price(st.state.legs.call.open)} ${srcBadge(st.state.legs.call.src)}</small></div>
                  <div class="kpi"><span>پوت فروش ${helpIcon('kpi-entry-legs')}</span><b>${strikeFa(d.entry.put)}</b><small>${fmt.sym(symOf('put', d.entry.put))}، ${price(st.state.legs.put.open)} ${srcBadge(st.state.legs.put.src)}</small></div>
                  <div class="kpi"><span>پرمیوم دریافتی ${helpIcon('kpi-entry-credit')}</span><b class="gain">${esc(money(st.state.initialCredit))}</b><small>${faDigits(String(cfg.qty))} قرارداد از هر سمت</small></div>
                  <div class="kpi"><span>وجه تضمین ${helpIcon('kpi-entry-margin')}</span><b>${esc(money(margin))}</b></div>
                  <div class="kpi"><span>سرمایهٔ لازم (×${faDigits(String(cfg.capitalMult))}) ${helpIcon('kpi-entry-capital')}</span><b>${esc(money(capital))}</b></div>`}
              </div>
            </div>
          </div>`;
      }
      body = `<section class="card sl-step current">
        <div class="section-head"><div><p class="eyebrow">گام ۳</p><h3>حجم، ورود و قیمت معامله ${helpIcon('entryBoard')}</h3></div></div>
        ${entryHtml}
        <div class="bar"><button type="button" class="ghost" data-act="goto-step" data-n="2">→ گام قبل</button><span class="sp"></span>
          <button type="button" class="ghost" data-act="goto-step" data-n="4">قواعد الگوریتم ←</button>
          <button type="button" class="btn sl-go" data-act="start" ${market?.days?.length ? '' : 'disabled'}>🚀 شروع آزمایش</button></div>
      </section>`;
    } else {
      body = `<section class="card sl-step current">
        <div class="section-head"><div><p class="eyebrow">گام ۴</p><h3>قواعد الگوریتم ${helpIcon('rules')}</h3></div>
          <button type="button" class="ghost" data-act="rules-reset">بازگشت به پیش‌فرض متن الگوریتم</button></div>
        <div class="sl-rules-grid" id="sl-rules">${rulesFormHtml(cfg, 'cfg', RULE_FIELDS.map(([t]) => t).filter((t) => t !== 'قیمت ورود و خروج'))}</div>
        <div class="bar sl-start">
          <button type="button" class="ghost" data-act="goto-step" data-n="3">→ گام قبل</button>
          <div class="field sl-grow"><label for="sl-name">نام آزمایش</label><input id="sl-name" type="text" value="${esc(d.name || `${d.uaName} ${dateFa(market?.days[0]?.date || d.from)}`)}"></div>
          <button type="button" class="btn sl-go" data-act="start" ${market?.days?.length ? '' : 'disabled'}>🚀 شروع آزمایش</button>
        </div>
      </section>`;
    }

    main.innerHTML = `<div class="sl-setup">${stepper}${body}
      ${message ? `<p class="note warn sl-msg" role="alert">${esc(message)}</p>` : ''}
      <p class="note sl-busy-line" aria-live="polite">${esc(busy)}</p></div>`;

    if (d.step === 1) {
      // تقویم مشترک برنامه؛ همهٔ روزهای تقویمی تا امروز انتخاب‌پذیرند و
      // روزِ تعطیل در گام بعد به اولین روز کاری می‌رسد.
      const today = todayCompact();
      const days = calendarDays(daysBefore(today, 1100), today);
      mountDateWheel(main.querySelector('#sl-cal-from'), days, d.from, (v) => { d.from = v; if (d.to <= v) d.to = Math.min(today, addDays(v, 50)); d.reach = 1; universe = null; renderSetup(); });
      mountDateWheel(main.querySelector('#sl-cal-to'), days, d.to, (v) => { d.to = v; d.reach = 1; universe = null; renderSetup(); });
    }
    restoreY(keepY);
  }

  // ═════════════════════════ اجرای مسیر ═════════════════════════

  const decider = () => planDecider(exp.decisions, 'hold');

  function currentRun() {
    return remember(`run|${JSON.stringify(exp.decisions)}|${exp.cursor}|${sig()}`,
      () => runPath(ctx, cfgOf(), exp.entry, { decide: decider(), upTo: exp.cursor, fees: fees() }));
  }

  /** «مسیر من» برای مقایسه: تصمیم‌های ثبت‌شده و برای بقیهٔ روزها یک سیاست. */
  function myFullRun(policy = 'algo') {
    return remember(`full|${policy}|${JSON.stringify(exp.decisions)}|${exp.cursor}|${sig()}`, () => {
      const own = planDecider(exp.decisions, 'hold');
      const rest = POLICIES[policy]?.decide || POLICIES.hold.decide;
      return runPath(ctx, cfgOf(), exp.entry, { decide: (i, ev, st) => (i < exp.cursor ? own(i, ev, st) : rest(ev)), fees: fees() });
    });
  }

  function policyRun(policy, cfg = cfgOf(), entry = exp.entry) {
    return remember(`pol|${policy}|${JSON.stringify(cfg)}|${entry.call}|${entry.put}`,
      () => runPath(ctx, cfg, entry, { decide: planDecider({}, policy), fees: fees() }));
  }

  function planRun(decisions, fallback = 'hold') {
    return remember(`plan|${fallback}|${JSON.stringify(decisions)}|${sig()}`,
      () => runPath(ctx, cfgOf(), exp.entry, { decide: planDecider(decisions, fallback), fees: fees() }));
  }

  function capitalOf() {
    return remember(`cap|${sig()}`, () => {
      const cfg = cfgOf();
      const st = openPosition(ctx, cfg, exp.entry, 0, fees());
      const margin = st.state ? labMargin(ctx, cfg, st.state.legs, 0, mparams()) : NaN;
      return { margin, capital: margin * cfg.capitalMult };
    });
  }

  /** وضعیتِ آغاز روز `v` و ارزیابیِ آن روز، از اجرای جاری. */
  function dayContext(run, v) {
    if (run.pending && run.pending.i === v) return { st: run.pending.state, ev: run.pending.ev, pending: true };
    const k = run.steps.findIndex((s) => s.i === v);
    if (k <= 0) return null;
    return { st: run.steps[k - 1].state, ev: run.steps[k].ev, step: run.steps[k], pending: false };
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
          `بستن ${leg(ev.winning, st.legs[ev.winning].strike)} که در سود است و فروش ${leg(ev.winning, cand.strike)} با پرمیوم ${price(cand.price)} (هدف ${price(cand.target)}، برابر پرمیوم ${leg(ev.losing, st.legs[ev.losing].strike)}${fin(cand.gapPct) ? `؛ اختلاف ${pct(cand.gapPct)}` : ''}).`);
      }
    }
    const def = ev.losing ? defendAction(ctx, st, v, ev) : null;
    push('defend', 'رول دفاعی سمت زیان‌ده', def, def ? `بستن ${leg(def.side, st.legs[def.side].strike)} که در زیان است و فروش یک قیمت اعمال دورتر از بازار: ${leg(def.side, def.strike)}.` : '');
    const seen = new Set();
    return list.filter((o) => {
      if (o.id !== 'algo' && seen.has(o.key)) return false;
      seen.add(o.key);
      return true;
    }).map((o) => ({ ...o, dup: list.find((x) => x.id === 'algo')?.key === o.key && o.id !== 'algo' }));
  }

  const impactOf = (st, v, ev, action) => remember(`imp|${v}|${actionKey(action)}|${JSON.stringify(exp.decisions)}|${exp.cursor}|${sig()}`,
    () => actionImpact(ctx, cfgOf(), st, v, ev, action, fees(), mparams()));

  function futureOf(v, action, policy = 'algo') {
    return remember(`fut|${v}|${actionKey(action)}|${policy}|${JSON.stringify(exp.decisions)}|${sig()}`, () => {
      const own = planDecider(exp.decisions, 'hold');
      const rest = POLICIES[policy].decide;
      return runPath(ctx, cfgOf(), exp.entry, { decide: (i, e, st) => (i < v ? own(i, e, st) : i === v ? action : rest(e)), fees: fees() }).final;
    });
  }

  // ═════════════════════════ کارت معامله ═════════════════════════

  function legLine(side, leg, mark, dayIdx = null) {
    if (!leg) return `<div class="sl-leg ${side} closed"><span class="sl-leg-side">${SIDE_FA[side]}</span><b>بسته</b></div>`;
    const sym = market.strikes.find((s) => s.strike === leg.strike)?.[side]?.sym || '';
    const move = mark ? mark.price - leg.open : NaN;
    return `<div class="sl-leg ${side}">
      <span class="sl-leg-side">${SIDE_FA[side]} فروش</span>
      <b class="sl-leg-k">${strikeFa(leg.strike)}</b>
      <span class="sl-leg-sym">${fmt.sym(sym)}</span>
      <span>ورود ${price(leg.open)} ${srcBadge(leg.src)}</span>
      <span>امروز ${mark ? `${price(mark.price)} ${srcBadge(mark.src)}` : '<i class="warn">نداشته</i>'}</span>
      <span class="${tone(-move)}">از فروش: ${fin(move) ? `${move > 0 ? '▲' : move < 0 ? '▼' : ''} ${price(Math.abs(move))} (${pct((move / leg.open) * 100)})` : '—'}</span>
      ${dayIdx != null ? twoPrices(market.days[dayIdx]?.raw?.[side]?.[leg.strike], market.days[dayIdx - 1]?.raw?.[side]?.[leg.strike], { flip: true }) : ''}
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
    const at = done ? Math.max(0, run.state.closedAt) : ev.i ?? 0;
    const day0 = market.days[0], dayNow = market.days[Math.min(at, market.days.length - 1)];
    const sides = done ? { call: { cum: run.sides.call[at] }, put: { cum: run.sides.put[at] } } : run.pending?.sides || lastStep.sides;
    const todayMargin = !done && st && !st.closed ? labMargin(ctx, cfg, st.legs, ev.i, mparams()) : NaN;
    const status = done ? (st.reason === 'incomplete' ? ['warn', 'نتیجه نامعلوم'] : ['shut', `بسته — ${reasonText(st.reason)}`])
      : ev.straddle ? ['warn', 'استرادل'] : st.adjustments ? ['open', `تعدیل‌شده ×${faDigits(String(st.adjustments))}`] : ['open', 'باز'];
    const varHit = fin(stats.minPct) && -stats.minPct > cfg.varLimitPct;
    return `<section class="card sl-hero">
      <div class="sl-hero-top">
        <div class="sl-hero-title">
          <p class="eyebrow">استرانگل فروش — ${faDigits(String(cfg.qty))} قرارداد از هر سمت</p>
          <h3>${esc(market.uaName)} <small>سررسید ${esc(dateFa(market.expiry))}</small> ${helpIcon('status')}</h3>
          <span class="pill ${status[0]}">${esc(status[1])}</span>
        </div>
        <div class="sl-hero-split">${helpIcon('kpi-sides')}
          <div class="${tone(sides?.call?.cum)}" title="دقیق: ${esc(exactRial(sides?.call?.cum, { sign: true }))}"><span>اثر انباشتهٔ کال</span><b>${esc(pl(sides?.call?.cum))}</b></div>
          <div class="${tone(sides?.put?.cum)}" title="دقیق: ${esc(exactRial(sides?.put?.cum, { sign: true }))}"><span>اثر انباشتهٔ پوت</span><b>${esc(pl(sides?.put?.cum))}</b></div>
          <small class="sl-hint">جمع دقیق دو اثر = سود و زیان کل؛ جمع دو عدد گردشده گاهی یک ریال فرق دارد (عدد دقیق روی هر کدام).</small>
        </div>
        <div class="sl-hero-pnl ${tone(pnl)}" title="دقیق: ${esc(exactRial(pnl, { sign: true }))}${done ? '' : ' — کارمزد بازخرید احتمالی آینده هنوز کسر نشده'}">
          <span>${done ? 'سود و زیان نهایی' : `سود و زیان پایان ${esc(shortDateFa(dayNow.date))}`}</span>
          <b>${esc(pl(pnl))}</b>
          <small>${pct(capital > 0 && fin(pnl) ? (pnl / capital) * 100 : NaN, 2)} سرمایه، ${pct(initial > 0 && fin(pnl) ? (pnl / initial) * 100 : NaN, 0)} پرمیوم اولیه</small>
        </div>
      </div>
      <div class="sl-legs">${helpIcon('legs')}
        <div class="sl-leg base"><span class="sl-leg-side">سهم پایه</span><b class="sl-leg-k">${fmt.int(dayNow.S)}</b><span class="sl-leg-sym">${esc(market.uaName)}</span>
          ${twoPrices(dayNow.uaRaw, market.days[at - 1]?.uaRaw)}</div>
        ${SIDES.map((side) => legLine(side, done ? null : st.legs[side], done ? null : ev.marks?.[side], at)).join('')}</div>
      <div class="sl-gauge-wrap">${helpIcon('gauge')}${gaugeHtml({ pnl, tp, sl, trigger: done ? NaN : (cfg.trigLo / 100) * ev.maxProfit - (cfg.trigBasis === 'sinceEntry' ? st.initialRef : st.refPnl) })}</div>
      <div class="sl-kpis">
        <div class="kpi"><span>پرمیوم اولیه ${helpIcon('kpi-premium')}</span><b>${esc(money(initial))}</b></div>
        <div class="kpi"><span>سود هدف جاری ${helpIcon('kpi-target')}</span><b>${esc(money(done ? NaN : ev.maxProfit))}</b><small>اگر همهٔ پاهای باز بی‌ارزش شوند</small></div>
        <div class="kpi"><span>زیان شناور ${helpIcon('kpi-float')}</span><b class="${ev.zone === 'calm' ? '' : 'loss'}">${pct(done ? NaN : ev.floatPct)}</b><small>آستانه ${faDigits(String(cfg.trigLo))} تا ${faDigits(String(cfg.trigHi))}٪</small></div>
        <div class="kpi"><span>سرمایه (×${faDigits(String(cfg.capitalMult))} وجه تضمین) ${helpIcon('kpi-capital')}</span><b>${esc(money(capital))}</b><small>وجه تضمین ورود ${esc(money(margin))}</small></div>
        <div class="kpi"><span>وجه تضمین امروز ${helpIcon('kpi-margin')}</span><b>${esc(money(todayMargin))}</b><small>${pct(capital > 0 ? (todayMargin / capital) * 100 : NaN, 0)} سرمایه</small></div>
        <div class="kpi"><span>بدترین افت مسیر ${helpIcon('kpi-dd')}</span><b class="${varHit ? 'loss' : ''}">${pct(stats.minPct, 2)}</b><small>سقف ۱.۲: ${faDigits(String(cfg.varLimitPct))}٪ سرمایه${varHit ? ' — رد شد' : ''}</small></div>
        <div class="kpi"><span>پایه ${helpIcon('kpi-base')}</span><b>${fmt.int(dayNow.S)}</b><small class="${tone(dayNow.S - day0.S)}">${pct(((dayNow.S - day0.S) / day0.S) * 100)} از ورود</small></div>
        <div class="kpi"><span>روزها ${helpIcon('kpi-days')}</span><b>${faDigits(String(at))} از ${faDigits(String(market.days.length - 1))}</b><small>${faDigits(String(dayNow.dte))} روز تا سررسید</small></div>
      </div>
    </section>`;
  }

  // ═════════════════════════ کارت کامل یک روز ═════════════════════════

  /** اطلاعات یک روز: پاهای همان روز، تغییرها و اثر هر پا. */
  function dayInfo(run, v) {
    const k = run.steps.findIndex((s) => s.i === v);
    const step = k >= 0 ? run.steps[k] : null;
    const pending = run.pending?.i === v ? run.pending : null;
    if (!step && !pending) return null;
    const day = market.days[v], prev = v > 0 ? market.days[v - 1] : null;
    const before = v === 0 ? step.state : (pending ? pending.state : run.steps[k - 1].state);
    const ev = pending ? pending.ev : step.ev;
    const after = pending ? null : step.state;
    const sideNow = pending ? pending.sides : step.sides;
    const prevSides = v > 0 ? (run.steps.find((s) => s.i === v - 1)?.sides || null) : null;
    const M = market.size * cfgOf().qty;
    const legs = SIDES.map((side) => {
      const leg = before.legs?.[side];
      if (!leg || before.closed) return { side, leg: null };
      const close = day[side]?.[leg.strike];
      const prevClose = prev?.[side]?.[leg.strike];
      const mark = ev.marks?.[side] || (v === 0 ? { price: leg.open, src: leg.src } : null);
      const chg = fin(close) && fin(prevClose) ? close - prevClose : NaN;
      return {
        side, leg, mark, close, prevClose, chg, chgPct: fin(chg) ? (chg / prevClose) * 100 : NaN,
        sellerEffect: fin(chg) ? -chg * M : NaN,
        cum: sideNow?.[side]?.cum, today: fin(sideNow?.[side]?.cum) && fin(prevSides?.[side]?.cum) ? sideNow[side].cum - prevSides[side].cum : NaN,
        iv: ivAt(ctx, v, side, leg.strike), delta: deltaAt(ctx, v, side, leg.strike),
        sym: market.strikes.find((s) => s.strike === leg.strike)?.[side]?.sym || '',
      };
    });
    const pnl = pending ? ev.pnl : step.pnl;
    const prevPnl = v > 0 ? run.series[v - 1] : NaN;
    return {
      v, day, prev, step, pending, ev, before, after, legs, pnl,
      pnlChange: fin(pnl) && fin(prevPnl) ? pnl - prevPnl : NaN,
      sChg: prev ? day.S - prev.S : NaN, sChgPct: prev ? ((day.S - prev.S) / prev.S) * 100 : NaN,
      sFromEntry: ((day.S - market.days[0].S) / market.days[0].S) * 100,
      margin: !after || after.closed ? (pending && !before.closed ? labMargin(ctx, cfgOf(), before.legs, v, mparams()) : after?.closed ? 0 : NaN) : labMargin(ctx, cfgOf(), after.legs, v, mparams()),
      cash: step && k > 0 ? (step.state.received - run.steps[k - 1].state.received) - (step.state.paid - run.steps[k - 1].state.paid) : NaN,
    };
  }

  /**
   * دو قیمت روز — پایانی و آخرین معامله — هر کدام با تغییرش نسبت به
   * **پایانی روز قبل**، به ریال و درصد (`dayQuote`؛ مبنای همهٔ برنامه، خواستهٔ
   * صاحب پروژه ۱۴۰۵/۰۷/۱۳). پیش از این «آخرین» با آخرینِ دیروز سنجیده می‌شد.
   * مبنا `yday` همان ردیف است و اگر نیامده پایانی روز معاملاتی قبل. `flip`
   * برای پای فروخته‌شده: بالا رفتنِ قیمتش برای فروشنده زیان است.
   */
  function twoPrices(now = {}, prev = {}, { flip = false } = {}) {
    const q = dayQuote(now || {}, { prevClose: prev?.close });
    const row = (label, a, d, p) => {
      const t = tone(flip ? -d : d);
      return `<div class="sl-2p"><span>${label}</span><b>${price(a)}</b>${fin(d)
        ? `<span class="${t}">${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${price(Math.abs(d))} <small>(${pct(p, 2)})</small></span>` : '<span class="flat">—</span>'}</div>`;
    };
    return `<div class="sl-2ps">${row('پایانی', q.close, q.closeChange, q.closePct)}${row('آخرین', q.last, q.lastChange, q.lastPct)}</div>`;
  }

  function dayDetailHtml(run, v) {
    const info = v != null ? dayInfo(run, v) : null;
    if (!info) return '<p class="note sl-day-empty">روی هر دایرهٔ خط زمان بزن تا کارت کامل همان روز این‌جا باز شود.</p>';
    const { day, ev, legs } = info;
    const chg = (amount, p, { flip = false } = {}) => (fin(amount)
      ? `<span class="${tone(flip ? -amount : amount)}">${amount > 0 ? '▲' : amount < 0 ? '▼' : '■'} ${price(Math.abs(amount))} <small>(${pct(p, 2)})</small></span>` : '<span class="flat">—</span>');
    const actionLine = info.pending ? 'در انتظار تصمیم' : info.v === 0 ? 'ورود به معامله' : actText(info.step.action);
    return `<div class="sl-day ${info.pending ? 'pending' : ''}">
      <div class="sl-day-head">
        <div><p class="eyebrow">کارت روز ${helpIcon('daycard')}</p><h4>${esc(dateFa(day.date))} <small>${esc(dayNameFa(day.date))}، ${faDigits(String(day.dte))} روز تا سررسید</small></h4></div>
        <div class="sl-day-total ${tone(info.pnl)}"><span>سود و زیان انباشته</span><b>${esc(pl(info.pnl))}</b>
          <small>امروز <b class="${tone(info.pnlChange)}">${esc(pl(info.pnlChange))}</b></small></div>
      </div>
      <div class="sl-day-grid">
        <div class="sl-day-cell base"><span class="sl-day-cap">سهم پایه ${esc(market.uaName)}</span><b>${fmt.int(day.S)}</b>
          ${twoPrices(day.uaRaw, info.prev?.uaRaw)}${helpIcon('two-prices')}
          <div>از روز ورود <span class="${tone(info.sFromEntry)}">${pct(info.sFromEntry, 2)}</span></div></div>
        ${legs.map((l) => (l.leg ? `<div class="sl-day-cell ${l.side}">
          <span class="sl-day-cap">${esc(leg(l.side, l.leg.strike))}</span>
          <b>${l.mark ? price(l.mark.price) : '<i class="warn">نداشته</i>'} ${srcBadge(l.mark?.src)}</b>
          ${twoPrices(day.raw?.[l.side]?.[l.leg.strike], info.prev?.raw?.[l.side]?.[l.leg.strike], { flip: true })}
          <div>اثر امروز برای فروشنده <b class="${tone(l.today)}">${esc(pl(l.today))}</b></div>
          <div>اثر انباشته از روز اول <b class="${tone(l.cum)}">${esc(pl(l.cum))}</b></div>
          <div class="sl-day-greeks">قیمت فروش ${price(l.leg.open)}، دلتا ${fin(l.delta) ? faDigits(l.delta.toFixed(2)) : '—'}، IV ${fin(l.iv) ? pct(l.iv * 100, 0) : '—'}</div>
        </div>` : `<div class="sl-day-cell ${l.side} closed"><span class="sl-day-cap">${SIDE_FA[l.side]}</span><b>بسته</b></div>`)).join('')}
        <div class="sl-day-cell act"><span class="sl-day-cap">اقدام این روز ${helpIcon('day-act')}</span><b>${esc(actionLine)}</b>
          <div>الگوریتم: ${esc(ev.rec?.text || (info.v === 0 ? 'ورود' : '—'))}</div>
          <div>زیان شناور <b>${pct(ev.floatPct)}</b> ${ev.zone && info.v > 0 ? `<span class="sl-zone ${ev.zone}">${esc({ calm: 'آرام', band: 'در محدودهٔ تعدیل', beyond: 'فراتر از محدوده' }[ev.zone])}</span>` : ''}</div>
          ${fin(info.cash) && info.cash !== 0 ? `<div>نقد این روز <b class="${tone(info.cash)}">${esc(money(info.cash, { sign: true }))}</b></div>` : ''}
          <div>وجه تضمین پایان روز <b>${esc(money(info.margin))}</b></div>
        </div>
      </div>
      <p class="sl-hint">«اثر برای فروشنده» وارونهٔ تغییر قیمت است: وقتی قیمت پایی که فروخته‌ای پایین می‌آید، به سود توست. اثر انباشته = سود قطعی‌شدهٔ همهٔ پاهای همان سمت + سود و زیان شناور پای باز − کارمزدهای همان سمت؛ جمع دو سمت همان سود و زیان کل است.</p>
      ${info.v > 0 ? `<div class="bar"><button type="button" class="ghost sl-mini" data-act="goto-decide">${info.pending ? 'تصمیم این روز ↓' : 'تغییر تصمیم این روز ↓'}</button></div>` : ''}
    </div>`;
  }

  // ═════════════════════════ پنل تصمیم ═════════════════════════

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

  /** چهار عددِ هر پیشنهاد: سود و زیان، قطعی‌شده، نقد، وجه تضمین. */
  function impactRows(imp, action) {
    if (!imp || imp.error) return `<span class="sl-opt-err">${esc(imp?.error || '')}</span>`;
    const need = imp.netNeed;
    return `<dl class="sl-impact">
      <div><dt>${imp.closed ? 'سود و زیان نهایی' : 'سود و زیان پس از اقدام'}</dt><dd class="${tone(imp.pnlAfter)}">${esc(pl(imp.pnlAfter))}</dd></div>
      ${action.kind === 'hold' ? '' : `<div><dt>قطعی‌شده با این اقدام</dt><dd class="${tone(imp.realizedNow)}">${esc(pl(imp.realizedNow))}</dd></div>`}
      <div><dt>نقد امروز (پس از کارمزد)</dt><dd class="${tone(imp.netCash)}">${action.kind === 'hold' ? 'صفر' : esc(money(imp.netCash, { sign: true }))}</dd></div>
      ${action.kind === 'hold' ? '' : `<div class="sl-cash-split"><dt>تجزیهٔ نقد</dt><dd>ناخالص ${esc(exactRial(imp.cash, { sign: true }))} − کارمزد ${esc(exactRial(imp.fee))} = خالص ${esc(exactRial(imp.netCash, { sign: true }))}</dd></div>`}
      <div><dt>وجه تضمین</dt><dd>${esc(money(imp.marginBefore))} ← ${esc(money(imp.marginAfter))}</dd></div>
      <div class="sl-need ${need > 1 ? 'loss' : need < -1 ? 'gain' : ''}"><dt>${need > 1 ? 'نیاز به وجه تازه' : need < -1 ? 'وجه آزادشده' : 'وجه لازم'}</dt><dd>${Math.abs(need) <= 1 ? 'بی‌تغییر' : esc(money(Math.abs(need)))}</dd></div>
      ${imp.closed || action.kind === 'hold' ? '' : `<div><dt>سود هدف بعدی</dt><dd>${esc(money(imp.maxProfit))}</dd></div>`}
    </dl>`;
  }

  function decisionHtml(run) {
    if (run.done && (view == null || view >= market.days.length - 1 || !run.steps.some((s) => s.i === view && s.i > 0))) {
      const st = run.state;
      return `<section class="card sl-decide done" id="sl-decide">
        <div class="section-head"><div><p class="eyebrow">پایان آزمایش ${helpIcon('done')}</p><h3>${esc(reasonText(st.reason))} — ${esc(pl(run.final))}</h3></div></div>
        <p class="note">${st.reason === 'incomplete' ? 'قیمت پایانی روز آخر برای یکی از پاها نبود؛ سود نهایی ساخته نمی‌شود. «قیمت مدل» یا «آخرین روزِ قیمت‌دار» را در قواعد روشن کن، یا تاریخ خروج را عوض کن.'
          : st.reason === 'exitEarly' ? `روز خروج یکی از پاها معامله نشد؛ معامله در ${esc(dateFa(market.days[st.closedAt].date))} — آخرین روزی که همهٔ پاها قیمت پایانی واقعی داشتند — بسته شد.`
            : 'کارنامهٔ این معامله پایین‌تر آمده. برای تغییر هر تصمیم، روی همان روز در خط زمان بزن.'}</p>
        <div class="bar"><button type="button" class="ghost" data-act="save-branch">ذخیرهٔ این مسیر به‌عنوان شاخه</button>
          <button type="button" class="ghost" data-act="undo">↶ برگشت یک روز</button>
          <button type="button" class="btn" data-act="goto-report">📋 دیدن کارنامه</button></div>
      </section>`;
    }
    const v = view ?? run.pending?.i;
    const dc = v != null ? dayContext(run, v) : null;
    if (!dc) return '';
    const { st, ev, pending } = dc;
    const day = market.days[v];
    const opts = dayOptions(st, v, ev);
    const selId = selectedId(dc, opts, v);
    const stored = exp.decisions[day.date];
    const custom = choice?.id === 'custom' ? choice
      : selId === 'custom' && stored?.kind === 'roll' ? { side: stored.side, strike: stored.strike == null ? 'none' : String(stored.strike) }
        : { side: ev.winning || 'put', strike: '' };
    const board = strikeBoard(ctx, v);
    const blocked = ev.missing.length > 0;
    // ۵.۲: روز حد ضرر اجباری هر انتخابی بستن کامل اجرا می‌شود؛ کارت‌های دیگر قفل‌اند.
    const forced = slForced(cfgOf(), ev);
    const losingLeg = ev.losing ? st.legs[ev.losing] : null;
    const losingReal = losingLeg && ev.marks[ev.losing] && ev.marks[ev.losing].price > losingLeg.open;
    const card = (o) => {
      const imp = impactOf(st, v, ev, o.action);
      const fut = exp.reveal ? futureOf(v, o.action, exp.revealPolicy || 'algo') : NaN;
      const selected = o.id === selId;
      return `<button type="button" class="sl-opt${o.recommended ? ' rec' : ''}${selected && !blocked ? ' selected' : ''}" data-act="choose" data-id="${o.id}" ${(blocked && o.id !== 'hold' && o.id !== 'algo') || (forced && o.action.kind !== 'close') ? 'disabled' : ''} aria-pressed="${selected ? 'true' : 'false'}">
        <span class="sl-opt-title">${o.recommended ? '<span class="sl-badge rec">پیشنهاد</span>' : ''}${esc(o.title)}${o.dup ? ' <small>(همان پیشنهاد)</small>' : ''}</span>
        <b class="sl-opt-action">${esc(actText(o.action))}</b>
        <span class="sl-opt-desc">${esc(o.desc)}</span>
        ${impactRows(imp, o.action)}
        ${exp.reveal ? `<span class="sl-future">تا پایان (${esc(POLICIES[exp.revealPolicy || 'algo'].label)}): <b class="${tone(fut)}">${esc(pl(fut))}</b></span>` : ''}
      </button>`;
    };
    const customAction = custom.strike === '' ? null : { kind: 'roll', side: custom.side, strike: custom.strike === 'none' ? null : Number(custom.strike) };
    const customImp = customAction ? impactOf(st, v, ev, customAction) : null;
    const zoneText = { calm: 'آرام', band: 'در محدودهٔ تعدیل', beyond: 'فراتر از محدوده' }[ev.zone] || '';

    return `<section class="card sl-decide${pending ? ' pending' : ' past'}" id="sl-decide">
      <div class="section-head">
        <div><p class="eyebrow">${pending ? 'تصمیم پایان روز' : 'بازبینی تصمیم گذشته'}</p>
          <h3>${esc(dateFa(day.date))} <small>${esc(dayNameFa(day.date))}، ${faDigits(String(day.dte))} روز تا سررسید</small> ${helpIcon('decide')}</h3></div>
        <div class="sl-decide-nav">
          <button type="button" class="ghost sl-mini" data-act="view-prev" ${v > 1 ? '' : 'disabled'} title="روز قبل">→ روز قبل</button>
          <button type="button" class="ghost sl-mini" data-act="view-next" ${v < (run.pending?.i ?? market.days.length - 1) ? '' : 'disabled'} title="روز بعد">روز بعد ←</button>
        </div>
      </div>
      <div class="sl-day-facts">${helpIcon('facts')}
        <span>زیان شناور <b>${pct(ev.floatPct)}</b> <span class="sl-zone ${ev.zone}">${esc(zoneText)}</span></span>
        <span>سود و زیان <b class="${tone(ev.pnl)}">${esc(pl(ev.pnl))}</b></span>
        ${ev.straddle ? `<span>نسبت پرمیوم <b>${fin(ev.ratio) ? faDigits(ev.ratio.toFixed(2)) : '∞'}×</b> <span class="sl-zone ${ev.unstable ? 'beyond' : 'calm'}">${ev.unstable ? 'ناپایدار' : 'پایدار'}</span></span>` : ''}
        ${ev.losing ? `<span>${losingReal ? 'سمت زیان‌ده' : 'سمت پرفشارتر (هنوز زیر قیمت ورود)'} <b>${SIDE_FA[ev.losing]}</b></span>` : ''}
      </div>
      <p class="sl-rec-text"><span class="sl-badge rec">الگوریتم</span> ${esc(ev.rec.text)}${ev.rec.detail ? ` ${esc(ev.rec.detail)}` : ''} ${helpIcon('rec')}</p>
      ${blocked ? '<p class="note warn">قیمت امروزِ یکی از پاها نیست؛ فقط «نگه‌داشتن» ممکن است. یا «قیمت مدل» را در قواعد روشن کن.</p>' : ''}
      ${forced ? '<p class="note warn">حد ضرر اجباری است (۵.۲): هر تصمیمی امروز بستن کامل اجرا می‌شود. برای اختیاری‌کردنش «حد ضرر اجباری» را در قواعد خاموش کن.</p>' : ''}
      <p class="sl-hint">${helpIcon('impact')} هر کارت می‌گوید با آن انتخاب سود و زیانت چه می‌شود، چه مقدار قطعی می‌شود، امروز چقدر نقد می‌گیری یا می‌پردازی، و وجه تضمین چقدر زیاد یا آزاد می‌شود. «نیاز به وجه تازه» = افزایش وجه تضمین منهای نقدی که همین امروز می‌گیری.</p>
      <div class="sl-opts">${opts.map(card).join('')}
        <div class="sl-opt custom${selId === 'custom' ? ' selected' : ''}">
          <span class="sl-opt-title">تعدیل سفارشی ${helpIcon('custom')}</span>
          ${seg('custom-side', custom.side, SIDES.map((sd) => [sd, SIDE_FA[sd]]))}
          <select data-act="custom-strike" aria-label="قیمت اعمال تازه" ${blocked || forced ? 'disabled' : ''}>
            <option value="">— قیمت اعمال تازه —</option>
            <option value="none"${custom.strike === 'none' ? ' selected' : ''}>فقط بستن این سمت</option>
            ${board.filter((row) => row[custom.side]).map((row) => {
              const c = row[custom.side];
              const can = fin(c.price) && c.price > 0;
              return `<option value="${row.strike}" ${can ? '' : 'disabled'}${String(custom.strike) === String(row.strike) ? ' selected' : ''}>${strikeFa(row.strike)}، ${price(c.price)}${c.src === 'model' ? ' (مدل)' : c.src === 'stale' ? ' (بی‌معامله)' : ''}، Δ ${fin(c.delta) ? faDigits(c.delta.toFixed(2)) : '—'}</option>`;
            }).join('')}
          </select>
          ${customImp ? impactRows(customImp, customAction) + (exp.reveal && !customImp.error ? `<span class="sl-future">تا پایان: <b>${esc(pl(futureOf(v, customAction, exp.revealPolicy || 'algo')))}</b></span>` : '')
            : '<span class="sl-opt-desc">سمت و قیمت اعمال را انتخاب کن تا اثرش این‌جا بیاید.</span>'}
        </div>
      </div>
      <div class="bar sl-decide-actions">
        ${pending ? `
          ${helpIcon('buttons')}<button type="button" class="btn sl-go" data-act="commit">ثبت و رفتن به روز بعد ←</button>
          <button type="button" class="ghost" data-act="skip-to-trigger" title="امروز نگه‌داشتن، و روزهای آرام بعدی هم، تا روزی که الگوریتم کاری پیشنهاد کند">⏩ تا روز تصمیم بعدی</button>
          <button type="button" class="ghost" data-act="auto-algo">⏭ پیروی از الگوریتم تا پایان</button>
          <button type="button" class="ghost" data-act="undo" ${exp.cursor > 1 ? '' : 'disabled'}>↶ برگشت یک روز</button>`
        : `${helpIcon('edit-mode')}${seg('edit-mode', editMode, [['replay', 'تصمیم‌های بعدی بازپخش شوند'], ['cut', 'از همین روز دوباره جلو بروم']])}
          <button type="button" class="btn" data-act="commit-edit">اعمال تغییر این روز</button>
          <button type="button" class="ghost" data-act="view-pending">رفتن به روز جاری</button>`}
        <span class="sp"></span>
        <label class="sl-switch" title="نتیجهٔ نهایی هر گزینه را نشان می‌دهد — یعنی نگاه به آینده"><input type="checkbox" role="switch" data-act="reveal" ${exp.reveal ? 'checked' : ''}><span class="sl-switch-track" aria-hidden="true"></span><span>نمایش آینده</span></label>${helpIcon('reveal')}
        ${exp.reveal ? seg('reveal-policy', exp.revealPolicy || 'algo', Object.entries(POLICIES).map(([k, p]) => [k, `ادامه: ${p.label}`])) : ''}
      </div>
    </section>`;
  }

  // ═════════════════════════ دفتر روزانه ═════════════════════════

  function journalHtml(run) {
    const M = market.size * cfgOf().qty;
    const rows = run.steps.map((s, k) => {
      const ev = s.ev;
      const before = k > 0 ? run.steps[k - 1].state : s.state;
      const day = market.days[s.i], prev = market.days[s.i - 1];
      const legCell = (side) => {
        const leg = before.legs?.[side];
        if (!leg || before.closed) return '<td>—</td>';
        const m = ev.marks?.[side];
        const now = day[side]?.[leg.strike], was = prev?.[side]?.[leg.strike];
        const ch = fin(now) && fin(was) ? ((now - was) / was) * 100 : NaN;
        return `<td><small class="sl-sym">${esc(leg_(side, leg.strike))}</small>${m ? `${price(m.price)} ${srcBadge(m.src)}` : (s.i === 0 ? price(leg.open) : '—')}<small class="${tone(-ch)}">${fin(ch) ? pct(ch) : ''}</small></td>`;
      };
      const dC = k > 0 ? s.sides.call.cum - run.steps[k - 1].sides.call.cum : NaN;
      const dP = k > 0 ? s.sides.put.cum - run.steps[k - 1].sides.put.cum : NaN;
      void M;
      return `<tr class="${s.i === view ? 'viewing' : ''}">
        <th scope="row"><button type="button" class="linklike" data-act="view" data-day="${s.i}">${esc(shortDateFa(s.date))}</button></th>
        <td>${fmt.int(ev.S)}<small class="${tone(prev ? day.S - prev.S : NaN)}">${prev ? pct(((day.S - prev.S) / prev.S) * 100) : ''}</small></td>
        ${legCell('call')}${legCell('put')}
        <td class="${tone(s.sides?.call?.cum)}">${esc(pl(s.sides?.call?.cum))}<small class="${tone(dC)}">${fin(dC) ? esc(pl(dC)) : ''}</small></td>
        <td class="${tone(s.sides?.put?.cum)}">${esc(pl(s.sides?.put?.cum))}<small class="${tone(dP)}">${fin(dP) ? esc(pl(dP)) : ''}</small></td>
        <td class="${tone(s.pnl)}"><b>${esc(pl(s.pnl))}</b></td>
        <td>${pct(ev.floatPct)}</td>
        <td><b>${esc(actText(s.action))}</b>${s.error ? ` <small class="warn">${esc(s.error)}</small>` : ''}</td>
        <td>${s.state.legs?.call && !s.state.closed ? esc(leg('call', s.state.legs.call.strike)) : 'بسته'}<br>${s.state.legs?.put && !s.state.closed ? esc(leg('put', s.state.legs.put.strike)) : 'بسته'}</td>
      </tr>`;
    }).join('');
    return `<section class="card sl-journal"><div class="section-head"><div><p class="eyebrow">دفتر روزانه</p><h3>📒 ${faDigits(String(run.steps.length))} روز — قیمت، تغییر، اثر هر پا و اقدام ${helpIcon('journal')}</h3></div>
        <button type="button" class="btn" data-act="excel">⬇ خروجی اکسل کامل ${helpIcon('excel')}</button></div>
      <div class="history-table-wrap sl-journal-wrap"><table class="sl-journal-table">
        <thead><tr><th>روز</th><th>پایه (تغییر)</th><th>کال (تغییر)</th><th>پوت (تغییر)</th><th>اثر انباشتهٔ کال (امروز)</th><th>اثر انباشتهٔ پوت (امروز)</th><th>سود و زیان کل</th><th>زیان شناور</th><th>اقدام</th><th>کال / پوت پس از اقدام</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      ${run.pending ? `<p class="sl-hint">روز ${esc(dateFa(market.days[run.pending.i].date))} هنوز در انتظار تصمیم است و در این جدول نیست؛ اکسل آن را به‌عنوان ردیف آخر با برچسب «در انتظار تصمیم» دارد.</p>` : ''}</section>`;
  }

  // ═════════════════════════ نمودارهای تعاملی ═════════════════════════

  function chartsHtml(run, upTo) {
    const cfg = cfgOf();
    const { capital } = capitalOf();
    const n = market.days.length;
    const dates = market.days.map((d) => d.date);
    const initial = run.steps[0].state.initialCredit;
    const calls = new Array(n).fill(NaN), puts = new Array(n).fill(NaN);
    const callPx = new Array(n).fill(NaN), putPx = new Array(n).fill(NaN);
    const notes = new Array(n).fill('');
    for (const s of run.steps) {
      const legs = s.state.closed ? null : s.state.legs;
      calls[s.i] = legs?.call?.strike ?? NaN;
      puts[s.i] = legs?.put?.strike ?? NaN;
      callPx[s.i] = s.ev.marks?.call?.price ?? (s.i === 0 ? s.state.legs.call?.open : NaN);
      putPx[s.i] = s.ev.marks?.put?.price ?? (s.i === 0 ? s.state.legs.put?.open : NaN);
      notes[s.i] = s.i === 0 ? 'ورود' : actText(s.action);
    }
    if (run.pending) {
      const p = run.pending;
      calls[p.i] = p.state.legs.call?.strike ?? NaN;
      puts[p.i] = p.state.legs.put?.strike ?? NaN;
      callPx[p.i] = p.ev.marks?.call?.price ?? NaN;
      putPx[p.i] = p.ev.marks?.put?.price ?? NaN;
      notes[p.i] = 'در انتظار تصمیم';
    }
    const marks = run.steps.filter((s) => s.i > 0 && s.action && s.action.kind !== 'hold')
      .map((s) => ({ i: s.i, key: 'spot', cls: s.action.kind, tip: `${dateFa(s.date)}\n${actText(s.action)}` }));
    const shown = (i) => exp.reveal || i <= upTo;
    const spot = market.days.map((d, i) => (shown(i) ? d.S : NaN));
    const be = remember(`be|${sig()}`, () => market.days.map((_, i) => weightedBreakevens(ctx, i)));
    const beCall = be.map((b, i) => (shown(i) ? b.call.value : NaN));
    const bePut = be.map((b, i) => (shown(i) ? b.put.value : NaN));
    const daily = (arr) => arr.map((v, i) => (i > 0 && fin(v) && fin(arr[i - 1]) ? v - arr[i - 1] : NaN));

    const pnlSeries = [{ key: 'pnl', label: 'مسیر من', cls: 'pnl', values: run.series }];
    if (exp.reveal) {
      const fut = myFullRun(exp.revealPolicy || 'algo');
      pnlSeries.push({ key: 'future', label: 'ادامهٔ مسیر (آینده)', cls: 'future', values: fut.series.map((v, i) => (i >= upTo ? v : NaN)), full: true });
    }
    (exp.branches || []).filter((b) => overlayIds.has(b.id)).forEach((b, k) => {
      pnlSeries.push({ key: `br-${b.id}`, label: b.name, cls: `b${(k % 4) + 1}`, values: planRun(b.decisions, 'algo').series, full: true });
    });
    const legSeries = [
      { key: 'callCum', label: 'اثر انباشتهٔ کال', cls: 'callcum', values: run.sides.call },
      { key: 'putCum', label: 'اثر انباشتهٔ پوت', cls: 'putcum', values: run.sides.put },
      { key: 'total', label: 'جمع (سود و زیان کل)', cls: 'total', values: run.series },
    ];
    const legBars = [
      { key: 'callDay', label: 'اثر امروزِ کال', cls: 'call', values: daily(run.sides.call), bar: true },
      { key: 'putDay', label: 'اثر امروزِ پوت', cls: 'put', values: daily(run.sides.put), bar: true },
    ];
    const CHARTS = {
      channel: {
        title: 'قیمت پایه میان دو قیمت اعمال، و سربه‌سر وزنی کال و پوت', help: 'chart-channel',
        items: [{ key: 'spot', label: 'پایه', cls: 'spot' }, { key: 'callK', label: 'قیمت اعمال کال', cls: 'callk' }, { key: 'putK', label: 'قیمت اعمال پوت', cls: 'putk' },
          { key: 'beCall', label: 'سربه‌سر وزنی کال', cls: 'becall' }, { key: 'bePut', label: 'سربه‌سر وزنی پوت', cls: 'beput' }],
        chart: () => lineChart({ id: 'channel', dates, W: FULL, h: 400, unit: 'price', zero: false, upTo, cursor: view, hidden: hidden.channel, notes, marks,
          band: { upper: calls, lower: puts },
          series: [{ key: 'spot', label: 'پایه', cls: 'spot', values: spot, full: true, tag: true },
            { key: 'callK', label: 'قیمت اعمال کال', cls: 'callk', values: calls, step: true, tag: 'اعمال کال', labels: calls.map((K) => (fin(K) ? symOf('call', K) : '')) },
            { key: 'putK', label: 'قیمت اعمال پوت', cls: 'putk', values: puts, step: true, tag: 'اعمال پوت', labels: puts.map((K) => (fin(K) ? symOf('put', K) : '')) },
            { key: 'beCall', label: 'سربه‌سر وزنی کال', cls: 'becall', values: beCall, full: true, tag: 'سربه‌سر کال' },
            { key: 'bePut', label: 'سربه‌سر وزنی پوت', cls: 'beput', values: bePut, full: true, tag: 'سربه‌سر پوت' }], label: 'قیمت پایه و سربه‌سر وزنی' }),
      },
      pnl: {
        title: 'سود و زیان روزانه', help: 'chart-pnl',
        items: pnlSeries.map((x) => ({ key: x.key, label: x.label, cls: x.cls })),
        chart: () => lineChart({ id: 'pnl', dates, W: FULL, h: 400, upTo, cursor: view, hidden: hidden.pnl, notes, area: 'pnl', series: pnlSeries, pctBase: retBase(), pctLabel: 'سرمایهٔ درگیر (وجه تضمین بلوکه‌شده)',
          refs: [{ value: (cfg.tpPct / 100) * initial, label: 'حد سود', cls: 'tp' }, { value: -(cfg.slPct / 100) * initial, label: 'حد ضرر', cls: 'sl' }], label: 'سود و زیان روزانه' }),
      },
      legs: {
        title: 'اثر انباشته و روزانهٔ هر پا', help: 'chart-legs',
        items: [...legSeries, ...legBars].map((x) => ({ key: x.key, label: x.label, cls: x.cls, bar: x.bar })),
        chart: () => lineChart({ id: 'legs', dates, W: FULL, h: 400, upTo, cursor: view, hidden: hidden.legs, notes, series: legSeries, bars: legBars, pctBase: retBase(), pctLabel: 'سرمایهٔ درگیر (وجه تضمین بلوکه‌شده)', label: 'اثر هر پا' }),
      },
      prices: {
        title: 'قیمت پایانی پاهای فروخته‌شده', help: 'chart-prices',
        items: [{ key: 'callPx', label: 'کال', cls: 'callpx' }, { key: 'putPx', label: 'پوت', cls: 'putpx' }],
        chart: () => lineChart({ id: 'prices', dates, W: FULL, h: 400, unit: 'price', zero: false, upTo, cursor: view, hidden: hidden.prices, notes,
          series: [{ key: 'callPx', label: 'کال', cls: 'callpx', values: callPx, labels: calls.map((K) => (fin(K) ? symOf('call', K) : '')) },
            { key: 'putPx', label: 'پوت', cls: 'putpx', values: putPx, labels: puts.map((K) => (fin(K) ? symOf('put', K) : '')) }], label: 'قیمت پاها' }),
      },
    };
    const c = CHARTS[chartSel] || CHARTS.channel;
    return `<div class="sl-chartbar">${seg('chart-sel', chartSel, [['channel', '📉 قیمت و سربه‌سر'], ['pnl', '💹 سود و زیان'], ['legs', '⚖️ اثر هر پا'], ['prices', '🏷 قیمت پاها']])}</div>
      <div class="sl-chartcard"><h4 class="sl-sub">${esc(c.title)} ${helpIcon(c.help)}</h4>
      ${legendChips(chartSel, c.items, hidden[chartSel])}${c.chart()}</div>`;
  }

  // ═════════════════════════ پرمیوم دریافتی ═════════════════════════

  /**
   * جمع پرمیوم دریافتیِ کال و پوت در طول معامله.
   *
   * هر فروش تازه (ورود یا رول) پرمیوم همان روز را به سمت خودش اضافه می‌کند،
   * پس نمودار پله‌ای بالا می‌رود. لایهٔ پایین کال است و لایهٔ بالا پوت؛
   * لبهٔ بالایی جمع هر دو. «خالص پس از بازخرید» هزینهٔ بستن پاها را کم
   * می‌کند. نوارهای زیرش عمر هر پاست؛ کلیک، کارت کامل آن پا.
   */
  function premiumHtml(run, upTo) {
    const n = market.days.length;
    const dates = market.days.map((d) => d.date);
    const lastState = run.done ? run.state : run.pending?.state || run.steps[run.steps.length - 1].state;
    const trades = lastState.trades || [];
    const recv = { call: new Array(n).fill(NaN), put: new Array(n).fill(NaN) };
    const paid = new Array(n).fill(NaN);
    for (let i = 0; i <= upTo; i += 1) {
      let c = 0, p = 0, out = 0;
      for (const t of trades) {
        if (t.openDay <= i) { if (t.side === 'call') c += t.premium; else p += t.premium; }
        if (t.closeDay != null && t.closeDay <= i) out += t.cost;
      }
      recv.call[i] = c; recv.put[i] = p; paid[i] = c + p - out;
    }
    const total = recv.call.map((v, i) => (fin(v) ? v + recv.put[i] : NaN));
    const sum = (side) => trades.filter((t) => t.side === side).reduce((a, t) => a + t.premium, 0);
    const cost = trades.reduce((a, t) => a + (t.cost || 0), 0);
    const notes = dates.map((d, i) => trades.filter((t) => t.openDay === i).map((t) => `فروش ${SIDE_FA[t.side]} ${strikeFa(t.strike)}: ${money(t.premium)}`).join('، '));
    const series = [
      { key: 'callRecv', label: 'پرمیوم کال', cls: 'call', values: recv.call, step: true },
      { key: 'putRecv', label: 'پرمیوم پوت', cls: 'put', values: recv.put, step: true, noLine: true },
      { key: 'total', label: 'جمع پرمیوم', cls: 'total', values: total, step: true },
      { key: 'net', label: 'خالص پس از بازخرید', cls: 'net', values: paid, step: true },
    ];
    const sel = trades[legSel];
    const legCard = sel ? (() => {
      const end = sel.closeDay ?? Math.min(upTo, n - 1);
      const held = daysBetween(dates[sel.openDay], dates[end]);
      const sOpen = market.days[sel.openDay].S, sEnd = market.days[end].S;
      const sym = market.strikes.find((x) => x.strike === sel.strike)?.[sel.side]?.sym || '';
      const markNow = sel.closeDay == null ? (run.pending?.ev.marks?.[sel.side] || null) : null;
      const kept = sel.closeDay != null ? ((sel.premium - sel.cost) / sel.premium) * 100 : (markNow ? ((sel.openPrice - markNow.price) / sel.openPrice) * 100 : NaN);
      return `<div class="sl-legcard ${sel.side}">
        <header>${helpIcon('legcard')}<span class="sl-badge ${sel.side}">${SIDE_FA[sel.side]}</span><b>${strikeFa(sel.strike)}</b> <span class="sl-leg-sym">${fmt.sym(sym)}</span>
          <span class="pill ${sel.closeDay == null ? 'open' : 'shut'}">${sel.closeDay == null ? 'باز' : 'بسته'}</span>
          <button type="button" class="ghost sl-mini" data-act="leg-sel" data-k="-1">✕</button></header>
        <dl class="sl-impact">
          <div><dt>روز فروش</dt><dd>${esc(dateFa(dates[sel.openDay]))}</dd></div>
          <div><dt>قیمت فروش</dt><dd>${price(sel.openPrice)} ${srcBadge(sel.openSrc)}</dd></div>
          <div><dt>پرمیوم دریافتی</dt><dd class="gain">${esc(money(sel.premium))}</dd></div>
          <div><dt>کارمزد فروش</dt><dd>${esc(money(sel.openFee))}</dd></div>
          <div><dt>پایه در روز فروش</dt><dd>${fmt.int(sOpen)} <small>(${pct(((sel.strike - sOpen) / sOpen) * 100)} فاصله)</small></dd></div>
          <div><dt>دلتا و IV روز فروش</dt><dd>${(() => { const dl = deltaAt(ctx, sel.openDay, sel.side, sel.strike); const iv = ivAt(ctx, sel.openDay, sel.side, sel.strike); return `${fin(dl) ? faDigits(dl.toFixed(2)) : '—'}، ${fin(iv) ? pct(iv * 100, 0) : '—'}`; })()}</dd></div>
          ${sel.closeDay != null ? `
          <div><dt>روز بازخرید</dt><dd>${esc(dateFa(dates[sel.closeDay]))}</dd></div>
          <div><dt>قیمت بازخرید</dt><dd>${price(sel.closePrice)} ${srcBadge(sel.closeSrc)}</dd></div>
          <div><dt>هزینهٔ بازخرید</dt><dd class="loss">${esc(money(sel.cost))}</dd></div>
          <div><dt>کارمزد بازخرید</dt><dd>${esc(money(sel.closeFee))}</dd></div>
          <div class="sl-need ${tone(sel.realized)}"><dt>سود و زیان این پا</dt><dd>${esc(pl(sel.realized))}</dd></div>`
          : `<div><dt>قیمت امروز</dt><dd>${markNow ? price(markNow.price) : '—'}</dd></div>`}
          <div><dt>سهم نگه‌داشته‌شده از پرمیوم</dt><dd class="${tone(kept)}">${pct(kept, 0)}</dd></div>
          <div><dt>عمر پا</dt><dd>${faDigits(String(held))} روز</dd></div>
          <div><dt>پایه تا ${sel.closeDay != null ? 'بازخرید' : 'امروز'}</dt><dd class="${tone(sEnd - sOpen)}">${fmt.int(sEnd)} (${pct(((sEnd - sOpen) / sOpen) * 100)})</dd></div>
        </dl></div>`;
    })() : '<p class="note sl-day-empty">روی هر نوار بزن تا کارت کامل همان پا (فروش، بازخرید، پرمیوم، سود و زیان) این‌جا باز شود.</p>';
    return `<section class="card sl-premium">
      <div class="section-head"><div><p class="eyebrow">پرمیوم</p><h3>💰 جمع پرمیوم دریافتی کال و پوت در طول معامله ${helpIcon('premium')}</h3></div></div>
      <p class="sl-hint">هر فروش تازه — روز ورود یا هر رول — پرمیوم همان روز را به سمت خودش اضافه می‌کند و نمودار پله‌ای بالا می‌رود. لایهٔ پایین کال و لایهٔ بالا پوت است؛ لبهٔ بالایی جمع هر دو. «خالص پس از بازخرید» هزینهٔ بستن پاها را هم کم می‌کند.</p>
      <div class="sl-kpis">
        <div class="kpi"><span>پرمیوم کال ${helpIcon('kpi-prem-side')}</span><b class="call-ink">${esc(money(sum('call')))}</b><small>${faDigits(String(trades.filter((t) => t.side === 'call').length))} پا فروخته شد</small></div>
        <div class="kpi"><span>پرمیوم پوت ${helpIcon('kpi-prem-side')}</span><b class="put-ink">${esc(money(sum('put')))}</b><small>${faDigits(String(trades.filter((t) => t.side === 'put').length))} پا فروخته شد</small></div>
        <div class="kpi"><span>جمع پرمیوم دریافتی ${helpIcon('kpi-prem-total')}</span><b class="gain">${esc(money(sum('call') + sum('put')))}</b><small>پرمیوم اولیه ${esc(money(run.steps[0].state.initialCredit))}</small></div>
        <div class="kpi"><span>هزینهٔ بازخریدها ${helpIcon('kpi-prem-cost')}</span><b class="loss">${esc(money(cost))}</b></div>
        <div class="kpi"><span>خالص پس از بازخرید ${helpIcon('kpi-prem-net')}</span><b class="${tone(sum('call') + sum('put') - cost)}">${esc(money(sum('call') + sum('put') - cost, { sign: true }))}</b><small>پیش از ارزش پاهای باز و کارمزد</small></div>
      </div>
      ${legendChips('premium', series.map((x) => ({ key: x.key, label: x.label, cls: x.cls })), hidden.premium)}
      ${lineChart({ id: 'premium', dates, W: FULL, h: 300, upTo, cursor: view, hidden: hidden.premium, notes, series, pctBase: retBase(), pctLabel: 'سرمایهٔ درگیر (وجه تضمین بلوکه‌شده)',
        areas: [{ key: 'total', cls: 'put' }, { key: 'callRecv', cls: 'call' }], label: 'جمع پرمیوم دریافتی' })}
      <h4 class="sl-sub">عمر هر پا ${helpIcon('gantt')}</h4>
      ${legGanttSvg({ dates, trades, upTo, sel: legSel, symOf, base: retBase() })}
      ${legCard}
    </section>`;
  }

  // ═════════════════════════ کارنامه ═════════════════════════

  function gradeOfRun() {
    return remember(`grade|${JSON.stringify(exp.decisions)}|${sig()}`,
      () => gradeReport(ctx, cfgOf(), exp.entry, exp.decisions, { fees: fees(), cap: 20000 }));
  }

  /** دلیلِ خوب‌بودنِ یک مسیر، از ارزش تک‌تک اقدام‌هایش. */
  function pathReason(b, g) {
    const run = b.run;
    const end = run.state.closedAt >= 0 ? run.state.closedAt : market.days.length - 1;
    const sMove = ((market.days[end].S - market.days[0].S) / market.days[0].S) * 100;
    const head = `پایان: ${reasonText(run.state.reason)} در ${dateFa(market.days[end].date)}. پایه در کل دوره ${pct(sMove, 1)} حرکت کرد؛ سهم کال ${pl(run.sides.call[end])} و سهم پوت ${pl(run.sides.put[end])}.`;
    if (!b.items.length) {
      // متن از مقایسهٔ واقعی ساخته می‌شود، با برابرها — نه یک ادعای کلی.
      const c = compareFinals(g?.paths || [], b.final, (p) => p.choices.some((x) => x.key !== 'H'));
      const parts = [c.worse ? `${fmt.int(c.worse)} نتیجهٔ بدتر` : '', c.equal ? `${fmt.int(c.equal)} دقیقاً همین نتیجه` : '', c.better ? `${fmt.int(c.better)} نتیجهٔ بهتر` : ''].filter(Boolean);
      return { head, lines: [c.known
        ? `هیچ دستکاری‌ای نکرد. از ${fmt.int(c.known)} مسیر شمرده‌شده‌ای که روزی تعدیل کردند یا زودتر بستند، ${parts.join('، ')} داشتند${c.equal ? '؛ پس دستکاری در آن روزها لزوماً سودی را از دست نمی‌داد' : ''}.`
        : 'هیچ دستکاری‌ای نکرد، و در مسیرهای شمرده‌شده مسیری با اقدام نبود که با آن مقایسه شود.'] };
    }
    const lines = b.items.map((it) => {
      const dir = it.sMoveAfter > 0 ? 'بالا رفت' : it.sMoveAfter < 0 ? 'پایین آمد' : 'ثابت ماند';
      const cash = it.cash ? `، نقد ${money(it.cash, { sign: true })}` : '';
      const worth = it.value > 0 ? `بدون این کار نتیجه ${pl(it.value)} بدتر می‌شد.` : it.value < 0 ? `بی این کار نتیجه ${pl(-it.value)} بهتر بود.` : 'اثرش روی نتیجه صفر بود.';
      const why = it.action.kind === 'close' ? (it.sMoveAfter !== 0 ? `بعد از آن پایه ${pct(Math.abs(it.sMoveAfter))} ${dir}؛ بستنِ به‌موقع این حرکت را پشت سر گذاشت.` : '')
        : `بعد از آن پایه ${pct(Math.abs(it.sMoveAfter))} ${dir} و پای تازه بیشترِ پرمیومش را از دست داد.`;
      return `${dateFa(it.date)} — ${actText(it.action)}${cash}. ${why} ${worth}`;
    });
    return { head, lines };
  }

  function reportHtml(run) {
    if (!run.done) return '';
    if (!fin(run.final)) return '<section class="card sl-report" id="sl-report"><h3>کارنامه</h3><p class="note warn">نتیجهٔ نهایی معلوم نیست؛ بی آن نمره‌ای ساخته نمی‌شود.</p></section>';
    let g;
    try { g = gradeOfRun(); } catch (e) { logError('کارنامهٔ استرانگل', e); return ''; }
    if (g.error) return `<section class="card sl-report"><p class="note warn">${esc(g.error)}</p></section>`;
    exp.grade = g.grade.letter;
    exp.gradeKey = gradeKeyOf(exp);
    const { summary: sm } = g;
    const regrets = g.review.filter((r) => r.regret > 1).sort((a, b) => b.regret - a.regret).slice(0, 8);
    const followed = g.review.filter((r) => r.followedAlgo).length;
    const ringPct = fin(g.score) ? g.score : 0;
    return `<section class="card sl-report" id="sl-report">
      <div class="section-head"><div><p class="eyebrow">کارنامهٔ معامله، این بخش آینده را می‌بیند</p><h3>همهٔ کارهایی که از شروع تا پایان می‌شد کرد ${helpIcon('report')}</h3></div></div>
      <div class="sl-report-top">
        <div class="sl-grade g${esc(g.grade.letter)}" style="--p:${ringPct}">
          <b>${esc(g.grade.letter)}</b><span>${esc(g.grade.label)}</span><small>${faDigits(String(g.score))} از ۱۰۰</small>
        </div>
        <div class="sl-report-lines">
          <p>از میان <b>${fmt.int(g.count)}</b> مسیر شمرده‌شده${g.truncated ? ' (به سقف شمارش رسید)' : ''} — نه همهٔ ترکیب‌های ممکنِ تصمیم — مسیر شما رتبهٔ <b>${fmt.int(g.rank)}</b> را دارد${g.versus.equal > 1 ? `، هم‌رتبه با ${fmt.int(g.versus.equal - 1)} مسیر دیگر با همین نتیجه` : ''}؛
            <b>${pct(g.percentile, 0)}</b> مسیرها اکیداً بدتر${g.versus.equal ? `، ${pct((g.versus.equal / Math.max(1, g.versus.known)) * 100, 0)} برابر` : ''} و ${pct((g.versus.better / Math.max(1, g.versus.known)) * 100, 0)} بهتر بودند.</p>
          <p>کارایی <b>${pct(g.efficiency, 0)}</b>: نتیجهٔ شما کجای فاصلهٔ بدترین (${esc(pl(sm.min))}) تا بهترین (${esc(pl(sm.max))}) نشسته است.</p>
          <p class="sl-hint">نمره میانگین همین دو عدد است: (${pct(g.percentile, 0)} + ${pct(g.efficiency, 0)}) ÷ ۲ ≈ ${faDigits(String(g.score))}. مسیرهای برابر در «اکیداً بدتر» شمرده نمی‌شوند، پس رتبهٔ یک با برابرهای زیاد نمرهٔ صد نمی‌گیرد. نوار نمره: ${GRADE_BANDS.filter(([m]) => fin(m)).map(([m, l, t]) => `${l} ${t} از ${faDigits(String(m))}`).join('، ')}، و E زیر آن.
            مسیرها این‌طور شمرده شدند: در روز آرام «نگه‌داشتن» یا «بستن»، و در روزی که الگوریتم کاری پیشنهاد کرد همهٔ گزینه‌ها (پیشنهاد، نگه‌داشتن، بستن، رول دفاعی).</p>
        </div>
      </div>
      <div class="sl-kpis">
        <div class="kpi"><span>نتیجهٔ شما ${helpIcon('kpi-r-mine')}</span><b class="${tone(g.mine.final)}">${esc(pl(g.mine.final))}</b></div>
        <div class="kpi"><span>بهترین ممکن ${helpIcon('kpi-r-best')}</span><b class="gain">${esc(pl(sm.max))}</b><small>فاصلهٔ شما ${esc(pl(sm.max - g.mine.final))}</small></div>
        <div class="kpi"><span>میانهٔ همهٔ مسیرها ${helpIcon('kpi-r-median')}</span><b class="${tone(sm.median)}">${esc(pl(sm.median))}</b></div>
        <div class="kpi"><span>الگوریتم کامل ${helpIcon('kpi-r-algo')}</span><b class="${tone(g.algo.final)}">${esc(pl(g.algo.final))}</b></div>
        <div class="kpi"><span>پیروی شما از الگوریتم ${helpIcon('kpi-r-follow')}</span><b>${faDigits(String(followed))} از ${faDigits(String(g.review.length))} روز</b></div>
      </div>
      <h4 class="sl-sub">🏆 بهترین کارها — و چرا ${helpIcon('report-best')}</h4>
      <div class="sl-best">${g.best.map((b, k) => {
        const r = pathReason(b, g);
        return `<article class="sl-best-card">
          <header><span class="sl-best-rank">${faDigits(String(k + 1))}</span><b class="${tone(b.final)}">${esc(pl(b.final))}</b>
            <span class="sl-chips">${choiceChips(b.path.choices.filter((c) => c.action?.kind !== 'hold'), 6, symOf)}</span>
            <button type="button" class="ghost sl-mini" data-act="load-best" data-k="${k}" title="این مسیر مسیر من شود (مسیر فعلی شاخه می‌شود)">بارگذاری</button></header>
          <p class="sl-best-head">${esc(r.head)}</p>
          <ul>${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        </article>`;
      }).join('')}</div>
      <h4 class="sl-sub">🧭 کارهای شما و ارزش هر کدام ${helpIcon('report-mine')}</h4>
      ${g.mineItems.length ? `<ul class="sl-mine-items">${g.mineItems.map((it) => `<li class="${tone(it.value)}"><b>${esc(dateFa(it.date))}</b> ${esc(actText(it.action))}
        — ${it.value > 0 ? `این کار ${esc(pl(it.value))} به نتیجه افزود` : it.value < 0 ? `این کار ${esc(pl(-it.value))} از نتیجه کم کرد` : 'اثری نداشت'}
        ${it.cash ? `، نقد ${esc(money(it.cash, { sign: true }))}` : ''}، پایه پس از آن ${pct(it.sMoveAfter)}.</li>`).join('')}</ul>`
        : '<p class="note">هیچ اقدامی جز نگه‌داشتن نکردی؛ نتیجه همان «نگه‌داشتن تا پایان» است.</p>'}
      <h4 class="sl-sub">💡 روزهایی که می‌شد بهتر تصمیم گرفت ${helpIcon('report-regret')}</h4>
      ${regrets.length ? `<div class="history-table-wrap"><table class="sl-cmp-table"><thead><tr><th>روز</th><th>کار شما</th><th>بهترین گزینهٔ همان روز</th><th>نتیجه با آن</th><th>هزینهٔ انتخاب شما</th></tr></thead>
        <tbody>${regrets.map((r) => `<tr><th scope="row"><button type="button" class="linklike" data-act="view" data-day="${r.i}">${esc(shortDateFa(r.date))}</button></th>
          <td>${esc(actText(planRun(exp.decisions).steps.find((s) => s.i === r.i)?.action))}</td><td><b>${esc(actText(r.bestAction))}</b></td>
          <td class="${tone(r.bestFinal)}">${esc(pl(r.bestFinal))}</td><td class="loss">${esc(pl(r.regret))}</td></tr>`).join('')}</tbody></table></div>
        <p class="sl-hint">«هزینه» یعنی اگر فقط در همان روز گزینهٔ بهتر را برمی‌داشتی و بقیهٔ تصمیم‌هایت همان می‌ماند، نتیجه چقدر بهتر می‌شد.</p>`
        : '<p class="note">در هیچ روزی تغییر تنها یک تصمیم نتیجه را بهتر نمی‌کرد — آفرین.</p>'}
      <h4 class="sl-sub">توزیع نتیجهٔ همهٔ مسیرها ${helpIcon('hist')}</h4>
      ${histSvg({ base: retBase(), finals: g.paths.map((p) => p.final), markers: [{ value: g.mine.final, cls: 'mine', label: 'من' }, { value: g.algo.final, cls: 'algo', label: 'الگوریتم' }, { value: sm.max, cls: 'best', label: 'بهترین' }] })}
    </section>`;
  }

  // ═════════════════════════ مقایسه ═════════════════════════

  function comparePaths() {
    const fromCursor = cmpOpts.from === 'cursor';
    return remember(`paths|${JSON.stringify(cmpOpts)}|${sig()}|${fromCursor ? `${JSON.stringify(exp.decisions)}|${exp.cursor}` : ''}`, () => {
      const t0 = performance.now();
      const out = enumeratePaths(ctx, cfgOf(), exp.entry, {
        mode: cmpOpts.mode, options: cmpOpts.options, cap: cmpOpts.cap, fees: fees(),
        prefix: fromCursor ? planDecider(exp.decisions, 'hold') : null,
        branchFrom: fromCursor ? exp.cursor : 0,
      });
      out.ms = performance.now() - t0;
      return out;
    });
  }

  function cmpPathsHtml() {
    const res = comparePaths();
    if (res.error) return `<p class="note warn">${esc(res.error)}</p>`;
    const { capital } = capitalOf();
    const sum = pathsSummary(res.paths);
    const mine = myFullRun(cmpOpts.policy);
    const base = Object.fromEntries(Object.keys(POLICIES).map((k) => [k, policyRun(k)]));
    const known = res.paths.filter((p) => fin(p.final));
    const sorted = [...known].sort((a, b) => b.final - a.final);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    const dates = market.days.map((d) => d.date);
    const rank = percentileOf(res.paths, mine.final);
    const top = cmpOpts.list === 'worst' ? sorted.slice(-10).reverse() : sorted.slice(0, 10);
    const optBox = (id, label) => `<label class="sl-seg-item${cmpOpts.options.includes(id) ? ' on' : ''}"><input type="checkbox" data-act="cmp-opt" value="${id}" ${cmpOpts.options.includes(id) ? 'checked' : ''}> ${esc(label)}</label>`;
    const row = (label, cls, run) => `<tr><th scope="row"><span class="sl-key ${cls}"></span>${esc(label)}</th>
      <td class="${tone(run.final)}">${esc(pl(run.final))}</td><td>${pct(capital > 0 ? (run.final / capital) * 100 : NaN, 2)}</td>
      <td>${faDigits(String(run.state?.adjustments ?? run.adjustments ?? 0))}</td><td>${esc(reasonText(run.state?.reason ?? run.reason))}</td>
      <td>${pct(percentileOf(res.paths, run.final), 0)}</td></tr>`;
    const fanSeries = [
      { key: 'mine', label: 'مسیر من', cls: 'mine', values: mine.series },
      { key: 'algo', label: 'الگوریتم کامل', cls: 'algo', values: base.algo.series },
      { key: 'exits', label: 'فقط حد سود و ضرر', cls: 'exits', values: base.exitsOnly.series },
      { key: 'hold', label: 'نگه‌داشتن', cls: 'hold', values: base.hold.series },
      best && { key: 'best', label: 'بهترین مسیر', cls: 'best', values: best.series },
      worst && { key: 'worst', label: 'بدترین مسیر', cls: 'worst', values: worst.series },
      ...sorted.slice(1, 5).map((p, k) => ({ key: `top${k + 2}`, label: `برتر ${faDigits(String(k + 2))}`, cls: `b${k + 1}`, values: p.series })),
    ].filter(Boolean).map((s) => ({ ...s, full: true }));
    const step = Math.max(1, Math.ceil(res.paths.length / 600));
    const cloud = res.paths.filter((_, i) => i % step === 0).map((p) => ({ values: p.series, final: p.final }));
    return `
      <p class="sl-hint">هر مسیر یک رشته تصمیم است. «نقطهٔ انشعاب» روزی است که مسیرها از هم جدا می‌شوند؛ در هر انشعاب، گزینه‌های تیک‌خورده امتحان می‌شوند.</p>
      <div class="sl-cmp-controls">
        <div class="sl-field"><span class="sl-field-label">نقطه‌های انشعاب ${helpIcon('cmp-mode')}</span>${seg('cmp-mode', cmpOpts.mode, [['trigger', 'فقط روزهای پیشنهاد الگوریتم'], ['mixed', 'ترکیبی (هر روز: نگه‌داشتن یا بستن)'], ['every', 'همهٔ روزها، همهٔ گزینه‌ها']])}</div>
        <div class="sl-field"><span class="sl-field-label">از کجا ${helpIcon('cmp-from')}</span>${seg('cmp-from', cmpOpts.from, [['entry', 'از روز ورود'], ['cursor', 'از امروزِ آزمایش']])}</div>
        <div class="sl-field"><span class="sl-field-label">سقف مسیر ${helpIcon('cmp-cap')}</span>${seg('cmp-cap', cmpOpts.cap, [200, 1000, 2000, 5000, 20000].map((c) => [c, fmt.int(c)]))}</div>
        <div class="sl-field"><span class="sl-field-label">ادامهٔ مسیر من ${helpIcon('cmp-policy')}</span>${seg('cmp-policy', cmpOpts.policy, Object.entries(POLICIES).map(([k, p]) => [k, p.label]))}</div>
        <div class="sl-field"><span class="sl-field-label">گزینه‌ها در هر انشعاب ${helpIcon('cmp-options')}</span><div class="sl-seg">${Object.entries(BRANCH_OPTIONS).map(([k, t]) => optBox(k, t)).join('')}</div></div>
      </div>
      <p class="note">${fmt.int(res.paths.length)} مسیر در ${faDigits(Math.max(1, Math.round(res.ms)).toString())} میلی‌ثانیه${res.truncated ? ' — <b class="warn">به سقف رسید؛ از آن به بعد فقط شاخهٔ پیشنهاد الگوریتم دنبال شد</b>' : ''}${sum.unknown ? `، ${fmt.int(sum.unknown)} مسیر نتیجهٔ نامعلوم (قیمت روز آخر نبود)` : ''}.</p>
      <div class="sl-kpis">
        <div class="kpi"><span>بهترین ${helpIcon('kpi-c-best')}</span><b class="gain">${esc(pl(sum.max))}</b></div>
        <div class="kpi"><span>میانه ${helpIcon('kpi-c-median')}</span><b class="${tone(sum.median)}">${esc(pl(sum.median))}</b><small>صدک ۲۵ تا ۷۵: ${esc(pl(sum.p25))} تا ${esc(pl(sum.p75))}</small></div>
        <div class="kpi"><span>بدترین ${helpIcon('kpi-c-worst')}</span><b class="loss">${esc(pl(sum.min))}</b></div>
        <div class="kpi"><span>مسیرهای سودده ${helpIcon('kpi-c-win')}</span><b>${pct(sum.winRate, 0)}</b></div>
        <div class="kpi"><span>رتبهٔ مسیر من ${helpIcon('kpi-c-rank')}</span><b>${pct(rank, 0)}</b><small>از مسیرها بدتر از مسیر من بودند</small></div>
      </div>
      <h4 class="sl-sub">بادبزن مسیرها ${helpIcon('fan')}</h4>
      <p class="sl-hint">خط‌های کم‌رنگ همهٔ مسیرهای شمرده‌شده‌اند (سبز: سودده، قرمز: زیان‌ده). با تراشه‌ها هر مسیر را اضافه یا حذف کن؛ روی نمودار حرکت کن تا عدد دقیق هر مسیر در هر روز بیاید.</p>
      ${legendChips('fan', [{ key: 'cloud', label: 'ابر همهٔ مسیرها', cls: 'cloud' }, ...fanSeries.map((s) => ({ key: s.key, label: s.label, cls: s.cls }))], hidden.fan)}
      ${lineChart({ id: 'fan', dates, W: FULL, h: 380, series: fanSeries, cloud, hidden: hidden.fan, pctBase: retBase(), pctLabel: 'سرمایهٔ درگیر (وجه تضمین بلوکه‌شده)', label: 'بادبزن سود و زیان همهٔ مسیرها' })}
      <h4 class="sl-sub">توزیع نتیجهٔ نهایی ${helpIcon('hist')}</h4>
      ${histSvg({ base: retBase(), finals: res.paths.map((p) => p.final), markers: [
        { value: mine.final, cls: 'mine', label: 'من' }, { value: base.algo.final, cls: 'algo', label: 'الگوریتم' },
        { value: base.hold.final, cls: 'hold', label: 'نگه‌داشتن' }] })}
      <h4 class="sl-sub">مسیرهای شاخص ${helpIcon('baseline')}</h4>
      <div class="history-table-wrap"><table class="sl-cmp-table">
        <thead><tr><th>مسیر</th><th>نتیجه</th><th>٪ سرمایه</th><th>تعدیل</th><th>پایان</th><th>صدک</th></tr></thead>
        <tbody>${row(`مسیر من (ادامه: ${POLICIES[cmpOpts.policy].label})`, 'mine', mine)}${row('الگوریتم کامل', 'algo', base.algo)}
          ${row('فقط حد سود و ضرر', 'exits', base.exitsOnly)}${row('نگه‌داشتن تا پایان', 'hold', base.hold)}
          ${best ? row('بهترین مسیر', 'best', best) : ''}${worst ? row('بدترین مسیر', 'worst', worst) : ''}</tbody></table></div>
      <div class="section-head sl-sub-head"><h4 class="sl-sub">${cmpOpts.list === 'worst' ? 'ده مسیر بدتر' : 'ده مسیر برتر'} ${helpIcon('top10')}</h4>
        ${seg('cmp-list', cmpOpts.list || 'best', [['best', 'برترها'], ['worst', 'بدترها']])}</div>
      <div class="history-table-wrap"><table class="sl-cmp-table">
        <thead><tr><th>#</th><th>نتیجه</th><th>اقدام‌ها</th><th>تعدیل</th><th>پایان</th><th></th></tr></thead>
        <tbody>${top.map((p, k) => `<tr><td>${faDigits(String(k + 1))}</td><td class="${tone(p.final)}">${esc(pl(p.final))}</td>
          <td class="sl-chips">${choiceChips(p.choices.filter((c) => c.action?.kind !== 'hold'), 10, symOf)}</td><td>${faDigits(String(p.adjustments))}</td><td>${esc(reasonText(p.reason))}</td>
          <td><button type="button" class="ghost sl-mini" data-act="load-path" data-id="${p.id}" title="این مسیر مسیر من شود (مسیر فعلی شاخه می‌شود)">بارگذاری</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function cmpWhatIfHtml() {
    const res = remember(`wi|${JSON.stringify(wiOpts)}|${JSON.stringify(exp.decisions)}|${exp.cursor}|${sig()}`,
      () => whatIfMatrix(ctx, cfgOf(), exp.entry, exp.decisions, { ...wiOpts, fees: fees(), upTo: exp.cursor }));
    if (res.error) return `<p class="note warn">${esc(res.error)}</p>`;
    for (const r of res.rows) r.chosenText = actText(res.base.steps.find((s) => s.i === r.i)?.action);
    const finals = res.rows.flatMap((r) => r.cells.map((c) => c.final)).filter(fin);
    const best = finals.length ? Math.max(...finals) : NaN;
    return `<div class="sl-cmp-controls">
        <div class="sl-field"><span class="sl-field-label">بعد از آن روز</span>${seg('wi-cont', wiOpts.continuation,
          [['algo', 'پیروی از الگوریتم'], ['hold', 'نگه‌داشتن تا پایان'], ['exitsOnly', 'فقط حد سود و ضرر'], ['user', 'همان تصمیم‌های بعدی من']])}</div>
        <div class="sl-field"><span class="sl-field-label">ستون‌ها</span><div class="sl-seg">${Object.entries(BRANCH_OPTIONS).map(([k, t]) => `<label class="sl-seg-item${wiOpts.options.includes(k) ? ' on' : ''}"><input type="checkbox" data-act="wi-opt" value="${k}" ${wiOpts.options.includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></div>
      </div>
      <p class="sl-hint">هر خانه: اگر در آن روز آن گزینه را انتخاب می‌کردی (و تا روز قبل همان تصمیم‌های خودت)، نتیجهٔ نهایی چه می‌شد. خانهٔ قاب‌دار انتخاب خودت است؛ خانهٔ ستاره‌دار بهترین کل جدول. روی روز بزن تا کارت همان روز باز شود.</p>
      ${whatIfHtml({ rows: res.rows, options: wiOpts.options, best, symOf, base: retBase() })}`;
  }

  function cmpEntriesHtml() {
    const S = market.days[0].S;
    const strikes = market.strikes.map((s) => s.strike);
    const ci = strikes.indexOf(Number(exp.entry.call)), pi = strikes.indexOf(Number(exp.entry.put));
    const calls = strikes.slice(Math.max(0, ci - 3), ci + 4).filter((K) => K >= S * 0.97);
    const puts = strikes.slice(Math.max(0, pi - 3), pi + 4).filter((K) => K <= S * 1.03);
    const grid = remember(`entries|${entryPolicy}|${sig()}|${calls.join()}|${puts.join()}`,
      () => puts.map((P) => calls.map((C) => (C < P ? null : { C, P, run: policyRun(entryPolicy, cfgOf(), { call: C, put: P }) }))));
    const all = grid.flat().filter((c) => c && fin(c.run.final)).map((c) => c.run.final);
    const scale = Math.max(1, ...all.map(Math.abs));
    const best = all.length ? Math.max(...all) : NaN;
    return `<div class="sl-cmp-controls"><div class="sl-field"><span class="sl-field-label">مدیریت پس از ورود</span>${seg('entry-policy', entryPolicy, Object.entries(POLICIES).map(([k, p]) => [k, p.label]))}</div></div>
      <p class="sl-hint">اگر روز ورود قیمت‌های اعمال دیگری فروخته بودی. سطر = پوت، ستون = کال، ● ورودِ فعلی. برای شروع آزمایشی تازه با همان ورود، روی خانه بزن.</p>
      <div class="history-table-wrap"><table class="sl-wi-table">
        <thead><tr><th>پوت \\ کال</th>${calls.map((C) => `<th>${strikeFa(C)}${C === Number(exp.entry.call) ? ' ●' : ''}</th>`).join('')}</tr></thead>
        <tbody>${grid.map((rowCells, r) => `<tr><th scope="row">${strikeFa(puts[r])}${puts[r] === Number(exp.entry.put) ? ' ●' : ''}</th>${rowCells.map((c) => {
          if (!c) return '<td class="sl-wi-na">—</td>';
          if (c.run.error) return `<td class="sl-wi-na" data-tip="${esc(c.run.error)}">بی‌قیمت</td>`;
          const lv = fin(c.run.final) ? Math.ceil(Math.min(1, Math.abs(c.run.final) / scale) * 4) : 0;
          const mine = c.C === Number(exp.entry.call) && c.P === Number(exp.entry.put);
          return `<td class="sl-wi ${tone(c.run.final)} lv${lv}${mine ? ' chosen' : ''}${c.run.final === best ? ' best' : ''}">
            <button type="button" class="linklike" data-act="entry-try" data-call="${c.C}" data-put="${c.P}"><b>${esc(pl(c.run.final))}</b>
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
    const label = (key, v) => LAB_CHOICES[key]?.find(([k]) => k === v)?.[1] || faDigits(String(v));
    const rows = SENS.map(([key, title, values, make]) => {
      const cells = values.map((v) => ({ v, run: policyRun('algo', labConfig({ ...cfg, ...(make ? make(v) : { [key]: v }) })), current: cfg[key] === v }));
      const finals = cells.map((c) => c.run.final).filter(fin);
      // ستاره فقط وقتی معنا دارد که مقدارها با هم فرق کنند.
      const top = finals.length && Math.max(...finals) - Math.min(...finals) > 1e-6 ? Math.max(...finals) : NaN;
      return `<tr><th scope="row">${esc(title)}</th>${cells.map((c) => `<td class="sl-sens ${tone(c.run.final)}${c.current ? ' chosen' : ''}${c.run.final === top ? ' best' : ''}">
        <button type="button" class="linklike" data-act="sens-apply" data-key="${key}" data-v="${esc(c.v)}" title="این مقدار در قواعد آزمایش بنشیند">
        <small>${esc(label(key, c.v))}</small><b>${esc(pl(c.run.final))}</b><small>${faDigits(String(c.run.state?.adjustments ?? 0))} تعدیل</small></button></td>`).join('')}</tr>`;
    }).join('');
    return `<p class="sl-hint">هر پارامتر جداگانه عوض می‌شود و بقیه همان قواعد فعلی می‌مانند؛ مدیریت «الگوریتم کامل» است. خانهٔ قاب‌دار مقدار فعلی است؛ با زدن هر خانه، همان مقدار در قواعد آزمایش می‌نشیند.</p>
      <div class="history-table-wrap"><table class="sl-sens-table"><tbody>${rows}</tbody></table></div>`;
  }

  function cmpBranchesHtml() {
    const list = exp.branches || [];
    if (!list.length) return '<p class="note">هنوز شاخه‌ای نداری. با «ذخیره به‌عنوان شاخه»، یا وقتی تصمیم روزی گذشته را عوض می‌کنی، مسیر قبلی این‌جا می‌ماند.</p>';
    return `<p class="sl-hint">شاخه‌ها مسیرهای کامل‌اند (تصمیم‌های ثبت‌شده و برای بقیه «${esc(POLICIES.algo.label)}»). کلید «روی نمودار» شاخه را کنار مسیر خودت روی نمودار سود و زیان می‌کشد.</p>
      <div class="history-table-wrap"><table class="sl-cmp-table"><thead><tr><th>شاخه</th><th>نتیجه</th><th>تصمیم‌ها</th><th>تعدیل</th><th>روی نمودار</th><th></th></tr></thead>
      <tbody>${list.map((b) => {
        const run = planRun(b.decisions, 'algo');
        return `<tr><th scope="row">${esc(b.name)}</th>
          <td class="${tone(run.final)}">${esc(pl(run.final))}</td><td>${faDigits(String(Object.keys(b.decisions).length))}</td>
          <td>${faDigits(String(run.state?.adjustments ?? 0))}</td>
          <td><label class="sl-switch"><input type="checkbox" role="switch" data-act="overlay" data-id="${esc(b.id)}" ${overlayIds.has(b.id) ? 'checked' : ''} aria-label="روی نمودار"><span class="sl-switch-track" aria-hidden="true"></span></label></td>
          <td><button type="button" class="ghost sl-mini" data-act="branch-load" data-id="${esc(b.id)}">بارگذاری</button>
            <button type="button" class="ghost sl-mini" data-act="branch-del" data-id="${esc(b.id)}" title="حذف">✕</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function compareHtml() {
    const tabs = [['paths', '🌿 همهٔ مسیرها'], ['whatif', '🔀 اگر آن روز…'], ['entries', '🎯 ورودهای دیگر'], ['params', '🎚 حساسیت قواعد'], ['branches', `🗂 شاخه‌های من (${faDigits(String((exp.branches || []).length))})`]];
    let body = '';
    try {
      body = cmpTab === 'paths' ? cmpPathsHtml() : cmpTab === 'whatif' ? cmpWhatIfHtml() : cmpTab === 'entries' ? cmpEntriesHtml()
        : cmpTab === 'params' ? cmpParamsHtml() : cmpBranchesHtml();
    } catch (e) {
      logError('مقایسهٔ مسیرهای استرانگل', e);
      body = `<p class="note warn">مقایسه ساخته نشد: ${esc(e.message)}</p>`;
    }
    return `<section class="card sl-compare">
      <div class="section-head"><div><p class="eyebrow">مقایسهٔ احتمالات، این بخش آینده را می‌بیند</p><h3>اگر جور دیگری تصمیم می‌گرفتم؟ ${helpIcon({ paths: 'compare-paths', whatif: 'whatif', entries: 'entries', params: 'params', branches: 'branches' }[cmpTab])}</h3></div></div>
      <div class="sl-tabs" role="tablist">${tabs.map(([id, t]) => `<button type="button" role="tab" class="sl-tab${cmpTab === id ? ' on' : ''}" aria-selected="${cmpTab === id}" data-act="cmp-tab" data-tab="${id}">${esc(t)}</button>`).join('')}</div>
      <div class="sl-cmp-body">${body}</div>
    </section>`;
  }

  // ═════════════════════════ رندر آزمایش ═════════════════════════

  const LAB_TABS = [
    ['decide', '🎯 تصمیم روز'], ['status', '📍 وضعیت معامله'], ['timeline', '🗓 خط زمان و روزها'], ['charts', '📈 نمودارها'],
    ['premium', '💰 پرمیوم'], ['journal', '📒 دفتر روزانه'], ['report', '📋 کارنامه'], ['compare', '🔀 مقایسهٔ مسیرها'], ['rules', '⚙️ قواعد'],
  ];

  /**
   * آزمایش در زیرتب‌ها: هر صفحه یک مفهوم. نوار بالا همیشه هست (نام، وضعیت،
   * سود و زیان، روز، حجم و دکمه‌های اصلی) و زیرش فقط یک پنل. منطق هیچ
   * بخشی عوض نشده؛ فقط جای نمایش.
   */
  function renderLab() {
    if (!market || !ctx) return;
    const keepY = stageY();
    const run = currentRun();
    if (run.error) {
      main.innerHTML = `<section class="card"><h3>آزمایش اجرا نشد</h3><p class="note warn">${esc(run.error)}</p>
        <button type="button" class="btn" data-act="reconfig">بازگشت به تنظیم</button></section>`;
      return;
    }
    const n = market.days.length;
    const upTo = run.done ? n - 1 : run.pending?.i ?? n - 1;
    if (view == null || view > upTo || view < 0) view = run.done ? null : run.pending?.i;
    exp.done = !!run.done;
    exp.final = run.final;
    if (exp.grade && (!run.done || exp.gradeKey !== gradeKeyOf(exp))) { delete exp.grade; delete exp.gradeKey; }
    const cfg = cfgOf();
    const { capital } = capitalOf();
    const lastStep = run.steps[run.steps.length - 1];
    const pnlNow = run.done ? run.final : run.pending?.ev.pnl ?? lastStep.pnl;
    const st = run.done ? run.state : run.pending?.state || lastStep.state;
    const status = run.done ? (st.reason === 'incomplete' ? ['warn', 'نتیجه نامعلوم'] : ['shut', `بسته — ${reasonText(st.reason)}`])
      : run.pending?.ev.straddle ? ['warn', 'استرادل'] : st.adjustments ? ['open', `تعدیل‌شده ×${faDigits(String(st.adjustments))}`] : ['open', 'باز'];
    const dayNo = run.done ? Math.max(0, run.state.closedAt) : run.pending?.i ?? 0;

    let panel = '';
    switch (labTab) {
      case 'status': panel = heroHtml(run); break;
      case 'timeline': panel = `<section class="card sl-time">
        <div class="section-head"><div><p class="eyebrow">خط زمان معامله</p><h3>${esc(dateFa(market.days[0].date))} تا ${esc(dateFa(market.days[n - 1].date))} ${helpIcon('timeline')}</h3></div>
          <div class="sl-legend"><span class="sl-dotkey open"></span>ورود <span class="sl-dotkey hold"></span>نگه‌داشتن <span class="sl-dotkey adjust"></span>تعدیل
          <span class="sl-dotkey close"></span>بستن <span class="sl-dotkey ignored"></span>پیشنهاد نادیده <span class="sl-dotkey missing"></span>بی‌قیمت <span class="sl-dotkey pending"></span>امروز
          <span class="sl-dotkey fill-gain"></span>روز سودده <span class="sl-dotkey fill-loss"></span>روز زیان‌ده</div></div>
        ${timelineHtml({ days: market.days, steps: run.steps, cursor: run.pending?.i, view, done: run.done, closedAt: run.state?.closedAt ?? Infinity, symOf, base: retBase() })}
        ${dayDetailHtml(run, view ?? (run.done ? run.state.closedAt : null))}
      </section>`; break;
      case 'charts': panel = `<section class="card sl-chart-section">
        <div class="section-head"><div><p class="eyebrow">نمودارهای تعاملی</p><h3>روی نمودار حرکت کن؛ عدد و درصد دقیق هر روز می‌آید</h3></div></div>
        ${chartsHtml(run, upTo)}</section>`; break;
      case 'premium': panel = premiumHtml(run, upTo); break;
      case 'journal': panel = journalHtml(run); break;
      case 'report': panel = run.done ? reportHtml(run) : `<section class="card sl-report"><h3>کارنامه ${helpIcon('report')}</h3>
        <p class="note">کارنامه وقتی ساخته می‌شود که معامله تمام شده باشد. تا روز خروج جلو برو، یا «⏭ پیروی از الگوریتم تا پایان» را بزن.</p></section>`; break;
      case 'compare': panel = compareHtml(); break;
      case 'rules': panel = `<section class="card sl-rules-card">
        <div class="section-head"><div><p class="eyebrow">قواعد</p><h3>قواعد الگوریتم و قیمت معامله ${helpIcon('rules')}</h3></div>
          <button type="button" class="ghost" data-act="rules-reset">پیش‌فرض متن الگوریتم</button></div>
        <p class="sl-hint">هر تغییر همان لحظه روی کل آزمایش اعمال می‌شود. تصمیم‌های ثبت‌شده می‌مانند؛ تصمیم‌هایی که «پیشنهاد الگوریتم» بوده‌اند با قواعد تازه دوباره ساخته می‌شوند.</p>
        <div class="sl-rules-grid" id="sl-rules">${rulesFormHtml(cfg, 'lab')}</div></section>`; break;
      default: panel = decisionHtml(run);
    }

    main.innerHTML = `
      <div class="sl-labbar">
        <input class="sl-title-input" id="sl-exp-name" value="${esc(exp.name)}" aria-label="نام آزمایش">
        <span class="pill ${status[0]}">${esc(status[1])}</span>
        <span class="sl-strip-pnl ${tone(pnlNow)}" data-tip="${esc(`سود و زیان ${run.done ? 'نهایی' : 'تا امروزِ آزمایش'}\nدرصد = سود و زیان ÷ سرمایهٔ درگیر (وجه تضمین بلوکه‌شده، همان مبنای بازدهٔ بقیهٔ برنامه): ${money(retBase())}\n${pct(capital > 0 && fin(pnlNow) ? (pnlNow / capital) * 100 : NaN, 2)} از سرمایهٔ تخصیصی`)}">${esc(money(pnlNow, { sign: true }))}
          <small>بازده ${pct(fin(pnlNow) && retBase() > 0 ? (pnlNow / retBase()) * 100 : NaN, 2)} ${helpIcon('strip-pnl')}</small></span>
        <span class="sl-strip-day">روز ${faDigits(String(dayNo))} از ${faDigits(String(n - 1))} ${helpIcon('strip-day')}<small>${esc(shortDateFa(market.days[Math.min(dayNo, n - 1)].date))}</small></span>
        ${qtyHtml(cfg.qty)}
        <span class="sp"></span>
        <button type="button" class="ghost sl-mini" data-act="excel" title="خروجی اکسل روزبه‌روز: قیمت‌ها، اثر هر پا، تصمیم‌ها، گزینه‌های هر روز، پاها و کارنامه">⬇ اکسل</button>
        <button type="button" class="ghost sl-mini" data-act="save-branch" title="نسخهٔ فعلی تصمیم‌ها را برای مقایسه نگه دار">🗂 شاخه</button>
        <button type="button" class="ghost sl-mini" data-act="reconfig">تنظیم دوباره</button>
        <button type="button" class="ghost sl-mini" data-act="restart" title="همهٔ تصمیم‌ها پاک می‌شود؛ مسیر فعلی شاخه می‌شود">↺ از نو</button>
      </div>
      <div class="sl-tabs sl-labtabs" role="tablist">${helpIcon('lab-tabs')}${LAB_TABS.map(([id, t]) => `<button type="button" role="tab" class="sl-tab${labTab === id ? ' on' : ''}${id === 'report' && !run.done ? ' dim' : ''}" aria-selected="${labTab === id}" data-act="lab-tab" data-tab="${id}">${esc(t)}</button>`).join('')}</div>
      <div class="sl-panel" role="tabpanel">${panel}</div>`;
    const node = main.querySelector('.sl-node.viewing, .sl-node.pending');
    const strip = main.querySelector('.sl-timeline');
    if (node && strip) strip.scrollLeft += node.getBoundingClientRect().left - strip.getBoundingClientRect().left - strip.clientWidth / 2;
    restoreY(keepY);
    save();
  }

  // ═════════════════════════ راهنمای هاور ═════════════════════════

  const models = new WeakMap();
  const modelOf = (box) => {
    if (!models.has(box)) {
      try { models.set(box, JSON.parse(box.dataset.model)); } catch { models.set(box, null); }
    }
    return models.get(box);
  };
  const hideTip = () => {
    tipBox.hidden = true;
    for (const line of root.querySelectorAll('.sl-cross')) line.setAttribute('visibility', 'hidden');
    for (const g of root.querySelectorAll('.sl-cross-dots')) g.replaceChildren();
  };
  const placeTip = (html, ev, help = false) => {
    tipBox.innerHTML = html;
    tipBox.classList.toggle('help', help);
    tipBox.hidden = false;
    const pad = 14;
    const w = tipBox.offsetWidth, h = tipBox.offsetHeight;
    let left = ev.clientX + pad, top = ev.clientY + pad;
    if (left + w > window.innerWidth - 8) left = ev.clientX - w - pad;
    if (top + h > window.innerHeight - 8) top = ev.clientY - h - pad;
    tipBox.style.left = `${Math.max(8, left)}px`;
    tipBox.style.top = `${Math.max(8, top)}px`;
  };

  function onMove(ev) {
    const helpEl = ev.target.closest?.('[data-help]');
    if (helpEl && root.contains(helpEl)) { placeTip(`<div class="sl-tip-help">${esc(helpEl.dataset.help)}</div>`, ev, true); return; }
    const box = ev.target.closest?.('.sl-chartbox[data-model]');
    const tipEl = ev.target.closest?.('[data-tip]');
    if (tipEl && root.contains(tipEl) && (!box || tipEl.tagName !== 'svg')) {
      if (box) for (const line of box.querySelectorAll('.sl-cross')) line.setAttribute('visibility', 'hidden');
      placeTip(esc(tipEl.dataset.tip).replace(/\n/g, '<br>'), ev);
      return;
    }
    if (!box) { if (!tipBox.hidden) hideTip(); return; }
    const m = modelOf(box);
    const svg = box.querySelector('svg');
    if (!m || !svg) return;
    const r = svg.getBoundingClientRect();
    const scale = r.width / m.W;
    const xv = (ev.clientX - r.left) / scale;
    const plotW = m.W - m.padL - m.padR;
    const i = Math.max(0, Math.min(m.n - 1, Math.round(((xv - m.padL) / plotW) * (m.n - 1))));
    const x = m.padL + (m.n <= 1 ? plotW / 2 : (i / (m.n - 1)) * plotW);
    const y = (v) => m.padT + (1 - (v - m.lo) / (m.hi - m.lo)) * (m.h - m.padT - m.padB);
    const line = box.querySelector('.sl-cross');
    line.setAttribute('x1', x.toFixed(1)); line.setAttribute('x2', x.toFixed(1)); line.setAttribute('visibility', 'visible');
    const dots = box.querySelector('.sl-cross-dots');
    dots.innerHTML = m.series.filter((s) => s.v[i] != null).map((s) => `<circle class="sl-cross-dot ${esc(s.cls)}" cx="${x.toFixed(1)}" cy="${y(s.v[i]).toFixed(1)}" r="5"/>`).join('');
    // درصد سود و زیان هم کنار هر عدد ریالی، نسبت به مبنای همان نمودار.
    const pctOf = (v, unit) => (unit === 'money' && m.pctBase ? `<small class="${tone(v)}">${esc(pct((v / m.pctBase) * 100, 2))}</small>` : '');
    const rows = [...m.series.map((s) => [s, s.v[i], false]), ...m.bars.map((b) => [b, b.v[i], true])]
      .filter(([, v]) => v != null)
      .map(([s, v, bar]) => `<div class="sl-tip-row">${keySvg(s.cls, bar)}<span>${esc(s.label)}${s.l?.[i] ? ` <small class="sl-tip-sym">${esc(fmt.sym(s.l[i]))}</small>` : ''}</span><b class="${s.unit === 'money' ? tone(v) : ''}">${esc(tipValue(v, s.unit))}</b>${pctOf(v, s.unit)}</div>`).join('');
    const d = m.dates[i];
    const note = m.notes?.[i];
    placeTip(`<div class="sl-tip-head">${esc(dateFa(d))} <small>${esc(dayNameFa(d))}</small></div>${note ? `<div class="sl-tip-note">${esc(note)}</div>` : ''}${rows || '<div class="sl-tip-row">بی‌داده</div>'}${m.pctBase ? `<div class="sl-tip-foot">درصدها نسبت به ${esc(m.pctLabel)}: ${esc(money(m.pctBase))}</div>` : ''}`, ev);
  }

  // ═════════════════════════ کنش‌ها ═════════════════════════

  function snapshotBranch(name) {
    exp.branches = exp.branches || [];
    exp.branches.unshift({ id: uid(), name, decisions: structuredClone(exp.decisions), at: Date.now() });
    exp.branches = exp.branches.slice(0, 30);
  }

  function commitAt(v, action, via) {
    exp.decisions[market.days[v].date] = { ...action, via };
  }

  /**
   * «قیمت انتخابی» خالی شروع نمی‌شود: از پایانیِ همان قراردادها پر می‌شود
   * تا ورود همان لحظه نشکند و صفحه جابه‌جا نشود. کاربر بعد عدد خودش را
   * می‌نویسد. این فقط پیش‌فرضِ فیلد است، نه قیمتی که بی‌خبر جایگزین شود.
   */
  function prefillManual(cfg, entry) {
    if (!market) return;
    const first = market.days[0], last = market.days[market.days.length - 1];
    const fill = (key, day, side) => {
      if (!(cfg[key] > 0) && entry?.[side] != null) {
        const v = day?.[side]?.[entry[side]];
        if (v > 0) cfg[key] = v;
      }
    };
    if (cfg.entryBasis === 'manual') { fill('manualEntryCall', first, 'call'); fill('manualEntryPut', first, 'put'); }
    if (cfg.exitBasis === 'manual') { fill('manualExitCall', last, 'call'); fill('manualExitPut', last, 'put'); }
  }

  function setQty(q) {
    const value = Math.max(1, Math.min(10000, Math.round(Number(q) || 1)));
    if (draft && !exp) { draft.cfg = { ...readRules(main, draft.cfg), qty: value }; makeCtx(); renderSetup(); return; }
    if (exp) { exp.cfg = { ...exp.cfg, qty: value }; makeCtx(); renderLab(); }
  }

  function loadPlan(plan, label) {
    snapshotBranch(label);
    exp.decisions = plan;
    exp.cursor = market.days.length; view = null; choice = null; memo.clear(); renderLab();
  }

  async function startFromDraft() {
    const d = draft;
    const cfg = readRules(main, d.cfg);
    exp = {
      id: uid(), name: main.querySelector('#sl-name')?.value?.trim() || `${d.uaName}`,
      created: Date.now(), updated: Date.now(),
      from: d.from, to: d.to, uaIns: d.uaIns, uaName: d.uaName, expiry: d.expiry,
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
    draft = null; view = null; choice = null; overlayIds = new Set(); legSel = -1; labTab = found.done ? 'report' : 'decide';
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

  function onSeg(group, v) {
    switch (group) {
      case 'cmp-mode': cmpOpts = { ...cmpOpts, mode: v }; break;
      case 'cmp-from': cmpOpts = { ...cmpOpts, from: v }; break;
      case 'cmp-cap': cmpOpts = { ...cmpOpts, cap: Number(v) }; break;
      case 'cmp-policy': cmpOpts = { ...cmpOpts, policy: v }; break;
      case 'cmp-list': cmpOpts = { ...cmpOpts, list: v }; break;
      case 'wi-cont': wiOpts = { ...wiOpts, continuation: v }; break;
      case 'entry-policy': entryPolicy = v; break;
      case 'reveal-policy': exp.revealPolicy = v; break;
      case 'chart-sel': chartSel = v; break;
      case 'edit-mode': editMode = v; break;
      case 'custom-side': choice = { id: 'custom', side: v, strike: '' }; break;
      case 'entry-method':
        draft.cfg = { ...readRules(main, draft.cfg), entryMethod: v };
        makeCtx();
        { const auto = pickEntry(ctx, labConfig(draft.cfg), 0); draft.entry = { call: auto.call, put: auto.put }; }
        renderSetup();
        return;
      default: return;
    }
    renderLab();
  }

  async function onClick(ev) {
    const el = ev.target.closest('[data-act], .sl-hit, .sl-wi-day');
    if (!el || !root.contains(el)) return;
    const act = el.dataset.act || 'view';
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return; // با change رسیدگی می‌شود
    try {
      switch (act) {
        case 'new': newDraft(); renderSaved(); renderSetup(); break;
        case 'open': await openExperiment(el.dataset.id); break;
        case 'dup': {
          const src = store.list.find((x) => x.id === el.dataset.id);
          if (!src) break;
          store.list.unshift({ ...structuredClone(src), id: uid(), name: `${src.name} (رونوشت)`, created: Date.now() });
          writeStore(store); renderSaved();
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
        case 'seg': onSeg(el.dataset.group, el.dataset.v); break;
        case 'toggle-series': {
          const set = hidden[el.dataset.chart] || (hidden[el.dataset.chart] = new Set());
          if (set.has(el.dataset.key)) set.delete(el.dataset.key); else set.add(el.dataset.key);
          renderLab();
          break;
        }
        case 'qty-step': setQty(cfgOf().qty + Number(el.dataset.d)); break;
        case 'lab-tab': labTab = el.dataset.tab; renderLab(); break;
        case 'excel': {
          const run = currentRun();
          const s = settings();
          const cap = capitalOf();
          el.disabled = true;
          const label = el.textContent;
          el.textContent = '⏳ در حال ساخت…';
          try {
            await downloadStrangleExcel({
              ctx, cfg: cfgOf(), exp, run, fees: fees(), params: mparams(), capital: cap.capital, margin: cap.margin, retBase: retBase(),
              grade: run.done && fin(run.final) ? gradeOfRun() : null,
              settingsInfo: { rFree: s.rFree, feeOption: cfgOf().fees ? s.feeOption : 0, feeExercise: cfgOf().fees ? s.feeExercise : 0 },
            });
          } finally { el.disabled = false; el.textContent = label; }
          break;
        }
        case 'goto-step': {
          if (draft && Number(el.dataset.n) <= draft.reach) {
            if (draft.step >= 3) draft.cfg = readRules(main, draft.cfg);
            draft.step = Number(el.dataset.n); renderSetup();
          }
          break;
        }
        case 'load-universe': {
          if (!(draft.to > draft.from)) { renderSetup('تاریخ خروج باید بعد از تاریخ ورود باشد.'); break; }
          draft.uaIns = ''; draft.expiry = 0; market = null;
          busy = 'در حال دریافت فهرست قراردادهای بازه…'; renderSetup();
          try { await fetchUniverse(draft.from, draft.to); busy = ''; draft.step = 2; draft.reach = 2; renderSetup(); }
          catch (e) { busy = ''; logError('فهرست قراردادهای بازه', e); renderSetup(`فهرست قراردادها دریافت نشد: ${e.message}`); }
          break;
        }
        case 'pick-expiry':
          draft.expiry = Number(el.dataset.expiry); draft.reach = 2; market = null; renderSetup(); break;
        case 'load-market': {
          busy = 'در حال دریافت قیمت‌های روزانهٔ پایه و همهٔ قراردادهای این سررسید…'; renderSetup();
          try {
            await loadMarket(draft);
            draft.entry = { call: null, put: null }; draft.step = 3; draft.reach = 4; busy = ''; renderSetup();
          } catch (e) { busy = ''; logError('قیمت‌های روزانهٔ استرانگل', e); renderSetup(`قیمت‌ها دریافت نشد: ${e.message}`); }
          break;
        }
        case 'pick-strike':
          draft.cfg = readRules(main, draft.cfg);
          draft.entry = { ...draft.entry, [el.dataset.side]: Number(el.dataset.strike) };
          renderSetup();
          break;
        case 'auto-entry': {
          draft.cfg = readRules(main, draft.cfg); makeCtx();
          const auto = pickEntry(ctx, labConfig(draft.cfg), 0);
          draft.entry = { call: auto.call, put: auto.put };
          renderSetup();
          break;
        }
        case 'rules-reset':
          if (draft && !exp) { draft.cfg = { ...LAB_DEFAULTS, qty: labConfig(draft.cfg).qty }; makeCtx(); renderSetup(); }
          else if (exp) { exp.cfg = { ...LAB_DEFAULTS, qty: cfgOf().qty }; makeCtx(); renderLab(); }
          break;
        case 'start': await startFromDraft(); break;
        case 'reconfig':
          draft = {
            from: exp.from, to: exp.to,
            uaIns: exp.uaIns, uaName: exp.uaName, expiry: exp.expiry, entry: { ...exp.entry },
            cfg: { ...exp.cfg }, step: 3, reach: 4, search: '', name: exp.name,
          };
          exp = null; makeCtx(); renderSaved(); renderSetup();
          break;
        case 'rules-toggle': exp.rulesOpen = !exp.rulesOpen; renderLab(); break;
        case 'restart':
          if (!window.confirm('همهٔ تصمیم‌ها پاک شود و آزمایش از روز ورود شروع شود؟ مسیر فعلی به‌عنوان شاخه می‌ماند.')) break;
          snapshotBranch(`پیش از شروع دوباره، ${faDigits(String(Object.keys(exp.decisions).length))} تصمیم`);
          exp.decisions = {}; exp.cursor = 1; view = null; choice = null; memo.clear(); renderLab();
          break;
        case 'view': {
          const d = Number(el.dataset.day);
          if (!Number.isFinite(d) || d < 0 || !exp) break;
          const run = currentRun();
          const upTo = run.done ? market.days.length - 1 : run.pending?.i;
          if (d > upTo) break;
          // از هر جا روی یک روز زدی، کارت کامل همان روز در زیرتب خط زمان باز می‌شود.
          view = d; choice = null;
          if (labTab !== 'timeline' && labTab !== 'charts' && labTab !== 'decide') labTab = 'timeline';
          renderLab();
          break;
        }
        case 'goto-decide': labTab = 'decide'; renderLab(); break;
        case 'goto-report': labTab = 'report'; renderLab(); break;
        case 'view-prev': view = Math.max(1, (view ?? exp.cursor) - 1); choice = null; renderLab(); break;
        case 'view-next': view = (view ?? exp.cursor) + 1; choice = null; renderLab(); break;
        case 'view-pending': view = null; choice = null; renderLab(); break;
        case 'choose': choice = { id: el.dataset.id }; renderLab(); break;
        case 'commit': {
          const run = currentRun();
          const v = run.pending?.i;
          if (v == null) break;
          const picked = chosenAction(run, v);
          if (!picked) { window.alert('اول یکی از گزینه‌ها را انتخاب کن.'); break; }
          const imp = impactOf(run.pending.state, v, run.pending.ev, picked.action);
          if (imp.error) { window.alert(imp.error); break; }
          commitAt(v, picked.action, picked.via);
          exp.cursor = v + 1; view = null; choice = null; renderLab();
          break;
        }
        case 'skip-to-trigger':
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
        case 'auto-algo':
          for (let g = 0; g < 500; g += 1) {
            const run = currentRun();
            if (!run.pending) break;
            commitAt(run.pending.i, run.pending.ev.rec.action, 'algo');
            exp.cursor = run.pending.i + 1;
          }
          view = null; choice = null; renderLab();
          break;
        case 'undo': {
          const run = currentRun();
          const target = run.pending ? run.pending.i - 1 : Math.min(run.state?.closedAt ?? exp.cursor, market.days.length - 2);
          if (target < 1) break;
          const date = market.days[target].date;
          for (const d of Object.keys(exp.decisions).map(Number)) if (d >= date) delete exp.decisions[d];
          exp.cursor = target; view = null; choice = null; renderLab();
          break;
        }
        case 'commit-edit': {
          const run = currentRun();
          const v = view;
          const picked = v != null ? chosenAction(run, v) : null;
          if (!picked) { window.alert('اول یکی از گزینه‌ها را انتخاب کن.'); break; }
          const dc = dayContext(run, v);
          const imp = impactOf(dc.st, v, dc.ev, picked.action);
          if (imp.error) { window.alert(imp.error); break; }
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
          if (b) loadPlan(structuredClone(b.decisions), `پیش از بارگذاری «${b.name}»`);
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
          // تصمیم‌های پیش از انشعاب (اگر مقایسه از امروز بود) می‌مانند.
          const keep = cmpOpts.from === 'cursor' ? Object.fromEntries(Object.entries(exp.decisions).filter(([d]) => Number(d) < market.days[exp.cursor]?.date)) : {};
          for (const c of p.choices) keep[c.date] = { ...c.action, via: 'path' };
          loadPlan(keep, 'پیش از بارگذاری مسیر مقایسه');
          break;
        }
        case 'load-best': {
          const b = gradeOfRun().best[Number(el.dataset.k)];
          if (b) loadPlan(structuredClone(b.plan), `پیش از بارگذاری بهترین مسیر ${faDigits(String(Number(el.dataset.k) + 1))}`);
          break;
        }
        case 'cmp-tab': cmpTab = el.dataset.tab; renderLab(); break;
        case 'leg-sel': legSel = Number(el.dataset.k); renderLab(); break;
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
      logError(`استرانگل بازی — ${act}`, e);
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
      if (el.id === 'sl-exp-name') { exp.name = el.value.trim() || exp.name; save(); return; }
      if (act === 'qty-input') { setQty(toEn(el.value)); return; }
      if (el.dataset?.cfg) {
        if (draft && !exp) {
          draft.cfg = readRules(main, draft.cfg);
          prefillManual(draft.cfg, draft.entry);
          draft.rulesOpen = true; makeCtx(); renderSetup();
        }
        else if (exp) { exp.cfg = readRules(main.querySelector('#sl-rules'), exp.cfg); makeCtx(); renderLab(); }
        return;
      }
      if (!act || !exp) return;
      switch (act) {
        case 'custom-strike': choice = { id: 'custom', side: choice?.side || exp.decisions[market.days[view ?? exp.cursor]?.date]?.side || 'put', strike: el.value };
          { const sideBtn = root.querySelector('[data-group="custom-side"].on'); if (sideBtn) choice.side = sideBtn.dataset.v; }
          renderLab(); break;
        case 'reveal': exp.reveal = el.checked; renderLab(); break;
        case 'cmp-opt': {
          const set = new Set(cmpOpts.options);
          if (el.checked) set.add(el.value); else set.delete(el.value);
          if (!set.size) set.add('algo');
          cmpOpts = { ...cmpOpts, options: Object.keys(BRANCH_OPTIONS).filter((k) => set.has(k)) };
          renderLab();
          break;
        }
        case 'wi-opt': {
          const set = new Set(wiOpts.options);
          if (el.checked) set.add(el.value); else set.delete(el.value);
          if (!set.size) set.add('algo');
          wiOpts = { ...wiOpts, options: Object.keys(BRANCH_OPTIONS).filter((k) => set.has(k)) };
          renderLab();
          break;
        }
        case 'overlay': if (el.checked) overlayIds.add(el.dataset.id); else overlayIds.delete(el.dataset.id); renderLab(); break;
        default: break;
      }
    } catch (e) {
      logError(`استرانگل بازی — ${act || el.id}`, e);
    }
  }

  function onInput(ev) {
    const el = ev.target;
    // اسلایدر: عدد کنارش هم‌زمان با کشیدن عوض می‌شود؛ محاسبه با رهاکردن.
    if (el.type === 'range') {
      const key = el.dataset.cfg || (el.dataset.act === 'qty-range' ? 'qty' : '');
      const out = el.closest('.sl-slider, .sl-qty')?.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = showNum(key, el.value);
      return;
    }
    if (el.id !== 'sl-search' || !draft) return;
    draft.search = el.value;
    renderSetup();
    const box = root.querySelector('#sl-search');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  }

  // میان‌بر Enter برای ثبت تصمیم فقط وقتی تمرکز روی هیچ کنترلی نیست. گزارش
  // آزمون ۸۳e5888 مورد ۲۰: Enter روی دکمه، تب یا کلید دیگری تصمیم روز را ثبت
  // می‌کرد؛ Enter روی هر کنترل باید همان کنترل را اجرا کند.
  const INTERACTIVE = 'button, a[href], input, select, textarea, summary, label, [role], [tabindex], [contenteditable], [data-act]';
  function onKey(ev) {
    if (!exp || ev.key !== 'Enter' || ev.target.closest(INTERACTIVE)) return;
    const commit = root.querySelector('[data-act="commit"]');
    if (commit && !commit.disabled) { ev.preventDefault(); commit.click(); }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKey);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', hideTip);

  renderSaved();
  if (store.list.length) await openExperiment(store.list[0].id);
  else { newDraft(); renderSetup(); }

  return () => {
    alive = false;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerleave', hideTip);
  };
}
