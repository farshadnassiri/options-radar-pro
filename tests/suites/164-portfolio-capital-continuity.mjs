// ۱۶۴. قرارداد تداوم سرمایه بین دو جلسه

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  PORTFOLIO_CAPITAL_CONTINUITY_VERSION, portfolioCapitalContinuity,
} from '../../core/portfolio-capital-continuity.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

group('۱۶۴. قرارداد تداوم سرمایه بین دو جلسه');
{
  const fx164 = portfolioFixture('continuity-164');
  const mission164 = fx164.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const closed164 = closeoutPortfolioSession(mission164, fx164.evidence, { force: true });
  const continuity164 = portfolioCapitalContinuity(closed164.session, closed164.dossier);

  check('پرونده کامل، قرارداد نسخه‌دار و آماده می‌سازد',
    continuity164.ok && continuity164.version === PORTFOLIO_CAPITAL_CONTINUITY_VERSION
    && continuity164.analysisVersion === 1 && continuity164.state === 'ready', continuity164.why);
  check('هویت منشأ و لحظه بستن جدا و کامل می‌مانند',
    continuity164.sourceSessionId === closed164.session.id
    && continuity164.sourcePortfolioId === closed164.session.portfolioId
    && continuity164.baseIns === closed164.session.baseIns
    && continuity164.closedAt.date === closed164.session.closedAt.date
    && continuity164.closedAt.second === closed164.session.closedAt.second);
  check('سرمایه شروع، تحقق‌یافته و نهایی با هم ادغام نمی‌شوند',
    continuity164.initialCapitalRial === 10_000_000
    && continuity164.realizedRial === 0
    && continuity164.finalCapitalRial === 10_000_000);
  check('منشأ نخست یک ردیف قابل حسابرسی دارد',
    continuity164.lineage.length === 1
    && continuity164.lineage[0].sessionId === closed164.session.id
    && continuity164.lineage[0].finalCapitalRial === continuity164.finalCapitalRial);

  check('جلسه باز سرمایه انتقالی نمی‌سازد', (() => {
    const out = portfolioCapitalContinuity(mission164, closed164.dossier);
    return !out.ok && out.reason === 'incompleteDossier' && out.finalCapitalRial === null;
  })());
  check('پرونده نسخه ناشناخته رد می‌شود', (() => {
    const dossier = structuredClone(closed164.dossier);
    dossier.version = 99;
    return portfolioCapitalContinuity(closed164.session, dossier).reason === 'incompleteDossier';
  })());
  check('پرونده ناهم‌هویت رد می‌شود', (() => {
    const dossier = structuredClone(closed164.dossier);
    dossier.sessionId = 'continuity-other';
    return portfolioCapitalContinuity(closed164.session, dossier).reason === 'incompleteDossier';
  })());
  check('تعهد باز، تحقق‌یافته نامعلوم و حسابداری ناقص عدد نمی‌سازند', (() => {
    const open = structuredClone(closed164.dossier);
    open.positions.open = 1;
    const unknown = structuredClone(closed164.dossier);
    unknown.realized.totalRial = null;
    const noAccounting = structuredClone(closed164.dossier);
    noAccounting.accounting = null;
    return [open, unknown, noAccounting].every((dossier) => {
      const out = portfolioCapitalContinuity(closed164.session, dossier);
      return !out.ok && out.finalCapitalRial === null && out.lineage.length === 0;
    });
  })());
  check('هویت یا لحظه بستن ناقص حدس زده نمی‌شود', (() => {
    const noPortfolio = structuredClone(closed164.session);
    noPortfolio.portfolioId = '';
    const oddMoment = structuredClone(closed164.dossier);
    oddMoment.closedAt.second += 1;
    return portfolioCapitalContinuity(noPortfolio, closed164.dossier).reason === 'missingIdentity'
      && portfolioCapitalContinuity(closed164.session, oddMoment).reason === 'missingClosedAt';
  })());

  check('سرمایه نهایی صفر صریحاً exhausted است', (() => {
    const session = structuredClone(closed164.session);
    session.capital.initialRial = 1_000;
    const dossier = structuredClone(closed164.dossier);
    dossier.realized.totalRial = -1_000;
    const out = portfolioCapitalContinuity(session, dossier);
    return out.ok && out.state === 'exhausted' && out.finalCapitalRial === 0;
  })());
  check('سرمایه نهایی منفی یا نامتناهی رد می‌شود', (() => {
    const negative = structuredClone(closed164.dossier);
    negative.realized.totalRial = -20_000_000;
    const hugeSession = structuredClone(closed164.session);
    hugeSession.capital.initialRial = Number.MAX_VALUE;
    const huge = structuredClone(closed164.dossier);
    huge.realized.totalRial = Number.MAX_VALUE;
    return portfolioCapitalContinuity(closed164.session, negative).reason === 'invalidCapital'
      && portfolioCapitalContinuity(hugeSession, huge).reason === 'invalidCapital';
  })());

  check('پرونده دوم فقط با تطابق سرمایه، زنجیره را ادامه می‌دهد', (() => {
    const fxNext = portfolioFixture('continuity-164-next');
    const nextSession = structuredClone(fxNext.sessionWith(BULLISH_OUTLOOK, WIDE_RISK));
    nextSession.capital.initialRial = continuity164.finalCapitalRial;
    const nextClosed = closeoutPortfolioSession(nextSession, fxNext.evidence, { force: true });
    const out = portfolioCapitalContinuity(nextClosed.session, nextClosed.dossier, {
      previous: continuity164,
    });
    return out.ok && out.lineage.length === 2
      && out.lineage[0].sessionId === continuity164.sourceSessionId
      && out.lineage[1].sessionId === nextClosed.session.id;
  })());
  check('ناهمخوانی سرمایه یا تکرار جلسه، زنجیره جعلی نمی‌سازد', (() => {
    const fxNext = portfolioFixture('continuity-164-mismatch');
    const nextMission = fxNext.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
    const nextClosed = closeoutPortfolioSession(nextMission, fxNext.evidence, { force: true });
    const prior = structuredClone(continuity164);
    prior.finalCapitalRial = 9_000_000;
    prior.lineage[0].finalCapitalRial = 9_000_000;
    const mismatch = portfolioCapitalContinuity(nextClosed.session, nextClosed.dossier, {
      previous: prior,
    });
    const duplicate = portfolioCapitalContinuity(closed164.session, closed164.dossier, {
      previous: continuity164,
    });
    return mismatch.reason === 'capitalMismatch' && duplicate.reason === 'duplicateSession';
  })());
  check('سرمایه تمام‌شده به‌عنوان جلسه مثبت ادامه نمی‌یابد', (() => {
    const exhausted = structuredClone(continuity164);
    exhausted.state = 'exhausted';
    exhausted.finalCapitalRial = 0;
    exhausted.lineage[0].finalCapitalRial = 0;
    return portfolioCapitalContinuity(closed164.session, closed164.dossier, {
      previous: exhausted,
    }).reason === 'exhaustedPrevious';
  })());

  check('JSON round-trip قرارداد را تغییر نمی‌دهد',
    JSON.stringify(JSON.parse(JSON.stringify(continuity164))) === JSON.stringify(continuity164));
  check('خروجی از تغییر بعدی ورودی و زنجیره قبلی مستقل است', (() => {
    const session = structuredClone(closed164.session);
    const dossier = structuredClone(closed164.dossier);
    const sessionBefore = JSON.stringify(session);
    const dossierBefore = JSON.stringify(dossier);
    const out = portfolioCapitalContinuity(session, dossier);
    const untouched = JSON.stringify(session) === sessionBefore
      && JSON.stringify(dossier) === dossierBefore;
    session.closedAt.second += 10;
    dossier.closedAt.second += 20;
    return untouched && out.closedAt.second === closed164.session.closedAt.second
      && out.lineage[0].closedAt.second === closed164.session.closedAt.second;
  })());

  const src164 = readSrc('../core/portfolio-capital-continuity.mjs');
  check('قرارداد از تحلیل موجود استفاده می‌کند و مالی موازی ندارد',
    /portfolioDossierAnalysis\(session, dossier\)/.test(src164)
    && !/initialCapitalRial\s*\+|realizedRial\s*\+|fetch\(|document\.|window\./.test(src164));
}
