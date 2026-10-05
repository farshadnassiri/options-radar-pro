// ————————————————————————————————————————————————————————————————
// کندل روزانهٔ قراردادها: عددهای کنار کندل از همان پاسخی که خودِ کندل
//
// ═══ گزارش صاحب پروژه (ضفزر729) ═══
//
// «ارزش معاملات در کندل قیمت امروز قراردادها صحیح نیست.» قیمت‌های کندل
// (کمینه/اولین/آخرین/پایانی/بیشینه) از `/api/infos` می‌آمدند، ولی ارزش و
// حجمِ کنارش از عکس دیده‌بان — دو منبع، دو زمان. بدتر: `/api/infos` حجم را
// با نام `vol` می‌داد و ردیفِ زنجیره `volume` داشت، پس ادغامِ ساده حجم را
// هرگز تازه نمی‌کرد در حالی که `trades` را تازه می‌کرد. روی یک کارت،
// تعداد معامله از یک لحظه بود و حجم و ارزش از لحظه‌ای دیگر.
//
// ۱۴۰۵/۰۷/۰۸ ارزش و حجم کارت به پاسخ اطلاعات رفت تا با کندل هم‌زمان شود؛
// ولی همین آن را از زنجیره و بقیهٔ تب جدا کرد. از ۱۴۰۵/۰۷/۱۳ قاعده برعکس
// است: هر عددی که زنجیره هم دارد از همان عکس دیده‌بان است و پاسخ اطلاعات
// فقط سایهٔ کندل (اولین/کمترین/بیشترین) را می‌دهد — شرح در `mergeRangeInfo`.
// ————————————————————————————————————————————————————————————————

const known = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/**
 * ارزش و حجم از بدنهٔ `GetClosingPriceInfo`.
 *
 * ارزش به **ریال** است و اندازهٔ قرارداد را از پیش دارد (بالادست حساب
 * می‌کند). عددِ نیامده `null` می‌ماند؛ صفر یعنی «معامله نشد» و ادعای
 * دیگری است.
 */
export function infoTotals(d = {}) {
  return {
    value: known(d?.qTotCap) ? Number(d.qTotCap) : null,
    volume: known(d?.qTotTran5J) ? Number(d.qTotTran5J) : null,
  };
}

/**
 * میدان‌هایی که کندل از پاسخ اطلاعات می‌گیرد — فقط قیمت‌هایی که عکس
 * دیده‌بان ندارد. ارزش، حجم، تعداد معامله، موقعیت باز، آخرین و پایانی
 * همیشه از عکس زنجیره‌اند.
 */
export const RANGE_INFO_FIELDS = Object.freeze(['first', 'low', 'high']);

const pos = (v) => (known(v) && Number(v) > 0 ? Number(v) : NaN);

/**
 * ردیف زنجیره + پاسخ اطلاعات همان قرارداد، برای کارت کندل.
 *
 * ═══ یک منبع برای هر عدد (گزارش صاحب پروژه ۱۴۰۵/۰۷/۱۳) ═══
 *
 * «ارزش معامله در زنجیرهٔ قرارداد یک عدد است و در کندل قیمت امروز عدد
 * دیگر؛ همین‌طور حجم و موقعیت باز — چه در تایم بازار چه بیرون آن.» علتش
 * دو منبع با دو زمان بود: زنجیره، نقشه، آمار سررسید و جدول‌های داشبورد از
 * عکس دیده‌بان (هر ۵ ثانیه) و کندل از `/api/infos` (تا ۳۰ ثانیه کش در
 * مرورگر). پیش از بازگشایی هم پاسخ اطلاعات می‌توانست مال جلسهٔ دیگری باشد.
 *
 * حالا هر عددی که زنجیره هم نشان می‌دهد — ارزش، حجم، تعداد معامله، موقعیت
 * باز، آخرین، پایانی و پایانی دیروز — از **همان ردیف عکس** می‌آید، پس هر
 * جای تب یک عدد است. از پاسخ اطلاعات فقط اولین، کمترین و بیشترین گرفته
 * می‌شود، و فقط اگر هم‌جلسهٔ عکس باشد (پایانی دیروزِ هر دو یکی است). اگر
 * پاسخ از لحظهٔ دیگری از همان جلسه است، دامنه طوری گسترده می‌شود که آخرین
 * و پایانیِ عکس را در بر بگیرد — کندل هیچ‌وقت قیمتی بیرون از سایه‌اش ندارد.
 *
 * `rangeSource`: `info` (هم‌لحظه)، `infoLag` (همان جلسه، لحظهٔ دیگر)،
 * `otherSession` (پاسخ مال جلسهٔ دیگری است) یا `none` (پاسخی نیامد).
 * `rangeLag` شمار معامله‌های عکس منهای پاسخ اطلاعات است.
 */
export function mergeRangeInfo(row = {}, info = null) {
  const tradeLast = 'tradeLast' in (row || {}) ? pos(row.tradeLast) : pos(row?.last);
  const out = { ...row, last: tradeLast, first: NaN, low: NaN, high: NaN, rangeSource: 'none', rangeLag: NaN, valueSource: 'watch' };
  if (!info || typeof info !== 'object' || info.error) return out;
  const rowYday = pos(row.yday), infoYday = pos(info.yday);
  const rowTrades = known(row.trades) ? Number(row.trades) : NaN;
  const infoTrades = known(info.trades) ? Number(info.trades) : NaN;
  const sameSession = rowYday > 0 && infoYday > 0 ? rowYday === infoYday
    : Number.isFinite(rowTrades) && rowTrades === infoTrades;
  if (!sameSession) return { ...out, rangeSource: 'otherSession' };
  let first = pos(info.first), low = pos(info.low), high = pos(info.high);
  for (const p of [tradeLast, pos(row.close)]) {
    if (!(p > 0) || !(Number(row.trades) > 0)) continue;
    low = low > 0 ? Math.min(low, p) : low;
    high = high > 0 ? Math.max(high, p) : high;
  }
  const lag = Number.isFinite(rowTrades) && Number.isFinite(infoTrades) ? rowTrades - infoTrades : NaN;
  return { ...out, first, low, high, rangeLag: lag, rangeSource: lag === 0 ? 'info' : 'infoLag' };
}

/**
 * پاسخ اطلاعات (`info`) دست‌کم به تازگیِ ردیف دیده‌بان (`row`) هست؟
 * هم‌جلسه (پایانی دیروزِ هر دو یکی، اگر هر دو معلوم‌اند) و شمار معامله‌اش
 * کمتر نیست. شمار معامله در یک جلسه فقط بالا می‌رود، پس بهترین ساعتِ
 * مشترک دو منبع است. روکش قیمت در ریسهٔ غربال همین را می‌پرسد.
 */
export function infoIsFresh(info = {}, row = {}) {
  const iy = pos(info?.yday), ry = pos(row?.yday);
  if (iy > 0 && ry > 0 && iy !== ry) return false;
  const it = known(info?.trades) ? Number(info.trades) : NaN;
  const rt = known(row?.trades) ? Number(row.trades) : NaN;
  return !Number.isFinite(it) || !Number.isFinite(rt) || it >= rt;
}

/**
 * عنوان و یادداشتِ بخش کندل، از روزِ عکس.
 *
 * `session` همان بدنهٔ `/api/live-dashboard` است. نبودنش (سرورِ قدیمی)
 * یعنی «نمی‌دانیم»، و آن هم «امروز» ادعا نمی‌کند.
 */
export function rangeHeading(session = null, dateLabel = (d) => String(d)) {
  if (session && session.current) {
    return {
      title: 'کندل قیمت امروز قراردادها',
      note: session.final ? 'ارقام نهایی پس از بستن بازار' : '',
      current: true,
    };
  }
  if (!session || typeof session !== 'object') {
    return { title: 'کندل قیمت قراردادها', note: 'روزِ عکس تابلو معلوم نیست؛ امروز ادعا نمی‌شود', current: false };
  }
  const when = session.date ? ` (${dateLabel(session.date)})` : '';
  return {
    title: `کندل قیمت جلسهٔ قبل${when}`,
    note: session.why || 'عکس تابلو از جلسهٔ قبل است',
    current: false,
  };
}
