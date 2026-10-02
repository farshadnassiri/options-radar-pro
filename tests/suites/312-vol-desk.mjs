// ۳۱۲. میز تلاطم — اکنون در برابر بازگشایی، دیروز و همین ساعت
//
//   الف  مدل: «اکنون» آخرین لحظهٔ معتبرِ روزِ تمرکز؛ بازگشایی پس از دقایق اول؛
//        دیروز همین ساعت با حمل ده‌دقیقه؛ صدک هم‌ساعت فقط از روزهای گذشته
//   ب    بی نشت (آ۴): روزِ تمرکز هیچ‌گاه در «هم‌ساعت» خودش نمی‌نشیند و لحظهٔ
//        بعد از اکنون در کارت اثر ندارد
//   ج    امروزِ بی‌داده: آخرین جلسه با برچسب «نه زنده»؛ بی هیچ روز، علت
//   د    سازنده‌ها: کارت، جدول‌ها، نمودارها خالی‌پذیر و بی رقم لاتین در متن
//   هـ   سیم‌کشی: تب، حالتِ رصد لحظه‌ای، کارت در «جست‌وجوی استراتژی‌ها»

import { check, group, near, readSrc } from '../harness.mjs';
import { defaults } from '../../core/settings.mjs';
import { intradayContext } from '../../core/vol-intraday.mjs';
import { deskModel, deskCompareRows, deskDayRows, hourlyPattern } from '../../core/vol-desk.mjs';
import { momentsFor } from '../../core/intraday-grid.mjs';

const settings = defaults();
const ctx = intradayContext(settings, { holidaysKnown: true });
const OPEN = ctx.session.open;
const grid = momentsFor('m15');
/** روز ساختگی: مقدار = پایه + شیب × ساعت‌های گذشته از آغاز. */
// روزِ موقتِ امروز فقط تا «اکنون» لحظه دارد (سرور لحظهٔ آینده نمی‌فرستد)؛
// روزِ بسته‌شده تا پایان جلسه، با لحظه‌های خالیِ پس از `until`.
const day = (date, base, slope = 0, { until = Infinity, source = 'record', provisional = false } = {}) => ({
  date, source, provisional, why: '', contracts: 10,
  points: grid.filter((second) => !provisional || second <= until).map((second) => ({
    second, value: second <= until ? base + slope * ((second - OPEN) / 3600) : NaN,
    bid: base - 1, ask: base + 1, price: 10000 + (second - OPEN) / 60, queue: false, flags: [], why: second <= until ? 'ok' : 'noAtm',
  })),
});

group('۳۱۲-الف. مدل میز');
{
  const days = [day(20260927, 40, 1), day(20260928, 44, 1), day(20260929, 50, 2), day(20260930, 46, -1),
    day(20261001, 52, 2, { until: OPEN + 7200, provisional: true })];
  const m = deskModel({ days, today: 20261001, ctx, compareDays: 10 });
  check('روز تمرکز امروز است و زنده', m.focus.date === 20261001 && m.live === true);
  check('«اکنون» آخرین لحظهٔ معتبر (۱۱:۰۰)، نه پایان جلسه', m.now.second === OPEN + 7200 && near(m.now.value, 56, 1e-9));
  check('بازگشایی پس از ۱۵ دقیقهٔ اول', m.open.second === OPEN + 900 && near(m.open.value, 52.5, 1e-9));
  check('تغییر از بازگشایی', near(m.change, 3.5, 1e-9));
  check('دیروز همین ساعت', m.prev.date === 20260930 && m.ydaySame.second === OPEN + 7200 && near(m.ydaySame.value, 44, 1e-9) && near(m.changeYday, 12, 1e-9));
  check('پایان دیروز', near(m.ydayClose.value, 46 - 3.5, 1e-9) && near(m.changeYdayClose, 56 - 42.5, 1e-9));
  check('هم‌ساعت از چهار روزِ گذشته؛ اکنون بالاتر از همه → صدک ۱۰۰', m.same.n === 4 && near(m.same.percentile, 100, 1e-9), `n=${m.same.n} p=${m.same.percentile}`);
  check('آمار روز فقط تا اکنون (سقف ۵۶، کف ۵۲٫۵ در ۰۹:۱۵)', near(m.stats.high, 56, 1e-9) && near(m.stats.low, 52.5, 1e-9));
  check('تحقق‌یافتهٔ امروز ساخته شد', Number.isFinite(m.rv.rvPct) && m.rv.returns > 0);
  const rows = deskCompareRows(m);
  check('جدول مقایسه: اکنون، بازگشایی، سقف، کف، دیروز، پایان دیروز، میانهٔ هم‌ساعت', rows.length >= 7 && near(rows.find((r) => r.label === 'دیروز در همین ساعت').diff, 12, 1e-9));
  const pattern = hourlyPattern(m, grid);
  const at11 = pattern.find((r) => r.second === OPEN + 7200);
  // شیب‌های گذشته: ۱، ۱، ۲، −۱ در ساعت → میانگین «مقدار منهای بازگشایی» در ۱۱:۰۰ (۱٫۷۵ ساعت پس از بازگشایی)
  check('الگوی ساعتی = میانگین تغییر از بازگشایی در روزهای گذشته', near(at11.mean, 0.75 * 1.75, 1e-9) && at11.n === 4, `${at11.mean}`);
  check('جدول روزها تازه‌ترین اول، امروز موقت', deskDayRows(m)[0].date === 20261001 && deskDayRows(m)[0].provisional);

  const withSummary = deskModel({ days, today: 20261001, ctx, summary: { ivPct: 50, ivr: 70, ivp: 80, hvPct: 40, hvWindow: 20, date: 20260930 } });
  check('IV ÷ HV از خلاصهٔ روزانه', near(withSummary.ivHv, 56 / 40, 1e-9));
  check('ردیف‌های روزانه در جدول مقایسه برچسب دارند', deskCompareRows(withSummary).some((r) => r.daily && r.value === 40));
}

group('۳۱۲-ب. بی نشت');
{
  const today = day(20261001, 52, 2, { until: OPEN + 3600, provisional: true });
  const days = [day(20260930, 46, -1), today];
  const before = deskModel({ days, today: 20261001, ctx });
  // همان روز، با لحظه‌ای بعد از «اکنون» که هنوز نرسیده (NaN است) — مقدارش را عوض می‌کنیم:
  const later = { ...today, points: today.points.map((pt) => (pt.second > OPEN + 3600 ? { ...pt, value: NaN, bid: 999, ask: 999 } : pt)) };
  const after = deskModel({ days: [days[0], later], today: 20261001, ctx });
  check('آ۴ لحظهٔ بعد از اکنون در کارت اثر ندارد', before.now.value === after.now.value && before.stats.high === after.stats.high);
  check('روز تمرکز در هم‌ساعتِ خودش نیست', before.sameRows.every((r) => r.date !== 20261001));
  const yday = deskModel({ days: [day(20260929, 40), day(20260930, 46, -1, { until: OPEN + 1800 })], today: 20261001, ctx });
  check('بی امروز: آخرین جلسه تمرکز است و زنده نیست', yday.focus.date === 20260930 && yday.live === false);
  check('روز قبلِ آن هم‌ساعتِ «اکنون» (۰۹:۳۰) را می‌دهد', yday.ydaySame.second === OPEN + 1800 && yday.prev.date === 20260929);
}

group('۳۱۲-ج. بی‌داده');
{
  check('هیچ روز: علت noDays', deskModel({ days: [], today: 1, ctx }).why === 'noDays');
  const pending = deskModel({ days: [{ date: 20260930, source: 'pending', points: [] }], today: 20261001, ctx });
  check('فقط روزهای ساخته‌نشده: علت pending', pending.why === 'pending' && pending.now === null);
}

group('۳۱۲-د. رابط میز برداشته شد (۱۴۰۵/۰۷/۱۱)');
{
  // خواستهٔ صاحب پروژه: «تب میز نوسان را حذف کن… بقیهٔ آیتم‌های میز را حذف
  // کن»؛ نمودارهای نوسان ضمنی به تب «نوسان ضمنی» رصد لحظه‌ای رفتند. مدل
  // `core/vol-desk.mjs` می‌ماند: سنجه‌های تلاطمِ دیده‌بان شرطی رویش‌اند.
  const fs = await import('node:fs');
  const gone = ['ui/tabs/vol-desk.mjs', 'ui/vol-desk-view.mjs', 'ui/vol-desk-card.mjs', 'ui/vol-desk-link.mjs'];
  check('پرونده‌های رابط میز نیستند', gone.every((f) => !fs.existsSync(new URL(`../../${f}`, import.meta.url))));
  const app = readSrc('../ui/app.mjs');
  check('تب «میز تلاطم» از فهرست کناری رفت', !app.includes("id: 'vol-desk'") && !app.includes('/ui/tabs/vol-desk.mjs'));
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('حالت میز و کارت فشرده از رصد لحظه‌ای رفتند', !dash.includes("id: 'vol-desk'") && !dash.includes('mountDeskCard') && !dash.includes('data-vol-desk-card'));
  check('کارت‌های میز از «در جست‌وجوی استراتژی‌ها» رفتند', !readSrc('../ui/tabs/strategy-explorer.mjs').includes('mountDeskCard'));
  check('نوار زمینهٔ تلاطم دیگر به میز پیوند نمی‌دهد', !readSrc('../ui/vol-context.mjs').includes('vol-desk-link'));
  const { deskFrom } = await import('../../core/vol-desk.mjs');
  check('بازهٔ تقویمی گشاد برای N روز معاملاتی (به core رفت)', deskFrom(20261001, 10) === 20260909);
}
