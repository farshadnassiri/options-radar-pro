// ۲۱۴. شناسهٔ گردشده — تشخیص و ترمیم
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// ═══ باگی که این دسته را ساخت ═══
//
// صاحب پروژه دید که برنامه برای ضهرم۶۰۵۱ می‌نویسد «معامله نشده»، در حالی
// که خودش از بالادست داده می‌گیرد. برگِ «منبع داده» علتش را لو داد:
//
//     کد واقعی   58199962935089492
//     در برنامه  58199962935089490    ← رقم آخر
//
// `core/json-safe.mjs` برای همین ساخته شده بود و **به مسیر ورودی دفتر
// وصل نشده بود**: `rosterRow` از `String()` استفاده می‌کرد، و
// `String(<عددِ گردشده>)` رشته‌ای می‌دهد که از هر اعتبارسنجی‌ای رد می‌شود
// چون هفده رقمِ سالم به‌نظر می‌آید.
//
// نشانی ساخته‌شده به هیچ ابزاری نمی‌خورد، پس پاسخ خالی برمی‌گشت و فایل
// می‌نوشت «معامله نشده» — بدترین شکل ممکن برای خطا، چون شبیه واقعیتِ
// بازار است و کاربر دنبال علتِ اشتباه می‌گردد.

import { check, group, readSrc } from '../harness.mjs';
import {
  blockingTwins, mergeRoster, repairRoster, rosterIntake, rosterRow,
  roundedTwins, suspectIds,
} from '../../core/option-roster.mjs';
import { readSource } from '../../tools/roster-import.mjs';

// همان ردیف‌های واقعیِ فایل دو سالهٔ صاحب پروژه.
const NAME = 'اختیارخ اهرم-74000-1405/06/25';
const SPEC = {
  Strike: 74000, ExpiryJalali: '1405/06/25',
  FirstSeenGregorian: '2026-06-18', LastSeenGregorian: '2026-08-29',
};
const RIGHT = '58199962935089492';
const WRONG = '58199962935089490';


group('۲۱۴-الف. عددِ ناامن رشتهٔ گردشده نمی‌سازد');
{
  check('مقدمهٔ باگ: این کد از مرز امنِ عددی رد می‌شود و گرد می‌شود',
    !Number.isSafeInteger(Number(RIGHT)) && String(Number(RIGHT)) === WRONG,
    `${RIGHT} → ${Number(RIGHT)}`);

  const raw = { ...SPEC, InsCode: RIGHT, Symbol: 'ضهرم6051', Name: NAME };
  check('کدِ رشته‌ای، دست‌نخورده وارد می‌شود',
    rosterRow(raw)?.ins === RIGHT, String(rosterRow(raw)?.ins));
  check('و همان کد به‌شکل عدد، **رد** می‌شود — نه اینکه گردشده ذخیره شود',
    rosterRow({ ...raw, InsCode: Number(RIGHT) }) === null,
    String(rosterRow({ ...raw, InsCode: Number(RIGHT) })?.ins));
  check('عددِ کوچک که گرد نمی‌شود، همچنان پذیرفته است',
    rosterRow({ ...raw, InsCode: 123456 })?.ins === '123456');
  check('عددِ اعشاری هم رد می‌شود',
    rosterRow({ ...raw, InsCode: 1.5 }) === null);

  // ورودی رشته‌ایِ گردشده قابل تشخیص نیست و باید بپذیرد — تشخیصش کارِ
  // `roundedTwins` است که منبعِ درست را هم دارد.
  check('کدِ گردشده اگر رشته باشد پذیرفته می‌شود؛ تشخیصش بی‌منبعِ درست ممکن نیست',
    rosterRow({ ...raw, InsCode: WRONG })?.ins === WRONG);
}


group('۲۱۴-ب. دوقلوی گردشده، با منبعِ درست اثبات می‌شود');
{
  const truth = rosterIntake([
    { ...SPEC, InsCode: RIGHT, Symbol: 'ضهرم6051', Name: NAME },
    { ...SPEC, InsCode: '9822326813811432', Symbol: 'طهرم6051', Name: 'اختیارف اهرم-74000-1405/06/25' },
  ]).rows;
  check('چیدمان درست است: دو قرارداد خوانده شد',
    truth.length === 2, `${truth.length}`);

  const poisoned = truth.map((row) => ({ ...row, ins: String(Number(row.ins)) }));
  check('و مسمومش فقط یکی را خراب می‌کند — دومی گرد نمی‌شود',
    poisoned.length === 2 && poisoned[0].ins === WRONG
    && poisoned[1].ins === truth[1]?.ins,
    poisoned.map((row) => row.ins).join('، '));

  const twins = roundedTwins(poisoned, truth);
  check('دوقلو پیدا می‌شود، با کدِ غلط و کدِ درست',
    twins.length === 1 && twins[0].wrong === WRONG && twins[0].right === RIGHT,
    JSON.stringify(twins));

  // شرطِ «نماد یکی» عمدی است.
  check('کدِ هم‌ممیز ولی با نمادِ دیگر، دوقلو شمرده نمی‌شود',
    roundedTwins([{ ins: WRONG, symbol: 'چیز دیگری' }], truth).length === 0);
  // ── چرا شرطِ «بالای مرز امن» لازم است ────────────────────────────
  //
  // زیر مرز امن، هر عدد دقیق است، پس دو کدِ متفاوت هرگز به یک ممیز
  // نمی‌رسند — مگر با صفرِ پیشوند: `'0123456'` و `'123456'` هر دو
  // `123456` می‌شوند و رشته‌شان فرق دارد. بی این شرط، آن دو «دوقلوی
  // گردشده» شمرده می‌شدند و ترمیم کدِ سالم را عوض می‌کرد.
  check('صفرِ پیشوند، دوقلوی دروغین نمی‌سازد',
    roundedTwins([{ ins: '0123456', symbol: 'ضهرم6051' }],
      [{ ins: '123456', symbol: 'ضهرم6051' }]).length === 0,
    JSON.stringify(roundedTwins([{ ins: '0123456', symbol: 'ضهرم6051' }],
      [{ ins: '123456', symbol: 'ضهرم6051' }])));
  check('و دو کدِ متفاوتِ زیر مرز امن هم دوقلو نیستند',
    roundedTwins([{ ins: '123456', symbol: 'ضهرم6051' }],
      [{ ins: '123457', symbol: 'ضهرم6051' }]).length === 0);
  check('کدِ درست، دوقلوی خودش نیست',
    roundedTwins(truth, truth).length === 0);

  const fixed = repairRoster(poisoned, truth);
  check('ترمیم کدِ غلط را با درست عوض می‌کند',
    fixed.fixed === 1 && fixed.rows[0].ins === RIGHT, String(fixed.rows[0].ins));
  check('و ردیف تازه‌ای نمی‌سازد — شمار ردیف‌ها ثابت می‌ماند',
    fixed.rows.length === poisoned.length);
  check('بقیهٔ میدان‌های ردیف دست‌نخورده می‌مانند',
    fixed.rows[0].symbol === poisoned[0].symbol && fixed.rows[0].strike === poisoned[0].strike);
  check('دفترِ سالم با ترمیم عوض نمی‌شود',
    repairRoster(truth, truth).fixed === 0 && repairRoster(truth, truth).rows === truth);
}


group('۲۱۴-ج. ظن، از اثبات جدا می‌ماند');
{
  // بی منبعِ درست نمی‌شود گفت کدام کد گرد شده — فقط می‌شود گفت کدام
  // **می‌توانست** باشد. این عدد گزارش می‌شود و هیچ ردیفی با آن حذف
  // نمی‌شود.
  check('کدِ بزرگ‌ترِ بی‌تغییر از Number، مشکوک شمرده می‌شود',
    suspectIds([{ ins: WRONG }]) === 1);
  check('کدِ زیر مرز امن هرگز مشکوک نیست',
    suspectIds([{ ins: '123' }, { ins: '9007199254740991' }]) === 0);
  check('و کدِ درستِ بزرگ که با Number نمی‌خواند، مشکوک نیست',
    suspectIds([{ ins: RIGHT }]) === 0);

  // ── مثبتِ کاذب، ویژگیِ اعلام‌شدهٔ این تابع است ──────────────────────
  //
  // کدِ ۹۸۲۲۳۲۶۸۱۳۸۱۱۴۳۲ (طهرم۶۰۵۱) بالای مرز امن است و **تصادفاً** دقیقاً
  // روی یکی از نقطه‌های نمایش‌پذیر ممیز شناور نشسته. پس بی‌تغییر از
  // `Number` رد می‌شود و مشکوک شمرده می‌شود — در حالی که کاملاً سالم است.
  //
  // در فایل دو سالهٔ صاحب پروژه ۶۹۴۴ کد مشکوک شمرده می‌شوند ولی فقط ۵۴۹۱
  // تای‌شان واقعاً گردشده‌اند. به همین دلیل این عدد فقط **گزارش** می‌شود و
  // هیچ ردیفی با آن حذف یا عوض نمی‌شود؛ عوض کردن فقط با منبعِ درست و
  // اثباتِ `roundedTwins` انجام می‌شود.
  const HEALTHY = '9822326813811432';
  check('کدِ سالمِ بالای مرز امن هم می‌تواند مشکوک شمرده شود — مثبتِ کاذب',
    suspectIds([{ ins: HEALTHY }]) === 1 && String(Number(HEALTHY)) === HEALTHY,
    HEALTHY);
  check('ولی چون منبعِ درست همان کد را دارد، دوقلو شمرده نمی‌شود و دست نمی‌خورد',
    roundedTwins([{ ins: HEALTHY, symbol: 'طهرم6051' }],
      [{ ins: HEALTHY, symbol: 'طهرم6051' }]).length === 0);
}


group('۲۱۴-د. مسیرِ ترمیم در ابزار');
{
  const src = readSrc('../tools/roster-import.mjs');
  check('`--repair` در ابزار وارد کردن هست',
    src.includes("const repair = args.includes('--repair');"));
  check('و در راهنمای کاربردش نوشته شده',
    src.includes('[--repair]'));
  check('ترمیم پیش از ادغام اجرا می‌شود — وگرنه کدِ درست و گردشده دو ردیف می‌مانند',
    src.indexOf('repairRoster(oldRows') < src.indexOf('mergeRoster(oldRows'));
  check('شمار مشکوک‌ها گزارش می‌شود ولی دست نمی‌خورد',
    src.includes('suspectIds(oldRows)') && src.includes('دست نخوردند'));
  check('و ترمیمِ تنها، ردیف تازه اضافه نمی‌کند',
    src.includes('فقط ترمیم — هیچ ردیف تازه‌ای اضافه نشد'));

  // ── پروندهٔ نبوده، جمله می‌گیرد نه ردِ پشته ────────────────────────
  //
  // صاحب پروژه دستور را با نامِ ساده اجرا کرد و چهارده خط ردِ پشتهٔ Node
  // گرفت که هیچ‌کدامشان نمی‌گفتند چه باید بکند.
  let thrown = null;
  try { readSource('/hich/joori/nist.xlsx'); } catch (e) { thrown = e; }
  check('پروندهٔ نبوده، خطای خوانا می‌دهد نه ردِ پشتهٔ خام',
    thrown?.friendly === true && thrown.message.includes('پیدا نشد'),
    String(thrown?.message).split('\n')[0]);
  check('و مسیرِ مطلق را می‌گوید — در WSL «کنارِ من» و «در ویندوز» یکی به‌نظر می‌آیند',
    thrown.message.includes('/hich/joori/nist.xlsx') && thrown.message.includes('دنبالش گشتم در'));
  check('راهِ پیدا کردنش را هم می‌دهد، نه فقط اینکه نیست',
    thrown.message.includes('/mnt/c/Users'));
  check('و فقط خطای شناخته‌شده جمله می‌شود؛ بقیه ردِ پشته می‌گیرند',
    src.includes('if (e?.friendly)') && src.includes('throw e;'));

  // ── ادغامِ بی‌ترمیم باید متوقف شود ──────────────────────────────────
  //
  // صاحب پروژه `--repair` را روی نسخهٔ قدیمی اجرا کرد؛ پرچم شناخته نشد و
  // ادغام سراغ کارش رفت. کلیدِ ادغام خودِ کد است، پس کدِ گردشده و کدِ
  // درست دو ردیف جدا ماندند: ۸۸۳۰ + ۷۹۳۳ → ۱۴۱۹۴، یعنی ۵۳۶۴ قرارداد
  // تکراری. و هیچ‌چیز هشدار نداد.
  check('ابزار قاعدهٔ هسته را صدا می‌زند، نه شرطِ خودش را',
    src.includes('blockingTwins(oldRows, intake.rows, { repair })')
    && src.includes('process.exit(2)'));
  check('و می‌گوید چرا، با نمونه، پیش از آنکه چیزی بنویسد',
    src.includes('ردیف تکراری می‌سازد') && src.includes('دفتر دست‌نخورده ماند'));
  check('کنترل پیش از هر نوشتنی است، نه بعدش',
    src.indexOf('process.exit(2)') < src.indexOf('fs.writeFileSync(ROSTER_FILE'));
}


// ═══════════ ۲۱۴-ه. عددها، روی همان چیدمانی که خراب شد ═══════════
group('۲۱۴-ه. ادغام با ترمیم و بی ترمیم');
{
  const mk = (n) => ({
    ...SPEC, InsCode: n, Symbol: `ضهرم${String(n).slice(-4)}`,
    Name: `اختیارخ اهرم-74000-1405/06/25`,
  });
  // سه کدِ بالای مرز امن که گرد می‌شوند، به‌علاوهٔ یکی که نمی‌شود.
  const truth = rosterIntake([
    mk('58199962935089492'), mk('58199962935089493'), mk('58199962935089494'),
    mk('9007199254740991'),
  ]).rows;
  const poisoned = truth.map((row) => ({ ...row, ins: String(Number(row.ins)) }));

  check('چیدمان: چهار قرارداد، سه‌تایشان در دفتر گرد شده‌اند',
    truth.length === 4 && roundedTwins(poisoned, truth).length === 3,
    `${roundedTwins(poisoned, truth).length}`);

  // بی ترمیم: کدِ گردشده و کدِ درست دو کلیدِ متفاوت‌اند.
  const naive = mergeRoster(poisoned, truth);
  check('ادغامِ بی‌ترمیم، به‌جای تعمیر، ردیف تکراری می‌سازد',
    naive.length > truth.length, `${truth.length} → ${naive.length}`);

  // با ترمیم: همان شمار ردیف می‌ماند.
  const healed = mergeRoster(repairRoster(poisoned, truth).rows, truth);
  check('با ترمیم، شمار ردیف همان می‌ماند و هیچ تکراری نمی‌ماند',
    healed.length === truth.length, `${healed.length}`);
  check('و هر کدِ دفتر با کدِ مرجع می‌خواند',
    healed.every((row) => truth.some((t) => t.ins === row.ins)));

  // ── قاعدهٔ توقف، با رفتار سنجیده می‌شود نه با متن ────────────────────
  //
  // نسخهٔ اولِ این نگهبان یک `if` داخل ابزار بود و ادعایش متنِ منبع را
  // می‌خواند. جهش‌سنجی نشان داد با عوض کردن شرط به `false` نگهبان خاموش
  // می‌شد و هیچ ادعایی قرمز نمی‌شد — «هست» را می‌سنجید، نه «کار می‌کند».
  check('بی ترمیم، ادغام متوقف می‌شود و دوقلوها نام برده می‌شوند',
    blockingTwins(poisoned, truth).length === 3,
    `${blockingTwins(poisoned, truth).length}`);
  check('با ترمیم، هیچ‌چیز جلوی ادغام را نمی‌گیرد',
    blockingTwins(poisoned, truth, { repair: true }).length === 0);
  check('و دفترِ سالم هرگز متوقف نمی‌شود، با ترمیم یا بی آن',
    blockingTwins(truth, truth).length === 0
    && blockingTwins(truth, truth, { repair: true }).length === 0);
}
