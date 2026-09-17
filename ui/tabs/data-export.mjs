// تب مستقل «خروجی دیتا» — کشف همه قراردادهای بازه و خروجی ریزمعامله.

import { buildChain } from '/core/chain.mjs';
import { dataExportPairBatches, dataExportPairs, dataExportTradeRows, discoverDataExportInstruments } from '/core/data-export.mjs';
import { tradingDays } from '/core/roster-scan.mjs';
import { LIVE_CODE_CAP } from '/core/trades-source.mjs';
import { liveTapeCodes, liveTapeDay } from '/core/live-day.mjs';
import { tehranDateNumber } from '/core/tehran-day.mjs';
import { fetchRangeUniverse, mountHistoryRange } from '/ui/history-range.mjs';
import { buildDataExportSheets, dataExportFilename } from '/ui/data-export-workbook.mjs';
import { downloadXlsx } from '/ui/xlsx.mjs';
import { fmt } from '/ui/fmt.mjs';
import { logError } from '/ui/errlog.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

export async function mount(root, { state, api }) {
  root.innerHTML = `
    <div class="page-head"><h2>خروجی دیتا</h2><p>تمام قراردادهای کال و پوتِ فعال در بازه را از دفتر تاریخی کشف می‌کند، ریزمعاملات خودِ پایه و هر قرارداد را می‌گیرد و برای هر ابزار یک شیت جدا در فایل فشردهٔ Excel می‌سازد.</p></div>
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">گام اول</p><h3>بازه تاریخی</h3></div></div>
      <div id="de-range"></div><div class="de-refresh"><button type="button" class="ghost" id="de-refresh">تازه‌سازی دفتر قراردادها</button></div>
    </section>
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">گام دوم</p><h3>نمادهای پایه</h3></div><div class="de-actions"><button type="button" class="ghost" id="de-all">انتخاب همه</button><button type="button" class="ghost" id="de-none">پاک کردن انتخاب</button></div></div>
      <input class="de-search" type="search" id="de-search" placeholder="جست‌وجوی نماد پایه…" aria-label="جست‌وجوی نماد پایه">
      <div id="de-bases" class="de-base-grid" aria-label="نمادهای پایه"></div><p id="de-universe-note" class="note"></p>
    </section>
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">گام سوم</p><h3>دریافت و ساخت Excel</h3></div></div>
      <p class="note">برگ «راهنما» و «پوشش دریافت» کنار برگ مستقل هر پایه و هر قرارداد می‌آید. قرارداد بدون معامله هم برگ خودش را دارد تا نبود معامله با جاافتادن قرارداد اشتباه نشود.</p>
      <div class="de-actions"><button type="button" class="ghost" id="de-run" disabled>آماده‌سازی ریزمعاملات</button><button type="button" class="btn" id="de-export" disabled>خروجی Excel</button><button type="button" class="ghost" id="de-stop" hidden>توقف</button></div>
      <p id="de-status" class="note" role="status" aria-live="polite"></p><div id="de-result" class="history-table-wrap"></div>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const basesHost = $('de-bases'), runBtn = $('de-run'), exportBtn = $('de-export'), stopBtn = $('de-stop');
  let rangeUi = null, universe = null, controller = null, refreshTimer = null, loadSeq = 0, stopped = false;
  let prepared = null, exporting = false;
  const setStatus = (text, error = false) => {
    $('de-status').textContent = text || '';
    $('de-status').toggleAttribute('data-error', error);
  };
  const selectedBases = () => [...basesHost.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  function updateRunState() {
    runBtn.disabled = !universe || !selectedBases().length || Boolean(controller) || exporting;
    exportBtn.disabled = !prepared || Boolean(controller) || exporting;
    $('de-universe-note').toggleAttribute('data-error', universe?.complete === false);
  }
  function invalidatePrepared() {
    prepared = null;
    exportBtn.disabled = true;
  }
  function paintBases(payload) {
    const keep = new Set(selectedBases());
    const values = [...buildChain(payload?.rows || []).values()]
      .map((item) => ({
        ...item,
        contracts: (item.expiryList || []).reduce((sum, expiry) => sum + (expiry.strikeList || []).length * 2, 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    basesHost.innerHTML = values.length ? values.map((item) => `
      <label class="de-base" data-search="${esc(item.name)}"><input type="checkbox" value="${esc(item.ins)}"${keep.has(item.ins) ? ' checked' : ''}><span><b>${esc(item.name)}</b><small>${fmt.int(item.contracts)} قرارداد کال/پوت</small></span></label>`).join('') : '<p class="empty-note">در این بازه نماد پایه‌ای پیدا نشد.</p>';
    $('de-universe-note').textContent = payload?.note || '';
    universe = payload;
    updateRunState();
  }
  async function loadUniverse(range = rangeUi?.range) {
    if (!range) return;
    const mine = ++loadSeq;
    invalidatePrepared();
    clearTimeout(refreshTimer); runBtn.disabled = true;
    $('de-universe-note').textContent = 'در حال خواندن دفتر قراردادهای این بازه…';
    try {
      const payload = await fetchRangeUniverse(range);
      if (stopped || mine !== loadSeq) return;
      paintBases(payload);
      if (payload.build?.running) {
        $('de-universe-note').textContent = `${payload.note || ''} ساخت دفتر ادامه دارد؛ با پوشش فعلی هم می‌توانید خروجی بگیرید و محدودیت داخل فایل ثبت می‌شود.`;
        refreshTimer = setTimeout(() => loadUniverse(range), 4000);
      } else if (!payload.complete) $('de-universe-note').textContent = `${payload.note || ''} پوشش دفتر کامل نیست؛ خروجی در دسترس است و این محدودیت داخل برگ راهنما ثبت می‌شود.`;
    } catch (error) {
      if (stopped || mine !== loadSeq) return;
      universe = null; basesHost.innerHTML = '<p class="empty-note">دفتر قراردادها دریافت نشد.</p>';
      $('de-universe-note').textContent = error.message; updateRunState();
    }
  }

  async function fetchHistorical(pairs, items, signal) {
    const batches = dataExportPairBatches(pairs);
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      setStatus(`در حال دریافت روزهای بسته‌شده: بسته ${fmt.int(index + 1)} از ${fmt.int(batches.length)}…`);
      try {
        const response = await fetch('/api/trades/batch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
          body: JSON.stringify({ requests: batch.map(({ ins, date }) => ({ ins, date })) }),
        });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
        for (const pair of batch) {
          const hit = payload.items?.[pair.key];
          items[pair.key] = hit && Array.isArray(hit.rows) ? { ...hit, source: 'history' } : { rows: [], error: hit?.error || 'پاسخ این ابزار/روز در بسته نبود', source: 'history' };
        }
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        for (const pair of batch) items[pair.key] = { rows: [], error: error.message, source: 'history' };
      }
    }
  }

  async function fetchLive(pairs, items, signal) {
    if (!pairs.length) return;
    let payload;
    try {
      const response = await fetch('/api/history/universe?build=0', { cache: 'no-store', signal });
      payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      for (const pair of pairs) items[pair.key] = { rows: [], error: `عکس امروز دریافت نشد: ${error.message}`, source: 'live' };
      return;
    }
    const day = liveTapeDay(payload);
    if (!day.ok || !pairs.some((pair) => pair.date === day.date)) {
      for (const pair of pairs) items[pair.key] = { rows: [], error: `نوار امروز قابل انتساب نبود${day.why ? `: ${day.why}` : ''}`, source: 'live' };
      return;
    }
    const wanted = new Set(pairs.map((pair) => String(pair.ins)));
    const present = new Set();
    for (const row of payload.rows || []) for (const key of ['uaInsCode', 'insCode_C', 'insCode_P']) {
      const ins = String(row?.[key] ?? ''); if (ins) present.add(ins);
    }
    const codes = liveTapeCodes(payload.rows, wanted, { withContracts: true });
    const requested = new Set(codes);
    for (const pair of pairs) if (!requested.has(pair.ins)) items[pair.key] = present.has(pair.ins) ? { rows: [], source: 'live' } : { rows: [], error: 'ابزار در تابلوی امروز پیدا نشد', source: 'live' };
    const parts = chunks(codes, LIVE_CODE_CAP);
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]; setStatus(`در حال دریافت نوار امروز: بسته ${fmt.int(index + 1)} از ${fmt.int(parts.length)}…`);
      try {
        const response = await fetch(`/api/live-trades?ins=${part.join(',')}`, { cache: 'no-store', signal });
        const live = await response.json();
        if (!response.ok || live.error) throw new Error(live.error || `پاسخ ${response.status}`);
        for (const ins of part) {
          const hit = live.items?.[ins], pair = pairs.find((item) => item.ins === ins);
          if (pair) items[pair.key] = hit && Array.isArray(hit.rows) ? { ...hit, source: 'live' } : { rows: [], error: hit?.error || 'پاسخ نوار ابزار نیامد', source: 'live' };
        }
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        for (const ins of part) { const pair = pairs.find((item) => item.ins === ins); if (pair) items[pair.key] = { rows: [], error: error.message, source: 'live' }; }
      }
    }
  }

  function paintResult(instruments, pairs, items, bytes = null) {
    const rows = instruments.map((item) => {
      const count = dataExportTradeRows(item, pairs, items).length;
      const failures = pairs.filter((pair) => pair.ins === item.ins && items[pair.key]?.error).length;
      return `<tr><td>${esc(item.baseName)}</td><td>${esc(item.name)}</td><td>${item.kind === 'underlying' ? 'پایه' : item.kind === 'call' ? 'کال' : 'پوت'}</td><td class="n">${fmt.int(count)}</td><td class="n">${fmt.int(failures)}</td></tr>`;
    });
    const headline = Number.isFinite(bytes)
      ? `فایل با حجم ${fmt.int(Math.ceil(bytes / 1024))} کیلوبایت دانلود شد.`
      : 'داده آماده است؛ برای دریافت فایل روی «خروجی Excel» بزنید.';
    $('de-result').innerHTML = `<p class="note">${headline}</p><table class="history-table"><thead><tr><th>پایه</th><th>شیت ابزار</th><th>نوع</th><th>ریزمعامله</th><th>روز خطادار</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  async function run() {
    const bases = selectedBases();
    if (!universe) { setStatus('دفتر قراردادها هنوز دریافت نشده است.', true); return; }
    if (!bases.length) { setStatus('دست‌کم یک نماد پایه را انتخاب کن.', true); return; }
    const range = rangeUi.range;
    const instruments = discoverDataExportInstruments(universe.rows, bases, { declaredSize: state.settings.contractSize });
    const pairs = dataExportPairs(instruments, tradingDays(range.from, range.to));
    if (!instruments.length || !pairs.length) { setStatus('برای این انتخاب ابزار/روزی برای دریافت ساخته نشد.', true); return; }
    invalidatePrepared(); clearTimeout(refreshTimer);
    controller = new AbortController(); runBtn.disabled = true; stopBtn.hidden = false; $('de-result').innerHTML = '';
    const items = {}, today = tehranDateNumber();
    const historical = pairs.filter((pair) => pair.date < today), live = pairs.filter((pair) => pair.date === today);
    for (const pair of pairs.filter((pair) => pair.date > today)) items[pair.key] = { rows: [], error: 'روز آینده است', source: '' };
    try {
      await fetchHistorical(historical, items, controller.signal);
      await fetchLive(live, items, controller.signal);
      setStatus('داده‌ها آماده شد؛ در حال ساخت شیت‌های Excel…');
      const sheets = buildDataExportSheets({ instruments, pairs, items, range, complete: universe.complete, note: universe.note || '' });
      prepared = { sheets, filename: dataExportFilename(range), instruments, pairs, items };
      paintResult(instruments, pairs, items);
      const failed = Object.values(items).filter((item) => item?.error).length;
      setStatus(`آمادهٔ خروجی: ${fmt.int(instruments.length)} شیت ابزار و ${fmt.int(failed)} ابزار/روز خطادار.${universe.complete ? '' : ' پوشش دفتر ناقص است و داخل فایل نوشته می‌شود.'}${failed ? ' خطاها در برگ پوشش نوشته شده‌اند.' : ''}`);
    } catch (error) {
      if (error.name === 'AbortError') setStatus('دریافت با درخواست شما متوقف شد.', true);
      else { setStatus(`ساخت خروجی کامل نشد: ${error.message}`, true); logError('data-export', error); }
    } finally { controller = null; stopBtn.hidden = true; updateRunState(); }
  }

  async function exportPrepared() {
    if (!prepared) { setStatus('اول ریزمعاملات را آماده کنید.', true); return; }
    exporting = true; updateRunState();
    try {
      const bytes = await downloadXlsx(prepared.filename, prepared.sheets);
      paintResult(prepared.instruments, prepared.pairs, prepared.items, bytes);
      setStatus('فایل Excel دانلود شد. برای دریافت دوباره می‌توانید همین دکمه را بزنید.');
    } catch (error) {
      setStatus(`دانلود خروجی انجام نشد: ${error.message}`, true); logError('data-export:download', error);
    } finally { exporting = false; updateRunState(); }
  }

  basesHost.addEventListener('change', () => { invalidatePrepared(); updateRunState(); });
  $('de-search').addEventListener('input', (event) => { const q = event.target.value.trim(); for (const label of basesHost.querySelectorAll('.de-base')) label.hidden = q && !label.dataset.search.includes(q); });
  $('de-all').addEventListener('click', () => { for (const input of basesHost.querySelectorAll('input')) input.checked = true; invalidatePrepared(); updateRunState(); });
  $('de-none').addEventListener('click', () => { for (const input of basesHost.querySelectorAll('input')) input.checked = false; invalidatePrepared(); updateRunState(); });
  $('de-refresh').addEventListener('click', () => loadUniverse()); runBtn.addEventListener('click', run); exportBtn.addEventListener('click', exportPrepared); stopBtn.addEventListener('click', () => controller?.abort());

  await api.loadSettings();
  rangeUi = mountHistoryRange($('de-range'), { onApply: (range) => loadUniverse(range), quickEntry: true, compactNote: true });
  await loadUniverse(rangeUi.range);
  return () => { stopped = true; clearTimeout(refreshTimer); controller?.abort(); };
}
