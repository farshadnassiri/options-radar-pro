// بایگانیِ اجراهای آزمایشگاه — برای مقایسهٔ دو اجرا با دو تنظیم.
//
// ═══ شکافی که این ماژول پُر می‌کند ═══
//
// آزمایشگاه یک اجرا را کامل نشان می‌دهد و خروجی اکسلِ کاملی هم دارد. آنچه
// نداشت، **مقایسه** بود: کاربری که همان ترکیب را یک بار با نرخ بدون ریسکِ
// سی درصد و یک بار با صفر می‌آزماید، دو صفحهٔ کامل می‌بیند و باید عددها را
// روی کاغذ کنار هم بگذارد. و چون اجرای دوم اولی را پاک می‌کند، حتی همین هم
// از حافظه می‌رود.
//
// ═══ چه چیزی ذخیره می‌شود و چه چیزی نه ═══
//
// **ورودی‌ها و سرخطِ نتیجه**، نه کلِ مسیر. مسیرِ روزانهٔ یک اجرا هزاران
// ردیف است و ده اجرا حافظهٔ مرورگر را پر می‌کند؛ و اگر ذخیره می‌شد، دو
// نسخه از یک حقیقت می‌داشتیم که با عوض شدنِ موتور از هم واگرا می‌شوند.
// برای مسیرِ کامل، همان خروجی اکسل هست.
//
// تنظیم‌های مؤثر همراه هر اجرا ذخیره می‌شوند و این مهم‌ترین بخش است: اجرایی
// که تنظیمش را نگه ندارد، در مقایسه دروغ می‌گوید — دو عدد متفاوت با یک
// برچسب.

import { num } from './num.mjs';
import { normalizeHistoryDate } from './history.mjs';

export const BACKTEST_RUN_VERSION = 1;
export const RUN_CAP = 12;

/** تنظیم‌هایی که عددِ اجرا را عوض می‌کنند — نه هر تنظیمی. */
export const RUN_SETTINGS = [
  { key: 'rFree', label: 'نرخ بدون ریسک', kind: 'pct1' },
  { key: 'divYield', label: 'بازده نقدی پایه', kind: 'pct1' },
  { key: 'dayCountYear', label: 'روز سال', kind: 'int' },
  { key: 'feeOption', label: 'کارمزد اختیار', kind: 'rate' },
  { key: 'feeBuyStock', label: 'کارمزد خرید سهم', kind: 'rate' },
  { key: 'feeSellStock', label: 'کارمزد فروش سهم', kind: 'rate' },
  { key: 'creditSpreadMargin', label: 'وجه تضمین اسپرد بستانکار', kind: 'text' },
  { key: 'capitalMode', label: 'مبنای سرمایه', kind: 'text' },
];

/** سرخطِ نتیجه — همان چند عددی که تصمیم از آن‌ها گرفته می‌شود. */
export const RUN_HEADLINE = [
  { key: 'netPnl', label: 'سود و زیان پایان بازه', kind: 'money' },
  { key: 'returnPct', label: 'بازده ٪', kind: 'pct' },
  { key: 'maxDrawdown', label: 'بیشترین افت', kind: 'money' },
  { key: 'positivePct', label: 'روزهای مثبت ٪', kind: 'pct' },
  { key: 'profitFactor', label: 'ضریب سود', kind: 'num' },
  { key: 'validDays', label: 'روز معتبر', kind: 'int' },
  { key: 'missingDays', label: 'روز بی‌داده', kind: 'int' },
  { key: 'capital', label: 'سرمایه مبنا', kind: 'money' },
];

const pickSettings = (settings = {}) => Object.fromEntries(
  RUN_SETTINGS.map(({ key }) => [key, settings?.[key]]).filter(([, value]) => value !== undefined),
);

/**
 * یک اجرا را به رکوردِ بایگانی تبدیل می‌کند.
 *
 * `null` یعنی این اجرا بایگانی‌شدنی نیست — نه اینکه رکوردی نصفه ساخته شود.
 * اجرایی بی روزِ معتبر، چیزی برای مقایسه ندارد.
 */
export function makeRunRecord({
  id = '', at = 0, uaName = '', comboName = '', strategyName = '',
  from = 0, to = 0, entryBasis = '', exitBasis = '', units = 1,
  replay = null, settings = {}, note = '',
} = {}) {
  const summary = replay?.summary;
  if (!summary || !(summary.validDays > 0)) return null;
  const last = summary.last || null;
  return {
    version: BACKTEST_RUN_VERSION,
    id: String(id || `run${Date.now().toString(36)}`),
    at: num(at, Date.now()) || Date.now(),
    uaName: String(uaName || ''), comboName: String(comboName || ''),
    strategyName: String(strategyName || ''),
    from: normalizeHistoryDate(from), to: normalizeHistoryDate(to),
    entryBasis: String(entryBasis || ''), exitBasis: String(exitBasis || ''),
    units: Math.max(1, Math.trunc(num(units, 1))),
    note: String(note || '').trim(),
    settings: pickSettings(settings),
    headline: {
      netPnl: num(last?.netPnl, NaN),
      returnPct: num(last?.returnPct, NaN),
      maxDrawdown: num(summary.maxDrawdown, NaN),
      positivePct: num(summary.positivePct, NaN),
      profitFactor: num(summary.profitFactor, NaN),
      validDays: num(summary.validDays, 0),
      missingDays: num(summary.missingDays, 0),
      capital: num(summary.capital, NaN),
    },
  };
}

/** بایگانی: تازه‌ترین اول، بریده به سقف، بی رکوردِ تکراری. */
export function addRun(list = [], record) {
  if (!record?.id) return Array.isArray(list) ? list : [];
  const rest = (Array.isArray(list) ? list : []).filter((item) => item.id !== record.id);
  return [record, ...rest].slice(0, RUN_CAP);
}

/**
 * تفاوتِ تنظیمِ دو اجرا — همان چیزی که مقایسه را معنادار می‌کند.
 *
 * ═══ چرا این مهم‌ترین بخشِ مقایسه است ═══
 *
 * دو ستونِ عدد، بی دانستنِ اینکه چه چیزی بینشان فرق داشته، فقط دو عدد است.
 * و بدتر: اگر **هیچ** تنظیمی فرق نداشته باشد و عددها فرق کنند، یعنی داده
 * عوض شده یا بازه — و آن خودش خبر است، نه اثرِ تنظیم.
 */
export function settingsDiff(a, b) {
  const rows = [];
  for (const item of RUN_SETTINGS) {
    const left = a?.settings?.[item.key];
    const right = b?.settings?.[item.key];
    if (left === undefined && right === undefined) continue;
    if (String(left) === String(right)) continue;
    rows.push({ ...item, left, right });
  }
  return rows;
}

/** مقایسهٔ سرخطِ دو اجرا. */
export function compareRuns(a, b) {
  if (!a || !b) return { rows: [], diff: [], same: false, reason: 'برای مقایسه دو اجرا لازم است' };
  const rows = RUN_HEADLINE.map((item) => {
    const left = num(a.headline?.[item.key], NaN);
    const right = num(b.headline?.[item.key], NaN);
    const delta = Number.isFinite(left) && Number.isFinite(right) ? right - left : NaN;
    return { ...item, left, right, delta };
  });
  const diff = settingsDiff(a, b);
  return {
    rows, diff,
    sameRange: a.from === b.from && a.to === b.to,
    sameCombo: a.comboName === b.comboName && a.uaName === b.uaName,
    same: diff.length === 0,
    reason: '',
  };
}

/** برچسب کوتاه هر اجرا — برای کشویی مقایسه. */
export function runLabel(record) {
  if (!record) return '—';
  const parts = [record.uaName, record.strategyName || record.comboName].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'اجرای بی‌نام';
}
