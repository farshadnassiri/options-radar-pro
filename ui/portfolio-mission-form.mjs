// آداپتر خالص مرحله نخست فرم مأموریت.
// رابط تومان و رشتهٔ فارسی می‌گیرد؛ هسته فقط ریال و لحظه معتبر می‌بیند.

import { createPortfolioSession, portfolioCapitalPlan } from '../core/portfolio-session.mjs';
import {
  MISSION_REPLAY_GRAINS, portfolioMissionRiskBudget,
  validateMissionLiquidity, validateMissionOutlook, validateMissionRisk,
} from '../core/portfolio-mission.mjs';

const DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

const latinDigits = (value) => String(value ?? '').replace(/[۰-۹٠-٩]/g, (digit) => DIGITS[digit]);

/** متن تومان با رقم فارسی/عربی و جداکننده → عدد صحیح تومان. */
export function parseTomanInput(value) {
  const normalized = latinDigits(value).replace(/[٬,،\s_]/g, '');
  if (!/^\d+$/.test(normalized)) return NaN;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? amount : NaN;
}

/** درصد با رقم فارسی/عربی و ممیز فارسی یا لاتین. */
export function parsePercentInput(value) {
  const normalized = latinDigits(value).trim().replace(/٫/g, '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return NaN;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}

export function parseIntegerInput(value) {
  return parseTomanInput(value);
}

export function tomanToRial(value) {
  const toman = typeof value === 'number' ? value : parseTomanInput(value);
  const rial = toman * 10;
  return Number.isSafeInteger(toman) && toman >= 0 && Number.isSafeInteger(rial) ? rial : NaN;
}

function capitalArgs({ capitalToman, reserveToman }) {
  return {
    initialCapitalRial: tomanToRial(capitalToman),
    reserveRial: tomanToRial(reserveToman),
  };
}

/** خلاصه زنده سرمایه؛ اعتبارسنجی و تفریق فقط از مدل session می‌آید. */
export function previewPortfolioCapital({ capitalToman, reserveToman } = {}) {
  const made = createPortfolioSession({
    id: 'preview', baseIns: 'preview',
    start: { date: 20260101, second: 9 * 3600 },
    end: { date: 20260102, second: 9 * 3600 },
    ...capitalArgs({ capitalToman, reserveToman }),
  });
  return made.ok
    ? { ok: true, why: '', plan: portfolioCapitalPlan(made.session) }
    : { ok: false, why: made.why, plan: null };
}

/**
 * مرحله اول wizard را به draft واقعی session تبدیل می‌کند.
 * هنوز مأموریت، تخصیص یا snapshot قفل نمی‌شود.
 */
export function createPortfolioStepOneDraft({
  id = '', baseIns = '', capitalToman, reserveToman,
  startDate = 0, startSecond = NaN, endDate = 0, endSecond = NaN,
  grain = '', createdAt = 0,
} = {}) {
  if (!Object.prototype.hasOwnProperty.call(MISSION_REPLAY_GRAINS, String(grain || ''))) {
    return { ok: false, why: 'تایم‌فریم بازپخش معتبر نیست', draft: null };
  }
  const made = createPortfolioSession({
    id, baseIns,
    start: { date: Number(startDate), second: Number(startSecond) },
    end: { date: Number(endDate), second: Number(endSecond) },
    ...capitalArgs({ capitalToman, reserveToman }),
    createdAt,
  });
  if (!made.ok) return { ok: false, why: made.why, draft: null };
  return {
    ok: true,
    why: '',
    draft: {
      step: 'setup',
      session: made.session,
      replay: {
        grain,
        grainSeconds: MISSION_REPLAY_GRAINS[grain].seconds,
      },
    },
  };
}

function formFail(why) {
  return { ok: false, why, draft: null };
}

function optionalToman(value, label) {
  if (String(value ?? '').trim() === '') return { ok: true, value: null };
  const rial = tomanToRial(value);
  return Number.isFinite(rial)
    ? { ok: true, value: rial }
    : { ok: false, why: `${label} باید عدد صحیح و معتبر تومان باشد` };
}

/** مرحله دوم را بدون ساخت هدف، ریسک یا نقدشوندگی پنهان به draft وصل می‌کند. */
export function createPortfolioOutlookDraft(stepOneDraft, {
  direction = '', targetPriceToman = '', rangeLowToman = '', rangeHighToman = '',
  volatilityView = '', expectedVolatilityPct = '', confidencePct = '', thesis = '',
} = {}) {
  if (!stepOneDraft?.session || stepOneDraft.step !== 'setup') {
    return formFail('پیش‌نویس معتبر مرحله نخست لازم است');
  }
  const target = optionalToman(targetPriceToman, 'قیمت هدف');
  if (!target.ok) return formFail(target.why);
  const low = optionalToman(rangeLowToman, 'کران پایین قیمت');
  if (!low.ok) return formFail(low.why);
  const high = optionalToman(rangeHighToman, 'کران بالای قیمت');
  if (!high.ok) return formFail(high.why);
  const confidence = parsePercentInput(confidencePct);
  if (!Number.isFinite(confidence)) return formFail('اطمینان باید عددی بین صفر و صد باشد');
  let expectedVolatility = null;
  if (String(expectedVolatilityPct ?? '').trim() !== '') {
    expectedVolatility = parsePercentInput(expectedVolatilityPct);
    if (!Number.isFinite(expectedVolatility)) return formFail('تلاطم مورد انتظار باید درصدی معتبر باشد');
  }

  const input = { direction, volatilityView, confidencePct: confidence, thesis };
  if (target.value !== null) input.targetPriceRial = target.value;
  if (low.value !== null) input.rangeLowRial = low.value;
  if (high.value !== null) input.rangeHighRial = high.value;
  if (expectedVolatility !== null) input.expectedVolatilityPct = expectedVolatility;
  const checked = validateMissionOutlook(input);
  if (!checked.ok) return formFail(checked.why);
  return {
    ok: true,
    why: '',
    draft: {
      ...stepOneDraft,
      step: 'outlook',
      outlook: checked.outlook,
    },
  };
}

function requiredPercent(value, label) {
  const parsed = parsePercentInput(value);
  return Number.isFinite(parsed)
    ? { ok: true, value: parsed }
    : { ok: false, why: `${label} باید درصدی معتبر باشد` };
}

function requiredToman(value, label) {
  const parsed = tomanToRial(value);
  return Number.isFinite(parsed)
    ? { ok: true, value: parsed }
    : { ok: false, why: `${label} باید عدد صحیح و معتبر تومان باشد` };
}

function explicitChoice(value, label) {
  if (value === true || value === 'yes') return { ok: true, value: true };
  if (value === false || value === 'no') return { ok: true, value: false };
  return { ok: false, why: `${label} باید صریح انتخاب شود` };
}

function riskInputFromForm(form = {}) {
  const fields = [
    ['maxLossPct', 'سقف زیان معامله'],
    ['maxDrawdownPct', 'سقف افت کل'],
    ['minFreeCapitalPct', 'حداقل سرمایه آزاد'],
    ['maxMarginUsePct', 'سقف مصرف وجه تضمین'],
  ];
  const risk = {};
  for (const [key, label] of fields) {
    const parsed = requiredPercent(form[key], label);
    if (!parsed.ok) return formFail(parsed.why);
    risk[key] = parsed.value;
  }
  const unlimited = explicitChoice(form.allowUnlimitedRisk, 'اجازه ریسک نامحدود');
  if (!unlimited.ok) return formFail(unlimited.why);
  risk.allowUnlimitedRisk = unlimited.value;
  return { ok: true, why: '', risk };
}

function liquidityInputFromForm(form = {}) {
  const underlying = requiredToman(form.minUnderlyingDailyValueToman, 'حداقل ارزش روزانه نماد پایه');
  if (!underlying.ok) return formFail(underlying.why);
  const option = requiredToman(form.minOptionDailyValueToman, 'حداقل ارزش روزانه اختیار');
  if (!option.ok) return formFail(option.why);
  const minOpenInterest = parseIntegerInput(form.minOpenInterest);
  if (!Number.isFinite(minOpenInterest)) return formFail('حداقل موقعیت باز باید عدد صحیح نامنفی باشد');
  const spread = requiredPercent(form.maxSpreadPct, 'حداکثر اسپرد');
  if (!spread.ok) return formFail(spread.why);
  const bookTake = requiredPercent(form.maxBookTakePct, 'حداکثر مصرف عمق');
  if (!bookTake.ok) return formFail(bookTake.why);
  const fullBook = explicitChoice(form.requireFullBook, 'الزام پنج سطح دفتر');
  if (!fullBook.ok) return formFail(fullBook.why);
  return {
    ok: true,
    why: '',
    liquidity: {
      minUnderlyingDailyValueRial: underlying.value,
      minOptionDailyValueRial: option.value,
      minOpenInterest,
      maxSpreadPct: spread.value,
      maxBookTakePct: bookTake.value,
      requireFullBook: fullBook.value,
    },
  };
}

/** پیش‌نمایش بودجه فقط وقتی همه قیود ریسک صریح و معتبرند. */
export function previewPortfolioRisk(outlookDraft, form = {}) {
  if (!outlookDraft?.session || outlookDraft.step !== 'outlook') {
    return { ok: false, why: 'پیش‌نویس معتبر انتظار بازار لازم است', budget: null };
  }
  const risk = riskInputFromForm(form);
  if (!risk.ok) return { ok: false, why: risk.why, budget: null };
  return portfolioMissionRiskBudget(outlookDraft.session, risk.risk);
}

/** مرحله سوم فقط risk/liquidity معتبر را به draft انتظار اضافه می‌کند. */
export function createPortfolioRiskDraft(outlookDraft, form = {}) {
  if (!outlookDraft?.session || outlookDraft.step !== 'outlook') {
    return formFail('پیش‌نویس معتبر انتظار بازار لازم است');
  }
  const riskInput = riskInputFromForm(form);
  if (!riskInput.ok) return riskInput;
  const checkedRisk = validateMissionRisk(riskInput.risk);
  if (!checkedRisk.ok) return formFail(checkedRisk.why);
  const liquidityInput = liquidityInputFromForm(form);
  if (!liquidityInput.ok) return liquidityInput;
  const checkedLiquidity = validateMissionLiquidity(liquidityInput.liquidity);
  if (!checkedLiquidity.ok) return formFail(checkedLiquidity.why);
  return {
    ok: true,
    why: '',
    draft: {
      ...outlookDraft,
      step: 'risk',
      risk: checkedRisk.risk,
      liquidity: checkedLiquidity.liquidity,
    },
  };
}
