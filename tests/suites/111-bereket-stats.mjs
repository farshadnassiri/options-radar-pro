// ۱۱۰. گزارش پایان جلسه و داشبورد تجمیعی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { moneynessPct } from '../../core/bereket-anon.mjs';
import {
  buyHoldBenchmark, excessOver, forecastAccuracy, peerBenchmark, positionReturnPct, sessionReport, sessionTimeline,
} from '../../core/bereket-report.mjs';
import { advanceTo, blankSession, recordEvent, recordView } from '../../core/bereket-session.mjs';
import {
  MIN_SAMPLE, SLICES, SLICE_BY_KEY, calibration, confidenceBucket, dteBucket, groupStats, headlineMetrics, moneynessBucket, sampleNote, sliceSessions,
} from '../../core/bereket-stats.mjs';


// ═══════════════════ ۱۱۰. گزارش پایان جلسه و داشبورد تجمیعی ═══════════════════
//
// مهم‌ترین جملهٔ کل مشخصات اینجاست: بدون معیار مقایسه، در بازاری با روند
// اسمی بزرگ همه‌چیز سودده به‌نظر می‌رسد و سیستم یاد می‌گیرد «همیشه کال
// بخر». پس این گروه بیش از هر چیز، **اجباری بودن** معیار را می‌سنجد.
group('۱۱۰. گزارش پایان جلسه و داشبورد تجمیعی');
{
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const baseRows = [
    { date: 20260501, close: 10_000 }, { date: 20260505, close: 10_200 },
    { date: 20260510, close: 10_600 }, { date: 20260515, close: 10_900 },
  ];

  // ——— نگهداری ساده ———
  {
    const hold = buyHoldBenchmark({ rows: baseRows, from: 20260501, to: 20260510, fees });
    check('نگهداری ساده از دو سر بازه حساب می‌شود',
      hold.ok && hold.openPrice === 10_000 && hold.closePrice === 10_600);
    check('بازده ناخالص نگهداری درست است', Math.abs(hold.grossPct - 6) < 1e-9);
    check('کارمزد خرید و فروش شمرده می‌شود، پس خالص کمتر از ناخالص است',
      hold.netPct < hold.grossPct);
    check('تاریخِ بیرون از سری، معیار نمی‌سازد',
      buyHoldBenchmark({ rows: baseRows, from: 20260520, to: 20260530, fees }).ok === false);
    check('یک قیمت به‌تنهایی معیار نیست',
      buyHoldBenchmark({ rows: [baseRows[0]], from: 20260501, to: 20260510, fees }).ok === false);
  }

  // ——— مازاد ———
  check('مازاد تفریق است نه نسبت', Math.abs(excessOver(12, 4.68) - 7.32) < 1e-9);
  check('مازاد با عدد ناموجود ساخته نمی‌شود',
    Number.isNaN(excessOver(12, NaN)) && Number.isNaN(excessOver(NaN, 4)));
  check('بازده موقعیت بر مخرج سرمایه است',
    Math.abs(positionReturnPct({ netPnl: 120_000, capital: 1_000_000 }) - 12) < 1e-9);
  check('مخرج صفر، بازده نمی‌سازد',
    Number.isNaN(positionReturnPct({ netPnl: 120_000, capital: 0 })));

  // ——— همان ساختار روی نمادهای دیگر ———
  {
    const peer = peerBenchmark([
      { ins: 'a', returnPct: 4 }, { ins: 'b', returnPct: -6 }, { ins: 'c', returnPct: 14 },
    ]);
    check('معیار همتا میانگین و نرخ برد می‌دهد',
      peer.ok && Math.abs(peer.meanPct - 4) < 1e-9 && peer.count === 3 && peer.winners === 2);
    check('بهترین و بدترین همتا گزارش می‌شود', peer.best === 14 && peer.worst === -6);
    check('بدون همتا، ادعایی نمی‌شود', peerBenchmark([]).ok === false);
  }

  // ——— دقت پیش‌بینی ———
  check('جهت درست، درست علامت می‌خورد',
    forecastAccuracy({ view: { direction: 'up', movePct: 8 }, actualMovePct: 6 }).hit === true);
  check('جهت غلط، غلط علامت می‌خورد',
    forecastAccuracy({ view: { direction: 'up', movePct: 8 }, actualMovePct: -3 }).hit === false);
  check('نظر خنثی وقتی درست است که حرکتی نباشد',
    forecastAccuracy({ view: { direction: 'flat' }, actualMovePct: 0.01 }).hit === true
    && forecastAccuracy({ view: { direction: 'flat' }, actualMovePct: 5 }).hit === false);
  check('نظر پرنوسان با بزرگی حرکت سنجیده می‌شود نه جهتش',
    forecastAccuracy({ view: { direction: 'volatile', movePct: 5 }, actualMovePct: -9 }).hit === true
    && forecastAccuracy({ view: { direction: 'volatile', movePct: 5 }, actualMovePct: -2 }).hit === false);
  check('خطای بزرگی جدا از جهت گزارش می‌شود',
    Math.abs(forecastAccuracy({ view: { direction: 'up', movePct: 8 }, actualMovePct: 6 }).magnitudeError + 2) < 1e-9);
  check('بدون حرکت واقعی، دقتی ادعا نمی‌شود',
    forecastAccuracy({ view: { direction: 'up' }, actualMovePct: NaN }).ok === false);
  check('جملهٔ دقت رقم لاتین ندارد',
    /^[^0-9]*$/.test(forecastAccuracy({ view: { direction: 'up', movePct: 8 }, actualMovePct: 6.5 }).note));

  // ═══ ادعای اصلی: گزارش بدون هر دو معیار کامل نیست ═══
  {
    let session = blankSession({ id: 'گ', start: { date: 20260501, second: 9 * 3600 } });
    session = recordView(session, { direction: 'up', movePct: 8, confidence: 0.6, horizonDays: 10, reason: 'حمایت' }).session;
    session = advanceTo({ ...session, decisions: session.decisions.map((d) => ({ ...d, chosen: [] })) },
      { date: 20260510, second: 12 * 3600 }).session;

    const full = sessionReport({
      session, netPnl: 120_000, capital: 1_000_000,
      baseRows, fees, peers: [{ ins: 'a', returnPct: 4 }, { ins: 'b', returnPct: -6 }],
      actualMovePct: 6,
    });
    check('گزارش با هر دو معیار کامل است', full.ok === true);
    check('جملهٔ سرخط از مازاد شروع می‌شود، نه از بازده مطلق',
      full.headline.startsWith('مازاد'));
    check('هر دو مازاد حساب می‌شوند',
      Number.isFinite(full.excessBuyHold) && Number.isFinite(full.excessPeer));

    const halfOnly = sessionReport({
      session, netPnl: 120_000, capital: 1_000_000, baseRows, fees, peers: [], actualMovePct: 6,
    });
    check('نیم‌معیار هم معیار نیست — گزارش ناقص اعلام می‌شود',
      halfOnly.ok === false && halfOnly.headline.includes('کامل نیست') && halfOnly.why.length > 0);
    const noBase = sessionReport({
      session, netPnl: 120_000, capital: 1_000_000, baseRows: [], fees,
      peers: [{ ins: 'a', returnPct: 4 }], actualMovePct: 6,
    });
    check('نبودن نگهداری ساده هم گزارش را ناقص می‌کند', noBase.ok === false);

    check('سود همراه با عقب‌ماندن از نگهداری، هشدار می‌گیرد', (() => {
      const behind = sessionReport({
        session, netPnl: 10_000, capital: 1_000_000, baseRows, fees,
        peers: [{ ins: 'a', returnPct: 1 }], actualMovePct: 6,
      });
      return behind.returnPct > 0 && behind.excessBuyHold < 0 && behind.warning.includes('خودفریبی');
    })());

    // ——— خط زمانی ———
    const line = sessionReport({ session, baseRows, fees, peers: [], netPnl: 0, capital: 1 }).timeline;
    check('خط زمانی تصمیم و رویداد را با هم و مرتب می‌دهد',
      line.length > 0 && line.every((row, at) => at === 0
        || (row.at.date * 100000 + row.at.second) >= (line[at - 1].at.date * 100000 + line[at - 1].at.second)));
    check('متن دلیل کاربر در خط زمانی می‌ماند',
      line.some((row) => row.reason === 'حمایت'));
    check('برچسب رویداد در خط زمانی فارسی است، نه کلید انگلیسی', (() => {
      const withEvent = recordEvent(session, { kind: 'marginCall', detail: 'کسری' }).session;
      const rows = sessionTimeline(withEvent);
      const hit = rows.find((row) => row.kind === 'marginCall');
      return hit?.label === 'کال مارجین' && !/[A-Za-z]/.test(hit.label);
    })());
    check('برچسب «موقعیت باز شد» هم ترجمه دارد', (() => {
      const opened = recordEvent(session, { kind: 'open', detail: 'x' }).session;
      return sessionTimeline(opened).some((row) => row.label === 'موقعیت باز شد');
    })());
  }

  // ——— داشبورد تجمیعی ———
  {
    const rows = [];
    for (let at = 0; at < 24; at += 1) {
      rows.push({
        defName: at % 2 ? 'Long Call' : 'Bull Call Spread',
        regime: at % 3 === 0 ? 'up' : at % 3 === 1 ? 'down' : 'flat',
        daysToExpiry: 5 + at, moneynessPct: at - 12, ivPercentile: at * 4,
        confidence: at < 8 ? 0.3 : at < 16 ? 0.55 : 0.85,
        holdDays: 1 + at, excessBuyHoldPct: at - 10, returnPct: at - 8,
        forecastHit: at % 3 !== 0, myRank: 1 + (at % 5), candidateCount: 8,
        state: at === 5 ? 'abandoned' : 'closed',
        manualStart: at === 2, practice: at === 23,
      });
    }

    check('جلسهٔ تمرینی وارد آمار نمی‌شود', (() => {
      const s = sliceSessions(rows, 'structure');
      return s.excluded === 1 && s.total === 23;
    })());
    check('جلسهٔ رهاشده وارد می‌شود و جدا شمرده می‌شود', (() => {
      const s = sliceSessions(rows, 'structure');
      return s.groups.reduce((sum, g) => sum + g.abandoned, 0) === 1;
    })());
    check('همهٔ برش‌های سند موجودند',
      SLICES.length === 7 && ['structure', 'regime', 'dte', 'moneyness', 'ivPercentile', 'confidence', 'horizon']
        .every((key) => !!SLICE_BY_KEY[key]));
    check('برش ناشناخته گروهی نمی‌سازد', sliceSessions(rows, 'nope').ok === false);
    check('سطل‌بندی روز مانده یک تعریف دارد',
      dteBucket(3) === 'تا ۷ روز' && dteBucket(30) === '۲۲ تا ۴۵ روز' && dteBucket(NaN) === 'نامعلوم');
    check('سطل‌بندی فاصله از اعمال، باارزش و بی‌ارزش را جدا می‌کند',
      moneynessBucket(-15) === 'عمیقاً باارزش' && moneynessBucket(0) === 'روی پایه'
      && moneynessBucket(20) === 'عمیقاً بی‌ارزش');
    check('اطمینان هم به کسر و هم به درصد فهمیده می‌شود',
      confidenceBucket(0.85) === confidenceBucket(85));

    check('مازاد پیش از بازده مطلق گزارش می‌شود', (() => {
      const g = groupStats(rows.filter((row) => !row.practice));
      return Number.isFinite(g.excessMeanPct) && Number.isFinite(g.returnMeanPct)
        && Object.keys(g).indexOf('excessMeanPct') < Object.keys(g).indexOf('returnMeanPct');
    })());
    check('دقت پیش‌بینی جدا از نتیجهٔ مالی حساب می‌شود', (() => {
      const g = groupStats(rows.filter((row) => !row.practice));
      return Number.isFinite(g.forecastAccuracyPct) && g.forecastGraded === 23
        && Math.abs(g.forecastAccuracyPct - g.winRatePct) > 1;
    })());

    // ═══ ادعای اصلی دوم: نمونهٔ ناکافی همیشه برچسب می‌خورد ═══
    check('گروه کوچک، «نمونه ناکافی» می‌گیرد', (() => {
      const small = groupStats(rows.slice(0, 3));
      return small.enough === false && sampleNote(small).includes('نمونه ناکافی');
    })());
    check('برچسب، عدد را حذف نمی‌کند بلکه کنارش می‌نشیند', (() => {
      const small = groupStats(rows.slice(0, 3));
      return Number.isFinite(small.excessMeanPct) && small.count === 3 && small.needed === MIN_SAMPLE;
    })());
    check('گروه بزرگ برچسب ناکافی نمی‌گیرد', (() => {
      const big = groupStats(rows.filter((row) => !row.practice));
      return big.enough === true && sampleNote(big).includes('از آستانهٔ معناداری گذشته');
    })());
    check('جملهٔ نمونه رقم لاتین ندارد',
      /^[^0-9]*$/.test(sampleNote(groupStats(rows.slice(0, 3)))));

    // ——— کالیبراسیون ———
    {
      const calib = calibration(rows);
      check('کالیبراسیون سه سطل اطمینان دارد', calib.points.length === 3);
      check('سطل کم‌جمعیت، کافی علامت نمی‌خورد',
        calib.points.every((point) => point.enough === (point.count >= MIN_SAMPLE)));
      check('بدون سطل کافی، شکاف ادعا نمی‌شود',
        Number.isNaN(calib.gapPp) && calib.note.includes('جلسهٔ کافی'));
      check('کالیبراسیون با آستانهٔ پایین، شکاف می‌سازد', (() => {
        const loose = calibration(rows, { minSample: 3 });
        return Number.isFinite(loose.gapPp) && loose.note.length > 0;
      })());
      check('بیش‌اعتمادی و کم‌اعتمادی دو جملهٔ متفاوت دارند', (() => {
        const over = calibration(rows.map((row) => ({ ...row, confidence: 0.9, forecastHit: false })), { minSample: 2 });
        const under = calibration(rows.map((row) => ({ ...row, confidence: 0.2, forecastHit: true })), { minSample: 2 });
        return over.note.includes('بیش‌اعتمادی') && under.note.includes('کم‌اعتمادی');
      })());
    }

    check('دو معیار کلیدی روی کل مجموعه می‌آیند', (() => {
      const head = headlineMetrics(rows);
      return Number.isFinite(head.forecastAccuracyPct) && Number.isFinite(head.meanRank)
        && head.selectionNote.includes('رتبهٔ میانگین');
    })());
    check('جملهٔ کیفیت انتخاب رقم لاتین ندارد',
      /^[^0-9]*$/.test(headlineMetrics(rows).selectionNote));
    check('بدون رتبه، کیفیت انتخاب ادعا نمی‌شود',
      headlineMetrics(rows.map((row) => ({ ...row, myRank: NaN })))
        .selectionNote.includes('لازم است'));
  }
}
