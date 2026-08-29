// ۱۹۹. گزارش آزمون همه استراتژی‌ها — «بهترین» یک قضاوتِ دیدنی است

import { check, group, near } from '../harness.mjs';
import { buildPnlMatrix } from '../../core/portfolio-matrix.mjs';
import {
  DEFAULT_HEATMAP_MODE, DEFAULT_METRIC_WEIGHTS, HEATMAP_MODES, METRICS,
  analyzePortfolio, heatmapMeta, metricMeta, normalizeHeatmapMode,
} from '../../core/portfolio-report.mjs';

group('۱۹۹. گزارش آزمون همه استراتژی‌ها');
{
  const entry199 = {
    marginGross: 1000, netCash: 0, marginNet: 1000, capital: 1000, notional: 5000,
    legValue: 100, legValueComplete: true,
  };
  const combo199 = (id, strategyId, groupId, pnls, entry = entry199) => ({
    id, strategyId, strategyName: `استراتژی ${strategyId}`,
    groupId, groupName: `دستهٔ ${groupId}`, direction: 'خنثی', feasible: true,
    entry, path: { daily: pnls.map((value, index) => (value === null ? null : { date: 20260801 + index, netPnl: value })).filter(Boolean) },
  });

  const rows199 = [
    combo199('a1', 'A', 'g1', [10, 20, 30]),
    combo199('a2', 'A', 'g1', [0, -10, 40]),
    combo199('b1', 'B', 'g2', [5, 5, 5]),
  ];
  const mx199 = buildPnlMatrix(rows199);
  mx199.baseSeries = [0, 1, 2];
  const out199 = analyzePortfolio({ rows: rows199, matrix: mx199 });

  check('بازه از خود ماتریس گرفته می‌شود',
    out199.range.from === 20260801 && out199.range.to === 20260803 && out199.range.days === 3,
    JSON.stringify(out199.range));
  check('همهٔ ترکیب‌های دارای پایان معتبر شمرده می‌شوند', out199.usable === 3 && out199.unusable === 0);

  const a199 = out199.strategies.find((row) => row.strategyId === 'A');
  const b199 = out199.strategies.find((row) => row.strategyId === 'B');
  check('میانهٔ بازده هر استراتژی روی مبنای پیش‌فرض ساخته می‌شود',
    a199.metrics.return === 3.5 && b199.metrics.return === 0.5,
    `${a199.metrics.return} / ${b199.metrics.return}`);
  check('نرخ برد از شمار ترکیب‌های سبز می‌آید', a199.metrics.winPct === 100 && a199.wins === 2);
  check('پوشش داده، سهم روزهای دارای قیمت است', a199.metrics.coverage === 100);
  check('مازاد بر نماد پایه از مسیر خود سهم کم می‌شود',
    near(a199.metrics.excess, 1.5, 1e-9), String(a199.metrics.excess));

  // ── «بهترین» باید قابل بازرسی باشد ─────────────────────────────────
  check('نمرهٔ ترکیبی ساخته می‌شود و اجزایش دیده می‌شوند',
    a199.score !== null && a199.scoreParts.length > 0 && a199.scoreParts.every((part) => part.label && part.weight > 0));
  check('نمره از رتبهٔ درصدی می‌آید، نه از جمع خام سنجه‌ها',
    near(a199.score, 85, 1e-9) && near(b199.score, 18.75, 1e-9), `${a199.score} / ${b199.score}`);
  check('استراتژی فاقد یک سنجه، در آن سنجه صفر نمی‌گیرد',
    b199.metrics.painRatio === null && !b199.scoreParts.some((part) => part.id === 'painRatio'));
  check('سهم پوشش‌داده‌شدهٔ نمره گزارش می‌شود',
    a199.scoreCoverage === 100 && near(b199.scoreCoverage, 80, 1e-9), String(b199.scoreCoverage));
  check('بهترین و بدترین از همان نمره می‌آیند',
    out199.best.strategyId === 'A' && out199.worst.strategyId === 'B');
  check('رتبه روی همان ترتیب نمره نوشته می‌شود', a199.rank === 1 && b199.rank === 2);

  // ── وزن سنجه‌ها واقعاً قضاوت را عوض می‌کند ─────────────────────────
  const flipped199 = analyzePortfolio({
    rows: rows199, matrix: mx199,
    weights: { drawdown: 100 },
  });
  check('با وزن‌دادن به افت مسیر، برنده عوض می‌شود',
    flipped199.best.strategyId === 'B', flipped199.best.strategyId);
  check('وزن صریح، وزن‌های پیش‌فرض را کنار می‌گذارد',
    flipped199.weights.return === 0 && flipped199.weights.drawdown === 100);

  // ── مبنا و آماره و بازه ────────────────────────────────────────────
  const notional199 = analyzePortfolio({ rows: rows199, matrix: mx199, basisId: 'notional' });
  check('عوض‌کردن مبنا، بدون اجرای دوباره عدد را عوض می‌کند',
    near(notional199.strategies.find((row) => row.strategyId === 'A').metrics.return, 0.7, 1e-9),
    String(notional199.strategies.find((row) => row.strategyId === 'A').metrics.return));
  check('مبنای به‌کاررفته با برچسبش گزارش می‌شود',
    notional199.basisId === 'notional' && notional199.basis.label === 'ارزش اسمی قرارداد');

  const worst199 = analyzePortfolio({ rows: rows199, matrix: mx199, statistic: 'min' });
  check('آمارهٔ «کمترین» بدترین ترکیب دسته را می‌دهد',
    worst199.strategies.find((row) => row.strategyId === 'A').metrics.return === 3,
    String(worst199.strategies.find((row) => row.strategyId === 'A').metrics.return));
  check('برچسب آماره در خروجی می‌آید', worst199.statisticLabel === 'کمترین');

  const narrow199 = analyzePortfolio({ rows: rows199, matrix: mx199, from: 20260803, to: 20260803 });
  check('باریک‌کردن بازه فقط همان ستون را نگه می‌دارد',
    narrow199.range.days === 1 && narrow199.dates[0] === 20260803);
  check('بازده تجمعی در بازهٔ باریک همچنان از روز ورود است',
    narrow199.strategies.find((row) => row.strategyId === 'A').metrics.return === 3.5);

  // ── وزن‌دهی بر ارزش معامله ─────────────────────────────────────────
  const weighted199 = analyzePortfolio({
    rows: [
      combo199('a1', 'A', 'g1', [10, 20, 30], { ...entry199, legValue: 900 }),
      combo199('a2', 'A', 'g1', [0, -10, 40], { ...entry199, legValue: 100 }),
    ],
    matrix: (() => {
      const rows = [combo199('a1', 'A', 'g1', [10, 20, 30]), combo199('a2', 'A', 'g1', [0, -10, 40])];
      const built = buildPnlMatrix(rows); built.baseSeries = [0, 1, 2]; return built;
    })(),
    weighting: 'value',
  });
  // ترکیب پرمعامله بازده ۳ دارد و کم‌معامله ۴؛ هم‌وزن می‌شد ۳٫۵، وزن‌دار
  // ۳٫۱ — یعنی وزن، عدد را نُه‌دهم راه به‌سمت ترکیب پرمعامله برده است.
  check('وزن ارزش معامله، میانهٔ استراتژی را به ترکیب پرمعامله می‌چسباند',
    near(weighted199.strategies[0].metrics.return, 3.1, 1e-9), String(weighted199.strategies[0].metrics.return));
  check('همان دو ترکیب هم‌وزن، میانهٔ دیگری می‌دهند',
    near(analyzePortfolio({
      rows: [combo199('a1', 'A', 'g1', [10, 20, 30]), combo199('a2', 'A', 'g1', [0, -10, 40])],
      matrix: (() => {
        const built = buildPnlMatrix([combo199('a1', 'A', 'g1', [10, 20, 30]), combo199('a2', 'A', 'g1', [0, -10, 40])]);
        built.baseSeries = [0, 1, 2]; return built;
      })(),
    }).strategies[0].metrics.return, 3.5, 1e-9));
  check('حالت وزن‌دهی در خروجی گزارش می‌شود', weighted199.weighting === 'value');

  // ── مسیر روزانه و رتبهٔ روزانه ─────────────────────────────────────
  check('مسیر تجمعی هر استراتژی هم‌طول با ستون‌هاست',
    a199.path.cumulative.length === 3 && a199.path.rank.length === 3);
  check('رتبهٔ روزانه از مسیر تجمعی همان روز می‌آید',
    a199.path.rank[2] === 1 && b199.path.rank[2] === 2, JSON.stringify(a199.path.rank));
  check('نرخ برد روزانه جدا از نرخ برد پایان بازه ساخته می‌شود',
    a199.path.winPct[0] === 50, JSON.stringify(a199.path.winPct));
  check('شمار روزهای رتبهٔ نخست شمرده می‌شود', a199.topDays === 3, String(a199.topDays));

  // ── دسته‌ها ────────────────────────────────────────────────────────
  check('دسته‌ها با بهترین و بدترین عضوشان می‌آیند',
    out199.groups.length === 2 && out199.groups[0].bestStrategy.strategyId === 'A');
  check('دسته، شمار استراتژی‌ها و ترکیب‌هایش را جدا می‌شمارد',
    out199.groups[0].strategies === 1 && out199.groups[0].samples === 2);

  // ── نبود داده ──────────────────────────────────────────────────────
  const holed199 = analyzePortfolio({
    rows: [combo199('x', 'X', 'g3', [10, null, null])],
    matrix: (() => {
      const built = buildPnlMatrix([
        combo199('x', 'X', 'g3', [10]),
        combo199('y', 'Y', 'g3', [1, 2, 3]),
      ]);
      built.baseSeries = [0, 1, 2];
      return built;
    })(),
  });
  check('استراتژی کم‌داده حذف نمی‌شود، پوشش پایینش گزارش می‌شود',
    holed199.strategies.length === 1 && near(holed199.strategies[0].metrics.coverage, 100 / 3, 1e-9),
    String(holed199.strategies[0].metrics.coverage));

  const brokenBasis199 = analyzePortfolio({
    rows: [combo199('z', 'Z', 'g4', [10, 20], { ...entry199, marginGross: null, netCash: null })],
    matrix: (() => {
      const built = buildPnlMatrix([combo199('z', 'Z', 'g4', [10, 20])]);
      built.baseSeries = [0, 1];
      return built;
    })(),
  });
  check('ترکیب فاقد مخرج، از رتبه‌بندی بیرون می‌ماند و شمرده می‌شود',
    brokenBasis199.usable === 0 && brokenBasis199.unusable === 1 && brokenBasis199.strategies.length === 0);

  check('اجرای بدون ماتریس، گزارش خالی می‌دهد و نمی‌شکند',
    analyzePortfolio({}).strategies.length === 0);

  // ── قرارداد ماژول ──────────────────────────────────────────────────
  check('هر سنجه جهت و توضیح و وزن پیش‌فرض دارد',
    METRICS.length >= 10 && METRICS.every((row) => row.id && row.label && row.hint
      && (row.better === 'high' || row.better === 'low') && Number.isFinite(row.weight)));
  check('وزن‌های پیش‌فرض روی هم صد می‌شوند',
    Object.values(DEFAULT_METRIC_WEIGHTS).reduce((sum, value) => sum + value, 0) === 100,
    String(Object.values(DEFAULT_METRIC_WEIGHTS).reduce((sum, value) => sum + value, 0)));
  check('برچسب سنجه از خود ماژول می‌آید', metricMeta('painRatio').label === 'سود به درد');
  check('پنج حالت نقشهٔ حرارتی با توضیح تعریف شده',
    HEATMAP_MODES.length === 5 && HEATMAP_MODES.every((row) => row.id && row.label && row.hint));
  check('حالت پیش‌فرض نقشه، بازده تجمعی است', DEFAULT_HEATMAP_MODE === 'cumulative');
  check('حالت نامعتبر نقشه به پیش‌فرض برمی‌گردد', normalizeHeatmapMode('چرند') === 'cumulative');
  check('برچسب حالت نقشه از خود ماژول می‌آید', heatmapMeta('step').label === 'بازده همان روز');
}
