// ۲۱۰. بازهٔ تحلیل — قرارداد منقضی در محاسبات، هر جا تاریخ گرفته می‌شود

import { check, group, readSrc } from '../harness.mjs';
import {
  DEFAULT_PRESET, RANGE_PRESETS, buildLine, calendarDays, presetRange, rangeLabel, todayCompact,
} from '../../core/history-range.mjs';
import { makeRosterFile, missingDays, rosterCovers } from '../../core/option-roster.mjs';

group('۲۱۰-الف. بازه‌های آماده');
{
  check('پنج بازه، با «دلخواه» در آخر',
    RANGE_PRESETS.length === 5 && RANGE_PRESETS.at(-1).id === 'custom' && RANGE_PRESETS.at(-1).days === 0);
  check('پیش‌فرض یک سال است', DEFAULT_PRESET === 'y1' && RANGE_PRESETS.find((r) => r.id === 'y1').days === 365);

  const y1 = presetRange('y1', 20260829);
  check('بازهٔ یک‌ساله درست عقب می‌رود', y1.to === 20260829 && y1.from === 20250829, JSON.stringify(y1));
  const y2 = presetRange('y2', 20260829);
  check('بازهٔ دوساله بلندتر از یک‌ساله است', y2.from < y1.from, JSON.stringify(y2));
  check('شناسهٔ ناشناخته به پیش‌فرض برمی‌گردد',
    JSON.stringify(presetRange('چرند', 20260829)) === JSON.stringify(y1));
  check('«دلخواه» بازهٔ ساختگی نمی‌سازد',
    presetRange('custom', 20260829).from === 20260829);
  check('امروز هشت رقم میلادی است', /^\d{8}$/.test(String(todayCompact())));

  const days = calendarDays(20260201, 20260205);
  check('روزهای تقویم پیوسته‌اند', days.join(',') === '20260201,20260202,20260203,20260204,20260205', days.join(','));
  check('مرز ماه درست رد می‌شود', calendarDays(20260227, 20260302).length === 4);
  check('برچسب بازه جلالی و با رقم فارسی است',
    /^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2} تا [۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/.test(rangeLabel(y1)), rangeLabel(y1));
}

group('۲۱۰-ب. جملهٔ پیشرفتِ ساخت');
{
  check('چیزی در جریان نیست، جمله‌ای هم نیست', buildLine(null) === '' && buildLine({ running: false, missing: 0 }) === '');
  const busy = buildLine({ running: true, stage: 'day', stageDone: 30, stageTotal: 120, done: 30, total: 120, added: 900, failed: 0 });
  check('حین ساخت، درصد و شمار قرارداد گفته می‌شود',
    /۳۰/.test(busy) && /۱۲۰/.test(busy) && /۲۵٪/.test(busy) && /۹۰۰/.test(busy), busy);

  // ── شمارنده از مرحلهٔ جاری می‌آید، نه از شمارندهٔ روزها ──────────────
  //
  // نسخهٔ اول همیشه روزها را می‌شمرد. در مرحلهٔ جست‌وجو نتیجه‌اش این شد:
  // «۰ از ۰ روز (۰٪) · ۱۴۹ روز نیامد» — عددی که هیچ‌کدامش راست نبود.
  const catalog = buildLine({ running: true, stage: 'catalog', stageDone: 67, stageTotal: 288, done: 0, total: 0, failed: 67 });
  check('مرحلهٔ جست‌وجو با شمارندهٔ خودش گزارش می‌شود',
    /جست‌وجوی قراردادها/.test(catalog) && /۶۷/.test(catalog) && /۲۸۸/.test(catalog), catalog);
  check('و شکستِ جست‌وجو «روز نیامد» نامیده نمی‌شود',
    !/روز نیامد/.test(catalog) && /درخواست ناموفق/.test(catalog), catalog);
  check('مرحلهٔ مشخصات هم نام خودش را دارد',
    /مشخصات قراردادها/.test(buildLine({ running: true, stage: 'detail', stageDone: 3, stageTotal: 6 })));
  // سری‌ای که پس از جست‌وجوی تکمیلی هم یک‌طرفه مانده، سکوت نمی‌گیرد:
  // کاربر باید بداند چرا استراتژی دوسمته روی آن ساخته نمی‌شود.
  check('سری یک‌طرفهٔ باقی‌مانده گزارش می‌شود',
    /سری/.test(buildLine({ running: false, failed: 0, missing: 0, incompletePairs: 12 })));
  // «تمام شد ولی نیامد» با «در جریان» یکی نیست و نباید مثل هم دیده شود:
  // اولی یعنی منتظر نمان، دومی یعنی صبر کن.
  const failed = buildLine({ running: false, failed: 5, missing: 5, lastError: 'HTTP 403' });
  check('روزِ نیامده جدا از روزِ در جریان گزارش می‌شود',
    /۵/.test(failed) && /403/.test(failed) && !/در جریان/.test(failed), failed);
  check('روزِ نبودهٔ بی‌خطا هم گفته می‌شود', /هنوز در دفتر نیست/.test(buildLine({ running: false, missing: 7 })));
  check('هیچ رقم لاتینی در جمله نمی‌ماند جز متن خطا', !/\d/.test(busy));

  // ── دو عددِ کنار هم در متن راست‌به‌چپ ────────────────────────────────
  //
  // این را فقط عکسِ صفحه نشان داد: «(۵۰٪) · ۱ روز نیامد» روی صفحه
  // «۱۰ روز نیامد» خوانده می‌شد. الگوریتم دوسویه دو گروه رقمیِ همسایه را
  // یکی می‌کند، و عددِ غلط در جملهٔ وضعیت بدتر از نبودنش است.
  check('هر گروه عددی جدا ایزوله می‌شود تا با همسایه‌اش یکی نشود',
    (busy.match(/\u2068/g) || []).length >= 3 && (busy.match(/\u2069/g) || []).length >= 3,
    JSON.stringify(busy));
  check('جملهٔ روزِ نیامده هم ایزوله دارد', /\u2068/.test(failed));
}

group('۲۱۰-ج. پوشش صریح روز');
{
  // «بین اولین و آخرین قرارداد» پوشش نیست: قراردادی که مهر دیده شده ممکن
  // است اسفند سررسید شود، و آن‌وقت بازهٔ ظاهری تا اسفند کش می‌آید در حالی
  // که آبان تا بهمن هرگز اسکن نشده.
  const scanned = { days: [20250101, 20250102, 20250105], scannedFrom: 20250101, scannedTo: 20250105 };
  check('روزِ اسکن‌شده پوشش دارد', rosterCovers(scanned, 20250102) === true);
  check('روزِ نبوده، حتی وسط بازه، پوشش ندارد', rosterCovers(scanned, 20250103) === false);
  check('بی‌تاریخ، پوشش ادعا نمی‌شود', rosterCovers(scanned, 0) === false);

  // فهرستی که یک‌جا وارد شده روزِ جدا ندارد؛ آنجا بازه معتبر است.
  const imported = { days: [], scannedFrom: 20240901, scannedTo: 20260829 };
  check('فهرست وارد‌شده، کلِ بازه‌اش را پوشش می‌دهد',
    rosterCovers(imported, 20250615) === true && rosterCovers(imported, 20240101) === false);

  check('روزهای نبوده جدا می‌شوند',
    missingDays(scanned, [20250101, 20250103, 20250105, 20250106]).join(',') === '20250103,20250106');
  check('دفترِ نبوده یعنی همهٔ روزها نبوده', missingDays(null, [20250101, 20250102]).length === 2);

  const file = makeRosterFile([], { days: [20250105, 20250101, 20250101] });
  check('روزهای پرونده مرتب و بی‌تکرارند', file.days.join(',') === '20250101,20250105');
  check('بازهٔ اسکن از روزها درمی‌آید وقتی داده نشده',
    file.scannedFrom === 20250101 && file.scannedTo === 20250105);
}

group('۲۱۰-د. سرور: بازه، ساخت خودکار، و پوششی که کوچک نمی‌شود');
{
  const src = readSrc('../server/server.mjs');
  const universe = src.slice(src.indexOf("p === '/api/history/universe'"), src.indexOf("p === '/api/stream'"));

  check('نقطهٔ پایانی بازه می‌گیرد', /const rFrom = u\.searchParams\.get\('from'\)/.test(universe));
  check('بازهٔ وارونه رد می‌شود', /پایان بازه پیش از آغاز آن است/.test(universe));
  check('اجتماع بازه ساخته می‌شود، نه فهرست یک روز', /rosterRangeUniverse\(/.test(src));
  check('هر ردیف عمر خودش را حمل می‌کند',
    /activeFrom: Math\.min/.test(src) && /activeTo: Math\.max/.test(src) && /expiresInside: alive\.some/.test(src));
  check('شمار سررسیدشدهٔ داخل بازه در پاسخ هست', /summary: built\.summary/.test(universe));

  // ── ساخت خودکار ─────────────────────────────────────────────────────
  //
  // نسخهٔ اول ساختِ دفتر را به دستور ترمینال سپرده بود و کاربر اجرایش
  // نکرد؛ برایش «کار نمی‌کرد». ابزاری که برای کار کردن به یک مرحلهٔ دستی
  // نیاز دارد، برای کاربر خراب است.
  check('روزهای نبوده در پس‌زمینه گرفته می‌شوند',
    /rosterNeedsBuild\(file, missing\.length\)/.test(universe) && /buildRoster\(rFrom, rTo\)/.test(universe));
  // ── محرکِ ساخت فقط «روزِ نبوده» نیست ────────────────────────────────
  //
  // قراردادِ بی‌معامله در **هیچ** روزی نبوده، پس «همهٔ روزها را داریم»
  // یعنی «همهٔ معامله‌ها را داریم»، نه «همهٔ قراردادها را». بی این شرط،
  // دفتری که همهٔ روزهایش را دارد هرگز پاس کاتالوگ نمی‌رفت و برای همیشه
  // ناقص می‌ماند.
  const trigger = src.slice(src.indexOf('function rosterNeedsBuild'), src.indexOf('async function buildRoster'));
  check('نبودِ پاس کاتالوگ هم ساخت را راه می‌اندازد',
    /catalogQueriesDone/.test(trigger) && /missingCount > 0/.test(trigger));
  // «هنوز جفت ناقص داریم» محرک نیست: سازنده در همان اجرا یک پاس دوم
  // می‌زند، و اگر این محرک بود هر درخواستِ رابط یک اسکن کامل راه
  // می‌انداخت و بالادست را تا ابد می‌کوبید.
  check('جفتِ ناقص محرکِ اسکنِ دوباره نیست', !/incompletePairs/.test(trigger));
  check('و شکستِ اخیر بلافاصله تکرار نمی‌شود', /COOLDOWN/.test(trigger) || /COOLDOWN/.test(src));
  // دو بار این ادعا لنگر اشتباه داشت: اول کلِ نقطهٔ پایانی برش خورد و
  // نخستین `return sendJson` خطای تاریخِ بدشکل بود؛ بعد همان خطا داخل
  // خودِ شاخه هم پیدا شد. لنگر درست، پاسخِ **موفق** است — چون ادعا
  // دربارهٔ اوست: پاسخ موفق نباید پشت اسکن بماند.
  const branch = universe.slice(universe.indexOf('if (rFrom && rTo) {'), universe.indexOf("const wanted = u.searchParams.get('date')"));
  check('درخواست منتظر پایان اسکن نمی‌ماند — پاسخ همان لحظه می‌رود',
    branch.includes('buildRoster(rFrom, rTo)')
    && branch.indexOf('buildRoster(rFrom, rTo)') < branch.indexOf('sendJson(res, 200')
    && !/await buildRoster\(rFrom, rTo\)/.test(branch));
  check('یک اسکن هم‌زمان، نه بیشتر', /if \(rosterBuild\.running\) return rosterBuild;/.test(src));
  check('اسکن پس‌زمینه اولویت پایین دارد و جلوی داده زنده را نمی‌گیرد',
    /ROSTER_SCAN_PRIORITY = 9/.test(src));
  // ترتیبِ دو خط کافی نیست: می‌شود `scanned.push` را داخل `catch` هم
  // بالاتر از شمارندهٔ خطا گذاشت و ادعا همچنان سبز بماند — یک جهش دقیقاً
  // همین کار را کرد. آنچه واقعاً مهم است این است که روزِ **نیامده** هرگز
  // پوشش‌دار حساب نشود، یعنی افزودنش فقط در شاخهٔ موفق باشد.
  // حلقهٔ اسکن به `core/roster-build.mjs` رفت، چون سرور و ابزار هر دو
  // همان را اجرا می‌کنند. ادعا هم با آن رفت — رفتارش را دستهٔ ۲۱۱ روی
  // شبکهٔ ساختگی می‌سنجد؛ اینجا فقط ساختارش قفل می‌شود.
  const builder210 = readSrc('../core/roster-build.mjs');
  const loop = builder210.slice(builder210.indexOf('for (const day of days) {'), builder210.indexOf("onProgress({ stage: 'day'"));
  const tryPart = loop.slice(loop.indexOf('try {'), loop.indexOf('} catch (e) {'));
  const catchPart = loop.slice(loop.indexOf('} catch (e) {'));
  check('روزِ اسکن‌شده فقط در شاخهٔ موفق پوشش‌دار می‌شود',
    tryPart.includes('scanned.push(day)') && !catchPart.includes('scanned.push(day)'));
  check('و روزِ نیامده شمرده می‌شود، نه بی‌صدا رد', /stats\.dayQueriesFailed \+= 1/.test(catchPart));
  check('سرور همان سازندهٔ مشترک را اجرا می‌کند، نه حلقهٔ خودش',
    /runRosterBuild\(\{/.test(src) && !/for \(const day of want\)/.test(src));
  check('پیشرفت همراه پاسخ می‌آید', /build: buildStatus\(/.test(universe));

  // ── پوشش هرگز کوچک نمی‌شود ──────────────────────────────────────────
  //
  // یک اجرای واقعی این را نشان داد: اسکنی که هر پنج روزش شکست خورد،
  // پروندهٔ سالمِ دو ساله را با بازهٔ صفر بازنویسی کرد و از آن به بعد هر
  // بازه ناقص گزارش می‌شد — بی‌هیچ خطایی.
  // ── اجرای شکست‌خورده، کارِ درستِ اجرای قبلی را پاک نمی‌کند ──────────
  //
  // اگر هیچ جست‌وجوی کاتالوگی موفق نبوده، آن اجرا فقط می‌تواند از دفتر
  // کم کند. نوشتنش یعنی از دست دادن دفتری که کامل بود — و بدتر، بی‌هیچ
  // خطایی.
  check('اسکنِ کاملاً ناموفق، دفتر موجود را بازنویسی نمی‌کند',
    /const wipe = result\.stats\.catalogQueriesDone === 0/.test(src)
    && /result\.stats\.catalogQueriesFailed > 0/.test(src)
    && /rosterCache\.rows\.length > 0/.test(src)
    && /if \(!wipe\) \{/.test(src));
  check('و دلیلش در وضعیت ساخت نوشته می‌شود',
    /دفتر دست‌نخورده ماند/.test(src));

  const writer = src.slice(src.indexOf('async function writeRoster'), src.indexOf('async function buildRoster'));
  check('بازهٔ پیشین با تازه یکی می‌شود، نه جایگزین',
    /Math\.min\(\.\.\.lo\)/.test(writer) && /Math\.max\(\.\.\.hi\)/.test(writer));
  check('و مقدار صفر وارد محاسبهٔ بازه نمی‌شود', /\.filter\(\(v\) => v > 0\)/.test(writer));
}

group('۲۱۰-ه. هر تبِ تاریخ‌دار از همان بازه می‌خواند');
{
  // پنج تب، یک قاعده. اگر هرکدام نسخهٔ خودش را می‌داشت، روزی یکی‌شان عقب
  // می‌ماند و همان تب بی‌صدا به سوگیری بقا برمی‌گشت.
  for (const [file, host] of [
    ['../ui/tabs/portfolio-backtest.mjs', 'pb-range'],
    ['../ui/tabs/backtest.mjs', 'bt-range'],
    ['../ui/tabs/history.mjs', 'h-range'],
    ['../ui/tabs/open-view.mjs', 'ov-range'],
    ['../ui/tabs/greeks-watch.mjs', 'gw-range'],
  ]) {
    const src = readSrc(file);
    const name = file.split('/').pop();
    check(`${name} کنترل مشترک بازه را سوار می‌کند`,
      /import \{ loadRange, mountHistoryRange \} from '\/ui\/history-range\.mjs'/.test(src)
      && src.includes(`mountHistoryRange($('${host}')`)
      && src.includes(`id="${host}"`));
    check(`${name} دیگر فهرست بی‌تاریخِ امروز را نمی‌گیرد`,
      !/fetch\('\/api\/history\/universe'\)/.test(src));
    check(`${name} شمار سررسیدشدهٔ بازه را به کاربر می‌گوید`,
      /expiredInside/.test(src) && /سررسید شده‌اند/.test(src));
    check(`${name} انتخاب نماد کاربر را با عوض شدن بازه نگه می‌دارد`,
      /if \(keep && chain\.has\(keep\)\) /.test(src));
  }

  // ── حلقهٔ پس‌زمینه نباید رابط را قفل کند ─────────────────────────────
  //
  // نسخهٔ اول تا پایان ساختِ دفتر منتظر می‌ماند و فهرست نماد روی «در حال
  // دریافت…» می‌خشکید — برای کاربر دقیقاً همان «کار نمی‌کند».
  const range = readSrc('../ui/history-range.mjs');
  check('نخستین پاسخ بی‌انتظار برمی‌گردد', /return \{ first, stop\(\) \{ stopped = true; \} \};/.test(range));
  check('تازه‌شدن در پس‌زمینه است، نه در مسیر اصلی',
    /onUpdate\(next\)/.test(range) && /if \(\(next\.count \|\| 0\) > \(payload\.count \|\| 0\)\)/.test(range));
  check('بستن تب حلقه را می‌ایستاند',
    /rangeJob\?\.stop\(\)/.test(readSrc('../ui/tabs/portfolio-backtest.mjs')));
  check('حلقه سقف دارد و تا ابد نمی‌پرسد', /n < tries && !stopped/.test(range));
}
