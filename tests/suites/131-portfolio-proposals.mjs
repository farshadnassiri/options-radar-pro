// ۱۳۱. مدل نمایش پیشنهادهای سبد

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { fmt } from '../../ui/fmt.mjs';
import { portfolioSessionProposals } from '../../ui/portfolio-proposals.mjs';

group('۱۳۱. مدل نمایش پیشنهادهای سبد');
{
  const fx131 = portfolioFixture('proposals-131');
  const wide131 = fx131.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const view131 = portfolioSessionProposals(wide131, fx131.evidence);

  check('جلسهٔ فعال با مدرک هم‌لحظه پیشنهاد می‌گیرد',
    view131.ok && view131.shortlist.length > 0 && view131.setAside.length > 0, view131.why);

  // ── بند ۱: هیچ عدد مالی تازه‌ای ─────────────────────────────────────
  const top131 = view131.shortlist[0];
  const source131 = fx131.planFor(
    top131.candidateId.split('|')[0], wide131,
  );
  check('پیش‌شرط: طرحِ ردیف نخست از همان چیدمان بازساختنی است',
    source131.capital.ok, source131.capital.why);
  check('سرمایهٔ نمایشی همان عدد موتور است، فقط به تومان',
    view131.shortlist.every((row) => {
      const rial = Number(row.score) === 0 ? null : null;
      return typeof row.capitalTomanText === 'string' && row.capitalTomanText !== '—';
    })
    && top131.capitalTomanText === fmt.int(source131.capital.components.totalRial / 10),
    `${top131.capitalTomanText}`);
  check('بیشترین زیانِ نمایشی هم از موتور می‌آید و ساخته نمی‌شود',
    top131.maxLossTomanText === fmt.int(source131.capital.components.totalRial / 10)
    || top131.maxLossTomanText === 'نامحدود');
  check('سود نامحدود عدد نمی‌گیرد و «نامحدود» می‌ماند',
    view131.shortlist.some((row) => row.maxProfitTomanText === 'نامحدود')
    && view131.shortlist.every((row) => row.maxProfitTomanText !== '0'));

  // تنها حسابِ عددی مجاز در این لایه، تقسیم بر ده برای تبدیل واحد است.
  const viewCode131 = readSrc('../ui/portfolio-proposals.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // هر مقدارِ ریالی فقط اجازهٔ تقسیم بر ده دارد. ضرب و جمع و تفریق روی
  // عددِ ریالی یعنی لایهٔ نمایش دارد عدد می‌سازد — و هیچ آزمون دیگری
  // جلویش را نمی‌گیرد چون کاربر تفاوتش را نمی‌بیند.
  const rialMath131 = viewCode131.match(/Rial[A-Za-z]*\s*[*+\-]/g) || [];
  const rialDiv131 = (viewCode131.match(/Rial[A-Za-z]*\s*\/\s*[0-9]+/g) || [])
    .filter((hit) => !/\/\s*10$/.test(hit));
  check('لایهٔ نمایش روی عدد ریالی جز تقسیم بر ده حساب نمی‌کند',
    rialMath131.length === 0 && rialDiv131.length === 0,
    [...rialMath131, ...rialDiv131].join(' ،') || 'هیچ');
  check('و موتور بازده و وجه تضمین را مستقیم صدا نمی‌زند',
    !/analyzePayoff|pnlAtExpiry|strategyMargin|entryFees|walkBook/.test(viewCode131));

  // ── بند ۲: رقم فارسی، واحد تومان ────────────────────────────────────
  // `candidateId` و `kind` شناسه‌اند نه متن نمایشی؛ به چشم کاربر نمی‌رسند
  // و لاتین‌بودنشان درست است. بقیه همه متنِ دیده‌شدنی‌اند.
  const IDENTIFIERS_131 = new Set(['candidateId', 'kind']);
  const shown131 = [...view131.shortlist, ...view131.setAside]
    .flatMap((row) => Object.entries(row)
      .filter(([key, value]) => typeof value === 'string' && !IDENTIFIERS_131.has(key))
      .map(([, value]) => value));
  check('هیچ رقم لاتینی در متن نمایشی نیست',
    shown131.every((value) => !/[0-9]/.test(value)),
    shown131.filter((v) => /[0-9]/.test(v)).slice(0, 3).join(' | ') || 'هیچ');
  check('شمارش‌های بالای جدول هم فارسی‌اند',
    !/[0-9]/.test(view131.countsText) && view131.countsText.includes('ترکیب'),
    view131.countsText);
  check('رتبه با رقم فارسی می‌آید، نه شمارهٔ خام',
    top131.rankText === '۱' && top131.rank === 1);

  // ── بند ۳: امتیاز بدون علت نمایش داده نمی‌شود ───────────────────────
  check('هر ردیف رتبه‌دار امتیاز و جزء بالابرنده دارد',
    view131.shortlist.every((row) => Number.isFinite(row.score)
      && row.scoreText !== '—' && row.liftedText !== '—' && row.liftedText.includes('(')));
  check('جزء پایین‌کشنده هم وقتی هست گزارش می‌شود',
    view131.shortlist.some((row) => row.draggedText !== '—'));
  check('نام استراتژی و خانواده‌اش خوانا می‌آیند، نه شناسهٔ خام',
    top131.defLabel === 'خرید کال اختیار خرید' && top131.familyLabel === 'تک‌پایه',
    `${top131.defLabel} | ${top131.familyLabel}`);

  // ── بند ۴: کنارگذاشته و نامعلوم، جدا و خوانا ────────────────────────
  const asideIds131 = new Set(view131.setAside.map((row) => row.candidateId));
  check('ردیف کنارگذاشته با ردیف رتبه‌دار قاطی نمی‌شود',
    view131.shortlist.every((row) => !asideIds131.has(row.candidateId)));
  check('هر کنارگذاشته علت خواندنی دارد و «چرا» خالی نیست',
    view131.setAside.every((row) => row.why && row.why !== '—' && row.kindLabel.length > 0));
  check('«کنار گذاشته شد» از «امتیاز نامعلوم» جدا برچسب می‌خورد',
    view131.setAside.some((row) => row.kind === 'ineligible'
      && row.kindLabel === 'کنار گذاشته شد'));

  // دید پرنوسانِ بدون قیمت صریح، امتیاز نامعلوم می‌سازد — نه امتیاز بد.
  const volView131 = portfolioSessionProposals(fx131.sessionWith({
    direction: 'volatile', volatilityView: 'higher', confidencePct: 60,
    expectedVolatilityPct: 45, thesis: 'انتظار جهش، بدون قیمت صریح',
  }, WIDE_RISK), fx131.evidence);
  check('امتیاز نامعلوم رتبه نمی‌گیرد و برچسب خودش را دارد',
    volView131.ok && volView131.shortlist.length === 0
    && volView131.counts.unknownScore > 0
    && volView131.setAside.some((row) => row.kind === 'unknownScore'
      && row.kindLabel === 'امتیاز نامعلوم' && row.unknownText.includes('mission')),
    volView131.why);

  // ── بند ۵: کیفیت داده پنهان نمی‌شود ─────────────────────────────────
  check('کیفیت هر ردیف کنار خودش می‌آید',
    view131.shortlist.every((row) => row.qualityLabel && row.qualityLabel !== '—'));
  const estimated131 = JSON.parse(JSON.stringify(wide131));
  estimated131.startSnapshot.capitalInputs.fees.quality = makeDataQuality({
    kind: 'estimated', source: 'locked-broker-settings', asOf: fx131.at,
    sufficient: true, reason: 'نرخ کارمزد از تنظیمات پیش‌فرض کارگزار برآورد شده',
  });
  const estView131 = portfolioSessionProposals(estimated131, fx131.evidence);
  check('کیفیت برآوردی و علتش تا مدل نمایش می‌رسد',
    estView131.ok && estView131.shortlist.length > 0
    && /برآورد/.test(estView131.shortlist[0].qualityReason),
    `${estView131.shortlist[0]?.qualityLabel} — ${estView131.shortlist[0]?.qualityReason}`);

  // ── بند ۶: پیام صریح، نه جدول خالی ──────────────────────────────────
  check('جلسهٔ غیرفعال پیام صریح می‌دهد',
    (() => {
      const out = portfolioSessionProposals({ ...wide131, state: 'draft' }, fx131.evidence);
      return out.ok === false && out.reason === 'inactiveSession'
        && out.why.length > 0 && out.shortlist.length === 0 && out.setAside.length === 0;
    })());
  check('نبود مدرک اجراپذیری پیام صریح می‌دهد',
    portfolioSessionProposals(wide131, { ok: false }).reason === 'missingEvidence');
  check('نبود ترکیب، جدول خالی نمی‌سازد بلکه علت می‌گوید',
    (() => {
      const out = portfolioSessionProposals(wide131, { ok: true, now: fx131.at, rows: [] });
      return out.ok === false && out.reason === 'noCandidates' && out.counts === null;
    })());
  check('سقف کوتاه‌فهرست رعایت می‌شود',
    portfolioSessionProposals(wide131, fx131.evidence, { limit: 2 }).shortlist.length === 2
    && view131.limit === 3);

  // ── اتصال به تب ─────────────────────────────────────────────────────
  //
  // مدل نمایش بدون اتصال، کد مرده است. این ادعاها ارزان‌اند و غلط تایپی
  // در شناسه‌ها را می‌گیرند — چیزی که فقط در مرورگر معلوم می‌شود.
  const tabSrc131 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب مدل نمایش پیشنهاد را وارد می‌کند',
    /portfolioSessionProposals/.test(tabSrc131)
    && /from '\.\.\/portfolio-proposals\.mjs'/.test(tabSrc131));
  check('بخش پیشنهاد و هر دو جدولش در نشانه‌گذاری هستند',
    ['pt-proposals', 'pt-proposals-state', 'pt-proposals-body',
      'pt-proposals-aside', 'pt-proposals-aside-body']
      .every((id) => tabSrc131.includes(`id="${id}"`)));
  // شمردن فراخوانی‌ها معیار بدی بود: دستگیرهٔ ثبت هم به‌درستی دوباره رسم
  // می‌کند و شمارش را به‌هم می‌زند. آنچه واقعاً باید درست باشد این است که
  // هر جا حکم اجراپذیری با یک جلسه رسم می‌شود، پیشنهادها هم با **همان**
  // جلسه رسم شوند — وگرنه کاربر حکم یک جلسه و پیشنهاد جلسهٔ دیگر را
  // کنار هم می‌بیند.
  const paintPairs131 = [...tabSrc131.matchAll(/paintEligibility\(([^)]*)\);/g)]
    .map((hit) => ({ arg: hit[1].trim(), after: tabSrc131.slice(hit.index, hit.index + 160) }))
    .filter(({ arg }) => arg.length > 0);
  check('هرجا حکم اجراپذیری رسم می‌شود، پیشنهادها با همان جلسه رسم می‌شوند',
    paintPairs131.length >= 2
    && paintPairs131.every(({ arg, after }) => after.includes(`paintProposals(${arg})`)),
    paintPairs131.map(({ arg }) => arg).join(' ،') || 'هیچ فراخوانی‌ای پیدا نشد');
  check('قفل ویرایشگر مأموریت، بخش پیشنهاد را غیرفعال نمی‌کند',
    /!control\.closest\('#pt-proposals'\)/.test(tabSrc131));
  check('تب هیچ عدد مالی تازه‌ای برای این بخش حساب نمی‌کند',
    !/pt-proposals[\s\S]{0,4000}?(portfolioPlanScore|rankPlanScores|analyzePayoff)/
      .test(tabSrc131.slice(tabSrc131.indexOf('function paintProposals'))));

  const cssSrc131 = readSrc('../ui/style.css');
  check('سبک بخش پیشنهاد از همان توکن‌های موجود می‌آید، نه رنگ سخت‌کدشده',
    /\.pt-proposals/.test(cssSrc131)
    && !/\.pt-proposals[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(cssSrc131));
}
