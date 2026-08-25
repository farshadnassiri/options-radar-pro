// پوسته برنامه — مدیر تب و نوار سلامت.
//
// قاعده تب تنبل: ماژول هر تب فقط لحظه اولین کلیک وارد می‌شود و اشتراک
// عکس لحظه‌ای هم فقط برای تب باز برقرار می‌شود. تب بسته، هیچ هزینه‌ای ندارد.

import { fmt, faDigits, faAgo, faClock, pageTitle, normFa, ltr } from '/ui/fmt.mjs';
import { defaults } from '/core/settings.mjs';
import { CATALOG, GROUPS as SGROUPS } from '/strategies/catalog.mjs';
import { mountCapacityPicker } from '/ui/expiries.mjs';
import { icon, sectionIcon, TAB_ICON, GROUP_ICON } from '/ui/icons.mjs';
import { installGlobalCapture, logError } from '/ui/errlog.mjs';
import { linkLabelKey } from '/ui/feed-state.mjs';
import { takeHandoff } from '/ui/handoff.mjs';
import { installTableEnhance } from '/ui/table-enhance.mjs';

export const state = {
  settings: defaults(),
  watch: { at: null, rows: [], byKey: new Map() },
  stream: null,
  subscribers: new Set(),
  // وضعیت اتصال جریان، برای نوار وضعیت. «آخرین دریافت» ساعت دیواری مرورگر
  // است نه زمان سرور، چون همان چیزی است که کاربر می‌خواهد بداند: از کی تا
  // حالا چیزی تازه نیامده.
  link: { status: 'idle', since: Date.now(), lastData: null },
  // چرا فهرست نماد خالی است. «خالی» یک حالت نیست، سه تاست: هنوز نیامده،
  // نیامد و دلیلش این بود، یا آمد و خودِ تابلو چیزی نداشت. تا وقتی این سه
  // یک شکل دیده می‌شدند، کاربر هیچ راهی نداشت بفهمد باید صبر کند، دوباره
  // بزند، یا اصلاً منتظر نماند.
  feed: { status: 'idle', error: '' },
  feedSubs: new Set(),
  // تحویل بین تب‌ها. تبی که تب دیگری را باز می‌کند، آنچه را کاربر همین حالا
  // انتخاب کرده اینجا می‌گذارد و تب مقصد سر جای خودش برش می‌دارد و پاک
  // می‌کند. از localStorage استفاده نمی‌شود چون این داده عمر یک کلیک دارد.
  handoff: null,
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

/**
 * عکس پشتیبان، برای وقتی که جریان زنده چیزی نمی‌فرستد.
 *
 * حلقه دیده‌بان سرور بیرون از ساعت بازار عمداً پارک می‌شود، پس رویداد
 * `watch` هیچ‌وقت پخش نمی‌شود و `/api/watch` هم آرایه خالی می‌دهد. نتیجه
 * این بود که شب‌ها و روزهای تعطیل، *همهٔ* تب‌ها کور می‌ماندند: فهرست نماد
 * خالی، و پیام «نمادی انتخاب نشده» — بدون اینکه چیزی بگوید چرا.
 *
 * `/api/history/universe` برای همین هست و شب و روز پاسخ می‌دهد. همان
 * ردیف‌های دیده‌بان را می‌دهد، فقط زنده نیست.
 *
 * و چون زنده نیست، برچسب می‌خورد. نشان‌دادن عکس آخرین جلسه به‌جای داده
 * زنده، بدون گفتنش، از خالی‌ماندن بدتر است — کاربر روی قیمتی تصمیم می‌گیرد
 * که دیگر قیمت بازار نیست.
 */
let seeding = null;
/** وضعیت خوراک را می‌نشاند و همه شنونده‌ها را خبر می‌کند. */
function setFeed(status, error = '') {
  if (state.feed.status === status && state.feed.error === error) return;
  state.feed.status = status;
  state.feed.error = error;
  for (const fn of state.feedSubs) { try { fn(state.feed); } catch (err) { console.error(err); } }
  paintLink();
}

export function onFeed(fn) {
  state.feedSubs.add(fn);
  fn(state.feed);
  return () => state.feedSubs.delete(fn);
}

/** تلاش دوباره، بدون اینکه کاربر مجبور باشد تب را ببندد و باز کند. */
export function retryFeed() {
  if (seeding) return seeding;
  state.feed.status = 'idle';
  return seedWatch();
}

function seedWatch() {
  if (seeding || state.watch.rows.length) return seeding;
  setFeed('loading');
  seeding = (async () => {
    try {
      const response = await fetch('/api/history/universe');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
      const rows = payload.rows || [];
      if (state.watch.rows.length) { setFeed('ok'); return; }
      // تابلو پاسخ داد ولی چیزی نداشت. این با «نگرفتیم» یکی نیست و نباید
      // مثل آن دیده شود؛ تلاش دوباره هم دردی از آن دوا نمی‌کند.
      if (!rows.length) { setFeed('empty'); return; }
      state.watch.byKey = new Map(rows.map((r) => [rowKey(r), r]));
      state.watch.rows = rows;
      state.watch.at = payload.at || null;
      state.watch.changed = null;
      state.watch.stale = true;                 // زنده نیست
      setFeed('ok');
      setLink('snapshot');
      for (const fn of state.subscribers) { try { fn(state.watch); } catch (err) { logError('پخش عکس پشتیبان', err); } }
    } catch (err) {
      setFeed('failed', err?.message ? String(err.message) : String(err));
      logError('گرفتن عکس پشتیبان', err);
    } finally { seeding = null; }
  })();
  return seeding;
}

export function subscribeWatch(fn) {
  state.subscribers.add(fn);
  openStream();
  if (state.watch.rows.length) fn(state.watch);
  else seedWatch();
  return () => state.subscribers.delete(fn);
}

function setLink(status) {
  if (state.link.status === status) return;
  state.link.status = status;
  state.link.since = Date.now();
  paintLink();
}

function openStream() {
  if (state.stream) return;
  const es = new EventSource('/api/stream');
  state.stream = es;
  setLink('connecting');
  es.addEventListener('open', () => setLink('live'));
  es.addEventListener('watch', (e) => {
    setLink('live');
    state.link.lastData = Date.now();
    const msg = JSON.parse(e.data);
    if (msg.full) {
      state.watch.byKey = new Map(msg.rows.map((r) => [rowKey(r), r]));
    } else {
      for (const r of msg.rows) state.watch.byKey.set(rowKey(r), r);
    }
    state.watch.at = msg.at;
    state.watch.stale = false;   // داده زنده رسید؛ برچسب عکس پشتیبان برداشته می‌شود
    setFeed('ok');
    state.watch.rows = [...state.watch.byKey.values()];
    state.watch.changed = msg.full ? null : msg.rows.length;
    for (const fn of state.subscribers) { try { fn(state.watch); } catch (err) { console.error(err); } }
  });
  es.addEventListener('trouble', (e) => console.warn('دریافت داده:', JSON.parse(e.data).message));
  // مرورگر خودش دوباره وصل می‌شود؛ کار ما فقط این است که قطعی را پنهان نکنیم
  es.onerror = () => setLink(es.readyState === 2 ? 'down' : 'connecting');
}

// ————————————————————————————————— نوار سلامت —————————————————————————————————

const el = (id) => document.getElementById(id);

const linkKey = () => linkLabelKey({
  rowCount: state.watch.rows.length,
  stale: state.watch.stale,
  feedStatus: state.feed.status,
  linkStatus: state.link.status,
});

const LINK_TEXT = {
  idle: ['بی‌اتصال', 'idle'],
  connecting: ['در حال اتصال', 'wait'],
  live: ['متصل', 'open'],
  down: ['قطع', 'down'],
  // بازار بسته است و آنچه می‌بینی عکس آخرین جلسه است، نه قیمت زنده. این
  // برچسب اختیاری نیست: بدون آن کاربر روی قیمتی تصمیم می‌گیرد که دیگر
  // قیمت بازار نیست و هیچ نشانه‌ای هم نمی‌بیند.
  snapshot: ['عکس آخرین جلسه — زنده نیست', 'wait'],
  // سوکتِ باز با «داده دارم» یکی نیست. وقتی هیچ ردیفی نداریم، «متصل» یک
  // دروغ آرام است: کاربر فهرست خالی را می‌بیند و فکر می‌کند خودش اشتباه
  // می‌کند، نه اینکه داده‌ای نرسیده.
  waiting: ['در انتظار داده', 'wait'],
  nodata: ['داده‌ای نیامد — دفتر خطاها', 'down'],
  blank: ['تابلو خالی است', 'idle'],
};

/**
 * وضعیت اتصال و تازگی داده.
 *
 * جدا از tickHealth است چون منبعش فرق می‌کند: این یکی از جریان مرورگر
 * می‌آید و باید فوری عوض شود، آن یکی هر چند ثانیه از سرور پرسیده می‌شود.
 * قبلاً هیچ‌کدام از این دو نشان داده نمی‌شد و «سن عکس» تنها سرنخ بود — که
 * وقتی اتصال می‌افتاد، بی‌حرکت می‌ماند و چیزی لو نمی‌داد.
 */
function paintLink() {
  const pill = el('h-link');
  if (!pill) return;
  // وضعیت سوکت با تازگی داده یکی نیست. سوکت می‌تواند سالم باز باشد و هیچ
  // داده‌ای نیاید — بیرون از ساعت بازار دقیقاً همین است. اگر آنچه روی صفحه
  // است عکس آخرین جلسه باشد، برچسب باید همان را بگوید، وگرنه «متصل» به
  // کاربر می‌گوید قیمت‌ها زنده‌اند در حالی که نیستند.
  const key = linkKey();
  const [text, cls] = LINK_TEXT[key] || LINK_TEXT.idle;
  pill.textContent = text;
  pill.className = `pill link ${cls}`;
  pill.title = key === 'snapshot'
    ? 'بازار بسته است. این ردیف‌ها از آخرین جلسه‌اند و تغییر نمی‌کنند.'
    : key === 'nodata'
      ? `فهرست نماد خالی ماند: ${state.feed.error || 'دلیل نامعلوم'}`
      : key === 'blank'
        ? 'تابلو پاسخ داد ولی هیچ قراردادی نداشت.'
        : 'وضعیت اتصال جریان داده';

  const fresh = el('h-fresh');
  if (!fresh) return;
  const t = state.link.lastData;
  if (!t) {
    fresh.textContent = '—';
    fresh.removeAttribute('data-stale');
    el('h-fresh-wrap').title = 'هنوز داده‌ای نرسیده';
    return;
  }
  const age = Date.now() - t;
  fresh.textContent = faClock(new Date(t));
  // بیش از دو دقیقه سکوت، در ساعت بازار یعنی یک جای کار می‌لنگد
  fresh.toggleAttribute('data-stale', age > 120000);
  el('h-fresh-wrap').title = `${faAgo(age)} — ${faClock(new Date(t))}`;
}
setInterval(paintLink, 1000);

async function tickHealth() {
  try {
    const h = await (await fetch('/api/health')).json();
    const m = el('h-market');
    const open = h.market?.open;
    m.textContent = open ? 'بازار باز' : (h.market?.why || 'متوقف');
    m.className = `pill ${open ? 'open' : 'shut'}`;

    el('h-rows').textContent = h.watchRows ? fmt.int(h.watchRows) : '—';

    // خطا فقط وقتی دیده می‌شود که وجود داشته باشد. صفرِ همیشگی، جای نوار را
    // می‌گرفت و چشم به آن عادت می‌کرد.
    const errWrap = el('h-err-wrap');
    errWrap.toggleAttribute('hidden', !h.errors);
    el('h-err').textContent = fmt.int(h.errors);
    errWrap.title = h.lastError || 'خطایی ثبت نشده';

  } catch {
    const m = el('h-market');
    m.textContent = 'سرور در دسترس نیست';
    m.className = 'pill down';
    setLink('down');
  }
}

// ————————————————————————————————— تب‌ها —————————————————————————————————

const TABS = [
  { id: 'settings', title: 'تنظیمات', section: 'پایه', mod: '/ui/tabs/settings.mjs', phase: 1 },
  // «دیده‌بان زنجیره» و «برترین موقعیت‌ها» تب مستقل ندارند: هر دو از همان
  // عکس لحظه‌ای بازار تغذیه می‌شوند که «رصد لحظه‌ای» می‌سازد و هر دو یک کار
  // می‌کنند — نگاه کلی پیش از تصمیم. حالا دو حالت از همان تب‌اند و ماژول
  // خودشان همان‌جا تنبل بار می‌شود؛ همان الگویی که «نگاه باز» دارد.
  { id: 'live-market', title: 'رصد لحظه‌ای بازار', section: 'پایه', mod: '/ui/tabs/live-market.mjs', phase: 3 },
  { id: 'history', title: 'تحلیل تاریخی استراتژی', section: 'پایه', mod: '/ui/tabs/history.mjs', phase: 3 },
  // نام تازه، جست‌وجوی قدیمی را نباید بشکند: کاربر ماه‌ها این تب را
  // «بک‌تست سریع» صدا کرده و همان را در جعبهٔ جست‌وجو می‌نویسد.
  { id: 'backtest', title: '🔬 آزمایشگاه آپشن', alias: 'بک‌تست سریع backtest آزمایشگاه اپشن',
    section: 'پایه', mod: '/ui/tabs/backtest.mjs', phase: 3 },
  { id: 'portfolio-backtest', title: 'آزمون همه استراتژی‌ها', section: 'پایه', mod: '/ui/tabs/portfolio-backtest.mjs', phase: 3 },
  // رصد یونانی، تب مستقل است نه پنلی در آزمایشگاه: آزمایشگاه دربارهٔ یک
  // آزمون است و این دربارهٔ یک موقعیت در طول عمرش. کاربری که فقط می‌خواهد
  // حساسیت‌ها را دنبال کند، نباید از میان پانزده پنلِ دیگر رد شود.
  { id: 'greeks-watch', title: '📐 رصد یونانی و تلاطم', alias: 'یونانی گریک دلتا گاما وگا تتا رو تلاطم ضمنی تاریخی greeks',
    section: 'پایه', mod: '/ui/tabs/greeks-watch.mjs', phase: 3 },
  { id: 'bereket', title: '🍲 سفره پر برکت بازار', alias: 'سفر در زمان شبیه‌ساز جلسه تمرین یادگیری بازی گذشته bereket time machine',
    section: 'پایه', mod: '/ui/tabs/bereket.mjs', phase: 3 },
  { id: 'logs', title: 'دفتر خطاها', section: 'پایه', mod: '/ui/tabs/logs.mjs', phase: 1 },
];

// تب هر استراتژی از همان فهرست ساخته می‌شود و همه یک ماژول دارند. این نتیجه
// مستقیم آن تصمیم معماری است: چون هیچ استراتژی محاسبه‌گر جدا ندارد، هیچ تبی
// هم رابط جدا لازم ندارد.
for (const [key, label] of Object.entries(SGROUPS)) {
  for (const d of CATALOG.filter((s) => s.group === key)) {
    TABS.push({
      id: d.id, title: d.name, section: label, phase: d.phase, def: d,
      group: key, mod: '/ui/tabs/strategy.mjs',
    });
  }
}
TABS.push({ id: 'positions', title: 'موقعیت‌های من', section: 'موقعیت من', phase: 7, mod: '/ui/tabs/positions.mjs' });
TABS.push({ id: 'roll', title: 'تحلیل رول', section: 'موقعیت من', phase: 7, mod: '/ui/tabs/roll.mjs' });

// ————————————————————————————————— فهرست کناری —————————————————————————————————
//
// چهل‌ویک تب در یک ستون، بدون کمک، یعنی پیمایش. سه چیز آن را قابل استفاده
// می‌کند: جست‌وجو که فهرست را کوتاه می‌کند، بخش‌های تاشو که آنچه امروز کار
// نداری را جمع می‌کند، و برچسب جهت هر استراتژی که بدون باز کردن تب می‌گوید
// صعودی است یا نزولی یا خنثی.
//
// حالت تاشو در حافظه مرورگر می‌ماند، وگرنه هر بار باز کردن صفحه از نو
// همان کار دستی را می‌خواهد.

const FOLD_KEY = 'rail:folded';
const ORDER_KEY = 'rail:order';
const COLLAPSED_KEY = 'rail:collapsed';

/**
 * وضعیت تاشدگی گروه‌های ریل.
 */
const loadFolded = (allSections) => {
  let raw = null;
  try { raw = localStorage.getItem(FOLD_KEY); } catch { raw = null; }
  if (raw == null) return new Set(allSections);
  try { return new Set(JSON.parse(raw)); } catch { return new Set(allSections); }
};
const ALL_SECTIONS = [...new Set(TABS.map((t) => t.section))];
const folded = loadFolded(ALL_SECTIONS);
const saveFolded = () => {
  try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch { /* بی‌اهمیت */ }
};

const loadGroupOrder = (defaultSections) => {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return defaultSections;
    const ordered = JSON.parse(raw);
    if (!Array.isArray(ordered)) return defaultSections;
    const missing = defaultSections.filter((s) => !ordered.includes(s));
    const valid = ordered.filter((s) => defaultSections.includes(s));
    return [...valid, ...missing];
  } catch {
    return defaultSections;
  }
};

const saveGroupOrder = (order) => {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* بی‌اهمیت */ }
};

let isRailCollapsed = false;
try { isRailCollapsed = localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch {}

function updateRailCollapsed() {
  const shell = el('shell');
  const toggleBtn = el('rail-toggle-btn');
  if (shell) shell.setAttribute('data-rail-collapsed', isRailCollapsed ? 'true' : 'false');
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', isRailCollapsed ? 'false' : 'true');
    toggleBtn.classList.toggle('active', !isRailCollapsed);
    // همان یک دکمه هر دو جهت را می‌گیرد، پس نامش باید کاری را بگوید که
    // کلیک بعدی انجام می‌دهد، نه حالتی را که الان در آن هستیم.
    const label = isRailCollapsed ? 'باز کردن پنل استراتژی‌ها' : 'جمع کردن پنل استراتژی‌ها';
    toggleBtn.title = label;
    toggleBtn.setAttribute('aria-label', label);
  }
  if (isRailCollapsed) {
    closeSubmenu();
  }
  try { localStorage.setItem(COLLAPSED_KEY, isRailCollapsed ? 'true' : 'false'); } catch {}
}

function toggleRail(force) {
  isRailCollapsed = typeof force === 'boolean' ? force : !isRailCollapsed;
  updateRailCollapsed();
}

/**
 * فقط یک بخش هم‌زمان باز می‌ماند.
 */
function revealSection(sec) {
  for (const other of ALL_SECTIONS) {
    if (other !== sec) folded.add(other);
  }
  folded.delete(sec);
}

/**
 * رنگ هر بخش ریل — همه از توکن‌های خودِ پوسته.
 */
const SECTION_TONE = {
  'پایه': '--accent',
  'کسب درآمد': '--gain',
  'اسپرد عمودی': '--cmp3',
  'اسپرد تقویمی': '--cmp1',
  'تلاطم': '--warn',
  'باترفلای و کندور': '--cmp4',
  'نسبت و بک‌اسپرد': '--loss',
  'پوشش ریسک': '--gain',
  'آربیتراژ و همبستگی': '--cmp2',
  'موقعیت من': '--accent-2',
};

/**
 * نام بخش، به شکلی که در گزینشگر CSS بنشیند.
 */
const cssId = (text) => [...String(text)].map((ch) => ch.codePointAt(0).toString(36)).join('-');

/** جهت هر استراتژی — یک نقطهٔ رنگی کنار نام، با عنوان راهنما. */
function dirTone(def) {
  const d = String(def?.dir || '');
  if (/صعودی/.test(d)) return ['صعودی', 'up'];
  if (/نزولی/.test(d)) return ['نزولی', 'down'];
  if (/خنثی|بی‌جهت/.test(d)) return ['خنثی', 'flat'];
  if (/تلاطم/.test(d)) return ['تلاطم', 'vol'];
  return [null, null];
}

let railQuery = '';
let railActiveId = null;
let activeSubmenuSec = null;

function closeSubmenu() {
  activeSubmenuSec = null;
  const sub = el('rail-submenu');
  if (sub) sub.hidden = true;
  const list = el('rail-list');
  if (list) {
    for (const grp of list.querySelectorAll('.rail-group')) {
      grp.removeAttribute('data-open');
      grp.querySelector('.rail-head')?.setAttribute('aria-expanded', 'false');
    }
  }
}

function openSubmenu(sec, headEl) {
  const sub = el('rail-submenu');
  if (!sub) return;
  activeSubmenuSec = sec;

  const list = el('rail-list');
  if (list) {
    for (const grp of list.querySelectorAll('.rail-group')) {
      const isOpen = grp.dataset.secRaw === sec;
      grp.toggleAttribute('data-open', isOpen);
      grp.querySelector('.rail-head')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  }

  const q = normFa(railQuery).toLowerCase();
  const matches = (t) => {
    if (!q) return true;
    const hay = normFa(`${t.title} ${t.alias || ''} ${t.def?.fa || ''} ${t.section} ${t.def?.dir || ''} ${t.def?.note || ''}`).toLowerCase();
    return hay.includes(q);
  };
  const tabs = TABS.filter((x) => x.section === sec && matches(x));

  const toneVar = SECTION_TONE[sec] || '--accent';
  sub.style.setProperty('--sec', `var(${toneVar})`);
  sub.hidden = false;

  const chipIcon = sectionIcon(sec, tabs[0]?.group);
  sub.innerHTML = `
    <div class="rail-submenu-head">
      <span class="rail-submenu-chip">${icon(chipIcon, 'ic rail-head-ic')}</span>
      <span class="rail-submenu-title">${sec}</span>
      <span class="rail-submenu-count">${faDigits(tabs.length)} تب</span>
      <button type="button" class="rail-submenu-close" id="rail-sub-close" title="بستن">✕</button>
    </div>
    <div class="rail-submenu-list" id="rail-sub-list"></div>
  `;

  sub.querySelector('#rail-sub-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeSubmenu();
  });

  const listEl = sub.querySelector('#rail-sub-list');
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
    const glyph = t.def ? GROUP_ICON[t.group] : TAB_ICON[t.id];
    b.innerHTML = `
      ${icon(glyph, 'ic tab-ic')}
      <span class="tab-name">${ltr(t.title)}</span>
      ${infeasible ? '<span class="tab-flag" title="اجرا در تابلو ممکن نیست">⃰</span>' : ''}
      ${tone ? `<span class="tone-dot ${cls}" title="${tone}"></span>` : ''}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      open(t.id);
    });
    listEl.appendChild(b);
  }

  // موقعیت‌دهی در سمت چپ ریل در چیدمان راست‌به‌چپ
  const rect = headEl.getBoundingClientRect();
  const rightPos = Math.max(12, window.innerWidth - rect.left + 10);
  const topPos = Math.max(12, Math.min(rect.top - 4, window.innerHeight - 380));
  sub.style.top = `${topPos}px`;
  sub.style.right = `${rightPos}px`;
}

/** برجستگی صفحه‌کلید را روی دکمه‌ی متناظر می‌گذارد و در دید نگه می‌دارد. */
function setRailActive(id) {
  railActiveId = id;
  const list = el('rail-submenu');
  if (list && !list.hidden) {
    for (const b of list.querySelectorAll('.tab-btn')) {
      b.setAttribute('data-kbd-active', b.dataset.tab === id ? '1' : '0');
    }
  }
}

function buildRail() {
  const list = el('rail-list');
  const allSecs = [...new Set(TABS.map((t) => t.section))];
  const sections = loadGroupOrder(allSecs);
  const q = normFa(railQuery).toLowerCase();

  const matches = (t) => {
    if (!q) return true;
    const hay = normFa(`${t.title} ${t.alias || ''} ${t.def?.fa || ''} ${t.section} ${t.def?.dir || ''} ${t.def?.note || ''}`).toLowerCase();
    return hay.includes(q);
  };

  let shown = 0;
  list.innerHTML = '';
  for (const sec of sections) {
    const tabs = TABS.filter((x) => x.section === sec && matches(x));
    if (!tabs.length) continue;
    shown += tabs.length;

    const isOpen = activeSubmenuSec === sec;
    const grp = document.createElement('section');
    grp.className = 'rail-group';
    grp.dataset.secRaw = sec;
    grp.dataset.section = cssId(sec);
    if (isOpen) grp.setAttribute('data-open', '1');
    grp.style.setProperty('--sec', `var(${SECTION_TONE[sec] || '--accent'})`);

    // دراگ و دراپ برای جابجایی ردیف‌های منوی راست
    grp.draggable = true;
    grp.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', sec);
      e.dataTransfer.effectAllowed = 'move';
      grp.classList.add('dragging');
    });
    grp.addEventListener('dragend', () => {
      grp.classList.remove('dragging');
      list.querySelectorAll('.rail-group').forEach((g) => g.classList.remove('drag-over'));
    });
    grp.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      grp.classList.add('drag-over');
    });
    grp.addEventListener('dragleave', () => {
      grp.classList.remove('drag-over');
    });
    grp.addEventListener('drop', (e) => {
      e.preventDefault();
      grp.classList.remove('drag-over');
      const srcSec = e.dataTransfer.getData('text/plain');
      if (srcSec && srcSec !== sec) {
        const curOrder = loadGroupOrder(allSecs);
        const srcIdx = curOrder.indexOf(srcSec);
        const dstIdx = curOrder.indexOf(sec);
        if (srcIdx !== -1 && dstIdx !== -1) {
          curOrder.splice(srcIdx, 1);
          curOrder.splice(dstIdx, 0, srcSec);
          saveGroupOrder(curOrder);
          buildRail();
          if (activeSubmenuSec) {
            const targetHead = list.querySelector(`.rail-group[data-sec-raw="${activeSubmenuSec}"] .rail-head`);
            if (targetHead) openSubmenu(activeSubmenuSec, targetHead);
          }
        }
      }
    });

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'rail-head';
    head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    head.innerHTML = `
      <span class="rail-head-grip" title="جابجایی ترتیب">${icon('grip', 'ic rail-grip-ic')}</span>
      ${icon('chevron', 'ic caret')}
      <span class="rail-head-chip">${icon(sectionIcon(sec, tabs[0]?.group), 'ic rail-head-ic')}</span>
      <span class="rail-head-name">${sec}</span>
      <span class="rail-head-n">${faDigits(tabs.length)}</span>`;

    head.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeSubmenuSec === sec) {
        closeSubmenu();
      } else {
        revealSection(sec);
        saveFolded();
        openSubmenu(sec, head);
      }
    });
    grp.appendChild(head);
    list.appendChild(grp);
  }

  if (!shown) {
    list.innerHTML = '<p class="rail-none">چیزی پیدا نشد.</p>';
  }
  el('rail-count').textContent = q
    ? `${faDigits(shown)} از ${faDigits(TABS.length)}`
    : `${faDigits(TABS.length)} تب`;

  if (activeSubmenuSec) {
    const activeHead = list.querySelector(`.rail-group[data-sec-raw="${activeSubmenuSec}"] .rail-head`);
    if (activeHead) openSubmenu(activeSubmenuSec, activeHead);
    else closeSubmenu();
  }
}

let current = null;
let disposer = null;
// شمارنده نسل — کلیک تب دوم پیش از تمام شدن import/mount تب اول، بدون این
// می‌توانست بعداً دیرتر برگردد و روی stage/hash/عنوانِ تب دومِ درستی که
// کاربر واقعاً می‌بیند بنشیند: فهرست کناری تب دوم را روشن نشان می‌داد ولی
// کاربر محتوای تب اول را می‌دید. هر تلاش نسل خودش را می‌گیرد؛ هر جا از یک
// await برگشت، اگر دیگر جدیدترین نیست، بی‌صدا کنار می‌کشد.
let openGen = 0;

async function open(id) {
  const t = TABS.find((x) => x.id === id);
  if (!t || current === id) return;
  // گروه‌ها پیش‌فرض بسته‌اند، پس تبی که از بیرون باز می‌شود — پیوند مستقیم،
  // تعویض از تب دیگر، انتقال به بک‌تست — می‌تواند در گروهی بسته گم بماند.
  // باز کردن گروهش ذخیره نمی‌شود: تصمیمِ کاربر نبوده، پس نباید جای تصمیم او
  // بنشیند.
  if (folded.has(t.section)) { revealSection(t.section); buildRail(); }
  const gen = ++openGen;
  if (disposer) { try { disposer(); } catch {} disposer = null; }
  current = id;
  for (const b of document.querySelectorAll('.tab-btn')) {
    b.setAttribute('aria-current', b.dataset.tab === id ? 'true' : 'false');
  }
  const stage = el('stage');
  stage.innerHTML = '<div class="empty"><p>در حال باز کردن…</p></div>';
  stage.scrollTop = 0;
  location.hash = id;
  document.title = pageTitle(t.title);

  // زیر ۸۲۰ پیکسل (همان مرز style.css) فهرست کناری بالای محتوا می‌نشیند؛
  // کلیک روی تبی که پایین فهرست بلند است، بدون این خط کاربر را همان‌جا
  // پایین رها می‌کرد و محتوای تازه از دید بیرون می‌ماند. بعد از رسیدن
  // محتوای واقعی صدا زده می‌شود، نه روی اسکلت خالی — تا آن وقت صفحه هنوز
  // آن‌قدر بلند نشده که stage واقعاً بتواند بالای دید بنشیند.
  // `stage` خودش جعبهٔ پیمایش است (`overflow: auto`)، پس `scrollIntoView`
  // روی آن، پیمایش داخلی‌اش را صفر نمی‌کند. تبی که باز می‌شود باید از سطر
  // اول شروع شود، نه از جایی که تب قبلی رهایش کرده بود.
  const scrollToStage = () => {
    stage.scrollTop = 0;
    if (window.matchMedia('(max-width: 820px)').matches) {
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  try {
    const mod = t.mod ? await import(t.mod) : await import('/ui/tabs/soon.mjs');
    if (gen !== openGen) return; // تب دیگری وسط import کلیک شد؛ این تلاش کهنه است
    stage.innerHTML = '';
    const d = await mod.mount(stage, { tab: t, state, api: { loadSettings, putSettings, subscribeWatch, onFeed, retryFeed } });
    if (gen !== openGen) { try { d?.(); } catch {} return; } // وسط mount هم کهنه شد؛ بی‌صدا خودش را جمع می‌کند
    disposer = d;
    scrollToStage();
  } catch (e) {
    if (gen !== openGen) return; // خطای یک تلاش کهنه، دیگر ربطی به تب باز فعلی ندارد
    logError(`باز کردن تب ${id}`, e);
    stage.innerHTML = `<div class="card"><h3>تب باز نشد</h3><p class="note">${e.message}</p></div>`;
    console.error(e);
    scrollToStage();
    // اگر current همین‌جا بماند، گارد بالای این تابع کلیک بعدی روی همین تب
    // را بی‌اثر می‌کند — تبی که یک‌بار خطا داد، برای همیشه غیرقابل‌بازکردن
    // می‌ماند تا کاربر خودش تب دیگری را باز و بسته کند
    current = null;
  }
}

// ————————————————————————————————— پوسته —————————————————————————————————

// نام‌ها همان برچسب‌های core/settings.mjs (گزینه theme) هستند — یک منبع
// برای دو جا. دکمه قبلاً همیشه فقط «پوسته» می‌گفت؛ بدون کلیک هیچ راهی
// نبود بفهمی الان در کدام پوسته‌ای یا کلیک بعدی کدام را باز می‌کند.
const THEME_NAME = { ledger: 'دفتر', board: 'تابلو' };
const THEME_NEXT = { ledger: 'board', board: 'ledger' };

function applyTheme(name) {
  document.body.dataset.theme = name;
  // حافظه خصوصی/محدودشده مرورگر می‌تواند پرتاب کند؛ اگر همین‌جا بی‌نگهبان
  // بترکد، خط‌های زیرش (به‌روزرسانی برچسب دکمه) هرگز اجرا نمی‌شوند — پوسته
  // بصری عوض می‌شود ولی دکمه همچنان وضعیت قبلی را نشان می‌دهد
  try { localStorage.setItem('theme', name); } catch { /* حافظه پر یا قفل */ }
  const btn = el('theme-btn');
  btn.textContent = `پوسته: ${THEME_NAME[name] || name}`;
  btn.title = `تعویض به پوسته ${THEME_NAME[THEME_NEXT[name]] || ''}`;
}

el('theme-btn').addEventListener('click', () => {
  applyTheme(document.body.dataset.theme === 'ledger' ? 'board' : 'ledger');
});

// تنها دکمهٔ جمع/باز پنل — روی نوار جمع‌شده هم همین یکی می‌ماند
el('rail-toggle-btn').addEventListener('click', () => toggleRail());

// بستن زیرمنو با کلیک بیرون
document.addEventListener('click', (e) => {
  if (!e.target.closest('.rail') && !e.target.closest('.rail-submenu')) {
    closeSubmenu();
  }
});

// بستن زیرمنو با اسکرول ریل
el('rail')?.addEventListener('scroll', () => {
  if (activeSubmenuSec) closeSubmenu();
}, { passive: true });

el('rail-q').addEventListener('input', (e) => {
  railQuery = e.target.value;
  buildRail();
});

// میان‌بر صفحه‌کلید: بالا و پایین بین تب‌های فیلترشده، اینتر همان یکی را باز
// می‌کند. آیتم برجسته با شناسه نگه داشته می‌شود نه اندیس، چون فهرست با هر
// تایپ از نو ساخته می‌شود.
el('rail-q').addEventListener('keydown', (e) => {
  const visible = [...el('rail-list').querySelectorAll('.tab-btn')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!visible.length) return;
    let idx = visible.findIndex((b) => b.dataset.tab === railActiveId);
    idx = e.key === 'ArrowDown'
      ? Math.min(idx < 0 ? 0 : idx + 1, visible.length - 1)
      : Math.max(idx < 0 ? visible.length - 1 : idx - 1, 0);
    setRailActive(visible[idx].dataset.tab);
    return;
  }
  if (e.key !== 'Enter') return;
  const target = visible.find((b) => b.dataset.tab === railActiveId) || visible[0];
  if (target) open(target.dataset.tab);
});

// `/` یا Ctrl+K نشانگر را داخل جست‌وجوی فهرست می‌برد، هرجای صفحه که باشی —
// جز وقتی همین حالا داخل یک ورودی دیگر تایپ می‌کنی، وگرنه «/» در آن ورودی
// نوشته نمی‌شود.
document.addEventListener('keydown', (e) => {
  const isCombo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
  if (!isCombo && e.key !== '/') return;
  const t = document.activeElement;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (e.key === '/' && typing) return;
  e.preventDefault();
  const q = el('rail-q');
  q.focus();
  q.select();
});

// ————————————————————————————————— شروع —————————————————————————————————

const getTheme = () => { try { return localStorage.getItem('theme'); } catch { return null; } };

installGlobalCapture();

document.addEventListener('wheel', (event) => {
  const select = event.target?.closest?.('select');
  if (select && document.activeElement === select) select.blur();
}, { passive: true, capture: true });

applyTheme(getTheme() || 'ledger');
updateRailCollapsed();
buildRail();
await loadSettings();
applyTheme(getTheme() || state.settings.theme || 'ledger');
tickHealth();
setInterval(tickHealth, 3000);

// سورت و جابه‌جایی ستون، یک‌بار برای همهٔ جدول‌های برنامه.
//
// روی `stage` می‌نشیند نه روی تک‌تک جدول‌ها: جدول‌ها با هر به‌روزرسانی از نو
// ساخته می‌شوند و شنونده‌ای که رویشان باشد با خودشان پاک می‌شود.
installTableEnhance(el('stage'));

mountCapacityPicker(el('capacity'), {
  getSettings: () => state.settings,
  putSettings,
});

// نشانی دو شکل دارد: `#tab` ساده، و `#tab!token` که token کلید یک‌بارمصرفِ
// نقشهٔ انتقال در حافظهٔ مرورگر است. نقشه پیش از باز شدن تب برداشته می‌شود
// تا `mount` همان تب آن را سرجایش ببیند، و کلید از نشانی پاک می‌شود تا
// نوسازی صفحه دوباره همان انتقال را اجرا نکند.
function routeFromHash(raw) {
  const text = String(raw || '').replace('#', '');
  if (!text) return null;
  const at = text.indexOf('!');
  const id = at < 0 ? text : text.slice(0, at);
  const token = at < 0 ? '' : text.slice(at + 1);
  return TABS.some((t) => t.id === id) ? { id, token } : null;
}

function goRoute(route) {
  if (!route) return;
  if (route.token) {
    const plan = takeHandoff(route.token);
    if (plan) state.handoff = plan;
    history.replaceState(null, '', `${location.pathname}${location.search}#${route.id}`);
  }
  if (route.id !== current) open(route.id);
}

window.addEventListener('hashchange', () => { goRoute(routeFromHash(location.hash)); });

goRoute(routeFromHash(location.hash));
