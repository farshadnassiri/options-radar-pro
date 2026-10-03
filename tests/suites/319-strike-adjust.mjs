// ۳۱۹. «چرا شاخص تلاطم فزر را فقط از ۳۱ خرداد رسم می‌کند؟» (۱۴۰۵/۰۷/۱۲)
//
// دو کار، به خواستهٔ صاحب پروژه («هر دو را انجام بده»):
//
//   الف  علتِ دقیق روز خالی شاخص: «فقط قرارداد نزدیک سررسید معامله شد»،
//        «نزدیک قیمت پایه نبود» و «نوسانش حل نشد» دیگر همه `noAtm` نیستند
//   ب    جملهٔ «شاخص از کِی و چرا نه زودتر»
//   ج    روز تعدیل از سری روزانهٔ پایه (قیمت مرجع کمتر از پایانی دیروز)
//   د    قیمت اعمالِ پیش از تعدیل برای هر قرارداد (گردی، اکثریت)
//   هـ   سرتاسری: روز پیش از سود نقدی بی تعدیل خالی بود، با تعدیل نوسان واقعی
//   و    تلاطم تاریخی روز تعدیل را از قیمت مرجع می‌سنجد
//   ز    سیم‌کشی: هر سه سازندهٔ شاخص و نمودار بازه

import { check, group, near, readSrc } from '../harness.mjs';
import { defaults } from '../../core/settings.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { ivIndexOfDay, panelObservations, logReturns, buildVolHistory } from '../../core/vol-rank.mjs';
import { contractDailySeries, underlyingDailySeries, indexGaps } from '../../core/iv-chart.mjs';
import { baseAdjustments, roundness, strikeAdjustPlan, strikeOn, strikeResolver, adjustTransportDay } from '../../core/strike-adjust.mjs';
import { gapsText, adjustText, masterOption } from '../../ui/iv-charts-options.mjs';
import { fmt } from '../../ui/fmt.mjs';

const settings = defaults();
const day = 20260407;
const yearDays = Number(settings.dayCountYear) > 0 ? Number(settings.dayCountYear) : 365;
const T = (date, expiry) => (Date.UTC(Math.trunc(expiry / 1e4), Math.trunc(expiry % 1e4 / 100) - 1, expiry % 100) - Date.UTC(Math.trunc(date / 1e4), Math.trunc(date % 1e4 / 100) - 1, date % 100)) / 864e5 / yearDays;
const call = (S, K, date, expiry, sig) => bsPrice('call', S, K, T(date, expiry), settings.rFree, 0, sig);

group('۳۱۹-الف. علت دقیق روز خالی شاخص');
{
  const S = 1000;
  const obs = (expiry, K = 1000, traded = true) => ({ kind: 'call', strike: K, expiry, price: call(S, K, day, expiry, 0.4), traded });
  check('بی معامله: «هیچ قراردادی معامله نشد»', ivIndexOfDay({ date: day, spot: S, observations: [obs(20260507, 1000, false)] }, {}, settings).why === 'noTrades');
  check('فقط سررسید کمتر از ۷ روز: «نزدیک سررسید»، نه «نزدیک قیمت پایه نبود»', ivIndexOfDay({ date: day, spot: S, observations: [obs(20260408), obs(20260410)] }, {}, settings).why === 'nearExpiry');
  check('فقط سررسید بسیار دور: «دور از سررسید»', ivIndexOfDay({ date: day, spot: S, observations: [obs(20271230)] }, {}, settings).why === 'farExpiry');
  check('معامله شد ولی دور از قیمت پایه: «نزدیک قیمت پایه نبود»', ivIndexOfDay({ date: day, spot: S, observations: [obs(20260507, 1400)] }, {}, settings).why === 'outOfBand');
  const below = { kind: 'call', strike: 950, expiry: 20260507, price: 30, traded: true }; // زیر ارزش ذاتی ۵۰
  check('نزدیک قیمت پایه ولی زیر ارزش ذاتی: «نوسانش حل نشد»', ivIndexOfDay({ date: day, spot: S, observations: [below] }, {}, settings).why === 'ivUnsolved');
}

group('۳۱۹-ب. «شاخص از کِی و چرا نه زودتر»');
{
  const rows = [
    ...[20260401, 20260402].map((date) => ({ date, ivPct: NaN, why: 'noPanel' })),
    ...[20260404, 20260405, 20260406].map((date) => ({ date, ivPct: NaN, why: 'noTrades' })),
    { date: 20260407, ivPct: NaN, why: 'nearExpiry' },
    { date: 20260408, ivPct: 30 }, { date: 20260409, ivPct: NaN, why: 'noTrades' }, { date: 20260411, ivPct: 31 },
  ];
  const g = indexGaps(rows);
  check('اولین و آخرین روزِ دارای شاخص', g.firstDate === 20260408 && g.lastDate === 20260411 && g.ivDays === 2 && g.days === 9);
  check('علت‌های پیش از اولین روز، شمرده', JSON.stringify(g.before) === JSON.stringify([['noTrades', 3], ['noPanel', 2], ['nearExpiry', 1]]));
  check('روز خالی میانه جدا', JSON.stringify(g.between) === JSON.stringify([['noTrades', 1]]));
  const text = gapsText(g);
  check('جمله: از کِی شروع شد و چرا نه زودتر', text.includes('شاخص از ۱۴۰۵/۰۱/۱۹ شروع می‌شود') && text.includes('۳ روز هیچ قراردادی معامله نشد') && text.includes('کمتر از ۷ روز تا سررسید') && !/[0-9]/.test(text), text);
  check('بی هیچ روز دارای شاخص: علت‌ها گفته می‌شود', gapsText(indexGaps(rows.slice(0, 6))).startsWith('در این بازه هیچ روزی شاخص نساخت'));
}

group('۳۱۹-ج. روز تعدیل از سری روزانهٔ پایه');
{
  const rows = [
    { date: 20260610, close: 135950, yday: 132100 },
    { date: 20260613, close: 135950, yday: 135950 },  // روز عادی: مرجع = پایانی دیروز
    { date: 20260621, close: 131900, yday: 131700 },  // سود نقدی ۴٬۲۵۰
    { date: 20260622, close: 127950, yday: 131900 },
    { date: 20260623, close: 130000, yday: 128500 },  // مرجعِ بالاتر از پایانی: دادهٔ ناجور، تعدیل نیست
  ];
  const ev = baseAdjustments(rows);
  check('یک رویداد: روز، قبل، بعد، سود نقدی و نسبت', ev.length === 1 && ev[0].date === 20260621 && ev[0].before === 135950 && ev[0].after === 131700 && ev[0].drop === 4250 && near(ev[0].ratio, 131700 / 135950, 1e-12), JSON.stringify(ev));
  check('ردیف بی قیمت مرجع چیزی نمی‌سازد', baseAdjustments(rows.map(({ yday, ...r }) => r)).length === 0);
}

group('۳۱۹-د. قیمت اعمالِ پیش از تعدیل، هر قرارداد جدا');
{
  check('گردی: ۷۵٬۰۰۰ گردتر از ۷۰٬۷۵۰، و ۱۰۰٬۲۵۰ «تقریباً ۱۰۰٬۰۰۰» نیست', roundness(75000).score > roundness(70750).score + 1 && roundness(100250).score < 3);
  const event = { date: 20260621, before: 135950, after: 131700, drop: 4250, ratio: 131700 / 135950 };
  const adjusted = [75000, 90000, 95000, 115000, 135000, 145000].map((K, i) => ({ ins: `a${i}`, strike: K - 4250, expiry: 20260719 }));
  const contracts = [
    ...adjusted,
    { ins: 'late', strike: 140000, expiry: 20260819 },      // پس از رویداد عرضه شد
    { ins: 'raw', strike: 120000, expiry: 20260719 },       // اعمالش پیش از تعدیل ثبت شده
    { ins: 'gone', strike: 110750, expiry: 20260520 },      // پیش از رویداد سررسید شد
  ];
  const panels = { 20260610: Object.fromEntries([...adjusted, contracts[7]].map((c) => [c.ins, [1, 1, 1, 1, 1]])), 20260625: { late: [1, 1, 1, 1, 1] } };
  const plan = strikeAdjustPlan({ contracts, panels, events: [event] });
  check('شش اعمال ۷۵۰دار پیش از رویداد به عدد گرد برمی‌گردند (سود نقدی)', adjusted.every((c) => strikeOn(plan, c, 20260610) === c.strike + 4250) && adjusted.every((c) => strikeOn(plan, c, 20260621) === c.strike));
  check('قرارداد عرضه‌شده پس از رویداد، و سررسیدشده پیش از آن، دست نمی‌خورند', strikeOn(plan, contracts[6], 20260610) === 140000 && strikeOn(plan, contracts[8], 20260519) === 110750);
  check('اعمالی که از پیش تعدیل‌نشده ثبت شده دوباره برنمی‌گردد', strikeOn(plan, contracts[7], 20260610) === 120000);
  const e0 = plan.events[0];
  check('خلاصهٔ رویداد: نوع، برگردانده‌ها و دست‌نخورده‌ها', e0.type === 'dividend' && !e0.typeGuessed && e0.adjusted === 6 && e0.kept === 1, JSON.stringify(e0));
  const text = adjustText(plan);
  check('جملهٔ تعدیل', text.includes(`سود نقدی ${fmt.int(4250)} ریال`) && text.includes('۱۴۰۵/۰۳/۳۱') && text.includes('۶ قرارداد') && !/[0-9]/.test(text), text);

  // افزایش سرمایه: اعمال به نسبت قیمت مرجع کوچک شده بود.
  const cap = { date: 20260301, before: 3000, after: 2000, drop: 1000, ratio: 2000 / 3000 };
  const capC = [{ ins: 'k1', strike: 1667, expiry: 20260420 }, { ins: 'k2', strike: 2000, expiry: 20260420 }, { ins: 'k3', strike: 2333, expiry: 20260420 }];
  const capPlan = strikeAdjustPlan({ contracts: capC, panels: { 20260220: { k1: [1], k2: [1], k3: [1] } }, events: [cap] });
  check('افزایش سرمایه: اعمال بر نسبت تقسیم می‌شود (۱٬۶۶۷ → ۲٬۵۰۰)', strikeOn(capPlan, capC[0], 20260220) === 2500 && strikeOn(capPlan, capC[2], 20260220) === 3500 && capPlan.events[0].type === 'capital');
  check('اعمالِ نامطمئن رأی اکثریتِ همان رویداد را می‌گیرد (۲٬۰۰۰ → ۳٬۰۰۰)', strikeOn(capPlan, capC[1], 20260220) === 3000 && capPlan.events[0].unsure === 1);
  check('بی رویداد، بی تغییر', strikeResolver(strikeAdjustPlan({ contracts, panels, events: [] })) === null);

  const rebuilt = { date: 20260610, source: 'trades', contracts: { a0: ['call', 70750, 20260719], late: ['call', 140000, 20260819] }, moments: [] };
  const fixed = adjustTransportDay(rebuilt, plan);
  check('روز بازسازی‌شده: اعمالِ همان روز', fixed.contracts.a0[1] === 75000 && fixed.contracts.late[1] === 140000);
  check('روز ضبط زنده (اعمال تابلوی همان روز) دست نمی‌خورد', adjustTransportDay({ ...rebuilt, source: 'record' }, plan).contracts.a0[1] === 70750);
}

group('۳۱۹-هـ. سرتاسری: روز پیش از سود نقدی');
{
  // پایه پیش از مجمع ۱۲۰٬۰۰۰؛ سود نقدی ۴٬۲۵۰؛ کال‌ها با اعمالِ اصلی ۱۱۵/۱۲۰/۱۲۵ هزار و
  // σ = ۳۵٪ معامله شدند. دفتر اعمالِ پس از تعدیل را دارد (۴٬۲۵۰ کمتر).
  const SIG = 0.35, S = 120000, expiry = 20260520, pre = 20260412, ex = 20260415;
  const strikes = [115000, 120000, 125000];
  const contracts = strikes.map((K, i) => ({ ins: `c${i}`, kind: 'call', strike: K - 4250, expiry }));
  const panels = { [pre]: Object.fromEntries(strikes.map((K, i) => {
    const p = call(S, K, pre, expiry, SIG);
    return [`c${i}`, [p, p, 10, 3, 0]];
  })) };
  const rowsWithEvent = [{ date: 20260411, close: S, yday: S }, { date: pre, close: S, yday: S }, { date: ex, close: 116000, yday: S - 4250 }];
  const raw = ivIndexOfDay({ date: pre, spot: S, observations: panelObservations(contracts, panels).get(pre) }, {}, settings);
  check('بی تعدیل: روزِ پیش از مجمع خالی یا غلط بود (کالِ نزدیک پول زیر ارزش ذاتی)', !Number.isFinite(raw.ivPct) || Math.abs(raw.ivPct - 35) > 5, `${raw.ivPct} ${raw.why}`);
  const plan = strikeAdjustPlan({ contracts, panels, events: baseAdjustments(rowsWithEvent) });
  const strikeOf = strikeResolver(plan);
  const fixedIdx = ivIndexOfDay({ date: pre, spot: S, observations: panelObservations(contracts, panels, 'close', { strikeOf }).get(pre) }, {}, settings);
  check('با تعدیل: همان ۳۵٪ واقعی', near(fixedIdx.ivPct, 35, 0.05), fixedIdx.ivPct?.toFixed(3));
  const series = contractDailySeries({ contract: contracts[1], panels, baseRows: rowsWithEvent, settings, days: [pre], strikeOf });
  check('سری قرارداد هم: ۳۵٪ و اعمالِ همان روز', near(series[0].ivPct, 35, 0.05) && series[0].strike === 120000, `${series[0].ivPct} ${series[0].strike}`);
  const tokens = { ink: '#000', muted: '#666', line: '#ccc', lineSoft: '#eee', accent: '#06c', warn: '#c60', series: ['#1', '#2', '#3'] };
  const o = masterOption(series, { contractStrike: contracts[1].strike }, tokens);
  check('راهنمای نمودار مادر اعمالِ آن روز را می‌گوید', o.tooltip.formatter([{ dataIndex: 0 }]).includes('قیمت اعمال آن روز'));
  const hist = buildVolHistory({ baseRows: rowsWithEvent, observations: panelObservations(contracts, panels, 'close', { strikeOf }), settings });
  const idx = underlyingDailySeries(hist, { baseRows: rowsWithEvent });
  check('شاخص پایه (همان مسیر تب‌ها) روز پیش از مجمع را دارد', near(idx.find((r) => r.date === pre)?.ivPct, 35, 0.05));
}

group('۳۱۹-و. تلاطم تاریخی و روز تعدیل');
{
  const closes = [100, 101, 96.5, 97];
  const refs = [NaN, 100, 96.75, 96.5];   // روز سوم: مرجعِ تعدیل‌شده (سود نقدی ۴٫۲۵)
  const r = logReturns(closes, 0.2, refs);
  check('بازدهِ روز تعدیل از قیمت مرجع، نه پایانی دیروز', near(r.returns[2], Math.log(96.5 / 96.75), 1e-12) && r.adjusted === 1);
  check('روزهای عادی همان بازدهِ پایانی به پایانی', near(r.returns[1], Math.log(101 / 100), 1e-12) && near(r.returns[3], Math.log(97 / 96.5), 1e-12));
  check('بی قیمت مرجع، رفتار قبلی', near(logReturns(closes, 0.2).returns[2], Math.log(96.5 / 101), 1e-12));
}

group('۳۱۹-ز. سیم‌کشی');
{
  for (const [file, label] of [['../ui/iv-charts-view.mjs', 'تب نوسان ضمنی'], ['../ui/vol-rank-view.mjs', 'تب رتبه و صدک تلاطم'], ['../ui/vol-context.mjs', 'زمینهٔ تلاطم']]) {
    const src = readSrc(file);
    check(`${label}: شاخص با اعمالِ روز`, src.includes('strikeAdjustPlan({ contracts:') && src.includes('events: baseAdjustments(') && /panelObservations\([^)]*\{ strikeOf/.test(src));
  }
  const view = readSrc('../ui/iv-charts-view.mjs');
  check('تب نوسان ضمنی: سری قرارداد و روزهای بازسازی‌شدهٔ نمودار بازه هم', view.includes('strikeOf: data.strikeOf,') && view.includes('api.days.map((d) => adjustTransportDay(d, data.plan))'));
  check('تب نوسان ضمنی: جملهٔ «از کِی و چرا» و تعدیل‌ها زیر نمودار مادر', view.includes("q('[data-ivc-gaps]').textContent = [gapsText(indexGaps(idx)), adjustText(data.plan)]"));
  check('تب رتبه و صدک: همان جمله', readSrc('../ui/vol-rank-view.mjs').includes("q('[data-vr-gaps]').textContent = [gapsText(indexGaps(rangeRows(history))), adjustText(history.adjust)]"));
}
