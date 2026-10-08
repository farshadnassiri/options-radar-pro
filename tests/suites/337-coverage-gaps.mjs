// ۳۳۷. پوشش داده: معامله نشده، داده نرسید، یا پس از سررسید؟ (۱۴۰۵/۰۷/۱۶)
//
// پرسش صاحب پروژه: «در پوشش داده، دیتا نرسیده به برنامه یا واقعاً معامله
// نشده؟» عددِ پوشش این‌ها را یکی می‌شمرد. حالا هر خانهٔ خالی علت دارد.

import { check, group, readSrc } from '../harness.mjs';
import { GAP, gapCodes, buildPnlMatrix, gapTally, selectMatrixRows } from '../../core/portfolio-matrix.mjs';

group('۳۳۷. علتِ هر روزِ خالیِ بازپخش');
{
  const replay = {
    endDate: 20261010,
    priced: [{ ins: 'C1' }, { ins: 'P1' }],
    rows: [
      { date: 20261001, status: 'ok' },
      { date: 20261002, status: 'missing', missingLegs: [1] },
      { date: 20261005, status: 'missing', missingLegs: [0] },
      { date: 20261010, status: 'missing', missingLegs: [1] },
    ],
  };
  const plain = gapCodes(replay, { requestedEnd: 20261010 });
  check('پای بی ردیفِ قیمت‌دار، «معامله نشده» است', plain.gaps.every(([, code]) => code === GAP.untraded) && plain.gaps.length === 3);
  const withErr = gapCodes(replay, { errors: { C1: 'HTTP 500' }, requestedEnd: 20261010 });
  check('پایی که تاریخچه‌اش نرسید، «داده نرسید» است — نه «معامله نشده»',
    withErr.gaps.find(([d]) => d === 20261005)[1] === GAP.failed && withErr.gaps.find(([d]) => d === 20261002)[1] === GAP.untraded);
  const tape = gapCodes(replay, { tapeErrors: { P1: 'empty-both' }, markDate: 20261010, requestedEnd: 20261010 });
  check('ریزمعاملهٔ نرسیده فقط روزِ سنجش را «داده نرسید» می‌کند',
    tape.gaps.find(([d]) => d === 20261010)[1] === GAP.failed && tape.gaps.find(([d]) => d === 20261002)[1] === GAP.untraded);
  check('بازپخشی که پیش از پایانِ خواسته (روزِ سررسید) تمام شد، پس از آن را «پس از سررسید» می‌داند',
    gapCodes({ ...replay, endDate: 20261008 }, { requestedEnd: 20261015 }).expiredAfter === 20261008
    && gapCodes(replay, { requestedEnd: 20261010 }).expiredAfter === null);
}

group('۳۳۷. ماتریسِ علت کنارِ ماتریسِ سود');
{
  const rows = [
    { path: { daily: [{ date: 1, netPnl: 10 }, { date: 3, netPnl: 12 }], gaps: [[2, GAP.untraded]], expiredAfter: null } },
    { path: { daily: [{ date: 1, netPnl: 5 }], gaps: [[2, GAP.failed]], expiredAfter: 2 } },
  ];
  const m = buildPnlMatrix(rows, { calendar: [1, 2, 3, 4] });
  const cell = (r, d) => m.gaps[r * m.dates.length + m.dates.indexOf(d)];
  check('خانهٔ پر علت ندارد', cell(0, 1) === GAP.none && cell(0, 3) === GAP.none);
  check('هر خانهٔ خالی علتِ خودش را دارد', cell(0, 2) === GAP.untraded && cell(1, 2) === GAP.failed && cell(1, 3) === GAP.expired && cell(1, 4) === GAP.expired);
  check('روزِ بی علتِ ثبت‌شده «نامعلوم» می‌ماند، نه ساختگی', cell(0, 4) === GAP.none);

  const t = gapTally(m, [0, 1], [0, 1, 2, 3]);
  check('شمارش: پر + علت‌ها = همهٔ خانه‌ها', t.possible === 8 && t.observed === 3 && t.untraded === 1 && t.failed === 1 && t.expired === 2 && t.none === 1
    && t.observed + t.untraded + t.failed + t.expired + t.none === t.possible);
  const sub = selectMatrixRows(m, [1]);
  check('زیرمجموعه‌ی ردیف‌ها علت را هم با خود می‌برد', sub.gaps.length === 4 && sub.gaps[1] === GAP.failed && sub.gaps[3] === GAP.expired);
  check('ماتریسِ قدیمیِ بی علت هم کار می‌کند', gapTally({ dates: [1, 2], pnl: [NaN, 1] }, [0], [0, 1]).none === 1);
}

group('۳۳۷. سیم‌کشی');
{
  const worker = readSrc('../worker/history-worker.mjs');
  const pb = readSrc('../ui/tabs/portfolio-backtest.mjs');
  const report = readSrc('../core/portfolio-report.mjs');
  check('ریسه علت را برای هر ترکیب می‌سازد و با ماتریس می‌فرستد',
    worker.includes('gapCodes(replay, { errors: m.errors, tapeErrors: m.tapeErrors, markDate: m.markDate, requestedEnd: m.endDate })')
    && worker.includes('[matrix.pnl.buffer, matrix.gaps.buffer]'));
  check('رابط خطای تاریخچه و ریزمعامله را به ریسه می‌دهد',
    pb.includes("errors: seriesErrors, tapeErrors: runTapeErrors, markDate: Number($('pb-mark').value) ? endDate : 0,"));
  check('گزارش برای هر استراتژی سهمِ هر علت را می‌دهد', report.includes('const gap = gapTally(matrix, members.map((combo) => combo.index), columns);') && report.includes('samples: members.length, wins, losses, coverageGaps,'));
  check('جدول رتبه‌بندی علت‌ها را زیرِ پوشش می‌نویسد، با «،»',
    pb.includes('${pctCell(row.metrics.coverage)}${coverageNote(row.coverageGaps)}') && pb.includes("parts.join('، ')"));
}
