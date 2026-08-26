// ۵۰. رصد بازار — ستون، طیف، نمودار
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { buildChain, chainStats, underlyingList } from '../../core/chain.mjs';
import { heatRamp } from '../../ui/table.mjs';


// ═══════════════════════════ ۵۰. رصد بازار: ستون کامل، طیف مرتب‌سازی، نمودار ═══════════════════════════
group('۵۰. رصد بازار — ستون، طیف، نمودار');
{
  const mk50 = (strike, days, cBid, pBid) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 99500,
    insCode_C: `c${strike}_${days}`, insCode_P: `p${strike}_${days}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: 10, pMeOf_C: cBid * 1.05, qTitMeOf_C: 10,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 50, qTotTran5J_C: 100, qTotCap_C: 500, zTotTran_C: 5,
    pMeDem_P: pBid, qTitMeDem_P: 10, pMeOf_P: pBid * 1.05, qTitMeOf_P: 10,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 40, qTotTran5J_P: 80, qTotCap_P: 400, zTotTran_P: 4,
  });
  const chain50 = buildChain([mk50(90000, 30, 900, 300), mk50(100000, 30, 500, 500), mk50(110000, 60, 300, 900)]);
  const u50 = underlyingList(chain50)[0];

  // ——— تجمیع یک‌گذری ———
  check('قرارداد و قیمت اعمال و سررسید شمرده می‌شوند',
    u50.contracts === 6 && u50.strikes === 3 && u50.expiries === 2, `${u50.contracts}/${u50.strikes}/${u50.expiries}`);
  check('حجم و موقعیت باز، جمعِ دو سمت‌اند',
    u50.volume === u50.callVol + u50.putVol && u50.oi === u50.callOi + u50.putOi
    && u50.volume === 540 && u50.oi === 270, `حجم ${u50.volume} | موقعیت ${u50.oi}`);
  check('تفکیک کال و پوت درست است',
    u50.callVol === 300 && u50.putVol === 240 && u50.callOi === 150 && u50.putOi === 120);
  // نسبت روی حجم چیزی می‌گوید که نسبت روی موقعیت باز نمی‌گوید
  check('دو نسبت پوت به کال جدا محاسبه می‌شوند',
    near(u50.pcVolRatio, 240 / 300) && near(u50.pcRatio, 120 / 150));
  check('ارزش و تعداد معامله جمع می‌شوند', u50.value === 2700 && u50.trades === 27);
  check('دورترین سررسید هم گزارش می‌شود', u50.nearestDays === 30 && u50.farDays === 60);
  // فاصلهٔ مظنه میانه است نه میانگین: یک قرارداد بی‌رمق میانگین را بی‌معنی می‌کند
  check('میانه فاصله مظنه از قراردادهای دوطرفه می‌آید',
    u50.twoSided === 6 && near(u50.spreadMedPct, (0.05 / 1.025) * 100), u50.spreadMedPct);
  const noQuote50 = underlyingList(buildChain([{ ...mk50(100000, 30, 0, 0),
    pMeDem_C: 0, pMeOf_C: 0, pMeDem_P: 0, pMeOf_P: 0 }]))[0];
  check('بدون مظنه دوطرفه، فاصله خالی می‌ماند نه صفر',
    noQuote50.twoSided === 0 && !Number.isFinite(noQuote50.spreadMedPct));

  const st50 = chainStats(chain50);
  check('آمار کل، تفکیک موقعیت باز را هم می‌دهد',
    st50.callOi === 150 && st50.putOi === 120 && near(st50.pcOi, 0.8));
  check('کالِ صفر یعنی نسبت تعریف‌نشده، نه بی‌نهایت',
    !Number.isFinite(chainStats(buildChain([{ ...mk50(100000, 30, 500, 500), oP_C: 0 }])).pcOi));

  // ——— طیف رنگی ———
  //
  // دامنهٔ دوعلامتی باید هر طرف را با مقیاس خودش بسنجد. با یک مقیاس مشترک،
  // دامنه‌ای مثل [−۱۰، ۱۰۰۰] کل سمت زیان را بی‌رنگ می‌کند.
  check('دامنه دوعلامتی، واگرا می‌شود و هر طرف رنگ خودش را می‌گیرد',
    heatRamp(-10, -10, 1000, null).tone === 'loss' && heatRamp(500, -10, 1000, null).tone === 'gain');
  check('کوچک‌ترین زیان هم دیده می‌شود، چون مقیاس هر طرف جداست',
    near(heatRamp(-10, -10, 1000, null).t, 1));
  check('صفر در دامنه واگرا بی‌رنگ است', near(heatRamp(0, -50, 50, null).t, 0));
  check('دامنه یک‌طرفه رنگ اعلان‌شده ستون را می‌گیرد',
    heatRamp(5, 0, 10, 'loss').tone === 'loss' && heatRamp(5, 0, 10, 'gain').tone === 'gain'
    && heatRamp(5, 0, 10, null).tone === 'flat');
  // ریشهٔ دوم: بدون آن یک مقدار پرت بقیه را بی‌رنگ می‌کند
  check('شدت با ریشه دوم بالا می‌رود، نه خطی', near(heatRamp(25, 0, 100, null).t, 0.5));
  check('مقدار بیرون از دامنه مهار می‌شود',
    heatRamp(500, 0, 100, null).t === 1 && heatRamp(-5, 0, 100, null).t === 0);
  check('دامنه صفرپهنا یا مقدار نامعتبر، طیف نمی‌سازد',
    heatRamp(5, 5, 5, null) === null && heatRamp(NaN, 0, 10, null) === null
    && heatRamp(5, NaN, 10, null) === null);

  const tblSrc50 = readSrc('../ui/table.mjs');
  // ردیف رصد بازار مفهوم «قابل اجرا» ندارد. با `!r.executable` همه‌شان
  // خاکستریِ غیرقابل‌اجرا می‌شدند و چون آن کلاس طیف را کنار می‌زند، هیچ ردیفی
  // در رصد بازار رنگ نمی‌گرفت.
  check('نبودِ فیلد «قابل اجرا» با «قابل اجرا نیست» یکی گرفته نمی‌شود',
    tblSrc50.includes("if (r.executable === false) return 'unexec';"));
  check('ردیف هشداردار رنگ خودش را نگه می‌دارد، نه طیف را',
    /if \(!cls\) \{[\s\S]{0,200}?dataset\.heat/.test(tblSrc50));
  check('راهنمای طیف با هر مرتب‌سازی دوباره کشیده می‌شود',
    /computeRanges\(\);\n\s+drawLegend\(\);/.test(tblSrc50));
  check('ستون مرتب‌شده حتی بدون heat اعلان‌شده دامنه می‌گیرد',
    tblSrc50.includes("if (!c.heat && c.key !== sortKey) continue;"));

  const chainSrc50 = readSrc('../ui/tabs/chain.mjs');
  check('انتخابگر و ماندگاری ستون در رصد بازار روشن است',
    chainSrc50.includes('all: ALL_COLS') && chainSrc50.includes("storeKey: 'chain:market'"));
  check('نمودار میله‌ای با سنجهٔ قابل تعویض هست',
    chainSrc50.includes("id=\"mkt-metric\"") && chainSrc50.includes('function drawBars()'));
  // سنجه‌ای که تفکیک کال و پوت ندارد نباید نصف ساختگی بگیرد
  check('فقط سنجه‌های تفکیک‌پذیر دوتکه کشیده می‌شوند',
    /SPLIT = \{ volume: \['callVol', 'putVol'\], oi: \['callOi', 'putOi'\] \}/.test(chainSrc50));
}
