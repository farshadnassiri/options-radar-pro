// ۸۸. اتصال دامنهٔ داده به هر مسیرِ تاریخ‌دار
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import path from 'node:path';
import { check, group, readSrc } from '../harness.mjs';
import { tehranDateNumber } from '../../core/live-day.mjs';
import { todayCompact } from '../../core/history-range.mjs';
import { dailiesFor, historyDates } from '../../ui/strategy-history.mjs';
import { SCOPE_OPTIONS, applyLiveScope, scopeOptionsMarkup } from '../../ui/live-scope.mjs';


// ═════════ ۸۸. هفت مسیر، یک قاعده ═════════
group('۸۸. اتصال دامنهٔ داده به هر مسیرِ تاریخ‌دار');
{
  const hist88 = readSrc('../ui/tabs/history.mjs');
  const pb88 = readSrc('../ui/tabs/portfolio-backtest.mjs');
  const scope88 = readSrc('../ui/live-scope.mjs');
  const srv88 = readSrc('../server/server.mjs');
  const css88 = readSrc('../ui/style.css');
  const bt88 = readSrc('../ui/tabs/backtest.mjs');

  // ═══ پیش‌فرض عوض شد، و این ادعا همان را قفل می‌کند ═══
  //
  // ممیزی ۱۴۰۵/۰۶/۲۵: دفتر روزانهٔ بالادست ردیفِ امروز را تا پایان روز
  // منتشر نمی‌کند، پس تا شب هیچ تقویمی امروز را نشان نمی‌داد — در حالی که
  // عکس زندهٔ تابلو قیمت امروز را دارد. مسیر چسباندنش از قبل بود و فقط
  // خاموش بود. حالا پیش‌فرض، روز جاری را هم می‌آورد.
  check('پیش‌فرض، روز جاری را هم در بر می‌گیرد', SCOPE_OPTIONS[0][0] === 'live');
  check('انتخابگر دو گزینه دارد و «بسته‌شده» سر جایش است',
    SCOPE_OPTIONS.length === 2 && SCOPE_OPTIONS[1][0] === 'closed');
  check('گزینهٔ پیش‌فرض در نشانه‌گذاری انتخاب می‌شود',
    scopeOptionsMarkup().includes('value="live" selected') && !scopeOptionsMarkup().includes('value="closed" selected'));
  // و راه برگشت باز است: هرکس عددِ نهایی می‌خواهد، صریح انتخابش می‌کند.
  check('حالت بسته‌شده همچنان قابل انتخاب صریح است',
    scopeOptionsMarkup('closed').includes('value="closed" selected'));

  for (const [name, src, id] of [['تحلیل تاریخی', hist88, 'h-scope'], ['آزمون همه استراتژی‌ها', pb88, 'pb-data-scope']]) {
    check(`${name} انتخابگر دامنه دارد`, src.includes(`id="${id}"`) && src.includes('scopeOptionsMarkup()'));
    check(`${name} از همان مسیر مشترک استفاده می‌کند`, src.includes('applyLiveScope'));
    check(`${name} یادداشت دامنه را نشان می‌دهد`, /id="(h|pb)-scope-note"/.test(src));
    check(`${name} با عوض‌شدن دامنه نتیجهٔ قدیمی را نگه نمی‌دارد`, /addEventListener\('change'[\s\S]{0,400}loadHistory\(\)/.test(src));
    check(`${name} روز لحظه‌ای را برچسب می‌زند`, src.includes('لحظه‌ای، بسته‌نشده'));
  }

  check('دامنهٔ بسته‌شده هیچ درخواستی نمی‌فرستد',
    /!== SCOPE_LIVE\)/.test(hist88) && /!== SCOPE_LIVE\)/.test(pb88));
  check('شکست هرگز پرتاب نمی‌شود', scope88.includes('catch (error)') && scope88.includes('series: seriesByIns'));

  // سرور باید فاز بازار و ساعت راست بدهد، وگرنه روزِ عکس قابل تشخیص نیست
  check('سرور فاز بازار را جدا از متن فارسی می‌دهد',
    ["'ungated'", "'holiday'", "'before'", "'after'", "'open'"].every((phase) => srv88.includes(`phase: ${phase}`)));
  // متغیر محلی از `path` به `upstream` تغییر نام داد، چون همان بلوک حالا
  // به ماژول `node:path` هم نیاز دارد و سایه‌انداختن روی آن، خطای بی‌صدا
  // می‌سازد. ادعا همان است: عکس، ساعت راستِ خودش را حمل می‌کند.
  check('عکس تابلو ساعت راست خودش را می‌دهد',
    srv88.includes('cachedAt(upstream)') && srv88.includes('market: marketOpen()'));
  check('ساعت کش از خودِ کش خوانده می‌شود', /function cachedAt\(pathname\)/.test(srv88));

  check('یادداشت دامنه رنگش از توکن می‌آید',
    css88.includes('.live-scope-note') && css88.includes('var(--accent)')
    && !/\.live-scope-note[^}]*#[0-9a-f]{3}/i.test(css88));

  // یک پیاده‌سازی برای «امروز به وقت تهران»، نه دو تا (قاعدهٔ ۲-۵)
  check('روز تهران یک پیاده‌سازی دارد',
    bt88.includes("import { tehranDateNumber } from '/core/live-day.mjs'")
    && !/const tehranDateNumber = /.test(bt88));

  // ═══ ممیزی ردیف ۳ و ۵: چه کسانی از این مسیر می‌خوانند ═══
  //
  // «چهار تب دارای مسیر اتصال زنده‌اند… چند بخش اصلاً مسیر اتصال زنده
  // ندارند و مستقیماً تاریخ‌ها را از داده روزانه می‌گیرند.» فهرست پایین
  // همان هفت مسیر است، و عنوان این دسته هم به همین خاطر عوض شد: تا امروز
  // «دو تب» می‌گفت در حالی که مصرف‌کننده‌ها چند برابر شده بودند.
  for (const [name, file] of [
    ['نگاه باز', '../ui/tabs/open-view.mjs'],
    ['تحلیل تاریخی', '../ui/tabs/history.mjs'],
    ['رصد یونانی', '../ui/tabs/greeks-watch.mjs'],
    ['آزمون همه استراتژی‌ها', '../ui/tabs/portfolio-backtest.mjs'],
  ]) {
    check(`${name} از مسیر مشترک روز جاری می‌خواند`, readSrc(file).includes('applyLiveScope'));
  }
  for (const [name, file, marker] of [
    ['تاریخچهٔ استراتژی', '../ui/strategy-history.mjs', 'liveDaySnapshot'],
    ['تحلیل زمانی سبد', '../ui/tabs/portfolio-time.mjs', 'liveDaySnapshot'],
    ['آزمایشگاه بک‌تست', '../ui/tabs/backtest.mjs', 'loadHistoricalDailies'],
  ]) {
    check(`${name} دیگر فقط از دفتر روزانه نمی‌خواند`, readSrc(file).includes(marker));
  }

  // ═══ ممیزی ردیف ۹: «امروز» یک تعریف دارد ═══
  //
  // انتخابگر بازهٔ مشترک از UTC می‌خواند و مسیر زنده از تهران. تهران
  // ‎+۳:۳۰‎ است، پس بین ۲۰:۳۰ تا نیمه‌شب گرینویچ دو «امروز» وجود داشت.
  // لحظهٔ حساس، نه «همین حالا»: ۲۱:۰۰ گرینویچِ ۱۵ سپتامبر در تهران
  // بامدادِ ۱۶ است. با تعریفِ قدیمیِ UTC این ادعا ۲۰۲۶۰۹۱۵ می‌داد.
  check('۹. سقف بازهٔ تحلیل هم از ساعت تهران می‌آید',
    todayCompact(Date.UTC(2026, 8, 15, 21, 0)) === 20260916,
    String(todayCompact(Date.UTC(2026, 8, 15, 21, 0))));
  check('۹. و در ساعتی که دو تعریف یکی‌اند هم درست می‌ماند',
    todayCompact(Date.UTC(2026, 8, 15, 10, 0)) === 20260915);
  const rangeSrc88 = readSrc('../core/history-range.mjs');
  check('۹. و از همان یک پیاده‌سازی مشترک، نه نسخهٔ محلی',
    rangeSrc88.includes("from './tehran-day.mjs'") && !/Intl\.DateTimeFormat/.test(rangeSrc88));

  // ═══ رفتار، نه فقط وجودِ واردات ═══
  //
  // ادعای «این فایل فلان را وارد کرده» ارزان است و چیزی را اثبات نمی‌کند.
  // این دو ادعا خودِ خروجی را می‌سنجند: تقویمِ تاریخچهٔ استراتژی باید روزِ
  // جاری را بیاورد، و سریِ همان روز باید ردیف داشته باشد.
  const at88 = Date.now();
  const today88 = tehranDateNumber(at88);
  const routed88 = () => {
    const seen = [];
    const fetcher = async (url) => {
      const text = String(url);
      seen.push(text);
      if (text.startsWith('/api/daily?')) {
        return { ok: true, json: async () => ({ rows: [{ date: 20260913, close: 100, last: 101 }] }) };
      }
      if (text.startsWith('/api/dailies')) {
        return { ok: true, json: async () => ({ UA9: { rows: [{ date: 20260913, close: 100, last: 101 }] } }) };
      }
      if (text.startsWith('/api/live-trades')) {
        return {
          ok: true,
          json: async () => ({ items: { UA9: { ins: 'UA9', summary: { count: 12, volume: 3400, value: 3.4e8, firstPrice: 104, lastPrice: 108, low: 103, high: 110 } } } }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          at: at88, source: 'watch', market: { open: true, phase: 'open' },
          rows: [{ uaInsCode: 'UA9', pDrCotVal_UA: 108, pClosing_UA: 107, priceYesterday_UA: 101 }],
        }),
      };
    };
    return { fetcher, seen };
  };

  const cal88 = routed88();
  const dates88 = await historyDates('UA9', 180, { fetcher: cal88.fetcher });
  check('۵. تقویم تاریخچهٔ استراتژی روز جاری را می‌آورد',
    dates88.at(-1) === today88 && dates88.length === 2, dates88.join(','));
  const quiet88 = routed88();
  check('۵. و راه خاموشی دارد، برای وقتی روزِ گذشته خواسته می‌شود',
    (await historyDates('UA9', 180, { fetcher: quiet88.fetcher, includeToday: false })).length === 1
    && !quiet88.seen.some((url) => url.startsWith('/api/live-trades')));

  const series88 = await dailiesFor(['UA9'], { fetcher: routed88().fetcher });
  check('۵. سری روزانهٔ تاریخچهٔ استراتژی ردیف امروز می‌گیرد',
    series88.UA9.rows.at(-1).date === today88 && series88.UA9.rows.at(-1).live === true);
  check('۵. و ردیف امروزش «اولین/کمترین/بیشترین» واقعی دارد',
    series88.UA9.rows.at(-1).first === 104 && series88.UA9.rows.at(-1).low === 103
    && series88.UA9.rows.at(-1).high === 110);
  const past88 = routed88();
  await dailiesFor(['UA9'], { fetcher: past88.fetcher, includeToday: false });
  check('۵. روزِ گذشته درخواست لحظه‌ای اضافه نمی‌سازد',
    past88.seen.every((url) => url.startsWith('/api/dailies')), past88.seen.join(' | '));
}
