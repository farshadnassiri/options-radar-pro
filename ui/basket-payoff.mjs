// نمودار «بازده سبد در برابر قیمت نماد پایه».
//
// محور افقی قیمت است، نه زمان. زمان از محور بیرون می‌رود ولی حذف نمی‌شود:
// نقطه‌ها به ترتیب زمان به هم وصل‌اند و رنگشان از کم‌رنگ (اول دوره) به
// پررنگ (آخر دوره) می‌رود. بی این، منحنی‌ای که از روی خودش رد می‌شود —
// و منحنی هر سبد اختیاری از روی خودش رد می‌شود — خوانا نیست.
//
// خط‌چینِ دوم میانگین بازده در هر پلهٔ قیمت است. در دانه‌بندی یک‌دقیقه‌ای
// چند صد نقطه روی هم می‌افتند و مسیرِ خام کلاف می‌شود؛ آن خط شکلِ زیرین
// را نشان می‌دهد.

import { faDigits } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';
import { payoffBins, payoffPoints, payoffSlope } from '../core/basket-payoff.mjs';

const pctText = (value) => (Number.isFinite(value) ? `${chartFormat.pct(value)}` : '—');

/**
 * گزینهٔ نمودار. اگر هیچ لحظه‌ای هم قیمت پایه داشته و هم ارزش سبد، `null`
 * برمی‌گردد و میزبان پیام خالی خودش را نشان می‌دهد.
 */
export function payoffCurveOption(basket, basePrices, dateLabels, tokens, { bins = 24 } = {}) {
  const shaped = payoffPoints({ basket, basePrices, labels: dateLabels || [] });
  if (shaped.points.length < 2) return null;
  // صفر یعنی «میانگین را نکش» — نه «صفر پله»، که `payoffBins` به دو پله
  // گردش می‌کرد و خطی می‌ساخت که کاربر خاموشش کرده بود.
  const binned = Number(bins) > 0 ? payoffBins(shaped.points, bins) : [];
  const last = shaped.points.length - 1;

  // بعد سوم زمان است و فقط برای رنگ به کار می‌رود؛ روی هیچ محوری نمی‌نشیند.
  const data = shaped.points.map((point, at) => ({
    value: [point.price, point.pct, at],
    name: point.label,
  }));
  const line = shaped.points.map((point) => [point.price, point.pct]);

  const tip = (at) => {
    const point = shaped.points[at];
    if (!point) return '';
    const move = shaped.entryPrice > 0 ? ((point.price / shaped.entryPrice) - 1) * 100 : null;
    return `<b>${faDigits(point.label || '')}</b><br>`
      + `قیمت نماد پایه: <b>${chartFormat.money(point.price)}</b>`
      + (move === null ? '' : ` · ${pctText(move)} از ورود`) + '<br>'
      + `بازده سبد: <b>${pctText(point.pct)}</b>`;
  };

  return {
    grid: { left: 68, right: 28, top: 48, bottom: 78, containLabel: true },
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'slider', xAxisIndex: 0, bottom: 6, height: 16,
        borderColor: tokens.line, fillerColor: tokens.accentSoft, handleStyle: { color: tokens.accent } },
    ],
    // رنگ نقطه‌ها زمان را می‌گوید. نوارش نمایش داده نمی‌شود چون عددِ
    // «اندیس لحظه» به کسی چیزی نمی‌گوید؛ ترتیبِ کم‌رنگ به پررنگ می‌گوید.
    visualMap: {
      show: false, type: 'continuous', dimension: 2, seriesIndex: 1,
      min: 0, max: Math.max(1, last),
      inRange: { color: [tokens.lineSoft, tokens.accent], opacity: [0.55, 1] },
    },
    tooltip: {
      trigger: 'item',
      formatter: (row) => {
        if (row.seriesIndex === 2) {
          const bucket = binned[row.dataIndex];
          if (!bucket) return '';
          return `<b>پلهٔ قیمت</b><br>`
            + `${chartFormat.money(bucket.low)} تا ${chartFormat.money(bucket.high)}<br>`
            + `میانگین بازده: <b>${pctText(bucket.pct)}</b><br>`
            + `شمار لحظه: <b>${chartFormat.int(bucket.samples)}</b>`;
        }
        return tip(row.seriesIndex === 1 ? row.data?.value?.[2] ?? row.dataIndex : row.dataIndex);
      },
    },
    xAxis: {
      // نامِ وسط‌چینِ محور در حساب `containLabel` نمی‌آید؛ فاصله‌اش دستی
      // گرفته شده و `grid.bottom` هم به همان اندازه باز است، وگرنه در قاب
      // کوتاه یا نام بیرون می‌افتد یا برچسب‌ها زیر لغزنده می‌روند.
      type: 'value', scale: true, name: 'قیمت نماد پایه', nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.money, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    yAxis: {
      type: 'value', name: 'بازده سبد', nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: [
      {
        name: 'مسیر به ترتیب زمان', type: 'line', data: line, z: 2,
        // بی‌هموارسازی: هموارکردنِ مسیری که از روی خودش رد می‌شود، شکلی
        // می‌سازد که در داده نبوده.
        smooth: false, showSymbol: false, connectNulls: false,
        lineStyle: { width: 1.4, color: tokens.muted, opacity: 0.55 },
        emphasis: { disabled: true },
      },
      {
        name: 'لحظه‌ها', type: 'scatter', data, z: 3, symbolSize: 9,
        itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
        markLine: {
          silent: true, symbol: 'none',
          label: { color: tokens.muted, formatter: (row) => faDigits(row.name || '') },
          lineStyle: { color: tokens.line, type: 'dashed' },
          data: [
            { yAxis: 0, name: 'سر به سر' },
            ...(shaped.entryPrice === null ? [] : [{ xAxis: shaped.entryPrice, name: 'قیمت ورود' }]),
          ],
        },
        markPoint: {
          symbolSize: 46,
          label: { color: tokens.accentInk, fontSize: 11 },
          itemStyle: { color: tokens.accentSoft, borderColor: tokens.accent, borderWidth: 1 },
          data: [
            { name: 'ورود', value: 'ورود', xAxis: shaped.points[0].price, yAxis: shaped.points[0].pct },
            { name: 'پایان', value: 'پایان', xAxis: shaped.points[last].price, yAxis: shaped.points[last].pct },
          ],
        },
      },
      ...(binned.length ? [{
        name: 'میانگین در هر پلهٔ قیمت', type: 'line', z: 4,
        data: binned.map((bucket) => [bucket.price, bucket.pct]),
        smooth: false, showSymbol: true, symbolSize: 5,
        lineStyle: { width: 2, color: tokens.warn, type: 'dashed' },
        itemStyle: { color: tokens.warn },
      }] : []),
    ],
  };
}

/**
 * حکمِ نمودار در یک جمله: شیب.
 *
 * اول در عنوانِ خودِ نمودار نشست و روی راهنما افتاد. جایش زیر نمودار است —
 * هم جا دارد، هم متنش انتخاب‌شدنی است، هم وقتی نمودار خالی است باز هم
 * دیده می‌شود.
 */
export function payoffSlopeText(slope) {
  if (slope === null || slope === undefined || !Number.isFinite(Number(slope))) return '';
  const value = Math.round(Number(slope) * 100) / 100;
  const tone = Math.abs(value) < 0.15
    ? 'یعنی سبد تقریباً به جهت بازار بی‌اعتنا بوده'
    : `یعنی سبد ${value > 0 ? 'هم‌جهت' : 'خلاف‌جهت'} نماد پایه حرکت کرده`;
  return `حساسیت به پایه: ${faDigits(String(value))} واحد بازده به ازای هر ۱٪ حرکت نماد پایه — ${tone}.`;
}

/** خبرِ زیر نمودار: چند لحظه نقطه شد و چند تا جا ماند و چرا. */
export function payoffNote(basket, basePrices, dateLabels) {
  const shaped = payoffPoints({ basket, basePrices, labels: dateLabels || [] });
  const verdict = payoffSlopeText(payoffSlope(shaped.points, shaped.entryPrice));
  const parts = [`${chartFormat.int(shaped.points.length)} لحظه هم قیمت پایه داشت هم ارزش سبد`];
  if (shaped.skipped.noPrice) parts.push(`${chartFormat.int(shaped.skipped.noPrice)} لحظه قیمت نماد پایه نداشت`);
  if (shaped.skipped.noReturn) parts.push(`${chartFormat.int(shaped.skipped.noReturn)} لحظه دست‌کم یک جزء سبد قیمت نداشت`);
  if (shaped.skipped.noBoth) parts.push(`${chartFormat.int(shaped.skipped.noBoth)} لحظه هیچ‌کدام را نداشت`);
  return `${parts.join(' · ')}.${verdict ? ` ${verdict}` : ''}`;
}
