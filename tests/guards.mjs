// آزمون‌های نگهبان قواعد مخزن.
//
// این‌ها رفتار برنامه را نمی‌سنجند؛ قواعد `AGENTS.md` را می‌سنجند. متن یک
// قاعده، خواهش است؛ آزمونش، قانون. هر عاملی که فایل قواعد را نخوانده باشد،
// اینجا قرمز می‌شود.
//
// اجرا:  node tests/guards.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmt, faNum } from '../ui/fmt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { pass += 1; results.push(['✔', name, detail]); }
  else { fail += 1; results.push(['✘', name, detail]); }
}
function group(t) { results.push(['—', t, '']); }

const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache']);

function walk(dir, ext, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const sources = walk(ROOT, '.mjs');

// ═════════════════════ ۱. صفر وابستگی npm (قاعده ۲-۱) ═════════════════════
group('۱. صفر وابستگی npm');
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const found = depFields.filter((f) => pkg[f] && Object.keys(pkg[f]).length > 0);
  check('package.json هیچ وابستگی اعلام نکرده', found.length === 0,
    found.length ? `پیدا شد: ${found.join('، ')}` : '');

  const locks = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml']
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
  check('فایل قفل بسته ساخته نشده', locks.length === 0, locks.join('، '));

  check('پوشه node_modules در مخزن نیست', !fs.existsSync(path.join(ROOT, 'node_modules')));
  check('پروژه ESM اعلام شده', pkg.type === 'module', `type=${pkg.type}`);
}

// ═════════════════════ ۲. مسیر import (قاعده ۲-۱ و ۲-۲) ═════════════════════
group('۲. هر import یا محلی است یا node:');
{
  const bare = [];
  const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const file of sources) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2];
      if (!spec) continue;
      // مسیر با `/` هم محلی است: فایل‌های ui از راه سرور محلی بار می‌شوند.
      const ok = spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')
        || spec.startsWith('node:');
      if (!ok) bare.push(`${rel(file)} → ${spec}`);
    }
  }
  check('هیچ import از بسته بیرونی نیست', bare.length === 0, bare.slice(0, 3).join('، '));

  const requires = sources
    .filter((f) => rel(f) !== 'tests/guards.mjs')     // خود این فایل نام قاعده را می‌نویسد
    .filter((f) => /\brequire\s*\(/.test(fs.readFileSync(f, 'utf8')));
  check('هیچ require() در کد نیست', requires.length === 0, requires.map(rel).slice(0, 3).join('، '));
}

// ═════════════════════ ۳. رقم فارسی در خروجی نمایشی (قاعده ۲-۳) ═════════════════════
group('۳. رقم نمایشی فارسی است');
{
  const hasLatinDigit = (s) => /[0-9]/.test(String(s));

  check('faNum رقم لاتین را فارسی می‌کند', !hasLatinDigit(faNum('12345')), faNum('12345'));
  check('fmt.num رقم لاتین بیرون نمی‌دهد', !hasLatinDigit(fmt.num(1234567)), String(fmt.num(1234567)));
  check('fmt.num منفی هم رقم لاتین ندارد', !hasLatinDigit(fmt.num(-9876)), String(fmt.num(-9876)));
  check('fmt.pct رقم لاتین ندارد', !hasLatinDigit(fmt.pct(12.34)), String(fmt.pct(12.34)));
}

// ═════════════════════ ۴. رنگ از توکن می‌آید (قاعده ۲-۶) ═════════════════════
//
// این دو نگهبان «جغجغه»‌اند: سقف امروز را نگه می‌دارند و اجازه بدترشدن
// نمی‌دهند. هر بار که رنگی به توکن تبدیل شد، سقف را در همین‌جا پایین
// بیاورید. هدف، رسیدن هر دو به صفر است.
group('۴. رنگ سخت‌کدشده بیشتر نمی‌شود');
{
  const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\([^)]*\)|\bhsla?\s*\([^)]*\)/g;
  const countColors = (text) => (text.match(COLOR_RE) || []).length;

  // ۴-۱ — جاوااسکریپت: رنگ اصلاً نباید در کد باشد.
  const JS_CEILING = 18;
  const jsHits = [];
  for (const file of sources.filter((f) => rel(f).startsWith('ui/'))) {
    const n = countColors(fs.readFileSync(file, 'utf8'));
    if (n) jsHits.push([rel(file), n]);
  }
  const jsTotal = jsHits.reduce((a, [, n]) => a + n, 0);
  check(`رنگ سخت‌کدشده در ui/*.mjs از ${JS_CEILING} بیشتر نشده`, jsTotal <= JS_CEILING,
    `${jsTotal} مورد${jsHits.length ? ' — ' + jsHits.map(([f, n]) => `${f}:${n}`).join('، ') : ''}`);

  // ۴-۲ — CSS: فقط داخل بلوک‌های توکن مجاز است.
  const CSS_CEILING = 9;
  let css = fs.readFileSync(path.join(ROOT, 'ui/style.css'), 'utf8');
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');                      // کامنت‌ها
  css = css.replace(/:root\s*\{[\s\S]*?\n\}/, '');                 // بلوک توکن پوسته دفتر
  css = css.replace(/body\[data-theme="board"\]\s*\{[\s\S]*?\n\}/, '');
  const cssTotal = countColors(css);
  check(`رنگ سخت‌کدشده بیرون بلوک توکن از ${CSS_CEILING} بیشتر نشده`, cssTotal <= CSS_CEILING,
    `${cssTotal} مورد`);
}

// ═════════════════════ ۵. تایپوگرافی فارسی ═════════════════════
//
// خط فارسی وصل است و نقطه‌دار. دو چیز خرابش می‌کند و هر دو در CSS بی‌صدا
// اتفاق می‌افتند، پس اینجا قفل می‌شوند:
//
//   letter-spacing  پیوند حرف‌ها را می‌شکند و کلمه را تکه‌تکه می‌کند
//   font-family تک‌عرض روی متن فارسی  فونت لاتین حرف فارسی ندارد، مرورگر
//               حرف‌به‌حرف به فونت دیگری می‌افتد و همان شکستگی را می‌سازد
//
// اندازه قلم هم فقط از مقیاس توکن می‌آید، به همان دلیلی که رنگ از توکن
// می‌آید: کف خوانایی باید یک جا بسته باشد، نه در ۱۵۰ نقطه پراکنده.
group('۵. تایپوگرافی فارسی');
{
  let css = fs.readFileSync(path.join(ROOT, 'ui/style.css'), 'utf8');
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = css.match(/:root\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const body = css.replace(/:root\s*\{[\s\S]*?\n\}/, '');

  const rawSizes = body.match(/font-size:\s*[0-9.]+px/g) || [];
  check('هیچ اندازه قلم خامی بیرون از مقیاس توکن نیست', rawSizes.length === 0,
    rawSizes.slice(0, 3).join('، '));

  const scale = ['--fs-3xs', '--fs-2xs', '--fs-xs', '--fs-sm', '--fs-md',
    '--fs-lg', '--fs-xl', '--fs-2xl', '--fs-3xl', '--fs-4xl'];
  const missing = scale.filter((t) => !tokens.includes(`${t}:`));
  check('مقیاس اندازه قلم کامل تعریف شده', missing.length === 0, missing.join('، '));

  // کف مقیاس زیر ۱۱ پیکسل نرود — زیر آن، نقطه‌های «ب» و «پ» و «ت» یکی می‌شوند.
  const floor = Number(tokens.match(/--fs-3xs:\s*([0-9.]+)px/)?.[1]);
  check('کف مقیاس دست‌کم ۱۱ پیکسل است', floor >= 11, `${floor}px`);

  // `normal` تنها مقدار مجاز است و یک‌بار در بلوک پایه صریح نوشته شده تا
  // نیت معلوم باشد؛ هر مقدار دیگری یعنی کسی دوباره tracking لاتین گذاشته.
  const tracking = [...body.matchAll(/letter-spacing:\s*([^;]+);/g)]
    .map((m) => m[1].trim())
    .filter((v) => v !== 'normal');
  check('هیچ letter-spacing روی متن فارسی نمانده', tracking.length === 0,
    tracking.slice(0, 3).join('، '));

  // «ثانیه» در فونت تک‌عرض لاتین به «ثا نیه» می‌شکست. پشته تک‌عرض باید
  // پشتیبان فارسی داشته باشد تا حتی اشتباه بعدی هم بی‌صدا خراب نکند.
  check('پشته تک‌عرض پشتیبان فارسی دارد', /--mono:[^;]*Vazirmatn/.test(tokens));
}

// ═════════════════════ ۶. حافظه پروژه (قاعده ۴) ═════════════════════
group('۶. فایل‌های قرارداد و حافظه سر جایشان هستند');
{
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'WORKLOG.md', 'TASK_STATUS.md', 'README.md']) {
    check(`${f} موجود است`, fs.existsSync(path.join(ROOT, f)));
  }
}

// ═════════════════════ ۷. آزمون، به سیستم‌عامل بند نباشد ═════════════════════
//
// یک دور آزمون روی ویندوز، سیزده قابلیتِ کاملاً سالم را «خراب» گزارش کرد.
// علت در کد برنامه نبود: `core.autocrlf=true` فایل‌ها را با CRLF روی دیسک
// می‌گذارد و ادعاهایی که متنِ منبع را با الگوی دارای `\n` می‌سنجند، بی‌صدا
// رد می‌شوند. نتیجه‌اش بدتر از یک باگ است — `node tests/run.mjs` که پیش از
// هر پوش الزامی است هرگز سبز نمی‌شود، و آدم یاد می‌گیرد قرمز را جدی نگیرد.
//
// دو قفل، چون یکی کافی نیست: `.gitattributes` ریشه را می‌بندد برای
// checkoutهای تازه، و خواندنِ نرمال‌کننده در خود آزمون، checkoutهایی را که
// از قبل ساخته شده‌اند هم می‌پوشاند.
group('۷. آزمون به پایان‌خط سیستم‌عامل بند نیست');
{
  const attrPath = path.join(ROOT, '.gitattributes');
  check('.gitattributes موجود است', fs.existsSync(attrPath));
  const attrs = fs.existsSync(attrPath) ? fs.readFileSync(attrPath, 'utf8') : '';
  check('پایان‌خط همه فایل‌های متنی روی LF قفل شده',
    /^\s*\*\s+text=auto\s+eol=lf\s*$/m.test(attrs));

  // ادعای «کد این را دارد» باید از خواننده نرمال‌کننده رد شود. یک
  // `readFileSync` خام، همان کلاس خطا را برمی‌گرداند بی‌آنکه کسی بفهمد.
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.mjs'), 'utf8');
  check('آزمون اصلی منبع را فقط با خوانندهٔ نرمال‌کننده می‌خواند',
    !/fs\.readFileSync/.test(runSrc) && /\.replace\(\/\\r\\n\/g, '\\n'\)/.test(runSrc));
}

// ═══════════════════════════ گزارش ═══════════════════════════
const W = 62;
console.log('\n' + '═'.repeat(W));
console.log('  نگهبان قواعد مخزن');
console.log('═'.repeat(W));
for (const [mark, name, detail] of results) {
  if (mark === '—') { console.log('\n' + name); continue; }
  const pad = name.length > 46 ? name.slice(0, 46) : name.padEnd(46, ' ');
  console.log(` ${mark} ${pad} ${detail}`);
}
console.log('\n' + '─'.repeat(W));
console.log(`  قبول ${pass}   رد ${fail}`);
console.log('─'.repeat(W) + '\n');
process.exit(fail ? 1 : 0);
