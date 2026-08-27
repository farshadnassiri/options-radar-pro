// مدل نمایش پروندهٔ پایان — نخستین قلم فاز ۶.
//
// موتور جلسه را می‌بندد و پرونده می‌سازد، ولی هیچ‌کس از رابط نمی‌توانست
// جلسه را ببندد. جلسه‌ای که بسته نشود، هیچ‌وقت پرونده‌ای هم ندارد و کل
// فاز ۶ روی هوا می‌ماند.
//
// چهار مرز:
//
// **تعهدِ باز پیش از بستن هشدار می‌دهد.** بستن با موقعیت باز کار
// درستی است اگر کاربر بداند دارد چه می‌کند — و کار غلطی است اگر نداند.
//
// **تحقق‌یافته و تحقق‌نیافته دو جای جدا.** کنارِ هم نشستنشان یعنی
// خواننده جمعشان می‌کند، و آن جمع هیچ‌کدام نیست.
//
// **جمعِ نامعلوم عدد نمی‌گیرد.** اگر سندی ناقص باشد، «—» می‌آید با
// علت، نه صفر.
//
// **هیچ عدد مالی تازه‌ای اینجا ساخته نمی‌شود؛** تنها تقسیم بر ده.

import { fmt, faDigits, signTone } from './fmt.mjs';
import {
  PORTFOLIO_CLOSEOUT_REASONS, PORTFOLIO_CLOSEOUT_VERSION, closeoutPortfolioSession,
} from '../core/portfolio-closeout.mjs';
import { validatePortfolioCapitalContinuity } from '../core/portfolio-capital-continuity.mjs';
import { portfolioSessionPositions } from '../core/portfolio-positions.mjs';
import { DOSSIER_SAVE_VERSION } from './portfolio-dossier-data.mjs';

export const CLOSEOUT_VIEW_REASONS = PORTFOLIO_CLOSEOUT_REASONS;

const text = (value) => String(value ?? '').trim();
const toman = (rial) => (Number.isFinite(rial) ? fmt.int(rial / 10) : '—');
const count = (value) => faDigits(String(Number(value) || 0));
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (row, key) => !!row && Object.prototype.hasOwnProperty.call(row, key);
const sameMoment = (left, right) => isObject(left) && isObject(right)
  && Number(left.date) === Number(right.date) && Number(left.second) === Number(right.second);

/**
 * آنچه کاربر باید **پیش از** بستن بداند.
 *
 * جدا از خودِ بستن است، چون تصمیم پیش از عمل گرفته می‌شود: اگر پس از
 * بستن بگوییم «راستی، سه موقعیت باز بود»، دیگر کاری نمی‌شود کرد.
 */
export function closeoutPreflight(session) {
  const state = portfolioSessionPositions(session);
  if (!state.ok) {
    return { ok: false, why: faDigits(text(state.why)), openQty: 0, warnings: [] };
  }
  const open = state.positions.filter((row) => row.status === 'open' && row.openQty > 0);
  const openQty = open.reduce((sum, row) => sum + row.openQty, 0);
  const warnings = [];
  if (open.length) {
    // بستن با موقعیت باز کار درستی است اگر کاربر بداند دارد چه می‌کند.
    warnings.push(`${count(open.length)} موقعیت باز با ${count(openQty)} قرارداد`
      + ' هنوز تعهد دارد؛ با بستن جلسه، تعهدشان بسته نمی‌شود.');
  }
  const early = !session?.now || !session?.end
    || (Number(session.now.date) * 100000 + Number(session.now.second))
      < (Number(session.end.date) * 100000 + Number(session.end.second));
  if (early) warnings.push('جلسه هنوز به پایانش نرسیده؛ این بستنِ زودهنگام است.');
  return {
    ok: true,
    why: '',
    openCount: open.length,
    openQty,
    early,
    // تأیید صریح فقط وقتی لازم است که چیزی برای دانستن هست.
    needsConfirm: warnings.length > 0,
    warnings,
    warningText: warnings.join(' '),
  };
}

function fail(reason, why = '') {
  return {
    ok: false,
    why: faDigits(why || CLOSEOUT_VIEW_REASONS[reason] || ''),
    reason,
    session: null,
    dossier: null,
  };
}

function validDossier(session, d) {
  if (!isObject(session) || session.state !== 'closed') return 'جلسه بسته‌شده معتبر نیست';
  if (!isObject(d) || d.version !== PORTFOLIO_CLOSEOUT_VERSION) {
    return 'نسخه پرونده پایان ناشناخته یا پشتیبانی‌نشده است';
  }
  if (!text(session.id) || d.sessionId !== session.id) return 'شناسه پرونده با شناسه جلسه یکی نیست';
  if (!sameMoment(session.start, d.start) || !sameMoment(session.end, d.end)
    || !sameMoment(session.closedAt, d.closedAt)) return 'بازه یا زمان بستن پرونده با جلسه یکی نیست';
  if (typeof d.early !== 'boolean') return 'وضعیت بستن زودهنگام پرونده معتبر نیست';
  if (!isObject(d.realized) || !Array.isArray(d.realized.rows)
    || !Array.isArray(d.realized.unknown)
    || !(d.realized.totalRial === null || Number.isFinite(d.realized.totalRial))) {
    return 'سود و زیان تحقق‌یافته پرونده ناقص است';
  }
  const rowKeys = ['closedQty', 'exitCashRial', 'exitFeeRial', 'realizedRial'];
  if (d.realized.rows.some((row) => !text(row?.id)
    || rowKeys.some((key) => !Number.isFinite(row?.[key])))) {
    return 'ردیف تحقق‌یافته پرونده ناقص است';
  }
  if (!isObject(d.positions) || !Array.isArray(d.positions.openIds)
    || ['total', 'open', 'closed', 'openQty'].some((key) => !Number.isInteger(d.positions[key])
      || d.positions[key] < 0)
    || d.positions.open + d.positions.closed !== d.positions.total) {
    return 'شمار موقعیت‌های پرونده معتبر نیست';
  }
  if (d.accounting !== null && (!isObject(d.accounting)
    || !Number.isInteger(d.accounting.entries?.count)
    || !Number.isInteger(d.accounting.exits?.count)
    || !Number.isFinite(d.accounting.fees?.totalRial))) {
    return 'حسابداری پرونده ناقص است';
  }
  if (!Array.isArray(d.alerts)) return 'هشدارهای پرونده ناقص است';
  return '';
}

/** مدل نمایش مشترک برای پروندهٔ زنده و پروندهٔ خوانده‌شده از سرور. */
export function portfolioDossierView(session, d) {
  const invalid = validDossier(session, d);
  if (invalid) return fail('invalidDossier', invalid);
  const acc = d.accounting;
  const realized = d.realized;

  return {
    ok: true,
    why: '',
    reason: null,
    session,
    // سند خام موتور برای ذخیره است. مدل نمایشی پایین جایگزین سند نیست؛
    // متن‌های تومان و رقم فارسی را نمی‌شود فردا به حسابداری خام برگرداند.
    dossier: d,
    headlineText: d.early
      ? 'جلسه زودتر از پایانش بسته شد'
      : 'جلسه در پایان بازه بسته شد',
    early: d.early,
    // تحقق‌یافته: پول واقعیِ جابه‌جاشده.
    realized: {
      // جمعِ نامعلوم عدد نمی‌گیرد.
      totalText: Number.isFinite(realized.totalRial)
        ? `${toman(realized.totalRial)} تومان` : '—',
      tone: Number.isFinite(realized.totalRial) ? signTone(realized.totalRial) : '',
      unknownText: realized.unknown.length
        ? `${count(realized.unknown.length)} موقعیت سند کاملی نداشت، پس جمع ساخته نشد`
        : '',
      rows: realized.rows.map((row) => ({
        id: row.id,
        idText: faDigits(text(row.id)),
        closedQtyText: count(row.closedQty),
        exitCashText: `${toman(row.exitCashRial)} تومان`,
        feeText: `${toman(row.exitFeeRial)} تومان`,
        realizedText: `${toman(row.realizedRial)} تومان`,
        tone: signTone(row.realizedRial),
      })),
    },
    accountingText: acc
      ? `${count(acc.entries.count)} ورود · ${count(acc.exits.count)} خروج`
        + ` · کارمزد ${toman(acc.fees.totalRial)} تومان`
      : '',
    accountingWhy: faDigits(text(d.accountingWhy)),
    // تعهدِ باز، حتی پس از بستن، صریح می‌ماند.
    openText: d.positions.open
      ? `${count(d.positions.open)} موقعیت باز با ${count(d.positions.openQty)} قرارداد`
        + ' هنگام بستن جلسه تعهد داشت'
      : '',
    positionsText: `${count(d.positions.total)} موقعیت · `
      + `${count(d.positions.closed)} بسته · ${count(d.positions.open)} باز`,
    alerts: d.alerts.map((row) => ({
      code: row.code,
      label: faDigits(text(row.label)),
      stateLabel: faDigits(text(row.stateLabel)),
      state: row.state,
    })),
    alertsWhy: faDigits(text(d.alertsWhy)),
  };
}

/** رکورد نسخه‌دار سرور → مدل نمایش؛ بدون قیمت‌گیری یا بازسازی مالی. */
export function dossierRecordView(raw) {
  if (!isObject(raw) || raw.schemaVersion !== DOSSIER_SAVE_VERSION) {
    return fail('unknownVersion', 'نسخه ذخیره پرونده ناشناخته یا پشتیبانی‌نشده است');
  }
  if (!text(raw.id) || raw.session?.id !== raw.id || raw.dossier?.sessionId !== raw.id) {
    return fail('idMismatch', 'شناسه رکورد، جلسه و پرونده یکی نیست');
  }
  if (!Number.isInteger(raw.savedAt) || raw.savedAt < 0) {
    return fail('invalidSavedAt', 'زمان ثبت پرونده معتبر نیست');
  }
  const view = portfolioDossierView(raw.session, raw.dossier);
  if (!view.ok) return view;
  if (!own(raw, 'capitalContinuity')) {
    return { ...view, savedAt: raw.savedAt, capitalContinuity: null };
  }
  const continuity = validatePortfolioCapitalContinuity(raw.capitalContinuity, {
    initialCapitalRial: raw.session.capital?.initialRial,
    sessionId: raw.session.id,
    portfolioId: raw.session.portfolioId,
  });
  if (!continuity.ok || continuity.continuity.state !== 'ready'
    || JSON.stringify(continuity.continuity) !== JSON.stringify(raw.capitalContinuity)) {
    return fail('invalidContinuity', `تداوم سرمایه پرونده معتبر نیست: ${continuity.why}`);
  }
  return {
    ...view,
    savedAt: raw.savedAt,
    capitalContinuity: continuity.continuity,
  };
}

/**
 * بستن جلسه و پروندهٔ آماده‌شده برای نمایش.
 *
 * `force` را تب پس از تأیید کاربر می‌دهد، نه پیش‌فرض.
 */
export function closeoutView(session, evidence, { at, force = false } = {}) {
  const out = closeoutPortfolioSession(session, evidence, { at, force });
  return out.ok ? portfolioDossierView(out.session, out.dossier) : fail(out.reason, out.why);
}
