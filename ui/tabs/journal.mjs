// تب دفترچهٔ معاملات.
//
// `data/positions.json` فقط وضعِ فعلی را دارد: موقعیتی که ویرایش شود قیمتِ
// ورودِ قبلی‌اش برای همیشه می‌رود، و موقعیتی که حذف شود انگار هرگز نبوده.
// این تب همان چیزی است که آن فایل نمی‌گوید — «چه کردم و چرا».
//
// ردیف‌ها فقط اضافه می‌شوند. اینجا هیچ دکمهٔ ویرایش یا حذفی نیست و نبودشان
// تصمیم است، نه فراموشی: دفترچه‌ای که بشود اصلاحش کرد همان حافظهٔ انتخابی
// است. برای اصلاح، ردیفِ تازه بنویس.

import {
  JOURNAL_ACTIONS, filterJournal, journalActionLabel, journalSummary,
} from '/core/journal.mjs';
import { faDigits, fmt, signTone } from '/ui/fmt.mjs';
import { attachExportsIn } from '/ui/export.mjs';
import { logError } from '/ui/errlog.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const stamp = (at) => faDigits(new Date(at).toLocaleString('fa-IR'));

export async function mount(root) {
  root.innerHTML = `
    <div class="page-head">
      <h2>دفترچهٔ معاملات</h2>
      <p>هر ثبت، ویرایش، بستن و حذفِ موقعیت اینجا با زمان و دلیلش می‌ماند. فایل موقعیت‌ها فقط وضع فعلی را دارد؛
         این دفترچه می‌گوید چطور به آن رسیدی. ردیف‌ها فقط اضافه می‌شوند — برای اصلاح، ردیف تازه بنویس.</p>
    </div>

    <div class="kpis" id="jr-kpis"></div>

    <section class="card">
      <div class="section-head"><div><p class="eyebrow">یادداشت دستی</p><h3>ردیف تازه</h3></div></div>
      <div class="bar" style="flex-wrap:wrap;gap:10px">
        <div class="field" style="flex:1 1 20rem"><label for="jr-note">متن</label>
          <input type="text" id="jr-note" placeholder="چرا این تصمیم را گرفتم؟"></div>
        <div class="field"><label for="jr-title">مربوط به</label>
          <input type="text" id="jr-title" placeholder="نام موقعیت یا نماد — اختیاری"></div>
        <button class="btn" id="jr-add">ثبت در دفترچه</button>
        <span class="sp"></span>
        <span id="jr-msg" class="saved" role="status" aria-live="polite"></span>
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <div><p class="eyebrow">تازه‌ترین اول</p><h3>ردیف‌ها</h3></div>
        <div class="log-actions">
          <label class="log-filter">کنش
            <select id="jr-action"><option value="">همه</option>
              ${JOURNAL_ACTIONS.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('')}
            </select>
          </label>
          <input type="search" id="jr-search" placeholder="جست‌وجو در متن…" aria-label="جست‌وجو در دفترچه">
          <button type="button" class="ghost" id="jr-refresh">تازه‌سازی</button>
        </div>
      </div>
      <div id="jr-table" class="history-table-wrap"></div>
    </section>`;

  attachExportsIn(root, 'journal');
  const $ = (id) => root.querySelector(`#${id}`);
  let rows = [];
  let readError = '';

  async function load() {
    try {
      const response = await fetch('/api/journal');
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'دفترچه خوانده نشد');
      rows = payload.rows || [];
      readError = '';
    } catch (error) {
      rows = [];
      readError = error.message;
      logError('journal', error);
    }
    paint();
  }

  function paint() {
    const list = filterJournal(rows, { action: $('jr-action').value, text: $('jr-search').value });
    const summary = journalSummary(rows);
    $('jr-kpis').innerHTML = [
      ['ردیف دفترچه', fmt.int(summary.count), summary.last ? `تازه‌ترین ${stamp(summary.last)}` : '', ''],
      ['موقعیت بسته‌شده', fmt.int(summary.closedCount), 'ثبت‌شده در دفترچه', ''],
      ['سود تحقق‌یافتهٔ ثبت‌شده', Number.isFinite(summary.realized) ? fmt.money(summary.realized) : '—',
        summary.closedCount ? 'فقط از ردیف‌های بستن' : 'هنوز بستنی ثبت نشده',
        Number.isFinite(summary.realized) ? signTone(summary.realized) : ''],
      ['نرخ برد', Number.isFinite(summary.winRatePct) ? `${fmt.pct(summary.winRatePct)}٪` : '—',
        `${faDigits(summary.wins)} برد · ${faDigits(summary.losses)} باخت`, ''],
    ].map(([key, value, sub, tone]) => `<div class="kpi"><div class="k">${key}</div>
      <div class="v ${tone}">${value}</div><div class="s">${esc(sub)}</div></div>`).join('');

    if (readError) {
      $('jr-table').innerHTML = `<p class="empty-note">دفترچه خوانده نشد: ${esc(readError)}</p>`;
      return;
    }
    if (!list.length) {
      $('jr-table').innerHTML = `<p class="empty-note">${rows.length
        ? 'با این پالایه ردیفی نیست.'
        : 'دفترچه خالی است. هر کاری که در تب موقعیت‌های من بکنی، خودش اینجا ثبت می‌شود.'}</p>`;
      return;
    }
    $('jr-table').innerHTML = `<table class="history-table">
      <thead><tr><th>زمان</th><th>کنش</th><th>موقعیت</th><th>پایه</th><th>تعداد</th><th>سود و زیان</th><th>متن</th></tr></thead>
      <tbody>${list.map((row) => `
        <tr>
          <td class="n">${stamp(row.at)}</td>
          <td>${esc(journalActionLabel(row.action))}</td>
          <td>${faDigits(esc(row.title || '—'))}</td>
          <td>${esc(row.uaName || '—')}</td>
          <td class="n">${row.qty == null ? '—' : fmt.int(row.qty)}</td>
          <td class="n ${row.pnlTotal == null ? '' : signTone(row.pnlTotal)}">${row.pnlTotal == null ? '—' : fmt.money(row.pnlTotal)}</td>
          <td>${faDigits(esc([row.note, row.detail].filter(Boolean).join(' — ') || '—'))}</td>
        </tr>`).join('')}</tbody></table>`;
  }

  const msg = $('jr-msg');
  $('jr-add').addEventListener('click', async () => {
    const note = $('jr-note').value.trim();
    if (!note) { msg.textContent = 'متن یادداشت خالی است.'; msg.style.color = 'var(--loss)'; return; }
    try {
      const response = await fetch('/api/journal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'note', note, title: $('jr-title').value.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'ثبت نشد');
      $('jr-note').value = '';
      $('jr-title').value = '';
      msg.textContent = 'ثبت شد.';
      msg.style.color = 'var(--gain)';
      await load();
    } catch (error) {
      msg.textContent = `ثبت نشد: ${error.message}`;
      msg.style.color = 'var(--loss)';
    }
  });

  $('jr-action').addEventListener('change', paint);
  $('jr-search').addEventListener('input', paint);
  $('jr-refresh').addEventListener('click', load);

  await load();
  return () => {};
}
