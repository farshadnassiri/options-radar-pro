// میز تلاطم — مسیر تلاطم ضمنیِ امروز در برابر بازگشایی، دیروز و روزهای قبل.
//
// داده از `/api/vol/intraday` (فرم انتقال هر روز با برچسب منبع)، عدد از
// `core/vol-desk.mjs` و `core/vol-intraday.mjs`. اینجا فقط رشتهٔ HTML و
// گزینهٔ نمودار؛ سازنده‌ها خالص‌اند تا آزمون بی DOM بسنجدشان.
//
// هر عدد برچسب منبعش را دارد: «ضبط زنده» یا «بازسازی از ریزمعامله/دفتر»،
// و روزِ امروز «موقت». لحظهٔ خالی خالی می‌ماند، با علت — درون‌یابی نمی‌شود.

import { fmt, faDigits, ltr } from './fmt.mjs';
import { mountChart, chartFormat } from './chart-host.mjs';
import { makeTable } from './table.mjs';
import { readVolSummary } from './vol-rank-store.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { tehranDateNumber } from '../core/tehran-day.mjs';
import { momentsFor, momentLabel } from '../core/intraday-grid.mjs';
import { intradayContext, INTRADAY_WHY, INTRADAY_FLAGS, INTRADAY_SOURCES } from '../core/vol-intraday.mjs';
import { deskModel, deskCompareRows, deskDayRows, hourlyPattern, momentDetail, DESK_LIVE_WHY } from '../core/vol-desk.mjs';
import { computeDeskDays } from './vol-desk-compute.mjs';
import { QUOTE_WHY } from '../core/moment-quote.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const isNum = (value) => Number.isFinite(value);
const dateLabel = (value) => faDigits(historyDateLabel(value));
const pctText = (value) => (isNum(value) ? `${fmt.pct(value)}٪` : '—');
const signed = (value, unit = ' واحد') => (isNum(value) ? ltr(`${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt.pct(Math.abs(value))}`) + unit : '—');
const tone = (value) => (isNum(value) ? (value > 0 ? 'gain' : value < 0 ? 'loss' : '') : '');
const tick = (value) => ltr(Number(value) < 0 ? `−${faDigits(String(Math.abs(value)))}` : faDigits(String(value)));
const nul = (value) => (isNum(value) ? Math.round(value * 100) / 100 : null);
const STORE = 'options-radar:vol-desk';

export const DESK_GRAINS = [['m5', '۵ دقیقه'], ['m15', '۱۵ دقیقه'], ['m30', '۳۰ دقیقه'], ['m60', '۶۰ دقیقه'], ['day', 'روزانه (پایان جلسه)']];
export const DESK_SPANS = [[5, '۵ روز'], [10, '۱۰ روز'], [20, '۲۰ روز'], [40, '۴۰ روز']];
export const DESK_MODES = [['trades', 'ریزمعامله'], ['book', 'دفتر سفارش + ریزمعامله']];

export const DESK_CHARTS = [
  ['path', 'مسیر امروز', 'تلاطم ضمنی امروز با نوار خرید تا فروش؛ خط چین همان ساعت در روز قبل، خط افقی بازگشایی.'],
  ['overlay', 'روزها روی هم', 'هر روز یک خط روی محور ساعت جلسه؛ امروز پررنگ. روی نام هر روز در راهنما کلیک کن.'],
  ['change', 'تغییر از بازگشایی', 'هر روز منهای بازگشایی خودش؛ الگوی تکرارشوندهٔ درون‌روز را نشان می‌دهد.'],
  ['multi', 'چندروزه پیوسته', 'لحظه‌ها پشت‌سرهم؛ شکاف شبانه و لحظه‌های خالی همان‌طور خالی می‌مانند.'],
  ['heat', 'نقشهٔ حرارتی', 'روز × ساعت؛ رنگ گرم یعنی تلاطم بالاتر.'],
  ['smile', 'لبخند: اکنون، بازگشایی، پایان دیروز', 'تلاطم هر قرارداد در برابر فاصلهٔ اعمال از پایه (درصد)؛ فقط سمت خارج از پول.'],
  ['term', 'ساختار زمانی', 'تلاطم در پولِ هر سررسید در برابر روز معاملاتی تا سررسید، در سه لحظه.'],
  ['scatter', 'قیمت پایه در برابر تلاطم', 'هر نقطه یک لحظه؛ شیب منفی یعنی با افت پایه تلاطم بالا می‌رود.'],
  ['hourly', 'الگوی ساعتی', 'میانگین «مقدار منهای بازگشایی» در روزهای گذشته برای هر ساعت، کنار امروز.'],
  ['dist', 'توزیع هم‌ساعت', 'مقدار همین ساعت در روزهای گذشته؛ خط عمودی اکنون است.'],
];

// ═══════════════════ سازنده‌های خالص ═══════════════════

export function deskControlsHtml(opts = {}) {
  const sel = (key, label, items) => `<label>${label}<select data-vd-opt="${key}">${items
    .map(([value, text]) => `<option value="${esc(value)}"${String(value) === String(opts[key]) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  return `<div class="vr-controls">
    ${sel('grain', 'دانه', DESK_GRAINS)}
    ${sel('span', 'روزهای مقایسه', DESK_SPANS)}
    ${sel('mode', 'بازسازی روزهای ضبط‌نشده از', DESK_MODES)}
  </div>`;
}

/** خط وضعیت: منبع روزها، ضبط، ساخت. */
export function deskStatusText(api, model) {
  if (!api) return '';
  const count = (src) => (api.days || []).filter((d) => d.source === src).length;
  const parts = [];
  const rec = count('record'), built = count('trades') + count('book'), pending = count('pending');
  parts.push(`${faDigits(api.days?.length || 0)} روز: ${faDigits(rec)} ضبط زنده، ${faDigits(built)} بازسازی‌شده${pending ? `، ${faDigits(pending)} ساخته‌نشده` : ''}`);
  if (api.build?.running || api.build?.queued) parts.push(`ساخت ادامه دارد (${faDigits(api.build.done)} از ${faDigits(api.build.total)}${api.build.failed ? `، ${faDigits(api.build.failed)} ناموفق` : ''})`);
  else if (api.build?.lastError) parts.push(`آخرین خطای ساخت: ${faDigits(api.build.lastError)}`);
  const r = api.recorder;
  if (r) parts.push(r.on ? `ضبط زنده روشن، گام ${faDigits(r.stepSec)} ثانیه${r.frames ? ` · امروز ${faDigits(r.frames)} قاب` : ''}` : 'ضبط زنده خاموش است (تنظیمات › تلاطم)');
  if (api.grainServed?.rebuild && api.grainServed.rebuild !== api.grain) parts.push('روزهای بازسازی‌شده گام ۵ دقیقه دارند');
  if (model?.focus && !model.live) parts.push(`امروز داده‌ای نیست؛ آخرین جلسه (${dateLabel(model.focus.date)}) نشان داده می‌شود`);
  return parts.join(' · ');
}

/** برچسب عدد اصلی: «اکنون» فقط وقتی واقعاً اکنون است. */
export function deskNowLabel(model) {
  if (model?.live) return 'تلاطم ضمنی اکنون (موقت)';
  if (model?.provisional) return 'آخرین مقدار معتبر امروز (موقت، نه «اکنون»)';
  return 'تلاطم ضمنی پایان آخرین جلسه';
}

/** چرا «اکنون» نیست و چقدر کهنه است. */
export function deskStaleNote(model) {
  const age = Number.isFinite(model?.nowAgeSec) ? `${faDigits(Math.round(model.nowAgeSec / 60))} دقیقه پیش` : '';
  const why = DESK_LIVE_WHY[model?.liveWhy] || '';
  const last = model?.liveWhy === 'lastInvalid' && model.lastWhy ? ` (${INTRADAY_WHY[model.lastWhy] || model.lastWhy})` : '';
  return [age, `${why}${last}`].filter(Boolean).join(' · ');
}

/** کارت «اکنون». */
export function deskNowHtml(model, { uaName = '' } = {}) {
  if (!model?.now) {
    const why = { pending: 'روزهای گذشته هنوز ساخته نشده‌اند و امروز ضبطی نیست.', noIndex: 'در روزهای دریافت‌شده هیچ لحظه‌ای شاخص نساخت.', noDays: 'روزی در بازه نیست.' }[model?.why] || '';
    return `<p class="empty-note">${esc(why)}</p>`;
  }
  const now = model.now;
  const flags = (now.flags || []).map((f) => INTRADAY_FLAGS[f]).filter(Boolean);
  const range = model.stats && model.stats.high > model.stats.low ? model.stats : null;
  const pos = range ? Math.max(0, Math.min(100, ((now.value - range.low) / (range.high - range.low)) * 100)) : NaN;
  const same = model.same;
  const tiles = [
    ['تغییر از بازگشایی', signed(model.change), model.open ? `بازگشایی ${pctText(model.open.value)} · ${momentLabel(model.open.second)}` : 'بازگشایی هنوز نیست', tone(model.change)],
    ['در برابر دیروز همین ساعت', signed(model.changeYday), model.ydaySame ? `${pctText(model.ydaySame.value)} · ${dateLabel(model.prev.date)}` : 'دیروز در این ساعت عددی نداشت', tone(model.changeYday)],
    ['در برابر پایان دیروز', signed(model.changeYdayClose), model.ydayClose ? pctText(model.ydayClose.value) : '—', tone(model.changeYdayClose)],
    [`صدک هم‌ساعت (${faDigits(same?.n || 0)} روز)`, isNum(same?.percentile) ? fmt.int(Math.round(same.percentile)) : '—', isNum(same?.median) ? `میانه ${pctText(same.median)} · دامنه ${pctText(same.min)} تا ${pctText(same.max)}` : 'روز کافی نیست', ''],
    ['IV ÷ تحقق‌یافتهٔ امروز', isNum(model.ivRv) ? `${fmt.num(model.ivRv)} برابر` : '—', isNum(model.rv?.rvPct) ? `RV امروز ${pctText(model.rv.rvPct)}` : 'بازدهٔ کافی نیست', ''],
    ['IV ÷ HV', isNum(model.ivHv) ? `${fmt.num(model.ivHv)} برابر` : '—', model.summary && isNum(model.summary.hvPct) ? `HV ${faDigits(model.summary.hvWindow)} روزه ${pctText(model.summary.hvPct)}` : 'از تب «رتبه و صدک تلاطم»', ''],
    ['IVR · IVP روزانه', model.summary ? `${isNum(model.summary.ivr) ? fmt.int(Math.round(model.summary.ivr)) : '—'} · ${isNum(model.summary.ivp) ? fmt.int(Math.round(model.summary.ivp)) : '—'}` : '—', model.summary ? `${model.summary.regimeLabel || ''} · ${dateLabel(model.summary.date)}` : 'هنوز ساخته نشده', ''],
    ['نوار خرید تا فروش', isNum(now.bid) && isNum(now.ask) ? `${pctText(now.bid)} تا ${pctText(now.ask)}` : '—', `${faDigits(now.used || 0)} قرارداد در پول · سن بیشینه ${isNum(now.maxAge) ? faDigits(Math.round(now.maxAge)) : '—'} ثانیه`, ''],
  ];
  return `<article class="vd-now" data-live="${model.live}">
    <div class="vd-now-head">
      <div><small>${esc(deskNowLabel(model))}${uaName ? ` · ${esc(uaName)}` : ''}</small>
        <strong>${pctText(now.value)}</strong>
        <span>${momentLabel(now.second)} · ${dateLabel(model.focus.date)} · ${esc(INTRADAY_SOURCES[model.focus.source] || model.focus.source)}</span>
        ${model.provisional && !model.live ? `<span class="vd-stale">${esc(deskStaleNote(model))}</span>` : ''}</div>
      <div class="vd-range" role="img" aria-label="${esc(`جای اکنون در دامنهٔ امروز: ${isNum(pos) ? Math.round(pos) : '—'} درصد`)}">
        <small>دامنهٔ امروز تا اکنون</small>
        <span class="cc-bar"><i style="--pct:${isNum(pos) ? pos.toFixed(1) : 0}%"></i><b></b></span>
        <span>${range ? `کف ${pctText(range.low)} · سقف ${pctText(range.high)}` : '—'}</span>
      </div>
    </div>
    <div class="lmm-stat-grid">${tiles.map(([label, value, note, cls]) => `<article class="lmm-stat ${cls}"><small>${esc(label)}</small><strong>${value}</strong><span>${esc(note)}</span></article>`).join('')}</div>
    ${flags.length ? `<ul class="vr-notes">${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

export function deskCompareHtml(model) {
  const rows = deskCompareRows(model);
  if (!rows.length) return '';
  return `<div class="history-table-wrap"><table class="history-table vr-compare"><thead><tr><th>سنجه</th><th>مقدار</th><th>اکنون منهای این</th><th>توضیح</th></tr></thead><tbody>${rows
    .map((row) => `<tr${row.daily ? ' data-daily="true"' : ''}><th scope="row">${esc(faDigits(row.label))}</th><td class="n">${pctText(row.value)}</td><td class="n ${tone(row.diff)}">${row.label === rows[0].label ? '—' : signed(row.diff)}</td><td>${esc(faDigits(row.note))}${row.date ? ` · ${dateLabel(row.date)}` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

// ═══════════════════ نمودارها ═══════════════════

const axisCommon = (tokens) => ({
  axisLabel: { color: tokens.muted },
  axisLine: { lineStyle: { color: tokens.line } },
  splitLine: { lineStyle: { color: tokens.lineSoft } },
});
const pctAxis = (tokens, name = 'تلاطم ضمنی ٪') => ({ type: 'value', name, nameTextStyle: { color: tokens.muted }, scale: true, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: tick } });
const timeAxis = (tokens, model) => ({
  type: 'value', min: model.openSec, max: model.focus ? Math.max(...momentsFor('m60')) : undefined, ...axisCommon(tokens),
  interval: 1800, axisLabel: { color: tokens.muted, formatter: (v) => momentLabel(v) },
});
const timeTip = (params) => {
  const list = Array.isArray(params) ? params : [params];
  const head = list[0] ? momentLabel(list[0].value?.[0]) : '';
  return `<b>${head}</b><br>${list.map((p) => `${p.marker}${esc(p.seriesName)}: ${chartFormat.pct(p.value?.[1])}`).join('<br>')}`;
};
const series = (points, key = 'value') => (points || []).map((pt) => [pt.second, nul(pt[key])]);
const legend = (tokens) => ({ top: 0, type: 'scroll', textStyle: { color: tokens.muted } });
const grid = { left: 56, right: 24, top: 64, bottom: 40, containLabel: true };

export function pathOption(model, tokens) {
  if (!model?.focus || model.focus.points.filter((pt) => isNum(pt.value)).length < 1) return null;
  const pts = model.focus.points;
  const out = [
    { name: 'خرید', type: 'line', data: series(pts, 'bid'), symbol: 'none', lineStyle: { width: 0 }, stack: 'band', areaStyle: { opacity: 0 }, itemStyle: { color: tokens.muted } },
    { name: 'نوار تا فروش', type: 'line', data: pts.map((pt) => [pt.second, isNum(pt.ask) && isNum(pt.bid) ? nul(pt.ask - pt.bid) : null]), symbol: 'none', lineStyle: { width: 0 }, stack: 'band', areaStyle: { color: tokens.accentSoft, opacity: 0.6 }, itemStyle: { color: tokens.accentSoft } },
    {
      name: model.live ? 'اکنون (امروز)' : dateLabel(model.focus.date), type: 'line', data: series(pts), symbolSize: 5, connectNulls: false,
      lineStyle: { width: 2.5, color: tokens.accent }, itemStyle: { color: tokens.accent },
      markLine: model.open ? { silent: true, symbol: 'none', lineStyle: { color: tokens.muted, type: 'dashed' }, label: { formatter: 'بازگشایی', color: tokens.muted }, data: [{ yAxis: nul(model.open.value) }] } : undefined,
    },
  ];
  if (model.prev) out.push({ name: `${dateLabel(model.prev.date)} (روز قبل)`, type: 'line', data: series(model.prev.points), symbol: 'none', lineStyle: { width: 1.5, type: 'dashed', color: tokens.series[2] }, itemStyle: { color: tokens.series[2] } });
  return { legend: legend(tokens), tooltip: { trigger: 'axis', formatter: timeTip }, grid, xAxis: timeAxis(tokens, model), yAxis: pctAxis(tokens), series: out };
}

function dayLines(model, tokens, map) {
  const days = [...(model?.prior || []), ...(model?.focus ? [model.focus] : [])];
  if (!days.length) return null;
  return days.map((d, i) => {
    const focus = d === model.focus;
    return {
      name: `${dateLabel(d.date)}${focus && model.live ? ' (امروز)' : ''}`, type: 'line', symbol: 'none', connectNulls: false,
      data: map(d), lineStyle: { width: focus ? 3 : 1.2, color: focus ? tokens.accent : tokens.palette[i % tokens.palette.length], opacity: focus ? 1 : 0.75 },
      itemStyle: { color: focus ? tokens.accent : tokens.palette[i % tokens.palette.length] }, z: focus ? 5 : 2,
    };
  });
}

export function overlayOption(model, tokens) {
  const lines = dayLines(model, tokens, (d) => series(d.points));
  if (!lines) return null;
  return { legend: legend(tokens), tooltip: { trigger: 'axis', formatter: timeTip }, grid, xAxis: timeAxis(tokens, model), yAxis: pctAxis(tokens), series: lines };
}

export function changeOption(model, tokens) {
  const lines = dayLines(model, tokens, (d) => {
    const open = d === model.focus ? model.open : null;
    const base = open || d.points.find((pt) => isNum(pt.value) && pt.second >= model.openSec + model.skipSec);
    return d.points.map((pt) => [pt.second, base && isNum(pt.value) && pt.second >= base.second ? nul(pt.value - base.value) : null]);
  });
  if (!lines) return null;
  return { legend: legend(tokens), tooltip: { trigger: 'axis', formatter: timeTip }, grid, xAxis: timeAxis(tokens, model), yAxis: pctAxis(tokens, 'تغییر از بازگشایی (واحد)'), series: lines };
}

export function multiOption(model, tokens) {
  const days = model?.days || [];
  const cats = [], iv = [], bid = [], ask = [];
  for (const d of days) {
    for (const pt of d.points) {
      cats.push(`${dateLabel(d.date)} ${momentLabel(pt.second)}`);
      iv.push(nul(pt.value)); bid.push(nul(pt.bid)); ask.push(nul(pt.ask));
    }
  }
  if (iv.filter((v) => v !== null).length < 2) return null;
  return {
    legend: legend(tokens), tooltip: { trigger: 'axis', valueFormatter: chartFormat.pct }, grid: { ...grid, bottom: 64 },
    xAxis: { type: 'category', data: cats, ...axisCommon(tokens) }, yAxis: pctAxis(tokens),
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6 }],
    series: [
      { name: 'IV', type: 'line', data: iv, symbol: 'none', connectNulls: false, lineStyle: { width: 2, color: tokens.accent }, itemStyle: { color: tokens.accent } },
      { name: 'خرید', type: 'line', data: bid, symbol: 'none', lineStyle: { width: 1, type: 'dotted', color: tokens.muted }, itemStyle: { color: tokens.muted } },
      { name: 'فروش', type: 'line', data: ask, symbol: 'none', lineStyle: { width: 1, type: 'dotted', color: tokens.warn }, itemStyle: { color: tokens.warn } },
    ],
  };
}

export function heatOption(model, tokens, seconds) {
  const days = [...(model?.prior || []), ...(model?.focus ? [model.focus] : [])];
  if (!days.length || !seconds.length) return null;
  const data = [];
  days.forEach((d, y) => {
    seconds.forEach((second, x) => {
      const hit = d.points.find((pt) => pt.second === second);
      if (hit && isNum(hit.value)) data.push([x, y, nul(hit.value)]);
    });
  });
  if (!data.length) return null;
  const values = data.map((r) => r[2]);
  return {
    tooltip: { formatter: (p) => `${dateLabel(days[p.value[1]].date)} · ${momentLabel(seconds[p.value[0]])}<br>${chartFormat.pct(p.value[2])}` },
    grid: { left: 90, right: 24, top: 16, bottom: 70, containLabel: true },
    xAxis: { type: 'category', data: seconds.map(momentLabel), ...axisCommon(tokens), splitArea: { show: false } },
    yAxis: { type: 'category', data: days.map((d) => dateLabel(d.date)), ...axisCommon(tokens) },
    visualMap: { min: Math.min(...values), max: Math.max(...values), dimension: 2, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: [tokens.accentSoft, tokens.accent, tokens.warn] }, textStyle: { color: tokens.muted }, formatter: (v) => faDigits(fmt.pct(v)) },
    series: [{ type: 'heatmap', data, emphasis: { itemStyle: { borderColor: tokens.ink, borderWidth: 1 } } }],
  };
}

/** سه لحظهٔ مرجع برای لبخند و ساختار زمانی. */
export function referenceMoments(model, ctx) {
  const out = [];
  if (model?.now) out.push({ label: model.live ? 'اکنون' : 'پایان جلسه', detail: momentDetail(model.focus, model.now.second, ctx) });
  if (model?.open && model.open.second !== model.now?.second) out.push({ label: 'بازگشایی', detail: momentDetail(model.focus, model.open.second, ctx) });
  if (model?.ydayClose) out.push({ label: `پایان ${dateLabel(model.prev.date)}`, detail: momentDetail(model.prev, model.ydayClose.second, ctx) });
  return out.filter((row) => row.detail);
}

export function smileOption(refs, tokens) {
  const sets = refs.map((ref, i) => {
    const S = ref.detail.spot;
    const pts = (ref.detail.contracts || []).filter((c) => isNum(c.ivPct) && (c.kind === 'call' ? c.strike >= S : c.strike <= S))
      .map((c) => [nul((c.strike / S - 1) * 100), nul(c.ivPct), c.expiry]);
    return { name: ref.label, type: 'scatter', data: pts, symbolSize: i === 0 ? 9 : 7, itemStyle: { color: [tokens.accent, tokens.series[2], tokens.muted][i] } };
  }).filter((s) => s.data.length);
  if (!sets.length) return null;
  return {
    legend: legend(tokens), grid,
    tooltip: { formatter: (p) => `${esc(p.seriesName)}<br>فاصلهٔ اعمال ${tick(p.value[0])}٪ · سررسید ${dateLabel(p.value[2])}<br>IV ${chartFormat.pct(p.value[1])}` },
    xAxis: { type: 'value', name: 'اعمال نسبت به پایه ٪', nameLocation: 'middle', nameGap: 28, scale: true, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: tick } },
    yAxis: pctAxis(tokens), series: sets,
  };
}

export function termOption(refs, tokens) {
  const sets = refs.map((ref, i) => ({
    name: ref.label, type: 'line', symbolSize: 8,
    data: (ref.detail.term || []).filter((row) => isNum(row.ivPct)).map((row) => [nul(row.tradingDays), nul(row.ivPct), row.expiry]),
    lineStyle: { width: i === 0 ? 2.5 : 1.5, type: i === 0 ? 'solid' : 'dashed', color: [tokens.accent, tokens.series[2], tokens.muted][i] },
    itemStyle: { color: [tokens.accent, tokens.series[2], tokens.muted][i] },
  })).filter((s) => s.data.length);
  if (!sets.length) return null;
  return {
    legend: legend(tokens), grid,
    tooltip: { formatter: (p) => `${esc(p.seriesName)}<br>سررسید ${dateLabel(p.value[2])} · ${faDigits(fmt.num(p.value[0]))} روز معاملاتی<br>IV ${chartFormat.pct(p.value[1])}` },
    xAxis: { type: 'value', name: 'روز معاملاتی تا سررسید', nameLocation: 'middle', nameGap: 28, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: tick } },
    yAxis: pctAxis(tokens), series: sets,
  };
}

export function scatterOption(model, tokens) {
  const days = [...(model?.prior || []), ...(model?.focus ? [model.focus] : [])];
  const sets = days.map((d, i) => ({
    name: dateLabel(d.date), type: 'scatter', symbolSize: d === model.focus ? 8 : 5,
    data: d.points.filter((pt) => isNum(pt.value) && pt.price > 0).map((pt) => [pt.price, nul(pt.value), pt.second]),
    itemStyle: { color: d === model.focus ? tokens.accent : tokens.palette[i % tokens.palette.length], opacity: d === model.focus ? 1 : 0.55 },
  })).filter((s) => s.data.length);
  if (!sets.length) return null;
  return {
    legend: legend(tokens), grid,
    tooltip: { formatter: (p) => `${esc(p.seriesName)} · ${momentLabel(p.value[2])}<br>پایه ${chartFormat.money(p.value[0])}<br>IV ${chartFormat.pct(p.value[1])}` },
    xAxis: { type: 'value', name: 'قیمت پایه', nameLocation: 'middle', nameGap: 28, scale: true, ...axisCommon(tokens), axisLabel: { color: tokens.muted, formatter: (v) => faDigits(fmt.int(v)) } },
    yAxis: pctAxis(tokens), series: sets,
  };
}

export function hourlyOption(model, tokens, seconds) {
  const pattern = hourlyPattern(model, seconds);
  if (!pattern.some((row) => isNum(row.mean))) return null;
  const today = seconds.map((second) => {
    const hit = model.focus?.points.find((pt) => pt.second === second);
    return model.open && hit && isNum(hit.value) && second >= model.open.second ? nul(hit.value - model.open.value) : null;
  });
  return {
    legend: legend(tokens), grid, tooltip: { trigger: 'axis', valueFormatter: (v) => (isNum(v) ? `${tick(Math.round(v * 100) / 100)} واحد` : '—') },
    xAxis: { type: 'category', data: seconds.map(momentLabel), ...axisCommon(tokens) },
    yAxis: pctAxis(tokens, 'منهای بازگشایی (واحد)'),
    series: [
      { name: `میانگین روزهای گذشته`, type: 'bar', data: pattern.map((row) => nul(row.mean)), itemStyle: { color: tokens.accentSoft } },
      { name: model.live ? 'امروز' : dateLabel(model.focus?.date), type: 'line', data: today, symbolSize: 6, lineStyle: { color: tokens.accent, width: 2 }, itemStyle: { color: tokens.accent } },
    ],
  };
}

export function distOption(model, tokens) {
  const rows = (model?.sameRows || []).filter((r) => isNum(r.value));
  if (!rows.length || !model.now) return null;
  return {
    grid, tooltip: { trigger: 'axis', valueFormatter: chartFormat.pct },
    xAxis: { type: 'category', data: rows.map((r) => `${dateLabel(r.date)}${r.carried ? '*' : ''}`), ...axisCommon(tokens) },
    yAxis: pctAxis(tokens),
    series: [{
      name: `همین ساعت (${momentLabel(model.now.second)})`, type: 'bar', data: rows.map((r) => nul(r.value)),
      itemStyle: { color: tokens.series[2] },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: tokens.accent, width: 2 }, label: { formatter: 'اکنون', color: tokens.accent }, data: [{ yAxis: nul(model.now.value) }] },
    }],
  };
}

// ═══════════════════ جدول‌ها ═══════════════════

export const DESK_MOMENT_COLUMNS = [
  { key: 'timeText', label: 'ساعت', fmt: 'text' },
  { key: 'value', label: 'IV ٪', fmt: 'pct', heat: 'prob' },
  { key: 'bid', label: 'IV خرید ٪', fmt: 'pct' },
  { key: 'ask', label: 'IV فروش ٪', fmt: 'pct' },
  { key: 'fromOpen', label: 'از بازگشایی (واحد)', fmt: 'pct', heat: 'loss' },
  { key: 'price', label: 'قیمت پایه', fmt: 'money' },
  { key: 'skew', label: 'چولگی ۱۱۰٪ (واحد)', fmt: 'pct' },
  { key: 'termSlope', label: 'شیب زمانی (واحد)', fmt: 'pct' },
  { key: 'used', label: 'قرارداد در پول', fmt: 'int' },
  { key: 'maxAge', label: 'سن بیشینه (ثانیه)', fmt: 'int' },
  { key: 'whyText', label: 'وضعیت', fmt: 'text' },
];

export function deskMomentRows(model) {
  if (!model?.focus) return [];
  return model.focus.points.map((pt) => ({
    id: String(pt.second), timeText: momentLabel(pt.second), value: pt.value, bid: pt.bid, ask: pt.ask,
    fromOpen: model.open && isNum(pt.value) && pt.second >= model.open.second ? pt.value - model.open.value : NaN,
    price: pt.price, skew: pt.skew, termSlope: pt.termSlope, used: pt.used || NaN, maxAge: pt.maxAge,
    whyText: isNum(pt.value) ? (pt.flags.map((f) => INTRADAY_FLAGS[f]).filter(Boolean).join('؛ ') || 'ساخته شد') : (INTRADAY_WHY[pt.why] || pt.why || '—'),
  })).reverse();
}

export const DESK_CHAIN_COLUMNS = [
  { key: 'kindText', label: 'نوع', fmt: 'text' },
  { key: 'strike', label: 'اعمال', fmt: 'money' },
  { key: 'moneyness', label: 'فاصله از پایه ٪', fmt: 'pct' },
  { key: 'expiryText', label: 'سررسید', fmt: 'text' },
  { key: 'tradingDays', label: 'روز معاملاتی', fmt: 'num' },
  { key: 'ivPct', label: 'IV ٪', fmt: 'pct', heat: 'prob' },
  { key: 'ivBid', label: 'IV خرید ٪', fmt: 'pct' },
  { key: 'ivAsk', label: 'IV فروش ٪', fmt: 'pct' },
  { key: 'ivTrade', label: 'IV آخرین معامله ٪', fmt: 'pct' },
  { key: 'smileResidual', label: 'فاصله از لبخند (واحد)', fmt: 'pct', heat: 'loss' },
  { key: 'sourceText', label: 'قیمت', fmt: 'text' },
  { key: 'quoteAge', label: 'سن (ثانیه)', fmt: 'int' },
  { key: 'whyText', label: 'علت خالی', fmt: 'text' },
];

export function deskChainRows(detail) {
  if (!detail) return [];
  const S = detail.spot;
  return (detail.contracts || []).map((c) => ({
    id: c.ins, kindText: c.kind === 'call' ? 'خرید (کال)' : 'فروش (پوت)', strike: c.strike, moneyness: (c.strike / S - 1) * 100,
    expiryText: dateLabel(c.expiry), tradingDays: c.tradingDays, ivPct: c.ivPct, ivBid: c.ivBid, ivAsk: c.ivAsk, ivTrade: c.ivTrade,
    smileResidual: c.smileResidual, sourceText: { mid: 'میانهٔ مظنه', fallback: 'آخرین معامله (جایگزین)', trade: 'آخرین معامله' }[c.priceSource] || '—',
    quoteAge: c.quoteAge, whyText: isNum(c.ivPct) ? '' : (QUOTE_WHY[c.why] || c.why || ''),
  })).sort((a, b) => a.moneyness - b.moneyness);
}

export const DESK_DAY_COLUMNS = [
  { key: 'dateText', label: 'روز', fmt: 'text' },
  { key: 'sourceText', label: 'منبع', fmt: 'text' },
  { key: 'open', label: 'بازگشایی ٪', fmt: 'pct' },
  { key: 'close', label: 'پایان ٪', fmt: 'pct', heat: 'prob' },
  { key: 'high', label: 'سقف ٪', fmt: 'pct' },
  { key: 'low', label: 'کف ٪', fmt: 'pct' },
  { key: 'change', label: 'تغییر روز (واحد)', fmt: 'pct', heat: 'loss' },
  { key: 'rv', label: 'تحقق‌یافتهٔ درون‌روزی ٪', fmt: 'pct' },
  { key: 'samples', label: 'لحظهٔ دارای شاخص', fmt: 'int' },
  { key: 'contracts', label: 'قرارداد', fmt: 'int' },
];

export function deskDayTableRows(model) {
  return deskDayRows(model).map((row) => ({
    ...row, id: String(row.date),
    dateText: `${dateLabel(row.date)}${row.provisional ? ' (موقت)' : ''}`,
    sourceText: `${INTRADAY_SOURCES[row.source] || row.source}${row.why ? ` — ${row.why}` : ''}`,
  }));
}

// ═══════════════════ سوارکردن ═══════════════════

function loadOpts() {
  const base = { grain: 'm15', span: 10, mode: 'trades', chart: 'path' };
  try { return { ...base, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return base; }
}
function saveOpts(opts) {
  try { localStorage.setItem(STORE, JSON.stringify(opts)); } catch { /* حافظهٔ مرورگر در دسترس نیست */ }
}

/** روزِ تقویمیِ چند روز پیش — بازه را گشاد می‌گیریم؛ سرور روزهای معاملاتی را برمی‌دارد. */
export function deskFrom(today, span) {
  const s = String(today);
  const d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
  d.setUTCDate(d.getUTCDate() - Math.ceil(Number(span) * 1.6) - 6);
  return Number(d.toISOString().slice(0, 10).replace(/-/g, ''));
}

/**
 * `getUa()` کد و نام پایه؛ `getSettings()` تنظیمات؛ `isVisible()` تا تب
 * پنهان پرس‌وجو نزند.
 */
export function mountVolDesk(host, { getUa, getSettings = () => ({}), isVisible = () => true, fetcher = (...a) => fetch(...a) } = {}) {
  let opts = loadOpts();
  let ua = { ins: '', name: '' }, api = null, calendar = null, model = null, ctx = null, error = '', poll = null, refs = [];
  const charts = new Map();
  const tables = {};

  host.innerHTML = `<div class="vr vd">
    <div class="section-head"><div><p class="eyebrow">میز تلاطم</p><h2 data-vd-title>تلاطم ضمنی درون‌روزی</h2>
    <p class="note">شاخص تلاطم ضمنیِ هر لحظه (افق ثابت، در پول، از میانهٔ مظنه) و مقایسه‌اش با بازگشایی، دیروز و همین ساعت در روزهای قبل. امروز از ضبط زندهٔ دیده‌بان، روزهای ضبط‌نشده از بازسازی.</p></div>
    <button type="button" class="ghost" data-vd-reload>دریافت دوباره</button></div>
    <div data-vd-controls>${deskControlsHtml(opts)}</div>
    <p class="note" data-vd-status role="status"></p>
    <div data-vd-build></div>
    <div data-vd-body></div>
  </div>`;
  const q = (sel) => host.querySelector(sel);

  host.addEventListener('change', (event) => {
    const field = event.target.closest('[data-vd-opt]');
    if (!field) return;
    const key = field.dataset.vdOpt;
    opts = { ...opts, [key]: key === 'span' ? Number(field.value) : field.value };
    saveOpts(opts);
    load();
  });
  host.addEventListener('click', (event) => {
    if (event.target.closest('[data-vd-reload]')) { load(); return; }
    if (event.target.closest('[data-vd-build-go]')) { load({ build: true }); return; }
    const pick = event.target.closest('[data-vd-chart-pick]');
    if (pick) { opts = { ...opts, chart: pick.dataset.vdChartPick }; saveOpts(opts); paintChart(); }
  });

  // ═══ هر پاسخ مال همان انتخابی است که خواستش ═══
  //
  // گزارش آزمون ۳۷۱۲e1a (بند ۱): دریافتِ نماد الف معلق ماند، انتخاب به ب عوض
  // شد و `load()` دوم به‌خاطر «در حال دریافت» کنار رفت — ولی نام ب نشسته
  // بود؛ پاسخ الف رسید و IV الف زیر عنوان ب رسم شد. حالا هر دریافت شماره
  // دارد، دریافت قبلی لغو می‌شود، پاسخی که شماره‌اش کهنه است یا `ua`اش با
  // انتخاب نمی‌خواند دور ریخته می‌شود، و با عوض‌شدن نماد صفحه پیش از رسیدن
  // پاسخ خالی می‌شود — هیچ‌وقت عددِ نماد قبلی زیر نام نماد تازه نمی‌ماند.
  let loadSeq = 0, computeSeq = 0, controller = null, receivedAt = 0;

  function clearForSwitch(next) {
    ua = next; api = null; model = null; refs = [];
    for (const handle of charts.values()) handle.dispose();
    charts.clear();
    for (const key of Object.keys(tables)) delete tables[key];
    q('[data-vd-title]').textContent = next.name ? `تلاطم ضمنی درون‌روزی · ${next.name}` : 'تلاطم ضمنی درون‌روزی';
    q('[data-vd-status]').textContent = '';
    q('[data-vd-build]').innerHTML = '';
    q('[data-vd-body]').innerHTML = next.ins ? `<p class="empty-note">در حال دریافت تلاطم ${esc(next.name || 'نماد')}…</p>` : '<p class="empty-note">یک نماد پایه انتخاب کن.</p>';
  }

  async function load({ build = false } = {}) {
    const want = { ins: String(getUa()?.ins || ''), name: String(getUa()?.name || '') };
    const my = ++loadSeq;
    controller?.abort();
    controller = typeof AbortController === 'function' ? new AbortController() : null;
    clearTimeout(poll);
    if (want.ins !== ua.ins || !want.ins) clearForSwitch(want);
    else ua = want;
    if (!want.ins) return;
    try {
      if (!calendar) {
        try { calendar = await (await fetcher('/api/vol/calendar', { cache: 'no-store' })).json(); } catch { calendar = { known: false, holidays: [] }; }
      }
      const today = tehranDateNumber();
      const url = `/api/vol/intraday?ua=${encodeURIComponent(want.ins)}&from=${deskFrom(today, opts.span)}&to=${today}&grain=${opts.grain}&mode=${opts.mode}${build ? '&build=1' : ''}`;
      const response = await fetcher(url, { cache: 'no-store', signal: controller?.signal });
      const body = await response.json();
      if (my !== loadSeq) return;
      if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
      if (String(body.ua) !== want.ins) return;
      api = body;
      receivedAt = Date.now();
      error = '';
      await recompute();
      if (my !== loadSeq) return;
      // ساخت ادامه دارد، یا امروز هنوز جلسه است (زنده یا کهنه): تا وقتی تب
      // دیده می‌شود دوباره بپرس — کهنه‌شدن خودش دلیل پرسیدن است، نه توقف.
      const building = body.build?.running || body.build?.queued;
      const session = ctx?.session;
      const inSession = model?.provisional && session && clockNow() <= session.close;
      const delay = building ? 8000 : inSession ? 60000 : 0;
      const arm = () => { poll = setTimeout(() => { if (isVisible()) load(); else arm(); }, delay); };
      if (delay) arm();
    } catch (e) {
      if (my !== loadSeq || e?.name === 'AbortError') return;
      error = String(e?.message || e);
      q('[data-vd-status]').textContent = `دریافت تلاطم درون‌روزی ناموفق بود: ${faDigits(error)}`;
      if (!model) q('[data-vd-body]').innerHTML = `<p class="empty-note">${esc(faDigits(error))}</p>`;
    }
  }

  /** ساعت سرور در لحظهٔ پاسخ، به‌علاوهٔ زمانِ گذشته از آن. */
  const clockNow = () => (Number.isFinite(api?.nowSecond) ? api.nowSecond + (Date.now() - receivedAt) / 1000 : NaN);

  async function recompute() {
    if (!api) return;
    const my = ++computeSeq;
    const forUa = ua.ins, settings = getSettings();
    ctx = intradayContext(settings, { holidays: calendar?.holidays || [], holidaysKnown: Boolean(calendar?.known) });
    const days = await computeDeskDays(api, settings, calendar);
    if (my !== computeSeq || forUa !== ua.ins || String(api?.ua) !== ua.ins) return;
    model = deskModel({ days, today: api.today, ctx, summary: readVolSummary(ua.ins), compareDays: opts.span, nowSecond: clockNow() });
    refs = referenceMoments(model, ctx);
    paint();
  }

  function paint() {
    q('[data-vd-title]').textContent = ua.name ? `تلاطم ضمنی درون‌روزی · ${ua.name}` : 'تلاطم ضمنی درون‌روزی';
    q('[data-vd-status]').textContent = deskStatusText(api, model);
    q('[data-vd-build]').innerHTML = api?.pending && !(api.build?.running || api.build?.queued)
      ? `<div class="vd-build"><span>${faDigits(api.pending)} روزِ گذشته ضبط نشده و هنوز بازسازی نشده. ساختشان حدود ${faDigits(fmt.int(api.cost?.requests || 0))} درخواست به بالادست می‌زند و یک بار برای همیشه ذخیره می‌شود.</span><button type="button" data-vd-build-go>ساخت روزهای گذشته</button></div>`
      : '';
    const body = q('[data-vd-body]');
    if (!body.querySelector('[data-vd-now]')) {
      body.innerHTML = `<div data-vd-now></div>
        <section class="card"><div class="section-head"><h3>اکنون در برابر…</h3><span>هم‌ساعت با حمل حداکثر ده دقیقه؛ ردیف‌های روزانه از تب «رتبه و صدک تلاطم»</span></div><div data-vd-compare></div></section>
        <section class="card"><div class="section-head"><h3>نمودارها</h3></div>
          <div class="decision-view-buttons" data-vd-charts>${DESK_CHARTS.map(([id, label], i) => `<button type="button" data-vd-chart-pick="${id}" aria-pressed="false">${fmt.int(i + 1)}. ${esc(label)}</button>`).join('')}</div>
          <p class="note" data-vd-chart-note></p><div class="vr-chart" data-vd-chart></div></section>
        <section class="card"><div class="section-head"><h3>لحظه‌های روز</h3><span>هر ردیف یک لحظه؛ لحظهٔ خالی با علتش</span></div><div data-vd-moments></div></section>
        <section class="card"><div class="section-head"><h3>زنجیره در لحظهٔ اکنون</h3><span>تلاطم هر قرارداد و فاصله‌اش از لبخند</span></div><div data-vd-chain></div></section>
        <section class="card"><div class="section-head"><h3>روزها</h3><span>منبع هر روز، بازگشایی، پایان، دامنه و تحقق‌یافته</span></div><div data-vd-days></div></section>`;
      tables.moments = makeTable(q('[data-vd-moments]'), DESK_MOMENT_COLUMNS, { all: DESK_MOMENT_COLUMNS, storeKey: 'vol-desk:moments', exportName: 'vol-desk-moments', sortKey: 'timeText' });
      tables.chain = makeTable(q('[data-vd-chain]'), DESK_CHAIN_COLUMNS, { all: DESK_CHAIN_COLUMNS, storeKey: 'vol-desk:chain', exportName: 'vol-desk-chain', sortKey: 'moneyness' });
      tables.days = makeTable(q('[data-vd-days]'), DESK_DAY_COLUMNS, { all: DESK_DAY_COLUMNS, storeKey: 'vol-desk:days', exportName: 'vol-desk-days', sortKey: 'dateText' });
      tables.moments.setEmptyMessage('لحظه‌ای نیست.');
      tables.chain.setEmptyMessage('در این لحظه قراردادی نبود.');
      tables.days.setEmptyMessage('روزی نیست.');
    }
    q('[data-vd-now]').innerHTML = deskNowHtml(model, { uaName: ua.name });
    q('[data-vd-compare]').innerHTML = deskCompareHtml(model);
    paintChart();
    tables.moments.set(deskMomentRows(model));
    tables.chain.set(deskChainRows(refs[0]?.detail));
    tables.days.set(deskDayTableRows(model));
  }

  async function setChart(key, el, build) {
    charts.get(key)?.dispose();
    charts.delete(key);
    const handle = await mountChart(el, build, { empty: 'دادهٔ کافی برای این نمودار نیست — منبع روزها را در خط وضعیت ببین.' });
    if (handle) charts.set(key, handle);
  }

  function paintChart() {
    if (!model) return;
    host.querySelectorAll('[data-vd-chart-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vdChartPick === opts.chart)));
    const meta = DESK_CHARTS.find(([id]) => id === opts.chart) || DESK_CHARTS[0];
    q('[data-vd-chart-note]').textContent = meta[2];
    const seconds = opts.grain === 'day' ? momentsFor('m60').slice(-1) : momentsFor(opts.grain === 'm5' ? 'm15' : opts.grain);
    const builders = {
      path: (t) => pathOption(model, t), overlay: (t) => overlayOption(model, t), change: (t) => changeOption(model, t),
      multi: (t) => multiOption(model, t), heat: (t) => heatOption(model, t, seconds), smile: (t) => smileOption(refs, t),
      term: (t) => termOption(refs, t), scatter: (t) => scatterOption(model, t), hourly: (t) => hourlyOption(model, t, seconds),
      dist: (t) => distOption(model, t),
    };
    setChart('main', q('[data-vd-chart]'), (echarts, tokens) => builders[meta[0]](tokens));
  }

  return {
    load,
    paint() { if (String(getUa()?.ins || '') !== ua.ins || !api) load(); else recompute(); },
    get ua() { return ua; },
    resize() { for (const handle of charts.values()) handle.resize(); },
    dispose() { clearTimeout(poll); for (const handle of charts.values()) handle.dispose(); charts.clear(); },
    get model() { return model; },
  };
}
