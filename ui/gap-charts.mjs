// نمودارهای فاصله — همان یک نگاه که خواسته شد.
//
// «هدف اینه که کاربر بتونه در یک نگاه فاصله و اسپرد رو ببینه و با میزان
// تاریخی و روند تاریخیش مقایسه کنه و ببینه طی مدت باقی‌مانده چند درصد
// می‌تونه سود کنه.»
//
// هر نمودار اینجا یک پرسش دارد و بس. نموداری که دو پرسش را با هم جواب
// می‌دهد، هیچ‌کدام را خوب جواب نمی‌دهد:
//
//   مسیر       فاصله در طول زمان بود، و سقفِ ساختاری کجا بود
//   پرشدگی     همان مسیر، ولی به درصد — تا بازه‌های مختلف قابل مقایسه شوند
//   توزیع      اکنون کجای تاریخِ خودش ایستاده
//   ساعت       الگوی درون‌روزی، اگر الگویی هست
//   عقربه      یک عدد، برای وقتی که فقط یک عدد لازم است
//   اسپارک     همان مسیر، در یک خانهٔ جدول
//
// ═══ چرا اسپارک‌لاین SVG است و ECharts نیست ═══
//
// یک جدول با شصت ردیف یعنی شصت نمودار. شصت نمونهٔ ECharts روی یک صفحه،
// شصت بوم و شصت ناظرِ اندازه است — و همان چیزی که یک بار نخِ اصلی را
// نود ثانیه قفل کرد. اسپارک‌لاین یک `path` است و هیچ عمری ندارد.

import { chartFormat, mountChart } from './chart-host.mjs';
import { faDigits, fmt } from './fmt.mjs';

const finite = (value) => Number.isFinite(value);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/**
 * اسپارک‌لاین — مسیر فاصله در یک خانهٔ جدول.
 *
 * بی محور، بی برچسب، بی راهنما. تنها کاری که می‌کند این است که بگوید
 * «این ردیف بالا می‌رفت یا پایین» — و همان، ردیف را از عددِ تنها جدا
 * می‌کند. عددِ آخر جداگانه نوشته می‌شود چون شکل، عدد نمی‌گوید.
 *
 * `band` سقفِ ساختاری است: خطِ کم‌رنگی که نشان می‌دهد فاصله چقدر تا سقفش
 * مانده. بی آن، مسیرِ صعودی و مسیرِ صعودیِ نزدیک به سقف یکسان دیده
 * می‌شوند در حالی که دومی دیگر جایی برای رفتن ندارد.
 */
export function sparkline(values = [], { band = NaN, width = 92, height = 26, label = '' } = {}) {
  const points = values.filter(finite);
  if (points.length < 2) return `<span class="spark spark-empty" title="${esc(label)}">—</span>`;
  const lo = Math.min(...points, finite(band) ? 0 : Infinity);
  const hi = Math.max(...points, finite(band) ? band : -Infinity);
  const span = hi - lo || 1;
  const x = (i) => (i / (points.length - 1)) * (width - 2) + 1;
  const y = (value) => height - 1 - (((value - lo) / span) * (height - 2));
  const path = points.map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const rising = points[points.length - 1] >= points[0];
  const cap = finite(band)
    ? `<line class="spark-band" x1="1" y1="${y(band).toFixed(1)}" x2="${width - 1}" y2="${y(band).toFixed(1)}"/>` : '';
  return `<svg class="spark ${rising ? 'up' : 'down'}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label || 'روند فاصله')}" preserveAspectRatio="none">`
    + `${cap}<path class="spark-line" d="${path}"/>`
    + `<circle class="spark-dot" cx="${x(points.length - 1).toFixed(1)}" cy="${y(points[points.length - 1]).toFixed(1)}" r="1.8"/></svg>`;
}

/**
 * نوارِ پرشدگی — همان دو درصد، به شکل.
 *
 * عمداً یک نوار است نه دو تا: «پر شده» و «جا دارد» متمم هم‌اند و دو نوارِ
 * جدا این را پنهان می‌کند. یک نوار با دو رنگ، خودش می‌گوید جمعشان صد است.
 */
export function fillBar(gap) {
  if (!gap?.ok) return `<div class="gap-bar gap-bar-empty"><span>${esc(gap?.why || 'فاصله محاسبه نشد')}</span></div>`;
  // بی لنگر، درصدی نیست. استرانگلِ بی قیمت ورود دقیقاً همین است: جمعِ
  // کنونی سنجیده شده ولی «چند درصد از سود گرفته شده» جواب ندارد.
  if (!gap.anchored || !finite(gap.coveragePct)) {
    return `<div class="gap-bar gap-bar-empty"><span>${esc(gap.why || 'لنگری برای درصد نیست')}</span></div>`;
  }
  const filled = Math.max(0, Math.min(100, gap.coveragePct));
  const over = gap.coveragePct > 100;
  // ── ساختارِ بی‌سقف، نیمهٔ دومِ نوار را ندارد ────────────────────────
  //
  // استرانگلِ خرید سقفِ سود ندارد — پایه می‌تواند هر قدر برود. نشان‌دادنِ
  // «چند درصد مانده» برایش یعنی ساختنِ سقفی که وجود ندارد. نوار همان
  // نسبت را نشان می‌دهد و صریح می‌گوید سقفی در کار نیست.
  if (gap.unbounded) {
    return `<div class="gap-bar unbounded" role="img" aria-label="${fmt.pct(gap.coveragePct)} درصد ${esc(gap.coverageLabel)}">
      <b style="--fill:${Math.min(100, filled).toFixed(2)}%"></b>
      <span class="gap-bar-filled">${fmt.pct(gap.coveragePct)}٪ ${esc(gap.coverageLabel)}</span>
      <span class="gap-bar-room">سقف ندارد</span>
    </div>`;
  }
  // برچسب از خودِ اندازه‌گیری می‌آید، نه ثابت. در اسپرد «پر شده / جا
  // دارد» و در استرانگل «سودِ گرفته‌شده / سودِ باقی‌مانده» — یک نوار، دو
  // معنی، و معنی باید نوشته شود.
  const filledLabel = gap.coverageLabel || 'پر شده';
  const roomLabel = gap.roomLabel || 'باقی‌مانده';
  // زیر آب: درصدِ منفی وسطِ ستونی از درصدهای مثبت گم می‌شود. رنگ و واژه
  // هر دو لازم‌اند — رنگ برای دیدن، واژه برای خواندن با صفحه‌خوان.
  const tone = gap.underwater ? ' underwater' : over ? ' over' : '';
  if (gap.underwater) {
    return `<div class="gap-bar underwater" role="img" aria-label="در زیان، ${fmt.pct(Math.abs(gap.coveragePct))} درصد از بیشینهٔ سود">
      <b style="--fill:${Math.min(100, Math.abs(gap.coveragePct)).toFixed(2)}%"></b>
      <span class="gap-bar-filled">در زیان · ${fmt.pct(gap.coveragePct)}٪</span>
      <span class="gap-bar-room">${fmt.pct(gap.roomPct)}٪ ${esc(roomLabel)}</span>
    </div>`;
  }
  return `<div class="gap-bar${tone}" role="img" aria-label="${fmt.pct(gap.coveragePct)} درصد ${esc(filledLabel)}">
    <b style="--fill:${filled.toFixed(2)}%"></b>
    <span class="gap-bar-filled">${fmt.pct(gap.coveragePct)}٪ ${esc(filledLabel)}</span>
    <span class="gap-bar-room">${fmt.pct(gap.roomPct)}٪ ${esc(roomLabel)}</span>
  </div>`;
}

/** مسیر فاصله در طول زمان، با نوارِ سقفِ ساختاری. */
export function gapPathChart(series, { anchor = NaN, title = '' } = {}) {
  return (echarts, tokens) => {
    const points = series?.points || [];
    if (!points.length) return null;
    const labels = points.map((point) => point.label);
    return {
      title: title ? { text: title, left: 0, top: 0, textStyle: { fontSize: 12, color: tokens.muted } } : undefined,
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value) => chartFormat.money(value),
      },
      legend: { bottom: 0, textStyle: { color: tokens.muted } },
      xAxis: {
        type: 'category', data: labels, boundaryGap: false,
        axisLabel: { color: tokens.muted, formatter: chartFormat.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.line } },
      },
      yAxis: {
        type: 'value', scale: true,
        axisLabel: { color: tokens.muted, formatter: chartFormat.money },
        splitLine: { lineStyle: { color: tokens.lineSoft } },
      },
      dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 26, height: 16 }],
      series: [
        {
          name: 'فاصلهٔ اکنون', type: 'line', smooth: false, symbol: 'none',
          data: points.map((point) => point.current),
          lineStyle: { width: 2, color: tokens.accent },
          areaStyle: { color: tokens.accentSoft, opacity: .5 },
          // خطِ سقف روی همین سری می‌نشیند تا در راهنما هم دیده شود.
          markLine: finite(anchor) ? {
            silent: true, symbol: 'none',
            label: { formatter: 'سقفِ ساختاری', color: tokens.muted, position: 'insideEndTop' },
            lineStyle: { color: tokens.warn, type: 'dashed' },
            data: [{ yAxis: anchor }],
          } : undefined,
        },
      ],
    };
  };
}

/**
 * درصد پرشدگی در طول زمان.
 *
 * چرا جدا از مسیر: مسیر به ریال است و دو ترکیب با عرض‌های متفاوت روی آن
 * قابل مقایسه نیستند. درصد، هر دو را روی یک محور می‌آورد.
 */
export function coverageChart(series) {
  return (echarts, tokens) => {
    const points = series?.points || [];
    if (!points.length) return null;
    return {
      tooltip: { trigger: 'axis', valueFormatter: (value) => chartFormat.pct(value) },
      legend: { bottom: 0, textStyle: { color: tokens.muted } },
      xAxis: {
        type: 'category', data: points.map((point) => point.label), boundaryGap: false,
        axisLabel: { color: tokens.muted, formatter: chartFormat.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.line } },
      },
      yAxis: {
        type: 'value', min: 0, max: (value) => Math.max(100, Math.ceil(value.max / 10) * 10),
        axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
        splitLine: { lineStyle: { color: tokens.lineSoft } },
      },
      dataZoom: [{ type: 'inside' }],
      series: [
        {
          name: 'پر شده', type: 'line', stack: 'cover', areaStyle: { opacity: .55 },
          symbol: 'none', lineStyle: { width: 0 },
          itemStyle: { color: tokens.accent },
          data: points.map((point) => point.coveragePct),
        },
        {
          name: 'جا برای پر شدن', type: 'line', stack: 'cover', areaStyle: { opacity: .18 },
          symbol: 'none', lineStyle: { width: 0 },
          itemStyle: { color: tokens.gain },
          data: points.map((point) => Math.max(0, point.roomPct)),
        },
      ],
    };
  };
}

/**
 * توزیع تاریخی، با نشانگرِ «اکنون».
 *
 * سطل‌ها از دامنهٔ خودِ داده ساخته می‌شوند نه از عددِ گرد. عددِ گرد در
 * دامنه‌ای که همه‌اش میان ۶۰۰ تا ۷۰۰ هزار است، همه را در یک سطل می‌ریخت.
 */
export function distributionChart(series, current, { bins = 18 } = {}) {
  return (echarts, tokens) => {
    const values = (series?.points || []).map((point) => point.current).filter(finite);
    if (values.length < 3) return null;
    const lo = Math.min(...values), hi = Math.max(...values);
    const step = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const value of values) counts[Math.min(bins - 1, Math.floor((value - lo) / step))] += 1;
    const labels = counts.map((_, i) => fmt.money(lo + (step * (i + 0.5))));
    const at = finite(current) ? Math.min(bins - 1, Math.max(0, Math.floor((current - lo) / step))) : -1;
    return {
      tooltip: { trigger: 'axis', valueFormatter: (value) => `${chartFormat.int(value)} نقطه` },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { color: tokens.muted, formatter: chartFormat.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.line } },
      },
      yAxis: {
        type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.int },
        splitLine: { lineStyle: { color: tokens.lineSoft } },
      },
      series: [{
        type: 'bar', data: counts.map((count, i) => ({
          value: count,
          // سطلی که «اکنون» در آن است رنگِ تأکید می‌گیرد. بی این، خواننده
          // باید عددِ بالای صفحه را با محور تطبیق بدهد.
          itemStyle: { color: i === at ? tokens.accent : tokens.muted, opacity: i === at ? 1 : .4 },
        })),
        barCategoryGap: '18%',
      }],
    };
  };
}

/**
 * نقشهٔ حرارتی روز × ساعت — الگوی درون‌روزی، اگر هست.
 *
 * خانهٔ بی‌داده خالی می‌ماند، نه صفر. صفر در مقیاس رنگ، «کمترین فاصله» را
 * می‌گوید و آن با «معامله‌ای نشد» یکی نیست.
 */
export function hourHeatmap(rows = []) {
  return (echarts, tokens) => {
    const clean = rows.filter((row) => finite(row?.value));
    if (!clean.length) return null;
    const days = [...new Set(clean.map((row) => row.day))];
    const hours = [...new Set(clean.map((row) => row.hour))].sort((a, b) => Number(a) - Number(b));
    const values = clean.map((row) => row.value);
    return {
      tooltip: { position: 'top', formatter: (item) => `${faDigits(days[item.value[1]])} · ${faDigits(hours[item.value[0]])}<br><b>${chartFormat.money(item.value[2])}</b>` },
      grid: { left: 72, right: 24, top: 16, bottom: 64, containLabel: true },
      xAxis: { type: 'category', data: hours.map((hour) => faDigits(String(hour))), splitArea: { show: true }, axisLabel: { color: tokens.muted } },
      yAxis: { type: 'category', data: days.map((day) => faDigits(String(day))), splitArea: { show: true }, axisLabel: { color: tokens.muted } },
      visualMap: {
        min: Math.min(...values), max: Math.max(...values),
        calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
        textStyle: { color: tokens.muted }, formatter: chartFormat.money,
        inRange: { color: [tokens.panel2, tokens.accent] },
      },
      series: [{
        type: 'heatmap',
        data: clean.map((row) => [hours.indexOf(row.hour), days.indexOf(row.day), row.value]),
        itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
      }],
    };
  };
}

/** عقربهٔ پرشدگی — یک عدد، وقتی فقط یک عدد لازم است. */
export function fillGauge(gap) {
  return (echarts, tokens) => {
    if (!gap?.ok) return null;
    return {
      series: [{
        type: 'gauge', min: 0, max: 100, startAngle: 200, endAngle: -20,
        radius: '92%', center: ['50%', '62%'],
        progress: { show: true, width: 14, itemStyle: { color: tokens.accent } },
        axisLine: { lineStyle: { width: 14, color: [[1, tokens.panel2]] } },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { color: tokens.line } },
        axisLabel: { color: tokens.muted, distance: 14, formatter: (value) => faDigits(String(value)) },
        pointer: { itemStyle: { color: tokens.ink } },
        detail: {
          valueAnimation: true, offsetCenter: [0, '38%'],
          formatter: (value) => `${fmt.pct(value)}٪ پر`,
          color: tokens.ink, fontSize: 18,
        },
        data: [{ value: Math.max(0, Math.min(100, gap.coveragePct)) }],
      }],
    };
  };
}

/** میان‌برِ سوارکردن: نمودار را می‌سازد و اگر داده نبود، جمله می‌نویسد. */
export const paintGap = (group, key, host, build, empty) => group.set(key, host, build, { empty });

export { mountChart };

// ═══════════════════ نمودارهای فاصله‌ای ═══════════════════
//
// «نمودارهای خطی بساز، نمودارهای فاصله‌ای، انواع نمودارها؛ همچنین رفتار
// این تفاوت یا جمع رو با دارایی پایه بسنج در نمودار.»
//
// نمودارِ خطیِ حاصلِ تفریق، خودش نصفِ حقیقت است: می‌گوید فاصله ۱٬۴۴۰ است
// و نمی‌گوید از ۲٬۰۴۰ منهای ۶۰۰ آمده یا از ۹٬۰۴۰ منهای ۷٬۶۰۰. برای
// معامله‌گر آن دو عدد خودشان تصمیم‌اند — یکی‌شان می‌تواند اصلاً مظنه
// نداشته باشد.
//
// پس دو خط رسم می‌شوند و **فضای میانشان** رنگ می‌گیرد. همان فضا، خودِ
// فاصله است.

const bandStack = (values, floor) => values.map((value, i) => (finite(value) && finite(floor[i])
  ? value - floor[i] : null));

/**
 * دو نرخ، و فاصله‌شان.
 *
 * `mode: 'spread'` — دو خط، و فضای میانشان. کفِ نوار پایین‌ترین پاست.
 * `mode: 'sum'`    — دو ناحیهٔ روی‌هم از صفر؛ ارتفاع کل، جمعِ دو پرمیوم
 *                    است. برای استرانگل، چون آنجا فاصله «جمع» است نه
 *                    «تفاضل»، و آب‌شدنِ همان ارتفاع، سودِ استراتژی است.
 */
export function gapBandChart(series, { mode = 'spread', anchor = NaN, anchorLabel = '' } = {}) {
  return (echarts, tokens) => {
    const points = series?.points || [];
    if (!points.length || !points[0].legs?.length) return null;
    const labels = points.map((point) => point.label);
    const names = points[0].legs.map((leg) => `${leg.side === 'sell' ? 'فروش' : 'خرید'} ${leg.name}`);
    const columns = points[0].legs.map((_, i) => points.map((point) => {
      const value = point.legs?.[i]?.scaled;
      return finite(value) ? Math.abs(value) : null;
    }));

    const marker = finite(anchor) ? {
      silent: true, symbol: 'none',
      label: { formatter: anchorLabel || 'لنگر', color: tokens.warn, position: 'insideEndTop' },
      lineStyle: { color: tokens.warn, type: 'dashed', width: 2 },
      data: [{ yAxis: anchor }],
    } : undefined;

    const shell = {
      tooltip: { trigger: 'axis', valueFormatter: (value) => chartFormat.money(value) },
      legend: { bottom: 0, textStyle: { color: tokens.muted } },
      xAxis: {
        type: 'category', data: labels, boundaryGap: false,
        axisLabel: { color: tokens.muted, formatter: chartFormat.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.line } },
      },
      yAxis: {
        type: 'value', scale: mode === 'spread',
        axisLabel: { color: tokens.muted, formatter: chartFormat.money },
        splitLine: { lineStyle: { color: tokens.lineSoft } },
      },
      dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 26, height: 16 }],
    };

    if (mode === 'sum') {
      // جمع: دو ناحیه روی هم، از صفر. ارتفاعِ کل همان عددی است که باید
      // آب شود.
      return {
        ...shell,
        series: columns.map((column, i) => ({
          name: names[i], type: 'line', stack: 'sum', symbol: 'none',
          // رنگِ ناحیه صریح نوشته می‌شود. بی آن، دو ناحیهٔ روی‌هم یک
          // تودهٔ یکدست دیده می‌شدند و «کدام پا چقدر از جمع است» — که
          // تمامِ فایدهٔ روی‌هم‌چیدن است — گم می‌شد.
          areaStyle: { color: tokens.series[i % tokens.series.length], opacity: .45 },
          lineStyle: { width: 1.5, color: tokens.series[i % tokens.series.length] },
          itemStyle: { color: tokens.series[i % tokens.series.length] },
          data: column,
          markLine: i === columns.length - 1 ? marker : undefined,
        })),
      };
    }

    // تفاضل: کفِ نوار پایین‌ترین پا در هر نقطه است.
    const floor = points.map((_, i) => Math.min(...columns.map((column) => (finite(column[i]) ? column[i] : Infinity))));
    const roof = points.map((_, i) => Math.max(...columns.map((column) => (finite(column[i]) ? column[i] : -Infinity))));
    return {
      ...shell,
      series: [
        {
          name: 'کف', type: 'line', stack: 'band', symbol: 'none', silent: true,
          lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, itemStyle: { opacity: 0 },
          data: floor.map((value) => (finite(value) ? value : null)),
          tooltip: { show: false }, legendHoverLink: false,
        },
        {
          name: 'فاصله', type: 'line', stack: 'band', symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { color: tokens.accent, opacity: .3 },
          itemStyle: { color: tokens.accent },
          data: bandStack(roof, floor),
        },
        ...columns.map((column, i) => ({
          name: names[i], type: 'line', symbol: 'none',
          lineStyle: { width: 2, color: tokens.series[i % tokens.series.length] },
          itemStyle: { color: tokens.series[i % tokens.series.length] },
          data: column,
          markLine: i === 0 ? marker : undefined,
        })),
      ],
    };
  };
}

/**
 * میلهٔ دامنه — برای تایم‌فریمِ هفتگی و ماهانه.
 *
 * سطلِ تجمیع‌شده چهار عدد دارد و خطِ ساده سه‌تایش را دور می‌ریزد. میله
 * می‌گوید فاصله در آن هفته **کجاها** رفت، نه فقط کجا بست.
 */
export function rangeChart(series) {
  return (echarts, tokens) => {
    const points = (series?.points || []).filter((point) => finite(point.open));
    if (points.length < 2) return null;
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (rows) => {
          const at = rows[0]?.dataIndex ?? 0;
          const point = points[at];
          return `${faDigits(point.label)}<br>باز ${chartFormat.money(point.open)}<br>بیشینه ${chartFormat.money(point.high)}<br>کمینه ${chartFormat.money(point.low)}<br>بسته ${chartFormat.money(point.close)}<br>${fmt.int(point.days)} روز`;
        },
      },
      xAxis: {
        type: 'category', data: points.map((point) => point.label),
        axisLabel: { color: tokens.muted, formatter: chartFormat.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.line } },
      },
      yAxis: {
        type: 'value', scale: true,
        axisLabel: { color: tokens.muted, formatter: chartFormat.money },
        splitLine: { lineStyle: { color: tokens.lineSoft } },
      },
      dataZoom: [{ type: 'inside' }],
      series: [{
        type: 'candlestick',
        data: points.map((point) => [point.open, point.close, point.low, point.high]),
        itemStyle: {
          color: tokens.gain, color0: tokens.loss,
          borderColor: tokens.gain, borderColor0: tokens.loss,
        },
      }],
    };
  };
}

/**
 * فاصله و دارایی پایه، روی یک زمان و دو محور.
 *
 * دو محور لازم است چون فاصله به ریالِ قرارداد است و پایه به ریالِ سهم؛
 * روی یک محور، خطِ کوچک‌تر کاملاً صاف دیده می‌شود.
 */
export function versusBaseChart(series) {
  return (echarts, tokens) => {
    const points = (series?.points || []).filter((point) => finite(point.current));
    if (points.length < 2 || !points.some((point) => finite(point.basePrice))) return null;
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { color: tokens.muted } },
      grid: { left: 70, right: 70, top: 30, bottom: 56, containLabel: true },
      xAxis: {
        type: 'category', data: points.map((point) => point.label), boundaryGap: false,
        axisLabel: { color: tokens.muted, formatter: chartFormat.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.line } },
      },
      yAxis: [
        { type: 'value', scale: true, name: 'فاصله', nameTextStyle: { color: tokens.accent },
          axisLabel: { color: tokens.muted, formatter: chartFormat.money },
          splitLine: { lineStyle: { color: tokens.lineSoft } } },
        { type: 'value', scale: true, name: 'نماد پایه', nameTextStyle: { color: tokens.muted },
          axisLabel: { color: tokens.muted, formatter: chartFormat.money },
          splitLine: { show: false } },
      ],
      dataZoom: [{ type: 'inside' }],
      series: [
        { name: 'فاصله', type: 'line', symbol: 'none', yAxisIndex: 0,
          lineStyle: { width: 2, color: tokens.accent }, itemStyle: { color: tokens.accent },
          data: points.map((point) => point.current) },
        { name: 'قیمت نماد پایه', type: 'line', symbol: 'none', yAxisIndex: 1,
          lineStyle: { width: 2, color: tokens.muted, type: 'dashed' }, itemStyle: { color: tokens.muted },
          data: points.map((point) => (finite(point.basePrice) ? point.basePrice : null)) },
      ],
    };
  };
}

/**
 * پراکنشِ فاصله در برابر قیمت پایه، با خطِ برازش.
 *
 * سری زمانی می‌گوید «هر دو بالا رفتند»؛ این می‌گوید **رابطه‌شان چیست**.
 * ابرِ بی‌شکل یعنی فاصله به پایه بی‌اعتناست — و برای ساختاری که ادعای
 * خنثی‌بودن دارد، همان چیزی است که باید ببینی.
 */
export function versusBaseScatter(verdict) {
  return (echarts, tokens) => {
    if (!verdict?.ok) return null;
    const rows = verdict.rows;
    const xs = rows.map((row) => row.base);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const line = finite(verdict.slope)
      ? [[lo, verdict.intercept + (verdict.slope * lo)], [hi, verdict.intercept + (verdict.slope * hi)]]
      : [];
    return {
      tooltip: {
        trigger: 'item',
        formatter: (item) => (item.seriesType === 'scatter'
          ? `${faDigits(rows[item.dataIndex]?.label ?? '')}<br>پایه ${chartFormat.money(item.value[0])}<br>فاصله ${chartFormat.money(item.value[1])}`
          : ''),
      },
      xAxis: {
        type: 'value', scale: true, name: 'قیمت نماد پایه',
        nameLocation: 'middle', nameGap: 32, nameTextStyle: { color: tokens.muted },
        axisLabel: { color: tokens.muted, formatter: chartFormat.money },
        splitLine: { lineStyle: { color: tokens.lineSoft } },
      },
      yAxis: {
        type: 'value', scale: true, name: 'فاصله',
        nameTextStyle: { color: tokens.muted },
        axisLabel: { color: tokens.muted, formatter: chartFormat.money },
        splitLine: { lineStyle: { color: tokens.lineSoft } },
      },
      series: [
        { type: 'scatter', symbolSize: 7, itemStyle: { color: tokens.accent, opacity: .65 },
          data: rows.map((row) => [row.base, row.gap]) },
        { type: 'line', symbol: 'none', silent: true, data: line,
          lineStyle: { color: tokens.warn, width: 2, type: 'dashed' } },
      ],
    };
  };
}

/**
 * هر دو، نرمال‌شده به صد در نقطهٔ اول.
 *
 * پرسشِ «کدام بیشتر حرکت کرد» را جواب می‌دهد — همان که دو محورِ جدا
 * عمداً پنهانش می‌کنند، چون هر خط را در محور خودش پر می‌کنند.
 */
export function indexedChart(rows = []) {
  return (echarts, tokens) => {
    if (rows.length < 2) return null;
    return {
      tooltip: { trigger: 'axis', valueFormatter: (value) => chartFormat.pct(value) },
      legend: { bottom: 0, textStyle: { color: tokens.muted } },
      xAxis: {
        type: 'category', data: rows.map((row) => row.label), boundaryGap: false,
        axisLabel: { color: tokens.muted, formatter: chartFormat.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.line } },
      },
      yAxis: {
        type: 'value', scale: true,
        axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
        splitLine: { lineStyle: { color: tokens.lineSoft } },
      },
      dataZoom: [{ type: 'inside' }],
      series: [
        { name: 'فاصله', type: 'line', symbol: 'none',
          lineStyle: { width: 2, color: tokens.accent }, itemStyle: { color: tokens.accent },
          data: rows.map((row) => row.gap),
          markLine: { silent: true, symbol: 'none', lineStyle: { color: tokens.line },
            label: { formatter: 'نقطهٔ شروع', color: tokens.muted }, data: [{ yAxis: 100 }] } },
        { name: 'نماد پایه', type: 'line', symbol: 'none',
          lineStyle: { width: 2, color: tokens.muted, type: 'dashed' }, itemStyle: { color: tokens.muted },
          data: rows.map((row) => row.base) },
      ],
    };
  };
}
