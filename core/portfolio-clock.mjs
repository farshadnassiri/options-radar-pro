// گام زمانی جلسه — برش سوم فاز ۵.
//
// همه‌چیز تا اینجا در **یک لحظه** اتفاق می‌افتاد: `session.now` همان
// لحظهٔ شروع بود و هیچ‌وقت جلو نمی‌رفت. ارزش‌گذاری و بستن و مدرک
// اجراپذیری همه هم‌لحظه بودند چون لحظه‌ای جز شروع وجود نداشت. بدون گام
// زمانی، «سفر زمانی» هنوز سفر نیست.
//
// پنج مرز:
//
// **قواعد تقویم اینجا دوباره نوشته نمی‌شوند.** `stepMoment` از پیش
// می‌داند پله چطور جلو می‌رود، پله‌ای که از پایان روز رد شود به ابتدای
// روز بعد منتقل می‌شود، و روزِ بی‌داده اصلاً روز معاملاتی نیست. قاعدهٔ
// دومِ تقویم یعنی روزی دو جواب متفاوت برای یک پله.
//
// **فقط به جلو.** لحظه‌ای که عقب‌تر یا برابر باشد رد می‌شود. دفتر رویداد
// از قبل زمان را به عقب نمی‌برد؛ ساعت هم نباید.
//
// **پایان جلسه مرز است نه پیشنهاد.** گامی که از آن رد شود انجام
// نمی‌شود — نه اینکه تا لبه کوتاه شود. کوتاه‌کردنِ بی‌صدا یعنی کاربر
// فکر می‌کند یک هفته جلو رفته و نرفته.
//
// **روزِ بی‌داده با روز قبل پر نمی‌شود.** پرش می‌شود یا گام رد می‌شود.
// پرکردنش یعنی ساختن قیمتی که آن روز وجود نداشت.
//
// **گام تراکنش نیست.** دفتر رویداد دست نمی‌خورد.

import {
  STEPS, STEP_BY_KEY, indexOfDay, momentKey, stepMoment,
} from './trading-calendar.mjs';

export const PORTFOLIO_CLOCK_VERSION = 1;

// پله‌ها از تقویم می‌آیند؛ فهرست دوم یعنی روزی یکی‌شان عوض می‌شود و
// رابط پله‌ای نشان می‌دهد که موتور نمی‌شناسد.
export const PORTFOLIO_STEPS = STEPS;

export const PORTFOLIO_CLOCK_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای بردن به جلو در کار نیست',
  notActive: 'فقط جلسهٔ فعال جلو می‌رود',
  missingMission: 'جلسه بدون مأموریت قفل‌شده ساعت ندارد',
  emptyCalendar: 'تقویم روز معاملاتی ندارد',
  unknownStep: 'این پله شناخته نمی‌شود',
  invalidNow: 'لحظهٔ جاری جلسه معتبر نیست',
  calendarEnd: 'تقویم به انتها رسیده و روز معاملاتی بعدی نیست',
  backwards: 'گام زمانی به عقب برنمی‌گردد',
  pastEnd: 'این گام از پایان جلسه رد می‌شود',
  notInCalendar: 'لحظهٔ تازه در تقویم داده ندارد',
});

const num = (value) => Number(value);

function fail(reason, detail = '', extra = {}) {
  return {
    version: PORTFOLIO_CLOCK_VERSION,
    ok: false,
    why: detail ? `${PORTFOLIO_CLOCK_REASONS[reason]} — ${detail}` : PORTFOLIO_CLOCK_REASONS[reason],
    reason,
    session: null,
    from: extra.from ?? null,
    to: extra.to ?? null,
    rolled: false,
    atEnd: Boolean(extra.atEnd),
  };
}

/**
 * جلسه را یک پله جلو می‌برد.
 *
 * `days` همان فهرست روزهای معاملاتیِ تقویم است — اینجا ساخته نمی‌شود تا
 * ماژول به منبع داده گره نخورد. `expiryDate` فقط برای پلهٔ «تا سررسید»
 * لازم است.
 *
 * جلسهٔ تازه برمی‌گردد؛ ورودی دست‌نخورده می‌ماند و دفتر رویدادش همان
 * دفتر است — نه رونوشتی که ممکن است روزی واگرا شود.
 */
export function stepPortfolioSession(session, step, { days = [], expiryDate = 0 } = {}) {
  if (!session) return fail('noSession');
  if (session.state !== 'active') return fail('notActive', session.state || '');
  if (!session.lockedMission) return fail('missingMission');
  if (!Array.isArray(days) || days.length === 0) return fail('emptyCalendar');

  const spec = typeof step === 'string' ? STEP_BY_KEY[step] : step;
  if (!spec) return fail('unknownStep', typeof step === 'string' ? step : '');

  const from = session.now;
  const fromKey = momentKey(from);
  if (!Number.isFinite(fromKey)) return fail('invalidNow');

  const next = stepMoment(days, from, spec, { expiryDate: num(expiryDate) || 0 });
  if (!next.ok) {
    return fail(next.end ? 'calendarEnd' : 'unknownStep', next.why,
      { from: { ...from }, atEnd: Boolean(next.end) });
  }

  const to = { date: next.date, second: next.second };
  const toKey = momentKey(to);
  // ساعت هم مثل دفتر، زمان را به عقب نمی‌برد.
  if (!(toKey > fromKey)) return fail('backwards', '', { from: { ...from }, to });
  // پایان جلسه مرز است: گام کوتاه نمی‌شود، انجام نمی‌شود.
  if (toKey > momentKey(session.end)) {
    return fail('pastEnd', '', { from: { ...from }, to, atEnd: true });
  }
  // روزِ بی‌داده با روز قبل پر نمی‌شود.
  if (indexOfDay(days, to.date) < 0) {
    return fail('notInCalendar', String(to.date), { from: { ...from }, to });
  }

  return {
    version: PORTFOLIO_CLOCK_VERSION,
    ok: true,
    why: '',
    reason: null,
    // دفتر رویداد همان دفتر است؛ گام تراکنش نیست.
    session: { ...session, now: { ...to } },
    from: { ...from },
    to,
    // «به روز بعد منتقل شد» چیزی است که کاربر باید بداند، نه جزئیات
    // داخلی: پله همان‌قدر که خواسته بود جلو نرفت.
    rolled: Boolean(next.rolled),
    atEnd: toKey === momentKey(session.end),
  };
}
