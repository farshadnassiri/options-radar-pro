// مدل نمایش مقایسهٔ دو پرونده. محاسبات در core انجام شده‌اند؛ اینجا فقط
// عددها فارسی و برای کاربر برچسب‌گذاری می‌شوند.

import { faDigits, fmt } from './fmt.mjs';

const pct = (value) => (Number.isFinite(value) ? `${fmt.num(value)}٪` : '—');
const count = (value) => (Number.isFinite(value) ? fmt.int(value) : '—');
const delta = (value, unit) => {
  if (!Number.isFinite(value)) return '—';
  const shown = unit === 'pct' ? pct(Math.abs(value)) : count(Math.abs(value));
  return value > 0 ? `+${shown}` : value < 0 ? `−${shown}` : shown;
};
const change = (value) => (!Number.isFinite(value) ? 'تغییر نامعلوم'
  : value > 0 ? 'افزایش' : value < 0 ? 'کاهش' : 'بدون تغییر');
const moment = (value) => (Number.isFinite(value?.date) && Number.isFinite(value?.second)
  ? `${faDigits(String(value.date))} · ${faDigits(String(value.second))}` : '—');

function metricRow(key, label, metric, unit) {
  const format = unit === 'pct' ? pct : count;
  return {
    key,
    label,
    olderText: format(metric?.older),
    newerText: format(metric?.newer),
    deltaText: delta(metric?.delta, unit),
    changeLabel: change(metric?.delta),
  };
}

export function portfolioDossierComparisonView(result) {
  if (!result?.ok) {
    return {
      ok: false,
      why: faDigits(String(result?.why || 'مقایسه پرونده‌ها در دسترس نیست')),
      rows: [], findingGroups: [],
    };
  }
  const titles = result.findings?.titles || {};
  const group = (key, label, emptyText) => ({
    key,
    label,
    emptyText,
    rows: (result.findings?.[key] || []).map((code) => ({
      code,
      title: faDigits(String(titles[code] || code)),
    })),
  });
  return {
    ok: true,
    why: '',
    sameBaseIns: result.sameBaseIns,
    baseStateText: result.sameBaseIns ? 'نماد پایه در هر دو پرونده یکسان است'
      : 'نماد پایه دو پرونده متفاوت است',
    older: {
      idText: faDigits(String(result.older.sessionId)),
      baseText: faDigits(String(result.older.baseIns)),
      closedText: moment(result.older.closedAt),
    },
    newer: {
      idText: faDigits(String(result.newer.sessionId)),
      baseText: faDigits(String(result.newer.baseIns)),
      closedText: moment(result.newer.closedAt),
    },
    rows: [
      metricRow('realized-return', 'بازده تحقق‌یافته', result.metrics.realizedReturnPct, 'pct'),
      metricRow('target-gap', 'فاصله درصدی از هدف', result.metrics.targetGapPct, 'pct'),
      metricRow('critical', 'یافته فوری', result.metrics.severityCounts.critical, 'count'),
      metricRow('warning', 'یافته نیازمند بازبینی', result.metrics.severityCounts.warning, 'count'),
      metricRow('notice', 'یافته داده ناکافی', result.metrics.severityCounts.notice, 'count'),
    ],
    findingGroups: [
      group('added', 'در پرونده جدید افزوده شد', 'یافته تازه‌ای ثبت نشد.'),
      group('resolved', 'دیگر در پرونده جدید ثبت نشد', 'یافته‌ای از ثبت خارج نشد.'),
      group('shared', 'در هر دو پرونده ثبت شد', 'یافته مشترکی ثبت نشد.'),
    ],
  };
}
