// مظنهٔ زنده — کدام ابزارها اول، و کِی می‌شود اسمش را «زنده» گذاشت.
//
// ═══ چرا این فایل هست ═══
//
// دو تب (رادار فاصله و دیده‌بان شرطی) هر ده ثانیه از `/api/live-trades`
// قیمت می‌گیرند و رویش تصمیم مالی می‌سازند. تا امروز هر دو همین دو کار را
// درجا و متفاوت انجام می‌دادند:
//
//   ۱ انتخابِ ۲۴ ابزار     `…map(String(leg.ins))).slice(0, 24)`
//   ۲ ساختِ نگاشتِ قیمت    `if (price > 0) prices[ins] = price`
//
// هر دو غلط بودند و گزارشِ صاحب پروژه هر دو را گرفت:
//
// **«اولویتِ پرمعامله‌ترین پاها اجرا نشده است.»** `slice(0, 24)` اولین
// بیست‌وچهار شناسهٔ **تولیدشده** را برمی‌دارد. ترتیبِ تولید از حلقهٔ
// ساختِ ترکیب‌ها می‌آید و هیچ ربطی به حجم، ارزش معامله یا نزدیکی به شرط
// ندارد. بدتر: بریدنِ فهرستِ **پاها** ترکیب را نصفه می‌کند — پای اولش
// قیمت می‌گیرد و پای دومش نه، پس آن ترکیب هم پوشش ندارد و سهمیه‌اش هم
// سوخته. بودجه باید به **ترکیب** داده شود، نه به پا.
//
// **«منبعِ زنده آخرین معاملهٔ هر پا است، نه قیمت قابل اجرا … دو پا ممکن
// است در ساعت‌های متفاوت معامله شده باشند، ولی ترکیب زنده معرفی شود.»**
// آخرین معاملهٔ یک پا می‌تواند مالِ ۹:۰۵ باشد و پای دیگر ۱۲:۲۵. تفاضلِ
// این دو، عددی است که هیچ لحظه‌ای در بازار وجود نداشته. این ماژول زمانِ
// هر پا را هم حمل می‌کند و ترکیبی که پاهایش هم‌زمان نیستند «زنده» خوانده
// نمی‌شود.
//
// ═══ آنچه این ماژول ادعا نمی‌کند ═══
//
// `/Trade/GetTrade` دفترِ سفارش نمی‌دهد، پس «بهترین خرید/فروش» در دسترس
// نیست و این ماژول وانمود نمی‌کند که هست. آنچه می‌دهد صادقانه همین است:
// آخرین معاملهٔ هر پا، سنِ آن، و اینکه پاها چقدر از هم دورند. تصمیمِ
// «این قابل اجراست یا نه» با کاربری است که این سه عدد را می‌بیند.

import { num } from './num.mjs';
import { tradeSecond } from './backtest.mjs';

const finite = (value) => Number.isFinite(value);

/** سقفِ `/api/live-trades`. اینجا نوشته می‌شود تا رابط عددِ جادویی نداشته باشد. */
export const LIVE_INS_CAP = 24;

/**
 * پیش‌فرضِ «هم‌زمانی»: دو پایی که بیش از این از هم دور معامله شده‌اند،
 * تفاضلشان عددِ یک لحظهٔ واقعی نیست.
 *
 * پنج دقیقه از روی خودِ تابلو انتخاب شده نه از روی سلیقه: قراردادهای
 * کم‌معاملهٔ بازار ایران در جلسهٔ پیوسته معمولاً چند دقیقه‌ای یک معامله
 * می‌خورند، و سخت‌گیری بیشتر یعنی هیچ ترکیبی زنده نشود.
 */
export const DEFAULT_SPREAD_SEC = 300;

/** و سنِ خودِ آخرین معامله: پایی که یک ساعت است معامله نشده، مظنهٔ اکنون نیست. */
export const DEFAULT_AGE_SEC = 1800;

/**
 * اولویت‌های انتخابِ ترکیب برای سهمیهٔ زنده.
 *
 * `listed` عمداً هست: کاربری که جدول را روی ستونی مرتب کرده، ترتیبِ خودش
 * را دارد و ما نباید رویش تصمیم بگیریم.
 */
export const LIVE_PRIORITIES = [
  { id: 'value', label: 'پرمعامله‌ترین — ارزش معاملهٔ نازک‌ترین پا',
    hint: 'ترکیبی که هر دو پایش امروز واقعاً معامله شده‌اند، اول سهمیه می‌گیرد.' },
  { id: 'volume', label: 'پرحجم‌ترین — حجم معاملهٔ نازک‌ترین پا',
    hint: 'همان، ولی با حجم به‌جای ارزش ریالی.' },
  { id: 'near', label: 'نزدیک‌ترین به شرط',
    hint: 'ترکیبی که تا برقرار شدنِ هشدارت کم مانده، اول قیمتِ زنده می‌گیرد. بی هشدارِ فعال، به ترتیب جدول برمی‌گردد.' },
  { id: 'listed', label: 'ترتیب جدول — همان‌طور که مرتب کرده‌ام',
    hint: 'ترتیبی که خودت با مرتب‌سازی ستون‌ها ساخته‌ای، دست‌نخورده می‌ماند.' },
];

const PRIORITY_BY_ID = new Map(LIVE_PRIORITIES.map((row) => [row.id, row]));
export const livePriority = (id) => PRIORITY_BY_ID.get(String(id ?? '')) || PRIORITY_BY_ID.get('value');

/** پاهای اختیارِ یک ترکیب، یکتا. پایهٔ سهام، ابزارِ جداگانه‌ای است و اینجا نمی‌آید. */
export function comboLegIns(legs = []) {
  const out = [];
  for (const leg of legs || []) {
    if (!leg || leg.kind === 'underlying') continue;
    const ins = String(leg.ins ?? '').trim();
    if (ins && !out.includes(ins)) out.push(ins);
  }
  return out;
}

const BUILTIN_SCORE = {
  value: (row) => num(row?.metrics?.legValue, NaN),
  volume: (row) => num(row?.metrics?.legVolume, NaN),
  listed: () => NaN,
  near: () => NaN,
};

/**
 * سهمیهٔ ۲۴ ابزار را بین ترکیب‌ها پخش می‌کند — **کامل**، نه نصفه.
 *
 * ترتیب: ترکیب‌ها با امتیازِ اولویت مرتب می‌شوند (عددِ نداشته آخر، و
 * ترتیبِ ورودی به‌عنوان شکنندهٔ تساوی تا نتیجه پایدار بماند)؛ بعد یکی‌یکی
 * برداشته می‌شوند و ترکیبی جا می‌گیرد که **همهٔ** پاهایش در بودجه بگنجد.
 * ترکیبی که جا نشد، حلقه را نمی‌شکند: ترکیبِ کوچک‌ترِ بعدی ممکن است در
 * باقی‌ماندهٔ بودجه جا شود و سهمیهٔ خالی هدر است.
 *
 * `reserve` برای نمادِ پایه است. قیمتِ زندهٔ پایه، هم شرطِ «قیمت نماد
 * پایه» را ممکن می‌کند و هم مبنای وجه تضمین را زنده نگه می‌دارد؛ یک خانه
 * از بیست‌وچهار، ارزشش را دارد.
 *
 * @returns {{ins:string[], keys:string[], covered:number, dropped:number, cap:number, reserved:string[]}}
 */
export function planLiveQuotes({
  rows = [], cap = LIVE_INS_CAP, priority = 'value', reserve = [], score = null,
} = {}) {
  const limit = Math.max(0, Math.trunc(num(cap, LIVE_INS_CAP)));
  const chosen = [];
  const reserved = [];
  for (const one of reserve || []) {
    const ins = String(one ?? '').trim();
    if (!ins || chosen.includes(ins)) continue;
    if (chosen.length >= limit) break;
    chosen.push(ins); reserved.push(ins);
  }
  const mode = livePriority(priority).id;
  const scoreOf = typeof score === 'function' ? score : BUILTIN_SCORE[mode];
  const ranked = (rows || []).map((row, at) => ({ row, at, score: num(scoreOf(row, at), NaN) }));
  // `listed` و امتیازِ نداشته هر دو یعنی «ترتیب ورودی». مرتب‌سازی پایدارِ
  // جاوااسکریپت خودش این را می‌دهد، ولی صریح نوشتنش یعنی آزمون می‌تواند
  // رویش حکم بدهد.
  ranked.sort((a, b) => {
    const av = finite(a.score) ? a.score : -Infinity;
    const bv = finite(b.score) ? b.score : -Infinity;
    return bv - av || a.at - b.at;
  });

  const keys = [];
  let dropped = 0;
  for (const { row } of ranked) {
    const legs = comboLegIns(row?.legs);
    if (!legs.length) { dropped += 1; continue; }
    const fresh = legs.filter((ins) => !chosen.includes(ins));
    if (chosen.length + fresh.length > limit) { dropped += 1; continue; }
    chosen.push(...fresh);
    keys.push(String(row?.key ?? ''));
  }
  return { ins: chosen, keys, covered: keys.length, dropped, cap: limit, reserved };
}

/**
 * پاسخِ `/api/live-trades` را به دفترِ قیمت و **زمان** تبدیل می‌کند.
 *
 * زمان همان‌قدر مهم است که قیمت. بی آن، «زنده» فقط یعنی «عددی برگشت»؛ با
 * آن، می‌شود پرسید عددِ کِی.
 */
export function liveQuoteBook(payload = {}) {
  const prices = {}, times = {}, counts = {};
  for (const [ins, item] of Object.entries(payload?.items || {})) {
    const price = num(item?.summary?.lastPrice, NaN);
    if (!(price > 0)) continue;
    prices[String(ins)] = price;
    const raw = num(item?.summary?.lastTime, NaN);
    times[String(ins)] = finite(raw) && raw > 0 ? tradeSecond(raw) : NaN;
    counts[String(ins)] = num(item?.summary?.count, 0);
  }
  return { at: num(payload?.at, NaN), prices, times, counts };
}

/**
 * آیا این ترکیب در این لحظه مظنهٔ زندهٔ **قابل استناد** دارد؟
 *
 * سه سؤال، به همین ترتیب:
 *
 *   ۱ همهٔ پاها قیمت دارند؟      نه → «زنده» نیست، نقطه.
 *   ۲ زمان‌ها را می‌دانیم؟        نه → قیمت هست ولی هم‌زمانی سنجیده نشد.
 *   ۳ پاها به هم نزدیک‌اند؟       نه → عددی که می‌سازند لحظهٔ واقعی نیست.
 *
 * `nowSec` ثانیهٔ روزِ تهران است و تزریق می‌شود؛ `Date.now()` داخل تابع
 * یعنی آزمونِ زمان‌دار. نداشتنش یعنی «سن را نسنج» — نه «سن صفر است».
 */
export function comboLiveQuote({
  legs = [], book = {}, nowSec = NaN, maxAgeSec = DEFAULT_AGE_SEC, maxSpreadSec = DEFAULT_SPREAD_SEC,
} = {}) {
  const ids = comboLegIns(legs);
  const out = {
    ok: false, why: '', legs: ids.length,
    priced: 0, spreadSec: NaN, ageSec: NaN, oldest: NaN, newest: NaN, timed: 0,
  };
  if (!ids.length) return { ...out, why: 'این ترکیب پای اختیاری ندارد' };
  const prices = book?.prices || {}, times = book?.times || {};
  const stamps = [];
  for (const ins of ids) {
    if (!finite(num(prices[ins], NaN)) || !(num(prices[ins], NaN) > 0)) {
      return { ...out, why: 'دست‌کم یک پا در سهمیهٔ زنده جا نشد یا امروز معامله نشده' };
    }
    out.priced += 1;
    const second = num(times[ins], NaN);
    if (finite(second)) stamps.push(second);
  }
  out.timed = stamps.length;
  if (stamps.length) {
    out.oldest = Math.min(...stamps);
    out.newest = Math.max(...stamps);
    out.spreadSec = out.newest - out.oldest;
    if (finite(num(nowSec, NaN))) out.ageSec = Math.max(0, num(nowSec, 0) - out.oldest);
  }
  // زمان نداشتن، ردِ صریح است نه قبولِ خاموش: سرور زمان می‌دهد و نبودش
  // یعنی چیزی در پاسخ درست نیست.
  if (stamps.length !== ids.length) {
    return { ...out, why: 'زمانِ معاملهٔ همهٔ پاها در پاسخ نبود؛ هم‌زمانی سنجیده نشد' };
  }
  const spreadCap = num(maxSpreadSec, NaN);
  if (finite(spreadCap) && spreadCap >= 0 && out.spreadSec > spreadCap) {
    return { ...out, why: 'پاها در یک لحظه معامله نشده‌اند؛ تفاضلشان قیمتِ هیچ لحظه‌ای نیست' };
  }
  const ageCap = num(maxAgeSec, NaN);
  if (finite(ageCap) && ageCap >= 0 && finite(out.ageSec) && out.ageSec > ageCap) {
    return { ...out, why: 'آخرین معاملهٔ دست‌کم یک پا برای «اکنون» کهنه است' };
  }
  return { ...out, ok: true };
}

/** ثانیهٔ روزِ تهران — برای سنجیدنِ سنِ معامله در برابر ساعتِ بازار. */
export function tehranSecondOfDay(at = Date.now()) {
  const time = Number(at);
  if (!Number.isFinite(time)) return NaN;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(time)).filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  const hour = Number(parts.hour), minute = Number(parts.minute), second = Number(parts.second);
  if (![hour, minute, second].every((one) => Number.isFinite(one))) return NaN;
  return (hour % 24) * 3600 + minute * 60 + second;
}
