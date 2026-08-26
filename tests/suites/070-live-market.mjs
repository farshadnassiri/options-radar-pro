// ۶۹. داشبورد تجمعی بازار و رصد زنده موقعیت تاریخی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import path from 'node:path';
import { check, near, group, readSrc } from '../harness.mjs';
import { replayIntraday } from '../../core/backtest.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { annotateIntradayIv } from '../../core/leg-iv.mjs';
import {
  breadthInstruments, liveOptionTape, liveQuoteIv, marketBreadthSnapshot, marketBreadthTimeline,
} from '../../core/live-market.mjs';
import { pick } from '../../core/rng.mjs';
import { historyHandoffPlan } from '../../ui/handoff.mjs';


// ═══════════════════════════ ۶۹. داشبورد بازار و رصد زنده موقعیت ═══════════════════════════
group('۶۹. داشبورد تجمعی بازار و رصد زنده موقعیت تاریخی');
{
  const raw69 = [
    { uaInsCode: '11', lval30_UA: 'الف', pDrCotVal_UA: 110, pClosing_UA: 108, priceYesterday_UA: 100, qTotTran5J_UA: 10, qTotCap_UA: 1100, zTotTran_UA: 2 },
    { uaInsCode: '11', lval30_UA: 'الف', pDrCotVal_UA: 110, pClosing_UA: 108, priceYesterday_UA: 100, qTotTran5J_UA: 10, qTotCap_UA: 1100, zTotTran_UA: 2 },
    { uaInsCode: '22', lval30_UA: 'ب', pDrCotVal_UA: 90, pClosing_UA: 92, priceYesterday_UA: 100, qTotTran5J_UA: 5, qTotCap_UA: 450, zTotTran_UA: 1 },
    { uaInsCode: '33', lval30_UA: 'ج', pDrCotVal_UA: 100, pClosing_UA: 100, priceYesterday_UA: 100, qTotTran5J_UA: 0, qTotCap_UA: 0, zTotTran_UA: 0 },
  ];
  const instruments69 = breadthInstruments(raw69);
  check('نماد پایه تکراری دیده‌بان فقط یک بار وارد داشبورد می‌شود', instruments69.length === 3 && instruments69[0].ins === '11');
  const breadth69 = marketBreadthSnapshot(instruments69);
  check('مثبت و منفی فقط میان نمادهای واقعاً معامله‌شده شمرده می‌شوند',
    breadth69.positive === 1 && breadth69.negative === 1 && breadth69.untraded === 1 && breadth69.traded === 2);
  check('درصد وسعت بازار، نماد بی‌معامله را خنثی فرض نمی‌کند',
    near(breadth69.positivePct, 50) && near(breadth69.negativePct, 50) && breadth69.flat === 0);
  check('حجم و ارزش دو سوی بازار از خود نماد پایه می‌آیند',
    breadth69.positiveVolume === 10 && breadth69.negativeVolume === 5
    && breadth69.positiveValue === 1100 && breadth69.negativeValue === 450);

  const timeline69 = marketBreadthTimeline(instruments69, {
    11: [
      { sequence: 1, time: 90001, price: 101, quantity: 10, canceled: false },
      { sequence: 2, time: 90110, price: 99, quantity: 5, canceled: false },
    ],
    22: [{ sequence: 1, time: 90030, price: 90, quantity: 2, canceled: false }],
  });
  check('مسیر تجمعی یک عکس در پایان هر دقیقه واقعی می‌سازد', timeline69.length === 2 && timeline69[0].positive === 1 && timeline69[0].negative === 1);
  check('نماد تا اولین معامله در مسیر، بی‌معامله می‌ماند', timeline69[0].untraded === 1 && timeline69[0].traded === 2);
  check('تغییر جهت و گردش تجمعی بدون پرکردن دقیقه ساختگی ثبت می‌شود',
    timeline69[1].positive === 0 && timeline69[1].negative === 2
    && timeline69[1].cumulativeVolume === 17 && timeline69[1].cumulativeValue === 1685);

  const iv69 = liveQuoteIv({ kind: 'call', last: bsPrice('call', 10000, 10000, 30 / 365, 0.3, 0, 0.45), strike: 10000, days: 30 }, 10000,
    { rFree: 0.3, divYield: 0, dayCountYear: 365, ivLo: 0.01, ivHi: 5 });
  check('IV عکس قرارداد از همان حل‌گر مشترک بازسازی می‌شود', near(iv69, 45, 1e-3), iv69);

  const server69 = readSrc('../server/server.mjs');
  const ui69 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const backtest69 = readSrc('../ui/tabs/backtest.mjs');
  const history69 = readSrc('../ui/tabs/history.mjs');
  const portfolio69 = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('endpoint داشبورد همه پایه‌ها را برای تشخیص صادقانه بی‌معامله تجمیع می‌کند',
    server69.includes("p === '/api/live-dashboard'")
    && server69.includes('marketBreadthTimeline(instruments, tradesByIns')
    && server69.includes('Promise.all(instruments.map(async (item)'));
  check('داشبورد دایره‌ای، میله‌ای و سه مسیر تجمعی را در کاتالوگ تصمیم نگه می‌دارد',
    ui69.includes("'breadth-donut'") && ui69.includes("'breadth-bars'")
    && ui69.includes("'breadth-pct'") && ui69.includes("'breadth-net'") && ui69.includes("'base-volume-path'"));
  check('انتخاب قرارداد دقیقاً از پایه به سررسید و سپس قرارداد می‌رود',
    ui69.includes('id="dd-underlying"') && ui69.includes('id="dd-expiry"')
    && ui69.includes('id="dd-contract"') && ui69.includes('fillSelectors'));
  check('دامنه قرارداد فقط پایه و همان قرارداد را برای ریزمعامله می‌گیرد',
    ui69.includes('`${pick.uaIns},${contract.ins}`')
    && ui69.includes('liveOptionTape({ trades: optionRows') && ui69.includes('tape ='));
  check('هر سه تب، گزینه رصد زنده موقعیت تاریخی دارند',
    backtest69.includes('id="bt-live"') && backtest69.includes('async function refreshLivePosition()')
    && history69.includes('data-history-live') && portfolio69.includes('id="pb-live-watch"'));
  const livePlan69 = historyHandoffPlan({ ua: { ins: '77' }, replay: { priced: [], startDate: 20260101, endDate: 20260102 }, live: true });
  check('نقشه انتقال، درخواست زنده را صریح و بدون کپی نتیجه حمل می‌کند', livePlan69.live === true && livePlan69.autoRun === true && !('netPnl' in livePlan69));
  check('رصد زنده، همان موتور ریزمعامله مشترک و endpoint امروز را به کار می‌گیرد',
    backtest69.includes("fetch(`/api/live-trades?ins=${encodeURIComponent(codes.join(','))}`")
    // `replayDay` همان `replayIntraday` است به‌علاوهٔ مهر تلاطم؛ هر چهار
    // مسیر درون‌روز از همین یکی رد می‌شوند تا هیچ‌کدام بی‌تلاطم نماند.
    && backtest69.includes('intraday = replayDay({ byIns }, intradayDate);')
    && /function replayDay[\s\S]*replayIntraday\(\{[\s\S]*annotateIntradayIv\(/.test(backtest69));
}
