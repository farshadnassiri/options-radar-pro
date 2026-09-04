// رساندنِ هشدار — کانال‌ها، نه منطق.
//
// منطقِ «آیا شرط برقرار شد» در `core/gap-alert.mjs` است و آزمون دارد. این
// فایل فقط می‌رساند: اعلان مرورگر، کارتِ درون‌صفحه، صدا، و دفترچه.
//
// ═══ چرا اعلانِ مرورگر کانالِ اصلی است ولی تنها کانال نیست ═══
//
// صاحب پروژه اعلان مرورگر را خواست، چون تب اغلب پشت است و کارتِ درون‌صفحه
// در تبِ پشت دیده نمی‌شود. ولی اعلان **اجازه می‌خواهد** و کاربر می‌تواند
// ندهد — یا مرورگر بی‌صدا رد کند. اگر تنها کانال بود، هشدار در آن حالت
// اصلاً نمی‌رسید و کاربر فکر می‌کرد شرطش برقرار نشده. پس کارتِ درون‌صفحه
// هست، به‌عنوان کفِ تضمین‌شده.
//
// دفترچه هم هست چون هشداری که دیده نشد باید بعداً پیدا شود: «کِی زد و
// روی چه عددی» پرسشی است که پس از رخداد پرسیده می‌شود.
//
// ═══ صدا خاموش است، مگر خواسته شود ═══
//
// صدای ناخواسته در برنامه‌ای که ساعت‌ها باز می‌ماند، آزار است. و مرورگر
// هم تا نخستین تعاملِ کاربر اجازهٔ پخش نمی‌دهد، پس صدا در بارگذاری کار
// نمی‌کند و «خراب» به نظر می‌رسد. یک تیک، و کاربر خودش روشنش می‌کند.

import { faDigits, fmt } from './fmt.mjs';
import { alertMetric } from '../core/gap-alert.mjs';

const LOG_KEY = 'gap-alerts:log';
const LOG_MAX = 200;

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/** عددِ یک سنجه، با واحدِ خودش. رابط و متنِ اعلان از همین یکی می‌خوانند. */
export function metricText(metricId, value) {
  const metric = alertMetric(metricId);
  if (!Number.isFinite(value)) return '—';
  if (!metric) return faDigits(String(value));
  if (metric.unit === 'pct') return `${fmt.pct(value)}٪`;
  if (metric.unit === 'day') return `${fmt.int(value)} روز`;
  return `${fmt.money(value)} ریال`;
}

// ————————————————————————— اجازهٔ اعلان —————————————————————————

/**
 * وضعیت اجازه، بی درخواستِ خودکار.
 *
 * درخواستِ اجازه در بارگذاری، همان پنجرهٔ آزاردهنده‌ای است که کاربر
 * بی‌فکر رد می‌کند — و پس از یک رد، مرورگر دیگر نمی‌پرسد. پس فقط با
 * فشردنِ دکمه پرسیده می‌شود.
 */
export function notifyState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function askNotifyPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); }
  catch { return Notification.permission; }
}

export const NOTIFY_LABEL = {
  granted: 'اعلان مرورگر روشن است',
  denied: 'اعلان مرورگر رد شده — کارتِ درون‌صفحه جایش می‌نشیند',
  default: 'اعلان مرورگر هنوز اجازه نگرفته',
  unsupported: 'این مرورگر اعلان ندارد — کارتِ درون‌صفحه جایش می‌نشیند',
};

// ————————————————————————— صدا —————————————————————————

let audioCtx = null;

/**
 * بوقِ کوتاه، با نوسان‌سازِ خودِ مرورگر.
 *
 * فایل صوتی نمی‌آید چون «صفر وابستگی» قاعدهٔ این مخزن است و یک فایل صوتی
 * هم وابستگی است. دو نتِ کوتاه کافی است تا از صدای سیستم جدا باشد.
 */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const at = audioCtx.currentTime;
    for (const [offset, hz] of [[0, 880], [0.16, 1180]]) {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, at + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.14);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(at + offset); osc.stop(at + offset + 0.16);
    }
    return true;
  } catch { return false; }
}

// ————————————————————————— دفترچه —————————————————————————

export function readLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); }
  catch { return []; }
}

export function writeLog(rows) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(rows.slice(0, LOG_MAX))); }
  catch { /* حافظه پر یا قفل — دفترچه نداشتن، هشدار را از کار نمی‌اندازد */ }
}

export function clearLog() {
  try { localStorage.removeItem(LOG_KEY); } catch { /* همان */ }
}

// ————————————————————————— رساندن —————————————————————————

/**
 * یک هشدارِ آتش‌کرده را می‌رساند و ردیفِ دفترچه‌اش را برمی‌گرداند.
 *
 * `host` جایی است که کارت درون‌صفحه می‌نشیند. اگر نباشد، فقط اعلان و صدا
 * می‌ماند — و همان‌طور که بالا گفته شد، آن دو تضمینی نیستند.
 */
export function deliver(fired, { host = null, sound = false, now = new Date() } = {}) {
  const metric = alertMetric(fired.metric);
  const title = fired.label || fired.strategyName || 'هشدار فاصله';
  const body = `${metric?.label || fired.metric}: ${metricText(fired.metric, fired.value)}\n${fired.note}`;
  const row = {
    at: now.getTime(), clock: now.toLocaleTimeString('fa-IR'),
    ruleId: fired.ruleId, comboKey: fired.comboKey,
    metric: fired.metric, value: fired.value, threshold: fired.threshold,
    title, note: fired.note,
  };

  // ── کانال یک: اعلان مرورگر ──────────────────────────────────────────
  //
  // `tag` همان شناسهٔ قاعده است تا اعلانِ تکراری روی قبلی بنشیند نه اینکه
  // ده اعلان روی هم انبار شود.
  if (notifyState() === 'granted') {
    try { new Notification(title, { body, tag: `gap-${fired.ruleId}`, renotify: true }); }
    catch { /* مرورگر رد کرد؛ کارتِ زیر همچنان می‌آید */ }
  }

  // ── کانال دو: کارت درون‌صفحه، کفِ تضمین‌شده ─────────────────────────
  if (host) {
    const card = document.createElement('article');
    card.className = 'gap-alarm-card';
    card.setAttribute('role', 'alert');
    card.innerHTML = `<header><b>${esc(title)}</b><time>${faDigits(row.clock)}</time></header>
      <p>${esc(metric?.label || fired.metric)} — <strong>${metricText(fired.metric, fired.value)}</strong></p>
      <small>${esc(fired.note)}</small>
      <button type="button" class="gap-alarm-close" aria-label="بستن">×</button>`;
    card.querySelector('.gap-alarm-close').addEventListener('click', () => card.remove());
    host.prepend(card);
    // بیش از شش کارت روی هم، خودش نویز است.
    while (host.children.length > 6) host.lastElementChild.remove();
  }

  // ── کانال سه: صدا، فقط اگر خواسته شده ───────────────────────────────
  if (sound || fired.sound) beep();

  const log = [row, ...readLog()];
  writeLog(log);
  return row;
}

/** آزمونِ کانال‌ها با یک هشدار ساختگی — تا کاربر پیش از رخداد بداند کار می‌کند. */
export function testDelivery({ host = null, sound = false } = {}) {
  return deliver({
    ruleId: 'test', comboKey: '', metric: 'current', value: 700000, threshold: 700000,
    label: 'آزمایش کانال هشدار', note: 'این یک هشدار آزمایشی است؛ هیچ شرطی برقرار نشده.',
    strategyName: '',
  }, { host, sound });
}
