// ایستِ پخش خودکار تایم‌لاین — بند ۴ فاز ۹.
//
// پخش خودکار بدون ایست، بدترین شکلِ خودکارسازی است: کاربر دکمه را
// می‌زند، به صفحه نگاه می‌کند، و لحظه‌ای که قید ریسکش شکسته یا سودش به
// هدف رسیده از جلوی چشمش رد می‌شود. تا وقتی متوجه شود، جلسه ده پله جلوتر
// است و آن لحظه دیگر برنمی‌گردد — ساعت جلسه فقط به جلو می‌رود.
//
// سه مرز:
//
// **هیچ عددی اینجا حساب نمی‌شود.** پایش قیود، سود و زیان و پله‌های ممکن
// از موتورهای خودشان می‌آیند. این ماژول فقط می‌پرسد «آیا باید بایستد؟»
// و اگر بله، چرا. حساب‌کردنِ دوبارهٔ هر کدام یعنی روزی دو جواب متفاوت.
//
// **نامعلوم، ایست نیست.** پله‌ای که سود و زیانش معلوم نیست پخش را
// متوقف نمی‌کند؛ جدول و نمودار شکافش را نشان می‌دهند. ایست‌دادن روی هر
// شکاف یعنی پخش عملاً کار نمی‌کند.
//
// **هر ایست علت دارد.** توقفِ بی‌توضیح از نایستادن بدتر است: کاربر فکر
// می‌کند رابط خراب شده.

import { MISSION_REPLAY_GRAINS } from './portfolio-mission.mjs';
import { portfolioSessionPositions } from './portfolio-positions.mjs';

export const PORTFOLIO_PLAYBACK_VERSION = 1;

/**
 * سرعت‌های پخش.
 *
 * فاصلهٔ میان دو پله، نه ضریبی از زمان واقعی: هر پله یک واکشی و یک
 * ارزش‌گذاری کامل دارد و سرعت‌های خیلی تند فقط صف درست می‌کنند.
 */
export const PLAYBACK_SPEEDS = Object.freeze([
  { key: 'slow', label: 'آهسته', ms: 2500 },
  { key: 'normal', label: 'عادی', ms: 1200 },
  { key: 'fast', label: 'تند', ms: 500 },
]);

export const PLAYBACK_SPEED_BY_KEY = Object.freeze(
  Object.fromEntries(PLAYBACK_SPEEDS.map((row) => [row.key, row])),
);

export const PLAYBACK_HALT_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای پخش در کار نیست',
  notActive: 'فقط جلسهٔ فعال پخش می‌شود',
  sessionEnd: 'جلسه به پایان بازهٔ خودش رسید',
  blocked: 'هیچ پلهٔ زمانی از اینجا ممکن نیست',
  breach: 'قید ریسک شکسته است',
  target: 'سود سبد به هدف مأموریت رسید',
  expiry: 'لحظه به سررسید نزدیک‌ترین موقعیت باز رسید',
});

const num = (value) => Number(value);
const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const momentKey = (point) => {
  const date = finite(point?.date);
  const second = finite(point?.second);
  return date !== null && second !== null && date > 0 && second >= 0
    ? date * 100_000 + second : NaN;
};

/**
 * نزدیک‌ترین سررسید میان موقعیت‌های **باز**.
 *
 * از موقعیت‌های باز، نه از کل دفتر: موقعیتی که بسته شده سررسیدش دیگر
 * ایستی لازم ندارد، و شمردنش یعنی پخش سرِ تاریخی می‌ایستد که هیچ‌چیز در
 * آن معلق نیست.
 */
export function openExpiryDate(session) {
  const state = portfolioSessionPositions(session);
  if (!state.ok) return null;
  const dates = state.open
    .flatMap((row) => row.legs || [])
    .map((leg) => finite(leg?.expiry))
    .filter((value) => value !== null && value > 0);
  return dates.length ? Math.min(...dates) : null;
}

/**
 * پلهٔ پخش خودکار: همان تایم‌فریمی که کاربر برای بازپخش انتخاب کرده.
 *
 * پله‌ای تازه اختراع نمی‌شود و از فهرست دکمه‌های ساعت هم قرض گرفته نمی‌شود
 * — آن فهرست ۱۵ دقیقه و یک ساعت دارد و تایم‌فریمِ نیم‌ساعته یا پنج‌دقیقه‌ای
 * در آن نیست؛ نزدیک‌ترین پله را جایش گذاشتن یعنی جلسه با گامی جلو برود که
 * کاربر نخواسته. `stepPortfolioSession` خودش مشخصات پله را هم می‌پذیرد،
 * پس گامِ خودِ تایم‌فریم ساخته می‌شود.
 *
 * تایم‌فریم روزانه ثانیه ندارد؛ گامش یک **روز معاملاتی** است، نه صفر ثانیه.
 */
export function playbackStep(session) {
  const grain = session?.lockedMission?.replay?.grain ?? session?.mission?.replay?.grain;
  const row = MISSION_REPLAY_GRAINS[String(grain ?? '')];
  if (!row) return null;
  const key = `grain-${grain}`;
  return row.seconds > 0
    ? { key, label: row.label, seconds: row.seconds }
    : { key, label: row.label, days: 1 };
}

/**
 * آیا پخش خودکار باید همین‌جا بایستد؟
 *
 * `watch` خروجی `portfolioRiskWatch` است، `pnlRial` سود و زیان همین
 * لحظه از سری زمانی، و `clock` خروجی `portfolioClockView`. هیچ‌کدام
 * اینجا دوباره ساخته نمی‌شوند؛ نبودشان یعنی آن علت سنجیده نمی‌شود، نه
 * اینکه پاس شده باشد.
 */
export function portfolioPlaybackHalt(session, { watch = null, pnlRial = null, clock = null } = {}) {
  const reasons = [];
  const add = (code, detail = '') => reasons.push({
    code, why: PLAYBACK_HALT_REASONS[code], detail,
  });

  if (!session) {
    add('noSession');
    return { version: PORTFOLIO_PLAYBACK_VERSION, halt: true, reasons };
  }
  if (session.state !== 'active') {
    add('notActive', session.state === 'closed' ? 'جلسه بسته شده است' : '');
    return { version: PORTFOLIO_PLAYBACK_VERSION, halt: true, reasons };
  }

  const now = momentKey(session.now);
  const end = momentKey(session.end);
  if (Number.isFinite(now) && Number.isFinite(end) && now >= end) add('sessionEnd');

  // شکستن قید، نه نزدیک‌شدن به آن. «نزدیک» هشدار است و پخش را نمی‌ایستاند؛
  // اگر می‌ایستاند، هر جلسهٔ سفت‌قید عملاً پخش نمی‌شد.
  if (watch?.ok && num(watch.counts?.breached) > 0) {
    add('breach', `${watch.counts.breached} قید`);
  }

  const target = finite(session.lockedMission?.objective?.targetProfitRial);
  const pnl = finite(pnlRial);
  if (target !== null && pnl !== null && pnl >= target) {
    add('target', `${pnl} ریال در برابر هدف ${target} ریال`);
  }

  const expiry = openExpiryDate(session);
  const date = finite(session.now?.date);
  if (expiry !== null && date !== null && date >= expiry) add('expiry', String(expiry));

  if (clock && clock.anyEnabled === false) add('blocked', clock.blockedWhy || '');

  return { version: PORTFOLIO_PLAYBACK_VERSION, halt: reasons.length > 0, reasons };
}
