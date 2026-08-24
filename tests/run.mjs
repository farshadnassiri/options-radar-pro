// آزمون صحت‌سنجی موتور.
//
// قاعده کار: تا این آزمون‌ها پاس نشوند، هیچ استراتژی تازه‌ای اضافه نمی‌شود.
// هر کدام یک ادعای مستقل را می‌سنجد و هیچ‌کدام به شبکه نیاز ندارد.
//
// اجرا:  node tests/run.mjs

import fs from 'node:fs';
import path from 'node:path';
import { bsPrice, bsGreeks, impliedVol, probBelow, probAbove, histVol, npdf, d1d2, ncdf, ninv, priceQuantile } from '../core/bs.mjs';
import { grossCash, entryFees, analyzePayoff, signedQty, pnlAtExpiry } from '../core/payoff.mjs';
import { analyzeMixed } from '../core/mixed.mjs';
import {
  initialMargin, requiredMargin, minMargin, verifyMargin, impliedUnderlying,
  coverage, strategyMargin, capitalBase, marginBase, DEFAULT_PARAMS,
} from '../core/margin.mjs';
import { walkBook, resolvePrice, maxSize, bookCapacity } from '../core/exec.mjs';
import {
  evaluate, profitRegions, probOfProfit, breakevenMetrics,
  legValueSlots, LEG_VALUE_SLOTS, marginPartSlots, MARGIN_PART_SLOTS,
  marginPartDescriptors, columnsForStrategy, COLUMNS,
} from '../core/evaluate.mjs';
import { CATALOG, buildLegs, byId } from '../strategies/catalog.mjs';
import { flattenActiveContracts, generateHistoricalCombos as histCombos } from '../core/history.mjs';
import { defaults, SCHEMA, feesOf, assetClassMap, assetClassOf } from '../core/settings.mjs';
import {
  FORMULAS, FORMULA_GROUPS, STRATEGY_FORMULAS, SYMBOLS, referencedKeys, strategyFormula,
} from '../core/formulas.mjs';
import {
  buildChain, underlyingList, chainStats, legContractSize, comboContractSize,
  withoutBlockedExpiries,
} from '../core/chain.mjs';
import { scan as scanFn, scanAll, generateCombos, unexecutableReason, blockedExpirySet, expiryBlocked, emptyFunnel, passesFilters } from '../core/scan.mjs';
import { markToMarket, rollAnalysis, closeValuation } from '../core/positions.mjs';
import { timeMachine } from '../core/timemachine.mjs';
import { jalaliToGregorian, gregorianToJalali, parseJalali, todayJalali } from '../core/jalali.mjs';
import { validIns, validCompactDate, historicalTradesPath, parseInsList, safeStaticPath, readBody, BodyTooLarge } from '../server/guard.mjs';
import { evictOldest } from '../server/cache.mjs';
import { watchBackoffSec } from '../server/backoff.mjs';
import { fmt as uiFmt, axisNum, toEnDigits, faAgo, faClock, humanizeUpstreamError, coverageInfo, kpiTone, signTone, pageTitle, normFa } from '../ui/fmt.mjs';
import { moveColumn, insertColumn, changedIds, heatRamp } from '../ui/table.mjs';
import { moveTo as enhanceMoveTo, cellValue as enhanceCellValue } from '../ui/table-enhance.mjs';
import { sameUnderlyingCandidates, compareLabel, compareFullLabel, MAX_COMPARE } from '../ui/compare.mjs';
import { strandedKeys } from '../ui/expiries.mjs';
import { icon, GROUP_ICON, TAB_ICON, sectionIcon } from '../ui/icons.mjs';
import { canHandoff, handoffPlan, historyHandoffPlan, stashHandoff, takeHandoff, openHandoffPage, goHandoff } from '../ui/handoff.mjs';
import {
  ivParams, legDaysToExpiry, legIvPct, legIvList, meanIvPct, ivSummary,
  annotateDailyIv, annotateIntradayIv, annotateBucketIv, IV_PARAMS,
} from '../core/leg-iv.mjs';
import {
  scenarioLadder, sensitivityGrid, sensitivityAxis, bookDepthRisk,
  SENS_AXES, SENS_METRICS,
} from '../core/scenario.mjs';
import { csvCell, numericCell, toCsv, stamp } from '../ui/export.mjs';
import { cell as wbCell, sheet as wbSheet, sheetParts as wbParts, workbook as wbWrap } from '../ui/workbook.mjs';
import { inflateRawSync } from 'node:zlib';
import { buildBacktestWorkbook } from '../ui/backtest-export.mjs';
import {
  buildXlsx, crc32 as xCrc, colName as xCol, sheetName as xSheetName,
  sheet as xSheet, tidy as xTidy, zip as xZip,
  deflateRaw as xDeflate, stripZlib as xStrip,
} from '../ui/xlsx.mjs';
import {
  GREEKS as GK, greekSeries, greekSummary, legGreekSummary, trackSummary,
  annotateIntradayGreeks, annotateBucketGreeks, greekContribution,
  positionSensitivityGrid, positionSensitivityAxis, ivSnapshot, repriceAt,
} from '../core/greeks-track.mjs';
import {
  DRIVERS, analyzeAttribution, attributeStep, driverTotals, driverPhases,
  dominantDriver, turningPoints, elapsedDays, dailyTrack,
} from '../core/attribution.mjs';
import { ANALYSIS_PANELS, verdictLines } from '../ui/backtest-panels.mjs';
import { mountSubtabs } from '../ui/subtabs.mjs';
import { tehranDateNumber, liveDayOf, liveDayRows, mergeLiveDay, LIVE_DAY_PHASES } from '../core/live-day.mjs';
import { scopeNote, applyLiveScope, SCOPE_OPTIONS, scopeOptionsMarkup } from '../ui/live-scope.mjs';
import { positionGreeksAt, annotateDailyGreeks } from '../core/leg-iv.mjs';
import { createLog } from '../server/errlog.mjs';
import * as uiFmt48 from '../ui/fmt.mjs';
import { GROUPS as STRAT_GROUPS48 } from '../strategies/catalog.mjs';
import {
  historyPrice, normalizeHistoryDate, historyDateLabel, historyDayName,
  replayHistory, summarizeReplay, basisMatrix, entrySensitivity, generateHistoricalCombos,
  historyMarketMetrics, optimizeExitPolicy, rollingEntryMatrix, holdingPeriodProfile,
  replayTradeDetail, strategyLegSnapshots, manualPriceCheck, comboKey, dateParts,
} from '../core/history.mjs';
import {
  replayIntraday, summarizeIntraday, tradeSecond, tradeTimeLabel,
  normalizeTrades, canceledFlag, inIntradaySession,
  bucketIntradayPath, intradayHoldingSummary, timeOfDayProfile, intradayEntryExitProfile,
  ENTRY_EXIT_MIN_BUCKET, INTRADAY_START_SECOND,
} from '../core/backtest.mjs';
import { summarizePortfolio } from '../core/portfolio.mjs';
import { linkLabelKey, emptyReason } from '../ui/feed-state.mjs';
import { BE_SLOTS } from '../core/evaluate.mjs';
import {
  analyzeDailyOpenView, analyzeIntradayOpenView, movingAverage, optionBreakeven, pearson,
  relationMatrix, weightedMean,
} from '../core/open-view.mjs';
import { buildOpenViewWorkbook } from '../ui/open-view-export.mjs';
import {
  activeLiveTrades, breadthInstruments, liveOptionTape, liveQuoteIv, liveReferenceTape,
  marketBreadthSnapshot, marketBreadthTimeline, summarizeLiveTrades,
} from '../core/live-market.mjs';
import {
  dashboardScope, decisionDashboardSnapshot, pctVsYesterday,
  activeOptionsBoard, contractBreakeven, moneynessDistribution, BOARD_METRICS,
  strikeLadder, maxPain, termStructure,
} from '../core/decision-dashboard.mjs';

let pass = 0, fail = 0;
const results = [];

/**
 * خواندن متن یک فایل پروژه برای ادعاهای «کد این را دارد».
 *
 * پایان‌خط همیشه `\n` می‌شود. چرا لازم است: بیش از پنجاه ادعا در این
 * فایل، متنِ منبع را با الگو می‌سنجند و چند تایشان `\n` را صریح در الگو
 * دارند. روی ویندوز با `core.autocrlf=true` همان فایل‌ها `\r\n` دارند و آن
 * الگوها بی‌صدا رد می‌شوند — سیزده قابلیتِ کاملاً سالم «خراب» گزارش
 * می‌شدند و `node tests/run.mjs` که پیش از هر پوش الزامی است، هرگز سبز
 * نمی‌شد.
 *
 * `.gitattributes` ریشه را می‌بندد؛ این تابع لایهٔ دوم است، برای
 * checkoutهایی که از قبل ساخته شده‌اند. الگوی تازه‌ای هم که فردا کسی با
 * `\n` بنویسد، دیگر نمی‌تواند این کلاس خطا را برگرداند.
 */
const readSrc = (relative) => fs
  .readFileSync(new URL(relative, import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function check(name, cond, detail = '') {
  if (cond) { pass += 1; results.push(['✔', name, detail]); }
  else { fail += 1; results.push(['✘', name, detail]); }
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
function group(t) { results.push(['—', t, '']); }

// ═══════════════════════════ ۱. موتور بلک-شولز ═══════════════════════════
group('۱. بلک-شولز و یونانی');
{
  const S = 10000, K = 11000, T = 0.25, r = 0.30, q = 0.05, sig = 0.65;
  const c = bsPrice('call', S, K, T, r, q, sig);
  const p = bsPrice('put', S, K, T, r, q, sig);
  check('برابری خرید و فروش', near(c - p, S * Math.exp(-q * T) - K * Math.exp(-r * T), 1e-8),
    `اختلاف ${(c - p - (S * Math.exp(-q * T) - K * Math.exp(-r * T))).toExponential(2)}`);

  for (const kind of ['call', 'put']) {
    const g = bsGreeks(kind, S, K, T, r, q, sig);
    const h = S * 1e-4;
    const dNum = (bsPrice(kind, S + h, K, T, r, q, sig) - bsPrice(kind, S - h, K, T, r, q, sig)) / (2 * h);
    const gNum = (bsPrice(kind, S + h, K, T, r, q, sig) - 2 * bsPrice(kind, S, K, T, r, q, sig)
      + bsPrice(kind, S - h, K, T, r, q, sig)) / (h * h);
    const vNum = (bsPrice(kind, S, K, T, r, q, sig + 0.005) - bsPrice(kind, S, K, T, r, q, sig - 0.005)) / 1;
    const ht = 1e-5;
    const tNum = -((bsPrice(kind, S, K, T + ht, r, q, sig) - bsPrice(kind, S, K, T - ht, r, q, sig)) / (2 * ht)) / 365;
    const rNum = (bsPrice(kind, S, K, T, r + 0.005, q, sig) - bsPrice(kind, S, K, T, r - 0.005, q, sig)) / 1;
    check(`دلتا ${kind}`, near(g.delta, dNum, 1e-4), `${g.delta.toFixed(6)} ~ ${dNum.toFixed(6)}`);
    check(`گاما ${kind}`, near(g.gamma, gNum, 1e-3));
    check(`وگا ${kind}`, near(g.vega, vNum, 1e-3));
    check(`تتا ${kind}`, near(g.theta, tNum, 1e-4), `${g.theta.toFixed(3)} ~ ${tNum.toFixed(3)}`);
    check(`رو ${kind}`, near(g.rho, rNum, 1e-3));
  }

  for (const kind of ['call', 'put']) {
    const mkt = bsPrice(kind, S, K, T, r, q, 0.87);
    const iv = impliedVol(kind, mkt, S, K, T, r, q, { lo: 0.01, hi: 5 });
    check(`رفت و برگشت تلاطم ضمنی ${kind}`, near(iv, 0.87, 1e-4), `${iv.toFixed(6)}`);
  }
  check('تلاطم ضمنی زیر ارزش ذاتی → نامعلوم', !Number.isFinite(impliedVol('call', 1, 20000, 10000, 0.5, 0.3, 0, {})));

  const closes = Array.from({ length: 60 }, (_, i) => 1000 * Math.exp(0.01 * Math.sin(i)));
  check('تلاطم تاریخی عدد متناهی می‌دهد', Number.isFinite(histVol(closes, 240)));

  // معکوس نرمال استاندارد (برای صدک قیمت — قلم الف-۱، تصویر آینده)
  check('ninv(۰٫۵) صفر است', near(ninv(0.5), 0, 1e-9), ninv(0.5));
  for (const x of [-2.5, -1, -0.3, 0.7, 1.8, 3]) {
    check(`رفت و برگشت ninv(ncdf(${x}))`, near(ninv(ncdf(x)), x, 1e-6), ninv(ncdf(x)));
  }
  check('ninv بیرون از (۰،۱) نامعلوم می‌دهد', !Number.isFinite(ninv(0)) && !Number.isFinite(ninv(1)) && !Number.isFinite(ninv(-0.1)));

  // صدک قیمت: عکس probBelow است
  {
    const S2 = 100000, T2 = 30 / 365, sig2 = 0.5;
    for (const p of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const L = priceQuantile(S2, p, T2, sig2);
      check(`صدک ${p * 100}٪ با probBelow سازگار است`, near(probBelow(S2, L, T2, sig2), p, 1e-6),
        `${probBelow(S2, L, T2, sig2)} ~ ${p}`);
    }
    const L05 = priceQuantile(S2, 0.5, T2, sig2);
    check('میانه توزیع لگاریتم-نرمال زیر قیمت پایه است (روند صفر یعنی میانگین نه میانه)',
      L05 < S2, L05);
    const levels = [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => priceQuantile(S2, p, T2, sig2));
    check('صدک‌ها یکنوا صعودی‌اند', levels.every((v, i) => i === 0 || v > levels[i - 1]), levels.join(' , '));
  }
}

// ═══════════════════════════ ۲. موتور بازده ═══════════════════════════
group('۲. بازده در سررسید — بدون کارمزد');
{
  const size = 1000;
  const mk = (kind, side, strike, price, ratio = 1) => ({ kind, side, strike, price, ratio, size });

  // کاوردکال: سهم ۱۰۰۰، فروش کال ۱۱۰۰ به ۵۰
  {
    const legs = [{ kind: 'underlying', side: 'buy', price: 1000, ratio: 1, size }, mk('call', 'sell', 1100, 50)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('کاوردکال سربه‌سری ۹۵۰', near(an.breakevens[0], 950), `${an.breakevens}`);
    check('کاوردکال بیشترین سود ۱۵۰٫۰۰۰', near(an.maxProfit, 150000));
    check('کاوردکال بیشترین زیان ۹۵۰٫۰۰۰', near(an.maxLoss, 950000));
    check('کاوردکال سود محدود', !an.unlimitedProfit);
  }

  // اسپرد صعودی کال: خرید ۱۰۰ به ۱۲، فروش ۱۲۰ به ۵
  {
    const legs = [mk('call', 'buy', 100, 12), mk('call', 'sell', 120, 5)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('اسپرد صعودی بدهکار ۷٫۰۰۰', near(grossCash(legs), -7000));
    check('اسپرد صعودی سربه‌سری ۱۰۷', near(an.breakevens[0], 107), `${an.breakevens}`);
    check('اسپرد صعودی بیشترین سود ۱۳٫۰۰۰', near(an.maxProfit, 13000));
    check('اسپرد صعودی بیشترین زیان ۷٫۰۰۰', near(an.maxLoss, 7000));
  }

  // کندور آهنی: خرید پوت ۸۰ به ۱، فروش پوت ۹۰ به ۳، فروش کال ۱۱۰ به ۳، خرید کال ۱۲۰ به ۱
  {
    const legs = [mk('put', 'buy', 80, 1), mk('put', 'sell', 90, 3), mk('call', 'sell', 110, 3), mk('call', 'buy', 120, 1)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('کندور آهنی بستانکار ۴٫۰۰۰', near(grossCash(legs), 4000));
    check('کندور آهنی دو سربه‌سری ۸۶ و ۱۱۴',
      an.breakevens.length === 2 && near(an.breakevens[0], 86) && near(an.breakevens[1], 114), `${an.breakevens}`);
    check('کندور آهنی بیشترین سود ۴٫۰۰۰', near(an.maxProfit, 4000));
    check('کندور آهنی بیشترین زیان ۶٫۰۰۰', near(an.maxLoss, 6000));
  }

  // باترفلای کال خرید: ۹۰ به ۱۲، دو تا ۱۰۰ به ۶، ۱۱۰ به ۲
  {
    const legs = [mk('call', 'buy', 90, 12), mk('call', 'sell', 100, 6, 2), mk('call', 'buy', 110, 2)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('باترفلای بدهکار ۲٫۰۰۰', near(grossCash(legs), -2000));
    check('باترفلای بیشترین سود ۸٫۰۰۰ سر ۱۰۰', near(an.maxProfit, 8000) && near(an.atMaxProfit, 100));
    check('باترفلای دو سربه‌سری ۹۲ و ۱۰۸',
      an.breakevens.length === 2 && near(an.breakevens[0], 92) && near(an.breakevens[1], 108), `${an.breakevens}`);
    check('باترفلای بیشترین زیان ۲٫۰۰۰', near(an.maxLoss, 2000));
  }

  // استرادل فروش: زیان دو طرف نامحدود
  {
    const legs = [mk('call', 'sell', 100, 8), mk('put', 'sell', 100, 7)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('استرادل فروش زیان نامحدود', an.unlimitedLoss);
    check('استرادل فروش سربه‌سری ۸۵ و ۱۱۵',
      near(an.breakevens[0], 85) && near(an.breakevens[1], 115), `${an.breakevens}`);
    check('استرادل فروش بیشترین سود ۱۵٫۰۰۰', near(an.maxProfit, 15000));
  }

  // نسبت‌اسپرد کال: خرید ۱۰۰، فروش دو تا ۱۱۰ → سود نامحدود ندارد، زیان نامحدود دارد
  {
    const legs = [mk('call', 'buy', 100, 10), mk('call', 'sell', 110, 5, 2)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('نسبت‌اسپرد زیان نامحدود', an.unlimitedLoss);
    check('نسبت‌اسپرد شیب راست منفی', an.slopeRight < 0);
  }
}

group('۳. بازده در سررسید — با کارمزد تسویه');
{
  const size = 1000;
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const legs = [
    { kind: 'underlying', side: 'buy', price: 1000, ratio: 1, size },
    { kind: 'call', side: 'sell', strike: 1100, price: 50, ratio: 1, size },
  ];
  const net = grossCash(legs) - entryFees(legs, fees);
  const an = analyzePayoff(legs, net, { fees });

  // سناریوی اعمال: سهم در قیمت اعمال تحویل می‌رود، پس فقط کارمزد اعمال
  const called = an.at(1200);
  const expectCalled = 1100 * size - 1100 * size * fees.exercise
    - 1000 * size * (1 + fees.buyStock) + 50 * size * (1 - fees.option);
  check('سناریوی اعمال — فقط کارمزد اعمال', near(called, expectCalled, 1e-9),
    `${Math.round(called).toLocaleString()} ~ ${Math.round(expectCalled).toLocaleString()}`);

  // سناریوی ایستا: سهم می‌ماند و برای نقد کردن، کارمزد فروش بازار می‌دهد
  const stat = an.at(1050);
  const expectStat = 1050 * size * (1 - fees.sellStock)
    - 1000 * size * (1 + fees.buyStock) + 50 * size * (1 - fees.option);
  check('سناریوی ایستا — کارمزد فروش بازار', near(stat, expectStat, 1e-9),
    `${Math.round(stat).toLocaleString()} ~ ${Math.round(expectStat).toLocaleString()}`);
  check('کارمزد، سربه‌سری را بالا می‌برد', an.breakevens[0] > 950, `${an.breakevens[0].toFixed(2)}`);
}

// ═══════════════════════════ ۴. وجه تضمین در برابر تابلو ═══════════════════════════
group('۴. وجه تضمین — شش مشاهده تابلو');
{
  // این fixture قدیمی بر مبنای رفتار تابلوی کارگزاری (B×S) ثبت شده است؛
  // پیش‌فرض موتور اکنون متن ضوابط (B×K) است، پس حالت سازگاری باید صریح باشد.
  const boardParams = { ...DEFAULT_PARAMS, bBasis: 'SPOT' };
  // شش مشاهدهٔ دستیِ تابلو، در دو برداشت (A و B). این‌ها داده‌اند نه محاسبه:
  // هرچه اینجاست از تابلو خوانده شده و هیچ عددش بازسازی نشده.
  //
  // ⚠ بدهی شناخته‌شده: این جدول **زمان و منبع برداشت را ثبت نکرده**. بدون
  // آن، هیچ‌کس نمی‌تواند یک مشاهدهٔ مشکوک را با تابلوی همان لحظه بسنجد؛
  // تنها کاری که می‌شود کرد حدس‌زدن است، و حدس در فایل آزمون بدتر از
  // نبودن داده است. برداشت بعدی باید `at` (تاریخ و ساعت) و `src` (نشانی
  // صفحه) هم داشته باشد.
  //
  // یک ناسازگاری معلوم و عمداً پذیرفته‌شده: در `ضهرم5033` اتحاد
  // `RM = IM + پریمیوم × اندازه` برقرار نیست —
  //   ۵٬۲۰۰٬۰۰۰ + ۱٬۹۰۱ × ۱٬۰۰۰ = ۷٬۱۰۱٬۰۰۰
  //   رقم ثبت‌شدهٔ تابلو            = ۷٬۰۶۱٬۰۰۰
  //   اختلاف                        =    ۴۰٬۰۰۰ ریال
  // احتمال بیشتر، ناهم‌زمانیِ خودِ برداشت است (پریمیوم و وجه تضمین در دو
  // لحظه خوانده شده‌اند)، نه خطای فرمول — چون همان فرمول در پنج مشاهدهٔ
  // دیگر دقیق درمی‌آید. تا وقتی برداشتِ زمان‌دار جایگزینش نشده، آزمون
  // صریحاً «۵ از ۶» را انتظار دارد و ردیف ناسازگار را با `!` گزارش
  // می‌کند — نه اینکه پنهانش کند و نه اینکه عدد را به میل خودش اصلاح کند.
  const BOARD = [
    { name: 'ضهرم5034', ua: 'اهرم', snap: 'A', kind: 'call', K: 50000, size: 1000, prem: 1098, im: 4270000, rm: 5368000 },
    { name: 'ضهرم5033', ua: 'اهرم', snap: 'A', kind: 'call', K: 46000, size: 1000, prem: 1901, im: 5200000, rm: 7061000 },
    { name: 'ضخود5052', ua: 'خودرو', snap: 'A', kind: 'call', K: 500, size: 1000, prem: 41, im: 110000, rm: 151000 },
    { name: 'ضفزر505', ua: 'فزر', snap: 'A', kind: 'call', K: 140000, size: 1000, prem: 22876, im: 32290000, rm: 55166000 },
    { name: 'ضهرم6046', ua: 'اهرم', snap: 'B', kind: 'call', K: 46000, size: 1000, prem: 3980, im: 4320000, rm: 8300000 },
    { name: 'ضفزر505', ua: 'فزر', snap: 'B', kind: 'call', K: 140000, size: 1000, prem: 22049, im: 31390000, rm: 53439000 },
  ];

  let idOk = 0;
  const ranges = {};
  for (const b of BOARD) {
    const identity = b.im + b.prem * b.size;
    const ok = Math.abs(identity - b.rm) / b.rm <= 5e-3;
    if (ok) idOk += 1;
    else results.push(['!', `اتحاد RM در ${b.name} برقرار نیست`,
      `محاسبه ${identity.toLocaleString()} در برابر تابلو ${b.rm.toLocaleString()}`]);

    const inv = impliedUnderlying({ K: b.K, size: b.size, kind: b.kind, imRef: b.im, params: boardParams });
    check(`بازتولید IM تابلو — ${b.name} ${b.snap}`, inv.ok,
      inv.ok ? `S سازگار ${Math.round(inv.lo).toLocaleString()} تا ${Math.round(inv.hi).toLocaleString()} | جزء ${inv.binding}` : 'هیچ S سازگاری نیست');
    if (inv.ok) {
      const k = `${b.ua}|${b.snap}`;
      ranges[k] = ranges[k] || [];
      ranges[k].push([inv.lo, inv.hi, b.name]);
    }
  }
  check('اتحاد RM = IM + پریمیوم × اندازه، در ۵ مشاهده از ۶', idOk === 5, `${idOk} از ۶`);

  // قراردادهای یک پایه در یک برداشت باید بازه S مشترک داشته باشند
  for (const [k, list] of Object.entries(ranges)) {
    if (list.length < 2) continue;
    const lo = Math.max(...list.map((x) => x[0]));
    const hi = Math.min(...list.map((x) => x[1]));
    check(`بازه S مشترک — ${k}`, lo <= hi,
      lo <= hi ? `${Math.round(lo).toLocaleString()} تا ${Math.round(hi).toLocaleString()}` : 'ناسازگار');
  }

  // تطبیق مستقیم با قیمت پایه معلوم
  const v = verifyMargin({ S: 156950, K: 140000, size: 1000, kind: 'call', optClose: 22049,
    imRef: 31390000, rmRef: 53439000, params: boardParams });
  check('تطبیق کامل ضفزر با S معلوم', v.imOk && v.rmOk && v.identityOk,
    `IM ${Math.round(v.im).toLocaleString()} | RM ${Math.round(v.rm).toLocaleString()} | جزء ${v.binding}`);

  check('گردکردن فقط روی وجه تضمین اولیه است',
    initialMargin(156950, 140000, 1000, 'call', boardParams) % DEFAULT_PARAMS.C === 0
    && requiredMargin(156950, 140000, 1000, 'call', 22049, boardParams) % DEFAULT_PARAMS.C !== 0);
  check('حداقل وجه تضمین ۷۰ درصد لازم است', near(minMargin(1000000), 700000));
  check('وجه تضمین در قیمت پایه یکنواست',
    initialMargin(100000, 50000, 1000, 'call') <= initialMargin(120000, 50000, 1000, 'call'));
}

// ═══════════════════════════ ۵. پوشش و قاعده بستانکار ═══════════════════════════
group('۵. پوشش موقعیت و قاعده بستانکار در برابر بدهکار');
{
  const size = 1000, S = 100;
  const mk = (kind, side, strike, price, ratio = 1, days = 30) => ({ kind, side, strike, price, ratio, size, days });
  const M = (legs) => strategyMargin(legs, { S, closes: {}, creditMode: 'FULL' });

  // چهار اسپرد عمودی: جهت و بستانکاری یکی نیستند
  const bullCall = [mk('call', 'buy', 100, 12), mk('call', 'sell', 120, 5)];
  const bearCall = [mk('call', 'sell', 100, 12), mk('call', 'buy', 120, 5)];
  const bullPut = [mk('put', 'buy', 80, 2), mk('put', 'sell', 100, 9)];
  const bearPut = [mk('put', 'sell', 80, 2), mk('put', 'buy', 100, 9)];

  check('اسپرد صعودی کال بدهکار است → وجه تضمین صفر', !M(bullCall).isCredit && M(bullCall).margin === 0);
  check('اسپرد نزولی کال بستانکار است → وجه تضمین دارد', M(bearCall).isCredit && M(bearCall).margin > 0);
  check('اسپرد صعودی پوت بستانکار است → وجه تضمین دارد، هرچند صعودی',
    M(bullPut).isCredit && M(bullPut).margin > 0);
  check('اسپرد نزولی پوت بدهکار است → وجه تضمین صفر، هرچند نزولی',
    !M(bearPut).isCredit && M(bearPut).margin === 0);

  // پوشش کامل در برابر ناقص
  check('اسپرد نزولی کال، پوشش کامل', coverage(bearCall).state === 'full');
  const ratio = [mk('call', 'buy', 100, 10), mk('call', 'sell', 110, 5, 2)];
  check('نسبت‌اسپرد، پوشش ناقص', coverage(ratio).state === 'partial', `نسبت لخت ${coverage(ratio).nakedRatio}`);
  check('نسبت‌اسپرد بدهکار هم وجه تضمین می‌گیرد، چون بخشی لخت است',
    M(ratio).margin > 0, `وجه تضمین ${Math.round(M(ratio).margin).toLocaleString()}`);
  // و یادداشتش هم باید همین را بگوید. «بدهکار یعنی بی‌تعهد» فقط برای
  // ترکیب پوشیده درست است؛ متن قدیمی همان جمله را برای نسبت‌اسپرد هم چاپ
  // می‌کرد، درست کنار وجه تضمینی که خودش گزارش کرده بود.
  check('و یادداشتش «وجه تضمین گرفته نمی‌شود» نمی‌گوید',
    M(ratio).note.includes('فروش برهنه'), M(ratio).note);
  check('ترکیب بدهکارِ پوشیده همچنان «وجه تضمین گرفته نمی‌شود» می‌گیرد',
    M(bearPut).margin === 0 && M(bearPut).note.includes('گرفته نمی‌شود'), M(bearPut).note);

  // کاوردکال: پوشش با سهم پایه، وجه تضمین نقدی صفر
  const cc = [{ kind: 'underlying', side: 'buy', price: 100, ratio: 1, size }, mk('call', 'sell', 110, 5)];
  check('کاوردکال، وجه تضمین نقدی ندارد', M(cc).margin === 0 && coverage(cc).state === 'full');

  // پوشش با سررسید نزدیک‌تر معتبر نیست
  const badCal = [mk('call', 'buy', 100, 5, 1, 10), mk('call', 'sell', 100, 8, 1, 60)];
  check('پای محافظ با سررسید نزدیک‌تر، پوشش نیست', coverage(badCal).state === 'naked');

  // تقویمی درست: خرید دور، فروش نزدیک
  const cal = [mk('call', 'sell', 100, 5, 1, 20), mk('call', 'buy', 100, 9, 1, 80)];
  check('تقویمی، پوشش کامل', coverage(cal).state === 'full');
  check('تقویمی بدهکار → وجه تضمین صفر، ولی تضمین شرطی مثبت',
    M(cal).margin === 0 && M(cal).conditionalMargin > 0,
    `شرطی ${Math.round(M(cal).conditionalMargin).toLocaleString()}`);

  // سه حالت مقدار وجه تضمین بستانکار
  const full = strategyMargin(bearCall, { S, closes: {}, creditMode: 'FULL' }).margin;
  const less = strategyMargin(bearCall, { S, closes: {}, creditMode: 'LESS_WIDTH' }).margin;
  const width = strategyMargin(bearCall, { S, closes: {}, creditMode: 'WIDTH' }).margin;
  check('سه حالت وجه تضمین بستانکار، سه عدد متفاوت',
    full > less && less >= 0 && width > 0,
    `الف ${Math.round(full).toLocaleString()} | ب ${Math.round(less).toLocaleString()} | ج ${Math.round(width).toLocaleString()}`);
  // ——— قاعدهٔ ترکیبی فروش هم‌زمان کال و پوت ———
  //
  // ضوابط، استرادل و استرانگل هم‌ماه را یک راهبرد می‌شناسد: بزرگ‌ترِ وجه
  // تضمین لازم دو پا + پریمیوم قراردادی که IM کمتری دارد. جمع دو پا فقط
  // سناریوی دستی است.
  const strangle = [mk('call', 'sell', 110, 5), mk('put', 'sell', 90, 4)];
  const cMax = strategyMargin(strangle, { S, closes: { 0: 5, 1: 4 } });
  const cSum = strategyMargin(strangle, { S, closes: { 0: 5, 1: 4 }, nakedComboMargin: 'SUM' });
  check('پیش‌فرض فروش هم‌زمان کال و پوت، قاعدهٔ راهبردی ضوابط است',
    cMax.comboRule === 'MAX_PLUS_PREMIUM');
  check('قاعدهٔ متن ضوابط، وجه تضمین کمتری می‌دهد', cMax.margin < cSum.margin,
    `جمع ${Math.round(cSum.margin).toLocaleString()} | ضوابط ${Math.round(cMax.margin).toLocaleString()}`);
  check('و دقیقاً برابر «بزرگ‌ترِ RM + پریمیوم قرارداد با IM کمتر» است',
    Math.abs(cMax.margin - (Math.max(
      requiredMargin(S, 110, size, 'call', 5), requiredMargin(S, 90, size, 'put', 4),
    ) + 4 * size)) < 1e-6, `${Math.round(cMax.margin).toLocaleString()}`);
  check('برچسب قاعدهٔ به‌کاررفته گزارش می‌شود', cMax.comboRule === 'MAX_PLUS_PREMIUM');
  check('استرادل/استرانگل هم‌اندازه فقط یک جزء وجه تضمین دارد',
    cMax.components.length === 1 && cMax.components[0].type === 'combo'
    && near(cMax.components[0].amount, cMax.margin));

  // بازنویسی قدیمی max(IM)+هر دو پریمیوم همیشه هم‌ارز فرمول ضوابط نیست.
  // این نمونه عمداً پریمیوم پای با IM کمتر را بزرگ می‌گیرد تا دو فرمول از
  // هم جدا شوند: متن همان پریمیوم پوت را صریحاً اضافه می‌کند.
  const premiumCross = [mk('call', 'sell', 110, 1), mk('put', 'sell', 90, 30)];
  const cross = strategyMargin(premiumCross, { S, closes: { 0: 1, 1: 30 } });
  const literal = Math.max(
    requiredMargin(S, 110, size, 'call', 1), requiredMargin(S, 90, size, 'put', 30),
  ) + 30 * size;
  const oldRewrite = Math.max(
    initialMargin(S, 110, size, 'call'), initialMargin(S, 90, size, 'put'),
  ) + 31 * size;
  check('فرمول مستقیم ضوابط جای بازنویسی نامعتبر قبلی را گرفته است',
    cross.margin === literal && cross.margin !== oldRewrite,
    `${cross.margin.toLocaleString()} در برابر بازنویسی ${oldRewrite.toLocaleString()}`);

  const uneven = [mk('call', 'sell', 110, 5, 2), mk('put', 'sell', 90, 4)];
  const unevenMargin = strategyMargin(uneven, { S, closes: { 0: 5, 1: 4 } });
  check('در نسبت نابرابر، یک جفت ترکیبی و مازاد کال دو جزء جدا هستند',
    unevenMargin.comboRule === 'MAX_PLUS_PREMIUM' && unevenMargin.components.length === 2
    && near(unevenMargin.components.reduce((a, x) => a + x.amount, 0), unevenMargin.margin));
  check('تضمین لازم کل، نسبت هر پای فروش را حساب می‌کند',
    unevenMargin.requiredTotal === 2 * requiredMargin(S, 110, size, 'call', 5)
      + requiredMargin(S, 90, size, 'put', 4));
  // ترکیبی که متن ضوابط دربارهٔ آن حرفی نزده، از قاعده بیرون می‌ماند
  const twoCalls = [mk('call', 'sell', 110, 5), mk('call', 'sell', 120, 3)];
  check('دو کالِ لخت مشمول قاعدهٔ ترکیبی نیست — حدس زدن، اختراع عدد است',
    strategyMargin(twoCalls, { S, closes: { 0: 5, 1: 3 }, nakedComboMargin: 'MAX_PLUS_PREMIUM' }).comboRule === 'SUM');
  const crossExpiry = [mk('call', 'sell', 110, 5, 1, 30), mk('put', 'sell', 90, 4, 1, 90)];
  check('کال و پوت با دو سررسید هم بیرون می‌ماند',
    strategyMargin(crossExpiry, { S, closes: { 0: 5, 1: 4 }, nakedComboMargin: 'MAX_PLUS_PREMIUM' }).comboRule === 'SUM');
  const inverted = [mk('call', 'sell', 90, 5), mk('put', 'sell', 110, 4)];
  check('ترکیب اعمال‌وارونه، استرانگل مقرراتی فرض نمی‌شود',
    strategyMargin(inverted, { S, closes: { 0: 5, 1: 4 } }).comboRule === 'SUM');

  // ——— مبنای جزء B ———
  //
  // متن ضوابط B×K می‌نویسد. حالت B×S برای سازگاری با نمونه‌های قدیمی
  // تابلو باقی است، ولی پیش‌فرض مقرراتی قیمت اعمال است.
  const pSpot = { A: 0.20, B: 0.10, C: 10000, maint: 0.70, bBasis: 'SPOT' };
  const pStrike = { ...pSpot, bBasis: 'STRIKE' };
  check('پیش‌فرض جزء B، قیمت اعمال است',
    marginBase(100, 300, size, 'call').legB === marginBase(100, 300, size, 'call', pStrike).legB);
  check('با مبنای قیمت اعمال، جزء B عدد دیگری می‌شود',
    marginBase(100, 300, size, 'call', pStrike).legB === 0.10 * 300 * size);
  check('و آن اختلاف به وجه تضمین اولیه می‌رسد',
    initialMargin(100, 300, size, 'call', pStrike) > initialMargin(100, 300, size, 'call', pSpot),
    `${initialMargin(100, 300, size, 'call', pSpot).toLocaleString()} در برابر ${initialMargin(100, 300, size, 'call', pStrike).toLocaleString()}`);
  check('در حالت هم‌ارز — قیمت اعمال برابر قیمت پایه — دو مبنا یکی می‌شوند',
    initialMargin(100, 100, size, 'put', pStrike) === initialMargin(100, 100, size, 'put', pSpot));

}

group('۶. مخرج بازده');
{
  const size = 1000;
  const debit = capitalBase({ legs: [{ kind: 'call' }], netCash: -7000, marginNet: 0, maxLoss: 7000 });
  check('بدهکار → مخرج، بدهکار خالص', debit.kind === 'DEBIT' && debit.value === 7000);

  const credit = capitalBase({ legs: [{ kind: 'call' }], netCash: 4000, marginNet: 2000, maxLoss: 6000 });
  check('بستانکار → مخرج، بیشینه وجه تضمین و بیشترین زیان', credit.value === 6000, credit.label);

  const credit2 = capitalBase({ legs: [{ kind: 'call' }], netCash: 4000, marginNet: 9000, maxLoss: 6000 });
  check('اگر وجه تضمین بزرگ‌تر باشد، همان مخرج است', credit2.value === 9000, credit2.label);

  const stock = capitalBase({ legs: [{ kind: 'underlying' }], netCash: -950000, marginNet: 0, maxLoss: 950000 });
  check('دارای سهم → مخرج، بهای سهم منهای پریمیوم', stock.kind === 'STOCK_NET' && stock.value === 950000);

  // ——— بدهکارِ دارای فروشِ برهنه ———
  //
  // گزارش آزمون واقعی: یک نسبت‌اسپرد پوت با بدهکار خالصِ ۵۵۷ ریال، وجه
  // تضمین ۱۳٬۶۴۲٬۰۰۰ و بیشترین زیانِ ۳۸٬۰۶۵٬۵۵۷، بازده ماهانهٔ ۳۳۱٬۹۰۵٪
  // نشان می‌داد و صدر جدول می‌نشست.
  //
  // ریشه: سمت بدهکار فقط پریمیوم پرداختی را می‌شمرد، انگار «بدهکار» یعنی
  // «بی‌تعهد». با ۵۵۷ ریال نمی‌شود موقعیتی را باز کرد که کارگزار برایش
  // ۱۳٫۶ میلیون بلوکه می‌کند.
  const naked = capitalBase({ legs: [{ kind: 'put' }], netCash: -2000, marginNet: 19004500, maxLoss: 90147000 });
  check('بدهکارِ دارای فروش برهنه، پول بلوکه‌شده را هم می‌شمرد',
    naked.kind === 'DEBIT_BLOCKED' && naked.value === 90147000, naked.label);
  check('و بازده را از عددِ نجومی به عدد واقعی برمی‌گرداند',
    (5000 / naked.value) * 100 < (5000 / 2000) * 100 / 1000);
  // وقتی وجه تضمین از بیشترین زیان بزرگ‌تر است، خودش لنگر می‌شود
  const nakedBigMargin = capitalBase({ legs: [{ kind: 'put' }], netCash: -2000, marginNet: 40000, maxLoss: 30000 });
  check('اگر وجه تضمین از بیشترین زیان بزرگ‌تر باشد، همان مخرج است',
    nakedBigMargin.value === 40000, nakedBigMargin.label);
  // زیان نامحدود عدد نمی‌سازد؛ وجه تضمین تنها لنگر واقعی است
  const nakedUnlimited = capitalBase({ legs: [{ kind: 'call' }], netCash: -2000, marginNet: 25000, maxLoss: Infinity });
  check('با زیان نامحدود، وجه تضمین لنگر می‌ماند و مخرج بی‌نهایت نمی‌شود',
    nakedUnlimited.value === 25000 && Number.isFinite(nakedUnlimited.value));

  // ——— بدهکارِ پوشیده، با وجه تضمین صفر ———
  //
  // مرحلهٔ اول این اصلاح، «بیشینه» را فقط وقتی اعمال می‌کرد که وجه تضمین
  // مثبت باشد، تا اسپرد پوشیده جابه‌جا نشود. حسابرسی نشان داد همان استثنا
  // یک خانوادهٔ کامل را باز می‌گذارد: اسپرد پوت نزولی با بدهکارِ ۸٫۲۴ ریال،
  // وجه تضمین صفر و بیشترین زیانِ ۴٬۴۴۷٫۶۹، بازده ماهانهٔ ۳٬۶۲۳٬۲۶۰٪ می‌داد.
  // وجه تضمین صفر است چون پوشش برقرار است؛ ولی هزینهٔ تسویه در سررسید پول
  // واقعی است و مخرج باید ببیندش.
  const coveredDebit = capitalBase({ legs: [{ kind: 'call' }], netCash: -4100000, marginNet: 0, maxLoss: 5030000 });
  check('اسپرد بدهکارِ پوشیده هم بیشترین زیان را در مخرج می‌آورد',
    coveredDebit.kind === 'DEBIT_BLOCKED' && coveredDebit.value === 5030000, coveredDebit.label);

  const tinyDebit = capitalBase({ legs: [{ kind: 'put' }], netCash: -8.24, marginNet: 0, maxLoss: 4447.69 });
  check('بدهکارِ ناچیز با زیانِ چندصدبرابر، دیگر بازده نجومی نمی‌سازد',
    tinyDebit.value === 4447.69 && (300 / tinyDebit.value) < (300 / 8.24) / 500, tinyDebit.label);

  // و آن‌جا که بدهکاری خودش بزرگ‌ترین جزء است، هیچ‌چیز عوض نمی‌شود
  const plainDebit = capitalBase({ legs: [{ kind: 'call' }], netCash: -4100000, marginNet: 0, maxLoss: 4100000 });
  check('وقتی بدهکاری خودش بزرگ‌ترین جزء است، مخرج همان بدهکاری می‌ماند',
    plainDebit.kind === 'DEBIT' && plainDebit.value === 4100000, plainDebit.label);
}

// ═══════════════════════════ ۷. لایه اجرا ═══════════════════════════
group('۷. دفتر سفارش و حجم');
{
  const book = [
    { level: 1, bid: 100, bidQty: 5, ask: 105, askQty: 4 },
    { level: 2, bid: 98, bidQty: 10, ask: 107, askQty: 10 },
    { level: 3, bid: 95, bidQty: 20, ask: 110, askQty: 20 },
  ];
  const w1 = walkBook(book, 5, 'sell');
  check('فروش ۵ در سطح اول جا می‌شود', w1.full && w1.vwap === 100 && w1.levels === 1);

  const w2 = walkBook(book, 12, 'sell');
  check('فروش ۱۲ باید دو سطح مصرف کند', w2.levels === 2 && near(w2.vwap, (5 * 100 + 7 * 98) / 12, 1e-9),
    `میانگین ${w2.vwap.toFixed(2)}`);
  check('افت مظنه در فروش عمیق منفی است', w2.slipPct < 0, `${w2.slipPct.toFixed(2)}٪`);

  const w3 = walkBook(book, 100, 'buy');
  check('حجم بزرگ‌تر از عمق، کمبود را گزارش می‌کند', !w3.full && w3.short === 66, `کمبود ${w3.short}`);

  const cons = walkBook(book, 4, 'buy', 1);
  check('حالت محافظه‌کار سطح اول را نادیده می‌گیرد', cons.vwap === 107);

  check('ظرفیت دفتر، مستقل از حجم درخواستی است',
    bookCapacity(book, 'sell') === 35 && bookCapacity(book, 'buy') === 34,
    `فروش ${bookCapacity(book, 'sell')} | خرید ${bookCapacity(book, 'buy')}`);
  check('سقف افت مظنه، سطوح دور را کنار می‌گذارد',
    bookCapacity(book, 'sell', 0, 3) === 15, `${bookCapacity(book, 'sell', 0, 3)}`);
  const rp = resolvePrice({ bid: 100, ask: 105, book }, 'sell', { basis: 'BOOK', qty: 2 });
  check('سقف قرارداد از ظرفیت می‌آید نه از حجم پرشده',
    rp.filled === 2 && rp.capacity === 35, `پرشده ${rp.filled} | ظرفیت ${rp.capacity}`);

  const q = { bid: 100, bidQty: 5, ask: 105, askQty: 4, last: 102, close: 101, low: 96, high: 108, book };
  check('مبنای دفتر، ادعای اجرا دارد', resolvePrice(q, 'sell', { basis: 'BOOK', qty: 5 }).executable);
  check('مبنای پایانی، ادعای اجرا ندارد', !resolvePrice(q, 'sell', { basis: 'CLOSE', qty: 5 }).executable);
  check('کمترین قیمت روز، ناهم‌زمان علامت می‌خورد',
    resolvePrice(q, 'sell', { basis: 'LOW', qty: 5 }).simultaneous === false);
  check('میانه مظنه، ادعای اجرا ندارد',
    resolvePrice(q, 'sell', { basis: 'BOOK', execMode: 'MID', qty: 5 }).price === 102.5
    && !resolvePrice(q, 'sell', { basis: 'BOOK', execMode: 'MID', qty: 5 }).executable);
  check('بی‌مظنه، قیمت صفر و کیفیت هیچ',
    resolvePrice({ bid: 0, ask: 0, book: [] }, 'sell', { basis: 'BOOK', qty: 1 }).quality === 'none');
}

// ═══════════════════════════ ۸. احتمال سود ═══════════════════════════
group('۸. احتمال سود از بازه‌های سود');
{
  const size = 1000;
  const mk = (kind, side, strike, price, ratio = 1) => ({ kind, side, strike, price, ratio, size });

  const condor = [mk('put', 'buy', 80, 1), mk('put', 'sell', 90, 3), mk('call', 'sell', 110, 3), mk('call', 'buy', 120, 1)];
  const an = analyzePayoff(condor, grossCash(condor));
  const reg = profitRegions(an);
  check('کندور یک بازه سود دارد', reg.length === 1 && near(reg[0][0], 86) && near(reg[0][1], 114),
    reg.map((r) => `${r[0].toFixed(1)}..${r[1].toFixed(1)}`).join(' , '));
  const p = probOfProfit(an, 100, 30 / 365, 0.5);
  check('احتمال سود کندور بین صفر و صد', p > 0 && p < 100, `${p.toFixed(1)}٪`);

  const strad = [mk('call', 'buy', 100, 8), mk('put', 'buy', 100, 7)];
  const anS = analyzePayoff(strad, grossCash(strad));
  const regS = profitRegions(anS);
  check('استرادل خرید دو بازه سود دارد، دو طرف', regS.length === 2, `${regS.length}`);
  check('احتمال سود استرادل معنی‌دار است',
    probOfProfit(anS, 100, 30 / 365, 0.8) > 0, `${probOfProfit(anS, 100, 30 / 365, 0.8).toFixed(1)}٪`);
}

// ═══════════════════════════ ۹. ارزیاب ردیف ═══════════════════════════
group('۹. ارزیاب ردیف، سرتاسری');
{
  const s = defaults();
  const size = 1000;
  const mkQuote = (bid, ask, extra = {}) => ({
    bid, bidQty: 50, ask, askQty: 50, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    book: [
      { level: 1, bid, bidQty: 5, ask, askQty: 5 },
      { level: 2, bid: bid * 0.98, bidQty: 40, ask: ask * 1.02, askQty: 40 },
    ],
    ...extra,
  });

  // کاوردکال کامل با داده مصنوعی
  const def = byId('covered-call');
  const legs = buildLegs(def, { strikes: [110000], size, days: [30] });
  const quotes = [mkQuote(99000, 100000), mkQuote(4800, 5200)];
  const row = evaluate({
    legs, quotes,
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 3, settings: s, def, underlying: 'نمونه', sigmaHist: 0.6 },
  });

  check('ردیف ساخته شد و اجراپذیر است', row.executable && row.quality === 'exact', row.qualityLabel);
  check('کاوردکال بدهکار خالص است', !row.isCredit && row.netCash < 0);
  check('مخرج سرمایه، بهای سهم منهای پریمیوم', row.capitalKind === 'STOCK_NET', row.capitalLabel);
  check('کاوردکال وجه تضمین نقدی ندارد', row.margin === 0);
  check('بازده دوره مثبت و متناهی', Number.isFinite(row.retMaxPct) && row.retMaxPct > 0, `${row.retMaxPct.toFixed(2)}٪`);
  check('بازده ماهانه با نسبت روز مقیاس می‌خورد', near(row.retMonthPct, row.retMaxPct * 30 / 30, 1e-9));
  check('یونانی‌ها کامل محاسبه شدند', !row.greeksIncomplete && Number.isFinite(row.delta));
  // ردیف برای حجم واقعی کاربر سنجیده می‌شود، پس سقف دلتا هم در تعداد
  // قرارداد ضرب می‌شود: کاوردکالِ سه‌تایی حداکثر سه هزار سهم دلتا دارد.
  check('دلتای کاوردکال بین صفر و اندازه قرارداد ضربدر حجم',
    row.delta > 0 && row.delta < size * row.qty, `${row.delta.toFixed(1)} از ${size * row.qty}`);
  check('احتمال سود محاسبه شد', Number.isFinite(row.popPct), `${row.popPct.toFixed(1)}٪`);
  check('هزینه اجرا تفکیک شده و مثبت است',
    row.execCost > 0 && row.costCommission > 0 && row.costRows.length === 2,
    `کارمزد ${Math.round(row.costCommission).toLocaleString()} | عبور ${Math.round(row.costCrossing).toLocaleString()}`);
  check('سقف حجم و قید مقیدکننده معلوم است', row.maxQty >= 0 && !!row.binding, `${row.maxQty} — ${row.binding}`);
  check('عمق ناکافی برای حجم ۳، در هشدارها دیده می‌شود',
    row.warn.includes('عمق ناکافی') || row.maxQty < 3, row.warn.join(' , ') || 'بی‌هشدار');

  // اسپرد بستانکار: قاعده وجه تضمین و ریسک لنگ‌زدن
  const bc = byId('bear-call-spread');
  const legs2 = buildLegs(bc, { strikes: [100000, 110000], size, days: [30] });
  const row2 = evaluate({
    legs: legs2, quotes: [mkQuote(8000, 8400), mkQuote(3000, 3400)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s, def: bc, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('اسپرد نزولی کال بستانکار است', row2.isCredit, `نقد خالص ${Math.round(row2.netCash).toLocaleString()}`);
  check('بستانکار → وجه تضمین مثبت', row2.margin > 0);
  check('مخرج بستانکار، بیشینه تضمین و بیشترین زیان',
    row2.capitalKind === 'CREDIT' && row2.capital >= row2.maxLoss - 1, row2.capitalLabel);
  check('ریسک لنگ‌زدن علامت خورد', row2.leggingRisk);
  check('نسبت تضمین به زیان گزارش شد', Number.isFinite(row2.marginToMaxLoss), `${row2.marginToMaxLoss.toFixed(2)}`);
  check('چهار قلم هزینه جدا گزارش شد',
    ['costCommission', 'costCrossing', 'costSlippage', 'costFunding'].every((k) => Number.isFinite(row2[k])));

  // مبنای ناهم‌زمان باید هشدار بدهد
  const row3 = evaluate({
    legs: legs2, quotes: [mkQuote(8000, 8400), mkQuote(3000, 3400)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, def: bc, underlying: 'نمونه', sigmaHist: 0.6,
      settings: { ...s, priceBasis: 'HIGH' } },
  });
  check('مبنای بیشترین قیمت روز، هشدار ناهم‌زمانی می‌دهد', row3.warn.includes('قیمت ناهم‌زمان'));
  check('مبنای مرجع، اجراناپذیر علامت می‌خورد', !row3.executable || row3.quality !== 'exact');

  // «اگر همین حالا بگیرم و ببندم چه می‌شود؟» و «اگر با آخرین/پایانی تسویه
  // کنم؟» (خواسته الف-۱، سؤال‌های ۴ و ۵) — بدون کارمزد، عدد دقیق قابل
  // پیش‌بینی است: فروش تهاجمی روی bid پر می‌شود، بستن فوری روی ask.
  const s0 = { ...s, feeOption: 0, feeBuyStock: 0, feeSellStock: 0, feeExercise: 0 };
  const sp = byId('naked-put');
  const legsSp = buildLegs(sp, { strikes: [95000], size, days: [30] });
  const qSp = [mkQuote(8000, 8400, { last: 8300, close: 8100 })];
  const rowSp = evaluate({
    legs: legsSp, quotes: qSp,
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s0, def: sp, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('بستن فوری بدون کارمزد، دقیقاً هزینه اسپرد (bid منهای ask)',
    near(rowSp.instantClosePnl, (8000 - 8400) * size, 1e-6), rowSp.instantClosePnl);
  check('تسویه با آخرین معامله، دقیقاً bid منهای last',
    near(rowSp.settleLastPnl, (8000 - 8300) * size, 1e-6), rowSp.settleLastPnl);
  check('تسویه با قیمت پایانی، دقیقاً bid منهای close',
    near(rowSp.settleClosePnl, (8000 - 8100) * size, 1e-6), rowSp.settleClosePnl);

  // با کارمزد واقعی، بستن فوری همیشه از تسویه با آخرین/پایانی بدتر است —
  // چون اسپرد کامل را دو بار (ورود و خروج) می‌پردازی، آن‌ها فقط یک‌بار
  const rowSpFee = evaluate({
    legs: legsSp, quotes: qSp,
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s, def: sp, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('بستن فوری همیشه هزینه اسپرد کامل را می‌پردازد، بدتر از تسویه مرجع',
    rowSpFee.instantClosePnl < rowSpFee.settleLastPnl && rowSpFee.instantClosePnl < rowSpFee.settleClosePnl,
    `فوری ${Math.round(rowSpFee.instantClosePnl)} | آخرین ${Math.round(rowSpFee.settleLastPnl)} | پایانی ${Math.round(rowSpFee.settleClosePnl)}`);

  // ——— بازار یک‌طرفه: آفست ممکن نیست ———
  //
  // گزارش حسابرسی: در ۷٬۰۹۳ ردیفِ یک‌طرفه، ۱٬۲۳۶ «سود فوری مثبت» ساخته شد
  // که هیچ‌کدام اجراشدنی نبود؛ در ردیف‌های دوطرفه، صفر. ریشه: مبنای دفتر
  // سفارش وقتی سمت خروج خالی بود به آخرین معامله پس می‌افتاد. اینجا پوتی
  // فروخته می‌شود که فقط تقاضا دارد و هیچ عرضه‌ای ندارد — یعنی بازخریدش
  // ممکن نیست — و آخرین معامله‌اش ۱۰۰ ریالِ کهنه است.
  const qOneSide = [{ bid: 8000, bidQty: 500, ask: 0, askQty: 0, last: 100, close: 100,
    book: [{ bid: 8000, bidQty: 500, ask: 0, askQty: 0 }], state: 'A', staleSec: 1 }];
  const rowOne = evaluate({
    legs: legsSp, quotes: qOneSide,
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s0, def: sp, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('پای بدون سمت خروج، آفست‌ناپذیر علامت می‌خورد', rowOne.offsettable === false);
  check('و «سود فوری» ۷٬۹۰۰٬۰۰۰ ریالیِ کاذب دیگر ساخته نمی‌شود',
    !Number.isFinite(rowOne.instantClosePnl), rowOne.instantClosePnl);
  check('هشدارش در ردیف دیده می‌شود', rowOne.warn.includes('آفست ناممکن'), rowOne.warn.join('، '));
  check('و نام پای گیر گزارش می‌شود', rowOne.noExitLegs.length === 1, rowOne.noExitLegs.join('، '));
  // مبنای مرجع ادعای اجرا ندارد، پس همچنان عدد می‌دهد
  check('تسویه با آخرین معامله دست‌نخورده می‌ماند — مرجع است نه اجرا',
    Number.isFinite(rowOne.settleLastPnl) && Number.isFinite(rowOne.settleClosePnl));
  // و ردیف دوطرفه هیچ تغییری نمی‌کند
  check('ردیف دوطرفه همچنان آفست‌پذیر است و عددش همان است',
    rowSp.offsettable === true && near(rowSp.instantClosePnl, (8000 - 8400) * size, 1e-6));

  const cv = closeValuation(
    [{ kind: 'put', side: 'sell', ratio: 1, size: 1000 }], [{ bid: 8000, ask: 0 }], 'BOOK',
    { option: 0, buyStock: 0, sellStock: 0 }, { strict: true });
  check('closeValuation در حالت سخت‌گیر، به‌جای عدد، ناعدد می‌دهد',
    !Number.isFinite(cv.net) && cv.offsettable === false);
  const cvLast = closeValuation(
    [{ kind: 'put', side: 'sell', ratio: 1, size: 1000 }], [{ bid: 8000, ask: 0, last: 100 }], 'LAST',
    { option: 0, buyStock: 0, sellStock: 0 }, { strict: true });
  check('مبنای مرجع پرچم آفست ندارد، چون ادعای اجرا ندارد', cvLast.offsettable === null);
}

group('۱۰. فهرست استراتژی‌ها');
{
  check('فهرست پر است', CATALOG.length >= 25, `${CATALOG.length} استراتژی`);
  check('شناسه‌ها یکتا هستند', new Set(CATALOG.map((d) => d.id)).size === CATALOG.length);
  const bad = CATALOG.filter((d) => {
    const maxSlot = Math.max(...d.legs.filter((l) => l.kind !== 'underlying').map((l) => l.slot), 0);
    return maxSlot !== d.strikes;
  });
  check('تعداد قیمت اعمال هر الگو با پاهایش می‌خواند', bad.length === 0, bad.map((d) => d.id).join(', '));
  const infeasible = CATALOG.filter((d) => !d.feasible);
  check('استراتژی‌های نیازمند فروش سهم، برچسب دارند',
    infeasible.length > 0 && infeasible.every((d) => !!d.infeasibleWhy),
    infeasible.map((d) => d.name).join(' , '));
  for (const d of CATALOG.filter((x) => x.feasible)) {
    const legs = buildLegs(d, {
      strikes: [80000, 90000, 100000, 110000].slice(0, d.strikes),
      size: 1000, days: [30, 60],
      prices: {},
    });
    const okLegs = legs.every((l) => l.kind === 'underlying' || Number.isFinite(l.strike));
    if (!okLegs) check(`ساخت پاها — ${d.name}`, false, 'قیمت اعمال ناقص');
  }
  check('ساخت پاها برای همه الگوهای شدنی', true);
}

group('۱۱. عبور همه استراتژی‌ها از موتور — همان مسیر تب موتور');
{
  const s = defaults();
  const size = 1000, spot = 100000;
  const strikesAll = [90000, 95000, 100000, 105000];
  let broke = [];
  let unbounded = [];

  for (const def of CATALOG) {
    const strikes = strikesAll.slice(0, def.strikes);
    const legs = buildLegs(def, { strikes, size, days: [30, 90] });
    const quotes = legs.map((l) => {
      const intr = l.kind === 'underlying' ? spot
        : (l.kind === 'call' ? Math.max(0, spot - l.strike) : Math.max(0, l.strike - spot));
      const p = Math.round(l.kind === 'underlying' ? spot : intr + spot * 0.03);
      const half = Math.max(1, p * 0.02);
      return {
        bid: p - half, bidQty: 1e6, ask: p + half, askQty: 1e6,
        last: p, close: p, low: p * 0.9, high: p * 1.1, state: 'A', staleSec: 0,
        book: [{ level: 1, bid: p - half, bidQty: 1e6, ask: p + half, askQty: 1e6 }],
      };
    });
    try {
      const row = evaluate({
        legs, quotes,
        ctx: { S: spot, Sclose: spot, days: 30, size, qty: 1, settings: s, def, underlying: 'نمونه', sigmaHist: 0.6 },
      });
      const finite = ['netCash', 'capital', 'execCost', 'margin', 'conditionalMargin']
        .every((k) => Number.isFinite(row[k]));
      const beSane = row.breakevens.every((b) => b > 0 && Number.isFinite(b));
      if (!finite || !beSane) broke.push(def.id);
      if (row.unlimitedLoss) unbounded.push(def.name);
      // قاعده مرکزی باید در همه‌جا برقرار باشد
      if (!row.isCredit && row.margin > 0 && row.coverage === 'full') broke.push(`${def.id} — بدهکار با وجه تضمین`);
    } catch (e) {
      broke.push(`${def.id} → ${e.message}`);
    }
  }
  check('همه ۳۱ استراتژی بدون خطا ارزیابی شدند و اعداد متناهی دادند',
    broke.length === 0, broke.join(' | '));
  check('استراتژی‌های زیان‌نامحدود شناسایی شدند', unbounded.length > 0, unbounded.join(' , '));
}

group('۱۲. زنجیره و ترکیب‌سازی');
{
  // دو رکورد دیده‌بان مصنوعی، شکل واقعی پاسخ بازار
  const mkRow = (strike, days, cBid, pBid, ua = '1', uaName = 'نمونه') => ({
    uaInsCode: ua, lval30_UA: uaName, pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: 100, pMeOf_C: cBid * 1.05, qTitMeOf_C: 100,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: pBid, qTitMeDem_P: 100, pMeOf_P: pBid * 1.05, qTitMeOf_P: 100,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 800,
  });

  const rows = [];
  for (const k of [90000, 95000, 100000, 105000, 110000]) {
    rows.push(mkRow(k, 30, Math.max(200, 100000 - k + 4000), Math.max(200, k - 100000 + 4000)));
    rows.push(mkRow(k, 90, Math.max(300, 100000 - k + 7000), Math.max(300, k - 100000 + 7000)));
  }
  rows.push({
    ...mkRow(100000, 30, 0, 0, '2', 'بی‌مظنه'),
    pMeDem_C: 0, pMeOf_C: 0, pMeDem_P: 0, pMeOf_P: 0,
    pDrCotVal_C: 4200, pClosing_C: 4200, pDrCotVal_P: 4100, pClosing_P: 4100,
  });

  const chain = buildChain(rows);
  check('زنجیره دو نماد پایه ساخت', chain.size === 2, `${chain.size}`);
  const sanitizedChain = buildChain([{ ...mkRow(100000, 30, 1000, 900, '123456', '123456'), insCode_C: '987654', lVal18AFC_C: '987654' }]);
  check('نامی که فقط شناسه خام است با عنوان خوانا جایگزین می‌شود', sanitizedChain.get('123456')?.name === 'دارایی پایه بدون نام' && sanitizedChain.get('123456')?.expiryList[0]?.strikeList[0]?.call?.name === 'قرارداد اختیار خرید');
  const ua = chain.get('1');
  check('دو سررسید و پنج قیمت اعمال', ua.expiryList.length === 2 && ua.expiryList[0].strikeList.length === 5);
  check('سررسیدها صعودی مرتب شدند', ua.expiryList[0].days < ua.expiryList[1].days);
  const list = underlyingList(chain);
  check('فهرست انتخابی نماد، با شمارش قرارداد', list.length === 2 && list[0].contracts > 0,
    list.map((u) => `${u.name}:${u.contracts}`).join(' , '));
  const st = chainStats(chain);
  check('آمار زنجیره: قرارداد و دارای مظنه', st.contracts === 22 && st.quoted === 20,
    `قرارداد ${st.contracts} | مظنه ${st.quoted}`);

  const s2 = { ...defaults(), comboWindowPct: 25, wingsEqualWidth: true, greeksInScan: false };

  // کاوردکال: یک ترکیب به ازای هر قیمت اعمال هر سررسید
  const cc = scanFn({ def: byId('covered-call'), chain, uaKeys: ['1'], settings: s2 });
  check('کاوردکال ترکیب ساخت', cc.rows.length > 0, `${cc.rows.length} ردیف در ${cc.ms}ms`);
  check('نوار تشخیص پر شد', cc.funnel.built > 0 && cc.funnel.kept === cc.rows.length,
    `ساخته ${cc.funnel.built} | مانده ${cc.funnel.kept}`);

  // اسپرد عمودی: دو قیمت اعمال از یک سررسید، هر دو در پنجره
  const bcs = scanFn({ def: byId('bull-call-spread'), chain, uaKeys: ['1'], settings: s2 });
  check('اسپرد عمودی، هر ترکیب دو قیمت اعمال متفاوت دارد',
    bcs.rows.length > 0 && bcs.rows.every((r) => r.strikeSet.length === 2 && r.strikeSet[0] < r.strikeSet[1]),
    `${bcs.rows.length} ردیف`);

  // باترفلای با بال مساوی: ۹۰-۱۰۰-۱۱۰ می‌ماند، ۹۰-۹۵-۱۰۵ می‌افتد
  const bf = scanFn({ def: byId('long-call-butterfly'), chain, uaKeys: ['1'], settings: s2 });
  const widths = bf.rows.map((r) => [r.strikeSet[1] - r.strikeSet[0], r.strikeSet[2] - r.strikeSet[1]]);
  check('بال مساوی رعایت شد', widths.every(([a, b]) => Math.abs(a - b) < 1), `${bf.rows.length} ردیف`);
  const bfOff = scanFn({ def: byId('long-call-butterfly'), chain, uaKeys: ['1'], settings: { ...s2, wingsEqualWidth: false } });
  check('خاموش کردن بال مساوی، ترکیب را بیشتر می‌کند', bfOff.rows.length > bf.rows.length,
    `${bf.rows.length} → ${bfOff.rows.length}`);

  // تقویمی: باید دو سررسید متفاوت داشته باشد و پای دور، دورتر باشد
  const cal = scanFn({ def: byId('calendar-call'), chain, uaKeys: ['1'], settings: s2 });
  check('تقویمی دو سررسید متفاوت دارد',
    cal.rows.length > 0 && cal.rows.every((r) => r.expiryDays.length === 2 && r.expiryDays[0] < r.expiryDays[1]),
    `${cal.rows.length} ردیف`);
  check('تقویمی، پوشش کامل و بدون وجه تضمین', cal.rows.every((r) => r.margin === 0 && r.coverage === 'full'));

  // نماد بی‌مظنه هیچ ردیفی نمی‌دهد و در نوار تشخیص شمرده می‌شود
  const dead = scanFn({ def: byId('covered-call'), chain, uaKeys: ['2'], settings: s2 });
  check('نماد بی‌مظنه، صفر ردیف و شمارش در نوار تشخیص',
    dead.rows.length === 0 && dead.funnel.noQuote > 0, `بی‌مظنه ${dead.funnel.noQuote}`);
  const shown = scanFn({ def: byId('covered-call'), chain, uaKeys: ['2'], settings: { ...s2, showUnexecutable: true } });
  check('با روشن کردن نمایش غیرقابل اجرا، ردیف برمی‌گردد و برچسب می‌خورد',
    shown.rows.length > 0 && shown.rows.every((r) => !r.executable), `${shown.rows.length} ردیف`);

  // پنجره قیمت اعمال، مهار اصلی است
  const wide = scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...s2, comboWindowPct: 30 } });
  const narrow = scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...s2, comboWindowPct: 6 } });
  check('پنجره باریک‌تر، ترکیب کمتر', narrow.funnel.built < wide.funnel.built,
    `${wide.funnel.built} → ${narrow.funnel.built}`);
  check('سقف ترکیب هر سررسید اعمال می‌شود',
    scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...s2, maxCombosPerExpiry: 2 } }).funnel.built <= 6);

  // رتبه‌بندی
  const ranked = scanFn({ def: byId('covered-call'), chain, uaKeys: ['1'], settings: { ...s2, rankBy: 'retMonthPct' } });
  const rr = ranked.rows.map((r) => r.retMonthPct).filter(Number.isFinite);
  check('ردیف‌ها نزولی مرتب شدند', rr.every((v, i) => i === 0 || rr[i - 1] >= v));
}

group('۱۳. موقعیت واقعی و تحلیل رول');
{
  const size = 1000;
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const q = (bid, ask) => ({ bid, bidQty: 1000, ask, askQty: 1000, last: (bid + ask) / 2, close: (bid + ask) / 2 });

  // کاوردکال اجراشده: سهم ۱۰۰٫۰۰۰ خریدی، کال ۱۱۰٫۰۰۰ به ۵٫۰۰۰ فروختی
  const pos = {
    id: 'p1', qty: 2, entryDate: todayJalali(), uaIns: '1',
    legs: [
      { kind: 'underlying', side: 'buy', ratio: 1, size, price: 100000 },
      { kind: 'call', side: 'sell', ratio: 1, size, strike: 110000, price: 5000, days: 30 },
    ],
  };

  // پایه بالا رفته و کال گران‌تر شده
  const mtm = markToMarket(pos, [q(104000, 105000), q(7000, 7400)], { fees, spot: 104500, spotClose: 104500 });
  check('ارزش‌گذاری لحظه‌ای عدد متناهی می‌دهد', Number.isFinite(mtm.pnl), `${Math.round(mtm.pnl).toLocaleString()}`);
  check('سود کل، ضربدر تعداد قرارداد', Math.abs(mtm.pnlTotal - mtm.pnl * 2) < 1e-6);
  check('تفکیک پا: سهم در سود، کال در زیان',
    mtm.perLeg[0].pnl > 0 && mtm.perLeg[1].pnl < 0,
    `سهم ${Math.round(mtm.perLeg[0].pnl).toLocaleString()} | کال ${Math.round(mtm.perLeg[1].pnl).toLocaleString()}`);
  check('پریمیوم دریافتی، سود تحقق‌یافته شمرده نمی‌شود', mtm.pnl < 4000 * size,
    'بدهی کال به قیمت روز لحاظ شده');
  check('اگر تا سررسید نگه داری، سود در قیمت فعلی', Number.isFinite(mtm.ifHeld.atSpot));
  check('روز نگه‌داری از تاریخ شمسی خوانده شد', mtm.daysHeld === 0, `${mtm.daysHeld}`);

  // رول: کال ۱۱۰ را ببند، کال ۱۲۰ سررسید دورتر بفروش
  const roll = rollAnalysis({
    pos, quotes: [q(104000, 105000), q(7000, 7400)],
    closeIdx: 1,
    newLeg: { kind: 'call', side: 'sell', ratio: 1, size, strike: 120000, days: 90 },
    newQuote: q(6000, 6400),
    opt: { fees, spot: 104500 },
  });
  check('هزینه بستن، از عرضه گرفته شد', roll.closePrice === 7400 && roll.closeCash < 0,
    `${Math.round(roll.closeCash).toLocaleString()}`);
  check('بستانکار پای تازه، از تقاضا گرفته شد', roll.newPrice === 6000 && roll.newCash > 0);
  check('موقعیت جدید سقف سود بالاتری دارد', roll.nextMaxProfit > roll.curMaxProfit,
    `${Math.round(roll.curMaxProfit).toLocaleString()} → ${Math.round(roll.nextMaxProfit).toLocaleString()}`);
  check('سربه‌سری موقعیت جدید بالاتر است، چون هزینه بستن پرداخت شد',
    roll.nextBreakevens[0] > roll.curBreakevens[0],
    `${roll.curBreakevens[0].toFixed(0)} → ${roll.nextBreakevens[0].toFixed(0)}`);
  check('تفاضل در قیمت پایین منفی و در قیمت بالا (فراتر از مرز تصمیم) مثبت است',
    roll.diff(90000) < 0 && roll.diff(200000) > 0,
    `${Math.round(roll.diff(90000)).toLocaleString()} در برابر ${Math.round(roll.diff(200000)).toLocaleString()}`);
  check('مرز تصمیم پیدا شد', roll.crossings.length >= 1,
    roll.crossings.map((x) => Math.round(x).toLocaleString()).join(' , '));
  check('جمع‌بندی بر مبنای قیمت فعلی داده شد', !!roll.verdict, roll.verdict);

  // ——— رول چند-سررسیدی: پای تازه سررسید دیگری دارد (قلم الف-۵ بک‌لاگ) ———
  // ۱۱۰/۳۰روزه بسته می‌شود، ۱۲۰/۹۰روزه جای آن می‌نشیند — پس موقعیت پس از رول
  // دیگر تک‌سررسیدی نیست. analyzePayoff دیگر معنا ندارد (هر پا سررسید خودش
  // را می‌خواهد)، پس مسیر analyzeMixed با افق مشترک «امروز» باید فعال شود.
  check('رول چند-سررسیدی، approx=true را علامت می‌زند', roll.approx === true);
  check('یادداشت رول چند-سررسیدی، تقریبی‌بودن را می‌گوید', roll.note.includes('تقریبی'));

  // هویت جبری: diff همین رول باید دقیقاً از تفاضل دو analyzeMixed مستقل،
  // با همان افق و همان netCash های برگشتی، به دست بیاید — نه یک تقریب دیگر.
  const mixOpt13 = { fees, spot: 104500, horizonDays: 0 };
  const curCheck13 = analyzeMixed(pos.legs, roll.curNet, mixOpt13);
  const nextCheck13 = analyzeMixed(roll.nextLegs, roll.nextNet, mixOpt13);
  const identityAt = 115000;
  check('diff رول چند-سررسیدی دقیقاً از دو analyzeMixed مستقل می‌آید (هویت جبری)',
    near(roll.diff(identityAt), nextCheck13.at(identityAt) - curCheck13.at(identityAt), 1e-9),
    `${roll.diff(identityAt)} ~ ${nextCheck13.at(identityAt) - curCheck13.at(identityAt)}`);

  // رول هم‌سررسید (اکثریت رول‌های واقعی — فقط قیمت اعمال عوض می‌شود، نه
  // سررسید) باید دست‌نخورده از همان موتور دقیق تکه‌ای-خطی قبلی بماند —
  // approx ست نمی‌شود، جبر دقیق است نه تقریب بلک-شولز.
  const rollSameExpiry = rollAnalysis({
    pos, quotes: [q(104000, 105000), q(7000, 7400)],
    closeIdx: 1,
    newLeg: { kind: 'call', side: 'sell', ratio: 1, size, strike: 120000, days: 30 },
    newQuote: q(6000, 6400),
    opt: { fees, spot: 104500 },
  });
  check('رول هم‌سررسید هنوز از موتور دقیق تکه‌ای-خطی می‌آید، نه تقریبی',
    !rollSameExpiry.approx);
}

group('۱۴. تاریخ شمسی');
{
  const [gy, gm, gd] = jalaliToGregorian(1404, 5, 21);
  check('۱۴۰۴/۰۵/۲۱ برابر ۲۰۲۵-۰۸-۱۲ است', gy === 2025 && gm === 8 && gd === 12, `${gy}-${gm}-${gd}`);
  const [jy, jm, jd] = gregorianToJalali(2025, 8, 12);
  check('رفت و برگشت تاریخ', jy === 1404 && jm === 5 && jd === 21, `${jy}/${jm}/${jd}`);
  check('تاریخ بد، null می‌دهد', parseJalali('چیز بی‌ربط') === null);
  check('امروز به شمسی، قالب درست دارد', /^\d{4}\/\d{2}\/\d{2}$/.test(todayJalali()), todayJalali());
}

group('۱۵. قرارداد پیام‌رسانی ریسه اسکن');
{
  // ریسه را در نود سوار می‌کنیم، با یک self ساختگی. اینطور پروتکل پیام‌ها
  // بدون مرورگر آزمون می‌شود و خطای کلون‌شدن داده هم بیرون می‌آید.
  const out = [];
  globalThis.self = { onmessage: null, postMessage: (m) => out.push(m) };
  await import('../worker/scan-worker.mjs');
  const send = (m) => globalThis.self.onmessage({ data: m });

  const mkRow = (strike, days, cBid, pBid) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000,
    insCode_C: `c${strike}_${days}`, insCode_P: `p${strike}_${days}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days,
    pMeDem_C: cBid, qTitMeDem_C: 100, pMeOf_C: cBid * 1.05, qTitMeOf_C: 100,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 10,
    pMeDem_P: pBid, qTitMeDem_P: 100, pMeOf_P: pBid * 1.05, qTitMeOf_P: 100,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 10,
  });
  const rows = [];
  for (const k of [90000, 95000, 100000, 105000, 110000]) {
    rows.push(mkRow(k, 30, Math.max(300, 104000 - k), Math.max(300, k - 96000)));
    rows.push(mkRow(k, 90, Math.max(500, 107000 - k), Math.max(500, k - 93000)));
  }
  const st = defaults();

  send({ type: 'rows', id: 1, full: true, rows, at: Date.now() });
  const ch = out.find((m) => m.type === 'chain');
  check('ریسه زنجیره ساخت و فهرست نماد داد', !!ch && ch.list.length === 1 && ch.stats.contracts === 20,
    `${ch?.list.length} نماد | ${ch?.stats.contracts} قرارداد`);

  send({ type: 'scan', id: 2, defId: 'covered-call', uaKeys: ['1'], settings: st, qty: 1 });
  const sc = out.find((m) => m.type === 'scan');
  check('ریسه اسکن کرد و نوار تشخیص برگشت', sc.rows.length > 0 && sc.funnel.built > 0,
    `${sc.rows.length} ردیف در ${sc.ms}ms`);
  check('ردیف بین ریسه و نخ اصلی کلون می‌شود',
    (() => { try { structuredClone(sc.rows[0]); return true; } catch { return false; } })(),
    'شیء تابع‌دار در ردیف نمانده');
  check('ردیف، پاهای قیمت‌خورده را برای رسم نمودار همراه دارد',
    Array.isArray(sc.rows[0].__legs) && sc.rows[0].__legs.length === 2);

  // مرحله دو: عمق واقعی می‌نشیند و یونانی روشن می‌شود
  const target = sc.rows[0];
  const optIns = target.legIns[0];
  send({ type: 'overlay', id: 3, data: {
    1: { book: [{ level: 1, bid: 99000, bidQty: 50000, ask: 100000, askQty: 50000 },
                { level: 2, bid: 98500, bidQty: 90000, ask: 100500, askQty: 90000 }] },
    [optIns]: { book: [{ level: 1, bid: 4000, bidQty: 3, ask: 4200, askQty: 3 },
                       { level: 2, bid: 3900, bidQty: 400, ask: 4400, askQty: 400 }] },
  } });
  check('پوشش عمق پذیرفته شد', out.some((m) => m.type === 'overlay-ok'));

  send({ type: 'scan', id: 4, defId: 'covered-call', uaKeys: ['1'], settings: st, qty: 5, onlyIds: [target.id] });
  const sc2 = out.filter((m) => m.type === 'scan')[1];
  const r2 = sc2.rows[0];
  check('مرحله دو فقط همان ردیف را برمی‌گرداند', sc2.rows.length === 1 && r2.id === target.id);
  check('با عمق واقعی، افت مظنه محاسبه شد', Number.isFinite(r2.legPrices[1].slipPct),
    `${r2.legPrices[1].slipPct.toFixed(2)}٪`);
  check('در مرحله دو یونانی روشن می‌شود', Number.isFinite(r2.delta) && !r2.greeksIncomplete,
    `دلتا ${r2.delta.toFixed(1)}`);
  check('در مرحله یک یونانی خاموش است', !Number.isFinite(target.delta), 'صرفه‌جویی در تلاطم ضمنی');
  check('هشدار عمق پایه نامعلوم، پس از نشستن عمق برداشته شد',
    !r2.warn.includes('عمق پایه نامعلوم'), r2.warn.join(' , ') || 'بی‌هشدار');

  send({ type: 'chain-detail', id: 5, uaIns: '1' });
  const cd = out.find((m) => m.type === 'chain-detail');
  check('جزئیات زنجیره برای تب دیده‌بان', cd.ua.expiries.length === 2 && cd.ua.expiries[0].strikes.length === 5);

  send({ type: 'scan', id: 6, defId: 'ناشناخته', uaKeys: ['1'], settings: st });
  check('استراتژی ناشناخته، خطای تمیز می‌دهد',
    out.filter((m) => m.type === 'scan').some((m) => m.error));
  delete globalThis.self;
}

group('۱۶. موتور چند-سررسیدی — کرانداری');
{
  // این گروه یک باگ واقعی را قفل می‌کند: شیب انتهایی از لبه پنجره رسم خوانده
  // می‌شد. در دو برابر قیمت پایه، پای زنده هنوز ارزش زمانی دارد و شیب ظاهری
  // صفر نیست، پس هر تقویمی «زیان نامحدود» می‌گرفت. چون مخرج بازده بیشترین
  // زیان است، بازده هر ردیف تقویمی صفر می‌شد و کل تب از رتبه‌بندی می‌افتاد.
  const spot = 100000, size = 1000;
  const leg = (side, K, price, days, ratio = 1) =>
    ({ kind: 'call', side, ratio, strike: K, price, size, days, sigma: 0.6 });
  const cash = (ls) => ls.reduce((c, l) => c - signedQty(l) * l.price, 0);
  const run = (ls) => analyzeMixed(ls, cash(ls), { spot, rFree: 0.3, sigma: 0.6 });

  // تقویمی خرید: فروش نزدیک، خرید دور، یک قیمت اعمال
  const cal = [leg('sell', 100000, 3000, 20), leg('buy', 100000, 5000, 80)];
  const a = run(cal);
  check('تقویمی خرید، زیان کراندار است', !a.unlimitedLoss && Number.isFinite(a.maxLoss));
  check('بیشترین زیان تقویمی، دقیقاً بدهکار خالص است',
    near(a.maxLoss, 2_000_000, 1e-6), `${Math.round(a.maxLoss).toLocaleString()}`);
  check('شیب مجانبی تقویمی عملاً صفر است', Math.abs(a.slopeRight) < 1e-3,
    a.slopeRight.toExponential(2));
  check('سود تقویمی هم کراندار است', !a.unlimitedProfit && Number.isFinite(a.maxProfit),
    `${Math.round(a.maxProfit).toLocaleString()}`);

  // مورب بدهکار: اعمال‌های متفاوت، باز هم کراندار و زیانش بدهکار خالص
  const diag = [leg('sell', 110000, 1500, 20), leg('buy', 95000, 8000, 80)];
  const b = run(diag);
  check('مورب بدهکار، زیان کراندار و برابر بدهکار خالص',
    !b.unlimitedLoss && near(b.maxLoss, 6_500_000, 1e-6),
    `${Math.round(b.maxLoss).toLocaleString()}`);

  // نسبت تقویمی: یک پای لخت می‌ماند، پس زیان واقعاً نامحدود است
  const ratioCal = [leg('sell', 100000, 3000, 20, 2), leg('buy', 100000, 5000, 80)];
  const c = run(ratioCal);
  check('نسبت تقویمی، زیان واقعاً نامحدود شناسایی شد',
    c.unlimitedLoss && c.maxLoss === Infinity);
  check('شیب مجانبی نسبت تقویمی، اندازه پای لخت است',
    near(c.slopeRight, -size, 1e-6), `${c.slopeRight.toFixed(1)} در برابر ${-size}`);

  // آستانه باید با اندازه موقعیت مقیاس بخورد، نه عدد مطلق
  const big = [leg('sell', 100000, 3000, 20), leg('buy', 100000, 5000, 80)]
    .map((l) => ({ ...l, size: 1_000_000 }));
  check('تقویمی بزرگ هم کراندار می‌ماند — آستانه مقیاس‌پذیر است',
    !analyzeMixed(big, cash(big), { spot, rFree: 0.3, sigma: 0.6 }).unlimitedLoss);

  // ارزش در قیمت پایه نزدیک صفر: هر دو کال بی‌ارزش، پس همان بدهکار خالص
  check('ارزش در قیمت پایه صفر، بدهکار خالص است', near(a.atZero, -2_000_000, 1e-6),
    `${Math.round(a.atZero).toLocaleString()}`);
}

group('۱۷. سنجه‌های سربه‌سری');
{
  const S = 100000;
  // یک سربه‌سری بالای پایه: پایه زیر سربه‌سری است، پس علامت منفی است
  const up = breakevenMetrics([105000], S);
  check('پایه زیر سربه‌سری، فاصله منفی است', near(up.beDistPct, -5, 1e-9), `${up.beDistPct}٪`);
  check('نزدیک‌ترین سربه‌سری، همان تک نقطه است', up.beNear === 105000);

  // یک سربه‌سری زیر پایه: علامت مثبت است، ولی حاشیه امن بدون علامت
  const dn = breakevenMetrics([92000], S);
  check('پایه بالای سربه‌سری، فاصله مثبت است', near(dn.beDistPct, 8, 1e-9), `${dn.beDistPct}٪`);
  check('حاشیه امن بدون علامت است', near(dn.beRoomPct, 8, 1e-9));

  // استرادل: دو سربه‌سری. نزدیک‌ترین انتخاب می‌شود، نه اولی.
  const strad = breakevenMetrics([94000, 108000], S);
  check('از دو سربه‌سری، نزدیک‌ترین به پایه انتخاب شد', strad.beNear === 94000,
    `${strad.beNear} در برابر ${strad.beHigh}`);
  check('پایین و بالا درست تفکیک شدند', strad.beLow === 94000 && strad.beHigh === 108000);
  check('پهنای سربه‌سری، درصد قیمت پایه است', near(strad.beWidthPct, 14, 1e-9), `${strad.beWidthPct}٪`);
  check('شمار سربه‌سری', strad.beCount === 2);

  // ترتیب ورودی نباید اثر بگذارد
  const rev = breakevenMetrics([108000, 94000], S);
  check('ترتیب ورودی اثر ندارد', rev.beNear === strad.beNear && rev.beLow === strad.beLow);

  // بدون سربه‌سری یا بدون قیمت پایه، عدد ساختگی ساخته نمی‌شود
  const none = breakevenMetrics([], S);
  check('بی‌سربه‌سری، همه سنجه‌ها نامعتبرند',
    !Number.isFinite(none.beNear) && !Number.isFinite(none.beDistPct) && none.beCount === 0);
  check('قیمت پایه نامعتبر، سنجه نمی‌سازد', !Number.isFinite(breakevenMetrics([100], 0).beNear));

  // تک سربه‌سری پهنا ندارد
  check('تک سربه‌سری پهنا ندارد', !Number.isFinite(up.beWidthPct));
  // مقدار بی‌معنی در فهرست، دور ریخته می‌شود
  const dirty = breakevenMetrics([NaN, -5, 0, 103000], S);
  check('سربه‌سری بی‌معنی کنار گذاشته شد', dirty.beCount === 1 && dirty.beNear === 103000);
}

group('۱۹. نوار تشخیص، علت واقعی افتادن را می‌گوید');
{
  // این گروه یک باگ گزارش‌شده کاربر را قفل می‌کند: تب خالی بود و نوار تشخیص
  // می‌گفت «عمق ناکافی»، در حالی که علت واقعی این بود که مبنای قیمت روی
  // «پایانی» بود — مبنایی که طبق طراحی هرگز ادعای اجرا ندارد. کاربر هیچ راهی
  // نداشت این را بفهمد.
  const mkRow = (strike, days, cBid, pBid, qty = 100) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: qty, pMeOf_C: Math.round(cBid * 1.05), qTitMeOf_C: qty,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: pBid, qTitMeDem_P: qty, pMeOf_P: Math.round(pBid * 1.05), qTitMeOf_P: qty,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 800,
  });
  const market = (qty) => {
    const rows = [];
    for (const k of [90000, 95000, 100000, 105000, 110000]) {
      rows.push(mkRow(k, 30, Math.max(200, 100000 - k + 4000), Math.max(200, k - 100000 + 4000), qty));
      rows.push(mkRow(k, 90, Math.max(300, 100000 - k + 7000), Math.max(300, k - 100000 + 7000), qty));
    }
    return rows;
  };
  const runScan = (rows, over = {}) => {
    const s = { ...defaults(), ...over };
    return scanFn({ def: byId('bull-call-spread'), chain: buildChain(rows, s), uaKeys: ['1'], settings: s, qty: s.qtyDefault });
  };

  const base = runScan(market(100));
  check('با دفتر سفارش و مظنه سالم، ردیف می‌ماند', base.funnel.kept > 0, `${base.funnel.kept} ردیف`);
  check('و هیچ‌کدام در سطل مرجع یا عمق نمی‌افتد',
    base.funnel.refBasis === 0 && base.funnel.noDepth === 0);

  // ——— علت یک: مبنای قیمت مرجع ———
  for (const basis of ['CLOSE', 'LAST', 'LOW', 'HIGH']) {
    const r = runScan(market(100), { priceBasis: basis });
    check(`مبنای ${basis} در سطل «مبنای مرجع» می‌افتد، نه «عمق ناکافی»`,
      r.funnel.refBasis === r.funnel.built && r.funnel.noDepth === 0 && r.funnel.kept === 0,
      `مرجع ${r.funnel.refBasis} از ${r.funnel.built}`);
  }

  // با روشن کردن نمایش غیرقابل اجرا، همان ترکیب‌ها برمی‌گردند
  const shown = runScan(market(100), { priceBasis: 'CLOSE', showUnexecutable: true });
  check('با نمایش غیرقابل اجرا، ردیف‌های مبنای مرجع برمی‌گردند',
    shown.funnel.kept > 0 && shown.funnel.refBasis === 0, `${shown.funnel.kept} ردیف`);

  // ——— علت دو: قیمت هست ولی حجمی پشتش نیست ———
  const dry = runScan(market(0));
  check('حجم مظنه صفر، «بی‌مظنه» شمرده می‌شود نه «عمق ناکافی»',
    dry.funnel.noQuote === dry.funnel.built && dry.funnel.noDepth === 0 && dry.funnel.kept === 0,
    `بی‌مظنه ${dry.funnel.noQuote} از ${dry.funnel.built}`);

  // ——— علت سه: فیلتر خود کاربر ———
  const tight = runScan(market(100), { maxSpreadPct: 1 });
  check('سقف اسپرد تنگ، در سطل فیلتر تو می‌افتد',
    tight.funnel.filtered === tight.funnel.built && tight.funnel.kept === 0);

  // حالت میانه ادعای اجرا ندارد ولی ردیف را نمی‌اندازد — عمداً
  const mid = runScan(market(100), { execMode: 'MID' });
  check('حالت میانه ردیف را نمی‌اندازد', mid.funnel.kept > 0 && mid.funnel.refBasis === 0);

  // ——— علت، از کیفیت ماشین‌خوان می‌آید نه از متن برچسب ———
  check('علت مرجع، از کیفیت پا خوانده می‌شود',
    unexecutableReason({ legPrices: [{ quality: 'depth' }, { quality: 'reference' }] }) === 'refBasis');
  check('علت بی‌مظنه، از کیفیت پا خوانده می‌شود',
    unexecutableReason({ legPrices: [{ quality: 'none' }, { quality: 'depth' }] }) === 'noQuote');
  check('مرجع بر بی‌مظنه اولویت دارد، چون تنظیم کاربر است نه واقعیت بازار',
    unexecutableReason({ legPrices: [{ quality: 'none' }, { quality: 'reference' }] }) === 'refBasis');
  check('بی هیچ نشانه‌ای، عمق ناکافی می‌ماند',
    unexecutableReason({ legPrices: [{ quality: 'depth' }] }) === 'noDepth');
  check('ردیف بی‌پا، خطا نمی‌دهد', unexecutableReason({}) === 'noDepth');

  // کیفیت ماشین‌خوان باید واقعاً روی ردیف بنشیند، وگرنه علت همیشه noDepth است
  const one = runScan(market(100), { priceBasis: 'CLOSE', showUnexecutable: true });
  check('کیفیت هر پا روی ردیف ثبت می‌شود',
    one.rows[0].legPrices.every((l) => typeof l.quality === 'string'),
    one.rows[0].legPrices.map((l) => l.quality).join(' , '));
}

group('۱۸. نگهبان مرز سرور');
{
  const ROOT = path.resolve('C:/x/options-radar');
  const ok = (p) => safeStaticPath(ROOT, p);

  // ——— مسیر مجاز ———
  check('ریشه به صفحه اصلی می‌رود', ok('/') === path.join(ROOT, 'ui', 'index.html'), `${ok('/')}`);
  check('فایل معمولی زیر ریشه قبول است', ok('/ui/style.css') === path.join(ROOT, 'ui', 'style.css'));
  check('مسیر تودرتو قبول است', ok('/ui/tabs/backtest.mjs') === path.join(ROOT, 'ui', 'tabs', 'backtest.mjs'));

  // ——— همان باگی که این گروه برایش نوشته شد ———
  // مقایسه رشته‌ای startsWith، پوشه هم‌نام‌شروع کنار ریشه را رد نمی‌کرد
  check('پوشه هم‌نام‌شروع کنار ریشه رد می‌شود',
    ok('/../options-radar-private/secret.env') === null,
    `${ok('/../options-radar-private/secret.env')}`);

  // ——— عبور از ریشه ———
  check('بالا رفتن ساده رد می‌شود', ok('/../../etc/passwd') === null);
  check('بالا رفتن از میان مسیر رد می‌شود', ok('/ui/../../etc/passwd') === null);
  check('رمزگشایی درصدی هم گرفته می‌شود', ok('/%2e%2e%2f%2e%2e%2fetc%2fpasswd') === null,
    `${ok('/%2e%2e%2f%2e%2e%2fetc%2fpasswd')}`);
  check('رمزگشایی درصدی نیمه‌کاره رد می‌شود', ok('/%2e%2e/secret') === null);
  check('درصد خراب، خطا نمی‌دهد و رد می‌شود', ok('/%zz') === null);
  check('بایت صفر رد می‌شود', ok('/ui/style.css\0.png') === null);
  check('خود ریشه فایل نیست', ok('/..') === null);
  check('ورودی غیرمتنی رد می‌شود', safeStaticPath(ROOT, null) === null);

  // ——— کد ابزار ———
  check('کد رقمی قبول است', validIns('17914401791772679'));
  check('کد خالی رد می‌شود', !validIns(''));
  check('کد با عبور از مسیر رد می‌شود', !validIns('123/../GetSomethingElse'));
  check('کد با نقطه رد می‌شود', !validIns('12.3'));
  check('کد با حرف رد می‌شود', !validIns('12a3'));
  check('کد با فاصله رد می‌شود', !validIns(' 123'));
  check('کد بیش از حد بلند رد می‌شود', !validIns('9'.repeat(33)));
  check('عدد به‌جای رشته رد می‌شود', !validIns(123));
  check('تاریخ فشرده معتبر برای مسیر ریزمعامله پذیرفته می‌شود', validCompactDate('20260802'));
  check('تاریخ کوتاه یا غیررقمی برای مسیر ریزمعامله رد می‌شود', !validCompactDate('1405/05/11') && !validCompactDate('2026080x'));
  check('مسیر ریزمعامله از endpoint تاریخی Trade ساخته می‌شود', historicalTradesPath('123456', '20260802') === '/Trade/GetTradeHistory/123456/20260802/true');
  check('مسیر ریزمعامله با کد یا تاریخ نامعتبر ساخته نمی‌شود', historicalTradesPath('../info', '20260802') === null && historicalTradesPath('123', '14050511') === null);

  // ——— فهرست کد ———
  const list = parseInsList(' 111 , 222,۳۳۳,../x,333,111 , ');
  check('فهرست کد: نامعتبر و تکراری دور ریخته شد',
    list.length === 3 && list.join(',') === '111,222,333', list.join(','));
  check('رقم فارسی، کد معتبر نیست', !parseInsList('۱۲۳').length);
  check('سقف تعداد اعمال می‌شود',
    parseInsList(Array.from({ length: 500 }, (_, i) => String(i + 1)).join(','), 200).length === 200);
  check('ورودی خالی، فهرست خالی می‌دهد', parseInsList(null).length === 0);

  // ——— سقف بدنه ———
  const streamOf = (...parts) => ({
    async *[Symbol.asyncIterator]() { for (const p of parts) yield Buffer.from(p); },
  });
  const read = async (stream, max) => {
    try { return { body: await readBody(stream, max) }; }
    catch (e) { return { err: e }; }
  };

  const small = await read(streamOf('{"a":', '1}'), 1000);
  check('بدنه کوچک، کامل و چسبیده خوانده می‌شود', small.body === '{"a":1}', small.body);

  const big = await read(streamOf('x'.repeat(50), 'y'.repeat(60)), 100);
  check('بدنه بزرگ‌تر از سقف، خطای BodyTooLarge می‌دهد',
    big.err instanceof BodyTooLarge && big.err.limit === 100, big.err?.name);

  // سقف باید حین دریافت بزند، نه بعد از جمع شدن همه‌چیز در حافظه
  let pulled = 0;
  const counted = {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < 1000; i++) { pulled += 1; yield Buffer.from('z'.repeat(100)); }
    },
  };
  await read(counted, 250);
  check('سقف حین دریافت می‌زند، نه بعدش', pulled === 3, `${pulled} تکه خوانده شد از ۱۰۰۰`);

  const exact = await read(streamOf('a'.repeat(100)), 100);
  check('بدنه دقیقاً هم‌اندازه سقف، قبول است', exact.body?.length === 100);
}

// ═══════ ۲۰. بازه سود موتور چند-سررسیدی از لبه پنجره بریده نمی‌شود ═══════
group('۲۰. بازه سود، بیرون پنجره رسم');
{
  // باگ: پنجره نمونه‌برداری [۰٫۳۵ , ۲٫۲] برابر قیمت پایه بود و بازه سود از
  // همان‌جا بریده می‌شد. هر ترکیب پوت‌دار که در سقوط شدید سود می‌داد، بازه
  // سودش «از ۳۵٪ قیمت پایه» گزارش می‌شد و احتمال سودش کم‌برآورد می‌شد.
  const legs = [
    { kind: 'put', side: 'buy', ratio: 1, strike: 1200, days: 30, size: 1000 },
    { kind: 'call', side: 'sell', ratio: 1, strike: 1400, days: 60, size: 1000 },
  ];
  const a = analyzeMixed(legs, -50000, { spot: 1000, sigma: 0.6 });

  check('بازه سود تا صفر می‌رسد، نه تا لبه پنجره', a.regions.length === 1 && a.regions[0][0] === 0,
        JSON.stringify(a.regions.map((r) => r.map((x) => Math.round(x)))));
  check('سود در قیمت‌های خیلی پایین واقعاً مثبت است', a.at(1) > 0 && a.at(300) > 0,
        `${Math.round(a.at(1))} و ${Math.round(a.at(300))}`);
  check('مرز بالای بازه دقیقاً سربه‌سری است',
        a.breakevens.length === 1 && near(a.regions[0][1], a.breakevens[0], 1e-9),
        `${a.regions[0][1]}`);
  check('در مرز، سود عملاً صفر است', Math.abs(a.at(a.breakevens[0])) < 1,
        `${a.at(a.breakevens[0])}`);

  // احتمال سود باید از حالت بریده بزرگ‌تر باشد. افق و تلاطم را جایی می‌گیریم
  // که دنباله پایین واقعاً وزن داشته باشد، وگرنه آزمون چیزی ثابت نمی‌کند:
  // در سی روز با تلاطم ۰٫۶، احتمال رسیدن به ۳۵٪ قیمت پایه عملاً صفر است و
  // هر دو عدد تا دو رقم اعشار یکی درمی‌آیند.
  const truncated = [[Math.max(1000 * 0.35, 1), a.regions[0][1]]];
  const full = probOfProfit(a, 1000, 1, 1.2);
  const cut = probOfProfit({ regions: truncated }, 1000, 1, 1.2);
  check('احتمال سود دیگر کم‌برآورد نمی‌شود', full - cut > 1,
        `${full.toFixed(2)}٪ در برابر ${cut.toFixed(2)}٪ — ${(full - cut).toFixed(2)} واحد بازیافت شد`);

  // پنجره رسم باید قیمت اعمال دور را هم بگیرد
  const far = analyzeMixed([
    { kind: 'call', side: 'buy', ratio: 1, strike: 5000, days: 30, size: 1000 },
    { kind: 'call', side: 'sell', ratio: 1, strike: 5000, days: 60, size: 1000 },
  ], -10000, { spot: 1000, sigma: 0.6 });
  const xs = far.points.map((p) => p.S);
  check('قیمت اعمال دور داخل پنجره رسم است', Math.max(...xs) >= 5000, `تا ${Math.round(Math.max(...xs))}`);

  // بدون سربه‌سری، یک بازه یکپارچه — و باید علامتش درست خوانده شود
  const allLoss = analyzeMixed([
    { kind: 'call', side: 'buy', ratio: 1, strike: 1000, days: 30, size: 1000 },
    { kind: 'call', side: 'sell', ratio: 1, strike: 1000, days: 60, size: 1000 },
  ], -300000, { spot: 1000, sigma: 0.6 });
  check('ترکیب همیشه‌زیان، هیچ بازه سودی ندارد', allLoss.regions.length === 0,
        JSON.stringify(allLoss.regions));

  // تقویمی خرید هنوز کراندار است — گروه ۱۶ نباید بشکند
  const cal = analyzeMixed([
    { kind: 'call', side: 'sell', ratio: 1, strike: 1000, days: 30, size: 1000 },
    { kind: 'call', side: 'buy', ratio: 1, strike: 1000, days: 60, size: 1000 },
  ], -200000, { spot: 1000, sigma: 0.6 });
  check('تقویمی خرید هنوز زیان کراندار دارد', cal.unlimitedLoss === false && Number.isFinite(cal.maxLoss),
        `${Math.round(cal.maxLoss)}`);
}

// ═══════════════════ ۲۱. عدد فارسی، یک‌جا و برگشت‌پذیر ═══════════════════
group('۲۱. قالب‌بندی عدد فارسی');
{
  check('رقم فارسی با جداکننده هزارگان', uiFmt.money(1234567) === '۱٬۲۳۴٬۵۶۷', uiFmt.money(1234567));
  check('منفی با نشانه ریاضی، نه خط تیره', uiFmt.money(-40500000) === '−۴۰٬۵۰۰٬۰۰۰', uiFmt.money(-40500000));
  check('بی‌نهایت نماد خودش را دارد', uiFmt.money(Infinity) === '∞' && uiFmt.money(-Infinity) === '−∞');
  check('ناعدد، خط تیره می‌شود', uiFmt.money(NaN) === '—' && uiFmt.int(undefined) === '—');
  check('اعشار با ممیز فارسی', uiFmt.pct(12.3456) === '۱۲٫۳۵', uiFmt.pct(12.3456));
  check('عدد کوچک، چهار رقم اعشار', uiFmt.num(0.0421) === '۰٫۰۴۲۱', uiFmt.num(0.0421));
  check('عدد بزرگ در num هم گروه‌بندی می‌شود', uiFmt.num(12345) === '۱۲٬۳۴۵', uiFmt.num(12345));
  check('فهرست عددی فارسی می‌شود', uiFmt.list([1000, 2500]) === '۱٬۰۰۰ , ۲٬۵۰۰', uiFmt.list([1000, 2500]));
  check('فهرست خالی، خط تیره', uiFmt.list([]) === '—');

  // منفی خیلی کوچک که به این دقت گرد به صفر می‌شود، نباید «−۰» چاپ کند —
  // به چشم انگار هنوز کمی زیان مانده، در حالی که عدد واقعی صفر است
  check('money(−۰٫۴) → صفر ساده، نه −۰', uiFmt.money(-0.4) === '۰', uiFmt.money(-0.4));
  check('pct(−۰٫۰۰۱) → صفر ساده، نه −۰٫۰۰', uiFmt.pct(-0.001) === '۰٫۰۰', uiFmt.pct(-0.001));
  check('int(−۰٫۲) → صفر ساده، نه −۰', uiFmt.int(-0.2) === '۰', uiFmt.int(-0.2));
  check('num منفی‌ای که واقعاً صفر نمی‌شود، همان منفی می‌ماند',
        uiFmt.num(-0.0001) === '−۰٫۰۰۰۱', uiFmt.num(-0.0001));
  check('منفی معمولی دست‌نخورده می‌ماند', uiFmt.money(-500) === '−۵۰۰' && uiFmt.pct(-1.5) === '−۱٫۵۰');

  // مرز گرد شدن num: شاخه‌بندی (گروه‌بندی‌شده ≥۱۰۰۰، ۴ رقم اعشار زیر ۱)
  // روی v خام تصمیم می‌گرفت؛ عددی که با گرد کردن از آستانه رد می‌شد شاخه
  // غلط را نگه می‌داشت. پ-۶ بک‌لاگ، دور سی‌ونهم.
  check('num که با گرد کردن به ۱۰۰۰ می‌رسد، جداکننده هزارگان می‌گیرد',
        uiFmt.num(999.996) === '۱٬۰۰۰', uiFmt.num(999.996));
  check('num منفی هم همان مرز را درست می‌گیرد',
        uiFmt.num(-999.996) === '−۱٬۰۰۰', uiFmt.num(-999.996));
  check('num که با گرد کردن از زیر ۱ به ۱ می‌رسد، دو رقم اعشار می‌گیرد نه چهار',
        uiFmt.num(0.99996) === '۱٫۰۰', uiFmt.num(0.99996));
  check('num دور از هر مرزی، دست‌نخورده می‌ماند',
        uiFmt.num(999.4) === '۹۹۹٫۴۰' && uiFmt.num(0.0421) === '۰٫۰۴۲۱');

  // هیچ رقم لاتینی نباید از قالب‌بند بیرون بیاید
  const latin = /[0-9]/;
  const samples = [uiFmt.money(-12345.6), uiFmt.pct(-0.5), uiFmt.num(999999), uiFmt.int(7),
                   axisNum(-40500000), axisNum(2.5e9), axisNum(45000), axisNum(120)];
  check('هیچ رقم لاتینی باقی نمی‌ماند', samples.every((s) => !latin.test(s)), samples.join(' | '));

  check('محور: میلیون و میلیارد و هزار', axisNum(2.5e9) === '۲٫۵ میلیارد' && axisNum(45000) === '۴۵ هزار',
        `${axisNum(2.5e9)} و ${axisNum(45000)}`);

  // مرز گرد شدن axisNum: همان دسته باگ دور ۳۹ (fmt.num)، این‌بار در واحد
  // محور نمودار — عددی که با گرد کردن از هزار به میلیون (یا میلیون به
  // میلیارد) رد می‌شود، باید واحد درست را نشان بدهد، نه واحد قبل از گرد شدن.
  check('axisNum که با گرد کردن از هزار به میلیون می‌رسد، واحد م می‌گیرد',
        axisNum(999960) === '۱٫۰ م', axisNum(999960));
  check('axisNum که با گرد کردن از میلیون به میلیارد می‌رسد، واحد میلیارد می‌گیرد',
        axisNum(999996000) === '۱٫۰ میلیارد', axisNum(999996000));
  check('axisNum منفی هم همان مرز را درست می‌گیرد',
        axisNum(-999960) === '−۱٫۰ م', axisNum(-999960));

  // ورودی کاربر ممکن است فارسی تایپ شود؛ باید بی‌کم‌وکاست برگردد
  check('تبدیل برگشتی، عدد قابل تجزیه می‌دهد', Number(toEnDigits('۱٬۲۳۴٫۵۶')) === 1234.56, toEnDigits('۱٬۲۳۴٫۵۶'));
  check('منفی فارسی هم برمی‌گردد', Number(toEnDigits('−۴۲')) === -42, toEnDigits('−۴۲'));
  check('رقم عربی هم پذیرفته می‌شود', Number(toEnDigits('٤٢')) === 42, toEnDigits('٤٢'));
  check('رفت و برگشت، عدد را عوض نمی‌کند',
        Number(toEnDigits(uiFmt.money(-9876543))) === -9876543, uiFmt.money(-9876543));

  // جست‌وجوی متنی (فهرست کناری تب‌ها، انتخابگر نماد): حروف عربی رایج در
  // داده رسمی (ي/ك) باید با معادل فارسی‌شان (ی/ک) یکی حساب شوند، وگرنه
  // کاربری که یکی از دو شکل را تایپ کند، نماد/تبی را که با شکل دیگر
  // نوشته شده پیدا نمی‌کند.
  check('ي عربی با ی فارسی یکی حساب می‌شود', normFa('علي') === normFa('علی'), `${normFa('علي')} vs ${normFa('علی')}`);
  check('ك عربی با ک فارسی یکی حساب می‌شود', normFa('كامل') === normFa('کامل'), `${normFa('كامل')} vs ${normFa('کامل')}`);
  check('نیم‌فاصله به فاصله ساده تبدیل می‌شود', normFa('می‌شود') === 'می شود', normFa('می‌شود'));
  check('فاصله اضافه دو طرف حذف می‌شود', normFa('  متن  ') === 'متن', `"${normFa('  متن  ')}"`);
  check('ورودی خالی/نامعتبر، رشته خالی می‌دهد', normFa(null) === '' && normFa(undefined) === '');

  check('فاصله زمانی خوانا و فارسی', faAgo(4000) === 'همین الان' && faAgo(125000) === '۲ دقیقه پیش',
        faAgo(125000));
  check('فاصله زمانی نامعتبر، خط تیره', faAgo(NaN) === '—' && faAgo(-5) === '—');
  check('ساعت با رقم فارسی و دو رقمی', faClock(new Date(2026, 7, 13, 9, 5, 3)) === '۰۹:۰۵:۰۳',
        faClock(new Date(2026, 7, 13, 9, 5, 3)));

  // برچسب حالت پوشش (خواسته ۵): چهار حالت خام core/margin.mjs باید فارسی
  // شوند و ریسک‌دار از کم‌ریسک با رنگ جدا شود، نه فقط با متن
  const latin2 = /[a-zA-Z]/;
  check('پوشش کامل، فارسی و کم‌ریسک', !latin2.test(coverageInfo('full').label) && coverageInfo('full').tone === 'gain');
  check('پوشش لخت، فارسی و ریسک‌دار', !latin2.test(coverageInfo('naked').label) && coverageInfo('naked').tone === 'loss');
  check('پوشش ناقص، فارسی و هشدار', !latin2.test(coverageInfo('partial').label) && coverageInfo('partial').tone === 'warn');
  check('بدون پای فروش، خنثی', !latin2.test(coverageInfo('none').label) && coverageInfo('none').tone === 'flat');
  check('حالت ناشناس، سقوط نمی‌کند و تن پیش‌فرض می‌دهد', coverageInfo('چیز-عجیب').tone === 'flat');

  // رنگ کارت KPI (تب موقعیت‌های من): «بازده روی سرمایه» همان علامت «سود و
  // زیان جاری» را دارد، پس باید همان رنگ را هم بگیرد — قبلاً فقط برچسبی که
  // شامل «سود» بود رنگ می‌گرفت و بازده بی‌رنگ می‌ماند، برخلاف مرز رنگی کارت
  // (style.css .kpi:has(.v.gain/.loss)) که برای همین قرار بود چشم را ببرد.
  check('کارت سود و زیان، سبز وقتی مثبت است', kpiTone('سود و زیان جاری', true) === 'gain');
  check('کارت سود و زیان، قرمز وقتی منفی است', kpiTone('سود و زیان جاری', false) === 'loss');
  check('کارت بازده روی سرمایه هم رنگ می‌گیرد، نه فقط برچسب سود', kpiTone('بازده روی سرمایه', false) === 'loss');
  check('کارت خنثی (سرمایه درگیر) بی‌رنگ می‌ماند', kpiTone('سرمایه درگیر', true) === '');
  check('کارت خنثی (موقعیت باز) بی‌رنگ می‌ماند', kpiTone('موقعیت باز', false) === '');

  // بدون موقعیت باز، «بازده روی سرمایه» نامعلوم است (تقسیم بر صفر سرمایه)
  // و باید بی‌رنگ بماند — قبلاً isGain=false (falsy از truthy نادرست) آن را
  // قرمز نشان می‌داد، انگار واقعاً زیان است. پ-۶ بک‌لاگ، دور سی‌وهفتم.
  check('isGain=null، حتی برای برچسب سود/بازده، بی‌رنگ می‌ماند',
        kpiTone('سود و زیان جاری', null) === '' && kpiTone('بازده روی سرمایه', null) === '');
  check('isGain=undefined هم همان رفتار null را دارد',
        kpiTone('بازده روی سرمایه', undefined) === '');

  // رنگ کارت KPI از روی علامت خودِ عدد (تب‌های استراتژی/برترین موقعیت‌ها):
  // «بهترین/میانه بازده ماهانه» قبلاً هیچ‌وقت رنگ نمی‌گرفت، حتی اگر بهترین
  // ردیف موجود هم زیان‌ده بود — دقیقاً همان چیزی که دور دهم می‌خواست از
  // اسکن سریع حذف کند.
  check('بازده مثبت، سبز', signTone(12.5) === 'gain');
  check('بازده منفی، قرمز', signTone(-3.2) === 'loss');
  check('صفر هم سبز حساب می‌شود (نه زیان)', signTone(0) === 'gain');
  check('بدون ردیف (NaN)، بی‌رنگ می‌ماند', signTone(NaN) === '');

  // پیام خام سرور (پ-۷ بک‌لاگ): «آخرین خطا» متن خام جاوااسکریپت بود، مثل
  // server/server.mjs:171 `${e.name}: ${e.message}` — کاربر فارسی‌زبان چیزی
  // از آن نمی‌فهمد. humanizeUpstreamError باید علت را فارسی و خوانا بگوید.
  const latin3 = /[a-zA-Z]/;
  check('خطای بی‌پاسخی، فارسی و بدون رقم/حرف لاتین',
        !latin3.test(humanizeUpstreamError('AbortError: The operation was aborted')),
        humanizeUpstreamError('AbortError: The operation was aborted'));
  check('خطای شبکه بالادست، فارسی', !latin3.test(humanizeUpstreamError('TypeError: fetch failed')),
        humanizeUpstreamError('TypeError: fetch failed'));
  check('خطای HTTP بالادست، کد را با رقم فارسی می‌گوید',
        humanizeUpstreamError('Error: HTTP 502').includes('۵۰۲'), humanizeUpstreamError('Error: HTTP 502'));
  check('جیسون خراب، فارسی', !latin3.test(humanizeUpstreamError('SyntaxError: Unexpected token')));
  check('بدون خطا، مقدار خالی می‌دهد', humanizeUpstreamError(null) === null && humanizeUpstreamError('') === null);
  check('خطای ناشناس هم سقوط نمی‌کند و فارسی می‌ماند',
        !latin3.test(humanizeUpstreamError('some odd unmapped message')));

  // عنوان تب مرورگر (پ-۶ بک‌لاگ، دور بیست‌ودوم): قبلاً عنوان همیشه ثابت بود
  // و با هیچ تبی عوض نمی‌شد؛ کاربری که چند تب مرورگر باز دارد نمی‌توانست
  // از روی نوار تب بفهمد کدام‌یک زنجیره اختیار است و کدام موقعیت‌های من.
  check('عنوان تب، نام تب را جلوی برند می‌آورد',
        pageTitle('دیده‌بان زنجیره اختیار') === 'دیده‌بان زنجیره اختیار — رصد استراتژی آپشن',
        pageTitle('دیده‌بان زنجیره اختیار'));
  check('بدون تب باز، فقط برند تنها می‌ماند', pageTitle('') === 'رصد استراتژی آپشن');
  check('بدون تب باز (undefined)، فقط برند تنها می‌ماند', pageTitle() === 'رصد استراتژی آپشن');
}

// پنل شمارنده‌های فنی به درخواست کاربر از رابط حذف شده است. حضور هرکدام از
// شناسه‌ها یا برچسب‌های آن یعنی بخشی از پنل ناخواسته برگشته است.
{
  const indexHtml = readSrc('../ui/index.html');
  const appSource = readSrc('../ui/app.mjs');
  const removedHealthPanel = [
    'health-detail', 'detail-btn', 'درخواست بالادست', 'اصابت کش',
    'تأخیر بالادست', 'سن عکس سرور', 'قطعی اتصال', 'آخرین خطا',
  ];
  check('پنل جزئیات فنی از پوسته رابط حذف مانده',
    removedHealthPanel.every((text) => !indexHtml.includes(text)),
    removedHealthPanel.filter((text) => indexHtml.includes(text)).join('، '));
  check('کد پوسته دیگر به عناصر پنل حذف‌شده دسترسی ندارد',
    !/\b(?:health-detail|detail-btn|d-req|d-cache|d-ms|d-age|d-drops|d-err)\b/.test(appSource));
}

// ═══════════════ ۲۲. چیدمان ستون: جابه‌جایی و افزودن ═══════════════
group('۲۲. چیدمان ستون');
{
  const K = ['a', 'b', 'c', 'd'];
  const ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];

  check('ستون به جای مقصد می‌نشیند، رو به جلو',
        moveColumn(K, 'a', 'c').join('') === 'bcad', moveColumn(K, 'a', 'c').join(''));
  check('و رو به عقب هم همان‌طور',
        moveColumn(K, 'd', 'b').join('') === 'adbc', moveColumn(K, 'd', 'b').join(''));
  check('جابه‌جایی با خودش، چیزی را عوض نمی‌کند', moveColumn(K, 'b', 'b').join('') === 'abcd');
  check('کلید ناموجود، فهرست را دست‌نخورده برمی‌گرداند',
        moveColumn(K, 'z', 'b').join('') === 'abcd' && moveColumn(K, 'b', 'z').join('') === 'abcd');
  check('ورودی دست‌کاری نمی‌شود', (moveColumn(K, 'a', 'd'), K.join('') === 'abcd'));
  check('طول همیشه حفظ می‌شود', moveColumn(K, 'a', 'd').length === 4);

  // افزودن، وقتی کاربر چیزی جابه‌جا نکرده: جای قراردادی
  check('ستون تازه سر جای قراردادی می‌نشیند',
        insertColumn(['a', 'c', 'e'], 'b', ORDER).join('') === 'abce',
        insertColumn(['a', 'c', 'e'], 'b', ORDER).join(''));
  check('ستونی که از همه بعدتر است، ته صف می‌رود',
        insertColumn(['a', 'b'], 'f', ORDER).join('') === 'abf');
  check('ستونی که از همه جلوتر است، سر صف می‌رود',
        insertColumn(['c', 'd'], 'a', ORDER).join('') === 'acd');

  // افزودن، وقتی چیدمان دستی شده: نباید به کار کاربر دست بزند
  const manual = ['d', 'a', 'c'];
  const after = insertColumn(manual, 'b', ORDER);
  check('چیدمان دستی با افزودن ستون خراب نمی‌شود',
        after.slice(0, 3).join('') === 'dac' && after[3] === 'b', after.join(''));
  check('ستون تکراری دوباره اضافه نمی‌شود',
        insertColumn(['a', 'b'], 'b', ORDER).join('') === 'ab');
  check('افزودن هم ورودی را دست‌کاری نمی‌کند',
        (insertColumn(manual, 'b', ORDER), manual.join('') === 'dac'));

  // رفت و برگشت: جابه‌جایی و برگرداندن، به همان نقطه اول می‌رسد
  const moved = moveColumn(K, 'a', 'c');
  check('جابه‌جایی برگشت‌پذیر است', moveColumn(moved, 'a', 'a').join('') === moved.join(''));

  // نشان «تغییر کرد» اسکن پیوسته (پ-۶ بک‌لاگ): rowClass از قبل r.__flash
  // را می‌خواند ولی هیچ‌جا نوشته نمی‌شد — changedIds همان نویسنده است.
  const prev = [{ id: 'x', v: 10 }, { id: 'y', v: 20 }, { id: 'z', v: 30 }];
  check('اولین اسکن (بدون prevRows)، چیزی فلش نمی‌گیرد',
        changedIds(null, prev, 'v').size === 0);
  const next = [{ id: 'x', v: 10 }, { id: 'y', v: 25 }, { id: 'z', v: 30 }, { id: 'w', v: 5 }];
  check('فقط ردیفی که مقدارش واقعاً عوض شده فلش می‌گیرد',
        [...changedIds(prev, next, 'v')].join('') === 'y');
  check('ردیف تازه (بدون سابقه در prevRows) فلش نمی‌گیرد',
        !changedIds(prev, next, 'v').has('w'));
  check('تغییر ناچیز کف شناوری، فلش نمی‌گیرد',
        changedIds([{ id: 'x', v: 10 }], [{ id: 'x', v: 10 + 1e-12 }], 'v').size === 0);
  check('کلید نامعتبر یا نبود، مجموعه خالی می‌دهد',
        changedIds(prev, next, null).size === 0 && changedIds(prev, next, undefined).size === 0);
  check('مقدار غیرعددی در هیچ سمتی، فلش نمی‌گیرد',
        changedIds([{ id: 'x', v: NaN }], [{ id: 'x', v: 10 }], 'v').size === 0);
}

// ═══════════════ ۲۳. کش سرور: سقف ورودی ═══════════════
group('۲۳. کش سرور، سقف ورودی');
{
  const fresh = () => new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5]]);

  const under = fresh();
  evictOldest(under, 10);
  check('زیر سقف، دست‌نخورده می‌ماند', under.size === 5 && under.has('a'));

  const exact = fresh();
  evictOldest(exact, 5);
  check('دقیقاً هم‌اندازه سقف، چیزی حذف نمی‌شود', exact.size === 5);

  const over = fresh();
  evictOldest(over, 3);
  check('بالای سقف، قدیمی‌ترین‌ها حذف می‌شوند', over.size === 3,
        [...over.keys()].join(''));
  check('آنچه می‌ماند، تازه‌ترین‌هاست',
        !over.has('a') && !over.has('b') && over.has('c') && over.has('d') && over.has('e'));

  const toOne = fresh();
  evictOldest(toOne, 1);
  check('سقف یک، فقط تازه‌ترین می‌ماند', toOne.size === 1 && toOne.has('e'));

  const growing = new Map();
  for (let i = 0; i < 20; i++) { growing.set(`k${i}`, i); evictOldest(growing, 5); }
  check('افزودن پیاپی هرگز از سقف رد نمی‌شود', growing.size === 5);
  check('بعد از رشد پیاپی، فقط پنج‌تای آخر می‌ماند',
        growing.has('k19') && growing.has('k15') && !growing.has('k14'),
        [...growing.keys()].join(','));
}

// ═══════════════ ۲۴. عقب‌نشینی حلقه دیده‌بان ═══════════════
group('۲۴. عقب‌نشینی حلقه دیده‌بان');
{
  check('بدون شکست، فاصله عادی', watchBackoffSec(5, 0) === 5);
  check('شکست منفی هم مثل صفر رفتار می‌کند', watchBackoffSec(5, -1) === 5);
  check('یک شکست، دو برابر', watchBackoffSec(5, 1) === 10);
  check('دو شکست، چهار برابر', watchBackoffSec(5, 2) === 20);
  check('رشد نمایی ادامه دارد', watchBackoffSec(5, 4) === 80);
  check('به سقف که رسید، فراتر نمی‌رود', watchBackoffSec(5, 10, 300) === 300,
        watchBackoffSec(5, 10, 300));
  check('سقف قابل تنظیم است', watchBackoffSec(5, 10, 60) === 60);
  check('فاصله عادی هم از سقف رد نمی‌شود', watchBackoffSec(500, 0, 300) === 500,
        'فاصله پایه دست کاربر است، سقف فقط رشد نمایی را می‌بندد');
}

// ═════════════════════ ۲۵. تلاطم ضمنی، نیوتن روی وگا ═════════════════════
group('۲۵. تلاطم ضمنی، نیوتن روی وگا');
{
  const r = 0.25, q = 0.03;
  const grid = [];
  for (const S of [5000, 20000, 100000]) {
    for (const m of [0.5, 0.8, 0.95, 1.0, 1.05, 1.2, 2.0]) { // نسبت اعمال به پایه
      for (const T of [0.02, 0.1, 0.5, 1.5]) {
        for (const sig of [0.08, 0.3, 0.65, 1.5, 2.8]) {
          grid.push({ S, K: S * m, T, sig });
        }
      }
    }
  }
  // در ناحیه خیلی در پول یا خیلی بی‌پول با سررسید کوتاه، وگا عملاً صفر
  // است: قیمت روی بازه وسیعی از تلاطم تقریباً ثابت می‌ماند، پس بازیابی
  // تلاطم از قیمت ذاتاً بدشرط است — چه با تنصیف صرف، چه با نیوتن. آن
  // مواردها اینجا کنار گذاشته می‌شوند؛ آزمون جدا زیر همان حالت را می‌سنجد.
  let worst = 0;
  for (const { S, K, T, sig } of grid) {
    for (const kind of ['call', 'put']) {
      const mkt = bsPrice(kind, S, K, T, r, q, sig);
      const [a] = d1d2(S, K, T, r, q, sig);
      const dq = Math.exp(-q * T);
      const vega = S * dq * npdf(a) * Math.sqrt(T);
      if (vega / Math.max(1, mkt) < 1e-3) continue; // ناحیه بدشرط، رد شود
      const iv = impliedVol(kind, mkt, S, K, T, r, q, { lo: 0.01, hi: 5 });
      if (!Number.isFinite(iv)) continue; // خارج از باند نظری، رفتار قبلی هم NaN بود
      worst = Math.max(worst, Math.abs(iv - sig));
    }
  }
  check('نیوتن+تنصیف روی کل شبکه هم‌تراز با تلاطم واقعی همگرا می‌شود',
    worst < 2e-3, `بیشترین اختلاف ${worst.toExponential(2)}`);

  // شبیه‌ترین حالت به رفتار قبلی: نیوتن خاموش، فقط تنصیف صرف.
  {
    const S = 20000, K = 24000, T = 0.3, sig = 0.55;
    const mkt = bsPrice('call', S, K, T, r, q, sig);
    const ivBisect = impliedVol('call', mkt, S, K, T, r, q, { newtonIters: 0 });
    const ivNewton = impliedVol('call', mkt, S, K, T, r, q, {});
    check('نیوتن خاموش هم به همان جواب می‌رسد', near(ivBisect, ivNewton, 1e-6),
      `${ivBisect.toFixed(6)} ~ ${ivNewton.toFixed(6)}`);
  }

  // وگای تقریباً صفر: عمیق در پول و نزدیک سررسید. بازیابی خودِ تلاطم اینجا
  // ذاتاً بدشرط است (قیمت روی بازه‌ای وسیع از سیگما تقریباً ثابت می‌ماند و
  // نیوتن، تنصیف صرف را به یک جواب دیگرِ همان بازه بی‌اعتبار می‌رساند) —
  // پس معیار درست بودن نزدیکی به sig یا به جواب تنصیف صرف نیست. معیار
  // خودِ قرارداد تابع است: جواب داخل کران بماند و قیمتش را واقعاً برگرداند.
  {
    const S = 20000, K = 500, T = 0.01, sig = 0.4; // کال عمیق در پول
    const mkt = bsPrice('call', S, K, T, r, q, sig);
    const iv = impliedVol('call', mkt, S, K, T, r, q, { lo: 0.01, hi: 5 });
    check('وگای نزدیک صفر، جواب داخل کران می‌ماند', iv >= 0.01 && iv <= 5);
    check('وگای نزدیک صفر، قیمت بازسازی‌شده با بازار می‌خواند',
      near(bsPrice('call', S, K, T, r, q, iv), mkt, 1e-3),
      `${bsPrice('call', S, K, T, r, q, iv).toFixed(3)} ~ ${mkt.toFixed(3)}`);
  }

  check('زیر کف نظری هنوز نامعلوم می‌دهد',
    !Number.isFinite(impliedVol('call', 1, 20000, 10000, 0.5, 0.3, 0, {})));
  check('بالای سقف نظری هنوز نامعلوم می‌دهد',
    !Number.isFinite(impliedVol('put', 25000, 20000, 10000, 0.5, 0.3, 0, { hi: 5 })));
}

// ═════════════════ ۲۶. فیلترهای نقدشوندگی غربال (قلم الف-۲ بک‌لاگ) ═════════════════
group('۲۶. فیلترهای نقدشوندگی غربال');
{
  // یک رکورد دیده‌بان مصنوعی با کنترل کامل روی موقعیت باز، حجم و ارزش معاملات
  const mkRow2 = (strike, ua, oi, vol, value) => ({
    uaInsCode: ua, lval30_UA: `پایه${ua}`, pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${ua}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${ua}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: 30, endDate: 20260101,
    pMeDem_C: 3000, qTitMeDem_C: 50, pMeOf_C: 3150, qTitMeOf_C: 50,
    pDrCotVal_C: 3000, pClosing_C: 3000, oP_C: oi, qTotTran5J_C: vol, qTotCap_C: value,
    pMeDem_P: 3000, qTitMeDem_P: 50, pMeOf_P: 3150, qTitMeOf_P: 50,
    pDrCotVal_P: 3000, pClosing_P: 3000, oP_P: oi, qTotTran5J_P: vol, qTotCap_P: value,
  });

  // دو قیمت اعمال، یک نماد پایه؛ نقدشوندگی سرشناخته برای هر پا
  const rows2 = [
    mkRow2(95000, 'L', 500, 1000, 300000000),
    mkRow2(105000, 'L', 500, 1000, 300000000),
  ];
  const chainL = buildChain(rows2);
  const s0 = { ...defaults(), comboWindowPct: 25, wingsEqualWidth: true, greeksInScan: false };

  const base = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: s0 });
  check('پایه، بدون فیلتر نقدشوندگی، ردیف می‌دهد', base.rows.length > 0, `${base.rows.length} ردیف`);

  // موقعیت باز ۵۰۰ است؛ سقف بالاتر باید فروش کال بدون پوشش را بیندازد —
  // این همان فیلتری بود که با «missing = missing || false» هرگز اجرا نمی‌شد
  const byOi = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minOpenInt: 600 } });
  check('حداقل موقعیت باز واقعاً اعمال می‌شود (باگ قبلی: هیچ‌وقت اعمال نمی‌شد)',
    byOi.rows.length === 0, `${base.rows.length} → ${byOi.rows.length}`);
  const byOiOk = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minOpenInt: 400 } });
  check('حداقل موقعیت باز زیر واقعی، ردیف را نمی‌اندازد', byOiOk.rows.length === base.rows.length);

  // حجم مظنه فروش ۵۰ است؛ سقف بالاتر همان مسیر باگ‌دار را می‌سنجد
  const byBidQty = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minBidQty: 100 } });
  check('حداقل حجم مظنه هم روی همان مسیر واقعاً اعمال می‌شود', byBidQty.rows.length === 0);

  // حجم معاملات امروز هر پا ۱۰۰۰ است؛ فیلتر تازه
  const byVol = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minLegVol: 1500 } });
  check('حداقل حجم معاملات هر پا (فیلتر تازه) رعایت می‌شود', byVol.rows.length === 0);
  const byVolOk = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minLegVol: 500 } });
  check('حداقل حجم معاملات زیر واقعی، ردیف را نمی‌اندازد', byVolOk.rows.length === base.rows.length);

  // ارزش معاملات امروز هر پا ۳۰۰ میلیون ریال است؛ فیلتر تازه
  const byValue = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minLegValue: 400000000 } });
  check('حداقل ارزش معاملات هر پا (فیلتر تازه) رعایت می‌شود', byValue.rows.length === 0);
  const byValueOk = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minLegValue: 100000000 } });
  check('حداقل ارزش معاملات زیر واقعی، ردیف را نمی‌اندازد', byValueOk.rows.length === base.rows.length);

  // نقدشوندگی زنجیره: مجموع ارزش کل زنجیره همین پایه = ۲ پا × ۲ سمت × ۳۰۰م = ۱٬۲۰۰٬۰۰۰٬۰۰۰
  const combos = generateCombos(byId('naked-call'), chainL.get('L'), { ...s0, minUaLiquidity: 1500000000 });
  check('نقدشوندگی زنجیره پایین‌تر از آستانه، کل پایه را حذف می‌کند (نه فقط یک پا)',
    combos.length === 0, `${combos.length} ترکیب`);
  const combosOk = generateCombos(byId('naked-call'), chainL.get('L'), { ...s0, minUaLiquidity: 1000000000 });
  check('نقدشوندگی زنجیره بالاتر از آستانه، دست‌نخورده می‌ماند', combosOk.length > 0, `${combosOk.length} ترکیب`);
}

// ═══════ ۲۷. فهرست بازار — تلاطم ضمنی، نسبت پوت به کال، نزدیک‌ترین سررسید (قلم الف-۴ بک‌لاگ) ═══════
group('۲۷. فهرست بازار — تلاطم ضمنی، نسبت پوت به کال، نزدیک‌ترین سررسید');
{
  const spot = 100000, sigma = 0.5, rFree = 0.30;
  const atmPrice = bsPrice('call', spot, spot, 20 / 365, rFree, 0, sigma);

  const mkRow3 = (strike, days, closePx, oi = 100) => ({
    uaInsCode: 'M', lval30_UA: 'ماکت', pDrCotVal_UA: spot, pClosing_UA: spot, priceYesterday_UA: spot,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: closePx * 0.98, qTitMeDem_C: 10, pMeOf_C: closePx * 1.02, qTitMeOf_C: 10,
    pDrCotVal_C: closePx, pClosing_C: closePx, oP_C: oi, qTotTran5J_C: 50,
    pMeDem_P: closePx * 0.98, qTitMeDem_P: 10, pMeOf_P: closePx * 1.02, qTitMeOf_P: 10,
    pDrCotVal_P: closePx, pClosing_P: closePx, oP_P: oi * 4, qTotTran5J_P: 50,
  });

  const rows3 = [
    mkRow3(100000, 20, atmPrice),      // نزدیک‌ترین پول، نزدیک‌ترین سررسید
    mkRow3(95000, 20, atmPrice * 1.3),
    mkRow3(100000, 60, atmPrice * 1.5), // سررسید دورتر
  ];
  const chain3 = buildChain(rows3);
  const list3 = underlyingList(chain3, { rFree, divYield: 0 });
  check('یک نماد در فهرست', list3.length === 1, `${list3.length}`);
  const u = list3[0];
  check('نزدیک‌ترین سررسید همان سررسید نزدیک‌تر است', u.nearestDays === 20, `${u.nearestDays}`);
  check('نسبت پوت به کال از موقعیت باز کل زنجیره حساب می‌شود',
    near(u.pcRatio, 4, 1e-9), `${u.pcRatio}`);
  check('تلاطم ضمنی نزدیک‌ترین پول، سیگمای واقعی مولد قیمت را بازمی‌گرداند',
    Number.isFinite(u.atmIv) && near(u.atmIv, sigma, 1e-3), `${u.atmIv}`);

  // پیش‌فرض بدون rFree/divYield هم باید کار کند — همان مسیری که ریسه اسکن می‌رود
  const listDef = underlyingList(chain3);
  check('بدون rFree/divYield هم تلاطم ضمنی عدد متناهی می‌دهد', Number.isFinite(listDef[0].atmIv));
}

// ═══════ ۲۸. غربال روی کل کاتالوگ — برترین موقعیت‌ها (قلم الف-۳ بک‌لاگ) ═══════
group('۲۸. غربال روی کل کاتالوگ — برترین موقعیت‌ها');
{
  const mkRow4 = (strike, days, cBid, pBid) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: 100, pMeOf_C: cBid * 1.05, qTitMeOf_C: 100,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: pBid, qTitMeDem_P: 100, pMeOf_P: pBid * 1.05, qTitMeOf_P: 100,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 800,
  });
  const rows4 = [];
  for (const k of [90000, 95000, 100000, 105000, 110000]) {
    rows4.push(mkRow4(k, 30, Math.max(200, 100000 - k + 4000), Math.max(200, k - 100000 + 4000)));
    rows4.push(mkRow4(k, 90, Math.max(300, 100000 - k + 7000), Math.max(300, k - 100000 + 7000)));
  }
  const chain4 = buildChain(rows4);
  const s4 = { ...defaults(), comboWindowPct: 25, wingsEqualWidth: true, greeksInScan: false };
  const feasible = CATALOG.filter((d) => d.feasible);

  const single = scanFn({ def: byId('naked-call'), chain: chain4, uaKeys: ['1'], settings: s4 });
  const all = scanAll({ defs: feasible, chain: chain4, uaKeys: ['1'], settings: s4, limit: 500 });

  check('نتیجه کل، ردیف‌های تک‌استراتژی را هم شامل می‌شود',
    single.rows.every((r) => all.rows.some((x) => x.id === r.id)), `تک ${single.rows.length} از کل ${all.rows.length}`);
  check('نتیجه بیش از یک استراتژی دارد',
    new Set(all.rows.map((r) => r.strategyId)).size > 1, `${new Set(all.rows.map((r) => r.strategyId)).size} استراتژی`);
  check('هر ردیف نام و شناسه استراتژی خودش را حمل می‌کند', all.rows.every((r) => r.strategy && r.strategyId));

  const capped = scanAll({ defs: feasible, chain: chain4, uaKeys: ['1'], settings: s4, limit: 5 });
  check('سقف limit واقعاً رعایت می‌شود', capped.rows.length === 5, `${capped.rows.length}`);
  check('کل تعداد پیش از برش هم گزارش می‌شود، و کمتر از خودِ برش نیست',
    capped.total >= capped.rows.length, `کل ${capped.total} ، برش ${capped.rows.length}`);

  const by = s4.rankBy;
  const vals = capped.rows.map((r) => r[by]).filter(Number.isFinite);
  check('رتبه‌بندی نزولی روی کل ادغام‌شده از چند استراتژی حفظ می‌شود',
    vals.length > 1 && vals.every((v, i) => i === 0 || vals[i - 1] >= v), vals.join(' , '));

  check('نوار تشخیص هم روی کل جمع می‌زند', all.funnel.built >= single.funnel.built,
    `کل ${all.funnel.built} ، تک ${single.funnel.built}`);

  // ——— تجمیع، همان چیزی را بگوید که تک‌تک گفتند ———
  //
  // گزارش آزمون واقعی: «`scanAll.total=3288` در برابر `sum(scan.total)=4593`».
  // ریشه: هر `scan` ردیف‌هایش را در `topN` می‌بُرد و `scanAll` طولِ آرایهٔ
  // به‌هم‌چسبیدهٔ همان بریده‌ها را «کل» گزارش می‌کرد. یعنی پیام «از X ردیف»
  // در رابط، هرچه استراتژی بیشتر و topN کوچک‌تر، غلط‌تر می‌شد.
  //
  // topN عمداً کوچک است تا برش قطعاً اتفاق بیفتد؛ با topN بزرگ این باگ
  // اصلاً خودش را نشان نمی‌دهد.
  const sTight = { ...s4, topN: 3 };
  const perDef = feasible.map((def) => scanFn({ def, chain: chain4, uaKeys: ['1'], settings: sTight }));
  const merged = scanAll({ defs: feasible, chain: chain4, uaKeys: ['1'], settings: sTight, limit: 500 });
  const sumOf = (key) => perDef.reduce((a, r) => a + r.funnel[key], 0);
  const sumTotal = perDef.reduce((a, r) => a + r.total, 0);

  check('برش تک‌استراتژی واقعاً اتفاق افتاده — وگرنه این گروه چیزی را نمی‌سنجد',
    sumTotal > merged.rows.length, `کل ${sumTotal} ، پس از برش ${merged.rows.length}`);
  check('«کل» تجمیعی، جمع کلِ هر استراتژی است نه طول آرایهٔ بریده‌شده',
    merged.total === sumTotal, `${merged.total} در برابر ${sumTotal}`);
  for (const k of ['built', 'noQuote', 'refBasis', 'noDepth', 'filtered', 'kept', 'blockedExpiry', 'evaluated']) {
    check(`سطل «${k}» در تجمیع گم نمی‌شود`, merged.funnel[k] === sumOf(k),
      `${merged.funnel[k]} در برابر ${sumOf(k)}`);
  }
  // `evaluated` پیش از این در `FUNNEL_KEYS` نبود و همیشه صفر می‌ماند —
  // ادعای «هیچ ترکیبی ارزیابی نشد» در نمایی که هزاران‌تا ارزیابی کرده بود.
  check('شمار ارزیابی‌شده در نمای کلی صفر نمی‌ماند', merged.funnel.evaluated > 0,
    `${merged.funnel.evaluated}`);

  // «به سقف خورد» بولی است؛ با جمعِ عددی تجمیع نمی‌شود و باید با «یا» بیاید،
  // وگرنه هشدار سقفِ یک استراتژی در نمای کلی پنهان می‌ماند.
  const sCap = { ...s4, maxRows: 2 };
  const perCap = feasible.map((def) => scanFn({ def, chain: chain4, uaKeys: ['1'], settings: sCap }));
  const mergedCap = scanAll({ defs: feasible, chain: chain4, uaKeys: ['1'], settings: sCap, limit: 500 });
  check('اگر حتی یک استراتژی به سقف بخورد، نمای کلی هم می‌گوید',
    perCap.some((r) => r.funnel.capped) && mergedCap.funnel.capped === true);
  check('بدون برخورد به سقف، پرچم سقف روشن نمی‌شود',
    perDef.every((r) => !r.funnel.capped) && merged.funnel.capped === false);
}

// ═══════════════ ۲۹. ماشین زمان — شبیه‌سازی بلک-شولز روی تاریخچه ═══════════════
group('۲۹. ماشین زمان');
{
  const K = 100000;
  const size = 1000;
  const legLongCall = [{ kind: 'call', side: 'buy', ratio: 1, strike: K, size }];
  const flatCloses = Array.from({ length: 10 }, (_, i) => ({ date: 20260100 + i, close: K }));

  const r0 = timeMachine(legLongCall, flatCloses, { daysToday: 30, sigma: 0.5 });
  check('روز ورود (اولین ردیف)، سود و زیان دقیقاً صفر', r0[0].pnl === 0, r0[0].pnl);
  check('طول خروجی برابر طول ورودی', r0.length === flatCloses.length, r0.length);

  // بدون تغییر قیمت پایه، فقط گذر زمان: کال خرید با تلاطم مثبت باید کمی
  // ارزش زمانی از دست بدهد (تتای منفی) چون داریم به سررسید نزدیک می‌شویم
  check('در پول بدون حرکت پایه، گذر زمان روی کال خرید یعنی زیان (تتای منفی)',
    r0[r0.length - 1].pnl < 0, r0[r0.length - 1].pnl);

  // T باید یکنوا کاهشی باشد، چون هر ردیف بعدی به امروز نزدیک‌تر است
  check('روز باقیمانده تا سررسید یکنوا کاهشی است',
    r0.every((r, i) => i === 0 || r.daysLeft <= r0[i - 1].daysLeft), r0.map((r) => r.daysLeft).join(' , '));

  // صعود شدید پایه در آخرین روز باید سود قابل توجه بدهد، و دقیقاً برابر
  // تفاضل bsPrice همان روز با bsPrice روز ورود (هویت جبری، نه فقط علامت)
  const bumped = [...flatCloses];
  bumped[bumped.length - 1] = { ...bumped[bumped.length - 1], close: K * 1.3 };
  const r1 = timeMachine(legLongCall, bumped, { daysToday: 30, sigma: 0.5 });
  const last = r1[r1.length - 1];
  const entryPx = bsPrice('call', K, K, (30 + bumped.length - 1) / 365, 0, 0, 0.5);
  const lastPx = bsPrice('call', K * 1.3, K, Math.max(30, 0.5) / 365, 0, 0, 0.5);
  check('صعود ۳۰٪ پایه، سود قابل‌توجه می‌دهد', last.pnl > 0, last.pnl);
  check('سود دقیقاً برابر تفاضل قیمت بلک-شولز دو روز است (هویت جبری)',
    near(last.pnl, (lastPx - entryPx) * size, 1e-6), `${last.pnl} ~ ${(lastPx - entryPx) * size}`);

  // فروش، علامت برعکس همان خرید — از یک تابع واحد می‌آید، نه شاخه جدا
  const legShort = [{ kind: 'call', side: 'sell', ratio: 1, strike: K, size }];
  const r2 = timeMachine(legShort, bumped, { daysToday: 30, sigma: 0.5 });
  check('فروش همان کال، دقیقاً علامت برعکس خرید',
    near(r2[r2.length - 1].pnl, -last.pnl, 1e-6), r2[r2.length - 1].pnl);

  // ورودی نامعتبر سقوط نمی‌کند
  check('بدون تاریخچه، فهرست خالی برمی‌گرداند', timeMachine(legLongCall, [], { daysToday: 30, sigma: 0.5 }).length === 0);
  check('تلاطم نامعتبر، فهرست خالی برمی‌گرداند',
    timeMachine(legLongCall, flatCloses, { daysToday: 30, sigma: 0 }).length === 0);
}

// ═══ ۳۰. افق ارزش‌گذاری قابل‌بازنویسی — منحنی «امروز» کنار «سررسید» ═══
group('۳۰. افق ارزش‌گذاری قابل‌بازنویسی');
{
  // پیش‌فرض دست‌نخورده: بدون horizonDays، همان رفتار قبلی (افق = نزدیک‌ترین
  // سررسید) — این تضمین می‌کند اضافه‌کردن پارامتر تازه هیچ استفاده قبلی را
  // نمی‌شکند.
  const legs20 = [
    { kind: 'put', side: 'buy', ratio: 1, strike: 1200, days: 30, size: 1000 },
    { kind: 'call', side: 'sell', ratio: 1, strike: 1400, days: 60, size: 1000 },
  ];
  const withoutOverride = analyzeMixed(legs20, -50000, { spot: 1000, sigma: 0.6 });
  const explicitDefault = analyzeMixed(legs20, -50000, { spot: 1000, sigma: 0.6, horizonDays: 30 });
  check('بدون horizonDays همان افق پیش‌فرض (نزدیک‌ترین سررسید) است',
    near(withoutOverride.at(1300), explicitDefault.at(1300), 1e-9),
    `${withoutOverride.at(1300)} ~ ${explicitDefault.at(1300)}`);

  // یک کال تک‌پا، horizonDays=0 یعنی «امروز»: هیچ پایی سررسید نشده، پس
  // سود و زیان دقیقاً برابر قیمت بلک-شولز است، نه ارزش ذاتی تکه‌ای-خطی —
  // هویت جبری، نه فقط علامت.
  const K = 1000, size = 1000, sigma = 0.5, days = 30, r = 0.3, q = 0;
  const premium = bsPrice('call', 1000, K, days / 365, r, q, sigma);
  const legCall = [{ kind: 'call', side: 'buy', ratio: 1, strike: K, days, size }];
  const today = analyzeMixed(legCall, -premium * size, { spot: 1000, sigma, rFree: r, divYield: q, horizonDays: 0 });
  const S2 = 1050;
  const expectedToday = (bsPrice('call', S2, K, days / 365, r, q, sigma) - premium) * size;
  check('منحنی امروز دقیقاً از قیمت بلک-شولز می‌آید (هویت جبری)',
    near(today.at(S2), expectedToday, 1e-6), `${today.at(S2)} ~ ${expectedToday}`);

  // درست همان ترکیب، امروز و سررسید باید در نقطه اعمال فرق کنند — چون
  // امروز هنوز ارزش زمانی دارد، سررسید فقط ارزش ذاتی. اگر یکی بودند یعنی
  // پارامتر افق اصلاً اثر نکرده.
  const expiry = analyzeMixed(legCall, -premium * size, { spot: 1000, sigma, rFree: r, divYield: q, horizonDays: days });
  check('امروز با سررسید در نقطه اعمال متفاوت است — ارزش زمانی هنوز هست',
    Math.abs(today.at(K) - expiry.at(K)) > size * 1,
    `امروز ${Math.round(today.at(K))} ، سررسید ${Math.round(expiry.at(K))}`);
}

// ═══ ۳۱. مقایسه با موقعیت‌های دیگر هم‌نماد (قلم الف-۱ بک‌لاگ) ═══
group('۳۱. مقایسه با موقعیت‌های دیگر هم‌نماد روی نمودار بازده');
{
  // ——— انتخاب نامزد: فقط هم‌نماد، به‌جز ردیف خودش، سقف ده‌تا ———
  const rows31 = [
    { id: 'a', underlying: 'خودرو', legsText: 'خرید کال ۱۰۰۰', strategy: 'اسپرد' },
    { id: 'b', underlying: 'خودرو', legsText: 'فروش پوت ۹۰۰', strategy: 'کاورد' },
    { id: 'c', underlying: 'فولاد', legsText: 'خرید کال ۲۰۰۰', strategy: 'اسپرد' },
  ];
  const cands31 = sameUnderlyingCandidates(rows31, rows31[0]);
  check('فقط هم‌نمادها می‌آیند، به‌جز خود ردیف',
    cands31.length === 1 && cands31[0].id === 'b', cands31.map((c) => c.id).join(','));
  check('بدون ردیف انتخاب‌شده، فهرست خالی است', sameUnderlyingCandidates(rows31, null).length === 0);

  const many31 = Array.from({ length: 15 }, (_, i) => ({ id: `x${i}`, underlying: 'خودرو', legsText: `ترکیب ${i}` }));
  check('فهرست نامزدها سقف ده‌تا دارد', sameUnderlyingCandidates([rows31[0], ...many31], rows31[0]).length === 10);

  // ——— برچسب کوتاه ———
  check('برچسب کوتاه دست‌نخورده می‌ماند', compareLabel({ legsText: 'کوتاه' }) === 'کوتاه');
  const longLabel = compareLabel({ strategy: 'استراتژی خیلی طولانی', legsText: 'خرید کال ۱۰۰۰۰ و فروش کال ۲۰۰۰۰ و بازهم بیشتر' });
  check('برچسب بلند با سه‌نقطه بریده می‌شود', longLabel.length === 22 && longLabel.endsWith('…'), longLabel);
  check('سقف مقایسه هم‌زمان ۴ است', MAX_COMPARE === 4);

  // ——— برچسب کامل، برای tooltip روی legend نمودار (دور ۱۸ پ-۶) ———
  const rowLong31 = { strategy: 'استراتژی خیلی طولانی', legsText: 'خرید کال ۱۰۰۰۰ و فروش کال ۲۰۰۰۰ و بازهم بیشتر' };
  check('برچسب کامل هرگز بریده نمی‌شود',
    compareFullLabel(rowLong31) === 'استراتژی خیلی طولانی — خرید کال ۱۰۰۰۰ و فروش کال ۲۰۰۰۰ و بازهم بیشتر');
  check('برچسب کامل با شروع برچسب کوتاه یکی است',
    compareFullLabel(rowLong31).startsWith(compareLabel(rowLong31).slice(0, -1)));
  const rowShort31 = { legsText: 'کوتاه' };
  check('برچسب کوتاه و کامل برای متن کوتاه یکسانند', compareFullLabel(rowShort31) === compareLabel(rowShort31));

  // منحنی و legend مقایسه‌ای خودشان در chart.mjs رسم می‌شوند (وارد کردن مطلق
  // `/core/...` دارد، پس در Node قابل import نیست) — رسم واقعی با Playwright
  // در پنل جزئیات تب استراتژی/برترین موقعیت‌ها تأیید می‌شود، نه اینجا.
}

// ═══ ۳۲. بازپخش تاریخی — ورود مستقل، آفست روزانه، داده گمشده ═══
group('۳۲. بازپخش تاریخی استراتژی');
{
  const base32 = [
    { date: 20260801, close: 100, last: 101, low: 98, high: 103 },
    { date: 20260802, close: 110, last: 111, low: 105, high: 113 },
    { date: 20260803, close: 105, last: 106, low: 102, high: 109 },
  ];
  const call32 = [
    { date: 20260801, close: 10, last: 11, low: 9, high: 12 },
    { date: 20260802, close: 7, last: 6, low: 5, high: 8 },
  ];
  const put32 = [
    { date: 20260801, close: 8, last: 9, low: 7, high: 10 },
    { date: 20260802, close: 5, last: 4, low: 3, high: 6 },
    { date: 20260803, close: 4, last: 3, low: 2, high: 5 },
  ];
  const legs32 = [
    { ins: '11', name: 'پوت', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 90, expiry: 20260820 },
    { ins: '12', name: 'کال', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 110, expiry: 20260820 },
  ];
  const args32 = {
    legs: legs32, baseIns: '1', startDate: 20260801, endDate: 20260803,
    entryBasis: 'CLOSE', exitBasis: 'LAST', units: 1,
    seriesByIns: { 1: base32, 11: put32, 12: call32 },
    fees: { buyStock: 0, sellStock: 0, option: 0, exercise: 0 },
    settings: defaults(),
  };
  const replay32 = replayHistory(args32);
  check('بازپخش تاریخی با قیمت ورود پایانی ساخته می‌شود', replay32.ok && replay32.priced[0].price === 8 && replay32.priced[1].price === 10);
  check('پرداختی، دریافتی و خالص ورود جدا گزارش می‌شوند', replay32.entry.cashPaid === 0 && replay32.entry.cashReceived === 18000 && replay32.entry.netCash === 18000);
  check('آفست روز دوم با آخرین، سود ناخالص درست می‌دهد', replay32.rows[1].grossPnl === 8000, replay32.rows[1].grossPnl);
  check('تغییر روزانه پایه محاسبه می‌شود', near(replay32.rows[1].baseDailyPct, 10, 1e-9), replay32.rows[1].baseDailyPct);
  check('تغییر تجمعی پایه از روز ورود محاسبه می‌شود', near(replay32.rows[2].baseCumulativePct, 5, 1e-9), replay32.rows[2].baseCumulativePct);
  check('نبود قیمت یک پا، ردیف را فاقد داده می‌کند', replay32.rows[2].status === 'missing' && replay32.rows[2].missingLegs[0] === 1);
  const legSnapshots32 = strategyLegSnapshots(legs32, args32.seriesByIns, 20260801);
  check('کارت قیمت بک‌تست برای هر پای استراتژی یک عکس مستقل می‌سازد', legSnapshots32.length === 2 && legSnapshots32[0].ins === '11' && legSnapshots32[1].ins === '12');
  check('قیمت کارت پاها از قرارداد می‌آید، نه دارایی پایه', legSnapshots32[0].prices.CLOSE === 8 && legSnapshots32[1].prices.CLOSE === 10 && legSnapshots32.every((row) => row.prices.CLOSE !== 100));
  const backtestSource32 = readSrc('../ui/tabs/backtest.mjs');
  check('رابط بک‌تست عکس قیمت را با پاهای انتخاب‌شده می‌سازد', backtestSource32.includes('strategyLegSnapshots(legs, seriesByIns, entry)') && !backtestSource32.includes('marketSnapshot(rowAt(ua?.ins'));
  check('رابط بک‌تست تحلیل خط زمانی، اثر پاها، حجم و ماتریس هم‌حرکتی را رندر می‌کند',
    backtestSource32.includes('summarizeIntraday(intraday)') && backtestSource32.includes('bt-intraday-leg-chart')
    && backtestSource32.includes('bt-intraday-volume-chart') && backtestSource32.includes('bt-correlation-table'));
  check('نمودارهای درون‌روزی روی ساعت واقعی و به‌شکل پله‌ای رسم می‌شوند',
    backtestSource32.includes('timeScale: true, step: true') && backtestSource32.includes("`M ${values[0].x} ${values[0].y}`"));

  const manual32 = replayHistory({ ...args32, manualEntry: { 0: 5, 1: 20 } });
  check('قیمت دستی هر پا مستقل و بیرون دامنه پذیرفته می‌شود', manual32.priced[0].price === 5 && manual32.priced[1].price === 20);
  check('قیمت دستی در سود آفست اثر می‌گذارد', manual32.rows[1].netPnl === 15000, manual32.rows[1].netPnl);

  check('قیمت تاریخی صفر، داده معتبر ساخته نمی‌شود', Number.isNaN(historyPrice({ close: 0 }, 'CLOSE')));
  check('قیمت اولین معامله روز در مبناهای تاریخی قابل انتخاب است', historyPrice({ first: 13 }, 'FIRST') === 13);
  check('قیمت دستی صفر پذیرفته می‌شود', historyPrice(null, 'MANUAL', 0) === 0);
  check('تاریخ شمسی سررسید به میلادی نرمال می‌شود', normalizeHistoryDate(14050529) === 20260820, normalizeHistoryDate(14050529));
  check('برچسب تاریخ، شمسی است', historyDateLabel(20260801) === '1405/05/10', historyDateLabel(20260801));
  check('نام روز همراه تاریخ موجود است', historyDayName(20260801) === 'شنبه', historyDayName(20260801));

  const summary32 = summarizeReplay(replay32.rows, replay32.entry);
  check('خلاصه روز معتبر و فاقد داده را جدا می‌شمارد', summary32.validDays === 2 && summary32.missingDays === 1);
  check('تعداد و درصد آفست مثبت و منفی جداست', summary32.positiveDays === 1 && summary32.negativeDays === 1 && near(summary32.positivePct, 50));
  check('میانگین، میانه و پراکندگی بازده ساخته می‌شود', Number.isFinite(summary32.meanReturn) && Number.isFinite(summary32.medianReturn) && Number.isFinite(summary32.returnStdDev));
  check('خلاصه، سرمایه و جریان نقدی ورود را نگه می‌دارد', Number.isFinite(summary32.capital) && summary32.cashPaid === 0 && summary32.cashReceived === 18000 && summary32.netCash === 18000);
  check('بازده پایه در نتیجه جدول اصلی موجود است', near(summary32.last.baseCumulativePct, 10, 1e-9));
  check('اثر روزانه هر پا محاسبه می‌شود', Number.isFinite(replay32.rows[1].perLeg[0].pnlDelta));
  check('وجه تضمین کل و هر پای فروش در روز موجود است', Number.isFinite(replay32.rows[1].marginNet) && replay32.rows[1].marginPerLeg.length === 2);
  check('ماتریس مبنای ورود و خروج هر بیست‌وپنج حالت را دارد', basisMatrix(args32).length === 25);
  check('حساسیت ورود برای هر پا و پنج شوک ساخته می‌شود', entrySensitivity(args32).length === 10);

  const units32 = replayHistory({ ...args32, units: 3 });
  check('تعداد واحد استراتژی، سود را خطی مقیاس می‌کند', units32.rows[1].netPnl === replay32.rows[1].netPnl * 3);

  const expiryBase32 = [
    ...base32,
    { date: 20260820, close: 108, last: 108, low: 107, high: 109 },
    { date: 20260821, close: 109, last: 109, low: 108, high: 110 },
  ];
  const expiryCall32 = [...call32, { date: 20260820, close: 1, last: 1, low: 1, high: 1 }, { date: 20260821, close: 2, last: 2, low: 2, high: 2 }];
  const expiryPut32 = [...put32, { date: 20260820, close: 1, last: 1, low: 1, high: 1 }, { date: 20260821, close: 2, last: 2, low: 2, high: 2 }];
  const stopped32 = replayHistory({ ...args32, endDate: 20260821, seriesByIns: { 1: expiryBase32, 11: expiryPut32, 12: expiryCall32 } });
  check('بازپخش در اولین سررسید متوقف می‌شود', stopped32.endDate === 20260820 && stopped32.rows.at(-1).date === 20260820);

  const ua32 = {
    ins: '1', name: 'پایه', close: 100, last: 101,
    expiryList: [{
      days: 19, endDate: 20260820,
      strikeList: [
        { strike: 90, size: 1000, call: { ins: '21', name: 'کال ۹۰' }, put: { ins: '11', name: 'پوت ۹۰' } },
        { strike: 110, size: 1000, call: { ins: '12', name: 'کال ۱۱۰' }, put: { ins: '22', name: 'پوت ۱۱۰' } },
      ],
    }],
  };
  const autoSeries32 = {
    1: base32,
    11: put32,
    12: call32,
    21: call32.map((r) => ({ ...r, close: r.close + 1 })),
    22: put32.map((r) => ({ ...r, close: r.close + 1 })),
  };
  const generated32 = generateHistoricalCombos({
    def: byId('short-strangle'), ua: ua32, seriesByIns: autoSeries32,
    startDate: 20260801, entryBasis: 'CLOSE', settings: defaults(), filtered: false,
  });
  check('حالت خودکار، تمام ترکیب ساختاری استراتژی انتخابی را می‌سازد', generated32.combos.length === 1, generated32.combos.length);
  check('ترکیب خودکار، پوت پایین و کال بالا را درست می‌چیند', generated32.combos[0].legs[0].ins === '11' && generated32.combos[0].legs[1].ins === '12');

  const officialMarket32 = historyMarketMetrics({ close: 100, vol: 20, trades: 4, value: 5000 });
  const estimatedMarket32 = historyMarketMetrics({ close: 100, vol: 20, trades: 4 });
  check('ارزش رسمی روزانه بر برآورد اولویت دارد', officialMarket32.value === 5000 && !officialMarket32.valueEstimated);
  check('نبود ارزش رسمی با حجم × پایانی برآورد و علامت می‌خورد', estimatedMarket32.value === 2000 && estimatedMarket32.valueEstimated);

  const liquidSeries32 = {
    1: base32.map((r, i) => ({ ...r, vol: i === 1 ? 10 : 1000, trades: 5, value: i === 1 ? 1000 : 100000 })),
    11: put32.map((r, i) => ({ ...r, vol: i === 1 ? 2 : 100, trades: 3, value: i === 1 ? 20 : 10000 })),
    12: call32.map((r) => ({ ...r, vol: 100, trades: 3, value: 10000 })),
  };
  const liquidReplay32 = replayHistory({ ...args32, seriesByIns: liquidSeries32,
    liquidity: { minBaseVolume: 100, minBaseValue: 10000, minLegVolume: 10, minLegValue: 1000 } });
  check('فیلتر نقدشوندگی روز ضعیف را از آمار معتبر حذف می‌کند', liquidReplay32.ok && liquidReplay32.rows[1].status === 'liquidity' && liquidReplay32.summary.liquidityDays === 1);
  const blockedEntry32 = replayHistory({ ...args32, seriesByIns: liquidSeries32,
    liquidity: { minBaseVolume: 2000 } });
  check('حداقل حجم پایه در خود روز ورود اعمال می‌شود', !blockedEntry32.ok && blockedEntry32.liquidityError);

  const optimized32 = optimizeExitPolicy(args32, { targets: [1, 5], holdingDays: [1, 2] });
  check('بهینه‌ساز، بهترین خروج مشاهده‌شده و قاعده خروج می‌سازد', optimized32.bestObserved?.date === 20260802 && optimized32.bestPolicy?.samples >= 1);

  const matrixArgs32 = {
    ...args32,
    seriesByIns: { ...args32.seriesByIns, 12: [...call32, { date: 20260803, close: 6, last: 5, low: 4, high: 7 }] },
  };
  const rolling32 = rollingEntryMatrix(matrixArgs32);
  const cell32 = rolling32.cells.find((c) => c.entryDate === 20260801 && c.exitDate === 20260802);
  const sameDayCell32 = rolling32.cells.find((c) => c.entryDate === 20260801 && c.exitDate === 20260801);
  check('ماتریس ورود×خروج همه تاریخ‌های پایه را نگه می‌دارد', rolling32.dates.length === 3 && rolling32.cells.length === 6, `${rolling32.dates.length} تاریخ، ${rolling32.cells.length} خانه`);
  check('خانه ماتریس بازده انباشته و تغییر همان روز را جدا دارد', Number.isFinite(cell32?.returnPct) && Number.isFinite(cell32?.dailyReturnPct) && cell32.holdingTradingDays === 1);
  check('تغییر روز ورود از صفر تا آفست همان روز است، نه صفر ساختگی', sameDayCell32?.dailyPnl === sameDayCell32?.netPnl);
  check('ماتریس برای هر ورود، سرمایه و جریان‌های نقدی کامل خروجی می‌دهد', rolling32.entries.length === 3 && Number.isFinite(rolling32.entries[0]?.capital) && Number.isFinite(rolling32.entries[0]?.cashPaid) && Number.isFinite(rolling32.entries[0]?.cashReceived));
  check('هر خانه جزئیات نقدشوندگی، کارمزد و اثر همه پاها را برای خروجی جامع دارد', cell32?.perLeg?.length === 2 && Number.isFinite(cell32?.baseClose) && Number.isFinite(cell32?.totalFees) && cell32.perLeg.every((leg) => Number.isFinite(leg.exitPrice) && Number.isFinite(leg.netPnl)));
  check('خروجی ماتریس هیچ شناسه خام قرارداد یا دارایی پایه را حمل نمی‌کند', !JSON.stringify(rolling32).includes('"ins"'));
  const profile32 = holdingPeriodProfile(rolling32);
  check('پروفایل افق نگهداری، چند ورود را در روز معاملاتی یکسان تجمیع می‌کند', profile32.rows.find((r) => r.holdingTradingDays === 1)?.samples === 2);
  check('افق مقاوم فقط از افق دارای نمونه کافی انتخاب می‌شود', profile32.best?.holdingTradingDays === 1);
  const detail32 = replayTradeDetail(matrixArgs32, 20260801, 20260802);
  check('کلیک خانه می‌تواند مسیر کامل و بهترین/بدترین نقطه را بازسازی کند', detail32.ok && detail32.path.length === 2 && detail32.best && detail32.worst && detail32.selected.date === 20260802);

  const intraday32 = replayIntraday({
    replay: replay32,
    tradesByIns: {
      11: [{ sequence: 1, time: 90000, price: 5, quantity: 3 }, { sequence: 3, time: 90100, price: 4, quantity: 2 }],
      12: [{ sequence: 2, time: 90030, price: 6, quantity: 4 }],
    },
    baseTrades: [{ sequence: 1, time: 90010, price: 110, quantity: 20 }, { sequence: 2, time: 90040, price: 111, quantity: 5 }],
    fees: args32.fees,
  });
  check('ریزمعامله تا پیش از مشاهده قیمت همه پاها عدد مالی نمی‌سازد', intraday32.length === 3 && intraday32[0].timeLabel === '09:00:30');
  check('رویداد نماد پایه هم روی خط زمانی مشترک می‌نشیند', intraday32[1].timeLabel === '09:00:40' && intraday32[1].basePrice === 111);
  check('ارزش‌گذاری ریزمعامله اثر هر پا و سود کل را از موتور مشترک می‌سازد', intraday32[2].perLeg.length === 2 && intraday32[2].netPnl === 8000, intraday32[2].netPnl);
  check('قیمت پایه ریزمعامله به‌صورت مشاهده‌شده و درصدی نگه داشته می‌شود', intraday32[1].basePrice === 111 && near(intraday32[1].basePct, 11));
  check('تبدیل زمان ریزمعامله پایدار است', tradeSecond(90105) === 32465 && tradeTimeLabel(90105) === '09:01:05');
  check('مرز جلسه درون‌روزی دقیقاً ۹ تا ۱۲:۳۰ است', !inIntradaySession(85959) && inIntradaySession(90000) && inIntradaySession(123000) && !inIntradaySession(123001));

  const detailedIntraday32 = replayIntraday({
    replay: replay32,
    tradesByIns: {
      11: [
        { sequence: 1, time: 85959, price: 99, quantity: 90 },
        { sequence: 2, time: 90000, price: 5, quantity: 3 },
        { sequence: 3, time: 90000, price: 4, quantity: 2 },
        { sequence: 4, time: 123001, price: 1, quantity: 80 },
      ],
      12: [{ sequence: 1, time: 90000, price: 6, quantity: 4 }, { sequence: 2, time: 90530, price: 7, quantity: 1 }],
    },
    fees: args32.fees,
  });
  check('چند معامله یک پا در یک ثانیه، یک نقطه با آخرین قیمت می‌سازد', detailedIntraday32.length === 2 && detailedIntraday32[0].perLeg[0].exitPrice === 4);
  check('حجم همان ثانیه و حجم تجمعی هر پا جدا نگه داشته می‌شود', detailedIntraday32[0].perLeg[0].secondVolume === 5 && detailedIntraday32[1].perLeg[0].cumulativeVolume === 5);
  check('سن آخرین قیمت هر پا روی خط زمانی مشترک مشخص است', detailedIntraday32[1].perLeg[0].ageSec === 330 && detailedIntraday32[1].maxAgeSec === 330 && !detailedIntraday32[1].allFresh);
  const intradaySummary32 = summarizeIntraday(detailedIntraday32, { bucketSeconds: 60 });
  check('خلاصه درون‌روزی بهترین، بدترین و افت از قله را می‌سازد', intradaySummary32.points === 2 && intradaySummary32.best && intradaySummary32.worst && intradaySummary32.maxDrawdown <= 0);
  const observedIntervals32 = intradaySummary32.intervals.filter((row) => row.observations);
  check('جدول بازه‌ای همه جلسه را بدون ساخت عدد برای شکاف‌ها نگه می‌دارد', intradaySummary32.intervals.length === 210 && intradaySummary32.intervals.some((row) => !row.observations && !Number.isFinite(row.openPnl)));
  check('جدول بازه‌ای، تعداد مشاهده و حجم واقعی پاها را جمع می‌زند', observedIntervals32.length === 2 && observedIntervals32[0].volume === 9 && observedIntervals32[0].trades === 3);
  check('خلاصه هر پا قیمت، اثر و فعالیت بازار را نگه می‌دارد', intradaySummary32.legs.length === 2 && intradaySummary32.legs[0].lastPrice === 4 && intradaySummary32.legs[1].tradeCount === 2);
  check('ماتریس هم‌حرکتی به تعداد پاها و با قطر یک ساخته می‌شود', intradaySummary32.correlation.length === 2 && intradaySummary32.correlation[0][0] === 1 && intradaySummary32.correlation[1][1] === 1);

  // ——— دو پا روی یک قرارداد: یک معامله فیزیکی، نه دو تا ———
  // اگر جمع سطر از روی حجم پاها بسته شود، همان معامله دوبار شمرده می‌شود و
  // عددی بیرون می‌آید که در تابلو وجود ندارد.
  const sharedIns32 = replayIntraday({
    replay: {
      ...replay32,
      priced: [replay32.priced[0], { ...replay32.priced[0], side: 'sell' }],
    },
    tradesByIns: { [String(replay32.priced[0].ins)]: [
      { sequence: 1, time: 90000, price: 6, quantity: 100 },
      { sequence: 2, time: 90100, price: 7, quantity: 50 },
    ] },
    fees: args32.fees,
  });
  check('حجم تجمعی سطر با دو پای هم‌قرارداد دوبار شمرده نمی‌شود',
    sharedIns32.length === 2 && sharedIns32[0].cumulativeVolume === 100 && sharedIns32.at(-1).cumulativeVolume === 150,
    sharedIns32.map((row) => row.cumulativeVolume).join('/'));
  check('حجم تجمعی سطر همان جمع رویدادهای همان مسیر است',
    sharedIns32.at(-1).cumulativeVolume === sharedIns32.reduce((sum, row) => sum + row.eventVolume, 0));
  const chartSource32 = readSrc('../ui/tabs/backtest.mjs');
  check('برچسب سری نمودار نام قرارداد بالادست را فرار می‌دهد',
    chartSource32.includes('const seriesLabel = (item) => esc(item.label);')
    && !/\$\{item\.label\}/.test(chartSource32));
  check('توضیح ماتریس هم‌حرکتی بیرون از جعبه پیمایش جدول می‌نشیند',
    chartSource32.includes('id="bt-correlation-note"')
    && !/backtest-correlation[\s\S]{0,2000}?<p class="backtest-table-note"/.test(chartSource32));
  const styleSource32 = readSrc('../ui/style.css');
  check('ماتریس هم‌حرکتی کف پهنای جدول تاریخچه را نمی‌گیرد',
    styleSource32.includes('.history-table.backtest-correlation { min-width: 0; }'));

  // ——— ابطال معامله: «باطل نشده» و «نمی‌دانیم» دو چیز متفاوت‌اند ———
  check('پرچم ابطال از هر املای محتمل بالادست خوانده می‌شود',
    canceledFlag({ canceled: true }) === true && canceledFlag({ cancelled: 1 }) === true
    && canceledFlag({ isCanceled: false }) === false);
  check('نبود میدان ابطال «باطل‌نشده» معنی نمی‌دهد، «نامعلوم» معنی می‌دهد',
    canceledFlag({ pTran: 5 }) === null);
  const trades32 = normalizeTrades([
    { nTran: 2, hEven: 90100, qTitTran: 5, pTran: 7 },
    { nTran: 1, hEven: 90000, qTitTran: 3, pTran: 6, canceled: true },
    { nTran: 3, hEven: 85900, qTitTran: 1, pTran: 0 },
  ]);
  check('ریزمعامله بدون قیمت دور ریخته و بقیه بر پایه زمان مرتب می‌شود',
    trades32.length === 2 && trades32[0].time === 90000 && trades32[1].time === 90100);
  check('معامله باطل‌شده علامت می‌خورد و معلوم‌بودن وضعیتش گزارش می‌شود',
    trades32[0].canceled === true && trades32[0].canceledKnown === true);
  check('وقتی بالادست ساکت است، ابطال نامعلوم می‌ماند و ادعای پاکی نمی‌شود',
    trades32[1].canceled === false && trades32[1].canceledKnown === false);
  const cancelDropped32 = replayIntraday({
    replay: replay32,
    tradesByIns: {
      11: [{ sequence: 1, time: 90000, price: 5, quantity: 3 }],
      12: [{ sequence: 2, time: 90030, price: 6, quantity: 4, canceled: true }],
    },
    fees: args32.fees,
  });
  check('با پای باطل‌شده، همه پاها مشاهده‌شده نیستند و عدد مالی ساخته نمی‌شود',
    cancelDropped32.length === 0, cancelDropped32.length);
}

// ═══════════════════════════ ۳۳. گزارش همه استراتژی‌ها ═══════════════════════════
group('۳۳. گزارش همه استراتژی‌ها');
{
  const portfolioRows = [
    { id: 'a1', strategyId: 'a', strategyName: 'الف', groupId: 'g1', groupName: 'گروه یک', feasible: true, final: { netPnl: 100, returnPct: 10 } },
    { id: 'a2', strategyId: 'a', strategyName: 'الف', groupId: 'g1', groupName: 'گروه یک', feasible: true, final: { netPnl: -20, returnPct: -2 } },
    { id: 'b1', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: { netPnl: 30, returnPct: 3 } },
    { id: 'missing', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: null },
    { id: 'nulls', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: { netPnl: null, returnPct: null } },
  ];
  const report = summarizePortfolio(portfolioRows);
  check('گزارش سبد فقط خروجی عددی معتبر را می‌شمارد', report.total === 3 && report.excluded === 2);
  check('تعداد و درصد معاملات سودده و زیان‌ده درست است', report.wins === 2 && report.losses === 1 && near(report.winPct, 200 / 3));
  check('رتبه‌بندی استراتژی با میانه بازده انجام می‌شود، نه بهترین تک‌معامله', report.bestStrategy?.strategyId === 'a' && report.bestTrade?.id === 'a1');
  check('گزارش گروه و بدترین استراتژی را جدا نگه می‌دارد', report.groups.length === 2 && report.worstStrategy?.strategyId === 'b');
}

// ═══════════════════════════ ۳۴. انتخابگر تاریخ مشترک ═══════════════════════════
group('۳۴. انتخابگر تاریخ مشترک');
{
  const read = (relative) => readSrc(relative);
  const wheelSource34 = read('../ui/datewheel.mjs');
  check('انتخابگر تاریخ یک ماژول مشترک است، نه سه پیاده‌سازی جدا',
    wheelSource34.includes('export function mountDateWheel('));
  // چرخ ماوس دیگر مقدار را عوض نمی‌کند. کاربری که فقط می‌خواست صفحه را
  // پایین ببرد و اشاره‌گرش از روی جعبه رد می‌شد، بی‌آنکه بخواهد روز را عوض
  // می‌کرد — و چون روز ورود فهرست ترکیب‌ها را از نو می‌سازد، ترکیب
  // انتخاب‌شده هم بی‌صدا عوض می‌شد.
  check('هیچ شنونده‌ای برای چرخ ماوس نمانده — اسکرول، انتخاب را عوض نمی‌کند',
    !/['"]wheel['"]/.test(wheelSource34) && !wheelSource34.includes('onwheel'));
  check('تقویم ماهانه است، نه ستون بی‌پایان روز',
    wheelSource34.includes('export function jalaliMonthDays(')
    && wheelSource34.includes('date-cal-grid'));
  // شمار روز ماه از خودِ تبدیل شمسی می‌آید، نه از قاعدهٔ کبیسهٔ رونویسی‌شده.
  check('طول ماه از تفاضل اول ماه بعد حساب می‌شود، نه از فرمول دوم',
    !/kabise|isLeap|leapJalali/i.test(wheelSource34)
    && wheelSource34.includes('jalaliToGregorian(ny, nm, 1)'));
  check('روزِ بی‌معامله حذف نمی‌شود، خاموش می‌شود', wheelSource34.includes('date-cal-off'));

  const tabs34 = ['../ui/tabs/backtest.mjs', '../ui/tabs/portfolio-backtest.mjs', '../ui/tabs/history.mjs', '../ui/tabs/positions.mjs'];
  const sources34 = tabs34.map(read);
  check('هیچ تبی ریل افقی قدیمی تاریخ را نگه نداشته است',
    sources34.every((source) => !source.includes('backtest-wheel')));
  check('همه تب‌های دارای تاریخ از انتخابگر مشترک استفاده می‌کنند',
    sources34.every((source) => source.includes("from '/ui/datewheel.mjs'")));
  const historySource34 = read('../ui/tabs/history.mjs');
  check('لغزنده و فهرست کشویی تاریخ در تحلیل تاریخی جایگزین شده‌اند',
    !/id="h-(start|end|payoff-day|rolling-start|rolling-end)"[^>]*(type="range"|<\/select)/.test(historySource34)
    && !historySource34.includes('<select id="h-rolling-start">'));

  const styleSource34 = read('../ui/style.css');
  check('تقویم هفت ستونه است — یک ستون برای هر روز هفته',
    /\.date-cal-week, \.date-cal-grid \{[^}]*repeat\(7, minmax\(0, 1fr\)\)/.test(styleSource34));
  // ارتفاع ثابت: ماه‌ها ۲۹ تا ۳۱ روزند و صفر تا شش خانه خالی در ابتدا
  // دارند؛ بدون ارتفاع ثابت، چیدمان اطراف با هر جابه‌جایی ماه می‌پرد.
  check('ارتفاع تقویم با عوض‌شدن ماه نمی‌پرد',
    /\.date-cal \{[^}]*height: \d+px;/.test(styleSource34));
}

// ═══════════════════════════ ۳۵. نوار ثابت مشخصات موقعیت ═══════════════════════════
group('۳۵. نوار ثابت مشخصات موقعیت');
{
  const historySource35 = readSrc('../ui/tabs/history.mjs');
  const styleSource35 = readSrc('../ui/style.css');
  // کشیدن جعبه، جای آن را از دست کاربر می‌گرفت: تا «بازنشانی جایگاه» را
  // نمی‌زد، جعبه همان‌جا که رها شده بود می‌ماند — حتی روی محتوای مهم.
  check('کد کشیدن جعبه مشخصات به‌کلی برداشته شده است',
    !/frozenDrag|beginFrozenDrag|data-frozen-drag|resetFrozenPosition/.test(historySource35)
    && !/data-detached|frozen-drag-handle/.test(styleSource35));
  // نوار باید اولین فرزند تب باشد، نه داخل بخش نتایج؛ وگرنه پیش از اجرای
  // تحلیل اصلاً وجود ندارد و «بالای صفحه» نیست.
  const frozenAt35 = historySource35.indexOf('id="h-frozen-strategy"');
  check('نوار مشخصات بالای تب می‌نشیند، نه داخل بخش نتایج',
    frozenAt35 > 0 && frozenAt35 < historySource35.indexOf('class="history-hero"'));
  check('نوار مشخصات با پیمایش صفحه ثابت می‌ماند',
    /\.history-frozen \{[^}]*position: sticky;[^}]*top: 0;/.test(styleSource35));
  // «بقیه اطلاعات کامل» یعنی هر دو تاریخ و مبناها و سرمایه و نتیجه، نه فقط
  // نام استراتژی — همان چیزی که تا دیروز باید در جدول پایین دنبالش می‌گشتی.
  // فهرست را از خودِ سازنده نوار بیرون می‌کشیم، نه از کل فایل — همین برچسب‌ها
  // در خروجی CSV ماتریس هم هستند و بررسی سراسری، حذفشان از نوار را نمی‌دید.
  const factsBlock35 = historySource35.slice(
    historySource35.indexOf('function renderFrozenStrategy('),
    historySource35.indexOf('function toggleFrozenFold('));
  for (const fact of ['تاریخ ورود', 'تاریخ خروج', 'مدت نگهداری', 'مبنای ورود / خروج', 'سرمایه درگیر', 'نتیجه پایان']) {
    check(`نوار مشخصات «${fact}» را درج می‌کند`, factsBlock35.includes(`['${fact}',`));
  }
  // کلیک روی هر خانه ماتریس یک موقعیت دیگر است — ورود و خروج دیگر روی همان
  // پاها. اگر نوار به‌روز نشود، مشخصات موقعیتِ چند کلیک قبل را نشان می‌دهد.
  check('کلیک روی خانه ماتریس نوار مشخصات را با همان ورود و خروج پر می‌کند',
    /const detail = replayTradeDetail\(args, entryDate, exitDate\);[\s\S]{0,700}?renderFrozenStrategy\(detail\.replay, args,/.test(historySource35));
}

// ═══════════════════════════ ۳۶. قیمت دستی پاها در بک‌تست سریع ═══════════════════════════
group('۳۶. قیمت دستی پاها در بک‌تست سریع');
{
  const base36 = [
    { date: 20260801, close: 100, last: 100, low: 98, high: 102 },
    { date: 20260802, close: 110, last: 110, low: 105, high: 112 },
    { date: 20260803, close: 105, last: 105, low: 103, high: 108 },
  ];
  const put36 = [
    { date: 20260801, close: 8, last: 9, low: 7, high: 10 },
    { date: 20260802, close: 5, last: 4, low: 3, high: 6 },
    { date: 20260803, close: 4, last: 3, low: 2, high: 5 },
  ];
  const call36 = [
    { date: 20260801, close: 10, last: 11, low: 9, high: 12 },
    { date: 20260802, close: 7, last: 6, low: 5, high: 8 },
    { date: 20260803, close: 6, last: 5, low: 4, high: 7 },
  ];
  const args36 = {
    legs: [
      { ins: '11', name: 'پوت', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 90, expiry: 20260820 },
      { ins: '12', name: 'کال', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 110, expiry: 20260820 },
    ],
    baseIns: '1', startDate: 20260801, endDate: 20260803,
    entryBasis: 'CLOSE', exitBasis: 'LAST', units: 1,
    seriesByIns: { 1: base36, 11: put36, 12: call36 },
    fees: { buyStock: 0, sellStock: 0, option: 0, exercise: 0 },
    settings: defaults(),
  };

  // ——— بازه روز: پیام می‌دهد، جلو را نمی‌گیرد ———
  check('قیمت داخل بازه روز، «در بازه» گزارش می‌شود', manualPriceCheck(put36[0], 8).status === 'inside');
  check('قیمت بیرون بازه روز، «بیرون از بازه» گزارش می‌شود', manualPriceCheck(put36[0], 25).status === 'outside');
  // نبودن کمترین و بیشترین یعنی نمی‌دانیم، نه اینکه در بازه بوده.
  check('بدون کمترین و بیشترین روز، وضعیت نامعلوم می‌ماند',
    manualPriceCheck({ close: 8 }, 8).status === 'unknown' && manualPriceCheck(null, 8).status === 'unknown');
  check('ورودی خالی یا نامعتبر پیامی نمی‌سازد',
    manualPriceCheck(put36[0], NaN).status === 'empty' && manualPriceCheck(put36[0], 0).status === 'empty');
  const bounds36 = manualPriceCheck(put36[0], 25);
  check('پیام بازه، همان کمترین و بیشترین همان روز را حمل می‌کند', bounds36.low === 7 && bounds36.high === 10);

  // ——— قیمت دستی خروج ———
  const plain36 = replayHistory(args36);
  const manualExit36 = replayHistory({ ...args36, manualExit: { 0: 1, 1: 1 } });
  check('قیمت دستی خروج در روز سنجش اثر می‌گذارد',
    manualExit36.ok && manualExit36.rows.at(-1).perLeg[0].exitPrice === 1 && manualExit36.rows.at(-1).perLeg[1].exitPrice === 1);
  check('قیمت دستی خروج فقط روی روز سنجش می‌نشیند، نه روزهای مسیر',
    manualExit36.rows[1].perLeg[0].exitPrice === plain36.rows[1].perLeg[0].exitPrice
    && manualExit36.rows[1].perLeg[1].exitPrice === plain36.rows[1].perLeg[1].exitPrice);
  // ۱۸۰۰۰ دریافتی ورود منهای ۲۰۰۰ هزینه بستن دو پا با قیمت ۱
  check('سود روز سنجش با قیمت دستی خروج درست حساب می‌شود',
    manualExit36.rows.at(-1).netPnl === 16000, manualExit36.rows.at(-1).netPnl);
  // بیرون از بازه روز باید محاسبه شود، نه رد. این دقیقاً خواسته کاربر است.
  const wild36 = replayHistory({ ...args36, manualExit: { 0: 500, 1: 500 } });
  check('قیمت دستی بیرون از بازه روز جلوی محاسبه را نمی‌گیرد',
    wild36.ok && wild36.rows.at(-1).status === 'ok' && wild36.rows.at(-1).netPnl === -982000, wild36.rows.at(-1).netPnl);
  // روزی که یک پا اصلاً قیمت ندارد، با قیمت دستی قابل سنجش می‌شود.
  const gapSeries36 = { ...args36.seriesByIns, 12: call36.slice(0, 2) };
  check('روز فاقد قیمت یک پا، بدون قیمت دستی همچنان فاقد داده می‌ماند',
    replayHistory({ ...args36, seriesByIns: gapSeries36 }).rows.at(-1).status === 'missing');
  check('همان روز با قیمت دستی همان پا معتبر می‌شود',
    replayHistory({ ...args36, seriesByIns: gapSeries36, manualExit: { 1: 3 } }).rows.at(-1).status === 'ok');
  check('بازپخش، قیمت‌های دستی به‌کاررفته را همراه نتیجه برمی‌گرداند',
    manualExit36.manualExit[0] === 1 && Object.keys(plain36.manualExit).length === 0);

  // ——— رابط ———
  const backtestSource36 = readSrc('../ui/tabs/backtest.mjs');
  check('رابط بک‌تست برای هر پا در هر دو روز ورودی قیمت دستی می‌سازد',
    backtestSource36.includes('data-manual="${scope}"')
    && backtestSource36.includes("marketSnapshot(strategyLegSnapshots(legs, seriesByIns, entry), entryRail.dataset.value || 'LAST', 'entry', manualEntry)")
    && backtestSource36.includes("marketSnapshot(strategyLegSnapshots(legs, seriesByIns, exit), exitRail.dataset.value || 'LAST', 'exit', manualExit)"));
  check('رابط بک‌تست قیمت دستی هر دو سمت را به موتور می‌دهد',
    /replayHistory\(\{[^}]*manualEntry, manualExit,/.test(backtestSource36));
  // قیمت دستی به یک قرارداد و یک روز تعلق دارد؛ ماندنش پس از تعویض ترکیب
  // یا تاریخ یعنی نسبت‌دادن قیمتی به جایی که هرگز آنجا نبوده.
  check('تعویض ترکیب یا تاریخ خروج، قیمت‌های دستی را پاک می‌کند',
    /function renderCombo\(\) \{[\s\S]{0,200}?manualEntry = \{\}; manualExit = \{\};/.test(backtestSource36)
    && backtestSource36.includes('() => { manualExit = {}; paintSnapshots(); }'));
}

// ═══════════════════════════ ۳۷. سپردن موقعیت به بک‌تست سریع ═══════════════════════════
group('۳۷. سپردن موقعیت به بک‌تست سریع');
{
  const read37 = (relative) => readSrc(relative);
  const appSource37 = read37('../ui/app.mjs');
  const portfolioSource37 = read37('../ui/tabs/portfolio-backtest.mjs');
  const backtestSource37 = read37('../ui/tabs/backtest.mjs');

  // بدون شنونده `hashchange`، عوض‌کردن hash از داخل یک تب فقط نشانی را عوض
  // می‌کند و هیچ تبی باز نمی‌شود.
  check('پوسته برنامه تغییر hash از داخل تب را به باز کردن تب ترجمه می‌کند',
    appSource37.includes("window.addEventListener('hashchange'")
    && appSource37.includes('goRoute(routeFromHash(location.hash))')
    && appSource37.includes('if (route.id !== current) open(route.id);'));
  check('جعبه تحویل بین تب‌ها در وضعیت مشترک تعریف شده است', /^\s*handoff: null,$/m.test(appSource37));
  // وارد کردن `open` از app.mjs یک حلقه می‌ساخت، چون app.mjs خودش هر تب را
  // به‌صورت پویا وارد می‌کند.
  check('تب‌ها برای تعویض تب، پوسته برنامه را وارد نمی‌کنند',
    !portfolioSource37.includes("from '/ui/app.mjs'") && !backtestSource37.includes("from '/ui/app.mjs'"));

  check('آزمون همه استراتژی‌ها دکمه رصد در بک‌تست سریع دارد',
    portfolioSource37.includes('id="pb-watch"') && portfolioSource37.includes("onclick = () => watchInBacktest(item, false)"));
  // فقط انتخاب‌ها منتقل می‌شوند، نه نتیجه‌ها؛ وگرنه دو تب می‌توانند دو عدد
  // نشان دهند و معلوم نباشد کدام مال کدام محاسبه است.
  for (const key of ['uaIns', 'strategyId', 'legIns', 'entryDate', 'exitDate', 'entryBasis', 'exitBasis', 'units']) {
    check(`تحویل «${key}» را همراه می‌برد`, new RegExp(`^\\s*${key}:`, 'm').test(portfolioSource37.slice(portfolioSource37.indexOf('goHandoff(state, {'))));
  }
  check('تحویل هیچ عدد نتیجه‌ای را کپی نمی‌کند',
    !/goHandoff\(state, \{[\s\S]*?\}\);/.exec(portfolioSource37)[0].match(/netPnl|returnPct|capital/));
  // انتقال دیگر تبِ همین صفحه را عوض نمی‌کند؛ `goHandoff` صفحهٔ تازه باز
  // می‌کند و فقط اگر نشد به مسیر قدیمی برمی‌گردد.
  check('آزمون همه استراتژی‌ها کاربر را به بک‌تست سریع می‌برد',
    portfolioSource37.includes('goHandoff(state, {') && !portfolioSource37.includes("location.hash = 'backtest';"));

  check('بک‌تست سریع تحویل را برمی‌دارد و می‌چیند',
    backtestSource37.includes("state.handoff?.to === 'backtest'") && backtestSource37.includes('await applyHandoff(plan)'));
  // اگر پاک نشود، باز کردن دوباره تب، انتخاب تازه کاربر را با چیدمان کهنه
  // بازنویسی می‌کند.
  check('تحویل پس از برداشتن پاک می‌شود', /const plan = state\.handoff;\s*\n\s*state\.handoff = null;/.test(backtestSource37));
  // اگر ترکیب یا روز پیدا نشود، بی‌صدا چیز دیگری انتخاب نمی‌شود.
  check('هرچه از تحویل چیده نشد، صریح گزارش می‌شود',
    backtestSource37.includes('const skipped = [];') && backtestSource37.includes('skipped.push(') && backtestSource37.includes("skipped.join('؛ ')"));
}

// ═══════════════════════════ ۳۸. سررسید با سقف موقعیت پر ═══════════════════════════
group('۳۸. سررسید با سقف موقعیت پر');
{
  const mkRow38 = (strike, endDate) => ({
    uaInsCode: 'L', lval30_UA: 'اهرم', pDrCotVal_UA: 100000, pClosing_UA: 100000,
    insCode_C: `c${strike}_${endDate}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${endDate}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: endDate === 20260101 ? 30 : 60, endDate,
    pMeDem_C: 3000, qTitMeDem_C: 50, pMeOf_C: 3150, qTitMeOf_C: 50,
    pDrCotVal_C: 3000, pClosing_C: 3000, oP_C: 500, qTotTran5J_C: 1000, qTotCap_C: 300000000,
    pMeDem_P: 3000, qTitMeDem_P: 50, pMeOf_P: 3150, qTitMeOf_P: 50,
    pDrCotVal_P: 3000, pClosing_P: 3000, oP_P: 500, qTotTran5J_P: 1000, qTotCap_P: 300000000,
  });
  const chain38 = buildChain([
    mkRow38(95000, 20260101), mkRow38(105000, 20260101),
    mkRow38(95000, 20260201), mkRow38(105000, 20260201),
  ]);
  const s38 = { ...defaults(), comboWindowPct: 25, greeksInScan: false };
  const ua38 = chain38.get('L');
  check('نمونه دو سررسید دارد', ua38.expiryList.length === 2, ua38.expiryList.map((ex) => ex.endDate).join('/'));

  // ——— خواندن فهرست ———
  const set38 = blockedExpirySet('L:20260101, L:20260201 ');
  check('فهرست سررسیدهای پرشده با فاصله اضافی هم درست خوانده می‌شود', set38.size === 2 && set38.has('L:20260201'));
  check('ورودی خالی یا بی‌دونقطه چیزی نمی‌سازد',
    blockedExpirySet('').size === 0 && blockedExpirySet('L').size === 0 && blockedExpirySet(':20260101').size === 0 && blockedExpirySet(null).size === 0);
  check('بستن یک سررسید، سررسید دیگر همان نماد را نمی‌بندد',
    expiryBlocked(blockedExpirySet('L:20260101'), 'L', 20260101) && !expiryBlocked(blockedExpirySet('L:20260101'), 'L', 20260201));
  check('بستن سررسید یک نماد به نماد دیگر سرایت نمی‌کند',
    !expiryBlocked(blockedExpirySet('L:20260101'), 'M', 20260101));

  // ——— اثر روی ترکیب‌سازی ———
  const openAll38 = generateCombos(byId('naked-call'), ua38, s38);
  const oneBlocked38 = generateCombos(byId('naked-call'), ua38, { ...s38, blockedExpiries: 'L:20260101' });
  const allBlocked38 = generateCombos(byId('naked-call'), ua38, { ...s38, blockedExpiries: 'L:20260101,L:20260201' });
  check('بدون فهرست، هر دو سررسید ترکیب می‌سازند', openAll38.length > 0 && new Set(openAll38.map((row) => row.endDate)).size === 2);
  check('سررسید پرشده هیچ ترکیبی نمی‌سازد',
    oneBlocked38.length > 0 && oneBlocked38.every((row) => row.endDate === 20260201), new Set(oneBlocked38.map((row) => row.endDate)).size);
  check('بستن همه سررسیدها یعنی هیچ پیشنهادی', allBlocked38.length === 0);

  // سررسید بسته اصلاً ترکیب نمی‌سازد، پس در سطل‌های قیف دیده نمی‌شود؛ اگر
  // شمرده نشود، کاربر جدول خالی را به نبود مظنه نسبت می‌دهد.
  const funnel38 = emptyFunnel();
  generateCombos(byId('naked-call'), ua38, { ...s38, blockedExpiries: 'L:20260101' }, funnel38);
  check('قیف، سررسیدهای کنارگذاشته‌شده را جدا می‌شمارد', funnel38.blockedExpiry === 1, funnel38.blockedExpiry);
  const scan38 = scanFn({ def: byId('naked-call'), chain: chain38, uaKeys: ['L'], settings: { ...s38, blockedExpiries: 'L:20260101' } });
  // ردیف اسکن `endDate` را حمل نمی‌کند؛ `days` تنها نشانه سررسید در خروجی است
  // و در این نمونه ۳۰ روز مال سررسید بسته و ۶۰ روز مال سررسید باز است.
  check('اسکن کامل هم سررسید پرشده را پیشنهاد نمی‌دهد',
    scan38.rows.length > 0 && scan38.rows.every((row) => row.days === 60), scan38.rows.map((row) => row.days).join('/'));

  // ——— رابط ———
  const settingsSource38 = readSrc('../core/settings.mjs');
  check('فهرست سررسیدهای پرشده در تنظیمات ذخیره می‌شود، نه فقط در حافظه مرورگر',
    settingsSource38.includes("key: 'blockedExpiries'") && defaults().blockedExpiries === '');
  const indexSource38 = readSrc('../ui/index.html');
  check('انتخابگر سررسید در نوار بالای برنامه است',
    indexSource38.indexOf('data-capacity-panel') > 0 && indexSource38.indexOf('data-capacity-panel') < indexSource38.indexOf('</header>'));
  const expiriesSource38 = readSrc('../ui/expiries.mjs');
  // تا کسی نوار را باز نکند نباید هیچ درخواستی برود؛ همان قاعده «تب بسته
  // هیچ هزینه‌ای ندارد».
  check('زنجیره فقط با باز شدن نوار گرفته می‌شود',
    /host\.addEventListener\('toggle', \(\) => \{ if \(host\.open\) \{ paintPanel\(\); loadChain\(\); \} \}\)/.test(expiriesSource38)
    && (expiriesSource38.match(/fetch\(/g) || []).length === 1);
  const tableSource38 = readSrc('../ui/table.mjs');
  check('قیف، کنارگذاشتن سررسید را به کاربر توضیح می‌دهد', tableSource38.includes('f.blockedExpiry > 0'));
}

// ═══════════════════════════ ۳۹. تحلیل چندروزه روی تایم‌فریم انتخابی ═══════════════════════════
group('۳۹. تحلیل چندروزه روی تایم‌فریم انتخابی');
{
  const S = INTRADAY_START_SECOND;
  // نقطه‌ساز ساده: هر نقطه یک ثانیه با آفست و یک پا.
  const point39 = (second, netPnl, price = 10, volume = 1) => ({
    second, timeLabel: '—', netPnl, returnPct: netPnl / 100,
    basePrice: 1000, basePct: 0, eventVolume: volume, eventTrades: 1,
    baseCumulativeVolume: 0, baseSecondVolume: 0, maxAgeSec: 0, allFresh: true,
    perLeg: [{ index: 0, ins: '11', name: 'پا', side: 'sell', exitPrice: price, netPnl, cumulativeVolume: volume, tradeCount: 1, ageSec: 0 }],
  });
  const days39 = [
    { date: 20260801, points: [point39(S, 100), point39(S + 60, 300), point39(S + 1900, -50)] },
    { date: 20260802, points: [point39(S + 30, 20), point39(S + 120, 90), point39(S + 1900, 10)] },
  ];

  // ——— سطل‌بندی ———
  const buckets39 = bucketIntradayPath(days39, { bucketSeconds: 30 * 60 });
  check('هر روز جدا سطل می‌شود و سطل بی‌مشاهده ساخته نمی‌شود',
    buckets39.length === 4, buckets39.map((row) => `${row.date}@${row.startSecond - S}`).join(' '));
  check('باز، بسته، بیشینه و کمینه هر سطل از مشاهده‌های همان سطل می‌آید',
    buckets39[0].openPnl === 100 && buckets39[0].closePnl === 300 && buckets39[0].highPnl === 300 && buckets39[0].lowPnl === 100);
  check('تغییر درون سطل از اولین تا آخرین مشاهده همان سطل است', buckets39[0].changePnl === 200);
  // تغییر پیاپی از بسته‌شدن سطل قبلی می‌آید، حتی وقتی سطل قبلی روز دیگری است.
  check('اولین سطل تغییر پیاپی ندارد، نه اینکه صفر باشد', Number.isNaN(buckets39[0].stepPnl));
  // سطل سوم اولین سطل روز دوم است؛ مرجعش بستهٔ آخرین سطل روز اول است، نه صفر.
  check('تغییر پیاپی از سطل قبلی حساب می‌شود، حتی وقتی روز عوض شده',
    buckets39[1].stepPnl === -350 && buckets39[2].stepPnl === 140,
    `${buckets39[1].stepPnl}/${buckets39[2].stepPnl}`);
  check('هر سطل تعداد مشاهده و حجم خودش را حمل می‌کند',
    buckets39[0].observations === 2 && buckets39[0].volume === 2 && buckets39[1].observations === 1);
  check('اثر هر پا در سطل هم گزارش می‌شود', buckets39[0].perLeg[0].changePnl === 200);
  // تایم‌فریم کوچک‌تر یعنی سطل بیشتر، بدون ساختن نقطه تازه.
  const fine39 = bucketIntradayPath(days39, { bucketSeconds: 60 });
  check('تایم‌فریم ریزتر سطل بیشتر می‌دهد ولی مشاهده تازه نمی‌سازد',
    fine39.length === 6 && fine39.reduce((sum, row) => sum + row.observations, 0) === 6, fine39.length);
  check('تایم‌فریم زیر یک دقیقه به یک دقیقه بسته می‌شود',
    bucketIntradayPath(days39, { bucketSeconds: 1 }).length === fine39.length);

  // ——— مدت سود و زیان ———
  const holding39 = intradayHoldingSummary(days39);
  // روز اول: ۶۰ ثانیه با آفست ۱۰۰، بعد ۱۸۴۰ ثانیه با ۳۰۰، و نقطه آخر بدون
  // ادامه — پس ۱۹۰۰ ثانیه مشاهده‌شده که همه‌اش در سود بوده.
  check('مدت مشاهده‌شده از فاصله نقاط می‌آید، نه از طول جلسه',
    holding39.days[0].observedSeconds === 1900 && holding39.days[0].positiveSeconds === 1900);
  check('بازه پس از آخرین معامله روز اصلاً شمرده نمی‌شود',
    holding39.days[0].observedSeconds === 1900 && holding39.days[0].lastSecond - holding39.days[0].firstSecond === 1900);
  check('روز سودده و زیان‌ده از آفست پایان روز شمرده می‌شود',
    holding39.positiveDays === 1 && holding39.negativeDays === 1 && holding39.dayCount === 2);
  check('درصد زمان در سود روی کل بازه محاسبه می‌شود', near(holding39.positivePct, 100));
  // صفر نه سود است نه زیان؛ ریختنش در یکی از دو سطل، درصدها را جابه‌جا می‌کند.
  const flat39 = intradayHoldingSummary([{ date: 1, points: [point39(S, 0), point39(S + 50, 5)] }]);
  check('ثانیه با آفست صفر نه در سود شمرده می‌شود نه در زیان',
    flat39.flatSeconds === 50 && flat39.positiveSeconds === 0 && flat39.negativeSeconds === 0,
    `${flat39.flatSeconds}/${flat39.positiveSeconds}`);
  const lossDay39 = intradayHoldingSummary([{ date: 1, points: [point39(S, -5), point39(S + 100, -7)] }]);
  check('زمان در زیان جدا از زمان در سود شمرده می‌شود',
    lossDay39.negativeSeconds === 100 && lossDay39.positiveSeconds === 0 && near(lossDay39.negativePct, 100));

  // ——— رفتار ساعتی ———
  const profile39 = timeOfDayProfile(days39, { bucketSeconds: 30 * 60 });
  check('بازه ساعتی مشترک دو روز، دو نمونه دارد', profile39[0].days === 2 && profile39[0].upDays === 2);
  check('یکنواختی جهت، سهم پرتکرارترین جهت است', near(profile39[0].consistencyPct, 100));
  const mixed39 = timeOfDayProfile([
    { date: 1, points: [point39(S, 0), point39(S + 60, 10)] },
    { date: 2, points: [point39(S, 0), point39(S + 60, -10)] },
  ], { bucketSeconds: 30 * 60 });
  check('دو روز با جهت مخالف، یکنواختی پنجاه درصد می‌دهد', near(mixed39[0].consistencyPct, 50) && near(mixed39[0].upPct, 50));

  // ——— بهترین بازه ورود و خروج ———
  const legs39 = [{ kind: 'call', side: 'buy', ratio: 1, size: 1, strike: 100, price: 0 }];
  const priced39 = [
    { date: 1, points: [point39(S, 0, 10), point39(S + 20 * 60, 0, 14), point39(S + 40 * 60, 0, 12)] },
    { date: 2, points: [point39(S, 0, 20), point39(S + 20 * 60, 0, 26), point39(S + 40 * 60, 0, 24)] },
  ];
  const matrix39 = intradayEntryExitProfile(priced39, { legs: legs39, bucketSeconds: 20 * 60, fees: {} });
  check('ماتریس ورود×خروج فقط جفت‌های رو به جلو می‌سازد',
    matrix39.cells.length === 3 && matrix39.cells.every((cell) => cell.exitSecond > cell.entrySecond), matrix39.cells.length);
  check('هر خانه روی همه روزها تجمیع می‌شود', matrix39.cells.every((cell) => cell.samples === 2));
  // خرید ۱۰ و فروش ۱۴ در روز اول و ۲۰ به ۲۶ در روز دوم → میانه ۵
  const firstToSecond39 = matrix39.cells.find((cell) => cell.entrySecond === S && cell.exitSecond === S + 20 * 60);
  check('سود هر خانه از قیمت مشاهده‌شده دو سرِ همان جفت می‌آید',
    firstToSecond39.medianPnl === 5 && firstToSecond39.winPct === 100, firstToSecond39.medianPnl);
  check('بهترین بازه ورود و خروج با میانه رتبه‌بندی می‌شوند',
    matrix39.bestEntry.second === S && matrix39.bestExit.second === S + 20 * 60,
    `${matrix39.bestEntry.second - S}/${matrix39.bestExit.second - S}`);
  // کف پنج دقیقه‌ای عمدی است و باید صریح برگردد، نه بی‌صدا اعمال شود.
  const clamped39 = intradayEntryExitProfile(priced39, { legs: legs39, bucketSeconds: 60, fees: {} });
  check('تایم‌فریم ریزتر از کف ماتریس، صریح به کف بسته می‌شود',
    clamped39.bucketSeconds === ENTRY_EXIT_MIN_BUCKET && clamped39.requestedBucketSeconds === 60);
  check('بدون پا، ماتریس عدد نمی‌سازد', intradayEntryExitProfile(priced39, { legs: [], bucketSeconds: 20 * 60 }).cells.length === 0);
  check('روزی که فقط یک سطل دارد، هیچ جفتی نمی‌سازد',
    intradayEntryExitProfile([{ date: 1, points: [point39(S, 0, 10)] }], { legs: legs39, bucketSeconds: 20 * 60 }).days === 0);
  // کارمزد باید در هر دو سمت کم شود، وگرنه ماتریس سود را بیش‌برآورد می‌کند.
  const withFee39 = intradayEntryExitProfile(priced39, { legs: legs39, bucketSeconds: 20 * 60, fees: { option: 0.1 } });
  check('کارمزد هر دو سمت از سود خانه کم می‌شود',
    withFee39.cells.find((cell) => cell.entrySecond === S && cell.exitSecond === S + 20 * 60).medianPnl < 5);

  check('ورودی خالی، خروجی خالی می‌دهد',
    bucketIntradayPath([]).length === 0 && intradayHoldingSummary([]).dayCount === 0 && timeOfDayProfile([]).length === 0);

}

// ═══════════════════════════ ۴۰. سه گام بک‌تست سریع و تحلیل تایم‌فریم ═══════════════════════════
group('۴۰. سه گام بک‌تست سریع و تحلیل تایم‌فریم');
{
  const source40 = readSrc('../ui/tabs/backtest.mjs');
  const backtestModule40 = await import('../core/backtest.mjs');
  const styleSource40 = readSrc('../ui/style.css');

  // ——— ترتیب سه گام: کلی، روزبه‌روز، ریزمعامله ———
  const at = (needle) => source40.indexOf(needle);
  check('اول عملکرد کلی بازه، بعد مسیر روزبه‌روز، بعد ریزمعامله',
    at('id="bt-kpis"') > 0 && at('id="bt-kpis"') < at('id="bt-days-table"')
    && at('id="bt-days-table"') < at('id="bt-intraday-title"'));
  check('نمای کلی بازه، بازه خودش را برچسب می‌زند', source40.includes("$('bt-overview-range').textContent"));

  // ——— ورود به ریزمعامله با کلیک روی ردیف روز ———
  check('هر ردیف جدول روزبه‌روز با کلیک و صفحه‌کلید باز می‌شود',
    source40.includes('data-day="${row.date}" tabindex="0"')
    && /\$\('bt-days-table'\)\.addEventListener\('click'[\s\S]{0,220}?openDayIntraday\(Number\(row\.dataset\.day\)\)/.test(source40)
    && /\$\('bt-days-table'\)\.addEventListener\('keydown'[\s\S]{0,260}?openDayIntraday\(Number\(row\.dataset\.day\)\)/.test(source40));
  check('روز باز‌شده در عنوان پنل ریزمعامله نوشته می‌شود',
    source40.includes("$('bt-intraday-title').textContent") && source40.includes('ریزمعامله ${dateLabel(intradayDate)}'));
  check('ردیف روزِ باز‌شده در جدول علامت می‌خورد',
    source40.includes('aria-selected="${row.date === intradayDate}"')
    && /tr\[data-day\]\[aria-selected="true"\]/.test(styleSource40));
  // ریزمعامله هر روز چند درخواست است؛ رفت‌وبرگشت بین روزها نباید هر بار
  // همان درخواست‌ها را دوباره بفرستد.
  check('ریزمعامله هر روز یک‌بار گرفته و نگه داشته می‌شود',
    source40.includes('if (!force && tradesCache.has(date)) return tradesCache.get(date);')
    && source40.includes('tradesCache.set(date, result);'));
  // ترکیب یا بازه که عوض شود، کش مال بازپخش قبلی است.
  check('اجرای دوباره بک‌تست، کش ریزمعامله را خالی می‌کند', source40.includes('tradesCache.clear();'));
  // ——— نمای کلی بازه، مستقل از روزِ بازشده ———
  //
  // کشوی «نمای مسیر» سه حالت داشت و دو حالتش تکراری بود: «فقط ریزمعامله روز
  // سنجش» همان چیزی را می‌کشید که پنل درون‌روزی با محور ساعت و مسیر پله‌ای
  // بهتر می‌کشد، و حالت ترکیبی روزها را با ثانیه‌ها روی یک محور اندیسی قاطی
  // می‌کرد. بدتر از هر دو: مسیر ترکیبی روی روزِ بازشده بریده می‌شد، پس
  // «بهترین نقطه» و «سود/زیان نهایی» با کلیک روی ردیف‌های جدول روزبه‌روز
  // عوض می‌شدند — در بخشی که عنوانش «عملکرد کلی این بازه» است.
  check('کشوی نمای مسیر برداشته شده', !source40.includes('bt-path-mode'));
  check('نمای کلی همیشه کل بازه را در تفکیک روز می‌سازد',
    source40.includes("replay.rows.filter((row) => row.status === 'ok').map((row) => ({ ...row, granularity: 'day' }))"));
  check('سود/زیان نهایی نمای کلی از روز سنجش می‌آید، نه از آخرین تیکِ روزِ بازشده',
    source40.includes('const final = replay.summary.last;'));
  // اگر این فراخوانی برگردد، نمای کلی دوباره به روزِ بازشده گره می‌خورد.
  check('باز کردن ریزمعامله یک روز، نمای کلی را دوباره نمی‌کشد',
    /async function openDayIntraday\([\s\S]{0,1400}?\n  \}/.exec(source40)?.[0]?.includes('paintOverview()') === false);
  check('خط مرز روز آخر و شیوه‌نامه‌اش هر دو برداشته شدند',
    !source40.includes('backtest-split') && !styleSource40.includes('backtest-split'));
  check('تابع مسیر ترکیبی از موتور هم برداشته شد',
    !Object.keys(backtestModule40).includes('combinedBacktestPath'), Object.keys(backtestModule40).length + ' صادرات');

  // ——— تحلیل تایم‌فریم ———
  check('کاربر تایم‌فریم را خودش انتخاب می‌کند', source40.includes('id="bt-tf-size"') && source40.includes('id="bt-tf-run"'));
  check('عوض‌کردن تایم‌فریم فقط سطل‌بندی را عوض می‌کند، نه داده را',
    /\$\('bt-tf-size'\)\.addEventListener\('change'[\s\S]{0,420}?if \(timeframeDays\.length\) \{ paintTimeframe\(null\); paintPanels\(\); \}/.test(source40));
  for (const [id, what] of [['bt-tf-pnl-chart', 'آفست کل'], ['bt-tf-leg-chart', 'تفکیک پاها'], ['bt-tf-return-chart', 'بازده و پایه'], ['bt-tf-base-chart', 'قیمت نماد پایه']]) {
    check(`نمودار «${what}» در تحلیل تایم‌فریم رسم می‌شود`, source40.includes(`$('${id}')`));
  }
  check('نماد پایه هم در نمودار و هم در جدول سطل‌ها می‌آید',
    source40.includes("label: 'تغییر نماد پایه'") && source40.includes("label: 'قیمت نماد پایه'") && source40.includes('<th>پایه</th>'));
  check('مدت سود و زیان، رفتار ساعتی و ماتریس ورود×خروج هر سه ساخته می‌شوند',
    source40.includes('intradayHoldingSummary(timeframeDays)') && source40.includes('timeOfDayProfile(timeframeDays')
    && source40.includes('intradayEntryExitProfile(timeframeDays'));
  check('بهترین بازه ورود و خروج به کاربر گفته می‌شود',
    source40.includes('بهترین بازه ورود') && source40.includes('بهترین بازه خروج'));
  // چند ده درخواست بی‌خبر نباید برود؛ و روزی که نقطه مشترک ندارد باید شمرده
  // شود نه اینکه با صفر پر شود.
  check('گرفتن ریزمعامله چندروزه پیشرفت گزارش می‌کند و سقف دارد',
    source40.includes('دریافت ریزمعامله ${fmt.int(index + 1)} از') && source40.includes('TIMEFRAME_DAY_CAP'));
  check('روز بدون نقطه مشترک شمرده و صریح گزارش می‌شود',
    source40.includes('if (points.length) out.push({ date: wanted[index], points }); else empty += 1;')
    && source40.includes('روز بدون نقطه مشترک کنار گذاشته شد'));
  check('اگر ماتریس روی سطل درشت‌تر ساخته شود، همان‌جا گفته می‌شود',
    source40.includes('matrix.bucketSeconds !== matrix.requestedBucketSeconds'));
}

// ═══════════ ۴۱. مبنای محاسبه از تنظیمات می‌آید، نه از عدد سخت‌کد ═══════════
//
// پیش از این، «۳۶۵ روز سال»، «۳۰ روز ماه»، «۱۰۰۰ سهم قرارداد» و «۷ روز
// آستانه سررسید نزدیک» در دل موتور نوشته شده بودند. هیچ‌کدام ابدی نیستند:
// اندازه قرارداد با افزایش سرمایه تعدیل می‌شود و مبنای روزشماری انتخاب است.
// این آزمون‌ها می‌سنجند که عوض‌کردن عدد در تنظیمات، واقعاً خروجی را عوض کند
// — وگرنه کنترل تنظیمات هست ولی کار نمی‌کند، که از نبودنش بدتر است.
group('۴۱. مبنای محاسبه از تنظیمات');
{
  const size = 1000;
  const mk = (bid, ask) => ({
    bid, bidQty: 500, ask, askQty: 500, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    book: [{ level: 1, bid, bidQty: 500, ask, askQty: 500 }],
  });
  const def = byId('covered-call');
  const run = (over, days = 30) => {
    const s = { ...defaults(), ...over };
    const legs = buildLegs(def, { strikes: [110000], size: s.contractSize, days: [days] });
    return evaluate({
      legs, quotes: [mk(99000, 100000), mk(4800, 5200)],
      ctx: {
        S: 100000, Sclose: 100000, days, size: s.contractSize, qty: 1,
        settings: s, def, underlying: 'نمونه', sigmaHist: 0.6,
      },
    });
  };

  const base = run({});

  // ——— روز سال ———
  // بازده سالانه ساده خطی است: نصف‌کردن روزهای سال باید دقیقاً نصفش کند.
  const halfYear = run({ dayCountYear: 182.5 });
  check('روز سال، بازده سالانه را مقیاس می‌زند',
    near(halfYear.retAnnPct, base.retAnnPct / 2, 1e-9),
    `${base.retAnnPct.toFixed(3)} → ${halfYear.retAnnPct.toFixed(3)}`);
  check('بازده دوره به روز سال وابسته نیست',
    near(halfYear.retMaxPct, base.retMaxPct, 1e-12));
  // تتا دو بار به روز سال وابسته است: یک بار در T و یک بار در تبدیل
  // سالانه به روزانه. پس نسبتش ساده نیست و اینجا فقط «اثر داشتن» سنجیده
  // می‌شود؛ خودِ تبدیل روزانه، جدا و ایزوله در آزمون بعدی می‌آید.
  check('تتای روزانه به روز سال وابسته است',
    Number.isFinite(halfYear.theta) && !near(halfYear.theta, base.theta, 1e-9),
    `${base.theta.toFixed(2)} → ${halfYear.theta.toFixed(2)}`);

  // تبدیل تتای سالانه به روزانه، با T ثابت: نصف‌کردن روز سال باید دقیقاً
  // دو برابرش کند. اینجا هیچ متغیر دیگری تکان نمی‌خورد.
  const gA = bsGreeks('call', 100000, 110000, 30 / 365, 0.3, 0, 0.6);
  const gB = bsGreeks('call', 100000, 110000, 30 / 365, 0.3, 0, 0.6, 182.5);
  check('تبدیل تتای سالانه به روزانه با روز سال مقیاس می‌خورد',
    near(gB.theta, gA.theta * 2, 1e-9),
    `${gA.theta.toFixed(2)} → ${gB.theta.toFixed(2)}`);

  // ——— روز ماه ———
  const month15 = run({ daysPerMonth: 15 });
  check('روز ماه، بازده ماهانه را مقیاس می‌زند',
    near(month15.retMonthPct, base.retMonthPct / 2, 1e-9),
    `${base.retMonthPct.toFixed(3)} → ${month15.retMonthPct.toFixed(3)}`);

  // ——— اندازه قرارداد ———
  // کاوردکال یعنی «سهم پایه در برابر یک کال». اگر قرارداد روی ۲۰۰۰ سهم
  // بسته شود، پوشش هم باید دو برابر سهم بخواهد؛ پس دلتای موقعیت دو برابر
  // می‌شود و پوشش همچنان کامل می‌ماند.
  const big = run({ contractSize: 2000 });
  check('اندازه قرارداد، دلتای موقعیت را مقیاس می‌زند',
    near(big.delta, base.delta * 2, 1e-6),
    `${base.delta.toFixed(1)} → ${big.delta.toFixed(1)}`);
  check('پوشش کاوردکال با اندازه بزرگ‌تر هم کامل می‌ماند',
    big.coverage === 'full' && big.margin === 0, big.coverage);

  // ——— آستانه سررسید نزدیک ———
  const near5 = run({ shortDteDays: 5 }, 6);
  const near9 = run({ shortDteDays: 9 }, 6);
  check('آستانه سررسید نزدیک از تنظیمات خوانده می‌شود',
    near5.shortDte === false && near9.shortDte === true,
    `۵ روز → ${near5.shortDte} | ۹ روز → ${near9.shortDte}`);
  check('هشدار سررسید نزدیک با همان آستانه ظاهر می‌شود',
    !near5.warn.includes('سررسید نزدیک') && near9.warn.includes('سررسید نزدیک'));

  // ——— هیچ عدد تقویمی سخت‌کدی در موتور نماند ———
  const engineFiles = ['core/evaluate.mjs', 'core/exec.mjs', 'core/mixed.mjs', 'core/timemachine.mjs'];
  const leftovers = engineFiles.filter((f) =>
    /\/\s*365\b/.test(readSrc(`../${f}`)));
  check('هیچ تقسیم بر ۳۶۵ سخت‌کدی در موتور نمانده', leftovers.length === 0, leftovers.join('، '));
}

// ═══════════ ۴۲. مرجع فرمول‌ها از کد عقب نمی‌افتد ═══════════
//
// توضیحِ عقب‌افتاده از نبودِ توضیح بدتر است: کاربر رویش حساب می‌کند و
// نمی‌داند دیگر درست نیست. این آزمون‌ها همان چیزی را می‌بندند که در عمل
// می‌شکند — استراتژی تازه‌ای اضافه شود و کارتش نوشته نشود، یا کلید
// تنظیماتی نامش عوض شود و ارجاع فرمول به هوا اشاره کند.
group('۴۲. مرجع فرمول‌ها');
{
  const schemaKeys = new Set(SCHEMA.map((f) => f.key));

  const dangling = referencedKeys().filter((k) => !schemaKeys.has(k));
  check('هر کلید تنظیمات که فرمول‌ها نام می‌برند، در SCHEMA هست',
    dangling.length === 0, dangling.join('، '));

  const badGroup = FORMULAS.filter((f) => !FORMULA_GROUPS[f.group]).map((f) => f.id);
  check('هر کارت فرمول به گروه موجود اشاره می‌کند', badGroup.length === 0, badGroup.join('، '));

  const ids = FORMULAS.map((f) => f.id);
  check('شناسه کارت فرمول تکراری نیست', new Set(ids).size === ids.length);
  check('هر کارت فرمول دست‌کم یک رابطه دارد',
    FORMULAS.every((f) => Array.isArray(f.lines) && f.lines.length > 0));
  check('هر کارت فرمول عنوان دارد', FORMULAS.every((f) => !!f.title));

  const catalogIds = CATALOG.map((d) => d.id);
  const uncovered = catalogIds.filter((id) => !strategyFormula(id));
  check('هر استراتژی فهرست، کارت فرمول دارد', uncovered.length === 0, uncovered.join('، '));

  const orphan = Object.keys(STRATEGY_FORMULAS).filter((id) => !catalogIds.includes(id));
  check('هیچ کارت فرمولی بدون استراتژی نمانده', orphan.length === 0, orphan.join('، '));

  const shapeBad = catalogIds.filter((id) => {
    const c = strategyFormula(id);
    return !c.capital || !Array.isArray(c.rows) || c.rows.length < 4 || !c.watch;
  });
  check('هر کارت استراتژی سرمایه، دست‌کم چهار ردیف، و هشدار دارد',
    shapeBad.length === 0, shapeBad.slice(0, 3).join('، '));

  // چهار ردیفی که در هر استراتژی باید جواب داشته باشند — همان چهار عددی که
  // کاربر پیش از ورود به موقعیت می‌پرسد.
  const NEED = ['بیشترین سود', 'بیشترین زیان', 'سربه‌سری', 'وجه تضمین'];
  const missingRow = catalogIds.filter((id) => {
    const labels = strategyFormula(id).rows.map((r) => r[0]);
    return NEED.some((n) => !labels.includes(n));
  });
  check('هر کارت استراتژی هر چهار ردیف پایه را دارد',
    missingRow.length === 0, missingRow.slice(0, 3).join('، '));

  // خواستهٔ صریح: کاوردکال باید نرخ و درصدش کامل توضیح داده شده باشد.
  const cc = strategyFormula('covered-call');
  check('کاوردکال گام‌به‌گام توضیح داده شده',
    Array.isArray(cc.walkthrough) && cc.walkthrough.length >= 5, `${cc.walkthrough?.length} گام`);
  const ccLabels = cc.rows.map((r) => r[0]);
  check('هر دو نرخ کاوردکال نام برده شده‌اند',
    ccLabels.includes('بازده ایستا') && ccLabels.includes('بازده اگر اعمال شود'),
    ccLabels.join(' | '));

  check('نمادهای مشترک تعریف شده‌اند', SYMBOLS.length >= 5);

  // رقم لاتین در متن توضیح، همان ایراد قاعده ۲-۳ است.
  const latin = [];
  for (const f of FORMULAS) {
    for (const t of [f.title, f.note || '', ...f.lines]) if (/[0-9]/.test(t)) latin.push(f.id);
  }
  check('متن فرمول‌ها رقم لاتین ندارد', latin.length === 0, [...new Set(latin)].slice(0, 3).join('، '));
}

// ═══════════ ۴۳. اندازه قرارداد از مشخصات خودِ قرارداد ═══════════
//
// افزایش سرمایه، اندازه قرارداد و قیمت اعمال یک سری را تعدیل می‌کند. پس دو
// سررسید یک پایه می‌توانند دو اندازه متفاوت داشته باشند. اندازه در هر عدد
// پولی ضرب می‌شود، پس یک اندازه فرضی اشتباه کل ردیف را به همان نسبت غلط
// می‌کند — و عددی که ده درصد غلط است دقیقاً شبیه عددی است که درست است.
//
// دو باگ واقعی که این گروه قفلشان می‌کند:
//   ۱ در مسیر تاریخی، پای سهم پایه اندازه‌اش را از `contracts[0]` می‌گرفت.
//     آن فهرست به سررسید مرتب است، پس همیشه از نزدیک‌ترین سررسید می‌آمد —
//     حتی وقتی خودِ ترکیب روی سررسید دور بسته می‌شد.
//   ۲ نبود اندازه در تابلو با عدد ثابت ۱۰۰۰ پر می‌شد، بی‌هیچ نشانه‌ای
//
// در مسیر زنده (`core/scan.mjs`) منبع اندازه هم غلط بود — `strikeList[0]` —
// ولی امروز قابل مشاهده نبود: استراتژی‌های دارای پای سهم همه تک‌سررسیدی‌اند
// و در یک سررسید همه قیمت‌های اعمال یک اندازه دارند. آنجا هم به منبع درست
// وصل شد تا با افزودن اولین استراتژی چندسررسیدیِ دارای سهم، بی‌صدا نشکند.
group('۴۳. اندازه قرارداد از مشخصات قرارداد');
{
  // ——— سیاست جایگزینی ———
  check('اندازه مشخصات بر پیش‌فرض مقدم است',
    legContractSize(1100, 1000).size === 1100 && legContractSize(1100, 1000).assumed === false);
  check('نبود اندازه در تابلو، نشان‌دار می‌شود',
    legContractSize(0, 1000).size === 1000 && legContractSize(0, 1000).assumed === true);
  check('ترکیب هم‌اندازه، ناهمگون نیست',
    comboContractSize([1000, 1000], 1000).mixed === false);
  check('ترکیب با دو اندازه، ناهمگون علامت می‌خورد',
    comboContractSize([1000, 1100], 1000).mixed === true);

  // ——— زنجیره، اندازه را از همان ردیف تابلو می‌خواند ———
  const mkRow = (strike, days, size) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: size, remainedDay: days,
    endDate: days === 30 ? 20260901 : 20261101,
    pMeDem_C: 5000, qTitMeDem_C: 500, pMeOf_C: 5200, qTitMeOf_C: 500,
    pDrCotVal_C: 5100, pClosing_C: 5100, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: 4000, qTitMeDem_P: 500, pMeOf_P: 4200, qTitMeOf_P: 500,
    pDrCotVal_P: 4100, pClosing_P: 4100, oP_P: 400, qTotTran5J_P: 800,
  });

  // سررسید نزدیک تعدیل‌شده (۱۱۰۰ سهم)، سررسید دور تعدیل‌نشده (۱۰۰۰ سهم)
  const adjusted = [
    mkRow(95000, 30, 1100), mkRow(100000, 30, 1100), mkRow(105000, 30, 1100),
    mkRow(95000, 90, 1000), mkRow(100000, 90, 1000), mkRow(105000, 90, 1000),
  ];
  const s0 = defaults();
  const ch = buildChain(adjusted, s0);
  const ua = ch.get('1');
  const near = ua.expiryList[0];
  const far = ua.expiryList[1];
  check('اندازه هر سررسید از ردیف خودش می‌آید',
    near.strikeList[0].size === 1100 && far.strikeList[0].size === 1000,
    `نزدیک ${near.strikeList[0].size} | دور ${far.strikeList[0].size}`);
  check('اندازه‌ای که از مشخصات آمده، پرچم دارد', near.strikeList[0].sizeFromSpec === true);

  // تابلو بدون اندازه: زنجیره عدد اختراع نمی‌کند (قاعده ۲-۴)
  const noSize = buildChain([mkRow(100000, 30, 0)], s0).get('1');
  check('زنجیره بدون اندازه، عدد نمی‌سازد',
    noSize.expiryList[0].strikeList[0].size === 0
    && noSize.expiryList[0].strikeList[0].sizeFromSpec === false);

  // ——— باگ ۱: پای سهم پایه ———
  // کاوردکال روی سررسید نزدیکِ تعدیل‌شده باید ۱۱۰۰ سهم بخواهد، نه ۱۰۰۰.
  const run = (over = {}) => {
    const st = { ...defaults(), ...over };
    return scanFn({ def: byId('covered-call'), chain: buildChain(adjusted, st), uaKeys: ['1'], settings: st, qty: 1 });
  };
  const cc = run();
  const ccRow = cc.rows.find((r) => r.days === 30);
  check('کاوردکال ردیف ساخت', !!ccRow, `${cc.rows.length} ردیف`);
  if (ccRow) {
    const stockLeg = ccRow.__legs.find((l) => l.kind === 'underlying');
    const callLeg = ccRow.__legs.find((l) => l.kind === 'call');
    check('پای سهم پایه، اندازه همان کالی را می‌گیرد که پوشش می‌دهد',
      stockLeg.size === callLeg.size && stockLeg.size === 1100,
      `سهم ${stockLeg.size} | کال ${callLeg.size}`);
    check('پوشش کاوردکال با اندازه تعدیل‌شده هم کامل است',
      ccRow.coverage === 'full' && ccRow.margin === 0, ccRow.coverage);
    check('اندازه واقعی، ردیف را فرضی علامت نمی‌زند',
      ccRow.sizeAssumed === false && !ccRow.warn.includes('اندازه قرارداد فرضی'));
  }

  // اگر پای سهم اندازه سررسید دور را می‌گرفت (باگ قدیمی)، پوشش ناقص می‌شد
  // و وجه تضمین ناگهان از صفر درمی‌آمد — همان چیزی که بالا رد شد.

  // ——— باگ ۲: نبود اندازه، نشان‌دار می‌شود ———
  const blank = [mkRow(95000, 30, 0), mkRow(100000, 30, 0), mkRow(105000, 30, 0)];
  const st2 = { ...defaults(), contractSize: 1000 };
  const noSpec = scanFn({
    def: byId('bull-call-spread'), chain: buildChain(blank, st2),
    uaKeys: ['1'], settings: st2, qty: 1,
  });
  const nsRow = noSpec.rows[0];
  check('بدون اندازه تابلو، پیش‌فرض تنظیمات می‌نشیند', !!nsRow && nsRow.__legs[0].size === 1000);
  check('و ردیف برچسب «اندازه قرارداد فرضی» می‌گیرد',
    !!nsRow && nsRow.sizeAssumed === true && nsRow.warn.includes('اندازه قرارداد فرضی'),
    nsRow ? nsRow.warn.join('، ') : '');

  // پیش‌فرض تنظیمات واقعاً خوانده می‌شود، نه عدد ثابت ۱۰۰۰
  const st3 = { ...defaults(), contractSize: 500 };
  const nsRow3 = scanFn({
    def: byId('bull-call-spread'), chain: buildChain(blank, st3),
    uaKeys: ['1'], settings: st3, qty: 1,
  }).rows[0];
  check('پیش‌فرض جایگزین از تنظیمات می‌آید، نه از عدد ثابت',
    !!nsRow3 && nsRow3.__legs[0].size === 500, `${nsRow3?.__legs[0].size}`);

  // ——— ترکیب ناهمگون ———
  const cal = scanFn({
    def: byId('calendar-call'), chain: buildChain(adjusted, s0),
    uaKeys: ['1'], settings: s0, qty: 1,
  }).rows[0];
  check('تقویمی روی دو سری با دو اندازه، ناهمگون علامت می‌خورد',
    !!cal && cal.sizeMixed === true && cal.warn.includes('اندازه قرارداد ناهمگون'),
    cal ? cal.contractSizes.join(' و ') : 'ردیفی نساخت');

  // ——— مسیر تاریخی: همان‌جایی که باگ واقعاً می‌زد ———
  //
  // `contracts[0]` قرارداد اولِ کل فهرست بود و فهرست به سررسید مرتب است،
  // یعنی همیشه از نزدیک‌ترین سررسید. پس کاوردکالی که روی سررسید دور بسته
  // می‌شد، تعداد سهمش را از سری نزدیک می‌گرفت — و اگر آن سری پس از افزایش
  // سرمایه تعدیل شده بود، پوشش با تعداد سهم غلط ساخته می‌شد.
  const contracts = flattenActiveContracts(ua);
  const nearContract = contracts.find((c) => c.daysNow === 30);
  const farContract = contracts.find((c) => c.daysNow === 90);
  check('فهرست قرارداد تاریخی، اندازه هر قرارداد را جدا نگه می‌دارد',
    nearContract.size === 1100 && farContract.size === 1000,
    `${nearContract.size} و ${farContract.size}`);
  check('فهرست تاریخی به سررسید مرتب است، پس قرارداد اول از سری نزدیک است',
    contracts[0].size === 1100);

  const day = (date, close) => ({ date, close, last: close, low: close, high: close, vol: 1000, trades: 5, value: 1e6 });
  const hSeries = {};
  for (const c of contracts) hSeries[c.ins] = [day(20260801, 5000), day(20260802, 5100)];
  hSeries['1'] = [day(20260801, 100000), day(20260802, 100500)];
  const uaHist = { ...ua, ins: '1', name: 'نمونه' };

  const histGen = histCombos({
    def: byId('covered-call'), ua: uaHist, seriesByIns: hSeries,
    startDate: 20260801, entryBasis: 'CLOSE', settings: defaults(), filtered: false,
  });
  // ترکیب‌هایی که پای اختیارشان از سررسید دور است
  const farCombos = histGen.combos.filter((c) =>
    c.legs.some((l) => l.kind === 'call' && l.expiry === farContract.expiry));
  check('کاوردکال تاریخی روی سررسید دور ساخته شد', farCombos.length > 0, `${farCombos.length} ترکیب`);
  const mismatched = farCombos.filter((c) => {
    const stock = c.legs.find((l) => l.kind === 'underlying');
    const call = c.legs.find((l) => l.kind === 'call');
    return stock.size !== call.size;
  });
  check('پای سهم پایه تاریخی، اندازه کال همان ترکیب را می‌گیرد نه سری نزدیک را',
    mismatched.length === 0,
    mismatched.length ? `${mismatched[0].legs.find((l) => l.kind === 'underlying').size} ≠ ${mismatched[0].legs.find((l) => l.kind === 'call').size}` : '');

  // ——— buildLegs اندازه هر پا را جدا می‌پذیرد ———
  const legsMixed = buildLegs(byId('bull-call-spread'), {
    strikes: [95000, 105000], size: 1000, days: [30],
    sizes: { 'call1@0': 1100, 'call2@0': 1100 },
  });
  check('buildLegs اندازه هر پا را از کلید خودش می‌گیرد',
    legsMixed.every((l) => l.size === 1100), legsMixed.map((l) => l.size).join('، '));

  // ——— هیچ اندازه ثابتی در مسیر داده نماند ———
  const sizeFiles = ['core/chain.mjs', 'core/scan.mjs', 'core/history.mjs'];
  const hardcoded = sizeFiles.filter((f) =>
    /size[^\n]*\|\|\s*1000/.test(readSrc(`../${f}`)));
  check('هیچ «اندازه یا ۱۰۰۰» سخت‌کدی در مسیر داده نمانده', hardcoded.length === 0, hardcoded.join('، '));
}

// ═══════════ ۴۴. سررسید با سقف پر، از تحلیل تاریخی هم بیرون است ═══════════
//
// باگ گزارش‌شده کاربر: تیک «سقف موقعیت پر» زده می‌شد ولی همان سررسید باز در
// فیلترهای تحلیل تاریخی می‌آمد و وارد محاسبه می‌شد. علتش این بود که قید فقط
// در مسیر زنده (`core/scan.mjs`) اعمال می‌شد و کل خانواده تحلیل تاریخی —
// تحلیل تاریخی، بک‌تست سریع، بک‌تست سبد — آن را اصلاً نمی‌دید.
//
// سقف پر یعنی امروز نمی‌شود روی آن سررسید موقعیت فزاینده گرفت. پس عددی که
// از بازپخش گذشته‌اش درمی‌آید، تصمیمی را تغذیه می‌کند که اجرایش ممکن نیست.
group('۴۴. سررسید با سقف پر در تحلیل تاریخی');
{
  const mkRow = (strike, days, endDate) => ({
    uaInsCode: '7', lval30_UA: 'اهرم', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate,
    pMeDem_C: 5000, qTitMeDem_C: 500, pMeOf_C: 5200, qTitMeOf_C: 500,
    pDrCotVal_C: 5100, pClosing_C: 5100, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: 4000, qTitMeDem_P: 500, pMeOf_P: 4200, qTitMeOf_P: 500,
    pDrCotVal_P: 4100, pClosing_P: 4100, oP_P: 400, qTotTran5J_P: 800,
  });
  const NEAR = 20260901, FAR = 20261101;
  const rows = [];
  for (const k of [95000, 100000, 105000]) {
    rows.push(mkRow(k, 30, NEAR));
    rows.push(mkRow(k, 90, FAR));
  }
  const ua44 = buildChain(rows, defaults()).get('7');
  const blockNear = `7:${NEAR}`;

  // ——— لایه مشترک ———
  const trimmed = withoutBlockedExpiries(ua44, blockedExpirySet(blockNear));
  check('سررسید پرشده از فهرست سررسیدها بیرون می‌رود',
    trimmed.expiryList.length === 1 && trimmed.expiryList[0].endDate === FAR,
    `${trimmed.expiryList.length} سررسید ماند`);
  check('بدون قید، همان شیء برمی‌گردد و کپی بیهوده ساخته نمی‌شود',
    withoutBlockedExpiries(ua44, blockedExpirySet('')) === ua44);

  // ——— فهرست قرارداد فعال ———
  const all44 = flattenActiveContracts(ua44);
  const kept44 = flattenActiveContracts(ua44, blockNear);
  check('فهرست قرارداد، سررسید پرشده را حذف می‌کند',
    all44.length === 12 && kept44.length === 6, `${all44.length} → ${kept44.length}`);
  check('و هیچ قرارداد سررسید پرشده باقی نمی‌ماند',
    kept44.every((c) => c.expiryRaw === FAR));

  // ——— ترکیب‌سازی تاریخی ———
  const day = (date, close) => ({ date, close, last: close, low: close, high: close, vol: 1000, trades: 5, value: 1e6 });
  const series44 = { 7: [day(20260801, 100000), day(20260802, 100500)] };
  for (const c of all44) series44[c.ins] = [day(20260801, 5000), day(20260802, 5100)];

  const gen = (blockedExpiries) => histCombos({
    def: byId('bull-call-spread'), ua: { ...ua44, ins: '7' }, seriesByIns: series44,
    startDate: 20260801, entryBasis: 'CLOSE',
    settings: { ...defaults(), blockedExpiries }, filtered: false,
  });

  const free = gen('');
  const gated = gen(blockNear);
  check('بدون قید، ترکیب روی هر دو سررسید ساخته می‌شود',
    free.combos.length > gated.combos.length,
    `${free.combos.length} → ${gated.combos.length}`);
  const leaked = gated.combos.filter((c) =>
    c.legs.some((l) => l.kind !== 'underlying' && l.expiry === normalizeHistoryDate(NEAR)));
  check('هیچ ترکیب تاریخی روی سررسید پرشده ساخته نمی‌شود',
    leaked.length === 0, `${leaked.length} ترکیب نشتی`);
  check('و سررسید آزاد همچنان ترکیب می‌سازد', gated.combos.length > 0, `${gated.combos.length} ترکیب`);

  // ——— قید روی یک پایه، پایه دیگر را نمی‌بندد ———
  const otherBase = gen('999:20260901');
  check('قید یک پایه، پایه دیگر را کنار نمی‌گذارد',
    otherBase.combos.length === free.combos.length,
    `${otherBase.combos.length} برابر ${free.combos.length}`);

  // ——— مسیر زنده هم همان قید را دارد (رگرسیون) ———
  const liveBlocked = scanFn({
    def: byId('bull-call-spread'), chain: buildChain(rows, defaults()), uaKeys: ['7'],
    settings: { ...defaults(), blockedExpiries: blockNear }, qty: 1,
  });
  check('مسیر زنده هم سررسید پرشده را نمی‌سازد',
    liveBlocked.rows.every((r) => r.days !== 30), `${liveBlocked.rows.length} ردیف`);

  // ——— هیچ مسیر تاریخی‌ای بدون قید نماند ———
  const tabs = ['ui/tabs/history.mjs', 'ui/tabs/backtest.mjs', 'ui/tabs/portfolio-backtest.mjs'];
  const unguarded = tabs.filter((f) => {
    const src = readSrc(`../${f}`);
    return /flattenActiveContracts\(\s*(ua|analysisUa)\s*\)/.test(src);
  });
  check('هیچ تب تاریخی، فهرست قرارداد را بدون قید سقف نمی‌گیرد',
    unguarded.length === 0, unguarded.join('، '));
}

// ═══════════ ۴۵. ستون‌های مشخصات قرارداد و بازار ═══════════
//
// خواسته کاربر: همان ستون‌هایی که تابلوی حرفه‌ای دارد، اینجا هم باشد.
// قاعده‌ای که این گروه نگه می‌دارد: چیزی جمع می‌شود که جمعش معنی داشته باشد.
// مظنه و تلاطم ضمنی جمع نمی‌شوند — میانگین دو مظنه، عددی است که در هیچ دفتر
// سفارشی وجود ندارد — پس به‌ازای هر پا فهرست می‌شوند.
group('۴۵. ستون‌های مشخصات قرارداد');
{
  const size = 1000;
  const mk = (bid, ask, extra = {}) => ({
    bid, bidQty: 50, ask, askQty: 80, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    oi: 500, oiYday: 400, vol: 1200, trades: 30, value: 5e6,
    book: [{ level: 1, bid, bidQty: 50, ask, askQty: 80 }],
    ...extra,
  });
  const s45 = defaults();
  const ccDef = byId('covered-call');
  const cc = evaluate({
    legs: buildLegs(ccDef, { strikes: [110000], size, days: [30] }),
    quotes: [mk(99000, 100000), mk(4800, 5200)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s45, def: ccDef, underlying: 'نمونه', sigmaHist: 0.6 },
  });

  // ——— ارزش قرارداد ———
  check('نوشنال، قدرمطلق تعهد هر پا روی پایه است',
    near(cc.notional, 2 * size * 100000, 1e-9), uiFmt.money(cc.notional));
  check('ارزش بازاری موقعیت، قرینه نقد ناخالص است',
    near(cc.marketValue, -cc.grossCash, 1e-9), uiFmt.money(cc.marketValue));
  // کال ۱۱۰٬۰۰۰ روی پایه ۱۰۰٬۰۰۰ خارج از سود است، پس ذاتی‌اش صفر و کل ارزش
  // ذاتی موقعیت فقط از سهم می‌آید.
  check('ارزش ذاتی، کال خارج از سود را صفر می‌گیرد',
    near(cc.intrinsic, size * 100000, 1e-9), uiFmt.money(cc.intrinsic));
  check('ارزش زمانی کاوردکال منفی است، چون زمان را فروخته‌ای',
    cc.timeValue < 0 && near(cc.timeValue, -size * 4800, 1e-9), uiFmt.money(cc.timeValue));
  check('ارزش ذاتی به‌علاوه ارزش زمانی، همان ارزش بازاری است',
    near(cc.intrinsic + cc.timeValue, cc.marketValue, 1e-6));
  check('قیمت بلک‌شولز و درصد اختلافش حساب شد',
    Number.isFinite(cc.bsValue) && Number.isFinite(cc.bsDiffPct), `${uiFmt.pct(cc.bsDiffPct)}`);
  check('اهرم، کشسانی موقعیت است: دلتا × پایه ÷ ارزش بازاری',
    near(cc.leverage, (cc.delta * 100000) / cc.marketValue, 1e-9), cc.leverage.toFixed(3));

  // ——— سرمایه و تضمین ———
  // کاوردکال وجه تضمین نقدی ندارد چون سهم پوشش است، ولی «تضمین لازم» پای
  // فروش همچنان عددی دارد. این دو نباید یکی گرفته شوند.
  check('وجه تضمین کاوردکال صفر است ولی تضمین لازم پای فروش صفر نیست',
    cc.margin === 0 && cc.marginRequired > 0, uiFmt.money(cc.marginRequired));
  check('دارایی مسدودی، همان سهمی است که پوشش را می‌سازد',
    cc.sharesLocked === size && near(cc.blockedAsset, size * 100000, 1e-9),
    `${cc.sharesLocked} سهم`);

  // اسپرد بدهکار سهمی قفل نمی‌کند
  const sp = byId('bull-call-spread');
  const spread = evaluate({
    legs: buildLegs(sp, { strikes: [95000, 105000], size, days: [30] }),
    quotes: [mk(7000, 7400), mk(2000, 2300)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s45, def: sp, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('اسپرد بدون پای سهم، دارایی مسدودی ندارد',
    spread.sharesLocked === 0 && spread.blockedAsset === 0);

  const shortStrangleDef = byId('short-strangle');
  const shortStrangle = evaluate({
    legs: buildLegs(shortStrangleDef, { strikes: [90000, 110000], size, days: [30] }),
    quotes: [mk(3800, 4000), mk(4800, 5000)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s45,
      def: shortStrangleDef, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('ردیف استرانگل فروش، یک جزء ترکیبی دارد نه دو وجه تضمین مستقل',
    shortStrangle.marginParts.length === 1
    && shortStrangle.marginPart1 === shortStrangle.margin
    && Number.isNaN(shortStrangle.marginPart2));
  check('شکاف اجزای وجه تضمین با خانهٔ خالی حفظ می‌شود',
    MARGIN_PART_SLOTS === 4
    && marginPartSlots([{ amount: 7 }, { amount: NaN }, { amount: 9 }]).marginPart1 === 7
    && Number.isNaN(marginPartSlots([{ amount: 7 }, { amount: NaN }, { amount: 9 }]).marginPart2));

  // ——— بازار ———
  check('حجم و ارزش و تعداد معامله فقط از پاهای اختیار جمع می‌شوند',
    spread.volTotal === 2400 && spread.tradeCount === 60 && spread.valueTotal === 1e7,
    `حجم ${spread.volTotal}`);
  check('موقعیت باز و تغییرش جمع می‌شوند',
    spread.oiTotal === 1000 && spread.oiChange === 200);
  check('کاوردکال فقط یک پای اختیار دارد، پس حجم یک پا شمرده می‌شود',
    cc.volTotal === 1200 && cc.oiTotal === 500);

  // ——— مظنه: فهرست، نه جمع ———
  check('مظنه هر پا جدا فهرست می‌شود، نه جمع',
    Array.isArray(spread.bidList) && spread.bidList.length === 2
    && spread.bidList[0] === 7000 && spread.bidList[1] === 2000,
    spread.bidList.join(' , '));
  check('عرضه و آخرین و پایانی هم فهرست‌اند',
    spread.askList.length === 2 && spread.lastList.length === 2 && spread.closeList.length === 2);
  check('تلاطم ضمنی هر پا جدا می‌آید', spread.ivList.length === 2 && spread.ivList.every(Number.isFinite),
    spread.ivList.join(' , '));
  check('قیمت سرخط هر پا، همان قیمت اجرای همان پاست',
    spread.headlineList.length === 2
    && near(spread.headlineList[0], spread.legPrices[0].price, 1e-9));
  check('حجم مظنه، کمترین پا را می‌دهد نه جمع را',
    spread.bidQtyMin === 50 && spread.askQtyMin === 80);
  check('فاصله، بدترین پا را می‌دهد',
    Number.isFinite(spread.spreadWorstPct) && spread.spreadWorstPct > 0,
    uiFmt.pct(spread.spreadWorstPct));

  // ——— قرارداد ستونی ———
  const keys = new Set(COLUMNS.map((c) => c.key));
  const NEED = ['headlineList', 'bidList', 'askList', 'lastList', 'closeList', 'spreadWorstPct',
    'bidQtyMin', 'askQtyMin', 'volTotal', 'valueTotal', 'tradeCount', 'oiTotal', 'oiChange',
    'notional', 'marketValue', 'intrinsic', 'timeValue', 'bsValue', 'bsDiffPct', 'ivList',
    'leverage', 'marginRequired', 'marginParts', 'marginPart1', 'marginPart2',
    'marginPart3', 'marginPart4', 'blockedAsset', 'sharesLocked', 'rho', 'deltaShares'];
  const absent = NEED.filter((k) => !keys.has(k));
  check('هر ستون تازه در قرارداد ستونی ثبت شده', absent.length === 0, absent.join('، '));

  // هر ستون باید روی ردیف واقعی مقدار داشته باشد — ستونی که همیشه تهی است،
  // در انتخابگر فقط سردرگمی می‌سازد.
  const empty = COLUMNS.filter((c) => !(c.key in cc)).map((c) => c.key);
  check('هیچ ستونی بدون کلید متناظر روی ردیف نمانده', empty.length === 0, empty.join('، '));
  // فهرست قالب‌ها از خودِ `ui/fmt.mjs` می‌آید، نه از رونوشتی اینجا. رونوشت
  // با افزودن هر قالب تازه کهنه می‌شد و آزمون، ستونِ درست را رد می‌کرد.
  const badFmt = COLUMNS.filter((c) => typeof uiFmt[c.fmt] !== 'function');
  check('قالب هر ستون در ui/fmt.mjs تعریف شده', badFmt.length === 0, badFmt.map((c) => `${c.key}:${c.fmt}`).join('، '));
}

// ═══════════ ۴۶. نوار فرض‌های نمودار بازده ═══════════
//
// نمودار حالا سه فرض منحنی «امروز» را دست کاربر می‌دهد: روز مانده، تلاطم،
// نرخ بدون ریسک. منحنی سررسید فرض‌پذیر نیست و نباید تکان بخورد.
//
// معنی اسلایدر «روز مانده» یک متمم است: افق ارزش‌گذاری = نزدیک‌ترین سررسید
// منهای روز مانده. این آزمون همان تبدیل را قفل می‌کند، چون اگر جهتش برعکس
// شود نمودار بی‌صدا غلط می‌شود — شکلش هنوز باورپذیر است.
group('۴۶. فرض‌های منحنی امروز');
{
  const legs46 = [{ kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 20000, price: 32318, days: 63 }];
  const net46 = -32318 * 1000;
  const fees46 = { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };
  const base46 = { fees: fees46, spot: 50784, sigma: 0.467, rFree: 0.25, divYield: 0 };
  const expiry46 = analyzePayoff(legs46, net46, { fees: fees46 });
  const atHorizon = (h) => analyzeMixed(legs46, net46, { ...base46, horizonDays: h });

  // روز مانده = ۰  →  افق = نزدیک‌ترین سررسید  →  همان منحنی سررسید
  const collapsed = atHorizon(63);
  const sameAsExpiry = [30000, 50784, 70000]
    .every((S) => near(collapsed.at(S), expiry46.at(S), 1e-6));
  check('روز مانده صفر، منحنی امروز را روی منحنی سررسید می‌خواباند', sameAsExpiry,
    `${Math.round(collapsed.at(50784))} در برابر ${Math.round(expiry46.at(50784))}`);

  // روز مانده کامل  →  افق صفر  →  ارزش زمانی هنوز هست، پس بالاتر از سررسید
  const today46 = atHorizon(0);
  check('با روز مانده کامل، خرید کال ارزش زمانی دارد و بالای منحنی سررسید است',
    today46.at(50784) > expiry46.at(50784),
    `${Math.round(today46.at(50784))} > ${Math.round(expiry46.at(50784))}`);

  // تلاطم بالاتر، ارزش زمانی بیشتر — برای موقعیت خرید یعنی منحنی بالاتر
  const hiVol = analyzeMixed(legs46, net46, { ...base46, sigma: 0.9, horizonDays: 0 });
  check('تلاطم بیشتر، منحنی امروزِ موقعیت خرید را بالا می‌برد',
    hiVol.at(50784) > today46.at(50784),
    `${Math.round(hiVol.at(50784))} > ${Math.round(today46.at(50784))}`);

  // نرخ بهره روی کال خرید اثر مثبت دارد (رو مثبت است)
  const hiRate = analyzeMixed(legs46, net46, { ...base46, rFree: 0.6, horizonDays: 0 });
  check('نرخ بالاتر، منحنی امروزِ کال خرید را بالا می‌برد',
    hiRate.at(50784) > today46.at(50784),
    `${Math.round(hiRate.at(50784))} > ${Math.round(today46.at(50784))}`);

  // منحنی سررسید به هیچ‌کدام وابسته نیست
  check('منحنی سررسید با هیچ فرضی تکان نمی‌خورد',
    near(analyzePayoff(legs46, net46, { fees: fees46 }).at(50784), expiry46.at(50784), 1e-12));

  // ——— قرارداد نوار، در خود ماژول ———
  const chartSrc = readSrc('../ui/chart.mjs');
  check('نوار فرض‌ها افق را از متمم روز مانده می‌سازد',
    chartSrc.includes('horizonDays: nearDays - a.days'));
  check('هر سه فرض در نوار هست',
    ['روز مانده', 'نوسان دلخواه', 'نرخ بهره'].every((t) => chartSrc.includes(t)));
  check('نوار دکمه بازگشت به فرض‌های واقعی دارد', chartSrc.includes('data-assume-reset'));
  // عددی که کاربر می‌بیند باید از fmt عبور کند (قاعده ۲-۳)
  check('عدد نوار فرض‌ها از fmt عبور می‌کند',
    chartSrc.includes('fmt.int(v)') && chartSrc.includes('fmt.num(Number(v.toFixed(3)))'));
  // برچسب لبه، بیرون قاب نیفتد
  check('برچسب قیمت پایه و سربه‌سری لنگر لبه‌ای دارد',
    chartSrc.includes('edgeAnchor(X(spot))') && chartSrc.includes('edgeAnchor(X(b)'));
  check('رسم دوباره از بیرون ممکن است', chartSrc.includes('redraw: render'));
}

// ═══════════════════════════ ۴۷. نوار «سقف سررسید» — وقتی زنجیره نیست ═══════════════════════════
group('۴۷. نوار سقف سررسید، وقتی زنجیره نیست');
{
  // این نوار روی `/api/watch` بسته شده بود. حلقه دیده‌بان بیرون از ساعت بازار
  // عمداً پارک می‌شود، پس آن نقطه پایانی شب‌ها آرایه خالی می‌دهد — با کد ۲۰۰ و
  // بدون هیچ خطایی. نتیجه: کاربر دکمه را می‌زد و پنل عملاً خالی بود. بدتر از
  // آن، سررسیدهای علامت‌خورده هم دیده نمی‌شدند، یعنی چیزی که روی همه محاسبات
  // اثر داشت راه خاموش‌کردن نداشت.
  const mkRow47 = (strike, days, ua = '1', uaName = 'نمونه', endDate = 20260101) => ({
    uaInsCode: ua, lval30_UA: uaName, pDrCotVal_UA: 100000, pClosing_UA: 100000,
    insCode_C: `c${ua}_${strike}_${days}`, lVal18AFC_C: `ض${strike}`,
    insCode_P: `p${ua}_${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate,
    pMeDem_C: 900, qTitMeDem_C: 10, pMeOf_C: 1000, qTitMeOf_C: 10,
    pDrCotVal_C: 950, pClosing_C: 950, oP_C: 5, qTotTran5J_C: 5,
    pMeDem_P: 800, qTitMeDem_P: 10, pMeOf_P: 900, qTitMeOf_P: 10,
    pDrCotVal_P: 850, pClosing_P: 850, oP_P: 5, qTotTran5J_P: 5,
  });
  const chain47 = buildChain([
    mkRow47(100000, 30, '1', 'نمونه', 20260101),
    mkRow47(100000, 90, '1', 'نمونه', 20260301),
  ]);
  const live47 = '1:20260101';
  const gone47 = '1:20251201';   // سررسید گذشته، دیگر قراردادی ندارد
  const other47 = '2:20260101';  // نمادی که اصلاً در زنجیره نیست

  check('کلیدی که زنجیره پوشش می‌دهد جدا نمی‌افتد',
    strandedKeys(new Set([live47]), chain47).length === 0);
  check('کلید سررسید گذشته جدا می‌افتد و دیده می‌شود',
    strandedKeys(new Set([live47, gone47]), chain47).join('|') === gone47);
  // مهم‌ترین حالت: بازار بسته است و زنجیره‌ای در کار نیست. اگر اینجا فهرست خالی
  // برگردد، کاربر با تنظیمی می‌ماند که راه برداشتنش را ندارد.
  check('بدون زنجیره، هر کلید علامت‌خورده جدا می‌افتد',
    strandedKeys(new Set([live47, other47]), null).length === 2);
  check('زنجیره خالی هم مثل نبودِ زنجیره است',
    strandedKeys(new Set([live47]), new Map()).join('|') === live47);
  check('فهرست جداافتاده‌ها مرتب است', 
    strandedKeys(new Set([other47, gone47]), chain47).join('|') === [gone47, other47].sort().join('|'));

  const src47 = readSrc('../ui/expiries.mjs');
  // `history/universe` تنها نقطه‌ای است که فهرست قرارداد فعال را بیرون از ساعت
  // بازار هم می‌دهد؛ خودِ سرور همین را در توضیحش نوشته است.
  check('نوار، فهرست را از نقطه‌ای می‌گیرد که شب و روز پاسخ می‌دهد',
    src47.includes("fetch('/api/history/universe')") && !src47.includes("fetch('/api/watch')"));
  const serverSrc47 = readSrc('../server/server.mjs');
  check('چرا `watch` مناسب نبود: حلقه دیده‌بان پشت ساعت بازار می‌ایستد',
    /if \(!gate\.open\) return true;/.test(serverSrc47));
  check('`history/universe` وقتی عکس لحظه‌ای خالی است خودش از بالادست می‌گیرد',
    /history\/universe[\s\S]{0,700}fromWatch = watch\.rows\.length > 0[\s\S]{0,200}fromWatch \? watch\.rows : firstList/.test(serverSrc47));
  // زنجیره خالی نباید کش شود، وگرنه یک بارِ ناموفق تا بارگذاری دوباره صفحه
  // ادامه پیدا می‌کند و باز کردن دوباره هیچ تلاشی نمی‌کند.
  check('زنجیره خالی کش نمی‌شود', src47.includes('if (chain?.size && !force) return;'));
  check('دکمه تلاش دوباره وجود دارد و بار را با اجبار می‌گیرد',
    src47.includes('data-capacity-retry') && src47.includes('loadChain(true)'));
  // پیش از این هر سه خروجیِ زودهنگام `paintPanel` پنل را با یک جمله جایگزین
  // می‌کردند، پس «پاک کردن همه» هم در حالت بی‌زنجیره در دسترس نبود.
  check('کنش‌ها همیشه رسم می‌شوند، حتی وقتی زنجیره نیامده',
    src47.includes('data-capacity-clear') && !/paintPanel = \(\) => \{\n\s+if \(loading\)/.test(src47));
  check('خطای بالادست به فارسی ترجمه می‌شود و متن خام در `title` می‌ماند',
    src47.includes('humanizeUpstreamError(errorRaw)') && src47.includes('title="${esc(errorRaw)}"'));
}

// ═══════════════════════════ ۴۸. نام انگلیسی، رنگ منفی، و ریل آیکونی ═══════════════════════════
group('۴۸. نام انگلیسی، رنگ منفی، و ریل آیکونی');
{
  // ——— نام استراتژی ———
  const latin = /^[A-Za-z][A-Za-z\- ]*$/;
  check('نام هر ۳۱ استراتژی انگلیسی است',
    CATALOG.every((d) => latin.test(d.name)),
    CATALOG.filter((d) => !latin.test(d.name)).map((d) => d.id).join(' , ') || 'همه');
  check('هیچ نامی تکراری نیست', new Set(CATALOG.map((d) => d.name)).size === CATALOG.length);
  // برابر فارسی نمایش داده نمی‌شود ولی باید بماند، وگرنه کسی که استراتژی را
  // با نام فارسی می‌شناسد هیچ راهی برای پیدا کردنش ندارد.
  check('برابر فارسی برای جست‌وجو نگه داشته شده',
    CATALOG.every((d) => typeof d.fa === 'string' && d.fa.length > 0));
  const appSrc48 = readSrc('../ui/app.mjs');
  check('جست‌وجوی ریل نام فارسی را هم می‌بیند', appSrc48.includes("${t.def?.fa || ''}"));

  // ——— جزیرهٔ جهت‌دار ———
  //
  // بدون این، «Covered Call — مطالعه‌ای» می‌تواند وارونه دیده شود: خط تیره
  // خنثی است و به بافت راست‌به‌چپ می‌چسبد.
  check('نام لاتین در جزیرهٔ جهت‌دار بسته می‌شود',
    uiFmt48.ltr('Covered Call') === '\u2068Covered Call\u2069');
  check('مقدار تهی رشتهٔ خالی می‌دهد', uiFmt48.ltr(null) === '' && uiFmt48.ltr(undefined) === '');
  for (const [file, what] of [['../ui/app.mjs', 'ریل'], ['../ui/tabs/strategy.mjs', 'سرصفحهٔ استراتژی'],
    ['../ui/tabs/backtest.mjs', 'فهرست بک‌تست'], ['../ui/tabs/history.mjs', 'فهرست تاریخچه']]) {
    const src = readSrc(file);
    check(`نام استراتژی در ${what} ایزوله می‌شود`, /ltr\(/.test(src));
  }

  // ——— رنگ عدد منفی ———
  check('کلاس منفی فقط به عدد منفی می‌خورد',
    uiFmt48.negClass(-1) === 'neg' && uiFmt48.negClass(0) === '' && uiFmt48.negClass(5) === ''
    && uiFmt48.negClass(NaN) === '' && uiFmt48.negClass(Infinity) === '');
  check('سلول عددی آماده، کلاس و قالب را با هم می‌دهد',
    uiFmt48.numCell(-5000, 'money').includes('class="n neg') && uiFmt48.numCell(-5000, 'money').includes('<td'));
  const css48 = readSrc('../ui/style.css');
  // `signTone` ده‌ها جا کلاس loss می‌گذاشت و هیچ قاعدهٔ سراسری‌ای رنگش
  // نمی‌کرد — یعنی بیشترشان بی‌اثر بودند.
  check('کلاس زیان و سود روی سلول جدول قاعدهٔ سراسری دارد',
    /td\.loss, dd\.loss \{ color: var\(--loss\); \}/.test(css48)
    && /td\.gain, dd\.gain \{ color: var\(--gain\); \}/.test(css48));
  check('کلاس neg هم سراسری است', /\.neg, td\.neg, dd\.neg \{ color: var\(--loss\); \}/.test(css48));

  // ——— ریل ———
  check('هر گروه استراتژی آیکون دارد',
    Object.keys(STRAT_GROUPS48).every((k) => GROUP_ICON[k]),
    Object.keys(STRAT_GROUPS48).filter((k) => !GROUP_ICON[k]).join(' , ') || 'همه');
  check('هر تب غیراستراتژی هم آیکون دارد',
    ['settings', 'live-market', 'history', 'backtest', 'portfolio-backtest', 'positions', 'roll']
      .every((id) => TAB_ICON[id]));
  check('آیکون رنگ را از متن می‌گیرد، نه رنگ ثابت',
    icon('coins').includes('stroke="currentColor"') && !/stroke="#/.test(icon('coins')));
  check('آیکون ناشناخته به‌جای شکستن، نقطه می‌دهد', icon('چیزی-که-نیست').includes('<circle'));
  check('بخش بی‌گروه هم آیکون می‌گیرد',
    sectionIcon('پایه') === 'sliders' && sectionIcon('موقعیت من') === 'briefcase');
  // پیش‌فرض «همه بسته» فقط وقتی درست است که نبودِ کلید از آرایهٔ خالی جدا
  // شود، وگرنه کاربری که همه را باز کرده هر بار دوباره بسته می‌بیند.
  check('نبودِ کلید حافظه با آرایهٔ خالی یکی گرفته نمی‌شود',
    appSrc48.includes('if (raw == null) return new Set(allSections);'));
  check('برچسب «n پا» از ریل برداشته شد', !appSrc48.includes('پا</span>'));
  check('باز شدن تب، گروه بسته‌اش را باز می‌کند',
    appSrc48.includes('if (folded.has(t.section)) { revealSection(t.section); buildRail(); }'));
  // آکاردئون: با ده سرگروه و چهل تب، «چند بخشِ هم‌زمان باز» یعنی ستون کناری
  // بلندتر از صفحه می‌شود و کاربر برای رسیدن به سرگروه بعدی از کنار فهرستی
  // رد می‌شود که کاری با آن ندارد.
  check('باز شدن یک بخش، بقیه بخش‌های باز را می‌بندد',
    /function revealSection\(sec\) \{[\s\S]*?folded\.add\(other\)[\s\S]*?folded\.delete\(sec\);/.test(appSrc48));
  // `stage` خودش جعبهٔ پیمایش است؛ `scrollIntoView` پیمایش داخلی‌اش را صفر
  // نمی‌کند و تب تازه از جایی که تب قبلی رهایش کرده بود شروع می‌شد.
  check('تب تازه از سطر اول شروع می‌شود، نه از جای تب قبلی',
    (appSrc48.match(/stage\.scrollTop = 0;/g) || []).length >= 2);
  // رنگ بخش از توکن‌های خودِ پوسته می‌آید، وگرنه پوستهٔ تیره باید جدا رنگ
  // بگیرد و همان پراکندگی‌ای می‌شود که نگهبان ۴ جلویش را گرفته.
  check('رنگ هر بخش ریل از توکن پوسته می‌آید، نه از رنگ سخت‌کد',
    /const SECTION_TONE = \{[\s\S]*?\};/.test(appSrc48)
    && !/SECTION_TONE = \{[\s\S]*?#[0-9a-fA-F]{3}/.test(appSrc48));
  const styleSrc48 = readSrc('../ui/style.css');
  check('تب باز، رنگ بخش خودش را می‌گیرد نه یک رنگ همیشگی',
    /\.tab-btn\[aria-current="true"\] \{[^}]*var\(--sec\)/.test(styleSrc48));
}

// ═══════════════════════════ ۴۹. سنجه‌های رصدگر لحظه‌ای ═══════════════════════════
group('۴۹. سنجه‌های رصدگر لحظه‌ای');
{
  // کندور آهنی: خرید پوت ۸۰ به ۱ ، فروش پوت ۹۰ به ۳ ، فروش کال ۱۱۰ به ۳ ، خرید کال ۱۲۰ به ۱
  const legs49 = [
    { kind: 'put', side: 'buy', strike: 80, price: 1, ratio: 1, size: 1000 },
    { kind: 'put', side: 'sell', strike: 90, price: 3, ratio: 1, size: 1000 },
    { kind: 'call', side: 'sell', strike: 110, price: 3, ratio: 1, size: 1000 },
    { kind: 'call', side: 'buy', strike: 120, price: 1, ratio: 1, size: 1000 },
  ];
  const an49 = analyzePayoff(legs49, grossCash(legs49));
  const be49 = breakevenMetrics(an49.breakevens, 100);
  // سربه‌سری‌ها ۸۶ و ۱۱۴ ، پایه ۱۰۰ → نزدیک‌ترین ۱۱۴ نیست، هر دو ۱۴ فاصله دارند
  check('نزدیک‌ترین سربه‌سری، اولین با کمترین فاصله است', near(be49.beNear, 86), be49.beNear);
  check('فاصله علامت‌دار است — پایه بالای سربه‌سری یعنی مثبت', be49.beDistPct > 0 && near(be49.beDistPct, 14));
  check('حاشیه امن بی‌علامت است', near(be49.beRoomPct, 14));
  check('پهنای سربه‌سری برای ترکیب دوسره معنی دارد', near(be49.beWidthPct, 28), be49.beWidthPct);

  // تک‌سربه‌سری: پهنا نباید عدد بسازد
  const one49 = breakevenMetrics([95], 100);
  check('یک سربه‌سری یعنی پهنا خالی، نه صفر', !Number.isFinite(one49.beWidthPct) && near(one49.beDistPct, 5));
  check('بدون سربه‌سری یا بدون پایه، همه خالی می‌مانند',
    !Number.isFinite(breakevenMetrics([], 100).beNear) && !Number.isFinite(breakevenMetrics([95], 0).beNear));

  // ——— درصد سمت زیان و نسبت پاداش به ریسک ———
  const cols49 = new Set(COLUMNS.map((c) => c.key));
  check('ستون درصد بیشترین زیان هست', cols49.has('maxLossPct'));
  check('ستون پاداش به ریسک هست', cols49.has('rewardRisk'));
  const src49 = readSrc('../core/evaluate.mjs');
  // بی‌نهایت در مخرج، صفر می‌دهد و صفرِ ساختگی بدتر از خالی است.
  check('زیان نامحدود، نسبت پاداش به ریسک نمی‌سازد',
    src49.includes('ok(bestPnl) && ok(payoff.maxLoss) && payoff.maxLoss > 0'));
  check('درصد زیان به سرمایه سنجیده می‌شود، نه به چیز دیگر',
    src49.includes('(payoff.maxLoss / cap) * 100'));

  // ——— دیده شدن در نمای پیش‌فرض ———
  //
  // ستون‌های سربه‌سری از قبل در قرارداد ستونی بودند ولی در هیچ نمای آماده‌ای
  // نبودند؛ یعنی عملاً کسی نمی‌دیدشان. آزمون، همان دیده‌شدن را قفل می‌کند.
  const stratSrc49 = readSrc('../ui/tabs/strategy.mjs');
  const topSrc49 = readSrc('../ui/tabs/top.mjs');
  const summary49 = /خلاصه: \[([\s\S]*?)\],\n/.exec(stratSrc49)?.[1] || '';
  for (const k of ['be1DistPct', 'beRoomPct', 'maxProfit', 'maxProfitPct', 'retMaxPct', 'maxLoss',
    'maxLossPct', 'rewardRisk', 'expiryLabel', 'strikes', 'legNames']) {
    check(`نمای خلاصهٔ استراتژی ستون ${k} را دارد`, summary49.includes(`'${k}'`));
  }
  for (const k of ['beDistPct', 'beRoomPct', 'maxLossPct', 'rewardRisk']) {
    check(`نمای برترین موقعیت‌ها ستون ${k} را دارد`, topSrc49.includes(`'${k}'`));
  }
}

// ═══════════════════════════ ۵۰. رصد بازار: ستون کامل، طیف مرتب‌سازی، نمودار ═══════════════════════════
group('۵۰. رصد بازار — ستون، طیف، نمودار');
{
  const mk50 = (strike, days, cBid, pBid) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 99500,
    insCode_C: `c${strike}_${days}`, insCode_P: `p${strike}_${days}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: 10, pMeOf_C: cBid * 1.05, qTitMeOf_C: 10,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 50, qTotTran5J_C: 100, qTotCap_C: 500, zTotTran_C: 5,
    pMeDem_P: pBid, qTitMeDem_P: 10, pMeOf_P: pBid * 1.05, qTitMeOf_P: 10,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 40, qTotTran5J_P: 80, qTotCap_P: 400, zTotTran_P: 4,
  });
  const chain50 = buildChain([mk50(90000, 30, 900, 300), mk50(100000, 30, 500, 500), mk50(110000, 60, 300, 900)]);
  const u50 = underlyingList(chain50)[0];

  // ——— تجمیع یک‌گذری ———
  check('قرارداد و قیمت اعمال و سررسید شمرده می‌شوند',
    u50.contracts === 6 && u50.strikes === 3 && u50.expiries === 2, `${u50.contracts}/${u50.strikes}/${u50.expiries}`);
  check('حجم و موقعیت باز، جمعِ دو سمت‌اند',
    u50.volume === u50.callVol + u50.putVol && u50.oi === u50.callOi + u50.putOi
    && u50.volume === 540 && u50.oi === 270, `حجم ${u50.volume} | موقعیت ${u50.oi}`);
  check('تفکیک کال و پوت درست است',
    u50.callVol === 300 && u50.putVol === 240 && u50.callOi === 150 && u50.putOi === 120);
  // نسبت روی حجم چیزی می‌گوید که نسبت روی موقعیت باز نمی‌گوید
  check('دو نسبت پوت به کال جدا محاسبه می‌شوند',
    near(u50.pcVolRatio, 240 / 300) && near(u50.pcRatio, 120 / 150));
  check('ارزش و تعداد معامله جمع می‌شوند', u50.value === 2700 && u50.trades === 27);
  check('دورترین سررسید هم گزارش می‌شود', u50.nearestDays === 30 && u50.farDays === 60);
  // فاصلهٔ مظنه میانه است نه میانگین: یک قرارداد بی‌رمق میانگین را بی‌معنی می‌کند
  check('میانه فاصله مظنه از قراردادهای دوطرفه می‌آید',
    u50.twoSided === 6 && near(u50.spreadMedPct, (0.05 / 1.025) * 100), u50.spreadMedPct);
  const noQuote50 = underlyingList(buildChain([{ ...mk50(100000, 30, 0, 0),
    pMeDem_C: 0, pMeOf_C: 0, pMeDem_P: 0, pMeOf_P: 0 }]))[0];
  check('بدون مظنه دوطرفه، فاصله خالی می‌ماند نه صفر',
    noQuote50.twoSided === 0 && !Number.isFinite(noQuote50.spreadMedPct));

  const st50 = chainStats(chain50);
  check('آمار کل، تفکیک موقعیت باز را هم می‌دهد',
    st50.callOi === 150 && st50.putOi === 120 && near(st50.pcOi, 0.8));
  check('کالِ صفر یعنی نسبت تعریف‌نشده، نه بی‌نهایت',
    !Number.isFinite(chainStats(buildChain([{ ...mk50(100000, 30, 500, 500), oP_C: 0 }])).pcOi));

  // ——— طیف رنگی ———
  //
  // دامنهٔ دوعلامتی باید هر طرف را با مقیاس خودش بسنجد. با یک مقیاس مشترک،
  // دامنه‌ای مثل [−۱۰، ۱۰۰۰] کل سمت زیان را بی‌رنگ می‌کند.
  check('دامنه دوعلامتی، واگرا می‌شود و هر طرف رنگ خودش را می‌گیرد',
    heatRamp(-10, -10, 1000, null).tone === 'loss' && heatRamp(500, -10, 1000, null).tone === 'gain');
  check('کوچک‌ترین زیان هم دیده می‌شود، چون مقیاس هر طرف جداست',
    near(heatRamp(-10, -10, 1000, null).t, 1));
  check('صفر در دامنه واگرا بی‌رنگ است', near(heatRamp(0, -50, 50, null).t, 0));
  check('دامنه یک‌طرفه رنگ اعلان‌شده ستون را می‌گیرد',
    heatRamp(5, 0, 10, 'loss').tone === 'loss' && heatRamp(5, 0, 10, 'gain').tone === 'gain'
    && heatRamp(5, 0, 10, null).tone === 'flat');
  // ریشهٔ دوم: بدون آن یک مقدار پرت بقیه را بی‌رنگ می‌کند
  check('شدت با ریشه دوم بالا می‌رود، نه خطی', near(heatRamp(25, 0, 100, null).t, 0.5));
  check('مقدار بیرون از دامنه مهار می‌شود',
    heatRamp(500, 0, 100, null).t === 1 && heatRamp(-5, 0, 100, null).t === 0);
  check('دامنه صفرپهنا یا مقدار نامعتبر، طیف نمی‌سازد',
    heatRamp(5, 5, 5, null) === null && heatRamp(NaN, 0, 10, null) === null
    && heatRamp(5, NaN, 10, null) === null);

  const tblSrc50 = readSrc('../ui/table.mjs');
  // ردیف رصد بازار مفهوم «قابل اجرا» ندارد. با `!r.executable` همه‌شان
  // خاکستریِ غیرقابل‌اجرا می‌شدند و چون آن کلاس طیف را کنار می‌زند، هیچ ردیفی
  // در رصد بازار رنگ نمی‌گرفت.
  check('نبودِ فیلد «قابل اجرا» با «قابل اجرا نیست» یکی گرفته نمی‌شود',
    tblSrc50.includes("if (r.executable === false) return 'unexec';"));
  check('ردیف هشداردار رنگ خودش را نگه می‌دارد، نه طیف را',
    /if \(!cls\) \{[\s\S]{0,200}?dataset\.heat/.test(tblSrc50));
  check('راهنمای طیف با هر مرتب‌سازی دوباره کشیده می‌شود',
    /computeRanges\(\);\n\s+drawLegend\(\);/.test(tblSrc50));
  check('ستون مرتب‌شده حتی بدون heat اعلان‌شده دامنه می‌گیرد',
    tblSrc50.includes("if (!c.heat && c.key !== sortKey) continue;"));

  const chainSrc50 = readSrc('../ui/tabs/chain.mjs');
  check('انتخابگر و ماندگاری ستون در رصد بازار روشن است',
    chainSrc50.includes('all: ALL_COLS') && chainSrc50.includes("storeKey: 'chain:market'"));
  check('نمودار میله‌ای با سنجهٔ قابل تعویض هست',
    chainSrc50.includes("id=\"mkt-metric\"") && chainSrc50.includes('function drawBars()'));
  // سنجه‌ای که تفکیک کال و پوت ندارد نباید نصف ساختگی بگیرد
  check('فقط سنجه‌های تفکیک‌پذیر دوتکه کشیده می‌شوند',
    /SPLIT = \{ volume: \['callVol', 'putVol'\], oi: \['callOi', 'putOi'\] \}/.test(chainSrc50));
}

// ═══════════════════════════ ۵۱. انتقال ترکیب زنده به بک‌تست ═══════════════════════════
group('۵۱. انتقال ترکیب زنده به بک‌تست');
{
  const row51 = {
    uaIns: '77', underlying: 'اهرم', strategyId: 'bull-call-spread', strategy: 'Bull Call Spread',
    legsText: '+۱ کال ۲۰۰۰۰  −۱ کال ۲۲۰۰۰',
    __legs: [
      { kind: 'call', side: 'buy', strike: 20000, ins: 'c1', name: 'ضهرم1' },
      { kind: 'call', side: 'sell', strike: 22000, ins: 'c2', name: 'ضهرم2' },
    ],
  };
  check('ردیف دارای نماد و شناسه پا، قابل انتقال است', canHandoff(row51));
  check('ردیف بدون نماد پایه قابل انتقال نیست', !canHandoff({ ...row51, uaIns: '' }));
  // بدون شناسه قرارداد، مقصد باید ترکیب را از روی قیمت اعمال حدس بزند و دو
  // قرارداد هم‌اعمال در دو سررسید یکی گرفته می‌شوند.
  check('ردیف بدون شناسه قرارداد قابل انتقال نیست',
    !canHandoff({ ...row51, __legs: [{ kind: 'call', side: 'buy', strike: 20000, ins: '' }] }));
  check('ردیف تهی، برنامه را نمی‌شکند', !canHandoff(null) && !canHandoff({}));

  const plan51 = handoffPlan(row51, { from: 'strategy', strategyId: 'bull-call-spread', units: 3 });
  check('نقشه، مقصد و مبدأ را می‌برد', plan51.to === 'backtest' && plan51.from === 'strategy');
  check('فقط پاهای اختیار منتقل می‌شوند', plan51.legIns.join(',') === 'c1,c2');
  // پای سهم در تب بک‌تست از خود ترکیب ساخته می‌شود، نه از فهرست قرارداد
  const withStock51 = handoffPlan({ ...row51,
    __legs: [...row51.__legs, { kind: 'underlying', side: 'buy', ins: 'u9' }] });
  check('پای دارایی پایه در فهرست قرارداد نمی‌آید', withStock51.legIns.join(',') === 'c1,c2');
  check('تعداد واحد دست‌کم یک است و صحیح',
    handoffPlan(row51, { units: 0 }).units === 1 && handoffPlan(row51, { units: 2.7 }).units === 2
    && handoffPlan(row51, {}).units === 1);
  // ردیف زنده تاریخ ندارد؛ حدس‌زدن یک بازهٔ ثابت، بازه‌ای می‌سازد که ممکن
  // است برای این قرارداد اصلاً وجود نداشته باشد.
  check('تاریخ‌ها خودکارند، نه حدسی', plan51.entryDate === 'auto' && plan51.exitDate === 'auto');
  check('مبنای قیمت پیش‌فرض آخرین معامله است',
    plan51.entryBasis === 'LAST' && plan51.exitBasis === 'LAST');
  // انتقال باید انتخاب ببرد نه نتیجه: اگر عددی کپی شود، دو تب می‌توانند دو
  // حرف بزنند و معلوم نیست کدام مال کدام محاسبه است.
  for (const k of ['maxProfit', 'maxLoss', 'retMaxPct', 'netCash', 'capital', 'popPct']) {
    check(`نتیجهٔ «${k}» در نقشه منتقل نمی‌شود`, !(k in plan51));
  }

  const btSrc51 = readSrc('../ui/tabs/backtest.mjs');
  check('مقصد، تاریخ خودکار را به بلندترین بازهٔ موجود ترجمه می‌کند',
    btSrc51.includes("plan.entryDate === 'auto' ? entryDates[0]")
    && btSrc51.includes("plan.exitDate === 'auto' ? exitDates.at(-1)"));
  for (const [file, what] of [['../ui/tabs/strategy.mjs', 'تب استراتژی'], ['../ui/tabs/top.mjs', 'برترین موقعیت‌ها']]) {
    const src = readSrc(file);
    check(`${what} دکمهٔ انتقال دارد و فقط برای ردیف قابل انتقال`,
      src.includes('canHandoff(r) ? handoffButtonHtml()') && src.includes('goHandoff(state, handoffPlan(r, {'));
  }
}

// ═══════════════════════════ ۵۲. سناریو، حساسیت، و ریسک عمق دفتر ═══════════════════════════
group('۵۲. سناریو، حساسیت، و ریسک عمق دفتر');
{
  // Bull Call Spread: خرید کال ۱۰۰ به ۸ ، فروش کال ۱۱۰ به ۳ ، اندازه ۱۰۰۰
  const legs52 = [
    { kind: 'call', side: 'buy', strike: 100, price: 8, ratio: 1, size: 1000, name: 'C100' },
    { kind: 'call', side: 'sell', strike: 110, price: 3, ratio: 1, size: 1000, name: 'C110' },
  ];
  const net52 = grossCash(legs52);
  const base52 = { legs: legs52, spot: 100, days: 60, sigma: 0.4, rFree: 0.25, divYield: 0, yearDays: 365 };
  const lad52 = scenarioLadder(base52);

  check('نردبان سناریو ساخته می‌شود', lad52.length >= 8, `${lad52.length} سطح`);
  // مهم‌ترین ثابت این ماژول: اگر جدول و نمودار از دو راه حساب کنند، دو حرف
  // می‌زنند و کاربر نمی‌فهمد کدام درست است.
  check('سود و زیان هر سطح، دقیقاً همان چیزی است که نمودار بازده می‌کشد',
    lad52.every((r) => near(r.pnl, pnlAtExpiry(legs52, r.level, net52))));
  check('تفکیک هر پا با جمع کل می‌خواند',
    lad52.every((r) => near(r.pnl, r.perLeg.reduce((a, l) => a + l.pnl, 0))));
  check('از بدترین به بهترین مرتب است',
    lad52.every((r, i) => i === 0 || lad52[i - 1].pnl <= r.pnl));
  // در ترکیب سقف‌دار همهٔ سطوح بالای سقف یک عدد می‌دهند؛ بدون مرتب‌سازی دوم
  // «صدک ۹۵» بعد از «صدک ۹۹» می‌نشیند.
  check('سطوح هم‌سود بر پایه قیمت مرتب می‌مانند',
    lad52.every((r, i) => i === 0 || lad52[i - 1].pnl < r.pnl || lad52[i - 1].level <= r.level));
  check('سقف سود و کف زیان همان اسپرد است',
    near(Math.max(...lad52.map((r) => r.pnl)), 5000) && near(Math.min(...lad52.map((r) => r.pnl)), -5000));
  check('قیمت امروز همیشه در فهرست هست', lad52.some((r) => r.kind === 'spot' && near(r.level, 100)));
  check('احتمال هر سطح با صدکش می‌خواند',
    lad52.filter((r) => r.kind === 'percentile').every((r) => near(r.probBelow * 100, r.pct, 0.5)));
  // بدون تلاطم، صدک ساخته نمی‌شود ولی قیمت امروز باید بماند
  const noVol52 = scenarioLadder({ ...base52, sigma: 0 });
  check('بدون تلاطم، فقط قیمت امروز می‌ماند — نه صدکِ ساختگی',
    noVol52.length === 1 && noVol52[0].kind === 'spot');
  check('ورودی تهی، خروجی تهی می‌دهد',
    scenarioLadder({}).length === 0 && scenarioLadder({ legs: legs52, spot: 0 }).length === 0);

  // ——— حساسیت ———
  const grid52 = sensitivityGrid({ ...base52, axis: 'days', moves: [-20, 0, 20], steps: 3 });
  check('جدول حساسیت، سطر و ستون درست دارد',
    grid52.rows.length === 3 && grid52.axisValues.length === 3,
    `${grid52.rows.length}×${grid52.axisValues.length}`);
  check('هر خانه، تفکیک پا دارد و با جمعش می‌خواند',
    grid52.rows.every((r) => r.cells.every((c) => near(c.pnl, c.perLeg.reduce((a, v) => a + v, 0)))));
  // روی محور روز، صفر یعنی سررسید — و آن‌جا باید دقیقاً منحنی سررسید باشد،
  // نه بلک‌شولز با تی خیلی کوچک که عددی شبیه درست می‌دهد.
  const atExpiry52 = grid52.axisValues.indexOf(0);
  check('روز صفر، دقیقاً همان سود و زیان سررسید است',
    atExpiry52 >= 0 && grid52.rows.every((r) => near(r.cells[atExpiry52].pnl, pnlAtExpiry(legs52, r.level, net52))));
  check('پیش از سررسید، ارزش زمانی هنوز هست',
    grid52.rows.find((r) => r.movePct === -20).cells[0].pnl > grid52.rows.find((r) => r.movePct === -20).cells[atExpiry52].pnl);
  for (const axis of SENS_AXES.map((a) => a.key)) {
    check(`محور «${axis}» جدول می‌سازد`, sensitivityGrid({ ...base52, axis }).rows.length > 0);
  }
  check('محور ناشناخته به روز مانده برمی‌گردد', sensitivityGrid({ ...base52, axis: 'چیزی' }).axis === 'days');

  // ——— محورِ خودساخته: هر جنس، قاعده خودش ———
  //
  // یک قاعدهٔ واحد برای هر سه محور، برای دوتاشان بی‌معنی می‌شود: بازهٔ نسبی
  // روی نرخِ صفر هیچ‌چیز نمی‌سازد، و بازهٔ مطلق روی تلاطم، ۱۵٪ و ۹۰٪ را
  // یک‌جور نمی‌بیند.
  const days52 = sensitivityAxis({ axis: 'days', days: 60, steps: 5 });
  check('محور روز، از روز مانده تا صفر می‌رود و نزولی است',
    days52[0] === 60 && days52.at(-1) === 0 && days52.every((v, i) => i === 0 || days52[i - 1] >= v),
    days52.join(' '));
  const sig52 = sensitivityAxis({ axis: 'sigma', sigma: 0.4, range: 50, steps: 5 });
  check('محور تلاطم نسبی است و مبنا دقیقاً وسط می‌افتد',
    sig52.length === 5 && near(sig52[2], 0.4) && near(sig52[0], 0.2) && near(sig52[4], 0.6),
    sig52.map((v) => v.toFixed(2)).join(' '));
  const smallSig52 = sensitivityAxis({ axis: 'sigma', sigma: 0.15, range: 50, steps: 5 });
  check('همان دامنه روی تلاطم کوچک، بازهٔ کوچک می‌دهد — نه بازهٔ ثابت',
    near(smallSig52[0], 0.075) && near(smallSig52[4], 0.225),
    smallSig52.map((v) => v.toFixed(3)).join(' '));
  const rate52 = sensitivityAxis({ axis: 'rFree', rFree: 0.25, range: 5, steps: 5 });
  check('محور نرخ مطلق است، بر حسب واحد درصد',
    near(rate52[0], 0.20) && near(rate52[2], 0.25) && near(rate52[4], 0.30),
    rate52.map((v) => v.toFixed(3)).join(' '));
  // ضریب نسبی روی صفر، پنج‌بار صفر می‌داد؛ بازهٔ مطلق هنوز معنی دارد.
  const zero52 = sensitivityAxis({ axis: 'rFree', rFree: 0, range: 4, steps: 5 });
  check('نرخ صفر هم بازه می‌سازد، ولی نرخ منفی نمی‌سازد',
    zero52.length === 5 && zero52.every((v) => v >= 0) && near(zero52.at(-1), 0.04),
    zero52.map((v) => v.toFixed(3)).join(' '));
  check('تعداد ستون فرد می‌شود تا مبنا وسط بماند',
    sensitivityAxis({ axis: 'sigma', sigma: 0.4, range: 50, steps: 4 }).length === 5);
  check('بی‌تلاطم، محور تلاطم ساخته نمی‌شود — نه صفرِ ساختگی',
    sensitivityAxis({ axis: 'sigma', sigma: 0, range: 50, steps: 5 }).length === 0);
  // جنس مقدار در موتور است، قالبش در رابط — چون هر عددی که به کاربر نشان
  // داده می‌شود باید از `ui/fmt.mjs` رد شود و با رقم فارسی چاپ شود. برچسبِ
  // آمادهٔ موتور، یک مسیر دوم بود که از همان قاعده فرار می‌کرد.
  check('هر محور جنس خودش را اعلام می‌کند',
    SENS_AXES.every((a) => ['days', 'ratio', 'rate'].includes(a.kind))
    && SENS_AXES.map((a) => a.kind).join() === 'days,ratio,rate,rate');
  check('موتور برچسبِ آماده نمی‌سازد؛ قالب‌بندی کار رابط است',
    !readSrc('../core/scenario.mjs').includes('روز`'));

  // ——— فرض‌های ثابت، هم‌زمان با محور ———
  //
  // پیش از این فقط یک فرض هم‌زمان عوض می‌شد: بقیه از ردیف می‌آمدند و راهی
  // برای دست‌کاری‌شان نبود. «اگر فرض‌ها عوض شوند» با یک فرضِ متغیر، نصف
  // سؤال است.
  const hiVol52 = sensitivityGrid({ ...base52, sigma: 0.8, axis: 'rFree', moves: [0], steps: 3, range: 5 });
  const loVol52 = sensitivityGrid({ ...base52, sigma: 0.2, axis: 'rFree', moves: [0], steps: 3, range: 5 });
  check('تلاطمِ دستی روی محور نرخ هم اثر می‌گذارد',
    hiVol52.rows[0].cells.every((c) => near(c.sigma, 0.8))
    && loVol52.rows[0].cells.every((c) => near(c.sigma, 0.2))
    && !near(hiVol52.rows[0].cells[1].pnl, loVol52.rows[0].cells[1].pnl));
  check('فرض‌های مبنا در خروجی گزارش می‌شوند',
    near(hiVol52.base.sigma, 0.8) && near(hiVol52.base.rFree, 0.25) && hiVol52.base.days === 60);
  const divGrid52 = sensitivityGrid({ ...base52, axis: 'divYield', moves: [0], steps: 3, range: 4 });
  check('محور بازده نقدی، مقدار خودش را به خانه می‌رساند',
    divGrid52.rows[0].cells.every((c, i) => near(c.divYield, divGrid52.axisValues[i])));

  // ——— سنجه‌های هر خانه ———
  const mid52 = sensitivityGrid({ ...base52, axis: 'days', moves: [0], steps: 3, capital: 5000 }).rows[0];
  const live52 = mid52.cells[0];
  const exp52 = mid52.cells.at(-1);
  check('هر سنجه، در هر خانه هست', SENS_METRICS.every((m) => m.key in live52));
  check('بازده ٪ سرمایه، همان سود تقسیم بر سرمایه است',
    near(live52.retPct, (live52.pnl / 5000) * 100));
  check('بی‌سرمایه، درصد ساخته نمی‌شود',
    !Number.isFinite(sensitivityGrid({ ...base52, axis: 'days', moves: [0], steps: 3 }).rows[0].cells[0].retPct));
  // ارزش موقعیت خاطرهٔ قیمت ورود ندارد؛ سود و زیان دارد. تفاضلشان باید
  // دقیقاً همان نقد ورود باشد، وگرنه یکی از دو عدد از جای دیگری می‌آید.
  check('ارزش موقعیت و سود و زیان با نقد ورود می‌خوانند',
    near(live52.pnl - live52.value, net52) && near(exp52.pnl - exp52.value, net52),
    `${Math.round(live52.pnl)} − ${Math.round(live52.value)} = ${Math.round(net52)}`);
  // اسپرد صعودی کال: دلتای مثبت، وگای کوچک، و همه پیش از سررسید معلوم
  check('یونانی‌های موقعیت پیش از سررسید معلوم‌اند',
    ['delta', 'gamma', 'vega', 'theta', 'rho'].every((k) => Number.isFinite(live52[k]))
    && live52.delta > 0, `دلتا ${live52.delta.toFixed(1)}`);
  // دلتای سررسید سر قیمت اعمال اصلاً تعریف ندارد؛ «صفر» ادعایی است که مدل
  // نمی‌کند و کاربر آن را با «خنثی شده» اشتباه می‌گیرد.
  check('سر سررسید، یونانی خالی است نه صفر',
    exp52.atExpiry && ['delta', 'gamma', 'vega', 'theta'].every((k) => !Number.isFinite(exp52[k])));
  // یونانی موقعیت باید با حجم مقیاس بخورد، مثل هر عدد دیگر موقعیت
  const big52 = legs52.map((l) => ({ ...l, ratio: l.ratio * 10 }));
  const bigCell52 = sensitivityGrid({ ...base52, legs: big52, axis: 'days', moves: [0], steps: 3 }).rows[0].cells[0];
  check('سنجه‌های خانه با اندازهٔ موقعیت مقیاس می‌خورند',
    ['pnl', 'value', 'delta', 'gamma', 'vega', 'theta'].every(
      (k) => near(bigCell52[k], live52[k] * 10, Math.abs(live52[k] * 10) * 1e-9 + 1e-9)));

  // ——— ریسک عمق دفتر ———  // ——— ریسک عمق دفتر ———
  const books52 = [
    { book: [{ bid: 7.9, bidQty: 2, ask: 8.1, askQty: 5 }, { bid: 7.5, bidQty: 10, ask: 8.6, askQty: 9 }] },
    { book: [{ bid: 2.8, bidQty: 1, ask: 3.2, askQty: 2 }, { bid: 2.4, bidQty: 4, ask: 3.9, askQty: 20 }] },
  ];
  const d52 = bookDepthRisk({ legs: legs52, quotes: books52, units: 5 });
  // بستن یعنی جهت معکوس: پای خرید به تقاضا می‌خورد، پای فروش به عرضه
  check('جهت بستن، معکوس جهت باز کردن است',
    d52.perLeg[0].closeSide === 'sell' && d52.perLeg[1].closeSide === 'buy');
  // پای خرید: ۲ در ۷٫۹ و ۳ در ۷٫۵ → میانگین وزنی ۷٫۶۶ ، هزینه ۱٬۲۰۰
  check('میانگین وزنی از پیمایش دفتر می‌آید', near(d52.perLeg[0].vwap, 7.66));
  check('هزینه بستن هر پا، اختلاف با بهترین مظنه است',
    near(d52.perLeg[0].exitCost, 1200) && near(d52.perLeg[1].exitCost, 2100));
  check('هزینه بستن کل، جمع پاهاست', near(d52.exitCostTotal, 3300));
  check('بدترین لغزش، بزرگ‌ترین قدرمطلق است', near(d52.worstSlipPct, 13.125), d52.worstSlipPct);
  // دفتر سفارش سهم در دیده‌بان اختیار نیست؛ «نامعلوم» با «صفر» یکی نیست
  const withStock52 = bookDepthRisk({
    legs: [...legs52, { kind: 'underlying', side: 'buy', price: 100, ratio: 1, size: 1000 }],
    quotes: [...books52, {}], units: 5 });
  check('پای دارایی پایه اصلاً وارد سنجش عمق نمی‌شود', withStock52.perLeg.length === 2);
  const noBook52 = bookDepthRisk({ legs: legs52, quotes: [{}, {}], units: 5 });
  check('پای بی‌دفتر، «نامعلوم» است نه «صفر»',
    noBook52.unknownLegs === 2 && !Number.isFinite(noBook52.exitCostTotal));
  const thin52 = bookDepthRisk({ legs: legs52, quotes: [
    { book: [{ bid: 7.9, bidQty: 1, ask: 8.1, askQty: 1 }] }, books52[1]], units: 5 });
  check('پای کم‌عمق، کسری و قفل‌بودن را گزارش می‌کند',
    thin52.blockedLegs === 1 && thin52.perLeg[0].short === 4 && thin52.closableUnits === 1,
    `کسری ${thin52.perLeg[0].short} | واحد ${thin52.closableUnits}`);

  // ——— پاهایی که خودشان مقیاس‌خورده‌اند ———
  //
  // ردیف غربال پاهایش را در تعداد قرارداد کاربر ضرب کرده تحویل می‌دهد، تا
  // نمودار و نقد خالص یک مقیاس داشته باشند. بدون `legUnits`، «تعداد واحد»
  // دوباره در همان حجم ضرب می‌شد: ۵ قرارداد از پاهای ۵تایی یعنی ۲۵ —
  // عمقی که دفتر ندارد و هر ردیف را «قفل» نشان می‌داد.
  const scaled52 = legs52.map((l) => ({ ...l, ratio: l.ratio * 5 }));
  const scaledD52 = bookDepthRisk({ legs: scaled52, quotes: books52, units: 5, legUnits: 5 });
  check('پای مقیاس‌خورده، حجم را دوبار حساب نمی‌کند',
    scaledD52.perLeg.every((l, i) => near(l.want, d52.perLeg[i].want))
    && near(scaledD52.exitCostTotal, d52.exitCostTotal),
    `${scaledD52.perLeg[0].want} خواسته`);
  check('بدون اعلامِ مقیاس، پیش‌فرض همان «یک واحد» می‌ماند',
    near(bookDepthRisk({ legs: legs52, quotes: books52, units: 5 }).exitCostTotal, d52.exitCostTotal));

  const panelSrc52 = readSrc('../ui/scenario-panel.mjs');
  check('پنل هیچ محاسبه‌ای ندارد و همه را از موتور می‌خواند',
    panelSrc52.includes("from '/core/scenario.mjs'")
    && !/Math\.exp|bsPrice|Math\.log/.test(panelSrc52));
  check('پارامترهای حساسیت قابل تنظیم‌اند',
    ['scen-axis', 'scen-range', 'scen-steps', 'scen-units'].every((id) => panelSrc52.includes(id)));
  // خواستهٔ کاربر: «با انتخاب تلاطم امکان وارد کردن عدد آن باشه، و همچنین
  // بقیه پارامترها.» هر فرض بازار ورودی عددی خودش را دارد، سنجهٔ هر خانه
  // انتخابی است، و راه برگشت به فرض‌های بازار یک دکمه است.
  check('هر فرض بازار، ورودی عددی خودش را دارد',
    ['scen-sigma', 'scen-rfree', 'scen-div', 'scen-days', 'scen-span', 'scen-cols']
      .every((id) => panelSrc52.includes(id)));
  check('سنجهٔ هر خانه انتخابی است و از موتور می‌آید',
    panelSrc52.includes('scen-metric') && panelSrc52.includes('SENS_METRICS'));
  check('محورها از موتور می‌آیند، نه فهرست دستیِ دوم در رابط',
    panelSrc52.includes('SENS_AXES') && !/'rFree'\]\.includes/.test(panelSrc52));
  check('راه برگشت به فرض‌های بازار هست', panelSrc52.includes('scen-reset'));
  check('پنل، مقیاسِ پاهای ردیف را به سنجش عمق اعلام می‌کند',
    panelSrc52.includes('legUnits:'));
  // سرستون محور، رقمِ لاتین چاپ می‌کرد («0.85») چون از رشتهٔ خام موتور
  // می‌آمد و از `fmt` رد نمی‌شد.
  check('سرستون محور دوم از قالب‌بند فارسی رد می‌شود',
    /kind === 'days' \? `\$\{fmt\.int/.test(panelSrc52) && panelSrc52.includes('esc(axisLabel(axis, v))'));
  // پله فرد لازم است تا «بدون تغییر» همیشه وسط جدول بیفتد
  check('تعداد پله فرد می‌شود تا صفر وسط بماند', panelSrc52.includes('if (steps % 2 === 0) steps += 1;'));
}

// ═══════════════════════════ ۵۳. روزِ قفل‌شدهٔ ریزمعامله ═══════════════════════════
group('۵۳. روزِ قفل‌شدهٔ ریزمعامله');
{
  const src53 = readSrc('../ui/tabs/backtest.mjs');

  // گزارش کاربر: «گاهی این پیام را می‌دهد، روز قبل و بعدش سالم است.»
  //
  // علت: هر نتیجه‌ای کش می‌شد، حتی وقتی درخواستِ یکی از پاها شکست خورده بود.
  // یک خطای گذرای بالادست — سهمیه، مهلت، ۵۰۲ — آن روز را تا پایان نشست قفل
  // می‌کرد و هر بار باز کردنش همان نتیجهٔ خرابِ کش‌شده را برمی‌گرداند.
  check('نتیجهٔ ناقص کش نمی‌شود',
    /if \(!requiredMissing\(failed\)\.length\) tradesCache\.set\(date, result\);/.test(src53));
  check('گرفتن دوباره با اجبار ممکن است', src53.includes('async function fetchDayTrades(date, { force = false } = {})'));
  check('دکمهٔ تلاش دوباره همان روز را از کش پاک می‌کند',
    src53.includes("tradesCache.delete(intradayDate);") && src53.includes('bt-intraday-retry'));

  // سه علت کاملاً متفاوت به یک نتیجه می‌رسیدند و هر سه یک جملهٔ واحد
  // می‌گرفتند. آن جمله برای دو تای اول دروغ بود: خرابیِ ما را به‌عنوان
  // واقعیتِ بازار گزارش می‌کرد.
  check('علت نبودِ خط زمانی تفکیک می‌شود، نه یک جملهٔ واحد',
    src53.includes('function intradayGap(day)')
    && ["'fetch'", "'fetch-base'", "'quiet'", "'partial'"].every((k) => src53.includes(k)));
  check('پیام قدیمیِ گمراه‌کننده دیگر نیست',
    !src53.includes('برای این روز، قیمت تمام پاها در بازهٔ ۹:۰۰ تا ۱۲:۳۰ کامل نشده است'));
  // «معامله نشده» واقعیت بازار است و تلاش دوباره دردی دوا نمی‌کند؛ فقط
  // خرابیِ دریافت دکمه می‌گیرد.
  check('تلاش دوباره فقط برای خرابی دریافت است، نه برای پای بی‌معامله',
    src53.includes("gap.kind.startsWith('fetch')"));
  check('نام پای بی‌معامله گفته می‌شود، نه فقط شمارش',
    src53.includes('function legsWithoutTrades(byIns)') && src53.includes('quiet.map('));
  // معاملهٔ باطل‌شده و قیمت صفر نباید «معامله» حساب شوند
  check('شمارش معامله، باطل‌شده و قیمت صفر را کنار می‌گذارد',
    /!t\.canceled && Number\(t\.price\) > 0 && inIntradaySession\(t\.time\)/.test(src53));
  // نتیجهٔ ناقص کش نمی‌شود، ولی پیام خطا باید بداند چه شد
  check('آخرین دریافتِ کش‌نشده برای ساختن پیام نگه داشته می‌شود',
    src53.includes('let lastDayFetch = null;') && src53.includes('lastDayFetch = result;'));
}

// ═══════════════════════════ ۵۴. خروجی اکسل و عنوان محور نمودارها ═══════════════════════════
group('۵۴. خروجی اکسل و عنوان محور');
{
  // ——— خانه‌ها ———
  //
  // رابط عدد را فارسی نشان می‌دهد. اکسل `۱۲٬۳۴۵` را عدد نمی‌فهمد و به‌صورت
  // متن می‌نشاند، پس جمع و مرتب‌سازی از کار می‌افتد.
  check('عدد فارسی به رقم لاتین برمی‌گردد', numericCell('۱۲٬۳۴۵') === '12345');
  check('منفی و اعشار فارسی هم درست می‌شوند', numericCell('−۴٬۵۰۰٫۲۵') === '-4500.25');
  // واحد در سرستون هست؛ «٪» چسبیده ستون را متن می‌کند
  check('نشانه درصد از خانه برداشته می‌شود', numericCell('−۳۷٫۷۱٪') === '-37.71');
  check('ولی فقط وقتی باقی‌مانده یک عدد کامل باشد',
    numericCell('۵۰٪ تا ۶۰٪').startsWith('"'), numericCell('۵۰٪ تا ۶۰٪'));
  // «۳۰ روز» عدد نیست: اگر عدد شود واحدش را از دست می‌دهد و ۳۰ ثانیه از ۳۰ روز جدا نمی‌شود
  check('متنِ دارای عدد، متن می‌ماند', numericCell('۳۰ روز') === '"30 روز"');
  check('نقل‌قول درون متن دوبار می‌شود، طبق RFC 4180',
    csvCell('او گفت "سلام"') === '"او گفت ""سلام"""');
  check('خانه تهی، رشته خالیِ نقل‌قول‌دار است', csvCell(null) === '""' && csvCell(undefined) === '""');
  check('شکست خط در خانه، سطر را نمی‌شکند', !csvCell('خط\nدوم').includes('\n'));

  // ——— فایل ———
  //
  // بدون BOM اکسل ویندوزی فایل را با کدپیج محلی می‌خواند و متن فارسی به هم
  // می‌ریزد. خودِ فایل سالم است؛ اکسل اشتباه می‌خواند.
  const csv54 = toCsv([['نام', 'مقدار'], ['اهرم', '۱۲٬۳۴۵']]);
  check('فایل با BOM شروع می‌شود', csv54.charCodeAt(0) === 0xFEFF);
  check('سطرها با CRLF جدا می‌شوند', csv54.includes('\r\n'));
  check('سرستون متن می‌ماند و مقدار عدد می‌شود',
    csv54.includes('"نام","مقدار"') && csv54.includes('"اهرم",12345'));
  check('مهر زمانی نام فایل، رقم لاتین است و طول ثابت',
    /^\d{8}-\d{4}$/.test(stamp(new Date(2026, 7, 20, 5, 9))), stamp(new Date(2026, 7, 20, 5, 9)));

  // ——— اتصال ———
  const exSrc54 = readSrc('../ui/export.mjs');
  // جدول مجازی‌سازی‌شده فقط ردیف‌های داخل قاب را در DOM دارد؛ خروجیِ
  // DOM-خوان آن‌جا بی‌صدا ناقص می‌شود.
  check('جارو، جدول مجازی‌سازی‌شده را کنار می‌گذارد',
    exSrc54.includes("if (wrap.closest('.tbl-wrap')) continue;"));
  check('دکمه بیرون از ظرفِ بازنویسی‌شونده می‌نشیند',
    exSrc54.includes("wrap.parentNode.insertBefore(bar, wrap);"));
  check('سرستون چندسطری با colspan جابه‌جا نمی‌شود',
    exSrc54.includes("for (let i = 0; i < span; i++) row.push(cell.textContent);"));
  const tblSrc54 = readSrc('../ui/table.mjs');
  check('جدول مجازی‌سازی‌شده خروجی داده‌محور دارد، نه DOM-محور',
    tblSrc54.includes('function exportRows()') && tblSrc54.includes('view.map((r) => cols.map('));
  for (const [file, what] of [['../ui/tabs/backtest.mjs', 'بک‌تست'], ['../ui/tabs/history.mjs', 'تاریخچه'],
    ['../ui/tabs/portfolio-backtest.mjs', 'سبد'], ['../ui/tabs/positions.mjs', 'موقعیت‌ها'],
    ['../ui/tabs/roll.mjs', 'رول'], ['../ui/scenario-panel.mjs', 'سناریو']]) {
    const src = readSrc(file);
    check(`جدول‌های ${what} دکمه خروجی می‌گیرند`, src.includes('attachExportsIn('));
  }

  // ——— عنوان محور ———
  //
  // بدون عنوان، «۱۲٬۵۰۰» می‌تواند ریال باشد یا قرارداد یا درصد.
  for (const [file, what] of [['../ui/chart.mjs', 'نمودار بازده'], ['../ui/tabs/backtest.mjs', 'نمودارهای بک‌تست'],
    ['../ui/tabs/history.mjs', 'نمودارهای تاریخچه'], ['../ui/tabs/portfolio-backtest.mjs', 'نمودار سبد']]) {
    const src = readSrc(file);
    check(`${what} عنوان محور دارد`, /axis-title/.test(src));
  }
  const chartSrc54 = readSrc('../ui/chart.mjs');
  check('واحد در عنوان محور نوشته می‌شود',
    chartSrc54.includes('قیمت سهم پایه (ریال)') && chartSrc54.includes('سود و زیان (ریال)'));
  const btSrc54 = readSrc('../ui/tabs/backtest.mjs');
  check('عنوان محور بک‌تست از واحد خودِ نمودار می‌آید',
    btSrc54.includes("money ? 'ریال' : count ? 'تعداد' : 'درصد'")
    && btSrc54.includes("timeScale ? 'ساعت جلسه"));
  const css54 = readSrc('../ui/style.css');
  check('عنوان محور از برچسب عددی درشت‌تر است',
    /--fs-axis: 15\.5px;/.test(css54) && /--fs-chart: 15px;/.test(css54));
  check('اعداد نمودار درشت‌تر شدند', /--fs-chart-sm: 13px;/.test(css54) && /--fs-chart-lg: 17px;/.test(css54));
}

// ═══════════════════════════ ۵۵. دفتر خطا و عکس پشتیبان بیرون از ساعت بازار ═══════════════════════════
group('۵۵. دفتر خطا و عکس پشتیبان');
{
  // ——— دفتر حلقه‌ای ———
  const L = createLog(3);
  for (let i = 1; i <= 5; i++) L.push({ where: 'بالادست', message: 'e' + i, at: 1000 + i });
  const st = L.stats();
  // شمارش دورریخته‌ها می‌ماند، وگرنه کاربر نمی‌فهمد آنچه می‌بیند همهٔ ماجرا نیست
  check('دفتر از ظرفیت جلو نمی‌زند و دورریخته را می‌شمارد',
    st.held === 3 && st.dropped === 2 && st.seq === 5, JSON.stringify(st));
  check('تازه‌ترین اول می‌آید', L.list().map((r) => r.message).join(',') === 'e5,e4,e3');
  check('گرفتن فقط تازه‌ها با شماره ترتیب ممکن است',
    L.list({ sinceSeq: 4 }).map((r) => r.message).join(',') === 'e5');
  L.push({ level: 'warn', message: 'w' });
  check('تفکیک سطح کار می‌کند',
    L.list({ level: 'warn' }).length === 1 && L.list({ level: 'error' }).length === 2);
  // پیام و پشتهٔ بی‌انتها، دفتر را به حافظه‌خور تبدیل می‌کند
  const long = createLog(5).push({ message: 'x'.repeat(9999), detail: 'y'.repeat(9999) });
  check('پیام و جزئیات بریده می‌شوند', long.message.length === 500 && long.detail.length === 2000);
  check('پاک کردن، دفتر را خالی می‌کند و شمارش را صفر', L.clear() && L.stats().held === 0 && L.stats().dropped === 0);
  const empty = createLog();
  check('دفتر خالی، فهرست خالی می‌دهد نه خطا', empty.list().length === 0 && empty.stats().held === 0);

  // ——— سرور ———
  const srv55 = readSrc('../server/server.mjs');
  check('نقطه پایانی دفتر خطا هست', srv55.includes("if (p === '/api/logs')"));
  check('خطای بالادست ثبت می‌شود', /errlog\.push\(\{ level: 'error', where: \`بالادست/.test(srv55));
  check('خطای درخواست و دور دیده‌بان هم ثبت می‌شوند',
    srv55.includes("logErr(`درخواست ${p}`, e)") && srv55.includes("logErr('دور دیده‌بان', e)"));
  check('خطای مرورگر در همان دفتر می‌نشیند، نه دفتری جدا',
    srv55.includes("where: `مرورگر · ${item.where || '—'}`"));
  // یک صفحهٔ خراب نباید بتواند حافظهٔ سرور را پر کند
  check('دستهٔ ارسالی مرورگر سقف دارد', srv55.includes('.slice(0, 50)'));

  // ——— مرورگر ———
  const cli55 = readSrc('../ui/errlog.mjs');
  // ارسال تک‌تک، خودش می‌شود منبع بار؛ و تلاش دوباره برای «خطای ارسال خطا»
  // بی‌نهایت خطای تازه می‌سازد.
  check('ارسال به سرور دسته‌ای است', /setTimeout\([\s\S]{0,400}?pending\.splice\(0, 50\)/.test(cli55));
  check('شکست ارسالِ خطا، دوباره تلاش نمی‌شود', cli55.includes('catch { /* عمداً بی‌صدا */ }'));
  check('استثنای رسم‌نشده و وعدهٔ ردشده هر دو گرفته می‌شوند',
    cli55.includes("window.addEventListener('error'") && cli55.includes("window.addEventListener('unhandledrejection'"));
  // «Error: Error: HTTP 403» هم زشت است هم می‌گوید دو خطا رخ داده
  check('پیشوند تکراری نام خطا حذف می‌شود',
    cli55.includes("/^[A-Za-z]+Error:/.test(raw)"));

  // ——— عکس پشتیبان ———
  const app55 = readSrc('../ui/app.mjs');
  // حلقهٔ دیده‌بان بیرون از ساعت بازار پارک می‌شود، پس رویداد watch هیچ‌وقت
  // پخش نمی‌شود و همهٔ تب‌ها کور می‌مانند.
  check('نبودِ داده زنده، از نقطه‌ای که شب و روز پاسخ می‌دهد پر می‌شود',
    app55.includes("fetch('/api/history/universe')") && app55.includes('function seedWatch()'));
  check('عکس پشتیبان فقط وقتی گرفته می‌شود که چیزی نیامده باشد',
    app55.includes('if (seeding || state.watch.rows.length) return seeding;'));
  check('داده زندهٔ واقعی، برچسب کهنه را برمی‌دارد', app55.includes('state.watch.stale = false;'));
  // سوکتِ باز با دادهٔ زنده یکی نیست؛ «متصل» روی عکس کهنه یعنی دروغ
  check('برچسب نوار از تازگی داده می‌آید، نه از وضعیت سوکت',
    app55.includes('const key = linkKey();'));
  check('برچسب عکس آخرین جلسه صریح می‌گوید زنده نیست',
    /snapshot: \['عکس آخرین جلسه — زنده نیست'/.test(app55));

  const tabs55 = readSrc('../ui/tabs/logs.mjs');
  check('تب دفتر خطا، سرور و مرورگر را در یک فهرست می‌ریزد',
    tabs55.includes('[...serverRows, ...local]'));
  // ثبتِ خطای خواندنِ دفتر خطا در همان دفتر، حلقه می‌سازد
  check('خطای خواندن دفتر، در خودِ دفتر ثبت نمی‌شود',
    tabs55.includes('// خطای خواندنِ دفتر خطا در خودِ دفتر ثبت نمی‌شود — حلقه می‌سازد.'));
  check('تب در فهرست تب‌ها ثبت شده و آیکون دارد',
    app55.includes("id: 'logs', title: 'دفتر خطاها'")
    && readSrc('../ui/icons.mjs').includes("logs: 'alert'"));
}


// ————————————————————————————————————————————————————————————————
group('۵۶. فهرست خالی، با دلیل');

{
  // هستهٔ گزارش کاربر: فهرست نماد خالی می‌ماند و هیچ‌چیز نمی‌گوید چرا.
  // چهار دلیل جدا داشت که همه یک شکل دیده می‌شدند.
  const kinds = ['loading', 'failed', 'empty', 'idle']
    .map((f) => emptyReason({ feedStatus: f }).kind);
  check('چهار دلیلِ خالی‌بودن، چهار پیام جدا دارند',
    new Set(kinds).size === 4, kinds.join('، '));

  check('نگرفتن داده، دکمه تلاش دوباره می‌گیرد',
    emptyReason({ feedStatus: 'failed', error: 'HTTP 403' }).retry === true);
  // «تابلو چیزی نداشت» با «نگرفتیم» یکی نیست؛ تلاش دوباره دردی از آن دوا نمی‌کند
  check('تابلوی خالی، دکمه تلاش دوباره نمی‌گیرد',
    emptyReason({ feedStatus: 'empty' }).retry === false);
  check('دلیل شکست در متن پیام می‌آید',
    emptyReason({ feedStatus: 'failed', error: 'HTTP 403' }).text.includes('HTTP 403'));
  check('شکست بدون متن هم پیام دارد',
    emptyReason({ feedStatus: 'failed' }).text.includes('نامعلوم'));
  // جست‌وجو فقط وقتی دلیل است که فهرست پُر باشد
  check('فهرست پر + جست‌وجوی بی‌نتیجه، دلیلش جست‌وجوست',
    emptyReason({ listCount: 9, filtered: true, feedStatus: 'ok' }).kind === 'filter');
  check('فهرست خالی + جست‌وجو، دلیلش جست‌وجو نیست',
    emptyReason({ listCount: 0, filtered: true, feedStatus: 'failed' }).kind === 'failed');

  // سوکتِ باز با «داده دارم» یکی نیست
  check('بدون ردیف، سوکت باز هم «متصل» نمی‌گوید',
    linkLabelKey({ rowCount: 0, linkStatus: 'live' }) !== 'live');
  check('بدون ردیف و با شکست، برچسب به دفتر خطاها می‌برد',
    linkLabelKey({ rowCount: 0, feedStatus: 'failed', linkStatus: 'live' }) === 'nodata');
  check('بدون ردیف و تابلوی خالی، برچسب جداست',
    linkLabelKey({ rowCount: 0, feedStatus: 'empty', linkStatus: 'live' }) === 'blank');
  check('در حال گرفتن، برچسب انتظار است',
    linkLabelKey({ rowCount: 0, feedStatus: 'loading' }) === 'waiting');
  check('با ردیفِ کهنه، برچسب عکس پشتیبان است',
    linkLabelKey({ rowCount: 5, stale: true, linkStatus: 'live' }) === 'snapshot');
  check('با ردیف زنده، برچسب همان وضعیت سوکت است',
    linkLabelKey({ rowCount: 5, stale: false, linkStatus: 'live' }) === 'live');
  check('قطعی با ردیف کهنه، عکس پشتیبان می‌ماند',
    linkLabelKey({ rowCount: 5, stale: true, linkStatus: 'down' }) === 'snapshot');
}

{
  const picker56 = readSrc('../ui/picker.mjs');
  // ریشهٔ باگ: جعبه تا رسیدن اولین ردیف اصلاً رسم نمی‌شد — نه پیامی، نه خلاصه‌ای
  check('انتخابگر بدون داده هم یک بار رسم می‌شود',
    picker56.includes('const offFeed = onFeed((f) => { feed = f; render(); });')
    && picker56.includes('});\n  render();'));
  check('انتخابگر اشتراک خوراک را پس می‌دهد', picker56.includes('dispose() { offFeed(); }'));
  check('دکمه تلاش دوباره به همان خوراک وصل است', picker56.includes('retryFeed()'));

  const app56 = readSrc('../ui/app.mjs');
  check('عکس پشتیبانِ خالی، خاموش رد نمی‌شود',
    app56.includes("if (!rows.length) { setFeed('empty'); return; }"));
  check('شکست عکس پشتیبان، در وضعیت خوراک می‌نشیند',
    app56.includes("setFeed('failed', err?.message"));
  check('تلاش دوباره بدون بستن و باز کردن تب ممکن است',
    app56.includes('export function retryFeed()'));
  check('تب‌ها به onFeed دسترسی دارند', app56.includes('subscribeWatch, onFeed, retryFeed }'));

  const scan56 = readSrc('../ui/scanner.mjs');
  // خرابی ریسه یعنی زنجیره ساخته نمی‌شود و فهرست تا ابد خالی می‌ماند
  check('خرابی ریسه اسکن به دفتر خطاها می‌رود',
    scan56.includes("logError('ریسه اسکن'"));

  const pos56 = readSrc('../ui/tabs/positions.mjs');
  check('فهرست کشویی موقعیت‌ها هم دلیل خالی‌بودن را می‌گوید',
    pos56.includes('emptyReason({ listCount: 0, feedStatus: feed.status'));

  const css56 = readSrc('../ui/style.css');
  check('پیام خالی سبک دارد', css56.includes('.picker-empty {'));
}

// ————————————————————————————————————————————————————————————————
group('۵۷. سررسید، نام قرارداد، و هر سربه‌سری در ستون خودش');

{
  // ——— علامت فاصله، از دید قیمت امروز ———
  //
  // خواستهٔ صریح کاربر: «اگر قیمت روز از سربه‌سری بیشتر بود مثبت، کمتر بود
  // منفی». پیش از این وارونه بود.
  const above = breakevenMetrics([90], 100);
  check('پایه بالای سربه‌سری → فاصله مثبت', near(above.beDistPct, 10), `${above.beDistPct}٪`);
  const below = breakevenMetrics([110], 100);
  check('پایه زیر سربه‌سری → فاصله منفی', near(below.beDistPct, -10), `${below.beDistPct}٪`);
  check('حاشیه امن همچنان بی‌علامت است', near(below.beRoomPct, 10));

  // ——— چند سربه‌سری، هر کدام ستون خودش ———
  const two = breakevenMetrics([94, 108], 100);
  check('سربه‌سری‌ها از پایین به بالا در ستون می‌نشینند', two.be1 === 94 && two.be2 === 108);
  check('هر ستون فاصلهٔ خودش را دارد',
    near(two.be1DistPct, 6) && near(two.be2DistPct, -8),
    `${two.be1DistPct} , ${two.be2DistPct}`);
  check('ستون‌های خالی، خالی می‌مانند نه صفر',
    !Number.isFinite(two.be3) && !Number.isFinite(two.be3DistPct));
  check('فهرست فاصله‌ها هم‌ترتیب با فهرست سربه‌سری‌هاست',
    two.beDistList.length === 2 && near(two.beDistList[0], 6) && near(two.beDistList[1], -8));

  // ورودی نامرتب هم باید مرتب بنشیند — وگرنه «سربه‌سری ۱» معنی ثابتی ندارد
  const messy = breakevenMetrics([108, 94], 100);
  check('ورودی نامرتب، مرتب‌شده در ستون می‌نشیند', messy.be1 === 94 && messy.be2 === 108);

  // ——— سرریز: بیش از ظرفیت ستون‌ها ———
  //
  // ستون‌ها چهار تاست. اگر روزی ترکیبی پنج نقطه ساخت، آن پنجمی نباید
  // بی‌صدا گم شود — ستون فهرستی همه را نگه می‌دارد.
  const many = breakevenMetrics([80, 90, 100, 110, 120], 100);
  check('ظرفیت ستون‌ها چهار است', BE_SLOTS === 4);
  check('سرریز، شمار واقعی را گزارش می‌کند', many.beCount === 5);
  check('سرریز در ستون فهرستی پنهان نمی‌شود', many.beDistList.length === 5);
  check('فقط چهار ستون پر می‌شود', Number.isFinite(many.be4) && many.be4 === 110);

  const none = breakevenMetrics([], 100);
  check('بدون سربه‌سری، همه ستون‌ها خالی‌اند',
    !Number.isFinite(none.be1) && none.beDistList.length === 0 && none.beCount === 0);
}

{
  // ——— سررسید و نام قرارداد روی ردیف ———
  const s57 = defaults();
  const def57 = byId('long-straddle');
  const legs57 = buildLegs(def57, { strikes: [100000], size: 1000, days: [30] });
  legs57.forEach((l, i) => { l.name = i === 0 ? 'ضهرم7058' : 'طهرم7058'; });
  const q57 = (bid, ask) => ({ bid, bidQty: 50, ask, askQty: 50, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    book: [{ level: 1, bid, bidQty: 60, ask, askQty: 60 }] });
  const row57 = evaluate({
    legs: legs57, quotes: [q57(4800, 5200), q57(4300, 4700)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size: 1000, qty: 1, settings: s57, def: def57,
      underlying: 'اهرم', sigmaHist: 0.6, endDate: 20260420 },
  });
  check('تاریخ سررسید از سررسید تابلو ساخته می‌شود', row57.expiryLabel === '1405/01/31', row57.expiryLabel);
  check('سررسید خام هم روی ردیف می‌ماند', row57.expiry === 20260420);
  check('بدون سررسید، برچسب خالی می‌ماند نه «—»',
    evaluate({ legs: legs57, quotes: [q57(4800, 5200), q57(4300, 4700)],
      ctx: { S: 100000, Sclose: 100000, days: 30, size: 1000, qty: 1, settings: s57, def: def57, underlying: 'اهرم' } }).expiryLabel === '');
  check('نام قرارداد هر پا روی ردیف می‌آید',
    row57.legNames.length === 2 && row57.legNames[0] === 'ضهرم7058', row57.legNames.join('، '));
  check('قیمت اعمال روی ردیف هست', Array.isArray(row57.strikes) && row57.strikes.includes(100000));
  // `maxProfitPct` عمداً همان `retMaxPct` است — جای نشستنش فرق می‌کند نه مقدارش
  const capped57 = evaluate({
    legs: buildLegs(byId('bull-call-spread'), { strikes: [100000, 110000], size: 1000, days: [30] }),
    quotes: [q57(4800, 5200), q57(1800, 2200)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size: 1000, qty: 1, settings: s57,
      def: byId('bull-call-spread'), underlying: 'اهرم', sigmaHist: 0.6, endDate: 20260420 },
  });
  check('درصد بیشترین سود، همان بازده دوره است',
    near(capped57.maxProfitPct, capped57.retMaxPct, 1e-9), `${capped57.maxProfitPct}`);
  check('سود نامحدود، درصد نمی‌سازد', !Number.isFinite(row57.maxProfitPct));
}

{
  // ——— قالب‌ها ———
  //
  // نام قرارداد شناسه است: «طهرم7058» با رقم فارسی در جست‌وجوی کارگزار
  // پیدا نمی‌شود.
  const out = uiFmt.sym(['طهرم7058', 'ضهرم7059']);
  check('نام قرارداد رقم لاتینش را نگه می‌دارد', out.includes('7058') && !/[۰-۹]/.test(out), out);
  check('نام قرارداد جهتش جدا می‌شود', out.includes('\u2068') && out.includes('\u2069'));
  check('بدون نام، خط تیره می‌آید', uiFmt.sym([]) === '—' && uiFmt.sym(null) === '—');

  // درصد با گردکردن به رقم صحیح، همان تفاوتی را که ستون برایش ساخته شده گم می‌کند
  check('فهرست درصد، دو رقم اعشار نگه می‌دارد',
    uiFmt.pctList([10.2857, -10.9412]) === '۱۰٫۲۹ , −۱۰٫۹۴', uiFmt.pctList([10.2857, -10.9412]));
  check('فهرست درصد خالی، خط تیره می‌دهد', uiFmt.pctList([]) === '—');

  // نشانهٔ جهت‌دهی نامرئی است و در اکسل داخل خانه می‌ماند
  check('خروجی اکسل نشانهٔ جهت‌دهی را برمی‌دارد',
    csvCell('\u2068ضهرم7058\u2069') === '"ضهرم7058"', csvCell('\u2068ضهرم7058\u2069'));
  check('عدد سالم همچنان عدد می‌ماند', numericCell('۱۲٫۵٪') === '12.5');
}

{
  const cols57 = COLUMNS.map((c) => c.key);
  for (const k of ['expiryLabel', 'strikes', 'legNames', 'maxProfitPct', 'beDistList',
    'be1', 'be1DistPct', 'be2', 'be2DistPct', 'be3', 'be3DistPct', 'be4', 'be4DistPct']) {
    check(`ستون ${k} در قرارداد ستونی هست`, cols57.includes(k));
  }

  const scanSrc57 = readSrc('../core/scan.mjs');
  // بدون این، ستون «تاریخ سررسید» در اسکن واقعی خالی می‌ماند
  check('اسکن، سررسید را به ارزیاب می‌دهد', scanSrc57.includes('endDate: c.endDate,'));

  // خانهٔ عددی «direction: ltr» می‌گیرد؛ با «text-align: start» به چپ می‌چسبد
  // در حالی که سرستونِ راست‌به‌چپ به راست می‌چسبد — عدد زیر ستون خودش نمی‌ماند
  const css57 = readSrc('../ui/style.css');
  check('خانهٔ عددی جدول کوچک، هم‌لبهٔ سرستون است',
    /\.mini td\.n \{[^}]*text-align: end;/.test(css57));
  check('خانهٔ عددی جدول اصلی، هم‌لبهٔ سرستون است',
    /table\.data td\.n \{[^}]*text-align: end;/.test(css57));
}

// ═══════════ ۵۸. ردیف با حجم واقعی کاربر سنجیده می‌شود ═══════════
group('۵۸. ردیف با حجم واقعی کاربر سنجیده می‌شود');
{
  // گزارش کاربر: «نقد خالص برای ۱ قرارداد گذاشته، در حالی که ۳۰۰ قرارداد
  // دارم.» ردیف تا امروز برای یک دست سنجیده می‌شد و `qty` فقط دو جا اثر
  // داشت — پیمایش دفتر سفارش و سقف حجم. یعنی هر عدد پولی جدول، جدول
  // کوچک‌های پنل جزئیات، نمودار بازده، و پنل سناریو، همه یک‌سیصدم موقعیت
  // واقعی را نشان می‌دادند بی‌آنکه جایی بگوید.
  const s58 = { ...defaults(), qtyDefault: 1 };
  const size58 = 1000;
  // عمق سخاوتمند، تا قیمت اجرا بین دو حجم فرق نکند و مقایسه تمیز بماند؛
  // وگرنه پیمایش دفتر برای ۱۰ قرارداد قیمت بدتری می‌دهد و ضریب دقیق نیست.
  const deep58 = (bid, ask) => ({
    bid, bidQty: 1e9, ask, askQty: 1e9, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid, high: ask, state: 'A', staleSec: 5,
    book: [{ level: 1, bid, bidQty: 1e9, ask, askQty: 1e9 }],
  });

  const def58 = byId('short-strangle');
  const legs58 = buildLegs(def58, { strikes: [90000, 110000], size: size58, days: [30] });
  const quotes58 = [deep58(3000, 3200), deep58(2600, 2800)];
  const ctx58 = (qty) => ({
    S: 100000, Sclose: 100000, days: 30, size: size58, qty,
    settings: s58, def: def58, underlying: 'نمونه', sigmaHist: 0.5,
  });
  const one58 = evaluate({ legs: legs58, quotes: quotes58, ctx: ctx58(1) });
  const many58 = evaluate({ legs: legs58, quotes: quotes58, ctx: ctx58(300) });

  check('تعداد قرارداد در خود ردیف دیده می‌شود', one58.qty === 1 && many58.qty === 300);

  // ——— چه چیزی مقیاس می‌خورد: هرچه مال موقعیت توست ———
  const SCALED = [
    'grossCash', 'entryFee', 'netCash', 'instantClosePnl', 'settleLastPnl', 'settleClosePnl',
    'maxProfit', 'staticPnl', 'capital', 'margin', 'marginNet', 'conditionalMargin',
    'marginRequired', 'blockedAsset', 'sharesLocked', 'notional', 'marketValue', 'intrinsic',
    'timeValue', 'bsValue', 'delta', 'gamma', 'vega', 'theta', 'rho', 'deltaShares',
    'execCost', 'costCommission', 'costCrossing', 'costSlippage', 'costFunding',
  ];
  for (const k of SCALED) {
    check(`«${k}» با حجم مقیاس می‌خورد`,
      Number.isFinite(one58[k]) && near(many58[k], one58[k] * 300, Math.abs(one58[k] * 300) * 1e-9 + 1e-6),
      `${one58[k]} → ${many58[k]}`);
  }

  // ——— چه چیزی مقیاس نمی‌خورد: قیمت، درصد، و آنچه مال بازار است ———
  const FIXED = [
    'S', 'Sclose', 'beNear', 'beLow', 'beHigh', 'be1', 'be2',
    'retMaxPct', 'retStaticPct', 'retMonthPct', 'retAnnPct', 'maxProfitPct', 'maxLossPct',
    'rewardRisk', 'popPct', 'sigmaUse', 'leverage', 'thetaToCapitalPct', 'marginToMaxLoss',
    'beDistPct', 'beRoomPct', 'volTotal', 'oiTotal', 'valueTotal', 'tradeCount',
  ];
  for (const k of FIXED) {
    check(`«${k}» با حجم عوض نمی‌شود`,
      Number.isFinite(one58[k]) ? near(many58[k], one58[k], Math.abs(one58[k]) * 1e-9 + 1e-9) : !Number.isFinite(many58[k]),
      `${one58[k]} → ${many58[k]}`);
  }
  // زیان نامحدودِ استرانگل فروش، با هیچ ضریبی متناهی نمی‌شود؛ برای «بیشترین
  // زیان» باید ترکیب کراندار سنجید.
  check('زیان نامحدود، با حجم هم نامحدود می‌ماند',
    !Number.isFinite(one58.maxLoss) && !Number.isFinite(many58.maxLoss));
  const defBox58 = byId('bull-call-spread');
  const legsBox58 = buildLegs(defBox58, { strikes: [100000, 110000], size: size58, days: [30] });
  const quotesBox58 = [deep58(6000, 6200), deep58(2600, 2800)];
  const boxOne58 = evaluate({ legs: legsBox58, quotes: quotesBox58, ctx: { ...ctx58(1), def: defBox58 } });
  const boxMany58 = evaluate({ legs: legsBox58, quotes: quotesBox58, ctx: { ...ctx58(300), def: defBox58 } });
  check('بیشترین زیانِ کراندار با حجم مقیاس می‌خورد',
    Number.isFinite(boxOne58.maxLoss) && near(boxMany58.maxLoss, boxOne58.maxLoss * 300, boxOne58.maxLoss * 3e-7),
    `${Math.round(boxOne58.maxLoss)} → ${Math.round(boxMany58.maxLoss)}`);

  check('قیمت اعمال و سربه‌سری، با حجم جابه‌جا نمی‌شوند',
    one58.breakevens.length === many58.breakevens.length
    && one58.breakevens.every((b, i) => near(b, many58.breakevens[i])));
  check('قیمت اجرای هر پا، مالِ یک سهم است و ضرب نمی‌شود',
    one58.legPrices.every((l, i) => near(l.price, many58.legPrices[i].price)));
  check('متن پاها همان نسبت الگو را می‌گوید، نه نسبت ضرب‌شده',
    one58.legsText === many58.legsText, many58.legsText);
  check('تلاطم ضمنی هر پا، پس از مقیاس هم سر جایش است',
    many58.legPrices.every((l) => Number.isFinite(l.sigma))
    && many58.ivList.every((v) => Number.isFinite(v)));

  // سقف حجم جوابش خودش «تعداد قرارداد» است؛ اگر ورودی سرمایه‌اش مقیاس‌خورده
  // بماند، سقف بر حجم تقسیم می‌شود و کاربرِ ۳۰۰ قرارداد سقف یک‌سیصدم می‌بیند.
  check('سقف حجم، به‌ازای یک واحد می‌ماند',
    one58.maxQty === many58.maxQty, `${one58.maxQty} → ${many58.maxQty}`);

  // نمودار بازده و پنل سناریو، `__legs` را با `netCash` جفت می‌کنند. اگر یکی
  // مقیاس‌خورده باشد و دیگری نه، نمودار و جدول دو عدد متفاوت می‌گویند.
  check('پاهای همراه ردیف، همان مقیاس نقد خالص را دارند',
    near(pnlAtExpiry(many58.__legs, many58.S, many58.netCash), many58.staticPnl)
    && near(many58.staticPnl, one58.staticPnl * 300));
  check('نسبت پاهای همراه، در تعداد قرارداد ضرب شده است',
    many58.__legs.every((l, i) => near(l.ratio, one58.__legs[i].ratio * 300)));

  // اسکن هم باید همان حجم را رد کند — نه `qtyDefault` پیش‌فرض
  const mkRow58 = (strike) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: size58, remainedDay: 30, endDate: 20260101,
    pMeDem_C: 3000, qTitMeDem_C: 1e6, pMeOf_C: 3200, qTitMeOf_C: 1e6,
    pDrCotVal_C: 3100, pClosing_C: 3100, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: 2600, qTitMeDem_P: 1e6, pMeOf_P: 2800, qTitMeOf_P: 1e6,
    pDrCotVal_P: 2700, pClosing_P: 2700, oP_P: 400, qTotTran5J_P: 800,
  });
  const rows58 = [90000, 95000, 100000, 105000, 110000].map(mkRow58);
  const chain58 = buildChain(rows58, s58);
  const scanOne = scanFn({ def: def58, chain: chain58, uaKeys: ['1'], settings: s58, qty: 1 });
  const scanMany = scanFn({ def: def58, chain: chain58, uaKeys: ['1'], settings: s58, qty: 50 });
  const pick58 = (res, id) => res.rows.find((r) => r.id === id);
  check('اسکن، حجم را تا ردیف می‌برد',
    scanOne.rows.length > 0 && scanOne.rows.every((r) => {
      const m = pick58(scanMany, r.id);
      return m && m.qty === 50 && near(m.netCash, r.netCash * 50, Math.abs(r.netCash * 50) * 1e-9 + 1e-6);
    }), `${scanOne.rows.length} ردیف`);

  // ستون حجم باید در قرارداد ستونی باشد، وگرنه هیچ‌جای جدول نمی‌گوید این
  // اعداد مال چند قرارداد است.
  check('ستون «حجم من» در قرارداد ستونی هست',
    COLUMNS.some((c) => c.key === 'qty' && c.fmt === 'int'));

  // تب‌ها باید حجمِ همان تب را به پنل سناریو و انتقال بدهند، نه پیش‌فرض
  // تنظیمات — وگرنه کاربر حجم را عوض می‌کند و پنل جزئیات همان عدد قبلی را
  // نگه می‌دارد.
  const stratSrc58 = readSrc('../ui/tabs/strategy.mjs');
  check('تب استراتژی، حجم کنترل خودش را به پنل جزئیات می‌دهد',
    !/units: Math\.max\(1, Number\(s\(\)\.qtyDefault\)/.test(stratSrc58)
    && stratSrc58.includes('units: unitsOf(r)'));
}

// ═════════ ۵۹. نرخ کارمزد پایه، بر حسب نوع ابزار ═════════
//
// حسابرسی: یک نرخ سهم برای همهٔ پایه‌ها اعمال می‌شد. کاوردکال و پوت حفاظتی
// و کولار و تبدیل روی صندوق قابل معامله یا صندوق کالایی، هزینهٔ غلط
// می‌گرفتند — و آن نرخ در ارزش کل موقعیت ضرب می‌شود.
//
// تابلوی اختیار نوع ابزار پایه را نمی‌دهد. تشخیص خودکار از روی نام یعنی
// حدس زدن، و حدسی که در نرخ کل موقعیت ضرب شود از نداشتنِ تفکیک بدتر است.
// پس نگاشت، اعلام کاربر است و پیش‌فرضِ هر سه کلاس برابر نرخ سهم می‌ماند.
group('۵۹. نرخ کارمزد پایه بر حسب نوع ابزار');
{
  const s = defaults();
  check('بدون نگاشت، همه‌چیز سهم است و نرخ عوض نمی‌شود',
    assetClassOf(assetClassMap(''), { ins: '123', name: 'اهرم' }) === 'STOCK');
  const map = assetClassMap('123:ETF, طلا:COMMODITY, بدون‌نوع:XYZ');
  check('نگاشت با شناسه می‌خواند', assetClassOf(map, { ins: '123', name: 'هرچیز' }) === 'ETF');
  check('نگاشت با نام هم می‌خواند', assetClassOf(map, { ins: '999', name: 'طلا' }) === 'COMMODITY');
  check('نوع ناشناخته دور ریخته می‌شود، نه اینکه ساخته شود',
    assetClassOf(map, { ins: '0', name: 'بدون‌نوع' }) === 'STOCK' && map.size === 2, `${map.size}`);

  const fStock = feesOf(s);
  const fEtf = feesOf(s, 'ETF');
  check('پیش‌فرض هر سه کلاس یکی است — تا کاربر نرخ کارگزارش را ننوشته، هیچ عددی جابه‌جا نمی‌شود',
    fEtf.buyStock === fStock.buyStock && fEtf.sellStock === fStock.sellStock
    && feesOf(s, 'COMMODITY').sellStock === fStock.sellStock);
  const s2 = { ...s, feeSellEtf: 0.00088 };
  check('با نرخ اعلامی کاربر، فقط پای سهمِ همان کلاس عوض می‌شود',
    feesOf(s2, 'ETF').sellStock === 0.00088 && feesOf(s2).sellStock === s.feeSellStock
    && feesOf(s2, 'ETF').option === s.feeOption && feesOf(s2, 'ETF').exercise === s.feeExercise);

  // و ردیف باید بگوید کدام نرخ خورده است
  const size = 1000;
  const def = byId('covered-call');
  const legs = buildLegs(def, { strikes: [110000], size, days: [30] });
  const Q = (bid, ask) => ({ bid, bidQty: 900, ask, askQty: 900, last: bid, close: bid,
    book: [{ bid, bidQty: 900, ask, askQty: 900 }], state: 'A', staleSec: 1 });
  const mkRow = (settings, assetClass) => evaluate({
    legs, quotes: [Q(99000, 100000), Q(4000, 4200)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings, def,
      underlying: 'نمونه', sigmaHist: 0.6, assetClass },
  });
  const rowStock = mkRow(s, 'STOCK');
  const rowEtf = mkRow({ ...s, feeBuyEtf: 0.00037 }, 'ETF');
  check('ردیف، نوع پایه و برچسبش را گزارش می‌کند',
    rowStock.assetClass === 'STOCK' && rowEtf.assetClassLabel === 'صندوق قابل معامله',
    rowEtf.assetClassLabel);
  check('نرخ خرید کمترِ صندوق، بهای ورود کاوردکال را کمتر می‌کند',
    rowEtf.netCash > rowStock.netCash && rowEtf.entryFee < rowStock.entryFee,
    `سهم ${Math.round(rowStock.entryFee).toLocaleString()} | صندوق ${Math.round(rowEtf.entryFee).toLocaleString()}`);
  check('و ترکیبِ بدون پای سهم از این تفکیک اثر نمی‌گیرد',
    (() => {
      const np = byId('naked-put');
      const l = buildLegs(np, { strikes: [95000], size, days: [30] });
      const mk = (settings, assetClass) => evaluate({ legs: l, quotes: [Q(8000, 8400)],
        ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings, def: np,
          underlying: 'نمونه', sigmaHist: 0.6, assetClass } });
      return mk(s, 'STOCK').netCash === mk({ ...s, feeBuyEtf: 0.00037, feeSellEtf: 0.00088 }, 'ETF').netCash;
    })());
}

// ═════════ ۶۰. مهار بازده نامتعارف ═════════
//
// حسابرسی: ۳۶۱ بازده ماهانهٔ بالای ۱۰۰۰٪، با بیشینهٔ ۴٫۳ میلیون درصد. ریشهٔ
// اصلی مخرج بود و در گروه ۶ بسته شد. آنچه می‌ماند از مظنه می‌آید نه از
// فرمول: اسپردی که بازار به آن قیمت نمی‌دهد. حذفش تصمیم مدل نیست — پس
// ردیف نشان‌دار می‌شود و کف سرمایه در دست کاربر است.
group('۶۰. مهار بازده نامتعارف');
{
  const s = defaults();
  const size = 1000;
  const Q = (bid, ask) => ({ bid, bidQty: 900, ask, askQty: 900, last: bid, close: bid,
    book: [{ bid, bidQty: 900, ask, askQty: 900 }], state: 'A', staleSec: 1 });
  const def = byId('bear-put-spread');
  const legs = buildLegs(def, { strikes: [90000, 100000], size, days: [30] });
  const mk = (settings) => evaluate({ legs, quotes: [Q(4990, 5000), Q(4990, 5000)],
    ctx: { S: 95000, Sclose: 95000, days: 30, size, qty: 1, settings, def,
      underlying: 'نمونه', sigmaHist: 0.6 } });

  const row = mk({ ...s, feeOption: 0 });
  check('مخرجِ اسپرد بدهکارِ ناچیز، دیگر خودِ بدهکاری نیست',
    row.capitalKind === 'DEBIT_BLOCKED' && row.capital > -row.netCash,
    `${Math.round(row.capital).toLocaleString()} در برابر ${Math.round(-row.netCash).toLocaleString()}`);
  check('و بازده ماهانه از مرتبهٔ صدهزار درصد به مرتبهٔ هزار رسید',
    row.retMonthPct < 5000, `${row.retMonthPct.toFixed(2)}٪`);
  check('ولی هنوز نامتعارف است و برچسبش را می‌گیرد',
    row.warn.includes('بازده نامتعارف'), row.warn.join('، '));
  check('آستانهٔ صفر، هشدار را خاموش می‌کند — قاعده سلیقهٔ کاربر است',
    !mk({ ...s, feeOption: 0, retWarnMonthPct: 0 }).warn.includes('بازده نامتعارف'));
  check('ردیف عادی برچسب نمی‌گیرد',
    !mk({ ...s, feeOption: 0, retWarnMonthPct: 1e7 }).warn.includes('بازده نامتعارف'));

  // کف سرمایه: فیلتر است نه هشدار، و پیش‌فرضش خاموش
  const tiny = { ...row, capital: 8.24, retMaxPct: 50, legPrices: [] };
  check('کف سرمایه به‌طور پیش‌فرض خاموش است', passesFilters(tiny, s));
  check('و با روشن‌شدن، ردیفِ هشت‌ریالی را می‌اندازد',
    !passesFilters(tiny, { ...s, minCapital: 1000000 }));
  check('ولی ردیف با سرمایه واقعی را نمی‌اندازد',
    passesFilters({ ...tiny, capital: 50000000 }, { ...s, minCapital: 1000000 }));
}

// ═════════ ۶۱. نمودار ریزمعامله، مرجع است نه اجرا ═════════
//
// حسابرسی: نمودار «آفست لحظه‌ای موقعیت» نام داشت، ولی از آخرین معاملهٔ
// حمل‌شدهٔ هر پا ساخته می‌شود نه از مظنه تقاضا و عرضهٔ هم‌زمان. اسم، ادعای
// اجرا می‌کرد؛ داده نمی‌توانست پشتش بایستد. تابلو دفتر سفارش تاریخی نمی‌دهد،
// پس عدد اجرایی ساختنی نیست — نام باید راست می‌شد، نه عدد.
group('۶۱. نمودار ریزمعامله، مرجع است نه اجرا');
{
  const btUi = readSrc('../ui/tabs/backtest.mjs');
  check('عنوان «آفست لحظه‌ای» برداشته شد', !btUi.includes('آفست لحظه‌ای موقعیت'));
  check('و جایش «ارزش مشاهده‌شدهٔ موقعیت» نشست', btUi.includes('ارزش مشاهده‌شدهٔ موقعیت'));
  check('و کنارش صریح گفته شده که قابل آفست نیست', btUi.includes('مرجع، نه قابل آفست'));
  check('پانویس، دلیلش را می‌گوید نه فقط حکمش را',
    btUi.includes('دفتر سفارش تاریخی نمی‌دهد'));
  const btCore = readSrc('../core/backtest.mjs');
  check('موتور هم همین را در جای خودش نوشته', btCore.includes('این عدد قابل آفست نیست'));
}

// ═════════ ۶۲. تاریخ تولتیپ، و پایداری انتخاب ترکیب ═════════
group('۶۲. تاریخ تولتیپ نمودار ریزمعامله');
{
  // `replayIntraday` تاریخ را روی نقاط نمی‌گذارد — ثانیهٔ درون‌روز می‌دهد،
  // نه روز — پس رابط باید روزِ باز را مهر بزند. تا امروز `replay.endDate`
  // را می‌زد که ثابت است و با کلیک روی ردیف عوض نمی‌شود؛ نتیجه این بود که
  // هر چهار نمودار درون‌روز، تاریخِ روز آخرِ بازه را نشان می‌دادند بی‌آنکه
  // هیچ عددی غلط شود. همین آن را سخت‌یاب می‌کرد.
  const btSrc = readSrc('../ui/tabs/backtest.mjs');
  check('نقاط نمودار با روزِ باز مهر می‌خورند، نه با روز پایان بازه',
    btSrc.includes('intradayChartRows(intraday, intradayDate)')
    && !btSrc.includes('intradayChartRows(intraday, replay.endDate)'));
  check('تاریخ تولتیپ از خودِ نقطه می‌آید و نقطهٔ بی‌تاریخ «—» می‌گیرد',
    btSrc.includes("Number.isFinite(Number(row.date)) ? dateLabel(row.date) : '—'"));
  // درصد در تولتیپ باید واحد داشته باشد: عنوان محور کنارش نیست و «۱۲٫۳۵»
  // تنها، نه ریال است نه درصد.
  check('عدد درصدی در تولتیپ واحد می‌گیرد', btSrc.includes('const tipLabel ='));

  // ریشهٔ «NaN/NaN/NaN»: تاریخ نامعتبر از `dateParts` رد می‌شد و `{0,0,0}`
  // می‌ساخت. بدتر از برچسب خراب، `dateUtc` بود که از همان صفر یک تاریخ
  // واقعی در ۱۸۹۹ می‌ساخت و بی‌سروصدا وارد محاسبه می‌شد.
  check('تاریخ صفر و ماه/روز بیرون از دامنه، تاریخ شمرده نمی‌شوند',
    dateParts(0) === null && dateParts(20260000) === null && dateParts(20261301) === null
    && dateParts(20260832) === null);
  check('و برچسبشان «—» است، نه NaN',
    historyDateLabel(0) === '—' && historyDateLabel(undefined) === '—');
  check('تاریخ معتبر دست‌نخورده می‌ماند',
    historyDateLabel(20260819) === '1405/05/28' && dateParts(20260819).d === 19);
}

group('۶۳. انتخاب ترکیب با تغییر قیمت یا اسکرول عوض نمی‌شود');
{
  // ترکیب‌ها با هر تغییر مبنای قیمت یا روز ورود از نو ساخته می‌شوند و
  // ترتیبشان عوض می‌شود، پس اندیس آرایه هویت نیست. `innerHTML` روی یک
  // `select` هم مقدارش را به گزینهٔ اول برمی‌گرداند — یعنی کاربر روی
  // قراردادی کار می‌کرد که خودش انتخابش نکرده بود.
  const legs = (spec) => spec.map(([ins, side, ratio]) => ({ ins, side, ratio }));
  const a = legs([['111', 'sell', 1], ['222', 'buy', 2]]);
  check('کلید ترکیب به ترتیب پاها وابسته نیست',
    comboKey(a) === comboKey(legs([['222', 'buy', 2], ['111', 'sell', 1]])));
  check('همان قراردادها با سمت متفاوت، یک ترکیب نیستند',
    comboKey(a) !== comboKey(legs([['111', 'buy', 1], ['222', 'buy', 2]])));
  check('همان قراردادها با نسبت متفاوت هم یکی نیستند',
    comboKey(a) !== comboKey(legs([['111', 'sell', 1], ['222', 'buy', 3]])));
  check('نسبت نانوشته، یک است', comboKey([{ ins: '9', side: 'buy' }]) === comboKey([{ ins: '9', side: 'buy', ratio: 1 }]));

  const btSrc63 = readSrc('../ui/tabs/backtest.mjs');
  check('بک‌تست، انتخاب را با هویت نگه می‌دارد نه با اندیس',
    btSrc63.includes('const keep = legs ? comboKey(legs) : \'\';')
    && btSrc63.includes("comboKey(combo.legs) === keep"));
  check('و اگر ترکیب قبلی در روز تازه نبود، ساکت جایگزین نمی‌شود',
    btSrc63.includes('ترکیب قبلی در این روز نبود'));

  const hSrc63 = readSrc('../ui/tabs/history.mjs');
  check('تحلیل تاریخی هم ردیف انتخاب‌شده را نگه می‌دارد، نه ردیف اول را',
    hSrc63.includes('const keep = selectedAuto ? comboKey(selectedAuto.legs)')
    && !hSrc63.includes('if (sorted[0]) selectAutoCombo(sorted[0]);'));
  check('و تعریف دوم هویت پا در رابط نمانده — یکی است، در موتور',
    !hSrc63.includes('legSignature'));

  // بعضی مرورگرها روی `select` فوکوس‌دار، هر درجهٔ چرخ را یک گزینه جلو
  // می‌برند. `blur` به‌جای `preventDefault` است چون جلوگیری از رویداد،
  // اسکرول صفحه را هم می‌گیرد و کاربر داخل فهرست حبس می‌شود.
  const appSrc63 = readSrc('../ui/app.mjs');
  check('چرخ ماوس روی فهرست کشویی، مقدارش را عوض نمی‌کند',
    /document\.addEventListener\('wheel'[\s\S]*?select\.blur\(\);/.test(appSrc63));
  check('و صفحه همچنان اسکرول می‌شود — رویداد گرفته نمی‌شود',
    /addEventListener\('wheel'[\s\S]*?\{ passive: true, capture: true \}\)/.test(appSrc63));
}

// ═══════════════════════════ ۶۴. نگاه باز ═══════════════════════════
group('۶۴. نگاه باز — سربه‌سر، وزن ارزش، IV و بازه زمانی');
{
  check('سربه‌سر کال = اعمال + پریمیوم', near(optionBreakeven('call', 100, 12), 112));
  check('سربه‌سر پوت = اعمال − پریمیوم', near(optionBreakeven('put', 100, 7), 93));
  const weighted = weightedMean([{ v: 10, w: 1 }, { v: 20, w: 3 }, { v: 999, w: 0 }], (r) => r.v, (r) => r.w);
  check('میانگین وزنی، وزن صفر را وارد شاخص نمی‌کند', near(weighted.value, 17.5) && weighted.count === 2 && weighted.weight === 4);
  const ma64 = movingAverage([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }, { v: 6 }], 'v', 5);
  check('میانگین متحرک فقط از مشاهده پنجم ساخته می‌شود', ma64.slice(0, 4).every((v) => !Number.isFinite(v)) && near(ma64[4], 3) && near(ma64[5], 4));
  check('میانگین متحرک از روی مشاهده گمشده نمی‌پرد', !Number.isFinite(movingAverage([{ v: 1 }, { v: 2 }, { v: NaN }, { v: 4 }, { v: 5 }], 'v', 5)[4]));

  const expiry = 20240630;
  const ua64 = { ins: '1', name: 'پایه آزمایشی' };
  const contracts64 = [
    { ins: '11', name: 'کال ۱۰۰', kind: 'call', strike: 100, expiry, size: 1000 },
    { ins: '12', name: 'کال ۱۲۰', kind: 'call', strike: 120, expiry, size: 1000 },
    { ins: '21', name: 'پوت ۱۰۰', kind: 'put', strike: 100, expiry, size: 1000 },
  ];
  const series64 = {
    1: [
      { date: 20240101, close: 100, value: 1000000, vol: 10000 },
      { date: 20240102, close: 105, value: 1200000, vol: 11000 },
    ],
    11: [
      { date: 20240101, close: 10, value: 100, vol: 10, trades: 2 },
      { date: 20240102, close: 12, value: 200, vol: 20, trades: 3 },
    ],
    12: [
      { date: 20240101, close: 5, value: 300, vol: 30, trades: 4 },
      // ارزش رسمی صفر: قیمت دیده می‌شود ولی حق ندارد وزن شاخص شود.
      { date: 20240102, close: 6, value: 0, vol: 10, trades: 1 },
    ],
    21: [
      { date: 20240101, close: 8, value: 200, vol: 20, trades: 3 },
      { date: 20240102, close: 7, value: 400, vol: 40, trades: 5 },
    ],
  };
  const daily64 = analyzeDailyOpenView({ ua: ua64, contracts: contracts64, seriesByIns: series64, from: 20240101, to: 20240102, settings: { rFree: 0.2, yearDays: 365 } });
  check('شاخص روزانه کال با ارزش رسمی وزن می‌گیرد', near(daily64.rows[0].callBreakeven, 121.25), daily64.rows[0].callBreakeven);
  check('قرارداد با ارزش رسمی صفر از شاخص روزانه کنار می‌رود', near(daily64.rows[1].callBreakeven, 112) && daily64.rows[1].callContracts === 1);
  check('شاخص پوت جدا ساخته می‌شود', near(daily64.rows[0].putBreakeven, 92));
  check('تغییر پایه روز دوم محاسبه می‌شود', near(daily64.rows[1].baseChangePct, 5));
  check('تفکیک تاریخ×سررسید موجود است', daily64.expiryRows.length === 2 && daily64.expiryRows.every((r) => r.expiry === expiry));
  check('IV قراردادهای معتبر بدون ساخت عدد برای نامعتبرها ثبت می‌شود', daily64.contractRows.some((r) => Number.isFinite(r.iv)));
  check('وزن هر قرارداد در سمت خودش ثبت می‌شود', near(daily64.contractRows.find((r) => r.date === 20240101 && r.ins === '11').indexWeightPct, 25)
    && near(daily64.contractRows.find((r) => r.date === 20240101 && r.ins === '12').indexWeightPct, 75));

  const maSeries64 = {
    1: [1, 2, 3, 4, 5].map((day) => ({ date: 20240100 + day, close: 100, value: 1000, vol: 10 })),
    11: [1, 2, 3, 4, 5].map((day) => ({ date: 20240100 + day, close: 10, value: 100, vol: 10 })),
    21: [1, 2, 3, 4, 5].map((day) => ({ date: 20240100 + day, close: 5, value: 100, vol: 10 })),
  };
  const maDaily64 = analyzeDailyOpenView({ ua: ua64, contracts: [contracts64[0], contracts64[2]], seriesByIns: maSeries64, settings: { rFree: 0.2, yearDays: 365 } });
  check('فاصله کال و پوت، میانگین ۵روزه مستقل دارند', near(maDaily64.rows[4].callBreakevenGapPctMa5, 10) && near(maDaily64.rows[4].putBreakevenGapPctMa5, 5));
  check('IV کال و پوت نیز میانگین ۵روزه مستقل دارند', Number.isFinite(maDaily64.rows[4].callIvPctMa5) && Number.isFinite(maDaily64.rows[4].putIvPctMa5));

  const trade = (time, price, quantity, canceledKnown = true) => ({ time, price, quantity, canceled: false, canceledKnown });
  const intraday64 = analyzeIntradayOpenView({
    ua: ua64, contracts: contracts64, dates: [20240101], intervalMinutes: 15,
    tradesByKey: {
      '20240101:1': [trade(90100, 100, 100), trade(91000, 110, 100)],
      '20240101:11': [trade(90200, 10, 2), trade(92000, 11, 1)],
      '20240101:12': [trade(90600, 5, 6)],
      '20240101:21': [trade(90400, 8, 1, false)],
    }, settings: { rFree: 0.2, yearDays: 365 },
  });
  check('پایه در همان سطل با VWAP ساخته می‌شود', intraday64.rows.length === 2 && near(intraday64.rows[0].basePrice, 105));
  check('قیمت پایه به سطل بی‌معامله بعدی حمل نمی‌شود', !Number.isFinite(intraday64.rows[1].basePrice));
  check('ارزش ریزمعامله × اندازه قرارداد وزن کال است', near(intraday64.rows[0].callBreakeven, 119));
  check('وزن قرارداد در سطل زمانی هم ثبت می‌شود', near(intraday64.contractRows.find((r) => r.second === 32400 && r.ins === '11').indexWeightPct, 40));
  check('ابهام وضعیت ابطال تا خروجی حفظ می‌شود', intraday64.rows[0].unknownCancel === true);
  check('ریز هر قرارداد و هر سررسید برای حسابرسی نگه داشته می‌شود', intraday64.contractRows.length === 4 && intraday64.expiryRows.length === 2);
  check('میانگین ۵روزه با پنج سطل درون‌روزی اشتباه نمی‌شود', !('callBreakevenGapPctMa5' in intraday64.expiryRows[0]));

  const corr = pearson([{ a: 1, b: 2 }, { a: 2, b: 4 }, { a: 3, b: 6 }], 'a', 'b');
  check('همبستگی پیرسون همراه تعداد نمونه محاسبه می‌شود', near(corr.value, 1) && corr.samples === 3);
  check('ماتریس رابطه همه متغیرها مربع است', relationMatrix(daily64.rows).length === 49);

  const workbook64 = buildOpenViewWorkbook({ ua: ua64, daily: daily64, intraday: intraday64, dailyRelations: relationMatrix(daily64.rows), intradayRelations: relationMatrix(intraday64.rows) });
  check('اکسل جامع، راهنما و برگه‌های روزانه/بازه/همبستگی دارد',
    workbook64.includes('ss:Name="راهنما"') && workbook64.includes('ss:Name="روزانه سررسید"')
    && workbook64.includes('ss:Name="قراردادهای بازه"') && workbook64.includes('ss:Name="همبستگی روزانه"'));
  check('عددهای اکسل Numeric می‌مانند', workbook64.includes('<Data ss:Type="Number">121.25</Data>'));
  check('اکسل میانگین‌های ۵روزه و وزن‌های مستقل قرارداد را صادر می‌کند',
    workbook64.includes('میانگین ۵روزه فاصله کال ٪') && workbook64.includes('میانگین ۵روزه IV پوت ٪')
    && workbook64.includes('وزن شاخص ٪') && workbook64.includes('وزن IV ٪'));
  check('خانه نامعتبر اکسل خالی می‌ماند، نه متن NaN', !workbook64.includes('>NaN<'));
  check('اکسل سررسید فعال هنگام خروجی را در راهنما ثبت می‌کند', workbook64.includes('سررسید فعال هنگام خروجی'));

  const app64 = readSrc('../ui/app.mjs'), server64 = readSrc('../server/server.mjs'), ui64 = readSrc('../ui/tabs/open-view.mjs');
  const liveDashboard64 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('نگاه باز از ریل اصلی حذف و داخل داشبورد تنبل شده است',
    !app64.includes("id: 'open-view'") && liveDashboard64.includes("import('/ui/tabs/open-view.mjs')"));
  check('ریزمعامله دسته‌ای سقف صریح دارد', server64.includes("p === '/api/trades/batch'") && server64.includes('raw.length > 1200'));
  check('رابط بازه، تایم‌فریم روز و خروجی جامع دارد', ui64.includes('ov-from') && ui64.includes('ov-day-interval') && ui64.includes('downloadOpenViewExcel'));
  check('دکمه تایم‌فریم از بالای صفحه حذف و داخل جزئیات روز نشسته', !ui64.includes('id="ov-intraday"') && ui64.includes('id="ov-day-intraday"'));
  check('نمای اصلی فقط جدول روزانه دارد و جدول سررسید/همبستگی حذف شده', ui64.includes('open-view-daily-table') && !ui64.includes('ov-expiry-table') && !ui64.includes('correlationTable'));
  check('تولتیپ قیمت، فاصله درصدی هر دو شاخص را می‌گوید', ui64.includes('فاصله پایه تا کال') && ui64.includes('فاصله پایه از پوت'));
  check('جدول قرارداد، وزن سربه‌سر و IV را جدا رنگ می‌کند', ui64.includes('indexWeightPct') && ui64.includes('ivWeightPct') && ui64.includes('open-view-weight-cell'));
  check('نمودار فاصله، کال و پوت را ستونی رسم می‌کند', ui64.includes("kind: 'bar'") && ui64.includes('open-view-chart-bar'));
  check('میانگین‌های فاصله و IV از راهنمای نمودار قابل خاموش‌کردن‌اند', ui64.includes('data-series-toggle') && ui64.includes('hiddenSeries') && ui64.includes('aria-pressed'));
  check('گزینه همه سررسیدها حذف شده و فقط سررسید واقعی انتخاب می‌شود', !ui64.includes('value="all"') && ui64.includes('selectedExpiry'));
  check('جدول روزانه و جزئیات روز از ردیف‌های همان سررسید می‌خوانند', ui64.includes('dailyTable(rows, selectedDate)') && ui64.includes('item.expiry === selectedExpiry()'));
  check('ریزمعامله فقط قراردادهای سررسید انتخابی را دریافت می‌کند', ui64.includes('contractsInView()') && ui64.includes('contracts: viewContracts'));
  check('پارامترهای مدل IV در خود نگاه باز قابل تنظیم‌اند', ['ov-rfree', 'ov-divyield', 'ov-year-days', 'ov-iv-lo', 'ov-iv-hi', 'ov-apply-iv'].every((id) => ui64.includes(id)) && ui64.includes('toEnDigits'));
}

group('۶۵. جمع و باز کردن پنل سمت راست با یک دکمه');
{
  // دکمهٔ باز کردن، `position: fixed` با `inset-inline-end` بود؛ در سندی
  // که `dir="rtl"` است، inline-end همان لبهٔ چپ است — پس دکمه در سمت
  // مقابلِ پنل می‌نشست. راه‌حل، نگه‌داشتن همان دکمهٔ خودِ ریل است.
  const indexHtml65 = readSrc('../ui/index.html');
  const cssSrc65 = readSrc('../ui/style.css');
  const appSrc65 = readSrc('../ui/app.mjs');

  check('سند راست‌به‌چپ است — پس inset-inline-end یعنی سمت چپ',
    /<html[^>]*dir="rtl"/.test(indexHtml65));
  check('دکمهٔ شناور دیگر وجود ندارد',
    !indexHtml65.includes('rail-floating') && !cssSrc65.includes('rail-floating')
    && !appSrc65.includes('rail-floating'));
  check('تنها یک دکمهٔ جمع/باز در سند هست',
    (indexHtml65.match(/rail-toggle-btn/g) || []).length === 1);
  check('و آن دکمه داخل خودِ ریل است، نه بیرونش',
    /<nav class="rail"[\s\S]*?rail-toggle-btn[\s\S]*?<\/nav>/.test(indexHtml65));
  check('همان یک دکمه هر دو جهت را می‌گیرد',
    /el\('rail-toggle-btn'\)\.addEventListener\('click', \(\) => toggleRail\(\)\);/.test(appSrc65));

  // جمع‌شده یعنی باریک، نه ناپدید: اگر عرض صفر و pointer-events هیچ شود،
  // دکمهٔ بازگشت هم با آن می‌رود.
  const collapsed = cssSrc65.match(/\.shell\[data-rail-collapsed="true"\] \.rail \{[^}]*\}/);
  check('ریل جمع‌شده عرض دارد، صفر نمی‌شود',
    Boolean(collapsed) && /width: var\(--rail-stub\)/.test(collapsed[0])
    && !/width: 0/.test(collapsed[0]));
  check('و کلیک‌پذیر می‌ماند',
    Boolean(collapsed) && !/pointer-events: none/.test(collapsed[0])
    && !/opacity: 0/.test(collapsed[0]));
  check('عرض نوار بیرون‌زده از توکن خودِ ریل می‌آید',
    /--rail-stub: \d+px;/.test(cssSrc65));
  check('در حالت جمع فقط جست‌وجو و فهرست پنهان می‌شوند، نه دکمه',
    /\.shell\[data-rail-collapsed="true"\] \.rail-search,\s*\.shell\[data-rail-collapsed="true"\] \.rail-list \{ display: none; \}/.test(cssSrc65)
    && !/\.shell\[data-rail-collapsed="true"\] \.rail-toggle \{[^}]*display: none/.test(cssSrc65));
  check('روی موبایل هم ریل جمع‌شده ناپدید نمی‌شود',
    !/\.shell\[data-rail-collapsed="true"\] \.rail \{ display: none; \}/.test(cssSrc65));

  check('نام دکمه، کارِ کلیک بعدی را می‌گوید نه حالت فعلی را',
    appSrc65.includes("isRailCollapsed ? 'باز کردن پنل استراتژی‌ها' : 'جمع کردن پنل استراتژی‌ها'")
    && appSrc65.includes("toggleBtn.setAttribute('aria-label', label)"));
  check('پیکان دکمه با حالت باز و بسته می‌چرخد',
    /\.rail-toggle\[aria-expanded="true"\] \.rail-toggle-ic \{ transform: rotate\(180deg\); \}/.test(cssSrc65));
}


// ═════════ ۶۶. ارزش معاملات هر پا، ستون جدا ═════════
//
// خواسته کاربر: «ارزش معاملات پایه‌ها به صورت ستون مجزا نمایش داده بشه —
// برای هر پایه یک ستون — و قابلیت اضافه و حذف شدن از جدول را داشته باشد.»
//
// تا پیش از این فقط `valueTotal` بود: یک عدد برای کل ترکیب. آن عدد نمی‌گوید
// گردش پخش است یا روی یک پا جمع شده، و همین تفاوت است که می‌گوید ردیف را
// می‌شود بست یا نه.
group('۶۶. ارزش معاملات هر پا');
{
  const size = 1000;
  const mk = (bid, ask, value) => ({
    bid, bidQty: 50, ask, askQty: 80, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    oi: 500, oiYday: 400, vol: 1200, trades: 30, value,
    book: [{ level: 1, bid, bidQty: 50, ask, askQty: 80 }],
  });
  const s66 = defaults();

  // ——— اسپرد دوپا: هر پا گردش خودش ———
  const spDef66 = byId('bull-call-spread');
  const sp66 = evaluate({
    legs: buildLegs(spDef66, { strikes: [95000, 105000], size, days: [30] }),
    quotes: [mk(7000, 7400, 8e6), mk(2000, 2300, 2e6)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s66, def: spDef66, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('ارزش معاملات هر پا جدا فهرست می‌شود',
    Array.isArray(sp66.valueList) && sp66.valueList.length === 2
    && sp66.valueList[0] === 8e6 && sp66.valueList[1] === 2e6,
    sp66.valueList.join(' , '));
  check('هر پا ستون خودش را دارد، نه یک عدد سرجمع',
    sp66.legValue1 === 8e6 && sp66.legValue2 === 2e6);
  check('و مجموعشان همان ستون قدیمی «ارزش معاملات» است',
    near(sp66.legValue1 + sp66.legValue2, sp66.valueTotal, 1e-9), uiFmt.money(sp66.valueTotal));
  // ستون پای نداشته باید «—» بدهد نه «۰». صفر یعنی «پایی هست که امروز
  // معامله نشد» و اسپرد دوپا اصلاً پای سوم ندارد.
  check('ستون پای نداشته تهی می‌ماند، صفر نمی‌شود',
    Number.isNaN(sp66.legValue3) && Number.isNaN(sp66.legValue4));

  // ——— کاوردکال: پای سهم هم خانه خودش را دارد ———
  //
  // تطبیق با ستون‌های هویت، شرط خواندن است: `legNames` و `legsText` پای سهم
  // را می‌شمارند. اگر این فهرست آن را می‌انداخت، «پای ۱» کاوردکال در یک
  // ستون سهم بود و در ستون دیگر کال.
  const ccDef66 = byId('covered-call');
  const cc66 = evaluate({
    legs: buildLegs(ccDef66, { strikes: [110000], size, days: [30] }),
    quotes: [mk(99000, 100000, 0), mk(4800, 5200, 3e6)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s66, def: ccDef66, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  const legN66 = cc66.legPrices.length;
  check('فهرست ارزش، هم‌ترتیب با پاهاست — پای سهم هم خانه دارد',
    cc66.valueList.length === legN66 && legN66 === 2);
  // دیده‌بان اختیار گردش خودِ نماد پایه را در مظنه پا نمی‌دهد. صفر یعنی
  // «امروز معامله نشد» و این ادعا ساختگی است (قاعده ۲-۴ در AGENTS.md).
  check('خانه پای سهم بی‌داده می‌ماند، نه صفر',
    Number.isNaN(cc66.valueList[0]) && Number.isNaN(cc66.legValue1));
  check('پای اختیار کاوردکال گردش خودش را نگه می‌دارد',
    cc66.legValue2 === 3e6 && cc66.valueTotal === 3e6);

  // ——— تابع خالص ———
  check('خانه بیش از سقف ستون‌ها، در فهرست می‌ماند ولی ستون نمی‌گیرد',
    LEG_VALUE_SLOTS === 4
    && legValueSlots([1, 2, 3, 4, 5]).legValue4 === 4
    && !('legValue5' in legValueSlots([1, 2, 3, 4, 5])));
  check('ورودی نامعتبر، ستون تهی می‌دهد نه صفر',
    Number.isNaN(legValueSlots([Infinity]).legValue1)
    && Number.isNaN(legValueSlots(null).legValue1));

  // ——— قرارداد ستونی و قالب ———
  const keys66 = new Set(COLUMNS.map((c) => c.key));
  const need66 = ['valueList', 'legValue1', 'legValue2', 'legValue3', 'legValue4'];
  check('هر ستون تازه در قرارداد ستونی مشترک ثبت شده',
    need66.every((k) => keys66.has(k)), need66.filter((k) => !keys66.has(k)).join('، '));
  check('ستون هر پا، پولی است تا مرتب و رنگ شود',
    need66.slice(1).every((k) => COLUMNS.find((c) => c.key === k).fmt === 'money'));
  // فهرست مبالغ نباید از `list` رد شود: `grouped(NaN)` رشته «NaN» می‌سازد.
  check('فهرست مبالغ قالب خودش را دارد و خانه بی‌داده را «—» می‌کند',
    COLUMNS.find((c) => c.key === 'valueList').fmt === 'moneyList'
    && uiFmt.moneyList([8e6, NaN]).endsWith('—')
    && !uiFmt.moneyList([NaN]).includes('NaN'));
  // حذف خانه بی‌داده، شماره پاها را یکی جلو می‌اندازد و ستون «پای ۲» با
  // خانه دوم فهرست یکی نمی‌ماند.
  check('و خانه بی‌داده را حذف نمی‌کند، تا شماره پاها جابه‌جا نشود',
    uiFmt.moneyList([NaN, 2e6]).split(' , ').length === 2);

  // ——— جدول‌ها: نمایش پیش‌فرض و قابلیت اضافه و حذف ———
  const stratSrc66 = readSrc('../ui/tabs/strategy.mjs');
  const topSrc66 = readSrc('../ui/tabs/top.mjs');
  check('نمای خلاصه هر تب استراتژی، ستون ارزش هر پا را نشان می‌دهد',
    /'legValue1', 'legValue2', 'legValue3', 'legValue4'/.test(stratSrc66));
  check('برترین موقعیت‌ها هم همان ستون‌ها را دارد',
    topSrc66.includes("'legValue1', 'legValue2', 'legValue3', 'legValue4'"));
  check('وجه تضمین کل و اجزای پویای آن در نمای پیش‌فرض هر دو جدول دیده می‌شود',
    stratSrc66.includes("'margin', 'marginPart1', 'marginPart2', 'marginPart3', 'marginPart4'")
    && topSrc66.includes("'margin', 'marginPart1', 'marginPart2', 'marginPart3', 'marginPart4'"));
  // ستون «پای ۴» یک اسپرد دوپا همیشه «—» است و فقط پهنا می‌گیرد.
  check('ستون‌های پا به تعداد پاهای همان استراتژی بریده می‌شوند',
    /legValue\(\\d\+\)/.test(stratSrc66) && stratSrc66.includes('Number(m[1]) <= legCount'));
  check('ولی نمای «همه» بریده نمی‌شود',
    stratSrc66.includes("view === 'همه' ? VIEWS[view] : VIEWS[view].filter(fitsLegs)"));
  // «اضافه و حذف» همان انتخابگر ستون است: هر جدولی که `all` بگیرد پنل دارد.
  check('هر دو جدول انتخابگر ستون دارند، پس ستون‌ها اضافه و حذف می‌شوند',
    /all: colsAll, storeKey/.test(stratSrc66) && /all: COLUMNS, storeKey/.test(topSrc66));
  check('و هر چهار ستون در انتخابگر می‌مانند، حتی وقتی از نما بریده شده‌اند',
    need66.slice(1).every((k) => keys66.has(k)));

  // ——— سرستون، خودِ پا را می‌گوید نه فقط شماره‌اش ———
  //
  // خواسته کاربر با یک مثال روشن شد: «برای شورت استرانگل یک کال داریم و یک
  // پوت — ارزش معاملاتی هر کدوم». پس «پای ۲» کافی نیست؛ سرستون باید بگوید
  // کدام پا.
  const strangleCols = columnsForStrategy(byId('short-strangle'));
  const labelOf = (cols, k) => cols.find((c) => c.key === k).label;
  check('سرستون استرانگل فروش می‌گوید کدام پا پوت است و کدام کال',
    labelOf(strangleCols, 'legValue1') === 'ارزش معاملات پای ۱ — فروش پوت'
    && labelOf(strangleCols, 'legValue2') === 'ارزش معاملات پای ۲ — فروش کال',
    labelOf(strangleCols, 'legValue1'));
  check('استرانگل فروش یک ستون وجه تضمین ترکیبی دارد، نه دو ستون مستقل',
    marginPartDescriptors(byId('short-strangle')).length === 1
    && labelOf(strangleCols, 'marginPart1') === 'وجه تضمین ترکیبی — فروش کال و پوت'
    && !strangleCols.some((c) => c.key === 'marginPart2'));
  const condorCols = columnsForStrategy(byId('iron-condor'));
  check('راهبردی با دو جزء واقعی، دو ستون وجه تضمین می‌گیرد',
    marginPartDescriptors(byId('iron-condor')).length === 2
    && condorCols.some((c) => c.key === 'marginPart1')
    && condorCols.some((c) => c.key === 'marginPart2')
    && !condorCols.some((c) => c.key === 'marginPart3'));
  check('راهبرد بی‌وجه تضمین، ستون جزء ساختگی نمی‌گیرد',
    marginPartDescriptors(byId('covered-call')).length === 0
    && !columnsForStrategy(byId('covered-call')).some((c) => /^marginPart\d+$/.test(c.key)));
  // شماره پا حذف نمی‌شود: باترفلای سه پای کال دارد و بدون شماره، سه سرستون
  // هم‌نام می‌شوند و ستون سوم از ستون اول جدا نمی‌ماند.
  const flyCols = columnsForStrategy(byId('long-call-butterfly'));
  check('شماره پا می‌ماند، پس سه پای هم‌نوع باترفلای از هم جدا می‌مانند',
    new Set(['legValue1', 'legValue2', 'legValue3'].map((k) => labelOf(flyCols, k))).size === 3);
  check('نسبت پا در سرستون با رقم فارسی می‌آید',
    labelOf(flyCols, 'legValue2') === 'ارزش معاملات پای ۲ — فروش کال ×۲',
    labelOf(flyCols, 'legValue2'));
  check('پای سهم کاوردکال هم در سرستون نام دارد',
    labelOf(columnsForStrategy(byId('covered-call')), 'legValue1') === 'ارزش معاملات پای ۱ — خرید سهم');
  // ستون بی‌پا دست‌نخورده می‌ماند، وگرنه «— undefined» می‌گیرد
  check('ستون پای نداشته، برچسب خام خودش را نگه می‌دارد',
    labelOf(strangleCols, 'legValue3') === 'ارزش معاملات پای ۳'
    && labelOf(strangleCols, 'valueTotal') === labelOf(COLUMNS, 'valueTotal'));
  check('بدون تعریف استراتژی، همان قرارداد ستونی مشترک برمی‌گردد',
    columnsForStrategy(null) === COLUMNS && columnsForStrategy({ legs: [] }) === COLUMNS);
  check('تب استراتژی همین قاعده را صدا می‌زند، نه رونوشتی از خودش',
    stratSrc66.includes('columnsForStrategy(def)')
    && !/const KIND_FA/.test(stratSrc66));

  // ——— جدول دیده‌بان: گردش خودِ نماد پایه ———
  //
  // ستون «ارزش معاملات» این جدول در واقع مجموع زنجیره بود، نه گردش سهم.
  // دو عدد کاملاً متفاوت با یک نام.
  const rows66 = [{
    uaInsCode: '7', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000,
    qTotTran5J_UA: 5000, zTotTran_UA: 40, qTotCap_UA: 5e8,
    strikePrice: 100000, remainedDay: 30, endDate: 20260101, contractSize: 1000,
    insCode_C: 'c1', pMeDem_C: 4800, pMeOf_C: 5200, qTitMeDem_C: 50, qTitMeOf_C: 80,
    pDrCotVal_C: 5000, pClosing_C: 5000, oP_C: 500, yesterdayOP_C: 400,
    qTotTran5J_C: 1200, zTotTran_C: 30, qTotCap_C: 6e6,
    insCode_P: 'p1', pMeDem_P: 4800, pMeOf_P: 5200, qTitMeDem_P: 50, qTitMeOf_P: 80,
    pDrCotVal_P: 5000, pClosing_P: 5000, oP_P: 500, yesterdayOP_P: 400,
    qTotTran5J_P: 1200, zTotTran_P: 30, qTotCap_P: 4e6,
  }];
  const ua66 = underlyingList(buildChain(rows66))[0];
  check('گردش خودِ نماد پایه به فهرست دیده‌بان می‌رسد',
    ua66.uaValue === 5e8, uiFmt.money(ua66.uaValue));
  check('و با مجموع گردش زنجیره یکی گرفته نمی‌شود',
    ua66.value === 1e7 && ua66.value !== ua66.uaValue, uiFmt.money(ua66.value));
  const chainSrc66 = readSrc('../ui/tabs/chain.mjs');
  check('جدول دیده‌بان ستون ارزش معاملات نماد پایه دارد',
    /key: 'uaValue', label: 'ارزش معاملات نماد پایه'/.test(chainSrc66)
    && /'volume', 'value', 'uaValue'/.test(chainSrc66));
  check('و برچسب ستون زنجیره، آن را از گردش سهم جدا می‌کند',
    /key: 'value', label: 'ارزش معاملات اختیار'/.test(chainSrc66));
}


// ═══════════════════════════ ۶۷. تحلیل تاریخی → بک‌تست سریع ═══════════════════════════
group('۶۷. انتقال موقعیت تحلیل تاریخی به ریز بک‌تست سریع');
{
  const replay67 = {
    startDate: 20260502, endDate: 20260520,
    priced: [
      { kind: 'call', ins: 'c101', name: 'ضنماد۱' },
      { kind: 'put', ins: 'p099', name: 'طنماد۱' },
      { kind: 'underlying', ins: '77', name: 'نماد' },
    ],
    summary: { last: { netPnl: 999999, returnPct: 42 } },
  };
  const plan67 = historyHandoffPlan({
    ua: { ins: '77', name: 'نماد' },
    strategyId: 'short-strangle', strategyName: 'Short Strangle', replay: replay67,
    args: {
      startDate: 20260502, endDate: 20260520, entryBasis: 'CLOSE', exitBasis: 'LAST', units: 3,
      manualEntry: { 0: 1250, 1: 840, 2: 0, bad: NaN },
    },
    comboName: 'فروش استرانگل انتخاب‌شده',
  });
  check('نقشه تاریخی، قراردادهای دقیق و بازه انتخابی را منتقل می‌کند',
    plan67.from === 'history' && plan67.uaIns === '77'
    && plan67.legIns.join(',') === 'c101,p099'
    && plan67.entryDate === 20260502 && plan67.exitDate === 20260520);
  check('مبنا، تعداد واحد و قیمت دستی معتبر حفظ می‌شوند',
    plan67.entryBasis === 'CLOSE' && plan67.exitBasis === 'LAST' && plan67.units === 3
    && plan67.manualEntry['0'] === 1250 && plan67.manualEntry['1'] === 840
    && !('2' in plan67.manualEntry) && !('bad' in plan67.manualEntry));
  check('نتیجه تاریخی کپی نمی‌شود و مقصد خودش خودکار محاسبه می‌کند',
    plan67.autoRun === true && !('netPnl' in plan67) && !('returnPct' in plan67));

  const history67 = readSrc('../ui/tabs/history.mjs');
  const backtest67 = readSrc('../ui/tabs/backtest.mjs');
  check('مشخصات موقعیت تاریخی دکمه ریز بک‌تست دارد',
    history67.includes('data-history-backtest')
    && history67.includes('goHandoff(state, historyHandoffPlan({'));
  check('استراتژی مطالعه‌ای به بک‌تست اجرایی اشتباه فرستاده نمی‌شود',
    history67.includes('const backtestDisabled = !def?.feasible')
    && history67.includes('این استراتژی به فروش دارایی پایه نیاز دارد'));
  check('بک‌تست قیمت دستی تحویل‌شده را پس از بازسازی تاریخ و ترکیب می‌نشاند',
    backtest67.includes('manualEntry = Object.fromEntries(Object.entries(plan.manualEntry || {})')
    && backtest67.includes('if (Object.keys(manualEntry).length) paintSnapshots();'));
  check('موقعیت دستی که در فهرست خودکار نیست، با همان قراردادها بازسازی می‌شود',
    backtest67.includes('function exactHandoffCombo(plan, entryDate)')
    && backtest67.includes('contracts.find((contract) => String(contract.ins) === String(ins))')
    && backtest67.includes('موقعیت دقیق تحلیل تاریخی افزوده شد'));
  check('تحویل کامل خودکار اجرا می‌شود و تحویل ناقص فقط هشدار می‌دهد',
    backtest67.includes('if (!skipped.length && plan.autoRun)')
    && backtest67.includes('await runBacktest();')
    && backtest67.includes("skipped.join('؛ ')"));
}

// ═══════════════════════════ ۶۸. رصد لحظه‌ای بازار ═══════════════════════════
group('۶۸. رصد لحظه‌ای بازار و IV هر معامله');
{
  const raw68 = [
    { sequence: 3, time: 90003, price: 102, quantity: 7, canceled: false, canceledKnown: true },
    { sequence: 1, time: 90001, price: 100, quantity: 10, canceled: false, canceledKnown: true },
    { sequence: 2, time: 90002, price: 101, quantity: 5, canceled: true, canceledKnown: true },
    { sequence: 4, time: 0, price: 103, quantity: 2, canceled: false, canceledKnown: true },
  ];
  const active68 = activeLiveTrades(raw68);
  check('معامله باطل و رکورد ناقص از نوار زنده حذف می‌شوند',
    active68.length === 2 && active68.map((row) => row.sequence).join(',') === '1,3');
  const summary68 = summarizeLiveTrades(raw68);
  check('خلاصه روز فقط از معاملات معتبر ساخته می‌شود',
    summary68.count === 2 && summary68.volume === 17 && summary68.value === 1714
    && summary68.firstPrice === 100 && summary68.lastPrice === 102);
  check('VWAP و تغییر از اولین معامله دقیق‌اند',
    near(summary68.vwap, 1714 / 17, 1e-10) && near(summary68.changePct, 2, 1e-10), `${summary68.vwap} | ${summary68.changePct}`);

  const settings68 = { rFree: 0.30, divYield: 0, dayCountYear: 365, ivLo: 0.01, ivHi: 5 };
  const T68 = 30 / 365;
  const option68 = [
    { sequence: 1, time: 85959, price: 500, quantity: 1, canceled: false, canceledKnown: true },
    { sequence: 2, time: 90100, price: bsPrice('call', 10000, 10000, T68, 0.30, 0, 0.5), quantity: 2, canceled: false, canceledKnown: true },
    { sequence: 3, time: 90600, price: bsPrice('call', 11000, 10000, T68, 0.30, 0, 0.5), quantity: 3, canceled: false, canceledKnown: true },
  ];
  const base68 = [
    { sequence: 1, time: 90000, price: 10000, quantity: 50, canceled: false, canceledKnown: true },
    { sequence: 2, time: 90500, price: 11000, quantity: 70, canceled: false, canceledKnown: true },
  ];
  const tape68 = liveOptionTape({
    trades: option68, baseTrades: base68,
    contract: { ins: '22', name: 'ضنماد', kind: 'call', strike: 10000, days: 30, endDate: 20260922 },
    settings: settings68,
  });
  check('پیش از اولین معامله پایه، IV ساخته نمی‌شود', !Number.isFinite(tape68[0].iv));
  check('هر معامله اختیار فقط با آخرین معامله قبلی پایه هم‌زمان می‌شود',
    tape68[1].basePrice === 10000 && tape68[2].basePrice === 11000);
  check('IV هر دو معامله معتبر، تلاطم بازار را بازمی‌سازد',
    near(tape68[1].iv, 0.5, 1e-5) && near(tape68[2].iv, 0.5, 1e-5), `${tape68[1].iv} | ${tape68[2].iv}`);
  check('حجم و ارزش تجمعی در هر ردیف تازه جلو می‌روند',
    tape68[2].cumulativeVolume === 6
    && near(tape68[2].cumulativeValue, option68.reduce((sum, row) => sum + row.price * row.quantity, 0), 1e-8));
  const reference68 = liveReferenceTape(base68, { ins: '11', name: 'نماد' });
  check('مسیر پایه، تغییر قیمت و حجم تجمعی را برای نمودار می‌سازد',
    reference68.length === 2 && near(reference68[1].changePct, 10, 1e-10) && reference68[1].cumulativeVolume === 120);

  const server68 = readSrc('../server/server.mjs');
  const app68 = readSrc('../ui/app.mjs');
  const ui68 = readSrc('../ui/tabs/live-market.mjs');
  check('endpoint زنده با cache-buster و سقف ۲۴ ابزار از GetTrade می‌خواند',
    server68.includes("p === '/api/live-trades'")
    && server68.includes('`/Trade/GetTrade/${code}`')
    && server68.includes("parseInsList(u.searchParams.get('ins'), 24)")
    && server68.includes("_=${Date.now()}`"));
  check('رصد لحظه‌ای یک تب پایه تنبل است',
    app68.includes("id: 'live-market'") && app68.includes("mod: '/ui/tabs/live-market.mjs'"));
  check('رابط، پایه و قرارداد معامله‌شده را انتخاب و خودکار تازه می‌کند',
    ui68.includes('id="lm-base"') && ui68.includes('live-market-contracts')
    && ui68.includes("setInterval(refresh, intervalMs)") && ui68.includes('MAX_OPTIONS = 23'));
  check('هر دو جدول خلاصه و نوار، ستون تلاطم ضمنی دارند',
    ui68.includes("label: 'آخرین تلاطم ضمنی ٪'") && ui68.includes("label: 'تلاطم ضمنی ٪'"));
}

// ═══════════════════════════ ۶۹. داشبورد بازار و رصد زنده موقعیت ═══════════════════════════
group('۶۹. داشبورد تجمعی بازار و رصد زنده موقعیت تاریخی');
{
  const raw69 = [
    { uaInsCode: '11', lval30_UA: 'الف', pDrCotVal_UA: 110, pClosing_UA: 108, priceYesterday_UA: 100, qTotTran5J_UA: 10, qTotCap_UA: 1100, zTotTran_UA: 2 },
    { uaInsCode: '11', lval30_UA: 'الف', pDrCotVal_UA: 110, pClosing_UA: 108, priceYesterday_UA: 100, qTotTran5J_UA: 10, qTotCap_UA: 1100, zTotTran_UA: 2 },
    { uaInsCode: '22', lval30_UA: 'ب', pDrCotVal_UA: 90, pClosing_UA: 92, priceYesterday_UA: 100, qTotTran5J_UA: 5, qTotCap_UA: 450, zTotTran_UA: 1 },
    { uaInsCode: '33', lval30_UA: 'ج', pDrCotVal_UA: 100, pClosing_UA: 100, priceYesterday_UA: 100, qTotTran5J_UA: 0, qTotCap_UA: 0, zTotTran_UA: 0 },
  ];
  const instruments69 = breadthInstruments(raw69);
  check('نماد پایه تکراری دیده‌بان فقط یک بار وارد داشبورد می‌شود', instruments69.length === 3 && instruments69[0].ins === '11');
  const breadth69 = marketBreadthSnapshot(instruments69);
  check('مثبت و منفی فقط میان نمادهای واقعاً معامله‌شده شمرده می‌شوند',
    breadth69.positive === 1 && breadth69.negative === 1 && breadth69.untraded === 1 && breadth69.traded === 2);
  check('درصد وسعت بازار، نماد بی‌معامله را خنثی فرض نمی‌کند',
    near(breadth69.positivePct, 50) && near(breadth69.negativePct, 50) && breadth69.flat === 0);
  check('حجم و ارزش دو سوی بازار از خود نماد پایه می‌آیند',
    breadth69.positiveVolume === 10 && breadth69.negativeVolume === 5
    && breadth69.positiveValue === 1100 && breadth69.negativeValue === 450);

  const timeline69 = marketBreadthTimeline(instruments69, {
    11: [
      { sequence: 1, time: 90001, price: 101, quantity: 10, canceled: false },
      { sequence: 2, time: 90110, price: 99, quantity: 5, canceled: false },
    ],
    22: [{ sequence: 1, time: 90030, price: 90, quantity: 2, canceled: false }],
  });
  check('مسیر تجمعی یک عکس در پایان هر دقیقه واقعی می‌سازد', timeline69.length === 2 && timeline69[0].positive === 1 && timeline69[0].negative === 1);
  check('نماد تا اولین معامله در مسیر، بی‌معامله می‌ماند', timeline69[0].untraded === 1 && timeline69[0].traded === 2);
  check('تغییر جهت و گردش تجمعی بدون پرکردن دقیقه ساختگی ثبت می‌شود',
    timeline69[1].positive === 0 && timeline69[1].negative === 2
    && timeline69[1].cumulativeVolume === 17 && timeline69[1].cumulativeValue === 1685);

  const iv69 = liveQuoteIv({ kind: 'call', last: bsPrice('call', 10000, 10000, 30 / 365, 0.3, 0, 0.45), strike: 10000, days: 30 }, 10000,
    { rFree: 0.3, divYield: 0, dayCountYear: 365, ivLo: 0.01, ivHi: 5 });
  check('IV عکس قرارداد از همان حل‌گر مشترک بازسازی می‌شود', near(iv69, 45, 1e-3), iv69);

  const server69 = readSrc('../server/server.mjs');
  const ui69 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const backtest69 = readSrc('../ui/tabs/backtest.mjs');
  const history69 = readSrc('../ui/tabs/history.mjs');
  const portfolio69 = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('endpoint داشبورد همه پایه‌ها را برای تشخیص صادقانه بی‌معامله تجمیع می‌کند',
    server69.includes("p === '/api/live-dashboard'")
    && server69.includes('marketBreadthTimeline(instruments, tradesByIns')
    && server69.includes('Promise.all(instruments.map(async (item)'));
  check('داشبورد دایره‌ای، میله‌ای و سه مسیر تجمعی را در کاتالوگ تصمیم نگه می‌دارد',
    ui69.includes("'breadth-donut'") && ui69.includes("'breadth-bars'")
    && ui69.includes("'breadth-pct'") && ui69.includes("'breadth-net'") && ui69.includes("'base-volume-path'"));
  check('انتخاب قرارداد دقیقاً از پایه به سررسید و سپس قرارداد می‌رود',
    ui69.includes('id="dd-underlying"') && ui69.includes('id="dd-expiry"')
    && ui69.includes('id="dd-contract"') && ui69.includes('fillSelectors'));
  check('دامنه قرارداد فقط پایه و همان قرارداد را برای ریزمعامله می‌گیرد',
    ui69.includes('`${pick.uaIns},${contract.ins}`')
    && ui69.includes('liveOptionTape({ trades: optionRows') && ui69.includes('tape ='));
  check('هر سه تب، گزینه رصد زنده موقعیت تاریخی دارند',
    backtest69.includes('id="bt-live"') && backtest69.includes('async function refreshLivePosition()')
    && history69.includes('data-history-live') && portfolio69.includes('id="pb-live-watch"'));
  const livePlan69 = historyHandoffPlan({ ua: { ins: '77' }, replay: { priced: [], startDate: 20260101, endDate: 20260102 }, live: true });
  check('نقشه انتقال، درخواست زنده را صریح و بدون کپی نتیجه حمل می‌کند', livePlan69.live === true && livePlan69.autoRun === true && !('netPnl' in livePlan69));
  check('رصد زنده، همان موتور ریزمعامله مشترک و endpoint امروز را به کار می‌گیرد',
    backtest69.includes("fetch(`/api/live-trades?ins=${encodeURIComponent(codes.join(','))}`")
    // `replayDay` همان `replayIntraday` است به‌علاوهٔ مهر تلاطم؛ هر چهار
    // مسیر درون‌روز از همین یکی رد می‌شوند تا هیچ‌کدام بی‌تلاطم نماند.
    && backtest69.includes('intraday = replayDay({ byIns }, intradayDate);')
    && /function replayDay[\s\S]*replayIntraday\(\{[\s\S]*annotateIntradayIv\(/.test(backtest69));
}

group('۷۰. مجموعه داشبورد تصمیم‌گیری و چهار دامنه');
{
  const raw70 = [
    {
      uaInsCode: '11', lval30_UA: 'اهرم', pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1000,
      strikePrice: 1000, remainedDay: 30, endDate: 20260101, contractSize: 1000,
      insCode_C: '111', lVal18AFC_C: 'ضهرم-الف', pDrCotVal_C: 120, pClosing_C: 115, priceYesterday_C: 100,
      pMeDem_C: 118, pMeOf_C: 122, qTotTran5J_C: 20, zTotTran_C: 4, qTotCap_C: 2400, oP_C: 90, yesterdayOP_C: 80,
      insCode_P: '112', lVal18AFC_P: 'طهرم-الف', pDrCotVal_P: 80, pClosing_P: 82, priceYesterday_P: 100,
      pMeDem_P: 78, pMeOf_P: 82, qTotTran5J_P: 10, zTotTran_P: 2, qTotCap_P: 800, oP_P: 70, yesterdayOP_P: 75,
    },
    {
      uaInsCode: '11', lval30_UA: 'اهرم', pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1000,
      strikePrice: 1100, remainedDay: 60, endDate: 20260201, contractSize: 1000,
      insCode_C: '113', lVal18AFC_C: 'ضهرم-ب', pDrCotVal_C: 70, pClosing_C: 72, priceYesterday_C: 70,
      pMeDem_C: 68, pMeOf_C: 72, qTotTran5J_C: 100, zTotTran_C: 20, qTotCap_C: 7000, oP_C: 120, yesterdayOP_C: 100,
      insCode_P: '114', lVal18AFC_P: 'طهرم-ب', pDrCotVal_P: 130, pClosing_P: 128, priceYesterday_P: 100,
      pMeDem_P: 128, pMeOf_P: 132, qTotTran5J_P: 50, zTotTran_P: 10, qTotCap_P: 6500, oP_P: 110, yesterdayOP_P: 90,
    },
  ];
  check('درصد آخرین نسبت به پایانی دیروز و فقط همان مبنا محاسبه می‌شود', near(pctVsYesterday(120, 100), 20));
  const snap70 = decisionDashboardSnapshot(raw70, defaults());
  check('عکس تصمیم چهار قرارداد و دو سررسید را بی‌افت نگه می‌دارد',
    snap70.contracts.length === 4 && snap70.expiries.length === 2 && snap70.marketExpiries.length === 2);
  check('رهبر ارزش کل بازار از داده واقعی و با ترتیب نزولی می‌آید',
    snap70.contracts[0].ins === '113' && snap70.contracts[0].value === 7000);
  check('تجمیع سررسید ارزش کال و پوت را جدا نگه می‌دارد',
    snap70.expiries[0].value === 13500 && snap70.expiries[0].callValue === 7000 && snap70.expiries[0].putValue === 6500);
  check('چهار دامنه بازار، پایه، سررسید و قرارداد دقیق فیلتر می‌شوند',
    dashboardScope(snap70, { level: 'market' }).contracts.length === 4
    && dashboardScope(snap70, { level: 'underlying', uaIns: '11' }).contracts.length === 4
    && dashboardScope(snap70, { level: 'expiry', uaIns: '11', endDate: '20260101' }).contracts.length === 2
    && dashboardScope(snap70, { level: 'contract', uaIns: '11', endDate: '20260101', contractIns: '112' }).contracts.length === 1);

  const ui70 = readSrc('../ui/tabs/live-market-dashboard.mjs'), app70 = readSrc('../ui/app.mjs');
  const viewCount = (name) => ((new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(ui70)?.[1] || '').match(/^\s*\['/gm) || []).length;
  check('هر سه حالت تصمیم‌گیری دقیقاً بیست جدول یا نمودار تنبل دارند',
    viewCount('pulseViews') === 20 && viewCount('liquidityViews') === 20 && viewCount('volatilityViews') === 20,
    `${viewCount('pulseViews')}/${viewCount('liquidityViews')}/${viewCount('volatilityViews')}`);
  check('دستگیره زمان، تایمر بازسازی و توقف خودکار هم‌زمان وجود دارند',
    ui70.includes('id="dd-interval" type="range"') && ui70.includes('timer = setTimeout(refresh') && ui70.includes('id="dd-pause"'));
  // سقف چهارصدردیفی برداشته شد چون دلیلش رفت: آن سقف برای روانی DOM بود،
  // وقتی جدول `innerHTML` خام می‌ساخت. جدول مشترک مجازی‌سازی‌شده است و فقط
  // ردیف‌های داخل قاب را رسم می‌کند، پس نوار کامل هم مرتب می‌شود هم صادر.
  check('نوار ریزمعامله کامل به جدول مجازی‌سازی‌شده می‌رود، نه بریده',
    ui70.includes('function tapeRows(tape)') && !ui70.includes('tape.slice(-400)'));
  // شش توکن، نه ده — و بدون چرخش. جداپذیری خودِ رنگ‌ها را نگهبان ۱۰ در
  // `tests/guards.mjs` حساب می‌کند؛ اینجا فقط مصرفشان سنجیده می‌شود.
  check('رنگ سری‌ها از توکن‌های سنجیده می‌آید و میله رتبه‌ای یک فام دارد',
    ui70.includes('var(--series-${index + 1})') && ui70.includes('length: 6')
    && ui70.includes("'var(--bar-fill)'")
    && !ui70.includes('--series:${SERIES[index % SERIES.length]}'));
  // «رهبران ارزش کل بازار» حذف شد: با جدول سورت‌پذیر، همان «تابلوی
  // قراردادها»ی مرتب بر ارزش است. رهبر هر سررسید و نگاه باز مانده‌اند،
  // چون هیچ‌کدام با مرتب‌سازی یک ستون ساخته نمی‌شوند.
  check('رهبر هر سررسید و نگاه باز درون داشبورد است',
    ui70.includes("'high-value-expiry'") && ui70.includes("'open-view-history'")
    && !app70.includes("id: 'open-view'"));
  const server70 = readSrc('../server/server.mjs');
  check('endpoint زنده عکس فشرده چهار دامنه را تحویل می‌دهد',
    server70.includes('universe: decisionDashboardSnapshot(sourceRows, S)'));
}
// ═════════ ۷۱. موقعیت باز و تغییرش، در همه سطح‌ها و بی‌ادعای دروغ ═════════
//
// گزارش کاربر: «قسمت موقعیت‌های باز هر نماد و تغییرات آن، در لحظه درست
// نمی‌باشد.» دو نقص واقعی پشت آن بود:
//
//   هیچ منبعی    `rollupQuotes` فقط `oi` را جمع می‌کرد و `oiYday` را نه، پس
//                «تغییر موقعیت باز» هر نماد اصلاً ساخته نمی‌شد.
//   جمع تجمیعی   `finishAggregate` هر دو را جمع می‌کرد ولی تفاضلشان را
//                نمی‌ساخت، پس همان ستون در هر نمای تجمیعی تهی بود.
//
// و یک تله سوم: اگر تابلو `yesterdayOP` را ندهد، `num` صفر می‌داد و تغییر
// دقیقاً برابر خودِ موقعیت باز می‌شد — یعنی «تمام تعهد این قرارداد امروز
// باز شده»، که ادعای ساختگی است (قاعده ۲-۴).
group('۷۱. موقعیت باز و تغییر آن');
{
  const row71 = (extra = {}) => ({
    uaInsCode: '11', lval30_UA: 'نمونه', pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1000,
    strikePrice: 1000, remainedDay: 30, endDate: 20260101, contractSize: 1000,
    insCode_C: '111', lVal18AFC_C: 'ضنمو-الف', pDrCotVal_C: 120, pClosing_C: 115,
    pMeDem_C: 118, pMeOf_C: 122, qTotTran5J_C: 20, zTotTran_C: 4, qTotCap_C: 2400,
    oP_C: 90, yesterdayOP_C: 80,
    insCode_P: '112', lVal18AFC_P: 'طنمو-الف', pDrCotVal_P: 80, pClosing_P: 82,
    pMeDem_P: 78, pMeOf_P: 82, qTotTran5J_P: 10, zTotTran_P: 2, qTotCap_P: 800,
    oP_P: 70, yesterdayOP_P: 75,
    ...extra,
  });

  // ——— سطح نماد ———
  const ua71 = underlyingList(buildChain([row71()]))[0];
  check('موقعیت باز دیروز هر نماد جمع می‌شود، نه فقط امروز',
    ua71.oi === 160 && ua71.oiYday === 155, `${ua71.oi} / ${ua71.oiYday}`);
  check('تغییر موقعیت باز هر نماد ساخته می‌شود',
    ua71.oiChange === 5 && near(ua71.oiChangePct, (160 / 155 - 1) * 100),
    `${ua71.oiChange} · ${uiFmt.pct(ua71.oiChangePct)}٪`);
  check('و کال و پوت تغییر خودشان را جدا دارند',
    ua71.callOiChange === 10 && ua71.putOiChange === -5);

  // ——— تابلو بی‌داده: نامعلوم، نه جهش ساختگی ———
  const gapRow = row71(); delete gapRow.yesterdayOP_C;
  const uaGap = underlyingList(buildChain([gapRow]))[0];
  check('بدون موقعیت باز دیروز، تغییرِ نماد نامعلوم می‌ماند نه برابر خودِ موقعیت باز',
    Number.isNaN(uaGap.oiChange) && Number.isNaN(uaGap.oiYday) && uaGap.oi === 160,
    `تغییر ${uiFmt.int(uaGap.oiChange)}`);
  // اگر این نبود، `oiChange` می‌شد ۱۶۰−۷۵=۸۵ و ردیف، جهش ۱۱۳٪ گزارش می‌کرد
  check('و همین تله در موتور ارزیابی هم بسته است', (() => {
    const q = (oiYday) => ({ bid: 100, bidQty: 50, ask: 110, askQty: 50, last: 105, close: 105,
      oi: 500, oiYday, vol: 10, trades: 2, value: 1e6, state: 'A', staleSec: 0,
      book: [{ level: 1, bid: 100, bidQty: 50, ask: 110, askQty: 50 }] });
    const def = byId('bull-call-spread');
    const run = (oiYday) => evaluate({
      legs: buildLegs(def, { strikes: [95000, 105000], size: 1000, days: [30] }),
      quotes: [q(400), q(oiYday)],
      ctx: { S: 100000, Sclose: 100000, days: 30, size: 1000, qty: 1, settings: defaults(), def, underlying: 'نمونه', sigmaHist: 0.6 },
    });
    return run(450).oiChange === 150 && Number.isNaN(run(NaN).oiChange);
  })());

  // ——— سطح تجمیعی داشبورد ———
  const snap71 = decisionDashboardSnapshot([row71()], defaults());
  const call71 = snap71.contracts.find((row) => row.ins === '111');
  check('هر قرارداد داشبورد تغییر موقعیت باز خودش را دارد', call71.oiChange === 10);
  check('تجمیع سررسید هم تغییر موقعیت باز می‌دهد، نه فقط جمع دو ستون',
    snap71.expiries[0].oi === 160 && snap71.expiries[0].oiYday === 155
    && snap71.expiries[0].oiChange === 5,
    `${snap71.expiries[0].oiChange}`);
  const snapGap = decisionDashboardSnapshot([gapRow], defaults());
  check('و تجمیعِ دارای خلأ، تغییرش نامعلوم است نه ناقص',
    Number.isNaN(snapGap.expiries[0].oiChange));

  // ——— جدول‌ها این ستون‌ها را نشان می‌دهند ———
  const chain71 = readSrc('../ui/tabs/chain.mjs'), dash71 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('جدول دیده‌بان ستون تغییر موقعیت باز دارد و در نمای آماده هم هست',
    /key: 'oiChange'/.test(chain71) && /'oi', 'oiChange', 'oiChangePct'/.test(chain71));
  check('هر مجموعه ستون داشبورد، تغییر موقعیت باز دارد',
    ['COLS_CONTRACT', 'COLS_UNDERLYING', 'COLS_EXPIRY', 'COLS_GROUP'].every((name) => {
      const block = new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(dash71)?.[1] || '';
      return /col\('oiChange'/.test(block);
    }));
}


// ═════════ ۷۲. جدول‌های رصد لحظه‌ای: مرتب‌شونده، صادرشونده، هم‌قد دامنه ═════════
//
// دو خواسته کاربر، یک ریشه:
//
//   «همه جدول‌های رصد لحظه‌ای قابلیت سرت کردن و خروجی اکسل داشته باشند»
//   «اطلاعاتی که از کل نماد می‌گیریم با اطلاعات یک سررسید یا یک قرارداد
//    متفاوت است — لازم نیست بیست تب شبیه هم باشند»
//
// ریشه، یک `innerHTML` خام دوازده‌ستونه بود که برای هر سطحی یک قالب داشت:
// نه مرتب می‌شد، نه خروجی داشت، و ردیف نماد پایه ستون «سررسید» می‌گرفت که
// همیشه «—» بود.
group('۷۲. جدول‌های داشبورد رصد لحظه‌ای');
{
  const dash72 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const setOf = (name) => {
    const block = new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(dash72)?.[1] || '';
    return [...block.matchAll(/col\('(\w+)'/g)].map((m) => m[1]);
  };
  const contract = setOf('COLS_CONTRACT'), underlying = setOf('COLS_UNDERLYING');
  const expiry = setOf('COLS_EXPIRY'), group = setOf('COLS_GROUP'), tape = setOf('COLS_TAPE');

  check('جدول‌ها از جدول مشترک می‌آیند، نه از innerHTML خام',
    dash72.includes("import { makeTable } from '/ui/table.mjs'")
    && !dash72.includes('<table class="history-table decision-table"')
    && !dash72.includes('<table class="history-table decision-tape"'));
  // جدول مشترک، مرتب‌سازی و انتخابگر ستون و دکمه خروجی اکسل را با هم دارد
  check('هر جدول، انتخابگر ستون و نام خروجی می‌گیرد',
    /all: cols, storeKey: `dashboard:\$\{key\}`, exportName: `dashboard-\$\{exportName\}`/.test(dash72));
  check('و نمونه هر نما نگه داشته می‌شود تا مرتب‌سازی کاربر با هر دریافت پاک نشود',
    dash72.includes('const tables = new Map()') && dash72.includes('tables.set(key, entry)'));
  // با پنهان‌کردن به‌جای جداکردن، هر querySelector روی میزبان جدولِ نمای
  // قبلی را برمی‌گرداند — این را کنترل مرورگر پیدا کرد، نه بازخوانی کد.
  check('جدول غیرفعال از DOM جدا می‌شود، نه فقط پنهان',
    dash72.includes('other.el.remove()') && !dash72.includes('other.el.hidden = true'));

  check('هر سطح دامنه مجموعه ستون خودش را دارد', new Set([
    contract.join(','), underlying.join(','), expiry.join(','), group.join(','), tape.join(','),
  ]).size === 5);
  // ستون‌هایی که فقط به یک سطح می‌خورند، به سطح دیگر نشت نکنند
  check('ستون قرارداد به ردیف نماد پایه نمی‌رود',
    contract.includes('strike') && contract.includes('kindLabel')
    && !underlying.includes('strike') && !underlying.includes('kindLabel'));
  check('ستون گروه ساختگی، قیمت و سررسید ندارد — برای یک گروه معنی نمی‌دهد',
    !group.includes('last') && !group.includes('expiryText') && !group.includes('strike'));
  check('ردیف نماد پایه ستون‌های مخصوص خودش را دارد',
    ['expiries', 'atmIvPct', 'pcRatio', 'uaValue'].every((k) => underlying.includes(k))
    && !contract.includes('atmIvPct'));
  check('ردیف سررسید، تفکیک کال و پوت و نسبت‌ها را دارد',
    ['callValue', 'putValue', 'putCallOi', 'tradedContracts'].every((k) => expiry.includes(k)));
  check('نوار ریزمعامله ستون‌های تجمعی و مرجع خودش را دارد',
    ['cumulativeVolume', 'cumulativeValue', 'basePrice', 'sequence'].every((k) => tape.includes(k)));
  // هر ستونی که اعلام می‌شود باید قالبی داشته باشد که `ui/fmt.mjs` بشناسد
  const fmts = [...dash72.matchAll(/col\('\w+', '[^']*', '(\w+)'/g)].map((m) => m[1]);
  check('قالب هر ستون داشبورد در ui/fmt.mjs تعریف شده',
    fmts.length > 0 && fmts.every((f) => typeof uiFmt[f] === 'function'),
    [...new Set(fmts.filter((f) => typeof uiFmt[f] !== 'function'))].join('، '));
}


// ═════════ ۷۳. ادغام دیده‌بان و برترین موقعیت‌ها در رصد لحظه‌ای ═════════
//
// خواسته کاربر: «تب دیده‌بان و تب برترین موقعیت‌ها را در تب رصد لحظه‌ای
// ادغام کن.» هر سه از یک عکس لحظه‌ای بازار تغذیه می‌شوند و یک کار می‌کنند:
// نگاه کلی پیش از تصمیم. سه نشانی برای یک تصمیم، یعنی کاربر باید بین سه تب
// جابه‌جا شود.
//
// ادغام یعنی یک در ورودی، نه بازنویسی دو تب کارکرده: ماژولشان دست‌نخورده
// می‌ماند و همان‌جا تنبل بار می‌شود — همان الگویی که «نگاه باز» از قبل داشت.
group('۷۳. ادغام تب‌های نگاه کلی');
{
  const app73 = readSrc('../ui/app.mjs'), dash73 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const tabLiteral = /const TABS = \[([\s\S]*?)\n\];/.exec(app73)?.[1] || '';
  check('دیده‌بان و برترین موقعیت‌ها دیگر تب مستقل نیستند',
    !/id: 'chain'/.test(tabLiteral) && !/id: 'top'/.test(tabLiteral));
  check('و رصد لحظه‌ای سر جایش مانده', /id: 'live-market'/.test(tabLiteral));
  check('هر دو به‌صورت حالت داخل همان تب اعلام شده‌اند',
    dash73.includes("{ id: 'chain', title: 'دیده‌بان زنجیره'") && dash73.includes("mod: '/ui/tabs/chain.mjs'")
    && dash73.includes("{ id: 'top', title: 'برترین موقعیت‌ها'") && dash73.includes("mod: '/ui/tabs/top.mjs'"));
  check('ماژول هر دو تنبل بار می‌شود، نه در بارگذاری تب',
    dash73.includes('const module = await import(mode.mod)'));
  // بدون نگه‌داشتن تابع برچیدن، اشتراک دیده‌بان و تایمر اسکنِ تب ادغام‌شده
  // پس از رفتن از این تب زنده می‌ماند و در پس‌زمینه درخواست می‌زند.
  check('تابع برچیدن تب ادغام‌شده نگه داشته و صدا زده می‌شود',
    dash73.includes('embedded.set(mode.id, await module.mount(host, { state, api }))')
    && dash73.includes('for (const dispose of embedded.values())'));
  check('و ادغام‌شده فقط یک بار سوار می‌شود',
    dash73.includes('if (embedded.has(mode.id)) return;'));
  // حالت ادغام‌شده نمای شماره‌دار ندارد؛ کد نباید روی آن بترکد
  check('حالت بدون نما، مسیر نمای شماره‌دار را نمی‌رود',
    dash73.includes('if (mode?.mod) { await mountEmbedded(mode); return; }')
    && dash73.includes('(modeOf()?.views || [])'));
  check('سه حالت تصمیم‌گیری هنوز بیست نما دارند',
    DASHBOARD_VIEW_COUNTS73().every((n) => n === 20), DASHBOARD_VIEW_COUNTS73().join('/'));
  function DASHBOARD_VIEW_COUNTS73() {
    return ['pulseViews', 'liquidityViews', 'volatilityViews'].map((name) =>
      ((new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(dash73)?.[1] || '').match(/^\s*\['/gm) || []).length);
  }
}


// ═════════ ۷۴. شاخص اعمال و پریمیوم وزنی، به نگاه باز برگشت ═════════
//
// گزارش کاربر: «قسمتی از تب نگاه باز که در نسخه‌های قبلی میانگین وزنی قیمت
// اعمال‌ها و نمودارهای آن و همچنین IV و نمودارهایش بود — هر چیزی که در نگاه
// باز بود را برگردان و در جای خود بگذار.»
//
// موتور این دو را از روز اول می‌ساخت (`callStrike`/`putStrike` و
// `callPremium`/`putPremium` در `aggregate`) ولی وقتی این تب روزمحور شد،
// نمودار و ستونشان جا ماند و هیچ‌جای رابط نمی‌آمدند — عددی که حساب می‌شود و
// دیده نمی‌شود.
group('۷۴. شاخص اعمال و پریمیوم وزنی نگاه باز');
{
  const expiry74 = 20240630;
  const ua74 = { ins: '1', name: 'پایه آزمایشی' };
  const contracts74 = [
    { ins: '11', name: 'کال ۱۰۰', kind: 'call', strike: 100, expiry: expiry74, size: 1000 },
    { ins: '12', name: 'کال ۱۲۰', kind: 'call', strike: 120, expiry: expiry74, size: 1000 },
    { ins: '21', name: 'پوت ۹۰', kind: 'put', strike: 90, expiry: expiry74, size: 1000 },
  ];
  // وزن‌ها عمداً نامساوی‌اند تا «وزنی» بودن از «میانگین ساده» جدا شود:
  // اعمال کال = (۱۰۰×۱۰۰ + ۱۲۰×۳۰۰) / ۴۰۰ = ۱۱۵
  const series74 = {
    1: [{ date: 20240101, close: 100, value: 1e6, vol: 1e4 }],
    11: [{ date: 20240101, close: 10, value: 100, vol: 10, trades: 2 }],
    12: [{ date: 20240101, close: 5, value: 300, vol: 30, trades: 4 }],
    21: [{ date: 20240101, close: 8, value: 200, vol: 20, trades: 3 }],
  };
  const daily74 = analyzeDailyOpenView({ ua: ua74, contracts: contracts74, seriesByIns: series74, settings: { rFree: 0.2, yearDays: 365 } });
  const row74 = daily74.rows[0];
  check('شاخص اعمال وزنی کال با وزن ارزش معامله ساخته می‌شود',
    near(row74.callStrike, 115), row74.callStrike);
  check('و فاصله‌اش از قیمت پایه، هم‌الگوی فاصله سربه‌سر است',
    near(row74.callStrikeGapPct, 15) && near(row74.putStrikeGapPct, 10),
    `${uiFmt.pct(row74.callStrikeGapPct)} / ${uiFmt.pct(row74.putStrikeGapPct)}`);
  // پریمیوم وزنی کال = (۱۰×۱۰۰ + ۵×۳۰۰) / ۴۰۰ = ۶٫۲۵ ، یعنی ۶٫۲۵٪ پایه ۱۰۰
  check('پریمیوم وزنی هم درصدی از پایه می‌گیرد، تا روزهای با پایه متفاوت مقایسه شوند',
    near(row74.callPremium, 6.25) && near(row74.callPremiumPct, 6.25) && near(row74.putPremiumPct, 8),
    `${row74.callPremium}`);

  // میانگین ۵روزه برای همین دو، مثل فاصله سربه‌سر و IV
  const flat74 = {
    1: [1, 2, 3, 4, 5].map((d) => ({ date: 20240100 + d, close: 100, value: 1000, vol: 10 })),
    11: [1, 2, 3, 4, 5].map((d) => ({ date: 20240100 + d, close: 10, value: 100, vol: 10 })),
    21: [1, 2, 3, 4, 5].map((d) => ({ date: 20240100 + d, close: 8, value: 100, vol: 10 })),
  };
  const ma74 = analyzeDailyOpenView({ ua: ua74, contracts: [contracts74[0], contracts74[2]], seriesByIns: flat74, settings: { rFree: 0.2, yearDays: 365 } });
  check('فاصله اعمال و پریمیوم، میانگین ۵روزه مستقل دارند',
    near(ma74.rows[4].callStrikeGapPctMa5, 0) && near(ma74.rows[4].putStrikeGapPctMa5, 10)
    && near(ma74.rows[4].callPremiumPctMa5, 10) && near(ma74.rows[4].putPremiumPctMa5, 8));

  // ——— و حالا واقعاً در رابط دیده می‌شوند ———
  const ov74 = readSrc('../ui/tabs/open-view.mjs');
  check('نمودار روزانه شاخص اعمال و فاصله‌اش در تب هست',
    ov74.includes("id=\"ov-daily-strike\"") && ov74.includes("id=\"ov-daily-strike-gap\"")
    && ov74.includes("chart($('ov-daily-strike')") && ov74.includes("chart($('ov-daily-strike-gap')"));
  check('نمودار روزانه پریمیوم وزنی هم هست',
    ov74.includes("id=\"ov-daily-premium\"") && ov74.includes("chart($('ov-daily-premium')"));
  check('و هر دو در جزئیات درون‌روزی هم رسم می‌شوند',
    ov74.includes("chart($('ov-day-strike')") && ov74.includes("chart($('ov-day-premium')"));
  check('جدول روزانه ستون اعمال وزنی و پریمیوم گرفت',
    ov74.includes('<th>اعمال وزنی کال / فاصله</th>') && ov74.includes('r.callStrikeGapPct')
    && ov74.includes('<th>پریمیوم وزنی کال / پوت ٪</th>'));
  // نمودار درون‌روزی، سری خط‌چینِ میانگین ۵روزه ندارد: میانگین پنج‌روزه روی
  // سطل‌های یک روز معنی ندارد.
  check('نمودار درون‌روزی میانگین ۵روزه را حمل نمی‌کند',
    ov74.includes('const SERIES_PREMIUM_INTRADAY = [SERIES_PREMIUM[0], SERIES_PREMIUM[2]]'));
  const exp74 = readSrc('../ui/open-view-export.mjs');
  check('خروجی اکسل هم ستون‌های تازه را می‌برد',
    exp74.includes('r.callStrikeGapPct') && exp74.includes('r.callPremiumPct')
    && exp74.includes("'فاصله اعمال کال ٪'"));
}


// ═════════ ۷۵. تابلوی اختیارهای پرمعامله ═════════
//
// خواسته کاربر: بخشی از داشبورد که اختیارهای پرمعامله را بدهد — سنجه‌اش را
// خود کاربر عوض کند (حجم، ارزش، …) — و برای هر سررسید میانگین وزنی سربه‌سر
// و فاصله‌اش از قیمت جاری را بدهد، با تفکیک کال، پوت و هر دو.
group('۷۵. تابلوی اختیارهای پرمعامله');
{
  const board75 = (rows, opt) => activeOptionsBoard(rows, opt);
  const c = (over) => ({ ins: '1', name: 'ض', kind: 'call', uaIns: '9', uaName: 'نمونه',
    endDate: 20260101, days: 30, strike: 1000, last: 100, spot: 1000,
    value: 1000, volume: 10, trades: 2, oi: 50, ivPct: 40, ...over });

  // ——— سربه‌سر هر قرارداد ———
  check('سربه‌سر کال، اعمال به‌علاوه پریمیوم است و پوت، اعمال منهای آن',
    contractBreakeven(c({ strike: 1000, last: 120 })) === 1120
    && contractBreakeven(c({ kind: 'put', strike: 1000, last: 120 })) === 880);
  // بدون پریمیوم اجرایی، سربه‌سر ساخته نمی‌شود (قاعده ۲-۴)
  check('بی‌پریمیوم، سربه‌سر ساخته نمی‌شود نه اینکه برابر اعمال گرفته شود',
    Number.isNaN(contractBreakeven(c({ last: 0 }))));

  // ——— فاصله، از دید همان سمت ———
  const sided = board75([c({ last: 100 }), c({ ins: '2', kind: 'put', last: 100 })]).rows;
  const callRow = sided.find((row) => row.kind === 'call'), putRow = sided.find((row) => row.kind === 'put');
  check('فاصله تا سربه‌سر از دید همان سمت خوانده می‌شود، پس هر دو مثبت‌اند',
    near(callRow.breakevenGapPct, 10) && near(putRow.breakevenGapPct, 10),
    `${uiFmt.pct(callRow.breakevenGapPct)} / ${uiFmt.pct(putRow.breakevenGapPct)}`);

  // ——— سنجه انتخابی، هم رتبه می‌دهد هم وزن ———
  const many = [
    c({ ins: 'a', strike: 1000, last: 100, value: 100, volume: 900 }),
    c({ ins: 'b', strike: 1200, last: 100, value: 900, volume: 100 }),
  ];
  check('رتبه‌بندی با سنجه انتخابی عوض می‌شود',
    board75(many, { metric: 'value' }).rows[0].ins === 'b'
    && board75(many, { metric: 'volume' }).rows[0].ins === 'a');
  // وزن شاخص هم باید همان سنجه باشد، وگرنه عددی که کاربر می‌بیند جواب
  // سؤالی نیست که پرسیده. سربه‌سر a برابر ۱۱۰۰ و b برابر ۱۳۰۰ است، پس:
  //   وزن ارزش  (۱۱۰۰×۱۰۰ + ۱۳۰۰×۹۰۰) ÷ ۱۰۰۰ = ۱۲۸۰
  //   وزن حجم   (۱۱۰۰×۹۰۰ + ۱۳۰۰×۱۰۰) ÷ ۱۰۰۰ = ۱۱۲۰
  check('وزن شاخص سربه‌سر هم همان سنجه است، نه همیشه ارزش',
    near(board75(many, { metric: 'value' }).expiries[0].callBreakeven, 1280)
    && near(board75(many, { metric: 'volume' }).expiries[0].callBreakeven, 1120),
    `${board75(many, { metric: 'volume' }).expiries[0].callBreakeven}`);
  check('سنجه ناشناخته به ارزش برمی‌گردد و نمی‌ترکد',
    board75(many, { metric: 'چیزی-که-نیست' }).metric === 'value' && BOARD_METRICS.includes('oi'));

  // ——— تفکیک سمت ———
  const mixed = [c({ ins: 'a' }), c({ ins: 'b', kind: 'put' })];
  check('تفکیک کال و پوت و هر دو، ردیف‌ها را درست فیلتر می‌کند',
    board75(mixed, { side: 'both' }).rows.length === 2
    && board75(mixed, { side: 'call' }).rows.every((row) => row.kind === 'call')
    && board75(mixed, { side: 'put' }).rows.every((row) => row.kind === 'put'));
  // در حالت «هر دو» هم شاخص هر سمت جدا می‌ماند: میانگین سربه‌سر کال و پوت
  // با هم، عددی است که هیچ قراردادی ندارد.
  const both = board75(mixed, { side: 'both' }).expiries[0];
  check('در حالت هر دو، شاخص هر سمت جدا می‌ماند',
    Number.isFinite(both.callBreakeven) && Number.isFinite(both.putBreakeven)
    && both.callBreakeven !== both.putBreakeven);
  check('باند سربه‌سر، فاصله پوت تا کال است',
    near(both.band, both.callBreakeven - both.putBreakeven)
    && near(both.bandPct, (both.band / 1000) * 100));

  // ——— گروه‌بندی سررسید ———
  // دو پایه با دو سطح قیمت کاملاً متفاوت نباید در یک شاخص سربه‌سر جمع شوند.
  const twoUa = [c({ ins: 'a', uaIns: '9', spot: 1000, strike: 1000, last: 100 }),
    c({ ins: 'b', uaIns: '8', uaName: 'دیگری', spot: 50000, strike: 50000, last: 5000 })];
  check('گروه سررسید با کلید «پایه:سررسید» ساخته می‌شود، نه فقط سررسید',
    board75(twoUa).expiries.length === 2);

  // ——— هیستوگرام فاصله از قیمت جاری ———
  const dist = moneynessDistribution([
    c({ strike: 1000, spot: 1000, value: 100 }),
    c({ kind: 'put', strike: 1120, spot: 1000, value: 300 }),
    c({ strike: 700, spot: 1000, value: 50 }),
  ], 'value');
  const atm = dist.find((b) => b.from === 0 && b.to === 5);
  const far = dist.find((b) => b.from === 10 && b.to === 20);
  check('توزیع، هر قرارداد را در سطل فاصله‌اش می‌گذارد و کال و پوت را جدا نگه می‌دارد',
    atm.call === 100 && atm.put === 0 && far.put === 300 && far.call === 0);
  check('سطل‌های بیرون از دامنه هم جا دارند',
    dist[0].total === 50 && dist.reduce((sum, b) => sum + b.total, 0) === 450);

  // ——— رابط ———
  const ui75 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const boardViews75 = (/const boardViews = \[((?:.|\n)*?)\n\];/.exec(ui75)?.[1] || '').match(/^\s*\['/gm) || [];
  check('حالت تابلو نماهای منحصر به خودش را دارد، نه رونوشت بیست‌تایی',
    boardViews75.length === 8 && ui75.includes("id: 'board'") && ui75.includes('board: true'),
    `${boardViews75.length} نما`);
  check('سنجه و تفکیک سمت، کنترل کاربر دارند و ذخیره می‌شوند',
    ui75.includes('id="dd-board-metric"') && ui75.includes('data-board-side')
    && ui75.includes("localStorage.setItem('options-radar:board-metric'")
    && ui75.includes("localStorage.setItem('options-radar:board-side'"));
  // شکل نمودار باید با سؤالش بخواند: هیستوگرام و پراکنش و میله انباشته،
  // نه اینکه همه‌چیز میله رتبه‌ای شود.
  check('نمودارهای تازه از شکل‌های متفاوت‌اند، نه همه میله رتبه‌ای',
    ui75.includes('function stackedBars(') && ui75.includes('function scatterChart(')
    && ui75.includes('moneynessDistribution(') && ui75.includes("'board-smile'"));
  check('جدول تابلو و جدول سررسید، ستون‌های خودشان را دارند',
    /const COLS_BOARD = \[/.test(ui75) && /const COLS_BOARD_EXPIRY = \[/.test(ui75)
    && ui75.includes("col('breakevenGapPct'") && ui75.includes("col('callGapPct'"));
  check('عوض‌شدن سنجه، لنگر مرتب‌سازی تابلو را هم تازه می‌کند',
    ui75.includes("if (key.startsWith('board:')) entry.table.__seeded = false"));
}


// ═════════ ۷۶. بازبینی نماهای سه حالت و سنجه‌های ساختاری ═════════
//
// خواسته کاربر: «منطق نبض و جهت بازار / نقدینگی و سررسید / تلاطم و انتظارات
// را دوباره بررسی کن و همچنین تب‌های ۲۰گانه… لازم نیست ۲۰ تب هر یک از این
// سه شبیه هم باشد، بعضی اطلاعات مناسبی نمی‌دهد… نمودارهای مختلف و متنوع
// دیگری نیز بساز.»
//
// ریشهٔ شباهت، همان سورت‌پذیر شدن جدول‌ها بود: «رهبران ارزش» و «رهبران حجم»
// وقتی جدول خام بودند دو نمای واقعی بودند؛ حالا یک جدول‌اند با دو
// مرتب‌سازی. پس تکراری‌ها رفتند و جایشان سنجه‌هایی نشست که از **ساختار**
// زنجیره می‌آیند، نه از رتبه‌بندی یک ستون.
group('۷۶. نماهای سه حالت و سنجه‌های ساختاری');
{
  const L = (over) => ({ ins: 'x', name: 'ض', kind: 'call', uaIns: '9', uaName: 'نمونه',
    endDate: 20260101, days: 30, spot: 1000, strike: 1000, last: 100,
    oi: 0, volume: 0, value: 0, ivPct: NaN, ...over });

  // ——— نردبان اعمال ———
  const ladder = strikeLadder([
    L({ strike: 900, oi: 100, volume: 10 }),
    L({ strike: 900, kind: 'put', oi: 40, volume: 4 }),
    L({ strike: 1100, kind: 'put', oi: 300, volume: 30 }),
  ]);
  check('نردبان، یک گروه به‌ازای هر پایه:سررسید می‌سازد و پله‌ها را مرتب می‌کند',
    ladder.length === 1 && ladder[0].rungs.map((r) => r.strike).join(',') === '900,1100');
  check('هر پله، کال و پوت را جدا نگه می‌دارد و نسبتشان را می‌دهد',
    ladder[0].rungs[0].callOi === 100 && ladder[0].rungs[0].putOi === 40
    && near(ladder[0].rungs[0].putCallOi, 0.4) && ladder[0].rungs[0].oi === 140);
  // پله بدون کال، نسبت پوت به کال ندارد — تقسیم بر صفر عدد نمی‌سازد
  check('پله بدون کال، نسبت نامعلوم می‌دهد نه بی‌نهایت',
    Number.isNaN(ladder[0].rungs[1].putCallOi));
  check('فاصله هر پله از قیمت جاری هم ثبت می‌شود',
    near(ladder[0].rungs[0].moneynessPct, -10) && near(ladder[0].rungs[1].moneynessPct, 10));

  // ——— بیشترین درد ———
  // اعمال ۹۰۰ با ۱۰۰ کال، اعمال ۱۱۰۰ با ۳۰۰ پوت:
  //   تسویه در ۹۰۰  → پوت‌ها ۲۰۰ در سود × ۳۰۰ = ۶۰٬۰۰۰
  //   تسویه در ۱۱۰۰ → کال‌ها ۲۰۰ در سود × ۱۰۰ = ۲۰٬۰۰۰   ← کمینه
  const pain = maxPain(strikeLadder([
    L({ strike: 900, oi: 100 }), L({ strike: 1100, kind: 'put', oi: 300 }),
  ]));
  check('بیشترین درد، کمینه ارزش ذاتی تعهد باز را پیدا می‌کند',
    pain[0].maxPain === 1100 && near(pain[0].maxPainGapPct, 10), `${pain[0].maxPain}`);
  check('و منحنی درد روی همان اعمال‌های واقعی ساخته می‌شود، نه شبکه ساختگی',
    pain[0].curve.length === 2 && pain[0].curve.map((c) => c.pain).join(',') === '60000,20000');
  check('با کمتر از دو پله تعهددار، بیشترین درد ساخته نمی‌شود',
    Number.isNaN(maxPain(strikeLadder([L({ strike: 900, oi: 100 })]))[0].maxPain));

  // ——— ساختار زمانی و چولگی ———
  const term = termStructure([
    L({ endDate: 20260101, days: 30, ivPct: 60, value: 100 }),
    L({ endDate: 20260101, days: 30, kind: 'put', ivPct: 70, value: 100 }),
    L({ endDate: 20260201, days: 60, ivPct: 40, value: 100 }),
    L({ endDate: 20260201, days: 60, kind: 'put', ivPct: 44, value: 100 }),
  ]);
  check('ساختار زمانی به‌ترتیب روز مانده مرتب می‌شود', term.map((r) => r.days).join(',') === '30,60');
  check('تلاطم هر سررسید با وزن ارزش ساخته می‌شود', near(term[0].ivPct, 65) && near(term[1].ivPct, 42));
  check('چولگی، پوت منهای کال است', near(term[0].skewPp, 10) && near(term[1].skewPp, 4));
  // قراردادی که امروز معامله نشده نباید ساختار امروز را جابه‌جا کند
  check('قرارداد بی‌گردش وارد ساختار زمانی نمی‌شود',
    termStructure([L({ ivPct: 90, value: 0 })]).length === 0);

  // ——— بازبینی نماها ———
  const ui76 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const viewsOf = (name) => [...(new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(ui76)?.[1] || '')
    .matchAll(/\['([^']+)', '[^']*', '([^']+)', '([^']+)', '([^']+)'\]/g)]
    .map((m) => ({ id: m[1], kind: m[2], source: m[3], metric: m[4] }));
  const lists = { pulseViews: viewsOf('pulseViews'), liquidityViews: viewsOf('liquidityViews'), volatilityViews: viewsOf('volatilityViews') };
  for (const [name, views] of Object.entries(lists)) {
    check(`${name} هنوز بیست نما دارد`, views.length === 20, `${views.length}`);
    // دو نما با یک شکل و یک منبع و یک سنجه، یک نما هستند — و چون جدول‌ها
    // خودشان سورت‌پذیرند، «جدول X» و «میله X» هم دیگر تفاوت واقعی نیستند.
    const signatures = views.map((view) => `${view.kind}|${view.source}|${view.metric}`);
    const duplicated = signatures.filter((sig, index) => signatures.indexOf(sig) !== index);
    check(`${name} نمای تکراری ندارد`, duplicated.length === 0, [...new Set(duplicated)].join('، '));
  }
  // تنوع شکل: هر حالت باید بیش از یک شکل نمودار داشته باشد، وگرنه همان
  // «بیست تب شبیه هم» است.
  for (const [name, views] of Object.entries(lists)) {
    check(`${name} از چند شکل نمودار استفاده می‌کند`,
      new Set(views.map((v) => v.kind)).size >= 5, [...new Set(views.map((v) => v.kind))].join('، '));
  }
  // و شکل‌های تازه واقعاً پیاده شده‌اند
  check('شکل‌های تازه ساخته شده‌اند: گرمانما، نردبان، منحنی درد، هیستوگرام، پراکنش',
    ['function heatmap(', 'function ladderChart(', 'function painCurve(', 'function histogram(', 'function scatterChart(']
      .every((needle) => ui76.includes(needle)));
  check('و هر سه حالت به سنجه‌های ساختاری وصل شده‌اند',
    ui76.includes("'max-pain'") && ui76.includes("'strike-ladder'")
    && ui76.includes("'iv-term'") && ui76.includes("'iv-skew'")
    && ui76.includes("'liquidity-heatmap'") && ui76.includes("'iv-heatmap'"));
  // گرمانما دو بُعد دسته‌ای دارد؛ رنگش باید طیف تک‌فام باشد نه رنگین‌کمان
  check('گرمانما طیف تک‌فام دارد، نه رنگین‌کمان',
    ui76.includes('color-mix(in srgb, var(--series-1)') && !/heatRainbow|hsl\(/.test(ui76));
}


// ═════════ ۷۷. انتقال در صفحهٔ تازه، نه روی صفحهٔ جاری ═════════
//
// خواسته کاربر: «وقتی با کلیک روی یک دکمه به قسمت بک‌تست سریع یا نمایش
// زنده می‌رویم یک صفحه جدید باز شود… با کلیک روی آن دکمه صفحه جاری حفظ
// شود و فعالیت جدید در صفحه جدید ظاهر شود.»
//
// نقشه دیگر از `state` این صفحه رد نمی‌شود، چون صفحهٔ تازه سند دیگری است.
// پس این گروه سه چیز را می‌سنجد: نقشه سالم از حافظه رد می‌شود، کلید
// یک‌بارمصرف است، و نبودِ حافظه به سکوت ختم نمی‌شود بلکه به مسیر قدیمی
// برمی‌گردد.
group('۷۷. انتقال در صفحهٔ تازه');
{
  const fakeStore = () => {
    const map = new Map();
    return {
      get length() { return map.size; },
      key: (i) => [...map.keys()][i] ?? null,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
      _map: map,
    };
  };

  const prevWindow = globalThis.window;
  const ls = fakeStore();
  let opened = null, openedFeatures = null;
  // مرورگر واقعی: `window.open` با `noopener` **همیشه** `null` برمی‌گرداند،
  // حتی وقتی پنجره باز شده. اولین پیاده‌سازی این را نمی‌دانست و آزمونِ
  // اولیه هم چون همیشه یک شیء برمی‌گرداند، باگ را پنهان کرد. حالا بدل هم
  // همان قاعده را دارد، پس اگر `noopener` برگردد این گروه قرمز می‌شود.
  globalThis.window = {
    localStorage: ls,
    open: (url, target, features) => {
      opened = url; openedFeatures = features || '';
      return /noopener|noreferrer/.test(openedFeatures) ? null : { closed: false };
    },
  };
  globalThis.location = { pathname: '/', search: '' };

  const plan = handoffPlan({ uaIns: '9', underlying: 'خودرو', strategy: 'استرنگل',
    legsText: 'ض + ط', __legs: [{ kind: 'call', ins: '11' }, { kind: 'put', ins: '12' }] },
  { from: 'top', units: 3 });

  const token = stashHandoff(plan);
  check('کلید ساخته می‌شود', !!token, token);
  check('نقشه در حافظه نشسته است', ls._map.size === 1, `${ls._map.size} کلید`);

  const back = takeHandoff(token);
  check('نقشه دست‌نخورده برمی‌گردد',
    back?.uaIns === '9' && back.units === 3 && back.legIns.join(',') === '11,12',
    JSON.stringify({ ua: back?.uaIns, units: back?.units }));
  // یک‌بارمصرف: نوسازی صفحه نباید همان انتقال را دوباره اجرا کند
  check('کلید پس از برداشت پاک می‌شود', ls._map.size === 0 && takeHandoff(token) === null);

  // پنجرهٔ تازه: نشانی باید تب و کلید را با هم داشته باشد
  check('باز کردن صفحهٔ تازه موفق است', openHandoffPage(plan) === true);
  // ریشهٔ باگی که کاربر دید: با `noopener` هر باز شدنِ موفق «شکست» خوانده
  // می‌شد، پس هم کلید نقشه پاک می‌شد (صفحهٔ تازه خالی بالا می‌آمد) و هم
  // مسیر جایگزین اجرا می‌شد (صفحهٔ جاری هم عوض می‌شد).
  check('پنجره با noopener باز نمی‌شود، چون آن‌وقت باز شدنش قابل تشخیص نیست',
    !/noopener|noreferrer/.test(String(openedFeatures)), String(openedFeatures));
  check('نشانی صفحهٔ تازه تب و کلید دارد', /#backtest![a-z0-9]+$/.test(String(opened)), String(opened));
  check('کلید پس از باز شدن هنوز در حافظه است تا صفحهٔ مقصد برش دارد',
    ls._map.size === 1, `${ls._map.size} کلید`);
  // شبیه‌سازی صفحهٔ مقصد: کلید را از نشانی درمی‌آورد و نقشه را برمی‌دارد
  const arrivedToken = String(opened).split('!')[1];
  const arrived = takeHandoff(arrivedToken);
  check('نقشه سالم به صفحهٔ مقصد می‌رسد',
    arrived?.strategyId === plan.strategyId && arrived.units === plan.units
    && arrived.legIns.join(',') === plan.legIns.join(','),
    JSON.stringify({ id: arrived?.strategyId, units: arrived?.units }));

  // صفحهٔ مبدأ نباید دست بخورد وقتی پنجرهٔ تازه باز شده
  const source = { handoff: null };
  let hashSet = 0;
  globalThis.location = { pathname: '/', search: '', set hash(v) { hashSet += 1; } };
  check('باز شدن صفحهٔ تازه، صفحهٔ مبدأ را عوض نمی‌کند',
    goHandoff(source, plan) === true && source.handoff === null && hashSet === 0,
    `hash ${hashSet} بار ست شد`);

  // نقشهٔ منقضی نباید بنشیند
  const stale = stashHandoff(plan);
  const staleKey = [...ls._map.keys()].find((k) => k.endsWith(stale));
  ls.setItem(staleKey, JSON.stringify({ at: Date.now() - (11 * 60 * 1000), plan }));
  check('نقشهٔ کهنه برداشته نمی‌شود', takeHandoff(stale) === null);

  // پنجره باز نشد → فراخوان باید بفهمد، نه اینکه کلیک بی‌اثر بماند
  globalThis.window.open = () => null;
  const before = ls._map.size;
  check('پنجرهٔ مسدود، شکست را اعلام می‌کند', openHandoffPage(plan) === false);
  check('کلیدِ پنجرهٔ مسدود جا نمی‌ماند', ls._map.size === before, `${ls._map.size} کلید`);

  // بدون حافظه هم نباید بترکد
  globalThis.window = { open: () => ({}) };
  check('نبود حافظه به استثنا ختم نمی‌شود', stashHandoff(plan) === '' && openHandoffPage(plan) === false);

  globalThis.window = prevWindow;
  delete globalThis.location;

  // مسیر قدیمی باید در کد بماند: اگر پنجره باز نشد، تب همین صفحه عوض شود
  const src = readSrc('../ui/handoff.mjs');
  check('برگشت به مسیر قدیمی در goHandoff هست',
    /export function goHandoff[\s\S]*openHandoffPage\(plan, tab\)[\s\S]*state\.handoff = plan;[\s\S]*location\.hash = tab;/.test(src));

  // هیچ تبی نباید مستقیم hash را برای انتقال دست بزند
  const direct = ['top', 'strategy', 'history', 'portfolio-backtest']
    .filter((name) => /location\.hash *= *'backtest'/.test(readSrc(`../ui/tabs/${name}.mjs`)));
  check('هیچ تبی دیگر مستقیم به بک‌تست پرش نمی‌کند', direct.length === 0, direct.join('، '));

  // مسیریاب باید شکل «تب!کلید» را بشناسد و کلید را از نشانی پاک کند
  const app = readSrc('../ui/app.mjs');
  check('مسیریاب کلید را از نشانی جدا می‌کند', /const at = text\.indexOf\('!'\)/.test(app));
  check('مسیریاب کلید را از نشانی پاک می‌کند', /history\.replaceState\(null, '', `\$\{location\.pathname\}\$\{location\.search\}#\$\{route\.id\}`\)/.test(app));
}

// ═════════ ۷۸. تلاطم ضمنی هر پا، در هر سه تایم‌فریم ═════════
//
// خواسته کاربر: «در جداول ارزش… تلاطم ضمنی هر پایه نیز آورده شود… چه
// کوچک‌ترین و ریزترین تایم‌فریم چه بزرگ‌ترین تایم‌فریم… همچنین پارامترهای
// محاسبهٔ آن قابل تنظیم باشند.»
//
// دو ادعای غیربدیهی اینجا سنجیده می‌شود: روز مانده تا سررسید **هر پا**
// جداست (وگرنه استراتژی تقویمی عددِ قابل‌قبولِ غلط می‌سازد و هیچ‌جا NaN
// نمی‌شود)، و هر ورودیِ نبوده خروجی را NaN می‌کند نه صفر.
group('۷۸. تلاطم ضمنی هر پا در بک‌تست سریع');
{
  const P = ivParams({ rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, dayCountYear: 365 });
  check('پارامترها از تنظیمات سراسری می‌آیند',
    P.rFree === 0.3 && P.yearDays === 365 && P.ivHi === 5, JSON.stringify(P));
  const over = ivParams({ rFree: 0.3, dayCountYear: 365, ivLo: 0.01, ivHi: 5, divYield: 0 }, { rFree: 0.18 });
  check('بازنویسی موضعی روی تنظیمات سراسری می‌نشیند',
    over.rFree === 0.18 && over.yearDays === 365, `${over.rFree}`);
  check('کاتالوگ پارامتر همان کلیدهایی را دارد که محاسبه می‌خواند',
    IV_PARAMS.map((x) => x.key).join(',') === 'rFree,divYield,ivLo,ivHi,yearDays');

  // رفت‌وبرگشت: قیمتی که خودِ بلک-شولز با σ ساخته، باید همان σ را پس بدهد
  const nearCall = { kind: 'call', strike: 11000, expiry: 20260401 };
  const farCall = { kind: 'call', strike: 11000, expiry: 20260701 };
  const observed = 20260101;
  const dNear = legDaysToExpiry(nearCall, observed);
  const dFar = legDaysToExpiry(farCall, observed);
  check('روز تا سررسید هر پا از سررسید خودش می‌آید', dNear === 90 && dFar === 181, `${dNear} و ${dFar}`);
  const priceNear = bsPrice('call', 10000, 11000, dNear / 365, 0.3, 0, 0.65);
  check('تلاطم برگشتی همان تلاطم ساخت است',
    near(legIvPct(nearCall, { spot: 10000, price: priceNear, days: dNear }, P), 65, 1e-4));

  // همان قیمت روی پای دورتر، تلاطم دیگری است. اگر روز پا جدا نشود، این دو
  // یکی می‌شوند و خطا بی‌صدا می‌ماند.
  const ivFarSamePrice = legIvPct(farCall, { spot: 10000, price: priceNear, days: dFar }, P);
  check('پای دورتر با همان قیمت، تلاطم کمتری دارد',
    Number.isFinite(ivFarSamePrice) && ivFarSamePrice < 65, `${ivFarSamePrice.toFixed(2)}٪`);

  // ——— قاعدهٔ ۲-۴: نبود، صفر نیست ———
  check('پای سهم پایه تلاطم ضمنی ندارد',
    Number.isNaN(legIvPct({ kind: 'underlying', strike: 0 }, { spot: 1, price: 1, days: 30 }, P)));
  check('بی‌قیمت، تلاطم ندارد', Number.isNaN(legIvPct(nearCall, { spot: 10000, price: NaN, days: 90 }, P)));
  check('بی‌قیمتِ پایه، تلاطم ندارد', Number.isNaN(legIvPct(nearCall, { spot: NaN, price: 100, days: 90 }, P)));
  check('روز سررسید، تلاطم ندارد', Number.isNaN(legIvPct(nearCall, { spot: 10000, price: 100, days: 0 }, P)));
  check('سررسید نامعلوم یعنی روز نامعلوم', Number.isNaN(legDaysToExpiry({ kind: 'call' }, observed)));

  // ——— فهرست پاها: جای هر پا محفوظ می‌ماند ———
  const legs = [nearCall, { kind: 'underlying', strike: 0 }, farCall];
  const list = legIvList(legs, { spot: 10000, prices: [priceNear, 10000, priceNear], date: observed }, P);
  check('فهرست تلاطم هم‌اندازه و هم‌ترتیب پاهاست', list.length === 3 && Number.isNaN(list[1]),
    list.map((v) => (Number.isFinite(v) ? v.toFixed(1) : '—')).join('، '));
  check('میانگین فقط روی پاهای دارای تلاطم است',
    near(meanIvPct(list), (list[0] + list[2]) / 2, 1e-9));

  // ——— مهر خوردن روی هر سه تایم‌فریم ———
  const priced = [nearCall, farCall];
  const replay = { ok: true, priced, rows: [
    { date: observed, status: 'ok', baseClose: 10000, perLeg: [{ exitPrice: priceNear }, { exitPrice: priceNear }] },
    { date: observed, status: 'missing', baseClose: NaN, perLeg: [{ exitPrice: NaN }, { exitPrice: NaN }] },
  ] };
  annotateDailyIv(replay, P);
  check('مسیر روزانه مهر تلاطم می‌خورد',
    near(replay.rows[0].perLeg[0].ivPct, 65, 1e-4) && replay.rows[0].legIvPct.length === 2);
  check('ردیف بی‌داده، تلاطم جعلی نمی‌گیرد',
    replay.rows[1].legIvPct.every((v) => Number.isNaN(v)) && Number.isNaN(replay.rows[1].meanIvPct));

  const points = [{ second: 34200, basePrice: 10000, perLeg: [{ exitPrice: priceNear }, { exitPrice: priceNear }] }];
  annotateIntradayIv(points, { legs: priced, date: observed }, P);
  check('بازپخش درون‌روز مهر تلاطم می‌خورد', near(points[0].perLeg[0].ivPct, 65, 1e-4));

  // هر سطل تاریخ خودش را دارد؛ سطلی که سه ماه جلوتر است نباید با روزِ سطل
  // اول حساب شود.
  const buckets = [
    { date: observed, basePrice: 10000, perLeg: [{ price: priceNear }, { price: priceNear }] },
    { date: 20260301, basePrice: 10000, perLeg: [{ price: priceNear }, { price: priceNear }] },
  ];
  annotateBucketIv(buckets, { legs: priced }, P);
  check('هر سطل با تاریخ خودش حساب می‌شود',
    Number.isFinite(buckets[0].perLeg[0].ivPct) && Number.isFinite(buckets[1].perLeg[0].ivPct)
    && buckets[0].perLeg[0].ivPct !== buckets[1].perLeg[0].ivPct,
    `${buckets[0].perLeg[0].ivPct.toFixed(1)}٪ در برابر ${buckets[1].perLeg[0].ivPct.toFixed(1)}٪`);

  // ——— خلاصه ———
  const sum = ivSummary([60, NaN, 70, 50]);
  check('خلاصه، نقاط بی‌تلاطم را جدا می‌شمارد و در آمار نمی‌آورد',
    sum.samples === 3 && sum.gaps === 1 && sum.min === 50 && sum.max === 70 && sum.mean === 60 && sum.changePp === -10);
  check('خلاصهٔ بی‌مشاهده عدد نمی‌سازد',
    ivSummary([NaN, NaN]).samples === 0 && Number.isNaN(ivSummary([NaN, NaN]).mean));

  // ——— رابط: هر سه تایم‌فریم و فرم پارامتر ———
  const bt78 = readSrc('../ui/tabs/backtest.mjs');
  check('هر سه تایم‌فریم مهر تلاطم می‌خورند',
    bt78.includes('annotateDailyIv(replay, ivP())')
    && bt78.includes('annotateIntradayIv(points, { legs: replay.priced, date }, ivP())')
    && bt78.includes('annotateBucketIv(buckets, { legs: replay.priced }, ivP())'));
  check('پارامترها در خود تب قابل تنظیم‌اند',
    bt78.includes("data-iv-param=") && bt78.includes("id=\"bt-iv-reset\"") && bt78.includes('reapplyIv()'));
  // خانهٔ خالی یعنی «تنظیمات سراسری»، نه صفر
  check('خانهٔ خالی پارامتر، بازنویسی را برمی‌دارد',
    /if \(raw === ''\) delete ivOverride\[field\.dataset\.ivParam\];/.test(bt78));
  // فرم نباید در هر رنگ‌آمیزی از نو ساخته شود، وگرنه فوکوس وسط تایپ می‌پرد
  check('فرم پارامتر یک‌بار ساخته می‌شود', /if \(host\.children\.length\) return;/.test(bt78));
  check('جدول‌های هر سه تایم‌فریم ستون تلاطم دارند',
    (bt78.match(/ivCell\(/g) || []).length >= 5, `${(bt78.match(/ivCell\(/g) || []).length} خانه`);
  check('نبودِ تلاطم در جدول «—» می‌ماند',
    /const ivCell = \(value\) => \(Number\.isFinite\(value\) \? `\$\{fmt\.pct\(value\)\}٪` : '—'\);/.test(bt78));
}

// ═════════ ۷۹. خروجی اکسل جامع گام سوم ═════════
//
// خواسته کاربر: «دکمه دریافت فایل اکسل نیز نمایش داده شود و اطلاعات کامل و
// جامع از تمامی اطلاعات آن استراتژی در فایل اکسل قرار داده شود و هیچ
// اطلاعاتی جا نیفتد… چه مدت در سود چه مدت در زیان، رفتار هر بازه از روز،
// یونانی‌های این استراتژی در طول زمان، تلاطم ضمنی پاها در طول زمان.»
group('۷۹. خروجی اکسل جامع بک‌تست');
{
  // ——— قالب مشترک دفترکار ———
  check('عددِ نبوده خانهٔ خالی می‌شود، نه صفر و نه NaN',
    wbCell(NaN).includes('ss:Type="String"') && !wbCell(NaN).includes('NaN'), wbCell(NaN));
  check('عدد، عدد می‌ماند تا اکسل جمعش بزند', wbCell(12.5).includes('ss:Type="Number"'));
  check('نشانهٔ جهت‌دهی از خانه پاک می‌شود', !wbCell('⁦ضهرم⁩').includes('⁦'));
  check('نویسهٔ XML فرار داده می‌شود', wbCell('a<b&c').includes('a&lt;b&amp;c'));
  // بیش از ۶۰ هزار ردیف باید بین چند برگ پخش شود، نه بی‌صدا بیفتد
  const many = Array.from({ length: 60001 }, (_, i) => [i]);
  check('داده بلندتر از سقف برگ، بین چند برگ پخش می‌شود', wbParts('نمونه', ['x'], many).length === 2);
  check('برگ بی‌ردیف هم یک برگ می‌سازد', wbParts('نمونه', ['x'], []).length === 1);
  check('دفترکار یک Workbook معتبر است',
    wbWrap([wbSheet('a', ['h'], [[1]])]).startsWith('<?xml') && wbWrap([]).includes('</Workbook>'));

  // ——— یونانی‌ها در طول زمان ———
  const gLeg = { kind: 'call', strike: 11000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000 };
  const gPrice = bsPrice('call', 10000, 11000, 90 / 365, 0.3, 0, 0.65);
  const gParams = { rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, yearDays: 365 };
  const g = positionGreeksAt([gLeg], { spot: 10000, prices: [gPrice], date: 20260101 }, gParams);
  check('یونانی موقعیت از تلاطم ضمنی خود پا می‌آید',
    Number.isFinite(g.delta) && g.delta > 0 && g.incomplete === false, `دلتا ${g.delta.toFixed(1)}`);
  // پایی که تلاطم ندارد، جمع را ناقص می‌کند — و باید بگوید
  const g2 = positionGreeksAt([gLeg, { kind: 'put', strike: 9000, expiry: 20260401, side: 'sell', ratio: 1, size: 1000 }],
    { spot: 10000, prices: [gPrice, NaN], date: 20260101 }, gParams);
  check('پای بی‌تلاطم، جمع یونانی را «ناقص» علامت می‌زند', g2.incomplete === true);

  // ——— دفترکار کامل از دادهٔ ساختگی ———
  const priced = [
    { ins: '11', name: 'ضنمونه۱', kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 11000, expiry: 20260401, price: 500, days: 90 },
    { ins: '12', name: 'طنمونه۱', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 9000, expiry: 20260401, price: 300, days: 90 },
  ];
  const mkDay = (date, ok = true) => ({
    date, dateLabel: '', dayName: 'شنبه', holdingDays: 1, daysToExpiry: 89,
    status: ok ? 'ok' : 'missing', baseClose: ok ? 10000 : NaN,
    baseDailyPct: 1, baseCumulativePct: 2, baseVolume: 10, baseValue: 20,
    grossPnl: 100, entryFee: 1, exitFee: 1, totalFees: 2, netPnl: 98, pnlDelta: 3, returnPct: 4, drawdown: -1,
    margin: 5, marginNet: 6, conditionalMargin: 7,
    perLeg: [
      { exitPrice: ok ? gPrice : NaN, entryPrice: 500, grossPnl: 10, netPnl: 9, entryFee: 1, exitFee: 0, pnlDelta: 1, volume: 3, trades: 2, value: 4 },
      { exitPrice: ok ? 250 : NaN, entryPrice: 300, grossPnl: 5, netPnl: 4, entryFee: 1, exitFee: 0, pnlDelta: 1, volume: 3, trades: 2, value: 4 },
    ],
  });
  const replay79 = {
    ok: true, startDate: 20260101, endDate: 20260110, expiry: 20260401,
    entryBasis: 'LAST', exitBasis: 'LAST', priced,
    entry: { gross: 1, fee: 2, netCash: 3, cashPaid: 4, cashReceived: 5,
      capital: { value: 1000, label: 'وجه تضمین' }, margin: { marginNet: 9 }, payoff: { maxLoss: -5, maxProfit: 7 } },
    rows: [mkDay(20260101), mkDay(20260102), mkDay(20260103, false)],
    summary: { validDays: 2, missingDays: 1, positiveDays: 2, negativeDays: 0, flatDays: 0,
      best: { date: 20260101, netPnl: 98 }, worst: { date: 20260102, netPnl: 98 },
      last: { netPnl: 98, returnPct: 4 }, firstProfit: { date: 20260101, holdingDays: 0 } },
  };
  annotateDailyIv(replay79, gParams);
  annotateDailyGreeks(replay79, gParams);
  check('مسیر روزانه پیش از خروجی، هم تلاطم دارد هم یونانی',
    Number.isFinite(replay79.rows[0].perLeg[0].ivPct) && Number.isFinite(replay79.rows[0].greeks.delta));

  const buckets79 = [{ date: 20260101, startSecond: 34200, endSecond: 35100, observations: 2, seconds: 900,
    openPnl: 1, closePnl: 2, highPnl: 3, lowPnl: 0, changePnl: 1, stepPnl: NaN,
    openReturnPct: 1, returnPct: 2, basePrice: 10000, basePct: 1, volume: 5, trades: 2,
    baseVolume: 3, freshPct: 100, maxAgeSec: 10,
    perLeg: [{ price: gPrice, priceChange: 1, netPnl: 2, changePnl: 1, cumulativeVolume: 4, tradeCount: 2, ageSec: 3 },
      { price: 250, priceChange: 1, netPnl: 2, changePnl: 1, cumulativeVolume: 4, tradeCount: 2, ageSec: 3 }] }];
  annotateBucketIv(buckets79, { legs: priced }, gParams);
  const intraday79 = [{ second: 34200, timeLabel: '09:30:00', netPnl: 5, returnPct: 1, basePrice: 10000, basePct: 1,
    eventVolume: 2, eventTrades: 1, cumulativeVolume: 2, baseSecondVolume: 1, baseCumulativeVolume: 1, baseAgeSec: 0,
    activeLegs: 2, maxAgeSec: 4, allFresh: true,
    perLeg: [{ exitPrice: gPrice, pricePct: 1, netPnl: 2, grossPnl: 3, entryFee: 1, exitFee: 0, secondVolume: 1, cumulativeVolume: 2, tradeCount: 1, lastTradeSecond: 34200, ageSec: 0, observedNow: true },
      { exitPrice: 250, pricePct: 1, netPnl: 2, grossPnl: 3, entryFee: 1, exitFee: 0, secondVolume: 1, cumulativeVolume: 2, tradeCount: 1, lastTradeSecond: 34200, ageSec: 0, observedNow: true }] }];
  annotateIntradayIv(intraday79, { legs: priced, date: 20260101 }, gParams);

  const xml79 = buildBacktestWorkbook({
    ua: { ins: '9', name: 'نمونه' }, strategyName: 'استرنگل', comboName: 'ض + ط',
    replay: replay79, intraday: intraday79, buckets: buckets79, params: gParams,
    holding: { days: [{ date: 20260101, points: 2, firstSecond: 34200, lastSecond: 35100, observedSeconds: 900,
      positiveSeconds: 600, negativeSeconds: 300, flatSeconds: 0, positivePct: 66.7,
      openPnl: 1, closePnl: 2, changePnl: 1, bestPnl: 3, worstPnl: 0, closeReturnPct: 1, basePct: 1, volume: 5 }],
      observedSeconds: 900, positiveSeconds: 600, negativeSeconds: 300, flatSeconds: 0,
      positivePct: 66.7, negativePct: 33.3, positiveDays: 1, negativeDays: 0, dayCount: 1 },
    timeOfDay: [{ startSecond: 34200, endSecond: 36000, days: 2, upDays: 1, downDays: 1, flatDays: 0,
      meanChange: 1, medianChange: 1, upPct: 50, consistencyPct: 50, meanVolume: 4 }],
    entryExit: { cells: [{ entrySecond: 34200, exitSecond: 36000, samples: 2, meanPnl: 1, medianPnl: 1, winPct: 50, bestPnl: 2, worstPnl: 0 }],
      entries: [{ second: 34200, pairs: 1, samples: 2, medianPnl: 1, meanPnl: 1, winPct: 50 }],
      exits: [{ second: 36000, pairs: 1, samples: 2, medianPnl: 1, meanPnl: 1, winPct: 50 }] },
    timeframeSeconds: 900, intradayDate: 20260101, generatedAt: 'نمونه',
  });

  // دفترکار حالا فهرست توصیف برگ است نه یک رشتهٔ XML: `buildBacktestWorkbook`
  // داده را می‌سازد و `ui/xlsx.mjs` آن را به فایل تبدیل می‌کند. آزمون هم
  // باید همان داده را بسنجد، نه قالبِ روزِ ساختش را.
  const sheetNames = xml79.map((part) => part.name);
  const flat = (parts) => parts.map((part) => [part.name, ...part.headers,
    ...part.rows.map((row) => row.join(' '))].join(' ')).join(' ');
  const text79 = flat(xml79);
  // هر واحد تحلیلی برگ خودش را دارد؛ خواستهٔ «هیچ اطلاعاتی جا نیفتد»
  for (const want of ['سرشناسه', 'راهنما', 'شاخص کل بازه', 'پاهای ورود', 'مسیر روزانه', 'روز × پا',
    'سطل تایم‌فریم', 'سطل × پا', 'مدت در سود و زیان', 'رفتار بازه‌های روز',
    'ورود × خروج', 'بهترین ساعت', 'نوار درون‌روز', 'درون‌روز × پا', 'خلاصه تلاطم']) {
    check(`برگ «${want}» در فایل هست`, sheetNames.includes(want), sheetNames.length ? '' : 'هیچ برگی نیست');
  }
  check('برگ تکراری ساخته نمی‌شود', new Set(sheetNames).size === sheetNames.length, sheetNames.join('، '));
  check('یونانی‌ها ستون خودشان را دارند',
    ['دلتا', 'گاما', 'وگا', 'تتا', 'رو'].every((g2n) => text79.includes(g2n)));
  check('تلاطم پاها در طول زمان در فایل هست', text79.includes('تلاطم ضمنی ٪'));
  check('پارامترهای محاسبه در سرشناسه ثبت می‌شوند',
    text79.includes('نرخ بدون ریسک سالانه') && text79.includes('روز سال — مخرج زمان'));
  check('ردیف فاقد داده هم در فایل می‌آید، با خانهٔ خالی',
    (text79.match(/فاقد داده/g) || []).length >= 1);
  // هویت ثابت پا یک بار نوشته می‌شود، ولی از فایل بیرون نمی‌رود
  const entryLegs79 = xml79.find((part) => part.name === 'پاهای ورود');
  check('هویت کامل هر پا در برگ پاهای ورود هست',
    ['نوع', 'جهت', 'نسبت', 'اندازه قرارداد', 'قیمت اعمال', 'سررسید'].every((h) => entryLegs79.headers.includes(h)),
    entryLegs79.headers.join('، '));
  const tick79 = xml79.find((part) => part.name === 'درون‌روز × پا');
  check('برگ پرحجم فقط با شمارهٔ پا به آن ارجاع می‌دهد',
    tick79.headers.includes('شماره پا') && !tick79.headers.includes('قیمت اعمال'),
    tick79.headers.join('، '));

  // برگی که داده ندارد نباید ساخته شود: برگ خالی از نبودِ برگ بدتر است
  const bare = buildBacktestWorkbook({ ua: { name: 'x' }, replay: replay79, params: gParams });
  const bareNames = bare.map((part) => part.name);
  check('برگ بی‌داده ساخته نمی‌شود',
    !bareNames.includes('سطل تایم‌فریم') && !bareNames.includes('نوار درون‌روز') && bareNames.includes('مسیر روزانه'),
    bareNames.join('، '));

  // ——— رابط: دکمه فقط پس از تحلیل ———
  const bt79 = readSrc('../ui/tabs/backtest.mjs');
  check('دکمهٔ اکسل کنار «تحلیل کل بازه» است',
    bt79.includes('id="bt-tf-export"') && bt79.includes('تحلیل کل بازه'));
  check('دکمه تا پیش از تحلیل پنهان است',
    /id="bt-tf-export" hidden/.test(bt79) && bt79.includes("$('bt-tf-export').hidden = false;"));
  check('باطل‌شدن تحلیل، دکمه را دوباره پنهان می‌کند',
    (bt79.match(/\$\('bt-tf-export'\)\.hidden = true;/g) || []).length >= 2);
  check('خروجی، همان موتورهای مشترک را صدا می‌زند',
    bt79.includes('intradayHoldingSummary(timeframeDays)')
    && bt79.includes('timeOfDayProfile(timeframeDays')
    && bt79.includes('intradayEntryExitProfile(timeframeDays'));

  // دو نسخه از قالب دفترکار نداشته باشیم
  const ovSrc = readSrc('../ui/open-view-export.mjs');
  check('قالب دفترکار یک پیاده‌سازی دارد',
    ovSrc.includes("from './workbook.mjs'") && !/^function sheet\(/m.test(ovSrc));
}

// ═════════ ۸۰. سورت و جابه‌جایی ستون روی همهٔ جدول‌ها ═════════
//
// خواسته کاربر: «هر جدولی در برنامه قابلیت sort داشته باشد و drag.»
//
// چهل‌وشش جدول با رشتهٔ قالبی ساخته می‌شوند و بازنویسی همه روی `makeTable`
// یعنی برای هر کدام قرارداد ستون و قالب و کلیک ردیف را از نو سوار کردن —
// کاری بزرگ با ریسک رگرسیون بالا برای دو رفتار کاملاً عمومی. پس رفتار روی
// جدولِ رسم‌شده می‌نشیند، همان الگویی که `attachExportsIn` دارد.
group('۸۰. سورت و جابه‌جایی ستون جدول‌های رشته‌ای');
{
  // ——— مقدار خانه ———
  check('رقم فارسی عدد خوانده می‌شود', enhanceCellValue({ textContent: '۱٬۲۳۴' }).num === 1234);
  check('اولین عدد ملاک است، نه تکهٔ دوم خانه',
    enhanceCellValue({ textContent: '۱٬۰۰۰ اثر ۵۰٪' }).num === 1000);
  check('عدد منفی و اعشاری خوانده می‌شود', enhanceCellValue({ textContent: '-۱۲٫۵' }).num === -12.5);
  check('خانهٔ «—» بی‌مقدار است، نه صفر',
    enhanceCellValue({ textContent: '—' }).empty === true && enhanceCellValue({ textContent: '' }).empty === true);
  check('متن بی‌عدد، متن می‌ماند',
    enhanceCellValue({ textContent: 'معتبر' }).text === 'معتبر' && Number.isNaN(enhanceCellValue({ textContent: 'معتبر' }).num));
  check('نشانهٔ جهت‌دهی مقدار را خراب نمی‌کند', enhanceCellValue({ textContent: '⁦۱۲⁩' }).num === 12);

  // ——— جابه‌جایی ستون، هم‌معنی با جدول مجازی‌سازی‌شده ———
  // اگر این دو یکی نباشند، کشیدن ستون در دو جور جدول دو نتیجه می‌دهد.
  const keys = ['a', 'b', 'c', 'd'];
  for (const [from, to] of [[0, 2], [3, 0], [1, 1], [2, 3]]) {
    const byIndex = enhanceMoveTo([0, 1, 2, 3], from, to).map((at) => keys[at]);
    const byKey = moveColumn(keys, keys[from], keys[to]);
    check(`جابه‌جایی ${from}→${to} با جدول مجازی‌سازی‌شده یکی است`,
      byIndex.join('') === byKey.join(''), `${byIndex.join('')} / ${byKey.join('')}`);
  }

  // ——— ماژول: قواعدی که نباید بی‌صدا عوض شوند ———
  const enh = readSrc('../ui/table-enhance.mjs');
  check('جدول مجازی‌سازی‌شده دوباره ارتقا نمی‌گیرد', enh.includes("table.closest('.tbl-wrap')"));
  check('سرستون چندسطری و خانهٔ ادغام‌شده کنار گذاشته می‌شود',
    enh.includes('heads.length !== 1') && enh.includes('c.colSpan > 1 || c.rowSpan > 1'));
  check('ماتریس متقارن ستون جابه‌جا نمی‌کند ولی سورت می‌شود',
    /const isMatrix = /.test(enh) && enh.includes('fresh && !isMatrix(table)') && enh.includes('isMatrix(hit.table)'));
  check('سورت سه حالت دارد تا ترتیب اولیه برگردد',
    enh.includes("const dir = now === 'descending' ? 1 : now === 'ascending' ? 0 : -1;"));
  check('مرتب‌سازی پایدار است', enh.includes('(a.at - b.at)'));
  check('بی‌مقدار همیشه ته می‌نشیند، در هر دو جهت',
    /if \(a\.empty\) return 1;[\s\S]*if \(b\.empty\) return -1;/.test(enh));
  check('ترتیب ستون در حافظهٔ مرورگر می‌ماند', enh.includes("const STORE = 'options-radar:cols:'"));
  check('کلید ترتیب، نام سرستون‌ها را هم در خود دارد',
    /const heads = \[\.\.\.table\.querySelectorAll\('thead th'\)\]\.map\(\(c\) => c\.textContent\.trim\(\)\)\.join\('\|'\)/.test(enh));
  check('نبود حافظه به استثنا ختم نمی‌شود',
    /const store = \(\) => \{ try \{ return window\.localStorage; \} catch \{ return null; \} \};/.test(enh));
  // شنونده روی ریشه می‌نشیند نه روی جدول: جدول با هر به‌روزرسانی نو می‌شود
  check('شنونده واگذارشده است، نه روی تک‌تک جدول‌ها',
    enh.includes("root.addEventListener('click', onClick)") && enh.includes('new MutationObserver'));
  check('صفحه‌کلید هم مرتب می‌کند', enh.includes("event.key !== 'Enter' && event.key !== ' '"));

  // ——— نصب یک‌باره در پوستهٔ برنامه ———
  const app80 = readSrc('../ui/app.mjs');
  check('پوستهٔ برنامه یک‌بار نصبش می‌کند', app80.includes("installTableEnhance(el('stage'))"));

  // ——— نشانگر جهت با ::after می‌آید، نه داخل متن خانه ———
  const css80 = readSrc('../ui/style.css');
  check('نشانگر جهت متن سرستون را آلوده نمی‌کند',
    css80.includes('th[aria-sort="ascending"]::after') && css80.includes('th[aria-sort="descending"]::after'));
  check('ستون در حال کشیدن و مقصد، نشانهٔ دیداری دارند',
    css80.includes('th.th-dragging') && css80.includes('th.th-drop'));
}

// ═════════ ۸۱. نویسندهٔ xlsx و حجم فایل ═════════
//
// خواسته کاربر: «خروجی اکسل گام سوم خیلی خوب و جامع است اما حجمش خیلی بالاست
// و نزدیک ۳۰ مگابایت… طوری اصلاحش کن که حجمش خیلی کمتر بشه.»
//
// پس آزمون باید خودِ حجم را بسنجد، نه اینکه «قالب عوض شد» را. عدد مقایسه
// از همان داده در قالب قبلی می‌آید تا نسبت، ادعای این کامیت را ثابت کند.
group('۸۱. نویسندهٔ xlsx و حجم فایل');
{
  check('دم ممیز شناور چیده می‌شود', xTidy(0.1 + 0.2) === 0.3, String(0.1 + 0.2));
  check('عددِ نبوده، عددِ نبوده می‌ماند', Number.isNaN(xTidy(NaN)));
  check('منفی صفر، صفر می‌شود', Object.is(xTidy(-0), 0));
  check('نام ستون از A تا BA درست است',
    ['A', 'Z', 'AA', 'AB', 'BA'].every((want, i) => xCol([0, 25, 26, 27, 52][i]) === want));

  const used81 = new Set();
  check('نام برگ تکراری شماره می‌گیرد',
    xSheetName('سطل', used81) === 'سطل' && xSheetName('سطل', used81) === 'سطل 2');
  check('نام برگ از ۳۱ نویسه بلندتر نمی‌شود', xSheetName('ب'.repeat(60), new Set()).length === 31);
  check('نویسهٔ ممنوع اکسل از نام برگ می‌رود', !xSheetName('a/b:c*d', new Set()).match(/[/:*]/));

  // CRC32 با مقدار شناخته‌شدهٔ «123456789» = 0xCBF43926
  check('CRC32 با مقدار مرجع می‌خواند',
    xCrc(new TextEncoder().encode('123456789')) === 0xCBF43926,
    xCrc(new TextEncoder().encode('123456789')).toString(16));

  const rows81 = Array.from({ length: 3000 }, (_, i) => ['۰۹:۰۰:۰۱', 'اختیار خرید ضهرم۷۰۵۸', i * 1.0000001, NaN, i]);
  const head81 = ['زمان', 'نام پا', 'اثر', 'تلاطم', 'حجم'];
  const bytes81 = await buildXlsx([xSheet('برگ', head81, rows81)]);
  const old81 = new TextEncoder().encode(wbWrap([wbSheet('برگ', head81, rows81)])).length;

  check('فایل یک بستهٔ zip معتبر است',
    bytes81[0] === 0x50 && bytes81[1] === 0x4B && bytes81[2] === 0x03 && bytes81[3] === 0x04);
  check('پایان‌نگارهٔ فهرست مرکزی در فایل هست',
    [...bytes81.slice(-22, -18)].join(',') === '80,75,5,6');
  // ادعای این کامیت: چند برابر کوچک‌تر، نه چند درصد
  check('فایل دست‌کم پنج برابر از قالب قبلی کوچک‌تر است',
    old81 / bytes81.length >= 5, `${(old81 / bytes81.length).toFixed(1)} برابر`);

  // خانهٔ خالی نباید نوشته شود — قاعدهٔ ۲-۴ تا داخل فایل
  const one81 = await buildXlsx([xSheet('یک', ['الف', 'ب'], [['متن', NaN]])]);
  const text81 = new TextDecoder().decode(one81);
  check('خانهٔ عددِ نبوده اصلاً نوشته نمی‌شود', !text81.includes('NaN'));

  // یک برگ بدون فشرده‌سازی هم باید سالم بسته شود
  const noPack = await xZip([{ name: 'a.txt', data: 'x' }]);
  check('بسته با یک عضو هم درست بسته می‌شود', noPack.length > 22 && noPack[0] === 0x50);

  // ——— مسیر پشتیبانِ فشرده‌سازی ———
  //
  // رگرسیون یک باگ واقعی: `deflate-raw` تازه است — نود از ۲۱٫۲ داردش،
  // فایرفاکس از ۱۱۳، سافاری از ۱۶٫۴. روی هر چیزی قدیمی‌تر استثنا می‌داد و
  // کل فایل بی‌فشرده نوشته می‌شد. CI که روی نود ۱۸ می‌ایستد همین را گرفت:
  // به‌جای پانزده برابر، دو برابر.
  //
  // آزمون سکوی قدیمی را **شبیه‌سازی** می‌کند تا مسیر پشتیبان قطعی سنجیده
  // شود، نه اینکه به نسخهٔ نودِ اجراکننده سپرده شود.
  const sample81 = 'ردیف نمونه '.repeat(3000);
  const raw81 = new TextEncoder().encode(sample81);
  const realCS = globalThis.CompressionStream;
  const oldPlatform = class {
    constructor(format) {
      if (format === 'deflate-raw') throw new TypeError('Unsupported compression format: deflate-raw');
      return new realCS(format);
    }
  };

  const packedNew = await xDeflate(raw81);
  globalThis.CompressionStream = oldPlatform;
  const packedOld = await xDeflate(raw81);
  globalThis.CompressionStream = realCS;

  check('سکوی بدون deflate-raw هم واقعاً فشرده می‌کند',
    packedOld && packedOld.length < raw81.length / 5,
    packedOld ? `${(raw81.length / packedOld.length).toFixed(0)} برابر` : 'اصلاً فشرده نشد');
  // `!!packedOld` اینجا احتیاط نیست، شرط است: بدون آن، نبودِ مسیر پشتیبان
  // به‌جای یک ردِ تمیز، کل اجرای آزمون را می‌انداخت و ادعاهای بعدی هرگز
  // خوانده نمی‌شدند.
  check('دو مسیر فشرده‌سازی یک خروجی می‌دهند',
    !!packedOld && packedNew.length === packedOld.length
    && packedNew.every((byte, at) => byte === packedOld[at]));
  check('خروجی مسیر پشتیبان، همان دادهٔ اصلی را برمی‌گرداند',
    !!packedOld && new TextDecoder().decode(inflateRawSync(Buffer.from(packedOld))) === sample81);

  // بریدنِ کورکورانهٔ پوشش zlib، فایلی می‌سازد که باز می‌شود و محتوایش
  // آشغال است — بدتر از فایلی که باز نمی‌شود. پس سرآیند بررسی می‌شود.
  check('سرآیند zlib با روش ناشناخته رد می‌شود',
    xStrip(Uint8Array.from([9, 0, 1, 2, 3, 4, 5, 6, 7])) === null);
  check('سرآیند zlib با واژه‌نامهٔ از پیش‌تعیین‌شده رد می‌شود',
    xStrip(Uint8Array.from([0x78, 0x20, 1, 2, 3, 4, 5, 6, 7])) === null);
  check('دادهٔ کوتاه‌تر از پوشش zlib رد می‌شود', xStrip(Uint8Array.from([0x78, 0x9c, 1])) === null);

  // و کل دفترکار روی همان سکوی قدیمی هم باید فشرده و سالم دربیاید
  globalThis.CompressionStream = oldPlatform;
  const bookOld = await buildXlsx([xSheet('برگ', head81, rows81)]);
  globalThis.CompressionStream = realCS;
  check('دفترکار روی سکوی قدیمی هم چند برابر کوچک‌تر است',
    old81 / bookOld.length >= 5, `${(old81 / bookOld.length).toFixed(1)} برابر`);

  const bt81 = readSrc('../ui/tabs/backtest.mjs');
  check('فراخوان خروجی منتظر ساخت فایل می‌ماند', /await\s+downloadBacktestExcel/.test(bt81));
}

// ═════════ ۸۲. یونانی‌ها در طول زمان و حساسیت ═════════
//
// خواسته کاربر: «برای هر پا یونانی‌ها محاسبه بشه در هر بازه زمانی (چه روزانه
// چه یک دقیقه چه هر تایم‌فریم انتخابی بین این دو)… سپس روند یونانی‌ها در طی
// عمر استراتژی قابل بررسی در جدول و نمودار باشه… یا شاید تحلیل حساسیت.»
group('۸۲. مسیر یونانی‌ها و تحلیل حساسیت');
{
  const P82 = { rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, yearDays: 365 };
  const call82 = { kind: 'call', strike: 11000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000, name: 'کال' };
  const stock82 = { kind: 'underlying', side: 'buy', ratio: 1, size: 1, name: 'پایه' };
  const legs82 = [call82, stock82];
  const price82 = (S, days, sigma) => bsPrice('call', S, 11000, days / 365, 0.3, 0, sigma);

  // ——— مهر خوردن هر سه مسیر ———
  const tick82 = [
    { second: 34200, timeLabel: '09:30:00', basePrice: 10000, perLeg: [{ exitPrice: price82(10000, 90, 0.65) }, { exitPrice: 10000 }] },
    { second: 36000, timeLabel: '10:00:00', basePrice: 10120, perLeg: [{ exitPrice: price82(10120, 90, 0.64) }, { exitPrice: 10120 }] },
  ];
  annotateIntradayGreeks(tick82, { legs: legs82, date: 20260101 }, P82);
  check('یونانی روی نقطهٔ درون‌روز می‌نشیند', Number.isFinite(tick82[0].greeks?.delta), String(tick82[0].greeks?.delta));
  check('یونانی پا هم روی خودِ پا می‌نشیند', Number.isFinite(tick82[0].perLeg[0].greeks?.vega));
  check('پای سهم پایه یونانی بلک‌شولز ندارد', tick82[0].perLeg[1].greeks === null);
  check('دلتای موقعیت، پای پایه را هم می‌شمارد',
    Math.abs(tick82[0].greeks.delta - (tick82[0].perLeg[0].greeks.delta * 1000 + 1)) < 1e-9,
    `${tick82[0].greeks.delta}`);

  const bucket82 = [
    { date: 20260101, startSecond: 34200, basePrice: 10000, perLeg: [{ price: price82(10000, 90, 0.65) }, { price: 10000 }] },
    { date: 20260105, startSecond: 34200, basePrice: 10300, perLeg: [{ price: price82(10300, 86, 0.6) }, { price: 10300 }] },
  ];
  annotateBucketGreeks(bucket82, { legs: legs82 }, P82);
  // تاریخ هر سطل از خودش می‌آید، پس روز تا سررسید دو سطل فرق دارد و
  // یونانی‌شان هم باید فرق کند
  check('هر سطل با روز تا سررسید خودش حساب می‌شود',
    bucket82[0].greeks.theta !== bucket82[1].greeks.theta);

  // ——— سری و خلاصه ———
  const series82 = greekSeries(bucket82, { legCount: 2 });
  check('سری نمودار، ستون کل و ستون هر پا را دارد',
    Number.isFinite(series82[0].delta) && Number.isFinite(series82[0].delta1) && Number.isNaN(series82[0].delta2),
    Object.keys(series82[0]).join('،'));
  check('خلاصهٔ یونانی، ابتدا و انتها و تغییر را می‌دهد',
    greekSummary(bucket82).every((row) => row.samples === 2 && Number.isFinite(row.change)));
  check('خلاصهٔ پای بی‌یونانی، جای خالی می‌ماند نه صفر',
    legGreekSummary(bucket82, 1).every((row) => row.samples === 0 && Number.isNaN(row.mean)));
  check('خلاصهٔ سری خالی، صفر نمی‌سازد',
    trackSummary([NaN, NaN]).samples === 0 && Number.isNaN(trackSummary([]).mean));

  // ——— حساسیت ———
  const snap82 = { spot: 10000, prices: [price82(10000, 90, 0.65), 10000], date: 20260101 };
  const iv82 = ivSnapshot(legs82, snap82, P82);
  check('تلاطم ضمنی لحظه، برای پای اختیار درمی‌آید و برای پایه نه',
    Math.abs(iv82[0] - 65) < 0.5 && Number.isNaN(iv82[1]), `${iv82[0]}`);
  const grid82 = positionSensitivityGrid(legs82, snap82, P82, { spotSteps: [-10, 0, 10], volSteps: [-5, 0, 5] });
  const middle = grid82.rows[1].cells[1];
  // خانهٔ مرکز، هیچ سناریویی نیست: باید دقیقاً صفر باشد وگرنه خطای برازش
  // مدل داخل «اثر سناریو» نشسته است
  check('خانهٔ بی‌سناریو دقیقاً صفر است', Math.abs(middle.change) < 1e-6, String(middle.change));
  check('صعود پایه برای کال خریداری‌شده مثبت است', grid82.rows[2].cells[1].change > 0);
  check('افت تلاطم برای کال خریداری‌شده منفی است', grid82.rows[1].cells[0].change < 0);
  const axis82 = positionSensitivityAxis(legs82, snap82, P82, { daySteps: [0, 5] });
  check('حساسیت تک‌محوره سه محور دارد',
    axis82.spot.length > 0 && axis82.vol.length > 0 && axis82.time.length === 2);
  check('گذر زمان برای کال خریداری‌شده ارزش می‌گیرد', axis82.time[1].change < 0);

  // قاعدهٔ ۲-۴: پای بی‌تلاطم بازقیمت‌گذاری نمی‌شود و سناریو ناقص می‌ماند
  const blind = repriceAt(legs82, { ...snap82, ivPct: [NaN, NaN] }, { spotPct: 5 }, P82);
  check('سناریوی پای بی‌تلاطم، ناقص علامت می‌خورد', blind.incomplete === true);

  const share82 = greekContribution(legs82, snap82, P82);
  check('سهم هر پا از یونانی موقعیت، وزن علامت‌دار می‌خورد',
    Math.abs(share82[0].share.delta - share82[0].greeks.delta * 1000) < 1e-9);
  check('یونانی‌ها یک نام و یک ترتیب دارند',
    GK.map((g) => g.key).join(',') === 'delta,gamma,vega,theta,rho');
}

// ═════════ ۸۳. تجزیه سود و زیان به ریشه‌ها ═════════
//
// خواسته کاربر: «هر جا سود و زیانی ایجاد شد اثر ایجاد ان مشخص بشه… مثلا دلتا
// رفت بالا تلاطم رفت بالا گاما اثر گذاشت یا نه اثر زوال زمانی بود… این ۳۲۰
// میلیون ریال سود دلیلش چیه و سود و زیان را دقیق و کامل تجزیه کنی به
// ریشه‌هایش… گام اول به پایه‌هاش، گام دوم رفتار پایه‌ها.»
group('۸۳. تجزیه سود و زیان');
{
  const P83 = { rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, yearDays: 365 };
  const leg83 = { kind: 'call', strike: 11000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000, name: 'کال' };
  const mk = (date, S, sigma, days) => {
    const price = bsPrice('call', S, 11000, days / 365, 0.3, 0, sigma);
    return {
      date, label: String(date), spot: S, prices: [price], pnl: [1000 * price],
      ivPct: [sigma * 100], greeks: [bsGreeks('call', S, 11000, days / 365, 0.3, 0, sigma, 365)],
    };
  };

  // گام کوچک: تقریب مرتبهٔ دوم باید تقریباً کامل توضیح بدهد
  const small83 = attributeStep([leg83], mk(20260101, 10000, 0.65, 90), mk(20260102, 10020, 0.649, 89));
  check('گام کوچک، تقریباً کامل تجزیه می‌شود',
    Math.abs(small83.rest / small83.actual) < 0.05,
    `باقیمانده ${(Math.abs(small83.rest / small83.actual) * 100).toFixed(2)}٪`);
  check('جمع چهار عامل و باقیمانده، دقیقاً تغییر واقعی است',
    Math.abs((small83.delta + small83.gamma + small83.vega + small83.theta + small83.rest) - small83.actual) < 1e-6);
  check('صعود پایه سهم دلتای مثبت می‌دهد', small83.delta > 0);
  check('گذر زمان برای کال خریداری‌شده سهم منفی می‌دهد', small83.theta < 0);
  check('افت تلاطم سهم وگای منفی می‌دهد', small83.vega < 0);

  // پای سهم پایه: کل حرکتش دلتاست و باقیمانده‌اش صفر
  const stock83 = { kind: 'underlying', side: 'buy', ratio: 1, size: 1, name: 'پایه' };
  const a83 = { date: 20260101, label: 'الف', spot: 10000, prices: [10000], pnl: [0], ivPct: [NaN], greeks: [null] };
  const b83 = { date: 20260102, label: 'ب', spot: 10200, prices: [10200], pnl: [200], ivPct: [NaN], greeks: [null] };
  const stepStock = attributeStep([stock83], a83, b83);
  check('حرکت پای پایه تمامش دلتاست', Math.abs(stepStock.delta - 200) < 1e-9, String(stepStock.delta));
  check('پای پایه باقیمانده ندارد', Math.abs(stepStock.rest) < 1e-9);

  // قاعدهٔ ۲-۴: پای بی‌یونانی تجزیه نمی‌شود؛ سودش به «توضیح‌داده‌نشده» می‌رود
  const blindLeg = { kind: 'call', strike: 11000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000, name: 'کور' };
  const ba = { date: 20260101, label: 'الف', spot: 10000, prices: [900], pnl: [0], ivPct: [NaN], greeks: [null] };
  const bb = { date: 20260102, label: 'ب', spot: 10200, prices: [980], pnl: [80000], ivPct: [NaN], greeks: [null] };
  const blindStep = attributeStep([blindLeg], ba, bb);
  check('پای بی‌تلاطم تجزیه نمی‌شود و گام ناقص می‌ماند', blindStep.incomplete === true);
  check('سود پای بی‌تجزیه، صفر فرض نمی‌شود بلکه جدا نگه داشته می‌شود',
    Math.abs(blindStep.unexplainedPnl - 80000) < 1e-9, String(blindStep.unexplainedPnl));
  check('سهم عوامل پای بی‌تجزیه، عدد ساختگی نمی‌گیرد',
    DRIVERS.every((d) => Number.isNaN(blindStep.byLeg[0][d.key])));
  const blindTotals = driverTotals([blindStep]);
  check('پوشش تجزیه، سهم توضیح‌داده‌شده را صادقانه می‌گوید',
    blindTotals.coverage === 0, String(blindTotals.coverage));

  // ——— سه لایهٔ جواب ———
  const track83 = [mk(20260101, 10000, 0.65, 90), mk(20260102, 10200, 0.62, 89), mk(20260103, 10150, 0.66, 88)];
  const full83 = analyzeAttribution([leg83], track83);
  check('لایهٔ اول: هر پا سطر خودش را دارد', full83.byLeg.length === 1 && full83.byLeg[0].samples === 2);
  check('لایهٔ دوم: جمع عوامل روی کل عمر ساخته می‌شود',
    Math.abs(full83.totals.actual - (track83[2].pnl[0] - track83[0].pnl[0])) < 1e-6);
  check('لایهٔ سوم: سود و زیان هر عامل جدا می‌ماند', (() => {
    const vega = full83.phases.find((p) => p.key === 'vega');
    return vega.gain > 0 && vega.loss < 0 && Math.abs(vega.net - (vega.gain + vega.loss)) < 1e-9;
  })());
  check('مسیر تجمعی، در نقطهٔ آخر با جمع می‌خواند',
    Math.abs(full83.cumulative.at(-1).actual - full83.totals.actual) < 1e-6);
  check('پررنگ‌ترین عامل هر گام، بزرگ‌ترین قدر مطلق است', (() => {
    const step = full83.steps[0];
    const best = dominantDriver(step);
    return DRIVERS.every((d) => !Number.isFinite(step[d.key]) || Math.abs(step[d.key]) <= Math.abs(best.value));
  })());
  check('نقاط عطف از بزرگ به کوچک مرتب‌اند', (() => {
    const list = turningPoints(full83.steps, 5);
    return list.every((item, i) => !i || Math.abs(list[i - 1].step.actual) >= Math.abs(item.step.actual));
  })());
  check('رو ستون ندارد، چون نرخ در بازپخش ثابت است',
    !DRIVERS.some((d) => d.key === 'rho'), DRIVERS.map((d) => d.key).join(','));

  // فاصلهٔ زمانی: ثانیه هم باید بشمارد وگرنه تتای یک روز کامل روی گام
  // یک‌دقیقه‌ای می‌نشیند
  check('فاصلهٔ دو نقطهٔ هم‌روز از ثانیه می‌آید',
    Math.abs(elapsedDays({ date: 20260101, second: 34200 }, { date: 20260101, second: 34260 }) - 60 / 86400) < 1e-12);
  check('فاصلهٔ دو روز، روز تقویمی است',
    elapsedDays({ date: 20260101 }, { date: 20260103 }) === 2);

  // مسیر روزانه از بازپخش، بدون ردیف فاقد داده
  const rows83 = [
    { date: 20260101, status: 'ok', dateLabel: 'الف', baseClose: 10000, perLeg: [{ exitPrice: 900, netPnl: 0, ivPct: 60 }] },
    { date: 20260102, status: 'missing', dateLabel: 'ب', perLeg: [] },
    { date: 20260103, status: 'ok', dateLabel: 'ج', baseClose: 10200, perLeg: [{ exitPrice: 980, netPnl: 80000, ivPct: 61 }] },
  ];
  check('ردیف فاقد داده وارد تجزیه نمی‌شود', dailyTrack({ rows: rows83 }).length === 2);
}

// ═════════ ۸۴. تب‌بندی بک‌تست سریع ═════════
//
// خواسته کاربر: «خود تب بک تست سریع را قسمت بندی و تب بندی کن، الان همه چیز
// توی هم قاطی شده… بر اساس کارکرد هر قسمتش… همچنین ۱۰ تا تب دیگه هم خودت
// پیشنهاد بده و بساز، داخلشون انواع نمودارها، جداول، تحلیل حساسیت‌ها.»
group('۸۴. تب‌بندی بک‌تست سریع');
{
  const bt84 = readSrc('../ui/tabs/backtest.mjs');
  const panels84 = readSrc('../ui/backtest-panels.mjs');
  const tabs84 = readSrc('../ui/subtabs.mjs');
  const css84 = readSrc('../ui/style.css');

  check('نوار زیرتب در تب نشسته است', bt84.includes('id="bt-subtabs"') && bt84.includes('mountSubtabs('));
  check('ده پنل تحلیلی تازه ساخته شده', ANALYSIS_PANELS.length === 10, `${ANALYSIS_PANELS.length} پنل`);
  check('پنل تازه شناسهٔ یگانه دارد',
    new Set(ANALYSIS_PANELS.map((p) => p.id)).size === 10);
  check('هر پنل تازه، توضیح خودش را دارد', ANALYSIS_PANELS.every((p) => p.label && p.hint));
  // بخش‌های فعلی هم پنل خودشان را گرفته‌اند: خواستهٔ «بر اساس کارکرد»
  for (const id of ['bt-setup', 'bt-overview', 'bt-daily', 'bt-intraday', 'bt-timeframe', 'bt-iv']) {
    check(`بخش فعلی «${id}» پنل خودش را دارد`, bt84.includes(`data-panel="${id}"`));
  }
  for (const panel of ANALYSIS_PANELS) {
    check(`پنل «${panel.label}» در نشانه‌گذاری هست`, panels84.includes(`data-panel="${panel.id}"`));
  }
  check('هر پنل تحلیلی دست‌کم یک نمودار دارد', (() => {
    const missing = ANALYSIS_PANELS.filter((panel) => {
      const at = panels84.indexOf(`data-panel="${panel.id}"`);
      const next = panels84.indexOf('data-panel="', at + 1);
      const body = panels84.slice(at, next < 0 ? undefined : next);
      return !/chartBox\(/.test(body) && !/bt-gk-charts/.test(body);
    }).map((panel) => panel.label);
    return missing.length === 0 ? true : missing.join('، ');
  })() === true);
  check('«چه مدت در سود» و «رفتار بازه‌های روز» به پنل اثر زمان رفتند',
    panels84.includes('id="bt-tf-holding"') && panels84.includes('id="bt-tf-timeofday"')
    && !bt84.includes('id="bt-tf-holding"'));
  check('پنل‌ها پس از هر اجرا و هر تغییر تایم‌فریم دوباره کشیده می‌شوند',
    (bt84.match(/paintPanels\(\)/g) || []).length >= 4, `${(bt84.match(/paintPanels\(\)/g) || []).length} فراخوان`);
  check('خرابی یک پنل، کل تب را نمی‌خواباند',
    /try \{\s*paintAnalysis\(/.test(bt84) && /logError\(error, 'پنل‌های تحلیلی/.test(bt84));

  // نوار زیرتب: فقط یک پنل باز، و شنوندهٔ تکراری نمی‌سازد
  check('نوار، tablist واقعی است',
    tabs84.includes("role', 'tablist'") && tabs84.includes('role="tab"') && tabs84.includes("'tabpanel'"));
  check('فقط تب فعال در ترتیب صفحه‌کلید می‌ماند', tabs84.includes('button.tabIndex = on ? 0 : -1'));
  check('ساخت دوبارهٔ نوار، شنوندهٔ تکراری نمی‌گذارد',
    tabs84.includes('host.onclick =') && tabs84.includes('host.onkeydown =')
    && !/host\.addEventListener/.test(tabs84));
  check('تب آغازین قابل تعیین است', tabs84.includes('initial') && bt84.includes("initial: 'bt-overview'"));
  check('نوار زیرتب سبک خودش را دارد', css84.includes('.subtabs {') && css84.includes('.subtabs button[aria-selected="true"]'));
  check('شدت خانهٔ شبکهٔ حساسیت از توکن می‌آید، نه رنگ ثابت',
    css84.includes('.heat-up-4') && css84.includes('var(--gain)') && !/\.heat-up-4[^}]*#[0-9a-f]{3}/i.test(css84));

  // حکم پنل الگو نباید بیشتر از عدد ادعا کند
  const pool84 = [{ label: 'الف', family: 'حرکت پایه', sum: -50, count: 3, samples: 3, winPct: 20 }];
  const one = verdictLines(pool84, [], 100).join(' ');
  check('وقتی هیچ دسته‌ای سودده نبوده، «بیشترین سود» گفته نمی‌شود',
    !one.includes('بیشترین سود') && one.includes('کم‌زیان‌ترین'), one.slice(0, 60));
  check('بهترین و بدترینِ یکسان، دو جملهٔ هم‌معنی نمی‌سازد',
    one.includes('تنها یک دسته نمونهٔ کافی داشت'));
  const two = verdictLines([
    { label: 'صعود', family: 'حرکت پایه', sum: 900, count: 4, samples: 4, winPct: 75 },
    { label: 'نزول', family: 'حرکت پایه', sum: -300, count: 3, samples: 3, winPct: 33 },
  ], [{ label: 'حرکت پایه', net: 600, gain: 900, loss: -300 }], 82.5).join(' ');
  check('دستهٔ سودده، «بیشترین سود» می‌گیرد', two.includes('بیشترین سود') && two.includes('صعود'));
  check('پوشش تجزیه همیشه در حکم گفته می‌شود',
    two.includes('پوشش تجزیه') && one.includes('پوشش تجزیه'));
}

// ═════════ ۸۵. نوار زیرتب نباید تب باز کاربر را ببندد ═════════
//
// خرابی گزارش‌شده: «در بک‌تست سریع وقتی روی تب‌های مختلف کلیک می‌کنی، بعد از
// چند ثانیه برمی‌گرده به تب اول. به نظر می‌رسه با دریافت دیتا این اتفاق
// می‌افته.»
//
// ریشه: رصد زنده هر چند ثانیه معاملات را می‌گیرد و پس از هر دریافت،
// `mountSubtabs` را با همان فهرست صدا می‌زد. نوار از نو ساخته می‌شد و انتخاب
// به `initial` برمی‌گشت — بی‌آنکه کاربر چیزی کلیک کرده باشد.
//
// این آزمون به‌جای خواندن متن کد، خودِ رفتار را می‌سنجد: یک DOM کوچک که فقط
// همان چند چیزی را دارد که `mountSubtabs` لمس می‌کند.
group('۸۵. نوار زیرتب و دریافت دوبارهٔ داده');
{
  const makeDom = (ids) => {
    const panels = new Map(ids.map((id) => [id, {
      id: '', hidden: false, tabIndex: -1, setAttribute() {},
    }]));
    let buttons = new Map();
    let builds = 0;
    const host = {
      className: '', setAttribute() {}, onclick: null, onkeydown: null,
      set innerHTML(value) {
        builds += 1;
        buttons = new Map([...String(value).matchAll(/data-subtab="([^"]+)"/g)].map(([, id]) => [id, {
          dataset: { subtab: id }, tabIndex: -1, focused: 0,
          setAttribute(name, val) { this[name] = val; },
          focus() { this.focused += 1; },
        }]));
      },
      querySelector(sel) { return buttons.get(sel.replace(/.*="|".*/g, '')) || null; },
    };
    const root = {
      querySelector(sel) {
        const id = sel.replace(/.*="|".*/g, '');
        return panels.get(id) || null;
      },
    };
    return {
      host, root, panels,
      get builds() { return builds; },
      click(id) { host.onclick({ target: { closest: () => buttons.get(id) || null } }); },
      press(key) { host.onkeydown({ key, preventDefault() {} }); },
      visible: () => [...panels.entries()].filter(([, panel]) => !panel.hidden).map(([id]) => id),
    };
  };

  const ALL = ['bt-setup', 'bt-overview', 'bt-daily', 'bt-attribution'];
  const tabsOf = (ids) => ids.map((id) => ({ id, label: id, hint: id }));
  const dom = makeDom(ALL);
  const opts = { root: dom.root, initial: 'bt-overview' };

  // گام اول: فقط «چیدمان»، همان چیزی که پیش از اولین اجرا روی صفحه است
  const first = mountSubtabs(dom.host, tabsOf(['bt-setup']), { root: dom.root });
  check('پیش از اجرا فقط چیدمان باز است', first.current === 'bt-setup');

  // گام دوم: اجرا تمام شد و فهرست عوض شد — باید روی نتیجه بنشیند
  const full = mountSubtabs(dom.host, tabsOf(ALL), opts);
  check('با عوض‌شدن فهرست، نوار از نو ساخته می‌شود و روی تب آغازین می‌نشیند',
    full.current === 'bt-overview' && dom.builds === 2, `${dom.builds} ساخت`);

  // گام سوم: کاربر روی تب دلخواه خودش می‌نشیند
  dom.click('bt-attribution');
  check('کلیک کاربر، تب را عوض می‌کند', full.current === 'bt-attribution');
  check('در هر لحظه دقیقاً یک پنل باز است',
    dom.visible().length === 1 && dom.visible()[0] === 'bt-attribution', dom.visible().join('، '));

  // گام چهارم — همان خرابی: تیک بعدی رصد زنده با همان فهرست
  const again = mountSubtabs(dom.host, tabsOf(ALL), opts);
  check('دریافت دوبارهٔ داده، کاربر را از تب بازش بیرون نمی‌اندازد',
    again.current === 'bt-attribution', again.current);
  check('پنل باز هم همان می‌ماند',
    dom.visible().length === 1 && dom.visible()[0] === 'bt-attribution', dom.visible().join('، '));
  check('نوارِ بی‌تغییر اصلاً دوباره ساخته نمی‌شود',
    dom.builds === 2, `${dom.builds} ساخت`);
  check('دستهٔ برگشتی همان دستهٔ قبلی است', again === full);

  // ساختِ دوباره حتی نشانگر صفحه‌کلید را هم می‌برد؛ حالا نمی‌برد
  dom.press('ArrowRight');
  check('پس از دریافت داده، جهت‌نما هنوز از همان تب حرکت می‌کند',
    again.current === 'bt-daily', again.current);

  // تغییر واقعی برچسب هم باید نوار را تازه کند
  const renamed = mountSubtabs(dom.host, [
    ...tabsOf(['bt-setup', 'bt-overview', 'bt-daily']),
    { id: 'bt-attribution', label: 'تجزیه سود و زیان', hint: 'x' },
  ], opts);
  check('عوض‌شدن برچسب، نوار را از نو می‌سازد',
    dom.builds === 3 && renamed.current === 'bt-overview', `${dom.builds} ساخت`);

  // بازگشت به حالت پیش از اجرا (تغییر نماد یا استراتژی)
  const back = mountSubtabs(dom.host, tabsOf(['bt-setup']), { root: dom.root });
  check('با عوض‌شدن نماد، نوار به چیدمان برمی‌گردد',
    back.current === 'bt-setup' && dom.builds === 4, `${dom.builds} ساخت`);

  // و در خودِ تب: تیک رصد زنده تب را جابه‌جا نمی‌کند، ولی اجرا می‌کند
  const bt85 = readSrc('../ui/tabs/backtest.mjs');
  const liveBody = bt85.slice(
    bt85.indexOf('async function refreshLivePosition'),
    bt85.indexOf('async function startLiveWatch'),
  );
  check('تیک رصد زنده تب را جابه‌جا نمی‌کند',
    liveBody.includes('showResultTabs();') && !liveBody.includes('fromSetup'));
  check('«اجرا» کاربرِ نشسته روی چیدمان را به نتیجه می‌برد',
    (bt85.match(/showResultTabs\(\{ fromSetup: true \}\)/g) || []).length === 2);
  check('همهٔ فراخوان‌های نوار از یک جا می‌گذرند',
    (bt85.match(/mountSubtabs\(/g) || []).length === 3,
    `${(bt85.match(/mountSubtabs\(/g) || []).length} فراخوان`);
}

// ═════════ ۸۶. نام تازهٔ تب ═════════
//
// خواسته کاربر: «اسم این تب رو بگذار آزمایشگاه آپشن (ایموجی مناسب هم بذار).»
group('۸۶. نام تازهٔ تب');
{
  const app86 = readSrc('../ui/app.mjs');
  const bt86 = readSrc('../ui/tabs/backtest.mjs');
  check('تب نام تازه را در فهرست کناری دارد', app86.includes("title: '\u{1F52C} آزمایشگاه آپشن'"));
  check('عنوان خودِ صفحه هم عوض شده', bt86.includes('<h1>\u{1F52C} آزمایشگاه آپشن</h1>') || bt86.includes('آزمایشگاه آپشن</h1>'));
  check('شناسهٔ تب دست‌نخورده مانده تا نشانی‌های ذخیره‌شده نشکنند',
    app86.includes("{ id: 'backtest',"));
  check('جست‌وجوی «بک‌تست» هنوز این تب را پیدا می‌کند',
    app86.includes('alias:') && app86.includes('بک‌تست سریع backtest')
    && app86.includes('${t.alias'));
}

// ═════════ ۸۷. از روز مبدأ تا همین لحظه ═════════
//
// خواسته کاربر: «در دو قسمت تحلیل تاریخی استراتژی و آزمون همه استراتژی‌ها
// در حال حاضر بر اساس اطلاعات تاریخی کار می‌کنند. امکان ارائه اطلاعات از
// روز مبدا تا دیتای لحظه‌ای حال حاضر را نیز علاوه بر حالت قبلی فراهم کن.»
//
// «علاوه بر حالت قبلی» قید اصلی است: حالت بسته‌شده باید بدون کوچک‌ترین
// تغییر سر جایش بماند، و روز جاری فقط وقتی اضافه شود که واقعاً مشاهده شده
// باشد.
group('۸۷. دامنهٔ داده تا لحظهٔ جاری');
{
  const board = (over = {}) => ({
    uaInsCode: 'UA1', lval30_UA: 'پایه', strikePrice: 1000, remainedDay: 30, endDate: 20260301,
    pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1020,
    qTotTran5J_UA: 900000, zTotTran_UA: 700, qTotCap_UA: 9.4e11,
    insCode_C: 'C1', lVal18AFC_C: 'ضپایه۱۰۰۰',
    pDrCotVal_C: 180, pClosing_C: 175, priceYesterday_C: 160,
    qTotTran5J_C: 4200, zTotTran_C: 55, qTotCap_C: 7.4e8,
    // پای فروش امروز اصلاً معامله نشده: تابلو قیمت دیروزش را حمل می‌کند
    insCode_P: 'P1', lVal18AFC_P: 'طپایه۱۰۰۰',
    pDrCotVal_P: 90, pClosing_P: 90, priceYesterday_P: 90,
    qTotTran5J_P: 0, zTotTran_P: 0, qTotCap_P: 0,
    ...over,
  });

  // ——— روزِ عکس ———
  for (const phase of ['open', 'after', 'ungated']) {
    check(`فاز «${phase}» عکس تابلو را به امروز می‌چسباند`,
      liveDayOf({ phase }, Date.UTC(2026, 1, 10, 8, 0)).ok === true);
  }
  for (const [phase, why] of [['before', 'بازار باز نشده'], ['holiday', 'جمعه، روز معاملاتی نیست']]) {
    const out = liveDayOf({ phase, why }, Date.UTC(2026, 1, 10, 3, 0));
    check(`فاز «${phase}» عکس را به امروز نمی‌چسباند`, out.ok === false && out.date === 0);
    check(`دلیل نچسبیدن «${phase}» حفظ می‌شود`, out.why === why, out.why);
  }
  check('فاز ناشناخته هم محتاطانه رد می‌شود', liveDayOf({}, Date.now()).ok === false);
  check('فهرست فازهای مجاز صریح است', LIVE_DAY_PHASES.join(',') === 'open,after,ungated');
  // ۲۱:۰۰ گرینویچ نهم فوریه در تهران، بامداد دهم است
  check('روز از ساعت تهران خوانده می‌شود نه گرینویچ',
    tehranDateNumber(Date.UTC(2026, 1, 9, 21, 0)) === 20260210,
    String(tehranDateNumber(Date.UTC(2026, 1, 9, 21, 0))));
  check('ساعت نامعتبر روز نمی‌سازد', tehranDateNumber(NaN) === 0);

  // ——— ردیف‌های امروز ———
  const live87 = liveDayRows([board()], { date: 20260210 });
  check('پایه و پای معامله‌شده ردیف امروز می‌گیرند', !!live87.UA1 && !!live87.C1);
  check('پایی که امروز معامله نشده ردیف نمی‌گیرد', live87.P1 === undefined);
  check('قیمت‌های ردیف امروز از تابلو می‌آیند',
    live87.C1.last === 180 && live87.C1.close === 175 && live87.C1.yday === 160);
  check('حجم و ارزش امروز هم می‌آیند',
    live87.C1.vol === 4200 && live87.C1.trades === 55 && live87.C1.value === 7.4e8);
  check('اولین، کمترین و بیشترین ساخته نمی‌شوند',
    live87.C1.first === 0 && live87.C1.low === 0 && live87.C1.high === 0);
  check('ردیف امروز نشان‌دار است', live87.C1.live === true && live87.C1.date === 20260210);
  // و همین یعنی مبناهای «اولین/کمترین/بیشترین» روز جاری را اصلاً پیشنهاد
  // نمی‌کنند: قیمتی که مشاهده نشده، «فاقد داده» است نه عددی جایگزین.
  check('مبناهای مشاهده‌نشده روی روز جاری «فاقد داده» می‌دهند',
    ['FIRST', 'LOW', 'HIGH'].every((basis) => !Number.isFinite(historyPrice(live87.C1, basis)))
    && historyPrice(live87.C1, 'LAST') === 180 && historyPrice(live87.C1, 'CLOSE') === 175);
  check('بدون تاریخ، هیچ ردیفی ساخته نمی‌شود',
    Object.keys(liveDayRows([board()], { date: 0 })).length === 0);
  check('حجم بدون قیمت هم ردیف نمی‌سازد',
    liveDayRows([board({ pDrCotVal_C: 0, pClosing_C: 0 })], { date: 20260210 }).C1 === undefined);

  // ——— چسباندن روی سری‌های روزانه ———
  const base87 = {
    UA1: [{ date: 20260208, close: 1000, last: 1005, first: 990, low: 985, high: 1010, vol: 5e5, trades: 400, value: 5e11 }],
    C1: [{ date: 20260208, close: 150, last: 152, first: 148, low: 146, high: 155, vol: 3000, trades: 40, value: 4.5e8 }],
    P1: [{ date: 20260208, close: 95, last: 96, first: 94, low: 93, high: 98, vol: 1000, trades: 12, value: 9.5e7 }],
  };
  const merged87 = mergeLiveDay(base87, live87, { date: 20260210 });
  check('روز جاری به سری اضافه می‌شود', merged87.series.C1.length === 2 && merged87.added === 2);
  check('پای بی‌معاملهٔ امروز دست‌نخورده می‌ماند',
    merged87.series.P1.length === 1 && merged87.untouched === 1);
  check('ورودی دست نمی‌خورد', base87.C1.length === 1);
  check('سری مرتب می‌ماند',
    merged87.series.C1.map((row) => row.date).join(',') === '20260208,20260210');
  check('روز بسته‌شدهٔ قبلی تغییر نمی‌کند', merged87.series.C1[0].low === 146);

  // ردیف رسمی همان روز اگر بود، تازه می‌شود ولی کمترین/بیشترینش نمی‌پرد
  const withToday = {
    C1: [
      { date: 20260208, close: 150, last: 152, first: 148, low: 146, high: 155, vol: 3000, trades: 40, value: 4.5e8 },
      { date: 20260210, close: 170, last: 171, first: 165, low: 163, high: 178, vol: 3900, trades: 51, value: 6.8e8 },
    ],
  };
  const over87 = mergeLiveDay(withToday, live87, { date: 20260210 });
  check('ردیف امروزِ موجود جایگزین می‌شود نه دوتا',
    over87.series.C1.length === 2 && over87.updated === 1 && over87.added === 0);
  check('قیمت‌های تازه‌تر تابلو می‌نشینند',
    over87.series.C1[1].last === 180 && over87.series.C1[1].vol === 4200);
  check('کمترین و بیشترینِ ردیف رسمی از دست نمی‌رود',
    over87.series.C1[1].low === 163 && over87.series.C1[1].high === 178 && over87.series.C1[1].first === 165);

  check('بدون روز معتبر، سری‌ها دست‌نخورده برمی‌گردند',
    mergeLiveDay(base87, live87, { date: 0 }).series.C1.length === 1);

  // ——— جملهٔ کاربر ———
  const noteOk = scopeNote(merged87, { total: 3, at: Date.UTC(2026, 1, 10, 8, 30) });
  check('جمله می‌گوید چند نماد ردیف گرفتند', noteOk.includes('۲') && noteOk.includes('۳'));
  check('جمله صریحاً می‌گوید روز بسته نشده', noteOk.includes('بسته نشده'));
  const noneNote = scopeNote({ date: 20260210, added: 0, updated: 0 }, { total: 3 });
  check('وقتی هیچ نمادی معامله نکرده، ادعای به‌روزرسانی نمی‌شود',
    noneNote.includes('معامله‌ای نداشتند') && !noneNote.includes('تازه شد'), noneNote);

  // ——— مسیر کامل، با پاسخ ساختگی ———
  const fakeFetch = (payload, ok = true) => async () => ({ ok, json: async () => payload });
  const at87 = Date.UTC(2026, 1, 10, 8, 30);
  const good = await applyLiveScope(base87, {
    fetcher: fakeFetch({ at: at87, market: { open: true, phase: 'open' }, rows: [board()] }),
  });
  check('مسیر کامل روز جاری را می‌چسباند', good.ok === true && good.series.C1.length === 2);

  const shut = await applyLiveScope(base87, {
    fetcher: fakeFetch({ at: at87, market: { open: false, phase: 'holiday', why: 'جمعه، روز معاملاتی نیست' }, rows: [board()] }),
  });
  check('روز غیرمعاملاتی، سری‌ها را دست‌نخورده برمی‌گرداند',
    shut.ok === false && shut.series === base87);
  check('و دلیلش را می‌گوید', shut.note.includes('روز معاملاتی نیست'), shut.note);

  const broken = await applyLiveScope(base87, { fetcher: async () => { throw new Error('شبکه قطع است'); } });
  check('شکست شبکه حالت قبلی را خراب نمی‌کند',
    broken.ok === false && broken.series === base87 && broken.note.includes('شبکه قطع است'));
}

// ═════════ ۸۸. دو تب، یک مسیر ═════════
group('۸۸. اتصال دامنهٔ داده به دو تب');
{
  const hist88 = readSrc('../ui/tabs/history.mjs');
  const pb88 = readSrc('../ui/tabs/portfolio-backtest.mjs');
  const scope88 = readSrc('../ui/live-scope.mjs');
  const srv88 = readSrc('../server/server.mjs');
  const css88 = readSrc('../ui/style.css');
  const bt88 = readSrc('../ui/tabs/backtest.mjs');

  check('حالت پیش‌فرض همان رفتار قبلی است', SCOPE_OPTIONS[0][0] === 'closed');
  check('انتخابگر دو گزینه دارد', SCOPE_OPTIONS.length === 2 && SCOPE_OPTIONS[1][0] === 'live');
  check('گزینهٔ پیش‌فرض در نشانه‌گذاری انتخاب می‌شود',
    scopeOptionsMarkup().includes('value="closed" selected') && !scopeOptionsMarkup().includes('value="live" selected'));

  for (const [name, src, id] of [['تحلیل تاریخی', hist88, 'h-scope'], ['آزمون همه استراتژی‌ها', pb88, 'pb-data-scope']]) {
    check(`${name} انتخابگر دامنه دارد`, src.includes(`id="${id}"`) && src.includes('scopeOptionsMarkup()'));
    check(`${name} از همان مسیر مشترک استفاده می‌کند`, src.includes('applyLiveScope'));
    check(`${name} یادداشت دامنه را نشان می‌دهد`, /id="(h|pb)-scope-note"/.test(src));
    check(`${name} با عوض‌شدن دامنه نتیجهٔ قدیمی را نگه نمی‌دارد`, /addEventListener\('change'[\s\S]{0,400}loadHistory\(\)/.test(src));
    check(`${name} روز لحظه‌ای را برچسب می‌زند`, src.includes('لحظه‌ای، بسته‌نشده'));
  }

  check('دامنهٔ بسته‌شده هیچ درخواستی نمی‌فرستد',
    /!== SCOPE_LIVE\)/.test(hist88) && /!== SCOPE_LIVE\)/.test(pb88));
  check('شکست هرگز پرتاب نمی‌شود', scope88.includes('catch (error)') && scope88.includes('series: seriesByIns'));

  // سرور باید فاز بازار و ساعت راست بدهد، وگرنه روزِ عکس قابل تشخیص نیست
  check('سرور فاز بازار را جدا از متن فارسی می‌دهد',
    ["'ungated'", "'holiday'", "'before'", "'after'", "'open'"].every((phase) => srv88.includes(`phase: ${phase}`)));
  check('عکس تابلو ساعت راست خودش را می‌دهد',
    srv88.includes('cachedAt(path)') && srv88.includes('market: marketOpen()'));
  check('ساعت کش از خودِ کش خوانده می‌شود', /function cachedAt\(pathname\)/.test(srv88));

  check('یادداشت دامنه رنگش از توکن می‌آید',
    css88.includes('.live-scope-note') && css88.includes('var(--accent)')
    && !/\.live-scope-note[^}]*#[0-9a-f]{3}/i.test(css88));

  // یک پیاده‌سازی برای «امروز به وقت تهران»، نه دو تا (قاعدهٔ ۲-۵)
  check('روز تهران یک پیاده‌سازی دارد',
    bt88.includes("import { tehranDateNumber } from '/core/live-day.mjs'")
    && !/const tehranDateNumber = /.test(bt88));
}

// ═══════════════════════════ گزارش ═══════════════════════════
const W = 62;
console.log('\n' + '═'.repeat(W));
console.log('  آزمون موتور — فاز ۲');
console.log('═'.repeat(W));
for (const [mark, name, detail] of results) {
  if (mark === '—') { console.log('\n' + name); continue; }
  const pad = name.length > 46 ? name.slice(0, 46) : name.padEnd(46, ' ');
  console.log(` ${mark} ${pad} ${detail}`);
}

console.log('\n' + '─'.repeat(W));
console.log(`  قبول ${pass}   رد ${fail}`);
console.log('─'.repeat(W) + '\n');
process.exit(fail ? 1 : 0);
