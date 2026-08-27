// خلاصهٔ حسابداری جلسه — برش هفتم و پایانی فاز ۴.
//
// جلسه دوطرفه شد: باز می‌شود و بسته می‌شود. ولی هیچ‌جا نمی‌شد پرسید «این
// جلسه تا اینجا چه کرد؟» — چند ثبت، چند خروج، چقدر کارمزد داده شد، چقدر
// نقد وارد و خارج شد.
//
// چهار مرز:
//
// **فقط از دفتر رویداد.** هیچ شمارندهٔ موازی‌ای ساخته نمی‌شود. شمارندهٔ
// موازی روزی با دفتر اختلاف پیدا می‌کند و آن‌وقت هیچ‌کدام سند نیستند.
//
// **ورود و خروج و کارمزد، سه عدد جدا.** جمعِ درهم نمی‌گوید پول کجا رفت.
// کارمزدِ قاطی‌شده با نقد، هزینه‌ای است که دیده نمی‌شود.
//
// **رویدادِ بی‌عدد صفر نیست.** ثبتی که عددش را ندارد نه بی‌صدا صفر حساب
// می‌شود و نه کل گزارش را `null` می‌کند — شمرده و نام‌بُرده می‌شود.
//
// **این سود و زیان نیست.** جمعِ نقدِ ورود و خروج، سود نیست: موقعیتِ باز
// هنوز ارزش دارد و آن ارزش اینجا معلوم نیست. ارزش‌گذاری کار فاز ۵ است،
// و نوشتنِ عددی به نام «سود» بدون آن، دروغ است نه تقریب.

import { PORTFOLIO_CLOSE_VERSION } from './portfolio-close.mjs';
import { PORTFOLIO_COMMIT_VERSION } from './portfolio-commit.mjs';
import { portfolioSessionPositions } from './portfolio-positions.mjs';

export const PORTFOLIO_SUMMARY_VERSION = 1;

export const PORTFOLIO_SUMMARY_REASONS = Object.freeze({
  noSession: 'جلسه‌ای برای خلاصهٔ حسابداری در کار نیست',
  brokenLedger: 'دفتر رویداد جلسه قابل بازپخش نیست',
});

const text = (value) => String(value ?? '').trim();
const money = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

function fail(reason, why = '') {
  return {
    version: PORTFOLIO_SUMMARY_VERSION,
    ok: false,
    why: why || PORTFOLIO_SUMMARY_REASONS[reason],
    reason,
    empty: false,
    entries: null,
    exits: null,
    fees: null,
    byFamily: [],
    unpriced: null,
    positions: null,
  };
}

/** رویدادهای تراکنشی جلسه — همان و تنها منبع. */
function transactions(session) {
  return (session?.events || []).filter((event) => event?.type === 'transaction');
}

/**
 * خلاصهٔ حسابداری یک جلسه.
 *
 * `entries.cashRial` جمعِ نقدِ سندهای ورود است و `exits.cashRial` جمعِ
 * نقدِ سندهای خروج. علامتشان همان است که موتورها نوشتند: خرید منفی چون
 * پول می‌دهی. کارمزد جدا می‌ماند و هیچ‌جا داخل نقد نمی‌رود.
 */
export function portfolioSessionSummary(session) {
  if (!session) return fail('noSession');
  const state = portfolioSessionPositions(session);
  if (!state.ok) return fail(state.reason === 'noSession' ? 'noSession' : 'brokenLedger', state.why);

  const entries = { count: 0, cashRial: 0, capitalRial: 0, feeRial: 0 };
  const exits = { count: 0, full: 0, partial: 0, cashRial: 0, feeRial: 0, qty: 0 };
  const families = new Map();
  const unpricedIds = [];

  const familyRow = (familyId) => {
    const row = families.get(familyId)
      || { familyId, entries: 0, exits: 0, entryCashRial: 0, exitCashRial: 0, feeRial: 0 };
    families.set(familyId, row);
    return row;
  };

  for (const event of transactions(session)) {
    const data = event.data;
    const familyId = text(event.familyId);

    if (data?.commitVersion === PORTFOLIO_COMMIT_VERSION) {
      const cash = money(data.entryCashRial);
      const capital = money(data.capitalRial);
      const fee = money(data.capital?.components?.feeRial);
      if (cash === null || capital === null) {
        // نه صفر، نه پاک‌کردنِ کل گزارش: شمرده و نام‌بُرده.
        unpricedIds.push(text(event.id));
        continue;
      }
      entries.count += 1;
      entries.cashRial += cash;
      entries.capitalRial += capital;
      entries.feeRial += fee ?? 0;
      const row = familyRow(familyId);
      row.entries += 1;
      row.entryCashRial += cash;
      row.feeRial += fee ?? 0;
      continue;
    }

    if (data?.closeVersion === PORTFOLIO_CLOSE_VERSION) {
      const cash = money(data.exitCashRial);
      const fee = money(data.feeRial);
      if (cash === null || fee === null) {
        unpricedIds.push(text(event.id));
        continue;
      }
      exits.count += 1;
      // «آفست کامل» و «کاهش حجم» دو چیزند؛ یکی‌کردنشان یعنی نمی‌شود
      // فهمید جلسه چند بار واقعاً تخت شد.
      if (data.kind === 'close') exits.full += 1; else exits.partial += 1;
      exits.cashRial += cash;
      exits.feeRial += fee;
      exits.qty += Number(data.qty) || 0;
      const row = familyRow(familyId);
      row.exits += 1;
      row.exitCashRial += cash;
      row.feeRial += fee;
      continue;
    }

    // تراکنشی که هیچ‌کدام از دو سند را ندارد — نه شمرده می‌شود نه پنهان.
    unpricedIds.push(text(event.id));
  }

  const feeRial = entries.feeRial + exits.feeRial;
  const total = transactions(session).length;

  return {
    version: PORTFOLIO_SUMMARY_VERSION,
    ok: true,
    why: '',
    reason: null,
    now: session.now ? { ...session.now } : null,
    empty: total === 0,
    note: total === 0 ? 'این جلسه هنوز هیچ تراکنشی ندارد' : '',
    entries,
    exits,
    // کارمزد جدا از هر دو جریان نقد. هزینه‌ای که داخل نقد قاطی شود، دیده
    // نمی‌شود.
    fees: { totalRial: feeRial, entryRial: entries.feeRial, exitRial: exits.feeRial },
    byFamily: [...families.values()].sort((a, b) => (a.familyId < b.familyId ? -1 : 1)),
    unpriced: { count: unpricedIds.length, eventIds: unpricedIds },
    positions: {
      total: state.counts.total,
      open: state.counts.open,
      closed: state.counts.closed,
    },
  };
}
