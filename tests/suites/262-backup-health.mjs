// ۲۶۲. پشتیبان و بازیابی، و نمای سلامت داده
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import {
  BACKUP_PARTS, BACKUP_REASONS, BACKUP_VERSION,
  backupSummary, buildBackup, readBackup, restorePlan,
} from '../../core/backup-bundle.mjs';
import {
  ERROR_RATE_BAD_PCT, ERROR_RATE_WARN_PCT, healthRows, healthVerdict, healthTableHtml,
} from '../../ui/health-view.mjs';

group('۲۶۲. پشتیبان و بازیابی');
{
  check('نسخهٔ پشتیبان اعلام شده', BACKUP_VERSION === 1);
  check('هر بخش برچسب فارسی و نوع دارد',
    BACKUP_PARTS.every((part) => part.label.length > 2 && (part.kind === 'list' || part.kind === 'object')));

  const bundle = buildBackup({
    settings: { rFree: 0.3 },
    positions: [{ id: 'p1' }, { id: 'p2' }],
    watchRules: [{ id: 'w1' }],
    backtestRuns: [],
    preferences: {},
    at: 1000,
  });
  check('بخش‌های پُر در بسته می‌نشینند',
    bundle.positions.length === 2 && bundle.watchRules.length === 1);
  // بستهٔ حاوی فهرست خالی، در بازیابی مقصد را پاک می‌کند.
  check('فهرست خالی اصلاً وارد بسته نمی‌شود', bundle.backtestRuns === undefined);
  check('شیء خالی هم وارد نمی‌شود', bundle.preferences === undefined);
  check('زمان ساخت ثبت می‌شود', bundle.at === 1000 && bundle.version === 1);

  const sum = backupSummary(bundle);
  check('خلاصه فقط بخش‌های موجود را می‌شمارد',
    sum.parts.map((part) => part.key).join(',') === 'settings,positions,watchRules',
    sum.parts.map((p) => p.key).join(','));
  check('شمار هر بخش درست است',
    sum.parts.find((part) => part.key === 'positions').count === 2);
  check('تنظیمات بر مبنای شمار کلید شمرده می‌شود',
    sum.parts.find((part) => part.key === 'settings').count === 1);

  // ——— خواندن ———
  const good = readBackup(bundle);
  check('بستهٔ سالم پذیرفته می‌شود', good.ok === true, good.why);
  check('و خودِ بسته همراهش برمی‌گردد', good.bundle === bundle);
  check('فایلی که شیء نیست رد می‌شود',
    readBackup([1, 2]).why === BACKUP_REASONS.notObject && readBackup(null).why === BACKUP_REASONS.notObject);
  check('بی نسخه رد می‌شود', readBackup({ positions: [] }).why === BACKUP_REASONS.noVersion);
  // بسته‌ای از ساختِ آینده می‌تواند میدان‌هایی داشته باشد که این ساخت غلط
  // می‌خواند، و نتیجه‌اش دادهٔ خرابِ بی‌صداست.
  check('نسخهٔ ناشناخته رد می‌شود — سخت‌گیری عمدی',
    readBackup({ version: 99, positions: [{}] }).why === BACKUP_REASONS.badVersion);
  check('بستهٔ بی‌بخش رد می‌شود', readBackup({ version: 1 }).why === BACKUP_REASONS.empty);

  // ——— نقشهٔ بازیابی ———
  const plan = restorePlan(bundle, { positions: [{ id: 'x' }], settings: { rFree: 0.1, divYield: 0 } });
  check('نقشه فقط بخش‌های موجودِ بسته را دارد', plan.length === 3);
  // جملهٔ تأیید باید عددِ واقعی بگوید، نه «مطمئنی؟».
  check('نقشه می‌گوید چه می‌رود و چه می‌آید',
    plan.find((row) => row.key === 'positions').from === 1
    && plan.find((row) => row.key === 'positions').to === 2);
  check('بخشی که در مقصد نیست، صفر شمرده می‌شود — نه نامعلوم',
    plan.find((row) => row.key === 'watchRules').from === 0);
  check('نقشه چیزی را عوض نمی‌کند',
    bundle.positions.length === 2 && plan !== bundle);
}

group('۲۶۲. نمای سلامت داده');
{
  const raw = [
    { family: 'ClosingPrice', requests: 10000, errors: 10, cacheHits: 5000 },
    { family: 'Trade', requests: 10, errors: 10, cacheHits: 0 },
    { family: 'Instrument', requests: 0, errors: 0, cacheHits: 0 },
  ];
  const rows = healthRows(raw);
  check('نرخ خطا از شمار درخواست ساخته می‌شود', near(rows[0].errorPct, 0.1));
  check('سرویس بی‌درخواست نرخ نمی‌گیرد — تقسیم بر صفر، صفر نیست',
    Number.isNaN(rows[2].errorPct) && Number.isNaN(rows[2].cachePct));
  check('نرخ کش از مجموع درخواست و اصابت می‌آید', near(rows[0].cachePct, 33.3333, 1e-3));
  // شمارِ تنها، سرویسِ سالمِ پرمصرف و سرویسِ خرابِ کم‌مصرف را یک‌شکل نشان
  // می‌دهد؛ هر دو ده خطا دارند.
  check('سرویس پرمصرفِ سالم تُنِ خطر نمی‌گیرد', rows[0].tone === '');
  check('سرویس کم‌مصرفِ خراب تُنِ خطر می‌گیرد', rows[1].tone === 'loss');
  check('آستانه‌ها با نام تعریف شده‌اند',
    ERROR_RATE_WARN_PCT < ERROR_RATE_BAD_PCT && ERROR_RATE_BAD_PCT <= 100);

  const verdict = healthVerdict(rows);
  check('جمع کل درخواست‌ها و خطاها ساخته می‌شود',
    verdict.requests === 10010 && verdict.errors === 20);
  check('بدترین سرویس بر مبنای نرخ انتخاب می‌شود، نه شمار',
    verdict.worst.family === 'Trade', verdict.worst?.family);
  // یک خطا از یک درخواست، صد درصد است ولی خبر نیست.
  const tiny = healthVerdict(healthRows([{ family: 'X', requests: 1, errors: 1, cacheHits: 0 }]));
  check('سرویسِ کم‌نمونه بدترین اعلام نمی‌شود', tiny.worst === null);
  check('بی خطا، بدترینی هم نیست',
    healthVerdict(healthRows([{ family: 'Y', requests: 100, errors: 0, cacheHits: 0 }])).worst === null);

  const html = healthTableHtml(raw);
  check('جدول، نرخ خطا را ستون دارد', html.includes('نرخ خطا'));
  check('و می‌گوید شمارنده‌ها با راه‌اندازی دوباره صفر می‌شوند',
    html.includes('راه‌اندازی دوباره صفر'));
  check('بی هیچ درخواستی، جدول جای خالی نمی‌گذارد',
    healthTableHtml([]).includes('هنوز هیچ درخواستی'));

  const logs = readSrc('../ui/tabs/logs.mjs');
  check('دفتر خطاها سلامت را جدا می‌گیرد',
    logs.includes("fetch('/api/health')") && logs.includes('healthTableHtml(health.byEndpoint)'));
  check('و نگرفتنش را پنهان نمی‌کند', logs.includes('وضعیت سلامت گرفته نشد'));
}
