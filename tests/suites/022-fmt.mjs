// ۲۱. قالب‌بندی عدد فارسی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import {
  axisNum, coverageInfo, faAgo, faClock, fmt as uiFmt, humanizeUpstreamError, kpiTone, normFa, pageTitle, signTone, toEnDigits,
} from '../../ui/fmt.mjs';


// ═══════════════════ ۲۱. عدد فارسی، یک‌جا و برگشت‌پذیر ═══════════════════
group('۲۱. قالب‌بندی عدد فارسی');
{
  check('رقم فارسی با جداکننده هزارگان', uiFmt.money(1234567) === '۱٬۲۳۴٬۵۶۷', uiFmt.money(1234567));
  check('منفی با نشانه ریاضی، نه خط تیره', uiFmt.money(-40500000) === '−۴۰٬۵۰۰٬۰۰۰', uiFmt.money(-40500000));
  check('بی‌نهایت نماد خودش را دارد', uiFmt.money(Infinity) === '∞' && uiFmt.money(-Infinity) === '−∞');
  check('ناعدد، خط تیره می‌شود', uiFmt.money(NaN) === '—' && uiFmt.int(undefined) === '—');
  check('اعشار با ممیز فارسی', uiFmt.pct(12.3456) === '۱۲٫۳۵', uiFmt.pct(12.3456));
  check('عدد کوچک، چهار رقم اعشار', uiFmt.num(0.0421) === '۰٫۰۴۲۱', uiFmt.num(0.0421));
  check('عدد بزرگ در num هم گروه‌بندی می‌شود', uiFmt.num(12345) === '۱۲٬۳۴۵', uiFmt.num(12345));
  check('فهرست عددی فارسی می‌شود', uiFmt.list([1000, 2500]) === '۱٬۰۰۰ , ۲٬۵۰۰', uiFmt.list([1000, 2500]));
  check('فهرست خالی، خط تیره', uiFmt.list([]) === '—');

  // منفی خیلی کوچک که به این دقت گرد به صفر می‌شود، نباید «−۰» چاپ کند —
  // به چشم انگار هنوز کمی زیان مانده، در حالی که عدد واقعی صفر است
  check('money(−۰٫۴) → صفر ساده، نه −۰', uiFmt.money(-0.4) === '۰', uiFmt.money(-0.4));
  check('pct(−۰٫۰۰۱) → صفر ساده، نه −۰٫۰۰', uiFmt.pct(-0.001) === '۰٫۰۰', uiFmt.pct(-0.001));
  check('int(−۰٫۲) → صفر ساده، نه −۰', uiFmt.int(-0.2) === '۰', uiFmt.int(-0.2));
  check('num منفی‌ای که واقعاً صفر نمی‌شود، همان منفی می‌ماند',
        uiFmt.num(-0.0001) === '−۰٫۰۰۰۱', uiFmt.num(-0.0001));
  check('منفی معمولی دست‌نخورده می‌ماند', uiFmt.money(-500) === '−۵۰۰' && uiFmt.pct(-1.5) === '−۱٫۵۰');

  // مرز گرد شدن num: شاخه‌بندی (گروه‌بندی‌شده ≥۱۰۰۰، ۴ رقم اعشار زیر ۱)
  // روی v خام تصمیم می‌گرفت؛ عددی که با گرد کردن از آستانه رد می‌شد شاخه
  // غلط را نگه می‌داشت. پ-۶ بک‌لاگ، دور سی‌ونهم.
  check('num که با گرد کردن به ۱۰۰۰ می‌رسد، جداکننده هزارگان می‌گیرد',
        uiFmt.num(999.996) === '۱٬۰۰۰', uiFmt.num(999.996));
  check('num منفی هم همان مرز را درست می‌گیرد',
        uiFmt.num(-999.996) === '−۱٬۰۰۰', uiFmt.num(-999.996));
  check('num که با گرد کردن از زیر ۱ به ۱ می‌رسد، دو رقم اعشار می‌گیرد نه چهار',
        uiFmt.num(0.99996) === '۱٫۰۰', uiFmt.num(0.99996));
  check('num دور از هر مرزی، دست‌نخورده می‌ماند',
        uiFmt.num(999.4) === '۹۹۹٫۴۰' && uiFmt.num(0.0421) === '۰٫۰۴۲۱');

  // هیچ رقم لاتینی نباید از قالب‌بند بیرون بیاید
  const latin = /[0-9]/;
  const samples = [uiFmt.money(-12345.6), uiFmt.pct(-0.5), uiFmt.num(999999), uiFmt.int(7),
                   axisNum(-40500000), axisNum(2.5e9), axisNum(45000), axisNum(120)];
  check('هیچ رقم لاتینی باقی نمی‌ماند', samples.every((s) => !latin.test(s)), samples.join(' | '));

  check('محور: میلیون و میلیارد و هزار', axisNum(2.5e9) === '۲٫۵ میلیارد' && axisNum(45000) === '۴۵ هزار',
        `${axisNum(2.5e9)} و ${axisNum(45000)}`);

  // مرز گرد شدن axisNum: همان دسته باگ دور ۳۹ (fmt.num)، این‌بار در واحد
  // محور نمودار — عددی که با گرد کردن از هزار به میلیون (یا میلیون به
  // میلیارد) رد می‌شود، باید واحد درست را نشان بدهد، نه واحد قبل از گرد شدن.
  check('axisNum که با گرد کردن از هزار به میلیون می‌رسد، واحد م می‌گیرد',
        axisNum(999960) === '۱٫۰ م', axisNum(999960));
  check('axisNum که با گرد کردن از میلیون به میلیارد می‌رسد، واحد میلیارد می‌گیرد',
        axisNum(999996000) === '۱٫۰ میلیارد', axisNum(999996000));
  check('axisNum منفی هم همان مرز را درست می‌گیرد',
        axisNum(-999960) === '−۱٫۰ م', axisNum(-999960));

  // ورودی کاربر ممکن است فارسی تایپ شود؛ باید بی‌کم‌وکاست برگردد
  check('تبدیل برگشتی، عدد قابل تجزیه می‌دهد', Number(toEnDigits('۱٬۲۳۴٫۵۶')) === 1234.56, toEnDigits('۱٬۲۳۴٫۵۶'));
  check('منفی فارسی هم برمی‌گردد', Number(toEnDigits('−۴۲')) === -42, toEnDigits('−۴۲'));
  check('رقم عربی هم پذیرفته می‌شود', Number(toEnDigits('٤٢')) === 42, toEnDigits('٤٢'));
  check('رفت و برگشت، عدد را عوض نمی‌کند',
        Number(toEnDigits(uiFmt.money(-9876543))) === -9876543, uiFmt.money(-9876543));

  // جست‌وجوی متنی (فهرست کناری تب‌ها، انتخابگر نماد): حروف عربی رایج در
  // داده رسمی (ي/ك) باید با معادل فارسی‌شان (ی/ک) یکی حساب شوند، وگرنه
  // کاربری که یکی از دو شکل را تایپ کند، نماد/تبی را که با شکل دیگر
  // نوشته شده پیدا نمی‌کند.
  check('ي عربی با ی فارسی یکی حساب می‌شود', normFa('علي') === normFa('علی'), `${normFa('علي')} vs ${normFa('علی')}`);
  check('ك عربی با ک فارسی یکی حساب می‌شود', normFa('كامل') === normFa('کامل'), `${normFa('كامل')} vs ${normFa('کامل')}`);
  check('نیم‌فاصله به فاصله ساده تبدیل می‌شود', normFa('می‌شود') === 'می شود', normFa('می‌شود'));
  check('فاصله اضافه دو طرف حذف می‌شود', normFa('  متن  ') === 'متن', `"${normFa('  متن  ')}"`);
  check('ورودی خالی/نامعتبر، رشته خالی می‌دهد', normFa(null) === '' && normFa(undefined) === '');

  check('فاصله زمانی خوانا و فارسی', faAgo(4000) === 'همین الان' && faAgo(125000) === '۲ دقیقه پیش',
        faAgo(125000));
  check('فاصله زمانی نامعتبر، خط تیره', faAgo(NaN) === '—' && faAgo(-5) === '—');
  check('ساعت با رقم فارسی و دو رقمی', faClock(new Date(2026, 7, 13, 9, 5, 3)) === '۰۹:۰۵:۰۳',
        faClock(new Date(2026, 7, 13, 9, 5, 3)));

  // برچسب حالت پوشش (خواسته ۵): چهار حالت خام core/margin.mjs باید فارسی
  // شوند و ریسک‌دار از کم‌ریسک با رنگ جدا شود، نه فقط با متن
  const latin2 = /[a-zA-Z]/;
  check('پوشش کامل، فارسی و کم‌ریسک', !latin2.test(coverageInfo('full').label) && coverageInfo('full').tone === 'gain');
  check('پوشش لخت، فارسی و ریسک‌دار', !latin2.test(coverageInfo('naked').label) && coverageInfo('naked').tone === 'loss');
  check('پوشش ناقص، فارسی و هشدار', !latin2.test(coverageInfo('partial').label) && coverageInfo('partial').tone === 'warn');
  check('بدون پای فروش، خنثی', !latin2.test(coverageInfo('none').label) && coverageInfo('none').tone === 'flat');
  check('حالت ناشناس، سقوط نمی‌کند و تن پیش‌فرض می‌دهد', coverageInfo('چیز-عجیب').tone === 'flat');

  // رنگ کارت KPI (تب موقعیت‌های من): «بازده روی سرمایه» همان علامت «سود و
  // زیان جاری» را دارد، پس باید همان رنگ را هم بگیرد — قبلاً فقط برچسبی که
  // شامل «سود» بود رنگ می‌گرفت و بازده بی‌رنگ می‌ماند، برخلاف مرز رنگی کارت
  // (style.css .kpi:has(.v.gain/.loss)) که برای همین قرار بود چشم را ببرد.
  check('کارت سود و زیان، سبز وقتی مثبت است', kpiTone('سود و زیان جاری', true) === 'gain');
  check('کارت سود و زیان، قرمز وقتی منفی است', kpiTone('سود و زیان جاری', false) === 'loss');
  check('کارت بازده روی سرمایه هم رنگ می‌گیرد، نه فقط برچسب سود', kpiTone('بازده روی سرمایه', false) === 'loss');
  check('کارت خنثی (سرمایه درگیر) بی‌رنگ می‌ماند', kpiTone('سرمایه درگیر', true) === '');
  check('کارت خنثی (موقعیت باز) بی‌رنگ می‌ماند', kpiTone('موقعیت باز', false) === '');

  // بدون موقعیت باز، «بازده روی سرمایه» نامعلوم است (تقسیم بر صفر سرمایه)
  // و باید بی‌رنگ بماند — قبلاً isGain=false (falsy از truthy نادرست) آن را
  // قرمز نشان می‌داد، انگار واقعاً زیان است. پ-۶ بک‌لاگ، دور سی‌وهفتم.
  check('isGain=null، حتی برای برچسب سود/بازده، بی‌رنگ می‌ماند',
        kpiTone('سود و زیان جاری', null) === '' && kpiTone('بازده روی سرمایه', null) === '');
  check('isGain=undefined هم همان رفتار null را دارد',
        kpiTone('بازده روی سرمایه', undefined) === '');

  // رنگ کارت KPI از روی علامت خودِ عدد (تب‌های استراتژی/برترین موقعیت‌ها):
  // «بهترین/میانه بازده ماهانه» قبلاً هیچ‌وقت رنگ نمی‌گرفت، حتی اگر بهترین
  // ردیف موجود هم زیان‌ده بود — دقیقاً همان چیزی که دور دهم می‌خواست از
  // اسکن سریع حذف کند.
  check('بازده مثبت، سبز', signTone(12.5) === 'gain');
  check('بازده منفی، قرمز', signTone(-3.2) === 'loss');
  check('صفر هم سبز حساب می‌شود (نه زیان)', signTone(0) === 'gain');
  check('بدون ردیف (NaN)، بی‌رنگ می‌ماند', signTone(NaN) === '');

  // پیام خام سرور (پ-۷ بک‌لاگ): «آخرین خطا» متن خام جاوااسکریپت بود، مثل
  // server/server.mjs:171 `${e.name}: ${e.message}` — کاربر فارسی‌زبان چیزی
  // از آن نمی‌فهمد. humanizeUpstreamError باید علت را فارسی و خوانا بگوید.
  const latin3 = /[a-zA-Z]/;
  check('خطای بی‌پاسخی، فارسی و بدون رقم/حرف لاتین',
        !latin3.test(humanizeUpstreamError('AbortError: The operation was aborted')),
        humanizeUpstreamError('AbortError: The operation was aborted'));
  check('خطای شبکه بالادست، فارسی', !latin3.test(humanizeUpstreamError('TypeError: fetch failed')),
        humanizeUpstreamError('TypeError: fetch failed'));
  check('خطای HTTP بالادست، کد را با رقم فارسی می‌گوید',
        humanizeUpstreamError('Error: HTTP 502').includes('۵۰۲'), humanizeUpstreamError('Error: HTTP 502'));
  check('جیسون خراب، فارسی', !latin3.test(humanizeUpstreamError('SyntaxError: Unexpected token')));
  check('بدون خطا، مقدار خالی می‌دهد', humanizeUpstreamError(null) === null && humanizeUpstreamError('') === null);
  check('خطای ناشناس هم سقوط نمی‌کند و فارسی می‌ماند',
        !latin3.test(humanizeUpstreamError('some odd unmapped message')));

  // عنوان تب مرورگر (پ-۶ بک‌لاگ، دور بیست‌ودوم): قبلاً عنوان همیشه ثابت بود
  // و با هیچ تبی عوض نمی‌شد؛ کاربری که چند تب مرورگر باز دارد نمی‌توانست
  // از روی نوار تب بفهمد کدام‌یک زنجیره اختیار است و کدام موقعیت‌های من.
  check('عنوان تب، نام تب را جلوی برند می‌آورد',
        pageTitle('دیده‌بان زنجیره اختیار') === 'دیده‌بان زنجیره اختیار — رصد استراتژی آپشن',
        pageTitle('دیده‌بان زنجیره اختیار'));
  check('بدون تب باز، فقط برند تنها می‌ماند', pageTitle('') === 'رصد استراتژی آپشن');
  check('بدون تب باز (undefined)، فقط برند تنها می‌ماند', pageTitle() === 'رصد استراتژی آپشن');
}

// پنل شمارنده‌های فنی به درخواست کاربر از رابط حذف شده است. حضور هرکدام از
// شناسه‌ها یا برچسب‌های آن یعنی بخشی از پنل ناخواسته برگشته است.
{
  const indexHtml = readSrc('../ui/index.html');
  const appSource = readSrc('../ui/app.mjs');
  const removedHealthPanel = [
    'health-detail', 'detail-btn', 'درخواست بالادست', 'اصابت کش',
    'تأخیر بالادست', 'سن عکس سرور', 'قطعی اتصال', 'آخرین خطا',
  ];
  check('پنل جزئیات فنی از پوسته رابط حذف مانده',
    removedHealthPanel.every((text) => !indexHtml.includes(text)),
    removedHealthPanel.filter((text) => indexHtml.includes(text)).join('، '));
  check('کد پوسته دیگر به عناصر پنل حذف‌شده دسترسی ندارد',
    !/\b(?:health-detail|detail-btn|d-req|d-cache|d-ms|d-age|d-drops|d-err)\b/.test(appSource));
}
