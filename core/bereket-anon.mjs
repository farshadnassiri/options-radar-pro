// حالت ناشناس.
//
// دلیلی که کاربر خودش نوشته: از سال ۱۳۹۸ در این بازار معامله می‌کند و
// گذشته را می‌شناسد. بدون این حالت، تمرین به خودفریبی تبدیل می‌شود —
// چون دیدن نام نماد و تاریخ، یعنی دانستن نتیجه.
//
// ═══ چرا پنهان‌کردن نام کافی نیست ═══
//
// اگر فقط نام و تاریخ را برداریم و بقیه را دست‌نخورده بگذاریم، حالت
// ناشناس تزئینی است. معامله‌گر فعالِ این بازار از سه چیز دیگر هم نماد را
// می‌شناسد:
//
//   سطح قیمت پایه   «پنج هزار و دویست ریال» یعنی همان نماد همیشگی
//   قیمت‌های اعمال  شبکهٔ اعمال هر نماد امضای خودش را دارد
//   اندازهٔ قرارداد  پس از افزایش سرمایه، اندازهٔ غیراستاندارد امضاست
//
// پس ناشناس‌سازی واقعی سه کار می‌کند: محور قیمت از صد شاخص می‌شود، قیمت
// اعمال به **درصد فاصله از پایه** تبدیل می‌شود، و اندازهٔ قرارداد فقط
// «استاندارد» یا «تعدیل‌شده» گفته می‌شود نه عددش.
//
// آنچه پنهان **نمی‌شود** مهم‌تر است: هر چیزی که برای تصمیم لازم است باقی
// می‌ماند — نوسان تحقق‌یافته، نقدشوندگی، ارزش معاملات، موقعیت باز، روز
// مانده تا سررسید، سطح تلاطم ضمنی و صدکش. هدف سخت‌کردن تصمیم نیست؛ هدف
// برداشتن **حافظه** از میز است.

import { num } from './num.mjs';
import { normalizeHistoryDate } from './history.mjs';
import { makeRng } from './rng.mjs';

/** حروف نام مستعار. کوتاه و بی‌ربط به هر نماد واقعی. */
const ALIAS_LETTERS = ['الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش'];

// رقم فارسی، همان‌جا. هسته به رابط وابسته نمی‌شود، ولی این رشته‌ها مستقیم
// به کاربر نشان داده می‌شوند و رقم لاتین در خروجی نمایشی ایراد است
// (قاعدهٔ ۲-۳). اعشار هم «٫» است نه نقطه، همان قراردادی که `ui/fmt.mjs`
// دارد — عدد نیمه‌فارسی از عدد لاتین بدتر است، چون درست به‌نظر می‌رسد.
const faDigits = (text) => String(text).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/\./g, '٫');
const faInt = (n) => faDigits(Math.max(0, Math.trunc(num(n))));

/**
 * نام مستعار پایدار برای یک کد ابزار.
 *
 * از بذر جلسه ساخته می‌شود، پس در طول یک جلسه ثابت است و بین دو جلسه
 * متفاوت. ثبات لازم است — اگر نام هر بار عوض می‌شد، کاربر نمی‌توانست
 * دو پا را به هم ربط بدهد. تفاوت بین جلسه‌ها هم لازم است، وگرنه «الف»
 * بعد از چند جلسه خودش به یک نام واقعی تبدیل می‌شد.
 */
export function makeAlias(seed, ins) {
  const rng = makeRng(`${seed}|${ins}`);
  const letter = ALIAS_LETTERS[Math.floor(rng() * ALIAS_LETTERS.length)] || 'الف';
  const number = 1 + Math.floor(rng() * 89);
  return `نماد ${letter}-${faInt(number)}`;
}

/** نام مستعار همهٔ ابزارهای یک جلسه، یک‌بار ساخته و کش‌شده. */
export function aliasMap(seed, insList = []) {
  const out = {};
  for (const ins of insList || []) {
    const key = String(ins ?? '');
    if (!key || out[key]) continue;
    out[key] = makeAlias(seed, key);
  }
  return out;
}

/**
 * سری قیمت، شاخص‌شده از صد.
 *
 * شکل نمودار دقیقاً همان می‌ماند و فقط عددهای محور عوض می‌شوند. `base`
 * برمی‌گردد تا در گزارش پایان جلسه بشود محور واقعی را بازساخت.
 */
export function indexSeries(rows = [], { at = 100 } = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => num(row?.close, 0) > 0);
  if (!list.length) return { rows: [], base: NaN };
  const base = num(list[0].close);
  return {
    base,
    rows: list.map((row) => ({ ...row, close: (num(row.close) / base) * at, closeRaw: num(row.close) })),
  };
}

/**
 * فاصلهٔ قیمت اعمال از پایه، بر حسب درصد.
 *
 * جایگزین خودِ قیمت اعمال در حالت ناشناس. اطلاعات تصمیم را کامل نگه
 * می‌دارد — «هشت درصد بالای پایه» همان چیزی است که معامله‌گر واقعاً با آن
 * فکر می‌کند — ولی شبکهٔ اعمالِ نماد را لو نمی‌دهد.
 */
export function moneynessPct(strike, spot) {
  const K = num(strike, NaN), S = num(spot, NaN);
  if (!(K > 0) || !(S > 0)) return NaN;
  return ((K - S) / S) * 100;
}

export function moneynessLabel(strike, spot, kind = '') {
  const pct = moneynessPct(strike, spot);
  if (!Number.isFinite(pct)) return '—';
  const side = pct > 0.05 ? 'بالای پایه' : pct < -0.05 ? 'زیر پایه' : 'روی پایه';
  const magnitude = faDigits(Math.abs(pct).toFixed(1));
  const state = kind === 'call'
    ? (pct > 0 ? 'بی‌ارزش' : 'باارزش')
    : kind === 'put' ? (pct < 0 ? 'بی‌ارزش' : 'باارزش') : '';
  return `${magnitude}٪ ${side}${state ? ` · ${state}` : ''}`;
}

/** اندازهٔ قرارداد: فقط استاندارد یا تعدیل‌شده. عدد غیراستاندارد امضای نماد است. */
export function sizeLabel(size, standard = 1000) {
  const value = num(size, NaN);
  if (!Number.isFinite(value) || value <= 0) return 'نامعلوم';
  return Math.abs(value - num(standard, 1000)) < 1e-9 ? 'استاندارد' : 'تعدیل‌شده';
}

/**
 * برچسب تاریخ در حالت ناشناس: «روز n جلسه»، نه تاریخ واقعی.
 *
 * شمارش از روز شروع جلسه است، پس ترتیب و فاصله حفظ می‌شود و کاربر
 * می‌فهمد یک هفته گذشته — بی‌آنکه بداند کدام هفته.
 */
export function dayLabel(date, startDate, tradingDays = null) {
  const day = normalizeHistoryDate(date), start = normalizeHistoryDate(startDate);
  if (!day || !start) return '—';
  if (Array.isArray(tradingDays) && tradingDays.length) {
    const from = tradingDays.indexOf(start), to = tradingDays.indexOf(day);
    if (from >= 0 && to >= 0) return `روز ${faInt(to - from + 1)} جلسه`;
  }
  return day === start ? 'روز ۱ جلسه' : `روز ${faInt(Math.abs(day - start) + 1)} جلسه`;
}

/**
 * نگهبان نشت — چیزی که سند در بند رابط کاربری خواسته.
 *
 * متنی که قرار است در حالت ناشناس نمایش داده شود از اینجا رد می‌شود و
 * اگر نام نماد یا تاریخ واقعی تویش باشد، گزارش می‌شود. تابع خالص است تا
 * هم رابط و هم آزمون از یک تعریف استفاده کنند.
 *
 * تاریخ فشرده و اجزایش هر دو بررسی می‌شوند، چون «۲۰۲۶۰۵۲۱» و «۱۴۰۵/۰۳/۰۱»
 * هر دو همان روز را لو می‌دهند.
 */
export function leakCheck(text, { names = [], dates = [] } = {}) {
  const body = String(text ?? '');
  const found = [];
  for (const name of names) {
    const needle = String(name ?? '').trim();
    if (needle.length >= 2 && body.includes(needle)) found.push({ kind: 'name', value: needle });
  }
  for (const date of dates) {
    const compact = normalizeHistoryDate(date);
    if (!compact) continue;
    const text8 = String(compact);
    const parts = [text8, `${text8.slice(0, 4)}/${text8.slice(4, 6)}/${text8.slice(6, 8)}`,
      `${text8.slice(0, 4)}-${text8.slice(4, 6)}-${text8.slice(6, 8)}`];
    for (const part of parts) if (body.includes(part)) found.push({ kind: 'date', value: part });
  }
  return { clean: found.length === 0, found };
}

/**
 * دیدِ یک قرارداد در حالت ناشناس.
 *
 * تصمیم‌سازها می‌مانند و شناسه‌ها می‌روند. `hidden` فهرست چیزهایی است که
 * برداشته شدند — رابط همین را به کاربر نشان می‌دهد تا بداند چه چیزی
 * پنهان است و اینکه پنهان‌شدنش عمدی بوده، نه اینکه داده نداشتیم.
 */
export function anonContract(contract = {}, { spot, aliases = {}, standardSize = 1000, on = true } = {}) {
  if (!on) return { ...contract, anonymous: false, hidden: [] };
  const ins = String(contract.ins ?? '');
  return {
    ins,
    alias: aliases[ins] || makeAlias('bereket', ins),
    kind: contract.kind,
    moneyness: moneynessLabel(contract.strike, spot, contract.kind),
    moneynessPct: moneynessPct(contract.strike, spot),
    sizeLabel: sizeLabel(contract.size, standardSize),
    daysToExpiry: num(contract.daysToExpiry, NaN),
    // اینها می‌مانند: همه تصمیم‌سازند و هیچ‌کدام نماد را لو نمی‌دهند.
    ivPct: num(contract.ivPct, NaN),
    ivPercentile: num(contract.ivPercentile, NaN),
    openInterest: num(contract.openInterest, NaN),
    volume: num(contract.volume, NaN),
    value: num(contract.value, NaN),
    spreadPct: num(contract.spreadPct, NaN),
    anonymous: true,
    hidden: ['نام نماد', 'قیمت اعمال', 'اندازهٔ عددی قرارداد', 'تاریخ سررسید'],
  };
}

/**
 * افشای پایان جلسه.
 *
 * فقط اینجا نام و تاریخ برمی‌گردند. جدا بودنش عمدی است: هر جای دیگری از
 * کد که بخواهد نام واقعی را نشان بدهد، باید این را صدا بزند و در دیف
 * پیدا باشد.
 */
export function reveal({ session, aliases = {}, names = {} } = {}) {
  if (!session) return { ok: false, why: 'جلسه‌ای در کار نیست' };
  if (session.state === 'open') {
    return { ok: false, why: 'تا جلسه باز است، نام و تاریخ فاش نمی‌شوند.' };
  }
  return {
    ok: true,
    startDate: session.start?.date ?? 0,
    endDate: session.now?.date ?? 0,
    symbols: Object.entries(aliases).map(([ins, alias]) => ({ ins, alias, name: names[ins] || '' })),
  };
}
