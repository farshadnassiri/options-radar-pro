// ۷۴. شاخص اعمال و پریمیوم وزنی نگاه باز
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { analyzeDailyOpenView } from '../../core/open-view.mjs';
import { fmt as uiFmt } from '../../ui/fmt.mjs';



// ═════════ ۷۴. شاخص اعمال و پریمیوم وزنی، به نگاه باز برگشت ═════════
//
// گزارش کاربر: «قسمتی از تب نگاه باز که در نسخه‌های قبلی میانگین وزنی قیمت
// اعمال‌ها و نمودارهای آن و همچنین IV و نمودارهایش بود — هر چیزی که در نگاه
// باز بود را برگردان و در جای خود بگذار.»
//
// موتور این دو را از روز اول می‌ساخت (`callStrike`/`putStrike` و
// `callPremium`/`putPremium` در `aggregate`) ولی وقتی این تب روزمحور شد،
// نمودار و ستونشان جا ماند و هیچ‌جای رابط نمی‌آمدند — عددی که حساب می‌شود و
// دیده نمی‌شود.
group('۷۴. شاخص اعمال و پریمیوم وزنی نگاه باز');
{
  const expiry74 = 20240630;
  const ua74 = { ins: '1', name: 'پایه آزمایشی' };
  const contracts74 = [
    { ins: '11', name: 'کال ۱۰۰', kind: 'call', strike: 100, expiry: expiry74, size: 1000 },
    { ins: '12', name: 'کال ۱۲۰', kind: 'call', strike: 120, expiry: expiry74, size: 1000 },
    { ins: '21', name: 'پوت ۹۰', kind: 'put', strike: 90, expiry: expiry74, size: 1000 },
  ];
  // وزن‌ها عمداً نامساوی‌اند تا «وزنی» بودن از «میانگین ساده» جدا شود:
  // اعمال کال = (۱۰۰×۱۰۰ + ۱۲۰×۳۰۰) / ۴۰۰ = ۱۱۵
  const series74 = {
    1: [{ date: 20240101, close: 100, value: 1e6, vol: 1e4 }],
    11: [{ date: 20240101, close: 10, value: 100, vol: 10, trades: 2 }],
    12: [{ date: 20240101, close: 5, value: 300, vol: 30, trades: 4 }],
    21: [{ date: 20240101, close: 8, value: 200, vol: 20, trades: 3 }],
  };
  const daily74 = analyzeDailyOpenView({ ua: ua74, contracts: contracts74, seriesByIns: series74, settings: { rFree: 0.2, yearDays: 365 } });
  const row74 = daily74.rows[0];
  check('شاخص اعمال وزنی کال با وزن ارزش معامله ساخته می‌شود',
    near(row74.callStrike, 115), row74.callStrike);
  check('و فاصله‌اش از قیمت پایه، هم‌الگوی فاصله سربه‌سر است',
    near(row74.callStrikeGapPct, 15) && near(row74.putStrikeGapPct, 10),
    `${uiFmt.pct(row74.callStrikeGapPct)} / ${uiFmt.pct(row74.putStrikeGapPct)}`);
  // پریمیوم وزنی کال = (۱۰×۱۰۰ + ۵×۳۰۰) / ۴۰۰ = ۶٫۲۵ ، یعنی ۶٫۲۵٪ پایه ۱۰۰
  check('پریمیوم وزنی هم درصدی از پایه می‌گیرد، تا روزهای با پایه متفاوت مقایسه شوند',
    near(row74.callPremium, 6.25) && near(row74.callPremiumPct, 6.25) && near(row74.putPremiumPct, 8),
    `${row74.callPremium}`);

  // میانگین ۵روزه برای همین دو، مثل فاصله سربه‌سر و IV
  const flat74 = {
    1: [1, 2, 3, 4, 5].map((d) => ({ date: 20240100 + d, close: 100, value: 1000, vol: 10 })),
    11: [1, 2, 3, 4, 5].map((d) => ({ date: 20240100 + d, close: 10, value: 100, vol: 10 })),
    21: [1, 2, 3, 4, 5].map((d) => ({ date: 20240100 + d, close: 8, value: 100, vol: 10 })),
  };
  const ma74 = analyzeDailyOpenView({ ua: ua74, contracts: [contracts74[0], contracts74[2]], seriesByIns: flat74, settings: { rFree: 0.2, yearDays: 365 } });
  check('فاصله اعمال و پریمیوم، میانگین ۵روزه مستقل دارند',
    near(ma74.rows[4].callStrikeGapPctMa5, 0) && near(ma74.rows[4].putStrikeGapPctMa5, 10)
    && near(ma74.rows[4].callPremiumPctMa5, 10) && near(ma74.rows[4].putPremiumPctMa5, 8));

  // ——— و حالا واقعاً در رابط دیده می‌شوند ———
  const ov74 = readSrc('../ui/tabs/open-view.mjs');
  check('نمودار روزانه شاخص اعمال و فاصله‌اش در تب هست',
    ov74.includes("id=\"ov-daily-strike\"") && ov74.includes("id=\"ov-daily-strike-gap\"")
    && ov74.includes("chart($('ov-daily-strike')") && ov74.includes("chart($('ov-daily-strike-gap')"));
  check('نمودار روزانه پریمیوم وزنی هم هست',
    ov74.includes("id=\"ov-daily-premium\"") && ov74.includes("chart($('ov-daily-premium')"));
  check('و هر دو در جزئیات درون‌روزی هم رسم می‌شوند',
    ov74.includes("chart($('ov-day-strike')") && ov74.includes("chart($('ov-day-premium')"));
  check('جدول روزانه ستون اعمال وزنی و پریمیوم گرفت',
    ov74.includes('<th>اعمال وزنی کال / فاصله</th>') && ov74.includes('r.callStrikeGapPct')
    && ov74.includes('<th>پریمیوم وزنی کال / پوت ٪</th>'));
  // نمودار درون‌روزی، سری خط‌چینِ میانگین ۵روزه ندارد: میانگین پنج‌روزه روی
  // سطل‌های یک روز معنی ندارد.
  check('نمودار درون‌روزی میانگین ۵روزه را حمل نمی‌کند',
    ov74.includes('const SERIES_PREMIUM_INTRADAY = [SERIES_PREMIUM[0], SERIES_PREMIUM[2]]'));
  const exp74 = readSrc('../ui/open-view-export.mjs');
  check('خروجی اکسل هم ستون‌های تازه را می‌برد',
    exp74.includes('r.callStrikeGapPct') && exp74.includes('r.callPremiumPct')
    && exp74.includes("'فاصله اعمال کال ٪'"));
}
