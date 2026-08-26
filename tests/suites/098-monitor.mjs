// ۹۷. یونانی پیش و پس از رول
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { monitorSnapshot } from '../../core/monitor.mjs';


// ═══════════════════ ۹۷. یونانی پیش و پس از رول ═══════════════════
group('۹۷. یونانی پیش و پس از رول');
{
  const src97 = readSrc('../ui/tabs/roll.mjs');
  check('تحلیل رول یونانی دو طرف را از همان لایهٔ مشترک می‌گیرد',
    src97.includes("from '/core/monitor.mjs'") && src97.includes('monitorSnapshot(legs,')
    && src97.includes('r.nextLegs'));
  check('جدول «پیش و پس از رول» ستون تغییر دارد',
    src97.includes("id=\"roll-greeks\"") && src97.includes('const change = Number.isFinite(before) && Number.isFinite(after) ? after - before : NaN;'));
  // نامزد رول هنوز موقعیت نیست و تاریخی روی آن ننشسته، پس روز مانده از خودِ
  // پا می‌آید نه از سررسیدِ ذخیره‌شده.
  check('روز مانده نامزد رول از خودِ پا می‌آید، نه از تاریخِ نداشته',
    src97.includes("days: legs.map((l) => (l.kind === 'underlying' ? undefined : Number(l.days)))"));
  check('ناقص بودن یک طرف، صریح گفته می‌شود نه با عدد پر می‌شود',
    src97.includes('curGreeks.incomplete || nextGreeks.incomplete'));
}
