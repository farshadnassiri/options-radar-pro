// تب دفتر قراردادها — کدام قرارداد در کدام تاریخ زنده بود.
//
// چرا تب مستقل: وضعیت انقضا یک ویژگیِ قرارداد نیست، یک **رابطه** بین
// قرارداد و تاریخ است. همان اختیارِ اهرم در ۱۵ خرداد فعال است و در ۲۰
// خرداد منقضی. هیچ ستونی در هیچ جدولی نمی‌تواند این را با یک برچسبِ ثابت
// بگوید، پس جایی لازم بود که تاریخ خودش ورودی باشد.
//
// و چرا مهم است: تا پیش از این، هر تحلیلِ گذشته فقط قراردادهای زندهٔ
// **امروز** را می‌دید. قراردادی که داخل بازهٔ بررسی سررسید شده بود —
// یعنی مرتبط‌ترینشان — اصلاً وجود نداشت. این تب همان‌ها را نشان می‌دهد و
// می‌شمارد.

import { faDigits, ltr } from '/ui/fmt.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { expiryLabel, statusLabel } from '/core/option-roster.mjs';

const SIDE_FA = { call: 'کال', put: 'پوت', tabaee: 'تبعی' };
const STATUS_TONE = { active: 'gain', expired: 'flat', pending: 'warn' };

/** تاریخ فشرده → «۱۴۰۴/۰۳/۱۱». همان تقویمی که بقیهٔ برنامه می‌گوید. */
const jalali = (compact) => {
  const s = String(compact);
  return /^\d{8}$/.test(s) ? faDigits(expiryLabel(Number(s))) : '—';
};

/**
 * همان تاریخ با میلادیِ کنارش — فقط در کارت‌های پوشش.
 *
 * میلادی آنجا لازم است چون همان عددی است که در دستور اسکن تایپ می‌شود.
 * `ltr` هم تزیین نیست: دو دنبالهٔ رقمی کنار هم داخل بندِ راست‌به‌چپ،
 * جایشان با هم عوض می‌شود و «۱۴۰۵/۰۶/۰۷ · ۲۰۲۶-۰۸-۲۹» وارونه دیده
 * می‌شد — یعنی تاریخ میلادی جای جلالی می‌نشست.
 */
const bothCalendars = (compact) => {
  const s = String(compact);
  if (!/^\d{8}$/.test(s)) return '—';
  return `${faDigits(expiryLabel(Number(s)))} · ${ltr(faDigits(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`))}`;
};

const kpi = (k, v, s = '', tone = '') =>
  `<article class="kpi"><div class="k">${k}</div><div class="v ${tone}">${faDigits(v)}</div>${s ? `<div class="s">${s}</div>` : ''}</article>`;

export async function mount(root, { tab }) {
  root.innerHTML = `
    <div class="page-head">
      <h2>${tab.title}</h2>
      <p>سررسید یک رویدادِ ثابت نیست؛ مرزی است که روی زمان حرکت می‌کند. اینجا می‌بینید در هر تاریخ یا بازه، کدام قرارداد زنده بوده و کدام سررسید شده — از جمله آن‌هایی که امروز دیگر در تابلو نیستند.</p>
    </div>

    <section class="card" id="or-cover">
      <h3>پوشش دفتر</h3>
      <p class="note" id="or-note">در حال خواندن…</p>
      <div class="kpis" id="or-cover-kpis"></div>
      <div id="or-howto"></div>
    </section>

    <section class="card">
      <div class="section-head"><h3>پرسش از دفتر</h3><span>یک روز، یا یک بازه</span></div>
      <div class="grid">
        <div class="field">
          <label for="or-mode">حالت</label>
          <select id="or-mode">
            <option value="range">بازه — چه کسی در این بازه زنده بود</option>
            <option value="day">یک روز — فهرست همان روز</option>
          </select>
        </div>
        <div class="field">
          <label for="or-base">نماد پایه</label>
          <select id="or-base"><option value="">همه</option></select>
        </div>
        <div class="field">
          <label for="or-status">وضعیت</label>
          <select id="or-status">
            <option value="">همه</option>
            <option value="active">فعال تا پایان بازه</option>
            <option value="expired">داخل بازه سررسید شد</option>
          </select>
        </div>
        <div class="field">
          <label for="or-side">سمت</label>
          <select id="or-side">
            <option value="">همه</option>
            <option value="call">کال</option>
            <option value="put">پوت</option>
            <option value="tabaee">تبعی</option>
          </select>
        </div>
      </div>
      <div class="or-when">
        <div class="or-cal"><span class="field-label" id="or-from-lab">از تاریخ</span><div id="or-from-cal"></div></div>
        <div class="or-cal" id="or-to-wrap"><span class="field-label">تا تاریخ</span><div id="or-to-cal"></div></div>
      </div>
      <p class="note" id="or-range-note" style="margin-top:14px"></p>
      <div class="kpis" id="or-kpis"></div>
    </section>

    <section class="card">
      <div class="section-head"><h3>قراردادها</h3><span id="or-count">—</span></div>
      <div id="or-table"><p class="empty-note">بازه‌ای انتخاب کنید.</p></div>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  let bases = [], coverage = null, fromWheel = null, toWheel = null;
  const valueOf = (id) => Number($(id).dataset.value) || 0;

  /** همهٔ روزهای پوشش — دامنهٔ انتخابِ تقویم. */
  function coverageDays(from, to) {
    const out = [];
    const parse = (v) => new Date(Date.UTC(+String(v).slice(0, 4), +String(v).slice(4, 6) - 1, +String(v).slice(6, 8)));
    for (let d = parse(from), end = parse(to); d <= end; d = new Date(d.getTime() + 86400000)) {
      out.push(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
    }
    return out;
  }

  async function loadCoverage() {
    let payload;
    try {
      payload = await (await fetch('/api/history/roster')).json();
    } catch (e) {
      $('or-note').textContent = `دفتر خوانده نشد: ${e.message}`;
      return null;
    }
    coverage = payload.coverage;
    $('or-note').textContent = payload.note || '';

    const intake = payload.scanned?.intake || null;
    $('or-cover-kpis').innerHTML = [
      kpi('قرارداد در دفتر', coverage.count.toLocaleString('fa-IR')),
      kpi('نماد پایه', coverage.bases),
      kpi('از تاریخ', coverage.from ? bothCalendars(coverage.from) : '—'),
      kpi('تا تاریخ', coverage.to ? bothCalendars(coverage.to) : '—'),
      // شمارِ کنارگذاشته‌ها عمداً کنارِ شمارِ پذیرفته‌ها می‌نشیند. فهرستی
      // که فقط بگوید «چند تا آمد» ممکن است هزار تا را بی‌صدا انداخته باشد؛
      // خواستهٔ صریح این بود که چیزی از گذشته جا نماند، و تنها سنجهٔ
      // صادقانه‌اش همین عدد است.
      intake ? kpi('نامِ ناخوانا', intake.unparsed,
        intake.unparsed ? 'هیچ عددی برایشان حدس زده نشد' : 'همه خوانده شدند',
        intake.unparsed ? 'loss' : 'gain') : '',
      intake ? kpi('غیر-اختیار، کنار گذاشته', intake.notOption, 'صندوق و اوراق، نه قرارداد') : '',
    ].join('');

    if (!payload.ready) {
      $('or-howto').innerHTML = `<p class="note">دفتر هنوز ساخته نشده. یکی از این دو را در پوشهٔ برنامه اجرا کنید:</p>
        <pre class="code-block" dir="ltr">node tools/roster-scan.mjs --from 20240901 --to 20260829
node tools/roster-import.mjs &lt;فایل.xlsx&gt; --sheet AllHistoricalOptions</pre>`;
    } else {
      $('or-howto').innerHTML = '';
    }

    bases = payload.bases || [];
    $('or-base').innerHTML = '<option value="">همه</option>'
      + bases.map((b) => `<option value="${b}">${b}</option>`).join('');

    if (coverage.from && coverage.to) {
      // تقویم جلالی، نه `input[type=date]`: بقیهٔ برنامه تاریخ را جلالی
      // می‌گوید و قرارداد هم سررسیدِ جلالی دارد. ورودیِ بومیِ مرورگر،
      // میلادی و به قالبِ زبانِ مرورگر است — «۰۶/۲۴/۲۰۲۶» برای کاربری که
      // «۱۴۰۵/۰۴/۰۳» می‌خواهد، خواندنی نیست.
      const days = coverageDays(coverage.from, coverage.to);
      // پیش‌فرض، یک ماه آخرِ پوشش: بازهٔ دو ساله چند هزار ردیف است و
      // نخستین نمای کاربر نباید انتظار باشد.
      const startAt = days[Math.max(0, days.length - 31)];
      fromWheel = mountDateWheel($('or-from-cal'), days, startAt, (value) => {
        if (value > valueOf('or-to-cal')) toWheel.select(value, false);
        query();
      }, { empty: 'دفتر هنوز روزی ندارد.' });
      toWheel = mountDateWheel($('or-to-cal'), days, coverage.to, (value) => {
        if (value < valueOf('or-from-cal')) fromWheel.select(value, false);
        query();
      }, { empty: 'دفتر هنوز روزی ندارد.' });
    }
    return payload;
  }

  async function query() {
    const mode = $('or-mode').value;
    const from = String(valueOf('or-from-cal') || '');
    const to = String(valueOf('or-to-cal') || '');
    if (!from || (mode === 'range' && !to)) {
      $('or-table').innerHTML = '<p class="empty-note">تاریخ را کامل کنید.</p>';
      return;
    }
    const params = new URLSearchParams({ rows: '1' });
    if (mode === 'range') { params.set('from', from); params.set('to', to); }
    else params.set('at', from);
    if ($('or-base').value) params.set('base', $('or-base').value);

    let payload;
    try {
      payload = await (await fetch(`/api/history/roster?${params}`)).json();
    } catch (e) {
      $('or-table').innerHTML = `<p class="empty-note">${e.message}</p>`;
      return;
    }
    if (payload.error) {
      $('or-table').innerHTML = `<p class="empty-note">${payload.error}</p>`;
      return;
    }

    $('or-range-note').textContent = payload.note || '';
    const s = payload.summary;
    $('or-kpis').innerHTML = s
      ? [
        kpi('زنده در این بازه', s.total.toLocaleString('fa-IR')),
        // این عدد، قلبِ کل ماجراست: این‌ها را فهرست امروز ندارد.
        kpi('داخل بازه سررسید شد', s.expiredInside.toLocaleString('fa-IR'),
          'فهرست امروز این‌ها را ندارد', 'loss'),
        kpi('تا پایان بازه فعال', s.activeAtEnd.toLocaleString('fa-IR'), '', 'gain'),
        kpi('داخل بازه گشایش شد', s.listedInside.toLocaleString('fa-IR')),
        kpi('نماد پایه', s.bases),
      ].join('')
      : kpi('قرارداد زنده در این روز', payload.matched.toLocaleString('fa-IR'));

    // ── پالایش سمتِ مرورگر ────────────────────────────────────────────
    const wantStatus = $('or-status').value, wantSide = $('or-side').value;
    let rows = payload.rows || [];
    if (wantSide) rows = rows.filter((r) => r.side === wantSide);
    if (wantStatus === 'expired') rows = rows.filter((r) => r.expiresInside || r.statusAt === 'expired');
    if (wantStatus === 'active') rows = rows.filter((r) => (r.statusAtEnd ?? r.statusAt) === 'active');

    $('or-count').textContent = payload.truncated
      ? faDigits(`${rows.length} از ${payload.matched} — فهرست بریده شده`)
      : faDigits(`${rows.length} ردیف`);

    if (!rows.length) {
      $('or-table').innerHTML = '<p class="empty-note">هیچ قراردادی با این پالایه نبود.</p>';
      return;
    }

    const isRange = Boolean(s);
    $('or-table').innerHTML = `<div class="history-table-wrap"><table class="data">
      <thead><tr>
        <th>نماد</th><th>وضعیت</th><th>پایه</th><th>سمت</th>
        <th class="n">قیمت اعمال</th><th>سررسید</th>
        <th>${isRange ? 'زنده از' : 'اولین دید'}</th><th>${isRange ? 'زنده تا' : 'سررسید'}</th>
        <th>نام قرارداد</th>
      </tr></thead>
      <tbody>${rows.map((r) => {
        const status = isRange ? r.statusAtEnd : r.statusAt;
        const tone = STATUS_TONE[status] || 'flat';
        // وضعیت ستون دوم است، نه آخر: جدول از پهنای صفحه بیشتر است و
        // ستون آخر پشت اسکرولِ افقی می‌ماند. مهم‌ترین ستونِ این جدول
        // نباید همانی باشد که کاربر باید دنبالش بگردد.
        return `<tr>
          <td>${r.symbol || '—'}</td>
          <td><span class="tag ${tone}">${statusLabel(status)}</span>${
            isRange && r.expiresInside ? ' <span class="tag warn">داخل بازه</span>' : ''
          }</td>
          <td>${r.base || '—'}</td>
          <td>${SIDE_FA[r.side] || '—'}</td>
          <td class="n">${faDigits(Number(r.strike).toLocaleString('fa-IR'))}</td>
          <td>${jalali(r.expiry)}</td>
          <td>${jalali(isRange ? r.activeFrom : r.first)}</td>
          <td>${jalali(isRange ? r.activeTo : r.expiry)}</td>
          <td>${r.name || '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  const onMode = () => {
    const range = $('or-mode').value === 'range';
    $('or-to-wrap').hidden = !range;
    $('or-status').disabled = !range;
    $('or-from-lab').textContent = range ? 'از تاریخ' : 'تاریخ';
    query();
  };

  $('or-mode').addEventListener('change', onMode);
  for (const id of ['or-base', 'or-status', 'or-side']) {
    $(id).addEventListener('change', query);
  }

  const ready = await loadCoverage();
  if (ready?.ready) await query();
  else $('or-table').innerHTML = '<p class="empty-note">دفتر هنوز ساخته نشده.</p>';
}
