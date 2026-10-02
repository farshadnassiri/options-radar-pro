// تب «میز تلاطم» — تلاطم ضمنیِ یک پایه در طول روز و در برابر روزهای قبل.
//
// همه‌چیز در `ui/vol-desk-view.mjs` است؛ اینجا فقط انتخاب نماد پایه. فهرست
// پایه‌ها از همان عکس دیده‌بان می‌آید (بی درخواست تازه). نماد انتخابی در
// حافظهٔ مرورگر می‌ماند و از رصد لحظه‌ای و تب‌های استراتژی با
// `openVolDesk` به اینجا فرستاده می‌شود.

import { buildChain, underlyingList } from '/core/chain.mjs';
import { mountVolDesk } from '/ui/vol-desk-view.mjs';
import { VOL_DESK_EVENT, readDeskUa, writeDeskUa } from '/ui/vol-desk-link.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));

export async function mount(root, { state, api }) {
  let list = [];
  let current = readDeskUa();
  if (state.handoff?.to === 'vol-desk') {
    current = { ins: String(state.handoff.uaIns || ''), name: String(state.handoff.uaName || '') };
    state.handoff = null;
    writeDeskUa(current);
  }
  root.innerHTML = `<div class="page-head"><h2>میز تلاطم</h2>
    <p>تلاطم ضمنیِ اکنون در برابر بازگشایی، دیروز و همین ساعت در روزهای قبل — با نمودار و جدول، در دانهٔ ۵ تا ۶۰ دقیقه و روزانه.</p></div>
    <section class="card vd-pick"><label>نماد پایه
      <input type="search" list="vd-ua-list" data-vd-ua placeholder="نام نماد را بنویس یا از فهرست بردار" autocomplete="off" value="${esc(current.name || '')}">
      <datalist id="vd-ua-list"></datalist></label>
      <span class="note" data-vd-ua-note></span></section>
    <div data-vd-host></div>`;
  const input = root.querySelector('[data-vd-ua]');
  const note = root.querySelector('[data-vd-ua-note]');
  const desk = mountVolDesk(root.querySelector('[data-vd-host]'), {
    getUa: () => current,
    getSettings: () => state.settings,
    isVisible: () => root.isConnected && !document.hidden,
  });

  const fillList = (rows) => {
    const next = underlyingList(buildChain(rows), { rFree: Number(state.settings?.rFree) }).filter((u) => u.name);
    if (next.length === list.length) return;
    list = next;
    root.querySelector('#vd-ua-list').innerHTML = list.map((u) => `<option value="${esc(u.name)}"></option>`).join('');
    note.textContent = `${list.length.toLocaleString('fa-IR')} نماد پایه روی تابلو`;
    if (!current.ins && list[0]) choose(list[0]);
    else if (current.ins && !current.name) {
      const hit = list.find((u) => String(u.ins) === current.ins);
      if (hit) { current = { ins: current.ins, name: hit.name }; input.value = hit.name; }
    }
  };
  const choose = (u) => {
    current = { ins: String(u.ins), name: u.name };
    input.value = u.name;
    writeDeskUa(current);
    desk.load();
  };
  input.addEventListener('change', () => {
    const text = input.value.trim();
    const hit = list.find((u) => u.name === text) || list.find((u) => u.name.includes(text));
    if (hit) choose(hit);
  });
  const onPick = (event) => { if (event.detail?.ins) { current = event.detail; input.value = current.name || ''; desk.load(); } };
  document.addEventListener(VOL_DESK_EVENT, onPick);
  const offWatch = api.subscribeWatch((w) => { if (w?.rows?.length) fillList(w.rows); });
  const onResize = () => desk.resize();
  window.addEventListener('resize', onResize);
  if (current.ins) desk.load();

  return () => {
    offWatch?.();
    document.removeEventListener(VOL_DESK_EVENT, onPick);
    window.removeEventListener('resize', onResize);
    desk.dispose();
  };
}
