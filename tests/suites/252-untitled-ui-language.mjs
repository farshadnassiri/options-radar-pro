// ۲۵۲. زبانِ طراحی Untitled UI — لایهٔ توکن و عناصر پایه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// درخواست صاحب پروژه: «با طرح‌های untitledui.com شکل و ظاهر تمام عناصر رو
// زیبا کن… داخل این سایت برای هر کامپوننت نمونه کار رایگان گذاشته.»
//
// خودِ سایت از پشتِ proxy باز نمی‌شود، ولی مخزن رسمی‌شان
// (`untitleduico/react`، پروانهٔ MIT) باز است و همان اعدادی که اینجا قفل
// می‌شوند از آنجا آمده‌اند — نه از بازسازیِ حدسی:
//
//   پالت‌ها          .storybook/colors.css   (پلهٔ Teal، پلهٔ Gray)
//   مقیاس سایه      styles/theme.css        (--shadow-xs تا --shadow-3xl)
//   مشخصات دکمه     components/base/buttons/button.tsx
//   مشخصات ورودی    components/base/input/input.tsx
//   مشخصات نشان     components/base/badges/badges.tsx
//   مشخصات جدول     components/application/table/table.tsx
//
// این دسته «زیبا شد» را نمی‌سنجد — آن ادعا سنجیدنی نیست. چیزی که می‌سنجد
// این است که ساختارِ زبان سرِ جایش بماند: دولایگیِ توکن، پله‌های درست،
// و سه ویژگی‌ای که اگر یکی‌شان بیفتد عنصر به حالتِ تختِ پیشین برمی‌گردد.

import { check, group, readSrc } from '../harness.mjs';

const css = readSrc('../ui/style.css');
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const blockOf = (selector) => {
  const at = noComments.indexOf(selector + ' {');
  if (at < 0) return '';
  return noComments.slice(at, noComments.indexOf('\n}', at));
};
const light = blockOf(':root');
const dark = blockOf('body[data-theme="board"]');
// بدنهٔ یک قاعده، بی کامنت‌ها — برای سنجیدن خودِ اعلان‌ها نه توضیحشان
const ruleOf = (selector) => {
  const at = noComments.indexOf('\n' + selector + ' {');
  if (at < 0) return '';
  return noComments.slice(at, noComments.indexOf('}', at));
};

group('۲۵۲-الف. لایهٔ توکن دولایه است');
{
  // در سیستمِ خودشان رنگ دو لایه دارد: پله‌های خام (`--color-brand-600`)
  // و نقش‌ها (`--color-bg-brand-solid`). فایده‌اش این نیست که قشنگ‌تر
  // است — این است که عوض‌کردنِ فامِ برند یازده خط می‌شود، نه گشتن دنبال
  // هر جایی که رنگ داشت. اگر کسی نقش را دوباره مستقیم به هگز ببندد،
  // همان گشتن برمی‌گردد.
  for (const step of ['--g-50', '--g-200', '--g-300', '--g-600', '--g-900',
    '--b-50', '--b-500', '--b-600', '--b-700']) {
    check(`پلهٔ خامِ ${step} در پوستهٔ روشن تعریف شده`, new RegExp(step + ':\\s*#').test(light));
  }
  // پلهٔ خاکستری در پوستهٔ تیره مجموعهٔ *جداگانه‌ای* است، نه وارونهٔ روشن.
  // همین است که پوستهٔ تیرهٔ Untitled UI را از «روشنِ برعکس‌شده» جدا
  // می‌کند. اگر کسی بلوکِ تیره را حذف کند و به ارث‌بری تکیه کند، سطحِ
  // تیره از پلهٔ روشن می‌آید و کل پوسته می‌شکند.
  check('پوستهٔ تیره پلهٔ خاکستریِ خودش را دارد، نه ارثیِ روشن',
    /--g-950:\s*#0c0e12/.test(dark) && /--g-950:\s*#0a0d12/.test(light));
  // فامِ برند: Teal ۶۰۰ رسمی. انتخابِ صاحب پروژه، و عددش از خودِ مخزن.
  check('فامِ برند پلهٔ Teal ۶۰۰ رسمی است', /--b-600:\s*#0e9384/.test(light));
  check('نقشِ --accent به پلهٔ خام بسته شده نه به هگز',
    /--accent:\s*var\(--b-600\)/.test(light) && /--accent:\s*var\(--b-600\)/.test(dark));

  // سه توکنی که پیش از این صدا زده می‌شدند و هیچ‌جا تعریف نشده بودند.
  // محورِ نمودارِ تاریخچه، خطِ صفر و دستهٔ اسکرول‌بارِ تقویم عملاً بی‌رنگ
  // بودند و هیچ آزمونی نمی‌گرفت، چون CSS برای متغیرِ تعریف‌نشده خطا
  // نمی‌دهد — فقط بی‌صدا اعلان را دور می‌اندازد.
  for (const token of ['--line-strong', '--lh-relaxed', '--motion-fast']) {
    check(`توکن ${token} تعریف شده (پیش از این صدا زده می‌شد و نبود)`,
      new RegExp(token + ':').test(light));
  }

  // هر توکنِ رنگی که کد صدا می‌زند باید در *هر دو* پوسته جواب داشته
  // باشد. توکنی که فقط در روشن هست، در پوستهٔ تیره رنگِ پوستهٔ روشن را
  // می‌دهد — یعنی یک لکهٔ روشن روی زمینهٔ سیاه.
  for (const token of ['--gain-line', '--loss-line', '--warn-line', '--accent-line',
    '--muted-2', '--btn-inner-edge']) {
    check(`توکن ${token} در هر دو پوسته تعریف شده`,
      new RegExp(token + ':').test(light) && new RegExp(token + ':').test(dark));
  }
}

group('۲۵۲-ب. دکمه سه لایهٔ شکلی‌اش را دارد');
{
  // دکمهٔ Untitled UI سه چیز دارد و اگر *هر کدام* بیفتد به یک مستطیلِ
  // رنگیِ تخت برمی‌گردد. هر سه اینجا جدا سنجیده می‌شوند، چون هر سه را
  // می‌شود بی‌صدا و جداگانه از دست داد.
  const btn = ruleOf('.btn, .primary');
  check('دکمه رنگِ برند را پر می‌کند', /background:\s*var\(--accent\)/.test(btn));
  check('دکمه لبهٔ inset دارد (--shadow-xs-skeuo)', /box-shadow:\s*var\(--shadow-xs-skeuo\)/.test(btn));
  check('دکمه برای شبه‌عنصرِ برجستگی، position دارد', /position:\s*relative/.test(btn));

  const before = ruleOf('.btn::before, .primary::before');
  check('برجستگیِ داخلی با شبه‌عنصر ساخته شده', before.length > 0);
  check('برجستگی از توکنِ لبه رنگ می‌گیرد', /border:\s*1px solid var\(--btn-inner-edge\)/.test(before));
  // هر دو اعلان سنجیده می‌شوند، نه یکی: با سنجیدنِ یکی، برگرداندنِ جهتِ
  // آن یکی بی‌صدا رد می‌شد — و مرورگری که نسخهٔ پیشوندداد را می‌خواند
  // دکمه را «فرورفته» نشان می‌داد. این را با خرابکاریِ عمدی سنجیدم: ادعای
  // پیشین همان خرابکاری را نگرفت.
  const maskDirs = [...before.matchAll(/mask-image:\s*linear-gradient\(to (\w+)/g)].map((m) => m[1]);
  check('هر دو اعلانِ ماسک از بالا به پایین محو می‌شوند',
    maskDirs.length === 2 && maskDirs.every((d) => d === 'bottom'), maskDirs.join('، '));
  // `currentColor` نه سیاهِ ثابت: ماسکِ CSS فقط کانالِ آلفا را می‌خواند،
  // پس هر رنگِ مات کار می‌کند — و این‌طور رنگِ سخت‌کدشده‌ای بیرونِ بلوکِ
  // توکن نمی‌ماند و نگهبان ۴ قرمز نمی‌شود.
  check('ماسک رنگِ سخت‌کدشده ندارد', !/mask-image:[^;]*#[0-9a-f]{3}/i.test(before));

  // دکمهٔ دوم خاکستری است نه هم‌فامِ دکمهٔ اصلی. دو دکمهٔ هم‌فام کنار هم،
  // سلسله‌مراتب را از بین می‌برند: چشم باید *پرشدن* را ببیند تا بفهمد
  // کدام کارِ اصلی است.
  const sec = ruleOf('.btn.sec, .btn-sec');
  check('دکمهٔ دوم کادرِ خاکستری دارد نه کادرِ برند',
    /border:\s*1px solid var\(--line-input\)/.test(sec) && !/var\(--accent\)/.test(sec));
  // شبه‌عنصرِ برجستگی از `.btn` به `.btn.sec` هم ارث می‌رسد؛ روی سطحِ
  // سفید، کادرِ سفیدِ ۱۲٪ دیده نمی‌شود ولی یک پیکسل فضا می‌خورد. باید
  // صریح خاموش شود.
  check('برجستگیِ داخلی روی دکمهٔ دوم خاموش است',
    /content:\s*none/.test(ruleOf('.btn.sec::before, .btn-sec::before')));
  check('برجستگیِ داخلی روی دکمهٔ خطرناک خاموش است',
    /content:\s*none/.test(ruleOf('.btn.danger::before, .btn.destructive::before, .btn-danger::before')));
}

group('۲۵۲-پ. ورودی سطحِ نشسته است، نه بخشی از کاغذ');
{
  // ورودیِ Untitled UI سایهٔ `xs` دارد. آن سایه تزئین نیست: چیزی که
  // می‌شود در آن نوشت باید به نظر برسد که *روی* کاغذ نشسته. پیش از این
  // `box-shadow: none` بود و ورودی از یک مستطیلِ کادردار جدا نمی‌شد.
  const input = noComments.slice(
    noComments.indexOf('.field input, .field select,'),
    noComments.indexOf('.field input::placeholder'));
  check('ورودی سایهٔ سطحِ نشسته دارد', /box-shadow:\s*var\(--shadow-xs\)/.test(input));
  check('گردیِ ورودی هم‌اندازهٔ دکمه است (پلهٔ md)', /border-radius:\s*var\(--radius-md\)/.test(input));

  // فوکوس دولایه: کادرِ داخلی سفت می‌شود و حلقهٔ بیرونی می‌نشیند. لایهٔ
  // داخلی باید `inset` باشد وگرنه اندازهٔ کادر عوض می‌شود و ردیفِ
  // کنترل‌ها موقعِ فوکوس می‌لرزد.
  const focus = noComments.slice(noComments.indexOf('.field input:focus, .field select:focus,'));
  check('فوکوسِ ورودی لایهٔ داخلیِ inset دارد',
    /box-shadow:\s*0 0 0 1px var\(--accent\) inset,\s*var\(--focus-ring\)/.test(focus));
  // متنِ راهنما باید از متنِ واقعی کم‌رنگ‌تر باشد، وگرنه کاربر راهنما را
  // با مقدارِ نوشته‌شده اشتباه می‌گیرد.
  check('متنِ راهنما پلهٔ کم‌رنگ‌تر می‌گیرد',
    /::placeholder[^{]*\{[^}]*color:\s*var\(--muted-2\)/.test(noComments));
}

group('۲۵۲-ت. نشان و سرستون با خودشان رقابت نمی‌کنند');
{
  // نشان: کادر باید پلهٔ ۲۰۰ باشد نه پلهٔ کاملِ رنگ. با کادرِ پررنگ، نشانِ
  // «بازار باز» یک حلقهٔ سبزِ سیر دارد که با خودِ متن رقابت می‌کند.
  for (const [cls, token] of [['open', '--gain-line'], ['shut', '--warn-line'], ['down', '--loss-line']]) {
    check(`کادرِ نشانِ .${cls} پلهٔ کم‌رنگ است`,
      new RegExp('\\.pill\\.' + cls + '\\s*\\{[^}]*border-color:\\s*var\\(' + token + '\\)').test(noComments));
  }
  check('نشان سایه ندارد — شناور نیست', /\.pill \{[^}]*box-shadow:\s*none/.test(noComments));

  // سرستون: کوچک‌تر و کم‌رنگ‌تر از متنِ جدول، نه بزرگ‌تر و پررنگ‌تر.
  // عنوانِ ستون را یک‌بار می‌خوانی، عددهای زیرش را ده‌ها بار.
  const th = ruleOf('table.data thead th');
  check('سرستون کم‌رنگ‌تر از متنِ جدول است', /color:\s*var\(--muted\)/.test(th));
  check('خطِ زیرِ سرستون یک پیکسل است، نه دو',
    /border-bottom:\s*1px solid var\(--line\)/.test(th));
}

group('۲۵۲-ث. پوستهٔ برنامه — هدر، ستون ناوبری، حالتِ خالی');
{
  // ── خطی که یک قاعدهٔ بازمانده بی‌صدا پاک می‌کرد ──────────────────
  //
  // `.top` دو قاعده داشت. دومی بازماندهٔ پوستهٔ شیشه‌ای بود و
  // `border-bottom: 1px solid var(--glass-edge)` می‌گذاشت. وقتی توکن‌های
  // شیشه خنثی شدند `--glass-edge` شد `transparent` — یعنی قاعدهٔ دوم خطی
  // را که قاعدهٔ اول گذاشته بود پاک می‌کرد. در عکسِ صفحه هدر هیچ مرزی با
  // محتوا نداشت. این ادعا همان را قفل می‌کند.
  const tops = [...noComments.matchAll(/\.top \{([^}]*)\}/g)].map((m) => m[1]);
  check('هدر بیش از یک قاعده ندارد یا آخری خط دارد', tops.length > 0);
  const lastTop = tops[tops.length - 1];
  check('خطِ زیرِ هدر از توکنِ شفاف نمی‌آید',
    /border-bottom:\s*1px solid var\(--line\)/.test(lastTop) && !/--glass-edge/.test(lastTop));

  // ستونِ ناوبری سطحِ نشسته است، نه کارتِ شناور. `--shadow-lg` سایهٔ چیزی
  // است که روی صفحه شناور است؛ ستونی که تمامِ قد کنارِ صفحه ایستاده
  // شناور نیست و آن سایه فقط لبه‌اش را تار می‌کرد.
  const rail = ruleOf('.rail');
  check('ستون ناوبری سایهٔ سطحِ نشسته دارد نه سایهٔ شناور',
    /box-shadow:\s*var\(--shadow-xs\)/.test(rail));
  check('ستون ناوبری زمینهٔ مات دارد نه نیمه‌شفاف',
    /background:\s*var\(--panel\)/.test(rail));

  // ── ایرادی که فقط در عکسِ صفحه دیده شد ───────────────────────────
  //
  // هر ده ردیفِ فهرست یک زمینهٔ خاکستریِ پر داشتند. وقتی *همه* پرند،
  // پرشدن دیگر چیزی نمی‌گوید: ردیفِ انتخاب‌شده از نُه ردیفِ دیگر جدا
  // نمی‌شد. در سیستمِ خودشان ردیف بی‌زمینه است و فقط دو حالت زمینه
  // می‌گیرد — هاور و انتخاب‌شده.
  const railRow = ruleOf('.rail-row');
  check('ردیفِ ناوبری در حالتِ عادی بی‌زمینه است',
    /background:\s*transparent/.test(railRow));
  check('ردیفِ انتخاب‌شده زمینه می‌گیرد',
    /background:\s*var\(--panel-2\)/.test(ruleOf('.rail-row[aria-current="true"]')));

  // حالتِ خالی نشانِ برجسته دارد. بی آن، صفحهٔ خالی «هنوز بار نشده» به
  // نظر می‌رسد نه «آماده، منتظرِ انتخاب».
  check('حالتِ خالی نشانِ برجسته دارد', ruleOf('.empty::before').length > 0);
  // آیکون با ماسک می‌آید نه با تصویرِ رنگی: ماسک رنگ را از
  // `background-color` می‌گیرد، پس یک تعریف در هر دو پوسته درست است.
  // با تصویرِ رنگی، رنگِ داخلِ SVG ثابت می‌ماند و در یکی از دو پوسته غلط
  // است — همان دامی که فلشِ انتخابگر افتاد و ناچار شد دو نسخه داشته باشد.
  check('آیکونِ حالتِ خالی با ماسک می‌آید نه با تصویرِ رنگی',
    /mask-image:\s*var\(--empty-icon\)/.test(ruleOf('.empty::before')));
  check('توکنِ آیکون یک‌بار تعریف شده، نه یک‌بار برای هر پوسته',
    [...noComments.matchAll(/--empty-icon:/g)].length === 1);
}

group('۲۵۲-ج. تب، پله‌گذار و اسلایدر');
{
  // نوار تب یک **ظرف** است: زمینهٔ فرورفته، خطِ مویی، فاصلهٔ داخلی. تب‌ها
  // داخلش بی‌زمینه‌اند و فقط تبِ فعال سطحِ بالاآمده می‌گیرد. پیش از این
  // تبِ فعال قرصی پر از رنگِ برند بود — یعنی «کجا هستم» و «چه کاری انجام
  // بده» یک ظاهر داشتند.
  check('نوار تب ظرفِ فرورفته دارد', /\.chips \{[^}]*background:\s*var\(--ground\)/.test(noComments));
  const chip = ruleOf('.chip');
  check('تبِ غیرفعال بی‌زمینه است', /background:\s*transparent/.test(chip));
  const chipOn = ruleOf('.chip[aria-pressed="true"]');
  check('تبِ فعال سطحِ بالاآمده می‌گیرد نه پرشدنِ برند',
    /background:\s*var\(--panel\)/.test(chipOn) && /box-shadow:\s*var\(--shadow-xs\)/.test(chipOn)
    && !/var\(--accent\)/.test(chipOn));

  // پله‌گذار گردِ کامل بود. در ردیفی که کادرِ عددِ وسطش گوشهٔ ۸ دارد، دو
  // دایرهٔ کامل در دو طرف سه زبانِ شکلی در یک ردیف می‌ساخت.
  check('پله‌گذار گردیِ همان ردیف را دارد، نه دایرهٔ کامل',
    /border-radius:\s*var\(--radius-md\)/.test(ruleOf('.step-btn')));

  // ── اسلایدر: دو راهی که کار نکردند ───────────────────────────────
  //
  // `overflow: hidden` روی ریل، در موتورِ وبکیت خودِ دستگیره را هم به
  // ارتفاعِ ریل می‌بُرد — دستگیرهٔ ۲۲ پیکسلی یک تراشهٔ ۸ پیکسلی می‌شد.
  // این را در عکسِ صفحه دیدم، نه در آزمون. پس ادعا همان را قفل می‌کند.
  const track = ruleOf('.num-range::-webkit-slider-runnable-track');
  check('ریلِ اسلایدر overflow ندارد — دستگیره را می‌بُرد',
    !/overflow:\s*hidden/.test(track));
  check('پرشدگیِ ریل از متغیرِ --fill می‌آید', /var\(--fill\)/.test(track));
  // جهتِ گرادیان `to left` است چون صفحه راست‌به‌چپ است و کمینهٔ بازه سمتِ
  // راست می‌نشیند. با جهتِ چپ‌به‌راست، سمتِ اشتباه پر می‌شد.
  check('پرشدگی از سمتِ راست شروع می‌شود (صفحه راست‌به‌چپ است)',
    /linear-gradient\(to left/.test(track));
  // مقدارِ پیش‌فرض لازم است: اگر JS نرسد، ریل باید خالیِ سالم باشد نه خراب.
  check('--fill پیش‌فرضِ صفر دارد', /\.num-range \{ --fill: 0%; \}/.test(noComments));
  const thumb = ruleOf('.num-range::-webkit-slider-thumb');
  check('دستگیره ۲۲ پیکسل و گردِ کامل است',
    /width:\s*22px/.test(thumb) && /border-radius:\s*var\(--radius-pill\)/.test(thumb));

  // و طرفِ JS: درصد باید در هر پنج نقطه‌ای که مقدارِ اسلایدر عوض می‌شود
  // دوباره نوشته شود، وگرنه ریل از عدد عقب می‌ماند.
  const settings = readSrc('../ui/tabs/settings.mjs');
  check('تابعِ رنگ‌کردنِ ریل هست', /const paintRange = \(r\) =>/.test(settings));
  // شمردن کافی نیست — باید همان پنج نقطه باشند. عددِ خام با جابه‌جا شدنِ
  // یک صدا از جایی به جای دیگر همچنان سبز می‌ماند.
  const sites = [
    ['ساختِ اولیهٔ کنترل', /inputs\.set\(f\.key[^\n]*\n\s*paintRange\(rangeNode\);/],
    ['همگام‌سازی از کادرِ عدد', /rangeNode\.value = clamp\(v\); paintRange\(rangeNode\);/],
    ['کشیدنِ خودِ اسلایدر', /node\.value = rangeNode\.value; paintRange\(rangeNode\);/],
    ['دکمهٔ پله‌گذار', /rangeNode\.value = next; paintRange\(rangeNode\);/],
    ['بارگذاریِ تنظیمات از سرور', /rangeNode\.value = next\[key\]; paintRange\(rangeNode\);/],
  ];
  for (const [where, pattern] of sites) {
    check(`ریل پس از «${where}» دوباره رنگ می‌شود`, pattern.test(settings));
  }
}
