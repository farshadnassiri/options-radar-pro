// ۳۲۷. عکس تابلو در شروع تازه کهنه نماند (۱۴۰۵/۰۷/۱۳)
//
// گزارش صاحب پروژه: «وقتی سایت را از اول اجرا می‌کنم دیتایش قدیمی است…
// انگار در حافظه مانده؛ هدف این است که آخرین و جدیدترین داده نشان داده
// شود.» عکس نشان‌داده‌شده چند جلسه کهنه بود (پایانی دیروزِ اطلس ≈ ۱۶۴٬۹۰۰
// در برابر ۱۶۹٬۷۲۳ رسمی). حافظهٔ مرورگر در کار نبود؛ پاسخ کهنه از CDN
// بالادست می‌آمد. حالا هر عکس با تابلوی رسمی سه پایهٔ پرمعامله سنجیده
// می‌شود، کهنه دوباره گرفته می‌شود و اگر باز کهنه بود عکس تازهٔ قبلی
// می‌ماند — و هیچ‌وقت بی‌برچسب یا «نهایی» نمی‌شود.

import { check, group, readSrc } from '../harness.mjs';
import { boardFreshness, freshnessSample, staleDecision } from '../../core/watch-snapshot.mjs';

const row = (ua, name, yday, cVal, pVal = 0) => ({ uaInsCode: ua, lval30_UA: name, priceYesterday_UA: yday, pClosing_UA: yday, qTotCap_C: cVal, qTotCap_P: pVal });
const rows = [
  row('1', 'اطلس', 164900, 9e12, 1e12), row('1', 'اطلس', 164900, 5e12),
  row('2', 'خودرو', 2500, 4e12), row('3', 'شستا', 1200, 3e12), row('4', 'فملی', 7000, 1e12),
  row('5', 'بی‌قیمت', 0, 99e12),
];

group('۳۲۷-الف. نمونهٔ سنجش');
{
  const s = freshnessSample(rows, 3);
  check('پایه‌های یکتا، پرارزش‌ترین اول', s.map((x) => x.name).join(',') === 'اطلس,خودرو,شستا');
  check('ارزش کال و پوتِ همهٔ ردیف‌های یک پایه جمع می‌شود', s[0].value === 15e12);
  check('پایهٔ بی‌پایانیِ دیروز کنار می‌رود', !s.some((x) => x.ins === '5'));
  check('ورودی خالی امن', freshnessSample(null).length === 0);
}

group('۳۲۷-ب. حکم تازگی');
{
  const s = freshnessSample(rows, 3);
  const fresh = boardFreshness(s, { 1: { yday: 164900 }, 2: { yday: 2500 }, 3: { yday: 1200 } });
  check('همه جور → تازه', fresh.fresh === true && fresh.checked === 3);
  const stale = boardFreshness(s, { 1: { yday: 169723 }, 2: { yday: 2550 }, 3: { yday: 1200 } });
  check('اکثریت ناجور → کهنه، با نام نماد و دو عدد', stale.fresh === false && stale.why.includes('اطلس') && stale.why.includes('169723') && stale.why.includes('164900'));
  const oneAdjusted = boardFreshness(s, { 1: { yday: 120000 }, 2: { yday: 2500 }, 3: { yday: 1200 } });
  check('تعدیل قیمتِ یک نماد عکس را کهنه نمی‌کند', oneAdjusted.fresh === true && oneAdjusted.stale.length === 1);
  check('منبع مرجع ساکت → نامعلوم، نه کهنه', boardFreshness(s, {}).fresh === null);
  check('تفاوت گرد کردن زیر نیم ریال جور حساب می‌شود', boardFreshness(s, { 1: { yday: 164900.4 } }).fresh === true);
}

group('۳۲۷-ج. تصمیم: نگه‌داشتن عکس تازهٔ قبلی');
{
  const bad = { fresh: false, why: 'کهنه', stale: [{ name: 'اطلس' }] };
  check('تازه یا نامعلوم → جایگزین، بی‌برچسب', staleDecision({ verdict: { fresh: true } }).stale === null && staleDecision({ verdict: null }).keep === false);
  check('کهنه و عکس تازهٔ قبلی داریم → همان می‌ماند', staleDecision({ verdict: bad, prevRows: 900 }).keep === true);
  const d = staleDecision({ verdict: bad, prevRows: 0, at: 5 });
  check('کهنه و عکسی نداریم → نشان بده ولی با برچسب', d.keep === false && d.stale.why === 'کهنه' && d.stale.symbols[0] === 'اطلس' && d.stale.at === 5);
  check('عکس قبلی هم کهنه بود → تازه‌ترِ کهنه‌ها، با برچسب', staleDecision({ verdict: bad, prevRows: 900, prevStale: { why: 'x' } }).keep === false);
}

group('۳۲۷-د. سیم‌کشی سرور و رابط');
{
  const server = readSrc('../server/server.mjs');
  check('درخواست تابلو مهر تصادفی و سرآیند «کش نکن» دارد', /Math\.random\(\)/.test(server) && server.includes("'Cache-Control': 'no-cache, no-store'"));
  check('حلقهٔ دیده‌بان عکس را می‌سنجد و کهنه را با کش پاک دوباره می‌گیرد',
    server.includes('freshBoardRows(fetched, { due })') && server.includes('cache.delete(`${S.baseUrl}${BOARD_PATH}`)'));
  check('سنجش با تابلوی رسمی خودِ نماد', /checkBoard[\s\S]{0,400}GetClosingPriceInfo/.test(server));
  check('عکس کهنه «نهایی» نمی‌شود', server.includes('finalDay: 0 } : after') && server.includes('!watch.stale'));
  check('مسیر جایگزینِ داشبورد هم می‌سنجد و برچسب را می‌فرستد', /if \(!fromWatch\) \{\s*const fetched = await freshBoardRows/.test(server) && server.includes('stale: fromWatch ? watch.stale'));
  check('عکس کهنهٔ میان دو سنجش هم همان دور گیر می‌افتد (مقایسه با مرجع، بی درخواست)',
    server.includes('boardFreshness(freshnessSample(fetched, 3), boardCheck.ref)') && server.includes('first || drift ||'));
  check('عکس تازهٔ نگه‌داشته‌شده با پاسخ کهنهٔ بعدی جایگزین نمی‌شود (برچسب جدا از کهنگیِ ردیف‌ها)',
    server.includes('prevStale: watch.rowsStale') && server.includes('rowsStale: Boolean(stale)'));
  const ui = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('داشبورد برچسب کهنگی را قرمز نشان می‌دهد', ui.includes('next.session?.stale?.why') && ui.includes("clock.stale || boardStale ? 'loss'"));
}
