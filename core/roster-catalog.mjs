// کاتالوگ ابزار — دیدنِ قراردادی که هرگز معامله نشد.
//
// ═══ نقصی که اجرای واقعی نشان داد ═══
//
//     /ClosingPrice/GetInstrmentsHistoryInDay/{date}
//
// «سابقهٔ معاملات آن روز» است، نه «فهرست ابزارهای آن روز». تفاوتشان تا
// وقتی همه معامله می‌شوند دیده نمی‌شود؛ ولی قراردادی که گشایش شده و هیچ
// معامله‌ای نداشته، در **هیچ** روزی ظاهر نمی‌شود. شش پوتِ `طهرم۰۱۱۱` تا
// `طهرم۰۱۱۶` دقیقاً به همین دلیل غایب بودند: سررسید ۱۴۰۴/۰۱/۲۷ چهارده
// کال داشت و فقط هشت پوت، و هر استراتژی‌ای که هر دو سمت را می‌خواست
// بی‌صدا حذف می‌شد.
//
// اشتباه من در برش پیشین یک فرض نانوشته بود: «هر قراردادی که وجود داشته،
// دست‌کم یک بار معامله شده». برای بازارِ کم‌عمق این فرض غلط است، و
// خطرناک‌تر اینکه **جهت‌دار** است — قراردادهای بی‌معامله معمولاً همان
// دورافتاده‌ها هستند، پس هر آمارِ حاصل به‌سمت سری‌های پرمعامله سوگیری
// دارد.
//
// ═══ منبع دوم ═══
//
//     /Instrument/GetInstrumentSearch/{عبارت}
//
// این مسیر از **کاتالوگ ابزار** می‌خواند نه از سابقهٔ معاملات، پس ابزارِ
// بی‌معامله و حتی حذف‌شده را هم می‌دهد. دو مسیر دیگر مشخصات را کامل
// می‌کنند:
//
//     /Instrument/GetInstrumentInfo/{insCode}
//     /Instrument/GetInstrumentOptionByInstrumentID/{instrumentID}
//
// ═══ مرزی که رد نمی‌شود ═══
//
// هیچ قراردادی ساخته نمی‌شود. اگر برای یک کال، پوتِ متناظرش پیدا نشد،
// شناسه‌اش با تغییر حرف یا رقم حدس زده **نمی‌شود** — فقط گزارش می‌شود که
// این جفت ناقص است. یک شناسهٔ حدسی که تصادفاً به قرارداد دیگری بخورد،
// بدتر از یک جای خالیِ اعلام‌شده است.
//
// این ماژول شبکه نمی‌زند. گرفتنِ پاسخ کار سرور و ابزار است؛ اینجا فقط
// «این JSON چه می‌گوید» — و همان است که آزمون می‌شود.

import { num } from './num.mjs';
import { safeId } from './json-safe.mjs';
import { jalaliToGregorian } from './jalali.mjs';
import { normalizeFa, rosterIntake } from './option-roster.mjs';
import { deepObjects } from './roster-scan.mjs';

export const searchPath = (term) => `/Instrument/GetInstrumentSearch/${encodeURIComponent(String(term).trim())}`;
export const infoPath = (ins) => `/Instrument/GetInstrumentInfo/${String(ins).replace(/[^\d]/g, '')}`;
export const optionSpecPath = (id) => `/Instrument/GetInstrumentOptionByInstrumentID/${encodeURIComponent(String(id).trim())}`;

/**
 * تاریخ فشرده‌ای که ممکن است جلالی باشد یا میلادی → میلادیِ فشرده.
 *
 * `beginDate` و `endDate` در مشخصات قرارداد جلالی‌اند (۱۴۰۴۰۱۲۷)، ولی
 * همین ماژول جاهای دیگر تاریخ میلادی هم می‌بیند. مرزِ ۱۳۰۰ تا ۱۷۰۰ هر دو
 * را از هم جدا می‌کند و هیچ سالِ میلادیِ واقعی داخلش نمی‌افتد.
 */
export function gregorianOf(value) {
  const v = num(String(value ?? '').replace(/[^\d]/g, ''), 0);
  if (!(v >= 10000101)) return 0;
  const y = Math.floor(v / 10000), m = Math.floor(v / 100) % 100, d = v % 100;
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return 0;
  if (y >= 1300 && y < 1700) {
    const [gy, gm, gd] = jalaliToGregorian(y, m, d);
    return gy * 10000 + gm * 100 + gd;
  }
  return v;
}

/** آرایهٔ نتایج جست‌وجو، هر شکلی که پاسخ داشته باشد. */
export function unwrapSearch(payload) {
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === 'object');
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['instrumentSearch', 'instrumentsSearch', 'searchInstrument', 'instrument']) {
    if (Array.isArray(payload[key])) return payload[key].filter((x) => x && typeof x === 'object');
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && (!value.length || (value[0] && typeof value[0] === 'object'))) {
      return value.filter((x) => x && typeof x === 'object');
    }
  }
  return [];
}

const pick = (obj, ...keys) => {
  for (const key of keys) {
    const v = obj?.[key];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
};

/**
 * یک ردیف جست‌وجو → ورودی خام دفتر.
 *
 * `null` یعنی این ردیف شناسهٔ قابل‌اعتماد ندارد. شناسه‌ای که از مرز امنِ
 * عددی رد شده و به‌شکل `number` رسیده، ممکن است همان لحظه گرد شده باشد؛
 * `safeId` آن را رد می‌کند و ردیف شمرده می‌شود نه استفاده.
 */
export function searchRow(raw) {
  const ins = safeId(pick(raw, 'insCode', 'InsCode'));
  if (!ins) return null;
  return {
    ins,
    symbol: normalizeFa(pick(raw, 'lVal18AFC', 'lVal18', 'symbol', 'Symbol') ?? ''),
    name: normalizeFa(pick(raw, 'lVal30', 'name', 'Name') ?? ''),
    id: String(pick(raw, 'instrumentID', 'InstrumentID') ?? '').trim(),
    fromCatalog: true,
  };
}

/**
 * نتایج یک جست‌وجو → ردیف‌های قراردادی، با شمارشِ آنچه نیامد.
 *
 * جست‌وجو همه‌چیز را برمی‌گرداند — سهم پایه، صندوق، اوراق — پس فقط
 * قراردادها نگه داشته می‌شوند. شمارِ شناسه‌های ناامن جدا می‌آید چون یک
 * کلاس خطای متفاوت است: نه «قرارداد نبود»، بلکه «قرارداد بود و شناسه‌اش
 * قابل‌اعتماد نیست».
 */
export function scanSearch(payload) {
  const raws = [];
  let unsafe = 0;
  for (const raw of unwrapSearch(payload)) {
    const ins = pick(raw, 'insCode', 'InsCode');
    if (ins !== null && !safeId(ins)) { unsafe += 1; continue; }
    const row = searchRow(raw);
    if (row) raws.push(row);
  }

  // ── از همان درِ ورودیِ بقیه رد می‌شوند ──────────────────────────────
  //
  // نخستین نسخه ردیفِ **خام** جست‌وجو را مستقیم به دفتر می‌داد. نتیجه‌اش
  // ردیفی بود بی‌`side`، بی‌`base`، بی‌`strike` و بی‌`expiry` — یعنی
  // چیزی که در هیچ زنجیره‌ای نمی‌نشیند و در هیچ کنترل جفتی شمرده
  // نمی‌شود. قراردادِ بی‌معامله «پیدا» می‌شد و همچنان غایب می‌ماند، و
  // بدتر: عددِ کل درست به نظر می‌رسید.
  //
  // پس همان `rosterIntake` که سابقهٔ روزانه از آن رد می‌شود، اینجا هم
  // رد می‌کند. یک در، یک قاعده.
  const take = rosterIntake(raws);
  return { rows: take.rows, notOption: take.notOption, unparsed: take.unparsed, unsafe };
}

/** مشخصات ابزار از `GetInstrumentInfo`. */
export function instrumentInfo(payload) {
  let best = null, score = -1;
  for (const obj of deepObjects(payload)) {
    const n = ['insCode', 'instrumentID', 'lVal18AFC', 'lVal30', 'cIsin'].reduce((s, k) => s + (k in obj ? 1 : 0), 0);
    if (n > score) { score = n; best = obj; }
  }
  if (!best) return null;
  const ins = safeId(pick(best, 'insCode', 'InsCode'));
  if (!ins) return null;
  return {
    ins,
    id: String(pick(best, 'instrumentID', 'InstrumentID') ?? '').trim(),
    symbol: normalizeFa(pick(best, 'lVal18AFC', 'lVal18') ?? ''),
    name: normalizeFa(pick(best, 'lVal30') ?? ''),
    contractSize: num(pick(best, 'contractSize', 'ContractSize'), 0),
    uaIns: safeId(pick(best, 'uaInsCode', 'UaInsCode')) || '',
  };
}

/**
 * مشخصات رسمی قرارداد از `GetInstrumentOptionByInstrumentID`.
 *
 * این تنها جایی است که **بازهٔ اعتبار** قرارداد از خودِ بازار می‌آید.
 * پیش از این، «از کِی زنده بود» از اولین روزی می‌آمد که معامله‌ای دیده
 * شده بود — و آن دو یکی نیستند: قراردادی که سه ماه پیش گشایش شد و
 * دیروز اولین معامله‌اش را داشت، در بک‌تست سه ماه دیر وارد بازار می‌شد.
 * برای قراردادِ بی‌معامله که اصلاً تاریخی نداشت.
 */
export function optionSpec(payload) {
  let best = null, score = -1;
  for (const obj of deepObjects(payload)) {
    const n = ['strikePrice', 'beginDate', 'endDate', 'contractSize', 'uaInsCode'].reduce((s, k) => s + (k in obj ? 1 : 0), 0);
    if (n > score) { score = n; best = obj; }
  }
  if (!best || score < 2) return null;
  const begin = gregorianOf(pick(best, 'beginDate', 'BeginDate'));
  const end = gregorianOf(pick(best, 'endDate', 'EndDate'));
  const strike = num(pick(best, 'strikePrice', 'StrikePrice'), 0);
  if (!begin && !end && !(strike > 0)) return null;
  return {
    ins: safeId(pick(best, 'insCode', 'InsCode')) || '',
    uaIns: safeId(pick(best, 'uaInsCode', 'UaInsCode')) || '',
    strike: strike > 0 ? strike : 0,
    listedFrom: begin,
    listedTo: end,
    contractSize: num(pick(best, 'contractSize', 'ContractSize'), 0),
  };
}

/**
 * عبارت‌هایی که باید جست‌وجو شوند تا خانوادهٔ یک قرارداد کامل شود.
 *
 * دو دسته، و هر دو **از دادهٔ دیده‌شده** می‌آیند نه از حدس:
 *
 *   • نامِ پایه («اهرم») — جست‌وجوی TSETMC نام را هم می‌بیند، پس
 *     قراردادهایی که نامشان این پایه را دارد برمی‌گردند.
 *   • پیشوندِ حرفیِ نمادهای شناخته‌شدهٔ همان پایه («ضهرم»، «طهرم»).
 *     این پیشوند مکانیکی از نام پایه ساخته نمی‌شود — «اهرم» به «طهرم»
 *     تبدیل نمی‌شود — پس فقط از نمادی که واقعاً دیده‌ایم درمی‌آید.
 *     همین است که خواهرِ بی‌معاملهٔ یک قرارداد را پیدا می‌کند.
 */
export function searchTerms(rows = []) {
  const byBase = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const base = normalizeFa(row?.base);
    if (!base) continue;
    let set = byBase.get(base);
    if (!set) { set = new Set([base]); byBase.set(base, set); }
    const prefix = String(row?.symbol ?? '').match(/^[^\d\s]+/);
    if (prefix && prefix[0].length >= 2) set.add(prefix[0]);
  }
  return [...byBase.entries()].map(([base, terms]) => ({ base, terms: [...terms] }));
}

/** همهٔ عبارت‌ها، بی‌تکرار و مرتب — ترتیب پایدار یعنی اسکنِ بازتولیدپذیر. */
export function flatTerms(rows = []) {
  const all = new Set();
  for (const { terms } of searchTerms(rows)) for (const term of terms) all.add(term);
  return [...all].sort();
}
