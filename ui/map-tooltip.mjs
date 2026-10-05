// راهنمای هاور نقشهٔ بازار اختیار — همان عددهای جدول، زنجیره و کاشی‌ها.
//
// گزارش صاحب پروژه (۱۴۰۵/۰۷/۱۳): «با هاور کردن روی نقشهٔ بازار اختیار
// اطلاعات درست نیستند… ارزش معاملات اطلس در جدول، در نقشه، در زنجیره و هر
// جایی یکسان باشد.» راهنما در حالت نماد پایه زیر نام «ارزش معامله» جمع
// ارزش کال و پوتِ آن نماد را می‌گفت (برای اطلس ۱۴٬۲۱۶ میلیون ریال)، در
// حالی که ارزش معاملات خودِ صندوق ۱٬۱۶۳٬۴۲۴ میلیون ریال بود — یک نام، دو
// عدد. حالا هر عدد نام خودش را دارد و از همان ردیف `universe` می‌آید که
// جدول و کاشی‌های نماد می‌خوانند.

import { fmt, faDigits } from './fmt.mjs';
import { pricePairText } from './price-pair.mjs';

const known = (v) => v != null && Number.isFinite(Number(v));
const rial = (v, why = 'نامعلوم') => (known(v) ? fmt.rialText(Number(v)) : why);
const int = (v) => (known(v) ? fmt.int(Number(v)) : '—');

/**
 * سطرهای راهنما. `mode` یکی از `underlyings` یا `contracts`؛ `info` برچسب
 * سنجهٔ اندازهٔ خانه و مقدارش را می‌دهد (اگر سنجه خودش یکی از سطرها
 * نباشد، جدا گفته می‌شود).
 */
export function mapTooltipLines(row = {}, { mode = 'underlyings', metricLabel = '', metricKey = '', metricText = '', dateText = '' } = {}) {
  const lines = [pricePairText(row)];
  const shown = new Set(['value', 'uaValue', 'callValue', 'putValue', 'volume', 'oi', 'changePct']);
  if (mode === 'contracts') {
    lines.push(`ارزش معاملهٔ این قرارداد: ${rial(row.value)}`);
    lines.push(`حجم: ${int(row.volume)} قرارداد · تعداد معامله: ${int(row.trades)}`);
    lines.push(`موقعیت باز: ${int(row.oi)} قرارداد`);
    if (dateText) lines.push(`سررسید: ${dateText}`);
  } else {
    lines.push(`ارزش معاملات خودِ ${faDigits(row.name || 'پایه')}: ${rial(row.uaValue, 'نوار معاملهٔ پایه نرسیده')}`);
    lines.push(`ارزش معاملات اختیارهای آن: ${rial(row.value)} (کال ${rial(row.callValue)} · پوت ${rial(row.putValue)})`);
    lines.push(`حجم اختیار: ${int(row.volume)} قرارداد · موقعیت باز: ${int(row.oi)} قرارداد`);
  }
  if (metricLabel && !shown.has(metricKey) && metricText) lines.push(`اندازهٔ خانه — ${metricLabel}: ${metricText}`);
  return lines;
}
