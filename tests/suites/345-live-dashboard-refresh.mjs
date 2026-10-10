// ۳۴۵. رصد لحظه‌ای: تیکِ پس‌زمینه انتخاب و نمودار را نگه می‌دارد (۱۴۰۵/۰۷/۱۸)
//
// دنبالهٔ ۳۴۴. گزارش صاحب پروژه: «بعد از چند ثانیه نمودارها بسته می‌شود و
// دوباره باید دریافت اطلاعات کنم.» بازبینی همان الگو را در نقشه، داشبورد،
// تصویر شفاف، نوسان ضمنی و رتبهٔ تلاطم یافت: عکسِ خالی انتخاب را می‌پراند،
// تیکِ ۵ ثانیه‌ای دریافتِ نخست را لغو می‌کرد، خطا نمودار را پاک می‌کرد و
// کشوی باز بسته می‌شد.

import { check, group, readSrc } from '../harness.mjs';
import { normalizeMapSelection } from '../../ui/live-market-map.mjs';

const fnBody = (src, head, end = '\n  }\n') => {
  const start = src.indexOf(head);
  return start < 0 ? '' : src.slice(start, src.indexOf(end, start));
};

group('۳۴۵-الف. نقشه: انتخاب با عکسِ ناقص نمی‌پرد');
{
  const universe = {
    underlyings: [{ ins: 'A' }, { ins: 'B' }],
    expiries: [{ uaIns: 'B', endDate: 20261120, days: 40 }, { uaIns: 'B', endDate: 20261020, days: 10 }, { uaIns: 'A', endDate: 20261020, days: 10 }],
    contracts: [{ ins: 'b1', uaIns: 'B', endDate: 20261020 }],
  };
  const pick = { uaIns: 'B', endDate: '20261120', contractIns: 'b9' };
  // عکسِ ناقص: نمادِ B نیامده.
  const partial = { underlyings: [{ ins: 'A' }], expiries: [{ uaIns: 'A', endDate: 20261020, days: 10 }], contracts: [] };
  const kept = normalizeMapSelection(partial, pick, true);
  check('نمادِ ناموجود در عکسِ ناقص با «نخستین نماد» عوض نمی‌شود', kept.uaIns === 'B' && kept.endDate === '20261120' && kept.contractIns === 'b9');
  const empty = normalizeMapSelection({ underlyings: [], expiries: [], contracts: [] }, pick, true);
  check('عکسِ کاملاً خالی هم انتخاب را پاک نمی‌کند', empty.uaIns === 'B' && empty.endDate === '20261120' && empty.contractIns === 'b9');
  const fresh = normalizeMapSelection(universe, {}, true);
  check('بی انتخاب: نخستین نماد و نزدیک‌ترین سررسیدش', fresh.uaIns === 'A' && fresh.endDate === '20261020' && fresh.contractIns === '');
  const pickedUa = normalizeMapSelection(universe, { uaIns: 'B' }, true);
  check('نمادِ تازه بی سررسید: نزدیک‌ترین سررسیدِ همان نماد (مرتب با روز)', pickedUa.uaIns === 'B' && pickedUa.endDate === '20261020');
  const reset = normalizeMapSelection(universe, pick, false);
  check('`preserve=false` همچنان از نو می‌چیند', reset.uaIns === 'A' && reset.endDate === '20261020' && reset.contractIns === '');

  const map = readSrc('../ui/live-market-map.mjs');
  check('تیکِ پس‌زمینه بی اسکلت و بی دورریختنِ نقشه',
    map.includes('paintUnderlying(true); paintMapMode(); await paintMap(true);')
    && map.includes('if (quiet && shownUa) return;') && map.includes('if (!ex && quiet && !chainStep.hidden) return;')
    && map.includes('if (quiet && mapHandle) return;'));
  const metrics = fnBody(map, 'function paintMetricControls()');
  check('دکمه‌های سنجه فقط با تغییرِ نشانه‌گذاری بازسازی می‌شوند (فوکوس نمی‌پرد)',
    metrics.includes('if (markup === metricMarkup) return;') && metrics.indexOf('if (markup === metricMarkup) return;') < metrics.indexOf('host.innerHTML = markup;'));
}

group('۳۴۵-ب. داشبورد: عکسِ خالی شکست است و نوار با خطا نمی‌رود');
{
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const refresh = fnBody(dash, 'async function refresh(event)');
  check('پاسخِ بی نماد یا بی قرارداد، پس از یک عکس سالم، جای آن را نمی‌گیرد',
    refresh.includes('const hadGood = payload.universe.underlyings.length > 0;')
    && refresh.includes('!next.universe?.underlyings?.length || !next.universe?.contracts?.length')
    && refresh.indexOf('throw new Error(\'عکس تازهٔ بازار خالی یا ناقص بود') < refresh.indexOf('payload = next;'));
  const tape = fnBody(dash, 'async function fetchTape()');
  check('نوار فقط با عوض‌شدنِ قرارداد خالی می‌شود، نه پیش از هر دریافت',
    tape.includes('if (key !== tapeFor) { tape = []; tapeFor = key; }') && !/\n\s*tape = \[\];\n/.test(tape));
  check('پاسخِ دیررسیده روی نوارِ قراردادِ تازه نمی‌نشیند', tape.includes('if (tapeFor === key) tape = fresh;'));
}

group('۳۴۵-ج. تصویر شفاف: خطای مسیر روز نمودار را پاک نمی‌کند');
{
  const cp = readSrc('../ui/clear-picture-view.mjs');
  const fetchSeries = fnBody(cp, 'async function fetchSeries(key)');
  check('شکست، نقطه‌های همان کلید را نگه می‌دارد', fetchSeries.includes('points: series.key === key ? series.points : [], error: error.message')
    && !fetchSeries.includes('points: [], error'));
  check('خطا فقط متن کنار همان نمودار است', cp.includes('series.error && points.length ? ` آخرین دریافت ناموفق بود (${faDigits(series.error)})'));
}

group('۳۴۵-د. نوسان ضمنی: دریافتِ نخست لغو نمی‌شود و کشو باز می‌ماند');
{
  const iv = readSrc('../ui/iv-charts-view.mjs');
  const paint = fnBody(iv, '    paint() {', '\n    },\n');
  check('تیک با دریافتِ درجریانِ همان نماد دوباره `loadDaily` نمی‌زند',
    paint.includes('if (next !== ua) { loadDaily(); return; }') && paint.includes('if (!data) { if (dailyFor !== next) loadDaily(); return; }')
    && !paint.includes('next !== ua || !data'));
  const daily = fnBody(iv, 'async function loadDaily()', '\n  const uaName');
  check('نشانِ درجریان پس از پایانِ همان دریافت پاک می‌شود', daily.includes('dailyFor = want;') && daily.includes('if (my === dailySeq) dailyFor = null;'));
  const fill = fnBody(iv, 'function fillSelects()');
  check('کشوها با `setOptions`، نه `innerHTML` مستقیم', fill.includes("setOptions('instrument',") && fill.includes("setOptions('rInstrument',")
    && fill.includes("setOptions('expiry',") && !fill.includes('.innerHTML ='));
  const setOptions = fnBody(iv, 'function setOptions(name, markup)');
  check('کشوی فوکوس‌دار یا بی‌تغییر دست نمی‌خورد', setOptions.includes('optionMarkup[name] === markup') && setOptions.includes('document.activeElement === el'));
  check('تراشه‌ها فقط با تغییرِ نشانه‌گذاری', iv.includes("if (chips !== chipsMarkup) { q('[data-ivc-chips]').innerHTML = chips; chipsMarkup = chips; }"));
}

group('۳۴۵-ه. رتبهٔ تلاطم: دریافتِ نخست و نظرسنجیِ ساخت');
{
  const vr = readSrc('../ui/vol-rank-view.mjs');
  const paint = fnBody(vr, '    paint() {', '\n    },\n');
  check('تیک با دریافتِ درجریان صبر می‌کند', paint.includes('if (next !== ua) { load(); return; }') && paint.includes('if (!api) { if (!loading) load(); return; }')
    && !paint.includes('next !== ua || !api'));
  check('تیکِ ۵ ثانیه‌ای زمان‌سنجِ ساخت را از نو نمی‌گذارد', paint.includes('&& !loading && !poll) poll = setTimeout(() => { poll = null;')
    && !paint.includes('clearTimeout(poll)'));
  const load = fnBody(vr, 'async function load(force = false)');
  check('اسکلتِ «در حال دریافت» فقط برای درخواستِ تازه، نه تلاشِ دوباره پس از خطا',
    load.includes('if (key !== apiKey && key !== askedKey) {') && load.includes('askedKey = key;'));
  check('لغوِ زمان‌سنج نشانش را هم پاک می‌کند (وگرنه `!poll` هرگز درست نمی‌شد)', load.includes('clearTimeout(poll); poll = null;'));
}
