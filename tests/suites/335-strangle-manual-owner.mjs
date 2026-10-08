// ۳۳۵. استرانگل بازی: قیمت انتخابی مالِ یک قرارداد است (۱۴۰۵/۰۷/۱۶)
//
// «در قسمت استرانگل بازی قیمت انتخابی با تغییر نماد ثابت می‌ماند… آزمایش
// اجرا نشد: قیمت انتخابی کال (۴۸۹۰) بیرون از دامنهٔ معاملات همان روز (۴۳ تا
// ۶۹) است.» پیش‌پرکردن فقط فیلدِ خالی را پر می‌کرد؛ عددِ قراردادِ نمادِ
// قبلی روی قراردادِ نمادِ تازه می‌ماند.

import { check, group, readSrc } from '../harness.mjs';
import { manualOwnerKey, syncManualPrices } from '../../core/strangle-lab.mjs';

// روزهای بازار هم‌شکلِ `market.days`: هر سمت، قیمت اعمال → قیمت
const marketA = [{ date: 20260801, call: { 50000: 4890 }, put: { 40000: 1200 } }, { date: 20260910, call: { 50000: 5100 }, put: { 40000: 900 } }];
const marketB = [{ date: 20260801, call: { 700: 56 }, put: { 500: 12 } }, { date: 20260910, call: { 700: 61 }, put: { 500: 9 } }];
const manualCfg = () => ({ entryBasis: 'manual', exitBasis: 'close', manualEntryCall: 0, manualEntryPut: 0, manualExitCall: 0, manualExitPut: 0 });

group('۳۳۵. صاحبِ قیمت انتخابی');
{
  const d = { uaIns: 'A', expiry: 20260920, entry: { call: 50000, put: 40000 } };
  check('صاحب: نماد، سررسید، سمت، قیمت اعمال و روز', manualOwnerKey(d, 'call', 20260801) === 'A|20260920|call|50000|20260801');
  check('سمتِ بی قیمت اعمال، صاحبِ «بی‌قرارداد» دارد', manualOwnerKey({ uaIns: 'A', entry: { call: null } }, 'call', 1) === 'A|0|call||1');
  check('نمادِ دیگر، صاحبِ دیگر', manualOwnerKey({ ...d, uaIns: 'B' }, 'call', 20260801) !== manualOwnerKey(d, 'call', 20260801));
}

group('۳۳۵. عوض‌شدنِ نماد، عددِ قبلی را نمی‌گذارد');
{
  const d = { uaIns: 'A', expiry: 20260920, entry: { call: 50000, put: 40000 }, cfg: manualCfg() };
  syncManualPrices(d, marketA);
  check('بارِ اول از پایانیِ قراردادِ ورود پر می‌شود', d.cfg.manualEntryCall === 4890 && d.cfg.manualEntryPut === 1200);
  check('مبنای خروجِ غیرِانتخابی پر نمی‌شود', d.cfg.manualExitCall === 0);

  // همان سناریوی گزارش: نماد عوض می‌شود و قیمت‌اعمال‌های تازه برگزیده می‌شوند.
  d.uaIns = 'B'; d.expiry = 20260925; d.entry = { call: 700, put: 500 };
  syncManualPrices(d, marketB);
  check('۴۸۹۰ِ نمادِ قبلی روی کالِ نمادِ تازه نمی‌ماند؛ از پایانیِ همان قرارداد پر می‌شود',
    d.cfg.manualEntryCall === 56 && d.cfg.manualEntryPut === 12);

  // تا قیمت اعمالِ تازه برگزیده نشده، عددِ قبلی هم نمی‌ماند (خالی صادق است).
  const e = { uaIns: 'A', expiry: 20260920, entry: { call: 50000, put: 40000 }, cfg: manualCfg() };
  syncManualPrices(e, marketA);
  e.uaIns = 'B'; e.entry = { call: null, put: null };
  syncManualPrices(e, marketB);
  check('نمادِ تازه بی قیمت اعمال: فیلد خالی می‌شود، نه عددِ قبلی', e.cfg.manualEntryCall === 0 && e.cfg.manualEntryPut === 0);

  // قیمت اعمالِ ناموجود در بازارِ تازه عددی نمی‌سازد.
  const f = { uaIns: 'A', expiry: 1, entry: { call: 50000, put: 40000 }, cfg: manualCfg() };
  syncManualPrices(f, marketA); f.uaIns = 'B';
  syncManualPrices(f, marketB);
  check('قیمت اعمالِ قدیمی که در نمادِ تازه نیست، صفر می‌ماند — نه ۴۸۹۰', f.cfg.manualEntryCall === 0);
}

group('۳۳۵. عددِ خودِ کاربر برای همان قرارداد می‌ماند');
{
  const d = { uaIns: 'A', expiry: 20260920, entry: { call: 50000, put: 40000 }, cfg: manualCfg() };
  syncManualPrices(d, marketA);
  d.cfg.manualEntryCall = 4700; // کاربر نوشت
  syncManualPrices(d, marketA);
  check('بی تغییرِ قرارداد، عددِ نوشته‌شده دست نمی‌خورد', d.cfg.manualEntryCall === 4700);
  d.entry = { ...d.entry, call: 52000 };
  syncManualPrices(d, [{ date: 20260801, call: { 52000: 3900 }, put: { 40000: 1200 } }, marketA[1]]);
  check('قیمت اعمالِ همان سمت که عوض شد، عدد هم عوض می‌شود', d.cfg.manualEntryCall === 3900 && d.cfg.manualEntryPut === 1200);

  // پیش‌نویسِ ساخته‌شده از آزمایشِ ذخیره‌شده: صاحبِ قبلی ثبت نیست.
  const saved = { uaIns: 'A', expiry: 20260920, entry: { call: 50000, put: 40000 }, cfg: { ...manualCfg(), manualEntryCall: 4750 } };
  syncManualPrices(saved, marketA);
  check('بازتنظیمِ آزمایشِ ذخیره‌شده عددِ ذخیره‌شده را پاک نمی‌کند', saved.cfg.manualEntryCall === 4750);
}

group('۳۳۵. سیم‌کشی');
{
  const ui = readSrc('../ui/tabs/strangle-lab.mjs');
  check('هر نقاشیِ گامِ تنظیم با قرارداد هم‌گام می‌شود', /const d = draft;\s*syncManual\(d\);\s*const cfg = labConfig\(d\.cfg\);/.test(ui));
  check('شروعِ آزمایش هم پیش از ساختن هم‌گام می‌کند', /d\.cfg = readRules\(main, d\.cfg\);\s*syncManual\(d\);/.test(ui));
  check('هم‌گامی همان تابعِ هسته است', ui.includes('function syncManual(d) { syncManualPrices(d, market?.days || []); }'));
}
