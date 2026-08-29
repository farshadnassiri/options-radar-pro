// ۱۷۹. نمای بهترین تا بدترین استراتژی‌ها در بازه
//
// ادعاها همان‌اند که بودند — نقشهٔ حرارتی، جابه‌جایی رتبه، انتخاب مشترک با
// کلیک، و پیمایش در عرض کوچک. پیاده‌سازی از SVG دستی به ECharTS محلی رفت،
// پس شکلِ ادعا عوض شده نه خودِ ادعا.

import { check, group, readSrc } from '../harness.mjs';

const ui179 = readSrc('../ui/tabs/portfolio-backtest.mjs');
const view179 = readSrc('../ui/portfolio-analysis-view.mjs');
const worker179 = readSrc('../worker/history-worker.mjs');
const style179 = readSrc('../ui/style.css');

group('۱۷۹. نمای بهترین تا بدترین استراتژی‌ها در بازه');
{
  check('ریسه فقط روزهای دارای سود و بازده معتبر را برای خط زمانی می‌فرستد',
    worker179.includes("row.status === 'ok'")
    && worker179.includes('Number.isFinite(row.netPnl)')
    && worker179.includes('Number.isFinite(row.returnPct)'));
  check('داده روزانه پس از ساخت گزارش و ماتریس از پیام سنگین نتیجه حذف می‌شود',
    worker179.indexOf('const matrix = buildPnlMatrix(rows)')
    < worker179.indexOf('delete row.path.daily'));

  check('بهترین و بدترین با نمرهٔ ترکیبی و صریح گزارش می‌شوند',
    ui179.includes("['بهترین',") && ui179.includes("['بدترین',")
    && ui179.includes('analysis.best') && ui179.includes('analysis.worst'));

  // ── نقشهٔ حرارتی ────────────────────────────────────────────────────
  check('نقشه حرارتی از همان تحلیل مشترک ساخته می‌شود',
    ui179.includes('heatmapOption(analysis, heatMode, labels, tokens)')
    && view179.includes('export function heatmapOption('));
  check('رنگ نقشه پیوسته است، نه چهار پلهٔ گسسته',
    view179.includes('visualMap:') && view179.includes('inRange: { color: range }')
    && !view179.includes('heat-${heatLevel('));
  check('کلیک روی خانهٔ نقشه همان استراتژی را انتخاب می‌کند',
    ui179.includes("charts.set('heatmap'") && ui179.includes('selectStrategy(row.strategyId)'));
  check('خانهٔ بی‌داده در نقشه رسم نمی‌شود',
    view179.includes('if (value === null) continue;'));

  // ── جابه‌جایی رتبه ──────────────────────────────────────────────────
  check('نمودار تغییر رتبه از همان تحلیل و انتخاب مشترک استفاده می‌کند',
    ui179.includes('bumpOption(analysis, labels, tokens)')
    && ui179.includes('selectStrategyByName(params.seriesName)'));
  check('محور رتبه وارونه است تا بالا یعنی بهتر',
    view179.includes("yAxis: {\n      type: 'value', inverse: true, min: 1"));
  check('نام استراتژی کنار آخرین نقطه می‌نشیند، نه در راهنمای کناری',
    view179.includes('endLabel: { show: true'));
  check('خط بریده وصل نمی‌شود؛ روز بی‌رتبه شکاف می‌ماند',
    view179.includes('connectNulls: false'));

  // ── چیدمان ──────────────────────────────────────────────────────────
  check('هر ظرف نمودار ارتفاع صریح دارد',
    style179.includes('.pb-chart { width: 100%; min-width: 0; height: 320px; }'));
  check('نمودارها در عرض کوچک کوتاه‌تر می‌شوند، نه اینکه صفحه را بکشند',
    style179.includes('@media (max-width: 900px)') && style179.includes('.pb-chart { height: 260px; }'));
  check('رنگ ردیف جدول شش پله در هر جهت دارد، نه سه پله',
    style179.includes('tr[data-tone="gain"][data-level="6"]')
    && style179.includes('tr[data-tone="loss"][data-level="6"]')
    && style179.includes('.pb-panel tr[data-tone="flat"]'));
}
