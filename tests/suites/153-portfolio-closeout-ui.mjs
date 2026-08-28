// ۱۵۳. پروندهٔ پایان در تب

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import { closeoutPreflight, closeoutView } from '../../ui/portfolio-closeout-view.mjs';

group('۱۵۳. پروندهٔ پایان در تب');
{
  const fx153 = portfolioFixture('closeout-ui-153');
  const roomy153 = JSON.parse(JSON.stringify(fx153.baseSession));
  roomy153.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session153 = {
    ...roomy153,
    lockedMission: fx153.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const done153 = commitPortfolioPlan(session153, fx153.evidence,
    portfolioRankedPlans(session153, fx153.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done153.ok, done153.why);
  const shut153 = closePortfolioPosition(done153.session, fx153.evidence, done153.positionId);
  check('پیش‌شرط: موقعیت بسته شد', shut153.ok, shut153.why);

  // ── بند ۲: تعهدِ باز پیش از بستن هشدار می‌دهد ───────────────────────
  // تصمیم پیش از عمل گرفته می‌شود؛ اگر پس از بستن بگوییم «راستی، سه
  // موقعیت باز بود»، دیگر کاری نمی‌شود کرد.
  const preOpen153 = closeoutPreflight(done153.session);
  check('تعهدِ بازِ باقی‌مانده پیش از بستن گفته می‌شود',
    preOpen153.ok && preOpen153.openCount === 1 && preOpen153.openQty === 40
    && preOpen153.warningText.includes('تعهد'), preOpen153.warningText);
  check('و زودهنگام‌بودن هم',
    preOpen153.early === true && preOpen153.warningText.includes('زودهنگام'));

  // ── بند ۱: تأیید صریح، نه یک کلیک ───────────────────────────────────
  check('وقتی چیزی برای دانستن هست، تأیید لازم می‌شود',
    preOpen153.needsConfirm === true);
  const tabSrc153 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('و تب واقعاً دو بار زدن می‌خواهد',
    /pre\.needsConfirm && !closeoutArmed[\s\S]{0,220}?return;/.test(tabSrc153)
    && /closeoutArmed = true/.test(tabSrc153));
  check('متن دکمه هم عوض می‌شود تا کاربر بداند بار دوم چه می‌کند',
    /تأیید می‌کنم؛ ببند/.test(tabSrc153));
  // جلسه‌ای که به پایانش رسیده و تخت است، تأیید لازم ندارد.
  const preCalm153 = closeoutPreflight({ ...shut153.session, now: { ...shut153.session.end } });
  check('جلسهٔ تخت و به‌پایان‌رسیده، تأیید اضافه نمی‌خواهد',
    preCalm153.ok && preCalm153.needsConfirm === false
    && preCalm153.warnings.length === 0, preCalm153.warningText);

  // ── بند ۳: پرونده پس از بستن ────────────────────────────────────────
  const view153 = closeoutView(shut153.session, fx153.evidence, { force: true });
  check('پرونده پس از بستن ساخته می‌شود',
    view153.ok && view153.session.state === 'closed', view153.why);
  check('و سرفصل می‌گوید زودهنگام بوده یا نه',
    view153.early === true && view153.headlineText.includes('زودتر'),
    view153.headlineText);
  check('حسابداری جلسه در پرونده هست',
    view153.accountingText.includes('ورود') && view153.accountingText.includes('خروج')
    && view153.accountingText.includes('کارمزد'), view153.accountingText);
  check('موقعیت‌ها شمرده می‌شوند',
    view153.positionsText.includes('بسته') && view153.positionsText.includes('باز'));
  check('و هشدارهای پایانی هم ثبت می‌شوند',
    Array.isArray(view153.alerts));

  // ── بند ۴: تحقق‌یافته جدا از تحقق‌نیافته ────────────────────────────
  // کنارِ هم نشستنشان یعنی خواننده جمعشان می‌کند، و آن جمع هیچ‌کدام نیست.
  check('تحقق‌یافته عدد و لحن خودش را دارد',
    view153.realized.totalText.includes('تومان')
    && view153.realized.tone === 'loss', view153.realized.totalText);
  const viewCode153 = readSrc('../ui/portfolio-closeout-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('و مدل نمایش اصلاً تحقق‌نیافته را نمی‌آورد',
    !/unrealized/i.test(viewCode153));
  // توضیحاتِ خودِ کد هر دو واژه را کنار هم دارند؛ آنچه باید سنجیده شود
  // خودِ کد است، نه توضیحش.
  const tabCode153 = tabSrc153
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('تب هم آن دو را در یک خانه نمی‌گذارد',
    !/تحقق‌یافته[^`]{0,80}تحقق‌نیافته/.test(tabCode153));
  check('ردیف هر موقعیتِ بسته‌شده اجزایش را دارد',
    view153.realized.rows.length === 1
    && view153.realized.rows[0].closedQtyText === '۴۰'
    && view153.realized.rows[0].exitCashText.includes('تومان'));
  // جمعِ نامعلوم عدد نمی‌گیرد.
  const blind153 = JSON.parse(JSON.stringify(shut153.session));
  delete blind153.events.find((e) => e?.data?.closeVersion !== undefined)
    .data.realizedRial;
  const blindView153 = closeoutView(blind153, fx153.evidence, { force: true });
  check('جمعِ نامعلوم «—» می‌شود نه صفر',
    blindView153.realized.totalText === '—' && blindView153.realized.tone === ''
    && blindView153.realized.unknownText.length > 0,
    blindView153.realized.unknownText);

  // ── تعهدِ باز پس از بستن هم صریح می‌ماند ────────────────────────────
  const stillOpen153 = closeoutView(done153.session, fx153.evidence, { force: true });
  check('جلسه‌ای که با موقعیت باز بسته شد، آن را در پرونده می‌گوید',
    stillOpen153.openText.includes('تعهد'), stillOpen153.openText);
  check('و جلسهٔ تخت، تعهدِ ساختگی نمی‌سازد',
    view153.openText === '');

  // ── بند ۵: پس از بستن، همه‌چیز خاموش ────────────────────────────────
  check('تب پس از بستن، دکمه‌های ثبت و بستن و گام را خاموش می‌کند',
    /\[data-pt-commit\], \[data-pt-close\], \[data-pt-step\]/.test(tabSrc153)
    && /control\.disabled = true/.test(tabSrc153));
  check('و دکمهٔ بستن جلسه هم پنهان می‌شود',
    /button\.hidden = true/.test(tabSrc153));
  check('جلسهٔ بسته دوباره بسته نمی‌شود',
    closeoutView(view153.session, fx153.evidence, { force: true })
      .reason === 'alreadyClosed');
  check('و دستگیره روی جلسهٔ بسته کاری نمی‌کند',
    /proposalSession\.state === 'closed'\) return;/.test(tabSrc153));

  // ── بند ۶: رقم فارسی و تومان ────────────────────────────────────────
  const shown153 = [view153.headlineText, view153.accountingText, view153.positionsText,
    view153.realized.totalText, stillOpen153.openText,
    blindView153.realized.unknownText, preOpen153.warningText,
    ...view153.realized.rows.flatMap((row) => [row.idText, row.closedQtyText,
      row.exitCashText, row.realizedText])];
  check('هیچ رقم لاتینی در متن نمایشی نیست',
    shown153.every((value) => !/[0-9]/.test(value)),
    shown153.filter((v) => /[0-9]/.test(v)).slice(0, 3).join(' | ') || 'هیچ');
  check('واحد تومان است، نه ریال',
    !shown153.join(' ').includes('ریال'));
  const rialMath153 = viewCode153.match(/Rial[A-Za-z]*\s*[*+\-]/g) || [];
  const rialDiv153 = (viewCode153.match(/Rial[A-Za-z]*\s*\/\s*[0-9]+/g) || [])
    .filter((hit) => !/\/\s*10$/.test(hit));
  check('لایهٔ نمایش روی عدد ریالی جز تقسیم بر ده حساب نمی‌کند',
    rialMath153.length === 0 && rialDiv153.length === 0,
    [...rialMath153, ...rialDiv153].join(' ،') || 'هیچ');

  // ── اتصال به تب ─────────────────────────────────────────────────────
  check('بخش پایان و خانه‌هایش در نشانه‌گذاری هستند',
    ['pt-closeout', 'pt-closeout-do', 'pt-closeout-warn', 'pt-closeout-state',
      'pt-closeout-dossier', 'pt-closeout-figures', 'pt-closeout-open',
      'pt-closeout-table', 'pt-closeout-body']
      .every((id) => tabSrc153.includes(`id="${id}"`)));
  check('دکمهٔ بستن از قفل ویرایشگر مأموریت مستثناست',
    /!control\.closest\('#pt-closeout'\)/.test(tabSrc153));
  check('و بخش پایان جزو بخش‌های زنده است، پس با ویزارد جمع نمی‌شود',
    /class="pt-closeout pt-live"/.test(tabSrc153));
  check('شناسه و دستگیره یکتا هستند',
    (tabSrc153.match(/function paintCloseout\b/g) || []).length === 1
    && (tabSrc153.match(/\$\('pt-closeout'\)\.onclick/g) || []).length === 1);
  const cssSrc153 = readSrc('../ui/style.css');
  check('سبکش از توکن‌های موجود می‌آید',
    /\.pt-closeout-figures dd\.loss \{ color: var\(--loss\)/.test(cssSrc153)
    && !/\.pt-closeout[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(cssSrc153));
  check('و در موبایل جدولش ستون‌شکن می‌شود',
    /\.pt-closeout-table td::before/.test(cssSrc153));
}
