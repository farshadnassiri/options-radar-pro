// مدل جلسهٔ «سفره پر برکت بازار».
//
// این بک‌تست خودکار نیست؛ شبیه‌ساز سفر در زمان با کاربر در حلقه است. پس
// آنچه ذخیره می‌شود «نتیجه» نیست، **تصمیم** است: کاربر در آن لحظه چه فکر
// می‌کرد، چه انتظاری داشت، چه گزینه‌هایی جلویش بود و کدام را برداشت.
//
// ═══ چرا انتظار قبل از پرش قفل می‌شود ═══
//
// بدون آن، تفکیک «پیش‌بینی غلط بود» از «ساختار غلط بود» برای همیشه
// غیرقابل بازسازی است. آدم بعد از دیدن نتیجه، انتظارش را بازنویسی می‌کند
// و خودش هم متوجه نمی‌شود؛ این عیب حافظه است نه عیب صداقت. تنها راهش
// قفل‌کردن انتظار پیش از دیدن نتیجه است، و `advance` تا آن قفل نخورد
// اصلاً حرکت نمی‌کند.
//
// ═══ چرا همه‌چیز تابع خالص است ═══
//
// قید اساسی مدل: با شناسهٔ جلسه باید بشود دقیقاً همان جلسه را با همان
// اعداد بازسازی کرد. هیچ تابعی اینجا جلسه را عوض نمی‌کند؛ جلسهٔ تازه‌ای
// برمی‌گرداند. تاریخچهٔ جلسه یعنی زنجیرهٔ همان حالت‌ها، و بازسازی یعنی
// اجرای دوبارهٔ همان زنجیره.

import { num } from './num.mjs';
import { normalizeHistoryDate } from './history.mjs';
import { moment, momentKey, laterThan, INTRADAY_START_SECOND, INTRADAY_END_SECOND } from './trading-calendar.mjs';
import { seedFrom } from './rng.mjs';

/** واحد داخلی پول ریال است. تبدیل به تومان فقط در لایهٔ نمایش. */
export const RIAL_PER_TOMAN = 10;
export const DEFAULT_CAPITAL_RIAL = 1_000_000_000 * RIAL_PER_TOMAN;   // یک میلیارد تومان

export const SESSION_STATES = {
  open: 'باز',
  closed: 'بسته',
  abandoned: 'رهاشده',
};

/** جهت اعلامی کاربر. */
export const VIEW_DIRECTIONS = {
  up: 'صعودی', down: 'نزولی', flat: 'خنثی', volatile: 'پرنوسان، بی‌جهت',
};

/** نظر کاربر دربارهٔ تلاطم ضمنی — سناریوی جابه‌جایی سطح. */
export const IV_VIEWS = {
  up: 'تلاطم بالا می‌رود', down: 'تلاطم پایین می‌آید', same: 'تلاطم می‌ماند',
};

/**
 * جلسهٔ خالی.
 *
 * `seed` از شناسه ساخته می‌شود نه از ساعت، وگرنه دو بازسازی از یک شناسه
 * دو جلسهٔ متفاوت می‌دادند. `createdAt` ساعت دیواری واقعی است و فقط برای
 * ترتیب نمایش به کار می‌رود — هیچ محاسبه‌ای به آن تکیه نمی‌کند.
 */
export function blankSession({
  id = '', start, capitalRial = DEFAULT_CAPITAL_RIAL, anonymous = true,
  manualStart = false, practice = false, regime = null, createdAt = 0,
} = {}) {
  const at = moment(start?.date, start?.second);
  return {
    id: String(id || ''),
    seed: seedFrom(id || ''),
    start: { ...at },
    now: { ...at },
    state: 'open',
    capitalRial: Math.max(0, num(capitalRial, DEFAULT_CAPITAL_RIAL)),
    anonymous: !!anonymous,
    manualStart: !!manualStart,
    practice: !!practice,
    regime: regime || null,
    createdAt: num(createdAt, 0),
    closedAt: 0,
    decisions: [],      // نقاط تصمیم، هر کدام با نظر و انتظار و کاندیدها
    positions: [],      // موقعیت‌های واقعی و سایه
    valuations: [],     // ارزش‌گذاری هر موقعیت در هر پله
    events: [],         // آنچه در میانهٔ پرش رخ داد
    snapshots: [],      // عکس بازار هر لحظهٔ پرس‌وجو‌شده، برای بازتولید
  };
}

/** جلسه‌های دستی در آمار تجمیعی جدا برچسب می‌خورند. همین‌جا هم. */
export function countsInStats(session) {
  return !!session && !session.practice;
}

/**
 * ثبت نظر کاربر — نقطهٔ تصمیم تازه.
 *
 * `reason` اجباری است. سند آن را «متن دلیل» می‌نامد و بدون آن، جلسه فقط
 * می‌گوید کاربر چه کرد نه چرا؛ و «چرا» تنها چیزی است که ماه‌ها بعد هنوز
 * می‌ارزد.
 */
export function recordView(session, view = {}) {
  const at = moment(session?.now?.date, session?.now?.second);
  const reason = String(view.reason ?? '').trim();
  if (!reason) return { ok: false, why: 'متن دلیل اجباری است', session };
  if (!Object.prototype.hasOwnProperty.call(VIEW_DIRECTIONS, view.direction)) {
    return { ok: false, why: 'جهت اعلامی معتبر نیست', session };
  }
  const decision = {
    id: `${session.decisions.length + 1}`,
    at: { ...at },
    view: {
      direction: view.direction,
      movePct: num(view.movePct, NaN),
      horizonDays: Math.max(1, Math.trunc(num(view.horizonDays, 1))),
      confidence: Math.min(1, Math.max(0, num(view.confidence, 0.5))),
      ivView: Object.prototype.hasOwnProperty.call(IV_VIEWS, view.ivView) ? view.ivView : 'same',
      macro: String(view.macro ?? '').trim(),
      reason,
    },
    candidates: [],
    chosen: [],
    expectation: null,
  };
  return { ok: true, session: { ...session, decisions: [...session.decisions, decision] } };
}

/** آخرین نقطهٔ تصمیم، یا null. */
export function lastDecision(session) {
  return session?.decisions?.length ? session.decisions[session.decisions.length - 1] : null;
}

/**
 * ثبت کاندیدها — **همه‌شان**، نه فقط انتخاب‌شده.
 *
 * این تنها چیزی است که بین بدشانسی و بدانتخابی مرز می‌گذارد: اگر همه
 * کاندیدها ضرر دادند پیش‌بینی غلط بوده، و اگر بیشترشان سود دادند و کاربر
 * یکی از پایینی‌ها را برداشت، انتخاب ساختار غلط بوده.
 */
export function recordCandidates(session, candidates = []) {
  const decision = lastDecision(session);
  if (!decision) return { ok: false, why: 'هنوز نقطهٔ تصمیمی ثبت نشده', session };
  const list = (Array.isArray(candidates) ? candidates : []).map((row, at) => ({ ...row, rank: at + 1 }));
  return { ok: true, session: replaceLastDecision(session, { ...decision, candidates: list }) };
}

/**
 * قفل انتظار. پس از این، غیرقابل ویرایش.
 *
 * دومین قفل عمدی است: نه‌تنها `advance` بدون آن حرکت نمی‌کند، خودِ این
 * تابع هم روی انتظارِ قفل‌شده دوباره نمی‌نشیند. اگر می‌نشست، «قفل» فقط
 * یک اسم بود.
 */
export function lockExpectation(session, expectation = {}) {
  const decision = lastDecision(session);
  if (!decision) return { ok: false, why: 'هنوز نقطهٔ تصمیمی ثبت نشده', session };
  if (decision.expectation) return { ok: false, why: 'انتظار قفل شده و ویرایش‌پذیر نیست', session };
  const text = String(expectation.text ?? '').trim();
  if (!text) return { ok: false, why: 'متن انتظار اجباری است', session };
  const locked = {
    text,
    targetPricePct: num(expectation.targetPricePct, NaN),
    expectPnlRial: num(expectation.expectPnlRial, NaN),
    lockedAt: { ...moment(session.now?.date, session.now?.second) },
  };
  return { ok: true, session: replaceLastDecision(session, { ...decision, expectation: locked }) };
}

/**
 * آیا می‌شود جلو رفت.
 *
 * جدا از `advance` است تا رابط بتواند دکمه را **پیش از** کلیک غیرفعال کند
 * و دلیلش را کنارش بنویسد. خطای بعد از کلیک، همان کار را می‌کند ولی
 * کاربر را یک بار سردرگم کرده است.
 */
export function canAdvance(session) {
  if (!session) return { ok: false, why: 'جلسه‌ای در کار نیست' };
  if (session.state !== 'open') return { ok: false, why: `جلسه ${SESSION_STATES[session.state] || session.state} است` };
  const decision = lastDecision(session);
  if (!decision) return { ok: true, why: '' };
  if (decision.chosen.length && !decision.expectation) {
    return { ok: false, why: 'پیش از پرش باید انتظارت را بنویسی و قفل کنی' };
  }
  return { ok: true, why: '' };
}

/** انتخاب کاربر از میان کاندیدها، با اندازه. */
export function chooseCandidates(session, picks = []) {
  const decision = lastDecision(session);
  if (!decision) return { ok: false, why: 'هنوز نقطهٔ تصمیمی ثبت نشده', session };
  if (decision.expectation) return { ok: false, why: 'پس از قفل انتظار، انتخاب عوض نمی‌شود', session };
  const byId = new Map(decision.candidates.map((row) => [String(row.id), row]));
  const chosen = [];
  for (const pick of Array.isArray(picks) ? picks : []) {
    const row = byId.get(String(pick.id));
    if (!row) return { ok: false, why: `کاندید ${pick.id} در این تصمیم نیست`, session };
    const size = Math.trunc(num(pick.size, 0));
    if (!(size > 0)) return { ok: false, why: 'اندازهٔ انتخاب باید مثبت باشد', session };
    chosen.push({ id: String(pick.id), size, rank: row.rank });
  }
  return { ok: true, session: replaceLastDecision(session, { ...decision, chosen }) };
}

/**
 * جلو بردن لحظهٔ جلسه.
 *
 * زمان یک‌طرفه است — این را دروازهٔ زمان هم جدا نگه می‌دارد، ولی جلسه
 * حالت خودش را دارد و اگر فقط دروازه پاسبانی کند، حالتِ جلسه می‌تواند از
 * دروازه جدا بیفتد. دو نگهبان روی یک قاعده، تکرار نیست؛ دو مسیرِ ممکن
 * برای نقض همان قاعده است.
 */
export function advanceTo(session, next) {
  const gateOk = canAdvance(session);
  if (!gateOk.ok) return { ok: false, why: gateOk.why, session };
  const to = moment(next?.date, next?.second);
  if (!to.date) return { ok: false, why: 'لحظهٔ مقصد معتبر نیست', session };
  if (!laterThan(to, session.now)) return { ok: false, why: 'زمان یک‌طرفه است', session };
  return { ok: true, session: { ...session, now: { ...to } } };
}

/** رویداد میانی، با مهر زمانی دقیق. */
export function recordEvent(session, event = {}) {
  const at = moment(event.at?.date ?? session?.now?.date, event.at?.second ?? session?.now?.second);
  const kind = String(event.kind ?? '').trim();
  if (!kind) return { ok: false, why: 'نوع رویداد لازم است', session };
  const row = {
    at: { ...at }, kind,
    positionId: event.positionId ? String(event.positionId) : '',
    detail: String(event.detail ?? ''),
    data: event.data && typeof event.data === 'object' ? { ...event.data } : null,
  };
  return { ok: true, session: { ...session, events: [...session.events, row] } };
}

/** ارزش‌گذاری یک موقعیت در یک لحظه. */
export function recordValuation(session, valuation = {}) {
  const at = moment(valuation.at?.date ?? session?.now?.date, valuation.at?.second ?? session?.now?.second);
  const positionId = String(valuation.positionId ?? '');
  if (!positionId) return { ok: false, why: 'شناسهٔ موقعیت لازم است', session };
  return {
    ok: true,
    session: { ...session, valuations: [...session.valuations, { ...valuation, positionId, at: { ...at } }] },
  };
}

/**
 * بستن جلسه.
 *
 * `abandoned` جلسه‌ای است که کاربر رهایش کرده. سند صریح می‌گوید این‌ها هم
 * در آمار تجمیعی شمرده می‌شوند و در گزارش جدا نمایش داده می‌شوند — چون
 * رها کردن جلسه‌ای که دارد بد پیش می‌رود، خودش یک الگوی رفتاری است و
 * حذفش از آمار، همان آمار را خوش‌بین می‌کند.
 */
export function closeSession(session, { abandoned = false, closedAt = 0 } = {}) {
  if (!session) return { ok: false, why: 'جلسه‌ای در کار نیست', session };
  if (session.state !== 'open') return { ok: false, why: 'جلسه از قبل بسته است', session };
  return {
    ok: true,
    session: { ...session, state: abandoned ? 'abandoned' : 'closed', closedAt: num(closedAt, 0) },
  };
}

/**
 * بازی مجدد همان تاریخ و نماد.
 *
 * مجاز نیست مگر با پرچم تمرینی، و جلسهٔ تمرینی از آمار بیرون است. بدون
 * این، بازی دوبارهٔ تاریخی که نتیجه‌اش را می‌دانی، آمار «دقت پیش‌بینی» را
 * بی‌معنی می‌کند.
 */
export function replayAllowed(history = [], { date, ins, practice = false }) {
  if (practice) return { ok: true, why: '', practice: true };
  const want = normalizeHistoryDate(date);
  const clash = (history || []).find((row) => normalizeHistoryDate(row?.start?.date) === want
    && String(row?.ins ?? '') === String(ins ?? ''));
  if (!clash) return { ok: true, why: '', practice: false };
  return { ok: false, why: 'این تاریخ و نماد قبلاً بازی شده. فقط با پرچم «تمرینی» می‌شود دوباره رفت، و آن جلسه در آمار شمرده نمی‌شود.', practice: false };
}

/** خلاصهٔ یک‌خطی وضعیت، برای فهرست جلسه‌ها. */
export function sessionSummary(session) {
  if (!session) return null;
  const decisions = session.decisions.length;
  const real = session.positions.filter((row) => !row.isShadow).length;
  const shadow = session.positions.filter((row) => row.isShadow).length;
  return {
    id: session.id, state: session.state, stateLabel: SESSION_STATES[session.state] || session.state,
    start: { ...session.start }, now: { ...session.now },
    regime: session.regime, anonymous: session.anonymous,
    practice: session.practice, manualStart: session.manualStart,
    decisions, real, shadow, events: session.events.length,
    inStats: countsInStats(session),
  };
}

function replaceLastDecision(session, decision) {
  const list = session.decisions.slice();
  list[list.length - 1] = decision;
  return { ...session, decisions: list };
}

export { moment, momentKey, INTRADAY_START_SECOND, INTRADAY_END_SECOND };
