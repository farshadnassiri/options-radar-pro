// ۳۰۹. ساعت تلاطم — زمان تا سررسید برای مسیر درون‌روزی
//
// تلاطم ضمنیِ درون‌روزی با «روز تقویمی صحیح» دو اعوجاج دارد: سراشیبیِ
// ساختگی در طول روز (قیمت فرسوده می‌شود، T نه) و پرشِ شنبه (T سه روز کم
// می‌شود بی هیچ جلسه‌ای). `core/vol-clock.mjs` زمان را از ثانیهٔ معاملاتی
// هم می‌سازد — فقط برای همین مسیر.
//
// آزمون اصلی (آ۱): بازار ساختگی با تلاطم ثابت ۶۰٪ که قیمتش با **زمان
// معاملاتی** فرسوده می‌شود، شش روز معاملاتی با یک فاصلهٔ چهارشنبه تا شنبه و
// یک تعطیل میان‌هفته. با مبنای معاملاتی، تلاطم در همهٔ لحظه‌ها ۶۰٪ می‌ماند؛
// با روز تقویمی صحیح، پرشِ شنبه به اندازهٔ نظری‌اش دیده می‌شود — یعنی آزمون
// دندان دارد.

import { check, group, near, readSrc } from '../harness.mjs';
import { bsPrice, impliedVol } from '../../core/bs.mjs';
import { defaults, sanitize } from '../../core/settings.mjs';
import { sessionOf, volCalendar, volTime, volClockParams, parseHolidays } from '../../core/vol-clock.mjs';

const settings = defaults();
const OPEN = 9 * 3600, CLOSE = 12 * 3600 + 30 * 60;

group('۳۰۹-الف. جلسه و تقویم');
{
  const s = sessionOf(settings);
  check('جلسه از «ساعات بازار»: ۰۹:۰۰ تا ۱۲:۳۰، ۱۲٬۶۰۰ ثانیه', s.open === OPEN && s.close === CLOSE && s.length === 12600);
  check('روزهای کاری: شنبه تا چهارشنبه', [6, 0, 1, 2, 3].every((d) => s.weekdays.has(d)) && !s.weekdays.has(4) && !s.weekdays.has(5));
  check('ساعت دیگر از تنظیمات خوانده می‌شود', sessionOf({ openHHMM: '08:30', closeHHMM: '12:00' }).length === 12600);
  const cal = volCalendar({ settings, holidays: ['20261004'], known: true });
  check('پنجشنبه و جمعه و تعطیل رسمی روز معاملاتی نیستند',
    !cal.isTradingDay(20261001) && !cal.isTradingDay(20261002) && !cal.isTradingDay(20261004) && cal.isTradingDay(20261003));
  check('شمار روزهای میانی: معاملاتی و تعطیل جدا', (() => {
    const b = cal.between(20260930, 20261007);   // ۱ تا ۶ اکتبر: پنج، جمعه، شنبه، یک‌شنبه(تعطیل)، دوشنبه، سه‌شنبه
    return b.trading === 3 && b.offDays === 3;
  })());
  check('بی فهرست تعطیلات، تقویم آینده «فرضی» است', volCalendar({ settings }).assumed === true && cal.assumed === false);
  const parsed = parseHolidays({ holidays: [{ date: '1405/07/13' }, { date: '۱۴۰۵/۰۷/۱۳' }, { date: '2026-10-21' }, { date: 'xx' }] });
  check('فهرست تعطیلات: جلالی (رقم فارسی هم) و میلادی، ردیف نامعتبر شمرده می‌شود',
    parsed.ok && parsed.holidays.join(',') === '20261005,20261021' && parsed.dropped === 1, parsed.holidays.join('،'));
  check('تعطیل جلالی در تقویم هم می‌نشیند', !volCalendar({ settings, holidays: ['1405/07/13'], known: true }).isTradingDay(20261005));
  check('شکل ناشناخته: «نامعلوم»، نه خالیِ معتبر', parseHolidays({ x: 1 }).ok === false);
}

group('۳۰۹-ب. زمان تا سررسید در یک لحظه');
{
  const cal = volCalendar({ settings, known: true });
  const opt = { settings, calendar: cal };
  const wedOpen = volTime({ date: 20260930, second: OPEN }, 20261014, opt);
  const wedMid = volTime({ date: 20260930, second: OPEN + 6300 }, 20261014, opt);
  const wedClose = volTime({ date: 20260930, second: CLOSE }, 20261014, opt);
  const satOpen = volTime({ date: 20261003, second: OPEN }, 20261014, opt);
  check('درون روز زمان معاملاتی کم می‌شود — نیم جلسه', wedOpen.tradingSeconds - wedMid.tradingSeconds === 6300);
  check('از پایان چهارشنبه تا آغاز شنبه زمان معاملاتی ثابت است', wedClose.tradingSeconds === satOpen.tradingSeconds);
  check('ولی روز تقویمی صحیح سه روز می‌پرد', wedClose.days - satOpen.days === 3);
  // شنبه ۳ تا چهارشنبه ۱۴ اکتبر: ده جلسهٔ کامل (۳ تا ۷ و ۱۰ تا ۱۴).
  check('شمار جلسه‌ها: از آغاز شنبه تا پایان سررسیدِ چهارشنبهٔ بعد، ۱۰ جلسه', satOpen.tradingSeconds === 10 * 12600, `${satOpen.tradingSeconds / 12600}`);
  check('سال = ثانیهٔ معاملاتی ÷ (روز معاملاتی سال × طول جلسه)', near(satOpen.years, 10 / 240, 1e-12));
  const old = volTime({ date: 20261003, second: OPEN }, 20261014, { ...opt, basis: 'calendarDays' });
  check('مبنای «روز تقویمی صحیح» همان رفتار پیشین است: روز ÷ روز سال', near(old.years, 11 / 365, 1e-12));
  const cs = volTime({ date: 20261003, second: OPEN }, 20261014, { ...opt, basis: 'calendarSeconds' });
  check('ثانیهٔ تقویمی تا پایان جلسهٔ روز سررسید', near(cs.years, (11 * 86400 + (CLOSE - OPEN)) / (365 * 86400), 1e-12));
  const w0 = volTime({ date: 20261003, second: OPEN }, 20261014, { ...opt, basis: 'tradingPlusOffDay', offDayWeight: 0 });
  check('وزن صفرِ روز تعطیل همان ثانیهٔ معاملاتی است', near(w0.years, satOpen.years, 1e-12));
  const w1 = volTime({ date: 20261003, second: OPEN }, 20261014, { ...opt, basis: 'tradingPlusOffDay', offDayWeight: 1 });
  check('وزن یک: هر روز تعطیل (پنجشنبه و جمعهٔ میانی) یک جلسه', w1.offDays === 2 && near(w1.years, 12 / 365, 1e-12), `${w1.offDays}`);
  const expiryDay = volTime({ date: 20261014, second: OPEN + 3600 }, 20261014, opt);
  check('روز سررسید: تا پایان جلسه زمان هست', expiryDay.tradingSeconds === 12600 - 3600 && expiryDay.years > 0);
  const after = volTime({ date: 20261014, second: CLOSE + 60 }, 20261014, opt);
  check('پس از پایان عمر: «سررسیدشده»، نه زمانِ صفر', after.why === 'expired' && !Number.isFinite(after.years));
  const start = volTime({ date: 20261014, second: OPEN + 60 }, 20261014, { ...opt, expiryMoment: 'sessionStart' });
  check('پایان عمر در آغاز جلسه: روز سررسید دیگر زمانی ندارد', start.why === 'expired');
  check('بی تقویم: پرچم فرضی', volTime({ date: 20261003, second: OPEN }, 20261014, { settings }).assumedCalendar === true);
}

group('۳۰۹-ج. آ۱ — بازار با تلاطم ثابت، روی زمان معاملاتی');
{
  // شش روز معاملاتی: سه‌شنبه، چهارشنبه، (پنجشنبه و جمعه)، شنبه، یک‌شنبهٔ
  // تعطیل، دوشنبه، سه‌شنبه، چهارشنبه. قیمت قرارداد با T معاملاتی ساخته
  // می‌شود — همان فرضی که این ماژول برای بازار می‌کند.
  const holidays = ['20261004'];
  const cal = volCalendar({ settings, holidays, known: true });
  const days = [20260929, 20260930, 20261003, 20261005, 20261006, 20261007];
  const expiry = 20261021;
  const S = 10000, K = 10000, sigma = 0.6;
  const series = { trading: [], calendar: [] };
  for (const date of days) {
    for (let second = OPEN + 900; second <= CLOSE; second += 900) {
      const t = volTime({ date, second }, expiry, { settings, calendar: cal });
      const price = bsPrice('call', S, K, t.years, settings.rFree, 0, sigma);
      const solve = (years) => impliedVol('call', price, S, K, years, settings.rFree, 0) * 100;
      series.trading.push({ date, second, iv: solve(t.years) });
      series.calendar.push({ date, second, iv: solve(volTime({ date, second }, expiry, { settings, calendar: cal, basis: 'calendarDays' }).years) });
    }
  }
  const spread = (list) => Math.max(...list.map((p) => p.iv)) - Math.min(...list.map((p) => p.iv));
  check('مبنای معاملاتی: تلاطم در همهٔ لحظه‌ها ۶۰٪ (رواداری ۰٫۱ واحد)', spread(series.trading) < 0.1, `دامنه ${spread(series.trading).toFixed(5)}`);
  const open = series.trading.filter((p) => p.date === 20260930);
  check('و تغییر از بازگشایی در طول روز صفر', Math.abs(open.at(-1).iv - open[0].iv) < 0.1);
  check('مبنای تقویمی: درون روز سراشیبیِ ساختگی دارد', (() => {
    const day = series.calendar.filter((p) => p.date === 20260930);
    return day[0].iv - day.at(-1).iv > 1;
  })());
  // پرشِ نظری شنبه: قیمت ثابت (زمان معاملاتی ثابت)، ولی T تقویمی سه روز کم شد.
  const wedClose = series.calendar.filter((p) => p.date === 20260930).at(-1);
  const satFirst = series.calendar.find((p) => p.date === 20261003);
  const tWed = volTime({ date: 20260930, second: CLOSE }, expiry, { settings, calendar: cal });
  const tSat = volTime({ date: 20261003, second: OPEN + 900 }, expiry, { settings, calendar: cal });
  const price = (t) => bsPrice('call', S, K, t.years, settings.rFree, 0, sigma);
  const theory = impliedVol('call', price(tSat), S, K, 18 / 365, settings.rFree, 0) * 100
    - impliedVol('call', price(tWed), S, K, 21 / 365, settings.rFree, 0) * 100;
  check('مبنای تقویمی: پرش شنبه به اندازهٔ نظری', near(satFirst.iv - wedClose.iv, theory, 1e-6) && theory > 3,
    `${(satFirst.iv - wedClose.iv).toFixed(3)} واحد`);
  check('روز تعطیل میان‌هفته هم زمانی برنمی‌دارد', (() => {
    const sunAbsent = !series.trading.some((p) => p.date === 20261004);
    const satEnd = volTime({ date: 20261003, second: CLOSE }, expiry, { settings, calendar: cal });
    const monOpen = volTime({ date: 20261005, second: OPEN }, expiry, { settings, calendar: cal });
    return sunAbsent && satEnd.tradingSeconds === monOpen.tradingSeconds;
  })());
}

group('۳۰۹-د. تنظیمات و مرز مسیر');
{
  check('پیش‌فرض مسیر درون‌روزی: ثانیهٔ معاملاتی، پایان جلسه، افق ۲۰ روز معاملاتی',
    settings.volTimeBasis === 'tradingSeconds' && settings.volExpiryMoment === 'sessionEnd' && settings.volTargetTradingDays === 20);
  check('مبنای ناشناخته به پیش‌فرض برمی‌گردد و وزن در کران می‌ماند',
    sanitize({ volTimeBasis: 'x' }).volTimeBasis === 'tradingSeconds' && sanitize({ volOffDayWeight: 9 }).volOffDayWeight === 1);
  check('پارامترهای ساعت از تنظیمات', volClockParams({ volTimeBasis: 'calendarDays', volOffDayWeight: 0.3 }).basis === 'calendarDays'
    && volClockParams({}).basis === 'tradingSeconds');
  check('شاخص روزانهٔ موجود همان روز تقویمی را می‌خواند (پیش‌فرضش عوض نشد)',
    readSrc('../core/vol-rank.mjs').includes("const dte = daysBetween(date, obs?.expiry);")
    && !readSrc('../core/vol-rank.mjs').includes('vol-clock'));
  check('موتور بلک‌شولز دست نخورد', !readSrc('../core/bs.mjs').includes('vol-clock'));
  check('تقویم آینده از data/holidays.json، با نمونهٔ شکل', readSrc('../server/server.mjs').includes("if (p === '/api/vol/calendar') {")
    && readSrc('../data/holidays.example.json').includes('"holidays"'));
}
