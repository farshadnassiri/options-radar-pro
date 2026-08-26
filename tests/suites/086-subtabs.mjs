// ۸۵. نوار زیرتب و دریافت دوبارهٔ داده
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { mountSubtabs } from '../../ui/subtabs.mjs';


// ═════════ ۸۵. نوار زیرتب نباید تب باز کاربر را ببندد ═════════
//
// خرابی گزارش‌شده: «در بک‌تست سریع وقتی روی تب‌های مختلف کلیک می‌کنی، بعد از
// چند ثانیه برمی‌گرده به تب اول. به نظر می‌رسه با دریافت دیتا این اتفاق
// می‌افته.»
//
// ریشه: رصد زنده هر چند ثانیه معاملات را می‌گیرد و پس از هر دریافت،
// `mountSubtabs` را با همان فهرست صدا می‌زد. نوار از نو ساخته می‌شد و انتخاب
// به `initial` برمی‌گشت — بی‌آنکه کاربر چیزی کلیک کرده باشد.
//
// این آزمون به‌جای خواندن متن کد، خودِ رفتار را می‌سنجد: یک DOM کوچک که فقط
// همان چند چیزی را دارد که `mountSubtabs` لمس می‌کند.
group('۸۵. نوار زیرتب و دریافت دوبارهٔ داده');
{
  const makeDom = (ids) => {
    const panels = new Map(ids.map((id) => [id, {
      id: '', hidden: false, tabIndex: -1, setAttribute() {},
    }]));
    let buttons = new Map();
    let builds = 0;
    const host = {
      className: '', setAttribute() {}, onclick: null, onkeydown: null,
      set innerHTML(value) {
        builds += 1;
        buttons = new Map([...String(value).matchAll(/data-subtab="([^"]+)"/g)].map(([, id]) => [id, {
          dataset: { subtab: id }, tabIndex: -1, focused: 0,
          setAttribute(name, val) { this[name] = val; },
          focus() { this.focused += 1; },
        }]));
      },
      querySelector(sel) { return buttons.get(sel.replace(/.*="|".*/g, '')) || null; },
    };
    const root = {
      querySelector(sel) {
        const id = sel.replace(/.*="|".*/g, '');
        return panels.get(id) || null;
      },
    };
    return {
      host, root, panels,
      get builds() { return builds; },
      click(id) { host.onclick({ target: { closest: () => buttons.get(id) || null } }); },
      press(key) { host.onkeydown({ key, preventDefault() {} }); },
      visible: () => [...panels.entries()].filter(([, panel]) => !panel.hidden).map(([id]) => id),
    };
  };

  const ALL = ['bt-setup', 'bt-overview', 'bt-daily', 'bt-attribution'];
  const tabsOf = (ids) => ids.map((id) => ({ id, label: id, hint: id }));
  const dom = makeDom(ALL);
  const opts = { root: dom.root, initial: 'bt-overview' };

  // گام اول: فقط «چیدمان»، همان چیزی که پیش از اولین اجرا روی صفحه است
  const first = mountSubtabs(dom.host, tabsOf(['bt-setup']), { root: dom.root });
  check('پیش از اجرا فقط چیدمان باز است', first.current === 'bt-setup');

  // گام دوم: اجرا تمام شد و فهرست عوض شد — باید روی نتیجه بنشیند
  const full = mountSubtabs(dom.host, tabsOf(ALL), opts);
  check('با عوض‌شدن فهرست، نوار از نو ساخته می‌شود و روی تب آغازین می‌نشیند',
    full.current === 'bt-overview' && dom.builds === 2, `${dom.builds} ساخت`);

  // گام سوم: کاربر روی تب دلخواه خودش می‌نشیند
  dom.click('bt-attribution');
  check('کلیک کاربر، تب را عوض می‌کند', full.current === 'bt-attribution');
  check('در هر لحظه دقیقاً یک پنل باز است',
    dom.visible().length === 1 && dom.visible()[0] === 'bt-attribution', dom.visible().join('، '));

  // گام چهارم — همان خرابی: تیک بعدی رصد زنده با همان فهرست
  const again = mountSubtabs(dom.host, tabsOf(ALL), opts);
  check('دریافت دوبارهٔ داده، کاربر را از تب بازش بیرون نمی‌اندازد',
    again.current === 'bt-attribution', again.current);
  check('پنل باز هم همان می‌ماند',
    dom.visible().length === 1 && dom.visible()[0] === 'bt-attribution', dom.visible().join('، '));
  check('نوارِ بی‌تغییر اصلاً دوباره ساخته نمی‌شود',
    dom.builds === 2, `${dom.builds} ساخت`);
  check('دستهٔ برگشتی همان دستهٔ قبلی است', again === full);

  // ساختِ دوباره حتی نشانگر صفحه‌کلید را هم می‌برد؛ حالا نمی‌برد
  dom.press('ArrowRight');
  check('پس از دریافت داده، جهت‌نما هنوز از همان تب حرکت می‌کند',
    again.current === 'bt-daily', again.current);

  // تغییر واقعی برچسب هم باید نوار را تازه کند
  const renamed = mountSubtabs(dom.host, [
    ...tabsOf(['bt-setup', 'bt-overview', 'bt-daily']),
    { id: 'bt-attribution', label: 'تجزیه سود و زیان', hint: 'x' },
  ], opts);
  check('عوض‌شدن برچسب، نوار را از نو می‌سازد',
    dom.builds === 3 && renamed.current === 'bt-overview', `${dom.builds} ساخت`);

  // بازگشت به حالت پیش از اجرا (تغییر نماد یا استراتژی)
  const back = mountSubtabs(dom.host, tabsOf(['bt-setup']), { root: dom.root });
  check('با عوض‌شدن نماد، نوار به چیدمان برمی‌گردد',
    back.current === 'bt-setup' && dom.builds === 4, `${dom.builds} ساخت`);

  // و در خودِ تب: تیک رصد زنده تب را جابه‌جا نمی‌کند، ولی اجرا می‌کند
  const bt85 = readSrc('../ui/tabs/backtest.mjs');
  const liveBody = bt85.slice(
    bt85.indexOf('async function refreshLivePosition'),
    bt85.indexOf('async function startLiveWatch'),
  );
  check('تیک رصد زنده تب را جابه‌جا نمی‌کند',
    liveBody.includes('showResultTabs();') && !liveBody.includes('fromSetup'));
  check('«اجرا» کاربرِ نشسته روی چیدمان را به نتیجه می‌برد',
    (bt85.match(/showResultTabs\(\{ fromSetup: true \}\)/g) || []).length === 2);
  check('همهٔ فراخوان‌های نوار از یک جا می‌گذرند',
    (bt85.match(/mountSubtabs\(/g) || []).length === 3,
    `${(bt85.match(/mountSubtabs\(/g) || []).length} فراخوان`);
}
