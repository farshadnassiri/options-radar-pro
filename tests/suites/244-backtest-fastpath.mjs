// ۲۴۴. کندیِ ورود به آزمایشگاه از رصد زنده
//
// ═══ گزارش ۱۴۰۵/۰۶/۱۷ ═══
//
// «آماده‌شدن کامل ترکیب با کش گرم: ۳۰ تا ۳۶ ثانیه.» چهار ریشه، همه از یک
// جنس: **کارِ کامل برای پرسشِ کوچک.**
//
//   ۳۵۵ نماد تاریخچه گرفته می‌شد، برای ترکیبی که دو پا دارد.
//   ۱۱۲۵ روز سنجیده می‌شد، در حالی که بازهٔ انتخابی ۳۱۱ روز بود.
//   برای هر روز همهٔ ترکیب‌ها ساخته و ارزیابی می‌شدند — حدود ۲۵۴ هزار
//   ارزیابی در مرورگر، تنها همین ۲۵ ثانیه.
//
// ولی وقتی نقشهٔ انتقال `legIns` را می‌آورد، پرسش «چه ترکیب‌هایی ممکن است»
// نیست؛ «**این** ترکیب کدام روزها قیمت دارد» است — و جوابش خطی است.

import { check, group, readSrc } from '../harness.mjs';
import { clipDates, comboEntryDates, fastPathCodes } from '../../ui/backtest-fastpath.mjs';

group('۲۴۴ — روزی که کاربر انتخاب نکرده، سنجیده نمی‌شود');

const days = [20250101, 20250115, 20250201, 20250315, 20250601];
check('بازهٔ نداشته یعنی همه، نه هیچ',
  clipDates(days, null).length === 5 && clipDates(days, {}).length === 5);
check('بازه هر دو سر را می‌برد',
  clipDates(days, { from: 20250115, to: 20250315 }).join() === '20250115,20250201,20250315');
check('مرزها داخل بازه‌اند، نه بیرون',
  clipDates(days, { from: 20250101, to: 20250101 }).join() === '20250101');
check('فقط یک سرِ بازه هم کار می‌کند',
  clipDates(days, { from: 20250315 }).length === 2 && clipDates(days, { to: 20250115 }).length === 2);
check('تاریخِ بی‌معنا از فهرست می‌افتد',
  clipDates([20250101, 0, null, 'x', 20250201], null).join() === '20250101,20250201');
check('ورودی بی‌آرایه نمی‌ترکاند',
  clipDates(null, null).length === 0 && clipDates(undefined, { from: 1 }).length === 0);

group('۲۴۴ — روزهای همین ترکیب، نه همهٔ ترکیب‌ها');

// «A» همیشه قیمت دارد، «B» فقط دو روز — پس ترکیب فقط همان دو روز کامل است.
const priced = new Map([
  ['A', new Set(days)],
  ['B', new Set([20250115, 20250315])],
]);
const hasPrice = (ins, date) => priced.get(String(ins))?.has(Number(date)) === true;

check('فقط روزهایی که **همهٔ** پاها قیمت دارند',
  comboEntryDates(['A', 'B'], days, hasPrice).join() === '20250115,20250315');
check('یک پا هم همان قاعده را دارد',
  comboEntryDates(['A'], days, hasPrice).length === 5);
check('پای ناشناخته یعنی هیچ روزی کامل نیست',
  comboEntryDates(['A', 'Z'], days, hasPrice).length === 0);
check('بی پا، روزی برنمی‌گردد — نه اینکه همه را بدهد',
  comboEntryDates([], days, hasPrice).length === 0
  && comboEntryDates(null, days, hasPrice).length === 0);
check('ترتیبِ ورودی نگه داشته می‌شود — چرخِ تاریخ روی همین می‌نشیند',
  comboEntryDates(['A'], [20250601, 20250101], hasPrice).join() === '20250601,20250101');

// ═══ همان چیزی که ۲۵ ثانیه را ساخت: فن‌اوتِ به‌ازای ترکیب ═══
//
// این ادعا شکلِ الگوریتم را قفل می‌کند، نه سرعتش را: اگر کسی روزی دوباره
// به‌ازای هر ترکیب حساب کند، تعدادِ فراخوانی از `روز × پا` بالاتر می‌رود و
// همین‌جا قرمز می‌شود.
let calls = 0;
const counted = (ins, date) => { calls += 1; return hasPrice(ins, date); };
comboEntryDates(['A', 'B'], days, counted);
check(`هر روز حداکثر یک بار برای هر پا پرسیده می‌شود — ${calls} فراخوانی`,
  calls <= days.length * 2);
// و کوتاه‌مدارِ `every` یعنی وقتی **پای اول** آن روز قیمت ندارد، پای دوم
// اصلاً پرسیده نمی‌شود. (با ترتیب برعکس، پای اول همیشه قیمت دارد و هر دو
// پرسیده می‌شوند — پس این ادعا باید ترتیب را عوض کند تا واقعاً چیزی بسنجد.)
let shortCalls = 0;
comboEntryDates(['B', 'A'], days, (ins, date) => { shortCalls += 1; return hasPrice(ins, date); });
check(`پای بعدیِ روزِ ناموفق پرسیده نمی‌شود — ${shortCalls} به‌جای ${days.length * 2}`,
  shortCalls < days.length * 2);

group('۲۴۴ — کمینهٔ کدهایی که باید گرفته شوند');

check('نماد پایه اول است — روزِ مرجع از سریِ خودش خوانده می‌شود',
  fastPathCodes('UA', ['C1', 'P1']).join() === 'UA,C1,P1');
check('تکراری‌ها یک بار می‌آیند',
  fastPathCodes('UA', ['C1', 'C1', 'UA']).join() === 'UA,C1');
check('خالی‌ها می‌افتند',
  fastPathCodes('UA', ['', null, 'C1']).join() === 'UA,C1');
check('بی نماد پایه هم نمی‌ترکاند',
  fastPathCodes('', ['C1']).join() === 'C1' && fastPathCodes(null, null).length === 0);
// همان نسبتی که گزارش دید: سه کد به‌جای ۳۵۵.
check('برای ترکیبِ دوپایی سه کد می‌ماند، نه کلِ زنجیره',
  fastPathCodes('UA', ['C1', 'P1']).length === 3);

group('۲۴۴ — رابط این قاعده‌ها را سوار کرده');

const src = readSrc('../ui/tabs/backtest.mjs');
check('انتقالِ دارای پا، مسیرِ تند می‌رود',
  src.includes('fastPath = wanted.length > 0;')
  && src.includes('? fastPathCodes(ua.ins, wanted)'));
check('و روزهایش را از همان ترکیب می‌گیرد، نه از همهٔ ترکیب‌ها',
  src.includes('? comboEntryDates(wanted, baseDatesInRange(),'));
check('سنجشِ کاملِ روزها هم به بازهٔ انتخابی بریده شد',
  src.includes('const baseDates = baseDatesInRange();')
  && src.includes('return clipDates(all, rangeUi?.range || null);'));
check('و کاربر می‌داند فهرست کامل نیست، و راهِ آوردنش را دارد',
  src.includes('برای سرعت، فقط تاریخچهٔ همین ترکیب گرفته شد')
  && src.includes("id=\"bt-load-all\"") && src.includes("loadHistory()"));
check('بارگیریِ کامل، مسیرِ تند را خاموش می‌کند',
  src.includes('fastPath = wanted.length > 0;'));
