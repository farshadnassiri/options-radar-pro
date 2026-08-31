// وارد کردن فهرست تاریخی قراردادها از فایل کاربر.
//
//   node tools/roster-import.mjs <فایل.xlsx|csv> [--sheet نام] [--merge]
//
// چرا هست: اسکنِ دو سال از بالادست چند ده دقیقه طول می‌کشد و به شبکهٔ باز
// نیاز دارد. اگر کاربر همان فهرست را از قبل دارد، در چند ثانیه وارد
// می‌شود و تب‌های تاریخی همان لحظه کار می‌کنند.
//
// `--merge` روی دفترِ موجود می‌نشیند و عمرها را پهن می‌کند؛ بدون آن، دفتر
// از نو نوشته می‌شود.
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
import { makeRosterFile, mergeRoster, rosterCoverage, rosterIntake } from '../core/option-roster.mjs';

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

export function readSource(file, sheet) {
  const buf = fs.readFileSync(file);
  if (/\.xlsx$/i.test(file)) return readXlsx(buf, sheet ?? 0);
  return { sheet: path.basename(file), sheets: [], ...parseCsv(buf.toString('utf8')) };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('کاربرد: node tools/roster-import.mjs <فایل.xlsx|csv> [--sheet نام] [--merge]');
    process.exit(1);
  }
  const sheetAt = args.indexOf('--sheet');
  const sheet = sheetAt >= 0 ? args[sheetAt + 1] : undefined;
  const merge = args.includes('--merge');

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
  if (merge && fs.existsSync(ROSTER_FILE)) {
    const old = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
    const before = Array.isArray(old?.rows) ? old.rows.length : 0;
    rows = mergeRoster(old?.rows || [], rows);
    console.log(`  ادغام با دفتر موجود: ${fa(before)} + ${fa(intake.kept)} → ${fa(rows.length)}`);
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

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
