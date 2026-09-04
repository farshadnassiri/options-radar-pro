// هشدارِ فاصله — شرط، سنجه، و لحظه‌ای که شرط برقرار می‌شود.
//
// ═══ چرا موتورش از رابط جداست ═══
//
// «وقتی فاصله به ۳۰۰ رسید خبرم کن» دو کار جداست: تصمیمِ اینکه شرط برقرار
// شده، و کارِ نشان‌دادن. اولی ریاضی محض است و باید آزمون داشته باشد؛ دومی
// Notification و صدا و کارت است و در مرورگر آزمون‌پذیر نیست. اگر یکی
// بودند، هیچ‌کدام آزمون نداشتند.
//
// ═══ عبور، نه بودن ═══
//
// دو خانوادهٔ عملگر هست و تفاوتشان مهم است:
//
//   بودن (`ge`, `le`)   هر بار که سنجیده شود و شرط برقرار باشد آتش می‌کند.
//                       برای «همین حالا زیر ۲۰ صدک است» درست است.
//   عبور (`crossUp`, `crossDown`)  فقط لحظه‌ای که از آن‌طرف خط رد می‌شود.
//                       برای «به ۳۰۰ رسید» درست است — و همان چیزی است که
//                       کاربر واقعاً می‌خواهد. با «بودن»، هشدارِ ۳۰۰ از
//                       لحظهٔ ۳۰۱ تا ۵۰۰ در هر تیک تکرار می‌شد.
//
// عبور به مقدارِ **قبلی** نیاز دارد، پس موتور بی‌حالت نیست: `prev` را
// می‌گیرد و `next` را برمی‌گرداند. صداکننده همان را نگه می‌دارد.
//
// ═══ آرامش ═══
//
// `cooldownSec` جلوی هشداری را می‌گیرد که روی خط می‌لرزد. بی آن، فاصله‌ای
// که دور ۳۰۰ نوسان می‌کند در یک دقیقه ده بار زنگ می‌زند و کاربر همه را
// خاموش می‌کند — که بدتر از نداشتنِ هشدار است.

import { num } from './num.mjs';

/**
 * سنجه‌هایی که می‌شود رویشان شرط گذاشت.
 *
 * `unit` فقط برچسب نیست: رابط از رویش تصمیم می‌گیرد ورودی را با چه گامی
 * بگیرد و عدد را چطور قالب کند.
 */
export const ALERT_METRICS = [
  { id: 'current', label: 'فاصلهٔ اکنون', unit: 'rial', hint: 'ارزش خالص ساختار در این لحظه، به ریالِ هر واحد. همان عددی که «موقع فروش ۳۰۰ بود و یک دقیقه بعد ۳۱۰».' },
  { id: 'coveragePct', label: 'درصد پر شدن فاصله', unit: 'pct', hint: 'فاصلهٔ اکنون بر فاصلهٔ اعمال. صد یعنی ساختار به سقفِ ساختاری‌اش رسیده.' },
  { id: 'roomPct', label: 'درصد جای باقی‌مانده', unit: 'pct', hint: 'متمم درصد پر شدن. هرچه بزرگ‌تر، جا برای حرکت بیشتر.' },
  { id: 'upsidePct', label: 'سود باقی‌مانده', unit: 'pct', hint: 'سودِ مانده تا پرشدنِ کامل، بر سرمایه‌ای که همین حالا درگیرش می‌شوی.' },
  { id: 'filledPct', label: 'درصد سودِ گرفته‌شده', unit: 'pct', hint: 'از بیشینهٔ سودِ ممکنِ همین موقعیت، چقدرش محقق شده. به قیمت ورودِ خودت بسته است.' },
  { id: 'perDay', label: 'سود روزانهٔ باقی‌مانده', unit: 'pct', hint: 'سود باقی‌مانده تقسیم بر روزهای مانده تا سررسید.' },
  { id: 'rank', label: 'صدک تاریخی فاصله', unit: 'pct', hint: 'فاصلهٔ اکنون کجای توزیعِ تاریخیِ خودش ایستاده. صفر یعنی کمینهٔ تاریخی، صد یعنی بیشینه.' },
  { id: 'vsMeanPct', label: 'فاصله از میانگین تاریخی', unit: 'pct', hint: 'چند درصد بالاتر یا پایین‌تر از میانگینِ همین بازه. منفی یعنی پایین‌تر.' },
  { id: 'fromDayLowPct', label: 'درصد از کف امروز', unit: 'pct', hint: 'چند درصد بالاتر از کمترین فاصلهٔ امروز است.' },
  { id: 'fromDayHighPct', label: 'درصد از سقف امروز', unit: 'pct', hint: 'چند درصد پایین‌تر از بیشترین فاصلهٔ امروز است. همیشه صفر یا منفی.' },
  { id: 'basePrice', label: 'قیمت نماد پایه', unit: 'rial', hint: 'برای شرطی که به خودِ سهم بسته است، نه به ساختار.' },
  { id: 'daysLeft', label: 'روز مانده تا سررسید', unit: 'day', hint: 'برای «سه روز مانده خبرم کن».' },
];

const METRIC_BY_ID = new Map(ALERT_METRICS.map((row) => [row.id, row]));
export const alertMetric = (id) => METRIC_BY_ID.get(String(id ?? '')) || null;

/** عملگرها. «عبور» به مقدار قبلی نیاز دارد، «بودن» نه. */
export const ALERT_OPS = [
  { id: 'crossUp', label: 'از این عدد رد شد، رو به بالا', needsPrev: true },
  { id: 'crossDown', label: 'از این عدد رد شد، رو به پایین', needsPrev: true },
  { id: 'ge', label: 'برابر یا بیشتر از', needsPrev: false },
  { id: 'le', label: 'برابر یا کمتر از', needsPrev: false },
];

const OP_BY_ID = new Map(ALERT_OPS.map((row) => [row.id, row]));
export const alertOp = (id) => OP_BY_ID.get(String(id ?? '')) || null;

export const DEFAULT_COOLDOWN_SEC = 120;

// شناسهٔ قاعده از شمارنده و تصادف ساخته می‌شود، نه از ساعت. این ماژول
// عمداً هیچ‌جا `Date.now()` صدا نمی‌زند: زمان تزریق می‌شود تا آزمون بتواند
// ساعت را خودش بچرخاند و «دورهٔ آرامش» قابل سنجش باشد.
let ruleSeq = 0;
const newRuleId = () => `r${(ruleSeq += 1).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * قاعدهٔ خام از فرم را به قاعدهٔ معتبر تبدیل می‌کند، یا می‌گوید چرا نشد.
 *
 * اعتبارسنجی اینجاست نه در رابط، چون قاعده‌ها در حافظهٔ مرورگر ذخیره
 * می‌شوند و نسخهٔ بعدی برنامه همان‌ها را می‌خواند. قاعدهٔ خرابِ ذخیره‌شده
 * باید همین‌جا رد شود، نه اینکه در حلقهٔ سنجش خطا بدهد.
 */
export function normalizeRule(raw = {}) {
  const metric = alertMetric(raw.metric);
  const op = alertOp(raw.op);
  if (!metric) return { ok: false, why: 'سنجهٔ ناشناخته' };
  if (!op) return { ok: false, why: 'عملگر ناشناخته' };
  const value = num(raw.value, NaN);
  if (!Number.isFinite(value)) return { ok: false, why: 'آستانه عدد نیست' };
  return {
    ok: true,
    rule: {
      id: String(raw.id || newRuleId()),
      enabled: raw.enabled !== false,
      label: String(raw.label || '').trim(),
      scope: String(raw.scope || ''),
      comboKey: String(raw.comboKey || ''),
      strategyId: String(raw.strategyId || ''),
      metric: metric.id, op: op.id, value,
      cooldownSec: Math.max(0, Math.trunc(num(raw.cooldownSec, DEFAULT_COOLDOWN_SEC))),
      sound: raw.sound === true,
      firedCount: Math.max(0, Math.trunc(num(raw.firedCount, 0))),
      lastFiredAt: num(raw.lastFiredAt, 0) || 0,
    },
  };
}

/** جملهٔ خوانای یک قاعده — همان که در فهرست و در متن هشدار می‌آید. */
export function ruleNote(rule) {
  const metric = alertMetric(rule?.metric), op = alertOp(rule?.op);
  if (!metric || !op) return 'قاعدهٔ نامعتبر';
  const unit = metric.unit === 'pct' ? '٪' : metric.unit === 'day' ? ' روز' : ' ریال';
  const value = Number(rule.value).toLocaleString('fa-IR', { maximumFractionDigits: 2 });
  return `${metric.label} ${op.label} ⁨${value}⁩${unit}`;
}

/**
 * آیا این قاعده در این لحظه آتش می‌کند؟
 *
 * @param rule     قاعدهٔ نرمال‌شده
 * @param snapshot عکسِ سنجه‌ها در این لحظه — کلیدهایش شناسهٔ سنجه‌اند
 * @param prev     همان عکس در سنجشِ قبلی، یا `null` در نخستین سنجش
 * @param nowMs    زمان، برای آرامش. تزریق می‌شود تا آزمون بتواند ساعت را
 *                 خودش بچرخاند؛ `Date.now()` داخل تابع یعنی آزمونِ زمان‌دار.
 */
export function ruleFires(rule, snapshot = {}, prev = null, nowMs = 0) {
  if (!rule?.enabled) return { fires: false, why: 'خاموش' };
  const value = num(snapshot[rule.metric], NaN);
  if (!Number.isFinite(value)) return { fires: false, why: 'سنجه در این لحظه عدد ندارد' };
  const op = alertOp(rule.op);
  if (!op) return { fires: false, why: 'عملگر ناشناخته' };

  if (op.needsPrev) {
    // نخستین سنجش هیچ عبوری ندیده. آتش‌کردن در آن، هر بار که تب باز شود
    // یک زنگِ کاذب می‌داد.
    const before = num(prev?.[rule.metric], NaN);
    if (!Number.isFinite(before)) return { fires: false, why: 'هنوز سنجش قبلی‌ای نیست تا عبور دیده شود' };
    const crossed = rule.op === 'crossUp'
      ? before < rule.value && value >= rule.value
      : before > rule.value && value <= rule.value;
    if (!crossed) return { fires: false, why: 'عبوری رخ نداد', value };
  } else {
    const held = rule.op === 'ge' ? value >= rule.value : value <= rule.value;
    if (!held) return { fires: false, why: 'شرط برقرار نیست', value };
  }

  const since = nowMs - num(rule.lastFiredAt, 0);
  if (rule.lastFiredAt && since < rule.cooldownSec * 1000) {
    return { fires: false, why: 'در دورهٔ آرامش', value, quietFor: Math.round((rule.cooldownSec * 1000) - since) / 1000 };
  }
  return { fires: true, why: '', value };
}

/**
 * همهٔ قاعده‌ها را یک بار می‌سنجد.
 *
 * `snapshots` نگاشتِ کلیدِ ترکیب به عکسِ سنجه‌های همان ترکیب است. قاعده‌ای
 * که `comboKey` دارد فقط به همان ترکیب نگاه می‌کند؛ قاعدهٔ بی‌کلید به
 * **همهٔ** ترکیب‌ها — و آن، «برای هر استرانگلِ این نماد» را ممکن می‌کند
 * بی آنکه کاربر سی قاعده بسازد.
 */
export function evaluateAlerts({ rules = [], snapshots = {}, prev = {}, nowMs = 0 } = {}) {
  const fired = [];
  const touched = new Map();
  for (const rule of rules) {
    const keys = rule.comboKey ? [rule.comboKey] : Object.keys(snapshots);
    for (const key of keys) {
      const snapshot = snapshots[key];
      if (!snapshot) continue;
      // قاعده‌ای که استراتژی را نام برده، فقط همان خانواده را می‌بیند.
      if (rule.strategyId && snapshot.strategyId !== rule.strategyId) continue;
      const verdict = ruleFires(rule, snapshot, prev[key] || null, nowMs);
      if (!verdict.fires) continue;
      fired.push({
        ruleId: rule.id, comboKey: key, metric: rule.metric, op: rule.op,
        threshold: rule.value, value: verdict.value, at: nowMs,
        label: rule.label || snapshot.label || '', note: ruleNote(rule),
        strategyName: snapshot.strategyName || '', sound: rule.sound === true,
      });
      touched.set(rule.id, nowMs);
    }
  }
  // قاعده‌ها بازنویسی نمی‌شوند؛ نسخهٔ تازه برمی‌گردد. جهش‌دادنِ ورودی یعنی
  // صداکننده نمی‌تواند بفهمد چه عوض شد.
  const nextRules = rules.map((rule) => (touched.has(rule.id)
    ? { ...rule, lastFiredAt: touched.get(rule.id), firedCount: (rule.firedCount || 0) + 1 }
    : rule));
  return { fired, rules: nextRules, prev: { ...prev, ...snapshots } };
}

/**
 * عکسِ سنجه‌ها از یک اندازه‌گیریِ فاصله، به‌علاوهٔ بسترِ روز و تاریخ.
 *
 * یک جا ساخته می‌شود چون هم حلقهٔ هشدار می‌خواهدش و هم جدولِ زنده. دو
 * نسخهٔ جدا یعنی روزی هشدار روی عددی آتش می‌کند که جدول نشانش نمی‌دهد.
 */
export function alertSnapshot({ gap, verdict = null, day = null, basePrice = NaN, label = '', strategyId = '', strategyName = '' } = {}) {
  const low = num(day?.low, NaN), high = num(day?.high, NaN);
  const current = num(gap?.current, NaN);
  return {
    label, strategyId, strategyName,
    current, coveragePct: num(gap?.coveragePct, NaN), roomPct: num(gap?.roomPct, NaN),
    upsidePct: num(gap?.upsidePct, NaN), filledPct: num(gap?.filledPct, NaN),
    perDay: num(gap?.perDay, NaN), daysLeft: num(gap?.daysLeft, NaN),
    rank: num(verdict?.rank, NaN), vsMeanPct: num(verdict?.vsMean, NaN),
    fromDayLowPct: Number.isFinite(low) && low > 0 && Number.isFinite(current)
      ? ((current / low) - 1) * 100 : NaN,
    fromDayHighPct: Number.isFinite(high) && high > 0 && Number.isFinite(current)
      ? ((current / high) - 1) * 100 : NaN,
    basePrice: num(basePrice, NaN),
  };
}
