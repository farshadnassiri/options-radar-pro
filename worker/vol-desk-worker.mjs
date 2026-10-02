// ریسهٔ میز تلاطم.
//
// ساختن نقطه‌های شاخص همهٔ روزها (هر لحظه، هر قرارداد، یک حل تلاطم) کار
// سنگینی است و نخ اصلی را چند صد میلی‌ثانیه تا چند ثانیه می‌بست (گزارش
// آزمون ۳۷۱۲e1a، بند ۶). اینجا انجام می‌شود و کشِ روزهای بسته‌شده هم همین‌جا
// می‌ماند، پس بار دوم فقط لحظه‌های تازهٔ امروز حساب می‌شوند. ورودی و
// خروجی همان `deskDays` است، بی `raw` (نخ اصلی خودش آن را دارد).

import { intradayContext } from '../core/vol-intraday.mjs';
import { deskDays } from '../core/vol-desk.mjs';

self.onmessage = (event) => {
  const { id, api, settings, holidays, holidaysKnown } = event.data || {};
  try {
    const ctx = intradayContext(settings || {}, { holidays: holidays || [], holidaysKnown: Boolean(holidaysKnown) });
    const days = deskDays(api, ctx).map(({ raw, ...rest }) => rest);
    self.postMessage({ id, days });
  } catch (error) {
    self.postMessage({ id, error: `${error?.name || 'Error'}: ${error?.message || error}` });
  }
};
