// مدل نمایش روند سرمایه. همه جمع، تفریق و درصدها در core انجام شده‌اند؛
// این فایل فقط ریال را به تومان و اعداد را به رقم فارسی تبدیل می‌کند.

import { faDigits, fmt, signTone } from './fmt.mjs';
import { momentText } from './portfolio-clock-view.mjs';

const text = (value) => faDigits(String(value ?? '').trim());
const money = (rial) => (Number.isFinite(rial) ? `${fmt.int(rial / 10)} تومان` : '—');
const pct = (value) => (Number.isFinite(value) ? `${fmt.num(value)}٪` : '—');
const signed = (value, format) => {
  if (!Number.isFinite(value)) return '—';
  const shown = format(Math.abs(value));
  return value > 0 ? `+${shown}` : value < 0 ? `−${shown}` : shown;
};
const tone = (value) => (Number.isFinite(value) && value !== 0 ? signTone(value) : '');
const stateLabel = (state) => (state === 'growth' ? 'رشد'
  : state === 'decline' ? 'افت' : state === 'flat' ? 'بدون تغییر' : 'نامعلوم');

/** مدل هسته → متن آماده رسم، بدون محاسبه مالی تازه. */
export function portfolioCapitalGrowthView(growth) {
  if (!growth?.ok) {
    return {
      ok: false,
      why: text(growth?.why || 'روند سرمایه در دسترس نیست'),
      state: null,
      stateLabel: 'نامعلوم',
      summaryText: 'روند سرمایه در دسترس نیست',
      percentageWhy: '',
      rows: [],
    };
  }
  return {
    ok: true,
    why: '',
    state: growth.state,
    stateLabel: stateLabel(growth.state),
    initialText: money(growth.initialCapitalRial),
    finalText: money(growth.finalCapitalRial),
    changeText: signed(growth.changeRial, money),
    changePctText: signed(growth.changePct, pct),
    changeTone: tone(growth.changeRial),
    percentageWhy: text(growth.percentageWhy),
    summaryText: `${stateLabel(growth.state)} · ${signed(growth.changeRial, money)}`
      + ` · ${signed(growth.changePct, pct)}`,
    rows: growth.rows.map((row) => ({
      indexText: fmt.int(row.index),
      sessionText: text(row.sessionId),
      portfolioText: text(row.portfolioId),
      baseText: text(row.baseIns),
      closedAtText: momentText(row.closedAt),
      initialText: money(row.initialCapitalRial),
      realizedText: money(row.realizedRial),
      finalText: money(row.finalCapitalRial),
      changeText: signed(row.changeRial, money),
      changePctText: signed(row.changePct, pct),
      state: row.state,
      stateLabel: stateLabel(row.state),
      tone: tone(row.changeRial),
      percentageWhy: text(row.percentageWhy),
      cumulativeChangeText: signed(row.cumulativeChangeRial, money),
      cumulativeChangePctText: signed(row.cumulativeChangePct, pct),
      cumulativeTone: tone(row.cumulativeChangeRial),
      cumulativePercentageWhy: text(row.cumulativePercentageWhy),
    })),
  };
}
