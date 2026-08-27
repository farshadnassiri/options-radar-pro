// نمایش یافته‌های مستند پرونده؛ عددهای مالی فقط ریال به تومان می‌شوند.

import { DOSSIER_WEAKNESS_SEVERITIES } from '../core/portfolio-dossier-weakness.mjs';
import { faDigits, fmt } from './fmt.mjs';

const labels = Object.freeze({
  openCount: 'موقعیت باز', openQty: 'حجم باز', alertCode: 'کد قید',
  stateLabel: 'وضعیت', limitPct: 'حد', currentPct: 'مقدار ثبت‌شده',
  headroomPct: 'فاصله تا حد', limitRial: 'حد پولی', currentRial: 'مقدار پولی',
  headroomRial: 'فاصله پولی', issueCode: 'کد داده', detail: 'جزئیات',
  realizedReturnPct: 'بازده تحقق‌یافته', targetReturnPct: 'هدف بازده',
  targetGapPct: 'فاصله درصدی', targetGapRial: 'فاصله پولی',
});

function evidenceValue(key, value) {
  if (key.endsWith('Rial')) return Number.isFinite(value) ? `${fmt.int(value / 10)} تومان` : '—';
  if (key.endsWith('Pct')) return Number.isFinite(value) ? `${fmt.num(value)}٪` : '—';
  if (['openCount', 'openQty'].includes(key)) return Number.isFinite(value) ? fmt.int(value) : '—';
  if (Array.isArray(value)) return value.length ? value.map((row) => faDigits(String(row))).join('، ') : '—';
  if (value && typeof value === 'object') {
    const date = Number(value.date), second = Number(value.second);
    return Number.isFinite(date) && Number.isFinite(second)
      ? `${faDigits(String(date))} · ${faDigits(String(second))}` : '—';
  }
  return faDigits(String(value || '—'));
}

export function portfolioDossierWeaknessView(result) {
  if (!result?.ok) {
    return { ok: false, why: faDigits(String(result?.why || 'تحلیل ضعف در دسترس نیست')), rows: [] };
  }
  return {
    ok: true,
    why: '',
    quiet: result.quiet,
    summaryText: result.quiet
      ? 'پرونده از شاهدهای سنجیده‌شده یافته‌ای ندارد.'
      : `${fmt.int(result.counts.total)} یافته مستند · ${fmt.int(result.counts.critical)} فوری · ${fmt.int(result.counts.warning)} بازبینی · ${fmt.int(result.counts.notice)} داده ناکافی`,
    rows: result.findings.map((row) => ({
      code: row.code,
      severity: row.severity,
      severityLabel: DOSSIER_WEAKNESS_SEVERITIES[row.severity] || 'نامعلوم',
      title: faDigits(String(row.title || '')),
      description: faDigits(String(row.description || '')),
      evidence: Object.entries(row.evidence || {})
        .filter(([, value]) => value !== null && value !== '' && value !== undefined)
        .map(([key, value]) => ({
          key,
          label: labels[key] || key,
          valueText: evidenceValue(key, value),
        })),
    })),
  };
}
