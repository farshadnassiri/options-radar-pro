// سبد فرضی: سرمایهٔ اول دوره، تقسیم‌شده بین چند استراتژی.
//
// این تب یک سؤال دارد: «اگر اول دوره صد میلیون داشتم و ۳۰ درصدش را خفه‌کن
// فروش می‌کردم، ۵۰ درصد اسپرد عمودی و ۲۰ درصد کال برهنه، آخر دوره کجا
// بودم؟»
//
// سه چیز اینجا عمداً سخت‌گیرانه‌اند:
//
//   قرارداد شکسته نمی‌شود. اگر سهم یک استراتژی برای حتی یک دست کافی
//   نباشد، آن سهم «تخصیص نیافته» گزارش می‌شود، نه ۰٫۷ دست. مقیاس خطیِ
//   کسری روی کاغذ درست است و در تابلو ناممکن.
//
//   پول تخصیص‌نیافته گم نمی‌شود. باقی‌ماندهٔ هر سهم نقد می‌ماند و در
//   ارزش سبد شمرده می‌شود؛ وگرنه بازده روی سرمایه‌ای حساب می‌شود که
//   کاربر واقعاً درگیر نکرده.
//
//   روزی که حتی یک جزء قیمت ندارد، ارزش کل سبد آن روز **نامعلوم** است، نه
//   «همان دیروز». سود شناخته‌شده جدا گزارش می‌شود تا کاربر بداند چقدرش
//   معلوم است.

import { basisDenominator, normalizeBasis } from './portfolio-basis.mjs';

export const PORTFOLIO_ALLOCATION_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

export const ALLOCATION_REASONS = {
  noCapital: 'سرمایهٔ اول دوره ثبت نشده است',
  noPicks: 'هیچ استراتژی‌ای انتخاب نشده است',
  overAllocated: 'مجموع درصدها از صد بیشتر است',
  comboMissing: 'ترکیب انتخابی در نتیجهٔ این اجرا نیست',
  noDenominator: 'سرمایهٔ لازم برای این ترکیب معلوم نیست',
  tooExpensive: 'سهم این استراتژی برای حتی یک دست کافی نیست',
  noPath: 'برای این ترکیب مسیر معتبری ثبت نشده است',
};

/**
 * تخصیص سرمایه و بازپخش سبد.
 *
 * `picks` فهرست `{ strategyId, comboId, pct }` است. `analysis` خروجی
 * `analyzePortfolio` با همان مبنایی که کاربر انتخاب کرده.
 */
export function allocatePortfolio({ capitalRial = null, picks = [], analysis = null, basisId = null } = {}) {
  const capital = finite(capitalRial);
  const basis = normalizeBasis(basisId ?? analysis?.basisId);
  const dates = analysis?.dates || [];
  const list = Array.isArray(picks) ? picks : [];

  if (capital === null || !(capital > 0)) {
    return { ok: false, why: ALLOCATION_REASONS.noCapital, legs: [], dates, path: [], summary: null };
  }
  const wanted = list.filter((pick) => finite(pick?.pct) !== null && finite(pick.pct) > 0);
  if (!wanted.length) {
    return { ok: false, why: ALLOCATION_REASONS.noPicks, legs: [], dates, path: [], summary: null };
  }
  const totalPct = wanted.reduce((sum, pick) => sum + finite(pick.pct), 0);
  if (totalPct > 100 + 1e-9) {
    return { ok: false, why: ALLOCATION_REASONS.overAllocated, legs: [], dates, path: [], summary: null, totalPct };
  }

  const byCombo = new Map((analysis?.combos || []).map((combo) => [String(combo.id), combo]));
  const legs = wanted.map((pick) => {
    const pct = finite(pick.pct);
    const targetRial = (capital * pct) / 100;
    const combo = byCombo.get(String(pick.comboId ?? ''));
    if (!combo) {
      return { ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.comboMissing, lots: 0, deployedRial: 0, idleRial: targetRial };
    }
    const den = basisDenominator(combo.entry, basis);
    if (!den.ok) {
      return {
        ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.noDenominator,
        strategyName: combo.strategyName, comboId: combo.id,
        lots: 0, deployedRial: 0, idleRial: targetRial,
      };
    }
    const lots = Math.floor(targetRial / den.value);
    if (lots < 1) {
      return {
        ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.tooExpensive,
        strategyName: combo.strategyName, comboId: combo.id, unitCostRial: den.value,
        lots: 0, deployedRial: 0, idleRial: targetRial,
      };
    }
    if (!combo.series?.ok || combo.series.finalIndex === null) {
      return {
        ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.noPath,
        strategyName: combo.strategyName, comboId: combo.id, unitCostRial: den.value,
        lots: 0, deployedRial: 0, idleRial: targetRial,
      };
    }
    const deployedRial = lots * den.value;
    return {
      ...pick, pct, targetRial, ok: true, why: '',
      strategyId: combo.strategyId, strategyName: combo.strategyName,
      groupId: combo.groupId, groupName: combo.groupName,
      comboId: combo.id, unitCostRial: den.value,
      lots, deployedRial, idleRial: targetRial - deployedRial,
      pnl: combo.series.pnl.map((value) => (value === null ? null : value * lots)),
      finalPnlRial: combo.series.finalPnl === null ? null : combo.series.finalPnl * lots,
    };
  });

  const funded = legs.filter((leg) => leg.ok);
  const deployedRial = legs.reduce((sum, leg) => sum + leg.deployedRial, 0);
  const idleRial = capital - deployedRial;

  // ═══ مسیر روزانهٔ سبد ═══
  const path = dates.map((date, column) => {
    let known = 0;
    const unknown = [];
    for (const leg of funded) {
      const value = leg.pnl[column];
      if (value === null) unknown.push(leg.comboId);
      else known += value;
    }
    const complete = funded.length > 0 && unknown.length === 0;
    return {
      date, column,
      knownPnlRial: funded.length ? known : null,
      totalPnlRial: complete ? known : null,
      equityRial: complete ? capital + known : null,
      returnPct: complete ? (known / capital) * 100 : null,
      unknown,
    };
  });

  // ═══ خلاصه ═══
  let peak = capital;
  let maxDrawdownRial = 0;
  let maxDrawdownPct = 0;
  let firstProfitIndex = null;
  let bestIndex = null;
  let worstIndex = null;
  for (const point of path) {
    if (point.equityRial === null) continue;
    peak = Math.max(peak, point.equityRial);
    const drop = point.equityRial - peak;
    if (drop < maxDrawdownRial) {
      maxDrawdownRial = drop;
      maxDrawdownPct = (drop / peak) * 100;
    }
    if (firstProfitIndex === null && point.totalPnlRial > 0) firstProfitIndex = point.column;
    if (bestIndex === null || point.totalPnlRial > path[bestIndex].totalPnlRial) bestIndex = point.column;
    if (worstIndex === null || point.totalPnlRial < path[worstIndex].totalPnlRial) worstIndex = point.column;
  }
  let lastKnown = null;
  for (let index = path.length - 1; index >= 0; index--) {
    if (path[index].totalPnlRial !== null) { lastKnown = path[index]; break; }
  }

  const contributions = funded.map((leg) => ({
    comboId: leg.comboId, strategyId: leg.strategyId, strategyName: leg.strategyName,
    groupName: leg.groupName, lots: leg.lots,
    deployedRial: leg.deployedRial, finalPnlRial: leg.finalPnlRial,
    returnPct: leg.finalPnlRial === null || !(leg.deployedRial > 0)
      ? null : (leg.finalPnlRial / leg.deployedRial) * 100,
    sharePct: lastKnown && lastKnown.totalPnlRial !== null && Math.abs(lastKnown.totalPnlRial) > 1e-9
      && leg.finalPnlRial !== null
      ? (leg.finalPnlRial / lastKnown.totalPnlRial) * 100 : null,
  }));

  return {
    ok: funded.length > 0,
    why: funded.length ? '' : (legs[0]?.why || ALLOCATION_REASONS.noPicks),
    basisId: basis,
    capitalRial: capital, deployedRial, idleRial,
    deployedPct: (deployedRial / capital) * 100,
    totalPct,
    legs, funded: funded.length, unfunded: legs.length - funded.length,
    dates, path, contributions,
    summary: {
      finalPnlRial: lastKnown?.totalPnlRial ?? null,
      finalEquityRial: lastKnown?.equityRial ?? null,
      finalReturnPct: lastKnown?.returnPct ?? null,
      maxDrawdownRial, maxDrawdownPct,
      firstProfitIndex,
      bestIndex, worstIndex,
      knownDays: path.filter((point) => point.totalPnlRial !== null).length,
      totalDays: path.length,
    },
  };
}
