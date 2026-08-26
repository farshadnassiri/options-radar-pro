// ۴۵. ستون‌های مشخصات قرارداد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { COLUMNS, MARGIN_PART_SLOTS, evaluate, marginPartSlots } from '../../core/evaluate.mjs';
import { grossCash } from '../../core/payoff.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';
import { fmt as uiFmt } from '../../ui/fmt.mjs';


// ═══════════ ۴۵. ستون‌های مشخصات قرارداد و بازار ═══════════
//
// خواسته کاربر: همان ستون‌هایی که تابلوی حرفه‌ای دارد، اینجا هم باشد.
// قاعده‌ای که این گروه نگه می‌دارد: چیزی جمع می‌شود که جمعش معنی داشته باشد.
// مظنه و تلاطم ضمنی جمع نمی‌شوند — میانگین دو مظنه، عددی است که در هیچ دفتر
// سفارشی وجود ندارد — پس به‌ازای هر پا فهرست می‌شوند.
group('۴۵. ستون‌های مشخصات قرارداد');
{
  const size = 1000;
  const mk = (bid, ask, extra = {}) => ({
    bid, bidQty: 50, ask, askQty: 80, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    oi: 500, oiYday: 400, vol: 1200, trades: 30, value: 5e6,
    book: [{ level: 1, bid, bidQty: 50, ask, askQty: 80 }],
    ...extra,
  });
  const s45 = defaults();
  const ccDef = byId('covered-call');
  const cc = evaluate({
    legs: buildLegs(ccDef, { strikes: [110000], size, days: [30] }),
    quotes: [mk(99000, 100000), mk(4800, 5200)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s45, def: ccDef, underlying: 'نمونه', sigmaHist: 0.6 },
  });

  // ——— ارزش قرارداد ———
  check('نوشنال، قدرمطلق تعهد هر پا روی پایه است',
    near(cc.notional, 2 * size * 100000, 1e-9), uiFmt.money(cc.notional));
  check('ارزش بازاری موقعیت، قرینه نقد ناخالص است',
    near(cc.marketValue, -cc.grossCash, 1e-9), uiFmt.money(cc.marketValue));
  // کال ۱۱۰٬۰۰۰ روی پایه ۱۰۰٬۰۰۰ خارج از سود است، پس ذاتی‌اش صفر و کل ارزش
  // ذاتی موقعیت فقط از سهم می‌آید.
  check('ارزش ذاتی، کال خارج از سود را صفر می‌گیرد',
    near(cc.intrinsic, size * 100000, 1e-9), uiFmt.money(cc.intrinsic));
  check('ارزش زمانی کاوردکال منفی است، چون زمان را فروخته‌ای',
    cc.timeValue < 0 && near(cc.timeValue, -size * 4800, 1e-9), uiFmt.money(cc.timeValue));
  check('ارزش ذاتی به‌علاوه ارزش زمانی، همان ارزش بازاری است',
    near(cc.intrinsic + cc.timeValue, cc.marketValue, 1e-6));
  check('قیمت بلک‌شولز و درصد اختلافش حساب شد',
    Number.isFinite(cc.bsValue) && Number.isFinite(cc.bsDiffPct), `${uiFmt.pct(cc.bsDiffPct)}`);
  check('اهرم، کشسانی موقعیت است: دلتا × پایه ÷ ارزش بازاری',
    near(cc.leverage, (cc.delta * 100000) / cc.marketValue, 1e-9), cc.leverage.toFixed(3));

  // ——— سرمایه و تضمین ———
  // کاوردکال وجه تضمین نقدی ندارد چون سهم پوشش است، ولی «تضمین لازم» پای
  // فروش همچنان عددی دارد. این دو نباید یکی گرفته شوند.
  check('وجه تضمین کاوردکال صفر است ولی تضمین لازم پای فروش صفر نیست',
    cc.margin === 0 && cc.marginRequired > 0, uiFmt.money(cc.marginRequired));
  check('دارایی مسدودی، همان سهمی است که پوشش را می‌سازد',
    cc.sharesLocked === size && near(cc.blockedAsset, size * 100000, 1e-9),
    `${cc.sharesLocked} سهم`);

  // اسپرد بدهکار سهمی قفل نمی‌کند
  const sp = byId('bull-call-spread');
  const spread = evaluate({
    legs: buildLegs(sp, { strikes: [95000, 105000], size, days: [30] }),
    quotes: [mk(7000, 7400), mk(2000, 2300)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s45, def: sp, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('اسپرد بدون پای سهم، دارایی مسدودی ندارد',
    spread.sharesLocked === 0 && spread.blockedAsset === 0);

  const shortStrangleDef = byId('short-strangle');
  const shortStrangle = evaluate({
    legs: buildLegs(shortStrangleDef, { strikes: [90000, 110000], size, days: [30] }),
    quotes: [mk(3800, 4000), mk(4800, 5000)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s45,
      def: shortStrangleDef, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('ردیف استرانگل فروش، یک جزء ترکیبی دارد نه دو وجه تضمین مستقل',
    shortStrangle.marginParts.length === 1
    && shortStrangle.marginPart1 === shortStrangle.margin
    && Number.isNaN(shortStrangle.marginPart2));
  check('شکاف اجزای وجه تضمین با خانهٔ خالی حفظ می‌شود',
    MARGIN_PART_SLOTS === 4
    && marginPartSlots([{ amount: 7 }, { amount: NaN }, { amount: 9 }]).marginPart1 === 7
    && Number.isNaN(marginPartSlots([{ amount: 7 }, { amount: NaN }, { amount: 9 }]).marginPart2));

  // ——— بازار ———
  check('حجم و ارزش و تعداد معامله فقط از پاهای اختیار جمع می‌شوند',
    spread.volTotal === 2400 && spread.tradeCount === 60 && spread.valueTotal === 1e7,
    `حجم ${spread.volTotal}`);
  check('موقعیت باز و تغییرش جمع می‌شوند',
    spread.oiTotal === 1000 && spread.oiChange === 200);
  check('کاوردکال فقط یک پای اختیار دارد، پس حجم یک پا شمرده می‌شود',
    cc.volTotal === 1200 && cc.oiTotal === 500);

  // ——— مظنه: فهرست، نه جمع ———
  check('مظنه هر پا جدا فهرست می‌شود، نه جمع',
    Array.isArray(spread.bidList) && spread.bidList.length === 2
    && spread.bidList[0] === 7000 && spread.bidList[1] === 2000,
    spread.bidList.join(' , '));
  check('عرضه و آخرین و پایانی هم فهرست‌اند',
    spread.askList.length === 2 && spread.lastList.length === 2 && spread.closeList.length === 2);
  check('تلاطم ضمنی هر پا جدا می‌آید', spread.ivList.length === 2 && spread.ivList.every(Number.isFinite),
    spread.ivList.join(' , '));
  check('قیمت سرخط هر پا، همان قیمت اجرای همان پاست',
    spread.headlineList.length === 2
    && near(spread.headlineList[0], spread.legPrices[0].price, 1e-9));
  check('حجم مظنه، کمترین پا را می‌دهد نه جمع را',
    spread.bidQtyMin === 50 && spread.askQtyMin === 80);
  check('فاصله، بدترین پا را می‌دهد',
    Number.isFinite(spread.spreadWorstPct) && spread.spreadWorstPct > 0,
    uiFmt.pct(spread.spreadWorstPct));

  // ——— قرارداد ستونی ———
  const keys = new Set(COLUMNS.map((c) => c.key));
  const NEED = ['headlineList', 'bidList', 'askList', 'lastList', 'closeList', 'spreadWorstPct',
    'bidQtyMin', 'askQtyMin', 'volTotal', 'valueTotal', 'tradeCount', 'oiTotal', 'oiChange',
    'notional', 'marketValue', 'intrinsic', 'timeValue', 'bsValue', 'bsDiffPct', 'ivList',
    'leverage', 'marginRequired', 'marginNet', 'marginNote', 'marginParts', 'marginPart1', 'marginPart2',
    'marginPart3', 'marginPart4', 'blockedAsset', 'sharesLocked', 'rho', 'deltaShares'];
  const absent = NEED.filter((k) => !keys.has(k));
  check('هر ستون تازه در قرارداد ستونی ثبت شده', absent.length === 0, absent.join('، '));

  // هر ستون باید روی ردیف واقعی مقدار داشته باشد — ستونی که همیشه تهی است،
  // در انتخابگر فقط سردرگمی می‌سازد.
  const empty = COLUMNS.filter((c) => !(c.key in cc)).map((c) => c.key);
  check('هیچ ستونی بدون کلید متناظر روی ردیف نمانده', empty.length === 0, empty.join('، '));
  // فهرست قالب‌ها از خودِ `ui/fmt.mjs` می‌آید، نه از رونوشتی اینجا. رونوشت
  // با افزودن هر قالب تازه کهنه می‌شد و آزمون، ستونِ درست را رد می‌کرد.
  const badFmt = COLUMNS.filter((c) => typeof uiFmt[c.fmt] !== 'function');
  check('قالب هر ستون در ui/fmt.mjs تعریف شده', badFmt.length === 0, badFmt.map((c) => `${c.key}:${c.fmt}`).join('، '));
}
