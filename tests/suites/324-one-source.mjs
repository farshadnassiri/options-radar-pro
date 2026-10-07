// ۳۲۴. رصد لحظه‌ای: هر عدد یک منبع (۱۴۰۵/۰۷/۱۳)
//
// گزارش صاحب پروژه: «ارزش معامله در تب رصد لحظه‌ای در جاهای مختلف با هم
// تفاوت دارد… در زنجیرهٔ قرارداد یک عدد و در کندل قیمت امروز قراردادها یک
// عدد دیگر؛ همین‌طور حجم و موقعیت باز — چه در تایم بازار چه خارج آن.»
//
// علت: زنجیره، نقشه، آمار سررسید و جدول‌ها از عکس دیده‌بان (هر ۵ ثانیه)
// و کندل از `/api/infos` (تا ۳۰ ثانیه کش)؛ پیش از بازگشایی پاسخ اطلاعات
// می‌توانست مال جلسهٔ دیگری باشد. روکش قیمت ریسهٔ غربال هم پس از یک غربال
// یخ می‌زد. جدول قراردادهای «نگاه باز» ارزش یک سطل را با نام کل روز می‌گفت.

import { check, group, readSrc } from '../harness.mjs';
import { mergeRangeInfo, infoIsFresh } from '../../core/range-info.mjs';

const watchRow = { ins: 'C1', name: 'ضفزر729', tradeLast: 83100, last: 83100, close: 83400, yday: 81000,
  value: 5_516_563_710_000, volume: 8306, trades: 2000, oi: 12011 };

group('۳۲۴-الف. کندل همان عددهای زنجیره را دارد');
{
  // پاسخ اطلاعات از ۳۰ ثانیه قبل: ارزش و حجم و تعداد کمتر، سقف روز پایین‌تر.
  const older = { first: 80000, low: 79000, high: 83000, last: 82900, close: 83300, yday: 81000,
    value: 5_400_000_000_000, volume: 8100, vol: 8100, trades: 1950 };
  const m = mergeRangeInfo(watchRow, older);
  check('ارزش، حجم، تعداد و موقعیت باز = ردیف زنجیره، در هر حالت',
    m.value === watchRow.value && m.volume === watchRow.volume && m.trades === watchRow.trades && m.oi === watchRow.oi);
  check('آخرین و پایانی = ردیف زنجیره', m.last === 83100 && m.close === 83400);
  check('پاسخ کهنه‌ترِ همان جلسه: سایه گسترده می‌شود تا آخرین و پایانی عکس را بگیرد',
    m.rangeSource === 'infoLag' && m.rangeLag === 50 && m.high === 83400 && m.low === 79000 && m.first === 80000);
  const same = mergeRangeInfo(watchRow, { ...older, high: 86000, trades: 2000 });
  check('هم‌لحظه: سایه همان پاسخ است', same.rangeSource === 'info' && same.high === 86000);
  // پیش از بازگشایی: پاسخ اطلاعات روز تازه را دارد (پایانی دیروزش = پایانی عکس).
  const next = mergeRangeInfo(watchRow, { first: 0, low: 0, high: 0, yday: 83400, trades: 0, value: 0 });
  check('پاسخ جلسهٔ دیگر کنار گذاشته می‌شود و کندل عددی از آن نمی‌گیرد',
    next.rangeSource === 'otherSession' && Number.isNaN(next.low) && next.value === watchRow.value);
  const idle = mergeRangeInfo({ ...watchRow, tradeLast: NaN, trades: 0, last: 83400 }, { first: 0, low: 0, high: 0, yday: 81000, trades: 0 });
  check('قرارداد بی‌معامله: «آخرین» نامعلوم و کندلی ساخته نمی‌شود', Number.isNaN(idle.last) && Number.isNaN(idle.low));
  check('بی پاسخ: سایه نامعلوم، بقیه همان ردیف', mergeRangeInfo(watchRow, null).rangeSource === 'none' && mergeRangeInfo(watchRow, null).value === watchRow.value);
}

group('۳۲۴-ب. روکش قیمت ریسهٔ غربال یخ نمی‌زند');
{
  check('پاسخ تازه‌تر یا هم‌لحظه پذیرفته می‌شود', infoIsFresh({ trades: 2000, yday: 81000 }, watchRow) && infoIsFresh({ trades: 2100 }, watchRow));
  check('پاسخ کهنه‌تر از ردیف دیده‌بان پذیرفته نمی‌شود', !infoIsFresh({ trades: 1950, yday: 81000 }, watchRow));
  check('پاسخ جلسهٔ دیگر پذیرفته نمی‌شود', !infoIsFresh({ trades: 5000, yday: 83400 }, watchRow));
  const worker = readSrc('../worker/scan-worker.mjs');
  check('ریسه قیمت روکش را فقط با همین قاعده می‌نشاند', worker.includes('const fresh = infoIsFresh(o, q);')
    && worker.includes('if (fresh && o.close) q.close = o.close;') && worker.includes('if (fresh && o.last) q.last = o.last;'));
}

group('۳۲۴-ج. سیم‌کشی رابط');
{
  const map = readSrc('../ui/live-market-map.mjs');
  // کندل امروز از ۱۴۰۵/۰۷/۱۵ در تب خودش است؛ ادغام در `candleRecord`.
  const candles = readSrc('../ui/contract-candles-view.mjs');
  const candleCore = readSrc('../core/contract-candles.mjs');
  check('کندل با mergeRangeInfo از همان ردیف زنجیره ساخته می‌شود',
    candleCore.includes('const merged = mergeRangeInfo(row, info);')
    && candles.includes("candleRecord(row, { info: infoCache.get(String(row.ins))?.info || null"));
  check('وضعیت کندل می‌گوید عددها همان زنجیره‌اند و پاسخ جلسهٔ دیگر کنار رفت', candles.includes('همان عدد زنجیره‌اند') && candles.includes('مال جلسهٔ دیگری بود'));
  const ov = readSrc('../ui/tabs/open-view.mjs');
  check('نگاه باز: ارزش و حجم سطل با نام سطل، نه کل روز', ov.includes('contractTable(items, { bucket: true })') && ov.includes("const scope = bucket ? ' همین سطل' : '';"));
  check('نگاه باز: ارزش با واحد ریال', ov.includes('<td>${fmt.rialText(item.value)}</td>') && !ov.includes('مجموع ارزش ${fmt.money('));
}
