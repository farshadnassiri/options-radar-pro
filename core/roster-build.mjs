// ساختِ دفتر، چهار مرحله‌ای — یک نسخه، دو مصرف‌کننده.
//
// سرور (ساخت پس‌زمینه) و `tools/roster-scan.mjs` هر دو همین را اجرا
// می‌کنند. اگر هرکدام نسخهٔ خودش را داشت، روزی یکی‌شان مرحله‌ای را جا
// می‌انداخت و همان مسیر بی‌صدا به فهرست ناقص برمی‌گشت.
//
// شبکه **تزریق** می‌شود (`get`)، پس این ماژول بی‌شبکه کامل آزمون‌پذیر
// است — و آزمونش می‌تواند شکستِ هر مرحله را بسازد، که روی شبکهٔ واقعی
// سخت است.
//
// ═══ چهار مرحله، و چرا این ترتیب ═══
//
//   ۱ روزانه   سابقهٔ معاملات هر روز. ارزان و پرمحصول، ولی فقط
//              قراردادهایی را می‌دهد که معامله شده‌اند.
//   ۲ کاتالوگ  جست‌وجوی ابزار، برای هر عبارتی که مرحلهٔ ۱ ساخته.
//              همین‌جاست که قراردادِ بی‌معامله پیدا می‌شود.
//   ۳ مشخصات   برای قراردادی که تاریخ معامله ندارد، بازهٔ اعتبارش را از
//              خودِ بازار می‌گیرد. بی این، قراردادِ بی‌معامله عمر ندارد.
//   ۴ کنترل    جفتِ کال و پوت. ناقص‌ها گزارش می‌شوند و عبارتشان یک بار
//              دیگر جست‌وجو می‌شود — ولی هرگز ساخته نمی‌شوند.
//
// مرحلهٔ ۲ به خروجی ۱ نیاز دارد (عبارت‌ها از نمادهای دیده‌شده می‌آیند) و
// ۳ به خروجی ۲. ترتیب اتفاقی نیست.

import { flatTerms, infoPath, instrumentInfo, optionSpec, optionSpecPath, scanSearch, searchPath } from './roster-catalog.mjs';
import { dayPath, scanDay } from './roster-scan.mjs';
import { mergeRoster, pairAudit } from './option-roster.mjs';
import { num } from './num.mjs';

/** سقف‌های پیش‌فرض. عبور از این‌ها یعنی بالادست را کوبیدن. */
export const BUILD_LIMITS = {
  maxTerms: 10000,      // عبارت جست‌وجو در هر اجرا؛ شامل شاخه‌های رفع سقف ۴۰تایی
  maxDetails: 5000,     // قرارداد بی‌معاملهٔ مرتبط با پوشش که مشخصاتش گرفته می‌شود
  maxRetryTerms: 120,   // عبارتِ جفتِ ناقص، در پاس دوم
};

const emptyStats = () => ({
  dayQueriesDone: 0, dayQueriesFailed: 0,
  catalogQueriesDone: 0, catalogQueriesFailed: 0,
  detailQueriesDone: 0, detailQueriesFailed: 0,
  unsafeIdentifiers: 0, noTradeContracts: 0,
  detailDeferred: 0,
  catalogFound: 0, retryTerms: 0,
  catalogComplete: false, detailsComplete: false,
  truncated: [],
});

// پاسخ جست‌وجوی TSETMC حداکثر ۴۰ ردیف دارد و هیچ پرچم صفحه‌بندی نمی‌دهد.
// رسیدن دقیق به این عدد یعنی «ممکن است ادامه داشته باشد»، نه «تمام شد».
const SEARCH_RESULT_CAP = 40;

/**
 * اجرای کامل ساخت.
 *
 * `get(path)` باید JSON برگرداند و **باید** خواندنِ شناسه‌امن داشته باشد
 * (`core/json-safe.mjs`). این ماژول نمی‌تواند بفهمد شناسه‌ای گرد شده یا
 * نه — تا وقتی به اینجا برسد، رقم‌ها رفته‌اند.
 *
 * `days` فهرست روزهای **نبوده** است، نه کل بازه: تصمیمِ «کدام روز لازم
 * است» جای دیگری گرفته می‌شود.
 */
export async function runRosterBuild({
  days = [],
  existing = [],
  seed = [],
  scannedDays = [],
  get,
  onProgress = () => {},
  // نقطهٔ ذخیره: هر چند قلم، وضعیت **واقعی** (نه فقط شمارش) به
  // صداکننده داده می‌شود تا روی دیسک بنشیند. بی این، یک قطعی در روز
  // چهارصدم یعنی از نو — و دو سال یعنی پانصد درخواست.
  onCheckpoint = () => {},
  checkpointEvery = 25,
  catalogConcurrency = 6,
  detailConcurrency = 6,
  catalogAlreadyComplete = false,
  limits = BUILD_LIMITS,
  stopped = () => false,
} = {}) {
  const stats = emptyStats();
  let rows = Array.isArray(existing) ? existing.slice() : [];
  const before = rows.length;
  rows = mergeRoster(rows, Array.isArray(seed) ? seed : []);
  const scanned = [...scannedDays];
  let sinceSave = 0;
  const save = (force = false) => {
    if (!force && ++sinceSave < checkpointEvery) return;
    sinceSave = 0;
    onCheckpoint({ rows, scanned: [...new Set(scanned)].sort((a, b) => a - b), stats });
  };
  const total = days.length;

  // ── مرحلهٔ ۱: سابقهٔ روزانه ────────────────────────────────────────
  for (const day of days) {
    if (stopped()) return finish();
    try {
      rows = mergeRoster(rows, scanDay(await get(dayPath(day)), day).rows);
      scanned.push(day);
      stats.dayQueriesDone += 1;
    } catch (e) {
      stats.dayQueriesFailed += 1;
      stats.lastError = `روز ${day}: ${e.message}`;
    }
    onProgress({ stage: 'day', done: stats.dayQueriesDone + stats.dayQueriesFailed, total, rows: rows.length, stats });
    save();
  }

  // ── مرحلهٔ ۲: کاتالوگ ابزار ────────────────────────────────────────
  //
  // عبارت‌ها از نمادهای **دیده‌شده** ساخته می‌شوند، نه از قاعده‌ای روی
  // نام پایه: «اهرم» مکانیکی به «طهرم» تبدیل نمی‌شود و هیچ قاعده‌ای هم
  // نیست که این کار را درست انجام دهد.
  const terms = flatTerms(rows);
  const seenTerms = new Set();
  const symbolRoots = new Set();
  const rememberRoot = (row) => {
    if (row?.side !== 'call' && row?.side !== 'put') return '';
    const root = String(row?.symbol ?? '').match(/^[^\d\s]+/)?.[0] || '';
    if (root.length >= 2) symbolRoots.add(root);
    return root;
  };
  rows.forEach(rememberRoot);
  let catalogTruncated = false;
  if (!catalogAlreadyComplete) await runTerms(terms);
  stats.catalogComplete = catalogAlreadyComplete || (!catalogTruncated && stats.catalogQueriesFailed === 0);

  // ── مرحلهٔ ۳: مشخصات رسمی قراردادِ بی‌معامله ────────────────────────
  // ── چه کسی مشخصات لازم دارد ────────────────────────────────────────
  //
  // فقط قراردادی که **هیچ روز معامله‌ای** ندارد. برای بقیه، اولین و
  // آخرین روزِ دیده‌شده مرزِ کافی است و دو درخواستِ اضافه صرفاً بالادست
  // را می‌کوبد.
  //
  // معیارِ اول `fromCatalog` بود و غلط: ادغام، این پرچم را به ردیفِ
  // معامله‌شده هم می‌چسباند (چون همان قرارداد در جست‌وجو هم بود)، پس
  // برای هر بیست‌وهشت قرارداد بیست‌وهشت درخواست می‌رفت به‌جای شش.
  const noTrade = rows.filter((row) => !(num(row.first, 0) > 0));
  stats.noTradeContracts = noTrade.length;
  // قراردادِ منقضی پیش از آغاز پوشش فعلی، در هیچ بازهٔ پوشش‌داده‌شده‌ای
  // ظاهر نمی‌شود؛ گرفتن دو مشخصات رسمی برای هزاران قرارداد قدیمی فقط بار
  // می‌سازد. اگر کاربر بازه را عقب ببرد، `scanned` هم عقب می‌رود و همان
  // قراردادها در اجرای بعدی خودکار وارد نامزدهای مشخصات می‌شوند.
  const coveredFrom = scanned.length ? Math.min(...scanned) : 0;
  const relevantNoTrade = coveredFrom > 0
    ? noTrade.filter((row) => num(row.expiry, 0) >= coveredFrom)
    : noTrade;
  stats.detailDeferred = noTrade.length - relevantNoTrade.length;
  const needDetail = relevantNoTrade.filter((row) => !(num(row.listedFrom, 0) > 0));
  const useDetail = needDetail.slice(0, limits.maxDetails);
  if (needDetail.length > useDetail.length) stats.truncated.push(`مشخصات: ${useDetail.length} از ${needDetail.length}`);

  const detailCap = Math.max(1, Math.trunc(detailConcurrency) || 1);
  for (let at = 0; at < useDetail.length; at += detailCap) {
    if (stopped()) return finish();
    const batch = useDetail.slice(at, at + detailCap);
    await Promise.all(batch.map(async (row) => {
      try {
        let id = row.id;
        if (!id) {
          const info = instrumentInfo(await get(infoPath(row.ins)));
          if (info?.id) id = info.id;
          if (info?.contractSize > 0) row.contractSize = info.contractSize;
          if (info?.uaIns) row.uaIns = info.uaIns;
        }
        if (!id) throw new Error('شناسهٔ ابزار به دست نیامد');
        const spec = optionSpec(await get(optionSpecPath(id)));
        if (!spec) throw new Error('مشخصات قرارداد خالی بود');
        row.id = id;
        if (spec.listedFrom > 0) row.listedFrom = spec.listedFrom;
        if (spec.listedTo > 0) row.listedTo = spec.listedTo;
        if (spec.strike > 0 && !(row.strike > 0)) row.strike = spec.strike;
        if (spec.contractSize > 0) row.contractSize = spec.contractSize;
        if (spec.uaIns) row.uaIns = spec.uaIns;
        stats.detailQueriesDone += 1;
      } catch (e) {
        stats.detailQueriesFailed += 1;
        stats.lastError = `مشخصات ${row.ins}: ${e.message}`;
      }
      save();
    }));
    onProgress({ stage: 'detail', done: stats.detailQueriesDone + stats.detailQueriesFailed, total: useDetail.length, rows: rows.length, stats });
  }
  stats.detailsComplete = needDetail.length === useDetail.length && stats.detailQueriesFailed === 0;

  // ── مرحلهٔ ۴: کنترل جفت، و یک پاس دوم برای ناقص‌ها ──────────────────
  //
  // پاس دوم عمداً یک بار است. اگر بعدش هم ناقص ماند، یعنی جست‌وجو آن سمت
  // را ندارد و تکرارِ همان درخواست چیزی عوض نمی‌کند — فقط بالادست را
  // می‌کوبد و «تلاش کردیم» را با «پیدا کردیم» اشتباه می‌گیرد.
  const audit = pairAudit(rows);
  const retry = audit.terms.filter((term) => !seenTerms.has(term)).slice(0, limits.maxRetryTerms);
  stats.retryTerms = retry.length;
  if (!catalogAlreadyComplete && retry.length) await runTerms(retry);

  return finish();

  async function runTerms(list) {
    const queue = [...new Set(list)];
    const queued = new Set(queue);
    let at = 0;
    while (at < queue.length) {
      if (seenTerms.size >= limits.maxTerms) {
        catalogTruncated = true;
        stats.truncated.push(`عبارت جست‌وجو: سقف ${limits.maxTerms} از ${queue.length}`);
        break;
      }
      if (stopped()) return;
      const batch = [];
      const cap = Math.max(1, Math.trunc(catalogConcurrency) || 1);
      while (at < queue.length && batch.length < cap && seenTerms.size < limits.maxTerms) {
        const term = queue[at++];
        if (seenTerms.has(term)) continue;
        seenTerms.add(term);
        batch.push(term);
      }
      const responses = await Promise.all(batch.map(async (term) => {
        try { return { term, got: scanSearch(await get(searchPath(term))) }; }
        catch (error) { return { term, error }; }
      }));
      for (const { term, got, error } of responses) {
        if (error) {
          stats.catalogQueriesFailed += 1;
          stats.lastError = `جست‌وجوی «${term}»: ${error.message}`;
          save();
          continue;
        }
        stats.unsafeIdentifiers += got.unsafe;
        const grew = mergeRoster(rows, got.rows);
        stats.catalogFound += grew.length - rows.length;
        rows = grew;
        stats.catalogQueriesDone += 1;
        for (const row of got.rows) {
          const root = rememberRoot(row);
          if (root && !queued.has(root) && !seenTerms.has(root)) {
            queued.add(root);
            queue.push(root);
          }
        }

        // جست‌وجوی پیشوندی که به سقف خورده با رقم بعدی شکسته می‌شود.
        // نماد قرارداد بعد از پیشوند حرفی همیشه با رقم ادامه دارد؛ بنابراین
        // ده شاخه همهٔ نتایج واقعی را می‌پوشانند، بدون ساختن هیچ شناسه‌ای.
        const root = [...symbolRoots].find((candidate) => term === candidate
          || (term.startsWith(candidate) && /^\d+$/.test(term.slice(candidate.length))));
        if (root && got.matched >= SEARCH_RESULT_CAP) {
          for (let digit = 0; digit <= 9; digit += 1) {
            const child = `${term}${digit}`;
            if (queued.has(child) || seenTerms.has(child)) continue;
            queued.add(child);
            queue.push(child);
          }
        }
        save();
      }
      onProgress({ stage: 'catalog', done: seenTerms.size, total: queue.length, rows: rows.length, stats });
    }
  }

  function finish() {
    save(true);
    const final = pairAudit(rows);
    return {
      rows,
      scanned: [...new Set(scanned)].sort((a, b) => a - b),
      added: rows.length - before,
      stats: { ...stats, incompletePairs: final.incomplete, pairGroups: final.groups },
      audit: final,
    };
  }
}
