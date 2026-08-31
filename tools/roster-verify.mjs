// راستی‌آزماییِ دفتر — همان معیارهایی که روی دادهٔ واقعی سنجیده می‌شوند.
//
//   node tools/roster-verify.mjs
//   node tools/roster-verify.mjs --base اهرم --expiry 1404/01/27
//   node tools/roster-verify.mjs --ins 12998578961084515,62630716381380677
//   node tools/roster-verify.mjs --pairs 20        فهرست سری‌های ناقص
//
// ═══ چرا جدا از آزمون‌ها ═══
//
// دستهٔ ۲۱۱ **منطق** را قفل می‌کند و روی شبکهٔ ساختگی اجرا می‌شود؛ پس
// روی هر ماشینی، بی‌شبکه، سبز است. ولی «آیا دفترِ من کامل است» ادعایی
// دربارهٔ دادهٔ واقعی است و فقط روی ماشینی که آن داده را دارد معنا
// می‌دهد. این ابزار همان را می‌سنجد و کد خروجش را از نتیجه می‌گیرد.
//
// خروج ۰ سبز · ۱ چیزی جا افتاده · ۲ دفتر نیست.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expiryRoll, normalizeFa, pairAudit, parseExpiry, rosterCoverage, rosterHealth,
} from '../core/option-roster.mjs';
import { unsafeDigits } from '../core/json-safe.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROSTER_FILE = path.join(ROOT, 'data', 'option-roster.json');
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const mark = (ok) => (ok ? ' ✔' : ' ✘');

const args = process.argv.slice(2);
const flag = (name, def = null) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : def;
};

if (!fs.existsSync(ROSTER_FILE)) {
  console.error('دفتر ساخته نشده. یک تب تاریخ‌دار را باز کنید و بازه بدهید، یا:');
  console.error('  node tools/roster-scan.mjs --from 20240901 --to <امروز>');
  process.exit(2);
}

const file = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
const rows = Array.isArray(file.rows) ? file.rows : [];
const health = rosterHealth(file, rows);
const coverage = rosterCoverage(rows);
let bad = 0;

console.log('\n══ دفتر قراردادها ══');
console.log(`  ${fa(coverage.count)} قرارداد · ${fa(coverage.bases)} نماد پایه · از ${fa(coverage.from)} تا ${fa(coverage.to)}`);
console.log(`  نسخهٔ پرونده: ${fa(health.version)}${health.version < 2 ? '  ← پیش از پاس کاتالوگ' : ''}`);
const s = health.scan;
console.log(`  روزانه ${fa(s.dayQueriesFailed)} ناموفق · کاتالوگ ${fa(s.catalogQueriesDone)}/${fa(s.catalogQueriesFailed)} · مشخصات ${fa(s.detailQueriesDone)}/${fa(s.detailQueriesFailed)}`);
console.log(`  قرارداد بی‌معامله: ${fa(s.noTradeContracts)} · شناسهٔ ناامن: ${fa(s.unsafeIdentifiers)}`);

console.log('\n══ معیارهای پذیرش ══');
const say = (ok, text, extra = '') => { console.log(`${mark(ok)} ${text}${extra ? `  ${extra}` : ''}`); if (!ok) bad += 1; };

say(health.version >= 2, 'دفتر از پاس کاتالوگ ابزار عبور کرده',
  health.version >= 2 ? '' : 'دوباره اسکن کنید تا قراردادِ بی‌معامله وارد شود');
say(s.dayQueriesFailed + s.catalogQueriesFailed + s.detailQueriesFailed === 0, 'درخواست ناموفق: صفر',
  `${fa(s.dayQueriesFailed + s.catalogQueriesFailed + s.detailQueriesFailed)}`);
say(s.unsafeIdentifiers === 0, 'شناسهٔ ناامن: صفر', fa(s.unsafeIdentifiers));

// شناسهٔ گردشده — گرد شدن رد را در خودِ رقم می‌گذارد و بعدش قابل ترمیم
// نیست، پس فقط می‌شود شمردش.
const rounded = rows.filter((r) => unsafeDigits(r.ins) && !/^\d+$/.test(String(r.ins)));
say(rounded.length === 0, 'شناسهٔ گردشده: صفر', fa(rounded.length));

const audit = pairAudit(rows);
say(audit.incomplete === 0, 'سری با هر دو سمت کال و پوت',
  `${fa(audit.complete)} کامل از ${fa(audit.groups)} · ${fa(audit.incomplete)} ناقص`);
say(health.complete, 'وضعیت دفتر: کامل', health.complete ? '' : health.reasons.join(' · '));

// ── سررسیدِ معین ──────────────────────────────────────────────────────
const base = flag('base'), expiryArg = flag('expiry');
if (base && expiryArg) {
  const expiry = /^\d{8}$/.test(expiryArg) ? Number(expiryArg) : parseExpiry(`x-1-${expiryArg}`);
  const roll = expiryRoll(rows, base, expiry);
  console.log(`\n══ ${normalizeFa(base)} ـ ${expiryArg} ══`);
  console.log(`  اختیار خرید: ${fa(roll.call)}`);
  console.log(`  اختیار فروش: ${fa(roll.put)}`);
  console.log(`  مجموع: ${fa(roll.total)}`);
  console.log(`  جفت ناقص: ${fa(roll.incomplete)}`);
  if (roll.tabaee) console.log(`  تبعی (بیرون از کنترل جفت): ${fa(roll.tabaee)}`);
  say(roll.total > 0, 'این سررسید در دفتر هست');
  say(roll.incomplete === 0, 'هر قیمت اعمال هر دو سمت را دارد');
  if (roll.incomplete) {
    const have = new Set(roll.symbols.call.concat(roll.symbols.put));
    console.log(`  نمادهای موجود: ${[...have].join('، ')}`);
  }
}

// ── شناسه‌های معین ────────────────────────────────────────────────────
const insList = (flag('ins') || '').split(',').map((x) => x.trim()).filter(Boolean);
if (insList.length) {
  console.log('\n══ شناسه‌های خواسته‌شده ══');
  const byIns = new Map(rows.map((r) => [String(r.ins), r]));
  for (const ins of insList) {
    const row = byIns.get(ins);
    say(Boolean(row), `${ins} در دفتر هست`,
      row ? `${row.symbol} · اعمال ${fa(row.strike)} · سررسید ${fa(row.expiry)}` : 'پیدا نشد');
  }
}

// ── فهرست ناقص‌ها ─────────────────────────────────────────────────────
const showPairs = Number(flag('pairs', '0')) || 0;
if (showPairs && audit.incomplete) {
  console.log(`\n══ سری‌های ناقص (${fa(Math.min(showPairs, audit.incomplete))} از ${fa(audit.incomplete)}) ══`);
  for (const g of [...audit.missingPut, ...audit.missingCall].slice(0, showPairs)) {
    const side = audit.missingPut.includes(g) ? 'پوت ندارد' : 'کال ندارد';
    console.log(`  ${g.base} · اعمال ${fa(g.strike)} · سررسید ${fa(g.expiry)} · ${side} · موجود: ${g.have}`);
  }
}

console.log(bad
  ? `\n✘ ${fa(bad)} معیار برآورده نشد. اسکن را دوباره اجرا کنید:\n    node tools/roster-scan.mjs --from ${fa(coverage.from || 20240901)} --to <امروز>`
  : '\n✔ همهٔ معیارها برآورده شد.');
process.exit(bad ? 1 : 0);
