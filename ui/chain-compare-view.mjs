// تب «مقایسه در زنجیره» در رصد لحظه‌ای.
//
// یک قرارداد (همان که روی نقشه و زنجیره انتخاب شده) در برابر هم‌زنجیره‌هایش:
// کارنامه و رتبه در هر سنجه، امتیاز سه گروه، لبخند تلاطم با جای این قرارداد،
// یک سنجه در طول زنجیره، جایگزین‌های بهتر و جدول کامل هم‌زنجیره‌ها.
//
// منطق در `core/chain-compare.mjs` است؛ اینجا فقط رشتهٔ HTML و نمودار. سازنده‌های
// HTML خالص‌اند تا آزمون بدون DOM بتواند بسنجدشان. رنگ فقط از توکن CSS؛ هر
// «بهتر/بدتر» متن خودش را هم دارد تا حکم فقط با رنگ گفته نشود.

import { fmt, faDigits } from './fmt.mjs';
import { mountChart, chartBase } from './chart-host.mjs';
import { makeTable } from './table.mjs';
import { historyDateLabel } from '../core/history.mjs';
import {
  PEER_MODES, PERSPECTIVES, METRIC_GROUPS, COMPARE_METRICS, VERDICT_LABELS,
  chainScorecard, peerModeOf, perspectiveOf, compareMetric,
} from '../core/chain-compare.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const kindLabel = (kind) => (kind === 'call' ? 'اختیار خرید' : kind === 'put' ? 'اختیار فروش' : '—');
const dateLabel = (value) => faDigits(historyDateLabel(value));

/** قالب هر سنجه، با واحدش. */
export function metricText(key, value) {
  const metric = compareMetric(key);
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  switch (metric?.fmt) {
    case 'rialText': return fmt.rialText(v);
    case 'int': return fmt.int(v);
    case 'pct': return `${fmt.pct(v)}٪`;
    case 'small': return fmt.small(v);
    default: return fmt.num(v);
  }
}

const rankText = (m) => (m.rank ? `${fmt.int(m.rank)} از ${fmt.int(m.known)}` : '—');
const pctText = (value) => (Number.isFinite(value) ? `${fmt.int(Math.round(value))}٪` : '—');
const toneOf = (verdict) => (verdict === 'better' ? 'gain' : verdict === 'worse' ? 'loss' : 'flat');

/** نوار صدک: پرشدگی = سهمِ هم‌زنجیره‌هایی که این قرارداد از آن‌ها بهتر است. */
function percentileBar(m) {
  if (!Number.isFinite(m.percentile)) return `<span class="cc-bar is-empty" aria-hidden="true"></span>`;
  return `<span class="cc-bar" data-tone="${toneOf(m.verdict)}" role="img" aria-label="${esc(m.dir ? `بهتر از ${pctText(m.percentile)} هم‌زنجیره‌ها` : `بالاتر از ${pctText(m.percentile)} هم‌زنجیره‌ها`)}"><i style="--pct:${Math.max(0, Math.min(100, m.percentile)).toFixed(1)}%"></i><b></b></span>`;
}

/** سرِ تب: قرارداد کانونی، گروه مقایسه و دیدگاه. */
export function compareHeadHtml(card, { mode, perspective } = {}) {
  const f = card.focus;
  const modes = PEER_MODES.map(([key, label]) => `<button type="button" data-cc-mode="${key}" aria-pressed="${key === mode}">${label}</button>`).join('');
  const sides = PERSPECTIVES.map(([key, label]) => `<button type="button" data-cc-side="${key}" aria-pressed="${key === perspective}">${label}</button>`).join('');
  return `<div class="section-head"><div><p class="eyebrow">مقایسه در زنجیره</p><h2>${esc(f.name)}</h2>
    <p class="note">${kindLabel(f.kind)} · اعمال ${fmt.money(Number(f.strike))} · سررسید ${dateLabel(f.endDate)} · ${fmt.int(Number(f.days))} روز · آخرین ${fmt.money(Number(f.last))} ریال · ${fmt.int(card.rows.length)} قرارداد در این گروه</p></div></div>
    <div class="cc-controls"><div class="decision-side-switch" role="group" aria-label="گروه مقایسه">${modes}</div>
    <div class="decision-side-switch" role="group" aria-label="دیدگاه">${sides}</div></div>`;
}

/** حکم کلی و سه گروه. */
export function compareVerdictHtml(card) {
  const o = card.overall;
  const tiles = card.groups.map((g) => `<article class="lmm-stat cc-tile" data-tone="${toneOf(g.verdict)}"><small>${esc(g.label)}</small><strong>${pctText(g.score)}</strong><span>${esc(VERDICT_LABELS[g.verdict])} · ${fmt.int(g.metrics)} سنجه</span></article>`).join('');
  const lead = Number.isFinite(o.score)
    ? `از دید «${esc(PERSPECTIVES.find(([k]) => k === card.perspective)?.[1] || '')}»، این قرارداد به‌طور میانگین از ${pctText(o.score)} هم‌زنجیره‌هایش بهتر است — رتبهٔ ${fmt.int(o.rank)} از ${fmt.int(o.of)}.`
    : 'برای این قرارداد سنجهٔ معلومی برای مقایسه نیست.';
  return `<p class="cc-lead" data-tone="${toneOf(o.verdict)}"><b>${esc(VERDICT_LABELS[o.verdict])}</b> ${lead}</p><div class="lmm-stat-grid cc-tiles">${tiles}</div>`;
}

/** جدول رتبه‌بندی، گروه به گروه. */
export function compareRankHtml(card) {
  const sections = METRIC_GROUPS.map(([id, label]) => {
    const rows = card.metrics.filter((m) => m.group === id).map((m) => `<tr data-tone="${toneOf(m.verdict)}">
      <th scope="row">${esc(m.label)}</th><td class="n">${metricText(m.key, m.value)}</td><td class="n">${rankText(m)}</td>
      <td>${percentileBar(m)}</td><td>${esc(m.dir ? VERDICT_LABELS[m.verdict] : (m.verdict === 'unknown' ? VERDICT_LABELS.unknown : VERDICT_LABELS.neutral))}</td>
      <td class="n">${metricText(m.key, m.median)}</td><td>${m.best ? `${esc(m.best.name)} <small>${metricText(m.key, m.best[m.key])}</small>` : '—'}</td></tr>`).join('');
    return `<tbody><tr class="cc-group-row"><th colspan="7" scope="rowgroup">${esc(label)}</th></tr>${rows}</tbody>`;
  }).join('');
  return `<div class="history-table-wrap"><table class="history-table cc-rank-table"><thead><tr><th>سنجه</th><th>این قرارداد</th><th>رتبه</th><th>جایگاه</th><th>حکم</th><th>میانهٔ زنجیره</th><th>بهترینِ زنجیره</th></tr></thead>${sections}</table></div>
  <p class="note">رتبهٔ ۱ یعنی بهترین در جهت دیدگاه انتخابی (برای سنجه‌های خنثی، بزرگ‌ترین). «جایگاه» سهمِ هم‌زنجیره‌هایی است که این قرارداد از آن‌ها بهتر است. سنجهٔ نامعلوم رتبه نمی‌گیرد و صفر شمرده نمی‌شود.</p>`;
}

/** جایگزین‌های بهتر با همین دیدگاه، هر کدام با دلیل. */
export function compareAltHtml(card) {
  if (!card.alternatives.length) {
    return `<p class="empty-note">با این دیدگاه، هیچ قراردادی از این گروه امتیاز کلیِ بالاتری ندارد.</p>`;
  }
  return `<div class="cc-alts">${card.alternatives.map((a) => `<article class="cc-alt">
    <header><button type="button" data-cc-pick="${esc(a.row.ins)}"><b>${esc(a.row.name)}</b></button><strong>${pctText(a.score)}</strong></header>
    <small>${kindLabel(a.row.kind)} · اعمال ${fmt.money(Number(a.row.strike))} · ${dateLabel(a.row.endDate)}</small>
    <p><span class="gain">بهتر در:</span> ${a.betterIn.map((d) => esc(d.label)).join('، ') || '—'}</p>
    <p><span class="loss">بدتر در:</span> ${a.worseIn.map((d) => esc(d.label)).join('، ') || '—'}</p></article>`).join('')}</div>`;
}

const PEER_COLUMNS = [
  { key: 'name', label: 'قرارداد', fmt: 'sym' },
  { key: 'kindLabel', label: 'نوع', fmt: 'text' },
  { key: 'strike', label: 'اعمال', fmt: 'money' },
  { key: 'expiryText', label: 'سررسید', fmt: 'text' },
  { key: 'score', label: 'امتیاز در زنجیره ٪', fmt: 'pct', heat: 'gain' },
  { key: 'last', label: 'آخرین (ریال)', fmt: 'money' },
  { key: 'value', label: 'ارزش معامله (میلیون ریال)', fmt: 'mrial', heat: 'gain' },
  { key: 'volume', label: 'حجم (قرارداد)', fmt: 'int' },
  { key: 'oi', label: 'موقعیت باز (قرارداد)', fmt: 'int' },
  { key: 'spreadPct', label: 'فاصلهٔ مظنه ٪', fmt: 'pct' },
  { key: 'ivMidPct', label: 'IV میانه ٪', fmt: 'pct' },
  { key: 'ivResidualPct', label: 'فاصله از لبخند', fmt: 'num' },
  { key: 'probItmPct', label: 'احتمال در سود ٪', fmt: 'pct' },
  { key: 'breakevenGapPct', label: 'فاصله تا سربه‌سر ٪', fmt: 'pct' },
];

/**
 * سوارکردن تب.
 *
 * `getUniverse` و `getSelection` از داشبورد؛ `pick(row)` انتخاب را در همان
 * نقشه عوض می‌کند (یک منبع انتخاب، نه دو). `params` فرض‌های یونانی.
 */
export function mountChainCompare(host, { getUniverse, getSelection, pick, params = () => ({}) } = {}) {
  const load = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* فقط همین نشست */ } };
  let mode = peerModeOf(load('options-radar:cc-mode', 'expiry-kind'));
  let perspective = perspectiveOf(load('options-radar:cc-side', 'buy'));
  let chartMetric = compareMetric(load('options-radar:cc-metric', 'value')) ? load('options-radar:cc-metric', 'value') : 'value';
  let smileHandle = null, metricHandle = null, table = null;

  host.innerHTML = `<section class="card cc-card" data-cc-head></section>
    <section class="card cc-card" data-cc-verdict></section>
    <section class="card cc-card"><div class="section-head"><h3>رتبه‌بندی در زنجیره</h3><span>ارزش، حجم، موقعیت باز، خوش‌معاملگی، گرانی و ریسک</span></div><div data-cc-rank></div></section>
    <section class="card cc-card"><div class="section-head"><h3>لبخند تلاطم و جای این قرارداد</h3><span>IV هر قرارداد هم‌سررسید و هم‌نوع در برابر اعمال؛ خط، منحنیِ برازش‌شده</span></div><div class="cc-chart" data-cc-smile></div><p class="note">بالای خط یعنی نسبت به همسایه‌هایش گران (به نفع فروشنده)، زیر خط یعنی ارزان (به نفع خریدار).</p></section>
    <section class="card cc-card"><div class="section-head"><h3>یک سنجه در طول زنجیره</h3><label class="cc-metric-pick">سنجه <select data-cc-metric>${COMPARE_METRICS.map((m) => `<option value="${m.key}"${m.key === chartMetric ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label></div><div class="cc-chart" data-cc-bars></div></section>
    <section class="card cc-card"><div class="section-head"><h3>جایگزین‌های بهتر در همین زنجیره</h3><span>امتیاز کلیِ بالاتر با همین دیدگاه</span></div><div data-cc-alts></div></section>
    <section class="card cc-card"><div class="section-head"><h3>همهٔ هم‌زنجیره‌ها</h3><span>ردیف پررنگ همین قرارداد است؛ کلیک روی هر ردیف، آن را کانون می‌کند</span></div><div data-cc-table></div></section>`;
  const q = (sel) => host.querySelector(sel);

  host.addEventListener('click', (event) => {
    const m = event.target.closest('[data-cc-mode]');
    if (m) { mode = peerModeOf(m.dataset.ccMode); save('options-radar:cc-mode', mode); paint(); return; }
    const s = event.target.closest('[data-cc-side]');
    if (s) { perspective = perspectiveOf(s.dataset.ccSide); save('options-radar:cc-side', perspective); paint(); return; }
    const p = event.target.closest('[data-cc-pick]');
    if (p) choose(p.dataset.ccPick);
  });
  host.addEventListener('change', (event) => {
    if (event.target.matches('[data-cc-metric]')) {
      chartMetric = event.target.value; save('options-radar:cc-metric', chartMetric); paint();
    } else if (event.target.matches('[data-cc-choose]') && event.target.value) choose(event.target.value);
  });

  function choose(ins) {
    const row = (getUniverse()?.contracts || []).find((item) => String(item.ins) === String(ins));
    if (row) pick?.(row);
  }

  function empty(message, options = '') {
    q('[data-cc-head]').innerHTML = `<div class="section-head"><div><p class="eyebrow">مقایسه در زنجیره</p><h2>یک قرارداد انتخاب کن</h2></div></div><p class="empty-note">${message}</p>${options}`;
    for (const sel of ['[data-cc-verdict]', '[data-cc-rank]', '[data-cc-alts]']) q(sel).innerHTML = '';
    smileHandle?.dispose(); smileHandle = null; metricHandle?.dispose(); metricHandle = null;
    q('[data-cc-smile]').innerHTML = ''; q('[data-cc-bars]').innerHTML = '';
    table?.set([]);
  }

  function paint() {
    const universe = getUniverse() || {};
    const sel = getSelection() || {};
    const contracts = universe.contracts || [];
    if (!sel.contractIns) {
      const list = contracts.filter((row) => String(row.uaIns) === String(sel.uaIns) && (!sel.endDate || String(row.endDate) === String(sel.endDate)))
        .sort((a, b) => Number(a.strike) - Number(b.strike));
      const options = list.length
        ? `<label class="cc-metric-pick">قرارداد <select data-cc-choose><option value="">انتخاب…</option>${list.map((row) => `<option value="${esc(row.ins)}">${esc(row.name)} · ${kindLabel(row.kind)} · اعمال ${fmt.money(Number(row.strike))}</option>`).join('')}</select></label>`
        : '';
      empty(sel.uaIns ? 'از فهرست زیر، یا روی زنجیرهٔ تب «نقشه و زنجیره»، قراردادی را انتخاب کن تا با هم‌زنجیره‌هایش سنجیده شود.' : 'اول در تب «نقشه و زنجیره» یک نماد پایه و سررسید انتخاب کن.', options);
      return;
    }
    const card = chainScorecard(contracts, sel.contractIns, { mode, perspective, params: params() });
    if (!card.ok) { empty(card.why); return; }
    q('[data-cc-head]').innerHTML = compareHeadHtml(card, { mode, perspective });
    q('[data-cc-verdict]').innerHTML = compareVerdictHtml(card);
    q('[data-cc-rank]').innerHTML = compareRankHtml(card);
    q('[data-cc-alts]').innerHTML = compareAltHtml(card);
    paintSmile(card); paintBars(card);
    if (!table) {
      table = makeTable(q('[data-cc-table]'), PEER_COLUMNS, {
        all: PEER_COLUMNS, storeKey: 'dashboard:chain-compare', exportName: 'chain-compare', sortKey: 'strike',
        onPick: (row) => choose(row.ins),
      });
      table.setEmptyMessage('هم‌زنجیره‌ای در عکس بازار نیست.');
    }
    table.set(card.rows.map((row) => ({
      ...row, kindLabel: kindLabel(row.kind), expiryText: dateLabel(row.endDate),
      score: card.scores[String(row.ins)], __focus: String(row.ins) === String(card.focus.ins),
    })));
  }

  async function paintSmile(card) {
    const sameChain = card.rows.filter((row) => String(row.endDate) === String(card.focus.endDate) && row.kind === card.focus.kind);
    const pts = sameChain.filter((row) => Number.isFinite(row.smileIvPct));
    const smileHost = q('[data-cc-smile]');
    if (pts.length < 2) {
      smileHandle?.dispose(); smileHandle = null;
      smileHost.innerHTML = '<p class="empty-note">برای لبخند تلاطم دست‌کم دو قرارداد هم‌سررسید با IV معلوم لازم است.</p>';
      return;
    }
    const curve = sameChain.filter((row) => Number.isFinite(row.ivFitPct)).map((row) => [Number(row.strike), row.ivFitPct]);
    const focusIns = String(card.focus.ins);
    const build = (_e, tokens) => ({
      ...chartBase(tokens),
      grid: { left: 56, right: 24, top: 44, bottom: 52 },
      tooltip: {
        trigger: 'item', confine: true,
        formatter: ({ data }) => (data?.row ? `<b>${esc(data.row.name)}</b><br>اعمال ${fmt.money(Number(data.row.strike))}<br>IV ${fmt.pct(data.row.smileIvPct)}٪ · منحنی ${fmt.pct(data.row.ivFitPct)}٪<br>فاصله از لبخند ${fmt.num(data.row.ivResidualPct)}` : ''),
      },
      xAxis: { type: 'value', scale: true, name: 'قیمت اعمال (ریال)', nameLocation: 'middle', nameGap: 32, axisLabel: { color: tokens.muted, formatter: (v) => fmt.money(v) }, splitLine: { show: false }, axisLine: { lineStyle: { color: tokens.line } } },
      yAxis: { type: 'value', scale: true, name: 'IV ٪', axisLabel: { color: tokens.muted, formatter: (v) => fmt.pct(v) }, splitLine: { lineStyle: { color: tokens.line, opacity: 0.5 } } },
      series: [
        { type: 'line', name: 'منحنی برازش', data: curve, showSymbol: false, smooth: true, lineStyle: { width: 2, color: tokens.muted, type: 'dashed' }, silent: true },
        { type: 'scatter', name: 'هم‌زنجیره‌ها', symbolSize: 9, itemStyle: { color: tokens.muted, borderColor: tokens.panel, borderWidth: 2 },
          data: pts.filter((row) => String(row.ins) !== focusIns).map((row) => ({ value: [Number(row.strike), row.smileIvPct], row })) },
        { type: 'scatter', name: 'این قرارداد', symbolSize: 16, itemStyle: { color: tokens.accent, borderColor: tokens.panel, borderWidth: 2 },
          label: { show: true, position: 'top', color: tokens.ink, formatter: () => card.focus.name },
          data: pts.filter((row) => String(row.ins) === focusIns).map((row) => ({ value: [Number(row.strike), row.smileIvPct], row })) },
      ],
      legend: { top: 0, right: 8, textStyle: { color: tokens.ink }, data: ['این قرارداد', 'هم‌زنجیره‌ها', 'منحنی برازش'] },
    });
    if (smileHandle) smileHandle.update(build);
    else smileHandle = await mountChart(smileHost, build, { onClick: (event) => event?.data?.row && choose(event.data.row.ins) });
  }

  async function paintBars(card) {
    const key = chartMetric;
    const metric = compareMetric(key);
    const rows = card.rows.filter((row) => Number.isFinite(Number(row[key])));
    const barsHost = q('[data-cc-bars]');
    if (!rows.length) {
      metricHandle?.dispose(); metricHandle = null;
      barsHost.innerHTML = `<p class="empty-note">«${esc(metric.label)}» برای هیچ قرارداد این گروه معلوم نیست.</p>`;
      return;
    }
    const focusIns = String(card.focus.ins);
    const med = card.metrics.find((m) => m.key === key)?.median;
    const scale = metric.fmt === 'rialText' ? 1e6 : 1;
    const build = (_e, tokens) => ({
      ...chartBase(tokens),
      grid: { left: 64, right: 56, top: 36, bottom: 72 },
      tooltip: { trigger: 'item', confine: true, formatter: ({ data }) => (data?.row ? `<b>${esc(data.row.name)}</b><br>${esc(metric.label)}: ${metricText(key, data.row[key])}` : '') },
      xAxis: { type: 'category', data: rows.map((row) => row.name), axisLabel: { color: tokens.muted, rotate: 45, formatter: (v) => faDigits(v) }, axisLine: { lineStyle: { color: tokens.line } } },
      yAxis: { type: 'value', name: scale > 1 ? `${metric.label} (میلیون ریال)` : metric.label, axisLabel: { color: tokens.muted, formatter: (v) => (scale > 1 ? fmt.mrial(v * scale) : fmt.num(v)) }, splitLine: { lineStyle: { color: tokens.line, opacity: 0.5 } } },
      series: [{
        type: 'bar', barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: rows.map((row) => ({
          value: Number(row[key]) / scale, row,
          itemStyle: { color: String(row.ins) === focusIns ? tokens.accent : tokens.muted, opacity: String(row.ins) === focusIns ? 1 : 0.55 },
        })),
        markLine: Number.isFinite(med) ? { symbol: 'none', silent: true, lineStyle: { color: tokens.ink, type: 'dashed', width: 1 }, label: { color: tokens.ink, formatter: 'میانه', position: 'insideEndTop' }, data: [{ yAxis: med / scale }] } : undefined,
      }],
    });
    if (metricHandle) metricHandle.update(build);
    else metricHandle = await mountChart(barsHost, build, { onClick: (event) => event?.data?.row && choose(event.data.row.ins) });
  }

  return {
    paint,
    dispose() { smileHandle?.dispose(); metricHandle?.dispose(); },
  };
}
