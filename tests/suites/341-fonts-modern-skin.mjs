// ۳۴۱. قلم‌های درون پروژه، منوی «ظاهر» و پوستهٔ «ابزار مدرن» (۱۴۰۵/۰۷/۱۷)
//
// «ظاهر سایت خیلی جنریک است.» از سه نمونه صاحب پروژه «ج» را برگزید و خواست
// «قابلیت تغییر و انتخاب چند فونت در برنامه وجود داشته باشد».

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import { FONTS, DEFAULT_FONT, fontOf, fontStack, readFont, applyFont } from '../../ui/font-choice.mjs';
import { defaults } from '../../core/settings.mjs';

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui');
const fontsCss = readSrc('../ui/fonts/fonts.css');

group('۳۴۱. قلم‌ها درون پروژه‌اند');
{
  const urls = [...fontsCss.matchAll(/url\('\.\/([^']+\.woff2)'\)/g)].map((m) => m[1]);
  check('هر پروندهٔ fonts.css واقعاً هست و خالی نیست', urls.length >= 10
    && urls.every((u) => existsSync(path.join(UI, 'fonts', u)) && statSync(path.join(UI, 'fonts', u)).size > 10_000), urls.length);
  check('هر قلمِ فهرست، چهرهٔ فارسی (عربی) و لاتین دارد', FONTS.every((font) => {
    const faces = [...fontsCss.matchAll(new RegExp(`font-family: '${font.family}';[^}]*url\\('\\./${font.id}/(arabic|latin)-`, 'g'))].map((m) => m[1]);
    return faces.includes('arabic') && faces.includes('latin');
  }));
  check('قلمِ بی حرف و رقم فارسی (Readex Pro) کنار گذاشته شد', !fontsCss.includes('Readex') && !FONTS.some((f) => /readex/i.test(f.family)));
  check('پروانهٔ قلم‌ها کنارشان است', existsSync(path.join(UI, 'fonts', 'LICENSE.md')) && readSrc('../ui/fonts/LICENSE.md').includes('SIL Open Font License'));
  const index = readSrc('../ui/index.html');
  check('دیگر هیچ قلمی از CDN نمی‌آید', !/jsdelivr|fonts\.googleapis/.test(index) && index.includes('<link rel="stylesheet" href="/ui/fonts/fonts.css">'));
  check('قلمِ ذخیره‌شده پیش از نخستین رسم روی ریشه می‌نشیند', index.includes("var f = localStorage.getItem('font'); if (f) document.documentElement.dataset.font = f;")
    && FONTS.filter((f) => f.id !== DEFAULT_FONT).every((f) => readSrc('../ui/style.css').includes(`:root[data-font="${f.id}"] { --font-ui: "${f.family}"`)));
}

group('۳۴۱. انتخابِ قلم');
{
  check('پیش‌فرض «آی‌بی‌ام پلکس» نمونهٔ «ج»', DEFAULT_FONT === 'plex' && fontOf('plex').family === 'IBM Plex Sans Arabic');
  check('شناسهٔ ناشناخته به پیش‌فرض برمی‌گردد', fontOf('x').id === 'plex' && readFont({ getItem: () => 'nope' }) === 'plex' && readFont({ getItem: () => { throw new Error('x'); } }) === 'plex');
  check('پشته: قلمِ انتخابی، بعد وزیرمتن', fontStack('noto-naskh').startsWith('"Noto Naskh Arabic", Vazirmatn'));
  const props = {}, root = { style: { setProperty: (k, v) => { props[k] = v; } }, dataset: {} };
  const store = new Map(), storage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) };
  applyFont('noto-kufi', { root, storage });
  check('اعمال: `--font-ui` و `data-font` روی ریشه، و ذخیره', props['--font-ui'].startsWith('"Noto Kufi Arabic"') && root.dataset.font === 'noto-kufi' && store.get('font') === 'noto-kufi');
  applyFont('vazirmatn', { root, storage, persist: false });
  check('بوت نمی‌نویسد، فقط انتخابِ کاربر', root.dataset.font === 'vazirmatn' && store.get('font') === 'noto-kufi');
  const css = readSrc('../ui/style.css');
  check('همهٔ متن، عدد و نمودار از همان توکن', /--sans:\s*var\(--font-ui\);/.test(css) && /--mono:\s*var\(--font-ui\), Vazirmatn;/.test(css) && /--font:\s*var\(--sans\);/.test(css));
  const img = readSrc('../ui/chart-image.mjs');
  check('تصویرِ ذخیره‌شده قلمِ جاری را از پرونده‌های محلی جاسازی می‌کند', img.includes("find((l) => /fonts\\.css|vazirmatn/i.test(l.href))")
    && img.includes("const own = all.filter((f) => f.family.replace(/[\"']/g, '') === active);") && img.includes('font-weight:${face.weightText}'));
}

group('۳۴۱. منوی «ظاهر»');
{
  const index = readSrc('../ui/index.html'), app = readSrc('../ui/app.mjs');
  check('پوسته (روشن/تیره) و قلم در یک منو', index.includes('<details class="appearance" id="appearance">') && index.includes('data-theme-pick="ledger"') && index.includes('data-theme-pick="board"') && index.includes('id="font-list" role="radiogroup"'));
  check('هر قلم با نام و نمونهٔ عدد در خودِ همان قلم', app.includes('data-font-pick="${font.id}" aria-checked="${font.id === current}" style="font-family: ${fontStack(font.id)'));
  check('انتخاب، منو را نمی‌بندد (برچسب در جا عوض می‌شود)', app.includes("list.querySelectorAll('[data-font-pick]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.fontPick === current)));"));
  check('در موبایل منو زیر هدر و تمام‌عرض است، نه بریده در نوار لغزان', readSrc('../ui/style.css').includes('@media (max-width: 820px) { .appearance-panel { position: fixed; inset-inline: 12px;'));
}

group('۳۴۱. پوستهٔ «ابزار مدرن»');
{
  const css = readSrc('../ui/style.css');
  check('برند نیلی است و نقش‌ها به پله بسته‌اند', /--b-600:\s*#5b4cf0/.test(css) && /--accent:\s*var\(--b-600\)/.test(css));
  check('امضا: لوگو و نوار بالای کاشی با رنگ کال/پوت', css.includes('.brand-mark { width: 22px; height: 22px; border-radius: 7px; background: linear-gradient(135deg, var(--call) 0 50%, var(--put) 50% 100%); }')
    && css.includes('.cp-tile::before { inset-block: auto; inset-inline: 0; top: 0; width: auto; height: 3px;'));
  check('نوار تب فشرده؛ شرحِ هر تب در راهنمای شناور', css.includes('.dd-tabbar button small { display: none; }') && readSrc('../ui/tabs/live-market-dashboard.mjs').includes('title="${mode.hint}"'));
  check('پیش‌فرضِ پوسته روشن، در هر سه جا', defaults().theme === 'ledger' && readSrc('../data/settings.json').includes('"theme": "ledger"') && readSrc('../ui/index.html').includes('<body data-theme="ledger">'));
}
