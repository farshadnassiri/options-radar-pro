// انتخابگر نماد پایه.
//
// انتخاب کاملاً انتخابی است. جعبه جست‌وجو فقط فهرست را کوتاه می‌کند و
// ورودی محاسبه نیست — چیزی که تایپ می‌کنی هیچ‌وقت مستقیم به موتور نمی‌رود.

const KEY = 'picker.selected';

export function makePicker(host, opts = {}) {
  let list = [];
  let selected = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  let filter = '';

  host.innerHTML = `
    <div class="picker">
      <div class="picker-tools">
        <input type="search" id="pk-q" placeholder="کوتاه کردن فهرست" style="flex:1;min-width:140px;
          background:var(--panel-2);border:1px solid var(--line);border-radius:4px;padding:5px 8px;font:inherit;font-size:13px;color:var(--ink)">
        <button class="ghost" data-pre="all">همه</button>
        <button class="ghost" data-pre="liquid">پرمعامله</button>
        <button class="ghost" data-pre="quoted">دارای مظنه</button>
        <button class="ghost" data-pre="none">هیچ</button>
      </div>
      <div class="picker-list" id="pk-list"></div>
      <div class="picker-sum" id="pk-sum"></div>
    </div>`;

  const listHost = host.querySelector('#pk-list');
  const sum = host.querySelector('#pk-sum');
  const q = host.querySelector('#pk-q');

  const save = () => localStorage.setItem(KEY, JSON.stringify([...selected]));

  function render() {
    const shown = filter
      ? list.filter((u) => u.name.includes(filter) || u.ins.includes(filter))
      : list;
    listHost.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const u of shown.slice(0, 400)) {
      const row = document.createElement('label');
      row.className = 'picker-row';
      row.setAttribute('aria-selected', selected.has(u.ins) ? 'true' : 'false');
      row.innerHTML = `
        <input type="checkbox" ${selected.has(u.ins) ? 'checked' : ''}>
        <span>${u.name || u.ins}</span>
        <span class="m">${u.contracts} قرارداد</span>
        <span class="m">${u.quoted} مظنه</span>
        <span class="m">${u.last ? Math.round(u.last).toLocaleString('en-US') : '—'}</span>`;
      row.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) selected.add(u.ins); else selected.delete(u.ins);
        row.setAttribute('aria-selected', e.target.checked ? 'true' : 'false');
        save(); summary(); opts.onChange?.([...selected]);
      });
      frag.appendChild(row);
    }
    listHost.appendChild(frag);
    if (!shown.length) listHost.innerHTML = '<div style="padding:14px;color:var(--muted);font-size:12.5px">نمادی با این نام در دیده‌بان نیست.</div>';
    summary();
  }

  function summary() {
    const picked = list.filter((u) => selected.has(u.ins));
    const contracts = picked.reduce((a, u) => a + u.contracts, 0);
    sum.textContent = selected.size
      ? `${picked.length} نماد انتخاب شده — ${contracts.toLocaleString('en-US')} قرارداد در دامنه اسکن`
      : 'هیچ نمادی انتخاب نشده. تا انتخاب نکنی، اسکنی انجام نمی‌شود.';
  }

  function preset(kind) {
    if (kind === 'none') selected = new Set();
    else if (kind === 'all') selected = new Set(list.map((u) => u.ins));
    else if (kind === 'liquid') selected = new Set(list.slice(0, 12).map((u) => u.ins));
    else if (kind === 'quoted') selected = new Set(list.filter((u) => u.quoted >= 4).map((u) => u.ins));
    save(); render(); opts.onChange?.([...selected]);
  }

  for (const b of host.querySelectorAll('[data-pre]')) {
    b.addEventListener('click', () => preset(b.dataset.pre));
  }
  q.addEventListener('input', () => { filter = q.value.trim(); render(); });

  return {
    setList(next) {
      list = next;
      // نمادهایی که دیگر در دیده‌بان نیستند از انتخاب بیرون می‌روند
      const live = new Set(list.map((u) => u.ins));
      for (const k of [...selected]) if (!live.has(k)) selected.delete(k);
      render();
    },
    selected: () => [...selected],
    count: () => selected.size,
  };
}
