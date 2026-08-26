// آزمون صحت‌سنجی موتور — بارگذارِ مجموعه.
//
// قاعده کار: تا این آزمون‌ها پاس نشوند، هیچ استراتژی تازه‌ای اضافه نمی‌شود.
// هر ادعا مستقل است و هیچ‌کدام به شبکه نیاز ندارد.
//
// این فایل خودش هیچ ادعایی ندارد. ادعاها در `tests/suites/` هستند، هر
// دسته یک فایل. برای افزودن آزمون تازه سراغ دستهٔ مربوط بروید — این فایل
// دست نمی‌خورد و دو کار موازی روی یک فایل به هم نمی‌خورند.
//
// اجرا:  node tests/run.mjs
// یک دسته:  node tests/run.mjs 042        (پیشوند عددی یا بخشی از نام)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { report } from './harness.mjs';

const SUITES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'suites');
const filter = process.argv.slice(2).find((a) => !a.startsWith('-')) || '';

const files = fs.readdirSync(SUITES)
  .filter((f) => f.endsWith('.mjs'))
  .sort()
  .filter((f) => !filter || f.includes(filter));

if (!files.length) {
  console.error(`هیچ دسته‌ای با «${filter}» پیدا نشد. فهرست: node tests/run.mjs`);
  process.exit(1);
}

for (const f of files) {
  // `pathToFileURL` لازم است، نه تزیین: روی ویندوز مسیر مطلق `D:\...` است و
  // `import()` پویا آن را رد می‌کند («absolute paths must be valid file://
  // URLs»). job ویندوزِ CI دقیقاً همین را گرفت.
  await import(pathToFileURL(path.join(SUITES, f)).href);
}

report();
