// نمای روند سود و زیان یک موقعیت — همان چیزی که کارت «سود و زیان جاری»
// نمی‌گفت.
//
// موتورش `core/position-track.mjs` است و اینجا فقط شکل است: ردیف‌های
// نمودار، گزینهٔ ECharts، و جمله‌هایی که کنارش می‌آیند.
//
// ═══ چرا شکافْ نقطه دارد ولی مقدار ندارد ═══
//
// لحظه‌ای که همهٔ پاهایش قیمت ندارند، روی محور **می‌ماند** ولی مقدارش
// `null` است. دو خاصیت با هم لازم‌اند: فاصلهٔ افقی واقعی بماند (وگرنه سه
// روزِ تعطیل و سه روزِ بی‌معامله یک‌شکل دیده می‌شوند) و خط کشیده نشود
// (`connectNulls: false`). خطی که روی روز بی‌داده وصل شود، ادعای قیمت
// می‌کند — همان چیزی که قاعدهٔ ۲-۴ منع کرده.

import { chartBase, chartFormat } from './chart-host.mjs';
import { faDigits, fmt, signTone } from './fmt.mjs';
import { historyDateLabel } from '../core/history.mjs';

/** سه سرچشمهٔ روند، با جمله‌ای که می‌گوید هر کدام چه چیزی را می‌سنجد. */
export const TRACK_MODES = [
  { id: 'daily', label: 'روزانه',
    hint: 'قیمت پایانی هر پا از روز ورود تا امروز — تاریخچهٔ واقعی، نه شبیه‌سازی.' },
  { id: 'intraday', label: 'درون‌روزی',
    hint: 'نوار معاملهٔ امروز هر پا؛ هر لحظه، آخرین معاملهٔ پیش از خودش.' },
  { id: 'session', label: 'همین جلسه',
    hint: 'همان قیمت‌گیری هر پانزده ثانیهٔ این تب. با بستن یا تازه‌کردن صفحه پاک می‌شود.' },
];

export const trackMode = (id) => TRACK_MODES.find((mode) => mode.id === id) || TRACK_MODES[0];

const finite = (value) => Number.isFinite(value);

const clockLabel = (ms) => {
  const date = new Date(Number(ms) || 0);
  const pad = (value) => faDigits(String(value).padStart(2, '0'));
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/**
 * ردیف‌های نمودار: نقطه‌ها و شکاف‌ها، روی یک محور، به ترتیب.
 *
 * `value` برای شکاف `NaN` است و `missing` می‌گوید کدام پا نداشت. ترتیب از
 * کلید طبیعی هر حالت می‌آید — تاریخ، ثانیهٔ روز، یا زمان تیک.
 */
export function trackRows(series, mode = 'daily') {
  const id = trackMode(mode).id;
  const points = series?.points || [];
  const gaps = series?.gaps || [];
  const rows = [];
  if (id === 'session') {
    for (const point of points) {
      rows.push({ key: Number(point.at), label: clockLabel(point.at), value: Number(point.pnlTotal), missing: [] });
    }
    return rows.sort((a, b) => a.key - b.key);
  }
  if (id === 'intraday') {
    for (const point of points) rows.push({ key: Number(point.second), label: point.label, value: Number(point.pnlTotal), missing: [] });
    for (const gap of gaps) rows.push({ key: Number(gap.second), label: gap.label, value: NaN, missing: gap.missing || [] });
    return rows.sort((a, b) => a.key - b.key);
  }
  for (const point of points) {
    rows.push({ key: Number(point.date), label: faDigits(historyDateLabel(point.date)), value: Number(point.pnlTotal), missing: [] });
  }
  for (const gap of gaps) {
    rows.push({ key: Number(gap.date), label: faDigits(historyDateLabel(gap.date)), value: NaN, missing: gap.missing || [] });
  }
  return rows.sort((a, b) => a.key - b.key);
}

/**
 * گزینهٔ نمودار خطی سود و زیان.
 *
 * صفر خطِ مرجع است، نه تزیین: «در سود» و «در زیان» تا وقتی صفر دیده نشود
 * از روی شکلِ خط خوانده نمی‌شوند. ناحیهٔ زیر خط هم رنگ نمی‌گیرد، چون
 * سود و زیان می‌تواند منفی باشد و ناحیهٔ رنگیِ یک‌دست، نیمهٔ منفی را هم
 * «سود» رنگ می‌کرد.
 */
export function trackChartOption(rows = [], tokens = {}, { name = 'سود و زیان' } = {}) {
  const data = rows.map((row) => (finite(row.value) ? row.value : null));
  const last = [...rows].reverse().find((row) => finite(row.value));
  const tone = last && last.value < 0 ? tokens.loss : tokens.gain;
  return {
    ...chartBase(tokens),
    tooltip: {
      ...chartBase(tokens).tooltip,
      trigger: 'axis',
      valueFormatter: (value) => (value == null ? 'بی‌قیمت' : chartFormat.money(value)),
    },
    xAxis: {
      type: 'category', data: rows.map((row) => row.label),
      axisLabel: { color: tokens.muted, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'value', name: 'ریال',
      nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: (value) => chartFormat.money(value) },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: [{
      name, type: 'line', data,
      smooth: false, showSymbol: rows.length <= 40, symbolSize: 5,
      // شکاف وصل نمی‌شود — خطِ پیوسته روی لحظهٔ بی‌قیمت، ادعای قیمت است.
      connectNulls: false,
      lineStyle: { width: 2, color: tone },
      itemStyle: { color: tone },
      markLine: {
        silent: true, symbol: 'none',
        lineStyle: { color: tokens.muted, type: 'dashed', width: 1 },
        data: [{ yAxis: 0, label: { formatter: 'سربه‌سر', color: tokens.muted } }],
      },
    }],
  };
}

/** کارت‌های آمارهٔ روند — همان چهار عددی که از نمودار پرسیده می‌شود. */
export function trackStatsHtml(stats, { changeLabel = 'تغییر در این بازه' } = {}) {
  if (!stats || !stats.count) return '';
  const cards = [
    [changeLabel, fmt.money(stats.change), signTone(stats.change)],
    ['بیشترین سود در بازه', fmt.money(stats.peak), ''],
    ['بیشترین زیان در بازه', fmt.money(stats.trough), ''],
    ['بیشترین افت از قله', fmt.money(-Math.abs(stats.drawdown)), ''],
  ];
  return `<div class="mini-kpis">${cards.map(([key, value, tone]) => `<div class="mini-kpi">
    <div class="k">${key}</div><div class="v ${tone}">${value}</div></div>`).join('')}</div>`;
}

/**
 * جملهٔ زیر نمودار — شمار نقطه، شمار شکاف، و نام پاهایی که نداشتند.
 *
 * شکافِ بی‌نام، شکایت است نه گزارش. کاربری که می‌بیند «۳ لحظه جا افتاد»
 * نمی‌داند دنبال چه بگردد؛ کسی که می‌بیند «طهرم۷۰۵۸ معامله نشده» می‌داند.
 */
export function trackNote(series, mode = 'daily') {
  const id = trackMode(mode).id;
  const points = series?.points?.length || 0;
  const gaps = series?.gaps || [];
  if (!points && series?.reason) return series.reason;
  if (!points) return 'هنوز نقطه‌ای برای این روند ساخته نشده.';
  const parts = [`${faDigits(points)} نقطه`];
  if (gaps.length) {
    const names = [...new Set(gaps.flatMap((gap) => gap.missing || []))].slice(0, 4);
    parts.push(`${faDigits(gaps.length)} لحظه بی‌قیمت — خط همان‌جا قطع است${names.length ? ` (${names.join('، ')})` : ''}`);
  }
  if (id === 'daily' && series?.stoppedAt) {
    parts.push(`روند روی سررسید ${faDigits(historyDateLabel(series.stoppedAt))} ایستاده`);
  }
  if (id === 'session') parts.push('این دنباله در حافظهٔ همین صفحه است و با تازه‌کردن پاک می‌شود');
  return `${parts.join(' · ')}.`;
}
