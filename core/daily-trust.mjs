// یک ردیفِ روزانه کِی «روزانهٔ آن روز» است — و کِی نیست.
//
// ═══ بند ۵ ممیزیِ ۱۴۰۵/۰۶/۲۹ ═══
//
// وقتی فهرست روزانه خالی بود و `asOf` می‌آمد، `/api/dailies` یک بار
// `GetClosingPriceHistory/{ins}/{asOf}` را صدا می‌زد و نتیجه را **مثل**
// فهرست روزانه نرمال می‌کرد. نمونهٔ واقعیِ اهرم برای `20260919`:
//
//   dEven ۰ · ساعت ۰۶:۱۲:۰۶ · تعداد معامله صفر · قیمت ۷۵٬۰۶۴
//   روزانهٔ همان روز:            قیمت پایانی ۷۳٬۵۲۷
//   و ۷۵٬۰۶۴ قیمتِ **روز قبل** در روزانه بود.
//
// یعنی آن رکورد نه روزانهٔ معتبرِ آن روز بود و نه تاریخچهٔ چندروزه — یک
// عکسِ پیش‌جلسه بود که آخرین قیمتِ شناخته‌شده را تکرار می‌کرد. کد آن را
// به `date:0` تبدیل می‌کرد و چون آرایه خالی نبود `source:'history'`
// می‌داد. از بیرون، شکست شبیه موفقیت بود.
//
// ═══ دو دروازه، و چرا هر دو لازم‌اند ═══
//
// ۱. **تاریخ.** ردیفی که تاریخِ هشت‌رقمیِ معتبر ندارد، ردیفِ هیچ روزی
//    نیست. `dEven=0` از این دروازه رد نمی‌شود.
// ۲. **پیش‌جلسه.** ردیفی که تاریخ دارد ولی مهرِ زمانی‌اش پیش از آغاز
//    جلسه است و نه معامله‌ای ثبت کرده نه حجمی، عکسِ پیش‌گشایش است نه
//    روزِ بسته‌شده. قیمتش آخرین قیمتِ دیروز است و پذیرفتنش یعنی نوشتنِ
//    عددِ دیروز به نامِ امروز — همان چیزی که قاعدهٔ «عدد گمشده با پایانیِ
//    دیروز پر نشود» منع می‌کند.
//
// ساعتِ صفر یا نیامده **مشکوک نیست**: بیشترِ ردیف‌های سالمِ فهرست روزانه
// اصلاً `hEven` ندارند. دروازهٔ دوم فقط وقتی می‌گزد که ساعتی آمده باشد و
// آن ساعت پیش از جلسه باشد.

const digits = /^[0-9]{8}$/;

/** ثانیهٔ آغاز جلسهٔ پیوسته. همان مبدأیی که `core/backtest.mjs` دارد. */
export const SESSION_START_SECOND = 9 * 3600;

/** `HHMMSS` را به ثانیه از ابتدای روز تبدیل می‌کند. */
export function dailySecond(value) {
  const raw = String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(6, '0').slice(-6);
  return (Number(raw.slice(0, 2)) * 3600) + (Number(raw.slice(2, 4)) * 60) + Number(raw.slice(4, 6));
}

/** تاریخِ هشت‌رقمیِ معتبرِ میلادی، با ماه و روزِ ممکن. */
export function validDailyDate(value) {
  const text = String(Math.trunc(Number(value) || 0));
  if (!digits.test(text)) return false;
  const month = Number(text.slice(4, 6)), day = Number(text.slice(6, 8));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * چرا این ردیف روزانهٔ معتبر نیست — یا رشتهٔ خالی اگر هست.
 *
 * دلیل برمی‌گردد نه فقط `false`، چون مصرف‌کننده باید بتواند بگوید چه شد.
 */
export function dailyRowRejection(row = {}) {
  if (!row || typeof row !== 'object') return 'ردیف نیست';
  if (!validDailyDate(row.date)) return 'تاریخ نامعتبر';
  const stamp = Math.trunc(Number(row.hEven) || 0);
  const traded = (Number(row.trades) || 0) > 0 || (Number(row.vol) || 0) > 0;
  if (stamp > 0 && dailySecond(stamp) < SESSION_START_SECOND && !traded) return 'عکس پیش‌جلسه';
  return '';
}

export const dailyRowTrusted = (row) => dailyRowRejection(row) === '';

/**
 * ردیف‌های معتبر، و شرحِ آنچه کنار رفت.
 *
 * خروجی: `{ rows, dropped, reasons }` — `reasons` شمارشِ دلیل‌هاست، تا
 * مصرف‌کننده بتواند بگوید «۳ ردیف تاریخ نداشت» نه فقط «۳ ردیف افتاد».
 */
export function trustedDailyRows(rows = []) {
  const kept = [], reasons = new Map();
  for (const row of rows || []) {
    const why = dailyRowRejection(row);
    if (!why) { kept.push(row); continue; }
    reasons.set(why, (reasons.get(why) || 0) + 1);
  }
  return {
    rows: kept,
    dropped: (rows || []).length - kept.length,
    reasons: Object.fromEntries(reasons),
  };
}

/**
 * آیا این سری روزِ خواسته‌شده را پوشش می‌دهد.
 *
 * منبع جایگزین یک endpoint **تک‌روزه** است و حلقهٔ بازه ندارد؛ پس
 * برگشتنِ «چند ردیف» اثبات نمی‌کند روزِ موردِ نظر در دست است. مصرف‌کننده
 * باید این دو را از هم جدا ببیند، وگرنه بازیابیِ روزهای گمشده یک ادعای
 * بی‌پشتوانه می‌شود.
 */
export function coversDailyDate(rows = [], date = 0) {
  const wanted = Math.trunc(Number(date) || 0);
  if (!wanted) return false;
  return (rows || []).some((row) => Math.trunc(Number(row?.date) || 0) === wanted);
}

// ═══════════════ پوششِ پاسخِ `closing`، و چرا لازم شد ═══════════════
//
// F-03 آزمونِ عملی ۱۴۰۵/۰۶/۲۹. برای اهرم در `20260919`:
//
//   /api/hist?kind=closing  →  HTTP 200، `count:1`
//   {"dEven":0,"hEven":61206,"pClosing":75064,"zTotTran":0,"qTotTran5J":0}
//
// همان روز، روزانهٔ تاریخ‌دار پایانیِ ۷۳٬۵۲۷ و ۷٬۷۳۶ معامله و ۷۳٬۳۰۵٬۲۲۴
// حجم می‌داد؛ و ۷۵٬۰۶۴ قیمتِ **دیروز** بود. یعنی آن یک رکورد، عکسِ
// پیش‌جلسه بود و اطلاعاتِ پایانِ روز را نداشت — ولی پاسخ با ۲۰۰ و یک
// رکورد برمی‌گشت و هیچ‌جا نمی‌گفت پوشش ندارد.
//
// ═══ چرا `dEven:0` به‌تنهایی مدرکِ خرابی نیست ═══
//
// در همان آزمون، ضهرم۶۰۴۰ برای `20260916` از همین endpoint **۲۱۰** رکورد
// داد که رکوردِ پایانی‌اش در ۱۲:۲۹:۴۴ با ۲۴۶ معامله و ۲٬۸۲۸ حجم دقیقاً
// با تابلو می‌خواند — و **همهٔ** آن ۲۱۰ رکورد هم `dEven:0` داشتند. پس
// تاریخِ داخلیِ صفر قراردادِ این endpoint است، نه نشانهٔ نقص.
//
// چیزی که این دو را از هم جدا می‌کند، ساعتِ رکوردها و بیشینهٔ شمار/حجمِ
// داخلشان است، سنجیده با تابلوی روزانه. همین‌جا حساب می‌شود و پاسخ آن را
// حمل می‌کند — بی آنکه رکوردِ خامی حذف شود.
export function closingCoverage(rows = [], expect = { known: false }) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object');
  if (!list.length) {
    return { records: 0, complete: false, verified: Boolean(expect?.known), preSessionOnly: false,
      note: 'هیچ رکوردی نیامد' };
  }
  const seconds = list.map((row) => dailySecond(row.hEven)).filter((s) => s > 0);
  const maxTrades = Math.max(0, ...list.map((row) => Number(row.zTotTran) || 0));
  const maxVolume = Math.max(0, ...list.map((row) => Number(row.qTotTran5J) || 0));
  const preSessionOnly = seconds.length > 0 && seconds.every((s) => s < SESSION_START_SECOND);
  const complete = Boolean(expect?.known)
    && maxTrades === Number(expect.trades) && maxVolume === Number(expect.volume);

  const note = complete
    ? 'پوششِ پایانِ روز تأیید شد — بیشینهٔ شمار و حجم با تابلوی روزانه می‌خواند'
    : preSessionOnly
      ? 'فقط عکسِ پیش‌جلسه — پوششِ پایانِ روز در این پاسخ نیست'
      : expect?.known
        ? `پوششِ پایانِ روز تأیید نشد — بیشینهٔ این پاسخ ${maxTrades} معامله و ${maxVolume} حجم،`
          + ` تابلو ${Number(expect.trades)} و ${Number(expect.volume)}`
        : 'تابلوی روزانه در دست نیست، پس پوششِ این پاسخ سنجیده نشد';

  return {
    records: list.length,
    firstSecond: seconds.length ? Math.min(...seconds) : 0,
    lastSecond: seconds.length ? Math.max(...seconds) : 0,
    maxTrades, maxVolume, preSessionOnly,
    complete, verified: Boolean(expect?.known),
    note,
  };
}
