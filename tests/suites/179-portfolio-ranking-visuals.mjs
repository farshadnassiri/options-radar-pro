// ۱۷۹. نمای بهترین تا بدترین استراتژی‌ها در بازه

import { check, group, readSrc } from '../harness.mjs';

const ui179 = readSrc('../ui/tabs/portfolio-backtest.mjs');
const worker179 = readSrc('../worker/history-worker.mjs');
const style179 = readSrc('../ui/style.css');

group('۱۷۹. نمای بهترین تا بدترین استراتژی‌ها در بازه');
{
  check('ریسه فقط روزهای دارای سود و بازده معتبر را برای خط زمانی می‌فرستد',
    worker179.includes("row.status === 'ok'")
    && worker179.includes('Number.isFinite(row.netPnl)')
    && worker179.includes('Number.isFinite(row.returnPct)'));
  check('داده روزانه پس از ساخت گزارش از پیام سنگین نتیجه حذف می‌شود',
    worker179.indexOf('const report = summarizePortfolio(rows)')
    < worker179.indexOf('delete row.path.daily'));
  check('رتبه‌بندی نهایی و پایداری بازه با دو عنوان صریح از هم جدا هستند',
    ui179.includes('بهترین در پایان بازه') && ui179.includes('پایدارترین در بازه'));
  check('نقشه حرارتی از گزارش مشترک خط زمانی ساخته می‌شود',
    ui179.includes('function timelineHeatmap(')
    && ui179.includes("timelineHeatmap($('pb-heatmap'), report.timeline, selectStrategy)"));
  check('نمودار تغییر رتبه از همان خط زمانی و انتخاب مشترک استفاده می‌کند',
    ui179.includes('function rankBumpChart(')
    && ui179.includes("rankBumpChart($('pb-rank-chart'), report.timeline, selectStrategy)")
    && ui179.includes("index === previousIndex + 1 ? 'L' : 'M'"));
  check('میله بهترین تا بدترین محور صفر میانی و دو جهت سود و زیان دارد',
    ui179.includes('portfolio-bar-track')
    && style179.includes('.portfolio-bar-track::after')
    && style179.includes('.portfolio-bar-fill.gain')
    && style179.includes('.portfolio-bar-fill.loss'));
  check('Heatmap و رتبه در عرض کوچک داخل ظرف خود پیمایش می‌شوند',
    style179.includes('.portfolio-viz-scroll')
    && style179.includes('.portfolio-timeline-grid { grid-template-columns: 1fr; }'));
}
