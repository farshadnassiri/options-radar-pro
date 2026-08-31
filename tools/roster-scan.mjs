// ساختِ دفتر قراردادها با پیمودنِ روزبه‌روزِ بالادست.
//
//   node tools/roster-scan.mjs --from 20240901 --to 20260829 [--merge] [--delay 150]
//
// این همان کاری است که فایل پایتونِ صاحب پروژه می‌کرد، ولی داخل خودِ
// برنامه و با همان قاعده‌های مالی مخزن. دلیل انتقالش به اینجا این نبود که
// آن اسکریپت کار نمی‌کرد؛ این بود که خروجی‌اش با دستِ آدم جابه‌جا می‌شد و
// هر بار که بازار جلو می‌رفت، دفتر عقب می‌ماند.
//
// ═══ checkpoint، و چرا بی‌آن این ابزار بی‌فایده است ═══
//
// دو سال یعنی حدود پانصد روزِ کاری و پانصد درخواست. یک قطعیِ شبکه در روزِ
// چهارصدم نباید یعنی از نو. پس هر بیست روز، همان لحظه روی دیسک نوشته
// می‌شود و اجرای بعدی از همان‌جا ادامه می‌دهد.
//
// ═══ روزی که پاسخ نداد، «خالی» نیست ═══
//
// روزِ خطادار در فهرست `failed` می‌ماند و در گزارش می‌آید. اگر بی‌صدا رد
// می‌شد، دفتر یک حفرهٔ نامرئی داشت — و دقیقاً همان حفره می‌توانست
// قراردادی باشد که کاربر دنبالش است.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayPath, scanDay, tradingDays } from '../core/roster-scan.mjs';
import { makeRosterFile, mergeRoster, rosterCoverage } from '../core/option-roster.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROSTER_FILE = path.join(ROOT, 'data', 'option-roster.json');
const CHECKPOINT = path.join(ROOT, 'data', 'option-roster.checkpoint.json');

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseUrl() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8'));
    if (s?.apiBase) return String(s.apiBase).replace(/\/+$/, '');
  } catch { /* پیش‌فرض پایین می‌نشیند */ }
  return 'https://cdn.tsetmc.com/api';
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
};

async function getJson(url, tries = 4) {
  let last = null;
  for (let n = 1; n <= tries; n += 1) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
      if (n < tries) await sleep(Math.min(2 ** n, 8) * 1000);
    }
  }
  throw last;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, def = null) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 && args[at + 1] ? args[at + 1] : def;
  };
  const today = new Date();
  const compact = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const to = flag('to', String(compact(today)));
  const from = flag('from', String(compact(new Date(today.getTime() - 730 * 86400000))));
  const delay = Number(flag('delay', '150')) || 150;
  const merge = args.includes('--merge');

  const days = tradingDays(from, to);
  if (!days.length) {
    console.error('بازه خالی است — `--from` و `--to` باید هشت رقم میلادی و مرتب باشند.');
    process.exit(1);
  }

  let rows = [], done = new Set(), failed = [];
  if (fs.existsSync(CHECKPOINT)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
      rows = Array.isArray(cp?.rows) ? cp.rows : [];
      done = new Set(cp?.done || []);
      failed = Array.isArray(cp?.failed) ? cp.failed : [];
      console.log(`ادامه از checkpoint — ${fa(done.size)} روز انجام‌شده، ${fa(rows.length)} قرارداد`);
    } catch { /* checkpoint خراب، از نو */ }
  }

  const base = baseUrl();
  console.log(`اسکن ${fa(days.length)} روزِ کاری از ${fa(from)} تا ${fa(to)} روی ${base}`);

  let n = 0, seenTotal = 0, unparsedTotal = 0;
  const save = () => fs.writeFileSync(CHECKPOINT, JSON.stringify({ rows, done: [...done], failed }), 'utf8');

  for (const day of days) {
    n += 1;
    if (done.has(day)) continue;
    try {
      const payload = await getJson(`${base}${dayPath(day)}`);
      const got = scanDay(payload, day);
      rows = mergeRoster(rows, got.rows);
      seenTotal += got.instruments;
      unparsedTotal += got.unparsed;
      done.add(day);
    } catch (e) {
      failed.push({ date: day, error: `${e.name}: ${e.message}` });
      console.log(`  ${fa(day)} — نشد: ${e.message}`);
    }
    if (n % 20 === 0) {
      save();
      console.log(`  ${fa(n)}/${fa(days.length)} · قرارداد ${fa(rows.length)} · روزِ نشده ${fa(failed.length)}`);
    }
    await sleep(delay);
  }
  save();

  if (!rows.length) {
    console.error('هیچ قراردادی به دست نیامد — پروندهٔ خالی نوشته نمی‌شود.');
    process.exit(1);
  }

  let final = rows;
  if (merge && fs.existsSync(ROSTER_FILE)) {
    const old = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
    final = mergeRoster(old?.rows || [], rows);
  }
  const coverage = rosterCoverage(final);
  fs.writeFileSync(ROSTER_FILE, JSON.stringify(makeRosterFile(final, {
    scannedFrom: Number(from), scannedTo: Number(to), at: Math.floor(Date.now() / 1000),
  })), 'utf8');

  console.log(`\nدفتر نوشته شد: data/option-roster.json`);
  console.log(`  ${fa(coverage.count)} قرارداد · ${fa(coverage.bases)} نماد پایه · از ${fa(coverage.from)} تا ${fa(coverage.to)}`);
  console.log(`  ابزارِ دیده‌شده ${fa(seenTotal)} · نامِ ناخوانا ${fa(unparsedTotal)} · روزِ نشده ${fa(failed.length)}`);
  if (failed.length) {
    console.log('  روزهایی که نیامدند (دوباره همین دستور را بزنید؛ از checkpoint ادامه می‌دهد):');
    for (const f of failed.slice(0, 10)) console.log(`    ${fa(f.date)} — ${f.error}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
