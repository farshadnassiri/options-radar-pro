// ۳۷. سپردن موقعیت به بک‌تست سریع
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { goHandoff } from '../../ui/handoff.mjs';


// ═══════════════════════════ ۳۷. سپردن موقعیت به بک‌تست سریع ═══════════════════════════
group('۳۷. سپردن موقعیت به بک‌تست سریع');
{
  const read37 = (relative) => readSrc(relative);
  const appSource37 = read37('../ui/app.mjs');
  const portfolioSource37 = read37('../ui/tabs/portfolio-backtest.mjs');
  const backtestSource37 = read37('../ui/tabs/backtest.mjs');

  // بدون شنونده `hashchange`، عوض‌کردن hash از داخل یک تب فقط نشانی را عوض
  // می‌کند و هیچ تبی باز نمی‌شود.
  check('پوسته برنامه تغییر hash از داخل تب را به باز کردن تب ترجمه می‌کند',
    appSource37.includes("window.addEventListener('hashchange'")
    && appSource37.includes('goRoute(routeFromHash(location.hash))')
    && appSource37.includes('if (route.id !== current) open(route.id);'));
  check('جعبه تحویل بین تب‌ها در وضعیت مشترک تعریف شده است', /^\s*handoff: null,$/m.test(appSource37));
  // وارد کردن `open` از app.mjs یک حلقه می‌ساخت، چون app.mjs خودش هر تب را
  // به‌صورت پویا وارد می‌کند.
  check('تب‌ها برای تعویض تب، پوسته برنامه را وارد نمی‌کنند',
    !portfolioSource37.includes("from '/ui/app.mjs'") && !backtestSource37.includes("from '/ui/app.mjs'"));

  check('آزمون همه استراتژی‌ها دکمه رصد در بک‌تست سریع دارد',
    portfolioSource37.includes('id="pb-watch"') && portfolioSource37.includes("onclick = () => watchInBacktest(item, false)"));
  // فقط انتخاب‌ها منتقل می‌شوند، نه نتیجه‌ها؛ وگرنه دو تب می‌توانند دو عدد
  // نشان دهند و معلوم نباشد کدام مال کدام محاسبه است.
  for (const key of ['uaIns', 'strategyId', 'legIns', 'entryDate', 'exitDate', 'entryBasis', 'exitBasis', 'units']) {
    check(`تحویل «${key}» را همراه می‌برد`, new RegExp(`^\\s*${key}:`, 'm').test(portfolioSource37.slice(portfolioSource37.indexOf('goHandoff(state, {'))));
  }
  check('تحویل هیچ عدد نتیجه‌ای را کپی نمی‌کند',
    !/goHandoff\(state, \{[\s\S]*?\}\);/.exec(portfolioSource37)[0].match(/netPnl|returnPct|capital/));
  // انتقال دیگر تبِ همین صفحه را عوض نمی‌کند؛ `goHandoff` صفحهٔ تازه باز
  // می‌کند و فقط اگر نشد به مسیر قدیمی برمی‌گردد.
  check('آزمون همه استراتژی‌ها کاربر را به بک‌تست سریع می‌برد',
    portfolioSource37.includes('goHandoff(state, {') && !portfolioSource37.includes("location.hash = 'backtest';"));

  check('بک‌تست سریع تحویل را برمی‌دارد و می‌چیند',
    backtestSource37.includes("state.handoff?.to === 'backtest'") && backtestSource37.includes('await applyHandoff(plan)'));
  // اگر پاک نشود، باز کردن دوباره تب، انتخاب تازه کاربر را با چیدمان کهنه
  // بازنویسی می‌کند.
  check('تحویل پس از برداشتن پاک می‌شود', /const plan = state\.handoff;\s*\n\s*state\.handoff = null;/.test(backtestSource37));
  // اگر ترکیب یا روز پیدا نشود، بی‌صدا چیز دیگری انتخاب نمی‌شود.
  check('هرچه از تحویل چیده نشد، صریح گزارش می‌شود',
    backtestSource37.includes('const skipped = [];') && backtestSource37.includes('skipped.push(') && backtestSource37.includes("skipped.join('؛ ')"));
}
