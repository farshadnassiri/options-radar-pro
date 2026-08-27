// نمایش تحلیل پرونده. همه محاسبات مالی در core انجام شده‌اند؛ اینجا تنها
// ریال به تومان تبدیل و عددها فارسی می‌شوند.

import { MISSION_RETURN_BASES } from '../core/portfolio-mission.mjs';
import { faDigits, fmt, signTone } from './fmt.mjs';

const money = (rial) => (Number.isFinite(rial) ? `${fmt.int(rial / 10)} تومان` : '—');
const pct = (value) => (Number.isFinite(value) ? `${fmt.num(value)}٪` : '—');

export function portfolioDossierAnalysisView(analysis) {
  if (!analysis?.ok) {
    return {
      ok: false, why: faDigits(String(analysis?.why || 'تحلیل پرونده در دسترس نیست')),
      complete: false,
    };
  }
  const basisLabel = Object.prototype.hasOwnProperty.call(
    MISSION_RETURN_BASES, analysis.returnBase,
  ) ? MISSION_RETURN_BASES[analysis.returnBase] : 'مبنای نامعلوم';
  const stateLabel = analysis.targetState === 'met' ? 'هدف محقق شد'
    : analysis.targetState === 'missed' ? 'هدف محقق نشد' : 'نتیجه نامعلوم';
  return {
    ok: true,
    why: faDigits(String(analysis.why || '')),
    complete: analysis.complete === true,
    initialText: money(analysis.initialCapitalRial),
    realizedText: money(analysis.realizedRial),
    finalText: money(analysis.finalCapitalRial),
    returnBaseLabel: basisLabel,
    returnBaseText: money(analysis.returnBaseRial),
    realizedReturnText: pct(analysis.realizedReturnPct),
    targetReturnText: pct(analysis.targetReturnPct),
    targetProfitText: money(analysis.targetProfitRial),
    targetGapText: money(analysis.targetGapRial),
    targetGapPctText: pct(analysis.targetGapPct),
    targetTone: Number.isFinite(analysis.targetGapRial) ? signTone(analysis.targetGapRial) : '',
    targetState: analysis.targetState,
    targetStateLabel: stateLabel,
    issues: (analysis.issues || []).map((row) => ({
      code: row.code,
      label: faDigits(String(row.label || '')),
      detail: faDigits(String(row.detail || '')),
    })),
  };
}
