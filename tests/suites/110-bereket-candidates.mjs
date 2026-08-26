// ۱۰۹. تولید کاندید و پرتفوی سایه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  combosFor, generateCandidates, markShadow, openShadow, shadowTable,
} from '../../core/bereket-candidates.mjs';
import { byId } from '../../strategies/catalog.mjs';


// ═══════════════════ ۱۰۹. تولید کاندید و پرتفوی سایه ═══════════════════
group('۱۰۹. تولید کاندید و پرتفوی سایه');
{
  const contracts = [];
  for (const strike of [9000, 9500, 10_000, 10_500, 11_000, 11_500, 12_000]) {
    for (const kind of ['call', 'put']) {
      for (const expiry of [20260620, 20260720, 20260820]) {
        contracts.push({ ins: `${kind}-${strike}-${expiry}`, kind, strike, expiry, size: 1000, name: `x${strike}` });
      }
    }
  }
  const spot = 10_200;

  // ——— تولید ———
  {
    const vertical = combosFor(byId('bull-call-spread'), contracts, spot);
    check('اسپرد عمودی ترکیب می‌سازد', vertical.length > 0);
    check('هر ترکیب دو پا با دو قیمت اعمال دارد',
      vertical.every((row) => row.legs.length === 2 && row.strikes.length === 2 && row.strikes[0] < row.strikes[1]));
    check('پنجره حول قیمت جاری بریده می‌شود، نه از ابتدای فهرست',
      vertical.every((row) => row.strikes.some((k) => Math.abs(k - spot) <= 1500)));
    check('فاصله‌های مختلف قیمت اعمال امتحان می‌شوند',
      new Set(vertical.map((row) => row.step)).size > 1);
    check('شناسه از خود پاها ساخته می‌شود و پایدار است', (() => {
      const again = combosFor(byId('bull-call-spread'), contracts, spot);
      return again.map((r) => r.id).join(',') === vertical.map((r) => r.id).join(',');
    })());
    check('شناسهٔ تکراری ساخته نمی‌شود',
      new Set(vertical.map((row) => row.id)).size === vertical.length);

    const butterfly = combosFor(byId('long-call-butterfly'), contracts, spot);
    check('باترفلای سه قیمت اعمال با فاصلهٔ برابر می‌سازد',
      butterfly.every((row) => row.strikes[1] - row.strikes[0] === row.strikes[2] - row.strikes[1]));
    check('نسبت پاها از الگو می‌آید',
      butterfly.every((row) => row.legs[1].ratio === 2));

    const calendar = combosFor(byId('calendar-call'), contracts, spot);
    check('تقویمی دو سررسید متفاوت می‌گیرد',
      calendar.length > 0 && calendar.every((row) => row.expiries.length === 2 && row.expiries[0] < row.expiries[1]));
    check('پاهای تقویمی سررسیدهای متفاوت دارند',
      calendar.every((row) => row.legs[0].expiry !== row.legs[1].expiry));

    check('سقف هر ساختار رعایت می‌شود',
      combosFor(byId('long-call-butterfly'), contracts, spot, { maxPerDef: 2 }).length === 2);
    check('قیمت اعمال کم، ترکیب نمی‌سازد',
      combosFor(byId('iron-condor'), contracts.filter((c) => c.strike === 10_000), spot).length === 0);
    check('بدون قیمت پایه، ترکیبی ساخته نمی‌شود',
      combosFor(byId('bull-call-spread'), contracts, NaN).length === 0);
    check('پایی که قرارداد ندارد، کل ترکیب را می‌اندازد', (() => {
      const noPuts = contracts.filter((row) => row.kind === 'call');
      return combosFor(byId('iron-butterfly'), noPuts, spot).length === 0;
    })());
  }

  // ——— سقف کل ———
  {
    const defs = [byId('bull-call-spread'), byId('long-call-butterfly'), byId('long-straddle')];
    const all = generateCandidates(defs, contracts, spot);
    check('ترکیبات همهٔ ساختارها با هم می‌آیند',
      all.candidates.length > 0 && new Set(all.candidates.map((row) => row.defId)).size === 3);
    const capped = generateCandidates(defs, contracts, spot, { maxTotal: 4 });
    check('رسیدن به سقف کل، صریح اعلام می‌شود',
      capped.candidates.length === 4 && capped.truncated === true);
    check('نرسیدن به سقف هم صریح است', all.truncated === false);
  }

  // ——— سایه ———
  {
    const legs = [
      { kind: 'call', side: 'buy', strike: 10_000, ratio: 1, size: 1000 },
      { kind: 'call', side: 'sell', strike: 11_000, ratio: 1, size: 1000 },
    ];
    const shadow = openShadow({ id: 'a', defId: 'bull-call-spread', defName: 'Bull Call Spread', legs, prices: [500, 200], size: 2, at: { date: 20260519, second: 36000 }, capital: 600_000 });
    check('سایه همیشه سایه است', shadow.isShadow === true);
    check('اندازه و قیمت ورود کپی می‌شوند، نه ارجاع', (() => {
      const prices = [500, 200];
      const s = openShadow({ id: 'b', legs, prices });
      prices[0] = 999;
      return s.entryPrices[0] === 500;
    })());
    check('سود سایه از تفاضل قیمت و اندازه می‌آید',
      Math.abs(markShadow(shadow, [600, 250]) - ((100 * 1000) + (-50 * 1000)) * 2) < 1e-9);
    check('پای بی‌قیمت، کل سایه را نامعلوم می‌کند',
      Number.isNaN(markShadow(shadow, [600, NaN])));
    check('سایهٔ بی‌پا عددی نمی‌سازد', Number.isNaN(markShadow({ legs: [] }, [])));

    // ——— جدول مقایسه ———
    const shadows = [
      openShadow({ id: 'a', defName: 'الف', legs, prices: [500, 200], capital: 3e5 }),
      openShadow({ id: 'b', defName: 'ب', legs, prices: [500, 200], capital: 3e5 }),
      openShadow({ id: 'c', defName: 'پ', legs, prices: [500, 200], capital: 3e5 }),
      openShadow({ id: 'd', defName: 'ت', legs, prices: [500, 200], capital: 3e5 }),
    ];
    const table = shadowTable(shadows, {
      a: [700, 250], b: [600, 250], c: [520, 210], d: [600, NaN],
    }, ['b']);
    check('رتبه از سود می‌آید نه از امتیاز موتور',
      table.rows[0].id === 'a' && table.rows[0].rank === 1);
    check('انتخاب کاربر علامت می‌خورد و رتبه‌اش گزارش می‌شود',
      table.rows.find((row) => row.id === 'b').isChosen === true && table.myBest === 2);
    check('سایهٔ بی‌قیمت رتبه نمی‌گیرد ولی حذف هم نمی‌شود',
      table.unpriced === 1 && table.rows.some((row) => row.id === 'd' && Number.isNaN(row.rank)));
    check('شمار برنده‌ها گزارش می‌شود', table.winners === 3);
    check('بدون انتخاب، رتبهٔ کاربر ساخته نمی‌شود',
      Number.isNaN(shadowTable(shadows, { a: [700, 250] }, []).myBest));
  }
}
