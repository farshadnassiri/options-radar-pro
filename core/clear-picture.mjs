// «تصویر شفاف» — نگاهِ از کل به جزء به بازار اختیار (۱۴۰۵/۰۷/۱۷).
//
// خواستهٔ صاحب پروژه: پنج زیرتبِ «مقایسه در زنجیره»، «نبض و جهت بازار»،
// «نقدینگی و سررسید»، «اختیارهای پرمعامله» و «دیده‌بان زنجیره» در یک تب
// خلاصه شوند که با ورود به آن، کاربر در یک نگاه ببیند: ارزش کل معاملات؛
// سهم کال و پوت از ارزش (جدا و هر دو، کلی و به تفکیک هر نماد)؛ درصد
// قراردادهای مثبت و منفی و مسیرش در طول روز؛ «ترین»ها؛ و همهٔ این‌ها برای
// هر نماد پایه، سررسید یا قرارداد.
//
// این ماژول خالص است: ردیف‌های قراردادِ عکس داشبورد (`decisionDashboardSnapshot`)
// را می‌گیرد و عدد می‌دهد. عددِ نامعلوم نامعلوم می‌ماند — میدانِ نیامده در
// تابلو (`NaN`) در جمع شمرده نمی‌شود و شمارش جدا دارد، نه صفرِ ساختگی.

import { pctVsYesterday } from './price-change.mjs';
import { activeOptionsBoard, BOARD_METRICS, contractBreakeven, breakevenGap, breakevenGapPct } from './decision-dashboard.mjs';

const num = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));
const known = (value) => Number.isFinite(value);
const share = (part, total) => (total > 0 && known(part) ? (part / total) * 100 : NaN);
const add = (sum, value) => sum + (known(value) ? value : 0);

/** قرارداد امروز معامله شده؟ (حجم، تعداد یا ارزش مثبت) */
export const tradedToday = (row) => num(row?.volume) > 0 || num(row?.trades) > 0 || num(row?.value) > 0;

/**
 * جهت یک قرارداد نسبت به پایانی دیروز.
 *
 * فقط قراردادِ معامله‌شده جهت دارد — همان قاعدهٔ وسعتِ پایه‌ها
 * (`marketBreadthSnapshot`): قراردادی که امروز دست نخورده «بی‌معامله» است، نه
 * «بدون تغییر». مبنا آخرین معامله است و اگر نبود، قیمت جاریِ تابلو.
 */
export function directionOf(row) {
  if (!tradedToday(row)) return 'untraded';
  const trade = num(row.tradeLast) > 0 ? num(row.tradeLast) : num(row.last);
  const change = pctVsYesterday(trade, row.yday);
  if (!known(change)) return 'unknown';
  return change > 0 ? 'positive' : change < 0 ? 'negative' : 'flat';
}

/** جمعِ یک گروه قرارداد: ارزش، حجم، تعداد، موقعیت باز، کال/پوت و جهت. */
export function pictureTotals(rows = []) {
  const t = {
    contracts: 0, traded: 0, value: 0, callValue: 0, putValue: 0, volume: 0, callVolume: 0, putVolume: 0,
    trades: 0, callTrades: 0, putTrades: 0, oi: 0, callOi: 0, putOi: 0, oiChange: 0,
    positive: 0, negative: 0, flat: 0, untraded: 0, unknown: 0,
    // جهتِ هر سمت جدا، تا مسیرِ روز هم کال/پوت/هر دو را بپذیرد.
    callPositive: 0, callNegative: 0, callFlat: 0, putPositive: 0, putNegative: 0, putFlat: 0,
    // شمارِ قراردادهایی که میدانشان از تابلو نیامد؛ جمع بدون آن‌هاست و رابط می‌گوید.
    missingValue: 0, missingOi: 0, _oiChangeKnown: 0,
  };
  for (const row of rows || []) {
    t.contracts += 1;
    const side = row.kind === 'put' ? 'put' : 'call';
    if (tradedToday(row)) t.traded += 1;
    const value = num(row.value), volume = num(row.volume), trades = num(row.trades), oi = num(row.oi);
    if (!known(value)) t.missingValue += 1;
    if (!known(oi)) t.missingOi += 1;
    t.value = add(t.value, value); t[`${side}Value`] = add(t[`${side}Value`], value);
    t.volume = add(t.volume, volume); t[`${side}Volume`] = add(t[`${side}Volume`], volume);
    t.trades = add(t.trades, trades); t[`${side}Trades`] = add(t[`${side}Trades`], trades);
    t.oi = add(t.oi, oi); t[`${side}Oi`] = add(t[`${side}Oi`], oi);
    if (known(num(row.oiChange))) { t.oiChange += num(row.oiChange); t._oiChangeKnown += 1; }
    const direction = directionOf(row);
    t[direction] += 1;
    if (direction === 'positive' || direction === 'negative' || direction === 'flat') {
      t[`${side}${direction[0].toUpperCase()}${direction.slice(1)}`] += 1;
    }
  }
  const directed = t.positive + t.negative + t.flat;
  const out = {
    ...t,
    oiChange: t._oiChangeKnown ? t.oiChange : NaN,
    tradedPct: share(t.traded, t.contracts),
    callValuePct: share(t.callValue, t.value), putValuePct: share(t.putValue, t.value),
    callVolumePct: share(t.callVolume, t.volume), putVolumePct: share(t.putVolume, t.volume),
    callTradesPct: share(t.callTrades, t.trades), putTradesPct: share(t.putTrades, t.trades),
    callOiPct: share(t.callOi, t.oi), putOiPct: share(t.putOi, t.oi),
    // نسبت پوت به کال روی ارزش؛ بی ارزشِ کال، نسبتی ساخته نمی‌شود.
    putCallValue: t.callValue > 0 ? t.putValue / t.callValue : NaN,
    positivePct: share(t.positive, directed), negativePct: share(t.negative, directed), flatPct: share(t.flat, directed),
    avgTradeValue: t.trades > 0 ? t.value / t.trades : NaN,
  };
  delete out._oiChangeKnown;
  return out;
}

/** سطلِ فاصله از پول از دید همان سمت: مثبت یعنی بیرون از پول. */
export function otmPct(row) {
  const spot = num(row?.spot), strike = num(row?.strike);
  if (!(spot > 0 && strike > 0)) return NaN;
  return row.kind === 'put' ? (1 - strike / spot) * 100 : (strike / spot - 1) * 100;
}

// مرز «نزدیک پول» ±۵٪ — همان پهنای سطل‌های میانیِ توزیع روی فاصلهٔ اعمال.
export const ATM_BAND_PCT = 5;
export const MONEYNESS_BUCKETS = [
  ['itm', 'درون پول'], ['atm', `نزدیک پول (±${ATM_BAND_PCT}٪)`], ['otm', 'بیرون از پول'],
];
export const TENOR_BUCKETS = [
  ['d7', 'تا ۷ روز', 0, 7], ['d30', '۸ تا ۳۰ روز', 8, 30], ['d60', '۳۱ تا ۶۰ روز', 31, 60],
  ['d90', '۶۱ تا ۹۰ روز', 61, 90], ['dfar', 'بیش از ۹۰ روز', 91, Infinity],
];

function bucketValues(rows, keyOf, buckets) {
  const map = new Map(buckets.map(([key, label]) => [key, { key, label, rows: [] }]));
  let unknown = 0;
  for (const row of rows) {
    const key = keyOf(row);
    if (map.has(key)) map.get(key).rows.push(row); else unknown += 1;
  }
  const total = rows.reduce((sum, row) => add(sum, num(row.value)), 0);
  return {
    unknown,
    buckets: [...map.values()].map(({ key, label, rows: members }) => {
      const t = pictureTotals(members);
      return { key, label, contracts: t.contracts, value: t.value, callValue: t.callValue, putValue: t.putValue, sharePct: share(t.value, total) };
    }),
  };
}

/** ارزش روی «درون/نزدیک/بیرون از پول»، کال و پوت جدا. */
export function moneynessSplit(rows = []) {
  return bucketValues(rows, (row) => {
    const pct = otmPct(row);
    if (!known(pct)) return '';
    return pct > ATM_BAND_PCT ? 'otm' : pct < -ATM_BAND_PCT ? 'itm' : 'atm';
  }, MONEYNESS_BUCKETS);
}

/** ارزش روی روزِ مانده تا سررسید. */
export function tenorSplit(rows = []) {
  return bucketValues(rows, (row) => {
    const days = num(row.days);
    if (!known(days)) return '';
    return TENOR_BUCKETS.find(([, , lo, hi]) => days >= lo && days <= hi)?.[0] || '';
  }, TENOR_BUCKETS);
}

/**
 * تمرکز ارزش: سهم پنج قرارداد اول، و چند قرارداد ۸۰٪ ارزش را می‌سازند.
 * تمرکزِ بالا یعنی «بازار» در واقع چند قرارداد است.
 */
export function concentration(rows = []) {
  const values = rows.map((row) => num(row.value)).filter((v) => v > 0).sort((a, b) => b - a);
  const total = values.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return { total: 0, tradedCount: 0, top5Pct: NaN, top1Pct: NaN, n80: NaN, n80Pct: NaN };
  let sum = 0, n80 = 0;
  for (const v of values) { sum += v; n80 += 1; if (sum >= total * 0.8) break; }
  return {
    total, tradedCount: values.length,
    top1Pct: share(values[0], total),
    top5Pct: share(values.slice(0, 5).reduce((s, v) => s + v, 0), total),
    n80, n80Pct: share(n80, values.length),
  };
}

// ── «ترین»ها ─────────────────────────────────────────────────────────
//
// هر فهرست فقط از قراردادهایی که سنجه‌اش معلوم است؛ رشد و افت فقط از
// معامله‌شده‌ها (قراردادِ بی‌معامله «رشد» نکرده). تغییر موقعیت باز صفر جزو
// «بیشترین افزایش» نیست.
export const LEADER_LISTS = [
  ['value', 'پرارزش‌ترین قراردادها', 'value', 'desc'],
  ['volume', 'پرحجم‌ترین قراردادها', 'volume', 'desc'],
  ['trades', 'پرمعامله‌ترین (تعداد معامله)', 'trades', 'desc'],
  ['gainers', 'بیشترین رشد قیمت', 'move', 'desc'],
  ['losers', 'بیشترین افت قیمت', 'move', 'asc'],
  ['oiUp', 'بیشترین افزایش موقعیت باز', 'oiChange', 'desc'],
  ['oiDown', 'بیشترین کاهش موقعیت باز', 'oiChange', 'asc'],
  ['avgTrade', 'درشت‌ترین معاملهٔ میانگین', 'avgTrade', 'desc'],
];

export function leaders(rows = [], { limit = 5 } = {}) {
  const enriched = (rows || []).map((row) => {
    const trade = num(row.tradeLast) > 0 ? num(row.tradeLast) : num(row.last);
    return {
      row,
      move: tradedToday(row) ? pctVsYesterday(trade, row.yday) : NaN,
      value: num(row.value), volume: num(row.volume), trades: num(row.trades), oiChange: num(row.oiChange),
      avgTrade: num(row.trades) > 0 && num(row.value) > 0 ? num(row.value) / num(row.trades) : NaN,
    };
  });
  const out = {};
  for (const [key, , metric, order] of LEADER_LISTS) {
    const pool = enriched.filter((item) => {
      const v = item[metric];
      if (!known(v)) return false;
      if (key === 'gainers') return v > 0;
      if (key === 'losers') return v < 0;
      if (key === 'oiUp') return v > 0;
      if (key === 'oiDown') return v < 0;
      return v > 0;
    });
    pool.sort((a, b) => (order === 'asc' ? a[metric] - b[metric] : b[metric] - a[metric]));
    out[key] = pool.slice(0, limit).map((item) => ({ ...item.row, metric: item[metric] }));
  }
  return out;
}

// ── از کل به جزء: سطحِ بعدیِ هر دامنه ───────────────────────────────
//
// کل بازار → نمادهای پایه؛ نماد پایه → سررسیدها؛ سررسید → قیمت‌های اعمال
// (کال و پوت همان اعمال کنار هم)؛ قرارداد → همان سررسید، با برجسته‌شدن
// قراردادِ انتخابی.
export const PART_OF = { market: 'underlying', underlying: 'expiry', expiry: 'strike', contract: 'strike' };

export function partKey(row, partLevel) {
  if (partLevel === 'underlying') return String(row.uaIns);
  if (partLevel === 'expiry') return `${row.uaIns}:${row.endDate}`;
  return String(num(row.strike));
}

export function pictureParts(rows = [], partLevel = 'underlying') {
  const groups = new Map();
  for (const row of rows || []) {
    const key = partKey(row, partLevel);
    if (!groups.has(key)) groups.set(key, { key, sample: row, rows: [] });
    groups.get(key).rows.push(row);
  }
  const total = (rows || []).reduce((sum, row) => add(sum, num(row.value)), 0);
  return [...groups.values()].map(({ key, sample, rows: members }) => {
    const t = pictureTotals(members);
    return {
      key, level: partLevel,
      uaIns: String(sample.uaIns), uaName: sample.uaName, endDate: sample.endDate, days: sample.days,
      strike: num(sample.strike), spot: num(sample.spot),
      insList: members.map((row) => String(row.ins)),
      ...t, sharePct: share(t.value, total),
    };
  }).sort((a, b) => b.value - a.value || b.volume - a.volume
    || (partLevel === 'strike' ? a.strike - b.strike : String(a.key).localeCompare(String(b.key))));
}

/** فیلترِ سمت: `both`، `call` یا `put`. */
export const SIDES = [['both', 'کال و پوت'], ['call', 'فقط کال'], ['put', 'فقط پوت']];
export const sideOf = (side) => (side === 'call' || side === 'put' ? side : 'both');
export const bySide = (rows = [], side = 'both') => (sideOf(side) === 'both' ? rows || [] : (rows || []).filter((row) => row.kind === side));

// ════════════════ سربه‌سر — همان منطقِ بقیهٔ برنامه ════════════════
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۷): «آیتم‌های سربه‌سر را با منطق سایر
// قسمت‌های برنامه به تصویر شفاف اضافه کن: سربه‌سرها و فاصلهٔ نماد پایه از
// سربه‌سر همراه با درصد، فاصلهٔ سربه‌سر وزنی از هر اعمال و درصدش.»
//
// هیچ تعریف تازه‌ای ساخته نمی‌شود: سربه‌سرِ هر قرارداد `contractBreakeven`
// است (کال اعمال + پریمیوم، پوت اعمال − پریمیوم) و فاصله‌اش از دید همان سمت
// (`breakevenGap*`: مثبت یعنی پایه هنوز نرسیده). سربه‌سرِ وزنیِ هر سررسید همان
// `activeOptionsBoard` است — کال و پوت هرگز با هم میانگین نمی‌شوند.
export const BREAKEVEN_WEIGHTS = [['value', 'ارزش معامله'], ['volume', 'حجم'], ['trades', 'تعداد معامله'], ['oi', 'موقعیت باز']];

// ── مبنای پریمیوم (۱۴۰۵/۰۷/۱۷) ──
//
// «آخرین»: آخرین معاملهٔ امروز، وگرنه پایانی — همان پیش‌فرضِ تابلو. «پایانی»:
// قیمت پایانیِ رسمی، همان مبنای پیش‌فرضِ «نگاه باز» چندروزه؛ تا دو بخش با
// یک مبنا مقایسه‌پذیر باشند. قراردادِ بی‌پایانی سربه‌سر نمی‌گیرد.
export const PREMIUM_BASES = [['last', 'آخرین معامله'], ['close', 'قیمت پایانی']];
export const premiumBasis = (basis) => (basis === 'close' ? 'close' : 'last');

/** ردیف‌ها با پریمیومِ مبنای خواسته در `last` — همان میدانی که سربه‌سر می‌خواند. */
export function withPremium(rows = [], basis = 'last') {
  if (premiumBasis(basis) === 'last') return rows || [];
  return (rows || []).map((row) => ({ ...row, last: num(row.close) > 0 ? num(row.close) : NaN }));
}

/** سربه‌سرِ هر قرارداد و سربه‌سرِ وزنیِ هر «پایه:سررسید». */
export function breakevenPicture(rows = [], { metric = 'value', side = 'both', premium = 'last' } = {}) {
  const key = BOARD_METRICS.includes(metric) ? metric : 'value';
  const priced = withPremium(rows, premium);
  const board = activeOptionsBoard(priced, { metric: key, side: sideOf(side), limit: priced.length || 1 });
  const contracts = bySide(priced, side).map((row) => ({
    ...row, breakeven: contractBreakeven(row), breakevenGap: breakevenGap(row), breakevenGapPct: breakevenGapPct(row),
  }));
  return { metric: key, side: sideOf(side), premium: premiumBasis(premium), expiries: board.expiries, contracts };
}

/**
 * «همهٔ سررسیدها»ی یک نماد پایه: میانگینِ وزنیِ سربه‌سرِ همهٔ قراردادهای همان
 * نماد، سررسیدها با هم — هم‌ارزِ شاخصِ کلِ «نگاه باز». فقط برای یک نماد معنا
 * دارد (قیمت پایهٔ یکسان)؛ دو نماد با دو سطح قیمت میانگین نمی‌شوند.
 */
export function allExpiriesBreakeven(rows = [], { metric = 'value', side = 'both', premium = 'last' } = {}) {
  const uas = new Set((rows || []).map((row) => String(row.uaIns)));
  if (uas.size !== 1) return null;
  const merged = withPremium(rows, premium).map((row) => ({ ...row, endDate: 'all', days: NaN }));
  const key = BOARD_METRICS.includes(metric) ? metric : 'value';
  const row = activeOptionsBoard(merged, { metric: key, side: sideOf(side), limit: 1 }).expiries[0];
  return row ? { ...row, key: 'all', all: true, expiries: new Set((rows || []).map((r) => String(r.endDate))).size } : null;
}

/**
 * نردبانِ اعمالِ یک سررسید: سربه‌سرِ کال و پوتِ هر اعمال و فاصلهٔ پایه از
 * آن‌ها، و فاصلهٔ سربه‌سرِ وزنیِ سررسید از همان اعمال (ریال و ٪ اعمال).
 * `expiry` یک ردیف از `breakevenPicture().expiries` است.
 */
export function breakevenLadder(rows = [], expiry = null) {
  const strikes = new Map();
  for (const row of rows || []) {
    const strike = num(row.strike);
    if (!(strike > 0)) continue;
    if (!strikes.has(strike)) strikes.set(strike, { strike, spot: num(row.spot), value: 0 });
    const item = strikes.get(strike);
    const side = row.kind === 'put' ? 'put' : 'call';
    item[`${side}Ins`] = String(row.ins); item[`${side}Name`] = row.name;
    item[`${side}Premium`] = num(row.last) > 0 ? num(row.last) : NaN;
    item[`${side}Breakeven`] = contractBreakeven(row);
    item[`${side}Gap`] = breakevenGap(row);
    item[`${side}GapPct`] = breakevenGapPct(row);
    item[`${side}Value`] = num(row.value);
    item.value = add(item.value, num(row.value));
  }
  const wCall = num(expiry?.callBreakeven), wPut = num(expiry?.putBreakeven);
  return [...strikes.values()].sort((a, b) => a.strike - b.strike).map((item) => ({
    ...item,
    moneynessPct: item.spot > 0 ? ((item.strike / item.spot) - 1) * 100 : NaN,
    // فاصلهٔ سربه‌سرِ وزنی از اعمال: مثبت یعنی سربه‌سر بالای این اعمال است.
    wCallFromStrike: known(wCall) ? wCall - item.strike : NaN,
    wCallFromStrikePct: known(wCall) ? ((wCall / item.strike) - 1) * 100 : NaN,
    wPutFromStrike: known(wPut) ? wPut - item.strike : NaN,
    wPutFromStrikePct: known(wPut) ? ((wPut / item.strike) - 1) * 100 : NaN,
  }));
}

/** همهٔ تصویرِ یک دامنه در یک شیء. `rows` قراردادهای دامنه است. */
export function clearPicture(rows = [], { level = 'market' } = {}) {
  const partLevel = PART_OF[level] || 'underlying';
  return {
    level, partLevel,
    totals: pictureTotals(rows),
    parts: pictureParts(rows, partLevel),
    leaders: leaders(rows),
    concentration: concentration(rows),
    moneyness: moneynessSplit(rows),
    tenor: tenorSplit(rows),
  };
}

/**
 * جایگاهِ یک قرارداد در گروهش: سهم از ارزشِ سررسید و نماد، و رتبهٔ ارزش.
 * `siblings` قراردادهای همان سررسید، `family` قراردادهای همان نماد پایه.
 */
export function contractStanding(contract, { siblings = [], family = [] } = {}) {
  if (!contract) return null;
  const value = num(contract.value);
  const sum = (list) => list.reduce((s, row) => add(s, num(row.value)), 0);
  const ranked = siblings.filter((row) => num(row.value) > 0).sort((a, b) => num(b.value) - num(a.value));
  const rank = ranked.findIndex((row) => String(row.ins) === String(contract.ins));
  return {
    expirySharePct: share(value, sum(siblings)),
    familySharePct: share(value, sum(family)),
    rank: rank >= 0 ? rank + 1 : NaN, rankOf: ranked.length,
    direction: directionOf(contract),
  };
}

// ════════════════ مسیرِ روز: نمونهٔ دقیقه‌ای در سرور ════════════════
//
// مسیر وسعتِ پایه‌ها از ریزمعاملهٔ خودِ پایه‌ها ساخته می‌شود
// (`marketBreadthTimeline`)؛ برای هزاران قرارداد اختیار چنین چیزی یعنی
// هزاران درخواست. پس سرور هر دقیقه از همان عکسِ دیده‌بان یک نمونه برمی‌دارد.
// صادقانه: مسیر از نخستین دقیقه‌ای است که سرور در جلسه روشن بوده، و رابط
// همین را می‌نویسد؛ دقیقهٔ ثبت‌نشده درون‌یابی نمی‌شود.
//
// بردارِ هر کلید: [مثبت، منفی، بدون‌تغییر، معامله‌شده، ارزش کال، ارزش پوت، حجم، تعداد معامله]
export const SAMPLE_FIELDS = ['positive', 'negative', 'flat', 'traded', 'callValue', 'putValue', 'volume', 'trades',
  // از ۱۴۰۵/۰۷/۱۷: جهتِ هر سمت جدا (نمونه‌های قدیمی‌تر ندارند و نامعلوم‌اند).
  'callPositive', 'callNegative', 'callFlat', 'putPositive', 'putNegative', 'putFlat'];

const vectorOf = (t) => SAMPLE_FIELDS.map((key) => (known(t[key]) ? Math.round(t[key]) : null));

/** کلیدِ نمونهٔ یک دامنه: `m` کل بازار، `u:<پایه>`، `e:<پایه>:<سررسید>`. */
export function sampleKey({ level, uaIns, endDate } = {}) {
  if (level === 'underlying' && uaIns) return `u:${uaIns}`;
  if ((level === 'expiry' || level === 'contract') && uaIns && endDate) return `e:${uaIns}:${endDate}`;
  return 'm';
}

/** یک نمونه از ردیف‌های قرارداد: `{ t, s: { کلید: بردار } }`. */
export function pictureSample(contracts = [], second) {
  const groups = new Map([['m', []]]);
  for (const row of contracts || []) {
    groups.get('m').push(row);
    for (const key of [`u:${row.uaIns}`, `e:${row.uaIns}:${row.endDate}`]) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  }
  const s = {};
  for (const [key, rows] of groups) s[key] = vectorOf(pictureTotals(rows));
  return { t: Math.trunc(Number(second) || 0), s };
}

/** نمونه‌ها → نقطه‌های یک کلید، به ترتیب زمان. نمونهٔ بی‌این‌کلید نقطه نمی‌سازد. */
export function pictureSeries(samples = [], key = 'm') {
  return (samples || [])
    .filter((sample) => Array.isArray(sample?.s?.[key]))
    .sort((a, b) => a.t - b.t)
    .map((sample) => {
      const v = Object.fromEntries(SAMPLE_FIELDS.map((field, i) => [field, sample.s[key][i] ?? NaN]));
      const directed = v.positive + v.negative + v.flat;
      const value = v.callValue + v.putValue;
      const sidePct = (sidePrefix) => {
        const d = v[`${sidePrefix}Positive`] + v[`${sidePrefix}Negative`] + v[`${sidePrefix}Flat`];
        return [share(v[`${sidePrefix}Positive`], d), share(v[`${sidePrefix}Negative`], d)];
      };
      const [callPositivePct, callNegativePct] = sidePct('call');
      const [putPositivePct, putNegativePct] = sidePct('put');
      return {
        second: sample.t, ...v, value,
        positivePct: share(v.positive, directed), negativePct: share(v.negative, directed),
        callPositivePct, callNegativePct, putPositivePct, putNegativePct,
        callValuePct: share(v.callValue, value), putValuePct: share(v.putValue, value),
      };
    });
}
