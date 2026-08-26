// ۲۷. فهرست بازار — تلاطم ضمنی، نسبت پوت به کال، نزدیک‌ترین سررسید
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { buildChain, underlyingList } from '../../core/chain.mjs';


// ═══════ ۲۷. فهرست بازار — تلاطم ضمنی، نسبت پوت به کال، نزدیک‌ترین سررسید (قلم الف-۴ بک‌لاگ) ═══════
group('۲۷. فهرست بازار — تلاطم ضمنی، نسبت پوت به کال، نزدیک‌ترین سررسید');
{
  const spot = 100000, sigma = 0.5, rFree = 0.30;
  const atmPrice = bsPrice('call', spot, spot, 20 / 365, rFree, 0, sigma);

  const mkRow3 = (strike, days, closePx, oi = 100) => ({
    uaInsCode: 'M', lval30_UA: 'ماکت', pDrCotVal_UA: spot, pClosing_UA: spot, priceYesterday_UA: spot,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: closePx * 0.98, qTitMeDem_C: 10, pMeOf_C: closePx * 1.02, qTitMeOf_C: 10,
    pDrCotVal_C: closePx, pClosing_C: closePx, oP_C: oi, qTotTran5J_C: 50,
    pMeDem_P: closePx * 0.98, qTitMeDem_P: 10, pMeOf_P: closePx * 1.02, qTitMeOf_P: 10,
    pDrCotVal_P: closePx, pClosing_P: closePx, oP_P: oi * 4, qTotTran5J_P: 50,
  });

  const rows3 = [
    mkRow3(100000, 20, atmPrice),      // نزدیک‌ترین پول، نزدیک‌ترین سررسید
    mkRow3(95000, 20, atmPrice * 1.3),
    mkRow3(100000, 60, atmPrice * 1.5), // سررسید دورتر
  ];
  const chain3 = buildChain(rows3);
  const list3 = underlyingList(chain3, { rFree, divYield: 0 });
  check('یک نماد در فهرست', list3.length === 1, `${list3.length}`);
  const u = list3[0];
  check('نزدیک‌ترین سررسید همان سررسید نزدیک‌تر است', u.nearestDays === 20, `${u.nearestDays}`);
  check('نسبت پوت به کال از موقعیت باز کل زنجیره حساب می‌شود',
    near(u.pcRatio, 4, 1e-9), `${u.pcRatio}`);
  check('تلاطم ضمنی نزدیک‌ترین پول، سیگمای واقعی مولد قیمت را بازمی‌گرداند',
    Number.isFinite(u.atmIv) && near(u.atmIv, sigma, 1e-3), `${u.atmIv}`);

  // پیش‌فرض بدون rFree/divYield هم باید کار کند — همان مسیری که ریسه اسکن می‌رود
  const listDef = underlyingList(chain3);
  check('بدون rFree/divYield هم تلاطم ضمنی عدد متناهی می‌دهد', Number.isFinite(listDef[0].atmIv));
}
