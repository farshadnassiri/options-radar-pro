// هستهٔ خالص تب «خروجی دیتا»: کشف ابزار، ساخت درخواست‌ها و ردیف‌های خروجی.

import { num } from './num.mjs';
import { batchKey, BATCH_PAIR_CAP } from './trades-source.mjs';
import {
  INTRADAY_END_SECOND, INTRADAY_START_SECOND, inIntradaySession, tradeSecond,
} from './backtest.mjs';

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
    old.listingKnown = old.listingKnown === true || item.listingKnown === true;
    old.listingOfficial = old.listingOfficial === true || item.listingOfficial === true;
  };

  for (const row of rows || []) {
    const baseIns = code(row?.uaInsCode);
    if (!baseIns || (!all && !selected.has(baseIns))) continue;
    const baseName = code(row?.lval30_UA) || 'دارایی پایه بدون نام';
    put({
      ins: baseIns, name: baseName, baseIns, baseName, kind: 'underlying',
      strike: null, expiry: null, activeFrom: n(row?.activeFrom), activeTo: n(row?.activeTo),
      listingKnown: true, listingOfficial: true, size: 1, sizeAssumed: false,
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
        activeFrom: n(row?.[`activeFrom_${suffix}`]) || n(row?.activeFrom),
        activeTo: n(row?.[`activeTo_${suffix}`]) || n(row?.activeTo),
        listingKnown: row?.[`listingKnown_${suffix}`] !== false,
        // درست است که تاریخِ عرضه را داریم، یا فقط اولین روزِ دیده‌شدن را؟
        listingOfficial: row?.[`listedOfficial_${suffix}`] === true,
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

/**
 * قراردادی که تاریخ عرضه‌اش نامعلوم است.
 *
 * ═══ چرا این دیگر «بی‌کران» خوانده نمی‌شود ═══
 *
 * ممیزی صاحب پروژه روی بازهٔ ۲۰۲۴/۰۷/۲۲ تا ۲۰۲۵/۰۱/۲۰: خروجی ۲۴ قرارداد
 * اهرم داشت که هر ۲۴تا برای **هر ۱۳۱ روزِ** بازه درخواست رفته بودند —
 * از جمله `ضهرم4011` که عرضه‌اش ۲۰۲۵/۰۲/۱۵ است، یعنی حدود یک ماه **پس
 * از پایان بازه**. ۳٬۱۴۴ جفتِ ابزار/روز برای قراردادی رفت که آن روز اصلاً
 * وجود نداشت.
 *
 * علتش این بود که `activeFrom === 0` مثل «کرانِ پایینی ندارد» رفتار
 * می‌کرد، و سررسیدِ بعد از بازه هم کرانِ بالایی نمی‌ساخت. ولی صفر یعنی
 * «دفتر نمی‌داند»، نه «از ازل بوده» — همان چیزی که قاعدهٔ ۲-۴ منع می‌کند،
 * این‌بار در جهتِ زمان.
 *
 * پس قراردادِ بی‌تاریخِ عرضه از بازهٔ تاریخی بیرون می‌ماند و شمرده
 * می‌شود. وقتی اسکنِ دفتر کامل شد، تاریخش می‌آید و خودش برمی‌گردد.
 */
export function unknownListingContracts(instruments = []) {
  return (instruments || []).filter((item) => item?.ins
    && item.kind !== 'underlying'
    && (item.listingKnown === false || !(n(item.activeFrom) > 0)));
}

/**
 * کفِ عمرِ هر قرارداد، از روی **سری** و نه از روی یک سمت.
 *
 * ═══ ممیزی فایلِ m5 اهرم ═══
 *
 * صاحب پروژه گفت خروجی کامل نیست. فایل نشان داد چرا: ۵۸ ابزار/روز اصلاً
 * درخواست نرفته بودند، و هر ۵۸تا **پوت** بودند. `ضهرم7061` از ۲۰۲۶/۰۷/۲۵
 * در فایل هست و `طهرم7061` از ۲۰۲۶/۰۸/۱۱ — سیزده روز معاملاتی دیرتر، با
 * همان اعمال و همان سررسید. کال و پوتِ یک سری در یک روز عرضه می‌شوند، پس
 * این سیزده روز اختلافِ عرضه نیست.
 *
 * علتش `contractLife` است: وقتی `listedFrom` در دفتر نیست، به `first`
 * برمی‌گردد — اولین روزی که اسکنِ دفتر آن قرارداد را **دیده**. پوتِ
 * کم‌معامله دیرتر دیده می‌شود، پس کرانِ پایینی‌اش سوگیریِ دیر دارد. این
 * «نمی‌دانیم» نیست؛ یک مشاهده است که می‌دانیم از تاریخ عرضه جلوتر است.
 *
 * پس: اگر یک سمتِ سری تاریخ عرضهٔ **رسمی** دارد، همان کفِ هر دو سمت است.
 * اگر هیچ‌کدام ندارند، زودترین مشاهدهٔ همان سری کف است — چون دیرترها
 * قطعاً دیرند. هیچ تاریخی ساخته نمی‌شود و کفِ رسمیِ خودِ قرارداد دست
 * نمی‌خورد؛ فقط مرزی که مشاهده ساخته بود با سریِ خودش هم‌تراز می‌شود.
 */
const seriesKey = (item) => (n(item?.expiry) > 0 && n(item?.strike) > 0
  ? `${code(item.baseIns)}:${n(item.expiry)}:${n(item.strike)}` : '');

export function dataExportListingFloors(instruments = []) {
  const series = new Map();
  for (const item of instruments || []) {
    if (!item?.ins || item.kind === 'underlying') continue;
    const key = seriesKey(item);
    const from = n(item.activeFrom);
    if (!key || !(from > 0) || item.listingKnown === false) continue;
    const slot = series.get(key) || { official: 0, observed: 0 };
    const field = item.listingOfficial === true ? 'official' : 'observed';
    slot[field] = slot[field] > 0 ? Math.min(slot[field], from) : from;
    series.set(key, slot);
  }
  const floors = new Map();
  for (const item of instruments || []) {
    if (!item?.ins || item.kind === 'underlying') continue;
    const from = n(item.activeFrom);
    if (!(from > 0)) continue;
    if (item.listingOfficial === true) { floors.set(String(item.ins), from); continue; }
    const slot = series.get(seriesKey(item));
    const floor = slot ? (slot.official > 0 ? slot.official : slot.observed) : 0;
    floors.set(String(item.ins), floor > 0 ? Math.min(from, floor) : from);
  }
  return floors;
}

/**
 * چند قرارداد کفِ رسمی دارند، چند تا مشاهده‌ای، و کفِ سری چند ابزار/روز
 * را برگرداند که پیش‌تر اصلاً درخواست نمی‌رفت.
 */
export function dataExportListingBasis(instruments = [], pairs = []) {
  const byIns = new Map((instruments || []).filter((item) => item?.ins && item.kind !== 'underlying')
    .map((item) => [String(item.ins), item]));
  let official = 0, observed = 0, recovered = 0;
  for (const item of byIns.values()) {
    if (item.listingOfficial === true) official += 1; else observed += 1;
  }
  for (const pair of pairs || []) {
    const item = byIns.get(String(pair.ins));
    if (item && item.listingOfficial !== true && pair.date < n(item.activeFrom)) recovered += 1;
  }
  return { official, observed, recovered, total: byIns.size };
}

/** پایه در کل بازه و اختیار فقط در عمر ثبت‌شدهٔ خودش درخواست می‌شود. */
export function dataExportPairs(instruments = [], dates = []) {
  const out = [], seen = new Set();
  const floors = dataExportListingFloors(instruments);
  const orderedDates = [...new Set((dates || []).map((value) => Math.trunc(n(value))).filter(Boolean))].sort((a, b) => a - b);
  for (const date of orderedDates) {
    for (const item of instruments || []) {
      if (!item?.ins) continue;
      if (item.kind !== 'underlying') {
        const own = n(item.activeFrom), to = n(item.activeTo) || n(item.expiry);
        const from = floors.get(String(item.ins)) || own;
        // تاریخِ عرضهٔ نامعلوم یعنی نمی‌دانیم آن روز وجود داشته یا نه.
        // «نمی‌دانیم» درخواست نمی‌سازد.
        if (item.listingKnown === false || !(own > 0)) continue;
        if (date < from || (to > 0 && date > to)) continue;
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
      callCount: list.filter((item) => item.kind === 'call').length,
      putCount: list.filter((item) => item.kind === 'put').length,
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
      const canceled = row?.canceled === true;
      // ═══ چرا شرطِ حجم فقط برای معاملهٔ فعال است ═══
      //
      // `quantity > 0` برای انداختنِ ردیفِ بی‌قیمت گذاشته شده بود، ولی
      // معاملهٔ باطل را هم می‌انداخت: بالادست برای آن `qTitTran` صفر
      // می‌فرستد. ردیفی که بالادست صریحاً «باطل» خوانده یک مشاهده است و
      // شمرده می‌شود؛ حجمش جایی جمع نمی‌شود چون سطل‌ساز پیش از جمع‌زدن از
      // رویش می‌پرد، پس نگه‌داشتنش هیچ عددی را آلوده نمی‌کند.
      //
      // ═══ تصحیح ═══
      //
      // اولین تشخیصِ ممیزیِ ۲۰۲۶/۰۶/۲۰ تا ۲۰۲۶/۰۹/۱۸ این بود که همین شرط،
      // علتِ اختلافِ ۱۲۲ و ۴۹ در شمارِ باطل است. غلط بود. ستونِ تازهٔ
      // «بیرون از جلسه» در اجرای بعدی جواب را داد: مجموعش دقیقاً ۷۳ شد،
      // همان اختلاف. معاملهٔ باطل را بورس **پس از** پایان جلسه ثبت
      // می‌کند، پس جداسازِ ۹:۰۰ تا ۱۲:۳۰ آن را کنار می‌گذارد — درست، و
      // حالا شمرده و گزارش‌شده. این شرط یک دامِ واقعیِ دیگر است که بسته
      // شد، نه علتِ آن اختلاف.
      if (!(price > 0) || !(n(row?.time) > 0)) continue;
      if (!canceled && !(quantity > 0)) continue;
      out.push({
        date: pair.date, time: Math.trunc(n(row.time)), sequence: Math.trunc(n(row.sequence)),
        price, quantity, rawValue: price * quantity,
        contractSize: size > 0 ? size : NaN,
        contractValue: size > 0 ? price * quantity * size : NaN,
        canceled, canceledKnown: row?.canceledKnown !== false,
        // جلسهٔ پیوستهٔ ۹:۰۰ تا ۱۲:۳۰. خواستهٔ صریح صاحب پروژه همین بازه
        // است، ولی ردیفِ بیرونِ آن **حذف** نمی‌شود — علامت می‌خورد و شمارش
        // می‌شود، تا «نبود» با «کنار گذاشته شد» اشتباه نشود.
        inSession: inIntradaySession(row?.time),
        source: String(hit.source || 'history'),
      });
    }
  }
  return out.sort((a, b) => a.date - b.date || a.time - b.time || a.sequence - b.sequence);
}

/**
 * وضعیتِ یک ابزار/روزِ خالی — و چرا دیگر بی‌قید «بدون معامله» نیست.
 *
 * ═══ ممیزی صاحب پروژه ═══
 *
 * فایل گزارش‌شده ۳٬۲۱۷ ابزار/روز را «بدون معامله» خواند، در حالی که
 * تابلوی روزانه دست‌کم ۶۷ تای آن‌ها را تکذیب می‌کرد و برای ۳٬۱۵۰ تای دیگر
 * اصلاً تابلویی در دست نبود. یعنی برنامه یک ادعای **بازار** می‌کرد که
 * فقط یک پاسخِ خالیِ بالادست بود.
 *
 * «بدون معامله» یک واقعیتِ بازار است و فقط وقتی نوشته می‌شود که منبعِ
 * دومی — تابلوی روزانه — همان را بگوید. بی آن تأیید، آنچه می‌دانیم فقط
 * این است که ریزمعامله‌ای نیامد.
 */
// ═══ چرا «داده آمد» از این جدول رفت ═══
//
// ممیزی ۱۴۰۵/۰۶/۲۹ بند ۳: ستونِ وضعیت برای هر پاسخِ غیرخالی «داده آمد»
// می‌نوشت. نوارِ یک‌ردیفی در برابر تابلوی هزارمعامله‌ای همان برچسب را
// می‌گرفت که یک دریافتِ کامل — یعنی خودِ ستونی که باید کامل‌بودن را
// بگوید، کامل‌بودن را **فرض** می‌کرد.
//
// حالا وضعیت همیشه از حکمِ بازبینی می‌آید، چه ردیف داشته باشد چه نه.
export const EMPTY_STATUS = {
  matched: 'کامل — با تابلو تطبیق شد',
  partial: 'ناقص — کمتر از تابلو',
  quiet: 'بدون معامله',
  missing: 'ریزمعامله نیامد',
  surplus: 'تضاد با تابلو',
  open: 'جلسه تمام نشده',
  unknown: 'خالی، تأییدنشده',
};

export function emptyStatusOf(verdict) {
  return EMPTY_STATUS[verdict] || EMPTY_STATUS.unknown;
}

/**
 * وضعیتِ یک ابزار/روز در برگ پوشش.
 *
 * `hasRows` فقط شکلِ پاسخ را می‌گوید؛ حکم را بازبینی می‌دهد. وقتی بازبینی
 * حکمی ندارد (تابلوی روزانه نیامده) پاسخِ دارای ردیف «داده آمد، تأییدنشده»
 * است — نه «کامل». این تفاوت کلِ بند ۳ ممیزی است.
 */
export function coverageStatusOf(verdict, hasRows) {
  if (verdict && EMPTY_STATUS[verdict]) return EMPTY_STATUS[verdict];
  return hasRows ? 'داده آمد، تأییدنشده' : EMPTY_STATUS.unknown;
}

/**
 * پوشش هر ابزار/روز؛ خالیِ معتبر با خطا یکی نمی‌شود.
 *
 * ═══ چرا «بیرون از جلسه» ستون دارد ═══
 *
 * برگ راهنما همین حالا هم می‌نویسد «شمار ردیف‌های بیرون از این بازه در
 * برگ پوشش می‌آید» — ولی چنین ستونی در فایل نبود. `dataExportSessionRows`
 * عدد را می‌ساخت و دفترکار دورش می‌ریخت، پس تنها جایی که دیده می‌شد صفحهٔ
 * تب بود، نه فایلی که کاربر نگه می‌دارد. کسی که فایل را باز می‌کرد
 * می‌دید «کل ردیف» با جمعِ ردیف‌های برگ ابزار نمی‌خواند و هیچ ستونی
 * تفاوت را توضیح نمی‌داد.
 */
export function dataExportCoverageRows(instruments = [], pairs = [], items = {}, audit = []) {
  const verdicts = new Map((audit || []).map((row) => [row.key, row.verdict]));
  const byIns = new Map((instruments || []).map((item) => [String(item.ins), item]));
  return (pairs || []).map((pair) => {
    const instrument = byIns.get(String(pair.ins)) || {}, hit = items?.[pair.key];
    const rows = Array.isArray(hit?.rows) ? hit.rows : [];
    return {
      baseName: instrument.baseName || '', name: instrument.name || '', kind: instrument.kind || '',
      // اندازهٔ قرارداد اینجا می‌آید تا وقتی ستون‌های مشتق خاموش‌اند،
      // ضریبِ لازم برای بازساختنشان همچنان داخل فایل باشد.
      size: instrument.kind === 'underlying' ? 1 : n(instrument.size),
      ins: String(pair.ins), date: pair.date,
      rows: hit && Array.isArray(hit.rows) ? rows.length : null,
      active: hit && Array.isArray(hit.rows) ? rows.filter((row) => row && row.canceled !== true).length : null,
      canceled: hit && Array.isArray(hit.rows) ? rows.filter((row) => row?.canceled === true).length : null,
      outside: hit && Array.isArray(hit.rows)
        ? rows.filter((row) => !inIntradaySession(row?.time)).length : null,
      status: !hit ? 'درخواست نرفت' : hit.error ? 'خطا'
        : coverageStatusOf(verdicts.get(pair.key), rows.length > 0),
      error: String(hit?.error || ''), source: String(hit?.source || ''),
    };
  });
}

/**
 * ریزمعامله‌های داخل جلسهٔ پیوسته، و شمارِ آنچه بیرون ماند.
 *
 * ═══ چرا جدا، و چرا شمارش ═══
 *
 * خواستهٔ صاحب پروژه «هر روز معاملاتی از ساعت ۹ الی ۱۲:۳۰» است. حذفِ
 * بی‌صدای ردیف‌های بیرون از این بازه یعنی کاربر هیچ‌وقت نمی‌فهمد چیزی
 * کنار گذاشته شده — و اگر روزی همهٔ ردیف‌ها بیرون بیفتند، برگ خالی را
 * «بی‌معامله» می‌خواند. پس شمارش همراه می‌آید.
 */
export function dataExportSessionRows(rows = []) {
  const all = Array.isArray(rows) ? rows : [];
  const inside = all.filter((row) => row.inSession !== false);
  return { rows: inside, outside: all.length - inside.length, total: all.length };
}

/**
 * بازبینیِ ابزار/روزهای خالی، با تابلوی روزانه.
 *
 * ═══ چرا این تابع مهم‌ترین تکهٔ این قلم است ═══
 *
 * فایل گزارش‌شده برای ۵۹ ابزار/روز نوشت «بدون معامله» — از جمله برای خودِ
 * نماد پایه در یک روز عادیِ بازار. برنامه راهی نداشت بفهمد این «واقعیتِ
 * بازار» است یا «پاسخِ خالیِ بالادست»، و بدترین حالتِ ممکن را انتخاب کرد:
 * سکوت.
 *
 * ولی همین برنامه منبعِ دومی دارد که جواب را می‌داند: ردیفِ روزانهٔ همان
 * ابزار (`GetClosingPriceDailyList`) شمارِ معاملهٔ آن روز را دارد. اگر
 * تابلو بگوید آن روز ۶٬۷۹۶ معامله شده و نوارِ ریزمعامله صفر ردیف بدهد،
 * این دیگر حدس نیست — **اثباتِ** نرسیدنِ داده است.
 *
 * `dailyByIns` همان چیزی است که `/api/dailies` می‌دهد. نبودِ ردیفِ روزانه
 * یعنی «نمی‌دانیم»، نه «بی‌معامله» — و همین‌طور هم گزارش می‌شود.
 */
export function dataExportBlankAudit(pairs = [], items = {}, dailyByIns = {}, openDateList = []) {
  // روزی که جلسه‌اش هنوز تمام نشده، تطبیق‌پذیر نیست: تابلوی روزانه‌اش
  // لحظه‌ای است و نوار هنوز پر می‌شود. «ناقص» خواندنش ادعای غلط است.
  const openDates = new Set((openDateList || []).map((date) => Math.trunc(n(date))).filter(Boolean));
  const index = new Map();
  for (const [ins, payload] of Object.entries(dailyByIns || {})) {
    const map = new Map();
    // ═══ چرا این‌قدر محتاط ═══
    //
    // بازبینی یک **کمکِ** تشخیصی است، نه خودِ خروجی. یک پاسخِ بدشکل از
    // تابلوی روزانه نباید کلِ فایلِ آماده را ببرد — و یک بار دقیقاً همین
    // شد: پاسخی بی `rows` به `for…of` رسید و «object is not iterable»
    // تمام اجرا را انداخت، در حالی که همهٔ ریزمعامله‌ها در دست بود.
    const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.rows) ? payload.rows : []);
    for (const row of list) {
      const date = Math.trunc(n(row?.date));
      if (date) map.set(date, row);
    }
    index.set(String(ins), map);
  }
  const out = [];
  for (const pair of pairs || []) {
    const hit = items?.[pair.key];
    if (!hit || hit.error) continue;
    const rows = Array.isArray(hit.rows) ? hit.rows : null;
    if (!rows) continue;
    const daily = index.get(String(pair.ins))?.get(Math.trunc(n(pair.date))) || null;
    const dailyTrades = n(daily?.trades), dailyVolume = n(daily?.vol);
    // ═══ چرا معاملهٔ باطل جدا شمرده می‌شود ═══
    //
    // ردیفی که بالادست «باطل» خوانده حجمش صفر است و در هیچ جمعی نمی‌نشیند،
    // ولی یک **مشاهده** است و شمرده می‌شود. اگر شمارِ نوار با شمارِ تابلو
    // نخواند، تفاوتی به اندازهٔ همین ردیف‌ها می‌تواند توضیح داشته باشد؛
    // پس هر دو عدد بیرون می‌آیند و حکم روی هر دو سنجیده می‌شود.
    const active = rows.filter((row) => row && row.canceled !== true);
    const tapeTrades = active.length;
    const tapeCanceled = rows.length - active.length;
    const tapeVolume = active.reduce((sum, row) => sum + n(row?.quantity), 0);
    out.push({
      key: pair.key, ins: String(pair.ins), date: pair.date,
      known: Boolean(daily),
      dailyTrades: daily ? dailyTrades : NaN,
      dailyVolume: daily ? dailyVolume : NaN,
      tapeTrades, tapeCanceled, tapeVolume,
      tradeGap: daily ? dailyTrades - tapeTrades : NaN,
      volumeGap: daily ? dailyVolume - tapeVolume : NaN,
      verdict: coverageVerdict({
        daily: Boolean(daily), dailyTrades, dailyVolume,
        tapeTrades, tapeCanceled, tapeVolume,
        sessionOpen: openDates.has(Math.trunc(n(pair.date))),
      }),
    });
  }
  return out;
}

/**
 * حکمِ یک ابزار/روز — و چرا شش تا است، نه سه تا.
 *
 * ═══ ایرادِ بند ۳ ممیزی ═══
 *
 * بازبینی فقط برای پاسخ‌های **کاملاً خالی** اجرا می‌شد. بازتولیدِ ممیزی:
 * تابلوی روزانه ۱٬۰۰۰ معامله و ۱۰٬۰۰۰ حجم می‌گفت و نوار **یک** معامله در
 * ۱۰:۳۰ با حجم ۱۰ داشت — و برنامه هیچ ایرادی برنمی‌گرداند و وضعیت «داده
 * آمد» می‌داد. یعنی «چند ردیف آمد» با «کامل آمد» یکی شمرده می‌شد.
 *
 * حالا هر ابزار/روزی که پاسخ گرفته سنجیده می‌شود، با معیارهای هم‌معنا:
 *
 *   matched   حجم و شمارِ فعال با تابلو می‌خوانند
 *   partial   داده آمد ولی از تابلو کمتر است — پاسخِ نیمه‌کامل
 *   missing   نوار خالی است و تابلو معامله ثبت کرده
 *   quiet     نوار خالی است و تابلو هم صفر — واقعاً بی‌معامله
 *   surplus   نوار داده دارد و تابلو صفر می‌گوید؛ تضادِ دو منبع
 *   open      جلسهٔ آن روز هنوز تمام نشده، پس تطبیق معنا ندارد
 *   unknown   تابلوی روزانه در دست نیست — «نمی‌دانیم»، نه «بی‌معامله»
 *
 * ═══ چرا حجم معیارِ اول است ═══
 *
 * شمارِ تابلو ممکن است معاملهٔ باطل را بشمارد یا نشمارد و ما از بیرون
 * نمی‌دانیم کدام؛ ولی حجمِ باطل صفر است، پس حجم معیارِ تمیزتری است. وقتی
 * حجم دقیقاً می‌خواند، اختلافِ شمار تا اندازهٔ ردیف‌های باطل توضیح دارد و
 * حکم «تطبیق‌شده» می‌ماند. اختلافِ بیشتر از آن، دیگر توضیح ندارد.
 */
export function coverageVerdict({
  daily = false, dailyTrades = 0, dailyVolume = 0,
  tapeTrades = 0, tapeCanceled = 0, tapeVolume = 0, sessionOpen = false,
} = {}) {
  if (sessionOpen) return 'open';
  if (!daily) return tapeTrades ? 'unknown' : 'unknown';
  const boardTraded = dailyTrades > 0 || dailyVolume > 0;
  if (!tapeTrades) return boardTraded ? 'missing' : 'quiet';
  if (!boardTraded) return 'surplus';
  const volumeMatches = tapeVolume === dailyVolume;
  const countExplained = Math.abs(dailyTrades - tapeTrades) <= tapeCanceled;
  if (volumeMatches && countExplained) return 'matched';
  return 'partial';
}

export const BLANK_VERDICT_LABEL = {
  matched: 'تطبیق‌شده — شمار و حجم با تابلوی روزانه می‌خوانند',
  partial: 'ناقص — داده آمد ولی از تابلوی روزانه کمتر است',
  missing: 'ریزمعامله نیامد — تابلو برای آن روز معامله ثبت کرده',
  quiet: 'بدون معامله — تابلوی روزانه هم صفر است',
  surplus: 'تضاد — نوار داده دارد ولی تابلوی روزانه صفر است',
  open: 'جلسه هنوز تمام نشده — تطبیق معنا ندارد',
  unknown: 'نامعلوم — تابلوی روزانه در دست نیست',
};

/** جمع‌بندیِ بازبینی، برای جملهٔ وضعیت و برگ راهنما. */
export function blankAuditSummary(audit = []) {
  const list = Array.isArray(audit) ? audit : [];
  const of = (verdict) => list.filter((row) => row.verdict === verdict);
  const missing = of('missing');
  const partial = of('partial');
  return {
    total: list.length,
    missing: missing.length,
    partial: partial.length,
    matched: of('matched').length,
    quiet: of('quiet').length,
    surplus: of('surplus').length,
    open: of('open').length,
    unknown: of('unknown').length,
    // بیشترین معاملهٔ ازدست‌رفته، برای اینکه جمله یک نمونهٔ واقعی داشته باشد.
    worst: [...missing].sort((a, b) => n(b.dailyTrades) - n(a.dailyTrades))[0] || null,
    // و بدترین پاسخِ نیمه‌کامل: آن که بیشترین حجمش جا مانده.
    worstPartial: [...partial].sort((a, b) => n(b.volumeGap) - n(a.volumeGap))[0] || null,
  };
}

/**
 * تایم‌فریم خروجی — از ریزمعاملهٔ خام تا شمعِ ساعتی.
 *
 * ═══ چرا این گزینه، پاسخِ «فایل سنگین است» است ═══
 *
 * فایلِ سنگین از ستون اضافه سنگین نشده؛ از **ردیف** سنگین شده. یک روزِ
 * پرمعاملهٔ یک پایه به‌تنهایی ده‌ها هزار ریزمعامله دارد، و بازهٔ یک‌ماهه
 * روی ده قرارداد یعنی میلیون‌ها ردیف. هیچ فشرده‌سازی‌ای این را کوچک
 * نمی‌کند، چون داده واقعاً همان‌قدر است.
 *
 * تنها راهِ صادقانهٔ کوچک‌کردن، **کم‌کردنِ تفکیک زمانی** است — نه حذفِ
 * تصادفیِ ردیف. شمعِ یک‌دقیقه‌ای همان روز را با حدود ۲۱۰ ردیف نشان می‌دهد
 * به‌جای ده‌ها هزار، و هیچ‌چیزِ مشاهده‌شده‌ای را جا نمی‌اندازد: باز،
 * بیشترین، کمترین، بسته، حجم، ارزش و شمارِ معامله، همه از ردیف‌های واقعی.
 *
 * `tick` سرِ جایش می‌ماند و پیش‌فرض هم هست: کسی که ریزترین حالت را
 * می‌خواهد، همان را می‌گیرد.
 */
export const DATA_EXPORT_FRAMES = [
  { id: 'tick', label: 'ریزمعامله (خام)', seconds: 0 },
  { id: 'm1', label: 'شمع ۱ دقیقه', seconds: 60 },
  { id: 'm5', label: 'شمع ۵ دقیقه', seconds: 300 },
  { id: 'm15', label: 'شمع ۱۵ دقیقه', seconds: 900 },
  { id: 'm30', label: 'شمع ۳۰ دقیقه', seconds: 1800 },
  { id: 'm60', label: 'شمع ۶۰ دقیقه', seconds: 3600 },
];

export function dataExportFrame(id = 'tick') {
  return DATA_EXPORT_FRAMES.find((frame) => frame.id === String(id ?? '')) || DATA_EXPORT_FRAMES[0];
}

/**
 * شمع‌های یک ابزار از ریزمعامله‌هایش.
 *
 * ═══ سه قاعده‌ای که این تابع نمی‌شکند ═══
 *
 * ۱. **سطلِ بی‌معامله ساخته نمی‌شود.** دقیقه‌ای که هیچ معامله‌ای نداشته،
 *    ردیف ندارد — نه ردیفی با قیمتِ شمعِ قبل. جای خالی صادق است و
 *    این همان چیزی است که قاعدهٔ ۲-۴ می‌خواهد.
 * ۲. **معاملهٔ باطل در قیمت نمی‌نشیند.** ردیفی که بالادست صریحاً «باطل»
 *    خوانده، از باز/بیشترین/کمترین/بسته و از حجم بیرون است — ولی
 *    شمرده می‌شود و ستون خودش را دارد، تا حذفش دیده شود.
 * ۳. **سطلی که فقط باطل داشته، حذف نمی‌شود.** ردیفش می‌آید با خانه‌های
 *    قیمتِ خالی و شمارِ باطل — وگرنه کاربر فکر می‌کند آن دقیقه ساکت بوده.
 *
 * مبدأ سطل‌ها ۹:۰۰ است، پس شمعِ پنج‌دقیقه‌ای همیشه روی ۹:۰۰، ۹:۰۵، … می‌افتد
 * و دو اجرا با بازه‌های متفاوت، شمعِ هم‌زمانِ قابل‌مقایسه می‌دهند.
 *
 * ═══ چرا `tradeSecond` و نه خودِ عدد ═══
 *
 * زمانِ بالادست `HHMMSS` است نه ثانیه: ۹:۰۰:۱۰ عدد ۹۰۰۱۰ است. سطل‌بندی
 * روی همان عدد، مرزها را وسط ثانیهٔ ۶۰ تا ۹۹ می‌شکند و شمعِ بی‌معنا
 * می‌سازد. پس اول به ثانیه ترجمه می‌شود و برچسبِ سطل دوباره `HHMMSS`.
 */
const hhmmss = (second) => {
  const value = Math.max(0, Math.trunc(second));
  return (Math.floor(value / 3600) * 10000) + (Math.floor((value % 3600) / 60) * 100) + (value % 60);
};

export function dataExportCandles(rows = [], seconds = 60) {
  const width = Math.max(1, Math.trunc(n(seconds)));
  const byBucket = new Map();
  const order = [];
  for (const row of rows || []) {
    // ═══ چرا ثانیه به بازهٔ جلسه چفت می‌شود ═══
    //
    // `inIntradaySession` پایان جلسه را **شامل** می‌گیرد، پس معاملهٔ
    // حراج پایانی دقیقاً روی ۱۲:۳۰:۰۰ می‌نشیند. بی چفت‌کردن، همان یک
    // ثانیه سطلِ پانزدهمی به نام ۱۲:۳۰ می‌سازد که فقط یک ثانیه از جلسه
    // را می‌پوشاند: فایل ممیزی‌شده برای نماد پایه ۱۲ چنین ردیفی داشت، هر
    // کدام با ۱ تا ۷ معامله، کنار ۱۴ سطلِ واقعی روز.
    //
    // بقیهٔ برنامه این را ندارد چون `bucketStartSecond` در
    // `core/backtest.mjs` همین چفت را دارد؛ نبودنش اینجا یعنی شمعِ خروجی
    // با شمعِ بازپخش و آزمون تاریخی هم‌ردیف نمی‌شود.
    const second = Math.min(Math.max(tradeSecond(row?.time), INTRADAY_START_SECOND),
      INTRADAY_END_SECOND - 1);
    const start = INTRADAY_START_SECOND + (Math.floor((second - INTRADAY_START_SECOND) / width) * width);
    const key = `${row.date}:${start}`;
    let bar = byBucket.get(key);
    if (!bar) {
      bar = {
        date: row.date, second: start, time: hhmmss(start),
        open: NaN, high: NaN, low: NaN, close: NaN,
        volume: 0, value: 0, trades: 0, canceled: 0, source: String(row.source || ''),
      };
      byBucket.set(key, bar);
      order.push(bar);
    }
    if (row.canceled === true) { bar.canceled += 1; continue; }
    const price = n(row.price), quantity = n(row.quantity);
    if (!Number.isFinite(bar.open)) bar.open = price;
    bar.high = Number.isFinite(bar.high) ? Math.max(bar.high, price) : price;
    bar.low = Number.isFinite(bar.low) ? Math.min(bar.low, price) : price;
    bar.close = price;
    bar.volume += quantity;
    bar.value += price * quantity;
    bar.trades += 1;
  }
  return order.sort((a, b) => a.date - b.date || a.second - b.second);
}

/**
 * چند ابزار/روز از هر مسیر رفت، و چند تا از هر مسیر داده آورد.
 *
 * ═══ چرا این تفکیک، خبرِ اول است ═══
 *
 * فایل گزارش‌شدهٔ نوبت پنجم ۱٬۳۴۹ جفت داشت؛ ۱٬۳۱۶ از مسیر تاریخی رفتند و
 * **هیچ‌کدام** داده نیاوردند، و هر ۲ ردیفِ دارای داده از نوار زنده آمدند.
 * این جمله کلِ تشخیص است — ولی برای رسیدن به آن باید ۱٬۳۴۹ ردیفِ برگ پوشش
 * را دستی دسته‌بندی می‌کردی. وقتی یک **مسیر کامل** صفر می‌آورد، آن دیگر
 * «بازارِ ساکت» نیست و باید در نگاه اول دیده شود.
 */
export function dataExportRouteSplit(pairs = [], items = {}) {
  const make = () => ({ total: 0, ok: 0, empty: 0, failed: 0, trades: 0 });
  const out = { history: make(), live: make(), unknown: make(), total: 0 };
  for (const pair of pairs || []) {
    const hit = items?.[pair.key];
    const source = String(hit?.source || '');
    const bucket = source === 'live' ? out.live : (source === 'history' ? out.history : out.unknown);
    bucket.total += 1;
    out.total += 1;
    if (!hit || hit.error) { bucket.failed += 1; continue; }
    const rows = Array.isArray(hit.rows) ? hit.rows.length : 0;
    if (rows) { bucket.ok += 1; bucket.trades += rows; } else bucket.empty += 1;
  }
  return out;
}

/**
 * روزهایی که خالی‌بودنشان واقعیتِ بازار نیست.
 *
 * ═══ چرا «روز»، و نه «ابزار/روز» ═══
 *
 * گزارش صاحب پروژه: «خروجی صرفاً دیتای روز آخر معاملاتی را می‌دهد.» فایل
 * همین را نشان داد — ۱٬۳۱۶ ابزار/روز از مسیر تاریخی، همه خالی، صفر خطا،
 * و تنها دادهٔ فایل از نوار زندهٔ آخرین جلسه.
 *
 * یک قراردادِ کم‌معامله می‌تواند یک روز هیچ معامله‌ای نداشته باشد؛ این
 * واقعیتِ بازار است. ولی یک **روزِ معاملاتیِ کامل** که در آن هیچ‌کدام از
 * ابزارهای انتخابی — از جمله خودِ نماد پایه — حتی یک معامله نداشته
 * باشند، واقعیتِ بازار نیست. تابلوی روزانه هم همین را می‌گوید: ۳۶٬۱۳۴
 * معامله برای همان پایه در همان روز.
 *
 * پس خالی‌بودنِ **سراسریِ یک روز** خودش مدرک است و لازم نیست منتظر تأییدِ
 * تابلوی روزانه بماند — تابلویی که برای قراردادِ منقضی اغلب در دست نیست.
 *
 * و چرا این مهم است: تلاش دوباره با `fresh` به نشانیِ بالادست یک
 * cache-buster می‌چسباند. اگر لبهٔ CDN یک پاسخِ خالیِ کهنه را نگه داشته
 * باشد — که ۲۰۰ و JSON معتبر است و هیچ‌جا خطا به نظر نمی‌رسد — تنها همین
 * از کنارش رد می‌شود.
 *
 * روزی که حتی یک خطا داشته باشد اینجا نمی‌آید: آن خطا علتِ خودش را دارد
 * و مسیر خودش را، و «خالیِ مشکوک» خواندنش پنهان‌کردنِ آن است.
 */
export const SUSPECT_DAY_MIN_PAIRS = 2;

export function suspectEmptyDays(pairs = [], items = {}, { minPairs = SUSPECT_DAY_MIN_PAIRS } = {}) {
  const byDay = new Map();
  for (const pair of pairs || []) {
    const hit = items?.[pair.key];
    // فقط روزهایی که از مسیر تاریخی رفته‌اند. نوار زنده مسیر دیگری دارد.
    if (!hit || String(hit.source || '') !== 'history') continue;
    const day = Math.trunc(n(pair.date));
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, { total: 0, empty: 0, failed: 0, retried: 0 });
    const seen = byDay.get(day);
    seen.total += 1;
    if (hit.error) seen.failed += 1;
    else if (!(Array.isArray(hit.rows) && hit.rows.length)) seen.empty += 1;
    if (hit.retried === true) seen.retried += 1;
  }
  return [...byDay.entries()]
    .filter(([, seen]) => seen.total >= minPairs && seen.failed === 0
      && seen.empty === seen.total && seen.retried === 0)
    .map(([day]) => day)
    .sort((a, b) => a - b);
}

/**
 * چیزهایی که باید پیش از خروجی تمام شده باشند.
 *
 * ═══ چرا `complete` تنها کافی نیست، و چرا `missingDays` هم ═══
 *
 * ممیزی: «قفل فقط `missingDays` را بررسی می‌کند؛ وقتی اسکن روزها تمام شود
 * ولی پاس کاتالوگ یا مشخصات هنوز در حال اجرا باشد، دکمه زودتر از تکمیلِ
 * واقعیِ دفتر فعال می‌شود.» درست است — و راهِ سرراستش، یعنی قفل روی
 * `universe.complete`، همان اشتباهی است که یک بار شد و صاحب پروژه برش
 * داشت: آن پرچم یک «و»ی همه‌چیز است و بعضی اجزایش **هرگز** درست نمی‌شوند.
 *
 * «۶۶ سری رسمیِ تک‌سمت» واقعیتِ بازار است، نه کارِ نیمه‌تمام؛ قفل روی آن
 * یعنی دکمه‌ای که هیچ‌وقت فعال نمی‌شود. «چند درخواستِ ناموفق» هم گذراست و
 * خودش پاک نمی‌شود.
 *
 * پس فقط چیزهایی می‌بندند که **فهرستِ قراردادهای انتخابی را عوض می‌کنند**:
 * روزِ اسکن‌نشده، پاسِ کاتالوگ، مشخصاتِ قرارداد انتخابیِ بی‌معامله و
 * بی‌تاریخ، و دفترِ نسخه‌قدیمی که اصلاً از کاتالوگ عبور نکرده. هر کدام
 * تمام می‌شوند و قفل باز می‌شود؛ شکستِ مشخصاتِ ابزار نامرتبط مانع نیست.
 */
export function exportBlockers(universe = null, instruments = null) {
  if (!universe) return [];
  const out = [];
  const missing = Math.max(0, Math.trunc(n(universe.missingDays)));
  if (missing > 0) out.push(`${missing} روزِ کاریِ این بازه هنوز اسکن نشده`);
  const scan = universe.health?.scan || null;
  // دفترِ بی‌گزارشِ سلامت چیزی برای ادعا ندارد؛ نبودِ خبر، خبرِ بد نیست.
  if (!scan) return out;
  if (scan.versionCurrent === false) out.push('دفتر با نسخهٔ قدیمی ساخته شده و از کاتالوگ ابزار عبور نکرده');
  else {
    if (scan.catalogComplete === false) out.push('پیمایش کاتالوگ ابزار تمام نشده');
    if (scan.detailsComplete === false) {
      // مشخصاتِ کلِ بازار نباید خروجیِ چند قراردادِ معلوم را نگه دارد.
      // برای قراردادِ معامله‌شده `activeFrom` از اولین روزِ واقعی می‌آید
      // و عمرش در این بازه معلوم است. فقط قراردادِ انتخابیِ بی‌تاریخ است
      // که بدون پاس مشخصات نمی‌تواند با صداقت وارد بازه شود.
      const scoped = Array.isArray(instruments);
      const unknown = scoped ? unknownListingContracts(instruments) : [];
      if (!scoped || unknown.length > 0) {
        out.push(scoped
          ? `${unknown.length} قراردادِ انتخابی هنوز تاریخ عرضهٔ معلوم ندارد`
          : 'مشخصات قراردادهای بی‌معامله کامل نشده');
      }
    }
  }
  return out;
}

/**
 * ابزارهایی که واقعاً در این بازه درخواست دارند.
 *
 * ═══ چرا شیت هم باید حذف شود، نه فقط درخواست ═══
 *
 * ممیزی: قراردادِ بی‌تاریخِ عرضه دیگر جفت نمی‌سازد، ولی هنوز در فهرستِ
 * ابزارها می‌ماند و سازندهٔ Excel برای **هر** ابزار یک برگ می‌سازد — پس
 * باز هم برگِ خالیِ قراردادی ساخته می‌شود که اصلاً مالِ این بازه نیست.
 *
 * مرزش دقیق است: ملاک «جفت داشتن» است، نه «معامله داشتن». قراردادی که در
 * بازه زنده بوده و هیچ معامله‌ای نکرده، همچنان برگِ خالیِ خودش را می‌گیرد —
 * آن برگِ خالی یک واقعیت است و عمداً ساخته می‌شود.
 */
export function instrumentsWithPairs(instruments = [], pairs = []) {
  const asked = new Set((pairs || []).map((pair) => String(pair?.ins ?? '')));
  return (instruments || []).filter((item) => asked.has(String(item?.ins ?? '')));
}
