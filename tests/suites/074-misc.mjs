// ۷۳. ادغام تب‌های نگاه کلی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';



// ═════════ ۷۳. ادغام دیده‌بان و برترین موقعیت‌ها در رصد لحظه‌ای ═════════
//
// خواسته کاربر: «تب دیده‌بان و تب برترین موقعیت‌ها را در تب رصد لحظه‌ای
// ادغام کن.» هر سه از یک عکس لحظه‌ای بازار تغذیه می‌شوند و یک کار می‌کنند:
// نگاه کلی پیش از تصمیم. سه نشانی برای یک تصمیم، یعنی کاربر باید بین سه تب
// جابه‌جا شود.
//
// ادغام یعنی یک در ورودی، نه بازنویسی دو تب کارکرده: ماژولشان دست‌نخورده
// می‌ماند و همان‌جا تنبل بار می‌شود — همان الگویی که «نگاه باز» از قبل داشت.
group('۷۳. ادغام تب‌های نگاه کلی');
{
  const app73 = readSrc('../ui/app.mjs'), dash73 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const tabLiteral = /const TABS = \[([\s\S]*?)\n\];/.exec(app73)?.[1] || '';
  check('دیده‌بان و برترین موقعیت‌ها دیگر تب مستقل نیستند',
    !/id: 'chain'/.test(tabLiteral) && !/id: 'top'/.test(tabLiteral));
  check('و رصد لحظه‌ای سر جایش مانده', /id: 'live-market'/.test(tabLiteral));
  check('هر دو به‌صورت حالت داخل همان تب اعلام شده‌اند',
    dash73.includes("{ id: 'chain', title: 'دیده‌بان زنجیره'") && dash73.includes("mod: '/ui/tabs/chain.mjs'")
    && dash73.includes("{ id: 'top', title: 'برترین موقعیت‌ها'") && dash73.includes("mod: '/ui/tabs/top.mjs'"));
  check('ماژول هر دو تنبل بار می‌شود، نه در بارگذاری تب',
    dash73.includes('const module = await import(mode.mod)'));
  // بدون نگه‌داشتن تابع برچیدن، اشتراک دیده‌بان و تایمر اسکنِ تب ادغام‌شده
  // پس از رفتن از این تب زنده می‌ماند و در پس‌زمینه درخواست می‌زند.
  check('تابع برچیدن تب ادغام‌شده نگه داشته و صدا زده می‌شود',
    dash73.includes('embedded.set(mode.id, await module.mount(host, { state, api }))')
    && dash73.includes('for (const dispose of embedded.values())'));
  check('و ادغام‌شده فقط یک بار سوار می‌شود',
    dash73.includes('if (embedded.has(mode.id)) return;'));
  // حالت ادغام‌شده نمای شماره‌دار ندارد؛ کد نباید روی آن بترکد
  check('حالت بدون نما، مسیر نمای شماره‌دار را نمی‌رود',
    dash73.includes('if (mode?.mod) { await mountEmbedded(mode); return; }')
    && dash73.includes('(modeOf()?.views || [])'));
  check('سه حالت تصمیم‌گیری هنوز بیست نما دارند',
    DASHBOARD_VIEW_COUNTS73().every((n) => n === 20), DASHBOARD_VIEW_COUNTS73().join('/'));
  function DASHBOARD_VIEW_COUNTS73() {
    return ['pulseViews', 'liquidityViews', 'volatilityViews'].map((name) =>
      ((new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(dash73)?.[1] || '').match(/^\s*\['/gm) || []).length);
  }
}
