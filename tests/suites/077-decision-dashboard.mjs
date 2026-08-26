// ۷۶. نماهای سه حالت و سنجه‌های ساختاری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { moneynessPct } from '../../core/bereket-anon.mjs';
import { maxPain, strikeLadder, termStructure } from '../../core/decision-dashboard.mjs';



// ═════════ ۷۶. بازبینی نماهای سه حالت و سنجه‌های ساختاری ═════════
//
// خواسته کاربر: «منطق نبض و جهت بازار / نقدینگی و سررسید / تلاطم و انتظارات
// را دوباره بررسی کن و همچنین تب‌های ۲۰گانه… لازم نیست ۲۰ تب هر یک از این
// سه شبیه هم باشد، بعضی اطلاعات مناسبی نمی‌دهد… نمودارهای مختلف و متنوع
// دیگری نیز بساز.»
//
// ریشهٔ شباهت، همان سورت‌پذیر شدن جدول‌ها بود: «رهبران ارزش» و «رهبران حجم»
// وقتی جدول خام بودند دو نمای واقعی بودند؛ حالا یک جدول‌اند با دو
// مرتب‌سازی. پس تکراری‌ها رفتند و جایشان سنجه‌هایی نشست که از **ساختار**
// زنجیره می‌آیند، نه از رتبه‌بندی یک ستون.
group('۷۶. نماهای سه حالت و سنجه‌های ساختاری');
{
  const L = (over) => ({ ins: 'x', name: 'ض', kind: 'call', uaIns: '9', uaName: 'نمونه',
    endDate: 20260101, days: 30, spot: 1000, strike: 1000, last: 100,
    oi: 0, volume: 0, value: 0, ivPct: NaN, ...over });

  // ——— نردبان اعمال ———
  const ladder = strikeLadder([
    L({ strike: 900, oi: 100, volume: 10 }),
    L({ strike: 900, kind: 'put', oi: 40, volume: 4 }),
    L({ strike: 1100, kind: 'put', oi: 300, volume: 30 }),
  ]);
  check('نردبان، یک گروه به‌ازای هر پایه:سررسید می‌سازد و پله‌ها را مرتب می‌کند',
    ladder.length === 1 && ladder[0].rungs.map((r) => r.strike).join(',') === '900,1100');
  check('هر پله، کال و پوت را جدا نگه می‌دارد و نسبتشان را می‌دهد',
    ladder[0].rungs[0].callOi === 100 && ladder[0].rungs[0].putOi === 40
    && near(ladder[0].rungs[0].putCallOi, 0.4) && ladder[0].rungs[0].oi === 140);
  // پله بدون کال، نسبت پوت به کال ندارد — تقسیم بر صفر عدد نمی‌سازد
  check('پله بدون کال، نسبت نامعلوم می‌دهد نه بی‌نهایت',
    Number.isNaN(ladder[0].rungs[1].putCallOi));
  check('فاصله هر پله از قیمت جاری هم ثبت می‌شود',
    near(ladder[0].rungs[0].moneynessPct, -10) && near(ladder[0].rungs[1].moneynessPct, 10));

  // ——— بیشترین درد ———
  // اعمال ۹۰۰ با ۱۰۰ کال، اعمال ۱۱۰۰ با ۳۰۰ پوت:
  //   تسویه در ۹۰۰  → پوت‌ها ۲۰۰ در سود × ۳۰۰ = ۶۰٬۰۰۰
  //   تسویه در ۱۱۰۰ → کال‌ها ۲۰۰ در سود × ۱۰۰ = ۲۰٬۰۰۰   ← کمینه
  const pain = maxPain(strikeLadder([
    L({ strike: 900, oi: 100 }), L({ strike: 1100, kind: 'put', oi: 300 }),
  ]));
  check('بیشترین درد، کمینه ارزش ذاتی تعهد باز را پیدا می‌کند',
    pain[0].maxPain === 1100 && near(pain[0].maxPainGapPct, 10), `${pain[0].maxPain}`);
  check('و منحنی درد روی همان اعمال‌های واقعی ساخته می‌شود، نه شبکه ساختگی',
    pain[0].curve.length === 2 && pain[0].curve.map((c) => c.pain).join(',') === '60000,20000');
  check('با کمتر از دو پله تعهددار، بیشترین درد ساخته نمی‌شود',
    Number.isNaN(maxPain(strikeLadder([L({ strike: 900, oi: 100 })]))[0].maxPain));

  // ——— ساختار زمانی و چولگی ———
  const term = termStructure([
    L({ endDate: 20260101, days: 30, ivPct: 60, value: 100 }),
    L({ endDate: 20260101, days: 30, kind: 'put', ivPct: 70, value: 100 }),
    L({ endDate: 20260201, days: 60, ivPct: 40, value: 100 }),
    L({ endDate: 20260201, days: 60, kind: 'put', ivPct: 44, value: 100 }),
  ]);
  check('ساختار زمانی به‌ترتیب روز مانده مرتب می‌شود', term.map((r) => r.days).join(',') === '30,60');
  check('تلاطم هر سررسید با وزن ارزش ساخته می‌شود', near(term[0].ivPct, 65) && near(term[1].ivPct, 42));
  check('چولگی، پوت منهای کال است', near(term[0].skewPp, 10) && near(term[1].skewPp, 4));
  // قراردادی که امروز معامله نشده نباید ساختار امروز را جابه‌جا کند
  check('قرارداد بی‌گردش وارد ساختار زمانی نمی‌شود',
    termStructure([L({ ivPct: 90, value: 0 })]).length === 0);

  // ——— بازبینی نماها ———
  const ui76 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const viewsOf = (name) => [...(new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(ui76)?.[1] || '')
    .matchAll(/\['([^']+)', '[^']*', '([^']+)', '([^']+)', '([^']+)'\]/g)]
    .map((m) => ({ id: m[1], kind: m[2], source: m[3], metric: m[4] }));
  const lists = { pulseViews: viewsOf('pulseViews'), liquidityViews: viewsOf('liquidityViews'), volatilityViews: viewsOf('volatilityViews') };
  for (const [name, views] of Object.entries(lists)) {
    check(`${name} هنوز بیست نما دارد`, views.length === 20, `${views.length}`);
    // دو نما با یک شکل و یک منبع و یک سنجه، یک نما هستند — و چون جدول‌ها
    // خودشان سورت‌پذیرند، «جدول X» و «میله X» هم دیگر تفاوت واقعی نیستند.
    const signatures = views.map((view) => `${view.kind}|${view.source}|${view.metric}`);
    const duplicated = signatures.filter((sig, index) => signatures.indexOf(sig) !== index);
    check(`${name} نمای تکراری ندارد`, duplicated.length === 0, [...new Set(duplicated)].join('، '));
  }
  // تنوع شکل: هر حالت باید بیش از یک شکل نمودار داشته باشد، وگرنه همان
  // «بیست تب شبیه هم» است.
  for (const [name, views] of Object.entries(lists)) {
    check(`${name} از چند شکل نمودار استفاده می‌کند`,
      new Set(views.map((v) => v.kind)).size >= 5, [...new Set(views.map((v) => v.kind))].join('، '));
  }
  // و شکل‌های تازه واقعاً پیاده شده‌اند
  check('شکل‌های تازه ساخته شده‌اند: گرمانما، نردبان، منحنی درد، هیستوگرام، پراکنش',
    ['function heatmap(', 'function ladderChart(', 'function painCurve(', 'function histogram(', 'function scatterChart(']
      .every((needle) => ui76.includes(needle)));
  check('و هر سه حالت به سنجه‌های ساختاری وصل شده‌اند',
    ui76.includes("'max-pain'") && ui76.includes("'strike-ladder'")
    && ui76.includes("'iv-term'") && ui76.includes("'iv-skew'")
    && ui76.includes("'liquidity-heatmap'") && ui76.includes("'iv-heatmap'"));
  // گرمانما دو بُعد دسته‌ای دارد؛ رنگش باید طیف تک‌فام باشد نه رنگین‌کمان
  check('گرمانما طیف تک‌فام دارد، نه رنگین‌کمان',
    ui76.includes('color-mix(in srgb, var(--series-1)') && !/heatRainbow|hsl\(/.test(ui76));
}
