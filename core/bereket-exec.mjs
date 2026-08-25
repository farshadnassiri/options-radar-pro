// اجراپذیری در یک لحظهٔ گذشته.
//
// سند این را «قید اصلی» می‌نامد نه فیلتر جانبی، و درست می‌گوید: با یک
// میلیارد تومان، نقدشوندگی مسئلهٔ اول است نه انتخاب استراتژی. ساختاری که
// روی کاغذ بهترین بازده را دارد و در تابلو دو قرارداد بیشتر جا نمی‌گیرد،
// گزینه نیست.
//
// این ماژول موتور تازه‌ای نمی‌سازد. `core/exec.mjs` سال‌هاست همین کار را
// برای مظنهٔ زنده می‌کند؛ آنچه نبود، مظنهٔ **گذشته** بود. حالا
// `core/book-history.mjs` دفتر آن لحظه را می‌سازد و این فایل فقط آن را
// به همان موتور می‌دهد. قاعدهٔ «یک موتور مشترک» یعنی همین: اگر مسیر تازه
// محاسبهٔ خودش را داشت، دو عدد اجراپذیری در برنامه می‌چرخید.
//
// ═══ صف ═══
//
// چیزی که در تابلوی تهران هیچ فرمولی نمی‌بیندش: نمادی که در صف خرید قفل
// است، قیمت دارد، دفتر دارد، و **قابل خرید نیست**. عمق سمت عرضه‌اش خالی
// است. اگر فقط عمق را بشماریم، خروجی «صفر قرارداد» می‌شود و همان درست
// است — ولی دلیلش گم می‌شود و کاربر فکر می‌کند داده نداریم. صف، حالت
// جداگانه‌ای است و اسم خودش را می‌گیرد.

import { num } from './num.mjs';
import { priceLegs, maxSize, executionCost, midOf, spreadPct, rowQuality } from './exec.mjs';
import { quoteFromBook } from './book-history.mjs';

/** سقف مصرف عمق هر سطح، بر حسب درصد. سند این عدد را پیشنهاد داده. */
export const DEFAULT_TAKE_PCT = 30;

export const QUEUE_STATES = {
  normal: 'عادی',
  buyQueue: 'صف خرید',
  sellQueue: 'صف فروش',
  noBook: 'بدون مظنه',
  halted: 'متوقف',
};

/**
 * حالت صف، از دفتر و دامنهٔ مجاز.
 *
 * دو نشانه با هم: یک سمت دفتر خالی باشد، **و** بهترین قیمت سمت پر روی
 * حد دامنه نشسته باشد. تنهاییِ هیچ‌کدام کافی نیست — قرارداد کم‌معاملهٔ
 * اختیار هم می‌تواند یک سمتش خالی باشد بی‌آنکه صفی در کار باشد، و آن
 * «بی‌مظنه» است نه «صف». تفکیک این دو مهم است چون درمانشان فرق دارد:
 * بی‌مظنه یعنی صبر کن، صف یعنی امروز اصلاً نمی‌شود.
 *
 * `limitLow` و `limitHigh` از `GetStaticThreshold` همان روز می‌آیند. اگر
 * نداشته باشیمشان، صف را «نامعلوم» اعلام می‌کنیم نه «عادی»: نبودِ نشانه،
 * نشانهٔ نبودن نیست.
 */
export function queueState(book = [], { limitLow = NaN, limitHigh = NaN, state = '' } = {}) {
  if (state && !String(state).toUpperCase().startsWith('A')) {
    return { key: 'halted', label: QUEUE_STATES.halted, tradable: false, known: true, why: 'نماد مجاز نیست' };
  }
  const rows = (book || []).filter((row) => row);
  if (!rows.length) {
    return { key: 'noBook', label: QUEUE_STATES.noBook, tradable: false, known: true, why: 'دفتری در آن لحظه نبود' };
  }
  const bidQty = rows.reduce((sum, row) => sum + num(row.bidQty), 0);
  const askQty = rows.reduce((sum, row) => sum + num(row.askQty), 0);
  const top = rows.find((row) => num(row.level) === 1) || rows[0];
  const hasLimits = Number.isFinite(num(limitLow, NaN)) && Number.isFinite(num(limitHigh, NaN));

  if (!(bidQty > 0) && !(askQty > 0)) {
    return { key: 'noBook', label: QUEUE_STATES.noBook, tradable: false, known: true, why: 'هر دو سمت دفتر خالی بود' };
  }
  if (!(askQty > 0)) {
    if (!hasLimits) {
      return { key: 'buyQueue', label: QUEUE_STATES.buyQueue, tradable: false, known: false,
        why: 'سمت عرضه خالی بود ولی دامنهٔ مجاز آن روز را نداریم؛ صف بودنش تأیید نشده.' };
    }
    const atCap = num(top.bid) >= num(limitHigh) - 1e-9;
    return atCap
      ? { key: 'buyQueue', label: QUEUE_STATES.buyQueue, tradable: false, known: true, why: 'تقاضا روی سقف دامنه و عرضه خالی' }
      : { key: 'noBook', label: QUEUE_STATES.noBook, tradable: false, known: true, why: 'عرضه‌ای در دفتر نبود' };
  }
  if (!(bidQty > 0)) {
    if (!hasLimits) {
      return { key: 'sellQueue', label: QUEUE_STATES.sellQueue, tradable: false, known: false,
        why: 'سمت تقاضا خالی بود ولی دامنهٔ مجاز آن روز را نداریم؛ صف بودنش تأیید نشده.' };
    }
    const atFloor = num(top.ask) <= num(limitLow) + 1e-9;
    return atFloor
      ? { key: 'sellQueue', label: QUEUE_STATES.sellQueue, tradable: false, known: true, why: 'عرضه روی کف دامنه و تقاضا خالی' }
      : { key: 'noBook', label: QUEUE_STATES.noBook, tradable: false, known: true, why: 'تقاضایی در دفتر نبود' };
  }
  return { key: 'normal', label: QUEUE_STATES.normal, tradable: true, known: true, why: '' };
}

/**
 * مظنهٔ هر پا در یک لحظهٔ گذشته، از دفتر بازسازی‌شده.
 *
 * `books` نگاشت کد ابزار به خروجی `bookAt` است. پایی که دفتر ندارد
 * مظنه هم نمی‌گیرد — `null` می‌ماند، نه شیء خالی؛ چون شیء خالی از موتور
 * رد می‌شود و عدد صفر می‌سازد.
 */
export function quotesForLegs(legs = [], books = {}, meta = {}) {
  return (legs || []).map((leg) => {
    const key = String(leg?.ins ?? '');
    const snapshot = books?.[key];
    const quote = quoteFromBook(snapshot);
    if (!quote) return null;
    const extra = meta?.[key] || {};
    return {
      ...quote,
      state: extra.state || '',
      limitLow: num(extra.limitLow, NaN), limitHigh: num(extra.limitHigh, NaN),
      queue: queueState(quote.book, {
        limitLow: extra.limitLow, limitHigh: extra.limitHigh, state: extra.state,
      }),
    };
  });
}

/**
 * اجراپذیری کل ساختار در یک لحظه.
 *
 * خروجی سه چیزی را می‌دهد که سند خواسته — حداکثر تعداد قرارداد، قیمت
 * میانگین موزون واقعی پس از پیمایش عمق، و هزینهٔ لغزش — و یک چیز چهارم
 * که سند نخواسته و بدون آن سه‌تای اول قابل استفاده نیستند: **دلیل**.
 * عددی که می‌گوید «صفر قرارداد» بدون اینکه بگوید چرا، کاربر را وادار
 * می‌کند خودش حدس بزند، و حدسش معمولاً «داده نداریم» است حتی وقتی جواب
 * «امروز صف بود» باشد.
 *
 * ساختاری که `max` آن صفر باشد اصلاً نباید وارد رتبه‌بندی شود. این تابع
 * حذفش نمی‌کند — می‌گوید صفر است و چرا؛ حذف، کار لایهٔ رتبه‌بندی است.
 */
export function executableAt({
  legs = [], books = {}, meta = {}, fees = {}, contractSize = 1000,
  takePct = DEFAULT_TAKE_PCT, execMode = 'AGGRESSIVE', basis = 'BOOK',
  capitalAvailable = 0, capitalPerContract = 0, qty = 1,
  marginNet = 0, rFree = 0, days = 0, yearDays = 365,
} = {}) {
  const quotes = quotesForLegs(legs, books, meta);
  const share = Math.min(1, Math.max(0, num(takePct, DEFAULT_TAKE_PCT) / 100));

  const missing = [];
  const blocked = [];
  legs.forEach((leg, at) => {
    const quote = quotes[at];
    const label = legLabel(leg);
    if (!quote) { missing.push(label); return; }
    if (!quote.queue.tradable) blocked.push({ leg: label, ...quote.queue });
  });

  if (missing.length) {
    return {
      max: 0, binding: 'بی‌مظنه', limits: [], quotes, blocked, missing,
      ok: false, why: `در آن لحظه برای ${missing.join('، ')} دفتری نبود؛ این ساختار ساختنی نیست.`,
    };
  }
  if (blocked.length) {
    const why = blocked.map((row) => `${row.leg}: ${row.label}`).join('، ');
    return {
      max: 0, binding: blocked[0].label, limits: [], quotes, blocked, missing,
      ok: false, why: `${why}. تا وقتی صف باز نشود این ساختار ساختنی نیست.`,
      unverifiedQueue: blocked.some((row) => !row.known),
    };
  }

  const priced = priceLegs(legs, quotes, {
    qty: num(qty, 1), contractSize, basis, execMode, takePct: share,
  });
  const sized = maxSize(priced, { contractSize, capitalAvailable, capitalPerContract });
  const cost = executionCost(priced, { fees, marginNet, rFree, days, yearDays });
  const quality = rowQuality(priced, {});

  const slipPct = priced.reduce((worst, leg) => {
    const value = Math.abs(num(leg.exec?.slipPct, 0));
    return Number.isFinite(value) && value > worst ? value : worst;
  }, 0);

  return {
    ok: sized.max > 0,
    max: sized.max, binding: sized.binding, limits: sized.limits,
    priced, quotes, cost, quality, slipPct, takePct: num(takePct, DEFAULT_TAKE_PCT),
    blocked, missing,
    why: sized.max > 0 ? '' : `عمق کافی نبود — قید: ${sized.binding}`,
    spreadPctByLeg: quotes.map((quote) => (quote ? spreadPct(quote) : NaN)),
    midByLeg: quotes.map((quote) => (quote ? midOf(quote) : NaN)),
  };
}

function legLabel(leg) {
  if (!leg) return 'پا';
  if (leg.kind === 'underlying') return 'سهم پایه';
  const kind = leg.kind === 'call' ? 'کال' : 'پوت';
  const side = leg.side === 'sell' ? 'فروش' : 'خرید';
  return `${side} ${kind} ${num(leg.strike)}`;
}
