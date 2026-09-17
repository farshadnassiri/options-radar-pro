// پذیرشِ یک ترکیب از «در جست‌وجوی استراتژی‌ها» در تب موقعیت‌های من.
//
// ═══ چرا ثبت با یک کلیک انجام نمی‌شود ═══
//
// خواستهٔ صاحب پروژه این بود که از صفحهٔ جست‌وجوی استراتژی بشود ترکیب را
// «به موقعیت‌های من اضافه کرد». راهِ ساده‌اش این بود که دکمه، همان ردیف را
// مستقیم ذخیره کند. ولی موقعیتِ ثبت‌شده ادعای **اجرا** دارد: قیمتِ ورودش
// مخرجِ بازده، مبنای وجه تضمین و پایهٔ هر عددِ فردا است. قیمتِ اجرای
// محاسبه‌شدهٔ موتور، بهترین حدس از مظنهٔ همین لحظه است — نه قیمتی که سفارشِ
// کاربر واقعاً با آن پر شده.
//
// پس دکمه، فرم را **پیش‌پر** می‌کند و کاربر با یک نگاه تأیید یا اصلاح
// می‌کند. یک کلیک تا فرم، یک کلیک تا ثبت؛ و هیچ عددِ ساختگی وارد دفتر
// موقعیت‌ها نمی‌شود.
//
// قیمت پایانی روز ورود (`entryClose`) عمداً از نقشه نمی‌آید: نقشه فقط
// قیمتِ اجرا را دارد. تب مقصد آن را از `/api/infos` می‌گیرد و اگر نیامد
// جایش خالی می‌ماند تا کاربر پرش کند — همان چیزی که `captureEntryRisk`
// برای پای فروش لازم دارد.

import { fmt } from './table.mjs';
import { faDigits } from './fmt.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { todayJalali, parseJalali } from '../core/jalali.mjs';

export const INTAKE_REASONS = {
  noPlan: 'نقشهٔ انتقالی برای این تب نیامده',
  noLegs: 'ترکیب دریافتی پایی ندارد',
  noIns: 'شناسهٔ قرارداد دست‌کم یک پا نیامده، پس ارزش‌گذاری لحظه‌ای ممکن نیست',
  noPrice: 'قیمت ورود همهٔ پاها لازم است',
  noSize: 'اندازهٔ قرارداد دست‌کم یک پا معلوم نیست',
  badDate: 'تاریخ ورود شمسی معتبر نیست',
  badSpot: 'قیمت پایانی پایه در روز ورود لازم است',
  badClose: 'قیمت پایانی هر پای فروش در روز ورود لازم است',
};

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const legLabel = (leg) => `${leg.side === 'sell' ? 'فروش' : 'خرید'} `
  + (leg.kind === 'underlying' ? 'سهم' : `${leg.kind === 'call' ? 'کال' : 'پوت'} ${fmt.money(leg.strike)}`);

/**
 * پیش‌نویسِ موقعیت از نقشهٔ انتقال.
 *
 * تاریخ ورود: ردیفِ زنده امروز است، ردیفِ تاریخی روزِ خودش. هیچ‌کدام حدس
 * نیست — `entryDate` در نقشه یا `auto` است یا عددِ صریحِ همان روز.
 */
export function draftFromPlan(plan, { today = todayJalali() } = {}) {
  if (!plan || plan.to !== 'positions') return { ok: false, reason: INTAKE_REASONS.noPlan, draft: null };
  const legs = Array.isArray(plan.legs) ? plan.legs : [];
  if (!legs.length) return { ok: false, reason: INTAKE_REASONS.noLegs, draft: null };
  if (legs.some((leg) => leg.kind !== 'underlying' && !String(leg.ins || ''))) {
    return { ok: false, reason: INTAKE_REASONS.noIns, draft: null };
  }
  if (legs.some((leg) => !(Number(leg.price) > 0))) {
    return { ok: false, reason: INTAKE_REASONS.noPrice, draft: null };
  }
  if (legs.some((leg) => !(Number(leg.size) > 0))) {
    return { ok: false, reason: INTAKE_REASONS.noSize, draft: null };
  }
  const stamped = Number(plan.entryDate) > 0 ? historyDateLabel(plan.entryDate) : '';
  return {
    ok: true, reason: '',
    draft: {
      title: String(plan.title || plan.strategyName || 'موقعیت تازه').trim(),
      uaIns: String(plan.uaIns || ''), uaName: String(plan.uaName || ''),
      strategyId: String(plan.strategyId || ''), strategyName: String(plan.strategyName || ''),
      comboName: String(plan.comboName || ''),
      entryDate: stamped && stamped !== '—' ? stamped : today,
      entrySpot: Number(plan.entrySpot) > 0 ? Number(plan.entrySpot) : 0,
      qty: Math.max(1, Math.trunc(Number(plan.qty) || 1)),
      legs: legs.map((leg) => ({ ...leg, entryClose: Number(leg.entryClose) > 0 ? Number(leg.entryClose) : 0 })),
    },
  };
}

/** کارتِ تأیید — همان چیزی که پیش از ثبت باید دیده و اصلاح شود. */
export function intakeFormHtml(draft) {
  if (!draft) return '';
  const rows = draft.legs.map((leg, at) => `
    <tr>
      <td>${esc(legLabel(leg))}</td>
      <td class="n">${leg.ins ? faDigits(leg.ins) : '—'}</td>
      <td class="n">${fmt.int(leg.size)}</td>
      <td class="n"><input type="number" step="any" min="0" id="in-price-${at}" data-intake-price="${at}"
        value="${Number(leg.price) || ''}" style="width:8rem"></td>
      <td class="n">${leg.side === 'sell' && leg.kind !== 'underlying'
        ? `<input type="number" step="any" min="0" id="in-close-${at}" data-intake-close="${at}"
            value="${Number(leg.entryClose) || ''}" style="width:8rem">`
        : '—'}</td>
    </tr>`).join('');
  return `
    <div class="bar" style="flex-wrap:wrap;gap:12px">
      <div class="field"><label for="in-title">عنوان</label>
        <input id="in-title" type="text" value="${esc(draft.title)}"></div>
      <div class="field"><label for="in-date">تاریخ ورود (شمسی)</label>
        <input id="in-date" type="text" value="${esc(draft.entryDate)}" inputmode="numeric"></div>
      <div class="field"><label for="in-qty">تعداد قرارداد</label>
        <input id="in-qty" type="number" min="1" step="1" value="${draft.qty}"></div>
      <div class="field"><label for="in-spot">قیمت پایانی پایه در ورود</label>
        <input id="in-spot" type="number" step="any" min="0" value="${draft.entrySpot || ''}"></div>
    </div>
    <table class="mini" style="margin-top:10px">
      <thead><tr><th>پا</th><th>قرارداد</th><th>اندازه</th><th>قیمت ورود</th><th>پایانی روز ورود</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">قیمت ورود از قیمت اجرای همان ردیف پیش‌پر شده است. اگر سفارش تو با قیمت دیگری پر شده، همین‌جا اصلاحش کن — بازده و وجه تضمین از این عدد ساخته می‌شوند. ستون پایانی فقط برای پای فروش لازم است و مخرجِ ثابتِ بازده را می‌سازد.</p>`;
}

/**
 * خواندن فرم و ساختن موقعیت.
 *
 * هیچ خانهٔ خالی با عددِ پیش‌فرض پر نمی‌شود: ورودیِ ناقص، خطا می‌دهد و ثبت
 * انجام نمی‌شود. موقعیتی که یک عددِ ساختگی داشته باشد، تا سررسید همان عدد
 * را در هر بازده و هر وجه تضمینی تکرار می‌کند.
 */
export function readIntake(scope, draft) {
  if (!scope || !draft) return { ok: false, reason: INTAKE_REASONS.noPlan, position: null };
  const value = (selector) => Number(scope.querySelector(selector)?.value);
  const entryDate = String(scope.querySelector('#in-date')?.value || '').trim();
  if (!parseJalali(entryDate)) return { ok: false, reason: INTAKE_REASONS.badDate, position: null };
  const entrySpot = value('#in-spot');
  if (!(entrySpot > 0)) return { ok: false, reason: INTAKE_REASONS.badSpot, position: null };

  const legs = [];
  for (let at = 0; at < draft.legs.length; at += 1) {
    const leg = draft.legs[at];
    const price = value(`[data-intake-price="${at}"]`);
    if (!(price > 0)) return { ok: false, reason: INTAKE_REASONS.noPrice, position: null };
    const next = { ...leg, price };
    if (leg.side === 'sell' && leg.kind !== 'underlying') {
      const close = value(`[data-intake-close="${at}"]`);
      if (!(close > 0)) return { ok: false, reason: INTAKE_REASONS.badClose, position: null };
      next.entryClose = close;
    } else {
      delete next.entryClose;
    }
    legs.push(next);
  }
  const title = String(scope.querySelector('#in-title')?.value || '').trim() || draft.title;
  return {
    ok: true, reason: '',
    position: {
      title, uaIns: draft.uaIns, uaName: draft.uaName,
      entryDate, entrySpot,
      qty: Math.max(1, Math.trunc(value('#in-qty') || draft.qty)),
      legs,
    },
  };
}
