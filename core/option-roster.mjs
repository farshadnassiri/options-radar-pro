// دفتر قراردادها — همان چیزی که بایگانی دیده‌بان نمی‌توانست بدهد.
//
// `core/watch-archive.mjs` صادقانه نوشته بود که راه بیرونی ندارد: تابلوی
// `GetInstrumentOptionMarketWatch` فقط **امروز** را می‌دهد و قراردادی که
// دیروز سررسید شد، از آن فهرست حذف است. پس هر تحلیلِ گذشته، فقط
// بازمانده‌ها را می‌دید — سوگیری بقا، و بدتر: خودِ «کدام‌ها زنده ماندند»
// خبری از آینده است که در آن تاریخ کسی نداشت.
//
// آن جمله یک نکته را نمی‌دانست. TSETMC مسیر دومی دارد که تاریخ می‌گیرد:
//
//     /ClosingPrice/GetInstrmentsHistoryInDay/{YYYYMMDD}
//
// این مسیر **همهٔ ابزارهای همان روز** را می‌دهد، از جمله اختیارهایی که
// امروز دیگر وجود ندارند. با پیمودن روزبه‌روزِ یک بازه، فهرستی ساخته
// می‌شود که هر قرارداد را با «از کِی دیده شد» و «کِی سررسید می‌شود»
// می‌شناسد. دیگر لازم نیست بایگانی از امروز شروع شود؛ دو سال گذشته هم
// قابل بازسازی است.
//
// ═══ مرزِ این ماژول ═══
//
// اینجا فقط **هویت و عمر** قرارداد است، نه قیمت. این همان قاعده‌ای است که
// بایگانی هم داشت و دلیلش عوض نشده: قیمتِ آن روز جای خودش را دارد
// (`/api/hist`) و آنجا واقعی است. اگر اینجا هم عددی می‌گذاشتیم، روزی یکی
// رویش حساب می‌کرد.
//
// ═══ چرا نامِ قرارداد، منبعِ حقیقت است ═══
//
// مسیر تاریخی، `strikePrice` و `endDate` جدا نمی‌دهد؛ فقط نام می‌دهد:
//
//     اختیارخ ذوب-۲۶۰-۱۴۰۵/۰۶/۱۸
//
// پس قیمت اعمال و سررسید باید از نام درآیند. نام‌ها یک شکل ندارند و
// خواندنِ ناقصشان گران است: قیمت اعمالِ اشتباه یعنی کل زنجیرهٔ غلط. پس
// قاعده این است که هر نامی که کامل خوانده نشود، **کنار گذاشته و شمرده**
// می‌شود؛ هیچ عددی حدس زده نمی‌شود.

import { num } from './num.mjs';
import { gregorianToJalali, jalaliToGregorian } from './jalali.mjs';
import { safeId } from './json-safe.mjs';

/** نسخهٔ ساختار پروندهٔ دفتر. اگر شکل عوض شد، خواننده باید بفهمد. */
// نسخهٔ ۲: عمر قرارداد از مشخصات رسمی می‌آید، نه از اولین معامله. پروندهٔ
// نسخهٔ ۱ خوانده می‌شود ولی هرگز «کامل» شمرده نمی‌شود — چون اصلاً از
// کاتالوگ ابزار عبور نکرده و قراردادهای بی‌معامله داخلش نیستند.
export const ROSTER_VERSION = 2;

export const SIDE_CALL = 'call';
export const SIDE_PUT = 'put';
/** اختیار فروش تبعی — ناشر می‌فروشد، در زنجیرهٔ عادی بازار نیست. */
export const SIDE_TABAEE = 'tabaee';

const FA_DIGITS = /[۰-۹٠-٩]/g;
const FA_MAP = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/**
 * یکسان‌سازی متن فارسی پیش از هر تطبیق.
 *
 * «ي» عربی و «ی» فارسی دو نویسهٔ متفاوت‌اند و در دادهٔ TSETMC هر دو دیده
 * می‌شوند. بدون این، «اختیار» با «اختيار» برابر نمی‌شود و یک ردیف سالم
 * بی‌صدا از دفتر می‌افتد.
 */
export function normalizeFa(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(FA_DIGITS, (d) => FA_MAP[d] ?? d)
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ۀ/g, 'ه')
    .replace(/[‌​﻿ـ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * سمتِ قرارداد، از دو نشانهٔ مستقل.
 *
 * نام («اختیارخ» / «اختیارف») و نخستین نویسهٔ نماد («ض» / «ط» / «ه») در
 * هفت‌هزار ردیف واقعی صد در صد با هم می‌خواندند. هر دو خوانده می‌شوند
 * چون یکی‌شان ممکن است خالی باشد؛ و اگر هر دو بودند و **مخالف** هم، این
 * تناقض است نه انتخاب — `null` برمی‌گردد تا ردیف کنار گذاشته و شمرده شود.
 *
 * ولی نمادِ تنها کافی نیست، و این را دادهٔ واقعی نشان داد: «طلا» (صندوق
 * کالای پارسیان)، «ضمان» (صندوق تضمین کاریزما) و «طعام» با «ط» و «ض»
 * شروع می‌شوند و هیچ‌کدام اختیار نیستند. اسکریپتی که فقط حرف اول را
 * می‌دید، سی‌ودو صندوق را وارد فهرست اختیارها کرده بود. پس نامْ حرفِ اول
 * را می‌زند: بدون «اختیار» در نام، نماد هرچه باشد، قرارداد نیست.
 */
export function contractSide(name, symbol = '') {
  const text = normalizeFa(name);
  const sym = normalizeFa(symbol);
  if (!/اختیار/.test(text)) return null;

  let byName = null;
  if (/اختیار\s*ف/.test(text)) byName = /اختیار\s*ف\s*\.?\s*ت\b|اختیارف ت /.test(text) ? SIDE_TABAEE : SIDE_PUT;
  else if (/اختیار\s*خ/.test(text)) byName = SIDE_CALL;

  let bySym = null;
  if (sym.startsWith('ض')) bySym = SIDE_CALL;
  else if (sym.startsWith('ط')) bySym = SIDE_PUT;
  else if (sym.startsWith('ه')) bySym = SIDE_TABAEE;

  if (byName && bySym) {
    if (byName === bySym) return byName;
    // تبعی هم «اختیار فروش» است؛ نمادش «ه» و نامش «اختیارف ت». وقتی نام
    // کوتاه شده و «ت» را از دست داده، نماد حرفِ آخر را می‌زند.
    if (byName === SIDE_PUT && bySym === SIDE_TABAEE) return SIDE_TABAEE;
    if (byName === SIDE_TABAEE && bySym === SIDE_PUT) return SIDE_TABAEE;
    return null;
  }
  return byName || bySym || null;
}

const isJalaliYear = (y) => y >= 1300 && y < 1700;

/** تاریخ فشردهٔ میلادی هشت‌رقمی از سه جزء جلالی. */
function jalaliCompact(jy, jm, jd) {
  if (!(jm >= 1 && jm <= 12) || !(jd >= 1 && jd <= 31)) return 0;
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return gy * 10000 + gm * 100 + gd;
}

/**
 * سالِ کوتاه‌شده را به سال کامل جلالی برگرداند.
 *
 * TSETMC سه شکل می‌نویسد: «۱۴۰۵»، «۰۵» و — در نام‌های بریده — «۵».
 * دو شکل آخر مبهم‌اند و مبهم ماندنشان خطرناک است، چون «۰۵/۰۸/۰۶» هم
 * می‌تواند ۱۴۰۵ باشد هم ۱۳۰۵. قرن از خودِ داده درنمی‌آید؛ ولی بازار
 * اختیار ایران از ۱۳۹۵ شروع شده و این پروژه فقط با ۱۳۹۰ به بعد کار
 * می‌کند، پس دو رقمِ ۹۰ تا ۹۹ یعنی ۱۳۹x و بقیه یعنی ۱۴۰x.
 */
export function expandJalaliYear(raw) {
  const y = num(raw, -1);
  if (!(y >= 0)) return 0;
  if (isJalaliYear(y)) return y;
  if (y >= 100) return 0;
  if (y >= 90) return 1300 + y;
  return 1400 + y;
}

/**
 * سررسید از دنبالهٔ تاریخ‌مانندِ انتهای نام.
 *
 * چهار شکل در دادهٔ واقعی دیده شد و هر چهار باید خوانده شوند، چون هر شکلی
 * که نخوانیم یعنی چند صد قرارداد گم‌شده:
 *
 *     ۱۴۰۵/۰۶/۱۸   سال کامل با ممیز
 *     ۱۴۰۵۰۶۱۸     سال کامل فشرده
 *     ۰۵/۰۸/۰۶     سال دورقمی با ممیز
 *     ۶/۱۰/۲۷      سال یک‌رقمی، از نامِ بریده
 *
 * خروجی، تاریخ فشردهٔ **میلادی** است — همان قراردادی که همهٔ مسیرهای
 * تاریخی این برنامه دارند. صفر یعنی خوانده نشد، نه «صفرم».
 */
export function parseExpiry(text) {
  const s = normalizeFa(text);
  if (!s) return 0;

  let m = s.match(/(1[34]\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})\s*$/);
  if (m) return jalaliCompact(+m[1], +m[2], +m[3]);

  m = s.match(/(1[34]\d{2})(\d{2})(\d{2})\s*$/);
  if (m) return jalaliCompact(+m[1], +m[2], +m[3]);

  m = s.match(/(?:^|[^\d])(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{1,2})\s*$/);
  if (m) {
    const jy = expandJalaliYear(m[1]);
    return jy ? jalaliCompact(jy, +m[2], +m[3]) : 0;
  }

  // شکل قدیمیِ فشرده بی‌ممیز: «۰۳۰۷۱۵» یعنی ۱۴۰۳/۰۷/۱۵. حدود سی قرارداد
  // این شکل را دارند و بی این شاخه، نامشان خوانده نمی‌شد.
  //
  // خطرِ این شاخه، قیمت اعمالِ شش‌رقمی است که تاریخ خوانده شود. دو چیز
  // جلویش را می‌گیرد: باید بلافاصله پس از یک جداکننده بیاید، و ماه و روزش
  // باید معتبر باشند — «۱۰۰۰۰۰» می‌شود ماه صفر و رد می‌شود.
  m = s.match(/[-–—/](\d{2})(\d{2})(\d{2})\s*$/);
  if (m) {
    const jy = expandJalaliYear(m[1]);
    return jy ? jalaliCompact(jy, +m[2], +m[3]) : 0;
  }
  return 0;
}

/** برچسب جلالی یک تاریخ فشردهٔ میلادی. «—» یعنی نداریم، نه صفر. */
export function expiryLabel(compact) {
  const v = num(compact, 0);
  if (!(v >= 10000101)) return '—';
  const y = Math.floor(v / 10000), mo = Math.floor(v / 100) % 100, d = v % 100;
  const [jy, jm, jd] = gregorianToJalali(y, mo, d);
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

/**
 * تجزیهٔ نام قرارداد به پایه، قیمت اعمال و سررسید.
 *
 * شکل غالب `اختیارخ <پایه>-<اعمال>-<سررسید>` است، ولی نامِ TSETMC در حدود
 * سی نویسه بریده می‌شود و در ردیف‌های بریده، خطِ فاصلهٔ بین پایه و اعمال
 * از بین می‌رود («اختیارف ت کیمیاتک۲۱۰۲۵-۶/۱۰/۲۷»). آنجا نمی‌شود گفت
 * قیمت اعمال کجای عدد شروع می‌شود و کجا نامِ پایه تمام شده — پس **حدس
 * زده نمی‌شود**. `null` برمی‌گردد و شمارندهٔ ردیف‌های نخوانده بالا می‌رود.
 */
export function parseContractName(name) {
  const s = normalizeFa(name);
  if (!s) return null;

  const expiry = parseExpiry(s);
  if (!expiry) return null;

  // آنچه پیش از دنبالهٔ تاریخ مانده، «پایه-اعمال» است. خطِ فاصلهٔ آخر مرزِ
  // تاریخ است؛ اگر نامْ بریده باشد و آن خط نباشد، همین‌جا `null` می‌شود.
  const cut = s.lastIndexOf('-');
  if (cut <= 0) return null;
  const body = s.slice(0, cut).trim();

  const at = body.lastIndexOf('-');
  if (at <= 0) return null;
  const strikeText = body.slice(at + 1).replace(/[,٬\s]/g, '');
  if (!/^\d+$/.test(strikeText)) return null;
  const strike = Number(strikeText);
  if (!(strike > 0)) return null;

  const base = body.slice(0, at).replace(/^اختیار\s*[خف]\s*\.?\s*(?:ت\s*\.?)?\s*/, '').trim();
  if (!base) return null;

  return { base, strike, expiry };
}

/**
 * یک ردیف خام (از مسیر تاریخی یا از فایل کاربر) → ردیف دفتر.
 *
 * `null` یعنی این ردیف قرارداد اختیار نیست یا کامل خوانده نشد. تفکیکِ این
 * دو در `rosterIntake` است؛ اینجا فقط «شد» یا «نشد».
 */
export function rosterRow(raw) {
  // ── چرا `safeId` و نه `String()` ────────────────────────────────────
  //
  // `String(58199962935089492)` هرگز اجرا نمی‌شود؛ آنچه اجرا می‌شود
  // `String(<عددی که از قبل گرد شده>)` است و بی‌هیچ خطایی
  // `'58199962935089490'` می‌دهد — رشته‌ای که از رگولارِ زیر هم رد
  // می‌شود، چون هجده رقمِ سالم به‌نظر می‌آید.
  //
  // صاحب پروژه همین را دید: ضهرم۶۰۵۱ کدِ واقعی‌اش ...۴۹۲ است و برنامه
  // ...۴۹۰ صدا می‌زد. آن نشانی به هیچ ابزاری نمی‌خورد، پس پاسخ خالی
  // برمی‌گشت و فایل می‌نوشت «معامله نشده» — بدترین شکل ممکن برای خطا،
  // چون شبیه واقعیتِ بازار است.
  //
  // `core/json-safe.mjs` این نگهبان را داشت و به این مسیر وصل نشده بود.
  // حالا عددِ ناامن **رد** می‌شود، نه اینکه رشتهٔ گردشده بسازد.
  const ins = safeId(raw?.ins ?? raw?.InsCode ?? raw?.insCode ?? '');
  if (!ins || !/^\d{6,20}$/.test(ins)) return null;

  const symbol = normalizeFa(raw?.symbol ?? raw?.Symbol ?? raw?.lVal18AFC ?? '');
  const name = normalizeFa(raw?.name ?? raw?.Name ?? raw?.lVal30 ?? '');
  const side = contractSide(name, symbol);
  if (!side) return null;

  const parsed = parseContractName(name);
  const strike = parsed ? parsed.strike : num(raw?.strike ?? raw?.Strike, 0);
  const expiry = parsed ? parsed.expiry : parseExpiry(raw?.expiry ?? raw?.ExpiryJalali ?? '');
  const base = parsed ? parsed.base : normalizeFa(raw?.base ?? '');
  if (!(strike > 0) || !expiry) return null;

  // ── بی‌پایه، ردیف نیست ──────────────────────────────────────────────
  //
  // ستون‌های آمادهٔ فایل می‌توانند قیمت اعمال و سررسید را بدهند حتی وقتی
  // نام خوانده نشده؛ ولی نامِ پایه فقط از خودِ نام درمی‌آید. ردیفی که
  // پایه ندارد به هیچ زنجیره‌ای وصل نمی‌شود و هیچ قیمتی برایش خواسته
  // نمی‌شود — فقط در فهرست «پایهٔ ناشناخته» می‌نشیند، با نامِ خالی.
  //
  // در دادهٔ واقعی سی ردیف این شکل بودند و پیامِ کاربر را به «۱ نماد پایه
  // کدشان به دست نیامد: » ختم می‌کردند — جمله‌ای که نصفه تمام می‌شد.
  if (!base) return null;

  const first = compactOf(raw?.first ?? raw?.FirstSeenGregorian);
  const last = compactOf(raw?.last ?? raw?.LastSeenGregorian);
  const listedFrom = compactOf(raw?.listedFrom) || num(raw?.listedFrom, 0);

  // ── قراردادِ بی‌معامله ردیف است، نه هیچ ────────────────────────────
  //
  // نسخهٔ پیشین «اولین و آخرین روزِ دیده‌شده» را اجباری کرده بود، و آن
  // فرضِ نانوشته‌ای داشت: هر قراردادی دست‌کم یک بار معامله شده. برای
  // بازارِ کم‌عمق غلط است و جهت‌دار هم هست — بی‌معامله‌ها همان
  // دورافتاده‌هایند. ردیفی که از کاتالوگ آمده تاریخِ معامله ندارد و
  // نباید داشته باشد؛ عمرش از مشخصات رسمی می‌آید.
  if ((!first || !last) && !(listedFrom > 0) && raw?.fromCatalog !== true) return null;

  return {
    ins, symbol, name, side, base, strike, expiry,
    first, last: Math.max(first, last),
    id: String(raw?.id ?? raw?.InstrumentID ?? raw?.instrumentID ?? '').trim(),
    // مشخصات رسمی، اگر پاس کاتالوگ رسیده باشد. صفر یعنی «نداریم»، نه صفرم.
    listedFrom: compactOf(raw?.listedFrom) || num(raw?.listedFrom, 0),
    listedTo: compactOf(raw?.listedTo) || num(raw?.listedTo, 0),
    contractSize: num(raw?.contractSize, 0),
    uaIns: String(raw?.uaIns ?? '').trim(),
    fromCatalog: raw?.fromCatalog === true,
  };
}

/** «2026-08-29» یا «20260829» یا عدد → تاریخ فشردهٔ میلادی. صفر یعنی نشد. */
export function compactOf(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (value instanceof Date) {
    return value.getUTCFullYear() * 10000 + (value.getUTCMonth() + 1) * 100 + value.getUTCDate();
  }
  const s = normalizeFa(value).replace(/[^\d]/g, '');
  if (s.length !== 8) return 0;
  const v = Number(s);
  const mo = Math.floor(v / 100) % 100, d = v % 100;
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return 0;
  return v;
}

/**
 * خواندن یک دستهٔ خام، با شمارشِ آنچه نیامد.
 *
 * چرا شمارش لازم است: خواستهٔ صریح کاربر «چیزی از گذشته جا نماند» بود.
 * تنها راهِ صادقانهٔ سنجشِ این، عددِ ردیف‌هایی است که کنار گذاشته شدند —
 * بی‌آن، هر فهرستی «کامل» به نظر می‌رسد.
 */
export function rosterIntake(rawRows = []) {
  const rows = [], skipped = [];
  let notOption = 0, unparsed = 0;
  for (const raw of Array.isArray(rawRows) ? rawRows : []) {
    const name = normalizeFa(raw?.name ?? raw?.Name ?? raw?.lVal30 ?? '');
    const symbol = normalizeFa(raw?.symbol ?? raw?.Symbol ?? raw?.lVal18AFC ?? '');
    const row = rosterRow(raw);
    if (row) { rows.push(row); continue; }
    if (contractSide(name, symbol)) {
      unparsed += 1;
      if (skipped.length < 200) skipped.push({ name, symbol, reason: 'unparsed' });
    } else {
      notOption += 1;
    }
  }
  return { rows, seen: Array.isArray(rawRows) ? rawRows.length : 0, kept: rows.length, notOption, unparsed, skipped };
}

/**
 * ادغام دو دفتر روی شناسهٔ ابزار.
 *
 * عمرِ قرارداد **گسترده** می‌شود، نه جایگزین: یک اسکنِ تازه که فقط ماه
 * آخر را دیده، نباید «از کِی دیده شد» را به ماه آخر عقب بکشد. متادیتای
 * خالی هم جای پرِ قبلی را نمی‌گیرد.
 */
/**
 * دوقلوی گردشده: ردیفی که کدش نسخهٔ گردشدهٔ کدِ درست است.
 *
 * ═══ چرا این قابل اثبات است و حدس نیست ═══
 *
 * کدِ گردشده از روی خودش قابل تشخیص نیست — `58199962935089490` رشتهٔ
 * کاملاً معتبری است. ولی وقتی منبعِ درست هم در دست باشد، اثبات ساده و
 * قطعی است:
 *
 *   `Number(درست) === Number(گردشده)`  و  `درست !== گردشده`  و  نمادشان یکی
 *
 * یعنی این دو کد در دنیای ممیز شناور یکی‌اند و در دنیای واقعی دوتا؛ پس
 * آن یکی که با منبع نمی‌خواند، همان قربانیِ گرد شدن است.
 *
 * شرطِ «نماد یکی» عمدی است: بی آن، دو قراردادِ واقعاً متفاوت که تصادفاً
 * هم‌ممیزند به هم گره می‌خوردند.
 */
export function roundedTwins(rows = [], truth = []) {
  const byFloat = new Map();
  for (const row of truth) {
    const ins = String(row?.ins ?? '');
    if (!/^\d+$/.test(ins)) continue;
    const key = `${Number(ins)}|${row?.symbol ?? ''}`;
    if (!byFloat.has(key)) byFloat.set(key, ins);
  }
  const out = [];
  for (const row of rows) {
    const ins = String(row?.ins ?? '');
    if (!/^\d+$/.test(ins) || Number.isSafeInteger(Number(ins))) continue;
    const right = byFloat.get(`${Number(ins)}|${row?.symbol ?? ''}`);
    if (right && right !== ins) out.push({ symbol: row?.symbol ?? '', wrong: ins, right });
  }
  return out;
}

/**
 * شناسه‌ای که **ممکن است** قربانی گرد شدن باشد — بی منبعِ درست، فقط ظن.
 *
 * کدِ بزرگ‌تر از مرز امن که بی‌تغییر از `Number` رد می‌شود، یا واقعاً روی
 * یکی از نقطه‌های نمایش‌پذیرِ ممیز شناور نشسته (که در این بازه از هر ۸ تا
 * حدود یکی است) یا گردشده است. عدد را گزارش می‌کنیم و **حذف نمی‌کنیم**؛
 * تصمیم با منبعِ درست گرفته می‌شود، نه با ظن.
 */
export function suspectIds(rows = []) {
  return rows.filter((row) => {
    const ins = String(row?.ins ?? '');
    return /^\d+$/.test(ins) && !Number.isSafeInteger(Number(ins)) && String(Number(ins)) === ins;
  }).length;
}

/**
 * ترمیم: کدِ گردشده با کدِ درست عوض می‌شود، بی‌آنکه ردیف تازه‌ای بسازد.
 *
 * ادغامِ ساده این را حل نمی‌کند: کلیدِ ادغام خودِ `ins` است، پس کدِ درست
 * و کدِ گردشده دو ردیف جدا می‌مانند و زنجیره هر دو را نشان می‌دهد.
 */
export function repairRoster(rows = [], truth = []) {
  const fix = new Map(roundedTwins(rows, truth).map((t) => [t.wrong, t.right]));
  if (!fix.size) return { rows, fixed: 0 };
  return {
    rows: rows.map((row) => (fix.has(String(row?.ins))
      ? { ...row, ins: fix.get(String(row.ins)) }
      : row)),
    fixed: fix.size,
  };
}

export function mergeRoster(existing = [], incoming = []) {
  const byIns = new Map();
  const put = (row) => {
    if (!row?.ins) return;
    const old = byIns.get(row.ins);
    if (!old) { byIns.set(row.ins, { ...row }); return; }
    // `num` تزیین نیست: ردیفی که میدانِ تاریخ ندارد `undefined` می‌دهد و
    // `Math.min(undefined, undefined)` می‌شود `NaN` — که در JSON به
    // `null` تبدیل می‌شود و از آن به بعد هر مقایسه‌ای رویش خاموش است.
    const oldFirst = num(old.first, 0), newFirst = num(row.first, 0);
    old.first = oldFirst && newFirst ? Math.min(oldFirst, newFirst) : (oldFirst || newFirst);
    old.last = Math.max(num(old.last, 0), num(row.last, 0));
    for (const key of ['symbol', 'name', 'base', 'id', 'uaIns']) {
      if (!old[key] && row[key]) old[key] = row[key];
    }
    // مشخصات رسمی هرگز با «نداریم» بازنویسی نمی‌شود، و اگر آمد، بر
    // حدسِ نامی مقدم است: `listedTo` از بازار آمده، `expiry` از نام.
    for (const key of ['strike', 'expiry', 'listedFrom', 'listedTo', 'contractSize']) {
      if (!(old[key] > 0) && row[key] > 0) old[key] = row[key];
    }
    if (!old.side && row.side) old.side = row.side;
    if (row.fromCatalog) old.fromCatalog = true;
  };
  for (const row of Array.isArray(existing) ? existing : []) put(row);
  for (const row of Array.isArray(incoming) ? incoming : []) put(row);
  return [...byIns.values()].sort((a, b) => (a.expiry - b.expiry) || (a.strike - b.strike) || a.ins.localeCompare(b.ins));
}

export const STATUS_PENDING = 'pending';
export const STATUS_ACTIVE = 'active';
export const STATUS_EXPIRED = 'expired';

/**
 * وضعیت یک قرارداد **در یک تاریخ معین** — نه «الان».
 *
 * این نکتهٔ اصلی خواستهٔ کاربر است: سررسید یک رویدادِ ثابت نیست، یک مرزِ
 * متحرک روی زمان است. همان قرارداد در ۱۵ مرداد فعال است و در ۲۰ مرداد
 * منقضی؛ پس وضعیت بدونِ تاریخ، معنا ندارد و این تابع تاریخ را **اجباری**
 * می‌گیرد. `null` یعنی نمی‌دانیم، و «نمی‌دانیم» با «منقضی» یکی نیست.
 */
/**
 * بازهٔ اعتبارِ یک قرارداد — با اولویت مشخصات رسمی.
 *
 * `listedFrom` تاریخِ گشایش است و از بازار می‌آید؛ `first` اولین روزی
 * است که معامله‌ای دیده شده. این دو یکی نیستند و فرقشان در بک‌تست عدد
 * عوض می‌کند: قراردادی که سه ماه پیش گشایش شد و دیروز اولین معامله‌اش را
 * داشت، با معیارِ `first` سه ماه دیر وارد بازار می‌شود — و قراردادی که
 * هرگز معامله نشد، اصلاً وارد نمی‌شود.
 *
 * `first` فقط وقتی جای `listedFrom` می‌نشیند که مشخصات رسمی نداشته
 * باشیم، و آن‌وقت ردیف `lifeFromTrades` نشان‌دار است تا معلوم باشد این
 * مرز مشاهده‌ای است نه رسمی.
 */
export function contractLife(row) {
  const listed = num(row?.listedFrom, 0);
  const official = num(row?.listedTo, 0);
  const expiry = official > 0 ? official : num(row?.expiry, 0);
  const from = listed > 0 ? listed : num(row?.first, 0);
  return { from, to: expiry, official: listed > 0 };
}

export function contractStatus(row, asOf) {
  const at = compactOf(asOf) || num(asOf, 0);
  const { from, to } = contractLife(row);
  if (!(at > 0) || !(to > 0)) return null;
  if (from > 0 && at < from) return STATUS_PENDING;
  return at > to ? STATUS_EXPIRED : STATUS_ACTIVE;
}

export function statusLabel(status) {
  if (status === STATUS_ACTIVE) return 'فعال';
  if (status === STATUS_EXPIRED) return 'منقضی';
  if (status === STATUS_PENDING) return 'هنوز گشایش نشده';
  return 'نامعلوم';
}

/** قراردادهای زندهٔ یک روز. مرزها هر دو تو هستند: روزِ سررسید هنوز معامله دارد. */
export function rosterAt(rows = [], date) {
  const at = compactOf(date) || num(date, 0);
  if (!(at > 0)) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) => contractStatus(row, at) === STATUS_ACTIVE);
}

/**
 * قراردادهای یک **بازه** — با اینکه هرکدام در کدام تکه‌اش زنده بودند.
 *
 * این پاسخِ مستقیم خواستهٔ چهارم است: قراردادی که هفتهٔ پیش سررسید شد در
 * محاسبهٔ امروز نیست، ولی در بازهٔ «دو هفته پیش تا امروز» در بخشی هست و
 * در بخشی نیست. پس ردیف با `activeFrom`/`activeTo` برمی‌گردد و مصرف‌کننده
 * می‌داند کجا حق دارد رویش حساب کند.
 */
export function rosterInRange(rows = [], from, to) {
  const a = compactOf(from) || num(from, 0);
  const b = compactOf(to) || num(to, 0);
  if (!(a > 0) || !(b > 0) || b < a) return [];
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const { from, to: expiry, official } = contractLife(row);
    if (!(expiry > 0)) continue;
    const activeFrom = Math.max(from || a, a);
    const activeTo = Math.min(expiry, b);
    if (activeTo < activeFrom) continue;
    out.push({
      ...row,
      activeFrom, activeTo,
      expiresInside: expiry >= a && expiry <= b,
      listedInside: from > 0 && from >= a && from <= b,
      wholeRange: (from === 0 || from <= a) && expiry >= b,
      lifeFromTrades: !official,
      statusAtEnd: contractStatus(row, b),
    });
  }
  return out;
}

/**
 * خلاصهٔ بازه، برای جمله‌ای که کاربر می‌خواند.
 *
 * سه عدد که با هم معنا می‌دهند: چند قرارداد در بازه زنده بودند، چند تا
 * **داخل** بازه سررسید شدند (اینها همان‌هایی‌اند که فهرست امروز ندارد)، و
 * چند تا تا انتهای بازه هنوز فعال بودند.
 */
export function rangeSummary(rows = [], from, to) {
  const live = rosterInRange(rows, from, to);
  let expiredInside = 0, activeAtEnd = 0, listedInside = 0;
  const bases = new Set();
  for (const row of live) {
    if (row.expiresInside) expiredInside += 1;
    if (row.statusAtEnd === STATUS_ACTIVE) activeAtEnd += 1;
    if (row.listedInside) listedInside += 1;
    if (row.base) bases.add(row.base);
  }
  return { total: live.length, expiredInside, activeAtEnd, listedInside, bases: bases.size, from: compactOf(from) || num(from, 0), to: compactOf(to) || num(to, 0) };
}

/** بازهٔ پوشش دفتر — از کِی تا کِی واقعاً روز اسکن شده. */
export function rosterCoverage(rows = [], scanned = null) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { count: 0, from: 0, to: 0, bases: 0, scanned: scanned || null };
  let from = Infinity, to = 0;
  const bases = new Set();
  for (const row of list) {
    if (row.first > 0) from = Math.min(from, row.first);
    if (row.last > 0) to = Math.max(to, row.last);
    if (row.base) bases.add(row.base);
  }
  return { count: list.length, from: Number.isFinite(from) ? from : 0, to, bases: bases.size, scanned: scanned || null };
}

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/**
 * جملهٔ صداقت دفتر — دقیقاً چه چیزی به دست مصرف‌کننده رسید.
 *
 * حالتِ خطرناک، همان حالتِ میانی بایگانی است: دفتر هست ولی بازهٔ خواسته‌شده
 * بیرونِ پوشش آن است. اگر بی‌صدا هرچه داشت را بدهد، کاربر فکر می‌کند فهرست
 * کامل است در حالی که نیمهٔ گمشده‌اش دقیقاً همان‌هایی‌اند که سررسید شده‌اند.
 */
export function rosterNote({ coverage, from = 0, to = 0, summary = null } = {}) {
  const cov = coverage || { count: 0, from: 0, to: 0 };
  if (!cov.count) {
    return 'دفتر قراردادهای تاریخی هنوز ساخته نشده. تا وقتی ساخته نشود، فهرست هر تاریخِ گذشته فقط قراردادهای زندهٔ امروز را دارد و سوگیری بقا دارد.';
  }
  const head = `دفتر ${fa(cov.count)} قرارداد دارد، از ${fa(cov.from)} تا ${fa(cov.to)}.`;
  const tail = summary
    ? ` در بازهٔ خواسته‌شده ${fa(summary.total)} قرارداد زنده بوده که ${fa(summary.expiredInside)} تای آن‌ها داخل همین بازه سررسید شده — همان‌هایی که فهرست امروز ندارد.`
    : '';
  if (from && from < cov.from) {
    return `${head} بازهٔ خواسته‌شده از ${fa(from)} شروع می‌شود که پیش از آغاز پوشش است؛ قراردادهای پیش از ${fa(cov.from)} در دفتر نیستند و این تکه سوگیری بقا دارد.${tail}`;
  }
  if (to && to > cov.to) {
    return `${head} بازه تا ${fa(to)} خواسته شده که از پایان پوشش جلوتر است؛ روزهای پس از ${fa(cov.to)} هنوز اسکن نشده‌اند.${tail}`;
  }
  return `${head} کل بازهٔ خواسته‌شده داخل پوشش است، پس قراردادِ سررسیدشده هم دیده می‌شود.${tail}`;
}

/**
 * آیا دفتر این روز را **واقعاً** دیده است.
 *
 * «بین اولین و آخرین قرارداد» کافی نیست و این تفاوت مهم است: اگر فقط
 * مهرماه اسکن شده باشد، قراردادی که مهر دیده شده ممکن است سررسیدش اسفند
 * باشد، و آن‌وقت بازهٔ ظاهری تا اسفند کش می‌آید در حالی که آبان تا بهمن
 * هرگز اسکن نشده. فهرستِ آن روزها ناقص است و باید ناقص شمرده شود.
 *
 * پس دو منبعِ پوشش داریم: `days` (روزهایی که اسکنر واقعاً گرفت) و بازهٔ
 * `scannedFrom..scannedTo` (برای فهرستی که یک‌جا وارد شده و روزِ جدا
 * ندارد). هرکدام بود، همان معتبر است.
 */
export function rosterCovers(file, date) {
  const at = compactOf(date) || num(date, 0);
  if (!(at > 0)) return false;
  const days = file?.days;
  if (Array.isArray(days) && days.length) return days.includes(at);
  const from = num(file?.scannedFrom, 0), to = num(file?.scannedTo, 0);
  return from > 0 && to > 0 && at >= from && at <= to;
}

/** روزهای بازه که دفتر **ندارد** — همان‌هایی که باید اسکن شوند. */
export function missingDays(file, days = []) {
  return (Array.isArray(days) ? days : []).filter((day) => !rosterCovers(file, day));
}

/**
 * کدام منبع به درخواستِ فهرستِ یک تاریخ جواب می‌دهد — و چرا.
 *
 * این تصمیم سیاست است، نه لوله‌کشی، پس اینجاست نه در سرور. سه منبع
 * هست و ترتیبشان دلیل دارد:
 *
 *   بایگانی  عکسِ واقعی همان روز است و اندازهٔ قرارداد هم دارد.
 *   دفتر     همان روز را از فهرستِ ابزارهای آن روز بازمی‌سازد، بی‌اندازه.
 *   تابلو    فهرستِ **امروز** است و قراردادِ سررسیدشده را ندارد.
 *
 * دفتر جای **نداشتنِ** بایگانی را می‌گیرد، نه جای مشاهده را. اگر جلو
 * می‌افتاد، روزی که هر دو بودند، ردیفِ بی‌اندازه جای ردیفِ بااندازه
 * می‌نشست و هر عدد پولی به همان نسبت غلط می‌شد.
 *
 * تابلو آخر است و تنها منبعی است که **سوگیری بقا** دارد؛ برچسبش هم
 * همین را می‌گوید.
 */
export function pickUniverseSource({ hasArchive = false, coverage = null, wanted = 0 } = {}) {
  const at = compactOf(wanted) || num(wanted, 0);
  if (hasArchive) return { source: 'archive', survivalBias: false, reason: 'بایگانی همان روز هست — عکس واقعی، با اندازهٔ قرارداد.' };
  const count = num(coverage?.count, 0);
  if (count > 0 && at > 0 && at >= num(coverage.from, 0) && at <= num(coverage.to, 0)) {
    return { source: 'roster', survivalBias: false, reason: 'بایگانی این روز را ندارد؛ دفتر داردش، پس قراردادِ سررسیدشده هم می‌آید.' };
  }
  return {
    source: 'board', survivalBias: true,
    reason: count > 0
      ? 'این روز بیرونِ پوشش دفتر است؛ فهرست امروز می‌نشیند و سوگیری بقا دارد.'
      : 'نه بایگانی هست نه دفتر؛ فهرست امروز می‌نشیند و سوگیری بقا دارد.',
  };
}

/**
 * جفت‌کردن کال و پوتِ هم‌قیمت و هم‌سررسید، به شکلِ ردیف دیده‌بان.
 *
 * چرا این شکل: کلِ برنامه از `buildChain` تغذیه می‌شود و آن، ردیفِ
 * دیده‌بان می‌خواهد — یک رکورد با کال و پوتِ مشترک. دفتر ولی هر قرارداد
 * را جدا می‌شناسد، پس اینجا دوباره جفت می‌شوند.
 *
 * قیمت‌ها همه صفر می‌مانند، دقیقاً مثل `chainRowsFrom` و به همان دلیل.
 * `uaInsCode` هم از دفتر درنمی‌آید — نامِ پایه هست ولی شناسه‌اش نه — پس
 * `baseIndex` (نام پایه → شناسه) از فهرستِ امروز می‌آید. نمادِ پایه سررسید
 * نمی‌شود، پس این نگاشت سوگیری بقا ندارد.
 */
export function rosterChainRows(rows = [], { baseIndex = new Map(), at = 0 } = {}) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.side !== SIDE_CALL && row.side !== SIDE_PUT) continue;
    const key = `${row.base}|${row.strike}|${row.expiry}`;
    let g = groups.get(key);
    if (!g) { g = { base: row.base, strike: row.strike, expiry: row.expiry, call: null, put: null }; groups.set(key, g); }
    if (row.side === SIDE_CALL) g.call = g.call || row;
    else g.put = g.put || row;
  }

  const asOf = compactOf(at) || num(at, 0);
  const out = [];
  for (const g of groups.values()) {
    const baseIns = String(baseIndex.get(g.base) ?? baseIndex.get(normalizeFa(g.base)) ?? '');
    const jalali = expiryLabel(g.expiry);
    const parts = jalali === '—' ? null : jalali.split('/').map(Number);
    const endDate = parts ? parts[0] * 10000 + parts[1] * 100 + parts[2] : 0;
    out.push({
      uaInsCode: baseIns, lval30_UA: g.base,
      insCode_C: g.call?.ins || '', insCode_P: g.put?.ins || '',
      lVal18AFC_C: g.call?.symbol || '', lVal18AFC_P: g.put?.symbol || '',
      lVal30_C: g.call?.name || '', lVal30_P: g.put?.name || '',
      strikePrice: g.strike, contractSize: 0, endDate,
      remainedDay: asOf ? daysApart(asOf, g.expiry) : 0,
      pDrCotVal_UA: 0, pClosing_UA: 0, priceYesterday_UA: 0,
      pDrCotVal_C: 0, pClosing_C: 0, priceYesterday_C: 0,
      pDrCotVal_P: 0, pClosing_P: 0, priceYesterday_P: 0,
      zTotTran_C: 0, qTotTran5J_C: 0, qTotCap_C: 0, oP_C: 0,
      zTotTran_P: 0, qTotTran5J_P: 0, qTotCap_P: 0, oP_P: 0,
      pMeDem_C: 0, qTitMeDem_C: 0, pMeOf_C: 0, qTitMeOf_C: 0,
      pMeDem_P: 0, qTitMeDem_P: 0, pMeOf_P: 0, qTitMeOf_P: 0,
      fromRoster: true,
      expiryGregorian: g.expiry,
      baseKnown: Boolean(baseIns),
    });
  }
  return out.sort((a, b) => (a.expiryGregorian - b.expiryGregorian) || (a.strikePrice - b.strikePrice));
}

/** فاصلهٔ روز بین دو تاریخ فشردهٔ میلادی. */
export function daysApart(a, b) {
  const pa = splitCompact(a), pb = splitCompact(b);
  if (!pa || !pb) return 0;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

function splitCompact(value) {
  const v = num(value, 0);
  if (!(v >= 10000101)) return null;
  return { y: Math.floor(v / 10000), m: Math.floor(v / 100) % 100, d: v % 100 };
}

/**
 * کنترل صحتِ جفت کال و پوت.
 *
 * ═══ چرا کنترل، و نه ترمیم ═══
 *
 * هر سری اختیارِ عادی در بورس تهران با هر دو سمت گشایش می‌شود. پس یک
 * گروهِ «پایه + سررسید + قیمت اعمال» که فقط یک سمت دارد، تقریباً همیشه
 * یعنی **ما** آن یکی را ندیده‌ایم، نه اینکه وجود نداشته.
 *
 * ولی «تقریباً همیشه» با «همیشه» یکی نیست، و همین است که این تابع
 * ترمیم نمی‌کند. ساختنِ شناسهٔ سمتِ گمشده با تغییر حرف یا رقم — «ضهرم»
 * به «طهرم» — شناسه‌ای می‌سازد که یا به هیچ‌چیز نمی‌خورد یا، بدتر، به
 * قرارداد دیگری می‌خورد. یک جای خالیِ اعلام‌شده از یک عددِ غلطِ ساکت
 * بی‌نهایت بهتر است.
 *
 * پس خروجی یک **گزارش** است: کدام گروه‌ها ناقص‌اند و کدام عبارت را باید
 * جست‌وجو کرد تا کاملشان کنیم.
 *
 * اختیار فروش تبعی از این کنترل بیرون است: ناشر می‌فروشد و اصلاً سمتِ
 * خرید ندارد، پس «ناقص» شمردنش یعنی هزار هشدار دروغ.
 */
export function pairAudit(rows = []) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.side !== SIDE_CALL && row?.side !== SIDE_PUT) continue;
    if (!row.base || !(row.strike > 0) || !(row.expiry > 0)) continue;
    const key = `${row.base}|${row.expiry}|${row.strike}`;
    let g = groups.get(key);
    if (!g) { g = { key, base: row.base, expiry: row.expiry, strike: row.strike, call: null, put: null }; groups.set(key, g); }
    if (row.side === SIDE_CALL) g.call = g.call || row;
    else g.put = g.put || row;
  }

  const missingPut = [], missingCall = [];
  for (const g of groups.values()) {
    if (g.call && !g.put) missingPut.push(g);
    else if (g.put && !g.call) missingCall.push(g);
  }
  const bySide = (list) => list.map((g) => ({
    base: g.base, expiry: g.expiry, strike: g.strike,
    // عبارتی که باید جست‌وجو شود: پیشوندِ حرفیِ نمادِ سمتِ موجود کافی
    // نیست (پیشوند دو سمت فرق دارد)، پس نامِ پایه می‌رود.
    term: g.base,
    have: g.call ? g.call.symbol : g.put.symbol,
  }));

  return {
    groups: groups.size,
    complete: groups.size - missingPut.length - missingCall.length,
    missingPut: bySide(missingPut),
    missingCall: bySide(missingCall),
    incomplete: missingPut.length + missingCall.length,
    terms: [...new Set([...missingPut, ...missingCall].map((g) => g.base))].sort(),
  };
}

/**
 * شمارِ کال و پوتِ یک سررسیدِ یک پایه — همان معیاری که کاربر می‌سنجد.
 *
 * سررسید با **تاریخ استاندارد** مقایسه می‌شود، نه با شباهت نماد. یک
 * قراردادِ `طهرم۶۰۲۰` که سررسیدش ۱۴۰۳/۰۶/۲۸ است نباید زیر ۱۴۰۴/۰۶/۲۶
 * بنشیند فقط چون نمادش شبیه است.
 */
export function expiryRoll(rows = [], base, expiry) {
  const want = compactOf(expiry) || num(expiry, 0);
  const wantBase = normalizeFa(base);
  const call = [], put = [], tabaee = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (normalizeFa(row?.base) !== wantBase) continue;
    if (num(row?.expiry, 0) !== want) continue;
    if (row.side === SIDE_CALL) call.push(row);
    else if (row.side === SIDE_PUT) put.push(row);
    else tabaee.push(row);
  }
  const key = (r) => r.strike;
  const strikes = new Set([...call.map(key), ...put.map(key)]);
  let paired = 0;
  for (const k of strikes) {
    if (call.some((r) => r.strike === k) && put.some((r) => r.strike === k)) paired += 1;
  }
  return {
    base: wantBase, expiry: want,
    call: call.length, put: put.length, tabaee: tabaee.length,
    total: call.length + put.length,
    strikes: strikes.size, paired, incomplete: strikes.size - paired,
    symbols: { call: call.map((r) => r.symbol).sort(), put: put.map((r) => r.symbol).sort() },
  };
}

/**
 * وضعیت سلامت دفتر — و اینکه چرا «کامل» نیست.
 *
 * ═══ چرا `complete` این‌قدر سخت‌گیر است ═══
 *
 * پیش از این، «اسکن تمام شد» با «دفتر کامل است» یکی گرفته می‌شد. اسکنر
 * فقط روزهای دریافت‌نشده را می‌شمرد و از قراردادی که اصلاً در منبع
 * روزانه نبود خبر نداشت — پس گزارشِ موفقیت می‌داد در حالی که شش قرارداد
 * غایب بودند.
 *
 * حالا هر یک از این‌ها `complete` را پایین می‌آورد، و دلیلش نوشته
 * می‌شود: نسخهٔ قدیمی پرونده، درخواستِ ناموفق، جفتِ ناقص، شناسهٔ ناامن.
 */
export function rosterHealth(file, rows = []) {
  const audit = pairAudit(rows);
  const stats = file?.scan || {};
  const reasons = [];

  const version = num(file?.version, 0);
  if (version < ROSTER_VERSION) {
    reasons.push(`دفتر با نسخهٔ ${version || '؟'} ساخته شده و از کاتالوگ ابزار عبور نکرده؛ قرارداد بی‌معامله داخلش نیست`);
  }
  const failed = num(stats.catalogQueriesFailed, 0) + num(stats.detailQueriesFailed, 0) + num(stats.dayQueriesFailed, 0);
  if (failed > 0) reasons.push(`${failed} درخواست ناموفق`);
  if (audit.incomplete > 0) reasons.push(`${audit.incomplete} جفت ناقص کال/پوت`);
  if (num(stats.unsafeIdentifiers, 0) > 0) reasons.push(`${stats.unsafeIdentifiers} شناسهٔ ناامن کنار گذاشته شد`);
  if (!num(stats.catalogQueriesDone, 0) && version >= ROSTER_VERSION) {
    reasons.push('پاس کاتالوگ ابزار اجرا نشده');
  }

  return {
    complete: reasons.length === 0,
    reasons,
    version,
    groups: audit.groups,
    incompletePairs: audit.incomplete,
    missingPut: audit.missingPut.length,
    missingCall: audit.missingCall.length,
    terms: audit.terms,
    scan: {
      dayQueriesFailed: num(stats.dayQueriesFailed, 0),
      catalogQueriesDone: num(stats.catalogQueriesDone, 0),
      catalogQueriesFailed: num(stats.catalogQueriesFailed, 0),
      detailQueriesDone: num(stats.detailQueriesDone, 0),
      detailQueriesFailed: num(stats.detailQueriesFailed, 0),
      unsafeIdentifiers: num(stats.unsafeIdentifiers, 0),
      noTradeContracts: num(stats.noTradeContracts, 0),
    },
  };
}

/** پروندهٔ دفتر، آمادهٔ نوشتن. */
export function makeRosterFile(rows = [], { scannedFrom = 0, scannedTo = 0, at = 0, intake = null, days = [], scan = null } = {}) {
  const list = mergeRoster([], rows);
  const scanned = [...new Set((Array.isArray(days) ? days : []).map((d) => num(d, 0)).filter((d) => d > 0))].sort((a, b) => a - b);
  return {
    version: ROSTER_VERSION,
    at: num(at, 0),
    scannedFrom: num(scannedFrom, 0) || scanned[0] || 0,
    scannedTo: num(scannedTo, 0) || scanned.at(-1) || 0,
    count: list.length,
    // روزهایی که واقعاً گرفته شدند. بی این، «پوشش» یعنی حدس — و حفرهٔ
    // وسط بازه بی‌صدا کامل به نظر می‌رسید.
    days: scanned,
    intake: intake ? { seen: intake.seen, kept: intake.kept, notOption: intake.notOption, unparsed: intake.unparsed } : null,
    // آمار اسکن، تا «کامل بودن» ادعای اثبات‌پذیر باشد نه حس.
    scan: scan ? { ...scan } : null,
    rows: list,
  };
}
