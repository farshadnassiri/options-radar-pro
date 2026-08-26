// ۵۹. نرخ کارمزد پایه بر حسب نوع ابزار
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { evaluate } from '../../core/evaluate.mjs';
import { assetClassMap, assetClassOf, defaults, feesOf } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


// ═════════ ۵۹. نرخ کارمزد پایه، بر حسب نوع ابزار ═════════
//
// حسابرسی: یک نرخ سهم برای همهٔ پایه‌ها اعمال می‌شد. کاوردکال و پوت حفاظتی
// و کولار و تبدیل روی صندوق قابل معامله یا صندوق کالایی، هزینهٔ غلط
// می‌گرفتند — و آن نرخ در ارزش کل موقعیت ضرب می‌شود.
//
// تابلوی اختیار نوع ابزار پایه را نمی‌دهد. تشخیص خودکار از روی نام یعنی
// حدس زدن، و حدسی که در نرخ کل موقعیت ضرب شود از نداشتنِ تفکیک بدتر است.
// پس نگاشت، اعلام کاربر است و پیش‌فرضِ هر سه کلاس برابر نرخ سهم می‌ماند.
group('۵۹. نرخ کارمزد پایه بر حسب نوع ابزار');
{
  const s = defaults();
  check('بدون نگاشت، همه‌چیز سهم است و نرخ عوض نمی‌شود',
    assetClassOf(assetClassMap(''), { ins: '123', name: 'اهرم' }) === 'STOCK');
  const map = assetClassMap('123:ETF, طلا:COMMODITY, بدون‌نوع:XYZ');
  check('نگاشت با شناسه می‌خواند', assetClassOf(map, { ins: '123', name: 'هرچیز' }) === 'ETF');
  check('نگاشت با نام هم می‌خواند', assetClassOf(map, { ins: '999', name: 'طلا' }) === 'COMMODITY');
  check('نوع ناشناخته دور ریخته می‌شود، نه اینکه ساخته شود',
    assetClassOf(map, { ins: '0', name: 'بدون‌نوع' }) === 'STOCK' && map.size === 2, `${map.size}`);

  const fStock = feesOf(s);
  const fEtf = feesOf(s, 'ETF');
  check('پیش‌فرض هر سه کلاس یکی است — تا کاربر نرخ کارگزارش را ننوشته، هیچ عددی جابه‌جا نمی‌شود',
    fEtf.buyStock === fStock.buyStock && fEtf.sellStock === fStock.sellStock
    && feesOf(s, 'COMMODITY').sellStock === fStock.sellStock);
  const s2 = { ...s, feeSellEtf: 0.00088 };
  check('با نرخ اعلامی کاربر، فقط پای سهمِ همان کلاس عوض می‌شود',
    feesOf(s2, 'ETF').sellStock === 0.00088 && feesOf(s2).sellStock === s.feeSellStock
    && feesOf(s2, 'ETF').option === s.feeOption && feesOf(s2, 'ETF').exercise === s.feeExercise);

  // و ردیف باید بگوید کدام نرخ خورده است
  const size = 1000;
  const def = byId('covered-call');
  const legs = buildLegs(def, { strikes: [110000], size, days: [30] });
  const Q = (bid, ask) => ({ bid, bidQty: 900, ask, askQty: 900, last: bid, close: bid,
    book: [{ bid, bidQty: 900, ask, askQty: 900 }], state: 'A', staleSec: 1 });
  const mkRow = (settings, assetClass) => evaluate({
    legs, quotes: [Q(99000, 100000), Q(4000, 4200)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings, def,
      underlying: 'نمونه', sigmaHist: 0.6, assetClass },
  });
  const rowStock = mkRow(s, 'STOCK');
  const rowEtf = mkRow({ ...s, feeBuyEtf: 0.00037 }, 'ETF');
  check('ردیف، نوع پایه و برچسبش را گزارش می‌کند',
    rowStock.assetClass === 'STOCK' && rowEtf.assetClassLabel === 'صندوق قابل معامله',
    rowEtf.assetClassLabel);
  check('نرخ خرید کمترِ صندوق، بهای ورود کاوردکال را کمتر می‌کند',
    rowEtf.netCash > rowStock.netCash && rowEtf.entryFee < rowStock.entryFee,
    `سهم ${Math.round(rowStock.entryFee).toLocaleString()} | صندوق ${Math.round(rowEtf.entryFee).toLocaleString()}`);
  check('و ترکیبِ بدون پای سهم از این تفکیک اثر نمی‌گیرد',
    (() => {
      const np = byId('naked-put');
      const l = buildLegs(np, { strikes: [95000], size, days: [30] });
      const mk = (settings, assetClass) => evaluate({ legs: l, quotes: [Q(8000, 8400)],
        ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings, def: np,
          underlying: 'نمونه', sigmaHist: 0.6, assetClass } });
      return mk(s, 'STOCK').netCash === mk({ ...s, feeBuyEtf: 0.00037, feeSellEtf: 0.00088 }, 'ETF').netCash;
    })());
}
