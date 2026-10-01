// ۳۰۷. گزارش آزمون «آزمون همه استراتژی‌ها» — ۱ اکتبر ۲۰۲۶، کامیت 5eba680
//
// ممیزی مستقل حساب سود و کارمزد را درست یافت، ولی پنج اشکالِ قابل‌بازتولید:
//
//   ۱. روزی که هیچ اختیاری قیمت نداشت از تقویم ماتریس می‌افتاد؛ پوشش ۱۰۰٪
//      به‌جای ۶۶٫۶۷٪.
//   ۲. کارت جزئیات بازده را روی «درگیر خالص» موتور نشان می‌داد و جدول روی
//      مبنای عدسی — همان معامله ۳۲٫۷۲٪ و ۸۳٫۷۷٪، بی توضیح.
//   ۳. نردبان اعمال فقط از سررسید نزدیک: مورب معتبر ساخته نمی‌شد.
//   ۴. «بال مساوی» تنهٔ کندور را هم هم‌عرض می‌خواست.
//   ۵. حلقهٔ ریسه همگام بود؛ پیام توقف تا پایان پردازش نمی‌شد.
//
// قاعدهٔ این دسته از خود گزارش است: ریسهٔ **واقعی** در یک نخ جدا با پل پیام
// اجرا می‌شود، نه تابع خالصِ جداشده. ورودی‌ها هم‌شکل پاسخ دیده‌بان‌اند.

import { Worker } from 'node:worker_threads';
import { check, group, near, readSrc } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import {
  basisMatrix, entrySensitivity, generateHistoricalCombos, historyCalendar, rebaseReplay, replayHistory,
} from '../../core/history.mjs';
import { buildPnlMatrix } from '../../core/portfolio-matrix.mjs';
import { analyzePortfolio } from '../../core/portfolio-report.mjs';
import { RETURN_BASES, basisDenominator, basisEntryOf } from '../../core/portfolio-basis.mjs';
import { generateCombos } from '../../core/scan.mjs';
import { equalWings } from '../../core/strike-window.mjs';
import { defaults, feesOf } from '../../core/settings.mjs';
import { CATALOG, byId } from '../../strategies/catalog.mjs';

const D1 = 20260926, D2 = 20260927, D3 = 20260928;
const NEAR = 20261020, FAR = 20261120;
const SPOT = 1100;
const settings = defaults();
const fees = feesOf(settings);

// ردیف دیده‌بان، هم‌شکل پاسخ واقعی
const watchRow = (ua, end, k, over = {}) => ({
  uaInsCode: ua, lval30_UA: 'پایه', pDrCotVal_UA: SPOT, pClosing_UA: SPOT, priceYesterday_UA: SPOT,
  insCode_C: `c${end}_${k}`, lVal18AFC_C: `ضپا${k}`, insCode_P: `p${end}_${k}`, lVal18AFC_P: `طپا${k}`,
  strikePrice: k, contractSize: 1000, remainedDay: end === NEAR ? 24 : 55, endDate: end,
  pMeDem_C: 90, qTitMeDem_C: 500, pMeOf_C: 95, qTitMeOf_C: 500, pDrCotVal_C: 92, pClosing_C: 92, oP_C: 300, qTotTran5J_C: 900,
  pMeDem_P: 80, qTitMeDem_P: 500, pMeOf_P: 85, qTitMeOf_P: 500, pDrCotVal_P: 82, pClosing_P: 82, oP_P: 300, qTotTran5J_P: 900,
  ...over,
});
const day = (date, price, over = {}) => ({
  date, close: price, last: price, first: price, low: price, high: price, vol: 1000, value: price * 1000 * 1000, ...over,
});
const baseDays = (dates) => dates.map((date) => day(date, SPOT, { vol: 5e6, value: 1e11 }));

// ═══ ریسهٔ واقعی در نخ جدا ═══
//
// پل همان کاری را می‌کند که مرورگر: `self.onmessage` و `self.postMessage`.
// پیام‌ها پیش از بارگذاری کامل فرستاده نمی‌شوند — `ready` منتظرش می‌ماند.
// پل خودش ماژول ESM است (نشانی `data:`)، چون مخزن هیچ `require` ندارد.
const BOOT = `
import { parentPort, workerData } from 'node:worker_threads';
globalThis.self = globalThis;
self.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
parentPort.on('message', (data) => self.onmessage && self.onmessage({ data }));
import(workerData.url).then(() => parentPort.postMessage({ type: 'ready' }), (error) => parentPort.postMessage({ type: 'boot-error', error: String(error) }));
`;
const BOOT_URL = new URL(`data:text/javascript,${encodeURIComponent(BOOT)}`);
const WORKER_URL = new URL('../../worker/history-worker.mjs', import.meta.url).href;

/** پیام‌ها را پشت‌سرهم می‌فرستد و پاسخ نهایی هر شناسه را برمی‌گرداند. */
async function runWorker(messages, wantIds) {
  const worker = new Worker(BOOT_URL, { workerData: { url: WORKER_URL } });
  const out = {};
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ریسه در ۳۰ ثانیه پاسخ نداد')), 30000);
      timer.unref?.();
      worker.on('error', (error) => { clearTimeout(timer); reject(error); });
      worker.on('message', (m) => {
        if (m.type === 'ready') { for (const msg of messages) worker.postMessage(msg); return; }
        if (m.type === 'boot-error' || m.type === 'error') { clearTimeout(timer); reject(new Error(m.error)); return; }
        if (m.type === 'portfolio') {
          out[m.id] = m;
          if (wantIds.every((id) => out[id])) { clearTimeout(timer); resolve(); }
        }
      });
    });
  } finally {
    await worker.terminate();
  }
  return out;
}

// ═══ ورودی مشترک ۳۰۷-الف و ۳۰۷-ب و ۳۰۷-ه ═══
//
// سه روز معاملاتی پایه. روز وسط برای **همهٔ** اختیارها قیمت ندارد؛ روز
// اول و آخر دارد.
const chainRows = [1000, 1100, 1200].map((k) => watchRow('UA', NEAR, k));
const ua = buildChain(chainRows, settings).get('UA');
const series = { UA: baseDays([D1, D2, D3]) };
for (const k of [1000, 1100, 1200]) {
  series[`c${NEAR}_${k}`] = [day(D1, 120 - (k - 1000) / 10), day(D3, 135 - (k - 1000) / 10)];
  series[`p${NEAR}_${k}`] = [day(D1, 50 + (k - 1000) / 10), day(D3, 44 + (k - 1000) / 10)];
}
const job = (id) => ({
  id, type: 'portfolio', ua, seriesByIns: series, startDate: D1, endDate: D3,
  entryBasis: 'CLOSE', exitBasis: 'CLOSE', units: 1, fees, settings,
  filtered: true, liquidity: {}, includeInfeasible: false,
});
const feasibleCount = CATALOG.filter((def) => def.feasible).length;

let runs = null;
try {
  runs = await runWorker([job('full')], ['full']);
} catch (error) {
  runs = { error: String(error?.message || error) };
}
const full = runs.full;

group('۳۰۷-الف. روزِ بی‌قیمت در تقویم می‌ماند؛ پوشش ۶۶٫۶۷٪، نه ۱۰۰٪');
{
  check('ریسهٔ واقعی در نخ جدا اجرا شد', !!full, runs.error || '');
  check('تقویم مشترک از روزهای معاملاتی پایه در بازه ساخته می‌شود',
    historyCalendar(series.UA, D1, D3).join(',') === `${D1},${D2},${D3}`,
    historyCalendar(series.UA, D1, D3).join('،'));
  check('ماتریس هر سه روز را دارد، از جمله روزِ بی‌قیمت',
    full?.matrix?.dates?.join(',') === `${D1},${D2},${D3}`, full?.matrix?.dates?.join('،'));
  const width = full?.matrix?.dates?.length || 0;
  const pnl = full?.matrix?.pnl || [];
  const middle = Array.from({ length: full?.matrix?.rowCount || 0 }, (_, row) => pnl[row * width + 1]);
  check('خانه‌های روز وسط نامعلوم‌اند، نه صفر',
    middle.length > 0 && middle.every((value) => Number.isNaN(value)), `${middle.length} ردیف`);
  const analysis = full ? analyzePortfolio({ rows: full.rows, matrix: full.matrix }) : null;
  const coverages = (analysis?.strategies || []).map((row) => row.metrics.coverage);
  check('پوشش هر استراتژی دو روز از سه روز است',
    coverages.length > 0 && coverages.every((value) => near(value, 200 / 3, 1e-9)),
    `${coverages.length} استراتژی · ${[...new Set(coverages.map((v) => v?.toFixed(2)))].join('، ')}`);
  // ماتریسِ بی‌تقویم همان باگ را بازتولید می‌کند — پس آزمون بالا واقعاً
  // چیزی را می‌سنجد.
  const daily = (dates) => ({ path: { daily: dates.map((date) => ({ date, netPnl: 1, returnPct: 1 })) } });
  check('بی تقویم، ستون روز وسط می‌افتد (شاهد باگ پیشین)',
    buildPnlMatrix([daily([D1, D3])]).dates.length === 2
    && buildPnlMatrix([daily([D1, D3])], { calendar: [D1, D2, D3] }).dates.length === 3);
  check('ریسه تقویم را به ماتریس می‌دهد',
    /buildPnlMatrix\(rows, \{ calendar \}\)/.test(readSrc('../worker/history-worker.mjs')));
}

group('۳۰۷-ب. بازده کارت جزئیات = بازده جدول، روی همان مبنا');
{
  // همان مسیری که رابط می‌رود: ردیف خام → بازپخش دوباره → مبنای عدسی.
  const args = (row) => ({
    legs: row.legs, seriesByIns: series, baseIns: 'UA', startDate: D1, endDate: D3,
    entryBasis: 'CLOSE', exitBasis: 'CLOSE', units: 1, fees, settings, liquidity: {},
  });
  for (const basis of RETURN_BASES) {
    const analysis = full ? analyzePortfolio({ rows: full.rows, matrix: full.matrix, basisId: basis.id }) : null;
    const usable = (analysis?.combos || []).filter((combo) => combo.series.ok && combo.series.finalPct !== null);
    const mismatched = usable.filter((combo) => {
      const replay = rebaseReplay(replayHistory(args(full.rows[combo.index])), basis.id);
      const final = replay.rows.find((row) => row.date === D3 && row.status === 'ok');
      return !(final && near(final.returnPct, combo.series.finalPct, 1e-9));
    });
    check(`مبنای «${basis.short}»: هر ترکیب در کارت و جدول یک درصد دارد`,
      usable.length > 0 && mismatched.length === 0,
      `${usable.length} ترکیب · ${mismatched.length} ناهمخوان`);
  }

  // Naked Call همان نمونهٔ مرورگر: مخرج ناخالص ≠ خالص، پس درصد موتور با
  // درصد جدول فرق دارد و کارت باید از جدول پیروی کند، نه از موتور.
  const naked = full?.rows.find((row) => row.strategyId === 'naked-call');
  const raw = naked ? replayHistory(args(naked)) : null;
  const gross = raw ? rebaseReplay(raw, 'gross') : null;
  const rawFinal = raw?.rows.find((row) => row.date === D3);
  const grossFinal = gross?.rows.find((row) => row.date === D3);
  const den = raw ? basisDenominator(basisEntryOf(raw.entry), 'gross') : null;
  check('Naked Call: سود ریالی دست نمی‌خورد، فقط مخرج',
    !!grossFinal && grossFinal.netPnl === rawFinal.netPnl && den?.ok
    && near(grossFinal.returnPct, (grossFinal.netPnl / den.value) * 100, 1e-12),
    grossFinal ? `${grossFinal.returnPct?.toFixed(2)}٪ روی ${den?.value}` : '');
  check('و درصدِ خام موتور (درگیر خالص) با درصد ناخالص فرق دارد — همان اختلافِ گزارش',
    !!rawFinal && !near(rawFinal.returnPct, grossFinal.returnPct, 1e-6),
    rawFinal ? `${rawFinal.returnPct.toFixed(2)}٪ در برابر ${grossFinal.returnPct.toFixed(2)}٪` : '');
  check('مبنای به‌کاررفته با نامش همراه بازپخش می‌آید',
    gross?.basis?.id === 'gross' && gross.basis.ok === true && gross.basis.denominator === den?.value);
  const shock = naked ? entrySensitivity(args(naked), [0], { basisId: 'gross' }) : [];
  const cell = naked ? basisMatrix(args(naked), { basisId: 'gross' }).find((row) => row.entry === 'CLOSE' && row.exit === 'CLOSE') : null;
  check('حساسیت و ماتریس مبنا هم روی همان مبنا، با شوک صفر همان عدد کارت',
    shock.length === 1 && near(shock[0].result.returnPct, grossFinal?.returnPct, 1e-9)
    && near(cell?.result?.returnPct, grossFinal?.returnPct, 1e-9));
  check('بی مبنا، حساسیت همان عدد موتور را می‌دهد (صداکنندهٔ دیگر دست نخورد)',
    naked && near(entrySensitivity(args(naked), [0])[0].result.returnPct, rawFinal?.returnPct, 1e-9));
  const nakedDen = raw ? basisDenominator(basisEntryOf({ ...raw.entry, capital: { value: 0 } }), 'net') : null;
  check('مخرجِ نامثبت بازده نامعلوم می‌دهد، نه عدد مبنای دیگر',
    nakedDen?.ok === false
    && Number.isNaN(rebaseReplay({ ...raw, entry: { ...raw.entry, capital: { value: 0 } } }, 'net').rows.at(-1).returnPct));

  const tab = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('کارت جزئیات و بازمحاسبهٔ دستی از مبنای عدسی می‌خوانند',
    tab.includes('const replay = onLens(replayHistory(replayArgs(item)));')
    && tab.includes('const manualReplay = onLens(replayHistory(replayArgs(item, manualEntry)));'));
  check('برچسب کارت و نمودار نام مبنا را دارد',
    tab.includes('<span>بازده روی ${esc(basis.short)}</span>')
    && tab.includes("yLabel: `بازده روی ${basis.short} (درصد)`"));
  check('حساسیت و ماتریس مبنا با مبنای عدسی صدا زده می‌شوند',
    tab.includes('entrySensitivity(args, shocks, { basisId: lensBasis.id })')
    && tab.includes('basisMatrix(args, { basisId: lensBasis.id })'));
}

group('۳۰۷-ج. مورب: اعمال هر پا از سررسید همان پا');
{
  // نزدیک فقط کال ۱٬۱۰۰ و دور فقط کال ۱٬۰۰۰ دارد.
  const uaDiag = {
    ins: 'UD', name: 'پایه',
    expiryList: [
      { endDate: NEAR, days: 24, strikeList: [{ strike: 1100, size: 1000, call: { ins: 'n1100', name: 'ضنزدیک۱۱۰۰' } }] },
      { endDate: FAR, days: 55, strikeList: [{ strike: 1000, size: 1000, call: { ins: 'f1000', name: 'ضدور۱۰۰۰' } }] },
    ],
  };
  const diagSeries = {
    UD: baseDays([D1, D3]),
    n1100: [day(D1, 40), day(D3, 38)],
    f1000: [day(D1, 160), day(D3, 158)],
  };
  const out = generateHistoricalCombos({
    def: byId('diagonal-call'), ua: uaDiag, seriesByIns: diagSeries, startDate: D1, entryBasis: 'CLOSE', settings,
  });
  const combo = out.combos[0];
  check('یک Diagonal Call ساخته می‌شود', out.combos.length === 1, `${out.combos.length} ترکیب`);
  check('فروش کال نزدیک ۱٬۱۰۰ و خرید کال دور ۱٬۰۰۰',
    combo?.legs.some((leg) => leg.ins === 'n1100' && leg.side === 'sell' && leg.expiry === NEAR)
    && combo?.legs.some((leg) => leg.ins === 'f1000' && leg.side === 'buy' && leg.expiry === FAR),
    combo ? combo.legs.map((leg) => `${leg.side}:${leg.ins}`).join(' ') : '');
  const replay = combo ? replayHistory({
    legs: combo.legs, seriesByIns: diagSeries, baseIns: 'UD', startDate: D1, endDate: D3,
    entryBasis: 'CLOSE', exitBasis: 'CLOSE', units: 1, fees, settings,
  }) : null;
  check('و همان ترکیب بازپخش معتبر دارد', replay?.ok === true && Number.isFinite(replay.summary.last?.netPnl));

  // تقویمی دست نخورد: اعمالی که فقط یک سررسید دارد ترکیب تقویمی نمی‌سازد.
  const uaCal = {
    ins: 'UD', name: 'پایه',
    expiryList: [
      { endDate: NEAR, days: 24, strikeList: [1000, 1100].map((k) => ({ strike: k, size: 1000, call: { ins: `n${k}`, name: `ن${k}` } })) },
      { endDate: FAR, days: 55, strikeList: [{ strike: 1000, size: 1000, call: { ins: 'f1000', name: 'د1000' } }] },
    ],
  };
  const cal = generateHistoricalCombos({
    def: byId('calendar-call'), ua: uaCal,
    seriesByIns: { ...diagSeries, n1000: [day(D1, 120), day(D3, 118)] },
    startDate: D1, entryBasis: 'CLOSE', settings,
  });
  check('تقویمی فقط روی اعمالِ مشترک دو سررسید',
    cal.combos.length === 1 && cal.combos[0].strikes.join(',') === '1000',
    cal.combos.map((c) => c.strikes.join('/')).join('، '));

  // پویش زنده: همان قاعده.
  const live = buildChain([watchRow('UL', NEAR, 1100), watchRow('UL', FAR, 1000)], settings).get('UL');
  const s = { ...settings, showUnexecutable: true };
  const diag = generateCombos(byId('diagonal-call'), live, s);
  check('پویش زنده هم مورب نزدیک ۱٬۱۰۰ / دور ۱٬۰۰۰ را می‌سازد',
    diag.length === 1 && diag[0].strikes.join(',') === '1000,1100'
    && diag[0].legs.find((leg) => leg.side === 'sell')?.endDate === NEAR,
    `${diag.length} ترکیب`);
  const liveCal = generateCombos(byId('calendar-call'), live, s);
  check('و تقویمی زنده بی اعمالِ مشترک چیزی نمی‌سازد', liveCal.length === 0, `${liveCal.length}`);
}

group('۳۰۷-د. کندور: فقط بال‌های بیرونی هم‌عرض');
{
  check('باترفلای همان قاعدهٔ پیشین: ۹۰-۱۰۰-۱۱۰ می‌ماند، ۹۰-۱۰۰-۱۳۰ می‌افتد',
    equalWings([90, 100, 110]) && !equalWings([90, 100, 130]));
  check('کندور ۸۰۰-۹۰۰-۱۱۰۰-۱۲۰۰ (بال‌ها ۱۰۰ و ۱۰۰، تنه ۲۰۰) می‌ماند',
    equalWings([800, 900, 1100, 1200]));
  check('کندور با بال‌های نابرابر ۸۰۰-۹۰۰-۱۱۰۰-۱۲۵۰ می‌افتد', !equalWings([800, 900, 1100, 1250]));

  const ks = [800, 900, 1100, 1200];
  const rows = [NEAR, FAR].flatMap((end) => ks.map((k) => watchRow('UC', end, k)));
  const uaC = buildChain(rows, settings).get('UC');
  const condorSeries = { UC: baseDays([D1, D3]) };
  for (const end of [NEAR, FAR]) {
    for (const k of ks) {
      condorSeries[`c${end}_${k}`] = [day(D1, Math.max(5, 1300 - k) / 4), day(D3, Math.max(5, 1300 - k) / 4)];
      condorSeries[`p${end}_${k}`] = [day(D1, Math.max(5, k - 700) / 4), day(D3, Math.max(5, k - 700) / 4)];
    }
  }
  const out = generateHistoricalCombos({
    def: byId('iron-condor'), ua: uaC, seriesByIns: condorSeries, startDate: D1, entryBasis: 'CLOSE', settings,
  });
  check('با «بال مساوی» روشن، دو Iron Condor برای دو سررسید',
    settings.wingsEqualWidth === true && out.combos.length === 2
    && out.combos.every((combo) => combo.strikes.join(',') === ks.join(',')),
    `${out.combos.length} ترکیب`);
  const live = generateCombos(byId('iron-condor'), uaC, { ...settings, showUnexecutable: true });
  check('پویش زنده هم همان دو کندور را می‌سازد', live.length === 2, `${live.length} ترکیب`);
  check('قاعدهٔ بال در هر دو مسیر از یک تابع می‌آید',
    !/function equalWidth/.test(readSrc('../core/scan.mjs')) && !/function equalWidth/.test(readSrc('../core/history.mjs')));
}

group('۳۰۷-ه. توقف وسط اجرا: نتیجهٔ ساخته‌شده می‌ماند');
{
  // کار و توقف پشت‌سرهم: در ریسهٔ همگامِ پیشین، توقف فقط پس از پایان هر ۳۶
  // استراتژی پردازش می‌شد و پاسخ `stopped: false` بود. کار سوم بعد از
  // توقف می‌رسد و نباید متأثر شود.
  let got = null, error = '';
  try {
    got = await runWorker([job('first'), { type: 'stop' }, job('after')], ['first', 'after']);
  } catch (e) { error = String(e?.message || e); }
  const first = got?.first, after = got?.after;
  check('ریسه پیام توقف را وسط اجرا دید', first?.stopped === true, error || `stopped=${first?.stopped}`);
  check('و پیش از پایان همهٔ استراتژی‌ها برگشت',
    !!first && first.generatedByStrategy.length < feasibleCount,
    `${first?.generatedByStrategy.length} از ${feasibleCount}`);
  check('نتیجهٔ جزئی نگه داشته شد، نه دور ریخته',
    !!first && first.rows.length > 0 && first.matrix.rowCount === first.rows.length,
    `${first?.rows.length} ردیف`);
  check('کاری که پس از توقف رسید کامل اجرا شد',
    after?.stopped === false && after.generatedByStrategy.length === feasibleCount
    && after.rows.length === full?.rows.length,
    `${after?.generatedByStrategy.length} استراتژی · ${after?.rows.length} ردیف`);
}
