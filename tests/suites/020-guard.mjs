// ۱۸. نگهبان مرز سرور
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import path from 'node:path';
import { check, group } from '../harness.mjs';
import {
  BodyTooLarge, historicalTradesPath, parseInsList, readBody, safeStaticPath, validCompactDate, validIns,
} from '../../server/guard.mjs';


group('۱۸. نگهبان مرز سرور');
{
  const ROOT = path.resolve('C:/x/options-radar');
  const ok = (p) => safeStaticPath(ROOT, p);

  // ——— مسیر مجاز ———
  check('ریشه به صفحه اصلی می‌رود', ok('/') === path.join(ROOT, 'ui', 'index.html'), `${ok('/')}`);
  check('فایل معمولی زیر ریشه قبول است', ok('/ui/style.css') === path.join(ROOT, 'ui', 'style.css'));
  check('مسیر تودرتو قبول است', ok('/ui/tabs/backtest.mjs') === path.join(ROOT, 'ui', 'tabs', 'backtest.mjs'));

  // ——— همان باگی که این گروه برایش نوشته شد ———
  // مقایسه رشته‌ای startsWith، پوشه هم‌نام‌شروع کنار ریشه را رد نمی‌کرد
  check('پوشه هم‌نام‌شروع کنار ریشه رد می‌شود',
    ok('/../options-radar-private/secret.env') === null,
    `${ok('/../options-radar-private/secret.env')}`);

  // ——— عبور از ریشه ———
  check('بالا رفتن ساده رد می‌شود', ok('/../../etc/passwd') === null);
  check('بالا رفتن از میان مسیر رد می‌شود', ok('/ui/../../etc/passwd') === null);
  check('رمزگشایی درصدی هم گرفته می‌شود', ok('/%2e%2e%2f%2e%2e%2fetc%2fpasswd') === null,
    `${ok('/%2e%2e%2f%2e%2e%2fetc%2fpasswd')}`);
  check('رمزگشایی درصدی نیمه‌کاره رد می‌شود', ok('/%2e%2e/secret') === null);
  check('درصد خراب، خطا نمی‌دهد و رد می‌شود', ok('/%zz') === null);
  check('بایت صفر رد می‌شود', ok('/ui/style.css\0.png') === null);
  check('خود ریشه فایل نیست', ok('/..') === null);
  check('ورودی غیرمتنی رد می‌شود', safeStaticPath(ROOT, null) === null);

  // ——— کد ابزار ———
  check('کد رقمی قبول است', validIns('17914401791772679'));
  check('کد خالی رد می‌شود', !validIns(''));
  check('کد با عبور از مسیر رد می‌شود', !validIns('123/../GetSomethingElse'));
  check('کد با نقطه رد می‌شود', !validIns('12.3'));
  check('کد با حرف رد می‌شود', !validIns('12a3'));
  check('کد با فاصله رد می‌شود', !validIns(' 123'));
  check('کد بیش از حد بلند رد می‌شود', !validIns('9'.repeat(33)));
  check('عدد به‌جای رشته رد می‌شود', !validIns(123));
  check('تاریخ فشرده معتبر برای مسیر ریزمعامله پذیرفته می‌شود', validCompactDate('20260802'));
  check('تاریخ کوتاه یا غیررقمی برای مسیر ریزمعامله رد می‌شود', !validCompactDate('1405/05/11') && !validCompactDate('2026080x'));
  check('مسیر ریزمعامله از endpoint تاریخی Trade ساخته می‌شود', historicalTradesPath('123456', '20260802') === '/Trade/GetTradeHistory/123456/20260802/true');
  check('مسیر ریزمعامله با کد یا تاریخ نامعتبر ساخته نمی‌شود', historicalTradesPath('../info', '20260802') === null && historicalTradesPath('123', '14050511') === null);

  // ——— فهرست کد ———
  const list = parseInsList(' 111 , 222,۳۳۳,../x,333,111 , ');
  check('فهرست کد: نامعتبر و تکراری دور ریخته شد',
    list.length === 3 && list.join(',') === '111,222,333', list.join(','));
  check('رقم فارسی، کد معتبر نیست', !parseInsList('۱۲۳').length);
  check('سقف تعداد اعمال می‌شود',
    parseInsList(Array.from({ length: 500 }, (_, i) => String(i + 1)).join(','), 200).length === 200);
  check('ورودی خالی، فهرست خالی می‌دهد', parseInsList(null).length === 0);

  // ——— سقف بدنه ———
  const streamOf = (...parts) => ({
    async *[Symbol.asyncIterator]() { for (const p of parts) yield Buffer.from(p); },
  });
  const read = async (stream, max) => {
    try { return { body: await readBody(stream, max) }; }
    catch (e) { return { err: e }; }
  };

  const small = await read(streamOf('{"a":', '1}'), 1000);
  check('بدنه کوچک، کامل و چسبیده خوانده می‌شود', small.body === '{"a":1}', small.body);

  const big = await read(streamOf('x'.repeat(50), 'y'.repeat(60)), 100);
  check('بدنه بزرگ‌تر از سقف، خطای BodyTooLarge می‌دهد',
    big.err instanceof BodyTooLarge && big.err.limit === 100, big.err?.name);

  // سقف باید حین دریافت بزند، نه بعد از جمع شدن همه‌چیز در حافظه
  let pulled = 0;
  const counted = {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < 1000; i++) { pulled += 1; yield Buffer.from('z'.repeat(100)); }
    },
  };
  await read(counted, 250);
  check('سقف حین دریافت می‌زند، نه بعدش', pulled === 3, `${pulled} تکه خوانده شد از ۱۰۰۰`);

  const exact = await read(streamOf('a'.repeat(100)), 100);
  check('بدنه دقیقاً هم‌اندازه سقف، قبول است', exact.body?.length === 100);
}
