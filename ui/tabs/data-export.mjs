// تب مستقل «خروجی دیتا» — کشف همه قراردادهای بازه و خروجی ریزمعامله.

import { buildChain } from '/core/chain.mjs';
import {
  DATA_EXPORT_BATCH_CAP, DATA_EXPORT_FRAMES, blankAuditSummary, dataExportBlankAudit,
  dataExportCandles, dataExportContractGroups, dataExportFrame, dataExportOutcome,
  dataExportPairBatches, dataExportPairs, dataExportRouteSplit, dataExportSessionRows,
  dataExportTradeRows, discoverDataExportInstruments, selectedDataExportInstruments,
  exportBlockers, exportWarnings, instrumentsWithPairs, splitPairBatch, suspectEmptyDays,
  unknownListingContracts, clockLabel, sessionWindow,
} from '/core/data-export.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { tradingDays } from '/core/roster-scan.mjs';
import { LIVE_CODE_CAP, splitTradeDays } from '/core/trades-source.mjs';
import { INS_CAP, insBatches, mergeInsPayloads } from '/core/ins-batches.mjs';
import { expectationFromDailyRow, keepBetterTape } from '/core/tape-choice.mjs';
import {
  REFILL_MAX_ATTEMPTS, markAttempt, refillDelayMs, refillProgress,
  refillQueue, refillSummary,
} from '/core/refill-queue.mjs';
import { inferLiveSessionDate, liveTapeCodes, liveTapeDay } from '/core/live-day.mjs';
import { fetchRangeUniverse, mountHistoryRange } from '/ui/history-range.mjs';
import { buildDataExportSheets, dataExportFilename } from '/ui/data-export-workbook.mjs';
import { downloadXlsx } from '/ui/xlsx.mjs';
import { faDigits, fmt } from '/ui/fmt.mjs';
import { logError } from '/ui/errlog.mjs';
import { fetchDailies } from '/ui/daily-intake.mjs';

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
      <div class="de-actions" style="margin-bottom:8px">
        <label class="check" for="de-from-time"><span>از ساعت</span>
          <input type="time" id="de-from-time" step="1" value="09:00:00"></label>
        <label class="check" for="de-to-time"><span>تا ساعت</span>
          <input type="time" id="de-to-time" step="1" value="12:30:00"></label>
        <label class="check" for="de-continuous"><input type="checkbox" id="de-continuous"><span>جدول زمانی پیوسته (سطلِ بی‌معامله هم ردیف بگیرد)</span></label>
      </div>
      <p class="note" id="de-frame-note">تایم‌فریم فقط شکل <b>خروجی</b> را عوض می‌کند، نه دریافت را: ریزمعامله همیشه کامل گرفته می‌شود و شمع از روی همان ساخته می‌شود، پس عوض‌کردنش دریافت دوباره نمی‌خواهد. پنجرهٔ ساعت هم همین‌طور است و در پالایه، شمع‌سازی و برگ راهنما یکسان اعمال می‌شود. جدول پیوسته سطلِ بی‌معامله را با خانه‌های قیمتِ <b>خالی</b> می‌آورد و ستون «معامله شد» آن را «خیر» می‌خواند — هیچ قیمتی درون‌یابی یا از سطل قبل تکرار نمی‌شود.</p>
      <p class="note" id="de-window-note" hidden></p>
      <div class="de-actions"><button type="button" class="ghost" id="de-run" disabled>آماده‌سازی ریزمعاملات</button><button type="button" class="ghost" id="de-refill" hidden>تلاش تکمیلی</button><button type="button" class="btn" id="de-export" disabled>خروجی Excel</button><button type="button" class="ghost" id="de-stop" hidden>توقف</button></div>
      <p class="note" id="de-refill-note" hidden></p>
      <p id="de-status" class="note" role="status" aria-live="polite"></p><div id="de-result" class="history-table-wrap"></div>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  /**
   * پنجرهٔ ساعتِ همین حالا، از ورودی‌های کاربر.
   *
   * ورودیِ نامعتبر بی‌صدا به پیش‌فرض نمی‌افتد: `sessionWindow` دلیلش را
   * می‌دهد و همان‌جا زیرِ کنترل‌ها نوشته می‌شود. سکوت در این مورد یعنی
   * کاربر فکر کند انتخابش اعمال شده، در حالی که نشده.
   */
  const currentWindow = () => sessionWindow($('de-from-time').value, $('de-to-time').value);
  const basesHost = $('de-bases'), contractsHost = $('de-contracts');
  const runBtn = $('de-run'), exportBtn = $('de-export'), stopBtn = $('de-stop');
  const refillBtn = $('de-refill');
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
  /**
   * روزهای اسکن‌نشدهٔ همین بازه.
   *
   * ═══ چرا خروجی تا تکمیلِ اسکن قفل می‌شود ═══
   *
   * ممیزی صاحب پروژه: فایلِ بازهٔ شش‌ماهه اعلام می‌کرد «۱۳۰ روزِ کاری هنوز
   * اسکن نشده» و با همان دفترِ ناقص خروجی گرفته بود — نتیجه‌اش هم فهرستِ
   * ناقصِ قرارداد بود، هم تاریخ‌های عرضهٔ نامعلوم.
   *
   * و یک علتِ دوم که در خطِ زمانیِ همان فایل دیده می‌شود: اسکنِ پس‌زمینه
   * همان سهمیهٔ بالادست را مصرف می‌کند که خروجی به آن نیاز دارد.
   * ریزمعاملهٔ پایه تا ۲۰۲۴/۱۰/۱۶ **پیوسته** آمد و از ۲۰۲۴/۱۰/۱۹ به بعد
   * هیچ — نه پنجرهٔ نگه‌داری (که انتهای تازه را نگه می‌دارد نه کهنه را)،
   * بلکه ته‌کشیدنِ سهمیه وسط اجرا.
   *
   * قفل به **همین بازه** بسته است، نه به سلامتِ کلِ دفتر: قفلِ سراسریِ
   * `complete=false` پیش از این دکمه را دائماً غیرفعال می‌کرد و برداشته
   * شد. روزهای نبودهٔ خارج از بازه کارِ این خروجی نیستند.
   */
  // پاسِ مشخصات هزاران قراردادِ بی‌معاملهٔ نامرتبط، انتخابِ کاربر را قفل نمی‌کند.
  // اگر خودِ قرارداد انتخابی تاریخ عرضه نداشته باشد، همان انتخاب دقیقاً مانع می‌شود.
  const blockers = () => exportBlockers(universe, selectedInstruments());
  const warnings = () => exportWarnings(universe, selectedInstruments());

  function paintBlockerStatus() {
    if (controller || exporting) return;
    const why = blockers();
    if (why.length) {
      setStatus(`تا تکمیل دفتر، خروجی قفل است — ${faDigits(why.join('؛ '))}.`, true);
      return;
    }
    // ═══ R4-05: ناقص گفته می‌شود، ولی قفل نمی‌کند ═══
    //
    // پیش از این همین حرف‌ها دکمه را می‌بستند و کاربر راهی نداشت. حالا
    // خروجی باز است و کم‌داشته‌اش همین‌جا و داخلِ فایل نوشته می‌شود.
    const soft = warnings();
    setStatus(soft.length
      ? `خروجی باز است، ولی پوشش ناقص است — ${faDigits(soft.join('؛ '))}.`
        + ' همین محدودیت در برگ راهنمای فایل هم ثبت می‌شود.'
      : '');
  }

  function updateRunState() {
    runBtn.disabled = !universe || !picked.size || Boolean(controller) || exporting
      || blockers().length > 0;
    exportBtn.disabled = !prepared || Boolean(controller) || exporting;
    $('de-universe-note').toggleAttribute('data-error', universe?.complete === false);
    paintRefillState();
  }

  /**
   * دکمهٔ «تلاش تکمیلی» و جملهٔ کنارش.
   *
   * دکمه فقط وقتی دیده می‌شود که واقعاً کاری برای کردن باشد. صفِ خالی
   * یعنی یا همه‌چیز آمده یا هرچه مانده سقفِ تلاشش را خورده — و در حالت
   * دوم هم همین‌جا گفته می‌شود، نه اینکه دکمه بی‌صدا ناپدید شود.
   */
  function paintRefillState() {
    const note = $('de-refill-note');
    if (!prepared) { refillBtn.hidden = true; note.hidden = true; return; }
    const queue = currentRefillQueue();
    const sum = refillSummary(queue);
    refillBtn.hidden = sum.total === 0;
    refillBtn.disabled = Boolean(controller) || exporting;
    if (sum.total) {
      refillBtn.textContent = `تلاش تکمیلی (${fmt.int(sum.total)} ابزار/روز)`;
      note.hidden = false;
      note.removeAttribute('data-error');
      note.textContent = `${fmt.int(sum.total)} ابزار/روز هنوز کم دارد`
        + `${sum.missing ? ` — ${fmt.int(sum.missing)} تا اصلاً نیامد` : ''}`
        + `${sum.partial ? `، ${fmt.int(sum.partial)} تا ناقص` : ''}`
        + `${sum.error ? `، ${fmt.int(sum.error)} تا خطادار` : ''}`
        + `${sum.throttled ? `، ${fmt.int(sum.throttled)} تا پشتِ سهمیهٔ بالادست ماندند و اصلاً پرسیده نشدند` : ''}`
        + `. تلاش تکمیلی فقط همین‌ها را دوباره می‌پرسد و دادهٔ موجود را دست نمی‌زند؛`
        + ` هر ابزار/روز حداکثر ${fmt.int(REFILL_MAX_ATTEMPTS)} بار.`;
      return;
    }
    // صفِ خالی دو معنی دارد و این دو نباید یکی دیده شوند.
    const exhausted = (prepared.pairs || []).filter((pair) => {
      const hit = prepared.items?.[pair.key];
      return Number(hit?.attempts || 0) >= REFILL_MAX_ATTEMPTS
        && !(Array.isArray(hit?.rows) && hit.rows.length);
    }).length;
    note.hidden = exhausted === 0;
    if (exhausted) {
      note.setAttribute('data-error', '');
      note.textContent = `${fmt.int(exhausted)} ابزار/روز پس از ${fmt.int(REFILL_MAX_ATTEMPTS)} تلاش هم نیامد.`
        + ' این دیگر «حالا نیامد» نیست؛ بازه را کوچک‌تر بگیرید یا بعداً دوباره امتحان کنید.';
    }
  }

  /** صفِ همین حالا، از دادهٔ آماده. */
  function currentRefillQueue() {
    if (!prepared) return [];
    return refillQueue(prepared.pairs, prepared.items, prepared.audit);
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
      updateRunState(); paintBlockerStatus();
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
    updateRunState(); paintBlockerStatus();
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
        // ═══ چرا این جمله شرطی شد ═══
        //
        // R4-04: متن می‌گفت «با پوشش فعلی هم می‌توانید خروجی بگیرید» در
        // حالی که دکمه به‌خاطر قراردادهای بی‌تاریخِ عرضه **قفل** بود. دو
        // پیامِ متناقض در یک صفحه، کاربر را دنبالِ دکمه‌ای می‌فرستد که
        // وجود ندارد. جمله باید همان چیزی را بگوید که واقعاً هست.
        const stuck = blockers();
        $('de-universe-note').textContent = `${payload.note || ''} ساخت دفتر ادامه دارد؛ `
          + (stuck.length
            ? `ولی تا رفعِ این‌ها خروجی قفل است — ${stuck.join('؛ ')}.`
            : 'با پوشش فعلی هم می‌توانید خروجی بگیرید و محدودیت داخل فایل ثبت می‌شود.');
        // ساختِ دفتر ادامه دارد، ولی دیگر دکمه را نمی‌بندد؛ پس وضعیتِ
        // کنارِ دکمه هم باید همین را بگوید، نه قفلِ نبوده را.
        paintBlockerStatus();
        refreshTimer = setTimeout(() => loadUniverse(range), 4000);
      } else if (!payload.complete) $('de-universe-note').textContent = `${payload.note || ''} پوشش دفتر کامل نیست؛ خروجی در دسترس است و این محدودیت داخل برگ راهنما ثبت می‌شود.`;
      // قفل باید همان‌جا که دکمه است دیده شود، نه فقط در یادداشت بالا.
      paintBlockerStatus();
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

  /**
   * ═══ R5-01: یک نقطهٔ شمارش برای **هر** دورِ پرسیدن ═══
   *
   * پیش از این، شمارنده فقط در حلقهٔ تلاشِ تکمیلی بالا می‌رفت و دریافتِ
   * اولیه اصلاً شمرده نمی‌شد. در آزمونِ واقعیِ دور پنجم، پس از یک کلیکِ
   * تمام‌شدهٔ «تلاش تکمیلی»، ستون «تلاش دریافت» برای ۳۵۹ ابزار/روز «۱ بار»
   * نوشت و برگ راهنما همچنان گفت «هر ابزار/روز یک بار پرسیده شد» — چون
   * راهنما و ابزارِ کنترل `بیش از یک بار` را نشانهٔ تلاشِ دوباره می‌گیرند.
   *
   * حالا شمارش همین‌جا و فقط همین‌جا می‌افتد: هر جفتی که در این دور
   * **پاسخی برایش نشست** — موفق، خطادار، یا رهاشده — یک واحد می‌گیرد. پس
   * دورِ اول ۱ می‌شود و دورِ تکمیلی ۲، و «نپرسیدیم» با `۰` از «پرسیدیم و
   * نداد» جدا می‌ماند.
   *
   * شمارش **پس از** `keepBetterTape` می‌نشیند نه پیش از آن: اگر پاسخِ تازه
   * بدتر باشد، رکوردِ قبلی می‌ماند و شمارنده باید روی همان رکوردِ
   * باقی‌مانده بالا برود، وگرنه تلاشِ رفته با دور ریختنِ پاسخِ بد پاک
   * می‌شود.
   */
  const mark = (record) => markAttempt(record, Date.now());

  async function fetchBatch(batch, items, signal, depth = 0, fresh = false, bust = true) {
    if (soloFailures >= GIVE_UP_AFTER) {
      for (const pair of batch) {
        items[pair.key] = mark(keepBetterTape(items[pair.key],
          { rows: [], error: lastFailure || 'دریافت پیاپی شکست خورد', source: 'history' },
          expectationFor(pair)));
      }
      return false;
    }
    try {
      const response = await fetch('/api/trades/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({
          requests: batch.map(({ ins, date, key }) => {
            const expect = expectationFor({ ins, date, key });
            // فقط وقتی مرجع واقعاً در دست است؛ وگرنه سرور خودش می‌پرسد.
            return expect.known
              ? { ins, date, expect: { trades: expect.trades, volume: expect.volume } }
              : { ins, date };
          }),
          fresh,
          // دورِ زوجِ تکمیلی URLِ سادهٔ بالادست را می‌زند؛ کشِ سرور در هر
          // حال دور زده می‌شود، وگرنه «تلاشِ دوباره» به بالادست نمی‌رسد.
          bust,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
      // حکمِ سهمیه از سرور می‌آید و همین‌جا حمل می‌شود؛ بسته‌های بعدی
      // اصلاً فرستاده نمی‌شوند.
      if (payload.throttled) throttled = { note: String(payload.throttleNote || ''), at: Date.now() };
      for (const pair of batch) {
        const hit = payload.items?.[pair.key];
        const fresh0 = hit && Array.isArray(hit.rows)
          ? { ...hit, source: 'history', retried: fresh }
          : { rows: [], error: hit?.error || 'پاسخ این ابزار/روز در بسته نبود', source: 'history', retried: fresh };
        // ═══ F-04: تلاشِ دوباره نباید دادهٔ موجود را پاک کند ═══
        //
        // بازتولیدِ ثبت‌شدهٔ آزمونِ عملی: همین درخواست با `fresh:false`
        // برای اهرم/۲۰۲۶۰۹۱۹ ۲٬۵۲۱ ردیف داد و با `fresh:true` صفر؛
        // `items[key].rows` از ۲٬۵۲۱ به صفر رسید و شیتِ آن روز خالی شد.
        // تابلو همان لحظه هنوز ۷٬۷۳۶ معامله می‌گفت، پس «معامله نشده»
        // توضیحِ آن صفر نبود — ناپایداریِ بالادست بود.
        //
        // `keepBetterTape` فقط وقتی جایگزین می‌کند که پاسخِ تازه بهتر
        // باشد. نگه‌داشتنِ دادهٔ قبلی یعنی «از دستش ندادیم»، نه «کامل
        // است»: پرچمِ تلاشِ ناموفق جدا حمل می‌شود و حکمِ پوشش سرِ جایش
        // می‌ماند.
        // مرجعی که سرور پیدا کرده پیش از نشستنِ رکورد ثبت می‌شود، تا
        // همین دور هم از آن سود ببرد و دورهای بعد بی‌مرجع نمانند.
        if (hit?.reference && Number.isFinite(Number(hit.reference.trades))) {
          referenceIndex.set(String(pair.key), hit.reference);
        }
        items[pair.key] = mark(keepBetterTape(items[pair.key], fresh0, expectationFor(pair)));
      }
      soloFailures = 0;
      return true;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      const halves = splitPairBatch(batch);
      if (!halves.length) {
        items[batch[0].key] = mark(keepBetterTape(items[batch[0].key],
          { rows: [], error: error.message, source: 'history' }, expectationFor(batch[0])));
        soloFailures += 1;
        lastFailure = error.message;
        return false;
      }
      setStatus(`بستهٔ ${fmt.int(batch.length)} تایی نرسید؛ نصف شد و دوباره می‌رود…`);
      let all = true;
      for (const half of halves) all = (await fetchBatch(half, items, signal, depth + 1, fresh, bust)) && all;
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
  // کدهایی که تابلوی روزانه‌شان پاسخ نگرفت. «نیامد» است، نه «نداشت».
  let dailyMissing = [];
  // ═══ مرجعِ سنجش، برای اینکه تلاشِ دوباره ویرانگر نباشد ═══
  //
  // F-04: بی مرجع، «پاسخِ تازه» و «پاسخِ بهتر» یکی شمرده می‌شدند و یک
  // صفرِ لحظه‌ایِ بالادست ۲٬۵۲۱ ردیفِ سالم را می‌برد. تابلوی روزانه همان
  // چیزی است که می‌گوید کدام پاسخ به واقعیت نزدیک‌تر است.
  //
  // دورِ اول هنوز مرجعی ندارد (روزانه پس از آن گرفته می‌شود) و همان هم
  // درست است: بی مرجع، `keepBetterTape` به «پرحجم‌تر می‌ماند» برمی‌گردد
  // و خالی هرگز جای پر را نمی‌گیرد.
  let dailyIndex = new Map();
  // ═══ R5-08: سهمیهٔ بالادست، وقتی سرور تشخیصش داد ═══
  //
  // بی این، تب بستهٔ بعدی را می‌فرستاد و سهمیه را بیشتر می‌سوزاند — و
  // چون هر بسته خالی برمی‌گشت، فایل همه را «نیامد» می‌نوشت.
  let throttled = null;
  // مرجعی که **سرور** برای یک ابزار/روز پیدا کرده و همراهِ پاسخ فرستاده
  // (R5-05/R5-06). کلیدش `pair.key` است، نه `ins:date`، چون از همان
  // حلقه‌ای پر می‌شود که پاسخ‌ها را می‌نشاند.
  let referenceIndex = new Map();
  // ابزارهایی که تابلوی روزانه‌شان پاسخِ **خالی** داد — نه نبود، خالی.
  let dailyBlank = [];
  // تابلوی روزانه و روزهای جلسه‌باز، نگه‌داشته می‌شوند تا تلاشِ تکمیلی
  // بتواند ممیزی را دوباره حساب کند بی آنکه همه‌چیز را دوباره بگیرد.
  let lastDailyByIns = {}, lastOpenDates = [];
  /**
   * انتظارِ تابلوی روزانه برای یک ابزار/روز — از هر دری که هست.
   *
   * ═══ R5-06: چرا دو منبع، و چرا به این ترتیب ═══
   *
   * اولویت با تابلویی است که خودِ این تب یکجا گرفته
   * (`GetClosingPriceDailyList`)، چون یک درخواست برای کلِ عمرِ ابزار است
   * و فرستادنش همراهِ درخواست، سرور را از پرسیدنِ دوباره بی‌نیاز می‌کند.
   *
   * ولی آن endpoint برای قراردادِ **منقضی** خالی برمی‌گردد — قرارداد از
   * تابلو حذف شده. سرور همان روز را از `GetClosingPriceDaily` می‌گیرد و
   * مرجعش را همراهِ پاسخ برمی‌گرداند؛ از R5-05 این مرجع روی رکورد
   * می‌نشیند. پس دومین بار که همان ابزار/روز پرسیده می‌شود — دورِ خودکارِ
   * «با تابلو نخواند» یا هر دورِ تکمیلی — دیگر بی‌مرجع نیست.
   *
   * بی این، `keepBetterTape` در دورهای بعد به «پرحجم‌تر می‌ماند» برمی‌گشت
   * و هیچ‌وقت نمی‌فهمید کدام پاسخ واقعاً کامل است.
   */
  const expectationFor = (pair) => {
    const own = expectationFromDailyRow(
      dailyIndex.get(`${String(pair?.ins)}:${Math.trunc(Number(pair?.date) || 0)}`),
    );
    if (own.known) return own;
    const carried = referenceIndex.get(String(pair?.key ?? ''));
    if (!carried) return own;
    const trades = Number(carried.trades), volume = Number(carried.volume);
    if (!Number.isFinite(trades) || !Number.isFinite(volume)) return own;
    // صفرِ تأییدشده هم یک مرجع است، مثل مسیرِ دیگر.
    if (!trades && !volume) return { known: true, quiet: true, trades: 0, volume: 0, value: 0 };
    return { known: true, quiet: false, trades, volume, value: 0 };
  };

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
      // ═══ چرا دسته‌بندی، و چرا شمارشِ گمشده ═══
      //
      // ممیزی ۱۴۰۵/۰۶/۲۹ بند ۴: اینجا **همهٔ** کدها یکجا می‌رفتند و سقفِ
      // ۲۰۰تاییِ سرور بی‌صدا می‌بُرید. برای انتخابی بزرگ‌تر از ۲۰۰ ابزار،
      // راست‌آزماییِ خالی‌ها برای انتهای فهرست کور می‌شد — یعنی همان
      // سازوکاری که باید «داده نیامد» را از «بی‌معامله» جدا کند، خودش
      // خاموش بود، و کاربر هیچ نشانه‌ای نمی‌دید.
      //
      // حالا سرور اضافه‌درخواست را رد می‌کند و این تب خودش دسته می‌کند؛
      // و پس از جمع‌کردن، کدِ بی‌پاسخ **نام برده می‌شود** نه اینکه به
      // «تابلوی روزانه در دست نیست» ترجمه شود.
      const batches = insBatches(codes, INS_CAP.dailies);
      const parts = [];
      for (let index = 0; index < batches.length; index += 1) {
        if (batches.length > 1) {
          setStatus(`در حال گرفتن تابلوی روزانه: بسته ${fmt.int(index + 1)} از ${fmt.int(batches.length)}…`);
        }
        // R5-14: از دروازه. `byIns` بی `__meta` است، پس `mergeInsPayloads`
        // و شمارشِ `blank` پایین دست‌نخورده کار می‌کنند.
        parts.push((await fetchDailies(batches[index], { fetcher: (u, o) => fetch(u, { ...o, cache: 'no-store' }), signal })).byIns);
      }
      const merged = mergeInsPayloads(codes, parts);
      if (merged.missing.length) {
        // بالا نمی‌رود که اجرا را بیندازد؛ ثبت می‌شود تا در لاگ دیده شود
        // و در برگ راهنما شمرده شود.
        logError('data-export:daily-missing',
          new Error(`${merged.missing.length} ابزار از تابلوی روزانه پاسخ نگرفتند`));
      }
      dailyMissing = merged.missing;
      // R5-09: ابزاری که پاسخِ خالی گرفت هم راست‌آزمایی نشده، حتی اگر
      // درخواستش موفق بوده باشد.
      dailyBlank = merged.blank || [];
      dailyIndex = new Map();
      referenceIndex = new Map();
      throttled = null;
      for (const [ins, value] of Object.entries(merged.payload)) {
        for (const row of Array.isArray(value?.rows) ? value.rows : []) {
          const date = Math.trunc(Number(row?.date) || 0);
          if (date) dailyIndex.set(`${ins}:${date}`, row);
        }
      }
      return merged.payload;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      logError('data-export:daily', error);
      return {};
    }
  }

  async function fetchHistorical(pairs, items, signal, fresh = false, bust = true) {
    const batches = dataExportPairBatches(pairs, DATA_EXPORT_BATCH_CAP);
    for (let index = 0; index < batches.length; index += 1) {
      // R5-08: سهمیه که بسته شد، بستهٔ بعدی نمی‌رود. ادامه‌دادن نه داده
      // می‌آورد و نه بی‌هزینه است — پنجرهٔ سهمیه را تمدید می‌کند.
      //
      // ولی «نفرستادن» باید **علت** داشته باشد. بی این حلقه، جفت‌های
      // نرفته در فایل «درخواست نرفت» می‌گرفتند — که درست است ولی ناقص:
      // نمی‌گفت چرا نرفت. در هارنس ۴۰۲ ردیف دقیقاً همین شکل را داشتند،
      // کنار ۵۱ ردیفی که علتشان نوشته شده بود.
      if (throttled) {
        for (let rest = index; rest < batches.length; rest += 1) {
          for (const pair of batches[rest]) {
            // ═══ شرط اینجا «ردیف دارد» است، نه «رکورد دارد» ═══
            //
            // نسخهٔ اول `if (items[pair.key]) continue` بود، و همان
            // ابزار/روزهایی را رد می‌کرد که در پاسِ قبلی **خالی** نشسته
            // بودند — یعنی دقیقاً آن‌هایی که باید برچسبشان عوض می‌شد.
            // در هارنس ۵۴ ردیف به همین دلیل «نیامد» ماندند، با آنکه
            // سرور سهمیه را تشخیص داده بود.
            const seen = items[pair.key];
            if (Array.isArray(seen?.rows) && seen.rows.length) continue;
            items[pair.key] = {
              ...(seen || {}), rows: [], source: 'history', throttled: true,
              error: 'سهمیهٔ بالادست بسته شد؛ این ابزار/روز پرسیده نشد',
            };
          }
        }
        setStatus(`دریافت متوقف شد — ${throttled.note}`, true);
        return;
      }
      setStatus(`در حال دریافت روزهای بسته‌شده: بسته ${fmt.int(index + 1)} از ${fmt.int(batches.length)}…`);
      await fetchBatch(batches[index], items, signal, 0, fresh, bust);
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
        fetchDailies(codes, { n: 12, fetcher: (u, o) => fetch(u, { ...o, cache: 'no-store' }), signal }),
      ]);
      const [tape, daily] = await Promise.all([tapeResponse.json(), Promise.resolve(dailyResponse.byIns)]);
      if (!tapeResponse.ok || tape?.error) {
        const why = tape?.error || `پاسخ ${tapeResponse.status}`;
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
    const window = currentWindow();
    const continuous = $('de-continuous').checked;
    let ticks = 0, out = 0;
    const rows = instruments.map((item) => {
      const split = dataExportSessionRows(dataExportTradeRows(item, pairs, items, window));
      const count = split.rows.length;
      const written = frame.seconds
        ? dataExportCandles(split.rows, frame.seconds, { window, continuous }).length : count;
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
    const blocked = blockers();
    if (blocked.length) { setStatus(`خروجی هنوز آماده نیست — ${faDigits(blocked.join('؛ '))}.`, true); return; }
    const range = rangeUi.range;
    const instruments = selectedInstruments();
    // قراردادِ بی‌تاریخِ عرضه جفت نمی‌سازد؛ ولی بی‌صدا هم نمی‌افتد.
    const unlisted = unknownListingContracts(instruments);
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
      // ═══ چرا تابلوی روزانه **اول** گرفته می‌شود ═══
      //
      // دو دلیل، و هر دو از فایلِ واقعیِ ۲۰۲۶۰۶۲۲ تا ۲۰۲۶۰۹۲۰ آمدند:
      //
      // ۱. **هزینه.** سرور برای سنجیدنِ هر ابزار/روز یک رکوردِ روزانه
      //    لازم دارد. همین تب کلِ تاریخِ روزانهٔ همهٔ ابزارها را یکجا
      //    می‌گیرد، پس فرستادنش همراه درخواست یعنی سرور آن را دوباره
      //    نپرسد — برای آن فایل حدود ۲٬۷۰۰ درخواستِ بالادستِ کمتر.
      // ۲. **حفاظت از دورِ اول.** `keepBetterTape` بی مرجع فقط
      //    «پرحجم‌تر می‌ماند» را دارد؛ با مرجع، از همان دورِ اول
      //    می‌فهمد کدام پاسخ واقعاً کامل است.
      const dailyByIns = await fetchDaily(instruments, range, controller.signal);
      await fetchHistorical(historical, items, controller.signal);
      await fetchLive(live, items, controller.signal, resolved);
      // نوارِ زنده هم یک بار پرسیده شد. بی این خط، جفت‌های روزِ جاری در
      // ستون «تلاش دریافت» خالی می‌مانند و شبیهِ «اصلاً نپرسیدیم» می‌شوند.
      for (const pair of live) if (items[pair.key]) items[pair.key] = mark(items[pair.key]);
      setStatus('داده‌ها آماده شد.');
      // ═══ کدام روز «هنوز تمام نشده» است ═══
      //
      // تابلوی روزانهٔ روزِ جاری لحظه‌ای است و نوار هنوز پر می‌شود؛ تطبیق
      // شمار و حجم برای آن روز معنا ندارد و «ناقص» خواندنش ادعای غلط است.
      // فقط فازِ `open` چنین است: در `after` جلسه بسته شده و تطبیق دوباره
      // معنادار می‌شود.
      const openDates = String(resolved.payload?.market?.phase || '') === 'open' && resolved.date
        ? [resolved.date] : [];
      lastDailyByIns = dailyByIns; lastOpenDates = openDates;
      let outcome = dataExportOutcome(pairs, items);
      let audit = dataExportBlankAudit(pairs, items, dailyByIns, openDates);
      // خالیِ تاریخی که تابلوی روزانه تکذیبش می‌کند غالباً پاسخِ خالیِ کش
      // CDN است. همان جفت‌ها دقیقاً یک بار با cache-buster دوباره می‌روند؛
      // نه همهٔ بازه، و نه خالی‌ای که تابلو واقعاً صفر اعلام کرده است.
      //
      // ═══ و پاسخِ **نیمه‌کامل** هم همین‌جا دوباره پرسیده می‌شود ═══
      //
      // بند ۳ ممیزی: نوارِ یک‌ردیفی در برابر تابلوی هزارمعامله‌ای «موفق»
      // شمرده می‌شد و هیچ تلاش دوباره‌ای نمی‌گرفت. یک پاسخِ بریده هم یک
      // دریافتِ شکست‌خورده است، فقط با ظاهرِ موفق — پس دقیقاً همان یک دورِ
      // بی‌کش را می‌گیرد که خالیِ تکذیب‌شده می‌گیرد.
      const missingKeys = new Set(audit.filter((row) => (row.verdict === 'missing' || row.verdict === 'partial')
        && items[row.key]?.source === 'history').map((row) => row.key));
      const staleHistorical = pairs.filter((pair) => missingKeys.has(pair.key));
      if (staleHistorical.length) {
        setStatus(`${fmt.int(staleHistorical.length)} ابزار/روز با تابلوی روزانه نخواند (خالی یا ناقص)؛ دریافت تازه در حال انجام است…`);
        await fetchHistorical(staleHistorical, items, controller.signal, true);
        outcome = dataExportOutcome(pairs, items);
        audit = dataExportBlankAudit(pairs, items, dailyByIns, openDates);
      }
      // ═══ دور دوم برای روزهایی که **سراسر** خالی آمدند ═══
      //
      // گزارش: «خروجی صرفاً دیتای روز آخر معاملاتی را می‌دهد؛ کل بازه را
      // بده.» یک قراردادِ کم‌معامله می‌تواند روزی بی‌معامله باشد، ولی یک
      // روزِ معاملاتیِ کامل که هیچ ابزارِ انتخابی — حتی خودِ پایه — در آن
      // معامله‌ای نداشته باشد، واقعیتِ بازار نیست.
      //
      // دور اول بالا فقط جفت‌هایی را دوباره می‌پرسید که تابلوی روزانه
      // تکذیبشان کرده بود؛ برای قراردادِ منقضی آن تابلو اغلب در دست نیست
      // و همان جفت‌ها هرگز دور دوم نمی‌دیدند. خالی‌بودنِ سراسریِ یک روز
      // خودش مدرک است و به تأیید تابلو نیاز ندارد.
      //
      // `fresh` به نشانیِ بالادست cache-buster می‌چسباند — تنها راهِ رد
      // شدن از پاسخِ خالیِ کهنه‌ای که لبهٔ CDN نگه داشته و همه‌جا ۲۰۰ و
      // JSON معتبر به نظر می‌رسد. هر جفت حداکثر یک دور دوم می‌بیند.
      const suspectDays = new Set(suspectEmptyDays(pairs, items));
      const suspectPairs = pairs.filter((pair) => suspectDays.has(pair.date) && !items[pair.key]?.retried);
      if (suspectPairs.length) {
        setStatus(`${fmt.int(suspectDays.size)} روزِ معاملاتی سراسر خالی آمد — این واقعیتِ بازار نیست؛`
          + ` ${fmt.int(suspectPairs.length)} ابزار/روز بی‌کش دوباره پرسیده می‌شود…`);
        await fetchHistorical(suspectPairs, items, controller.signal, true);
        outcome = dataExportOutcome(pairs, items);
        audit = dataExportBlankAudit(pairs, items, dailyByIns, openDates);
      }
      const rescued = suspectPairs.filter((pair) => (items[pair.key]?.rows || []).length).length;
      // شیت‌ها اینجا ساخته نمی‌شوند: تایم‌فریم شکلِ نوشتن است نه دریافت، و
      // ساختنشان در `exportPrepared` یعنی عوض‌کردنش دریافتِ دوباره نمی‌خواهد.
      // ابزارِ بی‌جفت برگ نمی‌گیرد: قراردادی که وارد بازه نشده نباید برگِ
      // خالی بسازد. «جفت داشتن» ملاک است نه «معامله داشتن» — قراردادِ
      // زندهٔ بی‌معامله همچنان برگِ خالیِ خودش را دارد.
      const sheetInstruments = instrumentsWithPairs(instruments, pairs);
      prepared = {
        instruments: sheetInstruments, pairs, items, range,
        complete: universe.complete, note: universe.note || '', outcome, audit,
        // فهرستِ کدهایی که تابلوی روزانه‌شان نیامد، تا برگ راهنما بتواند
        // بگوید راست‌آزمایی برای چند ابزار انجام نشده.
        dailyMissing: [...dailyMissing], dailyBlank: [...dailyBlank],
        // و کم‌داشته‌هایی که دیگر قفل نمی‌کنند: اگر در فایل نوشته نشوند،
        // «قفل برداشته شد» به «انگار مشکلی نبود» ترجمه می‌شود.
        coverageWarnings: warnings(),
      };
      paintResult(sheetInstruments, pairs, items);
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
      const secondPass = suspectPairs.length
        ? (rescued
          ? ` دورِ دومِ بی‌کش ${fmt.int(rescued)} ابزار/روز را نجات داد.`
          : ` دورِ دومِ بی‌کش روی ${fmt.int(suspectPairs.length)} ابزار/روز هم چیزی نیاورد.`)
        : '';
      const unlistedNote = unlisted.length
        ? ` ${fmt.int(unlisted.length)} قرارداد تاریخ عرضه‌اش در دفتر نیست و وارد بازه نشد —`
          + ' «نمی‌دانیم کی عرضه شده» درخواستِ روزِ گذشته نمی‌سازد.'
        : '';
      const head = outcome.blank
        ? `هیچ ریزمعامله‌ای دریافت نشد — ${fmt.int(outcome.failed)} ابزار/روز خطا داد و ${fmt.int(outcome.empty)} تا خالی برگشت.`
        : `آمادهٔ خروجی: ${fmt.int(outcome.trades)} ریزمعامله از ${fmt.int(outcome.ok)} ابزار/روز، در ${fmt.int(sheetInstruments.length)} شیت.`;
      const why = outcome.topReason ? ` علت غالب: ${outcome.topReason[0]} (${fmt.int(outcome.topReason[1])} بار).` : '';
      // «بی‌معامله» تا وقتی تابلوی روزانه تأییدش نکند، ادعا است نه واقعیت.
      const blankWhy = blanks.missing
        ? ` ${fmt.int(blanks.missing)} ابزار/روز تابلو معامله ثبت کرده ولی ریزمعامله‌اش نیامد`
          + `${blanks.worst ? ` (بدترینش کد ${faDigits(blanks.worst.ins)} با ${fmt.int(blanks.worst.dailyTrades)} معامله)` : ''}`
          + ` — این یعنی داده نرسیده، نه اینکه بازار ساکت بوده.`
        : (blanks.quiet ? ` ${fmt.int(blanks.quiet)} ابزار/روزِ خالی با تابلوی روزانه تأیید شد.` : '');
      // ═══ چرا «ناقص» جملهٔ خودش را دارد ═══
      //
      // پاسخِ نیمه‌کامل نه خالی است نه کامل، و تا وقتی اسمش گفته نشود
      // کاربر فایل را «آماده» می‌خواند. عددِ حجمِ جامانده کنارش می‌آید
      // چون همان است که بزرگی مشکل را نشان می‌دهد.
      const partialWhy = blanks.partial
        ? ` ${fmt.int(blanks.partial)} ابزار/روز داده آورد ولی از تابلوی روزانه کمتر بود`
          + `${blanks.worstPartial ? ` (بدترینش کد ${faDigits(blanks.worstPartial.ins)}: ${fmt.int(blanks.worstPartial.volumeGap)} واحد حجم کمتر)` : ''}`
          + ` — پاسخِ بریده، نه بازارِ کم‌معامله.`
        : '';
      const matchedWhy = blanks.matched
        ? ` ${fmt.int(blanks.matched)} ابزار/روز با تابلوی روزانه تطبیق کامل شد.` : '';
      // کدی که تابلوی روزانه‌اش اصلاً پاسخ نگرفت، «بی‌معامله» نیست و
      // «تأییدنشده» هم نیست — راست‌آزمایی‌اش انجام **نشده**. سکوت در این
      // مورد همان بند ۴ ممیزی است.
      const dailyGap = dailyMissing.length || dailyBlank.length
        ? ` ${fmt.int(dailyMissing.length + dailyBlank.length)} ابزار تابلوی روزانه‌اش نیامد، پس راست‌آزماییِ خالی‌هایشان انجام نشد.`
        : '';
      setStatus(`${head}${unlistedNote}${secondPass}${deadRoute}${outcome.failed && !outcome.blank ? ` ${fmt.int(outcome.failed)} ابزار/روز خطادار.` : ''}${why}${blankWhy}${partialWhy}${matchedWhy}${dailyGap}`
        + `${universe.complete ? '' : ' پوشش دفتر ناقص است و داخل فایل نوشته می‌شود.'}`,
      outcome.blank || blanks.missing > 0 || blanks.partial > 0
        || dailyMissing.length > 0 || dailyBlank.length > 0 || Boolean(deadRoute));
    } catch (error) {
      if (error.name === 'AbortError') setStatus('دریافت با درخواست شما متوقف شد.', true);
      else { setStatus(`ساخت خروجی کامل نشد: ${error.message}`, true); logError('data-export', error); }
    } finally { controller = null; stopBtn.hidden = true; updateRunState(); }
  }

  /**
   * تلاشِ تکمیلی — فقط کم‌داشته‌ها، با فاصله، و با گزارشِ آنچه واقعاً
   * به دست آمد.
   *
   * ═══ چهار قاعده‌ای که این حلقه را بی‌خطر می‌کند ═══
   *
   * ۱. **دادهٔ موجود دست نمی‌خورد.** هر نشستن از `keepBetterTape` رد
   *    می‌شود، پس پاسخِ خالی یا بدترِ تازه هرگز جای ردیف‌های سالم را
   *    نمی‌گیرد. این همان F-04 است و اینجا دوباره لازمش داریم، چون
   *    ذاتِ این حلقه «دوباره پرسیدن» است.
   * ۲. **فاصله می‌افتد.** اگر علتِ خالی‌بودن فشارِ سهمیه باشد، تلاشِ
   *    فوری همان فشار را ادامه می‌دهد.
   * ۳. **سقف دارد.** هر ابزار/روز حداکثر چند بار؛ وگرنه حلقه تا ابد
   *    می‌چرخد و سهمیه را می‌خورد بی آنکه چیزی عوض شود.
   * ۴. **دو دورِ بی‌اثرِ پیاپی حلقه را می‌بندد.** اگر دو دور هیچ ردیفی
   *    اضافه نکردند، ادامه‌اش فقط امیدواری است — و آن را به کاربر
   *    می‌گوییم، نه اینکه بی‌صدا بچرخیم. **دو** دور، نه یکی، چون هر دور
   *    یکی از دو پرچم را می‌زند (قاعدهٔ ۵) و بستنِ حلقه پس از دورِ اول
   *    یعنی پرچمِ دوم هرگز امتحان نشود.
   * ۵. **پرچمِ درخواست بین دورها عوض می‌شود.** آزمونِ عملیِ F-04 ثبت کرد
   *    که همان ابزار/روز با `fresh:false` دو هزار ردیف داد و با
   *    `fresh:true` صفر؛ و دورِ پنجم ثبت کرد که بالادست بین دو نمونه از
   *    خالی به کامل می‌رود. ولی تا امروز هر تلاشِ پس از دورِ اول — هم
   *    پاسِ خودکارِ «با تابلو نخواند» و هم هر دورِ تکمیلی — **فقط**
   *    URLِ مهرخوردهٔ بالادست را می‌زد. یعنی اگر مشکل از همان شکلِ URL
   *    بود، هیچ‌وقت شکلِ دیگر امتحان نمی‌شد. حالا دورهای فرد مهرخورده
   *    می‌روند و دورهای زوج ساده، و `keepBetterTape` تضمین می‌کند
   *    هیچ‌کدام دادهٔ به‌دست‌آمده را پس نگیرد.
   *
   *    و این با «کشِ خودمان» یکی نیست: هر دو حالت `fresh` را روشن
   *    می‌فرستند، وگرنه دورِ ساده از کشِ ۹۰۰ثانیه‌ایِ سرور جواب می‌گیرد و
   *    اصلاً به بالادست نمی‌رسد. اولین پیاده‌سازیِ همین قاعده دقیقاً
   *    همین اشتباه را داشت و در اجرای آزمایشی لو رفت: چهار دور رفته بود
   *    و بالادست فقط سه بار پرسیده شده بود.
   */
  async function refill() {
    if (!prepared || controller) return;
    controller = new AbortController();
    stopBtn.hidden = false;
    updateRunState();
    const startedItems = { ...prepared.items };
    let round = 0, totalFilled = 0, totalGained = 0, barren = 0;
    try {
      for (;;) {
        const queue = currentRefillQueue();
        if (!queue.length) break;
        round += 1;
        const sum = refillSummary(queue);
        setStatus(`تلاش تکمیلی، دور ${fmt.int(round)}: ${fmt.int(queue.length)} ابزار/روز`
          + `${sum.worst ? ` — پرارزش‌ترینش کد ${faDigits(sum.worst.ins)} در ${faDigits(String(sum.worst.date))}` : ''}…`);

        const before = { ...prepared.items };
        // ═══ R5-01: اینجا دیگر شمارش نمی‌شود ═══
        //
        // شمارنده داخلِ `fetchBatch` می‌نشیند، یعنی همان جایی که دریافتِ
        // اولیه هم از آن رد می‌شود. افزایشِ جداگانهٔ اینجا یعنی دورِ
        // تکمیلی دو واحد بگیرد و دورِ اول هیچ — همان دو قراردادی که عدد
        // را بی‌معنی کرد.
        const jobs = queue.map((job) => ({ ins: job.ins, date: job.date, key: job.key }));
        // قاعدهٔ ۵: هر دور از کشِ سرور رد می‌شود؛ فقط مهرِ زمانِ URLِ
        // بالادست است که بین دورها عوض می‌شود — فرد مهرخورده، زوج ساده.
        const bust = round % 2 === 1;
        await fetchHistorical(jobs, prepared.items, controller.signal, true, bust);
        // ═══ R5-08: سهمیه که بسته شد، دورِ بعد بی‌فایده و پرهزینه است ═══
        //
        // آزمونِ واقعی: سهمیه دست‌کم نیم‌ساعت دوام آورد. فاصلهٔ این حلقه
        // چند دقیقه است، پس ادامه‌اش فقط پنجره را تمدید می‌کند.
        if (throttled) {
          prepared.audit = dataExportBlankAudit(prepared.pairs, prepared.items, lastDailyByIns, lastOpenDates);
          prepared.outcome = dataExportOutcome(prepared.pairs, prepared.items);
          paintResult(prepared.instruments, prepared.pairs, prepared.items);
          paintRefillState();
          setStatus(`تلاش تکمیلی متوقف شد — ${throttled.note}`, true);
          return;
        }

        // ممیزی دوباره حساب می‌شود، وگرنه صفِ دورِ بعد همان صفِ قبل است.
        prepared.audit = dataExportBlankAudit(prepared.pairs, prepared.items, lastDailyByIns, lastOpenDates);
        prepared.outcome = dataExportOutcome(prepared.pairs, prepared.items);
        const gained = refillProgress(queue, before, prepared.items);
        totalFilled += gained.filled + gained.improved;
        totalGained += gained.gainedTrades;
        paintResult(prepared.instruments, prepared.pairs, prepared.items);
        paintRefillState();

        barren = gained.gainedTrades ? 0 : barren + 1;
        if (barren >= 2) {
          setStatus(`دو دورِ پیاپی هیچ ردیفی اضافه نکردند — هر دو پرچمِ درخواست امتحان شد.`
            + `${totalGained ? ` در مجموع ${fmt.int(totalFilled)} ابزار/روز پر شد و ${fmt.int(totalGained)} ریزمعامله اضافه شد.` : ''}`
            + ' بالادست هنوز همان پاسخ را می‌دهد؛ چند دقیقه بعد دوباره بزنید یا بازه را کوچک‌تر بگیرید.', true);
          return;
        }
        if (!gained.gainedTrades) {
          setStatus(`دور ${fmt.int(round)} هیچ ردیفی اضافه نکرد؛`
            + ` دور بعد با پرچمِ دیگر می‌رود.`);
        } else setStatus(`دور ${fmt.int(round)}: ${fmt.int(gained.filled)} ابزار/روز پر شد،`
          + ` ${fmt.int(gained.improved)} تا کامل‌تر، ${fmt.int(gained.gainedTrades)} ریزمعاملهٔ تازه.`
          + ` ${fmt.int(gained.stillEmpty)} تا هنوز خالی.`);

        const next = currentRefillQueue();
        if (!next.length) break;
        const wait = refillDelayMs(round);
        setStatus(`دور ${fmt.int(round)} تمام شد — ${fmt.int(gained.gainedTrades)} ریزمعاملهٔ تازه.`
          + ` ${fmt.int(next.length)} ابزار/روز مانده؛ ${fmt.int(Math.round(wait / 1000))} ثانیه مکث تا دور بعد…`);
        await sleepUnlessAborted(wait, controller.signal);
      }
      const left = currentRefillQueue().length;
      setStatus(`تلاش تکمیلی تمام شد: ${fmt.int(totalFilled)} ابزار/روز پر یا کامل‌تر شد و`
        + ` ${fmt.int(totalGained)} ریزمعاملهٔ تازه به دست آمد.`
        + `${left ? ` ${fmt.int(left)} ابزار/روز هنوز مانده.` : ' چیزی در صف نماند.'}`,
      left > 0);
    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus(`تلاش تکمیلی متوقف شد. تا اینجا ${fmt.int(totalFilled)} ابزار/روز پر شد`
          + ` و ${fmt.int(totalGained)} ریزمعاملهٔ تازه به دست آمد — دادهٔ به‌دست‌آمده سرِ جایش می‌ماند.`, true);
      } else {
        setStatus(`تلاش تکمیلی کامل نشد: ${error.message}`, true);
        logError('data-export:refill', error);
      }
    } finally {
      controller = null; stopBtn.hidden = true;
      // هرچه به دست آمده در `prepared` است، پس خروجی همچنان ساختنی است.
      void startedItems;
      updateRunState();
    }
  }

  /** مکثِ قابل‌توقف. `setTimeout` تنها، دکمهٔ توقف را ناشنوا می‌کند. */
  function sleepUnlessAborted(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('متوقف شد', 'AbortError')); return; }
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
      function onAbort() { clearTimeout(timer); reject(new DOMException('متوقف شد', 'AbortError')); }
      signal?.addEventListener('abort', onAbort, { once: true });
    });
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
      const window = currentWindow(), continuous = $('de-continuous').checked;
      const sheets = buildDataExportSheets({ ...prepared, frame, derived, window, continuous });
      const bytes = await downloadXlsx(dataExportFilename(prepared.range, frame), sheets);
      paintResult(prepared.instruments, prepared.pairs, prepared.items, bytes);
      setStatus(`فایل Excel در تایم‌فریم «${dataExportFrame(frame).label}»`
        + ` و پنجرهٔ ${faDigits(clockLabel(window.start))} تا ${faDigits(clockLabel(window.end))} دانلود شد`
        + `${sheets.length > prepared.instruments.length + 2 ? ` — ابزارِ پرردیف به چند برگ تقسیم شد (${fmt.int(sheets.length)} برگ).` : '.'}`
        + ' تایم‌فریم و ساعت را عوض کنید و دوباره همین دکمه را بزنید — دریافت دوباره لازم نیست.');
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
  // ═══ چرا هیچ‌کدام از این‌ها دادهٔ گرفته‌شده را باطل نمی‌کند ═══
  //
  // تایم‌فریم و پنجرهٔ ساعت هر دو شکلِ **نوشتن**‌اند، نه دریافت: ریزمعامله
  // همیشه کامل گرفته می‌شود. پس عوض‌کردنشان فقط برآوردِ ردیف را دوباره
  // می‌کشد و هیچ درخواستی به بالادست نمی‌فرستد.
  const repaintEstimate = () => {
    const window = currentWindow();
    const note = $('de-window-note');
    note.hidden = !window.note;
    note.textContent = window.note;
    note.toggleAttribute('data-error', Boolean(window.note));
    if (prepared) paintResult(prepared.instruments, prepared.pairs, prepared.items);
  };
  for (const id of ['de-frame', 'de-from-time', 'de-to-time', 'de-continuous']) {
    $(id).addEventListener('change', repaintEstimate);
  }
  refillBtn.addEventListener('click', refill);
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
