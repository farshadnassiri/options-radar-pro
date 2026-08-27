// ۱۴۲. گام زمانی جلسه

import { check, group, readSrc } from '../harness.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';
import { momentKey } from '../../core/trading-calendar.mjs';
import {
  PORTFOLIO_CLOCK_VERSION, PORTFOLIO_STEPS, stepPortfolioSession,
} from '../../core/portfolio-clock.mjs';

group('۱۴۲. گام زمانی جلسه');
{
  const fx142 = portfolioFixture('clock-142');
  const session142 = fx142.session;
  // تقویمِ آزمون عمداً ۲۲ و ۲۳ خرداد را ندارد: روزِ بی‌داده باید پرش
  // شود، نه اینکه با روز قبل پر شود.
  const days142 = [20260519, 20260520, 20260521, 20260524, 20260525, 20260526, 20260620];
  const opts142 = { days: days142, expiryDate: 20260620 };
  const nowKey142 = momentKey(session142.now);

  // ── بند ۱: فقط به جلو ───────────────────────────────────────────────
  const m15 = stepPortfolioSession(session142, 'm15', opts142);
  check('پلهٔ ۱۵ دقیقه جلو می‌رود',
    m15.ok && m15.version === PORTFOLIO_CLOCK_VERSION
    && momentKey(m15.to) > nowKey142
    && m15.to.second === session142.now.second + 15 * 60, m15.why);
  check('و لحظهٔ پیشین را هم گزارش می‌کند',
    momentKey(m15.from) === nowKey142);
  const chain142 = stepPortfolioSession(m15.session, 'm15', opts142);
  check('گام بعدی از لحظهٔ تازه حساب می‌کند، نه از شروع',
    chain142.ok && momentKey(chain142.to) > momentKey(m15.to), chain142.why);
  // ساعتی که بتواند بایستد یا برگردد، ارزش‌گذاری و مدرک را ناهم‌زمان
  // می‌کند بی‌آنکه کسی بفهمد.
  const zero142 = stepPortfolioSession(session142, { key: 'zero', seconds: 0 }, opts142);
  check('پلهٔ صفر، «به جلو» نیست و رد می‌شود',
    !zero142.ok && zero142.reason === 'backwards', zero142.why);

  // ── بند ۳: روزِ بی‌داده پرش می‌شود ──────────────────────────────────
  const d1 = stepPortfolioSession(session142, 'd1', opts142);
  check('پیش‌شرط: روز بعدیِ تقویمی، فردای تقویمی نیست',
    days142.includes(20260521) && !days142.includes(20260522)
    && days142.includes(20260524));
  check('گام روزانه از روزِ بی‌داده می‌پرد',
    d1.ok && d1.to.date === 20260524, `${d1.to?.date} | ${d1.why}`);
  check('و هرگز روی روزی که تقویم ندارد نمی‌نشیند',
    days142.includes(d1.to.date));
  check('ساعتِ روز حفظ می‌شود، نه بازنشانی بی‌دلیل',
    d1.to.second === session142.now.second);

  // ── بند ۲: پایان جلسه مرز است ───────────────────────────────────────
  const w1 = stepPortfolioSession(session142, 'w1', opts142);
  check('گامی که تقویمش تمام شود، رد می‌شود نه کوتاه',
    !w1.ok && w1.reason === 'calendarEnd' && w1.atEnd === true
    && w1.session === null, w1.why);
  const expiry142 = stepPortfolioSession(session142, 'expiry', opts142);
  check('گامی که از پایان جلسه رد شود، انجام نمی‌شود',
    !expiry142.ok && expiry142.reason === 'pastEnd' && expiry142.session === null,
    `${expiry142.reason} | ${JSON.stringify(expiry142.to)}`);
  // کوتاه‌کردنِ بی‌صدا یعنی کاربر فکر می‌کند تا سررسید رفته و نرفته.
  check('و لحظهٔ ردشده گزارش می‌شود تا معلوم باشد چقدر رد شد',
    momentKey(expiry142.to) > momentKey(session142.end));
  const short142 = { ...session142, end: { date: 20260521, second: 36 * 100 } };
  check('جلسه‌ای که پایانش گذشته، هیچ گامی نمی‌گیرد',
    stepPortfolioSession(short142, 'm15', opts142).reason === 'pastEnd');
  // رسیدن دقیق به پایان، «رد شدن» نیست.
  const atEnd142 = { ...session142, end: { date: 20260521, second: 36000 + 15 * 60 } };
  const exact142 = stepPortfolioSession(atEnd142, 'm15', opts142);
  check('گامی که دقیقاً روی پایان بنشیند، انجام می‌شود و علامت می‌خورد',
    exact142.ok && exact142.atEnd === true, exact142.why);

  // ── بند ۴: جلسهٔ تازه، ورودی دست‌نخورده ─────────────────────────────
  check('جلسهٔ تازه برمی‌گردد و ورودی دست نمی‌خورد',
    m15.session !== session142
    && momentKey(session142.now) === nowKey142
    && momentKey(m15.session.now) === momentKey(m15.to));

  // ── بند ۵: دفتر رویداد دست نمی‌خورد ─────────────────────────────────
  // گام تراکنش نیست. رونوشتِ دفتر هم ساخته نمی‌شود، چون رونوشت روزی
  // ممکن است واگرا شود.
  check('دفتر رویداد همان دفتر می‌ماند',
    m15.session.events === session142.events
    && m15.session.counters === session142.counters);
  const code142 = readSrc('../core/portfolio-clock.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('و ماژول اصلاً تراکنش نمی‌سازد',
    !/recordPortfolioTransaction|events\.push|transactionKind/.test(code142));
  check('قواعد تقویم دوباره نوشته نشده‌اند',
    /stepMoment/.test(code142)
    && !/INTRADAY_END_SECOND\s*=|shiftTradingDays\s*\(days,\s*start/.test(code142));

  // ── بند ۶: علت‌های جدا ──────────────────────────────────────────────
  check('جلسهٔ نبوده، علت خودش را دارد',
    stepPortfolioSession(null, 'm15', opts142).reason === 'noSession');
  check('جلسهٔ غیرفعال گام نمی‌گیرد',
    stepPortfolioSession({ ...session142, state: 'draft' }, 'm15', opts142)
      .reason === 'notActive');
  check('جلسهٔ بی‌مأموریت هم همین‌طور',
    stepPortfolioSession({ ...session142, lockedMission: null }, 'm15', opts142)
      .reason === 'missingMission');
  check('تقویم خالی، گام نمی‌دهد — نه اینکه تقویم بسازد',
    stepPortfolioSession(session142, 'm15', { days: [] }).reason === 'emptyCalendar');
  check('پلهٔ ناشناخته با علت جدا رد می‌شود',
    stepPortfolioSession(session142, 'هرچه', opts142).reason === 'unknownStep');
  for (const bad of [null, undefined, 0]) {
    check(`پلهٔ نامعتبر (${bad}) هم رد می‌شود`,
      stepPortfolioSession(session142, bad, opts142).reason === 'unknownStep');
  }
  check('هر علت متن خودش را دارد، نه یک جملهٔ عمومی',
    new Set([...['noSession', 'notActive', 'missingMission', 'emptyCalendar',
      'unknownStep', 'calendarEnd', 'backwards', 'pastEnd', 'notInCalendar']
      .map((r) => r)]).size === 9
    && !/PORTFOLIO_CLOCK_REASONS\[reason\] \|\| /.test(code142));

  // ── پله‌ها از تقویم می‌آیند ─────────────────────────────────────────
  check('فهرست پله‌ها از تقویم می‌آید، نه فهرستی دوم',
    Array.isArray(PORTFOLIO_STEPS) && PORTFOLIO_STEPS.length > 0
    && PORTFOLIO_STEPS.every((s) => s.key && s.label)
    && /PORTFOLIO_STEPS = STEPS/.test(code142));
  check('هر پلهٔ فهرست‌شده یا جلو می‌رود یا علت روشن می‌دهد',
    PORTFOLIO_STEPS.every((s) => {
      const out = stepPortfolioSession(session142, s.key, opts142);
      return out.ok
        ? momentKey(out.to) > nowKey142
        : ['calendarEnd', 'pastEnd', 'backwards', 'notInCalendar'].includes(out.reason);
    }));
}
