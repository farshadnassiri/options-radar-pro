// ۶۲. تاریخ تولتیپ نمودار ریزمعامله
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { replayIntraday } from '../../core/backtest.mjs';
import { dateParts, historyDateLabel } from '../../core/history.mjs';


// ═════════ ۶۲. تاریخ تولتیپ، و پایداری انتخاب ترکیب ═════════
group('۶۲. تاریخ تولتیپ نمودار ریزمعامله');
{
  // `replayIntraday` تاریخ را روی نقاط نمی‌گذارد — ثانیهٔ درون‌روز می‌دهد،
  // نه روز — پس رابط باید روزِ باز را مهر بزند. تا امروز `replay.endDate`
  // را می‌زد که ثابت است و با کلیک روی ردیف عوض نمی‌شود؛ نتیجه این بود که
  // هر چهار نمودار درون‌روز، تاریخِ روز آخرِ بازه را نشان می‌دادند بی‌آنکه
  // هیچ عددی غلط شود. همین آن را سخت‌یاب می‌کرد.
  const btSrc = readSrc('../ui/tabs/backtest.mjs');
  check('نقاط نمودار با روزِ باز مهر می‌خورند، نه با روز پایان بازه',
    btSrc.includes('intradayChartRows(intraday, intradayDate)')
    && !btSrc.includes('intradayChartRows(intraday, replay.endDate)'));
  check('تاریخ تولتیپ از خودِ نقطه می‌آید و نقطهٔ بی‌تاریخ «—» می‌گیرد',
    readSrc('../ui/track-chart.mjs').includes("Number.isFinite(Number(row.date)) ? dateLabel(row.date) : '—'"));
  // درصد در تولتیپ باید واحد داشته باشد: عنوان محور کنارش نیست و «۱۲٫۳۵»
  // تنها، نه ریال است نه درصد.
  check('عدد درصدی در تولتیپ واحد می‌گیرد', readSrc('../ui/track-chart.mjs').includes('const tipLabel ='));

  // ریشهٔ «NaN/NaN/NaN»: تاریخ نامعتبر از `dateParts` رد می‌شد و `{0,0,0}`
  // می‌ساخت. بدتر از برچسب خراب، `dateUtc` بود که از همان صفر یک تاریخ
  // واقعی در ۱۸۹۹ می‌ساخت و بی‌سروصدا وارد محاسبه می‌شد.
  check('تاریخ صفر و ماه/روز بیرون از دامنه، تاریخ شمرده نمی‌شوند',
    dateParts(0) === null && dateParts(20260000) === null && dateParts(20261301) === null
    && dateParts(20260832) === null);
  check('و برچسبشان «—» است، نه NaN',
    historyDateLabel(0) === '—' && historyDateLabel(undefined) === '—');
  check('تاریخ معتبر دست‌نخورده می‌ماند',
    historyDateLabel(20260819) === '1405/05/28' && dateParts(20260819).d === 19);
}
