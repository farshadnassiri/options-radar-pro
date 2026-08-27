// ۱۴۴. موتورها روی لحظهٔ دلخواه

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioCandidates } from '../../core/portfolio-candidates.mjs';
import { portfolioEntryPlan } from '../../core/portfolio-entry.mjs';
import { portfolioCapitalRequirement } from '../../core/portfolio-capital.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { activeSnapshot, portfolioMomentSnapshot } from '../../core/portfolio-snapshot.mjs';
import { stepPortfolioSession } from '../../core/portfolio-clock.mjs';
import { byId } from '../../strategies/catalog.mjs';

group('۱۴۴. موتورها روی لحظهٔ دلخواه');
{
  const fx144 = portfolioFixture('moment-144');
  const roomy144 = JSON.parse(JSON.stringify(fx144.baseSession));
  roomy144.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const base144 = {
    ...roomy144,
    lockedMission: fx144.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const days144 = [20260519, 20260520, 20260521, 20260524, 20260525, 20260526];
  const rows144 = fx144.contracts.map((row) => ({
    ins: row.ins, kind: row.kind, strike: row.strike, expiry: row.expiry, size: row.size,
    book: row.quote.book, close: row.quote.close,
  }));

  // ── دسترسیِ مشترک ───────────────────────────────────────────────────
  // یک دسترسی، وگرنه هر موتور قاعدهٔ خودش را می‌سازد و روزی دو موتور دو
  // عکس متفاوت می‌بینند.
  check('بدون عکسِ لحظه، عکسِ شروع پاسخ است',
    activeSnapshot(base144) === base144.startSnapshot);
  check('و با عکسِ لحظه، همان مقدم است',
    activeSnapshot({ ...base144, momentSnapshot: { at: 1 } }).at === 1);
  check('جلسهٔ نبوده null می‌دهد نه خطا',
    activeSnapshot(null) === null && activeSnapshot({}) === null);

  // ── یک گام واقعی جلو ────────────────────────────────────────────────
  const stepped144 = stepPortfolioSession(base144, 'd1', { days: days144 });
  check('پیش‌شرط: ساعت یک روز جلو رفت',
    stepped144.ok && stepped144.to.date === 20260524, stepped144.why);
  const at144 = stepped144.to;
  const snap144 = portfolioMomentSnapshot(stepped144.session, at144,
    { spot: 10_500, rows: rows144 });
  check('پیش‌شرط: عکسِ آن لحظه ساخته شد', snap144.ok, snap144.why);
  const session144 = { ...stepped144.session, momentSnapshot: snap144.snapshot };
  const evidence144 = { ...fx144.evidence, now: { ...at144 } };

  // ── بند ۵: زنجیرهٔ کامل روی لحظهٔ غیرِ شروع ──────────────────────────
  const cands144 = portfolioCandidates(session144,
    [byId('long-call'), byId('short-strangle')], evidence144);
  check('موتور ترکیب‌ها روی لحظهٔ غیرِ شروع کار می‌کند',
    cands144.ok && cands144.candidates.length > 0
    && cands144.now.date === at144.date, `${cands144.reason} ${cands144.why}`);
  const pick144 = cands144.candidates.find((row) => row.defId === 'long-call');
  const entry144 = portfolioEntryPlan(session144, cands144, evidence144, pick144.id);
  check('طرح ورود هم روی همان لحظه ساخته می‌شود',
    entry144.ok && entry144.executableQty > 0
    && entry144.now.date === at144.date, `${entry144.reason} ${entry144.why}`);
  const capital144 = portfolioCapitalRequirement(session144, cands144, evidence144, entry144);
  check('و سرمایهٔ لازم هم',
    capital144.ok && capital144.components.totalRial > 0,
    `${capital144.reason} ${capital144.why}`);
  const plans144 = portfolioRankedPlans(session144, evidence144);
  check('زنجیرهٔ رتبه‌بندی هم تا آخر می‌رود',
    plans144.ok && plans144.ranking.ranked.length > 0
    && plans144.now.date === at144.date, `${plans144.reason} ${plans144.why}`);

  // ── بند ۲: قید عوض شد، برداشته نشد ──────────────────────────────────
  // هم‌لحظه‌بودنِ عکس و مدرک همچنان اجباری است. برداشتنش یعنی سنجیدنِ
  // قیمت امروز با حکمِ دیروز.
  const mismatched144 = portfolioCandidates(session144,
    [byId('long-call')], { ...fx144.evidence, now: { ...fx144.at } });
  check('مدرکِ لحظهٔ دیگر همچنان رد می‌شود',
    !mismatched144.ok && mismatched144.reason === 'mismatchedEvidence',
    `${mismatched144.reason} ${mismatched144.why}`);
  check('و طرح ورود هم همین‌طور',
    portfolioEntryPlan(session144, cands144, { ...fx144.evidence, now: { ...fx144.at } },
      pick144.id).reason.code === 'mismatchedEvidence');

  // ── بند ۳: بیرون از بازهٔ جلسه ──────────────────────────────────────
  const outside144 = {
    ...session144,
    momentSnapshot: { ...snap144.snapshot, at: { date: 20260701, second: 36_000 } },
  };
  check('عکسِ بیرون از بازهٔ جلسه رد می‌شود',
    portfolioCandidates(outside144, [byId('long-call')],
      { ...evidence144, now: { date: 20260701, second: 36_000 } })
      .reason === 'missingSnapshot');
  const before144 = {
    ...session144,
    momentSnapshot: { ...snap144.snapshot, at: { date: 20260101, second: 36_000 } },
  };
  check('عکسِ پیش از شروع جلسه هم رد می‌شود',
    portfolioCandidates(before144, [byId('long-call')],
      { ...evidence144, now: { date: 20260101, second: 36_000 } })
      .reason === 'missingSnapshot');

  // ── بند ۴: علت با کد، نه فقط متن ────────────────────────────────────
  // مصرف‌کننده نباید ناچار باشد روی متن فارسی شرط بگذارد؛ متن روزی عوض
  // می‌شود و شرط بی‌صدا می‌شکند.
  check('موتور ترکیب‌ها مثل بقیه علت را با کد برمی‌گرداند',
    typeof mismatched144.reason === 'string' && mismatched144.reason.length > 0
    && mismatched144.why.length > 0);
  for (const [bad, code] of [
    [{ ...session144, state: 'draft' }, 'inactiveSession'],
    [{ ...session144, momentSnapshot: null, startSnapshot: null }, 'missingSnapshot'],
  ]) {
    check(`علت «${code}» با کد می‌آید`,
      portfolioCandidates(bad, [byId('long-call')], evidence144).reason === code);
  }

  // ── بند ۶: رفتار لحظهٔ شروع دست‌نخورده ──────────────────────────────
  // اگر معنای لحظهٔ شروع عوض شده بود، دسته‌های ۱۲۵ تا ۱۳۲ باید قرمز
  // می‌شدند؛ این ادعا همان را صریح می‌کند.
  const atStart144 = portfolioCandidates(fx144.session,
    [byId('long-call'), byId('short-strangle')], fx144.evidence);
  check('لحظهٔ شروع دقیقاً همان‌طور کار می‌کند',
    atStart144.ok
    && atStart144.candidates.length === fx144.candidateSet.candidates.length
    && atStart144.now.date === fx144.at.date);
  check('و جلسهٔ بدون عکسِ لحظه، هنوز از عکسِ شروع می‌خواند',
    portfolioRankedPlans(base144, fx144.evidence).ok);

  // ── مرزهای پیاده‌سازی ───────────────────────────────────────────────
  const code144 = readSrc('../core/portfolio-candidates.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('موتور دیگر لحظهٔ شروع را شرط نمی‌کند',
    !/sameMoment\(snapshot\.at, session\.start\)/.test(code144)
    && /snapshotWithinSession/.test(code144));
  for (const file of ['portfolio-entry', 'portfolio-capital',
    'portfolio-evaluation', 'portfolio-plans']) {
    const src = readSrc(`../core/${file}.mjs`)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check(`${file} از دسترسیِ مشترک می‌خواند، نه مستقیم از عکس شروع`,
      /activeSnapshot\(/.test(src) && !/session\??\.?startSnapshot/.test(src),
      (src.match(/session\??\.?startSnapshot[^;]{0,30}/g) || []).join(' ،') || 'هیچ');
  }
}
