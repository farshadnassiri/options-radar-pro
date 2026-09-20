// ۲۷۵. ردیفِ آمارِ «موقعیت‌های من» — کاشی برای عدد، نوار برای شمارش
//
// ═══ تصمیمی که این دسته قفل می‌کند ═══
//
// ردیفِ کاشی‌ها هفت‌تا بود. کاشی وزنِ یک عددِ مهم را دارد؛ با هفت کاشیِ
// هم‌اندازه هیچ‌کدام مهم نبود. سه‌تایشان هم اصلاً عددِ پولی نبودند بلکه
// شمارشِ وضعیت بودند — «۱۲ نماد قیمت‌خورده»، «۱ سررسیدگذشته». آن‌ها به
// نوارِ خطیِ زیرِ ردیف رفتند.
//
// **چیزی حذف نشد** و همین مهم‌ترین ادعای این دسته است: هر چیزی که پیش از
// این در کاشی گفته می‌شد، هنوز یک جایی روی صفحه گفته می‌شود. اگر روزی
// کسی برای کوتاه‌کردنِ ردیف یکی را بیندازد، اینجا قرمز می‌شود.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';

const src = readSrc('../ui/tabs/positions.mjs');
const css = readSrc('../ui/style.css');
// تکهٔ سازندهٔ کاشی‌ها و نوار
const block = src.slice(src.indexOf("root.querySelector('#kpis')"), src.indexOf("root.querySelector('#daily-note')"));

group('۲۷۵. ردیفِ آمارِ موقعیت‌ها');
{
  const tiles = [...block.matchAll(/\n      \['([^']+)',/g)].map((m) => m[1]);
  check('چهار کاشی، نه بیشتر', tiles.length === 4, tiles.join('، '));
  check('و هر چهارتا عددِ پولی یا درصدند',
    ['سود و زیان جاری', 'تغییر امروز', 'بازده از ورود', 'وجه تضمین امروز']
      .every((name) => tiles.includes(name)), tiles.join('، '));

  // آنچه از کاشی بیرون آمد باید در نوار باشد — نه جای دیگر، نه هیچ‌جا.
  const strip = block.slice(block.indexOf("#kpi-meta"));
  for (const [what, needle] of [
    ['موقعیت باز', 'موقعیت باز'],
    ['قیمت‌گیری', 'قیمت‌گیری'],
    ['سررسیدگذشته', 'سررسیدگذشته'],
    ['شرطِ برقرار', 'شرطِ برقرار'],
  ]) check(`«${what}» در نوارِ خطی هست`, strip.includes(needle));

  // شمارِ شرط، **موقعیت** است نه شرط: یک موقعیت می‌تواند سه شرط داشته باشد.
  check('شمارِ شرط از موقعیت‌های شرط‌دار می‌آید نه از تعداد شرط‌ها',
    /const firingCount = \[\.\.\.firingByIndex\.values\(\)\]\.filter\(\(list\) => list\.length\)\.length;/.test(src));
  // بخشِ بی‌خبر نباید بیاید: «صفر سررسیدگذشته» خبر نیست.
  check('بخشِ خالی از نوار حذف می‌شود', /\.filter\(Boolean\)\.join\('<i><\/i>'\)/.test(block));

  check('ظرفِ نوار در نشانه‌گذاری هست', /<div class="kpi-meta" id="kpi-meta"><\/div>/.test(src));
  check('و شیوه‌نامه نوار را می‌شناسد', /\.kpi-meta \{[^}]*display:\s*flex/.test(css));

  // شمارِ ردیف کنارِ عنوانِ کارت، و پنهان وقتی صفر است — نشانِ «۰ ردیف»
  // چیزی نمی‌گوید و فقط یک لکهٔ خاکستری کنار عنوان است.
  check('شمارِ ردیف کنارِ عنوانِ جدول می‌نشیند', /<h3>موقعیت‌های باز<span class="scope" id="open-count" hidden><\/span><\/h3>/.test(src));
  check('و با صفر ردیف پنهان می‌ماند', /openCount\.hidden = !openRows\.length;/.test(src));
}

group('۲۷۵-ب. شکلِ کیت');
{
  // گردی: یک زبان. قرصِ کامل فقط برای تراشه و نشان می‌ماند.
  check('گردیِ کنترل ۱۰ است، نه قرصِ کامل', /--radius-control:\s*10px/.test(css));
  // سرستون روی سطحِ کارت می‌نشیند: با `--ground` در پوستهٔ تیره از خودِ
  // کارت تیره‌تر می‌شد و «فرورفته» دیده می‌شد.
  const th = css.slice(css.indexOf('table.data thead th {'));
  check('سرستونِ جدول از پلهٔ دومِ سطح رنگ می‌گیرد، نه از زمینهٔ صفحه',
    /background:\s*var\(--panel-2\)/.test(th.slice(0, 400)));
  // ردیفِ کاشی نباید برای ستونِ خالی جا نگه دارد.
  check('ردیفِ کاشی ستونِ خالی نمی‌سازد', /\.kpis \{[^}]*repeat\(auto-fit,/.test(css));
}


group('۲۷۵-پ. بک‌تیک داخلِ کامنتِ HTML، رشتهٔ الگو را می‌بندد');
{
  // ═══ باگی که این گروه جوابش است ═══
  //
  // در کامنتِ HTML داخلِ یک رشتهٔ الگو، نامِ یک کلاس را با بک‌تیک نوشتم —
  // همان‌طور که در کامنت‌های JS این فایل‌ها می‌نویسیم. بک‌تیک رشته را
  // **بست** و باقیِ الگو یک فراخوانِ tagged template شد:
  //
  //     root.innerHTML = `…<!-- `.scope` … -->…`
  //                            └── اینجا رشته تمام شد
  //
  // نتیجه در مرورگر: «".scope" is not a function» و تبِ «موقعیت‌های من»
  // با پیامِ «تب باز نشد» بالا نیامد. نحو خطا نمی‌دهد — کد کاملاً معتبر
  // است — پس `node --check` و کل دروازه سبز ماندند و فقط اجرای واقعی در
  // مرورگر گرفتش. این ادعا همان کلاس خطا را در همهٔ نماها می‌بندد.
  // فهرست‌کردن با `fs` است ولی **خواندن** با `readSrc`: نگهبان ۷ درست
  // می‌گوید که هر ادعای «کد این را دارد» باید از خوانندهٔ نرمال‌کننده رد
  // شود، وگرنه روی ویندوز با `\r\n` بی‌صدا رد می‌شود.
  const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const offenders = [];
  for (const file of walk(UI).filter((f) => f.endsWith('.mjs'))) {
    const text = readSrc(path.relative(path.join(UI, '..', 'tests'), file).split(path.sep).join('/'));
    for (const match of text.matchAll(/<!--[\s\S]*?-->/g)) {
      if (match[0].includes('`')) offenders.push(`${path.basename(file)}: ${match[0].slice(0, 40)}…`);
    }
  }
  check('هیچ کامنتِ HTML در نماها بک‌تیک ندارد', offenders.length === 0, offenders.slice(0, 3).join(' | '));
}
