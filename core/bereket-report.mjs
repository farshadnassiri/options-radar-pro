// گزارش پایان جلسه.
//
// ═══ چرا معیار مقایسه اجباری است ═══
//
// مهم‌ترین جملهٔ کل مشخصات، همین‌جاست: بازار ایران روند اسمی بزرگی دارد،
// و بدون معیار مقایسه همه‌چیز سودده به‌نظر می‌رسد. سیستمی که فقط بازده
// مطلق را گزارش کند، به کاربر یاد می‌دهد «همیشه کال بخر» — و آن درس، در
// یک بازهٔ صعودی، با اعداد هم تأیید می‌شود.
//
// پس عددی که این ماژول **اول** می‌گوید مازاد است، نه بازده. بازده مطلق
// هم هست، ولی کنارش و پس از آن. ترتیب نمایش، خودش یک تصمیم آموزشی است.
//
// دو معیار، هر دو اجباری:
//
//   نگهداری ساده     همان سرمایه، در همان بازه، روی خودِ سهم پایه
//   همان ساختار      روی چند نماد دیگر، در همان بازه
//
// دومی چیزی را می‌گوید که اولی نمی‌گوید: اگر ساختار روی همهٔ نمادها ضرر
// داده، مشکل از انتخاب نماد نبوده.
//
// ═══ کارت دقت پیش‌بینی ═══
//
// جدا از نتیجهٔ مالی، و عمداً. معامله‌گری که جهت را درست می‌زند و ساختار
// را غلط می‌چیند، مسئله‌اش با کسی که جهت را غلط می‌زند یکی نیست — و اگر
// هر دو فقط یک عدد سود ببینند، هیچ‌وقت نمی‌فهمند کدامشان‌اند.

import { num } from './num.mjs';
import { normalizeHistoryDate, daysBetween } from './history.mjs';
import { VIEW_DIRECTIONS, SESSION_STATES } from './bereket-session.mjs';
import { EVENT_KINDS } from './bereket-events.mjs';

const faInt = (n) => String(Math.round(num(n, 0))).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const faNum1 = (n) => (Number.isFinite(num(n, NaN)) ? num(n).toFixed(1) : '—')
  .replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/\./g, '٫');

/**
 * نگهداری سادهٔ سهم پایه در همان بازه.
 *
 * کارمزد خرید و فروش شمرده می‌شود، وگرنه معیار از موقعیتی که کارمزدش
 * حساب شده جلو می‌افتد و مقایسه نامتوازن می‌شود.
 */
export function buyHoldBenchmark({ rows = [], from, to, fees = {} } = {}) {
  const start = normalizeHistoryDate(from), end = normalizeHistoryDate(to);
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ date: normalizeHistoryDate(row?.date), close: num(row?.close, NaN) }))
    .filter((row) => row.date && row.close > 0)
    .sort((a, b) => a.date - b.date);
  const open = list.find((row) => row.date >= start);
  const close = [...list].reverse().find((row) => row.date <= end);
  if (!open || !close || open.date >= close.date) {
    return { ok: false, why: 'برای نگهداری ساده، دو قیمت در دو سر بازه لازم است.' };
  }
  const buyFee = num(fees.buyStock, 0), sellFee = num(fees.sellStock, 0);
  const grossPct = ((close.close - open.close) / open.close) * 100;
  const netPct = (((close.close * (1 - sellFee)) - (open.close * (1 + buyFee))) / (open.close * (1 + buyFee))) * 100;
  return {
    ok: true, openDate: open.date, closeDate: close.date,
    openPrice: open.close, closePrice: close.close,
    grossPct, netPct, days: daysBetween(open.date, close.date),
  };
}

/**
 * بازده موقعیت، بر مخرج سرمایهٔ درگیر.
 *
 * مخرج از موتور وجه تضمین می‌آید، نه از پریمیوم پرداختی — همان تعریفی که
 * کل برنامه دارد. اگر اینجا تعریف دیگری داشت، مازاد با عددی مقایسه
 * می‌شد که جای دیگری هیچ معنی ندارد.
 */
export function positionReturnPct({ netPnl = NaN, capital = NaN } = {}) {
  const pnl = num(netPnl, NaN), base = num(capital, NaN);
  return base > 0 && Number.isFinite(pnl) ? (pnl / base) * 100 : NaN;
}

/**
 * مازاد — عددِ اصلی گزارش.
 *
 * تفریق است نه نسبت، چون هر دو درصدند و معامله‌گر «۱۲ واحد بهتر از
 * نگهداری» را می‌فهمد، نه «۱٫۴ برابر».
 */
export function excessOver(returnPct, benchmarkPct) {
  const a = num(returnPct, NaN), b = num(benchmarkPct, NaN);
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN;
}

/**
 * همان ساختار روی نمادهای دیگر.
 *
 * ورودی، نتیجهٔ آماده‌شدهٔ هر نماد است؛ این تابع فقط جمع‌بندی می‌کند.
 * محاسبهٔ خودِ آن نتایج به لایه‌ای تعلق دارد که به داده دسترسی دارد.
 */
export function peerBenchmark(rows = []) {
  const list = (rows || []).filter((row) => Number.isFinite(num(row?.returnPct, NaN)));
  if (!list.length) return { ok: false, why: 'همان ساختار روی نماد دیگری ارزیابی نشد.' };
  const values = list.map((row) => num(row.returnPct));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const winners = values.filter((value) => value > 0).length;
  return {
    ok: true, rows: list, count: list.length, meanPct: mean,
    winners, winRatePct: (winners / list.length) * 100,
    best: Math.max(...values), worst: Math.min(...values),
  };
}

/**
 * کارت دقت پیش‌بینی — مستقل از نتیجهٔ مالی.
 *
 * سه چیز جدا: جهت درست بود یا نه، بزرگی چقدر خطا داشت، و کاربر چقدر
 * مطمئن بود. سومی بدون دو تای اول بی‌معنی است و با آن‌ها، نمودار
 * کالیبراسیون را می‌سازد.
 */
export function forecastAccuracy({ view = {}, actualMovePct = NaN } = {}) {
  const actual = num(actualMovePct, NaN);
  if (!Number.isFinite(actual)) {
    return { ok: false, why: 'حرکت واقعی پایه در این بازه معلوم نشد.' };
  }
  const said = num(view.movePct, NaN);
  const direction = view.direction;
  const wentUp = actual > 0.05, wentDown = actual < -0.05;
  const hit = direction === 'up' ? wentUp
    : direction === 'down' ? wentDown
      : direction === 'flat' ? (!wentUp && !wentDown)
        : direction === 'volatile' ? Math.abs(actual) > Math.abs(said || 0) : false;
  const magnitudeError = Number.isFinite(said) ? Math.abs(actual) - Math.abs(said) : NaN;
  return {
    ok: true, hit, direction, directionLabel: VIEW_DIRECTIONS[direction] || direction,
    saidPct: said, actualPct: actual, magnitudeError,
    confidence: num(view.confidence, NaN),
    note: hit
      ? `جهت درست بود: گفتی ${VIEW_DIRECTIONS[direction] || direction} و پایه ${faNum1(actual)}٪ حرکت کرد.`
      : `جهت غلط بود: گفتی ${VIEW_DIRECTIONS[direction] || direction} و پایه ${faNum1(actual)}٪ حرکت کرد.`,
  };
}

/**
 * خط زمانی جلسه: تصمیم‌ها، انتظارهای قفل‌شده، و آنچه واقعاً رخ داد.
 *
 * همه در یک فهرست و مرتب بر زمان. دو فهرست جدا، کاربر را وادار می‌کرد
 * خودش تطبیقشان بدهد — و همان تطبیق، کل ارزش این خط زمانی است.
 */
export function sessionTimeline(session) {
  if (!session) return [];
  const out = [];
  for (const decision of session.decisions || []) {
    out.push({
      at: decision.at, kind: 'view', label: 'نظر ثبت شد',
      detail: `${VIEW_DIRECTIONS[decision.view?.direction] || '—'} · ${faNum1(decision.view?.movePct)}٪ در ${faInt(decision.view?.horizonDays)} روز · اطمینان ${faInt(num(decision.view?.confidence, 0) * 100)}٪`,
      reason: decision.view?.reason || '',
    });
    if (decision.expectation) {
      out.push({
        at: decision.expectation.lockedAt, kind: 'expectation', label: 'انتظار قفل شد',
        detail: decision.expectation.text, reason: '',
      });
    }
    for (const pick of decision.chosen || []) {
      out.push({
        at: decision.at, kind: 'pick', label: 'انتخاب',
        detail: `${pick.id} — ${faInt(pick.size)} قرارداد · رتبهٔ موتور ${faInt(pick.rank)}`,
        reason: '',
      });
    }
  }
  for (const event of session.events || []) {
    // برچسب فارسیِ رویداد. نسخهٔ اول کلید انگلیسی را مستقیم چاپ می‌کرد و
    // در خط زمانی «open» می‌نشست کنار «نظر ثبت شد».
    out.push({
      at: event.at, kind: event.kind,
      label: EVENT_KINDS[event.kind] || event.kind,
      detail: event.detail || '', reason: '',
    });
  }
  return out.sort((a, b) => {
    const ka = num(a.at?.date, 0) * 100000 + num(a.at?.second, 0);
    const kb = num(b.at?.date, 0) * 100000 + num(b.at?.second, 0);
    return ka - kb;
  });
}

/**
 * گزارش کامل، با مازاد در صدر.
 *
 * `ok` تنها وقتی درست است که **هر دو** معیار موجود باشند. سند می‌گوید
 * هیچ نتیجه‌ای بدون معیار مقایسه گزارش نشود، و نیم‌معیار هم معیار نیست:
 * اگر فقط نگهداری ساده را داشته باشیم، جمله‌ای که می‌سازیم درست است ولی
 * ناقص، و کاربر ناقصی‌اش را نمی‌بیند.
 */
export function sessionReport({
  session, netPnl = NaN, capital = NaN,
  baseRows = [], fees = {}, peers = [], actualMovePct = NaN,
  shadowVerdict = null, pickQuality = null,
} = {}) {
  const from = session?.start?.date, to = session?.now?.date;
  const returnPct = positionReturnPct({ netPnl, capital });
  const buyHold = buyHoldBenchmark({ rows: baseRows, from, to, fees });
  const peer = peerBenchmark(peers);
  const accuracy = forecastAccuracy({ view: session?.decisions?.[0]?.view || {}, actualMovePct });

  const excessBuyHold = buyHold.ok ? excessOver(returnPct, buyHold.netPct) : NaN;
  const excessPeer = peer.ok ? excessOver(returnPct, peer.meanPct) : NaN;
  const complete = buyHold.ok && peer.ok;

  return {
    ok: complete,
    // ترتیب عمدی: مازاد اول، بازده مطلق بعد.
    headline: complete
      ? `مازاد بر نگهداری ساده ${faNum1(excessBuyHold)} واحد درصد، و بر همان ساختار روی ${faInt(peer.count)} نماد دیگر ${faNum1(excessPeer)} واحد درصد.`
      : 'گزارش بدون معیار مقایسه کامل نیست.',
    why: complete ? '' : [buyHold.ok ? '' : buyHold.why, peer.ok ? '' : peer.why].filter(Boolean).join(' '),
    excessBuyHold, excessPeer, returnPct,
    buyHold, peer, accuracy,
    timeline: sessionTimeline(session),
    shadowVerdict, pickQuality,
    state: session?.state, stateLabel: SESSION_STATES[session?.state] || '',
    practice: !!session?.practice, manualStart: !!session?.manualStart,
    regime: session?.regime || null,
    from, to,
    warning: complete && returnPct > 0 && excessBuyHold < 0
      ? 'سود کردی ولی از نگهداری سادهٔ همان سهم عقب ماندی. در بازاری با روند اسمی بزرگ، همین حالت رایج‌ترین شکل خودفریبی است.'
      : '',
  };
}
