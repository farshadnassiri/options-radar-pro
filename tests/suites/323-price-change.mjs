// ۳۲۳. تغییر قیمت — آخرین و پایانی، همه‌جا نسبت به پایانی روز قبل (۱۴۰۵/۰۷/۱۳)
//
// خواستهٔ صاحب پروژه: «در تب رصد لحظه‌ای بازار هر جا قیمت را نشان می‌دهی،
// آخرین قیمت و قیمت پایانی را هم بگذار همراه با درصد تغییرات… درصد تغییرات
// نسبت به قیمت پایانی روز قبل محاسبه می‌شود (در سراسر برنامه).»
//
//   الف  هستهٔ مشترک: pctVsYesterday، dayQuote، ydayFromSeries
//   ب    مصرف‌کننده‌های موتور: عکس داشبورد، بازپخش درون‌روز، استرانگل بازی
//   ج    سیم‌کشی رابط رصد لحظه‌ای

import { check, group, near, readSrc } from '../harness.mjs';
import { pctVsYesterday, dayQuote, ydayFromSeries, ydayMap } from '../../core/price-change.mjs';
import { decisionDashboardSnapshot } from '../../core/decision-dashboard.mjs';
import { replayIntraday } from '../../core/backtest.mjs';
import { buildLabMarket } from '../../core/strangle-lab.mjs';
import { defaults } from '../../core/settings.mjs';
import { pricePairText, pricePairHtml } from '../../ui/price-pair.mjs';

group('۳۲۳-الف. هستهٔ مشترک');
{
  check('درصد = قیمت ÷ پایانی دیروز − ۱', near(pctVsYesterday(105, 100), 5) && near(pctVsYesterday(95, 100), -5));
  check('هر کدام نامعلوم یا صفر: نامعلوم، نه صفر', [[0, 100], [100, 0], [NaN, 100], [100, undefined]].every(([a, b]) => Number.isNaN(pctVsYesterday(a, b))));
  const q = dayQuote({ last: 110, close: 104, yday: 100 });
  check('آخرین و پایانی هر کدام درصد خودشان را دارند، با یک مبنا', near(q.lastPct, 10) && near(q.closePct, 4) && q.lastChange === 10 && q.closeChange === 4);
  // ردیف جدول‌ها `last` را در نبود معامله با پایانی پر می‌کند؛ «آخرین» فقط معامله است.
  const idle = dayQuote({ last: 104, tradeLast: NaN, close: 104, yday: 100 });
  check('روز بی‌معامله: «آخرین» نامعلوم می‌ماند و پایانی جایش نمی‌نشیند', Number.isNaN(idle.last) && Number.isNaN(idle.lastPct) && near(idle.closePct, 4));
  check('بی yday، پایانی روز معاملاتی قبل مبناست', near(dayQuote({ close: 99 }, { prevClose: 90 }).closePct, 10));
  const series = [{ date: 20260101, close: 90 }, { date: 20260103, close: 95, yday: 0 }, { date: 20260104, close: 97, yday: 94 }];
  check('پایانی روز قبل از سری: yday همان روز، وگرنه پایانی روز معاملاتی قبل', ydayFromSeries(series, 20260104) === 94 && ydayFromSeries(series, 20260103) === 90);
  check('روز نیامده یا بی پیشینه: نامعلوم', Number.isNaN(ydayFromSeries(series, 20260105)) && Number.isNaN(ydayFromSeries(series, 20260101)));
  check('نقشهٔ چندنمادی فقط عددهای معلوم را دارد', JSON.stringify(ydayMap({ A: series, B: [] }, ['A', 'B'], 20260104)) === '{"A":94}');
  const text = pricePairText({ tradeLast: 110, close: 104, yday: 100 });
  check('متن کوتاه آخرین و پایانی را با درصد علامت‌دار هر کدام دارد', /^آخرین .+ \(\+.+٪\) · پایانی .+ \(\+.+٪\)$/.test(text) && !/[0-9]/.test(text), text);
  const html = pricePairHtml({ last: 90, close: 104, yday: 100 });
  check('رنگ هر درصد از جهت خودش', html.includes('class="loss"') && html.includes('class="gain"') && html.includes('نسبت به پایانی روز قبل'));
}

group('۳۲۳-ب. موتورها با همان مبنا');
{
  const row = {
    uaInsCode: '11', lval30_UA: 'اهرم', pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1000,
    strikePrice: 1000, remainedDay: 30, endDate: 20260101, contractSize: 1000,
    insCode_C: '111', lVal18AFC_C: 'ضهرم-الف', pDrCotVal_C: 0, pClosing_C: 115, priceYesterday_C: 100,
    qTotTran5J_C: 0, zTotTran_C: 0, qTotCap_C: 0,
    insCode_P: '112', lVal18AFC_P: 'طهرم-الف', pDrCotVal_P: 80, pClosing_P: 82, priceYesterday_P: 100,
    qTotTran5J_P: 10, zTotTran_P: 2, qTotCap_P: 800,
  };
  const snap = decisionDashboardSnapshot([row], defaults());
  const call = snap.contracts.find((c) => c.ins === '111'), put = snap.contracts.find((c) => c.ins === '112');
  check('قرارداد بی‌معامله: درصد آخرین نامعلوم، درصد پایانی معلوم', Number.isNaN(call.lastChangePct) && near(call.closeChangePct, 15));
  check('قرارداد معامله‌شده: دو درصد مستقل نسبت به پایانی دیروز', near(put.lastChangePct, -20) && near(put.closeChangePct, -18));
  check('قیمت پایه در ردیف قرارداد هم دو قیمت و دو درصد دارد', call.uaLast === 1050 && call.uaClose === 1040 && near(call.uaLastPct, 5) && near(call.uaClosePct, 4));
  const ua = snap.underlyings[0];
  check('ردیف پایه: درصد آخرین و پایانی', near(ua.lastChangePct, 5) && near(ua.closeChangePct, 4));

  // بازپخش درون‌روز آزمایشگاه: پیش از این «نسبت به اولین معاملهٔ همان پا».
  const replay = { ok: true, rows: [], entry: {}, priced: [{ ins: 'A', name: 'ض', side: 'sell', kind: 'call', price: 100, qty: 1, ratio: 1, size: 1000, strike: 1000 }] };
  const points = replayIntraday({ replay, tradesByIns: { A: [
    { price: 110, quantity: 1, time: 93000, sequence: 1 }, { price: 121, quantity: 1, time: 94000, sequence: 2 },
  ] }, ydayByIns: { A: 100 } });
  const legs = points.map((p) => p.legs?.[0] || p.perLeg?.[0]).filter(Boolean);
  check('بازپخش درون‌روز: درصد هر پا نسبت به پایانی روز قبل', legs.length === 2 && near(legs[0].pricePct, 10) && near(legs[1].pricePct, 21), JSON.stringify(legs.map((l) => l.pricePct)));
  check('… و فاصله از اولین معامله نام خودش را دارد', near(legs[1].priceFromFirstPct, 10));

  // استرانگل بازی: کارت روز پایانی روز قبل را از همان ردیف می‌خواند.
  const market = buildLabMarket({
    rows: [{ uaInsCode: 'U', strikePrice: 100, expiryGregorian: 20260301, insCode_C: 'C', insCode_P: 'P' }],
    dailies: { U: [{ date: 20260105, close: 100, yday: 98 }], C: [{ date: 20260105, close: 5, yday: 4, vol: 1, trades: 1 }], P: [] },
    uaIns: 'U', expiry: 20260301, from: 20260101, to: 20260110,
  });
  check('بازار استرانگل پایانی روز قبل هر ردیف را نگه می‌دارد', market.days[0].raw.call[100].yday === 4 && market.days[0].uaRaw.yday === 98);
}

group('۳۲۳-ج. سیم‌کشی رابط');
{
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const pair = dash.slice(dash.indexOf('const PRICE_PAIR_COLS = '), dash.indexOf('const PRICE_PAIR_COLS_UA'));
  check('جدول‌های داشبورد: آخرین و پایانی و درصد هر دو پیش‌فرض دیده می‌شوند',
    ['tradeLast', 'lastChangePct', 'close', 'closeChangePct'].every((k) => new RegExp(`col\\('${k}'[^)]*base: true`).test(pair)));
  // جدولِ نمادهای پایه، نوار ریزمعامله و کارت‌های میله‌ای با بازچینیِ ۱۴۰۵/۰۷/۱۷ رفتند.
  check('زنجیره از همان ستون‌های جفت‌قیمت می‌آید', (dash.match(/\.\.\.PRICE_PAIR_COLS\('/g) || []).length === 1);
  check('«تصویر شفاف»: آخرین معاملهٔ قرارداد با پایانی دیروز سنجیده می‌شود، نه «از اولین معامله»',
    !dash.includes('changeFromFirstPct')
    && readSrc('../ui/clear-picture-view.mjs').includes('pctVsYesterday(Number(c.tradeLast) > 0 ? c.tradeLast : c.last, c.yday)'));
  const map = readSrc('../ui/live-market-map.mjs');
  check('نقشه: راهنمای هاور، کاشی پایه و ردیف پایهٔ زنجیره دو قیمت دارند',
    map.includes('mapTooltipLines(data.row') && map.includes("stat('پایانی پایه'") && map.includes('<i>پایانی</i>'));
  check('ستون‌های پیش‌فرض زنجیرهٔ قرینه آخرین و پایانی هر دو را دارند', /PAIRED_DEFAULT = \[[^\]]*'tradeLast', 'lastChangePct', 'close', 'closeChangePct'/.test(map));
  const lab = readSrc('../ui/tabs/strangle-lab.mjs');
  check('کارت روز استرانگل: «آخرین» با پایانی روز قبل سنجیده می‌شود، نه آخرین دیروز',
    lab.includes('dayQuote(now || {}, { prevClose: prev?.close })') && !lab.includes("row('آخرین', now.last, prev?.last)"));
  const bt = readSrc('../ui/tabs/backtest.mjs');
  check('آزمایشگاه: نمودار قیمت هر پا نسبت به پایانی روز قبل', bt.includes('ydayByIns: ydayMap(') && !bt.includes('نسبت به اولین معامله همان پا'));
}
