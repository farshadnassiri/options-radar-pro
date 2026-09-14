// قاعده‌های دامنه و «کِی باید دوباره گرفت» برای صفحهٔ رصد زندهٔ بازار.
//
// گزارش صاحب پروژه (۱۴۰۵/۰۶/۲۳): «هر جا نیازی نیست دوباره شروع به دریافت
// دیتای نمادهای دیگر یا تاریخ‌های دیگر نکن» و «از دوباره‌کاری و اینکه کاربر
// دوباره انتخاب کند اجتناب شود».
//
// هر دو یک ریشه داشتند: صفحه **دو** جای انتخاب داشت (نقشه، و چهار کشویی در
// تحلیل‌های تکمیلی) و **هر تیکِ خودکار** بی‌توجه به اینکه کاربر کجاست،
// ریزمعاملهٔ قرارداد و بازهٔ روزانهٔ کل سررسید را می‌گرفت.
//
// این ماژول همان دو قاعده را خالص و بی‌نیاز از DOM نگه می‌دارد تا آزمون‌شدنی
// بماند؛ تب داشبورد فقط صدایش می‌زند.

export const SCOPE_LEVELS = [
  ['market', 'کل بازار'],
  ['underlying', 'نماد پایه'],
  ['expiry', 'سررسید'],
  ['contract', 'قرارداد'],
];

const ORDER = SCOPE_LEVELS.map(([key]) => key);

/**
 * سطحی که انتخابِ موجود واقعاً پشتیبانی می‌کند.
 *
 * درخواستِ «قرارداد» وقتی هنوز قراردادی انتخاب نشده، دامنهٔ خالی می‌سازد و
 * جدول را بی‌دلیل خالی نشان می‌دهد. به‌جای آن تا نزدیک‌ترین سطحِ دارای داده
 * پایین می‌آید — و چون خودِ سطح برمی‌گردد، نوار سطح هم همان را نشان می‌دهد
 * و کاربر نمی‌بیند دکمه‌ای روشن است که کار نمی‌کند.
 */
export function resolveScope(level, selection = {}) {
  const uaIns = String(selection.uaIns || '');
  const endDate = String(selection.endDate || '');
  const contractIns = String(selection.contractIns || '');
  const wanted = ORDER.includes(level) ? level : 'market';
  const have = contractIns && endDate && uaIns ? 'contract'
    : endDate && uaIns ? 'expiry'
      : uaIns ? 'underlying' : 'market';
  const level_ = ORDER.indexOf(wanted) <= ORDER.indexOf(have) ? wanted : have;
  return { level: level_, uaIns, endDate, contractIns };
}

/**
 * ریزمعامله فقط وقتی گرفته می‌شود که نمای فعال واقعاً نوار ریزمعامله باشد.
 *
 * پیش از این هر تیک (۵ تا ۶۰ ثانیه) یک درخواست `live-trades` می‌زد، حتی
 * وقتی کاربر روی نقشه بود و هیچ نوار ریزمعامله‌ای روی صفحه نبود.
 */
export function needsTape(level, viewKind) {
  return viewKind === 'tape' && level === 'contract';
}

/**
 * بازهٔ روزانهٔ قراردادهای یک سررسید: فقط وقتی بخش دیده می‌شود، و فقط وقتی
 * نسخهٔ کش شده برای **همین** کلید کهنه شده باشد.
 *
 * `cached` همان چیزی است که کش نگه داشته (`{ at }`) یا `undefined`. کلید
 * عوض‌شده یعنی سررسید عوض شده و داده‌ای برایش نداریم — این تنها حالتی است
 * که دریافت لازم است حتی اگر همین الان دریافت دیگری تمام شده باشد.
 */
export function shouldFetchRange({ visible, cached, now, ttlMs = 30_000 }) {
  if (!visible) return false;
  if (!cached || !Number.isFinite(Number(cached.at))) return true;
  return now - Number(cached.at) >= ttlMs;
}
