// ارزیابی بازده و ریسک طرح سرمایه‌دار سبد — برش ششم فاز ۳.
//
// طرح ورود اکنون قیمت اجرایی، ظرفیت و مبنای سرمایه قابل حسابرسی دارد،
// اما هنوز نمی‌گوید در قیمتی که کاربر در مأموریت قفل کرده چه سود یا زیانی
// می‌سازد. این ماژول همان و فقط همان را می‌گوید.
//
// چهار مرزی که کل فایل را شکل داده‌اند:
//
// **ورودی فقط خروجی قانونی سرمایه.** خروجی `portfolioCapitalRequirement`
// دوباره از خود جلسه بازساخته و با ورودی مقایسه می‌شود. طرحِ دست‌ساز یا
// طرحی از لحظه‌ای دیگر بازده نمی‌گیرد، چون بازدهی که روی عدد دست‌کاری‌شده
// حساب شود دقیقاً شبیه بازده واقعی به نظر می‌رسد و همان خطرناکش می‌کند.
//
// **موتور payoff یکی است.** هیچ فرمول موازی اینجا نوشته نشده؛ همه‌چیز از
// `analyzePayoff` و `pnlAtExpiry` می‌آید. دو موتور بازده یعنی دو جواب که
// دیر یا زود از هم فاصله می‌گیرند و هیچ‌کس نمی‌فهمد کدام درست بود.
//
// **هیچ قیمتی ساخته نمی‌شود.** فقط نقاط قیمتیِ صریحِ مأموریت گزارش
// می‌شوند. از «تلاطم مورد انتظار» قیمت درنمی‌آید و توزیع احتمال ساخته
// نمی‌شود — این کارِ این برش نیست و بدون متن مقرراتی هم مبنا ندارد.
//
// **نامتناهی، نامتناهی می‌ماند.** ریسک نامحدود با عددی بزرگ جایگزین
// نمی‌شود. عدد بزرگ در جدول شبیه یک زیان قابل تحمل دیده می‌شود؛ `null` به
// همراه پرچم صریح، شبیه چیزی که هست.
//
// اینجا نه بودجه عوض می‌شود، نه ظرفیت ورود کوچک می‌شود. فقط گزارش.

import {
  combineDataQuality, isDataQuality, makeDataQuality,
} from './data-quality.mjs';
import { activeSnapshot, snapshotWithinSession } from './portfolio-snapshot.mjs';
import { analyzePayoff, pnlAtExpiry } from './payoff.mjs';
import { PORTFOLIO_CAPITAL_VERSION, portfolioCapitalRequirement } from './portfolio-capital.mjs';
import { PORTFOLIO_ENTRY_VERSION } from './portfolio-entry.mjs';
import {
  MISSION_DIRECTIONS, validateMissionOutlook, validateMissionRisk,
} from './portfolio-mission.mjs';

export const PORTFOLIO_EVALUATION_VERSION = 1;

export const PORTFOLIO_EVALUATION_REASONS = Object.freeze({
  inactiveSession: 'ارزیابی بازده فقط برای جلسهٔ فعال محاسبه می‌شود',
  invalidCapital: 'مبنای سرمایهٔ معتبر و قابل بازسازی همین جلسه لازم است',
  invalidMission: 'مأموریت قفل‌شدهٔ معتبر با دید بازار و قیود ریسک لازم است',
  missingSettlementFees: 'نرخ و کیفیت صریح کارمزد اعمال و سهم در snapshot موجود نیست',
  unknownPayoff: 'بازده طرح از داده‌های موجود قابل محاسبه نیست',
});

const POINT_LABELS = Object.freeze({
  target: 'قیمت هدف مأموریت',
  rangeLow: 'کران پایین بازهٔ مأموریت',
  rangeHigh: 'کران بالای بازهٔ مأموریت',
});

const text = (value) => String(value ?? '').trim();
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);

function sameMoment(left, right) {
  return Number.isInteger(left?.date) && left.date > 0
    && Number.isInteger(left?.second) && left.second >= 0
    && left.date === right?.date && left.second === right?.second;
}

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function fail(reason, session, capital) {
  return {
    version: PORTFOLIO_EVALUATION_VERSION,
    ok: false,
    why: PORTFOLIO_EVALUATION_REASONS[reason],
    reason,
    sessionId: text(session?.id),
    candidateId: text(capital?.candidateId),
    now: capital?.now ? { ...capital.now } : null,
    executableQty: null,
    entry: null,
    points: [],
    payoff: null,
    risk: null,
    quality: null,
    audit: null,
  };
}

/**
 * نرخ‌های لازم برای تسویه.
 *
 * `exercise` برای پاهایی که در سررسید در سود می‌شوند، و **هر دو** نرخ
 * خرید و فروش سهم — چون سهمِ باقی‌مانده پس از اعمال، بسته به اینکه قیمت
 * پایه کجای نمودار بایستد، ممکن است فروخته یا خریده شود. یک نرخ برداشتن
 * یعنی نصف نمودار با کارمزد صفر حساب شود.
 */
function settlementFees(snapshot, legs) {
  const input = snapshot?.capitalInputs?.fees;
  if (!input || !isDataQuality(input.quality) || input.quality.kind === 'missing') return null;
  const needed = new Set(['buyStock', 'sellStock']);
  if (legs.some((leg) => leg.kind !== 'underlying')) needed.add('exercise');
  const fees = {};
  for (const key of needed) {
    if (!own(input, key)) return null;
    const rate = Number(input[key]);
    if (!(Number.isFinite(rate) && rate >= 0)) return null;
    fees[key] = rate;
  }
  return { fees, quality: copy(input.quality) };
}

/** پاهای طرح با VWAP ورود و حجم اجرایی خودِ طرح، به شکلی که موتور می‌خواهد. */
function payoffLegs(entryAudit, qty) {
  return entryAudit.map((leg) => ({
    kind: leg.kind,
    side: leg.side,
    ratio: Number(leg.ratio) * qty,
    size: Number(leg.size),
    strike: leg.kind === 'underlying' ? null : Number(leg.strike),
    price: Number(leg.execution?.vwap),
  }));
}

/** مأموریت قفل‌شده باید از همان اعتبارسنج‌های مشترک رد شود، نه اینکه فقط وجود داشته باشد. */
function lockedMission(session) {
  const mission = session?.lockedMission;
  if (!mission || typeof mission !== 'object') return null;
  const outlook = validateMissionOutlook(mission.outlook);
  if (!outlook.ok) return null;
  const risk = validateMissionRisk(mission.risk);
  if (!risk.ok) return null;
  return { outlook: outlook.outlook, risk: risk.risk };
}

/**
 * نقاط قیمتیِ صریح مأموریت، به تفکیک دید بازار.
 *
 * جهت‌دار به قیمت هدف قفل است، خنثی به دو کران بازه، و پرنوسان فقط به هر
 * نقطهٔ صریحی که کاربر نوشته باشد — که ممکن است هیچ باشد. هیچ نقطه‌ای از
 * `expectedVolatilityPct` ساخته نمی‌شود.
 */
function missionPoints(outlook) {
  const at = (code, priceRial) => (Number.isFinite(priceRial) && priceRial > 0
    ? { code, label: POINT_LABELS[code], priceRial } : null);
  const target = at('target', outlook.targetPriceRial);
  const low = at('rangeLow', outlook.rangeLowRial);
  const high = at('rangeHigh', outlook.rangeHighRial);

  if (outlook.direction === 'bullish' || outlook.direction === 'bearish') {
    return target ? [target] : [];
  }
  if (outlook.direction === 'neutral') {
    return [low, high].filter(Boolean);
  }
  // پرنوسان: هرچه صریح نوشته شده، نه بیشتر.
  return [target, low, high].filter(Boolean);
}

/**
 * ارزیابی بازده و ریسک یک طرح سرمایه‌دار.
 *
 * `capital` باید همان خروجی `portfolioCapitalRequirement` برای همین جلسه،
 * همین snapshot و همین طرح ورود باشد.
 */
export function portfolioPlanEvaluation(session, candidateSet, evidence, entry, capital) {
  if (!session || session.state !== 'active') return fail('inactiveSession', session, capital);
  const snapshot = activeSnapshot(session);
  if (!snapshot || !snapshotWithinSession(session, snapshot)
    || capital?.version !== PORTFOLIO_CAPITAL_VERSION || capital?.ok !== true
    || text(capital.sessionId) !== text(session.id) || !sameMoment(capital.now, snapshot.at)
    || entry?.version !== PORTFOLIO_ENTRY_VERSION || entry?.ok !== true
    || text(entry.candidateId) !== text(capital.candidateId)) {
    return fail('invalidCapital', session, capital);
  }

  const canonical = portfolioCapitalRequirement(session, candidateSet, evidence, entry);
  if (!canonical.ok || !sameJson(canonical, capital)) return fail('invalidCapital', session, capital);

  const mission = lockedMission(session);
  if (!mission) return fail('invalidMission', session, capital);

  const settlement = settlementFees(snapshot, entry.legs);
  if (!settlement) return fail('missingSettlementFees', session, capital);

  // جریان نقد ورود پس از کارمزد صریح — همان چیزی که موتور «netCash»
  // می‌نامد. کارمزد همیشه هزینه است، پس کم می‌شود نه اینکه علامتش را از
  // جای دیگری بگیرد.
  const entryCashAfterFeesRial = Number(entry.entryCashRial) - Number(capital.components.feeRial);
  const legs = payoffLegs(entry.legs, entry.executableQty);
  if (!Number.isFinite(entryCashAfterFeesRial)
    || legs.some((leg) => !(Number.isFinite(leg.price) && leg.price > 0))) {
    return fail('unknownPayoff', session, capital);
  }

  const analysis = analyzePayoff(legs, entryCashAfterFeesRial, { fees: settlement.fees });
  if (!Array.isArray(analysis.breakevens) || analysis.breakevens.some((x) => !Number.isFinite(x))) {
    return fail('unknownPayoff', session, capital);
  }

  // بازده بر سرمایه، فقط با جمع سرمایهٔ لازم. مبنای بازدهِ هدفِ مأموریت
  // (`objective.returnBase`) عمداً اینجا استفاده نمی‌شود: آن می‌گوید هدف
  // را با چه چیزی بسنجیم، این می‌گوید این طرح چقدر پول قفل می‌کند.
  const capitalRial = Number(capital.components.totalRial);
  const returnOn = (pnl) => (Number.isFinite(pnl) && capitalRial > 0
    ? (pnl / capitalRial) * 100 : null);

  const points = [];
  for (const point of missionPoints(mission.outlook)) {
    const pnlRial = pnlAtExpiry(legs, point.priceRial, entryCashAfterFeesRial, { fees: settlement.fees });
    if (!Number.isFinite(pnlRial)) return fail('unknownPayoff', session, capital);
    points.push({ ...point, pnlRial, returnPct: returnOn(pnlRial) });
  }

  // بدترین نقطه فقط وقتی معنا دارد که بیش از یک نقطه گزارش شده باشد.
  const worst = points.length > 1
    ? points.reduce((low, row) => (row.pnlRial < low.pnlRial ? row : low))
    : null;

  const { unlimitedProfit, unlimitedLoss } = analysis;
  const maxProfitRial = unlimitedProfit ? null : Number(analysis.maxProfit);
  const maxLossRial = unlimitedLoss ? null : Number(analysis.maxLoss);
  if ((!unlimitedProfit && !Number.isFinite(maxProfitRial))
    || (!unlimitedLoss && !Number.isFinite(maxLossRial))) {
    return fail('unknownPayoff', session, capital);
  }

  // سقف زیان مأموریت جدا سنجیده می‌شود و با بیشترین زیانِ موتور یکی
  // نمی‌شود. زیان نامتناهی هر سقف متناهی را رد می‌کند — این را می‌گوییم،
  // نه اینکه عدد بزرگی بگذاریم تا مقایسه «کار کند».
  const capitalBaseRial = Number(session.capital?.initialRial);
  const capRial = Number.isFinite(capitalBaseRial) && capitalBaseRial > 0
    ? Math.round((capitalBaseRial * mission.risk.maxLossPct) / 100) : null;
  const missionLossCap = {
    maxLossPct: mission.risk.maxLossPct,
    capitalBaseRial: Number.isFinite(capitalBaseRial) && capitalBaseRial > 0 ? capitalBaseRial : null,
    capRial,
    worstLossRial: maxLossRial,
    exceeded: unlimitedLoss ? true : (capRial === null ? null : maxLossRial > capRial),
    allowUnlimitedRisk: mission.risk.allowUnlimitedRisk,
    unlimitedRiskBreach: unlimitedLoss && mission.risk.allowUnlimitedRisk !== true,
  };

  const quality = combineDataQuality([capital.quality, settlement.quality], {
    source: 'portfolio-plan-evaluation', asOf: snapshot.at,
  });

  return {
    version: PORTFOLIO_EVALUATION_VERSION,
    ok: true,
    why: '',
    reason: null,
    sessionId: text(session.id),
    candidateId: text(capital.candidateId),
    now: { ...snapshot.at },
    executableQty: entry.executableQty,
    entry: {
      cashRial: Number(entry.entryCashRial),
      feeRial: Number(capital.components.feeRial),
      cashAfterFeesRial: entryCashAfterFeesRial,
    },
    direction: {
      code: mission.outlook.direction,
      label: MISSION_DIRECTIONS[mission.outlook.direction],
    },
    points,
    worst: worst ? { code: worst.code, pnlRial: worst.pnlRial, returnPct: worst.returnPct } : null,
    payoff: {
      maxProfitRial,
      maxLossRial,
      unlimitedProfit,
      unlimitedLoss,
      breakevensRial: analysis.breakevens.slice(),
      atMaxProfitRial: Number.isFinite(analysis.atMaxProfit) ? analysis.atMaxProfit : null,
      atMaxLossRial: Number.isFinite(analysis.atMaxLoss) ? analysis.atMaxLoss : null,
      maxProfitPct: unlimitedProfit ? null : returnOn(maxProfitRial),
      maxLossPct: unlimitedLoss ? null : returnOn(maxLossRial),
    },
    risk: { missionLossCap },
    capitalBasis: {
      totalRial: capitalRial,
      kind: capital.basis.kind,
      label: capital.basis.label,
    },
    quality,
    audit: {
      capital: {
        version: capital.version, sessionId: capital.sessionId,
        candidateId: capital.candidateId, now: { ...capital.now },
      },
      settlement: { rates: copy(settlement.fees), quality: copy(settlement.quality) },
      // این ارزیابی نه بودجه را عوض می‌کند نه ظرفیت ورود را کوچک؛ عددهای
      // طرح عیناً بازتاب داده می‌شوند تا اگر جایی تغییر کرد دیده شود.
      untouched: {
        executableQty: entry.executableQty,
        budgetTargetRial: capital.budget.targetRial,
        budgetRequiredRial: capital.budget.requiredRial,
      },
    },
  };
}

/** کیفیت خالیِ صریح، برای مصرف‌کننده‌ای که هنوز طرحی ندارد. */
export function emptyEvaluationQuality(at) {
  return makeDataQuality({
    kind: 'missing', source: 'portfolio-plan-evaluation', asOf: at,
    sufficient: false, reason: 'هنوز طرح سرمایه‌داری برای ارزیابی وجود ندارد',
  });
}
