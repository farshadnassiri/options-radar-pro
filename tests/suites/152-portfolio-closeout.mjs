// ۱۵۲. پروندهٔ پایان جلسه

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import { portfolioSessionValuation } from '../../core/portfolio-valuation.mjs';
import { recordPortfolioTransaction } from '../../core/portfolio-session.mjs';
import {
  PORTFOLIO_CLOSEOUT_VERSION, closeoutPortfolioSession,
} from '../../core/portfolio-closeout.mjs';

group('۱۵۲. پروندهٔ پایان جلسه');
{
  const fx152 = portfolioFixture('closeout-152');
  const roomy152 = JSON.parse(JSON.stringify(fx152.baseSession));
  roomy152.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session152 = {
    ...roomy152,
    lockedMission: fx152.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const done152 = commitPortfolioPlan(session152, fx152.evidence,
    portfolioRankedPlans(session152, fx152.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done152.ok, done152.why);
  const shut152 = closePortfolioPosition(done152.session, fx152.evidence, done152.positionId);
  check('پیش‌شرط: موقعیت بسته شد', shut152.ok, shut152.why);

  // ── بند ۱: بستنِ زودهنگام علتش را می‌گوید ───────────────────────────
  const early152 = closeoutPortfolioSession(shut152.session, fx152.evidence);
  check('جلسه‌ای که به پایانش نرسیده، خودبه‌خود بسته نمی‌شود',
    !early152.ok && early152.reason === 'tooEarly'
    && early152.session === null, early152.why);
  const forced152 = closeoutPortfolioSession(shut152.session, fx152.evidence, { force: true });
  check('ولی با خواستِ صریح بسته می‌شود',
    forced152.ok && forced152.version === PORTFOLIO_CLOSEOUT_VERSION
    && forced152.session.state === 'closed', forced152.why);
  // پرونده‌ای که نگوید زودتر بسته شده، فردا شبیه جلسهٔ کامل خوانده می‌شود.
  check('و زودهنگام‌بودن در خودِ پرونده می‌ماند',
    forced152.dossier.early === true);
  const atEnd152 = closeoutPortfolioSession(
    { ...shut152.session, now: { ...shut152.session.end } }, fx152.evidence);
  check('جلسه‌ای که به پایانش رسیده، بدون اصرار بسته می‌شود',
    atEnd152.ok && atEnd152.dossier.early === false, atEnd152.why);

  // ── بند ۶ و ۴: یک‌طرفه ──────────────────────────────────────────────
  check('جلسهٔ بسته دوباره بسته نمی‌شود',
    closeoutPortfolioSession(forced152.session, fx152.evidence, { force: true })
      .reason === 'alreadyClosed');
  check('جلسهٔ پیش‌نویس هم بسته نمی‌شود',
    closeoutPortfolioSession({ ...shut152.session, state: 'draft' }, fx152.evidence,
      { force: true }).reason === 'notActive');
  check('جلسهٔ نبوده، علت خودش را دارد',
    closeoutPortfolioSession(null, fx152.evidence).reason === 'noSession');
  // اگر روزی این قاعده در دفتر عوض شد، اینجا بی‌صدا نماند.
  const afterClose152 = recordPortfolioTransaction(forced152.session, {
    kind: 'open', qty: 1, strategyId: 'long-call', familyId: 'single',
    at: forced152.session.now,
  });
  check('پس از بستن، هیچ تراکنشی پذیرفته نمی‌شود',
    !afterClose152.ok && afterClose152.why.includes('فعال'), afterClose152.why);
  check('و بستن جلسه، جلسهٔ ورودی را دست‌نخورده می‌گذارد',
    shut152.session.state === 'active' && forced152.session !== shut152.session);

  // ── بند ۵: تحقق‌یافته، جدا از تحقق‌نیافته ───────────────────────────
  const realized152 = forced152.dossier.realized;
  check('سود و زیان تحقق‌یافته از دفتر می‌آید',
    Number.isFinite(realized152.totalRial) && realized152.rows.length === 1
    && realized152.rows[0].closedQty === 40, `${realized152.totalRial}`);
  // بستنِ بی‌درنگ یعنی زیانِ تحقق‌یافته باید دقیقاً همان زیانِ
  // تحقق‌نیافتهٔ لحظهٔ ورود باشد — خرید روی ask و فروش روی bid، منهای هر
  // دو کارمزد. برابرنبودنشان یعنی یکی از دو موتور جایی را جا انداخته.
  const beforeClose152 = portfolioSessionValuation(done152.session, fx152.evidence);
  check('و با زیانِ تحقق‌نیافتهٔ پیش از بستن می‌خواند',
    near(realized152.totalRial, beforeClose152.totals.unrealizedRial, 1e-6),
    `${realized152.totalRial} در برابر ${beforeClose152.totals.unrealizedRial}`);
  check('اجزای هر ردیف جدا می‌مانند',
    ['exitCashRial', 'exitFeeRial', 'entryShareRial', 'entryFeeShareRial', 'realizedRial']
      .every((key) => Number.isFinite(realized152.rows[0][key])));
  const code152 = readSrc('../core/portfolio-closeout.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // جمعشان عددی می‌سازد که هیچ‌کدام نیست.
  check('تحقق‌یافته و تحقق‌نیافته با هم جمع نمی‌شوند',
    !/unrealized[\s\S]{0,40}?\+[\s\S]{0,40}?realized/i.test(code152)
    && !/totalPnl|netPnl/i.test(code152));
  // جمعِ نصفه بدتر از نبودِ عدد است.
  const blind152 = JSON.parse(JSON.stringify(shut152.session));
  delete blind152.events.find((e) => e?.data?.closeVersion !== undefined)
    .data.realizedRial;
  const blindOut152 = closeoutPortfolioSession(blind152, fx152.evidence, { force: true });
  check('نقدِ ورودِ نبوده، جمعِ تحقق‌یافته را null می‌کند نه صفر',
    blindOut152.dossier.realized.totalRial === null
    && blindOut152.dossier.realized.unknown.length === 1,
    JSON.stringify(blindOut152.dossier.realized));

  // ── بند ۳: موقعیتِ بازِ باقی‌مانده ──────────────────────────────────
  // جلسه‌ای که با موقعیت باز بسته شود، تعهدِ باز دارد.
  const stillOpen152 = closeoutPortfolioSession(done152.session, fx152.evidence,
    { force: true });
  check('موقعیت باز در پرونده صریح می‌آید',
    stillOpen152.ok && stillOpen152.dossier.positions.open === 1
    && stillOpen152.dossier.positions.openIds[0] === done152.positionId
    && stillOpen152.dossier.positions.openQty === 40, stillOpen152.why);
  check('و جلسهٔ تخت‌شده تعهد بازی نشان نمی‌دهد',
    forced152.dossier.positions.open === 0
    && forced152.dossier.positions.openIds.length === 0
    && forced152.dossier.positions.closed === 1);
  check('شمار موقعیت‌ها با هم می‌خوانند',
    stillOpen152.dossier.positions.open + stillOpen152.dossier.positions.closed
      === stillOpen152.dossier.positions.total);

  // ── بند ۲: پرونده از دفتر رویداد ────────────────────────────────────
  check('خلاصهٔ حسابداری در پرونده هست',
    forced152.dossier.accounting !== null
    && forced152.dossier.accounting.entries.count === 1
    && forced152.dossier.accounting.exits.count === 1);
  check('کارمزد ورود و خروج جدا می‌مانند',
    forced152.dossier.accounting.fees.entryRial > 0
    && forced152.dossier.accounting.fees.exitRial > 0);
  check('هشدارهای لحظهٔ بستن هم ثبت می‌شوند',
    Array.isArray(forced152.dossier.alerts));
  check('و بازهٔ جلسه در پرونده می‌ماند',
    forced152.dossier.start.date === fx152.at.date
    && forced152.dossier.end.date === session152.end.date
    && forced152.dossier.closedAt !== null);
  check('پرونده فقط از دفتر می‌خواند، نه شمارندهٔ موازی',
    /session\?\.events|session\.events/.test(code152)
    && !/assignedRial|unassignedRial/.test(code152));
  check('و ماژول قیمت لحظه‌ای نمی‌خواند',
    !/walkBook|buildChain|bookCapacity/.test(code152));

  // ── ناتوانی‌ها پنهان نمی‌شوند ───────────────────────────────────────
  const brokenSummary152 = JSON.parse(JSON.stringify(shut152.session));
  brokenSummary152.capital = null;
  const brokenOut152 = closeoutPortfolioSession(brokenSummary152, fx152.evidence,
    { force: true });
  check('اگر بخشی از پرونده ساخته نشود، علتش می‌ماند نه سکوت',
    brokenOut152.ok
    && (brokenOut152.dossier.accounting !== null
      || brokenOut152.dossier.accountingWhy.length > 0)
    && (brokenOut152.dossier.alerts.length > 0
      || brokenOut152.dossier.alertsWhy.length > 0), brokenOut152.why);
}
