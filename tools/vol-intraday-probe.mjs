// راستی‌آزماییِ تلاطم درون‌روزی روی دادهٔ واقعی — برای ماشینِ صاحب پروژه.
//
//   node tools/vol-intraday-probe.mjs --ua <کد پایه> [--date 20260928] [--ins <کد قرارداد>]
//   node tools/vol-intraday-probe.mjs --ua <کد پایه> --from 20260920 --to 20260930 --build
//
// سرور باید روشن باشد (`PORT`، پیش‌فرض ۸۷۸۷). سه چیز می‌سنجد:
//
//   ۱. ضبط زنده: `data/iv-live/<امروز>.jsonl` چند قاب دارد، اولین و آخرین
//      ثانیه، و بزرگ‌ترین فاصلهٔ دو قاب (خاموشیِ سرور همین‌جا دیده می‌شود).
//   ۲. دفتر سفارش تاریخ‌دار (`--ins`): `BestLimits` برای آن روز چند رویداد
//      دارد، از چه ساعتی تا چه ساعتی، و چند سطح. اگر خالی است، حالت `book`
//      بازسازی بی‌فایده است و `trades` می‌ماند.
//   ۳. `/api/vol/intraday`: منبع هر روز، شمار لحظه‌ها، و شاخص هر لحظه با
//      همان موتورِ رابط (`core/vol-intraday.mjs`) — با علتِ هر لحظهٔ خالی.
//
// `--build` ساخت روزهای «pending» را آغاز می‌کند (هزینه پیش از آن چاپ می‌شود).
//
// خروج ۰ همه سالم · ۱ چیزی کم بود · ۲ سرور در دسترس نبود.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecord } from '../core/iv-record.mjs';
import { intradayContext, transportPoints, INTRADAY_WHY, INTRADAY_SOURCES } from '../core/vol-intraday.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, def = null) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : def;
};
const has = (name) => args.includes(`--${name}`);
const base = `http://127.0.0.1:${process.env.PORT || 8787}`;
const hms = (s) => (Number.isFinite(s) ? [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':') : '—');
const tehranToday = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, ''));

const ua = flag('ua');
if (!ua) {
  console.error('--ua <کد پایه> لازم است.');
  process.exit(2);
}
const today = tehranToday();
const date = flag('date', String(today));
const from = flag('from', date), to = flag('to', date);
let bad = 0;

async function json(pathname) {
  const res = await fetch(base + pathname);
  if (!res.ok) throw new Error(`${res.status} ${pathname}`);
  return res.json();
}

let settings;
try { settings = await json('/api/settings'); } catch (e) {
  console.error(`سرور در ${base} در دسترس نیست: ${e.message}`);
  process.exit(2);
}

// ── ۱. ضبط زنده ──
console.log(`\n═══ ضبط زنده (${today}) ═══`);
const live = path.join(ROOT, 'data', 'iv-live', `${today}.jsonl`);
if (!fs.existsSync(live)) {
  console.log(`  پرونده‌ای نیست. ضبط ${settings.volRecord ? 'روشن' : 'خاموش'} است؛ فقط در جلسهٔ باز قاب می‌نویسد.`);
} else {
  const { frames, broken } = parseRecord(fs.readFileSync(live, 'utf8'));
  let gap = 0;
  for (let i = 1; i < frames.length; i += 1) gap = Math.max(gap, frames[i].t - frames[i - 1].t);
  const keys = frames.filter((f) => f.k).length;
  const mine = frames.filter((f) => f.u?.[ua]).length;
  console.log(`  ${frames.length} قاب (${keys} کامل)، ${hms(frames[0]?.t)} تا ${hms(frames.at(-1)?.t)}، بزرگ‌ترین فاصله ${gap} ثانیه، خط خراب ${broken}`);
  console.log(`  قاب‌هایی که پایهٔ ${ua} را دارند: ${mine}`);
  if (broken) bad += 1;
  if (gap > 3 * Number(settings.volRecordStepSec || 60)) console.log('  ⚠ فاصلهٔ بزرگ: سرور یا دیده‌بان آن مدت کار نمی‌کرد.');
}

// ── ۲. دفتر سفارش تاریخ‌دار ──
const ins = flag('ins');
if (ins) {
  const day = date === String(today) ? flag('bookDate', '') : date;
  console.log(`\n═══ دفتر سفارش تاریخ‌دار ${ins} / ${day || '(--date روزِ گذشته بدهید)'} ═══`);
  if (day) {
    try {
      const book = await json(`/api/hist?kind=book&ins=${ins}&date=${day}`);
      const ev = book.events || [];
      const levels = new Set(ev.map((e) => e.level));
      console.log(`  ${ev.length} رویداد از ${book.count} ردیف خام، ${hms(ev[0]?.second)} تا ${hms(ev.at(-1)?.second)}، سطح‌ها: ${[...levels].sort().join(',') || '—'}`);
      if (!ev.length) { console.log(`  خالی (${book.upstream || 'بی‌شکل'}) — حالت «book» برای این روز فایده ندارد.`); bad += 1; }
    } catch (e) { console.log(`  ✘ ${e.message}`); bad += 1; }
  }
}

// ── ۳. مسیر کامل ──
console.log(`\n═══ /api/vol/intraday ${ua} ${from}…${to} ═══`);
const mode = flag('mode', 'trades');
const grain = flag('grain', 'm15');
const got = await json(`/api/vol/intraday?ua=${ua}&from=${from}&to=${to}&grain=${grain}&mode=${mode}${has('build') ? '&build=1' : ''}`);
console.log(`  ضبط: ${JSON.stringify(got.recorder)}`);
if (got.pending) console.log(`  ${got.pending} روز ساخته نشده؛ هزینهٔ تقریبی ${got.cost.requests} درخواست${has('build') ? ' — ساخت آغاز شد' : ' (با --build بسازید)'}`);
let holidays = [], holidaysKnown = false;
try { const cal = await json('/api/vol/calendar'); holidays = cal.holidays; holidaysKnown = cal.known; } catch { /* فرضی */ }
const ctx = intradayContext(settings, { holidays, holidaysKnown });
for (const day of got.days) {
  const points = transportPoints(day, ctx);
  const ok = points.filter((pt) => Number.isFinite(pt.value));
  console.log(`\n  ${day.date} — ${INTRADAY_SOURCES[day.source] || day.source}${day.provisional ? ' (موقت)' : ''}: ${Object.keys(day.contracts || {}).length} قرارداد، ${points.length} لحظه، ${ok.length} شاخص`);
  for (const pt of points) {
    const why = pt.why === 'ok' ? '' : ` ← ${INTRADAY_WHY[pt.why] || pt.why}`;
    console.log(`    ${hms(pt.second)}  پایه ${Number.isFinite(pt.price) ? pt.price : '—'}  IV ${Number.isFinite(pt.value) ? pt.value.toFixed(2) : '—'}  [${Number.isFinite(pt.bid) ? pt.bid.toFixed(1) : '—'}…${Number.isFinite(pt.ask) ? pt.ask.toFixed(1) : '—'}]  صف ${pt.queue}${why}${pt.flags.length ? `  {${pt.flags.join(',')}}` : ''}`);
  }
  if (day.source !== 'pending' && points.length && !ok.length) bad += 1;
}
process.exit(bad ? 1 : 0);
