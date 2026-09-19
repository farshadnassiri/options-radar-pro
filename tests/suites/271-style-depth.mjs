// ۲۷۱. لایهٔ عمقِ شیوه‌نامه — لبه‌ای که یک قاعدهٔ شفاف پاکش نکند
//
// دام: «پوستهٔ شیشه‌ای» یک لایهٔ آخرِ شیوه‌نامه بود که سطح و لبه را از
// توکن‌های `--glass-*` می‌گرفت. توکن‌ها خنثی شدند (`transparent`, `0px`,
// `none`) ولی قاعده‌ها ماندند، و چون آخر بودند لبهٔ **پایه** را هم بی‌صدا
// می‌پوشاندند: کادرِ محاسبه‌شدهٔ هر `.ghost` در مرورگر `rgba(0, 0, 0, 0)`
// بود. این دسته همان کلاس خطا را می‌بندد، نه فقط یک نمونه‌اش.

import { check, group, readSrc } from '../harness.mjs';

const RAW = readSrc('../ui/style.css');
// ادعاها روی **اعلان**‌ها است نه روی توضیح؛ شرحِ همان باگ خودش نام توکن را دارد.
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

group('۲۷۱. لایهٔ عمقِ شیوه‌نامه');
{
  check('توکنِ خنثای شیشه دیگر تعریف نمی‌شود',
    !/--glass[\w-]*\s*:/.test(CSS) && !/--ambient-\d\s*:/.test(CSS) && !/--glow-accent\s*:/.test(CSS));
  check('هیچ اعلانی رنگ یا لبه را از توکن شیشه نمی‌گیرد', !/var\(\s*--glass/.test(CSS));
  check('فهرست سایه با متغیرِ `none`دار شروع نمی‌شود', !/box-shadow:\s*var\(\s*--glow-accent/.test(CSS));
  check('`backdrop-filter` با تاری صفر نمانده است', !/backdrop-filter/.test(CSS));

  // `.ghost` تنها باید از قاعدهٔ پایه کادر بگیرد. اگر روزی قاعدهٔ دومی با
  // کادرِ دیگر رویش بنشیند، همان دام دوباره باز است — پس شمرده می‌شود.
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, sel, body]) => ({ sel: sel.trim(), body }));
  const ghostBorder = rules.filter((r) => /(^|,|\s)\.ghost(\s|,|:|\[|$)/.test(r.sel) && /border\s*:/.test(r.body));
  const dim = ghostBorder.filter((r) => !/border:\s*\d+px solid var\(--line[\w-]*\)/.test(r.body));
  check('هر کادرِ `.ghost` از توکنِ خطِ دیدنی می‌آید، نه از رنگِ شفاف',
    ghostBorder.length >= 1 && dim.length === 0, dim.map((r) => r.sel).join(' · '));
  check('قاعدهٔ پایهٔ `.ghost` کادرِ ورودی را دارد',
    ghostBorder.some((r) => r.sel === '.ghost' && /border:\s*1px solid var\(--line-input\)/.test(r.body)));

  // حبابِ راهنما نیمه‌شفاف بود و تاری هم نداشت: متن روی متن.
  check('حبابِ راهنما سطحِ مات دارد', !/background:\s*color-mix\(in srgb, var\(--panel\) 9[26]%/.test(CSS));

  // هدر سقفِ صفحه است: یک خطِ مویی، بی سایه. این قاعده یک بار دستی وصله شد.
  const top = rules.filter((r) => r.sel === '.top');
  check('هدر خطِ مویی خودش را دارد',
    top.length >= 1 && top.some((r) => /border-bottom:\s*1px solid var\(--line\)/.test(r.body)));
}
