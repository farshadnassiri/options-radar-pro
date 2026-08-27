// ۱۳۷. بستن موقعیت

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioSessionPositions } from '../../core/portfolio-positions.mjs';
import { replayPortfolioSession } from '../../core/portfolio-session.mjs';
import {
  PORTFOLIO_CLOSE_VERSION, closePortfolioPosition,
} from '../../core/portfolio-close.mjs';

group('۱۳۷. بستن موقعیت');
{
  const fx137 = portfolioFixture('close-137');
  const roomy137 = JSON.parse(JSON.stringify(fx137.baseSession));
  roomy137.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session137 = {
    ...roomy137,
    lockedMission: fx137.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const plans137 = portfolioRankedPlans(session137, fx137.evidence);
  const done137 = commitPortfolioPlan(session137, fx137.evidence,
    plans137.ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done137.ok, done137.why);
  const opened137 = done137.session;
  const posId137 = done137.positionId;
  const entryLegs137 = done137.event.data.legs;

  // ── بند ۱ و ۳: خروج کامل ────────────────────────────────────────────
  const full137 = closePortfolioPosition(opened137, fx137.evidence, posId137);
  check('خروج کامل ثبت می‌شود',
    full137.ok && full137.version === PORTFOLIO_CLOSE_VERSION
    && full137.kind === 'close' && full137.qty === 40, full137.why);
  check('و وضعیت را بازپخش تعیین می‌کند، نه این ماژول',
    full137.status === 'closed' && full137.remainingQty === 0
    && replayPortfolioSession(full137.session).closedPositions.length === 1);

  // سمت خروج وارونهٔ سمت ورود است. خواندن از همان سمتِ ورود یعنی سمتِ
  // اشتباهِ اسپرد و قیمتی که هیچ‌وقت گرفته نمی‌شود.
  const doc137 = full137.event.data;
  check('سمت هر پا در خروج وارونهٔ ورود است',
    doc137.legs.length === entryLegs137.length
    && doc137.legs.every((leg, i) => leg.entrySide === entryLegs137[i].side
      && leg.side !== entryLegs137[i].side
      && (leg.side === 'buy' || leg.side === 'sell')),
    doc137.legs.map((l) => `${l.entrySide}→${l.side}`).join(' ،'));
  check('و قیمت خروج از همان سمتِ وارونه در دفتر سفارش می‌آید',
    doc137.legs.every((leg) => {
      const row = fx137.evidence.rows.find((r) => r.candidateId === `${leg.ins}:${leg.side}`);
      return row && leg.vwap === row.execution.vwap;
    }));
  check('حجم پرشدهٔ هر پا از نسبت ترکیب و حجم خروج می‌آید',
    doc137.legs.every((leg, i) => leg.filled === entryLegs137[i].ratio * 40));

  // ── بند ۴: سند خروج، کامل ───────────────────────────────────────────
  check('سند خروج نقد و کارمزد و کیفیت را با خودش می‌برد',
    Number.isFinite(doc137.exitCashRial) && Number.isFinite(doc137.feeRial)
    && doc137.feeRial > 0 && doc137.quality !== null
    && doc137.fees.option === fx137.capitalInputs.fees.option);
  check('و لحظهٔ مدرکی که قیمت از آن آمد',
    doc137.evidenceAt.date === fx137.at.date
    && doc137.evidenceAt.second === fx137.at.second);
  // پای خریداری‌شده فروخته می‌شود، پس نقد وارد می‌شود: عدد مثبت.
  check('فروشِ پای خریداری‌شده نقد وارد می‌کند، نه خارج',
    full137.exitCashRial > 0, String(full137.exitCashRial));
  check('کارمزد روی ارزش اسمیِ خروج نشسته، نه صفر',
    near(full137.feeRial, full137.exitCashRial * fx137.capitalInputs.fees.option, 1e-9),
    `${full137.feeRial}`);

  // ── بند ۳: خروج جزئی ────────────────────────────────────────────────
  const part137 = closePortfolioPosition(opened137, fx137.evidence, posId137, { qty: 10 });
  check('خروج جزئی «کاهش حجم» است نه «آفست کامل»',
    part137.ok && part137.kind === 'reduce' && part137.qty === 10, part137.why);
  check('و موقعیت باز می‌ماند با حجم کم‌شده',
    part137.status === 'open' && part137.remainingQty === 30);
  check('نقد خروج جزئی به نسبت حجم است',
    near(part137.exitCashRial, full137.exitCashRial / 4, 1e-9),
    `${part137.exitCashRial} در برابر ${full137.exitCashRial}`);
  // بستنِ دوباره روی جلسهٔ به‌روزشده باید از حجم باقی‌مانده حساب کند.
  const rest137 = closePortfolioPosition(part137.session, fx137.evidence, posId137);
  check('بستن باقی‌مانده، از حجم باز جدید حساب می‌کند',
    rest137.ok && rest137.qty === 30 && rest137.status === 'closed'
    && rest137.remainingQty === 0, rest137.why);

  // ── بند ۲: حجم بزرگ‌تر، رد می‌شود ───────────────────────────────────
  const tooBig137 = closePortfolioPosition(opened137, fx137.evidence, posId137, { qty: 41 });
  check('حجم بیش از حجم باز رد می‌شود، نه کوچک‌شدنِ بی‌صدا',
    !tooBig137.ok && tooBig137.reason === 'qtyTooLarge'
    && tooBig137.session === null, tooBig137.why);
  check('و هر دو عدد در علت گفته می‌شوند',
    tooBig137.why.includes('41') && tooBig137.why.includes('40'), tooBig137.why);
  for (const bad of [0, -5, 'سه']) {
    check(`حجم نامعتبر (${bad}) رد می‌شود`,
      closePortfolioPosition(opened137, fx137.evidence, posId137, { qty: bad })
        .reason === 'invalidQty');
  }

  // دفتر سفارشِ کم‌عمق: حجم برای جا شدن بزرگ نمی‌شود و بی‌صدا هم کوچک
  // نمی‌شود — خروج رد می‌شود و هر دو عدد گفته می‌شوند.
  const thin137 = JSON.parse(JSON.stringify(fx137.evidence));
  for (const row of thin137.rows) row.executableQty = 7;
  const thinOut137 = closePortfolioPosition(opened137, thin137, posId137);
  check('دفتر کم‌عمق، خروج را رد می‌کند نه اینکه بی‌صدا کمتر ببندد',
    !thinOut137.ok && thinOut137.reason === 'insufficientBook'
    && thinOut137.executableQty === 7 && thinOut137.requestedQty === 40,
    thinOut137.why);
  check('و با همان عدد ممکن، خروج انجام می‌شود',
    closePortfolioPosition(opened137, thin137, posId137, { qty: 7 }).ok);

  // ── بند ۵: موقعیت ناشناخته یا از پیش بسته ───────────────────────────
  check('موقعیت ناشناخته با علت جدا رد می‌شود',
    closePortfolioPosition(opened137, fx137.evidence, 'pos-ندارد').reason === 'unknownPosition');
  check('موقعیت از پیش بسته، «بسته» می‌گوید نه «ناشناخته»',
    closePortfolioPosition(full137.session, fx137.evidence, posId137)
      .reason === 'alreadyClosed');
  check('جلسهٔ نبوده، علت خودش را دارد',
    closePortfolioPosition(null, fx137.evidence, posId137).reason === 'noSession');

  // بدون سند، پاها معلوم نیستند و قیمت‌گرفتنشان یعنی حدس‌زدن اینکه چه
  // چیزی در دست است.
  const blind137 = JSON.parse(JSON.stringify(opened137));
  delete blind137.events.find((e) => e?.data?.commitVersion !== undefined).data;
  check('موقعیت بی‌سند بسته نمی‌شود، با علت صریح',
    closePortfolioPosition(blind137, fx137.evidence, posId137)
      .reason === 'undocumentedPosition');

  // ── مدرک کهنه ───────────────────────────────────────────────────────
  const stale137 = JSON.parse(JSON.stringify(fx137.evidence));
  stale137.now = { date: fx137.at.date, second: fx137.at.second + 60 };
  check('مدرکِ لحظهٔ دیگر، قیمت خروج نمی‌دهد',
    closePortfolioPosition(opened137, stale137, posId137).reason === 'staleEvidence');
  check('مدرک ناموفق هم همین‌طور',
    closePortfolioPosition(opened137, { ok: false, rows: [] }, posId137)
      .reason === 'staleEvidence');

  const rejected137 = JSON.parse(JSON.stringify(fx137.evidence));
  for (const row of rejected137.rows) {
    if (row.side === 'sell') { row.accepted = false; row.verdict = 'rejected'; }
  }
  check('پایی که حکم پذیرفته ندارد، قیمت خروج نمی‌گیرد',
    closePortfolioPosition(opened137, rejected137, posId137).reason === 'rejectedLeg');

  const priceless137 = JSON.parse(JSON.stringify(fx137.evidence));
  for (const row of priceless137.rows) row.execution.vwap = 0;
  check('قیمت اجرایی نامعلوم، با عدد ساختگی جایگزین نمی‌شود',
    closePortfolioPosition(opened137, priceless137, posId137).reason === 'unknownPrice');

  const feeless137 = JSON.parse(JSON.stringify(opened137));
  delete feeless137.startSnapshot.capitalInputs.fees.option;
  check('نبودِ نرخ کارمزد، خروج بی‌کارمزد نمی‌سازد',
    closePortfolioPosition(feeless137, fx137.evidence, posId137).reason === 'missingFees');

  // ── بند ۶: هیچ سود و زیانی ──────────────────────────────────────────
  const code137 = readSrc('../core/portfolio-close.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('ماژول سود و زیان حساب نمی‌کند',
    !/\bpnl\b/i.test(code137) && !/profit|realized|entryCashRial/i.test(code137));
  check('و خروجی‌اش هیچ میدان سود و زیان ندارد',
    !Object.keys(full137).some((key) => /pnl|profit|realized/i.test(key))
    && !Object.keys(doc137).some((key) => /pnl|profit|realized/i.test(key)),
    Object.keys(doc137).filter((k) => /pnl|profit|realized/i.test(k)).join('، ') || 'هیچ');
  check('و به سند ورود برای عدد نگاه نمی‌کند',
    !/PORTFOLIO_COMMIT_VERSION|portfolio-commit/.test(code137));

  // ── سالم‌ماندن جلسهٔ ورودی ──────────────────────────────────────────
  check('جلسهٔ ورودی دست‌نخورده می‌ماند؛ جلسهٔ تازه برمی‌گردد',
    opened137.events.length === 1 && full137.session !== opened137
    && full137.session.events.length === 2);
  check('دفتر پس از خروج همچنان بازپخش‌شدنی است',
    replayPortfolioSession(full137.session).ok
    && portfolioSessionPositions(full137.session).ok);
}
