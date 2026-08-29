// ۱۹۰. نمای سری زمانی سود و زیان

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioTimeline } from '../../core/portfolio-timeline.mjs';
import {
  TIMELINE_BAND_STEPS, pnlBand, portfolioTimelineFrom, portfolioTimelineView,
} from '../../ui/portfolio-timeline-view.mjs';

group('۱۹۰. نمای سری زمانی');
{
  const fx190 = portfolioFixture('timeline-view-190');
  const roomy190 = JSON.parse(JSON.stringify(fx190.baseSession));
  roomy190.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session190 = {
    ...roomy190,
    lockedMission: fx190.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const plans190 = portfolioRankedPlans(session190, fx190.evidence);
  const done190 = commitPortfolioPlan(session190, fx190.evidence, plans190.ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done190.ok, done190.why);
  const live190 = done190.session;

  const at190 = fx190.at;
  const later = (minutes) => ({ date: at190.date, second: at190.second + minutes * 60 });
  const evidenceAt = (at, { priceShift = 0, blindIns = null } = {}) => ({
    ok: true,
    now: { ...at },
    rows: fx190.evidence.rows.filter((row) => row.ins !== blindIns).map((row) => ({
      ...row, execution: { ...row.execution, vwap: row.execution.vwap + priceShift },
    })),
  });
  const blindIns190 = live190.events[0].data.legs[0].ins;
  const steps190 = [
    { at: at190, evidence: evidenceAt(at190) },
    { at: later(30), evidence: evidenceAt(later(30), { priceShift: 40 }) },
    { at: later(60), evidence: evidenceAt(later(60), { blindIns: blindIns190 }) },
  ];

  const view190 = portfolioTimelineFrom(live190, steps190, { mode: 'strict' });
  check('نما برای هر پله یک ردیف دارد', view190.ok && view190.steps.length === 3, view190.why);

  // ── بند ۱: هیچ عدد مالی تازه‌ای ─────────────────────────────────────
  // تنها کارِ عددیِ مجاز، تقسیم بر ده است. هر جمع یا تفریقی که اینجا
  // انجام شود هیچ آزمونی بالای سرش ندارد.
  const src190 = readSrc('../ui/portfolio-timeline-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('در بدنهٔ نما جمع و تفریق مالی انجام نمی‌شود',
    !/Rial\s*[+\-]\s*\w+Rial/.test(src190) && !/pnlRial\s*\/\s*\w*[Cc]apital/.test(src190));

  // ── بند ۲: نبودِ عدد «—» می‌شود، نه صفر ────────────────────────────
  const gap190 = view190.steps[2];
  check('پلهٔ نامعلوم در جدول «—» می‌گیرد، نه صفر',
    gap190.totalText === '—' && gap190.rows[0].pnlText === '—'
    && gap190.rows[0].known === false, gap190.totalText);
  check('و علتش در همان ردیف می‌ماند',
    gap190.rows[0].why.length > 0 && gap190.unknownCount === 1);
  check('روی نمودار هم `null` می‌ماند تا خط بشکند، نه صفر',
    view190.chartPoints[2].total === null
    && view190.chartPoints[2][view190.strategies[0].key] === null);
  check('ولی پلهٔ معلوم عدد تومانی می‌گیرد — ریال تقسیم بر ده',
    view190.chartPoints[0].total !== null
    && view190.chartPoints[0].total * 10 === view190.steps[0].totalRial);

  // ── بند ۳: رنگ از بزرگیِ عدد می‌آید ────────────────────────────────
  check('مقیاس رنگ از بزرگ‌ترین قدرمطلقِ همین سری درمی‌آید',
    view190.scaleRial === Math.max(...view190.steps
      .map((step) => Math.abs(step.totalRial ?? 0))), String(view190.scaleRial));
  check('و مقیاس گفته می‌شود، نه اینکه پنهان بماند', view190.scaleText !== '—');
  const bands190 = view190.steps.filter((step) => step.totalRial !== null)
    .map((step) => step.totalLevel);
  check('عدد بزرگ‌تر پلهٔ رنگیِ بالاتر می‌گیرد',
    bands190.length === 2 && bands190[1] >= bands190[0], JSON.stringify(bands190));

  check('صفر پلهٔ خودش را دارد — نه سود کم‌رنگ',
    pnlBand(0, 1000).tone === 'flat' && pnlBand(0, 1000).level === 0);
  check('نبودِ عدد اصلاً رنگ نمی‌گیرد',
    pnlBand(null, 1000).tone === '' && pnlBand(undefined, 1000).tone === ''
    && pnlBand('', 1000).tone === '');
  check('بزرگ‌ترین عدد بالاترین پله را می‌گیرد و کوچک‌ترین، پایین‌ترین را',
    pnlBand(1000, 1000).level === TIMELINE_BAND_STEPS && pnlBand(1, 1000).level === 1
    && pnlBand(-1000, 1000).tone === 'loss' && pnlBand(-1000, 1000).level === TIMELINE_BAND_STEPS);
  check('عددِ بزرگ‌تر از مقیاس از سقف پله‌ها بالاتر نمی‌رود',
    pnlBand(9_999, 1000).level === TIMELINE_BAND_STEPS);
  check('مقیاس نامعلوم، رنگ را حذف نمی‌کند ولی شدت هم نمی‌سازد',
    pnlBand(500, null).level === 1 && pnlBand(500, null).tone === 'gain'
    && pnlBand(500, 0).level === 1);

  // سری‌ای که هیچ پلهٔ معلومی ندارد مقیاس ندارد. مقیاسِ صفر یعنی برنامه
  // ادعا می‌کند بزرگ‌ترین عددِ این سری صفر بوده — ادعایی که هیچ‌کس نکرده.
  const allBlind190 = portfolioTimelineFrom(live190, [
    { at: later(60), evidence: evidenceAt(later(60), { blindIns: blindIns190 }) },
  ], { mode: 'strict' });
  check('سریِ سراسر نامعلوم مقیاس ندارد — مقیاسش صفر نمی‌شود',
    allBlind190.scaleRial === null && allBlind190.scaleText === '—',
    String(allBlind190.scaleRial));

  // ── بند ۴: عددِ حمل‌شده بی‌صدا نمی‌ماند ────────────────────────────
  const carry190 = portfolioTimelineFrom(live190, steps190, { mode: 'carry' });
  check('در حالت پیوسته، پلهٔ حمل‌شده عدد می‌گیرد',
    carry190.steps[2].totalText !== '—' && carry190.steps[2].estimated === true);
  check('ولی «تخمینی» علامت می‌خورد و لحظهٔ منبعش گفته می‌شود',
    carry190.steps[2].rows[0].estimated === true
    && carry190.steps[2].rows[0].estimatedText.includes(view190.steps[1].atText),
    carry190.steps[2].rows[0].estimatedText);
  check('و یک جملهٔ سرجمع می‌گوید چند پله حمل‌شده است',
    carry190.estimatedCount === 1 && carry190.estimatedNote.length > 0
    && view190.estimatedNote === '', carry190.estimatedNote);

  check('درصدِ سرخط مبنایش را می‌گوید',
    carry190.headlineText.includes(`${carry190.steps.at(-1).pctText} روی سرمایهٔ درگیر`),
    carry190.headlineText);
  check('و وقتی آخرین پله نامعلوم است، درصدی ساخته نمی‌شود',
    view190.steps.at(-1).pctText === '—'
    && !view190.headlineText.includes('٪'), view190.headlineText);

  // ── بند ۵: برچسب‌های خوانا ─────────────────────────────────────────
  check('استراتژی با نام خوانا می‌آید، نه شناسهٔ خام',
    view190.strategies[0].label !== live190.events[0].strategyId
    && view190.strategies[0].label.length > 0, view190.strategies[0].label);
  check('خانواده هم نام فارسی می‌گیرد',
    view190.strategies[0].familyText !== live190.events[0].familyId
    && view190.strategies[0].familyText !== '—', view190.strategies[0].familyText);
  check('هر استراتژی یک کلید و یک رنگ جدا روی نمودار دارد',
    view190.chartSeries.length === view190.strategies.length + 1
    && view190.chartSeries[0].key === 'total'
    && new Set(view190.chartSeries.map((row) => row.key)).size === view190.chartSeries.length);
  check('لحظهٔ هر پله با تاریخ و ساعت خوانا نوشته می‌شود',
    /ساعت \d|ساعت [۰-۹]/.test(view190.steps[0].atText), view190.steps[0].atText);
  // دو درصد در کارند — روی سرمایهٔ درگیر و روی سرمایهٔ شروع — و شبیه هم‌اند.
  // درصدِ بی‌مبنا در سرخط، خواننده را به مقایسهٔ اشتباه با ستون جدول می‌برد.

  // ── بند ۶: جمعِ ناقص ───────────────────────────────────────────────
  // وقتی یکی از دو استراتژی معلوم است و دیگری نه، «جمع کل» ساخته نمی‌شود
  // ولی کاربر باید بداند چقدر از تصویر را می‌بیند.
  const second190 = commitPortfolioPlan(live190, fx190.evidence,
    plans190.ranking.ranked.map((row) => row.candidateId)
      .find((id) => id !== plans190.ranking.ranked[0].candidateId));
  if (second190.ok) {
    const two190 = portfolioTimelineView(portfolioTimeline(second190.session,
      [{ at: later(60), evidence: evidenceAt(later(60), { blindIns: blindIns190 }) }],
      { mode: 'strict' }));
    const partial190 = two190.steps[0];
    check('جمعِ ناقص جمع نمی‌شود، ولی «جمع معلوم‌ها» گفته می‌شود',
      partial190.totalText === '—' && partial190.partial === true
      && partial190.partialText.includes('نامعلوم'), partial190.partialText);
  } else {
    check('پیش‌شرط دو استراتژی فراهم نشد — بند جمعِ ناقص از راه دیگری سنجیده می‌شود',
      portfolioTimelineView({
        ok: true, mode: 'strict', modeLabel: 'x', strategies: [],
        steps: [{
          at: at190, rows: [], positions: 0, openPositions: 0, unknownIds: ['p1', 'p2'],
          knownCount: 1, knownPnlRial: 500, totalPnlRial: null, totalPnlPct: null,
          capitalBaseRial: null, returnOnCapitalPct: null, realizedRial: null,
          unrealizedRial: null, estimated: false,
        }],
      }).steps[0].partialText.includes('نامعلوم'));
  }

  // ── بند ۷: ورودی ناموفق ───────────────────────────────────────────
  check('سری ناموفق، نمای ناموفق می‌دهد و هیچ عددی نمی‌سازد',
    !portfolioTimelineView({ ok: false, why: 'خراب' }).ok
    && portfolioTimelineView({ ok: false, why: 'خراب' }).why === 'خراب'
    && portfolioTimelineView({ ok: false, why: 'خراب' }).steps.length === 0
    && portfolioTimelineView({ ok: false, why: 'خراب' }).scaleText === '—');
  check('سری بی‌پله هم نمای ناموفق می‌دهد',
    !portfolioTimelineView({ ok: true, steps: [] }).ok);
  check('نمای نبوده هم نمی‌شکند', !portfolioTimelineView(null).ok);
}
