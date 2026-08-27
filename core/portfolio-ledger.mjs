// دفتر سرمایهٔ جلسه — برش نخست فاز ۴.
//
// طرح‌ها ثبت می‌شوند ولی هیچ‌جا نمی‌شد پرسید «الان چقدر از سرمایه درگیر
// است، چقدر آزاد مانده، و آیا قیود ریسکِ مأموریت هنوز رعایت می‌شوند؟»
// بدون این، هر ثبت تازه تا حدی کورکورانه است: `commitPortfolioPlan` فقط
// بودجهٔ **یک خانواده** را می‌بیند، نه سرمایهٔ آزاد و نه سقف وجه تضمین.
//
// چهار مرز:
//
// **فقط از دفتر رویداد و مأموریت قفل‌شده.** هیچ شمارندهٔ موازی‌ای ساخته
// نمی‌شود. شمارندهٔ موازی روزی با دفتر اختلاف پیدا می‌کند و آن‌وقت هیچ‌کدام
// سند نیستند.
//
// **اجزا جدا می‌مانند.** بدهکار، وجه تضمین و کارمزد هرکدام عدد خودشان را
// دارند. جمعِ درهم نمی‌گوید کدام قید دارد فشار می‌آورد، و کاربر نمی‌فهمد
// چه چیزی را باید عوض کند.
//
// **رویدادِ بی‌عدد، صفر نیست.** ثبتی که `capitalRial` ندارد نه بی‌صدا صفر
// حساب می‌شود و نه کل گزارش را `null` می‌کند — شمرده و نام‌بُرده می‌شود.
//
// **اینجا ارزش‌گذاری نیست.** این دفتر می‌گوید چه پولی درگیر شده، نه اینکه
// چقدر می‌ارزد. سود و زیان جاری کارِ فاز بعد است.

import { PORTFOLIO_COMMIT_VERSION } from './portfolio-commit.mjs';
import { replayPortfolioSession } from './portfolio-session.mjs';

export const PORTFOLIO_LEDGER_VERSION = 1;

export const PORTFOLIO_LEDGER_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای دفتر سرمایه در کار نیست',
  brokenLedger: 'دفتر رویداد جلسه قابل بازپخش نیست',
  missingMission: 'مأموریت قفل‌شده با قیود ریسک لازم است',
  invalidCapitalBase: 'مبنای سرمایهٔ جلسه معتبر نیست',
});

const text = (value) => String(value ?? '').trim();
const money = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

function fail(reason) {
  return {
    version: PORTFOLIO_LEDGER_VERSION,
    ok: false,
    why: PORTFOLIO_LEDGER_REASONS[reason],
    reason,
    committed: null,
    free: null,
    risk: null,
    unpriced: null,
  };
}

/** ثبت‌هایی که از `commitPortfolioPlan` آمده‌اند و عدد سرمایه دارند. */
function commitEvents(session) {
  return (session?.events || []).filter((event) => event?.type === 'transaction'
    && event?.data?.commitVersion === PORTFOLIO_COMMIT_VERSION);
}

/**
 * دفتر سرمایهٔ یک جلسه.
 *
 * درصدها همه بر `capital.initialRial` حساب می‌شوند — همان مبنایی که
 * `missionLossCap` هم از آن استفاده می‌کند، تا دو عدد درصدیِ کنار هم دو
 * معنی نداشته باشند.
 */
export function portfolioCapitalLedger(session) {
  if (!session) return fail('noSession');
  const replay = replayPortfolioSession(session);
  if (!replay.ok) return fail('brokenLedger');

  const risk = session.lockedMission?.risk;
  if (!risk || !Number.isFinite(Number(risk.minFreeCapitalPct))
    || !Number.isFinite(Number(risk.maxMarginUsePct))) {
    return fail('missingMission');
  }
  const baseRial = Number(session.capital?.initialRial);
  if (!(Number.isFinite(baseRial) && baseRial > 0)) return fail('invalidCapitalBase');

  let totalRial = 0;
  let debitRial = 0;
  let feeRial = 0;
  let marginRial = 0;
  const families = new Map();
  const unpricedIds = [];

  for (const event of commitEvents(session)) {
    const capitalRial = money(event.data.capitalRial);
    if (capitalRial === null) {
      // نه صفر، نه پاک‌کردنِ کل گزارش: شمرده و نام‌بُرده.
      unpricedIds.push(text(event.id));
      continue;
    }
    const parts = event.data.capital?.components || {};
    totalRial += capitalRial;
    debitRial += money(parts.debitRial) ?? 0;
    feeRial += money(parts.feeRial) ?? 0;
    marginRial += money(parts.marginRial) ?? 0;

    const familyId = text(event.familyId);
    const row = families.get(familyId) || { familyId, totalRial: 0, count: 0 };
    row.totalRial += capitalRial;
    row.count += 1;
    families.set(familyId, row);
  }

  const freeRial = baseRial - totalRial;
  const freePct = (freeRial / baseRial) * 100;
  const marginPct = (marginRial / baseRial) * 100;
  const minFreePct = Number(risk.minFreeCapitalPct);
  const maxMarginPct = Number(risk.maxMarginUsePct);

  // فاصله تا شکستن، نه فقط حکم شکسته/نشکسته.
  //
  // «قید رعایت شده» به کاربر نمی‌گوید چقدر جا مانده، و «شکست» نمی‌گوید
  // چقدر عقب‌گرد لازم است. علامت یکسان است: مثبت یعنی جای باقی‌مانده،
  // منفی یعنی همان‌قدر عبور کرده.
  //
  // اینجا حساب می‌شود نه در لایهٔ نمایش — لایهٔ نمایش حق ساختن عدد مالی
  // ندارد، و تفریقی که آنجا انجام شود هیچ آزمونی بالای سرش نیست.
  const constraint = (label, currentPct, currentRial, limitPct, headroomPct, headroomRial) => ({
    label,
    limitPct,
    limitRial: Math.round((baseRial * limitPct) / 100),
    currentPct,
    currentRial,
    headroomPct,
    headroomRial,
    breached: headroomPct < 0,
  });

  return {
    version: PORTFOLIO_LEDGER_VERSION,
    ok: true,
    why: '',
    reason: null,
    now: session.now ? { ...session.now } : null,
    baseRial,
    committed: {
      totalRial,
      debitRial,
      feeRial,
      marginRial,
      count: commitEvents(session).length - unpricedIds.length,
      byFamily: [...families.values()].sort((a, b) => (a.familyId < b.familyId ? -1 : 1)),
    },
    free: { rial: freeRial, pct: freePct },
    risk: {
      // کف: هرچه سرمایهٔ آزاد بیشتر از حد باشد، جا بیشتر است.
      minFreeCapital: constraint(
        'حداقل سرمایهٔ آزاد', freePct, freeRial, minFreePct,
        freePct - minFreePct, freeRial - Math.round((baseRial * minFreePct) / 100),
      ),
      // سقف: هرچه وجه تضمین کمتر از حد باشد، جا بیشتر است.
      maxMarginUse: constraint(
        'سقف مصرف وجه تضمین', marginPct, marginRial, maxMarginPct,
        maxMarginPct - marginPct, Math.round((baseRial * maxMarginPct) / 100) - marginRial,
      ),
    },
    unpriced: { count: unpricedIds.length, eventIds: unpricedIds },
    positions: replay.positions.length,
  };
}

/**
 * آیا افزودن این سرمایه، قیدی را می‌شکند.
 *
 * جواب «کدام قید و با چه عددی» است، نه یک بله/خیر — کاربر باید بفهمد چه
 * چیزی را باید عوض کند.
 */
export function ledgerRoomFor(session, { capitalRial = 0, marginRial = 0 } = {}) {
  const ledger = portfolioCapitalLedger(session);
  if (!ledger.ok) return { ok: false, why: ledger.why, reason: ledger.reason, breaches: [] };

  const nextFreeRial = ledger.baseRial - (ledger.committed.totalRial + Number(capitalRial));
  const nextFreePct = (nextFreeRial / ledger.baseRial) * 100;
  const nextMarginPct = ((ledger.committed.marginRial + Number(marginRial)) / ledger.baseRial) * 100;

  const breaches = [];
  if (nextFreePct < ledger.risk.minFreeCapital.limitPct) {
    breaches.push({
      code: 'minFreeCapital',
      label: ledger.risk.minFreeCapital.label,
      limitPct: ledger.risk.minFreeCapital.limitPct,
      wouldBePct: nextFreePct,
    });
  }
  if (nextMarginPct > ledger.risk.maxMarginUse.limitPct) {
    breaches.push({
      code: 'maxMarginUse',
      label: ledger.risk.maxMarginUse.label,
      limitPct: ledger.risk.maxMarginUse.limitPct,
      wouldBePct: nextMarginPct,
    });
  }
  return { ok: true, why: '', reason: null, breaches, ledger };
}
