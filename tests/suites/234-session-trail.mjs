// ۲۳۴. ردِ جلسه — یک ترکیب، از بازگشایی تا همین لحظه
//
// ═══ خواسته‌ای که این دسته جوابش است (بندِ ۱۰) ═══
//
// «با انتخاب یک ترکیب خاص قابلیت رصد اون ترکیب از لحظه شروع بازار تا
// الان وجود داشته باشه.»
//
// ═══ آنچه سنجیده می‌شود ═══
//
// نه اینکه نموداری کشیده می‌شود، بلکه اینکه **چه چیزی نقطه نمی‌سازد**:
// پایی که هنوز معامله نشده، لحظه‌ای که هنوز نرسیده، و معامله‌ای که باطل
// شده یا بیرون از جلسهٔ پیوسته است.

import { check, group } from '../harness.mjs';
import { sessionTrail, trailNote, trailPoint } from '../../core/session-trail.mjs';

const trade = (time, price, quantity = 10, extra = {}) => ({ time, price, quantity, ...extra });

// یک اسپردِ کال: خرید ۱۰۰۰ و فروش ۱۲۰۰، هر کدام اندازهٔ ۱۰۰۰.
const legs = [
  { ins: 'C1', kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 1000, name: 'ضخود۱' },
  { ins: 'C2', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 1200, name: 'ضخود۲' },
];

const tape = {
  C1: [trade(90500, 800), trade(101500, 850), trade(120000, 900)],
  C2: [trade(91000, 300), trade(103000, 330)],
};

group('۲۳۴ ردِ جلسه — یک لحظه');

const at1000 = trailPoint(legs, tape, 10 * 3600);
check('در ساعت ده، هر دو پا آخرین معاملهٔ خودشان را دارند',
  at1000.complete === true && at1000.legs[0].price === 800 && at1000.legs[1].price === 300);
// خرید منفی است چون پول می‌دهی: -۸۰۰×۱۰۰۰ + ۳۰۰×۱۰۰۰ = -۵۰۰٬۰۰۰
check('نقد ناخالص از همان `grossCash` می‌آید، نه از حسابِ دستیِ دوباره',
  at1000.grossCash === -500000 && at1000.netCash === -500000);
check('کارمزد، اگر داده شود، از نقد خالص کم می‌شود',
  trailPoint(legs, tape, 10 * 3600, { fees: { option: 0.001 } }).netCash === -500000 - 1100);

// ═══ ناهم‌زمانی پنهان نمی‌شود ═══
//
// در ساعت ده، `C1` ساعت ۹:۰۵ معامله شده و `C2` ساعت ۹:۱۰. عدد ساخته
// می‌شود، ولی هر دو سنِ خودش را حمل می‌کند.
check('سنِ کهنه‌ترین پا نسبت به همان لحظه ثبت می‌شود',
  at1000.maxAgeSec === (10 * 3600) - (9 * 3600 + 5 * 60));
check('و پهنای ناهم‌زمانیِ خودِ پاها جدا ثبت می‌شود — همان چیزی که «می‌شد اجرا کرد؟» به آن بستگی دارد',
  at1000.spanSec === (9 * 3600 + 10 * 60) - (9 * 3600 + 5 * 60));

const at0910 = trailPoint(legs, tape, 9 * 3600 + 9 * 60);
check('پایی که تا آن لحظه هرگز معامله نشده، نقطه را ناقص می‌کند',
  at0910.complete === false && !Number.isFinite(at0910.netCash));
check('و می‌گوید کدام پا بی‌قیمت بود',
  at0910.legs[0].price === 800 && !Number.isFinite(at0910.legs[1].price));

// ═══ معاملهٔ باطل و بیرون از جلسه ═══
const dirty = {
  C1: [trade(85500, 1), trade(101500, 850), trade(110000, 999, 10, { canceled: true })],
  C2: [trade(103000, 330)],
};
const clean = trailPoint(legs, dirty, 12 * 3600);
check('معاملهٔ پیش از بازگشایی وارد نمی‌شود', clean.legs[0].price !== 1);
check('و معاملهٔ باطل‌شده هم وارد نمی‌شود', clean.legs[0].price === 850);

group('۲۳۴ ردِ جلسه — کلِ مسیر');

// نوارِ دومی که پای فروشش دیر شروع می‌کند — تا «شکاف» واقعاً سنجیده شود.
// در نوارِ بالا هر دو پا پیش از نخستین لحظهٔ شبکه (۰۹:۳۰) معامله دارند و
// هیچ شکافی نمی‌سازد.
const lateTape = { C1: tape.C1, C2: [trade(103000, 330), trade(120500, 350)] };
const trail = sessionTrail({ legs, tapeByIns: lateTape, grain: 'm30' });
check('نقطه‌ها روی شبکهٔ دانه‌بندی می‌نشینند، نه روی هر معامله',
  trail.points.length === trail.moments && trail.grain === 'm30');
check('لحظه‌های پیش از معاملهٔ همهٔ پاها شکاف‌اند، نه صفر',
  trail.gaps > 0 && trail.points.filter((p) => !p.complete).every((p) => !Number.isFinite(p.netCash)));
check('اولین و آخرین نقطهٔ کامل جدا برمی‌گردند',
  trail.first?.complete === true && trail.last?.complete === true
  && trail.first.second < trail.last.second);
check('کف و سقف و تغییرِ جلسه از نقطه‌های کامل ساخته می‌شوند',
  Number.isFinite(trail.min) && Number.isFinite(trail.max) && trail.min <= trail.max
  && trail.change === trail.last.netCash - trail.first.netCash);

// ═══ لحظه‌ای که هنوز نرسیده، ستون نیست ═══
//
// بی این، نمودارِ ساعت یازده تا انتهای جلسه یک خطِ صافِ دروغین می‌شد که
// خواننده آن را «بازار تکان نخورد» می‌خواند.
const half = sessionTrail({ legs, tapeByIns: lateTape, grain: 'm30', until: 11 * 3600 });
check('نقطه‌های بعد از «همین لحظه» ساخته نمی‌شوند',
  half.points.length < trail.points.length && half.points.every((p) => p.second <= 11 * 3600));

// ═══ دانه‌بندی ═══
const fine = sessionTrail({ legs, tapeByIns: lateTape, grain: 'm5' });
check('دانهٔ ریزتر، نقطهٔ بیشتر می‌دهد', fine.points.length > trail.points.length);
check('«روزانه» در ردِ جلسه معنی ندارد و به نیم‌ساعت می‌افتد',
  sessionTrail({ legs, tapeByIns: lateTape, grain: 'day' }).grain === 'm30');

// ═══ پای بی‌معاملهٔ کلِ روز ═══
const mute = sessionTrail({ legs, tapeByIns: { C1: tape.C1 }, grain: 'm30' });
check('اگر یک پا کلِ روز معامله نداشته باشد، هیچ نقطهٔ کاملی نیست',
  mute.complete === 0 && mute.silentLegs.includes('C2'));
check('و جملهٔ صداقت همان را می‌گوید، نه «داده نداریم»',
  trailNote(mute).includes('هیچ معامله‌ای نداشته'));
check('جملهٔ مسیرِ سالم، ناهم‌زمانی را صریح می‌گوید',
  trailNote(trail).includes('هم‌زمان معامله نمی‌شوند') && trailNote(trail).includes('مرجع است'));

// ═══ پای سهم پایه ═══
const withStock = [
  { kind: 'underlying', side: 'buy', ratio: 1, size: 1000, name: 'خودرو' },
  { ins: 'C2', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 1200, name: 'ضخود۲' },
];
const covered = trailPoint(withStock, { UA1: [trade(93000, 9500)], C2: tape.C2 }, 11 * 3600, { uaIns: 'UA1' });
check('پای سهم پایه هم از نوارِ خودش قیمت می‌گیرد',
  covered.complete === true && covered.legs[0].price === 9500);
check('و بی کد ابزارِ پایه، همان پا نقطه را ناقص می‌کند',
  trailPoint(withStock, { C2: tape.C2 }, 11 * 3600).complete === false);
