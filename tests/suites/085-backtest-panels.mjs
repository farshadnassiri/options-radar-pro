// ۸۴. تب‌بندی بک‌تست سریع
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { ANALYSIS_PANELS, verdictLines } from '../../ui/backtest-panels.mjs';
import { mountSubtabs } from '../../ui/subtabs.mjs';


// ═════════ ۸۴. تب‌بندی بک‌تست سریع ═════════
//
// خواسته کاربر: «خود تب بک تست سریع را قسمت بندی و تب بندی کن، الان همه چیز
// توی هم قاطی شده… بر اساس کارکرد هر قسمتش… همچنین ۱۰ تا تب دیگه هم خودت
// پیشنهاد بده و بساز، داخلشون انواع نمودارها، جداول، تحلیل حساسیت‌ها.»
group('۸۴. تب‌بندی بک‌تست سریع');
{
  const bt84 = readSrc('../ui/tabs/backtest.mjs');
  const panels84 = readSrc('../ui/backtest-panels.mjs');
  const tabs84 = readSrc('../ui/subtabs.mjs');
  const css84 = readSrc('../ui/style.css');

  check('نوار زیرتب در تب نشسته است', bt84.includes('id="bt-subtabs"') && bt84.includes('mountSubtabs('));
  check('ده پنل تحلیلی تازه ساخته شده', ANALYSIS_PANELS.length === 10, `${ANALYSIS_PANELS.length} پنل`);
  check('پنل تازه شناسهٔ یگانه دارد',
    new Set(ANALYSIS_PANELS.map((p) => p.id)).size === 10);
  check('هر پنل تازه، توضیح خودش را دارد', ANALYSIS_PANELS.every((p) => p.label && p.hint));
  // بخش‌های فعلی هم پنل خودشان را گرفته‌اند: خواستهٔ «بر اساس کارکرد»
  for (const id of ['bt-setup', 'bt-overview', 'bt-daily', 'bt-intraday', 'bt-timeframe', 'bt-iv']) {
    check(`بخش فعلی «${id}» پنل خودش را دارد`, bt84.includes(`data-panel="${id}"`));
  }
  for (const panel of ANALYSIS_PANELS) {
    check(`پنل «${panel.label}» در نشانه‌گذاری هست`, panels84.includes(`data-panel="${panel.id}"`));
  }
  check('هر پنل تحلیلی دست‌کم یک نمودار دارد', (() => {
    const missing = ANALYSIS_PANELS.filter((panel) => {
      const at = panels84.indexOf(`data-panel="${panel.id}"`);
      const next = panels84.indexOf('data-panel="', at + 1);
      const body = panels84.slice(at, next < 0 ? undefined : next);
      return !/chartBox\(/.test(body) && !/bt-gk-charts/.test(body);
    }).map((panel) => panel.label);
    return missing.length === 0 ? true : missing.join('، ');
  })() === true);
  check('«چه مدت در سود» و «رفتار بازه‌های روز» به پنل اثر زمان رفتند',
    panels84.includes('id="bt-tf-holding"') && panels84.includes('id="bt-tf-timeofday"')
    && !bt84.includes('id="bt-tf-holding"'));
  check('پنل‌ها پس از هر اجرا و هر تغییر تایم‌فریم دوباره کشیده می‌شوند',
    (bt84.match(/paintPanels\(\)/g) || []).length >= 4, `${(bt84.match(/paintPanels\(\)/g) || []).length} فراخوان`);
  check('خرابی یک پنل، کل تب را نمی‌خواباند',
    /try \{\s*paintAnalysis\(/.test(bt84) && /logError\(error, 'پنل‌های تحلیلی/.test(bt84));

  // نوار زیرتب: فقط یک پنل باز، و شنوندهٔ تکراری نمی‌سازد
  check('نوار، tablist واقعی است',
    tabs84.includes("role', 'tablist'") && tabs84.includes('role="tab"') && tabs84.includes("'tabpanel'"));
  check('فقط تب فعال در ترتیب صفحه‌کلید می‌ماند', tabs84.includes('button.tabIndex = on ? 0 : -1'));
  check('ساخت دوبارهٔ نوار، شنوندهٔ تکراری نمی‌گذارد',
    tabs84.includes('host.onclick =') && tabs84.includes('host.onkeydown =')
    && !/host\.addEventListener/.test(tabs84));
  check('تب آغازین قابل تعیین است', tabs84.includes('initial') && bt84.includes("initial: 'bt-overview'"));
  check('نوار زیرتب سبک خودش را دارد', css84.includes('.subtabs {') && css84.includes('.subtabs button[aria-selected="true"]'));
  check('شدت خانهٔ شبکهٔ حساسیت از توکن می‌آید، نه رنگ ثابت',
    css84.includes('.heat-up-4') && css84.includes('var(--gain)') && !/\.heat-up-4[^}]*#[0-9a-f]{3}/i.test(css84));

  // حکم پنل الگو نباید بیشتر از عدد ادعا کند
  const pool84 = [{ label: 'الف', family: 'حرکت پایه', sum: -50, count: 3, samples: 3, winPct: 20 }];
  const one = verdictLines(pool84, [], 100).join(' ');
  check('وقتی هیچ دسته‌ای سودده نبوده، «بیشترین سود» گفته نمی‌شود',
    !one.includes('بیشترین سود') && one.includes('کم‌زیان‌ترین'), one.slice(0, 60));
  check('بهترین و بدترینِ یکسان، دو جملهٔ هم‌معنی نمی‌سازد',
    one.includes('تنها یک دسته نمونهٔ کافی داشت'));
  const two = verdictLines([
    { label: 'صعود', family: 'حرکت پایه', sum: 900, count: 4, samples: 4, winPct: 75 },
    { label: 'نزول', family: 'حرکت پایه', sum: -300, count: 3, samples: 3, winPct: 33 },
  ], [{ label: 'حرکت پایه', net: 600, gain: 900, loss: -300 }], 82.5).join(' ');
  check('دستهٔ سودده، «بیشترین سود» می‌گیرد', two.includes('بیشترین سود') && two.includes('صعود'));
  check('پوشش تجزیه همیشه در حکم گفته می‌شود',
    two.includes('پوشش تجزیه') && one.includes('پوشش تجزیه'));
}
