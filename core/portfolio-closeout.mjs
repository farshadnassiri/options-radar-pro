// پروندهٔ پایان جلسه — برش سیزدهم و پایانی فاز ۵.
//
// جلسه شروع می‌شد، جلو می‌رفت، معامله می‌کرد و پایش می‌شد — ولی هیچ‌وقت
// **تمام** نمی‌شد. `session.end` مرزی بود که ساعت از آن رد نمی‌شد، ولی
// هیچ‌کس جلسه را نمی‌بست و هیچ گزارشی از آنچه گذشت نمی‌ساخت.
//
// پنج مرز:
//
// **بستن، یک‌طرفه است.** جلسهٔ بسته دوباره بسته نمی‌شود و پس از آن هیچ
// تراکنشی پذیرفته نمی‌شود — این را دفتر رویداد از قبل تضمین می‌کند
// (`state === 'active'`)، و همین‌جا سنجیده می‌شود تا اگر روزی آن قاعده
// عوض شد، بی‌صدا نماند.
//
// **موقعیتِ بازِ باقی‌مانده پنهان نمی‌شود.** جلسه‌ای که با موقعیت باز
// بسته شود، **تعهدِ باز** دارد. نگفتنش یعنی گزارشِ دروغ: کاربر فکر
// می‌کند کار تمام شده.
//
// **تحقق‌یافته با تحقق‌نیافته یکی نمی‌شود.** اولی پول واقعیِ جابه‌جاشده
// است و دومی حدسی از قیمت امروز. جمعشان عددی می‌سازد که هیچ‌کدام نیست.
//
// **پرونده از دفتر رویداد ساخته می‌شود**، نه از حالتِ درهمِ لحظهٔ آخر.
// همان اصلی که کل جلسه رویش بنا شده.
//
// **بستنِ زودهنگام علتش را می‌گوید.** جلسه‌ای که هنوز به پایانش نرسیده
// فقط با خواستِ صریح بسته می‌شود، نه به‌اشتباه.

import { PORTFOLIO_CLOSE_VERSION } from './portfolio-close.mjs';
import { PORTFOLIO_COMMIT_VERSION } from './portfolio-commit.mjs';
import { portfolioSessionPositions } from './portfolio-positions.mjs';
import { portfolioSessionSummary } from './portfolio-summary.mjs';
import { portfolioRiskWatch } from './portfolio-watch.mjs';
import { momentKey } from './trading-calendar.mjs';
import { portfolioFinalRanking } from './portfolio-final-ranking.mjs';

export const PORTFOLIO_CLOSEOUT_VERSION = 1;

export const PORTFOLIO_CLOSEOUT_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای بستن در کار نیست',
  notActive: 'فقط جلسهٔ فعال بسته می‌شود',
  alreadyClosed: 'این جلسه از پیش بسته شده است',
  tooEarly: 'جلسه هنوز به پایانش نرسیده؛ برای بستن زودهنگام باید صریح خواسته شود',
  brokenLedger: 'دفتر رویداد جلسه قابل بازپخش نیست',
});

const num = (value) => Number(value);

function fail(reason, why = '') {
  return {
    version: PORTFOLIO_CLOSEOUT_VERSION,
    ok: false,
    why: why || PORTFOLIO_CLOSEOUT_REASONS[reason],
    reason,
    session: null,
    dossier: null,
  };
}

/**
 * سود و زیانِ **تحقق‌یافته** — فقط از آنچه واقعاً بسته شده.
 *
 * برای هر موقعیت: نقدِ خروج‌ها منهای کارمزدشان، به‌علاوهٔ سهمِ نقدِ
 * ورود از حجمی که بسته شده و منهای سهمِ کارمزدِ ورود. سهم دقیق است نه
 * تقریبی، چون نقد و کارمزد هر دو خطی در حجم‌اند.
 */
function realizedFrom(session, positions) {
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const exitsBy = new Map();
  for (const event of session?.events || []) {
    if (event?.data?.closeVersion !== PORTFOLIO_CLOSE_VERSION) continue;
    const id = String(event.positionId || '');
    const row = exitsBy.get(id) || {
      cashRial: 0, feeRial: 0, entryCashRial: 0, entryFeeRial: 0,
      realizedRial: 0, qty: 0, known: true,
    };
    const cash = event.data.exitCashRial;
    const fee = event.data.feeRial;
    const entryCash = event.data.entryCashRial;
    const entryFee = event.data.entryFeeRial;
    const realized = event.data.realizedRial;
    row.qty += num(event.data.qty) || 0;
    if (![cash, fee, entryCash, entryFee, realized].every(Number.isFinite)) row.known = false;
    else {
      row.cashRial += cash; row.feeRial += fee;
      row.entryCashRial += entryCash; row.entryFeeRial += entryFee;
      row.realizedRial += realized;
    }
    exitsBy.set(id, row);
  }

  let totalRial = 0;
  const unknown = [];
  const rows = [];
  for (const [id, exits] of exitsBy) {
    if (!exits || exits.qty === 0) continue;
    const position = positionById.get(id);
    if (!exits.known) {
      unknown.push(id);
      continue;
    }
    totalRial += exits.realizedRial;
    rows.push({
      id, defId: position?.defId || '', familyId: position?.familyId || '',
      closedQty: exits.qty, exitCashRial: exits.cashRial, exitFeeRial: exits.feeRial,
      entryShareRial: exits.entryCashRial, entryFeeShareRial: exits.entryFeeRial,
      realizedRial: exits.realizedRial,
    });
  }
  return {
    // جمعِ نصفه بدتر از نبودِ عدد است.
    totalRial: unknown.length ? null : totalRial,
    rows,
    unknown,
  };
}

/**
 * بستن جلسه و ساختن پروندهٔ پایان.
 *
 * `force` برای بستنِ زودهنگام است — خواستِ صریح، نه پیش‌فرض.
 */
export function closeoutPortfolioSession(session, evidence, {
  at, force = false, startEvidence = null,
} = {}) {
  if (!session) return fail('noSession');
  if (session.state === 'closed') return fail('alreadyClosed');
  if (session.state !== 'active') return fail('notActive', session.state || '');

  const moment = at ? { date: Number(at.date), second: Number(at.second) } : (session.now || null);
  const reached = momentKey(moment) >= momentKey(session.end);
  // بستنِ زودهنگام ممکن است، ولی نه به‌اشتباه.
  if (!reached && !force) return fail('tooEarly');

  const state = portfolioSessionPositions(session);
  if (!state.ok) return fail('brokenLedger', state.why);

  const summary = portfolioSessionSummary(session);
  const watch = portfolioRiskWatch(session, evidence);
  const realized = realizedFrom(session, state.positions);
  const finalRanking = startEvidence ? portfolioFinalRanking(session, startEvidence) : null;
  const open = state.positions.filter((row) => row.status === 'open' && row.openQty > 0);

  const closed = {
    ...session,
    state: 'closed',
    now: moment ? { ...moment } : session.now,
    closedAt: moment ? { ...moment } : null,
  };

  return {
    version: PORTFOLIO_CLOSEOUT_VERSION,
    ok: true,
    why: '',
    reason: null,
    // پس از این، دفتر رویداد هیچ تراکنشی نمی‌پذیرد چون جلسه فعال نیست.
    session: closed,
    dossier: {
      version: PORTFOLIO_CLOSEOUT_VERSION,
      sessionId: session.id,
      start: session.start ? { ...session.start } : null,
      end: session.end ? { ...session.end } : null,
      closedAt: moment ? { ...moment } : null,
      // بستنِ زودهنگام در خودِ پرونده می‌ماند؛ پرونده‌ای که نگوید زودتر
      // بسته شده، فردا شبیه جلسهٔ کامل خوانده می‌شود.
      early: !reached,
      accounting: summary.ok ? {
        entries: summary.entries, exits: summary.exits, fees: summary.fees,
        byFamily: summary.byFamily, unpriced: summary.unpriced,
      } : null,
      accountingWhy: summary.ok ? '' : summary.why,
      realized,
      finalRanking,
      positions: {
        total: state.counts.total,
        open: state.counts.open,
        closed: state.counts.closed,
        // تعهدِ باز پنهان نمی‌شود.
        openIds: open.map((row) => row.id),
        openQty: open.reduce((sum, row) => sum + row.openQty, 0),
      },
      // هشدارهای لحظهٔ بستن، همان‌طور که بودند.
      alerts: watch.ok ? watch.alerts : [],
      alertsWhy: watch.ok ? '' : watch.why,
    },
  };
}
