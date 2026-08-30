// ۲۰۳. شبکهٔ لحظه‌های درون‌روزی

import { check, group, readSrc } from '../harness.mjs';
import {
  DEFAULT_GRAIN, MOMENT_GRAINS, grainMeta, intradayCost, isIntradayGrain,
  momentDate, momentKey, momentLabel, momentSecond, momentsFor, normalizeGrain,
} from '../../core/intraday-grid.mjs';
import { INTRADAY_END_SECOND, INTRADAY_START_SECOND } from '../../core/backtest.mjs';

group('۲۰۳. شبکهٔ لحظه‌های درون‌روزی');
{
  check('شش دانه‌بندی با برچسب و توضیح تعریف شده',
    MOMENT_GRAINS.length === 6 && MOMENT_GRAINS.every((row) => row.id && row.label && row.hint));
  check('پیش‌فرض همان روزانه است', DEFAULT_GRAIN === 'day' && grainMeta('day').minutes === 0);
  check('دانه‌بندی نامعتبر به روزانه برمی‌گردد', normalizeGrain('چرند') === 'day');
  check('روزانه، درون‌روزی شمرده نمی‌شود', isIntradayGrain('day') === false && isIntradayGrain('m5') === true);
  check('روزانه هیچ لحظه‌ای نمی‌سازد', momentsFor('day').length === 0);

  // ── لحظه‌ها داخل جلسه می‌مانند ───────────────────────────────────────
  for (const grain of ['m60', 'm30', 'm15', 'm5', 'm1']) {
    const moments = momentsFor(grain);
    check(`لحظه‌های ${grain} همه داخل جلسه‌اند`,
      moments.length > 0
      && moments.every((second) => second > INTRADAY_START_SECOND && second <= INTRADAY_END_SECOND),
      `${moments.length} لحظه`);
  }
  // در ثانیهٔ صفرِ جلسه هنوز معامله‌ای نشده؛ ستونی که همیشه خالی است، ستون نیست.
  check('نخستین لحظه، آغاز جلسه نیست',
    momentsFor('m30')[0] === INTRADAY_START_SECOND + 1800, String(momentsFor('m30')[0]));
  check('آخرین لحظه به پایان جلسه چسبیده تا معامله‌های آخر جا نمانند',
    ['m60', 'm30', 'm15', 'm5', 'm1'].every((grain) => momentsFor(grain).at(-1) === INTRADAY_END_SECOND));
  check('لحظه‌ها مرتب و بی‌تکرارند',
    ['m60', 'm5'].every((grain) => {
      const moments = momentsFor(grain);
      return moments.every((value, index) => index === 0 || value > moments[index - 1]);
    }));
  check('دانهٔ ریزتر، لحظهٔ بیشتری می‌سازد',
    momentsFor('m1').length > momentsFor('m5').length
    && momentsFor('m5').length > momentsFor('m15').length
    && momentsFor('m15').length > momentsFor('m30').length
    && momentsFor('m30').length > momentsFor('m60').length);

  // ── کلید ستون ───────────────────────────────────────────────────────
  const key203 = momentKey(20260801, 34200);
  check('کلید لحظه، تاریخ و ثانیه را در یک عدد مرتب‌شدنی می‌گذارد',
    momentDate(key203) === 20260801 && momentSecond(key203) === 34200, String(key203));
  check('لحظه‌های یک روز به ترتیب ثانیه مرتب می‌شوند',
    momentKey(20260801, 34200) < momentKey(20260801, 36000));
  check('روز بعد همیشه بعد از همهٔ لحظه‌های امروز می‌آید',
    momentKey(20260801, INTRADAY_END_SECOND) < momentKey(20260802, INTRADAY_START_SECOND));

  check('برچسب لحظه با رقم فارسی نوشته می‌شود',
    momentLabel(34200) === '۰۹:۳۰' && momentLabel(45000) === '۱۲:۳۰', momentLabel(34200));
  check('برچسب لحظهٔ نامعتبر نمی‌شکند', momentLabel(null) === '۰۰:۰۰');

  // ── هزینه پیش از فشردن دکمه ─────────────────────────────────────────
  // عددی که بعد از فشردن دکمه معلوم شود، هشدار نیست؛ عذرخواهی است.
  const cost203 = intradayCost({ instruments: 60, grain: 'm5' });
  check('شمار درخواست و لحظه پیش از اجرا معلوم است',
    cost203.requests === 60 && cost203.moments === momentsFor('m5').length, JSON.stringify(cost203));
  check('روزانه هزینهٔ لحظه‌ای ندارد', intradayCost({ instruments: 60, grain: 'day' }).moments === 0);

  // ── ریسه ────────────────────────────────────────────────────────────
  const worker203 = readSrc('../worker/history-worker.mjs');
  check('ریسه شاخهٔ درون‌روزی دارد', worker203.includes("m.type === 'portfolio-intraday'"));
  // اگر در هر لحظه از نو غربال می‌شد، فهرست استراتژی‌ها بین دو ستون فرق
  // می‌کرد و نقشه ستون‌هایی با جمعیت‌های متفاوت نشان می‌داد.
  // برشِ دقیقِ همان شاخه، نه پنجرهٔ نویسه‌ای: پنجره تا شاخهٔ روزانه کش
  // می‌آمد و ادعا را الکی رد می‌کرد.
  const branch203 = worker203.slice(
    worker203.indexOf("if (m.type === 'portfolio-intraday')"),
    worker203.indexOf("if (m.type === 'portfolio')"),
  );
  check('ترکیب‌ها از نو ساخته نمی‌شوند، همان‌های پذیرفته‌شده‌اند',
    branch203.includes('for (const combo of m.combos)')
    && !branch203.includes('generateHistoricalCombos'));
  check('لحظه‌ای که هیچ ابزاری معامله نداشته، ستون خالی می‌ماند نه جعلی',
    worker203.includes('if (!marked.marked) {') && worker203.includes('marked: marked.marked'));
  check('پیشرفت لحظه‌به‌لحظه گزارش می‌شود',
    worker203.includes("type: 'portfolio-intraday-progress'"));
  check('همان موتور بازپخش به کار می‌رود، نه یک حساب موازی',
    branch203.includes('replayHistory({') && branch203.includes('exitBasis: m.exitBasis,'));
}
