// ۱۴۱. ارزش و سود در تب

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import { portfolioSessionValuation } from '../../core/portfolio-valuation.mjs';
import { portfolioSessionPositionsView } from '../../ui/portfolio-positions-view.mjs';

group('۱۴۱. ارزش و سود در تب');
{
  const fx141 = portfolioFixture('valuation-ui-141');
  const roomy141 = JSON.parse(JSON.stringify(fx141.baseSession));
  roomy141.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session141 = {
    ...roomy141,
    lockedMission: fx141.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const done141 = commitPortfolioPlan(session141, fx141.evidence,
    portfolioRankedPlans(session141, fx141.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done141.ok, done141.why);
  const val141 = portfolioSessionValuation(done141.session, fx141.evidence);
  const view141 = portfolioSessionPositionsView(done141.session, val141);
  const row141 = view141.rows[0] || {};

  // ── بند ۱: ارزش و سود، فارسی و تومان ────────────────────────────────
  check('ارزش جاری و سود هر دو ستون خودشان را دارند',
    row141.hasValuation === true && row141.valueTomanText !== '—'
    && row141.unrealizedTomanText !== '—');
  const shown141 = [row141.valueTomanText, row141.unrealizedTomanText,
    view141.valuationText];
  check('هیچ رقم لاتینی در این ستون‌ها نیست',
    shown141.every((value) => !/[0-9]/.test(value)), shown141.join(' | '));
  check('واحد تومان است و ده برابر کوچک‌تر از ریال',
    Number(row141.valueTomanText.replace(/٬/g, '')
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)))
      === val141.rows[0].valueRial / 10, row141.valueTomanText);

  // ── بند ۲: منفی از مثبت جدا ─────────────────────────────────────────
  // خرید روی ask و ارزش‌گذاری روی bid: این موقعیت از لحظهٔ اول در زیان
  // است. عددِ بی‌علامت وسط ستون یعنی کاربر باید دنبال منفی بگردد.
  check('پیش‌شرط: این موقعیت در زیان است',
    val141.rows[0].unrealizedRial < 0, `${val141.rows[0].unrealizedRial}`);
  check('سود منفی نشانِ «زیان» می‌گیرد',
    row141.unrealizedTone === 'loss' && row141.unrealizedTomanText.startsWith('−'),
    `${row141.unrealizedTone} | ${row141.unrealizedTomanText}`);
  const gain141 = JSON.parse(JSON.stringify(val141));
  gain141.rows[0].unrealizedRial = 123_456;
  gain141.totals.unrealizedRial = 123_456;
  const gainRow141 = portfolioSessionPositionsView(done141.session, gain141).rows[0];
  check('و سود مثبت نشانِ «سود»',
    gainRow141.unrealizedTone === 'gain'
    && !gainRow141.unrealizedTomanText.startsWith('−'),
    `${gainRow141.unrealizedTone} | ${gainRow141.unrealizedTomanText}`);

  // ── بند ۳: موقعیتِ بی‌ارزش، علتش را می‌گوید ─────────────────────────
  const rejected141 = JSON.parse(JSON.stringify(fx141.evidence));
  for (const r of rejected141.rows) if (r.side === 'sell') r.accepted = false;
  const blindVal141 = portfolioSessionValuation(done141.session, rejected141);
  const blindView141 = portfolioSessionPositionsView(done141.session, blindVal141);
  const blindRow141 = blindView141.rows[0] || {};
  check('موقعیتی که ارزش ندارد، «—»ی خالی نمی‌گیرد',
    blindRow141.valueTomanText === '—' && blindRow141.valuedWhy.length > 0
    && !/[0-9]/.test(blindRow141.valuedWhy), blindRow141.valuedWhy);
  check('و صفر هم نمی‌گیرد',
    blindRow141.unrealizedTomanText === '—' && blindRow141.unrealizedTone === '');
  check('ولی بقیهٔ ردیف سالم می‌ماند',
    blindRow141.statusLabel === 'باز' && blindRow141.openQtyText === '۴۰'
    && blindRow141.legTexts.length > 0);

  // ── بند ۶: نبودِ ارزش‌گذاری جدول را نمی‌شکند ────────────────────────
  const plain141 = portfolioSessionPositionsView(done141.session);
  check('بدون ارزش‌گذاری، جدول همان جدول قبلی است',
    plain141.ok && plain141.rows[0].hasValuation === false
    && plain141.rows[0].valueTomanText === '—'
    && plain141.rows[0].legTexts.length > 0, plain141.why);
  // «ارزش‌گذاری انجام نشد» و «انجام شد ولی این موقعیت ارزش ندارد» دو
  // چیزند: اولی ستون را ساکت می‌گذارد، دومی علت دارد.
  check('و «انجام نشد» با «ارزش ندارد» یکی نمی‌شود',
    plain141.rows[0].valuedWhy === '' && blindRow141.valuedWhy !== '');
  const stale141 = JSON.parse(JSON.stringify(fx141.evidence));
  stale141.now = { date: fx141.at.date, second: fx141.at.second + 60 };
  const staleView141 = portfolioSessionPositionsView(done141.session,
    portfolioSessionValuation(done141.session, stale141));
  check('مدرکِ کهنه جدول را نمی‌شکند و علتش بالای جدول می‌آید',
    staleView141.ok && staleView141.rows[0].legTexts.length > 0
    && staleView141.valuationWhy.length > 0 && staleView141.valuationText === '',
    staleView141.valuationWhy);

  // ── بند ۴: جمعِ کل فقط وقتی کامل است ────────────────────────────────
  check('جمعِ کل کامل، ارزش و سود را با هم می‌گوید',
    view141.valuationText.includes('ارزش جاری')
    && view141.valuationText.includes('سود تحقق‌نیافته')
    && view141.valuationTone === 'loss' && view141.valuationWhy === '');
  check('جمعِ ناقص ساخته نمی‌شود',
    blindView141.valuationText === '' && blindView141.valuationTone === '');
  check('و به‌جایش می‌گوید چند موقعیت معلوم نشد',
    blindView141.valuationWhy.includes('ارزش‌گذاری نشد')
    && blindView141.valuationWhy.includes('۱')
    && !/[0-9]/.test(blindView141.valuationWhy), blindView141.valuationWhy);
  const closed141 = closePortfolioPosition(done141.session, fx141.evidence, done141.positionId);
  const closedView141 = portfolioSessionPositionsView(closed141.session,
    portfolioSessionValuation(closed141.session, fx141.evidence));
  check('جلسه‌ای بدون موقعیتِ باز، جمعِ صفرِ ساختگی نمی‌سازد',
    closedView141.valuationText === '' && closedView141.valuationWhy === ''
    && closedView141.rows[0].valueTomanText === '—', closedView141.valuationWhy);

  // ── بند ۵: تنها تقسیم بر ده ─────────────────────────────────────────
  const viewCode141 = readSrc('../ui/portfolio-positions-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const rialMath141 = viewCode141.match(/Rial[A-Za-z]*\s*[*+\-]/g) || [];
  const rialDiv141 = (viewCode141.match(/Rial[A-Za-z]*\s*\/\s*[0-9]+/g) || [])
    .filter((hit) => !/\/\s*10$/.test(hit));
  check('لایهٔ نمایش روی عدد ریالی جز تقسیم بر ده حساب نمی‌کند',
    rialMath141.length === 0 && rialDiv141.length === 0,
    [...rialMath141, ...rialDiv141].join(' ،') || 'هیچ');
  check('و خودش ارزش‌گذاری نمی‌کند — فقط نتیجه را قالب می‌دهد',
    !/portfolioSessionValuation|grossCash|entryFees/.test(viewCode141));
  check('نشانِ سود و زیان از همان کمکیِ مشترک می‌آید، نه قاعدهٔ تازه',
    /signTone/.test(viewCode141) && !/>=\s*0\s*\?\s*'gain'/.test(viewCode141));

  // ── اتصال به تب ─────────────────────────────────────────────────────
  const tabSrc141 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب ارزش‌گذاری را صدا می‌زند و به مدل نمایش می‌دهد',
    /portfolioSessionValuation\(session, portfolioSessionEligibility\(session\)\)/
      .test(tabSrc141)
    && /portfolioSessionPositionsView\(session, valuation\)/.test(tabSrc141));
  check('دو ستون تازه در سرستون هستند',
    tabSrc141.includes('<th>ارزش جاری (تومان)</th>')
    && tabSrc141.includes('<th>سود تحقق‌نیافته (تومان)</th>')
    && tabSrc141.includes('data-label="سود تحقق‌نیافته"'));
  check('نشانِ سود و زیان روی خانه می‌نشیند',
    /class="\$\{esc\(row\.unrealizedTone\)\}"/.test(tabSrc141));
  check('جمعِ کل جای خودش را دارد و یکتاست',
    (tabSrc141.match(/id="pt-positions-total"/g) || []).length === 1);
  check('تب هیچ عدد مالی تازه‌ای برای این ستون‌ها حساب نمی‌کند',
    !/\/\s*10|unrealizedRial\s*[*+\-]/
      .test(tabSrc141.slice(tabSrc141.indexOf('function paintPositions'),
        tabSrc141.indexOf('function paintProposals'))));

  const cssSrc141 = readSrc('../ui/style.css');
  const widths141 = [...cssSrc141.matchAll(
    /\.pt-positions-table th:nth-child\((\d+)\)[^{]*\{\s*width:\s*(\d+)%/g)]
    .map((hit) => ({ col: Number(hit[1]), pct: Number(hit[2]) }));
  const grouped141 = [...cssSrc141.matchAll(
    /((?:\.pt-positions-table th:nth-child\(\d+\),?\s*)+)\{\s*width:\s*(\d+)%/g)]
    .flatMap((hit) => [...hit[1].matchAll(/nth-child\((\d+)\)/g)]
      .map((c) => ({ col: Number(c[1]), pct: Number(hit[2]) })));
  const byCol141 = new Map([...widths141, ...grouped141].map((r) => [r.col, r.pct]));
  const totalPct141 = [...byCol141.values()].reduce((a, b) => a + b, 0);
  check('جدول نُه‌ستونه ظرف اسکرول خودش را دارد',
    /<div class="pt-table-scroll">\s*<table class="pt-positions-table">/
      .test(tabSrc141)
    && /\.pt-table-scroll \{[^}]*overflow-x: auto/.test(cssSrc141));
  check('جمع عرض ستون‌های جدول موقعیت از صد درصد بیشتر نیست',
    totalPct141 <= 100 && byCol141.size >= 9,
    `${totalPct141}٪ روی ${byCol141.size} ستون`);
  check('رنگ سود و زیان از توکن‌های موجود می‌آید، نه رنگ سخت‌کدشده',
    /\.pt-positions-table td\.loss \{ color: var\(--loss\)/.test(cssSrc141)
    && /\.pt-positions-total\.gain \{ color: var\(--gain\)/.test(cssSrc141));
}
