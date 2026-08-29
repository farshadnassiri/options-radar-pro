// ۱۹۴. انتخاب دومرحله‌ای خانوادهٔ استراتژی

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioSessionProposals } from '../../ui/portfolio-proposals.mjs';

group('۱۹۴. انتخاب خانوادهٔ استراتژی');
{
  const fx194 = portfolioFixture('family-194');
  const roomy194 = JSON.parse(JSON.stringify(fx194.baseSession));
  roomy194.lockedAllocations = [
    { familyId: 'single', pct: 50, targetRial: 5_000_000 },
    { familyId: 'vol', pct: 50, targetRial: 5_000_000 },
  ];
  const session194 = {
    ...roomy194,
    lockedMission: fx194.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const all194 = portfolioSessionProposals(session194, fx194.evidence);
  check('پیش‌شرط: پیشنهادها ساخته می‌شوند', all194.ok, all194.why);

  // ── گزینهٔ «همه» می‌ماند ────────────────────────────────────────────
  // مقایسهٔ بین خانواده‌ها همان چیزی است که رتبه‌بندی برایش ساخته شده؛
  // برداشتنش یعنی کاربر پیش از دیدن هر چیزی یکی را حدس بزند.
  check('بدون انتخاب، همهٔ خانواده‌ها دیده می‌شوند',
    all194.familyId === '' && all194.familyLabel === 'همه خانواده‌ها'
    && all194.familyNote === '');
  check('فهرست خانواده‌ها فقط آن‌هایی است که همین حالا طرح رتبه‌دار دارند',
    all194.families.length > 0
    && all194.families.every((row) => row.id && row.label && row.count > 0));
  check('و شمارِ هر خانواده با جمعِ رتبه‌دارها می‌خواند',
    all194.families.reduce((sum, row) => sum + row.count, 0) === all194.counts.ranked);
  check('نام خانواده فارسی است، نه شناسهٔ خام',
    all194.families.every((row) => row.label !== row.id || !/^[a-z]+$/.test(row.id)));

  // ── صافی پیش از بریدنِ سقف ─────────────────────────────────────────
  const family194 = all194.families[0].id;
  const picked194 = portfolioSessionProposals(session194, fx194.evidence, { familyId: family194 });
  check('انتخاب خانواده فهرست را به همان خانواده محدود می‌کند',
    picked194.ok && picked194.familyId === family194
    && picked194.shortlist.length > 0
    && picked194.shortlist.every((row) => row.familyLabel === all194.families[0].label),
    picked194.shortlist.map((row) => row.familyLabel).join('،'));
  check('و سقف نمایش همان سقف است، نه کمتر',
    picked194.shortlist.length === Math.min(picked194.limit, all194.families[0].count));

  // صافی باید پیش از برش اعمال شود؛ وگرنه خانواده‌ای که بهترین طرحش
  // رتبهٔ چهارم است، با وجود داشتن طرح، خالی دیده می‌شود.
  const deep194 = all194.families.find((row) => !all194.shortlist
    .some((item) => item.familyLabel === row.label));
  if (deep194) {
    const out194 = portfolioSessionProposals(session194, fx194.evidence, { familyId: deep194.id });
    check('خانواده‌ای که در سه‌تای برتر نبود هم طرح‌هایش را نشان می‌دهد',
      out194.shortlist.length > 0, `${deep194.label} → ${out194.shortlist.length}`);
  }

  // ── ادعای اصلی: صافی پیش از بریدنِ سقف ─────────────────────────────
  // چیدمانِ بالا فقط یک خانوادهٔ رتبه‌دار دارد، پس این حالت را نمی‌سنجد.
  // سرمایهٔ بزرگ‌تر و سهم بیشترِ خانوادهٔ تلاطم، خانوادهٔ دوم را هم رتبه‌دار
  // می‌کند؛ آن‌وقت با سقفِ دو، خانوادهٔ دوم بیرون از فهرست برتر می‌ماند و
  // اگر صافی بعد از برش بود، انتخابش جدولِ خالی می‌داد — با اینکه طرح دارد.
  const big194 = JSON.parse(JSON.stringify(fx194.baseSession));
  big194.capital = {
    initialRial: 500_000_000, reserveRial: 0, reservePct: 0,
    allocatableRial: 500_000_000, assignedRial: 0, unassignedRial: 500_000_000,
  };
  big194.lockedAllocations = [
    { familyId: 'single', pct: 20, targetRial: 100_000_000 },
    { familyId: 'vol', pct: 80, targetRial: 400_000_000 },
  ];
  const wide194 = { ...big194, lockedMission: session194.lockedMission };
  const tight194 = portfolioSessionProposals(wide194, fx194.evidence, { limit: 2 });
  const outside194 = tight194.families
    .find((row) => !tight194.shortlist.some((item) => item.familyLabel === row.label));
  check('پیش‌شرط: دو خانوادهٔ رتبه‌دار، و یکی بیرون از فهرستِ برتر',
    tight194.families.length === 2 && Boolean(outside194),
    tight194.families.map((row) => `${row.label}:${row.count}`).join('،'));
  const deepPick194 = portfolioSessionProposals(wide194, fx194.evidence,
    { limit: 2, familyId: outside194.id });
  check('صافی پیش از بریدنِ سقف اعمال می‌شود، نه بعدش',
    deepPick194.shortlist.length === 2
    && deepPick194.shortlist.every((row) => row.familyLabel === outside194.label),
    `${outside194.label} → ${deepPick194.shortlist.map((row) => row.familyLabel).join('،')}`);
  check('و رتبهٔ نشان‌داده‌شده همان رتبهٔ سراسری است، نه ۱ از نو',
    deepPick194.shortlist[0].rank > tight194.limit,
    String(deepPick194.shortlist[0].rank));

  // ── رتبه از نو شماره نمی‌خورد ──────────────────────────────────────
  // «رتبهٔ ۱» در فهرستِ فیلترشده باید یعنی بهترین طرحِ کل، نه بهترین طرحِ
  // همین خانواده؛ وگرنه کاربر فکر می‌کند طرحی که دیده سرآمد همه است.
  const ranksAll = new Map(all194.shortlist.map((row) => [row.candidateId, row.rank]));
  check('رتبهٔ سراسری در فهرست فیلترشده حفظ می‌شود',
    picked194.shortlist.every((row) => !ranksAll.has(row.candidateId)
      || ranksAll.get(row.candidateId) === row.rank));

  // ── خانوادهٔ بی‌طرح ────────────────────────────────────────────────
  const empty194 = portfolioSessionProposals(session194, fx194.evidence, { familyId: 'arb' });
  check('خانوادهٔ بی‌طرح، جدول خالیِ بی‌توضیح نمی‌سازد',
    empty194.ok && empty194.familyId === ''
    && empty194.shortlist.length === all194.shortlist.length
    && empty194.familyNote.length > 0, empty194.familyNote);
  check('و همان علت می‌گوید چرا فهرست عوض نشد',
    empty194.familyNote.includes('طرح رتبه‌داری ندارد'));

  // ── سری ناموفق ─────────────────────────────────────────────────────
  const broken194 = portfolioSessionProposals(null, fx194.evidence);
  check('جلسهٔ ناموفق هم میدان‌های خانواده را دارد، خالی',
    !broken194.ok && Array.isArray(broken194.families) && broken194.families.length === 0
    && broken194.familyId === '' && broken194.familyNote === '');

  // ── اتصال به تب ────────────────────────────────────────────────────
  const tab194 = readSrc('../ui/tabs/portfolio-time.mjs');
  const at = (needle) => tab194.indexOf(needle);
  check('انتخابگر خانواده بالای جدول پیشنهادها در تب استراتژی‌هاست',
    tab194.includes('id="pt-proposals-family"')
    && at('id="pt-proposals-family"') > at('data-panel="strategies"')
    && at('id="pt-proposals-family"') < at('id="pt-proposals-body"'));
  check('انتخاب کاربر به همان موتور داده می‌شود',
    /portfolioSessionProposals\(session, evidence, \{ familyId: proposalFamily \}\)/.test(tab194));
  check('«همه» گزینهٔ نخست است',
    /<option value="">همه خانواده‌ها<\/option>/.test(tab194));
  check('فهرست فقط وقتی از نو ساخته می‌شود که واقعاً عوض شده باشد',
    /if \(pick\.dataset\.key !== key\) \{/.test(tab194));
  check('و اگر خانوادهٔ انتخابی طرحش را از دست بدهد، انتخاب بی‌صدا نمی‌ماند',
    /if \(view\.ok && proposalFamily && view\.familyId !== proposalFamily\) \{/.test(tab194)
    && /note\.textContent = view\.ok \? view\.familyNote : '';/.test(tab194));
}
