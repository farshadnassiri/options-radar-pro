// تلاطم تاریخی پایه — با اعلام صریح کفایت داده و برگشت به ورودی کاربر.
//
// `core/bs.mjs` تابع `histVol` را دارد و همان‌جا هم می‌ماند: یک انحراف معیار
// سالانه‌شده از بازده لگاریتمی. آنچه آن تابع **نمی‌گوید** این است که چرا
// `NaN` داد. برای رابط، «نشد» کافی نیست؛ کاربر باید بداند داده کم بود یا
// اصلاً پایه‌ای انتخاب نشده، چون در حالت اول کاری از دستش برمی‌آید.
//
// قاعدهٔ ۲-۴ اینجا شکل خاص خودش را دارد. اگر داده کم باشد نه عدد می‌سازیم و
// نه سکوت می‌کنیم: می‌گوییم چند مشاهده داریم و چند تا لازم است، و جای یک
// عدد **اعلام‌شدهٔ کاربر** را باز می‌گذاریم. عددی که کاربر خودش وارد کرده
// ساختگی نیست — فرض اوست و با برچسب «دستی» تا انتهای خروجی همراهش می‌ماند
// تا با عددِ درآمده از قیمت اشتباه نشود.

import { histVol } from './bs.mjs';
import { num } from './num.mjs';

/** کمینهٔ مشاهدهٔ لازم. همان کفی که `histVol` روی آن ایستاده. */
export const HV_MIN_CLOSES = 22;

// رقم فارسی، همان‌جا. جمله‌های `why` مستقیم به کاربر نشان داده می‌شوند و
// رقم لاتین در خروجی نمایشی ایراد است (قاعده ۲-۳)؛ ولی هسته به رابط
// وابسته نمی‌شود. ورودی اینجا یک عدد صحیح کوچک است — شمار مشاهده — نه عدد
// پولی که به گروه‌بندی هزارگان نیاز داشته باشد. همان الگویی که
// `core/evaluate.mjs` برای نسبت پا دارد.
const faInt = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export const HV_SOURCES = {
  series: 'از سری قیمت پایه',
  manual: 'اعلام دستی کاربر',
  none: 'بدون داده',
};

/**
 * تلاطم تاریخی از یک سری قیمت پایانی، با گزارش وضعیت.
 *
 * `window` آخرین n قیمت را برمی‌دارد. صفر یا نامعتبر یعنی «همه».
 * خروجی همیشه هم‌شکل است تا مصرف‌کننده مجبور نباشد دو شاخه بنویسد:
 *
 *   pct      تلاطم سالانه بر حسب **درصد** — هم‌واحد با تلاطم ضمنی پاها،
 *            چون این دو در یک نمودار و یک جدول کنار هم می‌نشینند.
 *   samples  چند قیمت مثبت در پنجره بود
 *   needed   چند تا لازم است
 *   enough   آیا داده کافی بود
 *   source   کدام‌یک از HV_SOURCES
 *   why      اگر عدد نداریم، جملهٔ فارسیِ دلیل
 */
export function histVolPct(closes = [], { tradingDaysYear = 240, window = 0 } = {}) {
  const list = (Array.isArray(closes) ? closes : [])
    .map((value) => num(value, NaN))
    .filter((value) => value > 0);
  const span = num(window, 0);
  const used = span > 0 ? list.slice(-Math.trunc(span)) : list;
  const base = {
    samples: used.length, needed: HV_MIN_CLOSES, tradingDaysYear: num(tradingDaysYear, 240),
    window: span > 0 ? Math.trunc(span) : 0,
  };
  if (used.length < HV_MIN_CLOSES) {
    return {
      ...base, pct: NaN, enough: false, source: 'none',
      why: `برای تلاطم تاریخی دست‌کم ${faInt(HV_MIN_CLOSES)} قیمت پایانی لازم است و ${faInt(used.length)} تا در دسترس بود.`,
    };
  }
  const sigma = histVol(used, num(tradingDaysYear, 240));
  if (!Number.isFinite(sigma)) {
    return {
      ...base, pct: NaN, enough: false, source: 'none',
      why: 'قیمت‌های پایانی موجود بازده معتبری نساختند؛ تلاطم تاریخی محاسبه نشد.',
    };
  }
  return { ...base, pct: sigma * 100, enough: true, source: 'series', why: '' };
}

/**
 * تلاطم تاریخی مؤثر: اول سری، بعد اعلام کاربر.
 *
 * ترتیب عمدی است. مشاهده بر فرض مقدم است، پس تا وقتی سری کافی باشد عدد
 * دستی حتی اگر پر شده باشد نمی‌نشیند — و همین در `manualIgnored` علامت
 * می‌خورد تا رابط بتواند بگوید «عددی که وارد کردی به کار نرفت، چون داده
 * واقعی بود». پنهان‌کردن این، کاربر را به این باور می‌رساند که ورودی‌اش
 * اثر دارد.
 */
export function resolveHistVol(closes = [], { tradingDaysYear = 240, window = 0, manualPct = NaN } = {}) {
  const auto = histVolPct(closes, { tradingDaysYear, window });
  const manual = num(manualPct, NaN);
  const hasManual = Number.isFinite(manual) && manual > 0;
  if (auto.enough) return { ...auto, manualPct: hasManual ? manual : NaN, manualIgnored: hasManual };
  if (hasManual) {
    return {
      ...auto, pct: manual, source: 'manual', manualPct: manual, manualIgnored: false,
      why: `${auto.why} عدد اعلام‌شدهٔ کاربر به‌جایش نشست.`,
    };
  }
  return {
    ...auto, manualPct: NaN, manualIgnored: false,
    why: `${auto.why} در تنظیمات، «تلاطم تاریخی دستی» را پر کن تا این ستون خالی نماند.`,
  };
}

/**
 * سری غلتان تلاطم تاریخی، هم‌ترتیب با ردیف‌های ورودی.
 *
 * برای نمودار «تلاطم ضمنی در برابر تاریخی در طول عمر موقعیت» لازم است: خط
 * ضمنی هر روز جابه‌جا می‌شود و اگر تاریخی یک عدد ثابت باشد، مقایسه فقط در
 * یک نقطه معنی دارد.
 *
 * ردیف‌هایی که هنوز پنجره پر نشده `NaN` می‌گیرند — نه اینکه با پنجرهٔ کوتاه‌تر
 * پر شوند. پنجرهٔ کوتاه‌تر تلاطم دیگری است و نشستنش زیر همان برچسب، دو عدد
 * ناهم‌جنس را در یک خط می‌کشد.
 *
 * `manualPct` فقط جایی می‌نشیند که پنجره پر نشده باشد؛ خط، خطِ ثابتِ اعلام
 * کاربر می‌شود تا نمودار از ابتدای عمر موقعیت پیوسته باشد.
 */
export function histVolSeries(closes = [], { tradingDaysYear = 240, window = 60, manualPct = NaN } = {}) {
  const span = Math.max(HV_MIN_CLOSES, Math.trunc(num(window, 60)));
  const manual = num(manualPct, NaN);
  const fallback = Number.isFinite(manual) && manual > 0 ? manual : NaN;
  const out = [];
  for (let at = 0; at < closes.length; at += 1) {
    const slice = closes.slice(Math.max(0, at + 1 - span), at + 1);
    const step = histVolPct(slice, { tradingDaysYear });
    out.push(step.enough ? step.pct : fallback);
  }
  return out;
}

/**
 * فاصلهٔ تلاطم ضمنی از تاریخی، بر حسب واحد درصد.
 *
 * علامت مثبت یعنی بازار گران‌تر از گذشته قیمت می‌دهد. این تفریق است نه
 * نسبت، چون تلاطم خودش درصد است و «۴۰٪ در برابر ۳۰٪» را معامله‌گر با
 * «۱۰ واحد بالاتر» می‌خواند، نه «۳۳ درصد بیشتر».
 */
export function ivHvSpread(ivPct, hvPct) {
  const iv = num(ivPct, NaN);
  const hv = num(hvPct, NaN);
  return Number.isFinite(iv) && Number.isFinite(hv) ? iv - hv : NaN;
}
