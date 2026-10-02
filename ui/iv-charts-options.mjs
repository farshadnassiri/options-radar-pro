// سازنده‌های خالص تب «نوسان ضمنی» — گزینهٔ نمودارها و HTML فهرست نماد.
//
// جدا از `ui/iv-charts-view.mjs` تا آزمون بی مرورگر واردشان کند (نمای اصلی
// انتخابگر تاریخ را می‌آورد که مسیر مرورگری دارد). رنگ فقط از توکن.

import { fmt, faDigits, ltr } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { momentLabel } from '../core/intraday-grid.mjs';
import { IV_INDEX_WHY } from '../core/vol-rank.mjs';
import { INTRADAY_WHY } from '../core/vol-intraday.mjs';
import { movingAverage, expiriesOf, contractLabel, IV_DAILY_WHY } from '../core/iv-chart.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const isNum = (value) => Number.isFinite(value);
const dateLabel = (value) => faDigits(historyDateLabel(value));
const pct = (value) => (isNum(value) ? `${fmt.pct(value)}٪` : '—');
const nul = (value) => (isNum(value) ? Math.round(value * 100) / 100 : null);
const tick = (value) => ltr(Number(value) < 0 ? `−${faDigits(String(Math.abs(value)))}` : faDigits(String(value)));

export const MASTER_SERIES = [
  ['iv', 'نوسان ضمنی'], ['ma', 'میانگین ۵ روزهٔ نوسان'], ['hv', 'نوسان تاریخی (HV)'],
  ['price', 'قیمت'], ['volume', 'حجم'], ['oi', 'موقعیت باز'],
];
export const RANGE_SPANS = [[1, 'امروز'], [3, '۳ روز اخیر'], [5, '۵ روز اخیر'], [10, '۱۰ روز اخیر'], [20, '۲۰ روز اخیر'], [0, 'بازهٔ دلخواه']];
export const RANGE_GRAINS = [['m5', '۵ دقیقه'], ['m15', '۱۵ دقیقه'], ['m30', '۳۰ دقیقه'], ['m60', '۶۰ دقیقه'], ['day', 'روزانه']];

// ═══════════════════ سازنده‌های خالص ═══════════════════

const axisCommon = (tokens) => ({
  axisLabel: { color: tokens.muted },
  axisLine: { lineStyle: { color: tokens.line } },
  splitLine: { lineStyle: { color: tokens.lineSoft } },
});
const zoom = [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6 }];

/** فهرست نمادهای انتخاب: شاخص پایه، بعد قراردادها به تفکیک سررسید. */
export function instrumentOptionsHtml(contracts = [], selected = 'index', { uaName = '', today = 0, openOnly = false } = {}) {
  const groups = expiriesOf(contracts, today)
    .filter((expiry) => !openOnly || !today || expiry >= today)
    .map((expiry) => {
      const list = contracts.filter((c) => Number(c.expiry) === expiry).sort((a, b) => (a.kind === b.kind ? a.strike - b.strike : a.kind === 'call' ? -1 : 1));
      return `<optgroup label="${esc(`سررسید ${dateLabel(expiry)}${today && expiry < today ? ' (سررسیدشده)' : ''}`)}">${list
        .map((c) => `<option value="${esc(c.ins)}"${String(c.ins) === String(selected) ? ' selected' : ''}>${esc(contractLabel(c))} · ${c.kind === 'put' ? 'فروش' : 'خرید'} · اعمال ${esc(faDigits(fmt.int(c.strike)))}</option>`).join('')}</optgroup>`;
    }).join('');
  return `<option value="index"${selected === 'index' ? ' selected' : ''}>${esc(`شاخص نوسان ضمنی پایه${uaName ? ` · ${uaName}` : ''}`)}</option>${groups}`;
}

/**
 * نمودار مادر. `rows`: خروجی `contractDailySeries` یا `underlyingDailySeries`.
 * `show`: کدام سری‌ها روشن‌اند (راهنمای نمودار هم همین را خاموش و روشن می‌کند).
 */
export function masterOption(rows = [], { show = {}, title = '', index = false } = {}, tokens) {
  if (!rows.some((row) => isNum(row.ivPct))) return null;
  const dates = rows.map((row) => row.date);
  const ivs = rows.map((row) => row.ivPct);
  const ma = movingAverage(ivs, 5);
  const series = [
    { id: 'iv', name: 'نوسان ضمنی', type: 'line', yAxisIndex: 0, data: ivs.map(nul), symbolSize: 6, connectNulls: false, z: 5,
      lineStyle: { width: 3, color: tokens.accent }, itemStyle: { color: tokens.accent } },
    { id: 'ma', name: 'میانگین ۵ روزهٔ نوسان', type: 'line', yAxisIndex: 0, data: ma.map(nul), symbol: 'none', lineStyle: { width: 1.5, type: 'dashed', color: tokens.accent2 || tokens.series[1] }, itemStyle: { color: tokens.accent2 || tokens.series[1] } },
    ...(index ? [{ id: 'hv', name: 'نوسان تاریخی (HV)', type: 'line', yAxisIndex: 0, data: rows.map((row) => nul(row.hvPct)), symbol: 'none', lineStyle: { width: 1.5, color: tokens.muted }, itemStyle: { color: tokens.muted } }] : []),
    { id: 'price', name: 'قیمت', type: 'line', yAxisIndex: 1, data: rows.map((row) => nul(row.price)), symbolSize: 4, lineStyle: { width: 1.5, color: tokens.series[2] }, itemStyle: { color: tokens.series[2] } },
    { id: 'volume', name: 'حجم', type: 'bar', yAxisIndex: 2, data: rows.map((row) => (isNum(row.volume) ? row.volume : null)), barMaxWidth: 28, itemStyle: { color: tokens.accent, opacity: 0.22 }, z: 1 },
    { id: 'oi', name: 'موقعیت باز', type: 'line', yAxisIndex: 3, data: rows.map((row) => (isNum(row.oi) ? row.oi : null)), symbolSize: 4, connectNulls: false, lineStyle: { width: 1.5, color: tokens.warn }, itemStyle: { color: tokens.warn } },
  ];
  const liveAt = rows.findIndex((row) => row.live);
  if (liveAt >= 0) series[0].markLine = { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: tokens.muted }, label: { formatter: 'امروز (زنده)', color: tokens.muted }, data: [{ xAxis: liveAt }] };
  const selected = Object.fromEntries(series.map((s) => [s.name, show[s.id] !== false]));
  const maxVol = Math.max(0, ...rows.map((row) => (isNum(row.volume) ? row.volume : 0)));
  return {
    title: title ? { text: title, left: 'center', top: 0, textStyle: { color: tokens.ink, fontSize: 14 } } : undefined,
    legend: { top: title ? 24 : 0, textStyle: { color: tokens.muted }, selected },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'cross' },
      formatter: (params) => {
        const i = params[0]?.dataIndex ?? 0;
        const row = rows[i] || {};
        const lines = [
          ['نوسان ضمنی', isNum(row.ivPct) ? pct(row.ivPct) : `— ${esc(IV_DAILY_WHY[row.why] || IV_INDEX_WHY[row.why] || '')}`],
          ...(index ? [['نوسان تاریخی', pct(row.hvPct)], ['IVR · IVP', `${isNum(row.ivr) ? fmt.int(Math.round(row.ivr)) : '—'} · ${isNum(row.ivp) ? fmt.int(Math.round(row.ivp)) : '—'}`]] : []),
          ['قیمت', isNum(row.price) ? fmt.money(row.price) : '—'],
          ['حجم', isNum(row.volume) ? fmt.int(row.volume) : '—'],
          ['موقعیت باز', isNum(row.oi) ? fmt.int(row.oi) : '—'],
        ];
        return `<b>${dateLabel(row.date)}${row.live ? ' (زنده)' : ''}</b><br>${lines.map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join('<br>')}`;
      },
    },
    grid: { left: 56, right: 70, top: title ? 78 : 58, bottom: 64, containLabel: true },
    xAxis: { type: 'category', data: dates.map(dateLabel), boundaryGap: true, ...axisCommon(tokens), axisLabel: { color: tokens.muted, rotate: 45 } },
    yAxis: [
      { type: 'value', name: 'نوسان ضمنی (٪)', scale: true, nameTextStyle: { color: tokens.accent }, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: tick } },
      { type: 'value', name: 'قیمت', scale: true, position: 'right', nameTextStyle: { color: tokens.muted }, axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: tokens.muted, formatter: (v) => faDigits(fmt.int(v)) } },
      { type: 'value', show: false, min: 0, max: maxVol > 0 ? maxVol * 2.5 : 1 },
      { type: 'value', show: false, scale: true },
    ],
    dataZoom: zoom,
    series,
  };
}

/** نوسان ضمنی چند قرارداد یک سررسید، روی هم. `lines`: `[{ label, rows }]`؛ `indexRows` اختیاری. */
export function expiryOption(lines = [], { indexRows = null } = {}, tokens) {
  const dates = [...new Set([...lines.flatMap((l) => l.rows.map((r) => r.date)), ...(indexRows || []).map((r) => r.date)])].sort((a, b) => a - b);
  const valueOn = (rows) => { const m = new Map(rows.map((r) => [r.date, r.ivPct])); return dates.map((d) => nul(m.get(d))); };
  const series = lines.filter((l) => l.rows.some((r) => isNum(r.ivPct))).map((l, i) => ({
    name: l.label, type: 'line', data: valueOn(l.rows), symbolSize: 5, connectNulls: false,
    lineStyle: { width: 2, color: tokens.palette[i % tokens.palette.length] }, itemStyle: { color: tokens.palette[i % tokens.palette.length] },
  }));
  if (indexRows?.some((r) => isNum(r.ivPct))) {
    series.push({ name: 'شاخص پایه', type: 'line', data: valueOn(indexRows), symbol: 'none', lineStyle: { width: 3, type: 'dashed', color: tokens.ink }, itemStyle: { color: tokens.ink } });
  }
  if (!series.length) return null;
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted } },
    tooltip: { trigger: 'axis', valueFormatter: chartFormat.pct },
    grid: { left: 56, right: 24, top: 78, bottom: 64, containLabel: true },
    xAxis: { type: 'category', data: dates.map(dateLabel), ...axisCommon(tokens), axisLabel: { color: tokens.muted, rotate: 45 } },
    yAxis: { type: 'value', name: 'نوسان ضمنی (٪)', scale: true, nameTextStyle: { color: tokens.muted }, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: tick } },
    dataZoom: zoom,
    series,
  };
}

/**
 * نمودار بازه و تایم‌فریم: لحظه‌ها پشت‌سرهم (روز و ساعت)، مرز روزها با خط.
 * `points`: `[{ date, second, value, bid, ask, why }]`؛ لحظهٔ خالی خالی می‌ماند.
 */
export function rangeOption(points = [], { grain = 'm5', band = true, label = 'نوسان ضمنی' } = {}, tokens) {
  if (!points.some((pt) => isNum(pt.value))) return null;
  const sorted = [...points].sort((a, b) => a.date - b.date || a.second - b.second);
  const cats = sorted.map((pt) => (grain === 'day' ? dateLabel(pt.date) : `${dateLabel(pt.date)} ${momentLabel(pt.second)}`));
  const starts = sorted.map((pt, i) => (i > 0 && pt.date !== sorted[i - 1].date ? i : -1)).filter((i) => i > 0);
  const series = [{
    name: label, type: 'line', data: sorted.map((pt) => nul(pt.value)), symbolSize: grain === 'day' ? 6 : 3, connectNulls: false,
    lineStyle: { width: 2.2, color: tokens.accent }, itemStyle: { color: tokens.accent },
    markLine: grain === 'day' || !starts.length ? undefined : { silent: true, symbol: 'none', label: { show: false }, lineStyle: { type: 'dashed', color: tokens.line }, data: starts.map((i) => ({ xAxis: i })) },
  }];
  if (band && sorted.some((pt) => isNum(pt.bid) && isNum(pt.ask))) {
    series.push(
      { name: 'نوسان خرید', type: 'line', data: sorted.map((pt) => nul(pt.bid)), symbol: 'none', connectNulls: false, lineStyle: { width: 1, type: 'dotted', color: tokens.muted }, itemStyle: { color: tokens.muted } },
      { name: 'نوسان فروش', type: 'line', data: sorted.map((pt) => nul(pt.ask)), symbol: 'none', connectNulls: false, lineStyle: { width: 1, type: 'dotted', color: tokens.warn }, itemStyle: { color: tokens.warn } },
    );
  }
  return {
    legend: { top: 0, textStyle: { color: tokens.muted } },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const pt = sorted[params[0]?.dataIndex ?? 0] || {};
        const why = isNum(pt.value) ? '' : `<br>${esc(INTRADAY_WHY[pt.why] || IV_DAILY_WHY[pt.why] || pt.why || '')}`;
        return `<b>${esc(cats[params[0]?.dataIndex ?? 0])}</b><br>${params.map((p) => `${p.marker}${esc(p.seriesName)}: ${chartFormat.pct(p.value)}`).join('<br>')}${why}`;
      },
    },
    grid: { left: 56, right: 24, top: 64, bottom: 70, containLabel: true },
    xAxis: { type: 'category', data: cats, ...axisCommon(tokens), axisLabel: { color: tokens.muted, rotate: 45 } },
    yAxis: { type: 'value', name: 'نوسان ضمنی (٪)', scale: true, nameTextStyle: { color: tokens.muted }, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: tick } },
    dataZoom: zoom,
    series,
  };
}

/** یک خط خلاصه زیر نمودار مادر. */
export function masterSummary(rows = []) {
  const ok = rows.filter((row) => isNum(row.ivPct));
  if (!ok.length) return 'در این بازه هیچ روزی نوسان ضمنی نساخت.';
  const last = ok.at(-1), first = ok[0];
  const values = ok.map((row) => row.ivPct);
  const oiDays = rows.filter((row) => isNum(row.oi)).length;
  return [
    `آخرین: ${pct(last.ivPct)} (${dateLabel(last.date)}${last.live ? '، زنده' : ''})`,
    `تغییر در بازه: ${ltr(`${last.ivPct - first.ivPct >= 0 ? '+' : '−'}${fmt.pct(Math.abs(last.ivPct - first.ivPct))}`)} واحد`,
    `کمینه ${pct(Math.min(...values))} · بیشینه ${pct(Math.max(...values))}`,
    `${faDigits(ok.length)} از ${faDigits(rows.length)} روز نوسان دارد`,
    oiDays ? `موقعیت باز ${faDigits(oiDays)} روز (از ضبط تابلو)` : 'موقعیت باز تاریخی ندارد — از روز روشن‌شدن ضبط تابلو جمع می‌شود',
  ].join(' · ');
}

