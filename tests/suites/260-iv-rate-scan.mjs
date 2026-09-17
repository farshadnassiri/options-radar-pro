// ۲۶۰. اثر نرخ بدون ریسک بر تلاطم ضمنی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import {
  DEFAULT_RATE_SCAN, IV_RATE_SCAN_VERSION, RATE_WHY_LABEL,
  highestSolvingRate, ivByRate, rateScanNote,
} from '../../core/iv-rate-scan.mjs';
import { bsPrice } from '../../core/bs.mjs';

group('۲۶۰. اثر نرخ بدون ریسک بر تلاطم');
{
  check('نسخهٔ قرارداد اعلام شده', IV_RATE_SCAN_VERSION === 1);
  check('نرخ‌های پیش‌فرض از صفر شروع می‌شوند و بالاتر از ۳۰٪ هم دارند',
    DEFAULT_RATE_SCAN[0] === 0 && Math.max(...DEFAULT_RATE_SCAN) > 0.3);

  // قراردادی که با تلاطم ۲۵٪ و نرخ ۱۰٪ قیمت‌گذاری شده — باید در همان نرخ
  // دقیقاً همان تلاطم را پس بدهد.
  const leg = { kind: 'call', spot: 100000, strike: 105000, days: 60, yearDays: 365, divYield: 0 };
  const T = 60 / 365;
  const fair = bsPrice('call', 100000, 105000, T, 0.1, 0, 0.25);
  const scan = ivByRate({ ...leg, price: fair }, [0, 0.1, 0.3]);
  const at10 = scan.rows.find((row) => row.rate === 0.1);
  check('در همان نرخی که قیمت از آن ساخته شده، تلاطم بازتولید می‌شود',
    near(at10.ivPct, 25, 1e-3), `${at10.ivPct.toFixed(3)}`);
  check('و علتش «حل شد» است', at10.why === 'ok');
  // نرخ بالاتر ارزش نظری کال را بالا می‌برد، پس با همان قیمت، تلاطمِ
  // پایین‌تری لازم است.
  check('نرخ بالاتر، تلاطم ضمنی کمتری می‌دهد',
    scan.rows.find((row) => row.rate === 0.3).ivPct < at10.ivPct);
  check('نرخ پایین‌تر، تلاطم بیشتری', scan.rows.find((row) => row.rate === 0).ivPct > at10.ivPct);
  check('شمار حل‌شده‌ها گزارش می‌شود', scan.solved === 3, `${scan.solved}`);

  // ═══ همان چیزی که دفتر کار اندازه گرفته بود ═══
  // قیمتی که با نرخ صفر بالای کف است ولی با نرخ بالا زیر کف می‌افتد.
  const low = ivByRate({ ...leg, price: bsPrice('call', 100000, 105000, T, 0, 0, 0.02) }, [0, 0.3]);
  const zero = low.rows.find((row) => row.rate === 0);
  const high = low.rows.find((row) => row.rate === 0.3);
  check('با نرخ صفر تلاطم حل می‌شود', zero.why === 'ok', zero.why);
  check('با نرخ بالا همان قیمت زیر کف نظری می‌افتد',
    high.why === 'belowFloor' && high.belowFloor === true, high.why);
  // بی کف، `belowFloor` فقط یک برچسب است و کاربر نمی‌داند چقدر کم آورده.
  check('کف نظریِ هر نرخ همراه ردیف می‌آید',
    high.floor > 0 && Number.isFinite(zero.floor), `${zero.floor} / ${high.floor}`);
  check('کف نظری با نرخ بالاتر، بالاتر است', high.floor > zero.floor);
  check('فاصله تا کف منفی است وقتی قیمت زیر کف است', high.gap < 0 && zero.gap >= 0);
  check('برچسب فارسی هر علت هست', high.whyLabel === RATE_WHY_LABEL.belowFloor);

  // ——— کرانِ اندازه‌گیری‌شده ———
  check('بالاترین نرخِ حل‌شونده پیدا می‌شود', highestSolvingRate(low) === 0, `${highestSolvingRate(low)}`);
  check('با همهٔ نرخ‌های حل‌شونده، بالاترینشان برمی‌گردد',
    highestSolvingRate(scan) === 0.3, `${highestSolvingRate(scan)}`);
  // «هیچ نرخی جواب نداد» با «نرخ سقف صفر است» یکی نیست.
  const none = ivByRate({ ...leg, price: 1e9 }, [0, 0.3]);
  check('وقتی هیچ نرخی جواب نمی‌دهد، کرانی ساخته نمی‌شود',
    Number.isNaN(highestSolvingRate(none)));
  check('قیمت بالای دامنه، علت خودش را دارد',
    none.rows.every((row) => row.why === 'aboveBand'));

  // ——— ورودی ناقص ———
  check('بی قیمت، هیچ ردیفی ساخته نمی‌شود',
    ivByRate({ ...leg, price: 0 }).rows.length === 0);
  check('پای سهم پایه تلاطم ضمنی ندارد',
    ivByRate({ ...leg, kind: 'underlying', price: 100 }).rows.length === 0);
  check('روز صفر یعنی سررسید — تلاطمی در کار نیست',
    ivByRate({ ...leg, days: 0, price: 100 }).rows.length === 0);

  // ——— جمله ———
  check('وقتی نرخ فعلی جواب می‌دهد، جمله علت دیگری را نشان می‌دهد',
    rateScanNote(scan, 0.1).includes('علت دیگری'));
  // این جمله باید محدودیتِ فروش استقراضی را بگوید، وگرنه کاربر
  // `belowFloor` را «تابلو غلط داده» می‌خواند.
  check('وقتی فقط نرخ پایین‌تر جواب می‌دهد، محدودیت فروش استقراضی گفته می‌شود',
    rateScanNote(low, 0.3).includes('فروش استقراضی'));
  check('وقتی هیچ نرخی جواب نمی‌دهد، صریح می‌گوید علتش نرخ نیست',
    rateScanNote(none, 0.3).includes('علتش نرخ نیست'));
  check('بی ردیف، جملهٔ خودش را دارد', rateScanNote({ rows: [], reason: 'x' }, 0.3) === 'x');

  // ——— قرارداد تب ———
  const src = readSrc('../ui/tabs/strategy.mjs');
  check('جدول نرخ فقط برای پاهای اختیار ساخته می‌شود',
    src.includes("leg.kind === 'call' || leg.kind === 'put'") && src.includes('ivByRate({'));
  check('نرخ فعلی به جدول داده می‌شود تا ردیفش علامت بخورد',
    src.includes('currentRate: s().rFree'));
  check('روز مانده از خود پا می‌آید، نه از سررسید نزدیک ترکیب',
    src.includes('days: Number.isFinite(leg.days) ? leg.days : r.days'));
}
