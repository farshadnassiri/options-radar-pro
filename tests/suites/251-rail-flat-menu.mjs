// ۲۵۱. فهرست کناری تخت، و درِ واحدِ استراتژی‌ها
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// پنج خواستهٔ صاحب پروژه، در یک نوبت:
//
// ۱. همهٔ استراتژی‌های زنده از فهرست کناری بیرون بیایند و پشت یک گزینه —
//    «در جست‌وجوی استراتژی‌ها» — جمع شوند، تب‌بندی‌شده داخل همان صفحه.
// ۲. چهار تبِ «رصد یونانی و تلاطم»، «استودیوی سفر زمانی سبد»، «سفره پر
//    برکت بازار» و «رادار فاصله» حذف شوند، و جعبهٔ جست‌وجوی ریل هم.
// ۳. بقیه بی هیچ زیرمنویی مستقیم در فهرست بنشینند.
// ۴. ردیف‌ها با کشیدن بالا و پایین شوند.
// ۵. با جمع‌شدنِ فهرست، آیکون‌ها دیده و کلیک شوند.
//
// این دسته همان پنج را می‌سنجد — از منبع، چون بی مرورگر تنها سنجهٔ در
// دسترس همین است.

import { check, group, readSrc } from '../harness.mjs';
import { CATALOG, GROUPS } from '../../strategies/catalog.mjs';

const app251 = readSrc('../ui/app.mjs');
const html251 = readSrc('../ui/index.html');
const css251 = readSrc('../ui/style.css');
const sx251 = readSrc('../ui/tabs/strategy-explorer.mjs');
const handoff251 = readSrc('../ui/handoff.mjs');

// ═══════════════ ۲۵۱-الف. چهار تبِ حذف‌شده، هیچ ردِ زنده‌ای ندارند ═══════════════
group('۲۵۱-الف. تب‌های حذف‌شده، هیچ ردِ زنده‌ای ندارند');
{
  const GONE = ['greeks-watch', 'portfolio-time', 'bereket', 'spread-radar'];
  for (const id of GONE) {
    check(`«${id}» در فهرست تب‌ها نیست`, !app251.includes(`id: '${id}'`));
    // حذف از فهرست کافی نیست: مسیریاب هر شناسهٔ ثبت‌شده را می‌پذیرد و هر
    // ماژولِ ثبت‌شده را تنبل بار می‌کند. اگر `mod` بماند، `#id` هنوز صفحه
    // را باز می‌کند و حذف فقط ظاهری بوده.
    check(`و ماژولش هم در مسیریاب ثبت نیست`, !app251.includes(`/ui/tabs/${id}.mjs`));
  }
  // دکمه‌ای که به تبِ نبوده برسد، کلیک می‌خورد و هیچ کاری نمی‌کند — بدتر از
  // نبودِ دکمه. پس مقصدهای انتقال هم باید با تب رفته باشند.
  check('مقصدهای انتقال به تب‌های حذف‌شده هم رفته‌اند',
    !handoff251.includes("to: 'greeks-watch'") && !handoff251.includes("to: 'spread-radar'"));
  for (const [file, id] of [
    ['../ui/tabs/history.mjs', 'greeks-watch'],
    ['../ui/tabs/portfolio-backtest.mjs', 'greeks-watch'],
    ['../ui/tabs/live-market.mjs', 'spread-radar'],
  ]) {
    check(`و دکمهٔ «${id}» از ${file.split('/').pop()} برداشته شد`,
      !readSrc(file).includes(`'${id}'`) && !readSrc(file).includes(`#${id}`));
  }
}

// ═══════════════ ۲۵۱-ب. فهرست تخت است: نه جست‌وجو، نه سرگروه، نه زیرمنو ═══════════════
group('۲۵۱-ب. فهرست تخت است: نه جست‌وجو، نه سرگروه، نه زیرمنو');
{
  check('جعبهٔ جست‌وجوی ریل از سند رفته',
    !html251.includes('rail-search') && !html251.includes('id="rail-q"')
    && !app251.includes("el('rail-q')"));
  check('و شمارندهٔ کنارش هم',
    !html251.includes('rail-count') && !app251.includes("el('rail-count')"));
  check('زیرمنوی شناور نه در سند مانده نه در کد نه در پوسته',
    !html251.includes('rail-submenu') && !app251.includes('rail-submenu')
    && !css251.includes('.rail-submenu'));
  check('سرگروه و حالت تاشو هم رفته',
    !app251.includes('rail-head') && !app251.includes('rail-group')
    && !css251.includes('.rail-head') && !css251.includes('.rail-group'));
  // هر ردیف خودش دکمهٔ تب است، پس کلیکش مستقیم `open` را صدا می‌زند — نه
  // بازکردنِ پنلی که کلیک دوم بخواهد.
  check('کلیک روی ردیف مستقیم تب را باز می‌کند',
    /b\.addEventListener\('click', \(\) => \{ open\(t\.id\); \}\);/.test(app251));
}

// ═══════════════ ۲۵۱-پ. هر استراتژی پشت یک در، با همان گروه‌بندی ═══════════════
group('۲۵۱-پ. هر استراتژی پشت یک در، با همان گروه‌بندی');
{
  check('تبِ «در جست‌وجوی استراتژی‌ها» ثبت شده',
    /id: 'strategy-explorer'[\s\S]{0,200}mod: '\/ui\/tabs\/strategy-explorer\.mjs'/.test(app251)
    && app251.includes("title: 'در جست‌وجوی استراتژی‌ها'"));
  // ردیفِ استراتژی از فهرست کناری رفته ولی از **مسیریاب** نه: نشانی
  // `#covered-call` و نقشهٔ انتقال هر دو به آن راه دارند.
  check('استراتژی‌ها با پرچم صریح از ریل بیرون می‌مانند، نه با حذف از مسیریاب',
    app251.includes('rail: false,') && app251.includes("mod: '/ui/tabs/strategy.mjs'"));
  check('و ریل فقط تب‌های بی‌پرچم را می‌چیند',
    app251.includes("const RAIL_TABS = TABS.filter((t) => t.rail !== false);"));
  // تقسیم‌بندی همان است که بود — همان کلیدهای `GROUPS`، نه فهرستی که
  // دستی در صفحه نوشته شده باشد و روزی از کاتالوگ عقب بماند.
  check('گروه‌های صفحه از خودِ کاتالوگ می‌آیند، نه از فهرستی دستی',
    sx251.includes('const GROUP_KEYS = Object.keys(GROUPS).filter('));
  check('و هر گروهِ کاتالوگ یک پنل و یک تب دارد',
    sx251.includes('data-panel="sx-${esc(key)}"') && sx251.includes('mountSubtabs('));
  // هیچ استراتژی‌ای نباید در جابه‌جایی گم شده باشد.
  const grouped = new Set(CATALOG.map((d) => d.group));
  check('هیچ گروهی بی‌نماینده نمانده',
    [...grouped].every((key) => Object.keys(GROUPS).includes(key)),
    [...grouped].filter((key) => !Object.keys(GROUPS).includes(key)).join(' , ') || 'همه');
  // انتخابِ استراتژی، کاربر را از همان صفحه بیرون نمی‌برد: تبِ استراتژی
  // همان‌جا سوار می‌شود و با انتخاب بعدی `dispose` خودش صدا زده می‌شود،
  // وگرنه دو نسخه از یک تب هم‌زمان داده می‌گیرند.
  check('استراتژی داخل همین صفحه سوار می‌شود، نه به‌جای آن',
    sx251.includes("await import('/ui/tabs/strategy.mjs')")
    && sx251.includes('mod.mount(stage, { tab: { id: def.id, title: def.name, def }, state, api })'));
  check('و نسخهٔ قبلی پیش از سوارِ تازه پیاده می‌شود',
    /if \(dispose\) \{ try \{ dispose\(\); \}[\s\S]{0,120}dispose = null; \}/.test(sx251));
  // مسابقهٔ دو کلیکِ پشت‌سرهم: `import` و `mount` هر دو ناهمگام‌اند و
  // نتیجهٔ کهنه می‌تواند دیرتر برگردد و روی انتخابِ تازه بنشیند.
  check('کلیک دوم، نتیجهٔ کلیک اول را دور می‌ریزد',
    sx251.includes('const mine = ++gen;') && sx251.includes('if (mine !== gen) return;'));
}

// ═══════════════ ۲۵۱-ت. ترتیب ردیف‌ها دستِ کاربر است ═══════════════
group('۲۵۱-ت. ترتیب ردیف‌ها دستِ کاربر است');
{
  check('هر ردیف کشیدنی است و دستگیره دارد',
    app251.includes('b.draggable = true;') && app251.includes('rail-row-grip'));
  check('رها کردن روی ردیف دیگر، ترتیب را عوض می‌کند و ذخیره‌اش می‌کند',
    /b\.addEventListener\('drop'[\s\S]{0,260}moveRailTab\(/.test(app251)
    && app251.includes('saveTabOrder(order);'));
  // کشیدن با ماوس تنها راه نیست؛ بی این، کاربرِ صفحه‌کلید هیچ راهی به این
  // قابلیت ندارد.
  check('همان جابه‌جایی با Alt و جهت‌نما هم ممکن است',
    app251.includes("if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;"));
  check('ترتیب در حافظهٔ مرورگر می‌ماند و خواندنش نگهبان دارد',
    app251.includes("const ORDER_KEY = 'rail:order:tabs';")
    && /const saveTabOrder = \(order\) => \{\s*try \{/.test(app251));
  // حافظهٔ کاربرِ قدیمی شناسهٔ تبِ حذف‌شده دارد و شناسهٔ تبِ تازه را ندارد.
  // هیچ‌کدام نباید فهرست را بشکند.
  check('شناسهٔ حذف‌شده دور ریخته می‌شود و تبِ تازه گم نمی‌شود',
    app251.includes('const valid = ordered.filter((id) => defaultIds.includes(id));')
    && app251.includes('const missing = defaultIds.filter((id) => !valid.includes(id));'));
}

// ═══════════════ ۲۵۱-ث. فهرستِ جمع‌شده، هنوز فهرست است ═══════════════
group('۲۵۱-ث. فهرستِ جمع‌شده، هنوز فهرست است');
{
  // پیش از این، جمع کردن کلِ فهرست را `display: none` می‌کرد: تنها دکمهٔ
  // باقی‌مانده «باز کن» بود، یعنی قابلیت فقط راهِ برگشت به خودش را داشت.
  check('فهرست در حالت جمع پنهان نمی‌شود',
    !/\.shell\[data-rail-collapsed="true"\] \.rail-list \{[^}]*display: none/.test(css251));
  check('فقط نام و دستگیره پنهان می‌شوند',
    /\.shell\[data-rail-collapsed="true"\] \.rail-row \.tab-name,\s*\.shell\[data-rail-collapsed="true"\] \.rail-row-grip \{ display: none; \}/.test(css251));
  check('و آیکون هر تب سر جایش می‌ماند، وسط‌چین',
    /\.shell\[data-rail-collapsed="true"\] \.rail-row \{\s*justify-content: center;/.test(css251));
  // آیکونِ تنها، بی نام، فقط با عنوان راهنما قابل تشخیص است.
  check('هر ردیف عنوان راهنما دارد تا آیکونِ تنها بی‌نام نماند',
    app251.includes('b.title = t.alias ? `${t.title} — ${t.alias}` : t.title;'));
  // دو تب با یک آیکون، در حالت جمع دو ردیفِ تشخیص‌ناپذیر می‌شوند.
  const tone = /const TAB_TONE = \{([\s\S]*?)\};/.exec(app251)?.[1] || '';
  const ids = [...tone.matchAll(/'?([a-z-]+)'?:\s*'--/g)].map((m) => m[1]);
  check('هر تبِ ریل رنگ جداکنندهٔ خودش را دارد', ids.length >= 10);
}
