// ۲۸. غربال روی کل کاتالوگ — برترین موقعیت‌ها
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { scan as scanFn, scanAll } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { CATALOG, byId } from '../../strategies/catalog.mjs';


// ═══════ ۲۸. غربال روی کل کاتالوگ — برترین موقعیت‌ها (قلم الف-۳ بک‌لاگ) ═══════
group('۲۸. غربال روی کل کاتالوگ — برترین موقعیت‌ها');
{
  const mkRow4 = (strike, days, cBid, pBid) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: 100, pMeOf_C: cBid * 1.05, qTitMeOf_C: 100,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: pBid, qTitMeDem_P: 100, pMeOf_P: pBid * 1.05, qTitMeOf_P: 100,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 800,
  });
  const rows4 = [];
  for (const k of [90000, 95000, 100000, 105000, 110000]) {
    rows4.push(mkRow4(k, 30, Math.max(200, 100000 - k + 4000), Math.max(200, k - 100000 + 4000)));
    rows4.push(mkRow4(k, 90, Math.max(300, 100000 - k + 7000), Math.max(300, k - 100000 + 7000)));
  }
  const chain4 = buildChain(rows4);
  const s4 = { ...defaults(), comboWindowPct: 25, wingsEqualWidth: true, greeksInScan: false };
  const feasible = CATALOG.filter((d) => d.feasible);

  const single = scanFn({ def: byId('naked-call'), chain: chain4, uaKeys: ['1'], settings: s4 });
  const all = scanAll({ defs: feasible, chain: chain4, uaKeys: ['1'], settings: s4, limit: 500 });

  check('نتیجه کل، ردیف‌های تک‌استراتژی را هم شامل می‌شود',
    single.rows.every((r) => all.rows.some((x) => x.id === r.id)), `تک ${single.rows.length} از کل ${all.rows.length}`);
  check('نتیجه بیش از یک استراتژی دارد',
    new Set(all.rows.map((r) => r.strategyId)).size > 1, `${new Set(all.rows.map((r) => r.strategyId)).size} استراتژی`);
  check('هر ردیف نام و شناسه استراتژی خودش را حمل می‌کند', all.rows.every((r) => r.strategy && r.strategyId));

  const capped = scanAll({ defs: feasible, chain: chain4, uaKeys: ['1'], settings: s4, limit: 5 });
  check('سقف limit واقعاً رعایت می‌شود', capped.rows.length === 5, `${capped.rows.length}`);
  check('کل تعداد پیش از برش هم گزارش می‌شود، و کمتر از خودِ برش نیست',
    capped.total >= capped.rows.length, `کل ${capped.total} ، برش ${capped.rows.length}`);

  const by = s4.rankBy;
  const vals = capped.rows.map((r) => r[by]).filter(Number.isFinite);
  check('رتبه‌بندی نزولی روی کل ادغام‌شده از چند استراتژی حفظ می‌شود',
    vals.length > 1 && vals.every((v, i) => i === 0 || vals[i - 1] >= v), vals.join(' , '));

  check('نوار تشخیص هم روی کل جمع می‌زند', all.funnel.built >= single.funnel.built,
    `کل ${all.funnel.built} ، تک ${single.funnel.built}`);

  // ——— تجمیع، همان چیزی را بگوید که تک‌تک گفتند ———
  //
  // گزارش آزمون واقعی: «`scanAll.total=3288` در برابر `sum(scan.total)=4593`».
  // ریشه: هر `scan` ردیف‌هایش را در `topN` می‌بُرد و `scanAll` طولِ آرایهٔ
  // به‌هم‌چسبیدهٔ همان بریده‌ها را «کل» گزارش می‌کرد. یعنی پیام «از X ردیف»
  // در رابط، هرچه استراتژی بیشتر و topN کوچک‌تر، غلط‌تر می‌شد.
  //
  // topN عمداً کوچک است تا برش قطعاً اتفاق بیفتد؛ با topN بزرگ این باگ
  // اصلاً خودش را نشان نمی‌دهد.
  const sTight = { ...s4, topN: 3 };
  const perDef = feasible.map((def) => scanFn({ def, chain: chain4, uaKeys: ['1'], settings: sTight }));
  const merged = scanAll({ defs: feasible, chain: chain4, uaKeys: ['1'], settings: sTight, limit: 500 });
  const sumOf = (key) => perDef.reduce((a, r) => a + r.funnel[key], 0);
  const sumTotal = perDef.reduce((a, r) => a + r.total, 0);

  check('برش تک‌استراتژی واقعاً اتفاق افتاده — وگرنه این گروه چیزی را نمی‌سنجد',
    sumTotal > merged.rows.length, `کل ${sumTotal} ، پس از برش ${merged.rows.length}`);
  check('«کل» تجمیعی، جمع کلِ هر استراتژی است نه طول آرایهٔ بریده‌شده',
    merged.total === sumTotal, `${merged.total} در برابر ${sumTotal}`);
  for (const k of ['built', 'noQuote', 'refBasis', 'noDepth', 'filtered', 'kept', 'blockedExpiry', 'evaluated']) {
    check(`سطل «${k}» در تجمیع گم نمی‌شود`, merged.funnel[k] === sumOf(k),
      `${merged.funnel[k]} در برابر ${sumOf(k)}`);
  }
  // `evaluated` پیش از این در `FUNNEL_KEYS` نبود و همیشه صفر می‌ماند —
  // ادعای «هیچ ترکیبی ارزیابی نشد» در نمایی که هزاران‌تا ارزیابی کرده بود.
  check('شمار ارزیابی‌شده در نمای کلی صفر نمی‌ماند', merged.funnel.evaluated > 0,
    `${merged.funnel.evaluated}`);

  // سطلِ «سقف‌خورده» برداشته شد چون سقفی نمانده. آنچه جایش را می‌گیرد یک
  // ادعای قوی‌تر است: شمارِ ساخته‌شدهٔ هر استراتژی دقیقاً برابر شمارِ
  // ترکیب‌های ساختاریِ همان استراتژی روی همان نردبان است.
  check('هیچ سطلی به نام «سقف‌خورده» نمانده',
    perDef.every((r) => !('capped' in r.funnel)) && !('capped' in merged.funnel));
  check('و «ساخته‌شده» بریده نشده: جمعِ کل با جمعِ تک‌تک یکی است',
    merged.funnel.built === perDef.reduce((sum, r) => sum + r.funnel.built, 0),
    `${merged.funnel.built}`);
}
