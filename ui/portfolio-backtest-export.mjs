// دفترچهٔ اکسل آزمون همه استراتژی‌ها.
//
// خروجی تک‌جدولی، هر بار یک تکه از ماجرا را می‌داد و کاربر باید ده بار
// دکمه می‌زد و بعد خودش کنار هم می‌چیدشان. اینجا یک فایل است با یازده برگ
// که همه از **یک تحلیل** ساخته می‌شوند — پس عددِ برگ «سنجه‌ها» با عددِ برگ
// «ترکیب‌ها» نمی‌تواند فرق کند.
//
// دو قاعده که در همهٔ برگ‌ها یکی است:
//
//   • هر عدد درصدی، نامِ مبنایش را در برگ «سرشناسه» دارد. یک ستون «بازده»
//     بدون آن، در فایلی که ماه بعد باز می‌شود، بی‌معناست.
//   • خانهٔ نامعلوم خالی می‌ماند، نه صفر. اکسل صفر را جمع می‌زند و
//     میانگین می‌گیرد؛ خالی را نمی‌گیرد. همین یک تفاوت، کل گزارش را
//     درست یا غلط می‌کند.

import { downloadXlsx, sheet, sheetParts } from './xlsx.mjs';
import { METRICS } from '../core/portfolio-report.mjs';

export const PORTFOLIO_BACKTEST_EXPORT_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

/** عدد خام برای اکسل؛ نامعلوم، خانهٔ خالی می‌شود نه صفر. */
const cell = (value) => {
  const out = finite(value);
  return out === null ? '' : out;
};

const round = (value, digits = 4) => {
  const out = finite(value);
  return out === null ? '' : Math.round(out * (10 ** digits)) / (10 ** digits);
};

const pearson = (a = [], b = []) => {
  const pairs = [];
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const left = finite(a[index]), right = finite(b[index]);
    if (left !== null && right !== null) pairs.push([left, right]);
  }
  if (pairs.length < 3) return null;
  const meanA = pairs.reduce((sum, row) => sum + row[0], 0) / pairs.length;
  const meanB = pairs.reduce((sum, row) => sum + row[1], 0) / pairs.length;
  let top = 0, da = 0, db = 0;
  for (const [left, right] of pairs) {
    top += (left - meanA) * (right - meanB);
    da += (left - meanA) ** 2; db += (right - meanB) ** 2;
  }
  const bottom = Math.sqrt(da) * Math.sqrt(db);
  return bottom > 1e-12 ? top / bottom : null;
};

/**
 * دفترچهٔ کامل یک اجرا.
 *
 * `context` چیزهایی است که تحلیل نمی‌داند و فایل بدونشان بی‌هویت می‌شود:
 * نام نماد، تاریخ‌ها، مبنای قیمت، تعداد واحد و قیود نقدشوندگی.
 */
export function portfolioBacktestWorkbook(analysis, {
  context = {}, basket = null, dateLabel = (value) => String(value ?? ''), generated = [],
} = {}) {
  if (!analysis) return [];
  const labels = (analysis.dates || []).map(dateLabel);

  // ── ۱. سرشناسه ───────────────────────────────────────────────────────
  const header = [
    ['نماد پایه', context.baseName ?? ''],
    ['کد نماد پایه', context.baseIns ?? ''],
    ['تاریخ ورود', context.entryDate ? dateLabel(context.entryDate) : ''],
    ['تاریخ سنجش', context.exitDate ? dateLabel(context.exitDate) : ''],
    ['لحظهٔ سنجش', context.markLabel ?? 'پایان روز'],
    ['مبنای قیمت ورود', context.entryBasis ?? ''],
    ['مبنای قیمت خروج', context.exitBasis ?? ''],
    ['تعداد واحد', cell(context.units)],
    ['سقف ترکیب هر استراتژی', cell(context.cap)],
    ['—', ''],
    ['مبنای بازده', analysis.basis?.label ?? ''],
    ['تعریف مبنا', analysis.basis?.hint ?? ''],
    ['آمارهٔ دسته‌ها', analysis.statisticLabel ?? ''],
    ['وزن‌دهی', analysis.weightingLabel ?? ''],
    ['بازهٔ تحلیل', `${analysis.range?.from ? dateLabel(analysis.range.from) : ''} تا ${analysis.range?.to ? dateLabel(analysis.range.to) : ''}`],
    ['روز معتبر بازه', cell(analysis.range?.days)],
    ['—', ''],
    ['ترکیب وارد رتبه‌بندی', cell(analysis.usable)],
    ['ترکیب کنارگذاشته', cell(analysis.unusable)],
    ['استراتژی سنجیده‌شده', cell(analysis.strategies?.length)],
    ['خانواده', cell(analysis.groups?.length)],
    ['بازده خودِ نماد پایه (درصد)', round(analysis.baseFinal, 2)],
    ['ترکیبِ زیانِ بیش از مبنا', cell(analysis.beyondBasis)],
  ];

  // ── ۲. سنجه‌ها ───────────────────────────────────────────────────────
  const metricRows = (analysis.strategies || []).map((row) => [
    cell(row.rank), row.strategyName ?? '', row.groupName ?? '',
    row.feasible ? 'قابل اجرا' : 'ساختاری',
    cell(row.samples), cell(row.wins), cell(row.losses),
    round(row.score, 2), round(row.scoreCoverage, 1),
    ...METRICS.map((metric) => round(row.metrics?.[metric.id], 4)),
    row.beyondBasis ? 'بله' : 'خیر',
  ]);

  // ── ۳. سرخط‌ها ───────────────────────────────────────────────────────
  const highlightRows = (analysis.highlights || []).map((item) => [
    item.label, item.row?.strategyName ?? '',
    item.metric === 'score' ? 'نمرهٔ ترکیبی' : (METRICS.find((row) => row.id === item.metric)?.label ?? item.metric),
    round(item.metric === 'score' ? item.row?.score : item.row?.metrics?.[item.metric], 4),
    item.hint,
  ]);

  // ── ۴. خانواده‌ها ────────────────────────────────────────────────────
  const totalSamples = (analysis.groups || []).reduce((sum, row) => sum + row.samples, 0);
  const groupRows = (analysis.groups || []).map((row) => [
    row.groupName ?? '', cell(row.samples),
    round(totalSamples ? (row.samples / totalSamples) * 100 : null, 2),
    cell(row.strategies), cell(row.wins), round(row.winPct, 2), round(row.returnStat, 4),
    row.bestStrategy?.strategyName ?? '', row.worstStrategy?.strategyName ?? '',
  ]);

  // ── ۵. ترکیب‌ها ──────────────────────────────────────────────────────
  const comboRows = (analysis.combos || []).map((combo) => [
    combo.id ?? '', combo.strategyName ?? '', combo.groupName ?? '',
    (combo.strikes || []).join(' / '), (combo.expiries || []).map(dateLabel).join(' / '),
    combo.series?.ok ? 'معتبر' : 'کنارگذاشته', combo.series?.ok ? '' : (combo.series?.why ?? ''),
    cell(combo.series?.denominator),
    cell(combo.entry?.marginGross), cell(combo.entry?.marginNet), cell(combo.entry?.netCash),
    cell(combo.entry?.notional), cell(combo.entry?.spot),
    combo.entry?.legValueComplete ? cell(combo.entry?.legValue) : '',
    cell(combo.series?.finalPnl), round(combo.series?.finalPct, 4),
    round(combo.series?.bestPct, 4), round(combo.series?.worstPct, 4),
    round(combo.series?.maxDrawdownPct, 4),
    combo.series?.firstProfitIndex === null || combo.series?.firstProfitIndex === undefined
      ? '' : cell(combo.series.firstProfitIndex),
    cell(combo.series?.observed), cell(combo.series?.missing),
    combo.series?.beyondBasis ? 'بله' : 'خیر',
  ]);

  // ── ۶. مسیر روزانه ───────────────────────────────────────────────────
  const pathRows = (analysis.strategies || []).flatMap((row) => (analysis.dates || []).map((date, column) => [
    row.strategyName ?? '', row.groupName ?? '', dateLabel(date), cell(column),
    round(row.path?.cumulative?.[column], 4),
    round(row.path?.step?.[column], 4),
    round(row.path?.drawdown?.[column], 4),
    round(row.path?.winPct?.[column], 2),
    cell(row.path?.rank?.[column]),
    cell(row.path?.samples?.[column]),
  ]));

  // ── ۷. افق نگهداری ───────────────────────────────────────────────────
  const usable = (analysis.combos || []).filter((combo) => combo.series?.ok);
  const horizonRows = (analysis.dates || []).map((date, column) => {
    const values = usable.map((combo) => finite(combo.series.pct[column])).filter((value) => value !== null);
    if (!values.length) return [cell(column), dateLabel(date), '', '', '', '', ''];
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return [
      cell(column), dateLabel(date), cell(values.length),
      round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2, 4),
      round((values.filter((value) => value > 0).length / values.length) * 100, 2),
      round(sorted.at(-1), 4), round(sorted[0], 4),
    ];
  });

  // ── ۸. توزیع ─────────────────────────────────────────────────────────
  const distRows = (analysis.strategies || []).map((row) => [
    row.strategyName ?? '', cell(row.samples),
    round(row.worst, 4), round(row.p25, 4), round(row.metrics?.return, 4),
    round(row.p75, 4), round(row.best, 4), round(row.metrics?.spread, 4),
  ]);

  // ── ۹. همبستگی ───────────────────────────────────────────────────────
  const withPath = (analysis.strategies || []).filter((row) => (row.path?.cumulative || []).some((value) => value !== null));
  const pairRows = [];
  for (let a = 0; a < withPath.length; a++) {
    for (let b = a + 1; b < withPath.length; b++) {
      const value = pearson(withPath[a].path.cumulative, withPath[b].path.cumulative);
      if (value === null) continue;
      pairRows.push([
        withPath[a].strategyName ?? '', withPath[b].strategyName ?? '', round(value, 4),
        value > 0.9 ? 'تقریباً یک شرط‌بندی‌اند' : value > 0.6 ? 'هم‌جهت‌اند' : value < -0.3 ? 'خلاف هم می‌روند' : 'مستقل‌اند',
      ]);
    }
  }
  pairRows.sort((x, y) => (finite(y[2]) ?? -Infinity) - (finite(x[2]) ?? -Infinity));

  // ── ۱۰. سبد فرضی ─────────────────────────────────────────────────────
  const basketSheets = basket?.ok ? [
    sheet('سبد — اجزا', ['استراتژی', 'ترکیب', 'درصد خواسته', 'بودجهٔ هدف (ریال)', 'بهای هر دست', 'دست', 'پول درگیر', 'نقد مانده', 'سود/زیان', 'وضعیت'],
      (basket.legs || []).map((leg) => [
        leg.strategyName ?? '', leg.comboId ?? '', cell(leg.pct), cell(leg.targetRial),
        cell(leg.unitCostRial), cell(leg.lots), cell(leg.deployedRial), cell(leg.idleRial),
        cell(leg.finalPnlRial), leg.ok ? 'تأمین شد' : leg.why,
      ])),
    sheet('سبد — مسیر', ['تاریخ', 'سود شناخته‌شده', 'سود کل', 'ارزش سبد', 'بازده (درصد)', 'جزء بی‌داده'],
      (basket.path || []).map((point) => [
        dateLabel(point.date), cell(point.knownPnlRial), cell(point.totalPnlRial),
        cell(point.equityRial), round(point.returnPct, 4), (point.unknown || []).join('، '),
      ])),
    sheet('سبد — سهم اجزا', ['استراتژی', 'ترکیب', 'دست', 'پول درگیر', 'سود/زیان', 'بازده جزء (درصد)', 'سهم از سود کل (درصد)'],
      (basket.contributions || []).map((row) => [
        row.strategyName ?? '', row.comboId ?? '', cell(row.lots), cell(row.deployedRial),
        cell(row.finalPnlRial), round(row.returnPct, 4), round(row.sharePct, 2),
      ])),
  ] : [];

  // ── ۱۱. محدودیت‌های داده ─────────────────────────────────────────────
  //
  // این برگ عمداً آخر است و عمداً هست. فایلی که فقط عددهای موفق را نشان
  // دهد، خودش یک ادعای ناگفته دارد: «بقیه‌اش هم همین‌طور بود».
  const limitRows = [
    ['ترکیب فاقد مخرج یا پایان معتبر', cell(analysis.unusable), 'وارد هیچ آماره‌ای نشده'],
    ['ترکیبِ زیانِ بیش از مبنا', cell(analysis.beyondBasis), 'عدد بریده نشده؛ در فروش برهنه زیان سقف ندارد ولی مخرج دارد'],
    ['استراتژی سقف‌خورده', cell((generated || []).filter((row) => row.capped).length), 'شمار ترکیب‌هایشان با سقف کاربر محدود شده'],
    ['استراتژی بدون ترکیب معتبر', cell((generated || []).filter((row) => !row.accepted).length), 'در این بازه هیچ ترکیبی از آن‌ها داده کامل نداشت'],
    ['روزِ بی‌داده در مسیرها', cell((analysis.combos || []).reduce((sum, combo) => sum + (combo.series?.missing ?? 0), 0)),
      'خانهٔ خالی مانده؛ با قیمت روز قبل پر نشده'],
    ['—', '', ''],
    ['قاعدهٔ خانهٔ خالی', '', 'خانهٔ خالی یعنی داده نبود. صفر یعنی سر به سر. اکسل صفر را در میانگین می‌شمارد و خالی را نمی‌شمارد.'],
  ];

  return [
    sheet('سرشناسه', ['قلم', 'مقدار'], header, [200, 320]),
    sheet('سرخط‌ها', ['سرخط', 'استراتژی', 'سنجه', 'مقدار', 'یعنی چه'], highlightRows, [130, 200, 150, 90, 420]),
    ...sheetParts('سنجه‌ها', [
      'رتبه', 'استراتژی', 'خانواده', 'اجراپذیری', 'ترکیب', 'سودده', 'زیان‌ده', 'نمره', 'پوشش نمره (درصد)',
      ...METRICS.map((metric) => `${metric.label}${metric.unit === 'pct' ? ' (درصد)' : metric.unit === 'money' ? ' (ریال)' : ''}`),
      'زیان بیش از مبنا',
    ], metricRows),
    sheet('خانواده‌ها', ['خانواده', 'ترکیب', 'سهم از کل (درصد)', 'استراتژی', 'سودده', 'نرخ برد (درصد)', 'بازده (درصد)', 'بهترین عضو', 'بدترین عضو'], groupRows),
    ...sheetParts('ترکیب‌ها', [
      'شناسه', 'استراتژی', 'خانواده', 'قیمت اعمال', 'سررسید', 'وضعیت', 'علت کنارگذاشتن',
      'مخرج بازده', 'وجه تضمین ناخالص', 'وجه تضمین خالص', 'نقد خالص ورود', 'ارزش اسمی', 'قیمت پایه در ورود',
      'ارزش معاملهٔ ورود', 'سود/زیان پایان', 'بازده پایان (درصد)', 'بهترین نقطه (درصد)', 'بدترین نقطه (درصد)',
      'بیشترین افت (درصد)', 'روز تا نخستین سود', 'روز دارای داده', 'روز بی‌داده', 'زیان بیش از مبنا',
    ], comboRows),
    ...sheetParts('مسیر روزانه', ['استراتژی', 'خانواده', 'تاریخ', 'روز نگهداری', 'بازده تجمعی (درصد)', 'تغییر همان روز (درصد)', 'افت از سقف (درصد)', 'نرخ برد روز (درصد)', 'رتبهٔ روز', 'نمونهٔ روز'], pathRows),
    sheet('افق نگهداری', ['روز نگهداری', 'تاریخ خروج', 'ترکیب معتبر', 'میانهٔ بازده (درصد)', 'نرخ برد (درصد)', 'بهترین (درصد)', 'بدترین (درصد)'], horizonRows),
    sheet('توزیع', ['استراتژی', 'ترکیب', 'بدترین (درصد)', 'چارک پایین (درصد)', 'آمارهٔ مرکزی (درصد)', 'چارک بالا (درصد)', 'بهترین (درصد)', 'پهنای چارک‌ها (درصد)'], distRows),
    ...sheetParts('همبستگی', ['استراتژی', 'استراتژی', 'همبستگی مسیر', 'خواندنش'], pairRows),
    ...basketSheets,
    sheet('محدودیت داده', ['قلم', 'شمار', 'یعنی چه'], limitRows, [240, 90, 520]),
    sheet('برگ‌ها', ['برگ', 'چه دارد'], [
      ['سرشناسه', 'پارامترهای اجرا و عدسی؛ بدون این، هیچ درصدی در بقیهٔ برگ‌ها معنا ندارد'],
      ['سرخط‌ها', 'ده سؤال تک‌جمله‌ای با جواب و سنجه‌اش'],
      ['سنجه‌ها', 'هر استراتژی با هر چهارده سنجه و نمرهٔ ترکیبی'],
      ['خانواده‌ها', 'تجمیع خانواده‌ای با سهم درصدی'],
      ['ترکیب‌ها', 'هر ترکیب با مخرج، اجزای مخرج، نتیجه و شمار روز بی‌داده'],
      ['مسیر روزانه', 'برای PivotTable: استراتژی × روز، با بازده تجمعی، تغییر روز، افت و رتبه'],
      ['افق نگهداری', 'اگر بعد از n روز می‌بستیم چه می‌شد'],
      ['توزیع', 'چارک‌ها و دُم‌های هر استراتژی'],
      ['همبستگی', 'زوج‌به‌زوج، برای پیداکردن تنوع دروغین'],
      ['سبد — اجزا', 'تخصیص سرمایه: درصد خواسته، بهای هر دست، شمار دست و نقد مانده'],
      ['سبد — مسیر', 'ارزش روزانهٔ سبد؛ روزی که جزئی داده ندارد، ارزش کل خالی می‌ماند'],
      ['سبد — سهم اجزا', 'سهم هر جزء از سود کل و بازدهش روی پول درگیر خودش'],
      ['محدودیت داده', 'آنچه در این اجرا اندازه گرفته نشد و چرا'],
    ], [220, 520]),
  ];
}

/** نام فایل — نماد و بازه، تا دو فایل روی هم نیفتند. */
export function portfolioBacktestFilename(context = {}) {
  const parts = ['آزمون-همه-استراتژی‌ها'];
  if (context.baseName) parts.push(String(context.baseName).replace(/\s+/g, '-'));
  if (context.entryDate) parts.push(String(context.entryDate));
  if (context.exitDate) parts.push(String(context.exitDate));
  return parts.join('-');
}

export async function downloadPortfolioBacktest(analysis, options = {}) {
  const sheets = portfolioBacktestWorkbook(analysis, options);
  if (!sheets.length) return false;
  await downloadXlsx(portfolioBacktestFilename(options.context), sheets);
  return true;
}
