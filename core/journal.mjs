// دفترچهٔ معاملات — «چه کردم و چرا».
//
// ═══ شکافی که این ماژول پُر می‌کند ═══
//
// `data/positions.json` فقط **وضعِ فعلی** را دارد. موقعیتی که ویرایش شود،
// قیمتِ ورودِ قبلی‌اش برای همیشه می‌رود؛ موقعیتی که حذف شود، انگار هرگز
// نبوده. پس پرسش‌هایی که هر معامله‌گری از خودش می‌پرسد — «چند بار
// زودهنگام بستم؟»، «آن رول کارِ درستی بود؟»، «چرا این را گرفتم؟» — هیچ
// منبعی برای جواب ندارند.
//
// ═══ چرا دفترچه فقط اضافه می‌شود ═══
//
// ردیفِ دفترچه **ویرایش و حذف ندارد**. دفترچه‌ای که بشود اصلاحش کرد، همان
// حافظهٔ انتخابی است: آدم ردیفی را که خوشش نمی‌آید پاک می‌کند و بعد از
// روی همان دفتر نتیجه می‌گیرد که تصمیم‌هایش خوب بوده‌اند. اشتباهِ ثبت‌شده
// با یک ردیفِ اصلاحیِ **تازه** جبران می‌شود، نه با پاک کردنِ قبلی.
//
// ═══ و چرا عددها در ردیف کپی می‌شوند ═══
//
// ردیف دفترچه به موقعیت ارجاع نمی‌دهد، عددهایش را **در خودش** نگه می‌دارد.
// ارجاع یعنی وقتی موقعیت حذف شود، ردیف به هیچ اشاره می‌کند؛ و وقتی ویرایش
// شود، ردیفِ دیروز عددِ امروز را نشان می‌دهد. دفترچه باید بگوید آن روز چه
// بود، نه امروز چه هست.

import { num } from './num.mjs';

export const JOURNAL_VERSION = 1;
export const JOURNAL_CAP = 5000;

export const JOURNAL_ACTIONS = [
  ['open', 'ثبت موقعیت'],
  ['edit', 'ویرایش موقعیت'],
  ['close', 'بستن موقعیت'],
  ['reopen', 'بازکردن دوبارهٔ موقعیت'],
  ['delete', 'حذف موقعیت'],
  ['alert', 'تغییر شرط'],
  ['note', 'یادداشت'],
];
const ACTION_BY_ID = new Map(JOURNAL_ACTIONS);
export const journalAction = (id) => (ACTION_BY_ID.has(String(id ?? '')) ? String(id) : 'note');
export const journalActionLabel = (id) => ACTION_BY_ID.get(journalAction(id));

export const JOURNAL_REASONS = {
  noAction: 'کنشِ این ردیف مشخص نیست',
  noTime: 'زمانِ این ردیف ثبت نشده',
};

/**
 * یک ردیف دفترچه.
 *
 * `at` از فراخوان می‌آید نه از `Date.now()` — ردیفی که ساعتش را خودش
 * بسازد، در آزمون قابل سنجش نیست و در بازیابیِ پشتیبان زمانِ غلط می‌گیرد.
 */
export function makeEntry({
  at = 0, action = 'note', positionId = '', title = '', uaName = '',
  qty = NaN, pnlTotal = NaN, price = NaN, note = '', detail = '',
} = {}) {
  const when = num(at, 0);
  if (!(when > 0)) return { ok: false, why: JOURNAL_REASONS.noTime, entry: null };
  return {
    ok: true, why: '',
    entry: {
      version: JOURNAL_VERSION,
      id: `j${when.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: when,
      action: journalAction(action),
      positionId: String(positionId || ''),
      title: String(title || ''),
      uaName: String(uaName || ''),
      qty: Number.isFinite(num(qty, NaN)) ? num(qty) : null,
      pnlTotal: Number.isFinite(num(pnlTotal, NaN)) ? num(pnlTotal) : null,
      price: Number.isFinite(num(price, NaN)) ? num(price) : null,
      note: String(note || '').trim(),
      detail: String(detail || '').trim(),
    },
  };
}

/** فهرست ذخیره‌شده را پاک‌سازی می‌کند: تازه‌ترین اول، بریده به سقف. */
export function normalizeJournal(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .filter((item) => item && num(item.at, 0) > 0)
    .map((item) => ({
      version: JOURNAL_VERSION,
      id: String(item.id || `j${num(item.at)}`),
      at: num(item.at),
      action: journalAction(item.action),
      positionId: String(item.positionId || ''),
      title: String(item.title || ''),
      uaName: String(item.uaName || ''),
      qty: Number.isFinite(num(item.qty, NaN)) ? num(item.qty) : null,
      pnlTotal: Number.isFinite(num(item.pnlTotal, NaN)) ? num(item.pnlTotal) : null,
      price: Number.isFinite(num(item.price, NaN)) ? num(item.price) : null,
      note: String(item.note || ''),
      detail: String(item.detail || ''),
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, JOURNAL_CAP);
}

/** افزودن — همیشه افزودن. هیچ مسیری در این ماژول ردیف را عوض نمی‌کند. */
export function appendEntry(list = [], entry) {
  if (!entry?.at) return normalizeJournal(list);
  return normalizeJournal([entry, ...(Array.isArray(list) ? list : [])]);
}

/**
 * آمارهٔ دفترچه.
 *
 * `realized` فقط از ردیف‌های **بستن** جمع می‌شود و نه از هر ردیفی که عدد
 * دارد: ردیفِ ویرایش هم می‌تواند سود لحظه‌ای داشته باشد و جمع‌کردنش یعنی
 * شمردنِ یک سود چند بار.
 */
export function journalSummary(list = [], { from = 0, to = 0 } = {}) {
  const rows = normalizeJournal(list)
    .filter((row) => (!from || row.at >= from) && (!to || row.at <= to));
  const byAction = Object.fromEntries(JOURNAL_ACTIONS.map(([id]) => [id, 0]));
  for (const row of rows) byAction[row.action] += 1;
  const closed = rows.filter((row) => row.action === 'close' && Number.isFinite(row.pnlTotal));
  const wins = closed.filter((row) => row.pnlTotal > 0).length;
  const losses = closed.filter((row) => row.pnlTotal < 0).length;
  return {
    count: rows.length,
    byAction,
    closedCount: closed.length,
    realized: closed.length ? closed.reduce((sum, row) => sum + row.pnlTotal, 0) : NaN,
    wins, losses,
    winRatePct: wins + losses > 0 ? (wins / (wins + losses)) * 100 : NaN,
    first: rows.length ? rows[rows.length - 1].at : 0,
    last: rows.length ? rows[0].at : 0,
  };
}

/** فیلترِ فهرست — برای جدول. */
export function filterJournal(list = [], { action = '', text = '', positionId = '' } = {}) {
  const needle = String(text || '').trim().toLowerCase();
  return normalizeJournal(list).filter((row) => {
    if (action && row.action !== action) return false;
    if (positionId && row.positionId !== positionId) return false;
    if (!needle) return true;
    return `${row.title} ${row.uaName} ${row.note} ${row.detail}`.toLowerCase().includes(needle);
  });
}
