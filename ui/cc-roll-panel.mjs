// پنل «دستیار تصمیم رول کاوردکال» در تب تحلیل رول.
//
// چرا ماژول جدا: تب رول برای هر ترکیبی کار می‌کند و این پنل فقط برای
// کاوردکال معنا دارد. کنترل‌ها، زیرتب‌ها و نمودارهایش این‌جا زندگی می‌کنند
// و تب فقط سه قلاب دارد: `codes` (کدام قیمت‌ها گرفته شود)، `update`
// (با هر قیمت‌گیری دوباره حساب شود) و `dispose`.
//
// موتور: `core/cc-roll.mjs` — همان منطق نوت‌بوک رهگیر کاوردکال.

import {
  CC_BASES, coveredCall, ccRollPlan, decisionRows, scenarioTable, decisionMatrix, controlMetrics,
  dataIssues, decisionSummary, expiryLadder, rollVerdict, rollGrid, rollDelta, ccDailyBreakdown,
  ccSettleScenarios,
} from '/core/cc-roll.mjs';
import { dailyPnlSeries, trackInstruments } from '/core/position-track.mjs';
import { impliedVol } from '/core/bs.mjs';
import { parseJalali, daysSinceJalali } from '/core/jalali.mjs';
import { tehranDateNumber } from '/core/live-day.mjs';
import { fetchDailies } from '/ui/daily-intake.mjs';
import { mountDiff } from '/ui/chart.mjs';
import { chartGroup } from '/ui/chart-host.mjs';
import { mountSubtabs } from '/ui/subtabs.mjs';
import { faDigits, fmt } from '/ui/fmt.mjs';
import {
  verdictHtml, baselineKpis, ladderHtml, decisionTableHtml, scenarioHtml, matrixHtml, metricsHtml,
  summaryHtml, issuesHtml, candidatesHtml, oddsHtml, gridHtml, GRID_METRICS, executionHtml, trackKpis, trackTableHtml,
  trackOption, levelsOption, tradeoffOption, ladderOption, rangeText, compact,
} from '/ui/cc-roll-view.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const TABS = [
  { id: 'ccr-ladder', label: 'به کدام سررسید؟', hint: 'بهترین رول هر سررسید، هزینه و ریسکش' },
  { id: 'ccr-report', label: 'گزارش پنج‌بخشی', hint: 'جدول تصمیم، سناریو، ماتریس، شاخص‌ها و جمع‌بندی' },
  { id: 'ccr-charts', label: 'نمودار تصمیم', hint: 'سود اضافهٔ رول به ازای هر قیمت پایانی و موازنهٔ ریسک' },
  { id: 'ccr-odds', label: 'احتمال و امید', hint: 'احتمال به‌نفع‌بودن هر رول با تلاطم ضمنی' },
  { id: 'ccr-grid', label: 'نقشهٔ سررسید × اعمال', hint: 'همهٔ نامزدها در یک نگاه' },
  { id: 'ccr-exec', label: 'پنجرهٔ اجرا', hint: 'چه چیزی واقعاً در دفتر سفارش جا می‌شود' },
  { id: 'ccr-all', label: 'همهٔ نامزدها', hint: 'جدول کامل با همهٔ ستون‌ها' },
  { id: 'ccr-track', label: 'سود و زیان موقعیت', hint: 'روند روزانه از ورود تا امروز، در برابر خرید و نگهداری' },
];

export const CC_PANEL_HTML = `
  <section class="card ccr" id="ccr">
    <h3>دستیار تصمیم رول کاوردکال</h3>
    <p class="note">با دیدن موقعیت فعلی: رول بکنم یا نه، به کدام سررسید و اعمال، با چه هزینه و چه ریسکی.
      مبنای مقایسه «سود اضافهٔ رول نسبت به رول‌نکردن» در هر قیمت پایانی پایه است، با کارمزد اعمال و فروش سهم.</p>
    <div class="ccr-controls">
      <div class="field"><label for="ccr-basis">مبنای قیمت</label><select id="ccr-basis">
        ${CC_BASES.map((b) => `<option value="${b.id}" title="${esc(b.hint)}">${esc(b.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="ccr-exp">تعداد سررسید بعدی</label><input id="ccr-exp" type="number" min="0" max="12" value="4"></div>
      <div class="field"><label for="ccr-minbid">حداقل مظنهٔ تقاضا</label><input id="ccr-minbid" type="number" min="0" value="1"></div>
      <div class="field"><label for="ccr-minoi">حداقل موقعیت باز</label><input id="ccr-minoi" type="number" min="0" value="0"></div>
      <label class="check" for="ccr-low"><input type="checkbox" id="ccr-low" checked> اعمال پایین‌تر در سررسید بعدی هم بررسی شود</label>
    </div>
    <div id="ccr-verdict"></div>
    <div id="ccr-body">
      <div class="kpis" id="ccr-kpis"></div>
      <div id="ccr-tabs"></div>
      <div data-panel="ccr-ladder" class="ccr-panel">
        <div class="scroll" data-export="expiry-ladder" id="ccr-ladder"></div>
        <div class="ccr-chart" id="ccr-ladder-chart"></div>
        <p class="note">«سود روزانه در ثبات» سود موقعیت پس از رول را اگر پایه ثابت بماند بر افقش تقسیم می‌کند؛ سبز یعنی
          روز به روز هم از نگه‌داشتن بهتر است، نه فقط به‌خاطر افق بلندتر.</p>
      </div>
      <div data-panel="ccr-report" class="ccr-panel" hidden>
        <div class="field"><label for="ccr-group">گروه سررسید</label><select id="ccr-group"></select></div>
        <h4>بخش اول: جدول اصلی تصمیم‌گیری</h4><div class="scroll" data-export="decision" id="ccr-decision"></div>
        <h4>بخش دوم: جدول سناریوها</h4><div class="scroll" data-export="scenarios" id="ccr-scen"></div>
        <h4>بخش سوم: ماتریس تصمیم‌گیری</h4><div class="scroll" data-export="matrix" id="ccr-matrix"></div>
        <h4>بخش چهارم: شاخص‌های کنترلی</h4><div class="scroll" data-export="metrics" id="ccr-metrics"></div><div id="ccr-issues"></div>
        <h4>بخش پنجم: جمع‌بندی تصمیم</h4><div id="ccr-summary"></div>
      </div>
      <div data-panel="ccr-charts" class="ccr-panel" hidden>
        <h4 id="ccr-cross-title">سود اضافهٔ رول در برابر رول‌نکردن</h4>
        <p class="note">بالای صفر یعنی رول بهتر است. شش نامزد برتر گروه انتخاب‌شده؛ خط عمودی قیمت امروز پایه است.</p>
        <div id="ccr-cross"></div><div class="legend" id="ccr-cross-legend"></div>
        <h4>موازنهٔ ریسک رول</h4>
        <p class="note">هر نقطه یک نامزد: هرچه راست‌تر، بدترین حالتش کم‌ضررتر؛ هرچه بالاتر، بهترین حالتش بزرگ‌تر.</p>
        <div class="ccr-chart" id="ccr-trade"></div>
      </div>
      <div data-panel="ccr-odds" class="ccr-panel" hidden><div class="scroll" data-export="odds" id="ccr-odds"></div></div>
      <div data-panel="ccr-grid" class="ccr-panel" hidden>
        <div class="field"><label for="ccr-gridm">شاخص خانه‌ها</label><select id="ccr-gridm">
          ${GRID_METRICS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}</select></div>
        <div class="scroll" data-export="grid" id="ccr-gridt"></div>
        <p class="note">نشان «؟» یعنی قیمت آن خانه در مبنای انتخابی اجرا نمی‌شود و تخمینی است.</p>
      </div>
      <div data-panel="ccr-exec" class="ccr-panel" hidden><div class="scroll" data-export="execution" id="ccr-exec"></div></div>
      <div data-panel="ccr-all" class="ccr-panel" hidden><div class="scroll" data-export="candidates" id="ccr-all" style="max-height:60vh"></div></div>
      <div data-panel="ccr-track" class="ccr-panel" hidden>
        <p class="note" id="ccr-track-note">روند روزانه با باز شدن همین زیرتب گرفته می‌شود.</p>
        <button type="button" class="btn" id="ccr-track-load">دریافت دوبارهٔ تاریخچه</button>
        <div class="kpis" id="ccr-track-kpis"></div>
        <h4>سود و زیان تجمعی — کاوردکال در برابر خرید و نگهداری</h4><div class="ccr-chart" id="ccr-track-chart"></div>
        <h4>قیمت پایه در برابر سطوح کلیدی موقعیت</h4><div class="ccr-chart" id="ccr-levels-chart"></div>
        <h4>آخرین روزها</h4><div class="scroll" data-export="daily-pnl" id="ccr-track-table"></div>
      </div>
    </div>
  </section>`;

/** کال‌های زنجیرهٔ یک پایه به شکل تخت، هر کدام با سررسید خودش. */
export function flatCalls(detail) {
  const out = [];
  for (const ex of detail?.expiries || []) {
    for (const st of ex.strikes || []) {
      if (!st.call?.ins) continue;
      out.push({ ins: String(st.call.ins), name: st.call.name, strike: st.strike, days: ex.days, size: st.size, quote: st.call });
    }
  }
  return out;
}

/**
 * پنل را روی ظرفی که `CC_PANEL_HTML` در آن نشسته سوار می‌کند.
 * `getSettings` تنظیمات زنده را می‌دهد (کارمزد، نرخ، تلاطم دستی).
 */
export function mountCcRoll(root, { getSettings }) {
  const el = (sel) => root.querySelector(sel);
  const charts = chartGroup();
  let crossChart = null;
  let ctx = null;          // آخرین ورودی update
  let plan = null;
  let dailyFor = '';
  let dailyByIns = {};
  let dailyNote = '';
  let tabs = null;

  const fees = () => {
    const s = getSettings();
    return { buyStock: s.feeBuyStock, sellStock: s.feeSellStock, option: s.feeOption, exercise: s.feeExercise };
  };
  const filters = () => ({
    minBid: Number(el('#ccr-minbid').value) || 0,
    minOi: Number(el('#ccr-minoi').value) || 0,
    maxExpiries: Math.max(0, Math.trunc(Number(el('#ccr-exp').value) || 0)),
    includeLower: el('#ccr-low').checked,
  });

  const paint = async (key, host, build) => {
    const h = charts.get(key);
    if (h) { h.update(build); return; }
    await charts.set(key, host, build, { empty: 'دادهٔ کافی برای این نمودار نیست' });
  };

  /** کال فعلی و زنجیرهٔ نامزدها — بی قیمت‌گیری. */
  function chainOf(pos, detail) {
    const cc = coveredCall(pos, fees());
    if (!cc.ok) return { cc, calls: [], current: null };
    const calls = flatCalls(detail);
    const current = calls.find((c) => c.ins === cc.callIns)
      || calls.find((c) => Math.abs(c.strike - cc.K) < 1e-9 && String(c.name) === cc.callName) || null;
    return { cc, calls, current };
  }

  /** شناسه‌هایی که برای این پنل باید قیمت گرفت: کال فعلی و سررسیدهای هم‌تراز یا بعدی. */
  function codes(pos, detail) {
    const { cc, calls, current } = chainOf(pos, detail);
    if (!cc.ok || !current) return [];
    const f = filters();
    const daysList = [...new Set(calls.map((c) => c.days).filter((d) => d >= current.days))].sort((a, b) => a - b);
    const keep = new Set(f.maxExpiries > 0 ? daysList.slice(0, f.maxExpiries + 1) : daysList);
    return calls.filter((c) => keep.has(c.days)).map((c) => c.ins);
  }

  function sigmaOf(current, quote, spot) {
    const s = getSettings();
    if (s.volSource === 'MANUAL') return Number(s.volManual) || NaN;
    const mkt = Number(quote?.close) || Number(quote?.last);
    if (!(mkt > 0) || !(spot > 0) || !(current.days > 0)) return NaN;
    const iv = impliedVol('call', mkt, spot, current.strike, current.days / 365, s.rFree, s.divYield,
      { lo: s.ivLo, hi: s.ivHi });
    return Number.isFinite(iv) && iv > 0 ? iv : NaN;
  }

  function hide(msg) {
    el('#ccr-verdict').innerHTML = `<div class="ccr-verdict tone-flat"><div class="ccr-v-title">دستیار کاوردکال</div><p>${esc(msg)}</p></div>`;
    el('#ccr-body').hidden = true;
  }

  function update(next) {
    if (next) ctx = next;
    if (!ctx?.pos) return;
    const { pos, detail, quotesByIns, spot, uaName } = ctx;
    if (!detail) { hide('زنجیرهٔ اختیار این پایه در دیده‌بان نیست.'); return; }
    const { cc, calls, current } = chainOf(pos, detail);
    if (!cc.ok) { hide(cc.reason); return; }
    if (!current) { hide('کال فعلی این موقعیت در زنجیرهٔ امروز پیدا نشد — شاید سررسید شده یا شناسه‌اش ثبت نشده.'); return; }
    el('#ccr-body').hidden = false;

    const quoteOf = (c) => {
      const fresh = quotesByIns.get(c.ins);
      return fresh ? { ...c.quote, ...fresh, oi: c.quote.oi, vol: c.quote.vol } : c.quote;
    };
    const chain = calls.map((c) => ({ ...c, quote: quoteOf(c) }));
    const cur = chain.find((c) => c.ins === current.ins);
    const sigma = sigmaOf(cur, cur.quote, spot);
    const f = fees();
    plan = ccRollPlan({
      cc, spot, current: cur, chain, fees: f,
      basis: el('#ccr-basis').value, filters: filters(), sigma,
    });
    const verdict = rollVerdict(plan);
    el('#ccr-verdict').innerHTML = verdictHtml(verdict, plan, uaName);
    if (!plan.ok) { el('#ccr-body').hidden = true; return; }

    const settle = ccSettleScenarios(cc, spot, f);
    el('#ccr-kpis').innerHTML = baselineKpis(plan, settle);

    tabs = mountSubtabs(el('#ccr-tabs'), TABS, {
      root,
      onChange: (id) => { charts.resizeAll(); if (id === 'ccr-track') loadTrack(false); if (id === 'ccr-charts') drawCross(); },
    });

    // ——— نردبان سررسید ———
    const ladder = expiryLadder(plan);
    el('#ccr-ladder').innerHTML = ladderHtml(ladder, plan);
    paint('ladder', el('#ccr-ladder-chart'), (echarts, tokens) => ladderOption(ladder, tokens));

    // ——— گزارش پنج‌بخشی ———
    const groupSel = el('#ccr-group');
    const want = groupSel.value;
    const groupDays = [...new Set(plan.rows.map((r) => r.days))].sort((a, b) => a - b);
    groupSel.innerHTML = groupDays.map((d) => `<option value="${d}">${d === plan.baseline.days ? 'سررسید فعلی' : `+${faDigits(d - plan.baseline.days)} روز`} — ${faDigits(d)} روز مانده</option>`).join('')
      + '<option value="all">همهٔ سررسیدها با هم</option>';
    groupSel.value = [...groupSel.options].some((o) => o.value === want) ? want : (groupDays.length ? String(groupDays[0]) : 'all');
    drawReport();

    el('#ccr-odds').innerHTML = oddsHtml(plan);
    el('#ccr-gridt').innerHTML = gridHtml(rollGrid(plan, el('#ccr-gridm').value), plan);
    el('#ccr-exec').innerHTML = executionHtml(plan);
    el('#ccr-all').innerHTML = candidatesHtml(plan);
    paint('trade', el('#ccr-trade'), (echarts, tokens) => tradeoffOption(plan, tokens));
    drawCross();
    if (!el('[data-panel="ccr-track"]').hidden) loadTrack(false);
  }

  function groupRows() {
    const v = el('#ccr-group').value;
    return decisionRows(plan, v === 'all' || v === '' ? null : Number(v));
  }

  function drawReport() {
    if (!plan?.ok) return;
    const ua = ctx.uaName;
    const drows = groupRows();
    const f = fees();
    el('#ccr-decision').innerHTML = decisionTableHtml(drows, plan, ua);
    el('#ccr-scen').innerHTML = scenarioHtml(scenarioTable(drows, plan, f), drows, ua);
    el('#ccr-matrix').innerHTML = matrixHtml(decisionMatrix(drows, plan, f), ua);
    el('#ccr-metrics').innerHTML = metricsHtml(controlMetrics(drows, plan), plan);
    el('#ccr-issues').innerHTML = issuesHtml(dataIssues(drows, plan));
    el('#ccr-summary').innerHTML = summaryHtml(decisionSummary(drows, plan), plan, ua);
  }

  function drawCross() {
    const host = el('#ccr-cross');
    if (!plan?.ok || !plan.rows.length || el('[data-panel="ccr-charts"]').hidden) return;
    const b = plan.baseline;
    const v = el('#ccr-group').value;
    const pool = v === 'all' || v === '' ? plan.rows : plan.rows.filter((r) => String(r.days) === v);
    const top = (pool.length ? pool : plan.rows).slice(0, 6);
    const f = fees();
    const fn = (r) => { const d = rollDelta(b.K, b.nc0, r.strike, r.nc, f); return (S) => d(S) * b.shares; };
    const ks = [b.K, b.spot, ...top.map((r) => r.strike)];
    const lo = Math.max(1, Math.min(...ks) * 0.75);
    const hi = Math.max(...ks) * 1.2;
    const label = (r) => `${r.name} — اعمال ${fmt.money(r.strike)}${r.same ? '' : ` — +${faDigits(r.extraDays)} روز`}`;
    crossChart?.destroy();
    crossChart = mountDiff(host, fn(top[0]), lo, hi, {
      spot: b.spot, width: 760, height: 260,
      extra: top.slice(1).map((r) => ({ fn: fn(r), label: label(r) })),
    });
    el('#ccr-cross-title').textContent = `سود اضافهٔ رول در برابر رول‌نکردن — خط اصلی: ${label(top[0])}`;
    el('#ccr-cross-legend').innerHTML = `<span>محدودهٔ به‌نفع خط اصلی: ${esc(rangeText(top[0].ranges))}</span>
      <span>سود اضافه با قیمت امروز: ${compact(top[0].dNow)}</span>`;
  }

  // ——— سود و زیان تاریخی ———

  const entryNumber = (pos) => {
    const date = parseJalali(pos?.entryDate);
    return date ? (date.getUTCFullYear() * 10000) + ((date.getUTCMonth() + 1) * 100) + date.getUTCDate() : 0;
  };

  async function loadTrack(force) {
    const pos = ctx?.pos;
    if (!pos) return;
    const key = String(pos.id);
    if (!force && dailyFor === key) { drawTrack(); return; }
    el('#ccr-track-note').textContent = 'در حال گرفتن تاریخچهٔ روزانه…';
    const need = Math.min(900, Math.max(30, (Number(daysSinceJalali(pos.entryDate)) || 0) + 10));
    try {
      const got = await fetchDailies(trackInstruments(pos), { n: need });
      dailyByIns = got.byIns;
      dailyFor = key;
      dailyNote = '';
    } catch (e) {
      dailyByIns = {};
      dailyFor = key;
      dailyNote = `تاریخچهٔ روزانه گرفته نشد: ${faDigits(e.message)}`;
    }
    drawTrack();
  }

  function drawTrack() {
    const pos = ctx?.pos;
    const cc = coveredCall(pos, fees());
    if (!cc.ok) return;
    const series = dailyPnlSeries(pos, dailyByIns, {
      fees: fees(), basis: 'CLOSE', from: entryNumber(pos), to: tehranDateNumber(),
    });
    const breakdown = ccDailyBreakdown(cc, series, fees());
    const settle = ccSettleScenarios(cc, ctx.spot, fees());
    el('#ccr-track-kpis').innerHTML = trackKpis(cc, breakdown, settle);
    el('#ccr-track-table').innerHTML = trackTableHtml(breakdown, 15);
    const gaps = breakdown.gaps ? ` ${faDigits(breakdown.gaps)} روز که یکی از دو پا قیمت نداشت، شکاف مانده — با قیمت روز قبل پر نمی‌شود.` : '';
    el('#ccr-track-note').textContent = dailyNote || (breakdown.rows.length
      ? `${faDigits(breakdown.rows.length)} روز معاملاتی از ورود تا امروز، با قیمت پایانی.${gaps}`
      : `روند ساخته نشد: ${series.reason || 'تاریخچه‌ای نرسید'}.`);
    paint('track', el('#ccr-track-chart'), (echarts, tokens) => trackOption(breakdown, tokens));
    paint('levels', el('#ccr-levels-chart'), (echarts, tokens) => levelsOption(breakdown, cc, tokens));
  }

  // ——— رویدادها ———
  for (const id of ['#ccr-basis', '#ccr-exp', '#ccr-minbid', '#ccr-minoi', '#ccr-low']) {
    el(id).addEventListener('change', () => { update(); if (id === '#ccr-exp') ctx?.reprice?.(); });
  }
  el('#ccr-group').addEventListener('change', () => { drawReport(); drawCross(); });
  el('#ccr-gridm').addEventListener('change', () => {
    if (plan?.ok) el('#ccr-gridt').innerHTML = gridHtml(rollGrid(plan, el('#ccr-gridm').value), plan);
  });
  el('#ccr-track-load').addEventListener('click', () => loadTrack(true));

  return {
    codes,
    update,
    get plan() { return plan; },
    get tabs() { return tabs; },
    dispose() { crossChart?.destroy(); charts.disposeAll(); },
  };
}
