// ۱۹۵. مبنای بازده — مخرج نام دارد و بی‌صدا عوض نمی‌شود

import { check, group, near } from '../harness.mjs';
import {
  BASIS_REASONS, DEFAULT_RETURN_BASIS, RETURN_BASES,
  basisDenominator, basisMeta, normalizeBasis, notionalOf, returnOnBasis,
} from '../../core/portfolio-basis.mjs';
import { replayHistory } from '../../core/history.mjs';
import { defaults } from '../../core/settings.mjs';

group('۱۹۵. مبنای بازده');
{
  // ── خفه‌کن فروش واقعی، از خود موتور ────────────────────────────────
  // این چیدمان همان چیزی است که کاربر گزارش کرد: بازده زیر ۱۰۰− درصد.
  // ادعا این نیست که عدد غلط است؛ ادعا این است که عدد بدون نامِ مخرجش
  // بی‌معناست و روی مبناهای دیگر عدد دیگری است.
  const base195 = [
    { date: 20260801, close: 100, last: 100, low: 99, high: 101, vol: 1e6, value: 1e11 },
    { date: 20260802, close: 140, last: 140, low: 139, high: 141, vol: 1e6, value: 1e11 },
  ];
  const put195 = [
    { date: 20260801, close: 8, last: 8, low: 8, high: 8, vol: 1e5, value: 1e9 },
    { date: 20260802, close: 0.5, last: 0.5, low: 0.5, high: 0.5, vol: 1e5, value: 1e9 },
  ];
  const call195 = [
    { date: 20260801, close: 10, last: 10, low: 10, high: 10, vol: 1e5, value: 1e9 },
    { date: 20260802, close: 32, last: 32, low: 32, high: 32, vol: 1e5, value: 1e9 },
  ];
  const strangle195 = replayHistory({
    legs: [
      { ins: '11', name: 'پوت', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 90, expiry: 20260820 },
      { ins: '12', name: 'کال', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 110, expiry: 20260820 },
    ],
    baseIns: '1', startDate: 20260801, endDate: 20260802,
    entryBasis: 'CLOSE', exitBasis: 'CLOSE', units: 1,
    seriesByIns: { 1: base195, 11: put195, 12: call195 },
    fees: { buyStock: 0, sellStock: 0, option: 0, exercise: 0 },
    settings: defaults(),
  });
  check('پیش‌شرط: خفه‌کن فروش بازپخش می‌شود', strangle195.ok, strangle195.error || '');

  const entry195 = {
    marginGross: strangle195.entry.margin.margin,
    marginNet: strangle195.entry.margin.marginNet,
    netCash: strangle195.entry.netCash,
    capital: strangle195.entry.capital.value,
    notional: strangle195.entry.notional,
  };
  const pnl195 = strangle195.rows.at(-1).netPnl;
  check('زیان بازتولیدشده همان زیان گزارش‌شده است', pnl195 === -14500, String(pnl195));

  const net195 = returnOnBasis(pnl195, entry195, 'net');
  check('روی مبنای درگیر خالص، بازده همان ۱۴۵− درصد است',
    near(net195.pct, -145, 1e-9), String(net195.pct));
  check('عبور از ۱۰۰− پرچم می‌خورد، ولی عدد بریده نمی‌شود',
    net195.beyondBasis === true && net195.pct < -100);

  const gross195 = returnOnBasis(pnl195, entry195, 'gross');
  check('مبنای ناخالص، وجه تضمین پیش از کسر پریمیوم است',
    gross195.denominator === 28000, String(gross195.denominator));
  check('روی مبنای ناخالص همان زیان، ۵۱٫۷۹− درصد است',
    near(gross195.pct, -51.785714285714285, 1e-9), String(gross195.pct));
  check('روی مبنای ناخالص از ۱۰۰− رد نشده', gross195.beyondBasis === false);

  const cash195 = returnOnBasis(pnl195, entry195, 'cash');
  check('مبنای نقد، قدر مطلق پول جابه‌جاشدهٔ ورود است',
    cash195.denominator === 18000 && near(cash195.pct, -80.55555555555556, 1e-9), String(cash195.pct));

  const notional195 = returnOnBasis(pnl195, entry195, 'notional');
  check('ارزش اسمی از قیمت پایه و اندازهٔ قرارداد ساخته می‌شود',
    notional195.denominator === 200000, String(notional195.denominator));
  check('روی ارزش اسمی، همان زیان ۷٫۲۵− درصد است',
    near(notional195.pct, -7.25, 1e-9), String(notional195.pct));

  // ── خرید کال: وجه تضمین صفر، ولی پول درگیر صفر نیست ────────────────
  const long195 = replayHistory({
    legs: [{ ins: '12', name: 'کال', kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 110, expiry: 20260820 }],
    baseIns: '1', startDate: 20260801, endDate: 20260802,
    entryBasis: 'CLOSE', exitBasis: 'CLOSE', units: 1,
    seriesByIns: { 1: base195, 12: call195 },
    fees: { buyStock: 0, sellStock: 0, option: 0, exercise: 0 },
    settings: defaults(),
  });
  const longEntry195 = {
    marginGross: long195.entry.margin.margin, marginNet: long195.entry.margin.marginNet,
    netCash: long195.entry.netCash, capital: long195.entry.capital.value,
    notional: long195.entry.notional,
  };
  check('پیش‌شرط: خرید کال وجه تضمین ندارد', long195.entry.margin.margin === 0);
  check('مبنای ناخالص، بدهکار پرداختی را هم پول درگیر می‌شمارد',
    basisDenominator(longEntry195, 'gross').value === 10000,
    String(basisDenominator(longEntry195, 'gross').value));
  check('روی مبنای ناخالص، بدترین حالت خرید کال دقیقاً ۱۰۰− درصد است',
    near(returnOnBasis(-10000, longEntry195, 'gross').pct, -100, 1e-9));

  // ── مخرج نامعلوم، بازده نامعلوم می‌ماند ────────────────────────────
  const blank195 = returnOnBasis(-14500, { ...entry195, capital: null }, 'net');
  check('مخرج ثبت‌نشده بازده را نامعلوم می‌کند، نه صفر',
    blank195.pct === null && blank195.ok === false && blank195.why === BASIS_REASONS.missing);
  check('مخرج نامعلوم به مبنای دیگری نمی‌افتد', blank195.basisId === 'net');
  check('مخرج صفر، کسر نمی‌سازد',
    returnOnBasis(100, { ...entry195, capital: 0 }, 'net').why === BASIS_REASONS.nonPositive);
  check('سود و زیان نامعتبر، بازده نامعلوم می‌دهد',
    returnOnBasis(null, entry195, 'gross').why === BASIS_REASONS.noPnl);
  check('مبنای ناشناخته پذیرفته نمی‌شود',
    basisDenominator(entry195, 'خیالی').why === BASIS_REASONS.unknownBasis);

  // ── دام `Number(null) === 0` ───────────────────────────────────────
  for (const [label, value] of [['null', null], ['رشتهٔ خالی', ''], ['بولین', true], ['تعریف‌نشده', undefined]]) {
    check(`مخرجِ ${label} صفر یا یک شمرده نمی‌شود`,
      basisDenominator({ ...entry195, capital: value }, 'net').value === null);
  }

  // ── ارزش اسمی ──────────────────────────────────────────────────────
  check('ارزش اسمی از مجموع اندازهٔ کنترل‌شده ساخته می‌شود',
    notionalOf([{ ratio: 1, size: 1000 }, { ratio: 2, size: 1000 }], 100, 1) === 300000);
  check('ضریب تعداد در ارزش اسمی ضرب می‌شود',
    notionalOf([{ ratio: 1, size: 1000 }], 100, 3) === 300000);
  check('پای فروش هم اندازه‌اش شمرده می‌شود، نه منفی',
    notionalOf([{ ratio: -1, size: 1000 }], 100, 1) === 100000);
  check('اندازهٔ ثبت‌نشدهٔ یک پا، کل ارزش اسمی را نامعلوم می‌کند',
    notionalOf([{ ratio: 1, size: 1000 }, { ratio: 1, size: null }], 100, 1) === null);
  check('قیمت پایهٔ نامعلوم، ارزش اسمی نمی‌سازد',
    notionalOf([{ ratio: 1, size: 1000 }], null, 1) === null);
  check('فهرست پای خالی، ارزش اسمی صفر نمی‌سازد',
    notionalOf([], 100, 1) === null);

  // ── قرارداد ماژول ──────────────────────────────────────────────────
  check('پیش‌فرض، مبنای ناخالص است', DEFAULT_RETURN_BASIS === 'gross');
  check('هر چهار مبنا شناسه و برچسب و توضیح دارند',
    RETURN_BASES.length === 4 && RETURN_BASES.every((row) => row.id && row.label && row.hint));
  check('مبنای نامعتبر به پیش‌فرض برمی‌گردد', normalizeBasis('چرند') === DEFAULT_RETURN_BASIS);
  check('مبنای معتبر دست‌نخورده می‌ماند', normalizeBasis('cash') === 'cash');
  check('برچسب مبنا از خود ماژول می‌آید', basisMeta('notional').label === 'ارزش اسمی قرارداد');
  check('موتور تاریخ ارزش اسمی و قیمت پایه را در ورود ثبت می‌کند',
    strangle195.entry.notional === 200000 && strangle195.entry.spot === 100);
}
