// تب «جریان داده» (R5-21).
//
// هر درخواستِ داده، از لحظهٔ خواستن تا رسیدن: کدام تب و کدام دکمه، کدام
// خطِ کد، چه آدرسی، چه زمانی، سرور برایش کدام درخواست‌های TSETMC را
// فرستاد، و هر کدام چه شد — آمد، دیر آمد، خالی آمد، ناقص آمد، بلاک شدیم،
// نت قطع شد… منطقِ دسته‌بندی در `core/datalog.mjs` است؛ این تب فقط
// می‌خواند و نشان می‌دهد. خروجیِ دیتا عمداً در این لاگ نیست.

import { faDigits, fmt, ltr } from '/ui/fmt.mjs';
import {
  DL_CAT, DL_PROBLEM, DL_SLOW_LABEL, DL_TONE, buildTree, summarizeLog, tabLabel,
} from '/core/datalog.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

const clock = (at) => {
  if (!at) return '—';
  const d = new Date(at);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return faDigits(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`);
};
const ms = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${fmt.int(Math.round(Number(v)))} ms`);
const bytes = (v) => (!v ? '—' : v > 1048576 ? `${fmt.num(v / 1048576)} MB` : `${fmt.num(v / 1024)} KB`);

const TONE_CLASS = { good: 'open', warn: 'shut', bad: 'down', info: '', muted: '' };
const chip = (cat, count = null) => {
  if (!cat) return '<span class="pill">—</span>';
  const tone = TONE_CLASS[DL_TONE[cat]] ?? '';
  return `<span class="pill ${tone}" title="${esc(cat)}">${esc(DL_CAT[cat] || cat)}${count != null ? ` · ${fmt.int(count)}` : ''}</span>`;
};
const slowChip = (on) => (on ? `<span class="pill shut">${DL_SLOW_LABEL}</span>` : '');
const catsChips = (cats = {}) => Object.entries(cats)
  .sort((a, b) => b[1] - a[1]).map(([cat, n]) => chip(cat, n)).join(' ');

function sumText(sum = {}) {
  if (!sum || typeof sum !== 'object') return '';
  const parts = [];
  if (sum.error) parts.push(`خطا: ${sum.error}`);
  if (sum.note) parts.push(sum.note);
  if (sum.states) parts.push(Object.entries(sum.states).map(([k, n]) => `${k} ${fmt.int(n)}`).join(' · '));
  if (sum.items != null) parts.push(`${fmt.int(sum.items)} قلم`);
  if (sum.rows != null) parts.push(`${fmt.int(sum.rows)} ردیف${sum.key || sum.list ? ` (${sum.key || sum.list})` : ''}`);
  if (sum.first) parts.push(`${faDigits(sum.first)} تا ${faDigits(sum.last)}`);
  if (sum.canceled) parts.push(`${fmt.int(sum.canceled)} باطل‌شده`);
  if (sum.date) parts.push(`تابلوی ${faDigits(String(sum.date))}: ${fmt.int(sum.trades)} معامله، حجم ${fmt.int(sum.volume)}`);
  if (sum.failed) parts.push(`${fmt.int(sum.failed)} قلمِ خطادار`);
  if (sum.source) parts.push(`منبع ${sum.source}`);
  if (sum.keys) parts.push(`کلیدها: ${sum.keys.join('، ')}`);
  return parts.join(' · ');
}

export async function mount(root) {
  root.innerHTML = `
    <div class="page-head">
      <h2>جریان داده</h2>
      <p>هر درخواستِ داده از لحظهٔ خواستن تا رسیدن: کدام تب و کدام دکمه، چه آدرسی، چه زمانی، سرور برایش
         کدام درخواست‌ها را به TSETMC فرستاد و هر کدام چه شد. هر ردیف را بزنید تا جزئیاتش باز شود.
         لاگ روی دیسک هم در <code>data/logs/</code> می‌ماند. تب «خروجی دیتا» در این لاگ نیست.</p>
    </div>

    <section class="card">
      <div class="section-head">
        <div><p class="eyebrow">فیلتر</p><h3>کدام درخواست‌ها</h3></div>
        <div class="log-actions">
          <label class="log-filter"><input type="checkbox" id="dl-live" checked> تازه‌سازیِ زنده</label>
          <button type="button" class="ghost" id="dl-refresh">تازه‌سازی</button>
          <a class="ghost button-link" id="dl-download" href="/api/datalog/file" download>دریافت فایل لاگِ امروز</a>
          <button type="button" class="ghost" id="dl-clear" title="فایل‌های روزانه دست نمی‌خورند">پاک کردنِ لاگِ حافظه</button>
        </div>
      </div>
      <div class="dl-filters">
        <label>بازه<select id="dl-range">
          <option value="300000">۵ دقیقهٔ اخیر</option>
          <option value="1800000" selected>۳۰ دقیقهٔ اخیر</option>
          <option value="7200000">۲ ساعت اخیر</option>
          <option value="0">همه</option>
        </select></label>
        <label>تب<select id="dl-tab"><option value="">همه</option></select></label>
        <label>نتیجه<select id="dl-cat">
          <option value="">همه</option>
          <option value="__problem">فقط مشکل‌دار</option>
          <option value="__slow">فقط دیر آمده</option>
          ${Object.entries(DL_CAT).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
        </select></label>
        <label>جست‌وجو در آدرس<input id="dl-q" type="search" placeholder="مثلاً GetTradeHistory یا 1791440"></label>
      </div>
      <p class="note" id="dl-state">—</p>
    </section>

    <section class="card">
      <div class="section-head"><div><p class="eyebrow">جمع‌بندی همین فیلتر</p><h3>نتیجه‌ها، دسته‌بندی‌شده</h3></div></div>
      <div id="dl-summary"></div>
    </section>

    <section class="card">
      <div class="section-head">
        <div><p class="eyebrow">تازه‌ترین اول</p><h3>درخواست‌ها</h3></div>
        <span id="dl-count">—</span>
      </div>
      <div id="dl-table" class="history-table-wrap"></div>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  let rows = [];
  let seq = 0;
  let info = null;
  let timer = null;
  let disposed = false;
  const open = new Set();

  async function load({ reset = false } = {}) {
    try {
      if (reset) { rows = []; seq = 0; }
      const res = await fetch(`/api/datalog?since=${seq}&limit=8000`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      info = body;
      if (body.rows?.length) {
        rows.push(...body.rows);
        if (rows.length > 30000) rows.splice(0, rows.length - 30000);
        seq = Math.max(seq, ...body.rows.map((row) => row.seq || 0));
      }
      if (body.seq < seq) { rows = []; seq = 0; }
      paint();
    } catch (error) {
      $('dl-state').textContent = `لاگ خوانده نشد: ${error.message}`;
    }
  }

  function filtered() {
    const range = Number($('dl-range').value) || 0;
    const since = range ? Date.now() - range : 0;
    const tab = $('dl-tab').value;
    const cat = $('dl-cat').value;
    const q = $('dl-q').value.trim().toLowerCase();
    return buildTree(rows.filter((row) => !since || row.at >= since)).filter((node) => {
      if (tab && node.tab !== tab) return false;
      if (cat === '__problem' && !(DL_PROBLEM.has(node.cat) || node.slow || node.up.some((u) => DL_PROBLEM.has(u.cat)))) return false;
      if (cat === '__slow' && !node.slow) return false;
      if (cat && !cat.startsWith('__') && node.cat !== cat && !node.up.some((u) => u.cat === cat)) return false;
      if (q) {
        const hay = [node.client?.url, node.api?.path, ...node.up.map((u) => u.url)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function paintTabs(tree) {
    const select = $('dl-tab');
    const have = new Set([...select.options].map((o) => o.value));
    for (const id of [...new Set(tree.map((n) => n.tab).filter(Boolean))]) {
      if (have.has(id)) continue;
      const option = document.createElement('option');
      option.value = id; option.textContent = tabLabel(id);
      select.appendChild(option);
    }
  }

  function paint() {
    if (disposed) return;
    const all = buildTree(rows);
    paintTabs(all);
    const tree = filtered();
    const flat = tree.flatMap((n) => [n.client, n.api, ...n.up].filter(Boolean));
    const sum = summarizeLog(flat);
    const files = (info?.files || []).slice(0, 7)
      .map((f) => `<a href="/api/datalog/file?day=${f.day}" download>${faDigits(f.day)}</a> (${bytes(f.bytes)})`).join(' · ');
    $('dl-state').innerHTML = `${info?.enabled === false
      ? '<b class="loss">ثبت خاموش است</b> — از تنظیمات («ثبت جریان داده») روشنش کنید.'
      : 'ثبت روشن است.'} مرزِ «دیر آمد»: ${ms(info?.slowMs)} · ${fmt.int(rows.length)} ردیف در حافظهٔ این صفحه`
      + `${files ? ` · فایل‌های روزانه: ${files}` : ''}`;

    const tabRows = Object.entries(sum.byTab).sort((a, b) => b[1].requests - a[1].requests);
    const pathRows = Object.entries(sum.byPath).sort((a, b) => b[1].count - a[1].count).slice(0, 25);
    $('dl-summary').innerHTML = `
      <p><b>درخواست‌های برنامه:</b> ${fmt.int(sum.requests)} ${catsChips(sum.cats)}${sum.slow ? ` ${slowChip(true)} ${fmt.int(sum.slow)}` : ''}</p>
      <p><b>درخواست‌ها به TSETMC:</b> ${fmt.int(sum.upstream)} ${catsChips(sum.upCats)}</p>
      <div class="history-table-wrap"><table class="history-table">
        <thead><tr><th>تب</th><th>درخواست برنامه</th><th>نتیجه‌ها</th><th>دیر</th><th>درخواست به TSETMC</th><th>نتیجهٔ درخواست‌های TSETMC</th></tr></thead>
        <tbody>${tabRows.map(([tab, t]) => `<tr><td>${esc(tabLabel(tab))}</td><td>${fmt.int(t.requests)}</td><td>${catsChips(t.cats)}</td><td>${t.slow ? fmt.int(t.slow) : '—'}</td><td>${fmt.int(t.up)}</td><td>${catsChips(t.upCats)}</td></tr>`).join('') || '<tr><td colspan="6">در این فیلتر درخواستی نیست.</td></tr>'}</tbody>
      </table></div>
      <details class="dl-paths"><summary>به تفکیکِ سرویسِ TSETMC (${fmt.int(pathRows.length)})</summary>
        <div class="history-table-wrap"><table class="history-table">
          <thead><tr><th>سرویس</th><th>تعداد</th><th>نتیجه‌ها</th><th>میانگین مدت</th><th>بیشینهٔ مدت</th><th>دیر</th></tr></thead>
          <tbody>${pathRows.map(([p, r]) => `<tr><td dir="ltr">${esc(p)}</td><td>${fmt.int(r.count)}</td><td>${catsChips(r.cats)}</td><td>${ms(r.count ? r.msTotal / r.count : 0)}</td><td>${ms(r.msMax)}</td><td>${r.slow ? fmt.int(r.slow) : '—'}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>`;

    const shown = tree.slice(-400).reverse();
    $('dl-count').textContent = `${fmt.int(shown.length)} از ${fmt.int(tree.length)} درخواست`;
    $('dl-table').innerHTML = shown.length ? `<table class="history-table dl-table">
      <thead><tr><th>زمان</th><th>تب</th><th>کار کاربر</th><th>درخواست</th><th>نتیجه</th><th>مدت</th><th>خلاصهٔ پاسخ</th><th>TSETMC</th></tr></thead>
      <tbody>${shown.map(rowHtml).join('')}</tbody></table>`
      : '<p class="empty-note">در این فیلتر درخواستی ثبت نشده. تبی را باز کنید و کاری انجام دهید؛ ردیف‌ها همین‌جا می‌آیند.</p>';
  }

  function rowHtml(node) {
    const c = node.client, a = node.api;
    const method = c?.method || a?.method || (node.up.length ? 'TSETMC' : '');
    const url = c?.url || a?.path || node.up[0]?.url || '';
    const action = c?.action || a?.action || node.up[0]?.action || '';
    const ago = c?.actionAgoMs != null ? ` (${fmt.int(Math.round(c.actionAgoMs / 1000))} ث پیش)` : '';
    const dur = [c ? `مرورگر ${ms(c.ms)}` : '', a ? `سرور ${ms(a.ms)}` : '', !c && !a && node.up[0] ? ms(node.up[0].ms) : '']
      .filter(Boolean).join('<br>');
    const status = c?.status || a?.status;
    const isOpen = open.has(node.id);
    const main = `<tr class="dl-row${DL_PROBLEM.has(node.cat) ? ' history-missing' : ''}" data-node="${esc(node.id)}" tabindex="0">
      <td>${clock(node.at)}</td><td>${esc(tabLabel(node.tab))}</td>
      <td>${action ? `${esc(action)}${ago}` : '—'}</td>
      <td dir="ltr" class="dl-url">${esc(method)} ${esc(url)}${status ? ` → ${status}` : ''}</td>
      <td>${chip(node.cat)} ${slowChip(node.slow)}</td><td class="dl-ms">${dur || '—'}</td>
      <td>${esc(sumText(a?.sum || node.up[0]?.sum)) || (c?.error ? esc(c.error) : '—')}</td>
      <td>${node.up.length ? `${fmt.int(node.up.length)} · ${catsChips(node.upCats)}` : '—'}</td></tr>`;
    return isOpen ? main + detailHtml(node) : main;
  }

  function detailHtml(node) {
    const c = node.client, a = node.api;
    const facts = [
      ['شناسه', node.id],
      ['مبدأ در کد', (c?.src || []).join(' ← ') || a?.src || '—'],
      ['بدنهٔ درخواست', c?.body || '—'],
      ['دیدِ مرورگر', c ? `${clock(c.sentAt || c.at)} فرستاده · ${ms(c.ms)} · HTTP ${c.status || '—'} · ${c.cat === 'ok' ? 'پاسخ به مرورگر رسید' : (DL_CAT[c.cat] || c.cat || '—')}${c.error ? ` · ${c.error}` : ''}` : 'ثبت نشده (درخواست از مرورگر نبود یا هنوز نرسیده)'],
      ['دیدِ سرور', a ? `${ms(a.ms)} · HTTP ${a.status} · ${DL_CAT[a.cat] || a.cat} · ${fmt.int(a.up || 0)} درخواست به TSETMC` : '—'],
      ['خلاصهٔ پاسخ', a ? JSON.stringify(a.sum) : '—'],
    ];
    const ups = node.up.slice().sort((x, y) => x.at - y.at);
    return `<tr class="dl-detail"><td colspan="8">
      <dl class="dl-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd dir="auto">${esc(v)}</dd>`).join('')}</dl>
      ${ups.length ? `<table class="history-table dl-up">
        <thead><tr><th>زمان</th><th>آدرسِ کاملِ TSETMC</th><th>تلاش</th><th>صف</th><th>مدت</th><th>HTTP</th><th>حجم</th><th>نتیجه</th><th>خلاصه / خطا</th></tr></thead>
        <tbody>${ups.map((u) => `<tr class="${DL_PROBLEM.has(u.cat) ? 'history-missing' : ''}">
          <td>${clock(u.at)}</td><td dir="ltr" class="dl-url">${esc(u.url || u.path)}</td>
          <td>${u.attempt ? `${fmt.int(u.attempt)} از ${fmt.int(u.of)}${u.retry ? ' · تلاشِ بعدی دارد' : ''}` : '—'}</td>
          <td>${u.lane === 'tape' ? 'خطِ ریزمعامله' : 'خطِ عمومی'}${u.waitMs ? ` · ${ms(u.waitMs)}` : ''}</td>
          <td>${ms(u.ms ?? u.ageMs)}${u.cat === 'cached' && u.ageMs != null ? ' (سنِ کش)' : ''}</td>
          <td>${u.status || '—'}</td><td>${bytes(u.bytes)}</td>
          <td>${chip(u.cat)} ${slowChip(u.slow)}</td>
          <td>${esc(u.error || sumText(u.sum)) || '—'}${u.code ? ` <code>${esc(u.code)}</code>` : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="note">این درخواست به TSETMC نرسید (از کش یا محاسبهٔ محلی جواب داده شد).</p>'}
    </td></tr>`;
  }

  root.addEventListener('click', (event) => {
    const row = event.target.closest?.('tr.dl-row');
    if (!row) return;
    const id = row.dataset.node;
    if (open.has(id)) open.delete(id); else open.add(id);
    paint();
  });
  for (const id of ['dl-range', 'dl-tab', 'dl-cat']) $(id).addEventListener('change', paint);
  $('dl-q').addEventListener('input', paint);
  $('dl-refresh').addEventListener('click', () => load());
  $('dl-clear').addEventListener('click', async () => {
    await fetch('/api/datalog', { method: 'DELETE' }).catch(() => null);
    open.clear();
    await load({ reset: true });
  });
  const tick = () => { if ($('dl-live').checked && !document.hidden) load(); };
  timer = setInterval(tick, 2500);
  await load({ reset: true });

  return () => { disposed = true; clearInterval(timer); };
}
