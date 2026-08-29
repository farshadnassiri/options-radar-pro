// ۱۹۸. مسیر یک ترکیب — تجمعی از ورود، افت از سقفِ همان پنجره

import { check, group, near } from '../harness.mjs';
import { comboSeries, comboWeight } from '../../core/portfolio-series.mjs';

group('۱۹۸. مسیر ترکیب');
{
  const entry198 = { marginGross: 1000, netCash: 0, marginNet: 1000, capital: 1000, notional: 5000 };
  const row198 = { entry: entry198 };
  const pnl198 = [100, null, -50, 200];
  const full198 = comboSeries(row198, pnl198, [0, 1, 2, 3], 'gross');

  check('بازده هر روز روی مبنای انتخابی ساخته می‌شود',
    JSON.stringify(full198.pct) === JSON.stringify([10, null, -5, 20]), JSON.stringify(full198.pct));
  check('روز بی‌داده در مسیر هم بی‌داده می‌ماند', full198.pct[1] === null);
  check('شمار روزهای دیده‌شده و ندیده جدا گزارش می‌شود',
    full198.observed === 3 && full198.missing === 1);

  // ── تغییر نسبت به آخرین مشاهده، نه نسبت به خانهٔ تقویم ─────────────
  check('تغییر روز، از آخرین مشاهده گرفته می‌شود نه از خانهٔ قبلی',
    full198.stepPct[2] === -15, JSON.stringify(full198.stepPct));
  check('نخستین مشاهده، تغییرش خودِ بازده تجمعی است', full198.stepPct[0] === 10);
  check('خانهٔ بی‌داده تغییر صفر جعل نمی‌کند', full198.stepPct[1] === null);

  // ── افت مسیر ────────────────────────────────────────────────────────
  check('بیشترین افت، فاصلهٔ سقف تا کف بعدی است', full198.maxDrawdownPct === -15);
  check('افت جاری هر روز جداگانه ثبت می‌شود',
    JSON.stringify(full198.ddPct) === JSON.stringify([0, null, -15, 0]), JSON.stringify(full198.ddPct));
  const sinking198 = comboSeries(row198, [-30, -60], [0, 1], 'gross');
  check('موقعیتی که از روز اول زیر آب می‌رود، افتش از صفر شمرده می‌شود',
    sinking198.maxDrawdownPct === -6, String(sinking198.maxDrawdownPct));

  // ── پنجرهٔ باریک ────────────────────────────────────────────────────
  const window198 = comboSeries(row198, pnl198, [2, 3], 'gross');
  check('بازده تجمعی با باریک‌شدن پنجره از نو شروع نمی‌شود',
    window198.pct[0] === -5 && window198.finalPct === 20, JSON.stringify(window198.pct));
  check('تغییر خالص داخل پنجره جداگانه گزارش می‌شود', window198.windowPct === 25);
  check('سقف افت در پنجرهٔ میانی، نخستین مشاهدهٔ همان پنجره است',
    window198.maxDrawdownPct === 0, String(window198.maxDrawdownPct));

  // ── سقف و کف و نخستین سود ──────────────────────────────────────────
  check('بهترین و بدترین نقطهٔ مسیر با اندیسشان می‌آیند',
    full198.bestPct === 20 && full198.bestIndex === 3 && full198.worstPct === -5 && full198.worstIndex === 2);
  check('نخستین روز سبز، اندیسش ثبت می‌شود', full198.firstProfitIndex === 0);
  check('مسیری که هیچ‌وقت سبز نشود، اندیس سود ندارد',
    comboSeries(row198, [-10, -20], [0, 1], 'gross').firstProfitIndex === null);
  check('پایان مسیر، آخرین مشاهده است نه آخرین خانه',
    comboSeries(row198, [100, null], [0, 1], 'gross').finalIndex === 0);

  // ── مبنا واقعاً عوض می‌شود ──────────────────────────────────────────
  check('همان مسیر روی ارزش اسمی، عدد کوچک‌تری می‌دهد',
    near(comboSeries(row198, pnl198, [0, 1, 2, 3], 'notional').finalPct, 4, 1e-9));
  check('برچسب مبنا همراه مسیر می‌آید', full198.basisLabel === 'سرمایهٔ درگیر ناخالص');
  check('مخرج به‌کاررفته گزارش می‌شود', full198.denominator === 1000);

  // ── مخرج نامعلوم ────────────────────────────────────────────────────
  const blind198 = comboSeries({ entry: { marginGross: null, netCash: null } }, pnl198, [0, 1, 2, 3], 'gross');
  check('مخرج نامعلوم، کل مسیر را نامعلوم می‌کند نه صفر',
    blind198.ok === false && blind198.pct.every((value) => value === null));
  check('سود ریالی حتی بدون مخرج، حفظ می‌شود',
    JSON.stringify(blind198.pnl) === JSON.stringify([100, null, -50, 200]));
  check('دلیل نامعلومی مخرج همراه مسیر می‌آید', blind198.why.length > 0);
  check('مسیر بی‌مخرج، افت و سقف نمی‌سازد',
    blind198.maxDrawdownPct === null && blind198.bestPct === null);

  // ── پرچم عبور از مبنا ───────────────────────────────────────────────
  check('عبور زیانِ مسیر از مبنا پرچم می‌خورد',
    comboSeries(row198, [-1200], [0], 'gross').beyondBasis === true);
  check('مسیر سالم پرچم نمی‌خورد', full198.beyondBasis === false);

  // ── وزن ترکیب ───────────────────────────────────────────────────────
  check('وزن از ارزش معاملهٔ کامل ساخته می‌شود',
    comboWeight({ entry: { legValue: 500, legValueComplete: true } }) === 500);
  check('ارزش ناقص، وزن نمی‌سازد',
    comboWeight({ entry: { legValue: 500, legValueComplete: false } }) === null);
  check('ارزش صفر، وزن نمی‌سازد',
    comboWeight({ entry: { legValue: 0, legValueComplete: true } }) === null);
  check('ردیف بدون ورود، وزن نمی‌سازد', comboWeight({}) === null);
  for (const [label, value] of [['null', null], ['رشتهٔ خالی', ''], ['بولین', true]]) {
    check(`ارزش ${label} وزن یک نمی‌سازد`,
      comboWeight({ entry: { legValue: value, legValueComplete: true } }) === null, label);
  }
}
