// ۲۱۲. پنجرهٔ قیمت اعمال و سرشماری قرارداد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// ═══ باگی که این دسته را ساخت ═══
//
// کاربر دو خروجی «آزمون همه استراتژی‌ها» گرفت — یکی ۱۴۰۴/۰۵/۰۱ و یکی
// ۱۴۰۵/۰۶/۰۱ — و هر دو برای استرانگل فروش دقیقاً شش ترکیب داشتند. عدد
// یکسان در دو بازار متفاوت، خودش نشانه بود.
//
// دو علتِ جدا داشت و هر دو اینجا بسته می‌شوند:
//
//   الف) دفترِ آن روز ناقص بود (۷ کال و ۸ پوت به‌جای ۳۶ و ۳۶). این را
//        فاز پیش بست، ولی **فایل خروجی هیچ‌جا نمی‌گفت با چند قرارداد
//        ساخته شده** — پس غلط بودنش از خودِ فایل پیدا نبود. سرشماری
//        قرارداد برای همین هست.
//   ب)  پنجرهٔ «± ۲۵٪ حول قیمت پایه» یک عدد ثابت بود که ربطی به فاصلهٔ
//        سررسید و به نردبان واقعی نداشت. برای استراتژی تک‌پا هیچ کاری
//        جز حذف نمی‌کرد، چون C(n,1)=n هیچ سقفی را نمی‌شکند.

import { check, group, readSrc } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { contractCensus, censusNote, generateHistoricalCombos } from '../../core/history.mjs';
import { jalaliToGregorian } from '../../core/jalali.mjs';
import { scan as scanFn } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import {
  DEFAULT_WINDOW_MODE, WINDOW_MODES, comboCount, fairShare,
  selectStrikes, windowMode, windowNote,
} from '../../core/strike-window.mjs';
import { byId } from '../../strategies/catalog.mjs';


group('۲۱۲-الف. حساب ترکیب و حالت پنجره');
{
  check('C(n,k) پایه‌ای درست است',
    comboCount(13, 2) === 78 && comboCount(12, 4) === 495 && comboCount(5, 1) === 5,
    `${comboCount(13, 2)} · ${comboCount(12, 4)} · ${comboCount(5, 1)}`);
  check('n کمتر از k یعنی صفر ترکیب، نه عدد منفی یا NaN',
    comboCount(2, 4) === 0 && comboCount(0, 1) === 0);
  check('عدد نجومی به بی‌نهایت می‌رود و سرریز نمی‌شود',
    comboCount(400, 100) === Infinity);
  check('پیش‌فرض «خودکار» است و در فهرست حالت‌ها هست',
    DEFAULT_WINDOW_MODE === 'auto' && WINDOW_MODES.some(([id]) => id === 'auto'));
  check('حالت ناشناخته خطا نمی‌دهد و به خودکار برمی‌گردد',
    windowMode('چیزی-که-نیست') === 'auto' && windowMode(undefined) === 'auto' && windowMode('pct') === 'pct');
}


group('۲۱۲-ب. انتخاب قیمت اعمال');
{
  const ladder = [26, 28, 30, 34, 38, 42, 46, 50, 56, 62, 68, 74].map((k) => k * 1000);
  const spot = 52646;

  // ── تک‌پا: پنجره هیچ کاری ندارد و نباید بکند ─────────────────────────
  const solo = selectStrikes({ strikes: ladder, spot, legs: 1, cap: 400 });
  check('استراتژی تک‌پا: هیچ قیمت اعمالی کنار نمی‌رود',
    solo.picked.length === 12 && solo.dropped.length === 0 && solo.forced === false,
    `${solo.picked.length} ماند`);

  // ── چهارپا زیر سقف تنگ: کنار می‌رود، ولی از دورترین ──────────────────
  const tight = selectStrikes({ strikes: ladder, spot, legs: 4, cap: 40 });
  check('سقف تنگ، قیمت اعمال کنار می‌گذارد و «اجباری» علامت می‌خورد',
    tight.forced === true && tight.dropped.length > 0);
  check('و همان‌قدر که لازم است، نه بیشتر — تعداد نهایی زیر سقف می‌نشیند',
    comboCount(tight.picked.length, 4) <= 40 && comboCount(tight.picked.length + 1, 4) > 40,
    `${tight.picked.length} قیمت اعمال → ${comboCount(tight.picked.length, 4)} ترکیب`);
  const far = Math.max(...tight.dropped.map((k) => Math.abs(k - spot)));
  const near = Math.max(...tight.picked.map((k) => Math.abs(k - spot)));
  check('کنارگذاشته‌ها دورترین‌ها از قیمت پایه‌اند، نه دلخواه',
    far >= near, `دورترینِ مانده ${near} · نزدیک‌ترینِ رفته ${far}`);
  check('هیچ قیمت اعمالی ساخته نمی‌شود؛ خروجی زیرمجموعهٔ ورودی است',
    tight.picked.every((k) => ladder.includes(k))
    && tight.picked.length + tight.dropped.length === ladder.length);

  // ── درصد ثابت: همان رفتار پیشین، دست‌نخورده ─────────────────────────
  const pct = selectStrikes({ strikes: ladder, spot, legs: 2, cap: 400, mode: 'pct', pct: 25 });
  check('حالت درصد ثابت دقیقاً همان پنج قیمت اعمال قدیمی را می‌دهد',
    pct.picked.join(',') === [42000, 46000, 50000, 56000, 62000].join(','),
    pct.picked.join('،'));
  check('و درصد ثابت هرگز «اجباری» نیست — سلیقهٔ کاربر است، نه سقف',
    pct.forced === false && pct.dropped.length === 7);

  // ── بی‌پنجره ─────────────────────────────────────────────────────────
  const all = selectStrikes({ strikes: ladder, spot, legs: 4, cap: 10, mode: 'all' });
  check('حالت «همه» حتی زیر سقفِ خفه‌کننده هم چیزی کنار نمی‌گذارد',
    all.picked.length === 12 && all.dropped.length === 0);

  // ── شمار پله ─────────────────────────────────────────────────────────
  const steps = selectStrikes({ strikes: ladder, spot, legs: 2, cap: 400, mode: 'steps', steps: 3 });
  check('سه پله هر طرف یعنی شش قیمت اعمال حول پایه',
    steps.picked.join(',') === [42000, 46000, 50000, 56000, 62000, 68000].join(','),
    steps.picked.join('،'));

  // ── بی‌قیمتِ پایه هیچ «دور»ی تعریف نمی‌شود ───────────────────────────
  const blind = selectStrikes({ strikes: ladder, spot: 0, legs: 4, cap: 5 });
  check('بی قیمت پایه، هیچ قراردادی با حدسِ مرکز حذف نمی‌شود',
    blind.dropped.length === 0 && blind.reason === 'noSpot');

  // ── گره‌گشاییِ اعلام‌شده ─────────────────────────────────────────────
  //
  // ۴۶ و ۵۴ از پایهٔ ۵۰ دقیقاً هم‌فاصله‌اند و یکی باید برود. قاعده اعلام
  // شده: بالاتری. بی این ادعا، تصمیم به پایداریِ `sort` واگذار بود —
  // درست کار می‌کرد ولی هیچ آزمونی نمی‌گفت کدام‌یک باید برود.
  const tie = [46, 48, 50, 52, 54].map((k) => k * 1000);
  const cut = selectStrikes({ strikes: tie, spot: 50000, legs: 2, cap: 6 });
  check('در فاصلهٔ برابر، بالاتری کنار می‌رود — قاعده‌ای اعلام‌شده، نه اتفاقی',
    cut.dropped.join(',') === '54000', cut.dropped.join('،'));
  check('و ترتیب ورودی، که پیش از انتخاب مرتب می‌شود، اثری ندارد',
    selectStrikes({ strikes: [...tie].reverse(), spot: 50000, legs: 2, cap: 6 }).picked.join(',')
    === cut.picked.join(','));

  // ── مرزِ دقیقِ سقف ────────────────────────────────────────────────────
  //
  // وقتی C(n,k) دقیقاً برابر سقف است، باید بماند نه اینکه یک پله دیگر هم
  // بریده شود. با ۱۲ قیمت اعمال و دو پا، سقفِ ۳۶ یعنی دقیقاً ۹ تا.
  const edge = selectStrikes({ strikes: ladder, spot, legs: 2, cap: 36 });
  check('سقفِ دقیقاً برابر، یک پله اضافه نمی‌بُرد',
    edge.picked.length === 9 && comboCount(9, 2) === 36, `${edge.picked.length} قیمت اعمال`);

  check('جملهٔ پنجره، «اجباری» را از «انتخابی» جدا می‌گوید',
    windowNote(tight).includes('سقف') && windowNote(pct).includes('پنجرهٔ انتخابی')
    && windowNote(solo).includes('همهٔ'));
}


group('۲۱۲-ج. سهم برابر هر سررسید');
{
  check('سقف ۱۲۰ روی سه سررسید یعنی ۴۰ برای هرکدام',
    fairShare(120, 3, 120) === 40, `${fairShare(120, 3, 120)}`);
  check('سقفِ خودِ سررسید اگر تنگ‌تر باشد، همان می‌ماند',
    fairShare(4000, 2, 50) === 50);
  check('هیچ سررسیدی سهم صفر نمی‌گیرد — حذفِ خاموش همین بود',
    fairShare(2, 10, 400) === 1 && fairShare(0, 0, 0) >= 1);
}


// ═══════════ ۲۱۲-د. بازتولید موردِ واقعی: اهرم، ۱۴۰۵/۰۶/۰۱ ═══════════
//
// نردبان و قیمت پایه از همان اجرای واقعی گرفته شده‌اند. حالت «درصد ثابت»
// باید دقیقاً ۳۰ استرانگل بدهد — عددی که اجرای واقعی روی کامیت 75d95d0 داد.
// اگر این عدد جابه‌جا شود، فرضِ این دسته دیگر با برنامه نمی‌خواند.
group('۲۱۲-د. اهرم ۱۴۰۵/۰۶/۰۱ — استرانگل فروش');
{
  const g = (jy, jm, jd) => { const [y, m, d] = jalaliToGregorian(jy, jm, jd); return (y * 10000) + (m * 100) + d; };
  const ENTRY = g(1405, 6, 1);
  const SPOT = 52646;
  const LADDERS = [
    [g(1405, 6, 25), [26, 28, 30, 34, 38, 42, 46, 50, 56, 62, 68, 74]],
    [g(1405, 7, 29), [20, 22, 24, 26, 28, 30, 34, 38, 42, 46, 50, 56, 62]],
    [g(1405, 8, 27), [30, 34, 38, 42, 46, 50, 56, 62, 68, 74, 80]],
  ];
  const day = (end) => Math.round((Date.UTC(Math.trunc(end / 10000), (Math.trunc(end / 100) % 100) - 1, end % 100)
    - Date.UTC(2026, 7, 23)) / 86400000);

  const rows = [];
  const series = { 9: [{ date: ENTRY, close: SPOT, last: SPOT, first: SPOT, low: SPOT, high: SPOT, vol: 5e6, value: 1e11 }] };
  for (const [end, ks] of LADDERS) {
    for (const k of ks) {
      const c = `c${end}_${k}`, p = `t${end}_${k}`;
      rows.push({
        uaInsCode: '9', lval30_UA: 'اهرم', pDrCotVal_UA: SPOT, pClosing_UA: SPOT, priceYesterday_UA: SPOT,
        insCode_C: c, lVal18AFC_C: `ضهرم${k}`, insCode_P: p, lVal18AFC_P: `طهرم${k}`,
        strikePrice: k * 1000, contractSize: 1000, remainedDay: day(end), endDate: end,
        pMeDem_C: 900, qTitMeDem_C: 500, pMeOf_C: 950, qTitMeOf_C: 500, pDrCotVal_C: 920, pClosing_C: 920, oP_C: 300, qTotTran5J_C: 900,
        pMeDem_P: 800, qTitMeDem_P: 500, pMeOf_P: 850, qTitMeOf_P: 500, pDrCotVal_P: 820, pClosing_P: 820, oP_P: 300, qTotTran5J_P: 900,
      });
      for (const ins of [c, p]) series[ins] = [{ date: ENTRY, close: 900, last: 900, first: 900, low: 880, high: 920, vol: 1000, value: 9e8 }];
    }
  }
  const ua = buildChain(rows, defaults()).get('9');
  // همان سقفی که کاربر داشت: ۱۲۰ ترکیب برای هر استراتژی.
  const base = { ...defaults(), maxRows: 120, maxCombosPerExpiry: 120 };
  const def = byId('short-strangle');
  const run = (settings) => generateHistoricalCombos({
    def, ua, seriesByIns: series, startDate: ENTRY, entryBasis: 'CLOSE', settings,
  });

  const pct = run({ ...base, comboWindowMode: 'pct', comboWindowPct: 25 });
  check('حالت درصد ثابت همان ۳۰ استرانگلِ اجرای واقعی را می‌سازد',
    pct.combos.length === 30, `${pct.combos.length} ترکیب`);
  check('و ۲۱ قیمت اعمالِ کنارگذاشته را دیگر ساکت نمی‌گذارد',
    pct.outOfWindow === 21, `${pct.outOfWindow}`);

  const auto = run({ ...base, comboWindowMode: 'auto' });
  check('حالت خودکار با همان سقف، چهاربرابرِ درصد ثابت ترکیب می‌سازد',
    auto.combos.length === 120, `${auto.combos.length} ترکیب`);
  // آنچه اینجا مهار می‌کند، سقفِ خودِ کاربر است — نه پنجره. پنجره حق
  // ندارد پیش از آزمونِ قیمت ورود چیزی را کنار بگذارد.
  check('و پنجره هیچ قیمت اعمالی را کنار نگذاشته؛ فقط سقفِ کاربر خورده',
    auto.capped === true && auto.outOfWindow === 0, `${auto.outOfWindow} قیمت اعمال`);
  check('سقف تا آخرین ردیفش خرج می‌شود، نه ۱۱۲ تا از ۱۲۰',
    auto.combos.length === base.maxRows, `${auto.combos.length} از ${base.maxRows}`);

  // سقف که باز شود، خودکار هیچ‌چیز کنار نمی‌گذارد. این همان دستگیره‌ای
  // است که کاربر باید بچرخاند، نه درصد.
  const roomy = run({ ...base, maxRows: 4000, maxCombosPerExpiry: 400, comboWindowMode: 'auto' });
  check('با سقف بازتر، خودکار هر ۳۶ قیمت اعمال را وارد می‌کند',
    roomy.outOfWindow === 0 && roomy.combos.length === 199,
    `${roomy.combos.length} ترکیب · ${roomy.outOfWindow} کنار`);

  // ── سرشماری ─────────────────────────────────────────────────────────
  const cen = contractCensus({ ua, seriesByIns: series, startDate: ENTRY, entryBasis: 'CLOSE', settings: { ...base, comboWindowMode: 'auto' } });
  check('سرشماری همان ۳۶ کال و ۳۶ پوتِ اجرای واقعی را می‌شمارد',
    cen.call === 36 && cen.put === 36 && cen.alive === 72,
    `${cen.call}/${cen.put}/${cen.alive}`);
  check('و هر ۳۶ سری کامل است — هیچ یک‌سمته‌ای نمانده',
    cen.pairs === 36 && cen.incomplete === 0, `${cen.pairs} کامل · ${cen.incomplete} یک‌سمته`);
  check('سه سررسید، هرکدام با نردبان خودش',
    cen.expiries.length === 3
    && cen.expiries.map((e) => e.strikes).join(',') === '12,13,11',
    cen.expiries.map((e) => e.strikes).join('،'));
  check('اثر پنجره برای یک تا چهار پا جدا گزارش می‌شود',
    cen.windows.length === 4 && cen.windows[0].dropped === 0 && cen.windows[1].dropped === 9,
    JSON.stringify(cen.windows.map((w) => w.dropped)));
  check('جملهٔ سرشماری، شمار قرارداد و علت کنار رفتن را با هم می‌گوید',
    censusNote(cen, 2).includes('۷۲') && censusNote(cen, 2).includes('سقف'),
    censusNote(cen, 2));

  // ── همان جدایی، در مسیر زنده ────────────────────────────────────────
  const liveBase = { ...defaults(), maxRows: 120, maxCombosPerExpiry: 120, greeksInScan: false };
  const livePct = scanFn({ def, chain: buildChain(rows, defaults()), uaKeys: ['9'], settings: { ...liveBase, comboWindowMode: 'pct', comboWindowPct: 25 } });
  const liveAuto = scanFn({ def, chain: buildChain(rows, defaults()), uaKeys: ['9'], settings: { ...liveBase, comboWindowMode: 'auto' } });
  check('مسیر زنده هم همان قاعده را دارد، نه قاعدهٔ دیگری',
    liveAuto.funnel.built > livePct.funnel.built && livePct.funnel.outOfWindow === 21,
    `زنده ${livePct.funnel.built} → ${liveAuto.funnel.built}`);
}


// ═══════════ ۲۱۲-ز. ترتیب: قیمت ورود، بعد سقف ═══════════
//
// گزارش صاحب پروژه: «سقف ۱۲۰ ترکیب، قبل از بررسی وجود قیمت ورود اعمال
// شده است... ترتیب درست باید این باشد: بررسی قیمت ورود ← ساخت ترکیب‌های
// معتبر ← اعمال سقف.»
//
// درست بود. دو نگهبان یک بودجه را نگه می‌داشتند و نگهبان اول — پنجره —
// پیش از آزمونِ قیمت اجرا می‌شد. پس بودجه صرفِ قیمت‌های اعمالی می‌شد که
// هرگز ترکیبی نمی‌ساختند.
group('۲۱۲-ز. ترتیب: قیمت ورود، بعد سقف');
{
  const g = (jy, jm, jd) => { const [y, m, d] = jalaliToGregorian(jy, jm, jd); return (y * 10000) + (m * 100) + d; };
  const ENTRY = g(1405, 6, 1), END = g(1405, 7, 29), SPOT = 52646;
  const LADDER = [20, 22, 24, 26, 28, 30, 34, 38, 42, 46, 50, 56, 62];
  // فقط این‌ها روز ورود قیمت دارند. بقیه هرگز ترکیبی نمی‌سازند.
  const PRICED = { call: [38, 42, 46, 50, 56, 62], put: [20, 22, 24, 26, 28, 30, 34] };

  const rows = [];
  const series = { 9: [{ date: ENTRY, close: SPOT, last: SPOT, first: SPOT, low: SPOT, high: SPOT, vol: 5e6, value: 1e11 }] };
  const px = { date: ENTRY, close: 900, last: 900, first: 900, low: 880, high: 920, vol: 1000, value: 9e8 };
  for (const k of LADDER) {
    const c = `c${k}`, p = `t${k}`;
    rows.push({
      uaInsCode: '9', lval30_UA: 'اهرم', pDrCotVal_UA: SPOT, pClosing_UA: SPOT, priceYesterday_UA: SPOT,
      insCode_C: c, lVal18AFC_C: `ضهرم${k}`, insCode_P: p, lVal18AFC_P: `طهرم${k}`,
      strikePrice: k * 1000, contractSize: 1000, remainedDay: 59, endDate: END,
      pMeDem_C: 900, qTitMeDem_C: 500, pMeOf_C: 950, qTitMeOf_C: 500, pDrCotVal_C: 920, pClosing_C: 920, oP_C: 300, qTotTran5J_C: 900,
      pMeDem_P: 800, qTitMeDem_P: 500, pMeOf_P: 850, qTitMeOf_P: 500, pDrCotVal_P: 820, pClosing_P: 820, oP_P: 300, qTotTran5J_P: 900,
    });
    if (PRICED.call.includes(k)) series[c] = [px];
    if (PRICED.put.includes(k)) series[p] = [px];
  }
  // شمار واقعیِ استرانگلِ قابل بک‌تست: پوتِ پایین‌تر، کالِ بالاتر، هر دو قیمت‌دار.
  let buildable = 0;
  for (const p of PRICED.put) for (const c of PRICED.call) if (c > p) buildable += 1;

  const ua = buildChain(rows, defaults()).get('9');
  const run = (cap) => generateHistoricalCombos({
    def: byId('short-strangle'), ua, seriesByIns: series, startDate: ENTRY, entryBasis: 'CLOSE',
    settings: { ...defaults(), maxRows: cap, maxCombosPerExpiry: cap },
  });

  check('نردبان ۱۳تایی است ولی فقط ۴۲ استرانگلِ قیمت‌دار دارد',
    buildable === 42 && LADDER.length === 13, `${buildable} ترکیب`);

  // سقفی که از شمارِ قابل‌بک‌تست بزرگ‌تر است، نباید هیچ‌چیز را ببُرد.
  const roomy = run(120);
  check('سقفِ ۱۲۰ روی ۴۲ ترکیبِ قیمت‌دار، هیچ‌چیز را نمی‌بُرد',
    roomy.combos.length === buildable && roomy.capped === false,
    `${roomy.combos.length} از ${buildable} · سقف‌خورده ${roomy.capped}`);
  check('و پنجره هم دست نمی‌زند — این همان اشتباهِ ترتیب بود',
    roomy.outOfWindow === 0, `${roomy.outOfWindow} قیمت اعمال`);
  // برای استرانگل هر ۱۳ قیمت اعمال زنده‌اند: یا کالش قیمت دارد یا پوتش.
  // پس هیچ‌کدام حذف نمی‌شوند — و این درست است، نه یک نقص.
  check('استرانگل هر ۱۳ قیمت اعمال را زنده می‌بیند، چون هر کدام یک سمتِ قیمت‌دار دارد',
    roomy.noPriceStrikes === 0, `${roomy.noPriceStrikes} قیمت اعمال بی‌قیمت`);

  // و وقتی سقف واقعاً کوچک‌تر است، بُرش می‌خورد ولی گزارش می‌شود.
  const tight = run(20);
  check('سقفِ کوچک‌تر از شمارِ قابل‌بک‌تست، می‌بُرد و «سقف‌خورده» می‌شود',
    tight.combos.length === 20 && tight.capped === true,
    `${tight.combos.length} ترکیب`);

  // ── همان اشکال، در دو پای کال ────────────────────────────────────────
  //
  // استراتژیِ فقط-کال نباید قیمت اعمالی را زنده نگه دارد که تنها پوتش
  // قیمت دارد. آزمونِ «قیمت‌دار بودن» روی نوعِ خودِ استراتژی است.
  const bull = generateHistoricalCombos({
    def: byId('bull-call-spread'), ua, seriesByIns: series, startDate: ENTRY, entryBasis: 'CLOSE',
    settings: { ...defaults(), maxRows: 400, maxCombosPerExpiry: 400 },
  });
  const callOnly = (PRICED.call.length * (PRICED.call.length - 1)) / 2;
  check('اسپرد کال فقط از قیمت‌های اعمالِ کالِ قیمت‌دار ساخته می‌شود',
    bull.combos.length === callOnly, `${bull.combos.length} به‌جای ${callOnly}`);
  check('و قیمت اعمالی که فقط پوتش قیمت دارد، برای این استراتژی بی‌قیمت است',
    bull.noPriceStrikes === LADDER.length - PRICED.call.length,
    `${bull.noPriceStrikes} از ${LADDER.length - PRICED.call.length}`);

  // ── همان قاعده در مسیر زنده ─────────────────────────────────────────
  //
  // آنجا هم «بی‌مظنه» جای «بی‌قیمت ورود» را دارد و همان‌طور بعد از پنجره
  // آزموده می‌شود. سقفِ خروجی ۳۰ است و C(۱۳,۲)=۷۸ از آن بزرگ‌تر — اگر
  // پنجره سقفِ خروجی را بگیرد، نردبان را به ۸ می‌بُرد.
  const liveChain = buildChain(rows.map((row) => (PRICED.call.includes(row.strikePrice / 1000)
    ? row
    : { ...row, pMeDem_C: 0, pMeOf_C: 0, pDrCotVal_C: 0 })), defaults());
  const liveSettings = {
    ...defaults(), maxRows: 30, maxCombosPerExpiry: 30, greeksInScan: false,
    minBidQty: 0, minOpenInt: 0, minLegVol: 0, minLegValue: 0, minUaLiquidity: 0,
  };
  const live = scanFn({ def: byId('short-strangle'), chain: liveChain, uaKeys: ['9'], settings: liveSettings });
  check('مسیر زنده هم پیش از آزمونِ مظنه نردبان را نمی‌بُرد',
    live.funnel.outOfWindow === 0 && comboCount(LADDER.length, 2) > liveSettings.maxRows,
    `${live.funnel.outOfWindow} کنار · ${comboCount(LADDER.length, 2)} ترکیب ساختاری`);
  check('و ترکیبِ بی‌مظنه شمرده می‌شود، نه اینکه بودجه را خورده باشد',
    live.funnel.noQuote > 0, `${live.funnel.noQuote} بی‌مظنه`);
}


// ═══════════ ۲۱۲-ه. قرارداد بی‌قیمت، از قراردادِ نبوده جدا است ═══════════
//
// هر دو «ترکیب نمی‌سازند»، ولی یکی‌شان نقص داده است و دیگری واقعیت بازار.
// در یک سطل ریختنشان یعنی کاربر نمی‌فهمد کدام را باید پیگیری کند.
group('۲۱۲-ه. بی‌قیمت، ساکت و بی‌سابقه');
{
  const g = (jy, jm, jd) => { const [y, m, d] = jalaliToGregorian(jy, jm, jd); return (y * 10000) + (m * 100) + d; };
  const ENTRY = g(1405, 6, 1), BEFORE = g(1405, 5, 20), AFTER = g(1405, 6, 10);
  const END = g(1405, 7, 29);
  const mk = (k) => ({
    uaInsCode: '9', lval30_UA: 'اهرم', pDrCotVal_UA: 50000, pClosing_UA: 50000, priceYesterday_UA: 50000,
    insCode_C: `c${k}`, lVal18AFC_C: `ضهرم${k}`, insCode_P: `t${k}`, lVal18AFC_P: `طهرم${k}`,
    strikePrice: k * 1000, contractSize: 1000, remainedDay: 58, endDate: END,
    pMeDem_C: 900, qTitMeDem_C: 500, pMeOf_C: 950, qTitMeOf_C: 500, pDrCotVal_C: 920, pClosing_C: 920, oP_C: 300, qTotTran5J_C: 900,
    pMeDem_P: 800, qTitMeDem_P: 500, pMeOf_P: 850, qTitMeOf_P: 500, pDrCotVal_P: 820, pClosing_P: 820, oP_P: 300, qTotTran5J_P: 900,
  });
  const ua = buildChain([mk(46), mk(50), mk(54)], defaults()).get('9');
  const traded = { date: ENTRY, close: 900, last: 900, first: 900, low: 880, high: 920, vol: 1000, value: 9e8 };
  const series = {
    9: [{ date: ENTRY, close: 50000, last: 50000, first: 50000, low: 50000, high: 50000, vol: 5e6, value: 1e11 }],
    c46: [traded], t46: [traded], c50: [traded], t50: [traded],
    // ۵۴ کال: پیش از روز ورود معامله شده ولی همان روز نه → «ساکت»
    c54: [{ ...traded, date: BEFORE }],
    // ۵۴ پوت: نخستین معامله‌اش بعد از روز ورود است → «بی‌سابقه»
    t54: [{ ...traded, date: AFTER }],
  };
  const cen = contractCensus({ ua, seriesByIns: series, startDate: ENTRY, entryBasis: 'CLOSE', settings: defaults() });
  check('قراردادِ معامله‌شده پیش از روز ورود ولی نه در آن روز، «ساکت» است',
    cen.silent === 1, `${cen.silent}`);
  check('قراردادی که نخستین معامله‌اش بعد از روز ورود است، «بی‌سابقه» است',
    cen.unseen === 1, `${cen.unseen}`);
  check('و چهار قرارداد دیگر قیمت ورود دارند',
    cen.priced === 4 && cen.alive === 6, `${cen.priced}/${cen.alive}`);
  check('جملهٔ سرشماری هر دو را جدا نام می‌برد',
    censusNote(cen, 2).includes('معامله نشد') && censusNote(cen, 2).includes('سابقهٔ معامله'),
    censusNote(cen, 2));

  // ── نام، نه فقط عدد ────────────────────────────────────────────────
  //
  // «۲۷ قرارداد قیمت ورود نداشت» قابل پیگیری نیست: کاربر نمی‌داند کدام
  // سررسید و کدام قیمت اعمال از دستش رفته و نمی‌تواند برود همان نماد را
  // در تابلو ببیند.
  check('هر قراردادِ کنارمانده با نام خودش فهرست می‌شود',
    cen.excluded.length === 2, `${cen.excluded.length} ردیف`);
  // `?? {}` عمدی است: ادعا باید **رد شود**، نه بترکد. جهشی که علت‌ها را
  // جابه‌جا می‌کرد با استثنا گرفته می‌شد و استثنا کل دسته را از نیمه
  // قطع می‌کند — یعنی هر ادعای بعدیِ این فایل هم بی‌صدا اجرا نمی‌شد.
  const byReason = Object.fromEntries(cen.excluded.map((row) => [row.reason, row]));
  const silentRow = byReason.silent ?? {};
  const unseenRow = byReason.unseen ?? {};
  check('و علتش درست تفکیک می‌شود',
    !!byReason.silent && !!byReason.unseen
    && silentRow.strike === 54000 && unseenRow.strike === 54000
    && silentRow.kind === 'call' && unseenRow.kind === 'put',
    cen.excluded.map((r) => `${r.kind}/${r.strike}/${r.reason}`).join('، '));
  check('«ساکت» تاریخ نخستین معامله‌اش را دارد، «بی‌سابقه» ندارد',
    silentRow.firstTrade === BEFORE && unseenRow.firstTrade === AFTER,
    `${silentRow.firstTrade} · ${unseenRow.firstTrade}`);
  check('کد نماد هم می‌آید تا بشود در تابلو دنبالش گشت',
    cen.excluded.every((row) => typeof row.ins === 'string' && row.ins.length > 0));

  // قراردادی که قیمت دارد ولی زیر دروازهٔ نقدشوندگیِ خودِ کاربر است، علت
  // سومی دارد: خودِ کاربر می‌تواند آستانه را پایین بیاورد.
  const gated = contractCensus({
    ua, seriesByIns: series, startDate: ENTRY, entryBasis: 'CLOSE', settings: defaults(),
    liquidity: { minLegVolume: 5000 },
  });
  check('زیر دروازهٔ نقدشوندگی، علت سوم است و با بی‌قیمتی قاطی نمی‌شود',
    gated.illiquid === 4 && gated.priced === 4
    && gated.excluded.filter((row) => row.reason === 'illiquid').length === 4,
    `${gated.illiquid} زیر دروازه از ${gated.priced} قیمت‌دار`);

  // سری یک‌سمته
  const half = buildChain([{ ...mk(46), insCode_P: '', lVal18AFC_P: '' }, mk(50)], defaults()).get('9');
  const cen2 = contractCensus({ ua: half, seriesByIns: series, startDate: ENTRY, entryBasis: 'CLOSE', settings: defaults() });
  check('سری بی‌پوت، «یک‌سمته» شمرده می‌شود و پوتی برایش ساخته نمی‌شود',
    cen2.incomplete === 1 && cen2.pairs === 1 && cen2.alive === 3,
    `${cen2.pairs} کامل · ${cen2.incomplete} یک‌سمته · ${cen2.alive} قرارداد`);

  // ── قراردادی که پیش از روز ورود سررسید شده ──────────────────────────
  //
  // بازهٔ تحلیل می‌تواند سررسیدِ گذشته را هم در دفتر داشته باشد. آن قرارداد
  // در آن روز خریدنی نبوده و نباید در شمارِ «زنده» بیاید — وگرنه سرشماری
  // عددی می‌دهد که هیچ ترکیبی پشتش نیست و کاربر دنبال ترکیبِ نساخته
  // می‌گردد.
  const past = g(1405, 5, 20);
  const gone = { ...mk(50), endDate: past, remainedDay: -12, insCode_C: 'cOld', insCode_P: 'tOld' };
  const mixed = buildChain([mk(46), gone], defaults()).get('9');
  const cen3 = contractCensus({
    ua: mixed, seriesByIns: { ...series, cOld: [traded], tOld: [traded] },
    startDate: ENTRY, entryBasis: 'CLOSE', settings: defaults(),
  });
  check('سررسیدشدهٔ پیش از روز ورود، «منقضی» است نه «زنده»',
    cen3.alive === 2 && cen3.expired === 2 && cen3.total === 4,
    `${cen3.alive} زنده · ${cen3.expired} منقضی · ${cen3.total} کل`);
  check('و در هیچ سررسیدی از سرشماری ظاهر نمی‌شود',
    cen3.expiries.length === 1 && cen3.expiries[0].expiry > ENTRY,
    `${cen3.expiries.length} سررسید`);
}


// ═══════════ ۲۱۲-و. خروجی، خودش را قابل قضاوت می‌کند ═══════════
group('۲۱۲-و. سرشماری در خروجی اکسل');
{
  const src = readSrc('../ui/portfolio-backtest-export.mjs');
  check('برگ «قراردادها» در دفترچه هست', src.includes("sheet('قراردادها'"));
  check('برگ «پنجره قیمت اعمال» هم هست', src.includes("sheet('پنجره قیمت اعمال'"));
  check('سرشناسه شمار قرارداد زنده را می‌گوید', src.includes('قرارداد زنده در روز ورود'));
  check('و قاعدهٔ پنجره را نام می‌برد، نه فقط عددش',
    src.includes('قاعده پنجره قیمت اعمال') && src.includes('windowModeLabel'));
  check('«محدودیت داده» سری یک‌سمته را جدا می‌شمارد',
    src.includes('سری فقط یک‌سمته'));

  const worker = readSrc('../worker/history-worker.mjs');
  check('سرشماری در ریسه ساخته و با نتیجه فرستاده می‌شود',
    worker.includes('contractCensus(') && /report, generatedByStrategy, census/.test(worker));

  const tab = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('و در رابط، پیش از هر عددِ ترکیبی نشان داده می‌شود',
    tab.includes("$('pb-census')") && tab.includes('censusNote(census, 2)'));
  check('و به دفترچهٔ اکسل هم پاس داده می‌شود',
    /basket, generated, census, dateLabel/.test(tab));

  check('برگ «قرارداد بی‌قیمت» نامِ تک‌تکشان را می‌برد',
    src.includes("sheet('قرارداد بی‌قیمت'") && src.includes('EXCLUDE_REASONS'));
  check('و سه علت، سه متن جدا دارند — نه یک برچسبِ سرجمع',
    src.includes('تا آن روز هیچ معامله‌ای نداشت')
    && src.includes('آن روز معامله نشد')
    && src.includes('زیر دروازهٔ نقدشوندگیِ خودت'));
  check('ستون نقدشوندگی می‌گوید زیرمجموعهٔ قیمت‌دارهاست، نه سطل چهارم',
    src.includes('از دارای قیمت: زیر دروازهٔ نقدشوندگی'));
}
