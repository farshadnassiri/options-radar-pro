// ۲۶۵. انتخاب قرارداد و دریافت مقاوم در تب خروجی دیتا
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import {
  BLANK_VERDICT_LABEL, DATA_EXPORT_BATCH_CAP, blankAuditSummary, dataExportBlankAudit,
  dataExportContractGroups, dataExportOutcome, dataExportPairBatches, dataExportPairs,
  dataExportSessionRows, dataExportTradeRows, discoverDataExportInstruments,
  selectedDataExportInstruments, splitPairBatch,
} from '../../core/data-export.mjs';
import { BATCH_PAIR_CAP } from '../../core/trades-source.mjs';
import { buildDataExportSheets } from '../../ui/data-export-workbook.mjs';

group('۲۶۵. انتخاب قرارداد در خروجی دیتا');
{
  const row = (patch) => ({
    uaInsCode: '77', lval30_UA: 'اهرم', contractSize: 1000,
    activeFrom: 20260901, activeTo: 20261120, expiryGregorian: 20261120,
    strikePrice: 20000,
    insCode_C: 'c1', lVal18AFC_C: 'ضهرم6040',
    insCode_P: 'p1', lVal18AFC_P: 'طهرم6040',
    ...patch,
  });
  const rows = [
    row({}),
    row({ strikePrice: 22000, insCode_C: 'c2', lVal18AFC_C: 'ضهرم6041', insCode_P: 'p2', lVal18AFC_P: 'طهرم6041' }),
    row({ expiryGregorian: 20260920, strikePrice: 18000, insCode_C: 'c3', lVal18AFC_C: 'ضهرم5030', insCode_P: 'p3', lVal18AFC_P: 'طهرم5030' }),
    row({ uaInsCode: '88', lval30_UA: 'خودرو', insCode_C: 'c9', lVal18AFC_C: 'ضخود1', insCode_P: 'p9', lVal18AFC_P: 'طخود1' }),
  ];
  const all = discoverDataExportInstruments(rows, ['77', '88'], { declaredSize: 1000 });

  // ——— گروه‌بندی بر سررسید ———
  const groups = dataExportContractGroups(all, '77');
  check('قراردادها بر سررسید گروه می‌شوند', groups.length === 2, `${groups.length}`);
  check('سررسید نزدیک‌تر اول می‌آید',
    groups[0].expiry === 20260920 && groups[1].expiry === 20261120);
  check('داخل هر سررسید، اعمالِ کمتر اول',
    groups[1].contracts.map((item) => item.strike).join(',') === '20000,20000,22000,22000',
    groups[1].contracts.map((c) => c.strike).join(','));
  check('و کال پیش از پوت', groups[1].contracts[0].kind === 'call');
  check('پایه در فهرست قرارداد نمی‌آید',
    groups.every((g) => g.contracts.every((item) => item.kind !== 'underlying')));
  check('گروه‌بندی فقط قراردادهای همان پایه را می‌دهد',
    dataExportContractGroups(all, '88').flatMap((g) => g.contracts).every((item) => item.baseIns === '88'));

  // ——— انتخاب ———
  const picked = selectedDataExportInstruments(all, ['c1', 'p2']);
  check('فقط قراردادهای انتخاب‌شده می‌مانند',
    picked.filter((item) => item.kind !== 'underlying').map((item) => item.ins).sort().join(',') === 'c1,p2');
  // ریزمعاملهٔ اختیار بی قیمتِ همان لحظهٔ پایه، نیمی از داستان است.
  check('پایهٔ هر قرارداد خودکار همراه می‌آید',
    picked.some((item) => item.kind === 'underlying' && item.ins === '77'));
  check('پایهٔ بی‌قرارداد همراه نمی‌آید',
    !picked.some((item) => item.ins === '88'));
  // فهرستی که کاربر همه را از آن برداشته نباید ناگهان همه را بگیرد.
  check('انتخاب خالی یعنی هیچ، نه همه', selectedDataExportInstruments(all, []).length === 0);
  check('شناسهٔ ناشناخته چیزی اضافه نمی‌کند',
    selectedDataExportInstruments(all, ['نیست']).length === 0);
  check('پایهٔ صریحاً انتخاب‌شده هم می‌ماند',
    selectedDataExportInstruments(all, ['c1', '88']).some((item) => item.ins === '88'));

  // انتخابِ سه قرارداد نباید جفتِ هشتاد قرارداد بسازد.
  const days = [20260905, 20260906];
  check('جفت‌ها فقط از ابزارهای انتخاب‌شده ساخته می‌شوند',
    dataExportPairs(picked, days).length === dataExportPairs(picked, days).length
    && dataExportPairs(picked, days).length < dataExportPairs(all, days).length,
    `${dataExportPairs(picked, days).length} در برابر ${dataExportPairs(all, days).length}`);
}

group('۲۶۵. دریافت مقاوم');
{
  // ═══ گزارش صاحب پروژه ═══
  // ۷۷۸ جفت در یک درخواست رفت، وسط راه قطع شد، و هر ۷۷۸ ردیف یک پیام
  // گرفت: «Unexpected token '<'» — یعنی پاسخ صفحهٔ HTML یک دروازه بود.
  check('سقف بستهٔ تب خیلی کوچک‌تر از سقف سرور است',
    DATA_EXPORT_BATCH_CAP < BATCH_PAIR_CAP / 5, `${DATA_EXPORT_BATCH_CAP} در برابر ${BATCH_PAIR_CAP}`);
  const pairs = Array.from({ length: 778 }, (_, at) => ({ ins: `i${at}`, date: 20260905, key: `k${at}` }));
  const batches = dataExportPairBatches(pairs);
  check('۷۷۸ جفت دیگر در یک درخواست نمی‌رود', batches.length > 1, `${batches.length} بسته`);
  check('هیچ بسته‌ای از سقف بزرگ‌تر نیست',
    batches.every((batch) => batch.length <= DATA_EXPORT_BATCH_CAP));
  check('جمع بسته‌ها همان جفت‌هاست',
    batches.reduce((sum, batch) => sum + batch.length, 0) === 778);
  check('سقفِ خواسته‌شده هرگز از سقف سرور بالاتر نمی‌رود',
    dataExportPairBatches(pairs, 99999)[0].length <= BATCH_PAIR_CAP);

  // نصف‌کردن: اگر علت زمان باشد نیمه‌ها می‌رسند، و اگر یک ابزار خاص باشد
  // نصف‌کردنِ پیاپی جدایش می‌کند.
  const halves = splitPairBatch(pairs.slice(0, 10));
  check('بستهٔ شکست‌خورده نصف می‌شود', halves.length === 2 && halves[0].length === 5);
  check('نصف‌ها روی هم همان بسته‌اند',
    halves[0].length + halves[1].length === 10);
  check('بستهٔ فرد هم درست نصف می‌شود',
    splitPairBatch(pairs.slice(0, 7)).map((h) => h.length).join(',') === '4,3');
  // خطای بستهٔ تک‌جفتی واقعاً مالِ همان جفت است.
  check('بستهٔ تک‌جفتی دیگر شکسته نمی‌شود', splitPairBatch([pairs[0]]).length === 0);
  check('بستهٔ خالی هم', splitPairBatch([]).length === 0);
}

group('۲۶۵. جمع‌بندی صادقانهٔ دریافت');
{
  const pairs = [
    { ins: 'a', date: 1, key: 'k1' }, { ins: 'b', date: 1, key: 'k2' },
    { ins: 'c', date: 1, key: 'k3' }, { ins: 'd', date: 1, key: 'k4' },
  ];
  const items = {
    k1: { rows: [{ price: 1 }, { price: 2 }] },
    k2: { rows: [] },
    k3: { rows: [], error: 'Unexpected token \'<\'' },
    // k4 عمداً نیست: «درخواست نرفت» با «خطا داد» یکی نیست.
  };
  const out = dataExportOutcome(pairs, items);
  check('ابزار/روزِ دارای داده شمرده می‌شود', out.ok === 1 && out.trades === 2);
  check('بی‌معامله از خطا جدا می‌ماند', out.empty === 1 && out.failed === 1);
  check('درخواستِ نرفته هم جدا شمرده می‌شود', out.missing === 1);
  check('علت غالب با شمارش گزارش می‌شود',
    out.topReason[0].includes('<') && out.topReason[1] === 1);

  // «هیچ داده‌ای نیامد» با «هیچ معامله‌ای نشده» یکی نیست.
  const blank = dataExportOutcome(pairs, { k1: { rows: [] }, k2: { rows: [] }, k3: { rows: [] }, k4: { rows: [] } });
  check('همه بی‌معامله هم «خالی» شمرده می‌شود', blank.blank === true && blank.allFailed === false);
  const broken = dataExportOutcome(pairs, Object.fromEntries(pairs.map((p) => [p.key, { rows: [], error: 'x' }])));
  check('همه خطادار، «همه شکست» علامت می‌خورد', broken.allFailed === true && broken.blank === true);
  check('سبد خالی، «خالی» علامت نمی‌خورد', dataExportOutcome([], {}).blank === false);

  // ——— برگ راهنما ———
  const instruments = [{ ins: 'a', kind: 'call', name: 'ضهرم1', baseName: 'اهرم', size: 1000 }];
  const sheets = buildDataExportSheets({ instruments, pairs, items, range: { from: 1, to: 2 } });
  const guide = sheets[0].rows.map((r) => String(r[0]));
  // کسی که فایل را بعداً باز کند باید این را اول ببیند.
  check('نتیجهٔ دریافت، اولین سطر برگ راهنماست', guide[0] === 'نتیجهٔ دریافت');
  check('و شمار ابزار/روزِ دارای داده هم در راهنما هست',
    guide.includes('ابزار/روز دارای داده'));
  const blankSheets = buildDataExportSheets({
    instruments, pairs, range: { from: 1, to: 2 },
    items: Object.fromEntries(pairs.map((p) => [p.key, { rows: [], error: 'دروازه' }])),
  });
  check('فایلِ بی‌داده صریح می‌گوید هیچ ریزمعامله‌ای نیامد',
    String(blankSheets[0].rows[0][1]).includes('هیچ ریزمعامله‌ای دریافت نشد'));
  check('و علت غالب را هم می‌آورد', String(blankSheets[0].rows[0][1]).includes('دروازه'));
  check('برگِ خالیِ قرارداد از خطا جدا توضیح داده می‌شود',
    sheets[0].rows.some((r) => String(r[0]).includes('بدون معامله در برابر خطا')));

  // ——— قرارداد تب ———
  const src = readSrc('../ui/tabs/data-export.mjs');
  check('تب از قراردادهای انتخاب‌شده جفت می‌سازد، نه از همهٔ پایه',
    src.includes('const instruments = selectedInstruments()'));
  check('بستهٔ شکست‌خورده نصف و دوباره فرستاده می‌شود',
    src.includes('splitPairBatch(batch)') && src.includes('fetchBatch(half, items, signal, depth + 1, fresh)'));
  check('و بستهٔ تک‌جفتی خطایش را روی همان جفت می‌نشاند',
    src.includes('items[batch[0].key] = { rows: [], error: error.message'));
  check('صفر بودنِ داده، خبرِ اول جملهٔ وضعیت است',
    src.includes('هیچ ریزمعامله‌ای دریافت نشد') && src.includes('outcome.blank'));
  // دروازهٔ مرده نباید به صدها درخواستِ محکوم‌به‌شکست تبدیل شود.
  check('شکستنِ بسته سقف دارد و با موفقیت صفر می‌شود',
    src.includes('const GIVE_UP_AFTER = 5') && src.includes('soloFailures = 0;'));
  // کاربری که روی «فقط کال» ایستاده، با یک کلیک نباید پوت هم بگیرد.
  check('«انتخاب همه» فقط قراردادهای دیده‌شده را می‌گیرد',
    src.includes('for (const ins of visibleContracts()) picked.add(ins)'));
  check('سررسید در کارت قرارداد با رقم فارسی نوشته می‌شود',
    src.includes('faDigits(esc(historyDateLabel(group.expiry)))'));
}

group('۲۶۵. پنجرهٔ ۹ تا ۱۲:۳۰ و راست‌آزماییِ خالی‌ها');
{
  const instrument = { ins: 'a', kind: 'call', name: 'ضهرم1', baseName: 'اهرم', size: 1000 };
  const pairs = [{ ins: 'a', date: 20260916, key: '20260916:a' }];
  const trade = (time) => ({ time, price: 100, quantity: 5, sequence: time, canceled: false, canceledKnown: true });
  const items = {
    '20260916:a': {
      rows: [trade(84500), trade(90000), trade(103000), trade(123000), trade(123001), trade(130000)],
    },
  };
  const rows = dataExportTradeRows(instrument, pairs, items);
  check('هر ردیف علامتِ داخل یا بیرونِ جلسه می‌گیرد',
    rows.every((row) => typeof row.inSession === 'boolean'));
  const split = dataExportSessionRows(rows);
  // ۰۸:۴۵ پیش‌گشایش، ۱۳:۰۰ پس از پایان، و ۱۲:۳۰:۰۱ یک ثانیه بعد از زنگ.
  // مرز همان `inIntradaySession` کلِ برنامه است — یک تعریف از «جلسه»،
  // نه یکی برای این تب و یکی برای بک‌تست.
  check('فقط ۹:۰۰ تا ۱۲:۳۰ می‌ماند',
    split.rows.map((row) => row.time).join(',') === '90000,103000,123000',
    split.rows.map((r) => r.time).join(','));
  check('مرزِ ۱۲:۳۰:۰۰ داخل شمرده می‌شود', split.rows.some((row) => row.time === 123000));
  // حذف بی‌صدا یعنی کاربر نمی‌فهمد چیزی کنار رفته.
  check('ردیف‌های بیرون از جلسه شمرده می‌شوند، نه بی‌صدا حذف',
    split.outside === 3 && split.total === 6);
  check('بی ردیف، شمارش صفر است و پرت نمی‌کند',
    dataExportSessionRows([]).outside === 0);

  // ——— راست‌آزمایی با تابلوی روزانه ———
  const blankPairs = [
    { ins: 'a', date: 20260916, key: '20260916:a' },
    { ins: 'b', date: 20260916, key: '20260916:b' },
    { ins: 'c', date: 20260916, key: '20260916:c' },
    { ins: 'd', date: 20260916, key: '20260916:d' },
  ];
  const blankItems = {
    '20260916:a': { rows: [] },                       // تابلو می‌گوید معامله شده
    '20260916:b': { rows: [] },                       // تابلو هم صفر است
    '20260916:c': { rows: [] },                       // تابلوی روزانه نداریم
    '20260916:d': { rows: [], error: 'خطا' },         // خطا، نه خالی
  };
  const daily = {
    a: { rows: [{ date: 20260916, trades: 6796, vol: 120000 }] },
    b: { rows: [{ date: 20260916, trades: 0, vol: 0 }] },
  };
  const audit = dataExportBlankAudit(blankPairs, blankItems, daily);
  check('فقط ابزار/روزهای خالی بازبینی می‌شوند — نه خطادارها',
    audit.map((row) => row.ins).join(',') === 'a,b,c', audit.map((r) => r.ins).join(','));
  // این همان چیزی است که فایل گزارش‌شده نمی‌توانست بگوید.
  check('خالی‌ای که تابلو تکذیبش می‌کند، «نیامد» علامت می‌خورد',
    audit.find((row) => row.ins === 'a').verdict === 'missing');
  check('و شمار معاملهٔ تابلو همراهش می‌رود',
    audit.find((row) => row.ins === 'a').dailyTrades === 6796);
  check('خالی‌ای که تابلو تأییدش می‌کند، واقعاً بی‌معامله است',
    audit.find((row) => row.ins === 'b').verdict === 'quiet');
  // نبودِ تابلو یعنی نمی‌دانیم، نه بی‌معامله.
  check('بی تابلوی روزانه، حکم «نامعلوم» است',
    audit.find((row) => row.ins === 'c').verdict === 'unknown'
    && audit.find((row) => row.ins === 'c').known === false);
  check('هر حکم برچسب فارسی دارد',
    audit.every((row) => (BLANK_VERDICT_LABEL[row.verdict] || '').length > 5));
  // حجمِ بی‌شمارِ معامله هم تکذیب است.
  check('حجم مثبت با شمارِ صفر هم «نیامد» است',
    dataExportBlankAudit([blankPairs[0]], { '20260916:a': { rows: [] } },
      { a: { rows: [{ date: 20260916, trades: 0, vol: 5000 }] } })[0].verdict === 'missing');

  const summary = blankAuditSummary(audit);
  check('جمع‌بندی سه حکم را جدا می‌شمارد',
    summary.missing === 1 && summary.quiet === 1 && summary.unknown === 1);
  check('بدترین مورد نیامدن، پرمعامله‌ترینش است', summary.worst.ins === 'a');
  check('بی موردِ نیامده، بدترینی هم نیست', blankAuditSummary([]).worst === null);

  // ——— قرارداد سرور و تب ———
  const server = readSrc('../server/server.mjs');
  // پاسخِ خالی نباید به حساب واقعیتِ بازار گذاشته شود.
  check('پاسخ خالی یک بار با پرچم دیگر پرسیده می‌شود',
    server.includes('historicalTradesAltPath(code, date)') && server.includes("variant: 'true'"));
  check('و خطا دوباره پرسیده نمی‌شود — فقط خالی',
    server.includes('if (rows.length) return [key, { rows, variant:'));
  check('خالی‌بودنِ پس از هر دو مسیر علامت می‌خورد', server.includes('emptyBoth'));

  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب تابلوی روزانه را برای راست‌آزمایی می‌گیرد',
    tab.includes('fetchDaily(instruments, range') && tab.includes('/api/dailies?ins='));
  check('شکست تابلوی روزانه کار اصلی را نمی‌خورد',
    tab.includes("logError('data-export:daily', error)"));
  check('جملهٔ وضعیت می‌گوید داده نرسیده، نه اینکه بازار ساکت بوده',
    tab.includes('این یعنی داده نرسیده، نه اینکه بازار ساکت بوده'));
  check('برگ هر ابزار فقط جلسهٔ پیوسته را می‌نویسد',
    readSrc('../ui/data-export-workbook.mjs').includes('dataExportSessionRows(dataExportTradeRows('));
  // ═══ یک پاسخِ بدشکل نباید فایلِ آماده را ببرد ═══
  //
  // بازبینیِ خالی‌ها کمکِ تشخیصی است، نه خودِ خروجی. یک بار پاسخی از
  // تابلوی روزانه بی `rows` رسید و `for…of` رویش «object is not iterable»
  // داد — کلِ اجرا افتاد در حالی که هر ریزمعامله در دست بود.
  const oddPairs = [{ ins: 'c1', date: 20260916, key: '20260916:c1' }];
  const oddItems = { '20260916:c1': { rows: [] } };
  let threw = false;
  let verdicts = [];
  try {
    verdicts = dataExportBlankAudit(oddPairs, oddItems, { c1: { ins: 'c1', error: 'دروازه' } })
      .concat(dataExportBlankAudit(oddPairs, oddItems, { c1: null }))
      .concat(dataExportBlankAudit(oddPairs, oddItems, { c1: 'رشته' }));
  } catch { threw = true; }
  check('پاسخِ بدشکلِ تابلوی روزانه بازبینی را نمی‌اندازد', !threw && verdicts.length === 3);
  check('و چنین موردی «نمی‌دانیم» خوانده می‌شود، نه «بی‌معامله»',
    verdicts.every((row) => row.verdict === 'unknown' && row.known === false));
  // آرایهٔ برهنه هم شکلِ معتبری است و باید خوانده شود.
  check('تابلوی روزانه به شکل آرایهٔ برهنه هم خوانده می‌شود',
    dataExportBlankAudit(oddPairs, oddItems, { c1: [{ date: 20260916, trades: 12 }] })[0].verdict === 'missing');

  // دکمهٔ «آزمون یک ابزار/روز» به خواست صاحب پروژه برداشته شد؛ کارش را
  // برگ «پوشش دریافت» برای همهٔ جفت‌ها می‌کند، نه یکی.
  check('تشخیصِ «چرا خالی است» دیگر به دکمهٔ آزمون وابسته نیست',
    !tab.includes('de-probe') && !tab.includes('probeOne')
      && readSrc('../ui/data-export-workbook.mjs').includes('حکم خالی‌بودن'));
  // مسیر انبوه پیش‌فرض از کش می‌خورد تا اجرای دوبارهٔ یک بازه به بالادست
  // فشار نیاورد؛ کش فقط برای خالیِ **تکذیب‌شده** دور زده می‌شود، نه همه.
  check('مسیر انبوه پیش‌فرض از کش می‌خورد',
    tab.includes('async function fetchHistorical(pairs, items, signal, fresh = false)'));
  check('و فقط خالیِ تکذیب‌شدهٔ تاریخی یک بار بی‌کش تکرار می‌شود',
    tab.includes('await fetchHistorical(staleHistorical, items, controller.signal, true)')
      && tab.includes("row.verdict === 'missing'"));

  // ═══ مهم‌ترین ادعای این دسته ═══
  //
  // بالادست ریزمعاملهٔ یک جلسه را تا مدتی در مسیر تاریخی نمی‌گذارد. تقسیمِ
  // تقویمی (`tehranDateNumber`) روزِ آخرین جلسه را به آن مسیرِ هنوز-خالی
  // می‌فرستاد و کل خروجی خالی درمی‌آمد. تصمیم باید از `splitTradeDays` با
  // `liveDate`ی بیاید که خودِ تابلو تأیید کرده — همان کاری که آزمایشگاه
  // آپشن می‌کند.
  check('تقسیم روزها از splitTradeDays می‌آید، نه از ساعت مرورگر',
    tab.includes('splitTradeDays(') && tab.includes('liveDate: resolved.date'));
  // نامش فقط در توضیحِ «چه اشتباهی بود» مانده؛ وارد هم نمی‌شود، پس
  // صدا زدنش ممکن نیست.
  check('و این تب دیگر ساعت تقویم را وارد نمی‌کند',
    !tab.includes("from '/core/tehran-day.mjs'"));
  check('روزِ نوار زنده از خودِ پاسخ تابلو گرفته می‌شود',
    tab.includes('liveTapeDay(payload)') && tab.includes('async function resolveLiveDay'));
  check('روز تعطیل، تاریخ آخرین نوار را از اثرانگشت روزانه تأیید می‌کند',
    tab.includes('inferLiveSessionDate(tape.items, daily)') && tab.includes("['holiday', 'before']"));
  check('نوار زنده دوباره درخواست نمی‌شود — همان پاسخِ حل‌شده مصرف می‌شود',
    tab.includes('fetchLive(live, items, controller.signal, resolved)'));
  // ═══ چرا دکمهٔ «آزمون یک ابزار/روز» رفت ═══
  //
  // آن دکمه ابزارِ عیب‌یابیِ سه نوبتِ خرابیِ خروجی بود و کارش را کرد؛ حالا
  // برگ «پوشش دریافت» همان را با ستون‌های «مسیر» و «حکم خالی‌بودن» برای
  // **همهٔ** جفت‌ها می‌گوید، نه یکی. صاحب پروژه صریح خواست برداشته شود.
  check('دکمهٔ آزمون یک ابزار/روز دیگر در تب نیست',
    !tab.includes('de-probe') && !tab.includes('probeOne'));

  // ═══ چرا منقضی‌ها کار می‌کردند و فعال‌ها نه ═══
  //
  // قراردادِ منقضی همهٔ روزهایش از مسیر تاریخی می‌آید. قراردادِ فعال روزِ
  // آخرین جلسه را از نوار می‌خواهد، و فهرستِ نوار از `liveTapeCodes`
  // می‌آید — که ردیفِ دفتر را با عددِ گردشِ صفر «معامله‌نشده» می‌خواند.
  // قاعده‌اش در دستهٔ ۰۸۸ قفل است؛ اینجا فقط مصرفش سنجیده می‌شود.
  check('تب برای روزِ زنده، قرارداد را هم از نوار می‌خواهد',
    tab.includes("liveTapeCodes(payload.rows, wanted, { withContracts: true })"));
  check('قرارداد منقضیِ آخرین جلسه با نبودن در تابلوی امروز حذف نمی‌شود',
    tab.includes("resolved?.inferred ? [...new Set([...boardCodes, ...wanted])] : boardCodes"));
  check('خالی تاریخی که روزانه تکذیب کند دقیقاً با دریافت تازه تکرار می‌شود',
    tab.includes("row.verdict === 'missing'") && tab.includes('fetchHistorical(staleHistorical, items, controller.signal, true)'));
}
