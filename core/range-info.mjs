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
// حالا سرور ارزش و حجم را از همان `GetClosingPriceInfo` می‌دهد و ادغام
// صریح است: هر عددی که پاسخ اطلاعات واقعاً داشت جایگزین می‌شود، و عددی
// که نداشت (مثل موقعیت باز) از عکس دیده‌بان می‌ماند — هیچ‌کدام صفرِ ساختگی
// نمی‌گیرند.
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

/** میدان‌هایی که پاسخ اطلاعات بر عکس دیده‌بان مقدم است. */
export const RANGE_INFO_FIELDS = Object.freeze([
  'first', 'low', 'high', 'last', 'close', 'yday', 'trades', 'volume', 'value',
]);

/**
 * ردیف زنجیره + پاسخ اطلاعات همان قرارداد.
 *
 * `vol` قدیمی هم به `volume` خوانده می‌شود تا سرورِ قدیمی‌تر هم حجم را
 * با کندل هم‌زمان کند. `valueSource` می‌گوید ارزشِ کارت از کجا آمد.
 */
export function mergeRangeInfo(row = {}, info = null) {
  if (!info || typeof info !== 'object' || info.error) return { ...row, valueSource: 'watch' };
  const out = { ...row };
  const src = { ...info };
  if (!known(src.volume) && known(src.vol)) src.volume = src.vol;
  for (const key of RANGE_INFO_FIELDS) {
    if (known(src[key])) out[key] = Number(src[key]);
  }
  out.valueSource = known(src.value) ? 'info' : 'watch';
  return out;
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
