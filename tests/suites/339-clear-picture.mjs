// ۳۳۹. «تصویر شفاف» — از کل به جزء (۱۴۰۵/۰۷/۱۷)
//
// خواستهٔ صاحب پروژه: «برترین موقعیت‌ها» حذف؛ از «تلاطم و انتظارات» فقط
// «نگاه باز چندروزه» بماند و نام تب «نگاه باز» شود؛ پنج زیرتب در یک تب به
// نام «تصویر شفاف»: ارزش کل، سهم کال و پوت (جدا و هر دو، کلی و هر نماد)،
// درصد قراردادهای مثبت و منفی و نمودارش در طول روز، «ترین»ها — برای کل
// بازار، هر نماد پایه، سررسید یا قرارداد.

import { check, group, near, readSrc } from '../harness.mjs';
import {
  directionOf, pictureTotals, pictureParts, leaders, concentration, moneynessSplit, tenorSplit,
  clearPicture, contractStanding, sampleKey, pictureSample, pictureSeries, otmPct,
} from '../../core/clear-picture.mjs';

const row = (o) => ({
  ins: o.ins, name: o.ins, kind: o.kind || 'call', uaIns: o.ua || 'A', uaName: o.ua || 'A', endDate: o.end || 20261101, days: o.days ?? 20,
  strike: o.strike ?? 1000, spot: o.spot ?? 1000, tradeLast: o.last ?? NaN, last: o.last ?? o.close ?? NaN, close: o.close ?? NaN,
  yday: o.yday ?? 100, value: o.value ?? 0, volume: o.volume ?? (o.value ? 1 : 0), trades: o.trades ?? (o.value ? 1 : 0),
  oi: o.oi ?? 10, oiChange: o.oiChange ?? NaN,
});

const book = [
  row({ ins: 'c1', kind: 'call', last: 120, value: 600, volume: 6, trades: 3, oiChange: 4, strike: 900 }),
  row({ ins: 'c2', kind: 'call', last: 90, value: 200, volume: 2, trades: 2, oiChange: -2, strike: 1100 }),
  row({ ins: 'p1', kind: 'put', last: 100, value: 200, volume: 4, trades: 1, strike: 1000 }),
  row({ ins: 'p2', kind: 'put', close: 80, value: 0, volume: 0, trades: 0, strike: 1200 }),
  row({ ins: 'b1', kind: 'call', ua: 'B', last: 130, value: 1000, volume: 10, trades: 5, end: 20261201, days: 50, strike: 1000 }),
];

group('۳۳۹. جمع‌های دامنه');
{
  const t = pictureTotals(book);
  check('ارزش کل = کال + پوت، و سهم هر سمت', t.value === 2000 && t.callValue === 1800 && t.putValue === 200
    && near(t.callValuePct, 90) && near(t.putValuePct, 10));
  check('نسبت ارزش پوت به کال', near(t.putCallValue, 200 / 1800));
  check('جهت فقط از معامله‌شده‌ها؛ بی‌معامله جدا', t.positive === 2 && t.negative === 1 && t.flat === 1 && t.untraded === 1
    && near(t.positivePct, 50) && near(t.negativePct, 25));
  check('قرارداد بی‌معامله «بدون تغییر» شمرده نمی‌شود', directionOf(book[3]) === 'untraded');
  check('میانگین ارزش هر معامله', near(t.avgTradeValue, 2000 / 11));
  const gap = pictureTotals([{ ...book[0], value: NaN }, book[1]]);
  check('ارزشِ نرسیده صفر ساختگی نمی‌شود: جمع بی‌آن و شمارش جدا', gap.value === 200 && gap.missingValue === 1);
  check('تغییر موقعیت باز بی هیچ عدد معلوم، نامعلوم است نه صفر', Number.isNaN(pictureTotals([book[2]]).oiChange));
}

group('۳۳۹. از کل به جزء');
{
  const ua = pictureParts(book, 'underlying');
  check('کل بازار → نمادها، با سهم از کل؛ برابری در ارزش با حجم شکسته می‌شود', ua.length === 2 && ua[0].key === 'A' && near(ua[0].sharePct, 50) && near(ua[1].sharePct, 50));
  check('هر نماد سهم کال و پوتِ خودش را دارد', near(ua.find((p) => p.key === 'A').callValuePct, 80) && near(ua.find((p) => p.key === 'A').putValuePct, 20));
  const ex = pictureParts(book, 'expiry');
  check('نماد → سررسید با کلید «پایه:سررسید»', ex.some((p) => p.key === 'A:20261101') && ex.some((p) => p.key === 'B:20261201'));
  const st = pictureParts(book.filter((r) => r.uaIns === 'A'), 'strike');
  check('سررسید → قیمت اعمال؛ کال و پوت یک اعمال کنار هم', st.length === 4 && st.every((p) => p.level === 'strike'));
  const pic = clearPicture(book, { level: 'market' });
  check('سطح جزء از سطح دامنه می‌آید', pic.partLevel === 'underlying'
    && clearPicture(book, { level: 'underlying' }).partLevel === 'expiry'
    && clearPicture(book, { level: 'expiry' }).partLevel === 'strike' && clearPicture(book, { level: 'contract' }).partLevel === 'strike');
}

group('۳۳۹. «ترین»ها و تمرکز');
{
  const l = leaders(book);
  check('پرارزش‌ترین و پرحجم‌ترین', l.value[0].ins === 'b1' && l.volume[0].ins === 'b1' && l.trades[0].ins === 'b1');
  check('رشد و افت فقط از معامله‌شده‌ها و درست‌علامت', l.gainers.map((r) => r.ins).join() === 'b1,c1' && l.losers.map((r) => r.ins).join() === 'c2'
    && !l.gainers.some((r) => r.ins === 'p2'));
  check('افزایش و کاهش موقعیت باز جدا؛ نامعلوم بیرون', l.oiUp.map((r) => r.ins).join() === 'c1' && l.oiDown.map((r) => r.ins).join() === 'c2');
  const c = concentration(book);
  check('سهم اولی و پنج اول، و ۸۰٪ ارزش در چند قرارداد', near(c.top1Pct, 50) && near(c.top5Pct, 100) && c.n80 === 2 && c.tradedCount === 4);
  check('بی ارزش، تمرکز نامعلوم', Number.isNaN(concentration([book[3]]).top5Pct));
}

group('۳۳۹. فاصله از پول و روز مانده');
{
  check('فاصله از دید همان سمت: کال بالای قیمت و پوت پایین آن بیرون از پول‌اند',
    near(otmPct(book[1]), 10) && near(otmPct({ kind: 'put', strike: 900, spot: 1000 }), 10) && near(otmPct(book[0]), -10));
  const m = moneynessSplit(book);
  const by = Object.fromEntries(m.buckets.map((b) => [b.key, b]));
  check('درون/نزدیک/بیرون از پول با ارزش هر کدام', by.itm.value === 600 && by.atm.value === 1200 && by.otm.value === 200 && m.unknown === 0);
  const t = tenorSplit(book);
  check('ارزش روی روزِ مانده', t.buckets.find((b) => b.key === 'd30').value === 1000 && t.buckets.find((b) => b.key === 'd60').value === 1000);
}

group('۳۳۹. جایگاه قرارداد');
{
  const siblings = book.filter((r) => r.uaIns === 'A');
  const s = contractStanding(book[1], { siblings, family: siblings });
  check('سهم از سررسید و رتبهٔ ارزش', near(s.expirySharePct, 20) && s.rank === 2 && s.rankOf === 3);
  check('قراردادِ بی‌معامله رتبه ندارد', Number.isNaN(contractStanding(book[3], { siblings }).rank));
}

group('۳۳۹. مسیر روز: نمونهٔ دقیقه‌ای');
{
  check('کلید دامنه', sampleKey({ level: 'market' }) === 'm' && sampleKey({ level: 'underlying', uaIns: 'A' }) === 'u:A'
    && sampleKey({ level: 'expiry', uaIns: 'A', endDate: 1 }) === 'e:A:1' && sampleKey({ level: 'contract', uaIns: 'A', endDate: 1 }) === 'e:A:1');
  const s1 = pictureSample(book, 32400), s2 = pictureSample(book.map((r) => (r.ins === 'c2' ? { ...r, last: 130, tradeLast: 130, value: 400 } : r)), 32460);
  check('هر نمونه کل بازار، هر نماد و هر سررسید را دارد', ['m', 'u:A', 'u:B', 'e:A:20261101', 'e:B:20261201'].every((k) => Array.isArray(s1.s[k])));
  const series = pictureSeries([s2, s1], 'm');
  check('سری به ترتیب زمان، با درصد مثبت/منفی و ارزش کال/پوت',
    series.length === 2 && series[0].second === 32400 && near(series[0].positivePct, 50) && near(series[1].positivePct, 75)
    && series[1].callValue === 2000 && series[1].putValue === 200);
  check('کلیدِ نبوده نقطه نمی‌سازد', pictureSeries([s1], 'u:Z').length === 0);
}

group('۳۳۹. سیم‌کشی');
{
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('«برترین موقعیت‌ها»، «مقایسه»، «نبض»، «نقدینگی»، «تابلو» و «دیده‌بان» زیرتب نیستند',
    ["id: 'top'", "id: 'compare'", "id: 'pulse'", "id: 'liquidity'", "id: 'board'", "id: 'chain'", "id: 'volatility'"].every((x) => !dash.includes(x)));
  check('«تلاطم و انتظارات» شد «نگاه باز» با تنها نمای «نگاه باز چندروزه»',
    dash.includes("{ id: 'open-view', title: 'نگاه باز'") && !dash.includes("title: 'تلاطم و انتظارات'")
    && /const openViewViews = \[\s*\['open-view-history', 'نگاه باز چندروزه'/.test(dash));
  check('«رتبه و صدک تلاطم» سر جایش است', dash.includes("{ id: 'vol-rank', title: 'رتبه و صدک تلاطم'"));
  check('«تصویر شفاف» کنار نقشه، تنبل سوار، با دامنهٔ همان نوار سطح',
    /\{ id: 'explorer'[^\n]*\n\s*\{ id: 'clear', title: 'تصویر شفاف'/.test(dash)
    && dash.includes("rowsAt: (level) => dashboardScope(payload.universe, { ...selected(), level }).contracts")
    && dash.includes("$('dd-toolbar').hidden = !mode?.clear;"));
  const map = readSrc('../ui/live-market-map.mjs');
  check('هر جزء با کلیک یک پله پایین می‌رود — انتخاب همچنان از نقشه', map.includes('pickUnderlying(next) {') && map.includes('pickExpiry(nextUa, nextEnd) {'));
  const server = readSrc('../server/server.mjs');
  check('سرور هر دقیقه از همان عکس دیده‌بان نمونه برمی‌دارد و فقط کلیدِ خواسته را می‌دهد',
    server.includes("recordPicture(rows, gate, today).catch(") && server.includes('pictureSample(decisionDashboardSnapshot(rows, S).contracts, second)')
    && server.includes('const points = pictureSeries(await pictureSamples(day), key);'));
  const view = readSrc('../ui/clear-picture-view.mjs');
  check('مسیر روز صادقانه: ساعتِ نخستین نمونه نوشته می‌شود و خالی درون‌یابی نمی‌شود',
    view.includes('ثبت از ساعت ${clockOf(first)}؛ دقیقه‌ای که سرور روشن نبود خالی می‌ماند.'));
  check('در سطح قرارداد مسیر از ریزمعاملهٔ واقعی', view.includes("$('line1-title').textContent = 'قیمت معاملات قرارداد در طول روز';")
    && readSrc('../ui/live-dashboard-scope.mjs').includes("(viewKind === 'tape' || viewKind === 'clear') && level === 'contract'"));
}
