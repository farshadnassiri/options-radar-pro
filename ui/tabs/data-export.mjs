// تب مستقل «خروجی دیتا» — کشف همه قراردادهای بازه و خروجی ریزمعامله.

import { buildChain } from '/core/chain.mjs';
import {
  DATA_EXPORT_BATCH_CAP, DATA_EXPORT_FRAMES, blankAuditSummary, dataExportBlankAudit,
  dataExportCandles, dataExportContractGroups, dataExportFrame, dataExportOutcome,
  dataExportPairBatches, dataExportPairs, dataExportRouteSplit, dataExportSessionRows,
  dataExportTradeRows, discoverDataExportInstruments, selectedDataExportInstruments,
  splitPairBatch,
} from '/core/data-export.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { tradingDays } from '/core/roster-scan.mjs';
import { LIVE_CODE_CAP, splitTradeDays } from '/core/trades-source.mjs';
import { inferLiveSessionDate, liveTapeCodes, liveTapeDay } from '/core/live-day.mjs';
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
    <div class="page-head"><h2>خروجی دیتا</h2><p>تمام قراردادهای اختیار معاملهٔ استانداردِ فعال در بازه—معامله‌شده یا بی‌معامله—را از دفتر تاریخی کشف می‌کند؛ اختیار تبعی وارد این فهرست نمی‌شود. ریزمعاملات خودِ پایه و هر قرارداد در شیت جدا می‌آید.</p></div>
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
      <div class="de-actions" style="margin-bottom:8px">
        <label class="check" for="de-frame"><span>تایم‌فریم</span>
          <select id="de-frame">${DATA_EXPORT_FRAMES.map((frame) => `<option value="${frame.id}">${esc(frame.label)}</option>`).join('')}</select></label>
        <label class="check" for="de-derived"><input type="checkbox" id="de-derived"><span>ستون‌های مشتق (ارزش خام، اندازه و ارزش قرارداد)</span></label>
      </div>
      <p class="note" id="de-frame-note">تایم‌فریم فقط شکل <b>خروجی</b> را عوض می‌کند، نه دریافت را: ریزمعامله همیشه کامل گرفته می‌شود و شمع از روی همان ساخته می‌شود، پس عوض‌کردنش دریافت دوباره نمی‌خواهد. سطلِ بی‌معامله ردیف نمی‌گیرد و هیچ قیمتی درون‌یابی نمی‌شود.</p>
      <div class="de-actions"><button type="button" class="ghost" id="de-run" disabled>آماده‌سازی ریزمعاملات</button><button type="button" class="btn" id="de-export" disabled>خروجی Excel</button><button type="button" class="ghost" id="de-stop" hidden>توقف</button></div>
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
          <div class="de-expiry-head"><b>${group.expiry ? faDigits(esc(historyDateLabel(group.expiry))) : 'سررسید نامعلوم'} · کال ${fmt.int(group.callCount)} · پوت ${fmt.int(group.putCount)}${group.callCount !== group.putCount ? ' · اختلاف رسمی کاتالوگ' : ''}</b>
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
      .map((item) => ({ ...item }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    basesHost.innerHTML = values.length ? values.map((item) => `
      <label class="de-base" data-search="${esc(item.name)}"><input type="checkbox" value="${esc(item.ins)}"${keep.has(item.ins) ? ' checked' : ''}><span><b>${esc(item.name)}</b><small>${fmt.int(item.contracts)} قرارداد · کال ${fmt.int(item.callContracts)} · پوت ${fmt.int(item.putContracts)}</small></span></label>`).join('') : '<p class="empty-note">در این بازه نماد پایه‌ای پیدا نشد.</p>';
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

  async function fetchBatch(batch, items, signal, depth = 0, fresh = false) {
    if (soloFailures >= GIVE_UP_AFTER) {
      for (const pair of batch) {
        items[pair.key] = { rows: [], error: lastFailure || 'دریافت پیاپی شکست خورد', source: 'history' };
      }
      return false;
    }
    try {
      const response = await fetch('/api/trades/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ requests: batch.map(({ ins, date }) => ({ ins, date })), fresh }),
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
      for (const half of halves) all = (await fetchBatch(half, items, signal, depth + 1, fresh)) && all;
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
    setStatus('در حال گرفتن تابلوی روزانه برای راست‌آزمایی خالی‌ها…');
    try {
      // ═══ چرا `n=0` و نه شمارِ روزهای بازه ═══
      //
      // `n` شمارِ آخرین ردیف‌های روزانه است و این تب تنها جایی بود که
      // عددی می‌فرستاد؛ بقیه `n=0` یعنی «کلِ تاریخِ موجود» می‌خواهند. برای
      // قراردادِ **منقضی** آن شمار از عمرِ خودِ قرارداد بیشتر می‌شد و
      // تابلوی روزانه‌اش نمی‌آمد — در فایل گزارش‌شده ۸۴۷ ابزار/روز «تابلوی
      // روزانه در دست نیست» گرفتند، یعنی راست‌آزمایی برای دوسومِ جفت‌ها
      // کور بود، دقیقاً همان‌جا که به آن نیاز داشتیم.
      const response = await fetch(`/api/dailies?ins=${codes.join(',')}&n=0`, { cache: 'no-store', signal });
      const payload = await response.json();
      if (!response.ok || payload?.error) throw new Error(payload?.error || `پاسخ ${response.status}`);
      return payload && typeof payload === 'object' ? payload : {};
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      logError('data-export:daily', error);
      return {};
    }
  }

  async function fetchHistorical(pairs, items, signal, fresh = false) {
    const batches = dataExportPairBatches(pairs, DATA_EXPORT_BATCH_CAP);
    for (let index = 0; index < batches.length; index += 1) {
      setStatus(`در حال دریافت روزهای بسته‌شده: بسته ${fmt.int(index + 1)} از ${fmt.int(batches.length)}…`);
      await fetchBatch(batches[index], items, signal, 0, fresh);
    }
  }

  /**
   * روزی که نوار زندهٔ تابلو **واقعاً** مالِ آن است.
   *
   * ═══ اشتباهی که این تابع جبرانش می‌کند ═══
   *
   * این تب روزها را با `tehranDateNumber()` تقسیم می‌کرد: هرچه کوچک‌تر از
   * «امروزِ تقویم» بود به مسیر تاریخی می‌رفت. ولی بالادست ریزمعاملهٔ یک
   * جلسه را تا مدتی در مسیر تاریخی **نمی‌گذارد** — همان چیزی که ممیزی
   * ۱۴۰۵/۰۶/۲۴ ثبت کرده و `core/trades-source.mjs` با نمونهٔ عددی نوشته:
   *
   *     اهرم   `/api/trades` ۰   ·   `/api/live-trades` ۱۰٬۷۶۱
   *
   * پنج‌شنبه که روز معاملاتی نیست، «امروزِ تقویم» ۱۷ است ولی نوار هنوز
   * جلسهٔ چهارشنبه (۱۶) را دارد. با تقسیمِ تقویمی، ۱۶ به مسیر تاریخیِ
   * هنوز-خالی می‌رفت و کل خروجی خالی درمی‌آمد — دقیقاً همان فایلی که
   * تابلوی روزانه‌اش برای اهرم ۴۳٬۱۵۲ معامله ثبت کرده بود.
   *
   * پس تصمیم از `splitTradeDays` می‌آید — همان تابعی که آزمایشگاه آپشن از
   * آن استفاده می‌کند — و ورودی‌اش `liveDate`ی است که خودِ تابلو تأیید
   * کرده، نه ساعت مرورگر.
   */
  async function resolveLiveDay(signal) {
    try {
      const response = await fetch('/api/history/universe?build=0', { cache: 'no-store', signal });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
      const day = liveTapeDay(payload);
      if (day.ok) return { payload, date: day.date, why: day.why || '' };

      // در روز تعطیل یا پیش از بازشدن بازار، تابلو و GetTrade هر دو نوارِ
      // آخرین جلسه را نگه می‌دارند. liveTapeDay عمداً آن را «امروز» نمی‌زند؛
      // اینجا تاریخ واقعی‌اش را با تطبیق اثرانگشت نوار و تابلوی روزانه پیدا
      // می‌کنیم. این مسیر تعطیلی رسمی را هم درست می‌فهمد و حدس تقویمی نیست.
      const mayHoldPrevious = ['holiday', 'before'].includes(String(payload?.market?.phase || ''))
        && ['watch', 'snapshot'].includes(String(payload?.source || ''))
        && payload?.archived !== true && payload?.boardUnavailable !== true;
      if (!mayHoldPrevious) return { payload, date: 0, why: day.why || '' };
      const codes = [...new Set((payload.rows || []).map((row) => String(row?.uaInsCode || '')).filter(Boolean))].slice(0, 3);
      if (!codes.length) return { payload, date: 0, why: day.why || '' };
      const [tapeResponse, dailyResponse] = await Promise.all([
        fetch(`/api/live-trades?ins=${codes.join(',')}`, { cache: 'no-store', signal }),
        fetch(`/api/dailies?ins=${codes.join(',')}&n=12`, { cache: 'no-store', signal }),
      ]);
      const [tape, daily] = await Promise.all([tapeResponse.json(), dailyResponse.json()]);
      if (!tapeResponse.ok || tape?.error || !dailyResponse.ok || daily?.error) {
        const why = tape?.error || daily?.error || `پاسخ ${!tapeResponse.ok ? tapeResponse.status : dailyResponse.status}`;
        return { payload, date: 0, why: `${day.why || 'روز نوار روشن نیست'}؛ تطبیق آخرین جلسه نرسید: ${why}` };
      }
      const inferred = inferLiveSessionDate(tape.items, daily);
      return {
        payload, date: inferred, inferred: inferred > 0,
        why: inferred ? 'تاریخ آخرین جلسه از تطبیق نوار و تابلوی روزانه تأیید شد' : `${day.why || 'روز نوار روشن نیست'}؛ اثرانگشت نوار با روزانه تطبیق نکرد`,
      };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      return { payload: null, date: 0, why: error.message };
    }
  }

  async function fetchLive(pairs, items, signal, resolved) {
    if (!pairs.length) return;
    const payload = resolved?.payload;
    if (!payload) {
      for (const pair of pairs) items[pair.key] = { rows: [], error: `عکس امروز دریافت نشد: ${resolved?.why || 'نامعلوم'}`, source: 'live' };
      return;
    }
    const day = { ok: resolved.date > 0, date: resolved.date, why: resolved.why };
    if (!day.ok || !pairs.some((pair) => pair.date === day.date)) {
      for (const pair of pairs) items[pair.key] = { rows: [], error: `نوار امروز قابل انتساب نبود${day.why ? `: ${day.why}` : ''}`, source: 'live' };
      return;
    }
    const wanted = new Set(pairs.map((pair) => String(pair.ins)));
    const present = new Set();
    for (const row of payload.rows || []) for (const key of ['uaInsCode', 'insCode_C', 'insCode_P']) {
      const ins = String(row?.[key] ?? ''); if (ins) present.add(ins);
    }
    // در روز تعطیل، تابلوی «امروز» ممکن است قراردادِ منقضی‌شده در آخرین
    // جلسه را دیگر فهرست نکند، در حالی که GetTrade هنوز نوار همان جلسه را
    // دارد. برای روزی که با اثرانگشت تأیید شده، همهٔ ابزارهای انتخابی پرسیده
    // می‌شوند؛ در جلسهٔ جاری همان پالایهٔ تابلو بار را کم نگه می‌دارد.
    const boardCodes = liveTapeCodes(payload.rows, wanted, { withContracts: true });
    const codes = resolved?.inferred ? [...new Set([...boardCodes, ...wanted])] : boardCodes;
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

  /**
   * جدول نتیجه، با ستونِ «ردیف خروجی» کنار شمارِ ریزمعامله.
   *
   * ═══ چرا هر دو عدد ═══
   *
   * گزارش صاحب پروژه دربارهٔ حجم فایل بود، و تنها اهرمِ صادقانهٔ حجم،
   * تفکیکِ زمانی است. برای اینکه انتخابِ تایم‌فریم حدس نباشد، همین‌جا —
   * پیش از ساختِ فایل — گفته می‌شود که با این تایم‌فریم هر شیت چند ردیف
   * می‌شود. حجم فایل تقریباً با جمعِ همین ستون خطی است.
   */
  function paintResult(instruments, pairs, items, bytes = null) {
    const frame = dataExportFrame($('de-frame').value);
    let ticks = 0, out = 0;
    const rows = instruments.map((item) => {
      const split = dataExportSessionRows(dataExportTradeRows(item, pairs, items));
      const count = split.rows.length;
      const written = frame.seconds ? dataExportCandles(split.rows, frame.seconds).length : count;
      ticks += count; out += written;
      const failures = pairs.filter((pair) => pair.ins === item.ins && items[pair.key]?.error).length;
      return `<tr><td>${esc(item.baseName)}</td><td>${esc(item.name)}</td><td>${item.kind === 'underlying' ? 'پایه' : item.kind === 'call' ? 'کال' : 'پوت'}</td><td class="n">${fmt.int(count)}</td><td class="n">${fmt.int(written)}</td><td class="n">${fmt.int(split.outside)}</td><td class="n">${fmt.int(failures)}</td></tr>`;
    });
    const shrink = frame.seconds && ticks > out
      ? ` با «${frame.label}» خروجی ${fmt.int(out)} ردیف می‌شود به‌جای ${fmt.int(ticks)} — حدود ${fmt.int(Math.round(ticks / Math.max(1, out)))} برابر کوچک‌تر.`
      : '';
    const headline = Number.isFinite(bytes)
      ? `فایل با حجم ${fmt.int(Math.ceil(bytes / 1024))} کیلوبایت دانلود شد.${shrink}`
      : `داده آماده است؛ برای دریافت فایل روی «خروجی Excel» بزنید.${shrink}`;
    $('de-result').innerHTML = `<p class="note">${headline}</p><table class="history-table"><thead><tr><th>پایه</th><th>شیت ابزار</th><th>نوع</th><th>ریزمعاملهٔ ۹ تا ۱۲:۳۰</th><th>ردیف خروجی</th><th>بیرون از جلسه</th><th>روز خطادار</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
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
    const items = {};
    try {
      soloFailures = 0;
      lastFailure = '';
      // اول باید معلوم شود نوارِ زنده مالِ کدام روز است؛ تقسیمِ روزها به آن
      // بستگی دارد، نه به ساعت مرورگر.
      setStatus('در حال تشخیص روزِ نوار زنده…');
      const resolved = await resolveLiveDay(controller.signal);
      const { live: liveDates, history: historyDates, ahead } = splitTradeDays(
        [...new Set(pairs.map((pair) => pair.date))], { liveDate: resolved.date },
      );
      const liveSet = new Set(liveDates), aheadSet = new Set(ahead), historySet = new Set(historyDates);
      const historical = pairs.filter((pair) => historySet.has(pair.date));
      const live = pairs.filter((pair) => liveSet.has(pair.date));
      for (const pair of pairs.filter((pair) => aheadSet.has(pair.date))) {
        items[pair.key] = { rows: [], error: 'روز آینده است', source: '' };
      }
      if (liveDates.length) setStatus(`نوار زنده مالِ ${faDigits(String(resolved.date))} است؛ همان روز از نوار گرفته می‌شود نه از مسیر تاریخی.`);
      await fetchHistorical(historical, items, controller.signal);
      await fetchLive(live, items, controller.signal, resolved);
      const dailyByIns = await fetchDaily(instruments, range, controller.signal);
      setStatus('داده‌ها آماده شد.');
      let outcome = dataExportOutcome(pairs, items);
      let audit = dataExportBlankAudit(pairs, items, dailyByIns);
      // خالیِ تاریخی که تابلوی روزانه تکذیبش می‌کند غالباً پاسخِ خالیِ کش
      // CDN است. همان جفت‌ها دقیقاً یک بار با cache-buster دوباره می‌روند؛
      // نه همهٔ بازه، و نه خالی‌ای که تابلو واقعاً صفر اعلام کرده است.
      const missingKeys = new Set(audit.filter((row) => row.verdict === 'missing'
        && items[row.key]?.source === 'history').map((row) => row.key));
      const staleHistorical = pairs.filter((pair) => missingKeys.has(pair.key));
      if (staleHistorical.length) {
        setStatus(`${fmt.int(staleHistorical.length)} ابزار/روز در تاریخچه خالی بود ولی تابلو معامله ثبت کرده؛ دریافت تازه در حال انجام است…`);
        await fetchHistorical(staleHistorical, items, controller.signal, true);
        outcome = dataExportOutcome(pairs, items);
        audit = dataExportBlankAudit(pairs, items, dailyByIns);
      }
      // شیت‌ها اینجا ساخته نمی‌شوند: تایم‌فریم شکلِ نوشتن است نه دریافت، و
      // ساختنشان در `exportPrepared` یعنی عوض‌کردنش دریافتِ دوباره نمی‌خواهد.
      prepared = { instruments, pairs, items, range, complete: universe.complete, note: universe.note || '', outcome, audit };
      paintResult(instruments, pairs, items);
      // ═══ چرا صفر بودنِ داده، خبرِ اول است ═══
      //
      // فایلِ گزارش‌شده «آمادهٔ خروجی» خوانده شد چون رابط فقط شیت‌ها را
      // می‌شمرد. حالا اگر هیچ جفتی داده نیاورده باشد، جمله با همان شروع
      // می‌شود و علتِ غالب هم کنارش می‌آید.
      const blanks = blankAuditSummary(audit);
      // ═══ وقتی یک مسیرِ کامل صفر می‌آورد ═══
      //
      // گزارش نوبت پنجم: ۱٬۳۱۶ ابزار/روزِ تاریخی، همه خالی، صفر خطا — و
      // جملهٔ وضعیت فقط گفت «۲ ابزار/روز داده آورد». صفرِ یک **مسیرِ
      // کامل** بازارِ ساکت نیست؛ خبرِ اول است و باید همان‌جا گفته شود،
      // با شکلِ خامِ پاسخی که بالادست داد.
      const route = dataExportRouteSplit(pairs, items);
      const deadRoute = route.history.total >= 5 && route.history.ok === 0 && route.history.failed === 0
        ? (() => {
          const shapes = new Map();
          for (const pair of pairs) {
            const text = String(items[pair.key]?.upstream || '');
            if (text) shapes.set(text, (shapes.get(text) || 0) + 1);
          }
          const top = [...shapes.entries()].sort((a, b) => b[1] - a[1])[0];
          return ` هیچ‌کدام از ${fmt.int(route.history.total)} ابزار/روزِ مسیر تاریخی داده نیاورد و هیچ خطایی هم نداد`
            + `${top ? ` — بالادست برای ${fmt.int(top[1])} تایشان «${top[0]}» برگرداند` : ''}.`;
        })()
        : '';
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
      setStatus(`${head}${deadRoute}${outcome.failed && !outcome.blank ? ` ${fmt.int(outcome.failed)} ابزار/روز خطادار.` : ''}${why}${blankWhy}`
        + `${universe.complete ? '' : ' پوشش دفتر ناقص است و داخل فایل نوشته می‌شود.'}`,
      outcome.blank || blanks.missing > 0 || Boolean(deadRoute));
    } catch (error) {
      if (error.name === 'AbortError') setStatus('دریافت با درخواست شما متوقف شد.', true);
      else { setStatus(`ساخت خروجی کامل نشد: ${error.message}`, true); logError('data-export', error); }
    } finally { controller = null; stopBtn.hidden = true; updateRunState(); }
  }

  /**
   * ساختِ فایل از دادهٔ آماده، در تایم‌فریمِ همین حالا.
   *
   * ═══ چرا شیت‌ها اینجا ساخته می‌شوند و نه در `run` ═══
   *
   * تایم‌فریم هیچ ربطی به **دریافت** ندارد: ریزمعامله همیشه کامل گرفته
   * می‌شود و شمع صرفاً شکلِ نوشتنِ همان است. اگر شیت‌ها موقع دریافت ساخته
   * می‌شدند، عوض‌کردنِ تایم‌فریم یعنی چند دقیقه دریافتِ دوباره برای داده‌ای
   * که همین‌جا در دست است.
   */
  async function exportPrepared() {
    if (!prepared) { setStatus('اول ریزمعاملات را آماده کنید.', true); return; }
    exporting = true; updateRunState();
    try {
      const frame = $('de-frame').value, derived = $('de-derived').checked;
      const sheets = buildDataExportSheets({ ...prepared, frame, derived });
      const bytes = await downloadXlsx(dataExportFilename(prepared.range, frame), sheets);
      paintResult(prepared.instruments, prepared.pairs, prepared.items, bytes);
      setStatus(`فایل Excel در تایم‌فریم «${dataExportFrame(frame).label}» دانلود شد.`
        + ' تایم‌فریم را عوض کنید و دوباره همین دکمه را بزنید — دریافت دوباره لازم نیست.');
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
  // تایم‌فریم دادهٔ گرفته‌شده را باطل نمی‌کند — فقط برآوردِ ردیف عوض می‌شود.
  $('de-frame').addEventListener('change', () => {
    if (prepared) paintResult(prepared.instruments, prepared.pairs, prepared.items);
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
  $('de-refresh').addEventListener('click', () => loadUniverse()); runBtn.addEventListener('click', run); exportBtn.addEventListener('click', exportPrepared); stopBtn.addEventListener('click', () => controller?.abort());

  await api.loadSettings();
  rangeUi = mountHistoryRange($('de-range'), { onApply: (range) => loadUniverse(range), quickEntry: true, compactNote: true });
  await loadUniverse(rangeUi.range);
  return () => { stopped = true; clearTimeout(refreshTimer); controller?.abort(); };
}
