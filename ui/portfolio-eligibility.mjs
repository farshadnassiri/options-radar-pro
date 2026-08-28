// آداپتر خالص عکس شروع سبد به حکم‌های اجراپذیری رابط.
//
// این لایه فقط شکل داده را عوض می‌کند. قیمت، کیفیت، موقعیت باز و عمق
// گمشده را پر نمی‌کند؛ حکم مالی همچنان فقط در موتور مشترک ساخته می‌شود.

import { portfolioEligibility } from '../core/portfolio-eligible.mjs';
import { activeSnapshot } from '../core/portfolio-snapshot.mjs';

export const PORTFOLIO_ELIGIBILITY_FILTERS = Object.freeze(['all', 'accepted', 'rejected']);

const own = (row, key) => Object.prototype.hasOwnProperty.call(row ?? {}, key)
  ? row[key] : undefined;
const text = (value) => String(value ?? '').trim();

function sameMoment(left, right) {
  return Number.isInteger(left?.date) && Number.isInteger(left?.second)
    && left.date === right?.date && left.second === right?.second;
}

function rawNumber(row, key) {
  // بایگانی دیده‌بان برای بازسازی هویت، صفرهای ساختاری می‌گذارد. آن صفرها
  // مشاهده بازار نیستند و نباید به‌عنوان ارزش یا موقعیت باز خوانده شوند.
  return row?.fromArchive ? undefined : own(row, key);
}

function rawQuote(row, suffix) {
  const bid = rawNumber(row, `pMeDem_${suffix}`);
  const ask = rawNumber(row, `pMeOf_${suffix}`);
  const bidQty = rawNumber(row, `qTitMeDem_${suffix}`);
  const askQty = rawNumber(row, `qTitMeOf_${suffix}`);
  const hasTop = [bid, ask, bidQty, askQty].some((value) => value !== undefined);
  const explicitBook = own(row, `book_${suffix}`);
  const book = Array.isArray(explicitBook)
    ? explicitBook
    : hasTop ? [{ level: 1, bid, bidQty, ask, askQty, asOf: own(row, 'asOf') }] : [];
  return {
    bid, ask, book,
    complete: own(row, `bookComplete_${suffix}`) === true,
    levelsKnown: Array.isArray(explicitBook) ? explicitBook.length : hasTop ? 1 : 0,
    quality: own(row, `bookQuality_${suffix}`),
    asOf: own(row, `quoteAsOf_${suffix}`) ?? own(row, 'asOf'),
  };
}

function directCandidate(row, universeQuality) {
  const id = text(row?.id);
  if (!id) return [];
  return [{
    meta: {
      name: text(row.name) || id,
      kind: text(row.kind),
      side: text(row.side),
    },
    candidate: {
      id,
      side: own(row, 'side'),
      underlyingDailyValueRial: own(row, 'underlyingDailyValueRial'),
      optionDailyValueRial: own(row, 'optionDailyValueRial'),
      openInterest: own(row, 'openInterest'),
      quality: own(row, 'quality') ?? universeQuality,
      listedAt: own(row, 'listedAt'),
      asOf: own(row, 'asOf'),
      quote: own(row, 'quote'),
    },
  }];
}

function watchContracts(row, universeQuality) {
  const out = [];
  for (const suffix of ['C', 'P']) {
    const id = text(row?.[`insCode_${suffix}`]);
    if (!id) continue;
    const kind = suffix === 'C' ? 'call' : 'put';
    const name = text(row?.[`lVal18AFC_${suffix}`]) || id;
    for (const side of ['buy', 'sell']) {
      out.push({
        meta: { name, kind, side },
        candidate: {
          id: `${id}:${side}`,
          side,
          underlyingDailyValueRial: rawNumber(row, 'qTotCap_UA'),
          optionDailyValueRial: rawNumber(row, `qTotCap_${suffix}`),
          openInterest: rawNumber(row, `oP_${suffix}`),
          quality: own(row, `quality_${suffix}`) ?? own(row, 'quality') ?? universeQuality,
          listedAt: own(row, `listedAt_${suffix}`) ?? own(row, 'listedAt'),
          asOf: own(row, `asOf_${suffix}`) ?? own(row, 'asOf'),
          quote: rawQuote(row, suffix),
        },
      });
    }
  }
  return out;
}

function momentContracts(snapshot) {
  const out = [];
  const underlyingValue = own(snapshot, 'underlyingDailyValueRial');
  for (const row of Array.isArray(snapshot?.contracts) ? snapshot.contracts : []) {
    const ins = text(row?.ins);
    if (!ins) continue;
    for (const side of ['buy', 'sell']) {
      out.push({
        meta: { name: text(row?.name) || ins, kind: text(row?.kind), side },
        candidate: {
          id: `${ins}:${side}`,
          side,
          underlyingDailyValueRial: own(row, 'underlyingDailyValueRial') ?? underlyingValue,
          optionDailyValueRial: own(row, 'optionDailyValueRial'),
          openInterest: own(row, 'openInterest'),
          quality: own(row, 'quality') ?? row?.quote?.quality,
          listedAt: own(row, 'listedAt'),
          asOf: own(row, 'asOf'),
          quote: own(row, 'quote'),
        },
      });
    }
  }
  return out;
}

function belongsToBase(row, baseIns) {
  const wanted = text(baseIns);
  if (!wanted) return true;

  // ردیف مستقیم ممکن است از fixture یا آداپتر دیگری آمده باشد. فقط وقتی
  // هویت پایه را صریح دارد آن را می‌سنجیم؛ اما ردیف خام دیده‌بان بدون
  // `uaInsCode` قابل انتساب به جلسه نیست و نباید وارد حکم مالی شود.
  if (text(row?.id)) {
    const explicit = text(row?.baseIns ?? row?.underlyingIns ?? row?.uaInsCode);
    return !explicit || explicit === wanted;
  }
  return text(row?.uaInsCode) === wanted;
}

/** عکس universe را بدون افزودن داده مالی به نامزدهای موتور تبدیل می‌کند. */
export function portfolioEligibilityCandidates(snapshot, { baseIns = '' } = {}) {
  const historical = momentContracts(snapshot);
  if (historical.length) return historical;
  const universe = snapshot?.universe;
  if (!universe || !Array.isArray(universe.rows)) return [];
  return universe.rows.filter((row) => belongsToBase(row, baseIns)).flatMap((row) => (
    text(row?.id) ? directCandidate(row, universe.quality) : watchContracts(row, universe.quality)
  ));
}

/** فقط جلسه فعال و عکس دقیقاً هم‌لحظه ساعت جاری قابل سنجش است. */
export function portfolioSessionEligibility(session, { snapshot: explicitSnapshot = null, at = null } = {}) {
  if (!session || session.state !== 'active') {
    return { ok: false, why: 'حکم اجراپذیری فقط برای جلسهٔ فعال ساخته می‌شود', now: null, rows: [] };
  }
  const snapshot = explicitSnapshot ?? activeSnapshot(session);
  const expected = at ?? session.now;
  if (!snapshot || !sameMoment(snapshot.at, expected)) {
    return { ok: false, why: 'عکس هم‌لحظهٔ ساعت جاری برای سنجش لازم است', now: null, rows: [] };
  }
  if (!session.lockedMission) {
    return { ok: false, why: 'مأموریت قفل‌شده برای سنجش لازم است', now: snapshot.at, rows: [] };
  }
  const baseIns = text(session.baseIns ?? session.lockedMission?.context?.baseIns);
  const entries = portfolioEligibilityCandidates(snapshot, { baseIns });
  const judged = portfolioEligibility(
    session.lockedMission,
    entries.map((entry) => entry.candidate),
    { now: snapshot.at },
  );
  if (!judged.ok) return { ...judged, rows: [] };
  return {
    ok: true,
    why: '',
    now: judged.now,
    rows: judged.results.map((verdict, index) => ({
      ...entries[index].meta,
      ...verdict,
    })),
  };
}

/** فیلتر فقط نمای تازه‌ای از حکم‌های ثابت می‌سازد و ورودی را تغییر نمی‌دهد. */
export function filterPortfolioEligibilityRows(rows = [], filter = 'all') {
  const list = Array.isArray(rows) ? rows : [];
  if (filter === 'accepted') return list.filter((row) => row.accepted);
  if (filter === 'rejected') return list.filter((row) => !row.accepted);
  return list.slice();
}
