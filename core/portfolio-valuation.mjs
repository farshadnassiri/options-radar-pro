// ارزش جاری موقعیت — نخستین قلم فاز ۵.
//
// هفت ماژول فاز ۴ هرکدام یک ادعا دارند که می‌گوید «سود و زیان کار فاز ۵
// است». اینجا همان کار انجام می‌شود — **یک بار**، وگرنه هر بخش رابط
// فرمول خودش را می‌سازد و روزی دو عدد متفاوت برای یک چیز نشان داده
// می‌شود.
//
// پنج مرز:
//
// **ارزش، قیمتِ بستن است نه قیمتِ خرید.** ارزشِ پای خریداری‌شده همان
// چیزی است که با **فروختنش** گرفته می‌شود — پس از سمت وارونهٔ ورود در
// دفتر سفارش. همان قاعدهٔ `portfolio-close.mjs`. خواندن از سمت ورود یعنی
// ارزشی که هیچ‌وقت نقد نمی‌شود.
//
// **هر دو کارمزد بخشی از سود است.** سود تحقق‌نیافته = ارزش جاری منهای
// نقد ورود، منهای کارمزدِ فرضیِ خروج، منهای کارمزدِ ورود. کارمزد ورود
// پرداخت شده و نادیده‌گرفتنش سود را دقیقاً به اندازهٔ خودش بزرگ‌تر نشان
// می‌دهد.
//
// **مبنا با حجمِ باز هم‌تراز می‌شود.** سند، نقد و کارمزد ورود را برای
// حجمِ **اولیه** نوشته است. اگر بخشی از موقعیت بسته شده باشد، سنجیدنِ
// ارزشِ حجمِ باقی‌مانده در برابر هزینهٔ حجمِ اولیه یک زیانِ ساختگی
// می‌سازد. تناسب دقیق است نه تقریبی، چون هر دو خطی در حجم‌اند.
//
// **نبودِ عدد با عدد جایگزین نمی‌شود.** مدرکِ کهنه یا پای بی‌حکم یعنی
// `null` با علت — نه قیمت پایانی، نه صفر.
//
// **ارزشِ نصفه، ارزش نیست.** اگر یک پا نامعلوم باشد کل موقعیت `null`
// می‌شود. جمعِ نصفه بدتر از نبودِ عدد است، چون شبیه عدد است.
//
// **موقعیت بسته ارزش جاری ندارد.** `null` است نه صفر؛ صفر یعنی «سنجیدیم
// و هیچ بود».

import { entryFees, grossCash } from './payoff.mjs';
import { portfolioSessionPositions } from './portfolio-positions.mjs';

export const PORTFOLIO_VALUATION_VERSION = 1;

export const PORTFOLIO_VALUATION_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای ارزش‌گذاری در کار نیست',
  brokenLedger: 'دفتر رویداد جلسه قابل بازپخش نیست',
  staleEvidence: 'مدرک اجراپذیری هم‌لحظهٔ ارزش‌گذاری نیست',
  missingFees: 'نرخ کارمزد اختیار در عکس شروع نیست',
});

/** چرا ارزشِ یک موقعیت معلوم نشد. */
export const UNVALUED_REASONS = Object.freeze({
  closed: 'موقعیت بسته است و ارزش جاری ندارد',
  undocumented: 'سند طرحِ این موقعیت خوانده نشد، پس پاهایش قیمت نمی‌گیرند',
  rejectedLeg: 'برای بستن این پا حکم اجراپذیری پذیرفته‌شده‌ای نیست',
  unknownPrice: 'قیمت بستن این پا در دفتر سفارش معلوم نیست',
  unknownEntryCash: 'نقد ورودِ این موقعیت در سند نیست',
});

const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value);
const OPPOSITE = Object.freeze({ buy: 'sell', sell: 'buy' });

const sameMoment = (a, b) => Boolean(a && b
  && Number(a.date) === Number(b.date) && Number(a.second) === Number(b.second));

function fail(reason, why = '') {
  return {
    version: PORTFOLIO_VALUATION_VERSION,
    ok: false,
    why: why || PORTFOLIO_VALUATION_REASONS[reason],
    reason,
    empty: false,
    note: '',
    rows: [],
    totals: null,
  };
}

function verdictIndex(evidence) {
  const out = new Map();
  for (const row of Array.isArray(evidence?.rows) ? evidence.rows : []) {
    const id = text(row?.candidateId);
    if (id) out.set(id, row);
  }
  return out;
}

/** حجمِ هر پا به ازای یک واحد از ترکیب — همان قاعدهٔ طرح ورود و خروج. */
function perCombo(leg) {
  const ratio = num(leg?.ratio);
  if (!(ratio > 0)) return NaN;
  return leg?.kind === 'underlying' ? ratio * num(leg?.size) : ratio;
}

/**
 * ارزش یک موقعیت باز، یا علتِ معلوم‌نبودنش.
 *
 * هیچ شاخه‌ای اینجا عددِ جایگزین نمی‌سازد: یا همهٔ پاها قیمت دارند، یا
 * کل موقعیت `null` می‌شود.
 */
function valuePosition(position, verdicts, fees) {
  if (position.status !== 'open') return { reason: 'closed' };
  if (!position.documented) return { reason: 'undocumented' };

  const exitLegs = [];
  for (const leg of position.legs) {
    const per = perCombo(leg);
    const exitSide = OPPOSITE[leg.side];
    if (!(per > 0) || !exitSide) return { reason: 'rejectedLeg', ins: text(leg.ins) };

    const verdict = verdicts.get(`${text(leg.ins)}:${exitSide}`);
    if (!verdict?.accepted) return { reason: 'rejectedLeg', ins: text(leg.ins) };

    const vwap = num(verdict.execution?.vwap);
    // نبودِ قیمت با قیمت پایانی یا صفر جایگزین نمی‌شود.
    if (!(Number.isFinite(vwap) && vwap > 0)) {
      return { reason: 'unknownPrice', ins: text(leg.ins) };
    }
    exitLegs.push({
      kind: leg.kind, side: exitSide, ratio: leg.ratio, size: leg.size,
      strike: leg.strike, price: vwap,
    });
  }
  if (!exitLegs.length) return { reason: 'unknownPrice' };

  // `num()` اینجا به‌کار نمی‌رود: `Number(null)` صفر است و از
  // `Number.isFinite` رد می‌شود، یعنی نقدِ نبوده صفر حساب می‌شد و سودی
  // به اندازهٔ کل ارزش می‌ساخت. مقدارِ خام سنجیده می‌شود.
  const docEntryCash = position.entryCashRial;
  const docEntryFee = position.capital?.components?.feeRial;
  if (!Number.isFinite(docEntryCash) || !Number.isFinite(docEntryFee)) {
    return { reason: 'unknownEntryCash' };
  }
  // سند برای حجمِ اولیه نوشته شده؛ اینجا با حجمِ باز هم‌تراز می‌شود.
  const share = position.initialQty > 0 ? position.openQty / position.initialQty : 0;
  const entryCashRial = docEntryCash * share;
  const entryFeeRial = docEntryFee * share;

  // ارزش جاری = نقدی که بستنِ همین موقعیت همین حالا می‌دهد.
  const qty = position.openQty;
  const valueRial = grossCash(exitLegs) * qty;
  // کارمزدِ فرضیِ خروج، بخشی از سود است. بدون آن عددی می‌ماند که
  // هیچ‌وقت گرفته نمی‌شود.
  const exitFeeRial = entryFees(exitLegs, fees) * qty;
  if (!Number.isFinite(valueRial) || !Number.isFinite(exitFeeRial)) {
    return { reason: 'unknownPrice' };
  }
  return {
    reason: null,
    valueRial,
    exitFeeRial,
    entryCashRial,
    entryFeeRial,
    unrealizedRial: valueRial + entryCashRial - exitFeeRial - entryFeeRial,
  };
}

/**
 * ارزش جاری موقعیت‌های یک جلسه.
 *
 * `evidence` همان مدرک اجراپذیری است که برای **همین لحظه** ساخته شده.
 * `at` را ندهید تا `session.now` گرفته شود.
 */
export function portfolioSessionValuation(session, evidence, { at } = {}) {
  if (!session) return fail('noSession');
  const state = portfolioSessionPositions(session);
  if (!state.ok) return fail(state.reason === 'noSession' ? 'noSession' : 'brokenLedger', state.why);

  const moment = at ? { date: Number(at.date), second: Number(at.second) } : (session.now || null);
  if (!evidence?.ok || !sameMoment(evidence.now, moment)) return fail('staleEvidence');

  const fees = session.startSnapshot?.capitalInputs?.fees;
  if (!Number.isFinite(num(fees?.option))) return fail('missingFees');

  const verdicts = verdictIndex(evidence);
  const rows = state.positions.map((position) => {
    const valued = valuePosition(position, verdicts, fees);
    const known = valued.reason === null;
    return {
      id: position.id,
      status: position.status,
      familyId: position.familyId,
      defId: position.defId,
      openQty: position.openQty,
      valued: known,
      // «نمی‌دانیم» و «صفر» دو چیزند و اینجا یکی نمی‌شوند.
      valueRial: known ? valued.valueRial : null,
      exitFeeRial: known ? valued.exitFeeRial : null,
      entryCashRial: known ? valued.entryCashRial : null,
      entryFeeRial: known ? valued.entryFeeRial : null,
      unrealizedRial: known ? valued.unrealizedRial : null,
      reason: valued.reason,
      why: known ? '' : UNVALUED_REASONS[valued.reason],
      ins: valued.ins ?? '',
      quality: position.quality,
    };
  });

  const open = rows.filter((row) => row.status === 'open');
  const valued = open.filter((row) => row.valued);
  const unvalued = open.filter((row) => !row.valued);
  // جمعِ نصفه بدتر از نبودِ عدد است، چون شبیه عدد است. اگر حتی یک موقعیت
  // باز ارزش ندارد، جمعِ کل هم ندارد.
  const complete = open.length > 0 && unvalued.length === 0;
  const sum = (key) => valued.reduce((acc, row) => acc + row[key], 0);

  return {
    version: PORTFOLIO_VALUATION_VERSION,
    ok: true,
    why: '',
    reason: null,
    now: moment,
    empty: rows.length === 0,
    note: rows.length === 0 ? 'این جلسه هنوز هیچ موقعیتی ندارد' : '',
    rows,
    totals: {
      openCount: open.length,
      valuedCount: valued.length,
      unvaluedCount: unvalued.length,
      complete,
      valueRial: complete ? sum('valueRial') : null,
      exitFeeRial: complete ? sum('exitFeeRial') : null,
      entryFeeRial: complete ? sum('entryFeeRial') : null,
      unrealizedRial: complete ? sum('unrealizedRial') : null,
    },
  };
}
