// ۳۰۵. واحد پول: ریال همه‌جا، بزرگ‌ها «میلیون ریال»
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۰۸): «واحد ارقام در برنامه حتماً باید ریال
// باشد نه تومان؛ اگر اعداد بزرگ شدند میلیون ریال.» پیش از این قاعدهٔ مخزن
// «ریال داخل، تومان در نمایش» بود و ۲۱ فایل ریال را بر ده تقسیم می‌کردند،
// از جمله فرم‌هایی که کاربر در آن‌ها مبلغ تایپ می‌کند.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import { fmt } from '../../ui/fmt.mjs';
import { sanitize, defaults } from '../../core/settings.mjs';
import { rialFromInput, parseRialInput } from '../../ui/portfolio-mission-form.mjs';
import { DEFAULT_CAPITAL_RIAL } from '../../core/bereket-session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : (p.endsWith('.mjs') ? [p] : []);
});
const code = (p) => readSrc(`../${path.relative(ROOT, p).split(path.sep).join('/')}`)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

group('۳۰۵. ریال همه‌جا');
{
  const files = ['ui', 'core', 'server', 'strategies'].flatMap((d) => walk(path.join(ROOT, d)));
  const toman = files.filter((p) => /تومان/.test(code(p))).map((p) => path.relative(ROOT, p));
  check('هیچ کد اجرایی «تومان» نمی‌نویسد', toman.length === 0, toman.join(', ') || 'هیچ');
  const divide = files.filter((p) => /Rial[A-Za-z.?]*\)?\s*\/\s*10\b|rial\s*\/\s*10\b/.test(code(p)))
    .map((p) => path.relative(ROOT, p));
  check('هیچ‌جا ریال برای نمایش بر ده تقسیم نمی‌شود', divide.length === 0, divide.join(', ') || 'هیچ');
  check('قالب تومانی از `fmt` رفته', fmt.toman === undefined && fmt.tomanShort === undefined);
  check('بزرگ‌ها «میلیون ریال»، کوچک‌ها خودِ ریال',
    fmt.rialText(10_000_000_000) === '۱۰,۰۰۰ میلیون ریال' && fmt.rialText(950_000) === '۹۵۰,۰۰۰ ریال');
}

group('۳۰۵. ورودی‌ها ریال‌اند');
{
  check('فرم مأموریت ریال تایپ‌شده را همان ریال می‌گیرد، نه ×۱۰',
    rialFromInput('۱۰,۰۰۰,۰۰۰,۰۰۰') === 10_000_000_000 && parseRialInput('۲۵۰۰') === 2500);
  check('سرمایهٔ پیش‌فرض جلسه ده میلیارد ریال است (همان یک میلیارد تومانِ قبلی)',
    DEFAULT_CAPITAL_RIAL === 10_000_000_000 && defaults().bkCapitalRial === 10_000_000_000);
  check('تنظیمِ ذخیره‌شدهٔ تومانی ×۱۰ به کلید ریالی منتقل می‌شود، بی‌صدا عوض نمی‌شود',
    sanitize({ bkCapitalToman: 2_000_000_000 }).bkCapitalRial === 20_000_000_000
    && sanitize({ bkCapitalToman: 2_000_000_000, bkCapitalRial: 5_000_000_000 }).bkCapitalRial === 5_000_000_000
    && !('bkCapitalToman' in sanitize({ bkCapitalToman: 1 })));
}
