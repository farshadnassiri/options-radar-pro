// سری زمانی سود و زیان سفر در زمان — به تفکیک هر استراتژی و کل سبد.
//
// این ماژول قیمت نمی‌گیرد و شبکه نمی‌شناسد. برای هر پلهٔ زمانی، «مدرک
// اجراپذیری همان لحظه» را می‌گیرد و می‌پرسد: اگر همین‌جا می‌بستی، چه در
// دستت می‌ماند؟ فرمولش دقیقاً همان فرمول `closePortfolioPosition` است —
// عمداً، چون اگر نمودار یک عدد نشان بدهد و بستنِ واقعی عدد دیگری بدهد،
// نمودار دروغ گفته است.
//
// دو چیز اینجا هرگز اتفاق نمی‌افتد: قیمتی ساخته نمی‌شود، و نبودِ قیمت به
// صفر تبدیل نمی‌شود. پلهٔ بی‌قیمت `null` می‌ماند و علتش را با خودش می‌برد.

import { entryFees, grossCash } from './payoff.mjs';
import { portfolioSessionPositions } from './portfolio-positions.mjs';

export const PORTFOLIO_TIMELINE_VERSION = 1;

/**
 * دو حالتِ برخورد با پله‌ای که قیمت اجرایی ندارد.
 *
 * `strict` صادق‌ترین است ولی نمودار را پرشکاف می‌کند. `carry` نمودار را
 * پیوسته می‌کند به قیمتِ آخرین پلهٔ معلوم — که مشاهدهٔ آن لحظه **نیست**، پس
 * هر عددش نشان‌دار می‌شود و فاصلهٔ کهنگی‌اش گزارش می‌شود.
 */
export const PORTFOLIO_TIMELINE_MODES = Object.freeze({
  strict: 'فقط قیمت اجرایی همان لحظه',
  carry: 'در نبود قیمت، آخرین قیمت اجرایی معلوم با نشان تخمینی',
});

export const PORTFOLIO_TIMELINE_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای ساختن سری زمانی در کار نیست',
  unknownMode: 'حالت قیمت‌گذاری سری زمانی معتبر نیست',
  noSteps: 'هیچ پلهٔ زمانی برای سری داده نشد',
  badStep: 'لحظهٔ یکی از پله‌ها معتبر نیست',
  outOfOrder: 'پله‌های زمانی باید صعودی و بدون تکرار باشند',
  missingFees: 'نرخ کارمزد اختیار در عکس شروع نیست',
  brokenLedger: 'دفتر رویداد جلسه قابل بازپخش نیست',
});

/** علتِ نامعلوم‌ماندنِ سود و زیانِ یک استراتژی در یک پله. */
export const TIMELINE_UNKNOWN_REASONS = Object.freeze({
  undocumented: 'موقعیت سند طرح ندارد، پس پاهایش معلوم نیست',
  rejectedLeg: 'برای بستن یکی از پاها حکم اجراپذیری پذیرفته‌شده‌ای نیست',
  unknownPrice: 'قیمت اجرایی خروج یکی از پاها معلوم نیست',
  unknownBasis: 'مبنای ورودِ حجم باز کامل نیست',
  unknownRealized: 'سود محقق‌شدهٔ یکی از خروج‌ها معلوم نیست',
});

const OPPOSITE = Object.freeze({ buy: 'sell', sell: 'buy' });

const num = (value) => Number(value);
const text = (value) => String(value ?? '').trim();
const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const momentKey = (point) => {
  const date = Number(point?.date);
  const second = Number(point?.second);
  return Number.isFinite(date) && Number.isFinite(second) && date > 0 && second >= 0
    ? date * 100_000 + second : NaN;
};

function fail(reason, detail = '') {
  const base = PORTFOLIO_TIMELINE_REASONS[reason];
  return {
    version: PORTFOLIO_TIMELINE_VERSION,
    ok: false,
    why: detail ? `${base} — ${detail}` : base,
    reason,
    mode: '',
    strategies: [],
    steps: [],
  };
}

/** حکم‌های یک لحظه، کلیدخورده به همان شکلی که مسیر بستن می‌خواند. */
function verdictIndex(evidence) {
  const out = new Map();
  for (const row of Array.isArray(evidence?.rows) ? evidence.rows : []) {
    const id = text(row?.candidateId);
    if (id) out.set(id, row);
  }
  return out;
}

/**
 * سرمایهٔ درگیرشده تا این لحظه — مبنای درصد بازده.
 *
 * از رویدادهای گشایش و افزایش جمع می‌شود، نه از یک عدد کلی، چون افزایش
 * حجم در قیمتِ تازه سرمایهٔ تازه می‌خواهد. اگر حتی یکی از رویدادها عددش
 * را نبرده باشد، مبنا `null` می‌شود و درصد ساخته نمی‌شود.
 */
function committedCapital(events) {
  const byPosition = new Map();
  let sum = 0;
  let known = true;
  for (const event of events) {
    if (event?.type !== 'transaction') continue;
    if (!['open', 'increase'].includes(text(event.transactionKind))) continue;
    const id = text(event.positionId);
    const value = finite(event?.data?.capitalRial);
    if (value === null) {
      known = false;
      byPosition.set(id, null);
      continue;
    }
    sum += value;
    const before = byPosition.get(id);
    if (before !== null) byPosition.set(id, (before ?? 0) + value);
  }
  return { total: known ? sum : null, byPosition };
}

/** قیمت اجرایی خروجِ یک پا در یک لحظه، یا علتِ نبودنش. */
function exitPriceAt(verdicts, ins, exitSide) {
  const verdict = verdicts.get(`${ins}:${exitSide}`);
  if (!verdict?.accepted) return { price: null, reason: 'rejectedLeg' };
  const vwap = num(verdict.execution?.vwap);
  return Number.isFinite(vwap) && vwap > 0
    ? { price: vwap, reason: null }
    : { price: null, reason: 'unknownPrice' };
}

/**
 * سود و زیانِ یک موقعیت در یک لحظه.
 *
 * محقق‌شده از دفتر می‌آید (خروج‌های تا همین لحظه) و تحقق‌نیافته از «اگر
 * همین‌جا می‌بستی». جمعشان تنها وقتی عدد می‌شود که هر دو معلوم باشند.
 */
function positionAt(position, { verdicts, fees, carried, at, mode }) {
  const unknown = (reason, detail = {}) => ({
    positionId: position.id,
    defId: position.defId,
    familyId: position.familyId,
    openQty: position.openQty,
    status: position.status,
    known: false,
    reason,
    why: TIMELINE_UNKNOWN_REASONS[reason],
    realizedRial: null,
    unrealizedRial: null,
    pnlRial: null,
    pnlPct: null,
    exitCashRial: null,
    exitFeeRial: null,
    estimated: false,
    estimatedLegs: [],
    ...detail,
  });

  if (!position.documented) return unknown('undocumented');
  if (!position.realizedKnown) return unknown('unknownRealized');
  const realizedRial = finite(position.realizedRial) ?? 0;

  // موقعیتِ بسته دیگر پایی برای قیمت‌گرفتن ندارد؛ سودش همان محقق‌شده است
  // و نبودِ مظنه برایش «نامعلوم» نیست.
  if (position.openQty === 0) {
    return {
      positionId: position.id,
      defId: position.defId,
      familyId: position.familyId,
      openQty: 0,
      status: position.status,
      known: true,
      reason: null,
      why: '',
      realizedRial,
      unrealizedRial: 0,
      pnlRial: realizedRial,
      pnlPct: null,
      exitCashRial: null,
      exitFeeRial: null,
      estimated: false,
      estimatedLegs: [],
    };
  }

  if (!position.openBasisKnown) return unknown('unknownBasis');

  const exitLegs = [];
  const estimatedLegs = [];
  for (const leg of position.legs) {
    const exitSide = OPPOSITE[leg.side];
    if (!exitSide) return unknown('rejectedLeg');
    const key = `${text(leg.ins)}:${exitSide}`;
    const live = exitPriceAt(verdicts, text(leg.ins), exitSide);
    let price = live.price;
    let stale = null;
    if (price === null) {
      // حالت `carry`: قیمتِ آخرین پلهٔ معلوم، نه قیمتِ این لحظه. عدد ساخته
      // نمی‌شود — عددی که قبلاً واقعاً دیده شده جابه‌جا می‌شود، و همین
      // جابه‌جایی خودش گزارش می‌شود.
      const kept = mode === 'carry' ? carried.get(key) : null;
      if (!kept) return unknown(live.reason);
      price = kept.price;
      stale = kept.at;
      estimatedLegs.push({ ins: text(leg.ins), side: exitSide, asOf: { ...kept.at } });
    } else {
      carried.set(key, { price, at: { ...at } });
    }
    exitLegs.push({
      kind: leg.kind, side: exitSide, ratio: leg.ratio, size: leg.size,
      strike: leg.strike, price, staleAt: stale,
    });
  }

  const exitCashRial = grossCash(exitLegs) * position.openQty;
  const exitFeeRial = entryFees(exitLegs, fees) * position.openQty;
  if (!Number.isFinite(exitCashRial) || !Number.isFinite(exitFeeRial)) {
    return unknown('unknownPrice');
  }
  // همان فرمول بستنِ واقعی: نقدِ خروج + مبنای نقدِ ورود − کارمزد خروج −
  // کارمزد ورود. مبنای ورود برای پول‌داده منفی است، پس جمع می‌شود.
  const unrealizedRial = exitCashRial + position.openEntryCashRial
    - exitFeeRial - position.openEntryFeeRial;

  return {
    positionId: position.id,
    defId: position.defId,
    familyId: position.familyId,
    openQty: position.openQty,
    status: position.status,
    known: true,
    reason: null,
    why: '',
    realizedRial,
    unrealizedRial,
    pnlRial: realizedRial + unrealizedRial,
    pnlPct: null,
    exitCashRial,
    exitFeeRial,
    estimated: estimatedLegs.length > 0,
    estimatedLegs,
  };
}

/**
 * سری زمانی سود و زیان یک جلسه.
 *
 * `steps` هر پله را با لحظه و مدرک اجراپذیری همان لحظه می‌دهد:
 * `[{ at: { date, second }, evidence }]`. مدرک را این ماژول نمی‌سازد، چون
 * ساختنش قیمت می‌خواهد و قیمت‌گرفتن کار لایهٔ بالاتر است.
 */
export function portfolioTimeline(session, steps, { mode = 'strict' } = {}) {
  if (!session) return fail('noSession');
  if (!Object.prototype.hasOwnProperty.call(PORTFOLIO_TIMELINE_MODES, text(mode))) {
    return fail('unknownMode', text(mode));
  }
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return fail('noSteps');

  const fees = session.startSnapshot?.capitalInputs?.fees;
  if (!Number.isFinite(num(fees?.option))) return fail('missingFees');

  let previous = NaN;
  for (const step of list) {
    const key = momentKey(step?.at);
    if (!Number.isFinite(key)) return fail('badStep');
    if (Number.isFinite(previous) && key <= previous) return fail('outOfOrder');
    previous = key;
  }

  const allEvents = Array.isArray(session.events) ? session.events : [];
  const carried = new Map();
  const seen = new Map();
  const out = [];

  for (const step of list) {
    const key = momentKey(step.at);
    // وضعیت جلسه **در همان لحظه**، نه در پایان. رویدادهای بعد از این پله
    // هنوز اتفاق نیفتاده‌اند و دیدنشان یعنی نگاه به آینده.
    const upTo = allEvents.filter((event) => {
      const eventKey = momentKey(event?.at);
      return Number.isFinite(eventKey) && eventKey <= key;
    });
    const state = portfolioSessionPositions({ ...session, events: upTo, now: { ...step.at } });
    if (!state.ok) return fail('brokenLedger', state.why);

    const verdicts = verdictIndex(step.evidence);
    const capital = committedCapital(upTo);
    const base = capital.total;
    const rows = state.positions.map((position) => {
      const row = positionAt(position, { verdicts, fees, carried, at: step.at, mode });
      // درصدِ هر استراتژی روی مبنای سرمایهٔ درگیرِ **خودش** تا همین لحظه،
      // نه سرمایهٔ کل جلسه — وگرنه یک استراتژی کوچک با سود بزرگ، درصد
      // ناچیزی می‌گیرد و مقایسه بی‌معنا می‌شود.
      const own = finite(capital.byPosition.get(row.positionId));
      row.capitalBaseRial = own;
      row.pnlPct = row.known && own !== null && own > 0 ? (row.pnlRial / own) * 100 : null;
      if (!seen.has(row.positionId)) {
        seen.set(row.positionId, {
          positionId: row.positionId,
          defId: row.defId,
          familyId: row.familyId,
          openedAt: position.openedAt ? { ...position.openedAt } : null,
        });
      }
      return row;
    });

    const unknownIds = rows.filter((row) => !row.known).map((row) => row.positionId);
    const knownRows = rows.filter((row) => row.known);
    const knownPnlRial = knownRows.reduce((sum, row) => sum + row.pnlRial, 0);
    // جمعِ ناقص، جمع نیست. عددِ کل تنها وقتی ساخته می‌شود که هیچ جزئی
    // نامعلوم نباشد؛ وگرنه «جمع معلوم‌ها» جداگانه گزارش می‌شود تا کاربر
    // بداند چقدر از تصویر را می‌بیند.
    const complete = rows.length > 0 && unknownIds.length === 0;
    const totalPnlRial = complete ? knownPnlRial : null;
    const initial = finite(session.capital?.initialRial);

    out.push({
      at: { ...step.at },
      rows,
      positions: rows.length,
      openPositions: rows.filter((row) => row.openQty > 0).length,
      unknownIds,
      knownCount: knownRows.length,
      knownPnlRial: rows.length ? knownPnlRial : null,
      totalPnlRial,
      totalPnlPct: totalPnlRial !== null && base !== null && base > 0
        ? (totalPnlRial / base) * 100 : null,
      capitalBaseRial: base,
      returnOnCapitalPct: totalPnlRial !== null && initial !== null && initial > 0
        ? (totalPnlRial / initial) * 100 : null,
      realizedRial: complete ? knownRows.reduce((sum, row) => sum + row.realizedRial, 0) : null,
      unrealizedRial: complete
        ? knownRows.reduce((sum, row) => sum + row.unrealizedRial, 0) : null,
      estimated: rows.some((row) => row.estimated),
    });
  }

  return {
    version: PORTFOLIO_TIMELINE_VERSION,
    ok: true,
    why: '',
    reason: null,
    mode: text(mode),
    modeLabel: PORTFOLIO_TIMELINE_MODES[text(mode)],
    strategies: [...seen.values()],
    steps: out,
  };
}
