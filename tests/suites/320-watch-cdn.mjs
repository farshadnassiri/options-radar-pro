// ۳۲۰. پاسخ کهنهٔ CDN در اولین بارگیری سررسیدهای فزر.
import vm from 'node:vm';
import { check, group, readSrc } from '../harness.mjs';
import { evictOldest } from '../../server/cache.mjs';

group('۳۲۰. دیده‌بان تازه با کش و ادغام مشترک');
// خود تابع تولیدی اجرا می‌شود؛ فقط شبکه و ساعت بدل‌اند، نه منطق درخواست.
const source = readSrc('../server/server.mjs');
const getSource = source.slice(source.indexOf('async function get(pathname,'), source.indexOf('/** ساعت واقعی ثبت'));
let now = 1791028800000;
const urls = [], attempts = [];
const cache = new Map(), inflight = new Map();
const context = vm.createContext({
  Date: { now: () => now }, cache, inflight, evictOldest,
  S: { baseUrl: 'https://example.test/api', retries: 0, maxCacheEntries: 10 },
  stat: { requests: 0, cacheHits: 0, errors: 0 },
  num: (v, fallback) => v == null ? fallback : Number(v),
  dlog: { ctx: () => ({}) }, tally: { request() {}, cacheHit() {}, error() {} },
  upLog() {}, summarizeUpstream() {}, upAttempt: (_, detail) => attempts.push(detail), boostTicket() {},
  errlog: { push() {} }, firstList: (data) => data.instrumentOptMarketWatch,
  schedule: async (job) => job(),
  fetchUpstream: async (url) => {
    urls.push(url);
    const fresh = new URL(url).searchParams.has('_');
    return { instrumentOptMarketWatch: [{ remainedDay: fresh ? 43 : 47, qTotCap_C: fresh ? 597043139000 : 0 }] };
  },
});
vm.runInContext(`${getSource}\nglobalThis.request = get;`, context);
const board = '/Instrument/GetInstrumentOptionMarketWatch/0';
const [first, joined] = await Promise.all([context.request(board, 5, 4), context.request(board, 5, 1)]);
check('نخستین پاسخ سررسید، دادهٔ تازه دارد نه صفر کش‌شده',
  first.instrumentOptMarketWatch[0].qTotCap_C === 597043139000 && first.instrumentOptMarketWatch[0].remainedDay === 43);
check('دو خوانندهٔ هم‌زمان تنها یک درخواست شبکه دارند', urls.length === 1 && first === joined);
await context.request(board, 5, 1);
check('کش محلی پس از افزودن مهر زمان همچنان کار می‌کند', urls.length === 1);
check('زمان عکس با کلید ثابت برای cachedAt محفوظ است', cache.get(`https://example.test/api${board}`)?.at === now);
now += 6000;
await context.request(board, 5, 1);
check('پس از انقضای کش، نشانی شبکهٔ تازه ساخته می‌شود', urls.length === 2 && urls[0] !== urls[1]);
check('کلیدهای کش با تیک‌ها تکثیر نمی‌شوند', cache.size === 1);
check('دفتر شبکه نشانی واقعی مهرخورده را ثبت می‌کند', attempts[0].url === urls[0]);
await context.request('/ClosingPrice/GetClosingPriceInfo/123', 5, 3);
check('سیاست سایر مسیرهای بالادست تغییر نکرده', urls[2] === 'https://example.test/api/ClosingPrice/GetClosingPriceInfo/123');
