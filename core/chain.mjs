// ساخت زنجیره اختیار از عکس لحظه‌ای دیده‌بان.
//
// دیده‌بان با یک درخواست کل بازار را می‌دهد و هر رکوردش یک کال و یک پوت با
// قیمت اعمال و سررسید مشترک است. کل غربال مرحله یک روی همین می‌نشیند و
// هیچ درخواست اضافه‌ای نمی‌خورد.
//
//   پایه → سررسید → قیمت اعمال → { کال , پوت }
//
// مظنه‌ای که اینجا ساخته می‌شود فقط سطح اول دارد. عمق پنج سطحی و کمترین و
// بیشترین قیمت روز، مرحله دو است و فقط برای کاندیداهای برتر گرفته می‌شود.

import { num } from './num.mjs';
import { impliedVol } from './bs.mjs';

const n = (x) => num(x, 0);

/**
 * اندازه قرارداد یک پا.
 *
 * اولویت با مشخصات خودِ قرارداد است. اگر تابلو ندهد، پیش‌فرض اعلامی کاربر
 * می‌نشیند ولی `assumed` بالا می‌رود تا ردیف نشان‌دار شود — چون اندازه در
 * هر عدد پولی ضرب می‌شود و «فرض کردم ۱۰۰۰ است» با «۱۰۰۰ است» یکی نیست.
 */
export function legContractSize(specSize, declared) {
  const spec = n(specSize);
  if (spec > 0) return { size: spec, assumed: false };
  const dec = n(declared);
  return { size: dec > 0 ? dec : 0, assumed: true };
}

/**
 * اندازه قرارداد مشترک پاهای اختیار یک ترکیب.
 *
 * پای سهم پایه، تعداد سهمش باید با اندازه قراردادی که پوشش می‌دهد بخواند —
 * نه با اندازه یک قرارداد دلخواه دیگر همان پایه. اگر پاهای اختیار یک ترکیب
 * روی دو اندازه متفاوت باشند (سری‌ای که تعدیل شده کنار سری‌ای که نشده)،
 * هیچ عدد واحدی درست نیست؛ آن ترکیب نشان‌دار می‌شود.
 */
export function comboContractSize(sizes, declared) {
  const seen = [...new Set(sizes.map((x) => n(x)).filter((x) => x > 0))];
  if (seen.length === 1) return { size: seen[0], assumed: false, mixed: false };
  if (seen.length > 1) return { size: Math.max(...seen), assumed: false, mixed: true };
  const dec = n(declared);
  return { size: dec > 0 ? dec : 0, assumed: true, mixed: false };
}

/**
 * سررسیدهایی که سقف موقعیت بازشان پر است.
 *
 * وقتی سقف یک سررسید پر می‌شود، اخذ موقعیت فزاینده تازه ممکن نیست و فقط
 * می‌شود موقعیت قبلی را آفست کرد. پیشنهاد استراتژی روی چنین سررسیدی، عددی
 * است که کاربر نمی‌تواند اجرایش کند؛ پس اصلاً ساخته نمی‌شود. این وضعیت از
 * تابلو خوانده نمی‌شود — کارگزار اعلامش می‌کند — پس ورودی دستی است.
 *
 * قالب: «شناسه نماد پایه:تاریخ سررسید»، جدا شده با ویرگول.
 */
export function blockedExpirySet(text = '') {
  const out = new Set();
  for (const part of String(text ?? '').split(',')) {
    const at = part.indexOf(':');
    if (at < 1) continue;
    const ins = part.slice(0, at).trim(), endDate = part.slice(at + 1).trim();
    if (ins && endDate) out.add(`${ins}:${endDate}`);
  }
  return out;
}

export const expiryBlocked = (set, uaIns, endDate) => set.has(`${uaIns}:${endDate}`);

/**
 * همان دارایی پایه، بدون سررسیدهایی که سقف موقعیتشان پر است.
 *
 * چرا تحلیل تاریخی هم باید همین را رعایت کند: سقف پر یعنی امروز نمی‌شود
 * روی آن سررسید موقعیت فزاینده تازه گرفت. عددی که از بازپخش گذشته همان
 * سررسید درمی‌آید، تصمیمی را تغذیه می‌کند که اجرایش ممکن نیست — پس
 * کنار گذاشتنش تصمیم کاربر است، نه استنتاج از داده. به همین دلیل هم
 * وابسته به بازه تاریخی نیست: قید، امروزِ کاربر است نه گذشته بازار.
 */
export function withoutBlockedExpiries(ua, blocked) {
  if (!ua || !blocked?.size) return ua;
  const kept = (ua.expiryList || []).filter((ex) => !expiryBlocked(blocked, ua.ins, ex.endDate));
  if (kept.length === (ua.expiryList || []).length) return ua;
  return { ...ua, expiryList: kept };
}

/** نزدیک‌ترین قیمت اعمال به قیمت پایه، در یک سررسید. */
function nearestStrike(ex, spot) {
  let best = null, bestDiff = Infinity;
  for (const row of ex.strikeList) {
    const diff = Math.abs(row.strike - spot);
    if (diff < bestDiff) { bestDiff = diff; best = row; }
  }
  return best;
}

/**
 * تلاطم ضمنی نزدیک‌ترین قیمت اعمال، نزدیک‌ترین سررسید — یک نگاه کلی برای
 * فهرست نمادها، نه ورودی محاسبه اجرایی. قیمت پایانی مبناست چون بیرون از
 * ساعت بازار هم موجود است؛ تقاضا/عرضه نیست چون آن‌ها فقط داخل بازار زنده‌اند.
 */
function atmIv(ua, rFree, divYield, yearDays = 365) {
  const spot = ua.last || ua.close;
  const ex = ua.expiryList[0];
  if (!(spot > 0) || !ex || !(ex.days > 0)) return NaN;
  const row = nearestStrike(ex, spot);
  if (!row) return NaN;
  const T = ex.days / yearDays;
  for (const q of [row.call, row.put]) {
    const mkt = q.close || q.last;
    if (mkt > 0) {
      const iv = impliedVol(q.kind, mkt, spot, row.strike, T, rFree, divYield, {});
      if (Number.isFinite(iv)) return iv;
    }
  }
  return NaN;
}

/** نسبت موقعیت باز پوت به کال، روی کل زنجیره — سنجه سنتی احساس بازار. */
function pcOpenInterestRatio(ua) {
  let callOi = 0, putOi = 0;
  for (const ex of ua.expiryList) {
    for (const row of ex.strikeList) { callOi += row.call.oi; putOi += row.put.oi; }
  }
  return callOi > 0 ? putOi / callOi : NaN;
}

// سنتینل «عمق نامعلوم». متناهی است چون num هر مقدار نامتناهی را صفر می‌کند،
// و به‌اندازه‌ای بزرگ که هیچ‌وقت قید مقیدکننده نشود.
export const UNKNOWN_DEPTH = 1e12;

/** مظنه یک سمت قرارداد، از رکورد دیده‌بان. */
function sideQuote(r, sfx) {
  const ins = String(r[`insCode_${sfx}`] ?? '');
  const rawName = String(r[`lVal18AFC_${sfx}`] ?? '').trim();
  const bid = n(r[`pMeDem_${sfx}`]);
  const ask = n(r[`pMeOf_${sfx}`]);
  const last = n(r[`pDrCotVal_${sfx}`]);
  const close = n(r[`pClosing_${sfx}`]) || last || bid;
  return {
    ins,
    name: rawName && rawName !== ins ? rawName : `قرارداد ${sfx === 'C' ? 'اختیار خرید' : 'اختیار فروش'}`,
    kind: sfx === 'C' ? 'call' : 'put',
    bid, bidQty: n(r[`qTitMeDem_${sfx}`]),
    ask, askQty: n(r[`qTitMeOf_${sfx}`]),
    last, close, yday: n(r[`priceYesterday_${sfx}`]),
    low: 0, high: 0,               // مرحله دو پر می‌کند
    oi: n(r[`oP_${sfx}`]), oiYday: n(r[`yesterdayOP_${sfx}`]),
    vol: n(r[`qTotTran5J_${sfx}`]), trades: n(r[`zTotTran_${sfx}`]),
    value: n(r[`qTotCap_${sfx}`]),
    book: null, state: 'A', staleSec: 0,
    depth: false,                  // آیا عمق کامل گرفته شده
  };
}

/**
 * زنجیره کامل. کلید هر پایه، کد نماد پایه است تا با تغییر نام نماد نشکند.
 */
export function buildChain(rows) {
  const byUa = new Map();

  for (const r of rows || []) {
    const uaIns = String(r.uaInsCode ?? '');
    if (!uaIns) continue;
    const strike = n(r.strikePrice);
    const days = Math.round(n(r.remainedDay));
    if (!(strike > 0)) continue;

    let ua = byUa.get(uaIns);
    if (!ua) {
      const rawUaName = String(r.lval30_UA ?? '').trim();
      ua = {
        ins: uaIns,
        name: rawUaName && rawUaName !== uaIns ? rawUaName : 'دارایی پایه بدون نام',
        last: n(r.pDrCotVal_UA), close: n(r.pClosing_UA), yday: n(r.priceYesterday_UA),
        vol: n(r.qTotTran5J_UA), trades: n(r.zTotTran_UA), value: n(r.qTotCap_UA),
        low: 0, high: 0, book: null, state: 'A', staleSec: 0, depth: false,
        expiries: new Map(),
        contracts: 0,
      };
      byUa.set(uaIns, ua);
    }
    ua.last = ua.last || n(r.pDrCotVal_UA);
    ua.close = ua.close || n(r.pClosing_UA);
    ua.vol = ua.vol || n(r.qTotTran5J_UA);
    ua.trades = ua.trades || n(r.zTotTran_UA);
    ua.value = ua.value || n(r.qTotCap_UA);

    let ex = ua.expiries.get(days);
    if (!ex) {
      ex = { days, endDate: n(r.endDate), strikes: new Map() };
      ua.expiries.set(days, ex);
    }

    // اندازه قرارداد از مشخصات خودِ همان قرارداد می‌آید، نه از یک عدد
    // سراسری. پس از افزایش سرمایه، اندازه قرارداد و قیمت اعمال یک سری
    // تعدیل می‌شوند و ممکن است دو سررسید یک پایه، دو اندازه متفاوت داشته
    // باشند. اندازه در هر ستون پولی ضرب می‌شود، پس یک عدد فرضی اشتباه،
    // کل ردیف را به همان نسبت غلط می‌کند.
    //
    // اگر تابلو اندازه نداد، اینجا عددی ساخته نمی‌شود (قاعده ۲-۴): صفر
    // می‌ماند و پرچمش پایین است، تا لایه بالاتر که پیش‌فرض اعلامی کاربر را
    // دارد جایش بگذارد و ردیف را نشان‌دار کند.
    const specSize = n(r.contractSize);
    ex.strikes.set(strike, {
      strike,
      size: specSize > 0 ? specSize : 0,
      sizeFromSpec: specSize > 0,
      call: sideQuote(r, 'C'),
      put: sideQuote(r, 'P'),
    });
    ua.contracts += 2;
  }

  // مرتب‌سازی: سررسید صعودی، قیمت اعمال صعودی
  for (const ua of byUa.values()) {
    ua.expiryList = [...ua.expiries.values()].sort((a, b) => a.days - b.days);
    for (const ex of ua.expiryList) {
      ex.strikeList = [...ex.strikes.values()].sort((a, b) => a.strike - b.strike);
    }
  }
  return byUa;
}

/**
 * فهرست نماد پایه برای منوی انتخابی — انتخابی، نه تایپی. همان فهرست، تب
 * دیده‌بان زنجیره را هم پر می‌کند، پس نمای بازار (تلاطم ضمنی، نسبت پوت به
 * کال، نزدیک‌ترین سررسید) هم همین‌جاست، نه در یک تابع یا تب جدا.
 *
 * `opt.rFree`/`opt.divYield` برای تلاطم ضمنی؛ چون این فهرست جدا از تنظیمات
 * کاربر ساخته می‌شود (در ریسه اسکن، مستقل از هر تب)، اگر داده نشود پیش‌فرض
 * معقول همان پیش‌فرض `core/settings.mjs` است — عددی نمایشی، نه اجرایی.
 */
/**
 * تجمیع مظنه‌های یک دارایی پایه در یک گذر.
 *
 * پیش از این هر سنجه یک `reduce` جدا روی همان درخت داشت — سه گذر برای سه
 * عدد. با ستون‌های بیشتر این می‌شد ده گذر. یک گذر، همه را می‌سازد.
 *
 * تفکیک کال و پوت جداست چون نسبت پوت به کال روی حجم، چیزی می‌گوید که همان
 * نسبت روی موقعیت باز نمی‌گوید: یکی امروز را می‌گوید، دیگری انباشتهٔ تعهد را.
 *
 * فاصلهٔ مظنه فقط از قراردادهای دوطرفه گرفته می‌شود و میانه است نه میانگین —
 * یک قرارداد بی‌رمق با فاصلهٔ ۳۰۰ درصد، میانگین را بی‌معنی می‌کند.
 */
function rollupQuotes(u) {
  let contracts = 0, quoted = 0, callVol = 0, putVol = 0, callOi = 0, putOi = 0;
  let value = 0, trades = 0;
  const strikes = new Set();
  const spreads = [];
  for (const ex of u.expiryList) {
    for (const st of ex.strikeList) {
      strikes.add(st.strike);
      for (const [q, isCall] of [[st.call, true], [st.put, false]]) {
        contracts += 1;
        if (q.bid > 0 || q.ask > 0) quoted += 1;
        if (isCall) { callVol += q.vol; callOi += q.oi; } else { putVol += q.vol; putOi += q.oi; }
        value += q.value; trades += q.trades || 0;
        if (q.bid > 0 && q.ask > 0) {
          const mid = (q.bid + q.ask) / 2;
          if (mid > 0) spreads.push(((q.ask - q.bid) / mid) * 100);
        }
      }
    }
  }
  spreads.sort((a, b) => a - b);
  const mid = spreads.length ? (spreads.length % 2
    ? spreads[(spreads.length - 1) / 2]
    : (spreads[spreads.length / 2 - 1] + spreads[spreads.length / 2]) / 2) : NaN;
  const days = u.expiryList.map((ex) => ex.days).filter(Number.isFinite);
  return {
    contracts, quoted, strikes: strikes.size,
    volume: callVol + putVol, oi: callOi + putOi,
    callVol, putVol, callOi, putOi,
    pcVolRatio: callVol > 0 ? putVol / callVol : NaN,
    value, trades,
    spreadMedPct: spreads.length ? mid : NaN,
    twoSided: spreads.length,
    farDays: days.length ? Math.max(...days) : null,
  };
}

export function underlyingList(chain, opt = {}) {
  const rFree = Number.isFinite(opt.rFree) ? opt.rFree : 0.30;
  const divYield = Number.isFinite(opt.divYield) ? opt.divYield : 0;
  const yearDays = Number.isFinite(opt.yearDays) ? opt.yearDays : 365;
  return [...chain.values()]
    .map((u) => ({
      ins: u.ins, name: u.name, last: u.last || u.close, close: u.close, yday: u.yday,
      changePct: (u.last || u.close) > 0 && u.yday > 0 ? (((u.last || u.close) / u.yday) - 1) * 100 : NaN,
      expiries: u.expiryList.length,
      nearestDays: u.expiryList[0]?.days ?? null,
      // گردش خودِ نماد پایه، جدا از گردش زنجیره اختیارش. تا امروز خوانده
      // می‌شد ولی به هیچ ستونی نمی‌رسید، و ستون «ارزش معاملات» جدول در
      // واقع مجموع زنجیره بود — دو عدد کاملاً متفاوت با یک نام.
      uaValue: u.value, uaVolume: u.vol, uaTrades: u.trades,
      ...rollupQuotes(u),
      pcRatio: pcOpenInterestRatio(u),
      atmIv: atmIv(u, rFree, divYield, yearDays),
    }))
    .sort((a, b) => b.volume - a.volume || b.contracts - a.contracts);
}

/** مظنه پایه، به شکل همان قرارداد مظنه اختیار، تا موتور یک مسیر داشته باشد. */
export function underlyingQuote(ua) {
  const p = ua.last || ua.close;
  // دیده‌بان اختیار، دفتر سفارش نماد پایه را نمی‌دهد. پس در مرحله یک، عمق
  // پایه «نامعلوم» است نه «صفر». اگر صفر بگیریم هر ترکیب دارای سهم می‌افتد.
  // مرحله دو دفتر واقعی را می‌نشاند و همین ردیف‌ها دوباره حساب می‌شوند.
  const unknown = !ua.book?.length;
  return {
    ins: ua.ins, name: ua.name, kind: 'underlying',
    bid: ua.book?.length ? ua.book[0].bid : p,
    bidQty: ua.book?.length ? ua.book[0].bidQty : UNKNOWN_DEPTH,
    ask: ua.book?.length ? ua.book[0].ask : p,
    askQty: ua.book?.length ? ua.book[0].askQty : UNKNOWN_DEPTH,
    assumedDepth: unknown,
    last: ua.last, close: ua.close, low: ua.low, high: ua.high,
    book: ua.book, state: ua.state, staleSec: ua.staleSec, depth: !!ua.depth,
    oi: 0, vol: 0,
  };
}

/** آمار کل بازار اختیار، برای نوار شاخص تب دیده‌بان. */
export function chainStats(chain) {
  let contracts = 0, quoted = 0, vol = 0, oi = 0, value = 0, expiries = new Set();
  let callOi = 0, putOi = 0;
  for (const ua of chain.values()) {
    for (const ex of ua.expiryList) {
      expiries.add(ex.days);
      for (const s of ex.strikeList) {
        for (const [q, isCall] of [[s.call, true], [s.put, false]]) {
          contracts += 1;
          if (q.bid > 0 || q.ask > 0) quoted += 1;
          vol += q.vol; oi += q.oi; value += q.value;
          if (isCall) callOi += q.oi; else putOi += q.oi;
        }
      }
    }
  }
  return {
    underlyings: chain.size, contracts, quoted, vol, oi, value, expiries: expiries.size,
    callOi, putOi,
    // کالِ صفر یعنی نسبت تعریف‌نشده، نه بی‌نهایت و نه صفر.
    pcOi: callOi > 0 ? putOi / callOi : NaN,
  };
}
