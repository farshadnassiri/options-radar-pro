// ۲۴. عقب‌نشینی حلقه دیده‌بان
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { watchBackoffSec } from '../../server/backoff.mjs';


// ═══════════════ ۲۴. عقب‌نشینی حلقه دیده‌بان ═══════════════
group('۲۴. عقب‌نشینی حلقه دیده‌بان');
{
  check('بدون شکست، فاصله عادی', watchBackoffSec(5, 0) === 5);
  check('شکست منفی هم مثل صفر رفتار می‌کند', watchBackoffSec(5, -1) === 5);
  check('یک شکست، دو برابر', watchBackoffSec(5, 1) === 10);
  check('دو شکست، چهار برابر', watchBackoffSec(5, 2) === 20);
  check('رشد نمایی ادامه دارد', watchBackoffSec(5, 4) === 80);
  check('به سقف که رسید، فراتر نمی‌رود', watchBackoffSec(5, 10, 300) === 300,
        watchBackoffSec(5, 10, 300));
  check('سقف قابل تنظیم است', watchBackoffSec(5, 10, 60) === 60);
  check('فاصله عادی هم از سقف رد نمی‌شود', watchBackoffSec(500, 0, 300) === 500,
        'فاصله پایه دست کاربر است، سقف فقط رشد نمایی را می‌بندد');
}
