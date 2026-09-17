// ۲۵۸. صدک فاصله مظنه و نرخ معامله‌شدن هر سررسید
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { spreadPercentile } from '../../core/decision-dashboard.mjs';

group('۲۵۸. صدک فاصله مظنه در تابلوی امروز');
{
  const sorted = [1, 2, 3, 4, 5];
  check('تنگ‌ترین، صدکِ صفر می‌گیرد', spreadPercentile(sorted, 1) === 0);
  check('گشادترین، بالاترین صدک را می‌گیرد', near(spreadPercentile(sorted, 5), 80));
  check('وسط، صدک وسط', near(spreadPercentile(sorted, 3), 40));
  // تعریف «چند درصدِ تابلو تنگ‌تر از این است» با مقادیر برابر هم باید
  // همان بماند: دو قرارداد با اسپرد یکسان، صدکِ یکسان می‌گیرند.
  check('اسپردهای برابر صدک برابر می‌گیرند',
    spreadPercentile([2, 2, 2, 5], 2) === spreadPercentile([2, 2, 2, 5], 2)
    && spreadPercentile([2, 2, 2, 5], 2) === 0);
  check('قراردادی که در فهرست نیست هم بر مبنای همان توزیع سنجیده می‌شود',
    near(spreadPercentile(sorted, 3.5), 60));

  // نداشتنِ اسپرد، اسپردِ بد نیست.
  check('اسپردِ نبوده صدک نمی‌گیرد', Number.isNaN(spreadPercentile(sorted, NaN)));
  // «تنگ‌ترینِ یک قرارداد» ادعایی دربارهٔ بازار نیست.
  check('با کمتر از دو نمونه، صدک ساخته نمی‌شود',
    Number.isNaN(spreadPercentile([3], 3)) && Number.isNaN(spreadPercentile([], 1)));

  const src = readSrc('../core/decision-dashboard.mjs');
  check('صدک روی همهٔ قراردادهای همان عکس ساخته می‌شود',
    src.includes('contract.spreadRankPct = spreadPercentile(spreadSorted, contract.spreadPct)'));
  // این محدودیت باید در کد نوشته بماند، وگرنه فردا کسی «میانگین تاریخی
  // اسپرد» می‌سازد از چیزی که اسپرد نیست.
  check('چرایی نبودِ مقایسهٔ تاریخی در کد نوشته شده',
    src.includes('دفترِ سفارشِ روزهای گذشته **ذخیره نمی‌شود**'));

  const ui = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('ستون صدک اعلام شده و برچسب فارسی دارد',
    ui.includes("col('spreadRankPct'") && ui.includes('صدک فاصله مظنه'));
  check('نمای تنگ‌ترین‌های تابلو از کم به زیاد مرتب می‌شود',
    ui.includes("['spread-rank-table', 'تنگ‌ترین‌های تابلوی امروز', 'table-asc', 'contracts', 'spreadRankPct']"));
  // `tradedPct` از قبل در موتور بود و هیچ نمایی نداشت — سنجه‌ای که دیده
  // نمی‌شود، سنجه نیست.
  check('نرخ معامله‌شدن هر سررسید نما دارد',
    ui.includes("['expiry-traded-pct', 'نرخ معامله‌شدن هر سررسید', 'bar', 'expiries', 'tradedPct']"));
  check('و برچسبِ راهنمای هر دو سنجه تعریف شده',
    ui.includes('spreadRankPct: [') && ui.includes('tradedPct: ['));
}
