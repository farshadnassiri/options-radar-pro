// ۲۹۴. دروازهٔ ورودِ مظنهٔ زنده
//
// ═══ چرا این چهارمی بیشترین خونریزی را داشت ═══
//
// سه دروازهٔ قبل هر کدام یکی دو مصرف‌کننده داشتند. این سه مسیر در **ده**
// فایل صدا زده می‌شدند، و چهار جا اصلاً `response.ok` را نمی‌دیدند:
//
//     fetch(`/api/books?ins=${q}`).then((r) => r.json())
//
// پاسخِ ۵۰۰ یا ۴۰۰ هم `json()` می‌شد و به‌جای دفترِ سفارش می‌نشست.
// `mergeInsPayloads` در آن شیء هیچ کدِ ابزاری پیدا نمی‌کرد، پس **هر**
// ابزار «دفتر ندارد» می‌شد: یک خطای سرور، به‌شکلِ بازارِ بی‌عمق.
//
// و این دقیقاً همان حکمی است که `slice(0, 180)` به‌خاطرش برداشته شد
// (ممیزی ۱۴۰۵/۰۶/۲۹ بند ۴): «بی‌مظنه» به «بی‌عمق» ترجمه می‌شد و نامزد
// از مرحلهٔ دو می‌افتاد. همان اشتباه، از راهی که کسی نبسته بود.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import {
  QUOTE_STATE, fetchBooks, fetchLiveTape, fetchQuotes, quoteSummary, quoteVerdict, quoteWarning,
} from '../../ui/quote-intake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const bad = (status, body) => ({ ok: false, status, json: async () => body });

group('۲۹۴. حکمِ یک ابزار');
{
  check('ابزارِ دارای ردیف قابلِ استفاده است',
    (() => { const v = quoteVerdict({ rows: [{ p: 1 }, { p: 2 }] });
      return v.state === 'rows' && v.usable === true && v.rows === 2; })());
  check('و دفتر هم از میدانِ خودش خوانده می‌شود، نه `rows`',
    quoteVerdict({ book: [{ level: 1 }] }).rows === 1);

  check('خطا جای خودش را دارد',
    quoteVerdict({ error: 'بالادست' }).state === 'error');
  check('و ابزارِ نبوده «نبود» است، نه «خالی»',
    quoteVerdict(undefined).state === 'missing');

  // ═══ بازارِ بسته، پیش از هر حکمی ═══
  //
  // نوارِ خالی در بازارِ بسته واقعیتِ ساعت است، نه نشانهٔ خرابی. بی این
  // ترتیب، هر اجرای شبانه یک بستهٔ کاملاً «مشکوک» می‌ساخت و هشدار
  // بی‌معنا می‌شد — یعنی نادیده گرفته می‌شد، که بدتر از نبودنش است.
  check('نوارِ خالی در بازارِ بسته «مشکوک» نیست',
    (() => { const v = quoteVerdict({ rows: [], upstreamKind: 'noList' }, { marketOpen: false });
      return v.state === 'closed' && v.usable === true; })());
  check('ولی همان خالی در بازارِ باز، خالیِ بی‌تأیید است',
    quoteVerdict({ rows: [], upstreamKind: 'noList' }, { marketOpen: true }).state === 'blank');
  check('و فهرستِ واقعاً خالی، واقعیتِ بازار است',
    (() => { const v = quoteVerdict({ rows: [], upstreamKind: 'emptyList' }, { marketOpen: true });
      return v.state === 'quiet' && v.usable === true; })());

  // `/api/infos` فهرست ندارد؛ رکوردِ عددی است. نبودِ فهرست برایش «خالی»
  // نیست، وگرنه هر پاسخِ سالمِ اطلاعات «مشکوک» می‌شد.
  check('رکوردِ بی‌فهرستِ اطلاعات، «خالی» خوانده نمی‌شود',
    quoteVerdict({ last: 1000, close: 990 }, { marketOpen: true }).state === 'rows');

  check('هر حالت برچسبِ فارسی دارد',
    Object.keys(QUOTE_STATE).every((k) => typeof QUOTE_STATE[k] === 'string' && QUOTE_STATE[k].length));
}

group('۲۹۴. `response.ok` — همان چیزی که چهار جا دیده نمی‌شد');
{
  // ═══ بندِ اصلیِ این دسته ═══
  const seen = [];
  const five = async (url) => { seen.push(String(url)); return bad(500, { error: 'بالادست افتاد' }); };
  const got = await fetchBooks(['1', '2'], { fetcher: five });
  check('پاسخِ ۵۰۰ دفتر نمی‌شود',
    Object.keys(got.byIns).length === 0, JSON.stringify(got.byIns));
  check('و هر کدِ آن تکه حکمِ «خطا» می‌گیرد، نه «بی‌عمق»',
    got.verdicts['1'].state === 'error' && got.verdicts['2'].state === 'error');
  check('علتش هم حمل می‌شود، نه فقط اینکه نشد',
    got.verdicts['1'].why === 'بالادست افتاد');
  check('و هشدار می‌گوید ردیف با مظنهٔ حالا نیست',
    quoteWarning(got.summary).includes('مظنهٔ این‌ها را نداریم'));

  // پاسخِ ۴۰۰ِ «از سقف گذشتی» هم همین‌طور — همان چیزی که بی‌صدا بلعیده
  // می‌شد وقتی فهرست از دویست کد می‌گذشت.
  const capped = await fetchBooks(['9'], { fetcher: async () => bad(400, { error: 'از سقف گذشتی' }) });
  check('۴۰۰ِ سقف هم بلعیده نمی‌شود', capped.verdicts['9'].state === 'error');

  // و پاسخِ ۲۰۰ که بدنه‌اش `error` دارد.
  const soft = await fetchBooks(['7'], { fetcher: async () => ok({ error: 'بدنهٔ خطادار' }) });
  check('خطای درونِ بدنهٔ ۲۰۰ هم گرفته می‌شود', soft.verdicts['7'].state === 'error');

  // یک تکهٔ افتاده نباید تکهٔ سالم را بیندازد.
  const many = [...Array(30)].map((_, i) => String(i + 1));
  const half = async (url) => (String(url).includes('ins=1,') ? bad(500, { error: 'تکهٔ اول' })
    : ok({ at: 1, source: 'watch', items: Object.fromEntries(many.slice(24).map((c) => [c, { rows: [{ p: 1 }] }])) }));
  const mixed = await fetchLiveTape(many, { fetcher: half });
  check('تکهٔ افتاده، تکهٔ سالم را نمی‌اندازد',
    mixed.verdicts['25'].state === 'rows' && mixed.verdicts['1'].state === 'error');
  check('و نوارِ زنده با سقفِ خودش تکه می‌شود',
    mixed.errors.length === 1 && mixed.errors[0].codes.length === 24, String(mixed.errors[0]?.codes.length));
}

group('۲۹۴. بدنهٔ خام دست‌نخورده حمل می‌شود');
{
  // `liveTapeDay()` از بدنه `source` و `archived` را می‌خواند. دروازه‌ای
  // که بدنه را بازسازی کند، بی‌صدا «منبع نامعلوم» می‌دهد — و همین یک بار
  // کلِ «نگاه باز چندروزه» را از کار انداخت.
  const body = { at: 777, source: 'watch', market: { open: true, phase: 'open' }, items: { A: { rows: [{ p: 1 }] } } };
  const got = await fetchLiveTape(['A'], { fetcher: async () => ok(body) });
  check('بدنه همان است که آمد', got.envelope === body);
  check('و `source` از آن گم نمی‌شود', got.source === 'watch' && got.envelope.source === 'watch');
  check('زمان و فازِ بازار هم می‌آیند',
    got.at === 777 && got.market?.open === true && got.summary.marketOpen === true);
  check('و `byIns` خودِ ابزارهاست', got.byIns.A.rows.length === 1);
}

group('۲۹۴. جمع‌بندی و هشدار');
{
  const verdicts = {
    a: quoteVerdict({ rows: [{ p: 1 }] }),
    b: quoteVerdict({ error: 'خطا' }),
    c: quoteVerdict({ rows: [], upstreamKind: 'noList' }, { marketOpen: true }),
    d: quoteVerdict(undefined),
  };
  const sum = quoteSummary(verdicts);
  check('هر حالت جدا شمرده می‌شود',
    sum.total === 4 && sum.rows === 1 && sum.error === 1 && sum.blank === 1 && sum.missing === 1);
  check('و «قابلِ تکیه» فقط آنچه می‌دانیم چه رسید', sum.trusted === 1);
  check('هشدار هر سه را می‌گوید',
    ['خطا', 'پاسخ', 'خالی'].every((word) => quoteWarning(sum).includes(word)));
  check('بستهٔ سالم هیچ هشداری نمی‌دهد',
    quoteWarning(quoteSummary({ a: quoteVerdict({ rows: [{ p: 1 }] }) })) === '');
  // بازارِ بسته هشدار نیست: شب، همه‌چیز خالی است و این خبر نیست.
  check('و بازارِ بسته هم هشدار نمی‌سازد',
    quoteWarning(quoteSummary({
      a: quoteVerdict({ rows: [] }, { marketOpen: false }),
      b: quoteVerdict({ rows: [] }, { marketOpen: false }),
    })) === '');

  // دفتر و اطلاعات با هم — همان بندی که در سه تب تکرار شده بود.
  const both = await fetchQuotes(['A'], {
    fetcher: async (url) => (String(url).includes('/api/books')
      ? ok({ A: { book: [{ level: 1, bid: 10, ask: 11 }] } })
      : bad(503, { error: 'اطلاعات نیامد' })),
  });
  check('یکی از دو مسیر بیفتد، دیگری می‌ماند',
    both.books.verdicts.A.state === 'rows' && both.infos.verdicts.A.state === 'error');
  check('و جمع‌بندیِ مشترک هر دو را می‌شمارد',
    both.summary.total === 2 && both.summary.trusted === 1 && both.summary.error === 1);
}

group('۲۹۴. نگهبان: هیچ فایلی مستقیم مظنهٔ زنده نمی‌گیرد');
{
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.mjs')) out.push(full);
    }
    return out;
  };
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

  const ALLOWED = new Set(['ui/quote-intake.mjs']);
  const offenders = [];
  for (const file of walk(path.join(ROOT, 'ui'))) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    const src = stripComments(readSrc(`../${rel}`));
    if (/['"`]\/api\/(live-trades|books|infos)\?/.test(src)
      || /['"`]\/api\/(live-trades|books|infos)['"`]/.test(src)) offenders.push(rel);
  }
  check('هیچ فایلی بیرون از دروازه مظنهٔ زنده را صدا نمی‌زند',
    offenders.length === 0, offenders.join(' · '));

  // ═══ و نگهبانِ دوم: الگوی «json بگیر، پاسخ را نبین» ═══
  //
  // این همان شکلی است که چهار جا داشت و هیچ‌کدام `response.ok` را
  // نمی‌دید. نبودنِ مسیر در فایل کافی نیست؛ خودِ الگو باید بمیرد، وگرنه
  // فردا روی یک مسیرِ تازه برمی‌گردد.
  //
  // ═══ چرا فهرستِ استثنا دارد، و چرا این فهرست فقط کوتاه می‌شود ═══
  //
  // همین نگهبان، وقتی نوشته شد، **هفت** فایل را گرفت که همین الگو را
  // روی مسیرهای دیگری دارند: `/api/health` · `/api/positions` ·
  // `/api/daily`. آن‌ها همین عیب را دارند ولی موضوعِ این دور نبودند، و
  // بستنشان در همین کامیت یعنی یک تغییرِ بزرگ‌تر و کم‌آزمون‌تر.
  //
  // پس به‌جای خاموش‌کردنِ نگهبان، بدهی **ثبت** می‌شود: این فهرست فقط
  // می‌تواند کوتاه شود. هر فایلِ تازه‌ای که این الگو را بیاورد، همین‌جا
  // قرمز می‌شود.
  const KNOWN_BLIND = new Set([
    'ui/app.mjs', 'ui/scanner.mjs', 'ui/tabs/chain.mjs', 'ui/tabs/positions.mjs',
    'ui/tabs/roll.mjs', 'ui/tabs/settings.mjs', 'ui/tabs/strategy.mjs',
  ]);
  const blind = [];
  for (const file of walk(path.join(ROOT, 'ui'))) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const src = stripComments(readSrc(`../${rel}`));
    const hit = /fetch\([^\n]*\)\.then\(\(r\) => r\.json\(\)\)/.test(src)
      || /await \(await fetch\([^\n]*\)\)\.json\(\)/.test(src);
    if (hit && !KNOWN_BLIND.has(rel)) blind.push(rel);
  }
  check('الگوی «json بگیر، پاسخ را نبین» جای تازه‌ای نگرفته',
    blind.length === 0, [...new Set(blind)].join(' · '));
  // و خودِ فهرست نباید بدون کوتاه‌شدن بماند: فایلی که دیگر عیب ندارد،
  // باید از فهرست هم برود، وگرنه فهرست از واقعیت جدا می‌افتد.
  const stale = [...KNOWN_BLIND].filter((rel) => {
    const src = stripComments(readSrc(`../${rel}`));
    return !/fetch\([^\n]*\)\.then\(\(r\) => r\.json\(\)\)/.test(src)
      && !/await \(await fetch\([^\n]*\)\)\.json\(\)/.test(src);
  });
  check('و فهرستِ بدهی کهنه نشده — هر چه درست شد، از فهرست هم رفت',
    stale.length === 0, stale.join(' · '));
  // این الگو روی **مسیرهای مظنه** هیچ استثنایی ندارد؛ آن‌ها همین دور بسته شدند.
  for (const rel of KNOWN_BLIND) {
    const src = stripComments(readSrc(`../${rel}`));
    check(`${rel}: بدهی‌اش به مسیرِ مظنه نمی‌رسد`,
      !/['"`]\/api\/(live-trades|books|infos)/.test(src));
  }

  const gate = readSrc('../ui/quote-intake.mjs');
  check('دروازه خودش پاسخ را می‌بیند',
    gate.includes('if (!response.ok || payload?.error)'));
  check('و قطعِ عمدی را خطا نمی‌شمارد',
    gate.includes("if (error?.name === 'AbortError') throw error;"));

  // و سرور: دفترِ خالی نشانه بگیرد، و خطا پیامش را.
  const server = readSrc('../server/server.mjs');
  check('سرور دفترِ خالی را با شکلِ خام برمی‌گرداند',
    server.includes('return [code, { book, blank: true, upstreamKind: shape.kind'));
  check('و خطای دسته‌ای دیگر فقط نامِ کلاس نیست',
    server.includes('return [code, { error: `${e.name}: ${e.message}` }];'));
  check('نوارِ زندهٔ خالی هم شکلش را می‌گوید',
    server.includes('return [code, { ...item, blank: true, upstreamKind: shape.kind'));

  // و `mergeInsPayloads` باید نامِ میدانِ دفتر را بشناسد، وگرنه دفترِ
  // خالی از شمارشِ «خالی» جا می‌افتد.
  check('شمارشِ خالی، میدانِ `book` را هم می‌شناسد',
    readSrc('../core/ins-batches.mjs').includes('Array.isArray(value?.book) ? value.book'));
}
