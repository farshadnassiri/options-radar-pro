// دروازهٔ ورودِ ریزمعامله — یک در، برای همهٔ تب‌ها.
//
// ═══ چرا این ماژول لازم شد ═══
//
// چهار دور ممیزی صرفِ این شد که تبِ «خروجی دیتا» بفهمد پاسخِ بالادست
// کامل است یا نه، و صادقانه بگوید. سرور حالا با هر پاسخ این‌ها را
// می‌فرستد:
//
//     complete   با تابلوی روزانه تطبیق کرد یا نه
//     verified   اصلاً مرجعی برای سنجش بود یا نه
//     shortfall  چقدر کم آمد
//     emptyBoth  هر دو پرچمِ بالادست خالی برگشتند
//     throttled  سهمیهٔ بالادست بسته شد و این یکی پرسیده نشد
//
// ولی بررسیِ کلِ رابط نشان داد **فقط همان یک تب** این‌ها را می‌خواند.
// بقیه `item.rows || []` برمی‌دارند و باقی را دور می‌ریزند:
//
//     ui/tabs/open-view.mjs         rows را می‌گیرد، حکم را نه
//     ui/tabs/backtest.mjs          `payload.items` خام
//     ui/tabs/portfolio-backtest.mjs یک جا می‌خواند، جای دیگر نه
//
// و چون پاسخِ **سهمیه‌خورده خطا ندارد** — `HTTP 200` با آرایهٔ خالی —
// هیچ‌کدام از آن تب‌ها نمی‌فهمد داده نیامده. نوارِ خالی «معامله‌ای نبود»
// خوانده می‌شود، و رویش استراتژی ساخته و نمودار کشیده می‌شود.
//
// ═══ قاعدهٔ این ماژول ═══
//
// **ردیف بی حکم تحویل داده نمی‌شود.** هر مصرف‌کننده `rows` را همراه
// `verdict` می‌گیرد، و اگر بخواهد حکم را نادیده بگیرد باید صریح بنویسد
// `.rows` — که در بازبینیِ کد دیده می‌شود، برخلاف `|| []` که نمی‌شود.
//
// نگهبانِ مخزن (دستهٔ ۲۹۱) هر فایلی را که مستقیم `/api/trades` را صدا
// بزند رد می‌کند. خودِ تابع مهم نیست؛ نگهبان مهم است — وگرنه فردا یک
// مسیرِ تازه اضافه می‌شود و همان اشتباه برمی‌گردد.

import { num } from '../core/num.mjs';

const n = (x) => num(x);

/** وضعیتِ یک ابزار/روز، پس از سنجش. */
export const TAPE_STATE = {
  complete: 'کامل — با تابلو تطبیق شد',
  partial: 'ناقص — کمتر از تابلو',
  missing: 'نیامد — تابلو معامله ثبت کرده',
  quiet: 'بی‌معامله — تابلو هم صفر است',
  unverified: 'تأییدنشده — تابلوی روزانه در دست نبود',
  throttled: 'سهمیهٔ بالادست — پرسیده نشد',
  error: 'خطای دریافت',
};

/**
 * حکمِ یک پاسخ، از همان میدان‌هایی که سرور می‌فرستد.
 *
 * ترتیب اهمیت دارد: سهمیه و خطا پیش از هر حکمِ دیگری می‌آیند، چون
 * دربارهٔ **رسیدن** حرف می‌زنند نه دربارهٔ بازار.
 */
export function tapeVerdict(item) {
  if (!item) return { state: 'missing', usable: false, rows: 0 };
  const rows = Array.isArray(item.rows) ? item.rows.length : 0;
  if (item.throttled) return { state: 'throttled', usable: false, rows };
  if (item.error) return { state: 'error', usable: false, rows, why: String(item.error) };
  if (item.complete === true) {
    return { state: item.quiet === true ? 'quiet' : 'complete', usable: true, rows };
  }
  if (item.verified === false) return { state: 'unverified', usable: rows > 0, rows };
  if (rows > 0) {
    return {
      state: 'partial', usable: false, rows,
      shortTrades: n(item.shortfall?.trades), shortVolume: n(item.shortfall?.volume),
    };
  }
  return {
    state: 'missing', usable: false, rows: 0,
    shortTrades: n(item.shortfall?.trades), shortVolume: n(item.shortfall?.volume),
  };
}

/**
 * یک بستهٔ ریزمعامله، با حکمِ هر ابزار/روز.
 *
 * `requests` همان شکلی است که `/api/trades/batch` می‌خواهد. خروجی
 * `{ items, verdicts, throttled, note }` است و `items` دست‌نخورده
 * می‌ماند تا مصرف‌کننده‌ای که میدانِ خاصی می‌خواهد بتواند بردارد.
 */
export async function fetchTapeBatch(requests = [], { fresh = false, bust = true, signal } = {}) {
  const response = await fetch('/api/trades/batch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ requests, fresh, bust }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
  const items = payload.items || {};
  const verdicts = {};
  for (const [key, item] of Object.entries(items)) verdicts[key] = tapeVerdict(item);
  return {
    items, verdicts,
    throttled: payload.throttled === true,
    note: String(payload.throttleNote || ''),
  };
}

/** همان، برای یک ابزار/روز. */
export async function fetchTapeOne(ins, date, { fresh = false, bust = true, signal } = {}) {
  const query = `ins=${encodeURIComponent(String(ins))}&date=${encodeURIComponent(String(date))}`
    + `${fresh ? '&fresh=1' : ''}${bust ? '' : '&bust=0'}`;
  const response = await fetch(`/api/trades?${query}`, { signal });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
  return { item: payload, verdict: tapeVerdict(payload) };
}

/**
 * ردیف‌هایی که می‌شود رویشان نمودار یا جدول ساخت — یا `null` (R5-20).
 *
 * خواستهٔ صاحب پروژه: «هرجا نمودار کشیده می‌شود یا دیتای جدولی هست، دیتا
 * کامل باشد و بریدگی نداشته باشد.» تا R5-13 تب‌ها حکم را می‌خواندند و
 * **هشدار** می‌دادند، ولی همان نوارِ بریده را باز هم رسم می‌کردند؛ نموداری
 * که بخشی از روزش افتاده، شکلِ یک حرکتِ واقعیِ بازار را دارد.
 *
 * قاعده همان قاعدهٔ آزمایشگاه (`dayFromBatch`، R5-19) است و یک جا نوشته
 * می‌شود: کامل و بی‌معاملهٔ تأییدشده پذیرفته است؛ نوارِ پرِ بی‌تابلو (پای
 * منقضی) هم — ردکردنش همهٔ روزهای قراردادِ منقضی را می‌انداخت؛ ولی ناقصِ
 * ثابت‌شده، نیامده، سهمیه و خطا `null` می‌گیرند. `null` با `[]` فرق دارد:
 * آرایهٔ خالی یعنی «معامله نشد»، `null` یعنی «نمی‌دانیم».
 */
export function usableRows(item, verdict = tapeVerdict(item)) {
  if (!verdict?.usable) return null;
  return Array.isArray(item?.rows) ? item.rows : [];
}

/**
 * جمع‌بندیِ یک بسته — همان چیزی که باید بالای هر جدول و نمودار بنشیند.
 *
 * «چند ردیف آمد» جمع‌بندی نیست. «چند ابزار/روز قابلِ تکیه است و چند تا
 * نه» هست.
 */
export function tapeSummary(verdicts = {}) {
  const list = Object.values(verdicts || {});
  const of = (state) => list.filter((v) => v.state === state).length;
  const complete = of('complete'), quiet = of('quiet');
  return {
    total: list.length,
    complete, quiet, partial: of('partial'), missing: of('missing'),
    unverified: of('unverified'), throttled: of('throttled'), error: of('error'),
    rows: list.reduce((sum, v) => sum + n(v.rows), 0),
    // «قابلِ تکیه» یعنی با تابلو سنجیده شده و خوانده — نه صرفاً «ردیف دارد».
    trusted: complete + quiet,
    suspect: list.length - complete - quiet,
  };
}

/**
 * جملهٔ هشدار، یا رشتهٔ خالی وقتی همه‌چیز سرِ جایش است.
 *
 * یک جا نوشته می‌شود تا هر تب همان حرف را بزند. تب‌ها تا امروز هر کدام
 * جملهٔ خودشان را داشتند و بیشترشان اصلاً چیزی نمی‌گفتند.
 */
export function tapeWarning(summary) {
  if (!summary || !summary.total || !summary.suspect) return '';
  const parts = [];
  if (summary.throttled) parts.push(`${summary.throttled} ابزار/روز پشتِ سهمیهٔ بالادست ماند و پرسیده نشد`);
  if (summary.missing) parts.push(`${summary.missing} ابزار/روز تابلو معامله ثبت کرده ولی ریزمعامله‌اش نیامد`);
  if (summary.partial) parts.push(`${summary.partial} ابزار/روز کمتر از تابلو آمد`);
  if (summary.unverified) parts.push(`${summary.unverified} ابزار/روز تابلوی روزانه‌اش در دست نبود، پس سنجیده نشد`);
  if (summary.error) parts.push(`${summary.error} ابزار/روز خطا داد`);
  return `${parts.join(' · ')} — نتیجه روی دادهٔ ناقص ساخته شده و ممکن است تصویرِ واقعی بازار نباشد.`;
}
