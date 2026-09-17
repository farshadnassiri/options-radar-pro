// بایگانیِ اجراها و مقایسهٔ دو اجرا — نما و حافظهٔ مرورگر.
//
// ═══ چرا حافظهٔ مرورگر و نه دیسکِ سرور ═══
//
// بایگانی اینجا یک **دفترچهٔ یادداشتِ کنارِ دست** است، نه سند. اگر روی
// دیسک می‌نشست، باید نسخه‌بندی و مهاجرت و پاک‌سازی می‌داشت — و همان دستگاهی
// می‌شد که «پرونده‌های پایان جلسهٔ سبد» از قبل هست. برای مسیرِ کاملِ یک
// اجرا هم خروجی اکسل هست.
//
// پس صریح نوشته می‌شود: این فهرست فقط روی همین مرورگر است. جمله‌اش زیر
// جدول می‌آید، نه در یک راهنمای جداگانه.

import { RUN_HEADLINE, compareRuns, runLabel } from '../core/backtest-runs.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { faDigits, faNum, fmt, signTone } from './fmt.mjs';

const KEY = 'options-radar:backtest-runs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/** حافظه در حالتِ خصوصی یا مسدود، می‌تواند نباشد یا پرتاب کند. */
const store = () => {
  try { return window.localStorage; } catch { return null; }
};

export function readRuns() {
  const ls = store();
  if (!ls) return [];
  try {
    const raw = JSON.parse(ls.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function writeRuns(list = []) {
  const ls = store();
  if (!ls) return false;
  try { ls.setItem(KEY, JSON.stringify(list)); return true; }
  catch { return false; }
}

const fmtKind = (value, kind) => {
  if (!Number.isFinite(value)) return value === Infinity ? 'نامحدود' : '—';
  if (kind === 'money') return fmt.money(value);
  if (kind === 'pct') return `${fmt.pct(value)}٪`;
  if (kind === 'pct1') return `${faNum((value * 100).toFixed(1))}٪`;
  if (kind === 'rate') return faNum(String(value));
  if (kind === 'int') return fmt.int(value);
  return fmt.num(value);
};

const settingValue = (value, kind) => (typeof value === 'number' ? fmtKind(value, kind) : esc(String(value ?? '—')));

/** فهرست اجراهای بایگانی‌شده. */
export function runsListHtml(list = []) {
  if (!list.length) {
    return '<p class="note">هنوز اجرایی بایگانی نشده. بعد از هر اجرا «بایگانی این اجرا» را بزن تا بتوانی دو تنظیم را کنار هم بگذاری.</p>';
  }
  return `
    <table class="mini">
      <thead><tr><th>اجرا</th><th>بازه</th><th>سود پایان بازه</th><th>بازده ٪</th><th>روز معتبر</th><th>یادداشت</th><th></th></tr></thead>
      <tbody>${list.map((run) => `
        <tr>
          <td>${esc(runLabel(run))}<br><span class="unit">${faDigits(new Date(run.at).toLocaleString('fa-IR'))}</span></td>
          <td class="n">${faDigits(historyDateLabel(run.from))} تا ${faDigits(historyDateLabel(run.to))}</td>
          <td class="n ${signTone(run.headline.netPnl)}">${fmt.money(run.headline.netPnl)}</td>
          <td class="n">${fmtKind(run.headline.returnPct, 'pct')}</td>
          <td class="n">${fmt.int(run.headline.validDays)}</td>
          <td>${esc(run.note || '—')}</td>
          <td><button type="button" class="ghost" data-run-drop="${esc(run.id)}">حذف</button></td>
        </tr>`).join('')}</tbody>
    </table>
    <p class="note">این فهرست فقط روی همین مرورگر است و با پاک‌کردن دادهٔ سایت می‌رود. برای مسیر کامل یک اجرا، خروجی اکسل همان صفحه را بگیر.</p>`;
}

/** جدول مقایسهٔ دو اجرا. */
export function runsCompareHtml(a, b) {
  const cmp = compareRuns(a, b);
  if (!cmp.rows.length) return `<p class="note">${esc(cmp.reason)}</p>`;
  const warn = [];
  if (!cmp.sameCombo) warn.push('این دو اجرا روی یک ترکیب نیستند');
  if (!cmp.sameRange) warn.push('بازهٔ این دو اجرا یکی نیست');
  // اگر هیچ تنظیمی فرق نداشته باشد و عددها فرق کنند، اثرِ تنظیم نیست.
  if (cmp.same) warn.push('تنظیمِ این دو اجرا یکسان است، پس تفاوتِ عددها از تنظیم نیامده — از بازه، داده یا ترکیب آمده');
  return `
    <table class="mini">
      <thead><tr><th>سنجه</th><th>${esc(runLabel(a))}</th><th>${esc(runLabel(b))}</th><th>تفاوت</th></tr></thead>
      <tbody>${cmp.rows.map((row) => `
        <tr>
          <td>${esc(row.label)}</td>
          <td class="n">${fmtKind(row.left, row.kind)}</td>
          <td class="n">${fmtKind(row.right, row.kind)}</td>
          <td class="n ${signTone(row.delta)}">${fmtKind(row.delta, row.kind)}</td>
        </tr>`).join('')}</tbody>
    </table>
    ${cmp.diff.length ? `
      <h4 style="margin:12px 0 4px;font-size:var(--fs-xs)">چه چیزی بین این دو فرق داشت</h4>
      <table class="mini">
        <thead><tr><th>تنظیم</th><th>اجرای اول</th><th>اجرای دوم</th></tr></thead>
        <tbody>${cmp.diff.map((row) => `<tr><td>${esc(row.label)}</td>
          <td class="n">${settingValue(row.left, row.kind)}</td>
          <td class="n">${settingValue(row.right, row.kind)}</td></tr>`).join('')}</tbody>
      </table>` : ''}
    ${warn.length ? `<p class="note" style="color:var(--warn)">${warn.map(esc).join(' · ')}.</p>` : ''}
    <p class="note">ستون تفاوت یعنی «اجرای دوم منهای اجرای اول». سنجه‌ای که در یکی از دو اجرا عدد ندارد، تفاوتش هم ساخته نمی‌شود — نه اینکه صفر شود.</p>`;
}

export { RUN_HEADLINE };
