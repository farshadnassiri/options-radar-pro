// ۳۵. نوار ثابت مشخصات موقعیت
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { replayTradeDetail } from '../../core/history.mjs';


// ═══════════════════════════ ۳۵. نوار ثابت مشخصات موقعیت ═══════════════════════════
group('۳۵. نوار ثابت مشخصات موقعیت');
{
  const historySource35 = readSrc('../ui/tabs/history.mjs');
  const styleSource35 = readSrc('../ui/style.css');
  // کشیدن جعبه، جای آن را از دست کاربر می‌گرفت: تا «بازنشانی جایگاه» را
  // نمی‌زد، جعبه همان‌جا که رها شده بود می‌ماند — حتی روی محتوای مهم.
  check('کد کشیدن جعبه مشخصات به‌کلی برداشته شده است',
    !/frozenDrag|beginFrozenDrag|data-frozen-drag|resetFrozenPosition/.test(historySource35)
    && !/data-detached|frozen-drag-handle/.test(styleSource35));
  // نوار باید اولین فرزند تب باشد، نه داخل بخش نتایج؛ وگرنه پیش از اجرای
  // تحلیل اصلاً وجود ندارد و «بالای صفحه» نیست.
  const frozenAt35 = historySource35.indexOf('id="h-frozen-strategy"');
  check('نوار مشخصات بالای تب می‌نشیند، نه داخل بخش نتایج',
    frozenAt35 > 0 && frozenAt35 < historySource35.indexOf('class="history-hero"'));
  check('نوار مشخصات با پیمایش صفحه ثابت می‌ماند',
    /\.history-frozen \{[^}]*position: sticky;[^}]*top: 0;/.test(styleSource35));
  // «بقیه اطلاعات کامل» یعنی هر دو تاریخ و مبناها و سرمایه و نتیجه، نه فقط
  // نام استراتژی — همان چیزی که تا دیروز باید در جدول پایین دنبالش می‌گشتی.
  // فهرست را از خودِ سازنده نوار بیرون می‌کشیم، نه از کل فایل — همین برچسب‌ها
  // در خروجی CSV ماتریس هم هستند و بررسی سراسری، حذفشان از نوار را نمی‌دید.
  const factsBlock35 = historySource35.slice(
    historySource35.indexOf('function renderFrozenStrategy('),
    historySource35.indexOf('function toggleFrozenFold('));
  for (const fact of ['تاریخ ورود', 'تاریخ خروج', 'مدت نگهداری', 'مبنای ورود / خروج', 'سرمایه درگیر', 'نتیجه پایان']) {
    check(`نوار مشخصات «${fact}» را درج می‌کند`, factsBlock35.includes(`['${fact}',`));
  }
  // کلیک روی هر خانه ماتریس یک موقعیت دیگر است — ورود و خروج دیگر روی همان
  // پاها. اگر نوار به‌روز نشود، مشخصات موقعیتِ چند کلیک قبل را نشان می‌دهد.
  check('کلیک روی خانه ماتریس نوار مشخصات را با همان ورود و خروج پر می‌کند',
    /const detail = replayTradeDetail\(args, entryDate, exitDate\);[\s\S]{0,700}?renderFrozenStrategy\(detail\.replay, args,/.test(historySource35));
}
