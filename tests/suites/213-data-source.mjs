// ۲۱۳. نشانیِ دقیقی که هر عدد از آن آمد — یا نیامد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «به ازای هر قرارداد یک لینک حداقل باید باشه در فایل — چه دیتا گرفته
// شده باشه چه گرفته نشده باشه.»
//
// حلقهٔ آخرِ راستی‌آزمایی. فایل می‌گفت کدام قرارداد بی‌قیمت ماند و چرا،
// ولی برای دیدنِ خودِ داده باید نشانی بالادست را دستی می‌ساخت — و اگر
// اشتباه می‌ساخت، نتیجه‌اش گمراه‌کننده بود نه خالی.

import { check, group, readSrc } from '../harness.mjs';
import {
  NO_URL, SOURCE_LABEL, closingHistoryPath, compactDate, dailyListPath, dataSourceRows,
  insCode, joinUrl, localDailyPath, localTradePath, seriesStatus, sourceSummary,
  tradeHistoryPath, urlOf,
} from '../../core/data-source.mjs';


group('۲۱۳-الف. ساختِ نشانی');
{
  check('مسیر سابقهٔ روزانه همان است که موتور بک‌تست صدا می‌زند',
    dailyListPath('17914401175772326', 0) === '/ClosingPrice/GetClosingPriceDailyList/17914401175772326/0',
    dailyListPath('17914401175772326', 0));
  check('و `n` در مسیر می‌نشیند، نه اینکه همیشه صفر باشد',
    dailyListPath('123', 120).endsWith('/123/120'), dailyListPath('123', 120));
  check('مسیر ریزمعاملهٔ روز تکمیل‌شده، با پرچم true',
    tradeHistoryPath('123', '20260829') === '/Trade/GetTradeHistory/123/20260829/true');

  // ── کد خراب، نشانی نمی‌سازد ─────────────────────────────────────────
  //
  // نسخهٔ اول رقم‌های غیرعددی را می‌انداخت. روی کد واقعی بی‌اثر بود ولی
  // روی کد خراب فاجعه می‌ساخت: `c20260916_26` و `t20260916_26` هر دو
  // `2026091626` می‌شدند — یک نشانی برای دو قرارداد، و هیچ‌کدام نشانیِ
  // خودشان. برای برگی که کارش راستی‌آزمایی است، بدترین شکل خرابی.
  check('کد غیررقمی نشانی نمی‌سازد، به‌جای اینکه پاک‌سازی شود',
    dailyListPath('../../evil', 0) === null && dailyListPath('c20260916_26', 0) === null,
    String(dailyListPath('c20260916_26', 0)));
  check('و دو کد خرابِ متفاوت به یک نشانی نمی‌رسند',
    dailyListPath('c20260916_26', 0) === dailyListPath('t20260916_26', 0)
    && dailyListPath('c20260916_26', 0) === null);
  check('کد درست همچنان نشانی می‌گیرد',
    insCode('17914401175772326') === '17914401175772326' && insCode('12a') === null
    && insCode('') === null);
  check('تاریخِ غیرهشت‌رقمی هم نشانی ریزمعامله نمی‌سازد',
    tradeHistoryPath('123', '2026-08-29') === null && compactDate('20260829') === '20260829'
    && tradeHistoryPath('123', '20260829') !== null);
  check('و به‌جای ستونِ خالی، جمله‌ای می‌آید که علتش را می‌گوید',
    urlOf('https://x', null) === NO_URL && urlOf('https://x', '/a') === 'https://x/a');

  // نشانی پایه از تنظیمات می‌آید و کاربر می‌تواند عوضش کند.
  check('اسلشِ پایانیِ نشانی پایه، اسلش دوتایی نمی‌سازد',
    joinUrl('https://cdn.tsetmc.com/api/', '/BestLimits/9') === 'https://cdn.tsetmc.com/api/BestLimits/9',
    joinUrl('https://cdn.tsetmc.com/api/', '/BestLimits/9'));
  check('و نبودنش هم اسلش را نمی‌خورد',
    joinUrl('https://cdn.tsetmc.com/api', 'BestLimits/9') === 'https://cdn.tsetmc.com/api/BestLimits/9');
  check('نشانی پایهٔ خالی، مسیر را همان‌طور برمی‌گرداند',
    joinUrl('', '/x') === '/x' && joinUrl(null, '/x') === '/x');

  check('مسیر محلی همان است که مرورگر واقعاً صدا می‌زند',
    localDailyPath('9', 0) === '/api/dailies?ins=9&n=0'
    && localTradePath('9', '20260829') === '/api/trades?ins=9&date=20260829');
}


group('۲۱۳-ب. وضعیتِ سری');
{
  check('خطا، «خالی» نیست — دو چیزِ کاملاً متفاوت',
    seriesStatus([], 'HTTP 500') === 'خطا' && seriesStatus([], '').startsWith('خالی'));
  check('نبودنِ سری از خالی بودنش جدا است',
    seriesStatus(undefined, '') === 'درخواست نرفت');
  check('و سریِ پر، «داده آمد»', seriesStatus([{ date: 1 }], '') === 'داده آمد');
}


group('۲۱۳-ج. یک ردیف برای هر ابزار، چه داده آمده باشد چه نیامده');
{
  const base = 'https://cdn.tsetmc.com/api';
  const ua = { ins: '17914401175772326', name: 'اهرم' };
  const contracts = [
    { ins: '11', name: 'ضهرم6046', kind: 'call', strike: 46000, expiry: 20260916 },
    { ins: '22', name: 'طهرم6046', kind: 'put', strike: 46000, expiry: 20260916 },
    { ins: '33', name: 'ضهرم6047', kind: 'call', strike: 50000, expiry: 20260916 },
  ];
  const seriesByIns = {
    17914401175772326: [{ date: 20260820 }, { date: 20260823 }],
    11: [{ date: 20260823 }],
    22: [],
    // ۳۳ اصلاً در پاسخ نبود
  };
  const errors = { 33: 'TypeError: fetch failed' };
  const rows = dataSourceRows({ base, ua, contracts, seriesByIns, errors, n: 0 });

  check('هر سه قرارداد به‌علاوهٔ نماد پایه، ردیف دارند',
    rows.length === 4, `${rows.length} ردیف`);
  check('و هیچ ردیفی بی‌نشانی نیست — همین خواستهٔ اصلی بود',
    rows.every((row) => typeof row.url === 'string' && row.url.startsWith('https://')));
  check('ابزارِ دارای کد خراب، ردیف می‌گیرد ولی نشانیِ دروغین نمی‌گیرد',
    dataSourceRows({ base, contracts: [{ ins: 'c20260916_26', name: 'ضهرم26', kind: 'call' }] })[0].url === NO_URL);
  check('نشانی هر ابزار، کد نماد خودش را دارد',
    rows.every((row) => row.url.includes(`/${row.ins}/0`)),
    rows.map((row) => row.url.split('/').slice(-2).join('/')).join('، '));

  // `?? {}` عمدی است: ادعا باید **رد شود**، نه بترکد. جهشی که ردیفِ نماد
  // پایه را برمی‌داشت با استثنا گرفته می‌شد، و استثنا کل دسته را از نیمه
  // قطع می‌کند — یعنی هر ادعای بعدیِ این فایل هم بی‌صدا اجرا نمی‌شد.
  const found = Object.fromEntries(rows.map((row) => [row.ins, row]));
  const byIns = new Proxy(found, { get: (t, k) => t[k] ?? {} });
  check('قراردادی که داده گرفت، شمار روز و نخستین و آخرین روزش را دارد',
    byIns['11'].status === 'داده آمد' && byIns['11'].rows === 1
    && byIns['11'].firstDate === 20260823 && byIns['11'].lastDate === 20260823);
  check('قراردادی که خالی برگشت، نشانی دارد ولی روز ندارد',
    byIns['22'].status.startsWith('خالی') && byIns['22'].rows === 0
    && byIns['22'].firstDate === null && !!byIns['22'].url);
  check('قراردادی که درخواستش خطا خورد، متنِ خطا را حمل می‌کند',
    byIns['33'].status === 'خطا' && byIns['33'].error === 'TypeError: fetch failed'
    && !!byIns['33'].url, String(byIns['33'].status));
  check('نماد پایه هم می‌آید — مخرجِ هر درصدی در این فایل است',
    byIns['17914401175772326'].role === 'نماد پایه'
    && byIns['17914401175772326'].firstDate === 20260820);

  // ── «لحظهٔ سنجش» یک نشانی دوم می‌سازد ───────────────────────────────
  const marked = dataSourceRows({ base, ua, contracts, seriesByIns, errors, n: 0, markDate: 20260829 });
  check('با انتخاب لحظهٔ سنجش، هر ابزار نشانی دومی هم می‌گیرد',
    marked.length === 8, `${marked.length} ردیف`);
  check('و نشانی دوم مسیر ریزمعاملهٔ همان روز است',
    marked.filter((row) => row.url.includes('/Trade/GetTradeHistory/')).length === 4
    && marked.some((row) => row.url.endsWith('/11/20260829/true')));
  check('بی‌انتخابِ لحظه، هیچ نشانی ریزمعامله‌ای ساخته نمی‌شود',
    rows.every((row) => !row.url.includes('GetTradeHistory')));

  // ── جمع‌بندی ────────────────────────────────────────────────────────
  const stat = sourceSummary(rows);
  check('جمع‌بندی، «داده آمد» و «خالی» و «خطا» را جدا می‌شمارد',
    stat.total === 4 && stat.ok === 2 && stat.empty === 1 && stat.failed === 1,
    JSON.stringify(stat));
  check('و شمارِ ریزمعامله در جمع‌بندیِ سابقهٔ روزانه دوباره شمرده نمی‌شود',
    sourceSummary(marked).total === 4, `${sourceSummary(marked).total}`);

  check('ابزارِ بی‌کد اصلاً ردیف نمی‌سازد — نشانیِ بی‌مقصد بدتر از نبودنش است',
    dataSourceRows({ base, ua: null, contracts: [{ ins: '', name: 'x' }] }).length === 0);
}


group('۲۱۳-د. برگ در دفترچه و مسیر رابط');
{
  const src = readSrc('../ui/portfolio-backtest-export.mjs');
  check('برگ «منبع داده» در دفترچه هست', src.includes("sheet('منبع داده'"));
  check('و ستون نشانی بالادست و مسیر محلی هر دو را دارد',
    src.includes('نشانی بالادست') && src.includes('مسیر محلی'));
  check('سرشناسه می‌گوید چند ابزار داده گرفت و چند تا نه',
    src.includes('ابزارِ درخواست‌شده از بالادست') && src.includes('درخواستش خطا خورد'));
  check('«محدودیت داده» خطای بالادست را به برگ منبع ارجاع می‌دهد',
    src.includes('درخواستِ خطاخوردهٔ بالادست'));

  const tab = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('رابط خطای هر ابزار را جدا نگه می‌دارد، نه اینکه صفر ردیفش کند',
    tab.includes('seriesErrors') && tab.includes('if (value.error) seriesErrors[ins] = String(value.error);'));
  check('و فهرست ابزار از همان جایی می‌آید که ترکیب‌ساز می‌خواند',
    /contracts: flattenActiveContracts\(ua, state\.settings\.blockedExpiries\)/.test(tab));
  check('نشانی پایه از تنظیمات سرور می‌آید، نه از یک رشتهٔ ثابت در رابط',
    tab.includes('base: state.settings.baseUrl'));
  check('و منبع داده به دفترچه پاس داده می‌شود',
    /basket, generated, census, sources, dateLabel/.test(tab));
}

// ═══════════ ۲۱۳-ه. منبع دوم، برای ابزارِ حذف‌شده از تابلو ═══════════
//
// یافتهٔ صاحب پروژه: «گاهی در مسیر بالادستی چیزی وجود نداره ولی در مسیر
// جزیی دیتا وجود داره.»
//
// ```
// GetClosingPriceHistory/58199962935089492/20260829   ← داده دارد
// GetClosingPriceDailyList/58199962935089492/0        ← خالی
// ```
//
// در فایل خودش، از ۷۴ قراردادِ سه سررسیدِ گذشته ۵۱ تا خالی برگشتند و از
// سه سررسید زنده فقط ۲۷ تا. الگو تصادفی نیست: **قرارداد پس از سررسید از
// تابلو حذف می‌شود و فهرست روزانه‌اش با آن می‌رود.**
//
// یعنی هر بک‌تستِ گذشته دقیقاً همان قراردادهایی را از دست می‌داد که
// موضوعش بودند — همان سوگیری بقا، یک لایه پایین‌تر از شناسایی.
group('۲۱۳-ه. منبع دوم، برای ابزارِ حذف‌شده از تابلو');
{
  const base = 'https://cdn.tsetmc.com/api';
  check('مسیر منبع دوم همان است که صاحب پروژه نشان داد',
    closingHistoryPath('58199962935089492', '20260829')
      === '/ClosingPrice/GetClosingPriceHistory/58199962935089492/20260829',
    String(closingHistoryPath('58199962935089492', '20260829')));
  check('و کد یا تاریخِ خراب، نشانی نمی‌سازد',
    closingHistoryPath('x', '20260829') === null
    && closingHistoryPath('123', '2026') === null);

  const ua = { ins: '17914401175772326', name: 'اهرم' };
  const contracts = [
    { ins: '11', name: 'ضهرم3022', kind: 'call', strike: 24000, expiry: 20260617 },
    { ins: '22', name: 'طهرم3022', kind: 'put', strike: 24000, expiry: 20260617 },
  ];
  const seriesByIns = { 17914401175772326: [{ date: 20260829 }], 11: [{ date: 20260601 }], 22: [{ date: 20260601 }] };

  // ۲۲ را منبع دوم نجات داده است.
  const sources = { 17914401175772326: 'list', 11: 'list', 22: 'history' };
  const rows = dataSourceRows({ base, ua, contracts, seriesByIns, sources, asOf: 20260829, n: 0 });

  const rescued = rows.filter((row) => row.purpose.startsWith('منبع دوم'));
  check('برای ابزارِ نجات‌یافته، نشانیِ منبع دوم هم در فایل می‌آید',
    rescued.some((row) => row.ins === '22' && row.url.endsWith('/22/20260829')),
    rescued.map((row) => row.ins).join('، '));
  check('و ستون «داده از کدام منبع آمد» می‌گوید کدام مسیر جواب داد',
    rows.find((row) => row.ins === '22' && row.purpose.startsWith('سابقهٔ روزانه')).source === SOURCE_LABEL.history
    && rows.find((row) => row.ins === '11' && row.purpose.startsWith('سابقهٔ روزانه')).source === SOURCE_LABEL.list);
  check('ابزاری که فهرست روزانه جوابش را داد، ردیف منبع دوم نمی‌گیرد',
    !rescued.some((row) => row.ins === '11'), rescued.map((row) => row.ins).join('، '));

  // ابزاری که هر دو منبعش خالی بود، باز هم نشانی منبع دوم را نشان می‌دهد
  // — کاربر باید بتواند خودش هم امتحانش کند.
  const stillEmpty = dataSourceRows({
    base, contracts: [{ ins: '33', name: 'ضهرم3023', kind: 'call' }],
    seriesByIns: { 33: [] }, sources: { 33: 'list' }, asOf: 20260829,
  });
  check('ابزاری که هر دو منبعش خالی بود، هر دو نشانی را نشان می‌دهد',
    stillEmpty.length === 2 && stillEmpty[1].url.includes('GetClosingPriceHistory'),
    `${stillEmpty.length} ردیف`);

  check('بی‌تاریخِ تکیه‌گاه، هیچ ردیف منبع دومی ساخته نمی‌شود',
    dataSourceRows({ base, ua, contracts, seriesByIns, sources }).every(
      (row) => !row.purpose.startsWith('منبع دوم')));

  const stat = sourceSummary(rows);
  check('جمع‌بندی می‌گوید چند تا را منبع دوم نجات داد',
    stat.rescued === 1 && stat.total === 3, JSON.stringify(stat));
}


// ═══════════ ۲۱۳-و. مسیر سرور و رابط ═══════════
group('۲۱۳-و. مسیر سرور و رابط');
{
  const server = readSrc('../server/server.mjs');
  const route = server.slice(server.indexOf("if (p === '/api/dailies')"), server.indexOf("if (p === '/api/clienttype')"));
  check('مسیر dailies منبع دوم را فقط وقتی می‌زند که اولی خالی باشد',
    /if \(rows\.length \|\| !canFallback\) return/.test(route)
    && route.includes('GetClosingPriceHistory'));
  check('و بی‌`asOf` هیچ درخواست اضافه‌ای نمی‌رود — رفتار قبلی دست‌نخورده',
    route.includes('const canFallback = validCompactDate(asOf);'));
  check('منبعِ هر ابزار در پاسخ برمی‌گردد تا فایل بتواند بگوید کدام جواب داد',
    /source: hist\.length \? 'history' : 'list'/.test(route));
  check('خطای منبع دوم قورت داده نمی‌شود — متنش حمل می‌شود، نه undefined',
    /fallbackError: `\$\{e2\.name\}: \$\{e2\.message\}`/.test(route));
  check('و اگر هر دو خالی بودند، هیچ ردیف ساختگی ساخته نمی‌شود',
    !/rows: \[\{/.test(route));

  const book = readSrc('../ui/portfolio-backtest-export.mjs');
  check('برگ «منبع داده» ستون منبع را دارد و سرشناسه شمار نجات‌یافته‌ها را',
    book.includes("'داده از کدام منبع آمد'") && book.includes('از منبع دوم آمد'));

  const tab = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('رابط فقط خالی‌ها را دوباره می‌خواهد، نه همه را',
    tab.includes('const emptyCodes = codes.filter((code) => !(seriesByIns[code] || []).length && !seriesErrors[code]);'));
  check('تاریخِ تکیه‌گاه حدس زده نمی‌شود — آخرین روزِ سریِ نماد پایه است',
    /const asOf = baseSeries\.length/.test(tab) && tab.includes('Math.max(...baseSeries.map'));
  check('و منبعِ هر ابزار تا دفترچه می‌رود',
    tab.includes('sources: seriesSource'));
}
