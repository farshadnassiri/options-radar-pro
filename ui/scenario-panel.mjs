// پنل سناریو، حساسیت، و ریسک عمق دفتر — برای یک ترکیب انتخاب‌شده.
//
// تب استراتژی سه عدد می‌گفت: «اگر پایه ثابت بماند»، «بیشترین سود»، «بیشترین
// زیان». آن سه، سه گوشهٔ یک فضایند نه خودِ فضا. این پنل فضا را نشان می‌دهد.
//
// محاسبه هیچ‌جای این فایل نیست؛ همه در `core/scenario.mjs` است تا بی‌نیاز از
// مرورگر آزمون شود. اینجا فقط رسم است.

import { scenarioLadder, sensitivityGrid, bookDepthRisk } from '/core/scenario.mjs';
import { fmt, faNum, faDigits, negClass } from '/ui/fmt.mjs';
import { attachExportsIn } from '/ui/export.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const ok = (v) => Number.isFinite(v);
const money = (v) => `<td class="n ${negClass(v)}">${fmt.money(v)}</td>`;

/** نام کوتاه هر پا برای سرستون. */
const legLabel = (leg, i) => {
  const kind = leg.kind === 'underlying' ? 'سهم' : leg.kind === 'call' ? 'کال' : 'پوت';
  const side = leg.side === 'sell' ? '−' : '+';
  return leg.kind === 'underlying'
    ? `${side} سهم`
    : `${side} ${kind} ${fmt.int(leg.strike)}`;
};

export function mountScenarioPanel(host, row, opt = {}) {
  if (!host || !row?.__legs?.length) return () => {};
  const legs = row.__legs;
  const base = {
    legs, spot: row.S, days: row.horizonDays ?? row.days,
    sigma: row.sigmaUse, rFree: opt.rFree, divYield: opt.divYield,
    yearDays: opt.yearDays || 365,
  };

  host.innerHTML = `
    <section class="card scen-card">
      <div class="section-head">
        <div><p class="eyebrow">اگر بازار جای دیگری برود</p><h3>سناریوها، از بدترین تا بهترین</h3></div>
        <span class="scen-note">سررسید ${fmt.int(base.days)} روز · تلاطم مبنا ${fmt.num(base.sigma)}</span>
      </div>
      <p class="note">سطح‌ها صدک‌های همان توزیعی‌اند که «احتمال سود» از آن می‌آید، نه درصدهای گرد —
         بازهٔ ثابت برای نماد کم‌تلاطم دو سرِ غیرممکن می‌سازد و برای نماد پرتلاطم وسط توزیع را جا می‌اندازد.
         ستون هر پا با جمع کل می‌خواند؛ اگر نخواند یکی از دو عدد غلط است.</p>
      <div id="scen-ladder" class="history-table-wrap"></div>
    </section>

    <section class="card scen-card">
      <div class="section-head">
        <div><p class="eyebrow">اگر فرض‌ها عوض شوند</p><h3>تحلیل حساسیت</h3></div>
        <div class="scen-controls">
          <label>محور دوم
            <select id="scen-axis">
              <option value="days">روز مانده</option>
              <option value="sigma">تلاطم</option>
              <option value="rFree">نرخ بهره</option>
            </select>
          </label>
          <label>دامنه قیمت پایه ٪
            <input id="scen-range" type="number" min="2" max="80" step="1" value="20">
          </label>
          <label>تعداد پله
            <input id="scen-steps" type="number" min="3" max="15" step="2" value="9">
          </label>
        </div>
      </div>
      <p class="note">هر خانه، سود و زیان کل ترکیب است. روی محور «روز مانده»، صفر یعنی سررسید و
         همان‌جا عمداً از ارزش‌گذاری مدل به ارزش ذاتی سوییچ می‌شود — بلک‌شولز در صفر تعریف‌نشده است
         و با زمانِ خیلی کوچک عددی می‌دهد که شبیه درست است ولی نیست.</p>
      <div id="scen-grid" class="history-table-wrap"></div>
      <div id="scen-legs" class="history-table-wrap" style="margin-top:12px"></div>
    </section>

    <section class="card scen-card">
      <div class="section-head">
        <div><p class="eyebrow">اگر بخواهی بیرون بیایی</p><h3>ریسک عمق دفتر سفارش</h3></div>
        <label class="scen-units">تعداد واحد
          <input id="scen-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, Number(opt.units) || 1)}">
        </label>
      </div>
      <p class="note">هزینهٔ <b>بستن</b> موقعیت، نه باز کردنش. بستن یعنی جهت معکوس: پای خرید به تقاضا
         می‌خورد و پای فروش به عرضه — همان سمتی که امروز به آن نگاه نمی‌کنی. پای دارایی پایه نمی‌آید،
         چون دفتر سفارش سهم در دیده‌بان اختیار نیست و «نامعلوم» با «صفر» یکی نیست.</p>
      <div id="scen-depth" class="history-table-wrap"></div>
    </section>`;


  // هر ظرف جدول، دکمهٔ خروجی خودش را می‌گیرد. ظرف‌ها در همین قالب‌اند حتی
  // وقتی خالی‌اند، و خواندن لحظهٔ کلیک انجام می‌شود — پس یک بار کافی است.
  attachExportsIn(host, 'scenario');
  const $ = (id) => host.querySelector(`#${id}`);

  // ——— نردبان سناریو ———
  function drawLadder() {
    const rows = scenarioLadder(base);
    if (!rows.length) { $('scen-ladder').innerHTML = '<p class="empty-note">برای این ترکیب سناریویی ساخته نشد.</p>'; return; }
    const heads = legs.map((l, i) => `<th>${esc(legLabel(l, i))}</th>`).join('');
    $('scen-ladder').innerHTML = `<table class="history-table"><thead><tr>
      <th>سناریو</th><th>قیمت پایه</th><th>تغییر ٪</th><th>احتمال زیر این سطح ٪</th>
      <th>سود و زیان کل</th>${heads}</tr></thead><tbody>${rows.map((r) => {
      const label = r.kind === 'spot' ? 'قیمت امروز' : `صدک ${faNum(r.pct)}`;
      return `<tr class="${r.kind === 'spot' ? 'scen-spot' : ''}">
        <td>${label}</td>
        <td class="n">${fmt.money(r.level)}</td>
        <td class="n ${negClass(r.movePct)}">${fmt.pct(r.movePct)}٪</td>
        <td class="n">${ok(r.probBelow) ? `${fmt.pct(r.probBelow * 100)}٪` : '—'}</td>
        ${money(r.pnl)}
        ${r.perLeg.map((l) => money(l.pnl)).join('')}
      </tr>`;
    }).join('')}</tbody></table>`;
  }

  // ——— جدول حساسیت ———
  function movesOf() {
    const range = Math.max(2, Math.min(80, Number($('scen-range').value) || 20));
    let steps = Math.max(3, Math.min(15, Math.trunc(Number($('scen-steps').value) || 9)));
    if (steps % 2 === 0) steps += 1;                 // فرد، تا صفر همیشه وسط بیفتد
    const half = (steps - 1) / 2;
    return Array.from({ length: steps }, (_, i) => Math.round(((i - half) / half) * range * 100) / 100);
  }

  const axisLabel = (axis, v) => (axis === 'days' ? `${fmt.int(v)} روز`
    : axis === 'sigma' ? fmt.num(v) : `${fmt.pct(v * 100)}٪`);

  function drawGrid() {
    const axis = $('scen-axis').value;
    const g = sensitivityGrid({ ...base, axis, moves: movesOf() });
    if (!g.rows.length) { $('scen-grid').innerHTML = '<p class="empty-note">جدول حساسیت ساخته نشد.</p>'; return; }
    const vals = g.rows.flatMap((r) => r.cells.map((c) => c.pnl)).filter(ok);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const shade = (v) => {
      if (!ok(v)) return '';
      const side = v >= 0 ? hi : -lo;
      if (!(side > 0)) return '';
      const t = Math.sqrt(Math.min(1, Math.abs(v) / side));
      return `--weight:${t.toFixed(3)}`;
    };
    $('scen-grid').innerHTML = `<table class="history-table scen-matrix"><thead><tr>
      <th>تغییر پایه ٪</th><th>قیمت پایه</th>
      ${g.axisValues.map((v) => `<th>${esc(axisLabel(axis, v))}</th>`).join('')}
      </tr></thead><tbody>${g.rows.map((r) => `<tr>
        <td class="n ${negClass(r.movePct)}">${fmt.pct(r.movePct)}٪</td>
        <td class="n">${fmt.money(r.level)}</td>
        ${r.cells.map((c) => `<td class="n ${ok(c.pnl) ? (c.pnl >= 0 ? 'gain' : 'loss') : ''}"
             style="${shade(c.pnl)}">${fmt.money(c.pnl)}</td>`).join('')}
      </tr>`).join('')}</tbody></table>`;
    drawLegBreakdown(g);
  }

  /** تفکیک اثر هر پا، در ستونِ وسطِ محور دوم — یعنی فرض‌های امروز. */
  function drawLegBreakdown(g) {
    const mid = Math.min(g.axisValues.length - 1, Math.floor(g.axisValues.length / 2));
    const axis = g.axis;
    $('scen-legs').innerHTML = `<table class="history-table"><thead><tr>
      <th>تغییر پایه ٪</th><th>قیمت پایه</th>
      ${legs.map((l, i) => `<th>${esc(legLabel(l, i))}</th>`).join('')}
      <th>جمع</th></tr></thead>
      <caption class="scen-caption">تفکیک هر پا در ${esc(axisLabel(axis, g.axisValues[mid]))}</caption>
      <tbody>${g.rows.map((r) => {
        const cell = r.cells[mid];
        return `<tr>
          <td class="n ${negClass(r.movePct)}">${fmt.pct(r.movePct)}٪</td>
          <td class="n">${fmt.money(r.level)}</td>
          ${cell.perLeg.map((v) => money(v)).join('')}
          ${money(cell.pnl)}
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  // ——— ریسک عمق ———
  function drawDepth() {
    const units = Math.max(1, Math.trunc(Number($('scen-units').value) || 1));
    const d = bookDepthRisk({ legs, quotes: (row.__books || []).map((b) => b), units });
    if (!d.perLeg.length) { $('scen-depth').innerHTML = '<p class="empty-note">این ترکیب پای اختیاری ندارد.</p>'; return; }
    const sum = `<p class="scen-sum">
      ${ok(d.exitCostTotal) ? `هزینه بستن کل موقعیت <b class="${negClass(-d.exitCostTotal)}">${fmt.money(d.exitCostTotal)}</b>` : 'هزینه بستن نامعلوم'}
      ${ok(d.worstSlipPct) ? ` · بدترین لغزش <b>${fmt.pct(d.worstSlipPct)}٪</b>` : ''}
      ${ok(d.closableUnits) ? ` · حداکثر واحد قابل بستن با همین دفتر <b>${fmt.int(d.closableUnits)}</b>` : ''}
      ${d.blockedLegs ? ` · <b class="neg">${fmt.int(d.blockedLegs)} پا دفترش کفاف نمی‌دهد</b>` : ''}
      ${d.unknownLegs ? ` · ${fmt.int(d.unknownLegs)} پا دفتر ندارد` : ''}</p>`;
    $('scen-depth').innerHTML = `${sum}<table class="history-table"><thead><tr>
      <th>پا</th><th>بستن با</th><th>خواسته</th><th>پرشده</th><th>کسری</th><th>سطح مصرفی</th>
      <th>بهترین مظنه</th><th>میانگین وزنی</th><th>لغزش ٪</th><th>هزینه بستن</th></tr></thead>
      <tbody>${d.perLeg.map((l) => `<tr class="${l.hasBook && !l.full ? 'scen-short' : ''}">
        <td>${esc(l.name || legLabel(l, l.index))}</td>
        <td>${l.closeSide === 'buy' ? 'خرید از عرضه' : 'فروش به تقاضا'}</td>
        <td class="n">${fmt.int(l.want)}</td>
        <td class="n">${l.hasBook ? fmt.int(l.filled) : '—'}</td>
        <td class="n ${l.short > 0 ? 'neg' : ''}">${l.hasBook ? fmt.int(l.short) : '—'}</td>
        <td class="n">${l.hasBook ? fmt.int(l.levels) : '—'}</td>
        <td class="n">${fmt.money(l.top)}</td>
        <td class="n">${fmt.money(l.vwap)}</td>
        <td class="n ${negClass(-Math.abs(l.slipPct))}">${ok(l.slipPct) ? fmt.pct(l.slipPct) : '—'}</td>
        ${money(l.exitCost)}
      </tr>`).join('')}</tbody></table>`;
  }

  drawLadder();
  drawGrid();
  drawDepth();
  for (const id of ['scen-axis', 'scen-range', 'scen-steps']) $(id).addEventListener('change', drawGrid);
  $('scen-units').addEventListener('change', drawDepth);
  return () => { host.innerHTML = ''; };
}
