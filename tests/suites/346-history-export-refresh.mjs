// ۳۴۶. تیکِ پس‌زمینهٔ بازه، خروجی داده و رصد زندهٔ بک‌تست درجا (۱۴۰۵/۰۷/۱۸)
//
// دنبالهٔ ۳۴۴. گزارش صاحب پروژه: «بعد از چند ثانیه نمودارها بسته می‌شود و
// دوباره باید دریافت اطلاعات کنم.» ممیزی همان الگو را در سه جای دیگر پیدا
// کرد: حلقهٔ `loadRange` پس از نخستین رشد هر چهار ثانیه `onUpdate` می‌زد،
// پرسشِ ساختِ دفترِ خروجی داده کارِ آمادهٔ کاربر را دور می‌ریخت، و یک
// دریافتِ ناقصِ رصد زنده همهٔ نمودارهای درون‌روز را خالی می‌کرد.

import { check, group, readSrc } from '../harness.mjs';

const rangeSrc = readSrc('../ui/history-range.mjs');
const sliceFn = (src, head) => {
  const start = src.indexOf(head);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end + 2);
};

group('۳۴۶-الف. `loadRange`: فقط با رشدِ واقعی، یک بار');
{
  // رفتاری، نه متنی: خودِ تابع با واکشیِ ساختگی و انتظارِ صفر اجرا می‌شود.
  // ماژول مسیرهای مطلقِ مرورگر (`/core/...`) را وارد می‌کند و در node بار
  // نمی‌شود، پس فقط بدنهٔ همین تابع بیرون کشیده می‌شود.
  const body = sliceFn(rangeSrc, 'export function loadRange(').replace(/^export /, '');
  check('بدنهٔ `loadRange` پیدا شد', body.startsWith('function loadRange('));
  const run = async (counts) => {
    let n = 0;
    const fake = async () => {
      const count = counts[Math.min(n, counts.length - 1)];
      const running = n < counts.length - 1;
      n += 1;
      return { count, rows: [], note: '', build: { running } };
    };
    // eslint-disable-next-line no-new-func
    const loadRange = new Function('fetchRangeUniverse', `${body}\nreturn loadRange;`)(fake);
    const calls = [];
    const ui = { note() {}, build: (b) => Boolean(b?.running) };
    const job = loadRange({ from: 1, to: 2 }, ui, { waitMs: 0, onUpdate: (payload, how) => calls.push([payload.count, how]) });
    const first = await job.first;
    for (let i = 0; i < 40 && n < counts.length; i += 1) await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 5));
    job.stop();
    return { first, calls, asked: n };
  };
  const a = await run([10, 12, 12, 12, 15, 15]);
  check('اولین پاسخ بی‌انتظار برمی‌گردد', a.first.count === 10);
  check('هر پرسش پرسیده شد', a.asked === 6, `asked=${a.asked}`);
  check('فقط دو رشدِ واقعی → دو `onUpdate` (پیش‌تر پس از رشدِ اول هر تیک)',
    a.calls.length === 2 && a.calls[0][0] === 12 && a.calls[1][0] === 15, JSON.stringify(a.calls));
  check('`onUpdate` پرچمِ `update: true` می‌گیرد', a.calls.every(([, how]) => how?.update === true));
  const b = await run([10, 10, 10]);
  check('بی‌رشد هیچ `onUpdate`ی نیست', b.calls.length === 0, JSON.stringify(b.calls));
}

group('۳۴۶-ب. تب‌های تاریخ‌دار: بازچینِ کشویی/فهرست فقط با تغییرِ واقعی');
{
  for (const [name, file] of [['تاریخچه', 'history'], ['بک‌تست', 'backtest'], ['بک‌تست سبد', 'portfolio-backtest']]) {
    const src = readSrc(`../ui/tabs/${file}.mjs`);
    check(`${name}: \`fillBases\` پرچمِ update را می‌پذیرد`, src.includes('function fillBases(payload, { update = false } = {}) {'));
    check(`${name}: کشوییِ بی‌تغییر دوباره ساخته نمی‌شود`, src.includes('if (!update || sig !== basesSig) {'));
    check(`${name}: خطِ وضعیتِ نتیجه/خطا را تیکِ پس‌زمینه بازنویسی نمی‌کند`,
      src.includes('if (!update || status.textContent === rangeLine) setStatus(line);'));
    check(`${name}: \`onUpdate\` مستقیم به \`fillBases\` می‌رود (پرچم می‌رسد)`, src.includes('loadRange(range, rangeUi, { onUpdate: fillBases })'));
  }
  const wt = readSrc('../ui/tabs/watchtower.mjs');
  check('دیده‌بان: پرچم از پوشش `current()` رد می‌شود',
    wt.includes('onUpdate: (payload, how) => { if (current()) fillBases(payload, how); }'));
  check('دیده‌بان: فهرستِ بی‌تغییر دوباره ساخته نمی‌شود و اسکرول می‌ماند',
    wt.includes('if (!update || sig !== basesSig) {') && wt.includes('if (update) box.scrollTop = scroll;'));
  check('دیده‌بان: خطِ وضعیت فقط اگر هنوز خلاصهٔ فهرست است',
    wt.includes("if (!update || $('wt-status').textContent === rangeLine) setStatus(line);"));
}

group('۳۴۶-ج. خروجی داده: پرسشِ ساختِ دفتر کارِ کاربر را دور نمی‌ریزد');
{
  const de = readSrc('../ui/tabs/data-export.mjs');
  const load = de.slice(de.indexOf('async function loadUniverse('), de.indexOf('async function loadUniverse(') + 4000);
  check('پرسشِ بعدی با `poll: true` زمان‌بندی می‌شود', load.includes('refreshTimer = setTimeout(() => loadUniverse(range, { poll: true }), 4000);'));
  check('باطل‌کردنِ خروجیِ آماده و خاموش‌کردنِ «اجرا» فقط در مسیرِ دستی',
    /if \(!poll\) \{\s*invalidatePrepared\(\);\s*runBtn\.disabled = true;/.test(load));
  check('پرسش فقط وقتی باطل می‌کند که انتخاب چیزی از دست داده',
    load.includes("if (poll && [...selectedBases(), ...picked].join('|') !== before) { invalidatePrepared(); updateRunState(); }"));
  check('پرسشِ ناموفق فهرست را پاک نمی‌کند و دوباره می‌پرسد',
    /if \(poll\) \{[\s\S]*?فهرستِ قبلی سر جایش است[\s\S]*?loadUniverse\(range, \{ poll: true \}\)[\s\S]*?return;\s*\}/.test(load));
  check('فهرستِ بی‌تغییر دوباره ساخته نمی‌شود، اسکرول می‌ماند و جست‌وجو دوباره اعمال می‌شود',
    de.includes('if (!update || html !== basesHtml) {') && de.includes('if (update) basesHost.scrollTop = scroll;')
    && /basesHtml = html;[\s\S]{0,80}filterBases\(\);/.test(de));
  check('جست‌وجوی پایه یک تابع است که هم با تایپ و هم پس از بازچین صدا می‌خورد',
    de.includes("$('de-search').addEventListener('input', filterBases);"));
  check('وضعیتِ کنارِ دکمه را پرسش فقط وقتی بازنویسی می‌کند که هنوز جملهٔ خودش است',
    de.includes("if (update && $('de-status').textContent !== blockerLine) return;"));
}

group('۳۴۶-د. رصد زندهٔ بک‌تست: دریافتِ ناقص نمودارِ آخر را خالی نمی‌کند');
{
  const bt = readSrc('../ui/tabs/backtest.mjs');
  const live = bt.slice(bt.indexOf('async function refreshLivePosition('), bt.indexOf('async function startLiveWatch('));
  check('آخرین خط زمانیِ خوبِ همان روز نگه داشته می‌شود',
    live.includes('if (fresh.length) liveGood = { date: intradayDate, at: got.at, points: fresh };')
    && live.includes('const kept = !fresh.length && liveGood?.date === intradayDate ? liveGood : null;')
    && live.includes('intraday = kept ? kept.points : fresh;'));
  check('گفته می‌شود که این آخرین دریافتِ کامل است', live.includes('آخرین دریافتِ کامل، ساعت'));
  check('شروعِ رصدِ تازه خط زمانیِ موقعیتِ قبلی را نگه نمی‌دارد', /liveGood = null;\s*liveWatching = true;/.test(bt));
  check('`payload.at` تعریف‌نشده دیگر نیست (هر تیکِ موفق را به خطا می‌انداخت)',
    !live.includes('new Date(payload.at)') && live.includes('faClock(new Date(got.at))'));
}
