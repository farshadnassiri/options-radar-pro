// ۷۲. جدول‌های داشبورد رصد لحظه‌ای
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { fmt as uiFmt } from '../../ui/fmt.mjs';



// ═════════ ۷۲. جدول‌های رصد لحظه‌ای: مرتب‌شونده، صادرشونده، هم‌قد دامنه ═════════
//
// دو خواسته کاربر، یک ریشه:
//
//   «همه جدول‌های رصد لحظه‌ای قابلیت سرت کردن و خروجی اکسل داشته باشند»
//   «اطلاعاتی که از کل نماد می‌گیریم با اطلاعات یک سررسید یا یک قرارداد
//    متفاوت است — لازم نیست بیست تب شبیه هم باشند»
//
// ریشه، یک `innerHTML` خام دوازده‌ستونه بود که برای هر سطحی یک قالب داشت:
// نه مرتب می‌شد، نه خروجی داشت، و ردیف نماد پایه ستون «سررسید» می‌گرفت که
// همیشه «—» بود.
group('۷۲. جدول‌های داشبورد رصد لحظه‌ای');
{
  const dash72 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const setOf = (name) => {
    const block = new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(dash72)?.[1] || '';
    return [...block.matchAll(/col\('(\w+)'/g)].map((m) => m[1]);
  };
  const contract = setOf('COLS_CONTRACT'), underlying = setOf('COLS_UNDERLYING');
  const expiry = setOf('COLS_EXPIRY'), group = setOf('COLS_GROUP'), tape = setOf('COLS_TAPE');

  check('جدول‌ها از جدول مشترک می‌آیند، نه از innerHTML خام',
    dash72.includes("import { makeTable } from '/ui/table.mjs'")
    && !dash72.includes('<table class="history-table decision-table"')
    && !dash72.includes('<table class="history-table decision-tape"'));
  // جدول مشترک، مرتب‌سازی و انتخابگر ستون و دکمه خروجی اکسل را با هم دارد
  check('هر جدول، انتخابگر ستون و نام خروجی می‌گیرد',
    /all: cols, storeKey: `dashboard:\$\{key\}`, exportName: `dashboard-\$\{exportName\}`/.test(dash72));
  check('و نمونه هر نما نگه داشته می‌شود تا مرتب‌سازی کاربر با هر دریافت پاک نشود',
    dash72.includes('const tables = new Map()') && dash72.includes('tables.set(key, entry)'));
  // با پنهان‌کردن به‌جای جداکردن، هر querySelector روی میزبان جدولِ نمای
  // قبلی را برمی‌گرداند — این را کنترل مرورگر پیدا کرد، نه بازخوانی کد.
  check('جدول غیرفعال از DOM جدا می‌شود، نه فقط پنهان',
    dash72.includes('other.el.remove()') && !dash72.includes('other.el.hidden = true'));

  check('هر سطح دامنه مجموعه ستون خودش را دارد', new Set([
    contract.join(','), underlying.join(','), expiry.join(','), group.join(','), tape.join(','),
  ]).size === 5);
  // ستون‌هایی که فقط به یک سطح می‌خورند، به سطح دیگر نشت نکنند
  check('ستون قرارداد به ردیف نماد پایه نمی‌رود',
    contract.includes('strike') && contract.includes('kindLabel')
    && !underlying.includes('strike') && !underlying.includes('kindLabel'));
  check('ستون گروه ساختگی، قیمت و سررسید ندارد — برای یک گروه معنی نمی‌دهد',
    !group.includes('last') && !group.includes('expiryText') && !group.includes('strike'));
  check('ردیف نماد پایه ستون‌های مخصوص خودش را دارد',
    ['expiries', 'atmIvPct', 'pcRatio', 'uaValue'].every((k) => underlying.includes(k))
    && !contract.includes('atmIvPct'));
  check('ردیف سررسید، تفکیک کال و پوت و نسبت‌ها را دارد',
    ['callValue', 'putValue', 'putCallOi', 'tradedContracts'].every((k) => expiry.includes(k)));
  check('نوار ریزمعامله ستون‌های تجمعی و مرجع خودش را دارد',
    ['cumulativeVolume', 'cumulativeValue', 'basePrice', 'sequence'].every((k) => tape.includes(k)));
  // هر ستونی که اعلام می‌شود باید قالبی داشته باشد که `ui/fmt.mjs` بشناسد
  const fmts = [...dash72.matchAll(/col\('\w+', '[^']*', '(\w+)'/g)].map((m) => m[1]);
  check('قالب هر ستون داشبورد در ui/fmt.mjs تعریف شده',
    fmts.length > 0 && fmts.every((f) => typeof uiFmt[f] === 'function'),
    [...new Set(fmts.filter((f) => typeof uiFmt[f] !== 'function'))].join('، '));
}
