// ۹۲. یونانی و تلاطم هر پا در قرارداد ستونی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { columnsForStrategy, evaluate } from '../../core/evaluate.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


// ═══════════════════ ۹۲. یونانی و تلاطم هر پا، در جدول هر استراتژی ═══════════════════
//
// خواستهٔ صریح: «در هر قسمتی که استراتژی هست، هم یونانی پاها به تفکیک باشد
// هم یونانی کل». همهٔ آن قسمت‌ها — سی‌ویک تب استراتژی، برترین موقعیت‌ها،
// داشبورد و رول — از یک قرارداد ستونی مشترک می‌سازند، پس این ادعا روی
// خروجی `evaluate` سنجیده می‌شود نه روی تک‌تک تب‌ها.
group('۹۲. یونانی و تلاطم هر پا در قرارداد ستونی');
{
  const s92 = defaults();
  const size92 = 1000;
  const q92 = (bid, ask) => ({
    bid, bidQty: 50, ask, askQty: 50, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    book: [{ level: 1, bid, bidQty: 50, ask, askQty: 50 }],
  });
  const def92 = byId('bull-call-spread');
  const legs92 = buildLegs(def92, { strikes: [100000, 110000], size: size92, days: [60] });
  const row92 = evaluate({
    legs: legs92, quotes: [q92(9000, 9400), q92(4000, 4400)],
    ctx: { S: 100000, Sclose: 100000, days: 60, size: size92, qty: 1, settings: s92,
      def: def92, underlying: 'نمونه', sigmaHist: 0.45 },
  });

  check('هر پا تلاطم ضمنی خودش را دارد و دو پا دو عدد جدا می‌گیرند',
    Number.isFinite(row92.legIv1) && Number.isFinite(row92.legIv2)
    && Math.abs(row92.legIv1 - row92.legIv2) > 1e-6,
    `${row92.legIv1.toFixed(2)}٪ و ${row92.legIv2.toFixed(2)}٪`);
  check('هر پنج یونانی برای هر دو پا ستون دارد',
    ['delta', 'gamma', 'vega', 'theta', 'rho']
      .every((k) => Number.isFinite(row92[`leg${k}1`]) && Number.isFinite(row92[`leg${k}2`])));
  // ستون پا وزن‌نخورده است: دلتای پای خریدِ داخل‌پول بین صفر و یک می‌ماند
  // حتی وقتی موقعیت هزار سهم است. اگر روزی وزن‌دار شود، این رد می‌شود.
  check('ستون یونانی پا وزن‌نخورده است، پس دلتایش بین صفر و یک می‌ماند',
    row92.legdelta1 > 0 && row92.legdelta1 < 1 && row92.legdelta2 > 0 && row92.legdelta2 < 1,
    `${row92.legdelta1.toFixed(3)} و ${row92.legdelta2.toFixed(3)}`);
  // و جمع موقعیت وزن‌دار است: خرید منهای فروش، ضربدر اندازهٔ قرارداد
  check('جمع موقعیت، همان وزن‌دارِ ستون‌های پاست',
    near(row92.delta, size92 * (row92.legdelta1 - row92.legdelta2), 1e-6),
    `${row92.delta.toFixed(2)}`);
  check('تلاطم ضمنی موقعیت میانگین سادهٔ پاهای اختیار است',
    near(row92.ivMeanPct, (row92.legIv1 + row92.legIv2) / 2, 1e-9), `${row92.ivMeanPct.toFixed(3)}`);
  check('تلاطم تاریخی پایه به درصد می‌آید و منبعش سری است',
    near(row92.hvPct, 45, 1e-9) && row92.hvSource === 'series', `${row92.hvPct} — ${row92.hvSource}`);
  check('فاصلهٔ ضمنی از تاریخی، تفریق است نه نسبت',
    near(row92.ivHvSpreadPp, row92.ivMeanPct - row92.hvPct, 1e-9));

  // بدون سری کافی، تلاطم تاریخی ساخته نمی‌شود — مگر کاربر خودش اعلام کند
  const noHv = evaluate({
    legs: legs92, quotes: [q92(9000, 9400), q92(4000, 4400)],
    ctx: { S: 100000, Sclose: 100000, days: 60, size: size92, qty: 1, settings: s92,
      def: def92, underlying: 'نمونه', sigmaHist: NaN },
  });
  check('بی‌داده و بی‌اعلام، تلاطم تاریخی خالی می‌ماند نه صفر',
    Number.isNaN(noHv.hvPct) && noHv.hvSource === 'none' && Number.isNaN(noHv.ivHvSpreadPp));
  const manualHv = evaluate({
    legs: legs92, quotes: [q92(9000, 9400), q92(4000, 4400)],
    ctx: { S: 100000, Sclose: 100000, days: 60, size: size92, qty: 1,
      settings: { ...s92, hvManualPct: 38 },
      def: def92, underlying: 'نمونه', sigmaHist: NaN },
  });
  check('اعلام دستی کاربر جای داده نبوده می‌نشیند و برچسبش می‌ماند',
    near(manualHv.hvPct, 38, 1e-9) && manualHv.hvSource === 'manual');
  check('اعلام دستی روی دادهٔ واقعی نمی‌نشیند',
    near(row92.hvPct, 45, 1e-9) && row92.hvSource === 'series');

  // پای دارایی پایه: دلتای یک، بقیه صفر، و بی‌تلاطم ضمنی
  const cc92 = byId('covered-call');
  const ccRow = evaluate({
    legs: buildLegs(cc92, { strikes: [110000], size: size92, days: [30] }),
    quotes: [q92(99000, 100000), q92(4800, 5200)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size: size92, qty: 1, settings: s92,
      def: cc92, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('پای سهم دلتای یک دارد و از تلاطم و زمان اثر نمی‌گیرد',
    ccRow.legdelta1 === 1 && ccRow.legvega1 === 0 && ccRow.legtheta1 === 0);
  check('پای سهم تلاطم ضمنی ندارد، چون قرارداد اختیار نیست',
    Number.isNaN(ccRow.legIv1) && Number.isFinite(ccRow.legIv2));

  // ستون‌های پای نداشته اصلاً ساخته نمی‌شوند
  const cols92 = columnsForStrategy(def92);
  check('اسپرد دوپا، ستون یونانیِ پای سوم و چهارم نمی‌گیرد',
    !cols92.some((c) => /^(legIv|legdelta|leggamma|legvega|legtheta|legrho)[34]$/.test(c.key))
    && cols92.some((c) => c.key === 'legdelta2'));
  check('سرستون یونانی پا، خودِ پا را می‌گوید نه فقط شماره‌اش',
    cols92.find((c) => c.key === 'legdelta2').label === 'دلتا پا ۲ — فروش کال',
    cols92.find((c) => c.key === 'legdelta2').label);
  check('تب استراتژی نمای «یونانی پاها» دارد',
    readSrc('../ui/tabs/strategy.mjs').includes("'یونانی پاها':"));
}
