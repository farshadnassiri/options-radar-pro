// قرارداد مأموریت «استودیوی سفر زمانی سبد».
//
// فرم آینده فقط یک نمایش از این قرارداد است. همهٔ ورودی‌های تصمیم‌ساز
// اینجا اعتبارسنجی می‌شوند تا رابط نتواند درصدی را clamp کند، قید گمشده‌ای
// را با پیش‌فرض پنهان پر کند یا سرمایه‌ای متفاوت از خود جلسه به موتور بدهد.

import { num } from './num.mjs';

export const PORTFOLIO_MISSION_VERSION = 1;

export const MISSION_OBJECTIVES = {
  preserve: 'حفظ سرمایه',
  income: 'درآمد دوره‌ای',
  growth: 'رشد سرمایه',
  speculative: 'بازده تهاجمی',
};

export const MISSION_RETURN_BASES = {
  initial: 'سرمایه شروع',
  allocatable: 'سرمایه قابل تخصیص',
};

export const MISSION_DIRECTIONS = {
  bullish: 'صعودی',
  neutral: 'خنثی',
  bearish: 'نزولی',
  volatile: 'پرنوسان',
};

export const MISSION_VOLATILITY_VIEWS = {
  lower: 'کاهش تلاطم',
  stable: 'تلاطم پایدار',
  higher: 'افزایش تلاطم',
};

export const MISSION_REPLAY_GRAINS = {
  daily: { label: 'روزانه', seconds: 0 },
  hourly: { label: 'یک‌ساعته', seconds: 60 * 60 },
  halfHour: { label: 'نیم‌ساعته', seconds: 30 * 60 },
  quarterHour: { label: 'پانزده‌دقیقه‌ای', seconds: 15 * 60 },
  fiveMinute: { label: 'پنج‌دقیقه‌ای', seconds: 5 * 60 },
};

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function own(row, key) {
  return !!row && Object.prototype.hasOwnProperty.call(row, key);
}

function finiteField(row, key) {
  return own(row, key) ? num(row[key], NaN) : NaN;
}

function optionalPositive(row, key) {
  if (!own(row, key) || row[key] === '' || row[key] === null || row[key] === undefined) return NaN;
  return num(row[key], NaN);
}

function inCatalog(catalog, key) {
  return Object.prototype.hasOwnProperty.call(catalog, String(key || ''));
}

function fail(why) {
  return { ok: false, why, mission: null };
}

function boolField(row, key) {
  return own(row, key) && typeof row[key] === 'boolean' ? row[key] : null;
}

function outlookFail(why) {
  return { ok: false, why, outlook: null };
}

/**
 * اعتبارسنجی مستقل مرحله «انتظار بازار».
 * فرم مرحله‌ای لازم نیست برای رسیدن به این قواعد، هدف یا ریسک ساختگی بسازد.
 */
export function validateMissionOutlook(input = {}) {
  const outlook = input || {};
  const direction = String(outlook.direction || '');
  const volatilityView = String(outlook.volatilityView || '');
  const confidencePct = finiteField(outlook, 'confidencePct');
  const targetPriceRial = optionalPositive(outlook, 'targetPriceRial');
  const rangeLowRial = optionalPositive(outlook, 'rangeLowRial');
  const rangeHighRial = optionalPositive(outlook, 'rangeHighRial');
  const expectedVolatilityPct = optionalPositive(outlook, 'expectedVolatilityPct');
  const thesis = String(outlook.thesis || '').trim();

  if (!inCatalog(MISSION_DIRECTIONS, direction)) return outlookFail('دید جهت بازار معتبر نیست');
  if (!inCatalog(MISSION_VOLATILITY_VIEWS, volatilityView)) return outlookFail('دید تلاطم معتبر نیست');
  if (!Number.isFinite(confidencePct) || confidencePct < 0 || confidencePct > 100) {
    return outlookFail('اطمینان باید بین صفر و صد باشد');
  }
  if (!thesis) return outlookFail('دلیل و انتظار کاربر از موقعیت باید ثبت شود');
  if (thesis.length > 2000) return outlookFail('متن انتظار از دو هزار نویسه بیشتر است');

  const hasTarget = Number.isFinite(targetPriceRial);
  const hasLow = Number.isFinite(rangeLowRial);
  const hasHigh = Number.isFinite(rangeHighRial);
  const hasVol = Number.isFinite(expectedVolatilityPct);
  if ((hasLow && !hasHigh) || (!hasLow && hasHigh)) return outlookFail('کران پایین و بالای قیمت باید با هم ثبت شوند');
  if (hasTarget && !(targetPriceRial > 0)) return outlookFail('قیمت هدف باید مثبت باشد');
  if (hasLow && (!(rangeLowRial > 0) || !(rangeHighRial >= rangeLowRial))) {
    return outlookFail('بازه قیمت باید مثبت و صعودی باشد');
  }
  if (hasTarget && hasLow && (targetPriceRial < rangeLowRial || targetPriceRial > rangeHighRial)) {
    return outlookFail('قیمت هدف باید داخل بازه مورد انتظار باشد');
  }
  if (hasVol && !(expectedVolatilityPct > 0)) return outlookFail('تلاطم مورد انتظار باید مثبت باشد');
  if ((direction === 'bullish' || direction === 'bearish') && !hasTarget) {
    return outlookFail('دید جهت‌دار به قیمت هدف نیاز دارد');
  }
  if (direction === 'neutral' && !hasLow) return outlookFail('دید خنثی به بازه قیمت نیاز دارد');
  if (direction === 'volatile' && !hasVol) return outlookFail('دید پرنوسان به تلاطم مورد انتظار نیاز دارد');

  return {
    ok: true,
    why: '',
    outlook: {
      direction, confidencePct, volatilityView, thesis,
      targetPriceRial: hasTarget ? targetPriceRial : null,
      rangeLowRial: hasLow ? rangeLowRial : null,
      rangeHighRial: hasHigh ? rangeHighRial : null,
      expectedVolatilityPct: hasVol ? expectedVolatilityPct : null,
    },
  };
}

function riskFail(why) {
  return { ok: false, why, risk: null };
}

/** اعتبارسنجی مستقل قیود ریسک و وجه تضمین. */
export function validateMissionRisk(input = {}) {
  const risk = input || {};
  const maxLossPct = finiteField(risk, 'maxLossPct');
  const maxDrawdownPct = finiteField(risk, 'maxDrawdownPct');
  const minFreeCapitalPct = finiteField(risk, 'minFreeCapitalPct');
  const maxMarginUsePct = finiteField(risk, 'maxMarginUsePct');
  const allowUnlimitedRisk = boolField(risk, 'allowUnlimitedRisk');
  if (!Number.isFinite(maxLossPct) || !(maxLossPct > 0) || maxLossPct > 100) {
    return riskFail('سقف زیان باید بزرگ‌تر از صفر و حداکثر صد درصد باشد');
  }
  if (!Number.isFinite(maxDrawdownPct) || !(maxDrawdownPct > 0) || maxDrawdownPct > 100) {
    return riskFail('سقف افت سرمایه باید بزرگ‌تر از صفر و حداکثر صد درصد باشد');
  }
  if (maxLossPct > maxDrawdownPct) return riskFail('سقف زیان معامله نمی‌تواند از سقف افت کل بیشتر باشد');
  if (!Number.isFinite(minFreeCapitalPct) || minFreeCapitalPct < 0 || minFreeCapitalPct > 100) {
    return riskFail('حداقل سرمایه آزاد باید بین صفر و صد درصد باشد');
  }
  if (!Number.isFinite(maxMarginUsePct) || maxMarginUsePct < 0 || maxMarginUsePct > 100) {
    return riskFail('سقف مصرف وجه تضمین باید بین صفر و صد درصد باشد');
  }
  if (minFreeCapitalPct + maxMarginUsePct > 100) {
    return riskFail('سرمایه آزاد و سقف وجه تضمین با هم از صد درصد بیشتر شده‌اند');
  }
  if (allowUnlimitedRisk === null) return riskFail('اجازه ریسک نامحدود باید صریح روشن یا خاموش شود');
  return {
    ok: true,
    why: '',
    risk: {
      maxLossPct, maxDrawdownPct, minFreeCapitalPct, maxMarginUsePct,
      allowUnlimitedRisk,
    },
  };
}

function liquidityFail(why) {
  return { ok: false, why, liquidity: null };
}

/** اعتبارسنجی مستقل دروازه نقدشوندگی و دفتر سفارش. */
export function validateMissionLiquidity(input = {}) {
  const liquidity = input || {};
  const minUnderlyingDailyValueRial = finiteField(liquidity, 'minUnderlyingDailyValueRial');
  const minOptionDailyValueRial = finiteField(liquidity, 'minOptionDailyValueRial');
  const minOpenInterest = finiteField(liquidity, 'minOpenInterest');
  const maxSpreadPct = finiteField(liquidity, 'maxSpreadPct');
  const maxBookTakePct = finiteField(liquidity, 'maxBookTakePct');
  const requireFullBook = boolField(liquidity, 'requireFullBook');
  if (!Number.isFinite(minUnderlyingDailyValueRial) || minUnderlyingDailyValueRial < 0) {
    return liquidityFail('حداقل ارزش روزانه نماد پایه باید عددی نامنفی باشد');
  }
  if (!Number.isFinite(minOptionDailyValueRial) || minOptionDailyValueRial < 0) {
    return liquidityFail('حداقل ارزش روزانه اختیار باید عددی نامنفی باشد');
  }
  if (!Number.isInteger(minOpenInterest) || minOpenInterest < 0) {
    return liquidityFail('حداقل موقعیت باز باید عدد صحیح نامنفی باشد');
  }
  if (!Number.isFinite(maxSpreadPct) || !(maxSpreadPct > 0) || maxSpreadPct > 100) {
    return liquidityFail('حداکثر اسپرد باید بزرگ‌تر از صفر و حداکثر صد درصد باشد');
  }
  if (!Number.isFinite(maxBookTakePct) || !(maxBookTakePct > 0) || maxBookTakePct > 100) {
    return liquidityFail('حداکثر مصرف عمق باید بزرگ‌تر از صفر و حداکثر صد درصد باشد');
  }
  if (requireFullBook === null) return liquidityFail('الزام پنج سطح دفتر باید صریح روشن یا خاموش شود');
  return {
    ok: true,
    why: '',
    liquidity: {
      minUnderlyingDailyValueRial, minOptionDailyValueRial, minOpenInterest,
      maxSpreadPct, maxBookTakePct, requireFullBook,
    },
  };
}

/** بودجه دیداری مرحله ریسک؛ همه اعداد از سرمایه جلسه و قیود معتبر می‌آیند. */
export function portfolioMissionRiskBudget(session, input = {}) {
  const checked = validateMissionRisk(input);
  const allocatableRial = num(session?.capital?.allocatableRial, NaN);
  if (!checked.ok || !(allocatableRial > 0)) {
    return { ok: false, why: checked.ok ? 'سرمایه قابل تخصیص معتبر نیست' : checked.why, budget: null };
  }
  const { minFreeCapitalPct, maxMarginUsePct } = checked.risk;
  return {
    ok: true,
    why: '',
    budget: {
      allocatableRial,
      minFreeCapitalPct,
      maxMarginUsePct,
      flexiblePct: 100 - minFreeCapitalPct - maxMarginUsePct,
      minFreeCapitalRial: Math.round(allocatableRial * minFreeCapitalPct / 100),
      maxMarginUseRial: Math.round(allocatableRial * maxMarginUsePct / 100),
    },
  };
}

/**
 * ساخت مأموریت از session و ورودی صریح کاربر.
 *
 * سرمایه، نماد و بازه فقط از session کپی می‌شوند؛ ورودی نمی‌تواند آن‌ها را
 * جعل کند. هیچ مقدار مالی پیش‌فرض ندارد: نبود هر قید اجباری خطاست.
 */
export function createPortfolioMission(session, input = {}) {
  if (!session?.id || !session?.portfolioId || !session?.baseIns || !session?.capital) {
    return fail('جلسه معتبر برای ساخت مأموریت لازم است');
  }

  const objective = input?.objective || {};
  const outlook = input?.outlook || {};
  const risk = input?.risk || {};
  const liquidity = input?.liquidity || {};
  const replay = input?.replay || {};

  const objectiveMode = String(objective.mode || '');
  const returnBase = String(objective.returnBase || '');
  const targetReturnPct = finiteField(objective, 'targetReturnPct');
  const maxHoldingDays = finiteField(objective, 'maxHoldingDays');
  if (!inCatalog(MISSION_OBJECTIVES, objectiveMode)) return fail('هدف مأموریت معتبر نیست');
  if (!inCatalog(MISSION_RETURN_BASES, returnBase)) return fail('مبنای بازده هدف معتبر نیست');
  if (!Number.isFinite(targetReturnPct) || targetReturnPct < 0) {
    return fail('بازده هدف باید عددی نامنفی و صریح باشد');
  }
  if (!Number.isInteger(maxHoldingDays) || !(maxHoldingDays > 0)) {
    return fail('حداکثر روز نگهداری باید عدد صحیح مثبت باشد');
  }

  const grain = String(replay.grain || '');
  if (!inCatalog(MISSION_REPLAY_GRAINS, grain)) return fail('تایم‌فریم بازپخش معتبر نیست');

  const checkedOutlook = validateMissionOutlook(outlook);
  if (!checkedOutlook.ok) return fail(checkedOutlook.why);

  const checkedRisk = validateMissionRisk(risk);
  if (!checkedRisk.ok) return fail(checkedRisk.why);
  const checkedLiquidity = validateMissionLiquidity(liquidity);
  if (!checkedLiquidity.ok) return fail(checkedLiquidity.why);

  const capitalBaseRial = returnBase === 'initial'
    ? num(session.capital.initialRial, NaN)
    : num(session.capital.allocatableRial, NaN);
  if (!(capitalBaseRial > 0)) return fail('مبنای سرمایه جلسه برای بازده هدف معتبر نیست');

  return {
    ok: true,
    why: '',
    mission: {
      version: PORTFOLIO_MISSION_VERSION,
      id: `mission-${session.id}`,
      context: {
        sessionId: session.id,
        portfolioId: session.portfolioId,
        baseIns: session.baseIns,
        start: copy(session.start), end: copy(session.end),
        capital: copy(session.capital),
      },
      objective: {
        mode: objectiveMode, returnBase, targetReturnPct,
        targetProfitRial: Math.round(capitalBaseRial * targetReturnPct / 100),
        maxHoldingDays,
      },
      replay: {
        grain, grainSeconds: MISSION_REPLAY_GRAINS[grain].seconds,
      },
      outlook: checkedOutlook.outlook,
      risk: checkedRisk.risk,
      liquidity: checkedLiquidity.liquidity,
    },
  };
}

/** خلاصه مصرفی فرم مرور؛ هیچ عدد تازه‌ای محاسبه نمی‌کند. */
export function portfolioMissionSummary(mission) {
  if (!mission?.context || !mission?.objective) return null;
  return {
    id: mission.id,
    baseIns: mission.context.baseIns,
    objective: mission.objective.mode,
    targetReturnPct: mission.objective.targetReturnPct,
    targetProfitRial: mission.objective.targetProfitRial,
    direction: mission.outlook?.direction || '',
    confidencePct: num(mission.outlook?.confidencePct, NaN),
    grain: mission.replay?.grain || '',
    maxLossPct: num(mission.risk?.maxLossPct, NaN),
    minFreeCapitalPct: num(mission.risk?.minFreeCapitalPct, NaN),
    maxSpreadPct: num(mission.liquidity?.maxSpreadPct, NaN),
  };
}
