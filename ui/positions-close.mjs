// برگهٔ بستن موقعیت.
//
// ═══ چرا قیمتِ خروج پیش‌پر می‌شود ولی خودکار ثبت نمی‌شود ═══
//
// قیمتِ پیشنهادی همان «قیمت بستن» است که جدولِ جزئیات نشان می‌دهد: مظنهٔ
// مخالفِ هر پا. برای **برآورد** درست است و برای **ثبت** نه — چون سفارشی که
// واقعاً پر شده می‌تواند چند پله پایین‌تر خورده باشد، به‌ویژه در پایی که
// عمقِ دفترش کم است. سودِ تحقق‌یافته تا ابد در دفتر می‌ماند و رفرشِ بعدی
// اصلاحش نمی‌کند، پس عددش باید از دستِ کاربر بیاید.
//
// تاریخِ خروج هم پیش‌فرضِ «امروز» می‌گیرد ولی قابل تغییر است: کاربری که
// موقعیتش را هفتهٔ پیش بسته و حالا ثبتش می‌کند، نباید مجبور شود روزِ غلط را
// بپذیرد — روزِ نگه‌داری و بازدهِ ماهانه از همان درمی‌آیند.

import { fmt } from './table.mjs';
import { faDigits } from './fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

export const legLabelOf = (leg) => `${leg.side === 'sell' ? 'بستن فروش' : 'بستن خرید'} `
  + (leg.kind === 'underlying' ? 'سهم' : `${leg.kind === 'call' ? 'کال' : 'پوت'} ${fmt.money(leg.strike)}`);

/**
 * برگهٔ بستن.
 *
 * `suggested` هم‌طولِ پاهاست و از همان ارزش‌گذاری لحظه‌ای می‌آید که صفحه
 * نشان می‌دهد. پای بی‌مظنه خانهٔ خالی می‌گیرد، نه صفر — و بی آن ثبت انجام
 * نمی‌شود.
 */
export function closeFormHtml(pos, { today = '', suggested = [] } = {}) {
  if (!pos) return '';
  const rows = (pos.legs || []).map((leg, at) => `
    <tr>
      <td>${esc(legLabelOf(leg))}</td>
      <td class="n">${fmt.money(leg.price)}</td>
      <td class="n">${Number(suggested[at]) > 0 ? fmt.money(suggested[at]) : '—'}</td>
      <td class="n"><input type="number" step="any" min="0" id="cl-price-${at}" data-close-price="${at}"
        value="${Number(suggested[at]) > 0 ? Math.round(Number(suggested[at])) : ''}" style="width:8rem"></td>
    </tr>`).join('');
  return `
    <div class="bar" style="flex-wrap:wrap;gap:12px">
      <div class="field"><label for="cl-date">تاریخ خروج (شمسی)</label>
        <input id="cl-date" type="text" inputmode="numeric" value="${esc(today)}"></div>
      <div class="field" style="flex:1 1 16rem"><label for="cl-note">یادداشت خروج</label>
        <input id="cl-note" type="text" placeholder="چرا بستی؟ — اختیاری"></div>
    </div>
    <table class="mini" style="margin-top:10px">
      <thead><tr><th>پا</th><th>قیمت ورود</th><th>قیمت بستن در بازار</th><th>قیمت خروج واقعی تو</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">ستون «قیمت بستن در بازار» مظنهٔ مخالفِ همین لحظه است و فقط برآورد است. آنچه ثبت می‌شود ستون آخر است — قیمتی که سفارشت واقعاً با آن پر شده. سود تحقق‌یافته پس از ثبت دیگر با بازار تکان نمی‌خورد.</p>`;
}

/** خواندن برگه؛ سنجشش کار `validateExit` در موتور است، نه اینجا. */
export function readClose(scope, pos) {
  if (!scope || !pos) return { date: '', prices: [], note: '' };
  return {
    date: String(scope.querySelector('#cl-date')?.value || '').trim(),
    note: String(scope.querySelector('#cl-note')?.value || '').trim(),
    prices: (pos.legs || []).map((leg, at) => Number(scope.querySelector(`[data-close-price="${at}"]`)?.value)),
  };
}

/** جملهٔ خلاصهٔ یک موقعیتِ بسته‌شده — برای ردیف جدول. */
export function closedRowNote(realized) {
  if (!realized?.available) return realized?.reason || '—';
  const days = Number.isFinite(realized.daysHeld) ? `${faDigits(realized.daysHeld)} روز` : 'روز نامعلوم';
  return `${days} نگه داشته شد`;
}
