// ۱۴۷. منحنی بازده سبد

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { analyzePayoff } from '../../core/payoff.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import {
  PORTFOLIO_PAYOFF_VERSION, portfolioPayoffCurve,
} from '../../core/portfolio-payoff.mjs';

group('۱۴۷. منحنی بازده سبد');
{
  const fx147 = portfolioFixture('payoff-147');
  const roomy147 = JSON.parse(JSON.stringify(fx147.baseSession));
  roomy147.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session147 = {
    ...roomy147,
    lockedMission: fx147.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  // ── بند ۶: جلسهٔ بدون موقعیت باز ────────────────────────────────────
  const empty147 = portfolioPayoffCurve(session147);
  check('جلسهٔ بدون موقعیت، صریح می‌گوید منحنی‌ای نیست',
    !empty147.ok && empty147.reason === 'noOpenPositions'
    && empty147.curve === null, empty147.why);
  check('جلسهٔ نبوده، علت خودش را دارد',
    portfolioPayoffCurve(null).reason === 'noSession');

  // ── پیش‌شرط: دو موقعیت باز ──────────────────────────────────────────
  const first147 = commitPortfolioPlan(session147, fx147.evidence,
    portfolioRankedPlans(session147, fx147.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: طرح نخست ثبت شد', first147.ok, first147.why);
  const secondId147 = portfolioRankedPlans(first147.session, fx147.evidence)
    .ranking.ranked.map((row) => row.candidateId)
    .find((id) => id !== first147.event.data.candidateId);
  const second147 = commitPortfolioPlan(first147.session, fx147.evidence, secondId147);
  check('پیش‌شرط: طرح دوم هم ثبت شد', second147.ok, second147.why);
  const both147 = portfolioPayoffCurve(second147.session);
  check('منحنی برای دو موقعیت ساخته می‌شود',
    both147.ok && both147.version === PORTFOLIO_PAYOFF_VERSION
    && both147.positions.length === 2, both147.why);

  // ── بند ۱: یک منحنی، نه چند منحنیِ کنار هم ──────────────────────────
  const docs147 = second147.session.events
    .filter((event) => event?.data?.commitVersion !== undefined).map((event) => event.data);
  const totalLegs147 = docs147.reduce((sum, doc) => sum + doc.legs.length, 0);
  check('پاهای هر دو موقعیت در یک مجموعه‌اند',
    both147.legs.length === totalLegs147 && totalLegs147 > 1,
    `${both147.legs.length} / ${totalLegs147}`);
  const docById147 = new Map(second147.session.events
    .filter((event) => event?.data?.commitVersion !== undefined)
    .map((event) => [event.positionId, event.data]));
  check('هر پا با حجم موقعیتش وزن گرفته، نه با یک',
    both147.legs.every((leg) => {
      const position = both147.positions.find((row) => row.id === leg.positionId);
      const source = docById147.get(leg.positionId)?.legs
        .find((row) => row.ins === leg.ins);
      return Boolean(source) && near(leg.ratio, source.ratio * position.openQty, 1e-9);
    }));
  check('نقد ورود جمعِ نقدِ هر دو سند است',
    near(both147.curve.netCashRial,
      docs147.reduce((sum, doc) => sum + doc.entryCashRial, 0), 1e-9),
    `${both147.curve.netCashRial}`);
  // جمعِ جداگانهٔ نتیجه‌ها غلط است: دو موقعیت می‌توانند همدیگر را در یک
  // بازه خنثی کنند و آن خنثی‌شدن فقط در منحنیِ مشترک دیده می‌شود.
  const canonical147 = analyzePayoff(both147.legs, both147.curve.netCashRial,
    { fees: fx147.capitalInputs.fees });
  check('منحنی دقیقاً همان چیزی است که موتور مشترک می‌دهد',
    JSON.stringify(both147.curve.breakevens) === JSON.stringify(canonical147.breakevens)
    && both147.curve.unlimitedLoss === canonical147.unlimitedLoss,
    JSON.stringify(both147.curve.breakevens));
  const code147 = readSrc('../core/portfolio-payoff.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('موتور بازده یک بار صدا زده می‌شود، نه یک بار برای هر موقعیت',
    (code147.match(/analyzePayoff\(/g) || []).length === 1
    && !/for[\s\S]{0,120}?analyzePayoff\(/.test(code147));
  check('و قاعدهٔ بازده دوباره نوشته نشده',
    !/breakevens\s*=|maxProfit\s*=|settlementBounds|exerciseThreshold/.test(code147));

  // ── بند ۳: نقاط شکست از اعمال واقعی، با کارمزد ──────────────────────
  const strikes147 = [...new Set(docs147.flatMap((doc) => doc.legs.map((leg) => leg.strike)))]
    .sort((a, b) => a - b);
  check('نقاط شکست همان اعمال‌های واقعی سبدند',
    JSON.stringify(both147.curve.strikes) === JSON.stringify(strikes147),
    `${JSON.stringify(both147.curve.strikes)} / ${JSON.stringify(strikes147)}`);
  check('کارمزد به موتور بازده داده می‌شود',
    /\{ fees \}/.test(code147) && /capitalInputs\?\.fees/.test(code147));
  // سربه‌سریِ خرید کال باید **بالاتر** از اعمال به‌علاوهٔ حق‌بیمه باشد،
  // چون اعمال خودش کارمزد دارد. برابربودنشان یعنی کارمزد جا افتاده.
  const single147 = portfolioPayoffCurve(first147.session);
  const doc1 = first147.event.data;
  const naive147 = doc1.legs[0].strike + doc1.legs[0].vwap;
  check('پیش‌شرط: موقعیت نخست یک خرید کال است',
    single147.ok && doc1.legs.length === 1 && doc1.legs[0].side === 'buy'
    && doc1.legs[0].kind === 'call', single147.why);
  check('سربه‌سری از «اعمال + حق‌بیمه» بالاتر است، چون اعمال کارمزد دارد',
    single147.curve.breakevens[0] > naive147,
    `${single147.curve.breakevens[0]} در برابر ${naive147}`);

  // ── بند ۴: نامحدود عدد نمی‌گیرد ─────────────────────────────────────
  check('سود نامحدود پرچم می‌گیرد، نه عدد',
    single147.curve.unlimitedProfit === true
    && single147.curve.maxProfitRial === null
    && single147.curve.atMaxProfit === null);
  check('و زیانِ محدود عددش را دارد',
    single147.curve.unlimitedLoss === false
    && near(single147.curve.maxLossRial, -doc1.entryCashRial, 1e-6),
    `${single147.curve.maxLossRial}`);
  check('هیچ‌جا بی‌نهایت به عدد بزرگ تبدیل نمی‌شود',
    !/1e9|Number\.MAX|999999/.test(code147)
    && Object.values(single147.curve).every((value) => value !== Infinity));

  // ── بند ۵: موقعیت بسته در منحنی نیست ────────────────────────────────
  const closed147 = closePortfolioPosition(second147.session, fx147.evidence,
    second147.positionId);
  check('پیش‌شرط: موقعیت دوم بسته شد', closed147.ok, closed147.why);
  const after147 = portfolioPayoffCurve(closed147.session);
  check('موقعیت بسته از منحنی بیرون می‌رود',
    after147.ok && after147.positions.length === 1
    && after147.positions[0].id === first147.positionId, after147.why);
  check('و منحنی همان منحنی موقعیتِ باقی‌مانده می‌شود',
    JSON.stringify(after147.curve.breakevens)
      === JSON.stringify(single147.curve.breakevens));
  // نصفِ بسته‌شدهٔ یک موقعیت دیگر ریسکی ندارد.
  const half147 = closePortfolioPosition(first147.session, fx147.evidence,
    first147.positionId, { qty: 20 });
  const halfCurve147 = portfolioPayoffCurve(half147.session);
  check('پس از خروج جزئی، وزن پا با حجمِ باز هم‌تراز می‌شود',
    halfCurve147.legs[0].ratio === doc1.legs[0].ratio * 20
    && near(halfCurve147.curve.netCashRial, doc1.entryCashRial / 2, 1e-9),
    `${halfCurve147.legs[0].ratio}`);
  check('و سربه‌سری عوض نمی‌شود — نصف‌شدنِ هر دو طرف، شکل را نگه می‌دارد',
    near(halfCurve147.curve.breakevens[0], single147.curve.breakevens[0], 1e-6),
    `${halfCurve147.curve.breakevens[0]}`);

  // ── بند ۲: منحنی نصفه ساخته نمی‌شود ─────────────────────────────────
  const blind147 = JSON.parse(JSON.stringify(second147.session));
  const target147 = blind147.events.find((event) => event?.data?.commitVersion !== undefined);
  delete target147.data;
  const blindCurve147 = portfolioPayoffCurve(blind147);
  check('موقعیت بی‌سند کل منحنی را متوقف می‌کند',
    !blindCurve147.ok && blindCurve147.reason === 'undocumented'
    && blindCurve147.curve === null, blindCurve147.why);
  // منحنیِ نصفه بدتر از نبودِ منحنی است، چون شبیه منحنی است.
  check('و نام موقعیتِ مقصر گفته می‌شود، نه فقط «نشد»',
    blindCurve147.blocking.length === 1
    && blindCurve147.why.includes(blindCurve147.blocking[0]),
    blindCurve147.why);
  const cashless147 = JSON.parse(JSON.stringify(second147.session));
  delete cashless147.events.find((e) => e?.data?.commitVersion !== undefined)
    .data.entryCashRial;
  check('نقدِ ورودِ نبوده هم منحنی را متوقف می‌کند، نه اینکه صفر بگیرد',
    portfolioPayoffCurve(cashless147).reason === 'undocumented'
    || portfolioPayoffCurve(cashless147).reason === 'unknownCash',
    portfolioPayoffCurve(cashless147).reason);
  const feeless147 = JSON.parse(JSON.stringify(second147.session));
  delete feeless147.startSnapshot.capitalInputs.fees.option;
  check('نبودِ نرخ کارمزد، منحنیِ بی‌کارمزد نمی‌سازد',
    portfolioPayoffCurve(feeless147).reason === 'missingFees');

  // ── مرزهای عمومی ────────────────────────────────────────────────────
  check('ماژول قیمت لحظه‌ای نمی‌خواند — این منحنی سررسید است',
    !/walkBook|bookCapacity|buildChain|evidence/.test(code147));
  check('و جلسهٔ ورودی را دست‌نخورده می‌گذارد',
    second147.session.events.length === 2);
}
