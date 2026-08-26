// ۴۳. اندازه قرارداد از مشخصات قرارداد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { buildChain, comboContractSize, legContractSize } from '../../core/chain.mjs';
import {
  flattenActiveContracts, generateHistoricalCombos as histCombos,
} from '../../core/history.mjs';
import { coverage } from '../../core/margin.mjs';
import { scan as scanFn } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


// ═══════════ ۴۳. اندازه قرارداد از مشخصات خودِ قرارداد ═══════════
//
// افزایش سرمایه، اندازه قرارداد و قیمت اعمال یک سری را تعدیل می‌کند. پس دو
// سررسید یک پایه می‌توانند دو اندازه متفاوت داشته باشند. اندازه در هر عدد
// پولی ضرب می‌شود، پس یک اندازه فرضی اشتباه کل ردیف را به همان نسبت غلط
// می‌کند — و عددی که ده درصد غلط است دقیقاً شبیه عددی است که درست است.
//
// دو باگ واقعی که این گروه قفلشان می‌کند:
//   ۱ در مسیر تاریخی، پای سهم پایه اندازه‌اش را از `contracts[0]` می‌گرفت.
//     آن فهرست به سررسید مرتب است، پس همیشه از نزدیک‌ترین سررسید می‌آمد —
//     حتی وقتی خودِ ترکیب روی سررسید دور بسته می‌شد.
//   ۲ نبود اندازه در تابلو با عدد ثابت ۱۰۰۰ پر می‌شد، بی‌هیچ نشانه‌ای
//
// در مسیر زنده (`core/scan.mjs`) منبع اندازه هم غلط بود — `strikeList[0]` —
// ولی امروز قابل مشاهده نبود: استراتژی‌های دارای پای سهم همه تک‌سررسیدی‌اند
// و در یک سررسید همه قیمت‌های اعمال یک اندازه دارند. آنجا هم به منبع درست
// وصل شد تا با افزودن اولین استراتژی چندسررسیدیِ دارای سهم، بی‌صدا نشکند.
group('۴۳. اندازه قرارداد از مشخصات قرارداد');
{
  // ——— سیاست جایگزینی ———
  check('اندازه مشخصات بر پیش‌فرض مقدم است',
    legContractSize(1100, 1000).size === 1100 && legContractSize(1100, 1000).assumed === false);
  check('نبود اندازه در تابلو، نشان‌دار می‌شود',
    legContractSize(0, 1000).size === 1000 && legContractSize(0, 1000).assumed === true);
  check('ترکیب هم‌اندازه، ناهمگون نیست',
    comboContractSize([1000, 1000], 1000).mixed === false);
  check('ترکیب با دو اندازه، ناهمگون علامت می‌خورد',
    comboContractSize([1000, 1100], 1000).mixed === true);

  // ——— زنجیره، اندازه را از همان ردیف تابلو می‌خواند ———
  const mkRow = (strike, days, size) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: size, remainedDay: days,
    endDate: days === 30 ? 20260901 : 20261101,
    pMeDem_C: 5000, qTitMeDem_C: 500, pMeOf_C: 5200, qTitMeOf_C: 500,
    pDrCotVal_C: 5100, pClosing_C: 5100, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: 4000, qTitMeDem_P: 500, pMeOf_P: 4200, qTitMeOf_P: 500,
    pDrCotVal_P: 4100, pClosing_P: 4100, oP_P: 400, qTotTran5J_P: 800,
  });

  // سررسید نزدیک تعدیل‌شده (۱۱۰۰ سهم)، سررسید دور تعدیل‌نشده (۱۰۰۰ سهم)
  const adjusted = [
    mkRow(95000, 30, 1100), mkRow(100000, 30, 1100), mkRow(105000, 30, 1100),
    mkRow(95000, 90, 1000), mkRow(100000, 90, 1000), mkRow(105000, 90, 1000),
  ];
  const s0 = defaults();
  const ch = buildChain(adjusted, s0);
  const ua = ch.get('1');
  const near = ua.expiryList[0];
  const far = ua.expiryList[1];
  check('اندازه هر سررسید از ردیف خودش می‌آید',
    near.strikeList[0].size === 1100 && far.strikeList[0].size === 1000,
    `نزدیک ${near.strikeList[0].size} | دور ${far.strikeList[0].size}`);
  check('اندازه‌ای که از مشخصات آمده، پرچم دارد', near.strikeList[0].sizeFromSpec === true);

  // تابلو بدون اندازه: زنجیره عدد اختراع نمی‌کند (قاعده ۲-۴)
  const noSize = buildChain([mkRow(100000, 30, 0)], s0).get('1');
  check('زنجیره بدون اندازه، عدد نمی‌سازد',
    noSize.expiryList[0].strikeList[0].size === 0
    && noSize.expiryList[0].strikeList[0].sizeFromSpec === false);

  // ——— باگ ۱: پای سهم پایه ———
  // کاوردکال روی سررسید نزدیکِ تعدیل‌شده باید ۱۱۰۰ سهم بخواهد، نه ۱۰۰۰.
  const run = (over = {}) => {
    const st = { ...defaults(), ...over };
    return scanFn({ def: byId('covered-call'), chain: buildChain(adjusted, st), uaKeys: ['1'], settings: st, qty: 1 });
  };
  const cc = run();
  const ccRow = cc.rows.find((r) => r.days === 30);
  check('کاوردکال ردیف ساخت', !!ccRow, `${cc.rows.length} ردیف`);
  if (ccRow) {
    const stockLeg = ccRow.__legs.find((l) => l.kind === 'underlying');
    const callLeg = ccRow.__legs.find((l) => l.kind === 'call');
    check('پای سهم پایه، اندازه همان کالی را می‌گیرد که پوشش می‌دهد',
      stockLeg.size === callLeg.size && stockLeg.size === 1100,
      `سهم ${stockLeg.size} | کال ${callLeg.size}`);
    check('پوشش کاوردکال با اندازه تعدیل‌شده هم کامل است',
      ccRow.coverage === 'full' && ccRow.margin === 0, ccRow.coverage);
    check('اندازه واقعی، ردیف را فرضی علامت نمی‌زند',
      ccRow.sizeAssumed === false && !ccRow.warn.includes('اندازه قرارداد فرضی'));
  }

  // اگر پای سهم اندازه سررسید دور را می‌گرفت (باگ قدیمی)، پوشش ناقص می‌شد
  // و وجه تضمین ناگهان از صفر درمی‌آمد — همان چیزی که بالا رد شد.

  // ——— باگ ۲: نبود اندازه، نشان‌دار می‌شود ———
  const blank = [mkRow(95000, 30, 0), mkRow(100000, 30, 0), mkRow(105000, 30, 0)];
  const st2 = { ...defaults(), contractSize: 1000 };
  const noSpec = scanFn({
    def: byId('bull-call-spread'), chain: buildChain(blank, st2),
    uaKeys: ['1'], settings: st2, qty: 1,
  });
  const nsRow = noSpec.rows[0];
  check('بدون اندازه تابلو، پیش‌فرض تنظیمات می‌نشیند', !!nsRow && nsRow.__legs[0].size === 1000);
  check('و ردیف برچسب «اندازه قرارداد فرضی» می‌گیرد',
    !!nsRow && nsRow.sizeAssumed === true && nsRow.warn.includes('اندازه قرارداد فرضی'),
    nsRow ? nsRow.warn.join('، ') : '');

  // پیش‌فرض تنظیمات واقعاً خوانده می‌شود، نه عدد ثابت ۱۰۰۰
  const st3 = { ...defaults(), contractSize: 500 };
  const nsRow3 = scanFn({
    def: byId('bull-call-spread'), chain: buildChain(blank, st3),
    uaKeys: ['1'], settings: st3, qty: 1,
  }).rows[0];
  check('پیش‌فرض جایگزین از تنظیمات می‌آید، نه از عدد ثابت',
    !!nsRow3 && nsRow3.__legs[0].size === 500, `${nsRow3?.__legs[0].size}`);

  // ——— ترکیب ناهمگون ———
  const cal = scanFn({
    def: byId('calendar-call'), chain: buildChain(adjusted, s0),
    uaKeys: ['1'], settings: s0, qty: 1,
  }).rows[0];
  check('تقویمی روی دو سری با دو اندازه، ناهمگون علامت می‌خورد',
    !!cal && cal.sizeMixed === true && cal.warn.includes('اندازه قرارداد ناهمگون'),
    cal ? cal.contractSizes.join(' و ') : 'ردیفی نساخت');

  // ——— مسیر تاریخی: همان‌جایی که باگ واقعاً می‌زد ———
  //
  // `contracts[0]` قرارداد اولِ کل فهرست بود و فهرست به سررسید مرتب است،
  // یعنی همیشه از نزدیک‌ترین سررسید. پس کاوردکالی که روی سررسید دور بسته
  // می‌شد، تعداد سهمش را از سری نزدیک می‌گرفت — و اگر آن سری پس از افزایش
  // سرمایه تعدیل شده بود، پوشش با تعداد سهم غلط ساخته می‌شد.
  const contracts = flattenActiveContracts(ua);
  const nearContract = contracts.find((c) => c.daysNow === 30);
  const farContract = contracts.find((c) => c.daysNow === 90);
  check('فهرست قرارداد تاریخی، اندازه هر قرارداد را جدا نگه می‌دارد',
    nearContract.size === 1100 && farContract.size === 1000,
    `${nearContract.size} و ${farContract.size}`);
  check('فهرست تاریخی به سررسید مرتب است، پس قرارداد اول از سری نزدیک است',
    contracts[0].size === 1100);

  const day = (date, close) => ({ date, close, last: close, low: close, high: close, vol: 1000, trades: 5, value: 1e6 });
  const hSeries = {};
  for (const c of contracts) hSeries[c.ins] = [day(20260801, 5000), day(20260802, 5100)];
  hSeries['1'] = [day(20260801, 100000), day(20260802, 100500)];
  const uaHist = { ...ua, ins: '1', name: 'نمونه' };

  const histGen = histCombos({
    def: byId('covered-call'), ua: uaHist, seriesByIns: hSeries,
    startDate: 20260801, entryBasis: 'CLOSE', settings: defaults(), filtered: false,
  });
  // ترکیب‌هایی که پای اختیارشان از سررسید دور است
  const farCombos = histGen.combos.filter((c) =>
    c.legs.some((l) => l.kind === 'call' && l.expiry === farContract.expiry));
  check('کاوردکال تاریخی روی سررسید دور ساخته شد', farCombos.length > 0, `${farCombos.length} ترکیب`);
  const mismatched = farCombos.filter((c) => {
    const stock = c.legs.find((l) => l.kind === 'underlying');
    const call = c.legs.find((l) => l.kind === 'call');
    return stock.size !== call.size;
  });
  check('پای سهم پایه تاریخی، اندازه کال همان ترکیب را می‌گیرد نه سری نزدیک را',
    mismatched.length === 0,
    mismatched.length ? `${mismatched[0].legs.find((l) => l.kind === 'underlying').size} ≠ ${mismatched[0].legs.find((l) => l.kind === 'call').size}` : '');

  // ——— buildLegs اندازه هر پا را جدا می‌پذیرد ———
  const legsMixed = buildLegs(byId('bull-call-spread'), {
    strikes: [95000, 105000], size: 1000, days: [30],
    sizes: { 'call1@0': 1100, 'call2@0': 1100 },
  });
  check('buildLegs اندازه هر پا را از کلید خودش می‌گیرد',
    legsMixed.every((l) => l.size === 1100), legsMixed.map((l) => l.size).join('، '));

  // ——— هیچ اندازه ثابتی در مسیر داده نماند ———
  const sizeFiles = ['core/chain.mjs', 'core/scan.mjs', 'core/history.mjs'];
  const hardcoded = sizeFiles.filter((f) =>
    /size[^\n]*\|\|\s*1000/.test(readSrc(`../${f}`)));
  check('هیچ «اندازه یا ۱۰۰۰» سخت‌کدی در مسیر داده نمانده', hardcoded.length === 0, hardcoded.join('، '));
}
