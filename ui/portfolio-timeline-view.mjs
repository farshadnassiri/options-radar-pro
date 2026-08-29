// مدل نمایش سری زمانی سود و زیان — بند ۲ فاز ۹.
//
// `core/portfolio-timeline.mjs` می‌داند در هر پله چه بر سر هر استراتژی و
// کل سبد آمده. اینجا فقط قالب‌بندی می‌شود، برچسب خوانا می‌گیرد، و نقاطِ
// آمادهٔ نمودار ساخته می‌شوند.
//
// چهار مرز:
//
// **هیچ عدد مالی تازه‌ای اینجا ساخته نمی‌شود.** تنها کارِ عددی، تقسیم بر
// ده برای تبدیل ریال به تومان است. جمع، تفریق و درصد کارِ موتور است.
//
// **نبودِ عدد «—» می‌شود، نه صفر.** پلهٔ نامعلوم روی نمودار `null` می‌ماند
// تا خط بشکند، و در جدول علتش را با خودش می‌برد.
//
// **رنگ از عدد می‌آید، نه از نوبت.** شدتِ رنگ به بزرگیِ خودِ عدد بستگی
// دارد، و مقیاسش از بزرگ‌ترین قدرمطلقِ همان سری درمی‌آید — پس کاربر
// می‌داند «پررنگ» یعنی چه و مقیاس هم گفته می‌شود.
//
// **عددِ تخمینی رنگ و متنِ خودش را دارد.** اگر قیمت از پلهٔ قبل حمل شده،
// عدد هست ولی مشاهدهٔ آن لحظه نیست؛ یکی‌کردنشان یعنی کاربر به عددی
// اعتماد می‌کند که ندیده‌ایم.
//
// اینجا DOM نیست و رشتهٔ HTML ساخته نمی‌شود؛ تب خودش رسم می‌کند.

import { fmt, faDigits } from './fmt.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { PORTFOLIO_TIMELINE_MODES, portfolioTimeline } from '../core/portfolio-timeline.mjs';
import { GROUPS as STRATEGY_FAMILIES, byId } from '../strategies/catalog.mjs';

export const TIMELINE_VIEW_MODES = PORTFOLIO_TIMELINE_MODES;

/** شمار پله‌های شدت در هر سمت. سه تا، چون بیشترش دیگر تفکیک‌پذیر نیست. */
export const TIMELINE_BAND_STEPS = 3;

const text = (value) => String(value ?? '').trim();
const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
/** ریال به تومان، فقط برای نمایش. */
const toman = (rial) => (finite(rial) === null ? null : finite(rial) / 10);
const moneyText = (rial) => (finite(rial) === null ? '—' : fmt.money(toman(rial)));
const pctText = (value) => (finite(value) === null ? '—' : `${fmt.pct(finite(value))}٪`);

const clockText = (second) => {
  const value = Math.max(0, Math.trunc(finite(second) ?? 0));
  return faDigits(`${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}`);
};
const momentText = (at) => `${faDigits(historyDateLabel(at?.date))} ساعت ${clockText(at?.second)}`;

/**
 * شدت و جهتِ رنگ یک عدد.
 *
 * `scale` بزرگ‌ترین قدرمطلقِ همان مجموعه است، پس مقیاس از خودِ داده
 * درمی‌آید نه از عددی که کسی حدس زده. صفر پلهٔ خودش را دارد: نه سود است
 * نه زیان، و رنگِ سودِ کم‌رنگ برایش گمراه‌کننده است. نبودِ عدد رنگ ندارد.
 */
export function pnlBand(value, scale) {
  const number = finite(value);
  if (number === null) return { level: 0, tone: '', label: 'نامعلوم' };
  if (number === 0) return { level: 0, tone: 'flat', label: 'بی‌تغییر' };
  const span = finite(scale);
  const tone = number > 0 ? 'gain' : 'loss';
  if (span === null || !(span > 0)) return { level: 1, tone, label: tone === 'gain' ? 'سود' : 'زیان' };
  const share = Math.min(1, Math.abs(number) / span);
  const level = Math.max(1, Math.ceil(share * TIMELINE_BAND_STEPS));
  const label = `${tone === 'gain' ? 'سود' : 'زیان'} ${['کم', 'متوسط', 'زیاد'][level - 1]}`;
  return { level, tone, label };
}

/** برچسب خوانای یک استراتژی، یا شناسهٔ خامش وقتی در فهرست نیست. */
function strategyLabel(defId) {
  const id = text(defId);
  return text(byId(id)?.name) || faDigits(id) || '—';
}

const familyLabel = (familyId) => STRATEGY_FAMILIES[text(familyId)]
  || faDigits(text(familyId)) || '—';

function failed(series) {
  return {
    ok: false,
    why: series?.why || '',
    reason: series?.reason || 'noSeries',
    modeLabel: '',
    scaleRial: null,
    scaleText: '—',
    estimatedCount: 0,
    estimatedNote: '',
    steps: [],
    strategies: [],
    chartPoints: [],
    chartSeries: [],
    headlineText: '',
  };
}

/**
 * نمای سری زمانی.
 *
 * ورودی یا خروجی `portfolioTimeline` است یا همان آرگومان‌هایش؛ حالت دوم
 * فقط برای راحتیِ تب است و عددی را عوض نمی‌کند.
 */
export function portfolioTimelineView(series) {
  if (!series?.ok) return failed(series);
  const steps = Array.isArray(series.steps) ? series.steps : [];
  if (!steps.length) return failed({ why: 'سری زمانی پله‌ای ندارد', reason: 'noSteps' });

  // مقیاس رنگ از بزرگ‌ترین قدرمطلقِ همین سری — کل سبد و تک‌تک استراتژی‌ها
  // با یک مقیاس سنجیده می‌شوند، وگرنه دو جدولِ کنار هم دو معنیِ متفاوت
  // برای یک رنگ می‌دهند.
  const magnitudes = steps.flatMap((step) => [
    finite(step.totalPnlRial), ...step.rows.map((row) => finite(row.pnlRial)),
  ]).filter((value) => value !== null).map(Math.abs);
  const scaleRial = magnitudes.length ? Math.max(...magnitudes) : null;

  const known = new Map();
  for (const item of series.strategies || []) known.set(item.positionId, item);

  const stepViews = steps.map((step) => {
    const band = pnlBand(step.totalPnlRial, scaleRial);
    return {
      at: { ...step.at },
      atText: momentText(step.at),
      dateText: faDigits(historyDateLabel(step.at?.date)),
      timeText: clockText(step.at?.second),
      totalRial: finite(step.totalPnlRial),
      totalText: moneyText(step.totalPnlRial),
      totalTone: band.tone,
      totalLevel: band.level,
      totalBandLabel: band.label,
      pctText: pctText(step.totalPnlPct),
      returnPctText: pctText(step.returnOnCapitalPct),
      realizedText: moneyText(step.realizedRial),
      unrealizedText: moneyText(step.unrealizedRial),
      capitalBaseText: moneyText(step.capitalBaseRial),
      openText: faDigits(String(step.openPositions)),
      estimated: step.estimated === true,
      // جمعِ ناقص از جمعِ کامل جدا گفته می‌شود؛ وگرنه کاربر نمی‌داند چقدر
      // از تصویر را می‌بیند.
      partial: step.totalPnlRial === null && step.knownCount > 0,
      partialText: step.totalPnlRial === null && step.knownCount > 0
        ? `جمعِ ${faDigits(String(step.knownCount))} استراتژیِ معلوم ${moneyText(step.knownPnlRial)} تومان است؛ ${faDigits(String(step.unknownIds.length))} استراتژی نامعلوم مانده، پس جمع کل ساخته نمی‌شود`
        : '',
      unknownCount: step.unknownIds.length,
      rows: step.rows.map((row) => {
        const rowBand = pnlBand(row.pnlRial, scaleRial);
        return {
          positionId: row.positionId,
          label: strategyLabel(row.defId),
          familyText: familyLabel(row.familyId),
          openQtyText: faDigits(String(row.openQty)),
          statusText: row.openQty > 0 ? 'باز' : 'بسته',
          known: row.known === true,
          pnlRial: finite(row.pnlRial),
          pnlText: moneyText(row.pnlRial),
          pnlPctText: pctText(row.pnlPct),
          realizedText: moneyText(row.realizedRial),
          unrealizedText: moneyText(row.unrealizedRial),
          tone: rowBand.tone,
          level: rowBand.level,
          bandLabel: rowBand.label,
          estimated: row.estimated === true,
          estimatedText: row.estimated
            ? `قیمت ${faDigits(String(row.estimatedLegs.length))} پا از ${momentText(row.estimatedLegs[0]?.asOf)} حمل شده؛ مشاهدهٔ این لحظه نیست`
            : '',
          why: row.why || '',
        };
      }),
    };
  });

  // یک کلید به ازای هر استراتژی، به علاوهٔ کلید کل سبد. `null` سرِ جایش
  // می‌ماند تا نمودار خط را همان‌جا بشکند.
  const strategies = [...known.values()].map((item, index) => ({
    positionId: item.positionId,
    key: `s${index + 1}`,
    label: strategyLabel(item.defId),
    familyText: familyLabel(item.familyId),
    openedAtText: item.openedAt ? momentText(item.openedAt) : '—',
    color: `var(--series-${(index % 5) + 1})`,
  }));

  const chartPoints = steps.map((step) => {
    const point = {
      date: step.at.date,
      second: step.at.second,
      granularity: 'trade',
      timeLabel: clockText(step.at.second),
      total: finite(step.totalPnlRial) === null ? null : toman(step.totalPnlRial),
    };
    for (const item of strategies) {
      const row = step.rows.find((entry) => entry.positionId === item.positionId);
      point[item.key] = finite(row?.pnlRial) === null ? null : toman(row.pnlRial);
    }
    return point;
  });

  const estimatedCount = stepViews.filter((step) => step.estimated).length;
  const last = stepViews[stepViews.length - 1];

  return {
    ok: true,
    why: '',
    reason: null,
    mode: series.mode,
    modeLabel: series.modeLabel || TIMELINE_VIEW_MODES[series.mode] || '',
    scaleRial,
    scaleText: moneyText(scaleRial),
    estimatedCount,
    // عددِ حمل‌شده بی‌صدا نمی‌ماند. اگر بماند، نمودارِ پیوسته شبیه
    // مشاهدهٔ کامل دیده می‌شود.
    estimatedNote: estimatedCount > 0
      ? `${faDigits(String(estimatedCount))} پله قیمتِ حمل‌شده دارد؛ عددشان مشاهدهٔ همان لحظه نیست`
      : '',
    steps: stepViews,
    strategies,
    chartPoints,
    chartSeries: [
      { key: 'total', label: 'کل سبد', color: 'var(--accent)' },
      ...strategies.map((item) => ({ key: item.key, label: item.label, color: item.color })),
    ],
    // دو درصد در کارند و شبیه هم‌اند: یکی روی سرمایهٔ درگیر، یکی روی
    // سرمایهٔ شروع جلسه. عددِ بی‌مبنا در سرخط، خواننده را به مقایسهٔ اشتباه
    // با ستون جدول می‌کشاند.
    headlineText: `${faDigits(String(stepViews.length))} پله · آخرین سود و زیان ${last.totalText} تومان${last.pctText === '—' ? '' : ` · ${last.pctText} روی سرمایهٔ درگیر`}`,
  };
}

/** میان‌بر: ساختن سری و نمایش آن با هم. عددی اینجا تغییر نمی‌کند. */
export function portfolioTimelineFrom(session, steps, options) {
  return portfolioTimelineView(portfolioTimeline(session, steps, options));
}
