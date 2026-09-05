// ۲۳۱. سلولِ نگاره‌دار — نگاره‌ای که متن را نبلعد
//
// ═══ گزارشی که این دسته جوابش است ═══
//
// «در قسمت‌هایی که نمودار به جدول اضافه کردی جدول قابل خوندن نیست و به
// هم ریختگی ایجاد شده.»
//
// سه علتِ جدا داشت و هر سه در بازپخشِ مرورگر دیده شدند:
//
//   ۱ فونت    `--mono` با «JetBrains Mono» شروع می‌شد؛ آن فونت حرف فارسی
//             ندارد و مرورگر برای هر حرفِ نداشته به فونت بعدی می‌افتد.
//             پیوندِ خط فارسی می‌شکست: «باقی‌مانده» می‌شد «با قیما نده».
//             (ادعایش در دستهٔ ۲۱۹ است، کنارِ بقیهٔ پوسته.)
//   ۲ برش     عددِ نوارها **داخلِ** ناحیه‌ای بود که `overflow: hidden`
//             داشت و عرضش از خودِ درصد می‌آمد. نوارِ کوتاه، عددش را
//             می‌برید: «۱۲٫۰۰٪» روی صفحه «۰۰…» دیده می‌شد.
//   ۳ ارتفاع  مجازی‌سازی ارتفاع ردیف را از یک عددِ دستی می‌گرفت (۵۲)، در
//             حالی که ردیفِ واقعی ۷۷ پیکسل بود. فاصله‌گذارها کوتاه‌تر از
//             واقعیت بودند، پس نوار پیمایش دروغ می‌گفت و ته جدول به آخر
//             نمی‌رسید.
//
// این دسته دو و سه را قفل می‌کند.

import { check, group, readSrc } from '../harness.mjs';
import { fillBar } from '../../ui/gap-charts.mjs';
import { rowHeightFrom } from '../../ui/table.mjs';

/**
 * آیا `needle` داخلِ عنصرِ `<tag>` است؟
 *
 * برچسبِ باز عمداً کامل نوشته می‌شود (`<s>` نه `<s`): جست‌وجوی ناقص،
 * `<span>` را هم «`<s`» می‌خواند و ادعا را روی عنصرِ اشتباه می‌سنجد.
 */
function insideTag(html, tag, needle) {
  const open = html.indexOf(`<${tag}>`);
  if (open < 0) return false;
  const close = html.indexOf(`</${tag}>`, open);
  if (close < 0) return false;
  return html.slice(open, close).includes(needle);
}

group('۲۳۱-الف. عددِ نوار، بیرونِ ناحیهٔ بریده‌شونده است');
{
  const gap = {
    ok: true, anchored: true, coveragePct: 20, roomPct: 80,
    anchorLabel: 'دهانهٔ اعمال', coverageLabel: 'پر شده', roomLabel: 'باقی‌مانده',
  };
  const html = fillBar(gap);
  // نوار خودش `<s>` است و درصدِ پرشدگی داخلش. عدد در `<span>`ِ بالاست.
  check('درصد در سرِ سلول می‌آید، نه داخلِ نوار',
    html.includes('gap-bar-head') && !insideTag(html, 's', 'gap-bar-head'));
  check('و نوار فقط یک شکل است: هیچ متنی داخلش نیست',
    /<s><i style="--fill:[0-9.]+%"><\/i><\/s>/.test(html));
  check('هر دو عدد — پر شده و باقی‌مانده — هنوز دیده می‌شوند',
    html.includes('۲۰٫۰۰٪') && html.includes('۸۰٫۰۰٪') && html.includes('باقی‌مانده'));
  // جملهٔ کامل در `title` می‌ماند، برای وقتی که ستون تنگ است و متن کوتاه شود.
  check('جملهٔ کامل در title می‌ماند، تا کوتاه‌شدنِ متن چیزی را پنهان نکند',
    /title="[^"]*پر شده[^"]*باقی‌مانده/.test(html));
  // گذشتن از لنگر، «باقی‌ماندهٔ منفی» نمی‌سازد.
  check('از لنگر که گذشته باشد، به‌جای درصدِ منفی همان را می‌گوید',
    fillBar({ ...gap, coveragePct: 140, roomPct: -40 }).includes('گذشته'));
  // ردیفِ بی‌فاصله، جعبهٔ خالیِ بی‌معنی نمی‌سازد.
  check('ردیفی که فاصله ندارد، علتش را می‌نویسد نه نوارِ صفر',
    fillBar({ ok: false, why: 'قیمت ندارد' }).includes('قیمت ندارد'));
}

group('۲۳۱-ب. همان قاعده در سلولِ سود در برابر زیان');
{
  const src = readSrc('../ui/radar-columns.mjs');
  // ساختِ HTML اینجا به `esc` و `fmt` بسته است و در نود بی DOM هم اجرا
  // می‌شود، ولی ادعای مهم ساختاری است: `<b>` خواهرِ `<s>` باشد نه فرزندش.
  check('عدد، خواهرِ نوار است نه فرزندِ آن',
    /<s><i style="--w:\$\{w\(value, word\)\}%"><\/i><\/s><b>/.test(src));
  check('و هر سطر یک شبکهٔ دوستونی است: نوار کشسان، عدد با عرضِ خودش',
    readSrc('../ui/style.css').includes('grid-template-columns: 1fr max-content;'));
  const css = readSrc('../ui/style.css');
  // `overflow: hidden` فقط روی خودِ نوار مجاز است، نه روی چیزی که عدد دارد.
  const riskBlock = css.slice(css.indexOf('.rad-risk {'), css.indexOf('.gap-skin .gap-grid'));
  check('برش فقط روی نوار است، نه روی سطری که عدد دارد',
    /\.rad-risk-row > s \{[^}]*overflow: hidden/.test(riskBlock)
    && !/\.rad-risk-row \{[^}]*overflow: hidden/.test(riskBlock));
}

group('۲۳۱-ج. ارتفاع ردیف اندازه گرفته می‌شود، فرض نمی‌شود');
{
  // ردیفِ رادار ۷۷ پیکسل بود و عددِ دستی ۵۲. هر فاصله‌گذار ۲۵ پیکسل کم
  // می‌گذاشت و با صد ردیف، ته جدول ۲٬۵۰۰ پیکسل جلوتر از جایی بود که نوار
  // پیمایش نشان می‌داد.
  check('اختلافِ واقعی، ارتفاع مبنا را عوض می‌کند',
    rowHeightFrom(52, 76.59375) === 76.59375);
  // آستانه لازم است: `getBoundingClientRect` کسری است و در بزرگ‌نمایی
  // می‌لرزد؛ بی آستانه هر رسم یک رسمِ دیگر می‌ساخت.
  check('لرزشِ زیر یک پیکسل، رسمِ دوباره نمی‌سازد',
    rowHeightFrom(52, 52.4) === 52 && rowHeightFrom(52, 51.6) === 52);
  check('اندازهٔ نامعتبر، ارتفاع را خراب نمی‌کند',
    rowHeightFrom(52, 0) === 52 && rowHeightFrom(52, NaN) === 52
    && rowHeightFrom(52, -8) === 52);

  const src = readSrc('../ui/table.mjs');
  check('و جدول واقعاً بعد از هر رسم اندازه می‌گیرد',
    src.includes('remeasure();') && src.includes('rowHeightFrom(rowH,'));
  check('حلقهٔ بی‌پایان بسته است: رسمِ دومِ اندازه‌گیری، رسمِ سوم نمی‌سازد',
    src.includes('if (remeasuring || !view.length) return;') && src.includes('remeasuring = true;'));
  // `DEFAULT_ROW_H` می‌ماند و باید بماند: نقطهٔ شروعِ حدس است، نه ثابتی
  // که تا آخر روی آن حساب شود. آنچه نباید بماند، ثابتِ غیرقابل‌تغییر است.
  check('هیچ ارتفاعِ ثابتِ غیرقابل‌تغییری نمانده',
    !/const ROW_H\b/.test(src) && /let rowH =/.test(src));
}
