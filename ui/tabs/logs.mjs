// تب دفتر خطاها.
//
// یک جا که بگوید چه شد. سرور و مرورگر هر دو در یک دفتر می‌نویسند، پس این
// تب یک فهرست دارد نه دو تا — وگرنه کاربر باید خودش دو خط زمانی را کنار هم
// بگذارد و بفهمد کدام علت کدام است.

import { fmt, faDigits } from '/ui/fmt.mjs';
import { localRows, onError } from '/ui/errlog.mjs';
import { attachExportsIn } from '/ui/export.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

const clock = (at) => {
  const d = new Date(at);
  const p = (n) => String(n).padStart(2, '0');
  return faDigits(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
};

const LEVEL = { error: ['خطا', 'loss'], warn: ['هشدار', 'warn'] };

export async function mount(root, { state }) {
  root.innerHTML = `
    <div class="page-head">
      <h2>دفتر خطاها</h2>
      <p>هرچه در سرور و مرورگر خطا داده، اینجا با زمان و منبعش می‌نشیند. برای وقتی که چیزی
         کار نکرد و باید بدانی چرا. این دفتر در حافظه است و با بستن سرور پاک می‌شود.</p>
    </div>

    <div class="kpis" id="log-kpis"></div>

    <section class="card">
      <div class="section-head">
        <div><p class="eyebrow">وضعیت لحظه‌ای</p><h3>بازار و جریان داده</h3></div>
        <div class="log-actions">
          <label class="log-filter">سطح
            <select id="log-level">
              <option value="">همه</option>
              <option value="error">فقط خطا</option>
              <option value="warn">فقط هشدار</option>
            </select>
          </label>
          <button type="button" class="ghost" id="log-refresh">تازه‌سازی</button>
          <button type="button" class="ghost" id="log-clear">پاک کردن دفتر</button>
        </div>
      </div>
      <p class="note" id="log-market">—</p>
    </section>

    <section class="card">
      <div class="section-head">
        <div><p class="eyebrow">تازه‌ترین اول</p><h3>رویدادها</h3></div>
        <span id="log-count">—</span>
      </div>
      <div id="log-table" class="history-table-wrap"></div>
    </section>`;

  attachExportsIn(root, 'logs');

  const $ = (id) => root.querySelector(`#${id}`);
  let serverRows = [];
  let stats = null;
  let market = null;

  async function load() {
    try {
      const level = $('log-level').value;
      const url = `/api/logs?limit=300${level ? `&level=${level}` : ''}`;
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'دفتر خطا خوانده نشد');
      serverRows = payload.rows || [];
      stats = payload;
      market = payload.market || null;
    } catch (e) {
      // خطای خواندنِ دفتر خطا در خودِ دفتر ثبت نمی‌شود — حلقه می‌سازد.
      serverRows = [];
      stats = { readError: e.message };
    }
    paint();
  }

  function paint() {
    const level = $('log-level').value;
    // دفتر مرورگر هم نشان داده می‌شود، حتی اگر هنوز به سرور نرسیده باشد
    // (ارسال دسته‌ای است و تا یک‌ونیم ثانیه تأخیر دارد).
    const local = localRows()
      .filter((r) => !level || r.level === level)
      .map((r) => ({ ...r, where: `مرورگر · ${r.where}`, local: true }));
    const merged = [...serverRows, ...local]
      .sort((a, b) => b.at - a.at || b.seq - a.seq)
      .slice(0, 400);

    const errors = merged.filter((r) => r.level === 'error').length;
    $('log-kpis').innerHTML = [
      ['رویداد نگه‌داشته‌شده', fmt.int(merged.length), ''],
      ['خطا', fmt.int(errors), errors ? 'نیازمند بررسی' : 'پاک'],
      ['هشدار', fmt.int(merged.length - errors), ''],
      ['دورریخته از دفتر سرور', fmt.int(stats?.dropped || 0), stats?.cap ? `ظرفیت ${fmt.int(stats.cap)}` : ''],
    ].map(([k, v, s]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');

    $('log-market').textContent = stats?.readError
      ? `دفتر سرور خوانده نشد: ${stats.readError}`
      : market
        ? (market.open
          ? 'بازار باز است و حلقه دیده‌بان می‌چرخد.'
          : `بازار بسته است — ${market.why}. بیرون از ساعت بازار، جریان زنده چیزی نمی‌فرستد و برنامه از عکس آخرین جلسه استفاده می‌کند.`)
        : '—';

    $('log-count').textContent = `${fmt.int(merged.length)} رویداد`;
    if (!merged.length) {
      $('log-table').innerHTML = '<p class="empty-note">هیچ خطایی ثبت نشده.</p>';
      return;
    }
    $('log-table').innerHTML = `<table class="history-table"><thead><tr>
      <th>زمان</th><th>سطح</th><th>منبع</th><th>پیام</th><th>جزئیات</th></tr></thead>
      <tbody>${merged.map((r) => {
        const [label, tone] = LEVEL[r.level] || LEVEL.error;
        return `<tr>
          <td class="n">${clock(r.at)}</td>
          <td><span class="tag ${tone}">${label}</span></td>
          <td>${esc(r.where || '—')}</td>
          <td>${esc(r.message || '—')}</td>
          <td class="log-detail">${r.detail ? `<details><summary>نمایش</summary><pre>${esc(r.detail)}</pre></details>` : '—'}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  $('log-refresh').addEventListener('click', load);
  $('log-level').addEventListener('change', load);
  $('log-clear').addEventListener('click', async () => {
    try { await fetch('/api/logs', { method: 'DELETE' }); } catch { /* دکمه خودش خبر می‌دهد */ }
    await load();
  });

  const offErr = onError(() => paint());
  await load();
  const timer = setInterval(load, 8000);
  return () => { clearInterval(timer); offErr(); };
}
