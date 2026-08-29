// ۱۸۵. وقتی تابلوی زنده نمی‌رسد، بایگانی جایش می‌نشیند — با برچسب

import { check, group, readSrc } from '../harness.mjs';
import { archiveBoardDownNote } from '../../core/watch-archive.mjs';

const server185 = readSrc('../server/server.mjs');
const app185 = readSrc('../ui/app.mjs');
const tab185 = readSrc('../ui/tabs/portfolio-time.mjs');

group('۱۸۵. جایگزینی بایگانی هنگام نبود تابلوی زنده');
{
  // پیش از این، شکست تابلو کل نقطه پایانی را می‌کشت و استودیوی سفر زمانی
  // حتی فهرست نماد پایه هم نداشت؛ یعنی ابزارِ «گذشته» با بازارِ بسته
  // بی‌استفاده بود، در حالی که بایگانی همان موقع روی دیسک هست.
  check('نبود تابلوی زنده به تازه‌ترین روز بایگانی می‌افتد، نه به خطا',
    server185.includes('async function archiveLastDate()')
    && server185.includes('const last = await archiveLastDate();')
    && server185.includes("source = 'watch-archive'; at = archive.at; fallbackDate = archive.date;"));

  // نبودِ داده هرگز با عدد ساختگی پر نمی‌شود: اگر بایگانی هم نباشد، همان
  // خطای واقعیِ تابلو بالا می‌رود.
  check('نبودِ همزمان تابلو و بایگانی خطای واقعی را پنهان نمی‌کند',
    server185.includes('if (!archive) throw boardError;'));

  check('پاسخ جایگزین روزِ فهرست و پرچم صریح خودش را حمل می‌کند',
    server185.includes('asOf: fallbackDate')
    && server185.includes('boardUnavailable: fallbackDate > 0'));

  const note = archiveBoardDownNote({ fallbackDate: 20260828, count: 13 });
  check('جملهٔ جایگزینی روزِ واقعی فهرست را با رقم فارسی می‌گوید',
    note.includes('۲۰۲۶۰۸۲۸') && note.includes('۱۳') && !/\d/.test(note));
  const biased = archiveBoardDownNote({ fallbackDate: 20260828, count: 13, wanted: 20260801 });
  check('اگر روزِ خواسته‌شده با روزِ بایگانی فرق کند، سوگیری بقا اعلام می‌شود',
    biased.includes('سوگیری بقا') && biased.includes('۲۰۲۶۰۸۰۱'));
  check('وقتی روزِ خواسته‌شده همان روزِ بایگانی است، ادعای سوگیری ساخته نمی‌شود',
    !archiveBoardDownNote({ fallbackDate: 20260828, count: 13, wanted: 20260828 }).includes('سوگیری بقا'));

  check('شکست کامل با جملهٔ فارسی گزارش می‌شود، نه با متن خام خطا',
    app185.includes('فهرست نمادها نه از تابلوی زنده آمد نه از بایگانی — ${detail}'));

  check('برچسب منبع از سرور تا وضعیت مشترک رابط حمل می‌شود',
    app185.includes("feed: { status: 'idle', error: '', note: '', asOf: 0 },")
    && app185.includes('note: payload.boardUnavailable ? String(payload.note || \'\') : \'\','));

  // خط وضعیت بعداً با «روزهای معاملاتی» بازنویسی می‌شود؛ اگر برچسب همان‌جا
  // می‌نشست، در مسیر عادی هرگز دیده نمی‌شد.
  check('برچسب منبع خانهٔ جدا دارد و با خط وضعیت پاک نمی‌شود',
    tab185.includes('id="pt-base-source"')
    && tab185.includes("$('pt-base-source').textContent = feedNote;")
    && tab185.indexOf("$('pt-base-source').textContent") > tab185.indexOf("$('pt-feed-status').textContent = symbols.length"));
}
