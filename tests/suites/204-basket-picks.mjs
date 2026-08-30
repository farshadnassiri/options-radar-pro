// ۲۰۴. ویرایش سطرهای سبد فرضی
//
// نقصی که این دسته را ساخت: انتخاب «ترکیب» در فرم سبد، شاخهٔ مخصوصش را
// نداشت و به شاخهٔ «استراتژی» می‌افتاد. مقدارِ ترکیب به‌جای شناسهٔ
// استراتژی می‌نشست، هیچ ترکیبی زیر آن پیدا نمی‌شد، و سبد ساخته نمی‌شد.

import { check, group } from '../harness.mjs';
import {
  addPick, applyBasketEdit, comboBelongs, firstComboId, freePct, lotCostRial,
  minPctFor, normalizeBasketPicks, pickWarning, suggestPct, usedPct,
} from '../../core/basket-picks.mjs';

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

  // ═══════ سهمِ سطر تازه ═══════
  //
  // نقصی که این بخش را ساخت: دکمهٔ «افزودن» سهم ثابت ۱۰٪ می‌گذاشت.
  // سه سطر پیش‌فرض ۴۰+۳۵+۲۵ دقیقاً صد است، پس یک افزودن مجموع را ۱۱۰
  // می‌کرد و `allocatePortfolio` **کل** سبد را رد می‌کرد — کاربر یک
  // استراتژی اضافه می‌کرد و کل سبدش ناپدید می‌شد.

  const costly = { id: 'گران', label: 'گران', analysis: { basisId: 'gross',
    strategies: [{ strategyId: 'long-call', strategyName: 'Long Call' }],
    combos: [
      { id: 'lc-big', strategyId: 'long-call', series: { ok: true },
        entry: { marginGross: 0, netCash: -3_600_000_000 } },
      { id: 'lc-small', strategyId: 'long-call', series: { ok: true },
        entry: { marginGross: 0, netCash: -50_000_000 } },
      { id: 'lc-blind', strategyId: 'long-call', series: { ok: true }, entry: { marginGross: null, netCash: null } },
    ] } };

  const full204 = [{ pct: 40 }, { pct: 35 }, { pct: 25 }];
  check('درصد آزاد، سه سطر پیش‌فرض را صفر می‌بیند', freePct(full204) === 0, String(freePct(full204)));
  check('درصد آزاد هرگز منفی نمی‌شود', freePct([{ pct: 80 }, { pct: 50 }]) === 0);
  // کفِ صفرِ `freePct` برای «چقدر جا مانده» درست است و برای «مجموع چقدر
  // شد» غلط: `100 - freePct` هر تخصیصِ بیش از صد را دقیقاً صد نشان می‌داد.
  check('مجموع تخصیص، بیش از صد را صد نشان نمی‌دهد',
    usedPct([{ pct: 90 }, { pct: 85 }]) === 175, String(usedPct([{ pct: 90 }, { pct: 85 }])));
  check('مجموع تخصیص، سهم بی‌عدد را نادیده می‌گیرد',
    usedPct([{ pct: 30 }, { pct: null }]) === 30);
  check('درصد آزاد، سهم بی‌عدد را نادیده می‌گیرد',
    freePct([{ pct: 30 }, { pct: null }, { pct: '' }]) === 70, String(freePct([{ pct: 30 }, { pct: null }])));

  const added = suggestPct({ picks: full204, capitalRial: 1e10, lotCost: 1e8 });
  check('روی سبد پرِ صد درصد، سهم تازه صفر است — نه ۱۰ که کل سبد را رد کند',
    added === 0, String(added));
  check('سهم پیشنهادی هرگز مجموع را از صد رد نمی‌کند',
    [[{ pct: 95 }], [{ pct: 40 }], [{ pct: 99.5 }], []].every((picks) =>
      freePct(picks) - suggestPct({ picks, capitalRial: 1e10, lotCost: 1e8 }) >= -1e-9));
  check('وقتی جا هست، سهم پیش‌فرض ۱۰ می‌ماند',
    suggestPct({ picks: [{ pct: 40 }], capitalRial: 1e10, lotCost: 1e8 }) === 10);
  // ۱۰٪ از ده میلیارد یک میلیارد است و یک دستِ ۳٫۶ میلیاردی نمی‌خرد.
  check('سهم تا اندازهٔ یک دست بالا می‌رود، نه ۱۰ ثابت',
    suggestPct({ picks: [{ pct: 40 }], capitalRial: 1e10, lotCost: 3_600_000_000 }) === 36,
    String(suggestPct({ picks: [{ pct: 40 }], capitalRial: 1e10, lotCost: 3_600_000_000 })));
  check('اگر جای آزاد به یک دست نرسد، همان جای آزاد داده می‌شود',
    suggestPct({ picks: [{ pct: 80 }], capitalRial: 1e10, lotCost: 3_600_000_000 }) === 20);
  check('بهای نامعلومِ دست، سهم پیش‌فرض می‌گیرد نه صفر',
    suggestPct({ picks: [{ pct: 40 }], capitalRial: 1e10, lotCost: null }) === 10);

  check('کمینهٔ درصد به بالا گرد می‌شود تا یک ریال کم نیاورد',
    minPctFor(3e9, 1e9) === 33.34, String(minPctFor(3e9, 1e9)));
  check('کمینهٔ درصد بی‌سرمایه یا بی‌بها، نامعلوم است',
    minPctFor(0, 1e9) === null && minPctFor(1e9, null) === null && minPctFor(1e9, 0) === null);
  // مبنای «ناخالص» بدهکار پرداختی را سرمایهٔ درگیر می‌شمارد.
  check('بهای یک دست از مبنای جاری می‌آید',
    lotCostRial(costly, 'lc-big', 'gross') === 3_600_000_000, String(lotCostRial(costly, 'lc-big', 'gross')));
  check('بهای دستِ بی‌مخرج، نامعلوم است نه صفر',
    lotCostRial(costly, 'lc-blind', 'gross') === null,
    String(lotCostRial(costly, 'lc-blind', 'gross')));
  check('ترکیبِ ناموجود بها ندارد', lotCostRial(costly, 'نیست', 'gross') === null);

  // ═══════ هشدارِ پیش از ساخت ═══════
  const warnOf = (pct, comboId, picks) => pickWarning({
    pick: { strategyId: 'long-call', comboId, pct }, source: costly,
    capitalRial: 1e10, basisId: 'gross', picks: picks || [{ pct }],
  });
  check('سهمی که یک دست نمی‌خرد، پیش از ساخت هشدار می‌گیرد',
    warnOf(10, 'lc-big')?.kind === 'tooSmall', String(warnOf(10, 'lc-big')?.kind));
  check('هشدار، کمینهٔ لازم را می‌گوید نه فقط «کم است»',
    warnOf(10, 'lc-big')?.need === 36, String(warnOf(10, 'lc-big')?.need));
  check('سهمی که یک دست می‌خرد هشدار ندارد', warnOf(40, 'lc-big') === null);
  check('سهم صفر، صریح گفته می‌شود', warnOf(0, 'lc-big')?.kind === 'zero');
  check('نبودِ ترکیب، صریح گفته می‌شود', warnOf(10, '')?.kind === 'noCombo');
  check('مجموعِ بیش از صد، روی سطر هشدار می‌دهد',
    warnOf(10, 'lc-small', [{ pct: 95 }, { pct: 10 }])?.kind === 'over');
  // بهای نامعلوم یعنی نمی‌دانیم؛ ادعای «کم است» ساختن داده است.
  check('بهای نامعلومِ دست، هشدارِ ساختگی نمی‌سازد', warnOf(1, 'lc-blind') === null);
  check('سهم کوچکِ ترکیب ارزان هشدار ندارد', warnOf(1, 'lc-small') === null);

  // ═══════ افزودن با جا بازکردن ═══════
  //
  // سهم صفر یعنی سطری که ساخته می‌شود ولی در هیچ محاسبه‌ای نمی‌آید —
  // یعنی دکمه‌ای که کار نمی‌کند. وقتی کاربر می‌گوید «این را هم اضافه
  // کن»، منظورش این است که در سبد باشد.
  const sum204 = (rows) => Math.round(rows.reduce((s, r) => s + r.pct, 0) * 100) / 100;

  const grown = addPick({ picks: full204.map((r) => ({ ...r })), pick: { strategyId: 'x' }, capitalRial: 1e10, lotCost: 1e8 });
  check('روی سبد پرِ صد درصد، سطر تازه سهم واقعی می‌گیرد نه صفر',
    grown.pct > 0, String(grown.pct));
  check('سطر تازه سهم برابر می‌گیرد', grown.pct === 25, String(grown.pct));
  check('مجموع پس از افزودن دقیقاً صد می‌ماند', sum204(grown.picks) === 100, String(sum204(grown.picks)));
  check('نسبت سهم‌های پیشین حفظ می‌شود',
    Math.abs(grown.picks[0].pct / grown.picks[1].pct - 40 / 35) < 1e-6,
    grown.picks.map((r) => r.pct).join('/'));
  check('عوض‌شدن سهم‌های کاربر گزارش می‌شود، نه بی‌صدا', grown.rebalanced === true);

  const roomy = addPick({ picks: [{ pct: 40 }], pick: { strategyId: 'x' }, capitalRial: 1e10, lotCost: 1e8 });
  check('وقتی جا هست، سهم‌های پیشین دست نمی‌خورند',
    roomy.rebalanced === false && roomy.picks[0].pct === 40 && roomy.pct === 10);
  check('وقتی جا هست، سهم تازه به اندازهٔ یک دست بالا می‌رود',
    addPick({ picks: [{ pct: 40 }], pick: { strategyId: 'x' }, capitalRial: 1e10, lotCost: 3_600_000_000 }).pct === 36);
  const first = addPick({ picks: [], pick: { strategyId: 'x' }, capitalRial: 1e10, lotCost: 1e8 });
  check('نخستین سطرِ سبد خالی، بدون بازچینش ساخته می‌شود',
    first.picks.length === 1 && first.picks[0].pct === 10 && first.rebalanced === false);
  check('بدون سطرِ ورودی، فهرست دست‌نخورده برمی‌گردد',
    addPick({ picks: full204, pick: null }).picks.length === 3);
  // گردکردن دو رقمی چند صدم درز می‌اندازد و مجموعِ ۱۰۰٫۰۱ کل سبد را رد می‌کند.
  const odd = addPick({ picks: [{ pct: 33.33 }, { pct: 33.33 }, { pct: 33.34 }], pick: { strategyId: 'x' } });
  check('درزِ گردکردن جمع نمی‌شود و مجموع از صد رد نمی‌کند',
    sum204(odd.picks) === 100, String(sum204(odd.picks)));
  const seven = [20, 20, 20, 15, 15, 10].map((pct) => ({ pct }));
  check('با هفت سطر هم مجموع دقیقاً صد می‌ماند',
    sum204(addPick({ picks: seven, pick: { strategyId: 'x' } }).picks) === 100,
    String(sum204(addPick({ picks: seven, pick: { strategyId: 'x' } }).picks)));
}