// ۱۲۷. سرمایه لازم و وجه تضمین طرح ورود

import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { bookCapacity, walkBook } from '../../core/exec.mjs';
import { strategyMargin } from '../../core/margin.mjs';
import { entryFees } from '../../core/payoff.mjs';
import { portfolioCandidates } from '../../core/portfolio-candidates.mjs';
import { portfolioEntryPlan } from '../../core/portfolio-entry.mjs';
import { portfolioCapitalRequirement } from '../../core/portfolio-capital.mjs';
import { byId } from '../../strategies/catalog.mjs';

group('۱۲۷. سرمایه لازم و وجه تضمین طرح ورود');
{
  const at127 = { date: 20260521, second: 10 * 3600 };
  const observed127 = makeDataQuality({
    kind: 'observed', source: 'locked-broker-settings', asOf: at127, sufficient: true,
  });
  const executable127 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: at127, sufficient: true,
    details: { levelsKnown: 2, levelsTotal: 2 },
  });
  const book127 = ({ bid, ask, qty = 40 }) => [
    { level: 1, bid, bidQty: qty, ask, askQty: qty, second: at127.second },
    { level: 2, bid: bid - 2, bidQty: qty, ask: ask + 2, askQty: qty, second: at127.second },
  ];
  const contracts127 = [];
  for (const strike of [9000, 9500, 10_000, 10_500, 11_000, 11_500, 12_000]) {
    contracts127.push({
      ins: `call-${strike}`, kind: 'call', strike, expiry: 20260620, size: 1000,
      quote: { book: book127({ bid: 68, ask: 72 }), close: 70, quality: executable127 },
    });
    contracts127.push({
      ins: `put-${strike}`, kind: 'put', strike, expiry: 20260620, size: 1000,
      quote: { book: book127({ bid: 78, ask: 82 }), close: 80, quality: executable127 },
    });
  }
  const capitalInputs127 = {
    fees: {
      option: 0.001, buyStock: 0.003, sellStock: 0.009, quality: observed127,
    },
    margin: {
      spotCloseRial: 10_200,
      params: { A: 0.20, B: 0.10, C: 10_000, maint: 0.70, bBasis: 'SPOT' },
      creditMode: 'FULL', nakedComboMargin: 'MAX_PLUS_PREMIUM', quality: observed127,
    },
  };
  const session127 = {
    id: 'pt-capital-127', baseIns: '900001', state: 'active', start: at127,
    end: { date: at127.date + 100, second: at127.second },
    lockedAllocations: [
      { familyId: 'single', pct: 20, targetRial: 2_000_000 },
      { familyId: 'vol', pct: 80, targetRial: 8_000_000 },
    ],
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
    startSnapshot: {
      at: at127, spot: 10_200, contracts: contracts127, capitalInputs: capitalInputs127,
    },
  };
  const evidenceFor127 = (session = session127) => ({
    ok: true,
    now: { ...session.startSnapshot.at },
    rows: session.startSnapshot.contracts.flatMap((contract) => ['buy', 'sell'].map((side) => {
      const executableQty = Math.floor(bookCapacity(contract.quote.book, side, 0, Infinity, 0.5));
      const execution = walkBook(contract.quote.book, executableQty, side, 0, 0.5);
      return {
        candidateId: `${contract.ins}:${side}`, ins: contract.ins, side,
        verdict: 'accepted', accepted: true, executableQty,
        execution: {
          vwap: execution.vwap, top: execution.top, filled: execution.filled,
          levels: execution.levels, maxBookTakePct: 50,
        },
        quality: { candidate: executable127, book: executable127 },
      };
    })),
  });

  const evidence127 = evidenceFor127();
  const candidateSet127 = portfolioCandidates(
    session127, [byId('long-call'), byId('short-strangle')], evidence127,
  );
  const entryFor127 = (defId) => {
    const candidate = candidateSet127.candidates.find((row) => row.defId === defId);
    return portfolioEntryPlan(session127, candidateSet127, evidence127, candidate.id);
  };

  const debitEntry127 = entryFor127('long-call');
  const debit127 = portfolioCapitalRequirement(
    session127, candidateSet127, evidence127, debitEntry127,
  );
  const debitFullLegs127 = debitEntry127.legs.map((leg) => ({
    kind: leg.kind, side: leg.side, ratio: leg.ratio * debitEntry127.executableQty,
    size: leg.size, strike: leg.strike, price: leg.execution.vwap,
  }));
  const debitFee127 = entryFees(debitFullLegs127, capitalInputs127.fees);
  check('طرح بدهکار معتبر همان جلسه مبنای سرمایه می‌گیرد', debit127.ok, debit127.why);
  check('بدهکار خالص واقعی و کارمزد ورود جدا و دقیق می‌مانند',
    debit127.components.debitRial === -debitEntry127.entryCashRial
    && debit127.components.feeRial === debitFee127
    && debit127.components.marginRial === 0
    && debit127.components.totalRial === -debitEntry127.entryCashRial + debitFee127);

  // نرخ صفر فقط وقتی دادهٔ صریح snapshot است پذیرفته می‌شود؛ نبود کلید در
  // پایین جداگانه سنجیده می‌شود و نباید با همین صفر یکی شود.
  const zeroFeeSession127 = JSON.parse(JSON.stringify(session127));
  zeroFeeSession127.startSnapshot.capitalInputs.fees.option = 0;
  const zeroFeeEvidence127 = evidenceFor127(zeroFeeSession127);
  const zeroFeeCandidates127 = portfolioCandidates(
    zeroFeeSession127, [byId('long-call')], zeroFeeEvidence127,
  );
  const zeroFeeEntry127 = portfolioEntryPlan(
    zeroFeeSession127, zeroFeeCandidates127, zeroFeeEvidence127,
    zeroFeeCandidates127.candidates[0].id,
  );
  const zeroFee127 = portfolioCapitalRequirement(
    zeroFeeSession127, zeroFeeCandidates127, zeroFeeEvidence127, zeroFeeEntry127,
  );
  check('نرخ صفر فقط وقتی صریح و هم‌snapshot است پذیرفته می‌شود',
    zeroFee127.ok && zeroFee127.components.feeRial === 0
    && zeroFee127.components.totalRial === zeroFee127.components.debitRial);

  const creditEntry127 = entryFor127('short-strangle');
  const credit127 = portfolioCapitalRequirement(
    session127, candidateSet127, evidence127, creditEntry127,
  );
  const creditLegs127 = creditEntry127.legs.map((leg) => ({
    kind: leg.kind, side: leg.side, ratio: leg.ratio * creditEntry127.executableQty,
    size: leg.size, strike: leg.strike, days: leg.expiry, price: leg.execution.vwap,
  }));
  const closes127 = Object.fromEntries(creditEntry127.legs.map((leg, index) => [
    index, contracts127.find((row) => row.ins === leg.ins).quote.close,
  ]));
  const expectedMargin127 = strategyMargin(creditLegs127, {
    S: 10_200, closes: closes127, params: capitalInputs127.margin.params,
    creditMode: 'FULL', nakedComboMargin: 'MAX_PLUS_PREMIUM', capitalMode: 'GROSS',
  });
  check('طرح بستانکار وجه تضمین را دقیقاً از strategyMargin مشترک می‌گیرد',
    credit127.ok && credit127.components.marginRial === expectedMargin127.margin
    && credit127.audit.margin.comboRule === expectedMargin127.comboRule);
  check('پریمیوم دریافتی وجه تضمین ناخالص را تا صفر محو نمی‌کند',
    credit127.components.creditRial === creditEntry127.entryCashRial
    && credit127.components.marginRial > 0
    && credit127.components.totalRial === credit127.components.marginRial + credit127.components.feeRial
    && credit127.audit.margin.netAfterCreditRial <= credit127.components.marginRial);
  check('اجزای ریالی و جمع برای حسابرسی جدا باقی می‌مانند',
    ['debitRial', 'creditRial', 'feeRial', 'marginRial', 'totalRial']
      .every((key) => Number.isFinite(credit127.components[key])));
  check('بودجه با سرمایه لازم سنجیده می‌شود و ظرفیت دفتر دست‌نخورده می‌ماند',
    credit127.executableQty === creditEntry127.executableQty
    && credit127.budget.entryExecutableQty === creditEntry127.executableQty
    && credit127.budget.requiredRial === credit127.components.totalRial
    && credit127.budget.maxQty === Math.floor(
      credit127.budget.targetRial / credit127.unit.totalRial,
    ));

  const estimatedSession127 = JSON.parse(JSON.stringify(session127));
  estimatedSession127.startSnapshot.capitalInputs.margin.quality = makeDataQuality({
    kind: 'estimated', source: 'estimated-margin-rule', asOf: at127, sufficient: false,
    reason: 'ضریب وجه تضمین از آخرین اطلاعیه برآورد شده است',
  });
  const estimatedEvidence127 = evidenceFor127(estimatedSession127);
  const estimatedCandidates127 = portfolioCandidates(
    estimatedSession127, [byId('short-strangle')], estimatedEvidence127,
  );
  const estimatedEntry127 = portfolioEntryPlan(
    estimatedSession127, estimatedCandidates127, estimatedEvidence127,
    estimatedCandidates127.candidates[0].id,
  );
  const estimated127 = portfolioCapitalRequirement(
    estimatedSession127, estimatedCandidates127, estimatedEvidence127, estimatedEntry127,
  );
  check('کیفیت تخمینی پارامتر وجه تضمین و علت آن تا خروجی حفظ می‌شود',
    estimated127.ok && estimated127.quality.estimated
    && estimated127.audit.margin.quality.reason.includes('آخرین اطلاعیه'));

  const estimatedFeeSession127 = JSON.parse(JSON.stringify(session127));
  estimatedFeeSession127.startSnapshot.capitalInputs.fees.quality = makeDataQuality({
    kind: 'estimated', source: 'estimated-broker-fee', asOf: at127, sufficient: false,
    reason: 'نرخ کارمزد از صورتحساب قبلی برآورد شده است',
  });
  const estimatedFeeEvidence127 = evidenceFor127(estimatedFeeSession127);
  const estimatedFeeCandidates127 = portfolioCandidates(
    estimatedFeeSession127, [byId('long-call')], estimatedFeeEvidence127,
  );
  const estimatedFeeEntry127 = portfolioEntryPlan(
    estimatedFeeSession127, estimatedFeeCandidates127, estimatedFeeEvidence127,
    estimatedFeeCandidates127.candidates[0].id,
  );
  const estimatedFee127 = portfolioCapitalRequirement(
    estimatedFeeSession127, estimatedFeeCandidates127, estimatedFeeEvidence127,
    estimatedFeeEntry127,
  );
  check('کیفیت تخمینی نرخ کارمزد نیز با علت تا جمع سرمایه می‌ماند',
    estimatedFee127.ok && estimatedFee127.quality.estimated
    && estimatedFee127.audit.fee.quality.reason.includes('صورتحساب قبلی'));

  const forgedCash127 = JSON.parse(JSON.stringify(debitEntry127));
  forgedCash127.entryCashRial += 1;
  check('طرح ورود دست‌کاری‌شده حتی با شکل کامل سرمایه نمی‌گیرد',
    portfolioCapitalRequirement(
      session127, candidateSet127, evidence127, forgedCash127,
    ).reason.code === 'invalidEntry');
  const missingLeg127 = JSON.parse(JSON.stringify(creditEntry127));
  missingLeg127.legs.pop();
  check('طرح دارای پای ناقص سرمایه نمی‌گیرد',
    portfolioCapitalRequirement(
      session127, candidateSet127, evidence127, missingLeg127,
    ).reason.code === 'invalidEntry');
  check('طرح ورود جلسه دیگر سرمایه نمی‌گیرد',
    portfolioCapitalRequirement(
      { ...session127, id: 'other-session' }, candidateSet127, evidence127, debitEntry127,
    ).reason.code === 'invalidEntry');
  check('طرح ناهم‌لحظه سرمایه نمی‌گیرد',
    portfolioCapitalRequirement(session127, candidateSet127, evidence127, {
      ...debitEntry127, now: { ...at127, second: at127.second + 1 },
    }).reason.code === 'invalidEntry');

  const missingFeeSession127 = JSON.parse(JSON.stringify(session127));
  delete missingFeeSession127.startSnapshot.capitalInputs.fees.option;
  const missingFeeEvidence127 = evidenceFor127(missingFeeSession127);
  const missingFeeCandidates127 = portfolioCandidates(
    missingFeeSession127, [byId('long-call')], missingFeeEvidence127,
  );
  const missingFeeEntry127 = portfolioEntryPlan(
    missingFeeSession127, missingFeeCandidates127, missingFeeEvidence127,
    missingFeeCandidates127.candidates[0].id,
  );
  const missingFee127 = portfolioCapitalRequirement(
    missingFeeSession127, missingFeeCandidates127, missingFeeEvidence127, missingFeeEntry127,
  );
  check('نبود نرخ کارمزد صفر فرض نمی‌شود و جمع سرمایه null می‌ماند',
    !missingFee127.ok && missingFee127.reason.code === 'missingFeeInputs'
    && missingFee127.components.totalRial === null);

  const missingMarginSession127 = JSON.parse(JSON.stringify(session127));
  delete missingMarginSession127.startSnapshot.capitalInputs.margin.spotCloseRial;
  const missingMarginEvidence127 = evidenceFor127(missingMarginSession127);
  const missingMarginCandidates127 = portfolioCandidates(
    missingMarginSession127, [byId('short-strangle')], missingMarginEvidence127,
  );
  const missingMarginEntry127 = portfolioEntryPlan(
    missingMarginSession127, missingMarginCandidates127, missingMarginEvidence127,
    missingMarginCandidates127.candidates[0].id,
  );
  const missingMargin127 = portfolioCapitalRequirement(
    missingMarginSession127, missingMarginCandidates127, missingMarginEvidence127,
    missingMarginEntry127,
  );
  check('نبود قیمت پایانی پایه وجه تضمین یا سرمایه صفر نمی‌سازد',
    !missingMargin127.ok && missingMargin127.reason.code === 'missingMarginInputs'
    && missingMargin127.components.marginRial === null
    && missingMargin127.components.totalRial === null);

  const missingParamSession127 = JSON.parse(JSON.stringify(session127));
  delete missingParamSession127.startSnapshot.capitalInputs.margin.params.A;
  const missingParamEvidence127 = evidenceFor127(missingParamSession127);
  const missingParamCandidates127 = portfolioCandidates(
    missingParamSession127, [byId('short-strangle')], missingParamEvidence127,
  );
  const missingParamEntry127 = portfolioEntryPlan(
    missingParamSession127, missingParamCandidates127, missingParamEvidence127,
    missingParamCandidates127.candidates[0].id,
  );
  check('پارامتر ناقص وجه تضمین با پیش‌فرض موتور پر نمی‌شود',
    portfolioCapitalRequirement(
      missingParamSession127, missingParamCandidates127, missingParamEvidence127,
      missingParamEntry127,
    ).reason.code === 'missingMarginInputs');

  const missingCloseSession127 = JSON.parse(JSON.stringify(session127));
  const soldIns127 = creditEntry127.legs[0].ins;
  const missingCloseContract127 = missingCloseSession127.startSnapshot.contracts
    .find((row) => row.ins === soldIns127);
  delete missingCloseContract127.quote.close;
  missingCloseContract127.quote.last = 999;
  const missingCloseEvidence127 = evidenceFor127(missingCloseSession127);
  const missingCloseCandidates127 = portfolioCandidates(
    missingCloseSession127, [byId('short-strangle')], missingCloseEvidence127,
  );
  const missingCloseEntry127 = portfolioEntryPlan(
    missingCloseSession127, missingCloseCandidates127, missingCloseEvidence127,
    missingCloseCandidates127.candidates[0].id,
  );
  const missingClose127 = portfolioCapitalRequirement(
    missingCloseSession127, missingCloseCandidates127, missingCloseEvidence127,
    missingCloseEntry127,
  );
  check('پایانی گمشده با آخرین یا VWAP ورود جایگزین نمی‌شود',
    !missingClose127.ok && missingClose127.reason.code === 'missingMarginClose'
    && missingClose127.components.totalRial === null);

  const src127 = readSrc('../core/portfolio-capital.mjs');
  check('زنجیره فقط از موتورهای مشترک ورود، کارمزد و وجه تضمین می‌آید',
    src127.includes("from './portfolio-entry.mjs'") && src127.includes('portfolioEntryPlan(')
    && src127.includes("from './payoff.mjs'") && src127.includes('entryFees(')
    && src127.includes("from './margin.mjs'") && src127.includes('strategyMargin('));
  check('برش خالص است و رتبه، پیشنهاد، DOM، شبکه یا ثبت موقعیت ندارد',
    !/scoreCandidate|rankCandidates|document\.|fetch\(|recordPortfolioTransaction/.test(src127));
}
