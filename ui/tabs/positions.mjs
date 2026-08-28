// تب موقعیت‌های من — فاز ۷.
//
// موقعیت‌هایی که واقعاً اجرا کرده‌ای، با قیمت ورود واقعی خودت. ارزش‌گذاری هر
// لحظه یعنی هزینه بستن موقعیت در بازار، نه پریمیومی که گرفتی.

import { markToMarket, captureEntryRisk, blankPosition } from '/core/positions.mjs';
import { todayJalali, gregorianToJalali } from '/core/jalali.mjs';
import { marginParamsOf } from '/core/settings.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { mountPayoff } from '/ui/chart.mjs';
import { fmt } from '/ui/table.mjs';
import { faDigits, kpiTone } from '/ui/fmt.mjs';
import { onChain, chainState, pushRows, chainDetail } from '/ui/scanner.mjs';
import { attachExportsIn } from '/ui/export.mjs';
import { ivParams } from '/core/leg-iv.mjs';
import { tehranDateNumber } from '/core/live-day.mjs';
import { normalizeHistoryDate } from '/core/history.mjs';
import { GREEKS, monitorSnapshot, monitorStance } from '/core/monitor.mjs';
import { emptyReason } from '/ui/feed-state.mjs';

const KINDS = [
  ['covered-call', 'کاوردکال — سهم + فروش کال'],
  ['short-call', 'فروش کال بدون پوشش'],
  ['short-put', 'فروش پوت'],
  ['long-call', 'خرید کال'],
  ['long-put', 'خرید پوت'],
];

const displayName = (name, identifier, fallback) => {
  const text = String(name || '').trim();
  return text && text !== String(identifier || '') ? text : fallback;
};

export async function mount(root, { state, api }) {
  const s = () => state.settings;
  const feesNow = () => ({
    buyStock: s().feeBuyStock, sellStock: s().feeSellStock,
    option: s().feeOption, exercise: s().feeExercise,
  });
  const riskOptions = () => ({
    fees: feesNow(), params: marginParamsOf(s()),
    creditMode: s().creditSpreadMargin, capitalMode: s().capitalMode,
  });
  let positions = [];
  let quotesByIns = new Map();
  let uaList = [];
  let feed = { status: 'idle', error: '' };
  let expanded = null;
  let chart = null;
  let chartRange = null;
  let chartFor = null;

  root.innerHTML = `
    <div class="page-head">
      <h2>موقعیت‌های من</h2>
      <p>پریمیوم دریافتی تا سررسید سود تحقق‌یافته نیست. موقعیت فروش هر روز به قیمت روز بدهی است،
         پس ارزش‌گذاری اینجا هزینه بستن در بازار است.</p>
    </div>

    <div class="kpis" id="kpis"></div>

    <section class="card">
      <h3>افزودن موقعیت</h3>
      <p class="note">قیمت معامله برای سود و زیان است؛ قیمت‌های پایانی روز ورود فقط برای ثبت ثابت وجه تضمین و مخرج بازده‌اند.</p>
      <div class="grid" id="form"></div>
      <div class="bar" style="margin-top:12px">
        <button class="btn" id="add">افزودن</button>
        <span class="sp"></span>
        <span id="msg" class="saved" role="status" aria-live="polite"></span>
      </div>
    </section>

    <section class="card">
      <h3>فهرست موقعیت‌ها</h3>
      <div class="scroll" style="max-height:none"><table class="data" id="list"></table></div>
    </section>

    <section class="card" id="det-card" style="display:none">
      <h3 id="det-title">جزئیات موقعیت</h3>
      <div class="detail" id="det"></div>
    </section>`;

  // هر ظرف جدول، دکمهٔ خروجی خودش را می‌گیرد. ظرف‌ها در همین قالب‌اند حتی
  // وقتی خالی‌اند، و خواندن لحظهٔ کلیک انجام می‌شود — پس یک بار کافی است.
  attachExportsIn(root, 'positions');


  // ——————————————— فرم ———————————————
  const form = root.querySelector('#form');
  const F = {};
  const field = (key, label, kind, extra = '') => {
    const w = document.createElement('div');
    w.className = 'field';
    const controlId = `f-${key}`;
    const labelId = `${controlId}-label`;
    if (kind === 'select') w.innerHTML = `<label for="${controlId}">${label}</label><select id="${controlId}">${extra}</select>`;
    else if (kind === 'wheel') w.innerHTML = `<span class="field-label" id="${labelId}">${label}</span><div id="${controlId}" role="group" aria-labelledby="${labelId}"></div>`;
    else w.innerHTML = `<label for="${controlId}">${label}</label><input type="${kind}" id="${controlId}" ${extra}>`;
    form.appendChild(w);
    F[key] = w.querySelector(`#${controlId}`);
    return F[key];
  };

  // فهرست روزهای قابل انتخاب برای تاریخ ورود. تاریخ ورود موقعیتِ ثبت‌شده
  // همیشه در گذشته است، پس فقط عقب می‌رود؛ یک سال و نیم برای موقعیت‌های
  // اختیار — که سررسیدشان چند ماهه است — با فاصله زیاد کافی است.
  const entryDateOptions = () => {
    const out = [];
    const now = new Date();
    for (let back = 0; back < 540; back++) {
      const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - back));
      out.push(Number(`${day.getUTCFullYear()}${String(day.getUTCMonth() + 1).padStart(2, '0')}${String(day.getUTCDate()).padStart(2, '0')}`));
    }
    return out;
  };
  // میلادی به شمسی، به همان قالبی که `parseJalali` می‌خواند.
  const jalaliOf = (compact) => {
    const text = String(compact);
    const [jy, jm, jd] = gregorianToJalali(Number(text.slice(0, 4)), Number(text.slice(4, 6)), Number(text.slice(6, 8)));
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
  };

  field('kind', 'نوع موقعیت', 'select', KINDS.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''));
  field('ua', 'نماد پایه', 'select', '<option value="">— انتخاب کن —</option>');
  field('exp', 'سررسید', 'select', '');
  field('opt', 'قرارداد اختیار', 'select', '');
  field('date', 'تاریخ ورود (شمسی)', 'wheel');
  field('qty', 'تعداد قرارداد', 'number', 'value="1" min="1"');
  field('sPrice', 'قیمت پایانی پایه در ورود', 'number', 'value="0"');
  field('stockPrice', 'قیمت خرید سهم (فقط کاوردکال)', 'number', 'value="0"');
  field('oPrice', 'قیمت ورود اختیار', 'number', 'value="0"');
  field('oClose', 'قیمت پایانی اختیار در ورود', 'number', 'value="0"');

  const entryDates = entryDateOptions();
  mountDateWheel(F.date, entryDates, entryDates[0], () => {}, { empty: 'تاریخی در دسترس نیست.' });
  const entryDateValue = () => {
    const picked = Number(F.date.dataset.value);
    return picked ? jalaliOf(picked) : todayJalali();
  };

  // فهرست خالی هم باید حرف بزند. «— انتخاب کن —» روی فهرست بی‌نماد،
  // کاربر را دنبال چیزی می‌فرستد که آنجا نیست.
  function uaPlaceholder() {
    if (uaList.length) return '— انتخاب کن —';
    return emptyReason({ listCount: 0, feedStatus: feed.status, error: feed.error }).text;
  }

  function refreshUaOptions() {
    const cur = F.ua.value;
    F.ua.innerHTML = `<option value="">${uaPlaceholder()}</option>`
      + uaList.map((u) => `<option value="${u.ins}" ${u.ins === cur ? 'selected' : ''}>${displayName(u.name, u.ins, 'دارایی پایه بدون نام')}</option>`).join('');
  }

  let detail = null;
  F.ua.addEventListener('change', async () => {
    if (!F.ua.value) return;
    const res = await chainDetail(F.ua.value);
    if (res.error) return;
    detail = res.ua;
    F.exp.innerHTML = detail.expiries.map((ex, i) => `<option value="${i}">${faDigits(ex.days)} روز</option>`).join('');
    F.sPrice.value = Math.round(detail.close || detail.last || 0);
    F.stockPrice.value = Math.round(detail.last || detail.close || 0);
    fillOptions();
  });
  F.exp.addEventListener('change', fillOptions);
  F.kind.addEventListener('change', fillOptions);

  function wantPut() { return F.kind.value.includes('put'); }

  function fillOptions() {
    if (!detail) return;
    const ex = detail.expiries[Number(F.exp.value) || 0];
    if (!ex) return;
    const put = wantPut();
    F.opt.innerHTML = ex.strikes.map((st) => {
      const q = put ? st.put : st.call;
      return `<option value="${q.ins}" data-strike="${st.strike}" data-size="${st.size}" data-days="${ex.days}" data-expiry="${normalizeHistoryDate(ex.endDate)}" data-bid="${q.bid}" data-ask="${q.ask}" data-close="${q.close}">
        ${displayName(q.name, q.ins, 'قرارداد اختیار بدون نام')} — اعمال ${fmt.money(st.strike)} — تقاضا ${fmt.money(q.bid)}</option>`;
    }).join('');
    const first = F.opt.selectedOptions[0];
    if (first) {
      F.oPrice.value = Math.round(Number(first.dataset.bid) || Number(first.dataset.close) || 0);
      F.oClose.value = Math.round(Number(first.dataset.close) || 0);
    }
  }
  F.opt.addEventListener('change', () => {
    const o = F.opt.selectedOptions[0];
    if (o) {
      F.oPrice.value = Math.round(Number(o.dataset.bid) || Number(o.dataset.close) || 0);
      F.oClose.value = Math.round(Number(o.dataset.close) || 0);
    }
  });

  const msg = root.querySelector('#msg');
  let flashTimer = null;
  const flash = (t, bad) => {
    msg.textContent = t;
    msg.style.color = bad ? 'var(--loss)' : 'var(--gain)';
    // تایمر پیام قبلی لغو می‌شود — وگرنه اگر دو flash نزدیک هم بیایند
    // (مثلاً افزودن سریع دو موقعیت)، تایمر اولی پیام دومی را زودتر از
    // موعد پاک می‌کرد.
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { msg.textContent = ''; }, 3000);
  };

  const addBtn = root.querySelector('#add');
  addBtn.addEventListener('click', async () => {
    if (addBtn.disabled) return;
    const o = F.opt.selectedOptions[0];
    if (!o || !F.ua.value) { flash('نماد پایه و قرارداد را انتخاب کن.', true); return; }
    addBtn.disabled = true;
    try {
      const strike = Number(o.dataset.strike);
      // اندازه از مشخصات همان قرارداد می‌آید. اگر تابلو نداده باشد،
      // پیش‌فرض اعلامی تنظیمات می‌نشیند و کاربر همان‌جا خبردار می‌شود —
      // چون اندازه در هر عدد پولی این موقعیت ضرب خواهد شد.
      const specSize = Number(o.dataset.size);
      const size = specSize > 0 ? specSize : Number(s().contractSize) || 0;
      if (!(size > 0)) { flash('اندازه قرارداد معلوم نیست؛ در تنظیمات مقدارش را بگذار.', true); return; }
      if (!(specSize > 0)) {
        flash(`اندازه قرارداد از تابلو نیامد؛ پیش‌فرض تنظیمات (${size}) به کار رفت.`);
      }
      const days = Number(o.dataset.days);
      const kind = F.kind.value;
      const put = wantPut();
      const entrySpot = Number(F.sPrice.value);
      const stockPrice = Number(F.stockPrice.value);
      const optionPrice = Number(F.oPrice.value);
      const optionClose = Number(F.oClose.value);
      if (!(entrySpot > 0)) { flash('قیمت پایانی پایه در روز ورود را وارد کن.', true); return; }
      if (kind === 'covered-call' && !(stockPrice > 0)) { flash('قیمت واقعی خرید سهم را وارد کن.', true); return; }
      if (!(optionPrice > 0)) { flash('قیمت معامله اختیار را وارد کن.', true); return; }
      if (!(optionClose > 0)) { flash('قیمت پایانی اختیار در روز ورود را وارد کن.', true); return; }
      const legs = [];
      if (kind === 'covered-call') {
        legs.push({ kind: 'underlying', side: 'buy', ratio: 1, size, price: stockPrice, ins: F.ua.value });
      }
      legs.push({
        kind: put ? 'put' : 'call',
        side: kind.startsWith('long') ? 'buy' : 'sell',
        ratio: 1, size, strike, days,
        // سررسید روی خودِ پا می‌نشیند تا روز مانده در هر روزِ آینده از
        // تاریخ درآید نه از تفریق. موقعیت‌های ذخیره‌شدهٔ قدیمی این را
        // ندارند و مسیر جایگزینِ «روز ورود منهای روز نگهداری» را می‌گیرند.
        expiry: Number(o.dataset.expiry) || 0,
        price: optionPrice, entryClose: optionClose,
        ins: o.value, name: o.textContent.split('—')[0].trim(),
      });

      const position = {
        ...blankPosition(),
        title: `${KINDS.find(([v]) => v === kind)[1].split('—')[0].trim()} ${detail.name}`,
        uaIns: F.ua.value, uaName: detail.name,
        entryDate: entryDateValue(), entrySpot,
        qty: Math.max(1, Number(F.qty.value) || 1),
        legs,
      };
      position.entryRisk = captureEntryRisk(position, riskOptions());
      if (!position.entryRisk.available) { flash(position.entryRisk.reason, true); return; }
      positions.push(position);
      await save();
      flash('موقعیت افزوده شد.');
      render();
    } finally {
      addBtn.disabled = false;
    }
  });

  async function save({ quiet = false } = {}) {
    try {
      await fetch('/api/positions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(positions),
      });
    } catch { if (!quiet) flash('ذخیره نشد.', true); }
  }

  // ——————————————— ارزش‌گذاری ———————————————
  function quoteFor(leg) {
    const q = quotesByIns.get(leg.ins);
    if (q) return q;
    return { bid: 0, ask: 0, last: 0, close: 0 };
  }

  /**
   * روز مانده تا سررسیدِ **امروز** برای هر پا.
   *
   * موقعیت‌های ذخیره‌شدهٔ قدیمی سررسید ندارند و فقط «روز مانده در لحظهٔ
   * ورود» را نگه داشته‌اند. روز مانده امروز = همان عدد منهای روز نگهداری —
   * و چون هر دو تقویمی‌اند، این تفریق دقیق است نه تقریب. سررسید از روی آن
   * ساخته نمی‌شود؛ تاریخِ ساختگی بدتر از عددِ داده‌شده است.
   *
   * موقعیت تازه سررسید واقعی دارد و `undefined` می‌گیرد تا از همان استفاده
   * شود.
   */
  const daysLeftOf = (p, daysHeld) => p.legs.map((leg) => {
    if (leg.kind === 'underlying') return undefined;
    if (Number.isFinite(Number(leg.expiry)) && Number(leg.expiry) > 0) return undefined;
    const atEntry = Number(leg.days);
    if (!Number.isFinite(atEntry)) return undefined;
    return Math.max(0, atEntry - Number(daysHeld || 0));
  });

  /**
   * یونانی و تلاطم ضمنی موقعیتِ باز، در همین لحظه.
   *
   * قیمتِ مبنا همان `markPrice` است که سود و زیان از آن آمده — نه یک مبنای
   * دوم. اگر دو مبنا بود، «تلاطم ضمنی این پا» و «سود این پا» دو قیمت
   * متفاوت را می‌گفتند و هیچ‌کدام غلط به نظر نمی‌رسید.
   */
  function greeksOf(p, m, spot) {
    return monitorSnapshot(p.legs, {
      spot,
      prices: m.perLeg.map((leg) => leg.markPrice),
      date: tehranDateNumber(),
      days: daysLeftOf(p, m.daysHeld),
    }, ivParams(s(), {}));
  }

  function evalPos(p) {
    const fees = feesNow();
    const uaQ = quotesByIns.get(p.uaIns) || {};
    const spot = uaQ.last || uaQ.close || p.legs.find((l) => l.kind === 'underlying')?.price || 0;
    const quotes = p.legs.map((l) => (l.kind === 'underlying' ? uaQ : quoteFor(l)));
    const m = markToMarket(p, quotes, {
      ...riskOptions(), fees, spot, spotClose: uaQ.close || spot,
      basis: s().priceBasis === 'BOOK' ? 'BOOK' : s().priceBasis,
    });
    return { m, spot, quotes, fees, greeks: greeksOf(p, m, spot) };
  }

  function render() {
    const evals = positions.map((p) => ({ p, ...evalPos(p) }));

    // سلول یونانی: مرتبهٔ بزرگی این پنج عدد یکی نیست — گاما ۱۰ به توان منفی
    // هفت و وگا ریالی — پس `fmt.small` رقم اعشار را از خود عدد می‌گیرد.
    const gk = (value) => (Number.isFinite(value) ? fmt.small(value) : '—');
    const ivPctCell = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
    const rows = evals.map(({ p, m, greeks }, i) => `
      <tr data-i="${i}" style="cursor:pointer" tabindex="0" role="button" aria-label="جزئیات موقعیت ${p.title || '—'}">
        <td>${p.title || '—'}</td>
        <td>${displayName(p.uaName, p.uaIns, 'دارایی پایه بدون نام')}</td>
        <td>${p.legs.map((l) => `${l.side === 'sell' ? '−' : '+'}${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت') + ' ' + fmt.money(l.strike)}`).join(' ')}</td>
        <td class="n">${fmt.int(p.qty)}</td>
        <td class="n">${p.entryDate ? faDigits(p.entryDate) : '—'}</td>
        <td class="n">${m.daysHeld == null ? '—' : fmt.int(m.daysHeld)}</td>
        <td class="n">${fmt.money(m.capital * p.qty)}</td>
        <td class="n">${fmt.money(m.currentMargin * p.qty)}</td>
        <td class="n" style="color:${m.pnlTotal >= 0 ? 'var(--gain)' : 'var(--loss)'}">${fmt.money(m.pnlTotal)}</td>
        <td class="n">${fmt.pct(m.retPct)}</td>
        <td class="n">${fmt.pct(m.retMonthPct)}</td>
        <td class="n">${fmt.money(m.ifHeld.atSpot * p.qty)}</td>
        ${GREEKS.map(({ key }) => `<td class="n">${gk(greeks.greeks?.[key])}</td>`).join('')}
        <td class="n">${ivPctCell(greeks.meanIvPct)}</td>
        <td><button class="ghost" data-del="${i}">حذف</button></td>
      </tr>`).join('');

    root.querySelector('#list').innerHTML = positions.length ? `
      <thead><tr>
        <th>عنوان</th><th>پایه</th><th>پاها</th><th>تعداد</th><th>تاریخ ورود</th><th>روز</th>
        <th>سرمایه روز ورود</th><th>وجه تضمین امروز</th><th>سود و زیان الان</th><th>بازده از ورود ٪</th><th>ماهانه ٪</th><th>اگر تا سررسید بماند</th>${GREEKS.map(({ label }) => `<th>${label}</th>`).join('')}<th>تلاطم ضمنی</th><th></th>
      </tr></thead><tbody>${rows}</tbody>`
      : '<tbody><tr><td style="padding:16px;color:var(--muted)">موقعیتی ثبت نشده. از فرم بالا اضافه کن.</td></tr></tbody>';

    for (const b of root.querySelectorAll('[data-del]')) {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (b.disabled) return;
        const i = Number(b.dataset.del);
        const p = positions[i];
        // موقعیت دستی برخلاف کش سرور یا تنظیمات، از بازار بازتولید نمی‌شود
        // — قیمت ورود و تاریخ فقط همین‌جا ثبت شده‌اند. یک کلیک نباید بی‌درنگ
        // نابودش کند.
        if (!confirm(`موقعیت «${p?.title || '—'}» برای همیشه حذف شود؟ این کار بازگشت‌پذیر نیست.`)) return;
        b.disabled = true;
        positions.splice(i, 1);
        await save();
        render();
      });
    }
    for (const tr of root.querySelectorAll('#list tbody tr[data-i]')) {
      tr.addEventListener('click', () => { expanded = Number(tr.dataset.i); drawDetail(); });
      // فقط وقتی خودِ ردیف تمرکز دارد، نه وقتی Enter روی دکمه «حذف» تودرتو
      // زده می‌شود — آن دکمه رویداد کلیک خودش را دارد، keydown هم بهش بسنده
      // می‌کند و نباید تا ردیف حباب بزند و جزئیات را هم باز کند.
      tr.addEventListener('keydown', (e) => {
        if (e.target !== tr) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        expanded = Number(tr.dataset.i);
        drawDetail();
      });
    }

    const tot = evals.reduce((a, x) => a + x.m.pnlTotal, 0);
    const capitalComplete = evals.every((x) => Number.isFinite(x.m.capital));
    const cap = capitalComplete ? evals.reduce((a, x) => a + x.m.capital * x.p.qty, 0) : NaN;
    const currentMarginComplete = evals.every((x) => Number.isFinite(x.m.currentMargin));
    const currentMargin = currentMarginComplete
      ? evals.reduce((a, x) => a + x.m.currentMargin * x.p.qty, 0)
      : NaN;
    // بدون موقعیت، سود و زیان جاری دقیقاً صفر است ولی چیزی برای «در سود
    // بودن» وجود ندارد؛ بدون سرمایه درگیر، بازده روی سرمایه هم نامعلوم
    // است (fmt.pct(NaN) → «—٪»). هر دو باید بی‌رنگ بمانند، نه سبز پیش‌فرض —
    // قبلاً یک isGain مشترک (tot>=0) به هر دو کارت می‌رسید و صفر موقعیت را
    // هم «در سود» رنگ می‌کرد.
    const pnlGain = positions.length ? tot >= 0 : null;
    const roiGain = cap > 0 ? tot >= 0 : null;
    root.querySelector('#kpis').innerHTML = [
      ['موقعیت باز', fmt.int(positions.length), '', null],
      ['سرمایه روز ورود', fmt.money(cap), capitalComplete ? 'ریال' : 'مبنای ورود ناقص است', null],
      ['وجه تضمین امروز', fmt.money(currentMargin), currentMarginComplete ? 'ریال' : 'قیمت پایانی ناقص است', null],
      ['سود و زیان جاری', fmt.money(tot), pnlGain == null ? '' : pnlGain ? 'در سود' : 'در زیان', pnlGain],
      ['بازده از ورود', `${fmt.pct(cap > 0 ? (tot / cap) * 100 : NaN)}٪`, '', roiGain],
      ['قیمت‌گیری', quotesByIns.size ? `${fmt.int(quotesByIns.size)} نماد` : 'بی‌قیمت — قیمت‌گیری نشد', '', null],
    ].map(([k, v, sub, gain]) => `<div class="kpi"><div class="k">${k}</div>
      <div class="v ${kpiTone(k, gain)}">${v}</div><div class="s">${sub}</div></div>`).join('');

    if (expanded != null) drawDetail();
  }

  function drawDetail() {
    const p = positions[expanded];
    if (!p) {
      root.querySelector('#det-card').style.display = 'none';
      chart?.destroy(); chart = null; chartFor = null;
      return;
    }
    const { m, spot, fees, greeks } = evalPos(p);
    // قیمت‌گیری هر پانزده ثانیه دوباره صدا می‌زند؛ اگر همان موقعیت باز است
    // نه یک موقعیت دیگر، زوم/پن چارت باید بماند نه هر بار به نمای اول برگردد
    const sameRow = chartFor === expanded;
    if (chart) chartRange = chart.view();
    root.querySelector('#det-card').style.display = '';
    root.querySelector('#det-title').textContent = `${p.title} — ${displayName(p.uaName, p.uaIns, 'دارایی پایه بدون نام')}`;

    const gk = (value) => (Number.isFinite(value) ? fmt.small(value) : '—');
    const ivPctCell = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
    // جمله‌های جهت‌گیری از `monitorStance` می‌آیند و متن ثابتِ خودِ برنامه‌اند،
    // نه دادهٔ بالادست؛ یک بار ساخته می‌شوند نه چهار بار.
    const stance = monitorStance(greeks.greeks || {});
    const legRows = m.perLeg.map((l, i) => `
      <tr>
        <td>${l.side === 'sell' ? 'فروش' : 'خرید'} ${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت') + ' ' + fmt.money(l.strike)}</td>
        <td class="n">${fmt.money(l.entryPrice)}</td>
        <td class="n">${fmt.money(l.markPrice)}</td>
        <td class="n">${fmt.int(l.units)}</td>
        <td class="n">${fmt.money(l.feeIn + l.feeOut)}</td>
        <td class="n" style="color:${l.pnl >= 0 ? 'var(--gain)' : 'var(--loss)'}">${fmt.money(l.pnl)}</td>
        <td class="n">${ivPctCell(greeks.ivPct[i])}</td>
        ${GREEKS.map(({ key }) => `<td class="n">${gk(greeks.byLeg[i]?.[key])}</td>`).join('')}
      </tr>`).join('');

    // سطر جمع، همان سهم‌های وزن‌دار است — نه محاسبه‌ای دوم. ستون هر پا
    // وزن‌نخورده است، پس جمعِ چشمی ستون‌ها با این سطر یکی نمی‌شود و همین در
    // یادداشت زیر جدول گفته می‌شود.
    const greekTotals = `<tr class="mini-total"><td>جمع موقعیت — وزن‌دار</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td>
      <td class="n">${ivPctCell(greeks.meanIvPct)}</td>${GREEKS.map(({ key }) => `<td class="n">${gk(greeks.greeks?.[key])}</td>`).join('')}</tr>`;

    root.querySelector('#det').innerHTML = `
      <div>
        <div id="det-chart"></div>
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">تفکیک هر پا — برای یک دست قرارداد</h4>
        <table class="mini">
          <thead><tr><th>پا</th><th>قیمت ورود</th><th>قیمت بستن</th><th>سهم درگیر</th><th>کارمزد رفت و برگشت</th><th>سود و زیان</th><th>تلاطم ضمنی</th>${GREEKS.map(({ label }) => `<th>${label}</th>`).join('')}</tr></thead>
          <tbody>${legRows}${greekTotals}</tbody>
        </table>
        <p class="note" style="margin-top:10px">قیمت بستن، مظنه مخالف است: موقعیت خرید روی تقاضا بسته می‌شود و موقعیت فروش روی عرضه بازخرید می‌شود.</p>
        <p class="note">${greeks.incomplete ? 'یونانی جمعِ موقعیت ساخته نشد چون دست‌کم یک پا تلاطم ضمنی ندارد؛ عددِ ناقص با فرض صفر برای آن پا ساخته نمی‌شود.' : `همین حالا این موقعیت <b>${stance.delta}</b> است، نسبت به حرکت بزرگ <b>${stance.gamma}</b>، نسبت به تلاطم <b>${stance.vega}</b>، و <b>${stance.theta}</b>.`} یونانی ستونِ هر پا وزن‌نخورده است — همان چیزی که بلک‌شولز برای یک سهم داده؛ وزن و علامت فقط در سطر جمع اعمال می‌شود. تلاطم ضمنی از همان قیمت بستن درمی‌آید که سود و زیان از آن آمده، و پارامترهایش در تنظیمات، بخش «یونانی‌ها، تلاطم و احتمال» قابل تغییرند.</p>
      </div>
      <div>
        <dl class="kv">
          <dt>جریان نقد ورود</dt><dd>${fmt.money(m.entryNet)}</dd>
          <dt>ارزش بستن الان</dt><dd>${fmt.money(m.closeNet)}</dd>
          <dt>سود و زیان یک دست</dt><dd>${fmt.money(m.pnl)}</dd>
          <dt>سود و زیان کل</dt><dd>${fmt.money(m.pnlTotal)}</dd>
          <dt>سرمایه روز ورود</dt><dd>${fmt.money(m.capital)}</dd>
          <dt>مبنای سرمایه</dt><dd>${m.capitalLabel}</dd>
          <dt>وجه تضمین روز ورود</dt><dd>${fmt.money(m.entryMargin)}${m.entryMarginApprox ? ' (برآوردی)' : ''}</dd>
          <dt>خالص سرمایه تضمینی ورود</dt><dd>${fmt.money(m.entryMarginNet)}</dd>
          <dt>وجه تضمین لازم امروز</dt><dd>${fmt.money(m.currentMargin)}</dd>
          <dt>تضمین شرطی امروز</dt><dd>${fmt.money(m.currentConditionalMargin)}</dd>
          <dt>روز نگه‌داری</dt><dd>${m.daysHeld == null ? '—' : fmt.int(m.daysHeld)}</dd>
          <dt>بازده از ورود</dt><dd>${fmt.pct(m.retPct)}٪</dd>
          <dt>بازده ماهانه</dt><dd>${fmt.pct(m.retMonthPct)}٪</dd>
        </dl>
        ${!m.entryRiskAvailable ? `
          <div class="note" id="entry-risk-fix" style="margin-top:12px">
            <p>${m.entryRiskReason}. برای محاسبه بازده، داده تاریخی واقعی را ثبت کن.</p>
            <label for="entry-risk-spot">قیمت پایانی پایه در ورود</label>
            <input type="number" id="entry-risk-spot" value="${Number(p.entrySpot) > 0 ? Number(p.entrySpot) : ''}">
            ${p.legs.map((l, i) => l.side === 'sell' && l.kind !== 'underlying' ? `
              <label for="entry-risk-close-${i}">قیمت پایانی ${l.kind === 'call' ? 'کال' : 'پوت'} ${fmt.money(l.strike)} در ورود</label>
              <input type="number" id="entry-risk-close-${i}" data-entry-close="${i}" value="${Number(l.entryClose) > 0 ? Number(l.entryClose) : ''}">` : '').join('')}
            <button class="btn" id="entry-risk-save" style="margin-top:8px">ثبت مبنای ورود</button>
          </div>` : `
          <p class="note" style="margin-top:10px">بازده = سود و زیان جاری ÷ سرمایه ثابت روز ورود. وجه تضمین امروز فقط برای نیاز نقدینگی نمایش داده می‌شود و مخرج بازده را تغییر نمی‌دهد.</p>`}
        <h4 style="margin:14px 0 4px;font-size:var(--fs-xs)">اگر تا سررسید نگه داری</h4>
        <dl class="kv">
          <dt>در قیمت فعلی پایه</dt><dd>${fmt.money(m.ifHeld.atSpot)}</dd>
          <dt>بیشترین سود</dt><dd>${fmt.money(m.ifHeld.maxProfit)}</dd>
          <dt>بیشترین زیان</dt><dd>${fmt.money(m.ifHeld.maxLoss)}</dd>
          <dt>سربه‌سری</dt><dd>${m.ifHeld.breakevens.map((b) => fmt.money(b)).join(' , ') || '—'}</dd>
        </dl>
        <p class="note" style="margin-top:10px">برای تصمیم رول همین موقعیت، به تب تحلیل رول برو.</p>
      </div>`;

    chart?.destroy();
    chart = mountPayoff(root.querySelector('#det-chart'), p.legs, m.entryNet, {
      fees, spot, width: 720, height: 250,
      ...(sameRow && chartRange ? { initRange: chartRange } : {}),
    });
    chartFor = expanded;

    const riskSave = root.querySelector('#entry-risk-save');
    if (riskSave) riskSave.addEventListener('click', async () => {
      const entrySpot = Number(root.querySelector('#entry-risk-spot')?.value);
      if (!(entrySpot > 0)) { flash('قیمت پایانی پایه در روز ورود را وارد کن.', true); return; }
      p.entrySpot = entrySpot;
      for (const input of root.querySelectorAll('[data-entry-close]')) {
        const close = Number(input.value);
        if (!(close > 0)) { flash('همه قیمت‌های پایانی اختیار در ورود لازم‌اند.', true); return; }
        p.legs[Number(input.dataset.entryClose)].entryClose = close;
      }
      const snapshot = captureEntryRisk(p, riskOptions());
      if (!snapshot.available) { flash(snapshot.reason, true); return; }
      p.entryRisk = snapshot;
      await save();
      flash('مبنای ثابت روز ورود ثبت شد.');
      render();
    });
  }

  // ——————————————— داده ———————————————
  async function load() {
    try { positions = await (await fetch('/api/positions')).json(); }
    catch { positions = []; }
    // رکوردهای قدیمیِ قابل بازسازی (مثلاً کاوردکال که قیمت خرید سهم را
    // دارد) یک بار به عکس فوری نسخه جدید مهاجرت می‌شوند. فروش لختِ فاقد
    // قیمت پایه ورود عمداً خودکار با قیمت امروز پر نمی‌شود.
    let migrated = false;
    for (const p of positions) {
      if (p.entryRisk?.version === 1 && Number.isFinite(p.entryRisk.capital)) continue;
      const snapshot = captureEntryRisk(p, riskOptions());
      if (!snapshot.available) continue;
      if (!(Number(p.entrySpot) > 0) && snapshot.entrySpot > 0) p.entrySpot = snapshot.entrySpot;
      p.entryRisk = snapshot;
      migrated = true;
    }
    if (migrated) await save({ quiet: true });
    render();
  }

  async function priceAll() {
    const codes = new Set();
    for (const p of positions) {
      if (p.uaIns) codes.add(p.uaIns);
      for (const l of p.legs) if (l.ins) codes.add(l.ins);
    }
    if (!codes.size) return;
    try {
      const q = [...codes].join(',');
      const [books, infos] = await Promise.all([
        fetch(`/api/books?ins=${q}`).then((r) => r.json()),
        fetch(`/api/infos?ins=${q}`).then((r) => r.json()),
      ]);
      quotesByIns = new Map();
      for (const ins of codes) {
        const b = books[ins]?.book || [];
        const i2 = infos[ins] || {};
        quotesByIns.set(ins, {
          bid: b[0]?.bid || 0, bidQty: b[0]?.bidQty || 0,
          ask: b[0]?.ask || 0, askQty: b[0]?.askQty || 0,
          last: i2.last || 0, close: i2.close || 0, low: i2.low || 0, high: i2.high || 0,
          state: i2.state, staleSec: i2.staleSec, book: b,
        });
      }
      render();
    } catch { /* نوار بالا خبر می‌دهد */ }
  }

  const offFeed = api.onFeed((f) => { feed = f; refreshUaOptions(); });
  const offChain = onChain((cs) => { uaList = cs.list; refreshUaOptions(); });
  if (chainState.list.length) { uaList = chainState.list; refreshUaOptions(); }
  const offWatch = api.subscribeWatch((w) => pushRows(w, !w.changed));

  await load();
  await priceAll();
  const timer = setInterval(priceAll, 15000);
  return () => { offChain(); offWatch(); offFeed(); clearInterval(timer); clearTimeout(flashTimer); chart?.destroy(); };
}
