// ۹۵. یونانی و تلاطم موقعیت باز
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { bsGreeks, bsPrice, impliedVol } from '../../core/bs.mjs';
import { normalizeHistoryDate } from '../../core/history.mjs';
import { ivParams } from '../../core/leg-iv.mjs';
import { monitorSnapshot } from '../../core/monitor.mjs';


// ═══════════════════ ۹۵. یونانی و تلاطم در «موقعیت‌های من» ═══════════════════
group('۹۵. یونانی و تلاطم موقعیت باز');
{
  const src95 = readSrc('../ui/tabs/positions.mjs');
  check('موقعیت‌های من از همان لایهٔ مشترک می‌خواند',
    src95.includes("from '/core/monitor.mjs'") && src95.includes('monitorSnapshot(p.legs,')
    && !src95.includes('bsGreeks(') && !src95.includes('impliedVol('));
  check('یونانی و تلاطم موقعیت، ستون جدول فهرست هم هست',
    src95.includes('${GREEKS.map(({ key }) => `<td class="n">${gk(greeks.greeks?.[key])}</td>`).join(\'\')}')
    && src95.includes('<th>تلاطم ضمنی</th>'));
  check('پنل جزئیات، یونانی هر پا و سطر جمع وزن‌دار را جدا نشان می‌دهد',
    src95.includes('const greekTotals =') && src95.includes('greeks.byLeg[i]?.[key]'));
  check('تلاطم ضمنی از همان قیمت بستن می‌آید که سود از آن آمده',
    src95.includes('prices: m.perLeg.map((leg) => leg.markPrice),'));

  // موقعیت تازه سررسید ذخیره می‌کند؛ موقعیت قدیمی که ندارد، روز مانده را از
  // «روز ورود منهای روز نگهداری» می‌گیرد. حدس‌زدن سررسید از روی آن عدد،
  // تاریخ می‌ساخت.
  check('موقعیت تازه سررسید قرارداد را روی پا ذخیره می‌کند',
    src95.includes("expiry: Number(o.dataset.expiry) || 0,") && src95.includes('data-expiry="${normalizeHistoryDate(ex.endDate)}"'));
  check('موقعیت قدیمیِ بی‌سررسید، روز مانده را از تفریق می‌گیرد نه از تاریخ ساختگی',
    src95.includes('const daysLeftOf = (p, daysHeld)') && src95.includes('Math.max(0, atEntry - Number(daysHeld || 0))'));

  // خودِ قاعدهٔ روز مانده، مستقیم سنجیده می‌شود
  const legs95 = [{ kind: 'call', strike: 10000, side: 'buy', ratio: 1, size: 1000 }];
  const priced95 = bsPrice('call', 11000, 10000, 60 / 365, 0.3, 0, 0.5);
  const P95 = ivParams({ rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, dayCountYear: 365 });
  const given = monitorSnapshot(legs95, { spot: 11000, prices: [priced95], date: 0, days: [60] }, P95);
  check('روز مانده داده‌شده، جای سررسیدِ نبوده می‌نشیند',
    near(given.ivPct[0], 50, 1e-3), `${given.ivPct[0].toFixed(2)}٪`);
  const noDays = monitorSnapshot(legs95, { spot: 11000, prices: [priced95], date: 0 }, P95);
  check('بی‌سررسید و بی‌روزِ داده‌شده، تلاطمی ساخته نمی‌شود',
    Number.isNaN(noDays.ivPct[0]) && noDays.incomplete);
  // سررسیدِ روی پا همچنان مقدم است وقتی روزِ بیرونی داده نشده
  const byExpiry = monitorSnapshot([{ ...legs95[0], expiry: 20260401 }],
    { spot: 11000, prices: [priced95], date: 20260131 }, P95);
  check('وقتی سررسید هست، روز مانده از تاریخ درمی‌آید',
    Number.isFinite(byExpiry.ivPct[0]), `${byExpiry.ivPct[0]}`);
}
