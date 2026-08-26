// ۱۱۴. قرارداد مأموریت سبد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  MISSION_DIRECTIONS, MISSION_OBJECTIVES, MISSION_REPLAY_GRAINS, MISSION_RETURN_BASES, MISSION_VOLATILITY_VIEWS, PORTFOLIO_MISSION_VERSION, createPortfolioMission, portfolioMissionSummary,
} from '../../core/portfolio-mission.mjs';
import {
  activatePortfolioSession, createPortfolioSession, setFamilyAllocations, setPortfolioMission,
} from '../../core/portfolio-session.mjs';


// ═══════════════════════ ۱۱۴. قرارداد مأموریت سبد ═══════════════════════
//
// ورودی‌های فرم آینده باید پیش از پیشنهاد استراتژی یک قرارداد واحد و
// قفل‌شده بسازند؛ موتور حق ندارد درصد گمشده یا نامعتبر را خودش حدس بزند.
group('۱۱۴. قرارداد مأموریت سبد');
{
  const made = createPortfolioSession({
    id: 'mission-test', baseIns: '900001',
    start: { date: 20260521, second: 9 * 3600 },
    end: { date: 20260621, second: 12 * 3600 + 1800 },
    initialCapitalRial: 10_000_000_000, reservePct: 20,
  });
  const valid = {
    objective: {
      mode: 'growth', returnBase: 'allocatable', targetReturnPct: 12,
      maxHoldingDays: 30,
    },
    replay: { grain: 'halfHour' },
    outlook: {
      direction: 'bullish', targetPriceRial: 120_000,
      rangeLowRial: 110_000, rangeHighRial: 130_000,
      volatilityView: 'higher', expectedVolatilityPct: 45,
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
  const edit = (section, key, value) => {
    const next = JSON.parse(JSON.stringify(valid));
    if (value === undefined) delete next[section][key];
    else next[section][key] = value;
    return next;
  };
  const inputBefore = JSON.stringify(valid);
  const built = createPortfolioMission(made.session, valid);

  check('نسخه و کاتالوگ‌های مأموریت کامل‌اند',
    PORTFOLIO_MISSION_VERSION === 1
    && ['preserve', 'income', 'growth', 'speculative'].every((key) => !!MISSION_OBJECTIVES[key])
    && ['initial', 'allocatable'].every((key) => !!MISSION_RETURN_BASES[key])
    && ['bullish', 'neutral', 'bearish', 'volatile'].every((key) => !!MISSION_DIRECTIONS[key])
    && ['lower', 'stable', 'higher'].every((key) => !!MISSION_VOLATILITY_VIEWS[key]));
  check('پنج تایم‌فریم بازپخش قرارداد دارند',
    Object.keys(MISSION_REPLAY_GRAINS).length === 5
    && MISSION_REPLAY_GRAINS.halfHour.seconds === 1800);
  check('مأموریت معتبر با شناسه پایدار ساخته می‌شود',
    built.ok && built.mission.id === 'mission-mission-test');
  check('نماد، بازه و سرمایه فقط از session می‌آیند',
    built.mission.context.baseIns === '900001'
    && built.mission.context.capital.initialRial === 10_000_000_000
    && built.mission.context.start.date === 20260521);
  check('هدف دوازده درصد روی سرمایه قابل تخصیص دقیق است',
    built.mission.objective.targetProfitRial === 960_000_000);
  check('ورودی مأموریت تغییر نمی‌کند', JSON.stringify(valid) === inputBefore);

  // ——— هیچ clamp یا پیش‌فرض مالی پنهان ———
  check('هدف ناشناخته رد می‌شود', !createPortfolioMission(made.session, edit('objective', 'mode', 'magic')).ok);
  check('مبنای بازده گمشده رد می‌شود', !createPortfolioMission(made.session, edit('objective', 'returnBase', undefined)).ok);
  check('بازده هدف منفی بی‌صدا صفر نمی‌شود', !createPortfolioMission(made.session, edit('objective', 'targetReturnPct', -1)).ok);
  check('روز نگهداری اعشاری رد می‌شود', !createPortfolioMission(made.session, edit('objective', 'maxHoldingDays', 2.5)).ok);
  check('تایم‌فریم ناشناخته رد می‌شود', !createPortfolioMission(made.session, edit('replay', 'grain', 'weekly')).ok);
  check('اطمینان صد و یک درصد clamp نمی‌شود', !createPortfolioMission(made.session, edit('outlook', 'confidencePct', 101)).ok);
  check('دلیل خالی پذیرفته نمی‌شود', !createPortfolioMission(made.session, edit('outlook', 'thesis', '   ')).ok);
  check('دید صعودی بدون قیمت هدف کامل نیست', !createPortfolioMission(made.session, edit('outlook', 'targetPriceRial', undefined)).ok);
  check('دو کران بازه باید با هم بیایند', !createPortfolioMission(made.session, edit('outlook', 'rangeHighRial', undefined)).ok);
  check('قیمت هدف بیرون بازه رد می‌شود', !createPortfolioMission(made.session, edit('outlook', 'targetPriceRial', 140_000)).ok);
  check('دید خنثی بدون بازه رد می‌شود', (() => {
    const row = edit('outlook', 'direction', 'neutral');
    delete row.outlook.rangeLowRial; delete row.outlook.rangeHighRial;
    return !createPortfolioMission(made.session, row).ok;
  })());
  check('دید پرنوسان بدون تلاطم مورد انتظار رد می‌شود', (() => {
    const row = edit('outlook', 'direction', 'volatile');
    delete row.outlook.expectedVolatilityPct;
    return !createPortfolioMission(made.session, row).ok;
  })());
  check('سقف زیان بزرگ‌تر از افت کل رد می‌شود',
    !createPortfolioMission(made.session, edit('risk', 'maxLossPct', 20)).ok);
  check('جمع سرمایه آزاد و وجه تضمین از صد عبور نمی‌کند',
    !createPortfolioMission(made.session, edit('risk', 'maxMarginUsePct', 90)).ok);
  check('اجازه ریسک نامحدود باید boolean صریح باشد',
    !createPortfolioMission(made.session, edit('risk', 'allowUnlimitedRisk', undefined)).ok);
  check('حداقل موقعیت باز اعشاری رد می‌شود',
    !createPortfolioMission(made.session, edit('liquidity', 'minOpenInterest', 1.5)).ok);
  check('اسپرد بیشتر از صد clamp نمی‌شود',
    !createPortfolioMission(made.session, edit('liquidity', 'maxSpreadPct', 120)).ok);
  check('مصرف عمق صفر معتبر فرض نمی‌شود',
    !createPortfolioMission(made.session, edit('liquidity', 'maxBookTakePct', 0)).ok);
  check('الزام دفتر کامل باید boolean صریح باشد',
    !createPortfolioMission(made.session, edit('liquidity', 'requireFullBook', 'yes')).ok);

  // ——— اتصال و قفل immutable در جلسه ———
  const allocated = setFamilyAllocations(made.session, [{ familyId: 'covered-call', pct: 100 }]);
  const missioned = setPortfolioMission(allocated.session, valid);
  check('ثبت مأموریت یک session تازه می‌سازد',
    missioned.ok && allocated.session.mission === null && missioned.session !== allocated.session);
  check('مأموریت در پیش‌نویس قابل جایگزینی است', (() => {
    const changed = edit('objective', 'targetReturnPct', 15);
    const next = setPortfolioMission(missioned.session, changed);
    return next.ok && next.session.mission.objective.targetReturnPct === 15
      && missioned.session.mission.objective.targetReturnPct === 12;
  })());
  const active = activatePortfolioSession(missioned.session);
  check('فعال‌سازی مأموریت را جدا از نسخه پیش‌نویس قفل می‌کند',
    active.ok && active.session.lockedMission !== active.session.mission
    && active.session.lockedMission.objective.targetReturnPct === 12);
  active.session.mission.objective.targetReturnPct = 99;
  check('تغییر نسخه کاری، مأموریت قفل‌شده را بازنویسی نمی‌کند',
    active.session.lockedMission.objective.targetReturnPct === 12);
  check('پس از فعال‌شدن مأموریت قابل جایگزینی نیست',
    !setPortfolioMission(active.session, valid).ok);
  check('مأموریت قفل‌شده پس از JSON round-trip بازتولید می‌شود', (() => {
    const round = JSON.parse(JSON.stringify(active.session));
    return round.lockedMission.id === 'mission-mission-test'
      && round.lockedMission.objective.targetProfitRial === 960_000_000;
  })());
  const summary = portfolioMissionSummary(active.session.lockedMission);
  check('خلاصه مأموریت فقط تصمیم‌های ثبت‌شده را برمی‌گرداند',
    summary.targetReturnPct === 12 && summary.targetProfitRial === 960_000_000
    && summary.direction === 'bullish' && summary.maxSpreadPct === 8);
  check('خلاصه مأموریت نامعتبر عددی اختراع نمی‌کند', portfolioMissionSummary(null) === null);
}
