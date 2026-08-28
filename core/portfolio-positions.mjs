// موقعیت‌های باز جلسه — برش سوم فاز ۴.
//
// دفتر سرمایه می‌گوید **چقدر** پول درگیر است. هیچ‌جا نمی‌گفت **چه چیزی**
// در دست است. `replayPortfolioSession` موقعیت را با شناسه و حجم می‌سازد،
// و پاها و اعمال و قیمت ورود در `data` رویدادِ ثبت مانده‌اند؛ هیچ‌کس آن
// دو را کنار هم نمی‌گذاشت. کاربر بعد از ثبت فقط یک شناسهٔ موقعیت می‌دید.
//
// چهار مرز:
//
// **اعداد از سند می‌آیند، نه از بازار امروز.** `vwap` و حجم پرشده همان
// چیزی است که در لحظهٔ ثبت نوشته شد. بازخواندنشان از دفتر سفارشِ امروز
// یعنی گزارشِ دیروز فردا عوض می‌شود و هیچ‌کس نمی‌فهمد چرا.
//
// **موقعیت بی‌سند حذف نمی‌شود.** اگر رویداد ثبتش پیدا نشد، با علت صریح
// می‌ماند. حذفش یعنی فهرست کمتر از واقعیت است و کسی نمی‌فهمد.
//
// **اینجا ارزش‌گذاری نیست.** سود و زیان جاری کار فاز ۵ است. این ماژول
// قیمت لحظه‌ای نمی‌خواند و P&L نمی‌سازد.
//
// **وضعیت از بازپخش می‌آید، نه از روی حجم.** `openQty` صفر با «بسته» یکی
// نیست مگر خودِ بازپخش گفته باشد؛ استنتاجش از روی عدد، یک قاعدهٔ دوم
// می‌سازد که روزی با قاعدهٔ اول اختلاف پیدا می‌کند.

import { PORTFOLIO_COMMIT_VERSION } from './portfolio-commit.mjs';
import { replayPortfolioSession } from './portfolio-session.mjs';

export const PORTFOLIO_POSITIONS_VERSION = 1;

export const PORTFOLIO_POSITIONS_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای خواندن موقعیت‌ها در کار نیست',
  brokenLedger: 'دفتر رویداد جلسه قابل بازپخش نیست',
});

/** علت‌های بی‌سند ماندن یک موقعیت. */
export const UNDOCUMENTED_REASONS = Object.freeze({
  missingEvent: 'رویداد گشایش این موقعیت در دفتر پیدا نشد',
  missingDocument: 'رویداد گشایش سند طرح را همراه ندارد',
  foreignVersion: 'سند طرح با نسخهٔ دیگری از موتور ثبت نوشته شده است',
});

const text = (value) => String(value ?? '').trim();
const money = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function fail(reason, why = '') {
  return {
    version: PORTFOLIO_POSITIONS_VERSION,
    ok: false,
    why: why || PORTFOLIO_POSITIONS_REASONS[reason],
    reason,
    empty: false,
    note: '',
    positions: [],
    open: [],
    closed: [],
    undocumented: null,
    counts: null,
  };
}

/**
 * رویداد گشایش یک موقعیت.
 *
 * نخستین تراکنشِ هر موقعیت همان گشایش است — بازپخش هر ترتیب دیگری را رد
 * می‌کند. پس لازم نیست فهرست «نوع‌های گشایش» اینجا دوباره نوشته شود؛
 * نوشتنش یعنی روزی که آن فهرست عوض شود، اینجا جا می‌ماند.
 */
function openingEvent(session, positionId) {
  return (session?.events || []).find((event) => event?.type === 'transaction'
    && text(event.positionId) === positionId) || null;
}

/** سندِ طرح، یا علتِ نبودنش. هیچ‌کدام بی‌صدا نمی‌مانند. */
function documentFor(event) {
  if (!event) return { document: null, reason: 'missingEvent' };
  const data = event.data;
  if (!data || data.commitVersion === undefined) {
    return { document: null, reason: 'missingDocument' };
  }
  if (data.commitVersion !== PORTFOLIO_COMMIT_VERSION) {
    return { document: null, reason: 'foreignVersion' };
  }
  return { document: data, reason: null };
}

/**
 * موقعیت‌های یک جلسه، با آنچه در لحظهٔ ثبت دربارهٔ هرکدام نوشته شد.
 *
 * وضعیت، حجم و پارتی‌ها از بازپخش می‌آیند؛ پاها، سرمایه و کیفیت از سند.
 * هیچ عددی اینجا دوباره حساب نمی‌شود.
 */
export function portfolioSessionPositions(session) {
  if (!session) return fail('noSession');
  const replay = replayPortfolioSession(session);
  if (!replay.ok) return fail('brokenLedger', replay.why);

  const undocumentedIds = [];
  const eventsByTransaction = new Map((session.events || [])
    .filter((event) => event?.type === 'transaction' && text(event.transactionId))
    .map((event) => [text(event.transactionId), event]));
  const positions = replay.positions.map((row) => {
    const id = text(row.id);
    const event = openingEvent(session, id);
    const { document, reason } = documentFor(event);
    if (!document) undocumentedIds.push(id);
    const openLotBasis = (row.lots || []).filter((lot) => lot.remainingQty > 0).map((lot) => {
      const sourceEvent = eventsByTransaction.get(text(lot.transactionId));
      const source = documentFor(sourceEvent).document;
      const qty = Number(sourceEvent?.qty);
      const share = qty > 0 ? Number(lot.remainingQty) / qty : NaN;
      const entryCashRial = source?.entryCashRial;
      const entryFeeRial = source?.capital?.components?.feeRial;
      const capitalRial = source?.capitalRial;
      const known = Number.isFinite(share) && Number.isFinite(entryCashRial)
        && Number.isFinite(entryFeeRial) && Number.isFinite(capitalRial);
      return { known, share, entryCashRial, entryFeeRial, capitalRial };
    });
    const openBasisKnown = openLotBasis.every((basis) => basis.known);
    const basisSum = (key) => openBasisKnown
      ? openLotBasis.reduce((sum, basis) => sum + basis[key] * basis.share, 0) : null;
    const exitEvents = (session.events || []).filter((item) => item?.type === 'transaction'
      && text(item.positionId) === id
      && ['reduce', 'close', 'rollOut', 'settlement', 'exercise']
        .includes(text(item.transactionKind)));
    const realizedKnown = exitEvents.every((item) => Number.isFinite(item?.data?.realizedRial));

    return {
      id,
      // وضعیت و حجم دستِ بازپخش‌اند. اینجا فقط منتقل می‌شوند.
      status: row.status,
      open: row.status === 'open',
      strategyId: text(row.strategyId),
      familyId: text(row.familyId),
      openedAt: row.openedAt ? { ...row.openedAt } : null,
      closedAt: row.closedAt ? { ...row.closedAt } : null,
      initialQty: row.initialQty,
      openQty: row.openQty,
      lots: copy(row.lots) || [],
      openLots: (row.lots || []).filter((lot) => lot.remainingQty > 0).length,
      transactionIds: [...(row.transactionIds || [])],

      // ── از سند ───────────────────────────────────────────────────────
      documented: Boolean(document),
      // موقعیت بی‌سند حذف نمی‌شود؛ علتش را با خودش می‌برد.
      undocumentedReason: reason,
      why: reason ? UNDOCUMENTED_REASONS[reason] : '',
      defId: document ? text(document.defId) : '',
      candidateId: document ? text(document.candidateId) : '',
      rank: document ? document.rank : null,
      // نبودِ عدد، صفر نمی‌شود.
      capitalRial: document ? money(document.capitalRial) : null,
      entryCashRial: document ? money(document.entryCashRial) : null,
      capital: document ? copy(document.capital) ?? null : null,
      // مبنای حجم باز از lotهای باقی‌مانده می‌آید. پس افزایش در قیمت
      // تازه و کاهش FIFO، هزینهٔ ورود را به نسبتِ اولیه حدس نمی‌زنند.
      openBasisKnown,
      openEntryCashRial: basisSum('entryCashRial'),
      openEntryFeeRial: basisSum('entryFeeRial'),
      openCapitalRial: basisSum('capitalRial'),
      realizedKnown,
      realizedRial: realizedKnown
        ? exitEvents.reduce((sum, item) => sum + Number(item.data.realizedRial), 0) : null,
      realizedWhy: realizedKnown ? '' : 'مبنای سود یکی از خروج‌ها کامل نیست',
      // پاها همان‌اند که ثبت شدند — نه بازخواندن از دفتر سفارشِ امروز.
      legs: document ? (document.legs || []).map((leg) => ({
        ins: text(leg.ins),
        kind: leg.kind,
        side: leg.side,
        ratio: leg.ratio,
        size: leg.size,
        strike: money(leg.strike),
        expiry: leg.expiry,
        vwap: money(leg.vwap),
        filled: money(leg.filled),
      })) : [],
      // کیفیت داخل سند می‌ماند؛ سندی که کیفیتش را نبرد، فردا شبیه دادهٔ
      // قطعی خوانده می‌شود.
      quality: document ? copy(document.quality) ?? null : null,
      score: document ? copy(document.score) ?? null : null,
    };
  });

  const open = positions.filter((row) => row.status === 'open');
  const closed = positions.filter((row) => row.status === 'closed');

  return {
    version: PORTFOLIO_POSITIONS_VERSION,
    ok: true,
    why: '',
    reason: null,
    now: session.now ? { ...session.now } : null,
    empty: positions.length === 0,
    // فهرست خالی خطا نیست، ولی بی‌صدا هم نمی‌ماند.
    note: positions.length === 0 ? 'هیچ موقعیتی در این جلسه ثبت نشده است' : '',
    positions,
    open,
    closed,
    undocumented: { count: undocumentedIds.length, positionIds: undocumentedIds },
    counts: {
      total: positions.length,
      open: open.length,
      closed: closed.length,
      undocumented: undocumentedIds.length,
    },
  };
}
