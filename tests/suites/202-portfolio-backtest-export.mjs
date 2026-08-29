// ۲۰۲. دفترچهٔ اکسل آزمون همه استراتژی‌ها

import { check, group } from '../harness.mjs';
import { analyzePortfolio } from '../../core/portfolio-report.mjs';
import { buildPnlMatrix } from '../../core/portfolio-matrix.mjs';
import { allocatePortfolio } from '../../core/portfolio-allocation.mjs';
import {
  portfolioBacktestFilename, portfolioBacktestWorkbook,
} from '../../ui/portfolio-backtest-export.mjs';

group('۲۰۲. دفترچهٔ اکسل');
{
  const entry202 = { marginGross: 1000, netCash: 0, marginNet: 1000, capital: 1000, notional: 5000, legValue: 400, legValueComplete: true };
  const rows202 = [];
  for (let s = 0; s < 4; s++) {
    for (let c = 0; c < 3; c++) {
      const daily = [];
      for (let d = 0; d < 8; d++) {
        // استراتژی سوم عمداً یک روز داده ندارد، تا خانهٔ خالی سنجیده شود.
        if (s === 2 && d === 3) continue;
        daily.push({ date: 20260801 + d, netPnl: Math.round(Math.sin((d + s) / 2) * 90 * (c + 1)) });
      }
      rows202.push({
        id: `${s}:${c}`, strategyId: `S${s}`, strategyName: `استراتژی ${s}`,
        groupId: `g${s % 2}`, groupName: `خانوادهٔ ${s % 2}`, feasible: true,
        entry: { ...entry202, legValue: 400 * (c + 1) },
        legs: [{ ins: '1' }], strikes: [1000 + c * 50], expiries: [20260930], path: { daily },
      });
    }
  }
  // یک ترکیب با ارزش معاملهٔ ناقص و یکی بی‌مخرج: بدون این دو، ادعای
  // «خانهٔ نامعلوم خالی می‌ماند» هرگز آزموده نمی‌شود — چیدمانی که فقط
  // دادهٔ کامل دارد، سخت‌گیری را نمی‌سنجد.
  rows202.push({
    id: 'PARTIAL', strategyId: 'SP', strategyName: 'استراتژی ناقص',
    groupId: 'g0', groupName: 'خانوادهٔ 0', feasible: true,
    entry: { ...entry202, legValue: 400, legValueComplete: false },
    legs: [{ ins: '1' }], strikes: [900], expiries: [20260930],
    path: { daily: Array.from({ length: 8 }, (_, d) => ({ date: 20260801 + d, netPnl: 10 * d })) },
  });
  rows202.push({
    id: 'BLIND', strategyId: 'SB', strategyName: 'استراتژی بی‌مخرج',
    groupId: 'g1', groupName: 'خانوادهٔ 1', feasible: true,
    entry: { ...entry202, marginGross: null, netCash: null },
    legs: [{ ins: '1' }], strikes: [800], expiries: [20260930],
    path: { daily: Array.from({ length: 8 }, (_, d) => ({ date: 20260801 + d, netPnl: 5 * d })) },
  });
  const mx202 = buildPnlMatrix(rows202);
  mx202.baseSeries = mx202.dates.map((date, index) => index * 0.4);
  const analysis202 = analyzePortfolio({ rows: rows202, matrix: mx202 });
  const basket202 = allocatePortfolio({
    capitalRial: 1e9, analysis: analysis202,
    picks: analysis202.strategies.slice(0, 2).map((row, index) => ({
      strategyId: row.strategyId,
      comboId: analysis202.combos.find((combo) => combo.strategyId === row.strategyId && combo.series.ok)?.id,
      pct: [50, 40][index],
    })),
  });
  const book202 = portfolioBacktestWorkbook(analysis202, {
    basket: basket202, generated: [{ strategyId: 'S0', capped: true, accepted: 3 }, { strategyId: 'S9', capped: false, accepted: 0 }],
    dateLabel: (value) => `روز ${value}`,
    context: { baseName: 'نماد آزمایشی', baseIns: '1', entryDate: 20260801, exitDate: 20260808, units: 5, cap: 120, entryBasis: 'پایانی', exitBasis: 'آخرین' },
  });
  const byName = (name) => book202.find((row) => row.name === name);

  check('دفترچه چند برگ دارد، نه یک جدول', book202.length >= 12, `${book202.length} برگ`);
  for (const name of ['سرشناسه', 'سرخط‌ها', 'سنجه‌ها', 'خانواده‌ها', 'ترکیب‌ها', 'مسیر روزانه',
    'افق نگهداری', 'توزیع', 'همبستگی', 'محدودیت داده', 'برگ‌ها']) {
    check(`برگ «${name}» هست`, !!byName(name), name);
  }
  check('برگ‌های سبد فقط وقتی می‌آیند که سبدی ساخته شده باشد',
    !!byName('سبد — اجزا') && !!byName('سبد — مسیر') && !!byName('سبد — سهم اجزا')
    && !portfolioBacktestWorkbook(analysis202, {}).some((row) => row.name.startsWith('سبد')));

  // ── سرشناسه، هویت فایل است ──────────────────────────────────────────
  const header202 = Object.fromEntries(byName('سرشناسه').rows.map((row) => [row[0], row[1]]));
  check('نام نماد و هر دو تاریخ در سرشناسه‌اند',
    header202['نماد پایه'] === 'نماد آزمایشی' && header202['تاریخ ورود'] === 'روز 20260801');
  // یک ستون «بازده» بدون نامِ مبنایش، در فایلی که ماه بعد باز می‌شود
  // بی‌معناست.
  check('مبنای بازده و تعریفش در سرشناسه ثبت می‌شود',
    header202['مبنای بازده'] === 'سرمایهٔ درگیر ناخالص' && String(header202['تعریف مبنا']).includes('وجه تضمین'));
  check('آماره و وزن‌دهی هم ثبت می‌شوند',
    header202['آمارهٔ دسته‌ها'] === 'میانه' && header202['وزن‌دهی'] === 'هم‌وزن');

  // ── خانهٔ خالی، صفر نمی‌شود ─────────────────────────────────────────
  const path202 = byName('مسیر روزانه');
  const holes202 = path202.rows.filter((row) => row[4] === '');
  check('روزِ بی‌داده در مسیر، خانهٔ خالی می‌شود نه صفر',
    holes202.length > 0 && holes202.every((row) => row[4] === '' && row[5] === ''),
    `${holes202.length} خانهٔ خالی`);
  check('هیچ خانهٔ خالی‌ای صفر ننوشته',
    !path202.rows.some((row) => row[4] === 0 && row[9] === ''));
  check('سود صفرِ واقعی همچنان صفر می‌ماند',
    byName('ترکیب‌ها').rows.every((row) => row[14] === '' || typeof row[14] === 'number'));
  const combo202 = (id) => byName('ترکیب‌ها').rows.find((row) => row[0] === id);
  check('ارزش معاملهٔ ناقص، خانهٔ خالی می‌شود نه جمع ناقص',
    combo202('PARTIAL')[13] === '', JSON.stringify(combo202('PARTIAL')[13]));
  check('ارزش معاملهٔ کامل، عدد واقعی می‌نویسد',
    typeof combo202('0:0')[13] === 'number' && combo202('0:0')[13] === 400);
  check('ترکیب بی‌مخرج کنار گذاشته و مخرجش خالی می‌ماند',
    combo202('BLIND')[5] === 'کنارگذاشته' && combo202('BLIND')[7] === ''
    && combo202('BLIND')[6].length > 0, JSON.stringify(combo202('BLIND').slice(5, 8)));
  check('اجزای مخرجِ ثبت‌نشده هم خالی می‌مانند، نه صفر',
    combo202('BLIND')[8] === '' && combo202('BLIND')[10] === '');
  check('نتیجهٔ ترکیب بی‌مخرج، درصد جعلی نمی‌سازد',
    combo202('BLIND')[15] === '' && combo202('BLIND')[18] === '');

  // ── ستون‌ها ─────────────────────────────────────────────────────────
  check('برگ سنجه‌ها هر چهارده سنجه را ستون دارد',
    byName('سنجه‌ها').headers.length === 24, String(byName('سنجه‌ها').headers.length));
  check('ستون ارزش معامله واحدش را می‌گوید',
    byName('سنجه‌ها').headers.includes('ارزش معاملهٔ ورود (ریال)'));
  check('برگ ترکیب‌ها اجزای مخرج را جدا می‌آورد',
    ['وجه تضمین ناخالص', 'وجه تضمین خالص', 'نقد خالص ورود', 'ارزش اسمی']
      .every((name) => byName('ترکیب‌ها').headers.includes(name)));
  check('برگ مسیر روزانه برای PivotTable بلند است، نه پهن',
    byName('مسیر روزانه').headers.includes('تاریخ')
    && byName('مسیر روزانه').rows.length === analysis202.strategies.length * analysis202.dates.length,
    String(byName('مسیر روزانه').rows.length));

  // ── برگ محدودیت، عمداً هست ──────────────────────────────────────────
  // فایلی که فقط عددهای موفق را نشان دهد، خودش یک ادعای ناگفته دارد.
  const limits202 = Object.fromEntries(byName('محدودیت داده').rows.map((row) => [row[0], row[1]]));
  check('استراتژی سقف‌خورده و بدون ترکیب معتبر شمرده می‌شوند',
    limits202['استراتژی سقف‌خورده'] === 1 && limits202['استراتژی بدون ترکیب معتبر'] === 1);
  check('شمار روزهای بی‌داده گزارش می‌شود',
    limits202['روزِ بی‌داده در مسیرها'] > 0, String(limits202['روزِ بی‌داده در مسیرها']));
  check('قاعدهٔ خانهٔ خالی در خود فایل نوشته شده',
    byName('محدودیت داده').rows.some((row) => String(row[2]).includes('اکسل صفر را در میانگین می‌شمارد')));

  // ── راهنمای برگ‌ها ──────────────────────────────────────────────────
  // ادعا این نیست که «چند ردیف دارد» — این است که **هیچ برگی بی‌راهنما
  // نمانده**. برگی که کسی نمی‌داند چیست، عملاً وجود ندارد.
  const guided202 = byName('برگ‌ها').rows.map((row) => String(row[0]));
  const missingGuide202 = book202
    .map((row) => row.name)
    .filter((name) => name !== 'برگ‌ها')
    // برگ‌های چندتکه («ترکیب‌ها ۲») با نام پایه‌شان راهنما می‌گیرند.
    .filter((name) => !guided202.some((entry) => name === entry || name.startsWith(`${entry} `)));
  check('هر برگ در راهنما توضیح دارد', missingGuide202.length === 0, missingGuide202.join('، '));
  check('هر ردیف راهنما هم نام دارد هم توضیح',
    byName('برگ‌ها').rows.every((row) => row[0] && row[1]));

  check('نام فایل، نماد و بازه را دارد',
    portfolioBacktestFilename({ baseName: 'اهرم', entryDate: 20260801, exitDate: 20260808 })
      === 'آزمون-همه-استراتژی‌ها-اهرم-20260801-20260808');
  check('تحلیل نبود، دفترچه ساخته نمی‌شود', portfolioBacktestWorkbook(null).length === 0);
}
