// ویرایش سطرهای سبد فرضی — توابع خالص، جدا از DOM.
//
// چرا جدا؟ چون این منطق یک بار داخل شنوندهٔ `change` نوشته شد و یک شاخه‌اش
// جا افتاد: انتخاب «ترکیب» به شاخهٔ «استراتژی» می‌افتاد و مقدارِ ترکیب را
// به‌جای شناسهٔ استراتژی می‌نشاند. نتیجه: استراتژی عوض می‌شد، هیچ ترکیبی
// نمی‌ماند و سبد ساخته نمی‌شد. منطقی که آزمون مستقیم ندارد، همین می‌شود.

/** نخستین ترکیب معتبرِ یک استراتژی در یک اجرا؛ اگر نبود، رشتهٔ خالی. */
export function firstComboId(source, strategyId) {
  if (!source || !strategyId) return '';
  const combos = source.analysis?.combos || [];
  const found = combos.find((combo) => combo.strategyId === strategyId && combo.series?.ok);
  return found?.id || '';
}

/** آیا این ترکیب در این اجرا و زیر این استراتژی واقعاً هست؟ */
export function comboBelongs(source, strategyId, comboId) {
  if (!source || !comboId) return false;
  return (source.analysis?.combos || [])
    .some((combo) => combo.id === comboId && combo.strategyId === strategyId && combo.series?.ok);
}

/**
 * یک ویرایش را روی فهرست سطرها می‌نشاند و فهرست تازه برمی‌گرداند.
 *
 * قاعدهٔ آبشار: عوض‌شدن «اجرا» استراتژی و ترکیب را بی‌اعتبار می‌کند،
 * عوض‌شدن «استراتژی» فقط ترکیب را. عوض‌شدن «ترکیب» هیچ‌چیز بالادستی را
 * دست نمی‌زند — این همان شاخه‌ای است که نبود.
 */
export function applyBasketEdit({ picks, index, key, value, sources }) {
  const list = Array.isArray(picks) ? picks : [];
  const runs = Array.isArray(sources) ? sources : [];
  const sourceOf = (id) => runs.find((row) => row.id === id) || null;
  return list.map((pick, at) => {
    if (at !== index) return pick;
    if (key === 'pct') {
      const raw = Number(value);
      return { ...pick, pct: Number.isFinite(raw) && raw > 0 ? raw : 0 };
    }
    if (key === 'sourceId') {
      const source = sourceOf(value);
      const strategy = source?.analysis?.strategies?.[0];
      const strategyId = strategy?.strategyId || '';
      return { ...pick, sourceId: value, strategyId, comboId: firstComboId(source, strategyId) };
    }
    if (key === 'strategyId') {
      const source = sourceOf(pick.sourceId) || runs[0] || null;
      return { ...pick, strategyId: value, comboId: firstComboId(source, value) };
    }
    if (key === 'comboId') {
      // انتخاب دستیِ ترکیب، بالادست را نگه می‌دارد. اگر مقدار به این
      // استراتژی نخورد (فهرست کهنه)، خالی می‌ماند — نه اینکه ترکیبِ
      // استراتژیِ دیگری بی‌صدا وارد سبد شود.
      const source = sourceOf(pick.sourceId) || runs[0] || null;
      return { ...pick, comboId: comboBelongs(source, pick.strategyId, value) ? value : '' };
    }
    return pick;
  });
}

/**
 * فهرست را با اجراهای موجود آشتی می‌دهد تا آنچه در فرم دیده می‌شود
 * همانی باشد که ساخته می‌شود.
 *
 * سطری که ترکیبش دیگر زیر استراتژی‌اش نیست، در `<select>` هیچ گزینه‌ای
 * `selected` نمی‌گیرد و مرورگر گزینهٔ اول را نشان می‌دهد — یعنی کاربر
 * ترکیبی را می‌بیند که در حافظه نیست. اینجا همان اولی را واقعاً می‌نشانیم.
 */
export function normalizeBasketPicks(picks, sources) {
  const runs = Array.isArray(sources) ? sources : [];
  const sourceOf = (id) => runs.find((row) => row.id === id) || null;
  return (Array.isArray(picks) ? picks : []).map((pick) => {
    const source = sourceOf(pick.sourceId) || runs[0] || null;
    if (!source) return pick;
    const sourceId = source.id;
    const has = (source.analysis?.strategies || []).some((row) => row.strategyId === pick.strategyId);
    const strategyId = has ? pick.strategyId : (source.analysis?.strategies?.[0]?.strategyId || '');
    const comboId = comboBelongs(source, strategyId, pick.comboId)
      ? pick.comboId
      : firstComboId(source, strategyId);
    if (sourceId === pick.sourceId && strategyId === pick.strategyId && comboId === pick.comboId) return pick;
    return { ...pick, sourceId, strategyId, comboId };
  });
}

// ═══════════════════ سهمِ یک سطر تازه ═══════════════════
//
// دکمهٔ «افزودن استراتژی به سبد» سهم ثابت ۱۰٪ می‌گذاشت. دو جور خراب
// می‌شد و هر دو را کاربر دید:
//
//   مجموع از صد رد می‌شد. سه سطر پیش‌فرض ۴۰+۳۵+۲۵ دقیقاً صد است؛ یک
//   افزودن یعنی ۱۱۰ و `allocatePortfolio` **کل** سبد را رد می‌کرد. یعنی
//   کاربر یک استراتژی اضافه می‌کرد و کل سبدش ناپدید می‌شد.
//
//   ۱۰٪ اغلب حتی یک دست نمی‌خرید. قرارداد شکسته نمی‌شود، پس آن سهم
//   تخصیص‌نیافته می‌ماند و سطر تازه در هیچ نمودار و جدولی نمی‌آمد.
//
// درمان: سهم از آنچه **واقعاً آزاد است** برداشته شود، و اگر بهای یک دست
// معلوم است، دست‌کم به اندازهٔ یک دست باشد.

import { basisDenominator, normalizeBasis } from './portfolio-basis.mjs';

const num = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

/** بهای یک دست از این ترکیب روی مبنای جاری؛ اگر معلوم نیست، `null`. */
export function lotCostRial(source, comboId, basisId = null) {
  const combo = (source?.analysis?.combos || []).find((row) => String(row.id) === String(comboId ?? ''));
  if (!combo) return null;
  const den = basisDenominator(combo.entry, normalizeBasis(basisId ?? source?.analysis?.basisId));
  return den.ok && num(den.value) !== null && den.value > 0 ? den.value : null;
}

/**
 * کمینهٔ درصدی که یک دست را می‌خرد.
 *
 * به بالا گرد می‌شود، نه پایین: درصدی که دقیقاً سر به سر است، با کوچک‌ترین
 * خطای ممیز شناور یک ریال کم می‌آورد و `Math.floor` صفر دست می‌دهد.
 */
export function minPctFor(capitalRial, lotCost) {
  const capital = num(capitalRial), cost = num(lotCost);
  if (capital === null || cost === null || !(capital > 0) || !(cost > 0)) return null;
  return Math.ceil((cost / capital) * 100 * 100) / 100;
}

/** مجموع درصدهای تخصیص‌یافته — می‌تواند از صد بیشتر باشد. */
export function usedPct(picks) {
  const total = (Array.isArray(picks) ? picks : [])
    .reduce((sum, pick) => sum + (num(pick?.pct) ?? 0), 0);
  return Math.round(total * 100) / 100;
}

/**
 * درصدِ تخصیص‌نیافته — هرگز منفی.
 *
 * برای «چقدر جا مانده» درست است و برای «مجموع چقدر شد» غلط: کفِ صفر یعنی
 * `100 - freePct` هر تخصیصِ بیش از صد را دقیقاً صد نشان می‌دهد. مجموع را
 * از `usedPct` بگیرید.
 */
export function freePct(picks) {
  return Math.max(0, Math.round((100 - usedPct(picks)) * 100) / 100);
}

/**
 * سهمِ پیشنهادی برای یک سطر تازه.
 *
 * صفر یک پاسخ معتبر است و یعنی «جایی نمانده». سطر باز هم ساخته می‌شود —
 * حذفِ بی‌صدای خواستهٔ کاربر بدتر از سطری است که علتش را می‌گوید — ولی
 * `allocatePortfolio` سهم صفر را کنار می‌گذارد، پس بقیهٔ سبد سالم می‌ماند
 * به‌جای اینکه کل سبد رد شود.
 */
export function suggestPct({ picks = [], capitalRial = null, lotCost = null, fallback = 10 } = {}) {
  const free = freePct(picks);
  if (free <= 0) return 0;
  const need = minPctFor(capitalRial, lotCost);
  const base = num(fallback) ?? 10;
  if (need === null) return Math.min(free, base);
  if (need > free) return free;
  return Math.min(free, Math.max(need, base));
}

/**
 * چرا این سطر در سبد نمی‌نشیند — پیش از فشردن دکمه، نه بعدش.
 *
 * `null` یعنی سطر سالم است. پیامِ پس از ساخت هم درست بود، ولی دیر:
 * کاربر باید فرم را ببندد و دوباره باز کند تا بفهمد چه شد.
 */
export function pickWarning({ pick = null, source = null, capitalRial = null, basisId = null, picks = [] } = {}) {
  if (!pick) return null;
  const pct = num(pick.pct);
  if (pct === null || pct <= 0) return { kind: 'zero', text: 'سهم صفر است؛ این سطر در سبد نمی‌آید' };
  if (!pick.comboId) return { kind: 'noCombo', text: 'ترکیبی انتخاب نشده است' };
  const total = (Array.isArray(picks) ? picks : []).reduce((sum, row) => sum + (num(row?.pct) ?? 0), 0);
  if (total > 100 + 1e-9) {
    return { kind: 'over', total, text: `مجموع درصدها ${Math.round(total * 100) / 100} است؛ سبد ساخته نمی‌شود` };
  }
  const cost = lotCostRial(source, pick.comboId, basisId);
  if (cost === null) return null;                    // بهای دست معلوم نیست؛ ادعایی نمی‌کنیم
  const need = minPctFor(capitalRial, cost);
  if (need === null || pct >= need) return null;
  return { kind: 'tooSmall', need, cost, text: `برای یک دست دست‌کم ${need}٪ لازم است` };
}

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * افزودن یک سطر تازه، با جا بازکردن اگر لازم باشد.
 *
 * سه سطر پیش‌فرض دقیقاً صد درصدند. `suggestPct` در آن حالت صفر می‌دهد و
 * صفر یعنی سطری که ساخته می‌شود ولی در هیچ محاسبه‌ای نمی‌آید — یعنی
 * دکمه‌ای که کار نمی‌کند. وقتی کاربر می‌گوید «این را هم اضافه کن»،
 * منظورش این است که در سبد باشد.
 *
 * پس اگر جا هست، از همان جا برداشته می‌شود و چیزی دست نمی‌خورد. اگر جا
 * نیست، سهم‌ها **به نسبت خودشان** کوچک می‌شوند تا سطر تازه سهم برابر
 * بگیرد: چهار سطر یعنی سهم تازه ۲۵٪ و سه سطر قبلی ۷۵٪ را با همان نسبت
 * ۴۰:۳۵:۲۵ میان خود تقسیم می‌کنند. وزن‌دهیِ کاربر حفظ می‌شود و مجموع
 * دقیقاً صد می‌ماند.
 *
 * `rebalanced` را برمی‌گرداند تا رابط بتواند بگوید چه شد؛ عوض‌شدنِ بی‌خبرِ
 * عددی که کاربر خودش گذاشته، بدترین حالت است.
 */
export function addPick({ picks = [], pick = null, capitalRial = null, lotCost = null, fallback = 10 } = {}) {
  const list = Array.isArray(picks) ? [...picks] : [];
  if (!pick) return { picks: list, rebalanced: false, pct: 0 };
  const free = freePct(list);
  const need = minPctFor(capitalRial, lotCost);
  const want = round2(Math.max(need ?? 0, num(fallback) ?? 10));

  if (free >= want - 1e-9) {
    return { picks: [...list, { ...pick, pct: want }], rebalanced: false, pct: want };
  }

  const used = list.reduce((sum, row) => sum + (num(row?.pct) ?? 0), 0);
  if (!(used > 0)) {
    const only = round2(Math.min(100, want));
    return { picks: [...list, { ...pick, pct: only }], rebalanced: false, pct: only };
  }
  const share = round2(100 / (list.length + 1));
  const scale = (100 - share) / used;
  const scaled = list.map((row) => ({ ...row, pct: round2((num(row.pct) ?? 0) * scale) }));
  // گردکردن دو رقمی چند صدم درز می‌اندازد؛ باقی‌مانده به بزرگ‌ترین سهم
  // برمی‌گردد تا مجموع دقیقاً صد بماند و سبد سرِ یک صدم رد نشود.
  const drift = round2(100 - share - scaled.reduce((sum, row) => sum + row.pct, 0));
  if (Math.abs(drift) >= 0.01) {
    let at = 0;
    for (let index = 1; index < scaled.length; index++) if (scaled[index].pct > scaled[at].pct) at = index;
    scaled[at] = { ...scaled[at], pct: round2(scaled[at].pct + drift) };
  }
  return { picks: [...scaled, { ...pick, pct: share }], rebalanced: true, pct: share };
}
