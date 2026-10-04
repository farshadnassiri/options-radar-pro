// خروجی اکسلِ «استرانگل فروش در بوتهٔ آزمایش» — از ورود تا خروج، روزبه‌روز.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۲): «یک گزینه خروجی اکسل دقیق و با جزییات
// از ورود تا خروج به تفکیک هر روز.»
//
// هیچ عددی این‌جا تازه حساب نمی‌شود که روی صفحه جور دیگری حساب شده باشد:
// همهٔ ستون‌ها از همان اجرای موتور (`runPath`) و همان توابعی می‌آیند که تب
// نشان می‌دهد (`actionImpact`، `labMargin`، `weightedBreakevens`، …).
//
// قاعده‌های خروجی، مثل بقیهٔ خروجی‌های برنامه (`ui/backtest-export.mjs`):
//   • عدد، عدد می‌ماند تا در اکسل جمع و نمودار شود؛ رقم فارسی فقط روی صفحه.
//   • خانهٔ خالی یعنی «نیامد»، نه صفر.
//   • تاریخ شمسی به شکل ۱۴۰۵/۰۵/۰۳ با رقم لاتین تا مرتب‌سازی درست باشد.
//
// وارداتِ نسبی تا در نود هم بار شود و آزمون داشته باشد.

import { historyDateLabel, historyDayName } from '../core/history.mjs';
import {
  SIDES, SIDE_FA, LAB_CHOICES, CLOSE_REASON, BASIS_FA, actionKey, actionImpact, adjustCandidate, defendAction,
  labMargin, weightedBreakevens, ivAt, deltaAt,
} from '../core/strangle-lab.mjs';
import { sheet, sheetParts, downloadXlsx } from './xlsx.mjs';
import { stamp } from './export.mjs';

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const n = (x) => (fin(x) ? x : '');
const pctOf = (a, b) => (fin(a) && fin(b) && b !== 0 ? (a / b) * 100 : '');
const date = (d) => (d ? historyDateLabel(d) : '');
const choiceLabel = (key, v) => LAB_CHOICES[key]?.find(([k]) => k === v)?.[1] ?? v;

/** برچسب اقدام با رقم لاتین — برای خانهٔ متنیِ اکسل. */
export function actionPlain(a) {
  if (!a || a.kind === 'hold') return 'نگه‌داشتن';
  if (a.kind === 'open') return 'ورود';
  if (a.kind === 'close') return 'بستن کامل';
  if (a.kind === 'roll') return a.strike == null ? `بستن ${SIDE_FA[a.side]}` : `رول ${SIDE_FA[a.side]} به ${a.strike}`;
  return '';
}

const ZONE_FA = { calm: 'آرام', band: 'در محدودهٔ تعدیل', beyond: 'فراتر از محدوده' };
const SRC_FA = { close: 'پایانی', model: 'مدل', intrinsic: 'ارزش ذاتی', manual: 'انتخابی', ...BASIS_FA };

function headerSheet({ exp, market, cfg, run, capital, margin, generatedAt, settingsInfo = {} }) {
  const first = run.steps[0].state;
  const end = run.state?.closedAt >= 0 ? run.state.closedAt : (run.pending?.i ?? run.steps.at(-1).i);
  const rows = [
    ['نام آزمایش', exp.name || ''],
    ['نماد پایه', market.uaName],
    ['کد نماد پایه', String(market.uaIns)],
    ['سررسید', date(market.expiry)],
    ['تاریخ ورود', date(market.days[0]?.date)],
    ['روز پایان یا روز جاری آزمایش', date(market.days[end]?.date)],
    ['تاریخ خروج انتخابی', date(exp.to)],
    ['روزهای معاملاتی بازه', market.days.length],
    ['حجم معامله (قرارداد از هر سمت)', cfg.qty],
    ['اندازهٔ قرارداد (از تنظیمات)', market.size],
    ['کال فروش ورود', first.legs.call?.strike],
    ['قیمت فروش کال ورود', first.legs.call?.open],
    ['پوت فروش ورود', first.legs.put?.strike],
    ['قیمت فروش پوت ورود', first.legs.put?.open],
    ['مبنای قیمت ورود', BASIS_FA[cfg.entryBasis] || 'پایانی'],
    ['مبنای قیمت خروج', BASIS_FA[cfg.exitBasis] || 'پایانی'],
    ['پرمیوم دریافتی ورود (ریال)', first.initialCredit],
    ['وجه تضمین ورود (ریال)', n(margin)],
    ['سرمایهٔ تخصیصی (ریال)', n(capital)],
    ['وضعیت', run.done ? 'تمام‌شده' : 'در جریان'],
    ['علت پایان', run.done ? (CLOSE_REASON[run.state.reason] ?? run.state.reason) : ''],
    ['سود و زیان نهایی (ریال)', run.done ? n(run.final) : ''],
    ['سود و زیان نهایی (٪ سرمایه)', run.done ? pctOf(run.final, capital) : ''],
    ['شمار تعدیل', run.state?.adjustments ?? run.steps.at(-1).state.adjustments],
    ['— قواعد الگوریتم —', ''],
    ['روز تا سررسید ورود', `${cfg.dteLo} تا ${cfg.dteHi}`],
    ['روش انتخاب قیمت اعمال', choiceLabel('entryMethod', cfg.entryMethod)],
    ['دلتای هدف', `${cfg.deltaLo} تا ${cfg.deltaHi}`],
    ['ضریب سرمایه به وجه تضمین', cfg.capitalMult],
    ['سقف زیان حساب (٪ سرمایه)', cfg.varLimitPct],
    ['حد سود (٪ پرمیوم اولیه)', cfg.tpPct],
    ['حد ضرر (٪ پرمیوم اولیه)', cfg.slPct],
    ['آستانهٔ تعدیل (٪ سود هدف جاری)', `${cfg.trigLo} تا ${cfg.trigHi}`],
    ['مبنای زیان شناور', choiceLabel('trigBasis', cfg.trigBasis)],
    ['برابری پرمیوم در تعدیل', choiceLabel('matchRule', cfg.matchRule)],
    ['آستانهٔ ناپایداری استرادل (برابر)', cfg.ratio3x],
    ['روزهای پایانی خروج استرادل', cfg.straddleExitDays],
    ['استرادل ناپایدار با روز زیاد', choiceLabel('unstableEarly', cfg.unstableEarly)],
    ['خروج سربه‌سر', choiceLabel('breakevenRule', cfg.breakevenRule)],
    ['کارمزد', cfg.fees ? 'حساب شده' : 'حساب نشده'],
    ['قیمت مدل برای روز بی‌معامله', cfg.modelFill ? 'روشن' : 'خاموش'],
    ['روز خروج بی‌قیمت', choiceLabel('exitFallback', cfg.exitFallback)],
    ['— پارامترهای محاسبه —', ''],
    ['نرخ بدون ریسک سالانه', n(settingsInfo.rFree)],
    ['کارمزد معامله اختیار', n(settingsInfo.feeOption)],
    ['کارمزد اعمال', n(settingsInfo.feeExercise)],
    ['زمان ساخت فایل', generatedAt ? new Date(generatedAt).toLocaleString('fa-IR') : ''],
  ];
  return sheet('مشخصات', ['مورد', 'مقدار'], rows, [34, 40]);
}

function guideSheet() {
  return sheet('راهنما', ['ستون یا اصطلاح', 'یعنی چه'], [
    ['خانهٔ خالی', 'آن روز آن عدد نیامده (مثلاً قرارداد معامله نشده). صفر نیست.'],
    ['قیمت هر پا', 'قیمت پایانیِ همان قراردادی که آن روز در دست بود. ستون «منبع» می‌گوید پایانی است یا مدل یا ارزش ذاتی یا مبنای ورود و خروج.'],
    ['تغییر پا', 'قیمت امروز منهای قیمت دیروزِ همان قرارداد. برای فروشنده، تغییر منفی سود است.'],
    ['اثر انباشتهٔ کال و پوت', 'سود قطعی‌شدهٔ همهٔ پاهای همان سمت + سود و زیان شناور پای باز − کارمزدهای همان سمت. جمع دو ستون = سود و زیان کل.'],
    ['اثر امروز', 'اثر انباشتهٔ امروز منهای دیروز.'],
    ['زیان شناور ٪', 'از آخرین تعدیل (یا ورود) تا امروز، چند درصد از سود هدف جاری روی کاغذ از دست رفته. از آستانهٔ تعدیل به بالا، الگوریتم تعدیل پیشنهاد می‌کند.'],
    ['سود هدف جاری', 'اگر همهٔ پاهای باز بی‌ارزش تمام شوند، کل سود چقدر می‌شود.'],
    ['نقد امروز', 'پرمیوم فروش منهای هزینهٔ بازخرید در همان روز، پیش از کارمزد.'],
    ['نیاز خالص به وجه', 'افزایش وجه تضمین منهای نقد خالص همان روز. منفی یعنی وجه آزاد شد.'],
    ['سربه‌سر وزنی', 'قیمت اعمال به‌علاوه (کال) یا منهای (پوت) پرمیوم، میانگین‌گیری‌شده با وزن ارزش معاملات همان روزِ هر قرارداد این سررسید.'],
    ['برگ «گزینه‌های هر روز»', 'برای هر روزِ تصمیم، همهٔ کارهایی که می‌شد کرد با اثر نقدی و وجه تضمینِ هر کدام؛ ستون «انتخاب من» و «پیشنهاد الگوریتم» مشخص‌اند.'],
    ['محدودیت', 'قیمت‌ها پایانی و تاریخی‌اند، نه مظنهٔ قابل اجرای هم‌زمان. این فایل ابزار تحلیل است، نه توصیهٔ معامله.'],
  ], [26, 110]);
}

const DAILY_HEAD = [
  'تاریخ', 'روز هفته', 'روز تا سررسید', 'قیمت پایه', 'تغییر پایه', 'تغییر پایه ٪', 'تغییر پایه از ورود ٪',
  'قیمت اعمال کال در دست', 'نماد کال', 'قیمت کال', 'منبع قیمت کال', 'تغییر کال', 'تغییر کال ٪', 'تلاطم ضمنی کال ٪', 'دلتای کال',
  'قیمت اعمال پوت در دست', 'نماد پوت', 'قیمت پوت', 'منبع قیمت پوت', 'تغییر پوت', 'تغییر پوت ٪', 'تلاطم ضمنی پوت ٪', 'دلتای پوت',
  'سربه‌سر وزنی کال', 'سربه‌سر وزنی پوت',
  'سود و زیان کل', 'تغییر سود و زیان امروز', 'سود و زیان ٪ سرمایه', 'سود و زیان ٪ پرمیوم اولیه',
  'اثر انباشتهٔ کال', 'اثر امروز کال', 'اثر انباشتهٔ پوت', 'اثر امروز پوت',
  'زیان شناور ٪', 'وضعیت آستانه', 'سود هدف جاری', 'پیشنهاد الگوریتم', 'اقدام پیشنهادی', 'اقدام من', 'پیروی از الگوریتم',
  'نقد امروز', 'کارمزد امروز', 'وجه تضمین پایان روز', 'وجه تضمین ٪ سرمایه',
  'پرمیوم دریافتی تا امروز', 'هزینهٔ بازخرید تا امروز', 'کارمزد تا امروز',
  'کال پس از اقدام', 'پوت پس از اقدام', 'یادداشت',
];

function dailySheet({ ctx, cfg, run, capital, params }) {
  const market = ctx.market;
  const symOf = (side, K) => market.strikes.find((s) => s.strike === K)?.[side]?.sym || '';
  const initial = run.steps[0].state.initialCredit;
  const items = run.steps.map((s, k) => ({ step: s, before: k > 0 ? run.steps[k - 1].state : s.state, prevSides: k > 0 ? run.steps[k - 1].sides : null, prevPnl: k > 0 ? run.steps[k - 1].pnl : NaN }));
  if (run.pending) {
    const last = run.steps.at(-1);
    items.push({ step: { i: run.pending.i, date: market.days[run.pending.i].date, ev: run.pending.ev, state: run.pending.state, sides: run.pending.sides, pnl: run.pending.ev.pnl, pending: true },
      before: run.pending.state, prevSides: last.sides, prevPnl: last.pnl });
  }
  const rows = items.map(({ step: s, before, prevSides, prevPnl }) => {
    const day = market.days[s.i], prev = market.days[s.i - 1];
    const ev = s.ev;
    const legCols = (side) => {
      const leg = before.legs?.[side];
      if (!leg || before.closed) return ['', '', '', '', '', '', '', ''];
      const mark = ev.marks?.[side] || (s.i === 0 ? { price: leg.open, src: leg.src } : null);
      const now = day[side]?.[leg.strike], was = prev?.[side]?.[leg.strike];
      const chg = fin(now) && fin(was) ? now - was : NaN;
      const iv = ivAt(ctx, s.i, side, leg.strike);
      return [leg.strike, symOf(side, leg.strike), n(mark?.price), mark ? (SRC_FA[mark.src] || mark.src) : '', n(chg), pctOf(chg, was),
        fin(iv) ? iv * 100 : '', n(deltaAt(ctx, s.i, side, leg.strike))];
    };
    const be = weightedBreakevens(ctx, s.i);
    const after = s.pending ? null : s.state;
    const cash = !s.pending && s.i > 0 ? (after.received - before.received) - (after.paid - before.paid) : '';
    const feeToday = !s.pending ? (s.i === 0 ? after.fees : after.fees - before.fees) : '';
    const holdState = after || before;
    const margin = holdState.closed ? 0 : labMargin(ctx, cfg, holdState.legs, s.i, params);
    const dCall = fin(s.sides?.call?.cum) && fin(prevSides?.call?.cum) ? s.sides.call.cum - prevSides.call.cum : '';
    const dPut = fin(s.sides?.put?.cum) && fin(prevSides?.put?.cum) ? s.sides.put.cum - prevSides.put.cum : '';
    const myAction = s.pending ? 'در انتظار تصمیم' : s.i === 0 ? 'ورود' : actionPlain(s.action);
    const note = [s.pending ? 'روز جاری آزمایش' : '', ev.missing?.length ? 'قیمت یکی از پاها نیامد' : '',
      s.early ? `خروج در آخرین روزِ قیمت‌دار (${date(market.days[s.exitAt]?.date)})` : '', s.error || ''].filter(Boolean).join('؛ ');
    return [
      date(day.date), historyDayName(day.date) || '', day.dte, day.S, prev ? day.S - prev.S : '', prev ? pctOf(day.S - prev.S, prev.S) : '', pctOf(day.S - market.days[0].S, market.days[0].S),
      ...legCols('call'), ...legCols('put'),
      n(be.call.value), n(be.put.value),
      n(s.pnl), fin(s.pnl) && fin(prevPnl) ? s.pnl - prevPnl : '', pctOf(s.pnl, capital), pctOf(s.pnl, initial),
      n(s.sides?.call?.cum), dCall, n(s.sides?.put?.cum), dPut,
      s.i === 0 ? '' : n(ev.floatPct), s.i === 0 ? '' : (ZONE_FA[ev.zone] || ''), s.i === 0 ? '' : n(ev.maxProfit),
      s.i === 0 ? '' : (ev.rec?.text || ''), s.i === 0 ? '' : actionPlain(ev.rec?.action), myAction,
      s.i === 0 || s.pending ? '' : (actionKey(s.action) === actionKey(ev.rec?.action) ? 'بله' : 'خیر'),
      n(cash), n(feeToday), n(margin), pctOf(margin, capital),
      holdState.received, holdState.paid, holdState.fees,
      after && !after.closed && after.legs.call ? after.legs.call.strike : (after?.closed ? 'بسته' : ''),
      after && !after.closed && after.legs.put ? after.legs.put.strike : (after?.closed ? 'بسته' : ''),
      note,
    ];
  });
  return sheetParts('روزبه‌روز', DAILY_HEAD, rows, DAILY_HEAD.map((h) => Math.max(10, Math.min(28, h.length + 2))));
}

function legsSheet({ ctx, run }) {
  const market = ctx.market;
  const state = run.done ? run.state : run.pending?.state || run.steps.at(-1).state;
  const rows = (state.trades || []).map((t) => {
    const sym = market.strikes.find((s) => s.strike === t.strike)?.[t.side]?.sym || '';
    const end = t.closeDay ?? (run.pending?.i ?? run.steps.at(-1).i);
    return [
      SIDE_FA[t.side], t.strike, sym, date(market.days[t.openDay]?.date), t.openPrice, SRC_FA[t.openSrc] || t.openSrc, t.premium, n(t.openFee),
      market.days[t.openDay]?.S,
      t.closeDay != null ? date(market.days[t.closeDay]?.date) : 'باز', t.closeDay != null ? t.closePrice : '', t.closeDay != null ? (SRC_FA[t.closeSrc] || t.closeSrc) : '',
      t.closeDay != null ? t.cost : '', t.closeDay != null ? n(t.closeFee) : '', t.closeDay != null ? n(t.realized) : '',
      t.closeDay != null ? pctOf(t.premium - t.cost, t.premium) : '',
      market.days[end]?.S, end - t.openDay,
    ];
  });
  return sheet('پاهای فروخته‌شده', ['سمت', 'قیمت اعمال', 'نماد', 'روز فروش', 'قیمت فروش', 'منبع قیمت فروش', 'پرمیوم دریافتی', 'کارمزد فروش',
    'پایه در روز فروش', 'روز بازخرید', 'قیمت بازخرید', 'منبع قیمت بازخرید', 'هزینهٔ بازخرید', 'کارمزد بازخرید', 'سود و زیان این پا',
    'سهم نگه‌داشته از پرمیوم ٪', 'پایه در روز بستن یا امروز', 'روزهای معاملاتی عمر پا'], rows, [8, 12, 16, 12, 12, 12, 14, 12, 12, 12, 12, 12, 14, 12, 14, 14, 14, 12]);
}

/** همهٔ کارهایی که هر روزِ تصمیم می‌شد کرد، با اثر نقدی و وجه تضمین هر کدام. */
function optionsSheet({ ctx, cfg, run, fees, params }) {
  const rows = [];
  run.steps.forEach((s, k) => {
    if (k === 0 || s.ev.isLast || s.ev.closed) return;
    const st = run.steps[k - 1].state;
    const ev = s.ev;
    const opts = [['پیشنهاد الگوریتم', ev.rec.action], ['نگه‌داشتن', { kind: 'hold' }], ['بستن کامل', { kind: 'close' }]];
    if (ev.winning && !ev.straddle) {
      const cand = ev.candidate || adjustCandidate(ctx, cfg, st, s.i, ev);
      if (cand?.strike) opts.push(['تعدیل گام اول', { kind: 'roll', side: ev.winning, strike: cand.strike }]);
    }
    const def = ev.losing ? defendAction(ctx, st, s.i, ev) : null;
    if (def) opts.push(['رول دفاعی سمت زیان‌ده', def]);
    const chosen = actionKey(s.action);
    const seen = new Set();
    for (const [label, a] of opts) {
      const key = actionKey(a);
      if (label !== 'پیشنهاد الگوریتم' && seen.has(key)) continue;
      seen.add(key);
      const imp = actionImpact(ctx, cfg, st, s.i, ev, a, fees, params);
      rows.push([
        date(s.date), label, actionPlain(a), key === actionKey(ev.rec.action) ? 'بله' : '', key === chosen ? 'بله' : '',
        imp.error || '', n(imp.pnlAfter), n(imp.realizedNow), n(imp.cash), n(imp.fee), n(imp.netCash),
        n(imp.marginBefore), n(imp.marginAfter), n(imp.marginDelta), n(imp.netNeed), n(imp.maxProfit),
      ]);
    }
  });
  return sheetParts('گزینه‌های هر روز', ['تاریخ', 'گزینه', 'اقدام', 'پیشنهاد الگوریتم', 'انتخاب من', 'خطا', 'سود و زیان پس از اقدام', 'قطعی‌شده با این اقدام',
    'نقد امروز (پیش از کارمزد)', 'کارمزد', 'نقد خالص', 'وجه تضمین قبل', 'وجه تضمین بعد', 'تغییر وجه تضمین', 'نیاز خالص به وجه', 'سود هدف بعدی'], rows,
  [12, 20, 18, 10, 10, 20, 16, 16, 16, 10, 14, 14, 14, 14, 14, 14]);
}

/** قیمت همهٔ قراردادهای این سررسید در همهٔ روزها — برای هر وارسی دستی. */
function chainSheet({ ctx }) {
  const market = ctx.market;
  const rows = [];
  for (const day of market.days) {
    for (const s of market.strikes) {
      for (const side of SIDES) {
        if (!s[side]) continue;
        const q = day.raw?.[side]?.[s.strike] || {};
        rows.push([date(day.date), day.S, SIDE_FA[side], s.strike, s[side].sym, n(q.close), n(q.last), n(q.first), n(q.low), n(q.high), n(q.vol), n(q.value)]);
      }
    }
  }
  return sheetParts('قیمت قراردادها', ['تاریخ', 'قیمت پایه', 'سمت', 'قیمت اعمال', 'نماد', 'پایانی', 'آخرین', 'اولین', 'کمترین', 'بیشترین', 'حجم', 'ارزش معاملات'], rows,
    [12, 10, 6, 10, 16, 10, 10, 10, 10, 10, 10, 16]);
}

function reportSheets({ grade }) {
  if (!grade || grade.error) return [];
  const s = grade.summary;
  const summary = sheet('کارنامه', ['مورد', 'مقدار'], [
    ['شمار مسیرهای ممکن', grade.count], ['به سقف شمارش رسید', grade.truncated ? 'بله' : 'خیر'],
    ['نمره (از ۱۰۰)', n(grade.score)], ['حرف نمره', grade.grade.letter], ['توصیف', grade.grade.label],
    ['رتبهٔ مسیر من', grade.rank], ['درصد مسیرهای بدتر', n(grade.percentile)], ['کارایی ٪', n(grade.efficiency)],
    ['نتیجهٔ من', n(grade.mine.final)], ['بهترین ممکن', n(s.max)], ['میانه', n(s.median)], ['بدترین', n(s.min)],
    ['الگوریتم کامل', n(grade.algo.final)], ['درصد مسیرهای سودده', n(s.winRate)],
  ], [28, 20]);
  const best = [];
  grade.best.forEach((b, k) => {
    if (!b.items.length) best.push([k + 1, n(b.final), '', 'بدون اقدام — نگه‌داشتن تا پایان', '', '', '', '']);
    for (const it of b.items) best.push([k + 1, n(b.final), date(it.date), actionPlain(it.action), n(it.cash), n(it.sAt), n(it.sMoveAfter), n(it.value)]);
  });
  const mine = grade.mineItems.map((it) => [date(it.date), actionPlain(it.action), n(it.cash), n(it.sMoveAfter), n(it.value)]);
  const regret = grade.review.filter((r) => r.regret > 0).sort((a, b) => b.regret - a.regret)
    .map((r) => [date(r.date), actionPlain(r.bestAction), n(r.bestFinal), n(r.chosenFinal), n(r.regret), r.followedAlgo ? 'بله' : 'خیر']);
  return [
    summary,
    sheet('بهترین مسیرها', ['رتبه', 'نتیجهٔ مسیر', 'روز اقدام', 'اقدام', 'نقد همان روز', 'پایه در آن روز', 'حرکت پایه تا پایان ٪', 'ارزش این اقدام'], best, [6, 14, 12, 20, 14, 12, 14, 14]),
    sheet('ارزش کارهای من', ['روز', 'اقدام', 'نقد همان روز', 'حرکت پایه تا پایان ٪', 'ارزش این اقدام'], mine, [12, 20, 14, 14, 14]),
    sheet('روزهای قابل بهبود', ['روز', 'بهترین گزینهٔ همان روز', 'نتیجه با آن', 'نتیجهٔ انتخاب من', 'هزینهٔ انتخاب من', 'پیروی از الگوریتم'], regret, [12, 20, 14, 14, 14, 12]),
  ].filter((sh) => sh.rows.length);
}

/**
 * دفترکار کامل. ورودی همان چیزهایی است که تب دارد؛ `grade` اختیاری است
 * و فقط وقتی معامله تمام شده می‌آید.
 */
export function buildStrangleWorkbook({ ctx, cfg, exp, run, fees = {}, params, capital = NaN, margin = NaN, grade = null, generatedAt = Date.now(), settingsInfo = {} }) {
  const base = { ctx, cfg, exp, run, fees, params, capital, margin, market: ctx.market, generatedAt, settingsInfo };
  return [
    headerSheet(base),
    guideSheet(),
    ...dailySheet(base),
    legsSheet(base),
    ...optionsSheet(base),
    ...reportSheets({ grade }),
    ...chainSheet(base),
  ];
}

export function strangleFileName(exp, market) {
  const base = String(market?.uaName || exp?.name || 'strangle').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 24);
  return `strangle-${base}-${stamp()}`;
}

export function downloadStrangleExcel(args) {
  return downloadXlsx(strangleFileName(args.exp, args.ctx.market), buildStrangleWorkbook(args));
}
