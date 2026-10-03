// ۳۱۸. گزارش آزمون نمودارهای نوسان ضمنی — نسخهٔ ۴۰b2533 (۱۴۰۵/۰۷/۱۱)
//
// دو ایراد P1 در مرورگر بازتولید شده بود و چهار P2 با عدد و کد:
//
//   الف  پایان بازه: امروز و شاخصِ پس از پایان بازه وارد نمودار و خلاصه می‌شد
//   ب    نمودار بازه با تیک بازار تازه نمی‌شد (فقط با «رسم نمودار»)
//   ج    روزِ معاملاتیِ بی‌داده از محور حذف و دو سویش به هم وصل می‌شد
//   د    قیمت مثبت با حجم صفر نوسانِ ظاهراً معتبر می‌ساخت (شاخص کنارش می‌گذاشت)
//   هـ   نبود نوسان، قیمت و حجم و موقعیت باز را هم پنهان می‌کرد
//   و    بازهٔ بلند بی‌صدا به ۶۰ روز آخر کوتاه می‌شد (آزمون سرور واقعی در ۳۱۷)
//   ز    شفافیت: منبع قیمت و پرچم شاخص در راهنما، تفاوت مبنا کنار نمودار،
//        و به‌روزرسانی درجا بی ازدست‌رفتن بزرگ‌نمایی

import { check, group, readSrc } from '../harness.mjs';
import { defaults } from '../../core/settings.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { volTime } from '../../core/vol-clock.mjs';
import { panelObservations, liveObservations } from '../../core/vol-rank.mjs';
import { intradayContext } from '../../core/vol-intraday.mjs';
import { contractDailySeries, contractIntradaySeries, underlyingDailySeries } from '../../core/iv-chart.mjs';
import { rangeOption, masterOption, masterSummary, gapWhy } from '../../ui/iv-charts-options.mjs';

const settings = defaults();
const S = 10000, expiry = 20261118, date = 20260927, second = 36000;
const contract = { ins: '101', kind: 'call', strike: S, expiry };
const price = bsPrice('call', S, S, 52 / 365, settings.rFree, 0, 0.55);
const baseRows = [{ date, close: S, vol: 100 }];
const tokens = { ink: '#000', muted: '#666', line: '#ccc', lineSoft: '#eee', accent: '#06c', accent2: '#0a6', warn: '#c60', series: ['#1', '#2', '#3'], palette: ['#a', '#b'] };
const view = readSrc('../ui/iv-charts-view.mjs');

group('۳۱۸-الف. پایان بازه پس از ترکیب همهٔ منبع‌ها');
{
  const live = { date: 20261004, spot: S, price: bsPrice('call', S, S, 45 / 365, settings.rFree, 0, 0.6), volume: 50 };
  const args = { contract, settings, baseRows, days: [date], panels: { [date]: { 101: [price, price, 100, 10, 0] } }, live };
  check('بی کران: امروز اضافه می‌شود (رفتار بازهٔ تا امروز)', contractDailySeries(args).map((r) => r.date).join() === `${date},20261004`);
  const rows = contractDailySeries({ ...args, from: 20260920, to: date });
  check('بازهٔ تاریخی: امروزِ بیرون از بازه وارد نمی‌شود', rows.map((r) => r.date).join() === String(date));
  check('و خلاصه «امروز» را آخرین نمی‌گوید', !masterSummary(rows).includes('زنده'));
  const idx = underlyingDailySeries({ rows: [{ date: 20260920, ivPct: 50 }, { date, ivPct: 55 }, { date: 20260930, ivPct: 58 }, { date: 20261004, ivPct: 60, live: true }] }, { from: 20260921, to: date });
  check('شاخص پایه هم کران پایان دارد (محور سررسید گشاد نمی‌شود)', idx.map((r) => r.date).join() === String(date));
  check('رابط: امروز فقط وقتی در بازهٔ نمودار است', view.includes('if (data && (session.date < data.from || session.date > data.to)) return null;'));
  check('رابط: هر دو سری روزانه کران بازه را می‌گیرند', view.includes('oi: data.oi, from: data.from, to: data.to });') && view.includes('settings: getSettings(), days, from: data.from, to: data.to,'));
}

group('۳۱۸-ب. نمودار بازه با تیک بازار تازه می‌شود');
{
  const paint = view.slice(view.indexOf('    paint() {'), view.indexOf('    resize()'));
  check('هر تیک تازه‌سازی امروزِ نمودار بازه را صدا می‌زند، پیش از امضای عکس تابلو', paint.indexOf('refreshRangeToday();') > 0 && paint.indexOf('refreshRangeToday();') < paint.indexOf('if (key === liveSeen) return;'));
  const refresh = view.slice(view.indexOf('function refreshRangeToday()'), view.indexOf('/** وضعیت روزهای نمایش‌داده'));
  check('فقط وقتی بازه امروز را دارد (بازهٔ تاریخی نه)', refresh.includes('!(span.to >= t)') && refresh.includes('if (!primary.days.some((d) => d.date === t)) return;'));
  check('فقط امروز دوباره گرفته می‌شود و روزهای گذشته می‌مانند', refresh.includes('const one = { from: t, to: t, keep: 0 };') && refresh.includes('[...list.filter((pt) => pt.date !== t), ...pts]'));
  check('فاصلهٔ دو دریافت محدود است ولی تیکِ درون فاصله گم نمی‌شود', view.includes('const TODAY_EVERY_MS = 10000;') && refresh.includes('if (!todayTimer) todayTimer = setTimeout('));
  check('پاسخ دیرِ نماد یا بازهٔ دیگر دور ریخته می‌شود', refresh.includes('if (my !== rangeSeq || want !== ua || !rangeApi) return;'));
  check('زمان آخرین دادهٔ امروز در خط وضعیت', view.includes('امروز تا ساعت ${faDigits(momentLabel(lastToday.second))}'));
  check('نمودار با همان نما درجا به‌روز می‌شود و بزرگ‌نمایی می‌ماند', view.includes('if (prev && prev.ctx === ctx) {') && view.includes('withView(build(echarts, tokens), kept, keepLegend)'));
  check('میزبان نمودار نتیجهٔ به‌روزرسانی را برمی‌گرداند', readSrc('../ui/chart-host.mjs').includes('update(next) { if (next) build = next; return paint(); },'));
}

group('۳۱۸-ج. روزِ بی‌داده شکاف می‌سازد');
{
  const ctx = intradayContext(settings, { holidaysKnown: true });
  const day = (d, sig) => {
    const p = bsPrice('call', S, S, volTime({ date: d, second }, expiry, { basis: ctx.params.basis, settings, calendar: ctx.calendar }).years, settings.rFree, 0, sig);
    return { date: d, source: 'record', contracts: { 101: ['call', S, expiry] }, limits: [9000, 11000], moments: [[second, S, 0, second, { 101: [p, p, second, p, second] }]] };
  };
  const days = [day(20260927, 0.55), { date: 20260928, source: 'pending', moments: [], contracts: {} }, day(20260929, 0.65)];
  const pts = contractIntradaySeries(days, '101', ctx);
  const o = rangeOption(pts, { days }, tokens);
  check('روز وسطِ بی‌داده خانهٔ خالی می‌گیرد: [۵۵، تهی، ۶۵]', o.series[0].data.length === 3 && o.series[0].data[1] === null && Math.round(o.series[0].data[0]) === 55 && Math.round(o.series[0].data[2]) === 65, JSON.stringify(o.series[0].data));
  check('برچسب محور و راهنما علت را می‌گویند', o.xAxis.data[1].includes('بی داده') && o.tooltip.formatter([{ dataIndex: 1 }]).includes('ساخته‌نشده'));
  check('شکاف روی نمودار علامت دارد', o.series[0].markLine.data.some((m) => m.xAxis === 1 && m.label?.formatter === 'بی داده'));
  check('بی فهرست روزها (تعطیل در فهرست نیست): شکافی ساخته نمی‌شود', rangeOption(pts, {}, tokens).series[0].data.length === 2);
  check('علت‌ها: در صف، ناموفق با علت، بی ضبط', gapWhy({ source: 'pending', queued: true }) === 'در صف ساخت' && gapWhy({ source: 'failed', why: 'x' }).endsWith(': x') && gapWhy({ source: 'none', why: 'ضبط خاموش' }) === 'ضبط خاموش');
  check('خط وضعیت روزِ بی‌دادهٔ قرارداد و شاخص را یک روز می‌شمارد، هزینه را جمع هر دو', view.includes('pending: pendingDays.size, queued: queuedDays.size, failed: [...failedOf.values()]') && view.includes('cost += (p.length + f.length) * (Number(api.cost?.perDay) || 0);'));
  check('رابط: روزهای هر دو سری به نمودار داده می‌شوند', view.includes('const days = [...(rangeApi.contract?.days || []), ...(rangeApi.index?.days || [])];') && view.includes('indexPoints: rangePoints.index, days,'));
}

group('۳۱۸-د. روزِ بی‌معامله نوسان نمی‌سازد، مثل شاخص');
{
  const make = (vol, trades) => contractDailySeries({ contract, settings, baseRows, panels: { [date]: { 101: [price, price, vol, trades, 0] } } })[0];
  check('روز عادی: ۵۵٪', Math.round(make(100, 10).ivPct) === 55);
  const zero = make(0, 0);
  check('حجم و تعداد صفر با قیمت مثبت: نوسان و قیمت خالی، علت «معامله‌ای نداشت»', Number.isNaN(zero.ivPct) && Number.isNaN(zero.price) && zero.why === 'notTraded' && zero.volume === 0);
  check('همان قاعدهٔ شاخص (`traded: false`)', panelObservations([contract], { [date]: { 101: [price, price, 0, 0, 0] } }).get(date)[0].traded === false);
  const live = contractDailySeries({ contract, settings, baseRows, days: [date], panels: {}, live: { date: 20261004, spot: S, price, volume: 0 } }).at(-1);
  check('امروزِ زندهٔ بی‌معامله هم نوسان نمی‌سازد', live.live && Number.isNaN(live.ivPct) && live.why === 'notTraded');
  check('و شاخص زنده هم همان را کنار می‌گذارد', liveObservations([{ ...contract, uaIns: '1', endDate: expiry, close: price, volume: 0 }], '1')[0].traded === false);
}

group('۳۱۸-هـ. نبود نوسان فقط همان سری را خالی می‌کند');
{
  const row = [{ date, ivPct: NaN, price: 100, volume: 40, oi: 80 }];
  const o = masterOption(row, { show: { price: true, volume: true, oi: true } }, tokens);
  check('قیمت، حجم و موقعیت باز بی نوسان رسم می‌شوند', o !== null && o.series.find((s) => s.id === 'price').data[0] === 100);
  check('همهٔ سری‌های روشن خالی: پیام خالی', masterOption(row, { show: { price: false, volume: false, oi: false } }, tokens) === null);
  check('حجم صفرِ تنها داده حساب نمی‌شود', masterOption([{ date, ivPct: NaN, volume: 0 }], { show: {} }, tokens) === null);
}

group('۳۱۸-ز. شفافیت نمودار بازه');
{
  const o = rangeOption([{ date, second, value: 55, priceSource: 'fallback', source: 'record' }], { indexPoints: [{ date, second, value: 54, flags: ['oneSided', 'rebuilt'], source: 'trades' }] }, tokens);
  const tip = o.tooltip.formatter([{ dataIndex: 0, value: 55, marker: '', seriesName: 'الف' }]);
  check('راهنما: منبع قیمت قرارداد (جایگزین) و منبع روز', tip.includes('آخرین معامله (جایگزین میانه)') && tip.includes('ضبط زنده'), tip);
  check('راهنما: پرچم‌های شاخص', tip.includes('یک سمتِ پایه'));
  check('تفاوت مبنای روزانه و درون‌روزی کنار نمودار گفته می‌شود', view.includes('پس دانهٔ «روزانه» اینجا لزوماً همان عدد نمودار مادر نیست.'));
  check('کوتاه‌شدن بازه در رابط گفته می‌شود، با «روزهای قبل‌تر»', view.includes('const clip = primaryApi.clipped;') && view.includes('data-ivc-range-prev="${clip.from}"'));
}
