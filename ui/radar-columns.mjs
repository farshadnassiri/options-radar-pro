// ستون‌های جدولِ رادار — همان «آیتم‌های تأثیرگذار»، قابل حذف و اضافه.
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «تمامی ایتمهای تاثیر گذار داخل جدول بیار و قابلیت حذف و اضافه داشته
// باشن (حداکثر سود، زیان، درصد سود، زیان و …) با الهام از سایر جداول
// برنامه.» و: «جداول ویژوال و رنگی و نمودار داخل جداول و زیبا و بصری
// باشن.»
//
// ═══ چرا اینجا و نه در خودِ تب ═══
//
// دو مصرف‌کننده دارد: جدولِ «اکنون» در تب رادار، و پیش‌نمایشِ «چه چیزی
// منطبق شد» در تب دیده‌بان. یک فهرست، تا ستونی که در یکی هست در دیگری
// هم باشد و عنوان‌ها یکی بمانند.
//
// ═══ نمای شروع، نه قفس ═══
//
// `RADAR_COLS` نمای پیش‌فرض است و `RADAR_ALL_COLS` هرچه می‌شود اضافه کرد.
// همان تفکیکِ `ui/tabs/chain.mjs`: یک جدول سی‌ستونه در نگاه اول کسی را
// به تصمیم نمی‌رساند، ولی ستونی که وجود نداشته باشد قابل اضافه‌کردن هم
// نیست.

import { faDigits, fmt } from './fmt.mjs';
import { fillBar, sparkline } from './gap-charts.mjs';
import { comboSymbolText, comboSymbols } from '../core/spread-gap.mjs';
import { historyDateLabel } from '../core/history.mjs';

const finite = (value) => Number.isFinite(value);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/** «نامحدود» یک واژه است، نه یک عدد بزرگ. */
const boundless = (value) => (value === Infinity || value === -Infinity ? 'نامحدود' : null);
const moneyText = (value) => boundless(value) || fmt.money(value);
const moneyCell = (row, value) => {
  const word = boundless(value);
  return word ? `<i class="rad-boundless">${word}</i>` : esc(fmt.money(value));
};

/** نوارِ دوسویهٔ سود در برابر زیان — «بصری» بودنِ ستون، نه تزیینش. */
function riskBar(row) {
  const gain = row.returnPct, loss = row.lossPct;
  if (!finite(gain) && !finite(loss)) return '<span class="rad-dim">—</span>';
  const span = Math.max(finite(gain) ? gain : 0, finite(loss) ? loss : 0) || 1;
  const w = (value) => (finite(value) ? Math.min(100, (value / span) * 100).toFixed(1) : '0');
  return `<div class="rad-risk" role="img" aria-label="سود ${fmt.pct(gain)} درصد در برابر زیان ${fmt.pct(loss)} درصد">
    <span class="rad-risk-gain" style="--w:${w(gain)}%"><b>${finite(gain) ? `${fmt.pct(gain)}٪` : (boundless(gain) ? 'نامحدود' : '—')}</b></span>
    <span class="rad-risk-loss" style="--w:${w(loss)}%"><b>${finite(loss) ? `${fmt.pct(loss)}٪` : (loss === Infinity ? 'نامحدود' : '—')}</b></span>
  </div>`;
}

/**
 * نمادهای ترکیب، هرکدام در یک سطر با جهتش.
 *
 * ═══ چرا نامِ نماد فارسی‌سازیِ رقم نمی‌شود ═══
 *
 * هر عددِ نمایشیِ این برنامه از `ui/fmt.mjs` رقم فارسی می‌گیرد. نامِ نماد
 * عددِ نمایشی نیست — رشته‌ای است که کاربر روی تابلو با آن سفارش می‌گذارد
 * و جست‌وجو می‌کند. دست‌کاری‌اش، همان کاری را می‌کند که هیچ‌کس نمی‌خواهد:
 * چیزی نشان می‌دهد که در تابلو پیدا نمی‌شود. پس دست‌نخورده می‌آید.
 *
 * یک تابع، دو مصرف‌کننده: همین ستون، و شناسنامهٔ بالای نمودارهای تاریخچه.
 */
export function symbolCell(legs = []) {
  const list = comboSymbols(legs);
  if (!list.length) return '<span class="rad-dim">—</span>';
  return `<div class="gap-syms">${list.map((leg) => `<span class="gap-sym" data-side="${leg.side}"><i>${esc(leg.sideLabel)}</i><b>${esc(leg.name)}</b>${leg.ratio > 1 ? `<u>×${fmt.int(leg.ratio)}</u>` : ''}</span>`).join('')}</div>`;
}

export const RADAR_ALL_COLS = [
  // ——— شناسه ———
  { key: 'strategyName', label: 'استراتژی', fmt: 'text', group: 'شناسه' },
  { key: 'symbols', label: 'نمادها', fmt: 'text', group: 'شناسه',
    cell: (row) => symbolCell(row.__row?.legs || []),
    text: (row) => comboSymbolText(row.__row?.legs || []) },
  { key: 'baseName', label: 'نماد پایه', fmt: 'text', group: 'شناسه' },
  { key: 'strikeText', label: 'قیمت اعمال', fmt: 'text', group: 'شناسه' },
  { key: 'expiryText', label: 'سررسید', fmt: 'text', group: 'شناسه' },
  { key: 'daysLeft', label: 'روز تا سررسید', fmt: 'int', group: 'شناسه' },
  { key: 'entryDateText', label: 'مبدأ مقایسه', fmt: 'text', group: 'شناسه' },
  { key: 'kindLabel', label: 'خانواده', fmt: 'text', group: 'شناسه' },
  { key: 'sideLabel', label: 'بدهکار یا بستانکار', fmt: 'text', group: 'شناسه' },

  // ——— فاصله ———
  { key: 'anchor', label: 'لنگر', fmt: 'money', group: 'فاصله' },
  { key: 'anchorLabel', label: 'لنگر یعنی چه', fmt: 'text', group: 'فاصله' },
  { key: 'current', label: 'فاصله / جمعِ اکنون', fmt: 'money', group: 'فاصله', heat: 'prob' },
  { key: 'fillPct', label: 'پر شده / باقی‌مانده', fmt: 'pct', group: 'فاصله',
    cell: (row) => fillBar(row.__row?.gap),
    text: (row) => `${fmt.pct(row.coveragePct)}٪ / ${fmt.pct(row.roomPct)}٪` },
  { key: 'coveragePct', label: 'درصد پر شدن', fmt: 'pct', group: 'فاصله', heat: 'prob' },
  { key: 'roomPct', label: 'درصد باقی‌مانده', fmt: 'pct', group: 'فاصله', heat: 'gain' },
  { key: 'gainedPct', label: 'حرکت از مبدأ ٪', fmt: 'pct', group: 'فاصله', heat: 'gain' },
  { key: 'gained', label: 'حرکت از مبدأ', fmt: 'money', group: 'فاصله' },
  { key: 'rank', label: 'صدک تاریخی', fmt: 'pct', group: 'فاصله', heat: 'loss' },
  { key: 'vsMeanPct', label: 'فاصله از میانگین ٪', fmt: 'pct', group: 'فاصله' },
  { key: 'trendPct', label: 'روند بازه', fmt: 'pct', group: 'فاصله',
    cell: (row) => sparkline(row.__spark || [], { band: row.anchor, label: `${row.strategyName} — روند فاصله` }),
    text: (row) => `${fmt.pct(row.trendPct)}٪` },
  { key: 'strikeGap', label: 'دهانهٔ اعمال', fmt: 'money', group: 'فاصله' },

  // ——— سود و زیان ———
  { key: 'riskBar', label: 'سود در برابر زیان', fmt: 'pct', group: 'سود و زیان',
    cell: riskBar, text: (row) => `${fmt.pct(row.returnPct)}٪ / ${fmt.pct(row.lossPct)}٪` },
  { key: 'maxProfit', label: 'حداکثر سود', fmt: 'money', group: 'سود و زیان', heat: 'gain',
    cell: moneyCell, text: (row, value) => moneyText(value) },
  { key: 'maxLoss', label: 'حداکثر زیان', fmt: 'money', group: 'سود و زیان', heat: 'loss',
    cell: moneyCell, text: (row, value) => moneyText(value) },
  { key: 'returnPct', label: 'حداکثر سود ٪', fmt: 'pct', group: 'سود و زیان', heat: 'gain' },
  { key: 'lossPct', label: 'حداکثر زیان ٪', fmt: 'pct', group: 'سود و زیان', heat: 'loss' },
  { key: 'rewardRisk', label: 'پاداش به ریسک', fmt: 'num', group: 'سود و زیان', heat: 'gain' },
  { key: 'perDayPct', label: 'بازده روزانه ٪', fmt: 'pct', group: 'سود و زیان', heat: 'gain' },
  { key: 'monthlyPct', label: 'بازده ماهانه ٪', fmt: 'pct', group: 'سود و زیان', heat: 'gain' },
  { key: 'upsidePct', label: 'سود باقی‌مانده ٪', fmt: 'pct', group: 'سود و زیان', heat: 'gain' },
  { key: 'perDay', label: 'سود باقی‌ماندهٔ روزانه ٪', fmt: 'pct', group: 'سود و زیان' },
  { key: 'netCash', label: 'جریان نقد ورود', fmt: 'money', group: 'سود و زیان' },
  { key: 'capital', label: 'سرمایهٔ درگیر', fmt: 'money', group: 'سود و زیان' },
  { key: 'capitalLabel', label: 'مبنای سرمایه', fmt: 'text', group: 'سود و زیان' },
  { key: 'marginNet', label: 'وجه تضمین خالص', fmt: 'money', group: 'سود و زیان' },

  // ——— سربه‌سری ———
  { key: 'beLow', label: 'سربه‌سری پایین', fmt: 'money', group: 'سربه‌سری' },
  { key: 'beHigh', label: 'سربه‌سری بالا', fmt: 'money', group: 'سربه‌سری' },
  { key: 'beLowPct', label: 'فاصله تا سربه‌سری پایین ٪', fmt: 'pct', group: 'سربه‌سری' },
  { key: 'beHighPct', label: 'فاصله تا سربه‌سری بالا ٪', fmt: 'pct', group: 'سربه‌سری' },
  { key: 'beWidthPct', label: 'پهنای امن ٪', fmt: 'pct', group: 'سربه‌سری', heat: 'gain' },

  // ——— بازار ———
  { key: 'legValue', label: 'ارزش معاملهٔ نازک‌ترین پا', fmt: 'money', group: 'بازار', heat: 'gain' },
  { key: 'legValueSum', label: 'ارزش معاملهٔ همهٔ پاها', fmt: 'money', group: 'بازار' },
  { key: 'legVolume', label: 'حجم نازک‌ترین پا', fmt: 'int', group: 'بازار', heat: 'gain' },
  { key: 'legTrades', label: 'تعداد معاملهٔ نازک‌ترین پا', fmt: 'int', group: 'بازار' },
  { key: 'spot', label: 'قیمت نماد پایه', fmt: 'money', group: 'بازار' },
  { key: 'liveState', label: 'مظنهٔ زنده', fmt: 'text', group: 'بازار' },
];

const DEFAULT_KEYS = [
  'strategyName', 'symbols', 'strikeText', 'expiryText', 'daysLeft',
  'current', 'fillPct', 'riskBar', 'returnPct', 'lossPct', 'perDayPct', 'rank', 'trendPct',
];

export const RADAR_COLS = DEFAULT_KEYS
  .map((key) => RADAR_ALL_COLS.find((col) => col.key === key)).filter(Boolean);

/**
 * ردیفِ رادار را تخت می‌کند تا جدولِ مشترک بتواند مرتب و رنگ و خروجی‌اش
 * کند.
 *
 * `__row` خودِ ردیف را نگه می‌دارد، چون سلول‌های نگاره‌دار (نوار پرشدگی و
 * اسپارک‌لاین) به شیءِ کاملِ فاصله نیاز دارند. `__spark` هم از پیش ساخته
 * می‌شود، وگرنه در هر بار رسمِ مجازی‌سازی دوباره از سری بیرون کشیده
 * می‌شد.
 */
export function toTableRow(row, { baseName = '', live = null } = {}) {
  const gap = row.gap || {};
  const metrics = row.metrics || {};
  const verdict = row.verdict || {};
  const spark = (row.series?.points || []).map((point) => point.current).filter(finite);
  const first = spark[0], last = spark[spark.length - 1];
  return {
    __row: row, __spark: spark, key: row.key,
    strategyName: row.def?.name || '',
    baseName,
    strikeText: (row.strikes || []).map((strike) => fmt.money(strike)).join(' / '),
    expiryText: faDigits(historyDateLabel(row.expiry)),
    entryDateText: faDigits(historyDateLabel(row.entryDate)),
    daysLeft: gap.daysLeft,
    kindLabel: gap.kindLabel || '',
    sideLabel: gap.side === 'credit' ? 'بستانکار' : gap.side === 'debit' ? 'بدهکار' : '—',
    anchor: gap.anchor, anchorLabel: gap.anchorLabel || '', strikeGap: gap.strikeGap,
    current: gap.current,
    fillPct: gap.coveragePct, coveragePct: gap.coveragePct, roomPct: gap.roomPct,
    gained: gap.gained, gainedPct: gap.gainedPct,
    rank: verdict.rank, vsMeanPct: verdict.vsMean,
    trendPct: finite(first) && first !== 0 && finite(last) ? ((last / first) - 1) * 100 : NaN,
    riskBar: finite(metrics.returnPct) ? metrics.returnPct : NaN,
    maxProfit: metrics.maxProfit, maxLoss: metrics.maxLoss,
    returnPct: metrics.returnPct, lossPct: metrics.lossPct,
    rewardRisk: metrics.rewardRisk, perDayPct: metrics.perDayPct, monthlyPct: metrics.monthlyPct,
    upsidePct: gap.upsidePct, perDay: gap.perDay,
    netCash: metrics.netCash, capital: metrics.capital, capitalLabel: metrics.capitalLabel || '',
    marginNet: metrics.marginNet,
    beLow: metrics.beLow, beHigh: metrics.beHigh,
    beLowPct: metrics.beLowPct, beHighPct: metrics.beHighPct, beWidthPct: metrics.beWidthPct,
    legValue: metrics.legValue, legValueSum: metrics.legValueSum,
    legVolume: metrics.legVolume, legTrades: metrics.legTrades,
    spot: row.spot,
    liveState: live == null ? '—' : (live ? 'زنده' : 'روزانه'),
  };
}
