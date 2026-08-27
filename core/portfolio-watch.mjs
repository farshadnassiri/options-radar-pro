// هشدار قید ریسک در مسیر — برش دهم فاز ۵.
//
// قیود ریسک فقط **هنگام ثبت** سنجیده می‌شدند. ولی جلسه حالا در زمان جلو
// می‌رود، و قیدی که موقع ثبت رعایت شده بود می‌تواند دو روز بعد شکسته
// باشد — بی‌آنکه کاربر کاری کرده باشد. قیمت پایه تکان می‌خورد، وجه
// تضمین بالا می‌رود، و کسی خبر نمی‌داد.
//
// پنج مرز:
//
// **سنجش روی لحظهٔ جاری، نه لحظهٔ ثبت.** دفتر سرمایه قیود را می‌سنجد
// ولی روی **سرمایهٔ ثبت‌شده**؛ همان عددی که در سند نوشته شد و دیگر تکان
// نمی‌خورد. آنچه واقعاً عوض می‌شود ارزش جاری است، و تفاوت همین دو، کلِ
// دلیلِ وجود این ماژول است.
//
// **«چه چیزی عوض شد» نه فقط «الان بد است».** کاربر باید بفهمد از کجا به
// کجا رسیده، وگرنه نمی‌داند واکنشش را به چه بدهد.
//
// **نزدیک‌شدن با شکستن یکی نمی‌شود.** هشدارِ یکسان برای هر دو یعنی
// کاربر فوریت را نمی‌فهمد و بعد از چند بار، هر دو را نادیده می‌گیرد.
//
// **«نمی‌دانیم» هشدار نیست.** اگر ارزش‌گذاری ممکن نباشد، سکوت هم غلط
// است و هشدارِ کاذب هم؛ حالت سومی لازم است که خودش را معرفی کند.
//
// **آستانهٔ نزدیکی از مأموریت می‌آید، نه از هوا.** عددی که اینجا ساخته
// شود سیاستی است که هیچ‌کس تصویبش نکرده.

import { PORTFOLIO_COMMIT_VERSION } from './portfolio-commit.mjs';
import { portfolioCapitalLedger } from './portfolio-ledger.mjs';
import { portfolioPayoffCurve } from './portfolio-payoff.mjs';
import { portfolioSessionValuation } from './portfolio-valuation.mjs';

export const PORTFOLIO_WATCH_VERSION = 1;

export const PORTFOLIO_WATCH_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای پایش قیود در کار نیست',
  brokenLedger: 'دفتر سرمایهٔ جلسه ساخته نشد',
  noOpenPositions: 'موقعیت بازی نیست، پس قیدی هم در مسیر نیست',
});

/** وضعیت هر قید. سه حالت، نه دو. */
export const WATCH_STATES = Object.freeze({
  clear: 'رعایت شده',
  near: 'نزدیک شکستن',
  breached: 'شکسته',
  unknown: 'نامعلوم',
});

/**
 * سهمی از فاصله که «نزدیک» حساب می‌شود.
 *
 * یک‌پنجمِ خودِ حدِ مأموریت — یعنی وقتی کمتر از ۲۰٪ جا مانده. این نسبت
 * از حدِ خودِ کاربر مشتق می‌شود، نه از عددی که اینجا اختراع شود؛ کسی که
 * سقف ۴۰٪ گذاشته با کسی که ۱۰٪ گذاشته، «نزدیک» را یکسان نمی‌فهمد.
 */
export const NEAR_SHARE = 0.2;

const num = (value) => Number(value);

function fail(reason, why = '') {
  return {
    version: PORTFOLIO_WATCH_VERSION,
    ok: false,
    why: why || PORTFOLIO_WATCH_REASONS[reason],
    reason,
    alerts: [],
    counts: null,
    valuation: null,
  };
}

/**
 * حکمِ یک قید، از روی فاصله‌اش.
 *
 * `headroom` مثبت یعنی جا مانده و منفی یعنی عبور کرده — همان علامتی که
 * دفتر سرمایه می‌دهد.
 */
function verdict(headroomPct, limitPct) {
  if (!Number.isFinite(headroomPct)) return 'unknown';
  if (headroomPct < 0) return 'breached';
  const band = Math.abs(num(limitPct)) * NEAR_SHARE;
  return headroomPct <= band ? 'near' : 'clear';
}

/**
 * بدترین زیانی که **در لحظهٔ ثبت** برای همین موقعیت‌ها نوشته شد.
 *
 * بدون این عدد، هشدار فقط می‌گوید «الان بد است» و کاربر نمی‌داند از کجا
 * به کجا رسیده — پس نمی‌داند واکنشش را به چه بدهد.
 */
function lossAtCommit(session) {
  let sum = 0;
  let known = true;
  for (const event of session?.events || []) {
    const data = event?.data;
    if (data?.commitVersion !== PORTFOLIO_COMMIT_VERSION) continue;
    const worst = data.missionLossCap?.worstLossRial;
    if (!Number.isFinite(worst)) { known = false; continue; }
    sum += worst;
  }
  return known ? sum : null;
}

function alertFrom(code, risk, extra = {}) {
  const state = verdict(risk.headroomPct, risk.limitPct);
  return {
    code,
    label: risk.label,
    state,
    stateLabel: WATCH_STATES[state],
    limitPct: risk.limitPct,
    currentPct: risk.currentPct,
    headroomPct: risk.headroomPct,
    headroomRial: risk.headroomRial,
    ...extra,
  };
}

/**
 * پایش قیود ریسک در لحظهٔ جاری.
 *
 * `evidence` مدرک هم‌لحظه است. بدون آن ارزش جاری معلوم نیست و قیدهایی
 * که به ارزش بند هستند «نامعلوم» می‌شوند — نه «رعایت شده».
 */
export function portfolioRiskWatch(session, evidence) {
  if (!session) return fail('noSession');
  const ledger = portfolioCapitalLedger(session);
  if (!ledger.ok) return fail('brokenLedger', ledger.why);
  if (ledger.committed.count === 0) return fail('noOpenPositions');

  const alerts = [];

  // ── قیود سرمایه ──────────────────────────────────────────────────────
  // اینها از دفتر می‌آیند و مبنایشان سرمایهٔ ثبت‌شده است. تکان نمی‌خورند
  // مگر ثبتی تازه انجام شود — ولی گزارششان لازم است تا تصویر کامل باشد.
  alerts.push(alertFrom('minFreeCapital', ledger.risk.minFreeCapital, { basis: 'committed' }));
  alerts.push(alertFrom('maxMarginUse', ledger.risk.maxMarginUse, { basis: 'committed' }));

  // ── سقف زیانِ مأموریت، روی منحنیِ فعلی ───────────────────────────────
  // سند ثبت زیانِ همان لحظه را نوشت. منحنیِ فعلی زیانِ همین حالا را
  // می‌گوید — با حجم‌های باقی‌مانده و پاهایی که هنوز باز هستند.
  const risk = session.lockedMission?.risk;
  const baseRial = num(session.capital?.initialRial);
  const curve = portfolioPayoffCurve(session);
  const committedLoss = lossAtCommit(session);
  const capPct = num(risk?.maxLossPct);
  if (Number.isFinite(capPct) && baseRial > 0) {
    const capRial = Math.round((baseRial * capPct) / 100);
    if (!curve.ok) {
      alerts.push({
        code: 'missionLossCap', label: 'سقف زیان مأموریت',
        state: 'unknown', stateLabel: WATCH_STATES.unknown,
        limitPct: capPct, limitRial: capRial,
        currentPct: null, currentRial: null, headroomPct: null, headroomRial: null,
        // «نمی‌دانیم» با «خوب است» یکی نمی‌شود.
        why: curve.why, basis: 'curve',
      });
    } else if (curve.curve.unlimitedLoss) {
      alerts.push({
        code: 'missionLossCap', label: 'سقف زیان مأموریت',
        // زیانِ بی‌سقف با هیچ حدی نمی‌خواند؛ عدد نمی‌گیرد و «شکسته» است
        // مگر مأموریت صریح اجازه داده باشد.
        state: risk.allowUnlimitedRisk === true ? 'near' : 'breached',
        stateLabel: WATCH_STATES[risk.allowUnlimitedRisk === true ? 'near' : 'breached'],
        limitPct: capPct, limitRial: capRial,
        currentPct: null, currentRial: null, headroomPct: null, headroomRial: null,
        unlimitedLoss: true, basis: 'curve',
      });
    } else {
      const worst = curve.curve.maxLossRial;
      const headroomRial = capRial - worst;
      alerts.push({
        code: 'missionLossCap', label: 'سقف زیان مأموریت',
        ...alertFrom('missionLossCap', {
          label: 'سقف زیان مأموریت',
          limitPct: capPct,
          currentPct: (worst / baseRial) * 100,
          headroomPct: capPct - (worst / baseRial) * 100,
          headroomRial,
        }),
        limitRial: capRial, currentRial: worst, basis: 'curve',
        atWorstPrice: curve.curve.atMaxLoss,
        // «چه چیزی عوض شد»، نه فقط «الان بد است».
        atCommitRial: committedLoss,
        changeRial: Number.isFinite(committedLoss) ? worst - committedLoss : null,
      });
    }
  }

  // ── ارزش جاری: آنچه واقعاً در مسیر عوض می‌شود ───────────────────────
  const valuation = portfolioSessionValuation(session, evidence);
  if (!valuation.ok || !valuation.totals.complete) {
    alerts.push({
      code: 'unrealizedLoss', label: 'زیان تحقق‌نیافته',
      state: 'unknown', stateLabel: WATCH_STATES.unknown,
      limitPct: capPct, limitRial: null,
      currentPct: null, currentRial: null, headroomPct: null, headroomRial: null,
      why: valuation.ok
        ? `${valuation.totals.unvaluedCount} موقعیت باز ارزش‌گذاری نشد`
        : valuation.why,
      basis: 'valuation',
    });
  } else if (Number.isFinite(capPct) && baseRial > 0) {
    const capRial = Math.round((baseRial * capPct) / 100);
    // زیانِ تحقق‌نیافته عدد منفی است؛ اندازه‌اش با سقف سنجیده می‌شود.
    const lossRial = Math.max(0, -valuation.totals.unrealizedRial);
    alerts.push({
      ...alertFrom('unrealizedLoss', {
        label: 'زیان تحقق‌نیافته',
        limitPct: capPct,
        currentPct: (lossRial / baseRial) * 100,
        headroomPct: capPct - (lossRial / baseRial) * 100,
        headroomRial: capRial - lossRial,
      }),
      limitRial: capRial, currentRial: lossRial, basis: 'valuation',
      unrealizedRial: valuation.totals.unrealizedRial,
    });
  }

  const by = (state) => alerts.filter((row) => row.state === state);
  return {
    version: PORTFOLIO_WATCH_VERSION,
    ok: true,
    why: '',
    reason: null,
    now: session.now ? { ...session.now } : null,
    alerts,
    counts: {
      total: alerts.length,
      breached: by('breached').length,
      near: by('near').length,
      clear: by('clear').length,
      unknown: by('unknown').length,
    },
    valuation: valuation.ok ? valuation.totals : null,
  };
}
