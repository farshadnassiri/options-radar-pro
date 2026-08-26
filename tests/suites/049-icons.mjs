// ۴۸. نام انگلیسی، رنگ منفی، و ریل آیکونی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import * as uiFmt48 from '../../ui/fmt.mjs';
import { check, group, readSrc } from '../harness.mjs';
import { CATALOG, GROUPS as STRAT_GROUPS48 } from '../../strategies/catalog.mjs';
import { signTone } from '../../ui/fmt.mjs';
import { GROUP_ICON, TAB_ICON, icon, sectionIcon } from '../../ui/icons.mjs';


// ═══════════════════════════ ۴۸. نام انگلیسی، رنگ منفی، و ریل آیکونی ═══════════════════════════
group('۴۸. نام انگلیسی، رنگ منفی، و ریل آیکونی');
{
  // ——— نام استراتژی ———
  const latin = /^[A-Za-z][A-Za-z\- ]*$/;
  check('نام هر ۳۱ استراتژی انگلیسی است',
    CATALOG.every((d) => latin.test(d.name)),
    CATALOG.filter((d) => !latin.test(d.name)).map((d) => d.id).join(' , ') || 'همه');
  check('هیچ نامی تکراری نیست', new Set(CATALOG.map((d) => d.name)).size === CATALOG.length);
  // برابر فارسی نمایش داده نمی‌شود ولی باید بماند، وگرنه کسی که استراتژی را
  // با نام فارسی می‌شناسد هیچ راهی برای پیدا کردنش ندارد.
  check('برابر فارسی برای جست‌وجو نگه داشته شده',
    CATALOG.every((d) => typeof d.fa === 'string' && d.fa.length > 0));
  const appSrc48 = readSrc('../ui/app.mjs');
  check('جست‌وجوی ریل نام فارسی را هم می‌بیند', appSrc48.includes("${t.def?.fa || ''}"));

  // ——— جزیرهٔ جهت‌دار ———
  //
  // بدون این، «Covered Call — مطالعه‌ای» می‌تواند وارونه دیده شود: خط تیره
  // خنثی است و به بافت راست‌به‌چپ می‌چسبد.
  check('نام لاتین در جزیرهٔ جهت‌دار بسته می‌شود',
    uiFmt48.ltr('Covered Call') === '\u2068Covered Call\u2069');
  check('مقدار تهی رشتهٔ خالی می‌دهد', uiFmt48.ltr(null) === '' && uiFmt48.ltr(undefined) === '');
  for (const [file, what] of [['../ui/app.mjs', 'ریل'], ['../ui/tabs/strategy.mjs', 'سرصفحهٔ استراتژی'],
    ['../ui/tabs/backtest.mjs', 'فهرست بک‌تست'], ['../ui/tabs/history.mjs', 'فهرست تاریخچه']]) {
    const src = readSrc(file);
    check(`نام استراتژی در ${what} ایزوله می‌شود`, /ltr\(/.test(src));
  }

  // ——— رنگ عدد منفی ———
  check('کلاس منفی فقط به عدد منفی می‌خورد',
    uiFmt48.negClass(-1) === 'neg' && uiFmt48.negClass(0) === '' && uiFmt48.negClass(5) === ''
    && uiFmt48.negClass(NaN) === '' && uiFmt48.negClass(Infinity) === '');
  check('سلول عددی آماده، کلاس و قالب را با هم می‌دهد',
    uiFmt48.numCell(-5000, 'money').includes('class="n neg') && uiFmt48.numCell(-5000, 'money').includes('<td'));
  const css48 = readSrc('../ui/style.css');
  // `signTone` ده‌ها جا کلاس loss می‌گذاشت و هیچ قاعدهٔ سراسری‌ای رنگش
  // نمی‌کرد — یعنی بیشترشان بی‌اثر بودند.
  check('کلاس زیان و سود روی سلول جدول قاعدهٔ سراسری دارد',
    /td\.loss, dd\.loss \{ color: var\(--loss\); \}/.test(css48)
    && /td\.gain, dd\.gain \{ color: var\(--gain\); \}/.test(css48));
  check('کلاس neg هم سراسری است', /\.neg, td\.neg, dd\.neg \{ color: var\(--loss\); \}/.test(css48));

  // ——— ریل ———
  check('هر گروه استراتژی آیکون دارد',
    Object.keys(STRAT_GROUPS48).every((k) => GROUP_ICON[k]),
    Object.keys(STRAT_GROUPS48).filter((k) => !GROUP_ICON[k]).join(' , ') || 'همه');
  check('هر تب غیراستراتژی هم آیکون دارد',
    ['settings', 'live-market', 'history', 'backtest', 'portfolio-backtest', 'positions', 'roll']
      .every((id) => TAB_ICON[id]));
  check('آیکون رنگ را از متن می‌گیرد، نه رنگ ثابت',
    icon('coins').includes('stroke="currentColor"') && !/stroke="#/.test(icon('coins')));
  check('آیکون ناشناخته به‌جای شکستن، نقطه می‌دهد', icon('چیزی-که-نیست').includes('<circle'));
  check('بخش بی‌گروه هم آیکون می‌گیرد',
    sectionIcon('پایه') === 'sliders' && sectionIcon('موقعیت من') === 'briefcase');
  // پیش‌فرض «همه بسته» فقط وقتی درست است که نبودِ کلید از آرایهٔ خالی جدا
  // شود، وگرنه کاربری که همه را باز کرده هر بار دوباره بسته می‌بیند.
  check('نبودِ کلید حافظه با آرایهٔ خالی یکی گرفته نمی‌شود',
    appSrc48.includes('if (raw == null) return new Set(allSections);'));
  check('برچسب «n پا» از ریل برداشته شد', !appSrc48.includes('پا</span>'));
  check('باز شدن تب، گروه بسته‌اش را باز می‌کند',
    appSrc48.includes('if (folded.has(t.section)) { revealSection(t.section); buildRail(); }'));
  // آکاردئون: با ده سرگروه و چهل تب، «چند بخشِ هم‌زمان باز» یعنی ستون کناری
  // بلندتر از صفحه می‌شود و کاربر برای رسیدن به سرگروه بعدی از کنار فهرستی
  // رد می‌شود که کاری با آن ندارد.
  check('باز شدن یک بخش، بقیه بخش‌های باز را می‌بندد',
    /function revealSection\(sec\) \{[\s\S]*?folded\.add\(other\)[\s\S]*?folded\.delete\(sec\);/.test(appSrc48));
  // `stage` خودش جعبهٔ پیمایش است؛ `scrollIntoView` پیمایش داخلی‌اش را صفر
  // نمی‌کند و تب تازه از جایی که تب قبلی رهایش کرده بود شروع می‌شد.
  check('تب تازه از سطر اول شروع می‌شود، نه از جای تب قبلی',
    (appSrc48.match(/stage\.scrollTop = 0;/g) || []).length >= 2);
  // رنگ بخش از توکن‌های خودِ پوسته می‌آید، وگرنه پوستهٔ تیره باید جدا رنگ
  // بگیرد و همان پراکندگی‌ای می‌شود که نگهبان ۴ جلویش را گرفته.
  check('رنگ هر بخش ریل از توکن پوسته می‌آید، نه از رنگ سخت‌کد',
    /const SECTION_TONE = \{[\s\S]*?\};/.test(appSrc48)
    && !/SECTION_TONE = \{[\s\S]*?#[0-9a-fA-F]{3}/.test(appSrc48));
  const styleSrc48 = readSrc('../ui/style.css');
  check('تب باز، رنگ بخش خودش را می‌گیرد نه یک رنگ همیشگی',
    /\.tab-btn\[aria-current="true"\] \{[^}]*var\(--sec\)/.test(styleSrc48));
}
