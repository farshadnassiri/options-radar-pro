import { check, group, readSrc } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { byId } from '../../strategies/catalog.mjs';
import { daysBetween } from '../../core/history.mjs';
import { buildRadarHistory } from '../../core/radar-history.mjs';

group('۲۲۱. رادار؛ انتخاب قرارداد در روز سنجش');
const from = 20260606, middle = 20260701, mark = 20260902;
const oldExpiry = 20260819, activeExpiry = 20261021, farExpiry = 20270301;
const rows = [oldExpiry, activeExpiry, farExpiry].flatMap(endDate => [16000,20000].map(strike => ({
  uaInsCode: '7', lval30_UA: 'اهرم', pDrCotVal_UA: 19000, pClosing_UA: 19000,
  insCode_C: `${endDate}-${strike}`, lVal18AFC_C: `ض${strike}`,
  strikePrice: strike, contractSize: 1000, endDate, remainedDay: daysBetween(from,endDate),
})));
const ua = buildChain(rows).get('7');
const day = (date, close) => ({ date, close });
const seriesByIns = { 7: [day(from,18000),day(middle,18500),day(mark,19000)] };
for (const end of [oldExpiry,activeExpiry,farExpiry]) for (const strike of [16000,20000]) {
  seriesByIns[`${end}-${strike}`] = (end===oldExpiry ? [from,middle] : [middle,mark])
    .map(date=>day(date, strike===16000 ? (date===mark ? 2800 : 3200) : 800));
}
const args={ua,seriesByIns,range:{from,to:mark},defs:[byId('bull-call-spread')],
  settings:{minDays:1,maxDays:120,contractSize:1000,comboWindowMode:'all'}};
const result=await buildRadarHistory(args);
check('سررسید ۱۳۷ روز از شروع، در روز سنجش ۴۹ روزه است و حذف نمی‌شود',
  result.rows.length===1 && result.rows[0].expiry===activeExpiry);
check('قرارداد تازه بدون قیمت ابتدای بازه، با قیمت همان روز سنجش نمایش دارد',
  result.rows[0]?.gap.current===2000 && result.rows[0]?.markDate===mark);
check('مبدأ مقایسه نخستین روز مشترک معتبر است و صریح ذخیره می‌شود',
  result.rows[0]?.entryDate===middle && result.rows[0]?.entry===2400);
check('پنجره و دورترین سررسید نسبت به روز سنجش محاسبه می‌شوند',
  result.expiryWindow.total===2 && result.expiryWindow.kept===1
  && result.expiryWindow.dropped===1 && result.expiryWindow.farthest===180);
check('قرارداد منقضی وارد اکنون نمی‌شود و جدا شمرده می‌شود',
  result.expiryWindow.expired===1 && result.rows.every(row=>row.expiry>mark));
check('نمودار فاقد قیمت ابتدای بازه را با قیمت بعدی پر نمی‌کند',
  result.rows[0]?.series.points.length===2 && result.rows[0]?.series.points[0].t===middle);
const missing=await buildRadarHistory({...args,seriesByIns:{...seriesByIns,
  [`${activeExpiry}-20000`]:[day(middle,800)]}});
check('قیمت قدیمی جانشین پای گمشده در روز سنجش نمی‌شود',missing.rows.length===0);
const wide=await buildRadarHistory({...args,settings:{...args.settings,maxDays:200}});
check('پنجرهٔ صریح کاربر همچنان اعمال می‌شود',wide.rows.length===2 && wide.expiryWindow.dropped===0);
const single=await buildRadarHistory({...args,range:{from:mark,to:mark}});
check('بازهٔ تک‌روزه هم محاسبه و مبدأ واقعی دارد',single.rows.length===1 && single.rows[0].entryDate===mark);
const src=readSrc('../ui/tabs/spread-radar.mjs');
check('نمودار دامنه میزبان کنترل بازه را بازنویسی نمی‌کند',
  (src.match(/id="gr-range"/g)||[]).length===1 && src.includes("charts.set('range', $('gr-range-chart')"));
