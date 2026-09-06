// زنجیرهٔ یک روزِ گذشته — همان ساختار، با قیمتِ همان روز.
//
// ═══ خواستهٔ صاحب پروژه (بندِ ۸) ═══
//
// «در صفحه مخصوص هر استراتژی امکان رصد زنده و همچنین رصد تاریخی وجود
// داشته باشه … اگه کاربر تاریخ داد جدول بر اساس تاریخ به روز بشه.»
//
// ═══ چرا همین راه، نه یک موتورِ تاریخیِ دوم ═══
//
// «همان جدول، تاریخ دیگر» فقط وقتی معنی دارد که ستون‌ها **واقعاً** یکی
// باشند. اگر رصدِ تاریخی موتورِ خودش را داشت، «بازده ماهانه»ی امروز و
// «بازده ماهانه»ی دیروز دو محاسبهٔ متفاوت می‌شدند و مقایسه‌شان بی‌معنی.
//
// پس هیچ محاسبه‌ای اینجا تکرار نمی‌شود. این ماژول فقط **ورودی** می‌سازد:
// ردیف‌های هویتِ قرارداد آن روز (از `/api/history/universe?date=`) را با
// قیمت‌های روزانهٔ همان روز پر می‌کند و به `buildChain` می‌دهد. از آن به
// بعد همان `core/scan.mjs` و همان `core/evaluate.mjs` کار می‌کنند که
// رصدِ زنده با آن‌ها کار می‌کند.
//
// ═══ سه چیزی که ساخته نمی‌شود ═══
//
// ۱ **قیمتِ روزِ دیگر.** فقط ردیفِ دقیقاً همان تاریخ برداشته می‌شود.
//   جانشین‌کردنِ روزِ قبل، عددی می‌سازد که کاربر آن روز نمی‌توانست ببیند.
// ۲ **دفتر سفارش.** تابلو برای گذشته سطحِ سفارش نمی‌دهد و هیچ‌جا نمی‌شود
//   ساختش. پس `bid` و `ask` صفر می‌مانند و مبنای «دفتر سفارش» در حالت
//   تاریخی در دسترس نیست — نه اینکه بد جواب بدهد، اصلاً نباید انتخاب شود.
// ۳ **قیمتِ پایه از قرارداد.** اگر سری روزانهٔ نماد پایه آن روز را ندارد،
//   قیمتِ پایه صفر می‌ماند و ترکیب‌هایش ساخته نمی‌شوند.

import { buildChain } from './chain.mjs';
import { normalizeHistoryDate } from './history.mjs';
import { num } from './num.mjs';

/**
 * مبناهای قیمتی که در حالت تاریخی معنی دارند.
 *
 * «دفتر سفارش» عمداً نیست: سطوحِ سفارشِ گذشته وجود ندارند.
 */
export const HISTORY_CHAIN_BASES = [
  ['LAST', 'آخرین معامله'],
  ['CLOSE', 'قیمت پایانی'],
  ['LOW', 'کمترین قیمت روز'],
  ['HIGH', 'بیشترین قیمت روز'],
];

export const HISTORY_BASIS_KEYS = new Set(HISTORY_CHAIN_BASES.map(([key]) => key));

/** مبنای زنده‌ای که در گذشته معنی ندارد، به نزدیک‌ترین مبنای مرجع می‌افتد. */
export function historyBasis(basis) {
  const key = String(basis ?? '').toUpperCase();
  return HISTORY_BASIS_KEYS.has(key) ? key : 'CLOSE';
}

/**
 * ردیفِ **دقیقاً** همان روز از یک سری روزانه.
 *
 * هیچ روزِ دیگری جانشین نمی‌شود. سری‌ها مرتب می‌آیند ولی اینجا به ترتیب
 * تکیه نمی‌کنیم: یک سریِ نامرتب باید همان جواب را بدهد، نه جوابِ غلط.
 */
export function dailyAt(series, date) {
  const want = normalizeHistoryDate(date);
  if (!want || !Array.isArray(series)) return null;
  for (const row of series) {
    if (normalizeHistoryDate(row?.date) === want) return row;
  }
  return null;
}

/** آیا این ردیفِ روزانه اصلاً قیمتی دارد؟ روزِ بی‌معامله، ردیفِ بی‌قیمت است. */
const hasPrice = (row) => !!row && (num(row.close, 0) > 0 || num(row.last, 0) > 0);

/**
 * پرکردنِ میدان‌های قیمتیِ یک سمت (کال یا پوت) از ردیفِ روزانهٔ همان روز.
 *
 * `pClosing` و `pDrCotVal` همان نام‌هایی‌اند که `sideQuote` می‌خواند، پس
 * هیچ قراردادِ تازه‌ای ساخته نمی‌شود و اگر روزی شکلِ زنجیره عوض شود،
 * این هم با همان یک تغییر درست می‌ماند.
 */
function fillSide(out, sfx, row) {
  if (!hasPrice(row)) return false;
  out[`pDrCotVal_${sfx}`] = num(row.last, 0) || num(row.close, 0);
  out[`pClosing_${sfx}`] = num(row.close, 0) || num(row.last, 0);
  out[`priceYesterday_${sfx}`] = num(row.yday, 0);
  out[`qTotTran5J_${sfx}`] = num(row.vol, 0);
  out[`zTotTran_${sfx}`] = num(row.trades, 0);
  out[`qTotCap_${sfx}`] = num(row.value, 0);
  return true;
}

/**
 * ردیف‌های هویتِ قرارداد را با قیمتِ همان روز پر می‌کند.
 *
 * `dailyByIns` نگاشتِ `کد ابزار → آرایهٔ روزانه` است — همان چیزی که
 * `/api/dailies` می‌دهد. خروجی همان شکلِ ردیفِ دیده‌بان است که
 * `buildChain` می‌خواند، به‌علاوهٔ شمارشِ صادقانهٔ اینکه چه چیزی پر شد و
 * چه چیزی نه.
 */
export function priceHistoryRows(rows = [], dailyByIns = {}, date = 0) {
  const want = normalizeHistoryDate(date);
  const seriesOf = (ins) => {
    const box = dailyByIns?.[String(ins ?? '')];
    return Array.isArray(box) ? box : (box?.rows || []);
  };
  const out = [];
  const missingLegs = new Set();
  const missingBases = new Set();
  let legsPriced = 0, legsTotal = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const next = { ...row, historyDate: want };
    const uaRow = dailyAt(seriesOf(row.uaInsCode), want);
    if (hasPrice(uaRow)) {
      next.pDrCotVal_UA = num(uaRow.last, 0) || num(uaRow.close, 0);
      next.pClosing_UA = num(uaRow.close, 0) || num(uaRow.last, 0);
      next.priceYesterday_UA = num(uaRow.yday, 0);
      next.qTotTran5J_UA = num(uaRow.vol, 0);
      next.zTotTran_UA = num(uaRow.trades, 0);
      next.qTotCap_UA = num(uaRow.value, 0);
      next.__uaLow = num(uaRow.low, 0);
      next.__uaHigh = num(uaRow.high, 0);
    } else if (row.uaInsCode) missingBases.add(String(row.uaInsCode));
    for (const sfx of ['C', 'P']) {
      const ins = String(row[`insCode_${sfx}`] ?? '');
      if (!ins) continue;
      legsTotal += 1;
      const dayRow = dailyAt(seriesOf(ins), want);
      if (fillSide(next, sfx, dayRow)) {
        legsPriced += 1;
        next[`__low_${sfx}`] = num(dayRow.low, 0);
        next[`__high_${sfx}`] = num(dayRow.high, 0);
      } else missingLegs.add(ins);
    }
    out.push(next);
  }
  return {
    rows: out, date: want,
    legsPriced, legsTotal, legsMissing: missingLegs.size,
    basesMissing: missingBases.size,
    missingLegIns: [...missingLegs], missingBaseIns: [...missingBases],
  };
}

/**
 * زنجیرهٔ همان روز، آمادهٔ `scan()`.
 *
 * کف و سقفِ روز بعد از ساختِ زنجیره نشانده می‌شوند، نه پیش از آن:
 * `sideQuote` آن دو را عمداً صفر می‌گذارد چون در رصدِ زنده مرحلهٔ دو
 * پرشان می‌کند. اینجا مرحلهٔ دومی در کار نیست و همان ردیفِ روزانه هر دو
 * را دارد — پس مبنای «کمترین/بیشترین قیمت روز» در حالت تاریخی واقعاً
 * کار می‌کند، برخلافِ دفتر سفارش که هیچ منبعی ندارد.
 */
export function buildHistoryChain(rows = [], dailyByIns = {}, date = 0) {
  const priced = priceHistoryRows(rows, dailyByIns, date);
  const chain = buildChain(priced.rows);
  const lowHigh = new Map();
  for (const row of priced.rows) {
    for (const sfx of ['C', 'P']) {
      const ins = String(row[`insCode_${sfx}`] ?? '');
      if (ins) lowHigh.set(ins, [num(row[`__low_${sfx}`], 0), num(row[`__high_${sfx}`], 0)]);
    }
    const ua = String(row.uaInsCode ?? '');
    if (ua) lowHigh.set(ua, [num(row.__uaLow, 0), num(row.__uaHigh, 0)]);
  }
  let uaPriced = 0;
  for (const ua of chain.values()) {
    const range = lowHigh.get(String(ua.ins));
    if (range) { ua.low = range[0]; ua.high = range[1]; }
    if (num(ua.last, 0) > 0 || num(ua.close, 0) > 0) uaPriced += 1;
    for (const expiry of ua.expiryList || []) {
      for (const strike of expiry.strikeList || []) {
        for (const quote of [strike.call, strike.put]) {
          const own = lowHigh.get(String(quote.ins));
          if (own) { quote.low = own[0]; quote.high = own[1]; }
          // دفترِ گذشته وجود ندارد، و «عمق گرفته شد» هرگز ادعا نمی‌شود.
          quote.book = null;
          quote.depth = false;
        }
      }
    }
  }
  return { chain, ...priced, uaTotal: chain.size, uaPriced };
}

/** جملهٔ صداقت — کاربر باید بداند این جدول از چه چیزی ساخته شد. */
export function historyChainNote(built, basis) {
  const fa = (value) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (!built || !built.legsTotal) return 'برای این تاریخ هیچ قراردادی پیدا نشد.';
  const label = HISTORY_CHAIN_BASES.find(([key]) => key === historyBasis(basis))?.[1] || 'قیمت پایانی';
  const parts = [`${fa(built.legsPriced)} از ${fa(built.legsTotal)} پا قیمتِ همان روز را داشت`];
  if (built.basesMissing) parts.push(`${fa(built.basesMissing)} نماد پایه آن روز قیمت ندارد، پس ترکیب‌هایشان ساخته نمی‌شود`);
  parts.push(`مبنا: ${label}`);
  return `${parts.join(' · ')}. دفتر سفارشِ گذشته وجود ندارد، پس این اعداد مرجع‌اند و ادعای اجرا ندارند.`;
}

/**
 * آیا این ردیف از رصدِ تاریخی آمده؟
 *
 * ═══ چرا لازم شد ═══
 *
 * گزارش صاحب پروژه: «جزئیات ردیف تاریخی با دفتر سفارش امروز مخلوط است.»
 *
 * خودِ جدول درست بود — ردیف تاریخی «غیرقابل اجرا» می‌ماند و مبنای BOOK
 * ندارد. ولی پانل جزئیات همان ردیف «میانه»، «اسپرد» و «عمق» نشان می‌داد.
 * آن اعداد از `underlyingQuote` می‌آیند که وقتی دفتر ندارد، `bid` و
 * `ask` را برابرِ قیمت می‌گذارد و پرچمِ `assumedDepth` می‌زند — فرضی که
 * در رصدِ زنده مرحلهٔ دو اصلاحش می‌کند، ولی در گذشته مرحلهٔ دومی نیست.
 * نتیجه‌اش «اسپرد ۰٪» بود: ادعای یک بازارِ دوطرفهٔ کامل، برای روزی که
 * دفترش اصلاً وجود ندارد.
 *
 * پس مصرف‌کننده باید بتواند ردیفِ تاریخی را بشناسد و خانوادهٔ دفتر را
 * اصلاً نکشد. `historyDate` را `runHistoryScan` روی هر ردیف می‌گذارد.
 */
export const isHistoricalRow = (row) => Number(row?.historyDate) > 0;
