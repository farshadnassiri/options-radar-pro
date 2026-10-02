// ۳۱۶. تب «نوسان ضمنی» در رصد لحظه‌ای — سه نمودار به‌جای میز تلاطم
//
//   الف  نمودار مادر قرارداد: نوسان ضمنی روزانه با همان `observationIv` شاخص
//        روزانه؛ قیمت، حجم، موقعیت باز؛ روزِ بی‌پرونده و بی‌معامله خالی با علت
//   ب    نمودار مادر شاخص پایه: از تاریخچهٔ `buildVolHistory`، با HV و جمع موقعیت باز
//   ج    قراردادهای یک سررسید: پیش‌فرض نزدیک به پول، افزودن و برداشتن
//   د    بازه و تایم‌فریم: سری درون‌روزی یک قرارداد، بی نشت، صف و پایهٔ کهنه
//   هـ   سازنده‌های نمودار و سیم‌کشی تب، سرور (موقعیت باز روزانه، `ins`)

import { check, group, near, readSrc } from '../harness.mjs';
import { defaults } from '../../core/settings.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { volTime } from '../../core/vol-clock.mjs';
import { observationIv, buildVolHistory, panelObservations, volParams } from '../../core/vol-rank.mjs';
import { intradayContext } from '../../core/vol-intraday.mjs';
import { recordFrame, recordMoments, compactRecordMoments } from '../../core/iv-record.mjs';
import {
  contractDailySeries, underlyingDailySeries, movingAverage, expiriesOf, defaultPicks, contractLabel, contractIntradaySeries,
} from '../../core/iv-chart.mjs';

const settings = defaults();
const S = 10000, expiry = 20261118, SIG = 0.55;
const dates = [20260927, 20260928, 20260929, 20260930, 20261004];
const price = (kind, K, date, sigma = SIG) => bsPrice(kind, S, K, Math.max(1, (Date.UTC(2026, 10, 18) - Date.UTC(Math.trunc(date / 10000), Math.trunc(date % 10000 / 100) - 1, date % 100)) / 864e5) / 365, settings.rFree, 0, sigma);
const contract = { ins: 'c1', kind: 'call', strike: 10000, expiry, symbol: 'ضفزر۷۲۳' };
const baseRows = dates.map((date) => ({ date, close: S, vol: 1000 }));
const panels = {};
for (const date of dates.slice(0, 4)) panels[date] = { c1: [price('call', 10000, date), price('call', 10000, date) * 1.01, 487, 20, 1e9, 0, 0], p1: [price('put', 9500, date), 0, 10, 1, 1e7, 0, 0] };
delete panels[20260929].c1;           // آن روز قرارداد معامله نشد
const oi = { 20260928: { c1: 2764 }, 20260930: { c1: 2800, p1: 100 } };

group('۳۱۶-الف. نمودار مادر قرارداد');
{
  const rows = contractDailySeries({ contract, panels, baseRows, oi, settings, days: dates.slice(0, 4).concat([20261001]) });
  check('هر روز بازه یک ردیف، به ترتیب', rows.map((r) => r.date).join() === '20260927,20260928,20260929,20260930,20261001');
  check('نوسان ضمنی = تلاطم قیمت‌گذاری (۵۵٪)', near(rows[0].ivPct, 55, 0.05) && near(rows[3].ivPct, 55, 0.05), rows.map((r) => r.ivPct?.toFixed(2)).join());
  const direct = observationIv({ kind: 'call', strike: 10000, expiry, price: panels[20260927].c1[0] }, S, 20260927, settings);
  check('همان `observationIv` شاخص روزانه (یک موتور، یک عدد)', rows[0].ivPct === direct.ivPct);
  check('قیمت، حجم و موقعیت باز همان روز', rows[1].price === panels[20260928].c1[0] && rows[1].volume === 487 && rows[1].oi === 2764 && Number.isNaN(rows[0].oi));
  check('روزِ بی‌معامله: خالی با علت «قیمتی نداشت»، حجم صفر', Number.isNaN(rows[2].ivPct) && rows[2].why === 'notTraded' && rows[2].volume === 0);
  check('روزِ بی‌پرونده: خالی با علت «ساخته نشده»', Number.isNaN(rows[4].ivPct) && rows[4].why === 'noPanel');
  const last = contractDailySeries({ contract, panels, baseRows, settings, priceBasis: 'last', days: [20260927] });
  check('مبنای «آخرین معامله» قیمت دیگری و نوسان دیگری', last[0].price === panels[20260927].c1[1] && last[0].ivPct > rows[0].ivPct);
  const live = contractDailySeries({ contract, panels, baseRows, settings, days: dates.slice(0, 4), live: { date: 20261004, spot: S, price: price('call', 10000, 20261004, 0.6), volume: 50, oi: 3000 } });
  check('امروز زنده به ته سری می‌آید، با برچسب', live.at(-1).live === true && near(live.at(-1).ivPct, 60, 0.1) && live.at(-1).oi === 3000);
  const after = contractDailySeries({ contract: { ...contract, expiry: 20260928 }, panels, baseRows, settings, days: dates });
  check('پس از سررسید ردیفی نیست', after.every((r) => r.date <= 20260928));
  check('میانگین متحرک: پنجرهٔ ناقص یا دارای خالی، خالی', movingAverage([1, 2, 3, NaN, 5, 6, 7], 3).map((v) => (Number.isNaN(v) ? 'x' : v)).join() === 'x,x,2,x,x,x,6');
}

group('۳۱۶-ب. نمودار مادر شاخص پایه');
{
  const contracts = [contract, { ins: 'p1', kind: 'put', strike: 9500, expiry }];
  const history = buildVolHistory({ baseRows, observations: panelObservations(contracts, panels), params: volParams({}), settings });
  const rows = underlyingDailySeries(history, { baseRows, oi });
  check('هر روز پایه یک ردیف با قیمت و حجم پایه', rows.length === baseRows.length && rows[0].price === S && rows[0].volume === 1000);
  check('شاخص همان عدد تاریخچهٔ رتبه', rows.every((r, i) => r.ivPct === history.rows[i].ivPct || (Number.isNaN(r.ivPct) && Number.isNaN(history.rows[i].ivPct))));
  check('موقعیت باز = جمع قراردادها؛ روز بی‌ضبط خالی', rows.find((r) => r.date === 20260930).oi === 2900 && Number.isNaN(rows[0].oi));
}

group('۳۱۶-ج. قراردادهای یک سررسید');
{
  const list = [9000, 9500, 10000, 10500, 11000].flatMap((K) => [{ ins: `c${K}`, kind: 'call', strike: K, expiry }, { ins: `p${K}`, kind: 'put', strike: K, expiry }]);
  const both = defaultPicks(list, { expiry, spot: 10100 });
  check('پیش‌فرض: سه اعمال نزدیک پایه از هر نوع', both.length === 6 && both.slice(0, 3).join() === 'c10000,c10500,c9500' && both.includes('p10000'));
  check('فقط کال', defaultPicks(list, { expiry, spot: 10100, kind: 'call' }).every((ins) => ins.startsWith('c')));
  check('سررسیدهای باز اول، سررسیدشده‌ها بعد (تازه‌تر اول)', expiriesOf([{ expiry: 20260901 }, { expiry: 20261118 }, { expiry: 20261021 }, { expiry: 20260801 }], 20261001).join() === '20261021,20261118,20260901,20260801');
  check('برچسب: نماد، وگرنه نوع و اعمال', contractLabel(contract) === 'ضفزر۷۲۳' && contractLabel({ kind: 'put', strike: 9500 }) === 'فروش 9500');
}

group('۳۱۶-د. بازه و تایم‌فریم: سری درون‌روزی یک قرارداد');
{
  const ctx = intradayContext(settings, { holidaysKnown: true });
  const date = 20261005, OPEN = ctx.session.open;
  const years = (second) => volTime({ date, second }, expiry, { basis: ctx.params.basis, settings, calendar: ctx.calendar, expiryMoment: ctx.params.expiryMoment }).years;
  let prev = null;
  const frames = [];
  for (const second of [OPEN + 300, OPEN + 600, OPEN + 900]) {
    const p = bsPrice('call', S, 10000, years(second), settings.rFree, 0, SIG);
    const r = recordFrame([{ uaInsCode: '7', strikePrice: 10000, expiryGregorian: expiry, insCode_C: 'c1', pDrCotVal_UA: S, pClosing_UA: S, qTotTran5J_UA: second,
      pMeDem_C: p * 0.995, pMeOf_C: p * 1.005, pDrCotVal_C: p, qTotTran5J_C: second }], { second, prev });
    prev = r.state; frames.push(r.frame);
  }
  const day = { date, source: 'record', limits: [[0, 9000, 11000]], ...compactRecordMoments(recordMoments(frames, '7', [OPEN + 300, OPEN + 600, OPEN + 900])) };
  const pts = contractIntradaySeries([day], 'c1', ctx);
  check('هر لحظه یک نقطه با نوسان قیمت‌گذاری (۵۵٪)', pts.length === 3 && pts.every((pt) => near(pt.value, 55, 0.05)), pts.map((pt) => pt.value?.toFixed(2)).join());
  check('نوار خرید تا فروش از دفتر سالم', pts.every((pt) => pt.bid < pt.value && pt.value < pt.ask));
  const queued = contractIntradaySeries([{ ...day, limits: [[0, 9000, S]] }], 'c1', ctx);
  check('پایه روی سقف دامنه → خالی با علت «صف»', queued.every((pt) => Number.isNaN(pt.value) && pt.why === 'queue'));
  check('قرارداد ناشناخته → خالی با علت', contractIntradaySeries([day], 'zz', ctx).every((pt) => pt.why === 'noContract'));
  const late = { ...day, moments: day.moments.map((m) => [m[0], m[1], m[2], m[3] - 2000, m[4]]) };
  check('پایهٔ کهنه‌تر از سقف → خالی', contractIntradaySeries([late], 'c1', ctx).every((pt) => pt.why === 'staleBase'));
}

group('۳۱۶-هـ. نمودارها و سیم‌کشی');
{
  const view = await import('../../ui/iv-charts-options.mjs');
  const tokens = { ink: '#000', muted: '#666', line: '#ccc', lineSoft: '#eee', panel: '#fff', panel2: '#f5f5f5', accent: '#06c', accent2: '#0a6', accentSoft: '#cdf', warn: '#c60', warnSoft: '#fdc', series: ['#1', '#2', '#3', '#4', '#5', '#6'], palette: ['#a', '#b', '#c'] };
  const rows = contractDailySeries({ contract, panels, baseRows, oi, settings, days: dates.slice(0, 4) });
  const o = view.masterOption(rows, { show: { volume: false }, title: 'تاریخچهٔ قرارداد ضفزر۷۲۳' }, tokens);
  const ids = o.series.map((s) => s.id).join();
  check('نمودار مادر: نوسان، میانگین، قیمت، حجم، موقعیت باز (و HV فقط برای شاخص)', ids === 'iv,ma,price,volume,oi' && view.masterOption(rows, { index: true }, tokens).series.some((s) => s.id === 'hv'));
  check('سری خاموش در راهنما هم خاموش است', o.legend.selected['حجم'] === false && o.legend.selected['نوسان ضمنی'] === true);
  check('چهار محور: نوسان، قیمت، حجم و موقعیت باز', o.yAxis.length === 4 && o.series.find((s) => s.id === 'volume').yAxisIndex === 2 && o.series.find((s) => s.id === 'oi').yAxisIndex === 3);
  check('بی نوسان: null (پیام خالی)', view.masterOption([{ date: 1, ivPct: NaN }], {}, tokens) === null);
  const tip = o.tooltip.formatter([{ dataIndex: 1 }]);
  check('راهنمای نقطه مثل نمونه: تاریخ، نوسان، قیمت، حجم، موقعیت باز', ['نوسان ضمنی', 'قیمت', 'حجم', 'موقعیت باز', '۲٬۷۶۴'].every((t) => tip.includes(t)) || ['نوسان ضمنی', 'قیمت', 'حجم', 'موقعیت باز'].every((t) => tip.includes(t)), tip);
  const tipEmpty = o.tooltip.formatter([{ dataIndex: 2 }]);
  check('روز خالی در راهنما علتش را می‌گوید', tipEmpty.includes('قیمتی نداشت'));
  const ex = view.expiryOption([{ label: 'الف', rows }, { label: 'ب', rows: [] }], { indexRows: rows }, tokens);
  check('نمودار سررسید: یک خط برای هر قرارداد دارای داده + شاخص', ex.series.length === 2 && ex.series[1].name === 'شاخص پایه');
  const rp = view.rangeOption([{ date: 1, second: 33000, value: 50, bid: 49, ask: 51 }, { date: 2, second: 33000, value: NaN, why: 'queue' }, { date: 2, second: 33300, value: 52 }], { grain: 'm5' }, tokens);
  check('نمودار بازه: مرز روزها با خط، لحظهٔ خالی خالی', rp.series[0].markLine.data[0].xAxis === 1 && rp.series[0].data[1] === null && rp.series.length === 3);
  const html = view.instrumentOptionsHtml([contract, { ins: 'old', kind: 'put', strike: 9000, expiry: 20260901 }], 'c1', { uaName: 'اهرم', today: 20261001 });
  check('فهرست نماد: شاخص پایه، سپس قراردادها به تفکیک سررسید (سررسیدشده برچسب دارد)', html.startsWith('<option value="index"') && html.includes('ضفزر۷۲۳') && html.includes('(سررسیدشده)') && /value="c1" selected/.test(html));
  check('خلاصهٔ نمودار مادر بی رقم لاتین', !/[0-9]/.test(view.masterSummary(rows)), view.masterSummary(rows));

  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('تب جدای «نوسان ضمنی» در رصد لحظه‌ای، درست پس از «نقشه و زنجیره»', /id: 'explorer'[\s\S]{0,600}id: 'iv-charts', title: 'نوسان ضمنی'/.test(dash) && dash.includes('if (mode?.ivCharts) { ivCharts().paint(); return; }'));
  check('نماد از همان نقشه', dash.includes("ivChartsView = mountIvCharts(root.querySelector('[data-iv-charts-host]'), {\n        getSelection: () => marketExplorer.selection(),"));
  const src = readSrc('../ui/iv-charts-view.mjs');
  check('نمودار مادر پیش‌فرض: قرارداد انتخابی نقشه، وگرنه شاخص', src.includes("instrument: sel.contractIns ? String(sel.contractIns) : 'index'"));
  check('تیکِ بی‌تغییر نمودار را از نو نمی‌سازد', src.includes('if (key === liveSeen) return;'));
  check('انتخاب قراردادهای سررسید در حافظه می‌ماند', src.includes('const pickKey = () => `${ua}|${opts.expiry}`;'));
  check('بازه: «N روز اخیر» یعنی N روز معاملاتیِ آخر', src.includes('const days = span.keep ? body.days.slice(-span.keep) : body.days;'));

  const server = readSrc('../server/server.mjs');
  check('سرور: موقعیت باز روزانه از عکس تابلو، فقط وقتی عکس مال امروز است', server.includes("if (!['open', 'after', 'ungated'].includes(phase)) return;") && server.includes('saveDayOi(rows, gate.phase, today)'));
  check('سرور: تاریخچهٔ تلاطم موقعیت باز را برمی‌گرداند', server.includes('const oi = {};') && /return sendJson\(res, 200, \{\s*oi,/.test(server));
  const contractBuild = server.slice(server.indexOf('async function buildIvContractDay'), server.indexOf('/** فقط یک قرارداد از یک روزِ فرم انتقال'));
  check('سرور: بازسازی یک قرارداد هرگز امروز را نمی‌سازد', contractBuild.includes('if (!(day < tehranDateNumber())) return null;'));
  check('سرور: `ins` فقط عدد، و ساخت فقط با build=1', server.includes("if (insWanted && !/^\\d{5,25}$/.test(insWanted))") && server.includes('if (build && pending.length) queueIvBuild(ua, pending, mode, insWanted);'));
  check('موقعیت باز روزانه در مخزن نمی‌رود', readSrc('../.gitignore').includes('data/day-oi/'));
}
