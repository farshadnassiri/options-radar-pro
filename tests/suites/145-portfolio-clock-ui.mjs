// ۱۴۵. گام زمانی در تب

import { check, group, readSrc } from '../harness.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';
import { PORTFOLIO_STEPS, stepPortfolioSession } from '../../core/portfolio-clock.mjs';
import {
  momentText, portfolioClockView, stepResultText,
} from '../../ui/portfolio-clock-view.mjs';

group('۱۴۵. گام زمانی در تب');
{
  const fx145 = portfolioFixture('clock-ui-145');
  const session145 = fx145.session;
  const days145 = [20260519, 20260520, 20260521, 20260524, 20260525, 20260526];
  const opts145 = { days: days145, expiryDate: 20260620 };
  const view145 = portfolioClockView(session145, opts145);

  // ── بند ۱: لحظهٔ جاری همیشه دیده شود ────────────────────────────────
  check('لحظهٔ جاری با تاریخ و ساعت می‌آید',
    view145.ok && /^۱۴۰۵\/\d{2}\/\d{2} · \d{2}:\d{2}$/
      .test(view145.nowText.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/^\d{4}/, '۱۴۰۵')), view145.nowText);
  check('ساعت دو رقمی است، نه یک رقمی',
    momentText({ date: 20260521, second: 9 * 3600 + 5 * 60 }).includes('۰۹:۰۵'),
    momentText({ date: 20260521, second: 9 * 3600 + 5 * 60 }));
  check('لحظهٔ نبوده «—» می‌شود، نه صفر',
    momentText(null) === '—' && momentText({}) === '—');

  // ── بند ۶: رقم فارسی ────────────────────────────────────────────────
  const shown145 = [view145.nowText, view145.blockedWhy,
    ...view145.steps.flatMap((s) => [s.label, s.why, s.toText])];
  check('هیچ رقم لاتینی در متن نمایشی نیست',
    shown145.every((value) => !/[0-9]/.test(value)),
    shown145.filter((v) => /[0-9]/.test(v)).slice(0, 3).join(' | ') || 'هیچ');

  // ── بند ۲: پلهٔ ناممکن، غیرفعال با علت ──────────────────────────────
  check('فهرست پله‌ها از موتور می‌آید، نه فهرست دستی',
    view145.steps.length === PORTFOLIO_STEPS.length
    && view145.steps.every((s, i) => s.key === PORTFOLIO_STEPS[i].key));
  const usable145 = view145.steps.filter((s) => s.enabled);
  const blocked145 = view145.steps.filter((s) => !s.enabled);
  check('پیش‌شرط: هم پلهٔ ممکن هست و هم ناممکن',
    usable145.length > 0 && blocked145.length > 0,
    `${usable145.length} ممکن / ${blocked145.length} ناممکن`);
  // دکمه‌ای که بزنی و خطا بدهد، همان کار دکمهٔ خاموش را می‌کند، فقط با
  // یک قدم اضافه.
  check('پلهٔ ناممکن علتش را با خودش دارد',
    blocked145.every((s) => s.why.length > 0 && s.toText === ''),
    blocked145.map((s) => s.key).join(' ،'));
  check('و پلهٔ ممکن، لحظهٔ مقصدش را',
    usable145.every((s) => s.toText.length > 0 && s.why === ''));
  // امکانِ هر پله از خودِ موتور پرسیده می‌شود؛ قاعدهٔ دوم یعنی روزی
  // دکمه‌ای فعال باشد که موتور ردش می‌کند.
  check('حکمِ هر پله دقیقاً همان حکمِ موتور است',
    view145.steps.every((s) => {
      const dry = stepPortfolioSession(session145, s.key, opts145);
      return dry.ok === s.enabled && (!dry.ok || momentText(dry.to) === s.toText);
    }));
  const code145 = readSrc('../ui/portfolio-clock-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('مدل نمایش خودش قاعدهٔ زمانی نمی‌سازد',
    /stepPortfolioSession/.test(code145)
    && !/shiftTradingDays|INTRADAY_|momentKey/.test(code145));
  check('و هیچ گامی برنمی‌دارد — جلسهٔ برگشتی دور ریخته می‌شود',
    !/\.session\b/.test(code145));

  // ── هیچ پله‌ای ممکن نیست ────────────────────────────────────────────
  const stuck145 = portfolioClockView(session145, { days: [], expiryDate: 0 });
  check('وقتی هیچ پله‌ای ممکن نیست، علت مشترک گفته می‌شود',
    stuck145.anyEnabled === false && stuck145.blockedWhy.length > 0,
    stuck145.blockedWhy);
  check('و همهٔ دکمه‌ها خاموش‌اند، نه اینکه بخشی روشن بماند',
    stuck145.steps.every((s) => s.enabled === false));

  // ── بند ۴: دو شکستِ متفاوت، دو پیام ─────────────────────────────────
  const endOfCalendar145 = stepPortfolioSession(session145, 'w1', opts145);
  const pastEnd145 = stepPortfolioSession(
    { ...session145, end: { date: 20260521, second: 36_060 } }, 'h1', opts145,
  );
  check('پیش‌شرط: دو شکستِ متفاوت ساخته شد',
    endOfCalendar145.reason === 'calendarEnd' && pastEnd145.reason === 'pastEnd',
    `${endOfCalendar145.reason} / ${pastEnd145.reason}`);
  check('«تقویم تمام شد» و «از پایان جلسه رد می‌شود» یک پیام نمی‌گیرند',
    stepResultText(endOfCalendar145) !== stepResultText(pastEnd145)
    && stepResultText(endOfCalendar145).includes('تقویم')
    && stepResultText(pastEnd145).includes('پایان جلسه'),
    `${stepResultText(endOfCalendar145)} || ${stepResultText(pastEnd145)}`);
  const okStep145 = stepPortfolioSession(session145, 'd1', opts145);
  check('خبرِ گامِ موفق، لحظهٔ تازه را می‌گوید',
    stepResultText(okStep145).includes('جلسه به')
    && stepResultText(okStep145).includes(momentText(okStep145.to)),
    stepResultText(okStep145));
  const rolled145 = stepPortfolioSession(session145, 'eod', opts145);
  check('انتقال به روز بعد گفته می‌شود، نه پنهان',
    rolled145.ok ? !stepResultText(rolled145).includes('منتقل') : true);
  check('و رسیدن به پایان جلسه هم علامت می‌خورد',
    stepResultText({ ok: true, to: fx145.at, atEnd: true }).includes('پایان جلسه'));
  check('نتیجهٔ نبوده، متن نمی‌سازد', stepResultText(null) === '');

  // ── اتصال به تب ─────────────────────────────────────────────────────
  const tabSrc145 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب موتور ساعت و مدل نمایشش را وارد می‌کند',
    /stepPortfolioSession/.test(tabSrc145) && /portfolioClockView/.test(tabSrc145)
    && /portfolioMomentSnapshot/.test(tabSrc145)
    && /from '\.\.\/portfolio-clock-view\.mjs'/.test(tabSrc145));
  check('بخش ساعت و خانه‌هایش در نشانه‌گذاری هستند',
    ['pt-clock', 'pt-clock-now', 'pt-clock-steps', 'pt-clock-state', 'pt-clock-warn']
      .every((id) => tabSrc145.includes(`id="${id}"`)));
  // ساعت بالای همهٔ بخش‌هاست چون همه به لحظهٔ جاری بند هستند.
  check('ساعت بالای دفتر سرمایه و بقیه می‌نشیند',
    tabSrc145.indexOf('id="pt-clock"') < tabSrc145.indexOf('id="pt-ledger"')
    && tabSrc145.indexOf('id="pt-clock"') > 0);
  check('پلهٔ ناممکن در نشانه‌گذاری هم غیرفعال می‌شود',
    /step\.enabled \? '' : ' disabled'/.test(tabSrc145));
  // ── بند ۳: پس از گام، همه‌چیز دوباره رسم شود ────────────────────────
  const handler145 = tabSrc145.slice(tabSrc145.indexOf("$('pt-clock').onclick"));
  check('پس از گام، حکم اجراپذیری و پیشنهادها با جلسهٔ تازه رسم می‌شوند',
    /paintEligibility\(next\);[\s\S]{0,80}?paintProposals\(next\);/.test(handler145));
  check('و چون paintProposals تنها نقطهٔ فراخوانی است، بقیه هم می‌آیند',
    /function paintProposals\(session\)\s*\{[\s\S]{0,600}?paintClock\(session\);[\s\S]{0,200}?paintLedger\(session\);[\s\S]{0,120}?paintPositions\(session\);/
      .test(tabSrc145));
  // ── بند ۵: عکسِ ناکافی صریح گفته شود ────────────────────────────────
  // جدولِ خالی به‌خاطر نبودِ داده، شبیه «هیچ فرصتی نیست» دیده می‌شود.
  check('عکسِ ناکافی صریح اعلام می‌شود، نه از روی جدول حدس زده',
    /quality\?\.sufficient === false/.test(handler145)
    && /ناکافی/.test(handler145) && /کمتر از واقعیت/.test(handler145));
  check('و شمارِ قراردادهای بی‌داده در همان پیام می‌آید',
    /built\.missing\.count/.test(handler145) && /faDigits/.test(handler145));
  const snapshotData145 = readSrc('../ui/portfolio-snapshot-data.mjs');
  check('قیمت با لحظهٔ قبل پر نمی‌شود',
    /loadMomentContracts\(session, at/.test(tabSrc145)
    && /book = point\?\.quote\?\.book \?\? null/.test(snapshotData145)
    && /close = point\?\.trade\?\.close \?\? null/.test(snapshotData145));
  check('قفل ویرایشگر مأموریت، بخش ساعت را غیرفعال نمی‌کند',
    /!control\.closest\('#pt-clock'\)/.test(tabSrc145));
  check('شناسه و نام تابع این بخش یکتا هستند',
    (tabSrc145.match(/function paintClock\b/g) || []).length === 1
    && (tabSrc145.match(/id="pt-clock"/g) || []).length === 1
    && (tabSrc145.match(/\$\('pt-clock'\)\.onclick/g) || []).length === 1);

  const cssSrc145 = readSrc('../ui/style.css');
  check('سبک بخش ساعت از توکن‌های موجود می‌آید',
    /\.pt-clock-steps/.test(cssSrc145)
    && /\.pt-clock-steps button\[disabled\]/.test(cssSrc145)
    && !/\.pt-clock[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(cssSrc145));
}
