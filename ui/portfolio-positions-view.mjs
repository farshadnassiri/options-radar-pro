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

import { fmt, faDigits } from './fmt.mjs';
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

/** یک ردیف موقعیت، آمادهٔ نمایش. */
function toRow(row) {
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
    // پاها هرکدام یک عبارت کامل‌اند؛ ستون‌بندی‌شان کار تب است.
    legTexts: (row.legs || []).map(legText),
    documented: row.documented,
    // موقعیت بی‌سند شبیه موقعیت سالم دیده نمی‌شود.
    why: faDigits(text(row.why)),
    qualityLabel: quality.label,
    qualityReason: quality.reason,
    qualityEstimated: Boolean(quality.estimated),
  };
}

/**
 * موقعیت‌های یک جلسه، آمادهٔ نمایش.
 *
 * جلسهٔ بدون موقعیت هم جواب می‌گیرد — با جمله، نه جدول خالی که شبیه
 * «چیزی نمی‌دانیم» است.
 */
export function portfolioSessionPositionsView(session) {
  const state = portfolioSessionPositions(session);
  if (!state.ok) return fail(state.reason, state.why);

  const rows = state.positions.map(toRow);
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
  };
}
