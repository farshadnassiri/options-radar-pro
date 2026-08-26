// ۳۸. سررسید با سقف موقعیت پر
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import {
  blockedExpirySet, emptyFunnel, expiryBlocked, generateCombos, scan as scanFn,
} from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { byId } from '../../strategies/catalog.mjs';


// ═══════════════════════════ ۳۸. سررسید با سقف موقعیت پر ═══════════════════════════
group('۳۸. سررسید با سقف موقعیت پر');
{
  const mkRow38 = (strike, endDate) => ({
    uaInsCode: 'L', lval30_UA: 'اهرم', pDrCotVal_UA: 100000, pClosing_UA: 100000,
    insCode_C: `c${strike}_${endDate}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${endDate}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: endDate === 20260101 ? 30 : 60, endDate,
    pMeDem_C: 3000, qTitMeDem_C: 50, pMeOf_C: 3150, qTitMeOf_C: 50,
    pDrCotVal_C: 3000, pClosing_C: 3000, oP_C: 500, qTotTran5J_C: 1000, qTotCap_C: 300000000,
    pMeDem_P: 3000, qTitMeDem_P: 50, pMeOf_P: 3150, qTitMeOf_P: 50,
    pDrCotVal_P: 3000, pClosing_P: 3000, oP_P: 500, qTotTran5J_P: 1000, qTotCap_P: 300000000,
  });
  const chain38 = buildChain([
    mkRow38(95000, 20260101), mkRow38(105000, 20260101),
    mkRow38(95000, 20260201), mkRow38(105000, 20260201),
  ]);
  const s38 = { ...defaults(), comboWindowPct: 25, greeksInScan: false };
  const ua38 = chain38.get('L');
  check('نمونه دو سررسید دارد', ua38.expiryList.length === 2, ua38.expiryList.map((ex) => ex.endDate).join('/'));

  // ——— خواندن فهرست ———
  const set38 = blockedExpirySet('L:20260101, L:20260201 ');
  check('فهرست سررسیدهای پرشده با فاصله اضافی هم درست خوانده می‌شود', set38.size === 2 && set38.has('L:20260201'));
  check('ورودی خالی یا بی‌دونقطه چیزی نمی‌سازد',
    blockedExpirySet('').size === 0 && blockedExpirySet('L').size === 0 && blockedExpirySet(':20260101').size === 0 && blockedExpirySet(null).size === 0);
  check('بستن یک سررسید، سررسید دیگر همان نماد را نمی‌بندد',
    expiryBlocked(blockedExpirySet('L:20260101'), 'L', 20260101) && !expiryBlocked(blockedExpirySet('L:20260101'), 'L', 20260201));
  check('بستن سررسید یک نماد به نماد دیگر سرایت نمی‌کند',
    !expiryBlocked(blockedExpirySet('L:20260101'), 'M', 20260101));

  // ——— اثر روی ترکیب‌سازی ———
  const openAll38 = generateCombos(byId('naked-call'), ua38, s38);
  const oneBlocked38 = generateCombos(byId('naked-call'), ua38, { ...s38, blockedExpiries: 'L:20260101' });
  const allBlocked38 = generateCombos(byId('naked-call'), ua38, { ...s38, blockedExpiries: 'L:20260101,L:20260201' });
  check('بدون فهرست، هر دو سررسید ترکیب می‌سازند', openAll38.length > 0 && new Set(openAll38.map((row) => row.endDate)).size === 2);
  check('سررسید پرشده هیچ ترکیبی نمی‌سازد',
    oneBlocked38.length > 0 && oneBlocked38.every((row) => row.endDate === 20260201), new Set(oneBlocked38.map((row) => row.endDate)).size);
  check('بستن همه سررسیدها یعنی هیچ پیشنهادی', allBlocked38.length === 0);

  // سررسید بسته اصلاً ترکیب نمی‌سازد، پس در سطل‌های قیف دیده نمی‌شود؛ اگر
  // شمرده نشود، کاربر جدول خالی را به نبود مظنه نسبت می‌دهد.
  const funnel38 = emptyFunnel();
  generateCombos(byId('naked-call'), ua38, { ...s38, blockedExpiries: 'L:20260101' }, funnel38);
  check('قیف، سررسیدهای کنارگذاشته‌شده را جدا می‌شمارد', funnel38.blockedExpiry === 1, funnel38.blockedExpiry);
  const scan38 = scanFn({ def: byId('naked-call'), chain: chain38, uaKeys: ['L'], settings: { ...s38, blockedExpiries: 'L:20260101' } });
  // ردیف اسکن `endDate` را حمل نمی‌کند؛ `days` تنها نشانه سررسید در خروجی است
  // و در این نمونه ۳۰ روز مال سررسید بسته و ۶۰ روز مال سررسید باز است.
  check('اسکن کامل هم سررسید پرشده را پیشنهاد نمی‌دهد',
    scan38.rows.length > 0 && scan38.rows.every((row) => row.days === 60), scan38.rows.map((row) => row.days).join('/'));

  // ——— رابط ———
  const settingsSource38 = readSrc('../core/settings.mjs');
  check('فهرست سررسیدهای پرشده در تنظیمات ذخیره می‌شود، نه فقط در حافظه مرورگر',
    settingsSource38.includes("key: 'blockedExpiries'") && defaults().blockedExpiries === '');
  const indexSource38 = readSrc('../ui/index.html');
  check('انتخابگر سررسید در نوار بالای برنامه است',
    indexSource38.indexOf('data-capacity-panel') > 0 && indexSource38.indexOf('data-capacity-panel') < indexSource38.indexOf('</header>'));
  const expiriesSource38 = readSrc('../ui/expiries.mjs');
  // تا کسی نوار را باز نکند نباید هیچ درخواستی برود؛ همان قاعده «تب بسته
  // هیچ هزینه‌ای ندارد».
  check('زنجیره فقط با باز شدن نوار گرفته می‌شود',
    /host\.addEventListener\('toggle', \(\) => \{ if \(host\.open\) \{ paintPanel\(\); loadChain\(\); \} \}\)/.test(expiriesSource38)
    && (expiriesSource38.match(/fetch\(/g) || []).length === 1);
  const tableSource38 = readSrc('../ui/table.mjs');
  check('قیف، کنارگذاشتن سررسید را به کاربر توضیح می‌دهد', tableSource38.includes('f.blockedExpiry > 0'));
}
