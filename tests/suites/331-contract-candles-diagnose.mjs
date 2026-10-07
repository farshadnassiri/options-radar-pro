// ۳۳۱. «آخرین نسخه نمودار را نمی‌سازد: ۰ کندل · ۳۸ قرارداد داده ندارد» (۱۴۰۵/۰۷/۱۵ عصر)
//
// دو چیز پیدا شد: (۱) با برداشتن پنل کنار نمودار، تابع `hide` هم پاک شده بود
// و «حذف این کندل» و «کلیک = حذف» خطای ReferenceError می‌دادند. (۲) پیامِ
// خالی‌بودن علت را نمی‌گفت: پاسخ کمینه/بیشینه نیامده بود، خطا داده بود، مال
// جلسهٔ دیگری بود، یا شاخص عدد نداشت؟ حالا هر کدام شمرده و گفته می‌شود.

import { check, group, readSrc } from '../harness.mjs';
import { candleRecord, candleLossReason, candleLossSummary } from '../../core/contract-candles.mjs';

// شکل ردیف همان `decisionDashboardSnapshot`؛ پاسخ اطلاعات همان `/api/infos`.
const row = { ins: '1', name: 'ضهرم۱', kind: 'call', strike: 100, spot: 100, days: 30, tradeLast: 10, last: 10, close: 10, yday: 9, trades: 5, uaIns: 'U', value: 1, bid: 0, ask: 0 };
const good = { first: 9, low: 8, high: 11, last: 10, close: 10, yday: 9, trades: 5 };

group('۳۳۱. علت نبودِ کندل، شمرده و گفته');
{
  check('کندل سالم علتی ندارد', candleLossReason(candleRecord(row, { info: good }), 'change') === '');
  check('پاسخ نیامده', candleLossReason(candleRecord(row, { info: null }), 'change') === 'noInfo');
  const err = candleRecord(row, { info: { error: 'TypeError: fetch failed' } });
  check('پاسخِ خطادار با متن خطا', candleLossReason(err, 'change') === 'infoError' && err.infoError === 'TypeError: fetch failed');
  check('جلسهٔ دیگر', candleLossReason(candleRecord(row, { info: { ...good, yday: 8 } }), 'change') === 'otherSession');
  check('نقطهٔ نیامده نام برده می‌شود', candleLossReason(candleRecord(row, { info: { ...good, first: 0 } }), 'change') === 'missing:first');
  // پس از بستن بازار مظنه نیست؛ تلاطم اجرایی عدد ندارد ولی علتش «بازه» نیست.
  check('شاخص بی‌عدد (مظنه پس از بستن)', candleLossReason(candleRecord(row, { info: good }), 'spreadPct') === 'noMetric');
  const summary = candleLossSummary([
    candleRecord(row, { info: null }), candleRecord(row, { info: null }),
    candleRecord(row, { info: { error: 'HTTP 403' } }), candleRecord(row, { info: good }),
  ], 'change');
  check('شمارش علت‌ها، پرتعداد اول', summary[0].key === 'noInfo' && summary[0].count === 2 && summary[1].key === 'infoError' && summary[1].error === 'HTTP 403');
  check('کندل سالم در شمارش نیست', summary.reduce((a, x) => a + x.count, 0) === 3);
}

group('۳۳۱. سیم‌کشی رابط');
{
  const view = readSrc('../ui/contract-candles-view.mjs');
  check('تابع hide تعریف شده و همان‌جا صدا زده می‌شود', view.includes('function hide(ins) {') && view.includes('if (opts.clickRemove) { hide(r.ins); return; }'));
  // هر تابعی که در نما صدا زده می‌شود، تعریف یا وارد شده باشد — همان چیزی که
  // `node --check` نمی‌بیند و این بار از دست رفت.
  const called = new Set([...view.matchAll(/(?<![.\w$])([a-zA-Z_]\w*)\(/g)].map((m) => m[1]));
  const defined = new Set([...view.matchAll(/(?:function\s+|const\s+|let\s+|var\s+)([a-zA-Z_]\w*)/g)].map((m) => m[1]));
  const imported = new Set([...view.matchAll(/import\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop())));
  const params = new Set(['getSettings', 'greekParams', 'isVisible', 'onOpenContract', 'getPayload', 'min', 'dispose']);
  const builtin = new Set('if for while switch return catch String Number Math JSON Object Array Set Map Date Boolean Promise setTimeout clearTimeout requestAnimationFrame getComputedStyle prompt fetch isFinite parseInt parseFloat encodeURIComponent AbortController'.split(' '));
  const missing = [...called].filter((n) => !defined.has(n) && !imported.has(n) && !builtin.has(n) && !params.has(n));
  check(`هیچ تابع تعریف‌نشده‌ای صدا زده نمی‌شود${missing.length ? ` (${missing.join('، ')})` : ''}`, missing.length === 0);
  check('پیام خالی‌بودن علت را می‌گوید', view.includes('candleLossSummary(records, m.key, opts.log)') && view.includes('کندلی کشیده نشد —'));
  check('درخواست کمینه/بیشینه مهلت دارد و پرچم دریافت گیر نمی‌کند', view.includes('const INFO_TIMEOUT_MS = 30_000;') && view.includes("error?.name === 'AbortError'"));
}

group('۳۳۱. خوانایی هاور، عنوان در نمودار، تصویر کنار نمودار');
{
  const view = readSrc('../ui/contract-candles-view.mjs');
  const css = readSrc('../ui/style.css');
  // «در هاور برخی اعداد و توضیحات قاطی می‌شوند.» عدد منفی و ٪ وسط جملهٔ
  // فارسی جابه‌جا می‌شد؛ هر عدد حالا جزیرهٔ چپ‌به‌راستِ خودش است.
  const detail = view.slice(view.indexOf('function detailHtml(r) {'), view.indexOf('function paintPin() {'));
  check('هر عدد راهنما در جزیرهٔ چپ‌به‌راست', detail.includes('<bdi class="num') && css.includes('.ccv-tip .num { unicode-bidi: isolate; direction: ltr;'));
  check('دیگر جملهٔ درازِ «·»‌دار با عدد درصد نیست', !detail.includes('· دامنه روز ${fmt.pct(') && !detail.includes('ارزش ${fmt.rialText(r.value)} · حجم'));
  check('ردیف برچسب: مقدار', detail.includes("const kv = (label, value) =>") && detail.includes("kv('سربه‌سر وزنی زنجیره'"));
  check('عنوان در خودِ بوم هر دو نمودار (در تصویر هم می‌ماند)', view.includes('title: chartTitle(t, `${m.label}') && view.includes('title: chartTitle(t, `توزیع ${m.label}') && view.includes('function scopeText()'));
  const toolbar = view.indexOf('<div class="ccv-chart-bar"><div class="ccv-legend" data-ccv-legend>');
  const near = view.indexOf('data-ccv-export="png"', toolbar);
  check('دکمهٔ تصویر درست بالای نمودار مادر، کنار راهنمای رنگ', toolbar > 0 && near > toolbar && near < view.indexOf('data-ccv-chart="mother"'));
  check('نمودار توزیع هم دکمهٔ تصویر خودش را دارد', view.includes('data-ccv-export="png-hist"') && view.includes("const handle = kind === 'png' ? mother : hist;"));
}
