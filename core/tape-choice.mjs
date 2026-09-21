// کدام پاسخِ بالادست را باور کنیم — و چطور بفهمیم هیچ‌کدام کافی نیست.
//
// ═══ F-01 آزمونِ عملیِ ۱۴۰۵/۰۶/۲۹ ═══
//
// نمونهٔ واقعی، اهرم `17914401175772326` در `20260919`:
//
//   مسیر `true`    ۲٬۵۲۱ معامله /  ۱۱٬۳۸۲٬۵۸۵ حجم   ← برنامه همین را برداشت
//   مسیر `false`   ۷٬۷۳۶ معامله /  ۷۳٬۳۰۵٬۲۲۴ حجم
//   تابلوی روزانه  ۷٬۷۳۶ معامله /  ۷۳٬۳۰۵٬۲۲۴ حجم
//
// یعنی پاسخِ اول **غیرخالی ولی بریده** بود و منطقِ قبلی — «اگر اولی ردیف
// داشت، همان» — ۵٬۲۱۵ معامله را دور ریخت. در هر شش نمونهٔ آزمون همین شد.
//
// درسِ اصلی، و چیزی که این ماژول را لازم کرد: **غیرخالی‌بودن معیارِ
// کامل‌بودن نیست.** اولین و آخرین ساعتِ هر دو مسیر یکی بود (۰۹:۰۱:۰۵ تا
// ۱۲:۲۹:۵۶) و هر دو ۱۸۰ شمعِ یک‌دقیقه‌ای می‌ساختند؛ پوششِ ظاهریِ ابتدا و
// انتهای روز چیزی دربارهٔ معاملاتِ میانی ثابت نمی‌کند. تنها مرجعِ بیرونی
// که این را می‌گزد، تابلوی روزانهٔ همان روز است.
//
// ═══ چرا جمعِ دو پاسخ ممنوع است ═══
//
// وسوسه‌اش هست: «هر دو را بگیر و ادغام کن». ولی پاسخِ خامِ `false` برای
// اهرم/۲۰۲۶۰۹۱۵ **۲۱٬۵۲۲** ردیف داشت که پس از حذف تکرارِ دقیق ۱۰٬۷۶۱
// معامله شد و دقیقاً با تابلو خواند. یعنی خودِ بالادست ردیف را دوبار
// می‌فرستد؛ جمعِ خامِ دو پاسخ عددی می‌سازد که هیچ‌جا وجود ندارد.
//
// پس قاعده این است: **انتخاب**، نه جمع. و انتخاب با مرجع سنجیده می‌شود،
// نه با «کدام بزرگ‌تر است».

import { num } from './num.mjs';

const n = (x) => num(x);

/** شمار معاملهٔ فعال، حجم و شمارِ باطل یک نوارِ نرمال‌شده. */
export function tapeMetrics(rows = []) {
  let trades = 0, volume = 0, canceled = 0;
  for (const row of rows || []) {
    if (row?.canceled === true) { canceled += 1; continue; }
    trades += 1;
    volume += n(row?.quantity);
  }
  return { trades, volume, canceled, total: (rows || []).length };
}

/**
 * انتظارِ تابلوی روزانه از پاسخ `GetClosingPriceDaily/{ins}/{date}`.
 *
 * `known:false` یعنی مرجعی در دست نیست — که «کامل است» معنی نمی‌دهد و
 * «ناقص است» هم نه. همین‌طور هم گزارش می‌شود.
 */
export function dailyExpectation(raw, date = 0) {
  const blank = (why = '') => ({ known: false, trades: 0, volume: 0, value: 0, ...(why ? { why } : {}) });
  const dict = raw && typeof raw === 'object'
    ? (Object.values(raw).find((v) => v && typeof v === 'object' && !Array.isArray(v)) || raw)
    : null;
  if (!dict) return blank();

  // ═══ چرا تاریخِ خودِ رکورد سنجیده می‌شود ═══
  //
  // فایلِ واقعیِ ۲۰۲۶۰۶۲۲ تا ۲۰۲۶۰۹۲۰ این را لو داد: برای اهرم در
  // `20260624` — که **روز معاملاتی نبود** — این endpoint رکوردِ
  // آخرین جلسه (`20260920`، با ۱٬۷۹۵ معامله و ۶٬۶۶۰٬۴۲۹ حجم) را
  // برگرداند، و ما آن را مرجعِ همان روز گرفتیم. نتیجه‌اش در برگ پوشش
  // این شد که برای هفت روزِ تعطیلِ اهرم نوشت «۱٬۷۹۵ معامله کسری داریم» —
  // عددی که هیچ‌جا وجود نداشت.
  //
  // این دقیقاً همان کلاسِ خطای بند ۵ ممیزیِ قبل است، یک endpoint آن‌طرف‌تر:
  // **عکسِ بی‌تاریخ یا بدتاریخ، رکوردِ آن روز نیست.** آنجا برای
  // `GetClosingPriceHistory` بسته شد و همین‌جا دوباره باز ماند.
  //
  // `dEven` در پاسخِ واقعی هست و همان تاریخِ درخواست‌شده را می‌گوید وقتی
  // رکورد واقعی باشد. پس مقایسه‌اش قطعی است، نه حدس.
  const wanted = Math.trunc(Number(date) || 0);
  const stamped = Math.trunc(Number(dict.dEven) || 0);
  if (wanted && stamped !== wanted) {
    return blank(stamped
      ? `تابلوی روزانه رکوردِ ${stamped} را داد، نه ${wanted}`
      : `تابلوی روزانه تاریخ نداشت، پس مرجعِ ${wanted} نیست`);
  }

  // ═══ صفرِ تأییدشده، در برابر صفرِ ساختهٔ ما ═══
  //
  // R3-03 بازآزماییِ دور سوم: طهرم۷۰۵۰ در `20260728` روزانهٔ **معتبر**
  // دارد — شناسه و تاریخِ درست — و در آن `zTotTran:0` و `qTotTran5J:0`
  // است، یعنی تابلو می‌گوید آن روز معامله‌ای نشده. ولی چون کد هر صفری را
  // «مرجع نداریم» می‌خواند، `/api/trades` جواب `verified:false` می‌داد و
  // هم‌زمان ممیزیِ خروجی همان را `quiet` یعنی «بدون معاملهٔ تأییدشده»
  // می‌خواند. یک واقعیت، دو حکم در دو لایه.
  //
  // تفکیکِ لازم این است: **نبودنِ میدان** با **صفر بودنِ میدان** یکی
  // نیست. اولی یعنی نمی‌دانیم، دومی یعنی تابلو گفت صفر. پس حضورِ میدان
  // سنجیده می‌شود، نه فقط مقدارش — وگرنه `Number(undefined) || 0` این دو
  // را برای همیشه یکی می‌کند.
  const hasCount = dict.zTotTran !== undefined && dict.zTotTran !== null;
  const hasVolume = dict.qTotTran5J !== undefined && dict.qTotTran5J !== null;
  if (!hasCount || !hasVolume) return blank('تابلوی روزانه شمار یا حجم نداشت');

  const trades = n(dict.zTotTran), volume = n(dict.qTotTran5J), value = n(dict.qTotCap);
  if (!Number.isFinite(trades) || !Number.isFinite(volume)) return blank();
  // صفرِ تأییدشده هم یک مرجع است — مرجعی که می‌گوید «هیچ».
  if (!trades && !volume) return { known: true, quiet: true, trades: 0, volume: 0, value: 0 };
  return { known: true, quiet: false, trades, volume, value };
}

/**
 * همان انتظار، از ردیفِ **نرمال‌شدهٔ** روزانه (`/api/dailies`).
 *
 * سرور روزانه را به `{date, trades, vol, value}` ترجمه می‌کند، پس
 * مصرف‌کنندهٔ مرورگر شکلِ خامِ بالادست را در دست ندارد. دو ورودی، یک
 * معنی — و هر دو از یک تابعِ سنجش می‌گذرند تا حکم‌ها از هم دور نیفتند.
 */
export function expectationFromDailyRow(row) {
  if (!row || typeof row !== 'object') return { known: false, quiet: false, trades: 0, volume: 0, value: 0 };
  const trades = n(row.trades), volume = n(row.vol);
  // ردیفِ نرمال‌شده از `trustedDailyRows` گذشته، پس تاریخش معتبر است و
  // عکسِ پیش‌جلسه نیست. صفرش هم صفرِ تأییدشده است، نه «نمی‌دانیم».
  if (!trades && !volume) return { known: true, quiet: true, trades: 0, volume: 0, value: 0 };
  return { known: true, quiet: false, trades, volume, value: n(row.value) };
}

/**
 * آیا این نوار با تابلو می‌خواند.
 *
 * ═══ چرا حجم معیارِ اول است ═══
 *
 * نمی‌دانیم تابلو معاملهٔ باطل را می‌شمارد یا نه، ولی حجمِ باطل صفر است.
 * پس حجم معیارِ تمیزتری است: وقتی دقیقاً می‌خواند، اختلافِ شمار تا اندازهٔ
 * ردیف‌های باطل توضیح دارد. بیشتر از آن، توضیح ندارد.
 */
export function tapeMatchesDaily(metrics, expect) {
  if (!expect?.known) return false;
  // مرجعی که می‌گوید «هیچ»، فقط با نوارِ خالی می‌خواند. نوارِ پرِ روبه‌روی
  // تابلوی صفر تطبیق نیست — تضاد است، و جای خودش را دارد.
  if (expect.quiet) return metrics.trades === 0 && metrics.volume === 0;
  if (metrics.volume !== expect.volume) return false;
  return Math.abs(expect.trades - metrics.trades) <= metrics.canceled;
}

/**
 * از میان پاسخ‌های در دست، کدام را برداریم.
 *
 * `candidates` فهرستی از `{ variant, rows, duplicates, conflicts, shape }`
 * است، به همان ترتیبی که پرسیده شده‌اند.
 *
 * ترتیبِ تصمیم:
 *   ۱. پاسخی که با تابلو **تطبیق کامل** دارد — اگر باشد، همان و تمام.
 *   ۲. وگرنه پرحجم‌ترین پاسخ؛ ولی صریحاً `complete:false` با عددِ کسری.
 *   ۳. اگر همه خالی‌اند، خالی — با شکلِ خامِ هر دو مسیر.
 *
 * در حالت ۲ هرگز ادعای کامل‌بودن نمی‌شود. «بهترینِ آنچه داریم» با «همهٔ
 * آنچه هست» یکی نیست، و فایل باید همین تفاوت را بنویسد.
 */
export function chooseTape(candidates = [], expect = { known: false }) {
  const list = (candidates || []).map((item) => ({
    ...item, metrics: tapeMetrics(item.rows),
  }));
  const nonEmpty = list.filter((item) => item.metrics.total > 0);

  if (!nonEmpty.length) {
    // ═══ خالیِ تأییدشده، در برابر خالیِ مشکوک ═══
    //
    // R3-03: وقتی تابلو خودش می‌گوید آن روز معامله‌ای نشده، نوارِ خالی
    // **درست** است و باید «کامل» شمرده شود — نه «نیامد». تا پیش از این
    // هر دو یک جواب می‌گرفتند و همین API را با خروجی ناسازگار می‌کرد.
    if (expect.quiet) {
      return {
        rows: [], variant: 'both', emptyBoth: true, duplicates: 0, conflicts: [],
        complete: true, verified: true, quiet: true, shortfall: null,
      };
    }
    return {
      rows: [], variant: 'both', emptyBoth: true, duplicates: 0, conflicts: [],
      complete: false, verified: expect.known, quiet: false,
      // تابلو می‌گوید آن روز معامله شده ولی هیچ مسیری چیزی نداد: این
      // «بی‌معامله» نیست، «نیامد» است.
      shortfall: expect.known ? { trades: expect.trades, volume: expect.volume } : null,
    };
  }

  // نوارِ پر روبه‌روی تابلوی صفر تطبیق نیست؛ تضاد است و اسمِ خودش را دارد.
  if (expect.quiet) {
    const best = [...nonEmpty].sort((a, b) => b.metrics.volume - a.metrics.volume)[0];
    return {
      rows: best.rows, variant: best.variant,
      duplicates: best.duplicates, conflicts: best.conflicts,
      complete: false, verified: true, quiet: false, surplus: true, metrics: best.metrics,
      shortfall: null,
    };
  }

  const matched = nonEmpty.find((item) => tapeMatchesDaily(item.metrics, expect));
  if (matched) {
    return {
      rows: matched.rows, variant: matched.variant,
      duplicates: matched.duplicates, conflicts: matched.conflicts,
      complete: true, verified: true, quiet: false, metrics: matched.metrics,
    };
  }

  const best = [...nonEmpty].sort((a, b) => b.metrics.volume - a.metrics.volume
    || b.metrics.trades - a.metrics.trades)[0];
  return {
    rows: best.rows, variant: best.variant,
    duplicates: best.duplicates, conflicts: best.conflicts,
    complete: false, verified: expect.known, metrics: best.metrics,
    shortfall: expect.known
      ? { trades: expect.trades - best.metrics.trades, volume: expect.volume - best.metrics.volume }
      : null,
    // کدام مسیرها امتحان شدند و هرکدام چه دادند — برای تشخیصِ اجرای بعدی.
    tried: list.map((item) => ({ variant: item.variant, trades: item.metrics.trades, volume: item.metrics.volume })),
  };
}

/**
 * پاسخِ تازه را بپذیریم یا پاسخِ قبلی را نگه داریم.
 *
 * ═══ F-04 آزمونِ عملی ═══
 *
 * بازتولیدِ ثبت‌شده: `/api/trades/batch` برای اهرم/۲۰۲۶۰۹۱۹ از کش **۲٬۵۲۱
 * ردیف** داد؛ همان درخواست با `fresh:true` از بالادست **صفر** داد؛ و
 * `items[key].rows` از ۲٬۵۲۱ به صفر رسید. سپس سازندهٔ خروجی برای آن روز
 * **صفر ردیف** نوشت. یعنی تلاش برای تکمیل، دادهٔ موجود را پاک کرد.
 *
 * تابلوی روزانه همان لحظه هنوز ۷٬۷۳۶ معامله و ۷۳٬۳۰۵٬۲۲۴ حجم می‌گفت، پس
 * «معامله نشده» توضیحِ آن صفر نیست.
 *
 * ═══ قاعده ═══
 *
 * تلاشِ دوباره فقط وقتی جای قبلی را می‌گیرد که **بهتر** باشد. خطا و
 * پاسخِ خالی هرگز رکوردِ معتبرِ قبلی را حذف نمی‌کنند — ولی نگه‌داشتنِ
 * دادهٔ قبلی به معنیِ کامل اعلام‌کردنش نیست: وضعیتِ تلاشِ ناموفق جدا
 * حمل می‌شود تا هم داده بماند هم ادعا درست بماند.
 */
export function keepBetterTape(previous, next, expect = { known: false }) {
  const prevRows = Array.isArray(previous?.rows) ? previous.rows : null;
  if (!prevRows || !prevRows.length) return { ...next, replaced: true };

  const nextRows = Array.isArray(next?.rows) ? next.rows : null;
  const prevMetrics = tapeMetrics(prevRows);

  // خطای تلاشِ تازه، دادهٔ قبلی را نمی‌برد.
  if (next?.error || !nextRows) {
    return {
      ...previous, replaced: false,
      retryFailed: true, retryError: String(next?.error || 'پاسخ ردیفی نداشت'),
    };
  }

  const nextMetrics = tapeMetrics(nextRows);
  if (tapeMatchesDaily(nextMetrics, expect)) return { ...next, replaced: true };
  if (tapeMatchesDaily(prevMetrics, expect)) {
    return { ...previous, replaced: false, retryWorse: true };
  }

  // هیچ‌کدام با تابلو نخواند: پرحجم‌تر می‌ماند. برابر هم که بودند، قبلی
  // می‌ماند — تلاشِ دوباره دلیلِ عوض‌کردنِ دادهٔ سالم نیست.
  if (nextMetrics.volume > prevMetrics.volume
    || (nextMetrics.volume === prevMetrics.volume && nextMetrics.trades > prevMetrics.trades)) {
    return { ...next, replaced: true };
  }
  return {
    ...previous, replaced: false,
    retryWorse: true,
    ...(nextMetrics.total === 0 ? { retryEmptied: true } : {}),
  };
}
