// ۲۵۵. بستن موقعیت، سود تحقق‌یافته، و نگاهِ سبد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import {
  POSITION_CLOSE_VERSION, CLOSE_REASONS,
  isClosed, positionStatus, validateExit, realizedPnl, realizedSummary, exitDateNumber,
} from '../../core/position-close.mjs';
import {
  BE_DANGER_PCT, BE_WARN_PCT, SUMMARY_REASONS,
  portfolioGreeks, expiryCalendar, breakevenRoom, breakevenRoomText,
} from '../../core/positions-portfolio.mjs';
import { pnlFromPrices } from '../../core/position-track.mjs';
import { markToMarket } from '../../core/positions.mjs';

group('۲۵۵. بستن موقعیت و نگاه سبد');
{
  const size = 1000;
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };

  const base = {
    id: 'p1', title: 'کاوردکال اهرم', qty: 2, uaIns: 'UA', entryDate: '1405/03/01', entrySpot: 100000,
    entryRisk: { version: 1, available: true, capital: 95000 * 1000 },
    legs: [
      { kind: 'underlying', side: 'buy', ratio: 1, size, price: 100000, ins: 'UA' },
      { kind: 'call', side: 'sell', ratio: 1, size, strike: 110000, price: 5000, entryClose: 5200, expiry: 20260920, ins: 'OPT' },
    ],
  };

  check('نسخهٔ قرارداد بستن اعلام شده', POSITION_CLOSE_VERSION === 1);

  // ——— چه چیزی «بسته» است ———
  check('موقعیت بی‌برگهٔ خروج بسته نیست', isClosed(base) === false);
  check('برگهٔ خروجِ بی‌قیمتِ کامل، بسته شمرده نمی‌شود',
    isClosed({ ...base, exit: { date: '1405/05/01', prices: [104000, 0] } }) === false);
  check('برگهٔ خروج با شمار قیمتِ نابرابر با پاها، بسته شمرده نمی‌شود',
    isClosed({ ...base, exit: { date: '1405/05/01', prices: [104000] } }) === false);
  const closed = { ...base, exit: { date: '1405/05/01', prices: [104000, 7000], note: '' } };
  check('برگهٔ خروجِ کامل، بسته است', isClosed(closed) === true);
  check('تاریخ خروج به عدد میلادی درمی‌آید', exitDateNumber(closed) === 20260723, `${exitDateNumber(closed)}`);

  // ——— وضعیت در دفتر ———
  check('موقعیت باز، «باز» است', positionStatus(base, 20260701).id === 'open');
  check('موقعیت پس از سررسید، «سررسیدگذشته» است', positionStatus(base, 20260921).id === 'expired');
  check('موقعیت بسته‌شده، «بسته‌شده» است', positionStatus(closed, 20260801).id === 'closed');
  // مهم‌ترین ادعای این دسته: بسته‌شده مقدم بر سررسیدگذشته است. اگر وارونه
  // بود، هر موقعیتِ بسته‌شده با گذشتِ زمان بی‌صدا به بایگانی می‌پرید و سودِ
  // تحقق‌یافته‌اش از جمع می‌افتاد.
  check('بسته‌شده با رسیدنِ سررسید، بی‌صدا به بایگانی نمی‌پرد',
    positionStatus(closed, 20261231).id === 'closed');
  check('برچسب فارسی هر وضعیت هست',
    positionStatus(base, 20260701).label === 'باز' && positionStatus(closed, 1).label === 'بسته‌شده');

  // ——— سنجش برگهٔ خروج ———
  const okExit = validateExit(base, { date: '1405/05/01', prices: [104000, 7000] });
  check('برگهٔ خروجِ معتبر پذیرفته می‌شود', okExit.ok === true, okExit.reason);
  check('برگهٔ پذیرفته‌شده نسخه می‌گیرد', okExit.exit.version === 1);
  check('تاریخ نامعتبر رد می‌شود',
    validateExit(base, { date: 'پریروز', prices: [1, 1] }).reason === CLOSE_REASONS.badDate);
  check('تاریخ خروجِ پیش از ورود رد می‌شود',
    validateExit(base, { date: '1405/02/01', prices: [1, 1] }).reason === CLOSE_REASONS.beforeEntry);
  // سررسید مرزِ سخت است: پس از آن موقعیت تسویه می‌شود، نه بسته.
  check('تاریخ خروجِ پس از سررسید رد می‌شود',
    validateExit(base, { date: '1405/10/01', prices: [1, 1] }).reason === CLOSE_REASONS.afterExpiry);
  check('قیمت خروجِ ناقص رد می‌شود',
    validateExit(base, { date: '1405/05/01', prices: [104000] }).reason === CLOSE_REASONS.missingPrice);
  check('قیمت صفر، قیمت نیست',
    validateExit(base, { date: '1405/05/01', prices: [104000, 0] }).reason === CLOSE_REASONS.missingPrice);
  check('برگهٔ ردشده هیچ خروجی برنمی‌گرداند',
    validateExit(base, { date: 'x', prices: [] }).exit === undefined);

  // ——— سود تحقق‌یافته ———
  const done = realizedPnl(closed, { fees });
  check('سود تحقق‌یافته برای موقعیت بسته ساخته می‌شود', done.available === true, done.reason);
  // یک موتور، دو ورودی: همان تابعی که روندِ لحظه‌ای از آن می‌آید.
  check('سود تحقق‌یافته همان سود همان قیمت‌ها در موتور روند است',
    near(done.pnlTotal, pnlFromPrices(closed, [104000, 7000], { fees }).pnlTotal));
  // و همان عددی که تب در روزِ بستن روی مبنای «آخرین» نشان می‌داد — وگرنه
  // سود در لحظهٔ بستن می‌پرید.
  const live = markToMarket(closed, [{ last: 104000, close: 104000 }, { last: 7000, close: 7000 }],
    { fees, basis: 'LAST', spot: 104000, spotClose: 104000 });
  check('سود تحقق‌یافته با ارزش‌گذاری لحظه‌ای روز بستن یکی است',
    near(done.pnl, live.pnl, 1e-9), `${Math.round(done.pnl)} / ${Math.round(live.pnl)}`);
  check('روز نگه‌داری از دو تاریخ ثبت‌شده می‌آید، نه از امروز',
    done.daysHeld === 62, `${done.daysHeld}`);
  check('بازده از مخرجِ ثابت روز ورود می‌آید',
    near(done.retPct, (done.pnl / 95000000) * 100));
  check('موقعیت باز سود تحقق‌یافته ندارد',
    realizedPnl(base, { fees }).reason === CLOSE_REASONS.notClosed);
  // روزِ صفر مخرج نیست: موقعیتی که همان روز باز و بسته شده «بازده ماهانهٔ
  // بی‌نهایت» ندارد.
  const sameDay = realizedPnl({ ...closed, exit: { ...closed.exit, date: base.entryDate } }, { fees });
  check('بازده ماهانهٔ روزِ صفر ساخته نمی‌شود', Number.isNaN(sameDay.retMonthPct));

  // ——— جمع دفتر بسته‌ها ———
  const loser = { ...closed, id: 'p2', title: 'زیان‌ده', exit: { date: '1405/05/01', prices: [96000, 7000] } };
  const sum = realizedSummary([closed, loser], { fees });
  check('جمع دفتر بسته‌ها، جمعِ ردیف‌هاست',
    near(sum.total, realizedPnl(closed, { fees }).pnlTotal + realizedPnl(loser, { fees }).pnlTotal));
  check('برد و باخت شمرده می‌شوند', sum.wins === 1 && sum.losses === 1, `${sum.wins}/${sum.losses}`);
  check('نرخ برد درصد است', near(sum.winRatePct, 50));
  const broken = realizedSummary([closed, base], { fees });
  check('یک ردیفِ ناقص، کلِ جمع را نامعلوم می‌کند — نه اینکه صفر شمرده شود',
    broken.complete === false && Number.isNaN(broken.total));

  // ——— یونانیِ سبد ———
  const g = (delta, gamma, vega, theta, rho) => ({ delta, gamma, vega, theta, rho });
  const greeks = portfolioGreeks([
    { title: 'الف', qty: 2, greeks: g(0.5, 0.001, 100, -20, 5) },
    { title: 'ب', qty: 1, greeks: g(-0.3, 0.002, 50, -10, 2) },
  ]);
  check('یونانی سبد وزن‌دار جمع می‌شود', greeks.available === true && near(greeks.greeks.delta, 0.7));
  check('و همهٔ پنج یونانی را دارد', near(greeks.greeks.theta, -50) && near(greeks.greeks.vega, 250));
  const partial = portfolioGreeks([
    { title: 'الف', qty: 1, greeks: g(0.5, 0.001, 100, -20, 5) },
    { title: 'ناقص', qty: 1, greeks: null, incomplete: true },
  ]);
  check('یک موقعیتِ بی‌یونانی، جمعِ سبد را نامعلوم می‌کند',
    partial.available === false && Number.isNaN(partial.greeks.delta));
  check('و نامِ همان موقعیت گفته می‌شود', partial.missing[0] === 'ناقص', partial.missing.join(','));
  check('سبد خالی جمع ندارد و علتش را می‌گوید',
    portfolioGreeks([]).reason === SUMMARY_REASONS.none);

  // ——— تقویم سررسید ———
  const far = { ...base, id: 'p3', title: 'دورتر', legs: [{ ...base.legs[1], expiry: 20261120 }] };
  const noExp = { ...base, id: 'p4', title: 'بی‌سررسید', legs: [{ kind: 'call', side: 'sell', ratio: 1, size, strike: 1, price: 1 }] };
  const cal = expiryCalendar([base, far, noExp], { today: 20260901, horizonDays: 100, marginOf: () => 1000 });
  check('روزهای سررسید مرتب و شمرده می‌شوند',
    cal.days.map((day) => day.date).join(',') === '20260920,20261120', cal.days.map((d) => d.date).join(','));
  check('روز مانده از تاریخ درمی‌آید', cal.days[0].daysLeft === 19, `${cal.days[0].daysLeft}`);
  check('وجه تضمین آن روز جمع می‌شود', cal.days[0].margin === 1000);
  check('موقعیت بی‌سررسید در روزِ صفر نمی‌نشیند، جدا نام می‌گیرد',
    cal.unknown.join(',') === 'بی‌سررسید' && !cal.days.some((day) => day.date === 0));
  const near30 = expiryCalendar([base, far], { today: 20260901, horizonDays: 30, marginOf: () => NaN });
  check('افق زمانی نمایش را می‌برد ولی شمارِ دورترها گفته می‌شود',
    near30.days.length === 1 && near30.beyond === 1);
  check('وجه نامعلومِ یک موقعیت، وجه آن روز را نامعلوم می‌کند',
    near30.days[0].marginKnown === false && Number.isNaN(near30.days[0].margin));

  // ——— اتاق سربه‌سر ———
  const tight = breakevenRoom(100000, [98000]);
  check('فاصله تا سربه‌سری درصد می‌شود', near(tight.roomPct, 2));
  check('پایه بالای سربه‌سری، جهتش گفته می‌شود', tight.side === 'above');
  check('کمتر از حد خطر، تُنِ خطر می‌گیرد', tight.tone === 'danger', `${BE_DANGER_PCT}`);
  check('میان دو حد، تُنِ هشدار', breakevenRoom(100000, [95000]).tone === 'warn', `${BE_WARN_PCT}`);
  check('فاصلهٔ راحت، تُنِ سالم', breakevenRoom(100000, [80000]).tone === 'ok');
  check('پایهٔ زیرِ سربه‌سری هم همان اندازه نزدیک شمرده می‌شود',
    breakevenRoom(100000, [102000]).side === 'below' && breakevenRoom(100000, [102000]).tone === 'danger');
  check('نزدیک‌ترین سربه‌سری انتخاب می‌شود، نه اولی',
    near(breakevenRoom(100000, [60000, 99000]).level, 99000));
  check('بی سربه‌سری، عددی ساخته نمی‌شود',
    breakevenRoom(100000, []).available === false && Number.isNaN(breakevenRoom(100000, []).roomPct));
  check('بی قیمت پایه هم عددی ساخته نمی‌شود',
    breakevenRoom(0, [100]).reason === SUMMARY_REASONS.noSpot);
  check('جملهٔ اتاق سربه‌سر، وضعیت را می‌گوید',
    breakevenRoomText(tight).includes('زیر') === false && breakevenRoomText(tight).includes('بالای'));
  check('و برای حالتِ نداشته، علت را', breakevenRoomText(breakevenRoom(100000, [])) === SUMMARY_REASONS.noBreakeven);
}
