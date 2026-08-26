// ۶۳. انتخاب ترکیب با تغییر قیمت یا اسکرول عوض نمی‌شود
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { comboKey } from '../../core/history.mjs';


group('۶۳. انتخاب ترکیب با تغییر قیمت یا اسکرول عوض نمی‌شود');
{
  // ترکیب‌ها با هر تغییر مبنای قیمت یا روز ورود از نو ساخته می‌شوند و
  // ترتیبشان عوض می‌شود، پس اندیس آرایه هویت نیست. `innerHTML` روی یک
  // `select` هم مقدارش را به گزینهٔ اول برمی‌گرداند — یعنی کاربر روی
  // قراردادی کار می‌کرد که خودش انتخابش نکرده بود.
  const legs = (spec) => spec.map(([ins, side, ratio]) => ({ ins, side, ratio }));
  const a = legs([['111', 'sell', 1], ['222', 'buy', 2]]);
  check('کلید ترکیب به ترتیب پاها وابسته نیست',
    comboKey(a) === comboKey(legs([['222', 'buy', 2], ['111', 'sell', 1]])));
  check('همان قراردادها با سمت متفاوت، یک ترکیب نیستند',
    comboKey(a) !== comboKey(legs([['111', 'buy', 1], ['222', 'buy', 2]])));
  check('همان قراردادها با نسبت متفاوت هم یکی نیستند',
    comboKey(a) !== comboKey(legs([['111', 'sell', 1], ['222', 'buy', 3]])));
  check('نسبت نانوشته، یک است', comboKey([{ ins: '9', side: 'buy' }]) === comboKey([{ ins: '9', side: 'buy', ratio: 1 }]));

  const btSrc63 = readSrc('../ui/tabs/backtest.mjs');
  check('بک‌تست، انتخاب را با هویت نگه می‌دارد نه با اندیس',
    btSrc63.includes('const keep = legs ? comboKey(legs) : \'\';')
    && btSrc63.includes("comboKey(combo.legs) === keep"));
  check('و اگر ترکیب قبلی در روز تازه نبود، ساکت جایگزین نمی‌شود',
    btSrc63.includes('ترکیب قبلی در این روز نبود'));

  const hSrc63 = readSrc('../ui/tabs/history.mjs');
  check('تحلیل تاریخی هم ردیف انتخاب‌شده را نگه می‌دارد، نه ردیف اول را',
    hSrc63.includes('const keep = selectedAuto ? comboKey(selectedAuto.legs)')
    && !hSrc63.includes('if (sorted[0]) selectAutoCombo(sorted[0]);'));
  check('و تعریف دوم هویت پا در رابط نمانده — یکی است، در موتور',
    !hSrc63.includes('legSignature'));

  // بعضی مرورگرها روی `select` فوکوس‌دار، هر درجهٔ چرخ را یک گزینه جلو
  // می‌برند. `blur` به‌جای `preventDefault` است چون جلوگیری از رویداد،
  // اسکرول صفحه را هم می‌گیرد و کاربر داخل فهرست حبس می‌شود.
  const appSrc63 = readSrc('../ui/app.mjs');
  check('چرخ ماوس روی فهرست کشویی، مقدارش را عوض نمی‌کند',
    /document\.addEventListener\('wheel'[\s\S]*?select\.blur\(\);/.test(appSrc63));
  check('و صفحه همچنان اسکرول می‌شود — رویداد گرفته نمی‌شود',
    /addEventListener\('wheel'[\s\S]*?\{ passive: true, capture: true \}\)/.test(appSrc63));
}
