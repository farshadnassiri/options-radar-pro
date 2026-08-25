// رویدادهای میانهٔ پرش، و قواعد خروج.
//
// دو بند سند که با هم یک چیزند و جدا از هم بی‌معنی‌اند.
//
// ═══ «پرش هرگز واقعاً پرش نیست» ═══
//
// اگر از دوشنبه به پنج‌شنبه بپریم و فقط دو سرِ بازه را ببینیم، هر چیزی که
// وسط افتاده گم می‌شود: کال مارجینی که سه‌شنبه ساعت ده و چهل خورد و
// چهارشنبه جبران شد، در گزارش اصلاً وجود ندارد. ولی کارگزار آن روز
// موقعیت را می‌بست. پس موتور قدم‌به‌قدم جلو می‌رود و هر قدم را جدا
// می‌بیند، و هر رویداد **مهر زمانی دقیق خودش** را می‌گیرد.
//
// ═══ «خروج فقط وقتی ثبت شود که ممکن باشد» ═══
//
// این ارزشمندترین چیزی است که این ماژول یاد می‌دهد، و سند هم روی همین
// تأکید کرده. حد ضرر روی خودِ قرارداد اختیار در این بازار اغلب اجراشدنی
// نیست: اسپرد پهن است، عمق کم، و گاهی هیچ مظنه‌ای نیست. سیستمی که فرض
// کند حد ضرر خورد و خارج شد، نتیجه‌اش دروغ است — و دروغش هم همیشه به نفع
// استراتژی است، چون خروجِ نشدنی را در بهترین قیمت ثبت می‌کند.
//
// پس هر خروج دو مرحله دارد: قاعده شلیک می‌کند، و بعد **دفتر همان لحظه**
// می‌گوید ممکن هست یا نه. اگر نبود، رویداد «خروج ناموفق» ثبت می‌شود و
// موقعیت باز می‌ماند. این رویداد حذف نمی‌شود و کم‌رنگ هم نمی‌شود؛ خودش
// نتیجهٔ آموزشی است.
//
// ═══ چرا حد ضرر روی قیمت قرارداد اصلاً در فهرست نیست ═══
//
// چون اگر باشد، کاربر از آن استفاده می‌کند و در بیشتر مواقع «خروج
// ناموفق» می‌گیرد. فهرست عمداً فقط چیزهایی را دارد که به قیمت **پایه**
// یا به زمان بسته‌اند — پایه نقدشونده است و زمان قطعی.

import { num } from './num.mjs';
import { signedQty } from './payoff.mjs';
import { executableAt } from './bereket-exec.mjs';
import { marginAt } from './bereket-value.mjs';
import { moment, momentKey } from './trading-calendar.mjs';
import { tradeTimeLabel } from './backtest.mjs';
import { secondToHms } from './book-history.mjs';

export const EVENT_KINDS = {
  open: 'موقعیت باز شد',
  marginCall: 'کال مارجین',
  expiry: 'سررسید',
  halt: 'توقف نماد',
  queueBlocked: 'صف — بستن ممکن نبود',
  exitRule: 'قاعدهٔ خروج فعال شد',
  exitDone: 'خروج انجام شد',
  exitFailed: 'خروج ناموفق',
  noQuote: 'بی‌مظنه',
};

/**
 * قواعد خروج — فقط چیزهایی که واقعاً اجراشدنی‌اند.
 *
 * `basis` می‌گوید هر قاعده به چه چیزی بسته است. هیچ‌کدام به قیمت خودِ
 * قرارداد بسته نیست، و این حذف عمدی است نه فراموشی.
 */
export const EXIT_RULES = [
  { key: 'spotAbove', label: 'قیمت پایه از سطح بالاتر رفت', basis: 'قیمت پایه', field: 'level', unit: 'ریال' },
  { key: 'spotBelow', label: 'قیمت پایه از سطح پایین‌تر رفت', basis: 'قیمت پایه', field: 'level', unit: 'ریال' },
  { key: 'profitPct', label: 'به درصدی از بیشترین سود رسید', basis: 'سود موقعیت', field: 'pct', unit: 'درصد' },
  { key: 'lossPct', label: 'به درصدی از بیشترین زیان رسید', basis: 'زیان موقعیت', field: 'pct', unit: 'درصد' },
  { key: 'daysLeft', label: 'روز مانده تا سررسید به آستانه رسید', basis: 'زمان', field: 'days', unit: 'روز' },
];

export const EXIT_RULE_BY_KEY = Object.fromEntries(EXIT_RULES.map((rule) => [rule.key, rule]));

/**
 * چرا حد ضرر روی قیمت قرارداد در فهرست نیست — جمله‌ای که رابط نشان می‌دهد.
 *
 * جدا و صادراتی است چون اگر فقط کامنت بود، کاربر فهرست را می‌دید و فکر
 * می‌کرد چیزی جا افتاده.
 */
export const NO_OPTION_STOP_NOTE = 'حد ضرر روی قیمت خودِ قرارداد اختیار در این فهرست نیست، و این حذف عمدی است: اسپرد پهن و عمق کم یعنی چنین حد ضرری اغلب اجرا نمی‌شود، و سیستمی که فرض کند اجرا شد، نتیجه‌اش همیشه به نفع استراتژی دروغ می‌گوید. قواعد بالا همه به قیمت پایه یا به زمان بسته‌اند — پایه نقدشونده است و زمان قطعی.';

/** پاهای بستن: همان پاها با جهت معکوس. */
export function closingLegs(legs = []) {
  return (legs || []).map((leg) => ({ ...leg, side: leg?.side === 'sell' ? 'buy' : 'sell' }));
}

/** آیا یک قاعده در این حالت شلیک می‌کند. */
export function ruleFires(rule, state = {}) {
  const spec = EXIT_RULE_BY_KEY[rule?.key];
  if (!spec) return false;
  const value = num(rule?.value, NaN);
  if (!Number.isFinite(value)) return false;
  if (rule.key === 'spotAbove') return num(state.spot, NaN) > value;
  if (rule.key === 'spotBelow') return num(state.spot, NaN) < value;
  if (rule.key === 'daysLeft') return num(state.daysLeft, Infinity) <= value;
  if (rule.key === 'profitPct') {
    const best = num(state.maxProfit, NaN);
    const pnl = num(state.pnl, NaN);
    if (!(best > 0) || !Number.isFinite(pnl)) return false;
    return (pnl / best) * 100 >= value;
  }
  if (rule.key === 'lossPct') {
    const worst = Math.abs(num(state.maxLoss, NaN));
    const pnl = num(state.pnl, NaN);
    if (!(worst > 0) || !Number.isFinite(pnl) || pnl >= 0) return false;
    return (Math.abs(pnl) / worst) * 100 >= value;
  }
  return false;
}

/** اولین قاعده‌ای که شلیک می‌کند، به ترتیب فهرست کاربر. */
export function firstFiring(rules = [], state = {}) {
  for (const rule of rules || []) if (ruleFires(rule, state)) return rule;
  return null;
}

/**
 * کال مارجین.
 *
 * سنجه، وجه تضمین **لازم** است نه خالص: خالص پریمیوم دریافتی را کم
 * می‌کند و چون هر دو با قیمت قرارداد بالا می‌روند، تفاضلشان تقریباً ثابت
 * می‌ماند و هرگز هشدار نمی‌دهد. آنچه کارگزار می‌بیند عدد ناخالص است.
 *
 * `equity` سرمایهٔ در دسترس همان لحظه است — سرمایهٔ جلسه منهای آنچه در
 * موقعیت‌های دیگر بلوکه است.
 */
export function marginCallAt({ legs = [], prices = [], spot, equity = 0, params = {}, contractSize = 1000, maintRatio = 0.70 } = {}) {
  const state = marginAt({ legs, prices, spot, params, contractSize });
  const required = num(state.margin?.requiredTotal, NaN);
  if (!Number.isFinite(required) || !(required > 0)) {
    return { called: false, required: NaN, equity: num(equity, 0), state, why: 'وجه تضمینی محاسبه نشد' };
  }
  const floor = required * Math.min(1, Math.max(0, num(maintRatio, 0.70)));
  const have = num(equity, 0);
  return {
    called: have < floor,
    required, floor, equity: have, shortfall: Math.max(0, floor - have),
    state,
    why: have < floor
      ? `وجه تضمین نگهداری ${Math.round(floor)} لازم بود و ${Math.round(have)} در دسترس`
      : '',
  };
}

/**
 * تلاش برای بستن موقعیت در یک لحظه.
 *
 * جواب سه حالت دارد و هر سه لازم‌اند: شد، نشد چون صف یا مظنه نبود، نشد
 * چون عمق کافی نبود. حالت آخر با اولی فرق دارد — «نصفش را می‌شد بست» یک
 * واقعیت است و باید دیده شود.
 */
export function attemptClose({
  legs = [], size = 1, books = {}, meta = {}, fees = {},
  contractSize = 1000, takePct = 30,
} = {}) {
  const reversed = closingLegs(legs);
  const out = executableAt({
    legs: reversed, books, meta, fees, contractSize, takePct, qty: Math.max(1, num(size, 1)),
  });
  const want = Math.max(1, Math.trunc(num(size, 1)));
  if (!out.ok) {
    return {
      closed: false, filled: 0, want,
      kind: out.blocked?.length ? 'queueBlocked' : 'noQuote',
      why: out.why, exec: out,
    };
  }
  const filled = Math.min(want, num(out.max, 0));
  if (!(filled > 0)) {
    return { closed: false, filled: 0, want, kind: 'noQuote', why: out.why || 'عمق کافی نبود', exec: out };
  }
  return {
    closed: filled >= want, filled, want,
    partial: filled < want,
    kind: filled >= want ? 'exitDone' : 'exitFailed',
    why: filled >= want ? '' : `فقط ${filled} از ${want} قرارداد قابل بستن بود`,
    exec: out,
  };
}

/** رویداد استاندارد، با مهر زمانی خوانا. */
export function makeEvent(kind, at, extra = {}) {
  const point = moment(at?.date, at?.second);
  return {
    kind, kindLabel: EVENT_KINDS[kind] || kind,
    at: point,
    stamp: `${point.date} ${tradeTimeLabel(secondToHms(point.second))}`,
    ...extra,
  };
}

/**
 * قدم‌زدن در فاصلهٔ دو لحظه، و ثبت هر چه سر راه افتاد.
 *
 * `feed(momentIndex, moment)` وضعیت هر قدم را می‌دهد:
 * `{ spot, prices, books, meta, daysLeft, pnl }`. تزریق است چون `core/`
 * به شبکه دست نمی‌زند.
 *
 * حلقه سر **اولین رویدادِ بسته‌کننده** می‌ایستد. رویدادی که موقعیت را
 * نمی‌بندد — خروج ناموفق، صف — ثبت می‌شود و حلقه ادامه می‌دهد؛ همان
 * چیزی که در واقعیت هم رخ می‌دهد: قاعده شلیک می‌کند، بازار اجازه نمی‌دهد،
 * و فردا دوباره امتحان می‌کنی.
 */
export function walkMoments({
  moments = [], feed, legs = [], size = 1, rules = [],
  equity = 0, params = {}, fees = {}, contractSize = 1000, takePct = 30,
  maintRatio = 0.70, expiryDate = 0, maxProfit = NaN, maxLoss = NaN,
} = {}) {
  const events = [];
  let closedAt = null, open = true, attempts = 0;
  if (typeof feed !== 'function') return { events, closedAt, open, attempts };

  for (let at = 0; at < moments.length && open; at += 1) {
    const point = moments[at];
    const step = feed(at, point);
    if (!step) continue;

    // ۱. سررسید — پیش از هر چیز دیگری، چون بعدش قراردادی در کار نیست.
    if (expiryDate && num(point?.date, 0) >= num(expiryDate, 0)) {
      events.push(makeEvent('expiry', point, { detail: 'قرارداد به سررسید رسید؛ موقعیت با تسویه بسته شد.' }));
      closedAt = point; open = false;
      break;
    }

    // ۲. توقف نماد — پیش از قواعد خروج، چون در توقف هیچ خروجی ممکن نیست.
    if (step.halted) {
      events.push(makeEvent('halt', point, { detail: step.haltWhy || 'نماد در این لحظه مجاز نبود.' }));
      continue;
    }

    // ۳. کال مارجین.
    const call = marginCallAt({
      legs, prices: step.prices || [], spot: step.spot, equity: num(step.equity, equity),
      params, contractSize, maintRatio,
    });
    if (call.called) {
      events.push(makeEvent('marginCall', point, {
        detail: call.why, required: call.required, floor: call.floor,
        equity: call.equity, shortfall: call.shortfall,
      }));
      const forced = attemptClose({ legs, size, books: step.books || {}, meta: step.meta || {}, fees, contractSize, takePct });
      attempts += 1;
      if (forced.closed) {
        events.push(makeEvent('exitDone', point, { detail: 'بستن اجباری پس از کال مارجین.', filled: forced.filled, exec: forced.exec }));
        closedAt = point; open = false;
        break;
      }
      events.push(makeEvent(forced.kind === 'queueBlocked' ? 'queueBlocked' : 'exitFailed', point, {
        detail: `کال مارجین خورد ولی بستن ممکن نبود — ${forced.why}`, filled: forced.filled, exec: forced.exec,
      }));
      continue;
    }

    // ۴. قواعد خروج کاربر.
    const fired = firstFiring(rules, {
      spot: step.spot, pnl: step.pnl, daysLeft: step.daysLeft,
      maxProfit, maxLoss,
    });
    if (!fired) continue;

    events.push(makeEvent('exitRule', point, {
      detail: `${EXIT_RULE_BY_KEY[fired.key]?.label || fired.key} — آستانه ${fired.value}`,
      rule: fired,
    }));
    const tried = attemptClose({ legs, size, books: step.books || {}, meta: step.meta || {}, fees, contractSize, takePct });
    attempts += 1;
    if (tried.closed) {
      events.push(makeEvent('exitDone', point, { detail: 'خروج طبق قاعده انجام شد.', filled: tried.filled, exec: tried.exec }));
      closedAt = point; open = false;
      break;
    }
    events.push(makeEvent(tried.kind === 'queueBlocked' ? 'queueBlocked' : 'exitFailed', point, {
      detail: `قاعده شلیک کرد ولی در مظنهٔ همان لحظه اجراشدنی نبود — ${tried.why}`,
      filled: tried.filled, exec: tried.exec,
    }));
  }

  return { events, closedAt, open, attempts };
}

/**
 * خلاصهٔ آموزشی مسیر — همان چیزی که کاربر باید یاد بگیرد.
 *
 * شمار «خروج ناموفق» عمداً برجسته است. اگر در یک جلسه سه بار قاعده شلیک
 * کرده و هیچ‌بار اجرا نشده، درسِ آن جلسه همین است، نه سود و زیانش.
 */
export function eventSummary(events = []) {
  const by = {};
  for (const event of events || []) by[event.kind] = (by[event.kind] || 0) + 1;
  const failed = (by.exitFailed || 0) + (by.queueBlocked || 0);
  const fired = by.exitRule || 0;
  return {
    counts: by,
    fired, failed,
    executedRate: fired > 0 ? ((fired - failed) / fired) * 100 : NaN,
    note: fired === 0
      ? 'هیچ قاعدهٔ خروجی در این بازه شلیک نکرد.'
      : failed === 0
        ? 'هر قاعده‌ای که شلیک کرد، در مظنهٔ همان لحظه اجرا شد.'
        : `از ${fired} بار شلیک قاعده، ${failed} بار در مظنهٔ همان لحظه اجرا نشد و موقعیت باز ماند. همین، بخش اصلی درسِ این جلسه است.`,
  };
}

export { momentKey };
