// منحنی بازده سبد — برش هشتم فاز ۵.
//
// جلسه کامل شده: باز می‌شود، جلو می‌رود، ارزش می‌گیرد، بسته می‌شود. ولی
// کاربر فقط **عدد** می‌بیند، نه **شکل** ریسکش. سبدِ چندموقعیتی یک منحنی
// بازده دارد که از جمع پاهای همهٔ موقعیت‌ها درمی‌آید — و همان منحنی
// می‌گوید کجا زیان می‌دهد.
//
// چهار مرز:
//
// **یک منحنی، نه چند منحنیِ کنار هم.** پاهای همهٔ موقعیت‌های باز در یک
// مجموعه جمع می‌شوند و **یک بار** به موتور بازده داده می‌شوند. جمعِ
// جداگانهٔ نتیجه‌ها غلط است: دو موقعیت می‌توانند همدیگر را در یک بازه
// خنثی کنند و آن خنثی‌شدن فقط در منحنیِ مشترک دیده می‌شود.
//
// **منحنی نصفه بدتر از نبودِ منحنی است**، چون شبیه منحنی است. اگر یک
// موقعیت سند نداشته باشد، کل منحنی `null` می‌شود و علتش نام‌بُرده.
//
// **قاعدهٔ بازده دوباره نوشته نمی‌شود.** `analyzePayoff` نقاط شکست،
// سربه‌سری‌ها و آستانهٔ اعمالِ کارمزددار را می‌داند. قاعدهٔ دوم یعنی
// روزی دو جای برنامه دو سربه‌سری متفاوت نشان می‌دهند.
//
// **زیانِ نامحدود عدد نمی‌گیرد.** `null` می‌ماند و پرچمش را می‌گیرد؛
// جایگزینی با عددِ بزرگ یعنی کاربر فکر می‌کند سقفی هست.

import { analyzePayoff } from './payoff.mjs';
import { activeSnapshot } from './portfolio-snapshot.mjs';
import { portfolioSessionPositions } from './portfolio-positions.mjs';

export const PORTFOLIO_PAYOFF_VERSION = 1;

export const PORTFOLIO_PAYOFF_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای منحنی بازده در کار نیست',
  brokenLedger: 'دفتر رویداد جلسه قابل بازپخش نیست',
  noOpenPositions: 'موقعیت بازی نیست، پس منحنی بازدهی هم نیست',
  undocumented: 'سند طرحِ یکی از موقعیت‌های باز خوانده نشد، پس منحنی ناقص می‌ماند',
  missingFees: 'نرخ کارمزد در عکس شروع نیست',
  unknownCash: 'نقد ورودِ یکی از موقعیت‌های باز در سند نیست',
});

const num = (value) => Number(value);

function fail(reason, detail = '', extra = {}) {
  return {
    version: PORTFOLIO_PAYOFF_VERSION,
    ok: false,
    why: detail ? `${PORTFOLIO_PAYOFF_REASONS[reason]} — ${detail}` : PORTFOLIO_PAYOFF_REASONS[reason],
    reason,
    curve: null,
    legs: [],
    positions: [],
    blocking: extra.blocking ?? [],
  };
}

/**
 * منحنی بازدهِ همهٔ موقعیت‌های باز جلسه.
 *
 * پاها با حجمِ **باز** وزن می‌گیرند، نه حجم اولیه: نصفِ بسته‌شدهٔ یک
 * موقعیت دیگر ریسکی ندارد و آوردنش منحنی را بزرگ‌تر از واقعیت می‌کند.
 */
export function portfolioPayoffCurve(session) {
  if (!session) return fail('noSession');
  const state = portfolioSessionPositions(session);
  if (!state.ok) return fail(state.reason === 'noSession' ? 'noSession' : 'brokenLedger', state.why);

  const open = state.positions.filter((row) => row.status === 'open' && row.openQty > 0);
  if (!open.length) return fail('noOpenPositions');

  const fees = activeSnapshot(session)?.capitalInputs?.fees
    ?? session.startSnapshot?.capitalInputs?.fees;
  if (!Number.isFinite(num(fees?.option))) return fail('missingFees');

  // موقعیت بی‌سند کل منحنی را متوقف می‌کند — ولی نام‌بُرده، نه بی‌صدا.
  const blind = open.filter((row) => !row.documented).map((row) => row.id);
  if (blind.length) {
    return fail('undocumented', blind.join('، '), { blocking: blind });
  }

  const legs = [];
  let netCashRial = 0;
  for (const position of open) {
    // مقدارِ خام، نه `num()`: `Number(null)` صفر است و نقدِ نبوده را
    // بی‌صدا صفر می‌کند.
    const docCash = position.entryCashRial;
    if (!Number.isFinite(docCash)) {
      return fail('unknownCash', position.id, { blocking: [position.id] });
    }
    // سند برای حجم اولیه نوشته شده؛ با حجمِ باز هم‌تراز می‌شود — همان
    // قاعدهٔ ارزش‌گذاری. تناسب دقیق است چون نقد خطی در حجم است.
    const share = position.initialQty > 0 ? position.openQty / position.initialQty : 0;
    netCashRial += docCash * share;

    for (const leg of position.legs) {
      // وزن پا = نسبتِ ترکیب × حجمِ باز. `signedQty` همین `ratio × size`
      // را می‌خواند، پس حجم داخل `ratio` ضرب می‌شود و اندازهٔ قرارداد
      // دست‌نخورده می‌ماند.
      legs.push({
        // شناسهٔ قرارداد در منحنی می‌ماند تا بشود گفت کدام پا کدام است؛
        // موتور بازده به آن کار ندارد.
        ins: leg.ins,
        kind: leg.kind,
        side: leg.side,
        ratio: num(leg.ratio) * position.openQty,
        size: leg.size,
        strike: leg.strike,
        price: leg.vwap,
        positionId: position.id,
      });
    }
  }
  if (!legs.length) return fail('noOpenPositions');

  // یک بار، روی مجموعهٔ مشترک. جمعِ جداگانهٔ نتیجه‌ها خنثی‌شدنِ دو
  // موقعیت را در یک بازه نمی‌بیند.
  const payoff = analyzePayoff(legs, netCashRial, { fees });

  return {
    version: PORTFOLIO_PAYOFF_VERSION,
    ok: true,
    why: '',
    reason: null,
    now: state.now,
    legs,
    positions: open.map((row) => ({
      id: row.id, defId: row.defId, openQty: row.openQty, familyId: row.familyId,
    })),
    curve: {
      netCashRial,
      breakevens: payoff.breakevens,
      strikes: payoff.strikes,
      segments: payoff.segments,
      // نامحدود عدد نمی‌گیرد؛ پرچمش را می‌گیرد.
      maxProfitRial: payoff.unlimitedProfit ? null : payoff.maxProfit,
      maxLossRial: payoff.unlimitedLoss ? null : payoff.maxLoss,
      unlimitedProfit: payoff.unlimitedProfit,
      unlimitedLoss: payoff.unlimitedLoss,
      atMaxProfit: payoff.unlimitedProfit ? null : payoff.atMaxProfit,
      atMaxLoss: payoff.unlimitedLoss ? null : payoff.atMaxLoss,
      slopeLeft: payoff.slopeLeft,
      slopeRight: payoff.slopeRight,
      at: payoff.at,
    },
    blocking: [],
  };
}
