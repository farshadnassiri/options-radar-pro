// ۱۲۵. ترکیب خام فقط از حکم‌های پذیرفتهٔ سبد

import { check, group, readSrc } from '../harness.mjs';
import { MAX_PER_DEF, MAX_TOTAL } from '../../core/bereket-candidates.mjs';
import { portfolioCandidates } from '../../core/portfolio-candidates.mjs';
import { byId } from '../../strategies/catalog.mjs';

group('۱۲۵. ترکیب خام فقط از حکم‌های پذیرفتهٔ سبد');
{
  const at125 = { date: 20260521, second: 10 * 3600 };
  const contracts125 = [];
  for (const strike of [9000, 9500, 10_000, 10_500, 11_000, 11_500, 12_000]) {
    for (const kind of ['call', 'put']) {
      for (const expiry of [20260620, 20260720, 20260820]) {
        contracts125.push({
          ins: `${kind}-${strike}-${expiry}`, kind, strike, expiry, size: 1000,
          name: `اختیار ${strike}`,
        });
      }
    }
  }
  const active125 = {
    state: 'active', start: at125,
    // بازهٔ جلسه: عکس باید داخلش بنشیند، حالا که موتور لحظهٔ دلخواه را
    // می‌پذیرد و مرزها را می‌سنجد.
    end: { date: at125.date + 100, second: at125.second },
    lockedAllocations: [
      { familyId: 'vertical', pct: 40, targetRial: 4_000_000_000 },
      { familyId: 'wing', pct: 0, targetRial: 0 },
    ],
    startSnapshot: { at: at125, spot: 10_200, contracts: contracts125 },
  };
  const evidenceFor = (contracts = contracts125, reject = () => false) => ({
    ok: true,
    now: at125,
    rows: contracts.flatMap((contract) => ['buy', 'sell'].map((side) => ({
      ins: contract.ins, side, candidateId: `${contract.ins}:${side}`,
      verdict: reject(contract, side) ? 'rejected' : 'accepted',
      accepted: !reject(contract, side),
    }))),
  });

  const vertical = portfolioCandidates(
    active125,
    [byId('bull-call-spread'), byId('long-call-butterfly')],
    evidenceFor(),
  );
  check('جلسه فعال و حکم هم‌لحظه ترکیب می‌سازند', vertical.ok && vertical.candidates.length > 0, vertical.why);
  check('فقط خانواده دارای بودجه مثبت وارد مولد می‌شود',
    vertical.candidates.every((row) => row.family === 'vertical' && row.defId === 'bull-call-spread'));
  const forged = portfolioCandidates(active125, [{
    id: 'forged', name: 'ساختگی', group: 'vertical', legs: [{ kind: 'call', side: 'buy', slot: 1 }],
    strikes: 1, expiries: 1,
  }], evidenceFor());
  check('تعریف بیرون کاتالوگ حتی با بودجه وارد مولد نمی‌شود',
    forged.ok && forged.candidates.length === 0 && forged.audit.definitions.length === 0);
  check('خانواده بی‌بودجه علت صریح ممیزی دارد',
    vertical.audit.definitions.find((row) => row.family === 'wing')?.emptyReason?.code === 'unallocatedFamily');
  check('شناسه تعریف، خانواده و بودجه در خروجی ممیزی‌پذیر می‌مانند',
    vertical.candidates.every((row) => row.defId && row.family
      && row.allocation.targetRial === 4_000_000_000));
  check('هر پای اختیار به حکم همان قرارداد و سمت ارجاع دارد',
    vertical.candidates.every((row) => row.legs.every((leg) => leg.kind === 'underlying'
      || leg.eligibilityRef === `${leg.ins}:${leg.side}`)));

  check('پیش‌نویس حتی با همه داده‌ها ترکیب نمی‌سازد',
    !portfolioCandidates({ ...active125, state: 'draft' }, [byId('bull-call-spread')], evidenceFor()).ok);
  check('حکم snapshot دیگر ترکیب نمی‌سازد',
    !portfolioCandidates(active125, [byId('bull-call-spread')], {
      ...evidenceFor(), now: { ...at125, second: at125.second + 1 },
    }).ok);

  const rejectOneSide = portfolioCandidates(
    active125,
    [byId('bull-call-spread')],
    evidenceFor(contracts125, (contract, side) => contract.kind === 'call' && side === 'sell'),
  );
  check('ردشدن یک سمت همه ترکیب‌های نیازمند همان پا را حذف می‌کند',
    rejectOneSide.ok && rejectOneSide.candidates.length === 0);
  check('خانواده خالی به‌خاطر پاهای ردشده علت صریح دارد',
    rejectOneSide.audit.definitions[0]?.emptyReason?.code === 'rejectedLegs');

  let touchedFinancialGetter = false;
  const guardedContracts = contracts125.map((contract) => {
    const row = { ...contract };
    Object.defineProperty(row, 'price', { get() { touchedFinancialGetter = true; throw new Error('نباید خوانده شود'); } });
    return row;
  });
  const guardedSession = {
    ...active125,
    startSnapshot: { ...active125.startSnapshot, contracts: guardedContracts },
  };
  const guarded = portfolioCandidates(
    guardedSession,
    [byId('bull-call-spread')],
    evidenceFor(guardedContracts, (contract, side) => contract.kind === 'call' && side === 'sell'),
  );
  check('رد پا هیچ getter مالی قرارداد را نمی‌خواند', guarded.ok && !touchedFinancialGetter);

  const incompleteContracts = contracts125.map((row, index) => (index === 0
    ? { ...row, size: undefined } : row));
  const incomplete = portfolioCandidates({
    ...active125,
    startSnapshot: { ...active125.startSnapshot, contracts: incompleteContracts },
  }, [byId('bull-call-spread')], evidenceFor(incompleteContracts));
  check('قرارداد فاقد اندازه حذف و فیلد گمشده ممیزی می‌شود',
    incomplete.audit.incompleteContracts.some((row) => row.missing.includes('size'))
    && incomplete.candidates.every((row) => row.legs.every((leg) => leg.kind === 'underlying'
      || leg.ins !== incompleteContracts[0].ins)));

  const first = vertical.candidates.map((row) => row.id).join(',');
  const again = portfolioCandidates(
    active125, [byId('bull-call-spread')], evidenceFor(),
  ).candidates.map((row) => row.id).join(',');
  check('شناسه ترکیب میان دو اجرا پایدار می‌ماند', first === again);
  check('سقف هر تعریف از مولد مشترک حفظ می‌شود',
    portfolioCandidates(active125, [byId('bull-call-spread')], evidenceFor(), { maxPerDef: 2 }).candidates.length === 2
    && vertical.candidates.length <= MAX_PER_DEF);
  const capped = portfolioCandidates(active125, [
    byId('bull-call-spread'), byId('bear-call-spread'), byId('bull-put-spread'), byId('bear-put-spread'),
  ], evidenceFor(), { maxTotal: 3 });
  check('سقف کل و اعلام truncation از مولد مشترک حفظ می‌شود',
    capped.candidates.length === 3 && capped.truncated && MAX_TOTAL >= 3);

  const src = readSrc('../core/portfolio-candidates.mjs');
  check('دروازه ترکیب الگوریتم موازی ندارد و مولد مشترک را صدا می‌زند',
    src.includes("from './bereket-candidates.mjs'") && src.includes('generateCandidates(')
    && !src.includes('combosFor('));
  check('دروازه خالص است و قیمت‌گذاری یا رتبه‌بندی ندارد',
    !/document\.|fetch\(|Date\.now|scoreCandidate|rankCandidates/.test(src));
}
