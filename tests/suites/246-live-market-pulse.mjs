// ۲۴۶. نبض زنده بازار و نمودار بازهٔ تعاملی

import { check, near, group, readSrc } from '../harness.mjs';
import { appendMarketPulseHistory, marketPulseSnapshot } from '../../core/live-market-pulse.mjs';

group('۲۴۶. نبض زنده بازار و بازهٔ تعاملی');

const universe246 = {
  underlyings: [
    { ins: '11', name: 'اهرم', changePct: 2.5, value: 1_000, volume: 10 },
    { ins: '22', name: 'توان', changePct: -1.2, value: 500, volume: 5 },
  ],
  contracts: [
    { kind: 'call', value: 1_000, volume: 10, trades: 2, oi: 100, oiYday: 90, bid: 10, bidQty: 2, ask: 12, askQty: 3, size: 1_000 },
    { kind: 'put', value: 500, volume: 5, trades: 1, oi: 80, oiYday: 75, bid: 8, bidQty: 4, ask: 9, askQty: 5, size: 1_000 },
  ],
};
const books246 = {
  11: { book: [{ bid: 100, bidQty: 10, ask: 101, askQty: 5 }, { bid: 99, bidQty: 4, ask: 102, askQty: 3 }] },
  22: { book: [{ bid: 200, bidQty: 2, ask: 202, askQty: 4 }] },
};

const pulse246 = marketPulseSnapshot(universe246, books246);
check('جمع ارزش، شمار قرارداد معامله‌شده و موقعیت باز کال و پوت مستقل می‌ماند',
  pulse246.tradedContracts === 2 && pulse246.callValue === 1_000 && pulse246.putValue === 500
  && pulse246.optionValue === 1_500 && pulse246.callOi === 100 && pulse246.putOi === 80);
check('تغییر موقعیت باز فقط از مقایسهٔ امروز و دیروز ساخته می‌شود',
  pulse246.callOiChange === 10 && pulse246.putOiChange === 5);
check('ارزش سفارش اختیار، اندازهٔ همان قرارداد را در قیمت و تعداد ضرب می‌کند',
  pulse246.callBuyOrders === 20_000 && pulse246.callSellOrders === 36_000
  && pulse246.putBuyOrders === 32_000 && pulse246.putSellOrders === 45_000);
check('پنج ردیف دفتر پایه جمع می‌شوند و پوشش کامل گزارش می‌شود',
  pulse246.baseBuyOrders === 1_796 && pulse246.baseSellOrders === 1_619
  && pulse246.baseBookCovered === 2 && pulse246.baseBookTotal === 2);

const partial246 = marketPulseSnapshot(universe246, { 11: books246[11] });
check('دفتر ناقص به‌جای جمع ناقص، مقدار نامعلوم می‌دهد',
  Number.isNaN(partial246.baseBuyOrders) && Number.isNaN(partial246.baseSellOrders)
  && partial246.baseBookCovered === 1);
const missingSize246 = marketPulseSnapshot({ ...universe246, contracts: [{ ...universe246.contracts[0], size: 0 }, universe246.contracts[1]] }, books246);
check('اندازهٔ قرارداد گمشده، ارزش سفارش آن سمت را ساختگی صفر نمی‌کند',
  Number.isNaN(missingSize246.callBuyOrders) && Number.isNaN(missingSize246.callSellOrders));

const first246 = appendMarketPulseHistory([], { ...pulse246, at: 1_000, second: 32_400, time: 90000 });
const second246 = appendMarketPulseHistory(first246, {
  ...pulse246, callValue: 1_300, putValue: 620, optionValue: 1_920,
  optionVolume: 19, optionTrades: 5, at: 2_000, second: 32_460, time: 90100,
});
check('شدت معامله از اختلاف دو عکس واقعی ساخته می‌شود و عکس نخست شدت ندارد',
  Number.isNaN(first246[0].optionIntensityValue)
  && second246[1].callIntensityValue === 300 && second246[1].putIntensityValue === 120
  && second246[1].optionIntensityValue === 420 && second246[1].optionIntensityVolume === 4
  && second246[1].optionIntensityTrades === 2);
const upsert246 = appendMarketPulseHistory(second246, { ...second246[1], at: 2_100, second: 32_460 });
check('عکس هم‌ثانیه جایگزین می‌شود و تاریخچه را باد نمی‌کند', upsert246.length === 2);
const reset246 = appendMarketPulseHistory(second246, { ...pulse246, optionValue: 100, at: 3_000, second: 32_520, time: 90200 });
check('کاهش شمارندهٔ تجمعی جلسه را عوض‌شده می‌داند و شدت منفی جعلی نمی‌سازد',
  reset246.length === 1 && Number.isNaN(reset246[0].optionIntensityValue));

const pulseUi246 = readSrc('../ui/live-market-pulse.mjs');
const dashboard246 = readSrc('../ui/tabs/live-market-dashboard.mjs');
const rangeUi246 = readSrc('../ui/live-market-map.mjs');
const chartUi246 = readSrc('../ui/tabs/live-market.mjs');
check('هر هفت نمودار در نبض زنده حضور دارند', [
  'محدوده قیمتی آخرین معاملات', 'روند ارزش سفارش‌های خرید و فروش',
  'روند نمادهای مثبت و منفی', 'موقعیت باز کال و پوت', 'شدت معاملات اختیار',
  'روند ارزش سفارش‌های اختیار', 'روند موقعیت‌های باز سهام',
].every((label) => pulseUi246.includes(label)));
check('نبض بعد از نقشه و پیش از نماهای قدیمی نصب می‌شود و دفتر پایه را دسته‌ای می‌گیرد',
  dashboard246.indexOf('id="dd-market-explorer"') < dashboard246.indexOf('id="dd-market-pulse"')
  && dashboard246.indexOf('id="dd-market-pulse"') < dashboard246.indexOf('class="decision-advanced"')
  && dashboard246.includes('/api/books?ins=') && dashboard246.includes('PULSE_BOOK_INTERVAL_MS'));
check('نمودار بازه با کلیک باز می‌ماند و هر پنج قیمت را در جزئیات می‌گوید',
  rangeUi246.includes('data-lmm-range-focus') && rangeUi246.includes('aria-expanded="false"')
  && rangeUi246.includes('mountCandlePoints')
  && ['کمینه', 'اولین', 'آخرین', 'پایانی', 'بیشینه'].every((label) => rangeUi246.includes(label)));
check('نمودارهای روند نقطهٔ انتهایی و راهنمای تعاملی دارند',
  chartUi246.includes('live-market-series-end') && chartUi246.includes("addEventListener('pointermove'"));
check('دامنهٔ تغییر قیمت دوطرف صفر متقارن است', near(Math.max(...pulse246.priceChanges.map((row) => Math.abs(row.changePct))), 2.5));
