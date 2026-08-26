// ۸۲. مسیر یونانی‌ها و تحلیل حساسیت
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import {
  GREEKS as GK, annotateBucketGreeks, annotateIntradayGreeks, greekContribution, greekSeries, greekSummary, ivSnapshot, legGreekSummary, positionSensitivityAxis, positionSensitivityGrid, repriceAt, trackSummary,
} from '../../core/greeks-track.mjs';


// ═════════ ۸۲. یونانی‌ها در طول زمان و حساسیت ═════════
//
// خواسته کاربر: «برای هر پا یونانی‌ها محاسبه بشه در هر بازه زمانی (چه روزانه
// چه یک دقیقه چه هر تایم‌فریم انتخابی بین این دو)… سپس روند یونانی‌ها در طی
// عمر استراتژی قابل بررسی در جدول و نمودار باشه… یا شاید تحلیل حساسیت.»
group('۸۲. مسیر یونانی‌ها و تحلیل حساسیت');
{
  const P82 = { rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, yearDays: 365 };
  const call82 = { kind: 'call', strike: 11000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000, name: 'کال' };
  const stock82 = { kind: 'underlying', side: 'buy', ratio: 1, size: 1, name: 'پایه' };
  const legs82 = [call82, stock82];
  const price82 = (S, days, sigma) => bsPrice('call', S, 11000, days / 365, 0.3, 0, sigma);

  // ——— مهر خوردن هر سه مسیر ———
  const tick82 = [
    { second: 34200, timeLabel: '09:30:00', basePrice: 10000, perLeg: [{ exitPrice: price82(10000, 90, 0.65) }, { exitPrice: 10000 }] },
    { second: 36000, timeLabel: '10:00:00', basePrice: 10120, perLeg: [{ exitPrice: price82(10120, 90, 0.64) }, { exitPrice: 10120 }] },
  ];
  annotateIntradayGreeks(tick82, { legs: legs82, date: 20260101 }, P82);
  check('یونانی روی نقطهٔ درون‌روز می‌نشیند', Number.isFinite(tick82[0].greeks?.delta), String(tick82[0].greeks?.delta));
  check('یونانی پا هم روی خودِ پا می‌نشیند', Number.isFinite(tick82[0].perLeg[0].greeks?.vega));
  check('پای سهم پایه یونانی بلک‌شولز ندارد', tick82[0].perLeg[1].greeks === null);
  check('دلتای موقعیت، پای پایه را هم می‌شمارد',
    Math.abs(tick82[0].greeks.delta - (tick82[0].perLeg[0].greeks.delta * 1000 + 1)) < 1e-9,
    `${tick82[0].greeks.delta}`);

  const bucket82 = [
    { date: 20260101, startSecond: 34200, basePrice: 10000, perLeg: [{ price: price82(10000, 90, 0.65) }, { price: 10000 }] },
    { date: 20260105, startSecond: 34200, basePrice: 10300, perLeg: [{ price: price82(10300, 86, 0.6) }, { price: 10300 }] },
  ];
  annotateBucketGreeks(bucket82, { legs: legs82 }, P82);
  // تاریخ هر سطل از خودش می‌آید، پس روز تا سررسید دو سطل فرق دارد و
  // یونانی‌شان هم باید فرق کند
  check('هر سطل با روز تا سررسید خودش حساب می‌شود',
    bucket82[0].greeks.theta !== bucket82[1].greeks.theta);

  // ——— سری و خلاصه ———
  const series82 = greekSeries(bucket82, { legCount: 2 });
  check('سری نمودار، ستون کل و ستون هر پا را دارد',
    Number.isFinite(series82[0].delta) && Number.isFinite(series82[0].delta1) && Number.isNaN(series82[0].delta2),
    Object.keys(series82[0]).join('،'));
  check('خلاصهٔ یونانی، ابتدا و انتها و تغییر را می‌دهد',
    greekSummary(bucket82).every((row) => row.samples === 2 && Number.isFinite(row.change)));
  check('خلاصهٔ پای بی‌یونانی، جای خالی می‌ماند نه صفر',
    legGreekSummary(bucket82, 1).every((row) => row.samples === 0 && Number.isNaN(row.mean)));
  check('خلاصهٔ سری خالی، صفر نمی‌سازد',
    trackSummary([NaN, NaN]).samples === 0 && Number.isNaN(trackSummary([]).mean));

  // ——— حساسیت ———
  const snap82 = { spot: 10000, prices: [price82(10000, 90, 0.65), 10000], date: 20260101 };
  const iv82 = ivSnapshot(legs82, snap82, P82);
  check('تلاطم ضمنی لحظه، برای پای اختیار درمی‌آید و برای پایه نه',
    Math.abs(iv82[0] - 65) < 0.5 && Number.isNaN(iv82[1]), `${iv82[0]}`);
  const grid82 = positionSensitivityGrid(legs82, snap82, P82, { spotSteps: [-10, 0, 10], volSteps: [-5, 0, 5] });
  const middle = grid82.rows[1].cells[1];
  // خانهٔ مرکز، هیچ سناریویی نیست: باید دقیقاً صفر باشد وگرنه خطای برازش
  // مدل داخل «اثر سناریو» نشسته است
  check('خانهٔ بی‌سناریو دقیقاً صفر است', Math.abs(middle.change) < 1e-6, String(middle.change));
  check('صعود پایه برای کال خریداری‌شده مثبت است', grid82.rows[2].cells[1].change > 0);
  check('افت تلاطم برای کال خریداری‌شده منفی است', grid82.rows[1].cells[0].change < 0);
  const axis82 = positionSensitivityAxis(legs82, snap82, P82, { daySteps: [0, 5] });
  check('حساسیت تک‌محوره سه محور دارد',
    axis82.spot.length > 0 && axis82.vol.length > 0 && axis82.time.length === 2);
  check('گذر زمان برای کال خریداری‌شده ارزش می‌گیرد', axis82.time[1].change < 0);

  // قاعدهٔ ۲-۴: پای بی‌تلاطم بازقیمت‌گذاری نمی‌شود و سناریو ناقص می‌ماند
  const blind = repriceAt(legs82, { ...snap82, ivPct: [NaN, NaN] }, { spotPct: 5 }, P82);
  check('سناریوی پای بی‌تلاطم، ناقص علامت می‌خورد', blind.incomplete === true);

  const share82 = greekContribution(legs82, snap82, P82);
  check('سهم هر پا از یونانی موقعیت، وزن علامت‌دار می‌خورد',
    Math.abs(share82[0].share.delta - share82[0].greeks.delta * 1000) < 1e-9);
  check('یونانی‌ها یک نام و یک ترتیب دارند',
    GK.map((g) => g.key).join(',') === 'delta,gamma,vega,theta,rho');
}
