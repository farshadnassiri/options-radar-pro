// آداپتر خالص مرحله نخست فرم مأموریت.
// رابط تومان و رشتهٔ فارسی می‌گیرد؛ هسته فقط ریال و لحظه معتبر می‌بیند.

import { createPortfolioSession, portfolioCapitalPlan } from '../core/portfolio-session.mjs';
import { MISSION_REPLAY_GRAINS } from '../core/portfolio-mission.mjs';

const DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

/** متن تومان با رقم فارسی/عربی و جداکننده → عدد صحیح تومان. */
export function parseTomanInput(value) {
  const normalized = String(value ?? '').replace(/[۰-۹٠-٩]/g, (digit) => DIGITS[digit])
    .replace(/[٬,،\s_]/g, '');
  if (!/^\d+$/.test(normalized)) return NaN;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) ? amount : NaN;
}

export function tomanToRial(value) {
  const toman = typeof value === 'number' ? value : parseTomanInput(value);
  const rial = toman * 10;
  return Number.isSafeInteger(toman) && toman >= 0 && Number.isSafeInteger(rial) ? rial : NaN;
}

function capitalArgs({ capitalToman, reserveToman }) {
  return {
    initialCapitalRial: tomanToRial(capitalToman),
    reserveRial: tomanToRial(reserveToman),
  };
}

/** خلاصه زنده سرمایه؛ اعتبارسنجی و تفریق فقط از مدل session می‌آید. */
export function previewPortfolioCapital({ capitalToman, reserveToman } = {}) {
  const made = createPortfolioSession({
    id: 'preview', baseIns: 'preview',
    start: { date: 20260101, second: 9 * 3600 },
    end: { date: 20260102, second: 9 * 3600 },
    ...capitalArgs({ capitalToman, reserveToman }),
  });
  return made.ok
    ? { ok: true, why: '', plan: portfolioCapitalPlan(made.session) }
    : { ok: false, why: made.why, plan: null };
}

/**
 * مرحله اول wizard را به draft واقعی session تبدیل می‌کند.
 * هنوز مأموریت، تخصیص یا snapshot قفل نمی‌شود.
 */
export function createPortfolioStepOneDraft({
  id = '', baseIns = '', capitalToman, reserveToman,
  startDate = 0, startSecond = NaN, endDate = 0, endSecond = NaN,
  grain = '', createdAt = 0,
} = {}) {
  if (!Object.prototype.hasOwnProperty.call(MISSION_REPLAY_GRAINS, String(grain || ''))) {
    return { ok: false, why: 'تایم‌فریم بازپخش معتبر نیست', draft: null };
  }
  const made = createPortfolioSession({
    id, baseIns,
    start: { date: Number(startDate), second: Number(startSecond) },
    end: { date: Number(endDate), second: Number(endSecond) },
    ...capitalArgs({ capitalToman, reserveToman }),
    createdAt,
  });
  if (!made.ok) return { ok: false, why: made.why, draft: null };
  return {
    ok: true,
    why: '',
    draft: {
      step: 'setup',
      session: made.session,
      replay: {
        grain,
        grainSeconds: MISSION_REPLAY_GRAINS[grain].seconds,
      },
    },
  };
}
