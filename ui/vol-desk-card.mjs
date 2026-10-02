// کارت فشردهٔ میز تلاطم — برای رصد لحظه‌ای و صفحهٔ استراتژی‌ها.
//
// همان داده و همان موتور میز (`/api/vol/intraday` ← `core/vol-desk.mjs`)،
// فقط چهار عدد: اکنون، تغییر از بازگشایی، در برابر دیروز همین ساعت، و صدک
// هم‌ساعت؛ با پیوند به میز کامل. هیچ ساختی را آغاز نمی‌کند (`build` نمی‌فرستد).

import { fmt, faDigits, ltr } from './fmt.mjs';
import { readVolSummary } from './vol-rank-store.mjs';
import { volDeskLinkHtml, bindVolDeskLinks } from './vol-desk-link.mjs';
import { deskFrom } from './vol-desk-view.mjs';
import { tehranDateNumber } from '../core/tehran-day.mjs';
import { momentLabel } from '../core/intraday-grid.mjs';
import { intradayContext, INTRADAY_SOURCES } from '../core/vol-intraday.mjs';
import { deskDays, deskModel } from '../core/vol-desk.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const isNum = (value) => Number.isFinite(value);
const pct = (value) => (isNum(value) ? `${fmt.pct(value)}٪` : '—');
const signed = (value) => (isNum(value) ? `${ltr(`${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt.pct(Math.abs(value))}`)} واحد` : '—');
const tone = (value) => (isNum(value) ? (value > 0 ? 'gain' : value < 0 ? 'loss' : '') : '');

/** HTML کارت از مدل میز. خالص. */
export function deskCardHtml(model, ua) {
  const link = volDeskLinkHtml(ua, { label: 'میز تلاطم کامل' });
  if (!model?.now) {
    return `<article class="vd-card"><div><small>تلاطم ضمنی درون‌روزی${ua?.name ? ` · ${esc(ua.name)}` : ''}</small><strong>—</strong>
      <span>${model?.why === 'pending' ? 'روزهای گذشته هنوز ساخته نشده‌اند و امروز ضبطی نیست' : 'امروز هنوز لحظه‌ای ضبط نشده'}</span></div>${link}</article>`;
  }
  const tiles = [
    ['از بازگشایی', signed(model.change), tone(model.change)],
    ['در برابر دیروز همین ساعت', signed(model.changeYday), tone(model.changeYday)],
    [`صدک هم‌ساعت (${faDigits(model.same?.n || 0)} روز)`, isNum(model.same?.percentile) ? fmt.int(Math.round(model.same.percentile)) : '—', ''],
  ];
  return `<article class="vd-card" data-live="${model.live}">
    <div><small>${model.live ? 'تلاطم ضمنی اکنون (موقت)' : 'پایان آخرین جلسه'}${ua?.name ? ` · ${esc(ua.name)}` : ''}</small>
      <strong>${pct(model.now.value)}</strong>
      <span>${momentLabel(model.now.second)} · ${esc(INTRADAY_SOURCES[model.focus.source] || '')}</span></div>
    ${tiles.map(([label, value, cls]) => `<div class="${cls}"><small>${esc(label)}</small><b>${value}</b></div>`).join('')}
    ${link}
  </article>`;
}

/** کارت را سوار می‌کند؛ `getUa()` → `{ ins, name }`. */
export function mountDeskCard(host, { getUa, getSettings = () => ({}), fetcher = (...a) => fetch(...a) } = {}) {
  let busy = false, lastKey = '', lastAt = 0;
  const unbind = bindVolDeskLinks(host);
  async function refresh(force = false) {
    const ua = getUa() || {};
    if (!ua.ins) { host.innerHTML = ''; return; }
    const today = tehranDateNumber();
    const key = `${ua.ins}:${today}`;
    if (busy || (!force && key === lastKey && Date.now() - lastAt < 60000)) return;
    busy = true;
    try {
      const [cal, body] = await Promise.all([
        fetcher('/api/vol/calendar', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ known: false, holidays: [] })),
        fetcher(`/api/vol/intraday?ua=${encodeURIComponent(ua.ins)}&from=${deskFrom(today, 5)}&to=${today}&grain=m15&mode=trades`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (body.error) throw new Error(body.error);
      const ctx = intradayContext(getSettings(), { holidays: cal.holidays || [], holidaysKnown: Boolean(cal.known) });
      const model = deskModel({ days: deskDays(body, ctx), today: body.today, ctx, summary: readVolSummary(ua.ins), compareDays: 5 });
      host.innerHTML = deskCardHtml(model, ua);
      lastKey = key; lastAt = Date.now();
    } catch (e) {
      host.innerHTML = `<article class="vd-card"><div><small>تلاطم ضمنی درون‌روزی</small><strong>—</strong><span>${esc(faDigits(String(e?.message || e)))}</span></div>${volDeskLinkHtml(ua, { label: 'میز تلاطم' })}</article>`;
    } finally { busy = false; }
  }
  return { refresh, dispose: unbind };
}
