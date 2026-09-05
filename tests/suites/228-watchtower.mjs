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
    src.includes("$('wt-save').disabled = !(conditions.length && matched.length);"));
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
    src.includes('evaluateWatch({ rules: [watchRule]'));
  check('و «قبلی» را نگه می‌دارد، وگرنه شرطِ «عبور» هرگز آتش نمی‌کند',
    src.includes('prev: prevSnaps') && src.includes('prevSnaps = verdict.prev'));
  // سقفِ ۲۴ ابزارِ `/api/live-trades` واقعی است. ترکیبی که پایش جا نشد،
  // با عددِ روزانه سنجیده نمی‌شود — و همین باید دیده شود.
  check('ترکیبِ بی‌قیمتِ زنده با عددِ روزانه سنجیده نمی‌شود',
    src.includes("if (!legs.every((leg) => finite(prices[String(leg.ins)]))) continue;"));
  check('و شمارِ پوشش‌داده‌شده نوشته می‌شود، تا سقفِ ۲۴ بی‌صدا نماند',
    src.includes('ترکیب با قیمت زنده'));
  check('آتش‌کردن، شمارندهٔ قاعده را ذخیره می‌کند تا آرامش پس از بازخوانی هم کار کند',
    src.includes('watchRule = verdict.rules[0]') && src.includes('saveRules(rules)'));
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
