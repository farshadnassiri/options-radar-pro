// مدل نمایش دفتر سرمایه — برش دوم فاز ۴.
//
// `core/portfolio-ledger.mjs` می‌داند چقدر سرمایه درگیر است، چقدر آزاد
// مانده و کدام قید نزدیک شکستن است. هیچ‌کدام به چشم کاربر نمی‌رسید. بدتر:
// وقتی ثبتی به‌خاطر شکستن قید رد می‌شد، فقط یک جملهٔ خطا دیده می‌شد بدون
// اینکه معلوم باشد چقدر فاصله بود.
//
// چهار مرز:
//
// **هیچ عدد مالی تازه‌ای اینجا ساخته نمی‌شود.** تنها کاری که با عدد
// می‌شود قالب‌بندیِ ریال است (بزرگ‌ها «میلیون ریال»). حتی
// «فاصله تا شکستن» هم اینجا حساب نمی‌شود؛ از خود دفتر می‌آید. تفریقی که
// در لایهٔ نمایش انجام شود هیچ آزمونی بالای سرش نیست و کاربر تفاوتش را
// نمی‌بیند.
//
// **قید بدون فاصله نمایش داده نمی‌شود.** «رعایت شده» نمی‌گوید چقدر جا
// مانده و «شکست» نمی‌گوید چقدر عقب‌گرد لازم است. عددِ فاصله همان چیزی
// است که کاربر بر اساسش تصمیم می‌گیرد.
//
// **خانواده با نام خوانا، نه شناسهٔ خام.** `vol` به کاربر چیزی نمی‌گوید.
//
// **رویدادِ بی‌عدد پنهان نمی‌شود.** اگر ثبتی سرمایه‌اش ثبت نشده، جمعِ
// نمایش‌داده‌شده کمتر از واقعیت است؛ نگفتنش یعنی کاربر به عددی اعتماد
// می‌کند که کامل نیست.
//
// اینجا DOM نیست و رشتهٔ HTML ساخته نمی‌شود؛ تب خودش رسم می‌کند.

import { fmt, faDigits } from './fmt.mjs';
import { PORTFOLIO_LEDGER_REASONS, portfolioCapitalLedger } from '../core/portfolio-ledger.mjs';
import { GROUPS as STRATEGY_FAMILIES } from '../strategies/catalog.mjs';

// علت‌ها از خودِ دفتر می‌آیند. دو متن برای یک حالت یعنی روزی یکی‌شان عوض
// می‌شود و کاربر دو جواب متفاوت برای یک چیز می‌بیند.
export const LEDGER_VIEW_REASONS = PORTFOLIO_LEDGER_REASONS;

const text = (value) => String(value ?? '').trim();

/**
 * ریال، فقط قالب‌بندی (۱۴۰۵/۰۷/۰۸: پیش از این بر ده تقسیم و «تومان» می‌شد).
 *
 * تقسیم بر ده تبدیل واحد است نه محاسبهٔ تازه. عدد نامعتبر «—» می‌شود، نه
 * صفر — نبودِ عدد و صفرِ واقعی دو چیزند.
 */
const money = (rial) => fmt.rialText(rial);

/** درصد با یک قالب، تا دو عدد درصدیِ کنار هم دو جور نوشته نشوند. */
const pct = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');

const count = (value) => faDigits(String(Number(value) || 0));

function fail(reason) {
  return {
    ok: false,
    why: LEDGER_VIEW_REASONS[reason],
    reason,
    empty: false,
    headlineText: '',
    baseRialText: '—',
    freeRialText: '—',
    freePctText: '—',
    committedRialText: '—',
    components: [],
    families: [],
    risks: [],
    unpriced: null,
    positionsText: '—',
  };
}

/** اجزای سرمایه با نام خوانا. جمعِ درهم نمی‌گوید کدام قید فشار می‌آورد. */
const COMPONENTS = Object.freeze([
  { key: 'debitRial', label: 'بدهکار' },
  { key: 'feeRial', label: 'کارمزد' },
  { key: 'marginRial', label: 'وجه تضمین' },
]);

/**
 * یک قید ریسک، با فاصله‌اش.
 *
 * `headroomRial` و `headroomPct` از دفتر می‌آیند؛ اینجا فقط قالب می‌گیرند.
 * علامت مثبت یعنی جای باقی‌مانده و منفی یعنی همان‌قدر عبور کرده — پس
 * برچسبِ فاصله از روی همان علامت انتخاب می‌شود، نه از روی حساب تازه.
 */
function riskRow(code, risk) {
  const over = risk.breached;
  return {
    code,
    label: risk.label,
    breached: over,
    state: over ? 'breached' : 'clear',
    stateLabel: over ? 'شکسته' : 'رعایت شده',
    currentText: `${money(risk.currentRial)} · ${pct(risk.currentPct)}`,
    limitText: `${money(risk.limitRial)} · ${pct(risk.limitPct)}`,
    // «چقدر جا مانده» یا «چقدر عبور کرده» — همان عددی که کاربر پیش از
    // ردشدنِ ثبتش باید ببیند.
    headroomLabel: over ? 'عبور کرده' : 'جا مانده',
    headroomText: `${money(risk.headroomRial)} · ${pct(risk.headroomPct)}`,
  };
}

/**
 * متن ردشدنِ ثبت به‌خاطر قید ریسک.
 *
 * `commitPortfolioPlan` وقتی قیدی می‌شکند، `breaches` را با نام قید و
 * درصدی که **می‌شد** برمی‌گرداند. بدون این متن، کاربر فقط «قید مأموریت
 * شکسته می‌شود» را می‌دید و نمی‌فهمید کدام قید و چقدر عبور.
 *
 * درصدها همان‌هایی‌اند که موتور داد؛ اینجا فقط فارسی می‌شوند.
 */
export function breachText(breaches) {
  const rows = Array.isArray(breaches) ? breaches : [];
  if (!rows.length) return '';
  return rows
    .map((row) => `${text(row.label) || text(row.code)}: ${pct(row.wouldBePct)}`
      + ` در برابر حد ${pct(row.limitPct)}`)
    .join(' · ');
}

/**
 * دفتر سرمایهٔ جلسه، آمادهٔ نمایش.
 *
 * جلسهٔ بدون ثبت هم گزارش می‌گیرد — ولی با پیام صریح، نه نوارِ صفرِ
 * خاموش که شبیه «چیزی نمی‌دانیم» است.
 */
export function portfolioLedgerView(session) {
  const ledger = portfolioCapitalLedger(session);
  if (!ledger.ok) return fail(ledger.reason);

  const committed = ledger.committed;
  const empty = committed.count === 0 && ledger.unpriced.count === 0;

  return {
    ok: true,
    why: '',
    reason: null,
    now: ledger.now,
    empty,
    // نوارِ خالی چیزی نمی‌گوید؛ جمله می‌گوید.
    headlineText: empty
      ? 'هنوز هیچ طرحی ثبت نشده؛ کل سرمایهٔ جلسه آزاد است.'
      : `${money(committed.totalRial)} درگیر از ${money(ledger.baseRial)}`
        + ` · ${count(committed.count)} ثبت`,
    baseRialText: money(ledger.baseRial),
    committedRialText: money(committed.totalRial),
    freeRialText: money(ledger.free.rial),
    freePctText: pct(ledger.free.pct),
    countText: count(committed.count),
    components: COMPONENTS.map(({ key, label }) => ({
      key, label, rialText: money(committed[key]),
    })),
    families: committed.byFamily.map((row) => ({
      familyId: row.familyId,
      // شناسهٔ خام به کاربر چیزی نمی‌گوید؛ ولی اگر نامش را نداریم، همان
      // شناسه بهتر از «—» است — دست‌کم قابل پیگیری است.
      label: STRATEGY_FAMILIES[text(row.familyId)] || faDigits(text(row.familyId)) || '—',
      rialText: money(row.totalRial),
      countText: count(row.count),
    })),
    risks: [
      riskRow('minFreeCapital', ledger.risk.minFreeCapital),
      riskRow('maxMarginUse', ledger.risk.maxMarginUse),
    ],
    // پنهان‌کردنش یعنی جمعِ بالا کمتر از واقعیت است و کسی نمی‌فهمد.
    unpriced: ledger.unpriced.count === 0 ? null : {
      count: ledger.unpriced.count,
      countText: count(ledger.unpriced.count),
      idsText: faDigits(ledger.unpriced.eventIds.join('، ')),
      why: `${count(ledger.unpriced.count)} ثبت بدون عدد سرمایه در جمع بالا نیامده است`,
    },
    positionsText: count(ledger.positions),
  };
}
