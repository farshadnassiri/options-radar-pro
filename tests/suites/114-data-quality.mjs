// ۱۱۳. قرارداد مشترک کیفیت داده
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { bookAt, normalizeBookEvents, quoteFromBook } from '../../core/book-history.mjs';
import {
  DATA_QUALITY_KINDS, DATA_QUALITY_VERSION, bookDataQuality, combineDataQuality, dailyDataQuality, intradayDataQuality, isDataQuality, makeDataQuality, universeDataQuality,
} from '../../core/data-quality.mjs';
import {
  activatePortfolioSession, createPortfolioSession, setFamilyAllocations, setPortfolioMission,
} from '../../core/portfolio-session.mjs';
import { createTimeGate } from '../../core/time-gate.mjs';
import { archiveQuality } from '../../core/watch-archive.mjs';


// ═══════════════════════ ۱۱۳. قرارداد مشترک کیفیت داده ═══════════════════════
//
// کیفیت باید کنار داده تا عکس شروع سبد بماند. این آزمون‌ها عدد مالی را
// نمی‌سنجند؛ می‌سنجند که برنامه هیچ عددی را بی‌منبع و بی‌برچسب ارائه نکند.
group('۱۱۳. قرارداد مشترک کیفیت داده');
{
  const observed = makeDataQuality({
    kind: 'observed', source: 'daily', asOf: { date: 20260520, second: 45000 },
    sufficient: true,
  });
  check('نسخه و چهار نوع کیفیت یک قرارداد ثابت دارند',
    DATA_QUALITY_VERSION === 1
    && ['observed', 'executable', 'estimated', 'missing'].every((key) => !!DATA_QUALITY_KINDS[key]));
  check('نوع مشاهده‌شده فقط پرچم خودش را روشن می‌کند',
    observed.observed && !observed.executable && !observed.estimated && !observed.missing);
  check('رکورد کیفیت، منبع و لحظه را نگه می‌دارد',
    isDataQuality(observed) && observed.source === 'daily' && observed.asOf.date === 20260520);
  check('نوع نامعتبر بی‌صدا معتبر نمی‌شود',
    makeDataQuality({ kind: 'magic', sufficient: true }).missing
    && !makeDataQuality({ kind: 'magic', sufficient: true }).sufficient);

  const estimated = makeDataQuality({
    kind: 'estimated', source: 'fallback', sufficient: false,
    stale: true, reason: 'سوگیری بقا',
  });
  const combined = combineDataQuality([observed, estimated], {
    source: 'start', asOf: { date: 20260521, second: 36000 },
  });
  check('در تجمیع، کیفیت ضعیف‌تر پنهان نمی‌شود',
    combined.estimated && !combined.sufficient && combined.stale);
  check('دلیل خوراک ضعیف تا کیفیت تجمیعی می‌ماند',
    combined.reasons.includes('سوگیری بقا'));
  check('تجمیع خالی، صادقانه فاقد داده است',
    combineDataQuality([]).missing);

  // ——— تبدیل خوراک‌های اصلی به قرارداد مشترک ———
  const daily = dailyDataQuality({
    rows: [{ date: 20260519 }, { date: 20260520 }],
    now: { date: 20260521, second: 36000 }, partialDay: true,
  });
  check('سری روزانه مشاهده‌ای است و ردیف جاری را صریح کنار می‌گذارد',
    daily.observed && daily.sufficient && daily.reason.includes('روز جاری'));
  check('سری روزانه خالی عدد یا کفایت اختراع نمی‌کند',
    dailyDataQuality({ rows: [] }).missing && !dailyDataQuality({ rows: [] }).sufficient);

  const tape = intradayDataQuality({
    rows: [{ time: 93000, price: 100 }, { time: 94530, price: 101 }], date: 20260521,
  });
  check('ریزمعامله، زمان آخرین مشاهده را از HHMMSS حمل می‌کند',
    tape.observed && tape.asOf.date === 20260521 && tape.asOf.second === 9 * 3600 + 45 * 60 + 30);

  const rawBook = [1, 2, 3, 4, 5].map((level) => ({
    hEven: 93000, refID: level, number: level,
    pMeDem: 1010 - level * 10, qTitMeDem: 100 * level,
    pMeOf: 1010 + level * 10, qTitMeOf: 100 * level,
  }));
  const book = bookAt(normalizeBookEvents(rawBook), 9 * 3600 + 30 * 60);
  check('دفتر کامل و سالم، مدرک قابل اجرا می‌گیرد',
    book.quality.executable && book.quality.sufficient);
  check('مظنه، مدرک کیفیت دفتر را دور نمی‌اندازد',
    quoteFromBook(book).quality.executable);
  const staleBook = bookDataQuality({ ...book, ageSec: 600 }, { date: 20260521, staleAfterSec: 300 });
  check('دفتر کهنه برچسب می‌خورد و کافی اعلام نمی‌شود',
    staleBook.executable && staleBook.stale && !staleBook.sufficient);

  const archiveRows = [{ uaInsCode: '1' }];
  const archiveFound = archiveQuality({
    wanted: 20260521, found: true, rows: archiveRows,
    source: 'watch-archive', asOf: { date: 20260521, second: 45000 },
  });
  const archiveFallback = universeDataQuality({
    wanted: 20250101, found: false, rows: archiveRows, firstDate: 20260521,
  });
  check('universe همان روز مشاهده‌شده و کافی است',
    archiveFound.observed && archiveFound.sufficient && !archiveFound.details.survivalBias);
  check('fallback امروز برای گذشته، تخمینی و ناکافی است',
    archiveFallback.estimated && !archiveFallback.sufficient && archiveFallback.details.survivalBias);
  check('universe خالی فاقد داده می‌ماند',
    universeDataQuality({ wanted: 20260521, found: true, rows: [] }).missing);

  // ——— اتصال واقعی daily/intraday/book در دروازه زمان ———
  const gate = createTimeGate({
    sessionId: 'quality-gate', now: { date: 20260521, second: 10 * 3600 },
    load: {
      dailies: async () => [{ date: 20260520, close: 100 }, { date: 20260521, close: 999 }],
      trades: async () => [{ time: 93000, price: 100, quantity: 10 }],
      book: async () => rawBook,
    },
  });
  const gatedDaily = await gate.history('1');
  const gatedSnapshot = await gate.snapshot('1');
  check('خروجی واقعی daily دروازه، کیفیت مشترک دارد',
    gatedDaily.rows.length === 1 && gatedDaily.quality.observed && gatedDaily.quality.details.partialDay);
  check('خروجی واقعی intraday و book هر دو کیفیت دارند',
    gatedSnapshot.tradeQuality.observed && gatedSnapshot.bookQuality.executable);
  check('کیفیت تجمیعی snapshot منبع و لحظه دروازه را دارد',
    gatedSnapshot.quality.observed && gatedSnapshot.quality.source === 'time-gate-snapshot'
    && gatedSnapshot.quality.asOf.second === 10 * 3600);

  // ——— حمل تا عکس شروع سبد و JSON ———
  const made = createPortfolioSession({
    id: 'pt-quality', baseIns: '900001',
    start: { date: 20260521, second: 10 * 3600 },
    end: { date: 20260621, second: 10 * 3600 },
    initialCapitalRial: 10_000_000_000, reservePct: 20,
  });
  const allocated = setFamilyAllocations(made.session, [{ familyId: 'covered-call', pct: 100 }]);
  const missioned = setPortfolioMission(allocated.session, {
    objective: { mode: 'growth', returnBase: 'allocatable', targetReturnPct: 10, maxHoldingDays: 30 },
    replay: { grain: 'halfHour' },
    outlook: {
      direction: 'bullish', targetPriceRial: 120_000, volatilityView: 'stable',
      confidencePct: 60, thesis: 'انتظار رشد کنترل‌شده',
    },
    risk: {
      maxLossPct: 8, maxDrawdownPct: 15, minFreeCapitalPct: 20,
      maxMarginUsePct: 60, allowUnlimitedRisk: false,
    },
    liquidity: {
      minUnderlyingDailyValueRial: 0, minOptionDailyValueRial: 0,
      minOpenInterest: 0, maxSpreadPct: 10, maxBookTakePct: 30,
      requireFullBook: false,
    },
  });
  const snapshotInput = {
    universe: { rows: archiveRows, quality: archiveFallback },
    daily: { rows: gatedDaily.rows, quality: gatedDaily.quality },
    intraday: { trade: gatedSnapshot.trade, quality: gatedSnapshot.tradeQuality },
    book: { quote: gatedSnapshot.quote, quality: gatedSnapshot.bookQuality },
  };
  const active = activatePortfolioSession(missioned.session, { snapshot: snapshotInput });
  check('عکس شروع، بدترین کیفیت خوراک را حفظ می‌کند',
    active.ok && active.session.startSnapshot.quality.estimated
    && !active.session.startSnapshot.quality.sufficient);
  check('هشدار کیفیت در سطح جلسه برای گزارش آینده می‌ماند',
    active.session.dataWarnings.some((reason) => reason.includes('فهرست امروز')));
  check('snapshot ورودی دست‌نخورده و snapshot قفل‌شده مستقل است',
    snapshotInput.at === undefined && active.session.startSnapshot !== snapshotInput);
  check('کیفیت و هشدار پس از JSON round-trip حذف نمی‌شوند', (() => {
    const round = JSON.parse(JSON.stringify(active.session));
    return round.startSnapshot.quality.estimated
      && round.dataWarnings.join('|') === active.session.dataWarnings.join('|');
  })());
}
