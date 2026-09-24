// ۲۹۵. آزمونِ عملیِ معامله‌گر — ۱۴۰۵/۰۷/۰۱ (R5-17)
//
// فایلِ یک‌هفته‌ایِ اهرم، ۲۰۲۶/۰۹/۱۶ تا ۰۹/۲۲: ۳۹۷ ابزار/روز، ۷۰ تطبیق،
// ۱۳ ناقص، ۳ خطا، ۳۰۹ سهمیه. سهمیه **واقعاً** بسته شده بود — ۲۵ ردیف با
// هر دو پرچم فهرستِ خالی گرفتند در حالی که تابلو معامله داشت، از جمله خودِ
// اهرم در ۰۹/۱۹ با ۷٬۷۳۶ معامله. پس توقف درست بود. آنچه غلط بود:
//
//   ۱. آن ۲۵ ردیف «پرسیده نشد» نوشته شدند — مدرکِ حکم، با علتِ غلط
//   ۲. هفت ردیفِ نپرسیده «۱ بار» گرفتند
//   ۳. ناظر ۱۳ ردیفِ «false خالی، true بریده» را «داده آمد» خواند و دیر رسید
//   ۴. دکمهٔ «تلاش تکمیلی» پس از توقفِ سهمیه هرگز درخواستی نمی‌فرستاد
//   ۵. راست‌آزما سه روزِ تماماً سهمیه را «✔ بلوکِ خراب نیست» نوشت
//   ۶. شش قراردادِ بی‌تاریخِ عرضه بی‌راهِ بازگشت بیرون ماندند
//   ۷. نمودارِ درون‌روزی با بازارِ بسته این را نمی‌گفت

import { check, group, readSrc } from '../harness.mjs';
import { makeThrottleWatch } from '../../core/throttle-watch.mjs';
import { keepBetterTape } from '../../core/tape-choice.mjs';
import { markAttempt, refillQueue, refillSummary } from '../../core/refill-queue.mjs';
import {
  BLOCKED_STATUS, askedDeniedText, dataExportBlankAudit, dataExportCoverageRows, dataExportOutcome, dataExportPairs,
  recoverListingFromDaily, wasAsked,
} from '../../core/data-export.mjs';

const REF = { trades: 7736, volume: 73305224, quiet: false };

group('۲۹۵. پرسیده‌شده و پرسیده‌نشده دو وضعیت‌اند');
{
  // همان شکلِ دو گروه در فایلِ واقعی
  const asked = {
    rows: [], variant: 'both', emptyBoth: true, reference: REF, attempts: 1,
    shortfall: { trades: 7736, volume: 73305224 }, throttled: true,
  };
  const skipped = { rows: [], throttled: true, skipped: true, error: 'سهمیهٔ بالادست بسته شد؛ این ابزار/روز پرسیده نشد' };

  check('ردیفِ پرسیده‌شده «پرسیده شد» خوانده می‌شود', wasAsked(asked) === true);
  check('و ردیفِ پرچم‌خوردهٔ `skipped` نه، حتی با شمارنده',
    wasAsked({ ...skipped, attempts: 1 }) === false);
  check('و رکوردِ بی‌تلاش هم نه', wasAsked({ rows: [] }) === false);

  check('جملهٔ پرسیده‌شده عددِ تابلو را می‌گوید — همان چیزی که آن را مدرک می‌کند',
    askedDeniedText(asked).includes('7736') && askedDeniedText(asked).includes('پرسیده شد'));
  check('و هرگز نمی‌گوید «پرسیده نشد»', !askedDeniedText(asked).includes('پرسیده نشد'));

  check('دو برچسبِ جدا در برگ پوشش',
    BLOCKED_STATUS.throttled !== BLOCKED_STATUS.throttledAsked
    && BLOCKED_STATUS.throttled.includes('سهمیهٔ بالادست')
    && BLOCKED_STATUS.throttledAsked.includes('سهمیهٔ بالادست'));

  const pairs = [{ ins: 'A', date: 20260919, key: 'A:20260919' }, { ins: 'B', date: 20260920, key: 'B:20260920' }];
  const items = { 'A:20260919': asked, 'B:20260920': skipped };
  const audit = dataExportBlankAudit(pairs, items, {}, []);
  const instruments = [
    { ins: 'A', name: 'A', baseName: 'اهرم', kind: 'underlying' },
    { ins: 'B', name: 'B', baseName: 'اهرم', kind: 'underlying' },
  ];
  const coverage = dataExportCoverageRows(instruments, pairs, items, audit);
  const byKey = Object.fromEntries(coverage.map((row) => [`${row.ins}:${row.date}`, row]));
  check('برگ پوشش ردیفِ پرسیده را «پرسیده شد، خالی آمد» می‌نویسد',
    byKey['A:20260919'].status === BLOCKED_STATUS.throttledAsked && byKey['A:20260919'].asked === true);
  check('و ردیفِ نپرسیده را «پرسیده نشد»',
    byKey['B:20260920'].status === BLOCKED_STATUS.throttled && byKey['B:20260920'].asked === false);

  const outcome = dataExportOutcome(pairs, items);
  check('جمع‌بندی هر دو را جدا می‌شمارد',
    outcome.throttled === 2 && outcome.throttledAsked === 1 && outcome.throttledSkipped === 1);
}

group('۲۹۵. شمارندهٔ تلاش، فقط آنچه واقعاً رفت');
{
  check('پاسخِ `skipped` تلاش شمرده نمی‌شود',
    markAttempt({ rows: [], skipped: true }).attempts === undefined);
  check('و پاسخِ معمولی همچنان یک واحد می‌گیرد',
    markAttempt({ rows: [] }).attempts === 1);

  // دورِ اول پرسید و خالی آمد؛ دورِ تکمیلی سرور نپرسید. مدرکِ دورِ اول
  // نباید با پاسخِ «پرسیده نشد» پاک شود.
  const first = { rows: [], variant: 'both', emptyBoth: true, reference: REF, attempts: 1, throttled: true };
  const merged = keepBetterTape(first, { rows: [], throttled: true, skipped: true, error: 'پرسیده نشد' });
  check('پاسخِ «پرسیده نشد» مدرکِ دورِ قبل را پاک نمی‌کند',
    merged.variant === 'both' && merged.emptyBoth === true && merged.reference?.trades === 7736);
  check('و ردیف را «نپرسیده» هم نمی‌کند', merged.skipped !== true && merged.attempts === 1);
  check('و برچسبِ سهمیه می‌ماند', merged.throttled === true);

  const withData = { rows: [{ time: 1 }], variant: 'false', attempts: 1 };
  const kept = keepBetterTape(withData, { rows: [], throttled: true, skipped: true });
  check('ردیفِ داده‌دار هم با «پرسیده نشد» خالی نمی‌شود',
    kept.rows.length === 1 && kept.throttled !== true);

  // صفِ تکمیلی هم همین تفکیک را دارد
  const pairs = [{ ins: 'A', date: 1, key: 'A:1' }, { ins: 'B', date: 1, key: 'B:1' }];
  const queue = refillQueue(pairs, {
    'A:1': { rows: [], throttled: true, attempts: 1 },
    'B:1': { rows: [], throttled: true, skipped: true },
  }, []);
  check('صفِ تکمیلی می‌داند کدام پرسیده شده', queue.find((j) => j.key === 'A:1').asked === true
    && queue.find((j) => j.key === 'B:1').asked === false);
  check('و خلاصه‌اش هر دو را جدا می‌گوید', refillSummary(queue).throttledAsked === 1
    && refillSummary(queue).throttled === 2);
}

group('۲۹۵. ناظر «false خالی، true بریده» را تکذیب می‌شمارد');
{
  const falseEmpty = { rows: [{ p: 1 }], variant: 'true', falseEmpty: true, complete: false, reference: REF };
  const emptyBoth = { rows: [], variant: 'both', emptyBoth: true, reference: REF };
  const good = { rows: [{ p: 1 }], variant: 'false', complete: true, reference: REF };

  const w = makeThrottleWatch();
  let verdict = false;
  for (let i = 0; i < 10; i += 1) verdict = w.saw(falseEmpty, `k${i}`);
  check('ده ردیفِ «false خالی» پیاپی حکم می‌دهند', verdict === true);
  check('ولی هیچ‌کدام مظنون نمی‌شوند — دادهٔ واقعی دارند',
    w.state().suspects.length === 0);

  const calm = makeThrottleWatch();
  for (let i = 0; i < 30; i += 1) calm.saw(good, `g${i}`);
  check('و ردیفِ سالم، هر چندتا، حکمی نمی‌دهد', calm.throttled() === false);

  // ═══ بازپخشِ شکلِ فایلِ واقعی ═══
  //
  // ۲۰۲۶/۰۹/۱۶: ضهرم۸۰۲۸ تا طهرم۸۰۳۴ درهم — «هر دو خالی» و «false خالی»
  // پشتِ هم. ناظرِ قبلی با هر «false خالی» رشته را صفر می‌کرد.
  const tape = [];
  for (let i = 0; i < 40; i += 1) tape.push(i % 2 ? falseEmpty : emptyBoth);
  const stepsUntil = (watch) => {
    for (let i = 0; i < tape.length; i += 1) if (watch.saw(tape[i], `r${i}`)) return i + 1;
    return Infinity;
  };
  const now = stepsUntil(makeThrottleWatch());
  // ناظرِ قبلی: همان رشته، ولی `falseEmpty` را نمی‌شناخت
  const old = stepsUntil({
    ...makeThrottleWatch(),
    saw: ((inner) => (t, k) => inner.saw({ ...t, falseEmpty: undefined }, k))(makeThrottleWatch()),
  });
  check('روی شکلِ واقعی، حکم زودتر می‌رسد', now < old, `اکنون ${now} · قبلاً ${old}`);
  check('و دیر نیست — پیش از بیست درخواست', now <= 20, String(now));
}

group('۲۹۵. تاریخِ عرضهٔ نامعلوم، از تاریخچهٔ روزانهٔ خودِ قرارداد');
{
  const unlisted = [{ ins: '9', kind: 'call', listingKnown: false, activeFrom: 0, expiry: 20261220 }];
  const daily = { 9: { rows: [
    { date: 20260916, trades: 0, vol: 0 },
    { date: 20260919, trades: 12, vol: 30 },
    { date: 20260920, trades: 5, vol: 9 },
  ] } };
  const { recovered, still } = recoverListingFromDaily(unlisted, daily);
  check('اولین روزِ **معامله‌دار** کف می‌شود، نه اولین ردیف',
    recovered.length === 1 && recovered[0].activeFrom === 20260919);
  check('و منبعش روی رکورد می‌نشیند', recovered[0].listingSource === 'daily-first-trade');
  check('و جفت‌ها از همان روز ساخته می‌شوند',
    dataExportPairs(recovered, [20260916, 20260919, 20260922]).map((p) => p.date).join() === '20260919,20260922');
  check('تابلوی خالی بازیابی نمی‌کند — «نمی‌دانیم» می‌ماند',
    recoverListingFromDaily(unlisted, {}).still.length === 1 && still.length === 0);
  check('و تابلوی بی‌معامله هم نه',
    recoverListingFromDaily(unlisted, { 9: { rows: [{ date: 20260916, trades: 0, vol: 0 }] } }).recovered.length === 0);
}

group('۲۹۵. نگهبانِ منبع');
{
  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('«تلاش تکمیلی» حکمِ سهمیهٔ قبلی را پاک می‌کند — وگرنه هرگز درخواستی نمی‌رفت',
    /async function refill\(\) \{[\s\S]{0,1600}throttled = null;/.test(tab));
  check('و می‌گوید سهمیه چند دقیقه پیش بسته شد',
    tab.includes('دقیقه پیش بسته شد؛ دوباره امتحان می‌شود'));
  check('حلقهٔ توقف، ردیفِ پرسیده را «پرسیده نشد» نمی‌نویسد',
    tab.includes('const asked = wasAsked(seen);') && tab.includes('error: askedDeniedText(seen),'));

  const server = readSrc('../server/server.mjs');
  check('سرور پرسیده‌نشده را صریح علامت می‌زند',
    server.includes("rows: [], source: 'history', throttled: true, skipped: true,"));
  check('و ردیفِ داده‌دار را «سهمیه» نمی‌کند',
    server.includes('items[key] = verdict && !tape.rows?.length && tape.complete !== true ? { ...tape, throttled: true } : tape;'));
  check('و «false خالی» را فقط وقتی علامت می‌زند که نوار کامل نشد',
    server.includes('const falseEmpty = !out.complete && !out.emptyBoth && !first.rows?.length'));

  const verify = readSrc('../tools/verify-export.mjs');
  check('راست‌آزما سهمیه را هم «دریافت‌نشده» می‌شمارد',
    verify.includes("|| (st.includes('سهمیهٔ بالادست') && !boardQuietRow(r))"));
  check('و پرسیده‌ها را از ستونِ پرچم جدا می‌کند، تا روی فایلِ قدیمی هم درست بگوید',
    verify.includes("const flagAt = at('پرچم درخواست');"));
  check('و دیگر نمی‌گوید «تلاشِ تکمیلی لازم ندارد»',
    !verify.includes('ردیفِ پشتِ سهمیه تلاشِ تکمیلی لازم ندارد'));

  const book = readSrc('../ui/data-export-workbook.mjs');
  check('برگ راهنما «همین بازه را دوباره بگیرید» را پس گرفت',
    !book.includes('چند ساعت بعد همین بازه را دوباره بگیرید') && book.includes('در همان صفحه بزنید'));
  check('و ستونِ پرچم می‌گوید هر پرچم چه داد',
    book.includes("hit.tried.map((t) => `${t.variant}: ${n(t.trades)} معامله`)"));

  const positions = readSrc('../ui/tabs/positions.mjs');
  check('نمودارِ درون‌روزی با بازارِ بسته این را اول می‌گوید',
    positions.includes("mode === 'intraday' && !tapeAt && state.watch?.stale === true")
    && positions.includes('${closedNow}${trackNote(series, mode)}'));
}
