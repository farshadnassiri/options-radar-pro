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
import { watchMetric } from '../core/watch-rule.mjs';

// ═══ دفترچه: یکی برای هر تب، نه یکی مشترک ═══
//
// «دفترچهٔ رادار و دیده‌بان مشترک است و رخدادهای دو بخش مخلوط می‌شوند.»
// دو تب، دو قاعدهٔ متفاوت، و دو پرسشِ متفاوت («کدام ترکیب از خطم رد شد»
// در برابر «کدام فرصت وارد شرطم شد»). ریختنشان در یک دفتر یعنی «پاک کردن
// دفترچه» در یکی، تاریخِ آن یکی را هم می‌برد.
const LOG_KEYS = { radar: 'gap-alerts:log:radar', watch: 'gap-alerts:log:watch' };
const logKey = (scope) => LOG_KEYS[String(scope ?? '')] || LOG_KEYS.radar;

// یک شرطِ عمومی می‌تواند در یک تیک روی صدها ترکیب برقرار شود. سقفِ ۲۰۰
// یعنی موجِ بزرگ، خودش را از دفتر بیرون می‌انداخت — دقیقاً همان رخدادی
// که کاربر بعداً دنبالش می‌گردد. سقف بالا رفت و به‌ازای هر تب جداست، و
// موج به‌جای صدها کارت، یک کارتِ جمع‌بندی می‌گیرد.
const LOG_MAX = 1000;

/** بیش از این کارت در یک موج روی صفحه نمی‌نشیند؛ بقیه در یک کارتِ جمع‌بندی می‌آیند. */
const BURST_CARDS = 4;

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

export function readLog(scope = 'radar') {
  try {
    const rows = JSON.parse(localStorage.getItem(logKey(scope)) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

export function writeLog(rows, scope = 'radar') {
  try { localStorage.setItem(logKey(scope), JSON.stringify(rows.slice(0, LOG_MAX))); }
  catch { /* حافظه پر یا قفل — دفترچه نداشتن، هشدار را از کار نمی‌اندازد */ }
}

export function clearLog(scope = 'radar') {
  try { localStorage.removeItem(logKey(scope)); } catch { /* همان */ }
}

// ————————————————————————— رساندن —————————————————————————

/**
 * یک هشدارِ آتش‌کرده را می‌رساند و ردیفِ دفترچه‌اش را برمی‌گرداند.
 *
 * `host` جایی است که کارت درون‌صفحه می‌نشیند. اگر نباشد، فقط اعلان و صدا
 * می‌ماند — و همان‌طور که بالا گفته شد، آن دو تضمینی نیستند.
 */
export function deliver(fired, { host = null, sound = false, now = new Date(), scope = 'radar', card = true, log = true } = {}) {
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
  if (host && card) {
    const node = document.createElement('article');
    node.className = 'gap-alarm-card';
    node.setAttribute('role', 'alert');
    node.innerHTML = `<header><b>${esc(title)}</b><time>${faDigits(row.clock)}</time></header>
      <p>${esc(metric?.label || fired.metric)} — <strong>${metricText(fired.metric, fired.value)}</strong></p>
      <small>${esc(fired.note)}</small>
      <button type="button" class="gap-alarm-close" aria-label="بستن">×</button>`;
    node.querySelector('.gap-alarm-close').addEventListener('click', () => node.remove());
    host.prepend(node);
    // بیش از شش کارت روی هم، خودش نویز است.
    while (host.children.length > 6) host.lastElementChild.remove();
  }

  // ── کانال سه: صدا، فقط اگر خواسته شده ───────────────────────────────
  if (sound || fired.sound) beep();

  if (log) writeLog([row, ...readLog(scope)], scope);
  return row;
}

/** آزمونِ کانال‌ها با یک هشدار ساختگی — تا کاربر پیش از رخداد بداند کار می‌کند. */
export function testDelivery({ host = null, sound = false, scope = 'radar' } = {}) {
  return deliver({
    ruleId: 'test', comboKey: '', metric: 'current', value: 700000, threshold: 700000,
    label: 'آزمایش کانال هشدار', note: 'این یک هشدار آزمایشی است؛ هیچ شرطی برقرار نشده.',
    strategyName: '',
  }, { host, sound, scope });
}


/**
 * هشدارِ دیده‌بانِ شرطی — همان کانال‌ها، ولی برای قاعده‌ای با چند شرط.
 *
 * ═══ چرا `deliver` کافی نبود ═══
 *
 * آن یکی یک سنجه و یک آستانه دارد و متنش همان را می‌گوید. قاعدهٔ دیده‌بان
 * چند شرط دارد که **همه** برقرار شده‌اند، و متنی که فقط یکی‌شان را بگوید
 * به کاربر نمی‌گوید چرا این ترکیب انتخاب شد. پس هر شرط با عددِ دیده‌شده
 * و آستانه‌ای که سنجیده شد می‌آید.
 *
 * آستانه هم چاپ می‌شود، نه فقط عدد: در شرطِ نسبی («۹۰٪ میانگین ۵ روز
 * گذشته») خودِ آستانه در هر لحظه فرق می‌کند و بی آن، «۲٬۴۰۰» بی‌معنی است.
 */
export function deliverWatch(fired, { host = null, sound = false, now = new Date(), scope = 'watch', card = true, log = true } = {}) {
  const title = fired.label || fired.ruleName || 'دیده‌بان شرطی';
  const lines = (fired.parts || []).map((part) => {
    const metric = watchMetric(part.metric);
    const unit = metric?.unit === 'pct' ? '٪' : metric?.unit === 'day' ? ' روز'
      : metric?.unit === 'num' || metric?.unit === 'int' ? '' : ' ریال';
    const seen = Number.isFinite(part.value)
      ? `${faDigits(Number(part.value).toLocaleString('fa-IR', { maximumFractionDigits: 2 }))}${unit}` : '—';
    const gate = Number.isFinite(part.threshold)
      ? `${faDigits(Number(part.threshold).toLocaleString('fa-IR', { maximumFractionDigits: 2 }))}${unit}` : '—';
    return { label: metric?.label || part.metric, seen, gate, note: part.note };
  });
  const body = [
    fired.ruleName,
    ...lines.map((line) => `${line.label}: ${line.seen} (آستانه ${line.gate})`),
  ].filter(Boolean).join('\n');
  const row = {
    at: now.getTime(), clock: now.toLocaleTimeString('fa-IR'),
    ruleId: fired.ruleId, comboKey: fired.comboKey,
    metric: lines[0]?.label || '', value: NaN, threshold: NaN,
    title, note: body.replace(/\n/g, ' · '),
  };

  if (notifyState() === 'granted') {
    try { new Notification(title, { body, tag: `watch-${fired.ruleId}`, renotify: true }); }
    catch { /* مرورگر رد کرد؛ کارتِ زیر همچنان می‌آید */ }
  }
  if (host && card) {
    const node = document.createElement('article');
    node.className = 'gap-alarm-card';
    node.setAttribute('role', 'alert');
    node.innerHTML = `<header><b>${esc(title)}</b><time>${faDigits(row.clock)}</time></header>
      <p>${esc(fired.ruleName || '')}</p>
      <ul class="gap-alarm-parts">${lines.map((line) => `<li><span>${esc(line.label)}</span><strong>${esc(line.seen)}</strong><small>آستانه ${esc(line.gate)}</small></li>`).join('')}</ul>
      <button type="button" class="gap-alarm-close" aria-label="بستن">×</button>`;
    node.querySelector('.gap-alarm-close').addEventListener('click', () => node.remove());
    host.prepend(node);
    while (host.children.length > 6) host.lastElementChild.remove();
  }
  if (sound || fired.sound) beep();
  if (log) writeLog([row, ...readLog(scope)], scope);
  return row;
}

/**
 * یک **موج** هشدار — همه در دفترچه، چندتا روی صفحه، و یک جمع‌بندی.
 *
 * ═══ ایرادی که این تابع جوابش است ═══
 *
 * «یک شرط عمومی می‌تواند صدها اعلان هم‌زمان بسازد. کارت‌های صفحه به ۶
 * مورد و دفترچه به ۲۰۰ مورد محدود است؛ بنابراین بخشی از رخدادهای یک موج
 * بزرگ از دفترچه حذف می‌شود.»
 *
 * دو مسئلهٔ جدا بود و دو جواب دارد:
 *
 *   **دفترچه** حافظه است و نباید موج را ببلعد. حالا همهٔ ردیف‌ها در یک
 *   نوشتن ذخیره می‌شوند (نه صدبار خواندن و نوشتنِ پشت‌سرهم) و سقف هر
 *   دفتر به هزار رفته و بین دو تب مشترک نیست.
 *
 *   **صفحه** توجه است و موج، توجه را می‌کشد. صدها کارت یعنی هیچ‌کدام
 *   خوانده نمی‌شود. پس چند کارتِ نخست می‌آید و بقیه در یک کارتِ
 *   جمع‌بندی — که خودش می‌گوید چندتا بود و کجا کاملش هست.
 *
 * صدا هم یک بار پخش می‌شود، نه به تعداد ترکیب‌ها.
 */
export function deliverBurst(list = [], { host = null, sound = false, scope = 'radar', kind = 'gap', now = new Date() } = {}) {
  const fired = Array.isArray(list) ? list : [];
  if (!fired.length) return { shown: 0, logged: 0, rows: [] };
  const send = kind === 'watch' ? deliverWatch : deliver;
  const rows = [];
  let shown = 0;
  for (let at = 0; at < fired.length; at += 1) {
    const card = at < BURST_CARDS;
    if (card) shown += 1;
    // اعلانِ مرورگر و صدا فقط با کارتِ اول‌ها؛ بقیه فقط ردیفِ دفترچه‌اند.
    rows.push(send(fired[at], { host: card ? host : null, sound: sound && at === 0, scope, card, log: false, now }));
  }
  if (fired.length > BURST_CARDS && host) {
    const more = fired.length - BURST_CARDS;
    const node = document.createElement('article');
    node.className = 'gap-alarm-card';
    node.setAttribute('role', 'alert');
    node.innerHTML = `<header><b>${esc(`و ${fmt.int(more)} ترکیب دیگر در همین لحظه`)}</b><time>${faDigits(now.toLocaleTimeString('fa-IR'))}</time></header>
      <p>${esc(`این شرط در یک سنجش روی ${fmt.int(fired.length)} ترکیب برقرار شد. کارت‌ها به ${fmt.int(BURST_CARDS)} مورد محدود شده‌اند تا صفحه خوانا بماند؛ هر ${fmt.int(fired.length)} رخداد در دفترچهٔ همین تب ثبت شد.`)}</p>
      <small>${esc('اگر موج بزرگ است، شرط را تنگ‌تر کن یا دامنه‌اش را به یک استراتژی محدود کن.')}</small>
      <button type="button" class="gap-alarm-close" aria-label="بستن">×</button>`;
    node.querySelector('.gap-alarm-close').addEventListener('click', () => node.remove());
    host.prepend(node);
    while (host.children.length > 6) host.lastElementChild.remove();
  }
  writeLog([...rows, ...readLog(scope)], scope);
  return { shown, logged: rows.length, rows };
}
