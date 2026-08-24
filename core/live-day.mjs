// روز جاری، از عکس لحظه‌ای تابلو.
//
// چرا لازم شد: «تحلیل تاریخی استراتژی» و «آزمون همه استراتژی‌ها» هر دو از
// فهرست روزانهٔ بسته‌شده تغذیه می‌شوند و همیشه یک روز عقب‌اند. کاربر
// می‌خواهد همان تحلیل را از روز مبدأ تا همین لحظه هم ببیند، بدون آنکه
// حالت قبلی را از دست بدهد.
//
// عکس دیده‌بان اختیار همان چیزی است که تب رصد لحظه‌ای می‌بیند: یک درخواست
// بالادست که هر قرارداد و هر نماد پایه را با قیمت و حجم امروز می‌دهد. پس
// «تا همین لحظه» به‌جای صدها درخواست تازه، از همان یک عکس ساخته می‌شود.
//
// سه تصمیم که تمام سختی این فایل در آن‌هاست:
//
// ۱. ابزاری که امروز معامله نشده، ردیف نمی‌گیرد. تابلو برای آن هم قیمت
//    می‌دهد — قیمت دیروز که به امروز منتقل شده. نوشتنش به‌عنوان «قیمت
//    امروز» یعنی ساختن عددی که هیچ‌کس آن را معامله نکرده (قاعدهٔ ۲-۴).
//
// ۲. «اولین»، «کمترین» و «بیشترین» خالی می‌مانند. عکس تابلو این سه را
//    ندارد. خالی‌شان می‌گذاریم تا `historyPrice` همان «فاقد داده» را بدهد
//    و آن مبناها روز جاری را اصلاً پیشنهاد نکنند — به‌جای اینکه با «آخرین»
//    پر شوند و کاربر خیال کند کمترین قیمت روز را در دست دارد.
//
// ۳. عکس تابلو تاریخ ندارد. تاریخ را از ساعت مشاهده می‌سازیم، ولی فقط
//    وقتی مطمئنیم عکس به **امروز** می‌چسبد. پیش از باز شدن بازار و در روز
//    غیرمعاملاتی، همان عکس محتوای جلسهٔ **قبلی** را نشان می‌دهد؛ مهر امروز
//    زدن رویش یعنی ساختن یک روز معاملاتی که وجود نداشته.

import { normalizeHistoryDate } from './history.mjs';

const n = (value) => {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
};

/** روز تهران به شکل YYYYMMDD میلادی. صفر یعنی ساعتِ ورودی خوانده نشد. */
export function tehranDateNumber(at = Date.now()) {
  const time = Number(at);
  if (!Number.isFinite(time)) return 0;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(time)).filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return Number(`${parts.year || ''}${parts.month || ''}${parts.day || ''}`) || 0;
}

// فازهایی که در آن‌ها عکس تابلو به **امروز** تعلق دارد:
//
// - `open`   جلسه در جریان است.
// - `after`  جلسهٔ امروز تمام شده و تابلو ارقام نهایی همین امروز را نگه
//            داشته؛ این همان حالتی است که کاربر عصر می‌خواهد ببیند.
// - `ungated` اپراتور دروازهٔ ساعات بازار را عمداً خاموش کرده؛ تصمیم صریح
//            خودش است و ما رویش قضاوت نمی‌کنیم.
//
// و آن‌ها که تعلق ندارد: `before` (بازار هنوز باز نشده، تابلو مال جلسهٔ
// دیروز است) و `holiday` (اصلاً جلسه‌ای در کار نیست).
export const LIVE_DAY_PHASES = ['open', 'after', 'ungated'];

/**
 * روزی که باید روی عکس تابلو مهر شود.
 *
 * `ok: false` یعنی «نمی‌دانیم این عکس مال کدام روز است»، نه «خطا». فراخوان
 * باید همان داده‌های بسته‌شده را نگه دارد و دلیل را به کاربر بگوید.
 */
export function liveDayOf(market = {}, at = Date.now()) {
  const phase = String(market?.phase || '');
  const why = String(market?.why || '');
  if (!LIVE_DAY_PHASES.includes(phase)) return { ok: false, date: 0, phase, why };
  const date = tehranDateNumber(at);
  if (!date) return { ok: false, date: 0, phase, why: 'ساعت عکس لحظه‌ای خوانده نشد' };
  return { ok: true, date, phase, why };
}

/**
 * یک ابزار از یک ردیف دیده‌بان. `null` یعنی امروز معامله نشده یا عددی
 * برای گفتن ندارد — و آن هم ردیف نمی‌گیرد.
 */
function boardRow(row, suffix, date) {
  const vol = n(row[`qTotTran5J_${suffix}`]);
  const trades = n(row[`zTotTran_${suffix}`]);
  // نه حجمی، نه معامله‌ای: تابلو فقط قیمت دیروز را حمل می‌کند
  if (!(vol > 0) && !(trades > 0)) return null;
  const last = n(row[`pDrCotVal_${suffix}`]);
  const close = n(row[`pClosing_${suffix}`]);
  if (!(last > 0) && !(close > 0)) return null;
  return {
    date, close, last, yday: n(row[`priceYesterday_${suffix}`]),
    // این سه را تابلو نمی‌دهد؛ صفر می‌مانند تا «فاقد داده» خوانده شوند
    first: 0, low: 0, high: 0,
    vol, trades, value: n(row[`qTotCap_${suffix}`]),
    live: true,
  };
}

/**
 * ردیف امروزِ هر ابزاری که در عکس تابلو واقعاً معامله شده.
 *
 * کلید، همان کد ابزاری است که `buildChain` هم با آن کار می‌کند، پس خروجی
 * مستقیماً روی `seriesByIns` می‌نشیند.
 */
export function liveDayRows(rows = [], { date } = {}) {
  const day = normalizeHistoryDate(date);
  const out = {};
  if (!day) return out;
  for (const row of rows || []) {
    for (const [key, suffix] of [['uaInsCode', 'UA'], ['insCode_C', 'C'], ['insCode_P', 'P']]) {
      const ins = String(row?.[key] ?? '').trim();
      if (!ins || out[ins]) continue;
      const built = boardRow(row, suffix, day);
      if (built) out[ins] = built;
    }
  }
  return out;
}

/**
 * سری‌های روزانه به‌علاوهٔ ردیف امروز.
 *
 * ورودی دست نمی‌خورد. اگر فهرست روزانه خودش ردیف امروز را داشته باشد،
 * ردیف تازه رویش می‌نشیند ولی «اولین/کمترین/بیشترین» آن حفظ می‌شود: عکس
 * تابلو این سه را ندارد و دور ریختنشان اطلاعات کم می‌کند، نه اضافه.
 *
 * فقط ابزارهایی که فراخوان خودش خواسته (کلیدهای `seriesByIns`) به‌روز
 * می‌شوند؛ عکس تابلو کل بازار است و ما بقیه را وارد این تحلیل نمی‌کنیم.
 */
export function mergeLiveDay(seriesByIns = {}, liveByIns = {}, { date } = {}) {
  const day = normalizeHistoryDate(date);
  const series = {};
  let added = 0, updated = 0, untouched = 0;
  for (const [ins, rows] of Object.entries(seriesByIns || {})) {
    const live = day ? liveByIns?.[ins] : null;
    if (!live) { series[ins] = rows; untouched += 1; continue; }
    const list = rows || [];
    const official = list.find((row) => normalizeHistoryDate(row.date) === day) || null;
    if (official) updated += 1; else added += 1;
    const keep = (fresh, old) => (fresh > 0 ? fresh : n(old));
    const merged = {
      ...(official || {}), ...live,
      first: keep(live.first, official?.first),
      low: keep(live.low, official?.low),
      high: keep(live.high, official?.high),
    };
    series[ins] = [...list.filter((row) => normalizeHistoryDate(row.date) !== day), merged]
      .sort((a, b) => normalizeHistoryDate(a.date) - normalizeHistoryDate(b.date));
  }
  return { series, added, updated, untouched, date: day };
}
