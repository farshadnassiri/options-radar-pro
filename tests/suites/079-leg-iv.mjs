// ۷۸. تلاطم ضمنی هر پا در بک‌تست سریع
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import {
  IV_PARAMS, annotateBucketIv, annotateDailyIv, annotateIntradayIv, ivParams, ivSummary, legDaysToExpiry, legIvList, legIvPct, meanIvPct,
} from '../../core/leg-iv.mjs';


// ═════════ ۷۸. تلاطم ضمنی هر پا، در هر سه تایم‌فریم ═════════
//
// خواسته کاربر: «در جداول ارزش… تلاطم ضمنی هر پایه نیز آورده شود… چه
// کوچک‌ترین و ریزترین تایم‌فریم چه بزرگ‌ترین تایم‌فریم… همچنین پارامترهای
// محاسبهٔ آن قابل تنظیم باشند.»
//
// دو ادعای غیربدیهی اینجا سنجیده می‌شود: روز مانده تا سررسید **هر پا**
// جداست (وگرنه استراتژی تقویمی عددِ قابل‌قبولِ غلط می‌سازد و هیچ‌جا NaN
// نمی‌شود)، و هر ورودیِ نبوده خروجی را NaN می‌کند نه صفر.
group('۷۸. تلاطم ضمنی هر پا در بک‌تست سریع');
{
  const P = ivParams({ rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, dayCountYear: 365 });
  check('پارامترها از تنظیمات سراسری می‌آیند',
    P.rFree === 0.3 && P.yearDays === 365 && P.ivHi === 5, JSON.stringify(P));
  const over = ivParams({ rFree: 0.3, dayCountYear: 365, ivLo: 0.01, ivHi: 5, divYield: 0 }, { rFree: 0.18 });
  check('بازنویسی موضعی روی تنظیمات سراسری می‌نشیند',
    over.rFree === 0.18 && over.yearDays === 365, `${over.rFree}`);
  // قید ساختاری، نه فهرست دستی: کاتالوگ فرمِ بازنویسی موضعی را می‌سازد، پس
  // اگر کلیدی به محاسبه اضافه شود و به کاتالوگ نه، آن کلید در هیچ تبی قابل
  // تنظیم نمی‌ماند و کاربر هیچ‌وقت نمی‌فهمد چرا.
  check('کاتالوگ پارامتر همان کلیدهایی را دارد که محاسبه می‌خواند',
    IV_PARAMS.map((x) => x.key).join(',') === Object.keys(ivParams({})).join(','),
    IV_PARAMS.map((x) => x.key).join(','));

  // رفت‌وبرگشت: قیمتی که خودِ بلک-شولز با σ ساخته، باید همان σ را پس بدهد
  const nearCall = { kind: 'call', strike: 11000, expiry: 20260401 };
  const farCall = { kind: 'call', strike: 11000, expiry: 20260701 };
  const observed = 20260101;
  const dNear = legDaysToExpiry(nearCall, observed);
  const dFar = legDaysToExpiry(farCall, observed);
  check('روز تا سررسید هر پا از سررسید خودش می‌آید', dNear === 90 && dFar === 181, `${dNear} و ${dFar}`);
  const priceNear = bsPrice('call', 10000, 11000, dNear / 365, 0.3, 0, 0.65);
  check('تلاطم برگشتی همان تلاطم ساخت است',
    near(legIvPct(nearCall, { spot: 10000, price: priceNear, days: dNear }, P), 65, 1e-4));

  // همان قیمت روی پای دورتر، تلاطم دیگری است. اگر روز پا جدا نشود، این دو
  // یکی می‌شوند و خطا بی‌صدا می‌ماند.
  const ivFarSamePrice = legIvPct(farCall, { spot: 10000, price: priceNear, days: dFar }, P);
  check('پای دورتر با همان قیمت، تلاطم کمتری دارد',
    Number.isFinite(ivFarSamePrice) && ivFarSamePrice < 65, `${ivFarSamePrice.toFixed(2)}٪`);

  // ——— قاعدهٔ ۲-۴: نبود، صفر نیست ———
  check('پای سهم پایه تلاطم ضمنی ندارد',
    Number.isNaN(legIvPct({ kind: 'underlying', strike: 0 }, { spot: 1, price: 1, days: 30 }, P)));
  check('بی‌قیمت، تلاطم ندارد', Number.isNaN(legIvPct(nearCall, { spot: 10000, price: NaN, days: 90 }, P)));
  check('بی‌قیمتِ پایه، تلاطم ندارد', Number.isNaN(legIvPct(nearCall, { spot: NaN, price: 100, days: 90 }, P)));
  check('روز سررسید، تلاطم ندارد', Number.isNaN(legIvPct(nearCall, { spot: 10000, price: 100, days: 0 }, P)));
  check('سررسید نامعلوم یعنی روز نامعلوم', Number.isNaN(legDaysToExpiry({ kind: 'call' }, observed)));

  // ——— فهرست پاها: جای هر پا محفوظ می‌ماند ———
  const legs = [nearCall, { kind: 'underlying', strike: 0 }, farCall];
  const list = legIvList(legs, { spot: 10000, prices: [priceNear, 10000, priceNear], date: observed }, P);
  check('فهرست تلاطم هم‌اندازه و هم‌ترتیب پاهاست', list.length === 3 && Number.isNaN(list[1]),
    list.map((v) => (Number.isFinite(v) ? v.toFixed(1) : '—')).join('، '));
  check('میانگین فقط روی پاهای دارای تلاطم است',
    near(meanIvPct(list), (list[0] + list[2]) / 2, 1e-9));

  // ——— مهر خوردن روی هر سه تایم‌فریم ———
  const priced = [nearCall, farCall];
  const replay = { ok: true, priced, rows: [
    { date: observed, status: 'ok', baseClose: 10000, perLeg: [{ exitPrice: priceNear }, { exitPrice: priceNear }] },
    { date: observed, status: 'missing', baseClose: NaN, perLeg: [{ exitPrice: NaN }, { exitPrice: NaN }] },
  ] };
  annotateDailyIv(replay, P);
  check('مسیر روزانه مهر تلاطم می‌خورد',
    near(replay.rows[0].perLeg[0].ivPct, 65, 1e-4) && replay.rows[0].legIvPct.length === 2);
  check('ردیف بی‌داده، تلاطم جعلی نمی‌گیرد',
    replay.rows[1].legIvPct.every((v) => Number.isNaN(v)) && Number.isNaN(replay.rows[1].meanIvPct));

  const points = [{ second: 34200, basePrice: 10000, perLeg: [{ exitPrice: priceNear }, { exitPrice: priceNear }] }];
  annotateIntradayIv(points, { legs: priced, date: observed }, P);
  check('بازپخش درون‌روز مهر تلاطم می‌خورد', near(points[0].perLeg[0].ivPct, 65, 1e-4));

  // هر سطل تاریخ خودش را دارد؛ سطلی که سه ماه جلوتر است نباید با روزِ سطل
  // اول حساب شود.
  const buckets = [
    { date: observed, basePrice: 10000, perLeg: [{ price: priceNear }, { price: priceNear }] },
    { date: 20260301, basePrice: 10000, perLeg: [{ price: priceNear }, { price: priceNear }] },
  ];
  annotateBucketIv(buckets, { legs: priced }, P);
  check('هر سطل با تاریخ خودش حساب می‌شود',
    Number.isFinite(buckets[0].perLeg[0].ivPct) && Number.isFinite(buckets[1].perLeg[0].ivPct)
    && buckets[0].perLeg[0].ivPct !== buckets[1].perLeg[0].ivPct,
    `${buckets[0].perLeg[0].ivPct.toFixed(1)}٪ در برابر ${buckets[1].perLeg[0].ivPct.toFixed(1)}٪`);

  // ——— خلاصه ———
  const sum = ivSummary([60, NaN, 70, 50]);
  check('خلاصه، نقاط بی‌تلاطم را جدا می‌شمارد و در آمار نمی‌آورد',
    sum.samples === 3 && sum.gaps === 1 && sum.min === 50 && sum.max === 70 && sum.mean === 60 && sum.changePp === -10);
  check('خلاصهٔ بی‌مشاهده عدد نمی‌سازد',
    ivSummary([NaN, NaN]).samples === 0 && Number.isNaN(ivSummary([NaN, NaN]).mean));

  // ——— رابط: هر سه تایم‌فریم و فرم پارامتر ———
  const bt78 = readSrc('../ui/tabs/backtest.mjs');
  check('هر سه تایم‌فریم مهر تلاطم می‌خورند',
    bt78.includes('annotateDailyIv(replay, ivP())')
    && bt78.includes('annotateIntradayIv(points, { legs: replay.priced, date }, ivP())')
    && bt78.includes('annotateBucketIv(buckets, { legs: replay.priced }, ivP())'));
  check('پارامترها در خود تب قابل تنظیم‌اند',
    bt78.includes("data-iv-param=") && bt78.includes("id=\"bt-iv-reset\"") && bt78.includes('reapplyIv()'));
  // خانهٔ خالی یعنی «تنظیمات سراسری»، نه صفر
  check('خانهٔ خالی پارامتر، بازنویسی را برمی‌دارد',
    /if \(raw === ''\) delete ivOverride\[field\.dataset\.ivParam\];/.test(bt78));
  // فرم نباید در هر رنگ‌آمیزی از نو ساخته شود، وگرنه فوکوس وسط تایپ می‌پرد
  check('فرم پارامتر یک‌بار ساخته می‌شود', /if \(host\.children\.length\) return;/.test(bt78));
  check('جدول‌های هر سه تایم‌فریم ستون تلاطم دارند',
    (bt78.match(/ivCell\(/g) || []).length >= 5, `${(bt78.match(/ivCell\(/g) || []).length} خانه`);
  check('نبودِ تلاطم در جدول «—» می‌ماند',
    /const ivCell = \(value\) => \(Number\.isFinite\(value\) \? `\$\{fmt\.pct\(value\)\}٪` : '—'\);/.test(bt78));
}
