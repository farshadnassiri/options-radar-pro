// جدول مشترک — مجازی‌سازی‌شده، مرتب‌شدنی روی هر ستون، ستون‌هایش انتخابی.
//
// چرا مجازی‌سازی: ده هزار ردیف با پنجاه ردیف رسم‌شده. مرتب‌سازی روی شاخص
// انجام می‌شود نه روی ردیف، و رسم فقط برای ردیف‌های داخل قاب.
//
// ستون‌ها ثابت نیستند. نمای آماده نقطه شروع است، نه قفس: هر ستونی از قرارداد
// ستونی مشترک را می‌شود اضافه یا کم کرد و انتخاب هر جدول جدا در حافظه مرورگر
// می‌ماند. سرستون همیشه بالای قاب می‌چسبد و روی هر ستون مرتب می‌شود.
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

const NUM_FMT = new Set(['money', 'pct', 'num', 'int']);

/** انتخاب ستون هر جدول جدا می‌ماند، تا نمای تب سرمایه نمای تب یونانی را عوض نکند. */
function loadPick(storeKey) {
  if (!storeKey) return null;
  try {
    const raw = localStorage.getItem(`cols:${storeKey}`);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch { return null; }
}
function savePick(storeKey, keys) {
  if (!storeKey) return;
  try { localStorage.setItem(`cols:${storeKey}`, JSON.stringify(keys)); } catch { /* حافظه پر یا قفل */ }
}
function clearPick(storeKey) {
  if (!storeKey) return;
  try { localStorage.removeItem(`cols:${storeKey}`); } catch { /* بی‌اهمیت */ }
}

/**
 * جدول را می‌سازد و یک دسته کنترل برمی‌گرداند.
 *
 *   cols     ستون‌های شروع  [{ key, label, fmt, heat, group, pin }]
 *   opts.all همه ستون‌های ممکن، ورودی انتخابگر. اگر ندهی، انتخابگر نمی‌آید.
 *   opts.storeKey  کلید ماندگاری انتخاب ستون در حافظه مرورگر
 */
export function makeTable(host, cols, opts = {}) {
  const all = opts.all && opts.all.length ? opts.all : cols;
  const byKey = new Map(all.map((c) => [c.key, c]));
  const baseKeys = cols.map((c) => c.key);

  // انتخاب ذخیره‌شده فقط تا جایی معتبر است که ستون‌هایش هنوز وجود داشته باشند
  const saved = loadPick(opts.storeKey)?.filter((k) => byKey.has(k));
  let keys = saved?.length ? saved : baseKeys;

  // یک جدول واحد با سرستون چسبان. دو جدول جدا، ستون‌ها را هم‌تراز نمی‌کند،
  // و مجازی‌سازی با ردیف فاصله‌گذار انجام می‌شود نه با جابه‌جایی، تا عرض
  // ستون‌ها از محتوای واقعی بیاید.
  host.innerHTML = `
    <div class="tbl-wrap">
      <div class="tbl-tools">
        <button type="button" class="ghost tbl-cols-btn" ${all === cols ? 'hidden' : ''}>
          ستون‌ها <b class="tbl-cols-n"></b>
        </button>
        <span class="tbl-sort"></span>
        <span class="sp"></span>
        <span class="tbl-count"></span>
      </div>
      <div class="col-panel" hidden></div>
      <div class="tbl-body" tabindex="0"><table class="data"><thead><tr></tr></thead><tbody></tbody></table></div>
    </div>`;

  const wrap = host.querySelector('.tbl-wrap');
  const headRow = host.querySelector('thead tr');
  const body = host.querySelector('.tbl-body');
  const tbody = host.querySelector('tbody');
  const countLbl = host.querySelector('.tbl-count');
  const sortLbl = host.querySelector('.tbl-sort');
  const colsBtn = host.querySelector('.tbl-cols-btn');
  const colsN = host.querySelector('.tbl-cols-n');
  const panel = host.querySelector('.col-panel');

  let rows = [];
  let view = [];
  let sortKey = opts.sortKey && byKey.has(opts.sortKey) ? opts.sortKey : keys[0];
  let sortDir = -1;
  const ranges = new Map();

  const active = () => keys.map((k) => byKey.get(k)).filter(Boolean);

  // ——— سرستون: چسبان بالای قاب، و روی هر ستون مرتب می‌شود ———
  function buildHead() {
    headRow.innerHTML = '';
    for (const c of active()) {
      const th = document.createElement('th');
      th.textContent = c.label;
      th.title = `مرتب‌سازی بر ${c.label}`;
      th.dataset.key = c.key;
      if (NUM_FMT.has(c.fmt)) th.classList.add('n');
      th.addEventListener('click', () => {
        if (sortKey === c.key) sortDir = -sortDir;
        else { sortKey = c.key; sortDir = -1; }
        apply();
      });
      headRow.appendChild(th);
    }
    colsN.textContent = `${keys.length}/${all.length}`;
  }

  // ——— انتخابگر ستون ———
  function buildPanel() {
    if (all === cols) return;
    const groups = [...new Set(all.map((c) => c.group || 'دیگر'))];
    panel.innerHTML = `
      <div class="col-panel-head">
        <span>هر ستونی را می‌شود اضافه یا کم کرد. انتخاب همین جدول ذخیره می‌ماند.</span>
        <span class="sp"></span>
        <button type="button" class="ghost" data-act="base">نمای آماده</button>
        <button type="button" class="ghost" data-act="all">همه</button>
        <button type="button" class="ghost" data-act="close">بستن</button>
      </div>
      <div class="col-groups">
        ${groups.map((g) => `
          <div class="col-group">
            <h5>${g}</h5>
            ${all.filter((c) => (c.group || 'دیگر') === g).map((c) => `
              <label class="col-opt">
                <input type="checkbox" data-key="${c.key}" ${keys.includes(c.key) ? 'checked' : ''}>
                <span>${c.label}</span>
              </label>`).join('')}
          </div>`).join('')}
      </div>`;

    panel.querySelectorAll('input[data-key]').forEach((box) => {
      box.addEventListener('change', () => {
        const k = box.dataset.key;
        if (box.checked) {
          // ترتیب قرارداد ستونی حفظ می‌شود، نه ترتیب کلیک
          keys = all.map((c) => c.key).filter((x) => x === k || keys.includes(x));
        } else {
          if (keys.length === 1) { box.checked = true; return; } // جدول بی‌ستون معنی ندارد
          keys = keys.filter((x) => x !== k);
        }
        if (!keys.includes(sortKey)) sortKey = keys[0];
        savePick(opts.storeKey, keys);
        buildHead();
        apply();
      });
    });

    panel.querySelector('[data-act="close"]').addEventListener('click', togglePanel);
    panel.querySelector('[data-act="all"]').addEventListener('click', () => setKeys(all.map((c) => c.key)));
    panel.querySelector('[data-act="base"]').addEventListener('click', () => {
      clearPick(opts.storeKey);
      setKeys(baseKeys, true);
    });
  }

  function setKeys(next, skipSave = false) {
    keys = next.filter((k) => byKey.has(k));
    if (!keys.length) keys = baseKeys;
    if (!keys.includes(sortKey)) sortKey = keys[0];
    if (!skipSave) savePick(opts.storeKey, keys);
    buildHead();
    buildPanel();
    apply();
  }

  function togglePanel() {
    const open = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden', !open);
    colsBtn?.setAttribute('aria-pressed', open ? 'true' : 'false');
  }
  colsBtn?.addEventListener('click', togglePanel);

  function computeRanges() {
    ranges.clear();
    for (const c of active()) {
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
    const col = byKey.get(k);
    sortLbl.textContent = `مرتب بر ${col?.label ?? k} ${dir < 0 ? '↓' : '↑'}`;
    countLbl.textContent = `${view.length.toLocaleString('en-US')} ردیف`;
    draw();
  }

  function draw() {
    const shown = active();
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
      for (const c of shown) {
        const td = document.createElement('td');
        const v = r[c.key];
        const isNum = NUM_FMT.has(c.fmt);
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
      sp.innerHTML = `<td colspan="${shown.length}"></td>`;
      tbody.appendChild(sp);
    }
    tbody.appendChild(frag);
    const rest = view.length - last;
    if (rest > 0) {
      const sp = document.createElement('tr');
      sp.style.height = `${rest * ROW_H}px`;
      sp.innerHTML = `<td colspan="${shown.length}"></td>`;
      tbody.appendChild(sp);
    }
    if (!view.length) {
      tbody.innerHTML = `<tr><td colspan="${shown.length}" style="padding:18px;color:var(--muted)">
        ردیفی نمانده. نوار تشخیص بالا می‌گوید ترکیب‌ها کجا افتادند.</td></tr>`;
    }
  }

  body.addEventListener('scroll', () => requestAnimationFrame(draw), { passive: true });

  buildHead();
  buildPanel();

  return {
    set(next) { rows = next || []; apply(); },
    get() { return view; },
    sortBy(key) { if (byKey.has(key)) { sortKey = key; sortDir = -1; } apply(); },
    setColumns(next) { setKeys(next); },
    columns() { return [...keys]; },
    redraw: draw,
    root: wrap,
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
