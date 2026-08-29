// گرفتن قراردادهای یک لحظه — برش هفتم فاز ۵.
//
// **مهم‌ترین شکاف پروژه، تا امروز:** در برنامهٔ زنده
// `session.startSnapshot.contracts` را هیچ‌کس نمی‌ساخت. عکسی که ویزارد
// می‌سازد شکل دیگری دارد، ولی همهٔ موتورهای سبد شکل
// `{ at, spot, contracts, capitalInputs }` را مصرف می‌کنند. یعنی حکم
// اجراپذیری، ترکیب‌ها، پیشنهادها، ثبت، بستن و ارزش‌گذاری همه فقط زیر
// آزمون زنده بودند.
//
// `core/portfolio-snapshot.mjs` سازندهٔ خالص را دارد؛ آنچه نبود همین
// لایه است — قراردادهای تاریخیِ یک لحظه را می‌گیرد و به آن می‌دهد.
//
// چهار مرز:
//
// **فهرست از بایگانی همان تاریخ.** نه دیده‌بان امروز. قراردادی که داخل
// بازه سررسید شده باید وجود داشته باشد؛ نبودنش سوگیری بقاست و خودش
// خبری از آینده است.
//
// **قیمت از دروازهٔ زمان.** نبودِ داده `missing` می‌شود، نه قیمت روز
// قبل. این کارِ `portfolioMomentSnapshot` است و اینجا فقط خام تحویلش
// می‌شود.
//
// **شکستِ واکشی صریح علامت می‌خورد.** ادامهٔ خاموش یعنی عکسی که ناقص
// است ولی کامل به نظر می‌رسد.
//
// **تعداد واکشی کران‌دار است.** زنجیرهٔ واقعی صدها قرارداد دارد و
// واکشیِ همه تب را می‌بندد. کرانه گفته می‌شود، نه پنهان: قراردادهای
// نزدیک‌ترین سررسید و نزدیک‌ترین اعمال‌ها به قیمت پایه می‌مانند، و
// شمارِ کنارگذاشته‌شده گزارش می‌شود.

import { buildChain } from '../core/chain.mjs';
import { createTimeGate } from '../core/time-gate.mjs';
import { gateLoaders } from './bereket-data.mjs';

export const SNAPSHOT_DATA_VERSION = 1;

/** کرانهٔ پیش‌فرضِ واکشی. عددِ صریح، نه «هرچه شد». */
export const DEFAULT_CONTRACT_LIMIT = 60;

const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value);

/** واکشی فهرست قراردادهای یک تاریخ. شکست، خطا نیست — علامت است. */
async function defaultUniverse(date) {
  const response = await fetch(`/api/history/universe?date=${encodeURIComponent(String(date))}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || 'فهرست تاریخی دریافت نشد');
  return payload;
}

/**
 * هویتِ قراردادهای یک نماد پایه در زنجیرهٔ آن تاریخ.
 *
 * قیمت اینجا خوانده نمی‌شود؛ فقط «چه قراردادهایی وجود داشتند».
 */
/**
 * نامِ خواندنیِ نماد پایه، یا `null`.
 *
 * `buildChain` وقتی تابلو نامی نداده، رشتهٔ جانشینِ «دارایی پایه بدون نام»
 * می‌گذارد تا منوها خالی نمانند. آن رشته یک برچسبِ رابط است، نه نامِ نماد؛
 * اگر در سند ثبت شود، خواننده‌ای که ماه‌ها بعد پرونده را باز می‌کند فکر
 * می‌کند نام واقعاً همین بوده. پس اینجا به `null` تبدیل می‌شود تا نبودِ نام،
 * نبود بماند.
 */
function readableName(name, baseIns) {
  const label = text(name);
  if (!label || label === text(baseIns)) return null;
  return label === 'دارایی پایه بدون نام' ? null : label;
}

function identitiesFrom(rows, baseIns) {
  const chain = buildChain(rows || []);
  const ua = chain.get(text(baseIns));
  if (!ua) return { spot: null, contracts: [] };
  const contracts = [];
  for (const expiry of ua.expiryList || []) {
    for (const strike of expiry.strikeList || []) {
      for (const side of ['call', 'put']) {
        const quote = strike[side];
        if (!text(quote?.ins)) continue;
        contracts.push({
          ins: text(quote.ins),
          name: text(quote.name),
          kind: side,
          strike: strike.strike,
          expiry: expiry.endDate || null,
          size: strike.size > 0 ? strike.size : null,
          // فاصله تا سررسید و تا قیمت پایه، فقط برای مرتب‌کردنِ کرانه.
          days: expiry.days,
        });
      }
    }
  }
  const spot = num(ua.close) > 0 ? num(ua.close) : (num(ua.last) > 0 ? num(ua.last) : null);
  return { spot, spotName: readableName(ua.name, baseIns), contracts };
}

function tradePrice(trade) {
  const price = num(trade?.price);
  if (Number.isFinite(price) && price > 0) return price;
  // سازگاری با آداپترهای قدیمی و fixtureهایی که ردیف روزانه می‌دهند.
  const close = num(trade?.close);
  return Number.isFinite(close) && close > 0 ? close : null;
}

function historicalQuote(point, at) {
  if (!point?.quote) return null;
  const second = Number(point.quote.asOf);
  return {
    ...point.quote,
    asOf: {
      date: Number(at?.date) || 0,
      second: Number.isFinite(second) ? second : Number(at?.second) || 0,
    },
    quality: point.bookQuality ?? point.quote.quality ?? null,
  };
}

/**
 * کران‌زدنِ فهرست، با قاعده‌ای که گفته می‌شود.
 *
 * نزدیک‌ترین سررسید مقدم است و در هر سررسید، اعمال‌های نزدیک به قیمت
 * پایه. اینها همان‌هایی‌اند که ترکیب‌های واقعی از آنها ساخته می‌شوند؛
 * اعمالِ خیلی دور نه نقدشونده است نه انتخاب می‌شود.
 */
function boundTo(contracts, spot, limit) {
  if (contracts.length <= limit) return { kept: contracts, dropped: 0 };
  const base = num(spot) > 0 ? num(spot) : 0;
  const ranked = [...contracts].sort((a, b) => (a.days - b.days)
    || (Math.abs(num(a.strike) - base) - Math.abs(num(b.strike) - base)));
  return { kept: ranked.slice(0, limit), dropped: contracts.length - limit };
}

/**
 * قراردادهای یک لحظه، آمادهٔ دادن به `portfolioMomentSnapshot`.
 *
 * `universe` و `gate` تزریق‌پذیرند تا این لایه بدون شبکه آزمون‌پذیر
 * بماند — همان چیزی که نبودش باعث شد این شکاف تا امروز دیده نشود.
 */
export async function loadMomentContracts(session, at, {
  days = [],
  limit = DEFAULT_CONTRACT_LIMIT,
  universe = defaultUniverse,
  makeGate = null,
} = {}) {
  const warnings = [];
  const baseIns = text(session?.baseIns);
  if (!baseIns) {
    return {
      version: SNAPSHOT_DATA_VERSION, ok: false,
      why: 'نماد پایهٔ جلسه معلوم نیست', rows: [], spot: null, baseName: null,
      warnings: ['نماد پایهٔ جلسه معلوم نیست'], dropped: 0, archived: false,
      universe: null,
    };
  }

  let payload = null;
  try {
    payload = await universe(at?.date);
  } catch (error) {
    warnings.push(`فهرست قراردادها: ${String(error?.message || 'دریافت نشد')}`);
  }
  // فهرستِ امروز به‌جای بایگانیِ آن تاریخ، سوگیری بقاست — و بی‌صدا
  // نمی‌ماند.
  const archived = payload?.archived === true;
  if (payload && !archived) {
    warnings.push('فهرست قراردادها از بایگانی آن تاریخ نیست؛ قرارداد سررسیدشده ممکن است جا افتاده باشد');
  }

  const { spot, spotName, contracts } = identitiesFrom(payload?.rows, baseIns);
  if (!contracts.length) warnings.push('برای این تاریخ قراردادی در فهرست نبود');
  const bounded = boundTo(contracts, spot, Math.max(1, Math.trunc(num(limit)) || 1));
  if (bounded.dropped > 0) {
    warnings.push(`${bounded.dropped} قرارداد دورتر از کرانهٔ واکشی کنار گذاشته شد`);
  }

  const loaders = gateLoaders();
  // ——— شکستِ واکشی با «داده نبود» یکی نیست ———
  //
  // پیش از این هر سه لودر خطا را می‌بلعیدند و `[]` می‌دادند. نتیجه‌اش این
  // بود که یک واکشیِ شکست‌خورده دقیقاً شبیه «آن لحظه معامله‌ای نشده» دیده
  // می‌شد و حکم «خوراک نامزد فاقد داده است» می‌گرفت. کاربر بعد دنبال
  // قراردادِ بی‌معامله می‌گشت، در حالی که مشکل نرسیدنِ پاسخ بود.
  //
  // حالا `[]` سرِ جایش می‌ماند (تا عددِ ساختگی ساخته نشود) ولی علتِ واقعی
  // یک بار ثبت و در هشدارها گزارش می‌شود.
  const loadFailures = new Map();
  const noteFailure = (kind, error) => {
    const why = String(error?.message || error || 'دلیل نامعلوم');
    if (!loadFailures.has(kind)) loadFailures.set(kind, why);
  };
  const guarded = (kind, fn) => async (...args) => {
    try { return await fn(...args); } catch (error) { noteFailure(kind, error); return []; }
  };
  const gate = (makeGate || createTimeGate)({
    sessionId: text(session?.id), now: at, days,
    load: {
      dailies: guarded('روزانه', loaders.dailies),
      trades: guarded('ریزمعامله', loaders.trades),
      book: guarded('دفتر سفارش', loaders.book),
    },
  });

  let priced = 0;
  const rows = await Promise.all(bounded.kept.map(async (contract) => {
    const point = await gate.snapshot(contract.ins).catch(() => null);
    const quote = historicalQuote(point, at);
    const book = quote?.book ?? null;
    const close = tradePrice(point?.trade);
    if (book || close) priced += 1;
    return {
      ins: contract.ins, name: contract.name, kind: contract.kind, strike: contract.strike,
      expiry: contract.expiry, size: contract.size,
      // نبودِ داده اینجا پر نمی‌شود؛ سازندهٔ عکس خودش «فاقد داده»
      // علامتش می‌زند.
      book, close, quote,
      trade: point?.trade ?? null,
      quality: point?.tradeQuality ?? null,
      bookQuality: point?.bookQuality ?? null,
    };
  }));
  if (rows.length && priced === 0) {
    warnings.push('هیچ‌کدام از قراردادها برای این لحظه قیمتی نداشتند');
  }

  const basePoint = await gate.snapshot(baseIns).catch(() => null);
  const momentSpot = tradePrice(basePoint?.trade);
  if (!(num(momentSpot) > 0)) warnings.push('قیمت پایه برای این لحظه از دروازهٔ زمان نیامد');
  for (const [kind, why] of loadFailures) {
    warnings.push(`واکشی ${kind} ناموفق بود، پس نبودِ داده در این عکس لزوماً یعنی «نرسید»، نه «نبود» — ${why}`);
  }

  return {
    version: SNAPSHOT_DATA_VERSION,
    // «موفق» یعنی چیزی برای ساختن عکس هست؛ کامل‌بودنش کار `warnings` است.
    ok: rows.length > 0,
    why: rows.length ? '' : 'برای این لحظه هیچ قراردادی به دست نیامد',
    rows,
    spot: num(momentSpot) > 0 ? num(momentSpot) : null,
    // نامِ نماد پایه از زنجیرهٔ **همان تاریخ** می‌آید، نه از فهرست امروز؛
    // نماد ممکن است بعداً تغییر نام داده باشد و سند باید نامِ آن روز را
    // نگه دارد. نیامدنش `null` است و جایش چیزی ساخته نمی‌شود.
    baseName: spotName,
    baseTrade: basePoint?.trade ?? null,
    baseTradeQuality: basePoint?.tradeQuality ?? null,
    baseQuote: historicalQuote(basePoint, at),
    baseBookQuality: basePoint?.bookQuality ?? null,
    archived,
    dropped: bounded.dropped,
    limit,
    warnings,
    universe: payload ? {
      rows: Array.isArray(payload.rows) ? payload.rows : [],
      quality: payload.quality ?? null,
      archived,
    } : null,
  };
}
