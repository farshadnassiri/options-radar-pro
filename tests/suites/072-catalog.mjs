// ۷۱. موقعیت باز و تغییر آن
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { buildChain, underlyingList } from '../../core/chain.mjs';
import { decisionDashboardSnapshot } from '../../core/decision-dashboard.mjs';
import { evaluate } from '../../core/evaluate.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';
import { fmt as uiFmt } from '../../ui/fmt.mjs';

// ═════════ ۷۱. موقعیت باز و تغییرش، در همه سطح‌ها و بی‌ادعای دروغ ═════════
//
// گزارش کاربر: «قسمت موقعیت‌های باز هر نماد و تغییرات آن، در لحظه درست
// نمی‌باشد.» دو نقص واقعی پشت آن بود:
//
//   هیچ منبعی    `rollupQuotes` فقط `oi` را جمع می‌کرد و `oiYday` را نه، پس
//                «تغییر موقعیت باز» هر نماد اصلاً ساخته نمی‌شد.
//   جمع تجمیعی   `finishAggregate` هر دو را جمع می‌کرد ولی تفاضلشان را
//                نمی‌ساخت، پس همان ستون در هر نمای تجمیعی تهی بود.
//
// و یک تله سوم: اگر تابلو `yesterdayOP` را ندهد، `num` صفر می‌داد و تغییر
// دقیقاً برابر خودِ موقعیت باز می‌شد — یعنی «تمام تعهد این قرارداد امروز
// باز شده»، که ادعای ساختگی است (قاعده ۲-۴).
group('۷۱. موقعیت باز و تغییر آن');
{
  const row71 = (extra = {}) => ({
    uaInsCode: '11', lval30_UA: 'نمونه', pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1000,
    strikePrice: 1000, remainedDay: 30, endDate: 20260101, contractSize: 1000,
    insCode_C: '111', lVal18AFC_C: 'ضنمو-الف', pDrCotVal_C: 120, pClosing_C: 115,
    pMeDem_C: 118, pMeOf_C: 122, qTotTran5J_C: 20, zTotTran_C: 4, qTotCap_C: 2400,
    oP_C: 90, yesterdayOP_C: 80,
    insCode_P: '112', lVal18AFC_P: 'طنمو-الف', pDrCotVal_P: 80, pClosing_P: 82,
    pMeDem_P: 78, pMeOf_P: 82, qTotTran5J_P: 10, zTotTran_P: 2, qTotCap_P: 800,
    oP_P: 70, yesterdayOP_P: 75,
    ...extra,
  });

  // ——— سطح نماد ———
  const ua71 = underlyingList(buildChain([row71()]))[0];
  check('موقعیت باز دیروز هر نماد جمع می‌شود، نه فقط امروز',
    ua71.oi === 160 && ua71.oiYday === 155, `${ua71.oi} / ${ua71.oiYday}`);
  check('تغییر موقعیت باز هر نماد ساخته می‌شود',
    ua71.oiChange === 5 && near(ua71.oiChangePct, (160 / 155 - 1) * 100),
    `${ua71.oiChange} · ${uiFmt.pct(ua71.oiChangePct)}٪`);
  check('و کال و پوت تغییر خودشان را جدا دارند',
    ua71.callOiChange === 10 && ua71.putOiChange === -5);

  // ——— تابلو بی‌داده: نامعلوم، نه جهش ساختگی ———
  const gapRow = row71(); delete gapRow.yesterdayOP_C;
  const uaGap = underlyingList(buildChain([gapRow]))[0];
  check('بدون موقعیت باز دیروز، تغییرِ نماد نامعلوم می‌ماند نه برابر خودِ موقعیت باز',
    Number.isNaN(uaGap.oiChange) && Number.isNaN(uaGap.oiYday) && uaGap.oi === 160,
    `تغییر ${uiFmt.int(uaGap.oiChange)}`);
  // اگر این نبود، `oiChange` می‌شد ۱۶۰−۷۵=۸۵ و ردیف، جهش ۱۱۳٪ گزارش می‌کرد
  check('و همین تله در موتور ارزیابی هم بسته است', (() => {
    const q = (oiYday) => ({ bid: 100, bidQty: 50, ask: 110, askQty: 50, last: 105, close: 105,
      oi: 500, oiYday, vol: 10, trades: 2, value: 1e6, state: 'A', staleSec: 0,
      book: [{ level: 1, bid: 100, bidQty: 50, ask: 110, askQty: 50 }] });
    const def = byId('bull-call-spread');
    const run = (oiYday) => evaluate({
      legs: buildLegs(def, { strikes: [95000, 105000], size: 1000, days: [30] }),
      quotes: [q(400), q(oiYday)],
      ctx: { S: 100000, Sclose: 100000, days: 30, size: 1000, qty: 1, settings: defaults(), def, underlying: 'نمونه', sigmaHist: 0.6 },
    });
    return run(450).oiChange === 150 && Number.isNaN(run(NaN).oiChange);
  })());

  // ——— سطح تجمیعی داشبورد ———
  const snap71 = decisionDashboardSnapshot([row71()], defaults());
  const call71 = snap71.contracts.find((row) => row.ins === '111');
  check('هر قرارداد داشبورد تغییر موقعیت باز خودش را دارد', call71.oiChange === 10);
  check('تجمیع سررسید هم تغییر موقعیت باز می‌دهد، نه فقط جمع دو ستون',
    snap71.expiries[0].oi === 160 && snap71.expiries[0].oiYday === 155
    && snap71.expiries[0].oiChange === 5,
    `${snap71.expiries[0].oiChange}`);
  const snapGap = decisionDashboardSnapshot([gapRow], defaults());
  check('و تجمیعِ دارای خلأ، تغییرش نامعلوم است نه ناقص',
    Number.isNaN(snapGap.expiries[0].oiChange));

  // ——— جدول‌ها این ستون‌ها را نشان می‌دهند ———
  const chain71 = readSrc('../ui/tabs/chain.mjs'), dash71 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('جدول دیده‌بان ستون تغییر موقعیت باز دارد و در نمای آماده هم هست',
    /key: 'oiChange'/.test(chain71) && /'oi', 'oiChange', 'oiChangePct'/.test(chain71));
  check('هر مجموعه ستون داشبورد، تغییر موقعیت باز دارد',
    ['COLS_CONTRACT', 'COLS_UNDERLYING', 'COLS_EXPIRY', 'COLS_GROUP'].every((name) => {
      const block = new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(dash71)?.[1] || '';
      return /col\('oiChange'/.test(block);
    }));
}
