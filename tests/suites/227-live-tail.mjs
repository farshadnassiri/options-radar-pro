// ۲۲۷. امروز کنار گذشته — دنبالهٔ زنده روی روند تاریخی
//
// ═══ دو خواستهٔ صاحب پروژه، یک ساختار ═══
//
// «در بررسی لایو بازار، نمودارهای تاریخی و روند گذشته نیز قابل رویت
// باشد، ولی با رنگ یا شکلی متفاوت از آن قبلی‌ها.» و: «رصدگر لحظه‌ای در
// هر زمان از روز در تایم معاملاتی که اجرا می‌شود، از شروع بازار تا آن
// لحظه را هم نشون بده.»
//
// هر دو یک چیز می‌خواهند: سریِ روزانه تا دیروز، و ریزمعاملهٔ امروز از
// آغاز جلسه، پشت سر هم روی یک محور — و از هم قابل تشخیص.
//
// ═══ چرا الحاق و نه دو نمودار کنار هم ═══
//
// پرسش «امروز نسبت به روند گذشته کجاست» با دو محورِ مستقل جواب نمی‌گیرد.

import { check, group, readSrc } from '../harness.mjs';
import { hasLiveTail, joinLive } from '../../core/spread-gap-series.mjs';
import { gapBandChart, gapPathChart } from '../../ui/gap-charts.mjs';

// نشانه‌های نمودار، با همان کلیدهایی که `chartTokens()` می‌سازد.
const TOKENS = {
  muted: '#888', line: '#ccc', lineSoft: '#eee', accent: '#06f', accent2: '#65f',
  accentSoft: '#cdf', warn: '#fa0', gain: '#0a0', loss: '#a00',
  series: ['#1', '#2', '#3', '#4', '#5', '#6'],
};
const leg = (name, side, scaled) => ({ ins: name, name, side, scaled });
const dayPoint = (label, current, a, b) => ({
  label, current, anchor: 4000, anchored: true, coveragePct: 60, roomPct: 40,
  basePrice: 50000, legs: [leg('ضهرم۵۰', 'buy', a), leg('ضهرم۵۴', 'sell', b)],
});
const DAILY = {
  points: [dayPoint('۱', 2000, 3000, 1000), dayPoint('۲', 2200, 3200, 1000)],
  grain: 'day',
};
const TODAY = {
  points: [dayPoint('۰۹:۰۰', 2300, 3300, 1000), dayPoint('۰۹:۰۵', 2400, 3400, 1000)],
  day: 20260905,
};

group('۲۲۷-الف. چسباندن امروز به گذشته');
{
  const joined = joinLive(DAILY, TODAY);
  check('نقاط پشت سر هم می‌آیند و ترتیبشان حفظ می‌شود',
    joined.points.map((point) => point.label).join(',') === '۱,۲,۰۹:۰۰,۰۹:۰۵');
  check('فقط نقاط امروز علامتِ زنده می‌گیرند',
    joined.points.map((point) => (point.live ? 'ز' : 'گ')).join('') === 'گگزز');
  check('مرزِ دو بخش صریح است، تا نمودار بداند از کجا شکل عوض کند',
    joined.liveFrom === 2 && hasLiveTail(joined) === true);
  // دانه‌بندی مخلوط است: سطلِ هفتگیِ «دو روز و ده دقیقه» عددی می‌دهد که
  // معنی ندارد، پس تایم‌فریم روی چنین سری‌ای اعمال نمی‌شود.
  check('دانه‌بندی «مخلوط» علامت می‌خورد',
    joined.grain === 'mixed' && joined.day === 20260905);
  check('آماره از کلِ سری بازحساب می‌شود، نه فقط از گذشته',
    joined.stats.max === 2400 && joined.stats.min === 2000);

  // نوارِ خالی، سریِ روزانه را دست‌نخورده برمی‌گرداند — نه اینکه سری را
  // خالی کند یا «امروز»ی بسازد که نیست.
  const none = joinLive(DAILY, { points: [] });
  check('بی نوارِ امروز، همان سریِ روزانه برمی‌گردد و علامتِ زنده نمی‌خورد',
    none.points.length === 2 && hasLiveTail(none) === false);
}

group('۲۲۷-ب. شکلِ متفاوت — نه فقط رنگ');
{
  const plain = gapPathChart(DAILY, { anchor: 4000 })(null, TOKENS);
  check('بی دنبالهٔ زنده، یک سری است و نامش همان «فاصلهٔ اکنون»',
    plain.series.length === 1 && plain.series[0].name === 'فاصلهٔ اکنون');

  const withTail = gapPathChart(joinLive(DAILY, TODAY), { anchor: 4000 })(null, TOKENS);
  check('با دنبالهٔ زنده، دو سری می‌شود و هرکدام نامِ خودش را می‌گوید',
    withTail.series.length === 2
    && withTail.series[0].name === 'روند گذشته — روزانه'
    && withTail.series[1].name === 'امروز — از شروع بازار',
    withTail.series.map((one) => one.name).join(' | '));
  // ═══ سه نشانهٔ جدا ═══
  //
  // رنگ به تنهایی کافی نیست: کاربر کوررنگ دو خط را یکی می‌بیند. پس
  // نوعِ خط و برچسبِ انتها هم فرق می‌کنند.
  check('دنبالهٔ امروز رنگ، نوعِ خط و برچسبِ انتهای خودش را دارد',
    withTail.series[1].lineStyle.color === TOKENS.accent2
    && withTail.series[1].lineStyle.type === 'dotted'
    && withTail.series[1].endLabel.show === true);
  check('و خطِ گذشته پیوسته می‌ماند، با رنگِ اصلی',
    withTail.series[0].lineStyle.color === TOKENS.accent
    && withTail.series[0].lineStyle.type === undefined);

  // ── دو خط باید به هم وصل باشند ──────────────────────────────────────
  //
  // اگر دنبالهٔ زنده دقیقاً از مرز شروع شود، خطش از هوا شروع می‌شود و
  // پرش دیده می‌شود. یک نقطه عقب‌تر شروع می‌شود تا وصل باشد.
  check('دو خط در نقطهٔ مرزی هم‌پوشانی دارند، تا پرش دیده نشود',
    withTail.series[0].data.filter((value) => value != null).length === 2
    && withTail.series[1].data[1] === 2200 && withTail.series[1].data[0] === null,
    JSON.stringify(withTail.series.map((one) => one.data)));
  check('سقفِ ساختاری فقط یک بار کشیده می‌شود، روی سریِ زنده',
    !withTail.series[0].markLine && !!withTail.series[1].markLine);
}

group('۲۲۷-ج. نمودار دو نرخ هم امروز را جدا می‌کشد');
{
  const band = gapBandChart(joinLive(DAILY, TODAY), { mode: 'spread', anchor: 4000 })(null, TOKENS);
  const names = band.series.map((one) => one.name);
  check('برای هر پا یک خطِ گذشته و یک خطِ امروز هست',
    names.includes('خرید ضهرم۵۰') && names.includes('خرید ضهرم۵۰ — امروز')
    && names.includes('فروش ضهرم۵۴') && names.includes('فروش ضهرم۵۴ — امروز'),
    names.join(' | '));
  const past = band.series.find((one) => one.name === 'خرید ضهرم۵۰');
  const live = band.series.find((one) => one.name === 'خرید ضهرم۵۰ — امروز');
  check('خطِ گذشته سرِ مرز تمام می‌شود و خطِ امروز از همان‌جا ادامه می‌دهد',
    past.data[2] === null && live.data[1] === 3200 && live.data[0] === null,
    `${JSON.stringify(past.data)} / ${JSON.stringify(live.data)}`);
  check('و امروز خط‌چین است، با همان رنگِ همان پا',
    live.lineStyle.type === 'dotted' && live.lineStyle.color === past.lineStyle.color);

  const plainBand = gapBandChart(DAILY, { mode: 'spread', anchor: 4000 })(null, TOKENS);
  check('بی دنبالهٔ زنده، خطِ «امروز»ی ساخته نمی‌شود',
    !plainBand.series.some((one) => one.name.includes('امروز')));
}

group('۲۲۷-د. رابط: از شروع بازار تا همین لحظه');
{
  const src = readSrc('../ui/tabs/spread-radar.mjs');
  // تاریخِ امروز از ساعتِ تهران می‌آید، نه از ساعتِ مرورگر — کاربری که
  // مرورگرش روی منطقهٔ دیگری است نباید نوارِ روز اشتباه بگیرد.
  check('تاریخِ امروز از ساعت تهران گرفته می‌شود',
    src.includes('tehranDateNumber()')
    && src.includes("from '/core/live-day.mjs'"));
  check('هر تیکِ رصد زنده، نوارِ امروز را تازه می‌کند',
    src.includes('void refreshLiveTail()'));
  // ریزمعاملهٔ هر پا یک درخواست است. گرفتنش برای هر ردیفِ جدول، صد ترکیب
  // را به دویست درخواست در هر تیک تبدیل می‌کرد.
  check('نوار فقط برای ترکیبِ باز گرفته می‌شود، نه برای هر ردیف',
    /const row = selectedRow\(\);\s*\n\s*if \(!row \|\| liveTailBusy\) return;/.test(src));
  check('و دو درخواستِ هم‌زمان روی هم نمی‌افتند',
    src.includes('liveTailBusy = true') && src.includes('liveTailBusy = false'));
  check('خاموش‌کردنِ رصد، دنباله را هم پاک می‌کند',
    /liveSeries = null; liveTailKey = '';\s*\n\s*liveKeys\.clear\(\);/.test(src));
  // نبودِ نوارِ امروز نباید رصد زنده را بخواباند: مظنه هنوز می‌آید.
  check('شکستِ دریافتِ نوار، رصد زنده را نمی‌خواباند',
    src.includes('ریزمعاملهٔ امروز دریافت نشد'));
  check('دنباله فقط به سریِ روزانه می‌چسبد، نه به سریِ درون‌روزی',
    src.includes("const tail = !intraday && liveSeries && liveTailKey === row.key ? liveSeries : null;"));
}
