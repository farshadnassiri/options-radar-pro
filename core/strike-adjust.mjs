// تعدیل قیمت اعمال پس از سود نقدی و افزایش سرمایه — برای روزهای پیش از تعدیل.
//
// ═══ مسئله ═══
//
// پس از مجمع، بورس قیمت اعمال قراردادهای باز را تعدیل می‌کند: سود نقدی از
// قیمت اعمال کم می‌شود و افزایش سرمایه آن را به نسبت قیمت مرجع کوچک می‌کند.
// برنامه برای هر قرارداد یک قیمت اعمال دارد (از نام قرارداد در دفتر، یا از
// تابلو برای قراردادهای زنده) که معمولاً همان مقدارِ **پس از** تعدیل است. پس
// برای روزهای پیش از تعدیل، قیمت قرارداد که با اعمالِ قدیم معامله شده با
// اعمالِ تازه سنجیده می‌شد: کالِ نزدیک پول زیر ارزش ذاتی می‌افتاد و نوسانش
// حل نمی‌شد (روز خالی)، و پوت بیش از واقع درمی‌آمد. پرسش صاحب پروژه دربارهٔ
// فزر همین را نشان داد: اعمال‌های ۷۰٬۷۵۰، ۸۵٬۷۵۰، ۹۰٬۷۵۰، ۱۱۰٬۷۵۰، ۱۳۰٬۷۵۰ و
// ۱۴۰٬۷۵۰ همه دقیقاً ۴٬۲۵۰ کمتر از یک عدد گردند.
//
// ═══ راه ═══
//
// ۱  رویداد: سری روزانهٔ پایه برای هر روز قیمت مرجع (`yday`، همان
//    `priceYesterday`) دارد. روزهای عادی برابر پایانی روز قبل است؛ روزی که
//    کمتر است، روز تعدیل است: `before` پایانی روز قبل، `after` قیمت مرجع.
//    سود نقدی `before − after` و نسبت افزایش سرمایه `after ÷ before`.
//    درخواست تازه‌ای به بالادست نمی‌رود.
// ۲  هر قرارداد جدا: آیا اعمالِ ذخیره‌شده‌اش تعدیل‌شده است و کدام تعدیل؟
//    قیمت اعمالِ عرضهٔ بورس گرد است و تعدیل گردی‌اش را می‌برد. سه فرض
//    سنجیده می‌شود — «همین است»، «به‌اضافهٔ سود نقدی»، «تقسیم بر نسبت» — و
//    گردترین، اگر روشن جلوتر باشد، برنده است. اعمالی که روشن نمی‌گوید، رأی
//    اکثریتِ قراردادهای همان رویداد را می‌گیرد که پیش از آن قیمت داشتند؛
//    بی اکثریت، دست نمی‌خورد.
// ۳  برای روز `d` و هر رویدادِ `d < E < سررسید`، از تازه‌ترین به کهنه‌ترین،
//    اعمال برگردانده می‌شود.
//
// قراردادی که پس از رویداد عرضه شده پیش از آن قیمتی ندارد، پس برگرداندنِ
// اعمالش هیچ روزی را عوض نمی‌کند. سری پایه (`close`) خودش تعدیل‌نشده است،
// پس با اعمالِ پیش از تعدیل هم‌خوان است.

import { normalizeHistoryDate } from './history.mjs';

export const STRIKE_ADJUST_VERSION = 1;
export const ADJUST_KINDS = {
  dividend: 'سود نقدی',
  capital: 'افزایش سرمایه',
  none: 'اعمال ذخیره‌شده پیش از تعدیل است',
};

const finite = (value) => {
  const out = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(out) ? NaN : out;
};

/**
 * روزهای تعدیل از سری روزانهٔ پایه.
 *
 * `minPct`: کمترین فاصلهٔ قیمت مرجع از پایانی دیروز (درصد) که تعدیل شمرده
 * شود — گرد کردنِ بالادست چند ریال است. فقط کاهش: سود نقدی و افزایش
 * سرمایه قیمت مرجع را پایین می‌آورند؛ افزایشِ مرجع دادهٔ ناجور است نه تعدیل.
 */
export function baseAdjustments(baseRows = [], { minPct = 0.05 } = {}) {
  const rows = (baseRows || [])
    .map((row) => ({ date: normalizeHistoryDate(row?.date), close: finite(row?.close), yday: finite(row?.yday) }))
    .filter((row) => row.date)
    .sort((a, b) => a.date - b.date);
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const before = rows[i - 1].close, after = rows[i].yday;
    if (!(before > 0) || !(after > 0) || !(after < before)) continue;
    const drop = before - after;
    if (drop < 1 || (drop / before) * 100 < minPct || after / before < 0.2) continue;
    out.push({ date: rows[i].date, before, after, drop, ratio: after / before });
  }
  return out;
}

// ═══ گردی قیمت اعمال ═══

const NICE = [1, 2, 2.5, 5];
/**
 * گردی یک عدد: لگاریتمِ بزرگ‌ترین مقسومِ «گرد» (۱، ۲، ۲٫۵ یا ۵ × ۱۰ⁿ) که عدد
 * مضربش باشد. ۷۵٬۰۰۰ → ۴٫۴ (مضرب ۲۵٬۰۰۰)، ۷۰٬۷۵۰ → ۲٫۴ (مضرب ۲۵۰).
 *
 * `tolerance` (نسبی) فقط برای فرض افزایش سرمایه: تعدیل نسبی گرد می‌شود و
 * برگرداندنش دقیقاً عدد قدیم را نمی‌دهد. «همین است» و «به‌اضافهٔ سود نقدی»
 * عدد صحیح دقیق‌اند و رواداری نمی‌گیرند — وگرنه ۱۰۰٬۲۵۰ «تقریباً ۱۰۰٬۰۰۰»
 * و گرد شمرده می‌شد. خروجی: `{ score, value }` (مقدارِ گردشده).
 */
export function roundness(value, tolerance = 0) {
  const x = finite(value);
  if (!(x > 0)) return { score: -Infinity, value: NaN };
  const tol = Math.max(0.5, x * tolerance);
  for (let k = Math.floor(Math.log10(x)); k >= 0; k -= 1) {
    for (const m of [...NICE].reverse()) {
      const d = m * 10 ** k;
      if (d > x) continue;
      const snapped = Math.round(x / d) * d;
      if (Math.abs(snapped - x) <= tol) return { score: Math.log10(d), value: snapped };
    }
  }
  return { score: 0, value: Math.round(x) };
}

/** فاصلهٔ لازم بین دو فرض تا یکی «روشن» برنده باشد. */
const MARGIN = 0.5;

function decide(strike, event) {
  const none = roundness(strike);
  const div = roundness(strike + event.drop);
  const cap = roundness(strike / event.ratio, 0.0005);
  const best = div.score > cap.score || (div.score === cap.score && event.ratio >= 0.8)
    ? { kind: 'dividend', ...div } : { kind: 'capital', ...cap };
  if (best.score - none.score >= MARGIN) return { kind: best.kind, strike: best.value, sure: true };
  if (none.score - best.score >= MARGIN) return { kind: 'none', strike, sure: true };
  return { kind: '', strike, sure: false, div: div.value, cap: cap.value };
}

/**
 * طرح تعدیل برای یک بازه.
 *
 * `contracts`: `[{ ins, strike, expiry }]`؛ `panels`: نقشهٔ روز → `{ ins: … }`
 * (فقط برای اینکه بدانیم قرارداد پیش از رویداد قیمت داشت)؛ `events`: خروجی
 * `baseAdjustments`. خروجی: `{ events, byIns }` — هر رویداد با شمار قراردادهای
 * برگردانده‌شده، دست‌نخورده و نامطمئن، و برای هر قرارداد فهرست
 * `{ date, strike, kind }` (قیمت اعمالِ روزهای پیش از `date`، تازه‌ترین اول).
 */
export function strikeAdjustPlan({ contracts = [], panels = {}, events = [] } = {}) {
  const evs = [...(events || [])].sort((a, b) => b.date - a.date);
  const dates = Object.keys(panels || {}).map(normalizeHistoryDate).filter(Boolean).sort((a, b) => a - b);
  const pricedBefore = (ins, E) => dates.some((d) => d < E && panels[d]?.[ins]);
  const byIns = {};
  const summary = evs.map((e) => ({ ...e, adjusted: 0, kept: 0, unsure: 0, type: '', typeGuessed: false }));
  // نخست تصمیم‌های روشن، سپس اکثریتِ هر رویداد برای نامطمئن‌ها. رویدادها از
  // تازه به کهنه، چون اعمالِ پیش از رویداد کهنه‌تر از اعمالِ پس از تازه‌تر
  // ساخته می‌شود.
  const state = new Map((contracts || []).map((c) => [String(c.ins), { c, strike: finite(c.strike), segs: [] }]));
  evs.forEach((event, i) => {
    const pending = [];
    const votes = { dividend: 0, capital: 0, none: 0 };
    for (const [ins, st] of state) {
      const expiry = normalizeHistoryDate(st.c.expiry);
      if (!(st.strike > 0) || !(expiry > event.date)) continue;
      const evidence = pricedBefore(ins, event.date);
      const d = decide(st.strike, event);
      if (d.sure && evidence) votes[d.kind] += 1;
      pending.push({ ins, st, d, evidence });
    }
    const majority = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    const fallback = majority[1] > 0 ? majority[0] : 'none';
    const adjustedKinds = { dividend: 0, capital: 0 };
    for (const { ins, st, d, evidence } of pending) {
      const kind = d.sure ? d.kind : fallback;
      if (!d.sure && evidence) summary[i].unsure += 1;
      if (kind === 'none') { if (evidence) summary[i].kept += 1; continue; }
      const strike = d.sure ? d.strike : kind === 'dividend' ? d.div : d.cap;
      if (!(strike > 0) || strike === st.strike) continue;
      if (evidence) { summary[i].adjusted += 1; adjustedKinds[kind] += 1; }
      st.segs.push({ date: event.date, strike, kind });
      st.strike = strike;
      byIns[ins] = st.segs;
    }
    // نوع رویداد از قراردادهای برگردانده‌شده؛ بی آن، از اندازهٔ افت (حدس).
    const seen = Object.entries(adjustedKinds).sort((a, b) => b[1] - a[1])[0];
    summary[i].type = seen[1] > 0 ? seen[0] : event.ratio >= 0.8 ? 'dividend' : 'capital';
    summary[i].typeGuessed = !(seen[1] > 0);
  });
  return { version: STRIKE_ADJUST_VERSION, events: summary.sort((a, b) => a.date - b.date), byIns };
}

/** قیمت اعمال قرارداد در روز `date` بر پایهٔ طرح. */
export function strikeOn(plan, contract, date) {
  const base = finite(contract?.strike);
  const segs = plan?.byIns?.[String(contract?.ins)];
  if (!segs?.length) return base;
  const d = normalizeHistoryDate(date);
  let k = base;
  for (const seg of segs) { if (d < seg.date) k = seg.strike; else break; }
  return k;
}

/** همان، به شکل تابع برای `panelObservations` و `contractDailySeries`. */
export const strikeResolver = (plan) => (plan?.byIns && Object.keys(plan.byIns).length
  ? (contract, date) => strikeOn(plan, contract, date) : null);

/**
 * روز فرم انتقالِ بازسازی‌شده (`trades`/`book`) با اعمالِ همان روز.
 * روزِ ضبط زنده اعمال تابلوی همان روز را دارد و دست نمی‌خورد.
 */
export function adjustTransportDay(day, plan) {
  if (!day || !(day.source === 'trades' || day.source === 'book') || !plan?.byIns) return day;
  let changed = false;
  const contracts = {};
  for (const [ins, meta] of Object.entries(day.contracts || {})) {
    const k = strikeOn(plan, { ins, strike: meta[1] }, day.date);
    if (k !== meta[1]) changed = true;
    contracts[ins] = k !== meta[1] ? [meta[0], k, meta[2]] : meta;
  }
  return changed ? { ...day, contracts } : day;
}
