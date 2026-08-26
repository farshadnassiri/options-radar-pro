// تنها جایی که استودیوی سفر زمانی سبد با شبکه حرف می‌زند.
//
// منبع حقیقت، فایل نسخه‌دار سرور است — نه `localStorage` و نه حافظهٔ تب.
// دلیلش این نیست که مرورگر جای بدی برای ذخیره است؛ این است که یک مأموریت
// شروع‌شده سندی است که بعداً بازپخش و حسابرسی می‌شود. اگر کاربر بتواند با
// پاک کردن حافظهٔ مرورگر نسخهٔ دیگری از آن بسازد، هر عددی که از بازپخش
// دربیاید بی‌معنا می‌شود.
//
// قاعدهٔ خطا در این فایل یکی است و استثنا ندارد: **ذخیرهٔ ناموفق هرگز
// موفق برنمی‌گردد.** نه شبکهٔ قطع، نه ۵۰۰ سرور، نه تعارض نسخه. هر سه
// `{ ok: false, why }` می‌دهند با متنی که بشود سر کنترل ادامه نشان داد.
// این همان قاعدهٔ صداقت عددی است، در لباس شبکه.

const SESSIONS_URL = '/api/portfolio/sessions';
const SESSION_URL = '/api/portfolio/session';

export const MISSION_SAVE_VERSION = 1;

/**
 * درخواست JSON با خطای فارسیِ قابل نمایش.
 *
 * `fetchImpl` تزریقی است تا آزمون بتواند شبکه را بدون مرورگر بسنجد؛
 * پیش‌فرضش همان `fetch` مرورگر است.
 */
async function requestJson(url, options, fetchImpl) {
  const call = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!call) return { ok: false, why: 'در این محیط شبکه در دسترس نیست', status: 0, body: null };
  let response;
  try {
    response = await call(url, options);
  } catch (error) {
    // شبکهٔ قطع. متن خطای مرورگر به کاربر فارسی‌زبان چیزی نمی‌گوید، ولی
    // پنهان کردنش هم بدتر است — پس یک متن روشن با خودِ علت.
    return { ok: false, why: `ارتباط با سرور برقرار نشد: ${error?.message || 'خطای نامعلوم شبکه'}`, status: 0, body: null };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    return {
      ok: false,
      why: body?.error || `درخواست ناموفق بود (${response.status})`,
      status: response.status,
      conflict: response.status === 409,
      notFound: response.status === 404,
      body,
    };
  }
  return { ok: true, why: '', status: response.status, body };
}

/** فهرست جلسه‌ها و پیش‌نویس‌های ذخیره‌شده، تازه‌ترین اول. */
export async function listMissionSaves({ fetchImpl } = {}) {
  const result = await requestJson(SESSIONS_URL, { method: 'GET' }, fetchImpl);
  if (!result.ok) return { ok: false, why: result.why, sessions: [] };
  const sessions = Array.isArray(result.body?.sessions) ? result.body.sessions : [];
  return { ok: true, why: '', sessions };
}

/** یک رکورد کامل. سرور پیش از تحویل، خودش قرارداد را سنجیده است. */
export async function loadMissionSave(id, { fetchImpl } = {}) {
  const result = await requestJson(`${SESSION_URL}?id=${encodeURIComponent(id)}`, { method: 'GET' }, fetchImpl);
  if (!result.ok) return { ok: false, why: result.why, notFound: !!result.notFound, record: null };
  return { ok: true, why: '', notFound: false, record: result.body };
}

/**
 * ثبت پیش‌نویس مرحلهٔ جاری.
 *
 * `expectedSavedAt` قفل خوش‌بینانه است: اگر تبِ دیگری همین جلسه را
 * جلوتر برده باشد، سرور ۴۰۹ می‌دهد و اینجا `conflict` برمی‌گردد. بازنویسی
 * بی‌صدا، کارِ نیم‌ساعت پیشِ کاربر را بدون اینکه بفهمد دور می‌ریخت.
 */
export async function saveMissionDraft(draft, { expectedSavedAt = null, fetchImpl } = {}) {
  const id = draft?.session?.id;
  if (typeof id !== 'string' || !id) {
    return { ok: false, why: 'پیش‌نویس بدون شناسهٔ جلسه قابل ذخیره نیست', conflict: false, savedAt: null };
  }
  const result = await requestJson(`${SESSION_URL}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: MISSION_SAVE_VERSION, draft, expectedSavedAt }),
  }, fetchImpl);
  if (!result.ok) {
    return { ok: false, why: result.why, conflict: !!result.conflict, savedAt: null };
  }
  const savedAt = Number.isInteger(result.body?.savedAt) ? result.body.savedAt : null;
  if (savedAt === null) {
    // سرور ۲۰۰ داد ولی زمان ثبت نداد. «ذخیره شد» گفتن در این حالت یعنی
    // ادعای چیزی که تأییدش را نداریم.
    return { ok: false, why: 'پاسخ سرور زمان ثبت معتبر نداشت', conflict: false, savedAt: null };
  }
  return { ok: true, why: '', conflict: false, savedAt, step: result.body?.step ?? '', state: result.body?.state ?? '' };
}
