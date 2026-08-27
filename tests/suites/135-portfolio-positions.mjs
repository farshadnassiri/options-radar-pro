// ۱۳۵. موقعیت‌های باز جلسه

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { replayPortfolioSession } from '../../core/portfolio-session.mjs';
import {
  PORTFOLIO_POSITIONS_VERSION, UNDOCUMENTED_REASONS, portfolioSessionPositions,
} from '../../core/portfolio-positions.mjs';

group('۱۳۵. موقعیت‌های باز جلسه');
{
  const fx135 = portfolioFixture('positions-135');
  // بودجهٔ تک‌پایهٔ چیدمان مشترک تنگ است و طرح برتر را رد می‌کند؛ موضوع
  // اینجا خواندن موقعیت است نه دروازهٔ بودجه.
  const roomy135 = JSON.parse(JSON.stringify(fx135.baseSession));
  roomy135.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session135 = {
    ...roomy135,
    lockedMission: fx135.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  // ── بند ۶: جلسهٔ بدون ثبت ───────────────────────────────────────────
  const empty135 = portfolioSessionPositions(session135);
  check('جلسهٔ بدون ثبت، فهرست خالی می‌دهد نه خطا',
    empty135.ok && empty135.version === PORTFOLIO_POSITIONS_VERSION
    && empty135.positions.length === 0 && empty135.empty === true, empty135.why);
  check('و خالی‌بودن بی‌صدا نمی‌ماند — علتش نوشته می‌شود',
    empty135.note.includes('هیچ موقعیتی') && empty135.counts.total === 0);
  check('جلسهٔ نبوده، علت خودش را دارد',
    portfolioSessionPositions(null).reason === 'noSession'
    && portfolioSessionPositions(null).positions.length === 0);

  // ── پیش‌شرط: یک ثبت واقعی ───────────────────────────────────────────
  const plans135 = portfolioRankedPlans(session135, fx135.evidence);
  const topId135 = plans135.ranking.ranked[0].candidateId;
  const done135 = commitPortfolioPlan(session135, fx135.evidence, topId135);
  check('پیش‌شرط: یک طرح ثبت شد', done135.ok, done135.why);
  const view135 = portfolioSessionPositions(done135.session);
  const row135 = view135.positions[0] || {};
  const doc135 = done135.event.data;

  // ── بند ۱: پاها از سند، نه از بازار امروز ───────────────────────────
  check('موقعیت با شناسه و استراتژی و خانواده‌اش می‌آید',
    view135.positions.length === 1 && row135.id === done135.positionId
    && row135.strategyId === doc135.defId && row135.familyId === done135.event.familyId);
  check('هر پا با نوع، سمت، اعمال، حجم و قیمت ثبت‌شده می‌آید',
    row135.legs?.length === doc135.legs.length && row135.legs.length > 0
    && (row135.legs || []).every((leg, i) => leg.ins === doc135.legs[i].ins
      && leg.kind === doc135.legs[i].kind && leg.side === doc135.legs[i].side
      && leg.strike === doc135.legs[i].strike && leg.expiry === doc135.legs[i].expiry
      && leg.vwap === doc135.legs[i].vwap && leg.filled === doc135.legs[i].filled),
    JSON.stringify(row135.legs?.[0]));
  check('سرمایه و نقد ورود همان اعداد سندند',
    row135.capitalRial === doc135.capitalRial
    && row135.entryCashRial === doc135.entryCashRial
    && row135.capital?.components.totalRial === doc135.capital.components.totalRial);
  check('شناسهٔ ترکیب و رتبهٔ لحظهٔ ثبت هم می‌مانند',
    row135.candidateId === topId135 && row135.rank === doc135.rank);

  // اگر اعداد از بازار خوانده می‌شدند، عوض‌شدنِ دفتر سفارشِ جلسه گزارشِ
  // دیروز را عوض می‌کرد. سند باید مصون باشد.
  const moved135 = JSON.parse(JSON.stringify(done135.session));
  for (const contract of moved135.startSnapshot.contracts) {
    contract.quote.book = contract.quote.book.map((level) => ({
      ...level, bid: level.bid * 3, ask: level.ask * 3,
    }));
    contract.quote.close *= 3;
  }
  const afterMove135 = portfolioSessionPositions(moved135).positions[0] || {};
  check('تکان‌خوردن دفتر سفارش، گزارش موقعیتِ ثبت‌شده را عوض نمی‌کند',
    afterMove135.legs?.[0]?.vwap === row135.legs[0].vwap
    && afterMove135.capitalRial === row135.capitalRial);

  // ── بند ۳: هیچ ارزش‌گذاری‌ای ────────────────────────────────────────
  const code135 = readSrc('../core/portfolio-positions.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('ماژول قیمت لحظه‌ای نمی‌خواند و سود و زیان نمی‌سازد',
    !/buildChain|walkBook|bookCapacity|analyzePayoff|pnlAtExpiry|marketValue/
      .test(code135)
    && !/\bpnl\b/i.test(code135));
  check('و هیچ حساب تازه‌ای روی عدد ریالی نمی‌کند',
    (code135.match(/Rial[A-Za-z]*\s*[*+\-/]/g) || []).length === 0);
  check('خروجی هیچ میدان ارزش جاری ندارد',
    !Object.keys(row135).some((key) => /value|pnl|profit|loss/i.test(key)),
    Object.keys(row135).filter((k) => /value|pnl|profit|loss/i.test(k)).join('، ') || 'هیچ');

  // ── بند ۵: کیفیت از سند، پنهان‌نشده ─────────────────────────────────
  check('کیفیت داده‌ی موقعیت همان کیفیت سند است',
    row135.quality != null && row135.quality.kind === doc135.quality.kind);
  const estimated135 = JSON.parse(JSON.stringify(done135.session));
  estimated135.events.find((e) => e?.data?.commitVersion !== undefined)
    .data.quality = { kind: 'estimated', reason: 'پایانی به‌جای دفتر سفارش', sufficient: false };
  const estRow135 = portfolioSessionPositions(estimated135).positions[0] || {};
  check('کیفیت برآوردی پنهان نمی‌شود',
    estRow135.quality?.kind === 'estimated'
    && estRow135.quality?.reason.includes('پایانی'), JSON.stringify(estRow135.quality));

  // ── بند ۲: موقعیت بی‌سند حذف نمی‌شود ────────────────────────────────
  const blind135 = JSON.parse(JSON.stringify(done135.session));
  delete blind135.events.find((e) => e?.data?.commitVersion !== undefined).data;
  const blindView135 = portfolioSessionPositions(blind135);
  check('موقعیتِ بی‌سند از فهرست حذف نمی‌شود',
    blindView135.ok && blindView135.positions.length === 1
    && blindView135.counts.total === 1, blindView135.why);
  const blindRow135 = blindView135.positions[0] || {};
  check('و علتش صریح است، نه یک ردیف خالی',
    blindRow135.documented === false
    && blindRow135.undocumentedReason === 'missingDocument'
    && blindRow135.why === UNDOCUMENTED_REASONS.missingDocument);
  check('عدد نداشته، صفر نمی‌شود',
    blindRow135.capitalRial === null && blindRow135.entryCashRial === null
    && (blindRow135.legs || []).length === 0 && blindRow135.quality === null);
  check('ولی وضعیت و حجمش که از بازپخش می‌آید سالم می‌ماند',
    blindRow135.status === 'open' && blindRow135.openQty === row135.openQty);
  check('بی‌سندها شمرده و نام‌بُرده می‌شوند',
    blindView135.undocumented.count === 1
    && blindView135.undocumented.positionIds[0] === row135.id
    && blindView135.counts.undocumented === 1);
  check('و وقتی همه سند دارند، هشدارِ بی‌مورد ساخته نمی‌شود',
    view135.undocumented.count === 0 && view135.positions[0].why === '');

  // سندی که با نسخهٔ دیگری نوشته شده، «بی‌سند» است نه «سالم». خواندنش
  // یعنی میدان‌هایی که شاید معنی‌شان عوض شده باشد، قطعی گرفته می‌شوند.
  const older135 = JSON.parse(JSON.stringify(done135.session));
  older135.events.find((e) => e?.data?.commitVersion !== undefined).data.commitVersion = 0;
  const olderRow135 = portfolioSessionPositions(older135).positions[0] || {};
  check('سند با نسخهٔ بیگانه، قطعی خوانده نمی‌شود',
    olderRow135.documented === false
    && olderRow135.undocumentedReason === 'foreignVersion'
    && (olderRow135.legs || []).length === 0);

  // ── بند ۴: باز و بسته از هم جدا ─────────────────────────────────────
  check('موقعیت باز در فهرست باز است و در بسته نیست',
    view135.open.length === 1 && view135.closed.length === 0
    && view135.open[0].id === row135.id && view135.positions[0].open === true);
  check('شمارش‌ها با فهرست‌ها یکی‌اند',
    view135.counts.open === view135.open.length
    && view135.counts.closed === view135.closed.length
    && view135.counts.total === view135.positions.length);

  // حجمِ صفر با «بسته» یکی نیست. اگر وضعیت از روی عدد استنتاج شود، یک
  // قاعدهٔ دوم ساخته‌ایم که روزی با بازپخش اختلاف پیدا می‌کند.
  const zeroQty135 = JSON.parse(JSON.stringify(done135.session));
  const openEvent135 = zeroQty135.events.find((e) => e?.type === 'transaction');
  openEvent135.qty = 0;
  openEvent135.data.executableQty = 0;
  const zeroReplay135 = replayPortfolioSession(zeroQty135);
  check('پیش‌شرط: بازپخش موقعیتِ حجم‌صفر را همچنان باز می‌داند',
    zeroReplay135.ok && zeroReplay135.positions[0].openQty === 0
    && zeroReplay135.positions[0].status === 'open', zeroReplay135.why);
  const zeroRow135 = portfolioSessionPositions(zeroQty135).positions[0] || {};
  check('و این ماژول هم از روی حجم، «بسته» نتیجه نمی‌گیرد',
    zeroRow135.status === 'open' && zeroRow135.open === true
    && portfolioSessionPositions(zeroQty135).closed.length === 0);
  check('وضعیت از بازپخش گرفته می‌شود نه از مقایسهٔ حجم',
    !/openQty\s*===\s*0|openQty\s*<=?\s*0/.test(code135));

  // ── دفتر خرابِ بازپخش‌ناپذیر ─────────────────────────────────────────
  const broken135 = JSON.parse(JSON.stringify(done135.session));
  broken135.events.push({
    ...broken135.events[0],
    id: 'ev-broken', at: { date: 20260101, second: 0 },
  });
  const brokenView135 = portfolioSessionPositions(broken135);
  check('دفتر بازپخش‌ناپذیر، فهرست نیمه‌کاره نمی‌دهد',
    !brokenView135.ok && brokenView135.reason === 'brokenLedger'
    && brokenView135.positions.length === 0);
  check('و علتِ خودِ بازپخش را منتقل می‌کند، نه یک متن تازه',
    brokenView135.why === replayPortfolioSession(broken135).why, brokenView135.why);
}
