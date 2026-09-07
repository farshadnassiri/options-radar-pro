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

// ═══ ویندوز: `rename` روی پروندهٔ **باز** رد می‌شود ═══
//
// job ویندوزِ CI همین را گرفت، و درست هم گرفت:
//
//   EPERM: operation not permitted, rename '….option-roster.json.8232.2.tmp'
//   -> '…\option-roster.json'
//
// در POSIX تغییرِ نام روی پرونده‌ای که خواننده بازش کرده مشکلی ندارد؛ خواننده
// اینودِ قدیمی را تا آخر می‌خواند. در ویندوز `MoveFileEx` وقتی مقصد بازِ
// کسِ دیگری است — و `fs.readFile` بدون `FILE_SHARE_DELETE` بازش می‌کند —
// با EPERM برمی‌گردد.
//
// این «نوشتنِ اتمیک را کنار بگذار» معنی نمی‌دهد: هدف همچنان درست است و
// پنجرهٔ تصادم چند ده میکروثانیه است. پس چند بار با فاصلهٔ کوتاه دوباره
// امتحان می‌شود. بودجه‌اش کوچک و کراندار است تا خطای واقعیِ دسترسی زیرش
// پنهان نماند: اگر بعد از همهٔ تلاش‌ها هم نشد، **همان خطای اصلی** بالا
// می‌رود.
export const RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
export const RETRY_DELAYS_MS = [1, 2, 4, 8, 16, 32, 32, 64, 64, 100];

/** آیا این خطا «مقصد همین حالا دستِ کسی است» را می‌گوید. */
export const isLockError = (e) => RETRY_CODES.has(e?.code);

const sleepSync = (ms) => {
  // بدون وابستگی و بدون چرخهٔ سوزان: قفلی که هیچ‌وقت باز نمی‌شود.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * حلقهٔ تلاشِ دوباره، جدا از خودِ نوشتن.
 *
 * `move` تزریق‌شدنی است تا این منطق **بدون ویندوز** هم سنجیده شود. کدی که
 * فقط روی یک سکو اجرا می‌شود و فقط آنجا آزمون دارد، عملاً بی‌آزمون است — و
 * همین بار هم CI ویندوز چیزی را گرفت که دروازهٔ لینوکسی نمی‌دید.
 */
export async function retryRename(move, { sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => { setTimeout(r, ms); }));
  for (let at = 0; ; at += 1) {
    try { return await move(); }
    catch (e) {
      if (!isLockError(e) || at >= RETRY_DELAYS_MS.length) throw e;
      await wait(RETRY_DELAYS_MS[at]);
    }
  }
}

/** همان حلقه، همگام. */
export function retryRenameSync(move, { sleep = sleepSync } = {}) {
  for (let at = 0; ; at += 1) {
    try { return move(); }
    catch (e) {
      if (!isLockError(e) || at >= RETRY_DELAYS_MS.length) throw e;
      sleep(RETRY_DELAYS_MS[at]);
    }
  }
}

/** نسخهٔ همگام — برای ابزارهای خط فرمان. */
export function writeJsonAtomicSync(file, value, { space = 0 } = {}) {
  const temp = tempFor(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, space), 'utf8');
    retryRenameSync(() => fs.renameSync(temp, file));
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
    await retryRename(() => fsp.rename(temp, file));
  } catch (e) {
    try { await fsp.unlink(temp); } catch { /* نبود، یا دستمان نرسید */ }
    throw e;
  }
  return file;
}
