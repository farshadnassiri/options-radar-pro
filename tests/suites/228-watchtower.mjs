// ۲۲۸. تب دیده‌بان شرطی — از شرط شروع می‌کند، نه از نماد
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «یک تب برای سیستم اعلان بساز که با انتخاب استراتژی و تعریف کردن
// فیلترها و شرط‌ها … با تأیید کاربر اطلاعات کامل و ریز و جامع آن
// استراتژی … را بدهد و شروع به رادار کردن و اعلان فرستادن بکند.»
//
// موتورِ شرط در دستهٔ ۲۲۴ آزمون دارد. این دسته چیز دیگری را نگه می‌دارد:
// اینکه تب واقعاً همان موتور را صدا می‌زند و ترتیبِ سه‌گانه را نمی‌شکند.
//
// ═══ ترتیبی که نباید بشکند ═══
//
//   شرط → تطبیق → تأیید → رصد
//
// اگر «شروع رصد» پیش از دیدنِ فهرستِ منطبق‌ها فعال باشد، کاربر قاعده‌ای
// می‌گذارد که نمی‌داند روی چه چیزی می‌نشیند — و آن قاعده یا هرگز زنگ
// نمی‌زند یا صد بار می‌زند. هر دو یعنی خاموشش می‌کند.

import { check, group, readSrc } from '../harness.mjs';
import { WATCH_METRICS, WATCH_METRIC_GROUPS } from '../../core/watch-rule.mjs';

group('۲۲۸-الف. تب در برنامه ثبت است و جدا از رادار');
{
  const app = readSrc('../ui/app.mjs');
  check('تب «دیده‌بان شرطی» در فهرست تب‌ها هست و ماژول خودش را دارد',
    /id: 'watchtower'[\s\S]{0,200}mod: '\/ui\/tabs\/watchtower\.mjs'/.test(app));
  // کاربر این تب را با واژه‌های خودش می‌جوید — «هشدار»، «اعلان»، «شرط».
  check('با واژه‌های خودِ کاربر پیدا می‌شود، نه فقط با نامش',
    /id: 'watchtower'[\s\S]{0,200}alias: '[^']*هشدار[^']*اعلان[^']*شرط/.test(app));
  check('و از رادار جداست، نه زیرتبی در آن',
    app.includes("id: 'spread-radar'") && app.includes("id: 'watchtower'"));
}

group('۲۲۸-ب. سه گام، و تأییدِ کاربر وسطشان');
{
  const src = readSrc('../ui/tabs/watchtower.mjs');
  check('دکمهٔ «شروع رصد» تا پیش از تطبیق خاموش است',
    src.includes('id="wt-save" disabled'));
  // شرط لازمِ روشن‌شدن: هم شرطی گذاشته شده باشد، هم فهرستِ منطبق‌ها
  // ساخته شده باشد. یکی‌شان کافی نیست.
  check('و فقط با «شرط دارد و منطبقی پیدا شد» روشن می‌شود',
    src.includes("$('wt-save').disabled = !(conditions.length && matched.length && previewFresh);"));
  // ── رگرسیون: پیش‌نمایشِ کهنه، اجازهٔ رصد نمی‌دهد ────────────────────
  //
  // «تغییر شرط یا دامنه، نتیجهٔ پیش‌نمایش را باطل نمی‌کند. ابتدا شرطی
  // ساختم که ۱۰۳ ترکیب داشت. سپس یک شرط ناممکن حداکثر سود ≥ ۱٬۰۰۰٬۰۰۰٪
  // اضافه کردم؛ جدول همچنان همان ۱۰۳ ترکیب را منطبق نشان داد و اجازهٔ
  // شروع رصد داد.»
  check('هر تغییری در شرط یا دامنه، پیش‌نمایش را کهنه می‌کند',
    src.includes('function stalePreview(')
    && src.includes("stalePreview('شرط تازه اضافه شد')")
    && src.includes("stalePreview('شرطی حذف شد')")
    && src.includes("stalePreview('دامنه عوض شد')")
    && src.includes("stalePreview('بازه عوض شد')"));
  check('و فقط «ساخت و تطبیق» دوباره تازه‌اش می‌کند',
    /previewFresh = true;[\s\S]{0,80}paintMatch/.test(src));
  check('ذخیرهٔ قاعده روی پیش‌نمایشِ کهنه رد می‌شود، نه اینکه بی‌صدا انجام شود',
    src.includes("if (!previewFresh) { setStatus('پیش‌نمایش کهنه است"));
  // ── رگرسیون: بن‌بستِ «عبور از آستانه» ──────────────────────────────
  check('پیش‌نمایش، شرطِ «عبور» را مثل «بودن» می‌سنجد تا بن‌بست نشود',
    src.includes('previewCross: true'));
  check('و همان‌جا می‌گوید چه کاری کرده، تا کاربر فکر نکند رصد هم همین‌قدر می‌زند',
    src.includes('در این پیش‌نمایش مثل «آن‌سوی عدد بودن» سنجیده شد'));
  check('پیش از ساخت، سه قید صریح بررسی می‌شوند: نماد، استراتژی، و شرط',
    src.includes('دست‌کم یک نماد پایه انتخاب کن')
    && src.includes('دست‌کم یک استراتژی انتخاب کن')
    && src.includes('دست‌کم یک شرط بگذار'));
  // پیش‌نمایش از `matched` می‌آید نه از `fired` — دیدنِ فهرست نباید زنگ
  // بزند.
  check('فهرستِ پیش‌نمایش از منطبق‌ها می‌آید، نه از آتش‌کرده‌ها',
    src.includes('verdict.matched.get(rule.rule.id)') && !/paintMatch[\s\S]{0,200}deliverWatch/.test(src));
}

group('۲۲۸-ج. چند نماد و چند استراتژی، با هم');
{
  const src = readSrc('../ui/tabs/watchtower.mjs');
  check('نمادها و استراتژی‌ها هر دو چندانتخابی‌اند',
    src.includes('[data-base]:checked') && src.includes('[data-def]:checked'));
  check('و «همه» و «هیچ» برای هر دو هست، چون بیست استراتژی را تک‌تک زدن کار نیست',
    src.includes('data-all="bases"') && src.includes('data-none="defs"'));
  // هر نماد یک دورِ کاملِ دریافت است. موازی‌کردنشان فقط صف را جای دیگری
  // می‌سازد، و توقفِ نیمه‌کاره را هم سخت می‌کند.
  check('نمادها یکی‌یکی ساخته می‌شوند، با امکان توقف',
    /for \(let at = 0; at < bases\.length; at \+= 1\)/.test(src)
    && src.includes('job.signal.aborted'));
  check('نمادی که ردیفی نداد بی‌صدا نمی‌افتد؛ علتش گزارش می‌شود',
    src.includes('skipped.push') && src.includes('نمادهایی که ردیفی ندادند'));
}

group('۲۲۸-د. رصد، و آنچه بی‌صدا نمی‌افتد');
{
  const src = readSrc('../ui/tabs/watchtower.mjs');
  check('رصد از موتور شرط می‌گذرد، نه از سنجشِ دستی',
    src.includes('evaluateWatch({ rules: watchRules'));
  check('و «قبلی» را نگه می‌دارد، وگرنه شرطِ «عبور» هرگز آتش نمی‌کند',
    src.includes('prev: prevSnaps') && src.includes('prevSnaps = verdict.prev'));

  // ── رگرسیون: کلِ دامنه رصد می‌شود، نه منطبق‌های پیش‌نمایش ───────────
  //
  // «فقط ترکیب‌هایی رصد می‌شوند که در پیش‌نمایش اولیه منطبق بوده‌اند.
  // ترکیبی که هنگام ساخت زیر آستانه بوده و ده دقیقه بعد وارد محدودهٔ شرط
  // شود، اصلاً بررسی نمی‌شود. این دقیقاً خلاف هدف پیدا کردن فرصت تازه
  // است.» علتش این یک خط بود: `const pool = matched.length ? matched :
  // built;`
  check('استخرِ رصد، کلِ دامنه است — نه فهرستِ منطبق‌های پیش‌نمایش',
    !src.includes('matched.length ? matched : built')
    && src.includes('for (const { row, ua } of built)'));

  // ── رگرسیون: همهٔ قاعده‌های فعال، نه فقط آخری ───────────────────────
  //
  // «چند قاعده ذخیره می‌شود، اما فقط آخرین قاعده واقعاً رصد می‌شود.»
  check('همهٔ قاعده‌های فعال رصد می‌شوند، نه فقط آخرین ذخیره‌شده',
    src.includes('const activeRules = () => rules.filter((rule) => rule.enabled !== false)')
    && src.includes('watchRules = coverage.watched'));

  // ── رگرسیون: «۸ قاعده» فقط وقتی نوشته می‌شود که هشت‌تا داده داشته باشند
  //
  // «رابط ۸ قاعده نشان داد، ولی حلقه فقط ۱۰۵ ترکیب مربوط به آخرین
  // پیش‌نمایش را دریافت کرد؛ قواعد قبلیِ استراتژی‌های دیگر عملاً بدون
  // داده ماندند.» قاعده ذخیره می‌شود ولی دامنه نه.
  check('پوششِ هر قاعده روی ساختِ فعلی سنجیده می‌شود',
    src.includes('ruleCoverage(active, builtDomain())') && src.includes('function builtDomain()') === false
    && src.includes('const builtDomain = () => ({'));
  check('و قاعده‌ای که در این ساخت ردیفی ندارد، صریح نام برده می‌شود',
    src.includes('function coverageNote(') && src.includes('در این ساخت هیچ ردیفی ندارد و رصد نمی‌شود'));
  check('نوارِ وضعیت «چند از چند» می‌نویسد، نه فقط «چند قاعده»',
    src.includes('قاعده`;') && /\$\{fmt\.int\(coverage\.watched\.length\)\} از \$\{fmt\.int\(active\.length\)\}/.test(src)
    && /\$\{fmt\.int\(watchRules\.length\)\} از \$\{fmt\.int\(activeRules\(\)\.length\)\}/.test(src));
  check('و کارتِ هر قاعده هم می‌گوید رصد می‌شود یا داده ندارد',
    src.includes('در این ساخت داده ندارد'));
  check('راهِ رصدِ همه، یک دکمه است: دامنهٔ اجتماعِ قاعده‌ها',
    src.includes('id="wt-scope-all"') && src.includes('ruleScopeUnion(active)'));
  check('و حذفِ قاعدهٔ فعال، رصد را واقعاً به‌روز می‌کند یا می‌خواباند',
    /data-act="drop"[\s\S]{0,700}if \(activeRules\(\)\.length\) startWatch\(\);[\s\S]{0,60}else \{ stopWatch\(\)/.test(src));

  // ── رگرسیون: توقف، و درخواست‌هایی که روی هم می‌افتند ────────────────
  //
  // «رصد را هنگام یک پاسخ ۱۵ ثانیه‌ای متوقف کردم؛ پس از رسیدن پاسخ،
  // وضعیت دوباره به روشن تغییر کرد» و «تیک هر ۱۰ ثانیه اجرا می‌شود، ولی
  // قفل در حال دریافت یا لغو درخواست قبلی وجود ندارد.»
  check('توقف، نسلِ رصد را عوض می‌کند و درخواستِ جاری را لغو',
    src.includes('watchGen += 1') && src.includes('watchJob?.abort()')
    && src.includes('signal: job.signal'));
  check('و پاسخِ نسلِ خاموش‌شده نه نوار را عوض می‌کند نه جدول را',
    src.includes('if (gen !== watchGen || !mounted) return;'));
  check('تیکِ تازه روی پاسخِ نیامده سوار نمی‌شود',
    src.includes('if (watchBusy) return;') && src.includes('watchBusy = true'));

  // ── رگرسیون: «زنده» یعنی پاهای هم‌زمانِ قیمت‌دار ────────────────────
  //
  // «منبع زنده آخرین معاملهٔ هر پا است، نه قیمت قابل اجرا. زمان معاملهٔ
  // پاها کنترل نمی‌شود … دو پا ممکن است در ساعت‌های متفاوت معامله شده
  // باشند، ولی ترکیب زنده معرفی شود.»
  check('ترکیبِ بی‌قیمتِ زنده یا با پاهای ناهم‌زمان، با عددِ روزانه سنجیده نمی‌شود',
    src.includes('comboLiveQuote({ legs: row.legs, book, nowSec })')
    && src.includes('if (!quote.ok) {'));
  check('و شمارِ پوشش‌داده‌شده و کنارگذاشته‌شده نوشته می‌شود، تا سقفِ سهمیه بی‌صدا نماند',
    src.includes('مظنهٔ هم‌زمان') && src.includes('ترکیب کنار گذاشته شد')
    && src.includes('ترکیب دارای عددِ زنده'));

  // ── رگرسیون: برچسبِ «زنده» فقط برای ردیفِ زنده ──────────────────────
  //
  // «در یک آزمون ۲۴۴ ترکیب در دامنه بود و فقط ۲۲۸ ترکیب پوشش زنده داشت،
  // ولی جدول کل دامنه را با `live: true` نمایش می‌دهد.»
  check('برچسبِ زنده از خودِ ردیف می‌آید، نه از یک `true` ثابت',
    !src.includes('live: true') && src.includes('live: watchTimer ? liveKeys.has(row.key) : null'));

  // ── رگرسیون: سنجه‌ها هم زنده می‌شوند، نه فقط فاصله ──────────────────
  //
  // «سود، زیان و بازده با قیمت زنده دوباره محاسبه نمی‌شوند … فاصله از
  // ۱٬۱۲۴ به ۲٬۲۴۸ رسید، اما حداکثر سود ٪ همچنان ۴۲۷٫۴۹٪ باقی ماند.»
  check('سود، زیان، بازده و وجه تضمین هم با قیمتِ زنده از نو ساخته می‌شوند',
    src.includes('comboMetrics({ legs: row.legs, prices, spot, rowByIns: {},'));
  check('و اسپاتِ زنده مبنای وجه تضمین می‌شود، نه اسپاتِ روز سنجش',
    src.includes('const spot = Number.isFinite(livedBase) && livedBase > 0 ? livedBase : (row.daily?.spot ?? row.spot);'));
  check('قیمتِ زندهٔ پایه به عکسِ شرط می‌رسد، تا شرطِ «قیمت نماد پایه» کار کند',
    src.includes('basePrice: livedBase,') && src.includes('const basePriceOf = (ins) =>'));
  check('«کف/سقف امروز» از دفترِ مشاهده‌های امروز می‌آید، نه از سریِ تاریخی',
    src.includes('day: dayRange.get(row.key)') && src.includes('dayRange.observe(row.key'));

  // ── رگرسیون: رصدِ زنده روی بازهٔ گذشته ──────────────────────────────
  check('رصد روی ساختِ یک بازهٔ گذشته روشن نمی‌شود',
    src.includes('function watchDayGate()') && src.includes('روی بازهٔ تاریخی روشن نمی‌شود'));
  // «دروازهٔ بازهٔ تاریخی فقط هنگام شروع بررسی می‌شود» — بازه می‌تواند
  // وسطِ رصد عوض شود.
  check('و دروازه در هر تیک سنجیده می‌شود، نه فقط در شروع',
    /async function pollWatch\(\)[\s\S]{0,900}const dayGate = watchDayGate\(\);[\s\S]{0,120}stopWatch\(\);/.test(src));
  // «تغییر بازه هنگام روشن‌بودن دیده‌بان، رصد را متوقف نمی‌کند … وضعیت
  // همچنان روشن · ۵ قاعده · ۲۸۰ ترکیب باقی ماند و دامنهٔ قبلی رصد شد.»
  check('و هر تغییرِ دامنه یا بازه، رصدِ روشن را می‌خواباند',
    /function stalePreview\([\s\S]{0,900}if \(watchTimer\) \{\n      stopWatch\(\);/.test(src));

  // ── رگرسیون: نماد پایه در سهمیهٔ زنده ───────────────────────────────
  //
  // «دیده‌بان نماد پایه را در سهمیهٔ live-trades رزرو نمی‌کند … شرط
  // ترکیبیِ پرشدگی ≥ ۳۰٪ و قیمت پایه ≥ ۰ … پس از شروع رصد هیچ نتیجه‌ای
  // به شمار زنده اضافه نکرد.»
  check('نمادهای پایه در سهمیهٔ زنده رزرو می‌شوند',
    src.includes('reserve, score: priorityScore()')
    && src.includes('Math.max(1, Math.floor(LIVE_INS_CAP / 3))'));
  check('و شمارِ نمادهای پایهٔ زنده‌شده نوشته می‌شود',
    src.includes('خانه از سهمیه برای نمادهای پایه رزرو شد'));

  // ── رگرسیون: «ترتیب جدول» یعنی ترتیبِ دیده‌شدهٔ جدول ────────────────
  check('اولویتِ «ترتیب جدول» از ترتیبِ واقعیِ جدول می‌آید، نه از ترتیب ساخت',
    src.includes('function priorityScore()') && src.includes('listedOrderScore(table.get())'));

  // ── رگرسیون: قیمت پایه در ستون جدول هم زنده است ────────────────────
  check('ستونِ قیمت نماد پایه هم عددِ زنده می‌گیرد، نه عددِ روز سنجش',
    src.includes('row.spot = spot;') && src.includes('row.spot = row.daily.spot;'));

  check('آتش‌کردن، شمارندهٔ قاعده را ذخیره می‌کند تا آرامش پس از بازخوانی هم کار کند',
    src.includes('watchRules = verdict.rules') && src.includes('saveRules(rules)'));
  check('موجِ بزرگ همه‌اش در دفترچه می‌ماند و صفحه را نمی‌بلعد',
    src.includes("deliverBurst(verdict.fired, { host: $('wt-alarm-host'), scope: 'watch', kind: 'watch' })"));
  check('و دفترچهٔ دیده‌بان از دفترچهٔ رادار جداست',
    src.includes("readLog('watch')") && src.includes("clearLog('watch')"));
  check('و خروج از تب، حلقهٔ رصد را می‌بندد',
    /return \(\) => \{[\s\S]{0,160}stopWatch\(\)/.test(src));
}

group('۲۲۸-ه. فهرست سنجه‌ها، کامل و دسته‌بندی‌شده');
{
  const src = readSrc('../ui/tabs/watchtower.mjs');
  check('سنجه‌ها از موتور می‌آیند، نه از فهرستی دستی در رابط',
    src.includes('WATCH_METRICS.filter((row) => row.group === groupName)')
    && src.includes('WATCH_METRIC_GROUPS.map'));
  // «آیتم‌های کامل و قابل انتخاب» — چهار خانواده، تا کاربر شرطِ سود و
  // زیان و نقدشوندگی و سربه‌سری را جدا پیدا کند.
  check('چهار خانوادهٔ سنجه هست و هر خانواده دست‌کم دو سنجه دارد',
    WATCH_METRIC_GROUPS.length === 4
    && WATCH_METRIC_GROUPS.every((one) => WATCH_METRICS.filter((row) => row.group === one).length >= 2),
    WATCH_METRIC_GROUPS.join('، '));
  check('پنجرهٔ روز فقط وقتی مرجع نسبی است دیده می‌شود',
    src.includes("$('wt-window-wrap').hidden = !ref.window;"));
  // جدولِ نتیجه همان ستون‌های رادار را دارد — «اطلاعات کامل و ریز و
  // جامع» یعنی همان چیزی که در رادار هست، نه نسخهٔ خلاصه‌شده.
  check('جدولِ منطبق‌ها همان قرارداد ستونیِ رادار را می‌گیرد',
    src.includes('RADAR_ALL_COLS') && src.includes('toTableRow'));
  check('و خالی‌بودنش دلیلش را می‌گوید: شرط‌ها با «و» جمع می‌شوند',
    src.includes('شرط‌ها با «و» جمع می‌شوند'));
}
