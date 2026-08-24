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
export function handoffPlan(row, opt = {}) {
  return {
    to: 'backtest', from: opt.from || 'strategy',
    uaIns: String(row.uaIns), uaName: row.underlying || 'نماد پایه',
    strategyId: opt.strategyId || row.strategyId || '',
    strategyName: row.strategy || opt.strategyName || '',
    legIns: legIns(row),
    comboName: row.legsText || '',
    entryDate: 'auto', exitDate: 'auto',
    entryBasis: opt.entryBasis || 'LAST',
    exitBasis: opt.exitBasis || 'LAST',
    units: Math.max(1, Math.trunc(Number(opt.units) || 1)),
    live: opt.live === true,
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
