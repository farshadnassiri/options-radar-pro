// راهنمای «؟» برای همهٔ بخش‌های برنامه (۱۴۰۵/۰۷/۱۷).
//
// خواستهٔ صاحب پروژه: «توضیحات این مدلی را از سراسر برنامه حذف کن؛ فقط
// توضیحات مهمی که کاربر باید بداند بماند. توضیحات کامل را در آیکون علامت
// سؤال برای همهٔ بخش‌های برنامه بساز… با زبان ساده برای یک تریدر و مثال عددی.»
//
// صدها جمله‌ی توضیحی در ده‌ها تب پخش بود. به‌جای دست‌بردن در تک‌تکِ قالب‌ها
// (و از دست رفتنِ متنی که آزمون‌ها و آیندگان به آن تکیه دارند)، این لایه
// پس از هر رسم:
//
//   ۱. هر یادداشتِ توضیحیِ ایستا را پنهان می‌کند — `p/span.note`، شرحِ زیرِ
//      عنوانِ بخش‌های «hero»، `history-caveat` و متنِ کنارِ سرِ بخش —
//      به شرطی که «زنده» نباشد: شناسه، `data-*`، `role` یا `aria-live`
//      ندارد، کنترل ندارد، و رنگِ هشدار/زیان/سود یا `data-keep` نگرفته.
//      وضعیت، خطا، هشدار و عددهای زنده همه همان‌جا می‌مانند.
//   ۲. کنار نزدیک‌ترین عنوانِ پیش از آن یک «؟» می‌گذارد که متنِ پنهان‌شده را
//      نگه می‌دارد؛ اگر عنوانی نبود، «؟» جای خودِ یادداشت می‌نشیند.
//   ۳. برای عنوان‌هایی که توضیحِ ساده و مثال‌دار دارند (`ui/help-texts.mjs`)
//      حتی بی یادداشت هم «؟» می‌گذارد.
//
// متن پنهان‌شده هر بار از خودِ عنصر خوانده می‌شود، پس یادداشتی که بعداً با
// عددِ تازه پر شود، در «؟» هم تازه است.

import { helpFor } from './help-texts.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

const NOTE_SELECTOR = [
  'p.note', 'span.note', 'small.note', 'div.note', 'p.history-caveat',
  '[class*="hero"] p:not(.eyebrow)',
  '.section-head > span', '.section-head > small', '.lmm-step-head span',
  // شرحِ ساده‌ای که درست زیرِ عنوان آمده (بی کلاس «note»).
  'h1 + p:not(.eyebrow)', 'h2 + p:not(.eyebrow)', 'h3 + p:not(.eyebrow)', 'h4 + p:not(.eyebrow)',
].join(', ');
const HEADINGS = 'h1, h2, h3, h4, summary';
const KEEP_CLASSES = ['loss', 'gain', 'warn', 'bad', 'error', 'danger', 'keep', 'empty-note', 'pill', 'num'];
const MIN_TEXT = 28;

/** یادداشتِ «توضیحیِ ایستا» است؟ — نه وضعیت، نه عدد زنده، نه هشدار. */
export function isExplanatory(el) {
  if (!el || el.hasAttribute('data-help-moved') || el.hasAttribute('data-keep')) return false;
  if (el.id || el.getAttribute('role') || el.getAttribute('aria-live')) return false;
  // `data-help-note`: یادداشتِ توضیحیِ پویا که کد پرش می‌کند ولی خبر نیست.
  if (!el.hasAttribute('data-help-note')) for (const attr of el.attributes || []) if (attr.name.startsWith('data-')) return false;
  if (KEEP_CLASSES.some((c) => el.classList?.contains(c))) return false;
  if (el.querySelector?.('button, input, select, textarea, a, label, [id], [data-help], .g-help')) return false;
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (text.length < MIN_TEXT || /^⚠/.test(text)) return false;
  // درونِ پنجره‌ها و جعبه‌هایی که خودشان راهنما هستند، نه.
  if (el.closest('.g-help-pop, .sl-tip, .ccv-tip, [data-no-help]')) return false;
  return true;
}

/** متنِ عنوان بی آیکون‌ها. */
export function headingText(h) {
  const clone = h.cloneNode(true);
  clone.querySelectorAll('.g-help, .sl-help, [data-help], .scope, button, select, input').forEach((n) => n.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

/** نزدیک‌ترین عنوانِ پیش از یادداشت، درونِ همان بخش (تا شش پله بالا). */
function anchorFor(note, stage) {
  let box = note.parentElement;
  for (let up = 0; box && box !== stage && up < 6; up += 1, box = box.parentElement) {
    const before = [...box.querySelectorAll(HEADINGS)].filter((h) => (h.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING) && !h.closest('.g-help-pop'));
    if (before.length) return before.at(-1);
  }
  return null;
}

export function installHelp(stage = document.getElementById('stage') || document.body) {
  const notesOf = new WeakMap(); // عنوان یا آیکون → مجموعهٔ یادداشت‌ها
  const pop = document.createElement('div');
  pop.className = 'g-help-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  document.body.appendChild(pop);
  let openFor = null;

  function iconFor(host, { inline = false } = {}) {
    let icon = inline ? null : host.querySelector(':scope > .g-help');
    if (icon) return icon;
    icon = document.createElement('button');
    icon.type = 'button'; icon.className = `g-help${inline ? ' inline' : ''}`;
    icon.setAttribute('aria-label', 'راهنما');
    notesOf.set(icon, new Set());
    if (inline) host.replaceWith(icon); else host.appendChild(icon);
    return icon;
  }

  function attach(note) {
    const heading = anchorFor(note, stage);
    // عنوانی که خودش «؟»ِ قدیمی دارد (استرانگل، اسکنر): همان را پر می‌کنیم.
    const legacy = heading?.querySelector('[data-help]');
    if (legacy) {
      const text = note.textContent.replace(/\s+/g, ' ').trim();
      if (!legacy.dataset.help.includes(text)) legacy.dataset.help = `${legacy.dataset.help}\n\n${text}`;
      note.setAttribute('data-help-moved', '');
      return;
    }
    let icon;
    if (heading) icon = iconFor(heading);
    else {
      const holder = document.createElement('span');
      note.before(holder);
      icon = iconFor(holder, { inline: true });
    }
    notesOf.get(icon).add(note);
    note.setAttribute('data-help-moved', '');
  }

  function scan() {
    for (const note of stage.querySelectorAll(NOTE_SELECTOR)) if (isExplanatory(note)) attach(note);
    // عنوان‌هایی که توضیحِ ساده دارند، حتی بی یادداشت.
    for (const h of stage.querySelectorAll(HEADINGS)) {
      // عنوانِ درونِ جدول (مثل «نمایش»ِ هر ردیف دفتر خطا) کنترل است، نه سرِ بخش؛
      // هم‌نامیِ کوتاهش با عنوانِ یک بخش («نمایش» در تنظیمات) نباید «؟» بسازد.
      if (h.querySelector(':scope > .g-help, [data-help]') || h.closest('.g-help-pop, table')) continue;
      if (helpFor(headingText(h))) iconFor(h);
    }
  }

  function render(icon) {
    const host = icon.classList.contains('inline') ? null : icon.parentElement;
    const title = host ? headingText(host) : 'توضیح';
    const curated = helpFor(title);
    const notes = [...(notesOf.get(icon) || [])].filter((n) => n.isConnected).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const unique = [...new Set(notes)];
    const details = unique.map((t) => `<p>${esc(t)}</p>`).join('');
    pop.innerHTML = `<header><b>${esc(title)}</b><button type="button" class="g-help-close" aria-label="بستن">×</button></header>
      ${curated ? `<div class="g-help-body">${curated.body.split('\n').filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')}</div>${curated.example ? `<div class="g-help-example"><b>مثال</b><p>${esc(curated.example)}</p></div>` : ''}` : ''}
      ${details ? (curated ? `<details class="g-help-more"><summary>جزئیات بیشترِ همین بخش</summary>${details}</details>` : `<div class="g-help-body">${details}</div>`) : ''}`;
  }

  function place(icon) {
    const r = icon.getBoundingClientRect();
    pop.hidden = false;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 8 + h < window.innerHeight;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, below ? r.bottom + 8 : r.top - h - 8)}px`;
  }

  function open(icon) {
    openFor = icon; render(icon); place(icon);
    icon.setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (openFor) openFor.setAttribute('aria-expanded', 'false');
    openFor = null; pop.hidden = true;
  }

  document.addEventListener('click', (event) => {
    const icon = event.target.closest?.('.g-help');
    if (icon) {
      event.preventDefault(); event.stopPropagation();
      if (openFor === icon) close(); else open(icon);
      return;
    }
    if (event.target.closest?.('.g-help-close') || (!pop.hidden && !pop.contains(event.target))) close();
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !pop.hidden) close(); });
  window.addEventListener('scroll', () => { if (openFor?.isConnected) place(openFor); else if (openFor) close(); }, true);
  window.addEventListener('resize', () => { if (openFor) place(openFor); });

  let queued = false;
  const soon = () => {
    if (queued) return;
    queued = true;
    (globalThis.requestIdleCallback || ((f) => setTimeout(f, 60)))(() => { queued = false; scan(); }, { timeout: 300 });
  };
  new MutationObserver(soon).observe(stage, { childList: true, subtree: true });
  scan();
  return { scan, close };
}
