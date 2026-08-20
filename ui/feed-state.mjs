// وضعیت خوراک داده — تصمیم‌های محضِ «چه چیزی به کاربر بگوییم».
//
// این فایل عمداً هیچ وابستگی ندارد تا هم مرورگر و هم آزمون بتوانند
// مستقیم واردش کنند. قاعده‌ای که اینجا نوشته شده یک جمله است:
//
//   تا وقتی هیچ ردیفی نداریم، هیچ برچسبی حق ندارد بگوید «متصل».
//
// سوکتِ باز با «داده دارم» یکی نیست؛ وقتی این دو یکی گرفته می‌شدند،
// کاربر فهرست خالی را می‌دید و فکر می‌کرد اشتباه از خودش است.

/** برچسب نوار وضعیت، از روی «چه داده‌ای داریم» نه «سوکت باز است». */
export function linkLabelKey({ rowCount = 0, stale = false, feedStatus = 'idle', linkStatus = 'idle' } = {}) {
  if (rowCount > 0) return stale ? 'snapshot' : linkStatus;
  if (feedStatus === 'failed') return 'nodata';
  if (feedStatus === 'empty') return 'blank';
  if (feedStatus === 'loading') return 'waiting';
  return linkStatus === 'live' ? 'waiting' : linkStatus;
}

/**
 * چرا فهرست نماد خالی است.
 *
 * «خالی» یک حالت نیست، چهار تاست، و هر کدام کار متفاوتی از کاربر
 * می‌خواهد: صبر، تلاش دوباره، پاک‌کردن جست‌وجو، یا هیچ.
 */
export function emptyReason({ listCount = 0, filtered = false, feedStatus = 'idle', error = '' } = {}) {
  if (listCount > 0 && filtered) return { kind: 'filter', text: 'نمادی با این نام در دیده‌بان نیست. جست‌وجو را پاک کن.', retry: false };
  if (feedStatus === 'loading') return { kind: 'loading', text: 'در حال گرفتن فهرست نمادها…', retry: false };
  if (feedStatus === 'failed') return { kind: 'failed', text: `فهرست نمادها نیامد: ${error || 'دلیل نامعلوم'}`, retry: true };
  if (feedStatus === 'empty') return { kind: 'empty', text: 'تابلو پاسخ داد ولی هیچ قراردادی نداشت.', retry: false };
  return { kind: 'idle', text: 'هنوز داده‌ای نرسیده است.', retry: false };
}
