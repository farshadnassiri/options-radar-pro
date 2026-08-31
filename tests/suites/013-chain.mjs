// ۱۲. زنجیره و ترکیب‌سازی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { buildChain, chainStats, underlyingList } from '../../core/chain.mjs';
import { coverage } from '../../core/margin.mjs';
import { scan as scanFn } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { byId } from '../../strategies/catalog.mjs';


group('۱۲. زنجیره و ترکیب‌سازی');
{
  // دو رکورد دیده‌بان مصنوعی، شکل واقعی پاسخ بازار
  const mkRow = (strike, days, cBid, pBid, ua = '1', uaName = 'نمونه') => ({
    uaInsCode: ua, lval30_UA: uaName, pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: 100, pMeOf_C: cBid * 1.05, qTitMeOf_C: 100,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: pBid, qTitMeDem_P: 100, pMeOf_P: pBid * 1.05, qTitMeOf_P: 100,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 800,
  });

  const rows = [];
  for (const k of [90000, 95000, 100000, 105000, 110000]) {
    rows.push(mkRow(k, 30, Math.max(200, 100000 - k + 4000), Math.max(200, k - 100000 + 4000)));
    rows.push(mkRow(k, 90, Math.max(300, 100000 - k + 7000), Math.max(300, k - 100000 + 7000)));
  }
  rows.push({
    ...mkRow(100000, 30, 0, 0, '2', 'بی‌مظنه'),
    pMeDem_C: 0, pMeOf_C: 0, pMeDem_P: 0, pMeOf_P: 0,
    pDrCotVal_C: 4200, pClosing_C: 4200, pDrCotVal_P: 4100, pClosing_P: 4100,
  });

  const chain = buildChain(rows);
  check('زنجیره دو نماد پایه ساخت', chain.size === 2, `${chain.size}`);
  const sanitizedChain = buildChain([{ ...mkRow(100000, 30, 1000, 900, '123456', '123456'), insCode_C: '987654', lVal18AFC_C: '987654' }]);
  check('نامی که فقط شناسه خام است با عنوان خوانا جایگزین می‌شود', sanitizedChain.get('123456')?.name === 'دارایی پایه بدون نام' && sanitizedChain.get('123456')?.expiryList[0]?.strikeList[0]?.call?.name === 'قرارداد اختیار خرید');
  const ua = chain.get('1');
  check('دو سررسید و پنج قیمت اعمال', ua.expiryList.length === 2 && ua.expiryList[0].strikeList.length === 5);
  check('سررسیدها صعودی مرتب شدند', ua.expiryList[0].days < ua.expiryList[1].days);
  const list = underlyingList(chain);
  check('فهرست انتخابی نماد، با شمارش قرارداد', list.length === 2 && list[0].contracts > 0,
    list.map((u) => `${u.name}:${u.contracts}`).join(' , '));
  const st = chainStats(chain);
  check('آمار زنجیره: قرارداد و دارای مظنه', st.contracts === 22 && st.quoted === 20,
    `قرارداد ${st.contracts} | مظنه ${st.quoted}`);

  const s2 = { ...defaults(), comboWindowPct: 25, wingsEqualWidth: true, greeksInScan: false };

  // کاوردکال: یک ترکیب به ازای هر قیمت اعمال هر سررسید
  const cc = scanFn({ def: byId('covered-call'), chain, uaKeys: ['1'], settings: s2 });
  check('کاوردکال ترکیب ساخت', cc.rows.length > 0, `${cc.rows.length} ردیف در ${cc.ms}ms`);
  check('نوار تشخیص پر شد', cc.funnel.built > 0 && cc.funnel.kept === cc.rows.length,
    `ساخته ${cc.funnel.built} | مانده ${cc.funnel.kept}`);

  // اسپرد عمودی: دو قیمت اعمال از یک سررسید، هر دو در پنجره
  const bcs = scanFn({ def: byId('bull-call-spread'), chain, uaKeys: ['1'], settings: s2 });
  check('اسپرد عمودی، هر ترکیب دو قیمت اعمال متفاوت دارد',
    bcs.rows.length > 0 && bcs.rows.every((r) => r.strikeSet.length === 2 && r.strikeSet[0] < r.strikeSet[1]),
    `${bcs.rows.length} ردیف`);

  // باترفلای با بال مساوی: ۹۰-۱۰۰-۱۱۰ می‌ماند، ۹۰-۹۵-۱۰۵ می‌افتد
  const bf = scanFn({ def: byId('long-call-butterfly'), chain, uaKeys: ['1'], settings: s2 });
  const widths = bf.rows.map((r) => [r.strikeSet[1] - r.strikeSet[0], r.strikeSet[2] - r.strikeSet[1]]);
  check('بال مساوی رعایت شد', widths.every(([a, b]) => Math.abs(a - b) < 1), `${bf.rows.length} ردیف`);
  const bfOff = scanFn({ def: byId('long-call-butterfly'), chain, uaKeys: ['1'], settings: { ...s2, wingsEqualWidth: false } });
  check('خاموش کردن بال مساوی، ترکیب را بیشتر می‌کند', bfOff.rows.length > bf.rows.length,
    `${bf.rows.length} → ${bfOff.rows.length}`);

  // تقویمی: باید دو سررسید متفاوت داشته باشد و پای دور، دورتر باشد
  const cal = scanFn({ def: byId('calendar-call'), chain, uaKeys: ['1'], settings: s2 });
  check('تقویمی دو سررسید متفاوت دارد',
    cal.rows.length > 0 && cal.rows.every((r) => r.expiryDays.length === 2 && r.expiryDays[0] < r.expiryDays[1]),
    `${cal.rows.length} ردیف`);
  check('تقویمی، پوشش کامل و بدون وجه تضمین', cal.rows.every((r) => r.margin === 0 && r.coverage === 'full'));

  // نماد بی‌مظنه هیچ ردیفی نمی‌دهد و در نوار تشخیص شمرده می‌شود
  const dead = scanFn({ def: byId('covered-call'), chain, uaKeys: ['2'], settings: s2 });
  check('نماد بی‌مظنه، صفر ردیف و شمارش در نوار تشخیص',
    dead.rows.length === 0 && dead.funnel.noQuote > 0, `بی‌مظنه ${dead.funnel.noQuote}`);
  const shown = scanFn({ def: byId('covered-call'), chain, uaKeys: ['2'], settings: { ...s2, showUnexecutable: true } });
  check('با روشن کردن نمایش غیرقابل اجرا، ردیف برمی‌گردد و برچسب می‌خورد',
    shown.rows.length > 0 && shown.rows.every((r) => !r.executable), `${shown.rows.length} ردیف`);

  // پنجره قیمت اعمال در حالت «درصد ثابت» — حالتی که تا پیش از پنجرهٔ
  // خودکار پیش‌فرض بود و برای بازتولید نتیجهٔ قدیمی نگه داشته شده.
  const pctMode = { ...s2, comboWindowMode: 'pct' };
  const wide = scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...pctMode, comboWindowPct: 30 } });
  const narrow = scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...pctMode, comboWindowPct: 6 } });
  check('پنجره باریک‌تر، ترکیب کمتر', narrow.funnel.built < wide.funnel.built,
    `${wide.funnel.built} → ${narrow.funnel.built}`);
  check('آنچه پنجره کنار می‌گذارد شمرده می‌شود، نه اینکه ساکت بیفتد',
    narrow.funnel.outOfWindow > wide.funnel.outOfWindow,
    `${wide.funnel.outOfWindow} → ${narrow.funnel.outOfWindow}`);
  // و پیش‌فرض تازه: درصد دیگر بی‌صدا نمی‌بُرد. همان تنظیم با حالت خودکار
  // باید دست‌کم به اندازهٔ پهن‌ترین درصد ترکیب بسازد.
  const auto = scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...s2, comboWindowPct: 6 } });
  check('حالت خودکار به عددِ درصد کاری ندارد و کمتر از پنجرهٔ پهن نمی‌سازد',
    auto.funnel.built >= wide.funnel.built, `خودکار ${auto.funnel.built} · درصدِ ۳۰ ${wide.funnel.built}`);
  check('سقف ترکیب هر سررسید اعمال می‌شود',
    scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...s2, maxCombosPerExpiry: 2 } }).funnel.built <= 6);

  // رتبه‌بندی
  const ranked = scanFn({ def: byId('covered-call'), chain, uaKeys: ['1'], settings: { ...s2, rankBy: 'retMonthPct' } });
  const rr = ranked.rows.map((r) => r.retMonthPct).filter(Number.isFinite);
  check('ردیف‌ها نزولی مرتب شدند', rr.every((v, i) => i === 0 || rr[i - 1] >= v));
}
