// ۵۵. دفتر خطا و عکس پشتیبان
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { createLog } from '../../server/errlog.mjs';


// ═══════════════════════════ ۵۵. دفتر خطا و عکس پشتیبان بیرون از ساعت بازار ═══════════════════════════
group('۵۵. دفتر خطا و عکس پشتیبان');
{
  // ——— دفتر حلقه‌ای ———
  const L = createLog(3);
  for (let i = 1; i <= 5; i++) L.push({ where: 'بالادست', message: 'e' + i, at: 1000 + i });
  const st = L.stats();
  // شمارش دورریخته‌ها می‌ماند، وگرنه کاربر نمی‌فهمد آنچه می‌بیند همهٔ ماجرا نیست
  check('دفتر از ظرفیت جلو نمی‌زند و دورریخته را می‌شمارد',
    st.held === 3 && st.dropped === 2 && st.seq === 5, JSON.stringify(st));
  check('تازه‌ترین اول می‌آید', L.list().map((r) => r.message).join(',') === 'e5,e4,e3');
  check('گرفتن فقط تازه‌ها با شماره ترتیب ممکن است',
    L.list({ sinceSeq: 4 }).map((r) => r.message).join(',') === 'e5');
  L.push({ level: 'warn', message: 'w' });
  check('تفکیک سطح کار می‌کند',
    L.list({ level: 'warn' }).length === 1 && L.list({ level: 'error' }).length === 2);
  // پیام و پشتهٔ بی‌انتها، دفتر را به حافظه‌خور تبدیل می‌کند
  const long = createLog(5).push({ message: 'x'.repeat(9999), detail: 'y'.repeat(9999) });
  check('پیام و جزئیات بریده می‌شوند', long.message.length === 500 && long.detail.length === 2000);
  check('پاک کردن، دفتر را خالی می‌کند و شمارش را صفر', L.clear() && L.stats().held === 0 && L.stats().dropped === 0);
  const empty = createLog();
  check('دفتر خالی، فهرست خالی می‌دهد نه خطا', empty.list().length === 0 && empty.stats().held === 0);

  // ——— سرور ———
  const srv55 = readSrc('../server/server.mjs');
  check('نقطه پایانی دفتر خطا هست', srv55.includes("if (p === '/api/logs')"));
  check('خطای بالادست ثبت می‌شود', /errlog\.push\(\{ level: 'error', where: \`بالادست/.test(srv55));
  check('خطای درخواست و دور دیده‌بان هم ثبت می‌شوند',
    srv55.includes("logErr(`درخواست ${p}`, e)") && srv55.includes("logErr('دور دیده‌بان', e)"));
  check('خطای مرورگر در همان دفتر می‌نشیند، نه دفتری جدا',
    srv55.includes("where: `مرورگر · ${item.where || '—'}`"));
  // یک صفحهٔ خراب نباید بتواند حافظهٔ سرور را پر کند
  check('دستهٔ ارسالی مرورگر سقف دارد', srv55.includes('.slice(0, 50)'));

  // ——— مرورگر ———
  const cli55 = readSrc('../ui/errlog.mjs');
  // ارسال تک‌تک، خودش می‌شود منبع بار؛ و تلاش دوباره برای «خطای ارسال خطا»
  // بی‌نهایت خطای تازه می‌سازد.
  check('ارسال به سرور دسته‌ای است', /setTimeout\([\s\S]{0,400}?pending\.splice\(0, 50\)/.test(cli55));
  check('شکست ارسالِ خطا، دوباره تلاش نمی‌شود', cli55.includes('catch { /* عمداً بی‌صدا */ }'));
  check('استثنای رسم‌نشده و وعدهٔ ردشده هر دو گرفته می‌شوند',
    cli55.includes("window.addEventListener('error'") && cli55.includes("window.addEventListener('unhandledrejection'"));
  // «Error: Error: HTTP 403» هم زشت است هم می‌گوید دو خطا رخ داده
  check('پیشوند تکراری نام خطا حذف می‌شود',
    cli55.includes("/^[A-Za-z]+Error:/.test(raw)"));

  // ——— عکس پشتیبان ———
  const app55 = readSrc('../ui/app.mjs');
  // حلقهٔ دیده‌بان بیرون از ساعت بازار پارک می‌شود، پس رویداد watch هیچ‌وقت
  // پخش نمی‌شود و همهٔ تب‌ها کور می‌مانند.
  check('نبودِ داده زنده، از نقطه‌ای که شب و روز پاسخ می‌دهد پر می‌شود',
    app55.includes("fetch('/api/history/universe')") && app55.includes('function seedWatch()'));
  check('عکس پشتیبان فقط وقتی گرفته می‌شود که چیزی نیامده باشد',
    app55.includes('if (seeding || state.watch.rows.length) return seeding;'));
  check('داده زندهٔ واقعی، برچسب کهنه را برمی‌دارد', app55.includes('state.watch.stale = false;'));
  // سوکتِ باز با دادهٔ زنده یکی نیست؛ «متصل» روی عکس کهنه یعنی دروغ
  check('برچسب نوار از تازگی داده می‌آید، نه از وضعیت سوکت',
    app55.includes('const key = linkKey();'));
  check('برچسب عکس آخرین جلسه صریح می‌گوید زنده نیست',
    /snapshot: \['عکس آخرین جلسه — زنده نیست'/.test(app55));

  const tabs55 = readSrc('../ui/tabs/logs.mjs');
  check('تب دفتر خطا، سرور و مرورگر را در یک فهرست می‌ریزد',
    tabs55.includes('[...serverRows, ...local]'));
  // ثبتِ خطای خواندنِ دفتر خطا در همان دفتر، حلقه می‌سازد
  check('خطای خواندن دفتر، در خودِ دفتر ثبت نمی‌شود',
    tabs55.includes('// خطای خواندنِ دفتر خطا در خودِ دفتر ثبت نمی‌شود — حلقه می‌سازد.'));
  check('تب در فهرست تب‌ها ثبت شده و آیکون دارد',
    app55.includes("id: 'logs', title: 'دفتر خطاها'")
    && readSrc('../ui/icons.mjs').includes("logs: 'alert'"));
}
