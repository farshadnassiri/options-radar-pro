// پنجرهٔ قیمت اعمال — کدام قیمت اعمال وارد ترکیب‌سازی می‌شود.
//
// ═══ چرا این فایل هست ═══
//
// پیش از این یک عدد بود: «± ۲۵٪ حول قیمت پایه». آن عدد سه چیز را با هم
// اشتباه می‌گرفت:
//
//   شناسایی با مهار   قرارداد دورتر از ۲۵٪ حذف نمی‌شد چون وجود نداشت،
//                     حذف می‌شد چون ترکیب‌ساز از انفجار می‌ترسید. ولی
//                     کاربر همان را «قرارداد پیدا نشد» می‌دید.
//   زمان              ۲۵٪ برای سررسید هفتِ روزه پهنِ بی‌معنی است و برای
//                     سررسید دویست روزه تنگ‌تر از یک انحراف معیار. یک عدد
//                     برای هر دو، در هر دو جهت غلط است.
//   نیاز واقعی        ترکیب با C(n,k) رشد می‌کند. برای استراتژی تک‌پا
//                     C(n,1)=n است — سیزده قیمت اعمال سیزده ترکیب می‌سازد
//                     و هیچ سقفی را نمی‌شکند. یعنی پنجره برای نیمی از
//                     کاتالوگ هیچ کاری جز حذفِ بی‌دلیل نمی‌کرد.
//
// ═══ قاعدهٔ تازه ═══
//
// حالت پیش‌فرض `auto` است و حالا یک جملهٔ کوتاه‌تر دارد: **هیچ قیمت اعمالی
// کنار گذاشته نمی‌شود.** نقطه. سقفِ ترکیب برداشته شد، پس دیگر چیزی نیست
// که «مجبور کند».
//
// چرا برداشته شد: سقف، مهارِ زمانِ اجرا بود و هزینه‌اش را جای اشتباهی
// می‌گرفت — از خودِ نتیجه. کاربر «۲۳ استرانگل» می‌دید و نمی‌دانست ۷۵ تا
// وجود داشت. مهارِ زمان حالا جای درستش نشسته: اجرا در ریسه، با شمارشِ
// زندهٔ پیشرفت و دکمهٔ توقف. کاربر می‌بیند چقدر مانده و خودش تصمیم
// می‌گیرد، به‌جای اینکه عددی که هرگز ندید بی‌صدا بریده شود.
//
// دو حالت دیگر برای کسی است که **عمداً** پنجره می‌خواهد: `pct` همان رفتار
// قدیمی (تا نتیجهٔ قدیمی قابل بازتولید بماند) و `steps` شمار پله به‌جای
// درصد. `all` مترادف `auto` مانده چون در تنظیمات ذخیره‌شدهٔ کاربران هست.
//
// ═══ مرزی که رد نمی‌شود ═══
//
// اینجا هیچ قیمت اعمالی ساخته نمی‌شود. ورودی همان چیزی است که در دفتر
// قراردادها ثبت شده؛ خروجی زیرمجموعه‌ای از آن است و بس. «پلهٔ جاافتاده»
// حدس زده نمی‌شود.

import { num } from './num.mjs';

export const WINDOW_MODES = [
  ['auto', 'خودکار — همهٔ قیمت‌های اعمال'],
  ['pct', 'درصد ثابت حول قیمت پایه'],
  ['steps', 'شمار پلهٔ ثابت هر طرف'],
  ['all', 'همه — بی‌پنجره'],
];

export const DEFAULT_WINDOW_MODE = 'auto';

const MODE_SET = new Set(WINDOW_MODES.map(([id]) => id));

/** حالت معتبر، وگرنه پیش‌فرض. مقدار ناشناخته خطا نمی‌دهد، به `auto` برمی‌گردد. */
export function windowMode(value) {
  const id = String(value ?? '').trim();
  return MODE_SET.has(id) ? id : DEFAULT_WINDOW_MODE;
}

/**
 * C(n,k) بدون سرریز.
 *
 * ضرب پیاپی صورت و تقسیم پیاپی مخرج، تا عدد میانی از محدودهٔ امن بیرون
 * نزند. بالای هزار میلیارد `Infinity` برمی‌گردد — دقتش آنجا اهمیتی ندارد،
 * چون هر سقفی که کاربر بگذارد بی‌نهایت‌برابر کوچک‌تر است.
 */
export function comboCount(n, k) {
  const rows = Math.trunc(num(n, 0));
  const pick = Math.trunc(num(k, 0));
  if (pick <= 0 || rows < pick) return 0;
  let out = 1;
  for (let i = 0; i < pick; i += 1) {
    out = (out * (rows - i)) / (i + 1);
    if (!Number.isFinite(out) || out > 1e12) return Infinity;
  }
  return Math.round(out);
}

/** فهرست مرتب و یکتا از عددهای مثبت. ورودی خراب بی‌صدا دور ریخته می‌شود. */
function cleanStrikes(strikes = []) {
  const seen = new Set();
  for (const raw of strikes) {
    const k = num(raw, 0);
    if (k > 0) seen.add(k);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * انتخاب قیمت‌های اعمالِ یک سررسید.
 *
 * @param strikes قیمت‌های اعمال موجود در همین سررسید
 * @param spot    قیمت پایه در همان لحظه
 * @returns { picked, dropped, all, mode, lo, hi, reason }
 *
 * `dropped` فقط وقتی پر است که کاربر **خودش** پنجره خواسته باشد (`pct` یا
 * `steps`). در `auto` همیشه خالی است — این تضمینِ «هیچ ترکیبی بی‌صدا بریده
 * نمی‌شود» است و آزمون دارد.
 */
export function selectStrikes({ strikes = [], spot = 0, mode = DEFAULT_WINDOW_MODE, pct = 25, steps = 6 } = {}) {
  const all = cleanStrikes(strikes);
  const id = windowMode(mode);
  const s = num(spot, 0);
  const base = { all, mode: id, lo: null, hi: null };

  if (!all.length) return { ...base, picked: [], dropped: [], reason: 'empty' };

  if (id === 'all') return { ...base, picked: all, dropped: [], reason: 'all' };

  if (id === 'pct') {
    const win = Math.max(0, num(pct, 25)) / 100;
    const lo = s * (1 - win), hi = s * (1 + win);
    const picked = s > 0 ? all.filter((x) => x >= lo && x <= hi) : all;
    return {
      ...base, picked, dropped: all.filter((x) => !picked.includes(x)),
      lo: s > 0 ? lo : null, hi: s > 0 ? hi : null, reason: 'pct',
    };
  }

  if (id === 'steps') {
    const n = Math.max(1, Math.trunc(num(steps, 6)));
    if (!(s > 0)) return { ...base, picked: all, dropped: [], reason: 'noSpot' };
    // «هر طرف» یعنی هر طرف. قیمت اعمالِ دقیقاً برابر پایه در هر دو شمرده
    // می‌شود و `Set` تکرارش را برمی‌دارد، پس پنجره حول پایه متقارن می‌ماند
    // حتی وقتی یک پله دقیقاً روی پایه نشسته باشد.
    const below = all.filter((x) => x <= s).slice(-n);
    const above = all.filter((x) => x >= s).slice(0, n);
    const keep = new Set([...below, ...above]);
    const picked = all.filter((x) => keep.has(x));
    return {
      ...base, picked, dropped: all.filter((x) => !keep.has(x)),
      lo: picked.length ? picked[0] : null, hi: picked.length ? picked[picked.length - 1] : null,
      reason: 'steps',
    };
  }

  // ─── auto ───
  //
  // یک خط، و همان یک خط تمامِ قاعده است: همه می‌مانند. پیش از این اینجا
  // حلقه‌ای بود که تا زیر سقف نشستنِ C(n,k) دورترین‌ها را برمی‌داشت؛ با
  // برداشتن سقف، آن حلقه چیزی جز حذفِ بی‌دلیل نبود.
  return { ...base, picked: all, dropped: [], reason: 'all' };
}

/** یک جملهٔ فارسی از نتیجهٔ پنجره — همان که رابط و اکسل نشان می‌دهند. */
export function windowNote(result) {
  if (!result) return '';
  const kept = result.picked?.length || 0;
  const gone = result.dropped?.length || 0;
  if (result.reason === 'empty') return 'قیمت اعمالی در این سررسید نبود';
  if (!gone) return `همهٔ ${kept} قیمت اعمال وارد ترکیب‌سازی شد`;
  return `${kept} قیمت اعمال وارد شد؛ ${gone} تا بیرون پنجرهٔ انتخابی بود`;
}
