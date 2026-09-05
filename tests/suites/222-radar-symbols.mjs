// ۲۲۲. نام نماد — در جدول، در کشویی، در نمودار، و در اعلان
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «نام نمادها در جدول‌ها و نمودارها بیاید.»
//
// جدول رادار تا پیش از این ترکیب را با «نام استراتژی + قیمت اعمال»
// می‌شناساند. برای تحلیل کافی بود، برای سفارش نه: روی تابلو نمادی به نام
// «ضهرم۵۰» خرید و فروش می‌شود، نه «اسپرد صعودی کال ۵۰٬۰۰۰». همین شکاف
// باعث می‌شد اعلانِ هشدار هم خبری بدهد که نمی‌شد رویش سفارش گذاشت.
//
// این دسته می‌سنجد که نام نماد از خودِ پاها بیاید — نه ساخته شود — و در
// هر چهار جایی که ترکیب نامیده می‌شود ظاهر شود.

import { check, group, readSrc } from '../harness.mjs';
import { comboSymbolText, comboSymbols } from '../../core/spread-gap.mjs';

group('۲۲۲. نام نماد در جدول، کشویی، نمودار و اعلان');

const BULL = [
  { ins: 'c50', kind: 'call', side: 'buy', strike: 50000, size: 1000, ratio: 1, name: 'ضهرم۵۰' },
  { ins: 'c54', kind: 'call', side: 'sell', strike: 54000, size: 1000, ratio: 1, name: 'ضهرم۵۴' },
];

const symbols = comboSymbols(BULL);
check('هر پا یک نماد می‌دهد، با نام و جهتِ خودش',
  symbols.length === 2
  && symbols[0].name === 'ضهرم۵۰' && symbols[0].side === 'buy' && symbols[0].sideLabel === 'خرید'
  && symbols[1].name === 'ضهرم۵۴' && symbols[1].side === 'sell' && symbols[1].sideLabel === 'فروش');

check('متنِ یک‌سطری، جهت و نام هر پا را به ترتیب می‌آورد',
  comboSymbolText(BULL) === 'خرید ضهرم۵۰ · فروش ضهرم۵۴');

// ── پای دارایی پایه، نمادِ سفارش‌پذیرِ ترکیب نیست ───────────────────────
const withUnderlying = [...BULL, { ins: '7', kind: 'underlying', side: 'buy', ratio: 1, name: 'اهرم' }];
check('پای دارایی پایه در فهرست نمادهای ترکیب نمی‌آید',
  comboSymbols(withUnderlying).length === 2
  && !comboSymbolText(withUnderlying).includes('اهرم'));

// ── نسبت، فقط وقتی از یک بیشتر است ────────────────────────────────────
const ratioLegs = [
  { ins: 'c50', kind: 'call', side: 'buy', strike: 50000, ratio: 1, name: 'ضهرم۵۰' },
  { ins: 'c54', kind: 'call', side: 'sell', strike: 54000, ratio: 2, name: 'ضهرم۵۴' },
];
check('نسبتِ بزرگ‌تر از یک نوشته می‌شود و نسبتِ یک، شلوغی نمی‌سازد',
  comboSymbolText(ratioLegs) === 'خرید ضهرم۵۰ · فروش ضهرم۵۴ ×2');

// ── نامِ نداشته، ساخته نمی‌شود ─────────────────────────────────────────
//
// مرزِ همیشگی این مخزن: دادهٔ نداشته «نداشته» می‌ماند. برای نام، صادق‌ترین
// جانشین شناسهٔ خودِ ابزار است — نه نامی که از قیمت اعمال سرِ هم شود.
const nameless = [
  { ins: 'c50', kind: 'call', side: 'buy', strike: 50000, ratio: 1, name: '   ' },
  { ins: 'c54', kind: 'call', side: 'sell', strike: 54000, ratio: 1 },
];
check('نامِ خالی یا نبود، با شناسهٔ ابزار پر می‌شود نه با نامی ساختگی',
  comboSymbolText(nameless) === 'خرید c50 · فروش c54');

check('ترکیب بی‌پا، فهرست خالی می‌دهد و متنش خالی است',
  comboSymbols([]).length === 0 && comboSymbolText([]) === '');

// ── رابط: چهار جایی که ترکیب نامیده می‌شود ────────────────────────────
const src = readSrc('../ui/tabs/spread-radar.mjs');
check('جدول «اکنون» ستون نماد دارد و آن را از پاهای همان ردیف می‌سازد',
  src.includes('<th>نمادها</th>') && src.includes('symbolCell(row.legs)'));
check('کشویی انتخاب ترکیب، نام نماد را در برچسبش دارد',
  /select\.innerHTML[\s\S]{0,260}comboSymbolText\(row\.legs\)/.test(src));
check('شناسنامهٔ بالای نمودارهای تاریخچه، نماد ترکیب و نماد پایه را می‌گوید',
  src.includes("$('gr-ident')") && src.includes('symbolCell(row.legs)')
  && src.includes('نماد پایه ${esc(nameOf(ua))}'));
check('برچسبِ اعلان، نام نماد را حمل می‌کند',
  /label: `\$\{row\.def\.name\} · \$\{comboSymbolText\(row\.legs\)\}/.test(src));

// نام نماد رشتهٔ سفارش است، نه عددِ نمایشی — فارسی‌سازیِ رقمش آن را به
// چیزی تبدیل می‌کند که روی تابلو جست‌وجو نمی‌شود.
check('نام نماد دست‌نخورده نوشته می‌شود، نه با رقم فارسی‌شده',
  !/faDigits\((?:esc\()?leg\.name/.test(src) && src.includes('esc(leg.name)'));

const core = readSrc('../core/spread-gap.mjs');
check('نام نماد در هسته ساخته نمی‌شود؛ فقط از خودِ پا خوانده می‌شود',
  /String\(leg\.name \?\? ''\)\.trim\(\) \|\| String\(leg\.ins\)/.test(core));
