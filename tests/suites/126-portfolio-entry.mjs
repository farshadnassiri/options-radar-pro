// ۱۲۶. ظرفیت مشترک و قیمت اجرایی ورود ترکیب

import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { bookCapacity, walkBook } from '../../core/exec.mjs';
import { grossCash } from '../../core/payoff.mjs';
import { portfolioCandidates } from '../../core/portfolio-candidates.mjs';
import { portfolioEntryPlan } from '../../core/portfolio-entry.mjs';
import { byId } from '../../strategies/catalog.mjs';

group('۱۲۶. ظرفیت مشترک و قیمت اجرایی ورود ترکیب');
{
  const at126 = { date: 20260521, second: 10 * 3600 };
  const quality126 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: at126,
    sufficient: true, details: { levelsKnown: 2, levelsTotal: 2 },
  });
  const twoLevelBook = ({ bid, ask, capacity }) => [
    { level: 1, bid, bidQty: capacity, ask, askQty: capacity, second: at126.second },
    { level: 2, bid: bid - 2, bidQty: capacity, ask: ask + 2, askQty: capacity, second: at126.second },
  ];
  const contracts126 = [];
  for (const strike of [9000, 9500, 10_000, 10_500, 11_000, 11_500, 12_000]) {
    contracts126.push({
      ins: `call-${strike}`, kind: 'call', strike, expiry: 20260620, size: 1000,
      name: `کال ${strike}`,
      quote: { book: twoLevelBook({ bid: 50, ask: 60, capacity: 30 }), quality: quality126 },
    });
  }
  const session126 = {
    id: 'pt-entry-126', baseIns: '900001', state: 'active', start: at126,
    end: { date: at126.date + 100, second: at126.second },
    lockedAllocations: [{ familyId: 'wing', pct: 100, targetRial: 250_000 }],
    lockedMission: {
      liquidity: {
        minUnderlyingDailyValueRial: 100_000_000,
        minOptionDailyValueRial: 10_000_000,
        minOpenInterest: 100,
        maxSpreadPct: 8,
        maxBookTakePct: 50,
        requireFullBook: false,
      },
    },
    startSnapshot: { at: at126, spot: 10_200, contracts: contracts126 },
  };
  const evidenceFor126 = (session = session126) => ({
    ok: true,
    now: { ...at126 },
    rows: session.startSnapshot.contracts.flatMap((contract) => ['buy', 'sell'].map((side) => {
      const executableQty = Math.floor(bookCapacity(contract.quote.book, side, 0, Infinity, 0.5));
      const execution = walkBook(contract.quote.book, executableQty, side, 0, 0.5);
      return {
        candidateId: `${contract.ins}:${side}`,
        ins: contract.ins,
        side,
        verdict: 'accepted',
        accepted: true,
        executableQty,
        execution: {
          vwap: execution.vwap, top: execution.top, filled: execution.filled,
          levels: execution.levels, maxBookTakePct: 50,
        },
        quality: { candidate: quality126, book: quality126 },
      };
    })),
  });

  // ابتدا فقط هویت ترکیب را می‌سازیم؛ سپس برای سه پای همان ترکیب عمق‌های
  // متفاوت می‌گذاریم و خروجی نهایی را دوباره از موتور مشترک می‌گیریم.
  const preliminary126 = portfolioCandidates(
    session126, [byId('long-call-butterfly')], evidenceFor126(),
  );
  const picked126 = preliminary126.candidates[0];
  const books126 = [
    twoLevelBook({ bid: 90, ask: 100, capacity: 14 }),
    twoLevelBook({ bid: 30, ask: 36, capacity: 20 }),
    twoLevelBook({ bid: 34, ask: 40, capacity: 12 }),
  ];
  picked126.legs.forEach((leg, index) => {
    const contract = contracts126.find((row) => row.ins === leg.ins);
    contract.quote = { book: books126[index], quality: quality126, last: 999, close: 998 };
  });
  const evidence126 = evidenceFor126();
  const candidates126 = portfolioCandidates(
    session126, [byId('long-call-butterfly')], evidence126,
  );
  const candidate126 = candidates126.candidates.find((row) => row.id === picked126.id);
  const plan126 = portfolioEntryPlan(session126, candidates126, evidence126, candidate126.id);

  check('خروجی ترکیب شناسه همان جلسه را برای ممیزی نگه می‌دارد',
    candidates126.sessionId === session126.id);
  check('جلسه فعال و خروجی معتبر طرح اجرایی می‌سازند', plan126.ok, plan126.why);
  check('ظرفیت مشترک کمینه ظرفیت پاها پس از تقسیم بر نسبت است',
    plan126.executableQty === 10
    && plan126.legs.map((row) => row.maxComboQty).join(',') === '14,10,12');
  check('حجم نسبت دو برای پای میانی دوباره از همان دفتر پیموده می‌شود',
    plan126.legs[1].ratio === 2
    && plan126.legs[1].execution.filled === 20
    && plan126.legs[1].execution.levels === 2);
  check('خرید فقط ask و فروش فقط bid را مصرف می‌کند',
    Math.abs(plan126.legs[0].execution.vwap - 100.6) < 1e-9
    && plan126.legs[0].execution.top === 100
    && plan126.legs[1].execution.vwap === 29
    && plan126.legs[1].execution.top === 30);
  check('شناسه، سمت، نسبت، اندازه و ارجاع حکم بدون تغییر می‌مانند',
    plan126.legs.every((row, index) => row.ins === candidate126.legs[index].ins
      && row.side === candidate126.legs[index].side
      && row.ratio === candidate126.legs[index].ratio
      && row.size === candidate126.legs[index].size
      && row.eligibilityRef === candidate126.legs[index].eligibilityRef));
  check('کیفیت حکم کنار اجرای هر پا حفظ می‌شود',
    plan126.legs.every((row) => row.quality?.kind === 'executable'
      && row.execution.maxBookTakePct === 50));

  const pricedForCash126 = plan126.legs.map((row) => ({
    kind: row.kind, side: row.side, ratio: row.ratio, size: row.size,
    strike: row.strike, price: row.execution.vwap,
  }));
  check('جمع نقد فقط از موتور مشترک payoff و حجم کامل می‌آید',
    plan126.unitEntryCashRial === grossCash(pricedForCash126)
    && plan126.entryCashRial === grossCash(pricedForCash126) * plan126.executableQty
    && plan126.entryCashRial === -834_000);
  check('بودجه حجم دفتر را پنهانی کوچک نمی‌کند و سقف خودش را جدا می‌گوید',
    plan126.executableQty === 10
    && plan126.budget.exceeded
    && plan126.budget.requiredRial === 834_000
    && plan126.budget.maxQty === 2
    && plan126.budget.binding?.code === 'familyBudgetExceeded');

  check('پیش‌نویس حتی با خروجی قبلی طرح ورود نمی‌سازد',
    portfolioEntryPlan({ ...session126, state: 'draft' }, candidates126, evidence126, candidate126.id)
      .reason.code === 'inactiveSession');
  check('خروجی ترکیب جلسه دیگر پذیرفته نمی‌شود',
    portfolioEntryPlan(session126, { ...candidates126, sessionId: 'other' }, evidence126, candidate126.id)
      .reason.code === 'invalidCandidateSet');
  check('شناسه دست‌ساز بیرون خروجی معتبر قیمت نمی‌گیرد',
    portfolioEntryPlan(session126, candidates126, evidence126, 'forged')
      .reason.code === 'candidateNotFound');
  check('حکم لحظه دیگر پیش از خواندن دفتر رد می‌شود',
    portfolioEntryPlan(session126, candidates126, {
      ...evidence126, now: { ...at126, second: at126.second + 1 },
    }, candidate126.id).reason.code === 'mismatchedEvidence');

  const rejectedEvidence126 = JSON.parse(JSON.stringify(evidence126));
  const rejectedRef126 = candidate126.legs[0].eligibilityRef;
  const rejectedVerdict126 = rejectedEvidence126.rows.find((row) => row.candidateId === rejectedRef126);
  rejectedVerdict126.accepted = false;
  rejectedVerdict126.verdict = 'rejected';
  check('پای فاقد حکم پذیرفته کل طرح را با علت صریح رد می‌کند',
    portfolioEntryPlan(session126, candidates126, rejectedEvidence126, candidate126.id)
      .reason.code === 'rejectedLeg');

  const mismatchedEvidence126 = JSON.parse(JSON.stringify(evidence126));
  mismatchedEvidence126.rows.find((row) => row.candidateId === rejectedRef126).executableQty += 1;
  check('ظرفیت حکم ناسازگار با دفتر snapshot پذیرفته نمی‌شود',
    portfolioEntryPlan(session126, candidates126, mismatchedEvidence126, candidate126.id)
      .reason.code === 'mismatchedEvidence');

  const forgedSet126 = JSON.parse(JSON.stringify(candidates126));
  forgedSet126.candidates.find((row) => row.id === candidate126.id).legs[0].size = 1;
  check('اندازه قرارداد دستکاری‌شده با مشخصات snapshot رد می‌شود',
    portfolioEntryPlan(session126, forgedSet126, evidence126, candidate126.id)
      .reason.code === 'contractMismatch');

  const forgedRatio126 = JSON.parse(JSON.stringify(candidates126));
  forgedRatio126.candidates.find((row) => row.id === candidate126.id).legs[1].ratio = 1;
  check('نسبت دستکاری‌شده با تعریف کاتالوگ رد می‌شود',
    portfolioEntryPlan(session126, forgedRatio126, evidence126, candidate126.id)
      .reason.code === 'invalidCandidateSet');
  const forgedBudget126 = JSON.parse(JSON.stringify(candidates126));
  forgedBudget126.candidates.find((row) => row.id === candidate126.id)
    .allocation.targetRial = 9_000_000_000;
  check('بودجه از تخصیص قفل‌شده می‌آید نه عدد دستکاری‌شده خروجی',
    portfolioEntryPlan(session126, forgedBudget126, evidence126, candidate126.id)
      .reason.code === 'invalidCandidateSet');

  const wrongPriceEvidence126 = JSON.parse(JSON.stringify(evidence126));
  wrongPriceEvidence126.rows.find((row) => row.candidateId === rejectedRef126)
    .execution.vwap += 1;
  check('حکم با VWAP دفتر دیگر، حتی در همان لحظه، پذیرفته نمی‌شود',
    portfolioEntryPlan(session126, candidates126, wrongPriceEvidence126, candidate126.id)
      .reason.code === 'mismatchedEvidence');

  const missingBookSession126 = JSON.parse(JSON.stringify(session126));
  const missingContract126 = missingBookSession126.startSnapshot.contracts
    .find((row) => row.ins === candidate126.legs[0].ins);
  missingContract126.quote = { book: [], last: 777, close: 776, bid: 775, ask: 778 };
  const missingBook126 = portfolioEntryPlan(
    missingBookSession126, candidates126, evidence126, candidate126.id,
  );
  check('نبود دفتر با آخرین یا پایانی جایگزین نمی‌شود و جمع مالی null می‌ماند',
    !missingBook126.ok && missingBook126.reason.code === 'missingBook'
    && missingBook126.entryCashRial === null && missingBook126.executableQty === null);

  const zeroCapacitySession126 = JSON.parse(JSON.stringify(session126));
  const zeroContract126 = zeroCapacitySession126.startSnapshot.contracts
    .find((row) => row.ins === candidate126.legs[0].ins);
  zeroContract126.quote.book = zeroContract126.quote.book
    .map((row) => ({ ...row, askQty: null }));
  const zeroCapacity126 = portfolioEntryPlan(
    zeroCapacitySession126, candidates126, evidence126, candidate126.id,
  );
  check('پای فاقد ظرفیت به صفر ترکیب تبدیل نمی‌شود؛ کل طرح فاقد داده است',
    !zeroCapacity126.ok && zeroCapacity126.reason.code === 'missingCapacity'
    && zeroCapacity126.executableQty === null);

  const src126 = readSrc('../core/portfolio-entry.mjs');
  check('قیمت و نقد فقط از موتورهای مشترک دفتر و payoff می‌آیند',
    src126.includes("from './exec.mjs'") && src126.includes('bookCapacity(')
    && src126.includes('walkBook(') && src126.includes("from './payoff.mjs'")
    && src126.includes('grossCash('));
  check('برش خالص است و رتبه، پیشنهاد، DOM یا شبکه ندارد',
    !/scoreCandidate|rankCandidates|document\.|fetch\(|recordPortfolioTransaction/.test(src126));
}
