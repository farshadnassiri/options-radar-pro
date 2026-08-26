// دروازهٔ پیش از پوش — یک دستور به‌جای چهارتا.
//
// چرا هست: قاعده می‌گفت چهار چیز را جدا اجرا کن. عامل یا یکی را جا
// می‌انداخت و CI قرمز می‌شد، یا هر چهارتا را کامل اجرا می‌کرد و چند هزار
// خط «✔» را در بافتار خودش می‌ریخت. اینجا همه با `--quiet` اجرا می‌شوند:
// اگر همه سبزند چهار خط می‌بینید، و اگر چیزی رد شد فقط همان رد را.
//
// اجرا:  node tools/check.mjs

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const run = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', ...opts });

let failed = 0;

// ── نحو، همان چیزی که CI اول از همه می‌سنجد ───────────────────────────
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name === '.git' || e.name === 'node_modules') return [];
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : (e.name.endsWith('.mjs') ? [full] : []);
});
const sources = walk(ROOT);
const badSyntax = sources.filter((f) => run(['--check', f]).status !== 0);
if (badSyntax.length) {
  failed += 1;
  for (const f of badSyntax) {
    console.log(` ✘ نحو › ${path.relative(ROOT, f)}`);
    console.log(run(['--check', f]).stderr.split('\n').slice(0, 4).join('\n'));
  }
}
console.log(`نحو — ${sources.length} فایل   رد ${badSyntax.length}`);

// ── سه نگهبان ─────────────────────────────────────────────────────────
for (const gate of ['tests/run.mjs', 'tests/guards.mjs', 'tests/commits.mjs']) {
  const r = run([gate, '--quiet']);
  process.stdout.write(r.stdout);
  if (r.stderr.trim()) process.stderr.write(r.stderr);
  if (r.status !== 0) failed += 1;
}

console.log(failed ? `\n✘ ${failed} دروازه رد شد — پوش نکنید.` : '\n✔ همه سبز — آمادهٔ کامیت و پوش.');
process.exit(failed ? 1 : 0);
