// ۲۱۵. پالایهٔ ترکیب
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// ═══ چرا لازم شد ═══
//
// پس از بسته شدن باگِ شناسه، شمار ترکیب از ۱۲۱۹ به ۳۴۶۹ رفت و هر
// استراتژیِ دوقیمت‌اعمالی همان ۱۹۹ ردیف کاملش را ساخت. سه هزار ردیف با
// چشم خوانده نمی‌شود.

import { check, group, readSrc } from '../harness.mjs';
import { buildPnlMatrix, selectMatrixRows } from '../../core/portfolio-matrix.mjs';
import {
  FIELD_BY_ID, FILTER_FIELDS, applyComboFilter, breakevens, filterNote, testField,
} from '../../core/combo-filter.mjs';

const row = (over = {}) => ({
  entry: {
    maxProfit: 1e6, maxLoss: 5e5, spot: 50000, legValue: 9e8,
    capital: 2e6, marginNet: 1.5e6, breakevens: [45000, 55000],
    ...over.entry,
  },
  final: { returnPct: 12, ...over.final },
  legs: over.legs ?? [{ days: 20 }, { days: 20 }],
});


group('۲۱۵-الف. میدان‌ها و بیرون کشیدن مقدار');
{
  check('هر میدان شناسه و برچسب دارد',
    FILTER_FIELDS.every((f) => f.id && f.label && typeof f.pick === 'function'));
  check('شناسه‌ها یکتا هستند',
    new Set(FILTER_FIELDS.map((f) => f.id)).size === FILTER_FIELDS.length);
  check('همان میدان‌هایی که صاحب پروژه خواست، هست',
    ['maxProfit', 'maxLoss', 'breakevenGap1', 'breakevenGap2', 'entryValue']
      .every((id) => FIELD_BY_ID.has(id)));

  const r = row();
  check('حداکثر سود و زیان از ردیف درمی‌آید',
    FIELD_BY_ID.get('maxProfit').pick(r) === 1e6 && FIELD_BY_ID.get('maxLoss').pick(r) === 5e5);
  check('فاصله تا سربه‌سری، درصدِ فاصله از قیمت پایه است',
    FIELD_BY_ID.get('breakevenGap1').pick(r) === 10 && FIELD_BY_ID.get('breakevenGap2').pick(r) === 10,
    `${FIELD_BY_ID.get('breakevenGap1').pick(r)}`);
  check('پهنای بین دو سربه‌سری هم درصد است',
    FIELD_BY_ID.get('breakevenWidth').pick(r) === 20);
  check('روز تا سررسید، نزدیک‌ترین پا را می‌گیرد',
    FIELD_BY_ID.get('days').pick(row({ legs: [{ days: 50 }, { days: 20 }] })) === 20);

  check('سربه‌سری‌ها مرتب و بی‌تکرار می‌آیند',
    breakevens(row({ entry: { breakevens: [55000, 45000, 45000] } })).join(',') === '45000,55000');
  check('و ورودی خراب، آرایهٔ خالی می‌دهد نه استثنا',
    breakevens({}).length === 0 && breakevens({ entry: { breakevens: 'x' } }).length === 0);
}


// ═══════════ ۲۱۵-ب. خالی، صفر نیست ═══════════
//
// ردیفی که سربه‌سری دوم ندارد — اسپردِ یک‌طرفه فقط یک نقطه دارد — با
// قیدِ «سربه‌سری دوم زیر ۱۰٪» کنار نمی‌رود. کنار گذاشتنش یعنی ادعای
// «۱۰٪ نبود»، در حالی که حقیقت «سنجیده نشد» است.
group('۲۱۵-ب. مقدارِ نبوده، ردیف را نمی‌اندازد');
{
  const oneSided = row({ entry: { breakevens: [45000] } });
  check('نقطهٔ دوم که نیست، قیدش «سنجیده نشد» می‌دهد نه «رد»',
    testField(oneSided, 'breakevenGap2', { max: 10 }) === 'unknown');
  check('و نقطهٔ اول همچنان سنجیده می‌شود',
    testField(oneSided, 'breakevenGap1', { max: 10 }) === 'pass'
    && testField(oneSided, 'breakevenGap1', { max: 5 }) === 'fail');

  check('زیانِ بی‌نهایتِ فروش برهنه با هیچ سقفی کنار نمی‌رود',
    testField(row({ entry: { maxLoss: Infinity } }), 'maxLoss', { max: 1e9 }) === 'unknown');
  check('محدودهٔ خالی یعنی قید خاموش',
    testField(row(), 'maxProfit', {}) === 'pass'
    && testField(row(), 'maxProfit', { min: null, max: null }) === 'pass');
  check('میدانِ ناشناخته، بی‌صدا رد می‌شود نه اینکه بترکد',
    testField(row(), 'chizi-ke-nist', { min: 1 }) === 'pass');

  check('کف و سقف هر دو کار می‌کنند',
    testField(row(), 'maxProfit', { min: 2e6 }) === 'fail'
    && testField(row(), 'maxProfit', { max: 5e5 }) === 'fail'
    && testField(row(), 'maxProfit', { min: 5e5, max: 2e6 }) === 'pass');
}


group('۲۱۵-ج. پالایش فهرست، با گزارشِ هر قید');
{
  const rows = [
    row({ entry: { maxProfit: 1e6, legValue: 9e8 } }),
    row({ entry: { maxProfit: 2e6, legValue: 1e6 } }),
    row({ entry: { maxProfit: 3e6, legValue: 1e6 } }),
    row({ entry: { breakevens: [45000], maxProfit: 4e6, legValue: 9e8 } }),
  ];

  check('بی‌قید، همان فهرست برمی‌گردد و کپی بیهوده ساخته نمی‌شود',
    applyComboFilter(rows, {}).rows === rows);

  const res = applyComboFilter(rows, { entryValue: { min: 5e8 } });
  check('قید ارزش معامله، دو ردیفِ کم‌ارزش را می‌اندازد',
    res.kept === 2 && res.total === 4 && res.dropped.entryValue === 2,
    `${res.kept} از ${res.total}`);

  // ردیفی که چند قید می‌اندازندش، در شمارِ **همه**شان می‌آید.
  const two = applyComboFilter(rows, { entryValue: { min: 5e8 }, maxProfit: { min: 5e6 } });
  check('ردیفی که چند قید می‌اندازندش، در شمارِ همه‌شان می‌آید',
    two.kept === 0 && two.dropped.entryValue === 2 && two.dropped.maxProfit === 4,
    JSON.stringify(two.dropped));

  const blind = applyComboFilter(rows, { breakevenGap2: { max: 20 } });
  check('ردیفِ یک‌سربه‌سری می‌ماند و جدا شمرده می‌شود',
    blind.kept === 4 && blind.unknown.breakevenGap2 === 1,
    `${blind.kept} · ${blind.unknown.breakevenGap2}`);

  check('جمله می‌گوید کدام قید بیشترین کنارگذاری را داشت',
    filterNote(two).includes('حداکثر سود') && filterNote(two).includes('بیشترین کنارگذاری'),
    filterNote(two));
  check('و می‌گوید کدام مقدارش نبود، حتی وقتی هیچ‌چیز کنار نرفته',
    filterNote(blind).includes('سنجیده نشد') && blind.kept === blind.total,
    filterNote(blind));

  // و وقتی هم‌زمان چیزی افتاده و چیزی سنجیده نشده، **هر دو** باید بیایند.
  // این حالت شاخهٔ دیگری از جمله است و بی آن، نیمی از تابع آزمون نداشت.
  const both = applyComboFilter(rows, { breakevenGap2: { max: 20 }, maxProfit: { max: 15e5 } });
  check('جمله هم کنارگذاشته را می‌گوید هم سنجیده‌نشده را',
    both.kept < both.total && both.unknown.breakevenGap2 === 1
    && filterNote(both).includes('بیشترین کنارگذاری') && filterNote(both).includes('سنجیده نشد'),
    filterNote(both));
  check('بی‌قید، جمله‌ای هم نیست',
    filterNote(applyComboFilter(rows, {})) === '');
}


// ═══════════ ۲۱۵-د. ماتریس با همان اندیس‌ها بریده شود ═══════════
//
// ماتریسِ سود و زیان ردیف‌ها را **با اندیس** می‌شناسد. کوتاه کردن فهرست
// ردیف‌ها بی برشِ ماتریس، مسیر روزانهٔ هر ردیف را به ردیف دیگری می‌چسباند
// — و هیچ خطایی نمی‌دهد، فقط عددها عوض می‌شوند.
group('۲۱۵-د. ماتریس با همان اندیس‌ها بریده شود');
{
  const rows = Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`,
    entry: { maxProfit: 1e6, maxLoss: 5e5, spot: 50000, legValue: i < 3 ? 1e6 : 9e8, breakevens: [45000, 55000] },
    final: { returnPct: i },
    legs: [{ days: 20 }],
    path: { daily: [{ date: 20260829, netPnl: (i + 1) * 100 }, { date: 20260830, netPnl: (i + 1) * 200 }] },
  }));
  const matrix = buildPnlMatrix(rows);
  check('چیدمان: هر ردیف مسیر متمایزی دارد',
    matrix.rowCount === 6 && rows.every((_, i) => matrix.pnl[i * 2] === (i + 1) * 100));

  const res = applyComboFilter(rows, { entryValue: { min: 5e8 } });
  check('پالایه اندیسِ ردیف‌های مانده را هم می‌دهد',
    res.indexes.join(',') === '3,4,5', String(res.indexes));

  const cut = selectMatrixRows(matrix, res.indexes);
  check('ماتریسِ بریده همان شمار ردیف را دارد',
    cut.rowCount === 3 && cut.pnl.length === 3 * matrix.dates.length);
  check('و هر ردیف با مسیرِ خودش می‌ماند، نه مسیرِ ردیف دیگری',
    res.rows.every((row, i) => cut.pnl[i * 2] === row.path.daily[0].netPnl),
    res.rows.map((_, i) => cut.pnl[i * 2]).join('، '));
  check('ستون‌های تاریخ دست‌نخورده می‌مانند',
    cut.dates === matrix.dates);

  check('بی‌قید، اندیسی هم نیست و ماتریس همان می‌ماند',
    applyComboFilter(rows, {}).indexes === null
    && selectMatrixRows(matrix, null) === matrix);
  check('اندیسِ بیرون از محدوده بی‌صدا انداخته می‌شود، نه اینکه آشغال بخواند',
    selectMatrixRows(matrix, [0, 99, 2]).rowCount === 2);
}


// ═══════════ ۲۱۵-ه. پالایه در رابط و در خروجی ═══════════
group('۲۱۵-ه. پالایه در رابط و در خروجی');
{
  const tab = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('پالایه روی ورودیِ تحلیل می‌نشیند، نه روی یک جدول',
    tab.includes('comboFilter = applyComboFilter(payloadRows, comboRanges);')
    && tab.includes('rows: comboFilter.rows, matrix,'));
  check('و ماتریس با همان اندیس‌ها بریده می‌شود',
    tab.includes('selectMatrixRows(payloadMatrix, comboFilter.indexes)'));
  check('هیچ قیدی پیش‌فرض روشن نیست',
    tab.includes('let comboRanges = {};'));
  check('و دکمهٔ پاک کردن همه هست',
    tab.includes("$('pb-filter-clear')") && tab.includes('comboRanges = {};'));

  // ── ساختِ شبکه ──────────────────────────────────────────────────────
  //
  // این پنل فقط پس از یک اجرای کامل باز می‌شود (`pb-tabs` داخل
  // `renderReport` سوار می‌شود)، پس روی ماشینِ بی‌شبکه با مرورگر باز
  // نمی‌شود. ساختارش اینجا تثبیت می‌شود تا جابه‌جایی بعدی بی‌صدا نشکندش.
  const mount = tab.slice(tab.indexOf('function mountFilters()'), tab.indexOf('function paintFilterNote()'));
  check('هر قید دو ورودی می‌گیرد: «از» و «تا»',
    /data-edge="min"/.test(mount) && /data-edge="max"/.test(mount)
    && (mount.match(/type="number"/g) || []).length === 2);
  check('و هر ورودی می‌گوید مالِ کدام قید است',
    /data-field="\$\{f\.id\}"/.test(mount));
  check('شبکه از همان فهرست هسته ساخته می‌شود، نه فهرستی دستی',
    mount.includes('FILTER_FIELDS.map(') && !/\['maxProfit'/.test(mount));
  check('برچسب و راهنما از رشتهٔ کاربر امن می‌شوند',
    mount.includes('esc(f.label)') && mount.includes('esc(f.hint)'));
  check('یک بار سوار می‌شود، نه هر بار که پنل باز شود',
    mount.includes('if (!host || host.dataset.ready) return;'));
  check('تایپ با تأخیر اجرا می‌شود — وگرنه «۱۰۰۰۰۰» پنج بار تحلیل را می‌ساخت',
    mount.includes('clearTimeout(timer)') && /setTimeout\([\s\S]{0,80}recompute\(\)/.test(mount));
  check('خانهٔ خالی قید را خاموش می‌کند، نه اینکه صفر بگذارد',
    mount.includes("raw === '' ? null : Number(raw)")
    && mount.includes('if (next.min == null && next.max == null) delete comboRanges[id];'));
  check('و شبکه پیش از بررسی «تازه‌سازی لازم است» سوار می‌شود',
    tab.indexOf("if (id === 'ranking') mountFilters();") < tab.indexOf("if (!analysis || !dirty.has(id))"));

  const worker = readSrc('../worker/history-worker.mjs');
  check('ریسه نقاط سربه‌سری را تا ردیف حمل می‌کند — بی آن هیچ قیدی مبنا ندارد',
    /breakevens: Array\.isArray\(replay\.entry\.payoff\?\.breakevens\)/.test(worker)
    && worker.includes('.filter(Number.isFinite) : []'));

  const book = readSrc('../ui/portfolio-backtest-export.mjs');
  check('برگ «پالایه» با محدوده و شمارِ هر قید',
    book.includes("sheet('پالایه'") && book.includes("'کنارگذاشته', 'مقدارش نبود'"));
  check('سرشناسه شمار پیش و پس از پالایه را می‌گوید',
    book.includes('ترکیب پیش از پالایه') && book.includes('ترکیب پس از پالایه'));
  check('ستون‌های سربه‌سری و سود و زیان به برگ ترکیب‌ها اضافه شده',
    book.includes("'سربه‌سری ۱', 'سربه‌سری ۲'") && book.includes("'حداکثر سود', 'حداکثر زیان'"));
  check('و مقدارشان از همان تابعِ پالایه می‌آید، نه حسابِ موازی',
    book.includes("FIELD_BY_ID.get('maxProfit').pick(combo)")
    && book.includes("FIELD_BY_ID.get('breakevenGap1').pick(combo)"));
}
