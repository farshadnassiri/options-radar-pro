// تغییر قیمت — یک مبنا در سراسر برنامه: **پایانی روز قبل**.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۳): «هر جا قیمت را نشان می‌دهی، آخرین قیمت و
// قیمت پایانی را هم بگذار همراه با درصد تغییرات… درصد تغییرات نسبت به قیمت
// پایانی روز قبل محاسبه می‌شود (در سراسر برنامه).»
//
// پیش از این چند مبنا کنار هم بود: «تغییر از اولین معامله» در نوار
// ریزمعامله، «آخرین نسبت به آخرینِ دیروز» در کارت روز استرانگل بازی، و
// «آخرین، یا پایانی اگر معامله نشد» در جدول‌ها. حالا هر درصد تغییر روزانه
// از همین ماژول می‌آید و مخرجش همیشه پایانی روز قبل است.
//
// خالص است: نه DOM، نه شبکه.

const pos = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : NaN;
};

/** درصد تغییر یک قیمت نسبت به پایانی روز قبل؛ هر کدام نامعلوم، NaN. */
export function pctVsYesterday(price, yesterday) {
  const now = pos(price), prior = pos(yesterday);
  return now > 0 && prior > 0 ? ((now / prior) - 1) * 100 : NaN;
}

/**
 * دو قیمت روز یک نماد، هر کدام با تغییرش نسبت به پایانی روز قبل.
 *
 * «آخرین» فقط قیمت معامله است: اگر ردیف `tradeLast` دارد (جدول‌هایی که
 * `last` را در نبود معامله با پایانی پر می‌کنند) همان خوانده می‌شود، وگرنه
 * `last`. روزی که معامله نشده، «آخرین» نامعلوم می‌ماند و جایش پایانی
 * نمی‌نشیند. مبنا `yday` است؛ اگر نیامده و `prevClose` داده شده (سری روزانه
 * که پایانی روز معاملاتی قبل را دارد) همان.
 */
export function dayQuote(row = {}, { prevClose = NaN } = {}) {
  const last = 'tradeLast' in (row || {}) ? pos(row.tradeLast) : pos(row?.last);
  const close = pos(row?.close);
  const yday = pos(row?.yday) > 0 ? pos(row.yday) : pos(prevClose);
  return {
    last, close, yday,
    lastPct: pctVsYesterday(last, yday),
    closePct: pctVsYesterday(close, yday),
    lastChange: last > 0 && yday > 0 ? last - yday : NaN,
    closeChange: close > 0 && yday > 0 ? close - yday : NaN,
  };
}

/**
 * پایانی روز قبلِ یک تاریخ از سری روزانهٔ یک نماد: `yday` ردیف همان روز،
 * وگرنه پایانی آخرین روز معاملاتیِ پیش از آن. هیچ‌کدام، NaN — عدد ساخته
 * نمی‌شود. `date` به شکل YYYYMMDD میلادی، مثل `row.date` سری روزانه.
 */
export function ydayFromSeries(rows = [], date) {
  const want = Number(date);
  let prev = NaN;
  for (const row of rows || []) {
    const d = Number(row?.date);
    if (d === want) return pos(row.yday) > 0 ? pos(row.yday) : prev;
    if (d < want && pos(row.close) > 0) prev = pos(row.close);
  }
  return NaN;
}

/** همان، برای چند نماد: `{ ins: پایانی روز قبل }`. */
export function ydayMap(seriesByIns = {}, codes = [], date) {
  const out = {};
  for (const ins of codes) {
    const v = ydayFromSeries(seriesByIns?.[String(ins)] || [], date);
    if (v > 0) out[String(ins)] = v;
  }
  return out;
}
