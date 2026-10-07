// ۳۰۳. ارزش معاملات کندل روزانه — گزارش ضفزر729
//
// صاحب پروژه: «اعداد ارزش معاملات در کندل قیمت امروز قراردادها صحیح نیست.»
// ممیزی پنج علت پیدا کرد و این دسته هر پنج را قفل می‌کند:
//   ۱. ارزش به ریال و بی‌واحد چاپ می‌شد (حالا ریال با واحد، بزرگ‌ها میلیون ریال).
//   ۲. قیمت‌های کندل از `/api/infos` بودند و ارزش/حجم از عکس دیده‌بان؛ و
//      `vol` پاسخ اطلاعات هرگز روی `volume` ردیف نمی‌نشست.
//   ۳. پس از بستن بازار عکس دیده‌بان یخ می‌زد و تا فردا «امروز» خوانده می‌شد.
//   ۴. امضای تغییر ردیف، ارزش و تعداد معامله را نداشت.
//   ۵. ستون «ارزش» ریزمعاملهٔ اختیار اندازهٔ قرارداد را ضرب نمی‌کرد.

import { check, group, readSrc } from '../harness.mjs';
import { fmt } from '../../ui/fmt.mjs';
import { infoTotals, mergeRangeInfo, rangeHeading } from '../../core/range-info.mjs';
import {
  WATCH_TRACK, watchRowSig, diffWatchRows, afterCloseDue, afterCloseState, watchSession,
} from '../../core/watch-snapshot.mjs';
import { liveOptionTape } from '../../core/live-market.mjs';
import { tehranDateNumber } from '../../core/live-day.mjs';

// اعداد رسمی ضفزر729 در ۳۰ سپتامبر (پاسخ GetClosingPriceInfo)
const VALUE = 1051266669000;
const VOLUME = 12591;
const TRADES = 3016;

// ۱۴۰۵/۰۷/۰۸: صاحب پروژه «ریال همه‌جا، بزرگ‌ها میلیون ریال» خواست؛ این گروه
// پیش از این تومان را قفل می‌کرد و حالا ریال را.
group('۳۰۳. ارزش معاملات — ریال با واحد در نمایش');
{
  check('ارزش ضفزر729 به میلیون ریال و با واحد',
    fmt.rialText(VALUE) === '۱,۰۵۱,۲۶۷ میلیون ریال', fmt.rialText(VALUE));
  check('ستون جدول عدد میلیون ریال است، واحد در سرستون',
    fmt.mrial(VALUE) === '۱,۰۵۱,۲۶۷' && fmt.rial(VALUE) === '۱,۰۵۱,۲۶۶,۶۶۹,۰۰۰', fmt.mrial(VALUE));
  check('زیر هزار میلیون یک رقم اعشار، بی «٫۰»',
    fmt.rialText(2500000) === '۲٫۵ میلیون ریال' && fmt.rialText(2000000) === '۲ میلیون ریال');
  check('مرز گرد شدن: ۹۹۹٫۹۶ میلیون «۱,۰۰۰ میلیون» است، نه «۱۰۰۰٫۰»',
    fmt.rialText(999960000) === '۱,۰۰۰ میلیون ریال', fmt.rialText(999960000));
  check('زیر یک میلیون، خودِ ریال', fmt.rialText(25000) === '۲۵,۰۰۰ ریال');
  check('ارزش نامعلوم «—» است، نه صفر ریال',
    fmt.rialText(NaN) === '—' && fmt.mrial(NaN) === '—' && fmt.rialText(undefined) === '—');
  check('صفر واقعی صفر ریال است', fmt.rialText(0) === '۰ ریال');
  check('هیچ قالب تومانی باقی نمانده', fmt.toman === undefined && fmt.tomanShort === undefined);

  // کندل امروز از ۱۴۰۵/۰۷/۱۵ در تب خودش است.
  const map = readSrc('../ui/contract-candles-view.mjs');
  check('عدد کنار کندل با ریالِ دارای واحد چاپ می‌شود',
    map.includes("rangeSort === 'value' ? fmt.rialText(row.value)") && !/fmt\.money\([a-z.]*[vV]alue\)/.test(map));
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('هیچ ارزش معامله‌ای در داشبورد با fmt.money چاپ نمی‌شود',
    !/col\('(value|callValue|putValue|uaValue|cumulativeValue)', [^)]*'money'/.test(dash)
    && !dash.includes('ارزش ${fmt.money(row.value)}') && !/formatter: fmt\.money/.test(dash.replace(/function \w+\([^)]*formatter = fmt\.money[^)]*\)/g, ''))
    && dash.includes("col('value', 'ارزش معامله (میلیون ریال)', 'mrial',"));
  const table = readSrc('../ui/table.mjs');
  check('ستون میلیون ریال عددی است (راست‌چین، نقشهٔ گرما)', /NUM_FMT = new Set\(\[[^\]]*'mrial'/.test(table));
}

group('۳۰۳. عددهای کنار کندل از همان پاسخی که خود کندل');
{
  // شکل پاسخ واقعی `GetClosingPriceInfo` (میدان‌های مربوط)
  const raw = { qTotCap: VALUE, qTotTran5J: VOLUME, zTotTran: TRADES, pClosing: 83494, pDrCotVal: 83000 };
  const totals = infoTotals(raw);
  check('ارزش و حجم از پاسخ اطلاعات خوانده می‌شوند', totals.value === VALUE && totals.volume === VOLUME);
  check('ارزشِ نیامده نامعلوم است، نه صفر', infoTotals({}).value === null && infoTotals({ qTotCap: '' }).value === null);
  check('صفرِ آمده صفر است («معامله نشد»)', infoTotals({ qTotCap: 0 }).value === 0);

  // ۱۴۰۵/۰۷/۱۳: هر عددی که زنجیره هم نشان می‌دهد از همان ردیف عکس است؛
  // پاسخ اطلاعات فقط سایهٔ کندل را می‌دهد (آزمون کامل در دستهٔ ۳۲۴).
  const watchRow = { ins: '2650251901841248', name: 'ضفزر729', value: 5516563710000, volume: 8306, trades: 2000, oi: 12011, last: 83100, tradeLast: 83100, close: 83400, yday: 81000 };
  const info = { first: 80000, low: 79000, high: 86000, last: 83000, close: 83494, yday: 81000, vol: VOLUME, trades: TRADES, ...totals };
  const merged = mergeRangeInfo(watchRow, info);
  check('ارزش، حجم، تعداد و موقعیت باز کارت همان عدد زنجیره است', merged.value === watchRow.value && merged.volume === 8306 && merged.trades === 2000 && merged.oi === 12011 && merged.valueSource === 'watch');
  check('آخرین و پایانی کارت هم همان ردیف عکس است', merged.last === 83100 && merged.close === 83400);
  check('سایهٔ کندل از پاسخ اطلاعات', merged.first === 80000 && merged.low === 79000 && merged.high === 86000);
  check('پاسخِ خطادار ادغام نمی‌شود و سایه نامعلوم می‌ماند',
    Number.isNaN(mergeRangeInfo(watchRow, { error: 'TypeError: x', low: 1 }).low));

  const server = readSrc('../server/server.mjs');
  check('`/api/infos` ارزش و حجم را از همان GetClosingPriceInfo می‌دهد', server.includes('...infoTotals(d),'));
  const core = readSrc('../core/contract-candles.mjs'), view = readSrc('../ui/contract-candles-view.mjs');
  check('کندل با ادغام صریح ساخته می‌شود، نه با پخش خام پاسخ',
    core.includes('const merged = mergeRangeInfo(row, info);') && !/\.\.\.\(?infoCache|\.\.\.info\b/.test(core + view));
}

group('۳۰۳. امضای تغییر ردیف دیده‌بان ارزش و تعداد را هم می‌بیند');
{
  check('امضا ارزش و تعداد معامله هر دو سمت را دارد',
    ['qTotCap_C', 'qTotCap_P', 'zTotTran_C', 'zTotTran_P'].every((k) => WATCH_TRACK.includes(k)));
  const row = { insCode_C: 'C1', insCode_P: 'P1', qTotTran5J_C: VOLUME, qTotCap_C: VALUE, oP_C: 12011 };
  const first = diffWatchRows([row]);
  const fixedValue = { ...row, qTotCap_C: VALUE - 1000000 };
  const second = diffWatchRows([fixedValue], first.byKey);
  check('اصلاح ارزش بی تغییر حجم، «تغییر» شمرده و پخش می‌شود', second.changed.length === 1);
  check('ردیف بی‌تغییر پخش نمی‌شود', diffWatchRows([row], first.byKey).changed.length === 0);
  check('امضا از همان فهرست ساخته می‌شود', watchRowSig(row).split(',').length === WATCH_TRACK.length);
  const server = readSrc('../server/server.mjs');
  check('سرور فهرست محلیِ کهنه ندارد و از ماژول مشترک می‌خواند',
    !server.includes('const TRACK = [') && server.includes('diffWatchRows(rows, watch.byKey)'));
}

group('۳۰۳. پس از بستن بازار، عکس نهایی');
{
  const today = 20260930;
  const now = Date.UTC(2026, 8, 30, 10, 0, 0);
  const base = { phase: 'after', today, now, everySec: 300, maxPulls: 12 };
  check('در بازار باز این مسیر تصمیم نمی‌گیرد (حلقهٔ عادی می‌پرسد)', !afterCloseDue({ ...base, phase: 'open', watch: {} }));
  check('پیش از باز شدن و روز تعطیل چیزی پرسیده نمی‌شود',
    !afterCloseDue({ ...base, phase: 'before', watch: {} }) && !afterCloseDue({ ...base, phase: 'holiday', watch: {} }));
  check('عکسی که مال امروز نیست بی‌درنگ گرفته می‌شود',
    afterCloseDue({ ...base, watch: { day: 20260929, at: now - 1000 } }));
  check('عکس امروز تا فاصلهٔ کُند دوباره گرفته نمی‌شود',
    !afterCloseDue({ ...base, watch: { day: today, at: now - 60_000 } }));
  check('پس از فاصله، عکس دیگری گرفته می‌شود',
    afterCloseDue({ ...base, watch: { day: today, at: now - 300_000 } }));
  check('عکس نهایی ثابت‌شده دیگر پرسیده نمی‌شود',
    !afterCloseDue({ ...base, watch: { day: today, at: now - 900_000, finalDay: today } }));
  check('بیش از سقف پرسیده نمی‌شود',
    !afterCloseDue({ ...base, watch: { day: today, at: now - 900_000, afterPulls: 12 } }));

  const lastOpenTick = { day: today, phase: 'open', afterPulls: 0, finalDay: 0 };
  const moved = afterCloseState({ phase: 'after', today, prev: lastOpenTick, changedCount: 3 });
  check('عکس پس از بستن که ارقامش عوض شد هنوز نهایی نیست', moved.afterPulls === 1 && moved.finalDay === 0);
  const settled = afterCloseState({ phase: 'after', today, prev: { ...lastOpenTick, ...moved }, changedCount: 0 });
  check('دو عکس پشت‌سرهم یکی شدند: عکس نهایی', settled.finalDay === today && settled.afterPulls === 2);
  const fresh = afterCloseState({ phase: 'after', today, prev: { day: 20260929, afterPulls: 7, finalDay: 20260929 }, changedCount: 0, first: false });
  check('روز تازه شمار را از صفر می‌گیرد و عکس دیروز را نهایی امروز نمی‌خواند',
    fresh.afterPulls === 1 && fresh.finalDay === 0);
  check('عکس اولِ سرورِ تازه‌روشن‌شده نهایی خوانده نمی‌شود',
    afterCloseState({ phase: 'after', today, prev: { day: today }, changedCount: 0, first: true }).finalDay === 0);
  const server = readSrc('../server/server.mjs');
  check('حلقهٔ دیده‌بان در فاز بسته فقط با همین قاعده می‌پرسد',
    /if \(!gate\.open && !afterCloseDue\(\{/.test(server) && server.includes('S.afterCloseRefreshSec'));
}

group('۳۰۳. عکس دیروز «امروز» خوانده نمی‌شود');
{
  // ساعت تزریقی: ۱۱:۰۰ تهران ۳۰ سپتامبر و ۱۲:۲۹ تهران ۲۹ سپتامبر
  const todayAt = Date.UTC(2026, 8, 30, 7, 30, 0);
  const ydayAt = Date.UTC(2026, 8, 29, 8, 59, 0);
  const today = tehranDateNumber(todayAt);
  check('ساعت‌های تزریقی دو روز مختلف تهران‌اند', today > 0 && tehranDateNumber(ydayAt) !== today);

  const live = watchSession({ phase: 'open', at: todayAt, today });
  check('عکس بازار باز امروز، امروز است', live.current && live.date === today);
  const leftover = watchSession({ phase: 'after', at: ydayAt, today });
  check('عکسی که از دیروز در حافظه مانده، جلسهٔ قبل است و روزش گفته می‌شود',
    !leftover.current && leftover.date === tehranDateNumber(ydayAt));
  const preOpen = watchSession({ phase: 'before', at: todayAt, today });
  check('عکس پیش از باز شدن، حتی با ساعت امروز، امروز نیست', !preOpen.current && preOpen.why.length > 0);
  check('روز تعطیل هم جلسهٔ قبل است', !watchSession({ phase: 'holiday', at: todayAt, today }).current);
  check('بی عکس، هیچ روزی ادعا نمی‌شود', !watchSession({ phase: 'open', at: 0, today }).current);

  const current = rangeHeading({ current: true, final: true });
  check('عنوان کندل امروز فقط برای عکس امروز است',
    current.title === 'کندل قیمت امروز قراردادها' && current.note.includes('نهایی'));
  const old = rangeHeading({ current: false, date: 20260929, why: 'عکس از جلسهٔ قبل مانده است' }, (d) => `«${d}»`);
  check('عکس جلسهٔ قبل با برچسب و تاریخش نشان داده می‌شود',
    old.title === 'کندل قیمت جلسهٔ قبل («20260929»)' && !old.current);
  check('روزِ نامعلوم «امروز» ادعا نمی‌کند', !rangeHeading(null).title.includes('امروز'));

  const server = readSrc('../server/server.mjs');
  check('داشبورد زنده روزِ عکس را همراه می‌فرستد',
    /session: \{\s*\.\.\.session, final:/.test(server) && server.includes('phase: fromWatch ? watch.phase : marketOpen().phase'));
  const map = readSrc('../ui/contract-candles-view.mjs');
  check('عنوان کندل از روزِ عکس ساخته می‌شود', map.includes('rangeHeading(payload().session, dateLabel)'));
}

group('۳۰۳. ارزش ریزمعاملهٔ اختیار با اندازهٔ قرارداد');
{
  const trades = [
    { sequence: 1, time: 90010, price: 83000, quantity: 10, canceled: false, canceledKnown: true },
    { sequence: 2, time: 90020, price: 84000, quantity: 5, canceled: false, canceledKnown: true },
  ];
  const contract = { ins: 'C1', name: 'ضفزر729', kind: 'call', strike: 80000, days: 20, endDate: 20261021 };
  const sized = liveOptionTape({ trades, contract: { ...contract, size: 1000 }, settings: {} });
  check('ارزش هر معامله = تعداد × قیمت × اندازهٔ قرارداد',
    sized[0].value === 10 * 83000 * 1000 && sized[1].cumulativeValue === (10 * 83000 + 5 * 84000) * 1000);
  const unsized = liveOptionTape({ trades, contract, settings: {} });
  check('اندازهٔ نامعلوم ارزش نامعلوم می‌دهد، نه عددِ هزار برابر کمتر',
    Number.isNaN(unsized[0].value) && Number.isNaN(unsized[1].cumulativeValue) && unsized[1].cumulativeVolume === 15);
}
