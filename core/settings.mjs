// ————————————————————————————————————————————————————————————————
// تنظیمات — تک منبع حقیقت
//
// هر عددی که در محاسبه اثر دارد اینجاست و در هیچ فایل دیگری سخت‌کد نمی‌شود.
// فرم تب تنظیمات از همین فهرست ساخته می‌شود، پس افزودن یک کلید اینجا
// خودبه‌خود یک کنترل در رابط کاربری می‌سازد.
//
// group : گروه‌بندی در تب تنظیمات
// kind  : num | pct | bool | pick | text
// scope : server = حلقه دریافت داده | client = محاسبه و نمایش | both
// ————————————————————————————————————————————————————————————————

import { num } from './num.mjs';

export const SCHEMA = [
  // ——— منبع داده ———
  { key: 'baseUrl', group: 'data', kind: 'text', scope: 'server',
    def: 'https://cdn.tsetmc.com/api', label: 'آدرس پایه داده' },
  { key: 'watchIntervalSec', group: 'data', kind: 'num', scope: 'server',
    def: 5, min: 2, max: 120, step: 1, unit: 'ثانیه',
    label: 'فاصله دریافت دیده‌بان',
    hint: 'یک درخواست، کل بازار اختیار. ستون فقرات همه تب‌ها.' },
  { key: 'ttlWatchSec', group: 'data', kind: 'num', scope: 'server',
    def: 4, min: 1, max: 60, step: 1, unit: 'ثانیه', label: 'عمر کش دیده‌بان' },
  { key: 'ttlBookSec', group: 'data', kind: 'num', scope: 'server',
    def: 3, min: 1, max: 60, step: 1, unit: 'ثانیه', label: 'عمر کش دفتر سفارش' },
  { key: 'ttlInfoSec', group: 'data', kind: 'num', scope: 'server',
    def: 3, min: 1, max: 60, step: 1, unit: 'ثانیه', label: 'عمر کش قیمت جاری' },
  { key: 'ttlDailySec', group: 'data', kind: 'num', scope: 'server',
    def: 900, min: 60, max: 86400, step: 60, unit: 'ثانیه', label: 'عمر کش داده روزانه' },
  { key: 'ttlMetaSec', group: 'data', kind: 'num', scope: 'server',
    def: 3600, min: 60, max: 86400, step: 60, unit: 'ثانیه', label: 'عمر کش مشخصات قرارداد' },

  // ——— سهمیه و فشار روی سرور بازار ———
  { key: 'ratePerSec', group: 'quota', kind: 'num', scope: 'server',
    def: 12, min: 1, max: 60, step: 1, unit: 'درخواست در ثانیه',
    label: 'سقف نرخ درخواست',
    hint: 'سهمیه فقط در سرور محلی اعمال می‌شود، پس چند تب هم‌زمان بازار را نمی‌کوبند.' },
  { key: 'burst', group: 'quota', kind: 'num', scope: 'server',
    def: 20, min: 1, max: 120, step: 1, unit: 'درخواست', label: 'ظرفیت انفجاری' },
  { key: 'concurrency', group: 'quota', kind: 'num', scope: 'server',
    def: 6, min: 1, max: 24, step: 1, unit: 'هم‌زمان', label: 'سقف درخواست هم‌زمان' },
  { key: 'retries', group: 'quota', kind: 'num', scope: 'server',
    def: 2, min: 0, max: 5, step: 1, unit: 'بار', label: 'تلاش مجدد' },
  { key: 'timeoutMs', group: 'quota', kind: 'num', scope: 'server',
    def: 9000, min: 1000, max: 30000, step: 500, unit: 'میلی‌ثانیه', label: 'مهلت هر درخواست' },
  { key: 'maxDepthSymbols', group: 'quota', kind: 'num', scope: 'client',
    def: 24, min: 2, max: 200, step: 1, unit: 'نماد',
    label: 'سقف نماد با عمق کامل',
    hint: 'مرحله دو غربال. عمق پنج سطحی فقط برای همین تعداد کاندیدای برتر گرفته می‌شود.' },
  { key: 'maxCacheEntries', group: 'quota', kind: 'num', scope: 'server',
    def: 2000, min: 50, max: 50000, step: 50, unit: 'ورودی',
    label: 'سقف کش سرور',
    hint: 'کلید کش یک URL بالادست است. بدون سقف، نشست طولانی روی بازار پر از نماد حافظه را بی‌رویه پر می‌کند.' },

  // ——— ساعات بازار ———
  { key: 'gateMarketHours', group: 'hours', kind: 'bool', scope: 'server',
    def: true, label: 'توقف خودکار بیرون از بازار' },
  { key: 'openHHMM', group: 'hours', kind: 'text', scope: 'server',
    def: '09:00', label: 'شروع بازار (تهران)' },
  { key: 'closeHHMM', group: 'hours', kind: 'text', scope: 'server',
    def: '12:30', label: 'پایان بازار (تهران)' },
  { key: 'tradeDays', group: 'hours', kind: 'text', scope: 'server',
    def: 'Sat,Sun,Mon,Tue,Wed', label: 'روزهای معاملاتی' },

  // ——— مبنای محاسبه ———
  // اعدادی که تا پیش از این در دل موتور سخت‌کد بودند. هیچ‌کدام سلیقه‌ای
  // نیستند، ولی هیچ‌کدام هم ابدی نیستند: اندازه قرارداد با افزایش سرمایه
  // تعدیل می‌شود و مبنای روزشماری، انتخاب است نه قانون طبیعت.
  { key: 'contractSize', group: 'basis', kind: 'num', scope: 'client',
    def: 1000, min: 1, max: 1000000, step: 1, unit: 'سهم',
    label: 'اندازه قرارداد — فقط پیش‌فرض',
    hint: 'این عدد مبنای محاسبه نیست. اندازه هر پا از مشخصات خودِ همان قرارداد خوانده می‌شود، چون پس از افزایش سرمایه، اندازه قرارداد و قیمت اعمال یک سری تعدیل می‌شوند و دو سررسید یک پایه می‌توانند دو اندازه متفاوت داشته باشند. این عدد فقط وقتی می‌نشیند که تابلو اندازه ندهد — و آن ردیف برچسب «اندازه قرارداد فرضی» می‌گیرد تا با ردیفی که اندازه واقعی دارد اشتباه نشود.' },
  { key: 'dayCountYear', group: 'basis', kind: 'num', scope: 'client',
    def: 365, min: 1, max: 400, step: 1, unit: 'روز',
    label: 'روز سال — مبنای زمان',
    hint: 'هم مخرج T در بلک-شولز است، هم مخرج سالانه‌سازی بازده. تقویمی است نه معاملاتی، چون تا سررسید روز تقویمی می‌گذرد. با «روز معاملاتی در سال» اشتباه نشود؛ آن یکی فقط در تلاطم تاریخی به کار می‌رود و مبنای دیگری دارد.' },
  { key: 'daysPerMonth', group: 'basis', kind: 'num', scope: 'client',
    def: 30, min: 1, max: 40, step: 1, unit: 'روز',
    label: 'روز ماه — مبنای بازده ماهانه',
    hint: 'ستون بازده ماهانه، بازده دوره را با همین عدد هم‌مقیاس می‌کند تا دو ترکیب با طول عمر متفاوت قابل مقایسه شوند.' },
  { key: 'shortDteDays', group: 'basis', kind: 'num', scope: 'client',
    def: 7, min: 0, max: 60, step: 1, unit: 'روز',
    label: 'آستانه هشدار سررسید نزدیک',
    hint: 'زیر این آستانه، ردیف برچسب «سررسید نزدیک» می‌گیرد. نزدیک سررسید گاما بزرگ می‌شود و تخمین‌ها شکننده‌اند.' },

  // ——— کارمزد ———
  { key: 'feeBuyStock', group: 'fees', kind: 'pct', scope: 'client',
    def: 0.003712, min: 0, max: 0.05, step: 0.000001, label: 'کارمزد خرید سهم' },
  { key: 'feeSellStock', group: 'fees', kind: 'pct', scope: 'client',
    def: 0.008800, min: 0, max: 0.05, step: 0.000001,
    label: 'کارمزد فروش سهم', hint: 'شامل مالیات فروشنده.' },
  { key: 'feeOption', group: 'fees', kind: 'pct', scope: 'client',
    def: 0.001030, min: 0, max: 0.05, step: 0.000001,
    label: 'کارمزد معامله اختیار، هر سمت',
    hint: 'با پنل کارگزاری خودت تطبیق بده. این عدد در استراتژی چندپا چند بار پرداخت می‌شود.' },
  { key: 'feeExercise', group: 'fees', kind: 'pct', scope: 'client',
    def: 0.000500, min: 0, max: 0.05, step: 0.000001, label: 'کارمزد اعمال' },
  // ——— نرخ دارایی پایه بر حسب نوع ابزار ———
  // پیش‌فرض هر سه کلاس عمداً برابر نرخ سهم است، تا تا وقتی کاربر نرخ
  // کارگزارش را وارد نکرده هیچ عددی بی‌صدا جابه‌جا نشود. عددی که تأییدش
  // نکرده‌ایم اینجا نمی‌نشیند.
  { key: 'feeBuyEtf', group: 'fees', kind: 'pct', scope: 'client',
    def: 0.003712, min: 0, max: 0.05, step: 0.000001,
    label: 'کارمزد خرید صندوق قابل معامله',
    hint: 'تا وارد نکنی، برابر نرخ سهم می‌ماند. نرخ واقعی را از صورتحساب کارگزارت بردار.' },
  { key: 'feeSellEtf', group: 'fees', kind: 'pct', scope: 'client',
    def: 0.008800, min: 0, max: 0.05, step: 0.000001,
    label: 'کارمزد فروش صندوق قابل معامله',
    hint: 'مالیات فروشندهٔ سهم برای صندوق برقرار نیست؛ نرخ واقعی را از صورتحساب کارگزارت بردار.' },
  { key: 'feeBuyCommodity', group: 'fees', kind: 'pct', scope: 'client',
    def: 0.003712, min: 0, max: 0.05, step: 0.000001, label: 'کارمزد خرید صندوق کالایی' },
  { key: 'feeSellCommodity', group: 'fees', kind: 'pct', scope: 'client',
    def: 0.008800, min: 0, max: 0.05, step: 0.000001, label: 'کارمزد فروش صندوق کالایی' },
  { key: 'assetClassMap', group: 'fees', kind: 'text', scope: 'client',
    def: '', label: 'نوع دارایی پایه',
    hint: 'فهرست «شناسه یا نام پایه:نوع» جداشده با ویرگول — مثل «اهرم:ETF». نوع‌ها: STOCK و ETF و COMMODITY. هرچه اینجا نباشد سهم فرض می‌شود. تابلوی اختیار نوع ابزار را نمی‌دهد، پس این نگاشت دست توست؛ حدس زدن از روی نام، اختراع داده است.' },

  // ——— وجه تضمین ———
  { key: 'marginA', group: 'margin', kind: 'num', scope: 'client',
    def: 0.20, min: 0, max: 1, step: 0.01, label: 'ضریب A' },
  { key: 'marginB', group: 'margin', kind: 'num', scope: 'client',
    def: 0.10, min: 0, max: 1, step: 0.01, label: 'ضریب B' },
  { key: 'marginC', group: 'margin', kind: 'num', scope: 'client',
    def: 10000, min: 1, max: 1000000, step: 1000, unit: 'ریال', label: 'واحد گردکردن C' },
  { key: 'marginMaint', group: 'margin', kind: 'num', scope: 'client',
    def: 0.70, min: 0, max: 1, step: 0.01, label: 'ضریب نگهداشت' },
  { key: 'capitalMode', group: 'margin', kind: 'pick', scope: 'client',
    def: 'NET', options: [['NET', 'خالص — وجه تضمین منهای بستانکار'], ['GROSS', 'ناخالص — کل وجه تضمین']],
    label: 'مبنای سرمایه در موقعیت فروش' },
  { key: 'creditSpreadMargin', group: 'margin', kind: 'pick', scope: 'client',
    def: 'FULL',
    options: [
      ['FULL', 'الف — کامل روی پای فروش، بدون تخفیف'],
      ['LESS_WIDTH', 'ب — کامل منهای فاصله قیمت اعمال'],
      ['WIDTH', 'ج — فقط فاصله قیمت اعمال'],
    ],
    label: 'وجه تضمین اسپرد بستانکار',
    hint: 'اسپرد بدهکار وجه تضمین ندارد. برای بستانکار، مقدارش با تابلو تأیید نشده؛ الف محافظه‌کارانه‌ترین است.' },

  // ——— مبنای قیمت و اجرا ———
  { key: 'priceBasis', group: 'exec', kind: 'pick', scope: 'client',
    def: 'BOOK',
    options: [
      ['BOOK', 'دفتر سفارش — قابل اجرا'],
      ['LAST', 'آخرین معامله — مرجع'],
      ['CLOSE', 'قیمت پایانی — مرجع'],
      ['LOW', 'کمترین قیمت روز — ناهم‌زمان'],
      ['HIGH', 'بیشترین قیمت روز — ناهم‌زمان'],
    ],
    label: 'مبنای پیش‌فرض قیمت',
    hint: 'کمترین و بیشترین، تجمعی کل روز هستند و لحظه وقوعشان معلوم نیست؛ ترکیبشان سناریوی هم‌زمان نمی‌سازد.' },
  { key: 'execMode', group: 'exec', kind: 'pick', scope: 'client',
    def: 'AGGRESSIVE',
    options: [
      ['AGGRESSIVE', 'تهاجمی — عبور از کل اسپرد'],
      ['MID', 'میانه — نصف اسپرد، بدون تضمین اجرا'],
      ['CONSERVATIVE', 'محافظه‌کار — یک پله بدتر از مظنه'],
    ],
    label: 'حالت اجرا' },
  { key: 'qtyDefault', group: 'exec', kind: 'num', scope: 'client',
    def: 1, min: 1, max: 10000, step: 1, unit: 'قرارداد',
    label: 'حجم پیش‌فرض من',
    hint: 'مبنای دفتر سفارش بدون حجم بی‌معناست؛ قیمت اجرا با پیمایش پنج سطح برای همین حجم حساب می‌شود.' },
  { key: 'capitalAvailable', group: 'exec', kind: 'num', scope: 'client',
    def: 1000000000, min: 0, max: 1e13, step: 10000000, unit: 'ریال', label: 'سرمایه در دسترس' },
  { key: 'maxSlipPct', group: 'exec', kind: 'num', scope: 'client',
    def: 12, min: 0, max: 100, step: 0.5, unit: 'درصد', label: 'سقف افت مظنه قابل تحمل' },
  { key: 'staleSec', group: 'exec', kind: 'num', scope: 'client',
    def: 900, min: 30, max: 7200, step: 30, unit: 'ثانیه', label: 'آستانه کهنگی مظنه' },
  { key: 'showUnexecutable', group: 'exec', kind: 'bool', scope: 'client',
    def: false, label: 'نمایش ردیف‌های غیرقابل اجرا',
    hint: 'ترکیب‌های بی‌مظنه را با مبنای پایانی و برچسب خاکستری برمی‌گرداند، فقط برای مطالعه.' },

  // ——— غربال مشترک ———
  { key: 'minDays', group: 'screen', kind: 'num', scope: 'client',
    def: 1, min: 0, max: 400, step: 1, unit: 'روز', label: 'حداقل روز تا سررسید' },
  { key: 'maxDays', group: 'screen', kind: 'num', scope: 'client',
    def: 120, min: 1, max: 400, step: 1, unit: 'روز', label: 'حداکثر روز تا سررسید' },
  { key: 'minBid', group: 'screen', kind: 'num', scope: 'client',
    def: 1, min: 0, max: 1e7, step: 1, unit: 'ریال', label: 'حداقل قیمت تقاضا' },
  { key: 'minBidQty', group: 'screen', kind: 'num', scope: 'client',
    def: 1, min: 0, max: 1e6, step: 1, unit: 'قرارداد', label: 'حداقل حجم مظنه' },
  { key: 'minOpenInt', group: 'screen', kind: 'num', scope: 'client',
    def: 0, min: 0, max: 1e7, step: 10, unit: 'موقعیت', label: 'حداقل موقعیت باز' },
  { key: 'minLegVol', group: 'screen', kind: 'num', scope: 'client',
    def: 0, min: 0, max: 1e7, step: 10, unit: 'قرارداد', label: 'حداقل حجم معاملات هر پا',
    hint: 'حجم امروز آن قرارداد، نه حجم مظنه فعلی. رد کردن قراردادی که کسی امروز رویش معامله نکرده.' },
  { key: 'minLegValue', group: 'screen', kind: 'num', scope: 'client',
    def: 0, min: 0, max: 1e13, step: 1000000, unit: 'ریال', label: 'حداقل ارزش معاملات هر پا' },
  { key: 'minUaLiquidity', group: 'screen', kind: 'num', scope: 'client',
    def: 0, min: 0, max: 1e14, step: 10000000, unit: 'ریال', label: 'حداقل نقدشوندگی زنجیره پایه',
    hint: 'مجموع ارزش معاملات امروز کل زنجیره اختیار همان پایه، نه فقط یک قرارداد. رد کردن پایه‌ای که کل زنجیره‌اش امروز خوابیده.' },
  { key: 'maxSpreadPct', group: 'screen', kind: 'num', scope: 'client',
    def: 100, min: 0, max: 1000, step: 1, unit: 'درصد', label: 'سقف اسپرد' },
  { key: 'minReturnPct', group: 'screen', kind: 'num', scope: 'client',
    def: 0, min: -100, max: 1000, step: 0.5, unit: 'درصد', label: 'حداقل بازده دوره' },
  { key: 'minCapital', group: 'screen', kind: 'num', scope: 'client',
    def: 0, min: 0, max: 1e13, step: 1000000, unit: 'ریال', label: 'حداقل سرمایه درگیر',
    hint: 'ترکیبی که سرمایه درگیرش چند ریال است، بازده درصدیِ بی‌معنی می‌سازد و صدر جدول می‌نشیند، در حالی که با آن مبلغ اصلاً باز نمی‌شود. صفر یعنی خاموش — عدد آستانه سلیقهٔ توست، نه حکم مدل.' },
  { key: 'retWarnMonthPct', group: 'screen', kind: 'num', scope: 'client',
    def: 1000, min: 0, max: 1e7, step: 100, unit: 'درصد',
    label: 'آستانه هشدار بازده نامتعارف',
    hint: 'بالاتر از این، ردیف برچسب «بازده نامتعارف» می‌گیرد. فیلتر نیست و ردیف را حذف نمی‌کند؛ فقط می‌گوید عدد از مظنه‌ای آمده که بازار به آن قیمت نمی‌دهد. صفر یعنی خاموش.' },
  { key: 'blockedExpiries', group: 'screen', kind: 'text', scope: 'client',
    def: '', label: 'سررسیدهای با سقف موقعیت پر',
    hint: 'فهرست «شناسه نماد پایه:تاریخ سررسید» جداشده با ویرگول. معمولاً از نوار بالای برنامه انتخاب می‌شود. وقتی سقف یک سررسید پر است، موقعیت فزاینده تازه ممکن نیست و فقط آفست موقعیت قبلی می‌ماند؛ پس برای آن سررسید هیچ استراتژی‌ای پیشنهاد نمی‌شود.' },

  // ——— مهار ترکیب‌سازی ———
  { key: 'comboWindowMode', group: 'combo', kind: 'pick', scope: 'client',
    def: 'auto',
    options: [
      ['auto', 'خودکار — همهٔ قیمت‌های اعمال'],
      ['pct', 'درصد ثابت حول قیمت پایه'],
      ['steps', 'شمار پلهٔ ثابت هر طرف'],
      ['all', 'همه — بی‌پنجره'],
    ],
    label: 'قاعده پنجره قیمت اعمال',
    hint: 'خودکار هیچ قیمت اعمالی را کنار نمی‌گذارد — سقف ترکیب برداشته شده و چیزی نیست که مجبور کند. «درصد ثابت» و «شمار پله» فقط وقتی اثر دارند که خودت عمداً پنجره بخواهی؛ «درصد ثابت» رفتار نسخه‌های پیشین است و برای بازتولید نتیجه قدیمی مانده.' },
  { key: 'comboWindowPct', group: 'combo', kind: 'num', scope: 'client',
    def: 25, min: 2, max: 100, step: 1, unit: 'درصد',
    label: 'پنجره قیمت اعمال حول پایه',
    hint: 'فقط در حالت «درصد ثابت» اثر دارد. قیمت اعمال دورتر از این فاصله وارد ترکیب‌سازی نمی‌شود.' },
  { key: 'comboWindowSteps', group: 'combo', kind: 'num', scope: 'client',
    def: 6, min: 1, max: 60, step: 1, unit: 'پله',
    label: 'شمار پله هر طرف پایه',
    hint: 'فقط در حالت «شمار پله» اثر دارد. برخلاف درصد، خودش را با نردبان واقعی همان سررسید تطبیق می‌دهد.' },
  { key: 'wingsEqualWidth', group: 'combo', kind: 'bool', scope: 'client',
    def: true, label: 'باترفلای و کندور فقط با بال مساوی',
    hint: 'خاموش کردنش تعداد ترکیب را چند برابر می‌کند.' },
  { key: 'greeksInScan', group: 'combo', kind: 'bool', scope: 'client',
    def: false, label: 'یونانی در مرحله یک',
    hint: 'استخراج تلاطم ضمنی برای هر پا گران است. خاموش بماند؛ یونانی‌ها در مرحله دو برای کاندیداهای برتر حساب می‌شوند.' },
  { key: 'rankBy', group: 'combo', kind: 'pick', scope: 'client',
    def: 'retMonthPct',
    options: [
      ['retMonthPct', 'بازده ماهانه'],
      ['retMaxPct', 'بازده دوره'],
      ['retStaticPct', 'بازده ایستا'],
      ['popPct', 'احتمال سود'],
      ['maxProfit', 'بیشترین سود'],
      ['thetaToCapitalPct', 'تتا به سرمایه'],
    ],
    label: 'مبنای رتبه‌بندی' },

  // ——— تلاطم و احتمال ———
  { key: 'rFree', group: 'vol', kind: 'num', scope: 'client',
    def: 0.30, min: 0, max: 1.5, step: 0.005, label: 'نرخ بدون ریسک سالانه',
    hint: 'روی همه یونانی‌ها و قیمت نظری اثر دارد — مستقیم روی «رو» و از راه d1 و d2 روی بقیه. عدد پیش‌فرض سلیقه‌ای است، تأییدش کن. کسر است نه درصد: ۰٫۳ یعنی سی درصد.' },
  { key: 'divYield', group: 'vol', kind: 'num', scope: 'client',
    def: 0.00, min: 0, max: 1, step: 0.005, label: 'بازده نقدی سالانه پایه',
    hint: 'بازده نقدی پیوستهٔ دارایی پایه در فرمول بلک-شولز-مرتون. سود نقدی سالانهٔ پایه‌ای که تا سررسید مجمع دارد اینجا می‌نشیند؛ اگر مجمعی در راه نیست صفر بماند. کسر است نه درصد.' },
  { key: 'volSource', group: 'vol', kind: 'pick', scope: 'client',
    def: 'IV', options: [['IV', 'تلاطم ضمنی'], ['HIST', 'تلاطم تاریخی'], ['MANUAL', 'دستی']],
    label: 'منبع تلاطم' },
  { key: 'ivBasis', group: 'vol', kind: 'pick', scope: 'client',
    def: 'CLOSE', options: [['CLOSE', 'قیمت پایانی'], ['LAST', 'آخرین معامله'], ['BID', 'قیمت تقاضا']],
    label: 'مبنای استخراج تلاطم ضمنی' },
  { key: 'volManual', group: 'vol', kind: 'num', scope: 'client',
    def: 0.60, min: 0.01, max: 5, step: 0.01, label: 'تلاطم دستی سالانه' },
  { key: 'ivLo', group: 'vol', kind: 'num', scope: 'client',
    def: 0.01, min: 0.001, max: 1, step: 0.01, label: 'کف جست‌وجوی تلاطم' },
  { key: 'ivHi', group: 'vol', kind: 'num', scope: 'client',
    def: 5.00, min: 0.5, max: 20, step: 0.5, label: 'سقف جست‌وجوی تلاطم' },
  { key: 'volDays', group: 'vol', kind: 'num', scope: 'client',
    def: 120, min: 30, max: 500, step: 10, unit: 'روز', label: 'طول تاریخچه تلاطم',
    hint: 'چند روز قیمت پایانی پایه گرفته شود تا تلاطم تاریخی از آن دربیاید. کوتاه‌ترش تازه‌تر است و پرنوسان‌تر؛ بلندترش آرام‌تر و کندتر.' },
  { key: 'hvWindowDays', group: 'vol', kind: 'num', scope: 'client',
    def: 60, min: 22, max: 500, step: 1, unit: 'روز', label: 'پنجره تلاطم تاریخی غلتان',
    hint: 'خط تلاطم تاریخی در نمودار رصد، هر روز از همین تعداد روز آخر ساخته می‌شود. کمتر از ۲۲ روز پذیرفته نمی‌شود چون انحراف معیارِ کمتر از این، عدد نیست.' },
  { key: 'hvManualPct', group: 'vol', kind: 'num', scope: 'client',
    def: 0, min: 0, max: 500, step: 1, unit: 'درصد سالانه', label: 'تلاطم تاریخی دستی — وقتی داده کم است',
    hint: 'صفر یعنی «اعلام نشده» و ستون تلاطم تاریخی خالی می‌ماند. اگر تاریخچهٔ پایه کوتاه‌تر از ۲۲ روز باشد — نماد تازه‌پذیرفته‌شده یا بازگشایی پس از توقف طولانی — برنامه عددی نمی‌سازد و همین عدد اعلامی تو جایش می‌نشیند، با برچسب «دستی» تا با عدد درآمده از قیمت اشتباه نشود. تا وقتی داده کافی باشد، این عدد به کار نمی‌رود.' },
  { key: 'tradingDaysYr', group: 'vol', kind: 'num', scope: 'client',
    def: 240, min: 200, max: 260, step: 1, unit: 'روز', label: 'روز معاملاتی در سال',
    hint: 'مخرج سالانه‌سازی تلاطم تاریخی: انحراف معیار بازده روزانه در ریشهٔ این عدد ضرب می‌شود. منابع فارسی معمولاً ۲۵۰ یا ۲۵۲ می‌گیرند و تقویم معاملاتی تهران به ۲۴۰ نزدیک‌تر است؛ قابل تنظیم است چون انتخاب است نه قانون. با «روز سال — مبنای زمان» یکی نیست؛ آن یکی تقویمی است و مخرج T در بلک-شولز.' },
  { key: 'shockPct', group: 'vol', kind: 'num', scope: 'client',
    def: 10, min: 1, max: 60, step: 1, unit: 'درصد', label: 'شوک سناریو' },

  // ——— نمایش ———
  { key: 'theme', group: 'view', kind: 'pick', scope: 'client',
    def: 'ledger', options: [['ledger', 'دفتر — روشن'], ['board', 'تابلو — تیره']], label: 'پوسته' },
  { key: 'persianDigits', group: 'view', kind: 'bool', scope: 'client',
    def: false, label: 'ارقام فارسی' },
  { key: 'topN', group: 'view', kind: 'num', scope: 'client',
    def: 200, min: 10, max: 5000, step: 10, unit: 'ردیف', label: 'سقف ردیف جدول' },

  // ——— سفره پر برکت بازار ———
  //
  // هر عددی که رفتار شبیه‌ساز سفر در زمان را عوض می‌کند همین‌جاست. دو
  // دلیل: یکی قاعدهٔ همیشگی مخزن که هیچ عدد اثرگذاری جای دیگری سخت‌کد
  // نشود، و دیگری اینکه سند صریح خواسته قاعدهٔ رژیم بازار در تنظیمات
  // **دیده شود** — قاعده‌ای که کاربر نتواند ببیندش، برچسبی است که به او
  // تحمیل شده.
  { key: 'bkCapitalToman', group: 'bereket', kind: 'num', scope: 'client',
    def: 1_000_000_000, min: 1_000_000, max: 1_000_000_000_000, step: 1_000_000, unit: 'تومان',
    label: 'سرمایه مجازی هر جلسه',
    hint: 'واحد داخلی همهٔ محاسبه‌ها ریال است و این عدد فقط در لایهٔ نمایش تومان می‌ماند. با یک میلیارد تومان، نقدشوندگی مسئلهٔ اول است نه انتخاب استراتژی — پس این عدد بیش از آنکه سقف سرمایه باشد، تعیین می‌کند کدام ساختارها اصلاً ساختنی‌اند.' },
  { key: 'bkLookbackMonths', group: 'bereket', kind: 'num', scope: 'client',
    def: 3, min: 1, max: 24, step: 1, unit: 'ماه',
    label: 'بازهٔ انتخاب لحظهٔ شروع',
    hint: 'هرچه بازه بلندتر، رژیم‌های بیشتری در دسترس‌اند؛ ولی داده هم بیشتر گرفته می‌شود و جلسه دیرتر شروع می‌شود.' },
  { key: 'bkTakePct', group: 'bereket', kind: 'num', scope: 'client',
    def: 30, min: 1, max: 100, step: 1, unit: 'درصد',
    label: 'سقف مصرف عمق هر سطح',
    hint: 'برداشتن صد درصد حجم هر سطح دفتر یعنی فرض کنیم کل صف پشت آن سطح مال ماست. سی درصد یعنی محافظه‌کارانه‌تر و نزدیک‌تر به آنچه واقعاً پر می‌شود. این عدد مستقیم در سقف تعداد قرارداد ضرب می‌شود.' },
  { key: 'bkResidualWarnPct', group: 'bereket', kind: 'num', scope: 'client',
    def: 20, min: 1, max: 100, step: 1, unit: 'درصد',
    label: 'آستانهٔ هشدار باقی‌ماندهٔ تجزیه',
    hint: 'باقی‌ماندهٔ بزرگ یعنی مدل قیمت‌گذاری این موقعیت را درست نمی‌بندد، نه اینکه بازار عجیب رفتار کرده. از این آستانه که رد شود، هشدار خودکار روی گزارش می‌نشیند.' },
  { key: 'bkRegimeWindow', group: 'bereket', kind: 'num', scope: 'client',
    def: 20, min: 5, max: 120, step: 1, unit: 'روز معاملاتی',
    label: 'پنجرهٔ تشخیص رژیم بازار',
    hint: 'پنجره عقب‌روست، نه مرکزی: برچسب هر روز فقط از روزهای پیش از خودش ساخته می‌شود، وگرنه همان برچسب به کاربر می‌گفت بازار بعداً چه کرد.' },
  { key: 'bkRegimeThresholdPct', group: 'bereket', kind: 'num', scope: 'client',
    def: 5, min: 1, max: 50, step: 1, unit: 'درصد',
    label: 'آستانهٔ رژیم صعودی و نزولی',
    hint: 'بازده پنجره بیش از این، صعودی؛ کمتر از منفی این، نزولی؛ بینشان راکد. همین جمله در گزارش پایان جلسه هم نوشته می‌شود.' },
  { key: 'bkAnonymous', group: 'bereket', kind: 'bool', scope: 'client',
    def: true,
    label: 'حالت ناشناس، پیش‌فرض روشن',
    hint: 'نام نماد و تاریخ تا پایان جلسه پنهان می‌مانند. برای کسی که سال‌هاست در این بازار معامله می‌کند، دیدن نام نماد یعنی دانستن نتیجه — و بدون این حالت، تمرین به خودفریبی تبدیل می‌شود.' },
  { key: 'bkCreditSpreadMargin', group: 'bereket', kind: 'pick', scope: 'client',
    def: 'maxOfLossAndShortLeg',
    options: [
      ['maxOfLossAndShortLeg', 'بیشینهٔ زیان حداکثر و وجه تضمین پای فروش — تخمینی'],
      ['maxLoss', 'زیان حداکثر'],
      ['shortLeg', 'وجه تضمین کامل پای فروش'],
    ],
    label: 'وجه تضمین اسپرد بستانکار',
    hint: 'مقدار دقیقی که کارگزار روی اسپرد بستانکار می‌گیرد هنوز با صورتحساب واقعی تطبیق داده نشده. تا آن روز، این عدد **تخمینی** است و هر جا نمایش داده شود همین برچسب را دارد. اسپرد بدهکار وجه تضمین نمی‌گیرد؛ ملاک بستانکاری است نه جهت استراتژی.' },
  { key: 'bkStepGrainSec', group: 'bereket', kind: 'num', scope: 'client',
    def: 900, min: 60, max: 3600, step: 60, unit: 'ثانیه',
    label: 'دانه‌بندی قدم‌های میانی پرش',
    hint: 'پرش هرگز واقعاً پرش نیست: موتور قدم‌به‌قدم جلو می‌رود و در هر قدم کال مارجین و سررسید و توقف را می‌بیند. دانهٔ ریزتر یعنی دقیق‌تر و کندتر.' },
];

export const GROUPS = {
  data:   { title: 'منبع داده و زمان دریافت', note: 'یک درخواست دیده‌بان، کل بازار اختیار را می‌دهد. عمق و وضعیت، فقط بر اساس تقاضا.' },
  quota:  { title: 'سهمیه درخواست', note: 'سهمیه در سرور محلی اعمال می‌شود، نه در مرورگر.' },
  hours:  { title: 'ساعات بازار', note: 'بیرون از بازار حلقه دریافت متوقف می‌شود و آخرین عکس لحظه‌ای در حافظه می‌ماند.' },
  basis:  { title: 'مبنای محاسبه', note: 'اعداد پایه‌ای که زیر همه فرمول‌ها نشسته‌اند. عوض کردنشان هر ستون بازده را در همه تب‌ها جابه‌جا می‌کند.' },
  fees:   { title: 'کارمزدها', note: 'در استراتژی چندپا، کارمزد هر پا جدا پرداخت می‌شود.' },
  margin: { title: 'وجه تضمین و سرمایه', note: 'جزء B با قیمت پایانی دارایی پایه محاسبه می‌شود. استرادل و استرانگل فروش هم‌ماه به‌جای جمع دو پا، با قاعدهٔ ترکیبی کارگزاری محاسبه می‌شوند؛ این دو مبنا با صورتحساب واقعی تطبیق داده شده‌اند.' },
  exec:   { title: 'مبنای قیمت و اجرا', note: 'مبنای دفتر سفارش، تنها مبنایی است که ادعای اجرا دارد.' },
  screen: { title: 'غربال مشترک', note: 'این فیلترها روی همه تب‌ها اعمال می‌شوند.' },
  combo: { title: 'ترکیب‌سازی', note: 'تعداد ترکیب با تعداد پا رشد انفجاری دارد. این اعداد مهارش می‌کنند.' },
  vol:    { title: 'یونانی‌ها، تلاطم و احتمال', note: 'هر پارامتری که در محاسبهٔ یونانی‌ها و تلاطم اثر دارد همین‌جاست و جای دیگری سخت‌کد نشده. تب رصد یونانی، آزمایشگاه آپشن، تحلیل تاریخی و موقعیت‌های من همگی همین اعداد را می‌خوانند. مدل لگاریتم-نرمال دامنه نوسان را نمی‌بیند و حرکت‌های بزرگ را بیش‌برآورد می‌کند.' },
  bereket: { title: 'سفره پر برکت بازار', note: 'شبیه‌ساز سفر در زمان با کاربر در حلقه. این اعداد رفتار خود جلسه را عوض می‌کنند، نه محاسبهٔ استراتژی را — آن‌ها بالاتر، در همین صفحه‌اند و همان‌ها هم در جلسه به کار می‌روند.' },
  view:   { title: 'نمایش', note: '' },
};

export function defaults() {
  const o = {};
  for (const f of SCHEMA) o[f.key] = f.def;
  return o;
}

/** ورودی ناشناخته را دور می‌ریزد و اعداد را در کران خودشان می‌بندد. */
export function sanitize(input = {}) {
  const out = defaults();
  for (const f of SCHEMA) {
    if (!(f.key in input)) continue;
    let v = input[f.key];
    if (f.kind === 'bool') { out[f.key] = !!v; continue; }
    if (f.kind === 'num' || f.kind === 'pct') {
      v = Number(v);
      if (!Number.isFinite(v)) continue;
      if (f.min != null) v = Math.max(f.min, v);
      if (f.max != null) v = Math.min(f.max, v);
      out[f.key] = v;
      continue;
    }
    if (f.kind === 'pick') {
      if (f.options.some(([k]) => k === v)) out[f.key] = v;
      continue;
    }
    out[f.key] = String(v);
  }
  return out;
}

/**
 * نوع‌های دارایی پایه. کارمزد و مالیاتِ سهم، صندوق قابل معامله و صندوق
 * کالایی یکی نیست، و استراتژی‌های دارای پای سهم — کاوردکال، پوت حفاظتی،
 * کولار، تبدیل — همان نرخ را در ارزش کل موقعیت ضرب می‌کنند.
 */
export const ASSET_CLASSES = [
  ['STOCK', 'سهم'],
  ['ETF', 'صندوق قابل معامله'],
  ['COMMODITY', 'صندوق کالایی'],
];

const ASSET_CLASS_LABEL = new Map(ASSET_CLASSES);
export const assetClassLabel = (k) => ASSET_CLASS_LABEL.get(k) || ASSET_CLASS_LABEL.get('STOCK');

/**
 * نگاشت «پایه → نوع ابزار»، از متن تنظیمات.
 *
 * چرا دستی: تابلوی اختیار نوع ابزار پایه را نمی‌دهد. تشخیص خودکار از روی
 * نام یعنی حدس زدن — و حدسی که در نرخ کارمزدِ کل موقعیت ضرب شود، از نداشتنِ
 * تفکیک بدتر است. پس ورودی، اعلام کاربر است؛ همان الگوی «سررسیدهای با سقف
 * موقعیت پر» که آن هم از تابلو خوانده نمی‌شود.
 *
 * قالب: «شناسه یا نام پایه:نوع»، جداشده با ویرگول.
 */
export function assetClassMap(text = '') {
  const out = new Map();
  for (const part of String(text ?? '').split(',')) {
    const at = part.lastIndexOf(':');
    if (at < 1) continue;
    const key = part.slice(0, at).trim();
    const cls = part.slice(at + 1).trim().toUpperCase();
    if (key && ASSET_CLASS_LABEL.has(cls)) out.set(key, cls);
  }
  return out;
}

/** نوع پایه: اول با شناسه، بعد با نام. هرچه در نگاشت نباشد، سهم است. */
export function assetClassOf(map, ua = {}) {
  if (!map?.size) return 'STOCK';
  const ins = ua.ins == null ? '' : String(ua.ins);
  const name = ua.name == null ? '' : String(ua.name);
  return map.get(ins) || map.get(name) || 'STOCK';
}

/**
 * دسته کارمزد، جدا شده از تنظیمات تا موتورها به کل شیء وابسته نشوند.
 *
 * `assetClass` فقط نرخ پای سهم را جابه‌جا می‌کند. کارمزد اختیار و اعمال از
 * قرارداد می‌آید نه از نوع پایه، پس دست‌نخورده می‌ماند.
 */
export function feesOf(s, assetClass = 'STOCK') {
  const [buy, sell] = assetClass === 'ETF'
    ? [s.feeBuyEtf, s.feeSellEtf]
    : assetClass === 'COMMODITY'
      ? [s.feeBuyCommodity, s.feeSellCommodity]
      : [s.feeBuyStock, s.feeSellStock];
  return {
    buyStock: num(buy, s.feeBuyStock), sellStock: num(sell, s.feeSellStock),
    option: s.feeOption, exercise: s.feeExercise,
    assetClass,
  };
}

/**
 * مبناهای محاسبه، جدا شده از تنظیمات به همان دلیل `feesOf`: موتورها به
 * چهار عدد وابسته می‌شوند، نه به کل شیء تنظیمات.
 */
export function basisOf(s) {
  return {
    contractSize: s.contractSize,
    yearDays: s.dayCountYear,
    monthDays: s.daysPerMonth,
    shortDte: s.shortDteDays,
  };
}

export function marginParamsOf(s) {
  return {
    A: s.marginA, B: s.marginB, C: s.marginC, maint: s.marginMaint,
    // صورتحساب واقعی کارگزاری مبنای B×S را دقیقاً بازتولید می‌کند. این
    // مقدار عمداً از تنظیمات خوانده نمی‌شود تا تنظیم ذخیره‌شدهٔ نسخه‌های
    // قدیمی نتواند محاسبهٔ جاری را به B×K برگرداند.
    bBasis: 'SPOT',
  };
}
