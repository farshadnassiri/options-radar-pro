// بازسازی فرم مأموریت از رکورد ذخیره‌شدهٔ سرور.
//
// این وارونهٔ `portfolio-mission-form.mjs` است: آن ورودی تومان و رشتهٔ
// فارسی را به draft ریالی تبدیل می‌کند، این draft ریالی را به همان
// ورودی‌های صریح برمی‌گرداند تا فرم دقیقاً همان‌جایی باز شود که کاربر
// رهایش کرده بود.
//
// یک قاعده بر همه‌چیز حاکم است: **هیچ مقداری ساخته نمی‌شود.** اگر رکورد
// ناقص یا نسخه‌اش ناشناخته بود، صریح رد می‌شود. پر کردن جای خالی با
// پیش‌فرض، بدترین حالت ممکن است — کاربر فرمی را می‌بیند که پر به نظر
// می‌رسد ولی عددهایش را او انتخاب نکرده، و بعد با همان‌ها وارد یک مأموریت
// واقعی می‌شود.
//
// اینجا نه DOM هست نه fetch، تا هر بند پذیرش مستقیم آزمون‌پذیر بماند.

import { MISSION_DIRECTIONS, MISSION_OBJECTIVES, MISSION_RETURN_BASES, MISSION_REPLAY_GRAINS, MISSION_VOLATILITY_VIEWS } from '../core/portfolio-mission.mjs';
import { GROUPS as STRATEGY_FAMILIES } from '../strategies/catalog.mjs';

export const MISSION_RESUME_VERSION = 1;
export const MISSION_RESUME_STEPS = Object.freeze([
  'setup', 'outlook', 'risk', 'allocation', 'mission', 'active',
]);

/** مرحله‌هایی که پیش از مرحلهٔ داده‌شده کامل شده‌اند، شاملِ خودش. */
const reached = (step, upTo) => MISSION_RESUME_STEPS.indexOf(step) >= MISSION_RESUME_STEPS.indexOf(upTo);

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = (why) => ({ ok: false, why, record: null });

/**
 * ریال ذخیره‌شده → تومانِ همان ورودی.
 *
 * تقسیم بر ده باید صحیح دربیاید. اگر نیامد یعنی رکورد دستکاری یا خراب
 * شده؛ گرد کردن، عددی به کاربر نشان می‌دهد که هرگز ننوشته است.
 */
function rialToToman(rial) {
  if (!Number.isSafeInteger(rial) || rial < 0 || rial % 10 !== 0) return null;
  return rial / 10;
}

/** مقدار اختیاری: نبودش خالی است، بودنِ خرابش خطا. */
function optionalToman(row, key) {
  if (!Object.prototype.hasOwnProperty.call(row, key) || row[key] === null) return { ok: true, value: '' };
  const toman = rialToToman(row[key]);
  return toman === null ? { ok: false, why: `مقدار ذخیره‌شدهٔ «${key}» معتبر نیست` } : { ok: true, value: String(toman) };
}

function requiredToman(row, key) {
  const toman = rialToToman(row?.[key]);
  return toman === null ? { ok: false, why: `مقدار ذخیره‌شدهٔ «${key}» معتبر نیست` } : { ok: true, value: String(toman) };
}

function requiredNumber(row, key) {
  const value = row?.[key];
  return Number.isFinite(value) ? { ok: true, value: String(value) } : { ok: false, why: `عدد ذخیره‌شدهٔ «${key}» معتبر نیست` };
}

function optionalNumber(row, key) {
  if (!Object.prototype.hasOwnProperty.call(row ?? {}, key) || row[key] === null) return { ok: true, value: '' };
  return requiredNumber(row, key);
}

function requiredBool(row, key) {
  const value = row?.[key];
  if (value === true) return { ok: true, value: 'yes' };
  if (value === false) return { ok: true, value: 'no' };
  return { ok: false, why: `انتخاب ذخیره‌شدهٔ «${key}» صریح نیست` };
}

function requiredChoice(row, key, dictionary) {
  const value = String(row?.[key] ?? '');
  return Object.prototype.hasOwnProperty.call(dictionary, value)
    ? { ok: true, value }
    : { ok: false, why: `گزینهٔ ذخیره‌شدهٔ «${key}» شناخته نمی‌شود` };
}

/** لحظهٔ ذخیره‌شده → همان دو ورودی تاریخ و ثانیه. */
function moment(row, label) {
  if (!isObject(row)) return { ok: false, why: `${label} ذخیره نشده است` };
  if (!Number.isInteger(row.date) || row.date <= 0) return { ok: false, why: `تاریخ ${label} معتبر نیست` };
  if (!Number.isInteger(row.second) || row.second < 0) return { ok: false, why: `ثانیهٔ ${label} معتبر نیست` };
  return { ok: true, value: { date: row.date, second: row.second } };
}

function setupInputs(session, replay) {
  if (typeof session.baseIns !== 'string' || !session.baseIns) return { ok: false, why: 'نماد پایهٔ ذخیره‌شده معتبر نیست' };
  const grain = requiredChoice(replay ?? {}, 'grain', MISSION_REPLAY_GRAINS);
  if (!grain.ok) return grain;
  const capital = requiredToman(session.capital, 'initialRial');
  if (!capital.ok) return capital;
  const reserve = requiredToman(session.capital, 'reserveRial');
  if (!reserve.ok) return reserve;
  const start = moment(session.start, 'شروع');
  if (!start.ok) return start;
  const end = moment(session.end, 'پایان');
  if (!end.ok) return end;
  return {
    ok: true,
    value: {
      baseIns: session.baseIns,
      capitalToman: capital.value,
      reserveToman: reserve.value,
      startDate: start.value.date,
      startSecond: start.value.second,
      endDate: end.value.date,
      endSecond: end.value.second,
      grain: grain.value,
    },
  };
}

function outlookInputs(outlook) {
  if (!isObject(outlook)) return { ok: false, why: 'انتظار بازار ذخیره نشده است' };
  const direction = requiredChoice(outlook, 'direction', MISSION_DIRECTIONS);
  if (!direction.ok) return direction;
  const volatilityView = requiredChoice(outlook, 'volatilityView', MISSION_VOLATILITY_VIEWS);
  if (!volatilityView.ok) return volatilityView;
  const confidence = requiredNumber(outlook, 'confidencePct');
  if (!confidence.ok) return confidence;
  const target = optionalToman(outlook, 'targetPriceRial');
  if (!target.ok) return target;
  const low = optionalToman(outlook, 'rangeLowRial');
  if (!low.ok) return low;
  const high = optionalToman(outlook, 'rangeHighRial');
  if (!high.ok) return high;
  const expected = optionalNumber(outlook, 'expectedVolatilityPct');
  if (!expected.ok) return expected;
  return {
    ok: true,
    value: {
      direction: direction.value,
      volatilityView: volatilityView.value,
      confidencePct: confidence.value,
      thesis: typeof outlook.thesis === 'string' ? outlook.thesis : '',
      targetPriceToman: target.value,
      rangeLowToman: low.value,
      rangeHighToman: high.value,
      expectedVolatilityPct: expected.value,
    },
  };
}

function riskInputs(risk, liquidity) {
  if (!isObject(risk)) return { ok: false, why: 'قیود ریسک ذخیره نشده است' };
  if (!isObject(liquidity)) return { ok: false, why: 'قیود نقدشوندگی ذخیره نشده است' };
  const value = {};
  for (const key of ['maxLossPct', 'maxDrawdownPct', 'minFreeCapitalPct', 'maxMarginUsePct']) {
    const parsed = requiredNumber(risk, key);
    if (!parsed.ok) return parsed;
    value[key] = parsed.value;
  }
  const unlimited = requiredBool(risk, 'allowUnlimitedRisk');
  if (!unlimited.ok) return unlimited;
  value.allowUnlimitedRisk = unlimited.value;

  const underlying = requiredToman(liquidity, 'minUnderlyingDailyValueRial');
  if (!underlying.ok) return underlying;
  const option = requiredToman(liquidity, 'minOptionDailyValueRial');
  if (!option.ok) return option;
  const openInterest = requiredNumber(liquidity, 'minOpenInterest');
  if (!openInterest.ok) return openInterest;
  const spread = requiredNumber(liquidity, 'maxSpreadPct');
  if (!spread.ok) return spread;
  const bookTake = requiredNumber(liquidity, 'maxBookTakePct');
  if (!bookTake.ok) return bookTake;
  const fullBook = requiredBool(liquidity, 'requireFullBook');
  if (!fullBook.ok) return fullBook;

  value.minUnderlyingDailyValueToman = underlying.value;
  value.minOptionDailyValueToman = option.value;
  value.minOpenInterest = openInterest.value;
  value.maxSpreadPct = spread.value;
  value.maxBookTakePct = bookTake.value;
  value.requireFullBook = fullBook.value;
  return { ok: true, value };
}

function allocationInputs(allocations) {
  if (!Array.isArray(allocations) || !allocations.length) return { ok: false, why: 'تخصیص خانواده‌ها ذخیره نشده است' };
  const rows = [];
  for (const row of allocations) {
    const family = requiredChoice(row ?? {}, 'familyId', STRATEGY_FAMILIES);
    if (!family.ok) return family;
    const pct = requiredNumber(row, 'pct');
    if (!pct.ok) return pct;
    rows.push({ familyId: family.value, pct: pct.value });
  }
  return { ok: true, value: rows };
}

function missionInputs(mission) {
  if (!isObject(mission) || !isObject(mission.objective)) return { ok: false, why: 'هدف مأموریت ذخیره نشده است' };
  const objective = mission.objective;
  const mode = requiredChoice(objective, 'mode', MISSION_OBJECTIVES);
  if (!mode.ok) return mode;
  const returnBase = requiredChoice(objective, 'returnBase', MISSION_RETURN_BASES);
  if (!returnBase.ok) return returnBase;
  const target = requiredNumber(objective, 'targetReturnPct');
  if (!target.ok) return target;
  const holding = requiredNumber(objective, 'maxHoldingDays');
  if (!holding.ok) return holding;
  return {
    ok: true,
    value: {
      objectiveMode: mode.value,
      returnBase: returnBase.value,
      targetReturnPct: target.value,
      maxHoldingDays: holding.value,
    },
  };
}

/**
 * رکورد ذخیره‌شده → ورودی‌های صریح فرم.
 *
 * سرور هنگام GET همین رکورد را با `restorePortfolioMissionSave` سنجیده،
 * ولی اینجا دوباره سنجیده می‌شود. دلیلش بدبینی به سرور نیست: این تابع
 * وارونهٔ ریال-به-تومان را هم انجام می‌دهد و همان‌جا می‌تواند به رکوردی
 * بربخورد که از نظر قرارداد درست است ولی به ورودی فرم برنمی‌گردد.
 *
 * فقط بخش‌هایی از `inputs` پر می‌شوند که مرحلهٔ ذخیره‌شده واقعاً به آن‌ها
 * رسیده باشد؛ بقیه `null` می‌مانند تا فرم چیزی را که ثبت نشده نشان ندهد.
 */
export function resumeMissionRecord(raw) {
  if (!isObject(raw)) return fail('رکورد ذخیره‌شده باید یک شیء باشد');
  if (raw.schemaVersion !== MISSION_RESUME_VERSION) return fail('نسخهٔ ذخیرهٔ مأموریت ناشناخته یا پشتیبانی‌نشده است');
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.id)) return fail('شناسهٔ رکورد ذخیره‌شده معتبر نیست');
  if (!Number.isInteger(raw.savedAt) || raw.savedAt < 0) return fail('زمان ذخیره معتبر نیست');
  if (!isObject(raw.draft)) return fail('بدنهٔ پیش‌نویس ذخیره نشده است');

  const draft = raw.draft;
  const step = String(draft.step ?? '');
  if (!MISSION_RESUME_STEPS.includes(step)) return fail('مرحلهٔ ذخیره‌شده ناشناخته است');
  if (!isObject(draft.session)) return fail('قرارداد جلسهٔ ذخیره‌شده معتبر نیست');
  if (draft.session.id !== raw.id) return fail('شناسهٔ رکورد با شناسهٔ جلسه یکی نیست');

  const inputs = { setup: null, outlook: null, risk: null, allocation: null, mission: null };

  const setup = setupInputs(draft.session, draft.replay);
  if (!setup.ok) return fail(setup.why);
  inputs.setup = setup.value;

  if (reached(step, 'outlook')) {
    const outlook = outlookInputs(draft.outlook);
    if (!outlook.ok) return fail(outlook.why);
    inputs.outlook = outlook.value;
  }
  if (reached(step, 'risk')) {
    const risk = riskInputs(draft.risk, draft.liquidity);
    if (!risk.ok) return fail(risk.why);
    inputs.risk = risk.value;
  }
  if (reached(step, 'allocation')) {
    const allocation = allocationInputs(draft.session.allocations);
    if (!allocation.ok) return fail(allocation.why);
    inputs.allocation = allocation.value;
  }
  if (reached(step, 'mission')) {
    const mission = missionInputs(draft.mission ?? draft.session.mission);
    if (!mission.ok) return fail(mission.why);
    inputs.mission = mission.value;
  }

  // جلسهٔ فعال، عکس شروع را قفل کرده است. ادامه‌دادن نباید بتواند
  // تصمیم‌های پیش از شروع را عوض کند — وگرنه بازپخشی که بعداً ساخته
  // می‌شود، بازپخشِ مأموریتی نیست که کاربر واقعاً شروع کرده بود.
  const readOnly = step === 'active';

  return {
    ok: true,
    why: '',
    record: {
      id: raw.id,
      savedAt: raw.savedAt,
      step,
      readOnly,
      stage: step === 'mission' ? 'review' : step,
      session: draft.session,
      draft,
      inputs,
    },
  };
}

/** برچسب یک ردیف فهرست جلسه‌ها. مرحلهٔ ناشناخته «نامعلوم» می‌ماند، نه حدس. */
export function missionSaveLabel(summary) {
  const step = String(summary?.step ?? '');
  const known = {
    setup: 'مرحله ۱ — زمان و سرمایه',
    outlook: 'مرحله ۲ — انتظار بازار',
    risk: 'مرحله ۳ — ریسک و نقدشوندگی',
    allocation: 'مرحله ۴ — تخصیص خانواده‌ها',
    mission: 'مرحله ۵ — مرور و قفل',
    active: 'جلسهٔ فعال — قفل‌شده',
  };
  return Object.prototype.hasOwnProperty.call(known, step) ? known[step] : 'مرحلهٔ نامعلوم';
}
