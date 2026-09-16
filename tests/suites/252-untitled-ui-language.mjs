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
