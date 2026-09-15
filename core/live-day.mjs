// روز جاری، از عکس لحظه‌ای تابلو به‌علاوهٔ نوار معامله.
//
// چرا لازم شد: «تحلیل تاریخی استراتژی» و «آزمون همه استراتژی‌ها» هر دو از
// فهرست روزانهٔ بسته‌شده تغذیه می‌شوند و همیشه یک روز عقب‌اند. کاربر
// می‌خواهد همان تحلیل را از روز مبدأ تا همین لحظه هم ببیند، بدون آنکه
// حالت قبلی را از دست بدهد.
//
// ═══ دو منبع، نه یکی — و چرا این تصحیح لازم شد ═══
//
// ممیزی (۱۴۰۵/۰۶/۲۴) ردیف ۱: «منطق ساخت ردیف امروز فرض کرده عکس زنجیره
// اختیار دارای `qTotTran5J_UA` یا `zTotTran_UA` است؛ پاسخ واقعی هیچ‌کدام
// را ندارد.» درست بود، و خودِ سرور هم همین را می‌دانست: کنار
// `/api/live-dashboard` نوشته شده «دیده‌بان اختیار در پاسخ واقعی
// حجم/تعداد معامله پایه را نمی‌فرستد».
//
// نتیجهٔ عملی‌اش بدترین شکل خرابی بود — بی‌صدا. هر قرارداد اختیار ردیف
// امروز می‌گرفت و هیچ نماد پایه‌ای نمی‌گرفت، پس سری‌ها ناهم‌تراز می‌شدند:
// اختیارِ امروز کنار پایهٔ دیروز. و چون تقویم‌ها روزهایشان را از سریِ
// **پایه** می‌سازند، امروز در هیچ انتخابگری ظاهر نمی‌شد. هیچ خطایی هم
// بالا نمی‌رفت.
//
// پس تابلو تنها منبع نیست:
//
//   تابلوی اختیار  →  قیمت و فعالیتِ خودِ قراردادها
//   نوار معامله    →  قیمت و فعالیتِ نمادهای پایه
//
// و نوار از تابلو **غنی‌تر** است: ریزمعامله «اولین»، «کمترین» و «بیشترین»
// روز را هم می‌دهد که عکس تابلو ندارد. پس هرجا نوار باشد مقدم است و تابلو
// فقط جای نبودنش را می‌گیرد.
//
// سه تصمیم که تمام سختی این فایل در آن‌هاست:
//
// ۱. ابزاری که امروز معامله نشده، ردیف نمی‌گیرد. تابلو برای آن هم قیمت
//    می‌دهد — قیمت دیروز که به امروز منتقل شده. نوشتنش به‌عنوان «قیمت
//    امروز» یعنی ساختن عددی که هیچ‌کس آن را معامله نکرده (قاعدهٔ ۲-۴).
//    برای نماد پایه، **تنها** مدرکِ معامله‌شدن همان نوار است.
//
// ۲. «اولین»، «کمترین» و «بیشترین» را فقط نوار می‌دهد. از تابلو صفر
//    می‌مانند تا `historyPrice` همان «فاقد داده» را بدهد و آن مبناها روز
//    جاری را اصلاً پیشنهاد نکنند — به‌جای اینکه با «آخرین» پر شوند و
//    کاربر خیال کند کمترین قیمت روز را در دست دارد.
//
// ۳. عکس تابلو تاریخ ندارد. تاریخ را از ساعت مشاهده می‌سازیم، ولی فقط
//    وقتی مطمئنیم عکس به **امروز** می‌چسبد — هم فازِ بازار، هم منبعِ خودِ
//    پاسخ. پیش از باز شدن بازار و در روز غیرمعاملاتی، همان عکس محتوای
//    جلسهٔ **قبلی** را نشان می‌دهد؛ و وقتی تابلو قطع است، سرور بایگانی
//    روی دیسک را سرو می‌کند. مهر امروز زدن روی هیچ‌کدام درست نیست.

import { normalizeHistoryDate } from './history.mjs';
import { tehranDateNumber } from './tehran-day.mjs';

export { tehranDateNumber };

const n = (value) => {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
};
/** عددِ قیمتی: منفی و صفر یعنی «نداریم»، نه «صفر ریال». */
const price = (value) => {
  const x = Number(value);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

// فازهایی که در آن‌ها عکس تابلو به **امروز** تعلق دارد:
//
// - `open`   جلسه در جریان است.
// - `after`  جلسهٔ امروز تمام شده و تابلو ارقام نهایی همین امروز را نگه
//            داشته؛ این همان حالتی است که کاربر عصر می‌خواهد ببیند.
// - `ungated` اپراتور دروازهٔ ساعات بازار را عمداً خاموش کرده؛ تصمیم صریح
//            خودش است و ما رویش قضاوت نمی‌کنیم.
//
// و آن‌ها که تعلق ندارد: `before` (بازار هنوز باز نشده، تابلو مال جلسهٔ
// دیروز است) و `holiday` (اصلاً جلسه‌ای در کار نیست).
export const LIVE_DAY_PHASES = ['open', 'after', 'ungated'];

// منبع‌هایی که واقعاً تابلوی **امروز**اند.
//
// ممیزی ردیف ۸: «اگر تابلوی زنده قطع شود، `/api/history/universe` می‌تواند
// از بایگانی قبلی با `source=watch-archive` پاسخ دهد؛ ولی مصرف‌کننده فقط
// فاز بازار و زمان را بررسی می‌کند.» درست بود — و آن حالت دقیقاً وقتی رخ
// می‌دهد که فاز `open` است، یعنی همان وقتی که بررسیِ فاز سبز می‌شود.
//
// بقیهٔ منبع‌ها (`archive`، `roster`، `roster-range`، `watch-archive`)
// هرکدام روزِ دیگری‌اند و خودشان هم همین را می‌گویند؛ فقط کسی نمی‌پرسید.
export const LIVE_DAY_SOURCES = ['watch', 'snapshot'];

/**
 * روزی که باید روی عکس تابلو مهر شود.
 *
 * `ok: false` یعنی «نمی‌دانیم این عکس مال کدام روز است»، نه «خطا». فراخوان
 * باید همان داده‌های بسته‌شده را نگه دارد و دلیل را به کاربر بگوید.
 *
 * `meta` همان بدنهٔ پاسخ است. منبعِ نامعتبر صریح رد می‌شود، نه با سکوت:
 * بایگانیِ دیروز که مهر امروز خورده باشد، از نبودِ ردیف امروز بدتر است.
 */
export function liveDayOf(market = {}, at = Date.now(), meta = {}) {
  const phase = String(market?.phase || '');
  const why = String(market?.why || '');
  if (!LIVE_DAY_PHASES.includes(phase)) return { ok: false, date: 0, phase, why };
  const source = String(meta?.source || '');
  if (!LIVE_DAY_SOURCES.includes(source)) {
    return { ok: false, date: 0, phase, why: `عکس از «${source || 'منبع نامعلوم'}» آمد، نه از تابلوی امروز` };
  }
  if (meta?.archived === true || meta?.boardUnavailable === true) {
    return { ok: false, date: 0, phase, why: 'تابلوی زنده در دسترس نبود و بایگانی سرو شد' };
  }
  const date = tehranDateNumber(at);
  if (!date) return { ok: false, date: 0, phase, why: 'ساعت عکس لحظه‌ای خوانده نشد' };
  return { ok: true, date, phase, why };
}

/**
 * کدِ نمادهای پایهٔ روی عکس تابلو.
 *
 * فراخوان با همین فهرست تصمیم می‌گیرد نوار کدام ابزارها را بگیرد. بدون
 * آن، یا باید نوارِ همه‌چیز گرفته شود (گران و بی‌فایده، چون قراردادها را
 * خودِ تابلو دارد) یا هیچ‌کدام (همان باگی که بود).
 */
export function liveBaseCodes(rows = []) {
  const seen = new Set();
  for (const row of rows || []) {
    const ins = String(row?.uaInsCode ?? '').trim();
    if (ins) seen.add(ins);
  }
  return [...seen];
}

/**
 * ابزارهایی که ارزش دارد نوارشان گرفته شود.
 *
 * ═══ چرا این فهرست، نه «همه» و نه «هیچ» ═══
 *
 * ممیزی ردیف ۶: «عکس زنجیره قیمت اولین، کمترین و بیشترین روز را نمی‌دهد…
 * برای محاسبه امروز با مبنای FIRST/LOW/HIGH باید ریزمعامله خلاصه شود.»
 * درست است — ولی گرفتنِ نوارِ هر قرارداد، صدها درخواست بالادست است.
 *
 * دو صرفه‌جویی که فهرست را کوچک و دقیق می‌کنند:
 *
 * ۱. فقط ابزارهایی که فراخوان خواسته. عکس، کل بازار است.
 * ۲. قراردادی که تابلو می‌گوید امروز معامله **نشده**، ردیفی نمی‌گیرد که
 *    بخواهد کامل شود؛ پرسیدنش فقط سهمیه می‌سوزاند. نماد پایه استثناست:
 *    تابلو دربارهٔ معامله‌شدنش چیزی نمی‌گوید، پس همیشه پرسیده می‌شود.
 *
 * `withContracts` خاموش بماند، فقط پایه‌ها می‌آیند — همان چیزی که برای
 * «امروز در تقویم باشد» کافی است. روشن کردنش وقتی معنی دارد که فراخوان
 * قراردادهای **یک** نماد را می‌خواهد و کاربر خودش دکمهٔ دریافت را زده.
 */
export function liveTapeCodes(rows = [], wanted = [], { withContracts = false } = {}) {
  const want = wanted instanceof Set ? wanted : new Set((wanted || []).map((code) => String(code || '')));
  const out = new Set();
  for (const row of rows || []) {
    const ua = String(row?.uaInsCode ?? '').trim();
    if (ua && want.has(ua)) out.add(ua);
    if (!withContracts) continue;
    for (const [key, suffix] of [['insCode_C', 'C'], ['insCode_P', 'P']]) {
      const ins = String(row?.[key] ?? '').trim();
      if (!ins || !want.has(ins)) continue;
      // تابلو برای قرارداد مدرکِ معامله دارد؛ بی‌معامله را نمی‌پرسیم
      if (n(row[`qTotTran5J_${suffix}`]) > 0 || n(row[`zTotTran_${suffix}`]) > 0) out.add(ins);
    }
  }
  return [...out];
}

/** قیمت‌های یک سمتِ ردیف تابلو — بی هیچ قضاوتی دربارهٔ معامله‌شدن. */
function boardPrices(row, suffix) {
  return {
    last: price(row[`pDrCotVal_${suffix}`]),
    close: price(row[`pClosing_${suffix}`]),
    yday: n(row[`priceYesterday_${suffix}`]),
  };
}

/**
 * یک ابزار از یک ردیف دیده‌بان. `null` یعنی امروز معامله نشده یا عددی
 * برای گفتن ندارد — و آن هم ردیف نمی‌گیرد.
 *
 * برای نماد پایه همیشه `null` می‌دهد و این عمدی است: تابلو حجم و تعداد
 * معاملهٔ پایه را نمی‌فرستد، پس هیچ مدرکی برای «امروز معامله شد» ندارد.
 * ردیفِ پایه از نوار می‌آید یا اصلاً نمی‌آید.
 */
function boardRow(row, suffix, date) {
  const vol = n(row[`qTotTran5J_${suffix}`]);
  const trades = n(row[`zTotTran_${suffix}`]);
  // نه حجمی، نه معامله‌ای: تابلو فقط قیمت دیروز را حمل می‌کند
  if (!(vol > 0) && !(trades > 0)) return null;
  const { last, close, yday } = boardPrices(row, suffix);
  if (!(last > 0) && !(close > 0)) return null;
  return {
    date, close, last, yday,
    // این سه را تابلو نمی‌دهد؛ صفر می‌مانند تا «فاقد داده» خوانده شوند
    first: 0, low: 0, high: 0,
    vol, trades, value: n(row[`qTotCap_${suffix}`]),
    live: true, liveSource: 'board',
  };
}

/**
 * یک ابزار از خلاصهٔ نوار معامله‌اش.
 *
 * `null` یعنی امروز هیچ معاملهٔ فعالی ثبت نشده. این همان مدرکی است که
 * تابلو برای نماد پایه ندارد — و اینجا واقعی است، نه استنتاجی.
 *
 * `board` قیمت‌های همان ابزار روی تابلو است، اگر باشد. فقط دو چیز از آن
 * می‌آید: «قیمت پایانی» که خودِ تابلو محاسبه می‌کند و نوار نمی‌دهد، و
 * «پایانی دیروز». هیچ‌کدام با عددِ نوار پر نمی‌شوند: پایانیِ ساختگی از
 * آخرین معامله، همان جعلی است که قاعدهٔ ۲-۴ منع می‌کند.
 */
function tapeRow(summary, date, board = null) {
  const trades = n(summary?.count), vol = n(summary?.volume);
  if (!(trades > 0) && !(vol > 0)) return null;
  const last = price(summary?.lastPrice);
  if (!(last > 0)) return null;
  return {
    date,
    close: price(board?.close),
    last,
    yday: n(board?.yday),
    // ریزمعامله این سه را **واقعاً** دارد؛ اینجا حدس نیست
    first: price(summary?.firstPrice), low: price(summary?.low), high: price(summary?.high),
    vol, trades, value: n(summary?.value),
    live: true, liveSource: 'tape',
  };
}

/**
 * ردیف امروزِ هر ابزاری که واقعاً معامله شده.
 *
 * کلید، همان کد ابزاری است که `buildChain` هم با آن کار می‌کند، پس خروجی
 * مستقیماً روی `seriesByIns` می‌نشیند.
 *
 * `tapeByIns` نگاشتِ کد ابزار به خلاصهٔ نوار است. هرجا باشد مقدم است،
 * چون «اولین/کمترین/بیشترین» دارد؛ هرجا نباشد یا خالی باشد، تابلو جایش
 * را می‌گیرد. برای نماد پایه، نبودنش یعنی ردیفی ساخته نمی‌شود.
 */
export function liveDayRows(rows = [], { date, tapeByIns = null } = {}) {
  const day = normalizeHistoryDate(date);
  const out = {};
  if (!day) return out;
  for (const row of rows || []) {
    for (const [key, suffix] of [['uaInsCode', 'UA'], ['insCode_C', 'C'], ['insCode_P', 'P']]) {
      const ins = String(row?.[key] ?? '').trim();
      if (!ins || out[ins]) continue;
      const summary = tapeByIns ? tapeByIns[ins] : null;
      // نوار مقدم است، تابلو جایگزینِ نبودنش — نه برعکس
      const built = (summary ? tapeRow(summary, day, boardPrices(row, suffix)) : null)
        || boardRow(row, suffix, day);
      if (built) out[ins] = built;
    }
  }
  return out;
}

/**
 * سری‌های روزانه به‌علاوهٔ ردیف امروز.
 *
 * ورودی دست نمی‌خورد. اگر فهرست روزانه خودش ردیف امروز را داشته باشد،
 * ردیف تازه رویش می‌نشیند ولی «اولین/کمترین/بیشترین» آن حفظ می‌شود: ردیفِ
 * لحظه‌ای ممکن است این سه را نداشته باشد و دور ریختنشان اطلاعات کم
 * می‌کند، نه اضافه.
 *
 * فقط ابزارهایی که فراخوان خودش خواسته (کلیدهای `seriesByIns`) به‌روز
 * می‌شوند؛ عکس تابلو کل بازار است و ما بقیه را وارد این تحلیل نمی‌کنیم.
 */
export function mergeLiveDay(seriesByIns = {}, liveByIns = {}, { date } = {}) {
  const day = normalizeHistoryDate(date);
  const series = {};
  let added = 0, updated = 0, untouched = 0, partial = 0;
  for (const [ins, rows] of Object.entries(seriesByIns || {})) {
    const live = day ? liveByIns?.[ins] : null;
    if (!live) { series[ins] = rows; untouched += 1; continue; }
    const list = rows || [];
    const official = list.find((row) => normalizeHistoryDate(row.date) === day) || null;
    if (official) updated += 1; else added += 1;
    const keep = (fresh, old) => (fresh > 0 ? fresh : n(old));
    const merged = {
      ...(official || {}), ...live,
      close: keep(live.close, official?.close),
      first: keep(live.first, official?.first),
      low: keep(live.low, official?.low),
      high: keep(live.high, official?.high),
    };
    // ردیفی که «اولین/کمترین/بیشترین» ندارد، ناقص است — نه خراب. شمرده
    // می‌شود تا رابط بتواند بگوید چرا مبناهای دیگر روز جاری را پیشنهاد
    // نمی‌کنند، به‌جای اینکه آن روز بی‌توضیح از تقویم غیب شود.
    if (!(merged.first > 0) || !(merged.low > 0) || !(merged.high > 0)) partial += 1;
    series[ins] = [...list.filter((row) => normalizeHistoryDate(row.date) !== day), merged]
      .sort((a, b) => normalizeHistoryDate(a.date) - normalizeHistoryDate(b.date));
  }
  return { series, added, updated, untouched, partial, date: day };
}
