// شرط روی موقعیت‌های خودم.
//
// ═══ چرا دیده‌بان شرطی جوابش نبود ═══
//
// «دیده‌بان شرطی» از **بازار** شروع می‌کند: شرط می‌گذاری و می‌گردد ببیند
// کدام ترکیب — در هر نمادی — به آن می‌خورد. سنجه‌هایش هم سنجه‌های یک ردیفِ
// نامزد است: بازده دوره، فاصلهٔ سربه‌سری، اسپرد.
//
// آنچه آنجا وجود ندارد، دقیقاً همان چیزی است که صاحبِ یک موقعیت می‌پرسد:
// «سودِ **همین** موقعیتِ من از فلان عدد گذشت؟» این سنجه از قیمت ورودِ
// ثبت‌شدهٔ خودِ کاربر می‌آید — عددی که بازار نمی‌داند و هیچ اسکنی
// بازتولیدش نمی‌کند.
//
// ═══ چرا شرط روی خودِ رکوردِ موقعیت می‌نشیند ═══
//
// شرطِ «سود این موقعیت» بی موقعیت معنا ندارد. اگر جای دیگری ذخیره می‌شد،
// حذفِ موقعیت یک قاعدهٔ یتیم جا می‌گذاشت که به چیزی اشاره می‌کند که نیست —
// همان «دکمهٔ بی‌مقصد»، این‌بار در دفتر.

import { num } from './num.mjs';

export const POSITION_ALERT_VERSION = 1;

export const ALERT_REASONS = {
  none: 'برای این موقعیت شرطی گذاشته نشده',
  noValue: 'دست‌کم یک آستانه لازم است',
  noMark: 'ارزش‌گذاری لحظه‌ای این موقعیت ساخته نشد، پس شرطی سنجیده نمی‌شود',
};

/**
 * آستانه‌های قابل تعریف.
 *
 * `dir` می‌گوید شرط وقتی برقرار است که مقدار از آستانه **بالاتر** باشد یا
 * **پایین‌تر**. این در خودِ تعریف نشسته، نه در رابط: اگر کاربر جهت را هم
 * انتخاب می‌کرد، «سود زیر ۱۰۰ هزار» هم ساختنی می‌شد — شرطی که در لحظهٔ
 * گذاشتن برقرار است و بی‌درنگ می‌زند.
 */
export const POSITION_ALERTS = [
  { key: 'pnlAbove', label: 'سود از این عدد گذشت', unit: 'ریال', field: 'pnlTotal', dir: 'up' },
  { key: 'pnlBelow', label: 'زیان از این عدد بدتر شد', unit: 'ریال', field: 'pnlTotal', dir: 'down', negate: true },
  { key: 'retAbove', label: 'بازده از این درصد گذشت', unit: '٪', field: 'retPct', dir: 'up' },
  { key: 'roomBelow', label: 'فاصله تا سربه‌سری کمتر از این شد', unit: '٪', field: 'roomPct', dir: 'down' },
  { key: 'daysBelow', label: 'روز تا سررسید کمتر از این شد', unit: 'روز', field: 'daysToExpiry', dir: 'down' },
];

const ALERT_BY_KEY = new Map(POSITION_ALERTS.map((item) => [item.key, item]));
export const positionAlert = (key) => ALERT_BY_KEY.get(String(key ?? '')) || null;

/**
 * پاک‌سازیِ برگهٔ شرط.
 *
 * خانهٔ خالی یعنی «این شرط را نمی‌خواهم»، نه «صفر». صفرِ ذخیره‌شده برای
 * «سود از این عدد گذشت» یعنی شرطی که با اولین ریالِ سود می‌زند، و کاربر
 * آن را «چرا همیشه زنگ می‌زند» می‌خواند.
 */
export function normalizePositionAlert(raw = {}) {
  const out = { version: POSITION_ALERT_VERSION, enabled: raw?.enabled !== false };
  let any = false;
  for (const { key } of POSITION_ALERTS) {
    const value = num(raw?.[key], NaN);
    if (!Number.isFinite(value)) continue;
    out[key] = value;
    any = true;
  }
  if (!any) return { ok: false, why: ALERT_REASONS.noValue, alert: null };
  return { ok: true, why: '', alert: out };
}

/**
 * سنجشِ شرط‌های یک موقعیت در همین لحظه.
 *
 * `view` همان عددهایی است که جدول نشان می‌دهد — نه یک محاسبهٔ دوم. اگر دو
 * منبع بود، زنگ روی عددی می‌زد که کاربر روی صفحه نمی‌بیند.
 *
 * `roomPct` و `daysToExpiry` می‌توانند `NaN` باشند (سربه‌سری ندارد، سررسید
 * ثبت نشده). آن‌وقت شرطشان **سنجیده نمی‌شود** — نه برقرار، نه ناقض. شرطی
 * که ورودی‌اش نیست، جوابی هم ندارد.
 */
export function checkPositionAlerts(alert, view = {}) {
  if (!alert || alert.enabled === false) return { firing: [], checked: 0, skipped: [], reason: ALERT_REASONS.none };
  const firing = [];
  const skipped = [];
  let checked = 0;
  for (const item of POSITION_ALERTS) {
    const threshold = num(alert[item.key], NaN);
    if (!Number.isFinite(threshold)) continue;
    const value = num(view[item.field], NaN);
    if (!Number.isFinite(value)) { skipped.push({ key: item.key, label: item.label }); continue; }
    checked += 1;
    // «زیان از این عدد بدتر شد» آستانه‌اش را به شکلِ اندازه می‌گیرد و با
    // زیانِ علامت‌دار می‌سنجد؛ کاربر «۵۰۰ هزار» می‌نویسد نه «منفی ۵۰۰ هزار».
    const target = item.negate ? -Math.abs(threshold) : threshold;
    const held = item.dir === 'up' ? value >= target : value <= target;
    if (held) firing.push({ key: item.key, label: item.label, value, threshold: target, unit: item.unit });
  }
  return { firing, checked, skipped, reason: checked ? '' : ALERT_REASONS.noValue };
}

/** جملهٔ خوانای یک شرطِ برقرار — همان متنی که در نوار هشدار می‌آید. */
export function positionAlertNote(hit, { title = '' } = {}) {
  if (!hit) return '';
  const where = title ? `«${title}»: ` : '';
  return `${where}${hit.label} (${hit.unit})`;
}

/** خلاصهٔ شرط‌های یک موقعیت، برای ستون جدول. */
export function positionAlertSummary(alert) {
  if (!alert) return { count: 0, enabled: false, text: ALERT_REASONS.none };
  const keys = POSITION_ALERTS.filter((item) => Number.isFinite(num(alert[item.key], NaN)));
  return {
    count: keys.length,
    enabled: alert.enabled !== false,
    text: keys.length ? keys.map((item) => item.label).join('، ') : ALERT_REASONS.none,
  };
}
