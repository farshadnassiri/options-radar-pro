// ۲۰۶. آزمایشگاه نمودار
//
// دسته‌بندی این تب دلخواه نیست: همان تقسیمی است که کتابخانه‌های نموداری
// امروز مشترک دارند — مقایسه، سهم از کل، توزیع، رابطه، زمان، جریان، و
// انحراف. آنچه اینجا سنجیده می‌شود صحتِ ریاضیِ کمک‌تابع‌ها و قاعدهٔ
// مشترکِ «شناسه روی خودِ خانه» است.

import { check, group, readSrc } from '../harness.mjs';
import { density, groupBy, quantile, ranked, sharedGrid, usable } from '../../ui/chart-lab.mjs';
import { corr } from '../../ui/chart-lab-flow.mjs';

group('۲۰۶. آزمایشگاه نمودار');
{
  // ── کمک‌تابع‌های آماری ───────────────────────────────────────────────
  const sorted206 = [1, 2, 3, 4, 5];
  check('میانه از چارک نیم می‌آید', quantile(sorted206, 0.5) === 3, String(quantile(sorted206, 0.5)));
  check('چارک میان دو نمونه، درون‌یابی می‌شود',
    quantile([1, 2, 3, 4], 0.5) === 2.5, String(quantile([1, 2, 3, 4], 0.5)));
  check('چارک فهرست خالی، نامعلوم است نه صفر', quantile([], 0.5) === null);

  check('گروه‌بندی بر کلید، هر سطر را یک بار می‌گذارد',
    groupBy([{ g: 'الف' }, { g: 'ب' }, { g: 'الف' }], 'g').get('الف').length === 2);
  check('کلیدِ نبوده به «—» می‌رود، نه اینکه سطر گم شود',
    groupBy([{ g: null }], 'g').has('—'));

  // چگالی باید انتگرال‌پذیر و همیشه نامنفی باشد؛ منفی یعنی فرمول غلط.
  const grid206 = sharedGrid([1, 2, 3, 4, 5, 6]);
  const curve206 = density([1, 2, 2, 3, 8], grid206);
  check('شبکهٔ مشترک، از داده پهن‌تر است تا دنباله‌ها بریده نشوند',
    grid206[0] < 1 && grid206[grid206.length - 1] > 6, `${grid206[0]} تا ${grid206[grid206.length - 1]}`);
  check('چگالی هرگز منفی نمی‌شود', curve206.every((value) => value >= 0));
  check('چگالی روی خوشهٔ داده بیشینه است',
    curve206.indexOf(Math.max(...curve206)) < curve206.length / 2);
  check('چگالی با نمونهٔ کمتر از دو، صفر می‌ماند نه NaN',
    density([5], grid206).every((value) => value === 0));

  check('همبستگی کامل یک است', Math.abs(corr([1, 2, 3, 4], [3, 6, 9, 12]) - 1) < 1e-9);
  check('همبستگی با نمونهٔ کم نامعلوم است', corr([1, 2], [1, 2]) === null);
  check('ستون ثابت همبستگی ندارد', corr([2, 2, 2, 2], [1, 2, 3, 4]) === null);

  // ── مرتب‌سازی و غربال ───────────────────────────────────────────────
  const analysis206 = {
    strategies: [
      { strategyId: 'a', strategyName: 'الف', groupName: 'یک', score: 40, rank: 2, metrics: {}, path: {} },
      { strategyId: 'b', strategyName: 'ب', groupName: 'یک', score: 80, rank: 1, metrics: {}, path: {} },
      { strategyId: 'c', strategyName: 'ج', groupName: 'دو', score: null, rank: 3, metrics: {}, path: {} },
    ],
    combos: [
      { id: '1', strategyId: 'a', strategyName: 'الف', groupName: 'یک', series: { ok: true, finalPct: 5 } },
      { id: '2', strategyId: 'b', strategyName: 'ب', groupName: 'یک', series: { ok: true, finalPct: -3 } },
      { id: '3', strategyId: 'c', strategyName: 'ج', groupName: 'دو', series: { ok: false, finalPct: 9 } },
      { id: '4', strategyId: 'c', strategyName: 'ج', groupName: 'دو', series: { ok: true, finalPct: null } },
    ],
  };
  check('استراتژی بی‌نمره از رتبه‌بندی بیرون می‌ماند، نه با نمرهٔ صفر',
    ranked(analysis206).length === 2 && ranked(analysis206)[0].strategyId === 'b',
    ranked(analysis206).map((row) => row.strategyId).join('، '));
  check('ترکیبِ بی‌مسیر یا بی‌عدد پایانی، معتبر شمرده نمی‌شود',
    usable(analysis206).length === 2, String(usable(analysis206).length));

  // ── قاعدهٔ مشترکِ کلیک ───────────────────────────────────────────────
  //
  // پارامتر کلیکِ ECharts فقط `data` را می‌دهد؛ شناسه‌ای که روی گزینهٔ سری
  // بنشیند هرگز خوانده نمی‌شود.
  const labText206 = ['../ui/chart-lab.mjs', '../ui/chart-lab-shape.mjs',
    '../ui/chart-lab-flow.mjs', '../ui/chart-lab-more.mjs'].map(readSrc).join('\n');
  const builders206 = [...labText206.matchAll(/export function (\w*Option)\b/g)].map((m) => m[1]);
  check('دست‌کم سی سازندهٔ نمودار در آزمایشگاه هست',
    builders206.length >= 30, `${builders206.length} سازنده`);
  check('شناسه روی خودِ خانه می‌نشیند، نه روی سری',
    (labText206.match(/strategyId:/g) || []).length >= 30 && !/strategyIds:/.test(labText206),
    `${(labText206.match(/strategyId:/g) || []).length} مورد`);

  // ── تب و پیوند کل به جزء ────────────────────────────────────────────
  const tab206 = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('تب آزمایشگاه در نوار اصلی هست', tab206.includes("{ id: 'lab', label: 'آزمایشگاه نمودار'"));
  check('هفت دستهٔ نموداری تعریف شده',
    (tab206.match(/\{ id: 'lab-[a-z]+', label:/g) || []).length === 7,
    `${(tab206.match(/\{ id: 'lab-[a-z]+', label:/g) || []).length} دسته`);
  check('همهٔ نمودارهای آزمایشگاه در جدول ثبت شده‌اند',
    (tab206.match(/'lab-[a-z]+': \['lab-/g) || []).length >= 30,
    `${(tab206.match(/'lab-[a-z]+': \['lab-/g) || []).length} نمودار`);
  check('کلیک روی هر نمودار به جزئیات همان استراتژی می‌رود',
    tab206.includes('function openLabDetail(params, jump = null)')
    && tab206.includes('const id = params?.data?.strategyId ?? null;'));
  // کلیکِ بی‌اثر بدترین پاسخ است؛ نمودار سطح بازار به تبِ هم‌موضوعش می‌رود.
  check('نمودار سطح بازار، کلیکِ بی‌اثر ندارد',
    tab206.includes("if (jump) { dirty.delete(jump); tabsApi?.show(jump); }")
    && /labFunnel\(a, t\), null, 'ranking'/.test(tab206));
  check('فقط دستهٔ دیده‌شده رسم می‌شود',
    tab206.includes('function paintLabGroup(id)') && tab206.includes('if (group !== id) continue;'));
}
