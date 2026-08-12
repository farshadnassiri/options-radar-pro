// تب استراتژی — یکی برای همه.
//
// هر تب استراتژی از همین فایل ساخته می‌شود و تفاوتشان فقط شناسه الگو است.
// این نتیجه مستقیم آن تصمیم معماری است: چون هیچ استراتژی محاسبه‌گر جدا ندارد،
// هیچ تبی هم رابط جدا لازم ندارد.
//
// ساختار هر صفحه:
//   انتخاب نماد ، کنترل‌ها ، شاخص‌های کلیدی ، نوار تشخیص ،
//   جدول مرتب‌شدنی ، پانل جزئیات ردیف

import { byId } from '/strategies/catalog.mjs';
import { COLUMNS } from '/core/evaluate.mjs';
import { analyzePayoff, scenarioGrid } from '/core/payoff.mjs';
import { analyzeMixed, isSingleExpiry } from '/core/mixed.mjs';
import { makeTable, funnelBar, fmt } from '/ui/table.mjs';
import { makePicker } from '/ui/picker.mjs';
import { payoffSvg } from '/ui/chart.mjs';
import { runScan, onChain, pushRows, chainState } from '/ui/scanner.mjs';

const VIEWS = {
  خلاصه: ['underlying', 'legsText', 'days', 'cashLabel', 'netCash', 'breakevens', 'maxProfit',
    'maxLoss', 'capital', 'retMaxPct', 'retMonthPct', 'popPct', 'execCost', 'maxQty', 'binding',
    'qualityLabel', 'warn'],
  سرمایه: ['underlying', 'legsText', 'days', 'capital', 'capitalLabel', 'margin', 'marginToMaxLoss',
    'conditionalMargin', 'netCash', 'maxLoss', 'retMaxPct', 'retAnnPct', 'warn'],
  یونانی: ['underlying', 'legsText', 'days', 'delta', 'gamma', 'vega', 'theta',
    'thetaToCapitalPct', 'sigmaUse', 'popPct', 'capital', 'warn'],
  اجرا: ['underlying', 'legsText', 'days', 'execCost', 'costCommission', 'costCrossing',
    'costSlippage', 'costFunding', 'maxQty', 'binding', 'qualityLabel', 'warn'],
  همه: COLUMNS.map((c) => c.key),
};

export async function mount(root, { tab, state, api }) {
  const def = tab.def || byId(tab.id);
  const s = () => state.settings;
  let rows = [];
  let picked = null;
  let view = 'خلاصه';
  let busy = false;
  let qty = s().qtyDefault;

  root.innerHTML = `
    <div class="page-head">
      <h2>${def.name}</h2>
      <p>${def.feasible
        ? `${def.dir}${def.note ? ' — ' + def.note : ''}`
        : `<span class="tag warn">اجرا در تابلو ممکن نیست</span> ${def.infeasibleWhy}`}</p>
    </div>

    <div class="split">
      <section class="card">
        <h3>نماد پایه</h3>
        <p class="note">انتخابی، نه تایپی. جست‌وجو فقط فهرست را کوتاه می‌کند.</p>
        <div id="pick"></div>
      </section>

      <section class="card">
        <h3>کنترل اسکن</h3>
        <p class="note">حجم، مبنای قیمت و حالت اجرا مستقیم روی قیمت اجرای هر پا اثر می‌گذارند.</p>
        <div class="grid" id="ctrl"></div>
        <div class="bar" style="margin-top:12px">
          <button class="btn" id="run">اسکن</button>
          <label class="field row" style="margin:0"><input type="checkbox" id="auto"> <label for="auto">اسکن پیوسته</label></label>
          <span class="sp"></span>
          <span id="status" class="picker-sum"></span>
        </div>
      </section>
    </div>

    <div class="kpis" id="kpis"></div>
    <section class="card">
      <h3>نوار تشخیص</h3>
      <p class="note">ترکیب‌هایی که افتادند، اینجا شمرده می‌شوند. خالی بودن جدول در بازار ایران خطای برنامه نیست، واقعیت نقدشوندگی است.</p>
      <div id="funnel"></div>
    </section>

    <div class="bar" style="margin-bottom:8px">
      <span class="picker-sum">نمای ستون‌ها:</span>
      <div class="chips" id="views"></div>
    </div>
    <div id="table"></div>

    <section class="card" id="detail-card" style="margin-top:16px;display:none">
      <h3 id="detail-title">جزئیات ردیف</h3>
      <div class="detail" id="detail"></div>
    </section>`;

  // ——— انتخابگر ———
  const picker = makePicker(root.querySelector('#pick'), {
    onChange: () => { setStatus(); if (auto.checked) run(); },
  });
  if (chainState.list.length) picker.setList(chainState.list);
  const offChain = onChain((cs) => picker.setList(cs.list));

  // ——— کنترل‌ها ———
  const ctrl = root.querySelector('#ctrl');
  const ctrlDefs = [
    ['qty', 'حجم من (قرارداد)', 'num'],
    ['priceBasis', 'مبنای قیمت', 'pick'],
    ['execMode', 'حالت اجرا', 'pick'],
    ['rankBy', 'مبنای رتبه‌بندی', 'pick'],
    ['minDays', 'روز از', 'num'],
    ['maxDays', 'روز تا', 'num'],
    ['comboWindowPct', 'پنجره قیمت اعمال ٪', 'num'],
    ['minReturnPct', 'حداقل بازده دوره ٪', 'num'],
    ['showUnexecutable', 'نمایش غیرقابل اجرا', 'bool'],
  ];
  const { SCHEMA } = await import('/core/settings.mjs');
  for (const [key, label, kind] of ctrlDefs) {
    const f = SCHEMA.find((x) => x.key === key);
    const w = document.createElement('div');
    w.className = kind === 'bool' ? 'field row' : 'field';
    const val = key === 'qty' ? qty : (s()[key] ?? f.def);
    if (kind === 'bool') {
      w.innerHTML = `<input type="checkbox" id="c-${key}" ${val ? 'checked' : ''}><label for="c-${key}">${label}</label>`;
    } else if (kind === 'pick') {
      w.innerHTML = `<label for="c-${key}">${label}</label><select id="c-${key}">${
        f.options.map(([v, t]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    } else {
      w.innerHTML = `<label for="c-${key}">${label}</label><input type="number" id="c-${key}" value="${val}">`;
    }
    ctrl.appendChild(w);
    const node = w.querySelector(`#c-${key}`);
    node.addEventListener('change', () => {
      const v = kind === 'bool' ? node.checked : kind === 'num' ? Number(node.value) : node.value;
      if (key === 'qty') qty = Math.max(1, v);
      else state.settings = { ...state.settings, [key]: v };
      if (auto.checked) run(); else setStatus('تنظیم عوض شد — اسکن را بزن.');
    });
  }

  const auto = root.querySelector('#auto');
  const statusEl = root.querySelector('#status');
  const setStatus = (t) => {
    statusEl.textContent = t || (picker.count()
      ? `${picker.count()} نماد انتخاب شده${rows.length ? ` — ${rows.length} ردیف` : ''}`
      : 'نمادی انتخاب نشده');
  };

  // ——— نماها ———
  const viewsHost = root.querySelector('#views');
  for (const name of Object.keys(VIEWS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = name;
    b.setAttribute('aria-pressed', name === view ? 'true' : 'false');
    b.addEventListener('click', () => {
      view = name;
      for (const x of viewsHost.children) x.setAttribute('aria-pressed', x.textContent === name ? 'true' : 'false');
      buildTable();
    });
    viewsHost.appendChild(b);
  }

  // ——— جدول ———
  let table = null;
  function buildTable() {
    const cols = VIEWS[view].map((k) => COLUMNS.find((c) => c.key === k)).filter(Boolean);
    table = makeTable(root.querySelector('#table'), cols, {
      sortKey: s().rankBy, onPick: showDetail,
    });
    table.set(rows);
  }
  buildTable();

  // ——— شاخص‌های کلیدی ———
  function drawKpis() {
    const ok = rows.filter((r) => Number.isFinite(r.retMonthPct));
    const best = ok[0];
    const med = (arr) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)] : NaN);
    const items = [
      ['ردیف قابل اجرا', fmt.int(rows.filter((r) => r.executable).length), `از ${rows.length}`],
      ['بهترین بازده ماهانه', best ? `${fmt.pct(best.retMonthPct)}٪` : '—', best?.underlying || ''],
      ['میانه بازده ماهانه', `${fmt.pct(med(ok.map((r) => r.retMonthPct)))}٪`, ''],
      ['میانه احتمال سود', `${fmt.pct(med(rows.map((r) => r.popPct).filter(Number.isFinite)))}٪`, ''],
      ['میانه هزینه اجرا', fmt.money(med(rows.map((r) => r.execCost).filter(Number.isFinite))), `${def.legs.length} پا`],
      ['زیان نامحدود', fmt.int(rows.filter((r) => r.unlimitedLoss).length), 'ردیف'],
      ['عمق کامل', fmt.int(rows.filter((r) => r.quality === 'exact').length), 'ردیف مرحله دو'],
      ['بستانکار', fmt.int(rows.filter((r) => r.isCredit).length), 'ردیف'],
    ];
    root.querySelector('#kpis').innerHTML = items.map(([k, v, sub]) => `
      <div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join('');
  }

  // ——— پانل جزئیات ———
  function showDetail(r) {
    picked = r;
    const card = root.querySelector('#detail-card');
    card.style.display = '';
    root.querySelector('#detail-title').textContent = `${r.underlying} — ${r.legsText}`;

    const fees = { buyStock: s().feeBuyStock, sellStock: s().feeSellStock, option: s().feeOption, exercise: s().feeExercise };
    const single = isSingleExpiry(r.__legs);
    const chartOpt = {
      fees, spot: r.S, width: 720, height: 260,
      sigma: r.sigmaUse, rFree: s().rFree, divYield: s().divYield,
    };
    const { svg } = payoffSvg(r.__legs, r.netCash, chartOpt);
    const an = single
      ? analyzePayoff(r.__legs, r.netCash, { fees })
      : analyzeMixed(r.__legs, r.netCash, { fees, spot: r.S, sigma: r.sigmaUse, rFree: s().rFree, divYield: s().divYield });
    const grid = Array.from({ length: 11 }, (_, i) => {
      const pct = -s().shockPct * 2 + (i * s().shockPct * 4) / 10;
      const S2 = r.S * (1 + pct / 100);
      return { pct, S: S2, pnl: an.at(S2) };
    });

    const legRows = r.legPrices.map((l) => `
      <tr>
        <td>${l.side === 'sell' ? 'فروش' : 'خرید'} ${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت')}</td>
        <td class="n">${l.strike ? fmt.money(l.strike) : '—'}</td>
        <td class="n">${fmt.money(l.price)}</td>
        <td class="n">${fmt.money(l.mid)}</td>
        <td class="n">${Number.isFinite(l.spreadPct) ? l.spreadPct.toFixed(1) : '—'}</td>
        <td class="n">${Number.isFinite(l.slipPct) ? l.slipPct.toFixed(2) : '—'}</td>
        <td class="n">${fmt.int(l.filled)}</td>
        <td class="n">${fmt.int(l.short)}</td>
        <td>${l.source || '—'}</td>
      </tr>`).join('');

    const costRows = r.costRows.map((c) => `
      <tr><td>${c.leg}</td><td class="n">${fmt.money(c.commission)}</td>
      <td class="n">${fmt.money(c.crossing)}</td><td class="n">${fmt.money(c.slippage)}</td></tr>`).join('');

    const limitRows = r.sizeLimits.map((l) => `
      <tr><td>${l.what}</td><td class="n">${fmt.int(l.max)}</td>
      <td>${l.what === r.binding ? '<span class="tag warn">مقیدکننده</span>' : ''}</td></tr>`).join('');

    const scenRows = grid.map((g) => `
      <tr><td class="n">${g.pct.toFixed(0)}٪</td><td class="n">${fmt.money(g.S)}</td>
      <td class="n" style="color:${g.pnl >= 0 ? 'var(--gain)' : 'var(--loss)'}">${fmt.money(g.pnl)}</td></tr>`).join('');

    root.querySelector('#detail').innerHTML = `
      <div>
        ${svg}
        <div class="legend">
          ${an.approx ? `<span style="color:var(--warn)">${an.note}</span>` : ''}
          <span>سربه‌سری: ${an.breakevens.map((b) => Math.round(b).toLocaleString('en-US')).join(' , ') || '—'}</span>
          <span>بیشترین سود: ${fmt.money(an.maxProfit)}</span>
          <span>بیشترین زیان: ${fmt.money(an.maxLoss)}</span>
        </div>
        <h4 style="margin:14px 0 4px;font-size:12px">قیمت و عمق هر پا</h4>
        <table class="mini">
          <thead><tr><th>پا</th><th>اعمال</th><th>قیمت اجرا</th><th>میانه</th><th>اسپرد ٪</th><th>افت ٪</th><th>پرشده</th><th>کمبود</th><th>منبع</th></tr></thead>
          <tbody>${legRows}</tbody>
        </table>
      </div>
      <div>
        <dl class="kv">
          <dt>جهت نقدی</dt><dd>${r.cashLabel}</dd>
          <dt>نقد خالص</dt><dd>${fmt.money(r.netCash)}</dd>
          <dt>سرمایه درگیر</dt><dd>${fmt.money(r.capital)}</dd>
          <dt>مبنای سرمایه</dt><dd>${r.capitalLabel}</dd>
          <dt>وجه تضمین</dt><dd>${fmt.money(r.margin)}</dd>
          <dt>تضمین شرطی</dt><dd>${fmt.money(r.conditionalMargin)}</dd>
          <dt>پوشش</dt><dd>${r.coverage}</dd>
          <dt>بازده دوره</dt><dd>${fmt.pct(r.retMaxPct)}٪</dd>
          <dt>بازده ماهانه</dt><dd>${fmt.pct(r.retMonthPct)}٪</dd>
          <dt>احتمال سود</dt><dd>${fmt.pct(r.popPct)}٪</dd>
          <dt>دلتا</dt><dd>${fmt.num(r.delta)}</dd>
          <dt>تتا روزانه</dt><dd>${fmt.money(r.theta)}</dd>
          <dt>تلاطم مبنا</dt><dd>${fmt.num(r.sigmaUse)}</dd>
          <dt>کیفیت داده</dt><dd>${r.qualityLabel}</dd>
        </dl>
        <p class="note" style="margin:10px 0 2px">${r.marginNote}</p>
        ${r.leggingRisk ? `<p class="note" style="color:var(--warn)">ریسک لنگ‌زدن: سفارش ترکیبی در تابلو نیست. اگر پای فروش پر شود و پای خرید نه، وجه تضمین ${fmt.money(r.conditionalMargin)} همان لحظه مطالبه می‌شود${r.leggingUnlimited ? ' و موقعیت باقی‌مانده زیان نامحدود دارد' : ''}.</p>` : ''}

        <h4 style="margin:14px 0 4px;font-size:12px">تفکیک هزینه اجرا — جمع ${fmt.money(r.execCost)}</h4>
        <table class="mini">
          <thead><tr><th>پا</th><th>کارمزد</th><th>عبور از اسپرد</th><th>افت مظنه</th></tr></thead>
          <tbody>${costRows}
            <tr><td>هزینه فرصت وجه تضمین</td><td class="n" colspan="3">${fmt.money(r.costFunding)}</td></tr></tbody>
        </table>

        <h4 style="margin:14px 0 4px;font-size:12px">سقف حجم — مقید به ${r.binding}</h4>
        <table class="mini"><tbody>${limitRows}</tbody></table>

        <h4 style="margin:14px 0 4px;font-size:12px">سناریو در سررسید</h4>
        <table class="mini">
          <thead><tr><th>تغییر پایه</th><th>قیمت پایه</th><th>سود و زیان</th></tr></thead>
          <tbody>${scenRows}</tbody>
        </table>
      </div>`;
  }

  // ——— اجرای اسکن ———
  let timer = null;
  async function run() {
    if (busy) return;
    const keys = picker.selected();
    if (!keys.length) { setStatus('نمادی انتخاب نشده'); return; }
    busy = true;
    setStatus('مرحله یک — غربال روی سطح اول…');
    await runScan({
      defId: def.id, uaKeys: keys, settings: s(), qty,
      onStage: (stage, res) => {
        if (res.error) { setStatus(`خطا: ${res.error}`); return; }
        if (stage === 'one') {
          rows = res.rows;
          funnelBar(root.querySelector('#funnel'), res.funnel);
          table.set(rows);
          drawKpis();
          setStatus(`مرحله یک در ${res.ms} میلی‌ثانیه — ${res.total} ردیف، ${rows.length} نمایش. مرحله دو…`);
        } else {
          const byId2 = new Map(res.rows.map((r) => [r.id, r]));
          rows = rows.map((r) => byId2.get(r.id) || r);
          // افت مظنه رتبه‌ها را زیر و رو می‌کند، پس دوباره مرتب می‌شود
          table.set(rows);
          table.sortBy(s().rankBy);
          drawKpis();
          if (picked) { const f = byId2.get(picked.id); if (f) showDetail(f); }
          setStatus(`مرحله دو کامل — عمق ${res.asked || 0} نماد گرفته شد. ${rows.length} ردیف.`);
        }
      },
    });
    busy = false;
  }

  root.querySelector('#run').addEventListener('click', run);
  auto.addEventListener('change', () => {
    clearInterval(timer);
    if (auto.checked) { run(); timer = setInterval(run, Math.max(10, s().watchIntervalSec * 3) * 1000); }
  });

  // اشتراک عکس لحظه‌ای فقط تا وقتی این تب باز است
  const offWatch = api.subscribeWatch((w) => {
    pushRows(w, !w.changed);
  });

  setStatus();
  return () => { offWatch(); offChain(); clearInterval(timer); };
}
