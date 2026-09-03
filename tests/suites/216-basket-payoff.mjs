// ۲۱۶. کشویی مرتب بر نردبان اعمال، و منحنی بازده در برابر قیمت پایه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// ═══ چرا لازم شد ═══
//
// صاحب پروژه دو فهرست را کنار هم گذاشت — ترکیب‌های جدول رتبه‌بندی و
// گزینه‌های کشویی سبد — و گفت «یکسان نبودند». مجموعه‌شان یکی بود ولی
// ترتیبشان نه: جدول بر بازده مرتب می‌شد و کشویی به ترتیب ساخت می‌ماند.
// با صد و نود و نه گزینه، دو فهرست با یک مجموعه و دو ترتیب، عملاً دو
// فهرست‌اند.
//
// درسِ ماندگارترش این بود که «یکی بودنِ این دو مجموعه» هیچ‌وقت آزمون
// نداشت؛ فقط سه رونوشت از یک خطِ `filter` بود در سه فایل. حالا یک تعریف
// است — `combosFor` — و این دسته همان را نگه می‌دارد.

import { check, group } from '../harness.mjs';
import { combosFor, comboLotCost, firstComboId, lotCostRial } from '../../core/basket-picks.mjs';
import {
  DEFAULT_BINS, MIN_BIN_POINTS, payoffBins, payoffPoints, payoffSlope,
} from '../../core/basket-payoff.mjs';
import { payoffCurveOption, payoffNote, payoffSlopeText } from '../../ui/basket-payoff.mjs';
import { analyzePortfolio } from '../../core/portfolio-report.mjs';
import { buildPnlMatrix } from '../../core/portfolio-matrix.mjs';

// مبنای «خالص» مخرج را از `entry.capital` می‌خواند — کوتاه‌ترین راه برای
// ساختن ترکیبی با بهای قرارداد معلوم.
const combo = (id, capital, units = 1, over = {}) => ({
  id, strategyId: 'S', strategyName: 'استرانگل فروش',
  entry: capital === null ? {} : { capital, units },
  series: { ok: true, finalPct: 0, finalIndex: 0, ...over.series },
  ...over,
});
const strangle = (id, putStrike, callStrike, capital) => combo(id, capital, 1, {
  legs: [
    { kind: 'call', strike: callStrike },
    { kind: 'put', strike: putStrike },
  ],
  strikes: [putStrike, callStrike],
});
const callCombo = (id, strike, capital) => combo(id, capital, 1, {
  legs: [{ kind: 'call', strike }], strikes: [strike],
});
const src = (combos) => ({ id: 'r1', label: 'اجرا', analysis: { combos, basisId: 'net' } });

group('۲۱۶-الف. بهای یک قرارداد');
{
  check('مخرج بر تعداد واحد تقسیم می‌شود',
    comboLotCost(combo('a', 6e6, 3), 'net') === 2e6);
  check('واحدِ نامعلوم یعنی خودِ مخرج، نه تقسیم بر صفر',
    comboLotCost(combo('a', 6e6, 0), 'net') === 6e6);
  check('مخرجِ نبود، بهای نامعلوم می‌دهد نه صفر',
    comboLotCost(combo('a', null), 'net') === null);
  check('ترکیب نبود هم null است', comboLotCost(null, 'net') === null);
  check('`lotCostRial` همان عدد را می‌دهد',
    lotCostRial(src([combo('a', 4e6, 2)]), 'a', 'net') === 2e6);
  check('شناسهٔ ناموجود، بها ندارد',
    lotCostRial(src([combo('a', 4e6)]), 'nope', 'net') === null);
}

group('۲۱۶-ب. ترتیب کشویی: اعمال پایۀ اول، سپس اعمال‌های بعدی');
{
  const list = combosFor(src([
    strangle('p30-c50', 30_000, 50_000, 1e6),
    strangle('p20-c60', 20_000, 60_000, 9e6),
    strangle('p20-c40', 20_000, 40_000, 7e6),
  ]), 'S', 'net');
  check('هر سه هستند', list.length === 3);
  check('اعمال پایۀ اول کلید اصلی و اعمال بعدی کلیدهای بعدی‌اند',
    list.map((row) => row.id).join(',') === 'p20-c40,p20-c60,p30-c50');
  check('بهای قرارداد ترتیب اعمال را عوض نمی‌کند',
    list.map((row) => comboLotCost(row, 'net')).join(',') === '7000000,9000000,1000000');

  const withUnknown = combosFor(src([
    strangle('p30', 30_000, 50_000, 9e6), combo('gomnam', 1e6), strangle('p20', 20_000, 40_000, 7e6),
  ]), 'S', 'net');
  check('اعمال نامعلوم ته فهرست می‌ماند، نه اولِ آن',
    withUnknown.map((row) => row.id).join(',') === 'p20,p30,gomnam');

  // اعمال برابر نباید ترتیب را میان دو رسم جابه‌جا کند: کشویی‌ای که زیر
  // دست کاربر می‌لغزد، از کشویی نامرتب بدتر است.
  const tied = () => combosFor(src([
    strangle('z', 20_000, 40_000, 5e6), strangle('a', 20_000, 40_000, 5e6),
    strangle('m', 20_000, 40_000, 5e6),
  ]), 'S', 'net').map((row) => row.id).join(',');
  check('اعمال برابر با شناسه باز می‌شود و پایدار می‌ماند',
    tied() === 'a,m,z' && tied() === tied());

  check('ترتیب برای استراتژی فقط-کال هم از اعمال می‌آید، نه از بها',
    combosFor(src([
      callCombo('call-40-cheap', 40_000, 1e6), callCombo('call-20-expensive', 20_000, 9e6),
    ]), 'S', 'net').map((row) => row.id).join(',') === 'call-20-expensive,call-40-cheap');
}

group('۲۱۶-ج. همان مجموعه‌ای که رتبه‌بندی نشان می‌دهد');
{
  const rows = [
    strangle('ok1', 20_000, 50_000, 3e6), strangle('ok2', 30_000, 40_000, 1e6),
    combo('bad', 2e6, 1, { series: { ok: false, finalPct: 99, finalIndex: 0 } }),
    { ...combo('other', 1, 1), strategyId: 'T' },
  ];
  const source = src(rows);
  // همان شرطی که جدول رتبه‌بندی و کشوی جزئیات با آن کار می‌کنند.
  const ranking = rows.filter((row) => row.strategyId === 'S' && row.series?.ok).map((row) => row.id);
  const dropdown = combosFor(source, 'S', 'net').map((row) => row.id);
  check('مجموعه دقیقاً یکی است',
    [...dropdown].sort().join(',') === [...ranking].sort().join(','));
  check('ترکیبِ بی‌سری وارد نمی‌شود', !dropdown.includes('bad'));
  check('ترکیبِ استراتژی دیگر وارد نمی‌شود', !dropdown.includes('other'));
  check('استراتژی نبود یعنی فهرست خالی، نه همه‌چیز',
    combosFor(source, '', 'net').length === 0 && combosFor(null, 'S').length === 0);
  check('پیش‌فرضِ سطر تازه کمترین اعمال پایه است، نه ارزان‌ترین قرارداد',
    firstComboId(source, 'S', 'net') === 'ok1');
  check('استراتژی بی‌ترکیب، شناسهٔ خالی می‌دهد',
    firstComboId(source, 'NOPE', 'net') === '');
}

group('۲۱۶-د. نقطه‌های منحنی: خالی پر نمی‌شود');
{
  const basket = { path: [
    { returnPct: 0 }, { returnPct: 5 }, { returnPct: 8 },
    { returnPct: null }, { returnPct: -2 }, { returnPct: null },
  ] };
  const shaped = payoffPoints({
    basket,
    basePrices: [1000, 1100, null, 1300, 1200, null],
    labels: ['ت۱', 'ت۲', 'ت۳', 'ت۴', 'ت۵', 'ت۶'],
  });
  check('فقط لحظه‌هایی که هر دو را دارند نقطه شدند',
    shaped.points.map((row) => row.index).join(',') === '0,1,4');
  check('قیمت لحظهٔ قبل جای قیمتِ نبود نمی‌نشیند',
    !shaped.points.some((row) => row.index === 2));
  check('علت جاماندن جدا شمرده می‌شود',
    shaped.skipped.noPrice === 1 && shaped.skipped.noReturn === 1
    && shaped.skipped.noBoth === 1 && shaped.skipped.total === 3);
  check('قیمت ورود نخستین لحظهٔ نقطه‌دار است', shaped.entryPrice === 1000);
  check('پایان، آخرین نقطه است — نه آخرین ستون',
    shaped.finalPrice === 1200 && shaped.finalPct === -2);
  check('دامنه‌ها از خودِ نقطه‌ها می‌آیند',
    shaped.priceRange.join('-') === '1000-1200' && shaped.pctRange.join('-') === '-2-5');
  check('برچسب هر نقطه با خودش می‌ماند',
    shaped.points.map((row) => row.label).join(',') === 'ت۱,ت۲,ت۵');
  check('قیمت صفر یا منفی قیمت نیست',
    payoffPoints({ basket: { path: [{ returnPct: 1 }, { returnPct: 2 }] }, basePrices: [0, -5] })
      .points.length === 0);
  check('سبد نبود یعنی هیچ نقطه‌ای، نه خطا',
    payoffPoints({}).points.length === 0 && payoffPoints().skipped.total === 0);
  const note = payoffNote(basket, [1000, 1100, null, 1300, 1200, null], ['a', 'b', 'c', 'd', 'e', 'f']);
  check('خبرِ زیر نمودار هر سه علت را می‌گوید',
    note.includes('قیمت نماد پایه نداشت') && note.includes('یک جزء سبد قیمت نداشت')
    && note.includes('هیچ‌کدام'));
}

group('۲۱۶-ه. پله‌های قیمت');
{
  const points = Array.from({ length: 20 }, (unused, at) => ({
    index: at, price: 1000 + (at * 10), pct: at, label: '',
  }));
  // پله‌بندی از پشتِ یک نگهبان صدا زده می‌شود: مهارِ گم‌شدهٔ پلهٔ آخر
  // استثنا می‌داد و کل دسته را می‌خواباند، و آن‌وقت باگ از خرابیِ خودِ
  // آزمون قابل تشخیص نبود. حالا هر شکستی یک ادعای رد است.
  const safeBins = (list, count) => { try { return payoffBins(list, count); } catch { return null; } };
  const bins = safeBins(points, 4) ?? [];
  check('پله‌بندی بدون استثنا انجام می‌شود', safeBins(points, 4) !== null);
  check('پله‌ها ساخته شدند و هیچ‌کدام بی‌نمونه نیست',
    bins.length === 4 && bins.every((row) => row.samples > 0));
  check('مجموع نمونه‌ها همان شمار نقطه‌هاست',
    bins.reduce((sum, row) => sum + row.samples, 0) === points.length);
  check('گران‌ترین نقطه به پلهٔ آخر می‌خورد، نه پلهٔ ناموجودِ بعدی',
    safeBins(points, 4)?.at(-1)?.high >= 1190 && safeBins(points, 4)?.at(-1)?.samples >= 1);
  check('پله‌ها صعودی و بی‌همپوشانی‌اند',
    bins.every((row, at) => at === 0 || row.low >= bins[at - 1].high - 1e-9));
  check('مقدارِ هر پله میانگین است نه جمع',
    bins.every((row) => row.pct >= 0 && row.pct <= 19));
  check(`زیر ${MIN_BIN_POINTS} نقطه پله‌بندی نمی‌شود`,
    safeBins(points.slice(0, MIN_BIN_POINTS - 1), 4)?.length === 0);
  check('قیمتِ تکان‌نخورده پله ندارد',
    safeBins(points.map((row) => ({ ...row, price: 1000 })), 4)?.length === 0);
  check('پلهٔ خالی ردیف نمی‌گیرد',
    (safeBins([...points.slice(0, 10), { index: 99, price: 5000, pct: 3, label: '' },
      ...points.slice(10, 12)], 20) ?? []).length > 0
    && safeBins([...points.slice(0, 10), { index: 99, price: 5000, pct: 3, label: '' },
      ...points.slice(10, 12)], 20).every((row) => row.samples > 0));
  check('شمار پلهٔ بی‌معنا به دو گرد می‌شود، نه صفر',
    safeBins(points, 0)?.length === 2 && DEFAULT_BINS > 0);
}

group('۲۱۶-و. حساسیت به پایه');
{
  const straight = [
    { index: 0, price: 1000, pct: 0 },
    { index: 1, price: 1100, pct: 10 },
    { index: 2, price: 1200, pct: 20 },
  ];
  check('حرکت یک‌به‌یک، شیب یک می‌دهد',
    Math.abs(payoffSlope(straight, 1000) - 1) < 1e-9);
  check('نصف حرکت، نصف شیب',
    Math.abs(payoffSlope(straight.map((row) => ({ ...row, pct: row.pct / 2 })), 1000) - 0.5) < 1e-9);
  check('سبد خنثی شیب صفر دارد',
    Math.abs(payoffSlope(straight.map((row) => ({ ...row, pct: 4 })), 1000)) < 1e-9);
  check('نبودِ قیمت ورود از نخستین نقطه جبران می‌شود',
    Math.abs(payoffSlope(straight) - 1) < 1e-9);
  check('کمتر از دو نقطه شیب ندارد', payoffSlope(straight.slice(0, 1), 1000) === null);
  check('قیمتِ ثابت شیب ندارد — تقسیم بر صفر نمی‌شود',
    payoffSlope(straight.map((row) => ({ ...row, price: 1000 })), 1000) === null);
  check('ورودی بی‌معنا شیب ندارد',
    payoffSlope([], 1000) === null && payoffSlope(straight, 0) === null);
  // قیمت ورودِ منفی حساب را نمی‌شکند — همهٔ عددها متناهی درمی‌آیند و شیبی
  // ساخته می‌شود که معنایی ندارد. تنها نگهبانِ اول جلویش را می‌گیرد.
  check('قیمت ورودِ منفی شیب نمی‌سازد، عددِ بی‌معنا هم نمی‌دهد',
    payoffSlope(straight, -100) === null);
  check('یک نقطه هم شیب نمی‌دهد حتی وقتی قیمت ورود درست است',
    payoffSlope([{ index: 0, price: 1000, pct: 5 }], 900) === null);
}

group('۲۱۶-ز. گزینهٔ نمودار');
{
  const tokens = new Proxy({}, { get: () => '#000' });
  const many = {
    path: Array.from({ length: 30 }, (unused, at) => ({ returnPct: at - 10 })),
  };
  const prices = Array.from({ length: 30 }, (unused, at) => 1000 + (at * 7));
  const labels = Array.from({ length: 30 }, (unused, at) => `ت${at}`);
  // ساختِ گزینه هم از پشت نگهبان: نموداری که استثنا می‌دهد، در مرورگر
  // پنلِ سفید می‌سازد نه پیام خالی — و اینجا هم به‌جای ادعای رد، دسته را
  // می‌خواباند.
  const build = (...args) => { try { return payoffCurveOption(...args); } catch { return undefined; } };
  const option = build(many, prices, labels, tokens, { bins: 6 });
  check('ساخت گزینه استثنا نمی‌دهد', option !== undefined && option !== null);
  check('محور افقی قیمت است و عددی، نه دسته‌ای',
    option?.xAxis?.type === 'value' && option?.xAxis?.name.includes('قیمت'));
  check('محور عمودی بازده است', option?.yAxis?.name.includes('بازده'));
  check('سه سری: مسیر، لحظه‌ها، میانگین پله‌ها', option?.series.length === 3);
  check('مسیر هموار نمی‌شود — شکلی که در داده نبود ساخته نمی‌شود',
    option?.series?.[0].type === 'line' && option?.series?.[0].smooth === false);
  check('نقطه‌ها پراکنده‌اند و بعد سومشان زمان است',
    option?.series?.[1].type === 'scatter' && option?.series?.[1].data[3].value.length === 3
    && option?.series?.[1].data[3].value[2] === 3);
  check('رنگ نقطه‌ها بر بعد زمان می‌نشیند، نه بر قیمت',
    option?.visualMap?.dimension === 2 && option?.visualMap?.seriesIndex === 1);
  check('خط سر به سر و خط قیمت ورود کشیده می‌شوند',
    option?.series?.[1]?.markLine?.data.some((row) => row.yAxis === 0)
    && option?.series?.[1]?.markLine?.data.some((row) => row.xAxis === 1000));
  check('ورود و پایان علامت‌گذاری شده‌اند',
    option?.series?.[1]?.markPoint?.data.length === 2
    && option?.series?.[1]?.markPoint?.data[1].xAxis === prices.at(-1));
  check('عنوانی روی راهنما نمی‌نشیند — حکم زیر نمودار می‌آید',
    !option?.title && payoffNote(many, prices, labels).includes('حساسیت به پایه'));
  check('حکمِ شیب جهت را هم می‌گوید',
    payoffSlopeText(1).includes('هم‌جهت') && payoffSlopeText(-1).includes('خلاف‌جهت')
    && payoffSlopeText(0.02).includes('بی‌اعتنا'));
  check('شیبِ نامعلوم حکمی نمی‌سازد',
    payoffSlopeText(null) === '' && payoffSlopeText(NaN) === '' && payoffSlopeText(undefined) === '');

  const off = build(many, prices, labels, tokens, { bins: 0 }) ?? { series: [] };
  check('صفر پله یعنی خط میانگین کشیده نمی‌شود، نه دو پله',
    off.series?.length === 2);

  check('کمتر از دو نقطه نموداری ندارد — میزبان پیام خالی می‌دهد',
    build({ path: [{ returnPct: 1 }] }, [1000], ['a'], tokens) === null
    && build({ path: [{ returnPct: 1 }, { returnPct: 2 }] }, [null, null], ['a', 'b'], tokens) === null);
}

group('۲۱۶-ح. قیمت پایه تا خودِ تحلیل می‌رسد');
{
  const rows = [{
    id: 'c1', strategyId: 'S', strategyName: 'S', groupId: 'g', groupName: 'g',
    entry: { capital: 1e6, units: 1 }, final: { returnPct: 1 },
    path: { daily: [{ date: 20260101, netPnl: 10 }, { date: 20260102, netPnl: 20 }, { date: 20260103, netPnl: 30 }] },
  }];
  const matrix = buildPnlMatrix(rows);
  matrix.baseSeries = [0, 5, 10];
  matrix.basePrices = [1000, 1050, 1100];
  const full = analyzePortfolio({ rows, matrix, basisId: 'net' });
  check('قیمت پایه روی همان ستون‌ها می‌نشیند',
    full.basePrices.join(',') === '1000,1050,1100');
  check('طولش همیشه به اندازهٔ ستون‌هاست',
    full.basePrices.length === full.dates.length);

  const windowed = analyzePortfolio({ rows, matrix, basisId: 'net', from: 20260102, to: 20260103 });
  check('بازهٔ عدسی روی قیمت پایه هم اعمال می‌شود',
    windowed.basePrices.join(',') === '1050,1100' && windowed.dates.length === 2);

  const bare = analyzePortfolio({ rows, matrix: { ...matrix, basePrices: undefined }, basisId: 'net' });
  check('اجرای بی‌قیمتِ پایه، آرایهٔ هم‌طولِ خالی می‌گیرد نه آرایهٔ کوتاه',
    bare.basePrices.length === bare.dates.length && bare.basePrices.every((value) => value === null));

  const dirty = analyzePortfolio({ rows, matrix: { ...matrix, basePrices: [1000, 0, -5] }, basisId: 'net' });
  check('صفر و منفی قیمت نیستند و به null می‌روند',
    dirty.basePrices.join(',') === [1000, null, null].join(','));
}
