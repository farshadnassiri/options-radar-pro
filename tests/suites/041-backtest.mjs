// ۴۰. سه گام بک‌تست سریع و تحلیل تایم‌فریم
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import path from 'node:path';
import { check, group, readSrc } from '../harness.mjs';
import {
  intradayEntryExitProfile, intradayHoldingSummary, timeOfDayProfile,
} from '../../core/backtest.mjs';


// ═══════════════════════════ ۴۰. سه گام بک‌تست سریع و تحلیل تایم‌فریم ═══════════════════════════
group('۴۰. سه گام بک‌تست سریع و تحلیل تایم‌فریم');
{
  const source40 = readSrc('../ui/tabs/backtest.mjs');
  const backtestModule40 = await import('../../core/backtest.mjs');
  const styleSource40 = readSrc('../ui/style.css');

  // ——— ترتیب سه گام: کلی، روزبه‌روز، ریزمعامله ———
  const at = (needle) => source40.indexOf(needle);
  check('اول عملکرد کلی بازه، بعد مسیر روزبه‌روز، بعد ریزمعامله',
    at('id="bt-kpis"') > 0 && at('id="bt-kpis"') < at('id="bt-days-table"')
    && at('id="bt-days-table"') < at('id="bt-intraday-title"'));
  check('نمای کلی بازه، بازه خودش را برچسب می‌زند', source40.includes("$('bt-overview-range').textContent"));

  // ——— ورود به ریزمعامله با کلیک روی ردیف روز ———
  check('هر ردیف جدول روزبه‌روز با کلیک و صفحه‌کلید باز می‌شود',
    source40.includes('data-day="${row.date}" tabindex="0"')
    && /\$\('bt-days-table'\)\.addEventListener\('click'[\s\S]{0,220}?openDayIntraday\(Number\(row\.dataset\.day\)\)/.test(source40)
    && /\$\('bt-days-table'\)\.addEventListener\('keydown'[\s\S]{0,260}?openDayIntraday\(Number\(row\.dataset\.day\)\)/.test(source40));
  check('روز باز‌شده در عنوان پنل ریزمعامله نوشته می‌شود',
    source40.includes("$('bt-intraday-title').textContent") && source40.includes('ریزمعامله ${dateLabel(intradayDate)}'));
  check('ردیف روزِ باز‌شده در جدول علامت می‌خورد',
    source40.includes('aria-selected="${row.date === intradayDate}"')
    && /tr\[data-day\]\[aria-selected="true"\]/.test(styleSource40));
  // ریزمعامله هر روز چند درخواست است؛ رفت‌وبرگشت بین روزها نباید هر بار
  // همان درخواست‌ها را دوباره بفرستد.
  check('ریزمعامله هر روز یک‌بار گرفته و نگه داشته می‌شود',
    source40.includes('if (!force && tradesCache.has(date)) return tradesCache.get(date);')
    && source40.includes('tradesCache.set(date, result);'));
  // ترکیب یا بازه که عوض شود، کش مال بازپخش قبلی است.
  check('اجرای دوباره بک‌تست، کش ریزمعامله را خالی می‌کند', source40.includes('tradesCache.clear();'));
  // ——— نمای کلی بازه، مستقل از روزِ بازشده ———
  //
  // کشوی «نمای مسیر» سه حالت داشت و دو حالتش تکراری بود: «فقط ریزمعامله روز
  // سنجش» همان چیزی را می‌کشید که پنل درون‌روزی با محور ساعت و مسیر پله‌ای
  // بهتر می‌کشد، و حالت ترکیبی روزها را با ثانیه‌ها روی یک محور اندیسی قاطی
  // می‌کرد. بدتر از هر دو: مسیر ترکیبی روی روزِ بازشده بریده می‌شد، پس
  // «بهترین نقطه» و «سود/زیان نهایی» با کلیک روی ردیف‌های جدول روزبه‌روز
  // عوض می‌شدند — در بخشی که عنوانش «عملکرد کلی این بازه» است.
  check('کشوی نمای مسیر برداشته شده', !source40.includes('bt-path-mode'));
  check('نمای کلی همیشه کل بازه را در تفکیک روز می‌سازد',
    source40.includes("replay.rows.filter((row) => row.status === 'ok').map((row) => ({ ...row, granularity: 'day' }))"));
  check('سود/زیان نهایی نمای کلی از روز سنجش می‌آید، نه از آخرین تیکِ روزِ بازشده',
    source40.includes('const final = replay.summary.last;'));
  // اگر این فراخوانی برگردد، نمای کلی دوباره به روزِ بازشده گره می‌خورد.
  check('باز کردن ریزمعامله یک روز، نمای کلی را دوباره نمی‌کشد',
    /async function openDayIntraday\([\s\S]{0,1400}?\n  \}/.exec(source40)?.[0]?.includes('paintOverview()') === false);
  check('خط مرز روز آخر و شیوه‌نامه‌اش هر دو برداشته شدند',
    !source40.includes('backtest-split') && !styleSource40.includes('backtest-split'));
  check('تابع مسیر ترکیبی از موتور هم برداشته شد',
    !Object.keys(backtestModule40).includes('combinedBacktestPath'), Object.keys(backtestModule40).length + ' صادرات');

  // ——— تحلیل تایم‌فریم ———
  check('کاربر تایم‌فریم را خودش انتخاب می‌کند', source40.includes('id="bt-tf-size"') && source40.includes('id="bt-tf-run"'));
  check('عوض‌کردن تایم‌فریم فقط سطل‌بندی را عوض می‌کند، نه داده را',
    /\$\('bt-tf-size'\)\.addEventListener\('change'[\s\S]{0,420}?if \(timeframeDays\.length\) \{ paintTimeframe\(null\); paintPanels\(\); \}/.test(source40));
  for (const [id, what] of [['bt-tf-pnl-chart', 'آفست کل'], ['bt-tf-leg-chart', 'تفکیک پاها'], ['bt-tf-return-chart', 'بازده و پایه'], ['bt-tf-base-chart', 'قیمت نماد پایه']]) {
    check(`نمودار «${what}» در تحلیل تایم‌فریم رسم می‌شود`, source40.includes(`$('${id}')`));
  }
  check('نماد پایه هم در نمودار و هم در جدول سطل‌ها می‌آید',
    source40.includes("label: 'تغییر نماد پایه'") && source40.includes("label: 'قیمت نماد پایه'") && source40.includes('<th>پایه</th>'));
  check('مدت سود و زیان، رفتار ساعتی و ماتریس ورود×خروج هر سه ساخته می‌شوند',
    source40.includes('intradayHoldingSummary(timeframeDays)') && source40.includes('timeOfDayProfile(timeframeDays')
    && source40.includes('intradayEntryExitProfile(timeframeDays'));
  check('بهترین بازه ورود و خروج به کاربر گفته می‌شود',
    source40.includes('بهترین بازه ورود') && source40.includes('بهترین بازه خروج'));
  // چند ده درخواست بی‌خبر نباید برود؛ و روزی که نقطه مشترک ندارد باید شمرده
  // شود نه اینکه با صفر پر شود.
  check('گرفتن ریزمعامله چندروزه پیشرفت گزارش می‌کند و سقف دارد',
    source40.includes('دریافت ریزمعامله ${fmt.int(index + 1)} از') && source40.includes('TIMEFRAME_DAY_CAP'));
  check('روز بدون نقطه مشترک شمرده و صریح گزارش می‌شود',
    source40.includes('if (points.length) out.push({ date: wanted[index], points }); else empty += 1;')
    && source40.includes('روز بدون نقطه مشترک کنار گذاشته شد'));
  check('اگر ماتریس روی سطل درشت‌تر ساخته شود، همان‌جا گفته می‌شود',
    source40.includes('matrix.bucketSeconds !== matrix.requestedBucketSeconds'));
}
