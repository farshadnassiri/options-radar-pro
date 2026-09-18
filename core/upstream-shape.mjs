// شکلِ پاسخِ بالادست، وقتی پاسخ ردیفی ندارد.
//
// ═══ چرا این ماژول لازم شد ═══
//
// گزارش صاحب پروژه، نوبت پنجم: خروجی سه‌ماهه ۱٬۳۱۶ ابزار/روز را از مسیر
// تاریخی خواست و **هر ۱٬۳۱۶تا** خالی برگشتند — با صفر خطا. تابلوی روزانه
// برای خودِ نماد پایه در همان روزها ۳۶٬۱۳۴ معامله ثبت کرده بود.
//
// ولی برنامه نمی‌توانست بگوید چه شد، چون `firstList()` دو چیزِ کاملاً
// متفاوت را به یک `[]` تبدیل می‌کند:
//
//   ۱. بالادست آمد و گفت «این روز هیچ معامله‌ای نداشت»  →  آرایهٔ صفر
//   ۲. بالادست چیزی داد که اصلاً فهرست معامله نیست      →  شیء بی‌آرایه
//
// اولی واقعیتِ بازار است و دومی خرابی. تا وقتی خروجی هر دو را «بدون
// معامله» بنویسد، هیچ اجرایی این را روشن نمی‌کند و هر نوبت یک حدسِ تازه
// می‌ماند. این تابع همان تفاوت است — و هیچ عددی نمی‌سازد، فقط می‌گوید چه
// رسید.

const KEY_SAMPLE = 4;

export const UPSTREAM_SHAPE = {
  none: 'بی‌پاسخ',
  emptyList: 'فهرست خالی',
  list: 'فهرست',
  noList: 'پاسخ بی‌فهرست',
  scalar: 'پاسخ غیرشیء',
};

/**
 * پاسخ خام بالادست را دسته‌بندی می‌کند، بی آنکه چیزی از آن بسازد.
 *
 * `keys` نامِ کلیدهای سطح اولِ پاسخ است — همان چیزی که می‌گوید بالادست
 * قالبش را عوض کرده یا پیامِ خطا فرستاده. بیش از چند تا لازم نیست و
 * مقدارشان هم لازم نیست؛ خودِ نام‌ها کافی‌اند تا فردا کسی بفهمد چه رسید.
 */
export function upstreamShape(data) {
  if (data === null || data === undefined) return { kind: 'none', rows: 0, keys: [] };
  if (Array.isArray(data)) {
    return { kind: data.length ? 'list' : 'emptyList', rows: data.length, keys: [] };
  }
  if (typeof data !== 'object') return { kind: 'scalar', rows: 0, keys: [] };
  const keys = Object.keys(data);
  const lists = keys.filter((key) => Array.isArray(data[key]));
  if (!lists.length) return { kind: 'noList', rows: 0, keys: keys.slice(0, KEY_SAMPLE) };
  const rows = lists.reduce((sum, key) => sum + data[key].length, 0);
  return { kind: rows ? 'list' : 'emptyList', rows, keys: keys.slice(0, KEY_SAMPLE) };
}

/** یک سطر خوانا برای برگ پوشش و دفتر خطاها. */
export function upstreamShapeLabel(shape) {
  if (!shape?.kind) return '';
  const name = UPSTREAM_SHAPE[shape.kind] || shape.kind;
  // کلیدها فقط وقتی می‌آیند که خبر بدهند: فهرستِ خالیِ واقعی نیازی ندارد.
  const keys = shape.kind === 'noList' && shape.keys?.length ? ` (${shape.keys.join('، ')})` : '';
  return `${name}${keys}`;
}
