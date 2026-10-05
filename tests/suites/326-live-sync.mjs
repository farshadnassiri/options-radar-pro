// ۳۲۶. رصد لحظه‌ای: به‌روزرسانی پس از بستن و یک عدد در همه‌جا (۱۴۰۵/۰۷/۱۳)
//
// گزارش صاحب پروژه، ساعت ۱۲:۳۵:
//   ۱. «رصد لحظه‌ای اطلاعات را الان درست نشان نمی‌دهد ولی حین بازار درست
//      بود… خیلی دیر به‌روز شد.» پس از ۱۲:۳۰ فقط هر ۳۰۰ ثانیه می‌پرسیدیم.
//   ۲. «با هاور روی نقشهٔ بازار اختیار اطلاعات درست نیستند… ارزش معاملات
//      اطلس در جدول، در نقشه، در زنجیره و هر جایی یکسان باشد.» راهنمای نقشه
//      جمع ارزش اختیارها را «ارزش معامله» می‌نامید، و دیده‌بان زنجیره
//      گردش خودِ پایه را صفر می‌نوشت.

import { check, group, readSrc } from '../harness.mjs';
import { afterCloseDue, afterCloseState } from '../../core/watch-snapshot.mjs';
import { buildChain, underlyingList } from '../../core/chain.mjs';
import { mapTooltipLines } from '../../ui/map-tooltip.mjs';

group('۳۲۶-الف. دقیقه‌های نخست پس از بستن، تند');
{
  const today = 20261005, now = 1_800_000_000_000;
  const base = { phase: 'after', today, now, everySec: 300, maxPulls: 12, fastSec: 15, settleMin: 15 };
  const w = (ageSec, extra = {}) => ({ day: today, at: now - ageSec * 1000, ...extra });
  check('۵ دقیقه پس از بستن، عکسِ ۲۰ ثانیه‌ای دوباره پرسیده می‌شود (پیش از این تا ۳۰۰ ثانیه صبر)', afterCloseDue({ ...base, minutesSinceClose: 5, watch: w(20) }));
  check('… ولی نه زودتر از فاصلهٔ تند', !afterCloseDue({ ...base, minutesSinceClose: 5, watch: w(10) }));
  check('در پنجرهٔ تند سقف شمار جلویش را نمی‌گیرد', afterCloseDue({ ...base, minutesSinceClose: 5, watch: w(20, { afterPulls: 99 }) }));
  check('پس از پنجره همان آهنگ کُند و سقف', !afterCloseDue({ ...base, minutesSinceClose: 20, watch: w(60) }) && afterCloseDue({ ...base, minutesSinceClose: 20, watch: w(301) })
    && !afterCloseDue({ ...base, minutesSinceClose: 20, watch: w(900, { afterPulls: 12 }) }));
  check('صداکنندهٔ قدیمی (بی پارامتر تازه) همان رفتار پیشین', !afterCloseDue({ phase: 'after', today, now, watch: w(60) }) && afterCloseDue({ phase: 'after', today, now, watch: w(300) }));
  const prev = { day: today, afterPulls: 0, finalDay: 0 };
  check('دو عکسِ یکسان در دقیقه‌های نخست هنوز «نهایی» نیست', afterCloseState({ phase: 'after', today, prev, changedCount: 0, minutesSinceClose: 3, settleMin: 15 }).finalDay === 0);
  check('پس از پنجره، عکسِ بی‌تغییر نهایی است', afterCloseState({ phase: 'after', today, prev, changedCount: 0, minutesSinceClose: 16, settleMin: 15 }).finalDay === today);
  check('پنجرهٔ تند در سقف شمار حساب نمی‌شود', afterCloseState({ phase: 'after', today, prev, changedCount: 4, minutesSinceClose: 3, settleMin: 15 }).afterPulls === 0);
  const server = readSrc('../server/server.mjs');
  check('حلقهٔ دیده‌بان پنجرهٔ تند را از تنظیمات می‌دهد', server.includes('settleMin: num(S.afterCloseSettleMin, 15)') && server.includes('...settle,'));
}

group('۳۲۶-ب. یک عدد در همه‌جا');
{
  // دیده‌بان اختیار میدان گردشِ پایه را ندارد.
  const row = { uaInsCode: '1', lval30_UA: 'اطلس', pDrCotVal_UA: 169350, pClosing_UA: 168848, priceYesterday_UA: 169723, strikePrice: 170000, remainedDay: 20, endDate: 20261025, contractSize: 1000,
    insCode_C: 'C', lVal18AFC_C: 'ضطلس', qTotCap_C: 5e9, qTotTran5J_C: 30, insCode_P: 'P', lVal18AFC_P: 'ططلس', qTotCap_P: 1e9, qTotTran5J_P: 10 };
  const ua = underlyingList(buildChain([row]))[0];
  check('گردشِ نیامدهٔ پایه نامعلوم است، نه صفر', Number.isNaN(ua.uaValue) && Number.isNaN(ua.uaVolume));
  const withUa = underlyingList(buildChain([{ ...row, qTotCap_UA: 1_163_424e6 }]))[0];
  check('اگر بیاید همان عدد', withUa.uaValue === 1_163_424e6);

  const lines = mapTooltipLines({ name: 'اطلس', uaValue: 1_163_424e6, value: 14_216e6, callValue: 12_443e6, putValue: 1_773e6, volume: 2719, oi: 10389, tradeLast: 169350, close: 168848, yday: 169723 }, { mode: 'underlyings', metricKey: 'value', metricLabel: 'جمع ارزش کال و پوت', metricText: 'x' });
  check('راهنمای نقشه: ارزش خودِ پایه و ارزش اختیارها هر کدام با نام خودش',
    lines.some((l) => l.startsWith('ارزش معاملات خودِ اطلس:') && l.includes('۱,۱۶۳,۴۲۴')) && lines.some((l) => l.startsWith('ارزش معاملات اختیارهای آن:') && l.includes('۱۴,۲۱۶'))
    && !lines.some((l) => l.startsWith('ارزش معامله:')), lines.join(' | '));
  check('سنجه‌ای که خودش در سطرهاست تکرار نمی‌شود', !lines.some((l) => l.startsWith('اندازهٔ خانه')));
  check('راهنما قیمت آخرین و پایانی هم دارد', lines[0].startsWith('آخرین') && lines[0].includes('پایانی'));
  const c = mapTooltipLines({ value: 3e9, volume: 12, trades: 4, oi: 300, tradeLast: 100, close: 98, yday: 95 }, { mode: 'contracts', dateText: '۱۴۰۵/۰۸/۰۳' });
  check('حالت قرارداد: ارزش، حجم، تعداد، موقعیت باز و سررسید', c.some((l) => l.startsWith('ارزش معاملهٔ این قرارداد')) && c.some((l) => l.includes('تعداد معامله')) && c.some((l) => l.startsWith('سررسید')));

  const map = readSrc('../ui/live-market-map.mjs');
  check('نقشه راهنما را از همان ردیف universe می‌سازد', map.includes('mapTooltipLines(data.row') && map.includes('uaValue: row.uaValue') && !map.includes('ارزش معامله: ${fmt.rialText(data.optionValue)}'));
  const worker = readSrc('../worker/scan-worker.mjs');
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('گردش پایهٔ داشبورد به زنجیرهٔ ریسه می‌رود (دیده‌بان زنجیره همان عدد)', worker.includes("m.type === 'ua-turnover'") && worker.includes('ua.value = t.value')
    && dash.includes('pushUaTurnover(payload.universe?.underlyings'));
}
