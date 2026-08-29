// ۵۶. فهرست خالی، با دلیل
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { emptyReason, linkLabelKey } from '../../ui/feed-state.mjs';



// ————————————————————————————————————————————————————————————————
group('۵۶. فهرست خالی، با دلیل');

{
  // هستهٔ گزارش کاربر: فهرست نماد خالی می‌ماند و هیچ‌چیز نمی‌گوید چرا.
  // چهار دلیل جدا داشت که همه یک شکل دیده می‌شدند.
  const kinds = ['loading', 'failed', 'empty', 'idle']
    .map((f) => emptyReason({ feedStatus: f }).kind);
  check('چهار دلیلِ خالی‌بودن، چهار پیام جدا دارند',
    new Set(kinds).size === 4, kinds.join('، '));

  check('نگرفتن داده، دکمه تلاش دوباره می‌گیرد',
    emptyReason({ feedStatus: 'failed', error: 'HTTP 403' }).retry === true);
  // «تابلو چیزی نداشت» با «نگرفتیم» یکی نیست؛ تلاش دوباره دردی از آن دوا نمی‌کند
  check('تابلوی خالی، دکمه تلاش دوباره نمی‌گیرد',
    emptyReason({ feedStatus: 'empty' }).retry === false);
  check('دلیل شکست در متن پیام می‌آید',
    emptyReason({ feedStatus: 'failed', error: 'HTTP 403' }).text.includes('HTTP 403'));
  check('شکست بدون متن هم پیام دارد',
    emptyReason({ feedStatus: 'failed' }).text.includes('نامعلوم'));
  // جست‌وجو فقط وقتی دلیل است که فهرست پُر باشد
  check('فهرست پر + جست‌وجوی بی‌نتیجه، دلیلش جست‌وجوست',
    emptyReason({ listCount: 9, filtered: true, feedStatus: 'ok' }).kind === 'filter');
  check('فهرست خالی + جست‌وجو، دلیلش جست‌وجو نیست',
    emptyReason({ listCount: 0, filtered: true, feedStatus: 'failed' }).kind === 'failed');

  // سوکتِ باز با «داده دارم» یکی نیست
  check('بدون ردیف، سوکت باز هم «متصل» نمی‌گوید',
    linkLabelKey({ rowCount: 0, linkStatus: 'live' }) !== 'live');
  check('بدون ردیف و با شکست، برچسب به دفتر خطاها می‌برد',
    linkLabelKey({ rowCount: 0, feedStatus: 'failed', linkStatus: 'live' }) === 'nodata');
  check('بدون ردیف و تابلوی خالی، برچسب جداست',
    linkLabelKey({ rowCount: 0, feedStatus: 'empty', linkStatus: 'live' }) === 'blank');
  check('در حال گرفتن، برچسب انتظار است',
    linkLabelKey({ rowCount: 0, feedStatus: 'loading' }) === 'waiting');
  check('با ردیفِ کهنه، برچسب عکس پشتیبان است',
    linkLabelKey({ rowCount: 5, stale: true, linkStatus: 'live' }) === 'snapshot');
  check('با ردیف زنده، برچسب همان وضعیت سوکت است',
    linkLabelKey({ rowCount: 5, stale: false, linkStatus: 'live' }) === 'live');
  check('قطعی با ردیف کهنه، عکس پشتیبان می‌ماند',
    linkLabelKey({ rowCount: 5, stale: true, linkStatus: 'down' }) === 'snapshot');
}

{
  const picker56 = readSrc('../ui/picker.mjs');
  // ریشهٔ باگ: جعبه تا رسیدن اولین ردیف اصلاً رسم نمی‌شد — نه پیامی، نه خلاصه‌ای
  check('انتخابگر بدون داده هم یک بار رسم می‌شود',
    picker56.includes('const offFeed = onFeed((f) => { feed = f; render(); });')
    && picker56.includes('});\n  render();'));
  check('انتخابگر اشتراک خوراک را پس می‌دهد', picker56.includes('dispose() { offFeed(); }'));
  check('دکمه تلاش دوباره به همان خوراک وصل است', picker56.includes('retryFeed()'));

  const app56 = readSrc('../ui/app.mjs');
  check('عکس پشتیبانِ خالی، خاموش رد نمی‌شود',
    app56.includes("if (!rows.length) { setFeed('empty'); return; }"));
  // ادعا عوض نشده؛ فقط متن پیام فارسی شد و جزئیات فنی پشتش رفت.
  check('شکست عکس پشتیبان، در وضعیت خوراک می‌نشیند',
    app56.includes("const detail = err?.message ? String(err.message) : String(err);")
    && /setFeed\('failed', `[^`]*\$\{detail\}`\)/.test(app56));
  check('تلاش دوباره بدون بستن و باز کردن تب ممکن است',
    app56.includes('export function retryFeed()'));
  check('تب‌ها به onFeed دسترسی دارند', app56.includes('subscribeWatch, onFeed, retryFeed }'));

  const scan56 = readSrc('../ui/scanner.mjs');
  // خرابی ریسه یعنی زنجیره ساخته نمی‌شود و فهرست تا ابد خالی می‌ماند
  check('خرابی ریسه اسکن به دفتر خطاها می‌رود',
    scan56.includes("logError('ریسه اسکن'"));

  const pos56 = readSrc('../ui/tabs/positions.mjs');
  check('فهرست کشویی موقعیت‌ها هم دلیل خالی‌بودن را می‌گوید',
    pos56.includes('emptyReason({ listCount: 0, feedStatus: feed.status'));

  const css56 = readSrc('../ui/style.css');
  check('پیام خالی سبک دارد', css56.includes('.picker-empty {'));
}
