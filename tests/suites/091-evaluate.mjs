// ۹۰. ستون‌های بیشتر، متناسب با داده هر جدول
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { buildChain, underlyingList } from '../../core/chain.mjs';
import { activeOptionsBoard, decisionDashboardSnapshot } from '../../core/decision-dashboard.mjs';
import { COLUMNS, evaluate } from '../../core/evaluate.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


// ═══════════════════ ۹۰. کاتالوگ کامل و معنادار ستون‌های هر جدول ═══════════════════
group('۹۰. ستون‌های بیشتر، متناسب با داده هر جدول');
{
  const raw90 = {
    uaInsCode: '11', lval30_UA: 'نمونه', pDrCotVal_UA: 1050, pClosing_UA: 1040,
    priceYesterday_UA: 1000, qTotTran5J_UA: 900, zTotTran_UA: 9, qTotCap_UA: 945000,
    strikePrice: 1000, remainedDay: 30, endDate: 20260101, contractSize: 1000,
    insCode_C: '111', lVal18AFC_C: 'ضنمو-الف', pDrCotVal_C: 120, pClosing_C: 115,
    priceYesterday_C: 100, pMeDem_C: 118, qTitMeDem_C: 40, pMeOf_C: 122, qTitMeOf_C: 35,
    qTotTran5J_C: 20, zTotTran_C: 4, qTotCap_C: 2400, oP_C: 90, yesterdayOP_C: 80,
    insCode_P: '112', lVal18AFC_P: 'طنمو-الف', pDrCotVal_P: 80, pClosing_P: 82,
    priceYesterday_P: 100, pMeDem_P: 78, qTitMeDem_P: 30, pMeOf_P: 82, qTitMeOf_P: 25,
    qTotTran5J_P: 10, zTotTran_P: 2, qTotCap_P: 800, oP_P: 70, yesterdayOP_P: 75,
  };

  const ua90 = underlyingList(buildChain([raw90]))[0];
  check('ردیف نماد، قیمت‌ها و سهم‌های کال/پوت را واقعاً پر می‌کند',
    ua90.yday === 1000 && near(ua90.changePct, 5)
    && near(ua90.callVolumePct, 200 / 3) && near(ua90.putVolumePct, 100 / 3)
    && near(ua90.callValuePct, 75) && near(ua90.putValuePct, 25)
    && near(ua90.quotedPct, 100) && near(ua90.twoSidedPct, 100));

  const snapshot90 = decisionDashboardSnapshot([raw90], defaults());
  const call90 = snapshot90.contracts.find((row) => row.kind === 'call');
  const expiry90 = snapshot90.expiries[0];
  check('ردیف قرارداد، قیمت پایانی، میانه مظنه و درصدهای قیمت را پر می‌کند',
    call90.close === 115 && call90.mid === 120 && call90.bidQty === 40 && call90.askQty === 35
    && near(call90.premiumPctSpot, 120 / 1050 * 100)
    && call90.intrinsic === 50 && call90.timeValue === 70
    && near(call90.oiChangePct, 12.5));
  check('ردیف سررسید، درصد گردش، جهت، مظنه و تعهد را از همان قراردادها می‌سازد',
    near(expiry90.tradedPct, 100) && near(expiry90.callVolumePct, 200 / 3)
    && near(expiry90.callValuePct, 75) && near(expiry90.twoSidedPct, 100)
    && expiry90.oiYday === 155 && near(expiry90.oiChangePct, (160 / 155 - 1) * 100));

  const board90 = activeOptionsBoard(snapshot90.contracts, { metric: 'value', side: 'both', limit: 10 });
  check('خلاصه سربه‌سر، اعمال و پریمیوم وزنی و سهم هر سمت را خروجی می‌دهد',
    board90.expiries[0].callStrike === 1000 && board90.expiries[0].putStrike === 1000
    && board90.expiries[0].callPremium === 120 && board90.expiries[0].putPremium === 80
    && near(board90.expiries[0].callSharePct, 75) && near(board90.expiries[0].putSharePct, 25));

  const q90 = (bid, ask) => ({ bid, bidQty: 50, ask, askQty: 50,
    last: (bid + ask) / 2, close: (bid + ask) / 2, oi: 100, oiYday: 90,
    vol: 10, trades: 2, value: 1e6, state: 'A', staleSec: 0,
    book: [{ level: 1, bid, bidQty: 50, ask, askQty: 50 }] });
  const def90 = byId('bull-call-spread');
  const eval90 = evaluate({
    legs: buildLegs(def90, { strikes: [95000, 105000], size: 1000, days: [30] }),
    quotes: [q90(5900, 6000), q90(1900, 2000)],
    ctx: { S: 100500, Sclose: 100000, days: 30, size: 1000, qty: 1,
      settings: defaults(), def: def90, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('در جدول راهبرد، درصدهای پولی دقیقاً با سرمایه درگیر همان ردیف می‌خوانند',
    eval90.capital > 0
    && near(eval90.entryFeePctCapital, eval90.entryFee / eval90.capital * 100)
    && near(eval90.marketValuePctCapital, eval90.marketValue / eval90.capital * 100)
    && near(eval90.execCostPctCapital, eval90.execCost / eval90.capital * 100));

  const dash90 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const keysOf90 = (name) => {
    const block = new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(dash90)?.[1] || '';
    return [...block.matchAll(/col\('(\w+)'/g)].map((match) => match[1]);
  };
  const catalogs90 = ['COLS_CONTRACT', 'COLS_UNDERLYING', 'COLS_EXPIRY', 'COLS_GROUP',
    'COLS_TAPE', 'COLS_BOARD', 'COLS_BOARD_EXPIRY'].map(keysOf90);
  check('هر هفت خانواده جدول داشبورد، گزینه‌های قیمت/درصد متناسب خودش را دارد',
    keysOf90('COLS_CONTRACT').includes('timeValuePctSpot')
    && keysOf90('COLS_UNDERLYING').includes('callValuePct')
    && keysOf90('COLS_EXPIRY').includes('tradedPct')
    && keysOf90('COLS_GROUP').includes('positivePct')
    && keysOf90('COLS_TAPE').includes('premiumPctBase')
    && keysOf90('COLS_BOARD').includes('oiChangePct')
    && keysOf90('COLS_BOARD_EXPIRY').includes('callPremiumPct'));
  check('هیچ کاتالوگ ستون، کلید تکراری ندارد',
    catalogs90.every((keys) => keys.length === new Set(keys).size)
    && COLUMNS.length === new Set(COLUMNS.map((column) => column.key)).size);

  const chain90 = readSrc('../ui/tabs/chain.mjs');
  check('دیده‌بان زنجیره نیز قیمت، گردش پایه و سهم‌های درصدی تازه را در منو دارد',
    ['yday', 'changePct', 'uaVolume', 'callVolumePct', 'putValuePct', 'callOiPct', 'twoSidedPct']
      .every((key) => chain90.includes(`key: '${key}'`)));
  const table90 = readSrc('../ui/table.mjs'), css90 = readSrc('../ui/style.css');
  check('منوی بلند ستون‌ها جست‌وجو دارد و جست‌وجو انتخاب کاربر را تغییر نمی‌دهد',
    table90.includes('class="col-search"') && table90.includes("querySelectorAll('.col-opt')")
    && !/col-search[\s\S]{0,500}setKeys\(/.test(table90) && css90.includes('.col-search')
    && css90.includes('.col-opt[hidden], .col-group[hidden] { display: none; }'));
}
