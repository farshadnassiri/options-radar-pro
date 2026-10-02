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
  transportPoints, dayClose, openPoint, valueAt, dayStats, sameTime, sameTimeSummary,
  intradayRealized, realizedSoFar,
} from './vol-intraday.mjs';

export const VOL_DESK_VERSION = 1;

const isNum = (value) => Number.isFinite(value);
const valid = (points) => (points || []).filter((pt) => isNum(pt.value));
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);

/** هر روزِ پاسخ → نقطه‌های شاخص با موتور یکتا. */
export function deskDays(api, ctx) {
  return (api?.days || []).map((day) => ({
    date: day.date, source: day.source, provisional: Boolean(day.provisional), why: day.why || '',
    contracts: Object.keys(day.contracts || {}).length,
    points: transportPoints(day, ctx),
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
export function deskModel({ days = [], today = 0, ctx, summary = null, compareDays = 10 } = {}) {
  const session = ctx.session;
  const skipSec = Math.max(0, Number(ctx.settings?.volOpenSkipMin ?? 15)) * 60;
  const tdy = Number(ctx.settings?.tradingDaysYr) > 0 ? Number(ctx.settings.tradingDaysYr) : 240;
  const withData = days.filter((d) => valid(d.points).length);
  const todayDay = days.find((d) => d.date === today) || null;
  const focus = todayDay && valid(todayDay.points).length ? todayDay : withData.at(-1) || null;
  const live = Boolean(focus && focus.date === today && focus.provisional);
  const prior = withData.filter((d) => focus && d.date < focus.date).slice(-compareDays);
  const prev = prior.at(-1) || null;

  const out = {
    version: VOL_DESK_VERSION, today, focus, live, prior, prev, days, openSec: session.open, skipSec,
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

/** ردیف‌های جدول «اکنون در برابر …». */
export function deskCompareRows(model) {
  if (!model?.now) return [];
  const now = model.now.value;
  const row = (label, value, note = '', extra = {}) => ({ label, value, diff: isNum(value) ? now - value : NaN, note, ...extra });
  const rows = [
    row(model.live ? 'اکنون' : 'پایان آخرین جلسه', now, model.live ? 'موقت؛ تا آخرین قاب ضبط' : ''),
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
