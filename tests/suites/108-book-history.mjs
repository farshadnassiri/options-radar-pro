// ۱۰۷. شمارهٔ پا در دلیلِ اجراناپذیری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { executableAt } from '../../core/bereket-exec.mjs';
import { bookAt, normalizeBookEvents } from '../../core/book-history.mjs';
import { maxSize } from '../../core/exec.mjs';


// ═══════════════════ ۱۰۷. شمارهٔ پا در دلیلِ اجراناپذیری ═══════════════════
//
// موتور اجرا برچسبِ خودش را می‌سازد و قیمت اعمال تویش هست. برای جدول
// معمولی درست است و برای شبیه‌سازی ناشناس غلط. راه‌حل، تجزیهٔ رشتهٔ فارسی
// نیست — موتور **شمارهٔ پا** را هم می‌دهد و مصرف‌کننده برچسب خودش را
// می‌سازد. این گروه همان قرارداد را قفل می‌کند.
group('۱۰۷. شمارهٔ پا در دلیلِ اجراناپذیری');
{
  const evt = (time, ref, level, bid, bidQty, ask, askQty) => ({
    hEven: time, refID: ref, number: level,
    pMeDem: bid, qTitMeDem: bidQty, zOrdMeDem: 1,
    pMeOf: ask, qTitMeOf: askQty, zOrdMeOf: 1,
  });
  const snap = (rows) => bookAt(normalizeBookEvents(rows), 10 * 3600);
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const legs = [
    { kind: 'call', side: 'buy', strike: 10_000, ratio: 1, size: 1000, ins: 'A' },
    { kind: 'call', side: 'sell', strike: 11_000, ratio: 1, size: 1000, ins: 'B' },
  ];
  const openMeta = { A: { limitLow: 1, limitHigh: 9999 }, B: { limitLow: 1, limitHigh: 9999 } };
  const deep = snap([evt(90000, 1, 1, 480, 900, 500, 900), evt(90000, 2, 2, 470, 900, 510, 900)]);
  const thin = snap([evt(90000, 3, 1, 190, 4, 210, 4)]);

  check('هر قید، شمارهٔ پای خودش را دارد', (() => {
    const out = executableAt({ legs, books: { A: deep, B: thin }, meta: openMeta, fees, takePct: 100 });
    return out.limits.every((row) => Number.isInteger(row.index));
  })());
  check('قید مقیدکننده شمارهٔ پا را هم می‌دهد', (() => {
    const out = executableAt({ legs, books: { A: deep, B: thin }, meta: openMeta, fees, takePct: 100 });
    return out.bindingIndex === 1;   // پای نازک، پای دوم است
  })());
  check('از شمارهٔ پا می‌شود برچسب تازه ساخت بی‌آنکه رشته تجزیه شود', (() => {
    const out = executableAt({ legs, books: { A: deep, B: thin }, meta: openMeta, fees, takePct: 100 });
    const leg = legs[out.bindingIndex];
    return leg?.strike === 11_000 && leg.side === 'sell';
  })());
  check('پای بی‌دفتر، شمارهٔ خودش را در فهرست کم‌بودها دارد', (() => {
    const out = executableAt({ legs, books: { A: deep }, meta: openMeta, fees });
    return out.missing.length === 1 && out.missing[0].index === 1 && typeof out.missing[0].leg === 'string';
  })());
  check('پای در صف، شمارهٔ خودش را در فهرست مسدودها دارد', (() => {
    const queued = snap([evt(90000, 9, 1, 300, 5000, 0, 0)]);
    const out = executableAt({
      legs, books: { A: deep, B: queued },
      meta: { A: openMeta.A, B: { limitLow: 100, limitHigh: 300 } }, fees,
    });
    return out.blocked.length === 1 && out.blocked[0].index === 1 && out.blocked[0].key === 'buyQueue';
  })());
  check('قیدِ نیامده از پا — سرمایه — شماره ندارد و همان می‌ماند', (() => {
    const out = executableAt({
      legs, books: { A: deep, B: deep }, meta: openMeta, fees, takePct: 100,
      capitalAvailable: 1000, capitalPerContract: 1000,
    });
    const capital = out.limits.find((row) => row.what === 'سرمایه در دسترس');
    return !!capital && capital.index === undefined;
  })());
  check('بدون هیچ مظنه‌ای، شمارهٔ قید منفی یک است', (() => {
    const out = maxSize([{ kind: 'call', side: 'buy', ratio: 1, size: 1000, exec: { assumedDepth: true } }], {});
    return out.bindingIndex === -1 && out.max === 0;
  })());
}
