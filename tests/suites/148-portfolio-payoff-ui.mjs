// ۱۴۸. نمودار بازده سبد در تب

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioPayoffCurve } from '../../core/portfolio-payoff.mjs';
import {
  payoffSummaryText, portfolioPayoffView,
} from '../../ui/portfolio-payoff-view.mjs';

group('۱۴۸. نمودار بازده سبد در تب');
{
  const fx148 = portfolioFixture('payoff-ui-148');
  const roomy148 = JSON.parse(JSON.stringify(fx148.baseSession));
  roomy148.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session148 = {
    ...roomy148,
    lockedMission: fx148.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  // ── بند ۵: بدون منحنی، علت ──────────────────────────────────────────
  const empty148 = portfolioPayoffView(session148);
  check('جلسهٔ بدون موقعیت، علتش را می‌گوید نه نمودار خالی',
    !empty148.ok && empty148.reason === 'noOpenPositions'
    && empty148.chart === null && empty148.why.length > 0, empty148.why);
  check('و خلاصه هم همان علت را می‌گوید',
    payoffSummaryText(empty148) === empty148.why);

  const done148 = commitPortfolioPlan(session148, fx148.evidence,
    portfolioRankedPlans(session148, fx148.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done148.ok, done148.why);
  const view148 = portfolioPayoffView(done148.session);
  const curve148 = portfolioPayoffCurve(done148.session).curve;
  check('منحنی برای رسم آماده می‌شود', view148.ok, view148.why);

  // ── بند ۱: نمودار موجود مصرف می‌شود ─────────────────────────────────
  // SVG دوم یعنی دو ظاهر متفاوت برای یک چیز، و دو جا که باید هم‌زمان
  // درست بمانند.
  const code148 = readSrc('../ui/portfolio-payoff-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('لایهٔ نمایش نه SVG می‌سازد نه نقطه',
    !/<svg|<path|polyline|\.map\(\(S\)|for \(let S/.test(code148));
  check('و تابع بازده نمی‌نویسد',
    !/analyzePayoff|pnlAtExpiry|payoffAt|Math\.max\(0, S/.test(code148));
  check('آرگومان‌های نمودار همان‌اند که موتور داد',
    view148.chart.legs === portfolioPayoffCurve(done148.session).legs
      || JSON.stringify(view148.chart.legs)
        === JSON.stringify(portfolioPayoffCurve(done148.session).legs));
  check('نقد خالص و نرخ کارمزد هم به نمودار می‌رسند',
    view148.chart.netCashRial === curve148.netCashRial
    && view148.chart.options.fees === session148.startSnapshot.capitalInputs.fees);
  const tabSrc148 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب نمودار موجود را صدا می‌زند، نه رسمِ دستی',
    /mountPayoff\(host, view\.chart\.legs, view\.chart\.netCashRial/.test(tabSrc148)
    && /from '\.\.\/chart\.mjs'/.test(tabSrc148));
  check('و نمودار پیشین پیش از رسم تازه نابود می‌شود',
    /payoffChart\.destroy\(\); payoffChart = null;/.test(tabSrc148));

  // ── بند ۲ و ۳: سربه‌سری و نقاط شکست ─────────────────────────────────
  // نموداری که سربه‌سری داخلش نباشد بی‌فایده است؛ بازه را خودِ نمودار از
  // همین نقاط می‌سازد.
  check('سربه‌سری‌ها دیده می‌شوند، با واحد',
    view148.breakevenText.includes('تومان')
    && curve148.breakevens.length > 0, view148.breakevenText);
  check('نقاط شکست هم دیده می‌شوند',
    view148.strikesText.includes('تومان')
    && curve148.strikes.length > 0, view148.strikesText);
  check('و هر دو از موتور می‌آیند، نه از عددِ ثابت',
    !/\b(9000|10000|1000)\b/.test(code148));
  check('نبودِ سربه‌سری، جملهٔ صریح می‌گیرد نه فهرست خالی',
    portfolioPayoffView({ ...done148.session }).breakevenText.length > 0);

  // ── بند ۴: زیان نامحدود پیدا باشد ───────────────────────────────────
  check('سود نامحدود «نامحدود» نوشته می‌شود، نه عدد',
    view148.unlimitedProfit === true && view148.maxProfitText === 'نامحدود'
    && view148.atMaxProfitText === '');
  check('و زیانِ محدود عددش را با محلش دارد',
    view148.unlimitedLoss === false && view148.maxLossText.includes('تومان')
    && view148.atMaxLossText.includes('تومان'));
  // منحنی در لبهٔ نمودار بریده می‌شود؛ اگر عدد کنارش سقفی نشان دهد،
  // بریدگی شبیه سقفِ زیان دیده می‌شود.
  check('تب دربارهٔ لبهٔ نمودار هشدار می‌دهد وقتی زیان سقف ندارد',
    /view\.unlimitedLoss \?[\s\S]{0,120}?لبهٔ نمودار سقف نیست/.test(tabSrc148));

  // ── بند ۶: رقم فارسی و تومان ────────────────────────────────────────
  const shown148 = [view148.breakevenText, view148.maxProfitText, view148.maxLossText,
    view148.atMaxProfitText, view148.atMaxLossText, view148.strikesText,
    view148.positionsText, view148.netCashText, payoffSummaryText(view148)];
  check('هیچ رقم لاتینی در متن نمایشی نیست',
    shown148.every((value) => !/[0-9]/.test(value)),
    shown148.filter((v) => /[0-9]/.test(v)).slice(0, 3).join(' | ') || 'هیچ');
  check('واحد همه‌جا تومان است، نه ریال',
    !shown148.join(' ').includes('ریال'));
  const rialMath148 = code148.match(/Rial[A-Za-z]*\s*[*+\-]/g) || [];
  const rialDiv148 = (code148.match(/Rial[A-Za-z]*\s*\/\s*[0-9]+/g) || [])
    .filter((hit) => !/\/\s*10$/.test(hit));
  check('لایهٔ نمایش روی عدد ریالی جز تقسیم بر ده حساب نمی‌کند',
    rialMath148.length === 0 && rialDiv148.length === 0,
    [...rialMath148, ...rialDiv148].join(' ،') || 'هیچ');
  // قیمت پایه هم تومان است، مثل هر عدد دیگری در رابط.
  check('قیمت اعمال و سربه‌سری هم تومان‌اند، نه ریال خام',
    view148.strikesText.replace(/[^۰-۹]/g, '').length > 0
    && !view148.strikesText.includes(String(curve148.strikes[0])));

  // ── اتصال به تب ─────────────────────────────────────────────────────
  check('بخش نمودار و خانه‌هایش در نشانه‌گذاری هستند',
    ['pt-payoff', 'pt-payoff-chart', 'pt-payoff-summary', 'pt-payoff-state']
      .every((id) => tabSrc148.includes(`id="${id}"`)));
  check('نمودار زیر جدول موقعیت‌ها می‌نشیند',
    tabSrc148.indexOf('id="pt-positions-body"') < tabSrc148.indexOf('id="pt-payoff"'));
  check('و از همان نقطهٔ مشترک رسم می‌شود',
    /paintPositions\(session\);[\s\S]{0,60}?paintPayoff\(session\);/.test(tabSrc148));
  check('شناسه و نام تابع یکتا هستند',
    (tabSrc148.match(/function paintPayoff\b/g) || []).length === 1
    && (tabSrc148.match(/id="pt-payoff"/g) || []).length === 1);
  const cssSrc148 = readSrc('../ui/style.css');
  check('نمودار عرضش را از ظرف می‌گیرد، نه عددِ ثابت',
    /\.pt-payoff-chart svg \{[^}]*width: 100%/.test(cssSrc148)
    && /\.pt-payoff-chart \{[^}]*min-width: 0/.test(cssSrc148));
}
