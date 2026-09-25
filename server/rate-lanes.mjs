// دو خطِ سهمیه برای بالادست — یکی برای ریزمعاملهٔ تاریخی، یکی برای بقیه.
//
// ═══ چرا دو خط ═══
//
// R5-08 سقفِ مشترکِ سرور را از ۱۲ درخواست در ثانیه به ۳ رساند، هم‌زمانی را
// از ۶ به ۲. علتش فقط یک سرویس بود: `GetTradeHistory`، که بالادست سهمیه‌اش
// را با `HTTP 200` و آرایهٔ خالی می‌بندد. ولی آن سقف روی **همهٔ**
// درخواست‌های برنامه می‌نشست — دیده‌بان، تابلوی روزانه، مشخصاتِ ابزار،
// دفترِ سفارش — و کلِ برنامه چهار برابر کند شد.
//
// شواهد از دفتر خطاهای صاحب پروژه، ۱۴۰۵/۰۷/۰۲: `GetInstrumentInfo` از ۳٬۳۶۶
// درخواست ۰٫۱۲٪ خطا داشت، تابلوی روزانه صفر؛ `GetTradeHistory` ۲۸٪. فقط
// یکی از این‌ها سقفِ محتاطانه لازم دارد.
//
// این فایل شبکه ندارد: فقط «کدام خط؟» و «چقدر صبر؟» — تا آزمون‌پذیر باشد.

export const TAPE_LANE = 'tape';
export const GENERAL_LANE = 'general';

/** خطِ یک مسیرِ بالادست. */
export function laneOf(pathname = '') {
  return String(pathname).includes('/Trade/GetTradeHistory/') ? TAPE_LANE : GENERAL_LANE;
}

/** سقف‌های یک خط، از تنظیمات — هر بار تازه، چون کاربر وسطِ کار عوضشان می‌کند. */
export function laneLimits(S = {}, lane = GENERAL_LANE) {
  const pick = (key, fallback) => {
    const v = Number(S?.[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return lane === TAPE_LANE
    ? { rate: pick('tapeRatePerSec', 3), burst: pick('tapeBurst', 6), concurrency: pick('tapeConcurrency', 2) }
    : { rate: pick('ratePerSec', 12), burst: pick('burst', 20), concurrency: pick('concurrency', 6) };
}

/**
 * سطلِ ژتون. `take()` صفر برمی‌گرداند اگر ژتون بود، وگرنه میلی‌ثانیه‌های
 * لازم تا ژتونِ بعدی. `limits` تابع است تا تغییرِ تنظیمات فوراً اثر کند.
 */
export function makeBucket(limits, now = () => Date.now()) {
  let tokens = limits().burst;
  let last = now();
  return {
    take() {
      const { rate, burst } = limits();
      const t = now();
      tokens = Math.min(burst, tokens + ((t - last) / 1000) * rate);
      last = t;
      if (tokens >= 1) { tokens -= 1; return 0; }
      return Math.ceil(((1 - tokens) / rate) * 1000);
    },
    /** پس از پایین‌آمدنِ ظرفیت در تنظیمات، ژتونِ انباشته هم پایین بیاید. */
    clamp() { tokens = Math.min(tokens, limits().burst); },
  };
}
