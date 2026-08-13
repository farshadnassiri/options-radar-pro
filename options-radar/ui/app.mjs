// پوسته برنامه — مدیر تب و نوار سلامت.
//
// قاعده تب تنبل: ماژول هر تب فقط لحظه اولین کلیک وارد می‌شود و اشتراک
// عکس لحظه‌ای هم فقط برای تب باز برقرار می‌شود. تب بسته، هیچ هزینه‌ای ندارد.

import { defaults } from '/core/settings.mjs';
import { CATALOG, GROUPS as SGROUPS } from '/strategies/catalog.mjs';

export const state = {
  settings: defaults(),
  watch: { at: null, rows: [], byKey: new Map() },
  stream: null,
  subscribers: new Set(),
};

// ————————————————————————————————— تنظیمات —————————————————————————————————

export async function loadSettings() {
  try {
    const r = await fetch('/api/settings');
    state.settings = await r.json();
  } catch { /* پیش‌فرض می‌ماند */ }
  return state.settings;
}

export async function putSettings(next) {
  const r = await fetch('/api/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  });
  if (!r.ok) throw new Error('ذخیره نشد');
  state.settings = await r.json();
  return state.settings;
}

// ————————————————————————————————— اشتراک عکس لحظه‌ای —————————————————————————————————
// یک اتصال پایدار برای کل برنامه. سرور بار اول کل عکس و بعد فقط ردیف تغییرکرده
// می‌فرستد، پس مرورگر هیچ‌وقت پشت یک درخواست شبکه منتظر نمی‌ماند.

const rowKey = (r) => `${r.insCode_C ?? ''}|${r.insCode_P ?? ''}`;

export function subscribeWatch(fn) {
  state.subscribers.add(fn);
  openStream();
  if (state.watch.rows.length) fn(state.watch);
  return () => state.subscribers.delete(fn);
}

function openStream() {
  if (state.stream) return;
  const es = new EventSource('/api/stream');
  state.stream = es;
  es.addEventListener('watch', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.full) {
      state.watch.byKey = new Map(msg.rows.map((r) => [rowKey(r), r]));
    } else {
      for (const r of msg.rows) state.watch.byKey.set(rowKey(r), r);
    }
    state.watch.at = msg.at;
    state.watch.rows = [...state.watch.byKey.values()];
    state.watch.changed = msg.full ? null : msg.rows.length;
    for (const fn of state.subscribers) { try { fn(state.watch); } catch (err) { console.error(err); } }
  });
  es.addEventListener('trouble', (e) => console.warn('دریافت داده:', JSON.parse(e.data).message));
  es.onerror = () => { /* مرورگر خودش دوباره وصل می‌شود */ };
}

// ————————————————————————————————— نوار سلامت —————————————————————————————————

const el = (id) => document.getElementById(id);
let lastReq = null;

async function tickHealth() {
  try {
    const h = await (await fetch('/api/health')).json();
    const m = el('h-market');
    const open = h.market?.open;
    m.textContent = open ? 'بازار باز' : (h.market?.why || 'متوقف');
    m.className = `pill ${open ? 'open' : 'shut'}`;

    el('h-age').textContent = h.watchAgeSec == null ? '—' : `${h.watchAgeSec}s`;
    el('h-rows').textContent = h.watchRows ? h.watchRows.toLocaleString('en-US') : '—';

    const per = lastReq == null ? h.requests : h.requests - lastReq;
    lastReq = h.requests;
    el('h-req').textContent = `${h.requests.toLocaleString('en-US')}${per ? ` (+${per})` : ''}`;

    const hitRate = h.requests + h.cacheHits > 0
      ? Math.round((h.cacheHits / (h.requests + h.cacheHits)) * 100) : 0;
    el('h-cache').textContent = `${hitRate}%`;

    const errEl = el('h-err');
    errEl.textContent = h.errors.toLocaleString('en-US');
    errEl.style.color = h.errors ? 'var(--loss)' : '';
    errEl.title = h.lastError || '';

    el('h-ms').textContent = h.avgUpstreamMs || '—';
  } catch {
    const m = el('h-market');
    m.textContent = 'سرور در دسترس نیست';
    m.className = 'pill down';
  }
}

// ————————————————————————————————— تب‌ها —————————————————————————————————

const TABS = [
  { id: 'settings', title: 'تنظیمات', section: 'پایه', mod: '/ui/tabs/settings.mjs', phase: 1 },
  { id: 'engine', title: 'موتور و نمودار بازده', section: 'پایه', mod: '/ui/tabs/engine.mjs', phase: 2 },
  { id: 'chain', title: 'دیده‌بان زنجیره اختیار', section: 'پایه', mod: '/ui/tabs/chain.mjs', phase: 3 },
];

// تب هر استراتژی از همان فهرست ساخته می‌شود و همه یک ماژول دارند. این نتیجه
// مستقیم آن تصمیم معماری است: چون هیچ استراتژی محاسبه‌گر جدا ندارد، هیچ تبی
// هم رابط جدا لازم ندارد.
for (const [key, label] of Object.entries(SGROUPS)) {
  for (const d of CATALOG.filter((s) => s.group === key)) {
    TABS.push({
      id: d.id, title: d.name, section: label, phase: d.phase, def: d,
      mod: '/ui/tabs/strategy.mjs',
    });
  }
}
TABS.push({ id: 'positions', title: 'موقعیت‌های من', section: 'موقعیت من', phase: 7, mod: '/ui/tabs/positions.mjs' });
TABS.push({ id: 'roll', title: 'تحلیل رول', section: 'موقعیت من', phase: 7, mod: '/ui/tabs/roll.mjs' });

// ————————————————————————————————— فهرست کناری —————————————————————————————————
//
// سی‌وچهار تب در یک ستون، بدون کمک، یعنی پیمایش. سه چیز آن را قابل استفاده
// می‌کند: جست‌وجو که فهرست را کوتاه می‌کند، بخش‌های تاشو که آنچه امروز کار
// نداری را جمع می‌کند، و برچسب جهت هر استراتژی که بدون باز کردن تب می‌گوید
// صعودی است یا نزولی یا خنثی.
//
// حالت تاشو در حافظه مرورگر می‌ماند، وگرنه هر بار باز کردن صفحه از نو
// همان کار دستی را می‌خواهد.

const FOLD_KEY = 'rail:folded';
const loadFolded = () => {
  try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]')); }
  catch { return new Set(); }
};
const folded = loadFolded();
const saveFolded = () => {
  try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch { /* بی‌اهمیت */ }
};

/** جهت هر استراتژی، برای برچسب رنگی کنار نامش. */
function dirTone(def) {
  const d = String(def?.dir || '');
  if (/صعودی/.test(d)) return ['صعودی', 'up'];
  if (/نزولی/.test(d)) return ['نزولی', 'down'];
  if (/خنثی|بی‌جهت/.test(d)) return ['خنثی', 'flat'];
  if (/تلاطم/.test(d)) return ['تلاطم', 'vol'];
  return [null, null];
}

const norm = (s) => String(s || '').replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/‌/g, ' ').trim();

let railQuery = '';

function buildRail() {
  const list = el('rail-list');
  const sections = [...new Set(TABS.map((t) => t.section))];
  const q = norm(railQuery).toLowerCase();

  const matches = (t) => {
    if (!q) return true;
    const hay = norm(`${t.title} ${t.section} ${t.def?.dir || ''} ${t.def?.note || ''}`).toLowerCase();
    return hay.includes(q);
  };

  let shown = 0;
  list.innerHTML = '';
  for (const sec of sections) {
    const tabs = TABS.filter((x) => x.section === sec && matches(x));
    if (!tabs.length) continue;
    shown += tabs.length;

    // جست‌وجو، تاشدگی را موقتاً باز می‌کند — وگرنه نتیجه پیدا شده پنهان می‌ماند
    const isFolded = !q && folded.has(sec);

    const grp = document.createElement('section');
    grp.className = 'rail-group';
    grp.dataset.folded = isFolded ? '1' : '0';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'rail-head';
    head.setAttribute('aria-expanded', isFolded ? 'false' : 'true');
    head.innerHTML = `<span class="caret" aria-hidden="true"></span>
      <span class="rail-head-name">${sec}</span>
      <span class="rail-head-n">${tabs.length}</span>`;
    head.addEventListener('click', () => {
      if (folded.has(sec)) folded.delete(sec); else folded.add(sec);
      saveFolded();
      buildRail();
    });
    grp.appendChild(head);

    const items = document.createElement('div');
    items.className = 'rail-items';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = 'tab-btn';
      b.type = 'button';
      b.dataset.tab = t.id;
      b.dataset.locked = t.mod ? '0' : '1';
      b.setAttribute('aria-current', current === t.id ? 'true' : 'false');
      const infeasible = t.def && !t.def.feasible;
      b.title = infeasible ? t.def.infeasibleWhy : (t.def?.note || t.def?.dir || t.title);
      const [tone, cls] = dirTone(t.def);
      b.innerHTML = `
        <span class="tab-name">${t.title}</span>
        ${infeasible ? '<span class="tab-flag" title="اجرا در تابلو ممکن نیست">⃰</span>' : ''}
        ${tone ? `<span class="tone ${cls}">${tone}</span>` : ''}
        ${t.def?.legs?.length ? `<span class="phase">${t.def.legs.length} پا</span>` : ''}`;
      b.addEventListener('click', () => open(t.id));
      items.appendChild(b);
    }
    grp.appendChild(items);
    list.appendChild(grp);
  }

  if (!shown) {
    list.innerHTML = '<p class="rail-none">چیزی پیدا نشد.</p>';
  }
  el('rail-count').textContent = q ? `${shown} از ${TABS.length}` : `${TABS.length} تب`;
}

let current = null;
let disposer = null;

async function open(id) {
  const t = TABS.find((x) => x.id === id);
  if (!t || current === id) return;
  if (disposer) { try { disposer(); } catch {} disposer = null; }
  current = id;
  for (const b of document.querySelectorAll('.tab-btn')) {
    b.setAttribute('aria-current', b.dataset.tab === id ? 'true' : 'false');
  }
  const stage = el('stage');
  stage.innerHTML = '<div class="empty"><p>در حال باز کردن…</p></div>';
  location.hash = id;

  try {
    const mod = t.mod ? await import(t.mod) : await import('/ui/tabs/soon.mjs');
    stage.innerHTML = '';
    disposer = await mod.mount(stage, { tab: t, state, api: { loadSettings, putSettings, subscribeWatch } });
  } catch (e) {
    stage.innerHTML = `<div class="card"><h3>تب باز نشد</h3><p class="note">${e.message}</p></div>`;
    console.error(e);
  }
}

// ————————————————————————————————— پوسته —————————————————————————————————

function applyTheme(name) {
  document.body.dataset.theme = name;
  localStorage.setItem('theme', name);
}
el('theme-btn').addEventListener('click', () => {
  applyTheme(document.body.dataset.theme === 'ledger' ? 'board' : 'ledger');
});

el('rail-q').addEventListener('input', (e) => {
  railQuery = e.target.value;
  buildRail();
});
// در فهرست فیلترشده، اینتر یعنی «همان یکی که مانده را باز کن»
el('rail-q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const first = el('rail-list').querySelector('.tab-btn');
  if (first) open(first.dataset.tab);
});

// ————————————————————————————————— شروع —————————————————————————————————

applyTheme(localStorage.getItem('theme') || 'ledger');
buildRail();
await loadSettings();
applyTheme(localStorage.getItem('theme') || state.settings.theme || 'ledger');
tickHealth();
setInterval(tickHealth, 3000);

const hash = location.hash.replace('#', '');
if (hash && TABS.some((t) => t.id === hash)) open(hash);
