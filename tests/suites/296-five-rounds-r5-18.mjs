// ۲۹۶. آزمونِ پنج‌دوره — ۱۴۰۵/۰۷/۰۲ (R5-18)
//
// همان هفتهٔ اهرم، این بار با «تلاش تکمیلی» تا ته: پوششِ تأییدشده از
// ۱۸٫۱٪ به ۹۳٫۶٪ رسید و ۴۴۸٬۷۸۲ ریزمعامله. سه چیز هنوز غلط بود:
//
//   ۱. ۲۲ ردیفِ «سهمیه» در واقع **کامل** بودند: ستونِ حکمِ همان ردیف
//      می‌گفت «بدون معامله — تابلوی روزانه هم صفر است». برچسبِ سهمیه
//      می‌چسبید و حکمِ تابلو را می‌پوشاند؛ شش بار دوباره پرسیده شدند.
//   ۲. دو دورِ اول «فایل … دانلود شد» نوشت و فایلی روی دیسک نبود.
//   ۳. راست‌آزما به فایلی «کامل» گفت که سی قرارداد نداشت — فهرستِ
//      قراردادها هنوز اسکن نشده بود و خودِ فایل این را نوشته بود.

import { check, group, readSrc } from '../harness.mjs';
import { keepBetterTape } from '../../core/tape-choice.mjs';
import { refillQueue } from '../../core/refill-queue.mjs';
import {
  BLOCKED_STATUS, EMPTY_STATUS, boardQuiet, dataExportCoverageRows, dataExportListingBasis,
  dataExportOutcome,
} from '../../core/data-export.mjs';

group('۲۹۶. تابلوی صفر، جوابِ کامل است');
{
  check('نوارِ خالی با حکمِ «بی‌معامله» کامل است', boardQuiet('quiet', []) === true);
  check('ولی نوارِ پر، حتی با همان حکم، «تضاد» است نه «کامل»', boardQuiet('quiet', [{ p: 1 }]) === false);
  check('و خالیِ بی‌حکم، کامل نیست', boardQuiet('missing', []) === false && boardQuiet(undefined, []) === false);

  // ═══ بازپخشِ دقیقِ یکی از ۲۲ ردیف ═══
  //
  // طهرم۹۰۲۸ در ۲۰۲۶/۰۹/۲۰: «۶ بار · پرچم both · فهرست خالی»، پرچمِ سهمیه
  // خورده، و تابلوی همان روز صفر.
  const pair = { ins: '14733915547136628', date: 20260920, key: '14733915547136628:20260920' };
  const item = { rows: [], variant: 'both', emptyBoth: true, throttled: true, attempts: 6, source: 'history' };
  const audit = [{ key: pair.key, verdict: 'quiet' }];
  const instruments = [{ ins: pair.ins, name: 'طهرم9028', baseName: 'اهرم', kind: 'put' }];

  const [row] = dataExportCoverageRows(instruments, [pair], { [pair.key]: item }, audit);
  check('برگ پوشش «بدون معامله» می‌نویسد، نه «سهمیه»',
    row.status.startsWith(EMPTY_STATUS.quiet) && !row.status.includes('سهمیه'), row.status);
  check('و پرچمِ سهمیهٔ ردیف پایین می‌آید', row.throttled === false);

  const outcome = dataExportOutcome([pair], { [pair.key]: item }, audit);
  check('جمع‌بندی آن را سهمیه نمی‌شمارد', outcome.throttled === 0 && outcome.empty === 1);
  check('و بی حکمِ تابلو، همان رفتارِ قبلی می‌ماند',
    dataExportOutcome([pair], { [pair.key]: item }).throttled === 1);

  check('صفِ تکمیلی دوباره نمی‌پرسدش',
    refillQueue([pair], { [pair.key]: item }, audit).length === 0);
  check('ولی ردیفِ سهمیه‌ای که تابلو معامله دارد، در صف می‌ماند',
    refillQueue([pair], { [pair.key]: { ...item, attempts: 1 } }, [{ key: pair.key, verdict: 'missing' }]).length === 1);

  // پرچم دربارهٔ آخرین پاسخ است — مدرکِ اصلیِ این دور
  const next = keepBetterTape(item, { rows: [], complete: true, quiet: true, source: 'history' },
    { known: true, quiet: true, trades: 0, volume: 0 });
  check('پاسخِ تازهٔ «کامل — بی‌معامله» پرچمِ قدیمی را پاک می‌کند',
    next.throttled !== true && next.complete === true);
}

group('۲۹۶. نگهبانِ منبع: پرچم از کجا می‌آمد');
{
  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('حلقهٔ توقف ردیفِ کامل را «سهمیه» نمی‌کند',
    tab.includes('if (seen?.complete === true) continue;'));
  check('و جمع‌بندی پس از حکمِ تابلو ساخته می‌شود، نه پیش از آن',
    tab.indexOf('let audit = dataExportBlankAudit(') < tab.indexOf('let outcome = dataExportOutcome(pairs, items, audit);'));
  const server = readSrc('../server/server.mjs');
  check('سرور ردیفِ کامل را «سهمیه» نمی‌کند',
    server.includes('&& tape.complete !== true ? { ...tape, throttled: true } : tape;'));
  const choice = readSrc('../core/tape-choice.mjs');
  check('پرچمِ رکوردِ قبلی روی پاسخِ تازه نمی‌چسبد',
    choice.includes('const blocked = next?.throttled === true;')
      && !choice.includes('previous?.throttled === true || next?.throttled === true'));
}

group('۲۹۶. دانلود: نشانی تا خروجیِ بعدی زنده می‌ماند');
{
  // مرورگرِ ساختگی: کلیک، وصل‌شدن به صفحه و باطل‌شدنِ نشانی شمرده می‌شوند.
  const log = { appended: 0, clicked: 0, removed: 0, revoked: [] };
  let serial = 0;
  globalThis.document = {
    body: { appendChild: () => { log.appended += 1; } },
    createElement: () => ({ style: {}, click: () => { log.clicked += 1; }, remove: () => { log.removed += 1; } }),
  };
  const realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => `blob:test/${++serial}`;
  URL.revokeObjectURL = (url) => { log.revoked.push(url); };
  const { saveBlob, lastSaved } = await import('../../ui/save-file.mjs');

  const first = saveBlob(new Blob(['a']), 'one.xlsx');
  check('پیوند به صفحه وصل و کلیک می‌شود', log.appended === 1 && log.clicked === 1 && log.removed === 1);
  check('و نشانی **بلافاصله** باطل نمی‌شود — علتِ دانلودهای گم‌شده',
    log.revoked.length === 0);
  check('و برای پیوندِ دستی در دسترس می‌ماند',
    lastSaved()?.url === first.url && lastSaved()?.filename === 'one.xlsx');
  saveBlob(new Blob(['b']), 'two.xlsx');
  check('فقط با خروجیِ بعدی باطل می‌شود — حافظه یک فایل است، نه انباشته',
    log.revoked.length === 1 && log.revoked[0] === first.url);

  URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke;
  delete globalThis.document;

  // نگهبان: هیچ جای رابط دیگر نشانی را صفر میلی‌ثانیه بعد باطل نمی‌کند.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out); else if (entry.name.endsWith('.mjs')) out.push(full);
    }
    return out;
  };
  // `fileURLToPath`، نه `new URL(…).pathname`: روی ویندوز دومی `/D:/a/…`
  // می‌دهد و `path.resolve` آن را `D:\\D:\\a\\…` می‌کند — همان که CI ویندوز شکست.
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const offenders = walk(path.join(root, 'ui'))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .filter((rel) => rel !== 'ui/save-file.mjs' && readSrc(`../${rel}`).includes('revokeObjectURL'));
  check('هیچ فایلِ دیگری خودش نشانی را باطل نمی‌کند', offenders.length === 0, offenders.join(' · '));

  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب دیگر «دانلود شد» نمی‌گوید — نمی‌تواند بداند',
    !/کیلوبایت دانلود شد|تا \$\{faDigits\(clockLabel\(window\.end\)\)\} دانلود شد/.test(tab));
  check('و پیوندِ دستی می‌دهد', tab.includes('اگر دانلود شروع نشد، <a href="${saved.url}"'));
}

group('۲۹۶. کاملِ ردیف‌ها با کاملِ فهرست یکی نیست');
{
  const basis = dataExportListingBasis([
    { ins: '1', kind: 'call', listingOfficial: true, activeFrom: 20260101 },
    { ins: '2', kind: 'put', listingSource: 'daily-first-trade', activeFrom: 20260919 },
    { ins: '3', kind: 'put', activeFrom: 20260801 },
  ], []);
  check('کفِ برگرفته از تابلوی روزانه جدا شمرده می‌شود',
    basis.official === 1 && basis.fromDaily === 1 && basis.observed === 1 && basis.total === 3);

  const book = readSrc('../ui/data-export-workbook.mjs');
  check('و برگ راهنما آن را «اولین روزِ دیده‌شدنِ دفتر» نمی‌نویسد',
    book.includes('آغازِ عمر از اولین روزِ معامله در تابلوی روزانهٔ خودش آمده'));
  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('کم‌داشته‌های فایل از فهرستِ پس از بازیابی ساخته می‌شوند',
    tab.includes('coverageWarnings: exportWarnings(universe, instruments),'));

  const verify = readSrc('../tools/verify-export.mjs');
  check('راست‌آزما پوششِ دفتر را از برگ راهنما می‌خواند',
    verify.includes("guide.get('پوشش دفتر قراردادها')") && verify.includes("guide.get('کم‌داشتهٔ دفتر هنگام خروجی')"));
  check('و با دفترِ ناقص حکمِ «کامل» نمی‌دهد',
    verify.includes("'فهرستِ قراردادها کامل است — قراردادِ کشف‌نشده‌ای بیرون نمانده'"));
  check('و «سهمیه»ای را که تابلو صفرش را تأیید کرده، بی‌معامله می‌شمارد — روی فایلِ قدیمی هم',
    verify.includes("String(r[verdictAt] ?? '').startsWith('بدون معامله')"));
  check('برچسبِ جدا، هر دو «سهمیه»اند', BLOCKED_STATUS.throttledAsked.includes('سهمیه'));
}
