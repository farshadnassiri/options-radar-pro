// ده پنل تحلیلی بک‌تست سریع.
//
// پرسش این تب یکی است و همهٔ این پنل‌ها یک تکه از جوابش‌اند:
//
//   «این استراتژی در طول عمرش چطور به سود یا زیان رسید، و چه چیزی آن را
//    ساخت؟»
//
// چیدمان پنل‌ها از همان جواب می‌آید و ترتیبش تصادفی نیست:
//
//   یونانی‌ها      — حساسیت موقعیت در هر لحظه چه بود
//   تجزیه          — سود و زیانِ رخ‌داده به همان حساسیت‌ها شکسته می‌شود
//   حساسیت         — و اگر بازار جور دیگری رفته بود، چه می‌شد
//   اثر زمان / تلاطم / پایه — هر عامل، جدا و موشکافانه
//   سهم پاها       — کدام پا ساخت و کدام خورد
//   ریسک و افت     — راه چقدر ناهموار بود
//   نقاط عطف       — سود کجا ساخته شد، نه به‌طور میانگین بلکه دقیقاً کجا
//   الگو           — و همهٔ این‌ها با هم چه الگویی می‌سازند
//
// ═══ قاعدهٔ ۲-۴ در این فایل ═══
//
// دو نوع عدد اینجا کنار هم می‌نشیند و **هرگز** نباید یکی به‌نظر برسند:
// عددِ مشاهده‌شده (از معاملهٔ واقعی) و عددِ مدل (از بلک‌شولز). هر جدول و
// نموداری که مدل است، در متن خودش همین را می‌گوید. جای خالی هم جای خالی
// می‌ماند: پایی که تلاطم ضمنی ندارد، در تجزیه سهم صفر نمی‌گیرد — از تجزیه
// بیرون می‌ماند و «پوشش» می‌گوید چند درصد کار انجام شده.

import {
  GREEKS, greekSeries, greekSummary, legGreekSummary,
  annotateIntradayGreeks, annotateBucketGreeks, greekContribution,
  positionSensitivityGrid, positionSensitivityAxis, ivSnapshot,
} from '../core/greeks-track.mjs';
import {
  DRIVERS, analyzeAttribution, dailyTrack, bucketTrack, intradayTrack, dominantDriver,
} from '../core/attribution.mjs';
import { annotateDailyGreeks, legDaysToExpiry } from '../core/leg-iv.mjs';
import { fmt, faDigits, signTone } from './fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const fin = (value) => Number.isFinite(Number(value));
const money = (value) => (fin(value) ? fmt.money(Number(value)) : '—');
const pct = (value) => (fin(value) ? `${fmt.pct(Number(value))}٪` : '—');
const int = (value) => (fin(value) ? fmt.int(Number(value)) : '—');
const small = (value) => (fin(value) ? fmt.small(Number(value)) : '—');
const td = (text, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${text}</td>`;
const tdMoney = (value) => td(money(value), signTone(value));
const tdPct = (value) => td(pct(value), signTone(value));

/** جدول، یا جملهٔ صادقانهٔ «ساخته نشد» به‌جای جدول خالی. */
const table = (headers, rows, note = 'برای این جدول داده‌ای ساخته نشد.') => (rows.length
  ? `<table class="history-table backtest-compact-table"><thead><tr>${
    headers.map((head) => `<th>${head}</th>`).join('')}</tr></thead><tbody>${
    rows.map((row) => `<tr>${row.join('')}</tr>`).join('')}</tbody></table>`
  : `<p class="empty-note">${esc(note)}</p>`);

const kpis = (cards) => cards
  .map(([label, value, tone = '']) => `<article class="${tone}"><span>${esc(label)}</span><b>${value}</b></article>`)
  .join('');

const empty = (host, text) => { host.innerHTML = `<p class="empty-note">${esc(text)}</p>`; };

/** ریلِ انتخاب، همان الگوی «مبنای قیمت» تب اصلی. */
const rail = (id, items, selected) => `<div class="backtest-basis backtest-rail-auto" data-rail id="${id}" data-value="${esc(selected)}" role="radiogroup">${
  items.map(([value, label]) => `<button type="button" data-value="${esc(value)}" role="radio"
    aria-checked="${value === selected}">${esc(label)}</button>`).join('')}</div>`;

const setRail = (host, value) => {
  if (!host) return;
  host.dataset.value = value;
  for (const button of host.querySelectorAll('button')) {
    button.setAttribute('aria-checked', String(button.dataset.value === value));
  }
};

// ═══════════════════ وضعیت کنترل‌های همین پنل‌ها ═══════════════════
//
// انتخاب کاربر باید بین دو رنگ‌آمیزی زنده بماند، وگرنه هر بار که داده‌ای
// عوض می‌شود تایم‌فریمِ انتخابی هم به حالت اولیه برمی‌گردد.

export const analysisState = {
  greekFrame: 'daily',
  attrFrame: 'daily',
  patternFrame: 'daily',
  sensDays: 0,
  sensAt: 'last',
};

const FRAMES = [['daily', 'روزانه'], ['bucket', 'سطل تایم‌فریم'], ['intraday', 'درون‌روز']];

/** ده پنل، با همان ترتیبی که بالا توضیح داده شد. */
export const ANALYSIS_PANELS = [
  { id: 'bt-greeks', label: 'یونانی‌ها', hint: 'حساسیت هر پا و کل موقعیت، در هر تایم‌فریم' },
  { id: 'bt-attribution', label: 'تجزیه سود و زیان', hint: 'سود و زیان به پاها و بعد به عوامل شکسته می‌شود' },
  { id: 'bt-sensitivity', label: 'تحلیل حساسیت', hint: 'اگر پایه یا تلاطم جور دیگری می‌رفت' },
  { id: 'bt-time', label: 'اثر زمان', hint: 'زوال زمانی، روز تا سررسید، بازه‌های روز و روزهای هفته' },
  { id: 'bt-vol', label: 'اثر تلاطم', hint: 'تلاطم ضمنی پاها و اثرش بر سود' },
  { id: 'bt-spot', label: 'اثر پایه', hint: 'حرکت نماد پایه و اثرش بر سود' },
  { id: 'bt-legs', label: 'سهم پاها', hint: 'کدام پا سود ساخت و کدام خورد' },
  { id: 'bt-risk', label: 'ریسک و افت', hint: 'افت از قله، بیشترین سود و زیان بین راه' },
  { id: 'bt-turning', label: 'نقاط عطف', hint: 'بزرگ‌ترین جهش‌ها و عاملی که ساختشان' },
  { id: 'bt-pattern', label: 'الگوی موفقیت', hint: 'در چه شرایطی این استراتژی برنده بوده' },
];

// ═══════════════════ نشانه‌گذاری ═══════════════════

const head = (eyebrow, title, note = '') => `<div class="section-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div>${note ? `<span>${esc(note)}</span>` : ''}</div>`;
const sub = (title, note = '') => `<div class="section-head"><h3>${esc(title)}</h3>${note ? `<span>${esc(note)}</span>` : ''}</div>`;
const chartBox = (id, title, note) => `<section>${sub(title, note)}<div id="${id}" class="backtest-chart"></div></section>`;

/** نشانه‌گذاری هر ده پنل. رنگ‌آمیزی جداست؛ اینجا فقط جای خالی ساخته می‌شود. */
export function analysisMarkup() {
  return `
  <div class="bt-panel" data-panel="bt-greeks" hidden>
    <section class="card">${head('یونانی‌ها · هر پا با تلاطم ضمنی خودش', 'حساسیت موقعیت در طول عمر', 'مدل بلک‌شولز روی قیمت مشاهده‌شده')}
      <div class="backtest-frame-bar">${rail('bt-gk-frame', FRAMES, 'daily')}<span id="bt-gk-count">—</span></div>
      <div class="backtest-kpis" id="bt-gk-kpis"></div>
      <p class="backtest-table-note">یونانی هر پا از تلاطم ضمنی همان پا می‌آید، نه از یک تلاطم واحد برای کل موقعیت. پایی که تلاطم ندارد، یونانی هم ندارد و جمع موقعیت «ناقص» علامت می‌خورد.</p>
      <div class="backtest-chart-grid" id="bt-gk-charts"></div>
      <section class="backtest-tape">${sub('خلاصهٔ یونانی‌های موقعیت', 'کجا شروع شد، تا کجا رفت')}<div id="bt-gk-summary" class="history-table-wrap"></div></section>
      <section class="backtest-tape">${sub('یونانی هر پا، در همین تایم‌فریم', 'خام و سهم وزن‌دار، کنار هم')}<div id="bt-gk-legs" class="history-table-wrap"></div></section>
      <section class="backtest-tape">${sub('روند نقطه‌به‌نقطه', 'برای حفظ سرعت، حداکثر ۳۰۰ نقطه با فاصلهٔ یکنواخت')}<div id="bt-gk-track" class="history-table-wrap"></div></section>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-attribution" hidden>
    <section class="card">${head('چرا سود، چرا زیان', 'تجزیهٔ سود و زیان به ریشه‌ها', 'سه لایه: پا، عامل، دوره')}
      <div class="backtest-frame-bar">${rail('bt-at-frame', FRAMES, 'daily')}<span id="bt-at-note">—</span></div>
      <div class="backtest-kpis" id="bt-at-kpis"></div>
      <p class="backtest-table-note">تغییر قیمت هر پا با تقریب مرتبهٔ دوم به چهار عامل شکسته می‌شود: حرکت پایه (دلتا)، انحنای همان حرکت (گاما)، جابه‌جایی تلاطم ضمنی (وگا) و گذر زمان (تتا). آنچه این چهار توضیح نمی‌دهند در «باقیمانده» دیده می‌شود، نه اینکه داخل یکی از آن‌ها پنهان شود.</p>
      <div class="backtest-chart-grid">${chartBox('bt-at-chart', 'سهم تجمعی هر عامل', 'ریال · جمعشان منحنی سود را می‌سازد')}${chartBox('bt-at-step-chart', 'سهم عوامل در هر گام', 'ریال · گام‌به‌گام')}</div>
      <section class="backtest-tape">${sub('لایهٔ دوم · جمع هر عامل در کل عمر')}<div id="bt-at-drivers" class="history-table-wrap"></div></section>
      <section class="backtest-tape">${sub('لایهٔ اول · کدام پا', 'سود موقعیت، جمع سود پاهاست')}<div id="bt-at-legs" class="history-table-wrap"></div></section>
      <section class="backtest-tape">${sub('لایهٔ سوم · هر عامل کِی ساخت و کِی خورد', 'عدد خالص این دو را پنهان می‌کند')}<div id="bt-at-phases" class="history-table-wrap"></div></section>
      <section class="backtest-tape">${sub('گام‌به‌گام', 'حداکثر ۳۰۰ گام؛ ستون آخر، پررنگ‌ترین عامل همان گام')}<div id="bt-at-steps" class="history-table-wrap"></div></section>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-sensitivity" hidden>
    <section class="card">${head('اگر جور دیگری می‌شد', 'تحلیل حساسیت', 'این بخش مدل است، نه مشاهده')}
      <div class="backtest-frame-bar">${rail('bt-sn-at', [['last', 'لحظهٔ آخر'], ['entry', 'روز ورود']], 'last')}
        <label class="backtest-tf-field">گذشت زمان (روز)<input id="bt-sn-days" type="number" min="0" max="120" step="1" value="0"></label>
        <span id="bt-sn-note">—</span></div>
      <p class="backtest-table-note">هیچ‌کدام از عددهای این پنل معامله نشده‌اند. جواب این پرسش‌اند که «اگر پایه این‌قدر حرکت کند و تلاطم این‌قدر جابه‌جا شود، بلک‌شولز چه می‌گوید». پایی که تلاطم ضمنی‌اش معلوم نیست، بازقیمت‌گذاری نمی‌شود و خانه «ناقص» می‌ماند.</p>
      <section class="backtest-tape">${sub('شبکهٔ حرکت پایه × جابه‌جایی تلاطم', 'تغییر ارزش موقعیت، ریال')}<div id="bt-sn-grid" class="history-table-wrap"></div></section>
      <div class="backtest-chart-grid">${chartBox('bt-sn-spot-chart', 'حساسیت به حرکت پایه', 'تلاطم و زمان ثابت')}${chartBox('bt-sn-vol-chart', 'حساسیت به تلاطم', 'پایه و زمان ثابت')}</div>
      <div class="backtest-chart-grid">${chartBox('bt-sn-time-chart', 'حساسیت به گذر زمان', 'پایه و تلاطم ثابت')}<section>${sub('سهم هر پا در یونانی موقعیت', 'وزن علامت‌دار × یونانی خود پا')}<div id="bt-sn-legs" class="history-table-wrap"></div></section></div>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-time" hidden>
    <section class="card">${head('عامل زمان', 'زمان با این استراتژی چه کرد', 'از ثانیه تا روز تا سررسید')}
      <div class="backtest-chart-grid">${chartBox('bt-tm-theta-chart', 'سهم تجمعی گذر زمان', 'ریال · تتا در طول عمر')}${chartBox('bt-tm-dte-chart', 'روز مانده تا سررسید هر پا', 'روز')}</div>
      <div class="backtest-analysis-grid">
        <section>${sub('سود و زیان بر حسب روز نگهداری')}<div id="bt-tm-holding" class="history-table-wrap"></div></section>
        <section>${sub('عملکرد به تفکیک روز هفته')}<div id="bt-tm-weekday" class="history-table-wrap"></div></section>
      </div>
      <div class="backtest-analysis-grid">
        <section>${sub('چه مدت در سود، چه مدت در زیان', 'ثانیه مشاهده‌شده')}<div id="bt-tf-holding" class="history-table-wrap"></div></section>
        <section>${sub('رفتار هر بازه از روز', 'تجمیع همه روزها')}<div id="bt-tf-timeofday" class="history-table-wrap"></div></section>
      </div>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-vol" hidden>
    <section class="card">${head('عامل تلاطم', 'تغییر تلاطم ضمنی پاها چه کرد', 'وگا در عمل')}
      <div class="backtest-chart-grid">${chartBox('bt-vl-chart', 'تلاطم میانگین پاها و سود تجمعی', 'دو مقیاس، یک محور زمان')}${chartBox('bt-vl-spread-chart', 'اختلاف تلاطم پاها', 'واحد درصد · نسبت به پای اول')}</div>
      <section class="backtest-tape">${sub('گام‌ها بر اساس جهت تغییر تلاطم', 'وقتی تلاطم بالا رفت چه شد، وقتی پایین آمد چه شد')}<div id="bt-vl-regime" class="history-table-wrap"></div></section>
      <section class="backtest-tape">${sub('سهم وگا به تفکیک پا')}<div id="bt-vl-legs" class="history-table-wrap"></div></section>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-spot" hidden>
    <section class="card">${head('عامل پایه', 'حرکت نماد پایه چه کرد', 'دلتا و گاما در عمل')}
      <div class="backtest-chart-grid">${chartBox('bt-sp-chart', 'قیمت پایه و سود تجمعی', 'دو مقیاس، یک محور زمان')}${chartBox('bt-sp-scatter', 'تغییر سود در برابر حرکت پایه', 'نقاط به‌ترتیب حرکت پایه چیده شده‌اند')}</div>
      <section class="backtest-tape">${sub('گام‌ها بر اساس جهت حرکت پایه')}<div id="bt-sp-regime" class="history-table-wrap"></div></section>
      <section class="backtest-tape">${sub('سهم دلتا و گاما به تفکیک پا')}<div id="bt-sp-legs" class="history-table-wrap"></div></section>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-legs" hidden>
    <section class="card">${head('تفکیک پاها', 'کدام پا ساخت، کدام خورد', 'اثر خالص هر پا در طول عمر')}
      <div class="backtest-chart-grid">${chartBox('bt-lg-chart', 'اثر خالص تجمعی هر پا', 'ریال')}${chartBox('bt-lg-price-chart', 'قیمت هر پا', 'ریال')}</div>
      <section class="backtest-tape">${sub('کارنامهٔ هر پا')}<div id="bt-lg-table" class="history-table-wrap"></div></section>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-risk" hidden>
    <section class="card">${head('ناهمواری راه', 'ریسک و افت', 'مسیر، نه فقط مقصد')}
      <div class="backtest-kpis" id="bt-rk-kpis"></div>
      <div class="backtest-chart-grid">${chartBox('bt-rk-chart', 'سود خالص و افت از قله', 'ریال')}${chartBox('bt-rk-dd-chart', 'افت از قله', 'ریال · همیشه منفی یا صفر')}</div>
      <div class="backtest-analysis-grid">
        <section>${sub('روزهای سود و زیان')}<div id="bt-rk-table" class="history-table-wrap"></div></section>
        <section>${sub('طولانی‌ترین رشته‌ها')}<div id="bt-rk-streaks" class="history-table-wrap"></div></section>
      </div>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-turning" hidden>
    <section class="card">${head('کجا ساخته شد', 'نقاط عطف', 'سود معمولاً در چند گام معدود ساخته می‌شود')}
      <div class="backtest-chart-grid">${chartBox('bt-tp-chart', 'تغییر سود در هر گام', 'ریال · گام‌به‌گام')}${chartBox('bt-tp-cum-chart', 'مسیر تجمعی سود', 'ریال')}</div>
      <section class="backtest-tape">${sub('بزرگ‌ترین جهش‌ها، با عاملی که ساختشان')}<div id="bt-tp-table" class="history-table-wrap"></div></section>
    </section>
  </div>

  <div class="bt-panel" data-panel="bt-pattern" hidden>
    <section class="card">${head('جمع‌بندی', 'الگوی موفقیت و شکست', 'در چه شرایطی این استراتژی برنده بوده')}
      <div class="backtest-frame-bar">${rail('bt-pt-frame', FRAMES, 'daily')}<span id="bt-pt-count">—</span></div>
      <div id="bt-pt-verdict" class="backtest-verdict"></div>
      <div class="backtest-chart-grid">${chartBox('bt-pt-dist-chart', 'توزیع تغییر سود در گام‌ها', 'گام‌ها از زیان‌ده به سودده چیده شده‌اند')}${chartBox('bt-pt-iv-chart', 'تغییر سود در برابر سطح تلاطم', 'نقاط به‌ترتیب تلاطم ابتدای گام')}</div>
      <div class="backtest-analysis-grid">
        <section>${sub('بر اساس سطح تلاطم میانگین پاها')}<div id="bt-pt-iv" class="history-table-wrap"></div></section>
        <section>${sub('بر اساس اندازهٔ حرکت پایه')}<div id="bt-pt-move" class="history-table-wrap"></div></section>
      </div>
      <div class="backtest-analysis-grid">
        <section>${sub('بر اساس روز مانده تا سررسید')}<div id="bt-pt-dte" class="history-table-wrap"></div></section>
        <section>${sub('بر اساس بازهٔ ساعتی روز', 'فقط در تایم‌فریم درون‌روز و سطل')}<div id="bt-pt-clock" class="history-table-wrap"></div></section>
      </div>
    </section>
  </div>`;
}

// ═══════════════════ ابزار مشترک رنگ‌آمیزی ═══════════════════

/** نمونه‌برداری یکنواخت برای جدول‌های بلند؛ نقطهٔ اول و آخر همیشه می‌مانند. */
function thin(list, limit = 300) {
  if (list.length <= limit) return list;
  const step = (list.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => list[Math.round(index * step)]);
}

/** آمار یک دسته از گام‌ها: چند تا، جمع چقدر، چند درصد سودده. */
function groupStats(steps, label) {
  const values = steps.map((step) => step.actual).filter(Number.isFinite);
  const wins = values.filter((value) => value > 0).length;
  return {
    label,
    count: steps.length,
    samples: values.length,
    sum: values.reduce((a, b) => a + b, 0),
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN,
    winPct: values.length ? (wins / values.length) * 100 : NaN,
    best: values.length ? Math.max(...values) : NaN,
    worst: values.length ? Math.min(...values) : NaN,
  };
}

/** دسته‌بندی گام‌ها با یک تابع برچسب‌گذار، با ترتیب دلخواه. */
function groupBy(steps, classify, order) {
  const buckets = new Map(order.map((label) => [label, []]));
  for (const step of steps) {
    const label = classify(step);
    if (label == null) continue;
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(step);
  }
  return [...buckets.entries()].map(([label, list]) => groupStats(list, label)).filter((row) => row.count);
}

const statRow = (row) => [
  td(esc(row.label)), td(int(row.count)), tdMoney(row.sum), tdMoney(row.mean),
  tdPct(row.winPct), tdMoney(row.best), tdMoney(row.worst),
];
const STAT_HEAD = ['دسته', 'گام', 'جمع اثر', 'میانگین اثر', 'درصد سودده', 'بهترین', 'بدترین'];

/** رنگ خانهٔ ماتریس، از توکن — نه رنگ ثابت. */
function heatClass(value, scale) {
  if (!fin(value) || !(scale > 0)) return '';
  const share = Math.min(1, Math.abs(value) / scale);
  const level = share < 0.2 ? 1 : share < 0.45 ? 2 : share < 0.7 ? 3 : 4;
  return `${value >= 0 ? 'heat-up' : 'heat-down'}-${level}`;
}

// ═══════════════════ رنگ‌آمیزی ═══════════════════

/**
 * هر سه مسیر را با تلاطم و یونانی مهر می‌زند و برمی‌گرداند.
 *
 * یک بار، اینجا. اگر هر پنل خودش مهر می‌زد، ده بار همان ریشه‌یابی تلاطم
 * برای همان نقاط تکرار می‌شد و باز کردن یک تب، صفحه را قفل می‌کرد.
 */
function buildFrames(ctx) {
  const { replay, intraday, intradayDate, buckets, params } = ctx;
  annotateDailyGreeks(replay, params);
  annotateIntradayGreeks(intraday, { legs: replay.priced, date: intradayDate }, params);
  annotateBucketGreeks(buckets, { legs: replay.priced }, params);
  return {
    daily: { rows: replay.rows.filter((row) => row.status !== 'missing'), name: 'روزانه' },
    bucket: { rows: buckets, name: 'سطل تایم‌فریم' },
    intraday: { rows: intraday, name: 'درون‌روز' },
  };
}

const frameOf = (frames, key) => (frames[key]?.rows?.length ? frames[key] : frames.daily);

/** نام کوتاه پا، برای افسانهٔ نمودار و سرستون. */
const legLabel = (leg, index) => `${faDigits(index + 1)} · ${esc(leg?.name || `پای ${index + 1}`)}`;

// ─────────── ۱. یونانی‌ها ───────────

function paintGreeks(ctx, frames) {
  const { el, chart, colors, replay } = ctx;
  const frame = frameOf(frames, analysisState.greekFrame);
  const legs = replay.priced;
  const points = greekSeries(frame.rows, { legCount: legs.length });
  el('bt-gk-count').textContent = points.length
    ? `${fmt.int(points.length)} نقطه · ${frame.name}` : 'نقطه‌ای نیست';

  const last = frame.rows.at(-1)?.greeks;
  el('bt-gk-kpis').innerHTML = kpis([
    ...GREEKS.map(({ key, label }) => [label, small(last?.[key]), signTone(last?.[key])]),
    ['کامل بودن', last ? (last.incomplete ? 'ناقص — پایی بی‌تلاطم' : 'کامل') : '—', last?.incomplete ? 'loss' : 'gain'],
  ]);

  el('bt-gk-charts').innerHTML = GREEKS
    .map(({ key, label, unit }) => chartBox(`bt-gk-chart-${key}`, label, unit)).join('');
  for (const { key, label } of GREEKS) {
    const series = [
      { key, label: `کل موقعیت · ${label}`, color: 'var(--accent)' },
      ...legs.map((leg, index) => ({
        key: `${key}${index + 1}`, label: legLabel(leg, index), color: colors[index % colors.length],
      })),
    ];
    chart(el(`bt-gk-chart-${key}`), points, series, {
      timeScale: analysisState.greekFrame === 'intraday', step: analysisState.greekFrame !== 'daily',
      xLabel: frame.name, yLabel: label,
    });
  }

  el('bt-gk-summary').innerHTML = table(
    ['یونانی', 'واحد', 'مشاهده', 'بی‌داده', 'ابتدا', 'انتها', 'تغییر', 'کمینه', 'بیشینه', 'میانگین'],
    greekSummary(frame.rows).map((row) => [
      td(esc(row.label)), td(esc(row.unit)), td(int(row.samples)), td(int(row.gaps)),
      td(small(row.first)), td(small(row.last)), td(small(row.change), signTone(row.change)),
      td(small(row.min)), td(small(row.max)), td(small(row.mean)),
    ]),
  );

  const legRows = [];
  legs.forEach((leg, index) => {
    for (const row of legGreekSummary(frame.rows, index)) {
      legRows.push([
        td(legLabel(leg, index)), td(esc(row.label)), td(int(row.samples)), td(int(row.gaps)),
        td(small(row.first)), td(small(row.last)), td(small(row.change), signTone(row.change)),
        td(small(row.min)), td(small(row.max)), td(small(row.mean)),
      ]);
    }
  });
  el('bt-gk-legs').innerHTML = table(
    ['پا', 'یونانی', 'مشاهده', 'بی‌داده', 'ابتدا', 'انتها', 'تغییر', 'کمینه', 'بیشینه', 'میانگین'],
    legRows, 'این ترکیب پای اختیاری ندارد؛ یونانی تعریف نمی‌شود.',
  );

  el('bt-gk-track').innerHTML = table(
    ['لحظه', ...GREEKS.map(({ label }) => label), 'وضعیت'],
    thin(points).map((point) => [
      td(faDigits(point.timeLabel || point.dateLabel || String(point.date ?? ''))),
      ...GREEKS.map(({ key }) => td(small(point[key]))),
      td(point.incomplete ? 'ناقص' : 'کامل', point.incomplete ? 'loss' : ''),
    ]),
  );
}

// ─────────── ۲. تجزیه سود و زیان ───────────

function trackOf(ctx, frames, key) {
  const frame = frameOf(frames, key);
  if (frame === frames.intraday) return intradayTrack(frame.rows, ctx.intradayDate);
  if (frame === frames.bucket) return bucketTrack(frame.rows);
  return dailyTrack(ctx.replay);
}

function paintAttribution(ctx, frames) {
  const { el, chart, replay } = ctx;
  const frame = frameOf(frames, analysisState.attrFrame);
  const track = trackOf(ctx, frames, analysisState.attrFrame);
  const result = analyzeAttribution(replay.priced, track);
  ctx.attribution = result;

  const totals = result.totals;
  el('bt-at-note').textContent = `${fmt.int(totals.steps)} گام · ${frame.name}`;
  el('bt-at-kpis').innerHTML = kpis([
    ['تغییر تجزیه‌شده', money(totals.actual), signTone(totals.actual)],
    ...DRIVERS.map(({ key, label }) => [label, money(totals[key]), signTone(totals[key])]),
    ['پوشش تجزیه', pct(totals.coverage), totals.coverage >= 99 ? 'gain' : 'loss'],
  ]);

  const colorOf = {
    delta: 'var(--cmp1)', gamma: 'var(--cmp2)', vega: 'var(--cmp3)',
    theta: 'var(--cmp4)', rest: 'var(--muted)',
  };
  const series = [
    { key: 'actual', label: 'تغییر واقعی', color: 'var(--accent)' },
    ...DRIVERS.map(({ key, label }) => ({ key, label, color: colorOf[key] })),
  ];
  chart(el('bt-at-chart'), result.cumulative, series, {
    money: true, timeScale: analysisState.attrFrame === 'intraday',
    xLabel: frame.name, yLabel: 'ریال · تجمعی',
  });
  chart(el('bt-at-step-chart'), result.steps.map((step) => ({
    date: step.date, second: step.second, dateLabel: step.to, timeLabel: step.to,
    granularity: fin(step.second) ? 'trade' : 'day',
    actual: step.actual, ...Object.fromEntries(DRIVERS.map(({ key }) => [key, step[key]])),
  })), series, {
    money: true, step: true, timeScale: analysisState.attrFrame === 'intraday',
    xLabel: frame.name, yLabel: 'ریال · در هر گام',
  });

  el('bt-at-drivers').innerHTML = table(
    ['عامل', 'جمع اثر', 'سهم از قدر مطلق', 'معنی'],
    (() => {
      const scale = DRIVERS.reduce((sum, { key }) => sum + Math.abs(totals[key] || 0), 0);
      return DRIVERS.map(({ key, label, hint }) => [
        td(esc(label)), tdMoney(totals[key]),
        tdPct(scale > 0 ? (Math.abs(totals[key]) / scale) * 100 : NaN),
        td(esc(hint)),
      ]);
    })(),
  );

  el('bt-at-legs').innerHTML = table(
    ['پا', 'اثر خالص', ...DRIVERS.map(({ label }) => label), 'گام تجزیه‌شده', 'گام بی‌تجزیه'],
    result.byLeg.map((row) => [
      td(legLabel(row.leg, row.index)), tdMoney(row.actual),
      ...DRIVERS.map(({ key }) => tdMoney(row[key])),
      td(int(row.samples)), td(int(row.gaps), row.gaps ? 'loss' : ''),
    ]),
  );

  el('bt-at-phases').innerHTML = table(
    ['عامل', 'سودی که ساخت', 'زیانی که ساخت', 'خالص', 'گام سودده', 'گام زیان‌ده'],
    result.phases.map((row) => [
      td(esc(row.label)), td(money(row.gain), 'gain'), td(money(row.loss), 'loss'),
      tdMoney(row.net), td(int(row.gainSteps)), td(int(row.lossSteps)),
    ]),
  );

  el('bt-at-steps').innerHTML = table(
    ['از', 'تا', 'حرکت پایه', ...DRIVERS.map(({ label }) => label), 'تغییر واقعی', 'پررنگ‌ترین عامل'],
    thin(result.steps).map((step) => {
      const driver = dominantDriver(step);
      return [
        td(faDigits(step.from ?? '')), td(faDigits(step.to ?? '')), tdPct(step.spotPct),
        ...DRIVERS.map(({ key }) => tdMoney(step[key])),
        tdMoney(step.actual),
        td(driver ? `${esc(driver.label)} · ${pct(driver.sharePct)}` : '—'),
      ];
    }),
  );
}

// ─────────── ۳. تحلیل حساسیت ───────────

function paintSensitivity(ctx, frames) {
  const { el, chart, replay, intraday, intradayDate, params } = ctx;
  const legs = replay.priced;
  const atEntry = analysisState.sensAt === 'entry';
  const source = atEntry
    ? replay.rows.find((row) => row.status !== 'missing')
    : (intraday.at(-1) || frames.bucket.rows.at(-1) || replay.rows.filter((row) => row.status !== 'missing').at(-1));
  if (!source) { empty(el('bt-sn-grid'), 'لحظهٔ مرجعی برای حساسیت پیدا نشد.'); return; }

  const date = fin(source.second) ? intradayDate : source.date;
  const snapshot = {
    spot: fin(source.baseClose) ? source.baseClose : source.basePrice,
    prices: (source.perLeg || []).map((leg) => (fin(leg.exitPrice) ? leg.exitPrice : leg.price)),
    date,
  };
  snapshot.ivPct = ivSnapshot(legs, snapshot, params);
  const days = Math.max(0, Math.trunc(Number(el('bt-sn-days').value) || 0));
  analysisState.sensDays = days;

  el('bt-sn-note').textContent = [
    atEntry ? 'روز ورود' : 'لحظهٔ آخر',
    `پایه ${money(snapshot.spot)}`,
    days ? `${fmt.int(days)} روز گذشت زمان` : 'بدون گذشت زمان',
  ].join(' · ');

  const grid = positionSensitivityGrid(legs, snapshot, params, { days });
  const scale = Math.max(...grid.rows.flatMap((row) => row.cells.map((cell) => Math.abs(cell.change)))
    .filter(Number.isFinite), 0);
  el('bt-sn-grid').innerHTML = `<table class="history-table backtest-compact-table decision-heatmap" data-enhance="sort-only">
    <thead><tr><th>حرکت پایه \\ تلاطم</th>${grid.vols.map((vol) => `<th>${fmt.pct(vol)} واحد</th>`).join('')}</tr></thead>
    <tbody>${grid.rows.map((row) => `<tr><th scope="row">${fmt.pct(row.spotPct)}٪</th>${
    row.cells.map((cell) => `<td class="${heatClass(cell.change, scale)}">${cell.incomplete ? '—' : money(cell.change)}</td>`).join('')
  }</tr>`).join('')}</tbody></table>`;

  const axes = positionSensitivityAxis(legs, snapshot, params, { });
  const line = (id, list, label, xLabel) => chart(
    el(id), list.map((item) => ({ date: NaN, dateLabel: `${fmt.pct(item.step)}`, change: item.change })),
    [{ key: 'change', label, color: 'var(--accent)' }], { money: true, xLabel, yLabel: 'تغییر ارزش (ریال)' },
  );
  line('bt-sn-spot-chart', axes.spot, 'تغییر ارزش', 'حرکت پایه (٪)');
  line('bt-sn-vol-chart', axes.vol, 'تغییر ارزش', 'جابه‌جایی تلاطم (واحد درصد)');
  line('bt-sn-time-chart', axes.time, 'تغییر ارزش', 'روز گذشته');

  el('bt-sn-legs').innerHTML = table(
    ['پا', 'وزن علامت‌دار', 'تلاطم ضمنی', ...GREEKS.map(({ label }) => label), ...GREEKS.map(({ label }) => `سهم ${label}`)],
    greekContribution(legs, snapshot, params).map((item) => [
      td(legLabel(item.leg, item.index)), td(int(item.weight)), td(pct(snapshot.ivPct[item.index])),
      ...GREEKS.map(({ key }) => td(small(item.greeks?.[key]))),
      ...GREEKS.map(({ key }) => td(small(item.share[key]), signTone(item.share[key]))),
    ]),
  );
}

// ─────────── ۴. اثر زمان ───────────

function paintTime(ctx, frames) {
  const { el, chart, colors, replay } = ctx;
  const daily = frames.daily.rows;
  const attribution = ctx.attribution;

  chart(el('bt-tm-theta-chart'), attribution?.cumulative || [],
    [{ key: 'theta', label: 'سهم تجمعی گذر زمان', color: 'var(--cmp4)' },
      { key: 'actual', label: 'تغییر واقعی', color: 'var(--accent)' }],
    { money: true, xLabel: 'مسیر زمانی', yLabel: 'ریال' });

  const dtePoints = daily.map((row) => ({
    date: row.date, dateLabel: row.dateLabel,
    ...Object.fromEntries(replay.priced.map((leg, index) => [`dte${index + 1}`, legDaysToExpiry(leg, row.date)])),
  }));
  chart(el('bt-tm-dte-chart'), dtePoints, replay.priced.map((leg, index) => ({
    key: `dte${index + 1}`, label: legLabel(leg, index), color: colors[index % colors.length],
  })), { count: true, xLabel: 'روز', yLabel: 'روز تا سررسید' });

  el('bt-tm-holding').innerHTML = table(
    ['روز نگهداری', 'تاریخ', 'سود خالص', 'تغییر روز', 'بازده', 'افت از قله'],
    thin(daily, 200).map((row) => [
      td(int(row.holdingDays)), td(faDigits(row.dateLabel)), tdMoney(row.netPnl),
      tdMoney(row.pnlDelta), tdPct(row.returnPct), tdMoney(row.drawdown),
    ]),
  );

  const byDay = new Map();
  for (const row of daily) {
    if (!fin(row.pnlDelta)) continue;
    const name = row.dayName || '—';
    if (!byDay.has(name)) byDay.set(name, []);
    byDay.get(name).push(row.pnlDelta);
  }
  el('bt-tm-weekday').innerHTML = table(
    ['روز هفته', 'تعداد', 'جمع تغییر', 'میانگین', 'درصد سودده'],
    [...byDay.entries()].map(([name, list]) => [
      td(esc(name)), td(int(list.length)),
      tdMoney(list.reduce((a, b) => a + b, 0)),
      tdMoney(list.reduce((a, b) => a + b, 0) / list.length),
      tdPct((list.filter((value) => value > 0).length / list.length) * 100),
    ]),
  );
}

// ─────────── ۵. اثر تلاطم ───────────

function paintVol(ctx, frames) {
  const { el, chart, colors, replay } = ctx;
  const frame = frameOf(frames, analysisState.attrFrame);
  const result = ctx.attribution;
  const points = frame.rows.map((row, index) => ({
    date: row.date, dateLabel: row.dateLabel, second: row.second ?? row.startSecond,
    timeLabel: row.timeLabel, granularity: row.granularity,
    meanIvPct: row.meanIvPct,
    cumPnl: result?.cumulative?.[index - 1]?.actual,
  }));
  chart(el('bt-vl-chart'), points, [
    { key: 'meanIvPct', label: 'تلاطم میانگین پاها (٪)', color: 'var(--cmp3)' },
  ], { xLabel: frame.name, yLabel: 'تلاطم ضمنی (٪)' });

  // اختلاف تلاطم هر پا با پای اول: انحراف ساختار تلاطم، نه سطحش
  const spread = frame.rows.map((row) => {
    const base = row.legIvPct?.[0];
    const point = { date: row.date, dateLabel: row.dateLabel, second: row.second ?? row.startSecond, timeLabel: row.timeLabel };
    (row.legIvPct || []).forEach((value, index) => {
      point[`sp${index + 1}`] = fin(value) && fin(base) ? value - base : NaN;
    });
    return point;
  });
  chart(el('bt-vl-spread-chart'), spread, replay.priced.slice(1).map((leg, at) => ({
    key: `sp${at + 2}`, label: legLabel(leg, at + 1), color: colors[(at + 1) % colors.length],
  })), { xLabel: frame.name, yLabel: 'اختلاف تلاطم (واحد درصد)' });

  const steps = result?.steps || [];
  const volDir = (step) => {
    if (!fin(step.vega)) return null;
    return step.vega > 0 ? 'وگا سود داد' : step.vega < 0 ? 'وگا زیان داد' : 'وگا بی‌اثر';
  };
  el('bt-vl-regime').innerHTML = table(STAT_HEAD,
    groupBy(steps, volDir, ['وگا سود داد', 'وگا بی‌اثر', 'وگا زیان داد']).map(statRow));

  el('bt-vl-legs').innerHTML = table(
    ['پا', 'سهم وگا', 'اثر خالص پا', 'سهم وگا از اثر پا', 'گام بی‌تجزیه'],
    (result?.byLeg || []).map((row) => [
      td(legLabel(row.leg, row.index)), tdMoney(row.vega), tdMoney(row.actual),
      tdPct(Math.abs(row.actual) > 0 ? (row.vega / row.actual) * 100 : NaN),
      td(int(row.gaps), row.gaps ? 'loss' : ''),
    ]),
  );
}

// ─────────── ۶. اثر پایه ───────────

function paintSpot(ctx, frames) {
  const { el, chart } = ctx;
  const frame = frameOf(frames, analysisState.attrFrame);
  const result = ctx.attribution;
  const steps = result?.steps || [];

  chart(el('bt-sp-chart'), frame.rows.map((row) => ({
    date: row.date, dateLabel: row.dateLabel, second: row.second ?? row.startSecond,
    timeLabel: row.timeLabel, spot: fin(row.baseClose) ? row.baseClose : row.basePrice,
  })), [{ key: 'spot', label: 'قیمت نماد پایه', color: 'var(--cmp1)' }],
  { money: true, xLabel: frame.name, yLabel: 'ریال' });

  const bySpot = steps
    .filter((step) => fin(step.spotPct) && fin(step.actual))
    .slice()
    .sort((a, b) => a.spotPct - b.spotPct)
    .map((step) => ({ date: step.date, dateLabel: `${fmt.pct(step.spotPct)}٪`, actual: step.actual, delta: step.delta, gamma: step.gamma }));
  chart(el('bt-sp-scatter'), bySpot, [
    { key: 'actual', label: 'تغییر واقعی سود', color: 'var(--accent)' },
    { key: 'delta', label: 'سهم دلتا', color: 'var(--cmp1)' },
    { key: 'gamma', label: 'سهم گاما', color: 'var(--cmp2)' },
  ], { money: true, xLabel: 'حرکت پایه — از منفی به مثبت', yLabel: 'ریال' });

  const dir = (step) => {
    if (!fin(step.spotPct)) return null;
    if (step.spotPct > 0.25) return 'پایه بالا رفت';
    if (step.spotPct < -0.25) return 'پایه پایین آمد';
    return 'پایه تقریباً ثابت';
  };
  el('bt-sp-regime').innerHTML = table(STAT_HEAD,
    groupBy(steps, dir, ['پایه بالا رفت', 'پایه تقریباً ثابت', 'پایه پایین آمد']).map(statRow));

  el('bt-sp-legs').innerHTML = table(
    ['پا', 'سهم دلتا', 'سهم گاما', 'اثر خالص پا', 'سهم دلتا از اثر پا'],
    (result?.byLeg || []).map((row) => [
      td(legLabel(row.leg, row.index)), tdMoney(row.delta), tdMoney(row.gamma), tdMoney(row.actual),
      tdPct(Math.abs(row.actual) > 0 ? (row.delta / row.actual) * 100 : NaN),
    ]),
  );
}

// ─────────── ۷. سهم پاها ───────────

function paintLegs(ctx, frames) {
  const { el, chart, colors, replay } = ctx;
  const frame = frameOf(frames, analysisState.attrFrame);
  const legs = replay.priced;
  const flat = (getter) => frame.rows.map((row) => ({
    date: row.date, dateLabel: row.dateLabel, second: row.second ?? row.startSecond, timeLabel: row.timeLabel,
    ...Object.fromEntries((row.perLeg || []).map((leg, index) => [`v${index + 1}`, getter(leg)])),
  }));
  const series = legs.map((leg, index) => ({
    key: `v${index + 1}`, label: legLabel(leg, index), color: colors[index % colors.length],
  }));
  chart(el('bt-lg-chart'), flat((leg) => leg.netPnl), series,
    { money: true, xLabel: frame.name, yLabel: 'اثر خالص (ریال)' });
  chart(el('bt-lg-price-chart'), flat((leg) => (fin(leg.exitPrice) ? leg.exitPrice : leg.price)), series,
    { money: true, xLabel: frame.name, yLabel: 'قیمت (ریال)' });

  const last = frame.rows.at(-1);
  const totals = ctx.attribution?.byLeg || [];
  const net = totals.reduce((sum, row) => sum + Math.abs(row.actual || 0), 0);
  el('bt-lg-table').innerHTML = table(
    ['پا', 'جهت', 'وزن', 'قیمت ورود', 'قیمت آخر', 'اثر خالص آخر', 'تغییر تجزیه‌شده', 'سهم از حرکت کل'],
    legs.map((leg, index) => {
      const now = last?.perLeg?.[index];
      const total = totals.find((row) => row.index === index);
      return [
        td(legLabel(leg, index)), td(leg.side === 'sell' ? 'فروش' : 'خرید'),
        td(int(Number(leg.ratio || 1) * Number(leg.size || 1))),
        td(money(leg.price)), td(money(fin(now?.exitPrice) ? now.exitPrice : now?.price)),
        tdMoney(now?.netPnl), tdMoney(total?.actual),
        tdPct(net > 0 ? (Math.abs(total?.actual || 0) / net) * 100 : NaN),
      ];
    }),
  );
}

// ─────────── ۸. ریسک و افت ───────────

function paintRisk(ctx, frames) {
  const { el, chart } = ctx;
  const daily = frames.daily.rows.filter((row) => row.status === 'ok');
  if (!daily.length) { empty(el('bt-rk-table'), 'روز معتبری برای سنجش ریسک نیست.'); return; }
  const pnl = daily.map((row) => row.netPnl).filter(Number.isFinite);
  const worstDd = Math.min(...daily.map((row) => row.drawdown).filter(Number.isFinite), 0);
  const best = Math.max(...pnl), worst = Math.min(...pnl);
  const final = pnl.at(-1);
  el('bt-rk-kpis').innerHTML = kpis([
    ['سود نهایی', money(final), signTone(final)],
    ['بیشترین سود بین راه', money(best), 'gain'],
    ['بیشترین زیان بین راه', money(worst), 'loss'],
    ['بدترین افت از قله', money(worstDd), 'loss'],
    ['نسبت سود به افت', fin(worstDd) && worstDd < 0 ? fmt.num(Math.abs(final / worstDd)) : '—', signTone(final)],
    ['روز در سود', `${fmt.int(pnl.filter((value) => value > 0).length)} از ${fmt.int(pnl.length)}`, 'gain'],
  ]);

  chart(el('bt-rk-chart'), daily, [
    { key: 'netPnl', label: 'سود خالص', color: 'var(--accent)' },
    { key: 'drawdown', label: 'افت از قله', color: 'var(--loss)' },
  ], { money: true, xLabel: 'روز', yLabel: 'ریال' });
  chart(el('bt-rk-dd-chart'), daily, [{ key: 'drawdown', label: 'افت از قله', color: 'var(--loss)' }],
    { money: true, xLabel: 'روز', yLabel: 'ریال' });

  const up = daily.filter((row) => row.pnlDelta > 0), down = daily.filter((row) => row.pnlDelta < 0);
  const sum = (list) => list.reduce((total, row) => total + row.pnlDelta, 0);
  el('bt-rk-table').innerHTML = table(
    ['دسته', 'روز', 'جمع تغییر', 'میانگین', 'بزرگ‌ترین'],
    [
      [td('روز سودده'), td(int(up.length)), td(money(sum(up)), 'gain'), td(money(sum(up) / (up.length || 1)), 'gain'), td(money(Math.max(...up.map((row) => row.pnlDelta), 0)), 'gain')],
      [td('روز زیان‌ده'), td(int(down.length)), td(money(sum(down)), 'loss'), td(money(sum(down) / (down.length || 1)), 'loss'), td(money(Math.min(...down.map((row) => row.pnlDelta), 0)), 'loss')],
    ],
  );

  let bestUp = 0, bestDown = 0, runUp = 0, runDown = 0;
  for (const row of daily) {
    if (row.pnlDelta > 0) { runUp += 1; runDown = 0; } else if (row.pnlDelta < 0) { runDown += 1; runUp = 0; } else { runUp = 0; runDown = 0; }
    bestUp = Math.max(bestUp, runUp); bestDown = Math.max(bestDown, runDown);
  }
  el('bt-rk-streaks').innerHTML = table(
    ['رشته', 'طول (روز)'],
    [[td('طولانی‌ترین رشتهٔ سود'), td(int(bestUp), 'gain')],
      [td('طولانی‌ترین رشتهٔ زیان'), td(int(bestDown), 'loss')]],
  );
}

// ─────────── ۹. نقاط عطف ───────────

function paintTurning(ctx) {
  const { el, chart } = ctx;
  const result = ctx.attribution;
  if (!result?.steps?.length) { empty(el('bt-tp-table'), 'گامی برای سنجش نقاط عطف نیست.'); return; }
  chart(el('bt-tp-chart'), result.steps.map((step) => ({
    date: step.date, second: step.second, dateLabel: step.to, timeLabel: step.to,
    actual: step.actual,
  })), [{ key: 'actual', label: 'تغییر سود در گام', color: 'var(--accent)' }],
  { money: true, step: true, xLabel: 'گام', yLabel: 'ریال' });
  chart(el('bt-tp-cum-chart'), result.cumulative, [{ key: 'actual', label: 'سود تجمعی', color: 'var(--accent)' }],
    { money: true, xLabel: 'گام', yLabel: 'ریال' });

  el('bt-tp-table').innerHTML = table(
    ['رتبه', 'از', 'تا', 'تغییر سود', 'حرکت پایه', 'عامل اصلی', 'سهم عامل', ...DRIVERS.map(({ label }) => label)],
    result.turningPoints.map(({ step, driver }, index) => [
      td(faDigits(index + 1)), td(faDigits(step.from ?? '')), td(faDigits(step.to ?? '')),
      tdMoney(step.actual), tdPct(step.spotPct),
      td(driver ? esc(driver.label) : '—'), tdPct(driver?.sharePct),
      ...DRIVERS.map(({ key }) => tdMoney(step[key])),
    ]),
  );
}

// ─────────── ۱۰. الگوی موفقیت ───────────

/** مرزهای چارکی یک سری، برای دسته‌بندی «کم/متوسط/زیاد». */
function quartiles(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length < 4) return null;
  const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
  return { q1: at(0.25), q2: at(0.5), q3: at(0.75) };
}

/**
 * جمله‌های حکم پنل الگو.
 *
 * جدا و خالص نگه داشته شده چون این تنها جای برنامه است که عدد را به **جمله**
 * تبدیل می‌کند، و جمله می‌تواند بیشتر از عدد ادعا کند. سه قید اینجا محکم
 * است و آزمون هر سه را می‌سنجد:
 *
 *   • «بیشترین سود» فقط وقتی گفته می‌شود که جمعِ آن دسته مثبت باشد. اگر
 *     هیچ دسته‌ای سودده نبوده، جمله «کم‌زیان‌ترین» می‌شود — چون سودی نبوده.
 *   • اگر بهترین و بدترین یک دسته باشند، دو جملهٔ هم‌معنی ساخته نمی‌شود؛
 *     یعنی فقط یک دسته نمونهٔ کافی داشته و همین گفته می‌شود.
 *   • پوشش تجزیه همیشه گفته می‌شود، حتی وقتی ۱۰۰ است — کاربر باید بداند
 *     این جمله‌ها روی چند درصد از حرکت ایستاده‌اند.
 */
export function verdictLines(pool = [], drivers = [], coverage = NaN) {
  const lines = [];
  if (pool.length) {
    const best = pool.reduce((a, row) => (row.sum > a.sum ? row : a));
    const worst = pool.reduce((a, row) => (row.sum < a.sum ? row : a));
    lines.push(best.sum > 0
      ? `بیشترین سود وقتی ساخته شد که <b>${esc(best.label)}</b> (${esc(best.family)}) — جمع ${money(best.sum)} در ${int(best.count)} گام، ${pct(best.winPct)} گام سودده.`
      : `هیچ دستهٔ شرایطی در این بازه جمعاً سودده نبود. کم‌زیان‌ترین حالت <b>${esc(best.label)}</b> بود با جمع ${money(best.sum)}.`);
    lines.push(worst !== best
      ? `بیشترین زیان وقتی بود که <b>${esc(worst.label)}</b> (${esc(worst.family)}) — جمع ${money(worst.sum)} در ${int(worst.count)} گام.`
      : 'تنها یک دسته نمونهٔ کافی داشت، پس بهترین و بدترین حالت همان است؛ برای تفکیک، بازهٔ بلندتر یا تایم‌فریم ریزتر لازم است.');
  } else {
    lines.push('برای دسته‌بندی شرایط، گام کافی نیست.');
  }
  if (drivers[0]) {
    lines.push(`پرنقش‌ترین عامل <b>${esc(drivers[0].label)}</b> بود با خالص ${money(drivers[0].net)}؛ همان عامل ${money(drivers[0].gain)} ساخت و ${money(drivers[0].loss)} خورد.`);
  }
  lines.push(`پوشش تجزیه ${pct(coverage)} است؛ باقی حرکت روی پاهایی افتاده که تلاطم ضمنی نداشته‌اند و دربارهٔ آن‌ها ادعایی نمی‌شود.`);
  return lines;
}

function paintPattern(ctx, frames) {
  const { el, chart, replay } = ctx;
  const frame = frameOf(frames, analysisState.patternFrame);
  const track = trackOf(ctx, frames, analysisState.patternFrame);
  const result = analyzeAttribution(replay.priced, track);
  const steps = result.steps;
  el('bt-pt-count').textContent = `${fmt.int(steps.length)} گام · ${frame.name}`;

  // شرط هر گام از **ابتدای** همان گام خوانده می‌شود، نه از انتهایش: پرسش
  // «در چه شرایطی برنده بودیم» یعنی شرطی که پیش از حرکت معلوم بوده.
  const ivAt = new Map(), dteAt = new Map();
  frame.rows.forEach((row, index) => {
    if (!index) return;
    const step = steps[index - 1];
    if (!step) return;
    ivAt.set(step, Number(frame.rows[index - 1]?.meanIvPct));
    const days = Math.min(...replay.priced
      .filter((leg) => leg.kind !== 'underlying')
      .map((leg) => legDaysToExpiry(leg, frame.rows[index - 1]?.date))
      .filter(Number.isFinite));
    dteAt.set(step, Number.isFinite(days) ? days : NaN);
  });

  const ivBands = quartiles([...ivAt.values()]);
  const ivRows = ivBands
    ? groupBy(steps, (step) => {
      const value = ivAt.get(step);
      if (!fin(value)) return null;
      return value <= ivBands.q1 ? 'تلاطم پایین' : value <= ivBands.q3 ? 'تلاطم میانه' : 'تلاطم بالا';
    }, ['تلاطم پایین', 'تلاطم میانه', 'تلاطم بالا'])
    : [];
  el('bt-pt-iv').innerHTML = table(STAT_HEAD, ivRows.map(statRow),
    'برای دسته‌بندی تلاطم، مشاهدهٔ کافی نیست.');

  const moveRows = groupBy(steps, (step) => {
    const value = step.spotPct;
    if (!fin(value)) return null;
    const size = Math.abs(value);
    if (size < 0.25) return 'پایه تقریباً ثابت';
    if (size < 1) return value > 0 ? 'صعود کوچک' : 'نزول کوچک';
    return value > 0 ? 'صعود بزرگ' : 'نزول بزرگ';
  }, ['صعود بزرگ', 'صعود کوچک', 'پایه تقریباً ثابت', 'نزول کوچک', 'نزول بزرگ']);
  el('bt-pt-move').innerHTML = table(STAT_HEAD, moveRows.map(statRow));

  const dteRows = groupBy(steps, (step) => {
    const days = dteAt.get(step);
    if (!fin(days)) return null;
    if (days <= 7) return 'کمتر از یک هفته تا سررسید';
    if (days <= 21) return 'یک تا سه هفته تا سررسید';
    if (days <= 45) return 'سه هفته تا یک ماه و نیم';
    return 'بیش از یک ماه و نیم';
  }, ['بیش از یک ماه و نیم', 'سه هفته تا یک ماه و نیم', 'یک تا سه هفته تا سررسید', 'کمتر از یک هفته تا سررسید']);
  el('bt-pt-dte').innerHTML = table(STAT_HEAD, dteRows.map(statRow));

  const clockRows = steps.some((step) => fin(step.second))
    ? groupBy(steps, (step) => {
      if (!fin(step.second)) return null;
      const hour = Math.floor(step.second / 3600);
      return `${faDigits(hour)} تا ${faDigits(hour + 1)}`;
    }, []).sort((a, b) => a.label.localeCompare(b.label, 'fa'))
    : [];
  el('bt-pt-clock').innerHTML = table(STAT_HEAD, clockRows.map(statRow),
    'در تایم‌فریم روزانه، بازهٔ ساعتی تعریف نمی‌شود. تایم‌فریم درون‌روز یا سطل را انتخاب کن.');

  // ── نمودارها ──
  const sorted = steps.filter((step) => fin(step.actual)).slice().sort((a, b) => a.actual - b.actual);
  chart(el('bt-pt-dist-chart'), sorted.map((step) => ({
    date: step.date, dateLabel: step.to, actual: step.actual,
  })), [{ key: 'actual', label: 'تغییر سود در گام', color: 'var(--accent)' }],
  { money: true, xLabel: 'گام — از زیان‌ده به سودده', yLabel: 'ریال' });

  const byIv = steps
    .filter((step) => fin(step.actual) && fin(ivAt.get(step)))
    .slice()
    .sort((a, b) => ivAt.get(a) - ivAt.get(b))
    .map((step) => ({ date: step.date, dateLabel: `${fmt.pct(ivAt.get(step))}٪`, actual: step.actual }));
  chart(el('bt-pt-iv-chart'), byIv, [{ key: 'actual', label: 'تغییر سود در گام', color: 'var(--cmp3)' }],
    { money: true, xLabel: 'تلاطم میانگین ابتدای گام — از کم به زیاد', yLabel: 'ریال' });

  // ── حکم ──
  //
  // جمله از خودِ عددها ساخته می‌شود و **ادعای بیشتر از عدد نمی‌کند**: اگر
  // هیچ دسته‌ای جمعاً سودده نبوده، «بیشترین سود» گفته نمی‌شود، چون سودی
  // نبوده. و اگر بهترین و بدترین یک دسته باشند، یعنی فقط یک دسته نمونهٔ
  // کافی داشته — همین گفته می‌شود، نه دو جملهٔ هم‌معنی که تناقض به‌نظر
  // می‌رسند.
  const pool = [
    ...moveRows.map((row) => ({ ...row, family: 'حرکت پایه' })),
    ...ivRows.map((row) => ({ ...row, family: 'سطح تلاطم' })),
    ...dteRows.map((row) => ({ ...row, family: 'روز تا سررسید' })),
  ].filter((row) => row.samples >= 2);
  const drivers = result.phases.filter((phase) => phase.key !== 'rest')
    .slice().sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const lines = verdictLines(pool, drivers, result.totals.coverage);
  el('bt-pt-verdict').innerHTML = `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
}

// ═══════════════════ نقطهٔ ورود ═══════════════════

/** هر ده پنل را با داده‌های همین اجرا پر می‌کند. */
export function paintAnalysis(ctx) {
  if (!ctx?.replay?.ok) return;
  const frames = buildFrames(ctx);
  setRail(ctx.el('bt-gk-frame'), analysisState.greekFrame);
  setRail(ctx.el('bt-at-frame'), analysisState.attrFrame);
  setRail(ctx.el('bt-pt-frame'), analysisState.patternFrame);
  setRail(ctx.el('bt-sn-at'), analysisState.sensAt);
  paintGreeks(ctx, frames);
  paintAttribution(ctx, frames);
  paintSensitivity(ctx, frames);
  paintTime(ctx, frames);
  paintVol(ctx, frames);
  paintSpot(ctx, frames);
  paintLegs(ctx, frames);
  paintRisk(ctx, frames);
  paintTurning(ctx);
  paintPattern(ctx, frames);
}

/**
 * کنترل‌های این پنل‌ها را وصل می‌کند.
 *
 * یک شنوندهٔ واگذارشده روی ریشه، نه ده شنونده روی ده عنصر: پنل‌ها با
 * `hidden` می‌آیند و می‌روند و اگر شنونده روی خودشان بود، هر بار باید
 * دوباره وصل می‌شد.
 */
export function installAnalysisControls(root, repaint) {
  const keyOf = { 'bt-gk-frame': 'greekFrame', 'bt-at-frame': 'attrFrame', 'bt-pt-frame': 'patternFrame', 'bt-sn-at': 'sensAt' };
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rail] button');
    if (!button) return;
    const host = button.closest('[data-rail]');
    const key = keyOf[host.id];
    if (!key || analysisState[key] === button.dataset.value) return;
    analysisState[key] = button.dataset.value;
    setRail(host, button.dataset.value);
    repaint();
  });
  root.addEventListener('change', (event) => {
    if (event.target.id !== 'bt-sn-days') return;
    repaint();
  });
}
