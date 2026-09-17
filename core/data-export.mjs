// هستهٔ خالص تب «خروجی دیتا»: کشف ابزار، ساخت درخواست‌ها و ردیف‌های خروجی.

import { num } from './num.mjs';
import { batchKey, BATCH_PAIR_CAP } from './trades-source.mjs';

const n = (value) => num(value, 0);
const code = (value) => String(value ?? '').trim();

export const DATA_EXPORT_KIND_LABEL = {
  underlying: 'دارایی پایه', call: 'اختیار خرید', put: 'اختیار فروش',
};

/** همه پایه‌ها و قراردادهای کال/پوتِ پایه‌های انتخابی، یکتا و مرتب. */
export function discoverDataExportInstruments(rows = [], selectedBases = [], { declaredSize = 0 } = {}) {
  const selected = new Set((selectedBases || []).map(code).filter(Boolean));
  const all = selected.size === 0;
  const byKey = new Map();
  const put = (item) => {
    if (!item.ins) return;
    const key = `${item.kind}:${item.ins}`;
    const old = byKey.get(key);
    if (!old) { byKey.set(key, item); return; }
    const starts = [old.activeFrom, item.activeFrom].filter((value) => n(value) > 0);
    old.activeFrom = starts.length ? Math.min(...starts) : 0;
    old.activeTo = Math.max(n(old.activeTo), n(item.activeTo));
  };

  for (const row of rows || []) {
    const baseIns = code(row?.uaInsCode);
    if (!baseIns || (!all && !selected.has(baseIns))) continue;
    const baseName = code(row?.lval30_UA) || 'دارایی پایه بدون نام';
    put({
      ins: baseIns, name: baseName, baseIns, baseName, kind: 'underlying',
      strike: null, expiry: null, activeFrom: n(row?.activeFrom), activeTo: n(row?.activeTo),
      size: 1, sizeAssumed: false,
    });
    const officialSize = n(row?.contractSize);
    const size = officialSize > 0 ? officialSize : n(declaredSize);
    for (const [suffix, kind] of [['C', 'call'], ['P', 'put']]) {
      const ins = code(row?.[`insCode_${suffix}`]);
      if (!ins) continue;
      put({
        ins,
        name: code(row?.[`lVal18AFC_${suffix}`]) || code(row?.[`lVal30_${suffix}`]) || `قرارداد ${kind === 'call' ? 'کال' : 'پوت'}`,
        baseIns, baseName, kind,
        strike: n(row?.strikePrice) || null,
        expiry: n(row?.expiryGregorian) || n(row?.endDate) || null,
        activeFrom: n(row?.activeFrom), activeTo: n(row?.activeTo),
        size: size > 0 ? size : 0,
        sizeAssumed: !(officialSize > 0),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.baseName !== b.baseName) return a.baseName.localeCompare(b.baseName, 'fa');
    if (a.kind === 'underlying' && b.kind !== 'underlying') return -1;
    if (b.kind === 'underlying' && a.kind !== 'underlying') return 1;
    return (n(a.expiry) - n(b.expiry)) || (n(a.strike) - n(b.strike)) || a.kind.localeCompare(b.kind);
  });
}

/** پایه در کل بازه و اختیار فقط در عمر ثبت‌شدهٔ خودش درخواست می‌شود. */
export function dataExportPairs(instruments = [], dates = []) {
  const out = [], seen = new Set();
  const orderedDates = [...new Set((dates || []).map((value) => Math.trunc(n(value))).filter(Boolean))].sort((a, b) => a - b);
  for (const date of orderedDates) {
    for (const item of instruments || []) {
      if (!item?.ins) continue;
      if (item.kind !== 'underlying') {
        const from = n(item.activeFrom), to = n(item.activeTo) || n(item.expiry);
        if ((from > 0 && date < from) || (to > 0 && date > to)) continue;
      }
      const key = batchKey(item.ins, date);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ins: String(item.ins), date, key });
    }
  }
  return out;
}

/**
 * سقفِ عملیِ یک بستهٔ دریافت.
 *
 * ═══ چرا ۱۲۰۰ جواب نداد ═══
 *
 * سقفِ سرور ۱۲۰۰ جفت است و تب تا امروز دقیقاً همان را می‌گذاشت: ۷۷۸ جفت
 * در **یک** درخواست. آن یک درخواست چند دقیقه طول می‌کشد، و گزارشِ صاحب
 * پروژه نشان داد چه می‌شود وقتی وسطش قطع شود — هر ۷۷۸ ردیفِ برگ پوشش با
 * یک پیام یکسان پر شده بود:
 *
 *     Unexpected token '<', "<html>\n<h"... is not valid JSON
 *
 * یعنی پاسخ، صفحهٔ خطای یک دروازه بود نه JSON. یک قطع، کلِ کار را برد و
 * فایلِ ۸۳ برگی بی حتی یک ریزمعامله بیرون آمد.
 *
 * بستهٔ کوچک‌تر کارِ بالادست را کم نمی‌کند — همان تعداد درخواست به تابلو
 * می‌رود — ولی هر رفت‌وبرگشتِ HTTP را کوتاه می‌کند و **شعاعِ خرابی** را از
 * «همه‌چیز» به «همین بسته» می‌آورد.
 */
export const DATA_EXPORT_BATCH_CAP = 120;

export function dataExportPairBatches(pairs = [], cap = DATA_EXPORT_BATCH_CAP) {
  const size = Math.min(BATCH_PAIR_CAP, Math.max(1, Math.trunc(n(cap)) || DATA_EXPORT_BATCH_CAP));
  const out = [];
  for (let at = 0; at < (pairs || []).length; at += size) out.push(pairs.slice(at, at + size));
  return out;
}

/**
 * شکستنِ بستهٔ شکست‌خورده به دو نیمه، برای تلاش دوباره.
 *
 * ═══ چرا نصف‌کردن و نه تلاش دوبارهٔ همان بسته ═══
 *
 * تلاشِ دوبارهٔ همان بسته، همان مدت طول می‌کشد و همان‌جا قطع می‌شود. نصف،
 * نصفِ زمان می‌برد — و اگر علتِ خرابی **یک ابزارِ خاص** باشد (نه زمان)،
 * نصف‌کردنِ پیاپی آن یکی را جدا می‌کند و بقیه نجات پیدا می‌کنند. بستهٔ
 * تک‌جفتی دیگر شکسته نمی‌شود: خطایش واقعاً مالِ همان جفت است.
 */
export function splitPairBatch(batch = []) {
  const list = Array.isArray(batch) ? batch : [];
  if (list.length < 2) return [];
  const middle = Math.ceil(list.length / 2);
  return [list.slice(0, middle), list.slice(middle)];
}

/**
 * قراردادهای یک پایه، گروه‌بندی‌شده بر سررسید.
 *
 * ═══ چرا انتخابِ قرارداد لازم شد ═══
 *
 * خواستهٔ صریح صاحب پروژه: «با انتخاب هر دارایی پایه قراردادهای آن نماد
 * نمایش داده بشن و قابل انتخاب باشن.» تا امروز انتخاب فقط در سطح **پایه**
 * بود و خروجی، همهٔ قراردادهای آن پایه را می‌گرفت — برای اهرم یعنی هشتاد
 * قرارداد و ۷۷۸ جفت ابزار/روز، وقتی کاربر شاید سه قرارداد می‌خواست.
 *
 * ترتیب: سررسیدِ نزدیک‌تر اول، و داخل هر سررسید قیمت اعمالِ کمتر اول و
 * کال پیش از پوت — همان ترتیبی که آدم روی تابلو می‌بیند.
 */
export function dataExportContractGroups(instruments = [], baseIns = '') {
  const base = code(baseIns);
  const byExpiry = new Map();
  for (const item of instruments || []) {
    if (!item?.ins || item.kind === 'underlying') continue;
    if (base && code(item.baseIns) !== base) continue;
    const expiry = n(item.expiry) || 0;
    if (!byExpiry.has(expiry)) byExpiry.set(expiry, []);
    byExpiry.get(expiry).push(item);
  }
  return [...byExpiry.entries()]
    .sort((a, b) => (a[0] || Infinity) - (b[0] || Infinity))
    .map(([expiry, list]) => ({
      expiry,
      contracts: list.sort((a, b) => (n(a.strike) - n(b.strike))
        || a.kind.localeCompare(b.kind)
        || String(a.name).localeCompare(String(b.name), 'fa')),
    }));
}

/**
 * ابزارهای انتخاب‌شده، به‌علاوهٔ پایهٔ هر کدام.
 *
 * ═══ چرا پایه همیشه می‌آید ═══
 *
 * ریزمعاملهٔ یک قرارداد بی ریزمعاملهٔ پایه‌اش، نیمی از داستان است: هیچ
 * تحلیلی روی قیمتِ اختیار بی قیمتِ همان لحظهٔ پایه ساخته نمی‌شود. پس
 * انتخابِ کاربر روی **قراردادها** است و پایه‌شان خودکار همراه می‌آید — و
 * این در رابط صریح نوشته می‌شود، نه بی‌صدا.
 *
 * انتخابِ خالی یعنی «هیچ»، نه «همه»: فهرستی که کاربر همه را از آن برداشته
 * نباید ناگهان هشتاد قرارداد بگیرد.
 */
export function selectedDataExportInstruments(instruments = [], selection = []) {
  const wanted = new Set((selection || []).map(code).filter(Boolean));
  if (!wanted.size) return [];
  const bases = new Set();
  const picked = [];
  for (const item of instruments || []) {
    if (item.kind === 'underlying' || !wanted.has(code(item.ins))) continue;
    picked.push(item);
    if (item.baseIns) bases.add(code(item.baseIns));
  }
  // پایهٔ صریحاً انتخاب‌شده هم می‌ماند، حتی اگر هیچ قراردادی از آن نیامده.
  for (const item of instruments || []) {
    if (item.kind !== 'underlying') continue;
    if (bases.has(code(item.ins)) || wanted.has(code(item.ins))) picked.push(item);
  }
  return picked.sort((a, b) => {
    if (a.baseName !== b.baseName) return String(a.baseName).localeCompare(String(b.baseName), 'fa');
    if (a.kind === 'underlying' && b.kind !== 'underlying') return -1;
    if (b.kind === 'underlying' && a.kind !== 'underlying') return 1;
    return (n(a.expiry) - n(b.expiry)) || (n(a.strike) - n(b.strike)) || a.kind.localeCompare(b.kind);
  });
}

/**
 * جمع‌بندیِ نتیجهٔ دریافت — پیش از ساختِ فایل.
 *
 * ═══ چرا این تابع وجود دارد ═══
 *
 * فایلِ گزارش‌شده ۸۳ برگ داشت و **صفر** ریزمعامله. رابط آن را «آمادهٔ
 * خروجی» خواند، چون فقط شمارِ شیت را می‌شمرد. جمع‌بندی باید اول از همه
 * بگوید چند جفت واقعاً داده آورد؛ صفر بودنش خبرِ اول است، نه یک عدد در
 * انتهای جمله.
 */
export function dataExportOutcome(pairs = [], items = {}) {
  let ok = 0, empty = 0, failed = 0, missing = 0, trades = 0;
  const reasons = new Map();
  for (const pair of pairs || []) {
    const hit = items?.[pair.key];
    if (!hit) { missing += 1; continue; }
    if (hit.error) {
      failed += 1;
      const why = String(hit.error);
      reasons.set(why, (reasons.get(why) || 0) + 1);
      continue;
    }
    const rows = Array.isArray(hit.rows) ? hit.rows.length : 0;
    if (rows) { ok += 1; trades += rows; } else empty += 1;
  }
  const total = (pairs || []).length;
  return {
    total, ok, empty, failed, missing, trades,
    // «هیچ داده‌ای نیامد» با «هیچ معامله‌ای نشده» یکی نیست: اولی خرابی
    // است و دومی واقعیتِ بازار.
    blank: total > 0 && ok === 0,
    allFailed: total > 0 && failed + missing === total,
    topReason: [...reasons.entries()].sort((a, b) => b[1] - a[1])[0] || null,
  };
}

/** ریزمعامله‌های یک ابزار، با ارزش خام و ارزش مبتنی بر اندازه قرارداد. */
export function dataExportTradeRows(instrument, pairs = [], items = {}) {
  const size = instrument?.kind === 'underlying' ? 1 : n(instrument?.size);
  const out = [];
  for (const pair of pairs || []) {
    if (String(pair.ins) !== String(instrument?.ins)) continue;
    const hit = items?.[pair.key];
    if (!hit || hit.error || !Array.isArray(hit.rows)) continue;
    for (const row of hit.rows) {
      const price = n(row?.price), quantity = n(row?.quantity);
      if (!(price > 0) || !(quantity > 0) || !(n(row?.time) > 0)) continue;
      out.push({
        date: pair.date, time: Math.trunc(n(row.time)), sequence: Math.trunc(n(row.sequence)),
        price, quantity, rawValue: price * quantity,
        contractSize: size > 0 ? size : NaN,
        contractValue: size > 0 ? price * quantity * size : NaN,
        canceled: row?.canceled === true, canceledKnown: row?.canceledKnown !== false,
        source: String(hit.source || 'history'),
      });
    }
  }
  return out.sort((a, b) => a.date - b.date || a.time - b.time || a.sequence - b.sequence);
}

/** پوشش هر ابزار/روز؛ خالیِ معتبر با خطا یکی نمی‌شود. */
export function dataExportCoverageRows(instruments = [], pairs = [], items = {}) {
  const byIns = new Map((instruments || []).map((item) => [String(item.ins), item]));
  return (pairs || []).map((pair) => {
    const instrument = byIns.get(String(pair.ins)) || {}, hit = items?.[pair.key];
    const rows = Array.isArray(hit?.rows) ? hit.rows : [];
    return {
      baseName: instrument.baseName || '', name: instrument.name || '', kind: instrument.kind || '',
      ins: String(pair.ins), date: pair.date,
      rows: hit && Array.isArray(hit.rows) ? rows.length : null,
      active: hit && Array.isArray(hit.rows) ? rows.filter((row) => row && row.canceled !== true).length : null,
      canceled: hit && Array.isArray(hit.rows) ? rows.filter((row) => row?.canceled === true).length : null,
      status: !hit ? 'درخواست نرفت' : hit.error ? 'خطا' : rows.length ? 'داده آمد' : 'بدون معامله',
      error: String(hit?.error || ''), source: String(hit?.source || ''),
    };
  });
}
