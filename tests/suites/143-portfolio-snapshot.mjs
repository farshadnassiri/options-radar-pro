// ۱۴۳. عکس لحظهٔ جاری

import { check, group, readSrc } from '../harness.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioCandidates } from '../../core/portfolio-candidates.mjs';
import {
  PORTFOLIO_SNAPSHOT_VERSION, SNAPSHOT_KEYS, portfolioMomentSnapshot,
} from '../../core/portfolio-snapshot.mjs';
import { byId } from '../../strategies/catalog.mjs';

group('۱۴۳. عکس لحظهٔ جاری');
{
  const fx143 = portfolioFixture('snapshot-143');
  const session143 = fx143.session;
  const later143 = { date: 20260524, second: 11 * 3600 };
  // ردیف‌های خام همان‌اند که لایهٔ داده برای یک لحظه می‌آورد.
  const rows143 = fx143.contracts.map((row) => ({
    ins: row.ins, kind: row.kind, strike: row.strike, expiry: row.expiry, size: row.size,
    book: row.quote.book, close: row.quote.close,
  }));

  const out143 = portfolioMomentSnapshot(session143, later143,
    { spot: 10_500, rows: rows143 });
  check('عکس لحظهٔ دلخواه ساخته می‌شود',
    out143.ok && out143.version === PORTFOLIO_SNAPSHOT_VERSION
    && out143.snapshot.contracts.length === rows143.length, out143.why);

  // ── بند ۵: شکل، همان شکل عکس شروع ───────────────────────────────────
  // شکل دوم یعنی هر مصرف‌کننده باید هر دو را بشناسد و روزی یکی جا می‌ماند.
  check('کلیدهای عکس همان کلیدهای عکس شروع‌اند',
    SNAPSHOT_KEYS.every((key) => key in out143.snapshot)
    && SNAPSHOT_KEYS.every((key) => key in session143.startSnapshot));
  check('و هر قرارداد همان شکل قرارداد عکس شروع را دارد',
    ['ins', 'kind', 'strike', 'expiry', 'size', 'quote']
      .every((key) => key in out143.snapshot.contracts[0])
    && ['book', 'close', 'quality'].every((key) => key in out143.snapshot.contracts[0].quote));
  const atStart143 = portfolioMomentSnapshot(session143, fx143.at,
    { spot: session143.startSnapshot.spot, rows: rows143 });
  const swapped143 = { ...session143, startSnapshot: atStart143.snapshot };
  const cands143 = portfolioCandidates(swapped143,
    [byId('long-call'), byId('short-strangle')], fx143.evidence);
  check('عکسِ ساخته‌شده جای عکس شروع می‌نشیند و موتور همان ترکیب‌ها را می‌دهد',
    cands143.candidates.length === fx143.candidateSet.candidates.length
    && cands143.candidates.length > 0,
    `${cands143.candidates.length} در برابر ${fx143.candidateSet.candidates.length}`);
  const laterCands143 = portfolioCandidates(
    { ...session143, momentSnapshot: out143.snapshot },
    [byId('long-call')], { ...fx143.evidence, now: { ...later143 } });
  check('و موتور عکسِ لحظهٔ بعد را هم می‌پذیرد',
    laterCands143.ok && laterCands143.candidates.length > 0,
    `${laterCands143.reason || ''} ${laterCands143.why || ''}`);

  // ── بند ۲: capitalInputs قفل‌شده ────────────────────────────────────
  check('نرخ کارمزد و پارامتر تضمین از عکس شروع می‌آیند، نه بازخوانی',
    out143.snapshot.capitalInputs === session143.startSnapshot.capitalInputs);
  const code143 = readSrc('../core/portfolio-snapshot.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('و ماژول نرخ تازه‌ای نمی‌سازد',
    !/fees\s*[:=]\s*\{|option:\s*0|margin\s*:\s*\{/.test(code143));
  check('جلسهٔ بدون ورودی سرمایه، عکس نمی‌گیرد',
    portfolioMomentSnapshot({ ...session143, startSnapshot: { at: fx143.at } },
      later143, { spot: 10_500, rows: rows143 }).reason === 'missingCapitalInputs');

  // ── بند ۱ و ۳: فقط دادهٔ همان لحظه ──────────────────────────────────
  const first143 = out143.snapshot.contracts[0];
  check('قراردادِ با دفتر سفارش، کیفیت اجراپذیر می‌گیرد',
    first143.quote.book !== null && first143.quote.quality.executable === true
    && first143.quote.quality.sufficient === true);
  // پایانی هست ولی دفتر نیست: قیمت هست، اجراپذیری نه.
  const closeOnly143 = portfolioMomentSnapshot(session143, later143, {
    spot: 10_500,
    rows: rows143.map((row) => ({ ...row, book: [] })),
  });
  check('بدونِ دفتر ولی با پایانی، کیفیت «برآوردی» است نه اجراپذیر',
    closeOnly143.snapshot.contracts[0].quote.quality.estimated === true
    && closeOnly143.snapshot.contracts[0].quote.book === null
    && closeOnly143.snapshot.contracts[0].quote.close === rows143[0].close);
  check('و علتش پنهان نمی‌شود',
    closeOnly143.snapshot.contracts[0].quote.quality.reason.includes('دفتر سفارش'),
    closeOnly143.snapshot.contracts[0].quote.quality.reason);
  // نبودِ داده هرگز با قیمت لحظهٔ قبل پر نمی‌شود.
  const blank143 = portfolioMomentSnapshot(session143, later143, {
    spot: 10_500,
    rows: rows143.map((row) => ({ ...row, book: [], close: null })),
  });
  const blankRow143 = blank143.snapshot.contracts[0];
  check('قراردادِ بی‌داده کیفیت «فاقد داده» می‌گیرد',
    blankRow143.quote.quality.missing === true
    && blankRow143.quote.quality.sufficient === false);
  check('و قیمتش null است، نه صفر و نه قیمت لحظهٔ قبل',
    blankRow143.quote.close === null && blankRow143.quote.book === null
    && blankRow143.quote.close !== rows143[0].close);
  check('ولی از فهرست حذف نمی‌شود',
    blank143.snapshot.contracts.length === rows143.length);
  check('و نام‌بُرده می‌شود، نه فقط شمرده',
    blank143.missing.count === rows143.length
    && blank143.missing.ins.includes(rows143[0].ins), `${blank143.missing.count}`);
  check('ماژول اصلاً سراغ لحظهٔ دیگری نمی‌رود',
    !/previous|lastKnown|carryForward|fallback/i.test(code143));
  check('وقتی همه‌چیز هست، هشدارِ بی‌مورد ساخته نمی‌شود',
    out143.missing.count === 0 && out143.missing.spot === false);

  // ── قیمت پایه ───────────────────────────────────────────────────────
  const noSpot143 = portfolioMomentSnapshot(session143, later143, { rows: rows143 });
  check('نبودِ قیمت پایه null می‌شود نه صفر، و علامت می‌خورد',
    noSpot143.snapshot.spot === null && noSpot143.missing.spot === true);
  check('و کیفیت کلی را ناکافی می‌کند',
    noSpot143.snapshot.quality.sufficient === false);

  // ── بند ۴: خالی با «همه‌چیز خوب» یکی نیست ───────────────────────────
  const none143 = portfolioMomentSnapshot(session143, later143, { spot: 10_500, rows: [] });
  check('عکسِ بدون قرارداد ساخته می‌شود ولی «فاقد داده» است',
    none143.ok && none143.snapshot.contracts.length === 0
    && none143.snapshot.quality.missing === true
    && none143.snapshot.quality.sufficient === false, none143.snapshot.quality.kind);
  check('و علتش نوشته می‌شود',
    none143.snapshot.quality.reason.includes('هیچ قراردادی'),
    none143.snapshot.quality.reason);
  check('کیفیت کلی بدترینِ اجزا را می‌گیرد، نه میانگین',
    portfolioMomentSnapshot(session143, later143, {
      spot: 10_500,
      rows: rows143.map((row, i) => (i === 0 ? { ...row, book: [], close: null } : row)),
    }).snapshot.quality.missing === true);

  // ── بند ۶: مرزهای زمانی ─────────────────────────────────────────────
  check('لحظهٔ پیش از شروع جلسه رد می‌شود',
    portfolioMomentSnapshot(session143, { date: 20260501, second: 36_000 },
      { spot: 10_500, rows: rows143 }).reason === 'outsideSession');
  check('لحظهٔ پس از پایان جلسه هم رد می‌شود',
    portfolioMomentSnapshot(session143, { date: 20260701, second: 36_000 },
      { spot: 10_500, rows: rows143 }).reason === 'outsideSession');
  check('لحظهٔ شروع خودش معتبر است',
    portfolioMomentSnapshot(session143, fx143.at, { spot: 10_200, rows: rows143 }).ok);
  for (const bad of [null, undefined, { date: 0, second: 0 }]) {
    check(`لحظهٔ نامعتبر (${JSON.stringify(bad)}) رد می‌شود`,
      portfolioMomentSnapshot(session143, bad, { spot: 10_500, rows: rows143 })
        .reason === 'invalidMoment');
  }
  check('جلسهٔ نبوده، علت خودش را دارد',
    portfolioMomentSnapshot(null, later143, { rows: rows143 }).reason === 'noSession');

  // ── مرزهای عمومی ────────────────────────────────────────────────────
  check('ماژول چیزی واکشی نمی‌کند',
    !/fetch\s*\(|await /.test(code143));
  check('و جلسهٔ ورودی را دست‌نخورده می‌گذارد',
    session143.startSnapshot.contracts.length === fx143.contracts.length
    && session143.startSnapshot.at.date === fx143.at.date);
  check('عکسِ ساخته‌شده رونوشتِ دفتر ورودی را می‌برد، نه خودش را',
    out143.snapshot.contracts[0].quote.book !== rows143[0].book);
}
