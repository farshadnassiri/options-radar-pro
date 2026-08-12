// جدول مشترک — مجازی‌سازی‌شده، مرتب‌شدنی روی هر ستون، رنگی.
//
// چرا مجازی‌سازی: ده هزار ردیف با پنجاه ردیف رسم‌شده. مرتب‌سازی روی شاخص
// انجام می‌شود نه روی ردیف، و رسم فقط برای ردیف‌های داخل قاب.
//
// رنگ سه لایه دارد:
//   طیف حرارتی روی ستون‌های کمی، مثل بازده و هزینه اجرا
//   رنگ وضعیت ردیف، برای در سود بودن و سررسید نزدیک و مظنه کهنه
//   نشانگر جهت تغییر نسبت به عکس لحظه‌ای قبلی

const ROW_H = 27;
const OVER = 12;

export const fmt = {
  money: (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : v === Infinity ? '∞' : v === -Infinity ? '−∞' : '—'),
  pct: (v) => (Number.isFinite(v) ? v.toFixed(2) : '—'),
  num: (v) => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) < 1 ? v.toFixed(4) : v.toFixed(2)) : '—'),
  int: (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—'),
  text: (v) => (v == null ? '—' : String(v)),
  list: (v) => (Array.isArray(v)
    ? (v.length ? v.map((x) => (typeof x === 'number' ? Math.round(x).toLocaleString('en-US') : x)).join(' , ') : '—')
    : String(v ?? '—')),
};

const HEAT = {
  gain: ['--gain-soft', '--gain'],
  loss: ['--loss-soft', '--loss'],
  prob: ['--accent-soft', '--accent'],
};

/**
 * جدول را می‌سازد و یک دسته کنترل برمی‌گرداند.
 *   cols: [{ key, label, fmt, heat, pin }]
 */
export function makeTable(host, cols, opts = {}) {
  // یک جدول واحد با سرستون چسبان. دو جدول جدا، ستون‌ها را هم‌تراز نمی‌کند،
  // و مجازی‌سازی با ردیف فاصله‌گذار انجام می‌شود نه با جابه‌جایی، تا عرض
  // ستون‌ها از محتوای واقعی بیاید.
  host.innerHTML = `
    <div class="tbl-wrap">
      <div class="tbl-body" tabindex="0"><table class="data"><thead><tr></tr></thead><tbody></tbody></table></div>
      <div class="tbl-foot"><span id="tbl-count"></span><span class="sp"></span><span id="tbl-sort"></span></div>
    </div>`;

  const headRow = host.querySelector('thead tr');
  const body = host.querySelector('.tbl-body');
  const tbody = host.querySelector('tbody');
  const foot = host.querySelector('#tbl-count');
  const sortLbl = host.querySelector('#tbl-sort');

  let rows = [];
  let view = [];
  let sortKey = opts.sortKey || cols[0].key;
  let sortDir = -1;
  const ranges = new Map();

  for (const c of cols) {
    const th = document.createElement('th');
    th.textContent = c.label;
    th.title = `مرتب‌سازی بر ${c.label}`;
    th.dataset.key = c.key;
    th.addEventListener('click', () => {
      if (sortKey === c.key) sortDir = -sortDir;
      else { sortKey = c.key; sortDir = -1; }
      apply();
    });
    headRow.appendChild(th);
  }

  function computeRanges() {
    ranges.clear();
    for (const c of cols) {
      if (!c.heat) continue;
      let lo = Infinity, hi = -Infinity;
      for (const r of view) {
        const v = r[c.key];
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (lo < hi) ranges.set(c.key, [lo, hi]);
    }
  }

  function heatStyle(c, v) {
    const rg = ranges.get(c.key);
    if (!rg || !Number.isFinite(v)) return '';
    const [lo, hi] = rg;
    const t = (v - lo) / (hi - lo);
    const [soft, strong] = HEAT[c.heat] || HEAT.prob;
    return `background:color-mix(in srgb, var(${strong}) ${Math.round(t * 26)}%, var(${soft}) ${Math.round((1 - t) * 40)}%)`;
  }

  function rowClass(r) {
    if (r.__flash) return 'flash';
    if (!r.executable) return 'unexec';
    if (r.warn?.includes('زیان نامحدود')) return 'risky';
    if (r.shortDte) return 'soon';
    if (r.warn?.includes('مظنه کهنه')) return 'stale';
    return '';
  }

  function apply() {
    const dir = sortDir;
    const k = sortKey;
    view = [...rows].sort((a, b) => {
      const x = a[k], y = b[k];
      const xn = typeof x === 'number', yn = typeof y === 'number';
      if (xn || yn) {
        const xf = Number.isFinite(x) ? x : -Infinity;
        const yf = Number.isFinite(y) ? y : -Infinity;
        return (xf - yf) * dir;
      }
      return String(x ?? '').localeCompare(String(y ?? ''), 'fa') * dir;
    });
    computeRanges();
    for (const th of headRow.children) {
      th.dataset.sorted = th.dataset.key === k ? (dir < 0 ? 'desc' : 'asc') : '';
    }
    const col = cols.find((c) => c.key === k);
    sortLbl.textContent = `مرتب بر ${col?.label ?? k} ${dir < 0 ? '↓' : '↑'}`;
    foot.textContent = `${view.length.toLocaleString('en-US')} ردیف`;
    draw();
  }

  function draw() {
    const top = body.scrollTop;
    const h = body.clientHeight || 400;
    const first = Math.max(0, Math.floor(top / ROW_H) - OVER);
    const last = Math.min(view.length, Math.ceil((top + h) / ROW_H) + OVER);
    const frag = document.createDocumentFragment();

    for (let i = first; i < last; i++) {
      const r = view[i];
      const tr = document.createElement('tr');
      tr.className = rowClass(r);
      tr.dataset.i = i;
      for (const c of cols) {
        const td = document.createElement('td');
        const v = r[c.key];
        const isNum = c.fmt === 'money' || c.fmt === 'pct' || c.fmt === 'num' || c.fmt === 'int';
        td.className = isNum ? 'n' : '';
        td.textContent = (fmt[c.fmt] || fmt.text)(v);
        if (c.heat) td.style.cssText = heatStyle(c, v);
        if (isNum && Number.isFinite(v) && v < 0) td.style.color = 'var(--loss)';
        tr.appendChild(td);
      }
      tr.addEventListener('click', () => opts.onPick?.(r));
      frag.appendChild(tr);
    }
    tbody.innerHTML = '';
    if (first > 0) {
      const sp = document.createElement('tr');
      sp.style.height = `${first * ROW_H}px`;
      sp.innerHTML = `<td colspan="${cols.length}"></td>`;
      tbody.appendChild(sp);
    }
    tbody.appendChild(frag);
    const rest = view.length - last;
    if (rest > 0) {
      const sp = document.createElement('tr');
      sp.style.height = `${rest * ROW_H}px`;
      sp.innerHTML = `<td colspan="${cols.length}"></td>`;
      tbody.appendChild(sp);
    }
    if (!view.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" style="padding:18px;color:var(--muted)">
        ردیفی نمانده. نوار تشخیص بالا می‌گوید ترکیب‌ها کجا افتادند.</td></tr>`;
    }
  }

  body.addEventListener('scroll', () => requestAnimationFrame(draw), { passive: true });

  return {
    set(next) { rows = next || []; apply(); },
    get() { return view; },
    sortBy(key) { sortKey = key; sortDir = -1; apply(); },
    redraw: draw,
  };
}

/** نوار تشخیص — امضای هر تب: چند ترکیب ساخته شد و کجا افتاد. */
export function funnelBar(host, f) {
  if (!host) return;
  if (!f) { host.innerHTML = '<div class="funnel-key"><span>اسکنی انجام نشده.</span></div>'; return; }
  const parts = [
    ['کنار گذاشته — بی‌مظنه', f.noQuote, '--muted'],
    ['کنار گذاشته — عمق ناکافی', f.noDepth, '--warn'],
    ['کنار گذاشته — فیلتر تو', f.filtered, '--accent-2'],
    ['مانده', f.kept, '--accent'],
  ];
  const total = parts.reduce((a, p) => a + p[1], 0) || 1;
  host.innerHTML = `
    <div class="funnel">
      ${parts.map(([, v, c]) => `<span style="width:${(v / total) * 100}%;background:var(${c})"></span>`).join('')}
    </div>
    <div class="funnel-key">
      <span><b>${f.built.toLocaleString('en-US')}</b> ترکیب ساخته شد</span>
      ${parts.map(([k, v, c]) => `<span><i style="background:var(${c})"></i>${k}: <b>${v.toLocaleString('en-US')}</b></span>`).join('')}
      ${f.capped ? '<span style="color:var(--warn)">سقف ترکیب خورد — پنجره قیمت اعمال را باریک‌تر کن</span>' : ''}
    </div>`;
}
