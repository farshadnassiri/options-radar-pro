// ۲۳۵. قیمت دستی — فرضِ کاربر، نه دادهٔ بازار
//
// ═══ خواسته‌ای که این دسته جوابش است (بندِ ۱) ═══
//
// «بر اساس … حالتهای مختلف (دفتر سفارش، آخرین، پایانی، **دستی** و …)».
//
// ═══ چرا روی ردیف، نه روی جدول ═══
//
// مبنای قیمت روی **کلِ جدول** می‌نشیند و کسی نمی‌تواند برای چند صد
// قرارداد قیمت تایپ کند. قیمت دستی ذاتاً برای یک ترکیب معنی دارد. پس
// این یک «اگر… چه می‌شود» روی ردیفِ انتخاب‌شده است، نه یک مبنای تازه در
// `priceBasis`.
//
// ═══ آنچه سنجیده می‌شود ═══
//
// مرز، نه محاسبه: عددِ دستی جای عددِ بازار را نمی‌گیرد، ادعای اجرا
// نمی‌سازد، و «نگذاشتن» با «صفر» یکی نیست.

import { check, group } from '../harness.mjs';
import { manualCompare, manualLegs, manualNote, manualPrice } from '../../core/manual-price.mjs';

const legs = [
  { kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 20000, price: 800, name: 'ضهرم۱' },
  { kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 22000, price: 300, name: 'ضهرم۲' },
];

group('۲۳۵ قیمت دستی — «نگذاشتن» با «صفر» یکی نیست');

check('عدد مثبت، قیمت است', manualPrice(600) === 600 && manualPrice('600') === 600);
// همان تلهٔ `Number('')` که در فیلترها بسته شد: کادرِ خالی صفر نیست.
check('کادر خالی قیمت نیست', manualPrice('') === null && manualPrice('   ') === null);
check('صفر و منفی قیمت نیستند', manualPrice(0) === null && manualPrice(-5) === null);
check('نامعتبر هم قیمت نیست',
  manualPrice('abc') === null && manualPrice(null) === null && manualPrice(undefined) === null
  && manualPrice(Infinity) === null);

group('۲۳۵ قیمت دستی — جایگزینی پا');

const one = manualLegs(legs, { 0: 600 });
check('فقط پایی که قیمت گرفته عوض می‌شود', one.legs[0].price === 600 && one.legs[1].price === 300);
check('و کدام پا عوض شد، با قیمتِ قبل و بعدش ثبت می‌شود',
  one.changed.length === 1 && one.changed[0].index === 0
  && one.changed[0].from === 800 && one.changed[0].to === 600);
check('ورودی دست‌نخورده می‌ماند', legs[0].price === 800);
check('کلید رشته‌ای هم کار می‌کند — فرم HTML اندیس را رشته می‌دهد',
  manualLegs(legs, { '1': 250 }).changed[0].index === 1);
check('قیمتِ نامعتبر، پا را دست‌نخورده می‌گذارد نه صفر',
  manualLegs(legs, { 0: 0, 1: '' }).changed.length === 0
  && manualLegs(legs, { 0: 0 }).legs[0].price === 800);

group('۲۳۵ قیمت دستی — مقایسه، نه جایگزینی');

const cmp = manualCompare(legs, { 0: 600 });
// خرید منفی است: −۸۰۰×۱۰۰۰ + ۳۰۰×۱۰۰۰ = −۵۰۰٬۰۰۰ · با ۶۰۰ می‌شود −۳۰۰٬۰۰۰
check('ستونِ بازار دست نمی‌خورد', cmp.base.netCash === -500000);
check('و ستونِ فرض، با قیمتِ تو حساب می‌شود', cmp.manual.netCash === -300000);
check('تفاوت جدا گزارش می‌شود', cmp.netCashDelta === 200000);
// ارزان‌تر خریدن، سربه‌سری را پایین می‌آورد. اگر این عوض نشود یعنی
// `analyzePayoff` با نقدِ تازه صدا زده نشده.
check('سربه‌سری هم با قیمتِ تازه از نو درمی‌آید',
  cmp.base.breakevens[0] === 20500 && cmp.manual.breakevens[0] === 20300);
check('بیشترین سود با ورودِ ارزان‌تر بیشتر می‌شود',
  cmp.manual.maxProfit > cmp.base.maxProfit
  && cmp.manual.maxProfit - cmp.base.maxProfit === 200000);
check('و بیشترین زیان کمتر', Math.abs(cmp.manual.maxLoss) < Math.abs(cmp.base.maxLoss));

// ═══ بی هیچ قیمتِ دستی، تفاوتی ساخته نمی‌شود ═══
//
// اگر دو ستون بی‌دلیل فرق می‌کردند، کاربر عددی می‌دید که نگذاشته بود.
const none = manualCompare(legs, {});
check('بی هیچ قیمتِ دستی، دو ستون یکی‌اند',
  none.anyManual === false && none.manual.netCash === none.base.netCash
  && none.netCashDelta === 0);
check('و کادرهای خالی هم همان است',
  manualCompare(legs, { 0: '', 1: null }).anyManual === false);

// ═══ ادعای اجرا، هرگز ═══
check('نتیجهٔ دستی هیچ‌وقت «قابل اجرا» نیست', cmp.executable === false && none.executable === false);
check('و جمله‌اش همین را می‌گوید',
  manualNote(cmp).includes('ادعای اجرا ندارد') && manualNote(cmp).includes('هیچ دفتری'));
check('جملهٔ حالتِ دست‌نخورده، راهنماست نه هشدار',
  manualNote(none).includes('دو ستون یکی‌اند'));

// ═══ کارمزد ═══
const fees = manualCompare(legs, { 0: 600 }, { fees: { option: 0.001 } });
// کارمزد روی هر دو ستون می‌نشیند، پس تفاوت هم کارمزدِ کمترِ ورودِ ارزان‌تر
// را در خود دارد: ۲۰۰٬۰۰۰ ناخالص + ۲۰۰ کارمزدِ صرفه‌جویی‌شده
// ((۸۰۰−۶۰۰) × ۱۰۰۰ × ۰٫۰۰۱).
check('کارمزد روی هر دو ستون یکسان اعمال می‌شود، وگرنه تفاوت دروغ می‌شود',
  fees.base.netCash === -501100 && fees.manual.netCash === -300900
  && fees.netCashDelta === 200200);

// ═══ ورودی‌های مرزی ═══
check('پای بی‌قیمت و فهرست خالی، برنامه را نمی‌شکنند',
  manualCompare([], {}).anyManual === false
  && Number.isFinite(manualCompare([{ kind: 'call', side: 'buy', ratio: 1, size: 1, strike: 1, price: 1 }], {}).base.netCash));
