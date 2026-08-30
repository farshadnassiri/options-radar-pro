// ۲۰۰. سبد فرضی — قرارداد شکسته نمی‌شود، پول گم نمی‌شود

import { check, group, near } from '../harness.mjs';
import { ALLOCATION_REASONS, allocatePortfolio, unionCalendar } from '../../core/portfolio-allocation.mjs';
import { analyzePortfolio } from '../../core/portfolio-report.mjs';
import { buildPnlMatrix } from '../../core/portfolio-matrix.mjs';

group('۲۰۰. سبد فرضی');
{
  const entry200 = {
    marginGross: 1000, netCash: 0, marginNet: 1000, capital: 1000, notional: 5000,
    legValue: 100, legValueComplete: true,
  };
  const combo200 = (id, strategyId, pnls, entry = entry200) => ({
    id, strategyId, strategyName: `استراتژی ${strategyId}`,
    groupId: 'g', groupName: 'دسته', feasible: true, entry,
    path: { daily: pnls.map((value, index) => (value === null ? null : { date: 20260801 + index, netPnl: value })).filter(Boolean) },
  });
  const analysisOf = (rows) => {
    const matrix = buildPnlMatrix(rows);
    matrix.baseSeries = rows[0].path.daily.map(() => 0);
    return analyzePortfolio({ rows, matrix });
  };

  const rows200 = [combo200('a', 'A', [10, 20, 30]), combo200('b', 'B', [-5, -5, 50])];
  const an200 = analysisOf(rows200);
  const out200 = allocatePortfolio({
    capitalRial: 100000, analysis: an200,
    picks: [{ strategyId: 'A', comboId: 'a', pct: 30 }, { strategyId: 'B', comboId: 'b', pct: 50 }],
  });

  check('تخصیص با درصدهای معتبر انجام می‌شود', out200.ok === true, out200.why);
  check('تعداد دست از تقسیم صحیح سهم بر بهای هر دست می‌آید',
    out200.legs[0].lots === 30 && out200.legs[1].lots === 50,
    JSON.stringify(out200.legs.map((leg) => leg.lots)));
  check('پول به‌کاررفته و پول نقدِ مانده روی هم سرمایهٔ اول دوره‌اند',
    out200.deployedRial + out200.idleRial === out200.capitalRial,
    `${out200.deployedRial} + ${out200.idleRial}`);
  check('درصد تخصیص‌نیافته به‌عنوان نقد می‌ماند، نه اینکه ناپدید شود',
    out200.idleRial === 20000, String(out200.idleRial));

  // ── مسیر سبد ───────────────────────────────────────────────────────
  check('سود هر روز، جمع وزنی سود اجزا در همان روز است',
    out200.path[2].totalPnlRial === 3400, String(out200.path[2].totalPnlRial));
  check('بازده سبد روی سرمایهٔ اول دورهٔ خودِ کاربر حساب می‌شود',
    near(out200.path[2].returnPct, 3.4, 1e-9), String(out200.path[2].returnPct));
  check('ارزش سبد، سرمایه به‌علاوهٔ سود است',
    out200.path[2].equityRial === 103400, String(out200.path[2].equityRial));

  // ── سهم هر جزء ─────────────────────────────────────────────────────
  check('بازده هر جزء روی پول درگیرِ خودش حساب می‌شود',
    out200.contributions[0].returnPct === 3 && out200.contributions[1].returnPct === 5);
  check('سهم هر جزء از سود کل، روی هم صد می‌شود',
    near(out200.contributions.reduce((sum, row) => sum + row.sharePct, 0), 100, 1e-9),
    String(out200.contributions.reduce((sum, row) => sum + row.sharePct, 0)));

  // ── قرارداد شکسته نمی‌شود ──────────────────────────────────────────
  const tiny200 = allocatePortfolio({
    capitalRial: 1000, analysis: an200, picks: [{ comboId: 'a', pct: 50 }],
  });
  check('سهمی که به یک دست نمی‌رسد، کسری تخصیص نمی‌گیرد',
    tiny200.legs[0].lots === 0 && tiny200.legs[0].why === ALLOCATION_REASONS.tooExpensive);
  check('سهم تأمین‌نشده، همهٔ پولش نقد می‌ماند',
    tiny200.legs[0].idleRial === 500 && tiny200.ok === false);
  const rounding200 = allocatePortfolio({
    capitalRial: 10000, analysis: an200, picks: [{ comboId: 'a', pct: 35 }],
  });
  check('باقی‌ماندهٔ گردکردن، نقد ثبت می‌شود نه دستِ کسری',
    rounding200.legs[0].lots === 3 && rounding200.legs[0].idleRial === 500,
    JSON.stringify([rounding200.legs[0].lots, rounding200.legs[0].idleRial]));

  // ── نبود داده، ارزش سبد را نامعلوم می‌کند ─────────────────────────
  const holed200 = analysisOf([combo200('a', 'A', [10, 20, 30]), combo200('c', 'C', [7, null, 9])]);
  const gap200 = allocatePortfolio({
    capitalRial: 100000, analysis: holed200,
    picks: [{ comboId: 'a', pct: 30 }, { comboId: 'c', pct: 30 }],
  });
  check('روزی که یک جزء قیمت ندارد، ارزش کل سبد نامعلوم می‌ماند',
    gap200.path[1].totalPnlRial === null && gap200.path[1].equityRial === null);
  check('سود شناخته‌شدهٔ همان روز جدا گزارش می‌شود',
    gap200.path[1].knownPnlRial === 600, String(gap200.path[1].knownPnlRial));
  check('شناسهٔ جزء بی‌داده نام برده می‌شود',
    JSON.stringify(gap200.path[1].unknown) === JSON.stringify(['c']));
  check('شمار روزهای معلوم و کل، جدا گزارش می‌شود',
    gap200.summary.knownDays === 2 && gap200.summary.totalDays === 3);

  // ── افت سبد ────────────────────────────────────────────────────────
  const sink200 = analysisOf([combo200('d', 'D', [50, -100, -20])]);
  const dd200 = allocatePortfolio({ capitalRial: 10000, analysis: sink200, picks: [{ comboId: 'd', pct: 100 }] });
  check('افت سبد از سقفِ ارزش شمرده می‌شود، نه از سرمایهٔ اول',
    dd200.summary.maxDrawdownRial === -1500, String(dd200.summary.maxDrawdownRial));
  check('نخستین روز سود سبد ثبت می‌شود', dd200.summary.firstProfitIndex === 0);

  // ── ورودی نامعتبر ──────────────────────────────────────────────────
  check('سرمایهٔ ثبت‌نشده، تخصیص نمی‌سازد',
    allocatePortfolio({ capitalRial: null, analysis: an200, picks: [{ comboId: 'a', pct: 50 }] }).why === ALLOCATION_REASONS.noCapital);
  for (const [label, value] of [['رشتهٔ خالی', ''], ['بولین', true], ['صفر', 0]]) {
    check(`سرمایهٔ ${label} پذیرفته نمی‌شود`,
      allocatePortfolio({ capitalRial: value, analysis: an200, picks: [{ comboId: 'a', pct: 50 }] }).ok === false, label);
  }
  check('مجموع درصدهای بیش از صد رد می‌شود',
    allocatePortfolio({
      capitalRial: 100000, analysis: an200,
      picks: [{ comboId: 'a', pct: 60 }, { comboId: 'b', pct: 60 }],
    }).why === ALLOCATION_REASONS.overAllocated);
  check('مجموع دقیقاً صد پذیرفته می‌شود',
    allocatePortfolio({
      capitalRial: 100000, analysis: an200,
      picks: [{ comboId: 'a', pct: 50 }, { comboId: 'b', pct: 50 }],
    }).ok === true);
  check('ترکیب ناموجود، دلیلش گفته می‌شود',
    allocatePortfolio({ capitalRial: 100000, analysis: an200, picks: [{ comboId: 'ندارد', pct: 50 }] })
      .legs[0].why === ALLOCATION_REASONS.comboMissing);
  check('بدون انتخاب، تخصیص ساخته نمی‌شود',
    allocatePortfolio({ capitalRial: 100000, analysis: an200, picks: [] }).why === ALLOCATION_REASONS.noPicks);
  check('درصد صفر یا منفی انتخاب شمرده نمی‌شود',
    allocatePortfolio({ capitalRial: 100000, analysis: an200, picks: [{ comboId: 'a', pct: 0 }] }).why === ALLOCATION_REASONS.noPicks);
}

// ═══ سبد چندنمادی ═══
group('۲۰۰-ب. سبد از چند نماد');
{
  const entry200b = {
    marginGross: 1000, netCash: 0, marginNet: 1000, capital: 1000, notional: 5000,
    legValue: 100, legValueComplete: true,
  };
  const combo200b = (id, strategyId, pnls, dates) => ({
    id, strategyId, strategyName: `استراتژی ${strategyId}`,
    groupId: 'g', groupName: 'دسته', feasible: true, entry: entry200b,
    path: { daily: pnls.map((value, index) => ({ date: dates[index], netPnl: value })) },
  });
  const build200b = (rows) => {
    const matrix = buildPnlMatrix(rows);
    matrix.baseSeries = matrix.dates.map(() => 0);
    return analyzePortfolio({ rows, matrix });
  };
  // دو نماد با تقویم‌های ناهم‌پوشان: نماد دوم روز اول را ندارد و نماد اول
  // روز چهارم را. اشتراک‌گرفتن، هر دو را حذف می‌کرد و مسیر را کوتاه و صاف
  // نشان می‌داد.
  const alpha200 = build200b([combo200b('a', 'A', [10, 20, 30], [20260801, 20260802, 20260803])]);
  const beta200 = build200b([combo200b('b', 'B', [5, 5, 5], [20260802, 20260803, 20260804])]);
  const sources200 = [
    { id: 'alpha', label: 'نماد الف', analysis: alpha200 },
    { id: 'beta', label: 'نماد ب', analysis: beta200 },
  ];

  check('تقویم مشترک، اجتماع روزهاست نه اشتراکشان',
    JSON.stringify(unionCalendar(sources200)) === JSON.stringify([20260801, 20260802, 20260803, 20260804]),
    JSON.stringify(unionCalendar(sources200)));

  const multi200 = allocatePortfolio({
    capitalRial: 100000, sources: sources200,
    picks: [
      { sourceId: 'alpha', comboId: 'a', pct: 30 },
      { sourceId: 'beta', comboId: 'b', pct: 50 },
    ],
  });
  check('هر دو نماد در یک سبد تأمین می‌شوند', multi200.ok && multi200.funded === 2, multi200.why);
  check('برچسب اجرا روی هر جزء می‌ماند',
    multi200.legs[0].sourceLabel === 'نماد الف' && multi200.legs[1].sourceLabel === 'نماد ب');
  check('مسیر سبد روی تقویم مشترک ساخته می‌شود', multi200.path.length === 4, String(multi200.path.length));
  // دسترسی امن: ادعایی که زیر جهش می‌ترکد، کل اجرای آزمون را می‌کشد و
  // به‌جای یک ردِ خوانا، یک ردیف خطا می‌دهد.
  const at200 = (index, key) => multi200.path[index]?.[key] ?? null;
  check('روزی که یک نماد مشاهده ندارد، ارزش کل نامعلوم می‌ماند',
    at200(0, 'totalPnlRial') === null && at200(3, 'totalPnlRial') === null && multi200.path.length === 4,
    JSON.stringify(multi200.path.map((row) => row.totalPnlRial)));
  check('سود شناخته‌شدهٔ همان روز جدا گزارش می‌شود',
    at200(0, 'knownPnlRial') === 300, String(at200(0, 'knownPnlRial')));
  check('جزء بی‌داده نام برده می‌شود',
    JSON.stringify(at200(0, 'unknown')) === JSON.stringify(['b'])
    && JSON.stringify(at200(3, 'unknown')) === JSON.stringify(['a']),
    JSON.stringify([at200(0, 'unknown'), at200(3, 'unknown')]));
  check('روزهای مشترک، ارزش کامل می‌گیرند',
    at200(1, 'totalPnlRial') === 850 && at200(2, 'totalPnlRial') === 1150,
    JSON.stringify([at200(1, 'totalPnlRial'), at200(2, 'totalPnlRial')]));
  check('فهرست اجراها در خروجی می‌آید',
    multi200.sources.length === 2 && multi200.sources[0].label === 'نماد الف');
  check('سهم با اجرای ناموجود، دلیلش گفته می‌شود',
    allocatePortfolio({
      capitalRial: 100000, sources: sources200,
      picks: [{ sourceId: 'ندارد', comboId: 'a', pct: 30 }],
    }).legs[0].why === ALLOCATION_REASONS.sourceMissing);
  check('ترکیبِ نمادِ دیگر، در این اجرا پیدا نمی‌شود',
    allocatePortfolio({
      capitalRial: 100000, sources: sources200,
      picks: [{ sourceId: 'alpha', comboId: 'b', pct: 30 }],
    }).legs[0].why === ALLOCATION_REASONS.comboMissing);

  // رفتار تک‌اجرایی نباید عوض شده باشد.
  check('سبد تک‌نمادی مثل قبل کار می‌کند',
    allocatePortfolio({ capitalRial: 100000, analysis: alpha200, picks: [{ comboId: 'a', pct: 30 }] }).funded === 1);
  check('تقویم تک‌اجرا همان تقویم خودش می‌ماند',
    allocatePortfolio({ capitalRial: 100000, analysis: alpha200, picks: [{ comboId: 'a', pct: 30 }] }).path.length === 3);
}

// ۲۰۰-ج. سبد به «قرارداد» می‌شمارد، نه به بستهٔ N‌تایی
//
// نقصی که این دسته را ساخت: «تعداد واحد» تب راه‌اندازی، دانه‌بندی سبد را
// تعیین می‌کرد. در یک اجرای واقعی با تعداد واحد ۳۰۰، بودجهٔ ۴ میلیاردی
// تنها سه بستهٔ ۳۰۰تایی خرید و ۸۷۱ میلیون بی‌کار ماند؛ یک جزء با بودجهٔ
// ۲ میلیارد اصلاً تأمین نشد چون یک بسته ۵٫۹ میلیارد بود. سبد فرضی باید
// فقط از مبلغی که کاربر می‌دهد کار کند.

import { strategyMargin } from '../../core/margin.mjs';
import { readSrc as readSrc200 } from '../harness.mjs';

group('۲۰۰-ج. شمارش به قرارداد');
{
  const series200c = { ok: true, finalIndex: 1, finalPnl: 1000, pnl: [0, 1000] };
  const packed = (units) => ({
    dates: [20260801, 20260802], basisId: 'gross',
    combos: [{
      id: 'ج', strategyId: 's', strategyName: 'آزمایشی', groupId: 'g', groupName: 'خانواده',
      series: series200c,
      // مخرج، بهای همان تعداد واحدِ اجراست: هر قرارداد یک میلیون.
      entry: { marginGross: 1_000_000 * units, netCash: 0, units },
    }],
  });

  const one = allocatePortfolio({ capitalRial: 10_000_000, analysis: packed(1), picks: [{ comboId: 'ج', pct: 100 }] });
  const many = allocatePortfolio({ capitalRial: 10_000_000, analysis: packed(300), picks: [{ comboId: 'ج', pct: 100 }] });
  check('با تعداد واحد ۱، ده قرارداد خریده می‌شود', one.legs[0].contracts === 10, String(one.legs[0].contracts));
  check('تعداد واحدِ تب راه‌اندازی، شمارش سبد را عوض نمی‌کند',
    many.legs[0].contracts === 10, String(many.legs[0].contracts));
  check('پول درگیر با تعداد واحد عوض نمی‌شود',
    one.legs[0].deployedRial === many.legs[0].deployedRial && many.legs[0].deployedRial === 10_000_000,
    `${one.legs[0].deployedRial} / ${many.legs[0].deployedRial}`);
  check('نقد بی‌کار با تعداد واحد بزرگ زیاد نمی‌شود',
    many.legs[0].idleRial === 0, String(many.legs[0].idleRial));
  check('بهای گزارش‌شده، بهای یک قرارداد است نه یک بسته',
    many.legs[0].unitCostRial === 1_000_000 && many.legs[0].packCostRial === 300_000_000,
    `${many.legs[0].unitCostRial} / ${many.legs[0].packCostRial}`);
  // سری بر ۳۰۰ واحد بسته شده؛ ۱۰ قرارداد یعنی یک‌سی‌ام آن.
  check('سود و زیان با نسبت قرارداد به تعداد واحد مقیاس می‌خورد',
    Math.abs(many.legs[0].finalPnlRial - 1000 * (10 / 300)) < 1e-9, String(many.legs[0].finalPnlRial));
  check('با تعداد واحد ۱، سود همان ضریب قرارداد است',
    one.legs[0].finalPnlRial === 10_000, String(one.legs[0].finalPnlRial));

  // همان چیزی که در فایل کاربر دیده شد: بسته گران‌تر از کل بودجه.
  const wide = allocatePortfolio({
    capitalRial: 2_000_000_000, analysis: packed(300),
    picks: [{ comboId: 'ج', pct: 100 }],
  });
  check('بستهٔ گران‌تر از بودجه، دیگر جزء را بی‌تأمین نمی‌گذارد',
    wide.legs[0].ok === true && wide.legs[0].contracts === 2000, String(wide.legs[0].contracts));

  // قرارداد شکسته نمی‌شود؛ باقی‌مانده نقد می‌ماند.
  const odd = allocatePortfolio({ capitalRial: 2_500_000, analysis: packed(300), picks: [{ comboId: 'ج', pct: 100 }] });
  check('قرارداد شکسته نمی‌شود و باقی‌مانده نقد می‌ماند',
    odd.legs[0].contracts === 2 && odd.legs[0].idleRial === 500_000,
    `${odd.legs[0].contracts} قرارداد · ${odd.legs[0].idleRial} نقد`);
  const broke = allocatePortfolio({ capitalRial: 900_000, analysis: packed(300), picks: [{ comboId: 'ج', pct: 100 }] });
  check('سهمی که یک قرارداد هم نمی‌خرد، صریح بی‌تأمین می‌ماند',
    broke.legs[0].ok === false && broke.legs[0].contracts === 0);

  // تقسیم بر تعداد، تنها وقتی درست است که وجه تضمین خطیِ تعداد باشد.
  // این ادعا همان فرض را روی خودِ موتور وجه تضمین می‌سنجد.
  const legsOf = (k) => [
    { kind: 'put', side: 'sell', strike: 9000, size: 1000, ratio: 1 * k, price: 300 },
    { kind: 'call', side: 'sell', strike: 11000, size: 1000, ratio: 1 * k, price: 250 },
    { kind: 'put', side: 'buy', strike: 8000, size: 1000, ratio: 2 * k, price: 90 },
  ];
  const perUnit = [1, 3, 5, 7, 13, 300]
    .map((k) => strategyMargin(legsOf(k), { S: 10000, contractSize: 1000 }).margin / k);
  check('وجه تضمین دقیقاً خطیِ تعداد است — فرضِ تقسیم بر تعداد',
    perUnit.every((value) => Math.abs(value - perUnit[0]) < 1e-9), perUnit.join('، '));

  // نبودِ `units` یعنی اجراهای قدیمی؛ رفتار پیشین باید بماند.
  const legacy = { dates: [20260801, 20260802], basisId: 'gross',
    combos: [{ id: 'ج', strategyId: 's', strategyName: 'آزمایشی', series: series200c,
      entry: { marginGross: 1_000_000, netCash: 0 } }] };
  check('اجرای بدون تعداد واحد، مثل تعداد واحد ۱ رفتار می‌کند',
    allocatePortfolio({ capitalRial: 10_000_000, analysis: legacy, picks: [{ comboId: 'ج', pct: 100 }] })
      .legs[0].contracts === 10);

  // بی این عدد روی سطر، `entry.units` همیشه `undefined` است و تقسیم بر
  // تعداد بی‌صدا از کار می‌افتد — سبد به بستهٔ N‌تایی برمی‌گردد بی‌آنکه
  // هیچ ادعایی قرمز شود.
  const worker200 = readSrc200('../worker/history-worker.mjs');
  check('کارگر، تعداد واحدِ هر سطر را همراه مخرج می‌فرستد',
    /units: Number\.isFinite\(m\.units\) && m\.units > 0 \? m\.units : 1,/.test(worker200));
}