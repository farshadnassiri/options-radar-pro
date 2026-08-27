// چیدمان مشترک آزمون‌های سبد.
//
// چرا هست: دسته‌های ۱۲۸ و ۱۲۹ و ۱۳۰ هر سه یک چیدمان را کپی کرده بودند —
// همان جلسه، همان قراردادها، همان دفتر سفارش، همان مأموریت. هر تغییری در
// شکل جلسه باید سه جا انجام می‌شد، و اولین باری که یکی جا می‌ماند دو دسته
// دو چیز متفاوت می‌سنجیدند و هیچ‌کدام قرمز نمی‌شد.
//
// **تابع است، نه شیء ثابت.** هر دسته چیدمان خودش را می‌سازد و دید بازار و
// قیود ریسکش را عوض می‌کند بدون اینکه روی دستهٔ دیگر اثر بگذارد. یک شیء
// مشترکِ قابل تغییر، دقیقاً همان وابستگی پنهانی است که کپی‌کردن از آن فرار
// می‌کرد.
//
// **اینجا ادعا نوشته نمی‌شود.** این انبار داده است؛ ابزار ادعا در
// `tests/harness.mjs` می‌ماند. `tests/run.mjs` هم فقط `tests/suites/` را
// می‌خواند، پس این فایل دسته حساب نمی‌شود.

import { makeDataQuality } from '../../core/data-quality.mjs';
import { bookCapacity, walkBook } from '../../core/exec.mjs';
import { createPortfolioMission } from '../../core/portfolio-mission.mjs';
import { PORTFOLIO_SCHEMA_VERSION } from '../../core/portfolio-session.mjs';
import { portfolioCandidates } from '../../core/portfolio-candidates.mjs';
import { portfolioEntryPlan } from '../../core/portfolio-entry.mjs';
import { portfolioCapitalRequirement } from '../../core/portfolio-capital.mjs';
import { byId } from '../../strategies/catalog.mjs';

/** دید صعودی پیش‌فرض؛ قیمت هدف بالای همهٔ اعمال‌های چیدمان است. */
export const BULLISH_OUTLOOK = Object.freeze({
  direction: 'bullish', volatilityView: 'higher', confidencePct: 70,
  targetPriceRial: 11_400, thesis: 'انتظار رشد پس از گزارش فصلی',
});

/** سقف زیان تنگ — با طرح‌های این چیدمان شکسته می‌شود. */
export const TIGHT_RISK = Object.freeze({
  maxLossPct: 5, maxDrawdownPct: 20, minFreeCapitalPct: 10,
  maxMarginUsePct: 40, allowUnlimitedRisk: false,
});

/** سقف زیان باز — طرح بدهکار از دروازه رد می‌شود و امتیاز می‌گیرد. */
export const WIDE_RISK = Object.freeze({
  maxLossPct: 50, maxDrawdownPct: 60, minFreeCapitalPct: 10,
  maxMarginUsePct: 40, allowUnlimitedRisk: false,
});

/**
 * یک چیدمان کامل سبد.
 *
 * `tag` فقط در شناسهٔ جلسه می‌نشیند تا دو دسته در یک اجرا شناسهٔ یکسان
 * نداشته باشند.
 */
export function portfolioFixture(tag = 'test') {
  const at = { date: 20260521, second: 10 * 3600 };
  const observed = makeDataQuality({
    kind: 'observed', source: 'locked-broker-settings', asOf: at, sufficient: true,
  });
  const executable = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: at, sufficient: true,
    details: { levelsKnown: 2, levelsTotal: 2 },
  });
  const book = ({ bid, ask, qty = 40 }) => [
    { level: 1, bid, bidQty: qty, ask, askQty: qty, second: at.second },
    { level: 2, bid: bid - 2, bidQty: qty, ask: ask + 2, askQty: qty, second: at.second },
  ];
  const contracts = [];
  for (const strike of [9000, 9500, 10_000, 10_500, 11_000, 11_500, 12_000]) {
    contracts.push({
      ins: `call-${strike}`, kind: 'call', strike, expiry: 20260620, size: 1000,
      quote: { book: book({ bid: 68, ask: 72 }), close: 70, quality: executable },
    });
    contracts.push({
      ins: `put-${strike}`, kind: 'put', strike, expiry: 20260620, size: 1000,
      quote: { book: book({ bid: 78, ask: 82 }), close: 80, quality: executable },
    });
  }
  const capitalInputs = {
    fees: { option: 0.001, buyStock: 0.003, sellStock: 0.009, exercise: 0.0005, quality: observed },
    margin: {
      spotCloseRial: 10_200,
      params: { A: 0.20, B: 0.10, C: 10_000, maint: 0.70, bBasis: 'SPOT' },
      creditMode: 'FULL', nakedComboMargin: 'MAX_PLUS_PREMIUM', quality: observed,
    },
  };
  const capital = {
    initialRial: 10_000_000, reserveRial: 0, reservePct: 0,
    allocatableRial: 10_000_000, assignedRial: 0, unassignedRial: 10_000_000,
  };
  const baseSession = {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    id: `pt-${tag}`, portfolioId: `pf-${tag}`, baseIns: '900001', state: 'active',
    start: at, end: { date: 20260620, second: 12 * 3600 },
    // دفتر رویداد خالی، همان‌طور که `createPortfolioSession` می‌سازدش.
    // بدون این‌ها هر ثبتی روی چیدمان می‌شکند و آزمون به‌جای رفتار، نبودِ
    // فیلد را می‌سنجد.
    now: { ...at },
    events: [],
    counters: { event: 0, transaction: 0, position: 0, execution: 0, lot: 0 },
    capital,
    lockedAllocations: [
      { familyId: 'single', pct: 20, targetRial: 2_000_000 },
      { familyId: 'vol', pct: 80, targetRial: 8_000_000 },
    ],
    startSnapshot: { at, spot: 10_200, contracts, capitalInputs },
  };

  const missionInput = (outlook, risk = TIGHT_RISK) => ({
    objective: { mode: 'growth', returnBase: 'initial', targetReturnPct: 25, maxHoldingDays: 30 },
    outlook,
    risk,
    liquidity: {
      minUnderlyingDailyValueRial: 100_000_000,
      minOptionDailyValueRial: 10_000_000,
      minOpenInterest: 100,
      maxSpreadPct: 8,
      maxBookTakePct: 50,
      requireFullBook: false,
    },
    replay: { grain: 'daily' },
  });

  /** جلسه‌ای با همان همه‌چیز، فقط دید بازار و قیود ریسکش فرق دارد. */
  const sessionWith = (outlook, risk = TIGHT_RISK) => {
    const made = createPortfolioMission(baseSession, missionInput(outlook, risk));
    if (!made.ok) throw new Error(`مأموریت چیدمان ساخته نشد: ${made.why}`);
    return { ...baseSession, lockedMission: made.mission };
  };

  const session = sessionWith(BULLISH_OUTLOOK);
  const evidence = {
    ok: true,
    now: { ...at },
    rows: contracts.flatMap((contract) => ['buy', 'sell'].map((side) => {
      const executableQty = Math.floor(bookCapacity(contract.quote.book, side, 0, Infinity, 0.5));
      const execution = walkBook(contract.quote.book, executableQty, side, 0, 0.5);
      return {
        candidateId: `${contract.ins}:${side}`, ins: contract.ins, side,
        verdict: 'accepted', accepted: true, executableQty,
        execution: {
          vwap: execution.vwap, top: execution.top, filled: execution.filled,
          levels: execution.levels, maxBookTakePct: 50,
        },
        quality: { candidate: executable, book: executable },
      };
    })),
  };
  const candidateSet = portfolioCandidates(
    session, [byId('long-call'), byId('short-strangle')], evidence,
  );

  /** طرح ورود و مبنای سرمایهٔ یک خانوادهٔ استراتژی. */
  const planFor = (defId, forSession = session) => {
    const candidate = candidateSet.candidates.find((row) => row.defId === defId);
    const entry = portfolioEntryPlan(forSession, candidateSet, evidence, candidate.id);
    return { entry, capital: portfolioCapitalRequirement(forSession, candidateSet, evidence, entry) };
  };

  return {
    at, observed, executable, contracts, capitalInputs, baseSession,
    missionInput, sessionWith, session, evidence, candidateSet, planFor,
    longCall: planFor('long-call'),
    strangle: planFor('short-strangle'),
  };
}
