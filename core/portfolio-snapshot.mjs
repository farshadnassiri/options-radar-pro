// عکس لحظهٔ جاری — برش چهارم فاز ۵.
//
// ساعت جلو می‌رفت ولی هیچ‌کس داده‌ای برای لحظهٔ تازه نمی‌آورد.
// `session.startSnapshot` فقط عکسِ **شروع** است، و ارزش‌گذاری و بستن هر
// دو مدرکِ هم‌لحظه می‌خواهند — پس هر گام زمانی به `staleEvidence` ختم
// می‌شد: درست، ولی بی‌فایده.
//
// نکته‌ای که هنگام ساخت معلوم شد: شکلِ
// `{ at, spot, contracts, capitalInputs }` را که همهٔ موتورها مصرف
// می‌کنند، **هیچ‌کس نمی‌ساخت** — فقط در چیدمان آزمون وجود داشت. این
// ماژول همان سازنده است و برای هر لحظه‌ای کار می‌کند، از جمله لحظهٔ شروع.
//
// پنج مرز:
//
// **فقط دادهٔ همان لحظه.** قراردادی که برای این لحظه دفتر سفارش یا
// پایانی ندارد، کیفیتِ `missing` می‌گیرد و قیمتش نمی‌آید. پرکردنش با
// قیمت لحظهٔ قبل یعنی ساختن معامله‌ای که نشده.
//
// **`capitalInputs` بازخوانی نمی‌شود.** نرخ کارمزد و پارامتر وجه تضمین
// در لحظهٔ قفلِ مأموریت قفل شده‌اند و قفل‌شدنشان معنا دارد: طرحی که
// دیروز سنجیده شد نباید امروز با نرخ دیگری قضاوت شود.
//
// **کیفیت هر قرارداد جداگانه می‌ماند.** کیفیتِ کلی می‌گوید بدترین چه
// بود؛ کیفیتِ هر قرارداد می‌گوید کدام یکی.
//
// **خالی با «همه‌چیز خوب» یکی نیست.** عکسی بدون قرارداد، `missing` است
// نه یک عکسِ کامل با فهرست تهی.
//
// **شکل، همان شکلِ عکسِ شروع است.** شکل دوم یعنی هر مصرف‌کننده باید هر
// دو را بشناسد و روزی یکی‌شان جا می‌ماند.

import { combineDataQuality, makeDataQuality, normalizeDataQuality } from './data-quality.mjs';
import { momentKey } from './trading-calendar.mjs';

export const PORTFOLIO_SNAPSHOT_VERSION = 1;

/** کلیدهای عکس — قراردادِ شکل، در یک جا. */
export const SNAPSHOT_KEYS = Object.freeze(['at', 'spot', 'contracts', 'capitalInputs']);

export const PORTFOLIO_SNAPSHOT_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای عکس‌گرفتن در کار نیست',
  invalidMoment: 'لحظهٔ عکس معتبر نیست',
  outsideSession: 'لحظهٔ عکس بیرون از بازهٔ جلسه است',
  missingCapitalInputs: 'عکس شروع نرخ کارمزد و پارامتر وجه تضمین را ندارد',
});

const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value);
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function fail(reason, detail = '') {
  return {
    version: PORTFOLIO_SNAPSHOT_VERSION,
    ok: false,
    why: detail ? `${PORTFOLIO_SNAPSHOT_REASONS[reason]} — ${detail}` : PORTFOLIO_SNAPSHOT_REASONS[reason],
    reason,
    snapshot: null,
    missing: null,
  };
}

/** دفتر سفارشِ معتبر، یا هیچ. دفترِ نصفه دفتر نیست. */
function usableBook(book) {
  if (!Array.isArray(book) || !book.length) return null;
  const rows = book.filter((level) => Number.isFinite(num(level?.bid))
    || Number.isFinite(num(level?.ask)));
  return rows.length ? rows : null;
}

/**
 * یک قرارداد در این لحظه، با کیفیتِ خودش.
 *
 * نبودِ داده هیچ‌وقت با قیمتِ لحظهٔ قبل پر نمی‌شود — همان اصلی که کل
 * پروژه رویش بنا شده. قرارداد از فهرست حذف هم نمی‌شود: حذفش یعنی
 * فهرستِ نمایش‌داده‌شده کمتر از واقعیت است.
 */
function contractAt(row, at) {
  const ins = text(row?.ins);
  const book = usableBook(row?.book ?? row?.quote?.book);
  const close = num(row?.close ?? row?.quote?.close);
  const hasClose = Number.isFinite(close) && close > 0;
  const given = row?.quality ?? row?.quote?.quality ?? null;

  let quality;
  if (book) {
    quality = given ? normalizeDataQuality(given) : makeDataQuality({
      kind: 'executable', source: 'moment-book', asOf: at, sufficient: true,
      details: { levelsKnown: book.length },
    });
  } else if (hasClose) {
    // پایانی هست ولی دفتر نیست: قیمت هست، اجراپذیری نه. این «برآوردی»
    // است و پنهان نمی‌شود.
    quality = makeDataQuality({
      kind: 'estimated', source: 'moment-close', asOf: at, sufficient: true,
      reason: 'دفتر سفارش این لحظه نیست؛ فقط پایانی موجود است',
    });
  } else {
    quality = makeDataQuality({
      kind: 'missing', source: 'moment-book', asOf: at,
      reason: 'برای این لحظه نه دفتر سفارش هست نه پایانی',
    });
  }

  return {
    ins,
    name: text(row?.name),
    kind: row?.kind,
    strike: Number.isFinite(num(row?.strike)) ? num(row.strike) : null,
    expiry: row?.expiry ?? null,
    size: Number.isFinite(num(row?.size)) ? num(row.size) : null,
    underlyingDailyValueRial: Number.isFinite(num(row?.underlyingDailyValueRial))
      ? num(row.underlyingDailyValueRial) : null,
    optionDailyValueRial: Number.isFinite(num(row?.optionDailyValueRial))
      ? num(row.optionDailyValueRial) : null,
    openInterest: Number.isFinite(num(row?.openInterest)) ? num(row.openInterest) : null,
    quality,
    asOf: copy(row?.asOf ?? quality?.asOf),
    quote: {
      // نبودِ عدد `null` می‌ماند، نه صفر و نه قیمتِ لحظهٔ قبل.
      book: book ? copy(book) : null,
      close: hasClose ? close : null,
      quality,
      asOf: copy(row?.quote?.asOf ?? quality?.asOf),
    },
  };
}

/**
 * عکسِ لحظهٔ جاریِ جلسه.
 *
 * تا پیش از این، موتورها مستقیم `session.startSnapshot` را می‌خواندند و
 * صریح شرط می‌گذاشتند که لحظه‌اش همان لحظهٔ شروع باشد. یعنی جلسه پس از
 * یک گام زمانی به دیوار می‌خورد.
 *
 * حالا جلسه می‌تواند `momentSnapshot` داشته باشد — عکسِ لحظه‌ای که ساعت
 * روی آن ایستاده. نبودنش یعنی هنوز از شروع تکان نخورده‌ایم، پس همان
 * عکسِ شروع پاسخ است. **یک** دسترسیِ مشترک، وگرنه هر موتور قاعدهٔ خودش
 * را می‌سازد و روزی دو موتور دو عکس متفاوت می‌بینند.
 */
export function activeSnapshot(session) {
  return session?.momentSnapshot ?? session?.startSnapshot ?? null;
}

/**
 * آیا این عکس، عکسِ معتبرِ یک لحظه از همین جلسه است.
 *
 * قید عوض شد، برداشته نشد: لحظهٔ عکس باید **داخل بازهٔ جلسه** باشد — نه
 * لزوماً لحظهٔ شروع. عکسی از بیرون بازه یعنی سنجیدنِ جلسه با داده‌ای که
 * به آن تعلق ندارد.
 */
export function snapshotWithinSession(session, snapshot) {
  const key = momentKey(snapshot?.at);
  if (!Number.isFinite(key)) return false;
  return key >= momentKey(session?.start) && key <= momentKey(session?.end);
}

/**
 * عکس قراردادها در یک لحظهٔ دلخواه.
 *
 * `rows` همان چیزی است که لایهٔ داده برای **این لحظه** آورده — اینجا
 * چیزی واکشی نمی‌شود، تا ماژول به منبع داده گره نخورد و آزمون‌پذیر
 * بماند.
 */
export function portfolioMomentSnapshot(session, at, { spot, rows = [], universe = null } = {}) {
  if (!session) return fail('noSession');
  const key = momentKey(at);
  if (!Number.isFinite(key)) return fail('invalidMoment');
  if (key < momentKey(session.start) || key > momentKey(session.end)) {
    return fail('outsideSession');
  }
  // قفل‌شده یعنی قفل‌شده: بازخوانی‌اش طرحِ دیروز را با نرخ امروز قضاوت
  // می‌کند.
  const capitalInputs = session.startSnapshot?.capitalInputs;
  if (!capitalInputs) return fail('missingCapitalInputs');

  const moment = { date: Number(at.date), second: Number(at.second) };
  const contracts = (Array.isArray(rows) ? rows : [])
    .filter((row) => text(row?.ins))
    .map((row) => contractAt(row, moment));
  const missingIds = contracts
    .filter((row) => row.quote.quality.missing).map((row) => row.ins);

  const spotValue = num(spot);
  const hasSpot = Number.isFinite(spotValue) && spotValue > 0;
  const spotQuality = hasSpot
    ? makeDataQuality({ kind: 'observed', source: 'moment-spot', asOf: moment, sufficient: true })
    : makeDataQuality({
      kind: 'missing', source: 'moment-spot', asOf: moment,
      reason: 'قیمت پایه برای این لحظه نیست',
    });

  // عکسِ بدون قرارداد، عکسِ کامل با فهرست تهی نیست.
  const quality = contracts.length
    ? combineDataQuality([...contracts.map((row) => row.quote.quality), spotQuality],
      { source: 'portfolio-moment-snapshot', asOf: moment })
    : makeDataQuality({
      kind: 'missing', source: 'portfolio-moment-snapshot', asOf: moment,
      reason: 'برای این لحظه هیچ قراردادی نیست',
    });

  return {
    version: PORTFOLIO_SNAPSHOT_VERSION,
    ok: true,
    why: '',
    reason: null,
    snapshot: {
      at: moment,
      spot: hasSpot ? spotValue : null,
      underlyingDailyValueRial: Number.isFinite(num(rows?.[0]?.underlyingDailyValueRial))
        ? num(rows[0].underlyingDailyValueRial) : null,
      contracts,
      ...(universe ? { universe: copy(universe) } : {}),
      // همان ورودی‌های قفل‌شده، نه رونوشتی که روزی واگرا شود.
      capitalInputs,
      quality,
    },
    // نامِ آنچه نیست، نه فقط شمارش.
    missing: { count: missingIds.length, ins: missingIds, spot: !hasSpot },
  };
}
