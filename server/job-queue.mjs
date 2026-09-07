// صفِ کارِ بالادست: سقف هم‌زمانی، اولویت، و ارثِ اولویت.
//
// ═══ چرا از `server.mjs` بیرون آمد ═══
//
// ایرادِ P1 گزارشِ ۱۴۰۵/۰۶/۱۶ دقیقاً یک ایرادِ صف بود — حلقهٔ زندهٔ دیده‌بان
// پشتِ کارهای تاریخی گرسنه ماند — و تا وقتی صف داخل یک فایلِ ۱۷۰۰ خطیِ
// شبکه‌دار بود، هیچ ادعایی دربارهٔ ترتیبش قابل **سنجیدن** نبود. اینجا هیچ
// شبکه‌ای نیست: توابعِ ورودی و آرایه، و همین بس.
//
// سطل ژتون بیرون می‌ماند و از راهِ `beforeRun` تزریق می‌شود؛ صف نمی‌داند
// سهمیه چیست و لازم هم ندارد بداند.

/**
 * @param {object} opt
 * @param {() => number} opt.concurrency  سقف هم‌زمانی، هر بار تازه خوانده می‌شود
 *   (کاربر می‌تواند وسط کار تنظیمات را عوض کند).
 * @param {() => Promise<void>} [opt.beforeRun]  پیش از هر اجرا — جای سطل ژتون.
 * @param {(depth: number, running: number) => void} [opt.onChange]  برای شمارنده‌ها.
 */
export function makeJobQueue({ concurrency, beforeRun, onChange } = {}) {
  const queue = [];
  let running = 0;
  const cap = typeof concurrency === 'function' ? concurrency : () => 6;
  const before = typeof beforeRun === 'function' ? beforeRun : async () => {};
  const notify = typeof onChange === 'function' ? onChange : () => {};

  const sort = () => queue.sort((a, b) => a.priority - b.priority);
  const changed = () => notify(queue.length, running);

  async function pump() {
    if (running >= cap() || !queue.length) return;
    const job = queue.shift();
    running += 1;
    changed();
    try {
      await before();
      job.resolve(await job.fn());
    } catch (e) {
      job.reject(e);
    } finally {
      running -= 1;
      changed();
      pump();
    }
  }

  /**
   * کار را در صف می‌گذارد. عددِ کوچک‌ترِ `priority` یعنی جلوتر.
   *
   * `ticket` اختیاری است: شیئی که صدازننده نگه می‌دارد تا بعداً بتواند
   * همین کار را جلو بیندازد. `push` فقط `ticket.job` را پر می‌کند.
   */
  function push(fn, priority = 5, ticket = null) {
    return new Promise((resolve, reject) => {
      const job = { fn, priority, resolve, reject };
      if (ticket) ticket.job = job;
      queue.push(job);
      sort();
      changed();
      pump();
    });
  }

  /**
   * ═══ ارثِ اولویت ═══
   *
   * وقتی صدازنندهٔ عجول‌تری به کارِ کسِ دیگری می‌پیوندد (ادغامِ درخواستِ در
   * پرواز)، آن کار باید عجلهٔ او را بگیرد. بی این، اولویتِ ۱ روی کاغذ می‌ماند
   * و در عمل پشتِ صدها کارِ اولویتِ ۴ می‌ایستد — همان چیزی که حلقهٔ زنده را
   * ۲۹۰ ثانیه بی‌خبر متوقف کرد.
   *
   * کارِ **در حالِ اجرا** جابه‌جا نمی‌شود؛ آنجا صف معنی ندارد و جلو انداختنش
   * هم چیزی را زودتر نمی‌کند.
   */
  function boost(ticket, priority) {
    if (!ticket || !(priority < ticket.priority)) return false;
    ticket.priority = priority;
    const job = ticket.job;
    if (!job || queue.indexOf(job) < 0) return false;
    job.priority = priority;
    sort();
    return true;
  }

  return {
    push,
    boost,
    get depth() { return queue.length; },
    get running() { return running; },
    /** ترتیبِ فعلیِ صف — فقط برای آزمون و اشکال‌زدایی. */
    order() { return queue.map((job) => job.priority); },
  };
}
