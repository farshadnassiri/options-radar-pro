// ۳۴۴. تازه‌سازیِ زنده درجا، بی بسته‌شدنِ نمودار و بی تنظیمِ دوباره (۱۴۰۵/۰۷/۱۸)
//
// گزارش صاحب پروژه از «نگاه باز چندروزه»: «بعد از چند ثانیه نمودارها بسته
// می‌شود و دوباره باید دریافت اطلاعات کنم… می‌خواهم هر جا به‌روزرسانی
// می‌شود، نمودارها و جدول‌ها و همهٔ خروجی‌ها لحظه‌ای به‌روز شوند و از اول
// نیاز به تنظیم نباشد.»

import { check, group, readSrc } from '../harness.mjs';

const ov = readSrc('../ui/tabs/open-view.mjs');
const body = (name) => {
  const start = ov.indexOf(`function ${name}(`);
  const next = ov.indexOf('\n  }\n', start);
  return start < 0 ? '' : ov.slice(start, next);
};

group('۳۴۴. نگاه باز: تیکِ پس‌زمینه درجا');
{
  const refresh = body('refreshLiveViews');
  check('تیک فقط مسیرِ آرام را صدا می‌زند', refresh.includes('computeDaily({ quiet: true })') && refresh.includes('loadDayIntraday({ quiet: true })')
    && refresh.includes('applySelectedScope({ quiet: true })'));
  check('حالت لحظه‌ای با تاریخچهٔ خالی «چندروزه» نمی‌سازد (گزارش پنهان نمی‌شد)',
    refresh.includes("if (!isLive() && daily && $('ov-scope').value === SCOPE_LIVE)"));
  const daily = body('computeDaily');
  check('محاسبهٔ آرام نمودار درون‌روزی را پاک نمی‌کند و روز انتخابی را نگه می‌دارد',
    daily.includes('if (!quiet) resetIntraday();') && daily.includes('if (!keepDay) selectedDate')
    && daily.includes('if (quiet && daily && !next.expiryRows.length) return;'));
  const intraday = ov.slice(ov.indexOf('async function loadDayIntraday('), ov.indexOf('async function refreshLiveViews('));
  check('تیکِ آرام اسکلتِ «در حال دریافت» نمی‌گذارد و نمودارِ آخر را با شکست یا پاسخ خالی پاک نمی‌کند',
    intraday.includes('if (!keepOld()) {') && intraday.includes('if (keepOld() && !fresh.rows.length) return;')
    && intraday.includes('نمودار همان آخرین دریافت موفق است'));
  check('`tapeNote` درونِ همان تابعی است که می‌خواندش (پیش‌تر هر دریافت می‌شکست)',
    intraday.includes("let tapeNote = '';") && !body('chart').includes('tapeNote') && !/^function chart[\s\S]*?let tapeNote/m.test(ov.slice(0, ov.indexOf('export async function mount'))));
  check('فهرستِ نمادِ یکسان دوباره ساخته نمی‌شود (کشوییِ باز بسته نمی‌شود)',
    ov.includes('if (markup !== liveBaseMarkup) { baseSelect.innerHTML = markup; liveBaseMarkup = markup; }')
    && ov.includes('fillLiveBases(payload.universe, { quiet: Boolean(before) });'));
}
