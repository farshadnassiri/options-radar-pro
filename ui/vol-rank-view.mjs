// تب «رتبه و صدک تلاطم» در رصد لحظه‌ای.
//
// نماد پایه همان است که روی «نقشه و زنجیره» انتخاب شده (یک منبع انتخاب).
// تاریخچه از `/api/vol/history` (قیمت روزانهٔ قراردادها، سررسیدشده‌ها هم) و
// سری روزانهٔ خودِ پایه می‌آید؛ «امروز» فقط وقتی از تابلوی زنده ساخته می‌شود
// که جلسهٔ امروز واقعاً باز است (`session.current`).
//
// همهٔ عددها از `core/vol-rank.mjs` است؛ اینجا فقط رشتهٔ HTML و نمودار.
// سازنده‌های HTML و گزینه‌های نمودار خالص‌اند تا آزمون بی DOM بسنجدشان.
// رنگ فقط از توکن؛ هر پلهٔ «ارزان/گران» متن خودش را هم دارد.

import { fmt, faDigits, ltr } from './fmt.mjs';
import { mountChart, chartFormat } from './chart-host.mjs';
import { makeTable } from './table.mjs';
import { fetchDailies } from './daily-intake.mjs';
import { saveVolSummary, volSummaryOf } from './vol-rank-store.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { tehranDateNumber } from '../core/tehran-day.mjs';
import { baseAdjustments, strikeAdjustPlan, strikeResolver } from '../core/strike-adjust.mjs';
import { indexGaps } from '../core/iv-chart.mjs';
import { gapsText, adjustText } from './iv-charts-options.mjs';
import {
  VOL_LOOKBACKS, IV_METHODS, IV_PRICE_BASES, VOL_DEFAULTS, VOL_REGIMES, IV_INDEX_WHY, IV_INDEX_FLAGS,
  buildVolHistory, panelObservations, liveObservations, volRangeFor, volCorrelation, volParams, quantile,
} from '../core/vol-rank.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const isNum = (value) => Number.isFinite(value);
const dateLabel = (value) => faDigits(historyDateLabel(value));
const pctText = (value) => (isNum(value) ? `${fmt.pct(value)}٪` : '—');
const ppText = (value) => (isNum(value) ? `${value > 0 ? '+' : ''}${fmt.pct(value)} واحد` : '—');
const rankText = (value) => (isNum(value) ? fmt.int(Math.round(value)) : '—');
const STORE = 'options-radar:vol-rank';

export const VR_CHARTS = [
  ['ivhv', 'IV و HV در زمان', 'شاخص تلاطم ضمنی کنار تلاطم تاریخی پنجره‌های مختلف و پارکینسون؛ روی هر سری در راهنما کلیک کن تا خاموش/روشن شود.'],
  ['rank', 'مسیر IVR و IVP', 'رتبه و صدک هر روز نسبت به بازهٔ پیش از خودش؛ نوارهای ۲۰ و ۸۰ مرز «ارزان» و «گران»اند.'],
  ['cone', 'مخروط تلاطم', 'برای هر پنجره، دامنهٔ تلاطم تاریخیِ کل سابقهٔ نماد و جای امروز؛ نقطهٔ IV روی پنجرهٔ هم‌افق نشسته.'],
  ['term', 'ساختار زمانی امروز', 'تلاطم در پولِ هر سررسید در آخرین روزِ دارای شاخص؛ شیب مثبت یعنی بازار برای آیندهٔ دورتر تلاطم بیشتری قیمت داده.'],
  ['dist', 'توزیع IV در بازه', 'هیستوگرام شاخص در بازهٔ رتبه؛ خط عمودی جای امروز است.'],
  ['scatter', 'IV در برابر HV', 'هر نقطه یک روز؛ بالای قطر یعنی بازار تلاطمی بیش از تلاطم تحقق‌یافتهٔ اخیر قیمت داده.'],
  ['fwd', 'IV در برابر تحقق‌یافتهٔ بعدی (پس‌نگری)', 'پس‌نگری: IV هر روز در برابر تلاطمی که در ۲۰ روز بعد واقعاً رخ داد — در همان روز معلوم نبود. بالای قطر یعنی پریمیوم گران درآمد.'],
  ['spread', 'فاصلهٔ IV و HV در زمان', 'IV منهای HV هم‌افق؛ مثبت یعنی صرفِ ریسک تلاطم.'],
];

// عددِ منفی در متنِ راست‌به‌چپ علامتش را به سمت دیگر می‌برد؛ جداسازِ جهت
// (`ltr`) آن را سرِ جایش نگه می‌دارد — در محور و برچسبِ نمودار هم.
const tick = (value) => ltr(Number(value) < 0 ? `−${faDigits(String(Math.abs(value)))}` : faDigits(String(value)));
const corrText = (value) => (isNum(value) ? ltr(fmt.pct(value)) : '—');

// ═══════════════════ سازنده‌های خالص ═══════════════════

/** کنترل‌ها؛ مقدار انتخابی از `opts`. */
export function volControlsHtml(opts = {}) {
  const sel = (key, label, items) => `<label>${label}<select data-vr-opt="${key}">${items
    .map(([value, text]) => `<option value="${esc(value)}"${String(value) === String(opts[key]) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  return `<div class="vr-controls">
    ${sel('lookback', 'بازهٔ رتبه', VOL_LOOKBACKS.map(([d, t]) => [d, `${t} · ${faDigits(d)} روز معاملاتی`]))}
    ${sel('method', 'روش شاخص', IV_METHODS)}
    ${sel('targetDays', 'افق شاخص', [[30, '۳۰ روز'], [60, '۶۰ روز'], [90, '۹۰ روز']])}
    ${sel('priceBasis', 'قیمت قرارداد', IV_PRICE_BASES)}
    ${sel('hvWindow', 'پنجرهٔ HV مقایسه', [[10, '۱۰ روز'], [20, '۲۰ روز'], [30, '۳۰ روز'], [60, '۶۰ روز']])}
  </div>`;
}

/** کارت وضعیت: پلهٔ صدک، متن خوانش، و هشدارهای داده. */
export function volRegimeHtml(history) {
  const regime = history?.regime;
  if (!regime) return '';
  const cur = history.current;
  const flags = (cur?.flags || []).map((flag) => IV_INDEX_FLAGS[flag]).filter(Boolean);
  const notes = [
    regime.divergence,
    history.rank && !history.rank.full && isNum(history.rank.ivr)
      ? `سابقهٔ موجود ${faDigits(history.rank.span)} روز معاملاتی است، کوتاه‌تر از بازهٔ خواسته (${faDigits(history.rank.lookback)}).`
      : '',
    history.rank?.why || '',
    ...flags,
  ].filter(Boolean);
  const steps = VOL_REGIMES.map((row) => `<li data-tone="${row.tone}"${row.id === regime.id ? ' aria-current="true"' : ''}>${esc(row.label)}</li>`).join('');
  return `<article class="vr-regime" data-tone="${regime.tone}">
    <div><small>وضعیت تلاطم ضمنی (از صدک)</small><strong>${esc(regime.label)}</strong></div>
    <p>${esc(regime.text)}</p>
    <ol class="vr-steps" aria-label="پله‌های وضعیت">${steps}</ol>
    ${notes.length ? `<ul class="vr-notes">${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

/** کاشی‌های عددی. */
export function volKpiHtml(history) {
  if (!history) return '';
  const cur = history.current;
  const p = history.params;
  const hvNow = history.rows.at(-1)?.hv?.[p.hvWindow];
  const tiles = [
    ['IV امروز', pctText(cur?.ivPct), cur ? `${cur.live ? 'تابلوی زنده' : 'پایانی'} · ${dateLabel(cur.date)}` : 'شاخص ساخته نشد'],
    [`HV ${faDigits(p.hvWindow)} روزه`, pctText(hvNow), 'پایانی به پایانی، سالانه'],
    ['پارکینسون', pctText(history.parkinsonNow), 'از کمینه و بیشینهٔ روز'],
    ['IV − HV', ppText(history.spreadNow), isNum(history.ratioNow) ? `نسبت ${fmt.num(history.ratioNow)} برابر` : '—'],
    ['کمینه / میانه / بیشینهٔ IV', `${pctText(history.stats.min)} · ${pctText(history.stats.median)} · ${pctText(history.stats.max)}`, `در بازهٔ دریافت‌شده`],
    ['پوشش', pctText(history.stats.coverage), `${faDigits(history.stats.ivDays)} روز شاخص از ${faDigits(history.stats.days)} روز معاملاتی`],
    ['صرف تلاطم در گذشته (پس‌نگری)', isNum(history.stats.fwdRichPct) ? `${fmt.int(Math.round(history.stats.fwdRichPct))}٪ روزها` : '—',
      isNum(history.stats.fwdEdgeMean) ? `IV به‌طور میانگین ${ppText(history.stats.fwdEdgeMean)} نسبت به تحقق‌یافتهٔ بعدی` : 'آیندهٔ کافی هنوز نیامده'],
  ];
  return tiles.map(([label, value, note]) => `<article class="lmm-stat"><small>${esc(label)}</small><strong>${value}</strong><span>${esc(note)}</span></article>`).join('');
}

/**
 * مقایسهٔ تلاطم امروز: هر سنجه، عددش، جایش در سابقهٔ خودش، و فاصله‌اش از IV.
 *
 * ردیف‌ها داده‌اند نه HTML تا آزمون بسنجدشان؛ `volCompareHtml` رشته می‌سازد.
 */
export function volCompareRows(history) {
  if (!history) return [];
  const last = history.rows.at(-1);
  const iv = history.current?.ivPct;
  const rows = [];
  const add = (label, value, pctile, note = '') => rows.push({
    label, value, percentile: pctile, vsIv: isNum(value) && isNum(iv) ? iv - value : NaN, note,
  });
  add('IV شاخص (امروز)', iv, history.rank?.ivp, `IVR ${rankText(history.rank?.ivr)}`);
  for (const cone of history.cone) {
    const hv = last?.hv?.[cone.window] ?? cone.current;
    add(`HV ${faDigits(cone.window)} روزه`, hv, cone.currentPct, `میانهٔ سابقه ${pctText(cone.p50)}`);
  }
  add('پارکینسون', history.parkinsonNow, NaN, `پنجرهٔ ${faDigits(history.params.hvWindow)} روزه`);
  add('میانهٔ IV در بازه', history.stats.median, 50, '');
  add('کمینهٔ IV در بازه', history.stats.min, 0, '');
  add('بیشینهٔ IV در بازه', history.stats.max, 100, '');
  return rows;
}

export function volCompareHtml(history) {
  const rows = volCompareRows(history);
  if (!rows.length) return '';
  const bar = (pct) => (isNum(pct)
    ? `<span class="cc-bar" role="img" aria-label="${esc(`صدک ${fmt.int(Math.round(pct))}`)}"><i style="--pct:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i><b></b></span>`
    : '<span class="cc-bar is-empty" aria-hidden="true"></span>');
  return `<div class="history-table-wrap"><table class="history-table vr-compare"><thead><tr><th>سنجه</th><th>مقدار</th><th>جای امروز در سابقهٔ خودش</th><th>صدک</th><th>IV منهای این</th><th>توضیح</th></tr></thead><tbody>${rows
    .map((row) => `<tr><th scope="row">${esc(row.label)}</th><td class="n">${pctText(row.value)}</td><td>${bar(row.percentile)}</td><td class="n">${rankText(row.percentile)}</td><td class="n ${row.vsIv > 0 ? 'gain' : row.vsIv < 0 ? 'loss' : ''}">${ppText(row.vsIv)}</td><td>${esc(row.note)}</td></tr>`).join('')}</tbody></table></div>`;
}

/** جملهٔ وضعیت داده. */
export function volStatusText({ api, history, baseRows = 0, uaName = '' } = {}) {
  if (!api) return '';
  const parts = [`${uaName || 'نماد'}: ${faDigits(api.have)} از ${faDigits(api.days)} روز معاملاتیِ بازه پروندهٔ قیمت قرارداد دارد`];
  if (api.build?.running || api.build?.queued) {
    parts.push(`ساخت پرونده‌ها ادامه دارد (${faDigits(api.build.done)} از ${faDigits(api.build.total)}${api.build.failed ? `، ${faDigits(api.build.failed)} ناموفق` : ''})`);
  } else if (api.missing) {
    parts.push(`${faDigits(api.missing)} روز هنوز پرونده ندارد${api.build?.resting ? ` (${faDigits(api.build.resting)} روز پاسخ خالی داد — تعطیل رسمی یا سهمیهٔ بالادست؛ چند ساعت بعد دوباره پرسیده می‌شود)` : ''}${api.build?.lastError ? ` — آخرین خطا: ${faDigits(api.build.lastError)}` : ''}`);
  }
  if (api.roster?.build?.running) parts.push('دفتر قراردادهای سررسیدشده هم در حال تکمیل است');
  parts.push(`${faDigits(api.contracts?.length || 0)} قرارداد این پایه در بازه`);
  parts.push(`${faDigits(baseRows)} روز سابقهٔ قیمت پایه برای تلاطم تاریخی`);
  if (history?.stats?.adjusted) parts.push(`${faDigits(history.stats.adjusted)} روز تعدیل (سود نقدی یا افزایش سرمایه) در تلاطم تاریخی از قیمت مرجع سنجیده شد`);
  if (history?.stats?.jumps) parts.push(`${faDigits(history.stats.jumps)} جهش قیمتیِ تعدیلی از تلاطم تاریخی کنار رفت`);
  return parts.join(' · ');
}

// ═══════════════════ نمودارها (خالص؛ توکن ورودی است) ═══════════════════

const axisCommon = (tokens) => ({
  axisLabel: { color: tokens.muted },
  axisLine: { lineStyle: { color: tokens.line } },
  splitLine: { lineStyle: { color: tokens.lineSoft } },
});
const dateAxis = (tokens, dates) => ({ type: 'category', data: dates.map(dateLabel), ...axisCommon(tokens), boundaryGap: false });
const pctAxis = (tokens, name = 'درصد سالانه') => ({ type: 'value', name, nameTextStyle: { color: tokens.muted }, scale: true, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: tick } });
const nul = (value) => (isNum(value) ? Math.round(value * 100) / 100 : null);
/** ردیف‌های بازهٔ رتبه؛ سری پایه ممکن است چند سال عقب‌تر برود (برای مخروط). */
export const rangeRows = (history) => (history?.rows || []).filter((row) => row.date >= (history?.rangeFrom || 0));
const zoom = [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6 }];

/** عقربه با پنج پلهٔ رنگی. `bands`: [[سهم, رنگ]]. */
export function gaugeOption({ value, title, max = 100, bands, tokens, digits = 0 }) {
  const v = isNum(value) ? value : null;
  return {
    tooltip: { formatter: () => `<b>${esc(title)}</b>: ${v === null ? '—' : faDigits(v.toFixed(digits))}` },
    // نیم‌دایره: عدد زیر خطِ پایه می‌نشیند تا عقربه رویش نیفتد؛ عنوان در
    // زیرنویسِ کارت است، نه داخل نمودار.
    series: [{
      type: 'gauge', min: 0, max, startAngle: 180, endAngle: 0, radius: '118%', center: ['50%', '78%'],
      splitNumber: 4,
      axisLine: { lineStyle: { width: 14, color: bands } },
      progress: { show: false },
      pointer: { show: v !== null, length: '62%', width: 4, offsetCenter: [0, 0], itemStyle: { color: tokens.ink } },
      anchor: { show: v !== null, size: 9, itemStyle: { color: tokens.ink, borderColor: tokens.panel, borderWidth: 2 } },
      axisTick: { show: false },
      splitLine: { length: 14, distance: -14, lineStyle: { color: tokens.panel, width: 2 } },
      axisLabel: { color: tokens.muted, distance: 6, fontSize: 9, formatter: (x) => faDigits(String(Math.round(x * 100) / 100)) },
      title: { show: false },
      detail: { offsetCenter: [0, '16%'], color: tokens.ink, fontSize: 20, fontWeight: 700, formatter: () => (v === null ? '—' : faDigits(v.toFixed(digits))) },
      data: [{ value: v ?? 0, name: title }],
    }],
  };
}

/** پنج پلهٔ صدک: ارزان‌ها سرد، میانه خنثی، گران‌ها گرم. */
export const rankBands = (tokens) => [
  [0.2, tokens.accent], [0.4, tokens.accentSoft], [0.6, tokens.panel2], [0.8, tokens.warnSoft], [1, tokens.warn],
];

export function ivHvLineOption(history, tokens) {
  const rows = rangeRows(history);
  if (rows.filter((row) => isNum(row.ivPct)).length < 2 && rows.filter((row) => isNum(row.hvMatch)).length < 2) return null;
  const p = history.params;
  const windows = [...new Set([...p.hvWindows, p.hvWindow])].sort((a, b) => a - b);
  const series = [
    { name: 'IV شاخص', type: 'line', data: rows.map((row) => nul(row.ivPct)), connectNulls: false, symbol: 'none', lineStyle: { width: 2.5, color: tokens.accent }, itemStyle: { color: tokens.accent } },
    ...windows.map((w, i) => ({
      name: `HV ${faDigits(w)}`, type: 'line', data: rows.map((row) => nul(row.hv?.[w])), symbol: 'none',
      lineStyle: { width: w === p.hvWindow ? 2 : 1.2, color: tokens.series[(i + 1) % 6], type: w === p.hvWindow ? 'solid' : 'dashed' },
      itemStyle: { color: tokens.series[(i + 1) % 6] },
    })),
    { name: 'پارکینسون', type: 'line', data: rows.map((row) => nul(row.parkinson)), symbol: 'none', lineStyle: { width: 1, color: tokens.muted, type: 'dotted' }, itemStyle: { color: tokens.muted } },
  ];
  const liveIndex = rows.findIndex((row) => row.live && isNum(row.ivPct));
  if (liveIndex >= 0) {
    series[0].markPoint = { symbol: 'circle', symbolSize: 10, itemStyle: { color: tokens.accent2 }, label: { show: false }, data: [{ coord: [liveIndex, nul(rows[liveIndex].ivPct)], name: 'زنده' }] };
  }
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, selected: Object.fromEntries(windows.filter((w) => w !== p.hvWindow).map((w) => [`HV ${faDigits(w)}`, w === 60])) },
    tooltip: { trigger: 'axis', valueFormatter: chartFormat.pct },
    grid: { left: 56, right: 24, top: 44, bottom: 64, containLabel: true },
    xAxis: dateAxis(tokens, rows.map((row) => row.date)),
    yAxis: pctAxis(tokens),
    dataZoom: zoom,
    series,
  };
}

export function rankLineOption(history, tokens) {
  const rows = rangeRows(history);
  if (rows.filter((row) => isNum(row.ivr)).length < 2) return null;
  return {
    legend: { top: 0, textStyle: { color: tokens.muted } },
    tooltip: { trigger: 'axis', valueFormatter: (v) => (isNum(v) ? faDigits(String(Math.round(v))) : '—') },
    grid: { left: 48, right: 24, top: 44, bottom: 64, containLabel: true },
    xAxis: dateAxis(tokens, rows.map((row) => row.date)),
    yAxis: { type: 'value', min: 0, max: 100, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: (v) => faDigits(String(v)) } },
    dataZoom: zoom,
    series: [
      {
        name: 'IVR', type: 'line', symbol: 'none', data: rows.map((row) => nul(row.ivr)), lineStyle: { width: 2, color: tokens.accent }, itemStyle: { color: tokens.accent },
        markArea: { silent: true, data: [
          [{ yAxis: 0, itemStyle: { color: tokens.accentSoft, opacity: 0.35 } }, { yAxis: 20 }],
          [{ yAxis: 80, itemStyle: { color: tokens.warnSoft, opacity: 0.45 } }, { yAxis: 100 }],
        ] },
      },
      { name: 'IVP', type: 'line', symbol: 'none', data: rows.map((row) => nul(row.ivp)), lineStyle: { width: 2, color: tokens.series[2] }, itemStyle: { color: tokens.series[2] } },
      { name: 'HV صدک', type: 'line', symbol: 'none', data: rows.map((row) => nul(row.hvp)), lineStyle: { width: 1, type: 'dashed', color: tokens.muted }, itemStyle: { color: tokens.muted } },
    ],
  };
}

export function coneOption(history, tokens) {
  const cone = (history?.cone || []).filter((row) => row.samples > 0);
  if (!cone.length) return null;
  const x = cone.map((row) => `${faDigits(row.window)} روز`);
  // نوار = دو سریِ پشته‌ای: کفِ نامرئی و ضخامتِ رنگی. رنگِ راهنما از
  // `itemStyle` می‌آید، پس هر دو همان رنگِ نوار را می‌گیرند.
  const band = (lo, hi, name, color, opacity) => [
    { name, type: 'line', stack: name, data: cone.map((row) => nul(row[lo])), lineStyle: { opacity: 0 }, itemStyle: { color }, symbol: 'none', tooltip: { show: false } },
    { name, type: 'line', stack: name, data: cone.map((row) => (isNum(row[hi]) && isNum(row[lo]) ? nul(row[hi] - row[lo]) : null)), lineStyle: { opacity: 0 }, itemStyle: { color }, symbol: 'none', areaStyle: { color, opacity }, tooltip: { show: false } },
  ];
  const match = history.params.hvWindow;
  const ivAt = cone.findIndex((row) => row.window === match);
  const iv = history.current?.ivPct;
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, data: ['کمینه تا بیشینه', 'صدک ۱۰ تا ۹۰', 'چارک‌ها', 'میانه', 'امروز', 'IV امروز'] },
    tooltip: {
      trigger: 'axis',
      formatter: (items) => {
        const row = cone[items[0]?.dataIndex];
        if (!row) return '';
        return `<b>پنجرهٔ ${faDigits(row.window)} روزه</b><br>کمینه ${pctText(row.min)} · صدک ۱۰ ${pctText(row.p10)}<br>چارک اول ${pctText(row.p25)} · میانه ${pctText(row.p50)} · چارک سوم ${pctText(row.p75)}<br>صدک ۹۰ ${pctText(row.p90)} · بیشینه ${pctText(row.max)}<br><b>امروز ${pctText(row.current)}</b> (صدک ${rankText(row.currentPct)})`;
      },
    },
    grid: { left: 56, right: 24, top: 44, bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: x, ...axisCommon(tokens) },
    yAxis: pctAxis(tokens),
    series: [
      ...band('min', 'max', 'کمینه تا بیشینه', tokens.muted, 0.18),
      ...band('p10', 'p90', 'صدک ۱۰ تا ۹۰', tokens.accent, 0.22),
      ...band('p25', 'p75', 'چارک‌ها', tokens.accent, 0.4),
      { name: 'میانه', type: 'line', data: cone.map((row) => nul(row.p50)), lineStyle: { color: tokens.muted, type: 'dashed' }, itemStyle: { color: tokens.muted } },
      { name: 'امروز', type: 'line', data: cone.map((row) => nul(row.current)), lineStyle: { color: tokens.series[1], width: 2 }, itemStyle: { color: tokens.series[1] }, symbolSize: 7 },
      { name: 'IV امروز', type: 'scatter', symbolSize: 14, itemStyle: { color: tokens.accent }, data: ivAt >= 0 && isNum(iv) ? [[ivAt, nul(iv)]] : [] },
    ],
  };
}

export function termOption(history, tokens) {
  const term = (history?.term || []).filter((row) => isNum(row.ivPct));
  if (!term.length) return null;
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (items) => {
        const row = term[items[0]?.dataIndex];
        return row ? `<b>سررسید ${dateLabel(row.expiry)}</b><br>${faDigits(row.dte)} روز · IV در پول ${pctText(row.ivPct)}<br>${faDigits(row.used)} قرارداد${row.oneSided ? ' · یک‌طرفه' : ''}` : '';
      },
    },
    grid: { left: 56, right: 24, top: 30, bottom: 40, containLabel: true },
    xAxis: { type: 'category', name: 'روز تا سررسید', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: tokens.muted }, data: term.map((row) => faDigits(row.dte)), ...axisCommon(tokens) },
    yAxis: pctAxis(tokens),
    series: [{
      type: 'line', data: term.map((row) => nul(row.ivPct)), symbolSize: 9, lineStyle: { width: 2, color: tokens.accent }, itemStyle: { color: tokens.accent },
      label: { show: true, color: tokens.muted, formatter: (p) => faDigits(String(p.value)) },
    }],
  };
}

export function distOption(history, tokens) {
  const values = rangeRows(history).map((row) => row.ivPct).filter(isNum);
  if (values.length < 5) return null;
  const lo = Math.floor(Math.min(...values)), hi = Math.ceil(Math.max(...values));
  const bins = Math.min(30, Math.max(8, Math.round(Math.sqrt(values.length) * 1.5)));
  const width = Math.max(0.5, (hi - lo) / bins);
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / width))] += 1;
  const labels = counts.map((_, i) => faDigits((lo + i * width).toFixed(1)));
  const cur = history.current?.ivPct;
  const curBin = isNum(cur) ? Math.min(bins - 1, Math.max(0, Math.floor((cur - lo) / width))) : -1;
  const median = quantile(values, 0.5);
  const medBin = Math.min(bins - 1, Math.max(0, Math.floor((median - lo) / width)));
  return {
    tooltip: { trigger: 'axis', formatter: (items) => `از ${items[0].name}٪ · ${faDigits(items[0].value)} روز` },
    grid: { left: 48, right: 24, top: 30, bottom: 40, containLabel: true },
    xAxis: { type: 'category', name: 'IV ٪', nameTextStyle: { color: tokens.muted }, data: labels, ...axisCommon(tokens) },
    yAxis: { type: 'value', name: 'روز', nameTextStyle: { color: tokens.muted }, minInterval: 1, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: (v) => faDigits(String(v)) } },
    series: [{
      type: 'bar', data: counts.map((count, i) => ({ value: count, itemStyle: { color: i === curBin ? tokens.accent : tokens.accentSoft } })), barCategoryGap: '8%',
      markLine: { symbol: 'none', label: { color: tokens.ink, formatter: (p) => p.name }, lineStyle: { color: tokens.muted, type: 'dashed' }, data: [
        ...(curBin >= 0 ? [{ xAxis: curBin, name: `امروز ${pctText(cur)}`, lineStyle: { color: tokens.accent, type: 'solid', width: 2 } }] : []),
        { xAxis: medBin, name: `میانه ${pctText(median)}` },
      ] },
    }],
  };
}

function diagonalScatter(points, tokens, { xName, yName, tip }) {
  if (points.length < 5) return null;
  const all = points.flatMap((pt) => [pt[0], pt[1]]);
  const lo = Math.floor(Math.min(...all) * 0.9), hi = Math.ceil(Math.max(...all) * 1.1);
  return {
    tooltip: { formatter: (p) => tip(points[p.dataIndex]) },
    grid: { left: 56, right: 72, top: 30, bottom: 48, containLabel: true },
    xAxis: { type: 'value', name: xName, nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: tokens.muted }, min: lo, max: hi, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: (v) => faDigits(String(v)) } },
    yAxis: { type: 'value', name: yName, nameTextStyle: { color: tokens.muted }, min: lo, max: hi, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: (v) => faDigits(String(v)) } },
    visualMap: { show: true, dimension: 2, min: 0, max: Math.max(1, points.length - 1), right: 0, top: 'middle', itemHeight: 120, text: ['تازه', 'کهنه'], textStyle: { color: tokens.muted }, inRange: { color: [tokens.panel2, tokens.accent] }, calculable: false },
    series: [
      { type: 'scatter', symbolSize: 7, data: points.map((pt, i) => [pt[0], pt[1], i]) },
      { type: 'line', silent: true, symbol: 'none', lineStyle: { color: tokens.muted, type: 'dashed' }, data: [[lo, lo], [hi, hi]], tooltip: { show: false } },
    ],
  };
}

export function scatterIvHvOption(history, tokens) {
  const w = history?.params?.hvWindow;
  const points = rangeRows(history).filter((row) => isNum(row.ivPct) && isNum(row.hvMatch)).map((row) => [nul(row.hvMatch), nul(row.ivPct), row.date]);
  return diagonalScatter(points, tokens, {
    xName: `HV ${faDigits(w)} روزه ٪`, yName: 'IV ٪',
    tip: (pt) => `<b>${dateLabel(pt[2])}</b><br>IV ${pctText(pt[1])} · HV ${pctText(pt[0])}<br>فاصله ${ppText(pt[1] - pt[0])}`,
  });
}

export function fwdScatterOption(history, tokens) {
  const points = rangeRows(history).filter((row) => isNum(row.ivPct) && isNum(row.fwdRv)).map((row) => [nul(row.fwdRv), nul(row.ivPct), row.date]);
  return diagonalScatter(points, tokens, {
    xName: 'تلاطم تحقق‌یافتهٔ بعدی ٪', yName: 'IV همان روز ٪',
    tip: (pt) => `<b>${dateLabel(pt[2])}</b><br>IV ${pctText(pt[1])} · بعداً رخ داد ${pctText(pt[0])}<br>${pt[1] > pt[0] ? 'پریمیوم گران درآمد' : 'پریمیوم ارزان درآمد'} (${ppText(pt[1] - pt[0])})`,
  });
}

export function spreadOption(history, tokens) {
  const rows = rangeRows(history);
  if (rows.filter((row) => isNum(row.spread)).length < 2) return null;
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => ppText(v) },
    grid: { left: 56, right: 24, top: 30, bottom: 64, containLabel: true },
    xAxis: { ...dateAxis(tokens, rows.map((row) => row.date)), boundaryGap: true },
    yAxis: pctAxis(tokens, 'واحد درصد'),
    dataZoom: zoom,
    series: [{
      type: 'bar', name: 'IV − HV',
      data: rows.map((row) => (isNum(row.spread) ? { value: nul(row.spread), itemStyle: { color: row.spread >= 0 ? tokens.warn : tokens.accent } } : null)),
    }],
  };
}

/** نقشهٔ حرارتی همبستگی. */
export function correlationOption(corr, tokens) {
  if (!corr?.keys?.length) return null;
  const data = [];
  corr.matrix.forEach((row, i) => row.forEach((cell, j) => data.push([j, i, isNum(cell.r) ? Math.round(cell.r * 100) / 100 : null, cell.n])));
  const labels = corr.labels.map(faDigits);
  return {
    tooltip: { formatter: (p) => `<b>${labels[p.data[1]]}</b> با <b>${labels[p.data[0]]}</b><br>همبستگی ${corrText(p.data[2] ?? NaN)} · ${faDigits(p.data[3])} روز` },
    grid: { left: 120, right: 24, top: 10, bottom: 110, containLabel: false },
    xAxis: { type: 'category', data: labels, axisLabel: { color: tokens.muted, rotate: 40, fontSize: 10 }, splitArea: { show: false } },
    yAxis: { type: 'category', data: labels, axisLabel: { color: tokens.muted, fontSize: 10 } },
    // `dimension: 2` صریح است: پیش‌فرضِ ECharts آخرین ستون داده است — اینجا
    // شمار روز — و بی این، همهٔ خانه‌ها یک رنگ می‌شدند.
    visualMap: { dimension: 2, min: -1, max: 1, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, textStyle: { color: tokens.muted }, inRange: { color: [tokens.accent, tokens.panel2, tokens.warn] } },
    series: [{
      type: 'heatmap', data,
      label: { show: true, color: tokens.ink, fontSize: 10, formatter: (p) => corrText(p.data[2] ?? NaN) },
      itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
    }],
  };
}

const CHART_BUILDERS = {
  ivhv: ivHvLineOption, rank: rankLineOption, cone: coneOption, term: termOption,
  dist: distOption, scatter: scatterIvHvOption, fwd: fwdScatterOption, spread: spreadOption,
};

// ═══════════════════ جدول روزانه ═══════════════════

export const VR_COLUMNS = [
  { key: 'dateText', label: 'تاریخ', fmt: 'text' },
  { key: 'spot', label: 'قیمت پایانی پایه', fmt: 'money' },
  { key: 'ivPct', label: 'IV شاخص ٪', fmt: 'pct', heat: 'prob' },
  { key: 'ivr', label: 'IVR', fmt: 'num', heat: 'prob' },
  { key: 'ivp', label: 'IVP', fmt: 'num', heat: 'prob' },
  { key: 'hv10', label: 'HV ۱۰ ٪', fmt: 'pct' },
  { key: 'hv20', label: 'HV ۲۰ ٪', fmt: 'pct' },
  { key: 'hv30', label: 'HV ۳۰ ٪', fmt: 'pct' },
  { key: 'hv60', label: 'HV ۶۰ ٪', fmt: 'pct' },
  { key: 'parkinson', label: 'پارکینسون ٪', fmt: 'pct' },
  { key: 'spread', label: 'IV − HV (واحد)', fmt: 'pct', heat: 'loss' },
  { key: 'ratio', label: 'IV ÷ HV', fmt: 'num' },
  { key: 'hvp', label: 'صدک HV', fmt: 'num' },
  { key: 'fwdRv', label: 'پس‌نگری: تحقق‌یافتهٔ بعدی ٪', fmt: 'pct' },
  { key: 'fwdEdge', label: 'پس‌نگری: IV − تحقق‌یافته', fmt: 'pct' },
  { key: 'returnPct', label: 'بازده روز پایه ٪', fmt: 'pct', heat: 'gain' },
  { key: 'expiriesText', label: 'سررسیدهای شاخص', fmt: 'text' },
  { key: 'used', label: 'قرارداد به‌کاررفته', fmt: 'int' },
  { key: 'whyText', label: 'وضعیت', fmt: 'text' },
];

export function volTableRows(history) {
  return rangeRows(history)
    .map((row) => ({
      id: String(row.date),
      dateText: `${dateLabel(row.date)}${row.live ? ' (زنده)' : ''}`,
      spot: row.spot, ivPct: row.ivPct, ivr: row.ivr, ivp: row.ivp,
      hv10: row.hv?.[10], hv20: row.hv?.[20], hv30: row.hv?.[30], hv60: row.hv?.[60],
      parkinson: row.parkinson, spread: row.spread, ratio: row.ratio, hvp: row.hvp,
      fwdRv: row.fwdRv, fwdEdge: row.fwdEdge, returnPct: row.returnPct,
      expiriesText: row.expiries.map(dateLabel).join(' و ') || '—',
      used: row.used || NaN,
      whyText: isNum(row.ivPct)
        ? (row.flags.map((flag) => IV_INDEX_FLAGS[flag]).filter(Boolean).join('؛ ') || 'شاخص ساخته شد')
        : (IV_INDEX_WHY[row.why] || '—'),
    }))
    .reverse();
}

// ═══════════════════ سوارکردن ═══════════════════

function loadOpts() {
  const base = {
    lookback: VOL_DEFAULTS.lookback, method: VOL_DEFAULTS.method, targetDays: VOL_DEFAULTS.targetDays,
    priceBasis: VOL_DEFAULTS.priceBasis, hvWindow: VOL_DEFAULTS.hvWindow, chart: 'ivhv', corr: 'level',
  };
  try { return { ...base, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return base; }
}
function saveOpts(opts) {
  try { localStorage.setItem(STORE, JSON.stringify(opts)); } catch { /* حافظهٔ مرورگر در دسترس نیست */ }
}

/**
 * `getSelection()` از نقشه، `getPayload()` عکس زندهٔ داشبورد (برای
 * `session` و قراردادهای امروز)، `getSettings()` تنظیمات برنامه، و
 * `isVisible()` تا تب پنهان پرس‌وجوی تکراری نزند.
 */
export function mountVolRank(host, { getSelection, getPayload, getSettings = () => ({}), isVisible = () => true, fetcher = (...a) => fetch(...a) } = {}) {
  let opts = loadOpts();
  let ua = '', api = null, apiKey = '', baseRows = [], baseFor = '', history = null, error = '';
  let loading = false, poll = null, table = null, tries = 0;
  const charts = new Map();

  host.innerHTML = `<div class="vr">
    <div class="section-head"><div><p class="eyebrow">رتبه و صدک تلاطم ضمنی</p><h2 data-vr-title>IV Rank و IV Percentile</h2>
    <p class="note">تلاطم ضمنیِ امروز در برابر سابقهٔ خودش و در برابر تلاطم تاریخی. شاخص هر روز از قیمت پایانی قراردادهای معامله‌شدهٔ همان روز ساخته می‌شود — سررسیدشده‌ها هم.</p></div>
    <button type="button" class="ghost" data-vr-reload>دریافت دوباره</button></div>
    <div data-vr-controls>${volControlsHtml(opts)}</div>
    <p class="note" data-vr-status role="status"></p>
    <div data-vr-body></div>
  </div>`;
  const q = (sel) => host.querySelector(sel);

  host.addEventListener('change', (event) => {
    const field = event.target.closest('[data-vr-opt]');
    if (!field) return;
    const key = field.dataset.vrOpt;
    opts = { ...opts, [key]: ['lookback', 'targetDays', 'hvWindow'].includes(key) ? Number(field.value) : field.value };
    saveOpts(opts);
    if (key === 'lookback') load(); else recompute();
  });
  host.addEventListener('click', (event) => {
    if (event.target.closest('[data-vr-reload]')) { load(true); return; }
    const chart = event.target.closest('[data-vr-chart-pick]');
    if (chart) { opts = { ...opts, chart: chart.dataset.vrChartPick }; saveOpts(opts); paintChart(); return; }
    const corr = event.target.closest('[data-vr-corr]');
    if (corr) { opts = { ...opts, corr: corr.dataset.vrCorr }; saveOpts(opts); paintCorrelation(); }
  });

  const params = () => volParams({ lookback: opts.lookback, method: opts.method, targetDays: opts.targetDays, priceBasis: opts.priceBasis, hvWindow: opts.hvWindow });

  function uaName() {
    const universe = getPayload()?.universe;
    return universe?.underlyings?.find((row) => String(row.ins) === ua)?.name || '';
  }

  function liveInput() {
    const payload = getPayload();
    const session = payload?.session;
    if (!session?.current || !(session.date > 0)) return null;
    const universe = payload.universe || {};
    const under = universe.underlyings?.find((row) => String(row.ins) === ua);
    const spot = opts.priceBasis === 'last' ? (Number(under?.tradeLast) || Number(under?.last)) : Number(under?.close);
    if (!(spot > 0)) return null;
    return { date: session.date, spot, observations: liveObservations(universe.contracts || [], ua, opts.priceBasis) };
  }

  function recompute() {
    if (!api) return;
    const range = volRangeFor(opts.lookback, api.today || tehranDateNumber());
    // اعمالِ روزهای پیش از تعدیل سود نقدی یا افزایش سرمایه (`core/strike-adjust.mjs`).
    const plan = strikeAdjustPlan({ contracts: api.contracts, panels: api.panels, events: baseAdjustments(baseRows) });
    history = buildVolHistory({
      baseRows, observations: panelObservations(api.contracts, api.panels, opts.priceBasis, { strikeOf: strikeResolver(plan) }),
      live: liveInput(), from: range?.from || 0, params: params(), settings: getSettings(),
    });
    history.rangeFrom = range?.from || 0;
    history.adjust = plan;
    // خلاصه برای انتخابگر نماد، نقشهٔ بازار و تب‌های استراتژی.
    saveVolSummary(volSummaryOf(history, { ua, lookback: opts.lookback }));
    paint();
  }

  // ═══ پاسخ فقط مال انتخابِ خودش ═══
  //
  // گزارش آزمون ۳۷۱۲e1a (بند ۱) برای میز تلاطم بازتولید شد و همین الگو اینجا
  // هم بود — بدتر: پاسخِ نماد قبلی با `ua` تازه وارد `saveVolSummary` می‌شد و
  // IVR نماد الف به‌نام نماد ب در انتخابگر و نقشه می‌ماند. حالا هر دریافت
  // شماره و لغو دارد، پاسخ کهنه دور ریخته می‌شود، و با عوض‌شدن نماد تاریخچهٔ
  // قبلی همان لحظه کنار می‌رود.
  let loadSeq = 0, controller = null;
  // کلیدِ آخرین درخواست (نماد و بازه)، تا تلاشِ دوباره پس از شکست اسکلتِ
  // «در حال دریافت» را روی پیامِ خطا نگذارد (۱۴۰۵/۰۷/۱۸).
  let askedKey = '';

  async function load(force = false) {
    const sel = getSelection() || {};
    const want = String(sel.uaIns || '');
    const my = ++loadSeq;
    controller?.abort();
    controller = typeof AbortController === 'function' ? new AbortController() : null;
    clearTimeout(poll); poll = null;
    if (want !== ua) { api = null; apiKey = ''; history = null; }
    ua = want;
    if (!ua) {
      loading = false;
      q('[data-vr-status]').textContent = '';
      q('[data-vr-body]').innerHTML = '<p class="empty-note">اول روی تب «نقشه و زنجیره» یک نماد پایه انتخاب کن؛ رتبهٔ تلاطم برای همان ساخته می‌شود.</p>';
      return;
    }
    const today = tehranDateNumber();
    const range = volRangeFor(opts.lookback, today);
    const key = `${ua}:${range.from}:${range.to}`;
    loading = true;
    error = '';
    if (key !== apiKey && key !== askedKey) { tries = 0; history = null; q('[data-vr-body]').innerHTML = '<p class="empty-note">در حال دریافت تاریخچهٔ قیمت قراردادها و پایه…</p>'; }
    askedKey = key;
    try {
      let rows = baseRows;
      if (baseFor !== want || force) {
        const got = await fetchDailies([want], { n: 0, fetcher, signal: controller?.signal });
        rows = got.byIns?.[want]?.rows || [];
      }
      const response = await fetcher(`/api/vol/history?ua=${encodeURIComponent(want)}&from=${range.from}&to=${range.to}`, { cache: 'no-store', signal: controller?.signal });
      const body = await response.json();
      if (my !== loadSeq || want !== ua) return;
      if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
      if (String(body.ua) !== want) return;
      baseRows = rows; baseFor = want;
      api = body; apiKey = key;
      recompute();
      // ساخت پرونده‌ها ادامه دارد: تا وقتی تب دیده می‌شود دوباره بپرس.
      if ((body.build?.running || body.build?.queued || body.roster?.build?.running) && tries < 400) {
        tries += 1;
        poll = setTimeout(() => { poll = null; if (isVisible()) load(); }, 6000);
      }
    } catch (e) {
      if (my !== loadSeq || e?.name === 'AbortError') return;
      error = String(e?.message || e);
      q('[data-vr-status]').textContent = `دریافت تاریخچهٔ تلاطم ناموفق بود: ${faDigits(error)}`;
      if (!history) q('[data-vr-body]').innerHTML = `<p class="empty-note">${esc(error)}</p>`;
    } finally { if (my === loadSeq) loading = false; }
  }

  function paint() {
    const name = uaName();
    q('[data-vr-title]').textContent = name ? `IV Rank و IV Percentile · ${name}` : 'IV Rank و IV Percentile';
    q('[data-vr-status]').textContent = volStatusText({ api, history, baseRows: baseRows.length, uaName: name });
    if (!history) return;
    const body = q('[data-vr-body]');
    if (!body.querySelector('[data-vr-gauges]')) {
      body.innerHTML = `<div class="vr-gauges" data-vr-gauges>${[
        ['ivr', 'IV Rank', 'جای IV امروز بین کمینه و بیشینهٔ بازه'],
        ['ivp', 'IV Percentile', 'درصد روزهای بازه با IV کمتر از امروز'],
        ['hvp', 'صدک HV', 'جای تلاطم تاریخیِ هم‌افق در سابقهٔ خودش'],
        ['ratio', 'IV ÷ HV', 'بیشتر از یک: بازار تلاطمی بیش از اخیر قیمت داده'],
      ].map(([key, title, hint]) => `<figure class="card vr-gauge-card"><div class="vr-gauge" data-vr-gauge="${key}" role="img" aria-label="${esc(title)}"></div><figcaption><b>${esc(title)}</b><small>${esc(hint)}</small><span data-vr-gauge-text="${key}"></span></figcaption></figure>`).join('')}</div>
        <div data-vr-regime></div>
        <div class="lmm-stat-grid vr-kpis" data-vr-kpis></div>
        <p class="note" data-vr-gaps></p>
        <section class="card"><div class="section-head"><h3>مقایسهٔ تلاطم امروز</h3><span>IV در برابر رتبه، صدک و تلاطم تاریخی</span></div><div data-vr-compare></div></section>
        <section class="card"><div class="section-head"><h3>نمودارها</h3></div>
          <div class="decision-view-buttons" data-vr-charts>${VR_CHARTS.map(([id, label], i) => `<button type="button" data-vr-chart-pick="${id}" aria-pressed="false">${fmt.int(i + 1)}. ${esc(label)}</button>`).join('')}</div>
          <p class="note" data-vr-chart-note></p><div class="vr-chart" data-vr-chart></div></section>
        <section class="card"><div class="section-head"><h3>رابطهٔ انواع تلاطم</h3><div class="decision-side-switch" role="group" aria-label="مبنای همبستگی">
          <button type="button" data-vr-corr="level" aria-pressed="false">سطح</button><button type="button" data-vr-corr="change" aria-pressed="false">تغییر روزانه</button></div></div>
          <p class="note">همبستگی پیرسون روی روزهایی که هر دو سنجه معلوم‌اند. سطحِ دو سری کندحرکت تقریباً همیشه همبسته درمی‌آید؛ «تغییر روزانه» نشان می‌دهد آیا با هم تکان می‌خورند.</p>
          <div class="vr-chart vr-chart-square" data-vr-corr-chart></div></section>
        <section class="card"><div class="section-head"><h3>جدول روزانه</h3><span>روی هر سرستون مرتب کن؛ ستون‌ها انتخابی‌اند و خروجی CSV دارد</span></div><div data-vr-table></div></section>`;
    }
    q('[data-vr-regime]').innerHTML = volRegimeHtml(history);
    q('[data-vr-kpis]').innerHTML = volKpiHtml(history);
    // چرا شاخص از این روز شروع می‌شود، و تعدیل‌های قیمت اعمال در بازه.
    q('[data-vr-gaps]').textContent = [gapsText(indexGaps(rangeRows(history))), adjustText(history.adjust)].filter(Boolean).join(' ');
    q('[data-vr-compare]').innerHTML = volCompareHtml(history);
    paintGauges();
    paintChart();
    paintCorrelation();
    if (!table) {
      table = makeTable(q('[data-vr-table]'), VR_COLUMNS, { all: VR_COLUMNS, storeKey: 'dashboard:vol-rank', exportName: 'vol-rank', sortKey: 'dateText' });
      table.setEmptyMessage('هنوز روزی در بازه نیست.');
    }
    table.set(volTableRows(history));
  }

  async function setChart(key, el, build) {
    // همان ظرف یعنی دادهٔ تازه: `mountChart` همان نمودار را بی انیمیشن
    // به‌روز می‌کند. دورریختن فقط وقتی ظرف عوض شده.
    const prev = charts.get(key);
    if (prev && prev.host !== el) prev.dispose();
    charts.delete(key);
    const handle = await mountChart(el, build, { empty: 'دادهٔ کافی برای این نمودار نیست — پوشش بازه را در خط وضعیت ببین.' });
    if (handle) charts.set(key, handle);
  }

  function paintGauges() {
    const rank = history.rank;
    const ratio = history.ratioNow;
    const values = {
      ivr: [rank.ivr, 100, 0], ivp: [rank.ivp, 100, 0], hvp: [history.hvRank.ivp, 100, 0], ratio: [ratio, 3, 2],
    };
    for (const [key, [value, max, digits]] of Object.entries(values)) {
      const el = q(`[data-vr-gauge="${key}"]`);
      setChart(`gauge-${key}`, el, (echarts, tokens) => gaugeOption({
        value, max, digits, tokens, title: key === 'ratio' ? 'IV ÷ HV' : key.toUpperCase(),
        bands: key === 'ratio'
          ? [[0.8 / 3, tokens.accent], [1.2 / 3, tokens.panel2], [1, tokens.warn]]
          : rankBands(tokens),
      }));
      const text = q(`[data-vr-gauge-text="${key}"]`);
      if (text) {
        text.textContent = isNum(value)
          ? (key === 'ratio' ? `${fmt.num(value)} برابر` : `${rankText(value)} از ۱۰۰`)
          : (key === 'hvp' ? (history.hvRank.why || '—') : (rank.why || '—'));
      }
    }
  }

  function paintChart() {
    if (!history) return;
    host.querySelectorAll('[data-vr-chart-pick]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.vrChartPick === opts.chart)));
    const meta = VR_CHARTS.find(([id]) => id === opts.chart) || VR_CHARTS[0];
    q('[data-vr-chart-note]').textContent = meta[2];
    setChart('main', q('[data-vr-chart]'), (echarts, tokens) => CHART_BUILDERS[meta[0]](history, tokens));
  }

  function paintCorrelation() {
    if (!history) return;
    host.querySelectorAll('[data-vr-corr]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.vrCorr === opts.corr)));
    const corr = volCorrelation(rangeRows(history), { changes: opts.corr === 'change' });
    setChart('corr', q('[data-vr-corr-chart]'), (echarts, tokens) => correlationOption(corr, tokens));
  }

  return {
    /** با هر تیکِ داشبورد یا ورود به تب: اگر نماد عوض شده دریافت، وگرنه فقط بازسازیِ «امروز». */
    paint() {
      const next = String(getSelection()?.uaIns || '');
      // نمادِ تازه دریافت را از نو شروع می‌کند؛ همان نماد با دریافتِ درجریان
      // صبر می‌کند (۱۴۰۵/۰۷/۱۸). پیش‌تر هر تیکِ داشبورد تا رسیدنِ `api`
      // دوباره `load` می‌زد، دریافتِ درجریان را لغو می‌کرد و اسکلتِ «در حال
      // دریافت» را دوباره می‌گذاشت؛ نمادِ پرقرارداد هیچ‌وقت بار نمی‌شد.
      if (next !== ua) { load(); return; }
      if (!api) { if (!loading) load(); return; }
      recompute();
      // نظرسنجیِ ساخت فقط اگر زمان‌سنجی در راه نیست؛ پیش‌تر هر تیکِ ۵ ثانیه‌ای
      // زمان‌سنجِ ۶ ثانیه‌ای را از نو می‌گذاشت و هیچ‌وقت نمی‌رسید.
      if ((api.build?.running || api.build?.queued) && !loading && !poll) poll = setTimeout(() => { poll = null; if (isVisible()) load(); }, 6000);
    },
    resize() { for (const handle of charts.values()) handle.resize(); },
    dispose() { clearTimeout(poll); for (const handle of charts.values()) handle.dispose(); charts.clear(); },
    get history() { return history; },
  };
}
