// ۱۳۳. دفتر سرمایهٔ جلسه

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import {
  PORTFOLIO_LEDGER_VERSION, ledgerRoomFor, portfolioCapitalLedger,
} from '../../core/portfolio-ledger.mjs';

group('۱۳۳. دفتر سرمایهٔ جلسه');
{
  const fx133 = portfolioFixture('ledger-133');
  const roomy133 = JSON.parse(JSON.stringify(fx133.baseSession));
  roomy133.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const withRisk133 = (risk) => ({
    ...roomy133,
    lockedMission: fx133.sessionWith(BULLISH_OUTLOOK, risk).lockedMission,
  });
  const session133 = withRisk133(WIDE_RISK);

  const empty133 = portfolioCapitalLedger(session133);
  check('جلسهٔ بدون ثبت، دفتر خالی و سالم می‌دهد',
    empty133.ok && empty133.version === PORTFOLIO_LEDGER_VERSION
    && empty133.committed.totalRial === 0 && empty133.free.rial === 10_000_000
    && near(empty133.free.pct, 100, 1e-9), empty133.why);

  const plans133 = portfolioRankedPlans(session133, fx133.evidence);
  const topId133 = plans133.ranking.ranked[0].candidateId;
  const done133 = commitPortfolioPlan(session133, fx133.evidence, topId133);
  check('پیش‌شرط: یک طرح ثبت شد', done133.ok, done133.why);
  const after133 = portfolioCapitalLedger(done133.session);
  const source133 = plans133.sources.get(topId133);
  const parts133 = source133.capital.components;

  // ── بند ۱: فقط از دفتر رویداد و مأموریت ─────────────────────────────
  const ledgerCode133 = readSrc('../core/portfolio-ledger.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('دفتر فقط از رویدادها و مأموریت می‌خواند، نه شمارندهٔ موازی',
    /session\?\.events|session\.events/.test(ledgerCode133)
    && /lockedMission\?\.risk/.test(ledgerCode133)
    && !/assignedRial|unassignedRial/.test(ledgerCode133));
  check('جمع درگیر دقیقاً همان عددی است که در سند ثبت شده',
    after133.committed.totalRial === source133.capital.components.totalRial
    && after133.committed.count === 1);

  // ── بند ۲: اجزا جدا می‌مانند ────────────────────────────────────────
  check('بدهکار، کارمزد و وجه تضمین جدا گزارش می‌شوند',
    after133.committed.debitRial === parts133.debitRial
    && after133.committed.feeRial === parts133.feeRial
    && after133.committed.marginRial === parts133.marginRial);
  check('تفکیک خانواده با شناسه و شمار می‌آید',
    after133.committed.byFamily.length === 1
    && after133.committed.byFamily[0].familyId === done133.event.familyId
    && after133.committed.byFamily[0].count === 1
    && after133.committed.byFamily[0].totalRial === parts133.totalRial);
  check('سرمایهٔ آزاد از مبنای جلسه کم می‌شود، نه از جای دیگر',
    after133.free.rial === 10_000_000 - parts133.totalRial
    && near(after133.free.pct, (after133.free.rial / 10_000_000) * 100, 1e-9));

  const reduced133 = closePortfolioPosition(done133.session, fx133.evidence,
    done133.positionId, { qty: 10 });
  const reducedLedger133 = portfolioCapitalLedger(reduced133.session);
  check('کاهش FIFO سرمایه همان lot را به نسبت حجم آزاد می‌کند',
    reduced133.ok
    && near(reducedLedger133.committed.totalRial, parts133.totalRial * 0.75, 1e-9)
    && near(reducedLedger133.free.rial, 10_000_000 - parts133.totalRial * 0.75, 1e-9));
  const closedLedger133 = portfolioCapitalLedger(
    closePortfolioPosition(reduced133.session, fx133.evidence, done133.positionId).session,
  );
  check('آفست کامل همه سرمایه lot را آزاد می‌کند',
    closedLedger133.ok && closedLedger133.committed.totalRial === 0
    && closedLedger133.free.rial === 10_000_000 && closedLedger133.committed.count === 0);

  // ── بند ۳: هر دو قید، با عدد جاری و حد ──────────────────────────────
  const minFree133 = after133.risk.minFreeCapital;
  const maxMargin133 = after133.risk.maxMarginUse;
  check('حداقل سرمایهٔ آزاد با مقدار جاری و حد و حکم می‌آید',
    minFree133.limitPct === WIDE_RISK.minFreeCapitalPct
    && minFree133.currentRial === after133.free.rial
    && minFree133.limitRial === 1_000_000
    && minFree133.breached === false && minFree133.label.length > 0);
  check('سقف وجه تضمین هم همان‌طور می‌آید',
    maxMargin133.limitPct === WIDE_RISK.maxMarginUsePct
    && maxMargin133.currentRial === parts133.marginRial
    && maxMargin133.breached === false);
  check('حکم یک پرچم تنها نیست — عدد جاری کنارش هست',
    Number.isFinite(minFree133.currentPct) && Number.isFinite(maxMargin133.currentPct));

  // شکستن قید: سرمایهٔ آزاد
  const strict133 = withRisk133({ ...WIDE_RISK, minFreeCapitalPct: 90, maxMarginUsePct: 10 });
  const strictAfter133 = portfolioCapitalLedger({
    ...strict133, events: done133.session.events, counters: done133.session.counters,
  });
  check('وقتی سرمایهٔ آزاد زیر حد برود، شکستن صریح اعلام می‌شود',
    strictAfter133.risk.minFreeCapital.breached === true
    && strictAfter133.risk.minFreeCapital.currentPct < 90);

  // ── بند ۴: رویدادِ بی‌عدد ───────────────────────────────────────────
  const blind133 = JSON.parse(JSON.stringify(done133.session));
  delete blind133.events[0].data.capitalRial;
  const blindLedger133 = portfolioCapitalLedger(blind133);
  check('رویداد بدون عدد سرمایه، گزارش را null نمی‌کند',
    blindLedger133.ok && blindLedger133.committed.totalRial === 0, blindLedger133.why);
  check('ولی صریح شمرده و نام‌بُرده می‌شود، نه صفرِ بی‌صدا',
    blindLedger133.unpriced.count === 1
    && blindLedger133.unpriced.eventIds[0] === done133.event.id
    && blindLedger133.committed.count === 0);

  // ── بند ۵: ثبت، قیود جلسه را هم می‌سنجد ─────────────────────────────
  const strictFresh133 = withRisk133({ ...WIDE_RISK, minFreeCapitalPct: 90, maxMarginUsePct: 10 });
  const strictPlans133 = portfolioRankedPlans(strictFresh133, fx133.evidence);
  const strictId133 = strictPlans133.ok && strictPlans133.ranking.ranked.length
    ? strictPlans133.ranking.ranked[0].candidateId : null;
  check('ثبتی که سرمایهٔ آزاد را زیر حد ببرد رد می‌شود، با علت نام‌بُرده',
    strictId133 === null || (() => {
      const out = commitPortfolioPlan(strictFresh133, fx133.evidence, strictId133);
      return out.reason === 'missionRiskBreached'
        && out.breaches.some((row) => row.code === 'minFreeCapital')
        && out.why.includes('٪');
    })(),
    strictId133 === null ? 'با قید تنگ هیچ طرحی رتبه نگرفت' : 'رد شد');
  check('و حجم برای جا شدن کوچک نمی‌شود',
    !/executableQty\s*=\s*Math\.|Math\.min\([^)]*executableQty/
      .test(readSrc('../core/portfolio-commit.mjs')));
  check('پیش‌بینی جا، «کدام قید و با چه عددی» را می‌گوید نه بله/خیر',
    (() => {
      const room = ledgerRoomFor(done133.session, { capitalRial: 9_500_000, marginRial: 0 });
      return room.ok && room.breaches.length > 0
        && room.breaches[0].code === 'minFreeCapital'
        && Number.isFinite(room.breaches[0].wouldBePct);
    })());
  check('و وقتی جا هست، فهرست شکستن خالی است',
    ledgerRoomFor(done133.session, { capitalRial: 1000, marginRial: 0 }).breaches.length === 0);

  // ── بند ۶: نه ارزش‌گذاری، نه سود و زیان ─────────────────────────────
  check('دفتر هیچ ارزش جاری و سود و زیانی محاسبه نمی‌کند',
    !/analyzePayoff|pnlAtExpiry|markPrice|unrealized|سود و زیان/.test(ledgerCode133));
  check('و هیچ قیمتی از snapshot نمی‌خواند',
    !/startSnapshot|quote|book/.test(ledgerCode133));

  // ── ورودی‌های ناسالم ────────────────────────────────────────────────
  check('جلسهٔ بدون مأموریت قفل‌شده دفتر نمی‌گیرد',
    portfolioCapitalLedger({ ...session133, lockedMission: null }).reason === 'missingMission');
  check('مبنای سرمایهٔ نامعتبر رد می‌شود',
    portfolioCapitalLedger({ ...session133, capital: { initialRial: 0 } })
      .reason === 'invalidCapitalBase');
  check('نبود جلسه هم علت صریح می‌گیرد',
    portfolioCapitalLedger(null).reason === 'noSession');
}
