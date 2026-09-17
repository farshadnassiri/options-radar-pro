// تب مستقل «خروجی دیتا» — کشف همه قراردادهای بازه و خروجی ریزمعامله.

import { buildChain } from '/core/chain.mjs';
import {
  DATA_EXPORT_BATCH_CAP, blankAuditSummary, dataExportBlankAudit, dataExportContractGroups,
  dataExportOutcome, dataExportPairBatches, dataExportPairs, dataExportSessionRows,
  dataExportTradeRows, discoverDataExportInstruments, selectedDataExportInstruments, splitPairBatch,
} from '/core/data-export.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { tradingDays } from '/core/roster-scan.mjs';
import { LIVE_CODE_CAP } from '/core/trades-source.mjs';
import { liveTapeCodes, liveTapeDay } from '/core/live-day.mjs';
import { tehranDateNumber } from '/core/tehran-day.mjs';
import { fetchRangeUniverse, mountHistoryRange } from '/ui/history-range.mjs';
import { buildDataExportSheets, dataExportFilename } from '/ui/data-export-workbook.mjs';
import { downloadXlsx } from '/ui/xlsx.mjs';
import { faDigits, fmt } from '/ui/fmt.mjs';
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
    <section class="card" id="de-contract-card">
      <div class="section-head"><div><p class="eyebrow">گام سوم</p><h3>قراردادهای هر پایه</h3></div><div class="de-actions"><button type="button" class="ghost" id="de-pick-all">انتخاب همه</button><button type="button" class="ghost" id="de-pick-none">پاک کردن انتخاب</button></div></div>
      <p class="note">خروجی فقط از قراردادهایی ساخته می‌شود که اینجا تیک خورده‌اند. ریزمعاملهٔ <b>پایهٔ</b> هر قرارداد خودکار همراهش می‌آید — قیمتِ اختیار بی قیمتِ همان لحظهٔ پایه نیمی از داستان است.</p>
      <div class="de-actions" style="margin-bottom:8px">
        <label class="check" for="de-side"><span>نوع</span>
          <select id="de-side"><option value="">کال و پوت</option><option value="call">فقط کال</option><option value="put">فقط پوت</option></select></label>
        <input class="de-search" type="search" id="de-contract-search" placeholder="جست‌وجوی نماد قرارداد…" aria-label="جست‌وجوی قرارداد">
      </div>
      <div id="de-contracts"></div>
      <p id="de-contract-note" class="note"></p>
    </section>
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">گام چهارم</p><h3>دریافت و ساخت Excel</h3></div></div>
      <p class="note">برگ «راهنما» و «پوشش دریافت» کنار برگ مستقل هر پایه و هر قرارداد می‌آید. قرارداد بدون معامله هم برگ خودش را دارد تا نبود معامله با جاافتادن قرارداد اشتباه نشود.</p>
      <div class="de-actions"><button type="button" class="ghost" id="de-probe" disabled>آزمون یک ابزار/روز</button><button type="button" class="ghost" id="de-run" disabled>آماده‌سازی ریزمعاملات</button><button type="button" class="btn" id="de-export" disabled>خروجی Excel</button><button type="button" class="ghost" id="de-stop" hidden>توقف</button></div>
      <p class="note">«آزمون یک ابزار/روز» فقط یک قرارداد و یک روز را می‌گیرد و می‌گوید چه برگشت — به‌جای اینکه برای فهمیدن یک مشکل، چند دقیقه منتظر کل بازه بمانی.</p>
      <p id="de-probe-out" class="note"></p>
      <p id="de-status" class="note" role="status" aria-live="polite"></p><div id="de-result" class="history-table-wrap"></div>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const basesHost = $('de-bases'), contractsHost = $('de-contracts');
  const runBtn = $('de-run'), exportBtn = $('de-export'), stopBtn = $('de-stop');
  let rangeUi = null, universe = null, controller = null, refreshTimer = null, loadSeq = 0, stopped = false;
  let prepared = null, exporting = false;
  // ابزارهای کشف‌شدهٔ پایه‌های تیک‌خورده، و کدِ قراردادهایی که کاربر خواسته.
  // انتخاب در یک `Set` می‌ماند نه در DOM: با عوض شدنِ پالایهٔ نوع یا
  // جست‌وجو، کارتِ قراردادها از نو ساخته می‌شود و تیک‌های DOM می‌رفتند.
  let discovered = [];
  const picked = new Set();
  const setStatus = (text, error = false) => {
    $('de-status').textContent = text || '';
    $('de-status').toggleAttribute('data-error', error);
  };
  const selectedBases = () => [...basesHost.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
  const selectedInstruments = () => selectedDataExportInstruments(discovered, [...picked]);
  function updateRunState() {
    runBtn.disabled = !universe || !picked.size || Boolean(controller) || exporting;
    $('de-probe').disabled = runBtn.disabled;
    exportBtn.disabled = !prepared || Boolean(controller) || exporting;
    $('de-universe-note').toggleAttribute('data-error', universe?.complete === false);
  }

  /**
   * کارت قراردادها، گروه‌به‌گروه بر سررسید.
   *
   * قراردادِ تیک‌خورده‌ای که با عوض شدنِ پایه یا بازه دیگر وجود ندارد، از
   * انتخاب پاک می‌شود — انتخابی که به ابزارِ نبوده اشاره کند، در گام بعد
   * یک جفتِ بی‌جواب می‌سازد و کاربر علتش را نمی‌فهمد.
   */
  function paintContracts() {
    const bases = selectedBases();
    discovered = bases.length
      ? discoverDataExportInstruments(universe?.rows || [], bases, { declaredSize: state.settings.contractSize })
      : [];
    const alive = new Set(discovered.filter((item) => item.kind !== 'underlying').map((item) => String(item.ins)));
    for (const ins of [...picked]) if (!alive.has(ins)) picked.delete(ins);

    const side = $('de-side').value;
    const needle = $('de-contract-search').value.trim();
    if (!bases.length) {
      contractsHost.innerHTML = '<p class="empty-note">اول یک نماد پایه را از گام دوم انتخاب کن.</p>';
      $('de-contract-note').textContent = '';
      updateRunState();
      return;
    }
    const baseNames = new Map(discovered.filter((item) => item.kind === 'underlying').map((item) => [String(item.ins), item.name]));
    const blocks = [];
    let shown = 0;
    for (const baseIns of bases) {
      const groups = dataExportContractGroups(discovered, baseIns)
        .map((group) => ({
          ...group,
          contracts: group.contracts
            .filter((item) => !side || item.kind === side)
            .filter((item) => !needle || String(item.name).includes(needle)),
        }))
        .filter((group) => group.contracts.length);
      if (!groups.length) continue;
      const total = groups.reduce((sum, group) => sum + group.contracts.length, 0);
      shown += total;
      blocks.push(`<div class="de-base-block"><h4>${esc(baseNames.get(String(baseIns)) || 'پایه')}
        <button type="button" class="ghost" data-base-all="${esc(baseIns)}">همهٔ ${fmt.int(total)} قرارداد</button></h4>
        ${groups.map((group) => `<div class="de-expiry">
          <div class="de-expiry-head"><b>${group.expiry ? faDigits(esc(historyDateLabel(group.expiry))) : 'سررسید نامعلوم'}</b>
            <button type="button" class="ghost" data-expiry-all="${esc(baseIns)}|${group.expiry}">${fmt.int(group.contracts.length)} قرارداد</button></div>
          <div class="de-contract-grid">${group.contracts.map((item) => `
            <label class="de-contract"><input type="checkbox" data-contract="${esc(item.ins)}"${picked.has(String(item.ins)) ? ' checked' : ''}>
              <span><b>${esc(item.name)}</b><small>${item.kind === 'call' ? 'کال' : 'پوت'}${item.strike ? ` · اعمال ${fmt.money(item.strike)}` : ''}</small></span></label>`).join('')}</div>
        </div>`).join('')}</div>`);
    }
    contractsHost.innerHTML = blocks.length ? blocks.join('') : '<p class="empty-note">با این پالایه قراردادی نماند.</p>';
    $('de-contract-note').textContent = picked.size
      ? `${fmt.int(picked.size)} قرارداد انتخاب شده از ${fmt.int(shown)} قراردادِ نمایش‌داده‌شده. برگ پایه‌ها هم خودکار اضافه می‌شود.`
      : `${fmt.int(shown)} قرارداد در دسترس است؛ هیچ‌کدام هنوز انتخاب نشده.`;
    updateRunState();
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
    paintContracts();
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

  /**
   * یک بستهٔ ریزمعامله، با شکستنِ خودکار در صورت شکست.
   *
   * ═══ گزارشی که این تابع جوابش است ═══
   *
   * فایل صاحب پروژه ۸۳ برگ داشت و صفر ریزمعامله. هر ۷۷۸ ردیفِ برگ پوشش
   * یک پیام داشت: پاسخ، صفحهٔ HTML یک دروازه بود نه JSON. یعنی **یک**
   * درخواستِ بزرگ وسط راه قطع شده و همه‌چیز را با خودش برده بود.
   *
   * حالا بستهٔ شکست‌خورده نصف می‌شود و هر نیمه دوباره می‌رود. اگر علت
   * زمان باشد، نیمه‌ها می‌رسند؛ اگر یک ابزارِ خاص باشد، نصف‌کردنِ پیاپی
   * جدایش می‌کند و بقیه نجات پیدا می‌کنند. بستهٔ تک‌جفتی دیگر شکسته
   * نمی‌شود — خطایش واقعاً مالِ همان جفت است و همان‌جا ثبت می‌شود.
   */
  // ═══ چرا شکستن هم سقف دارد ═══
  //
  // اگر دروازه واقعاً مرده باشد، نصف‌کردنِ پیاپی هر بسته را تا جفت‌های
  // تکی می‌شکند: برای ۴۰۵ جفت یعنی صدها درخواستِ محکوم‌به‌شکست و چند
  // دقیقه انتظار برای نتیجه‌ای که از درخواست پنجم معلوم بود. پس وقتی چند
  // تلاشِ تک‌جفتیِ پیاپی با هم شکست خوردند، بقیهٔ بسته‌ها بی شکستن و با
  // همان علت علامت می‌خورند. عدد کوچک است چون تشخیص باید سریع باشد، و
  // اولین موفقیت صفرش می‌کند.
  const GIVE_UP_AFTER = 5;
  let soloFailures = 0;
  let lastFailure = '';

  async function fetchBatch(batch, items, signal, depth = 0) {
    if (soloFailures >= GIVE_UP_AFTER) {
      for (const pair of batch) {
        items[pair.key] = { rows: [], error: lastFailure || 'دریافت پیاپی شکست خورد', source: 'history' };
      }
      return false;
    }
    try {
      const response = await fetch('/api/trades/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ requests: batch.map(({ ins, date }) => ({ ins, date })) }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
      for (const pair of batch) {
        const hit = payload.items?.[pair.key];
        items[pair.key] = hit && Array.isArray(hit.rows)
          ? { ...hit, source: 'history' }
          : { rows: [], error: hit?.error || 'پاسخ این ابزار/روز در بسته نبود', source: 'history' };
      }
      soloFailures = 0;
      return true;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      const halves = splitPairBatch(batch);
      if (!halves.length) {
        items[batch[0].key] = { rows: [], error: error.message, source: 'history' };
        soloFailures += 1;
        lastFailure = error.message;
        return false;
      }
      setStatus(`بستهٔ ${fmt.int(batch.length)} تایی نرسید؛ نصف شد و دوباره می‌رود…`);
      let all = true;
      for (const half of halves) all = (await fetchBatch(half, items, signal, depth + 1)) && all;
      return all;
    }
  }

  /**
   * تابلوی روزانهٔ همان ابزارها — منبع دومی که «بی‌معامله» را می‌سنجد.
   *
   * ═══ چرا این درخواستِ اضافه ارزشش را دارد ═══
   *
   * یک درخواستِ دسته‌ای برای همهٔ ابزارها، در برابر ۵۹ ابزار/روزی که
   * «بدون معامله» خوانده شده بودند بی آنکه کسی بتواند راست‌آزمایی کند.
   * ردیفِ روزانه شمارِ معاملهٔ آن روز را دارد؛ اگر تابلو بگوید آن روز
   * معامله شده و نوار صفر ردیف بدهد، دیگر حدس نیست.
   *
   * شکستش کارِ اصلی را نمی‌خورد: بی این، حکمِ خالی‌ها «نمی‌دانیم» می‌شود،
   * نه «بی‌معامله».
   */
  async function fetchDaily(instruments, range, signal) {
    const codes = [...new Set(instruments.map((item) => String(item.ins)).filter(Boolean))];
    if (!codes.length) return {};
    const span = Math.max(1, tradingDays(range.from, range.to).length);
    setStatus('در حال گرفتن تابلوی روزانه برای راست‌آزمایی خالی‌ها…');
    try {
      const response = await fetch(`/api/dailies?ins=${codes.join(',')}&n=${span + 10}`, { cache: 'no-store', signal });
      const payload = await response.json();
      if (!response.ok || payload?.error) throw new Error(payload?.error || `پاسخ ${response.status}`);
      return payload && typeof payload === 'object' ? payload : {};
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      logError('data-export:daily', error);
      return {};
    }
  }

  async function fetchHistorical(pairs, items, signal) {
    const batches = dataExportPairBatches(pairs, DATA_EXPORT_BATCH_CAP);
    for (let index = 0; index < batches.length; index += 1) {
      setStatus(`در حال دریافت روزهای بسته‌شده: بسته ${fmt.int(index + 1)} از ${fmt.int(batches.length)}…`);
      await fetchBatch(batches[index], items, signal);
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
      const split = dataExportSessionRows(dataExportTradeRows(item, pairs, items));
      const count = split.rows.length;
      const failures = pairs.filter((pair) => pair.ins === item.ins && items[pair.key]?.error).length;
      return `<tr><td>${esc(item.baseName)}</td><td>${esc(item.name)}</td><td>${item.kind === 'underlying' ? 'پایه' : item.kind === 'call' ? 'کال' : 'پوت'}</td><td class="n">${fmt.int(count)}</td><td class="n">${fmt.int(split.outside)}</td><td class="n">${fmt.int(failures)}</td></tr>`;
    });
    const headline = Number.isFinite(bytes)
      ? `فایل با حجم ${fmt.int(Math.ceil(bytes / 1024))} کیلوبایت دانلود شد.`
      : 'داده آماده است؛ برای دریافت فایل روی «خروجی Excel» بزنید.';
    $('de-result').innerHTML = `<p class="note">${headline}</p><table class="history-table"><thead><tr><th>پایه</th><th>شیت ابزار</th><th>نوع</th><th>ریزمعاملهٔ ۹ تا ۱۲:۳۰</th><th>بیرون از جلسه</th><th>روز خطادار</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  async function run() {
    if (!universe) { setStatus('دفتر قراردادها هنوز دریافت نشده است.', true); return; }
    if (!picked.size) { setStatus('دست‌کم یک قرارداد را از گام سوم انتخاب کن.', true); return; }
    const range = rangeUi.range;
    const instruments = selectedInstruments();
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
      const dailyByIns = await fetchDaily(instruments, range, controller.signal);
      setStatus('داده‌ها آماده شد؛ در حال ساخت شیت‌های Excel…');
      const outcome = dataExportOutcome(pairs, items);
      const audit = dataExportBlankAudit(pairs, items, dailyByIns);
      const sheets = buildDataExportSheets({
        instruments, pairs, items, range, complete: universe.complete, note: universe.note || '',
        outcome, audit,
      });
      prepared = { sheets, filename: dataExportFilename(range), instruments, pairs, items };
      paintResult(instruments, pairs, items);
      // ═══ چرا صفر بودنِ داده، خبرِ اول است ═══
      //
      // فایلِ گزارش‌شده «آمادهٔ خروجی» خوانده شد چون رابط فقط شیت‌ها را
      // می‌شمرد. حالا اگر هیچ جفتی داده نیاورده باشد، جمله با همان شروع
      // می‌شود و علتِ غالب هم کنارش می‌آید.
      const blanks = blankAuditSummary(audit);
      const head = outcome.blank
        ? `هیچ ریزمعامله‌ای دریافت نشد — ${fmt.int(outcome.failed)} ابزار/روز خطا داد و ${fmt.int(outcome.empty)} تا خالی برگشت.`
        : `آمادهٔ خروجی: ${fmt.int(outcome.trades)} ریزمعامله از ${fmt.int(outcome.ok)} ابزار/روز، در ${fmt.int(instruments.length)} شیت.`;
      const why = outcome.topReason ? ` علت غالب: ${outcome.topReason[0]} (${fmt.int(outcome.topReason[1])} بار).` : '';
      // «بی‌معامله» تا وقتی تابلوی روزانه تأییدش نکند، ادعا است نه واقعیت.
      const blankWhy = blanks.missing
        ? ` ${fmt.int(blanks.missing)} ابزار/روز تابلو معامله ثبت کرده ولی ریزمعامله‌اش نیامد`
          + `${blanks.worst ? ` (بدترینش کد ${faDigits(blanks.worst.ins)} با ${fmt.int(blanks.worst.dailyTrades)} معامله)` : ''}`
          + ` — این یعنی داده نرسیده، نه اینکه بازار ساکت بوده.`
        : (blanks.quiet ? ` ${fmt.int(blanks.quiet)} ابزار/روزِ خالی با تابلوی روزانه تأیید شد.` : '');
      setStatus(`${head}${outcome.failed && !outcome.blank ? ` ${fmt.int(outcome.failed)} ابزار/روز خطادار.` : ''}${why}${blankWhy}`
        + `${universe.complete ? '' : ' پوشش دفتر ناقص است و داخل فایل نوشته می‌شود.'}`,
      outcome.blank || blanks.missing > 0);
    } catch (error) {
      if (error.name === 'AbortError') setStatus('دریافت با درخواست شما متوقف شد.', true);
      else { setStatus(`ساخت خروجی کامل نشد: ${error.message}`, true); logError('data-export', error); }
    } finally { controller = null; stopBtn.hidden = true; updateRunState(); }
  }

  /**
   * یک ابزار و یک روز، و جوابِ خام.
   *
   * ═══ چرا این دکمه لازم شد ═══
   *
   * تشخیصِ «چرا خروجی خالی است» تا امروز یعنی اجرای کلِ بازه، چند دقیقه
   * انتظار، و بعد خواندنِ برگ پوشش. برای یک پرسشِ بله/خیر، این گران است.
   * اینجا همان مسیرِ واقعی — همان endpoint، همان تلاش دوم با پرچم دیگر —
   * روی یک جفت می‌رود و هر چه برگشت را می‌گوید، از جمله اینکه تابلوی
   * روزانهٔ همان روز چه ادعایی دارد.
   */
  async function probeOne() {
    const out = $('de-probe-out');
    const instruments = selectedInstruments();
    const contract = instruments.find((item) => item.kind !== 'underlying');
    if (!contract) { out.textContent = 'اول یک قرارداد انتخاب کن.'; return; }
    const days = tradingDays(rangeUi.range.from, rangeUi.range.to);
    const date = days[days.length - 1];
    if (!date) { out.textContent = 'در این بازه روز معاملاتی نیست.'; return; }
    out.textContent = `در حال آزمون ${contract.name} در ${faDigits(String(date))}…`;
    try {
      const response = await fetch('/api/trades/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ ins: contract.ins, date }], fresh: true }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
      const hit = payload.items?.[`${date}:${contract.ins}`] || {};
      const daily = await fetchDaily([contract], { from: date, to: date }, undefined);
      const board = (daily?.[contract.ins]?.rows || []).find((row) => Math.trunc(Number(row.date)) === date);
      const rows = Array.isArray(hit.rows) ? hit.rows.length : 0;
      const boardText = board
        ? `تابلوی روزانهٔ همان روز ${fmt.int(board.trades)} معامله و حجم ${fmt.int(board.vol)} می‌گوید`
        : 'تابلوی روزانهٔ آن روز در دست نیست';
      out.textContent = hit.error
        ? `${contract.name} · ${faDigits(String(date))}: خطا — ${hit.error}`
        : `${contract.name} · ${faDigits(String(date))}: ${fmt.int(rows)} ریزمعامله`
          + `${hit.variant ? ` (پرچم ${hit.variant})` : ''}. ${boardText}.`
          + `${!rows && board && Number(board.trades) > 0 ? ' یعنی داده نرسیده، نه اینکه بازار ساکت بوده.' : ''}`;
    } catch (error) {
      out.textContent = `آزمون انجام نشد: ${error.message}`;
      logError('data-export:probe', error);
    }
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

  basesHost.addEventListener('change', () => { invalidatePrepared(); paintContracts(); });
  contractsHost.addEventListener('change', (event) => {
    const box = event.target.closest('[data-contract]');
    if (!box) return;
    if (box.checked) picked.add(String(box.dataset.contract)); else picked.delete(String(box.dataset.contract));
    invalidatePrepared();
    paintContracts();
  });
  contractsHost.addEventListener('click', (event) => {
    const button = event.target.closest('[data-base-all], [data-expiry-all]');
    if (!button) return;
    // دکمهٔ گروهی کلید است نه تیک: اگر همهٔ گروه انتخاب شده، همان دکمه
    // برشان می‌دارد. دو دکمهٔ جدا برای یک کار، نوار را شلوغ می‌کند.
    const baseIns = button.dataset.baseAll || String(button.dataset.expiryAll || '').split('|')[0];
    const expiry = button.dataset.expiryAll ? Number(String(button.dataset.expiryAll).split('|')[1]) : null;
    const side = $('de-side').value;
    const needle = $('de-contract-search').value.trim();
    const target = dataExportContractGroups(discovered, baseIns)
      .filter((group) => expiry === null || group.expiry === expiry)
      .flatMap((group) => group.contracts)
      .filter((item) => !side || item.kind === side)
      .filter((item) => !needle || String(item.name).includes(needle))
      .map((item) => String(item.ins));
    const allOn = target.length > 0 && target.every((ins) => picked.has(ins));
    for (const ins of target) { if (allOn) picked.delete(ins); else picked.add(ins); }
    invalidatePrepared();
    paintContracts();
  });
  $('de-side').addEventListener('change', paintContracts);
  $('de-contract-search').addEventListener('input', paintContracts);
  /** قراردادهایی که همین حالا روی صفحه دیده می‌شوند — با پالایهٔ نوع و جست‌وجو. */
  const visibleContracts = () => {
    const side = $('de-side').value;
    const needle = $('de-contract-search').value.trim();
    return discovered
      .filter((item) => item.kind !== 'underlying')
      .filter((item) => !side || item.kind === side)
      .filter((item) => !needle || String(item.name).includes(needle))
      .map((item) => String(item.ins));
  };
  // «انتخاب همه» یعنی همهٔ آنچه **می‌بینی**. اگر پالایه را نادیده می‌گرفت،
  // کاربری که روی «فقط کال» ایستاده بود با یک کلیک پوت‌ها را هم می‌گرفت و
  // هیچ‌جا نمی‌فهمید — تا وقتی فایل بیرون بیاید.
  $('de-pick-all').addEventListener('click', () => {
    for (const ins of visibleContracts()) picked.add(ins);
    invalidatePrepared(); paintContracts();
  });
  $('de-pick-none').addEventListener('click', () => { picked.clear(); invalidatePrepared(); paintContracts(); });
  $('de-search').addEventListener('input', (event) => { const q = event.target.value.trim(); for (const label of basesHost.querySelectorAll('.de-base')) label.hidden = q && !label.dataset.search.includes(q); });
  $('de-all').addEventListener('click', () => { for (const input of basesHost.querySelectorAll('input')) input.checked = true; invalidatePrepared(); paintContracts(); });
  $('de-none').addEventListener('click', () => { for (const input of basesHost.querySelectorAll('input')) input.checked = false; invalidatePrepared(); paintContracts(); });
  $('de-refresh').addEventListener('click', () => loadUniverse()); runBtn.addEventListener('click', run); $('de-probe').addEventListener('click', probeOne); exportBtn.addEventListener('click', exportPrepared); stopBtn.addEventListener('click', () => controller?.abort());

  await api.loadSettings();
  rangeUi = mountHistoryRange($('de-range'), { onApply: (range) => loadUniverse(range), quickEntry: true, compactNote: true });
  await loadUniverse(rangeUi.range);
  return () => { stopped = true; clearTimeout(refreshTimer); controller?.abort(); };
}
