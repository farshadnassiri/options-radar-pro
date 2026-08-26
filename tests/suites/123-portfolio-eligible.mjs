// ۱۲۳. دروازهٔ اجراپذیری نامزدهای سبد

import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { portfolioEligibility } from '../../core/portfolio-eligible.mjs';
import { createPortfolioMission } from '../../core/portfolio-mission.mjs';

group('۱۲۳. دروازهٔ اجراپذیری نامزدهای سبد');
{
  const now123 = { date: 20260521, second: 10 * 3600 };
  const made123 = createPortfolioMission({
    id: 'pt-eligible', portfolioId: 'portfolio-eligible', baseIns: '900001',
    start: now123, end: { date: 20260621, second: 10 * 3600 },
    capital: { initialRial: 10_000_000_000, allocatableRial: 8_000_000_000 },
  }, {
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
      minUnderlyingDailyValueRial: 100_000_000,
      minOptionDailyValueRial: 10_000_000,
      minOpenInterest: 100, maxSpreadPct: 8, maxBookTakePct: 30,
      requireFullBook: true,
    },
  });
  check('مأموریت مبنای آزمون معتبر است', made123.ok, made123.why);

  const feedQuality = (kind = 'observed', extra = {}) => makeDataQuality({
    kind, source: 'candidate-feed', asOf: now123, sufficient: true, ...extra,
  });
  const bookQuality = (extra = {}) => makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: now123,
    sufficient: true, details: { levelsKnown: 5, levelsTotal: 5 }, ...extra,
  });
  const book123 = [1, 2, 3, 4, 5].map((level) => ({
    level, bid: 100 - level, bidQty: 100,
    ask: 104 + level, askQty: 100, second: now123.second,
  }));
  const candidate = (id, patch = {}) => ({
    id, side: 'buy', asOf: now123,
    underlyingDailyValueRial: 200_000_000,
    optionDailyValueRial: 20_000_000,
    openInterest: 200,
    quality: feedQuality(),
    quote: { bid: 99, ask: 105, book: book123, complete: true, quality: bookQuality() },
    ...patch,
  });

  const accepted = portfolioEligibility(made123.mission, [candidate('ok')], { now: now123 });
  check('نامزد واجد شرایط حکم صریح پذیرفته می‌گیرد',
    accepted.ok && accepted.results[0]?.verdict === 'accepted' && accepted.results[0]?.accepted);
  check('حجم از سی درصد پنج سطح واقعی دفتر می‌آید',
    accepted.results[0]?.executableQty === 150, String(accepted.results[0]?.executableQty));
  check('اجرای پذیرفته‌شده با عبور واقعی دفتر کامل می‌شود',
    accepted.results[0]?.execution?.filled === 150 && accepted.results[0]?.execution?.levels === 5);

  // هر شش قید نقدشوندگی باید حکم نام‌بُرده بسازند.
  const constrained = portfolioEligibility(made123.mission, [
    candidate('underlying-low', { underlyingDailyValueRial: 99_999_999 }),
    candidate('option-low', { optionDailyValueRial: 9_999_999 }),
    candidate('oi-low', { openInterest: 99 }),
    candidate('spread-wide', {
      quote: { bid: 90, ask: 110, book: book123, complete: true, quality: bookQuality() },
    }),
    candidate('not-full', {
      quote: {
        bid: 99, ask: 105, book: book123.slice(0, 4), complete: false,
        quality: bookQuality({ sufficient: false, details: { levelsKnown: 4, levelsTotal: 5 } }),
      },
    }),
  ], { now: now123 });
  const codes = (id) => constrained.results.find((row) => row.candidateId === id)?.reasons.map((row) => row.code) || [];
  check('کف ارزش پایه علت مستقل دارد', codes('underlying-low').includes('underlyingValueLow'));
  check('کف ارزش اختیار علت مستقل دارد', codes('option-low').includes('optionValueLow'));
  check('کف موقعیت باز علت مستقل دارد', codes('oi-low').includes('openInterestLow'));
  check('سقف اسپرد علت مستقل دارد', codes('spread-wide').includes('spreadWide'));
  check('الزام پنج سطح علت مستقل دارد', codes('not-full').includes('incompleteBook'));
  check('هر حکم ردشده دست‌کم یک علت نام‌بُرده دارد',
    constrained.rejected.every((row) => row.reasons.length > 0 && row.reasons.every((why) => why.code && why.label)));

  const relaxedMission = JSON.parse(JSON.stringify(made123.mission));
  relaxedMission.liquidity.requireFullBook = false;
  const relaxed = portfolioEligibility(relaxedMission, [candidate('four-level', {
    quote: {
      bid: 99, ask: 105, book: book123.slice(0, 4), complete: false,
      quality: bookQuality({ sufficient: false, details: { levelsKnown: 4, levelsTotal: 5 } }),
    },
  })], { now: now123 });
  check('دفتر چهارسـطحی فقط وقتی الزام خاموش است پذیرفته می‌شود',
    relaxed.results[0]?.accepted && relaxed.results[0]?.executableQty === 120);

  const missingBook = portfolioEligibility(made123.mission, [candidate('no-book', {
    quote: { bid: 99, ask: 105, book: [], complete: false, quality: feedQuality('missing') },
  })], { now: now123 }).results[0];
  check('دفتر نبوده رد می‌شود و حجم null می‌ماند',
    !missingBook.accepted && missingBook.executableQty === null
    && missingBook.reasons.some((row) => row.code === 'missingBook'));

  const qualityRows = portfolioEligibility(made123.mission, [
    candidate('missing-feed', { quality: feedQuality('missing') }),
    candidate('stale-feed', { quality: feedQuality('observed', { stale: true }) }),
    candidate('stale-book', {
      quote: { bid: 99, ask: 105, book: book123, complete: true, quality: bookQuality({ stale: true }) },
    }),
  ], { now: now123 });
  check('خوراک فاقد داده با همان کیفیت رد می‌شود',
    qualityRows.results[0].reasons.some((row) => row.code === 'missingFeed'));
  check('خوراک نامزد کهنه پذیرفته نمی‌شود',
    qualityRows.results[1].reasons.some((row) => row.code === 'staleFeed'));
  check('دفتر کهنه حجم اجراپذیر نمی‌سازد',
    qualityRows.results[2].executableQty === null
    && qualityRows.results[2].reasons.some((row) => row.code === 'staleBook'));

  const futurePrice = candidate('future-price', {
    asOf: { date: now123.date, second: now123.second + 1 },
    quote: {
      bid: 500, ask: 501,
      book: book123.map((row) => ({ ...row, second: now123.second + 1 })),
      complete: true,
      quality: bookQuality({ asOf: { date: now123.date, second: now123.second + 1 } }),
    },
  });
  const futureListing = candidate('future-listing', {
    listedAt: { date: now123.date, second: now123.second + 1 },
  });
  Object.defineProperty(futureListing, 'underlyingDailyValueRial', {
    get() { throw new Error('دادهٔ قرارداد آینده نباید خوانده شود'); },
  });
  const temporal = portfolioEligibility(made123.mission, [futurePrice, futureListing], { now: now123 });
  check('قیمت و دفتر آینده پیش از محاسبه رد می‌شوند',
    temporal.results[0].executableQty === null
    && temporal.results[0].reasons.some((row) => row.code === 'futureData'));
  check('قرارداد تازه‌منتشرشده پیش از خواندن عددهایش رد می‌شود',
    temporal.results[1].executableQty === null
    && temporal.results[1].reasons.some((row) => row.code === 'futureListing'));

  check('لحظه جاری و مأموریت معتبر اجباری‌اند',
    !portfolioEligibility(made123.mission, [], {}).ok
    && !portfolioEligibility({}, [], { now: now123 }).ok);
  const src = readSrc('../core/portfolio-eligible.mjs');
  check('موتور خالص به DOM و شبکه دست نمی‌زند', !/document\.|fetch\(/.test(src));
  check('حجم فقط از موتور مشترک دفتر می‌آید',
    src.includes("from './exec.mjs'") && src.includes('bookCapacity(') && src.includes('walkBook('));
}
