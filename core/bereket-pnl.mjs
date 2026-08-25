// تجزیهٔ کامل سود و زیان: از عوامل بازار تا هزینه‌های اجرا.
//
// `core/attribution.mjs` نیمهٔ اول این کار را از قبل می‌کرد — حرکت قیمت هر
// پا را به دلتا و گاما و وگا و تتا می‌شکست و باقی‌مانده را نگه می‌داشت.
// آنچه نمی‌کرد، نیمهٔ دومش بود: **آنچه ما پرداختیم**. سه قلم که سند
// خواسته و هیچ‌کدام در تجزیهٔ بازاری جا نداشتند، چون هیچ‌کدام از حرکت
// بازار نمی‌آیند:
//
//   هزینهٔ عبور از اسپرد   فاصلهٔ قیمت اجراشده تا میانهٔ مظنه
//   کارمزد هر پا           جدا، چون سفارش ترکیبی در تابلو نیست
//   هزینه فرصت وجه تضمین   پولی که بلوکه شد و جای دیگری کار نکرد
//
// قلم سوم را سند با یک جملهٔ درست توضیح داده و همان دلیل اینجا هم می‌ماند:
// بدون آن، ساختارهای بستانکار همیشه بهتر از واقعیت به‌نظر می‌رسند. آن‌ها
// نقد می‌گیرند و در عوض سرمایه‌ای را قفل می‌کنند که در ستون هیچ‌جا
// نمی‌نشیند.
//
// ═══ چرا جمع، دقیقاً برابر است ═══
//
// اتحاد این فایل یکی است و عمداً هم‌ارز است، نه تقریبی:
//
//   خالص = دلتا + گاما + وگا + تتا + باقی‌مانده − کارمزد − عبور − لغزش − هزینه فرصت
//
// چهار عامل اول از مدل می‌آیند و می‌توانند غلط باشند؛ «باقی‌مانده» دقیقاً
// همان مقداری است که مدل توضیح نداده. پس این تساوی، ادعای درستیِ مدل
// نیست — تعریف باقی‌مانده است. ارزشش هم همین‌جاست: باقی‌ماندهٔ بزرگ یعنی
// **مدل غلط است**، نه اینکه بازار عجیب رفتار کرده. هشدار خودکار روی همین
// می‌نشیند.

import { num } from './num.mjs';
import { analyzeAttribution, DRIVERS } from './attribution.mjs';

/** آستانهٔ هشدار باقی‌مانده، بر حسب درصدِ حرکت ناخالص. */
export const RESIDUAL_WARN_PCT = 20;

/**
 * اقلام تجزیه، به همان ترتیبی که در جدول و نمودار می‌نشینند.
 *
 * چهار عامل بازار مثبت و منفی می‌شوند؛ چهار هزینه همیشه از سود کم
 * می‌کنند و علامتشان در خروجی **منفی** ذخیره می‌شود، نه اینکه مثبت باشند
 * و جدول خودش کمشان کند. اگر علامت را به جدول بسپاریم، هر جدول تازه‌ای
 * یک فرصت تازه برای جمع‌کردنِ اشتباه است.
 */
export const PNL_PARTS = [
  { key: 'delta', label: 'حرکت پایه', kind: 'market' },
  { key: 'gamma', label: 'انحنای حرکت', kind: 'market' },
  { key: 'vega', label: 'تغییر تلاطم', kind: 'market' },
  { key: 'theta', label: 'گذر زمان', kind: 'market' },
  { key: 'rest', label: 'باقی‌مانده توضیح‌داده‌نشده', kind: 'residual' },
  { key: 'commission', label: 'کارمزد و مالیات', kind: 'cost' },
  { key: 'crossing', label: 'عبور از اسپرد', kind: 'cost' },
  { key: 'slippage', label: 'لغزش عمق', kind: 'cost' },
  { key: 'funding', label: 'هزینه فرصت وجه تضمین', kind: 'cost' },
];

export const COST_KEYS = PNL_PARTS.filter((part) => part.kind === 'cost').map((part) => part.key);
export const MARKET_KEYS = PNL_PARTS.filter((part) => part.kind === 'market').map((part) => part.key);

/**
 * هزینه فرصت وجه تضمین قفل‌شده.
 *
 * نرخ، نرخ بدون ریسکِ **همان تاریخ** است نه نرخ امروز — بند «نسخهٔ آن
 * تاریخ» مشخصات. تابع نرخ را می‌گیرد و خودش هیچ پیش‌فرضی ندارد؛ اگر
 * نرخ ندهند، عدد ساخته نمی‌شود.
 */
export function fundingCost({ marginNet = 0, rFree = NaN, days = 0, yearDays = 365 } = {}) {
  const rate = num(rFree, NaN);
  const locked = num(marginNet, 0);
  const span = num(days, 0);
  if (!Number.isFinite(rate) || !(locked > 0) || !(span > 0)) return { rial: 0, known: Number.isFinite(rate) };
  return { rial: locked * rate * (span / Math.max(1, num(yearDays, 365))), known: true };
}

/**
 * تجزیهٔ کامل، آمادهٔ نمایش.
 *
 * `entryCost` و `exitCost` خروجی `executionCost` هستند — ورود و خروج جدا،
 * چون هر دو کارمزد و اسپرد خودشان را دارند و جمع‌کردنشان در یک عدد،
 * پرسش «کدام سنگین‌تر بود» را از بین می‌برد.
 */
export function decomposePnl({
  legs = [], track = [], entryCost = null, exitCost = null,
  marginNet = 0, rFree = NaN, days = 0, yearDays = 365,
  residualWarnPct = RESIDUAL_WARN_PCT,
} = {}) {
  const market = analyzeAttribution(legs, track);
  const totals = market.totals;

  const commission = -(num(entryCost?.commission, 0) + num(exitCost?.commission, 0));
  const crossing = -(num(entryCost?.crossing, 0) + num(exitCost?.crossing, 0));
  const slippage = -(num(entryCost?.slippage, 0) + num(exitCost?.slippage, 0));
  const funding = fundingCost({ marginNet, rFree, days, yearDays });

  const parts = {
    delta: num(totals.delta, 0), gamma: num(totals.gamma, 0),
    vega: num(totals.vega, 0), theta: num(totals.theta, 0),
    rest: num(totals.rest, 0),
    commission, crossing, slippage, funding: -funding.rial,
  };

  const gross = num(totals.actual, 0);
  const costs = COST_KEYS.reduce((sum, key) => sum + parts[key], 0);
  const net = gross + costs;

  // اتحاد باید برقرار باشد. اگر نبود، یعنی یکی از دو مسیر عوض شده و
  // کسی خبر ندارد — پس خودمان خبر می‌دهیم.
  const rebuilt = MARKET_KEYS.reduce((sum, key) => sum + parts[key], 0) + parts.rest + costs;
  const identityGap = Math.abs(rebuilt - net);

  const moved = Math.abs(gross);
  const residualPct = moved > 0 ? (Math.abs(parts.rest) / moved) * 100 : NaN;
  const warn = Number.isFinite(residualPct) && residualPct > num(residualWarnPct, RESIDUAL_WARN_PCT);

  return {
    market,
    parts,
    rows: PNL_PARTS.map((part) => ({ ...part, rial: parts[part.key] })),
    gross, costs, net,
    coverage: totals.coverage,
    incompleteSteps: totals.incompleteSteps,
    unexplainedPnl: totals.unexplainedPnl,
    residualPct, residualWarn: warn,
    residualNote: residualNote({ residualPct, warn, coverage: totals.coverage, threshold: num(residualWarnPct, RESIDUAL_WARN_PCT) }),
    fundingKnown: funding.known,
    identityGap,
    identityOk: identityGap < 1e-6,
  };
}

/**
 * جملهٔ باقی‌مانده — همیشه نوشته می‌شود، حتی وقتی کوچک است.
 *
 * سند می‌گوید این بند اجباری است و در رابط نمایش داده شود. پنهان‌کردنش
 * وقتی کوچک است، عادت بدی می‌سازد: کاربر یاد می‌گیرد نبودنش یعنی «همه‌چیز
 * خوب است»، و روزی که بزرگ شد و ظاهر شد، دیگر نمی‌داند با آن چه کند.
 */
export function residualNote({ residualPct, warn, coverage, threshold = RESIDUAL_WARN_PCT }) {
  const fa = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (!Number.isFinite(residualPct)) {
    return 'حرکتی ثبت نشد، پس باقی‌مانده‌ای هم معنی ندارد.';
  }
  const head = `باقی‌ماندهٔ توضیح‌داده‌نشده ${fa(residualPct)}٪ از حرکت ناخالص است`;
  const cov = Number.isFinite(coverage) && coverage < 100
    ? ` و ${fa(100 - coverage)}٪ حرکت اصلاً تجزیه نشده، چون پایی تلاطم ضمنی نداشت`
    : '';
  if (!warn) return `${head}${cov}. زیر آستانهٔ ${fa(threshold)}٪.`;
  return `${head}${cov}. از آستانهٔ ${fa(threshold)}٪ گذشته — این یعنی مدل قیمت‌گذاری این موقعیت را درست نمی‌بندد، نه اینکه بازار عجیب رفتار کرده. پیش از تکیه بر ستون‌های دلتا و وگا، همین را بررسی کن.`;
}

export { DRIVERS };
