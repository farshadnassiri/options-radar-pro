// مدل نمایش و اتصال فرم برای تداوم سرمایه.
//
// محاسبه سرمایه در core انجام شده است. این فایل فقط ریال قطعی را برای نمایش
// به تومان تبدیل می‌کند و همان قرارداد را، بدون تغییر، به draft تازه می‌چسباند.

import {
  PORTFOLIO_CAPITAL_CONTINUITY_VERSION, portfolioCapitalContinuity,
} from '../core/portfolio-capital-continuity.mjs';
import { momentText } from './portfolio-clock-view.mjs';
import { faDigits, fmt } from './fmt.mjs';

const money = (rial) => (Number.isFinite(rial) ? `${fmt.int(rial / 10)} تومان` : '—');
const inputMoney = (rial) => (Number.isFinite(rial) ? fmt.int(rial / 10) : '');
const text = (value) => faDigits(String(value ?? '').trim());

function unavailable(why, continuity = null) {
  return {
    ok: Boolean(continuity?.ok),
    available: false,
    why: text(why || 'سرمایه قطعی برای جلسه بعد در دسترس نیست'),
    state: continuity?.state || null,
    capitalText: continuity ? money(continuity.finalCapitalRial) : '—',
    capitalInputText: '',
    baseText: continuity ? text(continuity.baseIns) : '—',
    sourceSessionText: continuity ? text(continuity.sourceSessionId) : '—',
    sourcePortfolioText: continuity ? text(continuity.sourcePortfolioId) : '—',
    closedAtText: continuity ? momentText(continuity.closedAt) : '—',
    actionLabel: 'جلسه بعد با این سرمایه',
    continuity,
  };
}

/** پرونده بسته → مدل آماده رسم، بدون محاسبه مالی تازه. */
export function portfolioCapitalContinuityView(session, dossier) {
  const continuity = portfolioCapitalContinuity(session, dossier);
  if (!continuity.ok) return unavailable(continuity.why);
  if (continuity.state === 'exhausted') {
    return unavailable('سرمایه نهایی صفر است؛ سرمایه‌ای برای شروع جلسه بعد باقی نمانده.', continuity);
  }
  return {
    ok: true,
    available: true,
    why: '',
    state: continuity.state,
    capitalText: money(continuity.finalCapitalRial),
    capitalInputText: inputMoney(continuity.finalCapitalRial),
    baseText: text(continuity.baseIns),
    sourceSessionText: text(continuity.sourceSessionId),
    sourcePortfolioText: text(continuity.sourcePortfolioId),
    closedAtText: momentText(continuity.closedAt),
    actionLabel: 'جلسه بعد با این سرمایه',
    continuity,
  };
}

/**
 * قرارداد آماده را فقط به draft تازه و هم‌سرمایه وصل می‌کند.
 * شناسه تازه را فرم می‌سازد؛ این تابع تکراری‌بودنش را رد می‌کند.
 */
export function attachPortfolioCapitalContinuity(stepOneDraft, continuity) {
  if (!stepOneDraft?.session || stepOneDraft.step !== 'setup') {
    return { ok: false, why: 'پیش‌نویس معتبر مرحله نخست لازم است', draft: null };
  }
  if (!continuity?.ok
    || continuity.version !== PORTFOLIO_CAPITAL_CONTINUITY_VERSION
    || continuity.state !== 'ready'
    || !Number.isFinite(continuity.finalCapitalRial)
    || continuity.finalCapitalRial <= 0) {
    return { ok: false, why: 'قرارداد سرمایه آماده ادامه نیست', draft: null };
  }
  if (stepOneDraft.session.capital?.initialRial !== continuity.finalCapitalRial) {
    return { ok: false, why: 'سرمایه فرم با سرمایه قطعی پرونده برابر نیست', draft: null };
  }
  if (stepOneDraft.session.id === continuity.sourceSessionId
    || stepOneDraft.session.portfolioId === continuity.sourcePortfolioId) {
    return { ok: false, why: 'جلسه بعد باید شناسه جلسه و سبد تازه داشته باشد', draft: null };
  }
  return {
    ok: true,
    why: '',
    draft: {
      ...stepOneDraft,
      capitalContinuity: structuredClone(continuity),
    },
  };
}
