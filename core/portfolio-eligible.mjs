// دروازهٔ اجراپذیری نامزدهای استودیوی سفر زمانی سبد.
//
// این ماژول پیشنهاد نمی‌سازد و رتبه نمی‌دهد. فقط یک پرسش را پاسخ می‌دهد:
// آیا این قرارداد، با قیود قفل‌شدهٔ مأموریت و دفتر همان لحظه، اصلاً قابل
// معامله است؟ حجم فقط از دفتر می‌آید؛ نبود دفتر هرگز با حجم تخمینی پر نمی‌شود.

import { bookCapacity, spreadPct, walkBook } from './exec.mjs';
import { isDataQuality, normalizeDataQuality } from './data-quality.mjs';
import { PORTFOLIO_MISSION_VERSION, validateMissionLiquidity } from './portfolio-mission.mjs';
import { num } from './num.mjs';

export const PORTFOLIO_ELIGIBILITY_VERSION = 1;

export const PORTFOLIO_ELIGIBILITY_REASONS = {
  futureData: 'دادهٔ نامزد متعلق به بعد از لحظهٔ جاری است',
  futureListing: 'قرارداد تا لحظهٔ جاری منتشر نشده بود',
  missingQuality: 'مدرک کیفیت خوراک نامزد موجود نیست',
  missingFeed: 'خوراک نامزد فاقد داده است',
  staleFeed: 'خوراک نامزد کهنه است',
  estimatedFeed: 'خوراک نامزد تخمینی است',
  underlyingValueMissing: 'ارزش روزانهٔ نماد پایه موجود نیست',
  underlyingValueLow: 'ارزش روزانهٔ نماد پایه از کف مأموریت کمتر است',
  optionValueMissing: 'ارزش روزانهٔ اختیار موجود نیست',
  optionValueLow: 'ارزش روزانهٔ اختیار از کف مأموریت کمتر است',
  openInterestMissing: 'موقعیت باز قرارداد موجود نیست',
  openInterestLow: 'موقعیت باز قرارداد از کف مأموریت کمتر است',
  missingBook: 'دفتر سفارش قرارداد موجود نیست',
  invalidBook: 'دفتر سفارش برای اجرای واقعی معتبر نیست',
  staleBook: 'دفتر سفارش کهنه است',
  incompleteBook: 'هر پنج سطح دفتر سفارش شناخته‌شده نیست',
  spreadMissing: 'اسپرد قابل سنجش نیست',
  spreadWide: 'اسپرد از سقف مأموریت بیشتر است',
  invalidSide: 'سمت معامله باید خرید یا فروش باشد',
  noCapacity: 'پس از اعمال سقف مصرف عمق، حجم قابل اجرا وجود ندارد',
};

function moment(value, fallbackDate = 0) {
  if (value && typeof value === 'object') {
    const date = Math.trunc(num(value.date, NaN));
    const second = Math.trunc(num(value.second, NaN));
    return Number.isInteger(date) && date > 0 && Number.isInteger(second) && second >= 0
      ? { date, second } : null;
  }
  const second = Math.trunc(num(value, NaN));
  return Number.isInteger(fallbackDate) && fallbackDate > 0
    && Number.isInteger(second) && second >= 0 ? { date: fallbackDate, second } : null;
}

function after(left, right) {
  return !!left && !!right && (left.date > right.date
    || (left.date === right.date && left.second > right.second));
}

function reason(code) {
  return { code, label: PORTFOLIO_ELIGIBILITY_REASONS[code] };
}

function addReason(reasons, code) {
  if (!reasons.some((row) => row.code === code)) reasons.push(reason(code));
}

function qualityOf(value) {
  return isDataQuality(value) ? normalizeDataQuality(value) : null;
}

function qualityMoment(value, now) {
  return moment(value?.asOf, now.date);
}

function topQuote(quote, book) {
  const first = book[0] || {};
  return {
    bid: num(quote?.bid, num(first.bid, NaN)),
    ask: num(quote?.ask, num(first.ask, NaN)),
  };
}

function levelsKnown(quote, bookQuality, book) {
  const fromQuality = num(bookQuality?.details?.levelsKnown, NaN);
  if (Number.isFinite(fromQuality)) return Math.max(0, Math.trunc(fromQuality));
  const explicit = num(quote?.levelsKnown, NaN);
  if (Number.isFinite(explicit)) return Math.max(0, Math.trunc(explicit));
  return book.length;
}

function futureReason(candidate, quote, candidateQuality, bookQuality, now) {
  const listedAt = moment(candidate?.listedAt ?? candidate?.firstSeenAt, now.date);
  if (after(listedAt, now)) return 'futureListing';

  const points = [
    moment(candidate?.asOf, now.date),
    qualityMoment(candidateQuality, now),
    moment(quote?.asOf, now.date),
    qualityMoment(bookQuality, now),
  ].filter(Boolean);
  if (points.some((point) => after(point, now))) return 'futureData';

  const rows = Array.isArray(quote?.book) ? quote.book : [];
  if (rows.some((row) => after(moment(row?.asOf ?? row?.second, now.date), now))) {
    return 'futureData';
  }
  return '';
}

function rejected(candidateId, reasons, candidateQuality = null, bookQuality = null) {
  return {
    version: PORTFOLIO_ELIGIBILITY_VERSION,
    candidateId,
    verdict: 'rejected',
    accepted: false,
    reasons: reasons.length ? reasons : [reason('invalidBook')],
    executableQty: null,
    execution: null,
    quality: { candidate: candidateQuality, book: bookQuality },
  };
}

/**
 * سنجش اجراپذیری یک فهرست قرارداد در یک لحظهٔ صریح.
 *
 * شکل حداقلی نامزد:
 * { id, side, underlyingDailyValueRial, optionDailyValueRial, openInterest,
 *   quality, listedAt?, asOf?, quote: { bid, ask, book, quality, complete? } }
 */
export function portfolioEligibility(mission, candidates = [], { now = null } = {}) {
  const current = moment(now);
  if (!current) return { ok: false, why: 'لحظهٔ جاری معتبر و صریح لازم است', now: null, results: [] };
  if (!mission || mission.version !== PORTFOLIO_MISSION_VERSION || !mission.id || !mission.context) {
    return { ok: false, why: 'مأموریت قفل‌شده و معتبر لازم است', now: current, results: [] };
  }
  const checkedLiquidity = validateMissionLiquidity(mission.liquidity);
  if (!checkedLiquidity.ok) {
    return { ok: false, why: checkedLiquidity.why, now: current, results: [] };
  }
  if (!Array.isArray(candidates)) {
    return { ok: false, why: 'فهرست نامزدها باید آرایه باشد', now: current, results: [] };
  }

  const liquidity = checkedLiquidity.liquidity;
  const takePct = liquidity.maxBookTakePct / 100;
  const results = candidates.map((candidate, index) => {
    const candidateId = String(candidate?.id || `candidate-${index + 1}`);
    const quote = candidate?.quote && typeof candidate.quote === 'object' ? candidate.quote : null;
    const candidateQuality = qualityOf(candidate?.quality);
    const bookQuality = qualityOf(quote?.quality ?? candidate?.bookQuality);
    const temporal = futureReason(candidate, quote, candidateQuality, bookQuality, current);
    if (temporal) return rejected(candidateId, [reason(temporal)], candidateQuality, bookQuality);

    const reasons = [];
    if (!candidateQuality) addReason(reasons, 'missingQuality');
    else {
      if (candidateQuality.missing) addReason(reasons, 'missingFeed');
      if (candidateQuality.stale) addReason(reasons, 'staleFeed');
      if (candidateQuality.estimated) addReason(reasons, 'estimatedFeed');
    }

    const underlyingValue = num(candidate?.underlyingDailyValueRial, NaN);
    if (!Number.isFinite(underlyingValue)) addReason(reasons, 'underlyingValueMissing');
    else if (underlyingValue < liquidity.minUnderlyingDailyValueRial) addReason(reasons, 'underlyingValueLow');

    const optionValue = num(candidate?.optionDailyValueRial, NaN);
    if (!Number.isFinite(optionValue)) addReason(reasons, 'optionValueMissing');
    else if (optionValue < liquidity.minOptionDailyValueRial) addReason(reasons, 'optionValueLow');

    const openInterest = num(candidate?.openInterest, NaN);
    if (!Number.isFinite(openInterest)) addReason(reasons, 'openInterestMissing');
    else if (openInterest < liquidity.minOpenInterest) addReason(reasons, 'openInterestLow');

    const side = String(candidate?.side || '');
    if (side !== 'buy' && side !== 'sell') addReason(reasons, 'invalidSide');

    const book = Array.isArray(quote?.book) ? quote.book : [];
    if (!quote || !book.length) addReason(reasons, 'missingBook');
    if (!bookQuality) addReason(reasons, 'invalidBook');
    else {
      if (bookQuality.missing || !bookQuality.executable) addReason(reasons, 'invalidBook');
      if (bookQuality.stale) addReason(reasons, 'staleBook');
    }
    if (liquidity.requireFullBook && levelsKnown(quote, bookQuality, book) < 5) {
      addReason(reasons, 'incompleteBook');
    }

    const spread = topQuote(quote, book);
    const spreadValue = spreadPct(spread);
    if (!Number.isFinite(spreadValue)) addReason(reasons, 'spreadMissing');
    else if (spreadValue > liquidity.maxSpreadPct) addReason(reasons, 'spreadWide');

    // تا وقتی دفتر از همهٔ دروازه‌های بالا نگذشته، حتی ظرفیتش هم خوانده
    // نمی‌شود؛ بنابراین عددی از دفتر گمشده/کهنه/آینده بیرون نمی‌آید.
    const bookBlocked = reasons.some((row) => [
      'futureData', 'futureListing', 'missingBook', 'invalidBook', 'staleBook',
      'incompleteBook', 'spreadMissing', 'invalidSide',
    ].includes(row.code));
    if (bookBlocked) return rejected(candidateId, reasons, candidateQuality, bookQuality);

    const capacity = Math.floor(bookCapacity(book, side, 0, Infinity, takePct));
    if (!(capacity > 0)) {
      addReason(reasons, 'noCapacity');
      return rejected(candidateId, reasons, candidateQuality, bookQuality);
    }
    const walked = walkBook(book, capacity, side, 0, takePct);
    if (!walked.full || walked.filled !== capacity) {
      addReason(reasons, 'noCapacity');
      return rejected(candidateId, reasons, candidateQuality, bookQuality);
    }

    if (reasons.length) return rejected(candidateId, reasons, candidateQuality, bookQuality);
    return {
      version: PORTFOLIO_ELIGIBILITY_VERSION,
      candidateId,
      verdict: 'accepted',
      accepted: true,
      reasons: [],
      executableQty: capacity,
      execution: {
        side, vwap: walked.vwap, top: walked.top, filled: walked.filled,
        levels: walked.levels, maxBookTakePct: liquidity.maxBookTakePct,
      },
      quality: { candidate: candidateQuality, book: bookQuality },
    };
  });

  return {
    ok: true,
    why: '',
    now: current,
    results,
    accepted: results.filter((row) => row.accepted),
    rejected: results.filter((row) => !row.accepted),
  };
}

