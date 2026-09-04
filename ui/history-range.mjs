// بازهٔ تحلیل — یک کنترل، همه‌جا یکسان.
//
// چرا مشترک است: پنج تبِ تاریخ‌دار هرکدام فهرست قراردادها را یک بار و
// **بی‌تاریخ** می‌گرفتند و بعد کاربر بازه انتخاب می‌کرد. یعنی هر تحلیلِ
// گذشته روی بازمانده‌های امروز اجرا می‌شد و قراردادی که داخل همان بازه
// سررسید شده بود — مرتبط‌ترینشان — اصلاً در فهرست نبود.
//
// اگر این کنترل در هر تب جدا نوشته می‌شد، پنج نسخه از یک قاعدهٔ مالی
// می‌داشتیم و روزی یکی‌شان عقب می‌ماند. پس یک ماژول، و تب‌ها فقط
// می‌گویند «بازه‌ات را بده».
//
// ═══ چرا ساختِ دفتر اینجا دیده می‌شود ═══
//
// نخستین نسخه، ساختِ دفتر را به دستور ترمینال سپرده بود و کاربر اجرایش
// نکرد؛ برایش «کار نمی‌کرد». حالا سرور خودش می‌سازد، ولی ساختن زمان
// می‌برد و سکوت در آن مدت یعنی همان «کار نمی‌کند». پس پیشرفت همین‌جا،
// کنار همان بازه‌ای که خواسته شده، نوشته می‌شود.

import { mountDateWheel } from './datewheel.mjs';
import {
  DEFAULT_PRESET, RANGE_PRESETS, buildLine, calendarDays, daysBefore, presetRange, rangeLabel, todayCompact,
} from '../core/history-range.mjs';

export {
  DEFAULT_PRESET, RANGE_PRESETS, buildLine, calendarDays, presetRange, rangeLabel, todayCompact,
} from '../core/history-range.mjs';

/**
 * گرفتن فهرست قراردادهای یک بازه از سرور.
 *
 * `build` در پاسخ می‌گوید سرور هنوز دارد روزهای نبوده را می‌گیرد. تابع
 * منتظرش **نمی‌ماند** — فهرستِ همین حالا برمی‌گردد و صداکنندهٔ بعدی
 * دوباره می‌پرسد. انتظارِ چنددقیقه‌ای پشت یک درخواست، همان «کار نمی‌کند»
 * است با ظاهرِ دیگر.
 */
export async function fetchRangeUniverse({ from, to }) {
  const response = await fetch(`/api/history/universe?from=${from}&to=${to}`);
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || 'فهرست بازه دریافت نشد');
  return payload;
}

/**
 * کنترل بازه، سوارشده روی یک میزبان.
 *
 * `onApply({from,to})` هر بار که بازه عوض شد صدا می‌شود — و یک بار هم در
 * پایان سوار شدن، تا تب لازم نباشد خودش مقدار اولیه را بسازد.
 */
export function mountHistoryRange(host, { onApply = () => {}, preset = DEFAULT_PRESET, back = 900, initialRange = null } = {}) {
  const today = todayCompact();
  let range = initialRange ? { ...initialRange } : presetRange(preset, today);
  if (initialRange) preset = 'custom';
  const days = calendarDays(Math.min(daysBefore(today, back), range.from), Math.max(today, range.to));

  host.classList.add('hrange');
  host.innerHTML = `
    <div class="hrange-row">
      <label class="hrange-pick">بازهٔ تحلیل
        <select class="hrange-preset">${RANGE_PRESETS
          .map((row) => `<option value="${row.id}"${row.id === preset ? ' selected' : ''}>${row.label}</option>`).join('')}</select>
      </label>
      <b class="hrange-span"></b>
      <button type="button" class="ghost hrange-edit" aria-expanded="false">تغییر تاریخ</button>
    </div>
    <div class="hrange-cals" hidden>
      <div class="hrange-cal"><span class="field-label">از تاریخ</span><div class="hrange-from"></div></div>
      <div class="hrange-cal"><span class="field-label">تا تاریخ</span><div class="hrange-to"></div></div>
    </div>
    <p class="hrange-note"></p>
    <p class="hrange-build" hidden></p>`;

  const $ = (sel) => host.querySelector(sel);
  const spanEl = $('.hrange-span');
  let fromWheel = null, toWheel = null, quiet = false;

  const paintSpan = () => { spanEl.textContent = rangeLabel(range); };

  const apply = () => { paintSpan(); onApply({ ...range }); };

  fromWheel = mountDateWheel($('.hrange-from'), days, range.from, (value) => {
    range.from = value;
    if (range.to < value) toWheel.select(value, false);
    range.to = Number($('.hrange-to').dataset.value) || range.to;
    if (quiet) return;
    $('.hrange-preset').value = 'custom';
    apply();
  });
  toWheel = mountDateWheel($('.hrange-to'), days, range.to, (value) => {
    range.to = value;
    if (range.from > value) fromWheel.select(value, false);
    range.from = Number($('.hrange-from').dataset.value) || range.from;
    if (quiet) return;
    $('.hrange-preset').value = 'custom';
    apply();
  });

  $('.hrange-preset').addEventListener('change', (event) => {
    const id = event.target.value;
    if (id === 'custom') { $('.hrange-cals').hidden = false; $('.hrange-edit').setAttribute('aria-expanded', 'true'); return; }
    range = presetRange(id, today);
    quiet = true;
    fromWheel.select(range.from, false);
    toWheel.select(range.to, false);
    quiet = false;
    apply();
  });

  $('.hrange-edit').addEventListener('click', () => {
    const open = $('.hrange-cals').hidden;
    $('.hrange-cals').hidden = !open;
    $('.hrange-edit').setAttribute('aria-expanded', String(open));
  });

  paintSpan();

  return {
    get range() { return { ...range }; },
    note(text, isError = false) {
      $('.hrange-note').textContent = text || '';
      $('.hrange-note').toggleAttribute('data-error', Boolean(isError));
    },
    build(status) {
      const line = buildLine(status);
      $('.hrange-build').hidden = !line;
      $('.hrange-build').textContent = line;
      return Boolean(status?.running);
    },
    apply,
  };
}

/**
 * گرفتن بازه — **بی‌انتظار**، و بعد تازه‌شدن در پس‌زمینه.
 *
 * نسخهٔ اول تا پایان ساختِ دفتر منتظر می‌ماند و رابط روی «در حال
 * دریافت…» می‌خشکید. برای کاربر این دقیقاً همان «کار نمی‌کند» است، فقط
 * با ظاهر دیگر — و بدتر، چون داده‌ای که همان لحظه در دست بود هم نشان
 * داده نمی‌شد.
 *
 * پس اولین پاسخ **بلافاصله** برمی‌گردد و کار با همان پیش می‌رود. اگر
 * سرور هنوز روز کم دارد، هر چند ثانیه دوباره پرسیده می‌شود و
 * `onUpdate` با فهرست کامل‌تر صدا می‌خورد.
 *
 * `stop()` را صداکننده هنگام بستن تب می‌زند، وگرنه حلقه روی تبِ بسته
 * ادامه می‌داد و هر بار `chain` تبِ رفته را می‌ساخت.
 */
export function loadRange({ from, to }, ui, { onUpdate = () => {}, tries = 60, waitMs = 4000 } = {}) {
  let stopped = false;
  const first = (async () => {
    const payload = await fetchRangeUniverse({ from, to });
    ui?.note(payload.note || '');
    const running = ui?.build(payload.build) ?? Boolean(payload.build?.running);

    if (running && !stopped) {
      (async () => {
        for (let n = 0; n < tries && !stopped; n += 1) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          if (stopped) return;
          let next;
          try { next = await fetchRangeUniverse({ from, to }); }
          catch { continue; }
          if (stopped) return;
          ui?.note(next.note || '');
          const still = ui?.build(next.build) ?? Boolean(next.build?.running);
          // فقط وقتی فهرست واقعاً بزرگ‌تر شده، تب دوباره چیده می‌شود.
          // بازچینشِ بی‌تغییر، انتخاب کاربر را بی‌دلیل تکان می‌دهد.
          if ((next.count || 0) > (payload.count || 0)) onUpdate(next);
          if (!still) return;
        }
      })();
    }
    return payload;
  })();

  return { first, stop() { stopped = true; } };
}

/**
 * نمادِ پایه، پس از بازه — یک قاعده، در همهٔ تب‌های تاریخ‌دار.
 *
 * ═══ چرا این هست ═══
 *
 * فهرست نماد پایه از همان بازه ساخته می‌شود: `loadRange` می‌پرسد در این
 * بازه چه قراردادی وجود داشته و نمادهای پایهٔ همان‌ها را می‌دهد. پس با
 * عوض‌شدن تاریخ، فهرست نماد از نو ساخته می‌شود و انتخابِ قبلی می‌تواند
 * اصلاً در فهرست تازه نباشد.
 *
 * تا امروز این وابستگی در **کد** بود ولی در **صفحه** نبود: «نماد پایه»
 * بالای کنترل بازه می‌نشست، پس چشم اول آن را می‌دید و کاربر اولش نماد
 * انتخاب می‌کرد. بعد تاریخ را عوض می‌کرد و نمادش زیر دستش عوض می‌شد —
 * دقیقاً همان چیزی که گزارش شد.
 *
 * حالا بازه اول است و کشویی نماد تا آمدنِ فهرستِ همان بازه **غیرفعال**
 * می‌ماند. غیرفعال، نه خالی: کشویی خالیِ فعال شبیه «نمادی وجود ندارد»
 * است، ولی غیرفعالِ با متن، خودش می‌گوید منتظرِ چیست.
 *
 * @param select کشویی نماد پایه
 * @returns سه تابع برای سه حالتِ همان کشویی
 */
export function baseAfterRange(select) {
  const put = (text) => { select.innerHTML = `<option value="">${text}</option>`; };
  return {
    /** بازه عوض شد و فهرستش هنوز نرسیده. */
    loading() { select.disabled = true; put('در حال دریافت نمادهای این بازه…'); },
    /** فهرست نرسید. کشویی باز نمی‌شود چون چیزی برای انتخاب نیست. */
    failed() { select.disabled = true; put('دریافت ناموفق — بازه را دوباره بزن'); },
    /** فهرست رسید. صفر نماد یعنی این بازه واقعاً خالی است، نه اینکه منتظریم. */
    ready(count) {
      select.disabled = !(count > 0);
      if (!(count > 0)) put('در این بازه نماد پایه‌ای نبود');
    },
  };
}
