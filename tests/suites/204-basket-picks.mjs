// ۲۰۴. ویرایش سطرهای سبد فرضی
//
// نقصی که این دسته را ساخت: انتخاب «ترکیب» در فرم سبد، شاخهٔ مخصوصش را
// نداشت و به شاخهٔ «استراتژی» می‌افتاد. مقدارِ ترکیب به‌جای شناسهٔ
// استراتژی می‌نشست، هیچ ترکیبی زیر آن پیدا نمی‌شد، و سبد ساخته نمی‌شد.

import { check, group } from '../harness.mjs';
import { applyBasketEdit, comboBelongs, firstComboId, normalizeBasketPicks } from '../../core/basket-picks.mjs';

const combo204 = (id, strategyId, ok = true) => ({ id, strategyId, series: { ok } });
const run204 = (id, strategies, combos) => ({ id, label: id, analysis: { strategies, combos } });

const alef = run204('الف', [
  { strategyId: 'covered-call', strategyName: 'Covered Call' },
  { strategyId: 'short-put', strategyName: 'Short Put' },
], [
  combo204('cc-1', 'covered-call'), combo204('cc-2', 'covered-call'),
  combo204('sp-1', 'short-put'), combo204('sp-broken', 'short-put', false),
]);
const be = run204('ب', [
  { strategyId: 'long-call', strategyName: 'Long Call' },
], [combo204('lc-1', 'long-call')]);
const sources204 = [alef, be];

const picks204 = () => [
  { sourceId: 'الف', strategyId: 'covered-call', comboId: 'cc-1', pct: 40 },
  { sourceId: 'الف', strategyId: 'short-put', comboId: 'sp-1', pct: 60 },
];

group('۲۰۴. ویرایش سطرهای سبد فرضی');
{
  // ── همان نقصِ گزارش‌شده ──────────────────────────────────────────────
  const picked = applyBasketEdit({ picks: picks204(), index: 0, key: 'comboId', value: 'cc-2', sources: sources204 });
  check('انتخاب ترکیب، استراتژی را دست‌نخورده می‌گذارد',
    picked[0].strategyId === 'covered-call', picked[0].strategyId);
  check('انتخاب ترکیب، همان ترکیب را می‌نشاند',
    picked[0].comboId === 'cc-2', picked[0].comboId);
  check('انتخاب ترکیب، اجرا را دست‌نخورده می‌گذارد',
    picked[0].sourceId === 'الف' && picked[0].pct === 40);
  check('سطرهای دیگر با ویرایش یک سطر تکان نمی‌خورند',
    picked[1].strategyId === 'short-put' && picked[1].comboId === 'sp-1');

  // ── ترکیبی که به این استراتژی نمی‌خورد، بی‌صدا وارد نمی‌شود ─────────
  const wrong = applyBasketEdit({ picks: picks204(), index: 0, key: 'comboId', value: 'sp-1', sources: sources204 });
  check('ترکیبِ استراتژی دیگر پذیرفته نمی‌شود',
    wrong[0].comboId === '' && wrong[0].strategyId === 'covered-call', wrong[0].comboId);
  const broken = applyBasketEdit({ picks: picks204(), index: 1, key: 'comboId', value: 'sp-broken', sources: sources204 });
  check('ترکیبِ بی‌سری معتبر شمرده نمی‌شود', broken[1].comboId === '', broken[1].comboId);

  // ── آبشار: اجرا ← استراتژی ← ترکیب ──────────────────────────────────
  const swapped = applyBasketEdit({ picks: picks204(), index: 0, key: 'strategyId', value: 'short-put', sources: sources204 });
  check('عوض‌شدن استراتژی، ترکیب را به نخستین ترکیب معتبرش می‌برد',
    swapped[0].strategyId === 'short-put' && swapped[0].comboId === 'sp-1', swapped[0].comboId);
  const moved = applyBasketEdit({ picks: picks204(), index: 0, key: 'sourceId', value: 'ب', sources: sources204 });
  check('عوض‌شدن اجرا، استراتژی و ترکیب را با اجرای تازه هم‌خط می‌کند',
    moved[0].sourceId === 'ب' && moved[0].strategyId === 'long-call' && moved[0].comboId === 'lc-1',
    `${moved[0].strategyId}/${moved[0].comboId}`);

  // ── سهم ─────────────────────────────────────────────────────────────
  const share = applyBasketEdit({ picks: picks204(), index: 1, key: 'pct', value: 25, sources: sources204 });
  check('سهم عوض می‌شود و بالادست را دست نمی‌زند',
    share[1].pct === 25 && share[1].comboId === 'sp-1');
  const bad = applyBasketEdit({ picks: picks204(), index: 1, key: 'pct', value: 'خیلی', sources: sources204 });
  check('سهم نامعتبر صفر می‌شود، نه NaN', bad[1].pct === 0, String(bad[1].pct));

  // ── کلیدِ ناشناخته چیزی را خراب نمی‌کند ─────────────────────────────
  const untouched = applyBasketEdit({ picks: picks204(), index: 0, key: 'چیزی', value: 'ه', sources: sources204 });
  check('کلید ناشناخته سطر را دست‌نخورده برمی‌گرداند',
    untouched[0].strategyId === 'covered-call' && untouched[0].comboId === 'cc-1');

  // ── کمک‌تابع‌ها ──────────────────────────────────────────────────────
  check('نخستین ترکیبِ معتبر، ترکیبِ بی‌سری را رد می‌کند',
    firstComboId(alef, 'short-put') === 'sp-1', firstComboId(alef, 'short-put'));
  check('استراتژی بی‌ترکیب، رشتهٔ خالی می‌دهد',
    firstComboId(be, 'covered-call') === '', firstComboId(be, 'covered-call'));
  check('عضویت ترکیب، هم استراتژی و هم اعتبار سری را می‌سنجد',
    comboBelongs(alef, 'covered-call', 'cc-1') === true
    && comboBelongs(alef, 'covered-call', 'sp-1') === false
    && comboBelongs(alef, 'short-put', 'sp-broken') === false);

  // ── آشتی‌دادن فهرست با اجراهای موجود ────────────────────────────────
  const stale = normalizeBasketPicks([
    { sourceId: 'الف', strategyId: 'covered-call', comboId: 'lc-1', pct: 50 },
    { sourceId: 'نیست', strategyId: 'long-call', comboId: 'lc-1', pct: 50 },
  ], sources204);
  check('ترکیبِ کهنه به نخستین ترکیب همان استراتژی می‌افتد',
    stale[0].comboId === 'cc-1' && stale[0].strategyId === 'covered-call', stale[0].comboId);
  check('اجرای ناموجود به نخستین اجرا می‌افتد و استراتژی‌اش هم‌خط می‌شود',
    stale[1].sourceId === 'الف' && stale[1].strategyId === 'covered-call' && stale[1].comboId === 'cc-1',
    `${stale[1].sourceId}/${stale[1].strategyId}/${stale[1].comboId}`);
  const same = picks204();
  const kept = normalizeBasketPicks(same, sources204);
  check('سطر سالم دست نمی‌خورد و شیء تازه نمی‌سازد',
    kept[0] === same[0] && kept[1] === same[1]);
  check('بدون هیچ اجرایی، فهرست دست‌نخورده می‌ماند',
    normalizeBasketPicks(same, [])[0] === same[0]);
}
