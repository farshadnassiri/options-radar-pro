// دفتر خطای سمت مرورگر.
//
// نیمی از خرابی‌ها در مرورگر می‌افتند و هیچ‌وقت به سرور نمی‌رسند: یک استثنای
// رسم‌نشده، یک وعدهٔ ردشده، یک درخواست ۵۰۲. کنسول مرورگر آن‌ها را دارد ولی
// کسی که برنامه را استفاده می‌کند کنسول باز نمی‌کند.
//
// پس اینجا گرفته می‌شوند، در حافظه می‌مانند، و به همان دفتر سرور فرستاده
// می‌شوند تا یک دفتر واحد باشد نه دو تا. فرستادن دسته‌ای است، وگرنه یک
// خطای تکرارشونده خودش می‌شود منبع بار.

const LOCAL_CAP = 200;
const rows = [];
let seq = 0;
let pending = [];
let timer = null;
const subs = new Set();

const push = (level, where, message, detail = '') => {
  const row = { seq: ++seq, at: Date.now(), level, where, message: String(message).slice(0, 500), detail: String(detail).slice(0, 2000) };
  rows.push(row);
  while (rows.length > LOCAL_CAP) rows.shift();
  pending.push(row);
  schedule();
  for (const fn of subs) { try { fn(row); } catch { /* شنونده نباید ثبت را بشکند */ } }
  return row;
};

/**
 * ارسال دسته‌ای به سرور.
 *
 * تأخیر عمدی است: یک حلقهٔ خراب می‌تواند در ثانیه ده‌ها خطا بسازد و ارسال
 * تک‌تک، خودش شبکه را می‌بندد. و اگر ارسال شکست خورد، دوباره تلاش نمی‌شود —
 * خطای «ارسال خطا»، بی‌نهایت خطای تازه می‌سازد.
 */
function schedule() {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const batch = pending.splice(0, 50);
    if (!batch.length) return;
    try {
      await fetch('/api/logs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: batch }),
      });
    } catch { /* عمداً بی‌صدا */ }
  }, 1500);
}

/**
 * ثبت یک خطا. از هر جای رابط قابل صدا زدن است.
 *
 * پیشوند تکراری برداشته می‌شود: پیام خطای سرور خودش «Error: HTTP 403» است و
 * چسباندن نام دوباره، «Error: Error: HTTP 403» می‌ساخت — که هم زشت است هم
 * یک لحظه به آدم می‌گوید دو خطا رخ داده.
 */
export function logError(where, e, level = 'error') {
  const raw = e?.message ? String(e.message) : String(e);
  const name = e?.name || 'Error';
  const message = raw.startsWith(`${name}:`) || /^[A-Za-z]+Error:/.test(raw) ? raw : `${name}: ${raw}`;
  return push(level, where, message, e?.stack || '');
}

/** ثبت یک هشدار — چیزی که خرابی نیست ولی باید دیده شود. */
export const logWarn = (where, message) => push('warn', where, message);

/** آخرین خطاهای همین مرورگر، تازه‌ترین اول. */
export const localRows = () => [...rows].reverse();

/** شنیدن خطاهای تازه، برای بروزرسانی زندهٔ تب لاگ. */
export function onError(fn) { subs.add(fn); return () => subs.delete(fn); }

/**
 * دام‌های سراسری.
 *
 * یک بار در بوت نصب می‌شوند. بدون این‌ها، خطایی که در یک شنوندهٔ رویداد
 * می‌افتد هیچ‌جا ثبت نمی‌شود — نه در دفتر، نه در نوار وضعیت — و کاربر فقط
 * می‌بیند که «کار نمی‌کند».
 */
let installed = false;
export function installGlobalCapture() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    // خطای بارگذاری منبع (تصویر، اسکریپت) هدف دارد ولی error ندارد
    if (event.error) logError('استثنای رسم‌نشده', event.error);
    else if (event.target && event.target !== window) {
      push('warn', 'بارگذاری منبع', `${event.target.tagName || ''} ${event.target.src || event.target.href || ''}`);
    } else push('error', 'استثنای رسم‌نشده', event.message || 'خطای نامشخص');
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    logError('وعدهٔ ردشده', event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  });
}
