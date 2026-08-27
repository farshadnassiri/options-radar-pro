// ۱۳۹. خلاصهٔ حسابداری جلسه

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import {
  PORTFOLIO_SUMMARY_VERSION, portfolioSessionSummary,
} from '../../core/portfolio-summary.mjs';

group('۱۳۹. خلاصهٔ حسابداری جلسه');
{
  const fx139 = portfolioFixture('summary-139');
  const roomy139 = JSON.parse(JSON.stringify(fx139.baseSession));
  roomy139.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session139 = {
    ...roomy139,
    lockedMission: fx139.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  // ── بند ۶: جلسهٔ خالی ───────────────────────────────────────────────
  const empty139 = portfolioSessionSummary(session139);
  check('جلسهٔ خالی گزارش صفرِ صریح می‌دهد، نه خطا',
    empty139.ok && empty139.version === PORTFOLIO_SUMMARY_VERSION
    && empty139.empty === true && empty139.entries.count === 0
    && empty139.exits.count === 0 && empty139.fees.totalRial === 0, empty139.why);
  check('و صفر بودنش بی‌صدا نمی‌ماند',
    empty139.note.includes('هیچ تراکنشی'), empty139.note);
  check('جلسهٔ نبوده، علت خودش را دارد',
    portfolioSessionSummary(null).reason === 'noSession'
    && portfolioSessionSummary(null).entries === null);

  // ── پیش‌شرط: یک ورود و یک خروج جزئی ─────────────────────────────────
  const done139 = commitPortfolioPlan(session139, fx139.evidence,
    portfolioRankedPlans(session139, fx139.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done139.ok, done139.why);
  const entryDoc139 = done139.event.data;
  const part139 = closePortfolioPosition(done139.session, fx139.evidence,
    done139.positionId, { qty: 10 });
  check('پیش‌شرط: یک خروج جزئی ثبت شد', part139.ok, part139.why);
  const exitDoc139 = part139.event.data;
  const view139 = portfolioSessionSummary(part139.session);

  // ── بند ۱: فقط از دفتر رویداد ───────────────────────────────────────
  const code139 = readSrc('../core/portfolio-summary.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('خلاصه فقط از رویدادها می‌خواند، نه شمارندهٔ موازی',
    /session\?\.events|session\.events/.test(code139)
    && !/assignedRial|unassignedRial|counters/.test(code139));
  check('و شمارِ تراکنش‌ها با خودِ دفتر یکی است',
    view139.entries.count + view139.exits.count + view139.unpriced.count
      === part139.session.events.filter((e) => e.type === 'transaction').length);

  // ── بند ۲: ورود و خروج و کارمزد، سه عدد جدا ─────────────────────────
  check('نقد ورود همان عددِ سند ورود است',
    view139.entries.count === 1 && view139.entries.cashRial === entryDoc139.entryCashRial
    && view139.entries.capitalRial === entryDoc139.capitalRial);
  check('نقد خروج همان عددِ سند خروج است و جدا می‌ماند',
    view139.exits.count === 1 && view139.exits.cashRial === exitDoc139.exitCashRial
    && view139.exits.qty === 10);
  // خرید منفی است چون پول می‌دهی؛ فروش مثبت. یکی‌کردنِ علامت‌ها یعنی
  // نمی‌شود فهمید پول از کدام سمت رفت.
  check('علامت‌ها دست‌نخورده‌اند: ورود منفی، خروج مثبت',
    view139.entries.cashRial < 0 && view139.exits.cashRial > 0,
    `${view139.entries.cashRial} / ${view139.exits.cashRial}`);
  check('کارمزد جدا از هر دو جریان نقد می‌ماند',
    view139.fees.entryRial === entryDoc139.capital.components.feeRial
    && view139.fees.exitRial === exitDoc139.feeRial
    && near(view139.fees.totalRial, view139.fees.entryRial + view139.fees.exitRial, 1e-9));
  check('و هیچ‌جا داخل نقد نرفته',
    view139.entries.cashRial !== view139.entries.cashRial - view139.fees.entryRial
    && view139.exits.cashRial === exitDoc139.exitCashRial);

  // ── بند ۵: تفکیک خانواده و نوع خروج ─────────────────────────────────
  check('خروج جزئی و کامل جدا شمرده می‌شوند',
    view139.exits.partial === 1 && view139.exits.full === 0);
  const full139 = closePortfolioPosition(part139.session, fx139.evidence, done139.positionId);
  const after139 = portfolioSessionSummary(full139.session);
  check('و بستنِ باقی‌مانده «کامل» شمرده می‌شود',
    after139.exits.count === 2 && after139.exits.full === 1
    && after139.exits.partial === 1 && after139.exits.qty === 40, full139.why);
  check('تفکیک خانواده با شناسه و شمارِ ورود و خروج می‌آید',
    view139.byFamily.length === 1
    && view139.byFamily[0].familyId === done139.event.familyId
    && view139.byFamily[0].entries === 1 && view139.byFamily[0].exits === 1
    && view139.byFamily[0].entryCashRial === entryDoc139.entryCashRial
    && view139.byFamily[0].exitCashRial === exitDoc139.exitCashRial);
  check('شمار موقعیت‌ها از همان موتور موقعیت می‌آید',
    view139.positions.total === 1 && view139.positions.open === 1
    && after139.positions.closed === 1 && after139.positions.open === 0);

  // ── بند ۳: رویدادِ بی‌عدد ───────────────────────────────────────────
  check('وقتی همه‌چیز عدد دارد، هشدارِ بی‌مورد ساخته نمی‌شود',
    view139.unpriced.count === 0);
  const blind139 = JSON.parse(JSON.stringify(part139.session));
  const entryEvent139 = blind139.events.find((e) => e?.data?.commitVersion !== undefined);
  delete entryEvent139.data.entryCashRial;
  const blindView139 = portfolioSessionSummary(blind139);
  check('ورودِ بی‌عدد صفر حساب نمی‌شود',
    blindView139.ok && blindView139.entries.count === 0
    && blindView139.entries.cashRial === 0
    && blindView139.unpriced.count === 1, blindView139.why);
  check('و شناسه‌اش نام‌بُرده می‌شود',
    blindView139.unpriced.eventIds[0] === entryEvent139.id,
    blindView139.unpriced.eventIds.join('، '));
  check('ولی خروجی که عدد دارد سالم می‌ماند — یکی، کل گزارش را پاک نمی‌کند',
    blindView139.exits.count === 1
    && blindView139.exits.cashRial === exitDoc139.exitCashRial);
  // تراکنشی که هیچ‌کدام از دو سند را ندارد هم پنهان نمی‌شود.
  const foreign139 = JSON.parse(JSON.stringify(part139.session));
  delete foreign139.events.find((e) => e?.data?.closeVersion !== undefined).data;
  check('تراکنش بی‌سند هم شمرده می‌شود، نه نادیده',
    portfolioSessionSummary(foreign139).unpriced.count === 1
    && portfolioSessionSummary(foreign139).exits.count === 0);

  // ── بند ۴: هنوز سود و زیان نه ───────────────────────────────────────
  check('ماژول هیچ میدانی به نام سود نمی‌سازد',
    !/\bpnl\b|profit|realized|netResult/i.test(code139));
  const keys139 = [...Object.keys(view139), ...Object.keys(view139.entries),
    ...Object.keys(view139.exits), ...Object.keys(view139.fees)];
  check('و خروجی‌اش هم همین‌طور',
    !keys139.some((key) => /pnl|profit|realized|gain|loss/i.test(key)),
    keys139.filter((k) => /pnl|profit|realized|gain|loss/i.test(k)).join('، ') || 'هیچ');
  // جمعِ نقدِ ورود و خروج، سود نیست: موقعیت باز هنوز ارزش دارد و آن ارزش
  // اینجا معلوم نیست. نوشتنش دروغ است نه تقریب.
  check('و جمعِ دو جریان نقد را به‌عنوان یک عدد ارائه نمی‌کند',
    !/(entries|exits)\.cashRial\s*\+(?!=)\s*(entries|exits)\.cashRial/.test(code139)
    && !/netCashRial|totalCashRial|netRial/.test(code139));
  check('ارزش‌گذاری هم نمی‌کند — قیمت لحظه‌ای نمی‌خواند',
    !/buildChain|walkBook|analyzePayoff|marketValue|spot/i.test(code139));
}
