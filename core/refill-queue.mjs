// صفِ تلاشِ تکمیلی — کدام ابزار/روز هنوز کم دارد، و با چه ترتیبی دوباره
// پرسیده شود.
//
// ═══ چرا این لازم شد ═══
//
// جمع‌بندیِ بازآزماییِ عملیِ دور سوم: «اعلام درست کسری، جای دریافت داده را
// نمی‌گیرد.» سه نوبت ممیزی صرفِ این شد که برنامه **بفهمد** چه چیزی کم
// دارد و صادقانه بگوید — و آن کار تمام شد. ولی کاربری که فایلش ۱٬۱۶۳
// ابزار/روزِ «نیامد» دارد، با یک گزارشِ دقیق هم هنوز دادهٔ آن روزها را
// ندارد.
//
// و بالادست در همان اجرا نشان داد ناپایدار است: روزی از هر دو مسیر خالی
// برگشت و چند دقیقه بعد همان روز کامل آمد. پس «نیامد» اغلب یعنی «حالا
// نیامد»، نه «وجود ندارد» — و تنها راهِ صادقانهٔ پرکردنش، تلاشِ دوبارهٔ
// **با فاصله** است.
//
// ═══ چرا دوباره‌گرفتنِ کلِ بازه جواب نیست ═══
//
// بازهٔ سه‌ماههٔ گزارش‌شده ۲٬۷۱۷ ابزار/روز داشت که ۱٬۰۳۹ تایش کامل آمده
// بود. گرفتنِ دوبارهٔ همه یعنی دور ریختنِ آن ۱٬۰۳۹ و مصرفِ دوبارهٔ سهمیهٔ
// بالادست برای چیزی که در دست است — و چون سهمیه خودش مظنونِ اصلیِ آن
// حفره است، این کار مشکل را بزرگ‌تر می‌کند نه کوچک‌تر.
//
// پس صف فقط **کم‌داشته‌ها** را نگه می‌دارد، و هر تلاش روی همان‌ها می‌رود.

import { num } from './num.mjs';

const n = (x) => num(x);

/** چرا این ابزار/روز هنوز در صف است. */
export const REFILL_REASON = {
  missing: 'تابلو معامله ثبت کرده ولی ریزمعامله نیامد',
  partial: 'داده آمد ولی از تابلوی روزانه کمتر است',
  error: 'دریافتش خطا داد',
  absent: 'درخواستش اصلاً نرفت',
};

/** سقفِ تلاش برای هر ابزار/روز. بی سقف، صف تا ابد می‌چرخد. */
export const REFILL_MAX_ATTEMPTS = 4;

/**
 * فاصلهٔ پیش از دورِ بعد، بر حسب میلی‌ثانیه.
 *
 * ═══ چرا فاصله، و چرا فزاینده ═══
 *
 * اگر علتِ خالی‌بودن فشارِ سهمیه باشد، تلاشِ فوری فقط همان فشار را ادامه
 * می‌دهد. فاصله به بالادست مهلت می‌دهد و به ما می‌گوید اگر پس از چند دقیقه
 * هم نیامد، دیگر «حالا نیامد» نیست.
 *
 * عمداً کوتاه شروع می‌شود (۵ ثانیه) چون بیشترِ ناپایداری‌های دیده‌شده
 * گذرا بودند، و تا دو دقیقه بالا می‌رود تا یک اجرای طولانی سهمیه را
 * نخورد.
 */
export function refillDelayMs(round = 1) {
  const step = Math.max(1, Math.trunc(n(round)));
  return Math.min(120000, 5000 * (2 ** (step - 1)));
}

/**
 * صفِ کم‌داشته‌ها، مرتب بر **ارزشِ** آنچه جا مانده.
 *
 * ترتیب تصادفی نیست: ابزار/روزی که تابلو برایش ۳۷٬۳۰۶ معامله ثبت کرده،
 * پیش از آن می‌رود که ۵ معامله کم دارد. اگر سهمیه وسطِ کار تمام شود،
 * چیزی که به دست آمده بیشترین ارزش را دارد.
 *
 * `attemptsByKey` تلاش‌های قبلی را حمل می‌کند تا صف بین اجراها **ادامه**
 * پیدا کند، نه اینکه از صفر شروع شود.
 */
export function refillQueue(pairs = [], items = {}, audit = [], {
  maxAttempts = REFILL_MAX_ATTEMPTS, attemptsByKey = {},
} = {}) {
  const verdicts = new Map((audit || []).map((row) => [row.key, row]));
  const out = [];
  for (const pair of pairs || []) {
    const hit = items?.[pair.key];
    const seen = verdicts.get(pair.key);
    // نوارِ زنده دوباره گرفتنی نیست: روزِ جاری از مسیر تاریخی نمی‌آید.
    if (String(hit?.source || '') === 'live') continue;

    let reason = '';
    if (!hit) reason = 'absent';
    else if (hit.error) reason = 'error';
    else if (seen?.verdict === 'missing') reason = 'missing';
    else if (seen?.verdict === 'partial') reason = 'partial';
    if (!reason) continue;

    const attempts = Math.max(0, Math.trunc(n(attemptsByKey[pair.key] ?? hit?.attempts)));
    if (attempts >= maxAttempts) continue;

    // ارزشِ جامانده: برای «نیامد» کلِ تابلو، برای «ناقص» همان کسری.
    const gapTrades = seen?.verdict === 'partial' ? n(seen.tradeGap) : n(seen?.dailyTrades);
    const gapVolume = seen?.verdict === 'partial' ? n(seen.volumeGap) : n(seen?.dailyVolume);
    out.push({
      key: pair.key, ins: String(pair.ins), date: pair.date,
      reason, attempts,
      gapTrades: Number.isFinite(gapTrades) ? gapTrades : 0,
      gapVolume: Number.isFinite(gapVolume) ? gapVolume : 0,
    });
  }
  return out.sort((a, b) => b.gapVolume - a.gapVolume || b.gapTrades - a.gapTrades
    || a.date - b.date || a.ins.localeCompare(b.ins));
}

/**
 * پیشرفتِ یک دورِ تکمیلی — چه چیزی واقعاً به دست آمد.
 *
 * «چند تلاش رفت» گزارشِ پیشرفت نیست؛ «چند ابزار/روز پر شد و چند معامله
 * اضافه شد» هست. بی این تفکیک، یک حلقهٔ بی‌اثر هم موفق به نظر می‌رسد.
 */
export function refillProgress(queue = [], before = {}, after = {}) {
  let filled = 0, improved = 0, gainedTrades = 0, stillEmpty = 0;
  for (const job of queue || []) {
    const was = Array.isArray(before?.[job.key]?.rows) ? before[job.key].rows.length : 0;
    const now = Array.isArray(after?.[job.key]?.rows) ? after[job.key].rows.length : 0;
    if (now > was) {
      gainedTrades += now - was;
      if (was === 0) filled += 1; else improved += 1;
    } else if (now === 0) stillEmpty += 1;
  }
  return { tried: (queue || []).length, filled, improved, gainedTrades, stillEmpty };
}

/**
 * ثبتِ تلاش روی خودِ رکورد، تا صف بین دورها حافظه داشته باشد.
 *
 * شمارنده روی `items` می‌نشیند چون همان چیزی است که به فایل می‌رود؛ پس
 * برگ پوشش می‌تواند بگوید هر ابزار/روز چند بار پرسیده شده و آخرین بار
 * کِی بوده. بی این، «تلاش کردیم» یک ادعای شفاهی است.
 */
export function markRefillAttempt(record = {}, at = Date.now()) {
  return {
    ...record,
    attempts: Math.max(0, Math.trunc(n(record.attempts))) + 1,
    lastAttemptAt: Math.trunc(n(at)) || 0,
  };
}

/** خلاصهٔ وضعیتِ صف برای جملهٔ رابط و برگ راهنما. */
export function refillSummary(queue = []) {
  const list = Array.isArray(queue) ? queue : [];
  const of = (reason) => list.filter((job) => job.reason === reason).length;
  return {
    total: list.length,
    missing: of('missing'), partial: of('partial'),
    error: of('error'), absent: of('absent'),
    gapTrades: list.reduce((sum, job) => sum + job.gapTrades, 0),
    worst: list[0] || null,
  };
}
