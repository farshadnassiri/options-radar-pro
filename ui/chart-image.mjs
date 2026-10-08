// ذخیرهٔ تصویر برای همهٔ نمودارهای برنامه.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵): «برای همهٔ نمودارهای برنامه امکان ذخیره به
// صورت عکس را ایجاد کن. اسامی خروجی هر بخش متفاوت با دیگری باشد.»
//
// ═══ چرا یک ماژول سراسری، نه دکمه در هر نمودار ═══
//
// نمودارها سه گونه‌اند: ECharts (سیزده ماژول)، SVG دست‌ساز (سود و زیان،
// رد، شکاف، استرانگل بازی، …) و چند نمودار میله‌ای HTML. دکمه در تک‌تک‌شان
// یعنی ده‌ها جای تکراری که فردا یکی‌شان جا می‌ماند. پس این ماژول یک بار در
// `app.mjs` نصب می‌شود: موس که روی هر نمودار برود، دکمهٔ دوربین گوشه‌اش
// پیدا می‌شود — نمودارِ تازهٔ فردا هم بی هیچ کدی همین را دارد.
//
// ═══ نام فایل ═══
//
// «تب › زیرتب › عنوان بخش › عنوان نمودار › شناسهٔ نمودار › زمان شمسی». هر
// بخش نام خودش را دارد و دو نمودارِ یک بخش با شناسه یا شمارهٔ ترتیبشان از
// هم جدا می‌شوند؛ دو ذخیره در یک ثانیه هم پسوند «-۲» می‌گیرند.
//
// ═══ تصویر ═══
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۶): «فونت‌های فارسی را زیبا کن… مسیر عکس و
// تاریخ و ساعت را ننویس… در نمودار سری زمانی، عددِ روز آخر را روی محور
// عمودی بنویس و مواظب باش ارقام درهم نروند.» پس بالای تصویر فقط عنوانِ
// خودِ نمودار است (اگر نمودار عنوانِ خودش را ندارد)، نه مسیر تب و زمان
// ذخیره. عددِ روز آخرِ هر سری در برچسبی هم‌رنگِ سری کنار محور عمودی، در
// حاشیه‌ای بیرون از برچسب‌های محور، می‌نشیند و برچسب‌ها از هم فاصله
// می‌گیرند تا روی هم نیفتند.
//
// ECharts با `getDataURL`؛ SVG با کپی‌ای که رنگ‌های محاسبه‌شده (توکن‌های CSS)
// در آن نوشته شده؛ HTML با `foreignObject`. تصویرِ SVG به فونت‌های صفحه
// دسترسی ندارد، پس وزیرمتن به صورت داده درون همان SVG می‌نشیند؛ و SVG در
// دو برابر اندازه کشیده می‌شود تا تار نشود. اگر مرورگر بوم را آلوده بداند
// (برخی مرورگرها برای foreignObject)، همان SVG ذخیره می‌شود — بی‌صدا شکست
// نمی‌خورد.

import { saveBlob } from './save-file.mjs';
import { icon } from './icons.mjs';
import { fmt, faDigits, toEnDigits } from './fmt.mjs';

// ═══ بخش خالص (آزمون‌پذیر در نود) ═══

/**
 * تکهٔ نام فایل، فقط با حروف لاتین، رقم و خط تیره.
 *
 * ═══ چرا لاتین ═══
 *
 * در مرورگر سنجیده شد: هر نام فارسی در ویژگی `download` (حتی بی نیم‌فاصله)
 * به «download» برمی‌گردد — همهٔ تصویرها یک نام می‌گرفتند، درست برخلاف
 * خواسته. خروجی‌های دیگر برنامه هم نام لاتین دارند (`negah-baz-…`). پس نام
 * از شناسه‌های خود برنامه است (تب، زیرتب، نما، نمودار) و عنوان فارسی در
 * نوار بالای خودِ تصویر. تکهٔ فارسیِ بی‌معادل به یک کد کوتاهِ ثابت از
 * متنش تبدیل می‌شود تا دو بخشِ بی‌شناسه باز هم دو نام بگیرند.
 */
export function cleanNamePart(text = '') {
  const raw = String(text ?? '').trim();
  const latin = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (latin) return latin;
  if (!raw) return '';
  let h = 2166136261;
  for (const ch of raw) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return `s${h.toString(36).slice(0, 6)}`;
}

/** مهر زمان شمسی با رقم لاتین (نام فایل نباید رقم فارسی داشته باشد). */
export function jalaliStamp(date = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Tehran',
    }).formatToParts(date).map((p) => [p.type, p.value]));
    const year = String(parts.year || '').replace(/\D/g, '');
    if (!year) throw new Error('no persian calendar');
    return `${year}-${parts.month}-${parts.day}_${String(parts.hour).replace('24', '00')}${parts.minute}${parts.second}`;
  } catch {
    return date.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
  }
}

/**
 * نام فایل از تکه‌ها. تکهٔ تکراری (مثلاً عنوان بخش و عنوان نمودارِ یکسان) یک
 * بار می‌آید و تکهٔ خالی حذف می‌شود.
 */
export function chartImageName(parts = [], stamp = '') {
  const seen = new Set();
  const body = parts.map(cleanNamePart).filter((p) => p && !seen.has(p) && seen.add(p)).join('_');
  return `${body || 'chart'}_${stamp || jalaliStamp()}`;
}

/** پسوند «-۲»، «-۳»… برای نامی که در همین نشست دیده شده. */
export function uniqueName(base, used = new Map()) {
  const n = (used.get(base) || 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}


// ═══ عدد روز آخر روی محور عمودی ═══
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۶): «اگر نمودار سری زمانی است، اعداد روز آخر
// (جدیدترین روز) را روی محور عمودی بنویس… مواظب باش ارقام و نوشته‌ها درهم
// نروند.» پیش از این، آخرین داده در نوار متنیِ زیرِ تصویر می‌آمد، با تاریخ.

/** آیا برچسب محور افقی تاریخ یا زمان است؟ */
export function looksLikeTime(label) {
  const t = String(label ?? '').trim();
  return /^\d{8}$/.test(t) || /^\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(t) || /^[۰-۹]{4}\/[۰-۹]{1,2}\/[۰-۹]{1,2}/.test(t) || /^\d{1,2}:\d{2}/.test(t) || /^[۰-۹]{1,2}:[۰-۹]{2}/.test(t);
}

const tehranDay = (v) => {
  const d = new Date(v);
  return Number.isFinite(Number(d)) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d) : '';
};

/**
 * آیا دو نقطهٔ محور افقی از یک روزند؟ «روز آخر» یعنی روز، نه لحظه: در
 * نمودار درون‌روز دو خط که آخرین معامله‌شان چند دقیقه فاصله دارد هر دو مال
 * امروزند؛ ولی سری‌ای که دیروز تمام شده، عددِ روز آخر ندارد.
 */
export function sameDay(a, b, kind = 'category') {
  if (kind === 'time') { const da = tehranDay(a); return da !== '' && da === tehranDay(b); }
  const text = (v) => toEnDigits(String(v ?? '')).trim();
  const A = text(a), B = text(b);
  // برچسب ساعت (۰۹:۱۵) فقط در نمودار یک جلسه می‌آید.
  if (/^\d{1,2}:\d{2}/.test(A) && /^\d{1,2}:\d{2}/.test(B)) return true;
  const day = (t) => (/^\d{8}/.test(t) ? t.slice(0, 8) : (t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)?.slice(1).map(Number).join('-') ?? ''));
  const da = day(A);
  return da !== '' && da === day(B);
}

const finiteOf = (v) => (v === null || v === undefined || v === '' || v === '-' ? NaN : Number(v));

/**
 * آخرین نقطهٔ هر سری از گزینهٔ ECharts، اگر محور افقی زمان یا تاریخ است.
 * خروجی `{ x, kind: 'time'|'category', items: [{ name, value, x, stale, … }] }`
 * یا `null`. فقط عدد واقعی گزارش می‌شود؛ سری بی‌عدد کنار می‌رود. `stale`
 * یعنی آخرین عدد این سری از روزِ دیگری است.
 */
export function latestOfOption(option = {}) {
  const xAxis = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;
  if (!xAxis) return null;
  const cats = Array.isArray(xAxis.data) ? xAxis.data.map((d) => (d && typeof d === 'object' ? d.value : d)) : [];
  const isTime = xAxis.type === 'time';
  const isDateCat = !isTime && cats.length > 1 && looksLikeTime(cats[cats.length - 1]) && looksLikeTime(cats[0]);
  if (!isTime && !isDateCat) return null;
  let bestX = null, bestIdx = -1;
  const items = [];
  (option.series || []).forEach((series, seriesIndex) => {
    const data = Array.isArray(series?.data) ? series.data : [];
    if (!data.length || ['pie', 'gauge'].includes(series.type)) return;
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const raw = data[i] && typeof data[i] === 'object' && !Array.isArray(data[i]) ? data[i].value : data[i];
      let x, y;
      if (Array.isArray(raw)) {
        x = isTime ? raw[0] : cats[i];
        // شمع: [باز، بسته، کمینه، بیشینه] → «بسته»؛ نقطه: [x، y].
        y = series.type === 'candlestick' ? finiteOf(raw[1]) : finiteOf(isTime || raw.length === 2 ? raw[1] : raw[raw.length - 1]);
      } else { x = isTime ? NaN : cats[i]; y = finiteOf(raw); }
      if (!Number.isFinite(y)) continue;
      items.push({ name: String(series.name || '').trim(), value: y, x, seriesIndex, dataIndex: i, yAxisIndex: Number(series.yAxisIndex) || 0, stacked: Boolean(series.stack) });
      const order = isTime ? Number(new Date(x)) : i;
      if (order > bestIdx) { bestIdx = order; bestX = x; }
      break;
    }
  });
  const kind = isTime ? 'time' : 'category';
  for (const it of items) it.stale = !sameDay(it.x, bestX, kind);
  return items.length ? { x: bestX, kind, items } : null;
}

const numText = (v) => (Number.isInteger(v) ? fmt.int(v) : fmt.num(v));

/**
 * متن برچسبِ عدد روی محور. عدد دقیق است، نه گردشدهٔ برچسب‌های محور؛ ولی
 * نشانهٔ درصد اگر محور درصد است، می‌آید — «۱۲٫۳۵» تنها نه ریال است نه درصد.
 */
export function axisValueText(axis = {}, value) {
  let tick = '';
  try {
    const f = axis?.axisLabel?.formatter;
    tick = typeof f === 'function' ? String(f(value, 0) ?? '') : typeof f === 'string' ? f.replace('{value}', String(value)) : '';
  } catch { tick = ''; }
  return `${numText(value)}${/[٪%]/.test(tick) ? '٪' : ''}`;
}

/**
 * چیدن برچسب‌ها روی محور بی‌هم‌پوشانی. هر برچسب تا جای ممکن روی ارتفاع
 * عددش می‌ماند؛ برچسبِ هم‌پوشان پایین‌تر هل داده می‌شود و اگر از پایین
 * بیرون زد، از پایین به بالا جمع می‌شوند. برچسب‌هایی که در ارتفاع نمودار جا
 * نمی‌شوند (ترتیب سری‌ها) کنار می‌روند، نه روی هم.
 */
export function layoutAxisTags(tags = [], { top = 0, bottom = Infinity, size = 22, gap = 3 } = {}) {
  const step = size + gap, half = size / 2;
  const room = Number.isFinite(bottom) ? Math.max(1, Math.floor((bottom - top + gap) / step)) : tags.length;
  const out = tags.slice(0, room).map((t, i) => ({ ...t, i, at: Math.min(Math.max(t.y, top + half), bottom - half) }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  for (let k = 1; k < out.length; k += 1) if (out[k].at < out[k - 1].at + step) out[k].at = out[k - 1].at + step;
  if (out.length && out[out.length - 1].at > bottom - half) {
    out[out.length - 1].at = bottom - half;
    for (let k = out.length - 2; k >= 0; k -= 1) if (out[k].at > out[k + 1].at - step) out[k].at = out[k + 1].at - step;
  }
  return out;
}

/** رنگِ هگز (سه یا شش رقمی) یا تابعیِ rgb/rgba → [r, g, b]؛ ناشناخته → null. */
export function parseRgb(color = '') {
  const c = String(color).trim();
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16));
  m = c.match(/^#([0-9a-f]{6})/i);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return m ? m.slice(1, 4).map(Number) : null;
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** از میان رنگ‌های نامزد (توکن‌ها)، آنکه روی `bg` بیشترین تضاد را دارد. */
export function inkOn(bg, candidates = []) {
  const back = parseRgb(bg);
  if (!back) return candidates[0] || '';
  const lb = luminance(back);
  let best = candidates[0] || '', bestRatio = -1;
  for (const c of candidates) {
    const rgb = parseRgb(c);
    if (!rgb) continue;
    const l = luminance(rgb);
    const ratio = (Math.max(l, lb) + 0.05) / (Math.min(l, lb) + 0.05);
    if (ratio > bestRatio) { bestRatio = ratio; best = c; }
  }
  return best;
}

// ═══ بخش رابط ═══

const SVG_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility', 'display', 'paint-order', 'color'];
const MIN_W = 160, MIN_H = 80;
const TAG_H = 22, TAG_PAD = 8, TAG_ARROW = 6;
const usedNames = new Map();

const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

/** عنصری که هرگز نمودار نیست: خودِ صفحه و ظرف‌های بزرگ آن. */
const NEVER_CHART = (node) => !node || node === document.body || node === document.documentElement
  || node.id === 'stage' || node.matches?.('main, header, nav, aside, .rail, .topbar');

/** آیا این عنصر نمودار است (نه آیکون، نه کندل کوچک داخل دکمه، نه خود صفحه)؟ */
function chartOf(target) {
  const node = target?.closest?.(CHART_SELECTOR);
  if (NEVER_CHART(node) || node.closest('.chart-cam, button, .ic, .tab-btn, header, nav')) return null;
  if (node.tagName?.toLowerCase() === 'svg') {
    // svgِ داخل یک نمودار ECharts مال خودِ ECharts است.
    const host = node.closest('[_echarts_instance_]');
    if (host) return host;
  }
  const box = node.getBoundingClientRect();
  return box.width >= MIN_W && box.height >= MIN_H ? node : null;
}

const HTML_CHARTS = '.decision-bars, .live-breadth-bars, .live-breadth-donut, .live-mover-bars, .market-bars, .vr-gauges, [data-chart-image]';
const CHART_SELECTOR = `[_echarts_instance_], svg, ${HTML_CHARTS}`;

/** اولین مقدار لاتینِ ویژگی‌های data-* یک عنصر (شناسهٔ نمودار یا نما). */
const latinData = (el) => [...(el?.attributes || [])]
  .filter((a) => a.name.startsWith('data-') && !['data-chart-image', 'data-chart-marks', 'data-enhanced'].includes(a.name))
  .map((a) => a.value).find((v) => /^[a-z][a-z0-9-]{1,30}$/i.test(v)) || '';

/** رنگ قابل‌استفاده در بوم: `var(--x)` از خود صفحه خوانده می‌شود، شیب → رنگ آخرش. */
function plainColor(color) {
  if (color && typeof color === 'object') return plainColor(color.colorStops?.at(-1)?.color);
  if (!color || typeof color !== 'string') return '';
  if (!color.includes('var(')) return color;
  const probe = document.createElement('span');
  probe.style.color = color;
  document.body.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
}

/** عدد روز آخرِ هر سریِ ECharts، با ارتفاعش روی محور (پیکسل نمودار). */
function echartsMarks(chart, option) {
  const latest = latestOfOption(option);
  if (!latest) return [];
  const model = chart.getModel?.();
  const legend = (Array.isArray(option.legend) ? option.legend[0] : option.legend)?.selected || {};
  const yAxes = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis || {}];
  const marks = [];
  for (const it of latest.items) {
    // سریِ روی‌هم‌چیده ارتفاعِ عددِ خودش را ندارد؛ سریِ پنهان در تصویر نیست.
    if (it.stale || it.stacked || legend[it.name] === false) continue;
    try {
      const y = chart.convertToPixel({ yAxisIndex: it.yAxisIndex }, it.value);
      const axis = model?.getComponent('yAxis', it.yAxisIndex)?.axis;
      const rect = axis?.grid?.getRect?.();
      if (!Number.isFinite(y) || (rect && (y < rect.y - 1 || y > rect.y + rect.height + 1))) continue;
      const data = model?.getSeriesByIndex(it.seriesIndex)?.getData();
      const style = data?.getItemVisual?.(it.dataIndex, 'style') || data?.getVisual?.('style') || {};
      const line = option.series[it.seriesIndex]?.type === 'line';
      marks.push({
        side: axis?.position === 'right' ? 'right' : 'left', y,
        top: rect ? rect.y : 0, bottom: rect ? rect.y + rect.height : Infinity,
        text: axisValueText(yAxes[it.yAxisIndex], it.value),
        color: plainColor(line ? style.stroke || style.fill : style.fill || style.stroke),
      });
    } catch { /* یک سریِ ناجور؛ بقیه می‌مانند */ }
  }
  return marks;
}

/**
 * نمودارهای SVGِ زمانی عدد روز آخر را خودشان در `data-chart-marks` می‌گذارند
 * (مختصات viewBox)؛ اینجا به پیکسلِ نمودارِ روی صفحه برگردانده می‌شود.
 */
function svgMarks(node) {
  const holder = node.hasAttribute?.('data-chart-marks') ? node : node.querySelector?.('[data-chart-marks]');
  if (!holder) return [];
  let spec;
  try { spec = JSON.parse(holder.getAttribute('data-chart-marks')); } catch { return []; }
  const svg = holder.tagName.toLowerCase() === 'svg' ? holder : holder.closest('svg');
  const vb = svg?.viewBox?.baseVal, box = svg.getBoundingClientRect(), host = node.getBoundingClientRect();
  const s = vb?.width ? Math.min(box.width / vb.width, box.height / vb.height) : 1;
  const offY = (box.top - host.top) + (vb?.width ? (box.height - vb.height * s) / 2 - vb.y * s : 0);
  const at = (y) => offY + y * s;
  return (spec.marks || []).filter((m) => Number.isFinite(m.y) && m.text).map((m) => ({
    side: spec.side === 'right' ? 'right' : 'left', y: at(m.y),
    top: Number.isFinite(spec.top) ? at(spec.top) : 0, bottom: Number.isFinite(spec.bottom) ? at(spec.bottom) : Infinity,
    text: String(m.text), color: plainColor(m.color),
  }));
}

/** عنوانِ تصویر و تکه‌های نام فایل. مسیر تب و زمانِ ذخیره در تصویر نمی‌آید. */
async function describe(node) {
  const tabBtn = document.querySelector('.tab-btn[aria-current="true"]');
  const tabId = tabBtn?.dataset.tab || String(location.hash || '').replace('#', '').split('!')[0];
  const subBtn = document.querySelector('#stage [role="tab"][aria-selected="true"]');
  const section = node.closest('.card, section, article, details, .decision-mode') || node.parentElement;
  const viewBtn = section?.closest('[data-mode-panel]')?.querySelector('[data-view][aria-pressed="true"]');
  const viewId = viewBtn?.dataset.view || '';
  const heading = textOf(section?.querySelector('h1, h2, h3, h4, summary'));
  let chartTitle = '', marks = [];
  if (node.hasAttribute('_echarts_instance_')) {
    const echarts = await import('/vendor/echarts/echarts.esm.min.js').catch(() => null);
    const chart = echarts?.getInstanceByDom(node);
    const option = chart?.getOption() || {};
    const title = option.title;
    chartTitle = textOf({ textContent: (Array.isArray(title) ? title[0]?.text : title?.text) || '' });
    if (chart) marks = echartsMarks(chart, option);
  } else marks = svgMarks(node);
  // شناسهٔ خودِ نمودار یا نزدیک‌ترین نیایی که شناسهٔ لاتین دارد.
  let chartId = latinData(node);
  for (let up = node.parentElement; !chartId && up && up !== section; up = up.parentElement) chartId = latinData(up) || (up.id && /^[a-z][\w-]*$/i.test(up.id) ? up.id : '');
  // راهنمای رنگ نمودارهای SVG بیرون از خودِ SVG است؛ بی آن، خط‌های تصویر بی‌نام‌اند.
  const legend = [];
  if (!node.hasAttribute('_echarts_instance_')) {
    let box = null;
    for (let up = node.parentElement, k = 0; up && k < 3 && !box; up = up.parentElement, k += 1) {
      box = [...up.children].find((c) => !c.contains(node) && /legend/.test(String(c.className || '')));
    }
    for (const item of box ? [...box.children] : []) {
      const swatch = item.querySelector('i') || item;
      const color = getComputedStyle(swatch).backgroundColor;
      const text = textOf(item);
      if (text) legend.push({ text, color: color && !/rgba\(0, 0, 0, 0\)|transparent/.test(color) ? color : '' });
    }
  }
  const all = [...document.querySelectorAll(CHART_SELECTOR)].filter((n) => chartOf(n) === n);
  const order = all.length > 1 ? `chart-${all.indexOf(node) + 1}` : '';
  const label = node.getAttribute('aria-label') || node.dataset.chartImage || '';
  return {
    // شناسهٔ نما (مثلاً breadth-pct) خودش نمودار را مشخص می‌کند؛ کد عنوان و ترتیب فقط وقتی هیچ شناسه‌ای نیست.
    parts: [tabId, subBtn?.dataset.mode || latinData(subBtn), viewId, chartId || (viewId ? '' : heading), chartId || viewId ? '' : chartTitle || label, chartId || viewId ? '' : order],
    // نمودار ECharts عنوانِ خودش را درون تصویر دارد؛ تکرارش لازم نیست.
    title: chartTitle ? '' : heading || label,
    marks, legend,
  };
}

function inlineSvgStyles(source, clone) {
  const a = [source, ...source.querySelectorAll('*')], b = [clone, ...clone.querySelectorAll('*')];
  a.forEach((el, i) => {
    const cs = getComputedStyle(el), out = b[i];
    if (!out) return;
    out.setAttribute('style', SVG_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  });
}

function inlineHtmlStyles(source, clone) {
  const a = [source, ...source.querySelectorAll('*')], b = [clone, ...clone.querySelectorAll('*')];
  a.forEach((el, i) => {
    const cs = getComputedStyle(el), out = b[i];
    if (!out) return;
    let css = '';
    for (let k = 0; k < cs.length; k += 1) { const p = cs[k]; css += `${p}:${cs.getPropertyValue(p)};`; }
    out.setAttribute('style', css);
  });
}

// ═══ قلم فارسی در تصویر ═══
//
// تصویرِ SVG (و foreignObject) جدا از صفحه کشیده می‌شود و به فونت وب صفحه
// دسترسی ندارد؛ متن فارسی‌اش با فونت پیش‌فرض سیستم و رقم‌ها ناخوانا
// درمی‌آمد. پس پروندهٔ وزیرمتن با همان وزن‌هایی که نمودار به کار برده، به صورت
// داده درون SVG گذاشته می‌شود. نشد (شبکه)، تصویر با فونت سیستم ساخته می‌شود.

const fontCache = new Map();

const asDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

async function fontFaceCss(weights) {
  const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => /vazirmatn/i.test(l.href));
  if (!link) return '';
  if (!fontCache.has(link.href)) fontCache.set(link.href, fetch(link.href).then((r) => r.text()).catch(() => ''));
  const css = await fontCache.get(link.href);
  const faces = (css.match(/@font-face\s*\{[^}]*\}/g) || []).map((block) => ({
    family: block.match(/font-family:\s*([^;]+);/)?.[1]?.trim(),
    weight: Number(block.match(/font-weight:\s*(\d+)/)?.[1]) || 400,
    url: block.match(/url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/)?.[1],
    italic: /font-style:\s*italic/.test(block),
  })).filter((f) => f.family && f.url && !f.italic);
  if (!faces.length) return '';
  // برای هر وزنِ به‌کاررفته، نزدیک‌ترین وزنی که پرونده دارد.
  const pick = new Set([...weights].map((w) => faces.reduce((a, b) => (Math.abs(b.weight - w) < Math.abs(a.weight - w) ? b : a))));
  const rules = await Promise.all([...pick].map(async (face) => {
    const url = new URL(face.url, link.href).href;
    if (!fontCache.has(url)) fontCache.set(url, fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then(asDataUrl).catch(() => ''));
    const data = await fontCache.get(url);
    return data ? `@font-face{font-family:${face.family};font-weight:${face.weight};font-style:normal;src:url(${data}) format("woff2");}` : '';
  }));
  return rules.join('');
}

const usedWeights = (root) => new Set([root, ...root.querySelectorAll('*')].map((el) => Number(getComputedStyle(el).fontWeight) || 400));

/** صبر برای بارگذاری وزیرمتن، تا بوم با فونتِ پشتیبان ننویسد. */
async function fontsReady(font) {
  try {
    await Promise.race([
      Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 13px ${font}`, 'آزمون ۱۲۳'))).then(() => document.fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch { /* بی فونت هم تصویر ساخته می‌شود */ }
}

/** نمودار → { url, width, height, svgText? } در اندازهٔ صفحه. */
async function snapshot(node) {
  const box = node.getBoundingClientRect();
  const width = Math.ceil(box.width), height = Math.ceil(box.height);
  const bg = getComputedStyle(document.body).getPropertyValue('--panel').trim() || getComputedStyle(document.body).backgroundColor;
  if (node.hasAttribute('_echarts_instance_')) {
    const echarts = await import('/vendor/echarts/echarts.esm.min.js');
    const chart = echarts.getInstanceByDom(node);
    chart.dispatchAction({ type: 'hideTip' });
    return { url: chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg }), width, height };
  }
  const faces = await fontFaceCss(usedWeights(node)).catch(() => '');
  const style = faces ? `<style>${faces}</style>` : '';
  let svgText;
  if (node.tagName.toLowerCase() === 'svg') {
    const clone = node.cloneNode(true);
    inlineSvgStyles(node, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // دو برابر اندازه، با همان viewBox: تصویر روی بومِ دوبرابر تار نمی‌شود.
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clone.setAttribute('width', String(width * 2));
    clone.setAttribute('height', String(height * 2));
    svgText = new XMLSerializer().serializeToString(clone);
    if (style) svgText = svgText.replace(/^(<svg[^>]*>)/, `$1${style}`);
  } else {
    // ظرفِ بزرگ (صدها گره) تصویر نمی‌شود؛ مرورگر را قفل می‌کرد.
    if (node.querySelectorAll('*').length > 1500) throw new Error('این بخش برای تصویر بیش از حد بزرگ است');
    const clone = node.cloneNode(true);
    inlineHtmlStyles(node, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const html = new XMLSerializer().serializeToString(clone);
    svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width} ${height}">${style}<foreignObject x="0" y="0" width="${width}" height="${height}">${html}</foreignObject></svg>`;
  }
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`, width, height, svgText };
}

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('تصویر نمودار ساخته نشد'));
  img.src = url;
});

/** متنِ دارای حرف فارسی راست‌به‌چپ کشیده می‌شود؛ عددِ تنها چپ‌به‌راست تا منفی جابه‌جا نشود. */
const dirOf = (text) => (/[\u0600-\u06ff]/.test(String(text).replace(/[\u06f0-\u06f9\u066a-\u066c]/g, '')) ? 'rtl' : 'ltr');

/**
 * متنی که در پهنا جا نمی‌شود با «…» کوتاه می‌شود. پارامتر چهارمِ `fillText`
 * متن را فشرده می‌کرد و حرف‌های فارسی له و ناخوانا می‌شدند.
 */
function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

/**
 * برچسب‌های عدد روز آخر در حاشیهٔ کنار محور: هر برچسب هم‌رنگ سری‌اش، با
 * نوکی که به ارتفاعِ واقعیِ عدد اشاره می‌کند. حاشیه بیرون از تصویرِ نمودار
 * است، پس روی برچسب‌های خودِ محور و روی خط‌ها نمی‌افتد.
 */
function drawAxisTags(ctx, marks, side, { chartX, chartY, chartW, widthOf, font, inks, fallback }) {
  const top = Math.min(...marks.map((m) => m.top));
  const bottom = Math.max(...marks.map((m) => m.bottom));
  const laid = layoutAxisTags(marks, { top: Math.max(0, top), bottom, size: TAG_H });
  ctx.font = `700 12px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (const m of laid) {
    const w = widthOf(m.text), color = m.color || fallback;
    const edge = side === 'left' ? chartX - 2 : chartX + chartW + 2;
    const x = side === 'left' ? edge - TAG_ARROW - w : edge + TAG_ARROW;
    const cy = chartY + m.at, tipY = chartY + Math.min(Math.max(m.y, m.top), m.bottom);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, cy - TAG_H / 2, w, TAG_H, 5); else ctx.rect(x, cy - TAG_H / 2, w, TAG_H);
    ctx.fill();
    // نوک: از لبهٔ برچسب تا ارتفاعِ واقعیِ عدد (اگر برچسب برای فاصله جابه‌جا شده، باز همان‌جا را نشان می‌دهد).
    const base = side === 'left' ? x + w : x;
    ctx.beginPath();
    ctx.moveTo(base, cy - 5); ctx.lineTo(edge, tipY); ctx.lineTo(base, cy + 5); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = inkOn(ctx.fillStyle, inks);
    ctx.direction = dirOf(m.text);
    ctx.fillText(m.text, x + w / 2, cy + 1);
  }
}

/** ذخیرهٔ یک نمودار به PNG. `extraTitle` برای دکمه‌های خودِ تب‌ها. */
export async function saveChartImage(node, { extraTitle = '' } = {}) {
  const target = node.hasAttribute?.('_echarts_instance_') ? node : (node.querySelector?.('[_echarts_instance_]') || node);
  const style = getComputedStyle(document.body);
  const font = style.getPropertyValue('--font').trim() || style.getPropertyValue('--sans').trim() || style.fontFamily || 'sans-serif';
  await fontsReady(font);
  const info = await describe(target);
  const name = uniqueName(chartImageName([...info.parts, extraTitle], jalaliStamp()), usedNames);
  const shot = await snapshot(target);
  const ink = style.getPropertyValue('--ink').trim(), muted = style.getPropertyValue('--muted').trim();
  const bg = style.getPropertyValue('--panel').trim() || style.backgroundColor;
  const ratio = 2;
  // توکن‌ها به رنگِ بوم (hex/rgb) برگردانده می‌شوند تا تضادِ متنِ برچسب سنجیدنی باشد.
  const norm = document.createElement('canvas').getContext('2d');
  const canvasColor = (c) => { if (c) norm.fillStyle = c; return norm.fillStyle; };
  try {
    const img = await loadImage(shot.url);
    const measure = document.createElement('canvas').getContext('2d');
    // حاشیهٔ برچسب‌های محور: پهنای بلندترین برچسبِ همان سمت.
    measure.font = `700 12px ${font}`;
    const widthOf = (text) => Math.ceil(measure.measureText(text).width) + TAG_PAD * 2;
    const sideMarks = { left: info.marks.filter((m) => m.side === 'left'), right: info.marks.filter((m) => m.side === 'right') };
    const gutter = (list) => (list.length ? Math.max(...list.map((m) => widthOf(m.text))) + TAG_ARROW + 8 : 0);
    const leftG = gutter(sideMarks.left), rightG = gutter(sideMarks.right);
    const W = leftG + shot.width + rightG;
    const headH = info.title ? 34 : 0;
    const legendH = info.legend?.length ? 24 : 0;
    const H = headH + legendH + shot.height + 6;
    const canvas = document.createElement('canvas');
    canvas.width = W * ratio; canvas.height = H * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    if (info.title) {
      ctx.fillStyle = ink; ctx.font = `700 15px ${font}`;
      ctx.fillText(fitText(ctx, info.title, W - 24), W - 12, 9);
    }
    if (legendH) {
      // راهنما از راست به چپ: مربع رنگ، بعد نام.
      ctx.font = `13px ${font}`;
      let xr = W - 12;
      for (const item of info.legend) {
        if (item.color) { ctx.fillStyle = item.color; ctx.fillRect(xr - 10, headH + 6, 10, 10); xr -= 16; }
        ctx.fillStyle = ink; ctx.fillText(item.text, xr, headH + 3);
        xr -= ctx.measureText(item.text).width + 18;
        if (xr < 40) break;
      }
    }
    const chartY = headH + legendH;
    ctx.drawImage(img, leftG, chartY, shot.width, shot.height);
    for (const side of ['left', 'right']) {
      if (sideMarks[side].length) drawAxisTags(ctx, sideMarks[side], side, { chartX: leftG, chartY, chartW: shot.width, widthOf, font, inks: [canvasColor(bg), canvasColor(ink)], fallback: muted || ink });
    }
    const blob = await new Promise((resolve, reject) => {
      try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png'); } catch (error) { reject(error); }
    });
    saveBlob(blob, `${name}.png`);
    return `${name}.png`;
  } catch (error) {
    // بوم آلوده (foreignObject در برخی مرورگرها): همان SVG، نه شکستِ بی‌صدا.
    if (shot.svgText) {
      saveBlob(new Blob([shot.svgText], { type: 'image/svg+xml' }), `${name}.svg`);
      return `${name}.svg`;
    }
    throw error;
  }
}
/** نصب سراسری: دکمهٔ دوربین روی هر نموداری که موس رویش برود. */
export function installChartImageSaver(root = document.body) {
  // ═══ نشانهٔ نصب نباید خودش «نمودار» باشد ═══
  //
  // گزارش صاحب پروژه: «برنامه درست کار نمی‌کند، آیکون عکس رفته آن بالا.»
  // نسخهٔ قبل `data-chart-image` را روی body می‌گذاشت — همان ویژگی‌ای که
  // نمودار HTML را می‌شناساند. پس کل صفحه «نمودار» شد، دوربین روی دکمهٔ
  // پوسته در گوشهٔ صفحه نشست، و کلیکش می‌خواست کل صفحه را تصویر کند.
  if (!root || root.dataset?.chartCam === 'on') return () => {};
  root.dataset.chartCam = 'on';
  const cam = document.createElement('button');
  cam.type = 'button';
  cam.className = 'chart-cam';
  cam.title = 'ذخیرهٔ تصویر این نمودار';
  cam.setAttribute('aria-label', 'ذخیرهٔ تصویر این نمودار');
  cam.innerHTML = icon('camera');
  cam.hidden = true;
  document.body.appendChild(cam);
  let current = null, hideTimer = 0;
  const place = (node) => {
    const box = node.getBoundingClientRect();
    cam.style.top = `${Math.max(4, box.top + 6)}px`;
    cam.style.left = `${Math.max(4, box.left + 6)}px`;
  };
  const show = (node) => {
    clearTimeout(hideTimer);
    current = node; place(node); cam.hidden = false;
  };
  const hideSoon = () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => { cam.hidden = true; current = null; }, 600); };
  const onOver = (event) => {
    if (event.target === cam || cam.contains(event.target)) { clearTimeout(hideTimer); return; }
    const node = chartOf(event.target);
    if (node) show(node); else if (current && !current.contains(event.target)) hideSoon();
  };
  const onScroll = () => { if (current && !cam.hidden) place(current); };
  const onClick = async () => {
    if (!current) return;
    cam.disabled = true;
    try { await saveChartImage(current); } catch (error) { cam.title = `ذخیره نشد: ${error.message}`; } finally { cam.disabled = false; }
  };
  root.addEventListener('mouseover', onOver);
  window.addEventListener('scroll', onScroll, true);
  cam.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('mouseover', onOver);
    window.removeEventListener('scroll', onScroll, true);
    cam.remove();
    delete root.dataset.chartCam;
  };
}
