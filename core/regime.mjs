// رژیم بازار — صعودی، نزولی، راکد.
//
// دو کار دارد و هر دو به یک قاعده تکیه می‌کنند. اول برچسب‌زدن روزها، تا
// گزارش تجمیعی بتواند بگوید «در بازار نزولی چه کردی». دوم انتخاب تاریخ
// شروع به‌صورت **تصادفی لایه‌بندی‌شده**: اگر تاریخ‌ها را یکنواخت برداریم،
// در بازاری که بیشتر سالش صعودی بوده، تمرین هم بیشتر صعودی می‌شود و
// معامله‌گر یاد می‌گیرد «همیشه کال بخر».
//
// ═══ چرا پنجرهٔ عقب‌رو و نه مرکزی ═══
//
// وسوسه‌انگیز است که رژیم هر روز را از پنجره‌ای حول همان روز حساب کنیم؛
// برچسب تمیزتری می‌دهد. ولی آن پنجره روزهای **بعد** از آن روز را هم
// می‌بیند، و برچسبی که در رابط کاربر ظاهر شود — حتی به‌عنوان یک کلمه —
// به او می‌گوید بازار بعداً چه کرد. پنجره عقب‌روست و همین‌جا هم می‌ماند.
//
// ═══ چرا این قاعده و نه قاعدهٔ بهتری ═══
//
// چون قرار است **نمایش داده شود**. سند می‌گوید قاعدهٔ رژیم باید در تنظیمات
// و در گزارش دیده شود. قاعده‌ای که کاربر بتواند در یک جمله بخواندش و با
// چشم روی نمودار وارسی کند، از قاعدهٔ دقیق‌تری که کسی نمی‌فهمدش بهتر است.

import { num } from './num.mjs';
import { normalizeHistoryDate } from './history.mjs';
import { makeRng, shuffle } from './rng.mjs';

export const REGIMES = {
  up:   { key: 'up', label: 'صعودی' },
  down: { key: 'down', label: 'نزولی' },
  flat: { key: 'flat', label: 'راکد' },
};

export const REGIME_KEYS = ['up', 'down', 'flat'];

/** پیش‌فرض قاعده. هر دو در تنظیمات قابل تغییرند و در گزارش نوشته می‌شوند. */
export const REGIME_RULE = { windowDays: 20, thresholdPct: 5 };

/** جملهٔ فارسی قاعده، همان که در تنظیمات و گزارش نشان داده می‌شود. */
export function regimeRuleText({ windowDays = 20, thresholdPct = 5 } = {}) {
  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  return `بازده ${fa(windowDays)} روز معاملاتی گذشتهٔ شاخص کل: بیش از ${fa(thresholdPct)}٪ صعودی، کمتر از منفی ${fa(thresholdPct)}٪ نزولی، بینشان راکد.`;
}

/**
 * برچسب رژیم برای هر روز از یک سری.
 *
 * روزهایی که هنوز پنجره پر نشده `null` می‌گیرند — نه «راکد». راکد یک
 * حکم است و ما در آن روزها حکمی نداریم؛ نشاندن راکد به‌جای ندانستن، هر
 * آمار لایه‌بندی‌شده‌ای را از ابتدای بازه به سمت راکد کج می‌کرد.
 */
export function regimeSeries(rows = [], rule = REGIME_RULE) {
  const span = Math.max(2, Math.trunc(num(rule?.windowDays, REGIME_RULE.windowDays)));
  const threshold = Math.abs(num(rule?.thresholdPct, REGIME_RULE.thresholdPct));
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ date: normalizeHistoryDate(row?.date), close: num(row?.close, NaN) }))
    .filter((row) => row.date && row.close > 0)
    .sort((a, b) => a.date - b.date);

  return list.map((row, at) => {
    const back = at - span;
    if (back < 0) return { date: row.date, close: row.close, regime: null, changePct: NaN };
    const base = list[back].close;
    const changePct = base > 0 ? ((row.close - base) / base) * 100 : NaN;
    if (!Number.isFinite(changePct)) return { date: row.date, close: row.close, regime: null, changePct: NaN };
    const regime = changePct > threshold ? 'up' : changePct < -threshold ? 'down' : 'flat';
    return { date: row.date, close: row.close, regime, changePct };
  });
}

/** روزهای هر رژیم، به تفکیک. روز بی‌برچسب در هیچ سطلی نیست. */
export function regimeBuckets(series = []) {
  const out = { up: [], down: [], flat: [], unlabeled: [] };
  for (const row of series || []) {
    if (row.regime && out[row.regime]) out[row.regime].push(row.date);
    else out.unlabeled.push(row.date);
  }
  return out;
}

/**
 * انتخاب تاریخ شروع، لایه‌بندی‌شده و بازتولیدپذیر.
 *
 * از هر سه رژیم به نسبت مساوی برمی‌دارد. رژیمی که در بازه اصلاً روزی
 * ندارد، سهمش را به بقیه نمی‌دهد و در `missing` گزارش می‌شود: «هر سه
 * رژیم مساوی» وقتی یکی از آن‌ها وجود نداشته باشد، ادعای غلطی است و باید
 * دیده شود، نه اینکه بی‌صدا به دو رژیم تبدیل شود.
 *
 * `exclude` تاریخ‌هایی است که قبلاً بازی شده‌اند — بند ضد تقلب: بازی مجدد
 * همان تاریخ مجاز نیست مگر با پرچم تمرینی.
 */
export function stratifiedPick(series = [], { seed = 'bereket', count = 1, exclude = [] } = {}) {
  const skip = new Set((exclude || []).map((date) => normalizeHistoryDate(date)).filter(Boolean));
  const buckets = regimeBuckets(series);
  const rng = makeRng(seed);
  const pools = {};
  const missing = [];
  for (const key of REGIME_KEYS) {
    const pool = (buckets[key] || []).filter((date) => !skip.has(date));
    if (!pool.length) missing.push(key);
    pools[key] = shuffle(rng, pool);
  }
  const want = Math.max(1, Math.trunc(num(count, 1)));
  const picks = [];
  let round = 0;
  while (picks.length < want && round < want + REGIME_KEYS.length) {
    let took = 0;
    for (const key of REGIME_KEYS) {
      if (picks.length >= want) break;
      const date = pools[key].shift();
      if (!date) continue;
      picks.push({ date, regime: key });
      took += 1;
    }
    if (!took) break;
    round += 1;
  }
  return { picks, missing, available: Object.fromEntries(REGIME_KEYS.map((k) => [k, pools[k].length + picks.filter((p) => p.regime === k).length])) };
}

/** رژیم یک تاریخ مشخص، یا null اگر برچسب ندارد. */
export function regimeAt(series = [], date) {
  const want = normalizeHistoryDate(date);
  const row = (series || []).find((item) => item.date === want);
  return row?.regime || null;
}

/** برچسب فارسی یک کلید رژیم. */
export function regimeLabel(key) {
  return REGIMES[key]?.label || 'بی‌برچسب';
}
