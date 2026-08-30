// ویرایش سطرهای سبد فرضی — یک تابع خالص، جدا از DOM.
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
