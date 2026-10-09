// ۲۷۴. پوستهٔ پیش‌فرض واقعاً اعمال می‌شود
//
// ═══ باگی که این دسته جوابش است ═══
//
// بوت دو بار پوسته می‌گذاشت: یک‌بار پیش از رسیدنِ تنظیمات (تا صفحه سفید
// چشمک نزند) و یک‌بار بعدش با `state.settings.theme`. ولی همان تماسِ اول
// مقدارِ پیش‌فرض را در `localStorage` **می‌نوشت**؛ پس در تماسِ دوم
// `getTheme()` دیگر خالی نبود و همیشه بر تنظیماتِ سرور غالب می‌شد.
//
// یعنی گزینهٔ «پوسته» در تب تنظیمات، روی هر مرورگری که یک‌بار صفحه را باز
// کرده بود، هیچ اثری نداشت — بی خطا و بی پیام. با عوض‌شدنِ پیش‌فرض به
// «تابلو» همین دام در مرورگر دیده شد: `data-theme` روی `ledger` ماند در
// حالی که هم پیش‌فرضِ کد و هم `data/settings.json` تیره بودند.

import { check, group, readSrc } from '../harness.mjs';
import { SCHEMA, defaults } from '../../core/settings.mjs';

const app = readSrc('../ui/app.mjs');

group('۲۷۴. پوستهٔ پیش‌فرض');
{
  // ── پیش‌فرض، در هر سه جایی که ادعایش می‌شود ──
  const themeField = SCHEMA.find((f) => f.key === 'theme');
  // از ۱۴۰۵/۰۷/۱۷ پیش‌فرض «روشن» است (نمونهٔ «ج» که صاحب پروژه برگزید روشن
  // بود). قاعدهٔ این دسته همان است: هر سه جا یک پیش‌فرض.
  check('پیش‌فرضِ تنظیمات «روشن» است', themeField?.def === 'ledger', String(themeField?.def));
  check('و `defaults()` هم همان را می‌دهد', defaults().theme === 'ledger', String(defaults().theme));
  check('صفحه از همان پوسته شروع می‌شود تا چشمک نخورد',
    /<body data-theme="ledger">/.test(readSrc('../ui/index.html')));
  check('و بازگشتِ هر دو تماسِ بوت هم همان است',
    [...app.matchAll(/applyTheme\(getTheme\(\)[^)]*\|\| '(\w+)'/g)].every((m) => m[1] === 'ledger'));

  // ── قلبِ باگ: نوشتن فقط با انتخابِ کاربر ──
  check('`applyTheme` پارامترِ نوشتن دارد',
    /function applyTheme\(name, \{ persist = true \} = \{\}\)/.test(app));
  check('و نوشتن در حافظهٔ مرورگر پشتِ همان پارامتر است',
    /if \(persist\) try \{ localStorage\.setItem\('theme', name\);/.test(app));

  // هر تماسی که کاربر پشتش نیست، نباید بنویسد. اگر فردا تماسِ سومی اضافه
  // شود و `persist` نگیرد، همین ادعا قرمز می‌شود.
  const bootCalls = [...app.matchAll(/applyTheme\(getTheme\(\)[^;]*\);/g)].map((m) => m[0]);
  check('هیچ تماسِ بوتی در حافظه نمی‌نویسد',
    bootCalls.length >= 2 && bootCalls.every((call) => /persist: false/.test(call)),
    `${bootCalls.length} تماس`);

  // و کلیکِ دکمه — تنها جایی که کاربر واقعاً انتخاب می‌کند — باید بنویسد،
  // وگرنه انتخابش با بستنِ صفحه گم می‌شود.
  // دکمهٔ چرخشی جایش را به دو دکمهٔ روشن/تیره در منوی «ظاهر» داد.
  const click = app.match(/if \(pick\) \{ applyTheme\(pick\.dataset\.themePick\); return; \}/)?.[0] || '';
  check('کلیکِ دکمه انتخاب را ذخیره می‌کند', Boolean(click) && !/persist: false/.test(click), click.slice(0, 90));
}
