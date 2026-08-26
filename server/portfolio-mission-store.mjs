// ذخیره‌ساز نسخه‌دار مأموریت «سفر زمانی سبد».
//
// مرورگر فقط پیش‌نویس را می‌فرستد؛ این ماژول پیش از نوشتن، کل زنجیره را
// دوباره با قراردادهای هسته اعتبارسنجی می‌کند. بنابراین فایل روی دیسک منبع
// حقیقت است، اما راهی برای دورزدن اعتبارسنجی مالی هسته نیست.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PORTFOLIO_SCHEMA_VERSION, createPortfolioSession, replayPortfolioSession,
  setFamilyAllocations, setPortfolioMission,
} from '../core/portfolio-session.mjs';
import { isDataQuality } from '../core/data-quality.mjs';
import {
  MISSION_REPLAY_GRAINS, validateMissionLiquidity, validateMissionOutlook,
  validateMissionRisk,
} from '../core/portfolio-mission.mjs';
import { validSessionId } from './guard.mjs';

export const PORTFOLIO_MISSION_SAVE_VERSION = 1;
export const PORTFOLIO_MISSION_SAVE_STEPS = Object.freeze([
  'setup', 'outlook', 'risk', 'allocation', 'mission', 'active',
]);

const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const own = (row, key) => !!row && Object.prototype.hasOwnProperty.call(row, key);
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
let temporarySequence = 0;
let pendingWrite = Promise.resolve();

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

const same = (left, right) => JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

function fail(why, extra = {}) {
  return { ok: false, why, record: null, ...extra };
}

function draftSession(raw) {
  const session = raw?.session;
  if (!isObject(session)) return fail('پیش‌نویس باید جلسه معتبر داشته باشد');
  if (session.schemaVersion !== PORTFOLIO_SCHEMA_VERSION) {
    return fail('نسخه ساختار جلسه ناشناخته یا پشتیبانی‌نشده است');
  }
  if (!validSessionId(session.id)) return fail('شناسه جلسه معتبر نیست');
  if (!Number.isFinite(session.createdAt) || session.createdAt < 0) {
    return fail('زمان ساخت جلسه معتبر نیست');
  }
  if (!Array.isArray(session.allocations) || !Array.isArray(session.lockedAllocations)
    || !Array.isArray(session.dataWarnings) || !Array.isArray(session.events)
    || !isObject(session.counters)) {
    return fail('ساختار داخلی جلسه ناقص است');
  }
  for (const key of ['event', 'transaction', 'position', 'execution', 'lot']) {
    if (!Number.isInteger(session.counters[key]) || session.counters[key] < 0) {
      return fail('شمارنده‌های پایدار جلسه ناقص یا نامعتبرند');
    }
  }

  const made = createPortfolioSession({
    id: session.id,
    baseIns: session.baseIns,
    start: session.start,
    end: session.end,
    initialCapitalRial: session.capital?.initialRial,
    reserveRial: session.capital?.reserveRial,
    createdAt: session.createdAt,
  });
  if (!made.ok) return fail(made.why);
  if (session.portfolioId !== made.session.portfolioId
    || !same(session.start, made.session.start)
    || !same(session.end, made.session.end)) {
    return fail('هویت یا بازه جلسه با قرارداد هسته سازگار نیست');
  }
  return { ok: true, why: '', session, base: made.session };
}

function validReplay(draft) {
  const grain = String(draft?.replay?.grain || '');
  const row = MISSION_REPLAY_GRAINS[grain];
  return !!row && draft.replay.grainSeconds === row.seconds;
}

function validDraftShell(draft, state) {
  if (!validReplay(draft)) return fail('تایم‌فریم ذخیره‌شده معتبر نیست');
  if (state.session.state !== 'draft') return fail('مرحله پیش‌نویس باید جلسه پیش‌نویس داشته باشد');
  if (!Array.isArray(state.session.events) || state.session.events.length) {
    return fail('پیش‌نویس مأموریت نباید دفتر معامله داشته باشد');
  }
  if (state.session.startSnapshot || state.session.lockedMission
    || (state.session.lockedAllocations || []).length) {
    return fail('پیش‌نویس نمی‌تواند داده قفل‌شده جلسه فعال داشته باشد');
  }
  return { ok: true };
}

function canonicalOutlook(draft) {
  const checked = validateMissionOutlook(draft?.outlook);
  if (!checked.ok) return fail(checked.why);
  if (!same(draft.outlook, checked.outlook)) return fail('انتظار بازار ذخیره‌شده canonical نیست');
  return { ok: true, outlook: checked.outlook };
}

function canonicalRisk(draft) {
  const risk = validateMissionRisk(draft?.risk);
  if (!risk.ok) return fail(risk.why);
  const liquidity = validateMissionLiquidity(draft?.liquidity);
  if (!liquidity.ok) return fail(liquidity.why);
  if (!same(draft.risk, risk.risk) || !same(draft.liquidity, liquidity.liquidity)) {
    return fail('مرز ریسک یا نقدشوندگی ذخیره‌شده canonical نیست');
  }
  return { ok: true, risk: risk.risk, liquidity: liquidity.liquidity };
}

function canonicalAllocation(state) {
  const allocated = setFamilyAllocations(state.base, state.session.allocations);
  if (!allocated.ok) return fail(allocated.why);
  if (!same(state.session.allocations, allocated.session.allocations)
    || !same(state.session.capital, allocated.session.capital)) {
    return fail('تخصیص یا طرح سرمایه ذخیره‌شده با قرارداد هسته سازگار نیست');
  }
  return { ok: true, session: allocated.session };
}

function missionInput(mission) {
  return {
    objective: mission?.objective,
    replay: mission?.replay,
    outlook: mission?.outlook,
    risk: mission?.risk,
    liquidity: mission?.liquidity,
  };
}

function canonicalMission(draft, allocated) {
  if (!isObject(draft?.mission) || !same(draft.mission, draft.session?.mission)) {
    return fail('مأموریت ذخیره‌شده کامل یا همسان با جلسه نیست');
  }
  const missioned = setPortfolioMission(allocated.session, missionInput(draft.mission));
  if (!missioned.ok) return fail(missioned.why);
  if (!same(draft.mission, missioned.session.mission)) {
    return fail('مأموریت ذخیره‌شده با قرارداد هسته سازگار نیست');
  }
  return { ok: true, session: missioned.session };
}

function canonicalActive(draft, missioned) {
  const session = draft.session;
  if (session.state !== 'active') return fail('مرحله فعال باید جلسه فعال داشته باشد');
  if (!isObject(session.startSnapshot) || !same(draft.snapshot, session.startSnapshot)) {
    return fail('عکس شروع جلسه فعال کامل یا همسان نیست');
  }
  if (!same(session.lockedAllocations, session.allocations)
    || !same(session.lockedMission, session.mission)) {
    return fail('تصمیم‌های قفل‌شده جلسه فعال با مأموریت شروع همسان نیستند');
  }
  if (!same(session.lockedAllocations, missioned.session.allocations)
    || !same(session.lockedMission, missioned.session.mission)) {
    return fail('قفل جلسه فعال از قرارداد معتبر شروع ساخته نشده است');
  }
  if (!same(session.startSnapshot.at, session.start)
    || !isDataQuality(session.startSnapshot.quality)
    || !same(session.dataWarnings, session.startSnapshot.quality.reasons)) {
    return fail('لحظه یا مدرک کیفیت عکس شروع معتبر نیست');
  }
  const replayed = replayPortfolioSession(session);
  if (!replayed.ok) return fail(replayed.why);
  return { ok: true };
}

/** اعتبارسنجی و بازسازی یک رکورد خوانده‌شده از دیسک. */
export function restorePortfolioMissionSave(raw) {
  if (!isObject(raw)) return fail('رکورد ذخیره‌شده باید یک شیء باشد');
  if (raw.schemaVersion !== PORTFOLIO_MISSION_SAVE_VERSION) {
    return fail('نسخه ذخیره مأموریت ناشناخته یا پشتیبانی‌نشده است');
  }
  if (!validSessionId(raw.id)) return fail('شناسه رکورد ذخیره‌شده معتبر نیست');
  if (!Number.isInteger(raw.savedAt) || raw.savedAt < 0) return fail('زمان ذخیره معتبر نیست');
  if (!isObject(raw.draft)) return fail('بدنه پیش‌نویس ذخیره نشده است');
  const step = String(raw.draft.step || '');
  if (!PORTFOLIO_MISSION_SAVE_STEPS.includes(step)) return fail('مرحله ذخیره‌شده ناشناخته است');

  const state = draftSession(raw.draft);
  if (!state.ok) return state;
  if (state.session.id !== raw.id) return fail('شناسه رکورد با شناسه جلسه یکی نیست');

  if (step !== 'active') {
    const shell = validDraftShell(raw.draft, state);
    if (!shell.ok) return shell;
  }
  if (step === 'setup') {
    if (state.session.allocations?.length || state.session.mission) {
      return fail('مرحله نخست نباید تخصیص یا مأموریت داشته باشد');
    }
    if (!same(state.session.capital, state.base.capital)) return fail('طرح سرمایه ذخیره‌شده معتبر نیست');
  }

  if (['outlook', 'risk'].includes(step) && !same(state.session.capital, state.base.capital)) {
    return fail('طرح سرمایه ذخیره‌شده معتبر نیست');
  }

  if (['outlook', 'risk', 'allocation', 'mission', 'active'].includes(step)) {
    const outlook = canonicalOutlook(raw.draft);
    if (!outlook.ok) return outlook;
  }
  if (['risk', 'allocation', 'mission', 'active'].includes(step)) {
    const risk = canonicalRisk(raw.draft);
    if (!risk.ok) return risk;
  }

  let allocated = null;
  if (['allocation', 'mission', 'active'].includes(step)) {
    allocated = canonicalAllocation(state);
    if (!allocated.ok) return allocated;
  } else if (state.session.allocations?.length || state.session.mission) {
    return fail('مرحله ذخیره‌شده با داده مراحل بعدی آلوده است');
  }

  let missioned = null;
  if (['mission', 'active'].includes(step)) {
    missioned = canonicalMission(raw.draft, allocated);
    if (!missioned.ok) return missioned;
  } else if (state.session.mission || own(raw.draft, 'mission')) {
    return fail('مرحله ذخیره‌شده نباید مأموریت مرحله بعد را داشته باشد');
  }

  if (step === 'active') {
    const active = canonicalActive(raw.draft, missioned);
    if (!active.ok) return active;
  } else if (own(raw.draft, 'snapshot')) {
    return fail('پیش‌نویس هنوز نباید عکس شروع داشته باشد');
  }

  return { ok: true, why: '', record: copy(raw) };
}

/** ساخت رکوردی که زمان ذخیره و نسخه ساختارش صریح است. */
export function createPortfolioMissionSave(draft, { savedAt = Date.now() } = {}) {
  const raw = {
    schemaVersion: PORTFOLIO_MISSION_SAVE_VERSION,
    id: String(draft?.session?.id || ''),
    savedAt: Math.trunc(Number(savedAt)),
    draft: copy(draft),
  };
  return restorePortfolioMissionSave(raw);
}

export function portfolioMissionSaveSummary(record) {
  const restored = restorePortfolioMissionSave(record);
  if (!restored.ok) return null;
  const { id, savedAt, draft } = restored.record;
  return {
    id, savedAt, step: draft.step, state: draft.session.state,
    baseIns: draft.session.baseIns,
    start: copy(draft.session.start), end: copy(draft.session.end),
  };
}

/** جلسه فعال به پیش‌نویس برنمی‌گردد و قفل‌های شروع بازنویسی نمی‌شوند. */
export function validatePortfolioMissionSaveTransition(previous, next) {
  const before = restorePortfolioMissionSave(previous);
  if (!before.ok) return fail(`رکورد قبلی خراب است: ${before.why}`);
  const after = restorePortfolioMissionSave(next);
  if (!after.ok) return after;
  if (before.record.id !== after.record.id) return fail('شناسه جلسه هنگام ذخیره قابل تغییر نیست');
  if (before.record.draft.session.state !== 'active') return { ok: true, why: '' };
  if (after.record.draft.session.state !== 'active') return fail('جلسه فعال به پیش‌نویس برنمی‌گردد');

  const left = before.record.draft.session;
  const right = after.record.draft.session;
  for (const key of ['baseIns', 'start', 'end', 'capital', 'lockedAllocations', 'lockedMission', 'startSnapshot']) {
    if (!same(left[key], right[key])) return fail('تصمیم‌ها و عکس شروع جلسه فعال تغییرناپذیرند');
  }
  const oldEvents = left.events || [];
  const newEvents = right.events || [];
  if (newEvents.length < oldEvents.length || !same(oldEvents, newEvents.slice(0, oldEvents.length))) {
    return fail('دفتر رویداد جلسه فعال فقط می‌تواند به انتها افزوده شود');
  }
  return { ok: true, why: '' };
}

function recordFile(dir, id) {
  return validSessionId(id) ? path.join(dir, `${id}.json`) : null;
}

export async function loadPortfolioMissionSave(dir, id) {
  const file = recordFile(dir, id);
  if (!file) return fail('شناسه جلسه معتبر نیست');
  try {
    return restorePortfolioMissionSave(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return fail('جلسه پیدا نشد', { notFound: true });
    if (error instanceof SyntaxError) return fail('فایل جلسه JSON معتبر نیست', { broken: true });
    throw error;
  }
}

async function savePortfolioMissionDraftUnlocked(dir, draft, {
  savedAt = Date.now(), expectedSavedAt = null,
} = {}) {
  const made = createPortfolioMissionSave(draft, { savedAt });
  if (!made.ok) return made;
  const file = recordFile(dir, made.record.id);
  const previous = await loadPortfolioMissionSave(dir, made.record.id);
  if (!previous.ok && !previous.notFound) return previous;
  if (previous.ok) {
    if (expectedSavedAt !== null && Number(expectedSavedAt) !== previous.record.savedAt) {
      return fail('نسخه ذخیره‌شده در جای دیگری تغییر کرده است', { conflict: true });
    }
    if (made.record.savedAt < previous.record.savedAt) {
      return fail('زمان ذخیره جدید از نسخه موجود قدیمی‌تر است', { conflict: true });
    }
    const transition = validatePortfolioMissionSaveTransition(previous.record, made.record);
    if (!transition.ok) return transition;
  }
  await fs.mkdir(dir, { recursive: true });
  temporarySequence += 1;
  const temporary = `${file}.${process.pid}-${temporarySequence}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(made.record, null, 2), 'utf8');
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
  return made;
}

/** نوشتن‌ها سری می‌شوند تا دو autosave هم‌زمان کنترل نسخه را دور نزنند. */
export function savePortfolioMissionDraft(dir, draft, options = {}) {
  const operation = pendingWrite.then(() => savePortfolioMissionDraftUnlocked(dir, draft, options));
  pendingWrite = operation.catch(() => {});
  return operation;
}

export async function listPortfolioMissionSaves(dir) {
  let names = [];
  try { names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort(); }
  catch (error) {
    if (error?.code === 'ENOENT') return { ok: true, why: '', records: [] };
    throw error;
  }
  const records = [];
  for (const name of names) {
    const id = name.slice(0, -5);
    const loaded = await loadPortfolioMissionSave(dir, id);
    if (loaded.ok) records.push(portfolioMissionSaveSummary(loaded.record));
    else records.push({ id, broken: true, why: loaded.why });
  }
  records.sort((left, right) => (right.savedAt || 0) - (left.savedAt || 0));
  return { ok: true, why: '', records };
}
