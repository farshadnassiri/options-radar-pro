// وارد کردن فهرست تاریخی قراردادها از فایل کاربر.
//
//   node tools/roster-import.mjs <فایل.xlsx|csv> [--sheet نام] [--merge] [--repair]
//
// چرا هست: اسکنِ دو سال از بالادست چند ده دقیقه طول می‌کشد و به شبکهٔ باز
// نیاز دارد. اگر کاربر همان فهرست را از قبل دارد، در چند ثانیه وارد
// می‌شود و تب‌های تاریخی همان لحظه کار می‌کنند.
//
// `--merge` روی دفترِ موجود می‌نشیند و عمرها را پهن می‌کند؛ بدون آن، دفتر
// از نو نوشته می‌شود.
//
// `--repair` پیش از ادغام، کدهای گردشدهٔ دفترِ موجود را با کدِ درستِ همین
// فایل عوض می‌کند. لازم شد چون دفترهایی که پیش از `core/json-safe.mjs`
// ساخته شده‌اند کدِ هفده‌رقمیِ گردشده دارند، و ادغامِ ساده درستش نمی‌کند:
// کلیدِ ادغام خودِ کد است، پس کدِ درست و کدِ گردشده دو ردیف جدا می‌مانند.
//
// ═══ چرا گزارشِ «چه چیزی نیامد» چاپ می‌شود ═══
//
// خواستهٔ صریح صاحب پروژه این بود که «چیزی از گذشته جا نماند». تنها راهِ
// صادقانهٔ سنجشش، همان عددِ ردیف‌های کنارگذاشته است. فهرستی که فقط
// می‌گوید «۷۹۳۳ قرارداد وارد شد» ممکن است هزار تا را بی‌صدا انداخته باشد.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx } from '../core/xlsx-read.mjs';
import {
  blockingTwins, makeRosterFile, mergeRoster, repairRoster, rosterCoverage,
  rosterIntake, suspectIds,
} from '../core/option-roster.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ROSTER_FILE = path.join(ROOT, 'data', 'option-roster.json');

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/**
 * CSV ساده — همان چیزی که خروجی اسکریپت کاربر است.
 *
 * فیلدِ داخل گیومه با ویرگول و خطِ تازه پشتیبانی می‌شود؛ نامِ قرارداد
 * ویرگول دارد («۱۲,۰۰۰») و بدون این، ستون‌ها جابه‌جا می‌شدند.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0].map((h) => h.trim());
  const body = rows.slice(1).filter((r) => r.some((c) => c !== '')).map((cells) => {
    const obj = {};
    for (let i = 0; i < header.length; i += 1) if (header[i]) obj[header[i]] = cells[i] ?? null;
    return obj;
  });
  return { header, rows: body };
}

/**
 * پروندهٔ نبوده، یک جمله می‌گیرد نه یک ردِ پشتهٔ Node.
 *
 * صاحب پروژه دستور را با نامِ ساده اجرا کرد و چهارده خط ردِ پشته گرفت که
 * هیچ‌کدامشان نمی‌گفتند چه باید بکند. مسیرِ مطلق هم چاپ می‌شود، چون در
 * WSL «فایل کنارِ من است» و «فایل در پوشهٔ ویندوز است» به‌چشم یکی‌اند.
 */
export function readSource(file, sheet) {
  if (!fs.existsSync(file)) {
    const err = new Error([
      `پروندهٔ «${file}» پیدا نشد.`,
      `  دنبالش گشتم در: ${path.resolve(file)}`,
      '  مسیر کامل بدهید. اگر WSL هستید، پوشهٔ دانلودِ ویندوز معمولاً اینجاست:',
      '    ls /mnt/c/Users/*/Downloads/*.xlsx',
      '    find ~ -name "tsetmc_historical*" 2>/dev/null',
    ].join('\n'));
    err.friendly = true;
    throw err;
  }
  const buf = fs.readFileSync(file);
  if (/\.xlsx$/i.test(file)) return readXlsx(buf, sheet ?? 0);
  return { sheet: path.basename(file), sheets: [], ...parseCsv(buf.toString('utf8')) };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('کاربرد: node tools/roster-import.mjs <فایل.xlsx|csv> [--sheet نام] [--merge] [--repair]');
    process.exit(1);
  }
  const sheetAt = args.indexOf('--sheet');
  const sheet = sheetAt >= 0 ? args[sheetAt + 1] : undefined;
  const merge = args.includes('--merge');
  const repair = args.includes('--repair');

  const source = readSource(file, sheet);
  console.log(`خوانده شد: ${path.basename(file)}${source.sheet ? ` › ${source.sheet}` : ''} — ${fa(source.rows.length)} ردیف`);
  if (source.sheets?.length > 1) console.log(`  برگه‌های دیگر: ${source.sheets.join('، ')}`);

  const intake = rosterIntake(source.rows);
  console.log(`  پذیرفته ${fa(intake.kept)} · غیر-اختیار ${fa(intake.notOption)} · نامِ ناخوانا ${fa(intake.unparsed)}`);
  if (intake.unparsed) {
    console.log('  نمونهٔ ناخوانا (هیچ عددی برایشان حدس زده نشد):');
    for (const s of intake.skipped.slice(0, 5)) console.log(`    ${s.symbol} | ${s.name}`);
  }
  if (!intake.kept) {
    console.error('هیچ قراردادی خوانده نشد — پروندهٔ خالی نوشته نمی‌شود.');
    process.exit(1);
  }

  let rows = intake.rows;
  if ((merge || repair) && fs.existsSync(ROSTER_FILE)) {
    const old = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
    let oldRows = Array.isArray(old?.rows) ? old.rows : [];
    const before = oldRows.length;
    if (repair) {
      const suspects = suspectIds(oldRows);
      const done = repairRoster(oldRows, intake.rows);
      oldRows = done.rows;
      console.log(`  ترمیم کد: ${fa(done.fixed)} کدِ گردشده با کدِ درستِ این فایل عوض شد`);
      if (suspects) {
        console.log(`  ${fa(suspects)} کدِ دیگر هم مشکوک‌اند (بزرگ‌تر از مرز امن و بی‌تغییر از Number)؛`);
        console.log('  ولی این فایل کدِ درستشان را ندارد، پس دست نخوردند.');
      }
    }
    // ── ادغامِ بی‌ترمیم، دفتر را دو برابر می‌کند ──────────────────────
    //
    // کلیدِ ادغام خودِ کد است. اگر دفتر کدِ گردشده داشته باشد و این فایل
    // کدِ درست را، آن دو **دو کلیدِ متفاوت‌اند**: به‌جای تعمیر، ردیف
    // تکراری ساخته می‌شود.
    //
    // صاحب پروژه دقیقاً همین را دید — ۸۸۳۰ + ۷۹۳۳ → ۱۴۱۹۴، یعنی ۵۳۶۴
    // قرارداد تکراری — و هیچ‌چیز هشدار نداد. متوقف شدن از خراب کردنِ
    // بی‌صدای دفتر بهتر است.
    {
      const twins = blockingTwins(oldRows, intake.rows, { repair });
      if (twins.length) {
        console.error(`\nدفترِ موجود ${fa(twins.length)} کدِ گردشده دارد که کدِ درستشان در این فایل هست.`);
        console.error('ادغام بی‌ترمیم، به‌جای تعمیرشان همان‌قدر ردیف تکراری می‌سازد.');
        console.error('  نمونه:');
        for (const t of twins.slice(0, 3)) console.error(`    ${t.symbol}  ${t.wrong} → ${t.right}`);
        console.error('\n`--repair` را اضافه کنید. دفتر دست‌نخورده ماند.');
        process.exit(2);
      }
    }
    if (!merge) { rows = oldRows; console.log('  فقط ترمیم — هیچ ردیف تازه‌ای اضافه نشد.'); }
    else {
      rows = mergeRoster(oldRows, rows);
      console.log(`  ادغام با دفتر موجود: ${fa(before)} + ${fa(intake.kept)} → ${fa(rows.length)}`);
    }
  }

  const coverage = rosterCoverage(rows);
  const out = makeRosterFile(rows, {
    scannedFrom: coverage.from, scannedTo: coverage.to,
    at: Math.floor(Date.now() / 1000), intake,
  });
  fs.mkdirSync(path.dirname(ROSTER_FILE), { recursive: true });
  fs.writeFileSync(ROSTER_FILE, JSON.stringify(out), 'utf8');

  console.log(`\nدفتر نوشته شد: data/option-roster.json`);
  console.log(`  ${fa(coverage.count)} قرارداد · ${fa(coverage.bases)} نماد پایه · از ${fa(coverage.from)} تا ${fa(coverage.to)}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (e) {
    // خطای شناخته‌شده یک جمله است؛ بقیه ردِ پشته می‌گیرند چون واقعاً
    // نقصِ برنامه‌اند و باید دیده شوند.
    if (e?.friendly) { console.error(e.message); process.exit(1); }
    throw e;
  }
}
