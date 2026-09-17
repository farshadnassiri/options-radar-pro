// ۲۵۴. تب موقعیت‌های من — روند، ویرایش، و پذیرش ترکیب
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import {
  TRACK_MODES, trackMode, trackRows, trackChartOption, trackStatsHtml, trackNote,
} from '../../ui/positions-track-view.mjs';
import { EDIT_REASONS, editFormHtml, needsEntryClose, readEdit } from '../../ui/positions-edit.mjs';
import { INTAKE_REASONS, draftFromPlan, intakeFormHtml, readIntake } from '../../ui/positions-intake.mjs';
import { strategyLinkPlan } from '../../ui/handoff.mjs';

/**
 * ظرفِ ساختگیِ فرم.
 *
 * فرم‌های این تب فقط `querySelector(...).value` می‌خوانند، پس همین کافی
 * است و آزمون بی مرورگر می‌گزد. ورودی همان نگاشتِ گزینشگر به مقدار است —
 * یعنی خودِ ادعا می‌گوید کاربر چه تایپ کرده.
 */
const formOf = (values) => ({
  querySelector: (selector) => (selector in values ? { value: values[selector] } : null),
});

group('۲۵۴. تب موقعیت‌های من — روند، ویرایش، پذیرش');
{
  // ——— حالت‌های روند ———
  check('سه سرچشمهٔ روند اعلام شده',
    TRACK_MODES.map((mode) => mode.id).join(',') === 'daily,intraday,session',
    TRACK_MODES.map((mode) => mode.id).join(','));
  check('هر سرچشمه جمله‌ای دارد که می‌گوید چه می‌سنجد',
    TRACK_MODES.every((mode) => mode.hint.length > 10));
  check('حالت ناشناخته به حالت پیش‌فرض می‌افتد، نه به undefined',
    trackMode('هرچی').id === 'daily' && trackMode('session').id === 'session');

  // ——— ردیف‌های نمودار: شکاف روی محور می‌ماند، مقدارش نه ———
  const daily = {
    points: [
      { date: 20260901, pnlTotal: 100 },
      { date: 20260903, pnlTotal: 300 },
    ],
    gaps: [{ date: 20260902, missing: ['OPT'] }],
    stoppedAt: 20260920,
    reason: '',
  };
  const rows = trackRows(daily, 'daily');
  check('نقطه و شکاف روی یک محور و به ترتیب تاریخ می‌نشینند',
    rows.map((row) => row.key).join(',') === '20260901,20260902,20260903',
    rows.map((row) => row.key).join(','));
  check('شکاف مقدار ندارد', Number.isNaN(rows[1].value) && rows[1].missing[0] === 'OPT');
  check('برچسب روز شمسی و با رقم فارسی است',
    /^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/.test(rows[0].label), rows[0].label);

  const option = trackChartOption(rows, { gain: 'g', loss: 'l', muted: 'm', line: 'x', lineSoft: 'y', palette: [], font: 'f', ink: 'i', panel: 'p' });
  check('خط روی لحظهٔ بی‌قیمت وصل نمی‌شود', option.series[0].connectNulls === false);
  check('شکاف در دادهٔ نمودار null است، نه صفر',
    option.series[0].data[1] === null && option.series[0].data[0] === 100);
  check('خط صفر به‌عنوان مرجع کشیده می‌شود',
    option.series[0].markLine.data[0].yAxis === 0);
  check('محور افقی همان برچسب‌های ردیف‌هاست',
    option.xAxis.data.length === rows.length);

  const intraday = {
    points: [{ second: 37800, label: '۱۰:۳۰', pnlTotal: 5 }],
    gaps: [{ second: 34200, label: '۰۹:۳۰', missing: ['OPT'] }],
    reason: '',
  };
  check('روند درون‌روزی هم به ترتیب ثانیه مرتب می‌شود',
    trackRows(intraday, 'intraday').map((row) => row.label).join(',') === '۰۹:۳۰,۱۰:۳۰');
  const session = trackRows({ points: [{ at: Date.UTC(2026, 8, 3, 6, 0, 0), pnlTotal: 7 }], gaps: [] }, 'session');
  check('دنبالهٔ جلسه برچسب ساعت با رقم فارسی می‌گیرد',
    /^[۰-۹]{2}:[۰-۹]{2}:[۰-۹]{2}$/.test(session[0].label), session[0].label);

  // ——— جمله‌ها ———
  const note = trackNote(daily, 'daily');
  check('جملهٔ زیر نمودار، نام پای بی‌قیمت را می‌گوید', note.includes('OPT'), note);
  check('و می‌گوید روند روی سررسید ایستاده', note.includes('سررسید'), note);
  check('روند خالی، علتِ خودش را تکرار می‌کند',
    trackNote({ points: [], gaps: [], reason: 'نوار نیامده' }, 'daily') === 'نوار نیامده');
  check('دنبالهٔ جلسه می‌گوید حافظه‌ای است',
    trackNote({ points: [{ at: 1, pnlTotal: 1 }], gaps: [] }, 'session').includes('تازه‌کردن'));

  const statsHtml = trackStatsHtml({ count: 3, change: -50, peak: 100, trough: -80, drawdown: 180 });
  check('کارت تغییرِ منفی، تُنِ زیان می‌گیرد', statsHtml.includes('class="v loss"'));
  check('بی‌نقطه، کارتی ساخته نمی‌شود', trackStatsHtml({ count: 0 }) === '');

  // ——— ویرایش ———
  const pos = {
    id: 'p1', title: 'کاوردکال اهرم', qty: 2, entryDate: '1405/06/01', entrySpot: 100000,
    entryRisk: { version: 1, capital: 1 },
    legs: [
      { kind: 'underlying', side: 'buy', ratio: 1, size: 1000, price: 100000 },
      { kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 110000, price: 5000, entryClose: 5200 },
    ],
  };
  check('فقط پای فروشِ اختیار قیمت پایانی روز ورود می‌خواهد',
    needsEntryClose(pos.legs[1]) === true && needsEntryClose(pos.legs[0]) === false);
  const form = editFormHtml(pos);
  check('فرم ویرایش، تاریخ ورود و تعداد و قیمت پایه را دارد',
    form.includes('id="ed-date"') && form.includes('id="ed-qty"') && form.includes('id="ed-spot"'));
  check('فرم ویرایش برای هر پا خانهٔ قیمت ورود دارد',
    form.includes('data-edit-price="0"') && form.includes('data-edit-price="1"'));
  check('و خانهٔ پایانی فقط برای پای فروش',
    form.includes('data-edit-close="1"') && !form.includes('data-edit-close="0"'));
  check('فرم صریح می‌گوید ساختار ترکیب عوض نمی‌شود', form.includes('ترکیبِ دیگر یعنی موقعیتِ دیگر'));

  const good = readEdit(formOf({
    '#ed-title': 'عنوان تازه', '#ed-date': '1405/06/05', '#ed-qty': '3',
    '#ed-spot': '101000', '#ed-note': 'یادداشت',
    '[data-edit-price="0"]': '100500', '[data-edit-price="1"]': '4800',
    '[data-edit-close="1"]': '5100',
  }), pos);
  check('ویرایش معتبر پذیرفته می‌شود', good.ok === true, good.reason);
  check('مقادیر تازه می‌نشینند',
    good.position.qty === 3 && good.position.entrySpot === 101000
    && good.position.legs[1].price === 4800 && good.position.legs[1].entryClose === 5100);
  check('ساختار پا دست‌نخورده می‌ماند',
    good.position.legs[1].strike === 110000 && good.position.legs[1].size === 1000);
  check('مبنای ثابت روز ورود کهنه پاک می‌شود تا از نو ساخته شود',
    good.position.entryRisk === null);

  const badDate = readEdit(formOf({ '#ed-date': 'دیروز', '#ed-qty': '1', '#ed-spot': '1' }), pos);
  check('تاریخ نامعتبر رد می‌شود', !badDate.ok && badDate.reason === EDIT_REASONS.badDate);
  const badQty = readEdit(formOf({ '#ed-date': '1405/06/05', '#ed-qty': '0', '#ed-spot': '1' }), pos);
  check('تعداد صفر رد می‌شود', !badQty.ok && badQty.reason === EDIT_REASONS.badQty);
  const badClose = readEdit(formOf({
    '#ed-date': '1405/06/05', '#ed-qty': '1', '#ed-spot': '1',
    '[data-edit-price="0"]': '1', '[data-edit-price="1"]': '1',
  }), pos);
  check('پای فروش بی قیمت پایانی رد می‌شود', !badClose.ok && badClose.reason === EDIT_REASONS.badClose);
  check('ویرایشِ ردشده هیچ موقعیتی برنمی‌گرداند — نیمه‌کاره نمی‌نشیند',
    badClose.position === null && badQty.position === null);

  // ——— پذیرش ترکیب از جست‌وجوی استراتژی‌ها ———
  const row = {
    uaIns: '77', underlying: 'اهرم', legsText: '+۱ کال ۲۰۰۰۰  −۱ کال ۲۲۰۰۰', Sclose: 9400,
    __legs: [
      { kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 20000, price: 1800, ins: 'c1', name: 'ضهرم۱' },
      { kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 22000, price: 900, ins: 'c2', name: 'ضهرم۲' },
    ],
    legPrices: [{ endDate: 20260920, days: 33 }, { endDate: 20260920, days: 33 }],
  };
  const plan = strategyLinkPlan(row, { to: 'positions', strategyId: 'bull-call-spread', strategyName: 'بول کال', units: 1 });
  const made = draftFromPlan(plan, { today: '1405/06/26' });
  check('پیش‌نویس از نقشه ساخته می‌شود', made.ok === true, made.reason);
  check('ردیف زنده روز ورودش امروز است', made.draft.entryDate === '1405/06/26', made.draft.entryDate);
  check('قیمت ورود هر پا پیش‌پر شده', made.draft.legs.map((leg) => leg.price).join(',') === '1800,900');

  const stamped = draftFromPlan({ ...plan, entryDate: 20260901 }, { today: '1405/06/26' });
  check('ردیف تاریخی روزِ خودش را می‌برد، نه امروز را',
    stamped.draft.entryDate === '1405/06/10', stamped.draft.entryDate);

  check('ترکیب بی‌قیمت پذیرفته نمی‌شود',
    draftFromPlan({ ...plan, legs: [{ ...plan.legs[0], price: 0 }] }).reason === INTAKE_REASONS.noPrice);
  check('پای بی‌شناسه پذیرفته نمی‌شود',
    draftFromPlan({ ...plan, legs: [{ ...plan.legs[0], ins: '' }] }).reason === INTAKE_REASONS.noIns);
  check('پای بی‌اندازه پذیرفته نمی‌شود',
    draftFromPlan({ ...plan, legs: [{ ...plan.legs[0], size: 0 }] }).reason === INTAKE_REASONS.noSize);
  check('نقشهٔ مقصدِ دیگر اینجا پذیرفته نمی‌شود',
    draftFromPlan({ ...plan, to: 'backtest' }).reason === INTAKE_REASONS.noPlan);

  const intakeForm = intakeFormHtml(made.draft);
  check('فرم پذیرش خانهٔ قیمت هر پا را دارد',
    intakeForm.includes('data-intake-price="0"') && intakeForm.includes('data-intake-price="1"'));
  check('و خانهٔ پایانی فقط برای پای فروش',
    intakeForm.includes('data-intake-close="1"') && !intakeForm.includes('data-intake-close="0"'));
  check('فرم می‌گوید قیمت ورود قابل اصلاح است',
    intakeForm.includes('اصلاحش کن'));

  const taken = readIntake(formOf({
    '#in-title': 'بول کال اهرم', '#in-date': '1405/06/26', '#in-qty': '4', '#in-spot': '9400',
    '[data-intake-price="0"]': '1850', '[data-intake-price="1"]': '880',
    '[data-intake-close="1"]': '900',
  }), made.draft);
  check('ثبت ترکیب با ورودی کامل می‌گذرد', taken.ok === true, taken.reason);
  check('قیمت اصلاح‌شدهٔ کاربر می‌نشیند، نه قیمت پیش‌پرشده',
    taken.position.legs[0].price === 1850 && taken.position.legs[1].price === 880);
  check('تعداد از فرم می‌آید', taken.position.qty === 4, `${taken.position.qty}`);
  check('پای خرید قیمت پایانی ورود نمی‌گیرد',
    taken.position.legs[0].entryClose === undefined);
  const missSpot = readIntake(formOf({ '#in-date': '1405/06/26', '#in-spot': '0' }), made.draft);
  check('بی قیمت پایانی پایه، ثبت نمی‌شود',
    !missSpot.ok && missSpot.reason === INTAKE_REASONS.badSpot);

  // ——— قرارداد تب ———
  const src = readSrc('../ui/tabs/positions.mjs');
  check('تب نقشهٔ خودش را از state برمی‌دارد', src.includes("state.handoff?.to === 'positions'"));
  check('موقعیت سررسیدگذشته قیمت نمی‌گیرد',
    /positionOpenState\(p, today\)\.expired\) continue;/.test(src));
  check('جدول باز و جدول سررسیدگذشته از هم جدا شده‌اند',
    src.includes("filter((x) => !x.state.expired)") && src.includes("filter((x) => x.state.expired)"));
  check('جمع «تغییر امروز» فقط وقتی عدد است که همهٔ موقعیت‌ها مبنا داشته باشند',
    src.includes('changeComplete') && src.includes('every((x) => x.available)'));
  check('نوار درون‌روزی فقط با درخواست صریح گرفته می‌شود، نه در رفرش دوره‌ای',
    src.includes("id=\"tape-get\"") && !/setInterval\(loadTape/.test(src));
  check('پنل جزئیات برای موقعیت سررسیدگذشته باز نمی‌شود',
    src.includes('positionOpenState(p, todayNumber()).expired'));
  check('نمودارها در پایان عمر تب آزاد می‌شوند', src.includes('charts.disposeAll()'));
}
