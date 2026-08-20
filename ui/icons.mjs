// آیکون‌های ریل — SVG درون‌خطی.
//
// چرا درون‌خطی و نه فونت آیکون یا فایل: سیاست امنیتی صفحه هیچ میزبان بیرونی
// را باز نمی‌کند و پروژه هیچ وابستگی npm ندارد. یک رشتهٔ SVG کوچک، هم
// سبک‌ترین راه است هم تنها راهی که با `currentColor` رنگ متن را می‌گیرد و
// در هر دو پوسته درست دیده می‌شود.
//
// همه روی قاب ۲۴×۲۴ با خط ضخامت ۱٫۷ کشیده شده‌اند تا کنار هم یک خانواده
// دیده شوند، نه چند تصویر بی‌ربط.

const PATHS = {
  // بخش‌های پایه
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  grid: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/><path d="M10 19h4M12 14v5"/>',

  // گروه‌های استراتژی
  coins: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  vertical: '<path d="M7 20V9M7 4v2"/><path d="M4.5 9h5"/><path d="M17 4v11M17 18v2"/><path d="M14.5 15h5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wave: '<path d="M3 15c2.5 0 2.5-7 5-7s2.5 10 5 10 2.5-9 5-9 2.5 4 3 4"/>',
  peak: '<path d="M3 18h4l5-11 5 11h4"/>',
  ratio: '<path d="M5 19V7M5 19h6"/><path d="M19 5v12M19 5h-6"/><path d="M9 5L5 9M19 19l-4-4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3z"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  alert: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17.5v.01"/>',
  dot: '<circle cx="12" cy="12" r="3.5"/>',
  // مثلث CSS قبلی نه ضخامتش با بقیهٔ خانواده می‌خواند نه چرخشش نرم بود.
  chevron: '<path d="M15 6l-6 6 6 6"/>',
};

/** یک آیکون از خانواده، آماده برای درج در HTML. */
export function icon(name, cls = 'ic') {
  const body = PATHS[name] || PATHS.dot;
  return `<svg class="${cls}" viewBox="0 0 24 24" width="18" height="18" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${body}</svg>`;
}

/** آیکون هر گروه استراتژی. کلید همان کلید GROUPS در فهرست استراتژی‌هاست. */
export const GROUP_ICON = {
  income: 'coins', vertical: 'vertical', calendar: 'calendar', vol: 'wave',
  wing: 'peak', ratio: 'ratio', hedge: 'shield', arb: 'swap',
};

/** آیکون تب‌هایی که استراتژی نیستند. */
export const TAB_ICON = {
  settings: 'sliders', chain: 'grid', history: 'clock', backtest: 'play',
  'portfolio-backtest': 'layers', top: 'trophy', logs: 'alert',
  positions: 'briefcase', roll: 'rotate',
};

/** آیکون سرگروه ریل، بر پایهٔ نام بخش. */
export function sectionIcon(section, groupKey) {
  if (groupKey && GROUP_ICON[groupKey]) return GROUP_ICON[groupKey];
  if (section === 'پایه') return 'sliders';
  if (section === 'موقعیت من') return 'briefcase';
  return 'dot';
}
