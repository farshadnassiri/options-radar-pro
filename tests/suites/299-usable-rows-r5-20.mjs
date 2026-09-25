// ۲۹۹. نوارِ بریده در هیچ تبی رسم نمی‌شود — فقط گفته نمی‌شود (R5-20)
//
// از R5-13 چهار تب (نمای باز، آزمون همه استراتژی‌ها، رصد یونانی، رادار
// اسپرد) حکمِ هر ابزار/روز را می‌خواندند و **هشدار** می‌دادند، ولی همان
// ردیف‌های بریده را باز هم به جدول و نمودار می‌دادند. نموداری که بخشی از
// روزش افتاده، شکلِ یک حرکتِ واقعیِ بازار را دارد. حالا قاعدهٔ آزمایشگاه
// (R5-19) یک جا نوشته شده و همه از آن می‌گذرند.

import { check, group, readSrc } from '../harness.mjs';
import { tapeVerdict, usableRows } from '../../ui/tape-intake.mjs';

const rows = [{ nTran: 1 }, { nTran: 2 }];

group('۲۹۹. کدام نوار قابلِ رسم است');
{
  check('کامل: همان ردیف‌ها', usableRows({ rows, complete: true, verified: true }) === rows);
  const quiet = usableRows({ rows: [], complete: true, quiet: true });
  check('بی‌معاملهٔ تأییدشده: آرایهٔ خالی — «معامله نشد»', Array.isArray(quiet) && quiet.length === 0);
  check('نوارِ پرِ بی‌تابلو (پای منقضی) رسم می‌شود — ردش همهٔ روزهای قرارداد را می‌انداخت',
    usableRows({ rows, complete: false, verified: false }) === rows);
  check('ناقصِ ثابت‌شده: `null`',
    usableRows({ rows, complete: false, verified: true, shortfall: { trades: 50 } }) === null);
  check('سهمیه: `null`، حتی با ردیف', usableRows({ rows, throttled: true }) === null);
  check('خطا: `null`', usableRows({ rows: [], error: 'timeout' }) === null);
  check('خالیِ بی‌مرجع: `null` — «نمی‌دانیم» با «معامله نشد» یکی نیست',
    usableRows({ rows: [], complete: false, verified: false }) === null);
  check('پاسخِ نیامده: `null`', usableRows(undefined) === null && usableRows(null) === null);
  const item = { rows, complete: true };
  check('حکمِ از پیش ساخته هم پذیرفته می‌شود', usableRows(item, tapeVerdict(item)) === rows);
}

group('۲۹۹. هر مصرف‌کنندهٔ نوارِ تاریخی از همین قاعده می‌گذرد');
{
  const ov = readSrc('../ui/tabs/open-view.mjs');
  check('نمای باز: قراردادِ ناقص از جدول و نمودار کنار می‌رود و شمرده می‌شود',
    ov.includes('const rows = usableRows(item, got.verdicts[key]);')
    && ov.includes('if (rows) tradesByKey[key] = rows; else dropped.push(key);')
    && ov.includes('قرارداد چون نوارش کامل نرسید از جدول و نمودار کنار رفت')
    && !ov.includes('[key, item.rows || []]'));
  check('و پایهٔ ناقص نمودارِ وابسته به پایه نمی‌سازد',
    ov.includes('if (dropped.includes(`${selectedDate}:${ua.ins}`)) {'));

  const gw = readSrc('../ui/tabs/greeks-watch.mjs');
  check('رصد یونانی: روزی که یک پایش کامل نرسید کنار می‌رود',
    gw.includes('return usableRows(item, verdict);')
    && gw.includes("item.status === 'rejected' || item.value[1] === null"));
  check('و پیامش دیگر «روی دادهٔ ناقص ساخته شده» نیست',
    !gw.includes('یونانی‌ها و نمودارِ مسیر روی دادهٔ ناقص ساخته شده‌اند')
    && gw.includes('روزهایشان کنار گذاشته شد'));

  const pb = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('آزمون همه استراتژی‌ها: سنجشِ ساعت‌به‌ساعت نوارِ ناقص را «نرسید» می‌شمارد',
    pb.includes('const rows = usableRows(got, verdict);') && pb.includes('if (!rows) throw new Error(verdict.state);'));
  check('و لحظهٔ سنجشِ همهٔ ترکیب‌ها قیمت را از نوارِ بریده نمی‌گیرد',
    pb.includes('return [ins, usableRows(payload, verdict), payload.emptyBoth === true];')
    && pb.includes('if (!rows) { if (!blank) failed += 1; continue; }'));

  const sr = readSrc('../ui/tabs/spread-radar.mjs');
  check('رادار اسپرد: شکافِ درون‌روزی روی نوارِ بریده رسم نمی‌شود',
    sr.includes('const rows = usableRows(got.items?.[key], got.verdicts?.[key]);')
    && sr.includes('نمودار روی نوار بریده ساخته نمی‌شود')
    && !sr.includes('?.rows || [];\n'));
}
