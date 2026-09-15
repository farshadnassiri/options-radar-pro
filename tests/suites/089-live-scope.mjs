// ۸۸. اتصال دامنهٔ داده به دو تب
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import path from 'node:path';
import { check, group, readSrc } from '../harness.mjs';
import { tehranDateNumber } from '../../core/live-day.mjs';
import { SCOPE_OPTIONS, applyLiveScope, scopeOptionsMarkup } from '../../ui/live-scope.mjs';


// ═════════ ۸۸. دو تب، یک مسیر ═════════
group('۸۸. اتصال دامنهٔ داده به دو تب');
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
}
