// ۲۵۷. مقایسهٔ ساختارها روی یک نماد، و پالایهٔ اجراپذیری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { strategyMissReason, emptyFunnel } from '../../core/scan.mjs';
import { COMPARE_KEYS, compareCell, strategyCompareHtml } from '../../ui/strategy-compare-view.mjs';

group('۲۵۷. مقایسهٔ ساختارها روی یک نماد');
{
  // ——— چرا این ساختار حرفی نزد ———
  const f = (patch) => ({ ...emptyFunnel(), ...patch });
  check('بی ترکیبِ ساخته‌شده، علتش نبودِ قرارداد است',
    strategyMissReason(f({ built: 0 })).includes('در تابلو نیست'));
  // ترتیب عمدی: تنظیمِ کاربر بر نبودِ داده می‌چربد، چون اولی یک کلیک
  // اصلاح می‌شود و دومی نمی‌شود.
  check('مبنای مرجع بر بی‌مظنه می‌چربد',
    strategyMissReason(f({ built: 5, refBasis: 3, noQuote: 2 })).includes('مرجع'));
  check('بی‌مظنه پیش از عمق می‌آید',
    strategyMissReason(f({ built: 5, noQuote: 3, noDepth: 2 })).includes('مظنه'));
  check('عمق ناکافی علت خودش را دارد',
    strategyMissReason(f({ built: 5, noDepth: 2 })).includes('عمق'));
  check('فیلترِ خودِ کاربر هم صریح گفته می‌شود',
    strategyMissReason(f({ built: 5, filtered: 5 })).includes('فیلتر'));
  check('هیچ حالتی بی‌جمله نمی‌ماند',
    strategyMissReason(f({ built: 5 })).length > 0);

  // ——— جدول مقایسه ———
  const row = (patch) => ({
    strategyId: 'x', underlying: 'اهرم', legsText: '+۱ کال', retMonthPct: 12.5,
    maxProfit: 5e6, maxLoss: 2e6, rewardRisk: 2.5, beRoomPct: 4.2, popPct: 61, ...patch,
  });
  const list = [
    { id: 'a', name: 'Bull Call Spread', best: row({ retMonthPct: 20 }), count: 12, reason: '' },
    { id: 'b', name: 'Covered Call', best: row({ retMonthPct: 8 }), count: 200, reason: '' },
    { id: 'c', name: 'Iron Condor', best: null, count: 0, reason: 'پای این ترکیب‌ها مظنهٔ قابل اجرا ندارد' },
  ];
  const html = strategyCompareHtml(list, { rankBy: 'retMonthPct', uaName: 'اهرم' });
  check('هر ساختارِ دارای ردیف، دقیقاً یک سطرِ قابل کلیک دارد',
    (html.match(/data-strategy="/g) || []).length === 2);
  // سطرِ غایب، تفاوتِ «جواب نمی‌دهد» با «قیمتی نداشت» را پنهان می‌کند.
  check('ساختارِ بی‌ردیف حذف نمی‌شود، با علتش می‌ماند',
    html.includes('Iron Condor') && html.includes('مظنهٔ قابل اجرا ندارد'));
  check('ساختارِ بی‌ردیف قابل کلیک نیست', !html.includes('data-strategy="c"'));
  check('شمار ترکیب‌ها ستون دارد — یک عدد از دو گزینه با یک عدد از دویست فرق دارد',
    html.includes('چند ترکیب'));
  check('معیارِ رتبه‌بندی صریح گفته می‌شود، وگرنه «بهترین» یعنی «از نظر کی؟»',
    html.includes('بر مبنای'));
  check('ستون‌های مقایسه، ستون‌های تصمیم‌اند', COMPARE_KEYS.includes('retMonthPct')
    && COMPARE_KEYS.includes('maxLoss') && COMPARE_KEYS.includes('rewardRisk'));
  check('بی اسکن، جدولی ساخته نمی‌شود', strategyCompareHtml([]).includes('اسکنی انجام نشده'));

  // ——— خانه‌ها ———
  check('درصد با نشان درصد و رقم فارسی می‌آید',
    compareCell(row(), 'retMonthPct') === `${compareCell(row(), 'retMonthPct')}`
    && compareCell(row(), 'retMonthPct').includes('٪'));
  // بی‌نهایت عدد نیست ولی «نداشته» هم نیست: زیانِ نامحدود خبر است.
  check('زیان نامحدود «نامحدود» می‌شود، نه «—»',
    compareCell(row({ maxLoss: Infinity }), 'maxLoss') === 'نامحدود');
  check('عددِ نبوده «—» می‌شود', compareCell(row({ popPct: NaN }), 'popPct') === '—');

  // ——— قرارداد موتور و تب‌ها ———
  const scanSrc = readSrc('../core/scan.mjs');
  check('بهترینِ هر ساختار پیش از برشِ خروجی ساخته می‌شود',
    scanSrc.includes('byStrategy.push(') && scanSrc.includes('best: res.rows[0] || null'));
  check('ساختارِ بی‌ردیف ته فهرست می‌نشیند، نه اینکه حذف شود',
    scanSrc.includes('byStrategy.sort('));
  // شیء payoff تابع دارد؛ بهترینِ یک ساختار می‌تواند بیرونِ برش باشد و اگر
  // از همان در رد نشود، کلِ postMessage با «could not be cloned» می‌افتد.
  check('ریسه، payoff را از بهترینِ هر ساختار هم برمی‌دارد',
    readSrc('../worker/scan-worker.mjs').includes('for (const item of res.byStrategy || []) strip(item.best);'));
  check('تب برترین موقعیت‌ها جدول مقایسه را از موتور می‌گیرد، نه از ردیف‌های بریده',
    readSrc('../ui/tabs/top.mjs').includes('drawCompare(res.byStrategy, res.rankBy)'));

  const sxSrc = readSrc('../ui/tabs/strategy-explorer.mjs');
  check('فهرست ساختارها پالایهٔ اجراپذیری دارد', sxSrc.includes('id="sx-feasible"'));
  check('اجراناپذیرها همیشه ته گروه می‌نشینند، حتی بی پالایه',
    sxSrc.includes('a.feasible === b.feasible ? 0 : (a.feasible ? -1 : 1)'));
  check('و پالایه، شمارِ «چند از چند» را هم عوض می‌کند',
    sxSrc.includes('const filtered = query || onlyFeasible'));
}
