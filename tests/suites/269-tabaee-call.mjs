// ۲۶۹. اختیار خرید تبعی، کالِ استاندارد نیست
//
// ═══ چرا این دسته لازم شد، با اینکه CI سبز بود ═══
//
// ممیزی صاحب پروژه: «`اختیارخ ت` و نمادهای شروع‌شده با «ظ» هنوز اشتباهاً
// کال استاندارد تشخیص داده می‌شوند.» نتیجه‌اش در اجرای واقعی: فباهنر با
// ۱ کال و صفر پوت، فخوز با ۱ کال و صفر پوت، و ۶۶ «سریِ تک‌سمت» که هیچ‌کدام
// سریِ ناقص نبودند — تبعی بودند.
//
// و مهم‌تر: هفت‌هزار آزمونِ سبز این را نگرفتند، چون هیچ‌کدام **سمتِ**
// قرارداد را نمی‌سنجیدند. دستهٔ ۲۱۱ حتی `ظباهنر55` را می‌ساخت و فقط
// می‌پرسید «از دفتر نیفتاده؟». سبزیِ CI تا وقتی ادعا نباشد، پوشش نیست.

import { check, group, readSrc } from '../harness.mjs';
import {
  SIDE_CALL, SIDE_PUT, SIDE_TABAEE, contractSide, expiryRoll, mergeRoster, repairRosterSides,
} from '../../core/option-roster.mjs';
import { scanBoardRows } from '../../core/roster-scan.mjs';

group('۲۶۹. تشخیص سمت');
{
  // ── تبعیِ خرید: نماد «ظ»، نام «اختیارخ ت» ──────────────────────────
  check('نماد «ظ» با نام کامل، تبعی است',
    contractSide('اختیارخ ت فباهنر-8026-05/05/07', 'ظباهنر55') === SIDE_TABAEE);
  check('نامِ «اختیارخ ت» حتی بی نماد هم تبعی است',
    contractSide('اختیارخ ت فخوز-2000-1405/03/10', '') === SIDE_TABAEE);
  check('نمادِ «ظ» حتی با نامِ کوتاه‌شده هم تبعی می‌ماند',
    contractSide('اختیارخ فباهنر', 'ظباهنر55') === SIDE_TABAEE);
  check('«تبعی» نوشته‌شدهٔ کامل هم گرفته می‌شود',
    contractSide('اختیار خرید تبعی فخوز', 'ظفخوز1') === SIDE_TABAEE);

  // ── تبعیِ فروش سرِ جایش می‌ماند ─────────────────────────────────────
  check('تبعیِ فروش هنوز تبعی است',
    contractSide('اختیارف ت صیکو', 'هصیکو10') === SIDE_TABAEE
      && contractSide('اختیارف صیکو', 'هصیکو10') === SIDE_TABAEE);

  // ═══ دامی که این اصلاح نباید در آن بیفتد ═══
  //
  // نامِ پایه‌ها با «ت» شروع می‌شوند: تاصیکو، تپکو، ترانس، تلیسه. الگویی
  // که فقط «اختیارخ ت» بخواهد، یک کالِ کاملاً سالم را تبعی می‌خواند.
  for (const base of ['تاصیکو', 'تپکو', 'ترانس', 'تلیسه']) {
    check(`کالِ «${base}» تبعی خوانده نمی‌شود`,
      contractSide(`اختیارخ ${base}-2000-1405/03/10`, `ض${base.slice(0, 3)}2`) === SIDE_CALL);
    check(`و پوتِ «${base}» هم`,
      contractSide(`اختیارف ${base}-2000-1405/03/10`, `ط${base.slice(0, 3)}2`) === SIDE_PUT);
  }

  // ── استانداردها دست‌نخورده ──────────────────────────────────────────
  check('کال و پوتِ استاندارد همان می‌مانند',
    contractSide('اختیارخ اهرم-20000-1405/07/25', 'ضهرم7050') === SIDE_CALL
      && contractSide('اختیارف اهرم-20000-1405/07/25', 'طهرم7050') === SIDE_PUT);
  // «طلا»، «ضمان» و «طعام» اختیار نیستند؛ نام حرفِ اول را می‌زند.
  check('صندوقی که نمادش «ط» یا «ض» است، قرارداد نمی‌شود',
    contractSide('صندوق طلا', 'طلا') === null && contractSide('صندوق تضمین', 'ضمان') === null);
  check('تناقضِ واقعیِ نام و نماد هنوز رد می‌شود',
    contractSide('اختیارف اهرم', 'ضهرم1') === null);
}

group('۲۶۹. تبعی وارد زنجیره نمی‌شود');
{
  // همان ردیفِ تابلوی دستهٔ ۲۱۱، این‌بار با ادعا دربارهٔ **سمتش**.
  const got = scanBoardRows([{
    uaInsCode: '12345678901234567', lval30_UA: 'فباهنر', strikePrice: 8026,
    expiryGregorian: 20260729, contractSize: 1000,
    insCode_C: '21760708293277584', lVal18AFC_C: 'ظباهنر55',
    lVal30_C: 'اختیارخ ت فباهنر-8026-05/05/07', insCode_P: '',
  }]);
  check('ردیفِ تبعی از دفتر نمی‌افتد', got.rows.length === 1);
  check('ولی کالِ استاندارد شمرده نمی‌شود', got.rows[0].side === SIDE_TABAEE);

  // ═══ چرا «۶۶ سریِ تک‌سمت» عددِ درستی نبود ═══
  //
  // پایه‌ای که فقط یک تبعیِ خرید دارد، «سریِ ناقصِ کال/پوت» نیست — اصلاً
  // سریِ استاندارد ندارد. تا امروز همان تبعی به‌عنوان کال شمرده می‌شد و
  // نبودِ پوتِ متناظرش «ناقص» خوانده می‌شد.
  const rows = [
    { ins: '1', symbol: 'ظباهنر55', side: contractSide('اختیارخ ت فباهنر-8026-05/05/07', 'ظباهنر55'), base: 'فباهنر', strike: 8026, expiry: 20260729 },
  ];
  const roll = expiryRoll(rows, 'فباهنر', 20260729);
  check('پایهٔ فقط‌تبعی، کالِ استاندارد ندارد', roll.call === 0 && roll.put === 0);
  check('و در دستهٔ تبعی شمرده می‌شود', roll.tabaee === 1);
  check('پس سریِ ناقص هم نمی‌سازد', roll.incomplete === 0 && roll.strikes === 0);

  // سریِ واقعاً ناقص باید همچنان ناقص شمرده شود.
  const halfRows = [
    { ins: '2', symbol: 'ضهرم7050', side: SIDE_CALL, base: 'اهرم', strike: 20000, expiry: 20261120 },
  ];
  const halfRoll = expiryRoll(halfRows, 'اهرم', 20261120);
  check('سریِ واقعاً تک‌سمت هنوز ناقص شمرده می‌شود',
    halfRoll.call === 1 && halfRoll.put === 0 && halfRoll.incomplete === 1);
}

group('۲۶۹. قاعده در کد نوشته شده');
{
  const src = readSrc('../core/option-roster.mjs');
  check('تبعی پیش از «اختیارخ» سنجیده می‌شود',
    src.includes('if (TABAEE_NAME.test(text)) byName = SIDE_TABAEE;'));
  check('و نماد «ظ» کنار «ه» می‌نشیند',
    src.includes("sym.startsWith('ه') || sym.startsWith('ظ')"));
  // فاصلهٔ پس از «ت» همان چیزی است که «اختیارخ تاصیکو» را نجات می‌دهد.
  check('الگوی نام، «ت» را کلمهٔ مستقل می‌خواهد',
    src.includes('/تبعی|اختیارف ت |اختیارخ ت /'));
}

group('۲۶۹. مهاجرتِ دفترِ قدیمی');
{
  // ═══ ممیزی، نوبت دوم ═══
  //
  // قاعده درست شد ولی دفترِ روی دیسک همان `call` قدیمی را داشت، و
  // `mergeRoster` ردیفِ قدیمی را برنده می‌کرد:
  //
  //     old: call  ·  fresh: tabaee  ·  merged: call
  //
  // یعنی فباهنر و فخوز تا ابد «۱ کال و صفر پوت» می‌ماندند. `side` یک
  // **مشتق** است نه یک مشاهده: با عوض شدنِ قاعده باید دوباره حساب شود.
  const stale = {
    ins: '21760708293277584', symbol: 'ظباهنر55',
    name: 'اختیارخ ت فباهنر-8026-05/05/07', side: SIDE_CALL,
    base: 'فباهنر', strike: 8026, expiry: 20260729,
  };
  const fresh = { ...stale, side: SIDE_TABAEE };

  check('ادغام، سمتِ تازه را با قدیمی جایگزین نمی‌کند',
    mergeRoster([stale], [fresh])[0].side === SIDE_TABAEE);
  // و حتی بی ردیفِ تازه هم خودش را درست می‌کند.
  check('دفترِ قدیمی بی هیچ ردیفِ تازه‌ای هم ترمیم می‌شود',
    mergeRoster([stale], [])[0].side === SIDE_TABAEE);
  check('و ترمیمِ هنگام خواندن همان کار را می‌کند',
    repairRosterSides([stale]).fixed === 1
      && repairRosterSides([stale]).rows[0].side === SIDE_TABAEE);

  // ── مرزها: ترمیم نباید چیزی را خراب کند ────────────────────────────
  const healthy = [
    { ins: '2', symbol: 'ضهرم7050', name: 'اختیارخ اهرم-20000-1405/07/25', side: SIDE_CALL, base: 'اهرم', strike: 20000, expiry: 20261120 },
    { ins: '3', symbol: 'طهرم7050', name: 'اختیارف اهرم-20000-1405/07/25', side: SIDE_PUT, base: 'اهرم', strike: 20000, expiry: 20261120 },
  ];
  check('ردیفِ سالم دست نمی‌خورد و شمرده هم نمی‌شود',
    repairRosterSides(healthy).fixed === 0
      && repairRosterSides(healthy).rows === healthy);
  // «نمی‌دانیم» دلیلِ پاک‌کردنِ چیزی نیست.
  const nameless = [{ ins: '4', symbol: '', name: '', side: SIDE_CALL }];
  check('ردیفِ بی‌نام و بی‌نماد، سمتِ قبلی‌اش را از دست نمی‌دهد',
    repairRosterSides(nameless).fixed === 0 && nameless[0].side === SIDE_CALL);
  check('و ادغام هم سمتِ چنین ردیفی را پاک نمی‌کند',
    mergeRoster(nameless, [])[0].side === SIDE_CALL);
  check('فهرست خالی یا بدشکل ترمیم را نمی‌اندازد',
    repairRosterSides([]).fixed === 0 && repairRosterSides(null).rows.length === 0);

  // ── پیامد روی همان عددی که کاربر می‌بیند ───────────────────────────
  //
  // «فباهنر: ۱ کال، صفر پوت» از دفترِ قدیمی می‌آمد. با ترمیم، پایه اصلاً
  // سریِ استاندارد ندارد و «تک‌سمت» هم شمرده نمی‌شود.
  const rollBefore = expiryRoll([stale], 'فباهنر', 20260729);
  const rollAfter = expiryRoll(repairRosterSides([stale]).rows, 'فباهنر', 20260729);
  check('پیش از ترمیم، یک کالِ جعلی شمرده می‌شد',
    rollBefore.call === 1 && rollBefore.tabaee === 0);
  check('پس از ترمیم، نه کال دارد نه سریِ ناقص',
    rollAfter.call === 0 && rollAfter.tabaee === 1 && rollAfter.incomplete === 0);

  check('سرور هم هنگام خواندنِ دفتر ترمیم را صدا می‌زند',
    readSrc('../server/server.mjs').includes('const sides = repairRosterSides(repaired.rows)'));
}
