// آزمون آخر هفته: کدام مبنای زمان با قیمت‌گذاری بازار سازگار است؟
//
//   node tools/vol-weekend-test.mjs --ua <کد پایه> [--from 20260801] [--to 20260930] [--mode trades]
//
// سرور باید روشن باشد (`PORT`، پیش‌فرض ۸۷۸۷). روزهای بازه از
// `/api/vol/intraday` خوانده می‌شوند (ضبط زنده، یا بازسازی‌شده؛ روزهای
// ساخته‌نشده با `--build` ساخته می‌شوند و هزینه‌شان پیش از آن چاپ می‌شود).
// برای هر مبنا، میانگین پرش «پایان جلسهٔ قبل → بازگشایی» پس از تعطیلی با
// شب‌های عادی مقایسه می‌شود (`core/vol-basis-test.mjs`). مبنایی که اضافهٔ
// پرشش به صفر نزدیک‌تر است، اول می‌آید.
//
// خروج ۰ نتیجه دارد · ۱ دادهٔ کافی نبود (کمتر از دو پرش از هر نوع) · ۲ سرور نبود.

import { compareBases } from '../core/vol-basis-test.mjs';

const args = process.argv.slice(2);
const flag = (name, def = null) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : def;
};
const base = `http://127.0.0.1:${process.env.PORT || 8787}`;
const fa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const f2 = (v) => (Number.isFinite(v) ? fa(v.toFixed(2)) : '—');
const ua = flag('ua');
if (!ua) { console.error('--ua <کد پایه> لازم است.'); process.exit(2); }
const today = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, ''));
const to = flag('to', String(today));
const back = (d, days) => {
  const t = new Date(Date.UTC(Math.trunc(d / 10000), Math.trunc((d % 10000) / 100) - 1, d % 100) - days * 86400000);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};
const from = flag('from', String(back(Number(to), 60)));
const mode = flag('mode', 'trades');

let settings, calendar, body;
try {
  settings = await (await fetch(`${base}/api/settings`)).json();
  calendar = await (await fetch(`${base}/api/vol/calendar`)).json();
  body = await (await fetch(`${base}/api/vol/intraday?ua=${ua}&from=${from}&to=${to}&grain=m15&mode=${mode}${args.includes('--build') ? '&build=1' : ''}`)).json();
} catch (e) {
  console.error(`سرور در ${base} در دسترس نیست: ${e.message}`);
  process.exit(2);
}
if (body.error) { console.error(body.error); process.exit(2); }
if (body.pending) console.log(`${fa(body.pending)} روز ساخته نشده (حدود ${fa(body.cost.requests)} درخواست)${args.includes('--build') ? ' — ساخت آغاز شد؛ چند دقیقهٔ دیگر دوباره اجرا کنید' : ' — با --build بسازید'}`);
if (!calendar.known) console.log('⚠ data/holidays.json نیست: تعطیلی رسمی وسط هفته «روز کاری» شمرده می‌شود و پرش آن روز در دستهٔ «شب عادی» می‌افتد.');
const days = body.days.filter((d) => d.moments?.length && !d.provisional);
console.log(`\n${fa(days.length)} جلسهٔ بسته‌شده با داده (${fa(days.filter((d) => d.source === 'record').length)} ضبط زنده)\n`);
const rows = compareBases(days, settings, { holidays: calendar.holidays || [], holidaysKnown: Boolean(calendar.known) });
console.log('مبنا                             پرش شب عادی (n)     پرش پس از تعطیلی (n)     اضافه');
for (const r of rows) {
  console.log(`${r.label.padEnd(32)} ${f2(r.normal.mean).padStart(8)} (${fa(r.normal.n)})      ${f2(r.afterOff.mean).padStart(8)} (${fa(r.afterOff.n)})      ${f2(r.excess)}`);
}
const enough = rows[0] && rows[0].normal.n >= 2 && rows[0].afterOff.n >= 2;
console.log(enough
  ? `\nسازگارترین مبنا با این داده: «${rows[0].label}». برای تنظیمش: تنظیمات › تلاطم › مبنای زمان تلاطم درون‌روزی.`
  : '\nدادهٔ کافی نیست: دست‌کم دو پرش شب عادی و دو پرش پس از تعطیلی لازم است.');
process.exit(enough ? 0 : 1);
