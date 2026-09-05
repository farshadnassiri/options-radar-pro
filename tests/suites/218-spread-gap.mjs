// ۲۱۸. فاصله — اسپرد به معنی لغویش
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «چون اسپرد به معنی فاصله است، در هر استراتژی که می‌سازی برای اسپرد:
// میزان اسپرد یعنی فاصله را در لحظه مشخص کن… فاصله بین اعمال‌ها رو هم
// مشخص کن… عدد فاصله اکنون را بر فاصله بین اعمال‌ها تقسیم کن… درصد هر دو
// را مشخص کن… یعنی این فاصله چقدر پر شده و چقدر جا داره پر بشه.»
//
// و برای استرانگل: «موقع فروش عدد ۳۰۰، یک دقیقه بعد ۳۱۰.»
//
// این دسته همان دو را می‌سنجد، و مهم‌تر: می‌سنجد که هیچ عددی **ساخته**
// نشود. پای بی‌قیمت باید فاصله را باطل کند نه اینکه صفر بگیرد — صفر
// گرفتن، فاصله‌ای می‌سازد که همیشه «جای زیادی برای پر شدن» نشان می‌دهد.

import { check, group, near, readSrc } from '../harness.mjs';
import {
  GAP_SCALES, GAP_STRATEGY_IDS, DEFAULT_SCALE, gapKind, gapMultiplier, gapNote, hasGap,
  measureGap, strikeAnchor, structureValue,
} from '../../core/spread-gap.mjs';
import {
  GAP_TIMEFRAMES, dailyGapSeries, gapVerdict, indexedPair, intradayGapSeries, percentileRank,
  quantile, resample, seriesStats, versusBase,
} from '../../core/spread-gap-series.mjs';
import {
  ALERT_METRICS, ALERT_OPS, alertSnapshot, evaluateAlerts, normalizeRule, ruleFires, ruleNote,
} from '../../core/gap-alert.mjs';
import { CATALOG } from '../../strategies/catalog.mjs';

// اسپرد صعودی کال: خرید ۵۰٬۰۰۰، فروش ۵۴٬۰۰۰، اندازهٔ ۱۰۰۰.
// عرض = ۴۰۰۰ × ۱۰۰۰ = ۴٬۰۰۰٬۰۰۰ ریال برای هر واحد.
const BULL = [
  { ins: 'c50', kind: 'call', side: 'buy', strike: 50000, size: 1000, ratio: 1, name: 'ضهرم۵۰' },
  { ins: 'c54', kind: 'call', side: 'sell', strike: 54000, size: 1000, ratio: 1, name: 'ضهرم۵۴' },
];
// استرانگل فروش: پوت ۴۶٬۰۰۰ و کال ۵۶٬۰۰۰. دهانه = ۱۰٬۰۰۰٬۰۰۰ ریال.
const STRANGLE = [
  { ins: 'p46', kind: 'put', side: 'sell', strike: 46000, size: 1000, ratio: 1, name: 'طهرم۴۶' },
  { ins: 'c56', kind: 'call', side: 'sell', strike: 56000, size: 1000, ratio: 1, name: 'ضهرم۵۶' },
];


group('۲۱۸-الف. کدام استراتژی فاصله دارد');
{
  check('اسپرد عمودی و استرانگل و کندور فاصله دارند',
    hasGap('bull-call-spread') && hasGap('short-strangle') && hasGap('iron-condor'));
  check('تک‌پا و استرادل فاصله ندارند — یک قیمت اعمال، فاصله نمی‌سازد',
    !hasGap('long-call') && !hasGap('long-straddle') && !hasGap('covered-call'));
  check('لنگرِ هر خانواده نامِ خودش را دارد، نه یک نامِ عمومی',
    gapKind('bull-call-spread') === 'vertical' && gapKind('short-strangle') === 'strangle'
    && gapKind('iron-condor') === 'wing' && gapKind('diagonal-call') === 'calendar');
  check('شناسهٔ ناشناخته null می‌دهد، نه پیش‌فرضِ خاموش',
    gapKind('چیزی-که-نیست') === null && hasGap(undefined) === false);
  // فهرست از کاتالوگ جدا نیفتد: استراتژی حذف‌شده نباید در فهرست فاصله بماند.
  const ids = new Set(CATALOG.map((def) => def.id));
  check('هر شناسهٔ فاصله‌دار واقعاً در کاتالوگ هست',
    GAP_STRATEGY_IDS.every((id) => ids.has(id)),
    GAP_STRATEGY_IDS.filter((id) => !ids.has(id)).join('، ') || 'همه هستند');
  check('و هر استراتژیِ دو قیمت اعمالی به بالا، فاصله‌دار شمرده شده',
    CATALOG.filter((def) => def.strikes >= 2 && def.id !== 'collar' && def.id !== 'long-straddle')
      .every((def) => hasGap(def.id)),
    CATALOG.filter((def) => def.strikes >= 2 && !hasGap(def.id)).map((def) => def.id).join('، ') || 'همه');
}


group('۲۱۸-ب. لنگر: فاصلهٔ اعمال');
{
  // ═══ مقیاس، انتخابِ کاربر است ═══
  //
  // گزارش صاحب پروژه: «ضرب کردن در اندازه قرارداد و حجم رو در اختیار
  // کاربر بذار که انتخاب بکنه یا نکنه.»
  //
  // پیش‌فرض `raw` است چون معامله‌گر روی تابلو **قیمت خام قرارداد** را
  // می‌بیند: کالِ ۵۰ روی ۳٬۲۰۰ و کالِ ۵۴ روی ۸۰۰، و آنچه با چشمش کم
  // می‌کند ۲٬۴۰۰ است. عددِ ۲٬۴۰۰٬۰۰۰ همان است ضربدر هزار، ولی با هیچ
  // عددی روی تابلو جور درنمی‌آید.
  check('پیش‌فرضِ مقیاس، قیمت خام است — نه ضرب‌شده',
    DEFAULT_SCALE === 'raw' && GAP_SCALES[0].id === 'raw');
  check('و هر سه مقیاس برچسب و راهنما دارند',
    GAP_SCALES.length === 3 && GAP_SCALES.every((row) => row.label && row.hint && row.unit)
    && GAP_SCALES.map((row) => row.id).join(',') === 'raw,size,qty');
  check('ضریب: خام یک است، اندازه همان اندازه، و تعداد در آن ضرب می‌شود',
    gapMultiplier({ scale: 'raw', size: 1000, units: 3 }) === 1
    && gapMultiplier({ scale: 'size', size: 1000, units: 3 }) === 1000
    && gapMultiplier({ scale: 'qty', size: 1000, units: 3 }) === 3000);

  const bull = strikeAnchor(BULL, 'vertical');
  check('عرضِ اسپرد چهارهزارتومانی، در مقیاس خام همان ۴٬۰۰۰ است',
    bull.ok && bull.anchor === 4000 && bull.raw === 4000, `${bull.anchor}`);
  check('و با ضریبِ اندازه، چهار میلیون ریال',
    strikeAnchor(BULL, 'vertical', 1000).anchor === 4e6);
  check('و قیمت‌های اعمال مرتب و یکتا برمی‌گردند',
    bull.strikes.join(',') === '50000,54000');

  const strangle = strikeAnchor(STRANGLE, 'strangle');
  check('دهانهٔ استرانگل ۴۶ تا ۵۶، ده هزار است',
    strangle.ok && strangle.anchor === 10000, `${strangle.anchor}`);

  // ── بال، نه پهنای کل ────────────────────────────────────────────────
  //
  // کندور چهار اعمال دارد و پهنای کلش ۱۲ هزار است، ولی آنچه سقفِ ارزش را
  // می‌سازد بالِ باریک‌تر است. گرفتنِ پهنای کل، سقفی می‌ساخت سه برابر
  // واقعیت — و «درصد پر شدن» را سه برابر خوش‌بینانه.
  const condor = [46, 50, 54, 58].map((k, i) => ({
    ins: `k${k}`, kind: i < 2 ? 'put' : 'call', side: i === 0 || i === 3 ? 'buy' : 'sell',
    strike: k * 1000, size: 1000, ratio: 1,
  }));
  const wing = strikeAnchor(condor, 'wing');
  check('لنگرِ کندور، بالِ باریک‌ترین است نه پهنای کل',
    wing.ok && wing.anchor === 4000 && wing.equalWings === true,
    `بال ${wing.anchor} در برابر پهنای کل ${58000 - 46000}`);
  const uneven = strikeAnchor([46, 50, 62].map((k) => ({
    ins: `u${k}`, kind: 'call', side: 'buy', strike: k * 1000, size: 1000, ratio: 1,
  })), 'wing');
  check('بالِ نامساوی: باریک‌ترین حاکم است، نه میانگین',
    uneven.anchor === 4000 && uneven.equalWings === false,
    `${uneven.wingWidths.join('، ')}`);

  check('یک قیمت اعمال یعنی فاصله‌ای نیست، و همین گفته می‌شود',
    !strikeAnchor([BULL[0]], 'vertical').ok
    && strikeAnchor([BULL[0]], 'vertical').why.includes('کمتر از دو'));
  check('دو اعمالِ یکسان هم فاصله نمی‌سازند',
    !strikeAnchor([BULL[0], { ...BULL[1], strike: 50000 }], 'vertical').ok);
  // در مقیاس خام، اندازهٔ قرارداد اصلاً وارد حساب نمی‌شود، پس نبودش هم
  // فاصله را باطل نمی‌کند. این تغییرِ عمدیِ همین نسخه است: پیش از این
  // ضرب اجباری بود و بی اندازه، هیچ عددی ساخته نمی‌شد.
  const sizeless = strikeAnchor(BULL.map((leg) => ({ ...leg, size: 0 })), 'vertical');
  check('بی اندازهٔ اعلام‌شده، مقیاس خام همچنان کار می‌کند',
    sizeless.ok && sizeless.anchor === 4000 && sizeless.size === 1);
  check('اندازهٔ ناهمگون علامت می‌خورد و کوچک‌ترین حاکم می‌شود',
    strikeAnchor([BULL[0], { ...BULL[1], size: 500 }], 'vertical').mixedSize === true
    && strikeAnchor([BULL[0], { ...BULL[1], size: 500 }], 'vertical', 500).anchor === 2e6);
}


group('۲۱۸-ج. ارزش ساختار در یک لحظه — تفریق یا جمع');
{
  // ═══ اسپرد: دو نرخ از هم کم می‌شوند ═══
  //
  // «در اسپرد عمودی در هر لحظه دو تا نرخ داریم که باید از هم کم بشن.»
  // خرید ۵۰ به ۲٬۵۰۰ و فروش ۵۴ به ۹۰۰ → ۱٬۶۰۰. همان تفریق، بی هیچ ضربی.
  const debit = structureValue(BULL, { c50: 2500, c54: 900 });
  check('اسپرد: تفاضلِ دو نرخ، بدهکار، و همان عددِ روی تابلو',
    debit.ok && debit.value === 1600 && debit.side === 'debit', `${debit.value} · ${debit.side}`);
  check('و با ضریبِ اندازه، همان عدد ضربدر هزار',
    structureValue(BULL, { c50: 2500, c54: 900 }, 1000).value === 1.6e6);

  // ═══ استرانگل: دو نرخ با هم جمع می‌شوند ═══
  //
  // «برای استرانگل می‌شه جمع دو تا قرارداد (که فروختیم).»
  const credit = structureValue(STRANGLE, { p46: 300, c56: 400 });
  check('استرانگل: جمعِ دو پرمیوم، بستانکار — ۳۰۰ به‌علاوهٔ ۴۰۰',
    credit.ok && credit.value === 700 && credit.side === 'credit', `${credit.value} · ${credit.side}`);

  // ── قیمتِ تک‌تکِ پاها برمی‌گردد ──────────────────────────────────────
  //
  // بی این، «نمودار فاصله‌ای» — دو خط و فضای میانشان — ساخته نمی‌شود و
  // کاربر فقط حاصلِ تفریق را می‌بیند نه دو عددی که از هم کم شده‌اند.
  check('قیمت هر پا جدا برمی‌گردد، برای نمودارِ دو-خطی',
    debit.perLeg.length === 2
    && debit.perLeg.map((leg) => leg.scaled).join(',') === '2500,900'
    && debit.perLeg.map((leg) => leg.side).join(',') === 'buy,sell',
    JSON.stringify(debit.perLeg.map((leg) => leg.scaled)));

  // ── مرزی که رد نمی‌شود ──────────────────────────────────────────────
  const gap = structureValue(BULL, { c50: 2500 });
  check('پای بی‌قیمت، محاسبه را باطل می‌کند — صفر نمی‌گیرد',
    !gap.ok && gap.missing.join(',') === 'ضهرم۵۴' && !Number.isFinite(gap.value),
    gap.why);
  check('و اگر صفر می‌گرفت، فاصله ۲٬۵۰۰ می‌شد — عددی که در بازار نیست',
    structureValue(BULL, { c50: 2500, c54: 0 }).value === 2500);
  check('نسبت پا در جمع ضرب می‌شود — نسبت‌اسپرد دو برابر می‌فروشد',
    structureValue([BULL[0], { ...BULL[1], ratio: 2 }], { c50: 2500, c54: 900 }).value === 700);
  check('پای سهم پایه در ارزشِ ساختارِ اختیار نمی‌آید',
    structureValue([...BULL, { kind: 'underlying', side: 'buy', ins: 'ua' }], { c50: 2500, c54: 900 }).ok);
}


group('۲۱۸-د. فاصله، کامل — دو خانواده، دو لنگر');
{
  // ═══ اسپرد عمودی: لنگر، فاصلهٔ اعمال ═══
  //
  // «اگه این تفاضل به اندازهٔ تفاضل دو تا قیمت اعمال برسه، می‌تونه سود
  // بده.» پس عرض سقفِ ارزش است و «باقی‌مانده» همان سودِ نگرفته.
  //
  // عرض ۴٬۰۰۰ · ورود ۱٬۶۰۰ · اکنون ۲٬۴۰۰ — همه به قیمت خام.
  const gap = measureGap({
    legs: BULL, prices: { c50: 3200, c54: 800 },
    strategyId: 'bull-call-spread', entry: 1600, daysLeft: 30,
  });
  check('تفاضل اکنون ۲٬۴۰۰ است و تفاضلِ دو اعمال ۴٬۰۰۰',
    gap.ok && gap.current === 2400 && gap.anchor === 4000 && gap.anchorSource === 'strike',
    `${gap.current} از ${gap.anchor}`);
  check('تقسیمِ یکی بر دیگری: ۶۰٪ پر شده',
    near(gap.coveragePct, 60), `${gap.coveragePct}`);
  check('و ۴۰٪ جا دارد پر بشود — همان که کاربر «باقی‌مانده» گفت',
    near(gap.roomPct, 40) && gap.room === 1600, `${gap.roomPct}٪ · ${gap.room}`);
  check('دو درصد همیشه صد می‌شوند، وگرنه یکی‌شان از دیگری حساب نشده',
    near(gap.coveragePct + gap.roomPct, 100));
  check('برچسبِ دو درصد برای اسپرد، «پر شده» و «جا برای پر شدن» است',
    gap.coverageLabel === 'پر شده' && gap.roomLabel === 'جا برای پر شدن');

  // ═══ مقیاس، نسبت را عوض نمی‌کند ═══
  //
  // چون هم لنگر و هم ارزش با یک ضریب بزرگ می‌شوند. هر چیز دیگری اشتباه
  // بود، و همین است که «انتخابِ کاربر بودنِ مقیاس» را بی‌خطر می‌کند.
  const scaled = GAP_SCALES.map((row) => measureGap({
    legs: BULL, prices: { c50: 3200, c54: 800 },
    strategyId: 'bull-call-spread', entry: 1600, scale: row.id, units: 5,
  }));
  check('هر سه مقیاس، یک درصدِ پرشدگی می‌دهند',
    scaled.every((one) => near(one.coveragePct, 60)),
    scaled.map((one) => one.coveragePct.toFixed(2)).join(' · '));
  check('ولی عددِ ریالی‌شان سه‌تاست: خام، یک قرارداد، و کل موقعیت',
    scaled.map((one) => one.current).join(',') === '2400,2400000,12000000',
    scaled.map((one) => one.current).join('، '));
  check('و مقیاسِ انتخابی در خودِ نتیجه حمل می‌شود، تا رابط واحد را بنویسد',
    scaled.map((one) => one.scale).join(',') === 'raw,size,qty'
    && scaled[2].units === 5 && scaled[2].mult === 5000);

  // ── بیشینهٔ سود و زیانِ «اگر همین حالا وارد شوی» ─────────────────────
  //
  // مبنا قیمتِ اکنون است نه قیمتِ روز ورود: کسی که امروز به این ردیف نگاه
  // می‌کند، امروز وارد می‌شود. عرض ۴٬۰۰۰ و بهای امروز ۲٬۴۰۰ → سقفِ سود
  // ۱٬۶۰۰ و سقفِ زیان همان ۲٬۴۰۰ی که می‌پردازی.
  check('بیشینهٔ سود بدهکار: عرض منهای بهای امروز',
    gap.maxProfit === 1600 && gap.maxLoss === -2400,
    `${gap.maxProfit} / ${gap.maxLoss}`);
  check('از مبدأ مقایسه ۸۰۰ حرکت کرده — نصفِ بیشینهٔ سودِ امروز',
    gap.gained === 800 && near(gap.gainedPct, 50) && near(gap.filledPct, 50),
    `${gap.gained} · ${gap.filledPct}٪`);
  check('«درصد پر شدن ساختاری» و «درصد حرکت از مبدأ» یکی نیستند',
    Math.abs(gap.coveragePct - gap.gainedPct) > 5,
    `ساختاری ${gap.coveragePct.toFixed(1)}٪ · از مبدأ ${gap.gainedPct.toFixed(1)}٪`);
  check('سودِ باقی‌مانده بر سرمایهٔ همین لحظه است، نه سرمایهٔ روز ورود',
    gap.upside === 1600 && near(gap.upsidePct, (1600 / 2400) * 100), `${gap.upsidePct}٪`);
  check('و همان، تقسیم بر روزهای مانده',
    near(gap.perDay, gap.upsidePct / 30), `${gap.perDay}`);

  // ═══ استرانگل: لنگر ساختاری است، نه قیمتِ ورودِ خیالی ═══
  //
  // گزارش صاحب پروژه: «قسمت short strangle درست نمایش داده نمی‌شود؛
  // اصولاً لنگر نداریم.» و درست بود. نسخهٔ پیشین جمعِ پرمیوم در نخستین
  // روزِ بازه را «قیمت ورود» می‌گرفت — روزی که ورودِ کسی نبود — و رویش
  // «چند درصد سودت را گرفته‌ای» می‌ساخت.
  //
  // آنچه همیشه هست، دهانهٔ اعمال است. پس همان لنگر می‌شود و نسبت معنیِ
  // روشنی می‌گیرد: پرمیومی که می‌گیری، چند درصدِ دهانه را می‌پوشاند.
  const short = measureGap({
    legs: STRANGLE, prices: { p46: 300, c56: 400 },
    strategyId: 'short-strangle', entry: 900, daysLeft: 45,
  });
  check('استرانگل فروش بستانکار تشخیص داده می‌شود و جمعش ۷۰۰ است',
    short.ok && short.side === 'credit' && short.current === 700);
  check('لنگرش دهانهٔ اعمال است و همیشه هست — بی هیچ قیمت ورودی',
    short.anchored === true && short.anchorSource === 'strike'
    && short.anchor === 10000 && short.anchorLabel === 'دهانهٔ اعمال',
    `لنگر ${short.anchor} · ${short.anchorLabel}`);
  check('و نسبت یعنی «پرمیوم چند درصدِ دهانه را می‌پوشاند»',
    near(short.coveragePct, 7) && short.coverageLabel === 'پوشش پرمیوم از دهانه'
    && short.roomLabel === 'دهانهٔ بی‌پوشش', `${short.coveragePct}٪`);
  check('ارزشِ ساختار جمعِ دو نرخ است، نه تفاضلشان',
    short.combine === 'sum' && gap.combine === 'diff');
  check('بیشینهٔ سودِ فروشنده همان بستانکارِ امروز است، و زیانش سقف ندارد',
    short.maxProfit === 700 && short.maxLoss === -Infinity && short.unbounded === true);

  // ── همان استرانگل، بی هیچ قیمت ورود ─────────────────────────────────
  //
  // این ادعا هستهٔ اصلاح است: ردیفی که هرگز وارد نشده‌ای باید کاملِ
  // عددهایش را بدهد. پیش از این، `anchored: false` می‌شد و ستون لنگر و
  // هر درصدی خالی می‌ماند — همان «درست نمایش داده نمی‌شود».
  const anon = measureGap({ legs: STRANGLE, prices: { p46: 300, c56: 400 }, strategyId: 'short-strangle' });
  check('استرانگلِ بی قیمت ورود هم لنگر و درصد دارد',
    anon.ok && anon.anchored === true && anon.anchor === 10000
    && near(anon.coveragePct, 7) && anon.maxProfit === 700,
    `${anon.coveragePct}٪ از ${anon.anchor}`);
  check('و چیزی که ورود لازم دارد، بی ورود ساخته نمی‌شود',
    !Number.isFinite(anon.gained) && !Number.isFinite(anon.gainedPct));

  // ── «هرچی این جمع کمتر بشه، سود استراتژی است» ───────────────────────
  //
  // خواستهٔ اصلی، به‌شکل یک ادعای یکنواختی. حالا در `gained` می‌آید — با
  // نامِ خودش، نسبت به مبدأ مقایسه، نه به‌عنوان «سودِ گرفته‌شده».
  const shrinking = [900, 700, 400, 100, 1].map((sum) => measureGap({
    legs: STRANGLE, prices: { p46: sum / 2, c56: sum / 2 },
    strategyId: 'short-strangle', entry: 900,
  }));
  check('هرچه جمع آب شود، سودِ دارندهٔ آن موقعیت یکنواخت بالا می‌رود',
    shrinking.every((one, at) => at === 0 || one.gained > shrinking[at - 1].gained),
    shrinking.map((one) => one.gained).join(' → '));
  check('و در جمعِ برابرِ ورود، هنوز هیچ چیزی محقق نشده',
    shrinking[0].gained === 0 && shrinking[0].underwater === false);

  // ═══ فروشندهٔ زیر آب ═══
  //
  // استرانگلی که به ۹۰۰ فروخته شده و جمعش به ۱٬۵۰۵ رسیده در زیان است.
  // این باید نامش را داشته باشد، نه اینکه با یک درصدِ مثبت پنهان بماند.
  const drowning = measureGap({
    legs: STRANGLE, prices: { p46: 800, c56: 705 },
    strategyId: 'short-strangle', entry: 900, daysLeft: 30,
  });
  check('جمعِ بزرگ‌تر از ورود یعنی زیان، و همین‌طور علامت می‌خورد',
    drowning.ok && drowning.current === 1505 && drowning.underwater === true
    && drowning.gained === -605, `${drowning.gained}`);
  check('و هیچ‌جا «سود باقی‌مانده» برایش ساخته نمی‌شود',
    !Number.isFinite(drowning.upsidePct) && !Number.isFinite(drowning.perDay));
  check('جملهٔ فارسی هم صریح می‌گوید موقعیت در زیان است',
    gapNote(drowning).includes('در زیان'), gapNote(drowning).slice(0, 110));
  // جمله با `textContent` نوشته می‌شود، پس هیچ نشانهٔ مارک‌داونی در آن
  // رندر نمی‌شود و عیناً چاپ می‌شود — در نماگرفت «**بزرگ‌تر**» دیده شد.
  check('و هیچ ستارهٔ مارک‌داونی در متن نمانده',
    !/\*/.test(gapNote(drowning)) && !/\*/.test(gapNote(gap)) && !/\*/.test(gapNote(short)));

  // ── بازدهِ استرانگل مخرجِ خودش را دارد، جای دیگری ────────────────────
  //
  // سرمایهٔ فروشندهٔ استرانگل وجه تضمین است نه بستانکار. تقسیم بر
  // بستانکار «۳۳۳٪ بازده» می‌داد برای موقعیتی که در زیان بود. اینجا
  // ساخته نمی‌شود؛ `core/radar-metrics.mjs` آن را روی وجه تضمینِ واقعی
  // می‌دهد.
  check('برای استرانگل، «سود باقی‌مانده بر سرمایه» ادعا نمی‌شود',
    !Number.isFinite(short.upsidePct) && !Number.isFinite(short.perDay));
  check('ولی برای اسپرد می‌شود، چون سرمایهٔ درگیرش معلوم است',
    Number.isFinite(gap.upsidePct) && Number.isFinite(gap.perDay));

  // ═══ استرانگلِ خرید: همان دهانه، جهتِ وارونه ═══
  const LONG_STRANGLE = STRANGLE.map((leg) => ({ ...leg, side: 'buy' }));
  const bought = measureGap({
    legs: LONG_STRANGLE, prices: { p46: 350, c56: 367 },
    strategyId: 'long-strangle', entry: 215,
  });
  check('استرانگلِ خرید بدهکار است و از مبدأ مقایسه ۵۰۲ به سودش رفته',
    bought.ok && bought.side === 'debit' && bought.current === 717 && bought.gained === 502,
    `${bought.current} از ${bought.entry}`);
  check('برچسبش «بهای پرداختی از دهانه» است، نه «سود گرفته‌شده»',
    bought.coverageLabel === 'بهای پرداختی از دهانه' && near(bought.coveragePct, 7.17),
    `${bought.coveragePct.toFixed(2)}٪`);
  check('و جهتش وارونهٔ فروش است: زیانش سقف دارد، سودش نه',
    bought.maxLoss === -717 && bought.maxProfit === Infinity && bought.unbounded === true);
  check('هرگز عددِ منفیِ «سود گرفته‌شده» نمی‌دهد — همان اشکالی که دیده شد',
    bought.coveragePct > 0);

  // و اسپرد بی قیمت ورود هم لنگر دارد، چون لنگرش از اول ساختاری بود.
  const anonSpread = measureGap({ legs: BULL, prices: { c50: 3200, c54: 800 }, strategyId: 'bull-call-spread' });
  check('اسپرد بی قیمت ورود هم لنگر دارد و درصدش ساخته می‌شود',
    anonSpread.ok && anonSpread.anchored === true && near(anonSpread.coveragePct, 60)
    && !Number.isFinite(anonSpread.filledPct));

  check('پای بی‌قیمت، کلِ فاصله را باطل می‌کند و علتش را می‌گوید',
    !measureGap({ legs: BULL, prices: { c50: 3200 }, strategyId: 'bull-call-spread' }).ok);

  const hollow = measureGap({ legs: BULL, prices: { c50: 900, c54: 900 }, strategyId: 'bull-call-spread' });
  check('دو پای هم‌قیمت، فاصله ندارند — نه «۱۰۰٪ جا برای پر شدن»',
    !hollow.ok && !Number.isFinite(hollow.roomPct) && hollow.why.includes('صفر'), hollow.why);

  check('جملهٔ اسپرد از «تفاضل دو نرخ» حرف می‌زند و واحدش را می‌گوید',
    gapNote(gap).includes('تفاضل دو نرخ') && gapNote(gap).includes('پر شده')
    && gapNote(gap).includes('قیمت خام'), gapNote(gap));
  check('و جملهٔ استرانگل از دهانه و از جمعِ پرمیوم حرف می‌زند، نه از تفاضل',
    gapNote(short).includes('دهانهٔ اعمال') && gapNote(short).includes('جمعِ پرمیومی که می‌گیری')
    && gapNote(short).includes('زیانش سقف ندارد') && !gapNote(short).includes('تفاضل'),
    gapNote(short));
}


group('۲۱۸-ه. تاریخچهٔ فاصله، روزانه و دقیقه‌ای');
{
  // پنج روز، فاصله‌ای که از ۱٬۶۰۰٬۰۰۰ تا ۲٬۸۰۰٬۰۰۰ باز می‌شود.
  const dates = [14050601, 14050602, 14050603, 14050604, 14050605];
  const spreads = [1600, 1900, 2200, 2500, 2800];
  const seriesByIns = {
    c50: dates.map((date, i) => ({ date, close: 2000 + (spreads[i] - 1600) })),
    c54: dates.map((date) => ({ date, close: 400 })),
  };
  const daily = dailyGapSeries({
    legs: BULL, seriesByIns, dates, basis: 'CLOSE',
    strategyId: 'bull-call-spread', entry: 1600, expiry: 14050625,
  });
  check('برای هر روزِ کامل یک نقطه ساخته می‌شود',
    daily.points.length === 5 && daily.missing === 0, `${daily.points.length} نقطه`);
  check('و فاصله همان ۱٬۶۰۰ تا ۲٬۸۰۰ را دنبال می‌کند',
    daily.points.map((point) => point.current).join(',') === spreads.join(','));
  check('روزِ مانده تا سررسید در هر نقطه هست و کم می‌شود',
    daily.points[0].daysLeft === 24 && daily.points[4].daysLeft === 20,
    `${daily.points[0].daysLeft} → ${daily.points[4].daysLeft}`);

  // ── خانهٔ خالی، خالی می‌ماند ────────────────────────────────────────
  const holed = dailyGapSeries({
    legs: BULL, basis: 'CLOSE', dates, strategyId: 'bull-call-spread',
    seriesByIns: { ...seriesByIns, c54: seriesByIns.c54.filter((row) => row.date !== 14050603) },
  });
  check('روزی که یک پا معامله نشده نقطه نمی‌سازد و شمرده می‌شود',
    holed.points.length === 4 && holed.missing === 1);
  check('و با قیمت روز قبل پر نمی‌شود — نمودارِ حدسی ساخته نمی‌شود',
    !holed.points.some((point) => point.label.includes('۰۳')));

  // ── آمار ────────────────────────────────────────────────────────────
  check('کمینه، بیشینه و میانگین از همان پنج نقطه‌اند',
    daily.stats.min === 1600 && daily.stats.max === 2800 && daily.stats.mean === 2200);
  check('و «اکنون» در صدک صدِ تاریخِ خودش ایستاده — بالاترین تا امروز',
    daily.stats.last === 2800 && near(daily.stats.rank, 100));
  check('صدک، «کمتر یا مساوی» است نه درون‌یابی',
    near(percentileRank([1, 2, 3, 4], 2), 50) && near(percentileRank([1, 2, 3, 4], 1), 25));
  check('و صدکِ p با درون‌یابی خطی میان دو همسایه',
    near(quantile([10, 20, 30, 40], 50), 25) && quantile([], 50) !== quantile([], 50));
  check('آمارِ فهرست خالی، صفر نیست — «نداریم» است',
    seriesStats([]).count === 0 && !Number.isFinite(seriesStats([]).mean));

  // ── حکم ─────────────────────────────────────────────────────────────
  const now = measureGap({ legs: BULL, prices: { c50: 3300, c54: 400 }, strategyId: 'bull-call-spread', entry: 1600 });
  const verdict = gapVerdict(daily, now);
  check('حکم می‌گوید فاصله در بالای توزیعِ تاریخی است، پس گران',
    verdict.ok && verdict.tone === 'گران' && near(verdict.rank, 100),
    `صدک ${verdict.rank}`);
  check('و چند درصد بالاتر از میانگین تاریخی است',
    near(verdict.vsMean, ((2900 / 2200) - 1) * 100), `${verdict.vsMean}`);
  // میانهٔ توزیع باید «میانه» بخواند، نه گران. بی این، هر عددی گران بود.
  check('و فاصله‌ای که وسطِ توزیع است، «میانه» خوانده می‌شود نه گران',
    gapVerdict(daily, measureGap({ legs: BULL, prices: { c50: 2600, c54: 400 }, strategyId: 'bull-call-spread' })).tone === 'میانه');
  check('بی تاریخچه، حکمی صادر نمی‌شود',
    !gapVerdict({ points: [], stats: seriesStats([]) }, now).ok);

  // ── توزیعِ بی‌پراکندگی هم حکمی ندارد ───────────────────────────────
  //
  // این هم از همان اجرای آزمایشی آمد: `percentileRank` برای عددِ برابر
  // صد می‌دهد و صد یعنی «گران»، پس ساختاری که در کل بازه تکان نخورده بود
  // «گران» خوانده می‌شد. ادعا از داده بزرگ‌تر بود.
  const flatSeries = dailyGapSeries({
    legs: BULL, basis: 'CLOSE', dates, strategyId: 'bull-call-spread',
    seriesByIns: {
      c50: dates.map((date) => ({ date, close: 2000 })),
      c54: dates.map((date) => ({ date, close: 400 })),
    },
  });
  const flatNow = measureGap({ legs: BULL, prices: { c50: 2000, c54: 400 }, strategyId: 'bull-call-spread' });
  check('فاصله‌ای که در کل بازه تکان نخورده، «گران» خوانده نمی‌شود',
    flatSeries.points.length === 5 && flatSeries.stats.min === flatSeries.stats.max
    && !gapVerdict(flatSeries, flatNow).ok
    && gapVerdict(flatSeries, flatNow).why.includes('ثابت'),
    gapVerdict(flatSeries, flatNow).why);

  // ── درون‌روزی: همان عدد، به دقیقه ───────────────────────────────────
  //
  // نمونهٔ خودِ کاربر: «موقع فروش ۳۰۰، یک دقیقه بعد ۳۱۰.»
  const tape = {
    p46: [{ time: 100000, price: 300, quantity: 10 }, { time: 100100, price: 310, quantity: 10 }],
    c56: [{ time: 100000, price: 400, quantity: 10 }, { time: 100100, price: 400, quantity: 10 }],
  };
  const intraday = intradayGapSeries({
    legs: STRANGLE, tapeByIns: tape, date: 14050601, grain: 'm1',
    strategyId: 'short-strangle', entry: 900, expiry: 14050625,
  });
  const at = (label) => intraday.points.find((point) => point.label === label);
  check('در دانهٔ یک دقیقه، ساعت ۱۰:۰۰ جمعِ استرانگل ۷۰۰ است',
    at('۱۰:۰۰')?.current === 700, `${at('۱۰:۰۰')?.current}`);
  check('و یک دقیقه بعد ۷۱۰ — دقیقاً همان «موقع فروش ۳۰۰، یک دقیقه بعد ۳۱۰»',
    at('۱۰:۰۱')?.current === 710, `${at('۱۰:۰۱')?.current}`);
  check('پیش از نخستین معامله نقطه‌ای نیست، چون قیمتی نبوده',
    !at('۰۹:۳۰') && intraday.missing > 0);
  check('دانهٔ روزانه در مسیر درون‌روزی نقطه نمی‌سازد — پرسشِ دیگری است',
    intradayGapSeries({ legs: STRANGLE, tapeByIns: tape, date: 14050601, grain: 'day' }).points.length === 0);
}


group('۲۱۸-و. هشدار: شرط، عبور، و آرامش');
{
  const built = normalizeRule({ metric: 'current', op: 'crossUp', value: 7.1e5, cooldownSec: 60 });
  check('قاعدهٔ درست ساخته می‌شود و شناسه می‌گیرد',
    built.ok && built.rule.metric === 'current' && built.rule.id.length > 0);
  check('سنجه یا عملگرِ ناشناخته رد می‌شود، نه اینکه پیش‌فرض بگیرد',
    !normalizeRule({ metric: 'چیزی', op: 'ge', value: 1 }).ok
    && !normalizeRule({ metric: 'current', op: 'چیزی', value: 1 }).ok);
  check('آستانهٔ بی‌عدد هم رد می‌شود',
    !normalizeRule({ metric: 'current', op: 'ge', value: 'زیاد' }).ok);
  check('هر سنجه یکتاست و هرکدام راهنما و واحد دارد',
    new Set(ALERT_METRICS.map((row) => row.id)).size === ALERT_METRICS.length
    && ALERT_METRICS.every((row) => row.hint && row.unit && row.label));
  check('عملگرهای «عبور» می‌دانند که به مقدار قبلی نیاز دارند',
    ALERT_OPS.filter((row) => row.needsPrev).map((row) => row.id).join(',') === 'crossUp,crossDown');

  const rule = built.rule;
  // ── عبور، نه بودن ───────────────────────────────────────────────────
  check('نخستین سنجش عبوری نمی‌بیند — وگرنه هر بار باز کردن تب زنگ می‌زد',
    !ruleFires(rule, { current: 8e5 }, null, 1000).fires);
  check('رد شدن از خط، رو به بالا، آتش می‌کند',
    ruleFires(rule, { current: 7.2e5 }, { current: 7e5 }, 1000).fires);
  check('ولی ماندن در آن‌سوی خط، دیگر آتش نمی‌کند',
    !ruleFires(rule, { current: 8e5 }, { current: 7.5e5 }, 1000).fires);
  check('و «بودن» برعکس است: تا وقتی شرط برقرار است، آتش می‌کند',
    ruleFires({ ...rule, op: 'ge' }, { current: 8e5 }, { current: 7.5e5 }, 1000).fires);
  check('رو به پایین، قرینهٔ رو به بالاست',
    ruleFires({ ...rule, op: 'crossDown' }, { current: 7e5 }, { current: 7.2e5 }, 1000).fires
    && !ruleFires({ ...rule, op: 'crossDown' }, { current: 7.2e5 }, { current: 7e5 }, 1000).fires);
  check('سنجه‌ای که در این لحظه عدد ندارد، آتش نمی‌کند',
    !ruleFires({ ...rule, op: 'ge' }, { current: NaN }, null, 1000).fires);
  check('قاعدهٔ خاموش هرگز آتش نمی‌کند',
    !ruleFires({ ...rule, op: 'ge', enabled: false }, { current: 9e9 }, null, 1000).fires);

  // ── آرامش ───────────────────────────────────────────────────────────
  const hot = { ...rule, op: 'ge', lastFiredAt: 1000, cooldownSec: 60 };
  check('در دورهٔ آرامش، شرطِ برقرار هم زنگ نمی‌زند',
    !ruleFires(hot, { current: 9e5 }, null, 30000).fires);
  check('و پس از پایانش دوباره می‌زند',
    ruleFires(hot, { current: 9e5 }, null, 70000).fires);

  // ── سنجشِ دسته‌ای ───────────────────────────────────────────────────
  const snapshots = {
    A: alertSnapshot({ gap: measureGap({ legs: STRANGLE, prices: { p46: 300, c56: 400 }, strategyId: 'short-strangle', entry: 900 }), label: 'A', strategyId: 'short-strangle' }),
    B: alertSnapshot({ gap: measureGap({ legs: BULL, prices: { c50: 3200, c54: 800 }, strategyId: 'bull-call-spread', entry: 1600 }), label: 'B', strategyId: 'bull-call-spread' }),
  };
  const wide = normalizeRule({ metric: 'current', op: 'ge', value: 600, cooldownSec: 0 }).rule;
  const both = evaluateAlerts({ rules: [wide], snapshots, prev: {}, nowMs: 5000 });
  check('قاعدهٔ بی‌کلید همهٔ ترکیب‌ها را می‌بیند — یک قاعده به‌جای سی‌تا',
    both.fired.length === 2 && both.fired.map((row) => row.comboKey).sort().join(',') === 'A,B');
  const scoped = normalizeRule({ metric: 'current', op: 'ge', value: 600, strategyId: 'short-strangle', cooldownSec: 0 }).rule;
  check('و قاعدهٔ استراتژی‌دار فقط همان خانواده را',
    evaluateAlerts({ rules: [scoped], snapshots, prev: {}, nowMs: 5000 }).fired
      .map((row) => row.comboKey).join(',') === 'A');
  check('قاعده‌ها جهش نمی‌خورند؛ نسخهٔ تازه با شمارِ آتش برمی‌گردد',
    wide.firedCount === 0 && both.rules[0].firedCount === 1 && both.rules[0].lastFiredAt === 5000);
  check('و عکسِ این سنجش برای سنجش بعدی نگه داشته می‌شود',
    both.prev.A.current === 700);
  check('جملهٔ قاعده، سنجه و عملگر و واحد را با هم می‌گوید',
    ruleNote(wide).includes('فاصلهٔ اکنون') && ruleNote(wide).includes('ریال'), ruleNote(wide));

  // ── سنجه‌های بستری ──────────────────────────────────────────────────
  const withDay = alertSnapshot({
    gap: measureGap({ legs: STRANGLE, prices: { p46: 300, c56: 400 }, strategyId: 'short-strangle', entry: 900 }),
    day: { low: 650, high: 750 }, basePrice: 52646,
  });
  check('«درصد از کف امروز» از خودِ کف همان روز حساب می‌شود',
    near(withDay.fromDayLowPct, ((700 / 650) - 1) * 100), `${withDay.fromDayLowPct}`);
  check('و «درصد از سقف امروز» همیشه صفر یا منفی است',
    withDay.fromDayHighPct < 0 && near(withDay.fromDayHighPct, ((700 / 750) - 1) * 100));
  check('بی دامنهٔ روز، هیچ‌کدام ساخته نمی‌شوند',
    !Number.isFinite(alertSnapshot({ gap: measureGap({ legs: BULL, prices: { c50: 3200, c54: 800 }, strategyId: 'bull-call-spread' }) }).fromDayLowPct));
}


group('۲۱۸-ز. مرزهای اعلام‌شدهٔ این ماژول');
{
  const src = readSrc('../core/spread-gap.mjs');
  check('هیچ رنگی در هستهٔ فاصله نوشته نشده — رنگ از توکن می‌آید',
    !/#[0-9a-fA-F]{3,6}\b/.test(src));
  check('و هیچ قیمتِ پشتیبانِ ساختگی‌ای در کد نیست',
    !/\|\|\s*0\s*;\s*\/\/\s*قیمت/.test(src));
  const series = readSrc('../core/spread-gap-series.mjs');
  check('تاریخچه، خانهٔ خالی را با مقدار قبلی پر نمی‌کند',
    !/forward|carry|lastKnown/i.test(series) && /missing \+= 1/.test(series));
  const alert = readSrc('../core/gap-alert.mjs');
  // شرح‌ها کنار گذاشته می‌شوند: خودِ همین ادعا در بالای فایل نوشته شده و
  // بی این خط، آزمون به شرحِ خودش گیر می‌کرد نه به کد.
  const alertCode = alert.split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  check('موتور هشدار به ساعت سیستم دست نمی‌زند؛ زمان تزریق می‌شود',
    !/Date\.now\(\)/.test(alertCode) && /nowMs/.test(alertCode));
}
