// انتقال یک ترکیب زنده به تب بک‌تست.
//
// تب‌های استراتژی و برترین موقعیت‌ها یک عکس لحظه‌ای‌اند: می‌گویند این ترکیب
// همین حالا چه شکلی است، ولی نمی‌گویند تا امروز چه کرده. بک‌تست سریع همان
// را می‌گوید. تا امروز راهی از این طرف به آن طرف نبود و کاربر باید نماد و
// استراتژی و ترکیب را دستی دوباره می‌چید.
//
// فقط انتخاب‌ها منتقل می‌شوند، نه نتیجه‌ها — همان قاعده‌ای که انتقال از تب
// «آزمون همه استراتژی‌ها» از قبل داشت. اگر عددی از اینجا کپی می‌شد، دو تب
// می‌توانستند دو حرف بزنند و معلوم نبود کدام مال کدام محاسبه است.
//
// تاریخ‌ها «خودکار»اند: ردیف زنده تاریخ ندارد. بک‌تست خودش بلندترین بازهٔ
// موجود همان ترکیب را برمی‌دارد — قدیمی‌ترین روزِ دارای ترکیب معتبر تا
// تازه‌ترین روزِ دارای قیمت کامل. حدس‌زدن یک بازهٔ ثابت از اینجا، بازه‌ای
// می‌ساخت که ممکن است برای این قرارداد اصلاً وجود نداشته باشد.

const legIns = (row) => (row.__legs || [])
  .filter((leg) => leg.kind !== 'underlying' && leg.ins)
  .map((leg) => String(leg.ins));

/** آیا این ردیف اصلاً قابل انتقال است؟ */
export function canHandoff(row) {
  return !!row && !!row.uaIns && legIns(row).length > 0;
}

/**
 * نقشهٔ انتقال یک ردیف زنده.
 *
 * `units` انتخاب فراخواننده است، نه استخراج از نتیجه‌های ردیف: تب مبدأ حجم
 * زندهٔ خودش را می‌دهد (`row.qty`) و تب مقصد همان را در فرمش نشان می‌دهد و
 * قابل تغییر نگه می‌دارد. هیچ عددِ *نتیجه*‌ای منتقل نمی‌شود — همان قاعده‌ای
 * که بالا آمد.
 */
export function handoffPlan(row, opt = {}) {
  return {
    to: 'backtest', from: opt.from || 'strategy',
    uaIns: String(row.uaIns), uaName: row.underlying || 'نماد پایه',
    strategyId: opt.strategyId || row.strategyId || '',
    strategyName: row.strategy || opt.strategyName || '',
    legIns: legIns(row),
    comboName: row.legsText || '',
    entryDate: 'auto', exitDate: 'auto',
    entryBasis: opt.entryBasis || 'LAST',
    exitBasis: opt.exitBasis || 'LAST',
    units: Math.max(1, Math.trunc(Number(opt.units) || 1)),
    live: opt.live === true,
  };
}

/**
 * نقشهٔ انتقال یک بازپخش انتخاب‌شده از تحلیل تاریخی.
 *
 * برخلاف ردیف زنده، اینجا تاریخ و مبنای قیمت معلوم‌اند. فقط ورودی‌های
 * محاسبه منتقل می‌شوند و بک‌تست سریع نتیجه را از نو می‌سازد. قیمت دستی نیز
 * فقط وقتی معتبر و مثبت است همراه نقشه می‌رود؛ عدد خروجی مثل سود و بازده
 * عمداً جایی در این قرارداد ندارد.
 */
export function historyHandoffPlan({ ua, strategyId = '', strategyName = '', replay, args = {}, comboName = '', live = false } = {}) {
  const legs = replay?.priced || args?.legs || [];
  const manualEntry = Object.fromEntries(Object.entries(args?.manualEntry || {})
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)
    .map(([index, value]) => [String(index), Number(value)]));
  return {
    to: 'backtest', from: 'history',
    uaIns: String(ua?.ins || args?.baseIns || ''),
    uaName: String(ua?.name || 'نماد پایه'),
    strategyId: String(strategyId || ''), strategyName: String(strategyName || ''),
    legIns: legs.filter((leg) => leg?.kind !== 'underlying' && leg?.ins).map((leg) => String(leg.ins)),
    comboName: String(comboName || legs.map((leg) => leg?.name || '').filter(Boolean).join(' + ')),
    entryDate: Number(replay?.startDate || args?.startDate || 0),
    exitDate: Number(replay?.endDate || args?.endDate || 0),
    entryBasis: String(args?.entryBasis || 'LAST'),
    exitBasis: String(args?.exitBasis || 'LAST'),
    units: Math.max(1, Math.trunc(Number(args?.units) || 1)),
    manualEntry,
    autoRun: true,
    live: live === true,
  };
}

/** دکمهٔ آمادهٔ درج در پنل جزئیات. */
export const handoffButtonHtml = (id = 'to-backtest') =>
  `<button type="button" class="ghost handoff-btn" id="${id}">
     بررسی تاریخی در بک‌تست
   </button>`;
