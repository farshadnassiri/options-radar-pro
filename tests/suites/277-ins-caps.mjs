// ۲۷۷. سقف ابزار: رد کن، نبُر
//
// بند ۴ ممیزیِ ۱۴۰۵/۰۶/۲۹. بازتولیدِ گزارش‌شده: ۲۰۱ شناسه رفت و ۲۰۰ تا
// برگشت — نه خطا، نه فهرستِ حذف‌شده‌ها. سقفِ مهارِ سرور به یک ادعای غلط
// دربارهٔ بازار ترجمه می‌شد، چون مصرف‌کننده برای کدِ بی‌کلید «داده‌ای
// نداشت» می‌خواند.
//
// معیار پذیرشِ ۷ ممیزی: آزمونِ ۲۰۱ ابزار روزانه، ۲۵ ابزار زنده و ۶۱ ابزار
// تاریخی نباید هیچ شناسه‌ای را گم کند.

import { check, group, readSrc } from '../harness.mjs';
import { parseInsList, parseInsRequest } from '../../server/guard.mjs';
import { INS_CAP, insBatches, mergeInsPayloads, missingInsCodes } from '../../core/ins-batches.mjs';

const codes = (count, from = 1) => Array.from({ length: count }, (_, i) => String(from + i));

group('۲۷۷. سقف ابزار — سرور صریح رد می‌کند');
{
  // بازتولیدِ دقیقِ ممیزی.
  const over = parseInsRequest(codes(201).join(','), 200);
  check('۲۰۱ شناسه، اضافه‌بودنش گزارش می‌شود نه بریده',
    over.requested === 201 && over.overflow === 1);
  check('و شمارِ کدهای نامعتبر جدا شمرده می‌شود',
    parseInsRequest('111,../x,222,۳۳۳', 200).invalid === 2);
  check('تکراری اضافه‌درخواست نمی‌سازد',
    parseInsRequest(codes(200).concat(codes(5)).join(','), 200).overflow === 0);
  check('دقیقاً سرِ سقف، سرریز صفر است', parseInsRequest(codes(200).join(','), 200).overflow === 0);
  check('`parseInsList` همچنان فهرست می‌دهد و رفتارش عوض نشده',
    parseInsList(codes(500).join(','), 200).length === 200);

  const server = readSrc('../server/server.mjs');
  check('سرور یک دروازهٔ مشترک برای سقف دارد',
    server.includes('function insListOrReject(res, raw, max, label)'));
  check('و اضافه‌درخواست را با ۴۱۳ رد می‌کند، نه ۲۰۰ِ بریده',
    /sendJson\(res, 413, \{[\s\S]{0,320}overflow: parsed\.overflow/.test(server));
  // هر چهار مسیرِ دسته‌ای باید از همین دروازه بگذرند؛ هیچ‌کدام نباید
  // مستقیم `parseInsList` را با سقف صدا بزند.
  check('هیچ مسیری دیگر بی‌صدا نمی‌بُرد',
    !/parseInsList\(u\.searchParams\.get\('ins'\)/.test(server));
  for (const [route, cap] of [['نوار زنده', 24], ['دستهٔ تاریخی', 60],
    ['تابلوی روزانهٔ دسته‌ای', 200], ['دفتر سفارشِ دسته‌ای', 200]]) {
    check(`مسیر «${route}» با سقف ${cap} از دروازه می‌گذرد`,
      server.includes(`, ${cap}, `) && server.includes(route));
  }
}

group('۲۷۷. سقف ابزار — مصرف‌کننده کامل دسته می‌کند');
{
  // سقف‌های دو طرف باید یکی باشند، وگرنه مصرف‌کننده دسته‌ای می‌سازد که
  // سرور ردش می‌کند و کاربر یک ۴۱۳ می‌بیند بی آنکه کاری کرده باشد.
  const server = readSrc('../server/server.mjs');
  check('سقفِ مرورگر با سقفِ سرور یکی است',
    INS_CAP.liveTrades === 24 && INS_CAP.hist === 60
      && INS_CAP.dailies === 200 && INS_CAP.books === 200 && INS_CAP.infos === 200
      && server.includes("u.searchParams.get('ins'), 24,")
      && server.includes("u.searchParams.get('ins'), 60,")
      && server.includes("u.searchParams.get('ins'), 200,"));

  // معیار پذیرشِ ۷: هیچ شناسه‌ای گم نمی‌شود.
  for (const [count, cap, label] of [[201, INS_CAP.dailies, 'روزانه'],
    [25, INS_CAP.liveTrades, 'زنده'], [61, INS_CAP.hist, 'تاریخی']]) {
    const list = codes(count);
    const batches = insBatches(list, cap);
    const flat = batches.flat();
    check(`${count} ابزارِ ${label} در دسته‌های زیرِ سقف می‌روند`,
      batches.every((batch) => batch.length <= cap) && batches.length === Math.ceil(count / cap));
    check(`و هیچ‌کدام از ${count} شناسه گم نمی‌شود`,
      flat.length === count && new Set(flat).size === count
        && list.every((code) => flat.includes(code)));
  }

  check('تکراری دستهٔ بی‌دلیل نمی‌سازد',
    insBatches(codes(200).concat(codes(5)), 200).length === 1);
  check('فهرست خالی هیچ دسته‌ای نمی‌سازد', insBatches([], 200).length === 0);

  // ═══ «پاسخ آمد» با «کد جواب گرفت» یکی نیست ═══
  check('کدِ بی‌کلید در پاسخ، گمشده نام می‌گیرد',
    missingInsCodes(['1', '2', '3'], { 1: {}, 3: {} }).join(',') === '2');
  check('کدی که پاسخش خالی است گمشده نیست',
    missingInsCodes(['1'], { 1: { rows: [] } }).length === 0);
  const merged = mergeInsPayloads(['1', '2', '3'], [{ 1: 'a' }, { 2: 'b' }]);
  check('چند دسته‌پاسخ در یک شیء جمع می‌شوند',
    merged.payload['1'] === 'a' && merged.payload['2'] === 'b' && merged.batches === 2);
  check('و گمشده‌ها همان‌جا نام برده می‌شوند', merged.missing.join(',') === '3');
}

group('۲۷۷. سقف ابزار — برشِ بی‌صدای تب‌ها برداشته شد');
{
  const exportTab = readSrc('../ui/tabs/data-export.mjs');
  check('خروجی دیتا تابلوی روزانه را دسته‌بندی می‌کند',
    exportTab.includes('insBatches(codes, INS_CAP.dailies)'));
  check('و ابزارِ بی‌پاسخ را «راست‌آزمایی نشده» می‌خواند، نه «بی‌معامله»',
    exportTab.includes('dailyMissing = merged.missing')
      && exportTab.includes('راست‌آزماییِ خالی‌هایشان انجام نشد'));
  check('و همین در برگ راهنمای فایل هم می‌نشیند',
    readSrc('../ui/data-export-workbook.mjs').includes("['راست‌آزمایی انجام‌نشده'"));

  const positions = readSrc('../ui/tabs/positions.mjs');
  check('موقعیت‌ها روزانه و مظنه را دسته‌بندی می‌کند',
    positions.includes('insBatches(all, INS_CAP.dailies)')
      && positions.includes('insBatches(all, INS_CAP.books)'));
  check('و «نیامد» را از «خالی آمد» جدا می‌گوید',
    positions.includes('قرارداد اصلاً پاسخ نگرفت'));

  // این دو برش خودشان حذفِ بی‌صدا بودند، نه مهار.
  check('رول دیگر نامزدها را سرِ ۱۸۰ نمی‌بُرد',
    !readSrc('../ui/tabs/roll.mjs').includes("[...codes].slice(0, 180)"));
  check('اسکنر هم نمی‌بُرد', !readSrc('../ui/scanner.mjs').includes("[...codes].slice(0, 180)"));
}
