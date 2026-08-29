// ۱۹۷. آماره‌های انتخابی و وزن‌دهی بر ارزش معامله

import { check, group, near } from '../harness.mjs';
import {
  DEFAULT_STATISTIC, DEFAULT_WEIGHTING, STATISTICS, WEIGHTINGS,
  meanOf, medianOf, normalizeStatistic, normalizeWeighting, statOf, statisticMeta, weightingMeta,
} from '../../core/portfolio-stats.mjs';

group('۱۹۷. آماره و وزن');
{
  const even197 = [1, 2, 3, 4].map((value) => ({ value, weight: 1 }));
  check('میانه روی نمونهٔ زوج، میانگین دو وسط است', statOf(even197, 'median').value === 2.5);
  check('میانگین همان میانگین حسابی است', statOf(even197, 'mean').value === 2.5);
  check('کمترین، کوچک‌ترین نمونه است', statOf(even197, 'min').value === 1);
  check('بیشترین، بزرگ‌ترین نمونه است', statOf(even197, 'max').value === 4);
  check('چارک پایین بین دو نمونهٔ اول می‌افتد', statOf(even197, 'p25').value === 1.5);
  check('چارک بالا بین دو نمونهٔ آخر می‌افتد', statOf(even197, 'p75').value === 3.5);
  check('میانهٔ نمونهٔ فرد، خود عنصر وسط است',
    statOf([3, 1, 2].map((value) => ({ value, weight: 1 })), 'median').value === 2);
  check('تک‌نمونه، خودش همهٔ آماره‌هاست',
    statOf([{ value: 7, weight: 1 }], 'p25').value === 7 && statOf([{ value: 7, weight: 1 }], 'max').value === 7);

  // ── وزن‌دهی واقعاً وزن می‌دهد ───────────────────────────────────────
  // این ادعا هستهٔ بند «وزن‌دهی بر ارزش معامله» است: اگر عدد وزن‌دار با عدد
  // هم‌وزن یکی دربیاید، قابلیت فقط ظاهر دارد.
  const skew197 = [{ value: 10, weight: 9 }, { value: 0, weight: 1 }];
  check('میانگین وزن‌دار به‌سمت نمونهٔ سنگین می‌رود',
    statOf(skew197, 'mean', 'value').value === 9, String(statOf(skew197, 'mean', 'value').value));
  check('میانهٔ وزن‌دار هم به نمونهٔ سنگین می‌چسبد',
    statOf(skew197, 'median', 'value').value === 9, String(statOf(skew197, 'median', 'value').value));
  check('همان نمونه‌ها هم‌وزن، عدد دیگری می‌دهند',
    statOf(skew197, 'mean').value === 5 && statOf(skew197, 'median').value === 5);
  check('کمترین و بیشترین از وزن اثر نمی‌گیرند',
    statOf(skew197, 'min', 'value').value === 0 && statOf(skew197, 'max', 'value').value === 10);

  // ── وزن نامعتبر، بی‌صدا هم‌وزن نمی‌شود ─────────────────────────────
  const noWeight197 = statOf([{ value: 10, weight: null }, { value: 20, weight: 0 }], 'median', 'value');
  check('نبود وزن معتبر، آماره را نامعلوم می‌کند نه هم‌وزن',
    noWeight197.value === null && noWeight197.samples === 0, JSON.stringify(noWeight197));
  check('دلیل نبود وزن گفته می‌شود', noWeight197.why.includes('ارزش معامله'), noWeight197.why);
  check('همان نمونه‌ها در حالت هم‌وزن شمرده می‌شوند',
    statOf([{ value: 10, weight: null }, { value: 20, weight: 0 }], 'median').value === 15);
  check('نمونهٔ بی‌وزن در حالت وزنی کنار می‌رود، نه با وزن یک',
    statOf([{ value: 100, weight: null }, { value: 0, weight: 5 }], 'mean', 'value').value === 0);

  // ── نمونهٔ نامعتبر شمرده نمی‌شود ولی شمارشش گزارش می‌شود ───────────
  const holed197 = statOf([{ value: null, weight: 1 }, { value: 4, weight: 1 }, { value: '', weight: 1 }], 'mean');
  check('نمونهٔ نامعلوم در میانگین صفر نمی‌شود', holed197.value === 4, String(holed197.value));
  check('شمار نمونه‌های کنارگذاشته گزارش می‌شود',
    holed197.samples === 1 && holed197.skipped === 2, JSON.stringify(holed197));
  check('بولین نمونه شمرده نمی‌شود', statOf([{ value: true, weight: 1 }], 'mean').samples === 0);
  check('نمونهٔ صفر، مشاهده است و شمرده می‌شود',
    statOf([{ value: 0, weight: 1 }], 'mean').samples === 1);
  check('فهرست خالی، آماره نمی‌سازد', statOf([], 'mean').value === null);
  check('ورودی نامعتبر، آماره نمی‌سازد', statOf(null, 'mean').value === null);

  // ── کمکی‌های ساده ──────────────────────────────────────────────────
  check('میانهٔ ساده null را کنار می‌گذارد', medianOf([1, null, 3]) === 2);
  check('میانگین ساده null را کنار می‌گذارد', near(meanOf([1, null, 4]), 2.5, 1e-9));
  check('میانهٔ فهرست تهی، نامعلوم است', medianOf([]) === null && meanOf([]) === null);

  // ── قرارداد ماژول ──────────────────────────────────────────────────
  check('پیش‌فرض آماره میانه است', DEFAULT_STATISTIC === 'median');
  check('پیش‌فرض وزن‌دهی هم‌وزن است', DEFAULT_WEIGHTING === 'equal');
  check('شش آماره با برچسب و توضیح تعریف شده',
    STATISTICS.length === 6 && STATISTICS.every((row) => row.id && row.label && row.hint));
  check('دو حالت وزن‌دهی با توضیح تعریف شده',
    WEIGHTINGS.length === 2 && WEIGHTINGS.every((row) => row.id && row.label && row.hint));
  check('آمارهٔ نامعتبر به میانه برمی‌گردد', normalizeStatistic('چرند') === 'median');
  check('وزن‌دهی نامعتبر به هم‌وزن برمی‌گردد', normalizeWeighting('چرند') === 'equal');
  check('برچسب آماره و وزن از خود ماژول می‌آید',
    statisticMeta('p75').label === 'چارک بالا' && weightingMeta('value').label === 'وزن ارزش معامله');
  check('خروجی، آماره و وزنِ به‌کاررفته را با خودش می‌برد',
    statOf(even197, 'p75', 'value').statistic === 'p75' && statOf(even197, 'p75', 'value').weighting === 'value');
}
