// متن‌های «؟»: توضیحِ ساده برای یک تریدر، با مثال عددی (۱۴۰۵/۰۷/۱۷).
//
// کلید، متنِ دقیقِ عنوانِ بخش است (h1 تا h4 یا summary) همان‌طور که روی صفحه
// دیده می‌شود. عنوانی که بخشی‌اش پویاست با «…» در پایانِ کلید آمده و با
// پیشوند جور می‌شود. هر گروه از تب‌ها پروندهٔ خودش را در `ui/help-texts/` دارد.

import live from './help-texts/live.mjs';
import analysis from './help-texts/analysis.mjs';
import portfolio from './help-texts/portfolio.mjs';
import tools from './help-texts/tools.mjs';

/** عنوان برای جست‌وجو: بی شکلک و فاصلهٔ اضافه. */
export const normalizeTitle = (text) => String(text || '')
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
  .replace(/\s+/g, ' ').trim();

const exact = new Map(), prefixes = [];
for (const group of [live, analysis, portfolio, tools]) {
  for (const [key, entry] of Object.entries(group || {})) {
    if (!entry?.body) continue;
    const norm = normalizeTitle(key);
    if (norm.endsWith('…')) prefixes.push([norm.slice(0, -1).trim(), entry]);
    else if (!exact.has(norm)) exact.set(norm, entry);
  }
}
prefixes.sort((a, b) => b[0].length - a[0].length);

/** توضیحِ یک عنوان، یا `null`. */
export function helpFor(title) {
  const norm = normalizeTitle(title);
  if (!norm) return null;
  return exact.get(norm) || prefixes.find(([p]) => norm.startsWith(p))?.[1] || null;
}

export const HELP_COUNT = () => exact.size + prefixes.length;
