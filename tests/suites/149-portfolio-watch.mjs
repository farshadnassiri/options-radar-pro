// ۱۴۹. پایش قیود ریسک در مسیر

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import {
  NEAR_SHARE, PORTFOLIO_WATCH_VERSION, WATCH_STATES, portfolioRiskWatch,
} from '../../core/portfolio-watch.mjs';

group('۱۴۹. پایش قیود ریسک در مسیر');
{
  const fx149 = portfolioFixture('watch-149');
  const roomy149 = JSON.parse(JSON.stringify(fx149.baseSession));
  roomy149.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session149 = {
    ...roomy149,
    lockedMission: fx149.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  // ── بند ۶: جلسهٔ بی‌موقعیت ──────────────────────────────────────────
  const empty149 = portfolioRiskWatch(session149, fx149.evidence);
  check('جلسهٔ بی‌موقعیت هشدارِ خالی نمی‌دهد',
    !empty149.ok && empty149.reason === 'noOpenPositions'
    && empty149.alerts.length === 0, empty149.why);
  check('جلسهٔ نبوده، علت خودش را دارد',
    portfolioRiskWatch(null, fx149.evidence).reason === 'noSession');

  const done149 = commitPortfolioPlan(session149, fx149.evidence,
    portfolioRankedPlans(session149, fx149.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done149.ok, done149.why);
  const watch149 = portfolioRiskWatch(done149.session, fx149.evidence);
  const byCode = (view, code) => view.alerts.find((row) => row.code === code);

  check('همهٔ قیود گزارش می‌شوند',
    watch149.ok && watch149.version === PORTFOLIO_WATCH_VERSION
    && ['minFreeCapital', 'maxMarginUse', 'missionLossCap', 'unrealizedLoss']
      .every((code) => byCode(watch149, code)), watch149.why);
  check('شمارش‌ها با فهرست می‌خوانند',
    watch149.counts.total === watch149.alerts.length
    && watch149.counts.breached + watch149.counts.near
      + watch149.counts.clear + watch149.counts.unknown === watch149.counts.total);

  // ── بند ۵: سقف زیان روی منحنیِ فعلی، نه سند ─────────────────────────
  const cap149 = byCode(watch149, 'missionLossCap');
  check('سقف زیان از منحنیِ فعلی می‌آید، نه سند ثبت',
    cap149.basis === 'curve' && Number.isFinite(cap149.currentRial));
  // اگر از سند خوانده می‌شد، بستن نصف موقعیت عددش را عوض نمی‌کرد.
  const half149 = closePortfolioPosition(done149.session, fx149.evidence,
    done149.positionId, { qty: 20 });
  check('پیش‌شرط: نصف موقعیت بسته شد', half149.ok, half149.why);
  const afterHalf149 = byCode(portfolioRiskWatch(half149.session, fx149.evidence),
    'missionLossCap');
  check('بستن نصف موقعیت، زیانِ سنجیده‌شده را نصف می‌کند',
    near(afterHalf149.currentRial, cap149.currentRial / 2, 1e-6),
    `${afterHalf149.currentRial} در برابر ${cap149.currentRial}`);

  // ── بند ۲: «چه چیزی عوض شد» ─────────────────────────────────────────
  // بدون این عدد، هشدار فقط می‌گوید «الان بد است» و کاربر نمی‌داند
  // واکنشش را به چه بدهد.
  check('زیانِ لحظهٔ ثبت هم گزارش می‌شود',
    Number.isFinite(cap149.atCommitRial)
    && cap149.atCommitRial === done149.event.data.missionLossCap.worstLossRial);
  check('و تفاوت با آن، صریح',
    near(cap149.changeRial, cap149.currentRial - cap149.atCommitRial, 1e-9));
  check('تفاوت پس از بستن نصف، بزرگ‌تر می‌شود — یعنی واقعاً حرکت را می‌بیند',
    Math.abs(afterHalf149.changeRial) > Math.abs(cap149.changeRial),
    `${afterHalf149.changeRial} در برابر ${cap149.changeRial}`);
  const blindCommit149 = JSON.parse(JSON.stringify(done149.session));
  delete blindCommit149.events.find((e) => e?.data?.commitVersion !== undefined)
    .data.missionLossCap;
  check('سندِ بی‌عدد، تفاوتِ ساختگی نمی‌سازد',
    byCode(portfolioRiskWatch(blindCommit149, fx149.evidence), 'missionLossCap')
      .atCommitRial === null);

  // ── بند ۳: نزدیک‌شدن با شکستن یکی نیست ──────────────────────────────
  // هشدارِ یکسان برای هر دو یعنی کاربر فوریت را نمی‌فهمد و بعد از چند
  // بار هر دو را نادیده می‌گیرد.
  check('سه حالت جدا هست، نه دو',
    ['clear', 'near', 'breached', 'unknown'].every((key) => WATCH_STATES[key])
    && new Set(Object.values(WATCH_STATES)).size === 4);
  const tight149 = {
    ...done149.session,
    lockedMission: fx149.sessionWith(BULLISH_OUTLOOK, {
      ...WIDE_RISK, minFreeCapitalPct: 68, maxMarginUsePct: 30,
    }).lockedMission,
  };
  const near149 = byCode(portfolioRiskWatch(tight149, fx149.evidence), 'minFreeCapital');
  check('قیدِ نزدیک‌به‌شکستن، «نزدیک» است نه «رعایت شده»',
    near149.state === 'near' && near149.headroomPct > 0
    && near149.headroomPct <= near149.limitPct * NEAR_SHARE,
    `${near149.state} | ${near149.headroomPct}`);
  const broken149 = {
    ...done149.session,
    lockedMission: fx149.sessionWith(BULLISH_OUTLOOK, {
      ...WIDE_RISK, minFreeCapitalPct: 75, maxMarginUsePct: 25,
    }).lockedMission,
  };
  const brokenRow149 = byCode(portfolioRiskWatch(broken149, fx149.evidence), 'minFreeCapital');
  check('و قیدِ شکسته، «شکسته»',
    brokenRow149.state === 'breached' && brokenRow149.headroomPct < 0,
    `${brokenRow149.state} | ${brokenRow149.headroomPct}`);
  check('هر سه حالت متن خودشان را دارند',
    new Set([near149.stateLabel, brokenRow149.stateLabel,
      byCode(watch149, 'minFreeCapital').stateLabel]).size === 3);
  // آستانه از حدِ خودِ کاربر مشتق می‌شود، نه عددی که اینجا اختراع شود.
  const code149 = readSrc('../core/portfolio-watch.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('آستانهٔ «نزدیک» نسبتی از حدِ مأموریت است، نه عددِ ثابت',
    /limitPct[^;]*\* NEAR_SHARE/.test(code149)
    && !/headroomPct <= [0-9]/.test(code149));

  // ── بند ۴: «نمی‌دانیم» با «خوب است» یکی نیست ────────────────────────
  const staleEvidence149 = JSON.parse(JSON.stringify(fx149.evidence));
  staleEvidence149.now = { date: fx149.at.date, second: fx149.at.second + 60 };
  const unknown149 = portfolioRiskWatch(done149.session, staleEvidence149);
  const unrealized149 = byCode(unknown149, 'unrealizedLoss');
  check('بدون ارزش‌گذاری، زیان تحقق‌نیافته «نامعلوم» است نه «رعایت شده»',
    unrealized149.state === 'unknown'
    && unrealized149.stateLabel === WATCH_STATES.unknown
    && unrealized149.currentRial === null, unrealized149.state);
  check('و علتش گفته می‌شود، نه سکوت',
    unrealized149.why.length > 0, unrealized149.why);
  check('نامعلوم جدا شمرده می‌شود، نه با «رعایت شده»',
    unknown149.counts.unknown >= 1
    && unknown149.counts.clear < watch149.counts.clear);
  const everyAlert149 = [
    ...watch149.alerts, ...unknown149.alerts,
    ...portfolioRiskWatch(tight149, fx149.evidence).alerts,
    ...portfolioRiskWatch(broken149, fx149.evidence).alerts,
    ...portfolioRiskWatch(done149.session, { ok: false, rows: [] }).alerts,
  ];
  check('هیچ هشداری با فاصلهٔ نامعلوم، «رعایت شده» خوانده نمی‌شود',
    everyAlert149.every((row) => (row.headroomPct === null
      || !Number.isFinite(row.headroomPct)) ? row.state === 'unknown' : true),
    everyAlert149.filter((row) => !Number.isFinite(row.headroomPct)
      && row.state !== 'unknown').map((row) => `${row.code}:${row.state}`).join(' ،') || 'هیچ');
  check('و هر هشدارِ نامعلوم، عددِ ساختگی هم نمی‌سازد',
    everyAlert149.filter((row) => row.state === 'unknown')
      .every((row) => row.currentRial === null && row.headroomRial === null));

  const blindCurve149 = JSON.parse(JSON.stringify(done149.session));
  delete blindCurve149.events.find((e) => e?.data?.commitVersion !== undefined).data.legs;
  check('منحنیِ نساخته هم سقف زیان را «نامعلوم» می‌کند، نه «رعایت شده»',
    byCode(portfolioRiskWatch(blindCurve149, fx149.evidence), 'missionLossCap')
      .state === 'unknown');

  // ── بند ۱: مبنای هر قید صریح ────────────────────────────────────────
  // قیود سرمایه روی سرمایهٔ ثبت‌شده‌اند و قیود ارزش روی لحظهٔ جاری؛
  // یکی‌کردنشان یعنی کاربر نمی‌داند کدام عدد با گذشت زمان تکان می‌خورد.
  check('مبنای هر هشدار گفته می‌شود',
    watch149.alerts.every((row) => ['committed', 'curve', 'valuation'].includes(row.basis)));
  check('قیود سرمایه مبنای ثبت‌شده دارند و قیود ارزش، لحظهٔ جاری',
    byCode(watch149, 'minFreeCapital').basis === 'committed'
    && byCode(watch149, 'unrealizedLoss').basis === 'valuation');

  // ── زیان نامحدود ────────────────────────────────────────────────────
  const unlimited149 = {
    ...done149.session,
    lockedMission: fx149.sessionWith(BULLISH_OUTLOOK, {
      ...WIDE_RISK, allowUnlimitedRisk: false,
    }).lockedMission,
  };
  const unlimitedRow149 = byCode(portfolioRiskWatch(unlimited149, fx149.evidence),
    'missionLossCap');
  check('پیش‌شرط: این موقعیت زیانِ محدود دارد',
    unlimitedRow149.unlimitedLoss !== true);
  check('و ماژول برای زیان بی‌سقف عدد نمی‌سازد',
    /unlimitedLoss/.test(code149) && !/1e9|Number\.MAX/.test(code149));

  // ── مرزهای عمومی ────────────────────────────────────────────────────
  check('ماژول قیود را دوباره تعریف نمی‌کند',
    /portfolioCapitalLedger/.test(code149)
    && !/minFreeCapitalPct \*|maxMarginUsePct \*/.test(code149));
  check('و جلسهٔ ورودی را دست‌نخورده می‌گذارد',
    done149.session.events.length === 1);
}
