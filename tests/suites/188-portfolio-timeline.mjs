// ۱۸۸. سری زمانی سود و زیان سفر در زمان

import { check, group, near } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import {
  PORTFOLIO_TIMELINE_MODES, portfolioTimeline,
} from '../../core/portfolio-timeline.mjs';

group('۱۸۸. سری زمانی سود و زیان');
{
  const fx188 = portfolioFixture('timeline-188');
  const roomy188 = JSON.parse(JSON.stringify(fx188.baseSession));
  roomy188.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session188 = {
    ...roomy188,
    lockedMission: fx188.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  const plans188 = portfolioRankedPlans(session188, fx188.evidence);
  const topId188 = plans188.ranking.ranked[0].candidateId;
  const done188 = commitPortfolioPlan(session188, fx188.evidence, topId188);
  check('پیش‌شرط: یک طرح ثبت شد', done188.ok, done188.why);
  const live188 = done188.session;

  // مدرک لحظه‌های بعد: همان دفتر، فقط با مهرِ زمانِ آن پله.
  const at188 = fx188.at;
  const later = (minutes) => ({ date: at188.date, second: at188.second + minutes * 60 });
  const evidenceAt = (at, { priceShift = 0, blindIns = null } = {}) => ({
    ok: true,
    now: { ...at },
    rows: fx188.evidence.rows
      .filter((row) => row.ins !== blindIns)
      .map((row) => ({
        ...row,
        execution: { ...row.execution, vwap: row.execution.vwap + priceShift },
      })),
  });

  const steps188 = [
    { at: at188, evidence: evidenceAt(at188) },
    { at: later(30), evidence: evidenceAt(later(30), { priceShift: 10 }) },
    { at: later(60), evidence: evidenceAt(later(60), { priceShift: 20 }) },
  ];

  const series188 = portfolioTimeline(live188, steps188, { mode: 'strict' });
  check('سری برای هر پله یک نقطه می‌سازد',
    series188.ok && series188.steps.length === 3, series188.why);
  check('هر استراتژی با شناسه و خانواده‌اش یک بار فهرست می‌شود',
    series188.strategies.length === 1
    && series188.strategies[0].defId.length > 0
    && series188.strategies[0].familyId.length > 0);

  // ── بند ۱: عدد نمودار همان عددِ بستنِ واقعی است ─────────────────────
  // اگر این دو فرق کنند، نمودار چیزی نشان می‌دهد که با بستن به دست
  // نمی‌آید — یعنی دروغ.
  const first188 = series188.steps[0].rows[0];
  check('سود و زیان پلهٔ اول از فرمول بستنِ واقعی می‌آید',
    first188.known
    && near(first188.pnlRial,
      first188.exitCashRial + live188.events[0].data.entryCashRial
      - first188.exitFeeRial - live188.events[0].data.capital.components.feeRial, 1e-9),
    String(first188.pnlRial));

  // ── بند ۲: جهت حرکت ─────────────────────────────────────────────────
  // طرح برتر خرید است، پس گران‌ترشدن مظنه باید سودش را بالا ببرد.
  const path188 = series188.steps.map((step) => step.totalPnlRial);
  check('گران‌ترشدن مظنه، سود موقعیت خریداری‌شده را بالا می‌برد',
    path188.every((value) => value !== null)
    && path188[1] > path188[0] && path188[2] > path188[1], JSON.stringify(path188));

  // ── بند ۳: نبودِ قیمت، صفر نمی‌شود ─────────────────────────────────
  const blindIns188 = live188.events[0].data.legs[0].ins;
  const blind188 = portfolioTimeline(live188, [
    steps188[0],
    { at: later(30), evidence: evidenceAt(later(30), { blindIns: blindIns188 }) },
  ], { mode: 'strict' });
  const gap188 = blind188.steps[1];
  check('پله‌ای که قیمت اجرایی ندارد، «نامعلوم» می‌ماند و صفر نمی‌شود',
    blind188.ok && gap188.rows[0].known === false
    && gap188.rows[0].pnlRial === null && gap188.totalPnlRial === null, gap188.rows[0].why);
  check('و علتش صریح گفته می‌شود، نه یک شکاف بی‌توضیح',
    gap188.rows[0].why.length > 0 && gap188.unknownIds.length === 1);

  // ── بند ۴: حالت پیوسته‌سازی ─────────────────────────────────────────
  const carried188 = portfolioTimeline(live188, [
    steps188[0],
    { at: later(30), evidence: evidenceAt(later(30), { blindIns: blindIns188 }) },
  ], { mode: 'carry' });
  const kept188 = carried188.steps[1];
  check('حالت پیوسته، آخرین قیمت معلوم را می‌برد و عدد می‌سازد',
    kept188.rows[0].known === true && kept188.rows[0].pnlRial !== null);
  check('ولی آن عدد «تخمینی» نشان می‌خورد و لحظهٔ منبعش را می‌برد',
    kept188.estimated === true && kept188.rows[0].estimated === true
    && kept188.rows[0].estimatedLegs.length === 1
    && kept188.rows[0].estimatedLegs[0].asOf.second === at188.second);
  // قیمت حمل‌شده همان قیمتِ پلهٔ قبل است، پس سود هم باید همان باشد.
  check('قیمت حمل‌شده چیزی نمی‌سازد — همان عدد پلهٔ قبل است',
    near(kept188.rows[0].pnlRial, carried188.steps[0].rows[0].pnlRial, 1e-9));
  check('و اولین پله، بی‌آنکه چیزی حمل شود، تخمینی نیست',
    carried188.steps[0].estimated === false);

  // ── بند ۵: نگاه به آینده ────────────────────────────────────────────
  // رویدادی که بعد از یک پله رخ داده، در آن پله نباید دیده شود.
  const early188 = portfolioTimeline(live188, [{
    at: { date: at188.date, second: at188.second - 60 },
    evidence: evidenceAt({ date: at188.date, second: at188.second - 60 }),
  }], { mode: 'strict' });
  check('پلهٔ پیش از ثبت، هیچ موقعیتی نمی‌بیند — رویداد آینده وارد نمی‌شود',
    early188.ok && early188.steps[0].rows.length === 0
    && early188.steps[0].totalPnlRial === null);

  // ── بند ۶: درصدها ───────────────────────────────────────────────────
  const pct188 = series188.steps[0];
  check('درصد هر استراتژی روی سرمایهٔ درگیرِ خودش حساب می‌شود',
    near(pct188.rows[0].pnlPct,
      (pct188.rows[0].pnlRial / live188.events[0].data.capitalRial) * 100, 1e-9));
  check('و بازده کل روی سرمایهٔ شروع جلسه، جدا از مبنای درگیر',
    near(pct188.returnOnCapitalPct,
      (pct188.totalPnlRial / live188.capital.initialRial) * 100, 1e-9)
    && pct188.capitalBaseRial === live188.events[0].data.capitalRial);

  // ── بند ۷: خروجِ جزئی — محقق‌شده و تحقق‌نیافته با هم ────────────────
  // بدون یک خروج واقعی، «محقق‌شده» همیشه صفر است و اشتباهِ جمع‌نکردنش
  // دیده نمی‌شود.
  const exitAt188 = later(30);
  const closed188 = closePortfolioPosition(live188, evidenceAt(exitAt188, { priceShift: 10 }),
    live188.events[0].positionId, { qty: 10, at: exitAt188 });
  check('پیش‌شرط: بخشی از موقعیت در پلهٔ دوم بسته شد', closed188.ok, closed188.why);
  const partial188 = portfolioTimeline(closed188.session, [
    { at: at188, evidence: evidenceAt(at188) },
    { at: exitAt188, evidence: evidenceAt(exitAt188, { priceShift: 10 }) },
  ], { mode: 'strict' });
  const after188 = partial188.steps[1].rows[0];
  const realized188 = closed188.event.data.realizedRial;
  check('پس از خروج جزئی، حجم باز کم می‌شود ولی موقعیت باز می‌ماند',
    after188.openQty === 30 && after188.status === 'open'
    && partial188.steps[0].rows[0].openQty === 40);
  check('سود محقق‌شدهٔ خروج در همان پله شمرده می‌شود',
    near(after188.realizedRial, realized188, 1e-9),
    `${after188.realizedRial} در برابر ${realized188}`);
  check('و سود کل، جمعِ محقق‌شده و تحقق‌نیافته است — نه یکی از آن دو',
    near(after188.pnlRial, after188.realizedRial + after188.unrealizedRial, 1e-9)
    && after188.realizedRial !== 0 && after188.unrealizedRial !== 0);
  check('پلهٔ پیش از خروج، سود محقق‌شده‌ای نمی‌بیند — رویداد هنوز نیفتاده',
    partial188.steps[0].rows[0].realizedRial === 0);

  // ارزش خروج مستقل از خروجی خودِ ماژول بازحساب می‌شود: قیمت اجرایی ضربدر
  // اندازهٔ قرارداد ضربدر حجمِ باز. وگرنه جاافتادنِ ضرب در حجم دیده نمی‌شود.
  const exitLeg188 = live188.events[0].data.legs[0];
  const exitVwap188 = fx188.evidence.rows
    .find((row) => row.candidateId === `${exitLeg188.ins}:sell`).execution.vwap;
  check('ارزش خروج، قیمت اجرایی ضربدر اندازهٔ قرارداد ضربدر حجم باز است',
    near(first188.exitCashRial,
      exitVwap188 * exitLeg188.size * exitLeg188.ratio * first188.openQty, 1e-9),
    String(first188.exitCashRial));

  // موقعیتِ کاملاً بسته دیگر پایی برای قیمت‌گرفتن ندارد؛ نبودِ مظنه در
  // پله‌های بعدش «نامعلوم» نیست، چون چیزی برای ارزش‌گذاری نمانده.
  const doneAll188 = closePortfolioPosition(live188, evidenceAt(exitAt188),
    live188.events[0].positionId, { at: exitAt188 });
  check('پیش‌شرط: موقعیت کاملاً بسته شد', doneAll188.ok, doneAll188.why);
  const settled188 = portfolioTimeline(doneAll188.session, [
    { at: later(60), evidence: evidenceAt(later(60), { blindIns: blindIns188 }) },
  ], { mode: 'strict' });
  const rest188 = settled188.steps[0].rows[0];
  check('موقعیت بسته بی‌مظنه هم معلوم می‌ماند و سودش همان محقق‌شده است',
    rest188.known === true && rest188.openQty === 0
    && rest188.unrealizedRial === 0
    && near(rest188.pnlRial, doneAll188.event.data.realizedRial, 1e-9),
    `${rest188.why || rest188.pnlRial}`);

  // ── بند ۸: سه راهِ نامعلوم‌شدن، سه علتِ جدا ─────────────────────────
  const withEvent = (patch) => ({
    ...live188,
    events: live188.events.map((event, index) => (index === 0 ? patch(event) : event)),
  });
  const reasonOf = (session) => {
    const out = portfolioTimeline(session, [steps188[0]], { mode: 'strict' });
    return out.ok ? out.steps[0].rows[0].reason : `ناموفق:${out.reason}`;
  };
  check('موقعیت بی‌سند عدد نمی‌گیرد، علت می‌گیرد',
    reasonOf(withEvent((event) => ({
      ...event, data: { ...event.data, commitVersion: undefined },
    }))) === 'undocumented');
  check('مبنای ورودِ ناقص، صفر نمی‌شود',
    reasonOf(withEvent((event) => ({
      ...event,
      data: { ...event.data, capital: { ...event.data.capital, components: {} } },
    }))) === 'unknownBasis');
  const brokenExit188 = {
    ...closed188.session,
    events: closed188.session.events.map((event) => (event.transactionKind === 'reduce'
      ? { ...event, data: { ...event.data, realizedRial: null } } : event)),
  };
  check('خروجی که سودش معلوم نیست، کل موقعیت را نامعلوم می‌کند',
    portfolioTimeline(brokenExit188, [{ at: exitAt188, evidence: evidenceAt(exitAt188) }],
      { mode: 'strict' }).steps[0].rows[0].reason === 'unknownRealized');

  // ── بند ۹: ورودی‌های نامعتبر ────────────────────────────────────────
  check('جلسهٔ نبوده علت خودش را دارد',
    portfolioTimeline(null, steps188).reason === 'noSession');
  check('حالت ناشناخته پذیرفته نمی‌شود',
    portfolioTimeline(live188, steps188, { mode: 'guess' }).reason === 'unknownMode');
  check('پلهٔ بی‌پله علت خودش را دارد',
    portfolioTimeline(live188, []).reason === 'noSteps');
  check('پله‌های نامرتب رد می‌شوند — سری زمانی باید صعودی باشد',
    portfolioTimeline(live188, [steps188[1], steps188[0]]).reason === 'outOfOrder');
  check('پلهٔ تکراری هم رد می‌شود',
    portfolioTimeline(live188, [steps188[0], steps188[0]]).reason === 'outOfOrder');
  check('نبودِ نرخ کارمزد در عکس شروع، عدد حدسی نمی‌سازد',
    portfolioTimeline({
      ...live188,
      startSnapshot: { ...live188.startSnapshot, capitalInputs: { margin: {} } },
    }, steps188).reason === 'missingFees');
  check('هر دو حالت قیمت‌گذاری برچسب خواندنی دارند',
    Object.values(PORTFOLIO_TIMELINE_MODES).every((label) => label.length > 10));
}
