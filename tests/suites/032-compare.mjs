// ۳۱. مقایسه با موقعیت‌های دیگر هم‌نماد روی نمودار بازده
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  MAX_COMPARE, compareFullLabel, compareLabel, sameUnderlyingCandidates,
} from '../../ui/compare.mjs';


// ═══ ۳۱. مقایسه با موقعیت‌های دیگر هم‌نماد (قلم الف-۱ بک‌لاگ) ═══
group('۳۱. مقایسه با موقعیت‌های دیگر هم‌نماد روی نمودار بازده');
{
  // ——— انتخاب نامزد: فقط هم‌نماد، به‌جز ردیف خودش، سقف ده‌تا ———
  const rows31 = [
    { id: 'a', underlying: 'خودرو', legsText: 'خرید کال ۱۰۰۰', strategy: 'اسپرد' },
    { id: 'b', underlying: 'خودرو', legsText: 'فروش پوت ۹۰۰', strategy: 'کاورد' },
    { id: 'c', underlying: 'فولاد', legsText: 'خرید کال ۲۰۰۰', strategy: 'اسپرد' },
  ];
  const cands31 = sameUnderlyingCandidates(rows31, rows31[0]);
  check('فقط هم‌نمادها می‌آیند، به‌جز خود ردیف',
    cands31.length === 1 && cands31[0].id === 'b', cands31.map((c) => c.id).join(','));
  check('بدون ردیف انتخاب‌شده، فهرست خالی است', sameUnderlyingCandidates(rows31, null).length === 0);

  const many31 = Array.from({ length: 15 }, (_, i) => ({ id: `x${i}`, underlying: 'خودرو', legsText: `ترکیب ${i}` }));
  check('فهرست نامزدها سقف ده‌تا دارد', sameUnderlyingCandidates([rows31[0], ...many31], rows31[0]).length === 10);

  // ——— برچسب کوتاه ———
  check('برچسب کوتاه دست‌نخورده می‌ماند', compareLabel({ legsText: 'کوتاه' }) === 'کوتاه');
  const longLabel = compareLabel({ strategy: 'استراتژی خیلی طولانی', legsText: 'خرید کال ۱۰۰۰۰ و فروش کال ۲۰۰۰۰ و بازهم بیشتر' });
  check('برچسب بلند با سه‌نقطه بریده می‌شود', longLabel.length === 22 && longLabel.endsWith('…'), longLabel);
  check('سقف مقایسه هم‌زمان ۴ است', MAX_COMPARE === 4);

  // ——— برچسب کامل، برای tooltip روی legend نمودار (دور ۱۸ پ-۶) ———
  const rowLong31 = { strategy: 'استراتژی خیلی طولانی', legsText: 'خرید کال ۱۰۰۰۰ و فروش کال ۲۰۰۰۰ و بازهم بیشتر' };
  check('برچسب کامل هرگز بریده نمی‌شود',
    compareFullLabel(rowLong31) === 'استراتژی خیلی طولانی — خرید کال ۱۰۰۰۰ و فروش کال ۲۰۰۰۰ و بازهم بیشتر');
  check('برچسب کامل با شروع برچسب کوتاه یکی است',
    compareFullLabel(rowLong31).startsWith(compareLabel(rowLong31).slice(0, -1)));
  const rowShort31 = { legsText: 'کوتاه' };
  check('برچسب کوتاه و کامل برای متن کوتاه یکسانند', compareFullLabel(rowShort31) === compareLabel(rowShort31));

  // منحنی و legend مقایسه‌ای خودشان در chart.mjs رسم می‌شوند (وارد کردن مطلق
  // `/core/...` دارد، پس در Node قابل import نیست) — رسم واقعی با Playwright
  // در پنل جزئیات تب استراتژی/برترین موقعیت‌ها تأیید می‌شود، نه اینجا.
}
