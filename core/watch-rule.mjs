// دیده‌بان شرطی — «بول‌کال‌اسپردهایی با فلان شرط، در هر نمادی، خبرم کن».
//
// ═══ چرا این جدا از `core/gap-alert.mjs` است ═══
//
// `gap-alert` یک شرط روی یک سنجه می‌گذارد و کارش را خوب می‌کند. خواستهٔ
// تازه سه چیز دارد که در آن قالب نمی‌گنجید:
//
//   چند شرط با هم   «حداکثر زیان ۱۵٪ **و** حداکثر سود ۴۰٪». دو قاعدهٔ
//                   جدا این را نمی‌سازد: هرکدام جدا آتش می‌کنند و
//                   کاربر ترکیبی می‌گیرد که فقط یکی از دو شرط را دارد.
//   آستانهٔ نسبی    «فاصله رسید به ۹۰٪ فاصلهٔ ۵ روز گذشته‌شان». آستانه
//                   دیگر عدد نیست، تابعی از تاریخِ خودِ همان ترکیب است.
//   چند نماد        «در میان همهٔ نمادها». دامنه از یک نماد بیرون می‌زند.
//
// ═══ دو قاعده‌ای که این فایل رویشان ساخته شده ═══
//
// **شرطِ نسنجیدنی، شرطِ برقرار نیست.** ترکیبی که «حداکثر زیان» ندارد
// (استرانگل فروش، که زیانش نامحدود است) با قیدِ «حداکثر زیان زیر ۱۵٪»
// آتش **نمی‌کند**. کنار گذاشتنش هم لازم نیست گفته شود؛ گفتنش لازم است.
// برای همین `explain()` برای هر شرط می‌گوید چه دید و چرا رد شد.
//
// **همهٔ شرط‌ها با «و».** «یا» عمداً نیامد: قاعده‌ای که با «یا» ساخته شود
// در عمل همان چند قاعدهٔ جداست، و کاربر با دیدنِ نتیجه نمی‌فهمد کدام
// شاخه‌اش آتش کرده.

import { num } from './num.mjs';
import { ALERT_OPS, alertOp } from './gap-alert.mjs';

const finite = (value) => Number.isFinite(value);

export { ALERT_OPS, alertOp };

/**
 * سنجه‌هایی که می‌شود رویشان شرط گذاشت.
 *
 * `group` فقط برای دسته‌بندی در فرم است. `history` یعنی این سنجه در
 * سریِ تاریخیِ همین ترکیب هم هست، پس آستانهٔ نسبی («٪ از میانگین N روز
 * گذشته») رویش کار می‌کند.
 */
export const WATCH_METRICS = [
  { id: 'current', label: 'فاصله / جمعِ اکنون', unit: 'rial', group: 'فاصله', history: true,
    hint: 'ارزش خالص ساختار در این لحظه، به مقیاسی که انتخاب کرده‌ای.' },
  { id: 'coveragePct', label: 'درصد پر شدن فاصله', unit: 'pct', group: 'فاصله', history: true,
    hint: 'ارزش کنونی بر لنگرِ ساختاری. در استرانگل یعنی پرمیوم چند درصدِ دهانه را می‌پوشاند.' },
  { id: 'roomPct', label: 'درصد جای باقی‌مانده', unit: 'pct', group: 'فاصله', history: true,
    hint: 'متمم درصد پر شدن.' },
  { id: 'gainedPct', label: 'حرکت از مبدأ مقایسه ٪', unit: 'pct', group: 'فاصله',
    hint: 'از نخستین روزِ بازه تا حالا، به نفع دارندهٔ آن موقعیت چقدر حرکت کرده. ورودِ واقعی تو نیست.' },
  { id: 'rank', label: 'صدک تاریخی فاصله', unit: 'pct', group: 'فاصله',
    hint: 'اکنون کجای توزیعِ تاریخیِ خودش ایستاده. صفر یعنی کمینه، صد یعنی بیشینه.' },
  { id: 'vsMeanPct', label: 'فاصله از میانگین تاریخی ٪', unit: 'pct', group: 'فاصله',
    hint: 'چند درصد بالاتر یا پایین‌تر از میانگینِ همین بازه.' },

  { id: 'maxProfit', label: 'حداکثر سود', unit: 'rial', group: 'سود و زیان',
    hint: 'سقف سود در سررسید. نامحدود، عدد نیست و با هیچ سقفی سنجیده نمی‌شود.' },
  { id: 'maxLoss', label: 'حداکثر زیان', unit: 'rial', group: 'سود و زیان',
    hint: 'اندازهٔ زیان، مثبت. در فروش برهنه نامحدود است و شرط رویش برقرار نمی‌شود.' },
  { id: 'returnPct', label: 'حداکثر سود ٪', unit: 'pct', group: 'سود و زیان',
    hint: 'بیشترین سود بر سرمایهٔ درگیر — همان مخرجی که بقیهٔ برنامه به کار می‌برد.' },
  { id: 'lossPct', label: 'حداکثر زیان ٪', unit: 'pct', group: 'سود و زیان',
    hint: 'بیشترین زیان بر سرمایهٔ درگیر.' },
  { id: 'rewardRisk', label: 'نسبت پاداش به ریسک', unit: 'num', group: 'سود و زیان',
    hint: 'بیشترین سود تقسیم بر بیشترین زیان.' },
  { id: 'perDayPct', label: 'بازده روزانه ٪', unit: 'pct', group: 'سود و زیان',
    hint: 'حداکثر سود درصدی، تقسیم بر روزهای مانده تا سررسید.' },
  { id: 'monthlyPct', label: 'بازده ماهانه ٪', unit: 'pct', group: 'سود و زیان',
    hint: 'همان، ضرب در روزهای ماه.' },

  { id: 'beWidthPct', label: 'پهنای بین دو سربه‌سری ٪', unit: 'pct', group: 'سربه‌سری',
    hint: 'پنجره‌ای که قیمت پایه می‌تواند در آن بماند و ترکیب زیان ندهد.' },
  { id: 'beLowPct', label: 'فاصله تا سربه‌سری پایین ٪', unit: 'pct', group: 'سربه‌سری',
    hint: 'منفی یعنی سربه‌سری پایین‌تر از قیمت فعلیِ پایه است.' },
  { id: 'beHighPct', label: 'فاصله تا سربه‌سری بالا ٪', unit: 'pct', group: 'سربه‌سری',
    hint: 'مثبت یعنی سربه‌سری بالاتر از قیمت فعلیِ پایه است.' },

  { id: 'legValue', label: 'ارزش معاملهٔ نازک‌ترین پا', unit: 'rial', group: 'بازار',
    hint: 'ترکیبی که یک پایش معامله نمی‌شود، روی کاغذ هست و در بازار نه.' },
  { id: 'legVolume', label: 'حجم معاملهٔ نازک‌ترین پا', unit: 'int', group: 'بازار' },
  { id: 'basePrice', label: 'قیمت نماد پایه', unit: 'rial', group: 'بازار', history: true,
    hint: 'برای شرطی که به خودِ سهم بسته است، نه به ساختار.' },
  { id: 'daysLeft', label: 'روز مانده تا سررسید', unit: 'day', group: 'بازار',
    hint: 'برای «سه روز مانده خبرم کن».' },
];

const METRIC_BY_ID = new Map(WATCH_METRICS.map((row) => [row.id, row]));
export const watchMetric = (id) => METRIC_BY_ID.get(String(id ?? '')) || null;
export const WATCH_METRIC_GROUPS = [...new Set(WATCH_METRICS.map((row) => row.group))];

/**
 * آستانه از کجا می‌آید.
 *
 * `abs` همان عددی است که تایپ می‌کنی. بقیه درصدی از یک مرجعِ متحرک‌اند و
 * همان چیزی هستند که خواسته شد: «فاصله رسید به ۹۰٪ فاصلهٔ ۵ روز گذشته».
 */
export const WATCH_REFS = [
  { id: 'abs', label: 'عددِ ثابت', window: false, hint: 'آستانه همان عددی است که می‌نویسی.' },
  { id: 'windowMean', label: '٪ از میانگین N روز گذشته', window: true,
    hint: 'میانگینِ N روزِ پیش از امروز. خودِ امروز در میانگین نمی‌آید، وگرنه شرط به خودش نگاه می‌کند.' },
  { id: 'windowMin', label: '٪ از کمینهٔ N روز گذشته', window: true },
  { id: 'windowMax', label: '٪ از بیشینهٔ N روز گذشته', window: true },
  { id: 'dayLow', label: '٪ از کفِ مشاهده‌شدهٔ امروز', window: false,
    hint: 'کمترین مقداری که از آغاز رصدِ زندهٔ امروز دیده شده — نه کمینهٔ بازهٔ تاریخی. پیش از نخستین تیک، عدد ندارد و شرط برقرار نمی‌شود.' },
  { id: 'dayHigh', label: '٪ از سقفِ مشاهده‌شدهٔ امروز', window: false,
    hint: 'بیشترین مقداری که از آغاز رصدِ زندهٔ امروز دیده شده — نه بیشینهٔ بازهٔ تاریخی.' },
];

const REF_BY_ID = new Map(WATCH_REFS.map((row) => [row.id, row]));
export const watchRef = (id) => REF_BY_ID.get(String(id ?? '')) || REF_BY_ID.get('abs');

export const DEFAULT_WINDOW_DAYS = 5;
export const DEFAULT_COOLDOWN_SEC = 120;

let ruleSeq = 0;
const newId = (prefix) => `${prefix}${(ruleSeq += 1).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * مرجعِ متحرکِ یک شرط، از عکسِ ترکیب.
 *
 * پنجره **پیش از** آخرین نقطه بسته می‌شود. اگر آخرین نقطه داخلش بود،
 * «فاصله به ۹۰٪ میانگین ۵ روز گذشته رسید» تا حدی به خودش نگاه می‌کرد و
 * هرچه پنجره کوتاه‌تر، شرط بی‌معنی‌تر.
 */
export function referenceValue(condition, snapshot) {
  const ref = watchRef(condition?.ref);
  if (ref.id === 'abs') return 1;
  if (ref.id === 'dayLow') return num(snapshot?.dayLow, NaN);
  if (ref.id === 'dayHigh') return num(snapshot?.dayHigh, NaN);
  const metric = watchMetric(condition?.metric);
  if (!metric?.history) return NaN;
  const series = snapshot?.history?.[metric.id];
  if (!Array.isArray(series) || series.length < 2) return NaN;
  const days = Math.max(1, Math.trunc(num(condition?.windowDays, DEFAULT_WINDOW_DAYS)));
  const window = series.slice(0, -1).filter(finite).slice(-days);
  if (!window.length) return NaN;
  if (ref.id === 'windowMin') return Math.min(...window);
  if (ref.id === 'windowMax') return Math.max(...window);
  return window.reduce((a, b) => a + b, 0) / window.length;
}

/** آستانهٔ مطلقِ یک شرط در این لحظه، یا `NaN` اگر مرجعش در دسترس نیست. */
export function thresholdOf(condition, snapshot) {
  const base = referenceValue(condition, snapshot);
  if (!finite(base)) return NaN;
  const value = num(condition?.value, NaN);
  if (!finite(value)) return NaN;
  return watchRef(condition?.ref).id === 'abs' ? value : base * (value / 100);
}

/** شرط خام از فرم را معتبر می‌کند، یا می‌گوید چرا نشد. */
export function normalizeCondition(raw = {}) {
  const metric = watchMetric(raw.metric);
  const op = alertOp(raw.op);
  if (!metric) return { ok: false, why: 'سنجهٔ ناشناخته' };
  if (!op) return { ok: false, why: 'عملگر ناشناخته' };
  const value = num(raw.value, NaN);
  if (!finite(value)) return { ok: false, why: 'آستانه عدد نیست' };
  const ref = watchRef(raw.ref);
  if (ref.window && !metric.history) {
    return { ok: false, why: `«${ref.label}» فقط روی سنجه‌هایی کار می‌کند که تاریخچه دارند؛ «${metric.label}» ندارد` };
  }
  return {
    ok: true,
    condition: {
      metric: metric.id, op: op.id, value, ref: ref.id,
      windowDays: ref.window
        ? Math.max(1, Math.min(250, Math.trunc(num(raw.windowDays, DEFAULT_WINDOW_DAYS))))
        : 0,
    },
  };
}

/** قاعدهٔ خام از فرم را معتبر می‌کند. قاعدهٔ بی‌شرط ساخته نمی‌شود. */
export function normalizeWatchRule(raw = {}) {
  const conditions = [];
  for (const one of Array.isArray(raw.conditions) ? raw.conditions : []) {
    const built = normalizeCondition(one);
    if (!built.ok) return { ok: false, why: built.why };
    conditions.push(built.condition);
  }
  if (!conditions.length) return { ok: false, why: 'قاعده دست‌کم یک شرط می‌خواهد' };
  const strategyIds = [...new Set((raw.strategyIds || []).map((id) => String(id)).filter(Boolean))];
  const baseIns = [...new Set((raw.baseIns || []).map((id) => String(id)).filter(Boolean))];
  return {
    ok: true,
    rule: {
      id: String(raw.id || newId('w')),
      name: String(raw.name || '').trim(),
      enabled: raw.enabled !== false,
      strategyIds, baseIns,
      comboKey: String(raw.comboKey || ''),
      conditions,
      cooldownSec: Math.max(0, Math.trunc(num(raw.cooldownSec, DEFAULT_COOLDOWN_SEC))),
      sound: raw.sound === true,
      firedCount: Math.max(0, Math.trunc(num(raw.firedCount, 0))),
      lastFiredAt: num(raw.lastFiredAt, 0) || 0,
    },
  };
}

/** جملهٔ خوانای یک شرط. */
export function conditionNote(condition) {
  const metric = watchMetric(condition?.metric), op = alertOp(condition?.op);
  if (!metric || !op) return 'شرط نامعتبر';
  const ref = watchRef(condition.ref);
  const value = Number(condition.value).toLocaleString('fa-IR', { maximumFractionDigits: 2 });
  if (ref.id === 'abs') {
    const unit = metric.unit === 'pct' ? '٪' : metric.unit === 'day' ? ' روز'
      : metric.unit === 'num' || metric.unit === 'int' ? '' : ' ریال';
    return `${metric.label} ${op.label} ⁨${value}⁩${unit}`;
  }
  const days = Number(condition.windowDays).toLocaleString('fa-IR');
  const where = (ref.window ? ref.label.replace('N', `⁨${days}⁩`) : ref.label).replace('٪ از ', '');
  return `${metric.label} ${op.label} ⁨${value}⁩٪ از ${where}`;
}

/** جملهٔ خوانای یک قاعده — همان که در فهرست و در متن هشدار می‌آید. */
export function watchRuleNote(rule) {
  const fa = (n) => Number(n).toLocaleString('fa-IR');
  const scope = [];
  if (rule?.comboKey) scope.push('یک ترکیب مشخص');
  else if (rule?.strategyIds?.length) scope.push(`⁨${fa(rule.strategyIds.length)}⁩ استراتژی`);
  else scope.push('هر استراتژی');
  scope.push(rule?.baseIns?.length ? `⁨${fa(rule.baseIns.length)}⁩ نماد` : 'هر نماد');
  const body = (rule?.conditions || []).map(conditionNote).join(' و ');
  return `${scope.join(' · ')} — ${body}`;
}

/**
 * آیا این ترکیب در دامنهٔ این قاعده هست؟
 *
 * سه لایه، و هر لایهٔ خالی یعنی «قید نگذاشته‌ام» نه «هیچ‌کدام»:
 * ترکیبِ مشخص، فهرست استراتژی، فهرست نماد پایه.
 */
export function inScope(rule, snapshot) {
  if (rule?.comboKey) return snapshot?.key === rule.comboKey;
  if (rule?.strategyIds?.length && !rule.strategyIds.includes(snapshot?.strategyId)) return false;
  if (rule?.baseIns?.length && !rule.baseIns.includes(String(snapshot?.baseIns ?? ''))) return false;
  return true;
}

/**
 * یک شرط را می‌سنجد و **می‌گوید چه دید**.
 *
 * برگرداندنِ فقط درست/غلط کافی نبود: کاربری که شرط گذاشته و هیچ هشداری
 * نمی‌گیرد باید بتواند ببیند سنجه چند بود و آستانه چند شد.
 */
export function checkCondition(condition, snapshot, prev = null, { previewCross = false } = {}) {
  const metric = watchMetric(condition?.metric);
  const op = alertOp(condition?.op);
  if (!metric || !op) return { held: false, why: 'شرط نامعتبر', value: NaN, threshold: NaN };
  const value = num(snapshot?.[metric.id], NaN);
  const threshold = thresholdOf(condition, snapshot);
  if (!finite(value)) {
    return { held: false, why: `«${metric.label}» برای این ترکیب عدد ندارد`, value: NaN, threshold };
  }
  if (!finite(threshold)) {
    return { held: false, why: 'مرجعِ آستانه در این لحظه در دسترس نیست', value, threshold: NaN };
  }
  if (op.needsPrev) {
    const before = num(prev?.[metric.id], NaN);
    // ── بن‌بستِ پیش‌نمایش ────────────────────────────────────────────
    //
    // «ساخت شرط عبور از آستانه عملاً بن‌بست دارد: عملگر پیش‌فرض به مقدار
    // قبلی نیاز دارد؛ در پیش‌نمایش مقدار قبلی وجود ندارد، پس صفر ترکیب
    // منطبق می‌شود و دکمهٔ شروع رصد غیرفعال می‌ماند.»
    //
    // پیش‌نمایش یک سنجش است، نه دو؛ عبور در آن **قابل مشاهده نیست** و
    // هیچ‌وقت هم نخواهد بود. پس در پیش‌نمایش — و فقط آنجا — «از این عدد
    // رد شد» مثل «آن‌سوی این عدد هست» سنجیده می‌شود: کاربر می‌بیند
    // قاعده روی چه چیزی می‌نشیند. زنگِ واقعی همچنان فقط در لحظهٔ عبور
    // می‌زند، و `preview: true` این تفاوت را حمل می‌کند تا رابط بتواند
    // بگوید چه چیزی نشان داده شده.
    if (previewCross && !finite(before)) {
      const held = op.id === 'crossUp' ? value >= threshold : value <= threshold;
      return { held, preview: true, value, threshold,
        why: held ? 'در پیش‌نمایش، «عبور» مثل «بودن» سنجیده شد' : 'شرط برقرار نیست' };
    }
    if (!finite(before)) return { held: false, why: 'هنوز سنجش قبلی‌ای نیست تا عبور دیده شود', value, threshold };
    const crossed = op.id === 'crossUp'
      ? before < threshold && value >= threshold
      : before > threshold && value <= threshold;
    return { held: crossed, why: crossed ? '' : 'عبوری رخ نداد', value, threshold, before };
  }
  const held = op.id === 'ge' ? value >= threshold : value <= threshold;
  return { held, why: held ? '' : 'شرط برقرار نیست', value, threshold };
}

/** همهٔ شرط‌های یک قاعده روی یک ترکیب. «و» است، پس اولین ناکامی کافی است. */
export function checkRule(rule, snapshot, prev = null, { previewCross = false } = {}) {
  const parts = (rule?.conditions || []).map((condition) => ({
    condition, ...checkCondition(condition, snapshot, prev, { previewCross }),
  }));
  return { held: parts.length > 0 && parts.every((part) => part.held), parts };
}

/**
 * همهٔ قاعده‌ها روی همهٔ ترکیب‌ها، یک بار.
 *
 * `nowMs` تزریق می‌شود تا آزمون بتواند ساعت را خودش بچرخاند؛
 * `Date.now()` داخل تابع یعنی آزمونِ زمان‌دار.
 */
export function evaluateWatch({ rules = [], snapshots = [], prev = {}, nowMs = 0, previewCross = false } = {}) {
  const fired = [];
  const matched = new Map();
  const touched = new Map();
  for (const rule of rules) {
    if (!rule?.enabled) continue;
    const hits = [];
    for (const snapshot of snapshots) {
      if (!inScope(rule, snapshot)) continue;
      const verdict = checkRule(rule, snapshot, prev[snapshot.key] || null, { previewCross });
      if (!verdict.held) continue;
      hits.push({ snapshot, parts: verdict.parts });
    }
    matched.set(rule.id, hits);
    if (!hits.length) continue;
    const since = nowMs - num(rule.lastFiredAt, 0);
    if (rule.lastFiredAt && since < rule.cooldownSec * 1000) continue;
    touched.set(rule.id, nowMs);
    for (const hit of hits) {
      fired.push({
        ruleId: rule.id, ruleName: rule.name || watchRuleNote(rule),
        comboKey: hit.snapshot.key, label: hit.snapshot.label || '',
        strategyName: hit.snapshot.strategyName || '', baseName: hit.snapshot.baseName || '',
        at: nowMs, sound: rule.sound === true,
        parts: hit.parts.map((part) => ({
          metric: part.condition.metric, op: part.condition.op,
          value: part.value, threshold: part.threshold, note: conditionNote(part.condition),
        })),
      });
    }
  }
  const nextRules = rules.map((rule) => (touched.has(rule.id)
    ? { ...rule, lastFiredAt: touched.get(rule.id), firedCount: (rule.firedCount || 0) + 1 }
    : rule));
  const nextPrev = { ...prev };
  for (const snapshot of snapshots) nextPrev[snapshot.key] = snapshot;
  return { fired, matched, rules: nextRules, prev: nextPrev };
}

/**
 * عکسِ یک ردیفِ رادار برای موتور شرط.
 *
 * یک جا ساخته می‌شود چون هم حلقهٔ شرط می‌خواهدش و هم جدولِ پیش‌نمایش.
 * دو نسخهٔ جدا یعنی روزی شرط روی عددی آتش می‌کند که جدول نشانش نمی‌دهد.
 */
export function watchSnapshot(row, { baseIns = '', baseName = '', basePrice = NaN, day = null } = {}) {
  const gap = row?.gap || {};
  const metrics = row?.metrics || {};
  const verdict = row?.verdict || {};
  const points = row?.series?.points || [];
  const column = (field) => points.map((point) => num(point[field], NaN));
  return {
    key: row?.key || '', label: `${row?.def?.name || ''} · ${(row?.strikes || []).join('/')}`,
    strategyId: row?.def?.id || '', strategyName: row?.def?.name || '',
    baseIns: String(baseIns), baseName,
    current: num(gap.current, NaN),
    coveragePct: num(gap.coveragePct, NaN),
    roomPct: num(gap.roomPct, NaN),
    gainedPct: num(gap.gainedPct, NaN),
    rank: num(verdict.rank, NaN),
    vsMeanPct: num(verdict.vsMean, NaN),
    maxProfit: num(metrics.maxProfit, NaN),
    maxLoss: num(metrics.maxLoss, NaN),
    returnPct: num(metrics.returnPct, NaN),
    lossPct: num(metrics.lossPct, NaN),
    rewardRisk: num(metrics.rewardRisk, NaN),
    perDayPct: num(metrics.perDayPct, NaN),
    monthlyPct: num(metrics.monthlyPct, NaN),
    beWidthPct: num(metrics.beWidthPct, NaN),
    beLowPct: num(metrics.beLowPct, NaN),
    beHighPct: num(metrics.beHighPct, NaN),
    legValue: num(metrics.legValue, NaN),
    legVolume: num(metrics.legVolume, NaN),
    basePrice: num(basePrice, NaN),
    daysLeft: num(gap.daysLeft, NaN),
    // ── کف و سقفِ امروز، از خودِ امروز ─────────────────────────────
    //
    // پیش از این `Math.min` و `Math.max` سریِ **روزانهٔ بازه** بود، و شرطِ
    // «٪ از کف امروز» در عمل روی کفِ سه‌ماهه می‌نشست. حالا فقط از دفترِ
    // مشاهده‌های امروز (`core/day-range.mjs`) می‌آید؛ نداشتنش `NaN` است و
    // `NaN` یعنی شرط برقرار نمی‌شود — نه اینکه با عددِ تاریخی برقرار شود.
    dayLow: num(day?.low, NaN),
    dayHigh: num(day?.high, NaN),
    history: { current: column('current'), coveragePct: column('coveragePct'),
      roomPct: column('roomPct'), basePrice: column('basePrice') },
  };
}


/**
 * چقدر مانده تا این قاعده روی این ترکیب برقرار شود — برای اولویتِ سهمیهٔ زنده.
 *
 * عددِ برگشتی «فاصلهٔ نسبی» است: صفر یعنی همین حالا برقرار است، و هرچه
 * بزرگ‌تر، دورتر. مقایسه نسبی است نه ریالی، وگرنه شرطِ «حداکثر سود ۴۰٪»
 * و شرطِ «فاصله ۳۰۰٬۰۰۰ ریال» با یک خط‌کش سنجیده می‌شدند.
 *
 * بدترین شرط ملاک است، نه بهترین: قاعده «و» است، پس ترکیبی نزدیک است که
 * **همهٔ** شرط‌هایش نزدیک باشند.
 */
export function watchDistance(rule, snapshot) {
  const parts = (rule?.conditions || []).map((condition) => {
    const metric = watchMetric(condition?.metric);
    if (!metric) return NaN;
    const value = num(snapshot?.[metric.id], NaN);
    const threshold = thresholdOf(condition, snapshot);
    if (!finite(value) || !finite(threshold)) return NaN;
    const scale = Math.max(Math.abs(threshold), 1);
    const op = alertOp(condition.op)?.id;
    const met = op === 'le' || op === 'crossDown' ? value <= threshold : value >= threshold;
    return met ? 0 : Math.abs(value - threshold) / scale;
  });
  if (!parts.length || parts.some((one) => !finite(one))) return NaN;
  return Math.max(...parts);
}
