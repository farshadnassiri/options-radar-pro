// بستن موقعیت — برش پنجم فاز ۴.
//
// موقعیت باز می‌شد ولی هیچ راهی برای بستنش نبود. دفتر رویداد تراکنش خروج
// را می‌شناسد و حجم را FIFO از پارتی‌ها برمی‌دارد، ولی هیچ‌کس آن را با
// قیمت اجرایی و کارمزدِ لحظهٔ خروج نمی‌ساخت. جلسه یک‌طرفه بود.
//
// پنج مرز:
//
// **قیمت خروج از دفتر سفارشِ همان لحظه.** مدرک اجراپذیری باید هم‌لحظهٔ
// خروج باشد؛ قیمتِ کهنه یعنی سندی که می‌گوید معامله‌ای در قیمتی انجام شد
// که آن لحظه وجود نداشت.
//
// **حجم برای جا شدن بزرگ نمی‌شود.** اگر دفتر سفارش کمتر از خواسته جا
// دارد، خروج **رد** می‌شود و هر دو عدد گفته می‌شوند. بستنِ بی‌صدای کمتر
// یعنی کاربر فکر می‌کند تخت شده و نشده.
//
// **سمت خروج، وارونهٔ سمت ورود است.** پای خریداری‌شده فروخته می‌شود و
// برعکس. خواندن قیمت از همان سمتِ ورود یعنی سمتِ اشتباهِ اسپرد.
//
// **وضعیت را بازپخش تعیین می‌کند.** اینجا «بسته» علامت زده نمی‌شود؛
// تراکنش ثبت می‌شود و وضعیت از دفتر خوانده می‌شود.
//
// **سود تحقق‌یافته فقط از lot مصرف‌شده است.** نقد ورود و کارمزد هر lot
// از سند immutable خودش می‌آید؛ اگر مبنا ناقص باشد عدد ساخته نمی‌شود.

import { combineDataQuality } from './data-quality.mjs';
import { entryFees, grossCash } from './payoff.mjs';
import { portfolioSessionPositions } from './portfolio-positions.mjs';
import { PORTFOLIO_SCHEMA_VERSION, recordPortfolioTransaction } from './portfolio-session.mjs';

export const PORTFOLIO_CLOSE_VERSION = 1;

export const PORTFOLIO_CLOSE_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای بستن موقعیت در کار نیست',
  brokenLedger: 'دفتر رویداد جلسه قابل بازپخش نیست',
  unknownPosition: 'موقعیتی با این شناسه در جلسه نیست',
  alreadyClosed: 'این موقعیت از پیش بسته شده است',
  undocumentedPosition: 'سند طرحِ این موقعیت خوانده نشد، پس پاهایش قیمت نمی‌گیرند',
  staleEvidence: 'مدرک اجراپذیری هم‌لحظهٔ خروج نیست',
  invalidQty: 'حجم خروج باید عدد صحیح مثبت باشد',
  qtyTooLarge: 'حجم خروج از حجم باز موقعیت بیشتر است',
  missingFees: 'نرخ کارمزد اختیار در عکس شروع نیست',
  rejectedLeg: 'برای بستن این پا حکم اجراپذیری پذیرفته‌شده‌ای نیست',
  missingCapacity: 'دفتر سفارش برای بستن این پا ظرفیتی ندارد',
  unknownPrice: 'قیمت اجرایی خروج برای این پا معلوم نیست',
  insufficientBook: 'دفتر سفارش کمتر از حجم خواسته‌شده جا دارد',
  ledgerRejected: 'دفتر رویداد این خروج را نپذیرفت',
});

const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value);
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const OPPOSITE = Object.freeze({ buy: 'sell', sell: 'buy' });

function fail(reason, detail = '', extra = {}) {
  return {
    version: PORTFOLIO_CLOSE_VERSION,
    ok: false,
    why: detail ? `${PORTFOLIO_CLOSE_REASONS[reason]} — ${detail}` : PORTFOLIO_CLOSE_REASONS[reason],
    reason,
    session: extra.session ?? null,
    event: null,
    positionId: text(extra.positionId),
    qty: extra.qty ?? null,
    executableQty: extra.executableQty ?? null,
    requestedQty: extra.requestedQty ?? null,
  };
}

/** حجمِ هر پا به ازای یک واحد از ترکیب — همان قاعدهٔ طرح ورود. */
function perCombo(leg) {
  const ratio = num(leg?.ratio);
  if (!(ratio > 0)) return NaN;
  return leg?.kind === 'underlying' ? ratio * num(leg?.size) : ratio;
}

function verdictIndex(evidence) {
  const out = new Map();
  for (const row of Array.isArray(evidence?.rows) ? evidence.rows : []) {
    const id = text(row?.candidateId);
    if (id) out.set(id, row);
  }
  return out;
}

const sameMoment = (a, b) => Boolean(a && b
  && Number(a.date) === Number(b.date) && Number(a.second) === Number(b.second));

/** مبنای ورود lotهایی که این خروج با FIFO مصرف می‌کند. */
function consumedEntryBasis(session, position, qty) {
  const events = new Map((session?.events || [])
    .filter((event) => event?.type === 'transaction')
    .map((event) => [text(event.transactionId), event]));
  let left = qty;
  let entryCashRial = 0;
  let entryFeeRial = 0;
  const lots = [];
  for (const lot of position.lots || []) {
    if (!(left > 0) || !(lot.remainingQty > 0)) continue;
    const take = Math.min(left, lot.remainingQty);
    const event = events.get(text(lot.transactionId));
    const eventQty = num(event?.qty);
    const cash = event?.data?.entryCashRial;
    const fee = event?.data?.capital?.components?.feeRial;
    if (!(eventQty > 0) || !Number.isFinite(cash) || !Number.isFinite(fee)) {
      return { known: false, entryCashRial: null, entryFeeRial: null, lots: [] };
    }
    const share = take / eventQty;
    entryCashRial += cash * share;
    entryFeeRial += fee * share;
    lots.push({ lotId: lot.id, transactionId: lot.transactionId, qty: take });
    left -= take;
  }
  return {
    known: left === 0,
    entryCashRial: left === 0 ? entryCashRial : null,
    entryFeeRial: left === 0 ? entryFeeRial : null,
    lots: left === 0 ? lots : [],
  };
}

/**
 * بستن یک موقعیت — کامل یا جزئی.
 *
 * `qty` را ندهید تا کل حجم باز بسته شود. `evidence` همان مدرک اجراپذیری
 * است که برای **لحظهٔ خروج** ساخته شده، نه لحظهٔ ورود.
 */
export function closePortfolioPosition(session, evidence, positionId, { qty, at } = {}) {
  const wanted = text(positionId);
  const state = portfolioSessionPositions(session);
  if (!state.ok) return fail(state.reason === 'noSession' ? 'noSession' : 'brokenLedger', state.why);

  const position = state.positions.find((row) => row.id === wanted);
  if (!position) return fail('unknownPosition', wanted, { positionId: wanted });
  if (position.status !== 'open') return fail('alreadyClosed', wanted, { positionId: wanted });
  // بدون سند، پاها معلوم نیستند و قیمت‌گرفتنشان یعنی حدس‌زدن اینکه چه
  // چیزی در دست است.
  if (!position.documented) {
    return fail('undocumentedPosition', position.why, { positionId: wanted });
  }

  const moment = at ? { date: Number(at.date), second: Number(at.second) } : (session.now || null);
  if (!evidence?.ok || !sameMoment(evidence.now, moment)) {
    return fail('staleEvidence', '', { positionId: wanted });
  }

  const requestedQty = qty === undefined ? position.openQty : num(qty);
  if (!Number.isSafeInteger(requestedQty) || requestedQty <= 0) {
    return fail('invalidQty', '', { positionId: wanted, requestedQty });
  }
  if (requestedQty > position.openQty) {
    return fail('qtyTooLarge', `${requestedQty} در برابر ${position.openQty}`,
      { positionId: wanted, requestedQty });
  }

  const fees = session.startSnapshot?.capitalInputs?.fees;
  if (!Number.isFinite(num(fees?.option))) {
    return fail('missingFees', '', { positionId: wanted });
  }

  const verdicts = verdictIndex(evidence);
  const prepared = [];
  for (const leg of position.legs) {
    const per = perCombo(leg);
    const exitSide = OPPOSITE[leg.side];
    if (!(per > 0) || !exitSide) return fail('rejectedLeg', text(leg.ins), { positionId: wanted });

    // سمت وارونه: پای خریداری‌شده فروخته می‌شود. خواندن از همان سمتِ
    // ورود یعنی سمتِ اشتباهِ اسپرد و قیمتی که هیچ‌وقت گرفته نمی‌شود.
    const verdict = verdicts.get(`${text(leg.ins)}:${exitSide}`);
    if (!verdict?.accepted) return fail('rejectedLeg', text(leg.ins), { positionId: wanted });

    const capacity = num(verdict.executableQty);
    if (!(Number.isFinite(capacity) && capacity > 0)) {
      return fail('missingCapacity', text(leg.ins), { positionId: wanted });
    }
    const vwap = num(verdict.execution?.vwap);
    if (!(Number.isFinite(vwap) && vwap > 0)) {
      return fail('unknownPrice', text(leg.ins), { positionId: wanted });
    }
    prepared.push({ leg, exitSide, per, vwap, verdict, maxQty: Math.floor(capacity / per) });
  }

  const executableQty = Math.min(...prepared.map((row) => row.maxQty));
  if (!(Number.isFinite(executableQty) && executableQty > 0)) {
    return fail('missingCapacity', '', { positionId: wanted, executableQty });
  }
  // کوچک‌کردنِ بی‌صدای حجم یعنی کاربر فکر می‌کند تخت شده و نشده. هر دو
  // عدد گفته می‌شوند تا بشود دوباره با عدد ممکن خواست.
  if (executableQty < requestedQty) {
    return fail('insufficientBook', `${executableQty} در برابر ${requestedQty}`,
      { positionId: wanted, requestedQty, executableQty });
  }

  const exitLegs = prepared.map((row) => ({
    kind: row.leg.kind,
    side: row.exitSide,
    ratio: row.leg.ratio,
    size: row.leg.size,
    strike: row.leg.strike,
    price: row.vwap,
  }));
  // نقد و کارمزدِ خودِ خروج؛ مقایسه با ورود پایین‌تر فقط روی lotهای FIFO
  // مصرف‌شده انجام می‌شود، نه روی میانگین ساختگی کل موقعیت.
  const exitCashRial = grossCash(exitLegs) * requestedQty;
  const feeRial = entryFees(exitLegs, fees) * requestedQty;
  if (!Number.isFinite(exitCashRial) || !Number.isFinite(feeRial)) {
    return fail('unknownPrice', '', { positionId: wanted });
  }
  const entryBasis = consumedEntryBasis(session, position, requestedQty);
  const realizedRial = entryBasis.known
    ? exitCashRial + entryBasis.entryCashRial - feeRial - entryBasis.entryFeeRial
    : null;

  const quality = combineDataQuality(
    prepared.map((row) => row.verdict?.quality?.book).filter(Boolean),
    { source: 'exit-book', asOf: moment },
  );

  // «کاهش حجم» و «آفست کامل» دو نوع تراکنش‌اند و دفتر خودش تفاوتشان را
  // می‌داند؛ اینجا فقط انتخاب می‌شود کدام.
  const kind = requestedQty === position.openQty ? 'close' : 'reduce';
  const data = {
    closeVersion: PORTFOLIO_CLOSE_VERSION,
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    positionId: wanted,
    kind,
    qty: requestedQty,
    executableQty,
    exitCashRial,
    feeRial,
    entryCashRial: entryBasis.entryCashRial,
    entryFeeRial: entryBasis.entryFeeRial,
    realizedRial,
    realizedWhy: entryBasis.known ? '' : 'مبنای ورود lotهای مصرف‌شده کامل نیست',
    entryLots: copy(entryBasis.lots),
    legs: prepared.map((row) => ({
      ins: text(row.leg.ins),
      kind: row.leg.kind,
      // سمتِ خروج و سمتِ ورود هر دو می‌مانند؛ فردا بدون هر دو نمی‌شود
      // فهمید این تراکنش چه کرد.
      side: row.exitSide,
      entrySide: row.leg.side,
      ratio: row.leg.ratio,
      size: row.leg.size,
      strike: row.leg.strike,
      expiry: row.leg.expiry,
      vwap: row.vwap,
      filled: row.per * requestedQty,
      top: num(row.verdict.execution?.top),
      levels: num(row.verdict.execution?.levels),
    })),
    fees: copy(fees) ?? null,
    quality: copy(quality) ?? null,
    evidenceAt: { ...moment },
  };

  const recorded = recordPortfolioTransaction(session, {
    kind,
    at: moment,
    positionId: wanted,
    qty: requestedQty,
    executions: prepared.map((row) => ({
      ins: text(row.leg.ins), side: row.exitSide,
      qty: row.per * requestedQty, price: row.vwap,
    })),
    data,
  });
  if (!recorded.ok) return fail('ledgerRejected', recorded.why, { positionId: wanted });

  // وضعیت از دفتر خوانده می‌شود، نه اینجا علامت زده.
  const after = portfolioSessionPositions(recorded.session);
  const row = after.ok ? after.positions.find((item) => item.id === wanted) : null;

  return {
    version: PORTFOLIO_CLOSE_VERSION,
    ok: true,
    why: '',
    reason: null,
    session: recorded.session,
    event: recorded.event,
    positionId: wanted,
    transactionId: recorded.transactionId,
    kind,
    qty: requestedQty,
    executableQty,
    exitCashRial,
    feeRial,
    entryCashRial: entryBasis.entryCashRial,
    entryFeeRial: entryBasis.entryFeeRial,
    realizedRial,
    realizedWhy: entryBasis.known ? '' : 'مبنای ورود lotهای مصرف‌شده کامل نیست',
    status: row ? row.status : null,
    remainingQty: row ? row.openQty : null,
    quality,
  };
}
