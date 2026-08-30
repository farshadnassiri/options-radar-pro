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

/**
 * شمار استراتژی‌های کاتالوگ.
 *
 * `ui/app.mjs` وارد نمی‌شود چون به DOM دست می‌زند و در نود می‌ترکد؛ ولی
 * کاتالوگ تابع خالص است و مستقیم خوانده می‌شود. عدد از منبع می‌آید، نه از
 * یک ثابت دستی که خودش هم می‌تواند کهنه شود.
 */
function catalogCount() {
  const src = fs.readFileSync(path.join(ROOT, 'strategies/catalog.mjs'), 'utf8');
  return (src.match(/^\s*\{\s*id:\s*'/gm) || []).length;
}

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

  // کف مقیاس زیر ۱۲ پیکسل نرود — زیر آن، نقطه‌های «ب» و «پ» و «ت» یکی
  // می‌شوند. کف از ۱۱ به ۱۲ بالا رفت چون گزارش خوانایی رسید؛ جغجغه است،
  // یعنی برگشتنش خطای آزمون می‌دهد نه یک تصمیم بی‌صدا.
  const floor = Number(tokens.match(/--fs-3xs:\s*([0-9.]+)px/)?.[1]);
  check('کف مقیاس دست‌کم ۱۲ پیکسل است', floor >= 12, `${floor}px`);

  // مقیاس باید صعودی بماند. یک عدد که جا بیفتد، «کوچک‌تر» جایی بزرگ‌تر از
  // «بزرگ‌تر» می‌شود و سلسله‌مراتب بصری وارونه.
  const sizes = scale.map((t) => Number(tokens.match(new RegExp(`${t}:\\s*([0-9.]+)px`))?.[1]));
  const broken = sizes.findIndex((value, at) => at > 0 && !(value > sizes[at - 1]));
  check('مقیاس قلم اکیداً صعودی است', broken === -1,
    broken === -1 ? '' : `${scale[broken]} = ${sizes[broken]}px`);

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
  //
  // خواننده حالا در `tests/harness.mjs` است و مجموعه به ۱۲۱ دسته شکسته
  // شده. پس به‌جای یک فایل، همهٔ دسته‌ها سنجیده می‌شوند: دستهٔ تازه‌ای که
  // فردا نوشته شود هم زیر همین قفل است.
  const harnessSrc = fs.readFileSync(path.join(ROOT, 'tests/harness.mjs'), 'utf8');
  check('خوانندهٔ نرمال‌کننده در harness.mjs تعریف شده',
    /\.replace\(\/\\r\\n\/g, '\\n'\)/.test(harnessSrc));

  const suiteDir = path.join(ROOT, 'tests/suites');
  const suites = fs.existsSync(suiteDir) ? fs.readdirSync(suiteDir).filter((f) => f.endsWith('.mjs')) : [];
  check('دسته‌های آزمون پیدا شدند', suites.length > 0, `${suites.length} دسته`);
  const rawReaders = ['run.mjs', ...suites.map((f) => `suites/${f}`)]
    .filter((rel) => /fs\.readFileSync/.test(fs.readFileSync(path.join(ROOT, 'tests', rel), 'utf8')));
  check('هیچ دسته‌ای منبع را خام نمی‌خواند — فقط readSrc',
    rawReaders.length === 0, rawReaders.join(' ،') || 'همه از harness');

  // بارگذار باید همهٔ دسته‌ها را بردارد، نه فهرستی دستی که جا می‌ماند.
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.mjs'), 'utf8');
  check('بارگذار دسته‌ها را از روی پوشه برمی‌دارد',
    /readdirSync/.test(runSrc) && /suites/.test(runSrc));

  // روی ویندوز مسیر مطلق `D:\...` است و `import()` پویا آن را رد می‌کند:
  // «absolute paths must be valid file:// URLs». job ویندوزِ CI این را یک
  // بار گرفت؛ این نگهبان نمی‌گذارد دوباره بی‌صدا برگردد.
  check('بارگذار مسیر را به file:// تبدیل می‌کند — وگرنه ویندوز می‌شکند',
    /pathToFileURL\(/.test(runSrc) && !/await import\(path\.join/.test(runSrc));
}

// ═════════════════════ ۸. شمار تب، یک عدد باشد نه سه ═════════════════════
//
// یک دور آزمون سه عدد متفاوت پیدا کرد: کد ۴۰ تب می‌ساخت، README می‌گفت ۳۹،
// و AGENTS.md و یک کامنت در app.mjs می‌گفتند ۳۴. هیچ‌کدام دروغ عمدی نبود —
// هر بار که استراتژی اضافه شد، کد خودش را به‌روز کرد و متن‌ها جا ماندند.
//
// عدد از کاتالوگ و از خودِ app.mjs شمرده می‌شود، نه از یک ثابتِ دستی. پس
// افزودن استراتژی بعدی، همین‌جا قرمز می‌شود و می‌گوید کدام متن عقب مانده.
group('۸. شمار تب در کد و مستندات یکی است');
{
  const appSrc = fs.readFileSync(path.join(ROOT, 'ui/app.mjs'), 'utf8');
  const literal = /const TABS = \[([\s\S]*?)\n\];/.exec(appSrc)?.[1] || '';
  const baseTabs = (literal.match(/\{\s*id:\s*'/g) || []).length;
  // حلقهٔ استراتژی‌ها `id: d.id` می‌نویسد، پس این الگو فقط تب‌های تک‌نسخه‌ای
  // را می‌شمرد — «موقعیت‌های من» و «تحلیل رول».
  const pushedTabs = (appSrc.match(/TABS\.push\(\{\s*id:\s*'/g) || []).length;
  const strategyTabs = catalogCount();
  const tabCount = baseTabs + strategyTabs + pushedTabs;

  check('ساختار شمارش تب در app.mjs پیدا شد', baseTabs > 0 && pushedTabs > 0,
    `${baseTabs} پایه + ${strategyTabs} استراتژی + ${pushedTabs} موقعیت`);

  // هر شمارِ «N تب» در متن باید یکی از سه عدد واقعی باشد: کل، پایه، یا
  // استراتژی. متن‌ها هر سه را جایی می‌گویند و هر سه می‌توانند کهنه شوند.
  const legit = new Set([tabCount, baseTabs, strategyTabs].map((n) => faNum(String(n))));
  for (const [file, label] of [['README.md', 'README'], ['AGENTS.md', 'AGENTS']]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const claimed = [...text.matchAll(/([۰-۹]+)\s*تب/g)].map((m) => m[1]);
    const stale = claimed.filter((c) => !legit.has(c));
    check(`${label} هیچ شمار تبِ کهنه‌ای ندارد`, claimed.length > 0 && stale.length === 0,
      stale.length ? `کهنه: ${stale.join('، ')} — مجاز: ${[...legit].join('، ')}`
        : `${claimed.join('، ')}`);
  }
  // و دست‌کم یکی‌شان باید شمارِ کل را صریح بگوید، وگرنه حذفِ عدد از متن،
  // این نگهبان را بی‌صدا راضی می‌کند.
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  const totalFa = faNum(String(tabCount));
  check('شمار کل تب‌ها در هر دو سند نوشته شده',
    readme.includes(`${totalFa} تب`) && agents.includes(`${totalFa} تب`), totalFa);
}

// ═════════ ۹. هر شناسه‌ای که به کار می‌رود، وارد هم شده است ═════════
//
// ماژول‌های مشترک `ui/` (fmt، table، chart، export، …) ده‌ها کمک‌تابع صادر
// می‌کنند و هر تب چند تایشان را می‌خواهد. یک `import` جاافتاده در نود
// نمی‌ترکد و در آزمون هم پیدا نمی‌شود — فقط در مرورگر، همان لحظه‌ای که
// کاربر روی همان دکمه کلیک می‌کند، «X is not defined» می‌دهد.
//
// همین اتفاق افتاد: `ui/tabs/backtest.mjs` از `faClock` استفاده می‌کرد و
// وارد نکرده بود؛ خطا فقط با زدن دکمه «رصد زنده» دیده می‌شد.
//
// نگهبان محافظه‌کار است: فقط فراخوانی `نام(` را می‌شمارد، و نامی را که
// همان فایل خودش تعریف کرده یا از هر جای دیگری وارد کرده، نادیده می‌گیرد.
group('۹. هر کمک‌تابع مشترک، وارد شده است');
{
  const shared = sources.filter((f) => /^ui\/[^/]+\.mjs$/.test(rel(f)));
  const exportsOf = (file) => [...fs.readFileSync(file, 'utf8')
    .matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  const misses = [];
  for (const file of sources) {
    const name = rel(file);
    if (!name.startsWith('ui/') || name === 'ui/app.mjs') continue;
    const src = fs.readFileSync(file, 'utf8');
    // هرچه وارد شده (با هر نام مستعار) یا همین‌جا تعریف شده، شناخته است
    const imported = [...src.matchAll(/import\s*\{([^}]*)\}\s*from/g)]
      .flatMap((m) => m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop().trim()));
    const declared = [...src.matchAll(/(?:function|const|let|var|class)\s+(\w+)/g)].map((m) => m[1]);
    const known = new Set([...imported, ...declared].filter(Boolean));
    // نام واشکافته هم تعریف است: `f(host, { getSettings, putSettings })` یعنی
    // `putSettings` پارامتر همین تابع است، نه صدا زدنِ کمک‌تابعی از جای دیگر.
    const destructured = (symbol) =>
      new RegExp(`\\{[^{}]*\\b${symbol}\\b[^{}]*\\}\\s*(?:=[^=]|\\)|=>)`).test(src);
    for (const mod of shared) {
      if (rel(mod) === name) continue;
      for (const symbol of exportsOf(mod)) {
        if (known.has(symbol) || destructured(symbol)) continue;
        // `نام(` و نه `x.نام(` یا `foo_نام(` — تا متد و پسوند اشتباه گرفته نشود
        if (new RegExp(`(?<![\\w.$])${symbol}\\s*\\(`).test(src)) misses.push(`${name} → ${symbol}`);
      }
    }
  }
  check('هیچ فایل رابطی، کمک‌تابع وارد‌نشده صدا نمی‌زند',
    misses.length === 0, misses.join('، '));
}

// ═════════ ۱۰. رنگ سری‌ها، سنجیده می‌شود نه چشمی ═════════
//
// گزارش کاربر: «در یک نمودار سه تا رنگ شبیه هم هستند.» درست بود، و با نگاه
// کردن هم پیدا نمی‌شد که کدام جفت مقصر است. پس اینجا حساب می‌شود:
//
//   ΔE   فاصله اقلیدسی در فضای OKLab ×۱۰۰. برای کوررنگی، رنگ اول با
//        ماتریس‌های ماچادو (۲۰۰۹، شدت ۱) شبیه‌سازی می‌شود.
//
// مجموعه قبلی روی همین سنجه رد می‌شد: «قرمز و نارنجی» ΔE ۸٫۷ در دید عادی
// (کف ۱۵) و «بنفش و آبی» ΔE ۰٫۴ در دید دوترانوپ (هدف ۸).
//
// این آزمون کتابخانه نمی‌خواهد (قاعده ۲-۱): کل ریاضی‌اش چند ده خط است و
// همین‌جا نوشته شده. رنگ‌ها هم از خودِ `ui/style.css` خوانده می‌شوند، نه از
// رونوشتی اینجا که می‌تواند کهنه شود.
group('۱۰. رنگ سری‌ها جداپذیر است');
{
  const css = fs.readFileSync(path.join(ROOT, 'ui/style.css'), 'utf8');
  const blockOf = (selector) => {
    const at = css.indexOf(selector);
    return at < 0 ? '' : css.slice(at, css.indexOf('\n}', at));
  };
  const seriesOf = (selector) => {
    const out = [];
    for (const m of blockOf(selector).matchAll(/--series-(\d+):\s*(#[0-9a-fA-F]{6})/g)) out[+m[1] - 1] = m[2];
    return out.filter(Boolean);
  };
  const light = seriesOf(':root {'), dark = seriesOf('body[data-theme="board"] {');

  const s2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lin = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map(s2lin);
  const relLum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const contrast = (a, b) => {
    const [hi, lo] = [relLum(lin(a)), relLum(lin(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const oklab = ([r, g, b]) => {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  };
  // ماچادو، اولیویرا و فرناندس (۲۰۰۹) — شدت ۱، روی RGB خطی
  const MACHADO = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  };
  const simulate = (rgb, kind) => MACHADO[kind].map((row) =>
    Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
  const dE = (a, b, kind) => {
    const x = oklab(kind ? simulate(lin(a), kind) : lin(a));
    const y = oklab(kind ? simulate(lin(b), kind) : lin(b));
    return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  const chromaOf = (h) => { const [, a, b] = oklab(lin(h)); return Math.hypot(a, b); };
  const lightnessOf = (h) => oklab(lin(h))[0];

  check('پوسته روشن و تیره یک مجموعه سری دارند، تا سری با عوض‌شدن پوسته رنگ عوض نکند',
    light.length > 0 && light.join(',') === dark.join(','), `${light.length} و ${dark.length}`);
  check('شمار سری‌ها همان چیزی است که کد مصرف می‌کند',
    light.length === 6 && !css.includes('--series-7'), `${light.length} اسلات`);

  // بدترین جفت، روی **همه** جفت‌ها نه فقط همسایه‌ها: یک نمودار می‌تواند سری
  // ۲ و ۵ را کنار هم بگذارد بی‌آنکه ۳ و ۴ در آن باشند.
  const pairs = light.flatMap((a, i) => light.slice(i + 1).map((b) => [a, b]));
  const worstCvd = pairs.reduce((acc, [a, b]) => {
    const d = Math.min(dE(a, b, 'protan'), dE(a, b, 'deutan'), dE(a, b, 'tritan'));
    return d < acc[0] ? [d, a, b] : acc;
  }, [Infinity, '', '']);
  const worstNormal = pairs.reduce((acc, [a, b]) => {
    const d = dE(a, b);
    return d < acc[0] ? [d, a, b] : acc;
  }, [Infinity, '', '']);
  check('هیچ جفتی در دید عادی زیر کف ΔE ۱۵ نیست',
    worstNormal[0] >= 15, `بدترین ${worstNormal[1]}↔${worstNormal[2]} = ${worstNormal[0].toFixed(1)}`);
  check('هیچ جفتی در دید کوررنگ زیر هدف ΔE ۸ نیست',
    worstCvd[0] >= 8, `بدترین ${worstCvd[1]}↔${worstCvd[2]} = ${worstCvd[0].toFixed(1)}`);
  check('هیچ سری‌ای خاکستری نمی‌زند (کف اشباع ۰٫۱)',
    light.every((c) => chromaOf(c) >= 0.1),
    light.filter((c) => chromaOf(c) < 0.1).join('، '));
  // باند مشترک دو پوسته، چون یک مجموعه برای هر دو به کار می‌رود
  check('روشنایی هر سری در باند مشترک دو پوسته است',
    light.every((c) => lightnessOf(c) >= 0.48 && lightnessOf(c) <= 0.67),
    light.map((c) => lightnessOf(c).toFixed(2)).join('، '));
  check('هر سری روی هر دو زمینه کنتراست ۳:۱ دارد',
    light.every((c) => contrast(c, '#ffffff') >= 3 && contrast(c, '#111827') >= 3),
    light.filter((c) => contrast(c, '#ffffff') < 3 || contrast(c, '#111827') < 3).join('، '));

  // رنگ باید هویت را بگوید نه رتبه را: میله n اُم رنگ n اُم نمی‌گیرد.
  const rankColored = sources.filter((f) => rel(f).startsWith('ui/'))
    .filter((f) => /--series:\$\{[A-Z_]+\[index % /.test(fs.readFileSync(f, 'utf8')))
    .map(rel);
  check('هیچ نموداری رنگ را بر اساس رتبه ردیف نمی‌دهد',
    rankColored.length === 0, rankColored.join('، '));
}

// ═══ ۱۱. فلش انتخابگر با فوکوس و غیرفعال‌شدن گم نمی‌شود ═══
// `background` میان‌بر است و `background-image` را هم صفر می‌کند. قاعدهٔ
// `select` فلش را با تصویر می‌گذارد، پس هر قاعدهٔ بعدی که همان انتخابگر را
// می‌گیرد و میان‌بر بنویسد، فلش را بی‌صدا پاک می‌کند — دقیقاً همان اتفاقی
// که در :focus و :disabled افتاد و هیچ آزمونی نگرفت.
{
  group('۱۱. فلش انتخابگر با فوکوس و غیرفعال‌شدن گم نمی‌شود');
  const css = fs.readFileSync(path.join(ROOT, 'ui/style.css'), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim(), body: m[2], at: m.index }));

  const arrowRule = rules.find((r) => /background-image:\s*var\(--select-arrow\)/.test(r.body));
  check('فلش از توکن می‌آید نه از رنگ ثابت داخل قاعده', !!arrowRule,
    arrowRule ? arrowRule.sel : 'قاعده‌ای با var(--select-arrow) نبود');

  // توکن باید در هر دو پوسته تعریف شده باشد، وگرنه در پوستهٔ تیره
  // خاکستری روشنِ نامناسب یا هیچ‌چیز می‌ماند.
  const arrowDefs = [...css.matchAll(/--select-arrow:/g)].length;
  check('توکن فلش برای هر دو پوسته تعریف شده', arrowDefs === 2, `${arrowDefs} تعریف`);

  // هر قاعده‌ای که پس از قاعدهٔ فلش می‌آید و انتخابگری از جنس select دارد
  const touchesSelect = (sel) => sel.split(',').some((s) => /(^|[\s>+~])select\b/.test(s.trim()));
  const shorthand = /(^|;)\s*background\s*:/;
  const offenders = arrowRule
    ? rules.filter((r) => r !== arrowRule && touchesSelect(r.sel) && shorthand.test(r.body))
      .map((r) => r.sel.replace(/\s+/g, ' ').slice(0, 40))
    : [];
  check('هیچ قاعده‌ای برای select، background میان‌بر ندارد',
    offenders.length === 0, offenders.join('، '));
}

// ═════════════════════ ۹. بودجهٔ خواندن (قاعده ۰) ═════════════════════
//
// اندازه‌گیری ۱۴۰۵/۰۶/۰۴: خواندنِ اجباری پیش از هر کار به ۵۷۴ هزار نویسهٔ
// فارسی رسیده بود — بزرگ‌تر از پنجرهٔ بافتار هر عاملی. نتیجه‌اش این بود که
// هر جلسه بیشتر وقتش را صرف جهت‌یابی می‌کرد تا ساختن، و کار مفیدِ هر
// جلسه کوچک و کوچک‌تر می‌شد.
//
// این نگهبان سقف را نگه می‌دارد. رشد طبیعی است — دفتر کار هر روز یک قلم
// اضافه می‌کند — پس قاعده «رشد نکن» نیست، «بایگانی کن» است: وقتی اینجا
// قرمز شد، اقلام کهنه به `docs/worklog/` یا `docs/status/` بروند.
//
// سقف‌ها با `node tools/next.mjs` یکی هستند تا عامل پیش از آنکه CI قرمز
// شود خودش ببیند.
group('۹. بودجهٔ خواندنِ اجباری از سقف نگذشته');
{
  const CAPS = [
    ['NEXT.md', 8],
    ['PROTOCOL.md', 8],
    ['AGENTS.md', 16],
    ['WORKLOG.md', 48],
    ['TASK_STATUS.md', 24],
  ];
  let total = 0;
  for (const [file, capKb] of CAPS) {
    const full = path.join(ROOT, file);
    const size = fs.existsSync(full) ? fs.statSync(full).size : 0;
    total += size;
    check(`${file} زیر ${capKb} کیلوبایت است`, size > 0 && size <= capKb * 1024,
      `${(size / 1024).toFixed(1)}k از ${capKb}k`);
  }
  check('جمع خواندن اجباری زیر ۹۶ کیلوبایت است', total <= 96 * 1024,
    `${(total / 1024).toFixed(1)}k`);

  // بارگذار باید نازک بماند. هر ادعایی که اینجا نوشته شود، دوباره همان
  // فایل داغِ مشترکی می‌شود که دو کار موازی را به هم می‌زد.
  const runSize = fs.statSync(path.join(ROOT, 'tests/run.mjs')).size;
  check('tests/run.mjs بارگذار مانده، نه انبار ادعا', runSize <= 4 * 1024,
    `${(runSize / 1024).toFixed(1)}k`);

  // هیچ دسته‌ای نباید دوباره به هیولا تبدیل شود.
  const suiteDir = path.join(ROOT, 'tests/suites');
  const big = fs.readdirSync(suiteDir).filter((f) => f.endsWith('.mjs'))
    .filter((f) => fs.statSync(path.join(suiteDir, f)).size > 40 * 1024);
  check('هیچ دستهٔ آزمونی از ۴۰ کیلوبایت نگذشته', big.length === 0, big.join(' ،') || 'همه کوچک');

  // ابزارهایی که پروتکل به آن‌ها ارجاع می‌دهد باید واقعاً باشند.
  for (const f of ['NEXT.md', 'PROTOCOL.md', 'BACKLOG.md', 'tools/next.mjs', 'tools/check.mjs', 'tools/progress.mjs', 'tools/ci.mjs', 'tests/harness.mjs']) {
    check(`${f} موجود است`, fs.existsSync(path.join(ROOT, f)));
  }
}


// ۱۰ ─────────────────────────────────────────────────────────────────
//
// چیدمان آزمون سبد یک بار نوشته می‌شود، نه به‌ازای هر دسته.
//
// چرا: دسته‌های ۱۲۸ و ۱۲۹ و ۱۳۰ هر سه یک چیدمان را کپی کرده بودند —
// همان جلسه، همان قراردادها، همان دفتر، همان مأموریت. هر تغییری در شکل
// جلسه باید سه جا انجام می‌شد، و اولین باری که یکی جا می‌ماند دو دسته دو
// چیز متفاوت می‌سنجیدند و **هیچ‌کدام قرمز نمی‌شد**. آزمونی که بی‌صدا چیز
// دیگری بسنجد، از نبودنش بدتر است.
//
// نشانهٔ کپی: دسته‌ای که هم مأموریت می‌سازد و هم نامزد. این دو با هم فقط
// در چیدمان لازم‌اند؛ دسته باید چیدمان آماده را از `tests/fixtures/`
// بگیرد.
group('۱۰. چیدمان آزمون سبد کپی نمی‌شود');
{
  const suiteDir = path.join(ROOT, 'tests/suites');
  const fixture = path.join(ROOT, 'tests/fixtures/portfolio.mjs');
  check('چیدمان مشترک سبد سر جایش است', fs.existsSync(fixture));

  const copies = [];
  for (const file of fs.readdirSync(suiteDir).filter((f) => f.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(suiteDir, file), 'utf8');
    if (/createPortfolioMission/.test(src) && /portfolioCandidates/.test(src)) copies.push(file);
  }
  check('هیچ دسته‌ای چیدمان سبد را دوباره نمی‌سازد — از tests/fixtures/portfolio.mjs بگیرید',
    copies.length === 0, copies.join(' ،') || 'هیچ‌کدام');

  // بارگذار فقط دسته‌ها را می‌خواند؛ چیدمان دسته نیست و نباید اجرا شود.
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.mjs'), 'utf8');
  check('بارگذار فقط tests/suites را می‌خواند، نه tests/fixtures',
    /suites/.test(runSrc) && !/fixtures/.test(runSrc));

  // انبار داده در harness نمی‌نشیند: harness ابزار ادعاست.
  const guardHarnessSrc = fs.readFileSync(path.join(ROOT, 'tests/harness.mjs'), 'utf8');
  check('harness ابزار ادعا مانده، نه انبار چیدمان',
    !/portfolioFixture|createPortfolioMission/.test(guardHarnessSrc));
}

// ═══════════════════════════ گزارش ═══════════════════════════
// حالت خلاصه: فقط ردها و یک خط جمع‌بندی.
//
// چرا هست: گزارش کامل چند هزار خط «✔» است. برای آدمی که ترمینال را
// می‌بیند مفید است، ولی عاملی که این خروجی را در بافتار خودش می‌ریزد،
// هر بار ده‌ها هزار توکن بابت سطرهایی می‌دهد که همه سبزند. قاعده:
// عامل با `--quiet` اجرا کند، آدم بدون آن.
const QUIET = process.argv.includes('--quiet') || process.argv.includes('-q');
const W = 62;
if (QUIET) {
  let head = '';
  for (const [mark, name, detail] of results) {
    if (mark === '—') { head = name; continue; }
    if (mark === '✘') console.log(` ✘ ${head} › ${name} ${detail}`);
  }
  console.log(`نگهبان قواعد مخزن — قبول ${pass}   رد ${fail}`);
  process.exit(fail ? 1 : 0);
}
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
