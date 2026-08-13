// تب تحلیل رول — فاز ۷.
//
// تصمیم رول، مقایسه دو پریمیوم نیست. تفاضل دو موقعیت است:
//
//   D(S) = بازده موقعیت جدید در سررسید − بازده موقعیت فعلی در سررسید
//
// نقاط تغییر علامت D مرز تصمیم‌اند. همین یک تابع جای ده جدول مقایسه‌ای را
// می‌گیرد و از همان موتور بازده مشترک می‌آید.

import { rollAnalysis, markToMarket } from '/core/positions.mjs';
import { payoffSvg, diffSvg } from '/ui/chart.mjs';
import { fmt } from '/ui/table.mjs';
import { onChain, chainState, pushRows, chainDetail } from '/ui/scanner.mjs';

export async function mount(root, { state, api }) {
  const s = () => state.settings;
  let positions = [];
  let sel = 0;
  let quotesByIns = new Map();
  let detail = null;
  let candidates = [];

  root.innerHTML = `
    <div class="page-head">
      <h2>تحلیل رول</h2>
      <p>پای فعلی را می‌بندی و پای تازه می‌فروشی. سؤال درست این نیست که پریمیوم تازه چقدر است،
         این است که در کدام قیمت پایه، موقعیت جدید بهتر از موقعیت فعلی درمی‌آید.</p>
    </div>

    <div class="split">
      <section class="card">
        <h3>موقعیت فعلی</h3>
        <div class="field"><label>انتخاب موقعیت</label><select id="pos"></select></div>
        <div class="field"><label>پایی که بسته می‌شود</label><select id="leg"></select></div>
        <dl class="kv" id="cur" style="margin-top:10px"></dl>
      </section>
      <section class="card">
        <h3>پای تازه</h3>
        <div class="field"><label>سررسید</label><select id="exp"></select></div>
        <div class="field"><label>قرارداد تازه</label><select id="new"></select></div>
        <p class="note" id="newnote"></p>
      </section>
    </div>

    <div class="kpis" id="kpis"></div>

    <section class="card">
      <h3 id="dtitle">تفاضل دو موقعیت</h3>
      <p class="note">بالای صفر یعنی رول بهتر است، پایین صفر یعنی نگه داشتن. دایره‌ها مرز تصمیم‌اند.</p>
      <div id="dchart"></div>
      <div class="legend" id="dlegend"></div>
    </section>

    <div class="split">
      <section class="card"><h3>موقعیت فعلی در سررسید</h3><div id="c1"></div></section>
      <section class="card"><h3>موقعیت پس از رول</h3><div id="c2"></div></section>
    </div>`;

  const el = (id) => root.querySelector(id);

  async function load() {
    try { positions = await (await fetch('/api/positions')).json(); }
    catch { positions = []; }
    el('#pos').innerHTML = positions.length
      ? positions.map((p, i) => `<option value="${i}">${p.title || 'موقعیت'} — ${p.uaName || p.uaIns}</option>`).join('')
      : '<option value="">موقعیتی ثبت نشده</option>';
    if (!positions.length) {
      el('#kpis').innerHTML = `<div class="kpi"><div class="k">موقعیت</div><div class="v">—</div>
        <div class="s">اول در تب موقعیت‌های من یک موقعیت ثبت کن</div></div>`;
      return;
    }
    await pickPos(0);
  }

  async function pickPos(i) {
    sel = i;
    const p = positions[i];
    el('#leg').innerHTML = p.legs
      .map((l, j) => `<option value="${j}" ${l.kind !== 'underlying' ? '' : 'disabled'}>
        ${l.side === 'sell' ? 'فروش' : 'خرید'} ${l.kind === 'underlying' ? 'سهم پایه' : (l.kind === 'call' ? 'کال' : 'پوت') + ' ' + Math.round(l.strike).toLocaleString('en-US')}</option>`)
      .join('');
    const firstOpt = p.legs.findIndex((l) => l.kind !== 'underlying');
    el('#leg').value = String(Math.max(0, firstOpt));

    const res = await chainDetail(p.uaIns);
    detail = res.error ? null : res.ua;
    if (detail) {
      el('#exp').innerHTML = detail.expiries.map((ex, k) => `<option value="${k}">${ex.days} روز</option>`).join('');
      // پیش‌فرض: سررسید دورتر از پای فعلی
      const cur = p.legs[Number(el('#leg').value)];
      const idx = detail.expiries.findIndex((ex) => ex.days > (cur?.days || 0));
      el('#exp').value = String(idx >= 0 ? idx : 0);
      fillNew();
    }
    await priceAll();
  }

  function fillNew() {
    if (!detail) return;
    const p = positions[sel];
    const cur = p.legs[Number(el('#leg').value)];
    const ex = detail.expiries[Number(el('#exp').value) || 0];
    if (!ex || !cur) return;
    const put = cur.kind === 'put';
    candidates = ex.strikes.map((st) => ({ st, q: put ? st.put : st.call, days: ex.days }));
    el('#new').innerHTML = candidates.map((c, i) => `
      <option value="${i}">اعمال ${Math.round(c.st.strike).toLocaleString('en-US')} — تقاضا ${Math.round(c.q.bid).toLocaleString('en-US')} — موقعیت باز ${Math.round(c.q.oi).toLocaleString('en-US')}</option>`).join('');
    const nearHigher = candidates.findIndex((c) => c.st.strike > cur.strike);
    el('#new').value = String(nearHigher >= 0 ? nearHigher : 0);
    draw();
  }

  async function priceAll() {
    const p = positions[sel];
    if (!p) return;
    const codes = new Set([p.uaIns, ...p.legs.map((l) => l.ins).filter(Boolean),
      ...candidates.map((c) => c.q.ins).filter(Boolean)].filter(Boolean));
    if (!codes.size) return;
    try {
      const q = [...codes].slice(0, 180).join(',');
      const [books, infos] = await Promise.all([
        fetch(`/api/books?ins=${q}`).then((r) => r.json()),
        fetch(`/api/infos?ins=${q}`).then((r) => r.json()),
      ]);
      for (const ins of codes) {
        const b = books[ins]?.book || [];
        const i2 = infos[ins] || {};
        quotesByIns.set(ins, {
          bid: b[0]?.bid || 0, bidQty: b[0]?.bidQty || 0,
          ask: b[0]?.ask || 0, askQty: b[0]?.askQty || 0,
          last: i2.last || 0, close: i2.close || 0, state: i2.state, staleSec: i2.staleSec, book: b,
        });
      }
      draw();
    } catch { /* نوار بالا خبر می‌دهد */ }
  }

  function draw() {
    const p = positions[sel];
    if (!p || !candidates.length) return;
    const closeIdx = Number(el('#leg').value);
    const cand = candidates[Number(el('#new').value) || 0];
    if (!cand) return;

    const fees = { buyStock: s().feeBuyStock, sellStock: s().feeSellStock, option: s().feeOption, exercise: s().feeExercise };
    const uaQ = quotesByIns.get(p.uaIns) || {};
    const spot = uaQ.last || uaQ.close || p.legs.find((l) => l.kind === 'underlying')?.price || 0;
    const quotes = p.legs.map((l) => (l.kind === 'underlying' ? uaQ : (quotesByIns.get(l.ins) || {})));

    const cur = p.legs[closeIdx];
    const newLeg = {
      kind: cur.kind, side: cur.side, ratio: cur.ratio, size: cur.size,
      strike: cand.st.strike, days: cand.days, ins: cand.q.ins,
    };
    const newQuote = quotesByIns.get(cand.q.ins) || { bid: cand.q.bid, ask: cand.q.ask, close: cand.q.close, last: cand.q.last };

    const r = rollAnalysis({ pos: p, quotes, closeIdx, newLeg, newQuote, opt: { fees, spot, basis: 'BOOK' } });
    const m = markToMarket(p, quotes, { fees, spot, spotClose: uaQ.close || spot });

    el('#cur').innerHTML = `
      <dt>پایه</dt><dd>${p.uaName || p.uaIns}</dd>
      <dt>قیمت پایه</dt><dd>${fmt.money(spot)}</dd>
      <dt>تعداد قرارداد</dt><dd>${p.qty}</dd>
      <dt>سود و زیان جاری</dt><dd>${fmt.money(m.pnlTotal)}</dd>
      <dt>سربه‌سری فعلی</dt><dd>${r.curBreakevens.map((b) => Math.round(b).toLocaleString('en-US')).join(' , ') || '—'}</dd>`;

    el('#newnote').textContent =
      `هزینه بستن پای فعلی از عرضه: ${fmt.money(-r.closeCash)} — بستانکار پای تازه از تقاضا: ${fmt.money(r.newCash)}`;

    const better = r.atSpot > 0;
    el('#kpis').innerHTML = [
      ['تفاضل در قیمت فعلی', fmt.money(r.atSpotTotal), better ? 'رول بهتر است' : 'نگه داشتن بهتر است', better ? 'gain' : 'loss'],
      ['خالص نقدی رول', fmt.money(r.netCashChange), r.netCashChange >= 0 ? 'بستانکار' : 'بدهکار', r.netCashChange >= 0 ? 'gain' : 'loss'],
      ['سقف سود فعلی', fmt.money(r.curMaxProfit), '', ''],
      ['سقف سود پس از رول', fmt.money(r.nextMaxProfit), '', ''],
      ['سربه‌سری فعلی', fmt.money(r.curBreakevens[0]), '', ''],
      ['سربه‌سری پس از رول', fmt.money(r.nextBreakevens[0]), '', ''],
      ['مرز تصمیم', r.crossings.length ? r.crossings.map((x) => Math.round(x).toLocaleString('en-US')).join(' , ') : 'بی‌مرز', 'قیمت پایه', ''],
    ].map(([k, v, sub, c]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${c}">${v}</div><div class="s">${sub}</div></div>`).join('');

    const ks = [...r.curAnalysis.strikes, ...r.nextAnalysis.strikes, spot];
    const lo = Math.max(1, Math.min(...ks) * 0.75);
    const hi = Math.max(...ks) * 1.3;
    const d = diffSvg((S) => r.diff(S) * p.qty, lo, hi, { spot, width: 760, height: 240 });
    el('#dchart').innerHTML = d.svg;
    el('#dtitle').textContent = `تفاضل دو موقعیت — ${r.verdict}`;
    el('#dlegend').innerHTML = `
      <span>${r.note}</span>
      <span>مرز تصمیم: ${d.crossings.map((x) => Math.round(x).toLocaleString('en-US')).join(' , ') || 'ندارد'}</span>`;

    el('#c1').innerHTML = payoffSvg(p.legs, r.curNet, { fees, spot, width: 480, height: 220 }).svg;
    el('#c2').innerHTML = payoffSvg(r.nextLegs, r.nextNet, { fees, spot, width: 480, height: 220 }).svg;
  }

  el('#pos').addEventListener('change', () => pickPos(Number(el('#pos').value)));
  el('#leg').addEventListener('change', () => fillNew());
  el('#exp').addEventListener('change', () => { fillNew(); priceAll(); });
  el('#new').addEventListener('change', draw);

  const offChain = onChain(() => {});
  const offWatch = api.subscribeWatch((w) => pushRows(w, !w.changed));
  await load();
  const timer = setInterval(priceAll, 15000);
  return () => { offChain(); offWatch(); clearInterval(timer); };
}
