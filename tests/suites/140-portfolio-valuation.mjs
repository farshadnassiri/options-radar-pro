// ۱۴۰. ارزش جاری موقعیت

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import {
  PORTFOLIO_VALUATION_VERSION, UNVALUED_REASONS, portfolioSessionValuation,
} from '../../core/portfolio-valuation.mjs';

group('۱۴۰. ارزش جاری موقعیت');
{
  const fx140 = portfolioFixture('valuation-140');
  const roomy140 = JSON.parse(JSON.stringify(fx140.baseSession));
  roomy140.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session140 = {
    ...roomy140,
    lockedMission: fx140.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  // ── بند ۶: جلسهٔ بدون موقعیت ────────────────────────────────────────
  const empty140 = portfolioSessionValuation(session140, fx140.evidence);
  check('جلسهٔ بدون موقعیت، فهرست خالی می‌دهد نه خطا',
    empty140.ok && empty140.version === PORTFOLIO_VALUATION_VERSION
    && empty140.empty === true && empty140.rows.length === 0, empty140.why);
  check('و علتِ خالی‌بودن نوشته می‌شود',
    empty140.note.includes('هیچ موقعیتی'), empty140.note);
  check('جمعِ کل روی جلسهٔ خالی، صفرِ ساختگی نمی‌سازد',
    empty140.totals.complete === false && empty140.totals.valueRial === null
    && empty140.totals.unrealizedRial === null);
  check('جلسهٔ نبوده، علت خودش را دارد',
    portfolioSessionValuation(null, fx140.evidence).reason === 'noSession');

  // ── پیش‌شرط ─────────────────────────────────────────────────────────
  const done140 = commitPortfolioPlan(session140, fx140.evidence,
    portfolioRankedPlans(session140, fx140.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done140.ok, done140.why);
  const doc140 = done140.event.data;
  const view140 = portfolioSessionValuation(done140.session, fx140.evidence);
  const row140 = view140.rows[0] || {};

  // ── بند ۱: ارزش از سمت وارونه ───────────────────────────────────────
  // پای خریداری‌شده با فروختن نقد می‌شود، پس ارزشش قیمت `bid` است نه
  // `ask`. خواندن از سمت ورود یعنی ارزشی که هیچ‌وقت نقد نمی‌شود.
  const sellVwap140 = fx140.evidence.rows
    .find((r) => r.candidateId === `${doc140.legs[0].ins}:sell`).execution.vwap;
  const buyVwap140 = fx140.evidence.rows
    .find((r) => r.candidateId === `${doc140.legs[0].ins}:buy`).execution.vwap;
  check('پیش‌شرط: دو سمت دفتر دو قیمت متفاوت دارند',
    sellVwap140 !== buyVwap140 && sellVwap140 < buyVwap140,
    `${sellVwap140} / ${buyVwap140}`);
  check('ارزش پای خریداری‌شده از سمت فروش دفتر می‌آید',
    row140.valued === true
    && near(row140.valueRial,
      sellVwap140 * doc140.legs[0].ratio * doc140.legs[0].size * 40, 1e-9),
    `${row140.valueRial}`);
  check('و همان نیست که با قیمت ورود درمی‌آمد',
    row140.valueRial !== buyVwap140 * doc140.legs[0].ratio * doc140.legs[0].size * 40);
  // خرید روی ask و ارزش‌گذاری روی bid: زیانِ اسپرد از لحظهٔ اول دیده
  // می‌شود. صفر درآمدنش یعنی جایی سمت را اشتباه خوانده‌ایم.
  check('زیان اسپرد از همان لحظهٔ اول دیده می‌شود',
    row140.unrealizedRial < 0, `${row140.unrealizedRial}`);

  // ── بند ۳: هر دو کارمزد در سود ──────────────────────────────────────
  check('کارمزد فرضیِ خروج جدا گزارش می‌شود',
    Number.isFinite(row140.exitFeeRial) && row140.exitFeeRial > 0);
  check('کارمزد ورود هم از سند می‌آید و جدا می‌ماند',
    row140.entryFeeRial === doc140.capital.components.feeRial);
  // نادیده‌گرفتن هرکدام، سود را دقیقاً به اندازهٔ خودش بزرگ‌تر نشان
  // می‌دهد — عددی که هیچ‌وقت گرفته نمی‌شود.
  check('سود تحقق‌نیافته هر دو کارمزد را کم می‌کند',
    near(row140.unrealizedRial,
      row140.valueRial + row140.entryCashRial - row140.exitFeeRial - row140.entryFeeRial,
      1e-9), `${row140.unrealizedRial}`);
  check('و نقد ورود با علامت خودش می‌آید، نه قدرمطلق',
    row140.entryCashRial < 0 && row140.entryCashRial === doc140.entryCashRial);

  // ── هم‌ترازی مبنا با حجم باز ────────────────────────────────────────
  // سند برای حجم اولیه نوشته شده. سنجیدنِ ارزشِ حجمِ باقی‌مانده در برابر
  // هزینهٔ حجمِ اولیه، یک زیانِ ساختگی می‌سازد.
  const part140 = closePortfolioPosition(done140.session, fx140.evidence,
    done140.positionId, { qty: 10 });
  check('پیش‌شرط: خروج جزئی ثبت شد', part140.ok, part140.why);
  const partRow140 = portfolioSessionValuation(part140.session, fx140.evidence).rows[0] || {};
  check('پس از خروج جزئی، مبنا با حجم باز هم‌تراز می‌شود',
    partRow140.openQty === 30
    && near(partRow140.entryCashRial, doc140.entryCashRial * 0.75, 1e-9),
    `${partRow140.entryCashRial}`);
  check('و سود تحقق‌نیافته دقیقاً به همان نسبت است، نه زیانِ ساختگی',
    near(partRow140.unrealizedRial, row140.unrealizedRial * 0.75, 1e-9),
    `${partRow140.unrealizedRial} در برابر ${row140.unrealizedRial}`);

  // ── بند ۴: موقعیت بسته ──────────────────────────────────────────────
  const closed140 = closePortfolioPosition(done140.session, fx140.evidence, done140.positionId);
  const closedRow140 = portfolioSessionValuation(closed140.session, fx140.evidence).rows[0] || {};
  check('موقعیت بسته ارزش جاری ندارد',
    closedRow140.valued === false && closedRow140.reason === 'closed'
    && closedRow140.why === UNVALUED_REASONS.closed);
  // صفر یعنی «سنجیدیم و هیچ بود»؛ اینجا اصلاً سنجیدنی نیست.
  check('و عددش null است نه صفر',
    closedRow140.valueRial === null && closedRow140.unrealizedRial === null
    && closedRow140.exitFeeRial === null);

  // ── بند ۲: نبودِ عدد با عدد جایگزین نمی‌شود ─────────────────────────
  const stale140 = JSON.parse(JSON.stringify(fx140.evidence));
  stale140.now = { date: fx140.at.date, second: fx140.at.second + 60 };
  check('مدرکِ لحظهٔ دیگر، ارزش نمی‌دهد',
    portfolioSessionValuation(done140.session, stale140).reason === 'staleEvidence');
  check('مدرک ناموفق هم همین‌طور',
    portfolioSessionValuation(done140.session, { ok: false, rows: [] })
      .reason === 'staleEvidence');

  const rejected140 = JSON.parse(JSON.stringify(fx140.evidence));
  for (const r of rejected140.rows) if (r.side === 'sell') r.accepted = false;
  const rejRow140 = portfolioSessionValuation(done140.session, rejected140).rows[0] || {};
  check('پای بی‌حکم، ارزش نمی‌گیرد و علتش می‌ماند',
    rejRow140.valued === false && rejRow140.reason === 'rejectedLeg'
    && rejRow140.valueRial === null && rejRow140.ins.length > 0);

  const priceless140 = JSON.parse(JSON.stringify(fx140.evidence));
  for (const r of priceless140.rows) r.execution.vwap = 0;
  const noPrice140 = portfolioSessionValuation(done140.session, priceless140).rows[0] || {};
  check('قیمت نامعلوم با پایانی یا صفر جایگزین نمی‌شود',
    noPrice140.valued === false && noPrice140.reason === 'unknownPrice'
    && noPrice140.valueRial === null);
  const code140 = readSrc('../core/portfolio-valuation.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('و ماژول اصلاً سراغ قیمت پایانی نمی‌رود',
    !/\.close\b|closePrice|lastPrice|spot/i.test(code140));

  const blind140 = JSON.parse(JSON.stringify(done140.session));
  delete blind140.events.find((e) => e?.data?.commitVersion !== undefined).data;
  const blindRow140 = portfolioSessionValuation(blind140, fx140.evidence).rows[0] || {};
  check('موقعیت بی‌سند ارزش نمی‌گیرد ولی از فهرست حذف نمی‌شود',
    blindRow140.valued === false && blindRow140.reason === 'undocumented'
    && blindRow140.valueRial === null);

  const feeless140 = JSON.parse(JSON.stringify(done140.session));
  delete feeless140.startSnapshot.capitalInputs.fees.option;
  check('نبودِ نرخ کارمزد، سودِ بی‌کارمزد نمی‌سازد',
    portfolioSessionValuation(feeless140, fx140.evidence).reason === 'missingFees');

  // ── بند ۵: جمعِ نصفه ────────────────────────────────────────────────
  check('وقتی همه ارزش دارند، جمعِ کل ساخته می‌شود',
    view140.totals.complete === true && view140.totals.openCount === 1
    && view140.totals.valuedCount === 1
    && view140.totals.unrealizedRial === row140.unrealizedRial);
  const halfKnown140 = portfolioSessionValuation(done140.session, rejected140);
  check('یک موقعیتِ بی‌ارزش، جمعِ کل را null می‌کند',
    halfKnown140.ok && halfKnown140.totals.complete === false
    && halfKnown140.totals.valueRial === null
    && halfKnown140.totals.unrealizedRial === null, halfKnown140.why);
  check('ولی شمارش‌ها همچنان می‌گویند چند تا معلوم نشد',
    halfKnown140.totals.openCount === 1 && halfKnown140.totals.valuedCount === 0
    && halfKnown140.totals.unvaluedCount === 1);
  check('و جمعِ نصفه هیچ‌جا ساخته نمی‌شود',
    /complete \? sum\('valueRial'\) : null/.test(code140));

  // ── مرزهای عمومی ────────────────────────────────────────────────────
  check('ماژول هیچ عددی از دفتر سفارشِ خودش نمی‌سازد',
    !/walkBook|bookCapacity|buildChain/.test(code140));
  check('و جلسهٔ ورودی را دست‌نخورده می‌گذارد',
    done140.session.events.length === 1);
}
