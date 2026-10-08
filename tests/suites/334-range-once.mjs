// ۳۳۴. بازه یک بار پرسیده می‌شود (۱۴۰۵/۰۷/۱۶)
//
// «چرا در نگاه باز چندروزه… وقتی بازه زمانی می‌دهم دوباره آن پایین در
// کشویی بازه زمانی از من می‌خواهد؟ این منطق را در سراسر برنامه اصلاح کن.»
//
// «نگاه باز» زیرِ گام ۱ دو کشوییِ «از/تا تاریخ» داشت با پیش‌فرضِ بیست روزِ
// آخر، و «تحلیل تاریخی» دو چرخِ «شروع/پایان» با پیش‌فرضِ پانزده روزِ آخر —
// هیچ‌کدام بازهٔ گام ۱ نبودند. حالا هر دو همان بازه را می‌خوانند.

import { check, group, readSrc } from '../harness.mjs';
import { clipRangeToDates } from '../../core/history-range.mjs';

group('۳۳۴. بازهٔ گام ۱ روی روزهای داده‌دار');
{
  const days = [20261005, 20261001, 20261007, 20261008, 20261012];
  const span = clipRangeToDates(days, { from: 20261002, to: 20261010 });
  check('نخستین روزِ داده‌دار از `from` و واپسین تا `to`', span.from === 20261005 && span.to === 20261008 && span.days === 3);
  check('بازهٔ بزرگ‌تر از داده، به داده بریده می‌شود', JSON.stringify(clipRangeToDates(days, { from: 20250101, to: 20271231 })) === JSON.stringify({ from: 20261001, to: 20261012, days: 5 }));
  check('بازهٔ بی‌روزِ داده‌دار تهی است، نه «همهٔ تاریخچه»', clipRangeToDates(days, { from: 20261101, to: 20261130 }) === null);
  check('بی بازه، کلِ روزهای موجود', clipRangeToDates(days).from === 20261001 && clipRangeToDates(days).to === 20261012);
  check('بازهٔ وارونه هم درست خوانده می‌شود', clipRangeToDates(days, { from: 20261010, to: 20261002 }).from === 20261005);
  check('بی روز، تهی', clipRangeToDates([], { from: 1, to: 2 }) === null && clipRangeToDates(['', null, 0]) === null);
}

group('۳۳۴. هیچ تبی بازه را دوباره نمی‌پرسد');
{
  const ov = readSrc('../ui/tabs/open-view.mjs');
  check('«نگاه باز» کشوییِ «از تاریخ / تا تاریخ» ندارد',
    !ov.includes('از تاریخ<select id="ov-from"') && !ov.includes('تا تاریخ<select id="ov-to"')
    && ov.includes('<input type="hidden" id="ov-from"><input type="hidden" id="ov-to">'));
  check('«نگاه باز» بازه را از گام ۱ می‌خواند، نه بیست روزِ آخر',
    ov.includes('const span = clipRangeToDates(dates, rangeUi?.range);') && !ov.includes('dates[Math.max(0, dates.length - 20)]'));
  check('بازهٔ تازهٔ گام ۱ بی دریافتِ دوباره روی همان تاریخچه می‌نشیند',
    ov.includes('if (daily && spanDates.length) { if (syncSpan()) computeDaily();'));

  const hist = readSrc('../ui/tabs/history.mjs');
  check('«تحلیل تاریخی» چرخ‌های شروع/پایان را از گام ۱ پر می‌کند، نه پانزده روزِ آخر',
    hist.includes('const span = clipRangeToDates(dates, rangeUi?.range);') && hist.includes("mountDateWheel($('h-start'), dates, span?.from ?? dates[0]")
    && hist.includes("mountDateWheel($('h-end'), dates, span?.to ?? dates.at(-1)") && !hist.includes('dates[Math.max(0, dates.length - 15)]'));
  check('چرخ‌ها دیده نمی‌شوند؛ بازه فقط‌خواندنی نوشته می‌شود',
    hist.includes('<div class="date-wheel-grid" hidden>') && hist.includes('· از گام ۱`;'));
  check('بازهٔ بی‌داده بی‌صدا به همهٔ تاریخچه نمی‌رسد',
    hist.includes("if (!clipRangeToDates(dates, rangeUi?.range)) throw new Error("));
}
