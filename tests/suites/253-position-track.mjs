// ۲۵۳. روند سود و زیان موقعیت باز — روزانه، درون‌روزی، جلسه‌ای
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import {
  POSITION_TRACK_VERSION, TRACK_REASONS,
  trackLegIns, trackLegExpiry, positionExpiry, positionOpenState,
  entryNetOf, pnlFromPrices, trackInstruments,
  dailyPnlSeries, intradayPnlSeries, appendSessionTick, trackStats, changeSince,
} from '../../core/position-track.mjs';
import { markToMarket } from '../../core/positions.mjs';

group('۲۵۳. روند سود و زیان موقعیت باز');
{
  const size = 1000;
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const zero = { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };

  // کاوردکال واقعی: سهم ۱۰۰٬۰۰۰ + فروش کال ۱۱۰٬۰۰۰ به ۵٬۰۰۰، دو دست.
  const pos = {
    id: 'p1', qty: 2, uaIns: 'UA', entryDate: '1405/06/01', entrySpot: 100000,
    legs: [
      { kind: 'underlying', side: 'buy', ratio: 1, size, price: 100000 },
      { kind: 'call', side: 'sell', ratio: 1, size, strike: 110000, price: 5000, days: 30, expiry: 20260920, ins: 'OPT' },
    ],
  };

  check('نسخهٔ قرارداد روند اعلام شده', POSITION_TRACK_VERSION === 1, `${POSITION_TRACK_VERSION}`);

  // ——— شناسه و سررسید ———
  check('پای سهم شناسهٔ پایهٔ موقعیت را می‌گیرد', trackLegIns(pos, pos.legs[0]) === 'UA');
  check('پای اختیار شناسهٔ خودش را نگه می‌دارد', trackLegIns(pos, pos.legs[1]) === 'OPT');
  check('پای سهم سررسید ندارد', trackLegExpiry(pos.legs[0]) === 0);
  check('سررسید موقعیت، نزدیک‌ترین سررسید پاهاست', positionExpiry(pos) === 20260920);
  check('فهرست ابزارها بدون تکرار ساخته می‌شود',
    trackInstruments(pos).join(',') === 'UA,OPT', trackInstruments(pos).join(','));

  const twoExpiries = { ...pos, legs: [
    { kind: 'call', side: 'sell', ratio: 1, size, strike: 110000, price: 5000, expiry: 20261120, ins: 'A' },
    { kind: 'call', side: 'buy', ratio: 1, size, strike: 120000, price: 2000, expiry: 20260920, ins: 'B' },
  ] };
  check('با دو سررسید، نزدیک‌ترین برنده است', positionExpiry(twoExpiries) === 20260920);

  // ——— باز یا سررسیدگذشته ———
  const openAt = positionOpenState(pos, 20260901);
  check('پیش از سررسید، موقعیت باز است', openAt.open === true && openAt.expired === false);
  check('روز مانده تا سررسید از تاریخ درمی‌آید، نه از تفریق روز نگهداری',
    openAt.daysToExpiry === 19, `${openAt.daysToExpiry}`);
  const goneAt = positionOpenState(pos, 20260921);
  check('پس از سررسید، موقعیت بسته شمرده می‌شود', goneAt.expired === true && goneAt.open === false);
  check('علت بسته بودن گفته می‌شود', goneAt.reason === TRACK_REASONS.expired, goneAt.reason);
  const unknown = positionOpenState({ legs: [{ kind: 'call', side: 'sell', ratio: 1, size, strike: 1, price: 1 }] }, 20260921);
  check('سررسید ثبت‌نشده «باز» فرض می‌شود ولی صریحاً نامعلوم اعلام می‌شود',
    unknown.open === true && unknown.known === false);

  // ——— یک نقطه ———
  const mark = pnlFromPrices(pos, [104000, 7000], { fees });
  check('نقطه با قیمت کامل همهٔ پاها ساخته می‌شود', mark.available === true, mark.reason);
  check('سود کل، ضربدر تعداد قرارداد', near(mark.pnlTotal, mark.pnl * 2));
  check('جریان نقد ورود همان تعریف موتور است',
    near(mark.entryNet, entryNetOf(pos.legs, fees)));

  // همان عدد باید با `markToMarket` روی مبنای «آخرین» یکی دربیاید — وگرنه
  // دو جای برنامه دو سود و زیان برای یک موقعیت و یک قیمت می‌گویند.
  const mtm = markToMarket(pos, [{ last: 104000, close: 104000 }, { last: 7000, close: 7000 }],
    { fees, basis: 'LAST', spot: 104000, spotClose: 104000 });
  check('سود و زیان نقطه با ارزش‌گذاری لحظه‌ای تب یکی است',
    near(mark.pnl, mtm.pnl, 1e-9), `${Math.round(mark.pnl)} / ${Math.round(mtm.pnl)}`);

  const half = pnlFromPrices(pos, [104000, NaN], { fees });
  check('پای بی‌قیمت نقطه نمی‌سازد', half.available === false);
  check('نام پای بی‌قیمت گفته می‌شود', half.missing.join(',') === 'OPT', half.missing.join(','));
  check('علت نبودن نقطه نوشته شده', half.reason === TRACK_REASONS.noPrice);
  check('قیمت صفر، قیمت نیست', pnlFromPrices(pos, [104000, 0], { fees }).available === false);
  check('موقعیت بی‌پا نقطه ندارد',
    pnlFromPrices({ legs: [] }, [], { fees }).reason === TRACK_REASONS.noLegs);

  // ——— روند روزانه ———
  const daily = {
    UA: { rows: [
      { date: 20260901, close: 100000, last: 100500 },
      { date: 20260902, close: 102000, last: 102000 },
      { date: 20260903, close: 104000, last: 104000 },
      { date: 20260921, close: 108000, last: 108000 },
    ] },
    OPT: { rows: [
      { date: 20260901, close: 5000, last: 5000 },
      // ۰۲ معامله نشده — روز باید بیفتد، نه اینکه قیمت ۰۱ رویش بنشیند
      { date: 20260903, close: 7000, last: 7100 },
      { date: 20260921, close: 9000, last: 9000 },
    ] },
  };
  const series = dailyPnlSeries(pos, daily, { fees, basis: 'CLOSE', from: 20260901 });
  check('روند روزانه فقط روزهای دارای قیمت کامل را نقطه می‌کند',
    series.points.map((p) => p.date).join(',') === '20260901,20260903',
    series.points.map((p) => p.date).join(','));
  check('روز ناقص در شکاف‌ها نام می‌گیرد',
    series.gaps.length === 1 && series.gaps[0].date === 20260902 && series.gaps[0].missing[0] === 'OPT');
  check('روز پس از سررسید اصلاً وارد روند نمی‌شود',
    !series.points.some((p) => p.date > 20260920) && !series.gaps.some((g) => g.date > 20260920));
  check('ایستادن روند روی سررسید اعلام می‌شود', series.stoppedAt === 20260920, `${series.stoppedAt}`);
  check('قیمت پایه در هر نقطه از سری خودِ پایه می‌آید',
    series.points[0].spot === 100000, `${series.points[0].spot}`);
  check('نقطهٔ روزانه با همان قیمت‌ها، همان سود و زیان نقطهٔ مستقیم است',
    near(series.points[1].pnlTotal, pnlFromPrices(pos, [104000, 7000], { fees }).pnlTotal));

  const lastBasis = dailyPnlSeries(pos, daily, { fees, basis: 'LAST', from: 20260901 });
  check('مبنای «آخرین» عدد دیگری می‌دهد، و همان را اعلام می‌کند',
    lastBasis.basis === 'LAST' && !near(lastBasis.points[1].pnlTotal, series.points[1].pnlTotal));

  check('روز پیش از ورود وارد روند نمی‌شود',
    dailyPnlSeries(pos, daily, { fees, from: 20260902 }).points.every((p) => p.date >= 20260902));

  const noIns = dailyPnlSeries({ ...pos, uaIns: '' }, daily, { fees });
  check('پای بی‌شناسه روند روزانه ندارد و علتش گفته می‌شود',
    noIns.points.length === 0 && noIns.reason === TRACK_REASONS.noIns);

  const blank = dailyPnlSeries(pos, { UA: { rows: [] }, OPT: { rows: [] } }, { fees });
  check('سری خالی، روند خالی با علت می‌دهد', blank.reason === TRACK_REASONS.noPoint);

  // ——— روند درون‌روزی ———
  const tape = {
    UA: { rows: [
      { time: 91500, price: 101000, quantity: 10 },
      { time: 103000, price: 103000, quantity: 10 },
    ] },
    OPT: { rows: [
      // اولین معاملهٔ اختیار ساعت ده است؛ پیش از آن نقطه‌ای نیست
      { time: 100500, price: 6000, quantity: 5 },
      { time: 112000, price: 7000, quantity: 5, canceled: true },
      { time: 113000, price: 6800, quantity: 5 },
    ] },
  };
  const intra = intradayPnlSeries(pos, tape, { fees, date: 20260903 });
  check('روند درون‌روزی پیش از اولین معاملهٔ همهٔ پاها نقطه نمی‌سازد',
    intra.gaps.some((g) => g.second === 9 * 3600 + 1800) && !intra.points.some((p) => p.second < 10 * 3600),
    `${intra.points.length} نقطه`);
  check('لحظهٔ ده و نیم آخرین معاملهٔ پیش از خودش را می‌گیرد',
    near(intra.points.find((p) => p.second === 10 * 3600 + 1800).pnlTotal,
      pnlFromPrices(pos, [103000, 6000], { fees }).pnlTotal));
  check('معاملهٔ باطل‌شده در قیمت لحظه نمی‌نشیند',
    near(intra.points.find((p) => p.second === 11 * 3600 + 1800).pnlTotal,
      pnlFromPrices(pos, [103000, 6800], { fees }).pnlTotal));
  // اولین نقطه ۱۰:۳۰ است نه ۱۰:۰۰: در ۱۰:۰۰ هنوز اختیار معامله نشده بود.
  check('برچسب لحظه با رقم فارسی است', intra.points[0].label === '۱۰:۳۰', intra.points[0].label);
  check('روز روند درون‌روزی اعلام می‌شود', intra.date === 20260903, `${intra.date}`);
  check('بدون نوار، روند درون‌روزی علت می‌دهد',
    intradayPnlSeries(pos, { UA: { rows: [] }, OPT: { rows: [] } }, { fees }).reason === TRACK_REASONS.noTape);
  const picked = intradayPnlSeries(pos, tape, { fees, date: 20260903, moments: [10 * 3600, 12 * 3600] });
  check('لحظه‌های دلخواه پذیرفته می‌شوند', picked.points.length + picked.gaps.length === 2);

  // ——— دنبالهٔ جلسه ———
  let ticks = [];
  ticks = appendSessionTick(ticks, { at: 1000, pnlTotal: 5, pnl: 2.5, spot: 100 });
  ticks = appendSessionTick(ticks, { at: 1000, pnlTotal: 9 });
  check('تیک با همان زمان دو بار نمی‌نشیند', ticks.length === 1, `${ticks.length}`);
  ticks = appendSessionTick(ticks, { at: 2000, pnlTotal: 9 });
  ticks = appendSessionTick(ticks, { at: 3000, pnlTotal: NaN });
  check('تیک بی‌عدد اصلاً اضافه نمی‌شود', ticks.length === 2, `${ticks.length}`);
  let capped = [];
  for (let i = 1; i <= 12; i++) capped = appendSessionTick(capped, { at: i, pnlTotal: i }, { cap: 5 });
  check('سقف دنباله رعایت می‌شود و تازه‌ها می‌مانند',
    capped.length === 5 && capped[4].at === 12, `${capped.length}`);

  // ——— آماره ———
  const stats = trackStats([
    { date: 1, pnlTotal: 10 }, { date: 2, pnlTotal: 40 },
    { date: 3, pnlTotal: 15 }, { date: 4, pnlTotal: 25 },
  ]);
  check('آماره: تغییر از اولین تا آخرین نقطه', stats.change === 15, `${stats.change}`);
  check('آماره: قله و دره', stats.peak === 40 && stats.trough === 10);
  check('آماره: بیشترین افت از قله، نه از سقف کل', stats.drawdown === 25, `${stats.drawdown}`);
  check('آماره روی روند خالی عدد نمی‌سازد', trackStats([]).count === 0 && Number.isNaN(trackStats([]).change));

  // ——— تغییر نسبت به روز پیش ———
  const today = changeSince(series, { now: 1000, date: 20260903 });
  check('«سود و زیان امروز» از آخرین نقطهٔ پیش از امروز ساخته می‌شود',
    today.available === true && today.baseDate === 20260901, `${today.baseDate}`);
  check('تغییر امروز = سود و زیان الان منهای مبنای روز پیش',
    near(today.change, 1000 - series.points[0].pnlTotal));
  const noBase = changeSince(series, { now: 1000, date: 20260901 });
  check('بدون نقطهٔ پیشین، تغییر امروز ساخته نمی‌شود — صفر نمی‌شود',
    noBase.available === false && Number.isNaN(noBase.change));
  check('نبودن مبنا علت دارد', noBase.reason.length > 0);

  // ——— کارمزد ———
  const free = pnlFromPrices(pos, [104000, 7000], { fees: zero });
  check('بدون کارمزد، سود بیشتر از حالت کارمزددار است', free.pnl > mark.pnl);
}
