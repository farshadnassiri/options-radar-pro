// ۲۹۳. دروازهٔ ورودِ دادهٔ تاریخ‌دار
//
// ═══ چرا این سومی از دو تای قبل هم باریک‌تر است ═══
//
// `/api/hist` تنها مسیری است که در کل برنامه ادعای **اجراپذیری در
// گذشته** دارد: عددی که از دلش بیرون می‌آید به کاربر می‌گوید «آن روز
// ساعت ده و نیم می‌شد این موقعیت را با این قیمت بست». اگر دفترِ سفارشِ
// آن لحظه نیامده باشد و برنامه آن را «دفتری نبود» بخواند، جلسه‌ای
// بازسازی می‌شود که هرگز وجود نداشت — و ادعایش دقیقاً شبیهِ ادعای درست
// است.
//
// `core/book-history.mjs` دربارهٔ «ندانستن» سخت‌گیر است، ولی سخت‌گیریِ
// آن از جایی شروع می‌شود که ردیف رسیده باشد. این دسته یک پله عقب‌تر را
// می‌گیرد: اصلاً رسید یا نه.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import {
  HIST_STATE, fetchHist, fetchHistKinds, histRows, histSummary, histVerdict, histWarning,
} from '../../ui/hist-intake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

group('۲۹۳. حکم، بر حسبِ نوع');
{
  // ═══ ریزمعامله: سهمیه و خطا مقدم‌اند ═══
  //
  // همان ترتیبِ `tapeVerdict`. سهمیه دربارهٔ **رسیدن** حرف می‌زند، نه
  // دربارهٔ بازار؛ تا وقتی ندانیم داده رسید، هیچ حرفی دربارهٔ آن روز
  // نمی‌شود زد.
  check('سهمیه بر هر حکمِ دیگری مقدم است',
    histVerdict('trades', { throttled: true, rows: [{ p: 1 }] }).state === 'throttled');
  check('و خطا هم جای خودش را دارد',
    histVerdict('trades', { error: 'دروازه', rows: [] }).state === 'error');
  check('پاسخِ نیامده «نبود» است، نه «خالی»',
    histVerdict('trades', undefined).state === 'missing');

  check('ریزمعاملهٔ دارای ردیف قابلِ استفاده است',
    (() => { const v = histVerdict('trades', { rows: [{ p: 1 }, { p: 2 }] });
      return v.state === 'rows' && v.usable === true && v.rows === 2; })());

  // ═══ دفترِ سفارش: ردیفِ خام با رویدادِ معتبر یکی نیست ═══
  check('دفترِ سفارش ردیف‌هایش را از `events` می‌خواند، نه `rows`',
    histRows('book', { events: [{ level: 1 }], rows: [{ x: 1 }, { x: 2 }] }).length === 1);
  check('دفتری که ردیف گرفت ولی رویدادی نساخت، «آمد» نیست',
    (() => { const v = histVerdict('book', { events: [], count: 7, blank: true, upstreamKind: 'list', droppedRows: 7 });
      return v.state === 'blank' && v.usable === false && v.droppedRows === 7; })());

  // ═══ رکوردِ تک: درسِ R3-01 ═══
  check('رکوردِ بی‌مهرِ تاریخ «تأییدنشده» است، نه «آمد»',
    (() => { const v = histVerdict('daily', { row: { a: 1 }, found: true, dated: false, why: 'رکوردِ تاریخ‌دار نیست' });
      return v.state === 'unverified' && v.usable === true && v.rows === 1; })());
  check('و رکوردِ مهرخورده، «آمد»',
    histVerdict('daily', { row: { a: 1 }, found: true, dated: true }).state === 'rows');
  check('رکوردِ پیدانشده «خالی» است و علتش حمل می‌شود',
    (() => { const v = histVerdict('clientType', { row: null, found: false, why: 'پاسخ رکوردی نداشت' });
      return v.state === 'blank' && v.why === 'پاسخ رکوردی نداشت'; })());

  check('پوششِ ناقصِ `closing` داده را «تأییدنشده» می‌کند',
    histVerdict('closing', { rows: [{ a: 1 }], coverage: { complete: false, note: 'فقط پیش‌جلسه' } }).state === 'unverified');

  check('هر حالت برچسبِ فارسی دارد',
    Object.keys(HIST_STATE).every((k) => typeof HIST_STATE[k] === 'string' && HIST_STATE[k].length));
}

group('۲۹۳. «خالی» سه چیز است، نه دو');
{
  // ═══ چرا این بندِ اصلیِ این دسته است ═══
  //
  // `firstList()` سه حالتِ متفاوت را به یک `[]` می‌رساند. تا امروز هر سه
  // «آن روز چیزی نبود» خوانده می‌شدند. `core/upstream-shape.mjs` برای
  // همین ساخته شد ولی فقط مسیرِ ریزمعامله از آن استفاده می‌کرد.
  check('فهرستِ خالیِ واقعی، واقعیتِ بازار است و قابلِ تکیه',
    (() => { const v = histVerdict('state', { rows: [], count: 0, blank: true, upstreamKind: 'emptyList', upstream: 'فهرست خالی' });
      return v.state === 'quiet' && v.usable === true; })());
  check('ولی پاسخی که اصلاً فهرست نیست، خرابی است',
    (() => { const v = histVerdict('threshold', { rows: [], count: 0, blank: true, upstreamKind: 'noList', upstream: 'پاسخ بی‌فهرست (message)' });
      return v.state === 'blank' && v.usable === false && v.upstream.includes('message'); })());
  check('و بی‌پاسخ هم خرابی است',
    histVerdict('threshold', { rows: [], count: 0, blank: true, upstreamKind: 'none' }).state === 'blank');

  // ═══ و این تفاوت باید به سرور هم برسد ═══
  const server = readSrc('../server/server.mjs');
  check('سرور شکلِ خام را برای نوع‌های فهرستی همراه می‌کند',
    server.includes('const blankShape = () =>') && server.includes('upstreamKind: shape.kind'));
  check('و فقط وقتی که خالی مانده باشیم — پاسخِ پرردیف سنگین نمی‌شود',
    server.includes('if (!rows.length) return { rows, count: 0, ...blankShape() };'));
  check('دفترِ سفارشِ بی‌رویداد هم شمارِ ردیفِ دورریخته را می‌گوید',
    server.includes('droppedRows: rows.length'));
}

group('۲۹۳. جمع‌بندی و هشدار');
{
  const verdicts = {
    trades: histVerdict('trades', { rows: [{ p: 1 }] }),
    book: histVerdict('book', { events: [], blank: true, upstreamKind: 'noList' }),
    state: histVerdict('state', { rows: [], blank: true, upstreamKind: 'emptyList' }),
    threshold: histVerdict('threshold', undefined),
  };
  const sum = histSummary(verdicts);
  check('هر حالت جدا شمرده می‌شود',
    sum.total === 4 && sum.rows === 1 && sum.blank === 1 && sum.quiet === 1 && sum.missing === 1);
  // «قابلِ تکیه» یعنی می‌دانیم چه رسید — چه داده بود چه تأییدِ خالی.
  check('تأییدِ خالی هم «قابلِ تکیه» است',
    sum.trusted === 2);
  check('و نامِ آنچه از دست رفت می‌آید',
    sum.lost.join() === 'book,threshold');
  check('هشدار همان نام‌ها را می‌گوید',
    histWarning(sum).includes('book') && histWarning(sum).includes('threshold'));
  check('بستهٔ سالم هیچ هشداری نمی‌دهد',
    histWarning(histSummary({ a: histVerdict('state', { rows: [], blank: true, upstreamKind: 'emptyList' }) })) === '');
  check('و سهمیه جملهٔ خودش را دارد، نه جملهٔ عمومی را',
    histWarning(histSummary({ t: histVerdict('trades', { throttled: true }) })).includes('سهمیه'));

  // `unverified` عمداً «قابلِ تکیه» نیست: داده دارد ولی پشتوانه ندارد.
  const shaky = histSummary({ d: histVerdict('daily', { row: { a: 1 }, found: true, dated: false }) });
  check('«تأییدنشده» قابلِ تکیه شمرده نمی‌شود',
    shaky.trusted === 0 && shaky.unverified === 1);
  check('ولی «از دست رفته» هم نیست — داده دارد',
    shaky.lost.length === 0 && histWarning(shaky).includes('تأییدنشده'));
}

group('۲۹۳. دروازه واقعاً درخواست می‌فرستد و خطا را می‌بلعد، نه داده را');
{
  const seen = [];
  const fake = async (url) => {
    seen.push(String(url));
    return { ok: true, json: async () => ({ kind: 'trades', rows: [{ p: 1 }], complete: true }) };
  };
  const got = await fetchHist('trades', 'A1', 20260601, { fetcher: fake });
  check('نشانیِ درخواست هر سه جزء را دارد',
    seen[0] === '/api/hist?kind=trades&ins=A1&date=20260601', seen[0]);
  check('و ردیف‌ها همراهِ حکم برمی‌گردند',
    got.rows.length === 1 && got.verdict.state === 'rows');

  // پاسخِ ۵۰۰ نباید پرتاب شود: مصرف‌کننده باید بتواند نامِ آنچه نرسید را
  // بگوید، نه اینکه کلِ بازسازی با یک `throw` بیفتد.
  const broken = await fetchHist('book', 'A1', 20260601, {
    fetcher: async () => ({ ok: false, status: 503, json: async () => ({ error: 'بالادست' }) }),
  });
  check('خطای HTTP حکمِ `error` می‌شود، نه پرتاب',
    broken.verdict.state === 'error' && broken.verdict.why === 'بالادست');

  const many = await fetchHistKinds(['threshold', 'state'], 'A1', 20260601, {
    fetcher: async (url) => (String(url).includes('kind=state')
      ? { ok: true, json: async () => ({ rows: [{ cEtaval: 'A' }] }) }
      : { ok: false, status: 500, json: async () => ({ error: 'دامنه نیامد' }) }),
  });
  check('یک نوعِ افتاده، نوعِ دیگر را نمی‌اندازد',
    many.verdicts.state.state === 'rows' && many.verdicts.threshold.state === 'error');
  check('و جمع‌بندی همان را می‌گوید', many.summary.trusted === 1 && many.summary.error === 1);

  // شبکه‌ای که خودش پرتاب می‌کند هم نباید بقیه را بیندازد.
  const thrown = await fetchHistKinds(['threshold'], 'A1', 20260601, {
    fetcher: async () => { throw new Error('شبکه قطع'); },
  });
  check('پرتابِ شبکه هم حکم می‌شود، نه سقوط',
    thrown.verdicts.threshold.state === 'error' && thrown.verdicts.threshold.why.includes('شبکه'));
}

group('۲۹۳. نگهبان: هیچ فایلی مستقیم `/api/hist` نمی‌گیرد');
{
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.mjs')) out.push(full);
    }
    return out;
  };
  // توضیحات پیش از پویش برداشته می‌شوند: نگهبانی که به‌خاطر نامِ مسیر در
  // یک کامنت هشدار بدهد، خیلی زود خاموش می‌شود. (درسِ دستهٔ ۲۹۱.)
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

  const ALLOWED = new Set(['ui/hist-intake.mjs']);
  const offenders = [];
  for (const file of walk(path.join(ROOT, 'ui'))) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    // `/api/history/...` مسیرِ دیگری است و به این نگهبان ربطی ندارد.
    if (/['"`]\/api\/hist\?/.test(stripComments(readSrc(`../${rel}`)))) offenders.push(rel);
  }
  check('هیچ فایلی بیرون از دروازه `/api/hist` را صدا نمی‌زند',
    offenders.length === 0, offenders.join(' · '));

  // و خودِ نگهبان باید `/api/history/universe` را بی‌گناه بداند.
  check('نگهبان `/api/history/universe` را با `/api/hist` اشتباه نمی‌گیرد',
    !/['"`]\/api\/hist\?/.test("const u = '/api/history/universe?date=1';"));

  // خودِ این فایل هم از قاعدهٔ «اول توضیحات را بردار» مستثنا نیست: نسخهٔ
  // اولِ همین سه ادعا، شرحِ باگِ برداشته‌شده را در کامنتِ بالای تابع
  // می‌دید و همان را مدرکِ ماندنش می‌گرفت.
  const feed = stripComments(readSrc('../ui/bereket-data.mjs'));
  check('بارگذارِ بِرِکِت دیگر حکمِ ریزمعامله را دور نمی‌ریزد',
    feed.includes('loadTradesVerdict') && !feed.includes('body?.rows || []'));
  check('و دفترِ سفارش هم همین‌طور',
    feed.includes('loadBookEventsVerdict') && !feed.includes('body?.events || []'));
  // `response.json().catch(() => null)` جای دیگری همین فایل هست و
  // بی‌گناه است — آن «بدنه‌ای که شاید JSON نباشد» را می‌گیرد، نه یک
  // مرجعِ نیامده را. پس ادعا دقیقاً همان دو فراخوانِ برداشته‌شده را
  // هدف می‌گیرد، نه هر `catch`ی را.
  check('`loadDayMeta` دیگر هر دو مرجع را در `catch` نمی‌اندازد',
    !/once\([^\n]*kind=(?:threshold|state)/.test(feed)
      && !/\)\.catch\(\(\) => null\)/.test(feed.replace(/response\.json\(\)\.catch\(\(\) => null\)/g, ''))
      && feed.includes("fetchHistKinds(['threshold', 'state']"));
  check('و آنچه نرسید را با نام برمی‌گرداند',
    feed.includes('verdicts: got.verdicts') && feed.includes('note: histWarning('));
  // شکستِ کش‌شده یعنی تا پایانِ نشست هیچ تلاشِ دوباره‌ای ممکن نیست.
  check('کش شکست را نگه نمی‌دارد',
    feed.includes('if (unusable(value)) memo.delete(key)'));
}
