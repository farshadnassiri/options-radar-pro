// رادارِ هر استراتژی — ستون، مرتب‌سازی و فیلترِ مختصِ خودش.
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «در هر کدوم از استراتژیهای سمت راست … با توجه به ویژگی خاص خودش یک
// جدول تهیه کن با پارامترهای قابل انتخاب … مثلا برای کاوردکال بر اساس
// حداکثر سود، فاصله از سربه‌سری و بقیه پارامترها قابل تنظیم باشه.»
//
// ═══ چرا داده، نه سی‌وشش فایلِ رابط ═══
//
// وسوسه این است که برای هر استراتژی یک جدولِ دست‌نویس ساخته شود. این
// دقیقاً همان تصمیمی را می‌شکند که کلِ پروژه رویش ایستاده: «چون هیچ
// استراتژی محاسبه‌گر جدا ندارد، هیچ تبی هم رابط جدا لازم ندارد»
// (`ui/tabs/strategy.mjs`). سی‌وشش رابطِ جدا یعنی ستونی که در یکی درست
// می‌شود، در سی‌وپنج‌تای دیگر غلط می‌ماند.
//
// پس تفاوت، **داده** است نه کد: یک رندرکنندهٔ واحد، و برای هر استراتژی یک
// نمایه که می‌گوید کدام ستون‌ها اول به چشم بیایند، جدول با چه چیزی مرتب
// شود، و کدام فیلترها برای این ساختار معنی دارند. کاورد کال با «فاصله تا
// سربه‌سری» و «بازده ایستا» شروع می‌شود؛ پروانه با «سود به زیان»؛ تقویمی
// با «تتا» و «شکافِ تلاطم».
//
// ═══ نمایه، نمای شروع است نه قفس ═══
//
// همان قاعدهٔ `ui/radar-columns.mjs`: انتخابگرِ ستونِ جدول همچنان هر ۱۴۴
// ستونِ قرارداد مشترک را دارد. نمایه فقط می‌گوید کاربر با چه چیزی
// **شروع** کند.

import { COLUMNS } from './evaluate.mjs';

const COLUMN_KEYS = new Set(COLUMNS.map((column) => column.key));

/** ستونِ پا (`legValue3`) وقتی استراتژی سه پا ندارد، فقط پهنا می‌گیرد. */
const LEG_COLUMN = /^(legValue|legIv|legdelta|leggamma|legvega|legtheta|legrho)(\d+)$/;

// ─────────────────────────── فیلترها ───────────────────────────
//
// هر فیلد `field` نامِ همان کلیدِ ردیفِ موتور است، پس فیلتر هیچ عددی
// نمی‌سازد و هیچ محاسبه‌ای تکرار نمی‌کند.
//
// `cmp`:
//   gte  عدد ردیف باید دست‌کم این‌قدر باشد
//   lte  عدد ردیف باید حداکثر این‌قدر باشد
//   absLte  قدرمطلقِ عدد ردیف باید حداکثر این‌قدر باشد
//   flag  فیلترِ بله/خیر روی یک پرچمِ ردیف
//   notFlag  وارونهٔ آن

export const RADAR_FILTERS = [
  { key: 'minRetMonthPct', label: 'حداقل بازده ماهانه', unit: '٪', field: 'retMonthPct', cmp: 'gte' },
  { key: 'minRetMaxPct', label: 'حداقل بازده دوره', unit: '٪', field: 'retMaxPct', cmp: 'gte' },
  { key: 'minRetStaticPct', label: 'حداقل بازده ایستا', unit: '٪', field: 'retStaticPct', cmp: 'gte' },
  { key: 'minRetAnnPct', label: 'حداقل بازده سالانه', unit: '٪', field: 'retAnnPct', cmp: 'gte' },
  { key: 'minMaxProfit', label: 'حداقل بیشترین سود', unit: 'ریال', field: 'maxProfit', cmp: 'gte' },
  { key: 'maxLossCap', label: 'سقف بیشترین زیان', unit: 'ریال', field: 'maxLoss', cmp: 'absLte' },
  { key: 'minRewardRisk', label: 'حداقل سود به زیان', unit: '', field: 'rewardRisk', cmp: 'gte' },
  { key: 'minPopPct', label: 'حداقل احتمال سود', unit: '٪', field: 'popPct', cmp: 'gte' },
  { key: 'minBeRoomPct', label: 'حداقل فاصله تا سربه‌سری', unit: '٪', field: 'beRoomPct', cmp: 'gte' },
  { key: 'maxBeDistPct', label: 'حداکثر فاصله تا نزدیک‌ترین سربه‌سری', unit: '٪', field: 'beDistPct', cmp: 'absLte' },
  { key: 'minBeWidthPct', label: 'حداقل پهنای بین دو سربه‌سری', unit: '٪', field: 'beWidthPct', cmp: 'gte' },
  { key: 'minDaysLeft', label: 'حداقل روز مانده', unit: 'روز', field: 'days', cmp: 'gte' },
  { key: 'maxDaysLeft', label: 'حداکثر روز مانده', unit: 'روز', field: 'days', cmp: 'lte' },
  { key: 'maxCapital', label: 'سقف سرمایه درگیر', unit: 'ریال', field: 'capital', cmp: 'lte' },
  { key: 'maxMargin', label: 'سقف وجه تضمین', unit: 'ریال', field: 'margin', cmp: 'lte' },
  { key: 'maxMarginNet', label: 'سقف وجه تضمین خالص', unit: 'ریال', field: 'marginNet', cmp: 'lte' },
  { key: 'minThetaToCapitalPct', label: 'حداقل تتا به سرمایه', unit: '٪', field: 'thetaToCapitalPct', cmp: 'gte' },
  { key: 'maxAbsDelta', label: 'سقف قدرمطلق دلتا', unit: '', field: 'delta', cmp: 'absLte' },
  { key: 'minVega', label: 'حداقل وگا', unit: '', field: 'vega', cmp: 'gte' },
  { key: 'minIvHvSpreadPp', label: 'حداقل شکاف تلاطم ضمنی از تاریخی', unit: 'واحد', field: 'ivHvSpreadPp', cmp: 'gte' },
  { key: 'minValueTotal', label: 'حداقل ارزش معاملات کل ترکیب', unit: 'ریال', field: 'valueTotal', cmp: 'gte' },
  { key: 'minLegValue1', label: 'حداقل ارزش معاملات پای ۱', unit: 'ریال', field: 'legValue1', cmp: 'gte' },
  { key: 'minLegValue2', label: 'حداقل ارزش معاملات پای ۲', unit: 'ریال', field: 'legValue2', cmp: 'gte' },
  { key: 'minLegValue3', label: 'حداقل ارزش معاملات پای ۳', unit: 'ریال', field: 'legValue3', cmp: 'gte' },
  { key: 'minLegValue4', label: 'حداقل ارزش معاملات پای ۴', unit: 'ریال', field: 'legValue4', cmp: 'gte' },
  { key: 'minMaxQty', label: 'حداقل حجم قابل اجرا', unit: 'قرارداد', field: 'maxQty', cmp: 'gte' },
  { key: 'maxSpreadWorstPct', label: 'سقف بدترین اسپرد پاها', unit: '٪', field: 'spreadWorstPct', cmp: 'lte' },
  { key: 'maxExecCost', label: 'سقف هزینه اجرا', unit: 'ریال', field: 'execCost', cmp: 'lte' },
  { key: 'minOiTotal', label: 'حداقل موقعیت باز', unit: 'قرارداد', field: 'oiTotal', cmp: 'gte' },
  { key: 'maxStaleSec', label: 'سقف سنِ مظنه', unit: 'ثانیه', field: 'staleSecMax', cmp: 'lte' },
  { key: 'onlyTradable', label: 'فقط نمادِ مجاز', unit: '', field: 'tradable', cmp: 'flag' },
  { key: 'onlyExecutable', label: 'فقط ردیف قابل اجرا', unit: '', field: 'executable', cmp: 'flag' },
  { key: 'onlyCredit', label: 'فقط بستانکار', unit: '', field: 'isCredit', cmp: 'flag' },
  { key: 'onlyOffsettable', label: 'فقط ردیفی که همین حالا بسته می‌شود', unit: '', field: 'offsettable', cmp: 'flag' },
  { key: 'noUnlimitedLoss', label: 'زیان نامحدود را کنار بگذار', unit: '', field: 'unlimitedLoss', cmp: 'notFlag' },
];

const FILTER_BY_KEY = new Map(RADAR_FILTERS.map((filter) => [filter.key, filter]));

export const filterByKey = (key) => FILTER_BY_KEY.get(String(key ?? '')) || null;

/** فیلترِ پرچمی با تیک کار می‌کند، بقیه با عدد. */
export const isFlagFilter = (filter) => filter?.cmp === 'flag' || filter?.cmp === 'notFlag';

/**
 * عددِ یک فیلترِ عددی، یا `null` وقتی فیلتر خاموش است.
 *
 * `Number('')` صفر است — و صفر یک شرطِ کاملاً معتبر است («حداقل سود صفر»
 * یعنی ردیف‌های زیان‌ده بیفتند). پس کادرِ خالی نباید از راهِ `Number`
 * رد شود، وگرنه کاربر چیزی ننوشته و جدول شرطی می‌گیرد که نگذاشته.
 */
export function filterLimit(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'boolean') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// ─────────────────────────── نمایه‌ها ───────────────────────────
//
// ستون‌های مشترکِ سرِ هر جدول: «کدام نماد، کدام پاها، کدام سررسید، چند
// روز» — بی این چهارتا هیچ ردیفی قابل بازبینی نیست.
const HEAD = ['underlying', 'legNames', 'expiryLabel', 'strikes', 'days'];
// و دُمِ مشترک: «می‌شود اجرا کرد؟ چقدر؟ چقدر می‌ارزد؟» — همان سؤالی که
// تصمیم را از تحلیل جدا می‌کند.
// «سنِ مظنه» و «وضعیت نماد» در دُمِ هر نمایه‌اند، نه در انتخابگرِ اختیاری:
// در جدولی که ادعایش «زنده» است، نمادِ متوقف نباید عددِ زنده نشان بدهد و
// کاربر باید بتواند تازگی را ببیند بی آنکه دنبالش بگردد.
const TAIL = ['execCost', 'maxQty', 'binding', 'spreadWorstPct',
  'staleSecMax', 'stateLabel', 'qualityLabel', 'warn'];

const GROUP_PROFILES = {
  // ── تک‌پا: بهای ورود در برابر ارزش زمانی ──
  single: {
    note: 'یک پا، زیانِ محدود به بهای خرید. سؤال اصلی: چقدر ارزش زمانی می‌خرم و چقدر تا سربه‌سری فاصله دارم.',
    sortKey: 'retMonthPct',
    columns: [...HEAD, 'netCash', 'be1', 'be1DistPct', 'maxProfit', 'maxLoss', 'retMaxPct', 'retMonthPct',
      'popPct', 'delta', 'theta', 'thetaToCapitalPct', 'timeValue', 'timeValuePctCapital', 'intrinsic',
      'ivMeanPct', 'hvPct', 'ivHvSpreadPp', 'leverage', 'capital', 'valueTotal', 'legValue1', ...TAIL],
    filters: ['minRetMonthPct', 'minPopPct', 'maxBeDistPct', 'maxCapital', 'minDaysLeft', 'maxDaysLeft',
      'minLegValue1', 'minMaxQty', 'maxSpreadWorstPct', 'minOiTotal', 'maxStaleSec', 'onlyTradable', 'onlyExecutable'],
  },
  // ── درآمدی: مثالِ خودِ صاحب پروژه ──
  income: {
    note: 'فروشِ ارزش زمانی. سؤال اصلی: چقدر می‌گیرم، چقدر تا سربه‌سری جا دارم، و اگر قیمت تکان نخورد چه می‌شود.',
    sortKey: 'retMonthPct',
    columns: [...HEAD, 'cashLabel', 'netCash', 'be1', 'be1DistPct', 'beRoomPct',
      'maxProfit', 'maxProfitPct', 'retStaticPct', 'retMaxPct', 'retMonthPct', 'retAnnPct',
      'maxLoss', 'maxLossPct', 'popPct', 'theta', 'thetaToCapitalPct', 'delta',
      'capital', 'capitalLabel', 'margin', 'marginNet', 'blockedAsset', 'sharesLocked',
      'valueTotal', 'legValue1', 'legValue2', ...TAIL],
    filters: ['minRetMonthPct', 'minRetStaticPct', 'minMaxProfit', 'minBeRoomPct', 'minPopPct',
      'maxMargin', 'maxCapital', 'minDaysLeft', 'maxDaysLeft', 'minLegValue1', 'minLegValue2',
      'minMaxQty', 'maxSpreadWorstPct', 'noUnlimitedLoss', 'maxStaleSec', 'onlyTradable', 'onlyExecutable'],
  },
  // ── عمودی: سود و زیان هر دو محدودند، پس نسبتشان معنی دارد ──
  vertical: {
    note: 'هر دو سر بسته است. سؤال اصلی: به ازای هر ریال ریسک چقدر سود، و سربه‌سری کجای دهانه افتاده.',
    sortKey: 'rewardRisk',
    columns: [...HEAD, 'cashLabel', 'netCash', 'be1', 'be1DistPct',
      'maxProfit', 'maxProfitPct', 'maxLoss', 'maxLossPct', 'rewardRisk',
      'retMaxPct', 'retMonthPct', 'retStaticPct', 'popPct', 'staticPnl',
      'capital', 'margin', 'marginNet', 'marginToMaxLoss', 'delta', 'theta',
      'valueTotal', 'legValue1', 'legValue2', ...TAIL],
    filters: ['minRewardRisk', 'minRetMaxPct', 'minRetMonthPct', 'minPopPct', 'minMaxProfit',
      'maxLossCap', 'maxMargin', 'minDaysLeft', 'maxDaysLeft', 'minLegValue1', 'minLegValue2',
      'minMaxQty', 'maxSpreadWorstPct', 'maxStaleSec', 'onlyTradable', 'onlyExecutable'],
  },
  // ── تقویمی و مورب: دو سررسید، پس تتا و شکافِ تلاطم موضوع اصلی‌اند ──
  calendar: {
    note: 'دو سررسید. سؤال اصلی: پای نزدیک چقدر سریع‌تر آب می‌رود، و تلاطمِ دو سررسید چقدر با هم فرق دارد.',
    sortKey: 'thetaToCapitalPct',
    columns: [...HEAD, 'cashLabel', 'netCash', 'maxProfit', 'maxLoss', 'retMaxPct', 'retMonthPct',
      'theta', 'thetaToCapitalPct', 'vega', 'gamma', 'delta',
      'legIv1', 'legIv2', 'ivMeanPct', 'hvPct', 'ivHvSpreadPp', 'sigmaUse',
      'legtheta1', 'legtheta2', 'legvega1', 'legvega2',
      'capital', 'margin', 'marginNet', 'valueTotal', 'legValue1', 'legValue2', ...TAIL],
    filters: ['minThetaToCapitalPct', 'minRetMonthPct', 'minIvHvSpreadPp', 'maxAbsDelta',
      'maxCapital', 'maxMargin', 'minDaysLeft', 'maxDaysLeft', 'minLegValue1', 'minLegValue2',
      'minMaxQty', 'maxSpreadWorstPct', 'maxStaleSec', 'onlyTradable', 'onlyExecutable'],
  },
  // ── تلاطمی: دو سربه‌سری، و پهنای بینشان همان سؤال است ──
  vol: {
    note: 'شرط روی بزرگیِ حرکت، نه جهتش. سؤال اصلی: پهنای بین دو سربه‌سری چقدر است و تلاطم گران است یا ارزان.',
    sortKey: 'ivHvSpreadPp',
    columns: [...HEAD, 'cashLabel', 'netCash', 'beLow', 'beHigh', 'beWidthPct', 'be1DistPct', 'be2DistPct',
      'maxProfit', 'maxLoss', 'maxLossPct', 'retMaxPct', 'retMonthPct', 'popPct',
      'vega', 'gamma', 'theta', 'thetaToCapitalPct', 'delta',
      'sigmaUse', 'ivMeanPct', 'hvPct', 'ivHvSpreadPp',
      'capital', 'margin', 'marginNet', 'conditionalMargin',
      'valueTotal', 'legValue1', 'legValue2', ...TAIL],
    filters: ['minIvHvSpreadPp', 'minBeWidthPct', 'minRetMonthPct', 'minPopPct', 'minVega',
      'maxAbsDelta', 'maxMargin', 'maxCapital', 'minDaysLeft', 'maxDaysLeft',
      'minLegValue1', 'minLegValue2', 'minMaxQty', 'maxSpreadWorstPct', 'maxStaleSec', 'onlyTradable', 'onlyExecutable'],
  },
  // ── بال‌دار: چهار پا، پس هزینهٔ اجرا و پهنای سود موضوع اصلی‌اند ──
  wing: {
    note: 'سه یا چهار پا با سودِ سقف‌دار. سؤال اصلی: نسبت سود به زیان چقدر است و آیا هزینهٔ چهار پا آن را نمی‌خورد.',
    sortKey: 'rewardRisk',
    columns: [...HEAD, 'cashLabel', 'netCash', 'be1', 'be2', 'be3', 'be4', 'beWidthPct',
      'maxProfit', 'maxProfitPct', 'maxLoss', 'maxLossPct', 'rewardRisk',
      'retMaxPct', 'retMonthPct', 'popPct', 'staticPnl',
      'capital', 'margin', 'marginNet', 'delta', 'gamma', 'theta', 'vega',
      'valueTotal', 'legValue1', 'legValue2', 'legValue3', 'legValue4',
      'execCost', 'costCrossing', 'maxQty', 'binding', 'spreadWorstPct',
      'staleSecMax', 'stateLabel', 'qualityLabel', 'warn'],
    filters: ['minRewardRisk', 'minMaxProfit', 'maxLossCap', 'minRetMaxPct', 'minPopPct',
      'maxExecCost', 'maxCapital', 'maxMargin', 'minDaysLeft', 'maxDaysLeft',
      'minLegValue1', 'minLegValue2', 'minLegValue3', 'minLegValue4',
      'minMaxQty', 'maxSpreadWorstPct', 'maxStaleSec', 'onlyTradable', 'onlyExecutable'],
  },
  // ── نسبتی: پای برهنه یعنی وجه تضمین و ریسک لنگ‌زدن ──
  ratio: {
    note: 'تعداد پاها برابر نیست، پس یک سر می‌تواند باز بماند. سؤال اصلی: وجه تضمین چقدر است و اگر یک پا پر نشود چه می‌شود.',
    sortKey: 'retMonthPct',
    columns: [...HEAD, 'cashLabel', 'netCash', 'be1', 'be1DistPct', 'be2', 'be2DistPct',
      'maxProfit', 'maxLoss', 'maxLossPct', 'rewardRisk', 'retMaxPct', 'retMonthPct', 'popPct',
      'margin', 'marginNet', 'conditionalMargin', 'marginToMaxLoss', 'capital',
      'delta', 'gamma', 'vega', 'theta',
      'valueTotal', 'legValue1', 'legValue2', 'legValue3', ...TAIL],
    filters: ['minRetMonthPct', 'minPopPct', 'minRewardRisk', 'maxMargin', 'maxMarginNet',
      'maxAbsDelta', 'maxCapital', 'minDaysLeft', 'maxDaysLeft',
      'minLegValue1', 'minLegValue2', 'minMaxQty', 'maxSpreadWorstPct', 'maxStaleSec', 'onlyTradable', 'onlyExecutable'],
  },
  // ── پوششی: هزینهٔ بیمه در برابر کفِ زیان ──
  hedge: {
    note: 'روی سهمِ موجود بیمه می‌گذارد. سؤال اصلی: کفِ زیان کجاست و بیمه چند درصدِ سرمایه خرج برمی‌دارد.',
    sortKey: 'maxLossPct',
    columns: [...HEAD, 'cashLabel', 'netCash', 'netCashPctCapital', 'be1', 'be1DistPct', 'beRoomPct',
      'maxProfit', 'maxProfitPct', 'maxLoss', 'maxLossPct', 'retMaxPct', 'retMonthPct', 'popPct',
      'capital', 'capitalLabel', 'blockedAsset', 'sharesLocked', 'margin',
      'delta', 'deltaShares', 'theta', 'vega',
      'valueTotal', 'legValue1', 'legValue2', ...TAIL],
    filters: ['maxLossCap', 'minBeRoomPct', 'minRetMonthPct', 'maxCapital',
      'minDaysLeft', 'maxDaysLeft', 'minLegValue1', 'minLegValue2',
      'minMaxQty', 'maxSpreadWorstPct', 'maxStaleSec', 'onlyTradable', 'onlyExecutable'],
  },
  // ── آربیتراژ: سود قطعی است یا نیست؛ هزینهٔ اجرا همه‌چیز است ──
  arb: {
    note: 'سود از اختلافِ قیمت می‌آید نه از جهتِ بازار. سؤال اصلی: بعد از کارمزد و عبور از اسپرد، چیزی می‌ماند.',
    sortKey: 'retAnnPct',
    columns: [...HEAD, 'cashLabel', 'grossCash', 'entryFee', 'netCash', 'staticPnl',
      'maxProfit', 'maxLoss', 'retMaxPct', 'retAnnPct', 'retAnnCompPct',
      'capital', 'margin', 'marginNet', 'delta',
      'execCost', 'execCostPctCapital', 'costCommission', 'costCrossing', 'costSlippage', 'costFunding',
      'valueTotal', 'legValue1', 'legValue2', 'legValue3',
      'maxQty', 'binding', 'spreadWorstPct', 'staleSecMax', 'stateLabel', 'qualityLabel', 'warn'],
    filters: ['minRetAnnPct', 'minMaxProfit', 'maxExecCost', 'maxCapital', 'maxMargin',
      'minDaysLeft', 'maxDaysLeft', 'minLegValue1', 'minLegValue2',
      'minMaxQty', 'maxSpreadWorstPct', 'maxStaleSec', 'onlyTradable', 'onlyExecutable', 'onlyOffsettable'],
  },
};

// نمایهٔ تک‌استراتژی، آنجا که ساختارِ خانواده کافی نیست.
const ID_PROFILES = {
  // کاورد کال: مثالِ صریحِ صاحب پروژه. «اگر فراخوانده شوم» و «اگر تکان
  // نخورد» دو عددِ متفاوت‌اند و هر دو باید در نگاه اول باشند.
  'covered-call': { sortKey: 'retStaticPct' },
  // فروشِ برهنه سقفِ سودش همان دریافتی است؛ آنچه تصمیم را می‌سازد وجه
  // تضمین است، نه بازده.
  'naked-call': { sortKey: 'marginNet' },
  'naked-put': { sortKey: 'marginNet' },
  // استرادل و استرانگلِ خرید بازده دوره‌ای معنی‌دار ندارند (سود نامحدود)؛
  // شکافِ تلاطم همان چیزی است که ارزان یا گران بودن را می‌گوید.
  'long-straddle': { sortKey: 'ivHvSpreadPp' },
  'long-strangle': { sortKey: 'ivHvSpreadPp' },
  'short-straddle': { sortKey: 'retMonthPct' },
  'short-strangle': { sortKey: 'retMonthPct' },
  // باکس سود قطعی دارد یا ندارد؛ بازده سالانه تنها مقیاسِ مقایسه‌اش است.
  box: { sortKey: 'retAnnPct' },
};

/**
 * نمایهٔ رادارِ یک استراتژی.
 *
 * ستون‌ها به دو دلیل غربال می‌شوند و هیچ‌کدام سلیقه نیست:
 *   ۱ ستونی که در قرارداد ستونیِ موتور نباشد، سرستونِ خالی می‌سازد.
 *   ۲ ستونِ «پای ۳» در استراتژیِ دوپا همیشه «—» است و فقط پهنا می‌گیرد.
 *
 * `unknown` خالی نمی‌ماند: آزمون همین را می‌سنجد، وگرنه یک غلطِ املایی در
 * فهرست بالا بی‌صدا یک ستون کم می‌کرد.
 */
export function radarProfile(def) {
  const group = String(def?.group ?? '');
  const base = GROUP_PROFILES[group] || GROUP_PROFILES.single;
  const override = ID_PROFILES[String(def?.id ?? '')] || {};
  const legs = Math.max(1, (def?.legs || []).length);
  const wanted = override.columns || base.columns;
  const unknown = [];
  const columns = [];
  for (const key of wanted) {
    if (!COLUMN_KEYS.has(key)) { unknown.push(key); continue; }
    const leg = LEG_COLUMN.exec(key);
    if (leg && Number(leg[2]) > legs) continue;
    if (!columns.includes(key)) columns.push(key);
  }
  const filters = (override.filters || base.filters)
    .filter((key) => {
      const filter = FILTER_BY_KEY.get(key);
      if (!filter) { unknown.push(key); return false; }
      const leg = LEG_COLUMN.exec(filter.field);
      return !leg || Number(leg[2]) <= legs;
    })
    .map((key) => FILTER_BY_KEY.get(key));
  const sortKey = override.sortKey || base.sortKey;
  return {
    group, legs, columns, filters, unknown,
    sortKey: COLUMN_KEYS.has(sortKey) ? sortKey : 'retMonthPct',
    note: override.note || base.note,
  };
}

// ─────────────────────────── اعمالِ فیلتر ───────────────────────────

/**
 * آیا این ردیف از این فیلتر رد می‌شود؟
 *
 * ═══ ردیفی که عددش را ندارد، نمی‌گذرد ═══
 *
 * این تصمیمِ صریحِ قاعدهٔ صداقت عددی است. کاربر می‌گوید «بازده ماهانه
 * دست‌کم ۵ درصد». ردیفی که بازده ماهانه‌اش `NaN` است، **ثابت نکرده** که
 * پنج درصد بازده دارد. نگه‌داشتنش یعنی جدول ردیفی نشان بدهد که شرط را
 * برآورده نکرده. پس می‌افتد — ولی بی‌صدا نمی‌افتد: `applyRadarFilters`
 * جدا می‌شمارد چند ردیف به‌خاطرِ **نداشتنِ داده** افتاد، تا خالی‌بودنِ
 * جدول با «داده نداریم» اشتباه گرفته نشود.
 */
export function passesFilter(row, filter, value) {
  if (!filter) return { pass: true, missing: false };
  if (filter.cmp === 'flag') return { pass: row?.[filter.field] === true, missing: false };
  if (filter.cmp === 'notFlag') return { pass: row?.[filter.field] !== true, missing: false };
  const limit = filterLimit(value);
  if (limit === null) return { pass: true, missing: false };
  const raw = Number(row?.[filter.field]);
  // «نامحدود» عددِ نداشته نیست؛ یک واقعیتِ سنجیدنی است.
  //
  // زیانِ نامحدود در این موتور `+Infinity` است، نه منفی — چون زیان همه‌جا
  // **اندازه** نوشته می‌شود. هر دو سو اینجا سنجیده می‌شوند، ولی آن یکی
  // محافظ است نه حالتِ واقعی.
  if (raw === Infinity || raw === -Infinity) {
    if (filter.cmp === 'gte') return { pass: raw === Infinity, missing: false };
    if (filter.cmp === 'lte') return { pass: raw === -Infinity, missing: false };
    return { pass: false, missing: false };          // absLte روی نامحدود هرگز
  }
  if (!Number.isFinite(raw)) return { pass: false, missing: true };
  if (filter.cmp === 'gte') return { pass: raw >= limit, missing: false };
  if (filter.cmp === 'lte') return { pass: raw <= limit, missing: false };
  if (filter.cmp === 'absLte') return { pass: Math.abs(raw) <= limit, missing: false };
  return { pass: true, missing: false };
}

/**
 * فیلترها را روی ردیف‌ها می‌گذارد و می‌گوید چه چیزی افتاد و چرا.
 *
 * `values` نگاشتِ `کلید فیلتر → عدد یا true` است. مقدارِ خالی یعنی فیلتر
 * خاموش، پس فیلترِ روشن‌نشده هیچ ردیفی را نمی‌اندازد.
 */
export function applyRadarFilters(rows = [], values = {}, filters = RADAR_FILTERS) {
  const active = filters.filter((filter) => {
    const value = values?.[filter.key];
    return isFlagFilter(filter) ? value === true : filterLimit(value) !== null;
  });
  if (!active.length) return { rows: [...rows], dropped: 0, missing: 0, by: {}, active: [] };
  const by = {};
  let dropped = 0, missing = 0;
  const kept = [];
  for (const row of rows) {
    let ok = true, lacked = false;
    for (const filter of active) {
      const verdict = passesFilter(row, filter, values[filter.key]);
      if (verdict.pass) continue;
      ok = false;
      lacked = lacked || verdict.missing;
      by[filter.key] = (by[filter.key] || 0) + 1;
    }
    if (ok) kept.push(row);
    else { dropped += 1; if (lacked) missing += 1; }
  }
  return { rows: kept, dropped, missing, by, active };
}
