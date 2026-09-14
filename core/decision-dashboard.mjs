// تجمیع خالص داده‌های داشبورد تصمیم‌گیری.
//
// ورودی همان عکس خام دیده‌بان اختیار است. خروجی چهار سطح بازار، پایه،
// سررسید و قرارداد را نگه می‌دارد تا رابط برای عوض‌کردن دامنه مجبور به
// حدس‌زدن یا درخواست شبکه تازه نباشد.

import { buildChain, underlyingList } from './chain.mjs';
import { liveQuoteIvSet, IV_WHY_LABEL } from './live-market.mjs';
import { greeksFromIvPct } from './leg-iv.mjs';
import { bsPrice } from './bs.mjs';

export function pctVsYesterday(last, yesterday) {
  const now = Number(last), prior = Number(yesterday);
  return now > 0 && prior > 0 ? ((now / prior) - 1) * 100 : NaN;
}

const emptyAggregate = (seed = {}) => ({
  ...seed, contracts: 0, tradedContracts: 0, positive: 0, negative: 0, unchanged: 0,
  volume: 0, value: 0, trades: 0, oi: 0, oiYday: 0, _oiYdayGap: false,
  callVolume: 0, putVolume: 0, callValue: 0, putValue: 0,
  callTrades: 0, putTrades: 0,
  callOi: 0, putOi: 0, twoSided: 0, changePct: NaN, ivPct: NaN,
  _changeWeighted: 0, _changeWeight: 0, _ivWeighted: 0, _ivWeight: 0, _spreads: [],
});

function addContract(target, row) {
  target.contracts += 1;
  const traded = row.volume > 0 || row.trades > 0 || row.value > 0;
  if (traded) target.tradedContracts += 1;
  target.volume += row.volume; target.value += row.value; target.trades += row.trades;
  target.oi += row.oi;
  // همان قاعده رده پایین: اگر موقعیت باز دیروزِ یک قرارداد نامعلوم باشد،
  // تغییرِ کلِ گروه نامعلوم می‌شود نه ناقص.
  if (Number.isFinite(row.oiYday)) target.oiYday += row.oiYday; else target._oiYdayGap = true;
  if (row.kind === 'call') {
    target.callVolume += row.volume; target.callValue += row.value;
    target.callTrades += row.trades; target.callOi += row.oi;
  } else {
    target.putVolume += row.volume; target.putValue += row.value;
    target.putTrades += row.trades; target.putOi += row.oi;
  }
  if (Number.isFinite(row.changePct)) {
    if (row.changePct > 0) target.positive += 1;
    else if (row.changePct < 0) target.negative += 1;
    else target.unchanged += 1;
    const weight = row.value > 0 ? row.value : 1;
    target._changeWeighted += row.changePct * weight; target._changeWeight += weight;
  }
  if (Number.isFinite(row.ivPct)) {
    const weight = row.value > 0 ? row.value : 1;
    target._ivWeighted += row.ivPct * weight; target._ivWeight += weight;
  }
  if (Number.isFinite(row.spreadPct)) { target._spreads.push(row.spreadPct); target.twoSided += 1; }
}

function finishAggregate(row) {
  const spreads = row._spreads.sort((a, b) => a - b);
  const middle = Math.floor(spreads.length / 2);
  const spreadPct = spreads.length
    ? (spreads.length % 2 ? spreads[middle] : (spreads[middle - 1] + spreads[middle]) / 2)
    : NaN;
  const oiYday = row._oiYdayGap ? NaN : row.oiYday;
  const directionKnown = row.positive + row.negative + row.unchanged;
  const pct = (part, total) => total > 0 ? (part / total) * 100 : NaN;
  const out = { ...row,
    oiYday,
    // تا امروز `oi` و `oiYday` جمع می‌شدند ولی تفاضلشان هیچ‌جا ساخته نمی‌شد،
    // پس ستون «تغییر موقعیت باز» در هر نمای تجمیعی تهی بود.
    oiChange: Number.isFinite(oiYday) ? row.oi - oiYday : NaN,
    oiChangePct: Number.isFinite(oiYday) && oiYday > 0 ? ((row.oi / oiYday) - 1) * 100 : NaN,
    changePct: row._changeWeight > 0 ? row._changeWeighted / row._changeWeight : NaN,
    ivPct: row._ivWeight > 0 ? row._ivWeighted / row._ivWeight : NaN,
    spreadPct,
    putCallVolume: row.callVolume > 0 ? row.putVolume / row.callVolume : NaN,
    putCallOi: row.callOi > 0 ? row.putOi / row.callOi : NaN,
    tradedPct: pct(row.tradedContracts, row.contracts),
    positivePct: pct(row.positive, directionKnown),
    negativePct: pct(row.negative, directionKnown),
    unchangedPct: pct(row.unchanged, directionKnown),
    twoSidedPct: pct(row.twoSided, row.contracts),
    callVolumePct: pct(row.callVolume, row.volume), putVolumePct: pct(row.putVolume, row.volume),
    callValuePct: pct(row.callValue, row.value), putValuePct: pct(row.putValue, row.value),
    callOiPct: pct(row.callOi, row.oi), putOiPct: pct(row.putOi, row.oi),
  };
  delete out._changeWeighted; delete out._changeWeight; delete out._ivWeighted;
  delete out._ivWeight; delete out._spreads; delete out._oiYdayGap;
  return out;
}

/** یک عکس فشرده و قابل سریال‌سازی برای همه دامنه‌های داشبورد. */
export function decisionDashboardSnapshot(rows, settings = {}) {
  const chain = buildChain(rows || []);
  const underlyings = underlyingList(chain, {
    rFree: settings.rFree, divYield: settings.divYield, yearDays: settings.dayCountYear,
  });
  const contracts = [], expiryMap = new Map(), marketExpiryMap = new Map();

  for (const ua of chain.values()) {
    const spot = Number(ua.last || ua.close);
    for (const expiry of ua.expiryList) {
      const expiryKey = `${ua.ins}:${expiry.endDate}`;
      const expiryAgg = emptyAggregate({
        key: expiryKey, uaIns: String(ua.ins), uaName: ua.name,
        endDate: expiry.endDate, days: expiry.days,
      });
      let marketAgg = marketExpiryMap.get(String(expiry.endDate));
      if (!marketAgg) {
        marketAgg = emptyAggregate({ key: String(expiry.endDate), endDate: expiry.endDate, days: expiry.days, underlyings: new Set() });
        marketExpiryMap.set(String(expiry.endDate), marketAgg);
      }
      marketAgg.underlyings.add(String(ua.ins));
      for (const strike of expiry.strikeList) {
        for (const quote of [strike.call, strike.put]) {
          if (!quote.ins) continue;
          const last = Number(quote.last || quote.close);
          const mid = quote.bid > 0 && quote.ask > 0 ? (quote.bid + quote.ask) / 2 : NaN;
          const intrinsic = quote.kind === 'put'
            ? Math.max(0, Number(strike.strike) - spot)
            : Math.max(0, spot - Number(strike.strike));
          const timeValue = Number.isFinite(last) ? last - intrinsic : NaN;
          const pctSpot = (value) => spot > 0 && Number.isFinite(value) ? (value / spot) * 100 : NaN;
          const oiYday = Number(quote.oiYday);
          const contract = {
            ins: String(quote.ins), name: quote.name, kind: quote.kind,
            uaIns: String(ua.ins), uaName: ua.name, endDate: expiry.endDate, days: expiry.days,
            strike: strike.strike, size: strike.size, spot,
            last, tradeLast: Number(quote.last) > 0 ? Number(quote.last) : NaN,
            close: Number(quote.close), yday: quote.yday,
            changePct: pctVsYesterday(last, quote.yday), bid: quote.bid, ask: quote.ask,
            closeChangePct: pctVsYesterday(quote.close, quote.yday),
            bidQty: quote.bidQty, askQty: quote.askQty, mid,
            spreadPct: mid > 0 ? ((quote.ask - quote.bid) / mid) * 100 : NaN,
            premiumPctSpot: pctSpot(last), intrinsic, timeValue,
            intrinsicPctSpot: pctSpot(intrinsic), timeValuePctSpot: pctSpot(timeValue),
            moneynessPct: spot > 0 ? ((Number(strike.strike) / spot) - 1) * 100 : NaN,
            volume: quote.vol, trades: quote.trades, value: quote.value,
            oi: quote.oi, oiYday: quote.oiYday,
            oiChange: Number.isFinite(oiYday) ? Number(quote.oi) - oiYday : NaN,
            oiChangePct: Number.isFinite(oiYday) && oiYday > 0
              ? ((Number(quote.oi) / oiYday) - 1) * 100 : NaN,
            // سه تلاطم و علتش، از یک مسیر: مشاهده‌ای (آخرین معامله) و
            // اجرایی (مظنه). مظنه با قیمت پایه هم‌زمان است، آخرین معامله
            // لزوماً نه — و همین تفاوت، علتِ بیشترِ ستون‌های خالی بود.
            ...liveQuoteIvSet({ ...quote, strike: strike.strike, days: expiry.days }, spot, settings),
          };
          contracts.push(contract); addContract(expiryAgg, contract); addContract(marketAgg, contract);
        }
      }
      expiryMap.set(expiryKey, finishAggregate(expiryAgg));
    }
  }

  const expiries = [...expiryMap.values()].sort((a, b) => b.value - a.value || a.days - b.days);
  const marketExpiries = [...marketExpiryMap.values()].map((item) => {
    const count = item.underlyings.size; item.underlyings = count;
    return finishAggregate(item);
  }).sort((a, b) => b.value - a.value || a.days - b.days);
  contracts.sort((a, b) => b.value - a.value || b.volume - a.volume || a.name.localeCompare(b.name, 'fa'));
  return { underlyings, expiries, marketExpiries, contracts };
}

/** ردیف‌های متناظر با انتخاب کاربر، بدون پرکردن داده گمشده. */
export function dashboardScope(snapshot, scope = {}) {
  const level = ['market', 'underlying', 'expiry', 'contract'].includes(scope.level) ? scope.level : 'market';
  const uaIns = String(scope.uaIns || ''), endDate = String(scope.endDate || ''), contractIns = String(scope.contractIns || '');
  let contracts = snapshot?.contracts || [];
  if (level !== 'market') contracts = contracts.filter((row) => String(row.uaIns) === uaIns);
  if (level === 'expiry' || level === 'contract') contracts = contracts.filter((row) => String(row.endDate) === endDate);
  if (level === 'contract') contracts = contracts.filter((row) => String(row.ins) === contractIns);
  const uaKeys = new Set(contracts.map((row) => String(row.uaIns)));
  const expiryKeys = new Set(contracts.map((row) => `${row.uaIns}:${row.endDate}`));
  return {
    level, contracts,
    underlyings: level === 'market' ? (snapshot?.underlyings || []) : (snapshot?.underlyings || []).filter((row) => uaKeys.has(String(row.ins))),
    expiries: level === 'market' ? (snapshot?.marketExpiries || []) : (snapshot?.expiries || []).filter((row) => expiryKeys.has(row.key)),
  };
}

// ————————————————————————————————————————————————————————————————
// نقشهٔ بازار — یک ورودی ساده برای رفتن از کل بازار تا یک قرارداد

// رنگ خانه همیشه جهتِ آخرین معاملهٔ نماد پایه را می‌گوید؛ اندازه اما سؤال
// کاربر است و می‌تواند بین گردش کال، پوت، کل اختیار، خودِ پایه و درصد تغییر
// عوض شود. جدا نگه‌داشتن این دو معنا مهم است: خانهٔ بزرگ لزوماً مثبت نیست.
// ————————————————————————————————————————————————————————————————

export const MARKET_MAP_METRICS = [
  { key: 'callValue', label: 'ارزش معاملات کال', format: 'money' },
  { key: 'putValue', label: 'ارزش معاملات پوت', format: 'money' },
  { key: 'value', label: 'جمع ارزش کال و پوت', format: 'money' },
  { key: 'uaValue', label: 'ارزش معاملات نماد پایه', format: 'money' },
  { key: 'volume', label: 'حجم معاملات اختیار', format: 'int' },
  { key: 'changePct', label: 'درصد آخرین معامله پایه', format: 'pct' },
  // ── خانه‌های هم‌اندازه ────────────────────────────────────────────
  //
  // خواستهٔ صاحب پروژه. نقشهٔ وزن‌دار یک سؤال را خوب جواب می‌دهد («پول
  // کجاست») و یک سؤال را اصلاً: «چه چیزهایی هست». با وزنِ ارزش، نمادِ
  // کم‌معامله به نواری یک‌پیکسلی تبدیل می‌شود که نه خوانده می‌شود نه
  // کلیک. در حالت هم‌اندازه، نقشه به یک شبکهٔ رنگیِ کامل تبدیل می‌شود که
  // فقط **جهت** را می‌گوید — و هر نماد به یک اندازه در دسترس است.
  { key: 'equal', label: 'همه هم‌اندازه', format: 'equal' },
];

/** حالتی که اندازه را از داده نمی‌گیرد؛ رنگ همچنان از تغییر واقعی می‌آید. */
export const EQUAL_MAP_METRIC = 'equal';

/** فیلتر نمایشی زنجیره؛ دادهٔ سمت پنهان حذف نمی‌شود و در universe می‌ماند. */
export function filterContractsBySide(rows = [], side = 'all') {
  return (rows || []).filter((row) => side === 'all' || row.kind === side);
}

const mapMetric = (key) => MARKET_MAP_METRICS.some((item) => item.key === key) ? key : 'value';

/**
 * ردیف‌های نقشه با وزن ترسیمی.
 *
 * مقدار صفر یا نامعلوم حذف نمی‌شود، چون خواستهٔ نقشه «همهٔ نمادهای پایه»
 * است. یک کف بسیار کوچک فقط برای قابل‌کلیک ماندن خانه می‌گذاریم؛ مقدار
 * واقعی جدا می‌ماند و در راهنما همان صفر/نامعلوم نمایش داده می‌شود.
 */
export function marketMapRows(snapshot = {}, metric = 'value') {
  const key = mapMetric(metric);
  if (key === EQUAL_MAP_METRIC) {
    // هیچ عددی ادعا نمی‌شود: `metricValue` نامعلوم می‌ماند تا راهنما
    // عددِ ساختگی نگوید، و وزن برای همه دقیقاً یک است.
    return (snapshot.underlyings || []).map((row) => ({ ...row, metric: key, metricValue: NaN, sizeValue: 1, mapWeight: 1 }));
  }
  const rows = (snapshot.underlyings || []).map((row) => {
    const raw = Number(row[key]);
    const metricValue = Number.isFinite(raw) ? raw : NaN;
    const sizeValue = key === 'changePct' ? Math.abs(metricValue) : Math.max(0, metricValue);
    return { ...row, metric: key, metricValue, sizeValue };
  });
  const max = Math.max(0, ...rows.map((row) => Number.isFinite(row.sizeValue) ? row.sizeValue : 0));
  const floor = max > 0 ? max * 0.002 : 1;
  return rows.map((row) => ({ ...row, mapWeight: row.sizeValue > 0 ? row.sizeValue : floor }));
}

/** جمع‌بندی بازار از همان عکس واحد؛ هیچ درخواست یا برآورد تازه‌ای ندارد. */
export function marketMapSummary(snapshot = {}) {
  const underlyings = snapshot.underlyings || [];
  const contracts = snapshot.contracts || [];
  const sum = (rows, key) => rows.reduce((total, row) => {
    const value = Number(row[key]);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
  const knownDirection = underlyings.filter((row) => Number.isFinite(Number(row.changePct)));
  return {
    underlyings: underlyings.length,
    baseTraded: underlyings.filter((row) => Number(row.uaVolume) > 0 || Number(row.uaTrades) > 0 || Number(row.uaValue) > 0).length,
    contracts: contracts.length,
    tradedContracts: contracts.filter((row) => Number(row.volume) > 0 || Number(row.trades) > 0 || Number(row.value) > 0).length,
    twoSided: contracts.filter((row) => Number(row.bid) > 0 && Number(row.ask) > 0).length,
    positiveBases: knownDirection.filter((row) => Number(row.changePct) > 0).length,
    negativeBases: knownDirection.filter((row) => Number(row.changePct) < 0).length,
    flatBases: knownDirection.filter((row) => Number(row.changePct) === 0).length,
    callValue: sum(underlyings, 'callValue'),
    putValue: sum(underlyings, 'putValue'),
    optionValue: sum(underlyings, 'value'),
    underlyingValue: sum(underlyings, 'uaValue'),
    optionVolume: sum(underlyings, 'volume'),
    openInterest: sum(underlyings, 'oi'),
  };
}

// ————————————————————————————————————————————————————————————————
// تابلوی اختیارهای پرمعامله
//
// خواسته کاربر: بخشی از داشبورد که اختیارهای پرمعامله را بدهد، با سنجه
// انتخابی کاربر (حجم، ارزش، تعداد معامله، موقعیت باز)، و برای هر سررسید
// میانگین وزنی سربه‌سر و فاصله‌اش از قیمت جاری.
//
// همان تعریف سربه‌سر که `core/open-view.mjs` دارد، ولی روی عکس لحظه‌ای:
//
//     کال   سربه‌سر = اعمال + پریمیوم
//     پوت   سربه‌سر = اعمال − پریمیوم
//
// وزن، همان سنجه انتخابی کاربر است نه همیشه ارزش. اگر کاربر «حجم» را
// انتخاب کند و وزنِ شاخص همچنان ارزش بماند، عددی که می‌بیند جواب سؤالی
// نیست که پرسیده.
// ————————————————————————————————————————————————————————————————

/** سنجه‌هایی که هم رتبه‌بندی می‌کنند هم وزن شاخص می‌شوند. */
export const BOARD_METRICS = ['value', 'volume', 'trades', 'oi'];

/** پریمیوم اجرایی هر قرارداد: آخرین معامله، وگرنه پایانی. بدون هیچ‌کدام، هیچ. */
const premiumOf = (row) => {
  const last = Number(row.last);
  return last > 0 ? last : NaN;
};

export function contractBreakeven(row) {
  const strike = Number(row.strike), premium = premiumOf(row);
  if (!(strike > 0) || !Number.isFinite(premium)) return NaN;
  return row.kind === 'put' ? strike - premium : strike + premium;
}

/**
 * فاصلهٔ قیمت جاری پایه تا سربه‌سرِ همان قرارداد — به ریال، از دید همان سمت.
 *
 * علامت مشترک نمی‌گیرد. کال وقتی به سربه‌سر می‌رسد که پایه **بالا** برود و
 * پوت وقتی **پایین** بیاید؛ اگر هر دو را با یک تفاضلِ خام بنویسیم، یکی از
 * دو سمت در ستون وارونه دیده می‌شود و خریدارِ پوت فکر می‌کند از سربه‌سر رد
 * شده در حالی که تازه دور شده است. پس در هر دو سمت، **مثبت یعنی هنوز
 * نرسیده‌ایم** و منفی یعنی قیمت جاری از سربه‌سر گذشته است.
 */
export function breakevenGap(row) {
  const breakeven = contractBreakeven(row), spot = Number(row.spot);
  if (!Number.isFinite(breakeven) || !(spot > 0)) return NaN;
  return row.kind === 'put' ? spot - breakeven : breakeven - spot;
}

/** همان فاصله، بر حسب درصدِ قیمت جاری پایه — تنها شکلی که بین دو نماد قابل مقایسه است. */
export function breakevenGapPct(row) {
  const gap = breakevenGap(row), spot = Number(row.spot);
  return Number.isFinite(gap) && spot > 0 ? (gap / spot) * 100 : NaN;
}

/**
 * تابلوی اختیارهای پرمعامله و شاخص سربه‌سر هر سررسید.
 *
 * `side` یکی از `both` / `call` / `put`. تفکیک، فقط فیلتر نیست: سربه‌سر کال و
 * پوت دو طرف مخالف‌اند و میانگین‌گیری از هر دو با هم، عددی می‌سازد که هیچ
 * قراردادی ندارد. پس در حالت `both` هم شاخص هر سمت جدا می‌ماند و فقط
 * رتبه‌بندی مشترک است.
 *
 * گروه‌بندی سررسید با کلید «پایه:سررسید» است، نه فقط سررسید: سربه‌سرِ وزنیِ
 * دو پایه با دو سطح قیمت کاملاً متفاوت، عددی می‌سازد که به هیچ‌کدام نمی‌خورد.
 * فاصله درصدی اما بین پایه‌ها قابل مقایسه است و در سطح بازار هم داده می‌شود.
 */
export function activeOptionsBoard(contracts = [], { metric = 'value', side = 'both', limit = 24 } = {}) {
  const key = BOARD_METRICS.includes(metric) ? metric : 'value';
  const rows = contracts
    .filter((row) => side === 'both' || row.kind === side)
    .map((row) => {
      const breakeven = contractBreakeven(row);
      const spot = Number(row.spot);
      return {
        ...row,
        breakeven,
        // فاصله از دید همان سمت خوانده می‌شود: کال باید بالا برود تا به
        // سربه‌سر برسد، پوت باید پایین بیاید. با یک علامت مشترک، دو سمت
        // در یک ستون وارونه دیده می‌شوند.
        breakevenGap: breakevenGap(row),
        breakevenGapPct: breakevenGapPct(row),
        moneynessPct: Number.isFinite(Number(row.strike)) && spot > 0
          ? ((Number(row.strike) / spot) - 1) * 100 : NaN,
        rank: Number(row[key]) || 0,
      };
    });
  const ranked = [...rows].sort((a, b) => b.rank - a.rank).slice(0, limit);

  const groups = new Map();
  for (const row of rows) {
    const id = `${row.uaIns}:${row.endDate}`;
    let group = groups.get(id);
    if (!group) {
      group = { key: id, uaIns: row.uaIns, uaName: row.uaName, endDate: row.endDate, days: row.days,
        spot: Number(row.spot), contracts: 0, weight: 0,
        call: { weight: 0, be: 0, gap: 0, strike: 0, premium: 0, count: 0 },
        put: { weight: 0, be: 0, gap: 0, strike: 0, premium: 0, count: 0 } };
      groups.set(id, group);
    }
    group.contracts += 1;
    const weight = Number(row[key]) || 0;
    group.weight += weight;
    const bucket = row.kind === 'put' ? group.put : group.call;
    if (weight > 0 && Number.isFinite(row.breakeven)) {
      bucket.weight += weight; bucket.be += row.breakeven * weight;
      bucket.gap += row.breakevenGapPct * weight;
      bucket.strike += Number(row.strike) * weight;
      bucket.premium += premiumOf(row) * weight;
      bucket.count += 1;
    }
  }
  const expiries = [...groups.values()].map((group) => {
    const mean = (bucket) => ({
      breakeven: bucket.weight > 0 ? bucket.be / bucket.weight : NaN,
      gapPct: bucket.weight > 0 ? bucket.gap / bucket.weight : NaN,
      strike: bucket.weight > 0 ? bucket.strike / bucket.weight : NaN,
      premium: bucket.weight > 0 ? bucket.premium / bucket.weight : NaN,
      count: bucket.count, weight: bucket.weight,
    });
    const call = mean(group.call), put = mean(group.put);
    return {
      key: group.key, uaIns: group.uaIns, uaName: group.uaName, endDate: group.endDate,
      days: group.days, spot: group.spot, contracts: group.contracts, weight: group.weight,
      callBreakeven: call.breakeven, callGapPct: call.gapPct, callCount: call.count, callWeight: call.weight,
      putBreakeven: put.breakeven, putGapPct: put.gapPct, putCount: put.count, putWeight: put.weight,
      callStrike: call.strike,
      callStrikeGapPct: Number.isFinite(call.strike) && group.spot > 0 ? ((call.strike / group.spot) - 1) * 100 : NaN,
      putStrike: put.strike,
      putStrikeGapPct: Number.isFinite(put.strike) && group.spot > 0 ? ((put.strike / group.spot) - 1) * 100 : NaN,
      callPremium: call.premium,
      callPremiumPct: Number.isFinite(call.premium) && group.spot > 0 ? (call.premium / group.spot) * 100 : NaN,
      putPremium: put.premium,
      putPremiumPct: Number.isFinite(put.premium) && group.spot > 0 ? (put.premium / group.spot) * 100 : NaN,
      callSharePct: group.weight > 0 ? (call.weight / group.weight) * 100 : NaN,
      putSharePct: group.weight > 0 ? (put.weight / group.weight) * 100 : NaN,
      // پهنای باند: از سربه‌سر پوت تا سربه‌سر کال. بازار انتظار دارد قیمت
      // تا پایان این سررسید بیرون از این بازه نرود — وگرنه یک سمت در سود
      // می‌رود.
      band: Number.isFinite(call.breakeven) && Number.isFinite(put.breakeven)
        ? call.breakeven - put.breakeven : NaN,
      bandPct: Number.isFinite(call.breakeven) && Number.isFinite(put.breakeven) && group.spot > 0
        ? ((call.breakeven - put.breakeven) / group.spot) * 100 : NaN,
    };
  }).sort((a, b) => b.weight - a.weight || a.days - b.days);

  const total = rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  return { metric: key, side, rows: ranked, expiries, total, counted: rows.length };
}

/**
 * توزیع یک سنجه روی سطل‌های «فاصله اعمال از قیمت جاری».
 *
 * یک هیستوگرام، نه یک رتبه‌بندی: می‌گوید پول بازار روی چه فاصله‌ای از قیمت
 * امروز نشسته — نزدیک پول، یا دور. سطل‌ها ثابت‌اند تا دو نماد و دو روز با هم
 * مقایسه شوند؛ سطل پویا هر بار مرز جای دیگری می‌گذارد.
 */
export const MONEYNESS_BUCKETS = [-30, -20, -10, -5, 0, 5, 10, 20, 30];

export function moneynessDistribution(contracts = [], metric = 'value') {
  const key = BOARD_METRICS.includes(metric) ? metric : 'value';
  const edges = MONEYNESS_BUCKETS;
  const make = (from, to, label) => ({ from, to, label, call: 0, put: 0, total: 0, contracts: 0 });
  const buckets = [make(-Infinity, edges[0], `کمتر از ${edges[0]}٪`)];
  for (let i = 0; i < edges.length - 1; i++) buckets.push(make(edges[i], edges[i + 1], `${edges[i]} تا ${edges[i + 1]}٪`));
  buckets.push(make(edges[edges.length - 1], Infinity, `بیش از ${edges[edges.length - 1]}٪`));
  for (const row of contracts) {
    const spot = Number(row.spot), strike = Number(row.strike);
    if (!(spot > 0) || !(strike > 0)) continue;
    const moneyness = ((strike / spot) - 1) * 100;
    const bucket = buckets.find((b) => moneyness >= b.from && moneyness < b.to);
    if (!bucket) continue;
    const weight = Number(row[key]) || 0;
    bucket.contracts += 1; bucket.total += weight;
    if (row.kind === 'put') bucket.put += weight; else bucket.call += weight;
  }
  return buckets;
}

// ————————————————————————————————————————————————————————————————
// سنجه‌های استاندارد تابلوی اختیار که تا امروز اینجا نبودند.
//
// نماهای قبلی داشبورد، بیشترشان یک جدول بودند با مرتب‌سازی متفاوت — و حالا
// که جدول‌ها خودشان روی هر ستون مرتب می‌شوند، آن تفاوت اصلاً تفاوت نیست.
// چیزی که نبود، سنجه‌هایی است که از **ساختار** زنجیره درمی‌آیند نه از
// رتبه‌بندی یک ستون.
// ————————————————————————————————————————————————————————————————

/**
 * نردبان قیمت اعمال: موقعیت باز و حجم هر اعمال، کال و پوت جدا.
 *
 * این همان چیزی است که تابلوخوان‌ها «دیوار» می‌نامند: اعمالی که موقعیت باز
 * سنگینی رویش جمع شده، در عمل مثل سطح حمایت یا مقاومت رفتار می‌کند، چون
 * فروشندهٔ آن قرارداد انگیزه دارد قیمت را از آن دور نگه دارد.
 *
 * یک گروه به‌ازای هر «پایه:سررسید» ساخته می‌شود، چون نردبانِ دو سررسید
 * روی هم، دو ساختار متفاوت را یکی نشان می‌دهد.
 */
export function strikeLadder(contracts = []) {
  const groups = new Map();
  for (const row of contracts) {
    const strike = Number(row.strike);
    if (!(strike > 0)) continue;
    const groupKey = `${row.uaIns}:${row.endDate}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { key: groupKey, uaIns: row.uaIns, uaName: row.uaName, endDate: row.endDate,
        days: row.days, spot: Number(row.spot), strikes: new Map() };
      groups.set(groupKey, group);
    }
    let rung = group.strikes.get(strike);
    if (!rung) {
      rung = { strike, callOi: 0, putOi: 0, callVolume: 0, putVolume: 0,
        callValue: 0, putValue: 0, callIvPct: NaN, putIvPct: NaN };
      group.strikes.set(strike, rung);
    }
    const side = row.kind === 'put' ? 'put' : 'call';
    rung[`${side}Oi`] += Number(row.oi) || 0;
    rung[`${side}Volume`] += Number(row.volume) || 0;
    rung[`${side}Value`] += Number(row.value) || 0;
    if (Number.isFinite(row.ivPct)) rung[`${side}IvPct`] = row.ivPct;
  }
  return [...groups.values()].map((group) => ({
    ...group,
    rungs: [...group.strikes.values()].sort((a, b) => a.strike - b.strike).map((rung) => ({
      ...rung,
      oi: rung.callOi + rung.putOi,
      volume: rung.callVolume + rung.putVolume,
      // نسبت پوت به کال روی همین اعمال — نه روی کل زنجیره. تمرکز پوت روی
      // یک اعمال خاص، چیزی می‌گوید که نسبت کلِ زنجیره پنهانش می‌کند.
      putCallOi: rung.callOi > 0 ? rung.putOi / rung.callOi : NaN,
      moneynessPct: group.spot > 0 ? ((rung.strike / group.spot) - 1) * 100 : NaN,
    })),
    strikes: undefined,
  })).map(({ strikes, ...rest }) => rest);
}

/**
 * بیشترین درد (Max Pain): قیمتی که در آن، مجموع ارزش ذاتیِ همه قراردادهای
 * باز در سررسید کمینه است — یعنی بیشترین حجم تعهد بی‌ارزش منقضی می‌شود.
 *
 * تفسیرش ادعای پیش‌بینی نیست: فقط می‌گوید سنگینیِ تعهدِ باز کجاست. با این
 * حال همان عدد، پرکاربردترین خلاصهٔ یک نردبان موقعیت باز است.
 *
 * فقط روی اعمال‌های واقعیِ همان سررسید حساب می‌شود، نه روی شبکه‌ای ساختگی:
 * قیمتی که هیچ قراردادی رویش نیست، جواب این سؤال نمی‌شود.
 */
export function maxPain(ladder = []) {
  return ladder.map((group) => {
    const rungs = group.rungs.filter((rung) => rung.oi > 0);
    if (rungs.length < 2) {
      return { ...group, maxPain: NaN, maxPainGapPct: NaN, totalOi: rungs.reduce((s, r) => s + r.oi, 0), curve: [] };
    }
    const curve = rungs.map((candidate) => {
      // در قیمت تسویه S، کالِ اعمال K وقتی ارزش دارد که S > K، و پوت وقتی S < K
      let pain = 0;
      for (const rung of rungs) {
        pain += Math.max(0, candidate.strike - rung.strike) * rung.callOi;
        pain += Math.max(0, rung.strike - candidate.strike) * rung.putOi;
      }
      return { strike: candidate.strike, pain };
    });
    const best = curve.reduce((a, b) => (b.pain < a.pain ? b : a));
    return {
      ...group,
      maxPain: best.strike,
      maxPainGapPct: group.spot > 0 ? ((best.strike / group.spot) - 1) * 100 : NaN,
      totalOi: rungs.reduce((sum, rung) => sum + rung.oi, 0),
      curve,
    };
  });
}

/**
 * ساختار زمانی تلاطم: IV وزنی به‌ازای روزهای مانده تا سررسید.
 *
 * شیب مثبت (سررسید دور، IV بالاتر) حالت عادی بازار آرام است؛ وارونه‌شدنش
 * یعنی بازار برای کوتاه‌مدت تلاطم بیشتری قیمت می‌زند — معمولاً پیش از یک
 * رویداد تاریخ‌دار.
 *
 * وزن، ارزش معامله است: قراردادی که امروز معامله نشده، IV دیروزش نباید
 * ساختار امروز را جابه‌جا کند.
 */
export function termStructure(contracts = []) {
  const groups = new Map();
  for (const row of contracts) {
    if (!Number.isFinite(row.ivPct)) continue;
    const weight = Number(row.value) || 0;
    if (!(weight > 0)) continue;
    const key = `${row.uaIns}:${row.endDate}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, uaIns: row.uaIns, uaName: row.uaName, endDate: row.endDate, days: row.days,
        call: { iv: 0, weight: 0 }, put: { iv: 0, weight: 0 } };
      groups.set(key, group);
    }
    const bucket = row.kind === 'put' ? group.put : group.call;
    bucket.iv += row.ivPct * weight; bucket.weight += weight;
  }
  return [...groups.values()].map((group) => {
    const callIv = group.call.weight > 0 ? group.call.iv / group.call.weight : NaN;
    const putIv = group.put.weight > 0 ? group.put.iv / group.put.weight : NaN;
    const totalWeight = group.call.weight + group.put.weight;
    return {
      key: group.key, uaIns: group.uaIns, uaName: group.uaName, endDate: group.endDate, days: group.days,
      callIvPct: callIv, putIvPct: putIv,
      ivPct: totalWeight > 0 ? (group.call.iv + group.put.iv) / totalWeight : NaN,
      // اختلاف پوت منهای کال: چولگی. مثبت یعنی بازار برای ریزش گران‌تر
      // قیمت می‌زند تا برای رشد.
      skewPp: Number.isFinite(callIv) && Number.isFinite(putIv) ? putIv - callIv : NaN,
      weight: totalWeight,
    };
  }).sort((a, b) => a.days - b.days);
}

// ————————————————————————————————————————————————————————————————
// زنجیرهٔ دوطرفه — همان چیدمانی که هر تابلوی اختیارِ حرفه‌ای دارد.
//
// جدول تخت برای مرتب‌کردن و غربال‌کردن خوب است، ولی سؤالی را که معامله‌گر
// اختیار واقعاً می‌پرسد جواب نمی‌دهد: «روی این اعمال، کال گران‌تر است یا
// پوت؟ کدام طرف موقعیت باز سنگین‌تری دارد؟» آن سؤال **قرینه** است و با
// ردیف‌های پشت‌سرهم دیده نمی‌شود؛ با کال و پوتِ هم‌اعمال روی یک ردیف دیده
// می‌شود.
// ————————————————————————————————————————————————————————————————

/**
 * کال و پوتِ هر قیمت اعمال، روی یک ردیف.
 *
 * `spotIndex` شمارهٔ ردیفی است که **خطِ قیمت جاری بالای آن** می‌نشیند —
 * یعنی نخستین اعمالی که از قیمت جاری بالاتر است. بی‌قیمتِ پایه، `-1`:
 * خطی که جایش معلوم نیست کشیده نمی‌شود، نه اینکه حدس زده شود.
 *
 * «در سود» از دید هر سمت جدا خوانده می‌شود: کال وقتی اعمالش زیر قیمت جاری
 * است و پوت وقتی بالای آن — همان اشتباهی که با یک شرط مشترک پیش می‌آید.
 */
export function twoSidedChain(contracts = [], spot = NaN) {
  const strikes = new Map();
  for (const row of contracts) {
    const strike = Number(row.strike);
    if (!(strike > 0)) continue;
    let rung = strikes.get(strike);
    if (!rung) { rung = { strike, call: null, put: null }; strikes.set(strike, rung); }
    rung[row.kind === 'put' ? 'put' : 'call'] = row;
  }
  const price = Number(spot);
  const rows = [...strikes.values()].sort((a, b) => a.strike - b.strike).map((rung) => ({
    ...rung,
    callItm: price > 0 ? rung.strike < price : null,
    putItm: price > 0 ? rung.strike > price : null,
  }));
  return { rows, spot: price > 0 ? price : NaN, spotIndex: price > 0 ? rows.findIndex((row) => row.strike > price) : -1 };
}

/** بیشینهٔ یک ستون در هر دو سمت — مقیاس مشترک نوارهای «دیوار». */
export function chainSideMax(rows = [], key = 'oi') {
  return Math.max(0, ...rows.flatMap((row) => [Number(row.call?.[key]) || 0, Number(row.put?.[key]) || 0]));
}

// ————————————————————————————————————————————————————————————————
// سنجه‌های یک قرارداد که تا امروز در هیچ ستونی نبودند.
//
// خواستهٔ صاحب پروژه: «ارزش معاملات، فاصله‌ها، درصد سودها و… همه چیز در
// تمامی موضوعات؛ چیزی جا نمونه.» تابلو، ارزش و حجم و موقعیت باز را خودش
// می‌دهد؛ آنچه نمی‌دهد و معامله‌گر اختیار پیش از زدن دکمه حساب می‌کند این
// چهار دسته است: یونانی‌ها، اهرم، فرسایش زمان، و بازدهِ سناریو.
//
// هر عدد از دادهٔ واقعی همان ردیف می‌آید. جایی که ورودی نیست — تلاطم حل
// نشده، پریمیوم صفر، روزِ مانده نامعلوم — خروجی `NaN` است و ستون «—» نشان
// می‌دهد، نه صفر (قاعدهٔ ۲-۴).
// ————————————————————————————————————————————————————————————————

/**
 * `params` همان `{ rFree, divYield, yearDays }` تنظیمات کاربر است. تلاطم
 * دوباره حل نمی‌شود: `ivPct` همان چیزی است که عکس بازار داده، پس ستون
 * تلاطم و ستون یونانی همیشه با هم می‌خوانند.
 */
export function contractAnalytics(row = {}, params = {}) {
  const kind = row.kind === 'put' ? 'put' : row.kind === 'call' ? 'call' : null;
  const spot = Number(row.spot), strike = Number(row.strike);
  const premium = Number(row.last) > 0 ? Number(row.last) : NaN;
  const days = Number(row.days), ivPct = Number(row.ivPct);
  const yearDays = Number(params.yearDays) > 0 ? Number(params.yearDays) : 365;
  const greeks = kind ? greeksFromIvPct({ kind, strike }, { spot, days }, ivPct, { ...params, yearDays }) : null;
  // کف نظری = ارزش بلک–شولز در کمینهٔ دامنهٔ تلاطم. زیر این عدد، هیچ
  // تلاطمی جواب نمی‌دهد.
  const ivLo = Number(params.ivLo) > 0 ? Number(params.ivLo) : 0.01;
  const T = days > 0 ? days / yearDays : NaN;
  const floor = kind && spot > 0 && strike > 0 && T > 0
    ? bsPrice(kind, spot, strike, T, Number(params.rFree) || 0, Number(params.divYield) || 0, ivLo) : NaN;

  const intrinsic = kind && spot > 0 && strike > 0
    ? Math.max(0, kind === 'call' ? spot - strike : strike - spot) : NaN;
  const timeValue = Number.isFinite(intrinsic) && Number.isFinite(premium) ? premium - intrinsic : NaN;

  // اهرمِ ساده می‌گوید یک قرارداد چند برابرِ خودِ سهم را کنترل می‌کند؛ اهرمِ
  // مؤثر همان را در دلتا ضرب می‌کند، یعنی «یک درصد حرکت پایه چند درصد روی
  // پریمیوم می‌نشیند». دومی عددی است که واقعاً تصمیم می‌سازد.
  const leverage = premium > 0 && spot > 0 ? spot / premium : NaN;
  const delta = Number(greeks?.delta);
  const effectiveLeverage = Number.isFinite(leverage) && Number.isFinite(delta) ? leverage * Math.abs(delta) : NaN;

  // ── دلتای اجرایی، جدا از دلتای مشاهده‌ای ──────────────────────────
  //
  // اولی از میانهٔ مظنه می‌آید که با قیمت پایه هم‌زمان است؛ دومی از آخرین
  // معامله که ممکن است ساعت‌ها پیش باشد. کنار هم نشستنشان خودش یک هشدار
  // است: فاصلهٔ زیاد یعنی قیمت مشاهده‌ای کهنه است.
  const midGreeks = kind && Number.isFinite(Number(row.ivMidPct))
    ? greeksFromIvPct({ kind, strike }, { spot, days }, Number(row.ivMidPct), { ...params, yearDays })
    : null;

  return {
    // ستون خالی وقتی تلاطم هست یعنی «چیزی برای توضیح نیست»؛ ستون خالی
    // وقتی تلاطم نیست یعنی «خودمان هم نمی‌دانیم» — و این دو نباید یک شکل
    // دیده شوند.
    ivWhyText: Number.isFinite(Number(row.ivPct)) ? ''
      : (IV_WHY_LABEL[row.ivWhy] || 'نامشخص'),
    // ═══ «آخرین قیمت» همیشه «قیمت امروز» نیست ═══
    //
    // ممیزی: «قراردادهای بدون معامله تازه ممکن است با قیمت قدیمی
    // رتبه‌بندی شوند.» تابلو برای قراردادِ امروز بی‌معامله هم یک `last`
    // می‌دهد — آخرین معاملهٔ هر جلسه‌ای که بوده. تنها نشانهٔ قابل اتکا در
    // همین عکس، حجم امروز است.
    pricedToday: Number(row.volume) > 0,
    deltaMid: Number(midGreeks?.delta ?? NaN),
    delta: Number.isFinite(delta) ? delta : NaN,
    gamma: Number(greeks?.gamma ?? NaN),
    vega: Number(greeks?.vega ?? NaN),
    theta: Number(greeks?.theta ?? NaN),
    rho: Number(greeks?.rho ?? NaN),
    probItmPct: Number.isFinite(Number(greeks?.probItm)) ? Number(greeks.probItm) * 100 : NaN,
    leverage, effectiveLeverage,
    // فرسایش: ارزش زمانی تقسیم بر روزهای مانده. هزینهٔ نگه‌داشتن، به ریال
    // در روز — و همان به درصدِ پریمیوم، تا دو قرارداد با دو قیمت مقایسه شوند.
    timeValuePerDay: Number.isFinite(timeValue) && days > 0 ? timeValue / days : NaN,
    timeDecayPctPerDay: Number.isFinite(timeValue) && days > 0 && premium > 0
      ? (timeValue / days / premium) * 100 : NaN,
    // ارزش زمانی سالانه‌شده روی قیمت پایه: تنها شکلی که دو سررسید متفاوت
    // را قابل مقایسه می‌کند.
    timeValueAnnualPct: Number.isFinite(timeValue) && days > 0 && spot > 0
      ? (timeValue / spot) * (yearDays / days) * 100 : NaN,
    // اگر پایه تا سررسید **تکان نخورد**، خریدار چند درصد می‌بَرد یا می‌بازد.
    // برای هر اختیارِ بی‌ارزشِ ذاتی دقیقاً ‎−۱۰۰‎ است و همان هم درست است.
    staticReturnPct: Number.isFinite(intrinsic) && premium > 0
      ? ((intrinsic - premium) / premium) * 100 : NaN,
    // گردش امروز نسبت به تعهد انباشته: بالای یک یعنی حجم امروز از کل
    // موقعیت باز بیشتر است — جابه‌جایی، نه انباشت.
    turnoverRatio: Number(row.oi) > 0 && Number(row.volume) >= 0 ? Number(row.volume) / Number(row.oi) : NaN,
    // فاصلهٔ سربه‌سر از قیمت اعمال، به درصد اعمال: همان پریمیوم است ولی
    // در مقیاسی که بین اعمال‌های مختلف قابل مقایسه است.
    premiumPctStrike: premium > 0 && strike > 0 ? (premium / strike) * 100 : NaN,
    // ═══ کفِ نظری، کنارِ علتش ═══
    //
    // «قیمت زیر کف نظری» تا وقتی خودِ کف دیده نشود یک ادعای بی‌شاهد است.
    // این ستون همان عددی است که حل‌گر با آن مقایسه می‌کند — و چون از نرخ
    // بدون ریسک تنظیمات می‌آید، به کاربر نشان می‌دهد که فرضِ نرخ، نه بازار،
    // دارد ستون تلاطم را خالی می‌کند.
    theoreticalFloor: floor,
    floorGap: Number.isFinite(floor) && Number.isFinite(premium) ? premium - floor : NaN,
  };
}

// ————————————————————————————————————————————————————————————————
// تغذیهٔ «نگاه باز» در حالت لحظه‌ای، از همان عکس زندهٔ داشبورد.
//
// ممیزی ۱۴۰۵/۰۶/۲۴، دو ایراد بحرانی: باز کردن نمای لحظه‌ای، ساختِ دفتر
// تاریخیِ ۲۶۲ روزه را راه می‌انداخت — ۲۰۱ درخواست تاریخچهٔ قیمت — و در
// همان حال انتخابگر نماد صفر گزینه نشان می‌داد، چون فهرست از **دفتر بازه**
// می‌آمد نه از تابلوی امروز. نتیجه: نمادهایی قابل انتخاب بودند که امروز
// هیچ قراردادی ندارند، و کاربر منتظر داده‌ای می‌ماند که برای این نما لازم
// نبود.
//
// این دو تابع همان عکس زنده را به شکلی می‌دهند که نگاه باز می‌خواهد، بدون
// هیچ درخواست تازه‌ای.
// ————————————————————————————————————————————————————————————————

/** فهرست نماد پایه برای انتخابگر نمای لحظه‌ای — فقط نمادهای امروزِ تابلو. */
export function liveBaseList(universe = {}) {
  const contracts = universe.contracts || [];
  const byUa = new Map();
  for (const row of contracts) {
    const key = String(row.uaIns || '');
    if (!key) continue;
    let item = byUa.get(key);
    if (!item) { item = { ins: key, name: row.uaName || key, contracts: 0, expiries: new Set(), traded: 0 }; byUa.set(key, item); }
    item.contracts += 1;
    if (row.endDate) item.expiries.add(String(row.endDate));
    if (Number(row.volume) > 0) item.traded += 1;
  }
  const meta = new Map((universe.underlyings || []).map((row) => [String(row.ins), row]));
  return [...byUa.values()]
    .map((item) => ({
      ins: item.ins, name: meta.get(item.ins)?.name || item.name,
      contracts: item.contracts, expiries: item.expiries.size, tradedContracts: item.traded,
      changePct: Number(meta.get(item.ins)?.changePct ?? NaN),
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
}

/**
 * قراردادهای فعال یک نماد، با همان شکلی که `flattenActiveContracts` می‌دهد
 * تا مصرف‌کننده نفهمد داده از کجا آمده.
 *
 * `size` وقتی تابلو نداده صفر می‌ماند و پرچمش پایین است؛ لایهٔ بالاتر
 * پیش‌فرض اعلامی کاربر را می‌گذارد و ردیف را نشان‌دار می‌کند (قاعدهٔ ۲-۴).
 */
export function liveOpenViewContracts(universe = {}, uaIns = '') {
  const key = String(uaIns || '');
  return (universe.contracts || [])
    .filter((row) => String(row.uaIns) === key && row.ins)
    .map((row) => ({
      ins: String(row.ins), name: row.name, kind: row.kind,
      strike: Number(row.strike), size: Number(row.size) > 0 ? Number(row.size) : 0,
      sizeFromSpec: Number(row.size) > 0,
      expiry: Number(row.endDate), expiryRaw: row.endDate, daysNow: Number(row.days),
    }))
    .sort((a, b) => a.expiry - b.expiry || a.strike - b.strike || a.kind.localeCompare(b.kind));
}

// ————————————————————————————————————————————————————————————————
// ادغام گردش واقعی نماد پایه در عکس زنجیره.
//
// ممیزی: «ارزش خود پایه» برای هر ۲۵ ردیف صفر بود، در حالی که نوار معاملات
// می‌گفت ۲۳ پایه معامله شده و جمع ارزششان بیش از ۱۵۵ هزار میلیارد ریال
// است. علت: سرور گردش پایه‌ها را جدا می‌گیرد و در `snapshot` می‌ریزد، ولی
// هیچ‌وقت به `universe.underlyings` برنمی‌گرداند — و `buildChain` نبودِ
// `qTotCap_UA` را **صفر** می‌نویسد، نه «نداریم».
//
// `observed` همان ردیف‌های نوار معامله است. پایه‌ای که اصلاً در آن فهرست
// نیست «نامعلوم» می‌گیرد نه صفر؛ پایه‌ای که هست و امروز معامله نشده، صفرِ
// واقعی می‌گیرد.
// ————————————————————————————————————————————————————————————————
export function mergeUnderlyingTrades(universe = {}, observed = []) {
  const seen = new Map((observed || []).map((row) => [String(row.ins), row]));
  const underlyings = (universe.underlyings || []).map((row) => {
    const hit = seen.get(String(row.ins));
    if (!hit) return { ...row, uaValue: NaN, uaVolume: NaN, uaTrades: NaN };
    return {
      ...row,
      uaValue: Number(hit.value), uaVolume: Number(hit.volume), uaTrades: Number(hit.trades),
      // قیمت پایه هم اگر نوار معامله تازه‌تر دارد، همان مبناست.
      last: Number(hit.last) > 0 ? Number(hit.last) : row.last,
    };
  });
  return { ...universe, underlyings };
}

// ————————————————————————————————————————————————————————————————
// مرتب‌سازی زنجیرهٔ دوطرفه.
//
// ═══ چرا این یک تصمیم است، نه یک `sort` ساده ═══
//
// در زنجیرهٔ دوطرفه هر ردیف **دو** مقدار برای هر ستون دارد: یکی کال، یکی
// پوت. پس «مرتب بر تلاطم» به‌تنهایی یک دستور ناقص است — تلاطمِ کدام سمت؟
// انتخابگر همین را حل می‌کند: کلیک روی سرستونِ سمت کال یعنی با کال مرتب
// کن، سمت پوت یعنی با پوت.
//
// قیمت اعمال استثناست: یکی است و به هیچ سمتی تعلق ندارد. مرتب‌سازی بر آن،
// همان **نردبانِ** اصلی زنجیره است و تنها حالتی است که خط قیمت جاری معنی
// دارد — چون آن خط بین دو اعمالِ در بر گیرنده می‌نشیند و در ترتیب دیگری
// جایی ندارد.
//
// ردیفی که در آن سمت قرارداد ندارد همیشه **آخر** می‌ماند، در هر دو جهت.
// وگرنه در ترتیب صعودی، ردیف‌های خالی بالای همهٔ قراردادهای واقعی می‌نشینند.
// ————————————————————————————————————————————————————————————————

export const PAIRED_SORT_DEFAULT = Object.freeze({ key: 'strike', side: null, dir: 1 });

export function sortPairedChain(rows = [], sort = PAIRED_SORT_DEFAULT) {
  const key = sort?.key || 'strike';
  const dir = Number(sort?.dir) < 0 ? -1 : 1;
  const side = sort?.side === 'call' || sort?.side === 'put' ? sort.side : null;
  const list = [...rows];
  if (key === 'strike' || !side) {
    return list.sort((a, b) => (Number(a.strike) - Number(b.strike)) * dir);
  }
  const valueOf = (row) => {
    const raw = row?.[side]?.[key];
    const num = Number(raw);
    if (Number.isFinite(num)) return { num, text: null };
    return typeof raw === 'string' && raw ? { num: NaN, text: raw } : { num: NaN, text: null };
  };
  return list.sort((a, b) => {
    const left = valueOf(a), right = valueOf(b);
    const leftEmpty = !Number.isFinite(left.num) && left.text === null;
    const rightEmpty = !Number.isFinite(right.num) && right.text === null;
    if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;   // خالی، همیشه آخر
    if (leftEmpty && rightEmpty) return Number(a.strike) - Number(b.strike);
    if (left.text !== null || right.text !== null) {
      return String(left.text ?? '').localeCompare(String(right.text ?? ''), 'fa') * dir;
    }
    return (left.num - right.num) * dir || (Number(a.strike) - Number(b.strike));
  });
}

/**
 * کدام سمت‌ها رسم شوند.
 *
 * خواستهٔ صاحب پروژه: «اگر فقط کال بود فقط کال را نشان بده، یعنی پوت را
 * کلاً نیار.» تا امروز ستون‌های سمتِ فیلترشده با «—» پر می‌شدند — یعنی
 * نصف عرض جدول خرج چیزی می‌شد که کاربر صریحاً کنارش گذاشته بود.
 */
export function pairedSides(side = 'all') {
  if (side === 'call') return ['call'];
  if (side === 'put') return ['put'];
  return ['call', 'put'];
}
