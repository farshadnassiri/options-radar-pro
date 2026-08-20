// دفتر خطاها — حلقه‌ای، در حافظه.
//
// تا امروز سرور فقط `stat.lastError` را نگه می‌داشت: یک رشته، که با خطای
// بعدی پاک می‌شد. برای «چرا این روز خالی بود؟» بی‌فایده است — وقتی کاربر
// می‌پرسد، آن خطا ده خطای دیگر عقب‌تر رفته و دیگر وجود ندارد.
//
// حلقه‌ای و بی‌دیسک، عمدی است. این دفتر برای عیب‌یابیِ همین نشست است نه
// بایگانی: نوشتن روی دیسک یعنی رشد بی‌مرز و یک فایل که باید نگهداری شود،
// در برنامه‌ای که کل قرارش «سرور محلی سبک» است.
//
// خالص و بی‌نیاز از سرور نوشته شده تا آزمون شود.

const CAP = 300;

/** یک دفتر تازه. */
export function createLog(cap = CAP) {
  const rows = [];
  let seq = 0;
  let dropped = 0;
  return {
    /**
     * یک رویداد ثبت می‌کند.
     *
     * `at` از بیرون گرفته می‌شود تا آزمون بتواند زمان را ثابت کند.
     */
    push({ level = 'error', where = '', message = '', detail = '', at = Date.now() } = {}) {
      const row = {
        seq: ++seq, at, level: String(level), where: String(where),
        message: String(message).slice(0, 500), detail: String(detail).slice(0, 2000),
      };
      rows.push(row);
      // کهنه‌ترین‌ها می‌روند. شمارش دورریخته‌ها می‌ماند، وگرنه کاربر نمی‌فهمد
      // که آنچه می‌بیند همهٔ ماجرا نیست.
      while (rows.length > cap) { rows.shift(); dropped += 1; }
      return row;
    },
    /** تازه‌ترین‌ها اول. `sinceSeq` برای گرفتن فقط تازه‌ها. */
    list({ limit = 100, sinceSeq = 0, level = null } = {}) {
      let out = rows.filter((r) => r.seq > sinceSeq);
      if (level) out = out.filter((r) => r.level === level);
      return out.slice(-Math.max(1, limit)).reverse();
    },
    stats() {
      const byLevel = {};
      for (const r of rows) byLevel[r.level] = (byLevel[r.level] || 0) + 1;
      return { held: rows.length, dropped, seq, byLevel, cap };
    },
    clear() { rows.length = 0; dropped = 0; return true; },
  };
}
