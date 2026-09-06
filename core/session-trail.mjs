// ردِ جلسه — یک ترکیب، از بازگشایی تا همین لحظه.
//
// ═══ خواستهٔ صاحب پروژه (بندِ ۱۰) ═══
//
// «این امکان وجود داشته باشه که با انتخاب یک ترکیب خاص قابلیت رصد اون
// ترکیب از لحظه شروع بازار تا الان وجود داشته باشه.»
//
// ═══ چرا یک ترکیب، و چرا این شدنی است ═══
//
// ریزمعاملهٔ هر ابزار یک درخواست است. برای کلِ جدول — چند ده ترکیب و صد
// و اندی قرارداد — این می‌شود صد و اندی درخواست در هر نوسازی، که همان
// چیزی است که `core/intraday-grid.mjs` سال‌هاست دربارهٔ محدودیتش هشدار
// می‌دهد. برای **یک** ترکیب، دو تا چهار پا به‌علاوهٔ نماد پایه است: پنج
// درخواست، یک بار.
//
// ═══ چرا `replayIntraday` این کار را نمی‌کند ═══
//
// `core/backtest.mjs` هم مسیرِ درون‌روزیِ یک ترکیب را می‌سازد، ولی جوابِ
// سؤالِ دیگری است: «اگر در فلان قیمت وارد شده بودم، سود و زیانم در طول
// روز چه می‌شد» — و برای همین `replay.priced` با قیمتِ **ورود** لازم
// دارد. ترکیبی که هنوز واردش نشده‌ای قیمتِ ورود ندارد.
//
// سؤالِ اینجا این است: «بهای بازکردنِ همین ترکیب، امروز از بازگشایی تا
// حالا چه بوده.» پس نقطه‌ها روی شبکهٔ ثابتِ دانه‌بندی می‌نشینند نه روی هر
// معامله، و عدد «نقد خالصِ ورود» است نه سود و زیان. ریاضی‌اش هم تکرار
// نمی‌شود: همان `grossCash` و `entryFees` و `markAt` که بقیهٔ برنامه از
// آن‌ها استفاده می‌کند.
//
// ═══ ناهم‌زمانی، پنهان نمی‌شود ═══
//
// دو پا در یک ثانیه معامله نمی‌شوند. «قیمت ترکیب در ساعت ده و نیم» یعنی
// آخرین معاملهٔ هر پا **تا** ده و نیم — که می‌تواند برای یکی ده و بیست و
// نه باشد و برای دیگری نه و پنج. این عدد غلط نیست، ولی ادعای اجرا هم
// ندارد. پس هر نقطه سنِ کهنه‌ترین پایش را با خودش حمل می‌کند و مصرف‌کننده
// می‌تواند نقطه‌های کهنه را جدا نشان بدهد. پایی که تا آن لحظه **هرگز**
// معامله نشده، نقطه را اصلاً نمی‌سازد — جای عدد، شکافِ نمودار است.

import { num } from './num.mjs';
import { grossCash, entryFees } from './payoff.mjs';
import { markAt } from './intraday-mark.mjs';
import { momentLabel, momentsFor, normalizeGrain } from './intraday-grid.mjs';

const NO_FEES = { buyStock: 0, sellStock: 0, option: 0 };

/**
 * قیمت‌های یک ترکیب در یک لحظه، از نوارِ معاملهٔ هر پا.
 *
 * پای «سهم پایه» هم مثل بقیه از نوارِ خودش قیمت می‌گیرد. اگر کد ابزارِ
 * پایه داده نشده باشد، آن پا بی‌قیمت می‌ماند و همین نقطه را ناقص
 * می‌کند — چون ترکیبی که یک پایش عدد ندارد، عدد ندارد.
 */
export function trailPoint(legs = [], tapeByIns = {}, second, { fees = NO_FEES, uaIns = '' } = {}) {
  const cut = num(second, NaN);
  if (!Number.isFinite(cut)) return null;
  const priced = [];
  const perLeg = [];
  let complete = true;
  let maxAge = 0;
  let newest = -Infinity;
  for (const leg of legs) {
    const ins = String(leg?.ins || (leg?.kind === 'underlying' ? uaIns : '') || '');
    const mark = ins ? markAt(tapeByIns[ins] || [], cut) : null;
    if (!mark) {
      complete = false;
      perLeg.push({ ins, name: leg?.name || '', price: NaN, second: NaN, ageSec: NaN });
      continue;
    }
    const age = Math.max(0, cut - mark.second);
    maxAge = Math.max(maxAge, age);
    newest = Math.max(newest, mark.second);
    perLeg.push({ ins, name: leg?.name || '', price: mark.price, second: mark.second, ageSec: age });
    priced.push({ ...leg, price: mark.price });
  }
  if (!complete) {
    return { second: cut, label: momentLabel(cut), legs: perLeg, complete: false, grossCash: NaN, netCash: NaN, maxAgeSec: NaN, spanSec: NaN };
  }
  const gross = grossCash(priced);
  // «پهنای ناهم‌زمانی» — فاصلهٔ کهنه‌ترین تا تازه‌ترین معاملهٔ پاها در همین
  // نقطه. سنِ کهنه‌ترین نسبت به **لحظه** را `maxAgeSec` می‌گوید؛ این یکی
  // می‌گوید خودِ پاها چقدر از هم دورند، که همان چیزی است که «این عدد را
  // می‌شد اجرا کرد؟» به آن بستگی دارد.
  const oldest = Math.min(...perLeg.map((leg) => leg.second));
  return {
    second: cut, label: momentLabel(cut), legs: perLeg, complete: true,
    grossCash: gross, netCash: gross - entryFees(priced, fees),
    maxAgeSec: maxAge, spanSec: Math.max(0, newest - oldest),
  };
}

/**
 * ردِ کاملِ جلسه با دانه‌بندی خواسته‌شده.
 *
 * `until` سقفِ زمان است: نقطه‌های بعد از «همین لحظه» ساخته نمی‌شوند، چون
 * ستونی که هنوز نرسیده، ستونِ خالی است نه ستونِ بی‌معامله. بی این، نمودارِ
 * ساعت یازده تا انتهای جلسه یک خطِ صافِ دروغین می‌شد.
 */
export function sessionTrail({
  legs = [], tapeByIns = {}, grain = 'm30', fees = NO_FEES, uaIns = '', until = Infinity,
} = {}) {
  const id = normalizeGrain(grain === 'day' ? 'm30' : grain);
  const cap = num(until, Infinity);
  const moments = momentsFor(id).filter((second) => second <= cap);
  const points = moments.map((second) => trailPoint(legs, tapeByIns, second, { fees, uaIns }));
  const full = points.filter((point) => point.complete);
  const values = full.map((point) => point.netCash).filter(Number.isFinite);
  const legIns = legs.map((leg) => String(leg?.ins || (leg?.kind === 'underlying' ? uaIns : '') || '')).filter(Boolean);
  const silent = legIns.filter((ins) => !markAt(tapeByIns[ins] || [], cap === Infinity ? 1e9 : cap));
  return {
    grain: id, points, moments: moments.length,
    complete: full.length, gaps: points.length - full.length,
    first: full[0] || null, last: full.at(-1) || null,
    min: values.length ? Math.min(...values) : NaN,
    max: values.length ? Math.max(...values) : NaN,
    change: full.length >= 2 ? full.at(-1).netCash - full[0].netCash : NaN,
    silentLegs: silent,
  };
}

/** جملهٔ صداقت — چه چیزی این نمودار را ساخت و چه چیزی نساخت. */
export function trailNote(trail) {
  const fa = (value) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (!trail || !trail.points.length) return 'هنوز لحظه‌ای برای این جلسه نیست.';
  if (!trail.complete) {
    return trail.silentLegs.length
      ? `${fa(trail.silentLegs.length)} پا امروز هیچ معامله‌ای نداشته، پس ترکیب در هیچ لحظه‌ای عدد کامل ندارد.`
      : 'در هیچ لحظه‌ای همهٔ پاها با هم قیمت نداشتند.';
  }
  const parts = [`${fa(trail.complete)} لحظه از ${fa(trail.moments)} عددِ کامل دارد`];
  if (trail.gaps) parts.push(`${fa(trail.gaps)} لحظه شکاف است چون دست‌کم یک پا تا آن ساعت معامله نشده بود`);
  return `${parts.join(' · ')}. پاها هم‌زمان معامله نمی‌شوند، پس هر نقطه از آخرین معاملهٔ هر پا تا آن لحظه ساخته شده — عدد مرجع است، نه قیمتی که می‌شد همان لحظه اجرا کرد.`;
}
