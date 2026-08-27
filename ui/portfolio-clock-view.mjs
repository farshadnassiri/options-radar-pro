// مدل نمایش ساعت جلسه — برش ششم فاز ۵.
//
// موتورها آماده بودند: ساعت جلو می‌رود، عکسِ هر لحظه ساخته می‌شود، و
// همهٔ موتورها روی لحظهٔ دلخواه کار می‌کنند. ولی هیچ‌کدام از رابط صدا
// زده نمی‌شدند و تب جلسه را در لحظهٔ شروع میخ‌کوب نگه داشته بود.
//
// چهار مرز:
//
// **پله‌ای که ممکن نیست، غیرفعال می‌شود — با علت.** دکمه‌ای که بزنی و
// خطا بدهد، همان کار را می‌کند که دکمهٔ خاموش می‌کرد، فقط دیرتر و با
// یک قدم اضافه. علتش را همان‌جا می‌گوییم.
//
// **امکانِ هر پله را از خودِ موتور می‌پرسیم.** «خشک» اجرا می‌شود:
// `stepPortfolioSession` صدا زده می‌شود و جلسهٔ برگشتی دور ریخته
// می‌شود. قاعدهٔ دومِ «کدام پله ممکن است» یعنی روزی دکمه‌ای فعال باشد
// که موتور ردش می‌کند.
//
// **پله‌ها از موتور می‌آیند.** فهرست دستی یعنی روزی رابط پله‌ای نشان
// می‌دهد که موتور نمی‌شناسد.
//
// **اینجا هیچ گامی برداشته نمی‌شود.** این ماژول فقط می‌گوید چه ممکن
// است؛ برداشتنِ گام کار تب است.

import { faDigits } from './fmt.mjs';
import { historyDateLabel } from '../core/history.mjs';
import {
  PORTFOLIO_STEPS, stepPortfolioSession,
} from '../core/portfolio-clock.mjs';

const text = (value) => String(value ?? '').trim();
const pad2 = (value) => faDigits(String(Math.max(0, Math.trunc(value))).padStart(2, '0'));

/** تاریخ و ساعت یک لحظه، فارسی. */
export function momentText(at) {
  if (!at?.date) return '—';
  const second = Number(at.second) || 0;
  return `${faDigits(historyDateLabel(at.date))} · `
    + `${pad2(Math.trunc(second / 3600))}:${pad2(Math.trunc((second % 3600) / 60))}`;
}

/**
 * وضعیت ساعت جلسه و پله‌های ممکن.
 *
 * `days` همان تقویم تب است. برای هر پله یک اجرای خشک انجام می‌شود تا
 * معلوم شود ممکن است یا نه — و اگر نه، چرا.
 */
export function portfolioClockView(session, { days = [], expiryDate = 0 } = {}) {
  const now = session?.now ?? null;
  const steps = PORTFOLIO_STEPS.map((step) => {
    const dry = stepPortfolioSession(session, step.key, { days, expiryDate });
    return {
      key: step.key,
      label: faDigits(text(step.label)),
      enabled: dry.ok,
      // علتِ خاموش‌بودن روی همان دکمه می‌ماند، نه جای دیگر.
      why: dry.ok ? '' : faDigits(text(dry.why)),
      reason: dry.reason,
      toText: dry.ok ? momentText(dry.to) : '',
      rolled: Boolean(dry.rolled),
      atEnd: Boolean(dry.atEnd),
    };
  });
  const usable = steps.filter((step) => step.enabled);
  return {
    ok: Boolean(now?.date),
    now,
    nowText: momentText(now),
    steps,
    anyEnabled: usable.length > 0,
    // وقتی هیچ پله‌ای ممکن نیست، سکوت یعنی کاربر فکر می‌کند رابط خراب
    // است. علتِ مشترک همان چیزی است که باید گفت.
    blockedWhy: usable.length ? '' : (steps.find((step) => step.why)?.why || ''),
  };
}

/**
 * خبرِ یک گامِ انجام‌شده یا شکست‌خورده.
 *
 * «تقویم تمام شد» و «از پایان جلسه رد می‌شود» دو چیزند و دو پیام
 * می‌گیرند: اولی یعنی داده نداریم، دومی یعنی جلسه همین‌قدر بود.
 */
export function stepResultText(result) {
  if (!result) return '';
  if (result.ok) {
    return `جلسه به ${momentText(result.to)} رفت`
      + (result.rolled ? ' · به ابتدای روز معاملاتی بعد منتقل شد' : '')
      + (result.atEnd ? ' · این پایان جلسه است' : '');
  }
  return faDigits(text(result.why));
}
