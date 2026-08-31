// ساختِ دفتر قراردادها — چهار مرحله، تا چیزی جا نماند.
//
//   node tools/roster-scan.mjs --from 20240901 --to 20260829 [--delay 150]
//
// ═══ چرا یک مرحله کافی نبود ═══
//
// نسخهٔ اول فقط سابقهٔ روزانه را می‌خواند و آن را «فهرست ابزارهای آن
// روز» فرض کرده بود. اجرای واقعی نشان داد این فرض غلط است: قراردادی که
// گشایش شده و هیچ معامله‌ای نداشته، در هیچ روزی ظاهر نمی‌شود. سررسید
// ۱۴۰۴/۰۱/۲۷ اهرم چهارده کال داشت و فقط هشت پوت.
//
// حالا چهار مرحله اجرا می‌شود (`core/roster-build.mjs`): سابقهٔ روزانه،
// جست‌وجوی کاتالوگ ابزار، مشخصات رسمیِ قراردادِ بی‌معامله، و کنترل جفتِ
// کال و پوت.
//
// ═══ checkpoint، و چرا بی‌آن این ابزار بی‌فایده است ═══
//
// دو سال یعنی حدود پانصد روزِ کاری، به‌اضافهٔ صدها جست‌وجو و مشخصات. یک
// قطعیِ شبکه در میانه نباید یعنی از نو. هر بیست‌وپنج قلم، وضعیت واقعی
// روی دیسک می‌نشیند و اجرای بعدی از همان‌جا ادامه می‌دهد.
//
// ═══ ناقص، «موفق» نیست ═══
//
// خروجی با کد ۲ تمام می‌شود اگر جفتِ ناقص یا درخواستِ ناموفق مانده باشد،
// و اگر هیچ جست‌وجویی موفق نبوده، دفترِ سالمِ موجود اصلاً بازنویسی
// نمی‌شود. اسکنی که نصفه مانده نباید جای دفتری بنشیند که کامل بود.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tradingDays } from '../core/roster-scan.mjs';
import { runRosterBuild } from '../core/roster-build.mjs';
import { readJsonSafe } from '../core/json-safe.mjs';
import { makeRosterFile, missingDays, rosterCoverage, rosterHealth } from '../core/option-roster.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROSTER_FILE = path.join(ROOT, 'data', 'option-roster.json');
const CHECKPOINT = path.join(ROOT, 'data', 'option-roster.checkpoint.json');

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAGE = { day: 'روزانه', catalog: 'کاتالوگ', detail: 'مشخصات' };

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
      // `res.json()` نه: شناسهٔ هفده‌رقمی از مرز امنِ عددی رد می‌شود و
      // `JSON.parse` بی‌صدا ارقام آخرش را گرد می‌کند.
      return await readJsonSafe(res);
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

  const days = tradingDays(from, to);
  if (!days.length) {
    console.error('بازه خالی است — `--from` و `--to` باید هشت رقم میلادی و مرتب باشند.');
    process.exit(1);
  }

  let rows = [], scanned = [];
  if (fs.existsSync(CHECKPOINT)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
      rows = Array.isArray(cp?.rows) ? cp.rows : [];
      scanned = Array.isArray(cp?.scanned) ? cp.scanned : [];
      console.log(`ادامه از checkpoint — ${fa(scanned.length)} روزِ انجام‌شده، ${fa(rows.length)} قرارداد`);
    } catch { /* checkpoint خراب، از نو */ }
  }

  const base = baseUrl();
  const want = missingDays({ days: scanned, scannedFrom: 0, scannedTo: 0 }, days);
  console.log(`اسکن ${fa(want.length)} روزِ نبوده از ${fa(days.length)} روزِ کاری، روی ${base}`);

  let lastLine = 0;
  const result = await runRosterBuild({
    days: want,
    existing: rows,
    scannedDays: scanned,
    get: async (path) => {
      const out = await getJson(`${base}${path}`);
      await sleep(delay);
      return out;
    },
    onProgress: (p) => {
      if (Date.now() - lastLine < 2000) return;
      lastLine = Date.now();
      console.log(`  ${STAGE[p.stage]} ${fa(p.done)}/${fa(p.total)} · قرارداد ${fa(p.rows)}`);
    },
    onCheckpoint: (state) => {
      fs.writeFileSync(CHECKPOINT, JSON.stringify({ rows: state.rows, scanned: state.scanned }), 'utf8');
    },
  });
  rows = result.rows;
  fs.writeFileSync(CHECKPOINT, JSON.stringify({ rows, scanned: result.scanned }), 'utf8');

  if (!rows.length) {
    console.error('هیچ قراردادی به دست نیامد — پروندهٔ خالی نوشته نمی‌شود.');
    process.exit(1);
  }

  const stats = result.stats;
  const body = makeRosterFile(rows, {
    scannedFrom: Number(from), scannedTo: Number(to), at: Math.floor(Date.now() / 1000),
    days: result.scanned, scan: stats,
  });
  const health = rosterHealth(body, rows);

  // ── دفتر سالم با خروجی ناقص بازنویسی نمی‌شود ──────────────────────
  //
  // اگر همهٔ درخواست‌های کاتالوگ شکسته باشند، این اجرا چیزی به دفتر
  // اضافه نکرده و فقط می‌تواند از آن کم کند. نوشتنش یعنی از دست دادنِ
  // کاری که دفعهٔ قبل درست انجام شده بود.
  const brokeEverything = stats.catalogQueriesDone === 0 && stats.catalogQueriesFailed > 0;
  if (brokeEverything && fs.existsSync(ROSTER_FILE)) {
    console.error('\nهیچ جست‌وجوی کاتالوگی موفق نبود؛ دفتر موجود دست‌نخورده ماند.');
    console.error(`  آخرین خطا: ${stats.lastError || '—'}`);
    console.error('  checkpoint نگه داشته شد؛ همین دستور را دوباره بزنید.');
    process.exit(1);
  }

  fs.writeFileSync(ROSTER_FILE, JSON.stringify(body), 'utf8');
  const coverage = rosterCoverage(rows);

  console.log(`\nدفتر نوشته شد: data/option-roster.json`);
  console.log(`  ${fa(coverage.count)} قرارداد · ${fa(coverage.bases)} نماد پایه · از ${fa(coverage.from)} تا ${fa(coverage.to)}`);
  console.log(`  روزانه ${fa(stats.dayQueriesDone)} موفق / ${fa(stats.dayQueriesFailed)} ناموفق`);
  console.log(`  کاتالوگ ${fa(stats.catalogQueriesDone)} موفق / ${fa(stats.catalogQueriesFailed)} ناموفق · ${fa(stats.catalogFound)} قرارداد تازه`);
  console.log(`  مشخصات ${fa(stats.detailQueriesDone)} موفق / ${fa(stats.detailQueriesFailed)} ناموفق · ${fa(stats.noTradeContracts)} قرارداد بی‌معامله`);
  console.log(`  جفت کال/پوت: ${fa(stats.pairGroups - stats.incompletePairs)} کامل از ${fa(stats.pairGroups)} · ${fa(stats.incompletePairs)} ناقص`);
  if (stats.unsafeIdentifiers) console.log(`  شناسهٔ ناامن کنار گذاشته‌شده: ${fa(stats.unsafeIdentifiers)}`);
  for (const line of stats.truncated) console.log(`  سقف خورد — ${line}`);

  console.log(health.complete
    ? '\n✔ دفتر کامل است.'
    : `\n✘ دفتر کامل نیست:\n${health.reasons.map((r) => `    · ${r}`).join('\n')}`);
  if (!health.complete) {
    console.log('    همین دستور را دوباره بزنید؛ از checkpoint ادامه می‌دهد.');
    process.exitCode = 2;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
