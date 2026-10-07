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
// بالای هر تصویر نوار عنوان (همان مسیر بخش + تاریخ و ساعت) کشیده می‌شود تا
// تصویرِ بیرون‌رفته از برنامه بگوید از کجا آمده. ECharts با `getDataURL`؛
// SVG با کپی‌ای که رنگ‌های محاسبه‌شده (توکن‌های CSS) در آن نوشته شده؛ HTML با
// `foreignObject`. اگر مرورگر بوم را آلوده بداند (برخی مرورگرها برای
// foreignObject)، همان SVG ذخیره می‌شود — بی‌صدا شکست نمی‌خورد.

import { saveBlob } from './save-file.mjs';
import { icon } from './icons.mjs';
import { fmt, faDigits } from './fmt.mjs';
import { historyDateLabel } from '../core/history.mjs';

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

// ═══ آخرین دادهٔ نمودارهای زمانی ═══
//
// خواستهٔ صاحب پروژه: «برای نمودارهایی که سری زمانی و تاریخی هستند، مشخصات
// آخرین و جدیدترین دادهٔ نمودار داخل عکس باشد… مواظب باش روی نمودار قرار
// نگیرد.» پس آخرین نقطه در نوار پایینِ زیرِ نمودار نوشته می‌شود، نه روی آن.

/** آیا برچسب محور افقی تاریخ یا زمان است؟ */
export function looksLikeTime(label) {
  const t = String(label ?? '').trim();
  return /^\d{8}$/.test(t) || /^\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(t) || /^[۰-۹]{4}\/[۰-۹]{1,2}\/[۰-۹]{1,2}/.test(t) || /^\d{1,2}:\d{2}/.test(t) || /^[۰-۹]{1,2}:[۰-۹]{2}/.test(t);
}

const finiteOf = (v) => (v === null || v === undefined || v === '' || v === '-' ? NaN : Number(v));

/**
 * آخرین نقطهٔ هر سری از گزینهٔ ECharts، اگر محور افقی زمان یا تاریخ است.
 * خروجی `{ x, kind: 'time'|'category', items: [{ name, value }] }` یا `null`.
 * فقط عدد واقعی گزارش می‌شود؛ سری بی‌عدد کنار می‌رود.
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
  for (const series of option.series || []) {
    const data = Array.isArray(series?.data) ? series.data : [];
    if (!data.length || ['pie', 'gauge'].includes(series.type)) continue;
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const raw = data[i] && typeof data[i] === 'object' && !Array.isArray(data[i]) ? data[i].value : data[i];
      let x, y;
      if (Array.isArray(raw)) {
        x = isTime ? raw[0] : cats[i];
        // شمع: [باز، بسته، کمینه، بیشینه] → «بسته»؛ نقطه: [x، y].
        y = series.type === 'candlestick' ? finiteOf(raw[1]) : finiteOf(isTime || raw.length === 2 ? raw[1] : raw[raw.length - 1]);
      } else { x = isTime ? NaN : cats[i]; y = finiteOf(raw); }
      if (!Number.isFinite(y)) continue;
      items.push({ name: String(series.name || '').trim(), value: y, x });
      const order = isTime ? Number(new Date(x)) : i;
      if (order > bestIdx) { bestIdx = order; bestX = x; }
      break;
    }
  }
  // سری‌ای که آخرین عددش از روز/لحظهٔ دیگری است، تاریخ خودش را کنارش دارد.
  const same = (a, b) => (isTime ? Number(new Date(a)) === Number(new Date(b)) : String(a) === String(b));
  for (const it of items) it.stale = !same(it.x, bestX);
  return items.length ? { x: bestX, kind: isTime ? 'time' : 'category', items } : null;
}

/** متن فارسی آخرین داده برای نوار پایین تصویر. */
export function latestText(latest) {
  if (!latest) return '';
  const x = latest.x;
  const whenOf = (v) => (latest.kind === 'time'
    ? (Number.isFinite(Number(new Date(v))) ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(v)) : '')
    : /^\d{8}$/.test(String(v)) ? faDigits(historyDateLabel(Number(v))) : faDigits(String(v ?? '')));
  const when = whenOf(x);
  const num = (v) => (Number.isInteger(v) ? fmt.int(v) : fmt.num(v));
  const vals = latest.items.slice(0, 8).map((it) => `${it.name || 'مقدار'}: ${num(it.value)}${it.stale ? ` (${whenOf(it.x)})` : ''}`).join(' · ');
  return `آخرین داده${when ? ` (${when})` : ''} — ${vals}${latest.items.length > 8 ? ' …' : ''}`;
}

// ═══ بخش رابط ═══

const SVG_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility', 'display', 'paint-order', 'color'];
const MIN_W = 160, MIN_H = 80;
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
  .filter((a) => a.name.startsWith('data-') && !['data-chart-image', 'data-chart-latest', 'data-enhanced'].includes(a.name))
  .map((a) => a.value).find((v) => /^[a-z][a-z0-9-]{1,30}$/i.test(v)) || '';

/** مسیر نام: شناسهٔ تب، زیرتب، نما، نمودار؛ و مسیر فارسی برای نوار عنوان. */
async function describe(node) {
  const tabBtn = document.querySelector('.tab-btn[aria-current="true"]');
  const tab = textOf(tabBtn) || String(document.title || '').split(' — ')[0];
  const tabId = tabBtn?.dataset.tab || String(location.hash || '').replace('#', '').split('!')[0];
  const subBtn = document.querySelector('#stage [role="tab"][aria-selected="true"]');
  const sub = textOf(subBtn?.querySelector('b') || subBtn);
  const section = node.closest('.card, section, article, details, .decision-mode') || node.parentElement;
  const viewBtn = section?.closest('[data-mode-panel]')?.querySelector('[data-view][aria-pressed="true"]');
  const viewId = viewBtn?.dataset.view || '';
  const heading = textOf(section?.querySelector('h1, h2, h3, h4, summary'));
  let chartTitle = '', latest = '';
  if (node.hasAttribute('_echarts_instance_')) {
    const echarts = await import('/vendor/echarts/echarts.esm.min.js').catch(() => null);
    const option = echarts?.getInstanceByDom(node)?.getOption() || {};
    const title = option.title;
    chartTitle = textOf({ textContent: (Array.isArray(title) ? title[0]?.text : title?.text) || '' });
    latest = latestText(latestOfOption(option));
  }
  // نمودارهای SVGِ زمانی آخرین نقطه را خودشان در `data-chart-latest` می‌گذارند.
  if (!latest) latest = node.dataset?.chartLatest || node.closest('[data-chart-latest]')?.dataset.chartLatest || '';
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
    header: [tab, sub, heading, chartTitle || label].filter(Boolean).join(' › '),
    latest, legend,
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

/** نمودار → { url, width, height, svgText? } در اندازهٔ صفحه. */
async function snapshot(node) {
  const box = node.getBoundingClientRect();
  const width = Math.ceil(box.width), height = Math.ceil(box.height);
  const bg = getComputedStyle(document.body).getPropertyValue('--panel').trim() || getComputedStyle(document.body).backgroundColor;
  if (node.hasAttribute('_echarts_instance_')) {
    const echarts = await import('/vendor/echarts/echarts.esm.min.js');
    const chart = echarts.getInstanceByDom(node);
    chart.dispatchAction({ type: 'hideTip' });
    return { url: chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg }), width, height, scale: 2 };
  }
  let svgText;
  if (node.tagName.toLowerCase() === 'svg') {
    const clone = node.cloneNode(true);
    inlineSvgStyles(node, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    svgText = new XMLSerializer().serializeToString(clone);
  } else {
    // ظرفِ بزرگ (صدها گره) تصویر نمی‌شود؛ مرورگر را قفل می‌کرد.
    if (node.querySelectorAll('*').length > 1500) throw new Error('این بخش برای تصویر بیش از حد بزرگ است');
    const clone = node.cloneNode(true);
    inlineHtmlStyles(node, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    const html = new XMLSerializer().serializeToString(clone);
    svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${html}</foreignObject></svg>`;
  }
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`, width, height, scale: 1, svgText };
}

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('تصویر نمودار ساخته نشد'));
  img.src = url;
});

/** ذخیرهٔ یک نمودار به PNG با نوار عنوان. `extraTitle` برای دکمه‌های خودِ تب‌ها. */
export async function saveChartImage(node, { extraTitle = '' } = {}) {
  const target = node.hasAttribute?.('_echarts_instance_') ? node : (node.querySelector?.('[_echarts_instance_]') || node);
  const info = await describe(target);
  const name = uniqueName(chartImageName([...info.parts, extraTitle], jalaliStamp()), usedNames);
  const shot = await snapshot(target);
  const style = getComputedStyle(document.body);
  const ink = style.getPropertyValue('--ink').trim(), muted = style.getPropertyValue('--muted').trim();
  const bg = style.getPropertyValue('--panel').trim() || style.backgroundColor;
  const font = style.getPropertyValue('--font').trim() || 'sans-serif';
  const ratio = 2, headH = 46;
  try {
    const img = await loadImage(shot.url);
    // نوار «آخرین داده» زیرِ نمودار؛ خطوطش از پیش شکسته می‌شوند تا ارتفاع
    // بوم درست باشد و چیزی روی نمودار ننشیند.
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `12px ${font}`;
    const footLines = [];
    if (info.latest) {
      let line = '';
      for (const word of info.latest.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (measure.measureText(next).width > shot.width - 24 && line) { footLines.push(line); line = word; } else line = next;
      }
      if (line) footLines.push(line);
    }
    const footH = footLines.length ? footLines.length * 18 + 14 : 0;
    const legendH = info.legend?.length ? 22 : 0;
    const canvas = document.createElement('canvas');
    canvas.width = shot.width * ratio; canvas.height = (shot.height + headH + legendH + footH) * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, shot.width, shot.height + headH + legendH + footH);
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = ink; ctx.font = `700 14px ${font}`;
    ctx.fillText(info.header || 'نمودار', shot.width - 12, 8, shot.width - 24);
    ctx.fillStyle = muted; ctx.font = `12px ${font}`;
    ctx.fillText(new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date()), shot.width - 12, 27, shot.width - 24);
    if (legendH) {
      // راهنما از راست به چپ: مربع رنگ، بعد نام.
      ctx.font = `12px ${font}`;
      let xr = shot.width - 12;
      for (const item of info.legend) {
        if (item.color) { ctx.fillStyle = item.color; ctx.fillRect(xr - 10, headH + 4, 10, 10); xr -= 16; }
        ctx.fillStyle = ink; ctx.fillText(item.text, xr, headH + 2);
        xr -= ctx.measureText(item.text).width + 18;
        if (xr < 40) break;
      }
    }
    ctx.drawImage(img, 0, headH + legendH, shot.width, shot.height);
    if (footLines.length) {
      const y0 = headH + legendH + shot.height;
      ctx.strokeStyle = style.getPropertyValue('--line').trim() || muted;
      ctx.beginPath(); ctx.moveTo(12, y0 + 4); ctx.lineTo(shot.width - 12, y0 + 4); ctx.stroke();
      ctx.fillStyle = ink; ctx.font = `12px ${font}`;
      footLines.forEach((text, i) => ctx.fillText(text, shot.width - 12, y0 + 10 + i * 18, shot.width - 24));
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
