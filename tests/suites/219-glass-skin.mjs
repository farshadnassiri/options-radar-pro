// ۲۱۹. پوستهٔ شیشه‌ای
//
// ═══ چرا این دسته هست ═══
//
// بازطراحی ظاهر یک تغییر «بی‌خطر» به نظر می‌رسد و نیست. سه اشکالِ واقعی
// در همین بازطراحی رخ داد که هیچ‌کدام از خواندنِ کد پیدا نشدند — هر سه
// را اجرای واقعی در مرورگر و **سنجشِ عددیِ کنتراست** پیدا کرد:
//
//   ۱. زمینه به `html` منتقل شد تا لکه‌های نور دیده شوند. ولی `--ground`
//      پوستهٔ تیره روی `body[data-theme="board"]` تعریف شده، پس `html`
//      هرگز آن را نمی‌بیند و زمینه در پوستهٔ تیره **روشن** ماند. عنوانِ
//      سفیدِ صفحه روی آن به نسبت کنتراست ۱٫۱۸ رسید — عملاً نامرئی.
//   ۲. نوارِ نورِ کارت با درصد تمام می‌شد، پس در کارتِ بلند روی متن
//      می‌افتاد و در پوستهٔ تیره کلِ ردیفِ برچسب‌ها را خاکستری‌روی‌خاکستری
//      کرد.
//   ۳. `.subtabs` مقدار `display` می‌گذارد و صفتِ `hidden` را می‌شکند؛
//      یک جعبهٔ خالیِ شیشه‌ای وسط صفحه می‌ماند.
//
// این دسته هر سه را قفل می‌کند. سنجشِ کنتراست خودش اینجا اجرا نمی‌شود —
// مرورگر لازم دارد — ولی **شرطِ ساختاری‌ای** که آن سه اشکال را ممکن کرد
// اینجا قفل است.

import { check, group, readSrc } from '../harness.mjs';

const css = readSrc('../ui/style.css');
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * تنِ قاعده‌های یک انتخابگر — فقط میان `{` و نخستین `}` پس از آن.
 *
 * **همه** برمی‌گردند نه اولی. پوستهٔ شیشه‌ای عمداً لایه‌ای روی قاعده‌های
 * پایه است، پس `.card` دو بار تعریف شده و آنچه واقعاً رسم می‌شود آخری
 * است. نسخهٔ اول این تابع فقط اولی را می‌دید و ادعایش را روی قاعده‌ای
 * می‌سنجید که هیچ‌وقت غالب نمی‌شود — یعنی آزمونی که همیشه سبز می‌ماند.
 */
function ruleBodies(selector) {
  // مرزِ آغاز لازم است: جست‌وجوی سادهٔ رشته، `.pb-skin .card` را هم
  // «`.card`» می‌خواند و آخرین تعریفِ `.card` را همان می‌گیرد — قاعده‌ای
  // که به‌عمد پوستهٔ خودش را دارد و ربطی به این ادعا ندارد.
  const out = [];
  const pattern = new RegExp(`(^|[},])\\s*${selector.replace(/[.[\]()*+?^$|\\]/g, '\\$&')}\\s*\\{`, 'g');
  for (const match of noComments.matchAll(pattern)) {
    const open = noComments.indexOf('{', match.index);
    out.push(noComments.slice(open + 1, noComments.indexOf('}', open)));
  }
  return out;
}

/** آخرین تعریف — همان که در آبشار غالب می‌شود. */
const ruleBody = (selector) => ruleBodies(selector).pop() || null;


group('۲۱۹-الف. زمینه و پوسته از یک عنصر خوانده می‌شوند');
{
  // ریشهٔ اشکال ۱: هر توکنی که در `body[data-theme]` بازتعریف می‌شود، فقط
  // روی `body` و پایین‌ترش معنی دارد. مصرفش روی `html` یعنی پوستهٔ تیره
  // بی‌صدا نادیده گرفته می‌شود.
  const themed = ruleBody('body[data-theme="board"]') || '';
  const themedTokens = [...themed.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
  check('پوستهٔ تیره دست‌کم زمینه، سطح و لکه‌های نور را بازتعریف می‌کند',
    ['--ground', '--glass', '--ambient-1'].every((token) => themedTokens.includes(token)),
    themedTokens.length ? `${themedTokens.length} توکن` : 'بلوک پوسته پیدا نشد');

  const htmlRules = [...noComments.matchAll(/(^|\})\s*html\s*\{([^}]*)\}/g)].map((m) => m[2]);
  const themedOnHtml = htmlRules.filter((body) => themedTokens
    .some((token) => body.includes(`var(${token})`)));
  check('هیچ قاعدهٔ html توکنی را که فقط روی body تعریف شده مصرف نمی‌کند',
    themedOnHtml.length === 0,
    themedOnHtml.join(' | ').slice(0, 120));

  const bodyRules = [...noComments.matchAll(/(^|\})\s*body\s*\{([^}]*)\}/g)].map((m) => m[2]);
  check('زمینه و لکه‌های نور هر دو روی body می‌نشینند',
    bodyRules.some((body) => /background-color:\s*var\(--ground\)/.test(body))
    && bodyRules.some((body) => /var\(--ambient-1\)/.test(body)));

  // شبه‌عنصرِ منفی پشتِ زمینهٔ والدش می‌نشیند و همان، نسخهٔ اول را
  // نامرئی کرد. لایه‌بندی روی خودِ عنصر این دام را ندارد.
  check('نورِ محیط با شبه‌عنصرِ z-index منفی ساخته نمی‌شود',
    !/body::before/.test(noComments));
}


group('۲۱۹-ب. نورِ کارت به متن نمی‌رسد');
{
  // ریشهٔ اشکال ۲: واحدِ درصدی روی کارتی که ارتفاعش را محتوا تعیین می‌کند،
  // یعنی طولِ نوارِ نور با بلندیِ کارت رشد می‌کند و روی متن می‌افتد.
  // آخرین `.card`، چون پوستهٔ شیشه‌ای لایه‌ای روی قاعدهٔ پایه است.
  const card = ruleBody('.card') || '';
  // الگو عمداً `[^)]` ندارد: خودِ شیب `color-mix(...)` تودرتو دارد و هر
  // الگویی که به پرانتز تکیه کند، پیش از رسیدن به نقطهٔ توقف می‌ایستد.
  const sheen = card.match(/transparent\s+([0-9.]+)(px|%)\s*\)/);
  check('نوارِ نورِ کارت با واحد ثابت تمام می‌شود، نه با درصد',
    /linear-gradient/.test(card) && !!sheen && sheen[2] === 'px',
    sheen ? `${sheen[1]}${sheen[2]}` : 'نقطهٔ توقفِ شیب پیدا نشد');
  check('و کوتاه‌تر از آن است که به نخستین ردیف متن برسد',
    !!sheen && Number(sheen[1]) <= 96, sheen ? `${sheen[1]}px` : '');
}


group('۲۱۹-ج. `hidden` واقعاً مخفی می‌کند');
{
  // ریشهٔ اشکال ۳: هر جزئی که `display` می‌گذارد، `hidden` را می‌شکند.
  check('قاعدهٔ سراسری `hidden` هست و بر `display` اجزا غالب است',
    /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(noComments));
}


group('۲۱۹-د. شیشه، پشتیبان دارد');
{
  // سه محیطی که `backdrop-filter` در آن‌ها یا کار نمی‌کند یا نباید کار
  // کند. بی پشتیبان، سطحِ نیمه‌شفاف روی هر چیزی که پشتش باشد می‌افتد —
  // یعنی متن روی متن.
  check('برای مرورگر بدون backdrop-filter، سطح‌ها پر می‌شوند',
    /@supports not \(\(backdrop-filter/.test(noComments));
  check('برای «حرکت کمتر»، تاری برداشته می‌شود',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,600}backdrop-filter:\s*none/.test(noComments));
  check('و در چاپ، نه لکهٔ نور می‌ماند نه شیشه',
    /@media print[\s\S]{0,400}background-image:\s*none/.test(noComments));

  // نگهبان ۱۱ همین را برای فلشِ کشویی می‌گیرد؛ این ادعا همان قاعده را از
  // سمتِ پوستهٔ شیشه‌ای هم می‌بندد، چون بلوکِ پشتیبان دقیقاً همان‌جایی بود
  // که میان‌بر `background` نوشته شد و فلش را پاک کرد.
  const fallback = noComments.slice(noComments.indexOf('@supports not ((backdrop-filter'));
  const inputRule = fallback.match(/input\[type="date"\][^{]*\{([^}]*)\}/);
  check('و در همان پشتیبان، ورودی `background-color` می‌گیرد نه `background`',
    !!inputRule && /background-color:/.test(inputRule[1]) && !/(^|;)\s*background\s*:/.test(inputRule[1]),
    inputRule ? inputRule[1].trim() : 'قاعدهٔ ورودی پیدا نشد');
}


group('۲۱۹-ه. زبانِ شکلی از توکن می‌آید');
{
  const root = ruleBody(':root') || '';
  for (const token of ['--glass', '--glass-2', '--glass-edge', '--glass-sheen',
    '--glass-blur', '--ambient-1', '--ambient-2', '--ambient-3', '--glow-accent']) {
    check(`توکن ${token} در پوستهٔ روشن تعریف شده`, root.includes(`${token}:`));
  }
  // گردی هم توکن است: پوستهٔ شیشه‌ای بدون گردیِ کافی «شیشهٔ شکسته» است.
  // این ادعا جغجغه است — کوچک‌شدنش خطای آزمون می‌دهد نه یک تصمیم بی‌صدا.
  const radius = Number(root.match(/--radius-lg:\s*([0-9.]+)px/)?.[1]);
  check('گردی کارت دست‌کم ۱۶ پیکسل است', radius >= 16, `${radius}px`);
}
