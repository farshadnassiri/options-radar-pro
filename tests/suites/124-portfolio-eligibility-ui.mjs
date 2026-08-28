// ۱۲۴. مدرک اجراپذیری جلسهٔ فعال در رابط

import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { createPortfolioMission } from '../../core/portfolio-mission.mjs';
import {
  filterPortfolioEligibilityRows, portfolioEligibilityCandidates, portfolioSessionEligibility,
} from '../../ui/portfolio-eligibility.mjs';

group('۱۲۴. مدرک اجراپذیری جلسهٔ فعال در رابط');
{
  const at124 = { date: 20260521, second: 10 * 3600 };
  const made124 = createPortfolioMission({
    id: 'pt-eligible-ui', portfolioId: 'portfolio-eligible-ui', baseIns: '900001',
    start: at124, end: { date: 20260621, second: 10 * 3600 },
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
  check('مأموریت مبنای رابط معتبر است', made124.ok, made124.why);

  const feed = makeDataQuality({
    kind: 'observed', source: 'candidate-feed', asOf: at124, sufficient: true,
  });
  const bookQuality = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: at124, sufficient: true,
    details: { levelsKnown: 5, levelsTotal: 5 },
  });
  const book = [1, 2, 3, 4, 5].map((level) => ({
    level, bid: 100 - level, bidQty: 100,
    ask: 104 + level, askQty: 100, second: at124.second,
  }));
  const universeQuality = makeDataQuality({
    kind: 'observed', source: 'watch-archive', asOf: at124, sufficient: true,
  });
  const snapshot = {
    at: at124,
    universe: {
      quality: universeQuality,
      rows: [{
        id: 'opt-ok', name: 'اختیار نمونه', kind: 'call', side: 'buy', asOf: at124,
        underlyingDailyValueRial: 200_000_000,
        optionDailyValueRial: 20_000_000, openInterest: 200, quality: feed,
        quote: { bid: 99, ask: 105, book, complete: true, quality: bookQuality },
      }, {
        id: 'opt-missing', name: 'اختیار ناقص', kind: 'put', side: 'sell', quality: feed,
      }, {
        id: 'opt-future', name: 'اختیار آینده', kind: 'call', side: 'buy',
        asOf: { date: at124.date, second: at124.second + 1 }, quality: feed,
      }],
    },
  };
  const active = {
    state: 'active', start: at124, now: at124, lockedMission: made124.mission,
    startSnapshot: snapshot,
  };
  const evidence = portfolioSessionEligibility(active);
  check('جلسه فعال با مأموریت و عکس قفل‌شده سنجیده می‌شود',
    evidence.ok && evidence.now.date === at124.date && evidence.rows.length === 3, evidence.why);
  check('نام، سمت، حکم، علت‌ها، کیفیت و سقف اجرا در هر ردیف حفظ می‌شوند',
    evidence.rows[0]?.name === 'اختیار نمونه'
    && evidence.rows[0]?.side === 'buy' && evidence.rows[0]?.accepted
    && evidence.rows[0]?.quality?.candidate?.source === 'candidate-feed'
    && evidence.rows[0]?.executableQty === 150
    && evidence.rows[1]?.reasons.length > 0 && evidence.rows[1]?.executableQty === null);
  check('لحظه حکم فقط لحظه snapshot است و داده آینده را راه نمی‌دهد',
    evidence.rows[2]?.reasons.some((row) => row.code === 'futureData'));

  check('پیش‌نویس حتی با universe موجود حکم ساخته‌شده نمی‌گیرد',
    !portfolioSessionEligibility({ ...active, state: 'draft' }).ok
    && portfolioSessionEligibility({ ...active, state: 'draft' }).rows.length === 0);
  check('عکس ناهم‌لحظه با ساعت جاری پذیرفته نمی‌شود',
    !portfolioSessionEligibility({
      ...active,
      startSnapshot: { ...snapshot, at: { date: at124.date, second: at124.second + 1 } },
    }).ok);

  const later124 = { date: at124.date, second: at124.second + 15 * 60 };
  const laterFeed124 = makeDataQuality({
    kind: 'observed', source: 'candidate-feed', asOf: later124, sufficient: true,
  });
  const laterBook124 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: later124, sufficient: true,
    details: { levelsKnown: 5, levelsTotal: 5 },
  });
  const currentSnapshot124 = {
    at: later124,
    universe: {
      quality: laterFeed124,
      rows: [{
        ...snapshot.universe.rows[0], asOf: later124, quality: laterFeed124,
        quote: {
          ...snapshot.universe.rows[0].quote,
          book: book.map((level) => ({ ...level, second: later124.second })),
          quality: laterBook124,
        },
      }],
    },
  };
  const movedEvidence124 = portfolioSessionEligibility({
    ...active, now: later124, momentSnapshot: currentSnapshot124,
  });
  check('پس از حرکت، حکم از Snapshot جاری ساخته می‌شود نه عکس شروع',
    movedEvidence124.ok && movedEvidence124.now.second === later124.second
    && movedEvidence124.rows.length === 1 && movedEvidence124.rows[0].accepted,
    movedEvidence124.why);

  const before = JSON.stringify(evidence.rows);
  const accepted = filterPortfolioEligibilityRows(evidence.rows, 'accepted');
  const rejected = filterPortfolioEligibilityRows(evidence.rows, 'rejected');
  check('فیلتر پذیرفته و ردشده فقط نمایش را عوض می‌کند',
    accepted.length === 1 && rejected.length === 2 && JSON.stringify(evidence.rows) === before);

  const archivedRows = [{
    fromArchive: true, uaInsCode: '900001', insCode_C: 'opt-c', insCode_P: 'opt-p',
    lVal18AFC_C: 'خرید نمونه', lVal18AFC_P: 'فروش نمونه',
    qTotCap_UA: 0, qTotCap_C: 0, qTotCap_P: 0, oP_C: 0, oP_P: 0,
    pMeDem_C: 0, qTitMeDem_C: 0, pMeOf_C: 0, qTitMeOf_C: 0,
    pMeDem_P: 0, qTitMeDem_P: 0, pMeOf_P: 0, qTitMeOf_P: 0,
  }];
  const archivedCandidates = portfolioEligibilityCandidates({
    at: at124, universe: { rows: archivedRows, quality: universeQuality },
  });
  check('هر قرارداد خام برای دو سمت صریح ساخته می‌شود، نه سمت حدسی',
    archivedCandidates.length === 4
    && archivedCandidates.map((row) => row.meta.side).join(',') === 'buy,sell,buy,sell');
  const archivedEvidence = portfolioSessionEligibility({
    ...active, startSnapshot: {
      at: at124, universe: { rows: archivedRows, quality: universeQuality },
    },
  });
  check('صفرهای ساختاری بایگانی به عدد مالی تبدیل نمی‌شوند',
    archivedEvidence.rows.every((row) => row.executableQty === null)
    && archivedEvidence.rows.every((row) => row.reasons.some((why) => why.code === 'underlyingValueMissing')));

  const adapter = readSrc('../ui/portfolio-eligibility.mjs');
  const tab = readSrc('../ui/tabs/portfolio-time.mjs');
  const css = readSrc('../ui/style.css');
  check('آداپتر خالص است و حکم را به موتور مشترک می‌سپارد',
    adapter.includes("from '../core/portfolio-eligible.mjs'")
    && adapter.includes('portfolioEligibility(')
    && !/document\.|fetch\(|Date\.now/.test(adapter));
  check('جدول مدرک و سه فیلتر در تب جلسه حضور دارند',
    ['pt-eligibility', 'pt-eligibility-body', 'pt-eligibility-state']
      .every((id) => tab.includes(`id="${id}"`))
    && ['all', 'accepted', 'rejected']
      .every((mode) => tab.includes(`data-pt-eligibility-filter="${mode}"`)));
  check('نمای موبایل جدول را کارت تک‌ستونه می‌کند و اسکرول افقی نمی‌سازد',
    css.includes('.pt-eligibility-table')
    && css.includes('.pt-eligibility-table td::before')
    && css.includes('grid-template-columns: minmax(0, 1fr)'));
}
