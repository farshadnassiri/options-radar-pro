// تنها مرز شبکه برای پرونده‌های پایان جلسه.
// ذخیرهٔ ناموفق، پاسخ خطای سرور و حتی پاسخ ۲۰۰ ناقص همگی شکست‌اند؛ چون
// نشان دادن «ذخیره شد» بدون مدرک ثبت سرور، پرونده‌ای خیالی می‌سازد.

const DOSSIERS_URL = '/api/portfolio/dossiers';
const DOSSIER_URL = '/api/portfolio/dossier';

export const DOSSIER_SAVE_VERSION = 1;

async function requestJson(url, options, fetchImpl) {
  const call = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!call) return { ok: false, why: 'در این محیط شبکه در دسترس نیست', status: 0, body: null };
  let response;
  try { response = await call(url, options); }
  catch (error) {
    return { ok: false, why: `ارتباط با سرور برقرار نشد: ${error?.message || 'خطای نامعلوم شبکه'}`, status: 0, body: null };
  }
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    return {
      ok: false, why: body?.error || `درخواست ناموفق بود (${response.status})`,
      status: response.status, conflict: response.status === 409,
      notFound: response.status === 404, body,
    };
  }
  return { ok: true, why: '', status: response.status, body };
}

export async function listDossiers({ fetchImpl } = {}) {
  const result = await requestJson(DOSSIERS_URL, { method: 'GET' }, fetchImpl);
  if (!result.ok) return { ok: false, why: result.why, dossiers: [] };
  return {
    ok: true, why: '',
    dossiers: Array.isArray(result.body?.dossiers) ? result.body.dossiers : [],
  };
}

export async function loadDossier(id, { fetchImpl } = {}) {
  const result = await requestJson(`${DOSSIER_URL}?id=${encodeURIComponent(id)}`, { method: 'GET' }, fetchImpl);
  if (!result.ok) return { ok: false, why: result.why, notFound: !!result.notFound, record: null };
  return { ok: true, why: '', notFound: false, record: result.body };
}

export async function saveDossier(session, dossier, { fetchImpl } = {}) {
  const id = session?.id;
  if (typeof id !== 'string' || !id || dossier?.sessionId !== id) {
    return { ok: false, why: 'شناسه جلسه و پرونده معتبر و یکسان نیست', conflict: false, savedAt: null };
  }
  const result = await requestJson(`${DOSSIER_URL}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: DOSSIER_SAVE_VERSION, session, dossier }),
  }, fetchImpl);
  if (!result.ok) {
    return { ok: false, why: result.why, conflict: !!result.conflict, savedAt: null };
  }
  const savedAt = Number.isInteger(result.body?.savedAt) ? result.body.savedAt : null;
  if (savedAt === null) {
    return { ok: false, why: 'پاسخ سرور زمان ثبت معتبر نداشت', conflict: false, savedAt: null };
  }
  return { ok: true, why: '', conflict: false, savedAt, id };
}

/**
 * دروازهٔ اعلام موفقیت بستن جلسه.
 *
 * `closeoutView` جلسه را به‌صورت خالص می‌بندد، اما تب نباید آن جلسه را
 * مصرف کند تا سرور ثبتش را تأیید کرده باشد. در شکست، عمداً `view` و
 * `session` پس داده نمی‌شوند تا یک دستگیره نتواند اشتباهی حالت بسته را
 * به رابط نشت دهد.
 */
export async function persistDossierView(view, { saveImpl = saveDossier } = {}) {
  if (!view?.ok || view.session?.state !== 'closed' || !view.dossier) {
    return {
      ok: false, why: 'پرونده بسته‌شده معتبر و آماده ذخیره نیست',
      conflict: false, savedAt: null, view: null, session: null,
    };
  }
  const saved = await saveImpl(view.session, view.dossier);
  if (!saved?.ok) {
    return {
      ok: false, why: saved?.why || 'پرونده روی سرور ثبت نشد',
      conflict: !!saved?.conflict, savedAt: null, view: null, session: null,
    };
  }
  return {
    ok: true, why: '', conflict: false, savedAt: saved.savedAt,
    view, session: view.session,
  };
}
