// ۲۱۰. تب دفتر قراردادها — وضعیت انقضا در رابط

import { check, group, readSrc } from '../harness.mjs';

const tab = readSrc('../ui/tabs/option-roster.mjs');
const app = readSrc('../ui/app.mjs');
const css = readSrc('../ui/style.css');

/** بدنهٔ یک قاعدهٔ CSS، بی‌آنکه به قاعدهٔ بعدی سرک بکشد. */
const rule = (selector) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

group('۲۱۰. تب دفتر قراردادها');
{
  check('تب در فهرست ثبت شده و تنبل بار می‌شود',
    /id: 'option-roster'/.test(app) && /mod: '\/ui\/tabs\/option-roster\.mjs'/.test(app));
  check('نام‌های جست‌وجوی مرتبط دارد',
    /alias: 'منقضی سررسید expired roster/.test(app));

  // ── وضعیت، یک رابطهٔ «قرارداد × تاریخ» است ─────────────────────────
  check('برچسب وضعیت از هستهٔ مشترک می‌آید، نه رشتهٔ محلی',
    /import \{ expiryLabel, statusLabel \} from '\/core\/option-roster\.mjs'/.test(tab)
    && !/'منقضی'/.test(tab));
  check('سه وضعیت سه لحن دارند',
    /STATUS_TONE = \{ active: 'gain', expired: 'flat', pending: 'warn' \}/.test(tab));
  check('در حالت بازه، وضعیتِ پایانِ بازه نشان داده می‌شود و در حالت روز، وضعیتِ همان روز',
    /const status = isRange \? r\.statusAtEnd : r\.statusAt;/.test(tab));
  // این نشانِ ویژه، جواب مستقیم خواستهٔ چهارم است: قراردادی که «در بخشی
  // از بازه هست و در بخشی نیست».
  check('قراردادی که داخل بازه سررسید شده، نشانِ جدا دارد',
    /r\.expiresInside \? ' <span class="tag warn">داخل بازه<\/span>'/.test(tab));

  // ── ستونِ وضعیت باید بی‌اسکرول دیده شود ────────────────────────────
  const head = tab.slice(tab.indexOf('<thead>'), tab.indexOf('</thead>'));
  check('وضعیت ستون دوم است، نه آخر',
    head.indexOf('وضعیت') < head.indexOf('نام قرارداد') && head.indexOf('وضعیت') < head.indexOf('قیمت اعمال'),
    head.replace(/\s+/g, ' ').slice(0, 120));

  // ── تاریخ، جلالی ────────────────────────────────────────────────────
  //
  // `input[type=date]` قالبِ زبانِ مرورگر را می‌گیرد و میلادی است؛ کاربری
  // که سررسید را «۱۴۰۵/۰۴/۰۳» می‌شناسد، «۰۶/۲۴/۲۰۲۶» را نمی‌خواند.
  check('انتخاب تاریخ با تقویم جلالی مشترک برنامه است، نه ورودی بومی مرورگر',
    /mountDateWheel\(/.test(tab) && !/type="date"/.test(tab));
  check('هر دو مرزِ بازه تقویم دارند و به هم قفل‌اند',
    /fromWheel = mountDateWheel/.test(tab) && /toWheel = mountDateWheel/.test(tab)
    && /toWheel\.select\(value, false\)/.test(tab) && /fromWheel\.select\(value, false\)/.test(tab));
  check('هر دو تقویم روی همان روزِ نمایش‌داده‌شده در جدول می‌نشینند',
    /const days = coverageDays\(coverage\.from, coverage\.to\)/.test(tab));

  // ── پنهان‌شدن واقعی ─────────────────────────────────────────────────
  //
  // این را فقط مرورگر گرفت: `display:flex` روی خودِ عنصر، `display:none`ِ
  // ضمنیِ `[hidden]` را می‌بازد. صفت `hidden` درست ست می‌شد و فیلد
  // همچنان دیده می‌شد.
  check('کادرِ «تا تاریخ» قاعدهٔ صریح پنهان‌شدن دارد',
    /\.or-cal\[hidden\] \{ display: none; \}/.test(css));
  check('و ترتیبش بعد از قاعدهٔ display است',
    css.indexOf('.or-cal[hidden]') > css.indexOf('.or-cal {'));
  check('حالت یک روز، همان کادر را پنهان می‌کند',
    /\$\('or-to-wrap'\)\.hidden = !range;/.test(tab));

  // ── تقویم به قد یک ماه کامل ────────────────────────────────────────
  //
  // بلندترین ماه جلالی با ردیفِ پیش‌رو شش سطر می‌شود. با قدِ کوتاه‌تر،
  // روزهای پایان ماه پشت اسکرول می‌مانند — و روزِ سررسید معمولاً همان‌جاست.
  //
  // این ادعا کف را نگه می‌دارد، نه عددِ دقیق را: سر و نوار هفته و نوار
  // وضعیت قدشان به مقیاس قلم بند است و شمردنشان اینجا یعنی ادعایی که با
  // هر تغییر قلم می‌شکند. عددِ واقعی در مرورگر سنجیده شد — با ۳۲۶ پیکسل،
  // سرریزِ شبکه در هر دو تقویم صفر است.
  const cal = rule('.date-cal');
  const height = Number((cal.match(/height: (\d+)px/) || [])[1]);
  const cell = Number((rule('.date-cal-grid > *').match(/min-height: (\d+)px/) || [])[1]);
  check('خانهٔ تقویم قد معلوم دارد', cell >= 28, String(cell));
  check('قد تقویم شش سطر کامل را جا می‌دهد',
    height >= 6 * cell + 5 * 3 + 100, `${height} پیکسل برای خانهٔ ${cell}`);

  // ── تاریخ در جدول، فقط جلالی ────────────────────────────────────────
  //
  // دو دنبالهٔ رقمی کنار هم داخل بندِ راست‌به‌چپ جایشان عوض می‌شود، و
  // «۱۴۰۵/۰۶/۰۷ · ۲۰۲۶-۰۸-۲۹» وارونه دیده می‌شد — یعنی میلادی جای جلالی.
  // در جدول اصلاً میلادی لازم نیست؛ در کارت پوشش هست، ولی جداشده.
  const body = tab.slice(tab.indexOf('<tbody>'), tab.indexOf('</tbody>'));
  check('ستون‌های تاریخِ جدول جلالی‌اند', /jalali\(r\.expiry\)/.test(body) && !/bothCalendars/.test(body));
  check('کارت پوشش، میلادی را جدا و ایزوله می‌دهد',
    /ltr\(faDigits/.test(tab) && /bothCalendars\(coverage\.from\)/.test(tab));

  // ── صداقتِ پوشش ─────────────────────────────────────────────────────
  check('شمارِ کنارگذاشته‌ها کنارِ شمارِ پذیرفته‌ها نشان داده می‌شود',
    /نامِ ناخوانا/.test(tab) && /غیر-اختیار، کنار گذاشته/.test(tab));
  check('دفترِ نساخته، دستورِ ساختنش را می‌دهد',
    /roster-scan\.mjs/.test(tab) && /roster-import\.mjs/.test(tab));
  check('بریدنِ فهرست بلند اعلام می‌شود',
    /payload\.truncated/.test(tab) && /فهرست بریده شده/.test(tab));
  check('شمارِ «داخل بازه سررسید شد» با توضیحش می‌آید',
    /فهرست امروز این‌ها را ندارد/.test(tab));

  // ── رنگ فقط از توکن ─────────────────────────────────────────────────
  check('ماژول تازه هیچ رنگ ثابتی ندارد',
    !/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(tab));
}
