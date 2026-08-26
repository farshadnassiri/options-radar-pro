// درصد پیشرفت پروژه — از جدول وزن‌دار نقشهٔ فازها، نه از حافظهٔ کسی.
//
// چرا هست: درصد پیشرفت در `PORTFOLIO_TIME_TRAVEL.md` دستی نگهداری می‌شد.
// هر بار که قلمی بسته می‌شد، سه عدد باید با هم عوض می‌شدند — شمار
// انجام‌شده، درصد کسب‌شدهٔ همان فاز، و جمع کل. یکی‌شان جا می‌ماند و از آن
// به بعد هیچ‌کس نمی‌دانست کدام عدد راست می‌گوید.
//
// اینجا فقط یک چیز دستی می‌ماند: «۷ از ۷». بقیه محاسبه می‌شود، و اگر عددِ
// نوشته‌شده با محاسبه نخواند، همین‌جا قرمز می‌شود.
//
// اجرا:
//   node tools/progress.mjs           جدول و جمع کل
//   node tools/progress.mjs --line    یک خط، برای پایان دروازه
//   node tools/progress.mjs --check   فقط بسنج؛ اختلاف = خروج ۱

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLAN = 'PORTFOLIO_TIME_TRAVEL.md';

const FA = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
const latin = (value) => String(value ?? '').replace(/[۰-۹]/g, (d) => FA[d]).replace(/٫/g, '.');
const num = (value) => {
  const parsed = Number(latin(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
};
const faNum = (value) => {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return text.replace(/\./g, '٫').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
};

/** جدول وزن‌دار را می‌خواند و از «چند از چند» درصد را خودش درمی‌آورد. */
export function readProgress(root = ROOT) {
  const src = fs.readFileSync(path.join(root, PLAN), 'utf8').replace(/\r\n/g, '\n');
  const rows = [];
  for (const line of src.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    const counted = /^([۰-۹0-9]+)\s+از\s+([۰-۹0-9]+)$/.exec(cells[2]);
    if (!counted) continue;
    const weight = num(cells[1]);
    const done = num(counted[1]);
    const total = num(counted[2]);
    if (!Number.isFinite(weight) || !Number.isFinite(done) || !Number.isFinite(total) || total <= 0) continue;
    rows.push({
      title: cells[0], weight, done, total,
      stated: num(cells[3]),
      earned: Math.round((weight * done / total) * 10) / 10,
    });
  }

  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  const earned = Math.round(rows.reduce((sum, r) => sum + r.weight * r.done / r.total, 0) * 10) / 10;
  const items = rows.reduce((sum, r) => sum + r.total, 0);
  const itemsDone = rows.reduce((sum, r) => sum + r.done, 0);

  const declared = /\*\*پیشرفت کل:\s*([۰-۹0-9٫.]+)٪/.exec(src);
  return {
    rows,
    earned,
    totalWeight,
    items,
    itemsDone,
    declared: declared ? num(declared[1]) : NaN,
  };
}

const progress = readProgress();
const drift = progress.rows.filter((r) => Math.abs(r.stated - r.earned) > 0.05);
const totalDrift = Math.abs(progress.declared - progress.earned) > 0.05;

const line = `پیشرفت پروژه: ${faNum(progress.earned)}٪ — ${faNum(progress.itemsDone)} از ${faNum(progress.items)} وظیفهٔ پذیرفته‌شده`;

if (process.argv.includes('--line')) {
  console.log(line);
} else if (!process.argv.includes('--check')) {
  const W = 62;
  console.log('\n' + '═'.repeat(W));
  console.log('  پیشرفت پروژه — از جدول وزن‌دار نقشهٔ فازها');
  console.log('═'.repeat(W));
  for (const row of progress.rows) {
    const bars = Math.round((row.done / row.total) * 20);
    const bar = '█'.repeat(bars) + '░'.repeat(20 - bars);
    console.log(` ${bar}  ${faNum(row.earned).padStart(5)}٪ از ${faNum(row.weight)}٪   ${row.title}`);
  }
  console.log('─'.repeat(W));
  console.log(`  ${line}`);
  console.log(`  باقی‌مانده: ${faNum(Math.round((progress.totalWeight - progress.earned) * 10) / 10)}٪`);
  console.log('─'.repeat(W) + '\n');
}

if (drift.length || totalDrift) {
  for (const row of drift) {
    console.error(` ✘ «${row.title}» نوشته ${faNum(row.stated)}٪ ولی از ${faNum(row.done)} از ${faNum(row.total)} می‌شود ${faNum(row.earned)}٪`);
  }
  if (totalDrift) {
    console.error(` ✘ جمع کل نوشته ${faNum(progress.declared)}٪ ولی از ردیف‌ها ${faNum(progress.earned)}٪ درمی‌آید`);
  }
  console.error('   عدد را در PORTFOLIO_TIME_TRAVEL.md با محاسبه یکی کنید.');
  process.exit(1);
}
