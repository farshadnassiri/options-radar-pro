// پشتیبان و بازیابی — همهٔ آنچه کاربر خودش ساخته، در یک فایل.
//
// ═══ چرا لازم شد ═══
//
// دادهٔ کاربر امروز در سه جای مستقل زندگی می‌کند: تنظیمات و موقعیت‌ها روی
// دیسکِ سرور، قاعده‌های دیده‌بان و بایگانی اجراها در حافظهٔ مرورگر، و
// ترجیح‌های نما هم همان‌جا. هیچ‌کدام نسخهٔ دوم ندارند. یک `rm` روی پوشهٔ
// `data/`، یا یک «پاک کردن دادهٔ سایت» در مرورگر، همه‌اش را می‌برد — و
// موقعیت‌ها با قیمتِ ورودِ دستیِ کاربر، از هیچ‌جا بازتولید نمی‌شوند.
//
// ═══ چه چیزی در پشتیبان هست و چه چیزی نیست ═══
//
// **آنچه کاربر ساخته**، نه آنچه از بازار آمده. کشِ قیمت، عکسِ دیده‌بان و
// تاریخچهٔ روزانه در پشتیبان نمی‌آیند: حجمشان چند ده مگابایت است، از
// بالادست دوباره می‌آیند، و اگر بازیابی می‌شدند دادهٔ کهنه را روی دادهٔ تازه
// می‌نشاندند.
//
// ═══ چرا بازیابی «ادغام» نیست ═══
//
// ادغامِ دو فهرستِ موقعیت یعنی تصمیم گرفتن دربارهٔ رکوردی که در هر دو هست
// ولی فرق دارد — و هر تصمیمی اینجا می‌تواند قیمتِ ورودِ واقعی را با یک
// نسخهٔ کهنه عوض کند. پس بازیابی **جایگزینی** است، و پیش از آن باید
// شمارِ آنچه می‌رود و می‌آید به کاربر گفته شود.

import { num } from './num.mjs';

export const BACKUP_VERSION = 1;

export const BACKUP_REASONS = {
  notObject: 'فایل پشتیبان نیست — محتوایش شیء JSON نیست',
  noVersion: 'نسخهٔ پشتیبان اعلام نشده',
  badVersion: 'نسخهٔ این پشتیبان با این ساخت برنامه نمی‌خواند',
  empty: 'این پشتیبان هیچ بخشی برای بازیابی ندارد',
};

/** بخش‌هایی که پشتیبان می‌گیرند. هر بخش مستقل بازیابی می‌شود. */
export const BACKUP_PARTS = [
  { key: 'settings', label: 'تنظیمات', kind: 'object' },
  { key: 'positions', label: 'موقعیت‌های من', kind: 'list' },
  { key: 'watchRules', label: 'قاعده‌های دیده‌بان', kind: 'list' },
  { key: 'backtestRuns', label: 'بایگانی اجراهای آزمایشگاه', kind: 'list' },
  { key: 'preferences', label: 'ترجیح‌های نما', kind: 'object' },
];

const countOf = (part, value) => {
  if (value == null) return 0;
  if (part.kind === 'list') return Array.isArray(value) ? value.length : 0;
  return typeof value === 'object' ? Object.keys(value).length : 0;
};

/**
 * ساختِ بستهٔ پشتیبان.
 *
 * بخشی که داده ندارد **حذف** می‌شود، نه اینکه خالی بنشیند: بستهٔ حاوی
 * `positions: []` در بازیابی، فهرست موقعیت‌های مقصد را پاک می‌کند — و آن
 * دقیقاً همان فاجعه‌ای است که پشتیبان قرار بود جلویش را بگیرد.
 */
export function buildBackup({
  settings = null, positions = null, watchRules = null, backtestRuns = null, preferences = null, at = 0,
} = {}) {
  const source = { settings, positions, watchRules, backtestRuns, preferences };
  const bundle = { version: BACKUP_VERSION, at: num(at, Date.now()) || Date.now() };
  for (const part of BACKUP_PARTS) {
    const value = source[part.key];
    if (value == null) continue;
    if (part.kind === 'list' && (!Array.isArray(value) || !value.length)) continue;
    if (part.kind === 'object' && (typeof value !== 'object' || !Object.keys(value).length)) continue;
    bundle[part.key] = value;
  }
  return bundle;
}

/** خلاصهٔ یک بسته — «چه چیزی و چقدر». */
export function backupSummary(bundle) {
  const parts = BACKUP_PARTS
    .map((part) => ({ ...part, present: bundle?.[part.key] != null, count: countOf(part, bundle?.[part.key]) }))
    .filter((part) => part.present);
  return {
    version: num(bundle?.version, NaN),
    at: num(bundle?.at, 0),
    parts,
    total: parts.reduce((sum, part) => sum + part.count, 0),
  };
}

/**
 * سنجشِ یک فایل پیش از بازیابی.
 *
 * نسخهٔ ناشناخته رد می‌شود و این سخت‌گیری عمدی است: بسته‌ای از یک ساختِ
 * آینده می‌تواند میدان‌هایی داشته باشد که این ساخت غلط می‌خواند، و نتیجه‌اش
 * دادهٔ خرابِ بی‌صداست — بدتر از بازیابیِ انجام‌نشده.
 */
export function readBackup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, why: BACKUP_REASONS.notObject, summary: null };
  }
  const version = num(raw.version, NaN);
  if (!Number.isFinite(version)) return { ok: false, why: BACKUP_REASONS.noVersion, summary: null };
  if (version !== BACKUP_VERSION) return { ok: false, why: BACKUP_REASONS.badVersion, summary: null };
  const summary = backupSummary(raw);
  if (!summary.parts.length) return { ok: false, why: BACKUP_REASONS.empty, summary };
  return { ok: true, why: '', summary, bundle: raw };
}

/**
 * مقایسهٔ «آنچه هست» با «آنچه می‌آید» — پیش از جایگزینی.
 *
 * این تابع هیچ چیزی را عوض نمی‌کند. کارش این است که جملهٔ تأیید بتواند
 * عددِ واقعی بگوید: «۷ موقعیت جای ۳ موقعیت می‌نشیند»، نه «مطمئنی؟».
 */
export function restorePlan(bundle, current = {}) {
  return BACKUP_PARTS
    .filter((part) => bundle?.[part.key] != null)
    .map((part) => ({
      key: part.key, label: part.label,
      from: countOf(part, current?.[part.key]),
      to: countOf(part, bundle[part.key]),
    }));
}
