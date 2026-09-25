// ۲۹۱. دروازهٔ ورودِ ریزمعامله — و نگهبانی که دور زدنش را می‌بندد
//
// ═══ چرا این دسته لازم شد ═══
//
// چهار دور ممیزی صرفِ این شد که یک تب بفهمد پاسخِ بالادست کامل است یا
// نه. سرور حالا `complete` · `verified` · `shortfall` · `emptyBoth` ·
// `throttled` را با هر پاسخ می‌فرستد — ولی بررسیِ کلِ رابط نشان داد
// **فقط همان یک تب** می‌خواندشان. بقیه `item.rows || []` برمی‌دارند.
//
// و چون پاسخِ سهمیه‌خورده خطا ندارد (`HTTP 200` با آرایهٔ خالی)، آن
// تب‌ها نمی‌فهمند داده نیامده: نوارِ خالی «معامله‌ای نبود» خوانده می‌شود
// و رویش استراتژی ساخته و نمودار کشیده می‌شود.
//
// نگهبانِ پایینِ این دسته مهم‌تر از خودِ تابع است: بی آن، فردا یک مسیرِ
// تازه اضافه می‌شود و همان اشتباه برمی‌گردد.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import {
  TAPE_STATE, tapeSummary, tapeVerdict, tapeWarning,
} from '../../ui/tape-intake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

group('۲۹۱. حکم، از همان میدان‌هایی که سرور می‌فرستد');
{
  const rows = (k) => Array.from({ length: k }, (_, i) => ({ sequence: i + 1 }));

  check('پاسخِ تطبیق‌شده «کامل» است و قابلِ تکیه',
    (() => { const v = tapeVerdict({ rows: rows(50), complete: true, verified: true });
      return v.state === 'complete' && v.usable === true && v.rows === 50; })());

  check('صفرِ تأییدشده «بی‌معامله» است، نه «نیامد»',
    tapeVerdict({ rows: [], complete: true, verified: true, quiet: true }).state === 'quiet');

  // ═══ ترتیب اهمیت دارد ═══
  //
  // سهمیه و خطا دربارهٔ **رسیدن** حرف می‌زنند، نه دربارهٔ بازار. پس پیش
  // از هر حکمِ دیگری می‌آیند — وگرنه ابزار/روزی که اصلاً پرسیده نشده
  // «بی‌معامله» خوانده می‌شود.
  check('سهمیه بر هر حکمِ دیگری مقدم است',
    tapeVerdict({ rows: [], throttled: true, complete: false }).state === 'throttled');
  check('و خطا هم',
    tapeVerdict({ rows: [], error: 'دروازه', complete: false }).state === 'error');
  check('ولی سهمیه بر خطا مقدم است',
    tapeVerdict({ rows: [], throttled: true, error: 'x' }).state === 'throttled');

  check('پاسخِ بریده «ناقص» است و قابلِ تکیه **نیست**',
    (() => { const v = tapeVerdict({ rows: rows(2521), complete: false, verified: true,
      shortfall: { trades: 5215, volume: 61922639 } });
      return v.state === 'partial' && v.usable === false && v.shortTrades === 5215; })());

  check('خالی با تابلوی پرمعامله «نیامد» است',
    tapeVerdict({ rows: [], complete: false, verified: true,
      shortfall: { trades: 7736, volume: 73305224 } }).state === 'missing');

  // بی مرجع: داده هست ولی سنجیده نشده. این با «کامل» یکی نیست.
  check('بی مرجع، «تأییدنشده» است نه «کامل»',
    tapeVerdict({ rows: rows(10), complete: false, verified: false }).state === 'unverified');
  check('و ردیفش قابلِ استفاده است، ولی با برچسب',
    tapeVerdict({ rows: rows(10), complete: false, verified: false }).usable === true);
  check('بی مرجع و بی ردیف، قابلِ استفاده نیست',
    tapeVerdict({ rows: [], complete: false, verified: false }).usable === false);

  check('پاسخِ نبوده «نیامد» است', tapeVerdict(undefined).state === 'missing');
  check('هر حالت برچسبِ فارسی دارد',
    ['complete', 'partial', 'missing', 'quiet', 'unverified', 'throttled', 'error']
      .every((k) => typeof TAPE_STATE[k] === 'string' && TAPE_STATE[k].length > 3));
}

group('۲۹۱. جمع‌بندی «قابلِ تکیه» را از «ردیف دارد» جدا می‌کند');
{
  const rows = (k) => Array.from({ length: k }, () => ({ x: 1 }));
  const verdicts = {
    a: tapeVerdict({ rows: rows(100), complete: true, verified: true }),
    b: tapeVerdict({ rows: [], complete: true, verified: true, quiet: true }),
    c: tapeVerdict({ rows: rows(5), complete: false, verified: true, shortfall: { trades: 90, volume: 900 } }),
    d: tapeVerdict({ rows: [], complete: false, verified: true, shortfall: { trades: 50, volume: 500 } }),
    e: tapeVerdict({ rows: rows(7), complete: false, verified: false }),
    f: tapeVerdict({ rows: [], throttled: true }),
  };
  const sum = tapeSummary(verdicts);

  check('هر حالت جدا شمرده می‌شود',
    sum.complete === 1 && sum.quiet === 1 && sum.partial === 1
      && sum.missing === 1 && sum.unverified === 1 && sum.throttled === 1);
  // ═══ قلبِ این جمع‌بندی ═══
  //
  // «۱۱۲ ردیف آمد» چیزی نمی‌گوید. از شش ابزار/روز فقط **دو** تا با
  // تابلو سنجیده و تأیید شده‌اند.
  check('«قابلِ تکیه» فقط سنجیده‌شده‌هاست', sum.trusted === 2);
  check('و بقیه مشکوک شمرده می‌شوند', sum.suspect === 4);
  check('شمارِ ردیف جدا حمل می‌شود، نه به‌جای حکم', sum.rows === 112);

  // ═══ هشدار: یک جمله، یک جا ═══
  const warn = tapeWarning(sum);
  check('هشدار همهٔ کم‌داشته‌ها را نام می‌برد',
    warn.includes('سهمیه') && warn.includes('نیامد') && warn.includes('کمتر از تابلو')
      && warn.includes('تابلوی روزانه‌اش در دست نبود'));
  check('و می‌گوید نتیجه روی چه ساخته شده', warn.includes('دادهٔ ناقص'));
  check('بستهٔ سالم هیچ هشداری نمی‌دهد',
    tapeWarning(tapeSummary({ a: verdicts.a, b: verdicts.b })) === '');
  check('و بستهٔ خالی هم', tapeWarning(tapeSummary({})) === '');
}

group('۲۹۱. نگهبان: هیچ تبی مستقیم ریزمعامله نمی‌گیرد');
{
  // ═══ چرا نگهبان از خودِ تابع مهم‌تر است ═══
  //
  // تابعِ مشترک را می‌شود نوشت و فردا کنارش زد. نگهبان دروازه را قرمز
  // می‌کند، پس مسیرِ تازه‌ای که حکم را دور بریزد اصلاً وارد مخزن نمی‌شود.
  // این مخزن همین الگو را برای رقمِ نمایشی و رنگ دارد و جواب داده.
  // پیمایش با `readdirSync` است ولی خواندن با `readSrc` — نگهبانِ دستهٔ
  // ۷ همین را می‌خواهد، چون خواندنِ خام پایان‌خطِ ویندوز را نرمال نمی‌کند
  // و ادعاهای متنی روی آن سیستم بی‌دلیل می‌شکنند.
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.mjs')) out.push(full);
    }
    return out;
  };

  // ═══ دو استثنا، و هر دو با دلیل ═══
  //
  //   tape-intake.mjs   خودِ دروازه است.
  //   data-export.mjs   حلقهٔ تلاشِ تکمیلی، `keepBetterTape` و صفِ
  //                     کم‌داشته را دارد و همهٔ میدان‌ها را از قبل
  //                     می‌خواند. عبور دادنش از دروازه سودی ندارد و
  //                     ریسکِ دست‌زدن به تنها مسیری است که کامل کار
  //                     می‌کند.
  const ALLOWED = new Set(['ui/tape-intake.mjs', 'ui/tabs/data-export.mjs']);

  // ═══ نگهبان کد را می‌گزد، نه نثر را ═══
  //
  // این مخزن توضیحاتِ بلند دارد و در آن‌ها مسیرِ `/api/trades` بارها با
  // بک‌تیک نام برده می‌شود. نسخهٔ اولِ همین نگهبان دو فایل را فقط
  // به‌خاطر یک **توضیح** گناهکار خواند. نگهبانی که هشدارِ کاذب می‌دهد،
  // خیلی زود خاموش می‌شود.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

  const offenders = [];
  for (const file of walk(path.join(ROOT, 'ui'))) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    if (/['"`]\/api\/trades/.test(stripComments(readSrc(`../${rel}`)))) offenders.push(rel);
  }
  check('هیچ فایلی بیرون از دروازه `/api/trades` را صدا نمی‌زند',
    offenders.length === 0, offenders.join(' · '));

  // و خودِ دروازه واقعاً همان مسیر را می‌زند.
  const gate = readSrc('../ui/tape-intake.mjs');
  check('دروازه از مسیرِ دسته‌ای استفاده می‌کند', gate.includes("fetch('/api/trades/batch'"));
  check('و مسیرِ تکی را هم دارد', gate.includes('fetch(`/api/trades?${query}`'));
  check('و `bust` و `fresh` را حمل می‌کند',
    gate.includes('JSON.stringify({ requests, fresh, bust })'));
}

group('۲۹۱. خودِ نگهبان، آزموده');
{
  // نگهبانی که آزموده نشده، ادعاست نه ضمانت.
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
  const hits = (src) => /['"`]\/api\/trades/.test(strip(src));

  check('فراخوانِ واقعی گرفته می‌شود', hits("await fetch('/api/trades/batch', {})"));
  check('و شکلِ بک‌تیکی هم', hits('fetch(`/api/trades?ins=${x}`)'));
  check('ولی نامِ مسیر در توضیحِ یک‌خطی نه',
    !hits('  // مسیرِ `/api/trades` حالا هر دو پرچم را می‌زند'));
  check('و در توضیحِ بلوکی هم نه',
    !hits('/*\n * ردیف ۱: روز جاری از `/api/trades` خوانده می‌شد\n */'));
  check('توضیحِ پس از کد، کد را نمی‌بلعد',
    hits("fetch('/api/trades') // این باید دیده شود"));
}

group('۲۹۱. هر تبِ اولویت‌دار حکم را **نشان** می‌دهد');
{
  // ═══ حمل‌کردن کافی نیست ═══
  //
  // اگر تبی حکم را بگیرد و جایی نگذاردش، همان «بی‌صدا» باقی می‌ماند —
  // فقط این‌بار با یک متغیرِ بی‌مصرف. پس ادعا این است که هر سه تب حکم
  // را **به کاربر می‌گویند**، نه صرفاً می‌گیرند.
  const view = readSrc('../ui/tabs/open-view.mjs');
  check('نگاه باز از دروازه می‌گیرد',
    view.includes('const got = await fetchTapeBatch(requests)'));
  check('و پیش از جدول اعلام می‌کند', view.includes('if (tapeNote) setStatus(tapeNote, true)'));
  // ═══ و کشِ تب، دادهٔ مشکوک را نگه نمی‌دارد ═══
  //
  // بی این شرط، یک اجرای سهمیه‌خورده تا پایان نشست تکرار می‌شود و هر
  // بار همان تصویرِ ناقص را می‌سازد.
  check('کشِ تب فقط دادهٔ سنجیده‌شده را نگه می‌دارد',
    view.includes('if (!tapeNote && Object.values(tradesByKey).some((rows) => rows.length))'));

  const spread = readSrc('../ui/tabs/spread-radar.mjs');
  check('رصد اسپرد از دروازه می‌گیرد', spread.includes('const got = await fetchTapeBatch('));
  check('و پیش از رسمِ شکاف اعلام می‌کند',
    spread.includes('if (byIns.__note) setStatus(byIns.__note, true)'));

  const greeks = readSrc('../ui/tabs/greeks-watch.mjs');
  check('دیده‌بان از دروازه می‌گیرد', greeks.includes('await fetchTapeOne(ins, date)'));
  check('و کم‌داشته‌ها را جمع و گزارش می‌کند',
    greeks.includes('tapeGaps.push({') && greeks.includes('function reportTapeGaps()')
      && greeks.includes('reportTapeGaps();'));

  const back = readSrc('../ui/tabs/backtest.mjs');
  check('بک‌تست حکم را در دفترِ خطاهای خودش می‌نشاند',
    back.includes('if (got.throttled) { batchThrottled = true; batchErrors.push(got.note); }')
      && back.includes('if (warn) batchErrors.push(warn)'));

  const pf = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('بک‌تستِ سبد هر دو نقطه‌اش از دروازه می‌گذرد',
    (pf.match(/fetchTapeOne\(/g) || []).length === 2);
}
