// ۲۷۶. درستیِ نوار: تکرارِ دقیق، و یک مسیرِ مشترک برای ریزمعاملهٔ تاریخی
//
// این دسته دو بندِ ممیزیِ ۱۴۰۵/۰۶/۲۹ را قفل می‌کند:
//
//   بند ۲ — نوار زندهٔ واقعی رکورد تکراری داشت و خروجی دوباره می‌شمردش.
//   بند ۱ — سه مسیرِ ریزمعاملهٔ تاریخی یکسان نبودند؛ یکی داده را خالی
//           می‌گرفت در حالی که مسیر دیگر همان روز را کامل داشت.
//
// اعدادِ اینجا مشاهدهٔ واقعیِ زمانِ ممیزی‌اند، نه نمونهٔ ساختگی.

import { check, group, readSrc } from '../harness.mjs';
import { dedupeTrades, normalizeTrades, normalizeTradesDetailed } from '../../core/backtest.mjs';

group('۲۷۶. درستیِ نوار — تکرارِ دقیق');
{
  // ═══ بازسازیِ نمونهٔ اهرم / ۲۰۲۶۰۹۲۰ ═══
  //
  // نوار ۱٬۸۰۰ ردیف داشت و تابلو ۱٬۷۹۵ معامله. پنج شمارهٔ ۲۲۹ تا ۲۳۳
  // هرکدام **دوبار** آمده بودند، با ساعت، قیمت، حجم و پرچمِ یکسان؛ و
  // مجموع حجمِ همان پنج تکرار ۴٬۰۵۷ واحد بود، دقیقاً همان اختلافِ
  // ۶٬۶۶۴٬۴۸۶ با ۶٬۶۶۰٬۴۲۹.
  //
  // اینجا همان شکل با مقیاسِ کوچک بازسازی می‌شود: پنج ردیفِ تکراری با
  // حجم‌هایی که جمعشان ۴٬۰۵۷ است.
  const dupQuantities = [812, 811, 810, 812, 812];      // جمع = ۴٬۰۵۷
  const unique = [];
  for (let i = 1; i <= 1795; i += 1) {
    unique.push({
      nTran: i, hEven: 90000 + i, pTran: 1000 + (i % 7),
      qTitTran: i >= 229 && i <= 233 ? dupQuantities[i - 229] : 1,
      canceled: false,
    });
  }
  const duplicated = unique.filter((r) => r.nTran >= 229 && r.nTran <= 233).map((r) => ({ ...r }));
  const raw = [...unique, ...duplicated];

  const volume = (rows) => rows.reduce((sum, r) => sum + r.quantity, 0);
  const naive = raw.map((r) => ({ quantity: r.qTitTran }));

  check('نمونهٔ خام همان ۱٬۸۰۰ ردیف را دارد', raw.length === 1800);
  check('و جمعِ خامش ۴٬۰۵۷ واحد بیشتر از تابلو است',
    volume(naive) - volume(unique.map((r) => ({ quantity: r.qTitTran }))) === 4057);

  const tape = normalizeTradesDetailed(raw);
  // معیار پذیرشِ ۴ ممیزی: پس از حذفِ تکرارِ دقیق باید ۱٬۷۹۵ و همان حجم بماند.
  check('پس از حذف تکرارِ دقیق ۱٬۷۹۵ معامله می‌ماند', tape.rows.length === 1795);
  check('و حجم دقیقاً به عددِ تابلو برمی‌گردد',
    volume(tape.rows) === volume(unique.map((r) => ({ quantity: r.qTitTran }))));
  check('شمارِ تکرارِ انداخته‌شده گزارش می‌شود، نه بی‌صدا', tape.duplicates === 5);
  check('و خامِ پیش از حذف هم گفته می‌شود', tape.raw === 1800);
  check('تکرارِ دقیق تضاد نیست', tape.conflicts.length === 0);

  // ═══ آنچه **نباید** حذف شود ═══
  const conflicting = normalizeTradesDetailed([
    { nTran: 7, hEven: 100000, pTran: 500, qTitTran: 10 },
    { nTran: 7, hEven: 100000, pTran: 500, qTitTran: 99 },   // همان شماره، محتوای دیگر
  ]);
  check('دو ردیفِ هم‌شماره با محتوای متفاوت هر دو می‌مانند', conflicting.rows.length === 2);
  check('و تضادشان علامت می‌خورد، نه اینکه پنهان شود',
    conflicting.conflicts.length === 1 && conflicting.conflicts[0] === 7);

  // بالادست برای ردیفِ بی‌شماره صفر می‌فرستد؛ حذفِ هم‌شماره همهٔ آن‌ها را
  // به یکی می‌بُرد. پس شمارهٔ صفر نه حذف می‌شود نه تضاد می‌سازد.
  const noSequence = normalizeTradesDetailed([
    { hEven: 100000, pTran: 500, qTitTran: 10 },
    { hEven: 100001, pTran: 501, qTitTran: 11 },
    { hEven: 100002, pTran: 502, qTitTran: 12 },
  ]);
  check('ردیفِ بی‌شماره با ردیفِ بی‌شمارهٔ دیگر یکی شمرده نمی‌شود', noSequence.rows.length === 3);
  check('و شمارهٔ صفر تضاد نمی‌سازد', noSequence.conflicts.length === 0);

  // ابطال بخشی از هویتِ ردیف است: همان معامله با پرچمِ عوض‌شده، ردیفِ
  // دیگری است و نباید به‌عنوان تکرار خورده شود.
  const cancelPair = dedupeTrades([
    { sequence: 3, time: 100000, quantity: 5, price: 700, canceled: false, canceledKnown: true },
    { sequence: 3, time: 100000, quantity: 5, price: 700, canceled: true, canceledKnown: true },
  ]);
  check('اصلاحِ وضعیتِ ابطال تکرار شمرده نمی‌شود',
    cancelPair.rows.length === 2 && cancelPair.duplicates === 0 && cancelPair.conflicts[0] === 3);

  check('نرمال‌سازیِ ساده همان ردیف‌های یکتا را می‌دهد',
    normalizeTrades(raw).length === tape.rows.length);
}

group('۲۷۶. یک مسیرِ مشترک برای ریزمعاملهٔ تاریخی');
{
  const server = readSrc('../server/server.mjs');

  check('دریافت‌کنندهٔ مشترک وجود دارد',
    server.includes('async function fetchHistoricalTape(code, date'));
  // معیار پذیرشِ ۱ و ۳: هر سه مسیر باید یک جواب بدهند، پس هر سه باید از
  // یک تابع بگذرند. شمارشِ فراخوان‌ها همین را می‌گزد.
  const calls = (server.match(/fetchHistoricalTape\(/g) || []).length;
  check('و هر سه مسیر از همان می‌گذرند — دسته‌ای، تکی و hist', calls === 4);
  check('/api/trades دیگر مستقیم مسیر اول را نمی‌خواند',
    !server.includes('firstList(await get(historicalTradesPath(ins, date)'));
  check('/api/hist ریزمعامله را به دریافت‌کنندهٔ مشترک می‌سپارد',
    /if \(kind === 'trades'\) \{[\s\S]{0,160}fetchHistoricalTape\(code, date\)/.test(server));
  check('شاخهٔ مردهٔ ریزمعامله از شکل‌دهندهٔ تاریخی برداشته شد',
    !/function shapeHistorical[\s\S]{0,400}kind === 'trades'/.test(server));

  // نوار زنده هم باید از همان حذفِ تکرار بگذرد، وگرنه بند ۲ فقط نصفه
  // بسته می‌شود: خلاصهٔ نوار و شمع‌ساز هر دو روی همین ردیف‌ها می‌نشینند.
  // ادعا به **رفتار** پین است، نه به یک‌خطی‌بودنِ آن: پاسخِ خام حالا جدا
  // نگه داشته می‌شود تا شکلش هم گزارش شود، ولی همان یک مسیرِ حذفِ تکرار
  // سرِ جایش است.
  check('نوار زنده هم تکرارِ دقیق را می‌اندازد',
    /const raw = await getFresh\(`\/Trade\/GetTrade\/\$\{code\}`[\s\S]{0,120}normalizeTradesDetailed\(firstList\(raw\)\)/.test(server));
  check('و شمارِ تکرار را به مصرف‌کننده می‌گوید',
    server.includes('rows, duplicates, conflicts, summary: summarizeLiveTrades(rows)'));

  // ═══ معیار پذیرشِ ۱: وضعیتِ پوشش هم باید یکسان برسد ═══
  //
  // یکی‌شدنِ نتیجه کافی نیست؛ مصرف‌کننده باید بتواند «خالی پس از هر دو
  // مسیر» را از «معامله نشد» جدا کند، وگرنه نقطهٔ سنجشِ بک‌تست برای
  // ابزاری که داده‌اش نرسیده «معامله نشد» می‌نویسد.
  const backtest = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('بک‌تستِ سبد وضعیتِ پوشش را هم می‌خواند، نه فقط ردیف‌ها',
    backtest.includes('payload.emptyBoth === true'));
  check('و آن را «تأییدنشده» می‌خواند، نه «بی‌معامله»',
    backtest.includes('این «بی‌معامله» نیست، «تأییدنشده» است'));
  check('خطا و خالیِ هر دو مسیر جدا شمرده می‌شوند',
    backtest.includes('let failed = 0, emptyBoth = 0;')
      && backtest.includes('return { tape, failed, emptyBoth, total: codes.length };'));
}
