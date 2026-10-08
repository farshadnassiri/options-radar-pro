// ماتریس سود و زیانِ ترکیب × روز.
//
// چرا ماتریس، و نه همان فهرست روزانهٔ هر ردیف: کاربر می‌خواهد مبنای بازده،
// آماره، بازهٔ زمانی و وزن‌دهی را عوض کند و **بلافاصله** نتیجه را ببیند. اگر
// درصد بازده در ریسه محاسبه و همان‌جا قطعی شود، هر تغییرِ مبنا یعنی چند
// دقیقه بازپخش دوباره. پس ریسه فقط چیزِ خام را می‌دهد — سود و زیان ریالی —
// و مخرج و آماره در سمت رابط، روی همین ماتریس، لحظه‌ای ساخته می‌شوند.
//
// خانهٔ بی‌مشاهده `NaN` است، نه صفر. صفر یک مشاهده است: «آن روز سر به سر
// بود». `NaN` یعنی «آن روز اصلاً قیمت معتبری نبود». یکی‌کردنشان همان اشتباهی
// است که کل این پروژه علیه آن نوشته شده.

export const PORTFOLIO_MATRIX_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

// ═══ چرا یک خانه خالی است (۱۴۰۵/۰۷/۱۶) ═══
//
// پرسش صاحب پروژه: «در پوشش داده، دیتا نرسیده به برنامه یا واقعاً معامله
// نشده؟» عددِ پوشش این سه را یکی می‌شمرد. حالا هر خانهٔ خالی علتش را دارد:
//
//   untraded — آن روز برای یک پا ردیفِ قیمت‌دار نبود (معامله نشده).
//   expired  — روز پس از سررسیدِ نزدیک‌ترین پاست؛ بازپخش همان‌جا تمام شد.
//   failed   — تاریخچهٔ یک پا دریافت نشد، یا ریزمعاملهٔ روزِ سنجش نرسید یا
//              پس از هر دو مسیر خالی برگشت (بی‌صدا محدودشده؟). «معامله
//              نشد» نیست.
//   none     — علتی ثبت نشده (اجرای قدیمی، یا روزی بیرون از بازپخش).

export const GAP = { none: 0, untraded: 1, expired: 2, failed: 3 };
export const GAP_LABELS = { untraded: 'معامله نشده', expired: 'پس از سررسید', failed: 'داده نرسید', none: 'نامعلوم' };

/**
 * علتِ روزهای خالیِ یک بازپخش.
 *
 * `errors`: ابزار → خطای دریافتِ تاریخچه (همهٔ روزها). `tapeErrors`: ابزار →
 * خطای ریزمعاملهٔ روزِ سنجش (فقط `markDate`). `requestedEnd`: پایانِ خواسته؛
 * اگر بازپخش زودتر (روزِ سررسید) تمام شده، روزهای بعد «پس از سررسید»‌اند.
 */
export function gapCodes(replay, { errors = {}, tapeErrors = {}, markDate = 0, requestedEnd = 0 } = {}) {
  const priced = Array.isArray(replay?.priced) ? replay.priced : [];
  const gaps = [];
  for (const row of Array.isArray(replay?.rows) ? replay.rows : []) {
    if (row?.status !== 'missing') continue;
    const legs = (row.missingLegs || []).map((i) => String(priced[i]?.ins ?? ''));
    const failed = legs.some((ins) => errors?.[ins] || (Number(row.date) === Number(markDate) && tapeErrors?.[ins]));
    gaps.push([Number(row.date), failed ? GAP.failed : GAP.untraded]);
  }
  const end = Number(replay?.endDate) || 0;
  const expiredAfter = end && Number(requestedEnd) > end ? end : null;
  return { gaps, expiredAfter };
}

/**
 * از فهرست ردیف‌های ریسه، ماتریس متراکم می‌سازد.
 *
 * ستون‌ها `calendar` (روزهای معاملاتی پایه در بازه، از `historyCalendar`)
 * به‌علاوهٔ هر روز معتبرِ دیده‌شده‌اند. روزی که هیچ ترکیبی در آن قیمت
 * معتبر نداشت در تقویم **می‌ماند**؛ خانه‌هایش نامعلوم است ولی ستونش در مخرج
 * پوشش شمرده می‌شود. بی تقویم، پوشش سه روزِ با یک روزِ خالی «۱۰۰٪»
 * درمی‌آمد، نه ۶۶٫۶۷٪ (گزارش ۱ اکتبر).
 *
 * سطرها به همان ترتیب `rows` می‌مانند تا رابط بتواند با اندیس، ردیف را به
 * شناسه‌اش وصل کند.
 */
export function buildPnlMatrix(rows = [], { calendar = [] } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set();
  for (const day of Array.isArray(calendar) ? calendar : []) {
    const date = finite(day);
    if (date !== null) seen.add(date);
  }
  for (const row of list) {
    for (const point of row?.path?.daily || []) {
      const date = finite(point?.date);
      if (date !== null && finite(point?.netPnl) !== null) seen.add(date);
    }
  }
  const dates = [...seen].sort((a, b) => a - b);
  const columnOf = new Map(dates.map((date, index) => [date, index]));
  const pnl = new Float64Array(list.length * dates.length).fill(NaN);
  for (let rowIndex = 0; rowIndex < list.length; rowIndex++) {
    const offset = rowIndex * dates.length;
    for (const point of list[rowIndex]?.path?.daily || []) {
      const date = finite(point?.date);
      const value = finite(point?.netPnl);
      if (date === null || value === null) continue;
      const column = columnOf.get(date);
      if (column === undefined) continue;
      pnl[offset + column] = value;
    }
  }
  // علتِ هر خانهٔ خالی، هم‌شکلِ `pnl`. خانهٔ پر صفر می‌ماند.
  const gaps = new Uint8Array(list.length * dates.length);
  for (let rowIndex = 0; rowIndex < list.length; rowIndex++) {
    const offset = rowIndex * dates.length;
    const path = list[rowIndex]?.path || {};
    for (const [date, code] of path.gaps || []) {
      const column = columnOf.get(finite(date));
      if (column !== undefined && Number.isNaN(pnl[offset + column])) gaps[offset + column] = code;
    }
    const after = finite(path.expiredAfter);
    if (after !== null) {
      for (let column = 0; column < dates.length; column++) {
        if (dates[column] > after && Number.isNaN(pnl[offset + column])) gaps[offset + column] = GAP.expired;
      }
    }
  }
  return { dates, pnl, gaps, rowCount: list.length };
}

/** تفکیکِ خانه‌های خالیِ چند ردیف روی ستون‌های پنجره: شمار هر علت. */
export function gapTally(matrix, rowIndexes = [], columns = []) {
  const width = matrix?.dates?.length || 0;
  const out = { observed: 0, untraded: 0, expired: 0, failed: 0, none: 0, possible: 0 };
  const names = ['none', 'untraded', 'expired', 'failed'];
  for (const rowIndex of rowIndexes) {
    for (const column of columns) {
      out.possible += 1;
      const value = matrix?.pnl?.[rowIndex * width + column];
      if (Number.isFinite(value)) { out.observed += 1; continue; }
      out[names[matrix?.gaps?.[rowIndex * width + column] || 0] || 'none'] += 1;
    }
  }
  return out;
}

/**
 * برشِ یک ردیف از ماتریس، به‌صورت آرایهٔ ساده.
 *
 * `null` جای `NaN` می‌نشیند چون مصرف‌کننده‌های رابط با `null` کار می‌کنند و
 * `NaN` در JSON بی‌صدا به `null` تبدیل می‌شود — بهتر است همین‌جا صریح باشد.
 */
export function matrixRow(matrix, rowIndex) {
  const width = matrix?.dates?.length || 0;
  const pnl = matrix?.pnl;
  if (!width || !pnl || !(rowIndex >= 0) || rowIndex >= (matrix.rowCount ?? 0)) return [];
  const offset = rowIndex * width;
  const out = new Array(width);
  for (let index = 0; index < width; index++) {
    const value = pnl[offset + index];
    out[index] = Number.isFinite(value) ? value : null;
  }
  return out;
}

/**
 * ستون‌هایی که در بازهٔ خواسته‌شده می‌افتند.
 *
 * بازهٔ باز از دو طرف مجاز است: `from` یا `to` نامعلوم یعنی «از اول» یا «تا
 * آخر»، نه «هیچ‌کدام».
 */
export function columnsInRange(dates = [], from = null, to = null) {
  const low = finite(from);
  const high = finite(to);
  const out = [];
  for (let index = 0; index < dates.length; index++) {
    const date = finite(dates[index]);
    if (date === null) continue;
    if (low !== null && date < low) continue;
    if (high !== null && date > high) continue;
    out.push(index);
  }
  return out;
}

/**
 * زیرمجموعه‌ای از ردیف‌های ماتریس، به همان ترتیب.
 *
 * ═══ چرا این تابع هست ═══
 *
 * ماتریس ردیف‌ها را **با اندیس** می‌شناسد: ردیف iام از `pnl` در
 * `i * dates.length` شروع می‌شود. پس هرکس فهرست ردیف‌ها را کوتاه کند و
 * ماتریس را دست‌نخورده بگذارد، مسیر روزانهٔ هر ردیف به ردیف دیگری
 * می‌چسبد — و هیچ خطایی نمی‌دهد، فقط عددها عوض می‌شوند.
 *
 * `path.daily` پیش از فرستادن از ریسه پاک می‌شود، پس ساختنِ دوبارهٔ
 * ماتریس در مرورگر ممکن نیست. برش، تنها راهِ درست است.
 */
export function selectMatrixRows(matrix, indexes) {
  if (!matrix || !Array.isArray(indexes)) return matrix;
  const dates = matrix.dates || [];
  const width = dates.length;
  const src = matrix.pnl instanceof Float64Array ? matrix.pnl : Float64Array.from(matrix.pnl || []);
  const rows = indexes.filter((i) => Number.isInteger(i) && i >= 0 && (i + 1) * width <= src.length);
  const pnl = new Float64Array(rows.length * width);
  // علتِ خانه‌های خالی هم با همان ردیف‌ها می‌رود؛ بی این، زیرمجموعه همهٔ
  // خالی‌ها را «نامعلوم» می‌خواند.
  const srcGaps = matrix.gaps ? (matrix.gaps instanceof Uint8Array ? matrix.gaps : Uint8Array.from(matrix.gaps)) : null;
  const gaps = srcGaps ? new Uint8Array(rows.length * width) : null;
  for (let out = 0; out < rows.length; out += 1) {
    pnl.set(src.subarray(rows[out] * width, (rows[out] + 1) * width), out * width);
    if (gaps && (rows[out] + 1) * width <= srcGaps.length) gaps.set(srcGaps.subarray(rows[out] * width, (rows[out] + 1) * width), out * width);
  }
  return { ...matrix, pnl, ...(gaps ? { gaps } : {}), rowCount: rows.length };
}
