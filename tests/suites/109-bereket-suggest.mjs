// ۱۰۸. موتور پیشنهاد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  SCORE_PARTS, editDistribution, expectedUnder, luckVsSkill, pickQuality, probabilityUnder, quantileNodes, rankCandidates, scoreCandidate, stressDistribution, viewDistribution,
} from '../../core/bereket-suggest.mjs';


// ═══════════════════ ۱۰۸. موتور پیشنهاد ═══════════════════
//
// سند دو خواستهٔ صریح دارد که این گروه هر دو را قفل می‌کند: ساختاری که
// فقط زیر سناریوی دقیق کاربر برنده است باید جریمه بگیرد، و اجزای امتیاز
// باید دیده شوند نه فقط عدد نهایی.
group('۱۰۸. موتور پیشنهاد');
{
  const view = {
    spot: 10_000, direction: 'up', movePct: 8, confidence: 0.6,
    horizonDays: 20, realizedVolPct: 40,
  };
  const dist = viewDistribution(view);

  // ——— توزیع ———
  check('مرکز توزیع از پیش‌بینی کاربر می‌آید', Math.abs(dist.centre - 10_800) < 1e-6);
  check('مرکز، میانگین است نه میانه — و هر دو جدا برمی‌گردند',
    dist.medianPrice < dist.centre
    && Math.abs(dist.medianPrice - dist.centre * Math.exp(-0.5 * dist.sigma ** 2)) < 1e-9);
  check('نظر نزولی مرکز را پایین می‌برد',
    viewDistribution({ ...view, direction: 'down' }).centre < view.spot);
  check('نظر خنثی مرکز را جابه‌جا نمی‌کند',
    Math.abs(viewDistribution({ ...view, direction: 'flat' }).centre - view.spot) < 1e-6);
  check('اطمینان کامل، پراکندگی را از تلاطم تحقق‌یافته کمتر نمی‌کند', (() => {
    const sure = viewDistribution({ ...view, confidence: 1 });
    const base = 0.40 * Math.sqrt(20 / 365);
    return Math.abs(sure.sigma - base) < 1e-9;
  })());
  check('اطمینان صفر، پراکندگی را سه برابر می‌کند', (() => {
    const unsure = viewDistribution({ ...view, confidence: 0 });
    const sure = viewDistribution({ ...view, confidence: 1 });
    return Math.abs(unsure.sigma - sure.sigma * 3) < 1e-9;
  })());
  check('نظر پرنوسان، پراکندگی بیشتری می‌خواهد',
    viewDistribution({ ...view, direction: 'volatile' }).sigma > dist.sigma);
  check('بدون تلاطم تحقق‌یافته، توزیعی ساخته نمی‌شود', (() => {
    const none = viewDistribution({ ...view, realizedVolPct: NaN });
    return none.ok === false && none.why.length > 0;
  })());
  check('نظر دربارهٔ تلاطم ضمنی جدا از توزیع پایه نگه داشته می‌شود',
    viewDistribution({ ...view, ivView: 'up' }).ivShiftPp > 0
    && viewDistribution({ ...view, ivView: 'down' }).ivShiftPp < 0
    && viewDistribution({ ...view, ivView: 'same' }).ivShiftPp === 0);

  // ——— ویرایش ———
  check('ویرایش دستی توزیع علامت می‌خورد', (() => {
    const edited = editDistribution(dist, { centre: 11_000 });
    return edited.edited === true && Math.abs(edited.centre - 11_000) < 1e-6
      && Math.abs(edited.driftPct - 10) < 1e-9 && dist.edited === false;
  })());
  check('ویرایش با عدد نامعتبر چیزی را خراب نمی‌کند', (() => {
    const same = editDistribution(dist, { centre: -5, sigma: 0 });
    return same.centre === dist.centre && same.sigma === dist.sigma;
  })());

  // ——— گره‌ها ———
  {
    const nodes = quantileNodes(dist, 9);
    check('گره‌ها به تعداد خواسته‌شده‌اند', nodes.length === 9);
    check('گره‌ها صعودی‌اند', nodes.every((value, at) => at === 0 || value > nodes[at - 1]));
    check('میانگین گره‌ها روی مرکز می‌نشیند، و گرهِ میانی روی میانه', (() => {
      const many = quantileNodes(dist, 401);
      const mean = many.reduce((a, b) => a + b, 0) / many.length;
      const middle = many[200];
      return Math.abs(mean - dist.centre) / dist.centre < 0.01
        && Math.abs(middle - dist.medianPrice) / dist.medianPrice < 0.01;
    })());
    check('توزیع نامعتبر گره نمی‌سازد', quantileNodes({ ok: false }, 9).length === 0);
  }
  check('امید ریاضی، میانگین سادهٔ گره‌هاست', (() => {
    const nodes = quantileNodes(dist, 11);
    const manual = nodes.reduce((sum, S) => sum + S, 0) / nodes.length;
    return Math.abs(expectedUnder(dist, (S) => S, 11) - manual) < 1e-9;
  })());
  check('احتمال، نسبت گره‌های برنده است', (() => {
    // تابعی که دقیقاً بالای میانه مثبت است → نزدیک پنجاه درصد
    const p = probabilityUnder(dist, (S) => S - dist.medianPrice, 101);
    return Math.abs(p - 50) < 2;
  })());

  // ——— آزمون مقاومت ———
  check('فشار، توزیع را خلاف جهت نظر جابه‌جا می‌کند',
    stressDistribution(dist).centre < dist.centre
    && stressDistribution(viewDistribution({ ...view, direction: 'down' })).centre
      > viewDistribution({ ...view, direction: 'down' }).centre);
  check('برای نظر بی‌جهت، فشار به اندازهٔ نصف پراکندگی است', (() => {
    const flat = viewDistribution({ ...view, direction: 'flat' });
    const under = stressDistribution(flat);
    return Math.abs(under.centre - flat.spot * (1 - flat.sigma / 2)) < 1e-6;
  })());
  check('توزیع تحت فشار علامت خودش را دارد', stressDistribution(dist).stressed === true);

  // ——— امتیاز ———
  const spread = [
    { kind: 'call', side: 'buy', strike: 10_000, ratio: 1, size: 1000, price: 500 },
    { kind: 'call', side: 'sell', strike: 11_000, ratio: 1, size: 1000, price: 200 },
  ];
  const scored = scoreCandidate({ legs: spread, dist, capital: 300_000, maxLoss: 300_000 });
  check('امتیاز ساخته می‌شود', scored.ok === true && Number.isFinite(scored.score));
  check('همهٔ اجزای امتیاز برمی‌گردند، نه فقط عدد نهایی',
    SCORE_PARTS.every((part) => part.key in scored.parts));
  check('هر جزء امتیاز برچسب و توضیح دارد',
    SCORE_PARTS.every((part) => part.label && part.hint && part.unit));
  check('بازده بر مخرج سرمایه حساب می‌شود',
    Math.abs(scored.parts.returnPct - (scored.parts.expectedPnl / 300_000) * 100) < 1e-9);
  check('بدون مخرج سرمایه، امتیاز ساخته نمی‌شود',
    scoreCandidate({ legs: spread, dist, capital: 0 }).ok === false);
  check('بدون توزیع، امتیاز ساخته نمی‌شود',
    scoreCandidate({ legs: spread, dist: { ok: false } }).ok === false);

  // ═══ ادعای اصلی: ساختار شکننده جریمه می‌گیرد ═══
  {
    // کالِ خیلی بی‌ارزش فقط وقتی می‌برد که حرکت دقیقاً همان‌قدر که کاربر
    // گفته یا بیشتر باشد؛ کالِ باارزش زیر فشار هم چیزی نگه می‌دارد.
    const fragile = [{ kind: 'call', side: 'buy', strike: 12_000, ratio: 1, size: 1000, price: 60 }];
    const sturdy = [{ kind: 'call', side: 'buy', strike: 9_500, ratio: 1, size: 1000, price: 900 }];
    const a = scoreCandidate({ legs: fragile, dist, capital: 60_000, maxLoss: 60_000 });
    const b = scoreCandidate({ legs: sturdy, dist, capital: 900_000, maxLoss: 900_000 });
    check('شکنندگی برای ساختار دور از پول بیشتر است',
      a.parts.fragility > b.parts.fragility,
      `${a.parts.fragility.toFixed(1)} در برابر ${b.parts.fragility.toFixed(1)}`);
    check('بازده زیر فشار همیشه از بازده عادی کمتر است',
      a.parts.stressReturnPct < a.parts.returnPct && b.parts.stressReturnPct < b.parts.returnPct);
    check('امتیاز میان دو بازده می‌نشیند، نه روی خوش‌بینانه‌ترینشان',
      a.score < a.parts.returnPct && a.score > a.parts.stressReturnPct);
  }

  // ——— رتبه‌بندی ———
  {
    const make = (id, score, ok = true, max = 5) => ({
      id, exec: { ok, max, why: ok ? '' : 'صف خرید' },
      score: { ok: true, score, parts: {} },
    });
    const out = rankCandidates([make('a', 10), make('b', 30), make('c', 20), make('x', 99, false, 0)]);
    check('رتبه‌بندی به ترتیب امتیاز است', out.ranked.map((r) => r.id).join(',') === 'b,c,a');
    check('رتبه از یک شروع می‌شود', out.ranked[0].rank === 1 && out.ranked[2].rank === 3);
    check('کاندید اجراناپذیر رتبه نمی‌گیرد', !out.ranked.some((r) => r.id === 'x'));
    check('ولی ناپدید هم نمی‌شود و دلیلش می‌ماند',
      out.rejected.length === 1 && out.rejected[0].id === 'x' && out.rejected[0].why === 'صف خرید');
    check('کاندید بی‌امتیاز هم کنار می‌رود با دلیل', (() => {
      const r = rankCandidates([{ id: 'z', exec: { ok: true, max: 3 }, score: { ok: false, why: 'مخرج نبود' } }]);
      return r.ranked.length === 0 && r.rejected[0].why === 'مخرج نبود';
    })());

    // ——— کیفیت انتخاب ———
    const quality = pickQuality(out.ranked, ['c']);
    check('رتبهٔ انتخاب کاربر گزارش می‌شود', quality.ok && quality.meanRank === 2 && quality.total === 3);
    check('صدک انتخاب حساب می‌شود', Math.abs(quality.percentile - 50) < 1e-9);
    check('انتخابی که در کاندیدها نیست، کیفیت نمی‌سازد',
      pickQuality(out.ranked, ['ناموجود']).ok === false);
  }

  // ——— بدشانسی در برابر بدانتخابی ———
  check('وقتی همه ضرر دادند، حکم روی پیش‌بینی است', (() => {
    const r = luckVsSkill({ shadowPnls: [-10, -20, -5, -30], chosenPnl: -12 });
    return r.verdict === 'forecast' && r.note.includes('پیش‌بینی جهت غلط');
  })());
  check('وقتی بیشترشان سود دادند و انتخاب پایین بود، حکم روی ساختار است', (() => {
    const r = luckVsSkill({ shadowPnls: [100, 80, 60, 40, -5], chosenPnl: 10 });
    return r.verdict === 'selection' && r.note.includes('ساختار غلط');
  })());
  check('وقتی انتخاب از بیشترشان بهتر بود، حکم روی برتری کاربر است', (() => {
    const r = luckVsSkill({ shadowPnls: [10, 20, 5, -30, -5], chosenPnl: 90 });
    return r.verdict === 'edge' && r.note.includes('موتور نمی‌بیند');
  })());
  check('حالت مبهم، حکم قطعی نمی‌دهد', (() => {
    const r = luckVsSkill({ shadowPnls: [10, -10, 20, -20], chosenPnl: 5 });
    return r.verdict === 'mixed' && r.note.includes('یک جلسه برای حکم‌دادن کافی نیست');
  })());
  check('بدون سود و زیان سایه‌ها، تفکیکی ادعا نمی‌شود',
    luckVsSkill({ shadowPnls: [], chosenPnl: 5 }).ok === false);
  check('هیچ حکمی رقم لاتین ندارد', [
    luckVsSkill({ shadowPnls: [-10, -20, -5, -30], chosenPnl: -12 }),
    luckVsSkill({ shadowPnls: [100, 80, 60, 40, -5], chosenPnl: 10 }),
    luckVsSkill({ shadowPnls: [10, 20, 5, -30, -5], chosenPnl: 90 }),
    luckVsSkill({ shadowPnls: [10, -10, 20, -20], chosenPnl: 5 }),
  ].every((row) => /^[^0-9]*$/.test(row.note)));
}
