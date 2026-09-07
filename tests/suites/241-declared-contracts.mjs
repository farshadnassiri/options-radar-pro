// ۲۴۱. قراردادهای مستندشده — راستی‌آزمایی، نه بازخوانی
//
// ═══ چرا این دسته وجود دارد ═══
//
// قلمِ «پ» در `NEXT.md` از یک درسِ گران آمده بود: سه کامنت می‌گفتند «زیان
// منفی نوشته می‌شود» در حالی که `maxLoss` **اندازه** است و مثبت. کد درست
// بود و مستندات غلط، و دو ادعای آزمون هم روی همان غلط قفل شده بودند.
//
// قاعده‌اش شد: **ادعای متنی فقط وقتی بی‌ضرر است که راست باشد.** پس این دسته
// هر سه قراردادِ نامزدشده را با اجرای واقعی می‌سنجد، نه با خواندنِ کامنت.
//
// و همان‌جا یک ایراد پیدا شد که هیچ کامنتی ادعایش نکرده بود: نقشهٔ رنگِ
// جدول، در ستونی که هر دو علامت را دارد، معنای «زیان» را نادیده می‌گرفت.

import { check, group } from '../harness.mjs';
import { heatRamp } from '../../ui/table.mjs';
import { rowQuality } from '../../core/exec.mjs';
import { COLUMNS } from '../../core/evaluate.mjs';
import { buildChain } from '../../core/chain.mjs';
import { scan } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { byId } from '../../strategies/catalog.mjs';

group('۲۴۱ — رنگِ ستونِ زیان، وقتی ستون هر دو علامت را دارد');

// ═══ ایرادی که همین‌جا پیدا شد ═══
//
// شاخهٔ «بازه صفر را قطع می‌کند» علامتِ خام را می‌خواند: مثبت سبز، منفی
// قرمز. برای «بیشترین سود» درست است. برای «بیشترین زیان» وارونه، چون موتور
// زیان را اندازه می‌نویسد. یعنی ردیفی با «بیشترین زیان ٪ ۵۰» سبزِ پررنگ
// می‌شد و ردیفی با ‎−۸‎ — ترکیبی که در هیچ قیمتی زیان نمی‌دهد — قرمزِ پررنگ.
check('زیانِ بزرگ در ستونِ زیان، قرمز است',
  heatRamp(50, -8, 50, 'loss').tone === 'loss');
check('و ترکیبی که زیان نمی‌دهد، سبز — نه قرمزِ پررنگ',
  heatRamp(-8, -8, 50, 'loss').tone === 'gain');
check('ستونِ سود دست‌نخورده ماند',
  heatRamp(50, -8, 50, 'gain').tone === 'gain'
  && heatRamp(-8, -8, 50, 'gain').tone === 'loss');
check('و ستونِ بی‌معنا هم همان رفتارِ علامتِ خام را دارد',
  heatRamp(50, -8, 50, undefined).tone === 'gain'
  && heatRamp(-8, -8, 50, undefined).tone === 'loss');

// شدت فقط به فاصله بستگی دارد، نه به معنا — تنها رنگ عوض شد.
check('شدت دست‌نخورده ماند',
  heatRamp(50, -8, 50, 'loss').t === heatRamp(50, -8, 50, 'gain').t
  && heatRamp(-8, -8, 50, 'loss').t === heatRamp(-8, -8, 50, 'gain').t);

// شاخهٔ یک‌علامتی از اول درست بود و نباید عوض شده باشد.
check('ستونِ تماماً مثبتِ زیان، همچنان از `declared` می‌خواند',
  heatRamp(50, 0, 50, 'loss').tone === 'loss'
  && heatRamp(1, 0, 50, 'loss').tone === 'loss');
check('و بزرگ‌تر، پررنگ‌تر',
  heatRamp(50, 0, 50, 'loss').t > heatRamp(1, 0, 50, 'loss').t);
check('ورودیِ ناعدد رنگ نمی‌سازد',
  heatRamp(NaN, 0, 50, 'loss') === null && heatRamp(5, NaN, 50, 'loss') === null);
check('بازهٔ صفرپهنا هم رنگ نمی‌سازد', heatRamp(5, 5, 5, 'loss') === null);

// و این ستون‌ها واقعاً «زیان» اعلام شده‌اند — وگرنه اصلاح جای دیگری می‌نشست.
const declared = (key) => COLUMNS.find((c) => c.key === key)?.heat;
check('«بیشترین زیان» و درصدش، ستونِ زیان‌اند',
  declared('maxLoss') === 'loss' && declared('maxLossPct') === 'loss');
check('و «بیشترین سود» ستونِ سود',
  declared('maxProfit') === 'gain' && declared('maxProfitPct') === 'gain');

group('۲۴۱ — ادعای ۱: `maxLossPct` اندازه است، پس مثبت');

const mk = (k, cBid, pBid) => ({
  uaInsCode: '1', lval30_UA: 'خودرو', insCode_C: `C${k}`, insCode_P: `P${k}`,
  lVal18AFC_C: `ض${k}`, lVal18AFC_P: `ط${k}`,
  strikePrice: k, contractSize: 1000, endDate: 14050915, remainedDay: 30,
  pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 100000,
  qTotTran5J_UA: 1e6, qTotCap_UA: 1e12,
  pMeDem_C: cBid, qTitMeDem_C: 1000, pMeOf_C: cBid + 200, qTitMeOf_C: 1000,
  pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 900, qTotCap_C: 1e9,
  pMeDem_P: pBid, qTitMeDem_P: 1000, pMeOf_P: pBid + 200, qTitMeOf_P: 1000,
  pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 800, qTotCap_P: 1e9,
});
const market = [90000, 95000, 100000, 105000, 110000]
  .map((k) => mk(k, Math.max(200, 100000 - k + 4000), Math.max(200, k - 100000 + 4000)));
const S = { ...defaults(), minReturnPct: -1e9 };
const run = (id) => scan({ def: byId(id), chain: buildChain(market, S), uaKeys: ['1'], settings: S, qty: 1 }).rows;

const spread = run('bull-call-spread')[0];
check('مسیرِ واقعی ردیف داد', !!spread);
check('`maxLoss` اندازه است، پس مثبت — نه زیانِ علامت‌دار',
  spread.maxLoss > 0 && spread.maxProfit > 0);
check('و درصدش هم‌علامتِ خودش است',
  spread.maxLossPct > 0 && Math.sign(spread.maxLossPct) === Math.sign(spread.maxLoss));
check('درصد واقعاً نسبتِ به سرمایه است',
  Math.abs(spread.maxLossPct - (spread.maxLoss / spread.capital) * 100) < 1e-9);
// سودِ نامحدود عددِ درصدی نمی‌سازد — بی‌نهایت تقسیم بر سرمایه، عدد نیست.
const longCall = run('long-call')[0];
check('سودِ نامحدود، درصدِ سود نمی‌سازد',
  longCall.maxProfit === Infinity && !Number.isFinite(longCall.maxProfitPct));
check('ولی سمتِ زیانش عدد دارد',
  Number.isFinite(longCall.maxLoss) && longCall.maxLossPct > 0);

group('۲۴۱ — ادعای ۲: `instantClosePnl` سود و زیان است، نه هزینه');

check('بستنِ فوریِ یک اسپردِ تازه‌باز، زیان است — اسپرد دو بار پرداخت می‌شود',
  Number.isFinite(spread.instantClosePnl) && spread.instantClosePnl < 0);
check('و درصدش هم‌علامتِ خودش است',
  Math.sign(spread.instantClosePnlPctCapital) === Math.sign(spread.instantClosePnl));
check('ردیفِ قابل آفست، پرچمش را دارد', spread.offsettable === true);
check('ستونش «سود» اعلام شده — پس مثبت سبز، و این با علامتش می‌خواند',
  declared('instantClosePnl') === 'gain');

group('۲۴۱ — ادعای ۳: `quality.level` و `executable` یک حرف می‌زنند');

const leg = (quality, extra = {}) => ({ exec: { quality, short: 0, ...extra }, quote: {} });
const level = (legs, opt) => rowQuality(legs, opt).level;
check('همهٔ پاها با عمقِ واقعی → دقیق',
  level([leg('depth'), leg('depth')]) === 'exact');
check('یک پای سطحِ اول → تقریبی',
  level([leg('depth'), leg('level1')]) === 'approx');
check('عمقِ فرضی، «دقیق» نمی‌سازد — عمقی که نمی‌دانیم ادعا نیست',
  level([leg('depth', { assumedDepth: true }), leg('depth')]) === 'approx');
check('پای بی‌مظنه → غیرقابل اجرا',
  level([leg('depth'), leg('none')]) === 'unexecutable');
check('پای مبنای مرجع هم → غیرقابل اجرا',
  level([leg('depth'), leg('reference')]) === 'unexecutable');

// قاعدهٔ `evaluate`: executable = level !== 'unexecutable'. اینجا سنجیده
// می‌شود که هر سه سطح واقعاً از یکدیگر جدا بمانند — وگرنه ادعا توخالی است.
const LEVELS = ['exact', 'approx', 'unexecutable'];
const seen = new Set([
  level([leg('depth')]), level([leg('level1')]), level([leg('none')]), level([leg('reference')]),
]);
check('هر سه سطح از این مسیر ساخته می‌شوند، پس ادعا توخالی نیست',
  LEVELS.every((x) => seen.has(x)) && seen.size === 3);
check('و «قابل اجرا» دقیقاً یعنی سطحش غیرقابل اجرا نیست',
  LEVELS.every((x) => (x !== 'unexecutable') === (x === 'exact' || x === 'approx')));

// و روی ردیف‌های واقعی هم هیچ‌وقت دو حرف نمی‌زنند.
const everyRow = ['bull-call-spread', 'long-call', 'covered-call', 'iron-condor'].flatMap(run);
check('روی ردیف‌های واقعی هم هم‌داستان‌اند',
  everyRow.length > 0
  && everyRow.every((row) => row.executable === (row.quality !== 'unexecutable')));
