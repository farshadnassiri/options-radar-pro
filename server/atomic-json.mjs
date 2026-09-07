// نوشتنِ اتمیکِ JSON — خواننده یا نسخهٔ کامل قبلی را می‌بیند یا نسخهٔ کامل تازه.
//
// ═══ ایرادی که این ماژول برای آن ساخته شد ═══
//
// گزارش بازآزماییِ ۱۴۰۵/۰۶/۱۶:
//
//   «دفتر قراردادها خوانده نشد: Unterminated string in JSON at position
//    1460575 … فایل چند لحظه بعد JSON معتبر بود؛ بنابراین خواننده احتمالاً
//    فایل را وسط نوشتن دیده است.»
//
// تشخیص درست بود. `fs.writeFile` روی مسیرِ موجود، اول **کوتاه می‌کند** بعد
// می‌نویسد؛ برای پروندهٔ چندمگابایتی این کار چند بار به صف I/O می‌رود و در
// فاصله‌اش هر خواننده‌ای نیمهٔ فایل را می‌بیند. نه قفلی هست نه نشانه‌ای — و
// خطایش «JSON خراب» است، که خواننده را به این نتیجه می‌رساند که **داده**
// خراب است، نه اینکه لحظهٔ خواندن بد بوده.
//
// راهِ استاندارد: نوشتن در پروندهٔ موقتِ **همان پوشه**، بعد `rename`. تغییرِ
// نام روی یک حجم، اتمیک است: خواننده یا اینود قبلی را می‌بیند یا تازه را،
// هیچ‌وقت نیمه‌کاره را. همان پوشه لازم است چون `rename` بین دو حجم اتمیک
// نیست (و اصلاً کار نمی‌کند).
//
// نامِ موقت شامل شناسهٔ فرایند و یک شمارنده است تا دو نویسندهٔ هم‌زمان روی
// یک پروندهٔ موقت ننشینند.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

let seq = 0;
const tempFor = (file) => path.join(
  path.dirname(file),
  `.${path.basename(file)}.${process.pid}.${(seq += 1)}.tmp`,
);

/** نسخهٔ همگام — برای ابزارهای خط فرمان. */
export function writeJsonAtomicSync(file, value, { space = 0 } = {}) {
  const temp = tempFor(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, space), 'utf8');
    fs.renameSync(temp, file);
  } catch (e) {
    // پروندهٔ موقتِ جامانده، دفعهٔ بعد سرِ راه است. شکستِ پاک‌کردن خودش
    // خطا نیست و نباید خطای اصلی را بپوشاند.
    try { fs.unlinkSync(temp); } catch { /* نبود، یا دستمان نرسید */ }
    throw e;
  }
  return file;
}

/** نسخهٔ ناهمگام — برای سرور. */
export async function writeJsonAtomic(file, value, { space = 0 } = {}) {
  const temp = tempFor(file);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  try {
    await fsp.writeFile(temp, JSON.stringify(value, null, space), 'utf8');
    await fsp.rename(temp, file);
  } catch (e) {
    try { await fsp.unlink(temp); } catch { /* نبود، یا دستمان نرسید */ }
    throw e;
  }
  return file;
}
