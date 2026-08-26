// ۱۹. نوار تشخیص، علت واقعی افتادن را می‌گوید
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { scan as scanFn, unexecutableReason } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { byId } from '../../strategies/catalog.mjs';


group('۱۹. نوار تشخیص، علت واقعی افتادن را می‌گوید');
{
  // این گروه یک باگ گزارش‌شده کاربر را قفل می‌کند: تب خالی بود و نوار تشخیص
  // می‌گفت «عمق ناکافی»، در حالی که علت واقعی این بود که مبنای قیمت روی
  // «پایانی» بود — مبنایی که طبق طراحی هرگز ادعای اجرا ندارد. کاربر هیچ راهی
  // نداشت این را بفهمد.
  const mkRow = (strike, days, cBid, pBid, qty = 100) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: qty, pMeOf_C: Math.round(cBid * 1.05), qTitMeOf_C: qty,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: pBid, qTitMeDem_P: qty, pMeOf_P: Math.round(pBid * 1.05), qTitMeOf_P: qty,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 800,
  });
  const market = (qty) => {
    const rows = [];
    for (const k of [90000, 95000, 100000, 105000, 110000]) {
      rows.push(mkRow(k, 30, Math.max(200, 100000 - k + 4000), Math.max(200, k - 100000 + 4000), qty));
      rows.push(mkRow(k, 90, Math.max(300, 100000 - k + 7000), Math.max(300, k - 100000 + 7000), qty));
    }
    return rows;
  };
  const runScan = (rows, over = {}) => {
    const s = { ...defaults(), ...over };
    return scanFn({ def: byId('bull-call-spread'), chain: buildChain(rows, s), uaKeys: ['1'], settings: s, qty: s.qtyDefault });
  };

  const base = runScan(market(100));
  check('با دفتر سفارش و مظنه سالم، ردیف می‌ماند', base.funnel.kept > 0, `${base.funnel.kept} ردیف`);
  check('و هیچ‌کدام در سطل مرجع یا عمق نمی‌افتد',
    base.funnel.refBasis === 0 && base.funnel.noDepth === 0);

  // ——— علت یک: مبنای قیمت مرجع ———
  for (const basis of ['CLOSE', 'LAST', 'LOW', 'HIGH']) {
    const r = runScan(market(100), { priceBasis: basis });
    check(`مبنای ${basis} در سطل «مبنای مرجع» می‌افتد، نه «عمق ناکافی»`,
      r.funnel.refBasis === r.funnel.built && r.funnel.noDepth === 0 && r.funnel.kept === 0,
      `مرجع ${r.funnel.refBasis} از ${r.funnel.built}`);
  }

  // با روشن کردن نمایش غیرقابل اجرا، همان ترکیب‌ها برمی‌گردند
  const shown = runScan(market(100), { priceBasis: 'CLOSE', showUnexecutable: true });
  check('با نمایش غیرقابل اجرا، ردیف‌های مبنای مرجع برمی‌گردند',
    shown.funnel.kept > 0 && shown.funnel.refBasis === 0, `${shown.funnel.kept} ردیف`);

  // ——— علت دو: قیمت هست ولی حجمی پشتش نیست ———
  const dry = runScan(market(0));
  check('حجم مظنه صفر، «بی‌مظنه» شمرده می‌شود نه «عمق ناکافی»',
    dry.funnel.noQuote === dry.funnel.built && dry.funnel.noDepth === 0 && dry.funnel.kept === 0,
    `بی‌مظنه ${dry.funnel.noQuote} از ${dry.funnel.built}`);

  // ——— علت سه: فیلتر خود کاربر ———
  const tight = runScan(market(100), { maxSpreadPct: 1 });
  check('سقف اسپرد تنگ، در سطل فیلتر تو می‌افتد',
    tight.funnel.filtered === tight.funnel.built && tight.funnel.kept === 0);

  // حالت میانه ادعای اجرا ندارد ولی ردیف را نمی‌اندازد — عمداً
  const mid = runScan(market(100), { execMode: 'MID' });
  check('حالت میانه ردیف را نمی‌اندازد', mid.funnel.kept > 0 && mid.funnel.refBasis === 0);

  // ——— علت، از کیفیت ماشین‌خوان می‌آید نه از متن برچسب ———
  check('علت مرجع، از کیفیت پا خوانده می‌شود',
    unexecutableReason({ legPrices: [{ quality: 'depth' }, { quality: 'reference' }] }) === 'refBasis');
  check('علت بی‌مظنه، از کیفیت پا خوانده می‌شود',
    unexecutableReason({ legPrices: [{ quality: 'none' }, { quality: 'depth' }] }) === 'noQuote');
  check('مرجع بر بی‌مظنه اولویت دارد، چون تنظیم کاربر است نه واقعیت بازار',
    unexecutableReason({ legPrices: [{ quality: 'none' }, { quality: 'reference' }] }) === 'refBasis');
  check('بی هیچ نشانه‌ای، عمق ناکافی می‌ماند',
    unexecutableReason({ legPrices: [{ quality: 'depth' }] }) === 'noDepth');
  check('ردیف بی‌پا، خطا نمی‌دهد', unexecutableReason({}) === 'noDepth');

  // کیفیت ماشین‌خوان باید واقعاً روی ردیف بنشیند، وگرنه علت همیشه noDepth است
  const one = runScan(market(100), { priceBasis: 'CLOSE', showUnexecutable: true });
  check('کیفیت هر پا روی ردیف ثبت می‌شود',
    one.rows[0].legPrices.every((l) => typeof l.quality === 'string'),
    one.rows[0].legPrices.map((l) => l.quality).join(' , '));
}
