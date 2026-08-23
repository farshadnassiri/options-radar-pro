// تجمیع خالص داده‌های داشبورد تصمیم‌گیری.
//
// ورودی همان عکس خام دیده‌بان اختیار است. خروجی چهار سطح بازار، پایه،
// سررسید و قرارداد را نگه می‌دارد تا رابط برای عوض‌کردن دامنه مجبور به
// حدس‌زدن یا درخواست شبکه تازه نباشد.

import { buildChain, underlyingList } from './chain.mjs';
import { liveQuoteIv } from './live-market.mjs';

export function pctVsYesterday(last, yesterday) {
  const now = Number(last), prior = Number(yesterday);
  return now > 0 && prior > 0 ? ((now / prior) - 1) * 100 : NaN;
}

const emptyAggregate = (seed = {}) => ({
  ...seed, contracts: 0, tradedContracts: 0, positive: 0, negative: 0, unchanged: 0,
  volume: 0, value: 0, trades: 0, oi: 0, oiYday: 0, _oiYdayGap: false,
  callVolume: 0, putVolume: 0, callValue: 0, putValue: 0,
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
    target.callVolume += row.volume; target.callValue += row.value; target.callOi += row.oi;
  } else {
    target.putVolume += row.volume; target.putValue += row.value; target.putOi += row.oi;
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
          const contract = {
            ins: String(quote.ins), name: quote.name, kind: quote.kind,
            uaIns: String(ua.ins), uaName: ua.name, endDate: expiry.endDate, days: expiry.days,
            strike: strike.strike, size: strike.size, last, yday: quote.yday,
            changePct: pctVsYesterday(last, quote.yday), bid: quote.bid, ask: quote.ask,
            spreadPct: mid > 0 ? ((quote.ask - quote.bid) / mid) * 100 : NaN,
            volume: quote.vol, trades: quote.trades, value: quote.value,
            spot,
            oi: quote.oi, oiYday: quote.oiYday,
            oiChange: Number(quote.oi) - Number(quote.oiYday),
            ivPct: liveQuoteIv({ ...quote, strike: strike.strike, days: expiry.days }, spot, settings),
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
        breakevenGapPct: Number.isFinite(breakeven) && spot > 0
          ? (row.kind === 'put' ? (1 - breakeven / spot) : (breakeven / spot - 1)) * 100
          : NaN,
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
        call: { weight: 0, be: 0, gap: 0, count: 0 }, put: { weight: 0, be: 0, gap: 0, count: 0 } };
      groups.set(id, group);
    }
    group.contracts += 1;
    const weight = Number(row[key]) || 0;
    group.weight += weight;
    const bucket = row.kind === 'put' ? group.put : group.call;
    if (weight > 0 && Number.isFinite(row.breakeven)) {
      bucket.weight += weight; bucket.be += row.breakeven * weight;
      bucket.gap += row.breakevenGapPct * weight; bucket.count += 1;
    }
  }
  const expiries = [...groups.values()].map((group) => {
    const mean = (bucket) => ({
      breakeven: bucket.weight > 0 ? bucket.be / bucket.weight : NaN,
      gapPct: bucket.weight > 0 ? bucket.gap / bucket.weight : NaN,
      count: bucket.count, weight: bucket.weight,
    });
    const call = mean(group.call), put = mean(group.put);
    return {
      key: group.key, uaIns: group.uaIns, uaName: group.uaName, endDate: group.endDate,
      days: group.days, spot: group.spot, contracts: group.contracts, weight: group.weight,
      callBreakeven: call.breakeven, callGapPct: call.gapPct, callCount: call.count, callWeight: call.weight,
      putBreakeven: put.breakeven, putGapPct: put.gapPct, putCount: put.count, putWeight: put.weight,
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
