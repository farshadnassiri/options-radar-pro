// ۱۹۲. ایستِ پخش خودکار تایم‌لاین

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import {
  PLAYBACK_HALT_REASONS, PLAYBACK_SPEEDS, PLAYBACK_SPEED_BY_KEY,
  openExpiryDate, portfolioPlaybackHalt,
} from '../../core/portfolio-playback.mjs';

group('۱۹۲. ایست پخش خودکار');
{
  const fx192 = portfolioFixture('playback-192');
  const roomy192 = JSON.parse(JSON.stringify(fx192.baseSession));
  roomy192.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session192 = {
    ...roomy192,
    lockedMission: fx192.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const plans192 = portfolioRankedPlans(session192, fx192.evidence);
  const done192 = commitPortfolioPlan(session192, fx192.evidence, plans192.ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done192.ok, done192.why);
  const live192 = done192.session;

  const codes = (out) => out.reasons.map((row) => row.code);
  // جزئیاتِ یک علت، یا رشتهٔ خالی وقتی آن علت اصلاً گزارش نشده. بدون این،
  // نبودِ علت به‌جای «رد» یک استثنا می‌شود و کل اجرا را می‌خواباند — یعنی
  // یک ادعای شکسته، خبرِ بقیهٔ ادعاها را هم می‌بلعد.
  const detailOf = (out, code) => out.reasons.find((row) => row.code === code)?.detail ?? '';
  const quiet = portfolioPlaybackHalt(live192, {});
  check('جلسهٔ فعالِ سالم پخش را نمی‌ایستاند',
    quiet.halt === false && quiet.reasons.length === 0, JSON.stringify(codes(quiet)));

  // ── شکستن قید، نه نزدیک‌شدن به آن ──────────────────────────────────
  // «نزدیک» هشدار است. اگر پخش را می‌ایستاند، هر جلسهٔ سفت‌قید عملاً پخش
  // نمی‌شد.
  const breached = portfolioPlaybackHalt(live192, {
    watch: { ok: true, counts: { breached: 2, near: 1, clear: 0, unknown: 0 } },
  });
  check('شکستن قید ریسک، پخش را می‌ایستاند',
    breached.halt && codes(breached).includes('breach'), JSON.stringify(codes(breached)));
  check('و می‌گوید چند قید شکسته — نه فقط «ایستاد»',
    detailOf(breached, 'breach').includes('۲') || detailOf(breached, 'breach').includes('2'));
  check('نزدیک‌شدن به قید، پخش را نمی‌ایستاند',
    portfolioPlaybackHalt(live192, {
      watch: { ok: true, counts: { breached: 0, near: 3, clear: 0, unknown: 0 } },
    }).halt === false);
  check('پایشِ ناموفق هم پخش را نمی‌ایستاند — نبودِ خبر، خبرِ بد نیست',
    portfolioPlaybackHalt(live192, { watch: { ok: false, why: 'موقعیت بازی نیست' } }).halt === false);

  // ── رسیدن به هدف ───────────────────────────────────────────────────
  const target192 = live192.lockedMission.objective.targetProfitRial;
  check('پیش‌شرط: مأموریت هدف سود ریالی دارد', Number.isFinite(target192), String(target192));
  check('رسیدن به هدف مأموریت، پخش را می‌ایستاند',
    codes(portfolioPlaybackHalt(live192, { pnlRial: target192 })).includes('target'));
  check('و فراتر رفتن از آن هم همین‌طور',
    codes(portfolioPlaybackHalt(live192, { pnlRial: target192 + 1 })).includes('target'));
  check('یک ریال کمتر از هدف، ایست نیست',
    portfolioPlaybackHalt(live192, { pnlRial: target192 - 1 }).halt === false);
  check('سود و زیانِ نامعلوم ایست نیست — وگرنه پخش روی هر شکاف می‌ایستد',
    portfolioPlaybackHalt(live192, { pnlRial: null }).halt === false
    && portfolioPlaybackHalt(live192, { pnlRial: undefined }).halt === false);
  check('و «نامعلوم» با صفر یکی گرفته نمی‌شود',
    portfolioPlaybackHalt({
      ...live192,
      lockedMission: {
        ...live192.lockedMission,
        objective: { ...live192.lockedMission.objective, targetProfitRial: 0 },
      },
    }, { pnlRial: null }).halt === false);

  // ── سررسید ─────────────────────────────────────────────────────────
  const expiry192 = openExpiryDate(live192);
  check('نزدیک‌ترین سررسید از موقعیت‌های باز خوانده می‌شود',
    expiry192 === live192.events[0].data.legs[0].expiry, String(expiry192));
  check('رسیدن به سررسید، پخش را می‌ایستاند',
    codes(portfolioPlaybackHalt({ ...live192, now: { date: expiry192, second: 9 * 3600 } },
      {})).includes('expiry'));
  check('پیش از سررسید ایستی نیست',
    portfolioPlaybackHalt({ ...live192, now: { date: expiry192 - 1, second: 9 * 3600 } },
      {}).halt === false);

  // موقعیتِ بسته سررسید معلق ندارد؛ ایستادن سرِ تاریخش یعنی توقف بی‌دلیل.
  const shut192 = closePortfolioPosition(live192, fx192.evidence, live192.events[0].positionId, {});
  check('پیش‌شرط: موقعیت بسته شد', shut192.ok, shut192.why);
  check('سررسیدِ موقعیت بسته دیگر ایست نمی‌سازد',
    openExpiryDate(shut192.session) === null
    && portfolioPlaybackHalt({ ...shut192.session, now: { date: expiry192, second: 9 * 3600 } },
      {}).halt === false);
  check('جلسهٔ بی‌موقعیت هم سررسیدی ندارد', openExpiryDate(session192) === null);

  // ── پایان بازه و بن‌بست ساعت ───────────────────────────────────────
  check('رسیدن به پایان بازهٔ جلسه، پخش را می‌ایستاند',
    codes(portfolioPlaybackHalt({ ...live192, now: { ...live192.end } }, {})).includes('sessionEnd'));
  check('بن‌بستِ ساعت هم ایست است و علتِ خودِ ساعت را می‌برد',
    detailOf(portfolioPlaybackHalt(live192, {
      clock: { anyEnabled: false, blockedWhy: 'تقویم تمام شد' },
    }), 'blocked') === 'تقویم تمام شد');
  check('ساعتِ بازِ دیگر ایست نمی‌سازد',
    portfolioPlaybackHalt(live192, { clock: { anyEnabled: true } }).halt === false);

  // ── چند علت با هم ──────────────────────────────────────────────────
  const many192 = portfolioPlaybackHalt({ ...live192, now: { ...live192.end } }, {
    watch: { ok: true, counts: { breached: 1 } }, pnlRial: target192,
  });
  check('چند علتِ هم‌زمان همه گزارش می‌شوند، نه فقط اولی',
    many192.halt && ['sessionEnd', 'breach', 'target'].every((code) => codes(many192).includes(code)),
    JSON.stringify(codes(many192)));
  check('هر علت متن خوانا دارد — توقفِ بی‌توضیح از نایستادن بدتر است',
    many192.reasons.every((row) => row.why.length > 10));

  // ── جلسه‌های نامناسب ───────────────────────────────────────────────
  check('جلسهٔ نبوده پخش نمی‌شود',
    portfolioPlaybackHalt(null, {}).halt && codes(portfolioPlaybackHalt(null, {})).includes('noSession'));
  check('جلسهٔ پیش‌نویس پخش نمی‌شود',
    codes(portfolioPlaybackHalt({ ...live192, state: 'draft' }, {})).join() === 'notActive');
  check('جلسهٔ بسته هم پخش نمی‌شود و همین را می‌گوید',
    detailOf(portfolioPlaybackHalt({ ...live192, state: 'closed' }, {}), 'notActive')
      .includes('بسته'));

  // ── سرعت‌ها ────────────────────────────────────────────────────────
  check('سه سرعت با برچسب فارسی و فاصلهٔ صعودی',
    PLAYBACK_SPEEDS.length === 3
    && PLAYBACK_SPEEDS.every((row) => row.label.length > 0 && row.ms > 0)
    && PLAYBACK_SPEEDS[0].ms > PLAYBACK_SPEEDS[1].ms
    && PLAYBACK_SPEEDS[1].ms > PLAYBACK_SPEEDS[2].ms);
  check('نمایهٔ سرعت با فهرست یکی است',
    PLAYBACK_SPEEDS.every((row) => PLAYBACK_SPEED_BY_KEY[row.key] === row));
  check('هر علت ایست متن دارد',
    Object.values(PLAYBACK_HALT_REASONS).every((why) => why.length > 10));
}

group('۱۹۲ب. اتصال پخش خودکار به تب');
{
  const tab = readSrc('../ui/tabs/portfolio-time.mjs');
  const at = (needle) => tab.indexOf(needle);

  check('کنترل پخش و سرعت در پنل تایم‌لاین‌اند',
    ['pt-play-toggle', 'pt-play-speed', 'pt-play-state', 'pt-play-halt', 'pt-play-step']
      .every((id) => tab.includes(`id="${id}"`))
    && at('id="pt-play-toggle"') > at('data-panel="timeline"')
    && at('id="pt-play-toggle"') < at('data-panel="strategies"'));
  check('سرعت‌ها از موتور می‌آیند، نه فهرست دوم در رابط',
    /PLAYBACK_SPEEDS\s*\n?\s*\.map\(\(row\) => `<option/.test(tab)
    && !/ms: \d+/.test(tab));
  check('گامِ پخش از تایم‌فریم خودِ جلسه می‌آید',
    /playbackStep\(proposalSession\)/.test(tab) && !/'m15'|'h1'/.test(tab.slice(at('async function playTick'), at('async function playTick') + 700)));

  // ── یک مسیر برای گام، نه دو ────────────────────────────────────────
  check('گام دستی و پخش خودکار از یک مسیر رد می‌شوند',
    /async function advanceClock\(step\)/.test(tab)
    && /await advanceClock\(button\.dataset\.ptStep\)/.test(tab)
    && /const moved = await advanceClock\(step\);/.test(tab));
  check('و ذخیرهٔ سرور همچنان پیش از رسم است',
    tab.indexOf('await persist(nextDraft)') < tab.indexOf('paintEligibility(next)'));

  // ── ایست پیش از گام، نه بعدش ───────────────────────────────────────
  // ساعت جلسه به عقب برنمی‌گردد؛ اگر بعد از گام بسنجیم، لحظهٔ رویداد
  // برای همیشه رفته است.
  const tick = tab.slice(at('async function playTick'), at('async function playTick') + 900);
  check('ایست پیش از حرکت سنجیده می‌شود',
    tick.indexOf('haltNow(proposalSession)') < tick.indexOf('await advanceClock(step)')
    && tick.includes('if (halt.halt)'));
  check('و علتِ ایست به کاربر گفته می‌شود، نه فقط توقف',
    /halt\.reasons\.map\(\(row\) => row\.why\)\.join/.test(tick));

  // ── حلقهٔ خودزمان‌بند ───────────────────────────────────────────────
  // با setInterval گام‌ها روی هم می‌افتادند: هر گام یک واکشی و یک ذخیرهٔ
  // سرور دارد و می‌تواند از فاصلهٔ انتخابی بلندتر شود.
  // توضیحِ «چرا setInterval نه» خودش در کامنت هست؛ ادعا دربارهٔ کدِ اجراشونده
  // است، پس کامنت‌ها کنار گذاشته می‌شوند.
  const code = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('حلقه پس از پایان هر گام زمان‌بندی می‌شود، نه با setInterval',
    /playTimer = setTimeout\(playTick, PLAYBACK_SPEED_BY_KEY\[playSpeed\]\.ms\)/.test(code)
    && !/setInterval/.test(code));
  check('گام دستی وسط پخش، پخش را متوقف می‌کند',
    /if \(playing\) stopPlayback\(/.test(tab));
  check('بستن تب پخش را متوقف می‌کند',
    /return \(\) => \{[\s\S]{0,320}?stopPlayback\(\);/.test(tab));

  // ── عددِ ایست همان عددِ جدول ────────────────────────────────────────
  // ── دکمه‌ای که کاری نمی‌کند باید غیرفعال باشد ──────────────────────
  // وگرنه `playing` روشن می‌ماند و دفعهٔ بعد کاربر باید دو بار بزند.
  check('وضعیت آغازین دکمه پیش از هر بازنقاشیِ زنده تنظیم می‌شود',
    /\/\/ وضعیت آغازین دکمه[\s\S]{0,200}?\n  paintPlayback\(\);/.test(tab));
  check('و کلیک روی دکمهٔ بی‌جلسه، پخش را روشن نمی‌گذارد',
    /if \(!proposalSession \|\| proposalSession\.state !== 'active'\) \{[\s\S]{0,200}?return;/
      .test(tab.slice(at("$('pt-play-toggle').onclick"))));
  check('دکمه وقتی جلسه فعال نیست غیرفعال می‌شود',
    /toggle\.disabled = !proposalSession \|\| proposalSession\.state !== 'active' \|\| !step;/.test(tab));

  check('سود و زیانِ ایست از همان موتور سری زمانی خوانده می‌شود',
    /portfolioTimeline\(session, \[\{ at: session\.now, evidence \}\]/.test(tab));
  check('و پایش قیود از موتور خودش، نه حسابِ دوباره در رابط',
    /portfolioRiskWatch\(session, evidence\)/.test(tab));
}
