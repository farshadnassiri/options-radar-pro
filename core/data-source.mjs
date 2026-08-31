// نشانیِ دقیقی که هر عدد از آن آمد — یا نیامد.
//
// ═══ چرا این فایل هست ═══
//
// خروجی می‌گفت «۲۷ قرارداد قیمت ورود نداشت» و بعد نامشان را هم گفت. ولی
// هنوز یک حلقه کم بود: صاحب پروژه نمی‌توانست **خودش برود ببیند**. برای
// راستی‌آزماییِ یک ردیف باید کد نماد را برمی‌داشت، مسیر بالادست را از
// حفظ می‌ساخت، و امیدوار بود همان را ساخته باشد که برنامه ساخته.
//
// حالا نشانی کامل در خودِ فایل است. یک ردیف برای هر قرارداد — **چه داده
// آمده باشد چه نیامده** — با همان `n` و همان ترتیبِ اجزایی که برنامه
// استفاده کرد. اگر نشانی را باز کنی و داده ببینی ولی ستون «وضعیت» بگوید
// خالی، آن یک باگ واقعی است و همان‌جا دستت است.
//
// ═══ مرزی که رد نمی‌شود ═══
//
// نشانی از همان اجزایی ساخته می‌شود که درخواست واقعی از آن ساخته شد، نه
// از یک الگوی جداگانه. الگوی دوم یعنی روزی که مسیر بالادست عوض شود، فایل
// نشانیِ درستی نشان می‌دهد که هرگز صدا زده نشده — بدترین شکل ممکن برای
// یک سند راستی‌آزمایی.

import { num } from './num.mjs';

/**
 * کد ابزارِ معتبر، وگرنه `null`.
 *
 * ═══ چرا پاک‌سازی نه، رد کردن ═══
 *
 * نسخهٔ اولِ همین فایل رقم‌های غیرعددی را با `replace(/[^\d]/g, '')`
 * می‌انداخت. روی کد واقعی که همه‌اش رقم است بی‌اثر بود، ولی روی کد خراب
 * فاجعه می‌ساخت: `c20260916_26` و `t20260916_26` هر دو به
 * `2026091626` تبدیل می‌شدند — **یک نشانی برای دو قرارداد، و هیچ‌کدام
 * نشانیِ خودشان**.
 *
 * برای برگی که تمامِ کارش راستی‌آزمایی است، این بدترین شکل خرابی است:
 * کاربر نشانی را باز می‌کند، دادهٔ ابزارِ دیگری می‌بیند، و بر پایهٔ آن
 * دربارهٔ درستیِ برنامه قضاوت می‌کند.
 *
 * سرور هم همین قاعده را دارد (`validIns`) و کد غیررقمی را اصلاً به
 * بالادست نمی‌فرستد؛ پس نشانی‌ای که اینجا ساخته شود، نشانیِ درخواستی
 * می‌بود که هرگز نرفته است.
 */
export function insCode(value) {
  const s = String(value ?? '').trim();
  return /^\d+$/.test(s) ? s : null;
}

/** تاریخ فشردهٔ هشت‌رقمی، وگرنه `null`. */
export function compactDate(value) {
  const s = String(value ?? '').trim();
  return /^\d{8}$/.test(s) ? s : null;
}

/** مسیرِ سابقهٔ روزانه — همان که موتور بک‌تست از آن قیمت می‌گیرد. */
export function dailyListPath(ins, n = 0) {
  const code = insCode(ins);
  return code ? `/ClosingPrice/GetClosingPriceDailyList/${code}/${Math.max(0, Math.trunc(num(n, 0)))}` : null;
}

/** مسیرِ ریزمعاملهٔ یک روزِ تکمیل‌شده — فقط وقتی «لحظهٔ سنجش» انتخاب شده. */
export function tradeHistoryPath(ins, date) {
  const code = insCode(ins);
  const day = compactDate(date);
  return code && day ? `/Trade/GetTradeHistory/${code}/${day}/true` : null;
}

/** مسیر محلی که مرورگر واقعاً صدا می‌زند؛ سرور از آن به بالادست می‌رود. */
export const localDailyPath = (ins, n = 0) => `/api/dailies?ins=${encodeURIComponent(String(ins))}&n=${Math.max(0, Math.trunc(num(n, 0)))}`;
export const localTradePath = (ins, date) => `/api/trades?ins=${encodeURIComponent(String(ins))}&date=${encodeURIComponent(String(date))}`;

/**
 * چسباندن نشانی پایه به مسیر، بی‌آنکه اسلشِ دوتایی یا افتاده بسازد.
 *
 * نشانی پایه از تنظیمات سرور می‌آید و کاربر می‌تواند عوضش کند؛ پس نه
 * می‌شود فرض کرد اسلش پایانی دارد و نه فرض کرد ندارد.
 */
export function joinUrl(base, path) {
  const head = String(base ?? '').trim().replace(/\/+$/, '');
  const tail = String(path ?? '').trim();
  if (!head) return tail;
  return `${head}${tail.startsWith('/') ? '' : '/'}${tail}`;
}

/**
 * نشانی کامل، یا جمله‌ای که می‌گوید چرا نشانی‌ای نیست.
 *
 * جای خالی گذاشتن کافی نبود: ستونِ خالی در میان هفتاد ردیفِ پر، به‌چشم
 * «فراموش شد» می‌آید نه «کد خراب بود».
 */
export const NO_URL = 'کد ابزار معتبر نیست — نشانی ساخته نشد';

export function urlOf(base, path) {
  return path ? joinUrl(base, path) : NO_URL;
}

/** وضعیتِ یک سری: خطا خورد، خالی برگشت، یا داده آمد. */
export function seriesStatus(rows, error) {
  if (error) return 'خطا';
  if (!Array.isArray(rows)) return 'درخواست نرفت';
  if (!rows.length) return 'خالی — هیچ روزی معامله نشده';
  return 'داده آمد';
}

/**
 * یک ردیف برای هر ابزار، با نشانیِ کاملِ بالادست و مسیر محلی.
 *
 * نماد پایه هم می‌آید: قیمتش مخرجِ هر درصدی در این فایل است و اگر سریِ
 * آن ناقص باشد، هیچ ردیف دیگری قابل اعتماد نیست.
 *
 * `markDate` وقتی مقدار دارد که کاربر «لحظهٔ سنجش» را از پایان روز به
 * ساعتی مشخص برده باشد؛ آن‌وقت برای هر ابزار یک نشانی دوم هم هست.
 */
export function dataSourceRows({
  base = '', ua = null, contracts = [], seriesByIns = {}, errors = {}, markDate = 0, n = 0,
} = {}) {
  const out = [];
  const add = (role, item) => {
    const ins = String(item.ins ?? '');
    if (!ins) return;
    const rows = seriesByIns[ins];
    const error = errors[ins] || '';
    const dates = Array.isArray(rows)
      ? rows.map((row) => num(row?.date, 0)).filter((d) => d > 0).sort((a, b) => a - b)
      : [];
    out.push({
      role,
      name: item.name ?? '',
      kind: item.kind ?? '',
      strike: num(item.strike, 0) || null,
      expiry: num(item.expiry, 0) || null,
      ins,
      purpose: 'سابقهٔ روزانه — مبنای قیمت ورود و خروج',
      url: urlOf(base, dailyListPath(ins, n)),
      local: localDailyPath(ins, n),
      status: seriesStatus(rows, error),
      rows: Array.isArray(rows) ? rows.length : null,
      firstDate: dates.length ? dates[0] : null,
      lastDate: dates.length ? dates[dates.length - 1] : null,
      error,
    });
    if (num(markDate, 0) > 0) {
      out.push({
        role,
        name: item.name ?? '',
        kind: item.kind ?? '',
        strike: num(item.strike, 0) || null,
        expiry: num(item.expiry, 0) || null,
        ins,
        purpose: 'ریزمعاملهٔ روز سنجش — برای «لحظهٔ سنجش»',
        url: urlOf(base, tradeHistoryPath(ins, markDate)),
        local: localTradePath(ins, markDate),
        status: '—',
        rows: null, firstDate: null, lastDate: null, error: '',
      });
    }
  };

  if (ua?.ins) add('نماد پایه', { ins: ua.ins, name: ua.name });
  for (const contract of contracts) add('اختیار', contract);
  return out;
}

/** یک جمله برای بالای برگ — چند ابزار، چند تای‌شان داده گرفتند. */
export function sourceSummary(rows = []) {
  const daily = rows.filter((row) => row.purpose.startsWith('سابقهٔ روزانه'));
  const ok = daily.filter((row) => row.status === 'داده آمد').length;
  const empty = daily.filter((row) => row.status.startsWith('خالی')).length;
  const failed = daily.filter((row) => row.status === 'خطا').length;
  return { total: daily.length, ok, empty, failed };
}
