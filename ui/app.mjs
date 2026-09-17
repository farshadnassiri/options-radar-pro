// پوسته برنامه — مدیر تب و نوار سلامت.
//
// قاعده تب تنبل: ماژول هر تب فقط لحظه اولین کلیک وارد می‌شود و اشتراک
// عکس لحظه‌ای هم فقط برای تب باز برقرار می‌شود. تب بسته، هیچ هزینه‌ای ندارد.

import { fmt, faAgo, faClock, pageTitle, ltr } from '/ui/fmt.mjs';
import { defaults } from '/core/settings.mjs';
import { CATALOG, GROUPS as SGROUPS } from '/strategies/catalog.mjs';
import { mountCapacityPicker } from '/ui/expiries.mjs';
import { icon, TAB_ICON } from '/ui/icons.mjs';
import { installGlobalCapture, logError } from '/ui/errlog.mjs';
import { linkLabelKey } from '/ui/feed-state.mjs';
import { takeHandoff } from '/ui/handoff.mjs';
import { installTableEnhance } from '/ui/table-enhance.mjs';
import {
  SETTINGS_CHANGED_EVENT, changedSettingKeys, createSettingsSaver,
} from '/ui/settings-sync.mjs';

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
  feed: { status: 'idle', error: '', note: '', asOf: 0 },
  feedSubs: new Set(),
  // تحویل بین تب‌ها. تبی که تب دیگری را باز می‌کند، آنچه را کاربر همین حالا
  // انتخاب کرده اینجا می‌گذارد و تب مقصد سر جای خودش برش می‌دارد و پاک
  // می‌کند. از localStorage استفاده نمی‌شود چون این داده عمر یک کلیک دارد.
  handoff: null,
};

const announceSettings = (previous, next) => {
  const keys = changedSettingKeys(previous, next);
  if (!keys.length) return;
  document.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: { keys, settings: next } }));
};

const settingsSaver = createSettingsSaver({
  get: () => state.settings,
  set: (value) => { state.settings = value; },
  notify: announceSettings,
  write: async (next) => {
    const response = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!response.ok) throw new Error('ذخیره نشد');
    return response.json();
  },
});

// ————————————————————————————————— تنظیمات —————————————————————————————————

export async function loadSettings() {
  // اجرای محاسبه‌ای که بلافاصله پس از تیک می‌آید، نخست منتظر همان ذخیره
  // می‌ماند. این انتظار محلی است و درخواست نامرتبطی را کند نمی‌کند.
  await settingsSaver.idle();
  const revision = settingsSaver.revision();
  try {
    const r = await fetch('/api/settings');
    const loaded = await r.json();
    // اگر در فاصلهٔ GET کاربر تنظیم تازه‌ای زد، پاسخ قدیمی آن را پس نزند.
    if (revision === settingsSaver.revision()) {
      const previous = state.settings;
      state.settings = loaded;
      announceSettings(previous, loaded);
    }
  } catch { /* پیش‌فرض می‌ماند */ }
  return state.settings;
}

export const putSettings = (next) => settingsSaver.save(next);

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
function setFeed(status, error = '', { note = '', asOf = 0 } = {}) {
  if (state.feed.status === status && state.feed.error === error
    && state.feed.note === note && state.feed.asOf === asOf) return;
  state.feed.status = status;
  state.feed.error = error;
  // برچسبِ منبع همراه وضعیت می‌رود. سرور وقتی تابلوی زنده نرسیده و از
  // بایگانی جواب داده، همین را در `note` می‌گوید؛ اگر اینجا دور ریخته شود
  // کاربر فهرست روزِ دیگری را به‌جای امروز می‌بیند و نمی‌فهمد.
  state.feed.note = note;
  state.feed.asOf = asOf;
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
      setFeed('ok', '', {
        note: payload.boardUnavailable ? String(payload.note || '') : '',
        asOf: payload.boardUnavailable ? Number(payload.asOf) || 0 : 0,
      });
      setLink('snapshot');
      for (const fn of state.subscribers) { try { fn(state.watch); } catch (err) { logError('پخش عکس پشتیبان', err); } }
    } catch (err) {
      // جملهٔ فارسی اول می‌آید و جزئیات فنی پشتش می‌ماند. پیش از این تنها
      // چیزی که کاربر می‌دید `Error: HTTP 403` بود؛ نه می‌گفت چه نرسیده، نه
      // اینکه با دکمهٔ تلاش دوباره چه باید کرد.
      const detail = err?.message ? String(err.message) : String(err);
      setFeed('failed', `فهرست نمادها نه از تابلوی زنده آمد نه از بایگانی — ${detail}`);
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
    // «کدام سرویس» کنارِ «چند خطا». پیش از این فقط آخرین پیام بود، و پیامِ
    // «HTTP 502» بدونِ نامِ سرویس هیچ کاری با آدم نمی‌کند.
    const worst = h.worstEndpoint;
    errWrap.title = [
      h.lastError || 'خطایی ثبت نشده',
      worst ? `بیشترین خطا: ${worst.family} — ${fmt.int(worst.errors)} از ${fmt.int(worst.requests)} درخواست` : '',
    ].filter(Boolean).join('\n');

    // ═══ سکوتِ خطرناک: بازار باز، خطا صفر، عکس چهار دقیقه کهنه ═══
    //
    // گزارش بازآزماییِ ۱۴۰۵/۰۶/۱۶: پس از بازکردن هم‌زمان مقصدهای تاریخی،
    // `watchAgeSec` به ۲۹۰ ثانیه رسید در حالی که `paused=false` و
    // `watchConsecutiveFails=0` بود. هیچ شمارنده‌ای دروغ نمی‌گفت؛ فقط
    // هیچ‌کدام این سؤال را نمی‌پرسیدند. حالا سرور خودش حکم می‌دهد و اینجا
    // نشان داده می‌شود — چون کسی که می‌خواهد سفارش بگذارد باید بداند عددِ
    // روی صفحه مالِ کِی است.
    const stale = el('h-stale');
    stale.toggleAttribute('hidden', !h.watchStale);
    if (h.watchStale) {
      // عددِ نداشته جملهٔ سوراخ می‌سازد: «عکس تابلو — ثانیه کهنه است». دو
      // حالت است، نه یکی، و هرکدام جملهٔ خودش را دارد.
      stale.textContent = Number.isFinite(h.watchAgeSec)
        ? `عکس تابلو ${fmt.int(h.watchAgeSec)} ثانیه کهنه است`
        : 'هنوز عکسی از تابلو گرفته نشده';
      stale.title = h.watchStaleWhy || '';
    }

  } catch {
    const m = el('h-market');
    m.textContent = 'سرور در دسترس نیست';
    m.className = 'pill down';
    setLink('down');
  }
}

// ————————————————————————————————— تب‌ها —————————————————————————————————

const TABS = [
  { id: 'settings', title: 'تنظیمات', mod: '/ui/tabs/settings.mjs', phase: 1 },
  // «دیده‌بان زنجیره» و «برترین موقعیت‌ها» تب مستقل ندارند: هر دو از همان
  // عکس لحظه‌ای بازار تغذیه می‌شوند که «رصد لحظه‌ای» می‌سازد و هر دو یک کار
  // می‌کنند — نگاه کلی پیش از تصمیم. حالا دو حالت از همان تب‌اند و ماژول
  // خودشان همان‌جا تنبل بار می‌شود؛ همان الگویی که «نگاه باز» دارد.
  { id: 'live-market', title: 'رصد لحظه‌ای بازار', mod: '/ui/tabs/live-market.mjs', phase: 3 },
  { id: 'history', title: 'تحلیل تاریخی استراتژی', mod: '/ui/tabs/history.mjs', phase: 3 },
  { id: 'data-export', title: 'خروجی دیتا', mod: '/ui/tabs/data-export.mjs', phase: 3 },
  // نام تازه، نامِ قدیمی را نباید بی‌نشان بگذارد: کاربر ماه‌ها این تب را
  // «بک‌تست سریع» صدا کرده. جعبهٔ جست‌وجوی ریل رفته، پس نامِ قدیمی جایی
  // می‌نشیند که هنوز هست — عنوانِ راهنمای همان ردیف.
  { id: 'backtest', title: '🔬 آزمایشگاه آپشن', alias: 'همان «بک‌تست سریع» سابق',
    mod: '/ui/tabs/backtest.mjs', phase: 3 },
  { id: 'portfolio-backtest', title: 'آزمون همه استراتژی‌ها', mod: '/ui/tabs/portfolio-backtest.mjs', phase: 3 },
  // ═══ همهٔ استراتژی‌های زنده، پشت یک در ═══
  //
  // تا پیش از این، سی‌ویک استراتژیِ زنده نُه سرگروه در فهرست کناری داشتند و
  // هر سرگروه یک زیرمنوی شناور. فهرست کناری عملاً فهرستِ استراتژی‌ها بود و
  // شش تبِ کاری‌اش لای آن گم می‌شد. حالا یک در دارند و تقسیم‌بندی‌شان —
  // همان نُه گروه — داخلِ همان صفحه به شکل تب است.
  { id: 'strategy-explorer', title: 'در جست‌وجوی استراتژی‌ها',
    mod: '/ui/tabs/strategy-explorer.mjs', phase: 3 },
  // «دیده‌بان شرطی» از شرط شروع می‌کند و می‌گردد ببیند کدام ترکیب — در هر
  // نمادی — به آن می‌خورد. جهتش وارونهٔ رادارِ تک‌نماد است، پس تب خودش را
  // دارد.
  { id: 'watchtower', title: '🔔 دیده‌بان شرطی', alias: 'هشدار و اعلان روی شرط',
    mod: '/ui/tabs/watchtower.mjs', phase: 3 },
  { id: 'logs', title: 'دفتر خطاها', mod: '/ui/tabs/logs.mjs', phase: 1 },
];
TABS.push({ id: 'positions', title: 'موقعیت‌های من', phase: 7, mod: '/ui/tabs/positions.mjs' });
TABS.push({ id: 'roll', title: 'تحلیل رول', phase: 7, mod: '/ui/tabs/roll.mjs' });
// دفترچه کنارِ موقعیت‌ها می‌نشیند چون نوشته‌هایش از همان‌جا می‌آیند: فایل
// موقعیت‌ها فقط وضع فعلی را دارد و دفترچه می‌گوید چطور به آن رسیدیم.
TABS.push({ id: 'journal', title: 'دفترچهٔ معاملات', phase: 7, mod: '/ui/tabs/journal.mjs' });

// تب هر استراتژی از همان فهرست ساخته می‌شود و همه یک ماژول دارند. این نتیجه
// مستقیم آن تصمیم معماری است: چون هیچ استراتژی محاسبه‌گر جدا ندارد، هیچ تبی
// هم رابط جدا لازم ندارد.
//
// `rail: false` یعنی «هست ولی در فهرست کناری نیست»: نشانیِ `#covered-call`،
// پیوندهای بین‌تبی و نقشهٔ انتقال همگی همچنان کار می‌کنند — فقط راهِ
// **گشتن** دنبالشان از «در جست‌وجوی استراتژی‌ها» می‌گذرد، نه از یک ستونِ
// چهل‌ردیفی. دکمه‌ای که به جایی نرسد بدتر از نبودِ دکمه است، پس حذفشان از
// مسیریاب همراه حذفشان از فهرست نشد.
for (const key of Object.keys(SGROUPS)) {
  for (const d of CATALOG.filter((s) => s.group === key)) {
    TABS.push({
      id: d.id, title: d.name, phase: d.phase, def: d,
      group: key, mod: '/ui/tabs/strategy.mjs', rail: false,
    });
  }
}

/** تب‌هایی که در فهرست کناری ردیف دارند — به ترتیبِ پیش‌فرضِ همین فهرست. */
const RAIL_TABS = TABS.filter((t) => t.rail !== false);

// ————————————————————————————————— فهرست کناری —————————————————————————————————
//
// دوازده ردیف، بدون سرگروه و بدون زیرمنو. تا پیش از این، رسیدن به هر تب دو کلیک
// می‌خواست — یکی روی سرگروه، یکی روی خودِ تب — و پنلِ شناور روی محتوای
// همان تبی می‌نشست که تازه باز شده بود. حالا هر ردیف خودش دکمهٔ تب است.
//
// ترتیب ردیف‌ها دستِ کاربر است و در حافظهٔ مرورگر می‌ماند، وگرنه هر بار باز
// کردن صفحه همان چیدنِ دستی را از نو می‌خواهد.

const ORDER_KEY = 'rail:order:tabs';
const COLLAPSED_KEY = 'rail:collapsed';

/**
 * ترتیب ذخیره‌شدهٔ ردیف‌ها، پاک‌سازی‌شده.
 *
 * شناسه‌ای که دیگر وجود ندارد (تبِ حذف‌شده) دور ریخته می‌شود و تبِ تازه —
 * که در حافظهٔ کاربرِ قدیمی نیست — به ته فهرست می‌رود، نه اینکه ناپدید شود.
 */
const loadTabOrder = (defaultIds) => {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return defaultIds;
    const ordered = JSON.parse(raw);
    if (!Array.isArray(ordered)) return defaultIds;
    const valid = ordered.filter((id) => defaultIds.includes(id));
    const missing = defaultIds.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return defaultIds;
  }
};

const saveTabOrder = (order) => {
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
  try { localStorage.setItem(COLLAPSED_KEY, isRailCollapsed ? 'true' : 'false'); } catch {}
}

function toggleRail(force) {
  isRailCollapsed = typeof force === 'boolean' ? force : !isRailCollapsed;
  updateRailCollapsed();
}

/**
 * رنگ هر ردیف ریل — همه از توکن‌های خودِ پوسته.
 *
 * رنگ دیگر مالِ «بخش» نیست چون بخشی نمانده؛ مالِ خودِ تب است. با ریلِ
 * جمع‌شده که فقط آیکون دیده می‌شود، همین رنگ تنها چیزی است که ردیف‌ها را
 * از هم جدا می‌کند.
 */
const TAB_TONE = {
  settings: '--accent',
  'live-market': '--accent-2',
  history: '--cmp1',
  'data-export': '--cmp4',
  backtest: '--cmp3',
  'portfolio-backtest': '--cmp4',
  'strategy-explorer': '--gain',
  watchtower: '--warn',
  positions: '--cmp2',
  roll: '--cmp2',
  logs: '--loss',
};

let railActiveId = null;

/** برجستگی صفحه‌کلید را روی دکمهٔ متناظر می‌گذارد. */
function setRailActive(id) {
  railActiveId = id;
  const list = el('rail-list');
  if (!list) return;
  for (const b of list.querySelectorAll('.tab-btn')) {
    b.setAttribute('data-kbd-active', b.dataset.tab === id ? '1' : '0');
  }
}

/** ترتیب فعلی ردیف‌ها، همیشه از حافظه خوانده می‌شود نه از یک نسخهٔ کهنه. */
const railOrder = () => loadTabOrder(RAIL_TABS.map((t) => t.id));

/** ردیف `src` را درست جای ردیف `dst` می‌نشاند و بقیه را کنار می‌زند. */
function moveRailTab(srcId, dstId) {
  if (!srcId || !dstId || srcId === dstId) return false;
  const order = railOrder();
  const from = order.indexOf(srcId);
  const to = order.indexOf(dstId);
  if (from < 0 || to < 0) return false;
  order.splice(from, 1);
  order.splice(to, 0, srcId);
  saveTabOrder(order);
  return true;
}

function buildRail() {
  const list = el('rail-list');
  if (!list) return;
  const order = railOrder();
  const tabs = order.map((id) => RAIL_TABS.find((t) => t.id === id)).filter(Boolean);

  list.innerHTML = '';
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'tab-btn rail-row';
    b.type = 'button';
    b.dataset.tab = t.id;
    b.draggable = true;
    b.setAttribute('aria-current', current === t.id ? 'true' : 'false');
    b.setAttribute('data-kbd-active', railActiveId === t.id ? '1' : '0');
    b.style.setProperty('--sec', `var(${TAB_TONE[t.id] || '--accent'})`);
    // در ریلِ جمع‌شده فقط آیکون دیده می‌شود، پس عنوان راهنما تنها چیزی است
    // که می‌گوید این آیکون کدام تب است. `alias` نامِ قدیمی یا واژه‌ای است که
    // کاربر تب را با آن صدا می‌زند.
    b.title = t.alias ? `${t.title} — ${t.alias}` : t.title;
    b.innerHTML = `
      <span class="rail-row-grip" title="جابجایی ترتیب">${icon('grip', 'ic rail-grip-ic')}</span>
      <span class="rail-row-chip">${icon(TAB_ICON[t.id] || 'dot', 'ic tab-ic')}</span>
      <span class="tab-name">${ltr(t.title)}</span>`;

    b.addEventListener('click', () => { open(t.id); });

    // ——— جابه‌جایی ردیف‌ها با کشیدن ———
    b.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', t.id);
      e.dataTransfer.effectAllowed = 'move';
      b.classList.add('dragging');
    });
    b.addEventListener('dragend', () => {
      b.classList.remove('dragging');
      for (const other of list.querySelectorAll('.tab-btn')) other.classList.remove('drag-over');
    });
    b.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      b.classList.add('drag-over');
    });
    b.addEventListener('dragleave', () => { b.classList.remove('drag-over'); });
    b.addEventListener('drop', (e) => {
      e.preventDefault();
      b.classList.remove('drag-over');
      if (moveRailTab(e.dataTransfer.getData('text/plain'), t.id)) buildRail();
    });

    // ——— همان جابه‌جایی، با صفحه‌کلید ———
    //
    // کشیدن با ماوس تنها راهِ چیدن نیست. کسی که با صفحه‌کلید کار می‌کند
    // وگرنه هیچ راهی به این قابلیت ندارد.
    b.addEventListener('keydown', (e) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const cur = railOrder();
      const at = cur.indexOf(t.id);
      const next = e.key === 'ArrowUp' ? at - 1 : at + 1;
      if (at < 0 || next < 0 || next >= cur.length) return;
      e.preventDefault();
      if (!moveRailTab(t.id, cur[next])) return;
      buildRail();
      el('rail-list')?.querySelector(`.tab-btn[data-tab="${t.id}"]`)?.focus();
    });

    list.appendChild(b);
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
  // تبِ استراتژی ردیفی در فهرست کناری ندارد. حلقهٔ `aria-current` چند خط
  // پایین‌تر روی **همهٔ** دکمه‌های تب می‌گردد، پس وقتی چنین تبی باز می‌شود
  // هیچ ردیفی روشن نمی‌ماند — نه ردیفی که کاربر قبلاً زده بود.
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

// میان‌بر صفحه‌کلید روی خودِ ریل: بالا و پایین بین ردیف‌ها، اینتر همان یکی
// را باز می‌کند. ردیف برجسته با شناسه نگه داشته می‌شود نه اندیس، چون فهرست
// با هر جابه‌جایی از نو ساخته می‌شود.
el('rail-list')?.addEventListener('keydown', (e) => {
  if (e.altKey) return; // Alt+جهت‌نما جابه‌جایی ترتیب است، نه پیمایش
  const visible = [...el('rail-list').querySelectorAll('.tab-btn')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!visible.length) return;
    let idx = visible.findIndex((b) => b.dataset.tab === railActiveId);
    idx = e.key === 'ArrowDown'
      ? Math.min(idx < 0 ? 0 : idx + 1, visible.length - 1)
      : Math.max(idx < 0 ? visible.length - 1 : idx - 1, 0);
    setRailActive(visible[idx].dataset.tab);
    visible[idx].focus();
  }
});

// `/` یا Ctrl+K جست‌وجوی استراتژی را باز می‌کند. جعبهٔ جست‌وجو از ریل
// برداشته شد، پس میان‌بر به همان‌جایی می‌رود که حالا جست‌وجو آنجاست: تبِ
// «در جست‌وجوی استراتژی‌ها». جز وقتی همین حالا داخل یک ورودی دیگر تایپ
// می‌کنی، وگرنه «/» در آن ورودی نوشته نمی‌شود.
document.addEventListener('keydown', (e) => {
  const isCombo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
  if (!isCombo && e.key !== '/') return;
  const t = document.activeElement;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (e.key === '/' && typing) return;
  e.preventDefault();
  // تب ممکن است هنوز باز نشده باشد؛ `open` ناهمگام است، پس نشانگر پس از
  // سوار شدنِ صفحه داخل جعبه می‌رود، نه روی عنصری که هنوز نیست.
  Promise.resolve(open('strategy-explorer')).then(() => {
    const q = document.getElementById('sx-q');
    if (q) { q.focus(); q.select(); }
  });
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
