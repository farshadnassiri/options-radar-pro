// ۷۰. مجموعه داشبورد تصمیم‌گیری و چهار دامنه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import {
  dashboardScope, decisionDashboardSnapshot, pctVsYesterday,
} from '../../core/decision-dashboard.mjs';
import { defaults } from '../../core/settings.mjs';


group('۷۰. مجموعه داشبورد تصمیم‌گیری و چهار دامنه');
{
  const raw70 = [
    {
      uaInsCode: '11', lval30_UA: 'اهرم', pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1000,
      strikePrice: 1000, remainedDay: 30, endDate: 20260101, contractSize: 1000,
      insCode_C: '111', lVal18AFC_C: 'ضهرم-الف', pDrCotVal_C: 120, pClosing_C: 115, priceYesterday_C: 100,
      pMeDem_C: 118, pMeOf_C: 122, qTotTran5J_C: 20, zTotTran_C: 4, qTotCap_C: 2400, oP_C: 90, yesterdayOP_C: 80,
      insCode_P: '112', lVal18AFC_P: 'طهرم-الف', pDrCotVal_P: 80, pClosing_P: 82, priceYesterday_P: 100,
      pMeDem_P: 78, pMeOf_P: 82, qTotTran5J_P: 10, zTotTran_P: 2, qTotCap_P: 800, oP_P: 70, yesterdayOP_P: 75,
    },
    {
      uaInsCode: '11', lval30_UA: 'اهرم', pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1000,
      strikePrice: 1100, remainedDay: 60, endDate: 20260201, contractSize: 1000,
      insCode_C: '113', lVal18AFC_C: 'ضهرم-ب', pDrCotVal_C: 70, pClosing_C: 72, priceYesterday_C: 70,
      pMeDem_C: 68, pMeOf_C: 72, qTotTran5J_C: 100, zTotTran_C: 20, qTotCap_C: 7000, oP_C: 120, yesterdayOP_C: 100,
      insCode_P: '114', lVal18AFC_P: 'طهرم-ب', pDrCotVal_P: 130, pClosing_P: 128, priceYesterday_P: 100,
      pMeDem_P: 128, pMeOf_P: 132, qTotTran5J_P: 50, zTotTran_P: 10, qTotCap_P: 6500, oP_P: 110, yesterdayOP_P: 90,
    },
  ];
  check('درصد آخرین نسبت به پایانی دیروز و فقط همان مبنا محاسبه می‌شود', near(pctVsYesterday(120, 100), 20));
  const snap70 = decisionDashboardSnapshot(raw70, defaults());
  check('عکس تصمیم چهار قرارداد و دو سررسید را بی‌افت نگه می‌دارد',
    snap70.contracts.length === 4 && snap70.expiries.length === 2 && snap70.marketExpiries.length === 2);
  check('رهبر ارزش کل بازار از داده واقعی و با ترتیب نزولی می‌آید',
    snap70.contracts[0].ins === '113' && snap70.contracts[0].value === 7000);
  check('تجمیع سررسید ارزش کال و پوت را جدا نگه می‌دارد',
    snap70.expiries[0].value === 13500 && snap70.expiries[0].callValue === 7000 && snap70.expiries[0].putValue === 6500);
  check('چهار دامنه بازار، پایه، سررسید و قرارداد دقیق فیلتر می‌شوند',
    dashboardScope(snap70, { level: 'market' }).contracts.length === 4
    && dashboardScope(snap70, { level: 'underlying', uaIns: '11' }).contracts.length === 4
    && dashboardScope(snap70, { level: 'expiry', uaIns: '11', endDate: '20260101' }).contracts.length === 2
    && dashboardScope(snap70, { level: 'contract', uaIns: '11', endDate: '20260101', contractIns: '112' }).contracts.length === 1);

  const ui70 = readSrc('../ui/tabs/live-market-dashboard.mjs'), app70 = readSrc('../ui/app.mjs');
  const viewCount = (name) => ((new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(ui70)?.[1] || '').match(/^\s*\['/gm) || []).length;
  check('هر سه حالت تصمیم‌گیری دقیقاً بیست جدول یا نمودار تنبل دارند',
    viewCount('pulseViews') === 20 && viewCount('liquidityViews') === 20 && viewCount('volatilityViews') === 20,
    `${viewCount('pulseViews')}/${viewCount('liquidityViews')}/${viewCount('volatilityViews')}`);
  check('دستگیره زمان، تایمر بازسازی و توقف خودکار هم‌زمان وجود دارند',
    ui70.includes('id="dd-interval" type="range"') && ui70.includes('timer = setTimeout(refresh') && ui70.includes('id="dd-pause"'));
  // سقف چهارصدردیفی برداشته شد چون دلیلش رفت: آن سقف برای روانی DOM بود،
  // وقتی جدول `innerHTML` خام می‌ساخت. جدول مشترک مجازی‌سازی‌شده است و فقط
  // ردیف‌های داخل قاب را رسم می‌کند، پس نوار کامل هم مرتب می‌شود هم صادر.
  check('نوار ریزمعامله کامل به جدول مجازی‌سازی‌شده می‌رود، نه بریده',
    ui70.includes('function tapeRows(tape)') && !ui70.includes('tape.slice(-400)'));
  // شش توکن، نه ده — و بدون چرخش. جداپذیری خودِ رنگ‌ها را نگهبان ۱۰ در
  // `tests/guards.mjs` حساب می‌کند؛ اینجا فقط مصرفشان سنجیده می‌شود.
  check('رنگ سری‌ها از توکن‌های سنجیده می‌آید و میله رتبه‌ای یک فام دارد',
    ui70.includes('var(--series-${index + 1})') && ui70.includes('length: 6')
    && ui70.includes("'var(--bar-fill)'")
    && !ui70.includes('--series:${SERIES[index % SERIES.length]}'));
  // «رهبران ارزش کل بازار» حذف شد: با جدول سورت‌پذیر، همان «تابلوی
  // قراردادها»ی مرتب بر ارزش است. رهبر هر سررسید و نگاه باز مانده‌اند،
  // چون هیچ‌کدام با مرتب‌سازی یک ستون ساخته نمی‌شوند.
  check('رهبر هر سررسید و نگاه باز درون داشبورد است',
    ui70.includes("'high-value-expiry'") && ui70.includes("'open-view-history'")
    && !app70.includes("id: 'open-view'"));
  const server70 = readSrc('../server/server.mjs');
  check('endpoint زنده عکس فشرده چهار دامنه را تحویل می‌دهد',
    server70.includes('universe: decisionDashboardSnapshot(sourceRows, S)'));
}
