// ۲۶. فیلترهای نقدشوندگی غربال
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { generateCombos, scan as scanFn } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { byId } from '../../strategies/catalog.mjs';


// ═════════════════ ۲۶. فیلترهای نقدشوندگی غربال (قلم الف-۲ بک‌لاگ) ═════════════════
group('۲۶. فیلترهای نقدشوندگی غربال');
{
  // یک رکورد دیده‌بان مصنوعی با کنترل کامل روی موقعیت باز، حجم و ارزش معاملات
  const mkRow2 = (strike, ua, oi, vol, value) => ({
    uaInsCode: ua, lval30_UA: `پایه${ua}`, pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${ua}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${ua}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: 30, endDate: 20260101,
    pMeDem_C: 3000, qTitMeDem_C: 50, pMeOf_C: 3150, qTitMeOf_C: 50,
    pDrCotVal_C: 3000, pClosing_C: 3000, oP_C: oi, qTotTran5J_C: vol, qTotCap_C: value,
    pMeDem_P: 3000, qTitMeDem_P: 50, pMeOf_P: 3150, qTitMeOf_P: 50,
    pDrCotVal_P: 3000, pClosing_P: 3000, oP_P: oi, qTotTran5J_P: vol, qTotCap_P: value,
  });

  // دو قیمت اعمال، یک نماد پایه؛ نقدشوندگی سرشناخته برای هر پا
  const rows2 = [
    mkRow2(95000, 'L', 500, 1000, 300000000),
    mkRow2(105000, 'L', 500, 1000, 300000000),
  ];
  const chainL = buildChain(rows2);
  const s0 = { ...defaults(), comboWindowPct: 25, wingsEqualWidth: true, greeksInScan: false };

  const base = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: s0 });
  check('پایه، بدون فیلتر نقدشوندگی، ردیف می‌دهد', base.rows.length > 0, `${base.rows.length} ردیف`);

  // موقعیت باز ۵۰۰ است؛ سقف بالاتر باید فروش کال بدون پوشش را بیندازد —
  // این همان فیلتری بود که با «missing = missing || false» هرگز اجرا نمی‌شد
  const byOi = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minOpenInt: 600 } });
  check('حداقل موقعیت باز واقعاً اعمال می‌شود (باگ قبلی: هیچ‌وقت اعمال نمی‌شد)',
    byOi.rows.length === 0, `${base.rows.length} → ${byOi.rows.length}`);
  const byOiOk = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minOpenInt: 400 } });
  check('حداقل موقعیت باز زیر واقعی، ردیف را نمی‌اندازد', byOiOk.rows.length === base.rows.length);

  // حجم مظنه فروش ۵۰ است؛ سقف بالاتر همان مسیر باگ‌دار را می‌سنجد
  const byBidQty = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minBidQty: 100 } });
  check('حداقل حجم مظنه هم روی همان مسیر واقعاً اعمال می‌شود', byBidQty.rows.length === 0);

  // حجم معاملات امروز هر پا ۱۰۰۰ است؛ فیلتر تازه
  const byVol = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minLegVol: 1500 } });
  check('حداقل حجم معاملات هر پا (فیلتر تازه) رعایت می‌شود', byVol.rows.length === 0);
  const byVolOk = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minLegVol: 500 } });
  check('حداقل حجم معاملات زیر واقعی، ردیف را نمی‌اندازد', byVolOk.rows.length === base.rows.length);

  // ارزش معاملات امروز هر پا ۳۰۰ میلیون ریال است؛ فیلتر تازه
  const byValue = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minLegValue: 400000000 } });
  check('حداقل ارزش معاملات هر پا (فیلتر تازه) رعایت می‌شود', byValue.rows.length === 0);
  const byValueOk = scanFn({ def: byId('naked-call'), chain: chainL, uaKeys: ['L'], settings: { ...s0, minLegValue: 100000000 } });
  check('حداقل ارزش معاملات زیر واقعی، ردیف را نمی‌اندازد', byValueOk.rows.length === base.rows.length);

  // نقدشوندگی زنجیره: مجموع ارزش کل زنجیره همین پایه = ۲ پا × ۲ سمت × ۳۰۰م = ۱٬۲۰۰٬۰۰۰٬۰۰۰
  const combos = generateCombos(byId('naked-call'), chainL.get('L'), { ...s0, minUaLiquidity: 1500000000 });
  check('نقدشوندگی زنجیره پایین‌تر از آستانه، کل پایه را حذف می‌کند (نه فقط یک پا)',
    combos.length === 0, `${combos.length} ترکیب`);
  const combosOk = generateCombos(byId('naked-call'), chainL.get('L'), { ...s0, minUaLiquidity: 1000000000 });
  check('نقدشوندگی زنجیره بالاتر از آستانه، دست‌نخورده می‌ماند', combosOk.length > 0, `${combosOk.length} ترکیب`);
}
