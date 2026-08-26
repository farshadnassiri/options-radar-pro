// ۵۲. سناریو، حساسیت، و ریسک عمق دفتر
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { bsPrice, probBelow } from '../../core/bs.mjs';
import { grossCash, pnlAtExpiry } from '../../core/payoff.mjs';
import {
  SENS_AXES, SENS_METRICS, bookDepthRisk, scenarioLadder, sensitivityAxis, sensitivityGrid,
} from '../../core/scenario.mjs';


// ═══════════════════════════ ۵۲. سناریو، حساسیت، و ریسک عمق دفتر ═══════════════════════════
group('۵۲. سناریو، حساسیت، و ریسک عمق دفتر');
{
  // Bull Call Spread: خرید کال ۱۰۰ به ۸ ، فروش کال ۱۱۰ به ۳ ، اندازه ۱۰۰۰
  const legs52 = [
    { kind: 'call', side: 'buy', strike: 100, price: 8, ratio: 1, size: 1000, name: 'C100' },
    { kind: 'call', side: 'sell', strike: 110, price: 3, ratio: 1, size: 1000, name: 'C110' },
  ];
  const net52 = grossCash(legs52);
  const base52 = { legs: legs52, spot: 100, days: 60, sigma: 0.4, rFree: 0.25, divYield: 0, yearDays: 365 };
  const lad52 = scenarioLadder(base52);

  check('نردبان سناریو ساخته می‌شود', lad52.length >= 8, `${lad52.length} سطح`);
  // مهم‌ترین ثابت این ماژول: اگر جدول و نمودار از دو راه حساب کنند، دو حرف
  // می‌زنند و کاربر نمی‌فهمد کدام درست است.
  check('سود و زیان هر سطح، دقیقاً همان چیزی است که نمودار بازده می‌کشد',
    lad52.every((r) => near(r.pnl, pnlAtExpiry(legs52, r.level, net52))));
  check('تفکیک هر پا با جمع کل می‌خواند',
    lad52.every((r) => near(r.pnl, r.perLeg.reduce((a, l) => a + l.pnl, 0))));
  check('از بدترین به بهترین مرتب است',
    lad52.every((r, i) => i === 0 || lad52[i - 1].pnl <= r.pnl));
  // در ترکیب سقف‌دار همهٔ سطوح بالای سقف یک عدد می‌دهند؛ بدون مرتب‌سازی دوم
  // «صدک ۹۵» بعد از «صدک ۹۹» می‌نشیند.
  check('سطوح هم‌سود بر پایه قیمت مرتب می‌مانند',
    lad52.every((r, i) => i === 0 || lad52[i - 1].pnl < r.pnl || lad52[i - 1].level <= r.level));
  check('سقف سود و کف زیان همان اسپرد است',
    near(Math.max(...lad52.map((r) => r.pnl)), 5000) && near(Math.min(...lad52.map((r) => r.pnl)), -5000));
  check('قیمت امروز همیشه در فهرست هست', lad52.some((r) => r.kind === 'spot' && near(r.level, 100)));
  check('احتمال هر سطح با صدکش می‌خواند',
    lad52.filter((r) => r.kind === 'percentile').every((r) => near(r.probBelow * 100, r.pct, 0.5)));
  // بدون تلاطم، صدک ساخته نمی‌شود ولی قیمت امروز باید بماند
  const noVol52 = scenarioLadder({ ...base52, sigma: 0 });
  check('بدون تلاطم، فقط قیمت امروز می‌ماند — نه صدکِ ساختگی',
    noVol52.length === 1 && noVol52[0].kind === 'spot');
  check('ورودی تهی، خروجی تهی می‌دهد',
    scenarioLadder({}).length === 0 && scenarioLadder({ legs: legs52, spot: 0 }).length === 0);

  // ——— حساسیت ———
  const grid52 = sensitivityGrid({ ...base52, axis: 'days', moves: [-20, 0, 20], steps: 3 });
  check('جدول حساسیت، سطر و ستون درست دارد',
    grid52.rows.length === 3 && grid52.axisValues.length === 3,
    `${grid52.rows.length}×${grid52.axisValues.length}`);
  check('هر خانه، تفکیک پا دارد و با جمعش می‌خواند',
    grid52.rows.every((r) => r.cells.every((c) => near(c.pnl, c.perLeg.reduce((a, v) => a + v, 0)))));
  // روی محور روز، صفر یعنی سررسید — و آن‌جا باید دقیقاً منحنی سررسید باشد،
  // نه بلک‌شولز با تی خیلی کوچک که عددی شبیه درست می‌دهد.
  const atExpiry52 = grid52.axisValues.indexOf(0);
  check('روز صفر، دقیقاً همان سود و زیان سررسید است',
    atExpiry52 >= 0 && grid52.rows.every((r) => near(r.cells[atExpiry52].pnl, pnlAtExpiry(legs52, r.level, net52))));
  check('پیش از سررسید، ارزش زمانی هنوز هست',
    grid52.rows.find((r) => r.movePct === -20).cells[0].pnl > grid52.rows.find((r) => r.movePct === -20).cells[atExpiry52].pnl);
  for (const axis of SENS_AXES.map((a) => a.key)) {
    check(`محور «${axis}» جدول می‌سازد`, sensitivityGrid({ ...base52, axis }).rows.length > 0);
  }
  check('محور ناشناخته به روز مانده برمی‌گردد', sensitivityGrid({ ...base52, axis: 'چیزی' }).axis === 'days');

  // ——— محورِ خودساخته: هر جنس، قاعده خودش ———
  //
  // یک قاعدهٔ واحد برای هر سه محور، برای دوتاشان بی‌معنی می‌شود: بازهٔ نسبی
  // روی نرخِ صفر هیچ‌چیز نمی‌سازد، و بازهٔ مطلق روی تلاطم، ۱۵٪ و ۹۰٪ را
  // یک‌جور نمی‌بیند.
  const days52 = sensitivityAxis({ axis: 'days', days: 60, steps: 5 });
  check('محور روز، از روز مانده تا صفر می‌رود و نزولی است',
    days52[0] === 60 && days52.at(-1) === 0 && days52.every((v, i) => i === 0 || days52[i - 1] >= v),
    days52.join(' '));
  const sig52 = sensitivityAxis({ axis: 'sigma', sigma: 0.4, range: 50, steps: 5 });
  check('محور تلاطم نسبی است و مبنا دقیقاً وسط می‌افتد',
    sig52.length === 5 && near(sig52[2], 0.4) && near(sig52[0], 0.2) && near(sig52[4], 0.6),
    sig52.map((v) => v.toFixed(2)).join(' '));
  const smallSig52 = sensitivityAxis({ axis: 'sigma', sigma: 0.15, range: 50, steps: 5 });
  check('همان دامنه روی تلاطم کوچک، بازهٔ کوچک می‌دهد — نه بازهٔ ثابت',
    near(smallSig52[0], 0.075) && near(smallSig52[4], 0.225),
    smallSig52.map((v) => v.toFixed(3)).join(' '));
  const rate52 = sensitivityAxis({ axis: 'rFree', rFree: 0.25, range: 5, steps: 5 });
  check('محور نرخ مطلق است، بر حسب واحد درصد',
    near(rate52[0], 0.20) && near(rate52[2], 0.25) && near(rate52[4], 0.30),
    rate52.map((v) => v.toFixed(3)).join(' '));
  // ضریب نسبی روی صفر، پنج‌بار صفر می‌داد؛ بازهٔ مطلق هنوز معنی دارد.
  const zero52 = sensitivityAxis({ axis: 'rFree', rFree: 0, range: 4, steps: 5 });
  check('نرخ صفر هم بازه می‌سازد، ولی نرخ منفی نمی‌سازد',
    zero52.length === 5 && zero52.every((v) => v >= 0) && near(zero52.at(-1), 0.04),
    zero52.map((v) => v.toFixed(3)).join(' '));
  check('تعداد ستون فرد می‌شود تا مبنا وسط بماند',
    sensitivityAxis({ axis: 'sigma', sigma: 0.4, range: 50, steps: 4 }).length === 5);
  check('بی‌تلاطم، محور تلاطم ساخته نمی‌شود — نه صفرِ ساختگی',
    sensitivityAxis({ axis: 'sigma', sigma: 0, range: 50, steps: 5 }).length === 0);
  // جنس مقدار در موتور است، قالبش در رابط — چون هر عددی که به کاربر نشان
  // داده می‌شود باید از `ui/fmt.mjs` رد شود و با رقم فارسی چاپ شود. برچسبِ
  // آمادهٔ موتور، یک مسیر دوم بود که از همان قاعده فرار می‌کرد.
  check('هر محور جنس خودش را اعلام می‌کند',
    SENS_AXES.every((a) => ['days', 'ratio', 'rate'].includes(a.kind))
    && SENS_AXES.map((a) => a.kind).join() === 'days,ratio,rate,rate');
  check('موتور برچسبِ آماده نمی‌سازد؛ قالب‌بندی کار رابط است',
    !readSrc('../core/scenario.mjs').includes('روز`'));

  // ——— فرض‌های ثابت، هم‌زمان با محور ———
  //
  // پیش از این فقط یک فرض هم‌زمان عوض می‌شد: بقیه از ردیف می‌آمدند و راهی
  // برای دست‌کاری‌شان نبود. «اگر فرض‌ها عوض شوند» با یک فرضِ متغیر، نصف
  // سؤال است.
  const hiVol52 = sensitivityGrid({ ...base52, sigma: 0.8, axis: 'rFree', moves: [0], steps: 3, range: 5 });
  const loVol52 = sensitivityGrid({ ...base52, sigma: 0.2, axis: 'rFree', moves: [0], steps: 3, range: 5 });
  check('تلاطمِ دستی روی محور نرخ هم اثر می‌گذارد',
    hiVol52.rows[0].cells.every((c) => near(c.sigma, 0.8))
    && loVol52.rows[0].cells.every((c) => near(c.sigma, 0.2))
    && !near(hiVol52.rows[0].cells[1].pnl, loVol52.rows[0].cells[1].pnl));
  check('فرض‌های مبنا در خروجی گزارش می‌شوند',
    near(hiVol52.base.sigma, 0.8) && near(hiVol52.base.rFree, 0.25) && hiVol52.base.days === 60);
  const divGrid52 = sensitivityGrid({ ...base52, axis: 'divYield', moves: [0], steps: 3, range: 4 });
  check('محور بازده نقدی، مقدار خودش را به خانه می‌رساند',
    divGrid52.rows[0].cells.every((c, i) => near(c.divYield, divGrid52.axisValues[i])));

  // ——— سنجه‌های هر خانه ———
  const mid52 = sensitivityGrid({ ...base52, axis: 'days', moves: [0], steps: 3, capital: 5000 }).rows[0];
  const live52 = mid52.cells[0];
  const exp52 = mid52.cells.at(-1);
  check('هر سنجه، در هر خانه هست', SENS_METRICS.every((m) => m.key in live52));
  check('بازده ٪ سرمایه، همان سود تقسیم بر سرمایه است',
    near(live52.retPct, (live52.pnl / 5000) * 100));
  check('بی‌سرمایه، درصد ساخته نمی‌شود',
    !Number.isFinite(sensitivityGrid({ ...base52, axis: 'days', moves: [0], steps: 3 }).rows[0].cells[0].retPct));
  // ارزش موقعیت خاطرهٔ قیمت ورود ندارد؛ سود و زیان دارد. تفاضلشان باید
  // دقیقاً همان نقد ورود باشد، وگرنه یکی از دو عدد از جای دیگری می‌آید.
  check('ارزش موقعیت و سود و زیان با نقد ورود می‌خوانند',
    near(live52.pnl - live52.value, net52) && near(exp52.pnl - exp52.value, net52),
    `${Math.round(live52.pnl)} − ${Math.round(live52.value)} = ${Math.round(net52)}`);
  // اسپرد صعودی کال: دلتای مثبت، وگای کوچک، و همه پیش از سررسید معلوم
  check('یونانی‌های موقعیت پیش از سررسید معلوم‌اند',
    ['delta', 'gamma', 'vega', 'theta', 'rho'].every((k) => Number.isFinite(live52[k]))
    && live52.delta > 0, `دلتا ${live52.delta.toFixed(1)}`);
  // دلتای سررسید سر قیمت اعمال اصلاً تعریف ندارد؛ «صفر» ادعایی است که مدل
  // نمی‌کند و کاربر آن را با «خنثی شده» اشتباه می‌گیرد.
  check('سر سررسید، یونانی خالی است نه صفر',
    exp52.atExpiry && ['delta', 'gamma', 'vega', 'theta'].every((k) => !Number.isFinite(exp52[k])));
  // یونانی موقعیت باید با حجم مقیاس بخورد، مثل هر عدد دیگر موقعیت
  const big52 = legs52.map((l) => ({ ...l, ratio: l.ratio * 10 }));
  const bigCell52 = sensitivityGrid({ ...base52, legs: big52, axis: 'days', moves: [0], steps: 3 }).rows[0].cells[0];
  check('سنجه‌های خانه با اندازهٔ موقعیت مقیاس می‌خورند',
    ['pnl', 'value', 'delta', 'gamma', 'vega', 'theta'].every(
      (k) => near(bigCell52[k], live52[k] * 10, Math.abs(live52[k] * 10) * 1e-9 + 1e-9)));

  // ——— ریسک عمق دفتر ———  // ——— ریسک عمق دفتر ———
  const books52 = [
    { book: [{ bid: 7.9, bidQty: 2, ask: 8.1, askQty: 5 }, { bid: 7.5, bidQty: 10, ask: 8.6, askQty: 9 }] },
    { book: [{ bid: 2.8, bidQty: 1, ask: 3.2, askQty: 2 }, { bid: 2.4, bidQty: 4, ask: 3.9, askQty: 20 }] },
  ];
  const d52 = bookDepthRisk({ legs: legs52, quotes: books52, units: 5 });
  // بستن یعنی جهت معکوس: پای خرید به تقاضا می‌خورد، پای فروش به عرضه
  check('جهت بستن، معکوس جهت باز کردن است',
    d52.perLeg[0].closeSide === 'sell' && d52.perLeg[1].closeSide === 'buy');
  // پای خرید: ۲ در ۷٫۹ و ۳ در ۷٫۵ → میانگین وزنی ۷٫۶۶ ، هزینه ۱٬۲۰۰
  check('میانگین وزنی از پیمایش دفتر می‌آید', near(d52.perLeg[0].vwap, 7.66));
  check('هزینه بستن هر پا، اختلاف با بهترین مظنه است',
    near(d52.perLeg[0].exitCost, 1200) && near(d52.perLeg[1].exitCost, 2100));
  check('هزینه بستن کل، جمع پاهاست', near(d52.exitCostTotal, 3300));
  check('بدترین لغزش، بزرگ‌ترین قدرمطلق است', near(d52.worstSlipPct, 13.125), d52.worstSlipPct);
  // دفتر سفارش سهم در دیده‌بان اختیار نیست؛ «نامعلوم» با «صفر» یکی نیست
  const withStock52 = bookDepthRisk({
    legs: [...legs52, { kind: 'underlying', side: 'buy', price: 100, ratio: 1, size: 1000 }],
    quotes: [...books52, {}], units: 5 });
  check('پای دارایی پایه اصلاً وارد سنجش عمق نمی‌شود', withStock52.perLeg.length === 2);
  const noBook52 = bookDepthRisk({ legs: legs52, quotes: [{}, {}], units: 5 });
  check('پای بی‌دفتر، «نامعلوم» است نه «صفر»',
    noBook52.unknownLegs === 2 && !Number.isFinite(noBook52.exitCostTotal));
  const thin52 = bookDepthRisk({ legs: legs52, quotes: [
    { book: [{ bid: 7.9, bidQty: 1, ask: 8.1, askQty: 1 }] }, books52[1]], units: 5 });
  check('پای کم‌عمق، کسری و قفل‌بودن را گزارش می‌کند',
    thin52.blockedLegs === 1 && thin52.perLeg[0].short === 4 && thin52.closableUnits === 1,
    `کسری ${thin52.perLeg[0].short} | واحد ${thin52.closableUnits}`);

  // ——— پاهایی که خودشان مقیاس‌خورده‌اند ———
  //
  // ردیف غربال پاهایش را در تعداد قرارداد کاربر ضرب کرده تحویل می‌دهد، تا
  // نمودار و نقد خالص یک مقیاس داشته باشند. بدون `legUnits`، «تعداد واحد»
  // دوباره در همان حجم ضرب می‌شد: ۵ قرارداد از پاهای ۵تایی یعنی ۲۵ —
  // عمقی که دفتر ندارد و هر ردیف را «قفل» نشان می‌داد.
  const scaled52 = legs52.map((l) => ({ ...l, ratio: l.ratio * 5 }));
  const scaledD52 = bookDepthRisk({ legs: scaled52, quotes: books52, units: 5, legUnits: 5 });
  check('پای مقیاس‌خورده، حجم را دوبار حساب نمی‌کند',
    scaledD52.perLeg.every((l, i) => near(l.want, d52.perLeg[i].want))
    && near(scaledD52.exitCostTotal, d52.exitCostTotal),
    `${scaledD52.perLeg[0].want} خواسته`);
  check('بدون اعلامِ مقیاس، پیش‌فرض همان «یک واحد» می‌ماند',
    near(bookDepthRisk({ legs: legs52, quotes: books52, units: 5 }).exitCostTotal, d52.exitCostTotal));

  const panelSrc52 = readSrc('../ui/scenario-panel.mjs');
  check('پنل هیچ محاسبه‌ای ندارد و همه را از موتور می‌خواند',
    panelSrc52.includes("from '/core/scenario.mjs'")
    && !/Math\.exp|bsPrice|Math\.log/.test(panelSrc52));
  check('پارامترهای حساسیت قابل تنظیم‌اند',
    ['scen-axis', 'scen-range', 'scen-steps', 'scen-units'].every((id) => panelSrc52.includes(id)));
  // خواستهٔ کاربر: «با انتخاب تلاطم امکان وارد کردن عدد آن باشه، و همچنین
  // بقیه پارامترها.» هر فرض بازار ورودی عددی خودش را دارد، سنجهٔ هر خانه
  // انتخابی است، و راه برگشت به فرض‌های بازار یک دکمه است.
  check('هر فرض بازار، ورودی عددی خودش را دارد',
    ['scen-sigma', 'scen-rfree', 'scen-div', 'scen-days', 'scen-span', 'scen-cols']
      .every((id) => panelSrc52.includes(id)));
  check('سنجهٔ هر خانه انتخابی است و از موتور می‌آید',
    panelSrc52.includes('scen-metric') && panelSrc52.includes('SENS_METRICS'));
  check('محورها از موتور می‌آیند، نه فهرست دستیِ دوم در رابط',
    panelSrc52.includes('SENS_AXES') && !/'rFree'\]\.includes/.test(panelSrc52));
  check('راه برگشت به فرض‌های بازار هست', panelSrc52.includes('scen-reset'));
  check('پنل، مقیاسِ پاهای ردیف را به سنجش عمق اعلام می‌کند',
    panelSrc52.includes('legUnits:'));
  // سرستون محور، رقمِ لاتین چاپ می‌کرد («0.85») چون از رشتهٔ خام موتور
  // می‌آمد و از `fmt` رد نمی‌شد.
  check('سرستون محور دوم از قالب‌بند فارسی رد می‌شود',
    /kind === 'days' \? `\$\{fmt\.int/.test(panelSrc52) && panelSrc52.includes('esc(axisLabel(axis, v))'));
  // پله فرد لازم است تا «بدون تغییر» همیشه وسط جدول بیفتد
  check('تعداد پله فرد می‌شود تا صفر وسط بماند', panelSrc52.includes('if (steps % 2 === 0) steps += 1;'));
}
