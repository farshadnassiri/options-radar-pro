// تب موقعیت‌های من — فاز ۷.
//
// موقعیت‌هایی که واقعاً اجرا کرده‌ای، با قیمت ورود واقعی خودت. ارزش‌گذاری هر
// لحظه یعنی هزینه بستن موقعیت در بازار، نه پریمیومی که گرفتی.

import { markToMarket, blankPosition } from '/core/positions.mjs';
import { todayJalali } from '/core/jalali.mjs';
import { payoffSvg } from '/ui/chart.mjs';
import { fmt } from '/ui/table.mjs';
import { onChain, chainState, pushRows, chainDetail } from '/ui/scanner.mjs';

const KINDS = [
  ['covered-call', 'کاوردکال — سهم + فروش کال'],
  ['short-call', 'فروش کال بدون پوشش'],
  ['short-put', 'فروش پوت'],
  ['long-call', 'خرید کال'],
  ['long-put', 'خرید پوت'],
];

export async function mount(root, { state, api }) {
  const s = () => state.settings;
  let positions = [];
  let quotesByIns = new Map();
  let uaList = [];
  let expanded = null;

  root.innerHTML = `
    <div class="page-head">
      <h2>موقعیت‌های من</h2>
      <p>پریمیوم دریافتی تا سررسید سود تحقق‌یافته نیست. موقعیت فروش هر روز به قیمت روز بدهی است،
         پس ارزش‌گذاری اینجا هزینه بستن در بازار است.</p>
    </div>

    <div class="kpis" id="kpis"></div>

    <section class="card">
      <h3>افزودن موقعیت</h3>
      <p class="note">نماد پایه و قرارداد، انتخابی است. قیمت ورود همان چیزی است که واقعاً پرداخت یا دریافت کردی.</p>
      <div class="grid" id="form"></div>
      <div class="bar" style="margin-top:12px">
        <button class="btn" id="add">افزودن</button>
        <span class="sp"></span>
        <span id="msg" class="saved"></span>
      </div>
    </section>

    <section class="card">
      <h3>فهرست موقعیت‌ها</h3>
      <div class="scroll" style="max-height:none"><table class="data" id="list"></table></div>
    </section>

    <section class="card" id="det-card" style="display:none">
      <h3 id="det-title">جزئیات موقعیت</h3>
      <div class="detail" id="det"></div>
    </section>`;

  // ——————————————— فرم ———————————————
  const form = root.querySelector('#form');
  const F = {};
  const field = (key, label, kind, extra = '') => {
    const w = document.createElement('div');
    w.className = 'field';
    if (kind === 'select') w.innerHTML = `<label>${label}</label><select id="f-${key}">${extra}</select>`;
    else w.innerHTML = `<label>${label}</label><input type="${kind}" id="f-${key}" ${extra}>`;
    form.appendChild(w);
    F[key] = w.querySelector(`#f-${key}`);
    return F[key];
  };

  field('kind', 'نوع موقعیت', 'select', KINDS.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''));
  field('ua', 'نماد پایه', 'select', '<option value="">— انتخاب کن —</option>');
  field('exp', 'سررسید', 'select', '');
  field('opt', 'قرارداد اختیار', 'select', '');
  field('date', 'تاریخ ورود (شمسی)', 'text', `value="${todayJalali()}"`);
  field('qty', 'تعداد قرارداد', 'number', 'value="1" min="1"');
  field('sPrice', 'قیمت ورود سهم پایه', 'number', 'value="0"');
  field('oPrice', 'قیمت ورود اختیار', 'number', 'value="0"');

  function refreshUaOptions() {
    const cur = F.ua.value;
    F.ua.innerHTML = '<option value="">— انتخاب کن —</option>'
      + uaList.map((u) => `<option value="${u.ins}" ${u.ins === cur ? 'selected' : ''}>${u.name || u.ins}</option>`).join('');
  }

  let detail = null;
  F.ua.addEventListener('change', async () => {
    if (!F.ua.value) return;
    const res = await chainDetail(F.ua.value);
    if (res.error) return;
    detail = res.ua;
    F.exp.innerHTML = detail.expiries.map((ex, i) => `<option value="${i}">${ex.days} روز</option>`).join('');
    F.sPrice.value = Math.round(detail.last || detail.close || 0);
    fillOptions();
  });
  F.exp.addEventListener('change', fillOptions);
  F.kind.addEventListener('change', fillOptions);

  function wantPut() { return F.kind.value.includes('put'); }

  function fillOptions() {
    if (!detail) return;
    const ex = detail.expiries[Number(F.exp.value) || 0];
    if (!ex) return;
    const put = wantPut();
    F.opt.innerHTML = ex.strikes.map((st) => {
      const q = put ? st.put : st.call;
      return `<option value="${q.ins}" data-strike="${st.strike}" data-size="${st.size}" data-days="${ex.days}" data-bid="${q.bid}" data-ask="${q.ask}" data-close="${q.close}">
        ${q.name || q.ins} — اعمال ${Math.round(st.strike).toLocaleString('en-US')} — تقاضا ${Math.round(q.bid).toLocaleString('en-US')}</option>`;
    }).join('');
    const first = F.opt.selectedOptions[0];
    if (first) F.oPrice.value = Math.round(Number(first.dataset.bid) || Number(first.dataset.close) || 0);
  }
  F.opt.addEventListener('change', () => {
    const o = F.opt.selectedOptions[0];
    if (o) F.oPrice.value = Math.round(Number(o.dataset.bid) || Number(o.dataset.close) || 0);
  });

  const msg = root.querySelector('#msg');
  const flash = (t, bad) => {
    msg.textContent = t;
    msg.style.color = bad ? 'var(--loss)' : 'var(--gain)';
    setTimeout(() => { msg.textContent = ''; }, 3000);
  };

  root.querySelector('#add').addEventListener('click', async () => {
    const o = F.opt.selectedOptions[0];
    if (!o || !F.ua.value) { flash('نماد پایه و قرارداد را انتخاب کن.', true); return; }
    const strike = Number(o.dataset.strike);
    const size = Number(o.dataset.size) || 1000;
    const days = Number(o.dataset.days);
    const kind = F.kind.value;
    const put = wantPut();
    const legs = [];
    if (kind === 'covered-call') {
      legs.push({ kind: 'underlying', side: 'buy', ratio: 1, size, price: Number(F.sPrice.value), ins: F.ua.value });
    }
    legs.push({
      kind: put ? 'put' : 'call',
      side: kind.startsWith('long') ? 'buy' : 'sell',
      ratio: 1, size, strike, days,
      price: Number(F.oPrice.value), ins: o.value, name: o.textContent.split('—')[0].trim(),
    });

    positions.push({
      ...blankPosition(),
      title: `${KINDS.find(([v]) => v === kind)[1].split('—')[0].trim()} ${detail.name}`,
      uaIns: F.ua.value, uaName: detail.name,
      entryDate: F.date.value, qty: Math.max(1, Number(F.qty.value) || 1),
      legs,
    });
    await save();
    flash('موقعیت افزوده شد.');
    render();
  });

  async function save() {
    try {
      await fetch('/api/positions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(positions),
      });
    } catch { flash('ذخیره نشد.', true); }
  }

  // ——————————————— ارزش‌گذاری ———————————————
  function quoteFor(leg) {
    const q = quotesByIns.get(leg.ins);
    if (q) return q;
    return { bid: 0, ask: 0, last: 0, close: 0 };
  }

  function evalPos(p) {
    const fees = { buyStock: s().feeBuyStock, sellStock: s().feeSellStock, option: s().feeOption, exercise: s().feeExercise };
    const uaQ = quotesByIns.get(p.uaIns) || {};
    const spot = uaQ.last || uaQ.close || p.legs.find((l) => l.kind === 'underlying')?.price || 0;
    const quotes = p.legs.map((l) => (l.kind === 'underlying' ? uaQ : quoteFor(l)));
    const m = markToMarket(p, quotes, {
      fees, spot, spotClose: uaQ.close || spot,
      creditMode: s().creditSpreadMargin, capitalMode: s().capitalMode,
      basis: s().priceBasis === 'BOOK' ? 'BOOK' : s().priceBasis,
    });
    return { m, spot, quotes, fees };
  }

  function render() {
    const evals = positions.map((p) => ({ p, ...evalPos(p) }));

    const rows = evals.map(({ p, m }, i) => `
      <tr data-i="${i}" style="cursor:pointer">
        <td>${p.title || '—'}</td>
        <td>${p.uaName || p.uaIns}</td>
        <td>${p.legs.map((l) => `${l.side === 'sell' ? '−' : '+'}${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت') + ' ' + Math.round(l.strike).toLocaleString('en-US')}`).join(' ')}</td>
        <td class="n">${p.qty}</td>
        <td class="n">${p.entryDate || '—'}</td>
        <td class="n">${m.daysHeld ?? '—'}</td>
        <td class="n">${fmt.money(m.capital * p.qty)}</td>
        <td class="n" style="color:${m.pnlTotal >= 0 ? 'var(--gain)' : 'var(--loss)'}">${fmt.money(m.pnlTotal)}</td>
        <td class="n">${fmt.pct(m.retPct)}</td>
        <td class="n">${fmt.pct(m.retMonthPct)}</td>
        <td class="n">${fmt.money(m.ifHeld.atSpot * p.qty)}</td>
        <td><button class="ghost" data-del="${i}">حذف</button></td>
      </tr>`).join('');

    root.querySelector('#list').innerHTML = positions.length ? `
      <thead><tr>
        <th>عنوان</th><th>پایه</th><th>پاها</th><th>تعداد</th><th>تاریخ ورود</th><th>روز</th>
        <th>سرمایه</th><th>سود و زیان الان</th><th>بازده ٪</th><th>ماهانه ٪</th><th>اگر تا سررسید بماند</th><th></th>
      </tr></thead><tbody>${rows}</tbody>`
      : '<tbody><tr><td style="padding:16px;color:var(--muted)">موقعیتی ثبت نشده. از فرم بالا اضافه کن.</td></tr></tbody>';

    for (const b of root.querySelectorAll('[data-del]')) {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        positions.splice(Number(b.dataset.del), 1);
        await save();
        render();
      });
    }
    for (const tr of root.querySelectorAll('#list tbody tr[data-i]')) {
      tr.addEventListener('click', () => { expanded = Number(tr.dataset.i); drawDetail(); });
    }

    const tot = evals.reduce((a, x) => a + x.m.pnlTotal, 0);
    const cap = evals.reduce((a, x) => a + x.m.capital * x.p.qty, 0);
    root.querySelector('#kpis').innerHTML = [
      ['موقعیت باز', fmt.int(positions.length), ''],
      ['سرمایه درگیر', fmt.money(cap), 'ریال'],
      ['سود و زیان جاری', fmt.money(tot), tot >= 0 ? 'در سود' : 'در زیان'],
      ['بازده روی سرمایه', `${fmt.pct(cap > 0 ? (tot / cap) * 100 : NaN)}٪`, ''],
      ['قیمت‌گیری', quotesByIns.size ? `${quotesByIns.size} نماد` : 'بی‌قیمت — اسکن نشده', ''],
    ].map(([k, v, sub]) => `<div class="kpi"><div class="k">${k}</div>
      <div class="v ${k.includes('سود') ? (tot >= 0 ? 'gain' : 'loss') : ''}">${v}</div><div class="s">${sub}</div></div>`).join('');

    if (expanded != null) drawDetail();
  }

  function drawDetail() {
    const p = positions[expanded];
    if (!p) { root.querySelector('#det-card').style.display = 'none'; return; }
    const { m, spot, fees } = evalPos(p);
    root.querySelector('#det-card').style.display = '';
    root.querySelector('#det-title').textContent = `${p.title} — ${p.uaName || p.uaIns}`;
    const { svg } = payoffSvg(p.legs, m.entryNet, { fees, spot, width: 720, height: 250 });

    const legRows = m.perLeg.map((l) => `
      <tr>
        <td>${l.side === 'sell' ? 'فروش' : 'خرید'} ${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت') + ' ' + fmt.money(l.strike)}</td>
        <td class="n">${fmt.money(l.entryPrice)}</td>
        <td class="n">${fmt.money(l.markPrice)}</td>
        <td class="n">${fmt.int(l.units)}</td>
        <td class="n">${fmt.money(l.feeIn + l.feeOut)}</td>
        <td class="n" style="color:${l.pnl >= 0 ? 'var(--gain)' : 'var(--loss)'}">${fmt.money(l.pnl)}</td>
      </tr>`).join('');

    root.querySelector('#det').innerHTML = `
      <div>
        ${svg}
        <h4 style="margin:14px 0 4px;font-size:12px">تفکیک هر پا — برای یک دست قرارداد</h4>
        <table class="mini">
          <thead><tr><th>پا</th><th>قیمت ورود</th><th>قیمت بستن</th><th>سهم درگیر</th><th>کارمزد رفت و برگشت</th><th>سود و زیان</th></tr></thead>
          <tbody>${legRows}</tbody>
        </table>
        <p class="note" style="margin-top:10px">قیمت بستن، مظنه مخالف است: موقعیت خرید روی تقاضا بسته می‌شود و موقعیت فروش روی عرضه بازخرید می‌شود.</p>
      </div>
      <div>
        <dl class="kv">
          <dt>جریان نقد ورود</dt><dd>${fmt.money(m.entryNet)}</dd>
          <dt>ارزش بستن الان</dt><dd>${fmt.money(m.closeNet)}</dd>
          <dt>سود و زیان یک دست</dt><dd>${fmt.money(m.pnl)}</dd>
          <dt>سود و زیان کل</dt><dd>${fmt.money(m.pnlTotal)}</dd>
          <dt>سرمایه درگیر</dt><dd>${fmt.money(m.capital)}</dd>
          <dt>مبنای سرمایه</dt><dd>${m.capitalLabel}</dd>
          <dt>وجه تضمین</dt><dd>${fmt.money(m.margin)}</dd>
          <dt>تضمین شرطی</dt><dd>${fmt.money(m.conditionalMargin)}</dd>
          <dt>روز نگه‌داری</dt><dd>${m.daysHeld ?? '—'}</dd>
          <dt>بازده</dt><dd>${fmt.pct(m.retPct)}٪</dd>
          <dt>بازده ماهانه</dt><dd>${fmt.pct(m.retMonthPct)}٪</dd>
        </dl>
        <h4 style="margin:14px 0 4px;font-size:12px">اگر تا سررسید نگه داری</h4>
        <dl class="kv">
          <dt>در قیمت فعلی پایه</dt><dd>${fmt.money(m.ifHeld.atSpot)}</dd>
          <dt>بیشترین سود</dt><dd>${fmt.money(m.ifHeld.maxProfit)}</dd>
          <dt>بیشترین زیان</dt><dd>${fmt.money(m.ifHeld.maxLoss)}</dd>
          <dt>سربه‌سری</dt><dd>${m.ifHeld.breakevens.map((b) => Math.round(b).toLocaleString('en-US')).join(' , ') || '—'}</dd>
        </dl>
        <p class="note" style="margin-top:10px">برای تصمیم رول همین موقعیت، به تب تحلیل رول برو.</p>
      </div>`;
  }

  // ——————————————— داده ———————————————
  async function load() {
    try { positions = await (await fetch('/api/positions')).json(); }
    catch { positions = []; }
    render();
  }

  async function priceAll() {
    const codes = new Set();
    for (const p of positions) {
      if (p.uaIns) codes.add(p.uaIns);
      for (const l of p.legs) if (l.ins) codes.add(l.ins);
    }
    if (!codes.size) return;
    try {
      const q = [...codes].join(',');
      const [books, infos] = await Promise.all([
        fetch(`/api/books?ins=${q}`).then((r) => r.json()),
        fetch(`/api/infos?ins=${q}`).then((r) => r.json()),
      ]);
      quotesByIns = new Map();
      for (const ins of codes) {
        const b = books[ins]?.book || [];
        const i2 = infos[ins] || {};
        quotesByIns.set(ins, {
          bid: b[0]?.bid || 0, bidQty: b[0]?.bidQty || 0,
          ask: b[0]?.ask || 0, askQty: b[0]?.askQty || 0,
          last: i2.last || 0, close: i2.close || 0, low: i2.low || 0, high: i2.high || 0,
          state: i2.state, staleSec: i2.staleSec, book: b,
        });
      }
      render();
    } catch { /* نوار بالا خبر می‌دهد */ }
  }

  const offChain = onChain((cs) => { uaList = cs.list; refreshUaOptions(); });
  if (chainState.list.length) { uaList = chainState.list; refreshUaOptions(); }
  const offWatch = api.subscribeWatch((w) => pushRows(w, !w.changed));

  await load();
  await priceAll();
  const timer = setInterval(priceAll, 15000);
  return () => { offChain(); offWatch(); clearInterval(timer); };
}
