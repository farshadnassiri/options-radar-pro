// ۶۰. مهار بازده نامتعارف
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { evaluate } from '../../core/evaluate.mjs';
import { passesFilters } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


// ═════════ ۶۰. مهار بازده نامتعارف ═════════
//
// حسابرسی: ۳۶۱ بازده ماهانهٔ بالای ۱۰۰۰٪، با بیشینهٔ ۴٫۳ میلیون درصد. ریشهٔ
// اصلی مخرج بود و در گروه ۶ بسته شد. آنچه می‌ماند از مظنه می‌آید نه از
// فرمول: اسپردی که بازار به آن قیمت نمی‌دهد. حذفش تصمیم مدل نیست — پس
// ردیف نشان‌دار می‌شود و کف سرمایه در دست کاربر است.
group('۶۰. مهار بازده نامتعارف');
{
  const s = defaults();
  const size = 1000;
  const Q = (bid, ask) => ({ bid, bidQty: 900, ask, askQty: 900, last: bid, close: bid,
    book: [{ bid, bidQty: 900, ask, askQty: 900 }], state: 'A', staleSec: 1 });
  const def = byId('bear-put-spread');
  const legs = buildLegs(def, { strikes: [90000, 100000], size, days: [30] });
  const mk = (settings) => evaluate({ legs, quotes: [Q(4990, 5000), Q(4990, 5000)],
    ctx: { S: 95000, Sclose: 95000, days: 30, size, qty: 1, settings, def,
      underlying: 'نمونه', sigmaHist: 0.6 } });

  const row = mk({ ...s, feeOption: 0 });
  check('مخرجِ اسپرد بدهکارِ ناچیز، دیگر خودِ بدهکاری نیست',
    row.capitalKind === 'DEBIT_BLOCKED' && row.capital > -row.netCash,
    `${Math.round(row.capital).toLocaleString()} در برابر ${Math.round(-row.netCash).toLocaleString()}`);
  check('و بازده ماهانه از مرتبهٔ صدهزار درصد به مرتبهٔ هزار رسید',
    row.retMonthPct < 5000, `${row.retMonthPct.toFixed(2)}٪`);
  check('ولی هنوز نامتعارف است و برچسبش را می‌گیرد',
    row.warn.includes('بازده نامتعارف'), row.warn.join('، '));
  check('آستانهٔ صفر، هشدار را خاموش می‌کند — قاعده سلیقهٔ کاربر است',
    !mk({ ...s, feeOption: 0, retWarnMonthPct: 0 }).warn.includes('بازده نامتعارف'));
  check('ردیف عادی برچسب نمی‌گیرد',
    !mk({ ...s, feeOption: 0, retWarnMonthPct: 1e7 }).warn.includes('بازده نامتعارف'));

  // کف سرمایه: فیلتر است نه هشدار، و پیش‌فرضش خاموش
  const tiny = { ...row, capital: 8.24, retMaxPct: 50, legPrices: [] };
  check('کف سرمایه به‌طور پیش‌فرض خاموش است', passesFilters(tiny, s));
  check('و با روشن‌شدن، ردیفِ هشت‌ریالی را می‌اندازد',
    !passesFilters(tiny, { ...s, minCapital: 1000000 }));
  check('ولی ردیف با سرمایه واقعی را نمی‌اندازد',
    passesFilters({ ...tiny, capital: 50000000 }, { ...s, minCapital: 1000000 }));
}
