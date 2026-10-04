// ۳۲۱. «استرانگل فروش در بوتهٔ آزمایش» — موتور روزبه‌روز (۱۴۰۵/۰۷/۱۲)
//
//   الف  بازار از ردیف‌های فهرست و سری روزانه، هم‌شکل پاسخ واقعی
//   ب    انتخاب سررسید و قیمت اعمال ورود (۲.۱ و ۲.۲)
//   ج    سود و زیان از دو راه: ارزیابی روز و دفتر نقدی
//   د    آستانهٔ تعدیل، تعدیل گام اول و مبنای تازه (۳.۱ تا ۳.۲.۳)
//   هـ   استرادل و قانون ۳ برابر (۴)
//   و    حد ضرر و روز خروج (۵)
//   ز    روز بی‌قیمت: عدد ساخته نمی‌شود؛ قیمت مدل فقط از گذشته
//   ح    همهٔ مسیرها و «اگر آن روز…» با همان اجرای تکی می‌خوانند
//   ط    سیم‌کشی تب

import { check, group, near, readSrc } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { strategyMargin } from '../../core/margin.mjs';
import { lineChart, legGanttSvg } from '../../ui/strangle-lab-view.mjs';
import {
  labConfig, buildLabMarket, labBases, labExpiries, pickExpiry, pricingContext, priceAt, pickEntry,
  openPosition, evaluateDay, applyAction, runPath, planDecider, enumeratePaths, pathsSummary,
  whatIfMatrix, labMargin, actionKey, adjustCandidate, percentileOf,
  sideBreakdown, actionImpact, actionValues, gradeReport, gradeOf,
} from '../../core/strangle-lab.mjs';

const EXPIRY = 20250220;
const STRIKES = [];
for (let K = 700; K <= 1300; K += 50) STRIKES.push(K);
const dteOf = (dt) => Math.round((Date.UTC(2025, 1, 20) - Date.UTC(Math.trunc(dt / 1e4), Math.trunc(dt % 1e4 / 100) - 1, dt % 100)) / 864e5);

/** بازار ساختگی با قیمت بلک-شولز؛ `skip` قیمت چند قرارداد را در چند روز برمی‌دارد. */
function fixture(path, { skip = {}, sigma = 0.4 } = {}) {
  const rows = STRIKES.map((K) => ({
    uaInsCode: 'UA', lval30_UA: 'پایه', strikePrice: K, expiryGregorian: EXPIRY, endDate: 14031202,
    insCode_C: `C${K}`, insCode_P: `P${K}`, lVal18AFC_C: `ض${K}`, lVal18AFC_P: `ط${K}`, contractSize: 0,
  }));
  rows.push({ uaInsCode: 'OTHER', lval30_UA: 'دیگر', strikePrice: 100, expiryGregorian: 20250320, insCode_C: 'X', insCode_P: '' });
  const dates = [];
  let d = Date.UTC(2025, 0, 5);
  for (let i = 0; i < path.length; i += 1) { dates.push(Number(new Date(d).toISOString().slice(0, 10).replace(/-/g, ''))); d += 2 * 864e5; }
  const dailies = { UA: { rows: dates.map((date, i) => ({ date, close: path[i], last: path[i] })) } };
  for (const K of STRIKES) {
    for (const side of ['call', 'put']) {
      const ins = `${side === 'call' ? 'C' : 'P'}${K}`;
      dailies[ins] = { rows: dates.map((date, i) => ({ date, close: bsPrice(side, path[i], K, dteOf(date) / 365, 0.3, 0, sigma), last: 0 }))
        .filter((row, i) => !(skip[ins] || []).includes(i)) };
    }
  }
  const market = buildLabMarket({ rows, dailies, uaIns: 'UA', expiry: EXPIRY, from: dates[0], to: dates.at(-1), size: 1000 });
  return { rows, dailies, dates, market };
}

const FEES = { option: 0.00103, exercise: 0.0005 };
const SIDES_OK = (st) => ['call', 'put'].every((side) => near(st.trades.filter((t) => t.side === side).reduce((a, t) => a + t.premium, 0), st.bySide[side].received));
const UP = [1000, 1005, 1020, 1045, 1070, 1090, 1110, 1120, 1140, 1150, 1160, 1170];

group('۳۲۱-الف. بازار آزمایش');
{
  const { rows, market, dates } = fixture(UP, { skip: { C1200: [3] } });
  check('هر روزِ پایه یک روز بازار است', market.days.length === UP.length, market.days.length);
  check('پایه‌ها و سررسیدها از همان فهرست', labBases(rows).length === 2 && labExpiries(rows, 'UA').length === 1);
  check('قیمت اعمال تکراری نیست و مرتب است', market.strikes.map((s) => s.strike).join() === STRIKES.join());
  check('روزِ بی‌معامله کلید ندارد، نه صفر', !(1200 in market.days[3].call) && market.days[2].call[1200] > 0);
  check('روزشمار تا سررسید از تاریخ همان روز', market.days[0].dte === dteOf(dates[0]));
  const cut = buildLabMarket({ rows, dailies: fixture(UP).dailies, uaIns: 'UA', expiry: EXPIRY, from: dates[2], to: dates[5], size: 1000 });
  check('بازهٔ ورود تا خروج رعایت می‌شود', cut.days.length === 4 && cut.days[0].date === dates[2]);
}

group('۳۲۱-ب. ورود');
{
  const ex = pickExpiry([{ expiry: 20250120 }, { expiry: EXPIRY }, { expiry: 20250420 }], 20250105, labConfig());
  check('سررسید نزدیک به بازهٔ ۴۵ تا ۵۰ روز', ex.expiry === EXPIRY && ex.dte === 46 && ex.inRange);
  const far = pickExpiry([{ expiry: 20250420 }], 20250105, labConfig());
  check('بیرون از بازه: نزدیک‌ترین با پرچم هشدار', far && !far.inRange);
  const { market } = fixture(UP);
  const ctx = pricingContext(market, { r: 0.3 });
  const e = pickEntry(ctx, labConfig(), 0);
  check('روش دلتا: کال با دلتای نزدیک ۰٫۱۸', e.call === 1200 && Math.abs(e.callInfo.delta) > 0.15 && Math.abs(e.callInfo.delta) < 0.2);
  check('کال بالای پوت', e.put < e.call);
  const o = pickEntry(ctx, labConfig({ entryMethod: 'otm', otmPct: 10 }), 0);
  check('روش درصد فاصله: ۱۰٪ بالا و پایین پایه', o.call === 1100 && o.put === 900);
}

group('۳۲۱-ج. سود و زیان از دو راه');
{
  const { market } = fixture(UP);
  const ctx = pricingContext(market, { r: 0.3 });
  const cfg = labConfig({ qty: 2 });
  const opened = openPosition(ctx, cfg, { call: 1200, put: 900 }, 0, FEES);
  const c0 = market.days[0].call[1200], p0 = market.days[0].put[900];
  check('پرمیوم اولیه = (کال + پوت) × اندازه × تعداد', near(opened.state.initialCredit, (c0 + p0) * 1000 * 2));
  check('کارمزد ورود از همان نرخ اختیار', near(opened.state.fees, (c0 + p0) * 2000 * FEES.option));
  const ev = evaluateDay(ctx, cfg, opened.state, 4);
  const ledger = opened.state.received - opened.state.paid
    - (market.days[4].call[1200] + market.days[4].put[900]) * 2000 - opened.state.fees;
  check('سود و زیان ارزیابی = دفتر نقدی (دریافتی − پرداختی − ارزش بستن − کارمزد)', near(ev.pnl, ledger), `${ev.pnl} / ${ledger}`);
  const run = runPath(ctx, cfg, { call: 1200, put: 900 }, { decide: planDecider({}, 'algo'), fees: FEES });
  const st = run.state;
  check('سود نهایی = تحقق‌یافته − کارمزد، و همان آخرین نقطهٔ سری', near(run.final, st.realized - st.fees) && near(run.series.at(-1), run.final));
  check('سود نهایی = دریافتی − پرداختی − کارمزد', near(run.final, st.received - st.paid - st.fees));
  const m = labMargin(ctx, cfg, opened.state.legs, 0);
  const direct = strategyMargin([
    { side: 'sell', kind: 'call', strike: 1200, price: c0, size: 1000, ratio: 2, days: market.days[0].dte },
    { side: 'sell', kind: 'put', strike: 900, price: p0, size: 1000, ratio: 2, days: market.days[0].dte },
  ], { S: 1000, contractSize: 1000, capitalMode: 'GROSS' }).margin;
  check('وجه تضمین همان موتور مشترک (قاعدهٔ ترکیبی استرانگل)', m > 0 && near(m, direct));
}

group('۳۲۱-د. تعدیل گام اول');
{
  const { market } = fixture(UP);
  const ctx = pricingContext(market, { r: 0.3 });
  const cfg = labConfig();
  const entry = { call: 1200, put: 900 };
  const run = runPath(ctx, cfg, entry, { decide: planDecider({}, 'algo'), fees: FEES });
  const calm = run.steps.find((s) => s.i === 2);
  check('زیان شناور زیر ۱۰٪: بدون دستکاری', calm.ev.rec.why === 'calm' && calm.action.kind === 'hold');
  const adj = run.steps.find((s) => s.action.kind === 'roll');
  check('آستانه فعال شد ← رول سمت سودده (پوت)', adj && adj.action.side === 'put' && adj.ev.losing === 'call', adj?.date);
  check('قیمت اعمال تازه نزدیک‌تر به بازار و نه بالاتر از کال', adj.action.strike > 900 && adj.action.strike <= 1200);
  const cand = adj.ev.candidate;
  const best = cand.options.reduce((a, b) => (Math.abs(b.gap) < Math.abs(a.gap) ? b : a));
  check('پرمیوم تازه نزدیک‌ترین به پرمیوم فعلی کال (۳.۲.۲)', best.strike === adj.action.strike && near(cand.target, adj.ev.marks.call.price));
  const atMost = adjustCandidate(ctx, labConfig({ matchRule: 'atMost' }), run.steps[adj.i - 1].state, adj.i, adj.ev);
  check('قاعدهٔ «نه بیشتر»: پرمیوم از سمت زیان‌ده بالاتر نمی‌رود', !atMost.strike || atMost.price <= atMost.target + 1e-9);
  const before = adj.ev.pnl, after = adj.pnl;
  const fee = adj.ev.marks.put.price * 1000 * FEES.option + market.days[adj.i].put[adj.action.strike] * 1000 * FEES.option;
  check('تعدیل سود و زیان را جز کارمزد عوض نمی‌کند', near(before - after, fee), `${before - after} / ${fee}`);
  check('مبنای آستانهٔ بعدی همان سود و زیانِ پس از تعدیل است (۳.۲.۳)', near(adj.state.refPnl, after));
  check('شمار تعدیل', adj.state.adjustments === 1);
  const next = run.steps.find((s) => s.i === adj.i + 1);
  check('روز بعد از تعدیل زیان شناور از صفر شمرده می‌شود', next.ev.floatLoss < adj.ev.floatLoss);
  const fromEntry = runPath(ctx, labConfig({ trigBasis: 'sinceEntry' }), entry, { decide: planDecider({}, 'algo'), fees: FEES });
  check('مبنای «از روز ورود» گزینهٔ جداست و نتیجه را عوض می‌کند',
    fromEntry.steps.filter((s) => s.action.kind === 'roll').length >= run.steps.filter((s) => s.action.kind === 'roll').length);
}

group('۳۲۱-هـ. استرادل و قانون ۳ برابر');
{
  // پایه تند بالا می‌رود تا پوت به قیمت اعمال کال برسد، بعد نزدیک سررسید می‌ماند.
  const path = [1000, 1100, 1200, 1230, 1260, 1280, 1290, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300, 1300];
  const { market } = fixture(path);
  const ctx = pricingContext(market, { r: 0.3 });
  const cfg = labConfig({ slPct: 1000 });
  const opened = openPosition(ctx, cfg, { call: 1150, put: 1100 }, 0, FEES).state;
  const roll = applyAction(ctx, cfg, opened, 1, { kind: 'roll', side: 'put', strike: 1150 }, evaluateDay(ctx, cfg, opened, 1), FEES);
  const ev = evaluateDay(ctx, cfg, roll.state, 2);
  check('دو قیمت اعمال برابر = استرادل', ev.straddle);
  check('نسبت پرمیوم دو سمت حساب می‌شود', ev.ratio >= 1 && Number.isFinite(ev.ratio));
  const inv = applyAction(ctx, cfg, roll.state, 2, { kind: 'roll', side: 'put', strike: 1200 }, ev, FEES);
  check('استرانگل وارونه پذیرفته نمی‌شود', !!inv.error && inv.state === roll.state);
  const late = market.days.findIndex((d) => d.dte <= 7);
  if (late > 0) {
    const lev = evaluateDay(ctx, cfg, roll.state, late);
    const want = lev.unstable ? (lev.isLast ? 'close' : 'close') : 'hold';
    check('ناپایدار و ۷ روز یا کمتر ← بستن؛ پایدار ← نگه‌داشتن', lev.rec.kind === want, `${lev.ratio} ${lev.rec.why}`);
  }
  // سنجش مستقیم قاعده با آستانهٔ ۱: هر استرادلی ناپایدار است.
  const loose = labConfig({ ratio3x: 1, slPct: 1000, straddleExitDays: 999 });
  check('با آستانهٔ ۱، استرادل نزدیک سررسید بسته می‌شود', evaluateDay(ctx, loose, roll.state, 3).rec.why === 'straddleLate');
  const early = labConfig({ ratio3x: 1, slPct: 1000, straddleExitDays: 0 });
  check('ناپایدار با روز زیاد: پیش‌فرض نگه‌داشتن با هشدار', evaluateDay(ctx, early, roll.state, 3).rec.why === 'straddleEarly');
  check('… و با تنظیم «بستن فوری» بسته می‌شود',
    evaluateDay(ctx, labConfig({ ratio3x: 1, slPct: 1000, straddleExitDays: 0, unstableEarly: 'close' }), roll.state, 3).rec.kind === 'close');
}

group('۳۲۱-و. حد ضرر و روز خروج');
{
  const crash = [1000, 1000, 900, 780, 700, 690, 690, 690];
  const { market } = fixture(crash);
  const ctx = pricingContext(market, { r: 0.3 });
  const run = runPath(ctx, labConfig(), { call: 1200, put: 900 }, { decide: planDecider({}, 'algo'), fees: FEES });
  check('زیان ≥ ۱۰۰٪ پرمیوم ← حد ضرر و بستن', run.state.reason === 'sl' && run.state.closedAt < market.days.length - 1, run.state.reason);
  check('پس از بسته‌شدن، سری همان سود نهایی را نگه می‌دارد', run.series.slice(run.state.closedAt).every((v) => near(v, run.final)));
  const hold = runPath(ctx, labConfig(), { call: 1200, put: 900 }, { decide: planDecider({}, 'hold'), fees: FEES });
  check('بی اقدام هم روز آخر بسته می‌شود', hold.state.closedAt === market.days.length - 1 && hold.state.reason === 'exit');
}

group('۳۲۱-ز. روز بی‌قیمت');
{
  const { market } = fixture(UP, { skip: { C1200: [4, 5] } });
  const ctx = pricingContext(market, { r: 0.3 });
  const cfg = labConfig();
  const st = openPosition(ctx, cfg, { call: 1200, put: 900 }, 0, FEES).state;
  const ev = evaluateDay(ctx, cfg, st, 4);
  check('قیمت نیست ← سود و زیان «نداشته»، نه عدد', Number.isNaN(ev.pnl) && ev.rec.why === 'missing');
  const run = runPath(ctx, cfg, { call: 1200, put: 900 }, { decide: (i) => (i >= 4 ? { kind: 'close' } : null), fees: FEES });
  check('در روز بی‌قیمت هیچ اقدامی اجرا نمی‌شود', run.steps.find((s) => s.i === 4).action.kind === 'hold'
    && run.steps.find((s) => s.i === 6).action.kind === 'close');
  const mctx = pricingContext(market, { r: 0.3, modelFill: true });
  const q = priceAt(mctx, 5, 'call', 1200);
  check('قیمت مدل فقط با روشن‌کردن صریح، با برچسب', q && q.src === 'model' && q.from === market.days[3].date);
  // نگاه به آینده: تغییر قیمت روزهای بعد، قیمت مدل امروز را عوض نمی‌کند.
  const tweaked = structuredClone(market);
  tweaked.days[6].call[1200] *= 3;
  const q2 = priceAt(pricingContext(tweaked, { r: 0.3, modelFill: true }), 5, 'call', 1200);
  check('قیمت مدل از آینده خبر ندارد', near(q.price, q2.price));
  const expiryDay = structuredClone(market);
  expiryDay.days.at(-1).dte = 0;
  delete expiryDay.days.at(-1).put[900];
  const sx = priceAt(pricingContext(expiryDay, { r: 0.3 }), expiryDay.days.length - 1, 'put', 900);
  check('روز سررسید: ارزش ذاتی، با برچسب', sx.src === 'intrinsic' && sx.price === 0);
  const { market: thin } = fixture(UP, { skip: { P900: [11] } });
  const tctx = pricingContext(thin, { r: 0.3 });
  const none = labConfig({ exitFallback: 'none' });
  const end = runPath(tctx, none, { call: 1200, put: 900 }, { decide: planDecider({}, 'hold'), fees: FEES });
  check('قیمت روز آخر نیست و جایگزین خاموش ← سود نهایی «نداشته» با علت', Number.isNaN(end.final) && end.state.reason === 'incomplete');
  const early = runPath(tctx, cfg, { call: 1200, put: 900 }, { decide: planDecider({}, 'hold'), fees: FEES });
  const at = thin.days.length - 2;
  const manual = openPosition(tctx, cfg, { call: 1200, put: 900 }, 0, FEES).state;
  const closedThere = applyAction(tctx, cfg, manual, at, { kind: 'close' }, evaluateDay(tctx, cfg, manual, at), FEES).state.finalPnl;
  check('پیش‌فرض: خروج در آخرین روزی که همهٔ پاها قیمت واقعی داشتند', early.state.reason === 'exitEarly' && early.state.closedAt === at);
  check('… و عددش همان بستن دستی در همان روز است، نه قیمتِ ساختگی', near(early.final, closedThere));
  check('… و سری از روز بستن همان سود نهایی است', near(early.series[at], early.final) && near(early.series.at(-1), early.final));
  const tall = enumeratePaths(tctx, cfg, { call: 1200, put: 900 }, { fees: FEES, options: ['hold'] });
  check('همهٔ مسیرها همان قاعدهٔ روز خروج را دارند', tall.paths.length === 1 && near(tall.paths[0].final, early.final));
}

group('۳۲۱-ح. همهٔ مسیرها');
{
  const { market } = fixture(UP);
  const ctx = pricingContext(market, { r: 0.3 });
  const cfg = labConfig();
  const entry = { call: 1200, put: 900 };
  const all = enumeratePaths(ctx, cfg, entry, { fees: FEES, options: ['algo', 'hold', 'close', 'defend'] });
  const algo = runPath(ctx, cfg, entry, { decide: planDecider({}, 'algo'), fees: FEES });
  const hold = runPath(ctx, cfg, entry, { decide: planDecider({}, 'hold'), fees: FEES });
  check('چند مسیر ساخته شد', all.paths.length > 3, all.paths.length);
  const pure = all.paths.find((p) => p.choices.every((c) => c.opt === 'algo'));
  check('مسیرِ «همیشه الگوریتم» همان اجرای تکی است', pure && near(pure.final, algo.final), `${pure?.final} / ${algo.final}`);
  const still = all.paths.find((p) => p.choices.every((c) => c.key === 'H'));
  const holdFinal = hold.final;
  check('مسیرِ «همیشه نگه‌داشتن» همان اجرای تکی است', still && (near(still.final, holdFinal) || (Number.isNaN(still.final) && Number.isNaN(holdFinal))));
  const keys = all.paths.map((p) => p.choices.map((c) => `${c.i}${c.key}`).join('|'));
  check('هیچ مسیری تکراری نیست', new Set(keys).size === keys.length);
  const small = enumeratePaths(ctx, cfg, entry, { fees: FEES, cap: 2, mode: 'every' });
  check('سقف: مسیرها محدود و پرچم برش روشن', small.truncated && small.paths.length <= 2 + market.days.length);
  const every = enumeratePaths(ctx, cfg, entry, { fees: FEES, mode: 'every', options: ['hold', 'close'] });
  check('انشعاب در همهٔ روزها: یک مسیر به‌ازای هر روزِ بستن + نگه‌داشتن', every.paths.length === market.days.length - 1, every.paths.length);
  const sum = pathsSummary(all.paths);
  check('خلاصه: کمینه ≤ میانه ≤ بیشینه', sum.min <= sum.median && sum.median <= sum.max);
  check('صدک: بدترین مسیر صفر، بهترین زیر ۱۰۰', percentileOf(all.paths, sum.min) === 0 && percentileOf(all.paths, sum.max) < 100);

  // «اگر آن روز…» با ادامهٔ «تصمیم‌های خودم» = همان مسیرِ کاربر در ستونِ انتخاب‌شده.
  const decisions = {};
  for (const s of algo.steps) if (s.i > 0 && !s.ev.isLast) decisions[s.date] = s.action;
  const wi = whatIfMatrix(ctx, cfg, entry, decisions, { continuation: 'user', fees: FEES, options: ['algo', 'hold', 'close'] });
  check('ماتریس برای هر روزِ تصمیم یک ردیف دارد', wi.rows.length > 3, wi.rows.length);
  const consistent = wi.rows.every((row) => {
    const cell = row.cells.find((c) => c.key === row.chosen);
    return !cell || near(cell.final, algo.final);
  });
  check('خانهٔ «همان انتخاب» = نتیجهٔ مسیر کاربر', consistent);
  check('کلید اقدام پایدار', actionKey({ kind: 'roll', side: 'put', strike: 1050 }) === 'R:put:1050' && actionKey(null) === 'H');
}

group('۳۲۱-ی. اثر هر پا، اثر نقدی، کارنامه');
{
  const { market } = fixture(UP);
  const ctx = pricingContext(market, { r: 0.3 });
  const cfg = labConfig({ qty: 3 });
  const entry = { call: 1200, put: 900 };
  const run = runPath(ctx, cfg, entry, { decide: planDecider({}, 'algo'), fees: FEES });
  const sumOk = run.steps.every((s) => near(s.sides.call.cum + s.sides.put.cum, s.pnl));
  check('اثر کال + اثر پوت = سود و زیان کل، در همهٔ روزها', sumOk);
  check('سری اثر هر پا هم همان جمع را دارد', run.series.every((v, i) => !Number.isFinite(v) || near(run.sides.call[i] + run.sides.put[i], v)));
  const st0 = openPosition(ctx, cfg, entry, 0, FEES).state;
  const b0 = sideBreakdown(ctx, cfg, st0, 0);
  check('روز ورود: اثر هر سمت فقط کارمزد خودش است', near(b0.call.cum, -b0.call.fees) && near(b0.put.cum, -b0.put.fees)
    && near(b0.call.fees + b0.put.fees, st0.fees));
  const adj = run.steps.find((s) => s.action.kind === 'roll');
  const prev = run.steps[run.steps.indexOf(adj) - 1].state;
  check('رول پوت: اثر کال دست نمی‌خورد، فقط تحقق‌یافتهٔ پوت عوض می‌شود',
    near(adj.state.bySide.call.realized, prev.bySide.call.realized) && !near(adj.state.bySide.put.realized, prev.bySide.put.realized));

  const ev = evaluateDay(ctx, cfg, prev, adj.i);
  const imp = actionImpact(ctx, cfg, prev, adj.i, ev, adj.action, FEES);
  const M = 1000 * 3;
  const want = (market.days[adj.i].put[adj.action.strike] - ev.marks.put.price) * M;
  check('نقد امروز رول = پرمیوم تازه − بازخرید', near(imp.cash, want), `${imp.cash} / ${want}`);
  check('وجه تضمین پس از اقدام از همان موتور', near(imp.marginAfter, labMargin(ctx, cfg, imp.state.legs, adj.i)));
  check('نیاز خالص = افزایش وجه تضمین − نقد خالص', near(imp.netNeed, imp.marginDelta - imp.netCash));
  const close = actionImpact(ctx, cfg, prev, adj.i, ev, { kind: 'close' }, FEES);
  check('بستن کامل: همهٔ وجه تضمین آزاد و سود نهایی قطعی', close.marginAfter === 0 && close.marginDelta < 0 && near(close.pnlAfter, close.state.finalPnl));
  const hold = actionImpact(ctx, cfg, prev, adj.i, ev, { kind: 'hold' }, FEES);
  check('نگه‌داشتن: نقد صفر و وجه تضمین بی‌تغییر', hold.cash === 0 && near(hold.marginDelta, 0));

  const decisions = {};
  for (const s of run.steps) if (s.i > 0 && !s.ev.isLast && s.action.kind !== 'hold') decisions[s.date] = s.action;
  const vals = actionValues(ctx, cfg, entry, decisions, { fees: FEES });
  const skip = runPath(ctx, cfg, entry, { decide: planDecider({ ...decisions, [vals.items[0].date]: { kind: 'hold' } }, 'hold'), fees: FEES });
  check('ارزش هر اقدام = نتیجه با آن − نتیجه بی آن', vals.items.length > 0 && near(vals.items[0].value, vals.base.final - skip.final));

  const g = gradeReport(ctx, cfg, entry, decisions, { fees: FEES });
  check('کارنامه: صدها مسیر شمرده شد', g.count >= 10, g.count);
  check('نمره در بازهٔ ۰ تا ۱۰۰ و رتبه از ۱', g.score >= 0 && g.score <= 100 && g.rank >= 1 && g.rank <= g.count);
  check('بهترین مسیرِ کارنامه همان بیشینهٔ همهٔ مسیرهاست', near(g.best[0].final, g.summary.max));
  const replay = runPath(ctx, cfg, entry, { decide: planDecider(g.best[0].plan, 'hold'), fees: FEES });
  check('بارگذاری بهترین مسیر همان نتیجه را بازمی‌سازد', near(replay.final, g.best[0].final));
  check('پشیمانی هر روز منفی نیست', g.review.every((r) => !(r.regret < 0)));
  const mixed = enumeratePaths(ctx, cfg, entry, { mode: 'mixed', fees: FEES, options: ['algo', 'hold', 'close', 'defend'] });
  const trig = enumeratePaths(ctx, cfg, entry, { mode: 'trigger', fees: FEES, options: ['algo', 'hold', 'close', 'defend'] });
  check('حالت ترکیبی بیشتر از حالت «فقط روز تصمیم» مسیر دارد', mixed.paths.length > trig.paths.length);
  check('نوار نمره', gradeOf(95).letter === 'A' && gradeOf(60).letter === 'C' && gradeOf(10).letter === 'E' && gradeOf(NaN).letter === '—');
}

group('۳۲۱-ک. دفتر هر پا و نمودار تعاملی');
{
  const { market } = fixture(UP);
  const ctx = pricingContext(market, { r: 0.3 });
  const cfg = labConfig({ qty: 2 });
  const run = runPath(ctx, cfg, { call: 1200, put: 900 }, { decide: planDecider({}, 'algo'), fees: FEES });
  const trades = run.state.trades;
  check('هر فروش یک ردیف: دو پای ورود + هر رول', trades.length === 2 + run.state.adjustments, trades.length);
  check('همهٔ پاها پس از پایان بسته‌اند', trades.every((t) => t.closeDay != null));
  check('جمع سود و زیان پاها = سود و زیان نهایی', near(trades.reduce((a, t) => a + t.realized, 0), run.final));
  check('جمع پرمیوم پاها = پرمیوم دریافتی کل', near(trades.reduce((a, t) => a + t.premium, 0), run.state.received));
  check('جمع پرمیوم هر سمت = دفتر همان سمت', SIDES_OK(run.state));

  const dates = market.days.map((d) => d.date);
  const html = lineChart({ id: 't', dates, upTo: 3, series: [
    { key: 'a', label: 'الف', cls: 'pnl', values: dates.map((_, i) => i * 1000) },
    { key: 'b', label: 'ب', cls: 'call', values: dates.map(() => 5) },
  ], hidden: new Set(['b']) });
  const model = JSON.parse(html.match(/data-model="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
  check('مدل هاور فقط سری‌های روشن را دارد', model.series.length === 1 && model.series[0].label === 'الف');
  check('هاور از آینده خبر ندارد: پس از روز جاری عددی نیست', model.series[0].v[3] === 3000 && model.series[0].v[4] === null);
  check('نمودار تعاملی خط عمودی هاور دارد', html.includes('sl-cross') && html.includes('sl-cross-dots'));
  const g = legGanttSvg({ dates, trades, upTo: dates.length - 1 });
  check('نوار عمر هر پا: یک نوار کلیک‌پذیر برای هر فروش', (g.match(/data-act="leg-sel"/g) || []).length === trades.length);
  check('متن نمودارها رقم لاتین ندارد', !/[0-9]/.test(g.replace(/<[^>]*>/g, '').replace(/data-[a-z]+="[^"]*"/g, '')));
}

group('۳۲۱-ط. سیم‌کشی تب');
{
  const app = readSrc('../ui/app.mjs');
  check('تب در فهرست کناری ثبت شده', /id: 'strangle-lab'[^}]*mod: '\/ui\/tabs\/strangle-lab\.mjs'/.test(app));
  const tab = readSrc('../ui/tabs/strangle-lab.mjs');
  check('تب از موتور مشترک می‌خواند، نه محاسبهٔ جدا', tab.includes("from '/core/strangle-lab.mjs'") && !/impliedVol\(|bsPrice\(/.test(tab));
  check('تب از فهرست بازه و سری روزانهٔ مشترک می‌خواند', tab.includes('/api/history/universe?from=') && tab.includes('dailiesFor('));
  const icons = readSrc('../ui/icons.mjs');
  check('آیکون تب', /'strangle-lab':\s*'/.test(icons));
}
