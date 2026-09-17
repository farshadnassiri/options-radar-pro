// اثرِ نرخ بدون ریسک بر تلاطم ضمنی — همان قلمِ بازِ «نرخ سراسری ۳۰٪».
//
// ═══ چرا این ماژول وجود دارد ═══
//
// اندازه‌گیریِ ثبت‌شده در دفتر کار:
//
//     نرخ ۳۰٪ → کف نظری ۶٬۲۲۸ → قیمت ۴٬۶۳۱ زیر کف  →  belowFloor
//     نرخ  ۰٪ → کف نظری ۴٬۵۷۲ → قیمت ۴٬۶۳۱ بالای کف →  IV ۱۳٫۸٪
//
// یعنی علتِ غالبِ ستون‌های خالیِ تلاطم، یک **تنظیم** است نه نبودِ داده. ولی
// کاربر این را نمی‌دید: ستون «—» بود و «—» هزار علت دارد. برای دیدنش باید
// نرخ سراسری را عوض می‌کرد، صفحه را از نو می‌ساخت، و بعد یادش می‌رفت
// برگرداند.
//
// این ماژول همان یک پا را با چند نرخ می‌سنجد و کنار هم می‌گذارد. هیچ نرخی
// «درست» اعلام نمی‌شود — انتخابِ نرخ تصمیمِ صاحب پروژه است و همچنان باز
// است. کاری که اینجا می‌شود، **دیدنی کردنِ** همان تصمیم است.
//
// ═══ چرا کفِ بی‌آربیتراژ اینجا معنای کامل ندارد ═══
//
// کفِ نظری وقتی الزام‌آور است که بشود پایه را فروش استقراضی کرد. در این
// بازار نمی‌شود، پس قیمتِ زیرِ کف لزوماً «خطای داده» نیست. همین جمله کنارِ
// جدول می‌آید تا کسی `belowFloor` را «تابلو غلط داده» نخواند.

import { bsPrice, impliedVolWhy, intrinsic } from './bs.mjs';
import { num } from './num.mjs';

export const IV_RATE_SCAN_VERSION = 1;

/** نرخ‌های پیش‌فرضِ مقایسه — از صفر تا کمی بالاتر از نرخ سراسریِ امروز. */
export const DEFAULT_RATE_SCAN = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35];

export const RATE_WHY_LABEL = {
  ok: 'حل شد',
  input: 'ورودی ناقص است',
  belowFloor: 'قیمت زیر کف نظری همان نرخ',
  aboveBand: 'قیمت بالای سقف دامنهٔ تلاطم',
  unstable: 'تابع در کران‌ها عددی نداد',
};

/**
 * تلاطم ضمنیِ یک پا، در چند نرخ.
 *
 * هر ردیف کفِ نظریِ همان نرخ را هم می‌دهد — چون بی آن، `belowFloor` فقط یک
 * برچسب است و کاربر نمی‌داند قیمت چقدر کم آورده. و `gap` می‌گوید قیمت چقدر
 * تا کف فاصله دارد: منفی یعنی زیرِ کف.
 */
export function ivByRate({ kind, price, spot, strike, days, yearDays = 365, divYield = 0, ivLo = 0.01, ivHi = 5 } = {}, rates = DEFAULT_RATE_SCAN) {
  const P = num(price, NaN), S = num(spot, NaN), K = num(strike, NaN);
  const d = num(days, NaN), Y = num(yearDays, NaN);
  const list = (Array.isArray(rates) ? rates : []).map(Number).filter(Number.isFinite);
  if (!(P > 0) || !(S > 0) || !(K > 0) || !(d > 0) || !(Y > 0) || (kind !== 'call' && kind !== 'put')) {
    return { version: IV_RATE_SCAN_VERSION, rows: [], reason: RATE_WHY_LABEL.input, solved: 0 };
  }
  const T = d / Y;
  const q = num(divYield, 0);
  const rows = list.map((rate) => {
    // کفِ نظری = ارزشِ همان قرارداد در کمینهٔ دامنهٔ تلاطم. زیرِ آن، هیچ
    // تلاطمی قیمت را بازتولید نمی‌کند.
    const floor = bsPrice(kind, S, K, T, rate, q, num(ivLo, 0.01));
    const solved = impliedVolWhy(kind, P, S, K, T, rate, q, { lo: num(ivLo, 0.01), hi: num(ivHi, 5) });
    return {
      rate,
      ivPct: Number.isFinite(solved.iv) ? solved.iv * 100 : NaN,
      why: solved.why,
      whyLabel: RATE_WHY_LABEL[solved.why] || solved.why,
      floor,
      gap: Number.isFinite(floor) ? P - floor : NaN,
      belowFloor: solved.why === 'belowFloor',
    };
  });
  return {
    version: IV_RATE_SCAN_VERSION,
    rows,
    price: P, spot: S, strike: K, days: d,
    intrinsic: intrinsic(kind, S, K),
    solved: rows.filter((row) => row.why === 'ok').length,
    reason: '',
  };
}

/**
 * بالاترین نرخی که با آن تلاطم هنوز حل می‌شود.
 *
 * ═══ چرا این عدد، و نه «نرخ درست» ═══
 *
 * انتخابِ نرخ تصمیمِ صاحب پروژه است و این تابع آن را نمی‌گیرد. آنچه
 * می‌دهد یک **کرانِ اندازه‌گیری‌شده** است: «با نرخِ بالاتر از این، قیمتِ
 * بازارِ این قرارداد زیرِ کفِ نظری می‌افتد». همین عدد است که بحث را از
 * سلیقه به داده می‌برد.
 *
 * `NaN` یعنی هیچ‌کدام از نرخ‌های آزموده‌شده جواب ندادند — نه اینکه نرخِ
 * سقف صفر باشد.
 */
export function highestSolvingRate(scan) {
  const solved = (scan?.rows || []).filter((row) => row.why === 'ok');
  return solved.length ? Math.max(...solved.map((row) => row.rate)) : NaN;
}

/**
 * جمله‌ای که زیر جدول می‌نشیند.
 *
 * سه حالت دارد و هیچ‌کدام «همه‌چیز خوب است» نیست: یا نرخِ فعلی جواب
 * می‌دهد، یا نمی‌دهد ولی نرخِ پایین‌تری می‌دهد — که دقیقاً همان قلمِ باز
 * است — یا هیچ نرخی نمی‌دهد، که آن‌وقت مشکل از نرخ نیست.
 */
export function rateScanNote(scan, currentRate) {
  const rows = scan?.rows || [];
  if (!rows.length) return scan?.reason || 'برای این پا تلاطمی سنجیده نشد.';
  const now = num(currentRate, NaN);
  const atNow = rows.find((row) => Math.abs(row.rate - now) < 1e-9);
  const top = highestSolvingRate(scan);
  if (atNow?.why === 'ok') return 'با نرخ فعلی تلاطم حل می‌شود؛ ستون خالی این قرارداد علت دیگری دارد.';
  if (Number.isFinite(top)) {
    return 'با نرخ فعلی قیمت بازار زیر کف نظری می‌افتد و تلاطم حل نمی‌شود، ولی با نرخ پایین‌تر می‌شود. '
      + 'کف بی‌آربیتراژ وقتی الزام‌آور است که بشود پایه را فروش استقراضی کرد؛ در این بازار نمی‌شود، '
      + 'پس قیمتِ زیرِ کف لزوماً خطای داده نیست.';
  }
  return 'با هیچ‌کدام از نرخ‌های آزموده‌شده تلاطم حل نشد؛ علتش نرخ نیست.';
}
