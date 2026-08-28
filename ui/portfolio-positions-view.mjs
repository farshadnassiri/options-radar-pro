// مدل نمایش موقعیت‌های جلسه — برش چهارم فاز ۴.
//
// `core/portfolio-positions.mjs` می‌داند چه چیزی در دست است — پاها،
// اعمال، سررسید، حجم، قیمت ورود، کیفیت. کاربر هیچ‌کدام را نمی‌دید؛ بعد
// از ثبت فقط یک شناسهٔ موقعیت به او نشان داده می‌شد.
//
// چهار مرز:
//
// **هیچ عدد مالی تازه‌ای اینجا ساخته نمی‌شود.** تنها حسابِ مجاز تقسیم بر
// ده است. لایهٔ نمایشی که عدد بسازد، هیچ آزمونی بالای سرش نیست و کاربر
// تفاوتش را نمی‌بیند.
//
// **موقعیت بی‌سند دیده می‌شود، با علتش.** نه حذف، نه شبیه یک موقعیت
// سالم با خانه‌های خالی. حذفش یعنی فهرست کمتر از واقعیت است.
//
// **کیفیت برآوردی روی همان ردیف می‌ماند.** بردنش به جای دیگر یعنی کسی
// که ردیف را می‌خواند، عدد برآوردی را قطعی می‌بیند.
//
// **پا با واژه نوشته می‌شود، نه با شناسه.** `call/buy` به کاربر چیزی
// نمی‌گوید.
//
// اینجا DOM نیست و رشتهٔ HTML ساخته نمی‌شود؛ تب خودش رسم می‌کند.

import { fmt, faDigits, signTone } from './fmt.mjs';
import { historyDateLabel } from '../core/history.mjs';
import {
  PORTFOLIO_POSITIONS_REASONS, portfolioSessionPositions,
} from '../core/portfolio-positions.mjs';
import { GROUPS as STRATEGY_FAMILIES, byId } from '../strategies/catalog.mjs';

export const POSITIONS_VIEW_REASONS = PORTFOLIO_POSITIONS_REASONS;

const text = (value) => String(value ?? '').trim();

/** ریال به تومان، فقط برای نمایش. عدد نامعتبر «—» می‌شود، نه صفر. */
const toman = (rial) => (Number.isFinite(rial) ? fmt.int(rial / 10) : '—');

const count = (value) => (Number.isFinite(Number(value)) ? faDigits(String(Number(value))) : '—');

// همان واژه‌هایی که بقیهٔ رابط به کار می‌برد؛ دو نام برای یک چیز
// یعنی کاربر فکر می‌کند دو چیز متفاوت‌اند.
const KIND_LABEL = Object.freeze({ call: 'اختیار خرید', put: 'اختیار فروش' });
const SIDE_LABEL = Object.freeze({ buy: 'خرید', sell: 'فروش' });

/**
 * یک پا، در یک عبارت خوانا.
 *
 * «اختیار خرید» نوع قرارداد است و «خرید» سمتِ معامله؛ دو چیز متفاوت‌اند
 * و جدا برچسب می‌خورند. «فروش اختیار خرید» یعنی کال فروخته شده.
 */
function legText(leg) {
  const kind = KIND_LABEL[leg.kind] || faDigits(text(leg.kind)) || '—';
  const side = SIDE_LABEL[leg.side] || faDigits(text(leg.side)) || '—';
  const strike = Number.isFinite(leg.strike) ? `${toman(leg.strike)} تومان` : '—';
  const expiry = Number.isFinite(Number(leg.expiry))
    ? faDigits(historyDateLabel(Number(leg.expiry))) : '—';
  return `${side} ${kind} · اعمال ${strike} · سررسید ${expiry}`
    + ` · ${count(leg.filled)} قرارداد · ${toman(leg.vwap)} تومان`;
}

/** کیفیت داده، با علتش. همان‌جا که ردیف است، نه جای دیگر. */
function qualityText(quality) {
  if (!quality) return { label: '—', reason: '' };
  return {
    label: faDigits(quality.label || quality.kind || '—'),
    reason: faDigits(text(quality.reason)),
    estimated: quality.kind === 'estimated',
  };
}

function planLabel(defId) {
  const def = defId ? byId(defId) : null;
  return {
    defLabel: def?.fa || def?.name || faDigits(text(defId)) || '—',
    familyLabel: STRATEGY_FAMILIES[text(def?.group)] || text(def?.group) || '—',
  };
}

function fail(reason, why = '') {
  return {
    ok: false,
    why: why || POSITIONS_VIEW_REASONS[reason],
    reason,
    empty: false,
    note: '',
    rows: [],
    open: [],
    closed: [],
    countsText: '',
    undocumentedText: '',
  };
}

/**
 * ارزش جاری یک موقعیت، آمادهٔ نمایش.
 *
 * `null` یعنی ارزش‌گذاری اصلاً انجام نشده (مدرک کهنه، ماژول صدا زده
 * نشده) — که با «انجام شد ولی این موقعیت ارزش ندارد» یکی نیست. اولی
 * ستون را ساکت می‌گذارد، دومی علت دارد.
 */
function valueCells(valued) {
  if (!valued) {
    return {
      hasValuation: false,
      valueTomanText: '—',
      unrealizedTomanText: '—',
      unrealizedTone: '',
      valuedWhy: '',
    };
  }
  if (!valued.valued) {
    return {
      hasValuation: true,
      valueTomanText: '—',
      unrealizedTomanText: '—',
      unrealizedTone: '',
      // «—»ی خالی می‌تواند «هنوز نیامده» خوانده شود؛ علت روشن می‌کند
      // که سنجیده شد و نشد.
      valuedWhy: faDigits(text(valued.why)),
    };
  }
  return {
    hasValuation: true,
    valueTomanText: toman(valued.valueRial),
    unrealizedTomanText: toman(valued.unrealizedRial),
    // سود منفی باید بدون گشتن دیده شود.
    unrealizedTone: signTone(valued.unrealizedRial),
    valuedWhy: '',
  };
}

/** یک ردیف موقعیت، آمادهٔ نمایش. */
function toRow(row, valued = null) {
  const quality = qualityText(row.quality);
  return {
    id: row.id,
    idText: faDigits(row.id),
    status: row.status,
    statusLabel: row.status === 'open' ? 'باز' : 'بسته',
    ...planLabel(row.defId || row.strategyId),
    familyLabelFromId: STRATEGY_FAMILIES[text(row.familyId)] || faDigits(text(row.familyId)) || '—',
    openQtyText: count(row.openQty),
    initialQtyText: count(row.initialQty),
    capitalTomanText: toman(row.capitalRial),
    entryCashTomanText: toman(row.entryCashRial),
    realizedTomanText: toman(row.realizedRial),
    realizedTone: Number.isFinite(row.realizedRial) ? signTone(row.realizedRial) : '',
    realizedWhy: faDigits(text(row.realizedWhy)),
    // پاها هرکدام یک عبارت کامل‌اند؛ ستون‌بندی‌شان کار تب است.
    legTexts: (row.legs || []).map(legText),
    documented: row.documented,
    // موقعیت بی‌سند شبیه موقعیت سالم دیده نمی‌شود.
    why: faDigits(text(row.why)),
    qualityLabel: quality.label,
    qualityReason: quality.reason,
    qualityEstimated: Boolean(quality.estimated),
    // فقط موقعیت باز بسته می‌شود؛ دکمه روی ردیف بسته یعنی کاری که
    // شکست می‌خورد.
    closable: row.status === 'open',
    ...valueCells(valued),
  };
}

/**
 * متن شکستِ بستن.
 *
 * وقتی دفتر سفارش کم‌عمق است، موتور عددِ ممکن را برمی‌گرداند — و همان
 * چیزی است که کاربر باید ببیند، نه یک «نشد». بدون این عدد، تنها راهش
 * حدس‌زدن است.
 *
 * متن خام موتور اینجا استفاده نمی‌شود چون عددهایش رقم لاتین‌اند؛
 * قالب‌بندی کار لایهٔ نمایش است.
 */
export function closeFailureText(result) {
  if (!result || result.ok) return '';
  const base = faDigits(text(result.why).replace(/\s—\s.*$/, ''));
  if (result.reason === 'insufficientBook') {
    return `${base} — بیشترین حجم ممکن ${count(result.executableQty)}`
      + ` در برابر ${count(result.requestedQty)} خواسته‌شده`;
  }
  if (result.reason === 'qtyTooLarge') {
    return `${base} — حجم باز ${count(result.requestedQty)} نیست`;
  }
  return base;
}

/**
 * خبرِ بستنِ موفق.
 *
 * نقد و کارمزد با علامتِ خودشان می‌آیند: نقدِ مثبت یعنی پول وارد شد.
 * عوض‌کردن علامت در لایهٔ نمایش یعنی ساختن عددی که موتور نگفته.
 */
export function closeDoneText(result) {
  if (!result?.ok) return '';
  const what = result.kind === 'close' ? 'موقعیت بسته شد' : 'حجم کم شد';
  return `${what} — ${count(result.qty)} قرارداد`
    + ` · نقد خروج ${toman(result.exitCashRial)} تومان`
    + ` · کارمزد ${toman(result.feeRial)} تومان`
    + (Number.isFinite(result.realizedRial)
      ? ` · سود تحقق‌یافته ${toman(result.realizedRial)} تومان` : '')
    + (result.status === 'open' ? ` · باقی‌مانده ${count(result.remainingQty)}` : '');
}

/**
 * جمعِ ارزش‌گذاری، یا اینکه چرا جمعی نیست.
 *
 * جمعِ کل فقط وقتی نوشته می‌شود که موتور گفته باشد کامل است. جمعِ نصفه
 * شبیه عدد است و همان چیزی است که کاربر باورش می‌کند.
 */
function valuationSummary(valuation) {
  if (!valuation) return { valuationText: '', valuationTone: '', valuationWhy: '' };
  if (!valuation.ok) return { valuationText: '', valuationTone: '', valuationWhy: faDigits(text(valuation.why)) };
  const totals = valuation.totals;
  if (!totals.complete) {
    return {
      valuationText: '',
      valuationTone: '',
      valuationWhy: totals.openCount === 0 ? ''
        : `${count(totals.unvaluedCount)} از ${count(totals.openCount)} موقعیت باز ارزش‌گذاری نشد،`
          + ' پس جمعِ کل ساخته نشد',
    };
  }
  return {
    valuationText: `ارزش جاری ${toman(totals.valueRial)} تومان`
      + ` · سود تحقق‌نیافته ${toman(totals.unrealizedRial)} تومان`,
    valuationTone: signTone(totals.unrealizedRial),
    valuationWhy: '',
  };
}

/**
 * موقعیت‌های یک جلسه، آمادهٔ نمایش.
 *
 * جلسهٔ بدون موقعیت هم جواب می‌گیرد — با جمله، نه جدول خالی که شبیه
 * «چیزی نمی‌دانیم» است.
 */
export function portfolioSessionPositionsView(session, valuation = null) {
  const state = portfolioSessionPositions(session);
  if (!state.ok) return fail(state.reason, state.why);

  // ارزش‌گذاری اختیاری است: بدون آن جدول همان جدول قبلی است و نمی‌شکند.
  const valued = new Map();
  if (valuation?.ok) for (const row of valuation.rows) valued.set(row.id, row);
  const rows = state.positions.map((row) => toRow(row, valued.get(row.id) || null));
  const open = rows.filter((row) => row.status === 'open');
  const closed = rows.filter((row) => row.status === 'closed');

  return {
    ok: true,
    why: '',
    reason: null,
    now: state.now,
    empty: state.empty,
    note: state.empty ? faDigits(state.note) : '',
    rows,
    open,
    closed,
    countsText: `${count(state.counts.total)} موقعیت · `
      + `${count(state.counts.open)} باز · ${count(state.counts.closed)} بسته`,
    // پنهان‌کردنش یعنی ردیف‌های بی‌سند شبیه بقیه دیده می‌شوند.
    undocumentedText: state.counts.undocumented === 0 ? ''
      : `${count(state.counts.undocumented)} موقعیت سند طرحش خوانده نشد`,
    ...valuationSummary(valuation),
  };
}
