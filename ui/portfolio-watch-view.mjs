// مدل نمایش هشدارهای مسیر — برش یازدهم فاز ۵.
//
// موتور می‌داند کدام قید نزدیک شکستن است و چه چیزی از لحظهٔ ثبت عوض
// شده. کاربر هیچ‌کدام را نمی‌دید. **بدترین حالت همین است: سامانه بداند
// قید شکسته و ساکت بماند.**
//
// چهار مرز:
//
// **شدت، ترتیب را تعیین می‌کند.** شکسته اول، بعد نزدیک، بعد نامعلوم، و
// رعایت‌شده‌ها آخر. کاربری که باید اسکرول کند تا هشدار را ببیند، آن را
// نمی‌بیند.
//
// **سه حالت، سه ظاهر.** «نزدیک» نه شبیه «شکسته» باشد و نه شبیه «رعایت
// شده». اگر هر سه یک رنگ داشته باشند، هیچ‌کدام معنایی ندارند.
//
// **«نامعلوم» ظاهر خودش را دارد.** شبیه «رعایت شده» بودنش یعنی سکوتِ
// ندانستن به‌جای اطمینان خوانده می‌شود.
//
// **وقتی همه‌چیز رعایت شده، نوار کوتاه می‌ماند.** هشدارِ همیشگی بعد از
// چند بار نادیده گرفته می‌شود، و آن‌وقت هشدارِ واقعی هم با آن می‌رود.
//
// هیچ عدد مالی تازه‌ای اینجا ساخته نمی‌شود؛ تنها حسابِ مجاز تقسیم بر ده.

import { fmt, faDigits } from './fmt.mjs';
import {
  PORTFOLIO_WATCH_REASONS, portfolioRiskWatch,
} from '../core/portfolio-watch.mjs';

export const WATCH_VIEW_REASONS = PORTFOLIO_WATCH_REASONS;

/** ترتیب شدت. عددِ کوچک‌تر یعنی فوری‌تر. */
const SEVERITY = Object.freeze({ breached: 0, near: 1, unknown: 2, clear: 3 });

const text = (value) => String(value ?? '').trim();
const toman = (rial) => (Number.isFinite(rial) ? fmt.int(rial / 10) : '—');
const pct = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');

function fail(reason, why = '') {
  return {
    ok: false,
    why: faDigits(why || WATCH_VIEW_REASONS[reason] || ''),
    reason,
    rows: [],
    headlineText: '',
    tone: '',
    urgent: false,
    quiet: true,
  };
}

/**
 * یک هشدار، آمادهٔ نمایش.
 *
 * «چه چیزی عوض شد» روی همان ردیف می‌ماند — بردنش به جای دیگر یعنی کسی
 * که ردیف را می‌خواند، عددِ حالا را بدون گذشته‌اش می‌بیند.
 */
function toRow(alert) {
  const moved = Number.isFinite(alert.changeRial) && alert.changeRial !== 0;
  return {
    code: alert.code,
    label: faDigits(text(alert.label)),
    state: alert.state,
    stateLabel: faDigits(text(alert.stateLabel)),
    severity: SEVERITY[alert.state] ?? SEVERITY.unknown,
    basis: alert.basis,
    basisLabel: {
      committed: 'بر پایهٔ سرمایهٔ ثبت‌شده',
      curve: 'بر پایهٔ منحنیِ فعلی',
      valuation: 'بر پایهٔ ارزش جاری',
    }[alert.basis] || '',
    limitText: pct(alert.limitPct),
    currentText: Number.isFinite(alert.currentPct) ? pct(alert.currentPct) : '—',
    headroomText: Number.isFinite(alert.headroomPct)
      ? `${toman(alert.headroomRial)} تومان · ${pct(alert.headroomPct)}` : '—',
    // نبودِ عدد با عدد جایگزین نمی‌شود؛ علتش می‌آید.
    why: faDigits(text(alert.why)),
    // «چه چیزی عوض شد» — نه فقط «الان بد است».
    changeText: moved
      ? `${toman(alert.changeRial)} تومان نسبت به لحظهٔ ثبت` : '',
    atCommitText: Number.isFinite(alert.atCommitRial)
      ? `${toman(alert.atCommitRial)} تومان` : '',
    unlimitedLoss: Boolean(alert.unlimitedLoss),
  };
}

/**
 * هشدارهای مسیر، مرتب‌شده بر اساس فوریت.
 *
 * `evidence` مدرک هم‌لحظه است؛ بدون آن قیدهایی که به ارزش بند هستند
 * «نامعلوم» می‌شوند، نه «رعایت شده».
 */
export function portfolioWatchView(session, evidence) {
  const watch = portfolioRiskWatch(session, evidence);
  if (!watch.ok) return fail(watch.reason, watch.why);

  // شدت ترتیب را تعیین می‌کند؛ کاربری که باید اسکرول کند تا هشدار را
  // ببیند، آن را نمی‌بیند.
  const rows = watch.alerts.map(toRow)
    .sort((a, b) => a.severity - b.severity
      || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  const counts = watch.counts;
  const urgent = counts.breached > 0;
  const parts = [];
  if (counts.breached) parts.push(`${faDigits(String(counts.breached))} قید شکسته`);
  if (counts.near) parts.push(`${faDigits(String(counts.near))} قید نزدیک شکستن`);
  if (counts.unknown) parts.push(`${faDigits(String(counts.unknown))} قید نامعلوم`);

  return {
    ok: true,
    why: '',
    reason: null,
    now: watch.now,
    rows,
    counts,
    urgent,
    // وقتی همه‌چیز رعایت شده، نوار کوتاه می‌ماند. هشدارِ همیشگی بعد از
    // چند بار نادیده گرفته می‌شود و آن‌وقت هشدارِ واقعی هم با آن می‌رود.
    quiet: parts.length === 0,
    headlineText: parts.length
      ? parts.join(' · ')
      : `همهٔ ${faDigits(String(counts.total))} قید رعایت شده‌اند`,
    tone: urgent ? 'loss' : (counts.near || counts.unknown ? 'warn' : 'gain'),
  };
}
