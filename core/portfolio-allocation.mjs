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
  tooExpensive: 'سهم این استراتژی برای حتی یک قرارداد کافی نیست',
  noPath: 'برای این ترکیب مسیر معتبری ثبت نشده است',
  sourceMissing: 'اجرای انتخابی برای این سهم موجود نیست',
};

/**
 * تقویم مشترک چند اجرا.
 *
 * وقتی سبد از دو نماد ساخته می‌شود، دو اجرا دو فهرست روز دارند که ممکن است
 * کاملاً یکی نباشند — یک نماد متوقف بوده، دیگری نه. اجتماعِ مرتبِ روزها
 * مبناست، و روزی که یک جزء در آن مشاهده ندارد، ارزش کل سبد را **نامعلوم**
 * می‌کند نه اینکه آن جزء را صفر بگیرد.
 *
 * اشتراک‌گرفتن به‌جای اجتماع، وسوسه‌انگیز است و غلط: روزهایی را که یک نماد
 * داشته و دیگری نه بی‌صدا حذف می‌کند و مسیر سبد کوتاه‌تر و صاف‌تر از واقع
 * درمی‌آید.
 */
export function unionCalendar(sources = []) {
  const seen = new Set();
  for (const source of sources) {
    for (const date of source?.analysis?.dates || []) {
      const value = finite(date);
      if (value !== null) seen.add(value);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * تخصیص سرمایه و بازپخش سبد.
 *
 * `picks` فهرست `{ strategyId, comboId, pct }` است. `analysis` خروجی
 * `analyzePortfolio` با همان مبنایی که کاربر انتخاب کرده.
 */
export function allocatePortfolio({
  capitalRial = null, picks = [], analysis = null, basisId = null, sources = null,
} = {}) {
  const capital = finite(capitalRial);
  // یک اجرا یا چند اجرا، یک مسیر کد. اجرای تکی همان حالتِ «یک منبع» است،
  // پس رفتار قبلی دقیقاً می‌ماند و شاخهٔ دومی برای نگه‌داشتن نیست.
  const pool = Array.isArray(sources) && sources.length
    ? sources
    : (analysis ? [{ id: '', label: '', analysis }] : []);
  const byId = new Map(pool.map((row) => [String(row.id ?? ''), row]));
  const primary = pool[0]?.analysis ?? null;
  const basis = normalizeBasis(basisId ?? primary?.basisId);
  const dates = pool.length > 1 ? unionCalendar(pool) : (primary?.dates || []);
  const columnOf = new Map(dates.map((date, index) => [date, index]));
  const list = Array.isArray(picks) ? picks : [];

  if (capital === null || !(capital > 0)) {
    return { ok: false, why: ALLOCATION_REASONS.noCapital, legs: [], dates, path: [], summary: null };
  }
  // سطر خاموش، سطری است که کاربر تیکش را برداشته. نه بودجه می‌گیرد و نه
  // در هیچ نمودار و جدولی می‌آید — ولی در فرم می‌ماند تا دوباره روشن شود.
  const wanted = list.filter((pick) => pick?.on !== false
    && finite(pick?.pct) !== null && finite(pick.pct) > 0);
  if (!wanted.length) {
    return { ok: false, why: ALLOCATION_REASONS.noPicks, legs: [], dates, path: [], summary: null };
  }
  const totalPct = wanted.reduce((sum, pick) => sum + finite(pick.pct), 0);
  if (totalPct > 100 + 1e-9) {
    return { ok: false, why: ALLOCATION_REASONS.overAllocated, legs: [], dates, path: [], summary: null, totalPct };
  }

  const legs = wanted.map((pick) => {
    const pct = finite(pick.pct);
    const targetRial = (capital * pct) / 100;
    const source = byId.get(String(pick.sourceId ?? '')) ?? (pool.length === 1 ? pool[0] : null);
    if (!source) {
      return { ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.sourceMissing, lots: 0, deployedRial: 0, idleRial: targetRial };
    }
    const combo = (source.analysis?.combos || []).find((row) => String(row.id) === String(pick.comboId ?? ''));
    if (!combo) {
      return { ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.comboMissing, sourceLabel: source.label, lots: 0, deployedRial: 0, idleRial: targetRial };
    }
    const den = basisDenominator(combo.entry, basis);
    if (!den.ok) {
      return {
        ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.noDenominator,
        strategyName: combo.strategyName, comboId: combo.id, sourceLabel: source.label,
        lots: 0, deployedRial: 0, idleRial: targetRial,
      };
    }
    // ═══ اندازه‌گیری به «قرارداد»، نه به بستهٔ N‌تایی ═══
    //
    // `den.value` بهای همان تعداد واحدی است که اجرا با آن انجام شده — با
    // «تعداد واحد ۳۰۰» در تب راه‌اندازی، بهای یک بستهٔ ۳۰۰تایی. اگر سبد
    // فقط بستهٔ کامل بخرد، دانه‌بندی‌اش را عددی از تب دیگر تعیین می‌کند و
    // پول زیادی بی‌کار می‌ماند: در یک اجرای واقعی، ۴ میلیارد بودجه تنها
    // سه بسته خرید و ۸۷۱ میلیون ماند، و یک جزء اصلاً تأمین نشد.
    //
    // وجه تضمین در این موتور دقیقاً خطیِ تعداد است (آزمون ۲۰۰-ج)، پس
    // بهای هر قرارداد از تقسیم بر همان تعداد به‌دست می‌آید و سبد به
    // ریزترین دانه‌بندیِ ممکن می‌رسد.
    const units = finite(combo.entry?.units);
    const perUnit = units !== null && units > 0 ? den.value / units : den.value;
    const contracts = Math.floor(targetRial / perUnit);
    if (contracts < 1) {
      return {
        ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.tooExpensive,
        strategyName: combo.strategyName, comboId: combo.id,
        unitCostRial: perUnit, packCostRial: den.value, packUnits: units,
        sourceLabel: source.label, contracts: 0, lots: 0, deployedRial: 0, idleRial: targetRial,
      };
    }
    if (!combo.series?.ok || combo.series.finalIndex === null) {
      return {
        ...pick, pct, targetRial, ok: false, why: ALLOCATION_REASONS.noPath,
        strategyName: combo.strategyName, comboId: combo.id,
        unitCostRial: perUnit, packCostRial: den.value, packUnits: units,
        sourceLabel: source.label, contracts: 0, lots: 0, deployedRial: 0, idleRial: targetRial,
      };
    }
    const deployedRial = contracts * perUnit;
    // سری بر همان تعداد واحدِ اجرا بسته شده؛ ضریب، نسبت قرارداد خریداری‌شده
    // به همان تعداد است — و کسری بودنش درست است: موقعیتی با ۱٬۱۵۰ قرارداد
    // از سریِ ۳۰۰تایی، ۳٫۸۳ برابر آن است.
    const scale = units !== null && units > 0 ? contracts / units : contracts;
    // مسیر هر جزء روی **تقویم مشترک** نشانده می‌شود، نه روی تقویم خودش.
    // روزی که این نماد در آن مشاهده ندارد، خانه‌اش null می‌ماند — و همان
    // ارزش کل سبد را آن روز نامعلوم می‌کند.
    const own = source.analysis?.dates || [];
    const pnl = dates.map(() => null);
    for (let index = 0; index < own.length; index++) {
      const column = columnOf.get(own[index]);
      if (column === undefined) continue;
      const value = combo.series.pnl[index];
      pnl[column] = value === null ? null : value * scale;
    }
    return {
      ...pick, pct, targetRial, ok: true, why: '',
      sourceId: String(pick.sourceId ?? source.id ?? ''), sourceLabel: source.label,
      strategyId: combo.strategyId, strategyName: combo.strategyName,
      groupId: combo.groupId, groupName: combo.groupName,
      comboId: combo.id,
      unitCostRial: perUnit, packCostRial: den.value, packUnits: units,
      contracts, lots: contracts, deployedRial, idleRial: targetRial - deployedRial,
      pnl,
      finalPnlRial: combo.series.finalPnl === null ? null : combo.series.finalPnl * scale,
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
    sources: pool.map((row) => ({ id: String(row.id ?? ''), label: row.label ?? '' })),
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
