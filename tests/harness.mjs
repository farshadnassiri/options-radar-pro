// شمارنده و ادعاهای مشترک همهٔ دسته‌های آزمون.
//
// این فایل تنها حالت مشترک مجموعه است. هر دستهٔ آزمون در
// `tests/suites/` فقط از اینجا `check`، `near`، `group` و `readSrc` را
// می‌گیرد و هیچ حالتی با دستهٔ دیگر رد و بدل نمی‌کند.
//
// اجرا هرگز از این فایل نیست؛ از `node tests/run.mjs`.

import fs from 'node:fs';

let pass = 0, fail = 0;
export const results = [];

/**
 * خواندن متن یک فایل پروژه برای ادعاهای «کد این را دارد».
 *
 * پایان‌خط همیشه `\n` می‌شود. چرا لازم است: بیش از پنجاه ادعا در این
 * مجموعه، متنِ منبع را با الگو می‌سنجند و چند تایشان `\n` را صریح در الگو
 * دارند. روی ویندوز با `core.autocrlf=true` همان فایل‌ها `\r\n` دارند و آن
 * الگوها بی‌صدا رد می‌شوند — سیزده قابلیتِ کاملاً سالم «خراب» گزارش
 * می‌شدند و `node tests/run.mjs` که پیش از هر پوش الزامی است، هرگز سبز
 * نمی‌شد.
 *
 * `.gitattributes` ریشه را می‌بندد؛ این تابع لایهٔ دوم است، برای
 * checkoutهایی که از قبل ساخته شده‌اند. الگوی تازه‌ای هم که فردا کسی با
 * `\n` بنویسد، دیگر نمی‌تواند این کلاس خطا را برگرداند.
 *
 * مسیرها نسبت به همین `tests/` حل می‌شوند — مثل روزی که این تابع در
 * `run.mjs` بود. دسته‌ها یک پله پایین‌ترند ولی چون `readSrc` اینجا تعریف
 * شده، `import.meta.url` همان `tests/` می‌ماند و هیچ مسیری تغییر نمی‌کند.
 */
export const readSrc = (relative) => fs
  .readFileSync(new URL(relative, import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

export function check(name, cond, detail = '') {
  if (cond) { pass += 1; results.push(['✔', name, detail]); }
  else { fail += 1; results.push(['✘', name, detail]); }
}
export const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
export function group(t) { results.push(['—', t, '']); }

/**
 * گزارش پایانی و کد خروج. تنها `run.mjs` این را صدا می‌زند.
 *
 * حالت خلاصه (`--quiet`): فقط ردها و یک خط جمع‌بندی. گزارش کامل ۲۶۶۰ خط
 * است که تقریباً همه‌اش «✔» است. برای آدمی که ترمینال را می‌بیند مفید
 * است، ولی عاملی که این خروجی را در بافتار خودش می‌ریزد هر بار ده‌ها هزار
 * توکن بابت سطرهای سبز می‌دهد. قاعده: عامل با `--quiet`، آدم بدون آن.
 */
export function report() {
  const W = 62;
  if (process.argv.includes('--quiet') || process.argv.includes('-q')) {
    let head = '';
    for (const [mark, name, detail] of results) {
      if (mark === '—') { head = name; continue; }
      if (mark === '✘') console.log(` ✘ ${head} › ${name} ${detail}`);
    }
    console.log(`آزمون موتور — قبول ${pass}   رد ${fail}`);
    process.exit(fail ? 1 : 0);
  }
  console.log('\n' + '═'.repeat(W));
  console.log('  آزمون موتور — فاز ۲');
  console.log('═'.repeat(W));
  for (const [mark, name, detail] of results) {
    if (mark === '—') { console.log('\n' + name); continue; }
    const pad = name.length > 46 ? name.slice(0, 46) : name.padEnd(46, ' ');
    console.log(` ${mark} ${pad} ${detail}`);
  }

  console.log('\n' + '─'.repeat(W));
  console.log(`  قبول ${pass}   رد ${fail}`);
  console.log('─'.repeat(W) + '\n');
  process.exit(fail ? 1 : 0);
}
