// انتقال یک ترکیب زنده به تب بک‌تست.
//
// تب‌های استراتژی و برترین موقعیت‌ها یک عکس لحظه‌ای‌اند: می‌گویند این ترکیب
// همین حالا چه شکلی است، ولی نمی‌گویند تا امروز چه کرده. بک‌تست سریع همان
// را می‌گوید. تا امروز راهی از این طرف به آن طرف نبود و کاربر باید نماد و
// استراتژی و ترکیب را دستی دوباره می‌چید.
//
// فقط انتخاب‌ها منتقل می‌شوند، نه نتیجه‌ها — همان قاعده‌ای که انتقال از تب
// «آزمون همه استراتژی‌ها» از قبل داشت. اگر عددی از اینجا کپی می‌شد، دو تب
// می‌توانستند دو حرف بزنند و معلوم نبود کدام مال کدام محاسبه است.
//
// تاریخ‌ها «خودکار»اند: ردیف زنده تاریخ ندارد. بک‌تست خودش بلندترین بازهٔ
// موجود همان ترکیب را برمی‌دارد — قدیمی‌ترین روزِ دارای ترکیب معتبر تا
// تازه‌ترین روزِ دارای قیمت کامل. حدس‌زدن یک بازهٔ ثابت از اینجا، بازه‌ای
// می‌ساخت که ممکن است برای این قرارداد اصلاً وجود نداشته باشد.

import { normalizeHistoryDate } from '../core/history.mjs';
import { HISTORY_BASIS_KEYS } from '../core/history-chain.mjs';
import { watchMetric } from '../core/watch-rule.mjs';
import { GAP_STRATEGY_IDS } from '../core/spread-gap.mjs';

/** بازهٔ مقصد پیش از گرفتن فهرست قراردادها از تاریخ‌های مبدأ تعیین می‌شود. */
export function handoffRange(plan) {
  if (plan?.to !== 'backtest') return null;
  const from = normalizeHistoryDate(plan.entryDate), to = normalizeHistoryDate(plan.exitDate);
  return from && to && from <= to ? { from, to } : null;
}

const legIns = (row) => (row.__legs || [])
  .filter((leg) => leg.kind !== 'underlying' && leg.ins)
  .map((leg) => String(leg.ins));

/** آیا این ردیف اصلاً قابل انتقال است؟ */
export function canHandoff(row) {
  return !!row && !!row.uaIns && legIns(row).length > 0;
}

/**
 * نقشهٔ انتقال یک ردیف زنده.
 *
 * `units` انتخاب فراخواننده است، نه استخراج از نتیجه‌های ردیف: تب مبدأ حجم
 * زندهٔ خودش را می‌دهد (`row.qty`) و تب مقصد همان را در فرمش نشان می‌دهد و
 * قابل تغییر نگه می‌دارد. هیچ عددِ *نتیجه*‌ای منتقل نمی‌شود — همان قاعده‌ای
 * که بالا آمد.
 */
/**
 * مهرِ تاریخیِ یک ردیف — تاریخ و مبنایی که عددهایش از آن ساخته شده‌اند.
 *
 * ═══ چرا لازم شد ═══
 *
 * گزارش ۱۴۰۵/۰۶/۱۷: «ردیف رصد تاریخی هنگام انتقال، تاریخ مبدأ را از دست
 * می‌دهد … مبدأ ۱۴۰۵/۰۶/۱۵ بود ولی مقصد ۱۴۰۵/۰۶/۱۶ را انتخاب کرد. فقط یک
 * نقطه باقی ماند و نمودارها ساخته نشدند.»
 *
 * نقشهٔ انتقال از روزی نوشته شده بود که تبِ استراتژی فقط ردیفِ **زنده**
 * داشت: `entryDate` همیشه `auto` و مقصدِ یونانی همیشه `live: true`. آن فرض
 * در کامنتِ خودش هم صریح نوشته شده بود — و وقتی زیرتبِ «رصد تاریخی» ساخته
 * شد، بی‌صدا غلط شد. ردیف تاریخ را داشت (`runHistoryScan` روی هر ردیف
 * `historyDate` و `historyBasis` می‌گذارد) و مقصدها هم تاریخِ صریح را
 * می‌پذیرند؛ فقط وسط، کسی آن را نمی‌فرستاد.
 *
 * `null` یعنی ردیف زنده است و رفتارِ `auto` سرِ جایش می‌ماند.
 */
export function historyStamp(row) {
  const date = normalizeHistoryDate(row?.historyDate);
  if (!(date > 0)) return null;
  const basis = String(row?.historyBasis || '');
  return { date, basis: HISTORY_BASIS_KEYS.has(basis) ? basis : '' };
}

export function handoffPlan(row, opt = {}) {
  const stamp = historyStamp(row);
  return {
    to: 'backtest', from: opt.from || 'strategy',
    uaIns: String(row.uaIns), uaName: row.underlying || 'نماد پایه',
    strategyId: opt.strategyId || row.strategyId || '',
    strategyName: row.strategy || opt.strategyName || '',
    legIns: legIns(row),
    comboName: row.legsText || '',
    // ردیفِ تاریخی روزِ خودش را می‌برد. روزِ **خروج** همچنان `auto` است:
    // ردیفِ مبدأ یک روز است و انتخابِ روزِ سنجش کارِ مقصد است.
    entryDate: stamp ? stamp.date : 'auto',
    exitDate: 'auto',
    // و با همان مبنایی که عددهای مبدأ از آن ساخته شدند، وگرنه دو صفحه دو
    // عدد می‌گویند برای یک ترکیب و یک روز.
    entryBasis: stamp?.basis || opt.entryBasis || 'LAST',
    exitBasis: stamp?.basis || opt.exitBasis || 'LAST',
    units: Math.max(1, Math.trunc(Number(opt.units) || 1)),
    // «زنده» و «تاریخی» با هم جمع نمی‌شوند.
    live: stamp ? false : opt.live === true,
  };
}

/**
 * نقشهٔ انتقال یک بازپخش انتخاب‌شده از تحلیل تاریخی.
 *
 * برخلاف ردیف زنده، اینجا تاریخ و مبنای قیمت معلوم‌اند. فقط ورودی‌های
 * محاسبه منتقل می‌شوند و بک‌تست سریع نتیجه را از نو می‌سازد. قیمت دستی نیز
 * فقط وقتی معتبر و مثبت است همراه نقشه می‌رود؛ عدد خروجی مثل سود و بازده
 * عمداً جایی در این قرارداد ندارد.
 */
export function historyHandoffPlan({ ua, strategyId = '', strategyName = '', replay, args = {}, comboName = '', live = false } = {}) {
  const legs = replay?.priced || args?.legs || [];
  const manualEntry = Object.fromEntries(Object.entries(args?.manualEntry || {})
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)
    .map(([index, value]) => [String(index), Number(value)]));
  return {
    to: 'backtest', from: 'history',
    uaIns: String(ua?.ins || args?.baseIns || ''),
    uaName: String(ua?.name || 'نماد پایه'),
    strategyId: String(strategyId || ''), strategyName: String(strategyName || ''),
    legIns: legs.filter((leg) => leg?.kind !== 'underlying' && leg?.ins).map((leg) => String(leg.ins)),
    comboName: String(comboName || legs.map((leg) => leg?.name || '').filter(Boolean).join(' + ')),
    entryDate: Number(replay?.startDate || args?.startDate || 0),
    exitDate: Number(replay?.endDate || args?.endDate || 0),
    entryBasis: String(args?.entryBasis || 'LAST'),
    exitBasis: String(args?.exitBasis || 'LAST'),
    units: Math.max(1, Math.trunc(Number(args?.units) || 1)),
    manualEntry,
    autoRun: true,
    live: live === true,
  };
}

/** دکمهٔ آمادهٔ درج در پنل جزئیات. */
export const handoffButtonHtml = (id = 'to-backtest') =>
  `<button type="button" class="ghost handoff-btn" id="${id}">
     بررسی تاریخی در بک‌تست
   </button>`;

// ═══════════════════ باز کردن در صفحهٔ تازه ═══════════════════
//
// تا امروز انتقال، تبِ جاری را عوض می‌کرد: کاربری که در «برترین موقعیت‌ها»
// یک فهرست فیلترشده ساخته بود، با یک کلیک آن را از دست می‌داد و برای
// مقایسهٔ ردیف دوم باید همه را از نو می‌چید. حالا صفحهٔ جاری سرجایش می‌ماند
// و بررسی در یک صفحهٔ تازه باز می‌شود.
//
// نقشه از حافظهٔ درون‌صفحه‌ای رد نمی‌شود، چون صفحهٔ تازه سند دیگری است و
// `state` مشترکی با این یکی ندارد. پس نقشه در `localStorage` می‌نشیند و
// فقط کلیدش از راه نشانی می‌رود؛ صفحهٔ مقصد آن را برمی‌دارد و پاک می‌کند.
// `sessionStorage` جواب نمی‌داد: کپی‌شدنش به تب تازه در مرورگرها یکسان
// نیست و در تب دستی‌بازشده اصلاً کپی نمی‌شود.

const STASH_PREFIX = 'options-radar:handoff:';

// نقشهٔ برداشته‌نشده نباید تا ابد بماند؛ پنجرهٔ بازنشده یا بسته‌شده کلیدش را
// پاک نمی‌کند. ده دقیقه از هر گذر معقولی بین کلیک و باز شدن صفحه بیشتر است.
const STASH_TTL_MS = 10 * 60 * 1000;

const store = () => {
  try { return window.localStorage; } catch { return null; }
};

function sweep(ls, now) {
  for (let i = ls.length - 1; i >= 0; i--) {
    const key = ls.key(i);
    if (!key?.startsWith(STASH_PREFIX)) continue;
    let at = 0;
    try { at = Number(JSON.parse(ls.getItem(key))?.at) || 0; } catch { at = 0; }
    if (!at || now - at > STASH_TTL_MS) ls.removeItem(key);
  }
}

/** نقشه را کنار می‌گذارد و کلیدش را برمی‌گرداند؛ بدون حافظه، رشتهٔ خالی. */
export function stashHandoff(plan) {
  const ls = store();
  if (!ls || !plan) return '';
  const now = Date.now();
  sweep(ls, now);
  const token = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try { ls.setItem(STASH_PREFIX + token, JSON.stringify({ at: now, plan })); }
  catch { return ''; }
  return token;
}

/** نقشه را برمی‌دارد و پاک می‌کند. کلید یک‌بارمصرف است. */
export function takeHandoff(token) {
  const ls = store();
  if (!ls || !token) return null;
  const key = STASH_PREFIX + token;
  const raw = ls.getItem(key);
  if (!raw) return null;
  ls.removeItem(key);
  try {
    const box = JSON.parse(raw);
    if (!box?.plan || Date.now() - Number(box.at) > STASH_TTL_MS) return null;
    return box.plan;
  } catch { return null; }
}

/**
 * نقشه را در صفحه‌ای تازه باز می‌کند و می‌گوید موفق شد یا نه.
 *
 * اگر مسدودکنندهٔ پنجره جلویش را بگیرد یا حافظه در دسترس نباشد، `false`
 * برمی‌گردد تا فراخوان به همان مسیر قدیمی — عوض‌کردن تب همین صفحه — برگردد.
 * سکوت بدترین حالت است: کلیکی که هیچ کاری نمی‌کند.
 */
export function openHandoffPage(plan, tab = 'backtest') {
  const token = stashHandoff(plan);
  if (!token) return false;
  const url = `${location.pathname}${location.search}#${tab}!${token}`;
  // `noopener` اینجا نمی‌آید، و این یک تصمیم است نه فراموشی: طبق استاندارد،
  // `window.open` با `noopener` **همیشه** `null` برمی‌گرداند — حتی وقتی
  // پنجره با موفقیت باز شده. با آن، هر باز شدنِ موفق «شکست» خوانده می‌شد و
  // دو خرابی هم‌زمان می‌ساخت: کلید نقشه پاک می‌شد (صفحهٔ تازه خالی بالا
  // می‌آمد) و مسیر جایگزین هم اجرا می‌شد (صفحهٔ جاری هم عوض می‌شد). هر دو
  // را کاربر دید.
  //
  // نبودش خطر تازه‌ای نمی‌سازد: صفحهٔ مقصد همین برنامه روی همین مبدأ است،
  // نه سایت غریبه. `window.opener` هم هیچ‌جا خوانده نمی‌شود.
  const win = window.open(url, '_blank');
  if (win && !win.closed) return true;
  takeHandoff(token);                       // پنجره باز نشد؛ کلید را نگه نداریم
  return false;
}

/**
 * مسیر واحد همهٔ دکمه‌های انتقال.
 *
 * اول صفحهٔ تازه؛ اگر نشد، همان رفتار قدیمی روی همین صفحه. `state` تنها در
 * حالت دوم دست می‌خورد، چون در حالت اول صفحهٔ مقصد نقشه را از حافظه
 * برمی‌دارد و `state` این صفحه اصلاً درگیر نیست.
 */
export function goHandoff(state, plan, tab = 'backtest') {
  if (openHandoffPage(plan, tab)) return true;
  state.handoff = plan;
  location.hash = tab;
  return false;
}

// ═══════════════ پیوندِ یک ردیفِ استراتژی به بقیهٔ برنامه ═══════════════
//
// خواستهٔ صاحب پروژه (بندهای ۴ و ۱۱): «یک گزینه وجود داشته باشه که
// استراتژی مشخص شده را لینک کنه به قسمت ازمایشگاه یا رصد زنده … لینک در
// صفحه مجزا باز بشه.»
//
// مسیرِ بازکردن از قبل بود (`openHandoffPage`) و مسیریابِ `ui/app.mjs` هر
// شناسهٔ تبی را می‌پذیرد. آنچه نبود، **قراردادِ مشترک** بود: هر مقصد
// می‌خواست چیز دیگری بداند و `handoffPlan` فقط بک‌تست را می‌شناخت.
//
// ═══ فقط مقصدی که واقعاً می‌پذیرد ═══
//
// فهرست زیر «آرزو» نیست. هر ردیفش تبی است که در `mount` خودش
// `state.handoff` را می‌خواند و روی نقشه می‌نشیند. دکمه‌ای که به جایی
// نرسد بدتر از نبودِ دکمه است — همان قاعده‌ای که `ui/subtabs.mjs` دارد.
// مقصد تازه، وقتی اضافه می‌شود که پذیرشش نوشته شده باشد.

export const STRATEGY_LINK_TARGETS = [
  { to: 'backtest', label: '🔬 آزمایشگاه آپشن',
    why: 'همین ترکیب را روی تاریخ بیازما — بازه، پاها و حجم از همین ردیف می‌روند.' },
  { to: 'watchtower', label: '🔔 دیده‌بان شرطی',
    why: 'برای همین ترکیب قاعده بگذار؛ شرط با عددِ همین لحظه پیش‌پر می‌شود.' },
  { to: 'greeks-watch', label: '📐 رصد یونانی و تلاطم',
    why: 'پنج حساسیت و دو تلاطمِ همین پاها، در طول عمرشان.' },
  { to: 'spread-radar', label: '📏 رادار فاصله',
    why: 'فاصلهٔ همین ساختار در طول تاریخ — چقدر پر شده و چقدر مانده.' },
];

/**
 * سنجه‌های دیده‌بان که معادلِ مستقیم در ردیفِ موتور دارند.
 *
 * ═══ چرا نگاشتِ صریح، نه حدس ═══
 *
 * نامِ ستونِ موتور و نامِ سنجهٔ دیده‌بان یکی نیستند، و **جهتِ شرط** هم از
 * خودِ سنجه درمی‌آید نه از نامش: «بازده ماهانه» هرچه بیشتر بهتر، و
 * «حداکثر زیان» هرچه کمتر. هر دو در موتور و در دیده‌بان **اندازه**اند
 * (عدد مثبت؛ زیانِ نامحدود `Infinity` است)، پس `abs` اینجا محافظ است نه
 * تبدیل — و عملگر است که باید وارونه شود، نه علامت.
 */
const WATCH_FROM_ROW = [
  { metric: 'monthlyPct', key: 'retMonthPct' },
  { metric: 'returnPct', key: 'retMaxPct' },
  { metric: 'rewardRisk', key: 'rewardRisk' },
  { metric: 'maxProfit', key: 'maxProfit' },
  // زیان در هر دو سو اندازه است؛ `abs` فقط محافظِ ورودیِ غیرمنتظره است.
  { metric: 'maxLoss', key: 'maxLoss', abs: true },
  { metric: 'lossPct', key: 'maxLossPct', abs: true },
  { metric: 'beWidthPct', key: 'beWidthPct' },
  { metric: 'daysLeft', key: 'days' },
  { metric: 'basePrice', key: 'S' },
];

/**
 * شرط‌های پیشنهادی برای یک ردیف — با آستانهٔ **عددِ همین لحظه**.
 *
 * چرا عددِ همین لحظه: قاعده‌ای که آستانه‌اش صفر باشد، همان لحظه شلیک
 * می‌کند و کاربر باید همه‌اش را دستی عوض کند. آستانه‌ای که برابرِ وضع
 * فعلی است، جمله‌اش این می‌شود: «خبرم کن وقتی دست‌کم به‌خوبیِ حالا شد» —
 * که نقطهٔ شروعِ معناداری است، نه عددِ ساختگی.
 *
 * ردیفی که عددِ یک سنجه را ندارد، شرطِ آن سنجه را هم نمی‌سازد. «نامحدود»
 * هم شرط نمی‌سازد: با هیچ آستانه‌ای سنجیده نمی‌شود.
 */
export function watchConditionsFrom(row) {
  const out = [];
  for (const item of WATCH_FROM_ROW) {
    if (!watchMetric(item.metric)) continue;
    const raw = Number(row?.[item.key]);
    if (!Number.isFinite(raw)) continue;
    const value = item.abs ? Math.abs(raw) : raw;
    // «حداکثر زیان» هرچه کمتر بهتر، پس شرطش سقف است نه کف.
    const op = item.metric === 'maxLoss' || item.metric === 'lossPct' ? 'le' : 'ge';
    out.push({ metric: item.metric, op, value: Number(value.toFixed(4)), ref: 'abs' });
  }
  return out;
}

/**
 * نقشهٔ پیوندِ یک ردیفِ زنده به یک تبِ دیگر.
 *
 * مثل `handoffPlan`، هیچ عددِ **نتیجه**‌ای منتقل نمی‌شود مگر آنجا که خودش
 * ورودیِ مقصد است: آستانهٔ شرطِ دیده‌بان عددی است که کاربر می‌خواهد
 * بگذارد، نه ادعایی که مقصد باید بازتولیدش کند.
 */
export function strategyLinkPlan(row, { to, strategyId = '', strategyName = '', units = 1 } = {}) {
  if (!row || !STRATEGY_LINK_TARGETS.some((item) => item.to === to)) return null;
  const stamp = historyStamp(row);
  const base = {
    to, from: 'strategy',
    uaIns: String(row.uaIns || ''), uaName: String(row.underlying || 'نماد پایه'),
    strategyId: String(strategyId || row.strategyId || ''),
    strategyName: String(strategyName || row.strategy || ''),
    legIns: legIns(row),
    comboName: String(row.legsText || ''),
    units: Math.max(1, Math.trunc(Number(units) || 1)),
    // ردیفِ تاریخی روزش را با خودش می‌برد؛ ردیفِ زنده چیزی برای بردن ندارد
    // و مقصد خودش انتخاب می‌کند.
    ...(stamp ? { entryDate: stamp.date, ...(stamp.basis ? { entryBasis: stamp.basis } : {}) } : {}),
  };
  if (to === 'watchtower') {
    return {
      ...base,
      ruleName: [base.strategyName, base.uaName, base.comboName].filter(Boolean).join(' — '),
      conditions: watchConditionsFrom(row),
    };
  }
  // رصد یونانی از قبل نقشه می‌پذیرد (`applyPlan` در تبِ خودش). `live` فقط
  // برای ردیفِ **زنده** درست است — بی آن مقصد تا آخرین روزِ بسته‌شده
  // می‌رود، که برای ردیف زنده کم است و برای ردیف تاریخی غلط. ردیف تاریخی
  // به‌جایش `entryDate` را از `base` می‌برد.
  if (to === 'greeks-watch') return { ...base, live: !stamp };
  return base;
}

// دیده‌بان شرطی فقط استراتژی‌های فاصله‌دار را در دامنه‌اش دارد
// (`GAP_STRATEGY_IDS`). این محدودیتِ خودِ آن تب است، نه انتخابِ اینجا.
const WATCHABLE = new Set(GAP_STRATEGY_IDS);

/**
 * کدام مقصدها برای این ردیف واقعاً کار می‌کنند.
 *
 * ═══ چرا استراتژی هم شرط است ═══
 *
 * دیده‌بان شرطی فهرست استراتژی‌هایش را از `GAP_STRATEGY_IDS` می‌سازد و
 * کاورد کال در آن نیست. بی این شرط، دکمه ساخته می‌شد، صفحه باز می‌شد،
 * شرط‌ها پیش‌پر می‌شدند — و تیکِ استراتژی روی هیچ چک‌باکسی نمی‌نشست، چون
 * چک‌باکسش وجود نداشت. قاعده‌ای که دامنه‌اش خالی است هیچ ردیفی ندارد، و
 * کاربر آن را «شرطم برقرار نشد» می‌خواند. همان درسِ دو نوبت پیش.
 */
export function strategyLinkTargets(row, { strategyId = '' } = {}) {
  if (!row?.uaIns) return [];
  const id = String(strategyId || row.strategyId || '');
  return STRATEGY_LINK_TARGETS.filter((item) => {
    if (item.to === 'backtest') return canHandoff(row);
    if (item.to === 'watchtower') return WATCHABLE.has(id) && watchConditionsFrom(row).length > 0;
    // رصد یونانی ترکیب را از روی **کد قراردادِ** پاها پیدا می‌کند
    // (`pickPlanCombo`)، پس ردیفِ بی‌کد به آن نمی‌رسد.
    if (item.to === 'greeks-watch') return canHandoff(row);
    // رادار فاصله فقط ساختارهای فاصله‌دار را می‌سازد — همان فهرستی که
    // دیده‌بان هم از آن تغذیه می‌شود — و ترکیب را از کدِ پاها پیدا می‌کند.
    if (item.to === 'spread-radar') return WATCHABLE.has(id) && canHandoff(row);
    return true;
  });
}

/**
 * روزِ ورودِ یک نقشهٔ «خودکار» — تازه‌ترین روزی که **همین** ترکیب در آن هست.
 *
 * ═══ گزارشی که این تابع جوابش است ═══
 *
 * «از Bull Call Spread اهرم با پاهای +۶۸۰۰۰/−۷۴۰۰۰ چهار مقصد را باز
 * کردم … آزمایشگاه ترکیب ۱۶۰۰۰/۱۸۰۰۰ و رصد یونانی ۲۰۰۰۰/۲۲۰۰۰ را
 * انتخاب کردند.»
 *
 * هر دو مقصد روزِ ورود را **پیش از** دانستنِ ترکیب انتخاب می‌کردند:
 * آزمایشگاه قدیمی‌ترین روزِ دارای هر ترکیبِ اجراپذیر، و رصد یونانی ده
 * روز مانده به آخر. قراردادهای تازه در آن روزها هنوز باز نشده‌اند، پس
 * تطبیقِ ترکیب شکست می‌خورد و کشویی روی پیش‌فرضِ خودش می‌ماند — ترکیبی
 * دیگر، با ظاهری کاملاً معتبر.
 *
 * قاعده حالا یکی است و اینجا نوشته شده تا در دو تب دو رفتار نشود:
 * **از تازه‌ترین روز به عقب**، نخستین روزی که همهٔ پاهای فرستاده‌شده در
 * آن قیمت دارند. برای ردیفی که همین حالا زنده است همین درست هم هست —
 * «این ترکیب، همان‌طور که امروز هست».
 *
 * `hasPrice(ins, date)` را فراخوان می‌دهد، چون هر تب سری‌های خودش را
 * جور دیگری نگه می‌دارد. اگر هیچ روزی پیدا نشد `0` برمی‌گردد و فراخوان
 * به پیش‌فرضِ خودش برمی‌گردد — و آن‌وقت **باید** بگوید ترکیب پیدا نشد.
 */
export function handoffEntryDate(plan, dates = [], hasPrice = () => false) {
  const legs = (plan?.legIns || []).map(String).filter(Boolean);
  const list = (Array.isArray(dates) ? dates : []).map(Number).filter((date) => date > 0);
  if (!legs.length || !list.length) return 0;
  for (let at = list.length - 1; at >= 0; at -= 1) {
    if (legs.every((ins) => hasPrice(ins, list[at]) === true)) return list[at];
  }
  return 0;
}
