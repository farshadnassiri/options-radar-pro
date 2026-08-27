// ۱۵۱. جمع‌شدن ویزارد پس از قفل

import { check, group, readSrc } from '../harness.mjs';

group('۱۵۱. جمع‌شدن ویزارد پس از قفل');
{
  const tab151 = readSrc('../ui/tabs/portfolio-time.mjs');
  const css151 = readSrc('../ui/style.css');

  // ── بند ۱: قفل، جمع هم می‌کند ───────────────────────────────────────
  // قفل‌شدن جای مرحله را کم نمی‌کرد: کاربر باید کل ویزارد را رد می‌کرد
  // تا بفهمد قیدی شکسته.
  check('قفل مأموریت، ویزارد را جمع هم می‌کند',
    /function lockMissionEditor\(\)[\s\S]{0,700}?collapseWizard\(\);/.test(tab151));
  check('و هر پنج مرحله جمع می‌شوند، نه بعضی',
    /WIZARD_STEPS = \['pt-outlook-step', 'pt-risk-step', 'pt-allocation-step',\s*'pt-review-step'\]/
      .test(tab151)
    && /root\.querySelector\('\.pt-main > \.pt-card'\)/.test(tab151));
  check('نشانهٔ جمع‌شدن روی خود کارت می‌نشیند',
    /card\.dataset\.collapsed = 'true'/.test(tab151)
    && /\.pt-card\[data-collapsed="true"\]/.test(css151));

  // ── بند ۲: کوچک‌شدن، نه ناپدیدشدن ───────────────────────────────────
  // کاربر باید بداند چه قفل کرده.
  check('سرِ هر مرحله پس از جمع‌شدن می‌ماند',
    /\.pt-card\[data-collapsed="true"\] > \*:not\(\.section-head\)/.test(css151));
  check('و بخش‌های زندهٔ جلسه هم جمع نمی‌شوند',
    /:not\(\.pt-live\)/.test(css151));
  // مرحلهٔ پنجم خودش میزبان بخش‌های زنده است؛ بدون این نشانه، جمع‌شدنش
  // همان چیزی را پنهان می‌کرد که کاربر برایش آمده.
  const live151 = ['pt-eligibility', 'pt-watch', 'pt-clock', 'pt-ledger',
    'pt-positions', 'pt-proposals'];
  check('هر شش بخش زنده نشانهٔ مشترک دارند',
    live151.every((id) => new RegExp(`class="[^"]*pt-live"[^>]*id="${id}"`).test(tab151)),
    live151.filter((id) => !new RegExp(`class="[^"]*pt-live"[^>]*id="${id}"`).test(tab151))
      .join(' ،') || 'هیچ');

  // ── بند ۳: باز کردن دوباره ──────────────────────────────────────────
  check('هر مرحله دکمهٔ نمایش می‌گیرد',
    /data-pt-expand/.test(tab151) && /textContent = 'نمایش'/.test(tab151));
  check('و دکمه واقعاً باز و بسته می‌کند',
    /card\.dataset\.collapsed = open \? 'true' : 'false'/.test(tab151));
  // دکمه‌ای که خودِ قفل خاموشش کند، بی‌فایده است.
  check('قفل عمومی، دکمهٔ نمایش را خاموش نمی‌کند',
    /ptKeepEnabled = 'true'/.test(tab151)
    && /control\.dataset\.ptKeepEnabled !== 'true'\) control\.disabled = true/.test(tab151));
  // باز کردن برای دیدن است، نه ویرایش: قفل ورودی‌ها سرِ جایش می‌ماند.
  const expandHandler151 = tab151.slice(
    tab151.indexOf("closest('[data-pt-expand]')") - 200,
    tab151.indexOf("function lockMissionEditor"));
  check('باز کردن، ورودی‌ها را دوباره فعال نمی‌کند',
    !/disabled\s*=\s*false/.test(expandHandler151), expandHandler151.length ? '' : 'دستگیره پیدا نشد');

  // ── بند ۴: پیش از قفل دست‌نخورده ────────────────────────────────────
  check('جمع‌شدن فقط از مسیر قفل می‌آید',
    (tab151.match(/collapseWizard\(\)/g) || []).length === 2);
  check('و هیچ کارتی از ابتدا جمع‌شده نیست',
    !/data-collapsed="true"/.test(tab151.slice(0, tab151.indexOf('function mount')))
    && !/<section class="card pt-card[^"]*" id="[^"]*" [^>]*data-collapsed/.test(tab151));

  // ── دکمه در جای درست ────────────────────────────────────────────────
  check('دکمه داخل سرِ همان مرحله می‌نشیند',
    /head\.append\(button\)/.test(tab151)
    && /card\.querySelector\('\.section-head'\)/.test(tab151));
  check('و دوبار ساخته نمی‌شود',
    /head\.querySelector\('\[data-pt-expand\]'\)\) continue/.test(tab151));
  check('سبکش از توکن‌های موجود می‌آید، نه رنگ سخت‌کدشده',
    /\.pt-expand/.test(css151)
    && !/\.pt-expand[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(css151));

  // ── دستگیره یکتا ────────────────────────────────────────────────────
  check('شناسه و دستگیره یکتا هستند',
    (tab151.match(/function collapseWizard\b/g) || []).length === 1
    && (tab151.match(/dataset\.ptExpand = /g) || []).length === 1
    && (tab151.match(/closest\('\[data-pt-expand\]'\)/g) || []).length === 1);
}
