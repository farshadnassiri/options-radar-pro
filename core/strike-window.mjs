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
// حالت پیش‌فرض `auto` است و یک جمله دارد: **هیچ قیمت اعمالی کنار گذاشته
// نمی‌شود مگر سقفِ ترکیب مجبور کند.** اگر مجبور شد، دورترین‌ها از قیمت
// پایه کنار می‌روند، نه دلخواه — و شمارِ کنارگذاشته برمی‌گردد تا رابط
// بتواند بگوید «چهار قیمت اعمال به‌خاطر سقف نیامد»، نه اینکه خاموش بماند.
//
// سه حالت دیگر برای کسی است که عمداً پنجره می‌خواهد: `pct` همان رفتار
// قدیمی (تا نتیجهٔ قدیمی قابل بازتولید بماند)، `steps` شمار پله به‌جای
// درصد، و `all` بی‌پنجره.
//
// ═══ مرزی که رد نمی‌شود ═══
//
// اینجا هیچ قیمت اعمالی ساخته نمی‌شود. ورودی همان چیزی است که در دفتر
// قراردادها ثبت شده؛ خروجی زیرمجموعه‌ای از آن است و بس. «پلهٔ جاافتاده»
// حدس زده نمی‌شود.

import { num } from './num.mjs';

export const WINDOW_MODES = [
  ['auto', 'خودکار — همه، مگر سقف ترکیب مجبور کند'],
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
 * ترتیبِ کنار گذاشتن: دورترین از قیمت پایه اول.
 *
 * دو قیمت اعمال می‌توانند دقیقاً هم‌فاصله از پایه باشند — ۴۶ و ۵۴ وقتی پایه
 * ۵۰ است. آن‌وقت باید یکی برود و «دورتر» جوابی ندارد. قاعده اعلام می‌شود
 * نه واگذار: **بالاتری می‌رود.** بی این خط، تصمیم به پایداریِ `sort` واگذار
 * می‌شد؛ درست کار می‌کرد ولی هیچ‌جا نوشته نبود که کدام‌یک می‌رود و چرا،
 * و هر بازچینشِ بعدیِ این تابع می‌توانست بی‌صدا عوضش کند.
 */
function farthestFirst(strikes, spot) {
  return [...strikes].sort((a, b) => {
    const da = Math.abs(a - spot), db = Math.abs(b - spot);
    return db - da || b - a;
  });
}

/**
 * انتخاب قیمت‌های اعمالِ یک سررسید.
 *
 * @param strikes قیمت‌های اعمال موجود در همین سررسید
 * @param spot    قیمت پایه در همان لحظه
 * @param legs    شمار اسلات قیمت اعمالِ استراتژی (`def.strikes`)
 * @param cap     سقف ترکیب همین سررسید
 * @returns { picked, dropped, all, mode, forced, lo, hi, reason }
 *          `forced` یعنی سقف مجبور کرد، نه سلیقهٔ کاربر.
 */
export function selectStrikes({ strikes = [], spot = 0, legs = 1, cap = 400, mode = DEFAULT_WINDOW_MODE, pct = 25, steps = 6 } = {}) {
  const all = cleanStrikes(strikes);
  const id = windowMode(mode);
  const s = num(spot, 0);
  const k = Math.max(1, Math.trunc(num(legs, 1)));
  const limit = Math.max(1, Math.trunc(num(cap, 400)));
  const base = { all, mode: id, forced: false, lo: null, hi: null };

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
  // بی‌قیمتِ پایه هیچ «دور»ی تعریف نمی‌شود، پس چیزی هم کنار گذاشته نمی‌شود.
  // این حالت واقعی است: روزی که نماد پایه معامله نشده، ترکیب‌ساز جلوتر خودش
  // برمی‌گردد؛ اینجا نباید با حدسِ مرکز، قرارداد حذف کند.
  if (comboCount(all.length, k) <= limit || !(s > 0) || all.length <= k) {
    return { ...base, picked: all, dropped: [], reason: comboCount(all.length, k) <= limit ? 'fits' : 'noSpot' };
  }

  const order = farthestFirst(all, s);
  const dropped = [];
  const keep = new Set(all);
  for (const x of order) {
    if (keep.size <= k) break;
    if (comboCount(keep.size, k) <= limit) break;
    keep.delete(x);
    dropped.push(x);
  }
  const picked = all.filter((x) => keep.has(x));
  return {
    ...base, picked, dropped: dropped.sort((a, b) => a - b), forced: dropped.length > 0,
    lo: picked.length ? picked[0] : null, hi: picked.length ? picked[picked.length - 1] : null,
    reason: 'capped',
  };
}

/**
 * سهم هر مجموعه‌سررسید از سقف ردیف.
 *
 * `maxRows` پیش از این پشت‌سرهم پر می‌شد: حلقه از نزدیک‌ترین سررسید شروع
 * می‌کرد و تا سقف پیش می‌رفت، پس سررسید دور در نمادی با زنجیرهٔ پهن اصلاً
 * نوبتش نمی‌رسید. کاربر آن را «برنامه سررسید آبان را ندارد» می‌خواند، در
 * حالی که دفتر داشت و سقف خورده بود.
 *
 * دست‌کم یک ردیف به هر سررسید می‌رسد؛ سررسیدی که سهمش صفر شود، همان حذفِ
 * خاموشی است که این تابع برای رفعش هست.
 */
export function fairShare(maxRows, expirySets, perExpiry) {
  const rows = Math.max(1, Math.trunc(num(maxRows, 4000)));
  const sets = Math.max(1, Math.trunc(num(expirySets, 1)));
  const own = Math.max(1, Math.trunc(num(perExpiry, 400)));
  return Math.max(1, Math.min(own, Math.floor(rows / sets)));
}

/** یک جملهٔ فارسی از نتیجهٔ پنجره — همان که رابط و اکسل نشان می‌دهند. */
export function windowNote(result) {
  if (!result) return '';
  const kept = result.picked?.length || 0;
  const gone = result.dropped?.length || 0;
  if (result.reason === 'empty') return 'قیمت اعمالی در این سررسید نبود';
  if (!gone) return `همهٔ ${kept} قیمت اعمال وارد ترکیب‌سازی شد`;
  if (result.forced) return `${kept} قیمت اعمال وارد شد؛ ${gone} تا به‌خاطر سقف ترکیب کنار ماند، از دورترین به پایه`;
  return `${kept} قیمت اعمال وارد شد؛ ${gone} تا بیرون پنجرهٔ انتخابی بود`;
}
