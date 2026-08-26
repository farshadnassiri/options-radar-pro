// ۱۱۸. UI مأموریت — تخصیص خانواده‌ها
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { generateCandidates } from '../../core/bereket-candidates.mjs';
import { activatePortfolioSession, setFamilyAllocations } from '../../core/portfolio-session.mjs';
import { GROUPS as STRAT_GROUPS48 } from '../../strategies/catalog.mjs';
import {
  createPortfolioAllocationDraft, createPortfolioOutlookDraft, createPortfolioRiskDraft, createPortfolioStepOneDraft, previewPortfolioAllocations,
} from '../../ui/portfolio-mission-form.mjs';


// ═════════════════════ ۱۱۸. UI مأموریت — تخصیص خانواده‌ها ═════════════════════
//
// درصد و بودجه هر خانواده باید از قرارداد session بیاید؛ کمتر از صد نقد
// می‌ماند و بیشتر از صد بی‌صدا نرمال یا میان ردیف‌ها پخش نمی‌شود.
group('۱۱۸. UI مأموریت — تخصیص خانواده‌ها');
{
  const setup = createPortfolioStepOneDraft({
    id: 'pt-allocation-ui', baseIns: '900001', capitalToman: '۱٬۰۰۰٬۰۰۰٬۰۰۰',
    reserveToman: '۲۰۰٬۰۰۰٬۰۰۰', startDate: 20260521, startSecond: 9 * 3600,
    endDate: 20260621, endSecond: 12 * 3600 + 1800, grain: 'halfHour', createdAt: 123,
  });
  const outlook = createPortfolioOutlookDraft(setup.draft, {
    direction: 'bullish', targetPriceToman: '۱۲٬۰۰۰', rangeLowToman: '۱۱٬۰۰۰',
    rangeHighToman: '۱۳٬۰۰۰', volatilityView: 'higher', expectedVolatilityPct: '۴۵',
    confidencePct: '۷۰', thesis: 'انتظار شکست مقاومت',
  });
  const risk = createPortfolioRiskDraft(outlook.draft, {
    maxLossPct: '۸', maxDrawdownPct: '۱۵', minFreeCapitalPct: '۲۰',
    maxMarginUsePct: '۶۰', allowUnlimitedRisk: 'no',
    minUnderlyingDailyValueToman: '۱۰٬۰۰۰٬۰۰۰٬۰۰۰',
    minOptionDailyValueToman: '۱۰۰٬۰۰۰٬۰۰۰', minOpenInterest: '۱۰۰',
    maxSpreadPct: '۸', maxBookTakePct: '۳۰', requireFullBook: 'yes',
  });
  const rows = [
    { familyId: 'income', pct: '۳۰٫۵' },
    { familyId: 'vertical', pct: '۴۰' },
  ];
  const beforeRows = JSON.stringify(rows);
  const preview = previewPortfolioAllocations(risk.draft, rows);
  check('جمع فارسی تخصیص و فاصله تا صد زنده محاسبه می‌شود',
    preview.ok && preview.totalPct === 70.5 && preview.remainingPct === 29.5);
  check('بودجه هر خانواده فقط از سرمایه قابل تخصیص session می‌آید',
    preview.session.allocations[0].targetRial === 2_440_000_000
    && preview.session.allocations[1].targetRial === 3_200_000_000);
  check('سرمایه تخصیص‌نیافته آشکار و دست‌نخورده می‌ماند',
    preview.plan.assignedRial === 5_640_000_000
    && preview.plan.unassignedRial === 2_360_000_000);
  check('نام خانواده از کاتالوگ واقعی می‌آید نه متن فرم',
    preview.session.allocations[0].label === STRAT_GROUPS48.income
    && preview.session.allocations[1].label === STRAT_GROUPS48.vertical);
  check('پیش‌نمایش ورودی و session مرحله ریسک را تغییر نمی‌دهد',
    JSON.stringify(rows) === beforeRows && risk.draft.session.allocations.length === 0);

  const allocated = createPortfolioAllocationDraft(risk.draft, rows);
  check('مرحله چهارم همان ریسک را با session تخصیص‌دار تحویل می‌دهد',
    allocated.ok && allocated.draft.step === 'allocation'
    && allocated.draft.risk === risk.draft.risk && allocated.draft.liquidity === risk.draft.liquidity
    && allocated.draft.session !== risk.draft.session);
  check('مرحله تخصیص مأموریت، snapshot یا پیشنهاد نمی‌سازد',
    !('mission' in allocated.draft) && !('snapshot' in allocated.draft)
    && !('candidates' in allocated.draft));
  const over = previewPortfolioAllocations(risk.draft, [
    { familyId: 'income', pct: '۶۰' }, { familyId: 'vertical', pct: '۵۰' },
  ]);
  check('جمع بیشتر از صد از همان قرارداد رد و اضافه‌تخصیص آشکار می‌شود',
    !over.ok && over.totalPct === 110 && over.remainingPct === -10
    && over.why.includes('از صد درصد بیشتر'));
  check('خانواده تکراری از قرارداد session رد می‌شود',
    !createPortfolioAllocationDraft(risk.draft, [
      { familyId: 'income', pct: '۲۰' }, { familyId: 'income', pct: '۳۰' },
    ]).ok);
  check('خانواده ناشناخته یا درصد متنی پیش‌فرض نمی‌گیرد',
    !createPortfolioAllocationDraft(risk.draft, [{ familyId: 'unknown', pct: '۲۰' }]).ok
    && !createPortfolioAllocationDraft(risk.draft, [{ familyId: 'income', pct: 'بیست' }]).ok);
  check('مرحله تخصیص بدون draft ریسک ساخته نمی‌شود',
    !createPortfolioAllocationDraft(outlook.draft, rows).ok);

  const tab = readSrc('../ui/tabs/portfolio-time.mjs');
  const adapter = readSrc('../ui/portfolio-mission-form.mjs');
  const css = readSrc('../ui/style.css');
  check('مرحله تخصیص افزودن، حذف، انتخاب خانواده و درصد صریح دارد',
    ['pt-allocation-step', 'pt-allocation-rows', 'pt-add-allocation', 'pt-save-allocation']
      .every((id) => tab.includes(`id="${id}"`))
    && tab.includes('pt-remove-allocation') && tab.includes('familyOptions(familyId)'));
  check('هیچ خانواده یا درصد پیش‌فرض پنهانی در ردیف تازه نیست',
    tab.includes("function addAllocationRow({ familyId = '', pct = '' } = {})")
    && tab.includes('<option value="">انتخاب خانواده…</option>'));
  check('جمع، بودجه و باقیمانده زنده از آداپتر مشترک تغذیه می‌شوند',
    tab.includes('previewPortfolioAllocations(riskDraft, allocationRows())')
    && tab.includes('pt-allocation-total') && tab.includes('pt-allocation-unassigned')
    && adapter.includes('setFamilyAllocations(riskDraft.session, parsed.allocations)'));
  check('تغییر بالادست، تخصیص کهنه را می‌بندد و پاک می‌کند',
    tab.includes("root.removeAttribute('data-allocation-ready')")
    && tab.includes('allocationStep.hidden = true') && tab.includes('resetAllocationRows()'));
  check('UI تخصیص فقط draft می‌سازد و چیزی را فعال یا ذخیره نمی‌کند',
    tab.includes('createPortfolioAllocationDraft(riskDraft, allocationRows())')
    && !tab.includes('activatePortfolioSession') && !tab.includes('generateCandidates')
    && !tab.includes('localStorage'));
  check('تخصیص دسکتاپ جدول و در موبایل ردیف تک‌ستونه دارد',
    css.includes('.pt-allocation-head, .pt-allocation-row')
    && css.includes('.pt-allocation-row { grid-template-columns: 1fr; align-items: stretch; }')
    && css.includes('.pt-allocation-totals, .pt-mission-objective-grid'));
}
