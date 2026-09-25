// دیدِ مرورگر از جریانِ داده (R5-21) — منطق در `core/datalog.mjs`.
//
// ═══ چرا پوششِ `fetch`، نه لاگ در هر تب ═══
//
// حدود چهل جای کد مستقیم درخواست می‌فرستند. لاگ‌کردنِ تک‌تکشان یعنی
// امروز چندتایی جا بمانند و فردا مسیرِ تازه‌ای بی‌لاگ اضافه شود. پوشش
// روی `window.fetch` یک بار نصب می‌شود و هر درخواستِ `/api/` — امروزی یا
// آینده — از آن رد می‌شود.
//
// ═══ «کدام قسمت برنامه» ═══
//
// سه نشانه، کنارِ هم:
//   مبدأ   ردِ پشتهٔ همان لحظه — فایل و خطِ کدی که درخواست را فرستاد؛
//   تب     از همان رد (`ui/tabs/<نام>.mjs`)، و اگر به تبی نرسید تبِ باز؛
//   کار    آخرین دکمه یا انتخابی که کاربر زد، با فاصله‌اش تا این درخواست.
//
// شناسه (`x-dl-id`) همراهِ درخواست به سرور می‌رود تا ردیفِ سرور و
// درخواست‌های TSETMC زیرِ همین ردیف بنشینند.

import { DL_MUTED_TABS, classifyError, sourceFromStack, tabFromSource } from '/core/datalog.mjs';

const FLUSH_MS = 1500;
const SLOW_MS = 3000;
let installed = false;
let seq = 0;
const session = Math.random().toString(36).slice(2, 7);
let lastAction = null;
let pending = [];
let timer = null;
let rawFetch = null;

const isApi = (url) => {
  try { return new URL(url, location.href).pathname.startsWith('/api/'); } catch { return false; }
};
const skip = (url) => /\/api\/(datalog|logs|stream)\b/.test(url);

// متنِ خودِ دکمه اول می‌آید: `title` دکمه‌های فهرستِ کناری توضیحِ کمکی
// دارد («همان بک‌تست سریع سابق»)، نه نامِ کاری که کاربر زد.
const labelOf = (node) => {
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  if (node.matches?.('select,input,textarea')) {
    const lab = node.id ? document.querySelector(`label[for="${node.id}"]`)?.textContent : '';
    const wrap = node.closest?.('label')?.childNodes?.[0]?.textContent || '';
    return clean(lab || wrap || node.getAttribute?.('aria-label') || node.id).slice(0, 60);
  }
  return clean(node.textContent || node.getAttribute?.('aria-label') || node.title || node.id).slice(0, 60);
};
const valueOf = (node) => {
  if (node.matches?.('select')) return node.selectedOptions?.[0]?.textContent?.trim() || node.value;
  if (node.type === 'checkbox' || node.type === 'radio') return node.checked ? 'روشن' : 'خاموش';
  return String(node.value ?? '').slice(0, 40);
};

function bodySummary(body) {
  if (body == null) return '';
  if (typeof body !== 'string') return `[${body?.constructor?.name || typeof body}]`;
  try {
    const obj = JSON.parse(body);
    if (Array.isArray(obj?.requests)) {
      const dates = [...new Set(obj.requests.map((r) => r?.date))].filter(Boolean);
      const ins = [...new Set(obj.requests.map((r) => r?.ins))].filter(Boolean);
      return `${obj.requests.length} درخواست · ${ins.length} ابزار × ${dates.length} روز`
        + `${dates.length ? ` (${dates[0]}…${dates.at(-1)})` : ''}${obj.fresh ? ' · fresh' : ''}`;
    }
  } catch { /* بدنهٔ غیرِ JSON */ }
  return body.slice(0, 300);
}

function queue(row) {
  pending.push(row);
  if (pending.length > 2000) pending.splice(0, pending.length - 2000);
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

async function flush() {
  timer = null;
  const batch = pending.splice(0, 300);
  if (!batch.length || !rawFetch) return;
  try {
    await rawFetch('/api/datalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: batch }),
    });
  } catch {
    // سرور در دسترس نیست؛ ردیف‌ها برمی‌گردند تا دفعهٔ بعد، نه بی‌نهایت.
    if (pending.length < 1000) pending.unshift(...batch);
  }
  if (pending.length && !timer) timer = setTimeout(flush, FLUSH_MS * 2);
}

/**
 * نصب، یک بار. `currentTab` تبِ بازِ لحظه را می‌دهد — فقط وقتی ردِ پشته
 * به هیچ تبی نرسید.
 */
export function installDataLog({ currentTab = () => '' } = {}) {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  rawFetch = window.fetch.bind(window);
  // رد پشته به‌طور پیش‌فرض ده قاب است؛ دروازه‌ها و کمک‌تابع‌ها گاهی همهٔ
  // ده تا را می‌گیرند و تب از رد می‌افتد.
  try { if (Error.stackTraceLimit < 30) Error.stackTraceLimit = 30; } catch { /* غیرِ V8 */ }

  document.addEventListener('click', (event) => {
    const node = event.target?.closest?.('button, a, summary, [role="button"], .tab-btn');
    if (node) lastAction = { label: labelOf(node), at: Date.now() };
  }, true);
  document.addEventListener('change', (event) => {
    const node = event.target;
    if (node?.matches?.('select, input, textarea')) lastAction = { label: `${labelOf(node)} ← ${valueOf(node)}`, at: Date.now() };
  }, true);

  window.fetch = async function datalogFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    if (!isApi(url) || skip(url)) return rawFetch(input, init);
    const src = sourceFromStack(new Error().stack);
    const tab = tabFromSource(src) || currentTab() || '';
    const id = `c${session}-${++seq}`;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-dl-id', id);
    headers.set('x-dl-tab', tab);
    if (lastAction?.label) headers.set('x-dl-action', encodeURIComponent(lastAction.label));
    headers.set('x-dl-src', encodeURIComponent(src.slice(0, 3).join(' ← ')));
    const muted = DL_MUTED_TABS.has(tab);
    const row = {
      id, tab, method: String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase(),
      url, src, sentAt: Date.now(), body: bodySummary(init?.body),
      action: lastAction?.label || '', actionAgoMs: lastAction ? Date.now() - lastAction.at : null,
    };
    const t0 = performance.now();
    try {
      const res = await rawFetch(input, { ...init, headers });
      row.ms = Math.round(performance.now() - t0);
      row.status = res.status;
      row.bytes = Number(res.headers.get('content-length')) || undefined;
      row.cat = res.ok ? 'ok' : 'error';
      row.slow = row.ms > SLOW_MS;
      if (!muted) queue(row);
      return res;
    } catch (error) {
      row.ms = Math.round(performance.now() - t0);
      const cat = classifyError(error);
      // «Failed to fetch» در مرورگر یعنی به سرورِ محلی نرسید؛ اگر خودِ
      // دستگاه هم آفلاین است، علت نت است.
      row.cat = cat === 'network' ? (navigator.onLine === false ? 'network' : 'offline') : cat;
      row.error = `${error?.name || 'Error'}: ${error?.message || error}`;
      if (!muted) queue(row);
      throw error;
    }
  };
}
