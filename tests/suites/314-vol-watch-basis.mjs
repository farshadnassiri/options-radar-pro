// ۳۱۴. سنجه‌های تلاطم در دیده‌بان شرطی، و آزمون مبنای زمان
//
//   الف  سنجه‌های درون‌روزی فقط وقتی امروز زنده است؛ بیرون از جلسه NaN و
//        شرط برقرار نمی‌شود — هرگز با عددِ دیروز آتش نمی‌کند
//   ب    آزمون آخر هفته: بازاری که فقط زمانِ جلسه را قیمت می‌کند، در مبنای
//        «ثانیهٔ معاملاتی» پرش تعطیلی ندارد و در «روز تقویمی» دارد

import { check, group, near, readSrc } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { defaults } from '../../core/settings.mjs';
import { volTime } from '../../core/vol-clock.mjs';
import { intradayContext } from '../../core/vol-intraday.mjs';
import { recordFrame, recordMoments, compactRecordMoments } from '../../core/iv-record.mjs';
import { volWatchValues } from '../../core/vol-desk.mjs';
import { WATCH_METRICS, watchSnapshot, normalizeWatchRule, evaluateWatch } from '../../core/watch-rule.mjs';
import { basisJumps, compareBases } from '../../core/vol-basis-test.mjs';

group('۳۱۴-الف. سنجه‌های تلاطم در دیده‌بان');
{
  const ids = WATCH_METRICS.filter((m) => m.group === 'تلاطم').map((m) => m.id);
  check('شش سنجهٔ تلاطم در فرم', ids.join() === 'ivNow,ivChangeOpen,ivChangeYday,ivSamePct,ivp,ivr');
  const live = { live: true, now: { value: 55, second: 36000 }, change: 3, changeYday: -1, same: { percentile: 90 }, summary: { ivp: 70, ivr: 60 } };
  const v = volWatchValues(live);
  check('امروز زنده: همه عدد دارند', v.ivNow === 55 && v.ivChangeOpen === 3 && v.ivChangeYday === -1 && v.ivSamePct === 90 && v.ivp === 70);
  const stale = volWatchValues({ ...live, live: false });
  check('آخرین جلسه (نه زنده): درون‌روزی‌ها NaN، روزانه‌ها می‌مانند', Number.isNaN(stale.ivNow) && Number.isNaN(stale.ivChangeOpen) && stale.ivp === 70);
  const row = { key: 'k', def: { id: 'bull-call', name: 'b' }, strikes: [1, 2], gap: {}, metrics: {}, verdict: {} };
  const ruleOk = normalizeWatchRule({ name: 'iv', conditions: [{ metric: 'ivNow', op: 'ge', value: 50 }], strategyIds: [], baseIns: [] });
  check('قاعده روی سنجهٔ تلاطم ساخته می‌شود', ruleOk.ok, ruleOk.why || '');
  const fire = (vol) => (evaluateWatch({ rules: [ruleOk.rule], snapshots: [watchSnapshot(row, { baseIns: '1', vol })], prev: {}, nowMs: 0, previewCross: true }).matched.get(ruleOk.rule.id) || []).length;
  check('IV اکنون ۵۵ ≥ ۵۰ → برقرار', fire(v) === 1);
  check('بی سنجه یا نه‌زنده → برقرار نمی‌شود', fire(null) === 0 && fire(stale) === 0);
  const wt = readSrc('../ui/tabs/watchtower.mjs');
  check('دیده‌بان سنجه‌ها را به هر سه عکس می‌دهد', (wt.match(/vol: volWatch\.get\(/g) || []).length === 3 && wt.includes('await volWatch.refresh('));
  const vw = readSrc('../ui/vol-watch.mjs');
  check('سنجهٔ تلاطم هیچ ساختی آغاز نمی‌کند و دقیقه‌ای یک بار می‌پرسد', !vw.includes('build=1') && vw.includes('VOL_WATCH_TTL_MS = 60000'));
}

group('۳۱۴-ب. آزمون آخر هفته');
{
  const settings = defaults();
  const truth = intradayContext({ ...settings, volTimeBasis: 'tradingSeconds' }, { holidaysKnown: true });
  const OPEN = truth.session.open, CLOSE = truth.session.close;
  const EXP = [20261118, 20261216];
  const SIG = 0.5, S = 10000;
  // دوشنبه تا چهارشنبه، سپس شنبه تا دوشنبه (پنجشنبه و جمعه تعطیل).
  const dates = [20261005, 20261006, 20261007, 20261010, 20261011, 20261012];
  const days = dates.map((date) => {
    let prev = null;
    const frames = [];
    for (const second of [OPEN + 1200, CLOSE]) {
      const rows = [];
      for (const expiry of EXP) {
        const T = volTime({ date, second }, expiry, { basis: 'tradingSeconds', settings, calendar: truth.calendar, expiryMoment: truth.params.expiryMoment }).years;
        for (let K = 9000; K <= 11000; K += 500) {
          const c = bsPrice('call', S, K, T, settings.rFree, 0, SIG), p = bsPrice('put', S, K, T, settings.rFree, 0, SIG);
          rows.push({ uaInsCode: '7', strikePrice: K, expiryGregorian: expiry, insCode_C: `c${expiry}${K}`, insCode_P: `p${expiry}${K}`,
            pDrCotVal_UA: S, pClosing_UA: S, qTotTran5J_UA: second,
            pMeDem_C: c * 0.995, pMeOf_C: c * 1.005, pDrCotVal_C: c, qTotTran5J_C: 1, pMeDem_P: p * 0.995, pMeOf_P: p * 1.005, pDrCotVal_P: p, qTotTran5J_P: 1 });
        }
      }
      const r = recordFrame(rows, { second, prev });
      prev = r.state;
      frames.push(r.frame);
    }
    return { date, source: 'record', limits: [[0, 1, 1e9]], ...compactRecordMoments(recordMoments(frames, '7', [OPEN + 1200, CLOSE])) };
  });
  const trading = basisJumps(days, truth);
  check('پرش‌ها شمرده شدند: ۴ شب عادی و ۱ پس از تعطیلی', trading.normal.n === 4 && trading.afterOff.n === 1, `${trading.normal.n}/${trading.afterOff.n}`);
  check('مبنای درست (ثانیهٔ معاملاتی): پرش تعطیلی ≈ صفر', Math.abs(trading.excess) < 0.2, `${trading.excess}`);
  const ranked = compareBases(days, settings, { holidaysKnown: true });
  const cal = ranked.find((r) => r.id === 'calendarDays');
  check('روز تقویمی پرش تعطیلی می‌سازد', Math.abs(cal.excess) > 1, `${cal.excess}`);
  check('رتبهٔ اول همان مبنای درست است', ranked[0].id === 'tradingSeconds', ranked.map((r) => `${r.id}:${r.excess?.toFixed(2)}`).join(' '));
  const tool = readSrc('../tools/vol-weekend-test.mjs');
  check('ابزار صاحب پروژه همان موتور را صدا می‌زند و بی تقویم هشدار می‌دهد', tool.includes('compareBases(days, settings') && tool.includes('data/holidays.json نیست'));
}
