// بازهٔ تحلیل — ریاضیِ خالصِ بازه، بی‌هیچ DOM.
//
// چرا از رابط جدا شد: پنج تبِ تاریخ‌دار همین قاعده را به کار می‌برند و
// قاعدهٔ مشترک باید آزمون‌پذیر باشد. لایهٔ رابط (`ui/history-range.mjs`)
// فقط تقویم و جمله را می‌سازد و هر تصمیمی را از اینجا می‌گیرد.

import { num } from './num.mjs';
import { expiryLabel } from './option-roster.mjs';
import { jalaliToGregorian, gregorianToJalali } from './jalali.mjs';

const faDigits = (value) => String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/**
 * جداکردنِ یک گروه عددی از همسایه‌اش در متن راست‌به‌چپ.
 *
 * بی این، «(۵۰٪) · ۱ روز نیامد» روی صفحه «۱۰ روز نیامد» خوانده می‌شد —
 * دو عددِ کنار هم را الگوریتم دوسویه به هم می‌چسباند و یکی می‌کرد. عددِ
 * غلط در جمله‌ای که قرار است وضعیت را گزارش کند، بدتر از نبودنش است.
 */
const iso = (text) => `\u2068${text}\u2069`;

/** بازه‌های آماده. عدد، روزِ تقویمی است نه کاری. */
export const RANGE_PRESETS = [
  { id: 'm3', label: '۳ ماه اخیر', days: 90 },
  { id: 'm6', label: '۶ ماه اخیر', days: 182 },
  { id: 'y1', label: '۱ سال اخیر', days: 365 },
  { id: 'y2', label: '۲ سال اخیر', days: 730 },
  { id: 'custom', label: 'بازهٔ دلخواه', days: 0 },
];

export const DEFAULT_PRESET = 'y1';

const DAY = 86400000;
const compactOf = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
const dateOf = (compact) => {
  const s = String(compact);
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
};

export const todayCompact = () => compactOf(new Date());

/** بازهٔ یک پیش‌فرض، از امروز به عقب. */
export function presetRange(id, today = todayCompact()) {
  const row = RANGE_PRESETS.find((p) => p.id === id) || RANGE_PRESETS.find((p) => p.id === DEFAULT_PRESET);
  const to = num(today, 0);
  if (!row.days) return { from: to, to };
  return { from: compactOf(new Date(dateOf(to).getTime() - row.days * DAY)), to };
}

/** روزهای تقویمی یک بازه — دامنهٔ انتخاب تقویم جلالی. */
export function calendarDays(from, to) {
  const out = [];
  for (let d = dateOf(from), end = dateOf(to); d <= end; d = new Date(d.getTime() + DAY)) out.push(compactOf(d));
  return out;
}

export const rangeLabel = ({ from, to }) => `${faDigits(expiryLabel(from))} تا ${faDigits(expiryLabel(to))}`;

/** ورود مستقیمِ تاریخ شمسی؛ تبدیل رفت‌وبرگشت، روز نامعتبر را رد می‌کند. */
export function parseJalaliRange(fromText, toText, maxDate = todayCompact()) {
  const parse = (text) => {
    const plain = String(text).trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const match = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(plain);
    if (!match) return 0;
    const [y, m, d] = match.slice(1).map(Number);
    if (y < 1300 || y > 1699 || m < 1 || m > 12 || d < 1 || d > 31) return 0;
    const gregorian = jalaliToGregorian(y, m, d);
    if (gregorianToJalali(...gregorian).join(',') !== [y, m, d].join(',')) return 0;
    return gregorian[0] * 10000 + gregorian[1] * 100 + gregorian[2];
  };
  const from = parse(fromText), to = parse(toText);
  if (!from || !to) return { ok: false, error: 'تاریخ شمسی معتبر را به شکل سال/ماه/روز وارد کن.' };
  if (from > to) return { ok: false, error: 'تاریخ شروع باید پیش از تاریخ پایان یا برابر آن باشد.' };
  if (to > maxDate) return { ok: false, error: 'تاریخ پایان نمی‌تواند پس از امروز باشد.' };
  return { ok: true, range: { from, to } };
}

/** تاریخِ `days` روز پیش از یک تاریخ فشرده. */
export function daysBefore(compact, days) {
  return compactOf(new Date(dateOf(compact).getTime() - Math.max(0, num(days, 0)) * DAY));
}

/**
 * جملهٔ پیشرفتِ ساخت. `''` یعنی چیزی در جریان نیست.
 *
 * «تمام شد ولی نیامد» با «در جریان» یکی نیست و نباید مثل هم دیده شود:
 * اولی یعنی منتظر نمان، دومی یعنی صبر کن. کاربری که فرق این دو را نداند،
 * یا بیهوده منتظر می‌ماند یا بیهوده تسلیم می‌شود.
 */
/** نام هر مرحله، به زبان کاربر. */
export const BUILD_STAGES = {
  day: 'روزهای معاملاتی',
  catalog: 'جست‌وجوی قراردادها',
  detail: 'مشخصات قراردادها',
};

/**
 * جملهٔ پیشرفتِ ساخت. `''` یعنی چیزی در جریان نیست.
 *
 * «تمام شد ولی نیامد» با «در جریان» یکی نیست و نباید مثل هم دیده شود:
 * اولی یعنی منتظر نمان، دومی یعنی صبر کن. کاربری که فرق این دو را نداند،
 * یا بیهوده منتظر می‌ماند یا بیهوده تسلیم می‌شود.
 *
 * شمارنده از **مرحلهٔ جاری** می‌آید، نه از شمارندهٔ روزها. نسخهٔ اول
 * همیشه روزها را می‌شمرد و در مرحلهٔ جست‌وجو «۰ از ۰ روز (۰٪) · ۱۴۹ روز
 * نیامد» می‌گفت — عددی که هیچ‌کدامش راست نبود: نه روزی در کار بود، نه
 * آن ۱۴۹ شکست مالِ روزها بود.
 */
export function buildLine(build) {
  if (!build) return '';
  const stage = BUILD_STAGES[build.stage] || '';
  if (build.running) {
    const done = num(build.stageTotal, 0) ? num(build.stageDone, 0) : num(build.done, 0);
    const total = num(build.stageTotal, 0) || num(build.total, 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const head = stage ? `ساخت دفتر — ${stage}` : 'ساخت دفتر در جریان';
    return `${head}: ${iso(`${faDigits(done)} از ${faDigits(total)}`)} ${iso(`(${faDigits(pct)}٪)`)}`
      + (build.added ? ` · ${iso(`${faDigits(build.added)} قرارداد تازه`)}` : '')
      + (build.failed ? ` · ${iso(`${faDigits(build.failed)} درخواست ناموفق`)}` : '');
  }
  if (build.failed) {
    return `${iso(`${faDigits(build.failed)} درخواست`)} به تابلوی تاریخی نرسید`
      + (build.missing ? ` و ${iso(`${faDigits(build.missing)} روز`)} هنوز در دفتر نیست` : '')
      + (build.lastError ? ` — آخرین خطا: ${iso(build.lastError)}` : '');
  }
  if (build.missing) return `${iso(`${faDigits(build.missing)} روزِ کاری`)} هنوز در دفتر نیست`;
  if (num(build.incompletePairs, 0) > 0) {
    return `${iso(`${faDigits(build.incompletePairs)} سری`)} فقط یک سمت دارد؛ جست‌وجوی تکمیلی چیزی پیدا نکرد`;
  }
  return '';
}
