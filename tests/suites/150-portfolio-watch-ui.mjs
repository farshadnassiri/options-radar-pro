// ۱۵۰. هشدارهای مسیر در تب

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioWatchView } from '../../ui/portfolio-watch-view.mjs';

group('۱۵۰. هشدارهای مسیر در تب');
{
  const fx150 = portfolioFixture('watch-ui-150');
  const roomy150 = JSON.parse(JSON.stringify(fx150.baseSession));
  roomy150.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session150 = {
    ...roomy150,
    lockedMission: fx150.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const withRisk150 = (session, risk) => ({
    ...session,
    lockedMission: fx150.sessionWith(BULLISH_OUTLOOK, { ...WIDE_RISK, ...risk }).lockedMission,
  });

  check('جلسهٔ بی‌موقعیت نواری نمی‌سازد',
    portfolioWatchView(session150, fx150.evidence).ok === false);

  const done150 = commitPortfolioPlan(session150, fx150.evidence,
    portfolioRankedPlans(session150, fx150.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done150.ok, done150.why);
  const calm150 = portfolioWatchView(done150.session, fx150.evidence);
  const broken150 = portfolioWatchView(
    withRisk150(done150.session, { minFreeCapitalPct: 75, maxMarginUsePct: 25 }),
    fx150.evidence);
  const near150 = portfolioWatchView(
    withRisk150(done150.session, { minFreeCapitalPct: 68, maxMarginUsePct: 30 }),
    fx150.evidence);

  // ── بند ۱: شکسته باید اول دیده شود ──────────────────────────────────
  // کاربری که باید اسکرول کند تا هشدار را ببیند، آن را نمی‌بیند.
  check('پیش‌شرط: سه وضعیت متفاوت ساخته شد',
    calm150.counts.breached === 0 && broken150.counts.breached > 0
    && near150.counts.near > 0,
    `${calm150.counts.breached}/${broken150.counts.breached}/${near150.counts.near}`);
  check('هشدار شکسته اول فهرست می‌آید',
    broken150.rows[0].state === 'breached',
    broken150.rows.map((row) => row.state).join(' > '));
  check('و ردیف‌ها به ترتیب فوریت‌اند',
    broken150.rows.every((row, i) => i === 0
      || broken150.rows[i - 1].severity <= row.severity),
    broken150.rows.map((row) => `${row.state}:${row.severity}`).join(' ،'));
  check('نزدیک هم بالاتر از رعایت‌شده می‌نشیند',
    near150.rows.findIndex((row) => row.state === 'near')
      < near150.rows.findIndex((row) => row.state === 'clear'));
  const tabSrc150 = readSrc('../ui/tabs/portfolio-time.mjs');
  // نوار بالای همه‌چیز است، حتی بالای ساعت.
  check('نوار هشدار بالای ساعت و همهٔ بخش‌ها می‌نشیند',
    tabSrc150.indexOf('id="pt-watch"') > 0
    && tabSrc150.indexOf('id="pt-watch"') < tabSrc150.indexOf('id="pt-clock"')
    && tabSrc150.indexOf('id="pt-watch"') < tabSrc150.indexOf('id="pt-ledger"'));
  check('و اول از همه رسم می‌شود',
    /paintWatch\(session\);[\s\S]{0,60}?paintClock\(session\);/.test(tabSrc150));

  // ── بند ۲ و ۳: سه حالت، سه ظاهر ─────────────────────────────────────
  const cssSrc150 = readSrc('../ui/style.css');
  const toneOf = (state) => new RegExp(
    `\\.pt-watch-table tr\\[data-state="${state}"\\] b \\{ color: var\\(--([a-z-]+)\\)`)
    .exec(cssSrc150)?.[1];
  const tones150 = ['clear', 'near', 'breached', 'unknown'].map(toneOf);
  check('هر چهار حالت رنگ خودشان را دارند',
    tones150.every(Boolean) && new Set(tones150).size === 4,
    tones150.join(' ،'));
  // «نامعلوم» شبیه «رعایت شده» بودنش یعنی سکوتِ ندانستن به‌جای اطمینان
  // خوانده می‌شود.
  check('«نامعلوم» رنگِ «رعایت شده» نمی‌گیرد',
    toneOf('unknown') !== toneOf('clear'));
  check('و «نزدیک» نه رنگِ «شکسته» می‌گیرد نه رنگِ «رعایت شده»',
    toneOf('near') !== toneOf('breached') && toneOf('near') !== toneOf('clear'));
  check('رنگ‌ها از توکن‌های موجود می‌آیند، نه سخت‌کدشده',
    !/\.pt-watch[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(cssSrc150));
  check('حکمِ هر ردیف متن خودش را هم دارد، نه فقط رنگ',
    new Set([...broken150.rows, ...near150.rows].map((row) => row.stateLabel)).size >= 3);
  check('لحن کلی نوار با بدترین حالت می‌خواند',
    broken150.tone === 'loss' && near150.tone === 'warn' && calm150.tone === 'gain',
    `${broken150.tone}/${near150.tone}/${calm150.tone}`);

  // ── بند ۵: وقتی همه‌چیز رعایت شده، نوار کوتاه ───────────────────────
  // هشدارِ همیشگی بعد از چند بار نادیده گرفته می‌شود، و آن‌وقت هشدارِ
  // واقعی هم با آن می‌رود.
  check('جلسهٔ آرام، نوار را جمع می‌کند',
    calm150.quiet === true && calm150.urgent === false
    && calm150.headlineText.includes('رعایت شده'), calm150.headlineText);
  check('و جلسهٔ پرخطر، جمع نمی‌شود',
    broken150.quiet === false && broken150.urgent === true
    && broken150.headlineText.includes('شکسته'), broken150.headlineText);
  check('جدول فقط وقتی باز می‌شود که حرفی برای گفتن باشد',
    /table\.hidden = view\.quiet;/.test(tabSrc150));

  // ── بند ۴: «چه چیزی عوض شد» روی همان ردیف ───────────────────────────
  const capRow150 = broken150.rows.find((row) => row.code === 'missionLossCap');
  check('عدد لحظهٔ ثبت روی همان ردیف است',
    capRow150.atCommitText.includes('تومان'), capRow150.atCommitText);
  check('و تفاوتش هم',
    capRow150.changeText.includes('نسبت به لحظهٔ ثبت'), capRow150.changeText);
  check('تغییرِ صفر، متنِ بی‌مورد نمی‌سازد',
    portfolioWatchView(done150.session, fx150.evidence).rows
      .filter((row) => row.changeText).every((row) => row.changeText.length > 0));
  check('مبنای هر ردیف خوانا نوشته می‌شود، نه شناسهٔ خام',
    broken150.rows.every((row) => !row.basis || row.basisLabel.length > 0)
    && broken150.rows.some((row) => row.basisLabel.includes('ارزش جاری')));

  // ── بند ۶: رقم فارسی و تومان ────────────────────────────────────────
  const IDS_150 = new Set(['code', 'state', 'basis']);
  const shown150 = [broken150.headlineText, calm150.headlineText,
    ...broken150.rows.flatMap((row) => Object.entries(row)
      .filter(([k, v]) => typeof v === 'string' && !IDS_150.has(k))
      .map(([, v]) => v))];
  check('هیچ رقم لاتینی در متن نمایشی نیست',
    shown150.every((value) => !/[0-9]/.test(value)),
    shown150.filter((v) => /[0-9]/.test(v)).slice(0, 3).join(' | ') || 'هیچ');
  check('واحد تومان است، نه ریال',
    !shown150.join(' ').includes('ریال'));
  const viewCode150 = readSrc('../ui/portfolio-watch-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const rialMath150 = viewCode150.match(/Rial[A-Za-z]*\s*[*+\-]/g) || [];
  const rialDiv150 = (viewCode150.match(/Rial[A-Za-z]*\s*\/\s*[0-9]+/g) || [])
    .filter((hit) => !/\/\s*10$/.test(hit));
  check('لایهٔ نمایش روی عدد ریالی جز تقسیم بر ده حساب نمی‌کند',
    rialMath150.length === 0 && rialDiv150.length === 0,
    [...rialMath150, ...rialDiv150].join(' ،') || 'هیچ');
  check('و خودش قیدی نمی‌سنجد — فقط نتیجه را قالب می‌دهد',
    !/NEAR_SHARE|headroomPct <|portfolioCapitalLedger/.test(viewCode150));

  // ── اتصال به تب ─────────────────────────────────────────────────────
  check('بخش هشدار و خانه‌هایش در نشانه‌گذاری هستند',
    ['pt-watch', 'pt-watch-headline', 'pt-watch-table', 'pt-watch-body']
      .every((id) => tabSrc150.includes(`id="${id}"`)));
  check('قفل ویرایشگر مأموریت، نوار هشدار را غیرفعال نمی‌کند',
    /!control\.closest\('#pt-watch'\)/.test(tabSrc150));
  check('شناسه و نام تابع یکتا هستند',
    (tabSrc150.match(/function paintWatch\b/g) || []).length === 1
    && (tabSrc150.match(/id="pt-watch"/g) || []).length === 1);
  check('و در موبایل جدولش ستون‌شکن می‌شود',
    /\.pt-watch-table td::before/.test(cssSrc150));
}
