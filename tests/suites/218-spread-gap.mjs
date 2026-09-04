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
  GAP_STRATEGY_IDS, gapKind, gapNote, hasGap, measureGap, strikeAnchor, structureValue,
} from '../../core/spread-gap.mjs';
import {
  dailyGapSeries, gapVerdict, intradayGapSeries, percentileRank, quantile, seriesStats,
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
  const bull = strikeAnchor(BULL, 'vertical');
  check('عرضِ اسپرد چهارهزارتومانی با اندازهٔ ۱۰۰۰، چهار میلیون ریال است',
    bull.ok && bull.anchor === 4e6, `${bull.anchor}`);
  check('و قیمت‌های اعمال مرتب و یکتا برمی‌گردند',
    bull.strikes.join(',') === '50000,54000');

  const strangle = strikeAnchor(STRANGLE, 'strangle');
  check('دهانهٔ استرانگل ۴۶ تا ۵۶، ده میلیون ریال است',
    strangle.ok && strangle.anchor === 1e7, `${strangle.anchor}`);

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
    wing.ok && wing.anchor === 4e6 && wing.equalWings === true,
    `بال ${wing.anchor} در برابر پهنای کل ${(58 - 46) * 1000 * 1000}`);
  const uneven = strikeAnchor([46, 50, 62].map((k) => ({
    ins: `u${k}`, kind: 'call', side: 'buy', strike: k * 1000, size: 1000, ratio: 1,
  })), 'wing');
  check('بالِ نامساوی: باریک‌ترین حاکم است، نه میانگین',
    uneven.anchor === 4e6 && uneven.equalWings === false,
    `${uneven.wingWidths.join('، ')}`);

  check('یک قیمت اعمال یعنی فاصله‌ای نیست، و همین گفته می‌شود',
    !strikeAnchor([BULL[0]], 'vertical').ok
    && strikeAnchor([BULL[0]], 'vertical').why.includes('کمتر از دو'));
  check('دو اعمالِ یکسان هم فاصله نمی‌سازند',
    !strikeAnchor([BULL[0], { ...BULL[1], strike: 50000 }], 'vertical').ok);
  check('اندازهٔ نااعلام، لنگر را باطل می‌کند نه اینکه ۱ فرض شود',
    !strikeAnchor(BULL.map((leg) => ({ ...leg, size: 0 })), 'vertical').ok);
  check('اندازهٔ ناهمگون علامت می‌خورد و کوچک‌ترین حاکم می‌شود',
    strikeAnchor([BULL[0], { ...BULL[1], size: 500 }], 'vertical').mixedSize === true
    && strikeAnchor([BULL[0], { ...BULL[1], size: 500 }], 'vertical').anchor === 2e6);
}


group('۲۱۸-ج. ارزش ساختار در یک لحظه');
{
  // خرید ۵۰ به ۲۵۰۰ و فروش ۵۴ به ۹۰۰ → بدهکارِ ۱۶۰۰ × ۱۰۰۰ = ۱٬۶۰۰٬۰۰۰
  const debit = structureValue(BULL, { c50: 2500, c54: 900 });
  check('اسپرد خریداری‌شده بدهکار است و ارزشش قدرمطلقِ جمعِ علامت‌دار',
    debit.ok && debit.value === 1.6e6 && debit.side === 'debit', `${debit.value} · ${debit.side}`);

  // فروش هر دو پای استرانگل به ۳۰۰ و ۴۰۰ → بستانکارِ ۷۰۰ × ۱۰۰۰
  const credit = structureValue(STRANGLE, { p46: 300, c56: 400 });
  check('استرانگل فروش بستانکار است و همان ۷۰۰ هزار را می‌دهد',
    credit.ok && credit.value === 7e5 && credit.side === 'credit', `${credit.value} · ${credit.side}`);

  // ── مرزی که رد نمی‌شود ──────────────────────────────────────────────
  const gap = structureValue(BULL, { c50: 2500 });
  check('پای بی‌قیمت، محاسبه را باطل می‌کند — صفر نمی‌گیرد',
    !gap.ok && gap.missing.join(',') === 'ضهرم۵۴' && !Number.isFinite(gap.value),
    gap.why);
  check('و اگر صفر می‌گرفت، فاصله ۲٬۵۰۰٬۰۰۰ می‌شد — عددی که در بازار نیست',
    structureValue(BULL, { c50: 2500, c54: 0 }).value === 2.5e6);
  check('نسبت پا در جمع ضرب می‌شود — نسبت‌اسپرد دو برابر می‌فروشد',
    structureValue([BULL[0], { ...BULL[1], ratio: 2 }], { c50: 2500, c54: 900 }).value === 7e5);
  check('پای سهم پایه در ارزشِ ساختارِ اختیار نمی‌آید',
    structureValue([...BULL, { kind: 'underlying', side: 'buy', ins: 'ua' }], { c50: 2500, c54: 900 }).ok);
}


group('۲۱۸-د. فاصله، کامل — همان که کاربر خواست');
{
  // عرض ۴٬۰۰۰٬۰۰۰ · ورود ۱٬۶۰۰٬۰۰۰ · اکنون ۲٬۴۰۰٬۰۰۰
  const gap = measureGap({
    legs: BULL, prices: { c50: 3200, c54: 800 },
    strategyId: 'bull-call-spread', entry: 1.6e6, daysLeft: 30,
  });
  check('فاصلهٔ اکنون ۲٬۴۰۰٬۰۰۰ است و فاصلهٔ اعمال ۴٬۰۰۰٬۰۰۰',
    gap.ok && gap.current === 2.4e6 && gap.anchor === 4e6);
  check('تقسیمِ یکی بر دیگری: ۶۰٪ پر شده',
    near(gap.coveragePct, 60), `${gap.coveragePct}`);
  check('و ۴۰٪ جا دارد پر بشود — همان که کاربر «باقی‌مانده» گفت',
    near(gap.roomPct, 40) && gap.room === 1.6e6, `${gap.roomPct}٪ · ${gap.room} ریال`);
  check('دو درصد همیشه صد می‌شوند، وگرنه یکی‌شان از دیگری حساب نشده',
    near(gap.coveragePct + gap.roomPct, 100));

  // ── لنگر موقعیتی، جدا از ساختاری ────────────────────────────────────
  check('بیشینهٔ سود بدهکار: عرض منهای بهای ورود',
    gap.maxProfit === 2.4e6 && gap.maxLoss === -1.6e6);
  check('از آن بیشینه، ۸۰۰٬۰۰۰ گرفته شده یعنی یک‌سومش',
    gap.gained === 8e5 && near(gap.filledPct, 100 / 3), `${gap.filledPct}٪`);
  check('«درصد پر شدن ساختاری» و «درصد سودِ گرفته‌شده» یکی نیستند',
    Math.abs(gap.coveragePct - gap.filledPct) > 20,
    `ساختاری ${gap.coveragePct.toFixed(1)}٪ · موقعیتی ${gap.filledPct.toFixed(1)}٪`);
  check('سودِ باقی‌مانده بر سرمایهٔ همین لحظه است، نه سرمایهٔ روز ورود',
    gap.upside === 1.6e6 && near(gap.upsidePct, (1.6e6 / 2.4e6) * 100), `${gap.upsidePct}٪`);
  check('و همان، تقسیم بر روزهای مانده',
    near(gap.perDay, gap.upsidePct / 30), `${gap.perDay}`);

  // ── بستانکار، جهتِ وارونه ───────────────────────────────────────────
  //
  // در بستانکار ارزش باید به صفر برود، پس «باقی‌مانده» خودِ ارزشِ کنونی
  // است نه فاصله‌اش تا عرض. با یک فرمولِ واحد برای هر دو، فروشندهٔ
  // استرانگل «۹۳٪ جا برای سود» می‌دید در حالی که سودش همان ۷٪ بود.
  const short = measureGap({
    legs: STRANGLE, prices: { p46: 300, c56: 400 },
    strategyId: 'short-strangle', entry: 9e5, daysLeft: 45,
  });
  check('استرانگل فروش بستانکار تشخیص داده می‌شود',
    short.ok && short.side === 'credit' && short.current === 7e5);
  check('بیشینهٔ سودش همان بستانکارِ ورود است، نه عرضِ دهانه',
    short.maxProfit === 9e5 && short.maxProfit !== short.anchor);
  check('و سودِ باقی‌مانده، خودِ ارزشِ کنونی است — چون باید به صفر برسد',
    short.upside === 7e5, `${short.upside}`);
  check('۲۰۰ هزار از ۹۰۰ هزار گرفته شده',
    short.gained === 2e5 && near(short.filledPct, (2 / 9) * 100));
  check('پوششِ ساختاری هم می‌آید: پرمیوم ۷٪ از دهانه است',
    near(short.coveragePct, 7), `${short.coveragePct}٪`);

  // ── بی قیمت ورود، لنگر موقعیتی نمی‌آید ──────────────────────────────
  const anon = measureGap({ legs: BULL, prices: { c50: 3200, c54: 800 }, strategyId: 'bull-call-spread' });
  check('بی قیمت ورود، نسبتِ ساختاری هست ولی موقعیتی ساخته نمی‌شود',
    anon.ok && near(anon.coveragePct, 60)
    && !Number.isFinite(anon.filledPct) && !Number.isFinite(anon.upsidePct));

  check('پای بی‌قیمت، کلِ فاصله را باطل می‌کند و علتش را می‌گوید',
    !measureGap({ legs: BULL, prices: { c50: 3200 }, strategyId: 'bull-call-spread' }).ok);

  // ── ارزشِ صفر، فاصله نیست ──────────────────────────────────────────
  //
  // این را اجرای آزمایشیِ مرورگر پیدا کرد، نه فکر کردن. دو پای هم‌قیمت
  // «۰٪ پر شده، ۱۰۰٪ جا دارد» می‌داد و با مرتب‌سازی بر «بیشترین جای
  // باقی‌مانده» صدرِ جدول می‌نشست — بهترین پیشنهادِ برنامه، ساختاری که
  // نه می‌شود خرید نه فروخت.
  const hollow = measureGap({ legs: BULL, prices: { c50: 900, c54: 900 }, strategyId: 'bull-call-spread' });
  check('دو پای هم‌قیمت، فاصله ندارند — نه «۱۰۰٪ جا برای پر شدن»',
    !hollow.ok && !Number.isFinite(hollow.roomPct) && hollow.why.includes('صفر'), hollow.why);
  check('جملهٔ فاصله هر دو درصد را می‌گوید، نه فقط یکی',
    gapNote(gap).includes('پر شده') && gapNote(gap).includes('جا دارد')
    && gapNote(gap).includes('سودِ باقی‌مانده'), gapNote(gap));
  check('و برای فاصلهٔ باطل، همان علت را می‌نویسد نه عدد',
    gapNote(measureGap({ legs: BULL, prices: {}, strategyId: 'bull-call-spread' })).includes('قیمت ندارند'));
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
    strategyId: 'bull-call-spread', entry: 1.6e6, expiry: 14050625,
  });
  check('برای هر روزِ کامل یک نقطه ساخته می‌شود',
    daily.points.length === 5 && daily.missing === 0, `${daily.points.length} نقطه`);
  check('و فاصله همان ۱٬۶۰۰٬۰۰۰ تا ۲٬۸۰۰٬۰۰۰ را دنبال می‌کند',
    daily.points.map((point) => point.current / 1000).join(',') === spreads.join(','));
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
    daily.stats.min === 1.6e6 && daily.stats.max === 2.8e6 && daily.stats.mean === 2.2e6);
  check('و «اکنون» در صدک صدِ تاریخِ خودش ایستاده — بالاترین تا امروز',
    daily.stats.last === 2.8e6 && near(daily.stats.rank, 100));
  check('صدک، «کمتر یا مساوی» است نه درون‌یابی',
    near(percentileRank([1, 2, 3, 4], 2), 50) && near(percentileRank([1, 2, 3, 4], 1), 25));
  check('و صدکِ p با درون‌یابی خطی میان دو همسایه',
    near(quantile([10, 20, 30, 40], 50), 25) && quantile([], 50) !== quantile([], 50));
  check('آمارِ فهرست خالی، صفر نیست — «نداریم» است',
    seriesStats([]).count === 0 && !Number.isFinite(seriesStats([]).mean));

  // ── حکم ─────────────────────────────────────────────────────────────
  const now = measureGap({ legs: BULL, prices: { c50: 3300, c54: 400 }, strategyId: 'bull-call-spread', entry: 1.6e6 });
  const verdict = gapVerdict(daily, now);
  check('حکم می‌گوید فاصله در بالای توزیعِ تاریخی است، پس گران',
    verdict.ok && verdict.tone === 'گران' && near(verdict.rank, 100),
    `صدک ${verdict.rank}`);
  check('و چند درصد بالاتر از میانگین تاریخی است',
    near(verdict.vsMean, ((2.9e6 / 2.2e6) - 1) * 100), `${verdict.vsMean}`);
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
    strategyId: 'short-strangle', entry: 9e5, expiry: 14050625,
  });
  const at = (label) => intraday.points.find((point) => point.label === label);
  check('در دانهٔ یک دقیقه، ساعت ۱۰:۰۰ فاصله ۷۰۰ هزار است',
    at('۱۰:۰۰')?.current === 7e5, `${at('۱۰:۰۰')?.current}`);
  check('و یک دقیقه بعد ۷۱۰ هزار — همان «۳۰۰ شد ۳۱۰»',
    at('۱۰:۰۱')?.current === 7.1e5, `${at('۱۰:۰۱')?.current}`);
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
    A: alertSnapshot({ gap: measureGap({ legs: STRANGLE, prices: { p46: 300, c56: 400 }, strategyId: 'short-strangle', entry: 9e5 }), label: 'A', strategyId: 'short-strangle' }),
    B: alertSnapshot({ gap: measureGap({ legs: BULL, prices: { c50: 3200, c54: 800 }, strategyId: 'bull-call-spread', entry: 1.6e6 }), label: 'B', strategyId: 'bull-call-spread' }),
  };
  const wide = normalizeRule({ metric: 'current', op: 'ge', value: 6e5, cooldownSec: 0 }).rule;
  const both = evaluateAlerts({ rules: [wide], snapshots, prev: {}, nowMs: 5000 });
  check('قاعدهٔ بی‌کلید همهٔ ترکیب‌ها را می‌بیند — یک قاعده به‌جای سی‌تا',
    both.fired.length === 2 && both.fired.map((row) => row.comboKey).sort().join(',') === 'A,B');
  const scoped = normalizeRule({ metric: 'current', op: 'ge', value: 6e5, strategyId: 'short-strangle', cooldownSec: 0 }).rule;
  check('و قاعدهٔ استراتژی‌دار فقط همان خانواده را',
    evaluateAlerts({ rules: [scoped], snapshots, prev: {}, nowMs: 5000 }).fired
      .map((row) => row.comboKey).join(',') === 'A');
  check('قاعده‌ها جهش نمی‌خورند؛ نسخهٔ تازه با شمارِ آتش برمی‌گردد',
    wide.firedCount === 0 && both.rules[0].firedCount === 1 && both.rules[0].lastFiredAt === 5000);
  check('و عکسِ این سنجش برای سنجش بعدی نگه داشته می‌شود',
    both.prev.A.current === 7e5);
  check('جملهٔ قاعده، سنجه و عملگر و واحد را با هم می‌گوید',
    ruleNote(wide).includes('فاصلهٔ اکنون') && ruleNote(wide).includes('ریال'), ruleNote(wide));

  // ── سنجه‌های بستری ──────────────────────────────────────────────────
  const withDay = alertSnapshot({
    gap: measureGap({ legs: STRANGLE, prices: { p46: 300, c56: 400 }, strategyId: 'short-strangle', entry: 9e5 }),
    day: { low: 6.5e5, high: 7.5e5 }, basePrice: 52646,
  });
  check('«درصد از کف امروز» از خودِ کف همان روز حساب می‌شود',
    near(withDay.fromDayLowPct, ((7e5 / 6.5e5) - 1) * 100), `${withDay.fromDayLowPct}`);
  check('و «درصد از سقف امروز» همیشه صفر یا منفی است',
    withDay.fromDayHighPct < 0 && near(withDay.fromDayHighPct, ((7e5 / 7.5e5) - 1) * 100));
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
