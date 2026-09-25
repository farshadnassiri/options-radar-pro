// ۳۰۱. بریدگیِ نمودار علتش را زیرِ خودش می‌گوید، و لاگ نامِ نماد دارد (R5-22)
//
// گزارشِ صاحب پروژه با فایلِ جریانِ داده: «نمودارِ آزمایشگاه ناقص است.»
// لاگ نشان داد هر ۱۲ ابزار/روز کامل رسیده بود؛ علت بازار بود. پای
// `52631478606575330` روزِ ۲۵ شهریور فقط ۱۵ معامله داشت، از ۱۱:۴۹:۱۱ تا
// ۱۲:۱۹:۲۹، و روزِ ۲۱ شهریور ۵ معامله از ۰۹:۳۸ تا ۱۱:۴۰. عددهای پایین
// همان عددهای فایل‌اند.

import { check, group, readSrc } from '../harness.mjs';
import { PRICE_WINDOW_SLACK_SECONDS, dayPriceWindow, priceWindowGaps } from '../../core/backtest.mjs';
import { insFromPath, learnNames } from '../../core/datalog.mjs';

group('۳۰۱. پنجرهٔ قیمتِ کامل، با عددهای لاگِ واقعی');
{
  const day25 = dayPriceWindow([
    { name: 'پای کم‌معامله', times: [114911, 115500, 121929] },
    { name: 'پای دوم', times: [90856, 122959] },
  ]);
  check('۲۵ شهریور: نمودار از ۱۱:۴۹ شروع می‌شود و مقصر نام‌برده است',
    day25.first.second === 11 * 3600 + 49 * 60 + 11 && day25.first.name === 'پای کم‌معامله' && day25.first.trades === 3);
  check('و این بریدگی گزارش می‌شود، ولی پایانِ ۱۲:۱۹ (کمتر از یک ربع) نه',
    priceWindowGaps(day25).late === true && priceWindowGaps(day25).early === false);

  const day21 = dayPriceWindow([
    { name: 'پای کم‌معامله', times: [93805, 104000, 114002] },
    { name: 'پای دوم', times: [93907, 122728] },
  ]);
  check('۲۱ شهریور: شروعِ ۰۹:۳۹ و پایانِ ۱۱:۴۰ هر دو گزارش می‌شوند',
    priceWindowGaps(day21).late === true && priceWindowGaps(day21).early === true
    && day21.last.name === 'پای کم‌معامله');

  const liquid = dayPriceWindow([{ name: 'a', times: [90101, 122913] }, { name: 'b', times: [90101, 122950] }]);
  check('روزِ پرمعامله هیچ یادداشتی نمی‌گیرد', !priceWindowGaps(liquid).late && !priceWindowGaps(liquid).early);
  check('معاملهٔ بیرون از جلسه (مثلاً ۱۶:۱۷) پنجره را دراز نمی‌کند',
    dayPriceWindow([{ name: 'a', times: [90416, 122950, 161754] }]).last.second === 12 * 3600 + 29 * 60 + 50);
  const silent = dayPriceWindow([{ name: 'a', times: [] }, { name: 'b', times: [100000] }]);
  check('پای بی‌معامله پنجره نمی‌سازد و نامش برمی‌گردد', silent.first === null && silent.silent.join() === 'a');
  check('مرزِ گزارش یک ربع است', PRICE_WINDOW_SLACK_SECONDS === 900);
}

group('۳۰۱. نامِ نماد کنارِ کد');
{
  const names = new Map();
  const learned = learnNames(names, { instrumentOptMarketWatch: [
    { insCode_C: '52631478606575330', lVal18AFC_C: 'ضهرم۷۰۱۲', insCode_P: '1266274977247565', lVal18AFC_P: 'طهرم۷۰۱۲', uaInsCode: '17914401175772326', lVal18AFC_UA: 'اهرم' },
  ] });
  check('از دیده‌بانِ اختیار: کال، پوت و پایه',
    learned === 3 && names.get('52631478606575330') === 'ضهرم۷۰۱۲' && names.get('17914401175772326') === 'اهرم');
  learnNames(names, { instrumentInfo: { insCode: '99999999999999999', lVal18AFC: 'ضستا۱' } });
  check('از مشخصاتِ ابزار', names.get('99999999999999999') === 'ضستا۱');
  check('کدِ ابزار از مسیرِ TSETMC',
    insFromPath('/Trade/GetTradeHistory/52631478606575330/20260916/false') === '52631478606575330'
    && insFromPath('/ClosingPrice/GetClosingPriceDailyList/1266274977247565/0') === '1266274977247565'
    && insFromPath('/Instrument/GetInstrumentOptionMarketWatch/0') === '');
  check('ورودیِ خراب چیزی یاد نمی‌دهد', learnNames(names, null) === 0 && learnNames(names, { instrumentOptMarketWatch: [{ insCode_C: 'x', lVal18AFC_C: 'y' }] }) === 0);
}

group('۳۰۱. سیم‌کشی');
{
  const back = readSrc('../ui/tabs/backtest.mjs');
  check('آزمایشگاه یادداشت را زیرِ نمودار می‌نشاند',
    back.includes('<div id="bt-tf-gaps"') && back.includes('    paintPriceWindows();')
    && back.includes('بریدگی‌های نمودار از خودِ بازار است، نه از دریافتِ داده.'));
  const server = readSrc('../server/server.mjs');
  check('سرور نام را یاد می‌گیرد و روی ردیف‌ها می‌گذارد',
    server.includes('learnNames(dlNames, data);') && server.includes('name: dlNameOf(fields.path)')
    && server.includes('...(names.length ? { names } : {}),'));
  const tool = readSrc('../tools/datalog.mjs');
  check('ابزارِ خطِ فرمان جدولِ ابزار/روز را چاپ می‌کند', tool.includes('ریزمعامله به تفکیکِ ابزار و روز'));
}

group('۳۰۱. جریانِ داده در پنجرهٔ جدا، و فیلترهای ماندگار (R5-23)');
{
  const tab = readSrc('../ui/tabs/datalog.mjs');
  const page = readSrc('../ui/datalog.html');
  check('دکمهٔ «باز کردن در پنجرهٔ جدا» — و در خودِ پنجرهٔ جدا نه',
    tab.includes('id="dl-popout" href="/ui/datalog.html" target="datalog"') && tab.includes("${standalone ? '' :"));
  check('صفحهٔ جدا همان تب را سوار می‌کند و پوششِ fetch را نصب نمی‌کند',
    page.includes("await import('/ui/tabs/datalog.mjs')") && page.includes('{ standalone: true }')
    && !page.includes('installDataLog'));
  check('فیلترها با جابه‌جاییِ تب نمی‌روند',
    tab.includes("const PREFS_KEY = 'datalog.filters';") && tab.includes('const prefs = readPrefs();')
    && tab.includes("$('dl-live').addEventListener('change', savePrefs);"));
  check('جداکنندهٔ «·» کنارِ شمارش نیست — شبیهِ «۰» خوانده می‌شد',
    tab.includes("`: ${fmt.int(count)}`") && !tab.includes("` · ${fmt.int(count)}`"));
}
