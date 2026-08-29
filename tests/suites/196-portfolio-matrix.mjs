// ۱۹۶. ماتریس سود و زیان — صفر مشاهده است، نبود داده نیست

import { check, group } from '../harness.mjs';
import { buildPnlMatrix, columnsInRange, matrixRow } from '../../core/portfolio-matrix.mjs';

group('۱۹۶. ماتریس سود و زیان');
{
  const rows196 = [
    { path: { daily: [{ date: 20260801, netPnl: 10 }, { date: 20260803, netPnl: 0 }] } },
    { path: { daily: [{ date: 20260802, netPnl: -5 }] } },
  ];
  const mx196 = buildPnlMatrix(rows196);
  check('ستون‌ها اجتماع مرتب روزهای دیده‌شده‌اند',
    JSON.stringify(mx196.dates) === JSON.stringify([20260801, 20260802, 20260803]),
    JSON.stringify(mx196.dates));
  check('شمار سطرها همان شمار ردیف‌هاست', mx196.rowCount === 2);
  check('ماتریس هم‌اندازهٔ سطر در ستون است', mx196.pnl.length === 6);

  const first196 = matrixRow(mx196, 0);
  check('سود صفرِ ثبت‌شده صفر می‌ماند، نه نامعلوم', first196[2] === 0, JSON.stringify(first196));
  check('روزِ بی‌مشاهده نامعلوم می‌ماند، نه صفر', first196[1] === null, JSON.stringify(first196));
  check('سطر دوم فقط روز خودش را دارد',
    JSON.stringify(matrixRow(mx196, 1)) === JSON.stringify([null, -5, null]));

  // ── همان تلهٔ همیشگی ────────────────────────────────────────────────
  const trap196 = buildPnlMatrix([
    { path: { daily: [{ date: null, netPnl: 5 }, { date: 20260801, netPnl: null }, { date: 20260801, netPnl: 7 }] } },
  ]);
  check('روز بدون تاریخ، «روز صفر» نمی‌سازد',
    JSON.stringify(trap196.dates) === JSON.stringify([20260801]), JSON.stringify(trap196.dates));
  check('سود null خانه را پر نمی‌کند، ولی سود بعدی همان روز می‌نشیند',
    matrixRow(trap196, 0)[0] === 7);
  for (const [label, value] of [['رشتهٔ خالی', ''], ['بولین', true]]) {
    const junk196 = buildPnlMatrix([{ path: { daily: [{ date: 20260801, netPnl: value }] } }]);
    check(`سود ${label} مشاهده شمرده نمی‌شود`, junk196.dates.length === 0);
  }

  check('ردیف بدون مسیر، ماتریس را نمی‌شکند', buildPnlMatrix([{}]).dates.length === 0);
  check('فهرست خالی ماتریس خالی می‌دهد', buildPnlMatrix([]).rowCount === 0);
  check('ورودی نامعتبر ماتریس خالی می‌دهد', buildPnlMatrix(null).dates.length === 0);
  check('سطر بیرون از دامنه، آرایهٔ خالی می‌دهد', matrixRow(mx196, 9).length === 0);
  check('سطر منفی، آرایهٔ خالی می‌دهد', matrixRow(mx196, -1).length === 0);

  // ── بازه ────────────────────────────────────────────────────────────
  check('بازهٔ بسته فقط ستون‌های داخل خودش را می‌دهد',
    JSON.stringify(columnsInRange(mx196.dates, 20260802, 20260803)) === JSON.stringify([1, 2]));
  check('بازهٔ باز از چپ یعنی از اول', columnsInRange(mx196.dates, null, 20260802).length === 2);
  check('بازهٔ باز از راست یعنی تا آخر', columnsInRange(mx196.dates, 20260802, null).length === 2);
  check('بازهٔ کاملاً باز همهٔ ستون‌هاست', columnsInRange(mx196.dates).length === 3);
  check('بازهٔ بیرون از داده، ستونی نمی‌دهد',
    columnsInRange(mx196.dates, 20270101, 20270102).length === 0);
}
