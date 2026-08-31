// سرور محلی.
//
// سرور فقط واسط عبور درخواست نیست؛ صاحب داده است.
//
//   سرور   دریافت ، کش ، سهمیه نرخ درخواست ، نگهداری عکس لحظه‌ای
//   مرورگر  ترکیب‌سازی ، محاسبه ، مرتب‌سازی ، رسم
//
// حلقه دریافت دیده‌بان اینجا می‌چرخد، نه در مرورگر. پس حتی اگر همه تب‌ها
// بسته باشد، آخرین عکس لحظه‌ای در حافظه هست و مرورگر هیچ‌وقت پشت یک
// درخواست شبکه منتظر نمی‌ماند. سهمیه هم فقط اینجا اعمال می‌شود، پس چند تب
// هم‌زمان بازار را نمی‌کوبند.
//
// اجرا:  node server/server.mjs
// بعد در مرورگر:  http://127.0.0.1:8787

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaults, sanitize } from '../core/settings.mjs';
import { normalizeTrades } from '../core/backtest.mjs';
import { normalizeBookEvents } from '../core/book-history.mjs';
import {
  makeArchive, chainRowsFrom, archiveNote, archiveBoardDownNote, archiveQuality, archiveName, validArchiveDate,
} from '../core/watch-archive.mjs';
import {
  contractStatus, normalizeFa, pickUniverseSource, rangeSummary, rosterAt,
  rosterChainRows, rosterCoverage, rosterInRange, rosterNote,
} from '../core/option-roster.mjs';
import { tehranDateNumber } from '../core/live-day.mjs';
import {
  breadthInstruments, marketBreadthSnapshot, marketBreadthTimeline, summarizeLiveTrades,
} from '../core/live-market.mjs';
import { decisionDashboardSnapshot } from '../core/decision-dashboard.mjs';
import {
  validIns, validCompactDate, historicalTradesPath, historicalPath, HISTORICAL_KINDS,
  validSessionId, parseInsList, safeStaticPath, readBody, BodyTooLarge,
} from './guard.mjs';
import { evictOldest } from './cache.mjs';
import { createLog } from './errlog.mjs';
import { watchBackoffSec } from './backoff.mjs';
import {
  PORTFOLIO_MISSION_SAVE_VERSION, listPortfolioMissionSaves,
  loadPortfolioMissionSave, savePortfolioMissionDraft,
} from './portfolio-mission-store.mjs';
import {
  PORTFOLIO_DOSSIER_SAVE_VERSION, listPortfolioDossierSaves,
  loadPortfolioDossierSave, savePortfolioDossier,
} from './portfolio-dossier-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);
const SETTINGS_FILE = path.join(ROOT, 'data', 'settings.json');
const PORTFOLIO_MISSION_DIR = path.join(ROOT, 'data', 'portfolio-missions');
const PORTFOLIO_DOSSIER_DIR = path.join(ROOT, 'data', 'portfolio-dossiers');

// سقف عمومی بدنه درخواست. تنظیمات و فهرست‌های معمولی باید کوچک بمانند.
const MAX_BODY = 1024 * 1024;

// پرونده پایان سفر، اسنپ‌شات واقعی بازار را هم برای بازپخش قابل حسابرسی نگه
// می‌دارد و ممکن است از سقف عمومی بزرگ‌تر شود. این استثنا فقط برای همان
// endpoint است و سقف محدود ۱۶ مگابایتی جلوی رشد نامحدود حافظه را می‌گیرد.
const PORTFOLIO_DOSSIER_MAX_BODY = 16 * 1024 * 1024;

// مأموریت فعال همان عکس تاریخی قابل حسابرسی را حمل می‌کند و ممکن است از
// سقف عمومی بگذرد. این حد فقط برای PUT جلسه سفر زمانی است؛ بزرگ‌بودن بدنه
// هیچ‌کدام از اعتبارسنجی‌های نسخه، مرحله یا snapshot را دور نمی‌زند.
const PORTFOLIO_MISSION_MAX_BODY = 16 * 1024 * 1024;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://main.tsetmc.com/',
};

let S = defaults();

// ————————————————————————————————— تنظیمات روی دیسک —————————————————————————————————

async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    S = sanitize(JSON.parse(raw));
    log('تنظیمات از دیسک خوانده شد');
  } catch {
    S = defaults();
    await saveSettings(S).catch(() => {});
  }
}
async function saveSettings(next) {
  S = sanitize(next);
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(S, null, 2), 'utf8');
  return S;
}

// ————————————————————————————————— تشخیص و شمارنده —————————————————————————————————

const stat = {
  started: Date.now(),
  requests: 0, cacheHits: 0, errors: 0, rateWaits: 0,
  upstreamMsTotal: 0, upstreamCount: 0,
  lastError: null, lastErrorAt: null,
  watchTicks: 0, watchRows: 0, lastWatchAt: null, lastWatchMs: 0, watchConsecutiveFails: 0,
  queueDepth: 0, inflight: 0, clients: 0, paused: false, pauseReason: '',
};

const errlog = createLog();

function log(...a) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}]`, ...a);
}

/**
 * ثبت در دفتر خطا، به‌علاوهٔ چاپ در کنسول.
 *
 * کنسول برای کسی است که سرور را از ترمینال اجرا می‌کند؛ دفتر برای کسی که
 * برنامه را در مرورگر باز کرده و ترمینالی نمی‌بیند. تا امروز فقط اولی بود.
 */
function logErr(where, e, level = 'error') {
  const message = e?.message ? `${e.name || 'Error'}: ${e.message}` : String(e);
  errlog.push({ level, where, message, detail: e?.stack || '' });
  log(`⚠ ${where}: ${message}`);
}

// ————————————————————————————————— سهمیه نرخ درخواست —————————————————————————————————
// سطل توکن: ظرفیت انفجاری برای رگبار اول، نرخ ثابت برای ادامه.

let tokens = S.burst;
let lastRefill = Date.now();

function takeToken() {
  const now = Date.now();
  tokens = Math.min(S.burst, tokens + ((now - lastRefill) / 1000) * S.ratePerSec);
  lastRefill = now;
  if (tokens >= 1) { tokens -= 1; return 0; }
  const waitMs = Math.ceil(((1 - tokens) / S.ratePerSec) * 1000);
  return waitMs;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ————————————————————————————————— صف با سقف هم‌زمانی —————————————————————————————————

const queue = [];
let running = 0;

function schedule(fn, priority = 5) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, priority, resolve, reject });
    queue.sort((a, b) => a.priority - b.priority);
    stat.queueDepth = queue.length;
    pump();
  });
}

async function pump() {
  if (running >= S.concurrency || !queue.length) return;
  const job = queue.shift();
  stat.queueDepth = queue.length;
  running += 1;
  stat.inflight = running;
  try {
    const wait = takeToken();
    if (wait > 0) { stat.rateWaits += 1; await sleep(wait); takeToken(); }
    job.resolve(await job.fn());
  } catch (e) {
    job.reject(e);
  } finally {
    running -= 1;
    stat.inflight = running;
    pump();
  }
}

// ————————————————————————————————— کش و ادغام درخواست در پرواز —————————————————————————————————

const cache = new Map();     // url -> { at, data }
const inflight = new Map();  // url -> Promise

async function fetchUpstream(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), S.timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const js = await res.json();
    stat.upstreamMsTotal += Date.now() - t0;
    stat.upstreamCount += 1;
    return js;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * دریافت با کش زمان‌دار، ادغام درخواست تکراری، و تلاش مجدد با عقب‌نشینی.
 * پاسخ ناموفق هرگز کش نمی‌شود — وگرنه یک قطعی لحظه‌ای شبکه، یک نماد را
 * تا پایان نشست «شناسایی‌نشده» نگه می‌دارد.
 */
async function get(pathname, ttlSec, priority = 5) {
  const url = `${S.baseUrl}${pathname}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlSec * 1000) { stat.cacheHits += 1; return hit.data; }
  if (inflight.has(url)) return inflight.get(url);

  const p = (async () => {
    let lastErr;
    for (let attempt = 0; attempt <= S.retries; attempt++) {
      try {
        stat.requests += 1;
        const data = await schedule(() => fetchUpstream(url), priority);
        cache.set(url, { at: Date.now(), data });
        evictOldest(cache, S.maxCacheEntries);
        return data;
      } catch (e) {
        lastErr = e;
        stat.errors += 1;
        stat.lastError = `${e.name}: ${e.message}`;
        stat.lastErrorAt = Date.now();
        errlog.push({ level: 'error', where: `بالادست ${path}`, message: stat.lastError, detail: `تلاش ${attempt + 1} از ${S.retries + 1}` });
        if (attempt < S.retries) await sleep(300 * 2 ** attempt);
      }
    }
    throw lastErr;
  })().finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p;
}

/** ساعت واقعی ثبت یک پاسخ در کش. `null` یعنی هنوز چیزی ثبت نشده. */
function cachedAt(pathname) {
  return cache.get(`${S.baseUrl}${pathname}`)?.at ?? null;
}

/**
 * عکس تازه نوار معاملات روز.
 *
 * CDN تی‌اس‌ای‌تی‌ام‌سی پاسخ بدون query را گاهی چند دقیقه نگه می‌دارد؛
 * برای رصد زنده، timestamp فقط در URL بالادست می‌نشیند. کلید کش محلی ثابت
 * می‌ماند تا چند تب/کلیک هم‌زمان یک درخواست را ادغام کنند و سهمیه دور زده
 * نشود. پاسخ ناموفق مثل get() کش نمی‌شود.
 */
async function getFresh(pathname, ttlSec = 2, priority = 2) {
  const key = `fresh:${pathname}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlSec * 1000) { stat.cacheHits += 1; return hit.data; }
  if (inflight.has(key)) return inflight.get(key);

  const pending = (async () => {
    let lastErr;
    for (let attempt = 0; attempt <= S.retries; attempt++) {
      try {
        stat.requests += 1;
        const join = pathname.includes('?') ? '&' : '?';
        const url = `${S.baseUrl}${pathname}${join}_=${Date.now()}`;
        const data = await schedule(() => fetchUpstream(url), priority);
        cache.set(key, { at: Date.now(), data });
        evictOldest(cache, S.maxCacheEntries);
        return data;
      } catch (e) {
        lastErr = e;
        stat.errors += 1;
        stat.lastError = `${e.name}: ${e.message}`;
        stat.lastErrorAt = Date.now();
        if (attempt < S.retries) await sleep(300 * 2 ** attempt);
      }
    }
    throw lastErr;
  })().finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}

/** کلید ریشه پاسخ‌های تی‌اس‌ای‌تی‌ام‌سی ثابت نیست؛ اولین لیست را برمی‌گرداند. */
function firstList(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length) return v;
      if (v && typeof v === 'object') { const g = firstList(v); if (g.length) return g; }
    }
  }
  return [];
}
function firstDict(obj) {
  if (!obj || typeof obj !== 'object') return {};
  for (const v of Object.values(obj)) if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  return obj;
}

/**
 * پاسخ تاریخ‌دار بالادست را به شکل ثابت درمی‌آورد.
 *
 * فقط `book` و `trades` اینجا نرمال می‌شوند، چون هر دو نرمال‌سازی‌شان در
 * `core/` است و آزمون دارد. بقیه خام رد می‌شوند: تا وقتی پاسخ واقعی
 * بالادست دیده نشده، حدس‌زدن نام میدان‌ها یعنی ساختن نگاشتی که ممکن است
 * غلط باشد و بی‌صدا هم بماند. مصرف‌کننده ردیف خام را می‌بیند و خودش
 * تصمیم می‌گیرد.
 *
 * `count` همیشه هست تا «آمد ولی خالی بود» از «نیامد» جدا بماند.
 */
function shapeHistorical(kind, raw) {
  if (kind === 'book') {
    const rows = firstList(raw);
    return { events: normalizeBookEvents(rows), count: rows.length };
  }
  if (kind === 'trades') {
    const rows = firstList(raw);
    return { rows: normalizeTrades(rows), count: rows.length };
  }
  if (kind === 'daily' || kind === 'instrument' || kind === 'clientType') {
    return { row: firstDict(raw) };
  }
  const rows = firstList(raw);
  return { rows, count: rows.length };
}

// ————————————————————————————————— ساعات بازار —————————————————————————————————

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// کلید انگلیسی می‌ماند چون تنظیم «روزهای معاملاتی» با همین نوشته می‌شود؛
// فقط چیزی که به کاربر نشان داده می‌شود فارسی است.
const DAY_FA = {
  Sat: 'شنبه', Sun: 'یک‌شنبه', Mon: 'دوشنبه', Tue: 'سه‌شنبه',
  Wed: 'چهارشنبه', Thu: 'پنج‌شنبه', Fri: 'جمعه',
};

function tehranNow() {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran', hour12: false,
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const hhmm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// `phase` کنار `why` می‌نشیند چون فراخوان‌ها باید بتوانند بین «بازار هنوز
// باز نشده» و «بازار بسته شده» فرق بگذارند، و متن فارسی برای این کار
// شکننده است: یک بازنویسی جمله، منطق مصرف‌کننده را بی‌صدا خراب می‌کند.
// این تفاوت جای بی‌اهمیتی نیست — پس از بستن بازار، تابلو ارقام نهایی
// **امروز** را نگه می‌دارد؛ پیش از باز شدنش، ارقام جلسهٔ **دیروز** را.
function marketOpen() {
  if (!S.gateMarketHours) return { open: true, phase: 'ungated', why: 'دروازه ساعات بازار خاموش است' };
  const { weekday, minutes } = tehranNow();
  const days = String(S.tradeDays).split(',').map((x) => x.trim());
  if (!days.includes(weekday)) return { open: false, phase: 'holiday', why: `${DAY_FA[weekday] || weekday}، روز معاملاتی نیست` };
  if (minutes < hhmm(S.openHHMM)) return { open: false, phase: 'before', why: 'بازار باز نشده' };
  if (minutes > hhmm(S.closeHHMM)) return { open: false, phase: 'after', why: 'بازار بسته شده' };
  return { open: true, phase: 'open', why: '' };
}

// ————————————————————————————————— حلقه دیده‌بان و پخش رویداد —————————————————————————————————

const clients = new Set();
let watch = { at: null, rows: [], byKey: new Map() };

const TRACK = [
  'pDrCotVal_UA', 'pClosing_UA', 'pMeDem_C', 'qTitMeDem_C', 'pMeOf_C', 'qTitMeOf_C',
  'pDrCotVal_C', 'pClosing_C', 'oP_C', 'qTotTran5J_C',
  'pMeDem_P', 'qTitMeDem_P', 'pMeOf_P', 'qTitMeOf_P',
  'pDrCotVal_P', 'pClosing_P', 'oP_P', 'qTotTran5J_P',
];

const rowKey = (r) => `${r.insCode_C ?? ''}|${r.insCode_P ?? ''}`;
const rowSig = (r) => TRACK.map((k) => r[k] ?? '').join(',');

function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) { try { res.write(msg); } catch { clients.delete(res); } }
}

/** @returns {boolean} موفق بود یا نه — بازار بسته هم موفق حساب می‌شود، عقب‌نشینی نمی‌خواهد */
async function watchTick() {
  const gate = marketOpen();
  stat.paused = !gate.open;
  stat.pauseReason = gate.why;
  if (!gate.open) return true;

  const t0 = Date.now();
  try {
    const js = await get('/Instrument/GetInstrumentOptionMarketWatch/0', S.ttlWatchSec, 1);
    const rows = firstList(js);
    const next = new Map();
    const changed = [];
    for (const r of rows) {
      const k = rowKey(r);
      const sig = rowSig(r);
      next.set(k, sig);
      if (watch.byKey.get(k) !== sig) changed.push(r);
    }
    const first = watch.rows.length === 0;
    watch = { at: Date.now(), rows, byKey: next };
    stat.watchTicks += 1;
    stat.watchRows = rows.length;
    stat.lastWatchAt = watch.at;
    stat.lastWatchMs = Date.now() - t0;
    // بار اول کل عکس، بعد فقط ردیف‌های تغییرکرده
    broadcast('watch', { at: watch.at, full: first, count: rows.length, rows: first ? rows : changed });
    archiveToday(rows).catch((e) => logErr('بایگانی دیده‌بان', e));
    return true;
  } catch (e) {
    logErr('دور دیده‌بان', e);
    broadcast('trouble', { at: Date.now(), message: `${e.name}: ${e.message}` });
    return false;
  }
}

// ——————————————————————— بایگانی دیده‌بان ———————————————————————
//
// بالادست نسخهٔ تاریخ‌دار فهرست قراردادها را نمی‌دهد، پس تنها راه داشتنش
// این است که از امروز هر روز یک بار خودمان ذخیره‌اش کنیم. یک بار در روز
// کافی است: فهرست قراردادهای یک روز در طول همان روز عوض نمی‌شود.
//
// پرچم درون‌حافظه‌ای جلوی نوشتن مکرر را می‌گیرد، ولی وجود فایل هم بررسی
// می‌شود — سرور می‌تواند وسط روز ری‌استارت شود و پرچم پاک شود.
const ARCHIVE_DIR = path.join(ROOT, 'data', 'watch-history');
let archivedDay = 0;

async function archiveToday(rows) {
  const day = tehranDateNumber();
  if (!day || archivedDay === day || !rows?.length) return;
  const file = path.join(ARCHIVE_DIR, `${day}.json`);
  try { await fs.access(file); archivedDay = day; return; } catch { /* هنوز نیست */ }
  const body = makeArchive(day, rows, { at: Date.now() });
  if (!body.count) return;
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(body), 'utf8');
  archivedDay = day;
  log(`بایگانی دیده‌بان ${day} نوشته شد — ${body.count} ردیف`);
}

/** قدیمی‌ترین روزی که بایگانی دارد. صفر یعنی هنوز هیچ. */
async function archiveFirstDate() {
  try {
    const names = (await fs.readdir(ARCHIVE_DIR)).filter((name) => /^\d{8}\.json$/.test(name));
    if (!names.length) return 0;
    return Math.min(...names.map((name) => Number(name.slice(0, 8))));
  } catch { return 0; }
}

/** تازه‌ترین روزی که بایگانی دارد. صفر یعنی هنوز هیچ. */
async function archiveLastDate() {
  try {
    const names = (await fs.readdir(ARCHIVE_DIR)).filter((name) => /^\d{8}\.json$/.test(name));
    if (!names.length) return 0;
    return Math.max(...names.map((name) => Number(name.slice(0, 8))));
  } catch { return 0; }
}

async function readArchive(date) {
  const name = archiveName(String(date));
  if (!name) return null;
  try { return JSON.parse(await fs.readFile(path.join(ARCHIVE_DIR, name), 'utf8')); }
  catch { return null; }
}

// ——————————————————————— دفتر قراردادهای تاریخی ———————————————————————
//
// بایگانی بالا از **امروز** شروع می‌شود و برای دیروزِ پیش از نصب، خالی
// است. دفتر همان حفره را پر می‌کند: `GetInstrmentsHistoryInDay` تاریخ
// می‌گیرد، پس گذشته یک بار برای همیشه ساختنی است
// (`node tools/roster-scan.mjs` یا `tools/roster-import.mjs`).
//
// یک‌بار خوانده و در حافظه می‌ماند، ولی `mtime` هر بار سنجیده می‌شود:
// کاربر می‌تواند وسط کار دفتر را دوباره بسازد و نباید مجبور به ری‌استارت
// سرور شود. پروندهٔ چند مگابایتی، هر درخواست یک بار JSON.parse نمی‌شود.
const ROSTER_FILE = path.join(ROOT, 'data', 'option-roster.json');
let rosterCache = { mtime: 0, rows: [], file: null };

async function readRoster() {
  let stamp = 0;
  try { stamp = (await fs.stat(ROSTER_FILE)).mtimeMs; }
  catch { rosterCache = { mtime: 0, rows: [], file: null }; return rosterCache; }
  if (stamp === rosterCache.mtime && rosterCache.file) return rosterCache;
  try {
    const file = JSON.parse(await fs.readFile(ROSTER_FILE, 'utf8'));
    rosterCache = { mtime: stamp, rows: Array.isArray(file?.rows) ? file.rows : [], file };
  } catch (e) {
    log(`دفتر قراردادها خوانده نشد: ${e.message}`);
    rosterCache = { mtime: stamp, rows: [], file: null };
  }
  return rosterCache;
}

/**
 * نگاشتِ «نام نماد پایه → شناسهٔ ابزار»، از فهرست زندهٔ امروز.
 *
 * دفتر شناسهٔ پایه را ندارد — نامِ پایه داخل نامِ قرارداد است، ولی کدش
 * نه. گرفتنش از تابلوی امروز سوگیری بقا نمی‌آورد، چون نمادِ پایه سررسید
 * نمی‌شود: «اهرم» امسال همان کدی را دارد که پارسال داشت.
 *
 * پایه‌ای که در تابلوی امروز نباشد (نمادی که از بازار رفته) کدش خالی
 * می‌ماند و ردیفش **شمرده و نام‌برده** می‌شود، نه بی‌صدا انداخته — کدِ
 * ساختگی یعنی کسی روزی رویش قیمت می‌خواهد.
 */
function baseIndexFrom(rows) {
  const index = new Map();
  for (const row of rows || []) {
    const ins = String(row?.uaInsCode ?? '').trim();
    if (!ins) continue;
    for (const key of [row?.lval30_UA, row?.lVal18AFC_UA]) {
      const name = normalizeFa(key);
      if (name && !index.has(name)) index.set(name, ins);
    }
  }
  return index;
}

/**
 * ردیف‌هایی که فقط برای نگاشتِ «نام پایه → کد» لازم‌اند.
 *
 * هیچ قیمتی از این ردیف‌ها برداشته نمی‌شود؛ تنها دو میدانشان خوانده
 * می‌شود. پس تازگی‌شان اهمیت ندارد و بایگانیِ ماهِ پیش هم به همان خوبیِ
 * تابلوی زنده جواب می‌دهد.
 */
async function boardRowsForIndex() {
  if (watch.rows.length) return watch.rows;
  try {
    const rows = firstList(await get('/Instrument/GetInstrumentOptionMarketWatch/0', Math.max(60, S.ttlMetaSec), 4));
    if (rows?.length) return rows;
  } catch { /* شبکه نبود — بایگانی پایین می‌نشیند */ }
  const last = await archiveLastDate();
  const archive = last ? await readArchive(String(last)) : null;
  return archive ? chainRowsFrom(archive) : [];
}

/** ردیف‌های زنجیرهٔ یک تاریخ، ساخته از دفتر. */
async function rosterUniverse(date, boardRows, { hasArchive = false } = {}) {
  const { rows, file } = await readRoster();
  const coverage = rosterCoverage(rows, file ? { from: file.scannedFrom, to: file.scannedTo } : null);
  const wanted = Number(date) || 0;

  // سیاستِ «کدام منبع» در هسته است، نه اینجا. سرور فقط اجرایش می‌کند —
  // وگرنه ترتیبِ سه منبع یک قاعدهٔ مالی می‌شد که هیچ آزمونی نمی‌گیردش.
  const plan = pickUniverseSource({ hasArchive, coverage, wanted });
  if (plan.source !== 'roster') return null;

  const live = rosterAt(rows, wanted);
  if (!live.length) return null;
  const index = baseIndexFrom(boardRows);
  const chain = rosterChainRows(live, { baseIndex: index, at: wanted });
  const known = chain.filter((row) => row.baseKnown);
  const lost = [...new Set(chain.filter((row) => !row.baseKnown).map((row) => row.lval30_UA))];
  return { rows: known, coverage, contracts: live.length, pairs: chain.length, lostBases: lost };
}

const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/** جملهٔ صداقتِ مسیرِ دفتر — چند قرارداد، و چه چیزی جا ماند. */
function rosterUniverseNote(built, wanted) {
  const head = `فهرست ${faNum(wanted)} از دفتر قراردادهای تاریخی آمد — ${faNum(built.contracts)} قرارداد زنده در آن روز، ${faNum(built.rows.length)} جفتِ کال و پوت. قراردادی که بعداً سررسید شده هم در این فهرست هست، پس سوگیری بقا ندارد.`;
  // دو نداشتهٔ دفتر، هر بار گفته می‌شوند. اندازهٔ قرارداد مهم‌تر است و
  // ساکت ماندنش خطرناک: در هر ستون پولی ضرب می‌شود، و لایهٔ بالاتر
  // پیش‌فرضِ اعلامی کاربر را جایش می‌گذارد. آن پیش‌فرض ممکن است برای سریِ
  // تعدیل‌شده غلط باشد و ردیف باید نشان‌دار بماند.
  const price = ' دفتر قیمت و اندازهٔ قرارداد ندارد: قیمتِ آن روز از مسیر تاریخی جدا می‌آید، و اندازه از پیش‌فرض اعلامی شما پر می‌شود و ردیف نشان‌دار می‌ماند.';
  if (!built.lostBases.length) return head + price;
  return `${head} ${faNum(built.lostBases.length)} نماد پایه در تابلوی امروز نبود و کدشان به دست نیامد، پس قراردادهایشان در این فهرست نیستند: ${built.lostBases.slice(0, 8).join('، ')}.${price}`;
}

async function watchLoop() {
  let fails = 0;
  for (;;) {
    const ok = await watchTick();
    fails = ok ? 0 : fails + 1;
    stat.watchConsecutiveFails = fails;
    await sleep(watchBackoffSec(Math.max(2, S.watchIntervalSec), fails) * 1000);
  }
}

// ————————————————————————————————— نقاط پایانی —————————————————————————————————

const MIME = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const sendJson = (res, code, obj) => send(res, code, JSON.stringify(obj));

const normalizeDailyRows = (rows) => rows.map((r) => ({
  date: Number(r.dEven), close: Number(r.pClosing) || 0, last: Number(r.pDrCotVal) || 0,
  low: Number(r.priceMin) || 0, high: Number(r.priceMax) || 0, first: Number(r.priceFirst) || 0,
  yday: Number(r.priceYesterday) || 0, vol: Number(r.qTotTran5J) || 0, trades: Number(r.zTotTran) || 0,
  // qTotCap ارزش معامله ثبت‌شده است. اگر بالادست آن را در تاریخچه ندهد،
  // موتور تحلیل مقدار تقریبی «حجم × قیمت پایانی» را جداگانه می‌سازد و برچسب می‌زند.
  value: Number(r.qTotCap) || 0,
})).sort((a, b) => a.date - b.date);

async function serveStatic(res, pathname) {
  const file = safeStaticPath(ROOT, pathname);
  if (!file) return send(res, 403, 'مسیر مجاز نیست', 'text/plain; charset=utf-8');
  try {
    const buf = await fs.readFile(file);
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'یافت نشد', 'text/plain; charset=utf-8');
  }
}

async function handle(req, res) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;
  const ins = u.searchParams.get('ins');

  try {
    if (p === '/api/health') {
      const gate = marketOpen();
      return sendJson(res, 200, {
        ok: true, upSec: Math.round((Date.now() - stat.started) / 1000),
        market: gate, ...stat,
        avgUpstreamMs: stat.upstreamCount ? Math.round(stat.upstreamMsTotal / stat.upstreamCount) : 0,
        cacheSize: cache.size, watchAgeSec: watch.at ? Math.round((Date.now() - watch.at) / 1000) : null,
        settingsWatchIntervalSec: S.watchIntervalSec,
      });
    }

    if (p === '/api/settings') {
      if (req.method === 'GET') return sendJson(res, 200, S);
      if (req.method === 'PUT') {
        const next = await saveSettings(JSON.parse(await readBody(req, MAX_BODY) || '{}'));
        tokens = Math.min(tokens, next.burst);
        log('تنظیمات ذخیره شد');
        return sendJson(res, 200, next);
      }
      return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
    }

    if (p === '/api/watch') {
      if (!watch.rows.length) await watchTick();
      return sendJson(res, 200, { at: watch.at, count: watch.rows.length, rows: watch.rows });
    }

    // کل معاملات امروز برای پایه و قراردادهای انتخابی. هر پاسخ snapshot
    // کامل از شروع بازار است؛ مرورگر با sequence ردیف تازه را تشخیص می‌دهد.
    // سقف ۲۴ ابزار جلوی یک انتخاب اشتباه و کوبیدن API بالادست را می‌گیرد.
    if (p === '/api/live-trades') {
      const codes = parseInsList(u.searchParams.get('ins'), 24);
      if (!codes.length) return sendJson(res, 400, { error: 'دست‌کم یک کد ابزار معتبر لازم است' });
      const one = async (code) => {
        try {
          const rows = normalizeTrades(firstList(await getFresh(`/Trade/GetTrade/${code}`, 2, 2)));
          return [code, { ins: code, rows, summary: summarizeLiveTrades(rows) }];
        } catch (e) {
          return [code, { ins: code, rows: [], error: `${e.name}: ${e.message}` }];
        }
      };
      const items = Object.fromEntries(await Promise.all(codes.map(one)));
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, { at: Date.now(), count: codes.length, items });
    }

    // داشبورد وسعت بازار پایه از اولین معامله امروز تا همین لحظه. نوار همه
    // پایه‌ها دیده می‌شود تا «بی‌معامله» با «بدون تغییر» اشتباه نشود؛ نماد
    // بی‌معامله در مخرج درصدهای مثبت/منفی وارد نمی‌شود و جدا می‌ماند.
    if (p === '/api/live-dashboard') {
      const sourceRows = watch.rows.length
        ? watch.rows
        : firstList(await get('/Instrument/GetInstrumentOptionMarketWatch/0', Math.max(60, S.ttlMetaSec), 4));
      const instruments = breadthInstruments(sourceRows).slice(0, 80);
      // دیده‌بان اختیار در پاسخ واقعی حجم/تعداد معامله پایه را نمی‌فرستد؛
      // بنابراین برای تشخیص «بی‌معامله» باید نوار همه پایه‌های یکتا دیده
      // شود. تعداد پایه‌ها کوچک و سقف این مسیر ۸۰ است؛ کش ۲۵ثانیه‌ای نیز
      // اجازه نمی‌دهد چند مرورگر سهمیه بالادست را چندبرابر کنند.
      const fetched = await Promise.all(instruments.map(async (item) => {
        try {
          const rows = normalizeTrades(firstList(await getFresh(`/Trade/GetTrade/${item.ins}`, 25, 3)));
          return [item.ins, rows, ''];
        } catch (e) {
          return [item.ins, [], `${e.name}: ${e.message}`];
        }
      }));
      const tradesByIns = Object.fromEntries(fetched.map(([ins, rows]) => [ins, rows]));
      const failed = fetched.filter(([, , error]) => error).map(([ins, , error]) => ({ ins, error }));
      const observed = instruments.map((item) => {
        const summary = summarizeLiveTrades(tradesByIns[item.ins] || []);
        return {
          ...item,
          last: summary.count ? summary.lastPrice : item.last,
          volume: summary.volume, value: summary.value, trades: summary.count,
        };
      });
      const snapshot = marketBreadthSnapshot(observed);
      const timeline = marketBreadthTimeline(instruments, tradesByIns, { bucketSeconds: 60 });
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, {
        at: Date.now(), count: instruments.length, traded: snapshot.traded,
        failed, snapshot, timeline, universe: decisionDashboardSnapshot(sourceRows, S),
      });
    }

    // ریزمعامله چند قرارداد/روز برای تب «نگاه باز».
    // بدنه آرایه جفت‌های دقیق است تا قرارداد بی‌معامله در یک روز، درخواست
    // اضافه نسازد. صف مشترک سرور همچنان سقف هم‌زمانی و سهمیه بالادست را
    // اعمال می‌کند؛ این نقطه پایانی راه فرار از rate limit نیست.
    if (p === '/api/trades/batch') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
      const body = JSON.parse(await readBody(req, MAX_BODY) || '{}');
      const raw = Array.isArray(body.requests) ? body.requests : [];
      if (!raw.length) return sendJson(res, 400, { error: 'فهرست قرارداد/روز خالی است' });
      if (raw.length > 1200) return sendJson(res, 413, { error: 'بازه برای ریزمعامله بزرگ است؛ تاریخ را کوتاه‌تر کن (سقف ۱۲۰۰ قرارداد/روز)' });
      const seen = new Set(), requests = [];
      for (const item of raw) {
        const code = String(item?.ins ?? ''), date = String(item?.date ?? '');
        if (!validIns(code) || !validCompactDate(date)) {
          return sendJson(res, 400, { error: 'هر درخواست باید کد ابزار رقمی و تاریخ هشت‌رقمی میلادی داشته باشد' });
        }
        const key = `${date}:${code}`;
        if (!seen.has(key)) { seen.add(key); requests.push({ key, code, date }); }
      }
      const one = async ({ key, code, date }) => {
        try {
          const rows = firstList(await get(historicalTradesPath(code, date), S.ttlDailySec, 6));
          return [key, { rows: normalizeTrades(rows) }];
        } catch (e) {
          return [key, { rows: [], error: `${e.name}: ${e.message}` }];
        }
      };
      return sendJson(res, 200, { count: requests.length, items: Object.fromEntries(await Promise.all(requests.map(one))) });
    }

    // فهرست قراردادهای فعال برای تحلیل تاریخی، حتی بیرون از ساعت بازار.
    // حلقه زنده عمداً پشت دروازه ساعت بازار می‌ایستد؛ این نقطه پایانی نباید
    // بایستد چون تاریخچه باید شب و روز قابل بررسی باشد.
    if (p === '/api/history/universe') {
      // ——— نسخهٔ آن تاریخ، اگر ضبط شده باشد ———
      //
      // بدون این، شبیه‌ساز سفر در زمان فهرست **امروز** را می‌دید و
      // قراردادی که داخل بازه سررسید شده اصلاً وجود نداشت. آن سوگیری بقا،
      // خودش خبری از آینده است.
      //
      // حالت میانی — بایگانی هست ولی برای آن تاریخ نه — عمداً `false`
      // برمی‌گرداند و فهرست امروز را با برچسب می‌دهد. اگر بی‌صدا جایگزین
      // می‌شد، همان سوگیری با ظاهرِ حل‌شده برمی‌گشت.
      const wanted = u.searchParams.get('date');
      if (wanted != null && wanted !== '') {
        if (!validArchiveDate(wanted)) return sendJson(res, 400, { error: 'تاریخ باید هشت رقم میلادی باشد' });
        const archive = await readArchive(wanted);
        if (archive) {
          const rows = chainRowsFrom(archive);
          const note = archiveNote({ wanted: Number(wanted), found: true, count: rows.length });
          return sendJson(res, 200, {
            at: archive.at, source: 'archive', asOf: archive.date, archived: true,
            note,
            quality: archiveQuality({
              wanted: Number(wanted), found: true, rows, source: 'watch-archive',
              asOf: { date: archive.date, second: archive.at }, note,
            }),
            market: marketOpen(), count: rows.length, rows,
          });
        }

        // ——— دفتر قراردادهای تاریخی، پیش از تسلیم شدن به فهرست امروز ———
        //
        // این همان تکه‌ای است که تا امروز نبود. بایگانی از روزِ نصب شروع
        // می‌شود؛ برای هر تاریخِ پیش از آن، تنها گزینه فهرست امروز بود و
        // آن فهرست دقیقاً قراردادهایی را ندارد که داخل بازه سررسید
        // شده‌اند — یعنی مرتبط‌ترین‌ها. دفتر همان‌ها را دارد.
        //
        // ترتیب عوض نشد و نباید بشود: بایگانیِ همان روز مشاهده است و
        // اندازهٔ قرارداد هم دارد، پس همیشه مقدم است. دفتر جای **نداشتن**
        // را می‌گیرد، نه جای مشاهده را.
        //
        // نگاشتِ نامِ پایه به کدش سه منبع دارد و هر سه یک چیز می‌گویند،
        // چون نمادِ پایه سررسید نمی‌شود. ترتیبشان فقط دربارهٔ تازگی است،
        // نه درستی — و مهم‌تر: اگر شبکه قطع باشد، بایگانی روی دیسک همان
        // نگاشت را دارد و کلِ مسیر دفتر بی‌شبکه هم کار می‌کند.
        const board = await boardRowsForIndex();
        const built = await rosterUniverse(Number(wanted), board, { hasArchive: Boolean(archive) });
        if (built?.rows.length) {
          const note = rosterUniverseNote(built, Number(wanted));
          return sendJson(res, 200, {
            at: rosterCache.file?.at ?? 0, source: 'roster', asOf: Number(wanted), archived: true,
            fromRoster: true, rosterCoverage: built.coverage,
            rosterContracts: built.contracts, lostBases: built.lostBases,
            contractSizeMissing: true,
            note,
            quality: archiveQuality({
              wanted: Number(wanted), found: true, rows: built.rows, source: 'option-roster',
              asOf: { date: Number(wanted), second: 0 }, note,
            }),
            market: marketOpen(), count: built.rows.length, rows: built.rows,
          });
        }
      }

      // ساعت مشاهده باید راست باشد، نه «هرچه دم دست بود». مصرف‌کننده با
      // همین عدد تصمیم می‌گیرد عکس مال کدام روز است؛ `watch.at` وقتی حلقهٔ
      // زنده هرگز نچرخیده باشد `null` است و در همان مسیر جایگزین، عکس از
      // کش می‌آید که ساعت خودش را دارد.
      const upstream = '/Instrument/GetInstrumentOptionMarketWatch/0';
      const fromWatch = watch.rows.length > 0;
      const firstDate = await archiveFirstDate();
      let rows, source, at, fallbackDate = 0;
      if (fromWatch) {
        rows = watch.rows; source = 'watch'; at = watch.at;
      } else {
        try {
          rows = firstList(await get(upstream, Math.max(60, S.ttlMetaSec), 4));
          source = 'snapshot'; at = cachedAt(upstream);
        } catch (boardError) {
          // ——— تابلوی زنده نرسید ———
          //
          // پیش از این، همین‌جا کل درخواست می‌مرد و استودیوی سفر زمانی حتی
          // فهرست نماد پایه هم نداشت: بازارِ بسته یا شبکهٔ قطع، یعنی ابزارِ
          // «گذشته» کاملاً بی‌استفاده. بایگانی روی دیسک همان موقع هم هست.
          //
          // پس تازه‌ترین روزِ بایگانی سرو می‌شود — ولی هرگز بی‌برچسب. اگر
          // بی‌صدا جای تابلو می‌نشست، کاربر فهرست روزِ دیگری را به‌جای امروز
          // می‌دید و نمی‌فهمید. نبودِ بایگانی هم با عدد ساختگی پر نمی‌شود:
          // همان خطای اصلی بالا می‌رود.
          const last = await archiveLastDate();
          const archive = last ? await readArchive(String(last)) : null;
          if (!archive) throw boardError;
          rows = chainRowsFrom(archive);
          source = 'watch-archive'; at = archive.at; fallbackDate = archive.date;
        }
      }
      const note = fallbackDate
        ? archiveBoardDownNote({ fallbackDate, count: rows.length, wanted: Number(wanted) || 0 })
        : (wanted ? archiveNote({ wanted: Number(wanted), found: false, firstDate }) : '');
      return sendJson(res, 200, {
        at,
        source,
        archived: false, asOf: fallbackDate, archiveFirstDate: firstDate,
        boardUnavailable: fallbackDate > 0,
        note,
        quality: archiveQuality({
          wanted: Number(wanted) || 0, found: false, rows, firstDate,
          source, asOf: at, note,
        }),
        market: marketOpen(),
        count: rows.length, rows,
      });
    }

    // ——— دفتر قراردادها: پوشش، بازه و وضعیت هر قرارداد در یک تاریخ ———
    //
    // این مسیر داده نمی‌سازد؛ فقط همان دفتری را می‌خواند که ابزارهای
    // `tools/roster-*.mjs` نوشته‌اند. اگر دفتر نباشد، جواب **خالیِ
    // برچسب‌دار** است نه خطا: رابط باید بتواند بگوید «هنوز ساخته نشده و
    // این دستور می‌سازدش»، نه اینکه قرمز شود.
    if (p === '/api/history/roster') {
      const { rows, file } = await readRoster();
      const coverage = rosterCoverage(rows, file ? { from: file.scannedFrom, to: file.scannedTo } : null);
      const from = u.searchParams.get('from') || '';
      const to = u.searchParams.get('to') || '';
      const at = u.searchParams.get('at') || '';
      const base = normalizeFa(u.searchParams.get('base') || '');
      const wantRows = u.searchParams.get('rows') === '1';

      for (const [name, value] of [['from', from], ['to', to], ['at', at]]) {
        if (value && !validArchiveDate(value)) {
          return sendJson(res, 400, { error: `«${name}» باید هشت رقم میلادی باشد` });
        }
      }

      let scoped = base ? rows.filter((row) => normalizeFa(row.base) === base) : rows;
      let summary = null, listed = [];
      if (from && to) {
        listed = rosterInRange(scoped, from, to);
        summary = rangeSummary(scoped, from, to);
      } else if (at) {
        listed = rosterAt(scoped, at).map((row) => ({ ...row, statusAt: contractStatus(row, at) }));
      }

      // سقف، تا پاسخ چند مگابایتی مرورگر را قفل نکند. بریدنش **گفته**
      // می‌شود؛ فهرستِ بریده‌ای که خودش را کامل جا بزند، همان دروغی است
      // که کل این ماژول برای رفعش نوشته شد.
      const CAP = 4000;
      const truncated = wantRows && listed.length > CAP;
      return sendJson(res, 200, {
        ready: coverage.count > 0,
        coverage,
        scanned: file ? { from: file.scannedFrom, to: file.scannedTo, at: file.at, intake: file.intake ?? null } : null,
        note: rosterNote({ coverage, from: Number(from) || 0, to: Number(to) || 0, summary }),
        summary,
        bases: [...new Set(rows.map((row) => row.base).filter(Boolean))].sort(),
        matched: listed.length,
        truncated,
        rows: wantRows ? listed.slice(0, CAP) : [],
        howTo: coverage.count ? '' : 'node tools/roster-scan.mjs --from ۲۰۲۴۰۹۰۱ --to امروز   یا   node tools/roster-import.mjs <فایل.xlsx>',
      });
    }

    if (p === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store', Connection: 'keep-alive',
      });
      res.write(': متصل شد\n\n');
      clients.add(res);
      stat.clients = clients.size;
      if (watch.rows.length) {
        res.write(`event: watch\ndata: ${JSON.stringify({ at: watch.at, full: true, count: watch.rows.length, rows: watch.rows })}\n\n`);
      }
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); stat.clients = clients.size; });
      return undefined;
    }

    // ——— داده تاریخ‌دار: فقط روزهای تکمیل‌شده ———
    //
    // یک دروازه برای هشت نوع، نه هشت نقطه پایانی. نوع در `kind` می‌آید و از
    // جدول `HISTORICAL_PATHS` رد می‌شود؛ هر چیزی که در آن جدول نباشد اصلاً
    // مسیری نمی‌سازد، پس یک اشتباه تایپی به درخواستِ ناخواسته تبدیل نمی‌شود.
    //
    // TTL بلند است چون این داده دیگر عوض نمی‌شود: روزِ تمام‌شده تمام است.
    // همین یک تفاوت، بار بالادست را در یک جلسهٔ شبیه‌سازی چند ده برابر کم
    // می‌کند، چون هر لحظه‌ای که کاربر عقب و جلو می‌رود روی همان یک پاسخ
    // می‌نشیند.
    if (p === '/api/hist' || p === '/api/hist/batch') {
      const kind = String(u.searchParams.get('kind') || '');
      const date = u.searchParams.get('date');
      if (!HISTORICAL_KINDS.includes(kind)) {
        return sendJson(res, 400, { error: `نوع تاریخی ناشناخته — یکی از ${HISTORICAL_KINDS.join('، ')}` });
      }
      if (!validCompactDate(date)) return sendJson(res, 400, { error: 'تاریخ باید هشت رقم میلادی باشد' });

      const one = async (code) => {
        const upstream = historicalPath(kind, code, date);
        if (!upstream) return [code, { ins: code, error: 'کد ابزار نامعتبر' }];
        try {
          const raw = await get(upstream, S.ttlDailySec, 6);
          return [code, { ins: code, ...shapeHistorical(kind, raw) }];
        } catch (e) {
          return [code, { ins: code, error: `${e.name}: ${e.message}` }];
        }
      };

      if (p === '/api/hist') {
        if (!validIns(ins)) return sendJson(res, 400, { error: 'کد ابزار باید فقط رقم باشد' });
        const [, body] = await one(ins);
        return sendJson(res, 200, { kind, date: Number(date), ...body });
      }
      const codes = parseInsList(u.searchParams.get('ins'), 60);
      if (!codes.length) return sendJson(res, 400, { error: 'دست‌کم یک کد ابزار لازم است' });
      const pairs = await Promise.all(codes.map(one));
      return sendJson(res, 200, { kind, date: Number(date), byIns: Object.fromEntries(pairs) });
    }

    // ——— غنی‌سازی، فقط بر اساس تقاضا ———
    // کد ابزار مستقیم داخل مسیر بالادست می‌نشیند. بدون صحت‌سنجی، یک «..»
    // درخواست را به نقطه پایانی دیگری می‌برد.
    if (p === '/api/book' || p === '/api/info' || p === '/api/optionmeta'
      || p === '/api/daily' || p === '/api/trades' || p === '/api/clienttype') {
      if (!validIns(ins)) return sendJson(res, 400, { error: 'کد ابزار باید فقط رقم باشد' });
    }

    if (p === '/api/book') {
      const rows = firstList(await get(`/BestLimits/${ins}`, S.ttlBookSec, 3));
      const book = rows
        .map((r) => ({
          level: Number(r.number), bid: Number(r.pMeDem) || 0, bidQty: Number(r.qTitMeDem) || 0,
          bidOrd: Number(r.zOrdMeDem) || 0, ask: Number(r.pMeOf) || 0, askQty: Number(r.qTitMeOf) || 0,
          askOrd: Number(r.zOrdMeOf) || 0,
        }))
        .filter((r) => Number.isFinite(r.level))
        .sort((a, b) => a.level - b.level)
        .slice(0, 5);
      return sendJson(res, 200, { ins, book });
    }

    if (p === '/api/info') {
      const d = firstDict(await get(`/ClosingPrice/GetClosingPriceInfo/${ins}`, S.ttlInfoSec, 3));
      const st = d.instrumentState && typeof d.instrumentState === 'object' ? d.instrumentState : {};
      return sendJson(res, 200, {
        ins,
        last: Number(d.pDrCotVal) || 0, close: Number(d.pClosing) || 0,
        yday: Number(d.priceYesterday) || 0, first: Number(d.priceFirst) || 0,
        low: Number(d.priceMin) || 0, high: Number(d.priceMax) || 0,
        vol: Number(d.qTotTran5J) || 0, trades: Number(d.zTotTran) || 0,
        value: Number(d.qTotCap) || 0,
        hEven: Number(d.hEven) || 0, lastHEven: Number(d.lastHEven) || 0,
        state: String(st.cEtaval || '').trim(), stateTitle: String(st.cEtavalTitle || '').trim(),
      });
    }

    // مشخصات تک‌قراردادی: اندازه قرارداد و ضرایب A و B و C همان قرارداد.
    //
    // عمداً هیچ مسیر محاسبه‌ای این را صدا نمی‌زند. اندازه از ردیف دیده‌بان
    // می‌آید که همان مشخصات را دسته‌جمعی و بدون درخواست اضافه می‌رساند؛ این
    // endpoint برای هر قرارداد یک درخواست جدا می‌خواهد و اسکن هزاران
    // قراردادی را کند می‌کند بی‌آنکه عدد بهتری بدهد. ضرایب وجه تضمین هم از
    // تنظیمات خوانده می‌شوند، نه از اینجا — عوض‌کردن منبعشان یعنی عوض‌شدن
    // خروجی وجه تضمین، که تصمیم جداگانه‌ای است و باید آگاهانه گرفته شود.
    // برای بازرسی دستی یک قرارداد باز مانده است.
    if (p === '/api/optionmeta') {
      const info = firstDict(await get(`/Instrument/GetInstrumentInfo/${ins}`, S.ttlMetaSec, 4));
      const iid = info.instrumentID;
      if (!iid) return sendJson(res, 200, { ins, found: false });
      const d = firstDict(await get(`/Instrument/GetInstrumentOptionByInstrumentID/${iid}`, S.ttlMetaSec, 4));
      return sendJson(res, 200, {
        ins, found: true, instrumentID: iid,
        A: Number(d.aFactor), B: Number(d.bFactor), C: Number(d.cFactor),
        contractSize: Number(d.contractSize) || 0, strike: Number(d.strikePrice) || 0,
        buyOP: Number(d.buyOP) || 0, sellOP: Number(d.sellOP) || 0,
      });
    }

    if (p === '/api/daily') {
      const rawN = u.searchParams.get('n');
      const n = rawN == null || rawN === '' ? S.volDays : Math.max(0, Math.trunc(Number(rawN) || 0));
      const rows = firstList(await get(`/ClosingPrice/GetClosingPriceDailyList/${ins}/${n}`, S.ttlDailySec, 6));
      return sendJson(res, 200, {
        ins,
        rows: normalizeDailyRows(rows),
      });
    }

    if (p === '/api/trades') {
      const date = u.searchParams.get('date');
      if (!validCompactDate(date)) return sendJson(res, 400, { error: 'تاریخ باید هشت رقم میلادی باشد' });
      const rows = firstList(await get(historicalTradesPath(ins, date), S.ttlDailySec, 6));
      return sendJson(res, 200, { ins, date: Number(date), rows: normalizeTrades(rows) });
    }

    // تاریخچه دسته‌ای همه پاهای یک زنجیره. n=0 یعنی از اولین روز موجود.
    if (p === '/api/dailies') {
      const codes = parseInsList(u.searchParams.get('ins'), 200);
      const rawN = u.searchParams.get('n');
      const n = rawN == null || rawN === '' ? 0 : Math.max(0, Math.trunc(Number(rawN) || 0));
      const one = async (code) => {
        try {
          const rows = firstList(await get(`/ClosingPrice/GetClosingPriceDailyList/${code}/${n}`, S.ttlDailySec, 6));
          return [code, { ins: code, rows: normalizeDailyRows(rows) }];
        } catch (e) {
          return [code, { ins: code, rows: [], error: `${e.name}: ${e.message}` }];
        }
      };
      return sendJson(res, 200, Object.fromEntries(await Promise.all(codes.map(one))));
    }

    if (p === '/api/clienttype') {
      const d = firstDict(await get(`/ClientType/GetClientType/${ins}/1/0`, S.ttlInfoSec, 6));
      return sendJson(res, 200, { ins, ...d });
    }

    // ——— دریافت دسته‌ای: یک رفت و برگشت به‌جای چند ده تا ———
    if (p === '/api/books' || p === '/api/infos') {
      const codes = parseInsList(u.searchParams.get('ins'), 200);
      const wantBook = p === '/api/books';
      const one = async (code) => {
        try {
          if (wantBook) {
            const rows = firstList(await get(`/BestLimits/${code}`, S.ttlBookSec, 3));
            const book = rows
              .map((r) => ({
                level: Number(r.number), bid: Number(r.pMeDem) || 0, bidQty: Number(r.qTitMeDem) || 0,
                bidOrd: Number(r.zOrdMeDem) || 0, ask: Number(r.pMeOf) || 0, askQty: Number(r.qTitMeOf) || 0,
                askOrd: Number(r.zOrdMeOf) || 0,
              }))
              .filter((r) => Number.isFinite(r.level))
              .sort((a, b) => a.level - b.level)
              .slice(0, 5);
            return [code, { book }];
          }
          const d = firstDict(await get(`/ClosingPrice/GetClosingPriceInfo/${code}`, S.ttlInfoSec, 3));
          const st = d.instrumentState && typeof d.instrumentState === 'object' ? d.instrumentState : {};
          const hE = Number(d.lastHEven) || Number(d.hEven) || 0;
          const secs = hE ? (Math.floor(hE / 10000) * 3600 + Math.floor((hE / 100) % 100) * 60 + (hE % 100)) : 0;
          const nowT = tehranNow().minutes * 60;
          return [code, {
            last: Number(d.pDrCotVal) || 0, close: Number(d.pClosing) || 0,
            low: Number(d.priceMin) || 0, high: Number(d.priceMax) || 0,
            first: Number(d.priceFirst) || 0, yday: Number(d.priceYesterday) || 0,
            vol: Number(d.qTotTran5J) || 0, trades: Number(d.zTotTran) || 0,
            state: String(st.cEtaval || '').trim(), stateTitle: String(st.cEtavalTitle || '').trim(),
            staleSec: hE ? Math.max(0, nowT - secs) : null,
          }];
        } catch (e) {
          return [code, { error: `${e.name}` }];
        }
      };
      const pairs = await Promise.all(codes.map(one));
      return sendJson(res, 200, Object.fromEntries(pairs));
    }

    // ——— موقعیت‌های واقعی تو ———
    if (p === '/api/positions') {
      const file = path.join(ROOT, 'data', 'positions.json');
      if (req.method === 'GET') {
        try { return send(res, 200, await fs.readFile(file, 'utf8')); }
        catch { return sendJson(res, 200, []); }
      }
      if (req.method === 'PUT') {
        const list = JSON.parse(await readBody(req, MAX_BODY) || '[]');
        if (!Array.isArray(list)) return sendJson(res, 400, { error: 'فهرست لازم است' });
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf8');
        log(`موقعیت‌ها ذخیره شد — ${list.length} ردیف`);
        return sendJson(res, 200, list);
      }
      return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
    }

    // ——— پرونده‌های پایان جلسهٔ سفر زمانی سبد ———
    // هر شناسه فقط یک بار نوشته می‌شود. حذف و بازنویسی عمدی وجود ندارد.
    if (p === '/api/portfolio/dossiers') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
      const listed = await listPortfolioDossierSaves(PORTFOLIO_DOSSIER_DIR);
      return sendJson(res, 200, { count: listed.records.length, dossiers: listed.records });
    }

    if (p === '/api/portfolio/dossier') {
      const id = u.searchParams.get('id');
      if (!validSessionId(id)) return sendJson(res, 400, { error: 'شناسه جلسه معتبر نیست' });
      if (req.method === 'GET') {
        const loaded = await loadPortfolioDossierSave(PORTFOLIO_DOSSIER_DIR, id);
        if (!loaded.ok) return sendJson(res, loaded.notFound ? 404 : 409, { error: loaded.why });
        return sendJson(res, 200, loaded.record);
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(await readBody(req, PORTFOLIO_DOSSIER_MAX_BODY) || 'null');
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return sendJson(res, 400, { error: 'بدنه ذخیره پرونده لازم است' });
        }
        if (body.schemaVersion !== PORTFOLIO_DOSSIER_SAVE_VERSION) {
          return sendJson(res, 400, { error: 'نسخه ذخیره پرونده ناشناخته یا پشتیبانی‌نشده است' });
        }
        if (body.session?.id !== id || body.dossier?.sessionId !== id) {
          return sendJson(res, 400, { error: 'شناسه بدنه با شناسه درخواست یکی نیست' });
        }
        const saved = await savePortfolioDossier(
          PORTFOLIO_DOSSIER_DIR, body.session, body.dossier, {
            savedAt: Date.now(), capitalContinuity: body.capitalContinuity,
          },
        );
        if (!saved.ok) return sendJson(res, saved.conflict ? 409 : 400, { error: saved.why });
        log(`پرونده پایان سفر زمانی ذخیره شد — ${id}`);
        return sendJson(res, 200, {
          ok: true, id, schemaVersion: saved.record.schemaVersion,
          savedAt: saved.record.savedAt, closedAt: saved.record.dossier.closedAt,
        });
      }
      return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
    }

    // ——— پیش‌نویس‌ها و جلسه‌های فعال استودیوی سفر زمانی سبد ———
    // منبع حقیقت فایل نسخه‌دار سرور است؛ مرورگر فقط همان draft معتبر را
    // می‌فرستد و زمان ثبت را سرور تعیین می‌کند. حذف عمدی وجود ندارد.
    if (p === '/api/portfolio/sessions') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
      const listed = await listPortfolioMissionSaves(PORTFOLIO_MISSION_DIR);
      return sendJson(res, 200, { count: listed.records.length, sessions: listed.records });
    }

    if (p === '/api/portfolio/session') {
      const id = u.searchParams.get('id');
      if (!validSessionId(id)) return sendJson(res, 400, { error: 'شناسه جلسه معتبر نیست' });
      if (req.method === 'GET') {
        const loaded = await loadPortfolioMissionSave(PORTFOLIO_MISSION_DIR, id);
        if (!loaded.ok) return sendJson(res, loaded.notFound ? 404 : 409, { error: loaded.why });
        return sendJson(res, 200, loaded.record);
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(await readBody(req, PORTFOLIO_MISSION_MAX_BODY) || 'null');
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return sendJson(res, 400, { error: 'بدنه ذخیره مأموریت لازم است' });
        }
        if (body.schemaVersion !== PORTFOLIO_MISSION_SAVE_VERSION) {
          return sendJson(res, 400, { error: 'نسخه ذخیره مأموریت ناشناخته یا پشتیبانی‌نشده است' });
        }
        if (body.draft?.session?.id !== id) {
          return sendJson(res, 400, { error: 'شناسه بدنه با شناسه درخواست یکی نیست' });
        }
        const saved = await savePortfolioMissionDraft(PORTFOLIO_MISSION_DIR, body.draft, {
          savedAt: Date.now(),
          expectedSavedAt: body.expectedSavedAt ?? null,
        });
        if (!saved.ok) return sendJson(res, saved.conflict ? 409 : 400, { error: saved.why });
        log(`مأموریت سفر زمانی ذخیره شد — ${id} · ${saved.record.draft.step}`);
        return sendJson(res, 200, {
          ok: true, id, schemaVersion: saved.record.schemaVersion,
          savedAt: saved.record.savedAt, step: saved.record.draft.step,
          state: saved.record.draft.session.state,
        });
      }
      return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
    }

    // ——— جلسه‌های «سفره پر برکت بازار» ———
    //
    // هر جلسه یک فایل. پایگاه داده‌ای در کار نیست و قاعدهٔ صفر وابستگی هم
    // اجازهٔ درایور نمی‌دهد؛ ولی مسئله فقط قاعده نیست: یک جلسه با ده‌ها
    // ارزش‌گذاری از هشت تا دوازده پوزیشن سایه، در یک فایل مشترک با بقیه،
    // هر ذخیره را به بازنویسی کل تاریخچه تبدیل می‌کرد.
    //
    // **حذفی در کار نیست.** سند می‌گوید هر جلسه از لحظهٔ شروع ثبت و قفل
    // می‌شود، حتی جلسه‌ای که کاربر رهایش کند، و جلسات رهاشده در آمار
    // شمرده می‌شوند. اگر حذف ممکن بود، همین بند از بین می‌رفت: هر کس
    // می‌توانست جلسه‌های بدش را پاک کند و آمارِ باقی‌مانده، آمار یک
    // معامله‌گر دیگر می‌شد.
    if (p === '/api/bereket/sessions') {
      const dir = path.join(ROOT, 'data', 'bereket');
      let names = [];
      try { names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')); } catch { names = []; }
      const rows = [];
      for (const name of names) {
        try { rows.push(JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))); }
        catch { rows.push({ id: name.replace(/\.json$/, ''), broken: true }); }
      }
      return sendJson(res, 200, { count: rows.length, sessions: rows });
    }

    if (p === '/api/bereket/session') {
      const id = u.searchParams.get('id');
      if (!validSessionId(id)) return sendJson(res, 400, { error: 'شناسهٔ جلسه فقط حرف و رقم و خط تیره است' });
      const file = path.join(ROOT, 'data', 'bereket', `${id}.json`);
      if (req.method === 'GET') {
        try { return send(res, 200, await fs.readFile(file, 'utf8')); }
        catch { return sendJson(res, 404, { error: 'جلسه پیدا نشد' }); }
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(await readBody(req, MAX_BODY) || 'null');
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return sendJson(res, 400, { error: 'بدنهٔ جلسه لازم است' });
        }
        if (body.id !== id) return sendJson(res, 400, { error: 'شناسهٔ بدنه با شناسهٔ درخواست یکی نیست' });
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(body, null, 2), 'utf8');
        log(`جلسهٔ برکت ذخیره شد — ${id}`);
        return sendJson(res, 200, { ok: true, id });
      }
      return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
    }

    // دفتر خطاها. برنامه در مرورگر باز است و کاربر ترمینال سرور را نمی‌بیند؛
    // بدون این نقطه پایانی، «چه شد؟» هیچ پاسخی ندارد.
    if (p === '/api/logs') {
      if (req.method === 'DELETE') { errlog.clear(); return sendJson(res, 200, { ok: true }); }
      if (req.method === 'POST') {
        // خطای سمت مرورگر هم اینجا می‌نشیند تا یک دفتر واحد باشد، نه دو تا.
        const body = JSON.parse(await readBody(req, MAX_BODY) || '{}');
        for (const item of (Array.isArray(body.rows) ? body.rows : []).slice(0, 50)) {
          errlog.push({
            level: item.level === 'warn' ? 'warn' : 'error',
            where: `مرورگر · ${item.where || '—'}`,
            message: item.message || '', detail: item.detail || '',
          });
        }
        return sendJson(res, 200, { ok: true, ...errlog.stats() });
      }
      return sendJson(res, 200, {
        rows: errlog.list({
          limit: Math.min(300, Math.max(1, Number(u.searchParams.get('limit')) || 100)),
          sinceSeq: Number(u.searchParams.get('since')) || 0,
          level: u.searchParams.get('level') || null,
        }),
        ...errlog.stats(),
        market: marketOpen(), lastError: stat.lastError, lastErrorAt: stat.lastErrorAt,
      });
    }

    if (p === '/api/cache' && req.method === 'DELETE') {
      cache.clear();
      return sendJson(res, 200, { cleared: true });
    }

    if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'نقطه پایانی ناشناخته' });
    return serveStatic(res, p);
  } catch (e) {
    // بدنه بزرگ و جیسون خراب، خطای فرستنده‌اند نه خطای بالادست
    if (e instanceof BodyTooLarge) return sendJson(res, 413, { error: e.message });
    if (e instanceof SyntaxError) return sendJson(res, 400, { error: 'بدنه، جیسون معتبر نیست' });
    logErr(`درخواست ${p}`, e);
    return sendJson(res, 502, { error: `${e.name}: ${e.message}` });
  }
}

await loadSettings();
http.createServer(handle).listen(PORT, '127.0.0.1', () => {
  log(`سرور بالا آمد → http://127.0.0.1:${PORT}`);
  const g = marketOpen();
  log(g.open ? 'بازار باز است، حلقه دیده‌بان شروع شد' : `حلقه دیده‌بان متوقف: ${g.why}`);
});
watchLoop();
