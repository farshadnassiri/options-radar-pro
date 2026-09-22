// ۲۹۲. دروازهٔ ورودِ تابلوی روزانه
//
// ═══ چرا این یکی از دستهٔ ۲۹۱ هم مهم‌تر است ═══
//
// تابلوی روزانه **مرجعِ سنجشِ ریزمعامله** است: هر حکمِ «کامل» یا «ناقص»
// در کلِ برنامه روی آن بنا شده. وقتی خودِ مرجع خالی برگردد و کسی نفهمد،
// آن حکم‌ها بی‌پشتوانه می‌شوند — و این بدتر از نبودِ حکم است، چون شبیهِ
// حکم است.
//
// در خروجیِ واقعیِ ۲۰۲۶۰۷۱۴ تا ۲۰۲۶۰۹۲۱، از ۱۵۹ ابزار فقط ۱۰ تا تابلو
// داشتند و هیچ‌جای برنامه این را نگفت.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import {
  DAILY_STATE, META_KEY, dailySummary, dailyVerdict, dailyWarning, fetchDailies,
} from '../../ui/daily-intake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

group('۲۹۲. حکمِ یک ابزار');
{
  check('ابزارِ دارای ردیف قابلِ استفاده است',
    (() => { const v = dailyVerdict({ rows: [{ date: 1 }, { date: 2 }], source: 'list' });
      return v.state === 'rows' && v.usable === true && v.rows === 2; })());

  // ═══ خالی، سه علت دارد و فقط یکی واقعیتِ بازار است ═══
  check('ابزارِ خالی «تاریخچه ندارد» خوانده نمی‌شود',
    (() => { const v = dailyVerdict({ rows: [], source: 'list' });
      return v.state === 'blank' && v.usable === false; })());
  check('و اینکه منبعِ دوم امتحان شده یا نه، حمل می‌شود',
    dailyVerdict({ rows: [], fallbackTried: true }).fallbackTried === true);

  check('ابزارِ نبوده در پاسخ، «نبود» است نه «خالی»',
    dailyVerdict(undefined).state === 'missing');
  check('و خطا هم جای خودش را دارد',
    dailyVerdict({ rows: [], error: 'دروازه' }).state === 'error');
  check('هر حالت برچسبِ فارسی دارد',
    ['rows', 'blank', 'missing', 'error'].every((k) => typeof DAILY_STATE[k] === 'string'));
}

group('۲۹۲. جمع‌بندی: «بی‌مرجع» شمرده می‌شود');
{
  const verdicts = {
    a: dailyVerdict({ rows: [{ date: 1 }] }),
    b: dailyVerdict({ rows: [] }),
    c: dailyVerdict({ rows: [] }),
    d: dailyVerdict(undefined),
    e: dailyVerdict({ rows: [], error: 'x' }),
  };
  const sum = dailySummary(verdicts);
  check('هر حالت جدا شمرده می‌شود',
    sum.rows === 1 && sum.blank === 2 && sum.missing === 1 && sum.error === 1);
  // ═══ عددی که واقعاً اهمیت دارد ═══
  //
  // چهار ابزار از پنج هیچ مرجعی ندارند، پس ریزمعامله‌شان سنجیده نخواهد
  // شد — و این همان چیزی است که باید گفته شود، نه «۱ ابزار تاریخچه دارد».
  check('«بی‌مرجع» جدا و صریح شمرده می‌شود', sum.unreferenced === 4);

  const warn = dailyWarning(sum);
  check('هشدار می‌گوید چه چیزی از دست می‌رود',
    warn.includes('با هیچ مرجعی سنجیده نمی‌شود'));
  check('و بستهٔ سالم هیچ هشداری نمی‌دهد',
    dailyWarning(dailySummary({ a: verdicts.a })) === '');

  // ═══ سوءظنِ سهمیه، جملهٔ خودش را دارد ═══
  const throttled = dailySummary(
    { a: verdicts.b, b: verdicts.c },
    { suspectThrottled: true, note: 'هیچ‌کدام از ۷۰ ابزار تابلوی روزانه نداد.' },
  );
  check('سوءظنِ سهمیه حمل می‌شود', throttled.suspectThrottled === true);
  check('و جملهٔ خودش را می‌گوید، نه جملهٔ عمومی را',
    dailyWarning(throttled).includes('هیچ‌کدام از ۷۰ ابزار'));
}

group('۲۹۲. دروازه `__meta` را از ابزارها جدا می‌کند');
{
  // ═══ چرا این بند لازم است ═══
  //
  // پنج جای رابط `Object.entries(payload)` را خام می‌پیمودند. افزودنِ
  // یک کلیدِ خلاصه به پاسخ، بی این جداسازی، `__meta` را برایشان یک
  // «ابزار» می‌کرد — یعنی اصلاحِ من خودش یک باگِ تازه می‌شد.
  const payload = {
    A: { ins: 'A', rows: [{ date: 1 }] },
    B: { ins: 'B', rows: [] },
    [META_KEY]: { requested: 2, blank: 1, suspectThrottled: false, note: '' },
  };
  const fake = async () => ({ ok: true, json: async () => payload });

  const got = await fetchDailies(['A', 'B'], { fetcher: fake });
  check('`byIns` فقط ابزار دارد', Object.keys(got.byIns).sort().join() === 'A,B');
  check('و کلیدِ خلاصه داخلش نیست', !(META_KEY in got.byIns));
  check('خلاصه جدا تحویل می‌شود', got.meta?.requested === 2);
  check('و حکمِ هر ابزارِ درخواست‌شده ساخته می‌شود',
    got.verdicts.A.state === 'rows' && got.verdicts.B.state === 'blank');
  check('جمع‌بندی هم همراه می‌آید', got.summary.unreferenced === 1);

  // ابزاری که درخواست رفته ولی در پاسخ نیست، «نبود» می‌گیرد.
  const partial = await fetchDailies(['A', 'B', 'C'], { fetcher: fake });
  check('کدِ بی‌پاسخ «نبود» می‌شود', partial.verdicts.C.state === 'missing');
  check('فهرستِ خالی هیچ درخواستی نمی‌فرستد',
    (await fetchDailies([], { fetcher: () => { throw new Error('نباید صدا شود'); } })).summary.total === 0);
}

group('۲۹۲. نگهبان: هیچ تبی مستقیم تابلوی روزانه نمی‌گیرد');
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

  const ALLOWED = new Set(['ui/daily-intake.mjs']);
  const offenders = [];
  for (const file of walk(path.join(ROOT, 'ui'))) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    if (/['"`]\/api\/dailies/.test(stripComments(readSrc(`../${rel}`)))) offenders.push(rel);
  }
  check('هیچ فایلی بیرون از دروازه `/api/dailies` را صدا نمی‌زند',
    offenders.length === 0, offenders.join(' · '));

  const gate = readSrc('../ui/daily-intake.mjs');
  check('دروازه `asOf` را حمل می‌کند — منبعِ دومِ قراردادِ منقضی',
    gate.includes('asOf ? `&asOf=${encodeURIComponent(String(asOf))}` : \'\''));
  check('و `fetcher` تزریق‌پذیر است، تا آزمون شبکه نزند',
    gate.includes('fetcher = fetch'));

  // و سرور واقعاً خلاصه را می‌فرستد.
  const server = readSrc('../server/server.mjs');
  check('سرور خالی‌ها را می‌شمارد', server.includes('const blanks = settled.filter('));
  check('و پرچمِ هر ابزار را می‌گذارد', server.includes('value.blank = !(value.rows || []).length'));
  check('سوءظنِ سهمیه فقط برای بستهٔ به‌اندازه صادر می‌شود',
    server.includes('const allBlank = codes.length >= 10 && blanks.length === codes.length'));
}
