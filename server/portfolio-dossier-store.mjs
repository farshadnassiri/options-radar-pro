// ذخیره‌ساز نسخه‌دار پروندهٔ پایان جلسه.
//
// پرونده سندِ یک رویداد یک‌طرفه است: جلسه فقط یک بار بسته می‌شود. بنابراین
// برخلاف autosave مأموریت، اینجا بازنویسی و کنترل نسخه معنی ندارد؛ فایل با
// حالت انحصاری ساخته می‌شود و وجود قبلی آن یک تعارض صریح است.

import fs from 'node:fs/promises';
import path from 'node:path';
import { PORTFOLIO_CLOSEOUT_VERSION } from '../core/portfolio-closeout.mjs';
import { PORTFOLIO_SCHEMA_VERSION, replayPortfolioSession } from '../core/portfolio-session.mjs';
import { momentKey } from '../core/trading-calendar.mjs';
import { validSessionId } from './guard.mjs';

export const PORTFOLIO_DOSSIER_SAVE_VERSION = 1;

const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function fail(why, extra = {}) {
  return { ok: false, why, record: null, ...extra };
}

function validMoment(value) {
  return isObject(value) && Number.isFinite(momentKey(value));
}

function validDossierShape(dossier) {
  if (!isObject(dossier)) return fail('بدنه پرونده پایان لازم است');
  if (dossier.version !== PORTFOLIO_CLOSEOUT_VERSION) {
    return fail('نسخه پرونده پایان ناشناخته یا پشتیبانی‌نشده است');
  }
  if (!validSessionId(dossier.sessionId)) return fail('شناسه جلسه در پرونده معتبر نیست');
  if (!validMoment(dossier.start) || !validMoment(dossier.end) || !validMoment(dossier.closedAt)) {
    return fail('زمان‌های پرونده پایان معتبر نیستند');
  }
  if (!isObject(dossier.realized) || !Array.isArray(dossier.realized.rows)
    || !Array.isArray(dossier.realized.unknown)) {
    return fail('سود و زیان تحقق‌یافته پرونده ناقص است');
  }
  if (!isObject(dossier.positions) || !Array.isArray(dossier.positions.openIds)) {
    return fail('وضعیت موقعیت‌های پرونده ناقص است');
  }
  const counts = ['total', 'open', 'closed', 'openQty'];
  if (counts.some((key) => !Number.isInteger(dossier.positions[key]) || dossier.positions[key] < 0)
    || dossier.positions.open + dossier.positions.closed !== dossier.positions.total) {
    return fail('شمار موقعیت‌های پرونده معتبر نیست');
  }
  if (!Array.isArray(dossier.alerts)) return fail('هشدارهای پرونده ناقص است');
  return { ok: true, why: '' };
}

/** اعتبارسنجی رکورد کامل خوانده‌شده از دیسک. */
export function restorePortfolioDossierSave(raw) {
  if (!isObject(raw)) return fail('رکورد پرونده باید یک شیء باشد');
  if (raw.schemaVersion !== PORTFOLIO_DOSSIER_SAVE_VERSION) {
    return fail('نسخه ذخیره پرونده ناشناخته یا پشتیبانی‌نشده است');
  }
  if (!validSessionId(raw.id)) return fail('شناسه رکورد پرونده معتبر نیست');
  if (!Number.isInteger(raw.savedAt) || raw.savedAt < 0) return fail('زمان ذخیره پرونده معتبر نیست');
  if (!isObject(raw.session)) return fail('جلسه بسته‌شده در پرونده نیست');
  if (raw.session.schemaVersion !== PORTFOLIO_SCHEMA_VERSION) {
    return fail('نسخه ساختار جلسه ناشناخته یا پشتیبانی‌نشده است');
  }
  if (raw.session.state !== 'closed') return fail('فقط جلسه بسته‌شده پرونده دارد');
  if (raw.session.id !== raw.id) return fail('شناسه رکورد با شناسه جلسه یکی نیست');

  const dossier = validDossierShape(raw.dossier);
  if (!dossier.ok) return dossier;
  if (raw.dossier.sessionId !== raw.id) return fail('شناسه پرونده با شناسه جلسه یکی نیست');
  if (!same(raw.session.start, raw.dossier.start) || !same(raw.session.end, raw.dossier.end)
    || !same(raw.session.closedAt, raw.dossier.closedAt)) {
    return fail('بازه یا زمان بستن پرونده با جلسه یکی نیست');
  }
  const replayed = replayPortfolioSession(raw.session);
  if (!replayed.ok) return fail(replayed.why);
  return { ok: true, why: '', record: copy(raw) };
}

/** بسته‌بندی خروج معتبر موتور با نسخه و زمان ثبت سرور. */
export function createPortfolioDossierSave(session, dossier, { savedAt = Date.now() } = {}) {
  const raw = {
    schemaVersion: PORTFOLIO_DOSSIER_SAVE_VERSION,
    id: String(session?.id || ''),
    savedAt: Math.trunc(Number(savedAt)),
    session: copy(session),
    dossier: copy(dossier),
  };
  return restorePortfolioDossierSave(raw);
}

export function portfolioDossierSaveSummary(record) {
  const restored = restorePortfolioDossierSave(record);
  if (!restored.ok) return null;
  const { id, savedAt, dossier } = restored.record;
  return {
    id, savedAt, closedAt: copy(dossier.closedAt), early: dossier.early === true,
    start: copy(dossier.start), end: copy(dossier.end),
    positions: copy(dossier.positions),
  };
}

function recordFile(dir, id) {
  return validSessionId(id) ? path.join(dir, `${id}.json`) : null;
}

export async function loadPortfolioDossierSave(dir, id) {
  const file = recordFile(dir, id);
  if (!file) return fail('شناسه جلسه معتبر نیست');
  try {
    return restorePortfolioDossierSave(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return fail('پرونده پیدا نشد', { notFound: true });
    if (error instanceof SyntaxError) return fail('فایل پرونده JSON معتبر نیست', { broken: true });
    throw error;
  }
}

/** پرونده موجود هرگز بازنویسی نمی‌شود؛ `wx` این قاعده را در خود فایل‌سیستم قفل می‌کند. */
export async function savePortfolioDossier(dir, session, dossier, { savedAt = Date.now() } = {}) {
  const made = createPortfolioDossierSave(session, dossier, { savedAt });
  if (!made.ok) return made;
  const file = recordFile(dir, made.record.id);
  await fs.mkdir(dir, { recursive: true });
  let handle;
  try {
    handle = await fs.open(file, 'wx');
    await handle.writeFile(JSON.stringify(made.record, null, 2), 'utf8');
    await handle.close();
    handle = null;
    return made;
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      await fs.rm(file, { force: true }).catch(() => {});
    }
    if (error?.code === 'EEXIST') {
      return fail('این جلسه از پیش پرونده پایان دارد', { conflict: true });
    }
    throw error;
  }
}

export async function listPortfolioDossierSaves(dir) {
  let names = [];
  try { names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort(); }
  catch (error) {
    if (error?.code === 'ENOENT') return { ok: true, why: '', records: [] };
    throw error;
  }
  const records = [];
  for (const name of names) {
    const id = name.slice(0, -5);
    const loaded = await loadPortfolioDossierSave(dir, id);
    const summary = loaded.ok ? portfolioDossierSaveSummary(loaded.record) : null;
    records.push(summary || { id, broken: true, why: loaded.why });
  }
  records.sort((left, right) => {
    const leftKey = left.broken ? -Infinity : momentKey(left.closedAt);
    const rightKey = right.broken ? -Infinity : momentKey(right.closedAt);
    return rightKey - leftKey || String(left.id).localeCompare(String(right.id));
  });
  return { ok: true, why: '', records };
}
