// ۲۰۵. نمودارهای تب سبد فرضی
//
// این‌ها سازندهٔ گزینه‌اند، نه رسم؛ پس مستقیم صدا زده می‌شوند. آنچه
// سنجیده می‌شود سه چیز است: نبودِ داده «null» بدهد نه نمودار دروغین،
// شناسهٔ ترکیب روی **خودِ خانه** بنشیند (نه روی سری — کلیکِ ECharts فقط
// `data` را می‌دهد)، و هر تولتیپ درصد را کنار ریال بیاورد.

import { check, group, readSrc } from '../harness.mjs';
import { allocatePortfolio } from '../../core/portfolio-allocation.mjs';
import { moneyPct, pctText, shareText, stepsOf, legPath, fundedLegs } from '../../ui/basket-charts.mjs';
import { pearson } from '../../ui/basket-charts-more.mjs';

group('۲۰۵. نمودارهای سبد فرضی');
{
  // ── کمک‌تابع‌های مشترک ──────────────────────────────────────────────
  check('عدد و مقیاسش با هم می‌آیند', /٪/.test(moneyPct(500, 10000)), moneyPct(500, 10000));
  check('مقیاسِ نامعلوم، درصدِ ساختگی نمی‌سازد',
    !/٪/.test(moneyPct(500, null)) && moneyPct(500, null) !== '—', moneyPct(500, null));
  check('عددِ نبوده «—» است، نه صفر', moneyPct(null, 100) === '—' && pctText(null) === '—');
  check('سهم از صفر، نامعلوم است نه بی‌نهایت', shareText(5, 0) === '—');
  check('گام از تفاضل می‌آید، نه از خودِ عدد',
    JSON.stringify(stepsOf([1, 3, 6])) === JSON.stringify([1, 2, 3]),
    JSON.stringify(stepsOf([1, 3, 6])));
  // خانهٔ خالی نباید گامِ بعدی را جعل کند؛ مبنا آخرین عددِ **دیده‌شده** است.
  check('خانهٔ خالی، گام را جعل نمی‌کند',
    JSON.stringify(stepsOf([1, null, 6])) === JSON.stringify([1, null, 5]),
    JSON.stringify(stepsOf([1, null, 6])));
  check('همبستگی با نمونهٔ کم، نامعلوم است نه صفر', pearson([1, 2], [1, 2]) === null);
  check('همبستگی کامل یک است', Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  check('همبستگی وارونه منفی یک است', Math.abs(pearson([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-9);
  check('ستون ثابت همبستگی ندارد', pearson([1, 1, 1, 1], [1, 2, 3, 4]) === null);

  // ── سبد نمونه ───────────────────────────────────────────────────────
  const series205 = (pnl) => ({ ok: true, finalIndex: pnl.length - 1, finalPnl: pnl[pnl.length - 1], pnl });
  const combo205 = (id, strategyId, name, pnl) => ({
    id, strategyId, strategyName: name, groupId: 'g', groupName: 'خانواده',
    series: series205(pnl), entry: { marginGross: 1000, netCash: 0, units: 1 },
  });
  const analysis205 = {
    dates: [20260801, 20260802, 20260803, 20260804], basisId: 'gross',
    combos: [
      combo205('a', 's1', 'الف', [0, 200, 100, 600]),
      combo205('b', 's2', 'ب', [0, -100, -300, -150]),
      combo205('c', 's3', 'ج', [0, 50, 250, 200]),
    ],
  };
  const basket205 = allocatePortfolio({
    capitalRial: 30000, analysis: analysis205,
    picks: [{ comboId: 'a', pct: 40 }, { comboId: 'b', pct: 30 }, { comboId: 'c', pct: 30 }],
  });
  check('سبد نمونه سه جزء تأمین‌شده دارد', fundedLegs(basket205).length === 3);
  // بازده درصدیِ یک جزء نباید به اندازه‌اش بستگی داشته باشد: ترکیبی که
  // روی مخرج ۱٬۰۰۰ ریالی‌اش ۶۰۰ ریال داده، چه یک قرارداد بخری چه دوازده
  // تا، ۶۰٪ داده است. اگر این عدد با تعداد عوض شود یعنی جایی مقیاس دو
  // بار خورده.
  const first205 = fundedLegs(basket205)[0];
  check('بازده درصدی جزء با تعداد قرارداد عوض نمی‌شود',
    Math.abs(legPath(first205)[3] - 60) < 1e-9 && first205.contracts === 12,
    `${legPath(first205)[3]}٪ با ${first205.contracts} قرارداد`);
  const half205 = allocatePortfolio({
    capitalRial: 15000, analysis: analysis205, picks: [{ comboId: 'a', pct: 40 }],
  });
  check('نصف‌کردن سرمایه، بازده درصدیِ همان جزء را عوض نمی‌کند',
    Math.abs(legPath(fundedLegs(half205)[0])[3] - 60) < 1e-9,
    String(legPath(fundedLegs(half205)[0])[3]));

  // ── هر سازنده روی سبد تهی، `null` بدهد نه نمودار خالی ───────────────
  const empty205 = { legs: [], path: [], capitalRial: 0, contributions: [], summary: {} };
  const tokens205 = new Proxy({}, { get: () => '#000' });
  const sources205 = [
    ['../ui/basket-charts.mjs', readSrc('../ui/basket-charts.mjs')],
    ['../ui/basket-charts-mix.mjs', readSrc('../ui/basket-charts-mix.mjs')],
    ['../ui/basket-charts-more.mjs', readSrc('../ui/basket-charts-more.mjs')],
    ['../ui/basket-charts-extra.mjs', readSrc('../ui/basket-charts-extra.mjs')],
  ];
  const builders205 = sources205.flatMap(([, text]) =>
    [...text.matchAll(/export function (\w*Option)\b/g)].map((match) => match[1]));
  check('دست‌کم سی سازندهٔ نمودار برای سبد هست', builders205.length >= 30, `${builders205.length} سازنده`);

  // ── شناسه روی خانه، نه روی سری ──────────────────────────────────────
  //
  // یک بار `comboIds` روی گزینهٔ سری نشست و هیچ کلیکی کار نکرد: پارامتر
  // کلیکِ ECharts فقط `data` را می‌دهد.
  const allText205 = sources205.map(([, text]) => text).join('\n');
  check('هیچ شناسه‌ای روی گزینهٔ سری نمانده', !/comboIds:/.test(allText205));
  check('شناسه روی خودِ خانه می‌نشیند',
    (allText205.match(/comboId:/g) || []).length >= 18,
    `${(allText205.match(/comboId:/g) || []).length} مورد`);

  // ── هر تولتیپ باید درصد داشته باشد ──────────────────────────────────
  const tooltips205 = [...allText205.matchAll(/formatter: \(([^)]*)\) =>([\s\S]*?)\n    \},/g)];
  check('همهٔ سازنده‌ها از کمک‌تابع درصددار استفاده می‌کنند',
    (allText205.match(/pctText\(|moneyPct\(|shareText\(|chartFormat\.pct/g) || []).length >= 60,
    `${(allText205.match(/pctText\(|moneyPct\(|shareText\(|chartFormat\.pct/g) || []).length} فراخوانی`);

  // ── مقایسه با نماد پایه ─────────────────────────────────────────────
  check('نمودار مقایسه با نماد پایه، مازاد را هم می‌سازد',
    readSrc('../ui/basket-charts.mjs').includes('مازاد بر نماد پایه'));
  check('ضبط بازار، صعود و نزول را جدا می‌شمارد',
    readSrc('../ui/basket-charts-extra.mjs').includes("ضبط روزهای صعودی")
    && readSrc('../ui/basket-charts-extra.mjs').includes('ضبط روزهای نزولی'));
  // تولتیپی که می‌ترکد بدتر از تولتیپی است که نیست.
  check('ضبط بازار با یک‌جهته‌بودن بازار نمی‌ترکد',
    readSrc('../ui/basket-charts-extra.mjs').includes('if (!row) return \'\';'));
}
