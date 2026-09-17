// ۲۶۱. بایگانی اجراهای آزمایشگاه و مقایسهٔ دو اجرا
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import {
  BACKTEST_RUN_VERSION, RUN_CAP, RUN_HEADLINE, RUN_SETTINGS,
  addRun, compareRuns, makeRunRecord, runLabel, settingsDiff,
} from '../../core/backtest-runs.mjs';

group('۲۶۱. بایگانی اجراهای آزمایشگاه');
{
  const replay = (patch = {}) => ({
    summary: {
      validDays: 40, missingDays: 3, maxDrawdown: -250000, positivePct: 62.5,
      profitFactor: 1.8, capital: 9.5e7,
      last: { netPnl: 1.2e6, returnPct: 12.6 },
      ...patch,
    },
  });
  const base = {
    id: 'r1', at: 1000, uaName: 'اهرم', comboName: '+۱ کال ۲۰۰۰۰', strategyName: 'بول کال',
    from: 20260601, to: 20260901, entryBasis: 'CLOSE', exitBasis: 'CLOSE', units: 2,
    settings: { rFree: 0.3, divYield: 0, dayCountYear: 365, feeOption: 0.00103, capitalMode: 'NET', extra: 'بی‌ربط' },
  };

  check('نسخهٔ قرارداد اعلام شده', BACKTEST_RUN_VERSION === 1);
  const rec = makeRunRecord({ ...base, replay: replay() });
  check('رکورد ساخته می‌شود', rec !== null);
  check('سرخط از خلاصهٔ همان اجرا می‌آید',
    near(rec.headline.netPnl, 1.2e6) && near(rec.headline.positivePct, 62.5));
  check('روز معتبر و روز بی‌داده هر دو ثبت می‌شوند',
    rec.headline.validDays === 40 && rec.headline.missingDays === 3);
  // اجرایی که تنظیمش را نگه ندارد، در مقایسه دروغ می‌گوید.
  check('تنظیم‌های مؤثر همراه اجرا ذخیره می‌شوند', rec.settings.rFree === 0.3);
  check('و تنظیمِ بی‌ربط ذخیره نمی‌شود', rec.settings.extra === undefined);
  check('بازه و مبنا ثبت می‌شوند',
    rec.from === 20260601 && rec.to === 20260901 && rec.entryBasis === 'CLOSE');
  // مسیر روزانه هزاران ردیف است و دو نسخه از یک حقیقت می‌سازد.
  check('مسیر روزانه ذخیره نمی‌شود', rec.rows === undefined && rec.replay === undefined);

  // رکوردِ نصفه ساخته نمی‌شود.
  check('اجرای بی‌روزِ معتبر بایگانی نمی‌شود',
    makeRunRecord({ ...base, replay: replay({ validDays: 0 }) }) === null);
  check('بی اجرا هم رکوردی ساخته نمی‌شود', makeRunRecord({ ...base, replay: null }) === null);

  // ——— بایگانی ———
  let list = addRun([], rec);
  list = addRun(list, makeRunRecord({ ...base, id: 'r2', replay: replay() }));
  check('تازه‌ترین اول می‌نشیند', list[0].id === 'r2' && list.length === 2);
  list = addRun(list, makeRunRecord({ ...base, id: 'r1', note: 'دوباره', replay: replay() }));
  check('رکورد هم‌شناسه جایگزین می‌شود، نه تکرار',
    list.length === 2 && list[0].id === 'r1' && list[0].note === 'دوباره');
  let many = [];
  for (let i = 0; i < RUN_CAP + 5; i += 1) {
    many = addRun(many, makeRunRecord({ ...base, id: `x${i}`, replay: replay() }));
  }
  check('بایگانی سقف دارد و تازه‌ها می‌مانند',
    many.length === RUN_CAP && many[0].id === `x${RUN_CAP + 4}`);
  check('رکورد بی‌شناسه بایگانی را دست نمی‌زند', addRun(list, null).length === list.length);

  // ——— تفاوت تنظیم ———
  const other = makeRunRecord({
    ...base, id: 'r3', replay: replay({ last: { netPnl: 2.4e6, returnPct: 25 } }),
    settings: { ...base.settings, rFree: 0 },
  });
  const diff = settingsDiff(rec, other);
  check('تنها تنظیمِ متفاوت گزارش می‌شود',
    diff.length === 1 && diff[0].key === 'rFree', diff.map((one) => one.key).join(','));
  check('و هر دو مقدار همراهش می‌آیند', diff[0].left === 0.3 && diff[0].right === 0);
  check('تنظیم یکسان در تفاوت نمی‌آید', settingsDiff(rec, rec).length === 0);

  // ——— مقایسه ———
  const cmp = compareRuns(rec, other);
  check('سرخطِ هر دو کنار هم می‌آید', cmp.rows.length === RUN_HEADLINE.length);
  check('تفاوت عددی ساخته می‌شود', near(cmp.rows[0].delta, 1.2e6));
  check('تفاوت تنظیم همراه مقایسه می‌رود', cmp.diff.length === 1);
  check('یکی‌بودن بازه و ترکیب اعلام می‌شود', cmp.sameRange === true && cmp.sameCombo === true);
  // اگر هیچ تنظیمی فرق نداشته باشد و عددها فرق کنند، یعنی داده یا بازه
  // عوض شده — و آن خودش خبر است.
  check('دو اجرای هم‌تنظیم صریحاً «هم‌تنظیم» علامت می‌خورند',
    compareRuns(rec, makeRunRecord({ ...base, id: 'r4', replay: replay() })).same === true);
  check('با یک اجرا مقایسه‌ای ساخته نمی‌شود',
    compareRuns(rec, null).rows.length === 0 && compareRuns(rec, null).reason.length > 0);
  // عددِ نبوده تفاوتِ ساختگی نمی‌سازد.
  const blind = compareRuns(rec, makeRunRecord({
    ...base, id: 'r5', replay: replay({ profitFactor: NaN }),
  }));
  check('سنجهٔ نبوده تفاوتِ صفر نمی‌سازد',
    Number.isNaN(blind.rows.find((row) => row.key === 'profitFactor').delta));

  check('برچسب اجرا از نماد و ساختار می‌آید', runLabel(rec).includes('اهرم'));
  check('اجرای نبوده برچسب «—» می‌گیرد', runLabel(null) === '—');
  check('هر تنظیمِ مؤثر برچسب فارسی دارد', RUN_SETTINGS.every((item) => item.label.length > 2));

  // ——— قرارداد تب ———
  const src = readSrc('../ui/tabs/backtest.mjs');
  check('بایگانی، رکوردِ نصفه نمی‌سازد و علتش را می‌گوید',
    src.includes('if (!record)') && src.includes('روز معتبر نداری که بایگانی شود'));
  check('تنظیم‌های همان لحظه همراه رکورد می‌روند', src.includes('settings: state.settings'));
  check('نبودِ حافظهٔ مرورگر پنهان نمی‌شود', src.includes('حافظهٔ مرورگر در دسترس نیست'));
}
