// پنل سناریو، حساسیت، و ریسک عمق دفتر — برای یک ترکیب انتخاب‌شده.
//
// تب استراتژی سه عدد می‌گفت: «اگر پایه ثابت بماند»، «بیشترین سود»، «بیشترین
// زیان». آن سه، سه گوشهٔ یک فضایند نه خودِ فضا. این پنل فضا را نشان می‌دهد.
//
// محاسبه هیچ‌جای این فایل نیست؛ همه در `core/scenario.mjs` است تا بی‌نیاز از
// مرورگر آزمون شود. اینجا فقط رسم است.

import {
  scenarioLadder, sensitivityGrid, sensitivityAxis, bookDepthRisk,
  SENS_AXES, SENS_METRICS,
} from '/core/scenario.mjs';
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
    // مخرج «بازده ٪ سرمایه» همان سرمایه‌ای است که ستون جدول می‌گوید، نه
    // عددی که پنل خودش بسازد؛ دو مخرج یعنی دو درصد برای یک چیز.
    capital: row.capital,
  };
  // فرض‌های بازار که کاربر می‌تواند عوض کند. مقدار اولیه همان چیزی است که
  // ردیف با آن سنجیده شده، تا نقطهٔ شروع با جدول یکی باشد.
  const marketDefaults = {
    sigma: base.sigma, rFree: base.rFree, divYield: base.divYield, days: base.days,
  };
  const market = { ...marketDefaults };
  const units = Math.max(1, Math.trunc(Number(opt.units) || Number(row.qty) || 1));

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
        <span class="scen-note">${fmt.int(units)} قرارداد</span>
      </div>

      <div class="scen-controls scen-row">
        <label>محور دوم
          <select id="scen-axis">
            ${SENS_AXES.map((a) => `<option value="${a.key}">${esc(a.label)}</option>`).join('')}
          </select>
        </label>
        <label id="scen-span-wrap">دامنه محور <span id="scen-span-unit" class="scen-hint"></span>
          <input id="scen-span" type="number" min="1" max="200" step="1" value="40">
        </label>
        <label>تعداد ستون
          <input id="scen-cols" type="number" min="3" max="11" step="2" value="5">
        </label>
        <label>هر خانه چه می‌گوید
          <select id="scen-metric">
            ${SENS_METRICS.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="scen-controls scen-row scen-assume">
        <label>تلاطم سالانه
          <input id="scen-sigma" type="number" min="0.01" max="5" step="0.01">
        </label>
        <label>نرخ بهره ٪
          <input id="scen-rfree" type="number" min="0" max="100" step="0.5">
        </label>
        <label>بازده نقدی پایه ٪
          <input id="scen-div" type="number" min="0" max="100" step="0.5">
        </label>
        <label>روز مانده
          <input id="scen-days" type="number" min="0" max="3650" step="1">
        </label>
        <label>دامنه قیمت پایه ٪
          <input id="scen-range" type="number" min="2" max="80" step="1" value="20">
        </label>
        <label>تعداد پله
          <input id="scen-steps" type="number" min="3" max="15" step="2" value="9">
        </label>
        <button type="button" class="ghost" id="scen-reset">بازگشت به فرض‌های بازار</button>
      </div>

      <p class="note">پارامتری که محور دوم است، دور همان عددی می‌چرخد که اینجا گذاشته‌ای؛ بقیه ثابت
         می‌مانند. پس می‌شود هم‌زمان تلاطم را دستی گذاشت و محور را روی نرخ برد — چیزی که با یک
         فرضِ متغیر ممکن نبود. دامنهٔ محور برای تلاطم <b>نسبی</b> است (‎±٪ همان عدد) و برای نرخ‌ها
         <b>مطلق</b> بر حسب واحد درصد، چون نرخِ صفر با ضریب نسبی هیچ بازه‌ای نمی‌سازد.</p>
      <p class="note">روی محور «روز مانده»، صفر یعنی سررسید و همان‌جا عمداً از ارزش‌گذاری مدل به
         ارزش ذاتی سوییچ می‌شود — بلک‌شولز در صفر تعریف‌نشده است و با زمانِ خیلی کوچک عددی
         می‌دهد که شبیه درست است ولی نیست. یونانی‌ها همان ستون خالی می‌مانند، نه صفر.</p>
      <p id="scen-basis" class="scen-sum"></p>
      <div id="scen-grid" class="history-table-wrap"></div>
      <div id="scen-legs" class="history-table-wrap" style="margin-top:12px"></div>
    </section>

    <section class="card scen-card">
      <div class="section-head">
        <div><p class="eyebrow">اگر بخواهی بیرون بیایی</p><h3>ریسک عمق دفتر سفارش</h3></div>
        <label class="scen-units">تعداد واحد
          <input id="scen-units" type="number" min="1" max="100000" step="1" value="${units}">
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
  const clamp = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };

  function movesOf() {
    const range = clamp($('scen-range').value, 2, 80, 20);
    let steps = Math.trunc(clamp($('scen-steps').value, 3, 15, 9));
    if (steps % 2 === 0) steps += 1;                 // فرد، تا صفر همیشه وسط بیفتد
    const half = (steps - 1) / 2;
    return Array.from({ length: steps }, (_, i) => Math.round(((i - half) / half) * range * 100) / 100);
  }

  /** فرض‌های بازار را از فرم می‌خواند. نرخ‌ها در فرم درصدند، در موتور کسر. */
  function readMarket() {
    market.sigma = clamp($('scen-sigma').value, 0.001, 5, marketDefaults.sigma);
    market.rFree = clamp($('scen-rfree').value, 0, 100, marketDefaults.rFree * 100) / 100;
    market.divYield = clamp($('scen-div').value, 0, 100, marketDefaults.divYield * 100) / 100;
    market.days = Math.trunc(clamp($('scen-days').value, 0, 3650, marketDefaults.days));
    return market;
  }

  /** فرم را از یک مجموعه فرض پر می‌کند — همان مسیرِ «بازگشت به فرض‌های بازار». */
  function writeMarket(m) {
    const put = (id, v, dec) => { $(id).value = Number.isFinite(v) ? v.toFixed(dec) : ''; };
    put('scen-sigma', m.sigma, 2);
    put('scen-rfree', m.rFree * 100, 1);
    put('scen-div', m.divYield * 100, 1);
    $('scen-days').value = Number.isFinite(m.days) ? String(Math.trunc(m.days)) : '';
  }

  /**
   * دامنهٔ محور برای «روز مانده» معنی ندارد — بازهٔ طبیعی‌اش از روز مانده تا
   * صفر است — پس ورودی‌اش پنهان می‌شود، نه اینکه بی‌اثر جا بماند. واحدش هم
   * بین تلاطم (نسبی) و نرخ (واحد درصد) فرق می‌کند و باید نوشته شود.
   */
  function syncAxisControls() {
    const axis = $('scen-axis').value;
    const isDays = axis === 'days';
    $('scen-span-wrap').style.display = isDays ? 'none' : '';
    $('scen-span-unit').textContent = axis === 'sigma' ? '(٪ نسبی)' : '(واحد درصد)';
    if (!isDays && $('scen-span').dataset.axis !== axis) {
      $('scen-span').value = axis === 'sigma' ? '40' : '5';
      $('scen-span').dataset.axis = axis;
    }
  }

  const axisDef = (key) => SENS_AXES.find((a) => a.key === key) || SENS_AXES[0];
  /** سرستون محور دوم. جنس را موتور می‌گوید، قالب را `fmt` — تا رقم فارسی بماند. */
  const axisLabel = (axis, v) => {
    if (!ok(v)) return '—';
    const kind = axisDef(axis).kind;
    return kind === 'days' ? `${fmt.int(v)} روز` : kind === 'ratio' ? fmt.num(v) : `${fmt.pct(v * 100)}٪`;
  };

  const metricDef = () => SENS_METRICS.find((m) => m.key === $('scen-metric').value) || SENS_METRICS[0];
  const cellText = (c, m) => {
    const v = c[m.key];
    return m.fmt === 'pct' ? `${fmt.pct(v)}٪` : m.fmt === 'num' ? fmt.num(v) : fmt.money(v);
  };

  function drawGrid() {
    syncAxisControls();
    const axis = $('scen-axis').value;
    const m = readMarket();
    const args = {
      ...base, ...m, axis,
      moves: movesOf(),
      range: clamp($('scen-span').value, 1, 200, axis === 'sigma' ? 40 : 5),
      steps: Math.trunc(clamp($('scen-cols').value, 3, 11, 5)),
    };
    const g = sensitivityGrid({ ...args, axisValues: sensitivityAxis(args) });
    drawBasis(m, axis, g);
    const md = metricDef();
    if (!g.rows.length) {
      $('scen-grid').innerHTML = '<p class="empty-note">با این فرض‌ها جدول حساسیت ساخته نشد.</p>';
      $('scen-legs').innerHTML = '';
      return;
    }
    // شدت رنگ از بزرگ‌ترین قدرمطلق همان سنجه در همین جدول می‌آید. سنجه‌ها
    // هم‌مقیاس نیستند — گاما هزارم است و وگا میلیون — پس مقیاس ثابت،
    // یکی را همیشه بی‌رنگ و دیگری را همیشه پُررنگ می‌کرد.
    const vals = g.rows.flatMap((r) => r.cells.map((c) => c[md.key])).filter(ok);
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 0;
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
      </tr></thead>
      <caption class="scen-caption">هر خانه: ${esc(md.label)} — ${fmt.int(units)} قرارداد</caption>
      <tbody>${g.rows.map((r) => `<tr>
        <td class="n ${negClass(r.movePct)}">${fmt.pct(r.movePct)}٪</td>
        <td class="n">${fmt.money(r.level)}</td>
        ${r.cells.map((c) => `<td class="n ${ok(c[md.key]) ? (c[md.key] >= 0 ? 'gain' : 'loss') : ''}"
             style="${shade(c[md.key])}">${cellText(c, md)}</td>`).join('')}
      </tr>`).join('')}</tbody></table>`;
    drawLegBreakdown(g, axis);
  }

  /** یک خط، تا معلوم باشد جدول با چه فرض‌هایی ساخته شد و کدامش دستی است. */
  function drawBasis(m, axis, g) {
    const moved = (k) => (Math.abs(m[k] - marketDefaults[k]) > 1e-12 ? ' <b class="warn-ink">(دستی)</b>' : '');
    const axisName = axisDef(axis).label;
    $('scen-basis').innerHTML = `
      محور دوم <b>${esc(axisName)}</b>
      · تلاطم <b>${fmt.num(m.sigma)}</b>${moved('sigma')}
      · نرخ بهره <b>${fmt.pct(m.rFree * 100)}٪</b>${moved('rFree')}
      · بازده نقدی <b>${fmt.pct(m.divYield * 100)}٪</b>${moved('divYield')}
      · روز مانده <b>${fmt.int(m.days)}</b>${moved('days')}
      · ${g.axisValues.length ? `${fmt.int(g.axisValues.length)} ستون` : 'بی‌ستون'}`;
  }

  /** تفکیک اثر هر پا، در ستونِ وسطِ محور دوم — یعنی فرض‌های همین فرم. */
  function drawLegBreakdown(g, axis) {
    const mid = Math.min(g.axisValues.length - 1, Math.floor(g.axisValues.length / 2));
    $('scen-legs').innerHTML = `<table class="history-table"><thead><tr>
      <th>تغییر پایه ٪</th><th>قیمت پایه</th>
      ${legs.map((l, i) => `<th>${esc(legLabel(l, i))}</th>`).join('')}
      <th>جمع</th></tr></thead>
      <caption class="scen-caption">تفکیک سود و زیان هر پا در ${esc(axisLabel(axis, g.axisValues[mid]))}</caption>
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
    // پاهای ردیف در تعداد قرارداد ردیف ضرب شده‌اند؛ اگر این را نگوییم،
    // «تعداد واحد» دوباره در همان حجم ضرب می‌شود.
    const d = bookDepthRisk({
      legs, quotes: (row.__books || []).map((b) => b), units,
      legUnits: Math.max(1, Math.trunc(Number(row.qty) || 1)),
    });
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
  writeMarket(marketDefaults);
  drawGrid();
  drawDepth();
  const GRID_INPUTS = ['scen-axis', 'scen-span', 'scen-cols', 'scen-metric',
    'scen-sigma', 'scen-rfree', 'scen-div', 'scen-days', 'scen-range', 'scen-steps'];
  // `input` و نه فقط `change`: با فلش‌های ورودی عددی، جدول باید همان لحظه
  // جواب بدهد — همان چیزی که «تحلیل حساسیت» را از یک جدول ثابت جدا می‌کند.
  for (const id of GRID_INPUTS) {
    $(id).addEventListener('change', drawGrid);
    $(id).addEventListener('input', drawGrid);
  }
  $('scen-reset').addEventListener('click', () => { writeMarket(marketDefaults); drawGrid(); });
  $('scen-units').addEventListener('change', drawDepth);
  return () => { host.innerHTML = ''; };
}
