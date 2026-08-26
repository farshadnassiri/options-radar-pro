// ۱۰۱. بذر، رژیم بازار و مدل جلسه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  advanceTo, blankSession, canAdvance, chooseCandidates, closeSession, countsInStats, lastDecision, lockExpectation, recordCandidates, recordEvent, recordValuation, recordView, replayAllowed, sessionSummary,
} from '../../core/bereket-session.mjs';
import {
  regimeAt, regimeBuckets, regimeLabel, regimeRuleText, regimeSeries, stratifiedPick,
} from '../../core/regime.mjs';
import { makeRng, pick, shuffle } from '../../core/rng.mjs';
import { validSessionId } from '../../server/guard.mjs';


// ═══════════════════ ۱۰۱. بذر، رژیم بازار و مدل جلسه ═══════════════════
//
// سه چیز که همه به یک قید تکیه می‌کنند: با شناسهٔ جلسه باید بشود دقیقاً
// همان جلسه را با همان اعداد بازسازی کرد.
group('۱۰۱. بذر، رژیم بازار و مدل جلسه');
{
  // ——— بذر ———
  check('یک بذر همیشه یک دنباله می‌دهد', (() => {
    const a = makeRng('س-۱'), b = makeRng('س-۱');
    return [0, 1, 2, 3, 4].every(() => a() === b());
  })());
  check('دو بذر متفاوت دو دنباله می‌دهند', makeRng('a')() !== makeRng('b')());
  check('خروجی در بازهٔ صفر تا یک است', (() => {
    const r = makeRng(7);
    for (let at = 0; at < 500; at += 1) { const v = r(); if (!(v >= 0 && v < 1)) return false; }
    return true;
  })());
  check('جابه‌جایی ورودی را دست نمی‌زند', (() => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(makeRng('x'), src);
    return src.join(',') === '1,2,3,4,5' && out.length === 5 && out.slice().sort().join(',') === '1,2,3,4,5';
  })());
  check('جابه‌جایی با یک بذر بازتولیدپذیر است',
    shuffle(makeRng('k'), [1, 2, 3, 4, 5]).join(',') === shuffle(makeRng('k'), [1, 2, 3, 4, 5]).join(','));
  check('برداشتن از فهرست خالی خطا نمی‌دهد', pick(makeRng('x'), []) === undefined);

  // ——— رژیم ———
  {
    // شصت روز معاملاتی متوالی و معتبر، سه بخش: صعود، نزول، رکود.
    const rows = [];
    let close = 1000;
    const days = [];
    for (let m = 5; m <= 7; m += 1) for (let d = 1; d <= 28; d += 1) days.push(2026 * 10000 + m * 100 + d);
    days.slice(0, 84).forEach((date, at) => {
      close = at < 28 ? close * 1.008 : at < 56 ? close * 0.992 : close * 1.0002;
      rows.push({ date, close });
    });
    const series = regimeSeries(rows, { windowDays: 20, thresholdPct: 5 });
    const buckets = regimeBuckets(series);
    check('هر سه رژیم در سری ساختگی پیدا می‌شوند',
      buckets.up.length > 0 && buckets.down.length > 0 && buckets.flat.length > 0);
    check('روزهای پیش از پر شدن پنجره برچسب نمی‌گیرند',
      buckets.unlabeled.length === 20 && series.slice(0, 20).every((r) => r.regime === null));
    check('برچسب فقط از پنجرهٔ عقب‌رو می‌آید', (() => {
      // اگر پنجره مرکزی بود، برچسب روز n به روزهای بعد وابسته می‌شد.
      // بریدن سری از روز n به بعد نباید برچسب روز n را عوض کند.
      const at = 40;
      const full = regimeSeries(rows, { windowDays: 20, thresholdPct: 5 });
      const cut = regimeSeries(rows.slice(0, at + 1), { windowDays: 20, thresholdPct: 5 });
      return full[at].regime === cut[at].regime && Math.abs(full[at].changePct - cut[at].changePct) < 1e-9;
    })());
    check('آستانه واقعاً اثر دارد', (() => {
      const wide = regimeBuckets(regimeSeries(rows, { windowDays: 20, thresholdPct: 50 }));
      return wide.flat.length > buckets.flat.length;
    })());
    check('جملهٔ قاعده با رقم فارسی نوشته می‌شود',
      /^[^0-9]*$/.test(regimeRuleText({ windowDays: 20, thresholdPct: 5 })));

    // ——— انتخاب لایه‌بندی‌شده ———
    const one = stratifiedPick(series, { seed: 'ب-۱', count: 9 });
    const two = stratifiedPick(series, { seed: 'ب-۱', count: 9 });
    check('انتخاب با یک بذر بازتولیدپذیر است', JSON.stringify(one.picks) === JSON.stringify(two.picks));
    check('انتخاب از هر سه رژیم به نسبت مساوی برمی‌دارد', (() => {
      const by = { up: 0, down: 0, flat: 0 };
      for (const p of one.picks) by[p.regime] += 1;
      return by.up === 3 && by.down === 3 && by.flat === 3;
    })());
    check('رژیمِ نبوده در بازه، صریح گزارش می‌شود', (() => {
      const onlyUp = series.filter((r) => r.regime === 'up');
      const r = stratifiedPick(onlyUp, { seed: 'x', count: 3 });
      return r.missing.includes('down') && r.missing.includes('flat') && r.picks.length === 3;
    })());
    check('تاریخ بازی‌شده دوباره انتخاب نمی‌شود', (() => {
      const first = stratifiedPick(series, { seed: 'z', count: 3 });
      const again = stratifiedPick(series, { seed: 'z', count: 3, exclude: first.picks.map((p) => p.date) });
      const seen = new Set(first.picks.map((p) => p.date));
      return again.picks.every((p) => !seen.has(p.date));
    })());
    check('رژیم یک تاریخ مشخص خوانده می‌شود',
      regimeAt(series, series[30].date) === series[30].regime && regimeAt(series, 19000101) === null);
    check('برچسب فارسی رژیم درست است',
      regimeLabel('up') === 'صعودی' && regimeLabel('down') === 'نزولی' && regimeLabel('zzz') === 'بی‌برچسب');
  }

  // ——— مدل جلسه ———
  {
    const start = { date: 20260521, second: 9 * 3600 };
    let s = blankSession({ id: 'س-۱', start });
    check('سرمایه پیش‌فرض یک میلیارد تومان به ریال است', s.capitalRial === 10_000_000_000);
    check('بذر از شناسه می‌آید نه از ساعت',
      blankSession({ id: 'س-۱', start }).seed === blankSession({ id: 'س-۱', start }).seed
      && blankSession({ id: 'س-۲', start }).seed !== s.seed);
    check('حالت ناشناس پیش‌فرض روشن است', s.anonymous === true);
    check('جلسهٔ تازه در آمار شمرده می‌شود', countsInStats(s) === true);
    check('جلسهٔ تمرینی در آمار شمرده نمی‌شود',
      countsInStats(blankSession({ id: 'x', start, practice: true })) === false);

    check('نظر بدون متن دلیل ثبت نمی‌شود',
      recordView(s, { direction: 'up', reason: '   ' }).ok === false);
    check('جهت نامعتبر نظر ثبت نمی‌کند',
      recordView(s, { direction: 'sideways-ish', reason: 'چیزی' }).ok === false);
    s = recordView(s, {
      direction: 'up', movePct: 8, confidence: 0.6, horizonDays: 10,
      ivView: 'down', reason: 'برگشت از حمایت روزانه', macro: 'دلار آرام',
    }).session;
    check('نظر ثبت شد و نقطهٔ تصمیم ساخته شد', s.decisions.length === 1 && lastDecision(s).view.movePct === 8);
    check('درجهٔ اطمینان به بازهٔ صفر تا یک بریده می‌شود',
      recordView(s, { direction: 'up', confidence: 9, reason: 'x' }).session.decisions[1].view.confidence === 1);

    s = recordCandidates(s, [{ id: 'a', score: 9 }, { id: 'b', score: 7 }, { id: 'c', score: 5 }]).session;
    check('همهٔ کاندیدها ثبت می‌شوند نه فقط انتخاب‌شده', lastDecision(s).candidates.length === 3);
    check('رتبه از ترتیب ورود ساخته می‌شود', lastDecision(s).candidates[1].rank === 2);

    check('انتخاب کاندیدی که در تصمیم نیست رد می‌شود',
      chooseCandidates(s, [{ id: 'zzz', size: 1 }]).ok === false);
    check('اندازهٔ نامثبت رد می‌شود', chooseCandidates(s, [{ id: 'a', size: 0 }]).ok === false);
    s = chooseCandidates(s, [{ id: 'b', size: 5 }]).session;
    check('رتبهٔ انتخاب کاربر همراه انتخاب ذخیره می‌شود', lastDecision(s).chosen[0].rank === 2);

    // ——— قفل انتظار: مهم‌ترین قید جلسه ———
    check('پیش از قفل انتظار، پرش ممکن نیست', canAdvance(s).ok === false);
    check('پرش بدون قفل، لحظه را عوض نمی‌کند', (() => {
      const r = advanceTo(s, { date: 20260521, second: 10 * 3600 });
      return r.ok === false && r.session.now.second === 9 * 3600;
    })());
    check('انتظار بدون متن قفل نمی‌شود', lockExpectation(s, { text: ' ' }).ok === false);
    s = lockExpectation(s, { text: 'تا سه روز به ۱۰ درصد بالاتر', targetPricePct: 10 }).session;
    check('پس از قفل، پرش ممکن است', canAdvance(s).ok === true);
    check('انتظار قفل‌شده ویرایش نمی‌شود', lockExpectation(s, { text: 'حرف تازه' }).ok === false);
    check('پس از قفل انتظار، انتخاب هم عوض نمی‌شود',
      chooseCandidates(s, [{ id: 'a', size: 1 }]).ok === false);

    // ——— زمان یک‌طرفه ———
    check('پرش به عقب رد می‌شود', advanceTo(s, { date: 20260520, second: 9 * 3600 }).ok === false);
    check('پرش در جا رد می‌شود', advanceTo(s, start).ok === false);
    s = advanceTo(s, { date: 20260521, second: 10 * 3600 }).session;
    check('پرش جلو لحظه را می‌برد', s.now.second === 10 * 3600);

    // ——— رویداد و ارزش‌گذاری ———
    check('رویداد بدون نوع ثبت نمی‌شود', recordEvent(s, { detail: 'چیزی' }).ok === false);
    s = recordEvent(s, { kind: 'margin-call', detail: 'وجه تضمین کم آورد', positionId: 'p1' }).session;
    check('رویداد با مهر زمانی لحظهٔ جاری ثبت می‌شود',
      s.events.length === 1 && s.events[0].at.second === 10 * 3600 && s.events[0].kind === 'margin-call');
    check('ارزش‌گذاری بدون شناسهٔ موقعیت ثبت نمی‌شود', recordValuation(s, {}).ok === false);
    s = recordValuation(s, { positionId: 'p1', pnlRial: 1234 }).session;
    check('ارزش‌گذاری با لحظه ذخیره می‌شود', s.valuations[0].at.date === 20260521);

    // ——— بستن ———
    const abandoned = closeSession(s, { abandoned: true }).session;
    check('جلسهٔ رهاشده حالت خودش را می‌گیرد', abandoned.state === 'abandoned');
    check('جلسهٔ رهاشده هم در آمار شمرده می‌شود', countsInStats(abandoned) === true);
    check('جلسهٔ بسته دوباره بسته نمی‌شود', closeSession(abandoned).ok === false);
    check('جلسهٔ بسته پرش نمی‌کند', canAdvance(abandoned).ok === false);

    // ——— ضد تقلب ———
    const history = [{ start: { date: 20260521 }, ins: '17765240' }];
    check('بازی مجدد همان تاریخ و نماد رد می‌شود',
      replayAllowed(history, { date: 20260521, ins: '17765240' }).ok === false);
    check('تاریخ دیگر مجاز است', replayAllowed(history, { date: 20260520, ins: '17765240' }).ok === true);
    check('نماد دیگر در همان تاریخ مجاز است',
      replayAllowed(history, { date: 20260521, ins: '99' }).ok === true);
    check('پرچم تمرینی بازی مجدد را باز می‌کند', (() => {
      const r = replayAllowed(history, { date: 20260521, ins: '17765240', practice: true });
      return r.ok === true && r.practice === true;
    })());

    // ——— خلاصه ———
    const sum = sessionSummary(s);
    check('خلاصهٔ جلسه شمار تصمیم و رویداد را می‌دهد',
      sum.decisions === 1 && sum.events === 1 && sum.inStats === true && sum.stateLabel === 'باز');
  }

  // ——— بازتولیدپذیری کامل ———
  check('اجرای دوبارهٔ همان زنجیره، همان جلسه را می‌سازد', (() => {
    const run = () => {
      let s = blankSession({ id: 'تکرار', start: { date: 20260521, second: 9 * 3600 } });
      s = recordView(s, { direction: 'down', confidence: 0.3, reason: 'اُفت حجم' }).session;
      s = recordCandidates(s, [{ id: 'a' }, { id: 'b' }]).session;
      s = chooseCandidates(s, [{ id: 'a', size: 2 }]).session;
      s = lockExpectation(s, { text: 'کاهش' }).session;
      s = advanceTo(s, { date: 20260521, second: 11 * 3600 }).session;
      return JSON.stringify(s);
    };
    return run() === run();
  })());
  // ——— شناسهٔ جلسه، که مستقیم نام فایل می‌شود ———
  check('شناسهٔ سالم پذیرفته می‌شود',
    validSessionId('b-2026-05-21_x9') && validSessionId('A1'));
  check('شناسه با جداکنندهٔ مسیر رد می‌شود',
    !validSessionId('../x') && !validSessionId('a/b') && !validSessionId('a\\b') && !validSessionId('a.b'));
  check('شناسهٔ خالی یا خیلی بلند رد می‌شود',
    !validSessionId('') && !validSessionId('a'.repeat(65)) && !validSessionId(null));

  check('توابع جلسه، جلسهٔ ورودی را عوض نمی‌کنند', (() => {
    const s = blankSession({ id: 'x', start: { date: 20260521, second: 9 * 3600 } });
    const before = JSON.stringify(s);
    recordView(s, { direction: 'up', reason: 'چیزی' });
    recordEvent(s, { kind: 'k' });
    return JSON.stringify(s) === before;
  })());
}
