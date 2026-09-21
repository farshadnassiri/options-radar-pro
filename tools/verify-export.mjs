// راست‌آزماییِ فایلِ خروجیِ دیتا — یک حکم، به‌جای چشم‌چرانی در هزاران ردیف.
//
//   node tools/verify-export.mjs <فایل.xlsx>
//
// ═══ چرا این ابزار لازم است ═══
//
// سه نوبت ممیزی نشان داد ایرادهای کامل‌بودنِ داده در **جمعِ** ردیف‌ها
// دیده می‌شوند، نه در تکِ آن‌ها: ۸۵ ردیفِ عددِ ساختگی در ۲٬۷۱۸ ردیف، یا
// یک حفرهٔ پنج‌هفته‌ای که فقط با مرتب‌کردنِ روزها پیدا شد. کسی که فایل را
// باز می‌کند این‌ها را نمی‌بیند.
//
// این ابزار همان کنترل‌هایی را می‌زند که ممیزی‌ها زدند، و خروجی‌اش یک
// فهرستِ «قبول/رد» است. هیچ چیزی را اصلاح نمی‌کند و هیچ درخواستِ شبکه‌ای
// نمی‌فرستد — فقط همان فایل را می‌خواند.
//
// صفر وابستگی: zip با `zlib` خودِ نود باز می‌شود و XML با الگوی ساده
// خوانده. قاعدهٔ مخزن اجازهٔ npm نمی‌دهد و این ابزار هم از آن مستثنا نیست.

import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// ─────────────────────────── خواندنِ xlsx ───────────────────────────

/** فهرستِ مرکزیِ zip را می‌خواند و هر عضو را به بافر باز می‌کند. */
export function unzip(buf) {
  const out = new Map();
  // انتهای فهرست مرکزی را از آخر فایل پیدا می‌کنیم (امضای 0x06054b50).
  let end = -1;
  for (let at = buf.length - 22; at >= 0; at -= 1) {
    if (buf.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) throw new Error('فایل zip معتبر نیست');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    // سرآیندِ محلی طولِ خودش را دارد؛ دادهٔ فشرده بعد از آن می‌آید.
    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataAt, dataAt + size);
    out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&amp;/g, '&');

export function sharedStrings(files) {
  const xml = files.get('xl/sharedStrings.xml');
  if (!xml) return [];
  const text = xml.toString('utf8');
  return [...text.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
    // یک `si` می‌تواند چند `t` داشته باشد (متنِ تکه‌تکه).
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    return unescapeXml(parts.join(''));
  });
}

/** نامِ برگ‌ها به ترتیب، از `workbook.xml`. */
export function sheetOrder(files) {
  const xml = files.get('xl/workbook.xml')?.toString('utf8') || '';
  return [...xml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*\/>/g)].map((m) => unescapeXml(m[1]));
}

const colIndex = (ref) => {
  const letters = ref.replace(/\d+/g, '');
  let at = 0;
  for (const ch of letters) at = at * 26 + (ch.charCodeAt(0) - 64);
  return at - 1;
};

/** یک برگ را به آرایهٔ ردیف‌ها تبدیل می‌کند. */
export function readSheet(files, index, strings) {
  const xml = files.get(`xl/worksheets/sheet${index + 1}.xml`);
  if (!xml) return [];
  const text = xml.toString('utf8');
  const rows = [];
  for (const rowMatch of text.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cell of rowMatch[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const at = colIndex(cell[1]);
      const isShared = / t="s"/.test(cell[2]);
      const v = /<v>([\s\S]*?)<\/v>/.exec(cell[3]);
      if (!v) { cells[at] = null; continue; }
      cells[at] = isShared ? (strings[Number(v[1])] ?? '') : Number(v[1]);
    }
    rows.push(cells);
  }
  return rows;
}

// ─────────────────────────── حکم‌ها ───────────────────────────

let passed = 0, failed = 0, warned = 0;
const say = (ok, title, detail = '') => {
  if (ok === 'warn') { warned += 1; console.log(`  ⚠ ${title}${detail ? `  — ${detail}` : ''}`); return; }
  if (ok) { passed += 1; console.log(`  ✔ ${title}${detail ? `  — ${detail}` : ''}`); }
  else { failed += 1; console.log(`  ✘ ${title}${detail ? `  — ${detail}` : ''}`); }
};
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const faDate = (d) => String(d);

// ═══ چرا بدنه پشت یک شرط است ═══
//
// دستهٔ آزمون همین فایل را **وارد** می‌کند تا خواننده را با نویسندهٔ
// واقعیِ `ui/xlsx.mjs` رفت‌وبرگشت بزند — وگرنه روزی نویسنده عوض می‌شود و
// خواننده بی‌صدا چیزِ دیگری می‌خواند. بی این شرط، هر `import` کلِ ابزار
// را اجرا می‌کرد.
//
// ملاک «خودش اجرا شده» است، نه «آرگومان دارد». اولین نسخه `process.argv[2]`
// را می‌خواند و همان را فایل فرض می‌کرد — ولی وقتی دستهٔ آزمون این ماژول
// را وارد می‌کند، `argv[2]` **پالایهٔ آزمون** است و ابزار می‌رفت سراغِ
// بازکردنِ فایلی به نام «۲۸۵». مقایسهٔ مسیرِ خودِ ماژول با نقطهٔ ورود،
// قطعی است و به آرگومان کاری ندارد.
const selfRun = String(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (selfRun) {
  const file = process.argv[2];
  if (!file) {
    console.error('کاربرد:  node tools/verify-export.mjs <فایل.xlsx>');
    process.exit(2);
  }

const files = unzip(fs.readFileSync(file));
const strings = sharedStrings(files);
const names = sheetOrder(files);
const byName = new Map(names.map((name, i) => [name, i]));

const guideRows = readSheet(files, byName.get('راهنما') ?? 0, strings);
const guide = new Map(guideRows.map((r) => [String(r[0] ?? ''), r[1]]));
const covIndex = byName.get('پوشش دریافت');
const cov = covIndex === undefined ? [] : readSheet(files, covIndex, strings);
const H = (cov[0] || []).map((x) => String(x ?? ''));
const D = cov.slice(1);
const at = (name) => H.indexOf(name);

console.log(`\nفایل: ${file}`);
console.log(`برگ‌ها: ${names.length}  ·  ردیفِ پوشش: ${D.length}`);
console.log(`بازه: ${guide.get('از تاریخ') ?? '—'}  تا  ${guide.get('تا تاریخ') ?? '—'}`);
console.log(`تایم‌فریم: ${guide.get('تایم‌فریم') ?? '—'}`.slice(0, 90));
console.log(`جدول زمانی: ${String(guide.get('جدول زمانی') ?? '—').slice(0, 60)}`);

if (!D.length) {
  console.log('\nبرگ «پوشش دریافت» خالی است — چیزی برای سنجیدن نیست.');
  process.exit(1);
}

// ═════ ۱. کامل‌بودنِ دریافت ═════
console.log('\n── ۱. کامل‌بودنِ دریافت ──');
const status = (r) => String(r[at('وضعیت')] ?? '');
const count = (needle) => D.filter((r) => status(r).includes(needle)).length;
const matched = count('کامل — با تابلو تطبیق شد');
const missing = count('ریزمعامله نیامد');
const partial = count('ناقص');
const quiet = count('بدون معامله');
const unverified = count('تأییدنشده');
const errored = count('خطا') + count('درخواست نرفت');
const total = D.length;
console.log(`  تطبیق‌شده ${matched} · نیامد ${missing} · ناقص ${partial} · بی‌معامله ${quiet}`
  + ` · تأییدنشده ${unverified} · خطا ${errored}  (از ${total})`);
say(missing === 0, 'هیچ ابزار/روزی «نیامد» نیست',
  missing ? `${missing} ابزار/روز تابلو معامله ثبت کرده ولی ریزمعامله نیامد` : '');
say(partial === 0, 'هیچ پاسخِ ناقصی نمانده', partial ? `${partial} ابزار/روز کمتر از تابلو` : '');
say(errored === 0, 'هیچ خطای دریافتی نمانده', errored ? `${errored} ابزار/روز` : '');
const coverage = total ? (matched + quiet) / total : 0;
say(coverage >= 0.995, 'پوششِ تأییدشده دست‌کم ۹۹٫۵٪ است',
  `${(coverage * 100).toFixed(1)}٪ تأییدشده`);
say(unverified === 0 ? true : 'warn', 'هر ابزار/روز مرجعِ روزانه داشت',
  unverified ? `${unverified} ابزار/روز تابلوی روزانه‌اش در دست نبود` : '');

// ═════ ۲. عددِ ساختگی ═════
console.log('\n── ۲. عددِ ساختگی (باگِ نوبت‌های قبل) ──');
const shortAt = at('کسریِ نسبت به تابلو'), boardAt = at('معاملهٔ تابلوی روزانه');
let bogus = 0;
if (shortAt >= 0 && boardAt >= 0) {
  bogus = D.filter((r) => {
    const s = String(r[shortAt] ?? '');
    if (!s || s === 'تطبیق کامل') return false;
    // ادعای کسری روی ردیفی که اصلاً تابلویی ندارد = عددِ بی‌پشتوانه.
    return r[boardAt] === null || r[boardAt] === undefined || r[boardAt] === '';
  }).length;
}
say(bogus === 0, 'هیچ ادعای کسری بی پشتوانهٔ تابلو نیست',
  bogus ? `${bogus} ردیف کسری ادعا می‌کند ولی ستون تابلویش خالی است` : '');

// ═════ ۳. سازگاریِ درونی ═════
console.log('\n── ۳. سازگاریِ درونیِ فایل ──');
const rowsAt = at('کل ردیف'), activeAt = at('فعال'), cancelAt = at('باطل');
const sumRows = D.reduce((s, r) => s + num(r[rowsAt]), 0);
const sumActive = D.reduce((s, r) => s + num(r[activeAt]), 0);
const sumCancel = D.reduce((s, r) => s + num(r[cancelAt]), 0);
say(sumActive + sumCancel === sumRows, '«فعال» + «باطل» = «کل ردیف»',
  `${sumActive} + ${sumCancel} = ${sumActive + sumCancel} در برابر ${sumRows}`);
const claimed = Number(String(guide.get('نتیجهٔ دریافت') ?? '').match(/\d+/)?.[0] || 0);
say(claimed === sumRows, 'ادعای برگ راهنما با جمعِ برگ پوشش می‌خواند',
  `راهنما ${claimed} · پوشش ${sumRows}`);
const outAt = at('خارج از جلسهٔ بازار'), winAt = at('خارج از پنجرهٔ انتخابی');
if (outAt >= 0 && winAt >= 0) {
  const custom = /این پنجره را خودِ شما/.test(String(guide.get('پنجرهٔ ساعت') ?? ''));
  const same = D.every((r) => num(r[outAt]) === num(r[winAt]));
  say(custom ? true : same, custom ? 'پنجرهٔ سفارشی اعمال شده' : 'دو ستونِ بیرون‌ماندن هم‌خوان‌اند',
    custom ? 'ستونِ پنجرهٔ انتخابی جدا شمرده می‌شود' : '');
}

// ═════ ۴. توزیعِ زمانیِ شکاف ═════
console.log('\n── ۴. شکاف در زمان (حفرهٔ پیوسته را لو می‌دهد) ──');
const dateAt = at('تاریخ میلادی');
const byDay = new Map();
for (const r of D) {
  const d = num(r[dateAt]);
  if (!d) continue;
  const cell = byDay.get(d) || { miss: 0, all: 0 };
  cell.all += 1;
  if (status(r).includes('ریزمعامله نیامد')) cell.miss += 1;
  byDay.set(d, cell);
}
const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
const badDays = days.filter(([, c]) => c.miss > 0);
say(badDays.length === 0, 'هیچ روزی شکاف ندارد', badDays.length ? `${badDays.length} روز از ${days.length}` : '');
// بلوکِ پیوستهٔ خراب، امضای «سهمیه/بالادست» است، نه بازارِ ساکت.
let runStart = null, longest = 0, longestAt = null, run = 0;
for (const [d, c] of days) {
  const bad = c.all > 0 && c.miss / c.all > 0.5;
  if (bad) { run += 1; if (runStart === null) runStart = d; if (run > longest) { longest = run; longestAt = runStart; } }
  else { run = 0; runStart = null; }
}
say(longest === 0, 'بلوکِ پیوستهٔ روزهای خراب وجود ندارد',
  longest ? `${longest} روزِ پیاپی از ${faDate(longestAt)} — امضای فشارِ سهمیه یا قطعیِ بالادست، نه بازارِ ساکت` : '');
if (badDays.length) {
  console.log('    بدترین روزها:');
  for (const [d, c] of [...badDays].sort((a, b) => b[1].miss - a[1].miss).slice(0, 5)) {
    console.log(`      ${faDate(d)}  ${c.miss}/${c.all} نیامد`);
  }
}

// ═════ ۵. تلاشِ تکمیلی ═════
console.log('\n── ۵. تلاشِ تکمیلی ──');
const tryAt = at('تلاش دریافت');
if (tryAt < 0) {
  say('warn', 'ستون «تلاش دریافت» در فایل نیست', 'فایل با نسخهٔ پیش از این قابلیت ساخته شده');
} else {
  const tries = D.map((r) => Number(String(r[tryAt] ?? '').match(/\d+/)?.[0] || 0));
  const most = Math.max(0, ...tries);
  const retried = tries.filter((t) => t > 1).length;
  const gapRetried = D.filter((r, i) => status(r).includes('نیامد') && tries[i] > 1).length;
  console.log(`  بیشینهٔ تلاش ${most} · ${retried} ابزار/روز بیش از یک بار پرسیده شدند`);
  say(missing === 0 || gapRetried === missing,
    'هر ابزار/روزِ «نیامد» تلاشِ تکمیلی دیده است',
    missing ? `${gapRetried} از ${missing} تا` : 'شکافی نمانده');
}

// ═════ ۶. برگ‌های ابزار ═════
console.log('\n── ۶. برگ‌های ابزار ──');
const nameAt = at('نماد ابزار');
const rawByName = new Map();
for (const r of D) {
  const key = String(r[nameAt] ?? '');
  rawByName.set(key, (rawByName.get(key) || 0) + num(r[rowsAt]));
}
let over = 0, emptyWithData = 0, checkedBars = 0, badState = 0;
for (const [name, index] of byName) {
  if (name === 'راهنما' || name === 'پوشش دریافت') continue;
  const rows = readSheet(files, index, strings);
  const body = rows.slice(1);
  const key = rawByName.has(name) ? name : name.replace(/^پایه /, '');
  const raw = rawByName.get(key) ?? 0;
  if (body.length > raw && raw > 0) over += 1;
  if (body.length === 0 && raw > 0) emptyWithData += 1;
  const head = (rows[0] || []).map((x) => String(x ?? ''));
  const stateAt = head.indexOf('معامله شد');
  if (stateAt >= 0) {
    checkedBars += 1;
    // سطلِ «دریافت نشد» یا «نامعلوم» نباید هیچ عددِ مالی داشته باشد.
    const volAt = head.indexOf('حجم'), tradeAt = head.indexOf('تعداد معامله');
    for (const r of body) {
      const st = String(r[stateAt] ?? '');
      if ((st === 'دریافت نشد' || st === 'نامعلوم')
        && (Number.isFinite(r[volAt]) || Number.isFinite(r[tradeAt]))) { badState += 1; break; }
    }
  }
}
say(over === 0, 'هیچ برگی بیشتر از ریزمعاملهٔ خودش ردیف ندارد', over ? `${over} برگ` : '');
say(emptyWithData === 0, 'هیچ برگی با وجودِ داده خالی نیست', emptyWithData ? `${emptyWithData} برگ` : '');
say(badState === 0, 'سطلِ دریافت‌نشده هیچ عددِ مالی ندارد',
  badState ? `${badState} برگ عددِ ساختگی دارد` : (checkedBars ? '' : 'ستونِ وضعیت در برگ‌ها نبود'));

// ═════ حکم ═════
console.log(`\n${'─'.repeat(52)}`);
console.log(`قبول ${passed} · رد ${failed} · هشدار ${warned}`);
if (failed === 0 && missing === 0 && partial === 0) {
  console.log('حکم: این فایل دادهٔ کاملِ بازه را دارد.');
} else if (failed === 0) {
  console.log('حکم: ساختارِ فایل سالم است ولی دریافت کامل نیست — «تلاش تکمیلی» را بزنید.');
} else {
  console.log('حکم: ایرادِ ساختاری پیدا شد؛ خط‌های ✘ بالا را بفرستید.');
}
process.exit(failed ? 1 : 0);
}
