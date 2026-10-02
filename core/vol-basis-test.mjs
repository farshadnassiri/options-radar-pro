// آزمون مبنای زمان: کدام مبنا «پرش تعطیلی» نمی‌سازد؟
//
// اگر بازار زمان را فقط در جلسه‌ها بشمارد، قیمت اختیار از پنجشنبه‌وجمعه
// چیزی فرسوده نمی‌شود. آن‌وقت تلاطمی که با «روز تقویمی» ساخته شود، شنبه
// یک‌باره بالا می‌پرد (سه روز از عمر کم شده و قیمت تقریباً همان است) و
// تلاطمی که با «ثانیهٔ معاملاتی» ساخته شود، نمی‌پرد. اگر بازار تعطیلی را هم
// قیمت کند، وارونه. این ابزار همین را روی دادهٔ واقعی می‌سنجد: برای هر جفت
// جلسهٔ پیاپی، پرش «پایان دیروز → بازگشایی امروز» را در هر مبنا حساب می‌کند
// و میانگینِ پرش پس از تعطیلی را با پرش شب‌های عادی مقایسه می‌کند.
//
// مبنایی که این دو را به هم نزدیک‌تر کند، با رفتار قیمت‌گذاری بازار
// سازگارتر است. پیشنهاد است، نه حکم: چند هفته داده لازم است و پرش‌ها با
// خبرِ تعطیلی هم آمیخته‌اند.

import { intradayContext, transportPoints, openPoint, dayClose } from './vol-intraday.mjs';

const isNum = (value) => Number.isFinite(value);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);

function gapDays(a, b) {
  const t = (d) => Date.UTC(Math.trunc(d / 10000), Math.trunc((d % 10000) / 100) - 1, d % 100);
  return Math.round((t(b) - t(a)) / 86400000);
}

/** مبناهایی که سنجیده می‌شوند. */
export const BASIS_CANDIDATES = [
  { id: 'tradingSeconds', label: 'ثانیهٔ معاملاتی', over: { volTimeBasis: 'tradingSeconds' } },
  { id: 'offDay25', label: 'معاملاتی + ۰٫۲۵ روز تعطیل', over: { volTimeBasis: 'tradingPlusOffDay', volOffDayWeight: 0.25 } },
  { id: 'offDay50', label: 'معاملاتی + ۰٫۵ روز تعطیل', over: { volTimeBasis: 'tradingPlusOffDay', volOffDayWeight: 0.5 } },
  { id: 'calendarSeconds', label: 'ثانیهٔ تقویمی', over: { volTimeBasis: 'calendarSeconds' } },
  { id: 'calendarDays', label: 'روز تقویمی صحیح', over: { volTimeBasis: 'calendarDays' } },
];

/**
 * پرش‌های شبانه در یک مبنا. `days`: روزهای فرم انتقال به ترتیب تاریخ.
 * «پس از تعطیلی» یعنی فاصلهٔ تقویمی دو جلسه بیش از یک روز.
 */
export function basisJumps(days, ctx) {
  const skipSec = Math.max(0, Number(ctx.settings?.volOpenSkipMin ?? 15)) * 60;
  const series = days.map((day) => ({ date: day.date, points: transportPoints(day, ctx) }));
  const jumps = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = dayClose(series[i - 1].points);
    const open = openPoint(series[i].points, { open: ctx.session.open, skipSec });
    if (!prev || !open) continue;
    const gap = gapDays(series[i - 1].date, series[i].date);
    jumps.push({ from: series[i - 1].date, to: series[i].date, gap, offDays: gap - 1, jump: open.value - prev.value });
  }
  const normal = jumps.filter((j) => j.offDays === 0).map((j) => j.jump);
  const after = jumps.filter((j) => j.offDays > 0).map((j) => j.jump);
  return {
    jumps, normal: { n: normal.length, mean: mean(normal) }, afterOff: { n: after.length, mean: mean(after) },
    excess: isNum(mean(after)) && isNum(mean(normal)) ? mean(after) - mean(normal) : NaN,
  };
}

/** همهٔ مبناها، از کوچک‌ترین «اضافهٔ پرش تعطیلی» به بزرگ‌ترین. */
export function compareBases(days, settings = {}, { holidays = [], holidaysKnown = false } = {}) {
  return BASIS_CANDIDATES.map((candidate) => {
    const ctx = intradayContext(settings, { holidays, holidaysKnown, ...candidate.over });
    return { ...candidate, ...basisJumps(days, ctx) };
  }).sort((a, b) => (isNum(a.excess) ? Math.abs(a.excess) : Infinity) - (isNum(b.excess) ? Math.abs(b.excess) : Infinity));
}
