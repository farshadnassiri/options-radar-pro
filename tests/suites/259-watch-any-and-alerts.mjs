// ۲۵۹. «یا» در دیده‌بان، تاریخچهٔ شلیک، و شرط روی موقعیت‌های من
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import {
  WATCH_MATCHES, WATCH_HISTORY_CAP, checkRule, evaluateWatch,
  normalizeHistory, normalizeWatchRule, watchHistorySummary, watchMatch, watchRuleNote,
} from '../../core/watch-rule.mjs';
import {
  ALERT_REASONS, POSITION_ALERTS, POSITION_ALERT_VERSION,
  checkPositionAlerts, normalizePositionAlert, positionAlert, positionAlertSummary,
} from '../../core/position-alert.mjs';

group('۲۵۹. «یا» در دیده‌بان و تاریخچهٔ شلیک');
{
  const cond = (metric, op, value) => ({ metric, op, value, ref: 'abs' });
  const rule = (patch) => normalizeWatchRule({
    id: 'r1', name: 'آزمون',
    conditions: [cond('monthlyPct', 'ge', 10), cond('lossPct', 'le', 20)],
    ...patch,
  }).rule;

  check('دو حالتِ جمع اعلام شده‌اند',
    WATCH_MATCHES.map(([id]) => id).join(',') === 'all,any');
  // رفتارِ هر قاعدهٔ ذخیره‌شده باید دقیقاً همان بماند که بود.
  check('رکورد قدیمیِ بی‌میدان، «و» می‌گیرد', rule({}).match === 'all');
  check('مقدار ناشناخته هم به «و» می‌افتد', watchMatch('هرچی') === 'all');
  check('«یا» ذخیره و بازخوانی می‌شود', rule({ match: 'any' }).match === 'any');

  const snap = { key: 'k1', monthlyPct: 30, lossPct: 40 };   // شرط اول برقرار، دومی نه
  const all = checkRule(rule({}), snap);
  const any = checkRule(rule({ match: 'any' }), snap);
  check('با «و»، یک شرطِ ناموفق کل قاعده را می‌خواباند', all.held === false);
  check('با «یا»، یک شرطِ موفق کافی است', any.held === true);
  // متنِ هشدار باید بگوید **کدام** شرط زد، نه فقط اینکه قاعده زد.
  check('در حالت «یا» هم همهٔ شرط‌ها سنجیده و گزارش می‌شوند',
    any.parts.length === 2 && any.parts[0].held === true && any.parts[1].held === false);
  check('حالتِ جمع در نتیجه اعلام می‌شود', any.match === 'any' && all.match === 'all');
  check('قاعدهٔ بی‌شرط با «یا» هم نمی‌زند',
    checkRule({ conditions: [], match: 'any' }, snap).held === false);
  check('جملهٔ قاعده با «یا» وصل می‌شود',
    watchRuleNote(rule({ match: 'any' })).includes(' یا ') && watchRuleNote(rule({})).includes(' و '));

  // ——— تاریخچهٔ شلیک ———
  const fired = evaluateWatch({
    rules: [rule({ match: 'any', cooldownSec: 0 })],
    snapshots: [
      { key: 'k1', label: 'ترکیب یک', baseName: 'اهرم', basePrice: 1000, monthlyPct: 30, lossPct: 10 },
      { key: 'k2', label: 'ترکیب دو', baseName: 'اهرم', basePrice: 1000, monthlyPct: 40, lossPct: 10 },
    ],
    nowMs: 5000,
  });
  check('شلیک، شمارنده را جلو می‌برد', fired.rules[0].firedCount === 1);
  // ده ترکیبِ هم‌زمان، تاریخچه را با یک رویداد پر می‌کرد.
  check('یک شلیک یک ردیف تاریخچه می‌سازد، نه یکی به‌ازای هر انطباق',
    fired.rules[0].history.length === 1 && fired.rules[0].history[0].hits === 2);
  check('قیمت پایه لحظهٔ شلیک ذخیره می‌شود',
    fired.rules[0].history[0].basePrice === 1000 && fired.rules[0].history[0].at === 5000);
  check('قاعده‌ای که نزد، تاریخچه نمی‌گیرد',
    evaluateWatch({ rules: [rule({})], snapshots: [{ key: 'k1', monthlyPct: 1, lossPct: 90 }], nowMs: 1 })
      .rules[0].history.length === 0);

  const many = normalizeHistory(Array.from({ length: WATCH_HISTORY_CAP + 10 },
    (_, at) => ({ at: at + 1, basePrice: 100 })));
  check('تاریخچه سقف دارد و تازه‌ها می‌مانند',
    many.length === WATCH_HISTORY_CAP && many[0].at === WATCH_HISTORY_CAP + 10);
  check('ردیف بی‌زمان نگه داشته نمی‌شود',
    normalizeHistory([{ at: 0, basePrice: 1 }, { at: 5, basePrice: 1 }]).length === 1);

  const summary = watchHistorySummary({
    firedCount: 3,
    history: [{ at: 3, basePrice: 100 }, { at: 2, basePrice: 200 }, { at: 1, basePrice: 0 }],
  }, { basePriceNow: 110 });
  check('حرکتِ پس از هشدار نسبت به قیمت امروز سنجیده می‌شود',
    summary.moveKnown === true && near(summary.rows[0].movePct, 10));
  check('بالا و پایین شمرده می‌شوند', summary.up === 1 && summary.down === 1);
  check('ردیفِ بی‌قیمت جدا شمرده می‌شود، نه صفر', summary.withoutPrice === 1);
  // بی قیمتِ امروز، ستونِ حرکت ساخته نمی‌شود — نه اینکه صفر شود.
  const blind = watchHistorySummary({ history: [{ at: 1, basePrice: 100 }] }, {});
  check('بی قیمتِ امروز، حرکت ساخته نمی‌شود',
    blind.moveKnown === false && !Number.isFinite(blind.medianMovePct));

  const wt = readSrc('../ui/tabs/watchtower.mjs');
  check('رابط، حالتِ جمع را در قاعده ذخیره می‌کند', wt.includes("match: $('wt-match').value"));
  check('و با بارگذاری قاعده، همان را برمی‌گرداند', wt.includes("$('wt-match').value = rule.match === 'any'"));
  check('کارت هر قاعده دکمهٔ تاریخچه دارد', wt.includes('data-act="history"'));
  check('قیمت زندهٔ پایه برای ستون حرکت نگه داشته می‌شود', wt.includes('lastBasePrice.set('));
}

group('۲۵۹. شرط روی موقعیت‌های من');
{
  check('نسخهٔ قرارداد شرطِ موقعیت اعلام شده', POSITION_ALERT_VERSION === 1);
  check('پنج آستانه تعریف شده', POSITION_ALERTS.length === 5);
  check('هر آستانه جهت دارد — وگرنه شرطی ساخته می‌شد که در لحظهٔ گذاشتن برقرار است',
    POSITION_ALERTS.every((item) => item.dir === 'up' || item.dir === 'down'));
  check('آستانهٔ ناشناخته پیدا نمی‌شود', positionAlert('هرچی') === null);

  // خانهٔ خالی یعنی «نمی‌خواهم»، نه صفر.
  const empty = normalizePositionAlert({});
  check('برگهٔ بی‌آستانه رد می‌شود و علتش را می‌گوید',
    empty.ok === false && empty.why === ALERT_REASONS.noValue);
  check('و چیزی ذخیره نمی‌کند', empty.alert === null);
  const made = normalizePositionAlert({ pnlAbove: 1e6, roomBelow: 3, retAbove: '' });
  check('فقط آستانه‌های عددی می‌مانند',
    made.ok === true && made.alert.pnlAbove === 1e6 && made.alert.roomBelow === 3
    && made.alert.retAbove === undefined);

  const view = { pnlTotal: 1.5e6, retPct: 12, roomPct: 2, daysToExpiry: 30 };
  const hit = checkPositionAlerts(made.alert, view);
  check('سودِ گذشته از آستانه می‌زند', hit.firing.some((one) => one.key === 'pnlAbove'));
  check('فاصلهٔ کمتر از آستانه هم می‌زند', hit.firing.some((one) => one.key === 'roomBelow'));
  check('شمار شرط‌های سنجیده‌شده گفته می‌شود', hit.checked === 2, `${hit.checked}`);

  // کاربر «۵۰۰ هزار» می‌نویسد، نه «منفی ۵۰۰ هزار».
  const loss = normalizePositionAlert({ pnlBelow: 500000 }).alert;
  check('آستانهٔ زیان به شکلِ اندازه گرفته می‌شود',
    checkPositionAlerts(loss, { pnlTotal: -600000 }).firing.length === 1);
  check('و زیانِ کمتر از آستانه نمی‌زند',
    checkPositionAlerts(loss, { pnlTotal: -400000 }).firing.length === 0);
  check('سود هم آستانهٔ زیان را نمی‌زند',
    checkPositionAlerts(loss, { pnlTotal: 900000 }).firing.length === 0);

  // شرطی که ورودی‌اش نیست، جوابی هم ندارد.
  const blind = checkPositionAlerts(normalizePositionAlert({ roomBelow: 3 }).alert, { roomPct: NaN });
  check('سنجهٔ نبوده نه برقرار است نه ناقض',
    blind.firing.length === 0 && blind.checked === 0 && blind.skipped[0].key === 'roomBelow');
  check('شرط خاموش اصلاً سنجیده نمی‌شود',
    checkPositionAlerts({ ...made.alert, enabled: false }, view).firing.length === 0);
  check('موقعیت بی‌شرط، علتش را می‌گوید',
    checkPositionAlerts(null, view).reason === ALERT_REASONS.none);

  const sum = positionAlertSummary(made.alert);
  check('خلاصهٔ شرط‌ها شمار و متن دارد', sum.count === 2 && sum.text.includes('سود'));
  check('بی شرط، خلاصه هم خالی است', positionAlertSummary(null).count === 0);

  // ——— قرارداد تب ———
  const src = readSrc('../ui/tabs/positions.mjs');
  check('شرط‌ها روی همان عددهای جدول سنجیده می‌شوند، نه محاسبه‌ای دوم',
    src.includes('checkPositionAlerts(p.alert, view)') && src.includes('pnlTotal: m.pnlTotal'));
  check('هشدارها در یک نوار جمع می‌شوند، نه یکی به‌ازای هر موقعیت',
    src.includes('alertBannerHtml(alertHits)'));
  check('برداشتن شرط یعنی نبودنش، نه شرطِ خاموش', src.includes('delete p.alert'));
  check('فرم شرط با رفرش پانزده‌ثانیه‌ای بازنویسی نمی‌شود',
    src.includes("host.dataset.for !== String(alerting)"));
}
