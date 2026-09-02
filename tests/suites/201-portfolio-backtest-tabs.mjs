// ۲۰۱. صفحهٔ تب‌بندی‌شدهٔ آزمون همه استراتژی‌ها

import { check, group, readSrc } from '../harness.mjs';

const tab201 = readSrc('../ui/tabs/portfolio-backtest.mjs');
const host201 = readSrc('../ui/chart-host.mjs');
const style201 = readSrc('../ui/style.css');

group('۲۰۱. صفحهٔ تب‌بندی‌شدهٔ آزمون همه استراتژی‌ها');
{
  // ── نه پنل، هر کدام یک موضوع ────────────────────────────────────────
  const panels201 = ['setup', 'overview', 'ranking', 'heatmap', 'trend', 'metrics', 'distribution', 'drill', 'basket'];
  for (const id of panels201) {
    check(`پنل «${id}» در قالب هست`, tab201.includes(`data-panel="${id}"`), id);
  }
  check('نوار تب از کمک‌تابع مشترک ساخته می‌شود، نه از نو',
    tab201.includes("mountSubtabs($('pb-tabs'), PB_TABS,"));
  check('همهٔ پنل‌ها جز راه‌اندازی، پیش از اجرا پنهان‌اند',
    panels201.filter((id) => id !== 'setup')
      .every((id) => tab201.includes(`data-panel="${id}" hidden`)));

  // ── عدسی مشترک ──────────────────────────────────────────────────────
  check('چهار انتخاب عدسی در قالب‌اند',
    ['pb-basis', 'pb-stat', 'pb-weighting', 'pb-from', 'pb-to'].every((id) => tab201.includes(`id="${id}"`)));
  check('هر تغییر عدسی فقط بازساخت است، نه اجرای دوباره',
    tab201.includes('const relens = (patch) => { lens = { ...lens, ...patch }; recompute(); };')
    && !/relens[\s\S]{0,200}runAll\(/.test(tab201));
  // ادعا روی **قصد** است نه روی یک رشتهٔ دقیق: ماتریسِ همان اجرا مبنا
  // بماند و هیچ بازپخشی راه نیفتد. رشتهٔ دقیق سه بار با جابه‌جا شدن کد
  // شکست، در حالی که قصد هر بار سرِ جایش بود — و یک بار هم پالایه که
  // ماتریس را می‌بُرد، بی‌آنکه چیزی خراب شده باشد.
  const recompute201 = tab201.slice(tab201.indexOf('function recompute()'));
  check('بازساخت از همان ماتریسِ اجرا می‌آید و بازپخش تازه نمی‌کند',
    tab201.includes('analysis = analyzePortfolio({')
    && recompute201.slice(0, 900).includes('payloadMatrix')
    && !/function recompute\(\)[\s\S]{0,900}replayHistory\(/.test(tab201));
  check('و ردیف‌ها و ماتریس با هم می‌آیند — برشِ نامتقارن، مسیر هر ردیف را جابه‌جا می‌کند',
    recompute201.slice(0, 900).includes('selectMatrixRows(payloadMatrix, comboFilter.indexes)'));
  check('عدسی در تب راه‌اندازی پنهان می‌شود',
    tab201.includes("$('pb-lens').hidden = id === 'setup';"));

  // ── نمودار فقط وقتی دیده می‌شود رسم می‌شود ─────────────────────────
  check('پنل دیده‌نشده رسم نمی‌شود',
    tab201.includes('if (!analysis || !dirty.has(id))') && tab201.includes("dirty.add('heatmap')"));
  check('ظرف نمودار ارتفاع صریح دارد تا بوم صفر نشود',
    style201.includes('.pb-chart { width: 100%; min-width: 0; height: 320px; }'));

  // ── نقصی که فقط مرورگر پیدایش کرد ──────────────────────────────────
  // ورود مستقیم به تب کاوش، جدول ترکیب‌ها را خالی می‌گذاشت: هیچ استراتژی
  // انتخاب نشده بود و عنوان دعوت‌کننده، خالی‌بودن را طبیعی نشان می‌داد.
  check('ورود مستقیم به کاوش، بهترین استراتژی را انتخاب می‌کند',
    tab201.includes('const fallback = analysis.strategies.find((row) => row.strategyId === selectedStrategyId)')
    && tab201.includes('analysis.best?.strategyId')
    && tab201.includes('if (fallback) selectStrategy(fallback, { jump: false });'));

  // ── نتیجهٔ کهنه کنار انتخاب تازه نمی‌ماند ──────────────────────────
  check('عوض‌کردن نماد یا دامنه، گزارش قبلی را پاک می‌کند',
    tab201.includes('function hideReport()')
    && tab201.includes('charts.disposeAll();')
    && (tab201.match(/hideReport\(\)/g) || []).length >= 4);
  check('نمودارها با ترک تب آزاد می‌شوند',
    tab201.includes('activeWorker?.terminate();') && /return \(\) => \{[\s\S]{0,120}charts\.disposeAll\(\);/.test(tab201));

  // ── میزبان نمودار ───────────────────────────────────────────────────
  check('ماژول نمودار محلی است، نه از شبکهٔ توزیع محتوا',
    host201.includes("import('/vendor/echarts/echarts.esm.min.js')")
    && !/https?:\/\//.test(host201.replace(/^\s*\/\/.*$/gm, '')));
  check('رنگ نمودار از توکن همان صفحه خوانده می‌شود',
    host201.includes("cssVar(style, '--gain')") && host201.includes('getComputedStyle(document.body)'));
  check('هیچ رنگ سخت‌کدشده‌ای در میزبان نمودار نمانده',
    !/#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/.test(host201));
  check('نبود ماژول نمودار، صفحه را از کار نمی‌اندازد',
    host201.includes('کتابخانهٔ نمودار بار نشد؛ جدول‌های همین بخش همان داده را دارند.'));
  check('سری کم‌شده روی نمودار نمی‌ماند',
    host201.includes('{ notMerge: true }'));
  check('نمودار با تغییر اندازهٔ ظرف بزرگ می‌شود',
    host201.includes('new ResizeObserver((entries) =>') && host201.includes('instance.resize();'));
  // `resize()` خودش بوم را عوض می‌کند؛ اگر ناظر روی هر شلیک کار کند، حلقه
  // بسته می‌شود و نخِ اصلی می‌ایستد.
  check('ناظر اندازه فقط روی تغییر واقعی کار می‌کند',
    host201.includes('if (width === lastWidth && height === lastHeight) return;'));
  check('ظرف پنهان اندازه‌گیری نمی‌شود',
    host201.includes('if (width < 2 || height < 2) return;')
    && host201.includes('if (box.width < 2 || box.height < 2) return;'));
  check('انیمیشن نمودارها با تعویض پنل می‌خوابد',
    host201.includes('stopAll() { for (const handle of handles.values()) handle.instance.stopAnimation?.(); }')
    && tab201.includes('charts.stopAll();'));
}

// ═══ تایم‌فریم پایین: همان ترکیب، ساعت‌به‌ساعت ═══
group('۲۰۱-ب. تایم‌فریم پایین');
{
  check('ریزمعامله فقط برای پاهای همین ترکیب و نماد پایه گرفته می‌شود',
    tab201.includes('const codes = [...new Set([String(ua.ins), ...item.legs.map((leg) => String(leg.ins))])];')
    && tab201.slice(tab201.indexOf('async function renderIntraday(')).includes('/api/trades?ins='));
  check('هر لحظهٔ جلسه یک ردیف می‌شود',
    tab201.includes('for (const [second, label] of MARK_MOMENTS)'));
  check('ساعتی که پایی قیمت نداشته، عدد جعل نمی‌کند',
    tab201.includes("rows.push({ label, ok: false, why: 'تا این ساعت هیچ پایی معامله نشده بود' })")
    && tab201.includes("rows.push({ label, ok: false, why: 'یکی از پاها تا این ساعت قیمت نداشت' })"));
  // برشِ دقیقِ همان تابع، نه پنجرهٔ نویسه‌ای: پنجره با هر خط تازه‌ای که
  // بالایش اضافه شود بی‌صدا از دست می‌رود.
  const intraday201 = tab201.slice(tab201.indexOf('async function renderIntraday('),
    tab201.indexOf('function showDetail(item) {'));
  check('بازده ساعت‌به‌ساعت روی همان مبنای عدسی حساب می‌شود',
    intraday201.includes('returnOnBasis(final.netPnl, {') && intraday201.includes('}, lens.basisId).pct,'));
  // شمار «ابزارِ افتاده» اینجا دروغِ آماری بود: ریزمعامله عمداً فقط برای
  // پاهای همین ترکیب گرفته می‌شود، پس هر ابزار دیگری «افتاده» شمرده می‌شد
  // در حالی که اصلاً پرسیده نشده بود.
  check('شمار ابزارِ افتاده گزارش نمی‌شود، چون پرسیده نشده بود',
    !tab201.includes('dropped: marked.dropped,')
    && !tab201.includes('ابزار دیگر تا این ساعت معامله نشده بود'));
  check('به‌جایش قیمت واقعی هر پا در همان ساعت نشان داده می‌شود',
    tab201.includes('exitAt: final.perLeg.map((leg) => leg.exitPrice),')
    && tab201.includes('پا با قیمت'));
  check('رنگ ردیف ساعت به عدد حساس است', intraday201.includes('heatLevel(row.pct, bound)'));
}

// ═══ عدسی جمع‌شونده ═══
group('۲۰۱-ج. عدسی جمع‌شونده');
{
  check('عدسی به‌طور پیش‌فرض جمع است',
    tab201.includes('data-open="false"') && tab201.includes('<div class="pb-lens-body" id="pb-lens-body" hidden>'));
  check('دکمهٔ باز و بسته وضعیتش را به کمک‌فناوری هم می‌گوید',
    tab201.includes('aria-expanded="false" aria-controls="pb-lens-body"')
    && tab201.includes("$('pb-lens-toggle').setAttribute('aria-expanded', String(open));"));
  // نوارِ بسته و بی‌برچسب، بدتر از نوارِ بزرگ است: جا نمی‌گیرد ولی عدد را
  // هم بی‌قید می‌کند.
  check('نوارِ بسته، مبنا و آماره و بازه را خلاصه نشان می‌دهد',
    tab201.includes('function lensSummary()')
    && tab201.includes("$('pb-lens-summary').textContent = lensSummary();"));
  check('حالت باز یا بسته میان اجراها می‌ماند',
    tab201.includes("localStorage.setItem(LENS_KEY, open ? '1' : '0')")
    && tab201.includes('setLensOpen(lensWasOpen());'));
  check('نبود حافظهٔ مرورگر صفحه را نمی‌شکند',
    /localStorage\.setItem\(LENS_KEY[\s\S]{0,80}catch/.test(tab201)
    && /localStorage\.getItem\(LENS_KEY[\s\S]{0,60}catch \{ return false; \}/.test(tab201));
  check('نوارِ جمع‌شده ارتفاع یک ردیف دارد، نه یک کارت',
    style201.includes('.pb-lens { position: sticky; top: 0; z-index: 3; padding: 0; overflow: hidden; }')
    && style201.includes('.pb-lens-toggle { display: flex;'));
}

// ═══ سرخط‌ها در نمای کل ═══
group('۲۰۱-د. سرخط‌ها در رابط');
{
  check('نوار سرخط‌ها در نمای کل هست', tab201.includes('id="pb-highlights"'));
  check('هر سرخط با واحد سنجهٔ خودش نوشته می‌شود',
    tab201.includes("meta.unit === 'pct' ? pctCell(raw)")
    && tab201.includes("meta.unit === 'money' ? fmt.money(raw)")
    && tab201.includes("meta.unit === 'int' ? fmt.int(raw)"));
  check('دلیل هر سرخط کنارش نوشته می‌شود، نه فقط در راهنمای شناور',
    tab201.includes('<small>${esc(item.hint)}</small>'));
  check('کلیک روی سرخط، همان استراتژی را انتخاب می‌کند',
    /paintHighlights[\s\S]{0,1800}\$\('pb-highlights'\)\.onclick[\s\S]{0,140}selectStrategy\(card\.dataset\.strategy\)/.test(tab201));
  check('نبود سرخط، جدول خالیِ بی‌توضیح نمی‌سازد',
    tab201.includes('سرخطی ساخته نشد؛ نتیجهٔ معتبری در این بازه نیست.'));
}

// ═══ تب کل به جزء و کارت‌های توضیح‌دار ═══
group('۲۰۱-ه. کل به جزء و توضیح ساده');
{
  const partsSrc = readSrc('../ui/portfolio-charts-parts.mjs');
  const flowSrc = readSrc('../ui/portfolio-charts-flow.mjs');

  check('تب کل به جزء در نوار هست', tab201.includes("{ id: 'parts', label: 'کل به جزء'"));
  const partsPanel = tab201.slice(tab201.indexOf('data-panel="parts"'), tab201.indexOf('data-panel="drill"'));
  const wanted201 = ['pb-funnel', 'pb-sunburst', 'pb-donut', 'pb-family-bar', 'pb-treemap',
    'pb-rose', 'pb-pareto', 'pb-graph', 'pb-corr', 'pb-tree'];
  for (const id of wanted201) check(`نمودار ${id} در تب کل به جزء هست`, partsPanel.includes(`id="${id}"`), id);
  check('سه جدول عددی کنار نمودارها هست',
    ['pb-parts-groups', 'pb-parts-pairs', 'pb-parts-pareto'].every((id) => partsPanel.includes(`id="${id}"`)));

  // نمودارِ بی‌توضیح، تصمیم نمی‌سازد. هر کارت باید بگوید چه می‌گوید.
  const hints201 = (tab201.match(/class="pb-hint"/g) || []).length;
  check('دست‌کم بیست کارت توضیح ساده دارند', hints201 >= 20, `${hints201} توضیح`);

  check('درصد سهم در راهنمای شناور می‌آید',
    partsSrc.includes('export function shareOf(') && partsSrc.includes('export const shareLine')
    && (partsSrc.match(/shareLine\(/g) || []).length >= 5);
  check('کلِ صفر یا نامعلوم، سهم نمی‌سازد',
    partsSrc.includes("if (part === null || whole === null || Math.abs(whole) < 1e-12) return null;"));

  check('هجده سازندهٔ نمودار تازه ساخته شد',
    (partsSrc.match(/^export function \w+Option\(/gm) || []).length
    + (flowSrc.match(/^export function \w+Option\(/gm) || []).length >= 17,
    String((partsSrc.match(/^export function \w+Option\(/gm) || []).length
      + (flowSrc.match(/^export function \w+Option\(/gm) || []).length));
  check('هیچ رنگ سخت‌کدشده‌ای در کتابخانهٔ نمودار نیست',
    !/#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/.test(partsSrc) && !/#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/.test(flowSrc));

  // رودخانه پهنای منفی نمی‌کشد؛ نگفتنش یعنی نصفِ ماجرا را کل ماجرا نشان دادن.
  check('رودخانه می‌گوید فقط سود مثبت را نشان می‌دهد',
    flowSrc.includes('رودخانه پهنای منفی نمی‌کشد') && tab201.includes('فقط سود مثبت وارد می‌شود'));
  check('گل رز عدد واقعی را در راهنما نگه می‌دارد، نه در شعاع',
    partsSrc.includes('value: (row.metrics.return - floor) + 0.01') && partsSrc.includes('metric: row.metrics.return'));
  check('رادار می‌گوید محورها نگاشته شده‌اند',
    flowSrc.includes('هر محور به صفر تا صد نگاشته می‌شود') && tab201.includes('هر محور به صفر تا صد نگاشته شده'));
}

// ═══ کشوی جزئیات و دانه‌بندی درون‌روزی ═══
group('۲۰۱-و. کشوی جزئیات و دانه‌بندی');
{
  // سیزده نمودار با سیزده رفتارِ کلیک یعنی کاربر باید یاد بگیرد کدام‌شان
  // چه می‌کند. یک مسیر، نه سیزده تا.
  check('کشوی جزئیات بیرون از پنل‌هاست تا از هر تبی دیده شود',
    tab201.indexOf('id="pb-drawer"') < tab201.indexOf('data-panel="setup"'));
  check('هر انتخاب استراتژی، کشو را هم پر می‌کند',
    tab201.includes('if (analysis.strategies.some((row) => row.strategyId === strategyId)) openDetail(strategyId);'));
  check('کشو سه نما دارد: سنجه، ترکیب، مسیر',
    tab201.includes("{ id: 'metrics', label: 'سنجه‌ها' }")
    && tab201.includes("{ id: 'combos', label: 'ترکیب‌ها' }")
    && tab201.includes("{ id: 'path', label: 'مسیر گام‌به‌گام' }"));
  check('نمای سنجه، وزن و سهم هر سنجه در نمره را نشان می‌دهد',
    tab201.includes('<th>وزن در نمره</th><th>سهم از نمره</th>')
    && tab201.includes('این سنجه را ندارد'));
  check('کلیک روی ترکیب در کشو، به پنل جزئیات کامل می‌برد',
    tab201.includes("dirty.delete('drill'); tabsApi?.show('drill'); showDetail(rawRow(combo));"));

  // ── دانه‌بندی ───────────────────────────────────────────────────────
  check('دانه‌بندی در عدسی هست', tab201.includes('id="pb-grain"'));
  // عددی که بعد از فشردن دکمه معلوم شود، هشدار نیست؛ عذرخواهی است.
  check('هزینهٔ اجرای درون‌روزی پیش از دکمه نوشته می‌شود',
    tab201.includes('function paintGrainNote()') && tab201.includes('intradayCost({ instruments: Object.keys(seriesByIns).length, grain })'));
  check('محدودیت «فقط روز سنجش» صریح گفته می‌شود',
    tab201.includes('فقط **روز سنجش** ریز می‌شود؛ بقیهٔ بازه همان‌طور می‌ماند'));
  check('لحظهٔ بی‌معامله، قیمت لحظهٔ قبل را نمی‌گیرد',
    tab201.includes('قیمت لحظهٔ قبل جایش نمی‌نشیند'));
  // برچسبِ چهارده‌رقمیِ کلیدِ لحظه در تقویم جلالی «—» می‌داد.
  check('برچسب ستون در حالت درون‌روزی، ساعت را نشان می‌دهد',
    tab201.includes('const columnLabel = (value) => (isIntradayGrain(grain)')
    && tab201.includes('`<option value="${date}"${Number(selected) === date ? \' selected\' : \'\'}>${esc(columnLabel(date))}</option>`'));
  check('بازگشت به روزانه، اجرای دوباره نمی‌خواهد',
    tab201.includes('if (!isIntradayGrain(grain) && dailyMatrix) {') && tab201.includes('payloadMatrix = dailyMatrix;'));
  check('کتابخانهٔ اجرا برای سبد چندنمادی نگه داشته می‌شود',
    tab201.includes('function basketSources()') && tab201.includes('sources: basketSources()'));
  check('هر اجرای کتابخانه با عدسی جاری تحلیل می‌شود، نه با مبنای روزِ خودش',
    /basketSources\(\)[\s\S]{0,700}basisId: lens\.basisId, statistic: lens\.statistic/.test(tab201));
  // شاخهٔ «ترکیب» یک بار در همین شنونده جا افتاد. منطق حالا بیرون است و
  // آزمون مستقیم دارد (دستهٔ ۲۰۴)؛ این ادعا نمی‌گذارد دوباره تو کشیده شود.
  check('ویرایش سطرهای سبد از تابع خالص مشترک می‌آید، نه از شنونده',
    tab201.includes('basketPicks = applyBasketEdit({')
    && ['applyBasketEdit', 'firstComboId', 'normalizeBasketPicks']
      .every((name) => new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '/core/basket-picks\\.mjs'`, 's').test(tab201))
    && !/addEventListener\('change'[\s\S]{0,400}key === 'sourceId'/.test(tab201));
  check('فرم سبد پیش از رسم با اجراهای موجود آشتی داده می‌شود',
    tab201.includes('basketPicks = normalizeBasketPicks(basketPicks, basketSources());'));
  check('ستون «اجرا» تا وقتی کتابخانه یک اجرا دارد، جا اشغال نمی‌کند',
    tab201.includes('const many = sources.length > 1;')
    && tab201.includes("${many ? '' : ' data-single-run'}")
    && style201.includes('.pb-skin .pb-basket-row[data-single-run] { grid-template-columns:'));
  // دکمهٔ «افزودن» سهم ثابت ۱۰٪ می‌گذاشت: سه سطر پیش‌فرض دقیقاً صد است،
  // پس یک افزودن مجموع را ۱۱۰ می‌کرد و کل سبد رد می‌شد.
  check('افزودن استراتژی، سهم ثابت نمی‌گذارد',
    tab201.includes('const added = addPick({') && !/pb-basket-add[\s\S]{0,600}pct: 10 \}/.test(tab201));
  check('مجموع درصدها زنده نشان داده می‌شود',
    tab201.includes('function paintBasketTally()') && tab201.includes('id="pb-basket-tally"'));
  // `100 - freePct` هر تخصیصِ بیش از صد را دقیقاً صد نشان می‌داد.
  check('مجموع از usedPct می‌آید، نه از مکملِ کف‌دار',
    tab201.includes('const used = usedPct(basketPicks);')
    && !tab201.includes('const used = Math.round((100 - freePct('));
  check('چرایی ننشستنِ یک سطر پیش از ساخت گفته می‌شود',
    tab201.includes('const warn = pickWarning({') && tab201.includes('class="pb-basket-warn"'));
  check('بازچینشِ سهم‌های کاربر بی‌صدا نمی‌ماند',
    tab201.includes('basketRebalanced = added.rebalanced;')
    && tab201.includes('سهم‌های پیشین به نسبت خودشان کوچک شدند'));
  // خبرِ بازچینش اگر پاک نشود، در هر رسم بعدی تکرار می‌شود.
  check('خبر بازچینش به همان افزودن می‌ماند',
    (tab201.match(/basketRebalanced = false;/g) || []).length >= 4);
  check('نامِ بریده‌شده در select با title کامل برمی‌گردد',
    /data-basket="strategyId"[^`]*title="/.test(tab201)
    && /data-basket="comboId"[^`]*title="/.test(tab201));

  // ── پوستهٔ صفحه ─────────────────────────────────────────────────────
  //
  // پوسته روی ریشهٔ همین تب بسته می‌شود. اگر کسی فردا همین قاعده‌ها را
  // سراسری کند، صفحه‌های ساده‌ترِ برنامه هم چگالیِ این یکی را می‌گیرند.
  check('پوسته روی ریشهٔ همین تب می‌نشیند، نه روی کنترل‌های سراسری',
    tab201.includes("root.classList.add('pb-skin');")
    && style201.includes('.pb-skin {'));
  const skin201 = style201.slice(style201.indexOf('.pb-skin {'));
  check('هر قاعدهٔ پوسته زیر .pb-skin است',
    (skin201.match(/^\.(?!pb-skin)[a-z]/gm) || []).length === 0);
  const skinTokens201 = ['--pb-rail', '--pb-hair', '--pb-tile', '--pb-sunk'];
  check('پوسته توکن‌های خودش را یک جا تعریف می‌کند',
    skinTokens201.every((token) => skin201.includes(`${token}:`)));
  /**
   * تنِ یک قاعدهٔ CSS — فقط میان `{` و نخستین `}` پس از آن.
   *
   * لازم است، نه تزیین: با الگوی `selector \{[\s\S]*?prop` جست‌وجو از
   * قاعده بیرون می‌زند و به `prop` قاعدهٔ بعدی می‌رسد. آزمون آن‌وقت
   * سبز می‌ماند حتی وقتی خاصیت را از قاعدهٔ درست برداشته باشی — دو
   * جهش دقیقاً همین‌طور زنده ماندند.
   */
  const ruleBody201 = (selector) => {
    const at = skin201.indexOf(`${selector} {`);
    if (at < 0) return '';
    const from = skin201.indexOf('{', at);
    const to = skin201.indexOf('}', from);
    return to < 0 ? '' : skin201.slice(from + 1, to);
  };
  const buttons201 = ruleBody201('.pb-skin .primary, .pb-skin .ghost');
  check('دکمهٔ اصلی و شبح یک ارتفاع و یک شعاع دارند',
    buttons201.includes('min-height: var(--control-h-sm)')
    && buttons201.includes('border-radius: var(--radius-pill)'));
  check('نوار تب چسبان است تا در صفحهٔ بلند گم نشود',
    ruleBody201('.pb-skin #pb-tabs').includes('position: sticky'));
  // فلش `select` روی زمینه کشیده می‌شود و جایش را از padding می‌گیرد؛
  // کوتاه‌نویسِ `padding` آن را پاک می‌کرد و متن می‌رفت زیر فلش.
  const select201 = ruleBody201('.pb-skin select');
  check('فلش select جای رزروشده دارد و متن بلند سه‌نقطه می‌خورد',
    select201.includes('padding-inline-start: 34px')
    && select201.includes('text-overflow: ellipsis')
    && !/\n  padding: /.test(ruleBody201('.pb-skin select,')));
  check('عدد در ورودی و کارت و جدول، تک‌عرض است',
    ruleBody201('.pb-skin input[type="number"]').includes('font-family: var(--mono)')
    && ruleBody201('.pb-skin .backtest-kpis b').includes('font-family: var(--mono)')
    && ruleBody201('.pb-skin .history-table').includes('font-variant-numeric: tabular-nums'));
  check('سر جدول هنگام پیمایش سر جایش می‌ماند',
    ruleBody201('.pb-skin .history-table thead th').includes('position: sticky'));
}
