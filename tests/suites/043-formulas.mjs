// ۴۲. مرجع فرمول‌ها
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  FORMULAS, FORMULA_GROUPS, STRATEGY_FORMULAS, SYMBOLS, referencedKeys, strategyFormula,
} from '../../core/formulas.mjs';
import { SCHEMA } from '../../core/settings.mjs';
import { CATALOG } from '../../strategies/catalog.mjs';


// ═══════════ ۴۲. مرجع فرمول‌ها از کد عقب نمی‌افتد ═══════════
//
// توضیحِ عقب‌افتاده از نبودِ توضیح بدتر است: کاربر رویش حساب می‌کند و
// نمی‌داند دیگر درست نیست. این آزمون‌ها همان چیزی را می‌بندند که در عمل
// می‌شکند — استراتژی تازه‌ای اضافه شود و کارتش نوشته نشود، یا کلید
// تنظیماتی نامش عوض شود و ارجاع فرمول به هوا اشاره کند.
group('۴۲. مرجع فرمول‌ها');
{
  const schemaKeys = new Set(SCHEMA.map((f) => f.key));

  const dangling = referencedKeys().filter((k) => !schemaKeys.has(k));
  check('هر کلید تنظیمات که فرمول‌ها نام می‌برند، در SCHEMA هست',
    dangling.length === 0, dangling.join('، '));

  const badGroup = FORMULAS.filter((f) => !FORMULA_GROUPS[f.group]).map((f) => f.id);
  check('هر کارت فرمول به گروه موجود اشاره می‌کند', badGroup.length === 0, badGroup.join('، '));

  const ids = FORMULAS.map((f) => f.id);
  check('شناسه کارت فرمول تکراری نیست', new Set(ids).size === ids.length);
  check('هر کارت فرمول دست‌کم یک رابطه دارد',
    FORMULAS.every((f) => Array.isArray(f.lines) && f.lines.length > 0));
  check('هر کارت فرمول عنوان دارد', FORMULAS.every((f) => !!f.title));

  const catalogIds = CATALOG.map((d) => d.id);
  const uncovered = catalogIds.filter((id) => !strategyFormula(id));
  check('هر استراتژی فهرست، کارت فرمول دارد', uncovered.length === 0, uncovered.join('، '));

  const orphan = Object.keys(STRATEGY_FORMULAS).filter((id) => !catalogIds.includes(id));
  check('هیچ کارت فرمولی بدون استراتژی نمانده', orphan.length === 0, orphan.join('، '));

  const shapeBad = catalogIds.filter((id) => {
    const c = strategyFormula(id);
    return !c.capital || !Array.isArray(c.rows) || c.rows.length < 4 || !c.watch;
  });
  check('هر کارت استراتژی سرمایه، دست‌کم چهار ردیف، و هشدار دارد',
    shapeBad.length === 0, shapeBad.slice(0, 3).join('، '));

  // چهار ردیفی که در هر استراتژی باید جواب داشته باشند — همان چهار عددی که
  // کاربر پیش از ورود به موقعیت می‌پرسد.
  const NEED = ['بیشترین سود', 'بیشترین زیان', 'سربه‌سری', 'وجه تضمین'];
  const missingRow = catalogIds.filter((id) => {
    const labels = strategyFormula(id).rows.map((r) => r[0]);
    return NEED.some((n) => !labels.includes(n));
  });
  check('هر کارت استراتژی هر چهار ردیف پایه را دارد',
    missingRow.length === 0, missingRow.slice(0, 3).join('، '));

  // خواستهٔ صریح: کاوردکال باید نرخ و درصدش کامل توضیح داده شده باشد.
  const cc = strategyFormula('covered-call');
  check('کاوردکال گام‌به‌گام توضیح داده شده',
    Array.isArray(cc.walkthrough) && cc.walkthrough.length >= 5, `${cc.walkthrough?.length} گام`);
  const ccLabels = cc.rows.map((r) => r[0]);
  check('هر دو نرخ کاوردکال نام برده شده‌اند',
    ccLabels.includes('بازده ایستا') && ccLabels.includes('بازده اگر اعمال شود'),
    ccLabels.join(' | '));

  check('نمادهای مشترک تعریف شده‌اند', SYMBOLS.length >= 5);

  // رقم لاتین در متن توضیح، همان ایراد قاعده ۲-۳ است.
  const latin = [];
  for (const f of FORMULAS) {
    for (const t of [f.title, f.note || '', ...f.lines]) if (/[0-9]/.test(t)) latin.push(f.id);
  }
  check('متن فرمول‌ها رقم لاتین ندارد', latin.length === 0, [...new Set(latin)].slice(0, 3).join('، '));
}
