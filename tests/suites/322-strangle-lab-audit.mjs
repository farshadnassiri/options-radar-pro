// ۳۲۲. «استرانگل بازی» — اصلاح‌های گزارش آزمون ۸۳e5888 (۱۴۰۵/۰۷/۱۳)
//
//   الف  ردیف بی‌معامله، تسویهٔ سررسید، نقدشوندگی و برابرها (موردهای ۵، ۱۱، ۲۲)
//   ب    اکسل بی‌نگاه به آینده (مورد ۱۶)
//   ج    سیم‌کشی رابط: نام تب، میان‌بر Enter، نمرهٔ کهنه، نمودار بی رنگ، حد ضرر
//
// قیمت انتخابی (مورد ۱۰) و حد ضرر اجباری (مورد ۱۴) در دستهٔ ۳۲۱ کنار همان
// موضوع‌اند.

import { check, group, near, readSrc } from '../harness.mjs';
import { historyDateLabel } from '../../core/history.mjs';
import { lineChart } from '../../ui/strangle-lab-view.mjs';
import { buildStrangleWorkbook } from '../../ui/strangle-lab-export.mjs';
import {
  labConfig, buildLabMarket, pricingContext, priceAt, openPosition, runPath, planDecider, tradePrice,
  liquidityNotes, compareFinals,
} from '../../core/strangle-lab.mjs';
import { EXPIRY, fixture, FEES, UP } from '../strangle-fixture.mjs';

// گزارش آزمون ۸۳e5888، موردهای ۵ و ۱۱: قیمت ردیفِ بی‌معامله قیمت معتبر روز
// شمرده می‌شد، و روز سررسید پایانیِ ۱ بر ارزش ذاتیِ صفر مقدم بود.
group('۳۲۲-الف. ردیف بی‌معامله، تسویهٔ سررسید، نقدشوندگی');
{
  const { rows, dailies, dates } = fixture(UP);
  const d2 = structuredClone(dailies);
  Object.assign(d2.P900.rows[2], { vol: 0, trades: 0 });
  const market = buildLabMarket({ rows, dailies: d2, uaIns: 'UA', expiry: EXPIRY, from: dates[0], to: dates.at(-1), size: 1000 });
  check('ردیف با حجم و شمار معاملهٔ صفر، قیمت معتبر روز نیست', !(900 in market.days[2].put) && market.days[2].stale.put[900] > 0);
  check('پوشش معامله از پوشش ردیف جداست', market.coverage.stale === 1 && market.coverage.pct < market.coverage.recordPct);
  const ctx = pricingContext(market, { r: 0.3 });
  check('بی فرض صریح: «نداشته»', priceAt(ctx, 2, 'put', 900) === null && tradePrice(ctx, 2, 'put', 900, 'high') === null);
  const use = pricingContext(market, { r: 0.3, useStale: true });
  check('با فرض صریح: همان قیمت با برچسب «بی‌معامله»', priceAt(use, 2, 'put', 900)?.src === 'stale');
  const open = openPosition(ctx, labConfig(), { call: 1200, put: 900 }, 2, FEES);
  check('ورود با قیمت ردیف بی‌معامله رد می‌شود، با علت', !open.state && /معامله نشد/.test(open.error), open.error);
  check('قیمت انتخابی هم در روز بی‌معامله سنجیدنی نیست', tradePrice(ctx, 2, 'put', 900, 'manual', market.days[2].stale.put[900]) === null);
  check('ردیفی که میدان حجم ندارد بی‌معامله شمرده نمی‌شود', fixture(UP).market.coverage.stale === 0);

  // مورد ۲۲: حجم بیش از کل معاملهٔ همان روز.
  const legs0 = { call: { strike: 1200 }, put: { strike: 900 } };
  const v1200 = market.days[0].raw.call[1200].vol;
  check('حجم کمتر از معاملهٔ روز: بی هشدار', liquidityNotes(ctx, labConfig({ qty: 1 }), legs0, 0).length === 0);
  const big = liquidityNotes(ctx, labConfig({ qty: 1000 }), legs0, 0);
  check('حجم ۱۰۰۰ در بازار کم‌معامله: هشدار برای هر دو پا با حجم واقعی روز', big.length === 2 && big.find((x) => x.side === 'call').vol === v1200);
  check('روز بی‌معامله: حجم صفر شمرده می‌شود', liquidityNotes(ctx, labConfig({ qty: 1 }), legs0, 2).some((x) => x.side === 'put' && x.vol === 0));
  // مورد ۵: مسیرهای برابر جدا شمرده می‌شوند.
  const cf = compareFinals([{ final: 1 }, { final: 5 }, { final: 5 }, { final: 9 }, { final: NaN }], 5);
  check('مقایسهٔ نتیجه‌ها: بدتر، برابر و بهتر جدا', cf.worse === 1 && cf.equal === 2 && cf.better === 1 && cf.known === 4);

  // روز سررسید: پایانیِ مثبتِ قرارداد بی‌ارزش جای ارزش ذاتی نمی‌نشیند.
  const path = Array.from({ length: 24 }, (_, i) => 1000 + i * 2);
  const fx = fixture(path);
  const last = fx.market.days.length - 1;
  check('روز آخر همان روز سررسید است', fx.market.days[last].dte === 0);
  const d3 = structuredClone(fx.dailies);
  d3.C1200.rows[last] = { ...d3.C1200.rows[last], close: 1, low: 1, high: 1, first: 1, vol: 5, trades: 1 };
  const mk = buildLabMarket({ rows: fx.rows, dailies: d3, uaIns: 'UA', expiry: EXPIRY, from: fx.dates[0], to: fx.dates.at(-1), size: 1000 });
  const c3 = pricingContext(mk, { r: 0.3 });
  const q = priceAt(c3, last, 'call', 1200);
  check('سررسید: ارزش ذاتی صفر، نه پایانیِ ۱', q.src === 'intrinsic' && q.price === 0);
  const run = runPath(c3, labConfig(), { call: 1200, put: 900 }, { decide: planDecider({}, 'hold'), fees: FEES });
  const tc = run.state.trades.find((t) => t.side === 'call');
  check('تسویهٔ سررسید بی کارمزد خروج برای پای بی‌ارزش', run.state.reason === 'expiry' && tc.closePrice === 0 && tc.closeFee === 0 && tc.closeSrc === 'intrinsic');
}

group('۳۲۲-ب. اکسل بی‌نگاه به آینده');
{
  const { market } = fixture(UP);
  const ctx = pricingContext(market, { r: 0.3 });
  const cfg = labConfig({ qty: 3 });
  const entry = { call: 1200, put: 900 };
  // گزارش آزمون ۸۳e5888 مورد ۱۶: نشانگر روی روز ۵ و «نمایش آینده» خاموش، ولی
  // برگ «قیمت قراردادها» همهٔ روزها تا سررسید را داشت.
  const mid = runPath(ctx, cfg, entry, { decide: planDecider({}, 'algo'), fees: FEES, upTo: 5 });
  const chainOf = (book) => book.filter((sh) => sh.name.startsWith('قیمت قراردادها')).flatMap((sh) => sh.rows);
  const hidden = chainOf(buildStrangleWorkbook({ ctx, cfg, exp: { name: 'آزمون' }, run: mid, fees: FEES }));
  const dayLabel = (i) => historyDateLabel(market.days[i].date);
  check('اکسل میانهٔ آزمایش: هیچ قیمتی پس از روز جاری', hidden.length > 0 && hidden.every((r) => r[0] <= dayLabel(5))
    && hidden.some((r) => r[0] === dayLabel(5)) && !hidden.some((r) => r[0] === dayLabel(6)));
  const shown = chainOf(buildStrangleWorkbook({ ctx, cfg, exp: { name: 'آزمون', reveal: true }, run: mid, fees: FEES }));
  check('… فقط با «نمایش آینده» همهٔ روزها', shown.some((r) => r[0] === dayLabel(market.days.length - 1)));
  const midHead = buildStrangleWorkbook({ ctx, cfg, exp: { name: 'آزمون' }, run: mid, fees: FEES }).find((sh) => sh.name === 'مشخصات');
  check('مشخصات فایل حد تاریخ و وضعیت نمایش آینده را می‌گوید', midHead.rows.some((r) => r[0] === 'قیمت‌های این فایل تا تاریخ' && r[1] === dayLabel(5))
    && midHead.rows.some((r) => r[0] === 'نمایش آینده' && /خاموش/.test(r[1])));
}

group('۳۲۲-ج. سیم‌کشی رابط');
{
  const app = readSrc('../ui/app.mjs');
  const tab = readSrc('../ui/tabs/strangle-lab.mjs');
  check('نام تب «استرانگل بازی» است', /id: 'strangle-lab', title: 'استرانگل بازی'/.test(app) && tab.includes('<h2>🧪 استرانگل بازی</h2>'));
  // گزارش آزمون ۸۳e5888 مورد ۲۰: Enter روی کنترل نامرتبط تصمیم روز را ثبت می‌کرد.
  const onKey = tab.slice(tab.indexOf('function onKey'), tab.indexOf('function onKey') + 400);
  const inter = (tab.match(/const INTERACTIVE = '([^']+)'/) || [])[1] || '';
  check('میان‌بر Enter روی دکمه، تب و هر کنترل دیگری کار نمی‌کند', /closest\(INTERACTIVE\)/.test(onKey)
    && ['button', '[role]', 'input', 'select', '[data-act]', '[tabindex]'].every((k) => inter.includes(k)), inter);
  check('نمرهٔ ذخیره‌شده فقط با همان تصمیم‌ها نشان داده می‌شود', /x\.grade && x\.gradeKey === gradeKeyOf\(x\)/.test(tab) && /exp\.gradeKey !== gradeKeyOf\(exp\)/.test(tab));
  check('متن کارنامه از مقایسهٔ واقعی ساخته می‌شود، نه ادعای ثابت', !tab.includes('هر تعدیل یا بستن زودتر بخشی از این افول را از دست می‌داد') && tab.includes('compareFinals(g?.paths'));
  // گزارش آزمون ۸۳e5888 مورد ۱۹: خط‌های اعمال کال و پوت یک الگو داشتند.
  const css = readSrc('../ui/style.css');
  const dash = (cls) => (css.match(new RegExp(`\\.sl-line\\.${cls} \\{[^}]*stroke-dasharray: ([^;]+);`)) || [])[1];
  const pats = ['spot', 'callk', 'putk', 'becall', 'beput'].map(dash);
  check('پنج خط نمودار قیمت پنج الگوی خط متفاوت دارند', pats.every(Boolean) && new Set(pats).size === 5, pats.join(' | '));
  const tagged = lineChart({ id: 't', dates: [1, 2, 3], series: [{ key: 'a', label: 'پایه', cls: 'spot', values: [1, 2, 3], tag: true }, { key: 'b', label: 'ب', cls: 'callk', values: [3, 2, 1], tag: 'اعمال کال' }] });
  check('نام هر خط سر خودش نوشته می‌شود', (tagged.match(/class="sl-end-label/g) || []).length === 2 && tagged.includes('>اعمال کال<'));
  check('حد ضرر اجباری کارت‌های دیگر را قفل می‌کند و علت را می‌گوید', /forced && o\.action\.kind !== 'close'/.test(tab) && tab.includes('حد ضرر اجباری است (۵.۲)'));
}
