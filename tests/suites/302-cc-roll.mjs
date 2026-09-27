// ۳۰۲. دستیار تصمیم رول کاوردکال — منطق نوت‌بوک «رهگیر کاوردکال» روی موتور مشترک
//
// هر عدد این دستیار دو بار ساخته می‌شود و این دسته همان دو راه را کنار هم
// می‌گذارد: فرمولِ صریحِ نوت‌بوک و موتورِ مشترکِ `analyzePayoff`. اگر یکی
// روزی جابه‌جا شود، این‌جا قرمز می‌شود نه در تصمیم مالی کاربر.

import { check, group } from '../harness.mjs';
import {
  coveredCall, ccPayoff, rollDelta, favorableRanges, deltaExtremes, walkBook, legPrice, rollOdds,
  ccRollPlan, decisionRows, rollVerdict, expiryLadder, scenarioPrices, scenarioTable, decisionMatrix,
  ccDailyBreakdown, ccSettleScenarios, rollGrid, dataIssues, CC_LABELS,
} from '../../core/cc-roll.mjs';
import { rangeText, verdictHtml, decisionTableHtml, ladderHtml } from '../../ui/cc-roll-view.mjs';

const FEES = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const POS = { qty: 3, entryDate: '1405/05/20', legs: [
  { kind: 'underlying', side: 'buy', ratio: 1, size: 1000, price: 5100 },
  { kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 5000, price: 320, ins: 'CUR' }] };
const q = (bid, ask, extra = {}) => ({ bid, bidQty: 50, ask, askQty: 50, last: bid, close: bid, oi: 100, vol: 10, ...extra });
const CHAIN = [
  { ins: 'CUR', name: 'کال فعلی', strike: 5000, days: 20, size: 1000, quote: q(390, 400) },
  { ins: 'LOW', name: 'پایین‌تر', strike: 4500, days: 20, size: 1000, quote: q(820, 840) },
  { ins: 'A', name: 'الف', strike: 5500, days: 20, size: 1000, quote: q(150, 160) },
  { ins: 'B', name: 'ب', strike: 6000, days: 20, size: 1000, quote: q(50, 60) },
  { ins: 'C', name: 'ج', strike: 4800, days: 50, size: 1000, quote: q(700, 720) },
  { ins: 'D', name: 'د', strike: 5500, days: 50, size: 1000, quote: q(380, 400) },
];
const planOf = (over = {}) => {
  const cc = coveredCall(POS, FEES);
  return ccRollPlan({
    cc, spot: 5300, current: { ...CHAIN[0] }, chain: CHAIN, fees: FEES, basis: 'BOOK', sigma: 0.45, ...over,
  });
};

group('۳۰۲. دستیار رول کاوردکال — شکل موقعیت و بهای تمام‌شده');
{
  const cc = coveredCall(POS, FEES);
  const nb = 5100 * (1 + FEES.buyStock) - 320 * (1 - FEES.option);
  check('بهای تمام‌شدهٔ هر سهم از موتور مشترک همان فرمول نوت‌بوک است', cc.ok && close(cc.nc0, nb));
  check('تعداد سهم = اندازهٔ قرارداد × تعداد', cc.shares === 3000 && cc.contracts === 3);
  const collar = { qty: 1, legs: [...POS.legs, { kind: 'put', side: 'buy', ratio: 1, size: 1000, strike: 4500, price: 50 }] };
  check('کالر کاوردکال شمرده نمی‌شود و دلیلش گفته می‌شود', !coveredCall(collar, FEES).ok && coveredCall(collar, FEES).reason.length > 0);
  const half = { qty: 1, legs: [POS.legs[0], { ...POS.legs[1], ratio: 2 }] };
  check('کاوردکال نیمه‌پوشش رد می‌شود، نه با عدد غلط حساب', !coveredCall(half, FEES).ok);
  const noPrice = { qty: 1, legs: [POS.legs[0], { ...POS.legs[1], price: 0 }] };
  check('بی قیمت فروش کال، عددی ساخته نمی‌شود', !coveredCall(noPrice, FEES).ok);
}

group('۳۰۲. بازده و تفاضل — دو راه، یک عدد');
{
  const nc = 4800;
  const p = ccPayoff(5000, nc, FEES);
  check('زیر اعمال: سهم با کارمزد فروش فروخته می‌شود', close(p(4600), 4600 * (1 - FEES.sellStock) - nc));
  check('روی و بالای اعمال: تحویل با کارمزد اعمال', close(p(5000), 5000 * (1 - FEES.exercise) - nc)
    && close(p(6000), 5000 * (1 - FEES.exercise) - nc));
  const d = rollDelta(5000, 4800, 5500, 4900, FEES);
  check('پایین هر دو قیمت اعمال، تفاضل همان جریان نقد رول است', close(d(3000), 4800 - 4900));
  check('بالای هر دو، تفاضل = فاصلهٔ اعمال با کارمزد + جریان رول', close(d(9000), 500 * (1 - FEES.exercise) - 100));
  const ranges = favorableRanges(5000, 4800, 5500, 4900, FEES);
  check('محدودهٔ سودآوری دقیقاً روی ریشه می‌نشیند', ranges.length === 1 && ranges[0].to === null
    && Math.abs(d(ranges[0].from)) < 1e-6 && d(ranges[0].from + 0.01) > 0 && d(ranges[0].from - 0.01) < 0);
  // مقایسه با اسکن چگال — همان روشی که نوت‌بوک داشت
  let scanFrom = NaN;
  for (let S = 3000; S < 8000; S += 0.5) if (d(S) > 0) { scanFrom = S; break; }
  check('و با اسکن چگالِ نوت‌بوک تا نیم ریال یکی است', Math.abs(scanFrom - ranges[0].from) <= 0.5);
  check('رولی که همه‌جا بدتر است، محدوده ندارد', favorableRanges(5000, 4800, 5500, 5600, FEES).length === 0);
  check('رول بستانکار به همان اعمال، «هر قیمتی» است', rangeText(favorableRanges(5000, 4800, 5000, 4700, FEES)) === 'هر قیمتی');
  const ext = deltaExtremes(5000, 4800, 5500, 4900, FEES);
  check('کمینهٔ تفاضل از جریان نقد رول پایین‌تر هم می‌رود (پرش کارمزد روی اعمال)', ext.min < -100 && close(ext.max, 500 * (1 - FEES.exercise) - 100));
}

group('۳۰۲. قیمت اجرا از دفتر سفارش');
{
  const book = [{ ask: 100, askQty: 2, bid: 90, bidQty: 1 }, { ask: 110, askQty: 5, bid: 80, bidQty: 1 }];
  const w = walkBook(book, 4, 'buy');
  check('میانگین اجرای چهار قرارداد از دو سطح', w.full && close(w.vwap, (2 * 100 + 2 * 110) / 4) && w.levels === 2);
  const s = walkBook(book, 3, 'sell');
  check('حجم بیش از دفتر: ناقص و کسری گزارش می‌شود', !s.full && s.short === 1 && s.slipPct < 0);
  check('دفتر خالی عدد نمی‌سازد', walkBook([], 1, 'buy').vwap === 0);
  const ref = legPrice({ bid: 0, ask: 0, last: 120, close: 118 }, 'sell', 'BOOK', 1);
  check('بی مظنه، قیمت مرجع می‌آید ولی اجراپذیر نیست', ref.price === 120 && ref.executable === false && ref.source === 'ref');
  const l1 = legPrice({ bid: 95, bidQty: 1, last: 120 }, 'sell', 'DEPTH', 3);
  check('در مبنای عمق، سطح اولِ کم‌حجم «عمق ناکافی» است', l1.price === 95 && !l1.executable && l1.source === 'partial');
  check('مبنای آخرین معامله هرگز ادعای اجرا ندارد', legPrice(q(10, 11), 'buy', 'LAST', 1).executable === false);
}

group('۳۰۲. نامزدهای رول و حکم');
{
  const plan = planOf();
  check('کال فعلی و اعمال پایین‌ترِ همان سررسید نامزد نیستند',
    plan.ok && !plan.rows.some((r) => r.ins === 'CUR' || r.ins === 'LOW'));
  check('اعمال پایین‌تر در سررسید بعدی با تیک پیش‌فرض می‌آید', plan.rows.some((r) => r.ins === 'C'));
  check('و بی تیک حذف می‌شود', !planOf({ filters: { includeLower: false } }).rows.some((r) => r.ins === 'C'));
  const a = plan.rows.find((r) => r.ins === 'A');
  const b = plan.baseline;
  check('خالص رول = دریافتی منهای پرداختی با کارمزد', close(a.netFlow, 150 * (1 - FEES.option) * 3000 - 400 * (1 + FEES.option) * 3000));
  check('سود اضافه با قیمت امروز = تفاضل دو بازده در قیمت امروز',
    close(a.dNow, rollDelta(5000, b.nc0, 5500, a.nc, FEES)(5300) * 3000));
  check('ردیف‌ها بر اساس سود اضافه با قیمت امروز مرتب‌اند', plan.rows.every((r, i, arr) => !i || arr[i - 1].dNow >= r.dNow));
  const drows = decisionRows(plan, 50);
  const cRow = drows.find((r) => r.name === 'ج');
  check('ردیف اول جدول تصمیم همیشه رول‌نکردن است', drows[0].isBase && drows[0].pay === 0);
  check('رول بستانکار «پول تازه» نمی‌خواهد (اصلاح قدرمطلق نوت‌بوک)', cRow.netFlow > 0 && cRow.pay === 0 && cRow.credit > 0);
  const labels = new Set(Object.values(CC_LABELS));
  check('هر نامزد یکی از برچسب‌های ارزیابی را دارد', drows.slice(1).every((r) => labels.has(r.label)));
  const v = rollVerdict(plan);
  check('حکم از میان ردیف‌های اجراپذیر، بیشترین سود اضافه را برمی‌دارد', v.action === 'roll'
    && v.pick === plan.rows.filter((r) => r.executable)[0]);

  // تنها نامزدِ جلوتر فقط قیمت مرجع دارد (تقاضا خالی، آخرین معامله ۳۸۰):
  // حکم «رول» نمی‌گیرد، «نگه دار» است و نامِ او را جدا می‌گوید.
  const onlyRef = planOf({ chain: [CHAIN[0], { ...CHAIN[5], quote: { ...CHAIN[5].quote, bid: 0, bidQty: 0 } }] });
  const refRow = onlyRef.rows[0];
  const v2 = rollVerdict(onlyRef);
  check('نامزد بی‌تقاضا با قیمت مرجع ساخته می‌شود ولی اجراپذیر نیست',
    onlyRef.rows.length === 1 && refRow.premium === 380 && refRow.executable === false && refRow.dNow > 0);
  check('و با وجود سود اضافهٔ مثبت، حکم «رول» نمی‌گیرد', v2.action === 'hold' && v2.betterEstimate === refRow);
  const ladder = expiryLadder(plan);
  check('نردبان برای هر سررسید یک پله دارد', ladder.length === 2 && ladder[0].extraDays === 0 && ladder[1].extraDays === 30);
  check('سود روزانه در ثبات = سود ایستا بر افق', close(a.flatPerDay, (b.nowProfit + a.dNow) / 20));
  check('بدون کال فعلی در زنجیره، حکمی ساخته نمی‌شود', !ccRollPlan({ cc: coveredCall(POS, FEES), spot: 5300, current: null, chain: CHAIN, fees: FEES }).ok);
  check('بدون قیمت امروز پایه، حکمی ساخته نمی‌شود', !planOf({ spot: 0 }).ok);
  const grid = rollGrid(plan, 'dNow');
  check('نقشهٔ سررسید × اعمال هر نامزد را سر جایش دارد', grid.at(20, 5500)?.ins === 'A' && grid.at(20, 4500) === null);
}

group('۳۰۲. احتمال، سناریو و ماتریس');
{
  const all = rollOdds({ ranges: [{ from: null, to: null }], d: () => 10, spot: 100, days: 30, sigma: 0.4 });
  check('ناحیهٔ «هر قیمتی» احتمال یک دارد و امیدش همان عدد ثابت است', close(all.prob, 1) && close(all.expected, 10, 1e-9));
  check('بی تلاطم، احتمال ساخته نمی‌شود (NaN، نه صفر)', Number.isNaN(rollOdds({ ranges: [], d: () => 1, spot: 100, days: 30, sigma: NaN }).prob));
  const plan = planOf();
  const prices = scenarioPrices(5000, [5500, 6000], 5300);
  check('قیمت‌های سناریو قیمت امروز را هم دارند', prices.includes(5300) && prices[0] < 5000);
  const drows = decisionRows(plan, 20);
  const table = scenarioTable(drows, plan, FEES);
  check('در قیمت خیلی پایین، رول‌نکردن بهترین است (رول بدهکار)', table[0].best.isBase);
  const m = decisionMatrix(drows, plan, FEES);
  check('ماتریس تصمیم از انتظار افت تا بی‌میلی به پول تازه', m[0].kind === 'drop' && m[m.length - 1].kind === 'noMoney');
  check('بررسی ناسازگاری همیشه یادآوری مدل را دارد', dataIssues(drows, plan).some((x) => x.kind === 'model'));
}

group('۳۰۲. سود و زیان تاریخی — اجزای نوت‌بوک');
{
  const cc = coveredCall(POS, FEES);
  const series = { points: [
    { date: 20260901, pnlTotal: 1000, prices: [5100, 320] },
    { date: 20260902, pnlTotal: -5000, prices: [5000, 300] },
    { date: 20260903, pnlTotal: 2000, prices: [5300, 400] },
  ], gaps: [{ date: 20260904, missing: ['کال'] }] };
  const b = ccDailyBreakdown(cc, series, FEES);
  const last = b.rows[2];
  check('جزء سهم و جزء اختیار جمع سود ناخالص‌اند', close(last.gross, (5300 - 5100) * 3000 + (320 - 400) * 3000));
  check('خرید و نگهداری با کارمزد دو طرف', close(last.bh, (5300 * (1 - FEES.sellStock) - 5100 * (1 + FEES.buyStock)) * 3000));
  check('ارزش افزودهٔ کال = سود کاوردکال منهای خرید و نگهداری', close(last.valueAdded, 2000 - last.bh));
  check('حداکثر افت از قله و شکاف‌ها گزارش می‌شوند', b.summary.maxDD === -6000 && b.gaps === 1);
  const settle = ccSettleScenarios(cc, 5300, FEES);
  check('اگر اعمال شود = سقف سود رول‌نکردن', close(settle.ifAssigned, planOf().baseline.maxProfit));
}

group('۳۰۲. نمای دستیار — رقم فارسی و جمله');
{
  const plan = planOf();
  const html = verdictHtml(rollVerdict(plan), plan, 'خودرو')
    + decisionTableHtml(decisionRows(plan, 20), plan, 'خودرو') + ladderHtml(expiryLadder(plan), plan);
  const text = html.replace(/<[^>]*>/g, ' ');
  check('هیچ رقم لاتینی در متن نمایشی حکم، جدول و نردبان نیست', !/[0-9]/.test(text), (text.match(/.{0,15}[0-9].{0,15}/) || [''])[0]);
  check('محدوده‌ها به زبان قیمت خوانده می‌شوند', rangeText([{ from: 5000, to: null }]).startsWith('بالای')
    && rangeText([{ from: null, to: 4000 }]).startsWith('زیر') && rangeText([]) === 'هیچ قیمتی');
  check('حکم رول، هزینه و ریسک و محدوده را می‌گوید', /هزینه/.test(text) && /بدترین حالت/.test(text) && /جلوتر است/.test(text));
}
