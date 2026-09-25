// تکمیلِ خودکارِ روزهای جامانده — تا نمودار بریدگی نداشته باشد (R5-20)
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «هدف من این است که هرجا نمودار کشیده می‌شود یا دیتای جدولی هست، دیتا
// کامل باشد و بریدگی نداشته باشد.»
//
// از R5-19 آزمایشگاه روزی را که ریزمعامله‌اش کامل نرسید رسم نمی‌کند و علتش
// را در جدولِ پوشش می‌نویسد. این صادق است ولی کامل نیست: روزِ «خطای دریافت»
// تا وقتی کاربر خودش دوباره نزند خالی می‌ماند. تب خروجی از R5-17 دکمهٔ
// «تلاش تکمیلی» دارد؛ اینجا کاربر نباید بداند کِی و چند بار بزند.
//
// ═══ دو نوع جاماندن، دو مکث ═══
//
// سهمیهٔ بالادست وقتی بسته شود دست‌کم نیم ساعت می‌ماند (R5-08، آزمونِ
// واقعی). تلاشِ زود فقط پنجره را تمدید می‌کند، پس مکثِ پس از سهمیه از
// پنج دقیقه شروع می‌شود و تا یک ربع بالا می‌رود. خطای گذرا (مهلت، ۵۰۲)
// همان مکثِ فزایندهٔ تب خروجی را می‌گیرد: از نیم دقیقه.
//
// ═══ کِی بس است ═══
//
// - همهٔ روزها رسید، یا هر جامانده‌ای واقعیتِ بازار شد (بی‌معامله)؛
// - دو دورِ پیاپیِ بی‌سهمیه هیچ روزی پر نکردند — بالادست همان جواب را
//   می‌دهد و تکرار فقط سهمیه می‌سوزاند؛ دورِ پشتِ سهمیه بی‌ثمر شمرده
//   نمی‌شود، چون اصلاً پرسیده نشده؛
// - سقفِ دورها پر شد (حدود یک ساعت و نیم با مکثِ سهمیه).
//
// هر توقف علتِ خودش را دارد تا کاربر بداند دوباره زدن فایده دارد یا نه.

import { TF_DAY_STATUS } from './backtest.mjs';
import { refillDelayMs } from './refill-queue.mjs';

/** بیشترین دورِ خودکار؛ پس از آن کاربر خودش تصمیم می‌گیرد. */
export const AUTO_FILL_MAX_ROUNDS = 8;

/** دورهای پیاپیِ بی‌ثمر (نه پشتِ سهمیه) که یعنی «بالادست ندارد». */
export const AUTO_FILL_BARREN = 2;

/** وضعیت‌هایی که «نرسید» معنی می‌دهند، نه «معامله نشد». */
const RETRYABLE = new Set([TF_DAY_STATUS.FAILED, TF_DAY_STATUS.BASE_GAP]);

/** روزهایی از جدولِ پوشش که هنوز باید دوباره پرسیده شوند. */
export function fillPending(coverage = []) {
  return (coverage || [])
    .filter((row) => RETRYABLE.has(String(row?.status || '')))
    .map((row) => Number(row.date))
    .filter(Boolean);
}

/**
 * مکث تا دورِ بعد.
 *
 * `round` شمارهٔ دوری است که تازه تمام شد (از ۱).
 */
export function fillDelayMs({ round = 1, throttled = false } = {}) {
  const step = Math.max(1, Math.trunc(Number(round) || 1));
  if (throttled) return Math.min(15 * 60000, 5 * 60000 * step);
  return refillDelayMs(step);
}

/**
 * پس از هر دور: ادامه، یا توقف با علت.
 *
 * `pending` جامانده‌های پس از این دور است و `filled` تعداد روزهایی که همین
 * دور پر کرد. `barren` شمارندهٔ دورهای بی‌ثمرِ پیاپی تا پیش از این دور.
 */
export function fillNext({ round = 1, pending = 0, filled = 0, throttled = false, barren = 0 } = {}) {
  const left = Math.max(0, Math.trunc(Number(pending) || 0));
  if (!left) return { stop: true, reason: 'done', barren: 0 };
  // دورِ پشتِ سهمیه چیزی نپرسیده؛ بی‌ثمر حسابش کردن یعنی سهمیه را با
  // «بالادست ندارد» یکی گرفتن — همان خطایی که R5-08 از خروجی برداشت.
  const nextBarren = filled > 0 ? 0 : throttled ? barren : barren + 1;
  if (nextBarren >= AUTO_FILL_BARREN) return { stop: true, reason: 'barren', barren: nextBarren };
  if (round >= AUTO_FILL_MAX_ROUNDS) return { stop: true, reason: 'rounds', barren: nextBarren };
  return { stop: false, wait: fillDelayMs({ round, throttled }), barren: nextBarren };
}

const fa = (value) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** جملهٔ توقف، برای کاربر. */
export function fillStopText(reason, left = 0) {
  const n = fa(Math.max(0, Math.trunc(Number(left) || 0)));
  if (reason === 'done') return 'همهٔ روزهای بازه کامل رسید.';
  if (reason === 'barren') {
    return `${n} روز پس از دو تلاشِ پیاپی هم کامل نرسید — بالادست همان پاسخ را می‌دهد.`
      + ' بعداً دوباره «تحلیل کل بازه» را بزنید.';
  }
  if (reason === 'rounds') {
    return `${n} روز پس از ${fa(AUTO_FILL_MAX_ROUNDS)} دورِ خودکار هنوز نرسید.`
      + ' سهمیهٔ بالادست احتمالاً هنوز بسته است؛ بعداً دوباره «تحلیل کل بازه» را بزنید.';
  }
  if (reason === 'stopped') return `تکمیل خودکار متوقف شد؛ ${n} روز هنوز جامانده است.`;
  return '';
}
