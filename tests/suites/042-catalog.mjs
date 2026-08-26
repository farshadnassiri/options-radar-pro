// ۴۱. مبنای محاسبه از تنظیمات
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { bsGreeks } from '../../core/bs.mjs';
import { evaluate } from '../../core/evaluate.mjs';
import { coverage } from '../../core/margin.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


// ═══════════ ۴۱. مبنای محاسبه از تنظیمات می‌آید، نه از عدد سخت‌کد ═══════════
//
// پیش از این، «۳۶۵ روز سال»، «۳۰ روز ماه»، «۱۰۰۰ سهم قرارداد» و «۷ روز
// آستانه سررسید نزدیک» در دل موتور نوشته شده بودند. هیچ‌کدام ابدی نیستند:
// اندازه قرارداد با افزایش سرمایه تعدیل می‌شود و مبنای روزشماری انتخاب است.
// این آزمون‌ها می‌سنجند که عوض‌کردن عدد در تنظیمات، واقعاً خروجی را عوض کند
// — وگرنه کنترل تنظیمات هست ولی کار نمی‌کند، که از نبودنش بدتر است.
group('۴۱. مبنای محاسبه از تنظیمات');
{
  const size = 1000;
  const mk = (bid, ask) => ({
    bid, bidQty: 500, ask, askQty: 500, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    book: [{ level: 1, bid, bidQty: 500, ask, askQty: 500 }],
  });
  const def = byId('covered-call');
  const run = (over, days = 30) => {
    const s = { ...defaults(), ...over };
    const legs = buildLegs(def, { strikes: [110000], size: s.contractSize, days: [days] });
    return evaluate({
      legs, quotes: [mk(99000, 100000), mk(4800, 5200)],
      ctx: {
        S: 100000, Sclose: 100000, days, size: s.contractSize, qty: 1,
        settings: s, def, underlying: 'نمونه', sigmaHist: 0.6,
      },
    });
  };

  const base = run({});

  // ——— روز سال ———
  // بازده سالانه ساده خطی است: نصف‌کردن روزهای سال باید دقیقاً نصفش کند.
  const halfYear = run({ dayCountYear: 182.5 });
  check('روز سال، بازده سالانه را مقیاس می‌زند',
    near(halfYear.retAnnPct, base.retAnnPct / 2, 1e-9),
    `${base.retAnnPct.toFixed(3)} → ${halfYear.retAnnPct.toFixed(3)}`);
  check('بازده دوره به روز سال وابسته نیست',
    near(halfYear.retMaxPct, base.retMaxPct, 1e-12));
  // تتا دو بار به روز سال وابسته است: یک بار در T و یک بار در تبدیل
  // سالانه به روزانه. پس نسبتش ساده نیست و اینجا فقط «اثر داشتن» سنجیده
  // می‌شود؛ خودِ تبدیل روزانه، جدا و ایزوله در آزمون بعدی می‌آید.
  check('تتای روزانه به روز سال وابسته است',
    Number.isFinite(halfYear.theta) && !near(halfYear.theta, base.theta, 1e-9),
    `${base.theta.toFixed(2)} → ${halfYear.theta.toFixed(2)}`);

  // تبدیل تتای سالانه به روزانه، با T ثابت: نصف‌کردن روز سال باید دقیقاً
  // دو برابرش کند. اینجا هیچ متغیر دیگری تکان نمی‌خورد.
  const gA = bsGreeks('call', 100000, 110000, 30 / 365, 0.3, 0, 0.6);
  const gB = bsGreeks('call', 100000, 110000, 30 / 365, 0.3, 0, 0.6, 182.5);
  check('تبدیل تتای سالانه به روزانه با روز سال مقیاس می‌خورد',
    near(gB.theta, gA.theta * 2, 1e-9),
    `${gA.theta.toFixed(2)} → ${gB.theta.toFixed(2)}`);

  // ——— روز ماه ———
  const month15 = run({ daysPerMonth: 15 });
  check('روز ماه، بازده ماهانه را مقیاس می‌زند',
    near(month15.retMonthPct, base.retMonthPct / 2, 1e-9),
    `${base.retMonthPct.toFixed(3)} → ${month15.retMonthPct.toFixed(3)}`);

  // ——— اندازه قرارداد ———
  // کاوردکال یعنی «سهم پایه در برابر یک کال». اگر قرارداد روی ۲۰۰۰ سهم
  // بسته شود، پوشش هم باید دو برابر سهم بخواهد؛ پس دلتای موقعیت دو برابر
  // می‌شود و پوشش همچنان کامل می‌ماند.
  const big = run({ contractSize: 2000 });
  check('اندازه قرارداد، دلتای موقعیت را مقیاس می‌زند',
    near(big.delta, base.delta * 2, 1e-6),
    `${base.delta.toFixed(1)} → ${big.delta.toFixed(1)}`);
  check('پوشش کاوردکال با اندازه بزرگ‌تر هم کامل می‌ماند',
    big.coverage === 'full' && big.margin === 0, big.coverage);

  // ——— آستانه سررسید نزدیک ———
  const near5 = run({ shortDteDays: 5 }, 6);
  const near9 = run({ shortDteDays: 9 }, 6);
  check('آستانه سررسید نزدیک از تنظیمات خوانده می‌شود',
    near5.shortDte === false && near9.shortDte === true,
    `۵ روز → ${near5.shortDte} | ۹ روز → ${near9.shortDte}`);
  check('هشدار سررسید نزدیک با همان آستانه ظاهر می‌شود',
    !near5.warn.includes('سررسید نزدیک') && near9.warn.includes('سررسید نزدیک'));

  // ——— هیچ عدد تقویمی سخت‌کدی در موتور نماند ———
  const engineFiles = ['core/evaluate.mjs', 'core/exec.mjs', 'core/mixed.mjs', 'core/timemachine.mjs'];
  const leftovers = engineFiles.filter((f) =>
    /\/\s*365\b/.test(readSrc(`../${f}`)));
  check('هیچ تقسیم بر ۳۶۵ سخت‌کدی در موتور نمانده', leftovers.length === 0, leftovers.join('، '));
}
