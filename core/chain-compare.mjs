// ————————————————————————————————————————————————————————————————
// مقایسهٔ یک قرارداد با هم‌زنجیره‌هایش
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۰۸): «هر قرارداد در زنجیره و در قیاس با سایر
// قراردادهای همان زنجیره سنجیده شود… اگر می‌خواهی بفروشیش بدانی قراردادهای
// دیگر زنجیره چه وضعی دارند، بهترند یا بدتر؟» و «رتبهٔ این نماد از نظر ارزش
// معامله، حجم، موقعیت باز، خوش‌معاملگی، گرانی و ارزانی چند است.»
//
// تصمیم‌های گرفته‌شده با صاحب پروژه:
//   - گروه مقایسه قابل انتخاب؛ پیش‌فرض «هم‌سررسید و هم‌نوع».
//   - دیدگاه خرید/فروش با کاربر؛ «بهتر/بدتر» هر سنجه با همان جهت.
//
// این ماژول خالص است: هیچ درخواستی نمی‌زند و هیچ عددی نمی‌سازد که در ردیف‌ها
// نباشد. سنجهٔ نامعلوم رتبه نمی‌گیرد و در میانگین نمی‌نشیند — صفر نمی‌شود.
// ————————————————————————————————————————————————————————————————

import { numOrNaN } from './num.mjs';
import { contractAnalytics, breakevenGapPct } from './decision-dashboard.mjs';

export const PEER_MODES = Object.freeze([
  ['expiry-kind', 'هم‌سررسید و هم‌نوع'],
  ['ua-kind', 'همهٔ سررسیدها، هم‌نوع'],
  ['expiry-both', 'هم‌سررسید، کال و پوت'],
]);

export const PERSPECTIVES = Object.freeze([
  ['buy', 'می‌خواهم بخرم'],
  ['sell', 'می‌خواهم بفروشم (بنویسم یا ببندم)'],
]);

export const METRIC_GROUPS = Object.freeze([
  ['liquidity', 'نقدشوندگی و خوش‌معاملگی'],
  ['valuation', 'گرانی و ارزانی'],
  ['risk', 'ریسک و یونانی‌ها'],
]);

/**
 * کاتالوگ سنجه‌ها.
 *
 * `dir[perspective]`: `high` یعنی بزرگ‌تر بهتر، `low` کوچک‌تر بهتر، `null`
 * یعنی خنثی — رتبه دارد ولی حکم «بهتر/بدتر» نمی‌گیرد و در امتیاز نمی‌نشیند.
 *
 * چرا جهت‌ها این‌اند:
 *   - خریدار تلاطم و ارزش زمانی **ارزان** می‌خواهد؛ فروشنده (نویسنده یا
 *     بستن خرید) **گران** — همان پریمیوم را می‌گیرد.
 *   - «فاصله از منحنی لبخند» گرانی نسبی است: IV بالاتر از منحنیِ برازش‌شدهٔ
 *     همان سررسید یعنی نسبت به همسایه‌هایش گران.
 *   - عمق سمت اجرا: خریدار روی عرضه می‌خرد، فروشنده روی تقاضا می‌فروشد.
 *   - احتمال در سود و فاصله تا سربه‌سر از دید نویسنده برعکس خریدار است.
 */
export const COMPARE_METRICS = Object.freeze([
  { key: 'value', label: 'ارزش معامله', fmt: 'rialText', group: 'liquidity', dir: { buy: 'high', sell: 'high' } },
  { key: 'volume', label: 'حجم (قرارداد)', fmt: 'int', group: 'liquidity', dir: { buy: 'high', sell: 'high' } },
  { key: 'trades', label: 'تعداد معامله', fmt: 'int', group: 'liquidity', dir: { buy: 'high', sell: 'high' } },
  { key: 'oi', label: 'موقعیت باز (قرارداد)', fmt: 'int', group: 'liquidity', dir: { buy: 'high', sell: 'high' } },
  { key: 'oiChange', label: 'تغییر موقعیت باز', fmt: 'int', group: 'liquidity', dir: { buy: null, sell: null } },
  { key: 'spreadPct', label: 'فاصلهٔ مظنه ٪', fmt: 'pct', group: 'liquidity', dir: { buy: 'low', sell: 'low' } },
  { key: 'execQty', label: 'عمق سمت اجرا (سطح اول)', fmt: 'int', group: 'liquidity', dir: { buy: 'high', sell: 'high' } },
  { key: 'turnoverRatio', label: 'گردش به موقعیت باز', fmt: 'num', group: 'liquidity', dir: { buy: 'high', sell: 'high' } },
  { key: 'ivResidualPct', label: 'فاصله از منحنی لبخند (واحد IV)', fmt: 'num', group: 'valuation', dir: { buy: 'low', sell: 'high' } },
  { key: 'ivMidPct', label: 'تلاطم ضمنی میانهٔ مظنه ٪', fmt: 'pct', group: 'valuation', dir: { buy: 'low', sell: 'high' } },
  { key: 'ivPct', label: 'تلاطم ضمنی آخرین معامله ٪', fmt: 'pct', group: 'valuation', dir: { buy: 'low', sell: 'high' } },
  { key: 'timeValueAnnualPct', label: 'ارزش زمانی سالانه ٪ قیمت پایه', fmt: 'pct', group: 'valuation', dir: { buy: 'low', sell: 'high' } },
  { key: 'timeDecayPctPerDay', label: 'فرسایش روزانه ٪ پریمیوم', fmt: 'pct', group: 'valuation', dir: { buy: 'low', sell: 'high' } },
  { key: 'premiumPctSpot', label: 'پریمیوم ٪ قیمت پایه', fmt: 'pct', group: 'valuation', dir: { buy: null, sell: null } },
  { key: 'changePct', label: 'تغییر امروز ٪', fmt: 'pct', group: 'valuation', dir: { buy: null, sell: null } },
  { key: 'probItmPct', label: 'احتمال در سود بودن ٪', fmt: 'pct', group: 'risk', dir: { buy: 'high', sell: 'low' } },
  { key: 'breakevenGapPct', label: 'فاصله تا سربه‌سر ٪', fmt: 'pct', group: 'risk', dir: { buy: 'low', sell: 'high' } },
  { key: 'effectiveLeverage', label: 'اهرم مؤثر', fmt: 'num', group: 'risk', dir: { buy: 'high', sell: null } },
  { key: 'gamma', label: 'گاما', fmt: 'small', group: 'risk', dir: { buy: 'high', sell: 'low' } },
  { key: 'theta', label: 'تتا', fmt: 'num', group: 'risk', dir: { buy: 'high', sell: 'low' } },
  { key: 'delta', label: 'دلتا', fmt: 'num', group: 'risk', dir: { buy: null, sell: null } },
  { key: 'vega', label: 'وگا', fmt: 'num', group: 'risk', dir: { buy: null, sell: null } },
]);

const METRIC_BY_KEY = new Map(COMPARE_METRICS.map((m) => [m.key, m]));
export const compareMetric = (key) => METRIC_BY_KEY.get(key) || null;

const pick = (list, value, fallback) => (list.some(([key]) => key === value) ? value : fallback);
export const peerModeOf = (value) => pick(PEER_MODES, value, 'expiry-kind');
export const perspectiveOf = (value) => pick(PERSPECTIVES, value, 'buy');

/** هم‌زنجیره‌های یک قرارداد، شامل خودش. ترتیب: سررسید، بعد قیمت اعمال. */
export function peerGroup(contracts = [], focus = null, mode = 'expiry-kind') {
  if (!focus) return [];
  const m = peerModeOf(mode);
  const ua = String(focus.uaIns), end = String(focus.endDate), kind = focus.kind;
  return (contracts || [])
    .filter((row) => String(row.uaIns) === ua)
    .filter((row) => (m === 'ua-kind' ? true : String(row.endDate) === end))
    .filter((row) => (m === 'expiry-both' ? true : row.kind === kind))
    .slice()
    .sort((a, b) => Number(a.endDate) - Number(b.endDate) || Number(a.strike) - Number(b.strike)
      || String(a.kind).localeCompare(String(b.kind)));
}

/**
 * برازش منحنی لبخند: IV بر حسب لگاریتمِ نسبت اعمال به قیمت پایه.
 *
 * درجهٔ دو با کمترین مربعات اگر دست‌کم چهار نقطه باشد، خطی با دو یا سه نقطه،
 * و هیچ با کمتر. منحنی فقط **درون یک سررسید** معنا دارد — ترکیب دو سررسید،
 * ساختار زمانی را با لبخند قاطی می‌کند — پس فراخوان باید گروه‌بندی کند.
 */
export function fitSmile(points = []) {
  const pts = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return null;
  const degree = pts.length >= 4 ? 2 : 1;
  const size = degree + 1;
  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const B = new Array(size).fill(0);
  // وزن اختیاری (مثلاً وگا، در میز تلاطم): بی `w` هر نقطه وزن یک دارد و
  // برازش دقیقاً همان کمترین مربعاتِ پیشین است.
  for (const { x, y, w } of pts) {
    const weight = Number.isFinite(w) && w > 0 ? w : 1;
    const pow = Array.from({ length: size }, (_, i) => x ** i);
    for (let i = 0; i < size; i++) {
      B[i] += weight * pow[i] * y;
      for (let j = 0; j < size; j++) A[i][j] += weight * pow[i] * pow[j];
    }
  }
  const coef = solve(A, B);
  if (!coef) return null;
  return { degree, coef, at: (x) => coef.reduce((sum, c, i) => sum + c * x ** i, 0), n: pts.length };
}

function solve(A, B) {
  const n = B.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** IV مرجعِ لبخند: میانهٔ مظنه اگر هست (قابل اجرا)، وگرنه آخرین معامله. */
const smileIv = (row) => {
  const mid = numOrNaN(row.ivMidPct);
  return Number.isFinite(mid) ? mid : numOrNaN(row.ivPct);
};
const smileX = (row) => {
  const k = numOrNaN(row.strike), s = numOrNaN(row.spot);
  return k > 0 && s > 0 ? Math.log(k / s) : NaN;
};

/**
 * ردیف‌های هم‌زنجیره، با سنجه‌های مشتق.
 *
 * یونانی‌ها از `contractAnalytics` — همان مسیری که بقیهٔ داشبورد می‌رود — تا
 * دلتای این تب با جدول‌های دیگر یکی باشد. فاصله از لبخند برای هر سررسید
 * جدا برازش می‌شود.
 */
export function enrichPeers(peers = [], { perspective = 'buy', params = {} } = {}) {
  const side = perspectiveOf(perspective);
  const rows = (peers || []).map((row) => {
    const a = contractAnalytics(row, params);
    return {
      ...row, ...a,
      breakevenGapPct: breakevenGapPct(row),
      execQty: numOrNaN(side === 'buy' ? row.askQty : row.bidQty),
      turnoverRatio: numOrNaN(a.turnoverRatio),
      smileX: smileX(row), smileIvPct: smileIv(row),
    };
  });
  const fits = new Map();
  for (const end of new Set(rows.map((row) => `${row.endDate}:${row.kind}`))) {
    const list = rows.filter((row) => `${row.endDate}:${row.kind}` === end);
    fits.set(end, fitSmile(list.map((row) => ({ x: row.smileX, y: row.smileIvPct }))));
  }
  return rows.map((row) => {
    const fit = fits.get(`${row.endDate}:${row.kind}`);
    const fitted = fit && Number.isFinite(row.smileX) ? fit.at(row.smileX) : NaN;
    return {
      ...row,
      ivFitPct: fitted,
      ivResidualPct: Number.isFinite(fitted) && Number.isFinite(row.smileIvPct) ? row.smileIvPct - fitted : NaN,
    };
  });
}

/**
 * رتبه و صدکِ یک سنجه برای قرارداد کانونی.
 *
 * رتبهٔ ۱ یعنی بهترین در جهت همان دیدگاه (یا بزرگ‌ترین، برای سنجهٔ خنثی).
 * صدک: سهمِ هم‌زنجیره‌هایی که از این قرارداد **بدترند** (تساوی نیم) — ۱۰۰
 * یعنی بهتر از همه. سنجهٔ خنثی صدکِ «بالاتر از» می‌گیرد و حکم نمی‌گیرد.
 */
export function rankMetric(rows = [], focusIns, key, perspective = 'buy') {
  const metric = compareMetric(key);
  const dir = metric ? metric.dir[perspectiveOf(perspective)] : null;
  const known = rows.filter((row) => Number.isFinite(numOrNaN(row[key])));
  const focus = rows.find((row) => String(row.ins) === String(focusIns));
  const value = focus ? numOrNaN(focus[key]) : NaN;
  const sign = dir === 'low' ? 1 : -1;               // خنثی مثل «بزرگ‌تر اول»
  const ordered = known.slice().sort((a, b) => sign * (numOrNaN(a[key]) - numOrNaN(b[key])));
  const out = {
    key, dir, value, known: known.length, total: rows.length,
    best: ordered[0] || null, median: median(known.map((row) => numOrNaN(row[key]))),
    rank: null, percentile: NaN, verdict: 'unknown',
  };
  if (!Number.isFinite(value)) return out;
  out.rank = 1 + ordered.filter((row) => sign * (numOrNaN(row[key]) - value) < 0).length;
  const others = known.filter((row) => String(row.ins) !== String(focusIns));
  if (!others.length) { out.verdict = 'alone'; return out; }
  let worse = 0, ties = 0;
  for (const row of others) {
    const v = numOrNaN(row[key]);
    if (v === value) ties += 1;
    else if (dir === 'low' ? v > value : v < value) worse += 1;
  }
  out.percentile = ((worse + ties / 2) / others.length) * 100;
  out.verdict = !dir ? 'neutral' : out.percentile >= 60 ? 'better' : out.percentile <= 40 ? 'worse' : 'middle';
  return out;
}

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** امتیاز یک گروه (یا کل) برای یک قرارداد: میانگین صدک‌های جهت‌دار معلوم. */
function scoreOf(rows, ins, perspective, group = null) {
  const pcts = COMPARE_METRICS
    .filter((m) => (!group || m.group === group) && m.dir[perspective])
    .map((m) => rankMetric(rows, ins, m.key, perspective).percentile)
    .filter(Number.isFinite);
  return { score: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : NaN, metrics: pcts.length };
}

export const VERDICT_LABELS = Object.freeze({
  better: 'بهتر از بیشترِ زنجیره', worse: 'بدتر از بیشترِ زنجیره', middle: 'میانهٔ زنجیره',
  neutral: 'خنثی — فقط جایگاه', unknown: 'نامعلوم', alone: 'هم‌زنجیره‌ای برای مقایسه نیست',
});

const verdictOf = (score) => (!Number.isFinite(score) ? 'unknown' : score >= 60 ? 'better' : score <= 40 ? 'worse' : 'middle');

/**
 * کارنامهٔ کامل قرارداد کانونی در زنجیره‌اش.
 *
 * خروجی: ردیف‌های هم‌زنجیره (غنی‌شده)، رتبهٔ هر سنجه، امتیاز هر گروه و کل،
 * و جایگزین‌هایی که با همین دیدگاه امتیاز کلِ بالاتری دارند — هر کدام با
 * نام سنجه‌هایی که در آن‌ها بهترند و بدترند، تا «بهتر» ادعای بی‌دلیل نباشد.
 */
export function chainScorecard(contracts = [], focusIns, {
  mode = 'expiry-kind', perspective = 'buy', params = {}, alternatives = 5,
} = {}) {
  const side = perspectiveOf(perspective);
  const focusRow = (contracts || []).find((row) => String(row.ins) === String(focusIns)) || null;
  if (!focusRow) return { ok: false, why: 'قراردادی انتخاب نشده است', rows: [], metrics: [], groups: [], alternatives: [] };
  const rows = enrichPeers(peerGroup(contracts, focusRow, mode), { perspective: side, params });
  const focus = rows.find((row) => String(row.ins) === String(focusIns));
  const metrics = COMPARE_METRICS.map((m) => ({ ...m, ...rankMetric(rows, focusIns, m.key, side) }));
  const groups = METRIC_GROUPS.map(([id, label]) => {
    const s = scoreOf(rows, focusIns, side, id);
    return { id, label, ...s, verdict: verdictOf(s.score) };
  });
  const overall = scoreOf(rows, focusIns, side);
  const scores = new Map(rows.map((row) => [String(row.ins), scoreOf(rows, row.ins, side).score]));
  const standing = rows.slice().filter((row) => Number.isFinite(scores.get(String(row.ins))))
    .sort((a, b) => scores.get(String(b.ins)) - scores.get(String(a.ins)));
  const overallRank = standing.findIndex((row) => String(row.ins) === String(focusIns));
  const alts = standing
    .filter((row) => String(row.ins) !== String(focusIns) && scores.get(String(row.ins)) > overall.score)
    .slice(0, Math.max(0, alternatives))
    .map((row) => {
      const diffs = COMPARE_METRICS.filter((m) => m.dir[side]).map((m) => {
        const a = numOrNaN(row[m.key]), b = numOrNaN(focus[m.key]);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
        const better = m.dir[side] === 'high' ? a > b : a < b;
        const mine = rankMetric(rows, row.ins, m.key, side).percentile;
        const theirs = rankMetric(rows, focusIns, m.key, side).percentile;
        return { key: m.key, label: m.label, better, gap: Math.abs(mine - theirs) };
      }).filter(Boolean);
      const top = (flag) => diffs.filter((d) => d.better === flag).sort((x, y) => y.gap - x.gap).slice(0, 3);
      return { row, score: scores.get(String(row.ins)), betterIn: top(true), worseIn: top(false) };
    });
  return {
    ok: true, why: '', mode: peerModeOf(mode), perspective: side,
    focus, rows, metrics, groups,
    overall: { ...overall, verdict: verdictOf(overall.score), rank: overallRank >= 0 ? overallRank + 1 : null, of: standing.length },
    alternatives: alts,
    // امتیاز کلیِ هر هم‌زنجیره در **همین** گروه و دیدگاه، برای ستون جدول.
    scores: Object.fromEntries(scores),
  };
}
