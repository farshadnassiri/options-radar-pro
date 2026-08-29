// ۱۳۶. موقعیت‌های جلسه در تب

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioSessionPositions } from '../../core/portfolio-positions.mjs';
import { portfolioSessionPositionsView } from '../../ui/portfolio-positions-view.mjs';

group('۱۳۶. موقعیت‌های جلسه در تب');
{
  const fx136 = portfolioFixture('positions-view-136');
  const roomy136 = JSON.parse(JSON.stringify(fx136.baseSession));
  roomy136.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session136 = {
    ...roomy136,
    lockedMission: fx136.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  // ── بند ۶: جلسهٔ بدون موقعیت ────────────────────────────────────────
  const empty136 = portfolioSessionPositionsView(session136);
  check('جلسهٔ بدون موقعیت، جواب می‌گیرد نه خطا',
    empty136.ok && empty136.empty === true && empty136.rows.length === 0, empty136.why);
  check('و جمله می‌گوید چه خبر است، نه جدول خالی',
    empty136.note.includes('هیچ موقعیتی') && !/[0-9]/.test(empty136.note), empty136.note);
  check('جلسهٔ نبوده، علت خودش را دارد',
    portfolioSessionPositionsView(null).reason === 'noSession'
    && portfolioSessionPositionsView(null).rows.length === 0);

  // ── پیش‌شرط ─────────────────────────────────────────────────────────
  const plans136 = portfolioRankedPlans(session136, fx136.evidence);
  const topId136 = plans136.ranking.ranked[0].candidateId;
  const done136 = commitPortfolioPlan(session136, fx136.evidence, topId136);
  check('پیش‌شرط: یک طرح ثبت شد', done136.ok, done136.why);
  const view136 = portfolioSessionPositionsView(done136.session);
  const row136 = view136.rows[0] || {};
  const state136 = portfolioSessionPositions(done136.session);
  const doc136 = done136.event.data;

  // ── بند ۲: هیچ عدد مالی تازه‌ای ─────────────────────────────────────
  const code136 = readSrc('../ui/portfolio-positions-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const rialMath136 = code136.match(/Rial[A-Za-z]*\s*[*+\-]/g) || [];
  const rialDiv136 = (code136.match(/Rial[A-Za-z]*\s*\/\s*[0-9]+/g) || [])
    .filter((hit) => !/\/\s*10$/.test(hit));
  check('لایهٔ نمایش روی عدد ریالی جز تقسیم بر ده حساب نمی‌کند',
    rialMath136.length === 0 && rialDiv136.length === 0,
    [...rialMath136, ...rialDiv136].join(' ،') || 'هیچ');
  check('و موتور را برای ساختن عدد صدا نمی‌زند',
    !/analyzePayoff|walkBook|portfolioCapitalRequirement|replayPortfolioSession/
      .test(code136));
  check('سرمایهٔ نمایش‌داده‌شده ده برابر کوچک‌تر از ریالِ سند است',
    Number(row136.capitalTomanText.replace(/٬/g, '')
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)))
      === doc136.capitalRial / 10, row136.capitalTomanText);

  // ── بند ۱: پاها، خوانا و کامل ───────────────────────────────────────
  check('هر پا یک ردیف دارد، به تعداد پاهای سند',
    row136.legTexts.length === doc136.legs.length && row136.legTexts.length > 0);
  const leg136 = row136.legTexts[0];
  check('عبارت پا سمت و نوع قرارداد را جدا می‌گوید',
    /^(خرید|فروش) (اختیار خرید|اختیار فروش) ·/.test(leg136), leg136);
  check('و اعمال و سررسید و حجم و قیمت ورود را دارد',
    leg136.includes('اعمال') && leg136.includes('سررسید')
    && leg136.includes('قرارداد') && leg136.includes('تومان'), leg136);
  // «اختیار خرید» نوع قرارداد است و «خرید» سمت معامله؛ اگر یکی شوند ردیف
  // بی‌معنی می‌شود.
  check('واژه‌های نوع قرارداد همان‌اند که بقیهٔ رابط به کار می‌برد',
    /اختیار خرید|اختیار فروش/.test(code136) && !/'کال'|'پوت'/.test(code136));
  check('حجم و وضعیت از حالت موتور می‌آیند',
    row136.openQtyText === '۴۰' && row136.statusLabel === 'باز'
    && row136.status === state136.positions[0].status);

  // ── رقم فارسی ───────────────────────────────────────────────────────
  // `id`، `status` و `defLabel`ِ برگرفته از شناسه، متنِ نمایشی محسوب
  // نمی‌شوند وقتی خودشان شناسه‌اند. `idText` عمداً شناسه است ولی به چشم
  // کاربر می‌رسد، پس رقم‌هایش فارسی شده‌اند.
  const IDS_136 = new Set(['id', 'status']);
  const shown136 = [
    ...Object.entries(row136).filter(([k, v]) => typeof v === 'string' && !IDS_136.has(k)),
    ...(row136.legTexts || []).map((t) => ['leg', t]),
    ['counts', view136.countsText],
  ].map(([, v]) => v);
  check('هیچ رقم لاتینی در متن نمایشی نیست',
    shown136.every((value) => !/[0-9]/.test(value)),
    shown136.filter((v) => /[0-9]/.test(v)).slice(0, 3).join(' | ') || 'هیچ');
  check('شمارش بالای جدول فارسی است و هر سه عدد را دارد',
    view136.countsText.includes('موقعیت') && view136.countsText.includes('باز')
    && view136.countsText.includes('بسته') && !/[0-9]/.test(view136.countsText),
    view136.countsText);

  // ── بند ۵: کیفیت روی همان ردیف ──────────────────────────────────────
  check('کیفیت داده روی خود ردیف است',
    row136.qualityLabel !== '—' && row136.qualityEstimated === false);
  const est136 = JSON.parse(JSON.stringify(done136.session));
  est136.events.find((e) => e?.data?.commitVersion !== undefined).data.quality = {
    kind: 'estimated', label: 'برآوردی', reason: 'پایانی به‌جای دفتر سفارش', sufficient: false,
  };
  const estRow136 = portfolioSessionPositionsView(est136).rows[0] || {};
  check('کیفیت برآوردی پنهان نمی‌شود و علتش می‌ماند',
    estRow136.qualityEstimated === true && estRow136.qualityLabel === 'برآوردی'
    && estRow136.qualityReason.includes('پایانی'),
    `${estRow136.qualityLabel} | ${estRow136.qualityReason}`);

  // ── بند ۳: موقعیت بی‌سند دیده می‌شود ────────────────────────────────
  const blind136 = JSON.parse(JSON.stringify(done136.session));
  delete blind136.events.find((e) => e?.data?.commitVersion !== undefined).data;
  const blindView136 = portfolioSessionPositionsView(blind136);
  const blindRow136 = blindView136.rows[0] || {};
  check('موقعیت بی‌سند از جدول حذف نمی‌شود',
    blindView136.ok && blindView136.rows.length === 1, blindView136.why);
  check('و به‌جای پاها، علتش را نشان می‌دهد',
    blindRow136.documented === false && blindRow136.legTexts.length === 0
    && blindRow136.why.length > 0 && !/[0-9]/.test(blindRow136.why), blindRow136.why);
  check('عدد نداشته «—» می‌شود، نه صفر',
    blindRow136.capitalTomanText === '—' && blindRow136.entryCashTomanText === '—'
    && blindRow136.qualityLabel === '—');
  check('ولی حجم و وضعیتش که از بازپخش می‌آید سالم است',
    blindRow136.statusLabel === 'باز' && blindRow136.openQtyText === '۴۰');
  check('و بالای جدول شمرده می‌شود',
    blindView136.undocumentedText.includes('سند طرحش خوانده نشد')
    && !/[0-9]/.test(blindView136.undocumentedText), blindView136.undocumentedText);
  check('وقتی همه سند دارند، هشدارِ بی‌مورد ساخته نمی‌شود',
    view136.undocumentedText === '');

  // ── بند ۴: باز و بسته جدا، شمارش‌ها یکی ─────────────────────────────
  check('باز و بسته جدا می‌مانند',
    view136.open.length === 1 && view136.closed.length === 0
    && view136.open[0].id === row136.id);
  check('شمارش‌ها با فهرست‌ها یکی‌اند',
    view136.open.length + view136.closed.length === view136.rows.length
    && view136.rows.length === state136.counts.total);

  // ── اتصال به تب ─────────────────────────────────────────────────────
  const tabSrc136 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب مدل نمایش موقعیت‌ها را وارد می‌کند',
    /portfolioSessionPositionsView/.test(tabSrc136)
    && /from '\.\.\/portfolio-positions-view\.mjs'/.test(tabSrc136));
  check('بخش موقعیت‌ها و خانه‌هایش در نشانه‌گذاری هستند',
    ['pt-positions', 'pt-positions-state', 'pt-positions-body', 'pt-positions-undocumented']
      .every((id) => tabSrc136.includes(`id="${id}"`)));
  // ترتیب: اول چقدر جا مانده، بعد چه چیزی در دست است، بعد چه می‌شود ثبت
  // کرد.
  check('موقعیت‌ها زیر نوار سرمایه، هر دو در تب سبد',
    tabSrc136.indexOf('data-panel="basket"') < tabSrc136.indexOf('id="pt-ledger"')
    && tabSrc136.indexOf('id="pt-ledger"') < tabSrc136.indexOf('id="pt-positions"')
    && tabSrc136.indexOf('id="pt-positions"') < tabSrc136.indexOf('data-panel="dossier"')
    && tabSrc136.indexOf('id="pt-ledger"') > 0);
  check('هر سه بخش از یک جلسه رسم می‌شوند',
    /function paintProposals\(session\)\s*\{[\s\S]{0,500}?paintLedger\(session\);[\s\S]{0,120}?paintPositions\(session\);/
      .test(tabSrc136));
  check('قفل ویرایشگر مأموریت، بخش موقعیت‌ها را غیرفعال نمی‌کند',
    /!control\.closest\('#pt-positions'\)/.test(tabSrc136));
  // درسِ برش دوم: `paintCapital` و `pt-capital` از قبل گرفته شده بودند و
  // تابع بی‌صدا رونویسی می‌شد.
  check('شناسه و نام تابع این بخش یکتا هستند',
    (tabSrc136.match(/function paintPositions\b/g) || []).length === 1
    && (tabSrc136.match(/id="pt-positions"/g) || []).length === 1);
  check('تب هیچ عدد مالی تازه‌ای برای این بخش حساب نمی‌کند',
    !/portfolioSessionPositions\(|\/\s*10/
      .test(tabSrc136.slice(tabSrc136.indexOf('function paintPositions'),
        tabSrc136.indexOf('function paintProposals'))));

  const cssSrc136 = readSrc('../ui/style.css');
  check('سبک بخش از همان توکن‌های موجود می‌آید، نه رنگ سخت‌کدشده',
    /\.pt-positions/.test(cssSrc136)
    && !/\.pt-positions[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(cssSrc136));
  check('و در موبایل جدولش مثل بقیه ستون‌شکن می‌شود',
    /\.pt-positions-table td::before/.test(cssSrc136));
}
