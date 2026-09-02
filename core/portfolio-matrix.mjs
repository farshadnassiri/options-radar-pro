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

/**
 * از فهرست ردیف‌های ریسه، ماتریس متراکم می‌سازد.
 *
 * ستون‌ها اجتماع مرتبِ همهٔ روزهای معتبرِ دیده‌شده‌اند؛ سطرها به همان ترتیب
 * `rows` می‌مانند تا رابط بتواند با اندیس، ردیف را به شناسه‌اش وصل کند.
 */
export function buildPnlMatrix(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set();
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
  return { dates, pnl, rowCount: list.length };
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
  for (let out = 0; out < rows.length; out += 1) {
    pnl.set(src.subarray(rows[out] * width, (rows[out] + 1) * width), out * width);
  }
  return { ...matrix, pnl, rowCount: rows.length };
}
