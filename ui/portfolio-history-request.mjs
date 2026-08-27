// نگهبان پاسخ‌های تاریخچه هنگام تغییر نماد پایه.
//
// لغو واقعی fetch همیشه ممکن نیست و حتی AbortController تضمین نمی‌کند
// پاسخ قبلی پیش از لغو به صف microtask نرسیده باشد. این قرارداد هر درخواست
// را به نسل و هویت نماد می‌بندد؛ فقط تازه‌ترین بلیتِ همان نماد حق رنگ‌کردن
// تقویم و وضعیت کیفیت را دارد.

const text = (value) => String(value ?? '').trim();

export function createPortfolioHistoryRequestGate() {
  let generation = 0;
  return {
    begin(baseIns) {
      return Object.freeze({ generation: ++generation, baseIns: text(baseIns) });
    },
    accepts(ticket, currentBaseIns) {
      return Number.isInteger(ticket?.generation)
        && ticket.generation === generation
        && ticket.baseIns === text(currentBaseIns);
    },
    invalidate() { generation += 1; },
  };
}
