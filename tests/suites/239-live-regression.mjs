// ۲۳۹. بازآزماییِ زندهٔ ۱۴۰۵/۰۶/۱۶ روی `10557f8` — دو ایرادِ P1
//
// ═══ آنچه این دور مشترک بود ═══
//
// پنج ایرادِ دورِ قبل تأیید شدند و دو ایرادِ تازه ماند. هر دو یک شکل داشتند:
// **حالتی که هیچ‌کس اعلامش نمی‌کرد.**
//
//   · آزمایشگاه: `legs` می‌توانست `null` باشد — یک وضعیتِ کاملاً عادی — و
//     هیچ‌جا این را نمی‌گفت؛ فقط تب کامل از کار می‌افتاد.
//   · دیده‌بان: عکس ۲۹۰ ثانیه کهنه بود با `paused=false` و خطای صفر. هیچ
//     شمارنده‌ای دروغ نمی‌گفت؛ هیچ‌کدام هم این سؤال را نمی‌پرسیدند.
//
// درس: **شمارنده‌ها با هم، یک وضعیت نمی‌سازند.** اگر سؤالی هست که کاربر
// می‌پرسد («این عدد مالِ کِی است؟»)، یک نفر باید صریح جوابش را بدهد.

// همهٔ خواندن‌های پرونده اینجا ناهمگام‌اند و روی پوشهٔ موقت، نه روی منبع.
// نگهبان ۷ خواندنِ همگامِ پرونده را در دسته‌ها ممنوع کرده تا کسی منبع را بی
// نرمال‌کردنِ پایان‌خط نخواند؛ آن قاعده درست است و دور زدنش با نسخهٔ همگامِ
// دیگر، همان قاعده را از پشت می‌شکند.
import fsp from 'node:fs/promises';
import os from 'node:os';
import nodePath from 'node:path';
import { check, group, readSrc } from '../harness.mjs';
import { strategyLegSnapshots } from '../../core/history.mjs';
import { watchHealth, watchStaleLimitSec } from '../../core/watch-health.mjs';
import { makeJobQueue } from '../../server/job-queue.mjs';
import {
  writeJsonAtomic, writeJsonAtomicSync,
  retryRename, retryRenameSync, isLockError, RETRY_DELAYS_MS,
} from '../../server/atomic-json.mjs';

group('۲۳۹ P1‑۱ — پیوندِ آزمایشگاه، تب را از کار نمی‌اندازد');

// «تب باز نشد — Cannot read properties of null (reading 'map')»
// core/history.mjs:124 در strategyLegSnapshots، از paintSnapshots.
//
// `legs = []` در امضا، فقط `undefined` را می‌گیرد. `backtest.mjs` عمداً
// `null` می‌گذارد تا بگوید «ترکیبی انتخاب نشده».
check('پاهای null دیگر نمی‌ترکاند — آرایهٔ خالی برمی‌گردد',
  Array.isArray(strategyLegSnapshots(null, {}, 20260101))
  && strategyLegSnapshots(null, {}, 20260101).length === 0);
check('و undefined هم همان‌طور', strategyLegSnapshots(undefined, {}, 20260101).length === 0);
check('و ورودیِ بی‌ربط هم به‌جای ترکیدن، خالی می‌دهد',
  strategyLegSnapshots(42, {}, 20260101).length === 0
  && strategyLegSnapshots({}, {}, 20260101).length === 0);

// و مسیرِ درست همچنان کار می‌کند — «مقاومِ در برابر null» نباید یعنی «کور».
const series = { A1: [{ date: 20260101, close: 500, last: 510, low: 495, high: 515, vol: 20, trades: 4, value: 10000 }] };
const snaps = strategyLegSnapshots(
  [{ ins: 'A1', name: 'ضتست۱', kind: 'call', side: 'buy', strike: 1000 }], series, 20260101);
check('پاهای واقعی همچنان عکس می‌گیرند',
  snaps.length === 1 && snaps[0].missing === false && snaps[0].market.volume === 20);
check('و پایی که آن روز داده ندارد، «نبود» علامت می‌خورد',
  strategyLegSnapshots([{ ins: 'B9', kind: 'put', side: 'sell' }], series, 20260101)[0].missing === true);

const btSrc = readSrc('../ui/tabs/backtest.mjs');
check('و ریشه هم بسته شد: خروجِ زودهنگام، حالتِ کهنه را پاک می‌کند',
  btSrc.includes('exitDates = [];') && btSrc.includes("empty: 'اول یک ترکیب معتبر انتخاب کن.'"));
check('پس چرخِ خروجِ ترکیبِ رفته، بازخوردش به paintSnapshots نمی‌رسد',
  btSrc.includes("if (!legs) { /* بند بالا گفته چرا */ }"));

group('۲۳۹ P1‑۲الف — کهنگی، خودش یک حکم است');

// «watchTicks روی ۹۰ ثابت ماند … paused=false، watchConsecutiveFails=0.»
const OPEN = { open: true, intervalSec: 5 };
const now = 1_700_000_000_000;
check('بازارِ بسته هرگز کهنه نیست — آنجا کهنگی خبر نیست',
  watchHealth({ open: false, at: now - 9e5, now, intervalSec: 5 }).stale === false);
check('عکسِ تازه در بازارِ باز، سالم است',
  watchHealth({ ...OPEN, at: now - 4000, now }).stale === false);
check('و عکسِ ۲۹۰ ثانیه‌ای — همان عددِ گزارش — کهنه است',
  watchHealth({ ...OPEN, at: now - 290_000, now }).stale === true);
check('حکم، عددش را هم می‌گوید — و با رقم فارسی، چون جمله نمایشی است',
  watchHealth({ ...OPEN, at: now - 290_000, now }).ageSec === 290
  && watchHealth({ ...OPEN, at: now - 290_000, now }).why.includes('۲۹۰')
  && !/\d/.test(watchHealth({ ...OPEN, at: now - 290_000, now }).why));
check('ولی عددهای ساختاری خام می‌مانند تا بشود رویشان سنجید',
  typeof watchHealth({ ...OPEN, at: now - 290_000, now }).limitSec === 'number');
check('«هیچ عکسی نگرفته‌ایم» با «همین حالا» یکی نیست',
  watchHealth({ ...OPEN, at: 0, now }).ageSec === null
  && watchHealth({ ...OPEN, at: 0, now }).stale === true);
check('و در بازارِ بسته، نداشتنِ عکس هشدار نیست',
  watchHealth({ open: false, at: 0, now }).stale === false);
// مرزِ دقیق: چهار دور، با کفِ سی ثانیه.
check('سقف چهار برابرِ فاصله است', watchStaleLimitSec(30) === 120);
check('و کفش سی ثانیه، تا فاصلهٔ کوتاه هشدارِ کاذب نسازد',
  watchStaleLimitSec(2) === 30 && watchStaleLimitSec(5) === 30);
check('روی خودِ مرز هنوز سالم است، یک ثانیه بعدش کهنه',
  watchHealth({ ...OPEN, at: now - 30_000, now }).stale === false
  && watchHealth({ ...OPEN, at: now - 31_000, now }).stale === true);

const serverSrc = readSrc('../server/server.mjs');
check('سرور همان حکم را در سلامت بیرون می‌دهد',
  serverSrc.includes('watchStale: fresh.stale, watchStaleWhy: fresh.why, watchLimitSec: fresh.limitSec,'));
check('و لبه‌ای اعلام می‌کند، نه هر دور',
  serverSrc.includes('if (health.stale && !wasStale)') && serverSrc.includes("broadcast('recovered'"));
check('حلقه مهلتِ خودش را دارد و به ضمانتِ بیرونی تکیه نمی‌کند',
  serverSrc.includes('function watchDeadlineMs()') && serverSrc.includes('Promise.race(['));
const appSrc = readSrc('../ui/app.mjs');
check('نوار بالا کهنگی را نشان می‌دهد',
  appSrc.includes("stale.toggleAttribute('hidden', !h.watchStale)")
  && readSrc('../ui/index.html').includes('id="h-stale"'));
// عکس نشان داد: با `ageSec === null` جمله می‌شد «عکس تابلو — ثانیه کهنه است».
// عددِ نداشته، جملهٔ سوراخ می‌سازد.
check('و «هنوز عکسی نگرفته‌ایم» جملهٔ خودش را دارد، نه جملهٔ سوراخ',
  appSrc.includes('Number.isFinite(h.watchAgeSec)')
  && appSrc.includes('هنوز عکسی از تابلو گرفته نشده'));

group('۲۳۹ P1‑۲ب — ارثِ اولویت: کارِ تاریخی حلقهٔ زنده را گرسنه نمی‌کند');

// صف با سقفِ صفرِ عملی: هیچ کاری شروع نمی‌شود، پس ترتیبِ صف قابل خواندن است.
const frozen = makeJobQueue({ concurrency: () => 0 });
const done = [];
frozen.push(async () => done.push('t1'), 4);
const ticket = { priority: 4, job: null };
frozen.push(async () => done.push('history'), 4, ticket);
frozen.push(async () => done.push('t3'), 4);
check('کارها به ترتیبِ اولویت می‌نشینند', frozen.order().join(',') === '4,4,4');
check('و هیچ‌کدام با سقفِ صفر شروع نشده‌اند', frozen.running === 0 && done.length === 0);

// حالا حلقهٔ زنده به همان کار می‌پیوندد: اولویتِ ۱ باید به ارث برسد.
check('پیوستنِ صدازنندهٔ عجول، کار را جلو می‌اندازد', frozen.boost(ticket, 1) === true);
check('و صف واقعاً مرتب شد', frozen.order().join(',') === '1,4,4');
check('بلیت هم اولویتِ تازه را نگه می‌دارد', ticket.priority === 1);
check('عجلهٔ کمتر، چیزی را عقب نمی‌اندازد — ارث یک‌طرفه است',
  frozen.boost(ticket, 6) === false && ticket.priority === 1);
check('بلیتِ نداشته هم نمی‌ترکاند', frozen.boost(null, 1) === false);

// ترتیبِ واقعیِ اجرا، نه فقط ترتیبِ آرایه.
const ran = [];
const one = makeJobQueue({ concurrency: () => 1 });
let release = null;
const blocker = new Promise((r) => { release = r; });
const first = one.push(async () => { ran.push('blocker'); await blocker; }, 5);
await new Promise((r) => setTimeout(r, 0));
const lowTicket = { priority: 8, job: null };
const low = one.push(async () => { ran.push('low'); }, 8, lowTicket);
const mid = one.push(async () => { ran.push('mid'); }, 5);
one.boost(lowTicket, 1);
release();
await Promise.all([first, low, mid]);
check('کارِ در حالِ اجرا جابه‌جا نمی‌شود', ran[0] === 'blocker');
check('ولی کارِ جلو انداخته‌شده پیش از کارِ جلوتر از خودش اجرا می‌شود',
  ran[1] === 'low' && ran[2] === 'mid');

// خطای یک کار، صف را نمی‌خواباند.
const resilient = makeJobQueue({ concurrency: () => 2 });
let after = false;
await resilient.push(async () => { throw new Error('بالادست افتاد'); }, 5).catch(() => {});
await resilient.push(async () => { after = true; }, 5);
check('کارِ شکست‌خورده صف را نمی‌خواباند', after === true);
check('و شمارنده‌ها به صفر برمی‌گردند', resilient.running === 0 && resilient.depth === 0);

check('سرور از همین صف استفاده می‌کند، نه نسخهٔ دوم',
  serverSrc.includes('const jobs = makeJobQueue({') && !serverSrc.includes('async function pump()'));
check('و پیوستن به درخواستِ در پرواز، عجله را با خودش می‌برد',
  serverSrc.includes('if (held) { boostTicket(held.ticket, priority); return held.promise; }')
  && serverSrc.includes('if (joined) { boostTicket(joined.ticket, priority); return joined.promise; }'));
check('تلاشِ دوم هم اولویتِ تازه را می‌گیرد، نه اولویتِ صدازنندهٔ اول',
  serverSrc.includes('schedule(() => fetchUpstream(url), ticket.priority, ticket)'));

group('۲۳۹ P1‑۲ج — نوشتنِ اتمیک: خواننده نیمهٔ فایل را نمی‌بیند');

// «دفتر قراردادها خوانده نشد: Unterminated string in JSON at position 1460575»
const dir = await fsp.mkdtemp(nodePath.join(os.tmpdir(), 'roster-'));
const file = nodePath.join(dir, 'option-roster.json');
const big = { rows: Array.from({ length: 4000 }, (_, i) => ({ ins: `x${i}`, name: 'ضنمونه'.repeat(12), i })) };

await writeJsonAtomic(file, big);
check('نوشته می‌شود و کامل خوانده می‌شود',
  JSON.parse(await fsp.readFile(file, 'utf8')).rows.length === 4000);
check('پروندهٔ موقتی جا نمی‌ماند',
  (await fsp.readdir(dir)).filter((name) => name.endsWith('.tmp')).length === 0);

// ═══ آزمونِ واقعیِ پارگی ═══
//
// همان الگوی گزارش: یکی می‌نویسد، دیگری هم‌زمان می‌خواند. با
// `fs.writeFile` مستقیم، بعضی خواندن‌ها «JSON خراب» می‌دادند. اینجا هیچ‌کدام
// نباید بدهد — یا نسخهٔ قبلی، یا نسخهٔ تازه، هیچ‌وقت نیمه.
// ═══ خواننده باید واقعی باشد، نه قفلِ همیشگی ═══
//
// نسخهٔ اول با `setImmediate` می‌خواند، یعنی عملاً بی‌وقفه؛ مقصد تقریباً
// همیشه باز بود و روی ویندوز هیچ پنجره‌ای برای `rename` نمی‌ماند. آن
// خواننده هیچ مصرف‌کنندهٔ واقعی‌ای را نشان نمی‌دهد: `readRoster` فقط وقتی
// می‌خواند که `mtime` عوض شده باشد.
//
// با پنج میلی‌ثانیه فاصله، هنوز ۹ خواندن از ۱۵۰ روی نویسندهٔ غیراتمیک
// پاره درمی‌آید — یعنی آزمون دندانش را از دست نداده — ولی نویسنده هم
// نفس می‌کشد. (اندازه‌گیری شد، حدس نیست.)
let torn = 0, ioFail = 0, reads = 0;
const writer = (async () => {
  for (let i = 0; i < 25; i += 1) await writeJsonAtomic(file, { ...big, round: i });
})();
const reader = (async () => {
  for (let i = 0; i < 150; i += 1) {
    try { JSON.parse(await fsp.readFile(file, 'utf8')); }
    catch (e) {
      // «نیمهٔ فایل» با «نشد بازش کنم» یکی نیست. اولی ایرادِ همین اصلاح است،
      // دومی ایرادِ سکو — و اگر هر دو یک شمارنده داشته باشند، قرمزِ CI
      // نمی‌گوید کدامش بوده.
      if (e instanceof SyntaxError) torn += 1; else ioFail += 1;
    }
    reads += 1;
    await new Promise((r) => { setTimeout(r, 5); });
  }
})();
await Promise.all([writer, reader]);
const faTest = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
check(`هیچ خواندنی نیمه‌کاره نبود — ${faTest(reads)} خواندن روی ۲۵ نوشتن`, torn === 0);
check(`و هیچ خواندنی هم شکست نخورد — ${faTest(ioFail)} خطای ورودی/خروجی`, ioFail === 0);

writeJsonAtomicSync(file, { rows: [], sync: true });
check('نسخهٔ همگام هم همان قرارداد را دارد',
  JSON.parse(await fsp.readFile(file, 'utf8')).sync === true
  && (await fsp.readdir(dir)).filter((name) => name.endsWith('.tmp')).length === 0);
await fsp.rm(dir, { recursive: true, force: true });

// ═══ درسی که CI ویندوز داد ═══
//
// job ویندوز روی همین اصلاح قرمز شد:
//   EPERM: operation not permitted, rename '….tmp' -> '…\\option-roster.json'
//
// در POSIX تغییرِ نام روی پروندهٔ بازِ خواننده مشکلی ندارد؛ در ویندوز
// `MoveFileEx` با EPERM برمی‌گردد. دروازهٔ لینوکسی این را نمی‌دید — و کدی که
// فقط روی یک سکو اجرا می‌شود و فقط آنجا آزمون دارد، عملاً بی‌آزمون است. پس
// حلقهٔ تلاش از خودِ نوشتن جدا شد تا اینجا هم سنجیده شود.
const lockErr = (code) => Object.assign(new Error(`${code}: قفل`), { code });
check('خطای قفلِ ویندوز شناخته می‌شود',
  ['EPERM', 'EACCES', 'EBUSY'].every((code) => isLockError(lockErr(code)) === true));
check('و خطای واقعی با آن اشتباه نمی‌شود',
  isLockError(lockErr('ENOENT')) === false && isLockError(null) === false);

let tries = 0;
const napped = [];
const ok3 = await retryRename(
  () => { tries += 1; if (tries < 3) throw lockErr('EPERM'); return 'شد'; },
  { sleep: async (ms) => { napped.push(ms); } });
check('قفلِ گذرا با تلاشِ دوباره باز می‌شود', ok3 === 'شد' && tries === 3);
check('و فاصله‌ها بالا می‌روند، نه چرخهٔ سوزان',
  napped.length === 2 && napped[0] < napped[1] && RETRY_DELAYS_MS.length >= 10);

let hardTries = 0;
let thrown = null;
await retryRename(() => { hardTries += 1; throw lockErr('ENOENT'); }, { sleep: async () => {} })
  .catch((e) => { thrown = e; });
check('خطای غیرقفلی همان اول بالا می‌رود — بودجه هدر نمی‌شود',
  thrown?.code === 'ENOENT' && hardTries === 1);

let forever = 0;
let gaveUp = null;
await retryRename(() => { forever += 1; throw lockErr('EBUSY'); }, { sleep: async () => {} })
  .catch((e) => { gaveUp = e; });
check('و قفلِ همیشگی هم بی‌نهایت تلاش نمی‌شود — خطای اصلی بالا می‌رود',
  gaveUp?.code === 'EBUSY' && forever === RETRY_DELAYS_MS.length + 1);

let syncTries = 0;
check('نسخهٔ همگام هم همان حلقه را دارد',
  retryRenameSync(() => { syncTries += 1; if (syncTries < 2) throw lockErr('EBUSY'); return 'شد'; },
    { sleep: () => {} }) === 'شد' && syncTries === 2);

check('سرور هیچ نوشتنِ JSON غیراتمیکی ندارد',
  !/fs\.writeFile\(/.test(serverSrc));
check('و ابزارِ دفتر هم همان‌طور',
  !/fs\.writeFileSync\(/.test(readSrc('../tools/roster-scan.mjs')));
