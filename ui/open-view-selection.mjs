// همگام‌سازی نماد «نگاه باز» فقط وقتی مجاز است که یک ورودی صریح پشت آن
// باشد: ورود نخست به نما، یا تغییر انتخاب‌گر نماد در خود داشبورد.
// تازه‌سازی خودکار خروجی تازه می‌سازد اما ورودی کاربر را بازنویسی نمی‌کند.
export function createOpenViewBaseSyncGate() {
  let pending = true;
  return Object.freeze({
    request() { pending = true; },
    consume() {
      if (!pending) return false;
      pending = false;
      return true;
    },
  });
}
