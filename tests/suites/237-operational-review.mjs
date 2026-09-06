// ۲۳۷. گزارش آزمون عملیاتی روی `bd0a618` — هشت مورد
//
// ═══ آنچه در این دور مشترک بود ═══
//
// نوبتِ پیش درس گرفتیم که «سکوت» هم ایراد است. این دور یک قدم جلوتر
// رفت: چند مورد **حرف می‌زدند، ولی حرفِ غلط**. جدولِ تاریخی با دادهٔ
// زنده جایگزین می‌شد، جزئیاتِ ردیفِ تاریخی «اسپرد ۰٪» نشان می‌داد، و
// پیوند ترکیبی **دیگر** را انتخاب‌شده می‌گذاشت. عددِ غلطِ با ظاهرِ
// معتبر، از خانهٔ خالی خطرناک‌تر است.

import { check, group, readSrc } from '../harness.mjs';
import { COLUMNS, breakevenStatus } from '../../core/evaluate.mjs';
import { radarProfile, RADAR_FILTERS } from '../../core/strategy-radar.mjs';
import { CATALOG, byId } from '../../strategies/catalog.mjs';
import { handoffEntryDate } from '../../ui/handoff.mjs';
import { isHistoricalRow } from '../../core/history-chain.mjs';
import { buildChain } from '../../core/chain.mjs';
import { scan } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';

const profiles = CATALOG.map((def) => [def, radarProfile(def)]);
const stratSrc = readSrc('../ui/tabs/strategy.mjs');

group('۲۳۷ ایراد ۱ — بلیتِ داده: نویسندهٔ کهنه نمی‌نویسد');

// «رصد زنده را روشن کردم و فوراً به رصد تاریخی رفتم … اسکنِ درحال‌اجرا
// بعداً تمام شد و جدول را با ۲۱ ردیف زنده عوض کرد.»
//
// خاموش‌کردنِ کنترل کافی نبود، چون درخواستِ در راه همچنان برمی‌گشت.
// مسئله ترتیب نیست، مالکیت است.
check('هر نویسنده هنگام شروع بلیت می‌گیرد',
  stratSrc.includes("takeTicket('live')") && stratSrc.includes("takeTicket('history')"));
check('و پیش از نوشتن می‌سنجد که هنوز آخرین نویسنده است',
  stratSrc.includes('if (!holdsTicket(ticket)) return;')
  && stratSrc.includes('if (!holdsTicket(ticket)) { hSetStatus'));
// بلیت باید **هنگام رفتن به زیرتب** باطل شود، نه هنگام رسیدن نتیجه؛
// وگرنه تا بازگشتِ اسکن پنجره‌ای باز می‌ماند.
check('رفتن به زیرتب تاریخی، بلیت را همان‌جا باطل می‌کند',
  stratSrc.includes("if (id === 'history') {\n        // بلیت را همین‌جا باطل می‌کنیم"));
check('و بازگشت به زیرتب زنده می‌گوید جدول هنوز تاریخی است',
  stratSrc.includes("if (id === 'live' && dataSource !== 'live')"));

group('۲۳۷ ایراد ۲ — ردیف تاریخی، دفترِ امروز را نشان نمی‌دهد');

// ═══ چرا این عددِ ساختگی بود ═══
//
// `underlyingQuote` وقتی دفتر ندارد `bid` و `ask` را برابرِ قیمت
// می‌گذارد و `assumedDepth` می‌زند — فرضی که در رصدِ زنده مرحلهٔ دو
// اصلاحش می‌کند. در گذشته مرحلهٔ دومی نیست، پس روی صفحه می‌شد
// «اسپرد ۰٪»: ادعای بازارِ دوطرفهٔ کامل برای روزی که دفترش نبوده.
const past = { historyDate: 20260103 };
check('ردیف تاریخی شناخته می‌شود', isHistoricalRow(past) === true);
check('و ردیف زنده با آن اشتباه نمی‌شود',
  isHistoricalRow({}) === false && isHistoricalRow({ historyDate: 0 }) === false
  && isHistoricalRow(null) === false);
check('ستون‌های دفتری در حالت تاریخی اصلاً ساخته نمی‌شوند، نه اینکه «—» بگیرند',
  stratSrc.includes("const bookCols = past ? '' :") && stratSrc.includes('${past ? \'\' : `<td class="n">${fmt.money(l.mid)}</td>'));
check('«اگر همین حالا ببندی» برای ردیف تاریخی جایگزین می‌شود',
  stratSrc.includes('در گذشته معنی ندارد'));
check('«سقف حجم» هم که عمق‌محور است، برای ردیف تاریخی کشیده نمی‌شود',
  stratSrc.includes('سقف حجم از عمقِ دفتر می‌آید و دفترِ گذشته وجود ندارد'));
check('و تسویه با آخرین/پایانی، تاریخِ همان روز را در برچسبش می‌گوید',
  stratSrc.includes('اگر با آخرین معاملهٔ ${faDigits(historyDateLabel(r.historyDate))} تسویه کنی'));

group('۲۳۷ ایراد ۳ — روزِ ورود، پیش از دانستنِ ترکیب انتخاب می‌شد');

// «ترکیبِ +۶۸۰۰۰/−۷۴۰۰۰ فرستاده شد؛ آزمایشگاه ۱۶۰۰۰/۱۸۰۰۰ و رصد یونانی
// ۲۰۰۰۰/۲۲۰۰۰ را انتخاب کردند.»
const dates = [20260101, 20260102, 20260103, 20260104];
const priced = (ins, date) => (ins.startsWith('new') ? date >= 20260103 : true);
check('تازه‌ترین روزی که همهٔ پاها در آن قیمت دارند برداشته می‌شود',
  handoffEntryDate({ legIns: ['new1', 'new2'] }, dates, priced) === 20260104);
check('نه قدیمی‌ترین روز — همان چیزی که ترکیبِ اشتباه می‌ساخت',
  handoffEntryDate({ legIns: ['new1', 'new2'] }, dates, priced) !== dates[0]);
check('اگر هیچ روزی همهٔ پاها را ندارد، صفر می‌دهد نه حدس',
  handoffEntryDate({ legIns: ['new1'] }, [20260101, 20260102], priced) === 0);
// و مهم‌تر از پیدا کردنِ روز: وقتی پیدا نشد، **انتخابِ غلط نمی‌ماند**.
check('آزمایشگاه، ترکیبِ پیدانشده را با گزینهٔ «انتخاب نشد» جایگزین می‌کند',
  readSrc('../ui/tabs/backtest.mjs').includes('ترکیبِ منتقل‌شده در این روز نیست'));
check('رصد یونانی هم همان کار را می‌کند، نه اینکه روی پیش‌فرضش بماند',
  readSrc('../ui/tabs/greeks-watch.mjs').includes('ترکیبِ منتقل‌شده در این روز نیست'));

group('۲۳۷ ایراد ۴ — بازارِ بسته، «پای بی‌معامله» نیست');

// «برای همهٔ ۳۶ استراتژی … نتیجه همیشه هیچ لحظه‌ای عدد کامل ندارد بود.»
// آزمون در بازارِ بسته انجام شده بود؛ جملهٔ «این پا امروز معامله نشده»
// غلط نیست ولی محدودیتِ ساعت را به حسابِ نقدشوندگیِ نماد می‌گذارد.
check('نوارِ معامله وضعیت بازار را هم برمی‌گرداند',
  readSrc('../server/server.mjs').includes('market: marketOpen(), items')
  && readSrc('../ui/strategy-history.mjs').includes('market: payload.market || null'));
check('و وقتی بازار بسته است و هیچ پایی معامله ندارد، همان گفته می‌شود',
  stratSrc.includes("market.open === false && allMute") && stratSrc.includes('بازار باز نیست'));
check('این جمله جای جملهٔ «پای ساکت» را می‌گیرد، نه اینکه کنارش بنشیند',
  stratSrc.includes('closedNote || trailNote(trail)'));

group('۲۳۷ ایراد ۵ — سررسیدِ هر پا در ترکیب چندسررسیدی');

const calendar = radarProfile(byId('calendar-call'));
check('ستون «سررسید پاها» و «روز مانده پاها» در قرارداد ستونی هستند',
  COLUMNS.some((c) => c.key === 'expiryList') && COLUMNS.some((c) => c.key === 'daysList'));
check('و در نمای پیش‌فرضِ تقویمی و مورب‌اند، نه در انتخابگر',
  ['calendar-call', 'calendar-put', 'diagonal-call', 'diagonal-put']
    .every((id) => radarProfile(byId(id)).columns.includes('expiryList')
      && radarProfile(byId(id)).columns.includes('daysList')));
check('پای اختیار سررسیدِ خودش را حمل می‌کند، نه سررسیدِ نزدیکِ ترکیب',
  readSrc('../core/scan.mjs').includes('days: ex.days, endDate: ex.endDate,'));
check('و جدولِ پاها در جزئیات، ستونِ سررسید و روز دارد',
  stratSrc.includes('<th>سررسید</th><th>روز</th>'));
check('پای سهم سررسید ندارد و «—» می‌شود، نه امروز',
  stratSrc.includes("l.endDate ? faDigits(historyDateLabel(l.endDate)) : '—'"));
// و تاریخِ نمایشی رقم فارسی دارد — همان چیزی که عکس‌گرفتن نشانش داد و
// نگهبان ۳ حالا قفلش می‌کند.
check('هر تاریخِ نمایشی این تب از faDigits رد می‌شود',
  !/\$\{historyDateLabel\(/.test(stratSrc));

group('۲۳۷ ایراد ۶ — صفر قرارداد، موقعیت نیست');

check('حجم به دست‌کم یک برمی‌گردد و کادر هم همان را نشان می‌دهد',
  stratSrc.includes('qty = Math.max(1, Math.trunc(v) || 1);')
  && stratSrc.includes('حجم دست‌کم یک قرارداد است — به یک برگردانده شد'));

group('۲۳۷ ایراد ۷ — ستون و فیلترِ پا، به تعدادِ پاهای واقعی');

// «جدول باکس چهار پای جدا دارد، ولی کارت فیلتر فقط پای ۱ و پای ۲ را
// ارائه می‌کند.» بریدنِ پای اضافه از قبل قاعده بود؛ افزودنِ پای جامانده
// نبود.
const legValueCols = (p) => p.columns.filter((k) => /^legValue\d+$/.test(k)).length;
const legValueFilters = (p) => p.filters.filter((f) => /^minLegValue\d+$/.test(f.key)).length;
check('هر نمایه‌ای که ستون ارزشِ پا دارد، به تعداد پاهای خودش دارد',
  profiles.every(([def, p]) => legValueCols(p) === 0
    || legValueCols(p) === Math.min(def.legs.length, 4)));
check('و فیلترش هم همان تعداد است، نه دوتای ثابت',
  profiles.every(([def, p]) => legValueFilters(p) === 0
    || legValueFilters(p) === Math.min(def.legs.length, 4)));
check('باکسِ چهارپا هر چهار فیلترِ ارزشِ پا را دارد',
  legValueFilters(radarProfile(byId('box'))) === 4
  && legValueCols(radarProfile(byId('box'))) === 4);
check('و تک‌پا فقط یکی — پای دومِ نبوده فیلتر نمی‌سازد',
  legValueFilters(radarProfile(byId('long-call'))) === 1);
check('هیچ نمایه‌ای کلیدِ ناشناخته نگرفت', profiles.every(([, p]) => p.unknown.length === 0));
check('و هر فیلترِ ارزشِ پا در فهرست فیلترها هست',
  [1, 2, 3, 4].every((n) => RADAR_FILTERS.some((f) => f.key === `minLegValue${n}`)));

group('۲۳۷ — سررسیدِ پاها از موتور، نه از رابط');

// رفتار واقعیِ ستون: یک تقویمی با دو سررسید ساخته می‌شود و می‌سنجیم که
// هر دو تاریخ در ردیف باشند — ادعای متنی این را نمی‌گرفت.
const day = 24 * 3600 * 1000;
const stamp = (offset) => {
  const d = new Date(Date.now() + offset * day);
  return Number(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
};
const watchRow = (days, endDate, callIns, putIns) => ({
  uaInsCode: 'UA1', lval30_UA: 'خودرو', insCode_C: callIns, insCode_P: putIns,
  lVal18AFC_C: `ض${callIns}`, lVal18AFC_P: `ط${putIns}`,
  strikePrice: 10000, contractSize: 1000, endDate, remainedDay: days,
  pDrCotVal_UA: 10000, pClosing_UA: 10000, qTotTran5J_UA: 1e6, qTotCap_UA: 1e10,
  pMeDem_C: 500, qTitMeDem_C: 1000, pMeOf_C: 520, qTitMeOf_C: 1000,
  pDrCotVal_C: 510, pClosing_C: 510, qTotTran5J_C: 500, qTotCap_C: 1e9, oP_C: 500,
  pMeDem_P: 300, qTitMeDem_P: 1000, pMeOf_P: 320, qTitMeOf_P: 1000,
  pDrCotVal_P: 310, pClosing_P: 310, qTotTran5J_P: 500, qTotCap_P: 1e9, oP_P: 500,
});
const twoExpiry = buildChain([watchRow(30, stamp(30), 'C1', 'P1'), watchRow(90, stamp(90), 'C2', 'P2')]);
const calRows = scan({
  def: byId('calendar-call'), chain: twoExpiry, uaKeys: ['UA1'],
  settings: { ...defaults(), showUnexecutable: true, minReturnPct: -1e9, minUaLiquidity: 0, minLegVol: 0, minLegValue: 0, minOpenInt: 0, minBidQty: 0, maxDays: 400 },
  qty: 1,
}).rows;
check('تقویمی با دو سررسید ساخته شد', calRows.length > 0);
check('و ردیفش هر دو سررسید را حمل می‌کند، نه فقط نزدیک را',
  calRows[0].expiryList.length === 2 && calRows[0].daysList.length === 2);
check('«تاریخ سررسید» همچنان نزدیک‌ترین است — مبنای «روز مانده» عوض نشد',
  calRows[0].expiryList[0] === calRows[0].expiryLabel);
check('و هر پا سررسیدِ خودش را در جزئیات دارد',
  calRows[0].legPrices.filter((l) => l.endDate > 0).length === 2
  && new Set(calRows[0].legPrices.map((l) => l.endDate)).size === 2);
// ترکیبِ تک‌سررسید هم باید کار کند: فهرستش یک عضو دارد، نه خالی.
const single = scan({
  def: byId('long-call'), chain: twoExpiry, uaKeys: ['UA1'],
  settings: { ...defaults(), showUnexecutable: true, minReturnPct: -1e9, minUaLiquidity: 0, minLegVol: 0, minLegValue: 0, minOpenInt: 0, minBidQty: 0, maxDays: 400 },
  qty: 1,
}).rows[0];
check('ترکیبِ تک‌سررسید، فهرستِ یک‌عضوی می‌دهد نه خالی',
  single.expiryList.length === 1 && single.daysList.length === 1);
check('«وضعیت سربه‌سری» هم که دور پیش آمد، هنوز سرِ جایش است',
  breakevenStatus({ breakevens: [], maxProfit: -1, maxLoss: 5 }).alwaysLoss === true);
