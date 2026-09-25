// جریان داده — هر درخواست، از لحظهٔ خواستن تا لحظهٔ رسیدن (R5-21)
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «از زمان درخواست دیتا تا زمان دریافت، برای هر دیتا بدانیم نتیجه چه شد
// و راحت عیب‌یابی کنیم. نمایش دقیق و کامل باشد و بدانیم برای کدام قسمت
// برنامه بوده، چه زمانی و چه آدرسی. جواب‌ها دسته‌بندی شده باشند: نیامد،
// بلاک شدیم، آمد، دیر آمد، خطا داد، نت قطع شد…»
//
// ═══ سه دیدگاه، یک شناسه ═══
//
//   client  مرورگر ← سرورِ محلی: کدام تب، کدام دکمه، کدام خطِ کد، چه
//           آدرسی، چه مدت، و آیا اصلاً به سرور رسید.
//   api     همان درخواست از چشمِ سرور: چه پاسخی ساخت (خلاصه، نه بدنه).
//   up      هر درخواستِ سرور به TSETMC که برای آن ساخته شد: آدرسِ کامل،
//           چندمین تلاش، انتظار در صفِ نرخ، مدت، کد HTTP، ردیف‌ها.
//
// هر سه یک شناسه دارند (`id` / `parent`)، پس یک کلیکِ کاربر تا آخرین
// درخواستِ بالادستش یک درخت است.
//
// این فایل «فقط» منطق است: دسته‌بندی، خلاصه‌سازی، و خواندنِ مبدأ از
// ردِ پشته. ذخیره در `server/datalog.mjs`، گرفتن در `ui/datalog-client.mjs`.

import { tapeVerdict } from '../ui/tape-intake.mjs';

/** دسته‌های نتیجه — یک کلید، یک جملهٔ فارسی. */
export const DL_CAT = Object.freeze({
  ok: 'آمد',
  cached: 'از کش آمد',
  joined: 'با درخواستِ هم‌زمان ادغام شد',
  quiet: 'خالیِ تأییدشده (معامله نشده)',
  empty: 'آمد ولی خالی',
  partial: 'ناقص آمد',
  throttled: 'بلاک شدیم (سهمیهٔ بالادست)',
  blocked: 'بلاک شدیم (HTTP 403/429)',
  http: 'خطای سرورِ بالادست (HTTP)',
  timeout: 'جواب نیامد (مهلت تمام شد)',
  network: 'نت قطع شد / اتصال برقرار نشد',
  parse: 'جواب خراب آمد (JSON نامعتبر)',
  aborted: 'لغو شد',
  error: 'خطا داد',
  offline: 'سرورِ محلی در دسترس نبود',
});

/** رنگِ هر دسته در نمایش. */
export const DL_TONE = Object.freeze({
  ok: 'good', cached: 'info', joined: 'info', quiet: 'info',
  empty: 'warn', partial: 'bad', throttled: 'bad', blocked: 'bad', http: 'bad',
  timeout: 'bad', network: 'bad', parse: 'bad', aborted: 'muted', error: 'bad', offline: 'bad',
});

/** دسته‌هایی که یعنی «چیزی درست نیامد». `slow` جدا پرچم است. */
export const DL_PROBLEM = new Set(['empty', 'partial', 'throttled', 'blocked', 'http', 'timeout',
  'network', 'parse', 'error', 'offline']);

/** برچسبِ «دیر آمد» جدا از دسته است: داده‌ای که دیر آمد هنوز ممکن است درست باشد. */
export const DL_SLOW_LABEL = 'دیر آمد';

/** نام فارسیِ هر تب در لاگ؛ شناسه‌های ناشناخته همان شناسه می‌مانند. */
export const DL_TAB = Object.freeze({
  app: 'پوستهٔ برنامه', server: 'پس‌زمینهٔ سرور',
  settings: 'تنظیمات', 'live-market': 'رصد لحظه‌ای بازار', history: 'تحلیل تاریخی استراتژی',
  backtest: 'آزمایشگاه آپشن', 'portfolio-backtest': 'آزمون همه استراتژی‌ها',
  'strategy-explorer': 'در جست‌وجوی استراتژی‌ها', watchtower: 'دیده‌بان شرطی', logs: 'دفتر خطاها',
  positions: 'موقعیت‌های من', roll: 'تحلیل رول', journal: 'دفترچهٔ معاملات', datalog: 'جریان داده',
  'open-view': 'نگاه باز', 'greeks-watch': 'رصد یونانی', 'spread-radar': 'رادار اسپرد',
  'live-market-dashboard': 'داشبورد لحظه‌ای', strategy: 'تب استراتژی',
});

/** تبی که لاگ نمی‌شود: خروجی دیتا فعلاً بیرون از این بررسی است. */
export const DL_MUTED_TABS = new Set(['data-export']);

export const tabLabel = (id) => DL_TAB[id] || id || '—';

/**
 * دستهٔ یک خطا.
 *
 * `abortIsTimeout`: در سرور تنها چیزی که درخواستِ بالادست را قطع می‌کند
 * زمان‌سنجِ مهلت است؛ در مرورگر قطع یعنی کاربر یا کد لغو کرده.
 */
export function classifyError(error, { abortIsTimeout = false } = {}) {
  const name = String(error?.name || '');
  const msg = String(error?.message ?? error ?? '');
  const code = String(error?.cause?.code || error?.code || '');
  const status = /HTTP (\d{3})/.exec(msg);
  if (status) {
    const s = Number(status[1]);
    return s === 403 || s === 429 ? 'blocked' : 'http';
  }
  if (name === 'AbortError' || /aborted/i.test(msg)) return abortIsTimeout ? 'timeout' : 'aborted';
  if (/TIMEOUT|ETIMEDOUT/i.test(code) || /timed? ?out/i.test(msg)) return 'timeout';
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|UND_ERR_SOCKET|CERT|SSL|TLS/i.test(`${code} ${msg}`)
    || /fetch failed|Failed to fetch|NetworkError|network/i.test(msg)) return 'network';
  if (name === 'SyntaxError' || /JSON|Unexpected token/i.test(msg)) return 'parse';
  return 'error';
}

const hhmmss = (v) => {
  const s = String(Math.trunc(Number(v) || 0)).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
};

/** اولین فهرستِ ناتهی، با نامِ کلیدش — ریشهٔ پاسخ‌های TSETMC ثابت نیست. */
function firstList(obj, key = '') {
  if (Array.isArray(obj)) return { key, list: obj };
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && v.length) return { key: k, list: v };
    }
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const got = firstList(v, k);
        if (got.list.length) return got;
      }
    }
    for (const [k, v] of Object.entries(obj)) if (Array.isArray(v)) return { key: k, list: v };
  }
  return { key, list: [] };
}

/**
 * خلاصهٔ پاسخِ TSETMC — آنچه برای عیب‌یابی لازم است، نه بدنهٔ کامل.
 *
 * بدنهٔ یک روزِ ریزمعامله می‌تواند سی هزار ردیف باشد؛ ذخیره‌اش لاگ را
 * صدها مگابایت می‌کرد. به‌جایش: شمار، کلیدِ ریشه، و برای ریزمعامله
 * ساعتِ اولین و آخرین معامله؛ برای تابلوی روزانه عددهای مرجعِ سنجش.
 */
export function summarizeUpstream(data) {
  const { key, list } = firstList(data);
  const out = { rows: list.length };
  if (key) out.key = key;
  if (key === 'tradeHistory' || key === 'trade') {
    const times = list.map((row) => Number(row?.hEven)).filter((t) => t > 0);
    if (times.length) { out.first = hhmmss(Math.min(...times)); out.last = hhmmss(Math.max(...times)); }
    const canceled = list.filter((row) => Number(row?.canceled) === 1).length;
    if (canceled) out.canceled = canceled;
  }
  const daily = data?.closingPriceDaily;
  if (daily && !Array.isArray(daily) && typeof daily === 'object') {
    out.key = 'closingPriceDaily';
    out.rows = Object.keys(daily).length ? 1 : 0;
    out.date = Number(daily.dEven) || 0;
    out.trades = Number(daily.zTotTran) || 0;
    out.volume = Number(daily.qTotTran5J) || 0;
    out.close = Number(daily.pClosing) || 0;
  }
  if (!list.length && data && typeof data === 'object' && !Array.isArray(data) && !out.key) {
    out.keys = Object.keys(data).slice(0, 6);
  }
  return out;
}

/** دستهٔ پاسخِ موفقِ بالادست. «خالی» یعنی آمد ولی هیچ ردیفی نداشت. */
export function classifyUpstreamOk(summary) {
  return Number(summary?.rows) > 0 ? 'ok' : 'empty';
}

const TAPE_STATES = ['complete', 'quiet', 'unverified', 'partial', 'missing', 'throttled', 'error'];

/**
 * خلاصهٔ پاسخِ سرورِ محلی به مرورگر.
 *
 * برای ریزمعامله، حکمِ هر ابزار/روز شمرده می‌شود (همان `tapeVerdict` که
 * تب‌ها رسم را با آن تصمیم می‌گیرند)، وگرنه «۲۰۰ آمد» دربارهٔ اینکه
 * داده کامل بود هیچ نمی‌گوید.
 */
export function summarizeReply(pathname, obj) {
  const out = {};
  if (obj == null || typeof obj !== 'object') return out;
  if (obj.error) out.error = String(obj.error).slice(0, 300);
  if (obj.throttled === true) {
    out.throttled = true;
    if (obj.throttleNote) out.note = String(obj.throttleNote).slice(0, 300);
  }
  const tape = String(pathname || '').startsWith('/api/trades');
  if (obj.items && typeof obj.items === 'object' && !Array.isArray(obj.items)) {
    const items = Object.values(obj.items);
    out.items = items.length;
    if (tape) {
      const states = Object.fromEntries(TAPE_STATES.map((s) => [s, 0]));
      let rows = 0;
      for (const item of items) {
        const v = tapeVerdict(item);
        states[v.state] = (states[v.state] || 0) + 1;
        rows += Number(v.rows) || 0;
      }
      out.states = Object.fromEntries(Object.entries(states).filter(([, n]) => n));
      out.rows = rows;
    } else {
      out.rows = items.reduce((sum, item) => sum + (Array.isArray(item?.rows) ? item.rows.length : 0), 0);
      const failed = items.filter((item) => item?.error).length;
      if (failed) out.failed = failed;
    }
    return out;
  }
  if (tape && Array.isArray(obj.rows)) {
    const v = tapeVerdict(obj);
    out.states = { [v.state]: 1 };
    out.rows = obj.rows.length;
    if (obj.source) out.source = String(obj.source);
    return out;
  }
  // «خالی» فقط برای پاسخی معنا دارد که شکلِ داده دارد (`rows`)؛ پاسخِ
  // وضعیت یا تنظیمات فهرستی ندارد و خالی خواندنش هشدارِ دروغ بود.
  if (Array.isArray(obj.rows)) { out.rows = obj.rows.length; out.key = 'rows'; return out; }
  const { key, list } = firstList(obj);
  if (list.length) { out.rows = list.length; out.list = key; }
  return out;
}

/** دستهٔ پاسخِ سرورِ محلی، از کدِ HTTP و خلاصه‌اش. */
export function classifyReply(status, summary = {}) {
  if (Number(status) >= 400 || summary.error) return 'error';
  if (summary.throttled || summary.states?.throttled) return 'throttled';
  const s = summary.states;
  if (s && (s.partial || s.missing || s.error)) return 'partial';
  if (s && !s.complete && !s.unverified && s.quiet) return 'quiet';
  if (summary.items != null && summary.failed) return 'partial';
  if ((summary.key || summary.items != null || s) && !Number(summary.rows)) return 'empty';
  return 'ok';
}

/**
 * مبدأِ درخواست از ردِ پشته: کدام فایل و کدام خط.
 *
 * `fetch` هم‌گام از داخلِ تابعِ تب صدا زده می‌شود، پس ردِ پشته تا خودِ
 * تب می‌رسد. این دقیق‌تر از «تبِ باز» است: درخواستِ دوره‌ایِ پوستهٔ
 * برنامه در هر تبی که باز باشد مالِ پوسته است، نه آن تب.
 */
export function sourceFromStack(stack = '') {
  const out = [];
  for (const line of String(stack).split('\n')) {
    const hit = /\/((?:ui|core|strategies)\/[\w/.-]+\.mjs):(\d+)/.exec(line);
    if (!hit || /datalog-client\.mjs$/.test(hit[1])) continue;
    const frame = `${hit[1]}:${hit[2]}`;
    if (out.at(-1) !== frame) out.push(frame);
    if (out.length >= 6) break;
  }
  return out;
}

/** تبِ صاحبِ درخواست، از همان رد؛ `null` یعنی رد به تبی نرسید. */
export function tabFromSource(frames = []) {
  for (const frame of frames) {
    const tab = /^ui\/tabs\/([\w-]+)\.mjs:/.exec(frame);
    if (tab) return tab[1];
  }
  if (frames.some((frame) => frame.startsWith('ui/app.mjs:'))) return 'app';
  return null;
}

/**
 * ردیف‌ها را درخت می‌کند: هر درخواستِ مرورگر با پاسخِ سرور و درخواست‌های
 * بالادستش. درخواستِ بالادستی که صاحبِ مرورگری ندارد (حلقهٔ دیده‌بان،
 * پس‌زمینه) خودش یک ریشه است.
 */
export function buildTree(rows = []) {
  const roots = new Map();
  const order = [];
  const rootOf = (id, at) => {
    if (!roots.has(id)) { roots.set(id, { id, at, client: null, api: null, up: [] }); order.push(id); }
    return roots.get(id);
  };
  for (const row of rows) {
    if (row.kind === 'client') { const r = rootOf(row.id, row.at); r.client = row; r.at = Math.min(r.at, row.at); continue; }
    if (row.kind === 'api') { const r = rootOf(row.id, row.at); r.api = row; r.at = Math.min(r.at, row.at - (row.ms || 0)); continue; }
    if (row.kind === 'up') {
      if (row.parent) { rootOf(row.parent, row.at).up.push(row); continue; }
      rootOf(`up-${row.seq}`, row.at).up.push(row);
    }
  }
  return order.map((id) => {
    const r = roots.get(id);
    const tab = r.client?.tab || r.api?.tab || r.up[0]?.tab || '';
    const cat = r.client?.cat === 'offline' || r.client?.cat === 'aborted' || r.client?.cat === 'network'
      ? r.client.cat
      : r.api?.cat || r.client?.cat || worstCat(r.up.map((u) => u.cat));
    const slow = Boolean(r.client?.slow || r.api?.slow || r.up.some((u) => u.slow));
    return { ...r, tab, cat, slow, upCats: countBy(r.up, 'cat') };
  });
}

const SEVERITY = ['offline', 'network', 'timeout', 'blocked', 'throttled', 'http', 'parse', 'error',
  'partial', 'empty', 'aborted', 'quiet', 'joined', 'cached', 'ok'];

/** بدترین دسته در یک گروه — برای ریشه‌ای که فقط درخواستِ بالادست دارد. */
export function worstCat(cats = []) {
  let best = SEVERITY.length;
  for (const cat of cats) {
    const i = SEVERITY.indexOf(cat);
    if (i >= 0 && i < best) best = i;
  }
  return SEVERITY[best] || '';
}

export function countBy(rows = [], key = 'cat') {
  const out = {};
  for (const row of rows || []) {
    const k = row?.[key] ?? '';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/**
 * جمع‌بندیِ یک لاگ برای گزارش — همان چیزی که ابزارِ خطِ فرمان و تب
 * هر دو چاپ می‌کنند.
 */
export function summarizeLog(rows = []) {
  const tree = buildTree(rows);
  const up = rows.filter((row) => row.kind === 'up');
  const byTab = {};
  for (const node of tree) {
    const t = byTab[node.tab || '—'] ||= { requests: 0, cats: {}, up: 0, upCats: {}, slow: 0 };
    t.requests += 1;
    t.cats[node.cat] = (t.cats[node.cat] || 0) + 1;
    if (node.slow) t.slow += 1;
    t.up += node.up.length;
    for (const [cat, n] of Object.entries(node.upCats)) t.upCats[cat] = (t.upCats[cat] || 0) + n;
  }
  const byPath = {};
  for (const row of up) {
    // کدِ ابزار و تاریخ جای خودشان «…» می‌گیرند تا یک سرویس یک ردیف شود.
    const key = String(row.path || '').split('?')[0].replace(/\/\d{4,}(?=\/|$)/g, '/…');
    const p = byPath[key] ||= { count: 0, cats: {}, msTotal: 0, msMax: 0, slow: 0 };
    p.count += 1;
    p.cats[row.cat] = (p.cats[row.cat] || 0) + 1;
    p.msTotal += Number(row.ms) || 0;
    p.msMax = Math.max(p.msMax, Number(row.ms) || 0);
    if (row.slow) p.slow += 1;
  }
  return {
    requests: tree.length, upstream: up.length,
    cats: countBy(tree, 'cat'), upCats: countBy(up, 'cat'),
    slow: tree.filter((node) => node.slow).length,
    byTab, byPath,
  };
}
