// ۶۸. رصد لحظه‌ای بازار و IV هر معامله
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import {
  activeLiveTrades, liveOptionTape, liveReferenceTape, summarizeLiveTrades,
} from '../../core/live-market.mjs';
import { parseInsList } from '../../server/guard.mjs';


// ═══════════════════════════ ۶۸. رصد لحظه‌ای بازار ═══════════════════════════
group('۶۸. رصد لحظه‌ای بازار و IV هر معامله');
{
  const raw68 = [
    { sequence: 3, time: 90003, price: 102, quantity: 7, canceled: false, canceledKnown: true },
    { sequence: 1, time: 90001, price: 100, quantity: 10, canceled: false, canceledKnown: true },
    { sequence: 2, time: 90002, price: 101, quantity: 5, canceled: true, canceledKnown: true },
    { sequence: 4, time: 0, price: 103, quantity: 2, canceled: false, canceledKnown: true },
  ];
  const active68 = activeLiveTrades(raw68);
  check('معامله باطل و رکورد ناقص از نوار زنده حذف می‌شوند',
    active68.length === 2 && active68.map((row) => row.sequence).join(',') === '1,3');
  const summary68 = summarizeLiveTrades(raw68);
  check('خلاصه روز فقط از معاملات معتبر ساخته می‌شود',
    summary68.count === 2 && summary68.volume === 17 && summary68.value === 1714
    && summary68.firstPrice === 100 && summary68.lastPrice === 102);
  check('VWAP و تغییر از اولین معامله دقیق‌اند',
    near(summary68.vwap, 1714 / 17, 1e-10) && near(summary68.changePct, 2, 1e-10), `${summary68.vwap} | ${summary68.changePct}`);

  const settings68 = { rFree: 0.30, divYield: 0, dayCountYear: 365, ivLo: 0.01, ivHi: 5 };
  const T68 = 30 / 365;
  const option68 = [
    { sequence: 1, time: 85959, price: 500, quantity: 1, canceled: false, canceledKnown: true },
    { sequence: 2, time: 90100, price: bsPrice('call', 10000, 10000, T68, 0.30, 0, 0.5), quantity: 2, canceled: false, canceledKnown: true },
    { sequence: 3, time: 90600, price: bsPrice('call', 11000, 10000, T68, 0.30, 0, 0.5), quantity: 3, canceled: false, canceledKnown: true },
  ];
  const base68 = [
    { sequence: 1, time: 90000, price: 10000, quantity: 50, canceled: false, canceledKnown: true },
    { sequence: 2, time: 90500, price: 11000, quantity: 70, canceled: false, canceledKnown: true },
  ];
  const tape68 = liveOptionTape({
    trades: option68, baseTrades: base68,
    contract: { ins: '22', name: 'ضنماد', kind: 'call', strike: 10000, days: 30, endDate: 20260922 },
    settings: settings68,
  });
  check('پیش از اولین معامله پایه، IV ساخته نمی‌شود', !Number.isFinite(tape68[0].iv));
  check('هر معامله اختیار فقط با آخرین معامله قبلی پایه هم‌زمان می‌شود',
    tape68[1].basePrice === 10000 && tape68[2].basePrice === 11000);
  check('IV هر دو معامله معتبر، تلاطم بازار را بازمی‌سازد',
    near(tape68[1].iv, 0.5, 1e-5) && near(tape68[2].iv, 0.5, 1e-5), `${tape68[1].iv} | ${tape68[2].iv}`);
  check('حجم و ارزش تجمعی در هر ردیف تازه جلو می‌روند',
    tape68[2].cumulativeVolume === 6
    && near(tape68[2].cumulativeValue, option68.reduce((sum, row) => sum + row.price * row.quantity, 0), 1e-8));
  const reference68 = liveReferenceTape(base68, { ins: '11', name: 'نماد' });
  check('مسیر پایه، تغییر قیمت و حجم تجمعی را برای نمودار می‌سازد',
    reference68.length === 2 && near(reference68[1].changePct, 10, 1e-10) && reference68[1].cumulativeVolume === 120);

  const server68 = readSrc('../server/server.mjs');
  const app68 = readSrc('../ui/app.mjs');
  const ui68 = readSrc('../ui/tabs/live-market.mjs');
  check('endpoint زنده با cache-buster و سقف ۲۴ ابزار از GetTrade می‌خواند',
    server68.includes("p === '/api/live-trades'")
    && server68.includes('`/Trade/GetTrade/${code}`')
    && server68.includes("parseInsList(u.searchParams.get('ins'), 24)")
    && server68.includes("_=${Date.now()}`"));
  check('رصد لحظه‌ای یک تب پایه تنبل است',
    app68.includes("id: 'live-market'") && app68.includes("mod: '/ui/tabs/live-market.mjs'"));
  check('رابط، پایه و قرارداد معامله‌شده را انتخاب و خودکار تازه می‌کند',
    ui68.includes('id="lm-base"') && ui68.includes('live-market-contracts')
    && ui68.includes("setInterval(refresh, intervalMs)") && ui68.includes('MAX_OPTIONS = 23'));
  check('هر دو جدول خلاصه و نوار، ستون تلاطم ضمنی دارند',
    ui68.includes("label: 'آخرین تلاطم ضمنی ٪'") && ui68.includes("label: 'تلاطم ضمنی ٪'"));
}
