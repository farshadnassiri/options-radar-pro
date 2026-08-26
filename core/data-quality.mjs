// قرارداد مشترک کیفیت داده.
//
// عدد مالی تنها وقتی قابل قضاوت است که معلوم باشد از چه منبعی، متعلق به
// چه لحظه‌ای و با چه سطحی از اتکا آمده. این ماژول عددی را تغییر نمی‌دهد؛
// فقط همان مدرکی را که باید کنار عدد تا گزارش و Excel بماند یک‌شکل می‌کند.

import { num } from './num.mjs';

export const DATA_QUALITY_VERSION = 1;

export const DATA_QUALITY_KINDS = {
  observed: 'مشاهده‌شده',
  executable: 'قابل اجرا',
  estimated: 'تخمینی',
  missing: 'فاقد داده',
};

const KIND_ORDER = { executable: 0, observed: 1, estimated: 2, missing: 3 };

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function reasonsOf(reason, reasons) {
  const all = [reason, ...(Array.isArray(reasons) ? reasons : [])]
    .map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(all)];
}

/** ساخت رکورد JSON-safe کیفیت با چهار نوع انحصاری و چهار پرچم صریح. */
export function makeDataQuality({
  kind = 'missing', source = '', asOf = null, sufficient = false,
  stale = false, reason = '', reasons = [], details = {},
} = {}) {
  const key = Object.prototype.hasOwnProperty.call(DATA_QUALITY_KINDS, kind) ? kind : 'missing';
  const why = reasonsOf(reason, reasons);
  return {
    version: DATA_QUALITY_VERSION,
    kind: key,
    label: DATA_QUALITY_KINDS[key],
    observed: key === 'observed',
    executable: key === 'executable',
    estimated: key === 'estimated',
    missing: key === 'missing',
    source: String(source || '').trim() || 'unknown',
    asOf: copy(asOf),
    sufficient: key !== 'missing' && !!sufficient,
    stale: !!stale,
    reason: why.join('؛ '),
    reasons: why,
    details: copy(details || {}),
  };
}

export function isDataQuality(value) {
  return !!value && value.version === DATA_QUALITY_VERSION
    && Object.prototype.hasOwnProperty.call(DATA_QUALITY_KINDS, value.kind)
    && typeof value.source === 'string' && Array.isArray(value.reasons);
}

/** ورودی قدیمی یا ناقص را بدون اعتماد به پرچم‌های دست‌ساز نرمال می‌کند. */
export function normalizeDataQuality(value = {}) {
  if (!value || typeof value !== 'object') return makeDataQuality();
  return makeDataQuality(value);
}

/**
 * کیفیت چند خوراک را برای یک snapshot جمع می‌کند.
 * بدترین نوع غالب است و یک خوراک گمشده با وجود سه خوراک خوب پنهان نمی‌شود.
 */
export function combineDataQuality(items = [], { source = 'combined', asOf = null } = {}) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean).map(normalizeDataQuality);
  if (!list.length) {
    return makeDataQuality({
      kind: 'missing', source, asOf, reason: 'هیچ مدرک کیفیتی برای این عکس ثبت نشده است',
    });
  }
  const worst = list.reduce((picked, row) => (
    KIND_ORDER[row.kind] > KIND_ORDER[picked.kind] ? row : picked
  ), list[0]);
  return makeDataQuality({
    kind: worst.kind,
    source,
    asOf: asOf ?? worst.asOf,
    sufficient: list.every((row) => row.sufficient),
    stale: list.some((row) => row.stale),
    reasons: list.flatMap((row) => row.reasons),
    details: {
      inputs: list.map((row) => ({
        source: row.source, kind: row.kind, sufficient: row.sufficient, stale: row.stale,
      })),
    },
  });
}

export function dailyDataQuality({ rows = [], source = 'historical-daily', now = null, partialDay = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const last = list[list.length - 1];
  return makeDataQuality({
    kind: list.length ? 'observed' : 'missing', source,
    asOf: last?.date ? { date: Number(last.date), second: 12 * 3600 + 30 * 60 } : copy(now),
    sufficient: list.length > 0,
    reason: list.length
      ? (partialDay ? 'ردیف روز جاری عمداً کنار گذاشته شد و باید از داده درون‌روزی ساخته شود' : '')
      : 'سری روزانه تا این لحظه ردیفی ندارد',
    details: { rows: list.length, partialDay: !!partialDay },
  });
}

export function intradayDataQuality({ rows = [], source = 'historical-trades', date = 0, now = null } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const last = list.reduce((best, row) => {
    const second = Number.isFinite(num(row?.second, NaN))
      ? num(row.second)
      : hmsSecond(row?.time ?? row?.hEven);
    return Number.isFinite(second) && second > best ? second : best;
  }, -Infinity);
  return makeDataQuality({
    kind: list.length ? 'observed' : 'missing', source,
    asOf: Number.isFinite(last) ? { date: Number(date) || Number(now?.date) || 0, second: last } : copy(now),
    sufficient: list.length > 0,
    reason: list.length ? '' : 'تا این لحظه ریزمعامله‌ای ثبت نشده است',
    details: { rows: list.length },
  });
}

function hmsSecond(value) {
  const raw = String(Math.max(0, Math.trunc(num(value, 0)))).padStart(6, '0').slice(-6);
  const hour = Number(raw.slice(0, 2));
  const minute = Number(raw.slice(2, 4));
  const second = Number(raw.slice(4, 6));
  return hour <= 23 && minute <= 59 && second <= 59
    ? hour * 3600 + minute * 60 + second : NaN;
}

export function bookDataQuality(snapshot, { date = 0, source = 'best-limits-history', staleAfterSec = 300 } = {}) {
  if (!snapshot?.book?.length) {
    return makeDataQuality({
      kind: 'missing', source, asOf: date ? { date, second: snapshot?.second ?? 0 } : null,
      reason: 'در آن لحظه دفتر سفارشی قابل بازسازی نبود',
    });
  }
  const book = snapshot.book;
  const hasBid = book.some((row) => num(row?.bid, 0) > 0 && num(row?.bidQty, 0) > 0);
  const hasAsk = book.some((row) => num(row?.ask, 0) > 0 && num(row?.askQty, 0) > 0);
  const sane = snapshot.sane !== false;
  const executable = sane && hasBid && hasAsk;
  const ageSec = Math.max(0, num(snapshot.ageSec, 0));
  const stale = Number.isFinite(staleAfterSec) && ageSec > staleAfterSec;
  const reasons = [];
  if (!sane) reasons.push('چیدمان سطوح دفتر معتبر نیست');
  if (!hasBid || !hasAsk) reasons.push('یکی از سمت‌های قابل معامله دفتر خالی است');
  if (!snapshot.complete) reasons.push('هر پنج سطح دفتر شناخته‌شده نیست');
  if (stale) reasons.push('تازه‌ترین تغییر دفتر از آستانه کهنگی قدیمی‌تر است');
  return makeDataQuality({
    kind: executable ? 'executable' : 'observed', source,
    asOf: { date: Number(date) || 0, second: num(snapshot.at, snapshot.second) },
    sufficient: executable && !!snapshot.complete && !stale, stale, reasons,
    details: {
      levelsKnown: num(snapshot.levelsKnown, book.length),
      levelsTotal: num(snapshot.levelsTotal, 5), ageSec,
      sane, crossed: !!snapshot.crossed, refIdKnown: snapshot.refIdKnown !== false,
    },
  });
}

export function universeDataQuality({
  wanted = 0, found = false, rows = [], firstDate = 0, source = '', asOf = null, note = '',
} = {}) {
  const count = Array.isArray(rows) ? rows.length : Math.max(0, Math.trunc(num(rows, 0)));
  if (!count) {
    return makeDataQuality({
      kind: 'missing', source: source || 'option-universe', asOf,
      reason: note || 'فهرست قراردادها خالی است', details: { wanted, firstDate, rows: 0 },
    });
  }
  if (wanted && !found) {
    return makeDataQuality({
      kind: 'estimated', source: source || 'current-watch-fallback', asOf,
      sufficient: false,
      reason: note || 'فهرست امروز جای فهرست تاریخ مقصد نشسته و سوگیری بقا دارد',
      details: { wanted, firstDate, rows: count, survivalBias: true },
    });
  }
  return makeDataQuality({
    kind: 'observed', source: source || (found ? 'watch-archive' : 'option-watch'), asOf,
    sufficient: true, reason: note,
    details: { wanted, firstDate, rows: count, survivalBias: false },
  });
}
