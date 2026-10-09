// زیرتبِ «تصویر شفاف» در رصد لحظه‌ای بازار (۱۴۰۵/۰۷/۱۷).
//
// از کل به جزء، در یک صفحه: کاشی‌های عدد → کال و پوت در هر سنجه → جهت
// قراردادها و مسیرش در طول روز → سهم هر جزء (نماد، سررسید یا قیمت اعمال)
// → «ترین»ها → ارزش کجا متمرکز است → جدول کامل. دامنه همان نوار سطحِ بالای
// داشبورد است (کل بازار، نماد پایه، سررسید، قرارداد) و هر جزء با یک کلیک
// دامنه را یک پله پایین می‌برد.
//
// عددها همه از `core/clear-picture.mjs` می‌آیند؛ اینجا فقط رسم است.

import { fmt, faDigits } from '/ui/fmt.mjs';
import { makeTable } from '/ui/table.mjs';
import { paintInto } from '/ui/morph.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { breadthDonut, liveChart } from '/ui/tabs/live-market.mjs';
import { clearPicture, contractStanding, sampleKey, LEADER_LISTS } from '/core/clear-picture.mjs';
import { pctVsYesterday } from '/core/price-change.mjs';
import { logError } from '/ui/errlog.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const dateLabel = (value) => faDigits(historyDateLabel(value));
const pctText = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
const toneOf = (value) => (Number(value) > 0 ? 'gain' : Number(value) < 0 ? 'loss' : '');
const kindLabel = (kind) => (kind === 'put' ? 'پوت' : 'کال');
const LEVEL_LABEL = { market: 'کل بازار', underlying: 'نماد پایه', expiry: 'سررسید', contract: 'قرارداد' };
const PART_LABEL = { underlying: 'نماد پایه', expiry: 'سررسید', strike: 'قیمت اعمال' };
const PARTS_SHOWN = 14;
// مسیر روز هر نیم دقیقه یک بار پرسیده می‌شود؛ سرور هر دقیقه یک نمونه دارد.
const SERIES_TTL_MS = 30_000;

const stat = (label, value, note = '', tone = '') => `<article class="lmm-stat ${tone}"><small>${esc(label)}</small><strong>${value}</strong>${note ? `<span>${esc(note)}</span>` : ''}</article>`;

const partName = (part) => (part.level === 'underlying' ? part.uaName || '—'
  : part.level === 'expiry' ? `${part.uaName || ''} — ${dateLabel(part.endDate)}`
    : `اعمال ${fmt.money(part.strike)}`);

/** میلهٔ دوتکهٔ کال/پوت؛ پهنا نسبت به `max` (برای مقایسهٔ اجزا) یا ۱۰۰٪. */
function splitBar(call, put, max) {
  const total = (Number(call) || 0) + (Number(put) || 0);
  const scale = max > 0 ? max : total;
  if (!(scale > 0)) return '<div class="cp-bar"><i class="empty" style="--w:100%"></i></div>';
  return `<div class="cp-bar"><i class="call" style="--w:${((Number(call) || 0) / scale) * 100}%"></i><i class="put" style="--w:${((Number(put) || 0) / scale) * 100}%"></i></div>`;
}

// ستون‌های جدولِ اجزا؛ ستونِ نام با سطح عوض می‌شود.
const col = (key, label, fmtName, opt = {}) => ({ key, label, fmt: fmtName, ...opt });
const partCols = (partLevel) => [
  col('title', PART_LABEL[partLevel] || 'جزء', 'text', { group: 'شناسه', base: true }),
  col('sharePct', 'سهم از ارزش دامنه ٪', 'pct', { group: 'ارزش', base: true, heat: 'gain' }),
  col('value', 'ارزش کل (میلیون ریال)', 'mrial', { group: 'ارزش', base: true, heat: 'gain' }),
  col('callValue', 'ارزش کال (میلیون ریال)', 'mrial', { group: 'ارزش', base: true }),
  col('callValuePct', 'سهم کال از ارزش ٪', 'pct', { group: 'ارزش', base: true }),
  col('putValue', 'ارزش پوت (میلیون ریال)', 'mrial', { group: 'ارزش', base: true }),
  col('putValuePct', 'سهم پوت از ارزش ٪', 'pct', { group: 'ارزش', base: true }),
  col('putCallValue', 'نسبت ارزش پوت به کال', 'num', { group: 'ارزش' }),
  col('volume', 'حجم', 'int', { group: 'گردش', base: true }),
  col('callVolumePct', 'سهم کال از حجم ٪', 'pct', { group: 'گردش' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش', base: true }),
  col('avgTradeValue', 'میانگین ارزش هر معامله (میلیون ریال)', 'mrial', { group: 'گردش' }),
  col('contracts', 'قرارداد', 'int', { group: 'اندازه' }),
  col('traded', 'قرارداد معامله‌شده', 'int', { group: 'اندازه', base: true }),
  col('tradedPct', 'معامله‌شده ٪', 'pct', { group: 'اندازه' }),
  col('positivePct', 'مثبت ٪', 'pct', { group: 'جهت', base: true, heat: 'gain' }),
  col('negativePct', 'منفی ٪', 'pct', { group: 'جهت', base: true, heat: 'loss' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته' }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', heat: 'gain', sign: true }),
];

/** ثانیهٔ روز از ساعتِ `HHMMSS`. */
const secondOf = (time) => {
  const raw = String(Math.trunc(Number(time) || 0)).padStart(6, '0');
  return Number(raw.slice(0, 2)) * 3600 + Number(raw.slice(2, 4)) * 60 + Number(raw.slice(4, 6));
};
const clockOf = (second) => faDigits(`${String(Math.floor(second / 3600)).padStart(2, '0')}:${String(Math.floor((second % 3600) / 60)).padStart(2, '0')}`);

/**
 * @param {HTMLElement} host
 * @param {object} deps
 *   getScope()        دامنهٔ حل‌شده `{ level, uaIns, endDate, contractIns }`
 *   rowsAt(level)     قراردادهای همان انتخاب در سطح خواسته
 *   underlyingsAt()   ردیف نمادهای پایهٔ دامنه (برای ارزش خودِ پایه)
 *   getTape()         ریزمعاملهٔ قرارداد انتخابی (فقط در سطح قرارداد)
 *   pickUnderlying / pickExpiry / pickContract / setLevel
 *   isVisible()
 */
export function mountClearPicture(host, deps) {
  host.innerHTML = `<div class="cp">
    <header class="cp-head"><div><p class="eyebrow">تصویر شفاف بازار — از کل به جزء</p><h2 data-cp-title>کل بازار</h2></div><nav class="cp-crumbs" data-cp-crumbs aria-label="مسیر دامنه"></nav></header>
    <section class="card cp-section"><h3 data-cp-kpi-title>عددهای اصلی</h3><div class="lmm-stat-grid cp-kpis" data-cp-kpis></div><p class="note" data-cp-kpi-note></p></section>
    <div class="cp-grid">
      <section class="card cp-section"><h3>کال و پوت در هر سنجه</h3><div class="cp-split" data-chart-image data-cp-sides></div></section>
      <section class="card cp-section"><h3 data-cp-breadth-title>جهت قراردادها نسبت به پایانی دیروز</h3><div data-cp-breadth></div></section>
    </div>
    <div class="cp-grid">
      <section class="card cp-section"><h3 data-cp-line1-title>درصد قراردادهای مثبت و منفی در طول روز</h3><div data-cp-line1></div></section>
      <section class="card cp-section"><h3 data-cp-line2-title>ارزش کال و پوت در طول روز</h3><div data-cp-line2></div></section>
    </div>
    <section class="card cp-section"><div class="section-head"><h3 data-cp-parts-title>سهم هر نماد پایه</h3><span data-cp-parts-note></span></div><div class="cp-parts" data-chart-image data-cp-parts></div></section>
    <section class="card cp-section"><h3>ترین‌ها در یک نگاه</h3><div class="cp-leaders" data-cp-leaders></div></section>
    <div class="cp-grid three">
      <section class="card cp-section"><h3>تمرکز ارزش</h3><div class="lmm-stat-grid compact cp-conc" data-cp-conc></div></section>
      <section class="card cp-section"><h3>ارزش روی فاصله از پول</h3><div class="cp-split" data-chart-image data-cp-money></div></section>
      <section class="card cp-section"><h3>ارزش روی روزِ مانده تا سررسید</h3><div class="cp-split" data-chart-image data-cp-tenor></div></section>
    </div>
    <section class="card cp-section"><h3 data-cp-table-title>جدول کامل اجزا</h3><div data-cp-table></div></section>
  </div>`;
  const $ = (name) => host.querySelector(`[data-cp-${name}]`);
  const tables = new Map();
  let series = { key: '', at: 0, points: [], error: '' }, seriesSig = { 1: '', 2: '' };
  let lastPicture = null;

  function tableFor(partLevel) {
    let entry = tables.get(partLevel);
    if (!entry) {
      const el = document.createElement('div');
      const cols = partCols(partLevel);
      entry = { el, table: makeTable(el, cols.filter((c) => c.base), {
        all: cols, storeKey: `clear-picture:${partLevel}`, exportName: `clear-picture-${partLevel}`,
        onPick: (row) => drill(row),
      }) };
      entry.table.sortBy('value');
      tables.set(partLevel, entry);
    }
    const slot = $('table');
    for (const child of [...slot.children]) if (child !== entry.el) child.remove();
    if (entry.el.parentElement !== slot) slot.appendChild(entry.el);
    return entry.table;
  }

  // یک پله پایین‌تر: نماد → سررسید → قرارداد. قیمت اعمال قرارداد نیست؛
  // کلیک رویش کال (یا اگر نبود پوتِ) همان اعمال را برمی‌گزیند.
  function drill(part) {
    if (!part) return;
    if (part.level === 'underlying') deps.pickUnderlying?.(part.uaIns);
    else if (part.level === 'expiry') deps.pickExpiry?.(part.uaIns, part.endDate);
    else if (part.level === 'strike') {
      const rows = deps.rowsAt('expiry').filter((row) => Number(row.strike) === Number(part.strike));
      const row = rows.find((r) => r.kind === 'call') || rows[0];
      if (row) deps.pickContract?.(row);
    }
  }

  host.addEventListener('click', (event) => {
    const crumb = event.target.closest('[data-cp-level]');
    if (crumb) { deps.setLevel?.(crumb.dataset.cpLevel); return; }
    const part = event.target.closest('[data-cp-part]');
    if (part && lastPicture) { drill(lastPicture.parts.find((p) => p.key === part.dataset.cpPart)); return; }
    const pick = event.target.closest('[data-cp-ins]');
    if (pick) {
      const row = deps.rowsAt('market').find((r) => String(r.ins) === pick.dataset.cpIns);
      if (row) deps.pickContract?.(row);
    }
  });

  async function fetchSeries(key) {
    if (series.key === key && Date.now() - series.at < SERIES_TTL_MS) return;
    try {
      const response = await fetch(`/api/live-picture?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
      // `NaN`ِ سرور پس از JSON `null` است؛ همین‌جا به نامعلوم برمی‌گردد.
      const n = (v) => (v === null || v === undefined ? NaN : Number(v));
      series = { key, at: Date.now(), error: '', points: (body.points || []).map((p) => ({
        second: n(p.second), positivePct: n(p.positivePct), negativePct: n(p.negativePct),
        callValue: n(p.callValue), putValue: n(p.putValue), value: n(p.value),
      })) };
    } catch (error) {
      series = { key, at: Date.now(), points: [], error: error.message };
      logError('مسیر روز تصویر شفاف', error);
    }
  }

  // نمودار خطی فقط وقتی دوباره کشیده می‌شود که نقطه‌اش عوض شده باشد؛ تیکِ
  // بی‌نقطهٔ تازه چیزی را جابه‌جا نمی‌کند.
  function paintLine(which, sig, paint) {
    if (seriesSig[which] === sig && host.querySelector(`[data-cp-line${which}] svg, [data-cp-line${which}] .empty-note`)) return;
    seriesSig[which] = sig;
    paint($(`line${which}`));
  }

  function paintCrumbs(scope, rows) {
    const any = rows[0] || {};
    const steps = [['market', 'کل بازار']];
    if (scope.level !== 'market') steps.push(['underlying', any.uaName || 'نماد پایه']);
    if (scope.level === 'expiry' || scope.level === 'contract') steps.push(['expiry', `سررسید ${dateLabel(scope.endDate)}`]);
    if (scope.level === 'contract') steps.push(['contract', deps.rowsAt('contract')[0]?.name || 'قرارداد']);
    paintInto($('crumbs'), (into) => {
      into.innerHTML = steps.map(([level, label], i) => (i === steps.length - 1
        ? `<b aria-current="true">${esc(label)}</b>`
        : `<button type="button" class="ghost" data-cp-level="${level}">${esc(label)}</button><span aria-hidden="true">›</span>`)).join('');
    });
    $('title').textContent = steps.at(-1)[1];
  }

  function paintKpis(scope, picture, rows) {
    const t = picture.totals;
    if (scope.level === 'contract') {
      const c = deps.rowsAt('contract')[0];
      const standing = contractStanding(c, { siblings: deps.rowsAt('expiry'), family: deps.rowsAt('underlying') });
      const move = c ? pctVsYesterday(Number(c.tradeLast) > 0 ? c.tradeLast : c.last, c.yday) : NaN;
      $('kpi-title').textContent = 'عددهای اصلیِ قرارداد';
      paintInto($('kpis'), (into) => {
        into.innerHTML = c ? [
          stat('آخرین معامله', fmt.money(c.tradeLast), Number.isFinite(move) ? `${pctText(move)} نسبت به پایانی دیروز` : 'امروز معامله نشده', toneOf(move)),
          stat('ارزش معامله', fmt.rialText(c.value), `${kindLabel(c.kind)}، اعمال ${fmt.money(c.strike)}`),
          stat('حجم', fmt.int(c.volume), `${fmt.int(c.trades)} معامله`),
          stat('میانگین ارزش هر معامله', fmt.rialText(Number(c.trades) > 0 ? Number(c.value) / Number(c.trades) : NaN)),
          stat('سهم از ارزش سررسید', pctText(standing.expirySharePct), Number.isFinite(standing.rank) ? `رتبهٔ ${fmt.int(standing.rank)} از ${fmt.int(standing.rankOf)} قرارداد معامله‌شده` : 'بی معامله امروز'),
          stat('سهم از ارزش نماد پایه', pctText(standing.familySharePct), 'همهٔ سررسیدهای همین پایه'),
          stat('موقعیت باز', fmt.int(c.oi), Number.isFinite(Number(c.oiChange)) ? `تغییر ${fmt.int(c.oiChange)}` : 'تغییر نامعلوم', toneOf(c.oiChange)),
          stat('روز مانده', fmt.int(c.days), `سررسید ${dateLabel(c.endDate)}`),
        ].join('') : '<p class="empty-note">قرارداد انتخابی در عکس تازه نیست.</p>';
      });
      $('kpi-note').textContent = 'بخش‌های پایین، همان سررسیدِ این قرارداد را از کل به جزء نشان می‌دهند.';
      return;
    }
    // ارزشِ خودِ پایه از نوارِ پایه می‌آید؛ بی هیچ عددِ رسیده، نامعلوم است نه صفر.
    const uaKnown = (deps.underlyingsAt() || []).map((row) => Number(row.uaValue)).filter(Number.isFinite);
    const uaValue = uaKnown.length ? uaKnown.reduce((sum, v) => sum + v, 0) : NaN;
    const withUa = scope.level === 'market' || scope.level === 'underlying';
    $('kpi-title').textContent = `عددهای اصلیِ ${LEVEL_LABEL[scope.level]}`;
    paintInto($('kpis'), (into) => {
      into.innerHTML = [
        stat('ارزش کل معاملات اختیار', fmt.rialText(t.value), `${fmt.int(t.traded)} از ${fmt.int(t.contracts)} قرارداد معامله شد`),
        stat('ارزش کال', fmt.rialText(t.callValue), `سهم ${pctText(t.callValuePct)} از کل`),
        stat('ارزش پوت', fmt.rialText(t.putValue), `سهم ${pctText(t.putValuePct)} از کل`),
        stat('نسبت ارزش پوت به کال', fmt.num(t.putCallValue), t.putCallValue > 1 ? 'پول بیشتری در پوت' : Number.isFinite(t.putCallValue) ? 'پول بیشتری در کال' : ''),
        stat('حجم (قرارداد)', fmt.int(t.volume), `کال ${pctText(t.callVolumePct)}، پوت ${pctText(t.putVolumePct)}`),
        stat('تعداد معامله', fmt.int(t.trades), `میانگین هر معامله ${fmt.rialText(t.avgTradeValue)}`),
        stat('قراردادهای مثبت', pctText(t.positivePct), `${fmt.int(t.positive)} قرارداد`, 'gain'),
        stat('قراردادهای منفی', pctText(t.negativePct), `${fmt.int(t.negative)} قرارداد`, 'loss'),
        stat('موقعیت باز', fmt.int(t.oi), Number.isFinite(t.oiChange) ? `تغییر امروز ${fmt.int(t.oiChange)}` : 'تغییر نامعلوم', toneOf(t.oiChange)),
        ...(withUa ? [stat('ارزش معاملات سهم پایه', fmt.rialText(uaValue), uaValue > 0 ? `اختیار ${pctText((t.value / uaValue) * 100)} ارزش خودِ پایه` : '')] : []),
      ].join('');
    });
    const gaps = [t.missingValue ? `ارزش ${fmt.int(t.missingValue)} قرارداد از تابلو نرسید و در جمع نیست` : '',
      t.unknown ? `جهت ${fmt.int(t.unknown)} قرارداد معامله‌شده نامعلوم است (پایانی دیروز نرسید)` : ''].filter(Boolean);
    $('kpi-note').textContent = gaps.length ? `${gaps.join('؛ ')}.` : 'درصد مثبت و منفی فقط از قراردادهای امروز معامله‌شده است؛ بی‌معامله‌ها جدا شمرده می‌شوند.';
  }

  function paintSides(t) {
    const rowsOf = [
      ['ارزش معامله', t.callValue, t.putValue, fmt.rialText],
      ['حجم', t.callVolume, t.putVolume, fmt.int],
      ['تعداد معامله', t.callTrades, t.putTrades, fmt.int],
      ['موقعیت باز', t.callOi, t.putOi, fmt.int],
    ];
    paintInto($('sides'), (into) => {
      into.innerHTML = `<p class="cp-legend"><span class="call">کال</span><span class="put">پوت</span></p>${rowsOf.map(([label, call, put, f]) => {
        const total = (Number(call) || 0) + (Number(put) || 0);
        const share = (v) => (total > 0 ? `${fmt.pct((v / total) * 100)}٪` : '—');
        return `<article><header><b>${label}</b><span>کل ${f(total)}</span></header>${splitBar(call, put, 0)}<footer><span class="call">کال ${share(call)}، ${f(call)}</span><span class="put">پوت ${share(put)}، ${f(put)}</span></footer></article>`;
      }).join('')}`;
    });
  }

  function paintBreadth(t) {
    paintInto($('breadth'), (into) => breadthDonut(into, {
      positive: t.positive, negative: t.negative, flat: t.flat, traded: t.positive + t.negative + t.flat, untraded: t.untraded,
      positivePct: t.positivePct, negativePct: t.negativePct, flatPct: t.flatPct,
    }, { unit: 'قرارداد' }));
  }

  async function paintLines(scope) {
    if (scope.level === 'contract') {
      const tape = (deps.getTape() || []).filter((row) => Number(row.price) > 0);
      $('line1-title').textContent = 'قیمت معاملات قرارداد در طول روز';
      $('line2-title').textContent = 'ارزش تجمعی معاملات قرارداد';
      const sig = `${scope.contractIns}|${tape.length}|${tape.at(-1)?.time || ''}`;
      const empty = (slot) => { slot.innerHTML = '<p class="empty-note">برای این قرارداد امروز ریزمعاملهٔ معتبری نرسیده است.</p>'; };
      paintLine(1, sig, (slot) => (tape.length
        ? liveChart(slot, [{ label: 'قیمت معامله', color: 'var(--series-1)', points: tape.map((row) => ({ second: secondOf(row.time), value: Number(row.price) })) }],
          { valueFmt: fmt.money, unit: 'قیمت (ریال)', note: 'هر نقطه یک معاملهٔ واقعیِ امروز.' })
        : empty(slot)));
      paintLine(2, sig, (slot) => (tape.length
        ? liveChart(slot, [{ label: 'ارزش تجمعی', color: 'var(--series-1)', points: tape.map((row) => ({ second: secondOf(row.time), value: Number(row.cumulativeValue) })) }],
          { valueFmt: fmt.mrial, unit: 'میلیون ریال', zeroFloor: true, note: 'جمعِ ارزش معاملات از نخستین معاملهٔ امروز.' })
        : empty(slot)));
      return;
    }
    $('line1-title').textContent = 'درصد قراردادهای مثبت و منفی در طول روز';
    $('line2-title').textContent = 'ارزش تجمعی کال و پوت در طول روز';
    const key = sampleKey(scope);
    await fetchSeries(key);
    const points = series.key === key ? series.points : [];
    const first = points[0]?.second;
    const since = Number.isFinite(first) ? `ثبت از ساعت ${clockOf(first)}؛ دقیقه‌ای که سرور روشن نبود خالی می‌ماند.` : '';
    const sig = `${key}|${points.length}|${points.at(-1)?.second || ''}|${series.error}`;
    const empty = (slot) => {
      slot.innerHTML = `<p class="empty-note">${series.error ? `مسیر روز نرسید: ${esc(series.error)}` : 'هنوز نمونه‌ای از جلسهٔ امروز ثبت نشده است. سرور در ساعت بازار هر دقیقه یک نمونه از تابلو برمی‌دارد.'}</p>`;
    };
    paintLine(1, sig, (slot) => (points.length
      ? liveChart(slot, [
        { label: 'مثبت', color: 'var(--gain)', points: points.map((p) => ({ second: p.second, value: p.positivePct })) },
        { label: 'منفی', color: 'var(--loss)', points: points.map((p) => ({ second: p.second, value: p.negativePct })) },
      ], { valueFmt: fmt.pct, unit: 'درصد قراردادهای معامله‌شده', note: since })
      : empty(slot)));
    paintLine(2, sig, (slot) => (points.length
      ? liveChart(slot, [
        { label: 'ارزش کال', color: 'var(--call)', points: points.map((p) => ({ second: p.second, value: p.callValue })) },
        { label: 'ارزش پوت', color: 'var(--put)', points: points.map((p) => ({ second: p.second, value: p.putValue })) },
      ], { valueFmt: fmt.mrial, unit: 'میلیون ریال', zeroFloor: true, note: since })
      : empty(slot)));
  }

  function paintParts(scope, picture) {
    const parts = picture.parts;
    const label = PART_LABEL[picture.partLevel];
    const title = scope.level === 'contract' ? 'قیمت‌های اعمالِ همین سررسید' : `سهم هر ${label} از ارزش ${LEVEL_LABEL[scope.level]}`;
    $('parts-title').textContent = title;
    $('parts-note').textContent = `${fmt.int(parts.length)} ${label}${parts.length > PARTS_SHOWN ? `، ${fmt.int(PARTS_SHOWN)} پرارزش‌تر نمایش داده شد؛ همه در جدول پایین` : ''}`;
    const shown = parts.slice(0, PARTS_SHOWN);
    const max = Math.max(0, ...shown.map((p) => p.value));
    const focusStrike = scope.level === 'contract' ? Number(deps.rowsAt('contract')[0]?.strike) : NaN;
    paintInto($('parts'), (into) => {
      into.innerHTML = shown.length ? `<p class="cp-legend"><span class="call">کال</span><span class="put">پوت</span><small>طول میله نسبت به بزرگ‌ترین جزء</small></p>${shown.map((part) => `<article class="${part.strike === focusStrike ? 'focus' : ''}">
        <header><button type="button" class="link" data-cp-part="${esc(part.key)}">${esc(partName(part))}</button><strong>${fmt.rialText(part.value)}</strong><span>${pctText(part.sharePct)} از کل</span></header>
        ${splitBar(part.callValue, part.putValue, max)}
        <footer><span class="call">کال ${pctText(part.callValuePct)}</span><span class="put">پوت ${pctText(part.putValuePct)}</span><span class="gain">مثبت ${pctText(part.positivePct)}</span><span class="loss">منفی ${pctText(part.negativePct)}</span><span>${fmt.int(part.traded)} از ${fmt.int(part.contracts)} قرارداد معامله‌شده</span></footer>
      </article>`).join('')}` : '<p class="empty-note">در این دامنه قراردادی نیست.</p>';
    });
    const table = tableFor(picture.partLevel);
    $('table-title').textContent = `جدول کامل — هر ${label}`;
    table.setEmptyMessage('در این دامنه قراردادی نیست.');
    table.set(parts.map((part) => ({ ...part, title: partName(part) })));
  }

  function paintLeaders(picture) {
    const metricText = (key, row) => {
      if (key === 'gainers' || key === 'losers') return `${fmt.pct(row.metric)}٪`;
      // واحد در عنوانِ کارت است تا نامِ قرارداد کنار عدد بریده نشود.
      if (key === 'value' || key === 'avgTrade') return fmt.mrial(row.metric);
      return fmt.int(row.metric);
    };
    paintInto($('leaders'), (into) => {
      into.innerHTML = LEADER_LISTS.map(([key, title]) => {
        const list = picture.leaders[key] || [];
        const unit = key === 'value' || key === 'avgTrade' ? ' (میلیون ریال)' : key === 'gainers' || key === 'losers' ? ' (٪ نسبت به پایانی دیروز)' : '';
        return `<article data-chart-image><h4>${title}${unit}</h4>${list.length ? `<ol>${list.map((row) => `<li><button type="button" class="link" data-cp-ins="${esc(row.ins)}">${esc(row.name)}</button><b class="${key === 'gainers' || key === 'oiUp' ? 'gain' : key === 'losers' || key === 'oiDown' ? 'loss' : ''}">${metricText(key, row)}</b><small>${kindLabel(row.kind)}، ${esc(row.uaName || '')}، ${dateLabel(row.endDate)}</small></li>`).join('')}</ol>` : '<p class="empty-note">موردی نیست.</p>'}</article>`;
      }).join('');
    });
  }

  function paintConcentration(picture) {
    const c = picture.concentration;
    paintInto($('conc'), (into) => {
      into.innerHTML = [
        stat('سهم پرارزش‌ترین قرارداد', pctText(c.top1Pct)),
        stat('سهم پنج قرارداد اول', pctText(c.top5Pct)),
        stat('۸۰٪ ارزش در', Number.isFinite(c.n80) ? `${fmt.int(c.n80)} قرارداد` : '—', Number.isFinite(c.n80Pct) ? `${pctText(c.n80Pct)} از ${fmt.int(c.tradedCount)} معامله‌شده` : ''),
      ].join('');
    });
    const buckets = (slot, data, unknownNote) => paintInto(slot, (into) => {
      const max = Math.max(0, ...data.buckets.map((b) => b.value));
      into.innerHTML = `${data.buckets.map((b) => `<article><header><b>${esc(b.label)}</b><span>${fmt.rialText(b.value)}، ${pctText(b.sharePct)}</span></header>${splitBar(b.callValue, b.putValue, max)}</article>`).join('')}${data.unknown ? `<p class="note">${fmt.int(data.unknown)} قرارداد ${unknownNote}</p>` : ''}`;
    });
    buckets($('money'), picture.moneyness, 'بی قیمت پایه یا اعمال، بیرون از سطل‌ها ماند.');
    buckets($('tenor'), picture.tenor, 'بی روزِ مانده، بیرون از سطل‌ها ماند.');
  }

  async function paint() {
    if (deps.isVisible && !deps.isVisible()) return;
    const scope = deps.getScope();
    // در سطح قرارداد، تصویرِ «اجزا» همان سررسیدِ قرارداد است.
    const pictureLevel = scope.level === 'contract' ? 'expiry' : scope.level;
    const rows = deps.rowsAt(pictureLevel);
    const picture = clearPicture(rows, { level: scope.level === 'contract' ? 'contract' : pictureLevel });
    lastPicture = picture;
    paintCrumbs(scope, rows);
    paintKpis(scope, picture, rows);
    paintSides(scope.level === 'contract' ? clearPicture(deps.rowsAt('contract')).totals : picture.totals);
    paintBreadth(picture.totals);
    $('breadth-title').textContent = scope.level === 'contract' ? 'جهت قراردادهای همین سررسید' : 'جهت قراردادها نسبت به پایانی دیروز';
    paintParts(scope, picture);
    paintLeaders(picture);
    paintConcentration(picture);
    await paintLines(scope);
  }

  return { paint, dispose() { tables.clear(); } };
}
