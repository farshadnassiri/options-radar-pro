// مدل جلسه و دفتر رویداد «استودیوی سفر زمانی سبد» — پایه مشترک رابط و گزارش.
//
// این فایل قیمت‌گذاری، وجه تضمین یا سود و زیان تازه‌ای اختراع نمی‌کند.
// وظیفه‌اش فقط نگه‌داشتن قرارداد جلسه است: سرمایه شروع، ذخیره، تخصیص
// خانواده‌ها، شناسه‌های پایدار و ترتیب تغییرناپذیر تراکنش‌ها. محاسبات
// مالی در فازهای بعد از موتورهای مشترک `exec`، `margin` و `payoff` می‌آیند.
//
// دفتر رویداد به‌جای نگه‌داشتن «وضعیت نهایی قابل ویرایش» نگه داشته می‌شود
// تا هر عامل بعدی بتواند با اجرای دوباره همان رویدادها، دقیقاً همان سبد را
// بازسازی کند. افزایش یا کاهش حجم هرگز معامله قبلی را بازنویسی نمی‌کند.

import { EPS, num } from './num.mjs';
import { moment, momentKey, sameMoment } from './trading-calendar.mjs';
import { DEFAULT_CAPITAL_RIAL } from './bereket-session.mjs';
import { combineDataQuality } from './data-quality.mjs';
import { createPortfolioMission } from './portfolio-mission.mjs';

export const PORTFOLIO_SCHEMA_VERSION = 1;

export const PORTFOLIO_SESSION_STATES = {
  draft: 'پیش‌نویس',
  active: 'فعال',
  closed: 'بسته',
};

export const PORTFOLIO_TRANSACTION_KINDS = {
  open: 'ورود',
  increase: 'افزایش حجم',
  reduce: 'کاهش حجم',
  close: 'آفست کامل',
  rollOut: 'خروج رول',
  rollIn: 'ورود رول',
  settlement: 'تسویه',
  exercise: 'اعمال',
};

const OPEN_KINDS = new Set(['open', 'rollIn']);
const ADD_KINDS = new Set(['open', 'increase', 'rollIn']);
const PARTIAL_CLOSE_KINDS = new Set(['reduce', 'rollOut']);
const FULL_CLOSE_KINDS = new Set(['close', 'settlement', 'exercise']);
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

const copy = (value) => {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }
  return value;
};

const positiveInt = (value) => {
  const out = num(value, NaN);
  return Number.isSafeInteger(out) && out > 0 ? out : NaN;
};

const validMoment = (point) => Number.isFinite(momentKey(point));

const withinSession = (session, point) => {
  const key = momentKey(point);
  return Number.isFinite(key)
    && key >= momentKey(session?.start)
    && key <= momentKey(session?.end);
};

function issue(counters, key, prefix, sessionId) {
  const next = Math.max(0, Math.trunc(num(counters?.[key], 0))) + 1;
  return {
    id: `${prefix}-${sessionId}-${next}`,
    counters: { ...(counters || {}), [key]: next },
  };
}

/**
 * جلسه خالی سبد.
 *
 * `reserveRial` اگر صریح داده شود بر `reservePct` مقدم است. هر دو فقط
 * طرح سرمایه‌اند؛ هنوز پولی خرج نشده. واحد داخلی همیشه ریال است.
 */
export function createPortfolioSession({
  id = '', baseIns = '', start, end,
  initialCapitalRial = DEFAULT_CAPITAL_RIAL,
  reservePct = 0, reserveRial,
  createdAt = 0,
} = {}) {
  const sessionId = String(id || '').trim();
  const instrument = String(baseIns || '').trim();
  if (!SESSION_ID_RE.test(sessionId)) {
    return { ok: false, why: 'شناسه جلسه باید فقط از حرف لاتین، رقم، خط تیره یا زیرخط ساخته شود', session: null };
  }
  if (!instrument) return { ok: false, why: 'شناسه نماد پایه لازم است', session: null };

  const from = moment(start?.date, start?.second);
  const to = moment(end?.date, end?.second);
  if (!validMoment(from) || !validMoment(to) || momentKey(to) <= momentKey(from)) {
    return { ok: false, why: 'لحظه پایان باید معتبر و بعد از لحظه شروع باشد', session: null };
  }

  const initial = Math.trunc(num(initialCapitalRial, NaN));
  if (!(initial > 0)) return { ok: false, why: 'سرمایه شروع باید مثبت باشد', session: null };

  const pct = num(reservePct, NaN);
  const explicitReserve = reserveRial !== undefined && reserveRial !== null && reserveRial !== '';
  if ((!explicitReserve && (!Number.isFinite(pct) || pct < 0 || pct > 100))) {
    return { ok: false, why: 'درصد ذخیره باید بین صفر و صد باشد', session: null };
  }
  const reserve = Math.trunc(explicitReserve ? num(reserveRial, NaN) : initial * pct / 100);
  if (!Number.isFinite(reserve) || reserve < 0 || reserve > initial) {
    return { ok: false, why: 'ذخیره نقدی باید بین صفر و سرمایه شروع باشد', session: null };
  }

  const capital = {
    initialRial: initial,
    reserveRial: reserve,
    reservePct: initial > 0 ? (reserve / initial) * 100 : NaN,
    allocatableRial: initial - reserve,
    assignedRial: 0,
    unassignedRial: initial - reserve,
  };

  return {
    ok: true,
    why: '',
    session: {
      schemaVersion: PORTFOLIO_SCHEMA_VERSION,
      id: sessionId,
      portfolioId: `pf-${sessionId}`,
      baseIns: instrument,
      start: { ...from },
      end: { ...to },
      now: { ...from },
      state: 'draft',
      createdAt: num(createdAt, 0),
      capital,
      allocations: [],
      lockedAllocations: [],
      mission: null,
      lockedMission: null,
      startSnapshot: null,
      dataWarnings: [],
      events: [],
      counters: { event: 0, transaction: 0, position: 0, execution: 0, lot: 0 },
    },
  };
}

/** ثبت یا جایگزینی مأموریت فقط تا پیش از فعال‌شدن جلسه. */
export function setPortfolioMission(session, input = {}) {
  if (!session || session.state !== 'draft') {
    return { ok: false, why: 'مأموریت فقط در پیش‌نویس جلسه قابل تغییر است', session };
  }
  const made = createPortfolioMission(session, input);
  if (!made.ok) return { ok: false, why: made.why, session };
  return {
    ok: true,
    why: '',
    mission: copy(made.mission),
    session: { ...session, mission: copy(made.mission) },
  };
}

/**
 * تخصیص هدف خانواده‌ها روی سرمایه قابل تخصیص.
 *
 * جمع می‌تواند کمتر از صد باشد؛ باقی‌مانده عمداً نقد و «تخصیص‌نیافته»
 * می‌ماند. بیشتر از صد هرگز با کوچک‌سازی پنهان اصلاح نمی‌شود.
 */
export function setFamilyAllocations(session, rows = []) {
  if (!session || session.state !== 'draft') {
    return { ok: false, why: 'تخصیص فقط در پیش‌نویس جلسه قابل تغییر است', session };
  }
  if (!Array.isArray(rows) || !rows.length) {
    return { ok: false, why: 'دست‌کم یک خانواده استراتژی لازم است', session };
  }

  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    const familyId = String(row?.familyId || '').trim();
    const pct = num(row?.pct, NaN);
    if (!familyId) return { ok: false, why: 'شناسه خانواده استراتژی لازم است', session };
    if (seen.has(familyId)) return { ok: false, why: `خانواده ${familyId} تکراری است`, session };
    if (!Number.isFinite(pct) || !(pct > 0) || pct > 100) {
      return { ok: false, why: 'درصد هر خانواده باید بزرگ‌تر از صفر و حداکثر صد باشد', session };
    }
    seen.add(familyId);
    normalized.push({ familyId, pct, label: String(row?.label || '').trim() });
  }

  const totalPct = normalized.reduce((sum, row) => sum + row.pct, 0);
  if (totalPct > 100 + EPS) {
    return { ok: false, why: 'مجموع تخصیص خانواده‌ها از صد درصد بیشتر است', session };
  }

  const allocatable = Math.max(0, Math.trunc(num(session.capital?.allocatableRial, 0)));
  const allocations = normalized.map((row) => ({
    ...row,
    targetRial: Math.floor(allocatable * row.pct / 100),
  }));
  const assigned = allocations.reduce((sum, row) => sum + row.targetRial, 0);

  return {
    ok: true,
    why: '',
    session: {
      ...session,
      capital: {
        ...session.capital,
        assignedRial: assigned,
        unassignedRial: Math.max(0, allocatable - assigned),
      },
      allocations,
    },
  };
}

/** قفل طرح سرمایه و آغاز دفتر رویداد در همان لحظه شروع. */
export function activatePortfolioSession(session, { at = null, snapshot = null } = {}) {
  if (!session || session.state !== 'draft') {
    return { ok: false, why: 'فقط پیش‌نویس را می‌شود فعال کرد', session };
  }
  if (!session.allocations?.length) {
    return { ok: false, why: 'پیش از فعال‌کردن باید تخصیص خانواده‌ها ثبت شود', session };
  }
  if (!session.mission) {
    return { ok: false, why: 'پیش از فعال‌کردن باید مأموریت سبد ثبت شود', session };
  }
  const point = at ? moment(at.date, at.second) : moment(session.start.date, session.start.second);
  if (!sameMoment(point, session.start)) {
    return { ok: false, why: 'عکس شروع باید دقیقاً در لحظه شروع جلسه قفل شود', session };
  }
  const rawSnapshot = snapshot && typeof snapshot === 'object' ? copy(snapshot) : {};
  const qualities = [
    rawSnapshot.quality,
    rawSnapshot.universe?.quality,
    rawSnapshot.daily?.quality,
    rawSnapshot.intraday?.quality,
    rawSnapshot.book?.quality,
  ].filter(Boolean);
  const quality = combineDataQuality(qualities, {
    source: 'portfolio-start-snapshot', asOf: point,
  });
  const startSnapshot = { ...rawSnapshot, at: { ...point }, quality };
  return {
    ok: true,
    why: '',
    session: {
      ...session,
      state: 'active',
      now: { ...point },
      lockedAllocations: copy(session.allocations),
      lockedMission: copy(session.mission),
      startSnapshot,
      dataWarnings: quality.reasons.slice(),
    },
  };
}

function consumeFifo(lots, qty) {
  let left = qty;
  const consumed = [];
  const next = lots.map((lot) => {
    if (!(left > 0) || !(lot.remainingQty > 0)) return { ...lot };
    const take = Math.min(left, lot.remainingQty);
    left -= take;
    consumed.push({ lotId: lot.id, qty: take });
    return { ...lot, remainingQty: lot.remainingQty - take };
  });
  return { lots: next, consumed, left };
}

/** بازسازی وضعیت سبد فقط از دفتر رویداد. */
export function replayPortfolioSession(session) {
  if (!session) return { ok: false, why: 'جلسه‌ای در کار نیست', positions: [] };
  const positions = new Map();
  let lastKey = momentKey(session.start);

  for (const event of session.events || []) {
    if (event?.type !== 'transaction') continue;
    const key = momentKey(event.at);
    if (!Number.isFinite(key) || key < lastKey) {
      return { ok: false, why: 'ترتیب زمانی دفتر رویداد معتبر نیست', positions: [...positions.values()] };
    }
    lastKey = key;
    const kind = event.transactionKind;
    const positionId = String(event.positionId || '');

    if (OPEN_KINDS.has(kind)) {
      if (positions.has(positionId)) {
        return { ok: false, why: `شناسه موقعیت ${positionId} تکراری است`, positions: [...positions.values()] };
      }
      positions.set(positionId, {
        id: positionId,
        strategyId: event.strategyId,
        familyId: event.familyId,
        status: 'open',
        openedAt: { ...event.at },
        closedAt: null,
        initialQty: event.qty,
        openQty: event.qty,
        lots: [{
          id: event.lotId,
          transactionId: event.transactionId,
          openedAt: { ...event.at },
          initialQty: event.qty,
          remainingQty: event.qty,
        }],
        transactionIds: [event.transactionId],
      });
      continue;
    }

    const current = positions.get(positionId);
    if (!current || current.status !== 'open') {
      return { ok: false, why: `موقعیت باز ${positionId} پیدا نشد`, positions: [...positions.values()] };
    }

    if (kind === 'increase') {
      positions.set(positionId, {
        ...current,
        openQty: current.openQty + event.qty,
        lots: [...current.lots, {
          id: event.lotId,
          transactionId: event.transactionId,
          openedAt: { ...event.at },
          initialQty: event.qty,
          remainingQty: event.qty,
        }],
        transactionIds: [...current.transactionIds, event.transactionId],
      });
      continue;
    }

    if (PARTIAL_CLOSE_KINDS.has(kind) || FULL_CLOSE_KINDS.has(kind)) {
      const used = consumeFifo(current.lots, event.qty);
      if (used.left > 0) {
        return { ok: false, why: `حجم خروج از حجم باز ${positionId} بیشتر است`, positions: [...positions.values()] };
      }
      const openQty = current.openQty - event.qty;
      positions.set(positionId, {
        ...current,
        status: openQty === 0 ? 'closed' : 'open',
        openQty,
        closedAt: openQty === 0 ? { ...event.at } : null,
        lots: used.lots,
        transactionIds: [...current.transactionIds, event.transactionId],
      });
      continue;
    }

    return { ok: false, why: `نوع تراکنش ${kind} شناخته نشد`, positions: [...positions.values()] };
  }

  const list = [...positions.values()].map(copy);
  return {
    ok: true,
    why: '',
    positions: list,
    openPositions: list.filter((row) => row.status === 'open'),
    closedPositions: list.filter((row) => row.status === 'closed'),
    lastMoment: (session.events || []).length
      ? { ...(session.events[session.events.length - 1].at || session.start) }
      : { ...session.start },
  };
}

/**
 * ثبت یک تراکنش تازه با شناسه‌های ساخته‌شده از شمارنده‌های خود جلسه.
 * شناسه‌ها از ساعت دیواری یا `Math.random` نمی‌آیند، پس JSON round-trip و
 * بازسازی جلسه آن‌ها را تغییر نمی‌دهد.
 */
export function recordPortfolioTransaction(session, transaction = {}) {
  if (!session || session.state !== 'active') {
    return { ok: false, why: 'تراکنش فقط در جلسه فعال ثبت می‌شود', session };
  }
  const kind = String(transaction.kind || '');
  if (!Object.prototype.hasOwnProperty.call(PORTFOLIO_TRANSACTION_KINDS, kind)) {
    return { ok: false, why: 'نوع تراکنش معتبر نیست', session };
  }

  const at = moment(transaction.at?.date ?? session.now?.date, transaction.at?.second ?? session.now?.second);
  if (!withinSession(session, at)) {
    return { ok: false, why: 'لحظه تراکنش بیرون از بازه جلسه است', session };
  }
  const last = (session.events || []).length ? session.events[session.events.length - 1].at : session.start;
  if (momentKey(at) < momentKey(last)) {
    return { ok: false, why: 'دفتر رویداد زمان را به عقب نمی‌برد', session };
  }

  const derived = replayPortfolioSession(session);
  if (!derived.ok) return { ok: false, why: derived.why, session };

  let counters = { ...session.counters };
  let positionId = String(transaction.positionId || '').trim();
  let strategyId = String(transaction.strategyId || '').trim();
  let familyId = String(transaction.familyId || '').trim();
  let qty = positiveInt(transaction.qty);

  if (OPEN_KINDS.has(kind)) {
    if (!strategyId || !familyId) {
      return { ok: false, why: 'ورود تازه به شناسه استراتژی و خانواده نیاز دارد', session };
    }
    const issued = issue(counters, 'position', 'pos', session.id);
    positionId = issued.id;
    counters = issued.counters;
  } else {
    const current = derived.positions.find((row) => row.id === positionId && row.status === 'open');
    if (!current) return { ok: false, why: 'موقعیت باز برای این تراکنش پیدا نشد', session };
    strategyId = current.strategyId;
    familyId = current.familyId;
    if (FULL_CLOSE_KINDS.has(kind)) qty = current.openQty;
    if (!Number.isFinite(qty) || qty > current.openQty) {
      return { ok: false, why: 'حجم خروج از حجم باز بیشتر است', session };
    }
  }

  if (!Number.isFinite(qty)) return { ok: false, why: 'حجم تراکنش باید عدد صحیح مثبت باشد', session };
  if ((kind === 'rollIn' || kind === 'rollOut') && !String(transaction.rollGroupId || '').trim()) {
    return { ok: false, why: 'تراکنش رول به شناسه گروه رول نیاز دارد', session };
  }

  const eventIssued = issue(counters, 'event', 'evt', session.id);
  counters = eventIssued.counters;
  const txIssued = issue(counters, 'transaction', 'txn', session.id);
  counters = txIssued.counters;

  let lotId = '';
  if (ADD_KINDS.has(kind)) {
    const lotIssued = issue(counters, 'lot', 'lot', session.id);
    lotId = lotIssued.id;
    counters = lotIssued.counters;
  }

  const executions = [];
  for (const raw of Array.isArray(transaction.executions) ? transaction.executions : []) {
    const issued = issue(counters, 'execution', 'exe', session.id);
    counters = issued.counters;
    executions.push({ ...copy(raw), id: issued.id });
  }

  let consumedLots = [];
  if (!OPEN_KINDS.has(kind) && (PARTIAL_CLOSE_KINDS.has(kind) || FULL_CLOSE_KINDS.has(kind))) {
    const current = derived.positions.find((row) => row.id === positionId);
    consumedLots = consumeFifo(current?.lots || [], qty).consumed;
  }

  const event = {
    id: eventIssued.id,
    type: 'transaction',
    transactionId: txIssued.id,
    transactionKind: kind,
    transactionLabel: PORTFOLIO_TRANSACTION_KINDS[kind],
    at: { ...at },
    positionId,
    strategyId,
    familyId,
    qty,
    lotId,
    consumedLots,
    rollGroupId: String(transaction.rollGroupId || '').trim(),
    executions,
    data: copy(transaction.data || {}),
  };

  const nextSession = {
    ...session,
    now: { ...at },
    events: [...session.events, event],
    counters,
  };
  const checked = replayPortfolioSession(nextSession);
  if (!checked.ok) return { ok: false, why: checked.why, session };

  return {
    ok: true,
    why: '',
    session: nextSession,
    event: copy(event),
    positionId,
    transactionId: event.transactionId,
    executionIds: executions.map((row) => row.id),
    lotId,
  };
}

/** خلاصه طرح سرمایه؛ هنوز ادعای ارزش جاری یا P&L ندارد. */
export function portfolioCapitalPlan(session) {
  if (!session?.capital) return null;
  return {
    initialRial: num(session.capital.initialRial, NaN),
    reserveRial: num(session.capital.reserveRial, NaN),
    allocatableRial: num(session.capital.allocatableRial, NaN),
    assignedRial: num(session.capital.assignedRial, NaN),
    unassignedRial: num(session.capital.unassignedRial, NaN),
    allocationPct: (session.allocations || []).reduce((sum, row) => sum + num(row.pct, 0), 0),
  };
}
