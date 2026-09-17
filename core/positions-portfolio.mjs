// نگاهِ سبد — همان چیزی که جدولِ ردیف‌به‌ردیفِ موقعیت‌ها نمی‌گفت.
//
// تب موقعیت‌ها یونانیِ **هر موقعیت** را داشت و کاربر باید پنج ستون را در
// ذهنش جمع می‌زد تا بفهمد کلِ دفترش به حرکتِ بازار چقدر حساس است. سه پرسش
// که جدول جوابشان را نداشت و همه‌شان با یک نگاه لازم‌اند:
//
//   «اگر پایه ۱٪ بالا برود، کلِ دفترم چقدر جابه‌جا می‌شود؟»   → یونانیِ سبد
//   «کدام هفته چند موقعیت سررسید می‌شود و چقدر وجه آزاد می‌کند؟» → تقویم
//   «کدام موقعیت دارد به سربه‌سری‌اش نزدیک می‌شود؟»            → اتاقِ سربه‌سر
//
// ═══ قاعدهٔ مشترکِ هر سه ═══
//
// جمعِ نصفه ساخته نمی‌شود. اگر حتی یک موقعیت یونانی نداشته باشد — چون یک
// پایش تلاطم ضمنی ندارد — یونانیِ سبد `NaN` است و نامِ همان موقعیت گفته
// می‌شود. عددی که چهار موقعیت از پنج تا را جمع بزند، همیشه از واقعیت
// کوچک‌تر است و هیچ‌جا نمی‌گوید چرا؛ و کاربر آن را «ریسکم کم است» می‌خواند.

import { num } from './num.mjs';
import { GREEKS } from './monitor.mjs';
import { breakevenMetrics } from './evaluate.mjs';
import { daysBetween, historyDateLabel, normalizeHistoryDate } from './history.mjs';
import { positionExpiry } from './position-track.mjs';

export const PORTFOLIO_SUMMARY_VERSION = 1;

export const SUMMARY_REASONS = {
  none: 'موقعیت بازی برای جمع‌زدن نیست',
  partial: 'دست‌کم یک موقعیت یونانی کامل ندارد، پس جمعِ سبد ساخته نمی‌شود',
  noSpot: 'قیمت پایه در دسترس نیست',
  noBreakeven: 'این موقعیت سربه‌سری ندارد',
  noExpiry: 'سررسیدی برای این موقعیت ثبت نشده',
  noCommonDay: 'هیچ روزی نیست که همهٔ موقعیت‌های باز در آن قیمتِ کامل داشته باشند',
};

/**
 * آستانه‌های «اتاقِ سربه‌سر».
 *
 * این دو عدد قضاوت‌اند، نه اندازه‌گیری — پس همین‌جا با نام می‌نشینند تا در
 * ده جای رابط ده جور تکرار نشوند. مبنایشان حرکتِ روزانهٔ متعارفِ یک نمادِ
 * پایه در این بازار است: جابه‌جاییِ سه‌درصدی در یک روز عادی است، پس فاصلهٔ
 * کمتر از آن یعنی «یک روز تا سربه‌سر»؛ و هشت درصد تقریباً یک هفته.
 */
export const BE_DANGER_PCT = 3;
export const BE_WARN_PCT = 8;

/**
 * یونانیِ کل سبد — جمعِ وزن‌دارِ یونانیِ هر موقعیت.
 *
 * `entries` فهرستِ `{ title, qty, greeks, incomplete }` است: `greeks` همان
 * چیزی است که `monitorSnapshot` برای **یک دست** می‌دهد و `qty` تعدادِ
 * قرارداد. ضرب اینجا انجام می‌شود، نه در فراخوان — وگرنه هر صفحه‌ای که
 * جمع می‌خواهد باید خودش یادش باشد، و یکی‌شان یادش نمی‌ماند.
 */
export function portfolioGreeks(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const blank = Object.fromEntries(GREEKS.map(({ key }) => [key, NaN]));
  if (!list.length) return { available: false, reason: SUMMARY_REASONS.none, greeks: blank, counted: 0, missing: [] };
  const missing = list
    .filter((item) => item.incomplete === true || !item.greeks)
    .map((item) => String(item.title || 'موقعیت بی‌عنوان'));
  if (missing.length) return { available: false, reason: SUMMARY_REASONS.partial, greeks: blank, counted: 0, missing };

  const greeks = {};
  for (const { key } of GREEKS) {
    let sum = 0;
    let ok = true;
    for (const item of list) {
      const value = num(item.greeks?.[key], NaN);
      if (!Number.isFinite(value)) { ok = false; break; }
      sum += value * Math.max(1, num(item.qty, 1));
    }
    greeks[key] = ok ? sum : NaN;
  }
  const anyMissing = GREEKS.some(({ key }) => !Number.isFinite(greeks[key]));
  return {
    available: !anyMissing,
    reason: anyMissing ? SUMMARY_REASONS.partial : '',
    greeks, counted: list.length, missing: [],
  };
}

/**
 * تقویم سررسید — کدام روز چند موقعیت تمام می‌شود.
 *
 * `marginOf(pos)` را فراخوان می‌دهد، چون وجه تضمینِ امروز از مظنهٔ زندهٔ
 * همان صفحه می‌آید و این ماژول قیمت نمی‌گیرد. اگر حتی یکی از موقعیت‌های آن
 * روز وجهش نامعلوم باشد، وجهِ آن روز هم نامعلوم می‌ماند — نه اینکه بقیه
 * جمع شوند و عدد کوچک‌تری بسازند.
 *
 * موقعیتِ بی‌سررسیدِ ثبت‌شده در `unknown` می‌نشیند، نه در روزِ صفر.
 */
export function expiryCalendar(positions = [], {
  today = 0, horizonDays = 60, marginOf = () => NaN,
} = {}) {
  const at = normalizeHistoryDate(today);
  const byDate = new Map();
  const unknown = [];
  for (const pos of positions || []) {
    const expiry = positionExpiry(pos);
    if (!expiry) { unknown.push(String(pos?.title || 'موقعیت بی‌عنوان')); continue; }
    if (!byDate.has(expiry)) byDate.set(expiry, []);
    byDate.get(expiry).push(pos);
  }
  const all = [...byDate.keys()].sort((a, b) => a - b).map((date) => {
    const group = byDate.get(date);
    const margins = group.map((pos) => num(marginOf(pos), NaN));
    const marginKnown = margins.every((value) => Number.isFinite(value));
    const left = at ? daysBetween(at, date) : NaN;
    return {
      date, label: historyDateLabel(date),
      daysLeft: Number.isFinite(left) ? left : NaN,
      count: group.length,
      titles: group.map((pos) => String(pos?.title || 'موقعیت بی‌عنوان')),
      margin: marginKnown ? margins.reduce((sum, value) => sum + value, 0) : NaN,
      marginKnown,
    };
  });
  // افقِ زمانی فقط **نمایش** را می‌برد، نه شمارش را: «۳ موقعیت دورتر از
  // افق» خودش خبر است و نباید بی‌صدا حذف شود.
  const within = horizonDays > 0
    ? all.filter((day) => !Number.isFinite(day.daysLeft) || day.daysLeft <= horizonDays)
    : all;
  const beyond = all.length - within.length;
  return {
    version: PORTFOLIO_SUMMARY_VERSION,
    days: within, beyond, unknown,
    total: all.reduce((sum, day) => sum + day.count, 0),
  };
}

/**
 * اتاقِ سربه‌سر — پایه چند درصد تا نزدیک‌ترین سربه‌سری فاصله دارد.
 *
 * علامتش جهت را می‌گوید: مثبت یعنی پایه **بالای** سربه‌سری است. `roomPct`
 * اندازه است و همان چیزی که رنگ از آن می‌آید، چون «سه درصد پایین‌تر» و
 * «سه درصد بالاتر» یک‌اندازه نزدیک‌اند.
 */
export function breakevenRoom(spot, breakevens = []) {
  const S = num(spot, NaN);
  if (!(S > 0)) return { available: false, reason: SUMMARY_REASONS.noSpot, roomPct: NaN, distPct: NaN, level: NaN, tone: '' };
  const metrics = breakevenMetrics(breakevens, S);
  if (!Number.isFinite(metrics.beNear)) {
    return { available: false, reason: SUMMARY_REASONS.noBreakeven, roomPct: NaN, distPct: NaN, level: NaN, tone: '' };
  }
  const roomPct = metrics.beRoomPct;
  return {
    available: true, reason: '',
    level: metrics.beNear,
    distPct: metrics.beDistPct,
    roomPct,
    side: metrics.beDistPct > 0 ? 'above' : (metrics.beDistPct < 0 ? 'below' : 'at'),
    tone: roomPct < BE_DANGER_PCT ? 'danger' : (roomPct < BE_WARN_PCT ? 'warn' : 'ok'),
    count: metrics.beCount,
  };
}

/** جملهٔ فارسیِ اتاقِ سربه‌سر — یک‌بار نوشته می‌شود تا در دو صفحه دو جور نباشد. */
export function breakevenRoomText(room) {
  if (!room?.available) return room?.reason || SUMMARY_REASONS.noBreakeven;
  const where = room.side === 'above' ? 'بالای' : (room.side === 'below' ? 'زیر' : 'روی');
  if (room.tone === 'danger') return `پایه ${where} نزدیک‌ترین سربه‌سری است و کمتر از ${BE_DANGER_PCT}٪ فاصله دارد`;
  if (room.tone === 'warn') return `پایه ${where} نزدیک‌ترین سربه‌سری است، با کمتر از ${BE_WARN_PCT}٪ فاصله`;
  return `پایه ${where} نزدیک‌ترین سربه‌سری است، با فاصلهٔ راحت`;
}

/**
 * منحنیِ سود و زیانِ کلِ سبد، روی یک محور.
 *
 * ═══ چرا پنجرهٔ مشترک، و نه «هرچه هست» ═══
 *
 * جمع‌زدنِ سودِ چند موقعیت فقط وقتی معنی دارد که هر عضوِ جمع در آن روز
 * **وجود داشته باشد**. اگر موقعیتی که هفتهٔ پیش باز شده در روزهای قبلش صفر
 * شمرده شود، منحنی یک پرشِ ساختگی در روزِ ورودش نشان می‌دهد که هیچ ربطی به
 * بازار ندارد — و کاربر آن را «آن روز سود کردم» می‌خواند.
 *
 * پس منحنی از **دیرترین روزِ ورود** شروع می‌شود. روزهای پیش از آن حذف
 * نمی‌شوند؛ در `from` و `skippedBefore` صریح اعلام می‌شوند تا کاربر بداند
 * چرا منحنی‌اش کوتاه‌تر از قدیمی‌ترین موقعیتش است.
 *
 * و در همان پنجره، روزی که حتی یک موقعیت قیمتِ کامل ندارد **نقطه نمی‌شود**
 * — با نامِ همان موقعیت در `gaps`. همان قاعدهٔ «جمعِ نصفه ساخته نمی‌شود»،
 * این‌بار روی محور زمان.
 */
export function portfolioDailySeries(entries = []) {
  const list = (Array.isArray(entries) ? entries : []).filter((item) => item && item.series);
  if (!list.length) return { version: PORTFOLIO_SUMMARY_VERSION, points: [], gaps: [], from: 0, to: 0, skippedBefore: 0, reason: SUMMARY_REASONS.none };

  // شروعِ پنجره: دیرترین روزِ ورود. موقعیتی که تاریخ ورودش ثبت نشده، از
  // نخستین نقطهٔ سریِ خودش شروع می‌شود — همان روزی که برایش داده داریم.
  const startOf = (item) => {
    const entry = normalizeHistoryDate(item.entryDate);
    if (entry) return entry;
    const first = item.series.points?.[0]?.date;
    return num(first, 0);
  };
  const starts = list.map(startOf).filter((date) => date > 0);
  const from = starts.length ? Math.max(...starts) : 0;

  const indexes = list.map((item) => new Map((item.series.points || []).map((point) => [point.date, point])));
  const dates = new Set();
  for (const index of indexes) for (const date of index.keys()) dates.add(date);
  for (const item of list) for (const gap of item.series.gaps || []) dates.add(gap.date);

  const ordered = [...dates].sort((a, b) => a - b);
  const skippedBefore = ordered.filter((date) => from && date < from).length;
  const window = ordered.filter((date) => !from || date >= from);

  const points = [];
  const gaps = [];
  for (const date of window) {
    const missing = list
      .map((item, at) => (indexes[at].has(date) ? null : String(item.title || 'موقعیت بی‌عنوان')))
      .filter(Boolean);
    if (missing.length) { gaps.push({ date, missing }); continue; }
    const total = list.reduce((sum, item, at) => sum + num(indexes[at].get(date).pnlTotal), 0);
    points.push({ date, pnlTotal: total, counted: list.length });
  }
  return {
    version: PORTFOLIO_SUMMARY_VERSION,
    points, gaps, skippedBefore,
    from, to: points.length ? points[points.length - 1].date : 0,
    counted: list.length,
    reason: points.length ? '' : SUMMARY_REASONS.noCommonDay,
  };
}
