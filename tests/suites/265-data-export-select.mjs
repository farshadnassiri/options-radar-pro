// ۲۶۵. انتخاب قرارداد و دریافت مقاوم در تب خروجی دیتا
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import {
  DATA_EXPORT_BATCH_CAP, dataExportContractGroups, dataExportOutcome,
  dataExportPairBatches, dataExportPairs, discoverDataExportInstruments,
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
    src.includes('splitPairBatch(batch)') && src.includes('fetchBatch(half, items, signal, depth + 1)'));
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
