// ۲۸۲. مرجعِ روزانه باید مالِ همان روز باشد
//
// ═══ فایلِ واقعیِ ۲۰۲۶۰۶۲۲ تا ۲۰۲۶۰۹۲۰ (شمع ۵ دقیقه) ═══
//
// برگ پوششِ آن فایل برای اهرم در هفت روز — ۲۰۲۶۰۶۲۴، ۲۰۲۶۰۷۰۴، ۲۰۲۶۰۷۰۵،
// ۲۰۲۶۰۷۰۶، ۲۰۲۶۰۸۰۴، ۲۰۲۶۰۸۱۲ و ۲۰۲۶۰۸۳۰ — نوشته بود «۱۷۹۵ معامله /
// ۶۶۶۰۴۲۹ حجم کسری داریم»، در حالی که ستونِ «معاملهٔ تابلوی روزانه» همان
// ردیف‌ها **خالی** بود و حکمشان «تابلوی روزانه در دست نیست».
//
// ۱٬۷۹۵ و ۶٬۶۶۰٬۴۲۹ عددِ اهرم در **۲۰۲۶۰۹۲۰** است. یعنی
// `GetClosingPriceDaily/{ins}/{date}` برای روزی که جلسه نداشته، رکوردِ
// آخرین جلسه را برمی‌گرداند و ما آن را مرجعِ آن روز می‌گرفتیم.
//
// همان کلاسِ خطای بند ۵ ممیزیِ قبل، یک endpoint آن‌طرف‌تر: عکسِ بدتاریخ
// رکوردِ آن روز نیست. آنجا بسته شد، اینجا باز مانده بود.

import { check, group, readSrc } from '../harness.mjs';
import { chooseTape, dailyExpectation } from '../../core/tape-choice.mjs';

const daily = (dEven, zTotTran, qTotTran5J) => ({ closingPriceDaily: { dEven, zTotTran, qTotTran5J, qTotCap: 7 } });

group('۲۸۲. رکوردِ بدتاریخ مرجع نیست');
{
  // بازتولیدِ دقیقِ فایل: رکوردِ ۲۰۲۶۰۹۲۰ در پاسخِ درخواستِ ۲۰۲۶۰۶۲۴.
  const wrongDay = dailyExpectation(daily(20260920, 1795, 6660429), 20260624);
  check('رکوردِ روزِ دیگر مرجع شمرده نمی‌شود', wrongDay.known === false);
  check('و صریح می‌گوید چرا',
    String(wrongDay.why || '') === 'تابلوی روزانه رکوردِ 20260920 را داد، نه 20260624');
  check('هیچ عددی از آن رکورد بیرون نمی‌آید',
    wrongDay.trades === 0 && wrongDay.volume === 0);

  // رکوردِ درست، همان روز — نمونهٔ واقعیِ اهرم/۲۰۲۶۰۹۱۹.
  const right = dailyExpectation(daily(20260919, 7736, 73305224), 20260919);
  check('رکوردِ همان روز مرجعِ معتبر است',
    right.known === true && right.trades === 7736 && right.volume === 73305224);

  check('رکوردِ بی‌تاریخ هم مرجع نیست',
    dailyExpectation(daily(0, 1795, 6660429), 20260624).known === false);
  check('و دلیلش جدا گفته می‌شود',
    String(dailyExpectation(daily(0, 1, 1), 20260624).why || '').includes('تاریخ نداشت'));
  // بی تاریخِ خواسته‌شده، دروازه نباید بگزد — مصرف‌کننده‌ای که تاریخ
  // نمی‌دهد همان رفتارِ قبل را می‌گیرد.
  check('بی تاریخِ درخواست، رکورد همچنان خوانده می‌شود',
    dailyExpectation(daily(20260920, 1795, 6660429)).known === true);
  // پس از R3-03: روزِ بی‌معامله با تاریخِ درست، مرجعِ «هیچ» است.
  check('روزِ بی‌معاملهٔ هم‌تاریخ، مرجعِ صفرِ تأییدشده است',
    dailyExpectation(daily(20260624, 0, 0), 20260624).quiet === true);
  check('ولی روزِ بی‌معامله با تاریخِ غلط هیچ مرجعی نیست',
    dailyExpectation(daily(20260921, 0, 0), 20260624).known === false);
}

group('۲۸۲. پیامدِ عددیِ همان هفت ردیف');
{
  // پیش از اصلاح: مرجعِ غلط یعنی ادعای کسریِ ساختگی روی یک روزِ تعطیل.
  const bogus = { known: true, trades: 1795, volume: 6660429 };
  const empty = [{ variant: 'true', rows: [] }, { variant: 'false', rows: [] }];
  check('با مرجعِ غلط، کسریِ ساختگی ساخته می‌شد',
    chooseTape(empty, bogus).shortfall.trades === 1795);

  // پس از اصلاح، مرجع اصلاً ساخته نمی‌شود و هیچ عددی ادعا نمی‌شود.
  const honest = dailyExpectation(daily(20260920, 1795, 6660429), 20260624);
  const fixed = chooseTape(empty, honest);
  check('پس از اصلاح هیچ کسری‌ای ادعا نمی‌شود', fixed.shortfall === null,
    fixed.shortfall ? `ادعای ${fixed.shortfall.trades} معامله` : '');
  check('و «سنجیده نشد» علامت می‌خورد، نه «کامل» و نه «ناقص»',
    fixed.verified === false && fixed.complete === false);
  check('خالی‌بودنِ هر دو مسیر سرِ جایش می‌ماند', fixed.emptyBoth === true);
}

group('۲۸۲. مرجع از مصرف‌کننده — یک درخواستِ کمتر');
{
  const server = readSrc('../server/server.mjs');
  check('هر دو نقطهٔ مصرفِ سرور تاریخ را به سنجش می‌دهند',
    (server.match(/dailyExpectation\(await get\(historicalPath\('daily', code, date\), S\.ttlDailySec, 7\), date\)/g) || []).length === 2);
  check('دریافت‌کننده مرجعِ فرستاده‌شده را می‌پذیرد',
    server.includes('async function fetchHistoricalTape(code, date, { fresh = false, expect = null } = {})'));
  // مرجعِ بیرونی باور نمی‌شود: فقط دو عددِ متناهی از آن خوانده می‌شود.
  check('ولی آن را صحت‌سنجی می‌کند، نه اینکه باور کند',
    server.includes('Number.isFinite(Number(raw.trades)) && Number.isFinite(Number(raw.volume))')
      && server.includes('Math.max(0, Math.trunc(Number(raw.trades)))'));

  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب تابلوی روزانه را پیش از ریزمعامله می‌گیرد',
    tab.indexOf('const dailyByIns = await fetchDaily(') < tab.indexOf('await fetchHistorical(historical, items'));
  check('و مرجع را همراه هر درخواست می‌فرستد',
    tab.includes('expect: { trades: expect.trades, volume: expect.volume }'));
  check('فقط وقتی که واقعاً در دست باشد', tab.includes('return expect.known'));
}
