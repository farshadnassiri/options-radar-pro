// ابزارهای خالص بک‌تست سریع.
//
// مسیر روزانه را موتور history می‌سازد. این فایل فقط ریزمعامله‌های روز آخر
// را به ارزش‌گذاری‌های مشاهده‌شده تبدیل می‌کند. «آخرین معامله تا این لحظه»
// قیمت قابل‌اجرای هم‌زمان نیست و مصرف‌کننده باید همین محدودیت را نشان دهد.

import { grossCash, entryFees } from './payoff.mjs';
import { EPS, num } from './num.mjs';

const reverseSide = (side) => (side === 'buy' ? 'sell' : 'buy');
export const INTRADAY_START_SECOND = 9 * 3600;
export const INTRADAY_END_SECOND = (12 * 3600) + (30 * 60);
export const INTRADAY_FRESH_SECOND = 5 * 60;

// ═══════════════════ نرمال‌سازی ریزمعامله بالادست ═══════════════════
//
// معامله باطل‌شده «ارزش‌گذاری مشاهده‌شده» نیست و نباید در بازپخش بنشیند.
//
// endpoint تاریخی `Trade/GetTradeHistory` میدان `canceled` را اعلام می‌کند؛
// دو املای سازگار قدیمی نیز برای پاسخ‌های کش‌شده خوانده می‌شود و — مهم‌تر —
// نتیجه در `canceledKnown` علامت می‌خورد: اگر بالادست هیچ‌کدام
// را نفرستد یعنی ما از وضعیت ابطال بی‌خبریم، نه اینکه چیزی باطل نشده.
// مصرف‌کننده باید همین ندانستن را به کاربر نشان دهد، نه اینکه سکوت کند.
//
// برای تأیید: یک پاسخ واقعی بگیرید و `Object.keys(rows[0])` را ببینید؛ اگر
// نام دیگری بود همین‌جا اضافه شود.
const CANCEL_KEYS = ['canceled', 'cancelled', 'isCanceled'];

export function canceledFlag(row) {
  for (const key of CANCEL_KEYS) {
    if (row?.[key] === undefined || row?.[key] === null) continue;
    return row[key] === true || Number(row[key]) === 1;
  }
  return null;                                   // بالادست چیزی نگفته است
}

export function normalizeTrades(rows = []) {
  return rows.map((r) => {
    const flag = canceledFlag(r);
    return {
      sequence: Number(r.nTran) || 0, time: Number(r.hEven) || 0,
      quantity: Number(r.qTitTran) || 0, price: Number(r.pTran) || 0,
      canceled: flag === true, canceledKnown: flag !== null,
    };
  }).filter((r) => r.price > 0 && r.time > 0)
    .sort((a, b) => a.time - b.time || a.sequence - b.sequence);
}

/** زمان HHMMSS را به ثانیه از ابتدای روز تبدیل می‌کند. */
export function tradeSecond(value) {
  const raw = String(Math.max(0, Math.trunc(num(value)))).padStart(6, '0').slice(-6);
  const h = Number(raw.slice(0, 2)), m = Number(raw.slice(2, 4)), s = Number(raw.slice(4, 6));
  return h * 3600 + m * 60 + s;
}

export function tradeTimeLabel(value) {
  const raw = String(Math.max(0, Math.trunc(num(value)))).padStart(6, '0').slice(-6);
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
}

/** فقط جلسه پیوسته بازار؛ پیش‌گشایش و داده پس از ۱۲:۳۰ وارد تحلیل نمی‌شود. */
export function inIntradaySession(value) {
  const second = tradeSecond(value);
  return second >= INTRADAY_START_SECOND && second <= INTRADAY_END_SECOND;
}

/**
 * آخرین معامله مشاهده‌شده هر پا را روی یک خط زمانی مشترک می‌گذارد.
 * تا وقتی همه پاها دست‌کم یک معامله ندارند، هیچ عدد مالی ساخته نمی‌شود.
 *
 * ——— این عدد قابل آفست نیست ———
 *
 * هر پا با آخرین معامله‌اش تا آن ثانیه حمل می‌شود. یعنی مسیرِ «ارزش
 * مشاهده‌شدهٔ موقعیت»، نه «سودی که در آن لحظه می‌شد گرفت». آفست واقعی، خرید
 * روی عرضه و فروش روی تقاضاست و اسپرد هر دو پا را می‌پردازد؛ آخرین معامله
 * می‌تواند هر جای آن اسپرد افتاده باشد، و برای دو پا در دو ثانیهٔ متفاوت.
 *
 * عدد اجرایی از **این** داده ساختنی نیست، و نامش هم همین را می‌گوید: رابط
 * این نمودار را «ارزش مشاهده‌شدهٔ موقعیت · مرجع، نه قابل آفست» می‌نامد.
 *
 * تا مدتی دلیلی که اینجا نوشته بودیم این بود که «تابلو دفتر سفارش تاریخی
 * نمی‌دهد». آن جمله غلط بود: `BestLimits/{insCode}/{date}` هست و
 * `core/book-history.mjs` از آن دفتر همان لحظه را بازمی‌سازد. پس محدودیت،
 * محدودیتِ بازار نیست؛ محدودیتِ همین مسیر است — این تابع از نوار معاملات
 * می‌خواند نه از دفتر. هر کس عدد قابل‌اجرا می‌خواهد باید از آن ماژول رد
 * شود، نه از این.
 */
export function replayIntraday({ replay, tradesByIns = {}, baseTrades = [], fees = {} }) {
  if (!replay?.ok || !replay.priced?.length) return [];
  const events = [];
  const indexesByIns = new Map();
  replay.priced.forEach((leg, index) => {
    const key = String(leg.ins);
    if (!indexesByIns.has(key)) indexesByIns.set(key, []);
    indexesByIns.get(key).push(index);
  });
  for (const [ins, legIndexes] of indexesByIns) {
    for (const trade of tradesByIns[ins] || []) {
      const price = num(trade.price, NaN);
      if (!(price > 0) || trade.canceled || !inIntradaySession(trade.time)) continue;
      events.push({ ...trade, price, legIndexes, source: 'leg', second: tradeSecond(trade.time) });
    }
  }
  for (const trade of baseTrades || []) {
    if (!(num(trade.price) > 0) || trade.canceled || !inIntradaySession(trade.time)) continue;
    events.push({ ...trade, price: num(trade.price), source: 'base', second: tradeSecond(trade.time) });
  }
  events.sort((a, b) => a.second - b.second || num(a.sequence) - num(b.sequence) || a.source.localeCompare(b.source));

  const latest = new Map();
  const firstPrices = new Map(), cumulativeVolumes = new Map(), tradeCounts = new Map();
  let lastBase = NaN, baseCumulativeVolume = 0, baseTradeCount = 0, baseLastSecond = NaN;
  // حجم تجمعی سطر باید همان چیزی باشد که واقعاً معامله شده. اگر دو پا روی یک
  // قرارداد بنشینند (نسبتی، رول)، یک معامله فیزیکی به هر دو اندیس می‌نشیند و
  // جمعِ حجم‌های پا آن را دوبار می‌شمارد. پس جمع رویدادها نگه داشته می‌شود،
  // نه جمع پاها؛ همان واحدی که `intervals.volume` هم با آن ساخته می‌شود.
  let cumulativeVolume = 0;
  const out = [];
  const capital = num(replay.entry?.capital?.value, NaN);
  const firstBase = replay.rows.find((row) => Number.isFinite(row.baseClose))?.baseClose;

  for (let at = 0; at < events.length;) {
    const second = events[at].second;
    const secondVolumes = new Map();
    let eventVolume = 0, eventTrades = 0, baseSecondVolume = 0, baseSecondTrades = 0;
    while (at < events.length && events[at].second === second) {
      const event = events[at];
      const quantity = Math.max(0, num(event.quantity));
      if (event.source === 'base') {
        lastBase = event.price;
        baseLastSecond = second;
        baseCumulativeVolume += quantity;
        baseTradeCount += 1;
        baseSecondVolume += quantity;
        baseSecondTrades += 1;
      } else {
        eventVolume += quantity;
        eventTrades += 1;
        for (const index of event.legIndexes) {
          latest.set(index, event);
          if (!firstPrices.has(index)) firstPrices.set(index, event.price);
          cumulativeVolumes.set(index, (cumulativeVolumes.get(index) || 0) + quantity);
          tradeCounts.set(index, (tradeCounts.get(index) || 0) + 1);
          secondVolumes.set(index, (secondVolumes.get(index) || 0) + quantity);
        }
      }
      at += 1;
    }
    cumulativeVolume += eventVolume;   // پیش از خروج: حجم حتی در ثانیه‌های ناقص هم معامله شده است
    if (latest.size !== replay.priced.length) continue;

    const perLeg = replay.priced.map((leg, index) => {
      const trade = latest.get(index);
      const close = { ...leg, side: reverseSide(leg.side), price: trade.price };
      const entryFee = entryFees([leg], fees);
      const exitFee = entryFees([close], fees);
      const grossPnl = grossCash([leg]) + grossCash([close]);
      return {
        index, ins: String(leg.ins), name: leg.name, side: leg.side, kind: leg.kind,
        entryPrice: leg.price, exitPrice: trade.price, quantity: num(trade.quantity),
        sequence: num(trade.sequence), grossPnl, entryFee, exitFee,
        netPnl: grossPnl - entryFee - exitFee,
        pricePct: firstPrices.get(index) > 0 ? ((trade.price / firstPrices.get(index)) - 1) * 100 : NaN,
        secondVolume: secondVolumes.get(index) || 0,
        cumulativeVolume: cumulativeVolumes.get(index) || 0,
        tradeCount: tradeCounts.get(index) || 0,
        lastTradeSecond: trade.second,
        ageSec: Math.max(0, second - trade.second),
        observedNow: trade.second === second,
      };
    });
    const netPnl = perLeg.reduce((sum, leg) => sum + leg.netPnl, 0);
    const maxAgeSec = Math.max(...perLeg.map((leg) => leg.ageSec));
    out.push({
      second, time: events[at - 1].time, timeLabel: tradeTimeLabel(events[at - 1].time),
      netPnl, returnPct: capital > EPS ? (netPnl / capital) * 100 : NaN,
      basePrice: lastBase,
      basePct: lastBase > 0 && firstBase > 0 ? ((lastBase / firstBase) - 1) * 100 : NaN,
      eventVolume, eventTrades,
      cumulativeVolume,
      activeLegs: perLeg.filter((leg) => leg.observedNow).length,
      maxAgeSec, allFresh: maxAgeSec <= INTRADAY_FRESH_SECOND,
      baseSecondVolume, baseSecondTrades, baseCumulativeVolume, baseTradeCount,
      baseAgeSec: Number.isFinite(baseLastSecond) ? Math.max(0, second - baseLastSecond) : NaN,
      perLeg,
    });
  }
  return out;
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
function correlation(a, b) {
  if (a.length < 2 || a.length !== b.length) return NaN;
  const ma = mean(a), mb = mean(b);
  const top = a.reduce((sum, value, index) => sum + ((value - ma) * (b[index] - mb)), 0);
  const da = Math.sqrt(a.reduce((sum, value) => sum + ((value - ma) ** 2), 0));
  const db = Math.sqrt(b.reduce((sum, value) => sum + ((value - mb) ** 2), 0));
  return da > EPS && db > EPS ? top / (da * db) : NaN;
}

/** خلاصه تحلیلی مسیر ثانیه‌ای، بدون ساختن داده برای بازه‌های فاقد مشاهده. */
export function summarizeIntraday(points = [], { bucketSeconds = 15 * 60 } = {}) {
  const rows = points.filter((point) => Number.isFinite(point?.netPnl))
    .sort((a, b) => a.second - b.second);
  if (!rows.length) return { points: 0, first: null, last: null, best: null, worst: null, intervals: [], legs: [], correlation: [] };

  const first = rows[0], last = rows.at(-1);
  const best = rows.reduce((current, row) => row.netPnl > current.netPnl ? row : current, first);
  const worst = rows.reduce((current, row) => row.netPnl < current.netPnl ? row : current, first);
  let peak = first.netPnl, maxDrawdown = 0, positiveSeconds = 0, freshSeconds = 0, observedSeconds = 0;
  rows.forEach((row, index) => {
    peak = Math.max(peak, row.netPnl);
    maxDrawdown = Math.min(maxDrawdown, row.netPnl - peak);
    const nextSecond = rows[index + 1]?.second ?? row.second;
    const duration = Math.max(0, nextSecond - row.second);
    observedSeconds += duration;
    if (row.netPnl > 0) positiveSeconds += duration;
    if (row.allFresh) freshSeconds += duration;
  });

  const span = Math.max(1, INTRADAY_END_SECOND - INTRADAY_START_SECOND);
  const width = Math.max(60, Math.trunc(num(bucketSeconds, 15 * 60)));
  const grouped = new Map();
  for (const row of rows) {
    const bounded = Math.min(row.second, INTRADAY_END_SECOND - 1);
    const start = INTRADAY_START_SECOND + Math.floor((bounded - INTRADAY_START_SECOND) / width) * width;
    if (!grouped.has(start)) grouped.set(start, []);
    grouped.get(start).push(row);
  }
  const intervals = [];
  for (let startSecond = INTRADAY_START_SECOND; startSecond < INTRADAY_END_SECOND; startSecond += width) {
    const list = grouped.get(startSecond) || [];
    intervals.push({
      startSecond,
      endSecond: Math.min(INTRADAY_END_SECOND, startSecond + width),
      openPnl: list[0]?.netPnl,
      closePnl: list.at(-1)?.netPnl,
      highPnl: list.length ? Math.max(...list.map((row) => row.netPnl)) : NaN,
      lowPnl: list.length ? Math.min(...list.map((row) => row.netPnl)) : NaN,
      changePnl: list.length ? list.at(-1).netPnl - list[0].netPnl : NaN,
      observations: list.length,
      volume: list.reduce((sum, row) => sum + num(row.eventVolume), 0),
      trades: list.reduce((sum, row) => sum + num(row.eventTrades), 0),
      freshPct: list.length ? (list.filter((row) => row.allFresh).length / list.length) * 100 : NaN,
    });
  }

  const legs = last.perLeg.map((lastLeg, index) => {
    const values = rows.map((row) => row.perLeg[index]).filter(Boolean);
    return {
      index, ins: lastLeg.ins, name: lastLeg.name, side: lastLeg.side, kind: lastLeg.kind,
      firstPrice: values[0]?.exitPrice, lastPrice: values.at(-1)?.exitPrice,
      pricePct: values.at(-1)?.pricePct,
      firstPnl: values[0]?.netPnl, lastPnl: values.at(-1)?.netPnl,
      pnlChange: values.at(-1)?.netPnl - values[0]?.netPnl,
      bestPnl: Math.max(...values.map((leg) => leg.netPnl)),
      worstPnl: Math.min(...values.map((leg) => leg.netPnl)),
      cumulativeVolume: lastLeg.cumulativeVolume,
      tradeCount: lastLeg.tradeCount,
      ageSec: lastLeg.ageSec,
    };
  });
  const deltas = legs.map((_, legIndex) => rows.slice(1).map((row, index) =>
    row.perLeg[legIndex].netPnl - rows[index].perLeg[legIndex].netPnl));
  const correlationMatrix = legs.map((_, row) => legs.map((__, col) => row === col ? 1 : correlation(deltas[row], deltas[col])));

  return {
    points: rows.length, first, last, best, worst,
    firstProfit: rows.find((row) => row.netPnl > 0) || null,
    maxDrawdown,
    observedSeconds,
    coveragePct: ((last.second - first.second) / span) * 100,
    positiveTimePct: observedSeconds > 0 ? (positiveSeconds / observedSeconds) * 100 : NaN,
    freshTimePct: observedSeconds > 0 ? (freshSeconds / observedSeconds) * 100 : NaN,
    intervals, legs, correlation: correlationMatrix,
  };
}

// ═══════════════════ تحلیل چندروزه روی تایم‌فریم انتخابی ═══════════════════
//
// تا اینجا هر تابع فقط یک روز را می‌دید. برای پاسخ به «این استراتژی چه مدت
// سودده بود» یا «کدام ساعت روز برای ورود بهتر است»، باید چند روز کنار هم
// بنشینند. سه قاعده در همه این توابع یکی است:
//
//   ۱. سطلی که مشاهده‌ای ندارد ساخته نمی‌شود. جای خالی صادق است.
//   ۲. هر عدد تجمیعی، تعداد نمونه‌اش را همراه خودش می‌برد.
//   ۳. هیچ قیمتی درون‌یابی نمی‌شود؛ فقط آخرین قیمت مشاهده‌شده.

const BUCKET_MIN_SECOND = 60;

const bucketWidth = (value, fallback) => Math.max(BUCKET_MIN_SECOND, Math.trunc(num(value, fallback)));

/** آغاز سطلی که این ثانیه در آن می‌افتد. */
function bucketStartSecond(second, width) {
  const bounded = Math.min(Math.max(num(second), INTRADAY_START_SECOND), INTRADAY_END_SECOND - 1);
  return INTRADAY_START_SECOND + Math.floor((bounded - INTRADAY_START_SECOND) / width) * width;
}

/** نقاط یک روز را به سطل‌های زمانی می‌شکند و در هر سطل فقط مشاهده‌شده‌ها را نگه می‌دارد. */
function groupByBucket(points, width) {
  const rows = (points || []).filter((point) => Number.isFinite(point?.netPnl)).sort((a, b) => a.second - b.second);
  const groups = new Map();
  for (const row of rows) {
    const start = bucketStartSecond(row.second, width);
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(row);
  }
  return groups;
}

/**
 * مسیر چندروزه روی تایم‌فریم انتخابی.
 *
 * ورودی `days` آرایه‌ای از `{ date, points }` است — خروجی `replayIntraday`
 * برای هر روز. خروجی، یک ردیف به‌ازای هر سطلِ دارای مشاهده، به‌ترتیب زمان.
 */
/** وضعیت یک سطل روی محورِ کاملِ جلسه. */
export const TF_BUCKET_STATUS = Object.freeze({
  // در این سطل قیمتِ کاملِ همهٔ پاها مشاهده شد.
  OBSERVED: 'observed',
  // پیش از اولین قیمتِ کاملِ آن روز. عددی وجود ندارد و ساخته هم نمی‌شود.
  BEFORE_FIRST: 'beforeFirst',
  // پس از اولین قیمتِ کامل، ولی در خودِ این سطل معامله‌ای نبود. آخرین
  // قیمتِ مشاهده‌شده در `carriedPnl` هست، با سنّش در `carriedAgeSec`.
  CARRIED: 'carried',
});

export const TF_BUCKET_LABEL = Object.freeze({
  [TF_BUCKET_STATUS.OBSERVED]: 'قیمت کامل',
  [TF_BUCKET_STATUS.BEFORE_FIRST]: 'پیش از اولین قیمت کامل',
  [TF_BUCKET_STATUS.CARRIED]: 'قیمت کهنه، حمل‌شده',
});

export function bucketIntradayPath(days = [], { bucketSeconds = 15 * 60 } = {}) {
  const width = bucketWidth(bucketSeconds, 15 * 60);
  const out = [];
  let previousClose = NaN;
  for (const day of days || []) {
    const groups = groupByBucket(day?.points, width);
    // روزی که هیچ نقطه‌ای ندارد، هیچ سطلی هم نمی‌گیرد. علتش «چرا این روز
    // داده ندارد» است و آن را `intradayPathWithGaps` در سطحِ *روز* می‌گوید
    // — با برچسبِ علت. اگر اینجا ۲۱۰ سطلِ خالی برایش بسازیم، آن ردیفِ
    // توضیح‌دار دیگر ساخته نمی‌شود و «نمی‌دانیم چرا» جایش را به سکوت
    // می‌دهد.
    if (!groups.size) continue;

    const observed = [...groups.keys()].sort((a, b) => a - b);
    const firstObserved = observed[0];
    const lastObserved = observed.at(-1);
    let carriedPnl = NaN;
    let carriedSecond = NaN;

    // ═══ محورِ کاملِ جلسه، نه فقط سطل‌هایی که مشاهده دارند ═══
    //
    // گزارش صاحب پروژه: برای استرانگلِ کم‌معامله که اولین قیمتِ کاملش
    // ساعت ۱۲:۲۵ تشکیل می‌شود، نمودار از ۱۲:۲۵ شروع می‌شد — چون حلقه روی
    // «سطل‌های موجود» می‌چرخید، نه روی خودِ بازه. یعنی در تایم‌فریم پنج
    // دقیقه‌ای یک سطل دیده می‌شد به‌جای چهل‌ودو تا.
    //
    // حالا حلقه روی خودِ جلسه است، پس شمارِ سطلِ هر روز ثابت است:
    //
    //   ۱ دقیقه ۲۱۰ · ۵ دقیقه ۴۲ · ۱۵ دقیقه ۱۴ · ۳۰ دقیقه ۷ · ۶۰ دقیقه ۴
    //
    // (سطلِ آخرِ شصت‌دقیقه‌ای نیم‌ساعته است، چون جلسه ۱۲:۳۰ تمام می‌شود.)
    //
    // ═══ و چرا سطلِ خالی عدد نمی‌گیرد ═══
    //
    // دو بندِ خواسته در ظاهر با هم می‌جنگیدند: «آخرین قیمت را تا سطل بعد
    // حمل کن» و «نمودار نباید قیمتِ ۱۲:۲۵ را به گذشته تعمیم دهد». هر دو
    // برقرارند، چون در دو **خانهٔ جدا** می‌نشینند:
    //
    //   closePnl     فقط از مشاهدهٔ واقعیِ همان سطل. سطلِ بی‌مشاهده NaN
    //                می‌ماند، پس رسّام خط را همان‌جا قطع می‌کند و هیچ
    //                قیمتی به گذشته یا آینده کشیده نمی‌شود.
    //   carriedPnl   آخرین قیمتِ کاملِ مشاهده‌شده، با `carriedAgeSec` که
    //                می‌گوید چند ثانیه از آن گذشته. جدول می‌تواند نشانش
    //                دهد، صریحاً با برچسبِ «کهنه».
    //
    // اگر هر دو یک خانه بودند، حملِ قیمت بی‌صدا به خطِ نمودار می‌نشست و
    // همان عددِ ساختگی‌ای می‌شد که قاعدهٔ ۲-۴ منع می‌کند.
    //
    // پیش از اولین قیمتِ کامل، حتی `carriedPnl` هم وجود ندارد: آنجا هیچ
    // قیمتی مشاهده نشده که حمل شود. پس‌نگری دقیقاً همان‌جا شروع می‌شد.
    for (let start = INTRADAY_START_SECOND; start < INTRADAY_END_SECOND; start += width) {
      const endSecond = Math.min(INTRADAY_END_SECOND, start + width);
      const list = groups.get(start);
      if (!list) {
        const before = start < firstObserved;
        // پس از آخرین مشاهدهٔ روز هم «حمل‌شده» است، نه «پیش از اولین»:
        // قیمتی مشاهده شده بود و سنّش دارد بزرگ می‌شود.
        const carried = !before && Number.isFinite(carriedPnl);
        out.push({
          date: day.date, startSecond: start, endSecond,
          timeLabel: '', observations: 0, seconds: 0,
          gap: true,
          status: before ? TF_BUCKET_STATUS.BEFORE_FIRST : TF_BUCKET_STATUS.CARRIED,
          why: before ? TF_BUCKET_LABEL[TF_BUCKET_STATUS.BEFORE_FIRST] : TF_BUCKET_LABEL[TF_BUCKET_STATUS.CARRIED],
          openPnl: NaN, closePnl: NaN, highPnl: NaN, lowPnl: NaN,
          changePnl: NaN, stepPnl: NaN,
          openReturnPct: NaN, returnPct: NaN, basePrice: NaN, basePct: NaN,
          volume: 0, trades: 0, baseVolume: 0,
          freshPct: NaN, maxAgeSec: NaN,
          carriedPnl: carried ? carriedPnl : NaN,
          carriedAgeSec: carried ? Math.max(0, endSecond - carriedSecond) : NaN,
          afterLast: !before && start > lastObserved,
          perLeg: [],
        });
        continue;
      }
      const first = list[0], last = list.at(-1);
      const values = list.map((row) => row.netPnl);
      out.push({
        date: day.date, startSecond: start, endSecond: Math.min(INTRADAY_END_SECOND, start + width),
        status: TF_BUCKET_STATUS.OBSERVED,
        timeLabel: last.timeLabel, observations: list.length,
        seconds: Math.max(0, last.second - first.second),
        openPnl: first.netPnl, closePnl: last.netPnl,
        highPnl: Math.max(...values), lowPnl: Math.min(...values),
        // «تغییر درون سطل» از اولین تا آخرین مشاهده همان سطل است؛ «تغییر
        // پیاپی» از بسته‌شدن سطل قبلی — حتی اگر آن سطل در روز دیگری باشد.
        changePnl: last.netPnl - first.netPnl,
        stepPnl: Number.isFinite(previousClose) ? last.netPnl - previousClose : NaN,
        openReturnPct: first.returnPct, returnPct: last.returnPct,
        basePrice: last.basePrice, basePct: last.basePct,
        volume: list.reduce((sum, row) => sum + num(row.eventVolume), 0),
        trades: list.reduce((sum, row) => sum + num(row.eventTrades), 0),
        baseVolume: Math.max(0, num(last.baseCumulativeVolume) - num(first.baseCumulativeVolume) + num(first.baseSecondVolume)),
        freshPct: (list.filter((row) => row.allFresh).length / list.length) * 100,
        maxAgeSec: Math.max(...list.map((row) => num(row.maxAgeSec, 0))),
        perLeg: last.perLeg.map((leg, index) => ({
          index, ins: leg.ins, name: leg.name, side: leg.side,
          price: leg.exitPrice, netPnl: leg.netPnl,
          changePnl: leg.netPnl - first.perLeg[index].netPnl,
          priceChange: leg.exitPrice - first.perLeg[index].exitPrice,
          cumulativeVolume: leg.cumulativeVolume, tradeCount: leg.tradeCount, ageSec: leg.ageSec,
        })),
      });
      previousClose = last.netPnl;
      carriedPnl = last.netPnl;
      carriedSecond = last.second;
    }
  }
  return out;
}

/**
 * فقط سطل‌هایی که قیمتِ کاملِ مشاهده‌شده دارند.
 *
 * محورِ کاملِ جلسه برای **نمودار و جدول** لازم است: بی آن، روزی که اولین
 * قیمتش ساعت ۱۲:۲۵ تشکیل می‌شود از ۱۲:۲۵ شروع می‌شد. ولی هر آماری که
 * روی «شمارِ سطل» بایستد، با سطل‌های خالی بی‌معنی می‌شود — «۲۱۰ سطل
 * تایم‌فریم» وقتی دو تایشان معامله داشته‌اند، عددی است که گمراه می‌کند.
 *
 * پس هر جا سنجه‌ای از سطل‌ها ساخته می‌شود (تلاطم ضمنی، شمارِ منبع)، از
 * این گذر می‌کند؛ و هر جا محور لازم است، از خودِ خروجی.
 */
export function observedBuckets(rows = []) {
  return (rows || []).filter((row) => (row?.status
    ? row.status === TF_BUCKET_STATUS.OBSERVED
    : num(row?.observations) > 0));
}

/**
 * مسیرِ نمایشیِ پیوسته برای نمودارهای «کل بازه».
 *
 * سطلِ بی‌معامله عدد تازه‌ای ندارد؛ اما بعد از اولین سطلِ مشاهده‌شده می‌شود
 * آخرین ارزش‌گذاری را با برچسبِ صریحِ «حمل‌شده» نمایش داد. این تابع آن
 * مقدار را در خانه‌های `chart*` می‌گذارد تا دادهٔ خامِ سطل دست‌نخورده بماند.
 * با عوض‌شدن روز یا رسیدن به شکاف روزانه، حمل صفر می‌شود؛ بنابراین قیمت
 * روز قبل هرگز وارد روز بعد نمی‌شود و پیش از اولین مشاهده هم عددی نداریم.
 */
export function timeframeChartPath(rows = []) {
  let activeDate = null;
  let lastObserved = null;
  return (rows || []).map((row) => {
    const date = Number(row?.date) || null;
    if (row?.dayGap || date !== activeDate) {
      activeDate = date;
      lastObserved = null;
    }
    if (row?.status === TF_BUCKET_STATUS.OBSERVED) lastObserved = row;
    const carried = row?.status === TF_BUCKET_STATUS.CARRIED && Boolean(lastObserved);
    const source = row?.status === TF_BUCKET_STATUS.OBSERVED ? row : carried ? lastObserved : null;
    return {
      ...row,
      chartStatus: source ? (carried ? TF_BUCKET_STATUS.CARRIED : TF_BUCKET_STATUS.OBSERVED) : row?.status,
      chartPnl: source ? source.closePnl : NaN,
      chartReturnPct: source ? source.returnPct : NaN,
      chartBasePrice: source ? source.basePrice : NaN,
      chartBasePct: source ? source.basePct : NaN,
      chartPerLeg: source ? (source.perLeg || []) : [],
    };
  });
}

/**
 * چه مدت در سود بود و چه مدت در زیان — به تفکیک روز و در کل.
 *
 * واحد، ثانیهٔ مشاهده‌شده است، نه ثانیهٔ تقویمی: بین دو معامله هیچ مشاهده‌ای
 * نداریم و شمردن آن به‌عنوان «در سود» یعنی ادعای چیزی که ندیده‌ایم. پس هر
 * ثانیه به آخرین مشاهده پیش از خودش نسبت داده می‌شود و بازهٔ بی‌معامله بعد
 * از آخرین معامله روز اصلاً شمرده نمی‌شود.
 */
export function intradayHoldingSummary(days = []) {
  const rows = [];
  for (const day of days || []) {
    const points = (day?.points || []).filter((point) => Number.isFinite(point?.netPnl)).sort((a, b) => a.second - b.second);
    if (!points.length) continue;
    let positive = 0, negative = 0, flat = 0, observed = 0;
    points.forEach((point, index) => {
      const duration = Math.max(0, (points[index + 1]?.second ?? point.second) - point.second);
      observed += duration;
      if (point.netPnl > 0) positive += duration;
      else if (point.netPnl < 0) negative += duration;
      else flat += duration;
    });
    const values = points.map((point) => point.netPnl);
    rows.push({
      date: day.date, points: points.length,
      firstSecond: points[0].second, lastSecond: points.at(-1).second,
      observedSeconds: observed, positiveSeconds: positive, negativeSeconds: negative, flatSeconds: flat,
      positivePct: observed > 0 ? (positive / observed) * 100 : NaN,
      openPnl: points[0].netPnl, closePnl: points.at(-1).netPnl,
      changePnl: points.at(-1).netPnl - points[0].netPnl,
      bestPnl: Math.max(...values), worstPnl: Math.min(...values),
      closeReturnPct: points.at(-1).returnPct,
      basePct: points.at(-1).basePct,
      volume: points.reduce((sum, point) => sum + num(point.eventVolume), 0),
    });
  }
  const observedSeconds = rows.reduce((sum, row) => sum + row.observedSeconds, 0);
  const positiveSeconds = rows.reduce((sum, row) => sum + row.positiveSeconds, 0);
  const negativeSeconds = rows.reduce((sum, row) => sum + row.negativeSeconds, 0);
  return {
    days: rows,
    observedSeconds, positiveSeconds, negativeSeconds,
    flatSeconds: observedSeconds - positiveSeconds - negativeSeconds,
    positivePct: observedSeconds > 0 ? (positiveSeconds / observedSeconds) * 100 : NaN,
    negativePct: observedSeconds > 0 ? (negativeSeconds / observedSeconds) * 100 : NaN,
    positiveDays: rows.filter((row) => row.closePnl > 0).length,
    negativeDays: rows.filter((row) => row.closePnl < 0).length,
    dayCount: rows.length,
  };
}

const median = (values) => {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * رفتار هر بازهٔ ساعتی روز، تجمیع‌شده روی همه روزها.
 *
 * پاسخ «در چه بازه‌هایی از روز رفتار مشابه داشته» عدد `consistencyPct` است:
 * سهم پرتکرارترین جهت در همان بازه. ۱۰۰ یعنی در همه روزها یک‌جور حرکت کرده،
 * ۵۰ یعنی سکه انداختن. این توصیف گذشته است، نه پیش‌بینی.
 */
export function timeOfDayProfile(days = [], { bucketSeconds = 30 * 60 } = {}) {
  const width = bucketWidth(bucketSeconds, 30 * 60);
  const slots = new Map();
  for (const day of days || []) {
    const groups = groupByBucket(day?.points, width);
    for (const [start, list] of groups) {
      if (!slots.has(start)) slots.set(start, []);
      slots.get(start).push({
        date: day.date,
        changePnl: list.at(-1).netPnl - list[0].netPnl,
        closePnl: list.at(-1).netPnl,
        volume: list.reduce((sum, row) => sum + num(row.eventVolume), 0),
      });
    }
  }
  return [...slots.keys()].sort((a, b) => a - b).map((start) => {
    const list = slots.get(start);
    const changes = list.map((row) => row.changePnl);
    const up = changes.filter((value) => value > 0).length;
    const down = changes.filter((value) => value < 0).length;
    return {
      startSecond: start, endSecond: Math.min(INTRADAY_END_SECOND, start + width),
      days: list.length, upDays: up, downDays: down, flatDays: list.length - up - down,
      meanChange: changes.reduce((sum, value) => sum + value, 0) / list.length,
      medianChange: median(changes),
      upPct: (up / list.length) * 100,
      consistencyPct: (Math.max(up, down) / list.length) * 100,
      meanVolume: list.reduce((sum, row) => sum + row.volume, 0) / list.length,
    };
  });
}

/** سود خالص «ورود با این قیمت‌ها و خروج با آن قیمت‌ها»، با کارمزد هر دو سمت. */
function pnlBetween(legs, openPrices, closePrices, fees) {
  const openLegs = legs.map((leg, index) => ({ ...leg, price: openPrices[index] }));
  const closeLegs = legs.map((leg, index) => ({ ...leg, side: reverseSide(leg.side), price: closePrices[index] }));
  return grossCash(openLegs) + grossCash(closeLegs) - entryFees(openLegs, fees) - entryFees(closeLegs, fees);
}

// ماتریس ورود×خروج درون‌روزی با سطل یک‌دقیقه‌ای، ۲۱۰ سطل و بیش از بیست هزار
// جفت در هر روز می‌سازد. کف پنج دقیقه، این را به کمتر از هزار جفت می‌آورد.
// مقدار واقعاً به‌کاررفته در خروجی برمی‌گردد تا رابط بتواند صریح بگوید.
export const ENTRY_EXIT_MIN_BUCKET = 5 * 60;

/**
 * «کِی بهتر بود وارد می‌شدی و کِی خارج؟»
 *
 * برای هر جفت بازهٔ ساعتی (ورود پیش از خروج)، نتیجهٔ ساختن موقعیت با
 * قیمت‌های مشاهده‌شدهٔ پایان بازهٔ ورود و بستنش با قیمت‌های پایان بازهٔ خروج
 * — روی هر روز جداگانه، بعد تجمیع.
 *
 * این با «آفست موقعیتی که در روز ورود ساخته شده» فرق دارد و عمداً جداست:
 * آنجا قیمت ورود ثابت است، اینجا هر دو سر متغیرند. اگر یکی جای دیگری
 * گزارش شود، عددی به کاربر داده‌ایم که به سؤالش ربط ندارد.
 */
export function intradayEntryExitProfile(days = [], { legs = [], bucketSeconds = 30 * 60, fees = {} } = {}) {
  const width = Math.max(ENTRY_EXIT_MIN_BUCKET, bucketWidth(bucketSeconds, 30 * 60));
  if (!legs.length) return { bucketSeconds: width, slots: [], cells: [], entries: [], exits: [], best: null, days: 0 };

  const perDay = [];
  const slotSet = new Set();
  for (const day of days || []) {
    const groups = groupByBucket(day?.points, width);
    const marks = new Map();
    for (const [start, list] of groups) {
      marks.set(start, list.at(-1).perLeg.map((leg) => leg.exitPrice));
      slotSet.add(start);
    }
    if (marks.size > 1) perDay.push(marks);
  }
  const slots = [...slotSet].sort((a, b) => a - b);
  const pairs = new Map();
  for (const marks of perDay) {
    const present = [...marks.keys()].sort((a, b) => a - b);
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const key = `${present[i]}|${present[j]}`;
        if (!pairs.has(key)) pairs.set(key, []);
        pairs.get(key).push(pnlBetween(legs, marks.get(present[i]), marks.get(present[j]), fees));
      }
    }
  }
  const cells = [...pairs.entries()].map(([key, values]) => {
    const [entrySecond, exitSecond] = key.split('|').map(Number);
    const wins = values.filter((value) => value > 0).length;
    return {
      entrySecond, exitSecond, samples: values.length,
      meanPnl: values.reduce((sum, value) => sum + value, 0) / values.length,
      medianPnl: median(values), bestPnl: Math.max(...values), worstPnl: Math.min(...values),
      winPct: (wins / values.length) * 100,
    };
  }).sort((a, b) => a.entrySecond - b.entrySecond || a.exitSecond - b.exitSecond);

  // رتبه‌بندی با میانه، نه میانگین: یک روز استثنایی نباید یک بازه را برنده کند.
  const summarize = (second, pick) => {
    const list = cells.filter((cell) => cell[pick] === second);
    if (!list.length) return null;
    const samples = list.reduce((sum, cell) => sum + cell.samples, 0);
    return {
      second, pairs: list.length, samples,
      medianPnl: median(list.map((cell) => cell.medianPnl)),
      meanPnl: list.reduce((sum, cell) => sum + cell.meanPnl * cell.samples, 0) / samples,
      winPct: list.reduce((sum, cell) => sum + cell.winPct * cell.samples, 0) / samples,
    };
  };
  const entries = slots.map((second) => summarize(second, 'entrySecond')).filter(Boolean);
  const exits = slots.map((second) => summarize(second, 'exitSecond')).filter(Boolean);
  const pickBest = (list) => list.reduce((best, row) => !best || row.medianPnl > best.medianPnl ? row : best, null);
  const bestCell = cells.reduce((best, cell) => !best || cell.medianPnl > best.medianPnl ? cell : best, null);
  return {
    bucketSeconds: width, requestedBucketSeconds: bucketWidth(bucketSeconds, 30 * 60),
    days: perDay.length, slots, cells, entries, exits,
    bestEntry: pickBest(entries), bestExit: pickBest(exits), best: bestCell,
  };
}

// ————————————————————————————————————————————————————————————————
// پوششِ روزها در گام سوم — و شکافی که باید دیده شود.
//
// ═══ گزارش صاحب پروژه ═══
//
// «همه روزهای درون بازه را انگار پوشش نمیده و برخی روزها رو نمیاره.»
//
// درست بود، و دو علت داشت که هر دو یک ریشه دارند: روزِ بی‌داده **بی‌صدا**
// حذف می‌شد.
//
// ۱. فهرستِ مرجع، روزهایی بود که مسیرِ روزانه وضعیت `ok` داده بود. روزِ
//    `missing` یا `liquidity` اصلاً درخواست هم نمی‌شد — در حالی که نوارِ
//    ریزمعامله منبعِ دیگری است و می‌تواند همان روز داده داشته باشد.
//
// ۲. روزی که نقطهٔ مشترک نمی‌ساخت، از خروجی می‌افتاد. پس نمودار دو روزِ
//    غیرمجاور را مستقیم به هم وصل می‌کرد و پیوستگیِ سودوزیان، افت سرمایه و
//    ریسکِ نگه‌داری، تصویرِ گمراه‌کننده می‌داد.
//
// چرا این مهم است و «جزئیات نمایشی» نیست: معامله‌گر از شکل همان خط،
// بیشینهٔ افت را می‌خواند. خطی که از روی یک هفتهٔ بی‌معامله پریده، افتِ
// کمتری نشان می‌دهد از آنچه واقعاً بوده.
//
// درمان هم دو نیمه دارد: هر روزِ معاملاتیِ بازه در فهرست بماند و **علتش**
// نوشته شود، و روزِ بی‌داده روی محور یک **شکاف** باشد نه یک حذف.
// ————————————————————————————————————————————————————————————————

/** وضعیت هر روز در گام سوم. جدا از وضعیتِ مسیرِ روزانه، چون منبعشان جداست. */
export const TF_DAY_STATUS = Object.freeze({
  OK: 'ok',
  FAILED: 'failed',
  BASE_GAP: 'baseGap',
  NO_BASE: 'noBase',
  NO_LEGS: 'noLegs',
  NO_POINTS: 'noPoints',
  SKIPPED: 'skipped',
});

/**
 * پاسخِ خالیِ نماد پایه، در روزی که پاها معامله داشته‌اند.
 *
 * ═══ چرا این «واقعیتِ بازار» نیست ═══
 *
 * ممیزی (۱۴۰۵/۰۶/۲۴): سه روزِ ۲۱ تا ۲۳ شهریور «نماد پایه معامله نشد»
 * گرفتند، در حالی که درخواستِ مستقیمِ همان endpoint برای اهرم ۹۷۵ و ۹۴۹ و
 * ۵٬۸۴۵ معامله داد.
 *
 * ولی برای تشخیصش لازم نبود بیرون را بپرسیم — خودِ داده متناقض بود:
 * اختیارِ روی یک نماد وقتی معامله می‌شود که خودِ نماد باز و فعال است. پس
 * «پاها معامله دارند ولی پایه صفر است» یک وضعیتِ بازاری نیست؛ نشانهٔ
 * پاسخِ ناقص است.
 *
 * این تفاوت عملی است: «معامله نشده» یعنی تمام، و «ناقص» یعنی دوباره
 * بپرس. تا امروز هر دو یک چیز شمرده می‌شدند و روز برای همیشه می‌رفت.
 */
export function baseGapSuspect({ baseTrades = [], legTrades = [] } = {}) {
  const live = (rows) => (rows || []).some((row) => !row?.canceled
    && Number(row?.price) > 0 && inIntradaySession(row?.time));
  return !live(baseTrades) && (legTrades || []).some((rows) => live(rows));
}

/**
 * جملهٔ فارسی هر وضعیت.
 *
 * چهار علتِ متفاوت، چهار جمله. «خطای دریافت» یعنی دوباره تلاش کن؛ «نماد
 * پایه معامله نشد» یعنی واقعیتِ بازار است و تلاش دوباره فایده ندارد. یک
 * جملهٔ مشترک برای هر دو، تصمیمِ کاربر را خراب می‌کند.
 */
export const TF_DAY_LABEL = Object.freeze({
  ok: 'معتبر',
  failed: 'خطای دریافت',
  baseGap: 'پاسخ ناقص پایه (پاها معامله داشتند)',
  noBase: 'نماد پایه معامله نشد',
  noLegs: 'پای بی‌معامله',
  noPoints: 'نقطهٔ مشترک نساخت',
  skipped: 'بیرون از سقف بررسی',
});

/** شمارشِ هر وضعیت، به‌ترتیبِ ثابت — تا جملهٔ خلاصه هر بار یک شکل باشد. */
export function coverageSummary(coverage = []) {
  const counts = Object.fromEntries(Object.values(TF_DAY_STATUS).map((key) => [key, 0]));
  for (const row of coverage || []) {
    const status = String(row?.status || '');
    if (status in counts) counts[status] += 1;
  }
  return { ...counts, total: (coverage || []).length };
}

/**
 * سطل‌های واقعی، به‌علاوهٔ یک ردیفِ **خالی** برای هر روزِ بی‌داده.
 *
 * ردیفِ خالی هیچ عددی ندارد — نه صفر، نه قیمتِ حمل‌شده از روز قبل. رسّامِ
 * نمودار ردیفِ بی‌عدد را شکاف می‌کشد و خط را قطع می‌کند، که همان چیزی است
 * که باید: «این روز را نمی‌دانیم»، نه «این روز صفر بود».
 *
 * حملِ آخرین قیمت به روز بعد عمداً اینجا نیست. اگر روزی لازم شد، باید
 * گزینهٔ صریحِ کاربر باشد نه رفتارِ خاموشِ پیش‌فرض — وگرنه عددی ساخته‌ایم
 * که هیچ‌کس معامله‌اش نکرده (قاعدهٔ ۲-۴).
 */
export function intradayPathWithGaps(buckets = [], coverage = []) {
  const byDate = new Map();
  for (const row of buckets || []) {
    const date = Number(row?.date);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(row);
  }
  const out = [];
  for (const day of coverage || []) {
    const date = Number(day?.date);
    const rows = byDate.get(date);
    if (rows?.length) { out.push(...rows); continue; }
    out.push({
      // `dayGap` از شکافِ سطحِ *روز* حرف می‌زند: کلِ روز داده نداشت و علتش
      // در `why` نوشته شده. سطلِ خالیِ درون‌روز هم `gap` دارد ولی `dayGap`
      // ندارد — و این تفاوت لازم است، چون برچسبِ یکی تاریخ است و برچسبِ
      // دیگری بازهٔ ساعت.
      date, gap: true, dayGap: true, status: String(day?.status || TF_DAY_STATUS.NO_POINTS),
      why: TF_DAY_LABEL[day?.status] || TF_DAY_LABEL.noPoints,
      startSecond: INTRADAY_START_SECOND, endSecond: INTRADAY_END_SECOND,
      timeLabel: '', observations: 0, seconds: 0, perLeg: [],
      openPnl: NaN, closePnl: NaN, highPnl: NaN, lowPnl: NaN,
      changePnl: NaN, stepPnl: NaN, returnPct: NaN, basePrice: NaN, basePct: NaN, volume: NaN,
    });
  }
  return out;
}
