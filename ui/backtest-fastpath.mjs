// مسیرِ تندِ آزمایشگاه — وقتی می‌دانیم کاربر دنبالِ کدام ترکیب است.
//
// ═══ ایرادی که این ماژول برای آن ساخته شد ═══
//
// گزارش ۱۴۰۵/۰۶/۱۷: کلیک روی «آزمایشگاه آپشن» از رصد زنده، **۳۰ تا ۳۶
// ثانیه** طول می‌کشید و صفحه هنگ‌زده به نظر می‌رسید. چهار ریشه، همه از یک
// جنس: **کارِ کامل برای پرسشِ کوچک.**
//
//   ۳۵۵ نماد تاریخچه گرفته می‌شد، برای ترکیبی که دو پا دارد.
//   ۱۱۲۵ روز سنجیده می‌شد، در حالی که بازهٔ انتخابی ۳۱۱ روز بود.
//   برای هر یک از آن روزها همهٔ ترکیب‌ها ساخته و ارزیابی می‌شدند —
//   حدود ۲۵۴ هزار ارزیابی در مرورگر، تنها همین ۲۵ ثانیه.
//
// ولی وقتی نقشهٔ انتقال `legIns` را با خودش می‌آورد، پرسش این نیست که «چه
// ترکیب‌هایی ممکن است»؛ پرسش این است که «**این** ترکیب در کدام روزها قیمت
// دارد». جوابش خطی است، نه ضرب‌در-ترکیب.
//
// فهرستِ کاملِ ترکیب‌ها حذف نمی‌شود — فقط تا وقتی کسی نخواسته ساخته نمی‌شود.

import { normalizeHistoryDate } from '../core/history.mjs';

/**
 * روزهای داخلِ بازهٔ انتخابی.
 *
 * `/api/dailies?n=0` کلِ تاریخِ موجود را می‌دهد و این درست است — سریِ هر
 * قرارداد از روزِ اولش می‌آید. ولی سنجیدنِ روزهایی که کاربر اصلاً انتخاب
 * نکرده، کارِ بی‌مصرف است: ۱۱۲۵ روز به‌جای ۳۱۱.
 *
 * بازهٔ نداشته یعنی «همه» — نه «هیچ».
 */
export function clipDates(dates = [], range = null) {
  const list = (Array.isArray(dates) ? dates : []).map(normalizeHistoryDate).filter(Boolean);
  const from = normalizeHistoryDate(range?.from);
  const to = normalizeHistoryDate(range?.to);
  if (!from && !to) return list;
  return list.filter((date) => (!from || date >= from) && (!to || date <= to));
}

/**
 * روزهایی که **این** ترکیب در آن‌ها کامل قیمت دارد.
 *
 * جانشینِ `findExecutableDates` در مسیرِ تند. آن یکی برای هر روز همهٔ
 * ترکیب‌های ممکن را می‌سازد چون نمی‌داند کاربر کدام را می‌خواهد؛ اینجا
 * می‌دانیم، پس فقط همان چند پا سنجیده می‌شوند.
 *
 * ترتیبِ خروجی همان ترتیبِ ورودی است — چرخِ تاریخ روی همین می‌نشیند.
 */
export function comboEntryDates(legIns = [], dates = [], hasPrice = () => false) {
  const legs = (Array.isArray(legIns) ? legIns : []).map(String).filter(Boolean);
  const list = (Array.isArray(dates) ? dates : []).map(normalizeHistoryDate).filter(Boolean);
  if (!legs.length) return [];
  return list.filter((date) => legs.every((ins) => hasPrice(ins, date) === true));
}

/**
 * کمینهٔ کدهایی که مسیرِ تند لازم دارد: نماد پایه و پاهای همین ترکیب.
 *
 * تکراری‌ها و خالی‌ها می‌افتند، و نماد پایه همیشه اول است تا «روزِ مرجع» در
 * `loadHistoricalDailies` از سریِ خودش خوانده شود.
 */
export function fastPathCodes(uaIns, legIns = []) {
  const base = String(uaIns ?? '');
  const out = base ? [base] : [];
  for (const ins of (Array.isArray(legIns) ? legIns : [])) {
    const code = String(ins ?? '');
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}
