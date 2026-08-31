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
  NO_URL, compactDate, dailyListPath, dataSourceRows, insCode, joinUrl,
  localDailyPath, localTradePath, seriesStatus, sourceSummary, tradeHistoryPath, urlOf,
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
