// ویرایش یک موقعیت ثبت‌شده.
//
// ═══ چرا لازم شد ═══
//
// تا امروز موقعیت فقط دو حالت داشت: افزودن، و حذفِ برگشت‌ناپذیر. کاربری که
// تعداد را اشتباه زده بود یا قیمتِ پرشدنِ واقعی‌اش با پیش‌فرضِ فرم فرق
// داشت، باید کل موقعیت را حذف و از نو می‌ساخت — و با آن، تاریخ ورود و مبنای
// ثابتِ روز ورود هم از نو ساخته می‌شد. یعنی یک اشتباهِ تایپی، مخرجِ بازده
// را عوض می‌کرد.
//
// ═══ چه چیزی قابل ویرایش است و چه چیزی نیست ═══
//
// عنوان، تعداد، تاریخ ورود، قیمت پایانی پایه در ورود، و قیمتِ ورود و
// پایانیِ **هر پا**. اینها همان چیزهایی‌اند که کاربر خودش ثبت کرده و فقط
// خودش می‌داند درست‌اند یا نه.
//
// ساختارِ ترکیب — نوع، سمت، قیمت اعمال، اندازه و شناسهٔ هر پا — قابل
// ویرایش **نیست**. عوض کردنشان یعنی موقعیتِ دیگری؛ و اگر زیر همان شناسه و
// همان تاریخ ورود بنشیند، هر عددِ تاریخیِ ثبت‌شدهٔ قبلی به موقعیتی نسبت
// داده می‌شود که وجود نداشته. برای ترکیبِ دیگر، موقعیتِ دیگر.

import { fmt } from './table.mjs';
import { parseJalali } from '../core/jalali.mjs';

export const EDIT_REASONS = {
  noPosition: 'موقعیتی برای ویرایش انتخاب نشده',
  badDate: 'تاریخ ورود شمسی معتبر نیست',
  badQty: 'تعداد قرارداد باید دست‌کم یک باشد',
  badSpot: 'قیمت پایانی پایه در روز ورود لازم است',
  badPrice: 'قیمت ورود هر پا باید بزرگ‌تر از صفر باشد',
  badClose: 'قیمت پایانی هر پای فروش در روز ورود لازم است',
};

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const legLabel = (leg) => `${leg.side === 'sell' ? 'فروش' : 'خرید'} `
  + (leg.kind === 'underlying' ? 'سهم' : `${leg.kind === 'call' ? 'کال' : 'پوت'} ${fmt.money(leg.strike)}`);

/** آیا این پا قیمت پایانیِ روز ورود می‌خواهد؟ فقط پای فروشِ اختیار. */
export const needsEntryClose = (leg) => leg?.side === 'sell' && leg?.kind !== 'underlying';

export function editFormHtml(pos) {
  if (!pos) return '';
  const rows = (pos.legs || []).map((leg, at) => `
    <tr>
      <td>${esc(legLabel(leg))}</td>
      <td class="n"><input type="number" step="any" min="0" id="ed-price-${at}" data-edit-price="${at}"
        value="${Number(leg.price) || ''}" style="width:8rem"></td>
      <td class="n">${needsEntryClose(leg)
        ? `<input type="number" step="any" min="0" id="ed-close-${at}" data-edit-close="${at}"
            value="${Number(leg.entryClose) || ''}" style="width:8rem">`
        : '—'}</td>
    </tr>`).join('');
  return `
    <div class="bar" style="flex-wrap:wrap;gap:12px">
      <div class="field"><label for="ed-title">عنوان</label>
        <input id="ed-title" type="text" value="${esc(pos.title || '')}"></div>
      <div class="field"><label for="ed-date">تاریخ ورود (شمسی)</label>
        <input id="ed-date" type="text" inputmode="numeric" value="${esc(pos.entryDate || '')}"></div>
      <div class="field"><label for="ed-qty">تعداد قرارداد</label>
        <input id="ed-qty" type="number" min="1" step="1" value="${Math.max(1, Number(pos.qty) || 1)}"></div>
      <div class="field"><label for="ed-spot">قیمت پایانی پایه در ورود</label>
        <input id="ed-spot" type="number" step="any" min="0" value="${Number(pos.entrySpot) || ''}"></div>
    </div>
    <div class="field" style="margin-top:8px"><label for="ed-note">یادداشت</label>
      <input id="ed-note" type="text" value="${esc(pos.note || '')}"></div>
    <table class="mini" style="margin-top:10px">
      <thead><tr><th>پا</th><th>قیمت ورود</th><th>پایانی روز ورود</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">ساختار ترکیب — نوع، سمت، قیمت اعمال، اندازه و شناسهٔ هر پا — از اینجا عوض نمی‌شود. ترکیبِ دیگر یعنی موقعیتِ دیگر.</p>`;
}

/**
 * خواندن فرم ویرایش و ساختن موقعیتِ تازه (کپی، نه تغییر در جا).
 *
 * تغییر در جا یعنی اگر اعتبارسنجی وسطِ کار رد شود، نیمی از فیلدها عوض
 * شده‌اند و نیمی نه. کپی، یا کامل می‌نشیند یا اصلاً نمی‌نشیند.
 */
export function readEdit(scope, pos) {
  if (!scope || !pos) return { ok: false, reason: EDIT_REASONS.noPosition, position: null };
  const value = (selector) => Number(scope.querySelector(selector)?.value);
  const entryDate = String(scope.querySelector('#ed-date')?.value || '').trim();
  if (!parseJalali(entryDate)) return { ok: false, reason: EDIT_REASONS.badDate, position: null };
  const qty = Math.trunc(value('#ed-qty'));
  if (!(qty >= 1)) return { ok: false, reason: EDIT_REASONS.badQty, position: null };
  const entrySpot = value('#ed-spot');
  if (!(entrySpot > 0)) return { ok: false, reason: EDIT_REASONS.badSpot, position: null };

  const legs = [];
  for (let at = 0; at < (pos.legs || []).length; at += 1) {
    const leg = pos.legs[at];
    const price = value(`[data-edit-price="${at}"]`);
    if (!(price > 0)) return { ok: false, reason: EDIT_REASONS.badPrice, position: null };
    const next = { ...leg, price };
    if (needsEntryClose(leg)) {
      const close = value(`[data-edit-close="${at}"]`);
      if (!(close > 0)) return { ok: false, reason: EDIT_REASONS.badClose, position: null };
      next.entryClose = close;
    }
    legs.push(next);
  }
  return {
    ok: true, reason: '',
    position: {
      ...pos,
      title: String(scope.querySelector('#ed-title')?.value || '').trim() || pos.title,
      note: String(scope.querySelector('#ed-note')?.value || '').trim(),
      entryDate, qty, entrySpot, legs,
      // مبنای ثابتِ روز ورود از روی مقادیر تازه دوباره ساخته می‌شود؛ تا آن
      // موقع کهنه است و نباید بماند.
      entryRisk: null,
    },
  };
}
