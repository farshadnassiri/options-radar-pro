// ۳۰۰. جریانِ داده: هر درخواست، از خواستن تا رسیدن، دسته‌بندی‌شده (R5-21)
//
// خواستهٔ صاحب پروژه: «از زمان درخواست دیتا تا زمان دریافت، برای هر دیتا
// بدانیم نتیجه چه شد. بدانیم برای کدام قسمت برنامه بوده، چه زمانی و چه
// آدرسی. جواب‌ها دسته‌بندی شده باشند: نیامد، بلاک شدیم، آمد، دیر آمد،
// خطا داد، نت قطع شد…» خروجیِ دیتا فعلاً بیرون است.

import { check, group, readSrc } from '../harness.mjs';
import {
  DL_CAT, DL_MUTED_TABS, buildTree, classifyError, classifyReply, classifyUpstreamOk,
  sourceFromStack, summarizeLog, summarizeReply, summarizeUpstream, tabFromSource, worstCat,
} from '../../core/datalog.mjs';
import { createDataLog, tehranDay } from '../../server/datalog.mjs';

group('۳۰۰. هر خطا دستهٔ خودش را دارد');
{
  const err = (message, extra = {}) => Object.assign(new Error(message), extra);
  check('HTTP 5xx: خطای سرورِ بالادست', classifyError(err('HTTP 502')) === 'http');
  check('HTTP 403 و 429: بلاک شدیم', classifyError(err('HTTP 403')) === 'blocked' && classifyError(err('HTTP 429')) === 'blocked');
  check('قطعِ زمان‌سنج در سرور: جواب نیامد (مهلت)',
    classifyError(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }), { abortIsTimeout: true }) === 'timeout');
  check('همان در مرورگر: لغو شد', classifyError(Object.assign(new Error('aborted'), { name: 'AbortError' })) === 'aborted');
  check('ECONNREFUSED / ENOTFOUND / fetch failed: نت قطع شد',
    classifyError(err('fetch failed', { cause: { code: 'ECONNREFUSED' } })) === 'network'
    && classifyError(err('getaddrinfo ENOTFOUND cdn.tsetmc.com')) === 'network'
    && classifyError(new TypeError('Failed to fetch')) === 'network');
  check('اتصالِ کندِ بی‌پاسخ: مهلت', classifyError(err('Connect Timeout Error', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })) === 'timeout');
  check('JSON خراب: جواب خراب آمد', classifyError(Object.assign(new SyntaxError('Unexpected end of JSON input'))) === 'parse');
  check('هر چیز دیگر: خطا داد', classifyError(err('boom')) === 'error');
  check('هر دسته جملهٔ فارسیِ خودش را دارد',
    ['ok', 'empty', 'partial', 'throttled', 'blocked', 'http', 'timeout', 'network', 'parse', 'offline', 'cached', 'joined']
      .every((k) => typeof DL_CAT[k] === 'string' && DL_CAT[k].length > 2));
}

group('۳۰۰. خلاصهٔ پاسخ، نه بدنه');
{
  const tape = { tradeHistory: [{ hEven: 90012, canceled: 0 }, { hEven: 122959, canceled: 1 }, { hEven: 101500 }] };
  const s = summarizeUpstream(tape);
  check('ریزمعامله: شمار، ساعتِ اولین و آخرین، باطل‌شده',
    s.rows === 3 && s.key === 'tradeHistory' && s.first === '09:00:12' && s.last === '12:29:59' && s.canceled === 1);
  const d = summarizeUpstream({ closingPriceDaily: { dEven: 20260805, zTotTran: 400, qTotTran5J: 4000, pClosing: 20000 } });
  check('تابلوی روزانه: همان عددهای مرجعِ سنجش', d.rows === 1 && d.trades === 400 && d.volume === 4000 && d.date === 20260805);
  check('پاسخِ بی‌ردیف: «آمد ولی خالی»', classifyUpstreamOk(summarizeUpstream({ tradeHistory: [] })) === 'empty'
    && classifyUpstreamOk(s) === 'ok');

  const batch = summarizeReply('/api/trades/batch', {
    items: {
      a: { rows: [{}, {}], complete: true },
      b: { rows: [], complete: true, quiet: true },
      c: { rows: [{}], complete: false, verified: true },
      d: { rows: [], throttled: true },
    },
    throttled: true, throttleNote: 'سهمیه',
  });
  check('بستهٔ ریزمعامله: حکمِ هر قلم شمرده می‌شود',
    batch.items === 4 && batch.states.complete === 1 && batch.states.quiet === 1
    && batch.states.partial === 1 && batch.states.throttled === 1 && batch.rows === 3);
  check('و دستهٔ کلش «بلاک شدیم (سهمیه)» است', classifyReply(200, batch) === 'throttled');
  check('ناقص بی‌سهمیه: «ناقص آمد»',
    classifyReply(200, summarizeReply('/api/trades/batch', { items: { a: { rows: [{}], complete: false, verified: true } } })) === 'partial');
  check('فقط بی‌معاملهٔ تأییدشده: «خالیِ تأییدشده»',
    classifyReply(200, summarizeReply('/api/trades', { rows: [], complete: true, quiet: true })) === 'quiet');
  check('پاسخِ داده‌ایِ بی‌ردیف: «آمد ولی خالی»', classifyReply(200, summarizeReply('/api/journal', { rows: [] })) === 'empty');
  check('پاسخِ وضعیت (بی `rows`) خالی خوانده نمی‌شود', classifyReply(200, summarizeReply('/api/health', { ok: true, byEndpoint: [] })) === 'ok');
  check('کدِ ۴۰۰ به بالا یا `error` در بدنه: «خطا داد»',
    classifyReply(502, summarizeReply('/api/history', { error: 'x' })) === 'error'
    && classifyReply(200, summarizeReply('/api/trades', { rows: [], error: 'timeout' })) === 'error');
}

group('۳۰۰. کدام قسمتِ برنامه');
{
  const stack = `Error
    at datalogFetch (http://127.0.0.1:8787/ui/datalog-client.mjs:120:17)
    at fetchTapeOne (http://127.0.0.1:8787/ui/tape-intake.mjs:106:26)
    at fetchTrades (http://127.0.0.1:8787/ui/tabs/greeks-watch.mjs:444:38)
    at http://127.0.0.1:8787/ui/app.mjs:618:5`;
  const frames = sourceFromStack(stack);
  check('ردِ پشته: فایل و خط، بی خودِ پوشش',
    frames.join('|') === 'ui/tape-intake.mjs:106|ui/tabs/greeks-watch.mjs:444|ui/app.mjs:618');
  check('تب از همان رد، حتی وقتی قابِ اول یک دروازهٔ مشترک است', tabFromSource(frames) === 'greeks-watch');
  check('درخواستِ خودِ پوسته مالِ پوسته است، نه تبِ باز', tabFromSource(['ui/app.mjs:285']) === 'app');
  check('ردی که به هیچ‌کدام نرسید: `null` تا تبِ باز جایش بنشیند', tabFromSource(['core/x.mjs:1']) === null);
  check('خروجیِ دیتا فعلاً ثبت نمی‌شود', DL_MUTED_TABS.has('data-export'));
}

group('۳۰۰. درخت: یک کلیک تا آخرین درخواستِ بالادست');
{
  const rows = [
    { kind: 'client', id: 'c1', at: 1000, tab: 'backtest', cat: 'ok', ms: 900 },
    { kind: 'up', seq: 2, parent: 'c1', at: 1100, cat: 'ok', path: '/Trade/GetTradeHistory/1791/20260805/false', ms: 300 },
    { kind: 'up', seq: 3, parent: 'c1', at: 1500, cat: 'timeout', path: '/Trade/GetTradeHistory/1791/20260806/false', ms: 1500 },
    { kind: 'api', id: 'c1', at: 1890, tab: 'backtest', cat: 'partial', ms: 880 },
    { kind: 'up', seq: 5, parent: null, at: 2000, tab: 'server', cat: 'network', path: '/Instrument/GetInstrumentOptionMarketWatch/0' },
    { kind: 'client', id: 'c2', at: 2100, tab: 'app', cat: 'offline', ms: 3 },
  ];
  const tree = buildTree(rows);
  check('سه ریشه: کلیک، پس‌زمینه، و درخواستی که به سرور نرسید', tree.length === 3);
  const first = tree.find((n) => n.id === 'c1');
  check('ریشهٔ اول دیدِ مرورگر، دیدِ سرور و دو درخواستِ بالادست را دارد',
    first.client && first.api && first.up.length === 2 && first.cat === 'partial' && first.upCats.timeout === 1);
  check('درخواستی که به سرور نرسید «سرورِ محلی در دسترس نبود» می‌ماند', tree.find((n) => n.id === 'c2').cat === 'offline');
  check('ریشهٔ پس‌زمینه دستهٔ بدترین فرزند را می‌گیرد', tree.find((n) => n.up[0]?.seq === 5).cat === 'network'
    && worstCat(['ok', 'empty', 'timeout']) === 'timeout');
  const sum = summarizeLog(rows);
  check('جمع‌بندی به تفکیکِ تب و سرویس',
    sum.requests === 3 && sum.upstream === 3 && sum.byTab.backtest.up === 2
    && sum.byPath['/Trade/GetTradeHistory/…/…/false'].count === 2);
}

group('۳۰۰. انبار: حافظه، شماره، و خاموش‌بودن');
{
  let on = true;
  const log = createDataLog({ dir: null, enabled: () => on, cap: 3 });
  log.push({ kind: 'up', cat: 'ok' }); log.push({ kind: 'up', cat: 'ok' });
  log.push({ kind: 'up', cat: 'ok' }); log.push({ kind: 'up', cat: 'empty' });
  check('سقفِ حافظه قدیمی‌ترین را می‌اندازد و شماره ادامه دارد',
    log.list().length === 3 && log.list()[0].seq === 2 && log.list({ since: 3 }).length === 1);
  on = false;
  check('خاموش که شد، چیزی ثبت نمی‌شود', log.push({ kind: 'up' }) === null && log.list().length === 3);
  check('زمینه از ورودی تا عمقِ درخواست می‌رود',
    log.run({ id: 'x' }, () => log.ctx()?.id) === 'x' && log.ctx() === null);
  check('نامِ فایل روزِ تهران است', /^\d{8}$/.test(tehranDay(Date.UTC(2026, 8, 25, 21, 0))) && tehranDay(Date.UTC(2026, 8, 25, 21, 0)) === '20260926');
}

group('۳۰۰. سیم‌کشی');
{
  const server = readSrc('../server/server.mjs');
  check('هر تلاشِ بالادست ثبت می‌شود — `get` و `getFresh` هر دو',
    (server.match(/upAttempt\(dl, \{ pathname, url, attempt, queuedAt, meta, error: e \}\)/g) || []).length === 2
    && (server.match(/upAttempt\(dl, \{ pathname, url, attempt, queuedAt, meta, data \}\)/g) || []).length === 2);
  check('کش و ادغام هم ثبت می‌شوند، نه فقط رفتن به TSETMC',
    (server.match(/cat: 'cached'/g) || []).length === 2 && (server.match(/cat: 'joined'/g) || []).length === 2);
  check('تنها `fetch` بالادست همان `fetchUpstream` است', (server.match(/await fetch\(/g) || []).length === 1);
  check('زمینه صریح گرفته می‌شود، نه از لحظهٔ اجرای صف',
    (server.match(/const dl = dlog\.ctx\(\);/g) || []).length === 2);
  check('هر درخواستِ `/api/` یک ردیفِ `api` می‌گیرد، جز خودِ لاگ',
    server.includes("kind: 'api', id: ctx.id") && server.includes('const DL_SKIP = /^\\/api\\/(datalog|logs|stream)\\b/;'));
  check('لاگِ امروز پس از اجرای دوباره برمی‌گردد و هنگامِ بستن نوشته می‌شود',
    server.includes('await dlog.restore();') && server.includes("process.on('exit', () => dlog.flushSync());"));

  const app = readSrc('../ui/app.mjs');
  check('پوششِ مرورگر پیش از هر درخواست نصب می‌شود',
    app.includes("installDataLog({ currentTab: () => current || '' });")
    && app.includes("{ id: 'datalog', title: 'جریان داده'"));
  const client = readSrc('../ui/datalog-client.mjs');
  check('پوشش شناسه، تب، کار و مبدأ را همراهِ درخواست می‌فرستد',
    ['x-dl-id', 'x-dl-tab', 'x-dl-action', 'x-dl-src'].every((h) => client.includes(`headers.set('${h}'`)));
  check('درخواستی که به سرور نرسید هم ثبت می‌شود', client.includes("'offline'") && client.includes('throw error;'));
  const ignore = readSrc('../.gitignore');
  check('فایل‌های لاگ به مخزن نمی‌روند', ignore.includes('data/logs/'));
}
