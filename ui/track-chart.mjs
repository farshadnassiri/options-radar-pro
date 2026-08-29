// نمودار خطی مسیر — یک پیاده‌سازی، برای هر تبی که مسیر زمانی می‌کشد.
//
// این تابع در `ui/tabs/backtest.mjs` نوشته شد و همان‌جا ماند تا وقتی فقط یک
// مصرف‌کننده داشت. حالا تب «رصد یونانی و تلاطم» هم دقیقاً همین نمودار را
// می‌خواهد — همان محورها، همان تولتیپ، همان مقیاس ساعت جلسه — و کپی‌کردنش
// یعنی دو نمودار که شش ماه بعد دیگر شبیه هم نیستند.
//
// چیزی در بدنه عوض نشد؛ فقط جایش عوض شد و وابستگی‌هایش صریح وارد شدند.

import { historyDateLabel } from '../core/history.mjs';
import { INTRADAY_START_SECOND, INTRADAY_END_SECOND } from '../core/backtest.mjs';
import { fmt, faDigits, signTone } from './fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[c]));
const dateLabel = (value) => faDigits(historyDateLabel(value));
const clockLabel = (second) => {
  const value = Math.max(0, Math.trunc(Number(second) || 0));
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

// پای استراتژی حداکثر چهار تاست، پس چهار اسلات اول کافی است و چرخش لازم
// نمی‌شود. `--accent` و `--cmp*` کنار گذاشته شدند: اولی رنگ رابط است و
// دومی‌ها با هم و با رنگ وضعیت، جداپذیریِ سنجیده‌شده ندارند.
export const LEG_COLORS = Array.from({ length: 5 }, (_, index) => `var(--series-${index + 1})`);

/**
 * عنوان محور، افقی و عمودی.
 *
 * برچسب عددی و عنوان محور دو کار جدا می‌کنند: عدد را می‌خوانی، عنوان را یک
 * بار می‌بینی و می‌فهمی واحد چیست. بدون عنوان، «۱۲٬۵۰۰» می‌تواند ریال باشد
 * یا قرارداد یا درصد — و نمودار بی‌واحد، نموداری است که باید حدس بزنی.
 *
 * عنوان عمودی چرخانده می‌شود چون در قاب باریکِ سمت چپ افقی جا نمی‌شود؛
 * زاویه ‎−۹۰‎ است تا از پایین به بالا خوانده شود، همان قراردادی که همه‌جا هست.
 */
export function axisTitles(xLabel, yLabel, geo) {
  const { W, H, L, R, T, B } = geo;
  const cx = L + (W - L - R) / 2;
  const cy = T + (H - T - B) / 2;
  return `${xLabel ? `<text class="axis-title" x="${cx}" y="${H - 6}" text-anchor="middle">${xLabel}</text>` : ''}
    ${yLabel ? `<text class="axis-title" x="${16}" y="${cy}" text-anchor="middle" transform="rotate(-90 16 ${cy})">${yLabel}</text>` : ''}`;
}

/**
 * عددِ یک میدان، یا `NaN` اگر نبود.
 *
 * `Number(null)` صفر است — و صفر روی نمودار یک نقطهٔ واقعی است، نه شکاف.
 * پس نبودِ داده با `Number.isFinite(Number(x))` سنجیده نمی‌شود، وگرنه
 * «سود این لحظه نامعلوم است» به «سود این لحظه صفر بود» تبدیل می‌شود و
 * کاربر از شکل نمودار نتیجه می‌گیرد.
 */
const cell = (row, key) => {
  const raw = row?.[key];
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
};

export function chart(host, points, series, { money = false, count = false, timeScale = false, step = false, xLabel, yLabel } = {}) {
  // ── ردیفِ بی‌داده حذف نمی‌شود، فقط از دو سر بریده می‌شود ────────────
  //
  // پیش از این هر ردیفِ بی‌عدد از فهرست بیرون می‌رفت. نتیجه‌اش دو خطا با
  // هم بود: شکافِ میانی اصلاً دیده نمی‌شد، و در مقیاس اندیسی نقطه‌های
  // بعدی به چپ می‌لغزیدند، پس محور زمان دروغ می‌گفت. حالا فقط ردیف‌های
  // بی‌دادهٔ ابتدا و انتها بریده می‌شوند — آن‌ها فضای مرده‌اند، نه شکاف —
  // و هر شکافِ میانی سرِ جایش می‌ماند.
  const filled = points.map((point) => series.some((item) => Number.isFinite(cell(point, item.key))));
  const firstFilled = filled.indexOf(true);
  const rows = firstFilled === -1 ? [] : points.slice(firstFilled, filled.lastIndexOf(true) + 1);
  if (rows.filter((_, index) => filled[firstFilled + index]).length < 2) {
    host.innerHTML = '<p class="empty-note">برای نمودار دست‌کم دو نقطه معتبر لازم است.</p>'; return;
  }
  const W = 900, H = 348, L = 104, R = 28, T = 28, B = 68;
  const values = rows.flatMap((row) => series.map((item) => cell(row, item.key)).filter(Number.isFinite));
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  if (Math.abs(hi - lo) < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo = count ? 0 : lo - pad; hi += pad;
  const x = (row, index) => timeScale
    ? L + ((Math.max(INTRADAY_START_SECOND, Math.min(INTRADAY_END_SECOND, Number(row.second))) - INTRADAY_START_SECOND) / (INTRADAY_END_SECOND - INTRADAY_START_SECOND)) * (W - L - R)
    : L + (index / Math.max(1, rows.length - 1)) * (W - L - R);
  const y = (value) => T + ((hi - value) / (hi - lo)) * (H - T - B);
  const label = (value) => money ? fmt.money(value) : count ? fmt.int(value) : fmt.pct(value);
  // در تولتیپ، واحد باید کنار عدد باشد. روی محور، عنوان محور واحد را
  // می‌گوید و تکرارش روی پنج برچسب فقط شلوغی است؛ ولی تولتیپ عنوان محور را
  // کنارش ندارد و «۱۲٫۳۵» تنها، نه ریال است نه درصد.
  const tipLabel = (value) => money || count ? label(value) : `${label(value)}٪`;
  const ticks = Array.from({ length: 5 }, (_, index) => lo + ((hi - lo) * index) / 4);
  // یک خط منطقی می‌تواند بین دو نام میدان تقسیم شده باشد (سطر روزانه
  // `baseCumulativePct`، سطر ریزمعامله `basePct`). آن‌ها هم‌رنگ‌اند چون یک
  // چیزند؛ پس راهنما هم باید یک چیپ نشان دهد، نه دو چیپ هم‌رنگ با دو نام.
  const legend = series.filter((item, index) => series.findIndex((other) => other.label === item.label) === index);
  // برچسب سری تا امروز رشته ثابتِ خودِ کد بود؛ حالا نام قرارداد بالادست هم
  // درونش می‌نشیند. هر جای دیگر این فایل نام را با esc می‌نویسد. اینجا هم
  // باید — و در خودِ chart، تا فراخوان بعدی نتواند دوباره فراموشش کند.
  const seriesLabel = (item) => esc(item.label);

  const timeTicks = timeScale ? [9 * 3600, 10 * 3600, 11 * 3600, 12 * 3600, INTRADAY_END_SECOND] : [];
  // ── شکافِ داده با خط پر نمی‌شود ─────────────────────────────────────
  //
  // پیش از این همهٔ نقاطِ معتبر یک سری، بی‌توجه به فاصله‌شان، به یک چندخطی
  // وصل می‌شدند؛ یعنی نقطه‌ای که داده نداشت با یک خط مستقیم پُر می‌شد.
  // آن خط، دادهٔ ساختگی است: کاربر مسیری می‌بیند که هیچ‌وقت مشاهده نشده و
  // از شکلش نتیجه می‌گیرد. حالا هر بازهٔ پیوسته خطِ خودش را دارد و شکاف،
  // شکاف می‌ماند.
  const runsOf = (item) => {
    const runs = [];
    let run = [];
    rows.forEach((row, index) => {
      const value = cell(row, item.key);
      if (Number.isFinite(value)) run.push({ x: x(row, index), y: y(value) });
      else if (run.length) { runs.push(run); run = []; }
    });
    if (run.length) runs.push(run);
    return runs;
  };
  const seriesShape = (item) => runsOf(item).map((values) => {
    // نقطهٔ تنها میان دو شکاف خط نمی‌شود؛ بدون دایره اصلاً دیده نمی‌شد و
    // «داده نبود» با «داده بود ولی نکشیدیمش» یکی به نظر می‌رسید.
    if (values.length === 1) return `<circle cx="${values[0].x}" cy="${values[0].y}" r="3" fill="${item.color}"/>`;
    if (!step) return `<polyline fill="none" stroke="${item.color}" points="${values.map((point) => `${point.x},${point.y}`).join(' ')}"/>`;
    const d = values.slice(1).reduce((path, point) => `${path} H ${point.x} V ${point.y}`, `M ${values[0].x} ${values[0].y}`);
    return `<path fill="none" stroke="${item.color}" d="${d}"/>`;
  }).join('');

  host.innerHTML = `<div class="backtest-chart-legend">${legend.map((item) => `<span style="--series:${item.color}"><i></i>${seriesLabel(item)}</span>`).join('')}</div><div class="backtest-chart-stage"><svg viewBox="0 0 ${W} ${H}" tabindex="0" aria-label="نمودار تعاملی بک‌تست">
    ${ticks.map((value) => `<line x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}" class="backtest-grid"/><text x="${L - 10}" y="${y(value) + 4}" text-anchor="end">${label(value)}</text>`).join('')}
    ${timeTicks.map((second) => `<line x1="${x({ second }, 0)}" x2="${x({ second }, 0)}" y1="${T}" y2="${H - B}" class="backtest-time-grid"/><text x="${x({ second }, 0)}" y="${H - B + 22}" text-anchor="middle">${faDigits(clockLabel(second).slice(0, 5))}</text>`).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="backtest-zero"/>
    ${axisTitles(
      xLabel ?? (timeScale ? 'ساعت جلسه — ۹:۰۰ تا ۱۲:۳۰' : 'مسیر زمانی'),
      yLabel ?? (money ? 'ریال' : count ? 'تعداد' : 'درصد'),
      { W, H, L, R, T, B })}
    ${series.map(seriesShape).join('')}
    <g class="backtest-cursor" hidden><line y1="${T}" y2="${H - B}"/><g></g></g>
    <rect class="backtest-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
  </svg><div class="backtest-tip" hidden></div></div>`;
  const svg = host.querySelector('svg'), cursor = host.querySelector('.backtest-cursor'), tip = host.querySelector('.backtest-tip');
  const show = (index, clientX, clientY) => {
    const row = rows[index], px = x(row, index);
    cursor.hidden = false;
    cursor.querySelector('line').setAttribute('x1', px); cursor.querySelector('line').setAttribute('x2', px);
    cursor.querySelector('g').innerHTML = series.map((item) => Number.isFinite(cell(row, item.key)) ? `<circle cx="${px}" cy="${y(cell(row, item.key))}" r="4" fill="${item.color}"/>` : '').join('');
    // تاریخ نقطه، از خودِ نقطه. اگر نقطه تاریخ نداشته باشد، «—» درست‌تر از
    // «NaN/NaN/NaN» است و درست‌تر از تاریخی که از جای دیگری قرض گرفته شده.
    const stamp = Number.isFinite(Number(row.date)) ? dateLabel(row.date) : '—';
    const when = row.granularity === 'trade'
      ? `${stamp} · ${faDigits(row.timeLabel ?? '')}`
      : faDigits(row.dateLabel || (Number.isFinite(Number(row.date)) ? historyDateLabel(row.date) : '—'));
    tip.innerHTML = `<b>${when}</b>${series.map((item) => Number.isFinite(cell(row, item.key)) ? `<span style="--series:${item.color}"><i></i>${seriesLabel(item)}: <strong class="${signTone(cell(row, item.key))}">${tipLabel(cell(row, item.key))}</strong></span>` : '').join('')}`;
    tip.hidden = false;
    const box = host.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(box.width - 190, clientX - box.left + 12))}px`;
    tip.style.top = `${Math.max(8, clientY - box.top - 75)}px`;
  };
  const move = (event) => {
    const rect = svg.getBoundingClientRect();
    const ux = ((event.clientX - rect.left) / rect.width) * W;
    let index;
    if (timeScale) {
      const target = INTRADAY_START_SECOND + ((ux - L) / (W - L - R)) * (INTRADAY_END_SECOND - INTRADAY_START_SECOND);
      let low = 0, high = rows.length - 1;
      while (low < high) { const middle = Math.floor((low + high) / 2); if (rows[middle].second < target) low = middle + 1; else high = middle; }
      index = low > 0 && Math.abs(rows[low - 1].second - target) < Math.abs(rows[low].second - target) ? low - 1 : low;
    } else index = Math.round(((ux - L) / (W - L - R)) * (rows.length - 1));
    index = Math.max(0, Math.min(rows.length - 1, index));
    show(index, event.clientX, event.clientY);
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => { cursor.hidden = true; tip.hidden = true; });
}
