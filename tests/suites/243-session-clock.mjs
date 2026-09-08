// ۲۴۳. ساعتِ جلسه — تهران، نه ماشینِ کاربر
//
// ═══ ایرادی که این دسته برای آن ساخته شد ═══
//
// گزارش ۱۴۰۵/۰۶/۱۷: «ساعت سیستم ۰۳:۳۹، ساعت تهران ۱۳:۰۹، شروع جلسه در موتور
// ۰۹:۰۰. بنابراین برنامه سقف زمانی را ۰۳:۳۹ تشخیص می‌دهد؛ یعنی قبل از شروع
// بازار.» نتیجه: صفر لحظه، صفر معامله برای هر دو پا، و هیچ نموداری — در
// حالی که تابلو هزاران ریزمعامله داشت و `/api/live-trades` هم سالم بود.
//
// ═══ و چرا مجموعهٔ سبزِ ۵۹۶۰تایی آن را ندید ═══
//
// خودِ گزارش جواب را داد: «آزمون‌ها فقط `until` را به‌صورت عدد آماده به
// موتور می‌دهند. هیچ آزمونی بررسی نمی‌کند که timestamp واقعی در منطقهٔ زمانی
// غیرتهران چگونه به ثانیهٔ جلسه تبدیل می‌شود.»
//
// یعنی همان درسِ ثبت‌شده، یک پله بالاتر: آزمونی که **ورودیِ آماده** می‌دهد،
// خودِ تبدیل را نمی‌بیند. پس این دسته از `TZ` واقعی شروع می‌کند.

import { check, group, readSrc } from '../harness.mjs';
import { tehranSecondOfDay } from '../../core/live-quote.mjs';
import { sessionTrail, legActivity } from '../../core/session-trail.mjs';

// همان لحظهٔ گزارش: ۰۹:۳۹ UTC، که در تهران (+۰۳:۳۰) می‌شود ۱۳:۰۹.
const AT = Date.UTC(2026, 8, 7, 9, 39, 0);
const TEHRAN = 13 * 3600 + 9 * 60;
const ZONES = ['UTC', 'America/Los_Angeles', 'Asia/Tehran', 'Australia/Sydney', 'America/Sao_Paulo'];

/** فرمولِ شکسته‌ای که تا امروز در «ردِ جلسه» بود — برای مقایسه، نه برای استفاده. */
const localSecondOfDay = (at) => {
  const d = new Date(at);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
};

const withZone = (tz, fn) => {
  const had = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (had === undefined) delete process.env.TZ; else process.env.TZ = had;
  }
};

group('۲۴۳ — ثانیهٔ جلسه به منطقهٔ زمانیِ ماشین بستگی ندارد');

const answers = ZONES.map((tz) => withZone(tz, () => tehranSecondOfDay(AT)));
check('یک لحظه، در هر منطقهٔ زمانی یک جواب می‌دهد',
  new Set(answers).size === 1);
check('و آن جواب، ساعتِ تهرانِ همان لحظه است — ۱۳:۰۹',
  answers[0] === TEHRAN);

// ═══ و همین‌جا ثابت می‌شود که ایراد واقعی بود ═══
//
// اگر فرمولِ محلی هم همه‌جا یک جواب می‌داد، این دسته بی‌معنی بود.
const localAnswers = ZONES.map((tz) => withZone(tz, () => localSecondOfDay(AT)));
check('فرمولِ محلی برعکس، در هر منطقه جوابِ دیگری می‌دهد',
  new Set(localAnswers).size === ZONES.length);
check('و بیرون از تهران با ساعتِ بازار نمی‌خواند',
  ZONES.filter((tz) => tz !== 'Asia/Tehran')
    .every((tz) => withZone(tz, () => localSecondOfDay(AT)) !== TEHRAN));
check('روی ماشینِ عقب‌تر، سقفِ زمان پیش از بازگشایی می‌افتد — همان چیزی که گزارش دید',
  withZone('America/Los_Angeles', () => localSecondOfDay(AT)) < 9 * 3600
  && tehranSecondOfDay(AT) > 9 * 3600);

// نیم‌ساعتِ اختلافِ تهران هم باید درست بیفتد، نه گرد شود.
check('اختلافِ نیم‌ساعتیِ تهران گرد نمی‌شود',
  tehranSecondOfDay(Date.UTC(2026, 8, 7, 5, 30, 0)) === 9 * 3600
  && tehranSecondOfDay(Date.UTC(2026, 8, 7, 5, 29, 0)) === 8 * 3600 + 59 * 60);
check('نیمه‌شبِ تهران صفر است، نه ۲۴',
  tehranSecondOfDay(Date.UTC(2026, 8, 6, 20, 30, 0)) === 0);
check('ورودیِ بی‌معنا عدد نمی‌سازد',
  Number.isNaN(tehranSecondOfDay('نه‌عدد')) && Number.isNaN(tehranSecondOfDay(NaN)));

group('۲۴۳ — مسیرِ واقعی: از مهرِ زمان تا نقطه‌های نمودار');

// ═══ چرا با `until`ِ آماده کافی نبود ═══
//
// دستهٔ ۲۳۴ عددِ ثانیه را مستقیم می‌داد و همیشه سبز بود. اینجا `until` از
// همان `at`ی می‌آید که رابط می‌دهد، و زیر پنج منطقهٔ زمانی سنجیده می‌شود.
const legs = [
  { ins: 'C1', kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 1000, name: 'ضهرم۱' },
  { ins: 'P1', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 1000, name: 'طهرم۱' },
];
const t = (hhmmss, price) => ({ time: hhmmss, price, quantity: 10 });
const tape = {
  C1: [t(93000, 800), t(103000, 850), t(120000, 900)],
  P1: [t(93500, 300), t(104000, 330), t(121500, 350)],
};
const trailAt = (tz) => withZone(tz, () => sessionTrail({
  legs, tapeByIns: tape, grain: 'm30', until: tehranSecondOfDay(AT),
}));

const runs = ZONES.map((tz) => [tz, trailAt(tz)]);
check('در هر منطقهٔ زمانی، همان تعداد لحظهٔ کامل ساخته می‌شود',
  new Set(runs.map(([, r]) => r.complete)).size === 1 && runs[0][1].complete > 0);
check('و همان تعداد ستون',
  new Set(runs.map(([, r]) => r.moments)).size === 1);
check('هیچ پایی «امروز معامله نشده» نمی‌شود — تابلو معامله داشت',
  runs.every(([, r]) => (r.legReport || []).every((leg) => leg.silent === false)));
check('نمودار نقطه دارد، پس ساخته می‌شود',
  runs.every(([, r]) => r.points.filter((p) => p.complete).length > 0));

// و با فرمولِ شکسته، همان ورودی روی ماشینِ عقب‌تر خالی درمی‌آید.
const broken = withZone('America/Los_Angeles', () => sessionTrail({
  legs, tapeByIns: tape, grain: 'm30', until: localSecondOfDay(AT),
}));
check('با ساعتِ محلیِ ماشینِ عقب‌تر، هیچ لحظهٔ کاملی ساخته نمی‌شد',
  broken.complete === 0);
check('و هر دو پا اشتباهاً ساکت شمرده می‌شدند',
  (broken.legReport || []).every((leg) => leg.silent === true));
check('کارنامهٔ پاها هم با ساعتِ درست، هر دو را فعال می‌بیند',
  legActivity(legs, tape, { until: tehranSecondOfDay(AT) })
    .every((leg) => leg.trades > 0 && leg.silent === false));

group('۲۴۳ — رابط: ساعتِ درست، و پیامی که پاک نمی‌شود');

const src = readSrc('../ui/tabs/strategy.mjs');
check('«ردِ جلسه» ساعتِ تهران را صدا می‌زند',
  src.includes('const until = tehranSecondOfDay(at || Date.now());'));
check('و دیگر از ساعتِ محلیِ مرورگر ثانیهٔ جلسه نمی‌سازد',
  !src.includes('now.getHours() * 3600'));
check('مبنا مهرِ زمانِ سرور است، و ساعتِ این ماشین فقط جانشین',
  src.includes('at || Date.now()'));

// «۷ لحظهٔ کامل از ۷ — تغییر …» نباید با نام ترکیب جایگزین شود.
check('پیامِ نتیجه پس از اجرا پاک نمی‌شود',
  src.includes('trailReady({ keepStatus: true });'));
check('و قفلِ دکمه همچنان در هر دو حالت کار می‌کند',
  src.includes('tRun.disabled = !ok || tBusy;') && src.includes('if (keepStatus) return;'));
