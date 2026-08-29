// ۱۳۴. دفتر سرمایه در تب

import { check, group, near, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioCapitalLedger } from '../../core/portfolio-ledger.mjs';
import { breachText, portfolioLedgerView } from '../../ui/portfolio-ledger-view.mjs';

group('۱۳۴. دفتر سرمایه در تب');
{
  const fx134 = portfolioFixture('ledger-view-134');
  // چیدمان مشترک بودجهٔ تک‌پایه‌اش تنگ است و طرح برتر را رد می‌کند؛ اینجا
  // موضوع نمایش دفتر است نه دروازهٔ بودجه، پس تخصیص جادارتر می‌شود.
  const roomy134 = JSON.parse(JSON.stringify(fx134.baseSession));
  roomy134.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session134 = {
    ...roomy134,
    lockedMission: fx134.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };

  // ── بند ۶: جلسهٔ بدون ثبت و بدون مأموریت، پیام صریح ─────────────────
  const empty134 = portfolioLedgerView(session134);
  check('جلسهٔ بدون ثبت، گزارش می‌گیرد ولی «خالی» علامت می‌خورد',
    empty134.ok && empty134.empty === true, empty134.why);
  check('و به‌جای نوار صفر، جمله می‌گوید چه خبر است',
    empty134.headlineText.includes('هیچ طرحی ثبت نشده')
    && !/^۰/.test(empty134.headlineText), empty134.headlineText);
  check('ولی قیود ریسک همان‌جا هم دیده می‌شوند — صفر بودنِ درگیر، نبودِ قید نیست',
    empty134.risks.length === 2 && empty134.risks.every((row) => row.headroomText.length > 0));

  const noMission134 = portfolioLedgerView({ ...roomy134, lockedMission: null });
  check('جلسهٔ بدون مأموریت، علت صریح می‌دهد نه گزارش صفر',
    !noMission134.ok && noMission134.reason === 'missingMission'
    && noMission134.why.length > 0 && noMission134.risks.length === 0);
  check('و هیچ عددی در حالت ناموفق ساخته نمی‌شود',
    noMission134.committedTomanText === '—' && noMission134.freeTomanText === '—'
    && noMission134.headlineText === '');
  check('جلسهٔ نبوده هم پیام خودش را دارد',
    portfolioLedgerView(null).reason === 'noSession');

  // ── پیش‌شرط: یک ثبت واقعی ───────────────────────────────────────────
  const plans134 = portfolioRankedPlans(session134, fx134.evidence);
  const topId134 = plans134.ranking.ranked[0].candidateId;
  const done134 = commitPortfolioPlan(session134, fx134.evidence, topId134);
  check('پیش‌شرط: یک طرح ثبت شد', done134.ok, done134.why);
  const view134 = portfolioLedgerView(done134.session);
  const ledger134 = portfolioCapitalLedger(done134.session);
  const parts134 = plans134.sources.get(topId134).capital.components;

  // ── بند ۱: هیچ عدد مالی تازه‌ای ─────────────────────────────────────
  const viewCode134 = readSrc('../ui/portfolio-ledger-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const rialMath134 = viewCode134.match(/Rial[A-Za-z]*\s*[*+\-]/g) || [];
  const rialDiv134 = (viewCode134.match(/Rial[A-Za-z]*\s*\/\s*[0-9]+/g) || [])
    .filter((hit) => !/\/\s*10$/.test(hit));
  check('لایهٔ نمایش روی عدد ریالی جز تقسیم بر ده حساب نمی‌کند',
    rialMath134.length === 0 && rialDiv134.length === 0,
    [...rialMath134, ...rialDiv134].join(' ،') || 'هیچ');
  check('و هیچ درصدی هم اینجا ساخته نمی‌شود',
    !/Pct[A-Za-z]*\s*[*+\-/]/.test(viewCode134)
    && !/\/\s*baseRial|\*\s*100/.test(viewCode134));
  check('و موتور سرمایه و بازده را مستقیم صدا نمی‌زند',
    !/portfolioCapitalRequirement|analyzePayoff|strategyMargin|ledgerRoomFor/
      .test(viewCode134));
  check('هر عدد نمایش‌داده‌شده در خروجی دفتر عیناً هست',
    view134.committedTomanText === new Intl.NumberFormat('en-US')
      .format(ledger134.committed.totalRial / 10)
      .replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/,/g, '٬'),
    view134.committedTomanText);

  // ── بند ۲: رقم فارسی و تومان ────────────────────────────────────────
  // `code`، `key`، `familyId` و `state` شناسه‌اند نه متن نمایشی؛ به چشم
  // کاربر نمی‌رسند و لاتین‌بودنشان درست است.
  const IDS_134 = new Set(['code', 'key', 'familyId', 'state', 'reason']);
  const shown134 = [
    view134.headlineText, view134.baseTomanText, view134.committedTomanText,
    view134.freeTomanText, view134.freePctText, view134.countText,
    view134.positionsText,
    ...view134.components.flatMap((row) => Object.entries(row)),
    ...view134.families.flatMap((row) => Object.entries(row)),
    ...view134.risks.flatMap((row) => Object.entries(row)),
  ].map((item) => (Array.isArray(item) ? item : [null, item]))
    .filter(([key, value]) => typeof value === 'string' && !IDS_134.has(key))
    .map(([, value]) => value);
  check('هیچ رقم لاتینی در متن نمایشی نیست',
    shown134.every((value) => !/[0-9]/.test(value)),
    shown134.filter((v) => /[0-9]/.test(v)).slice(0, 3).join(' | ') || 'هیچ');
  check('واحد همه‌جا تومان است، نه ریال',
    view134.committedTomanText !== '—'
    && !/ریال/.test([...shown134, view134.headlineText].join(' ')));
  check('تبدیل واحد درست انجام شده — ده برابر کوچک‌تر از ریال',
    near(Number(view134.freeTomanText.replace(/٬/g, '')
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))),
    ledger134.free.rial / 10, 1e-9), view134.freeTomanText);

  // ── بند ۳: فاصله تا شکستن ───────────────────────────────────────────
  const minFree134 = view134.risks.find((row) => row.code === 'minFreeCapital');
  const maxMargin134 = view134.risks.find((row) => row.code === 'maxMarginUse');
  check('هر دو قید ریسک ردیف خودشان را دارند',
    Boolean(minFree134 && maxMargin134)
    && minFree134.label === ledger134.risk.minFreeCapital.label
    && maxMargin134.label === ledger134.risk.maxMarginUse.label);
  check('هر قید، اکنون و حد و فاصله را با هم نشان می‌دهد',
    [minFree134, maxMargin134].every((row) => row.currentText.includes('تومان')
      && row.limitText.includes('تومان') && row.headroomText.includes('تومان')
      && row.currentText.includes('٪') && row.headroomText.includes('٪')));
  check('فاصله در حالت رعایت‌شده «جا مانده» است، نه فقط یک تیک',
    minFree134.breached === false && minFree134.stateLabel === 'رعایت شده'
    && minFree134.headroomLabel === 'جا مانده');
  // فاصله باید از دفتر بیاید نه از تفریقِ لایهٔ نمایش — وگرنه روزی که
  // مبنای درصد عوض شود، این عدد بی‌صدا غلط می‌شود.
  check('عدد فاصله همان چیزی است که دفتر داد',
    near(ledger134.risk.minFreeCapital.headroomPct,
      ledger134.free.pct - ledger134.risk.minFreeCapital.limitPct, 1e-9)
    && ledger134.risk.maxMarginUse.headroomRial
      === ledger134.risk.maxMarginUse.limitRial - ledger134.risk.maxMarginUse.currentRial);
  check('علامت یکسان است: مثبت یعنی جا، منفی یعنی عبور',
    [ledger134.risk.minFreeCapital, ledger134.risk.maxMarginUse]
      .every((row) => row.breached === (row.headroomPct < 0)));

  // قیدی که واقعاً شکسته — بدون این، «شکسته» فقط یک شاخهٔ نانوشته است.
  const tight134 = {
    ...roomy134,
    lockedMission: fx134.sessionWith(BULLISH_OUTLOOK, {
      ...WIDE_RISK, minFreeCapitalPct: 75, maxMarginUsePct: 25,
    }).lockedMission,
    events: done134.session.events,
    counters: done134.session.counters,
  };
  const broken134 = portfolioLedgerView(tight134);
  const brokenRow134 = broken134.risks.find((row) => row.code === 'minFreeCapital');
  check('قید شکسته با حکم و «عبور کرده» دیده می‌شود',
    broken134.ok && brokenRow134.breached === true
    && brokenRow134.stateLabel === 'شکسته' && brokenRow134.headroomLabel === 'عبور کرده'
    && brokenRow134.state === 'breached', broken134.why);
  check('و عدد عبور منفی است، نه پنهان',
    /−/.test(brokenRow134.headroomText), brokenRow134.headroomText);

  // ── متن ردشدن ثبت ───────────────────────────────────────────────────
  const nextId134 = portfolioRankedPlans(tight134, fx134.evidence).ranking.ranked
    .map((row) => row.candidateId).find((id) => id !== topId134);
  const rejected134 = commitPortfolioPlan(tight134, fx134.evidence, nextId134);
  check('پیش‌شرط: ثبت روی جلسهٔ تنگ رد می‌شود',
    !rejected134.ok && rejected134.reason === 'missionRiskBreached', rejected134.why);
  const detail134 = breachText(rejected134.breaches);
  check('متن ردشدن می‌گوید کدام قید و چه عددی در برابر چه حدی',
    detail134.includes(rejected134.breaches[0].label) && detail134.includes('حد'),
    detail134);
  check('و درصدهایش رقم فارسی‌اند — برخلاف متن خام موتور',
    !/[0-9]/.test(detail134) && /[0-9]/.test(rejected134.why), detail134);
  check('نبودِ شکست، متن خالی می‌دهد نه جملهٔ ساختگی',
    breachText([]) === '' && breachText(undefined) === '');

  // ── بند ۴: اجزا و خانواده‌ها، با نام خوانا ──────────────────────────
  const byKey134 = new Map(view134.components.map((row) => [row.key, row]));
  check('بدهکار، کارمزد و وجه تضمین هرکدام ردیف خودشان را دارند',
    byKey134.size === 3 && byKey134.has('debitRial') && byKey134.has('feeRial')
    && byKey134.has('marginRial'));
  check('و برچسبشان خوانا است نه نام فیلد',
    [...byKey134.values()].every((row) => row.label.length > 0
      && !/Rial|[A-Za-z]/.test(row.label)));
  check('عدد هر جزء همان عدد دفتر است',
    byKey134.get('feeRial').tomanText !== '—'
    && ledger134.committed.feeRial === parts134.feeRial);
  check('تفکیک خانواده با نام خوانا می‌آید، نه شناسهٔ خام',
    view134.families.length === 1 && view134.families[0].label === 'تک‌پایه'
    && view134.families[0].familyId === 'single'
    && view134.families[0].countText === '۱');

  // ── بند ۵: رویدادهای بی‌عدد ─────────────────────────────────────────
  check('وقتی همه‌چیز عدد دارد، هشدارِ بی‌مورد ساخته نمی‌شود',
    view134.unpriced === null);
  const blind134 = JSON.parse(JSON.stringify(done134.session));
  const priced134 = blind134.events.find((event) => event?.data?.capitalRial !== undefined);
  delete priced134.data.capitalRial;
  const withBlind134 = portfolioLedgerView(blind134);
  check('ثبت بی‌عدد پنهان نمی‌شود — شمرده و نام‌بُرده می‌شود',
    withBlind134.ok && withBlind134.unpriced !== null
    && withBlind134.unpriced.count === 1
    && withBlind134.unpriced.idsText.includes(String(priced134.id)
      .replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])),
    withBlind134.unpriced?.idsText);
  check('و متنش می‌گوید چرا جمع بالا کامل نیست',
    withBlind134.unpriced.why.includes('در جمع بالا نیامده')
    && !/[0-9]/.test(withBlind134.unpriced.why), withBlind134.unpriced.why);
  check('جلسه‌ای که فقط ثبت بی‌عدد دارد، «خالی» علامت نمی‌خورد',
    withBlind134.empty === false && withBlind134.committedTomanText === '۰');

  // ── اتصال به تب ─────────────────────────────────────────────────────
  const tabSrc134 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب مدل نمایش دفتر را وارد می‌کند',
    /portfolioLedgerView/.test(tabSrc134)
    && /from '\.\.\/portfolio-ledger-view\.mjs'/.test(tabSrc134));
  check('بخش سرمایه و خانه‌هایش در نشانه‌گذاری هستند',
    ['pt-ledger', 'pt-ledger-state', 'pt-ledger-figures', 'pt-ledger-risk',
      'pt-ledger-families', 'pt-ledger-unpriced']
      .every((id) => tabSrc134.includes(`id="${id}"`)));
  // نوار سرمایه بالای پیشنهادها می‌نشیند: کاربر پیش از انتخاب طرح باید
  // بداند اصلاً چقدر جا مانده.
  // ادعا همان است، ساختار عوض شده: پیشنهادها حالا تب خودشان را دارند، پس
  // «پیش از پیشنهادها» دیگر ترتیبِ یک صفحهٔ بلند نیست. چیزی که هنوز
  // معنی دارد این است که در تب سبد، اول «چقدر جا مانده» بیاید و بعد «چه
  // چیزی در دست است».
  check('نوار سرمایه در تب سبد پیش از موقعیت‌ها رسم می‌شود',
    tabSrc134.indexOf('data-panel="basket"') < tabSrc134.indexOf('id="pt-ledger"')
    && tabSrc134.indexOf('id="pt-ledger"') < tabSrc134.indexOf('id="pt-positions"')
    && tabSrc134.indexOf('id="pt-ledger"') > 0);
  check('و جدول پیشنهادها تب جدای خودش را دارد',
    tabSrc134.indexOf('data-panel="strategies"') < tabSrc134.indexOf('id="pt-proposals"')
    && tabSrc134.indexOf('id="pt-proposals"') < tabSrc134.indexOf('data-panel="basket"'));
  // یک نقطهٔ فراخوانی یعنی هیچ‌وقت نوار یک جلسه کنار پیشنهاد جلسهٔ دیگر
  // دیده نمی‌شود — همان درسی که شمردنِ فراخوانی‌ها در دستهٔ ۱۳۱ داد.
  // پیش‌درآمدِ `paintProposals` — از سرِ تابع تا جایی که خودش سراغ جدول
  // پیشنهادها می‌رود. پنجرهٔ کاراکتری اینجا بود و با هر بخشِ تازه باید
  // بزرگ‌تر می‌شد؛ پنجره‌ای که مدام بزرگ می‌شود دیگر چیزی را قفل نمی‌کند.
  const paintBody134 = tabSrc134.slice(tabSrc134.indexOf('function paintProposals'));
  const prologue134 = paintBody134.slice(0, paintBody134.indexOf('committedIds.clear()'));
  check('پیشنهادها و نوار سرمایه همیشه از یک جلسه ساخته می‌شوند',
    /function paintProposals\(session\)/.test(prologue134)
    && prologue134.includes('paintLedger(session);')
    && (prologue134.match(/paintLedger\(session\);/g) || []).length === 1);
  check('شناسه‌های بخش دفتر با پیش‌نمایش سرمایهٔ اولیه تصادم ندارند',
    !tabSrc134.includes('id="pt-ledger-error"')
    && (tabSrc134.match(/id="pt-capital"/g) || []).length === 1
    && (tabSrc134.match(/function paintCapital\b/g) || []).length === 1
    && (tabSrc134.match(/function paintLedger\b/g) || []).length === 1);
  check('قفل ویرایشگر مأموریت، بخش سرمایه را غیرفعال نمی‌کند',
    /!control\.closest\('#pt-ledger'\)/.test(tabSrc134));
  check('تب هیچ عدد مالی تازه‌ای برای این بخش حساب نمی‌کند',
    !/portfolioCapitalLedger|ledgerRoomFor|\/\s*10/
      .test(tabSrc134.slice(tabSrc134.indexOf('function paintLedger'),
        tabSrc134.indexOf('function paintProposals'))));

  const cssSrc134 = readSrc('../ui/style.css');
  check('سبک بخش سرمایه از همان توکن‌های موجود می‌آید، نه رنگ سخت‌کدشده',
    /\.pt-ledger/.test(cssSrc134)
    && !/\.pt-ledger[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(cssSrc134));
  check('و در موبایل جدولش مثل بقیه ستون‌شکن می‌شود',
    /\.pt-ledger-table td::before/.test(cssSrc134));
}
