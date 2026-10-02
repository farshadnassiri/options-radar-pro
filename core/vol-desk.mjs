// میز تلاطم — «اکنون» در برابر بازگشایی، دیروز و روزهای قبل.
//
// ورودی پاسخ `/api/vol/intraday` (فرم انتقال هر روز) است؛ هر عدد از
// `core/vol-intraday.mjs` می‌آید و اینجا فقط کنار هم چیده می‌شود. خالص و بی
// DOM، تا آزمون بسنجدش و رابط فقط رشته و نمودار بسازد.
//
// ═══ قاعدهٔ «تا همان لحظه» ═══
//
// «اکنون» آخرین لحظهٔ معتبرِ روزِ تمرکز است. مقایسه با روزهای دیگر همیشه در
// **همان ساعت از جلسه** است (`sameTime`) یا در پایان روزهای **گذشته**؛ هیچ
// عددی از بعد از «اکنون» در کارت نمی‌نشیند. روزِ امروز «موقت» است و پایانی
// خوانده نمی‌شود.

import {
  transportPoints, intradaySignature, dayClose, openPoint, valueAt, dayStats, sameTime, sameTimeSummary,
  intradayRealized, realizedSoFar,
} from './vol-intraday.mjs';

export const VOL_DESK_VERSION = 1;

const isNum = (value) => Number.isFinite(value);
const valid = (points) => (points || []).filter((pt) => isNum(pt.value));
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);

// ═══ کش نقطه‌ها ═══
//
// گزارش آزمون ۳۷۱۲e1a (بند ۶): ۴۰ روز × ۴۰ قرارداد × ۴۳ لحظه حدود ۱٫۵ ثانیه
// رشتهٔ اصلی مرورگر را می‌بست و میز، کارت و دیده‌بان هر کدام همان تاریخچه را
// از نو می‌ساختند. روزِ بسته‌شده عوض نمی‌شود، پس نقطه‌هایش با امضای داده و
// پارامترها نگه داشته می‌شود؛ روزِ موقتِ امروز لحظه‌به‌لحظه (هر لحظه با
// امضای خودش)، تا هر دقیقه فقط لحظه‌های تازه حساب شوند. کلید از خودِ داده
// ساخته می‌شود، نه از نام روز: دادهٔ عوض‌شده هرگز نقطهٔ کهنه نمی‌گیرد.
const DAY_CACHE = new Map();
const MOMENT_CACHE = new Map();
const DAY_CAP = 400, MOMENT_CAP = 6000;

function hashOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + text.length.toString(36);
}
function remember(map, key, value, cap) {
  map.set(key, value);
  if (map.size > cap) map.delete(map.keys().next().value);
  return value;
}

export function clearDeskCache() { DAY_CACHE.clear(); MOMENT_CACHE.clear(); }
export const deskCacheSize = () => ({ days: DAY_CACHE.size, moments: MOMENT_CACHE.size });

function cachedPoints(day, ctx, sig) {
  if (!day?.moments?.length) return transportPoints(day, ctx);
  if (!day.provisional) {
    const key = `${sig}|${hashOf(JSON.stringify(day))}`;
    const hit = DAY_CACHE.get(key);
    if (hit) { DAY_CACHE.delete(key); DAY_CACHE.set(key, hit); return hit; }
    return remember(DAY_CACHE, key, transportPoints(day, ctx), DAY_CAP);
  }
  const head = `${sig}|${day.date}|${day.source}|${JSON.stringify(day.limits || null)}`;
  return day.moments.map((row) => {
    const meta = Object.keys(row[4] || {}).map((ins) => day.contracts?.[ins]);
    const key = `${head}|${hashOf(JSON.stringify([row, meta]))}`;
    const hit = MOMENT_CACHE.get(key);
    if (hit) return hit;
    return remember(MOMENT_CACHE, key, transportPoints({ ...day, moments: [row] }, ctx)[0], MOMENT_CAP);
  });
}

/** هر روزِ پاسخ → نقطه‌های شاخص با موتور یکتا (با کش؛ `cache: false` بی کش). */
export function deskDays(api, ctx, { cache = true } = {}) {
  const sig = intradaySignature(ctx);
  return (api?.days || []).map((day) => ({
    date: day.date, source: day.source, provisional: Boolean(day.provisional), why: day.why || '',
    contracts: Object.keys(day.contracts || {}).length,
    points: cache ? cachedPoints(day, ctx, sig) : transportPoints(day, ctx),
    raw: day,
  })).sort((a, b) => a.date - b.date);
}

/**
 * لبخند و ساختار زمانی در یک لحظه از یک روز: فقط همان لحظه با تلاطم هر
 * قرارداد دوباره ساخته می‌شود (نه کل روز).
 */
export function momentDetail(day, second, ctx) {
  const raw = day?.raw;
  if (!raw || !isNum(second)) return null;
  const row = (raw.moments || []).find((m) => m[0] === second);
  if (!row) return null;
  const [pt] = transportPoints({ ...raw, moments: [row] }, ctx, { keepContracts: true });
  return pt || null;
}

/**
 * مدل کامل میز.
 *
 * `today`: روز تهران؛ `summary`: خلاصهٔ روزانهٔ رتبه (`ui/vol-rank-store.mjs`)
 * یا `null`؛ `compareDays`: چند روزِ گذشته در هم‌ساعت و الگوی ساعتی.
 */
export function deskModel({ days = [], today = 0, ctx, summary = null, compareDays = 10, nowSecond = NaN } = {}) {
  const session = ctx.session;
  const skipSec = Math.max(0, Number(ctx.settings?.volOpenSkipMin ?? 15)) * 60;
  const tdy = Number(ctx.settings?.tradingDaysYr) > 0 ? Number(ctx.settings.tradingDaysYr) : 240;
  const withData = days.filter((d) => valid(d.points).length);
  const todayDay = days.find((d) => d.date === today) || null;
  const focus = todayDay && valid(todayDay.points).length ? todayDay : withData.at(-1) || null;
  const provisional = Boolean(focus && focus.date === today && focus.provisional);
  const prior = withData.filter((d) => focus && d.date < focus.date).slice(-compareDays);
  const prev = prior.at(-1) || null;

  const out = {
    version: VOL_DESK_VERSION, today, focus, live: false, liveWhy: provisional ? '' : 'notToday', provisional,
    nowAgeSec: NaN, clockSecond: NaN, prior, prev, days, openSec: session.open, skipSec,
    now: null, open: null, stats: null, ydaySame: null, ydayClose: null,
    same: null, sameRows: [], rv: null, rvDays: null, summary,
    ivRv: NaN, ivHv: NaN, change: NaN, changeYday: NaN, changeYdayClose: NaN,
    why: '',
  };
  if (!focus) {
    out.why = days.some((d) => d.source === 'pending') ? 'pending' : days.length ? 'noIndex' : 'noDays';
    return out;
  }
  const now = dayClose(focus.points);
  out.now = now;
  // ═══ «اکنون» فقط وقتی اکنون است ═══
  //
  // گزارش آزمون ۳۷۱۲e1a (بند ۲): نقطهٔ معتبر ۹:۱۵ و نقطهٔ نامعتبرِ ۱۲:۳۰؛
  // `dayClose` به آخرین مقدار معتبر عقب رفت و مدل باز هم «زنده» بود، پس
  // دیده‌بان شرطی عددِ سه ساعت پیش را «IV اکنون» گرفت. موقت‌بودنِ امروز
  // تازگی را تضمین نمی‌کند. حالا «زنده» یعنی هر چهار با هم: روزِ امروز،
  // ساعت جلسه (از ساعت سرور، نه آخرین قاب)، آخرین لحظهٔ روز خودش معتبر، و
  // سنِ مقدار از سقف کهنگی کمتر. وگرنه همان عدد «آخرین مقدار معتبر» است با
  // سن و علت، و سنجه‌های دیده‌بان `NaN` می‌شوند.
  if (provisional) {
    const last = focus.points.reduce((a, b) => (b.second > a.second ? b : a));
    const clock = isNum(nowSecond) ? nowSecond : last.second;
    const maxAge = Number(ctx.params?.maxAgeSec) > 0 ? Number(ctx.params.maxAgeSec) : 900;
    out.clockSecond = clock;
    out.nowAgeSec = Math.max(0, clock - now.second);
    out.liveWhy = clock < session.open || clock > session.close ? 'closed'
      : !isNum(last.value) ? 'lastInvalid'
        : out.nowAgeSec > maxAge ? 'old' : '';
    out.live = out.liveWhy === '';
    out.lastWhy = isNum(last.value) ? '' : last.why;
  }
  out.open = openPoint(focus.points, { open: session.open, skipSec });
  out.stats = dayStats(focus.points, { open: session.open, skipSec });
  out.change = out.open ? now.value - out.open.value : NaN;
  if (prev) {
    out.ydaySame = valueAt(prev.points, now.second);
    out.ydayClose = dayClose(prev.points);
    out.changeYday = out.ydaySame ? now.value - out.ydaySame.value : NaN;
    out.changeYdayClose = out.ydayClose ? now.value - out.ydayClose.value : NaN;
  }
  out.sameRows = sameTime(prior.map((d) => ({ date: d.date, points: d.points })), now.second, { close: session.close });
  out.same = sameTimeSummary(out.sameRows.map((r) => r.value), now.value);
  out.rv = realizedSoFar(focus.points, { tradingDaysYr: tdy, sessionLength: session.length });
  out.rvDays = intradayRealized([...prior, focus].map((d) => ({ date: d.date, points: d.points })), { tradingDaysYr: tdy, sessionLength: session.length });
  out.ivRv = isNum(out.rv.rvPct) && out.rv.rvPct > 0 ? now.value / out.rv.rvPct : NaN;
  out.ivHv = summary && isNum(summary.hvPct) && summary.hvPct > 0 ? now.value / summary.hvPct : NaN;
  return out;
}

/** چرا مقدار نمایش‌داده «اکنون» نیست. */
export const DESK_LIVE_WHY = {
  notToday: 'امروز داده‌ای نیست؛ آخرین جلسه',
  closed: 'بیرون از ساعت جلسه',
  lastInvalid: 'آخرین لحظهٔ امروز شاخص نساخت',
  old: 'کهنه‌تر از سقف تازگی',
};

/** ردیف‌های جدول «اکنون در برابر …». */
export function deskCompareRows(model) {
  if (!model?.now) return [];
  const now = model.now.value;
  const row = (label, value, note = '', extra = {}) => ({ label, value, diff: isNum(value) ? now - value : NaN, note, ...extra });
  const rows = [
    row(model.live ? 'اکنون' : model.provisional ? 'آخرین مقدار معتبر امروز' : 'پایان آخرین جلسه', now,
      model.live ? 'موقت؛ تا آخرین قاب ضبط' : model.provisional ? `${Math.round((model.nowAgeSec || 0) / 60)} دقیقه پیش؛ ${DESK_LIVE_WHY[model.liveWhy] || ''}` : ''),
    row('بازگشایی امروز', model.open?.value, model.open ? `نخستین لحظهٔ معتبر پس از ${Math.round(model.skipSec / 60)} دقیقهٔ اول` : 'هنوز نیست'),
    row('سقف امروز تا اکنون', model.stats?.high),
    row('کف امروز تا اکنون', model.stats?.low),
    row('دیروز در همین ساعت', model.ydaySame?.value, model.ydaySame?.carried ? `حمل‌شده، ${model.ydaySame.ageSec} ثانیه` : ''),
    row('پایان دیروز', model.ydayClose?.value),
    row(`میانهٔ هم‌ساعتِ ${model.same?.n || 0} روز`, model.same?.median, isNum(model.same?.percentile) ? `اکنون در صدک ${Math.round(model.same.percentile)}` : ''),
  ];
  if (model.summary) {
    rows.push(row('شاخص روزانهٔ رتبه (IV پایانی)', model.summary.ivPct, `IVR ${isNum(model.summary.ivr) ? Math.round(model.summary.ivr) : '—'} · IVP ${isNum(model.summary.ivp) ? Math.round(model.summary.ivp) : '—'}`, { daily: true, date: model.summary.date }));
    if (isNum(model.summary.hvPct)) rows.push(row(`HV ${model.summary.hvWindow} روزه`, model.summary.hvPct, 'تلاطم تاریخی پایانی', { daily: true }));
  }
  if (isNum(model.rv?.rvPct)) rows.push(row('تحقق‌یافتهٔ امروز تا اکنون', model.rv.rvPct, `${model.rv.returns} بازدهٔ ۵ دقیقه‌ای${model.rv.cut ? '؛ لحظه‌های صف کنار رفت' : ''}`));
  return rows;
}

/** ردیف‌های جدول روزها. */
export function deskDayRows(model) {
  const rv = new Map((model?.rvDays?.days || []).map((d) => [d.date, d]));
  return (model?.days || []).map((d) => {
    const stats = dayStats(d.points);
    return {
      date: d.date, source: d.source, provisional: d.provisional, contracts: d.contracts,
      samples: valid(d.points).length, moments: d.points.length,
      open: stats?.open ?? NaN, close: stats?.last ?? NaN, high: stats?.high ?? NaN, low: stats?.low ?? NaN,
      change: stats?.change ?? NaN, rv: rv.get(d.date)?.rvIntradayPct ?? NaN,
      why: d.why,
    };
  }).reverse();
}

/**
 * الگوی ساعتی: برای هر لحظهٔ شبکه، میانگینِ «مقدار منهای بازگشایی همان
 * روز» در روزهای گذشته. روزِ بی‌بازگشایی کنار می‌رود.
 */
export function hourlyPattern(model, seconds = []) {
  const rows = (model?.prior || [])
    .map((d) => ({ d, open: openPoint(d.points, { open: model.openSec, skipSec: model.skipSec }) }))
    .filter((r) => r.open);
  return seconds.map((second) => {
    const deltas = rows.map(({ d, open }) => {
      const hit = second >= open.second ? valueAt(d.points, second) : null;
      return hit ? hit.value - open.value : NaN;
    }).filter(isNum);
    return { second, mean: mean(deltas), n: deltas.length };
  });
}

/**
 * سنجه‌های تلاطم برای دیده‌بان شرطی (`core/watch-rule.mjs`).
 *
 * مقدارهای درون‌روزی فقط وقتی هست که امروز زنده است: شرطی که روی «IV اکنون»
 * گذاشته شده نباید با عددِ آخرین جلسهٔ دیروز آتش کند. رتبه و صدک روزانه از
 * خلاصهٔ تب رتبه می‌آیند و برچسب تاریخ خودشان را دارند.
 */
export function volWatchValues(model) {
  const live = Boolean(model?.live && model.now);
  const pick = (value) => (live && isNum(value) ? value : NaN);
  return {
    ivNow: pick(model?.now?.value),
    ivChangeOpen: pick(model?.change),
    ivChangeYday: pick(model?.changeYday),
    ivSamePct: pick(model?.same?.percentile),
    ivp: isNum(model?.summary?.ivp) ? model.summary.ivp : NaN,
    ivr: isNum(model?.summary?.ivr) ? model.summary.ivr : NaN,
    live, second: live ? model.now.second : NaN,
  };
}

/** روزِ تقویمیِ چند روز معاملاتی پیش — بازه را گشاد می‌گیریم؛ سرور روزهای معاملاتی را برمی‌دارد. */
export function deskFrom(today, span) {
  const s = String(today);
  const d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
  d.setUTCDate(d.getUTCDate() - Math.ceil(Number(span) * 1.6) - 6);
  return Number(d.toISOString().slice(0, 10).replace(/-/g, ''));
}
