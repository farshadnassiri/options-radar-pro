// دادهٔ رصدِ تاریخیِ تبِ استراتژی — همان جدول، تاریخِ دیگر.
//
// ═══ چرا ماژول جدا ═══
//
// `ui/tabs/strategy.mjs` رابط است و باید خوانا بماند. اینجا فقط
// «چه درخواستی، به چه ترتیبی» است — و همین‌جا ماندنش یعنی تبِ استراتژی
// و هر مصرف‌کنندهٔ بعدی یک مسیر دارند، نه دو.
//
// ═══ آنچه اینجا نیست ═══
//
// هیچ محاسبه‌ای. زنجیره را `core/history-chain.mjs` می‌سازد و ردیف‌ها را
// همان `core/scan.mjs` که رصدِ زنده با آن کار می‌کند. اگر اینجا هم
// محاسبه‌ای بود، «بازده ماهانه»ی امروز و دیروز دو عدد از دو مسیر می‌شدند.

// وارداتِ نسبی، نه مطلق: این ماژول باید در نود هم بار شود تا رفتارش
// آزمون داشته باشد — همان قاعده‌ای که `ui/radar-columns.mjs` و
// `ui/table.mjs` دارند و ماژول‌های `ui/tabs/` ندارند.
import { scan } from '../core/scan.mjs';
import { buildHistoryChain, historyBasis, historyChainNote } from '../core/history-chain.mjs';
import { todayCompact } from '../core/history-range.mjs';
import { liveDaySnapshot } from './live-scope.mjs';
import { fetchDailies } from './daily-intake.mjs';

/** درخواستِ کدها، تکه‌تکه — `/api/dailies` سقف ۲۰۰ کد دارد. */
const CHUNK = 100;

/**
 * `fetcher` تزریق‌شدنی است، نه `fetch` سراسری.
 *
 * همان الگوی `ui/live-scope.mjs`: بی این، ترتیبِ درخواست‌ها و قاعدهٔ
 * «مبنای تاریخی همیشه مرجع است» فقط با مرورگر و تابلوی باز سنجیده
 * می‌شد — یعنی عملاً هیچ‌وقت.
 */
const asJson = async (url, fetcher) => {
  const response = await (fetcher || fetch)(url, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || payload?.error) throw new Error(payload?.error || `پاسخ ${response.status}`);
  return payload;
};

/**
 * روزهایی که این نماد پایه **واقعاً داده دارد**.
 *
 * تقویمِ کامل نمی‌دهیم: روزی که سری روزانهٔ نماد ندارد، انتخابش کاربر را
 * به جدولِ خالی می‌برد بی آنکه بداند چرا. فهرستِ کوتاه‌ترِ راست، بهتر از
 * فهرستِ بلندِ امیدوارکننده است.
 */
export async function historyDates(uaIns, count = 180, { fetcher, includeToday = true } = {}) {
  const payload = await asJson(`/api/daily?ins=${encodeURIComponent(uaIns)}&n=${count}`, fetcher);
  const dates = new Set((payload.rows || [])
    .filter((row) => Number(row?.close) > 0 || Number(row?.last) > 0)
    .map((row) => Number(row.date))
    .filter((date) => Number.isFinite(date) && date > 0));
  // ── روزِ جاری، از منبع دوم ───────────────────────────────────────
  //
  // دفتر روزانهٔ بالادست ردیفِ امروز را تا پایانِ همان روز منتشر نمی‌کند،
  // پس این فهرست تا شب یک روز عقب است. عکس تابلو به‌علاوهٔ نوار معامله
  // همان روز را دارند — و فقط وقتی اضافه می‌شود که نماد **واقعاً** امروز
  // معامله شده باشد، نه صرفاً چون تقویم می‌گوید امروز روزِ کاری است.
  if (includeToday) {
    const snap = await liveDaySnapshot({ wanted: [String(uaIns)], fetcher: fetcher || fetch });
    if (snap.ok && snap.rows[String(uaIns)]) dates.add(snap.date);
  }
  return [...dates].sort((a, b) => a - b);
}

/**
 * سری‌های روزانهٔ چند ابزار، در چند تکه — به‌علاوهٔ ردیف امروز.
 *
 * `includeToday` وقتی خاموش می‌شود که فراخوان تاریخِ گذشته می‌خواهد: آن
 * روز در دفتر روزانه هست و دو درخواستِ لحظه‌ای چیزی به آن اضافه نمی‌کنند.
 *
 * ═══ `onVerdicts` چرا هست ═══
 *
 * شکلِ بازگشتی همان نقشهٔ ابزار→سری می‌ماند، چون `buildHistoryChain` همان
 * را می‌خواهد. ولی «کدام ابزار اصلاً تابلو نگرفت» در آن نقشه دیده نمی‌شود
 * — سری خالی و سریِ نیامده یک شکل‌اند. این فراخوان همان را جدا می‌دهد،
 * بی آنکه کسی مجبور باشد کلیدِ اضافه در نقشه تحمل کند.
 */
export async function dailiesFor(codes = [], { fetcher, includeToday = true, onVerdicts } = {}) {
  const list = [...new Set(codes.map((code) => String(code || '')).filter(Boolean))];
  const out = {};
  const verdicts = {};
  for (let at = 0; at < list.length; at += CHUNK) {
    const part = list.slice(at, at + CHUNK);
    // از دروازه، نه خام: `Object.assign(out, payload)` کلیدِ خلاصهٔ پاسخ را
    // هم یک «ابزار» می‌کرد و زنجیره‌ساز رویش می‌افتاد.
    const got = await fetchDailies(part, { fetcher: fetcher || fetch });
    Object.assign(out, got.byIns);
    Object.assign(verdicts, got.verdicts);
  }
  if (typeof onVerdicts === 'function') onVerdicts(verdicts);
  if (!includeToday) return out;
  const snap = await liveDaySnapshot({ wanted: list, fetcher: fetcher || fetch });
  if (!snap.ok) return out;
  for (const ins of list) {
    const live = snap.rows[ins];
    if (!live) continue;
    const rows = Array.isArray(out[ins]?.rows) ? out[ins].rows : [];
    out[ins] = {
      ...(out[ins] || {}),
      rows: [...rows.filter((row) => Number(row?.date) !== snap.date), live]
        .sort((a, b) => Number(a.date) - Number(b.date)),
    };
  }
  return out;
}

/**
 * جدولِ یک روزِ گذشته برای یک استراتژی و یک نماد پایه.
 *
 * ═══ چرا `showUnexecutable` اجباری روشن است ═══
 *
 * دفترِ سفارشِ گذشته وجود ندارد، پس هر مبنای تاریخی «مرجع» است و هیچ
 * ردیفی «قابل اجرا» شمرده نمی‌شود. با تنظیمِ پیش‌فرضِ کاربر، `scan` همهٔ
 * ردیف‌ها را در سطلِ «مبنای قیمت مرجع» می‌ریخت و جدول همیشه خالی بود —
 * که خواننده آن را «آن روز چیزی نبود» می‌خواند، در حالی که مسئله ابزار
 * است نه بازار. پس اینجا روشن می‌شود و جملهٔ صداقت همان را می‌گوید.
 */
export async function runHistoryScan({ def, uaIns, date, basis = 'CLOSE', settings, qty = 1, fetcher } = {}) {
  const key = String(uaIns || '');
  if (!key) throw new Error('نماد پایه انتخاب نشده');
  if (!(Number(date) > 0)) throw new Error('تاریخ انتخاب نشده');

  const universe = await asJson(`/api/history/universe?date=${Number(date)}`, fetcher);
  const all = Array.isArray(universe.rows) ? universe.rows : [];
  const rows = all.filter((row) => String(row?.uaInsCode ?? '') === key);
  if (!rows.length) {
    return {
      rows: [], funnel: null, built: null, universeNote: universe.note || '',
      note: 'برای این نماد در این تاریخ هیچ قراردادی ثبت نشده.',
      asOf: universe.asOf ?? null, archived: universe.archived === true,
    };
  }

  const codes = [key];
  for (const row of rows) {
    if (row.insCode_C) codes.push(row.insCode_C);
    if (row.insCode_P) codes.push(row.insCode_P);
  }
  // روزِ گذشته دو درخواستِ لحظه‌ای لازم ندارد؛ دفتر روزانه خودش داردش.
  let dailyVerdicts = {};
  const dailies = await dailiesFor(codes, {
    fetcher,
    includeToday: Number(date) >= todayCompact(),
    onVerdicts: (v) => { dailyVerdicts = v; },
  });
  const built = buildHistoryChain(rows, dailies, date);
  const used = historyBasis(basis);
  const result = scan({
    def,
    chain: built.chain,
    uaKeys: [key],
    settings: { ...settings, priceBasis: used, showUnexecutable: true },
    qty,
  });
  for (const row of result.rows) {
    row.historyDate = Number(date);
    row.historyBasis = used;
  }
  return {
    ...result, built, basis: used,
    note: historyChainNote(built, used),
    // ناقص‌بودنِ جدول یک پرچمِ صریح است، نه چیزی که مصرف‌کننده از دلِ
    // `built` دربیاورد: «آن روز معامله نشد» تمام است، «نگرفتیم» با اسکنِ
    // دوباره درست می‌شود، و رابط باید بتواند این دو را جدا نشان بدهد.
    incomplete: (built.legsFailed || 0) + (built.basesFailed || 0) > 0,
    failedCount: (built.legsFailed || 0) + (built.basesFailed || 0),
    // و جدا از آن: چند ابزار اصلاً تابلویی نگرفتند. این با «آن روز معامله
    // نشد» یکی نیست و درمانش هم یکی نیست — اولی اسکنِ دوباره می‌خواهد.
    unreferenced: Object.values(dailyVerdicts).filter((v) => v.state !== 'rows').length,
    universeNote: universe.note || '',
    asOf: universe.asOf ?? null,
    archived: universe.archived === true,
  };
}

/**
 * نوارِ معاملهٔ امروزِ چند ابزار — برای ردِ جلسهٔ یک ترکیب.
 *
 * سقفِ `/api/live-trades` بیست‌وچهار کد است و همین سقف، همان مرزی است که
 * این قابلیت را «یک ترکیب» نگه می‌دارد نه «کلِ جدول»: چهار پا به‌علاوهٔ
 * نماد پایه، یک درخواست. برای چند ده ترکیب، صد و اندی درخواست می‌شد.
 */
export async function liveTapeFor(codes = [], { fetcher } = {}) {
  const list = [...new Set(codes.map((code) => String(code || '')).filter(Boolean))].slice(0, 24);
  if (!list.length) return { at: 0, tape: {}, errors: {}, market: null };
  const payload = await asJson(`/api/live-trades?ins=${list.join(',')}`, fetcher);
  const tape = {};
  const errors = {};
  for (const [ins, box] of Object.entries(payload.items || {})) {
    tape[ins] = Array.isArray(box?.rows) ? box.rows : [];
    if (box?.error) errors[ins] = box.error;
  }
  // وضعیت بازار همراه می‌آید تا «هنوز جلسه‌ای نبوده» با «این پا معامله
  // نشده» اشتباه نشود — دو جملهٔ کاملاً متفاوت با یک ظاهر.
  return { at: payload.at ?? 0, tape, errors, market: payload.market || null };
}
