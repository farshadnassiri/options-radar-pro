// همگام‌سازی تنظیمات رابط با ذخیره‌سازی سرور.
//
// کنترل‌هایی مثل «سقف سررسید» همان لحظه که کلیک می‌شوند وارد محاسبه‌اند؛
// پاسخ دیسک فقط تأیید است. اگر حافظه تا پایان PUT صبر کند، کاربر می‌تواند
// در همان فاصله آزمون را با تنظیم قدیمی اجرا کند. صف هم لازم است تا چند
// تیک سریع، پاسخ‌های جابه‌جا را روی انتخاب تازه ننشاند.

export const SETTINGS_CHANGED_EVENT = 'options-radar:settings-changed';

export function changedSettingKeys(previous = {}, next = {}) {
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  return [...keys].filter((key) => !Object.is(previous?.[key], next?.[key]));
}

export function createSettingsSaver({ get, set, write, notify = () => {} } = {}) {
  let queue = Promise.resolve();
  let revision = 0;

  const apply = (value) => {
    const before = get();
    set(value);
    notify(before, value);
  };

  const save = (next) => {
    const before = get();
    const intended = { ...(next || {}) };
    const mine = ++revision;

    // قصد کاربر فوراً معتبر است؛ اجرای همان صفحه نباید منتظر دیسک بماند.
    apply(intended);

    const job = queue.then(async () => {
      try {
        const saved = await write(intended);
        // پاسخ ذخیرهٔ قدیمی حق ندارد انتخاب تازه‌تر را عقب ببرد.
        if (mine === revision) apply(saved);
        return saved;
      } catch (error) {
        // فقط آخرین قصد می‌تواند برگردد؛ اگر قصد تازه‌تری هست، همان در صف
        // نوشته خواهد شد و شامل انتخاب‌های خوش‌بینانهٔ پیشین هم هست.
        if (mine === revision) apply(before);
        throw error;
      }
    });

    // شکست یک ذخیره نباید صف را برای ذخیرهٔ بعدی مسموم کند.
    queue = job.catch(() => {});
    return job;
  };

  return {
    save,
    idle: () => queue,
    revision: () => revision,
  };
}
