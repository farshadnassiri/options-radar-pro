// قلمِ برنامه، انتخابیِ کاربر (۱۴۰۵/۰۷/۱۷).
//
// خواستهٔ صاحب پروژه: «قابلیت تغییر و انتخاب چند فونت در برنامه وجود داشته
// باشد.» هر پنج قلم درون پروژه‌اند (`ui/fonts/`) و همه حروف و رقم‌های فارسی
// را دارند — Readex Pro بررسی و کنار گذاشته شد چون «گ چ پ ژ» و رقم فارسی
// نداشت. انتخاب فقط `--font-ui` را روی ریشه عوض می‌کند؛ متن، عدد، نمودار و
// تصویرِ ذخیره‌شده همه از همان توکن می‌خوانند. انتخاب در حافظهٔ مرورگر می‌ماند.

export const FONTS = [
  { id: 'plex', family: 'IBM Plex Sans Arabic', label: 'آی‌بی‌ام پلکس', note: 'مدرن و دقیق — پیش‌فرض' },
  { id: 'vazirmatn', family: 'Vazirmatn', label: 'وزیرمتن', note: 'آشنا و خوانا' },
  { id: 'noto-sans', family: 'Noto Sans Arabic', label: 'نوتو سنس', note: 'خنثی و فشرده' },
  { id: 'noto-kufi', family: 'Noto Kufi Arabic', label: 'نوتو کوفی', note: 'هندسی و محکم' },
  { id: 'noto-naskh', family: 'Noto Naskh Arabic', label: 'نوتو نسخ', note: 'کلاسیک، شبیه کتاب' },
];
export const DEFAULT_FONT = 'plex';
const KEY = 'font';
const FALLBACK = 'Vazirmatn, Tahoma, "Segoe UI", system-ui, sans-serif';

export const fontOf = (id) => FONTS.find((font) => font.id === id) || FONTS[0];

/** پشتهٔ کاملِ قلم برای `--font-ui`: قلمِ انتخابی، بعد جایگزین‌های فارسی‌دار. */
export const fontStack = (id) => `"${fontOf(id).family}", ${FALLBACK}`;

export function readFont(storage = globalThis.localStorage) {
  try { const id = storage?.getItem(KEY); return FONTS.some((font) => font.id === id) ? id : DEFAULT_FONT; } catch { return DEFAULT_FONT; }
}

/** قلم را روی ریشه می‌گذارد؛ `persist` فقط برای انتخابِ خودِ کاربر. */
export function applyFont(id, { persist = true, root = globalThis.document?.documentElement, storage = globalThis.localStorage } = {}) {
  const font = fontOf(id);
  if (root) {
    root.style.setProperty('--font-ui', fontStack(font.id));
    root.dataset.font = font.id;
  }
  if (persist) try { storage?.setItem(KEY, font.id); } catch { /* حافظهٔ مرورگر بسته است */ }
  return font.id;
}
