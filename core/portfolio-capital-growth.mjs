// روند رشد سرمایه در lineage معتبر — برش ششم فاز ۷.
//
// ورودی این مدل فقط قرارداد canonical تداوم سرمایه است. اینجا هیچ پرونده‌ای
// با زمان یا شناسه حدس زده نمی‌شود؛ هر ردیف همان منشأ ثبت‌شده در lineage را
// نگه می‌دارد و تغییر سفر و تغییر تجمعی را یک بار برای همه مصرف‌کننده‌ها
// محاسبه می‌کند.

import {
  validatePortfolioCapitalContinuity,
} from './portfolio-capital-continuity.mjs';

export const PORTFOLIO_CAPITAL_GROWTH_VERSION = 1;

export const PORTFOLIO_CAPITAL_GROWTH_REASONS = Object.freeze({
  invalidContinuity: 'زنجیره سرمایه معتبر و کامل نیست',
  zeroInitialCapital: 'سرمایه شروع صفر است؛ درصد تغییر ساخته نمی‌شود',
});

function rejected(why = '') {
  return {
    version: PORTFOLIO_CAPITAL_GROWTH_VERSION,
    ok: false,
    why: why || PORTFOLIO_CAPITAL_GROWTH_REASONS.invalidContinuity,
    reason: 'invalidContinuity',
    state: null,
    initialCapitalRial: null,
    finalCapitalRial: null,
    changeRial: null,
    changePct: null,
    percentageWhy: '',
    rows: [],
  };
}

function stateOf(changeRial) {
  return changeRial > 0 ? 'growth' : changeRial < 0 ? 'decline' : 'flat';
}

function percentage(changeRial, baseRial) {
  return baseRial > 0 ? (changeRial / baseRial) * 100 : null;
}

/** continuity معتبر → نقاط روند قدیم به جدید، بدون دست‌زدن به lineage. */
export function portfolioCapitalGrowth(continuity) {
  const checked = validatePortfolioCapitalContinuity(continuity);
  if (!checked.ok) return rejected(checked.why);

  const canonical = checked.continuity;
  const firstInitial = canonical.lineage[0].initialCapitalRial;
  const rows = canonical.lineage.map((source, index) => {
    const changeRial = source.finalCapitalRial - source.initialCapitalRial;
    const cumulativeChangeRial = source.finalCapitalRial - firstInitial;
    return {
      index: index + 1,
      sessionId: source.sessionId,
      portfolioId: source.portfolioId,
      baseIns: source.baseIns,
      closedAt: { ...source.closedAt },
      initialCapitalRial: source.initialCapitalRial,
      realizedRial: source.realizedRial,
      finalCapitalRial: source.finalCapitalRial,
      changeRial,
      changePct: percentage(changeRial, source.initialCapitalRial),
      percentageWhy: source.initialCapitalRial === 0
        ? PORTFOLIO_CAPITAL_GROWTH_REASONS.zeroInitialCapital : '',
      state: stateOf(changeRial),
      cumulativeChangeRial,
      cumulativeChangePct: percentage(cumulativeChangeRial, firstInitial),
      cumulativePercentageWhy: firstInitial === 0
        ? PORTFOLIO_CAPITAL_GROWTH_REASONS.zeroInitialCapital : '',
    };
  });
  const finalCapitalRial = rows.at(-1).finalCapitalRial;
  const changeRial = finalCapitalRial - firstInitial;
  return {
    version: PORTFOLIO_CAPITAL_GROWTH_VERSION,
    ok: true,
    why: '',
    reason: null,
    state: stateOf(changeRial),
    initialCapitalRial: firstInitial,
    finalCapitalRial,
    changeRial,
    changePct: percentage(changeRial, firstInitial),
    percentageWhy: firstInitial === 0
      ? PORTFOLIO_CAPITAL_GROWTH_REASONS.zeroInitialCapital : '',
    rows,
  };
}
