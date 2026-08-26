// ۱۱۲. جلسه و دفتر رویداد سبد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  PORTFOLIO_SCHEMA_VERSION, PORTFOLIO_SESSION_STATES, PORTFOLIO_TRANSACTION_KINDS, activatePortfolioSession, createPortfolioSession, portfolioCapitalPlan, recordPortfolioTransaction, replayPortfolioSession, setFamilyAllocations, setPortfolioMission,
} from '../../core/portfolio-session.mjs';


// ═══════════════════════ ۱۱۲. جلسه و دفتر رویداد سبد ═══════════════════════
//
// پایه سفر زمانی سبد باید پیش از رابط ساخته شود: سرمایه و تخصیص یک تعریف،
// شناسه‌ها پایدار، و هر تغییر حجم یک رویداد تازه. اگر این قرارداد بعداً
// عوض شود، نمودار، Excel و محاسبه سرمایه هرکدام تاریخ متفاوتی می‌سازند.
group('۱۱۲. جلسه و دفتر رویداد سبد');
{
  const baseArgs = {
    id: 'pt-001', baseIns: '900001',
    start: { date: 20260521, second: 9 * 3600 },
    end: { date: 20260621, second: 12 * 3600 + 1800 },
    initialCapitalRial: 10_000_000_000,
    reservePct: 20,
    createdAt: 123,
  };

  const made = createPortfolioSession(baseArgs);
  check('جلسه سبد با نسخه طرح ساخته می‌شود',
    made.ok && made.session.schemaVersion === PORTFOLIO_SCHEMA_VERSION
    && PORTFOLIO_SCHEMA_VERSION === 1);
  check('شناسه پرتفوی از شناسه جلسه پایدار است',
    made.session.portfolioId === 'pf-pt-001');
  check('حالت‌های جلسه فارسی و کامل‌اند',
    ['draft', 'active', 'closed'].every((key) => !!PORTFOLIO_SESSION_STATES[key]));
  check('همه نوع‌های تراکنش قرارداد نام دارند',
    ['open', 'increase', 'reduce', 'close', 'rollOut', 'rollIn', 'settlement', 'exercise']
      .every((key) => !!PORTFOLIO_TRANSACTION_KINDS[key]));

  // ——— طرح سرمایه ———
  {
    const plan = portfolioCapitalPlan(made.session);
    check('یک میلیارد تومان داخل هسته ده میلیارد ریال است',
      plan.initialRial === 10_000_000_000);
    check('ذخیره بیست درصد جدا می‌ماند',
      plan.reserveRial === 2_000_000_000 && plan.allocatableRial === 8_000_000_000);
    check('پیش از تخصیص، کل سرمایه قابل تخصیص آزاد است',
      plan.assignedRial === 0 && plan.unassignedRial === 8_000_000_000);
    check('ذخیره ریالی صریح بر درصد مقدم است', (() => {
      const x = createPortfolioSession({ ...baseArgs, reservePct: 80, reserveRial: 1_500_000_000 });
      return x.ok && x.session.capital.reserveRial === 1_500_000_000;
    })());
    check('سرمایه نامعتبر جلسه نمی‌سازد',
      !createPortfolioSession({ ...baseArgs, initialCapitalRial: 0 }).ok);
    check('ذخیره بیشتر از سرمایه رد می‌شود',
      !createPortfolioSession({ ...baseArgs, reserveRial: 11_000_000_000 }).ok);
    check('پایان پیش از شروع رد می‌شود',
      !createPortfolioSession({ ...baseArgs, end: baseArgs.start }).ok);
    check('شناسه ناامن وارد دفتر نمی‌شود',
      !createPortfolioSession({ ...baseArgs, id: '../bad' }).ok);
  }

  // ——— تخصیص ۳۰/۴۰/۳۰ ———
  const rawRows = [
    { familyId: 'covered-call', label: 'کاوردکال', pct: 30 },
    { familyId: 'bull-spread', label: 'اسپرد صعودی', pct: 40 },
    { familyId: 'naked-short', label: 'فروش بدون پوشش', pct: 30 },
  ];
  const rawBefore = JSON.stringify(rawRows);
  const allocated = setFamilyAllocations(made.session, rawRows);
  check('تخصیص ۳۰/۴۰/۳۰ پذیرفته می‌شود', allocated.ok && allocated.session.allocations.length === 3);
  check('سه بودجه دقیقاً از سرمایه قابل تخصیص می‌آیند',
    allocated.session.allocations.map((row) => row.targetRial).join(',')
      === '2400000000,3200000000,2400000000');
  check('جمع تخصیص صد درصد و باقیمانده صفر است', (() => {
    const plan = portfolioCapitalPlan(allocated.session);
    return plan.allocationPct === 100 && plan.assignedRial === 8_000_000_000 && plan.unassignedRial === 0;
  })());
  check('ورودی تخصیص دست‌نخورده می‌ماند', JSON.stringify(rawRows) === rawBefore);
  check('جلسه پیش از تخصیص دست‌نخورده می‌ماند', made.session.allocations.length === 0);
  check('جمع بیشتر از صد بی‌صدا کوچک نمی‌شود',
    !setFamilyAllocations(made.session, [{ familyId: 'a', pct: 60 }, { familyId: 'b', pct: 50 }]).ok);
  check('خانواده تکراری رد می‌شود',
    !setFamilyAllocations(made.session, [{ familyId: 'a', pct: 20 }, { familyId: 'a', pct: 30 }]).ok);
  check('تخصیص کمتر از صد، پول را تخصیص‌نیافته نگه می‌دارد', (() => {
    const x = setFamilyAllocations(made.session, [{ familyId: 'a', pct: 25 }]);
    return x.ok && x.session.capital.assignedRial === 2_000_000_000
      && x.session.capital.unassignedRial === 6_000_000_000;
  })());

  // ——— قفل و دفتر رویداد ———
  const missionArgs = {
    objective: { mode: 'growth', returnBase: 'allocatable', targetReturnPct: 12, maxHoldingDays: 30 },
    replay: { grain: 'halfHour' },
    outlook: {
      direction: 'bullish', targetPriceRial: 120_000, rangeLowRial: 110_000,
      rangeHighRial: 130_000, volatilityView: 'higher', expectedVolatilityPct: 45,
      confidencePct: 70, thesis: 'انتظار شکست مقاومت با افزایش تلاطم',
    },
    risk: {
      maxLossPct: 8, maxDrawdownPct: 15, minFreeCapitalPct: 20,
      maxMarginUsePct: 60, allowUnlimitedRisk: false,
    },
    liquidity: {
      minUnderlyingDailyValueRial: 100_000_000_000,
      minOptionDailyValueRial: 1_000_000_000, minOpenInterest: 100,
      maxSpreadPct: 8, maxBookTakePct: 30, requireFullBook: true,
    },
  };
  const missioned = setPortfolioMission(allocated.session, missionArgs);
  const active = activatePortfolioSession(missioned.session);
  check('تخصیص هنگام فعال‌شدن قفل می‌شود',
    active.ok && active.session.state === 'active'
    && active.session.lockedAllocations.length === 3);
  check('جلسه تخصیص‌دار بدون مأموریت فعال نمی‌شود',
    !activatePortfolioSession(allocated.session).ok);
  check('مأموریت هنگام فعال‌شدن قفل می‌شود',
    active.session.lockedMission.id === 'mission-pt-001');
  check('قفل‌کردن، جلسه ورودی را تغییر نمی‌دهد', allocated.session.state === 'draft');
  check('جلسه بدون تخصیص فعال نمی‌شود', !activatePortfolioSession(made.session).ok);
  check('عکس شروع در لحظه دیگری قفل نمی‌شود',
    !activatePortfolioSession(missioned.session, { at: { date: 20260521, second: 10 * 3600 } }).ok);
  check('پس از فعال‌شدن تخصیص قابل تغییر نیست',
    !setFamilyAllocations(active.session, rawRows).ok);

  const opened = recordPortfolioTransaction(active.session, {
    kind: 'open', at: baseArgs.start, familyId: 'covered-call', strategyId: 'covered-call', qty: 3,
    executions: [{ legIndex: 0, price: 100 }, { legIndex: 1, price: 10 }],
    data: { note: 'ورود نخست' },
  });
  check('ورود، شناسه موقعیت و تراکنش و lot می‌سازد',
    opened.ok && opened.positionId === 'pos-pt-001-1'
    && opened.transactionId === 'txn-pt-001-1' && opened.lotId === 'lot-pt-001-1');
  check('هر اجرای پا شناسه مستقل دارد',
    opened.executionIds.join(',') === 'exe-pt-001-1,exe-pt-001-2');
  check('رویداد و تراکنش دو شناسه مستقل دارند',
    opened.event.id === 'evt-pt-001-1' && opened.event.id !== opened.transactionId);
  check('ثبت ورود، جلسه فعال قبلی را تغییر نمی‌دهد', active.session.events.length === 0);

  const increased = recordPortfolioTransaction(opened.session, {
    kind: 'increase', at: { date: 20260522, second: 9 * 3600 },
    positionId: opened.positionId, qty: 2,
  });
  check('افزایش حجم lot دوم می‌سازد', increased.ok && increased.lotId === 'lot-pt-001-2');
  check('شناسه تراکنش در همان جلسه یکنواخت جلو می‌رود',
    increased.transactionId === 'txn-pt-001-2');

  const reduced = recordPortfolioTransaction(increased.session, {
    kind: 'reduce', at: { date: 20260523, second: 10 * 3600 },
    positionId: opened.positionId, qty: 4,
  });
  check('کاهش حجم چهار واحد پذیرفته می‌شود', reduced.ok);
  check('کاهش حجم FIFO ابتدا lot نخست را مصرف می‌کند',
    reduced.event.consumedLots.map((row) => `${row.lotId}:${row.qty}`).join(',')
      === 'lot-pt-001-1:3,lot-pt-001-2:1');

  const afterReduce = replayPortfolioSession(reduced.session);
  check('بازسازی پس از کاهش، یک واحد باز نگه می‌دارد',
    afterReduce.ok && afterReduce.openPositions[0].openQty === 1);
  check('lot نخست صفر و lot دوم یک واحد دارد',
    afterReduce.openPositions[0].lots.map((lot) => lot.remainingQty).join(',') === '0,1');
  check('خروج بیشتر از حجم باز رد می‌شود',
    !recordPortfolioTransaction(reduced.session, {
      kind: 'reduce', at: { date: 20260524, second: 9 * 3600 },
      positionId: opened.positionId, qty: 2,
    }).ok);

  const closed = recordPortfolioTransaction(reduced.session, {
    kind: 'close', at: { date: 20260524, second: 9 * 3600 },
    positionId: opened.positionId,
  });
  const finalState = replayPortfolioSession(closed.session);
  check('آفست کامل حجم باقی‌مانده را خودش می‌گیرد', closed.ok && closed.event.qty === 1);
  check('موقعیت پس از آفست کامل بسته است',
    finalState.ok && finalState.openPositions.length === 0 && finalState.closedPositions.length === 1);
  check('افزایش حجم روی موقعیت بسته رد می‌شود',
    !recordPortfolioTransaction(closed.session, {
      kind: 'increase', at: { date: 20260525, second: 9 * 3600 },
      positionId: opened.positionId, qty: 1,
    }).ok);
  check('زمان دفتر رویداد عقب نمی‌رود',
    !recordPortfolioTransaction(closed.session, {
      kind: 'open', at: baseArgs.start, familyId: 'x', strategyId: 'x', qty: 1,
    }).ok);
  check('تراکنش بیرون پایان جلسه رد می‌شود',
    !recordPortfolioTransaction(closed.session, {
      kind: 'open', at: { date: 20260701, second: 9 * 3600 }, familyId: 'x', strategyId: 'x', qty: 1,
    }).ok);
  check('رول بدون شناسه گروه رد می‌شود',
    !recordPortfolioTransaction(active.session, {
      kind: 'rollIn', at: baseArgs.start, familyId: 'x', strategyId: 'x', qty: 1,
    }).ok);

  check('JSON round-trip همان شناسه‌ها و همان وضعیت را بازسازی می‌کند', (() => {
    const round = JSON.parse(JSON.stringify(closed.session));
    const rebuilt = replayPortfolioSession(round);
    return rebuilt.ok
      && round.events.map((row) => row.id).join(',') === closed.session.events.map((row) => row.id).join(',')
      && rebuilt.closedPositions[0].transactionIds.join(',')
        === 'txn-pt-001-1,txn-pt-001-2,txn-pt-001-3,txn-pt-001-4';
  })());
  check('دو جلسه مستقل شناسه‌های هم را مصرف نمی‌کنند', (() => {
    const otherMade = createPortfolioSession({ ...baseArgs, id: 'pt-002' });
    const otherAllocated = setFamilyAllocations(otherMade.session, [{ familyId: 'x', pct: 100 }]);
    const otherMissioned = setPortfolioMission(otherAllocated.session, missionArgs);
    const otherActive = activatePortfolioSession(otherMissioned.session);
    const otherOpen = recordPortfolioTransaction(otherActive.session, {
      kind: 'open', at: baseArgs.start, familyId: 'x', strategyId: 'x', qty: 1,
    });
    return otherOpen.positionId === 'pos-pt-002-1' && otherOpen.positionId !== opened.positionId;
  })());
}
