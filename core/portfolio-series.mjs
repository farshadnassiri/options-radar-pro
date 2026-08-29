// مسیر یک ترکیب در طول بازه — روی مبنای انتخابی، در بازهٔ انتخابی.
//
// ورودی خام است (سود ریالی هر روز) و خروجی هر چیزی است که یک معامله‌گر از
// یک مسیر می‌خواهد: بازده تجمعی، تغییر همان روز، بیشترین افت، اینکه کی
// برای نخستین بار سبز شد، و اینکه اصلاً چند روزش داده داشت.
//
// دو تصمیم که بعداً کسی نپرسد چرا:
//
//   ۱. «بازده تجمعی» همیشه از **روز ورود** حساب می‌شود، حتی وقتی کاربر
//      پنجرهٔ زمانی را باریک کرده. موقعیت که با باریک‌شدن نمودار دوباره باز
//      نشده؛ سود و زیانش از همان روز اول انباشته است. تغییرِ درونِ پنجره
//      جداگانه با `windowPct` گزارش می‌شود.
//
//   ۲. کفِ «بیشترین افت» وقتی پنجره از خودِ روز ورود شروع شود، صفر است — یعنی
//      موقعیتی که از همان روز اول زیر آب رفت، افتش شمرده می‌شود. اگر پنجره از
//      وسط شروع شود، سقف اولیه همان نخستین مشاهدهٔ پنجره است، چون بالاتر از
//      آن در این پنجره دیده نشده.

import { basisMeta, basisDenominator, normalizeBasis } from './portfolio-basis.mjs';

export const PORTFOLIO_SERIES_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

/**
 * مسیر یک ترکیب.
 *
 * `pnlRow` آرایهٔ سود ریالی هم‌طول با `dates` است؛ `null` یعنی آن روز مشاهده
 * نشده. `columns` اندیس ستون‌های داخل پنجرهٔ انتخابی است.
 */
export function comboSeries(row, pnlRow, columns, basisId) {
  const basis = normalizeBasis(basisId);
  const meta = basisMeta(basis);
  const den = basisDenominator(row?.entry, basis);
  const list = Array.isArray(columns) ? columns : [];
  const values = Array.isArray(pnlRow) ? pnlRow : [];

  const pnl = list.map((column) => finite(values[column]));
  const observed = pnl.filter((value) => value !== null).length;

  if (!den.ok) {
    return {
      ok: false, basisId: basis, basisLabel: meta?.label || '', denominator: den.value,
      why: den.why, pnl, pct: pnl.map(() => null), stepPct: pnl.map(() => null), ddPct: pnl.map(() => null),
      observed, missing: pnl.length - observed,
      finalIndex: null, finalPct: null, finalPnl: null, windowPct: null,
      bestPct: null, bestIndex: null, worstPct: null, worstIndex: null,
      maxDrawdownPct: null, firstProfitIndex: null, beyondBasis: false,
    };
  }

  const pct = pnl.map((value) => (value === null ? null : (value / den.value) * 100));

  // تغییر نسبت به **آخرین مشاهده**، نه نسبت به خانهٔ قبلی تقویم. اگر بین دو
  // مشاهده روزِ بی‌داده باشد، تغییر روی همان فاصله گزارش می‌شود و خانهٔ
  // بی‌داده خالی می‌ماند — نه اینکه تغییر صفر جعل شود.
  const stepPct = pct.map(() => null);
  let previous = null;
  for (let index = 0; index < pct.length; index++) {
    const value = pct[index];
    if (value === null) continue;
    stepPct[index] = previous === null ? value : value - previous;
    previous = value;
  }

  let finalIndex = null;
  for (let index = pct.length - 1; index >= 0; index--) {
    if (pct[index] !== null) { finalIndex = index; break; }
  }
  let firstIndex = null;
  for (let index = 0; index < pct.length; index++) {
    if (pct[index] !== null) { firstIndex = index; break; }
  }

  let bestIndex = null;
  let worstIndex = null;
  let firstProfitIndex = null;
  for (let index = 0; index < pct.length; index++) {
    const value = pct[index];
    if (value === null) continue;
    if (bestIndex === null || value > pct[bestIndex]) bestIndex = index;
    if (worstIndex === null || value < pct[worstIndex]) worstIndex = index;
    if (firstProfitIndex === null && value > 0) firstProfitIndex = index;
  }

  // سقف اولیه: صفر اگر پنجره از روز ورود شروع شده باشد، وگرنه نخستین
  // مشاهدهٔ همین پنجره.
  const startsAtEntry = list.length > 0 && list[0] === 0;
  let peak = startsAtEntry ? 0 : (firstIndex === null ? null : pct[firstIndex]);
  let maxDrawdownPct = peak === null ? null : 0;
  const ddPct = pct.map(() => null);
  for (let index = 0; index < pct.length; index++) {
    const value = pct[index];
    if (value === null) continue;
    if (peak === null) { peak = value; maxDrawdownPct = 0; ddPct[index] = 0; continue; }
    peak = Math.max(peak, value);
    ddPct[index] = value - peak;
    maxDrawdownPct = Math.min(maxDrawdownPct, ddPct[index]);
  }

  return {
    ok: true,
    basisId: basis, basisLabel: meta?.label || '', denominator: den.value, why: '',
    pnl, pct, stepPct, ddPct,
    observed, missing: pnl.length - observed,
    finalIndex, finalPct: finalIndex === null ? null : pct[finalIndex],
    finalPnl: finalIndex === null ? null : pnl[finalIndex],
    // تغییر خالص داخل پنجره: آخرین مشاهده منهای نخستین مشاهدهٔ همین پنجره.
    windowPct: finalIndex === null || firstIndex === null ? null : pct[finalIndex] - pct[firstIndex],
    bestPct: bestIndex === null ? null : pct[bestIndex], bestIndex,
    worstPct: worstIndex === null ? null : pct[worstIndex], worstIndex,
    maxDrawdownPct,
    firstProfitIndex,
    beyondBasis: pct.some((value) => value !== null && value < -100),
  };
}

/**
 * وزن یک ترکیب برای وزن‌دهی بر ارزش معامله.
 *
 * اگر ارزش معاملهٔ حتی یک پا ثبت نشده باشد، وزن `null` می‌شود نه ناقص: جمعِ
 * ناقص، ترکیب کم‌داده را سبک‌تر از واقع نشان می‌دهد و بی‌صدا از رتبه‌بندی
 * پایینش می‌آورد.
 */
export function comboWeight(row) {
  if (row?.entry?.legValueComplete !== true) return null;
  const value = finite(row?.entry?.legValue);
  return value !== null && value > 0 ? value : null;
}
