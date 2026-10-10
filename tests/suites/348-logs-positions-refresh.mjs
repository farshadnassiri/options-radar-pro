// ۳۴۸. دفتر خطاها، جریان داده، موقعیت‌ها و رول: تیکِ پس‌زمینه درجا (۱۴۰۵/۰۷/۱۸)
//
// دنبالهٔ ۳۴۴. گزارش صاحب پروژه: «هر جا به‌روزرسانی می‌شود، نمودارها و
// جدول‌ها و همهٔ خروجی‌ها لحظه‌ای به‌روز شوند و از اول نیاز به تنظیم نباشد.»
// ممیزی همین عیب را در چهار تب دیگر یافت: `<details>`ِ باز با هر تیک بسته
// می‌شد، خطای یک تیک جدول را خالی می‌کرد، کشوییِ باز زیرِ دست بسته می‌شد،
// و مظنهٔ ناموفق پا را صفر می‌کرد.

import { check, group, readSrc } from '../harness.mjs';
import { mergeQuotes } from '../../ui/quote-intake.mjs';

const datalog = readSrc('../ui/tabs/datalog.mjs');
const logs = readSrc('../ui/tabs/logs.mjs');
const positions = readSrc('../ui/tabs/positions.mjs');
const roll = readSrc('../ui/tabs/roll.mjs');

group('۳۴۸. جریان داده: وصله و بی‌نقاشیِ بی‌جهت');
{
  check('سه ظرفِ تیک‌خور وصله می‌شوند، نه `innerHTML` (details «به تفکیک سرویس» باز می‌ماند)',
    datalog.includes("patchHTML($('dl-summary'), `") && datalog.includes("patchHTML($('dl-table'), shown.length")
    && datalog.includes("patchHTML($('dl-state'), `")
    && !/\$\('dl-(summary|table|state)'\)\.innerHTML =/.test(datalog));
  check('تیکِ بی ردیفِ تازه نقاشی نمی‌کند',
    datalog.includes('if (!reset && mark === painted) return;'));
  check('بازهٔ زمانی در نشان است تا ردیفِ کهنه بی ردیفِ تازه هم برود',
    datalog.includes("$('dl-range').value === '0' ? 0 : Math.floor(Date.now() / 60000)"));
  const catchBody = datalog.slice(datalog.indexOf('} catch (error) {'), datalog.indexOf('function filtered('));
  check('خطای خواندن جدول را دست نمی‌زند و دریافتِ موفقِ بعدی جملهٔ خطا را برمی‌دارد',
    catchBody.includes("painted = '';") && !catchBody.includes('rows = []') && !catchBody.includes('paint()'));
}

group('۳۴۸. دفتر خطاها: ردیف‌ها با خطا نمی‌روند و «نمایش» باز می‌ماند');
{
  const load = logs.slice(logs.indexOf('async function load() {'), logs.indexOf('function paint() {'));
  check('خطای دفتر ردیف‌های قبلی را نگه می‌دارد و فقط متن خطا را می‌گذارد',
    !load.includes('serverRows = [];') && load.includes('stats = { ...stats, readError: e.message };'));
  check('شکستِ سلامت جدولِ آخر را پاک نمی‌کند و می‌گوید از آخرین دریافتِ موفق است',
    !load.includes('health = null') && load.includes('if (!healthFailed) health = healthBody;')
    && logs.includes('جدول همان آخرین دریافتِ موفق است'));
  check('جدول رویدادها و سلامت وصله می‌شوند',
    logs.includes("patched($('log-table')).innerHTML = `<table") && logs.includes("patched($('health-table')).innerHTML =")
    && !/\$\('(log-table|health-table)'\)\.innerHTML =/.test(logs));
  check('`open` به کلیدِ رویداد است، نه جایگاه (ردیفِ تازه بالای جدول می‌نشیند)',
    logs.includes('data-log="${esc(rowKey(r))}"${openDetails.has(rowKey(r)) ? \' open\' : \'\'}')
    && logs.includes("root.addEventListener('toggle', (event) => {") && logs.includes('}, true);')
    && logs.includes('if (details.open !== want) details.open = want;'));
}

group('۳۴۸. موقعیت‌های من: کشویی نماد پایه');
{
  const fn = positions.slice(positions.indexOf('function refreshUaOptions() {'), positions.indexOf('let detail = null;'));
  check('فهرستِ یکسان دوباره ساخته نمی‌شود و کشوییِ زیرِ دستِ کاربر دست نمی‌خورد',
    fn.includes('if (markup === uaMarkup || (uaMarkup && document.activeElement === F.ua)) return;'));
  check('انتخابِ کاربر پس از ساختِ دوباره می‌ماند',
    fn.includes('if (cur && uaList.some((u) => u.ins === cur)) F.ua.value = cur;') && !fn.includes("'selected'"));
}

group('۳۴۸. مظنهٔ ناموفق صفر نمی‌شود (`mergeQuotes`)');
{

  const ok = { usable: true };
  const bad = { usable: false };
  const first = mergeQuotes(new Map(), ['A', 'B'], {
    books: { byIns: { A: { book: [{ bid: 100, ask: 110, bidQty: 5, askQty: 6 }] }, B: { book: [{ bid: 50, ask: 55 }] } },
      verdicts: { A: ok, B: ok } },
    infos: { byIns: { A: { last: 105, close: 104, low: 99, high: 111 }, B: { last: 52, close: 51 } },
      verdicts: { A: ok, B: ok } },
  }, 1000);
  check('دریافتِ کامل همان شکلِ قبلی را می‌سازد و چیزی «مانده» نیست',
    first.get('A').bid === 100 && first.get('A').close === 104 && first.get('A').heldAt === 0
    && first.get('A').bookAt === 1000 && first.get('A').infoAt === 1000);

  // دفترِ B خطا داد و اطلاعاتِ A نرسید؛ بقیه رسید.
  const second = mergeQuotes(first, ['A', 'B'], {
    books: { byIns: { A: { book: [{ bid: 101, ask: 109 }] } }, verdicts: { A: ok, B: { ...bad, state: 'error' } } },
    infos: { byIns: { B: { last: 53, close: 51 } }, verdicts: { A: { ...bad, state: 'missing' }, B: ok } },
  }, 2000);
  const a = second.get('A'), b = second.get('B');
  check('بخشِ ناموفق از آخرین دریافتِ موفق می‌ماند، نه صفر',
    a.last === 105 && a.close === 104 && a.high === 111 && b.bid === 50 && b.ask === 55);
  check('بخشِ رسیده تازه می‌شود', a.bid === 101 && a.ask === 109 && b.last === 53);
  check('`heldAt` زمانِ همان دریافتِ موفق را می‌گوید', a.heldAt === 1000 && b.heldAt === 1000 && a.bookAt === 2000 && a.infoAt === 1000);
  check('ورودی دست نمی‌خورد (محض)', first.get('A').bid === 100 && first.get('B').last === 52);

  // دفترِ خالیِ تأییدشده (بازار بسته / «رکوردی نیست») رسیدن است، نه شکست.
  const quiet = mergeQuotes(first, ['A'], {
    books: { byIns: { A: { book: [] } }, verdicts: { A: { usable: true, state: 'closed' } } },
    infos: { byIns: { A: { last: 105, close: 104 } }, verdicts: { A: ok } },
  }, 3000);
  check('دفترِ خالیِ تأییدشده جای قبلی را می‌گیرد', quiet.get('A').bid === 0 && quiet.get('A').heldAt === 0);

  // آنچه هرگز نرسیده ساخته نمی‌شود، و صفرِ نرسیده بعداً «آخرین موفق» شمرده نمی‌شود.
  const never = mergeQuotes(new Map(), ['C'], { books: { byIns: {}, verdicts: { C: bad } }, infos: { byIns: {}, verdicts: { C: bad } } }, 1000);
  const again = mergeQuotes(never, ['C'], { books: { byIns: {}, verdicts: { C: bad } }, infos: { byIns: {}, verdicts: { C: bad } } }, 2000);
  check('ابزارِ هرگز‌نرسیده صفر می‌ماند و «مانده از قبل» نمی‌شود',
    never.get('C').bid === 0 && never.get('C').bookAt === 0 && again.get('C').heldAt === 0);

  const price = positions.slice(positions.indexOf('async function priceAll() {'), positions.indexOf('const offFeed'));
  check('قیمت‌گیریِ موقعیت‌ها از همین ادغام می‌گذرد و نقشهٔ نو با صفر نمی‌سازد',
    price.includes('quotesByIns = mergeQuotes(quotesByIns, codes, quotes, Date.now());') && !price.includes('quotesByIns = new Map();'));
  check('نوار بالا می‌گوید چند نماد از آخرین دریافتِ موفق است',
    positions.includes('function heldQuotes() {') && positions.includes('heldQuotes(),'));
  const rollPrice = roll.slice(roll.indexOf('async function priceAll() {'), roll.indexOf('function drawCc() {'));
  check('رول هم همان ادغام را دارد',
    roll.includes("import { fetchQuotes, mergeQuotes, quoteWarning } from '/ui/quote-intake.mjs';") && !roll.includes('/ui/tabs/positions.mjs')
    && rollPrice.includes('for (const [ins, q] of mergeQuotes(quotesByIns, codes, quotes, Date.now())) quotesByIns.set(ins, q);')
    && roll.includes('پا با مظنهٔ آخرین دریافتِ موفق'));
}

group('۳۴۸. رول: نمودارها با تیکِ بی‌تغییر از نو سوار نمی‌شوند');
{
  const draw = roll.slice(roll.indexOf('  function draw() {'), roll.indexOf('function chartInputs('));
  check('وقتی ورودیِ نمودار همان است، نابود و سوار کردن رد می‌شود',
    draw.includes('if (sameScenario && sig === chartSig && dChart && c1Chart && c2Chart) return;')
    && draw.indexOf('if (sameScenario && sig === chartSig') < draw.indexOf('dChart?.destroy();'));
  check('نشان، ورودی‌های منحنی‌ها را دارد و مظنهٔ خام را نه',
    roll.includes('JSON.stringify([p.qty, p.legs, r.curNet, r.nextLegs, r.nextNet, spot, sigma, fees,')
    && !roll.slice(roll.indexOf('function chartInputs('), roll.indexOf("el('#pos').addEventListener")).includes('quotesByIns'));
}
