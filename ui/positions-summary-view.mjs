// نمای «نگاهِ سبد» — سه کارتی که جدولِ ردیف‌به‌ردیف نمی‌ساخت.
//
// موتورش `core/positions-portfolio.mjs` است و اینجا فقط شکل است. قاعده‌اش
// همان قاعدهٔ کلِ برنامه: جایی که موتور `NaN` داده، اینجا «—» می‌نشیند و
// **علتش** کنارش نوشته می‌شود — نه اینکه کارت خالی بماند و کاربر فکر کند
// هنوز بار نشده.

import { GREEKS } from '../core/monitor.mjs';
import { breakevenRoomText } from '../core/positions-portfolio.mjs';
import { faDigits, fmt, signTone } from './fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/**
 * کارت‌های یونانیِ سبد.
 *
 * `fmt.small` رقم اعشار را از خودِ عدد می‌گیرد، چون مرتبهٔ بزرگیِ این پنج
 * یکی نیست: گاما ۱۰ به توان منفی هفت است و وگا ریالی.
 */
export function portfolioGreeksHtml(summary) {
  if (!summary) return '';
  if (!summary.available) {
    const who = summary.missing?.length ? ` (${summary.missing.map(esc).join('، ')})` : '';
    return `<p class="note">${esc(summary.reason)}${who}.</p>`;
  }
  return `<div class="mini-kpis">${GREEKS.map(({ key, label }) => {
    const value = summary.greeks[key];
    return `<div class="mini-kpi"><div class="k">${esc(label)} سبد</div>
      <div class="v ${signTone(value)}">${Number.isFinite(value) ? fmt.small(value) : '—'}</div></div>`;
  }).join('')}</div>
  <p class="note">جمعِ وزن‌دارِ ${faDigits(summary.counted)} موقعیت باز، به‌ازای یک واحد حرکتِ هر عامل. دلتای مثبت یعنی کلِ دفترت با بالا رفتنِ پایه سود می‌کند؛ تتای منفی یعنی گذشتِ زمان علیه توست.</p>`;
}

/** جدولِ تقویم سررسید. */
export function expiryCalendarHtml(calendar) {
  if (!calendar) return '';
  if (!calendar.days.length) {
    return `<p class="note">${calendar.unknown.length
      ? `هیچ موقعیتی سررسیدِ ثبت‌شده ندارد (${calendar.unknown.map(esc).join('، ')}).`
      : 'موقعیت بازی با سررسید در این افق نیست.'}</p>`;
  }
  const rows = calendar.days.map((day) => `
    <tr>
      <td class="n">${faDigits(day.label)}</td>
      <td class="n">${Number.isFinite(day.daysLeft) ? fmt.int(day.daysLeft) : '—'}</td>
      <td class="n">${fmt.int(day.count)}</td>
      <td>${day.titles.map(esc).join('، ')}</td>
      <td class="n" title="${day.marginKnown ? '' : 'وجه تضمین دست‌کم یک موقعیت این روز نامعلوم است'}">${day.marginKnown ? fmt.money(day.margin) : '—'}</td>
    </tr>`).join('');
  const tail = [
    calendar.beyond ? `${faDigits(calendar.beyond)} روزِ سررسید دورتر از این افق است` : '',
    calendar.unknown.length ? `${faDigits(calendar.unknown.length)} موقعیت سررسیدِ ثبت‌شده ندارد (${calendar.unknown.map(esc).join('، ')})` : '',
  ].filter(Boolean).join(' · ');
  return `
    <table class="mini">
      <thead><tr><th>سررسید</th><th>روز مانده</th><th>موقعیت</th><th>کدام‌ها</th><th>وجه تضمینی که آزاد می‌شود</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${tail ? `<p class="note">${tail}.</p>` : ''}`;
}

/** سلولِ «اتاق سربه‌سر» در جدول موقعیت‌ها. */
export function breakevenCell(room) {
  if (!room?.available) return `<td class="n" title="${esc(room?.reason || '')}">—</td>`;
  const tone = room.tone === 'danger' ? 'loss' : (room.tone === 'warn' ? 'warn' : '');
  const arrow = room.side === 'above' ? '▲' : (room.side === 'below' ? '▼' : '=');
  return `<td class="n ${tone}" title="${esc(breakevenRoomText(room))} — سربه‌سری ${fmt.money(room.level)}">
    ${arrow} ${fmt.pct(room.roomPct)}٪</td>`;
}

/** کارت‌های دفترِ بسته‌شده‌ها. */
export function realizedKpisHtml(summary) {
  if (!summary || !summary.count) return '';
  const cards = [
    ['سود تحقق‌یافته', summary.complete ? fmt.money(summary.total) : '—',
      summary.complete ? `${faDigits(summary.count)} موقعیت بسته‌شده` : 'دست‌کم یک برگهٔ خروج ناقص است',
      summary.complete ? signTone(summary.total) : ''],
    ['برد و باخت', `${faDigits(summary.wins)} / ${faDigits(summary.losses)}`, 'سودده / زیان‌ده', ''],
    ['نرخ برد', Number.isFinite(summary.winRatePct) ? `${fmt.pct(summary.winRatePct)}٪` : '—',
      'از موقعیت‌های بسته‌شده', ''],
  ];
  return `<div class="mini-kpis">${cards.map(([key, value, sub, tone]) => `<div class="mini-kpi">
    <div class="k">${key}</div><div class="v ${tone}">${value}</div><div class="s">${sub}</div></div>`).join('')}</div>`;
}
