// موتور پیشنهاد — از نظر کاربر تا فهرست رتبه‌بندی‌شده.
//
// ورودی این ماژول یک **نظر** است، نه یک سیگنال. کاربر می‌گوید کجا فکر
// می‌کند بازار می‌رود، چقدر مطمئن است، و در چه افقی؛ و موتور می‌گوید با
// آن نظر، کدام ساختار بیشترین ارزش را دارد.
//
// ═══ چرا توزیع، و چرا قابل ویرایش ═══
//
// نظر کاربر یک عدد نیست، یک بازه است. «صعودی، هشت درصد، نسبتاً مطمئن»
// یعنی توزیعی حول هشت درصد بالاتر، با پراکندگی‌ای که از درجهٔ اطمینان
// می‌آید. تبدیل این جمله به یک عدد واحد، همان چیزی است که هر ساختار
// نامتقارنی را غلط ارزیابی می‌کند.
//
// توزیع باید دیده و ویرایش شود. اگر کاربر نموداری ببیند که با شهودش
// نمی‌خواند و نتواند عوضش کند، رتبه‌بندیِ رویش هم برایش بی‌معنی است — و
// بدتر، فکر می‌کند موتور چیزی می‌داند که او نمی‌داند.
//
// ═══ چرا گره‌های هم‌احتمال و نه انتگرال وزنی ═══
//
// امید ریاضی را می‌شود با وزن‌دادن چگالی حساب کرد. کار می‌کند و یک مشکل
// دارد: هر خطایی در وزن‌ها بی‌صدا در جواب می‌نشیند. گره‌های هم‌احتمال —
// صدک‌های ۰٫۵/n تا (n−۰٫۵)/n — همان انتگرال را به یک **میانگین ساده**
// تبدیل می‌کنند. وزنی در کار نیست که غلط باشد، و هر کسی می‌تواند با
// شمردن نقطه‌ها وارسی‌اش کند.
//
// ═══ آزمون مقاومت ═══
//
// سند می‌گوید جدی بگیرش و درست می‌گوید. ساختاری که فقط زیر سناریوی دقیق
// کاربر برنده است، برنده نیست — چون آن سناریو دقیقاً همان چیزی است که
// معلوم نیست درست باشد. پس توزیع یک درجه در جهت خلاف نظر جابه‌جا می‌شود
// و امید دوباره حساب می‌شود. عددش هم در جدول می‌نشیند، نه فقط در امتیاز.

import { num, ok } from './num.mjs';
import { priceQuantile } from './bs.mjs';
import { legValueAtExpiry, legCashflow, signedQty } from './payoff.mjs';

/** شمار گره‌های هم‌احتمال. فرد است تا میانه خودش یک گره باشد. */
export const NODES = 41;

/**
 * توزیع قیمت پایه در افق، از نظر کاربر.
 *
 * ═══ مرکز، میانگین است نه میانه ═══
 *
 * کاربر «بزرگی حرکت **مورد انتظار**» را می‌گوید، و همان یعنی امید ریاضی
 * قیمت. `priceQuantile` هم دقیقاً همین قرارداد را دارد: صدک‌هایی که
 * میانگینشان روی مرکز می‌نشیند، نه میانه‌شان. در لگاریتم-نرمال این دو یکی
 * نیستند و میانه کمی پایین‌تر از میانگین است.
 *
 * نسخهٔ اول این میدان را `median` نامیده بود و آزمون گرفتش: گرهِ میانی
 * روی آن عدد نمی‌نشست. اسم غلط بدتر از عدد غلط است — عدد غلط را آزمون
 * می‌گیرد، اسم غلط را کسی سال‌ها بعد باور می‌کند. پس `centre` شد و
 * `medianPrice` جدا برمی‌گردد.
 *
 * `centre` از پیش‌بینی کاربر می‌آید و `sigma` از عکس درجهٔ اطمینان، با کف
 * تلاطم تحقق‌یافتهٔ تاریخی. کف عمدی است: اطمینان کامل هم پراکندگی را از
 * آنچه بازار واقعاً داشته کمتر نمی‌کند. کاربر می‌تواند مطمئن باشد؛ بازار
 * که نیست.
 *
 * نظر دربارهٔ تلاطم ضمنی به‌صورت جابه‌جایی سطح می‌نشیند و جدا نگه داشته
 * می‌شود (`ivShiftPp`)، چون روی قیمت‌گذاری اثر می‌گذارد نه روی توزیع
 * قیمت پایه.
 */
export function viewDistribution({
  spot, direction = 'flat', movePct = 0, confidence = 0.5,
  horizonDays = 10, realizedVolPct = NaN, yearDays = 365, ivView = 'same', ivShiftPp = 5,
} = {}) {
  const S = num(spot, NaN);
  const T = Math.max(1, num(horizonDays, 10)) / Math.max(1, num(yearDays, 365));
  const conf = Math.min(1, Math.max(0, num(confidence, 0.5)));
  const realized = num(realizedVolPct, NaN);
  if (!(S > 0) || !(realized > 0)) {
    return { ok: false, why: 'بدون قیمت پایه و تلاطم تحقق‌یافته، توزیعی ساخته نمی‌شود.', spot: S };
  }

  const signed = direction === 'up' ? 1 : direction === 'down' ? -1 : 0;
  const drift = direction === 'volatile' ? 0 : signed * Math.abs(num(movePct, 0));
  const centre = S * (1 + drift / 100);

  // پراکندگی: کف تلاطم تحقق‌یافته، و تا سه برابرش وقتی اطمینان صفر است.
  // جهت «پرنوسان» خودش پراکندگی می‌خواهد، پس کف را یک‌ونیم برابر می‌کند.
  const base = (realized / 100) * Math.sqrt(T);
  const widen = 1 + 2 * (1 - conf);
  const sigma = base * widen * (direction === 'volatile' ? 1.5 : 1);

  return {
    ok: true, spot: S, centre, sigma, driftPct: drift, horizonDays: num(horizonDays, 10),
    // میانهٔ همان توزیع، برای وقتی جمله‌ای می‌خواهد بگوید «نصف احتمال
    // بالای این عدد است». با میانگین اشتباه نشود.
    medianPrice: centre * Math.exp(-0.5 * (base * widen * (direction === 'volatile' ? 1.5 : 1)) ** 2),
    T, confidence: conf, realizedVolPct: realized, direction,
    ivShiftPp: ivView === 'up' ? Math.abs(num(ivShiftPp, 5))
      : ivView === 'down' ? -Math.abs(num(ivShiftPp, 5)) : 0,
    edited: false,
  };
}

/** ویرایش دستی توزیع. هر بار که دست بخورد، `edited` علامت می‌خورد. */
export function editDistribution(dist, { centre, sigma } = {}) {
  if (!dist?.ok) return dist;
  const nextCentre = num(centre, NaN);
  const nextSigma = num(sigma, NaN);
  const out = { ...dist, edited: true };
  if (nextCentre > 0) { out.centre = nextCentre; out.driftPct = ((nextCentre - dist.spot) / dist.spot) * 100; }
  if (nextSigma > 0) out.sigma = nextSigma;
  out.medianPrice = out.centre * Math.exp(-0.5 * out.sigma ** 2);
  return out;
}

/**
 * گره‌های هم‌احتمال توزیع.
 *
 * توزیع لگاریتم-نرمالِ جابه‌جاشده: میانه روی `median` می‌نشیند و پراکندگی
 * `sigma` است. `priceQuantile` همین را حول یک مرکز می‌سازد، پس مرکزش را
 * از میانه می‌گیریم نه از قیمت جاری.
 */
export function quantileNodes(dist, count = NODES) {
  if (!dist?.ok) return [];
  const n = Math.max(3, Math.trunc(num(count, NODES)));
  const out = [];
  for (let at = 0; at < n; at += 1) {
    const p = (at + 0.5) / n;
    // `priceQuantile` با T=۱ و σ برابر پراکندگی افق، لگاریتم-نرمالی
    // می‌دهد که **میانگینش** روی مرکز می‌نشیند — همان چیزی که «حرکت مورد
    // انتظار» یعنی.
    const value = priceQuantile(dist.centre, p, 1, dist.sigma);
    if (ok(value) && value > 0) out.push(value);
  }
  return out;
}

/** امید ریاضی یک تابع زیر توزیع — میانگین سادهٔ گره‌های هم‌احتمال. */
export function expectedUnder(dist, fn, count = NODES) {
  const nodes = quantileNodes(dist, count);
  if (!nodes.length) return NaN;
  let sum = 0, used = 0;
  for (const S of nodes) {
    const value = Number(fn(S));
    if (!Number.isFinite(value)) continue;
    sum += value; used += 1;
  }
  return used ? sum / used : NaN;
}

/** احتمال اینکه تابع مثبت شود — نسبت گره‌های برنده. */
export function probabilityUnder(dist, fn, count = NODES) {
  const nodes = quantileNodes(dist, count);
  if (!nodes.length) return NaN;
  let wins = 0, used = 0;
  for (const S of nodes) {
    const value = Number(fn(S));
    if (!Number.isFinite(value)) continue;
    used += 1;
    if (value > 0) wins += 1;
  }
  return used ? (wins / used) * 100 : NaN;
}

/** سود و زیان ترکیب در سررسید، به ازای قیمت پایه. */
export function pnlAt(legs = [], S) {
  let total = 0;
  for (const leg of legs) {
    const value = legValueAtExpiry(leg, S);
    const cash = legCashflow(leg);
    if (!Number.isFinite(value) || !Number.isFinite(cash)) return NaN;
    total += value + cash;
  }
  return total;
}

/**
 * توزیع تحت فشار — یک درجه در خلاف جهت نظر.
 *
 * «یک درجه» یعنی نصف حرکتِ پیش‌بینی‌شده، در خلاف جهت. برای نظر خنثی یا
 * پرنوسان که جهتی ندارد، جابه‌جایی به اندازهٔ نصف پراکندگی است — چون
 * چیزی که آن دو نظر را می‌شکند حرکت است، نه جهت.
 */
export function stressDistribution(dist) {
  if (!dist?.ok) return dist;
  const signed = dist.direction === 'up' ? -1 : dist.direction === 'down' ? 1 : 0;
  const shift = signed !== 0
    ? signed * Math.abs(dist.driftPct) / 2 / 100
    : -dist.sigma / 2;
  const centre = dist.spot * (1 + (dist.driftPct / 100) + shift);
  return { ...dist, centre, medianPrice: centre * Math.exp(-0.5 * dist.sigma ** 2), stressed: true };
}

/**
 * امتیاز یک کاندید، با اجزایش.
 *
 * اجزا برمی‌گردند و فقط عدد نهایی نه — سند صریح خواسته و درست هم هست:
 * کاربری که نمی‌فهمد چرا این ساختار بالاست، یا کورکورانه قبولش می‌کند یا
 * کلاً به موتور بی‌اعتماد می‌شود. هر دو بد است.
 *
 * `capital` مخرج بازده است و از `capitalBase` موتور وجه تضمین می‌آید، نه
 * از پریمیوم پرداختی. پولی که کارگزار بلوکه می‌کند درگیر است حتی اگر
 * اسمش پرداخت نباشد.
 */
export function scoreCandidate({ legs = [], dist, capital = NaN, maxLoss = NaN, nodes = NODES } = {}) {
  if (!dist?.ok || !legs.length) {
    return { ok: false, why: 'توزیع یا ترکیب معتبر نیست', score: NaN };
  }
  const payoff = (S) => pnlAt(legs, S);
  const expected = expectedUnder(dist, payoff, nodes);
  const probProfit = probabilityUnder(dist, payoff, nodes);
  const stressed = stressDistribution(dist);
  const stressExpected = expectedUnder(stressed, payoff, nodes);

  const base = num(capital, NaN);
  const returnPct = base > 0 && Number.isFinite(expected) ? (expected / base) * 100 : NaN;
  const stressReturnPct = base > 0 && Number.isFinite(stressExpected) ? (stressExpected / base) * 100 : NaN;
  const worst = Number.isFinite(num(maxLoss, NaN)) ? Math.abs(num(maxLoss)) : NaN;

  // جریمهٔ شکنندگی: چقدر از بازده مورد انتظار زیر فشار آب می‌رود. عدد
  // مثبت یعنی ساختار زیر سناریوی خلاف، بدتر می‌شود — که طبیعی است؛ آنچه
  // جریمه می‌شود شدتش است.
  const fragility = Number.isFinite(returnPct) && Number.isFinite(stressReturnPct)
    ? returnPct - stressReturnPct : NaN;

  // امتیاز: بازده مورد انتظار، ولی وزن‌خورده با مقاومتش. ساختاری که زیر
  // فشار می‌ریزد، همان‌قدر ارزش ندارد که عدد اولش نشان می‌داد.
  const resilience = Number.isFinite(returnPct) && Number.isFinite(stressReturnPct)
    ? (returnPct + stressReturnPct) / 2 : NaN;

  return {
    ok: Number.isFinite(resilience),
    score: resilience,
    parts: {
      expectedPnl: expected,
      returnPct,
      stressPnl: stressExpected,
      stressReturnPct,
      fragility,
      probProfitPct: probProfit,
      maxLoss: worst,
      capital: base,
    },
    why: Number.isFinite(resilience) ? '' : 'مخرج سرمایه یا امید ریاضی ساخته نشد',
  };
}

/** برچسب هر جزء امتیاز — یک ترتیب، در موتور و جدول. */
export const SCORE_PARTS = [
  { key: 'returnPct', label: 'بازده مورد انتظار', unit: 'درصد', hint: 'امید ریاضی سود بر مخرج سرمایه، زیر توزیع نظر تو' },
  { key: 'stressReturnPct', label: 'بازده زیر فشار', unit: 'درصد', hint: 'همان عدد، وقتی توزیع یک درجه خلاف نظرت جابه‌جا شود' },
  { key: 'fragility', label: 'شکنندگی', unit: 'واحد درصد', hint: 'فاصلهٔ دو عدد بالا؛ هرچه بیشتر، وابسته‌تر به درست بودن دقیق نظرت' },
  { key: 'probProfitPct', label: 'احتمال سود', unit: 'درصد', hint: 'نسبت گره‌های هم‌احتمالی که در سررسید سود می‌دهند' },
  { key: 'maxLoss', label: 'بیشترین زیان', unit: 'ریال', hint: 'بدترین حالت ممکن، مستقل از توزیع' },
  { key: 'capital', label: 'سرمایهٔ درگیر', unit: 'ریال', hint: 'مخرج بازده — بدهکاری، وجه تضمین بلوکه، یا بیشترین زیان' },
];

/**
 * رتبه‌بندی، با حذف صریح آنچه اصلاً وارد نمی‌شود.
 *
 * کاندیدی که اجراپذیر نیست **رتبه نمی‌گیرد**، ولی از فهرست هم ناپدید
 * نمی‌شود: در `rejected` می‌نشیند با دلیلش. سند می‌گوید وارد رتبه‌بندی
 * نشود و همین درست است؛ ولی نادیده‌گرفتنِ کاملش یعنی کاربر هرگز نمی‌فهمد
 * چرا ساختاری که انتظار داشت، نیست.
 */
export function rankCandidates(list = []) {
  const ranked = [];
  const rejected = [];
  for (const item of list || []) {
    if (!item?.exec?.ok || !(num(item.exec.max, 0) > 0)) {
      rejected.push({ ...item, why: item?.exec?.why || 'اجراپذیر نیست' });
      continue;
    }
    if (!item?.score?.ok) { rejected.push({ ...item, why: item?.score?.why || 'امتیاز ساخته نشد' }); continue; }
    ranked.push(item);
  }
  ranked.sort((a, b) => b.score.score - a.score.score);
  return {
    ranked: ranked.map((item, at) => ({ ...item, rank: at + 1 })),
    rejected,
    count: ranked.length,
  };
}

/**
 * رتبهٔ انتخاب کاربر در میان کاندیدها.
 *
 * تک‌عددی که کل بند «پرتفوی سایه» برای آن است: اگر کاربر مرتب بالای رتبهٔ
 * موتور باشد، او چیزی می‌بیند که موتور نمی‌بیند و منطق موتور باید بهبود
 * یابد. اگر مرتب پایین باشد، انتخاب ساختار مشکل دارد نه پیش‌بینی.
 */
export function pickQuality(ranked = [], chosenIds = []) {
  const ids = new Set((chosenIds || []).map(String));
  const picks = ranked.filter((item) => ids.has(String(item.id)));
  if (!picks.length) return { ok: false, why: 'انتخابی در میان کاندیدها نبود' };
  const ranks = picks.map((item) => item.rank);
  const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  return {
    ok: true, ranks, meanRank: mean, total: ranked.length,
    percentile: ranked.length > 1 ? ((ranked.length - mean) / (ranked.length - 1)) * 100 : 100,
  };
}

/**
 * تفکیک بدشانسی از بدانتخابی.
 *
 * تنها مکانیزم کل این فیچر که این دو را از هم جدا می‌کند، و به همین دلیل
 * جمله‌اش هم صریح نوشته می‌شود نه اینکه از کاربر بخواهیم از اعداد
 * دربیاوردش.
 */
export function luckVsSkill({ shadowPnls = [], chosenPnl = NaN, meanRank = NaN, total = 0 } = {}) {
  // رقم فارسی: این جمله مستقیم به کاربر نشان داده می‌شود و رقم لاتین در
  // خروجی نمایشی ایراد است (قاعدهٔ ۲-۳). راستی‌آزمایی مرورگری گرفتش.
  const fa = (n) => String(Math.round(num(n, 0))).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  const list = (shadowPnls || []).map((value) => num(value, NaN)).filter(Number.isFinite);
  if (!list.length || !Number.isFinite(num(chosenPnl, NaN))) {
    return { ok: false, why: 'برای این تفکیک، سود و زیان همهٔ کاندیدها لازم است.' };
  }
  const winners = list.filter((value) => value > 0).length;
  const winRate = (winners / list.length) * 100;
  const better = list.filter((value) => value > num(chosenPnl)).length;
  const beatPct = ((list.length - better) / list.length) * 100;

  let verdict, note;
  if (winRate < 25) {
    verdict = 'forecast';
    note = `از ${fa(list.length)} کاندید، تنها ${fa(winners)} تا سود دادند. یعنی مسئله ساختار نبود — پیش‌بینی جهت غلط بود.`;
  } else if (winRate > 60 && beatPct < 40) {
    verdict = 'selection';
    note = `بیشتر کاندیدها سود دادند ولی انتخاب تو از ${fa(100 - beatPct)} درصدشان بدتر بود. پیش‌بینی درست بود؛ ساختار غلط انتخاب شد.`;
  } else if (beatPct > 70) {
    verdict = 'edge';
    note = `انتخاب تو از ${fa(beatPct)} درصد کاندیدها بهتر درآمد. اگر این الگو تکرار شود، تو چیزی می‌بینی که موتور نمی‌بیند و منطق موتور باید بهبود یابد.`;
  } else {
    verdict = 'mixed';
    note = `نرخ برد کاندیدها ${fa(winRate)} درصد و انتخاب تو از ${fa(beatPct)} درصدشان بهتر بود. یک جلسه برای حکم‌دادن کافی نیست.`;
  }
  return { ok: true, verdict, note, winRate, beatPct, count: list.length, meanRank, total };
}
