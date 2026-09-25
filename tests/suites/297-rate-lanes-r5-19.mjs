// ۲۹۷. دو خطِ سهمیه، و آزمایشگاهی که پای منقضی را دور نمی‌ریزد (R5-19)
//
// گزارشِ صاحب پروژه: «از وقتی روی تب خروجی دیتا کار کردیم، سرعت برنامه در
// بقیهٔ قسمت‌ها پایین آمده و آزمایشگاه آپشن نمودارها را درست ترسیم نمی‌کند.»
// اندازه‌گیری روی ۴ ابزار × ۳۰ روز:
//
//   پیش از کارِ خروجی  ۳٫۸ ثانیه · ۳۰/۳۰ روز · ولی نوارِ نقد ۴٬۵۰۰ از ۱۲٬۰۰۰
//   main              ۴۹ ثانیه · ۳۰/۳۰ روز · کامل
//   اصلاحِ Codex       ۴۹ ثانیه · **۰/۳۰ روز** — پای منقضی کلِ نمودار را انداخت
//   این نسخه           ۴۴ ثانیه · ۳۰/۳۰ روز · کامل · ۱۹۵ درخواست به‌جای ۲۷۰
//
// و ۶۰ درخواستِ عمومی (تابلوی روزانه): main ۴٫۲ ثانیه، این نسخه ۰٫۷.

import { check, group, readSrc } from '../harness.mjs';
import { GENERAL_LANE, TAPE_LANE, laneLimits, laneOf, makeBucket } from '../../server/rate-lanes.mjs';
import { SCHEMA } from '../../core/settings.mjs';

group('۲۹۷. کدام درخواست در کدام خط');
{
  check('ریزمعاملهٔ تاریخی به خطِ محتاط می‌رود',
    laneOf('/Trade/GetTradeHistory/123/20260916/false') === TAPE_LANE
    && laneOf('/Trade/GetTradeHistory/123/20260916/true') === TAPE_LANE);
  check('نوارِ زندهٔ امروز نه — سهمیهٔ «پاسخِ خالی» روی آن دیده نشده',
    laneOf('/Trade/GetTrade/123') === GENERAL_LANE);
  check('و تابلوی روزانه، مشخصات، دیده‌بان و دفترِ سفارش هم نه',
    ['/ClosingPrice/GetClosingPriceDaily/1/20260916', '/Instrument/GetInstrumentInfo/1',
      '/Instrument/GetInstrumentOptionMarketWatch/0', '/BestLimits/1']
      .every((path) => laneOf(path) === GENERAL_LANE));
}

group('۲۹۷. سقف‌ها از تنظیمات، با پیش‌فرضِ درست');
{
  const def = Object.fromEntries(SCHEMA.map((f) => [f.key, f.def]));
  check('خطِ عمومی به عددهای پیش از R5-08 برگشت',
    def.ratePerSec === 12 && def.burst === 20 && def.concurrency === 6);
  check('و خطِ ریزمعامله همان سقفِ محتاط را نگه داشت',
    def.tapeRatePerSec === 3 && def.tapeBurst === 6 && def.tapeConcurrency === 2);
  check('هر دو از تنظیماتِ زنده خوانده می‌شوند',
    laneLimits({ tapeRatePerSec: 5, tapeBurst: 7, tapeConcurrency: 1 }, TAPE_LANE).rate === 5
    && laneLimits({ ratePerSec: 9 }, GENERAL_LANE).rate === 9);
  check('و مقدارِ خراب به پیش‌فرض برمی‌گردد، نه به صفر',
    laneLimits({ tapeRatePerSec: 0 }, TAPE_LANE).rate === 3 && laneLimits({}, GENERAL_LANE).concurrency === 6);

  const shipped = JSON.parse(readSrc('../data/settings.json'));
  check('فایلِ تنظیماتِ مخزن هم همین را دارد — وگرنه پیش‌فرضِ تازه هرگز اعمال نمی‌شد',
    shipped.ratePerSec === 12 && shipped.concurrency === 6 && shipped.tapeRatePerSec === 3);
}

group('۲۹۷. سطلِ ژتون');
{
  let t = 0;
  let limits = { rate: 2, burst: 3, concurrency: 1 };
  const bucket = makeBucket(() => limits, () => t);
  check('ظرفیتِ انفجاری بی‌صبر خرج می‌شود', [bucket.take(), bucket.take(), bucket.take()].every((w) => w === 0));
  check('و بعد صبر به اندازهٔ نرخ', bucket.take() === 500);
  t += 1000;
  check('با گذشتِ زمان ژتون برمی‌گردد', bucket.take() === 0);
  limits = { rate: 2, burst: 1, concurrency: 1 };
  t += 10000; bucket.clamp();
  check('پایین‌آمدنِ ظرفیت در تنظیمات فوراً اثر می‌کند', bucket.take() === 0 && bucket.take() > 0);
}

group('۲۹۷. نگهبانِ منبع');
{
  const server = readSrc('../server/server.mjs');
  check('سرور دو صف دارد، هر کدام با سقفِ خودش',
    server.includes('const queues = { [TAPE_LANE]: queueFor(TAPE_LANE), [GENERAL_LANE]: queueFor(GENERAL_LANE) };')
    && server.includes('concurrency: () => laneLimits(S, lane).concurrency,'));
  check('و ارثِ اولویت به صفِ درست می‌رود',
    server.includes('queues[ticket?.lane || GENERAL_LANE].boost(ticket, priority)'));

  const lab = readSrc('../ui/tabs/backtest.mjs');
  check('آزمایشگاه مرجعِ تابلو را همراهِ درخواست می‌فرستد',
    lab.includes('const expect = expectationFromDailyRow(row);')
    && lab.includes("{ ...request, expect: { trades: expect.trades, volume: expect.volume } }"));
  check('و ردیفِ امروز را مرجع نمی‌کند — هنوز نهایی نیست',
    lab.includes('if (!row || row.live === true) return request;'));
  check('و پای تأییدنشده را نام می‌برد، نه اینکه پنهانش کند',
    lab.includes('با تابلوی روزانه تأیید نشد'));
}
