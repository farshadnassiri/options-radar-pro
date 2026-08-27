// مدل نمایش منحنی بازده سبد — برش نهم فاز ۵.
//
// عدد «بیشترین زیان» می‌گوید **چقدر**، ولی نمی‌گوید **کجا** — و همان
// «کجا» چیزی است که تصمیم را عوض می‌کند.
//
// **نمودار تازه‌ای ساخته نمی‌شود.** `ui/chart.mjs` از قبل منحنی بازده
// می‌کشد، با زوم و خط راهنما و نشانه‌گذاری سربه‌سری‌ها. SVG دوم یعنی
// دو ظاهر متفاوت برای یک چیز، و دو جا که باید هم‌زمان درست بمانند.
// کارِ این ماژول فقط سه چیز است:
//
//   ۱. آیا اصلاً منحنی‌ای هست — و اگر نه، چرا.
//   ۲. آرگومان‌هایی که `mountPayoff` می‌خواهد.
//   ۳. متن‌های خلاصه، فارسی و تومان.
//
// دو مرز دیگر:
//
// **نامحدود، «نامحدود» نوشته می‌شود.** منحنی در لبهٔ نمودار بریده
// می‌شود و اگر عدد کنارش سقفی نشان دهد، بریدگی شبیه سقفِ زیان دیده
// می‌شود.
//
// **هیچ عدد مالی تازه‌ای اینجا ساخته نمی‌شود.** تنها حسابِ مجاز تقسیم
// بر ده است.

import { fmt, faDigits } from './fmt.mjs';
import {
  PORTFOLIO_PAYOFF_REASONS, portfolioPayoffCurve,
} from '../core/portfolio-payoff.mjs';

export const PAYOFF_VIEW_REASONS = PORTFOLIO_PAYOFF_REASONS;

const text = (value) => String(value ?? '').trim();

/** ریال به تومان، فقط برای نمایش. */
const toman = (rial) => (Number.isFinite(rial) ? fmt.int(rial / 10) : '—');

/** قیمت پایه هم تومان نوشته می‌شود، مثل هر عدد دیگری در رابط. */
const price = (rial) => (Number.isFinite(rial) ? `${fmt.int(rial / 10)} تومان` : '—');

function fail(reason, why = '') {
  return {
    ok: false,
    why: faDigits(why || PAYOFF_VIEW_REASONS[reason] || ''),
    reason,
    chart: null,
    breakevenText: '',
    maxProfitText: '',
    maxLossText: '',
    positionsText: '',
  };
}

/**
 * منحنی بازده سبد، آمادهٔ رسم.
 *
 * `chart` همان چیزی است که به `mountPayoff` داده می‌شود — پاها، نقد
 * خالص و نرخ کارمزد. رسم کار تب است.
 */
export function portfolioPayoffView(session) {
  const built = portfolioPayoffCurve(session);
  if (!built.ok) return fail(built.reason, built.why);
  const curve = built.curve;

  const fees = session?.startSnapshot?.capitalInputs?.fees ?? null;
  const spot = session?.startSnapshot?.spot ?? null;

  return {
    ok: true,
    why: '',
    reason: null,
    // آرگومان‌های نمودارِ موجود. اینجا نه SVG ساخته می‌شود نه نقطه.
    chart: {
      legs: built.legs,
      netCashRial: curve.netCashRial,
      options: { fees, spot, showToday: false, whatIf: false },
    },
    // «کجا»ی سربه‌سری، همان چیزی که عدد تنها نمی‌گفت.
    breakevenText: curve.breakevens.length
      ? curve.breakevens.map(price).join(' و ')
      : 'در این بازه سربه‌سری ندارد',
    // بریدگیِ منحنی در لبه نباید شبیه سقف دیده شود.
    maxProfitText: curve.unlimitedProfit ? 'نامحدود' : `${toman(curve.maxProfitRial)} تومان`,
    maxLossText: curve.unlimitedLoss ? 'نامحدود' : `${toman(curve.maxLossRial)} تومان`,
    atMaxProfitText: curve.unlimitedProfit ? '' : price(curve.atMaxProfit),
    atMaxLossText: curve.unlimitedLoss ? '' : price(curve.atMaxLoss),
    unlimitedLoss: curve.unlimitedLoss,
    unlimitedProfit: curve.unlimitedProfit,
    strikesText: curve.strikes.length
      ? curve.strikes.map(price).join(' · ') : '—',
    positionsText: `${faDigits(String(built.positions.length))} موقعیت باز`
      + ` · ${faDigits(String(built.legs.length))} پا`,
    netCashText: `${toman(curve.netCashRial)} تومان`,
  };
}

/** خلاصهٔ یک‌خطی، برای وقتی که جا برای جدول نیست. */
export function payoffSummaryText(view) {
  if (!view?.ok) return text(view?.why);
  return `بیشترین سود ${view.maxProfitText} · بیشترین زیان ${view.maxLossText}`
    + ` · سربه‌سری ${view.breakevenText}`;
}
