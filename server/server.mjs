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
import { num } from '../core/num.mjs';
import { normalizeTrades, normalizeTradesDetailed } from '../core/backtest.mjs';
import { closingCoverage, coversDailyDate, trustedDailyRows } from '../core/daily-trust.mjs';
import { chooseTape, dailyExpectation } from '../core/tape-choice.mjs';
import { upstreamShape, upstreamShapeLabel } from '../core/upstream-shape.mjs';
import { normalizeBookEvents } from '../core/book-history.mjs';
import {
  makeArchive, chainRowsFrom, archiveNote, archiveBoardDownNote, archiveQuality, archiveName, validArchiveDate,
} from '../core/watch-archive.mjs';
import {
  completeRosterBaseIndex, contractStatus, makeRosterFile, missingDays, normalizeFa,
  pickUniverseSource, rangeSummary, rosterAt, rosterChainRows, rosterCoverage,
  repairRosterBaseNames, repairRosterSides, rosterCovers, rosterHealth, rosterInRange, rosterNote, ROSTER_VERSION,
} from '../core/option-roster.mjs';
import { scanBoardRows, tradingDays } from '../core/roster-scan.mjs';
import { runRosterBuild } from '../core/roster-build.mjs';
import { infoPath, instrumentInfo, optionSpec, optionSpecPath } from '../core/roster-catalog.mjs';
import { readJsonSafe } from '../core/json-safe.mjs';
import { tehranDateNumber, LIVE_SOURCE_TAPE } from '../core/live-day.mjs';
import {
  breadthInstruments, marketBreadthSnapshot, marketBreadthTimeline, summarizeLiveTrades,
} from '../core/live-market.mjs';
import { decisionDashboardSnapshot, mergeUnderlyingTrades } from '../core/decision-dashboard.mjs';
import { makeUpstreamTally } from '../core/upstream-tally.mjs';
import { JOURNAL_CAP, appendEntry, makeEntry, normalizeJournal } from '../core/journal.mjs';
import { writeJsonAtomic } from './atomic-json.mjs';
import { watchHealth } from '../core/watch-health.mjs';
import { makeJobQueue } from './job-queue.mjs';
import {
  validIns, validCompactDate, historicalTradesPath, historicalTradesAltPath, historicalPath, HISTORICAL_KINDS,
  validSessionId, parseInsRequest, safeStaticPath, readBody, BodyTooLarge,
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
  await writeJsonAtomic(SETTINGS_FILE, S, { space: 2 });
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

// بارِ بالادست به تفکیکِ سرویس — «۲۰۸۲ درخواست» را به «کدام سرویس» تبدیل
// می‌کند. سیاستی اعمال نمی‌کند، فقط می‌شمارد.
const tally = makeUpstreamTally();

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

// صف در `server/job-queue.mjs` است، نه اینجا: ایرادِ گرسنگیِ حلقهٔ زنده یک
// ایرادِ ترتیب بود، و ترتیب را فقط وقتی می‌شود سنجید که از شبکه جدا باشد.
// سطل ژتون بیرون می‌ماند و از `beforeRun` تزریق می‌شود.
const jobs = makeJobQueue({
  concurrency: () => S.concurrency,
  beforeRun: async () => {
    const wait = takeToken();
    if (wait > 0) { stat.rateWaits += 1; await sleep(wait); takeToken(); }
  },
  onChange: (depth, running) => { stat.queueDepth = depth; stat.inflight = running; },
});

const schedule = (fn, priority = 5, ticket = null) => jobs.push(fn, priority, ticket);

/**
 * ═══ وارونگیِ اولویت، از راهِ ادغامِ درخواستِ در پرواز ═══
 *
 * گزارش بازآزماییِ ۱۴۰۵/۰۶/۱۶: «پس از بازکردن هم‌زمان آزمایشگاه، رصد یونانی
 * و رادار فاصله … `watchTicks` روی ۹۰ ثابت ماند و `watchAgeSec` از ۱۶۳ به
 * ۲۹۰ ثانیه رسید» — با `paused=false` و بدون هیچ خطایی.
 *
 * `/Instrument/GetInstrumentOptionMarketWatch/0` چهار صدازننده دارد: حلقهٔ
 * زندهٔ دیده‌بان با اولویت ۱، و سه مسیرِ تاریخی/دفتری با اولویت ۴. اگر یکی
 * از آن سه اول برسد، کارش با اولویت ۴ **ته صف** می‌نشیند و در `inflight`
 * ثبت می‌شود. حلقهٔ زنده که چند لحظه بعد همان نشانی را می‌خواهد، به قاعدهٔ
 * ادغام همان وعده را می‌گیرد — و با آن، جای صفِ اولویتِ ۴ را هم به ارث
 * می‌برد. اولویتِ ۱ روی کاغذ می‌ماند و در عمل پشتِ صدها درخواستِ تاریخی
 * می‌ایستد.
 *
 * ادغام درست است و نباید برداشته شود (وگرنه چند تب سهمیهٔ بالادست را چند
 * برابر می‌کنند). آنچه غلط بود، به ارث نبردنِ **اولویت** است: وقتی صاحبِ
 * عجول‌تری به یک کارِ هنوز-شروع‌نشده می‌پیوندد، آن کار باید عجلهٔ او را
 * بگیرد. کارِ در حالِ اجرا جابه‌جا نمی‌شود — آنجا صف معنی ندارد.
 */
const boostTicket = (ticket, priority) => jobs.boost(ticket, priority);

// ————————————————————————————————— کش و ادغام درخواست در پرواز —————————————————————————————————

const cache = new Map();     // url -> { at, data }
const inflight = new Map();  // url -> { promise, ticket }

async function fetchUpstream(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), S.timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // `res.json()` نه: شناسهٔ هفده‌رقمی از مرز امنِ عددی جاوااسکریپت رد
    // می‌شود و `JSON.parse` بی‌هیچ خطایی ارقام آخرش را گرد می‌کند. عددِ
    // گردشده به هیچ قراردادی نمی‌خورد و ردیفش «بی‌داده» به نظر می‌رسد،
    // نه «خراب» — بدترین شکل ممکن برای یک خطا.
    const js = await readJsonSafe(res);
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
  // پاسخِ خالی عمرِ کوتاه‌ترِ خودش را دارد؛ چرایش کنار `ttlEmptySec` نوشته است.
  const liveFor = hit?.empty ? Math.min(ttlSec, Math.max(0, num(S.ttlEmptySec, 60))) : ttlSec;
  if (hit && Date.now() - hit.at < liveFor * 1000) { stat.cacheHits += 1; tally.cacheHit(pathname); return hit.data; }
  // پیوستن به درخواستِ در پرواز، عجلهٔ صدازنندهٔ تازه را هم با خودش می‌برد.
  const held = inflight.get(url);
  if (held) { boostTicket(held.ticket, priority); return held.promise; }

  const ticket = { priority, job: null };
  const p = (async () => {
    let lastErr;
    for (let attempt = 0; attempt <= S.retries; attempt++) {
      try {
        stat.requests += 1;
        tally.request(pathname);
        // اولویت از بلیت خوانده می‌شود نه از پارامتر: ممکن است بین دو تلاش
        // صدازنندهٔ عجول‌تری پیوسته باشد، و تلاشِ بعدی باید عجلهٔ او را داشته
        // باشد نه عجلهٔ صدازنندهٔ اول را.
        const data = await schedule(() => fetchUpstream(url), ticket.priority, ticket);
        // «خالی» یعنی پاسخ آمد ولی هیچ ردیفی نداشت. این با «نیامد» فرق
        // دارد و کش می‌شود — ولی نه به همان درازا.
        cache.set(url, { at: Date.now(), data, empty: firstList(data).length === 0 });
        evictOldest(cache, S.maxCacheEntries);
        return data;
      } catch (e) {
        lastErr = e;
        stat.errors += 1;
        tally.error(pathname);
        stat.lastError = `${e.name}: ${e.message}`;
        stat.lastErrorAt = Date.now();
        // ═══ `path` ماژولِ node بود، نه مسیرِ درخواست ═══
        //
        // گزارش عملیاتیِ ۱۴۰۵/۰۶/۱۶: «دفتر خطا محل را به‌شکل بی‌فایده
        // «بالادست [object Object]» ثبت می‌کند و endpoint معیوب را نشان
        // نمی‌دهد.» در ۱۵۷ خطای HTTP 502 هیچ‌کدام نگفتند کدام سرویس افتاده.
        //
        // نامِ پارامتر `pathname` است و `path` بالای همین فایل ماژولِ
        // `node:path` — قالب‌بندی رشته‌ای هیچ خطایی نمی‌دهد و بی‌صدا
        // `[object Object]` می‌نویسد. `url` کامل ثبت می‌شود تا پرس‌وجوی
        // دقیقاً شکست‌خورده قابل بازسازی باشد.
        errlog.push({ level: 'error', where: `بالادست ${pathname}`, message: stat.lastError, detail: `تلاش ${attempt + 1} از ${S.retries + 1} — ${url}` });
        if (attempt < S.retries) await sleep(300 * 2 ** attempt);
      }
    }
    throw lastErr;
  })().finally(() => inflight.delete(url));

  inflight.set(url, { promise: p, ticket });
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
/**
 * ═══ R5-04: «تازه» دو چیز بود و باید دو چیز بماند ═══
 *
 * `bust` تعیین می‌کند مهرِ زمان به URLِ بالادست بچسبد یا نه؛ کشِ **خودمان**
 * در هر حال دور زده می‌شود، چون تلاشِ دوباره‌ای که از کشِ خودمان جواب
 * بگیرد اصلاً تلاشِ دوباره نیست.
 *
 * چرا این تفکیک لازم شد: آزمونِ عملیِ F-04 ثبت کرد که همان ابزار/روز با
 * URLِ ساده دو هزار ردیف داد و با URLِ مهرخورده صفر. تا امروز هر تلاشِ
 * پس از دورِ اول فقط URLِ مهرخورده را می‌زد. اولین تلاش برای عوض‌کردنِ
 * پرچم بین دورها هم بی‌اثر بود — چون دورِ «ساده» به مسیرِ کشِ ۹۰۰ثانیه‌ای
 * می‌افتاد و اصلاً به بالادست نمی‌رسید؛ در اجرای آزمایشی، بالادست برای هر
 * مسیر فقط ۳ بار پرسیده شد در حالی که ۴ دور رفته بود.
 *
 * کلیدِ کش هم پیشوندِ حالت می‌گیرد، وگرنه دو شکلِ URL پاسخِ هم را
 * می‌خورند و تفکیک دوباره از بین می‌رود.
 */
async function getFresh(pathname, ttlSec = 2, priority = 2, { bust = true } = {}) {
  const key = `fresh:${bust ? 'b' : 'p'}:${pathname}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlSec * 1000) { stat.cacheHits += 1; tally.cacheHit(pathname); return hit.data; }
  const joined = inflight.get(key);
  if (joined) { boostTicket(joined.ticket, priority); return joined.promise; }

  const ticket = { priority, job: null };
  const pending = (async () => {
    let lastErr;
    for (let attempt = 0; attempt <= S.retries; attempt++) {
      try {
        stat.requests += 1;
        tally.request(pathname);
        const join = pathname.includes('?') ? '&' : '?';
        const url = bust ? `${S.baseUrl}${pathname}${join}_=${Date.now()}` : `${S.baseUrl}${pathname}`;
        const data = await schedule(() => fetchUpstream(url), ticket.priority, ticket);
        cache.set(key, { at: Date.now(), data });
        evictOldest(cache, S.maxCacheEntries);
        return data;
      } catch (e) {
        lastErr = e;
        stat.errors += 1;
        tally.error(pathname);
        stat.lastError = `${e.name}: ${e.message}`;
        stat.lastErrorAt = Date.now();
        // این مسیر تا امروز هیچ‌چیز در دفتر خطا نمی‌نوشت: خطای «عکس تازه»
        // فقط در شمارندهٔ کل می‌نشست و کاربرِ مرورگر هیچ ردی از آن نمی‌دید.
        errlog.push({ level: 'error', where: `بالادست ${pathname}`, message: stat.lastError, detail: `تلاش ${attempt + 1} از ${S.retries + 1} — عکس تازه` });
        if (attempt < S.retries) await sleep(300 * 2 ** attempt);
      }
    }
    throw lastErr;
  })().finally(() => inflight.delete(key));

  inflight.set(key, { promise: pending, ticket });
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

// ═══════════════ سقفِ ابزار: رد کن، نبُر ═══════════════
//
// ممیزی ۱۴۰۵/۰۶/۲۹، بند ۴: `parseInsList` با رسیدن به سقف حلقه را
// می‌شکست — نه خطای «بزرگی درخواست»، نه فهرستِ حذف‌شده‌ها. ۲۰۱ شناسه
// می‌رفت و ۲۰۰ تا برمی‌گشت، و شناسهٔ آخر هیچ‌جا گزارش نمی‌شد.
//
// چرا این از یک عددِ کم بدتر است: مصرف‌کننده‌ای که پاسخ را با کلیدِ کد
// می‌خواند، برای کدِ حذف‌شده «کلیدی نبود» می‌بیند و آن را «داده‌ای نداشت»
// می‌خواند. یعنی سقفِ مهارِ سرور به یک **ادعای دروغ دربارهٔ بازار**
// ترجمه می‌شد.
//
// قاعدهٔ تازه: هر مسیرِ دسته‌ای یا همهٔ کدها را جواب می‌دهد، یا ۴۱۳ و
// عددِ سقف. بریدن گزینه نیست. مصرف‌کننده خودش دسته‌بندی می‌کند و چون خطا
// صریح است، دسته‌بندیِ نکرده در همان اجرای اول دیده می‌شود.
function insListOrReject(res, raw, max, label) {
  const parsed = parseInsRequest(raw, max);
  if (parsed.overflow > 0) {
    sendJson(res, 413, {
      error: `${label}: سقف هر درخواست ${max} ابزار است و ${parsed.requested} تا آمد`
        + ` — ${parsed.overflow} ابزار جا نمی‌شود. فهرست را دسته‌بندی کن.`,
      max, requested: parsed.requested, overflow: parsed.overflow,
    });
    return null;
  }
  if (!parsed.codes.length) {
    sendJson(res, 400, { error: 'دست‌کم یک کد ابزار معتبر لازم است' });
    return null;
  }
  return parsed.codes;
}

// ═════════════ یک دریافت‌کننده برای همهٔ مسیرهای ریزمعاملهٔ تاریخی ═════════════
//
// ممیزی ۱۴۰۵/۰۶/۲۹، نمونهٔ واقعی — اهرم، `17914401175772326`، `20260919`:
//
//   فهرست روزانه              ۷٬۷۳۶ معامله / ۷۳٬۳۰۵٬۲۲۴ حجم
//   GetTradeHistory/…/true    صفر  / صفر
//   GetTradeHistory/…/false   ۷٬۷۳۶ / ۷۳٬۳۰۵٬۲۲۴   ← همان روز، کامل
//
// یعنی داده **بود** و مسیر اول آن را خالی می‌داد. `/api/trades/batch`
// تلاشِ دومِ پرچمِ دیگر را داشت، ولی `/api/trades` و
// `/api/hist?kind=trades` نداشتند. نتیجه: یک ابزار/روز در خروجی دیتا پر
// و در بک‌تستِ سبد خالی دیده می‌شد — دو مسیر، دو حقیقت.
//
// این تابع تنها راهِ رسیدن به ریزمعاملهٔ تاریخی است. هر سه مسیر از همین
// می‌گذرند، پس تفاوتِ رفتار دیگر جایی برای زیستن ندارد (معیار پذیرشِ ۱ و ۳).
//
// خروجی همیشه وضعیت را می‌گوید، نه فقط ردیف‌ها:
//   variant     کدام پرچم جواب داد («true» / «false» / «both» یعنی هیچ‌کدام)
//   complete    با تابلوی روزانه تطبیق کامل شد یا نه
//   verified    اصلاً مرجعی برای سنجش در دست بود یا نه
//   shortfall   چقدر کم آمد (شمار و حجم)، وقتی تطبیق نشد
//   emptyBoth   پس از هر دو مسیر خالی ماند
//   upstream*   شکلِ خامِ پاسخِ هر دو مسیر، برای تشخیصِ اجرای بعدی
//   duplicates  شمارِ ردیف‌های کاملاً تکراری که انداخته شدند
//   conflicts   شماره‌هایی که دو محتوای متفاوت داشتند (هیچ‌کدام حذف نشده)
//
// ═══ چرا یک درخواستِ سومِ ارزان اضافه شد ═══
//
// مرجعِ روزانه (`GetClosingPriceDaily`) یک رکوردِ کوچک است و روزِ
// بسته‌شده دیگر عوض نمی‌شود، پس با TTL بلند کش می‌شود. هزینه‌اش در برابر
// چیزی که می‌خرد ناچیز است: بی آن، هیچ راهی نیست بفهمیم پاسخِ غیرخالیِ
// در دست، کاملِ آن روز است یا بریده‌اش — و آزمونِ عملی نشان داد در هر
// شش نمونه بریده بود.
//
// مرجع **هم‌زمان** با مسیر اول گرفته می‌شود، نه پس از آن، تا وقتی مسیر
// اول کامل باشد هیچ رفت‌وبرگشتِ اضافه‌ای به تأخیر اضافه نکند.
async function fetchHistoricalTape(code, date, { fresh = false, expect = null, bust = true } = {}) {
  const pull = async (pathname) => {
    // `fresh` یعنی «کشِ ما را رد کن»؛ `bust` یعنی «مهرِ زمان به URLِ
    // بالادست بچسبان». دومی بی اولی معنا ندارد، ولی اولی بی دومی دارد —
    // و همان حالتی است که تا امروز راهی نداشت.
    const data = fresh ? await getFresh(pathname, 2, 6, { bust }) : await get(pathname, S.ttlDailySec, 6);
    const detail = normalizeTradesDetailed(firstList(data));
    return { ...detail, shape: upstreamShape(data) };
  };
  // مرجع هرگز اجرا را نمی‌اندازد: نبودش «نمی‌دانیم» است، نه خطا. قرارداد
  // منقضی اغلب تابلوی روزانهٔ تاریخ‌دار ندارد و آن حالت باید کار کند.
  const reference = async () => {
    // مرجعِ فرستاده‌شدهٔ مصرف‌کننده، اگر معتبر باشد، یک درخواستِ بالادست
    // را صرفه‌جویی می‌کند. خروجی دیتا کلِ تابلوی روزانه را از قبل دارد و
    // برای بازهٔ بزرگ همین چند هزار درخواست است.
    if (expect && Number.isFinite(Number(expect.trades)) && Number.isFinite(Number(expect.volume))
      && (Number(expect.trades) > 0 || Number(expect.volume) > 0)) {
      return { known: true, trades: Number(expect.trades), volume: Number(expect.volume), value: 0 };
    }
    try {
      return dailyExpectation(await get(historicalPath('daily', code, date), S.ttlDailySec, 7), date);
    } catch {
      return { known: false, trades: 0, volume: 0, value: 0 };
    }
  };
  try {
    const [first, expect] = await Promise.all([pull(historicalTradesPath(code, date)), reference()]);
    const tried = [{ variant: 'true', ...first }];
    // ═══ چرا «غیرخالی» دیگر بس نیست ═══
    //
    // F-01: مسیر `true` برای اهرم/۲۰۲۶۰۹۱۹ ۲٬۵۲۱ معامله داد و مسیر
    // `false` همان روز ۷٬۷۳۶ — برابرِ تابلو. منطقِ قبلی («اگر اولی ردیف
    // داشت، همان») ۵٬۲۱۵ معامله را دور می‌ریخت. حالا فقط **تطبیق با
    // تابلو** جلوی درخواستِ دوم را می‌گیرد.
    const decided = chooseTape(tried, expect);
    if (decided.complete) return withUpstream(decided, first, null);

    const alt = await pull(historicalTradesAltPath(code, date));
    tried.push({ variant: 'false', ...alt });
    return withUpstream(chooseTape(tried, expect), first, alt);
  } catch (e) {
    return { rows: [], error: `${e.name}: ${e.message}` };
  }
}

/** شکلِ خامِ پاسخ‌ها را فقط وقتی همراه می‌کند که خالی مانده باشیم. */
function withUpstream(decided, first, alt) {
  if (!decided.emptyBoth) return decided;
  return {
    ...decided,
    // شکلِ **هر دو** مسیر، چون ممکن است فقط یکی‌شان بدقلق باشد.
    upstream: upstreamShapeLabel(first?.shape),
    upstreamAlt: alt ? upstreamShapeLabel(alt.shape) : '',
  };
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
function shapeHistorical(kind, raw, date = 0, ins = '') {
  if (kind === 'book') {
    const rows = firstList(raw);
    return { events: normalizeBookEvents(rows), count: rows.length };
  }
  // `trades` عمداً اینجا نیست: مسیر ریزمعامله پیش از رسیدن به این تابع به
  // `fetchHistoricalTape` می‌رود تا تلاشِ پرچمِ دوم و حذفِ تکرار را هم
  // بگیرد. شاخهٔ مردهٔ اینجا یعنی دو نرمال‌سازی که روزی از هم دور می‌افتند.
  if (kind === 'daily' || kind === 'instrument' || kind === 'clientType') {
    return datedRow(kind, firstDict(raw), date, ins);
  }
  const rows = firstList(raw);
  return { rows, count: rows.length };
}

/**
 * ردیفِ تک‌رکوردیِ تاریخ‌دار — فقط وقتی «ردیفِ آن روز» است که خودش بگوید.
 *
 * ═══ R3-01 ═══
 *
 * `GET /api/hist?kind=daily&…&date=20260624` با HTTP ۲۰۰ برگشت، ولی
 * `row.dEven` داخلش **۲۰۲۶۰۹۲۱** بود — رکوردِ سه ماه بعد، در جایگاهِ
 * روزانهٔ آن روز. مصرف‌کننده‌ای که به تاریخِ درخواست اعتماد کند، قیمتِ
 * آینده را وارد تحلیل تاریخی می‌کند.
 *
 * ═══ R4-01: و چرا یک نامِ میدان برای همه غلط بود ═══
 *
 * نسخهٔ اولِ همین دروازه فقط `dEven` را می‌خواند و به هر سه نوعِ
 * تک‌رکوردی اعمال می‌شد. نتیجه‌اش یک **پسرفت** بود: پاسخِ درستِ
 * `clientType` برای اهرم/۲۰۲۶۰۹۱۹ — با `recDate:20260919` و حجمِ خریدی
 * که دقیقاً ۷۳٬۳۰۵٬۲۲۴ یعنی همان حجمِ روزانه — به‌عنوان «بی‌تاریخ» رد
 * شد و `row:null` گرفت. داده رسیده بود و ما دورش ریختیم.
 *
 * درسش: **نامِ میدانِ تاریخ قراردادِ هر endpoint است، نه یک ثابتِ
 * سراسری.** پس جدول، نه حدس.
 *
 * و نوعِ سومی هم هست که اصلاً رکوردِ یک روز **نیست**:
 * `GetInstrumentHistory` مشخصاتِ ابزار را می‌دهد با `lastDate:0` و
 * `insCode:"0"`. دروازهٔ تاریخ رویش معنا ندارد و اعمالش همان اشتباهِ
 * `clientType` را تکرار می‌کند. پس رد نمی‌شود، ولی `dated:false` علامت
 * می‌خورد تا هیچ‌کس آن را «رکوردِ آن روز» نخواند.
 */
const DATED_ROW_FIELDS = {
  daily: { date: 'dEven', id: 'insCode' },
  clientType: { date: 'recDate', id: 'insCode' },
  // `instrument` عمداً اینجا نیست — رکوردِ تاریخ‌دار نیست.
};

function datedRow(kind, row, date = 0, ins = '') {
  if (!row || !Object.keys(row).length) return { row: null, found: false, why: 'پاسخ رکوردی نداشت' };
  const shape = DATED_ROW_FIELDS[kind];
  // نوعی که قرارداد تاریخ‌دار ندارد، سنجیده نمی‌شود — ولی ادعای
  // «رکوردِ آن روز» هم برایش نمی‌شود.
  if (!shape) return { row, found: true, dated: false, why: 'این نوع رکوردِ تاریخ‌دار نیست' };

  const stampedIns = String(row[shape.id] ?? '').trim();
  // شناسه فقط وقتی سنجیده می‌شود که واقعاً شناسه باشد: بعضی پاسخ‌ها
  // «۰» می‌گذارند، و آن جای‌نگه‌دار است نه ابزارِ دیگر.
  if (ins && stampedIns && stampedIns !== '0' && stampedIns !== String(ins)) {
    return { row: null, found: false, why: `رکوردِ ابزارِ ${stampedIns} آمد، نه ${ins}`, mismatch: row };
  }

  const wanted = Math.trunc(Number(date) || 0);
  const has = row[shape.date] !== undefined && row[shape.date] !== null;
  // ═══ نبودِ میدان، مدرکِ نامرتبط‌بودن نیست ═══
  //
  // رد کردنِ رکوردی که میدانِ تاریخش را نمی‌شناسیم، همان R4-01 است.
  // تحویلش می‌دهیم و صریح می‌گوییم تاریخش راست‌آزمایی نشد.
  if (!has) return { row, found: true, dated: false, why: `تاریخِ رکورد خوانده نشد (${shape.date} نیامد)` };

  const stampedDate = Math.trunc(Number(row[shape.date]) || 0);
  if (wanted && stampedDate !== wanted) {
    return {
      row: null, found: false, dated: true,
      why: `رکوردِ ${stampedDate} آمد، نه ${wanted} — رکوردِ همان روز در دست نیست`,
      mismatch: row,
    };
  }
  return { row, found: true, dated: true };
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

/**
 * مهلتِ یک دورِ دیده‌بان: بدترین حالتِ `get` (همهٔ تلاش‌ها با عقب‌نشینی) به‌علاوهٔ
 * حاشیه‌ای برای صف. از فاصلهٔ خودِ حلقه هم کوتاه‌تر نمی‌شود.
 */
function watchDeadlineMs() {
  const perTry = num(S.timeoutMs, 9000);
  const backoff = 300 * (2 ** Math.max(0, num(S.retries, 2)) - 1);
  return Math.max(20000, perTry * (num(S.retries, 2) + 1) + backoff + 8000);
}

/** @returns {boolean} موفق بود یا نه — بازار بسته هم موفق حساب می‌شود، عقب‌نشینی نمی‌خواهد */
async function watchTick() {
  const gate = marketOpen();
  stat.paused = !gate.open;
  stat.pauseReason = gate.why;
  if (!gate.open) return true;

  const t0 = Date.now();
  try {
    // ═══ مهلتِ خودِ حلقه، جدا از مهلتِ هر درخواست ═══
    //
    // `get` سه تلاش دارد و هر تلاش `timeoutMs`، ولی می‌تواند به درخواستی
    // بپیوندد که خودش پشتِ صف است. با ارثِ اولویت آن صف دیگر بی‌انتها نیست،
    // ولی حلقهٔ زنده نباید امیدش را به هیچ ضمانتِ بیرونی ببندد: اگر یک دور
    // در این مهلت برنگشت، رهایش می‌کنیم و دورِ بعد را می‌زنیم.
    //
    // درخواست پشتِ سر لغو نمی‌شود؛ اگر بعداً برسد در کش می‌نشیند و دورِ بعد
    // مجانی از آن استفاده می‌کند. آنچه لغو می‌شود **انتظارِ** ماست، نه کار.
    const js = await Promise.race([
      get('/Instrument/GetInstrumentOptionMarketWatch/0', S.ttlWatchSec, 1),
      sleep(watchDeadlineMs()).then(() => {
        throw new Error(`دور دیده‌بان در ${Math.round(watchDeadlineMs() / 1000)} ثانیه برنگشت`);
      }),
    ]);
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
  await writeJsonAtomic(file, body);
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
    const repaired = repairRosterBaseNames(file?.rows);
    if (repaired.fixed) log(`دفتر قراردادها — نام پایهٔ ${repaired.fixed} ردیف قدیمی هنگام خواندن ترمیم شد`);
    // ═══ چرا سمت هم هنگام خواندن ترمیم می‌شود ═══
    //
    // قاعدهٔ تشخیصِ اختیار تبعی عوض شد، ولی دفترِ روی دیسک همان `call`
    // قدیمی را داشت و هیچ مسیری اصلاحش نمی‌کرد. بازسازیِ اجباری چند هزار
    // درخواستِ بالادست است — همان سهمیه‌ای که کم داریم — و ترمیمِ هنگام
    // خواندن هیچ درخواستی نمی‌برد.
    const sides = repairRosterSides(repaired.rows);
    if (sides.fixed) log(`دفتر قراردادها — سمتِ ${sides.fixed} ردیف قدیمی هنگام خواندن اصلاح شد`);
    rosterCache = { mtime: stamp, rows: sides.rows, file };
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
    // نگاشت نام برای قراردادهای منقضی لازم است؛ برای قرارداد حاضر در
    // تابلو، خودِ شناسه شاهد قطعی است و اختلاف نگارشی نام پایه را دور
    // می‌زند. رشتهٔ خالی عمداً کلید نمی‌شود.
    for (const contract of [row?.insCode_C, row?.insCode_P]) {
      const code = String(contract ?? '').trim();
      if (code) index.set(`contract:${code}`, ins);
    }
  }
  return index;
}

/**
 * ID پایه برای قراردادی که دیگر در دیده‌بان امروز نیست.
 *
 * فقط یک قرارداد از هر پایه پرسیده می‌شود (`completeRosterBaseIndex` این
 * سقف را اعمال می‌کند). هر دو پاسخ در کش متادیتای سرور می‌نشینند، پس
 * بازکردن دوبارهٔ تب شبکه را تکرار نمی‌کند.
 */
async function officialBaseId(row) {
  const info = instrumentInfo(await get(infoPath(row.ins), Math.max(60, S.ttlMetaSec), 4));
  if (info?.uaIns) return info.uaIns;
  const iid = String(row?.id || info?.id || '').trim();
  if (!iid) return '';
  return optionSpec(await get(optionSpecPath(iid), Math.max(60, S.ttlMetaSec), 4))?.uaIns || '';
}

// ——————————————————————— ساختِ خودکار دفتر ———————————————————————
//
// نخستین نسخه، ساختِ دفتر را به دو دستور ترمینال سپرده بود. صاحب پروژه
// دستور را اجرا نکرد و نتیجه‌اش این شد که «کار نمی‌کند» — و حق داشت:
// ابزاری که برای کار کردن به یک مرحلهٔ دستی نیاز دارد، برای کاربر خراب
// است، هرچند برای سازنده‌اش کامل باشد.
//
// حالا هر بازه‌ای که خواسته شود و دفتر نداشته باشدش، همان‌جا در پس‌زمینه
// گرفته می‌شود. درخواست منتظر نمی‌ماند: پاسخ با آنچه **همین حالا** هست
// برمی‌گردد، به‌اضافهٔ پیشرفت، و رابط دوباره می‌پرسد.
//
// اولویت ۹ یعنی پایین‌تر از هر چیز زنده. اسکنِ پس‌زمینه نباید جلوی
// دیده‌بان یا درخواست خودِ کاربر را بگیرد.
const ROSTER_SCAN_PRIORITY = 9;
const ROSTER_SCAN_TTL = 86400 * 30;   // فهرست ابزارهای یک روزِ گذشته عوض نمی‌شود
const ROSTER_SAVE_EVERY = 25;

let rosterBuild = {
  running: false, from: 0, to: 0, total: 0, done: 0, failed: 0,
  startedAt: 0, finishedAt: 0, lastError: '', added: 0,
};

/**
 * نوشتن دفتر — پوشش هرگز **کوچک** نمی‌شود.
 *
 * این را یک اجرای واقعی نشان داد: اسکنی که هر پنج روزش شکست خورد، پروندهٔ
 * سالمِ موجود را با `scannedFrom/To` صفر بازنویسی کرد و دفترِ دو ساله
 * یک‌شبه «بی‌پوشش» شد. هیچ خطایی هم بالا نیامد؛ فقط از آن به بعد هر بازه
 * ناقص گزارش می‌شد.
 *
 * پس بازهٔ پیشین همیشه با بازهٔ تازه یکی می‌شود، نه جایگزین. نوشتنِ
 * ناموفق باید داده کم نکند.
 */
async function writeRoster(rows, days, { from = 0, to = 0, scan = null } = {}) {
  const old = rosterCache.file;
  const lo = [num(old?.scannedFrom, 0), num(from, 0)].filter((v) => v > 0);
  const hi = [num(old?.scannedTo, 0), num(to, 0)].filter((v) => v > 0);
  const body = makeRosterFile(rows, {
    at: Math.floor(Date.now() / 1000), days,
    scannedFrom: lo.length ? Math.min(...lo) : 0,
    scannedTo: hi.length ? Math.max(...hi) : 0,
    scan: scan || old?.scan || null,
  });
  // اتمیک، چون همین پرونده را `readRoster` هم‌زمان می‌خواند و نیمهٔ فایل
  // «JSON خراب» می‌دهد نه «هنوز آماده نیست».
  await writeJsonAtomic(ROSTER_FILE, body);
  rosterCache = { mtime: (await fs.stat(ROSTER_FILE)).mtimeMs, rows: body.rows, file: body };
  return body;
}

/**
 * پر کردن روزهای نبودهٔ یک بازه.
 *
 * تنها یک اسکن هم‌زمان اجرا می‌شود. درخواست دومی که برسد، همان پیشرفت را
 * می‌بیند و صف دوم نمی‌سازد — وگرنه چند تبِ باز، بالادست را چند برابر
 * می‌کوبیدند.
 *
 * روزِ نیامده **شمرده** می‌شود و در پوشش نمی‌نشیند. اگر بی‌صدا رد می‌شد،
 * دفتر یک حفرهٔ نامرئی داشت — و همان حفره می‌توانست دقیقاً همان قراردادی
 * باشد که کاربر دنبالش است.
 */
/**
 * آیا ساختِ تازه لازم است — و چرا نباید فقط «جفتِ ناقص» ملاک باشد.
 *
 * سه محرک معتبر است: روزِ نبوده، نسخه/پاس کاتالوگ قدیمی، و مشخصات رسمی
 * ناتمام. «هنوز جفت ناقص داریم» به‌تنهایی محرک نیست: بعد از پیمایش کامل
 * ممکن است قرارداد تعدیل‌شده واقعاً یک‌طرفه باشد و شناسه‌ای نباید ساخت.
 *
 * سردکردن هم لازم است: پاسِ کاتالوگی که همین حالا شکست خورد، با
 * درخواست بعدی دوباره شروع نمی‌شود.
 */
const ROSTER_RETRY_COOLDOWN_MS = 10 * 60 * 1000;

function rosterNeedsBuild(file, missingCount) {
  if (rosterBuild.running) return false;
  if (missingCount > 0) return true;
  const scan = file?.scan || {};
  const stale = num(file?.version, 0) < ROSTER_VERSION
    || scan.catalogComplete !== true
    || scan.detailsComplete !== true;
  if (!stale) return false;
  const since = rosterBuild.finishedAt ? Date.now() - rosterBuild.finishedAt : Infinity;
  return since > ROSTER_RETRY_COOLDOWN_MS;
}

async function buildRoster(from, to) {
  if (rosterBuild.running) return rosterBuild;
  const { file } = await readRoster();
  const want = missingDays(file, tradingDays(from, to));
  const firstBuild = !rosterCache.rows.length;
  // پاس کاتالوگ حتی وقتی همهٔ روزها هست هم لازم است: قراردادِ بی‌معامله
  // در هیچ روزی نبوده، پس «همهٔ روزها را داریم» یعنی «همهٔ معامله‌ها را
  // داریم»، نه «همهٔ قراردادها را».
  const catalogAlreadyComplete = num(file?.version, 0) >= ROSTER_VERSION
    && file?.scan?.catalogComplete === true;
  const needDetails = file?.scan?.detailsComplete !== true;
  const needBuild = !catalogAlreadyComplete || needDetails;
  if (!want.length && !needBuild && !firstBuild) return rosterBuild;

  rosterBuild = {
    running: true, from: Number(from), to: Number(to), total: want.length, done: 0,
    failed: 0, startedAt: Date.now(), finishedAt: 0, lastError: '', added: 0,
    stage: 'day', stageDone: 0, stageTotal: want.length,
  };
  log(`ساخت دفتر قراردادها — ${want.length} روزِ نبوده از ${from} تا ${to}`
    + `${catalogAlreadyComplete ? '' : ' + پاس کاتالوگ'}${needDetails ? ' + مشخصات ناتمام' : ''}`);

  (async () => {
    const seed = scanBoardRows(await boardRowsForIndex()).rows;
    const result = await runRosterBuild({
      days: want,
      existing: rosterCache.rows,
      seed,
      catalogAlreadyComplete,
      scannedDays: rosterCache.file?.days || [],
      get: (path) => get(path, ROSTER_SCAN_TTL, ROSTER_SCAN_PRIORITY),
      onProgress: (p) => {
        rosterBuild.stage = p.stage;
        rosterBuild.stageDone = p.done;
        rosterBuild.stageTotal = p.total;
        rosterBuild.added = p.rows - rosterCache.rows.length;
        if (p.stage === 'day') rosterBuild.done = p.done;
        rosterBuild.failed = p.stats.dayQueriesFailed + p.stats.catalogQueriesFailed + p.stats.detailQueriesFailed;
        rosterBuild.lastError = p.stats.lastError || rosterBuild.lastError;
      },
      onCheckpoint: async ({ rows, scanned, stats }) => {
        try { await writeRoster(rows, scanned, { from, to, scan: stats }); }
        catch (e) { rosterBuild.lastError = e.message; }
      },
      stopped: () => false,
    });

    // ── خروجی ناقص جای دفتر سالم را نمی‌گیرد ──────────────────────────
    //
    // اگر هیچ جست‌وجوی کاتالوگی موفق نبوده، این اجرا فقط می‌تواند از
    // دفتر کم کند. یک اجرای شکست‌خورده نباید کارِ درستِ اجرای قبلی را
    // پاک کند.
    const wipe = result.stats.catalogQueriesDone === 0
      && result.stats.catalogQueriesFailed > 0
      && rosterCache.rows.length > 0;
    if (!wipe) {
      try { await writeRoster(result.rows, result.scanned, { from, to, scan: result.stats }); }
      catch (e) { rosterBuild.lastError = e.message; }
    } else {
      rosterBuild.lastError = `هیچ جست‌وجوی کاتالوگی موفق نبود؛ دفتر دست‌نخورده ماند (${result.stats.lastError || '—'})`;
    }

    rosterBuild.running = false;
    rosterBuild.finishedAt = Date.now();
    rosterBuild.added = result.added;
    rosterBuild.incompletePairs = result.stats.incompletePairs;
    rosterBuild.noTrade = result.stats.noTradeContracts;
    log(`دفتر قراردادها — ${result.stats.dayQueriesDone} روز، ${result.stats.catalogQueriesDone} جست‌وجو، `
      + `${result.added} قرارداد تازه، ${result.stats.incompletePairs} جفت ناقص، `
      + `${rosterBuild.failed} درخواست ناموفق`);
  })().catch((e) => {
    rosterBuild.running = false;
    rosterBuild.finishedAt = Date.now();
    rosterBuild.lastError = `${e.name}: ${e.message}`;
    log(`ساخت دفتر متوقف شد: ${rosterBuild.lastError}`);
  });

  return rosterBuild;
}

/** وضعیت ساخت، به شکلی که رابط بتواند جمله‌اش را بسازد. */
function buildStatus(missing = 0) {
  return {
    running: rosterBuild.running,
    done: rosterBuild.done, total: rosterBuild.total, failed: rosterBuild.failed,
    added: rosterBuild.added, missing,
    stage: rosterBuild.stage || '', stageDone: rosterBuild.stageDone || 0, stageTotal: rosterBuild.stageTotal || 0,
    incompletePairs: rosterBuild.incompletePairs ?? null,
    noTrade: rosterBuild.noTrade ?? null,
    lastError: rosterBuild.lastError || '',
    finishedAt: rosterBuild.finishedAt || 0,
  };
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

/**
 * ردیف‌های زنجیرهٔ یک **بازه** — اجتماع هرکس که در هر تکه‌ای از آن زنده بود.
 *
 * این همان چیزی است که تب‌های تاریخ‌دار می‌خواهند و تا امروز نداشتند:
 * `chain` آن‌ها از تابلوی امروز ساخته می‌شد، پس قراردادی که داخل بازهٔ
 * بررسی سررسید شده بود اصلاً در فهرست نبود و هیچ استراتژی‌ای رویش آزموده
 * نمی‌شد.
 *
 * `remainedDay` نسبت به **آغاز** بازه حساب می‌شود، چون تحلیل از همان‌جا
 * شروع می‌شود. عمرِ هر ردیف هم همراهش می‌آید تا مصرف‌کننده بداند از کجا
 * تا کجا حق دارد رویش حساب کند — قراردادی که وسط بازه سررسید شده، بعد از
 * آن روز عددی ندارد و نباید ساخته شود.
 */
async function rosterRangeUniverse(from, to, boardRows) {
  const { rows, file } = await readRoster();
  const coverage = rosterCoverage(rows, file ? { from: file.scannedFrom, to: file.scannedTo } : null);
  const live = rosterInRange(rows, from, to);
  if (!live.length) return { rows: [], coverage, contracts: 0, lostBases: [], summary: rangeSummary(rows, from, to) };

  const index = await completeRosterBaseIndex(live, baseIndexFrom(boardRows), officialBaseId);
  const chain = rosterChainRows(live, { baseIndex: index, at: from });
  const life = new Map();
  for (const row of live) life.set(row.ins, row);

  const known = [];
  for (const row of chain) {
    const call = life.get(row.insCode_C), put = life.get(row.insCode_P);
    const alive = [call, put].filter(Boolean);
    if (!row.baseKnown) continue;
    known.push({
      ...row,
      activeFrom: Math.min(...alive.map((r) => r.activeFrom)),
      activeTo: Math.max(...alive.map((r) => r.activeTo)),
      // عمرِ دو سمت لزوماً یک منبع ندارد: ممکن است کال معامله شده باشد و
      // پوتِ بی‌معامله هنوز مشخصات رسمی نگرفته باشد. یک activeFrom مشترک
      // آن پوت را به‌اشتباه «معلوم» جلوه می‌داد و قفلِ انتخاب‌محور را دور
      // می‌زد. مرز و شاهدِ هر سمت جدا به تب خروجی می‌رسد.
      activeFrom_C: call?.activeFrom || 0,
      activeTo_C: call?.activeTo || 0,
      listingKnown_C: call ? num(call.listedFrom, 0) > 0 || num(call.first, 0) > 0 : false,
      // «می‌دانیم از کِی» با «تاریخِ عرضه را داریم» یکی نیست. `contractLife`
      // وقتی `listedFrom` ندارد به `first` برمی‌گردد — اولین روزی که دفتر
      // این قرارداد را **دیده**، که کرانِ پایینیِ سوگیردار است و نه تاریخ
      // عرضه. `rosterInRange` این را در `lifeFromTrades` علامت می‌زند و تا
      // امروز همین‌جا می‌افتاد، پس تب خروجی نمی‌توانست این دو را جدا کند.
      listedOfficial_C: call ? call.lifeFromTrades !== true : false,
      activeFrom_P: put?.activeFrom || 0,
      activeTo_P: put?.activeTo || 0,
      listingKnown_P: put ? num(put.listedFrom, 0) > 0 || num(put.first, 0) > 0 : false,
      listedOfficial_P: put ? put.lifeFromTrades !== true : false,
      expiresInside: alive.some((r) => r.expiresInside),
    });
  }
  const lost = [...new Set(chain.filter((row) => !row.baseKnown).map((row) => row.lval30_UA))];
  return { rows: known, coverage, contracts: live.length, lostBases: lost, summary: rangeSummary(rows, from, to) };
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
  const index = await completeRosterBaseIndex(live, baseIndexFrom(boardRows), officialBaseId);
  const chain = rosterChainRows(live, { baseIndex: index, at: wanted });
  const known = chain.filter((row) => row.baseKnown);
  const lost = [...new Set(chain.filter((row) => !row.baseKnown).map((row) => row.lval30_UA))];
  return { rows: known, coverage, contracts: live.length, pairs: chain.length, lostBases: lost };
}

const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/** جملهٔ صداقتِ بازه — چند قرارداد آمد، چند تا منقضی‌اند، و چه چیزی هنوز نیامده. */
function rosterRangeNote(built, from, to, missing, health = null) {
  const s = built.summary;
  if (!built.rows.length) {
    return missing
      ? `دفتر هنوز این بازه را ندارد؛ ${faNum(missing)} روزِ کاری در حال گرفتن از تابلوی تاریخی است. تا آن موقع فهرستی برای این بازه نیست.`
      : 'برای این بازه هیچ قراردادی در دفتر نبود.';
  }
  const head = `فهرست از دفتر قراردادهای تاریخی آمد — ${faNum(built.contracts)} قرارداد در این بازه زنده بوده، ${faNum(built.rows.length)} جفتِ کال و پوت.`;
  const expired = s?.expiredInside
    ? ` ${faNum(s.expiredInside)} تای آن‌ها داخل همین بازه سررسید شده‌اند و در فهرست امروز نیستند — حالا هستند.`
    : '';
  const gap = missing ? ` ${faNum(missing)} روزِ کاری هنوز اسکن نشده و در پس‌زمینه گرفته می‌شود؛ تا کامل شدنش فهرست ممکن است ناقص باشد.` : '';
  const lost = built.lostBases.length
    ? ` ${faNum(built.lostBases.length)} نماد پایه کدشان به دست نیامد و کنار ماندند: ${built.lostBases.slice(0, 6).join('، ')}.`
    : '';
  // ── جفتِ ناقص، ساکت نمی‌ماند ────────────────────────────────────────
  //
  // یک سری اختیارِ عادی هر دو سمت را دارد. گروهی که فقط یک سمت دارد،
  // تقریباً همیشه یعنی ما آن یکی را ندیده‌ایم — و هر استراتژی‌ای که هر
  // دو سمت را می‌خواهد، روی آن سری بی‌صدا حذف می‌شود. سکوت اینجا یعنی
  // کاربر نبودِ استراتژی را به موتور نسبت می‌دهد، نه به فهرست.
  const pairs = health && health.incompletePairs > 0
    ? ` ${faNum(health.incompletePairs)} سری فقط یک سمت دارد (کال یا پوت، نه هر دو)؛ استراتژی دوسمته روی آن‌ها ساخته نمی‌شود.`
    : '';
  return `${head}${expired}${gap}${pairs}${lost} دفتر قیمت و اندازهٔ قرارداد ندارد؛ هر دو از مسیر خودشان می‌آیند.`;
}

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

/**
 * حکمِ تازگیِ همین لحظه. `/api/health` و حلقه هر دو از همین‌جا می‌خوانند تا
 * دو جا دو حرف نزنند.
 */
const watchNow = () => watchHealth({
  open: marketOpen().open, at: watch.at, intervalSec: S.watchIntervalSec,
});

async function watchLoop() {
  let fails = 0;
  // ═══ کهنگی هم خبر است، حتی وقتی خطایی نیست ═══
  //
  // لبه‌ای اعلام می‌شود نه هر دور: هشداری که هر پنج ثانیه تکرار شود، چند
  // دقیقه بعد دیگر دیده نمی‌شود.
  let wasStale = false;
  for (;;) {
    const ok = await watchTick();
    fails = ok ? 0 : fails + 1;
    stat.watchConsecutiveFails = fails;
    const health = watchNow();
    if (health.stale && !wasStale) {
      logErr('تازگی دیده‌بان', new Error(health.why), 'warn');
      broadcast('trouble', { at: Date.now(), message: health.why, stale: true, ageSec: health.ageSec });
    } else if (!health.stale && wasStale) {
      log(`عکس تابلو دوباره تازه شد — ${health.ageSec} ثانیه`);
      broadcast('recovered', { at: Date.now(), ageSec: health.ageSec });
    }
    wasStale = health.stale;
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
  // `hEven` همراه می‌آید چون دروازهٔ «عکس پیش‌جلسه» بی آن کور است: رکوردِ
  // ۰۶:۱۲:۰۶ با صفر معامله از رکوردِ پایانِ روز جدا نمی‌شود. برای ردیفی
  // که بالادست ساعت نمی‌دهد صفر می‌ماند و صفر مشکوک نیست.
  date: Number(r.dEven), hEven: Number(r.hEven) || 0,
  close: Number(r.pClosing) || 0, last: Number(r.pDrCotVal) || 0,
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
      const fresh = watchNow();
      return sendJson(res, 200, {
        ok: true, upSec: Math.round((Date.now() - stat.started) / 1000),
        market: gate, ...stat,
        avgUpstreamMs: stat.upstreamCount ? Math.round(stat.upstreamMsTotal / stat.upstreamCount) : 0,
        cacheSize: cache.size, watchAgeSec: fresh.ageSec,
        settingsWatchIntervalSec: S.watchIntervalSec,
        // «کهنه» با «خراب» یکی نیست و تا امروز هیچ‌کدام از دیگری جدا نبودند:
        // خطا صفر بود چون خطایی نبود، ولی عکس چهار دقیقه جا مانده بود.
        watchStale: fresh.stale, watchStaleWhy: fresh.why, watchLimitSec: fresh.limitSec,
        // بار به تفکیکِ سرویس، تا گزارشِ بعدی به‌جای «۲۰۸۲ درخواست» بگوید
        // کدام سرویس آن را خورده و کدام‌یک خطا داده.
        byEndpoint: tally.snapshot(12), worstEndpoint: tally.worstError(),
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
      const codes = insListOrReject(res, u.searchParams.get('ins'), 24, 'نوار زنده');
      if (!codes) return undefined;
      const one = async (code) => {
        try {
          // تکرارِ دقیق همین‌جا می‌افتد، وگرنه خلاصه و شمع‌ساز آن را
          // دوباره می‌شمارند: نمونهٔ اهرم/۲۰۲۶۰۹۲۰ پنج ردیفِ تکراری داشت و
          // ۴٬۰۵۷ واحد حجمِ اضافه می‌ساخت.
          const tape = normalizeTradesDetailed(firstList(await getFresh(`/Trade/GetTrade/${code}`, 2, 2)));
          const { rows, duplicates, conflicts } = tape;
          return [code, { ins: code, rows, duplicates, conflicts, summary: summarizeLiveTrades(rows) }];
        } catch (e) {
          return [code, { ins: code, rows: [], error: `${e.name}: ${e.message}` }];
        }
      };
      const items = Object.fromEntries(await Promise.all(codes.map(one)));
      res.setHeader('Cache-Control', 'no-store');
      // وضعیت بازار همراه نوار می‌رود، و این تزیین نیست: نوارِ خالی در
      // بازارِ بسته یعنی «هنوز جلسه‌ای نبوده»، و در بازارِ باز یعنی «این
      // ابزار معامله نشده». مصرف‌کننده بی این دو را از هم جدا نمی‌کند و
      // محدودیتِ ساعت را به حسابِ نقدشوندگیِ نماد می‌گذارد.
      // ── منبع، صریح ───────────────────────────────────────────────
      //
      // مصرف‌کننده باید بتواند بگوید این پاسخ مال کدام روز است، و برای آن
      // هم فاز بازار لازم است هم منبع. نوار همیشه تازه گرفته می‌شود و
      // هیچ‌وقت با بایگانی جایگزین نمی‌شود — ولی این تضمین تا وقتی نوشته
      // نشود، در سمت مصرف‌کننده قابل تکیه نیست.
      return sendJson(res, 200, {
        at: Date.now(), source: LIVE_SOURCE_TAPE, count: codes.length, market: marketOpen(), items,
      });
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
        // ── دو زمان، نه یکی ───────────────────────────────────────────
        //
        // ممیزی: «ساعت بالای داشبورد هر ۵ ثانیه تازه می‌شود، حتی وقتی عکس
        // زنجیره چند دقیقه قدیمی است.» درست بود: `at` زمانِ پاسخ است، نه
        // زمانِ عکس. حالا هر دو می‌روند و رابط می‌تواند سن واقعی را بگوید.
        at: Date.now(), snapshotAt: watch.at || null,
        count: instruments.length, traded: snapshot.traded,
        failed, snapshot, timeline,
        // گردش واقعی پایه‌ها همین‌جا به عکس زنجیره برمی‌گردد؛ پیش از این
        // جدا گرفته می‌شد و هیچ‌وقت ادغام نمی‌شد، پس «ارزش خود پایه» در کل
        // رابط صفر بود.
        universe: mergeUnderlyingTrades(decisionDashboardSnapshot(sourceRows, S), observed),
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
        // مرجع از مصرف‌کننده می‌آید ولی **باور نمی‌شود**: فقط دو عددِ
        // متناهی از آن خوانده می‌شود و هر چیز دیگری کنار می‌رود.
        const raw = item?.expect;
        const expect = raw && Number.isFinite(Number(raw.trades)) && Number.isFinite(Number(raw.volume))
          ? { trades: Math.max(0, Math.trunc(Number(raw.trades))), volume: Math.max(0, Math.trunc(Number(raw.volume))) }
          : null;
        if (!seen.has(key)) { seen.add(key); requests.push({ key, code, date, expect }); }
      }
      // ── تلاش دوباره، بی کش ────────────────────────────────────────
      //
      // ممیزی: پاسخِ خالیِ لحظه‌ای کش می‌شد و آن روز تا پایان نشست
      // «بی‌معامله» می‌ماند. مصرف‌کننده وقتی خودش تشخیص می‌دهد پاسخ
      // ناسازگار است (پایه خالی ولی پاها معامله دارند) باید بتواند از کش
      // رد شود. این راهِ فرار از سهمیه نیست: صفِ مشترک سرِ جایش است و
      // فراخوان فقط همان چند روزِ مشکوک را دوباره می‌پرسد.
      const fresh = body.fresh === true;
      // دورِ زوجِ تلاشِ تکمیلی URLِ ساده را می‌زند، ولی باز هم از کشِ ما
      // رد می‌شود. نبودنِ کلید یعنی رفتارِ قبلی: مهرخورده.
      const bust = body.bust !== false;
      // ═══ چرا پاسخِ خالی یک بار دیگر پرسیده می‌شود ═══
      //
      // گزارش صاحب پروژه: فایل خروجی برای ۵۹ ابزار/روز نوشته بود «بدون
      // معامله» — از جمله برای خودِ نماد پایه در یک روز عادیِ بازار، که
      // قطعاً معامله داشته. یعنی فهرستِ خالیِ بالادست به حسابِ واقعیتِ
      // بازار گذاشته می‌شد.
      //
      // پرچمِ آخرِ `GetTradeHistory` همیشه یک‌جور رفتار نمی‌کند. پس وقتی
      // مسیر اول خالی برگشت، همان ابزار/روز یک بار با پرچمِ دیگر پرسیده
      // می‌شود. این «تلاش تا موفقیت» نیست: دقیقاً یک تلاش دوم، و فقط برای
      // خالی — نه برای خطا.
      //
      // و مهم‌تر: خروجی حالا می‌گوید کدام مسیر جواب داده و آیا خالی‌بودن
      // پس از هر دو مسیر است. مصرف‌کننده بی این، نمی‌تواند «بی‌معامله» را
      // از «نیامد» جدا کند.
      // ═══ چرا خالی دیگر بی‌شرح برنمی‌گردد ═══
      //
      // نوبت پنجمِ گزارش: ۱٬۳۱۶ ابزار/روز از مسیر تاریخی، همه خالی، صفر
      // خطا — و هیچ‌کس نمی‌توانست بگوید بالادست «معامله‌ای نبود» گفت یا
      // چیزی داد که اصلاً فهرست معامله نیست. `firstList` هر دو را یک `[]`
      // می‌کند. حالا شکلِ خامِ پاسخ همراه خالی می‌آید و در برگ پوشش
      // می‌نشیند، تا اجرای بعدی تشخیص باشد نه حدسِ تازه.
      const one = async ({ key, code, date, expect }) => [key, await fetchHistoricalTape(code, date, { fresh, expect, bust })];
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
      // ——— بازه، نه یک روز ———
      //
      // خواستهٔ صریح صاحب پروژه: «هر جا کاربر بازهٔ تاریخی داد، قرارداد
      // منقضی هم در محاسبات بیاید.» تب‌ها فهرست را یک بار و **بی‌تاریخ**
      // می‌گرفتند و بعد کاربر بازه انتخاب می‌کرد؛ یعنی هر تحلیلِ گذشته
      // روی بازمانده‌های امروز اجرا می‌شد. این شاخه همان را می‌بندد.
      const rFrom = u.searchParams.get('from') || '';
      const rTo = u.searchParams.get('to') || '';
      if (rFrom && rTo) {
        for (const [name, value] of [['from', rFrom], ['to', rTo]]) {
          if (!validArchiveDate(value)) return sendJson(res, 400, { error: `«${name}» باید هشت رقم میلادی باشد` });
        }
        if (Number(rTo) < Number(rFrom)) return sendJson(res, 400, { error: 'پایان بازه پیش از آغاز آن است' });

        const { file, rows } = await readRoster();
        const wantDays = tradingDays(rFrom, rTo);
        const missing = missingDays(file, wantDays);
        // ساخت در پس‌زمینه شروع می‌شود و پاسخ منتظرش نمی‌ماند: کاربر باید
        // با همان چیزی که هست کار کند و پیشرفت را ببیند، نه پشت یک
        // درخواستِ چنددقیقه‌ای بنشیند.
        // ── محرکِ ساخت، فقط روزِ نبوده نیست ────────────────────────
        //
        // پاسِ کاتالوگ حتی وقتی همهٔ روزها هست هم لازم است: قراردادِ
        // بی‌معامله در **هیچ** روزی نبوده، پس «همهٔ روزها را داریم» یعنی
        // «همهٔ معامله‌ها را داریم»، نه «همهٔ قراردادها را». دفترِ نسخهٔ
        // یک دقیقاً همین حالت است و بی این شرط، هرگز کامل نمی‌شد.
        if (u.searchParams.get('build') !== '0' && rosterNeedsBuild(file, missing.length)) {
          buildRoster(rFrom, rTo);
        }

        const board = await boardRowsForIndex();
        const built = await rosterRangeUniverse(Number(rFrom), Number(rTo), board);
        const health = rosterHealth(file, rows);
        const note = rosterRangeNote(built, Number(rFrom), Number(rTo), missing.length, health);
        return sendJson(res, 200, {
          at: rosterCache.file?.at ?? 0, source: built.rows.length ? 'roster-range' : 'roster-empty',
          from: Number(rFrom), to: Number(rTo),
          archived: missing.length === 0 && built.rows.length > 0,
          fromRoster: true, rosterCoverage: built.coverage, rosterContracts: built.contracts,
          summary: built.summary, lostBases: built.lostBases,
          contractSizeMissing: built.rows.length > 0,
          missingDays: missing.length, build: buildStatus(missing.length),
          complete: health.complete && missing.length === 0,
          health,
          note,
          quality: archiveQuality({
            wanted: Number(rFrom), found: missing.length === 0 && built.rows.length > 0,
            rows: built.rows, source: 'option-roster', asOf: { date: Number(rFrom), second: 0 }, note,
          }),
          market: marketOpen(), count: built.rows.length, rows: built.rows,
        });
      }

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
      // درخواستِ صریحِ ساخت — رابط وقتی می‌زند که کاربر بازه‌ای خواسته و
      // دفتر ندارَدش. پاسخ منتظر پایان اسکن نمی‌ماند.
      if (from && to && u.searchParams.get('build') === '1') await buildRoster(from, to);
      else if (from && to && rosterNeedsBuild(file, missingDays(file, tradingDays(from, to)).length)) buildRoster(from, to);
      const gap = from && to ? missingDays(file, tradingDays(from, to)).length : 0;

      const health = rosterHealth(file, rows);
      return sendJson(res, 200, {
        ready: coverage.count > 0,
        // «آماده» با «کامل» یکی نیست و نباید یکی دیده شود: دفتری که
        // قرارداد دارد قابل استفاده است، ولی تا وقتی جفتِ ناقص یا
        // درخواستِ ناموفق دارد، کامل نیست.
        complete: health.complete,
        health,
        coverage,
        missingDays: gap,
        build: buildStatus(gap),
        scanned: file ? { from: file.scannedFrom, to: file.scannedTo, at: file.at, days: (file.days || []).length, intake: file.intake ?? null } : null,
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
        // ریزمعامله از همان دریافت‌کنندهٔ مشترک می‌گذرد — با تلاشِ پرچمِ
        // دوم و حذفِ تکرار — تا این مسیر همان جوابی را بدهد که
        // `/api/trades` و `/api/trades/batch` می‌دهند. بقیهٔ نوع‌ها یک
        // endpoint دارند و جایگزینی ندارند.
        if (kind === 'trades') {
          const tape = await fetchHistoricalTape(code, date);
          return [code, { ins: code, ...tape, count: tape.rows?.length ?? 0 }];
        }
        // ═══ F-03: پاسخِ `closing` بی وضعیتِ پوشش برنمی‌گردد ═══
        //
        // یک رکوردِ پیش‌جلسه با HTTP ۲۰۰ نباید «سابقهٔ قیمتِ آن روز»
        // خوانده شود. رکوردِ خام دست‌نخورده می‌ماند — فقط کنارش گفته
        // می‌شود پوششِ پایانِ روز تأیید شد یا نه.
        if (kind === 'closing') {
          const upstreamPath = historicalPath(kind, code, date);
          if (!upstreamPath) return [code, { ins: code, error: 'کد ابزار نامعتبر' }];
          try {
            const [raw, expect] = await Promise.all([
              get(upstreamPath, S.ttlDailySec, 6),
              (async () => {
                try {
                  return dailyExpectation(await get(historicalPath('daily', code, date), S.ttlDailySec, 7), date);
                } catch { return { known: false, trades: 0, volume: 0, value: 0 }; }
              })(),
            ]);
            const rows = firstList(raw);
            return [code, { ins: code, rows, count: rows.length, coverage: closingCoverage(rows, expect) }];
          } catch (e) {
            return [code, { ins: code, error: `${e.name}: ${e.message}` }];
          }
        }
        const upstream = historicalPath(kind, code, date);
        if (!upstream) return [code, { ins: code, error: 'کد ابزار نامعتبر' }];
        try {
          const raw = await get(upstream, S.ttlDailySec, 6);
          return [code, { ins: code, ...shapeHistorical(kind, raw, date, code) }];
        } catch (e) {
          return [code, { ins: code, error: `${e.name}: ${e.message}` }];
        }
      };

      if (p === '/api/hist') {
        if (!validIns(ins)) return sendJson(res, 400, { error: 'کد ابزار باید فقط رقم باشد' });
        const [, body] = await one(ins);
        return sendJson(res, 200, { kind, date: Number(date), ...body });
      }
      const codes = insListOrReject(res, u.searchParams.get('ins'), 60, `دستهٔ تاریخی «${kind}»`);
      if (!codes) return undefined;
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

    // همان دریافت‌کنندهٔ دسته‌ای، برای یک ابزار/روز. پیش از این فقط مسیر
    // اول را می‌خواند و نمونهٔ واقعیِ اهرم/۲۰۲۶۰۹۱۹ را خالی می‌داد در حالی
    // که مسیر دوم ۷٬۷۳۶ معامله داشت.
    if (p === '/api/trades') {
      const date = u.searchParams.get('date');
      if (!validCompactDate(date)) return sendJson(res, 400, { error: 'تاریخ باید هشت رقم میلادی باشد' });
      const tape = await fetchHistoricalTape(ins, date, {
        fresh: u.searchParams.get('fresh') === '1',
        bust: u.searchParams.get('bust') !== '0',
      });
      return sendJson(res, 200, { ins, date: Number(date), ...tape });
    }

    // تاریخچه دسته‌ای همه پاهای یک زنجیره. n=0 یعنی از اولین روز موجود.
    //
    // ═══ چرا یک منبعِ دوم لازم شد ═══
    //
    // `GetClosingPriceDailyList` برای ابزاری که از تابلو **حذف شده** خالی
    // برمی‌گردد. قرارداد اختیار پس از سررسید حذف می‌شود، پس هر بک‌تستِ
    // گذشته دقیقاً همان قراردادهایی را از دست می‌داد که موضوعش بودند —
    // همان سوگیری بقا، این‌بار یک لایه پایین‌تر از شناسایی.
    //
    // در فایل صاحب پروژه: از ۷۴ قراردادِ سه سررسیدِ گذشته، ۵۱ تا خالی
    // برگشتند؛ از سه سررسید زنده، فقط ۲۷ تا (و آن‌ها واقعاً معامله نشده
    // بودند).
    //
    // `GetClosingPriceHistory/{ins}/{date}` همان داده را دارد. مسیر
    // تاریخ‌دار است، پس فقط برای روزِ تکمیل‌شده — که برای بک‌تست همیشه
    // همین است.
    //
    // `asOf` اختیاری است: بی آن رفتار دقیقاً مثل قبل می‌ماند و هیچ
    // درخواست اضافه‌ای نمی‌رود.
    if (p === '/api/dailies') {
      const codes = insListOrReject(res, u.searchParams.get('ins'), 200, 'تابلوی روزانهٔ دسته‌ای');
      if (!codes) return undefined;
      const rawN = u.searchParams.get('n');
      const n = rawN == null || rawN === '' ? 0 : Math.max(0, Math.trunc(Number(rawN) || 0));
      const asOf = u.searchParams.get('asOf');
      const canFallback = validCompactDate(asOf);
      const one = async (code) => {
        const listPath = `/ClosingPrice/GetClosingPriceDailyList/${code}/${n}`;
        try {
          const rows = normalizeDailyRows(firstList(await get(listPath, S.ttlDailySec, 6)));
          if (rows.length || !canFallback) return [code, { ins: code, rows, source: 'list' }];
          // منبع دوم فقط وقتی اولی خالی است. اگر این هم خالی بود، خالی
          // می‌ماند — جای هیچ ردیف ساختگی نیست.
          const histPath = `/ClosingPrice/GetClosingPriceHistory/${code}/${asOf}`;
          try {
            // ═══ چرا پاسخِ این منبع صافی می‌خورد ═══
            //
            // بند ۵ ممیزی، نمونهٔ واقعیِ اهرم برای ۲۰۲۶۰۹۱۹: این endpoint
            // یک رکورد با `dEven=0`، ساعت ۰۶:۱۲:۰۶، صفر معامله و قیمت
            // ۷۵٬۰۶۴ داد — در حالی که پایانیِ همان روز ۷۳٬۵۲۷ بود و
            // ۷۵٬۰۶۴ قیمتِ **روز قبل**. کد آن را به `date:0` تبدیل
            // می‌کرد و چون آرایه خالی نبود `source:'history'` می‌داد،
            // پس یک عکسِ پیش‌جلسه به‌جای روزانهٔ معتبر می‌نشست.
            //
            // حالا ردیفِ بی‌تاریخ و عکسِ پیش‌جلسه رد می‌شوند و — مهم‌تر —
            // پاسخ می‌گوید آیا روزِ خواسته‌شده واقعاً پوشش داده شد.
            // این endpoint تک‌روزه است و حلقهٔ بازه ندارد، پس «چند ردیف
            // آمد» اثباتِ «روزِ گمشده برگشت» نیست.
            const trusted = trustedDailyRows(normalizeDailyRows(firstList(await get(histPath, S.ttlDailySec, 6))));
            const covers = coversDailyDate(trusted.rows, asOf);
            return [code, {
              ins: code, rows: trusted.rows,
              source: trusted.rows.length ? 'history' : 'list',
              fallbackTried: true,
              fallbackCovers: covers,
              ...(trusted.dropped ? { fallbackDropped: trusted.dropped, fallbackDropReasons: trusted.reasons } : {}),
              ...(trusted.rows.length && !covers
                ? { fallbackNote: `منبع جایگزین ${asOf} را پوشش نداد` } : {}),
              ...(!trusted.rows.length && trusted.dropped
                ? { fallbackNote: `منبع جایگزین ${trusted.dropped} ردیف داد و هیچ‌کدام روزانهٔ معتبر نبود` } : {}),
            }];
          } catch (e2) {
            return [code, {
              ins: code, rows: [], source: 'list', fallbackTried: true,
              fallbackError: `${e2.name}: ${e2.message}`,
            }];
          }
        } catch (e) {
          return [code, { ins: code, rows: [], source: 'list', error: `${e.name}: ${e.message}` }];
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
      const codes = insListOrReject(res, u.searchParams.get('ins'), 200,
        p === '/api/books' ? 'دفتر سفارشِ دسته‌ای' : 'اطلاعات جاریِ دسته‌ای');
      if (!codes) return undefined;
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
    // ——— دفترچهٔ معاملات ———
    //
    // فقط افزودن. هیچ مسیری ردیف را عوض یا حذف نمی‌کند، و این محدودیت
    // عمدی است: دفترچه‌ای که بشود اصلاحش کرد، همان حافظهٔ انتخابی است.
    // اشتباه ثبت‌شده با یک ردیفِ اصلاحیِ تازه جبران می‌شود.
    if (p === '/api/journal') {
      const file = path.join(ROOT, 'data', 'journal.json');
      const read = async () => {
        try { return JSON.parse(await fs.readFile(file, 'utf8')); }
        catch { return []; }
      };
      if (req.method === 'GET') {
        const list = normalizeJournal(await read());
        return sendJson(res, 200, { count: list.length, cap: JOURNAL_CAP, rows: list });
      }
      if (req.method === 'POST') {
        const body = JSON.parse(await readBody(req, MAX_BODY) || 'null');
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return sendJson(res, 400, { error: 'ردیف دفترچه لازم است' });
        }
        // زمان از سرور می‌آید نه از مرورگر: ساعتِ مرورگر می‌تواند عقب یا
        // جلو باشد و ترتیبِ دفترچه تنها چیزی است که معنایش را نگه می‌دارد.
        const made = makeEntry({ ...body, at: Date.now() });
        if (!made.ok) return sendJson(res, 400, { error: made.why });
        const list = appendEntry(await read(), made.entry);
        await writeJsonAtomic(file, list, { space: 2 });
        return sendJson(res, 200, { ok: true, entry: made.entry, count: list.length });
      }
      return sendJson(res, 405, { error: 'روش پشتیبانی نمی‌شود' });
    }

    if (p === '/api/positions') {
      const file = path.join(ROOT, 'data', 'positions.json');
      if (req.method === 'GET') {
        try { return send(res, 200, await fs.readFile(file, 'utf8')); }
        catch { return sendJson(res, 200, []); }
      }
      if (req.method === 'PUT') {
        const list = JSON.parse(await readBody(req, MAX_BODY) || '[]');
        if (!Array.isArray(list)) return sendJson(res, 400, { error: 'فهرست لازم است' });
        await writeJsonAtomic(file, list, { space: 2 });
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
        await writeJsonAtomic(file, body, { space: 2 });
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
