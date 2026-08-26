// راهنمای شروع کار — جای گشتن در مخزن.
//
// چرا هست: بیشترِ توکنی که یک عامل می‌سوزاند صرف «کجاست؟» می‌شود، نه صرف
// نوشتن کد. سه پرسش تکراری است: کار بعدی چیست، آزمونم را کجا بنویسم،
// کدام ماژول این تابع را دارد. هر سه اینجا با یک اجرا جواب می‌گیرند.
//
// اجرا:
//   node tools/next.mjs              کار بعدی، دروازه، بودجهٔ خواندن
//   node tools/next.mjs suites وجه   دستهٔ آزمونِ مربوط را پیدا کن
//   node tools/next.mjs map margin   ماژول‌ها و صادراتشان را پیدا کن

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const kb = (n) => `${(n / 1024).toFixed(1)}k`;
const [mode, ...rest] = process.argv.slice(2);
const term = rest.join(' ').trim();

// ── دسته‌های آزمون ────────────────────────────────────────────────────
const suiteDir = path.join(ROOT, 'tests/suites');
const suites = fs.readdirSync(suiteDir).filter((f) => f.endsWith('.mjs')).sort().map((file) => {
  const first = fs.readFileSync(path.join(suiteDir, file), 'utf8').split('\n')[0];
  return { file, title: first.replace(/^\/\/\s*/, '').trim() };
});

if (mode === 'suites') {
  const hits = suites.filter((s) => !term || s.title.includes(term) || s.file.includes(term));
  if (!hits.length) {
    console.log(`دسته‌ای با «${term}» نبود. برای دیدن همه: node tools/next.mjs suites`);
    process.exit(1);
  }
  console.log(`${hits.length} دسته:`);
  for (const s of hits) console.log(`  tests/suites/${s.file.padEnd(34)} ${s.title}`);
  console.log(`\nاجرای یک دسته:  node tests/run.mjs ${hits[0].file.slice(0, 3)}`);
  process.exit(0);
}

// ── نقشهٔ ماژول‌ها ──────────────────────────────────────────────────────
if (mode === 'map') {
  const dirs = ['core', 'ui', 'ui/tabs', 'worker', 'server'].filter((d) => fs.existsSync(path.join(ROOT, d)));
  const files = dirs.flatMap((d) => fs.readdirSync(path.join(ROOT, d))
    .filter((f) => f.endsWith('.mjs')).map((f) => `${d}/${f}`));
  const names = (src) => {
    const out = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
      for (const raw of m[1].split(',')) {
        const nm = raw.trim().split(/\s+as\s+/).pop();
        if (nm) out.add(nm);
      }
    }
    return [...out];
  };
  let found = 0;
  for (const rel of files) {
    const src = read(rel);
    const exp = names(src);
    const byName = !term || rel.includes(term);
    const byExport = term ? exp.filter((e) => e.toLowerCase().includes(term.toLowerCase())) : [];
    if (!byName && !byExport.length) continue;
    found += 1;
    const show = byName ? exp : byExport;
    console.log(`  ${rel.padEnd(38)} ${kb(Buffer.byteLength(src)).padStart(7)}  ${show.slice(0, 10).join(', ')}${show.length > 10 ? ` … +${show.length - 10}` : ''}`);
  }
  if (!found) console.log(`ماژولی با «${term}» نبود.`);
  process.exit(found ? 0 : 1);
}

// ── حالت پیش‌فرض ──────────────────────────────────────────────────────
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const base = git('rev-parse', '--short', 'origin/main') || git('rev-parse', '--short', 'main');
const ahead = git('rev-list', '--count', 'origin/main..HEAD') || '?';

const next = fs.existsSync(path.join(ROOT, 'NEXT.md')) ? read('NEXT.md') : '';
const task = (next.match(/^##\s+کار\s*\n+###\s+(.+)$/m) || next.match(/^##\s+کار[^\n]*\n+(.+)$/m) || [, '—'])[1];
const suiteHint = (next.match(/tests\/suites\/([\w.-]+\.mjs)/) || [, null])[1];

console.log(`شاخه       ${branch}   (${ahead} کامیت جلوتر از origin/main @ ${base})`);
console.log(`کار بعدی   ${task.trim()}`);
console.log(`دستهٔ آزمون ${suiteHint ? `tests/suites/${suiteHint}` : 'در NEXT.md مشخص نشده — node tools/next.mjs suites <کلیدواژه>'}`);
console.log(`دروازه     node tools/check.mjs`);

// ── بودجهٔ خواندن ─────────────────────────────────────────────────────
// همان سقف‌هایی که نگهبان ۹ می‌سنجد. اگر اینجا زرد شد، پیش از آنکه CI
// قرمز شود بایگانی کنید.
const CAPS = { 'NEXT.md': 8, 'PROTOCOL.md': 8, 'AGENTS.md': 16, 'WORKLOG.md': 48, 'TASK_STATUS.md': 24 };
let total = 0;
const parts = Object.entries(CAPS).map(([f, capKb]) => {
  const size = fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).size : 0;
  total += size;
  return `${f} ${kb(size)}${size > capKb * 1024 ? ' ✘' : ' ✔'}`;
});
console.log(`\nبودجهٔ خواندن اجباری   ${parts.join('   ')}`);
console.log(`جمع ${kb(total)} — پیش از این تغییر ۵۷۴k بود. بقیهٔ فایل‌ها را فقط در صورت ارجاع باز کنید.`);
