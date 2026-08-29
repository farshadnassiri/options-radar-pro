// ۱۴۶. قراردادهای یک لحظه از سرور

import { check, group, readSrc } from '../harness.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioMomentSnapshot } from '../../core/portfolio-snapshot.mjs';
import {
  DEFAULT_CONTRACT_LIMIT, loadMomentContracts,
} from '../../ui/portfolio-snapshot-data.mjs';

group('۱۴۶. قراردادهای یک لحظه از سرور');
{
  const fx146 = portfolioFixture('snapshot-data-146');
  const at146 = fx146.at;
  const session146 = { ...fx146.session, baseIns: '900001' };

  // ردیف‌های تابلو، همان شکلی که `/api/history/universe` می‌دهد.
  const universeRow = (strike, callIns, putIns) => ({
    uaInsCode: '900001', lval30_UA: 'پایه', pClosing_UA: 10_200,
    strikePrice: strike, remainedDay: 30, endDate: 20260620, contractSize: 1000,
    insCode_C: callIns, lVal18AFC_C: `ض${strike}`, pClosing_C: 70,
    insCode_P: putIns, lVal18AFC_P: `ط${strike}`, pClosing_P: 80,
  });
  const rows146 = [9000, 9500, 10_000, 10_500, 11_000]
    .map((k) => universeRow(k, `call-${k}`, `put-${k}`));

  // دروازهٔ زمان تزریق می‌شود تا این لایه بدون شبکه سنجیده شود — همان
  // چیزی که نبودش باعث شد این شکاف تا امروز دیده نشود.
  const bookFor = (ins) => fx146.contracts.find((row) => row.ins === ins)?.quote.book ?? null;
  const fakeGate = (opts = {}) => ({
    snapshot: async (ins) => (opts.blind ? null : {
      quote: { book: bookFor(ins) },
      trade: {
        price: ins === '900001' ? 10_200 : 70,
        second: at146.second - 1,
        value: ins === '900001' ? 500_000_000 : 50_000_000,
      },
    }),
  });
  const load = (extra = {}, gateOpts = {}) => loadMomentContracts(session146, at146, {
    days: [at146.date],
    universe: async () => ({ archived: true, rows: rows146 }),
    makeGate: () => fakeGate(gateOpts),
    ...extra,
  });

  const out146 = await load();
  check('قراردادهای آن تاریخ به دست می‌آیند',
    out146.ok && out146.rows.length === rows146.length * 2, out146.why);
  check('هر ردیف هویت کامل دارد',
    out146.rows.every((row) => row.ins && (row.kind === 'call' || row.kind === 'put')
      && row.strike > 0 && row.expiry === 20260620 && row.size === 1000));
  check('قیمت لحظه‌ای از میدان واقعی markAt خوانده می‌شود، نه close روزانه',
    out146.spot === 10_200
    && out146.rows.every((row) => row.close === 70 && row.trade?.price === 70));

  // ── بند ۳: مستقیم به سازندهٔ عکس ────────────────────────────────────
  // شکل دوم یعنی هر مصرف‌کننده باید هر دو را بشناسد.
  const snap146 = portfolioMomentSnapshot(session146, at146,
    { spot: out146.spot, rows: out146.rows });
  check('خروجی مستقیم به سازندهٔ عکس داده می‌شود',
    snap146.ok && snap146.snapshot.contracts.length === out146.rows.length,
    snap146.why);
  check('و عکسِ حاصل قیمت دارد، نه فهرستِ تهی',
    snap146.snapshot.contracts.some((row) => row.quote.book !== null)
    && snap146.snapshot.spot === 10_200);

  // ── بند ۱: فهرست از بایگانی همان تاریخ ──────────────────────────────
  // فهرستِ امروز به‌جای بایگانی، سوگیری بقاست: قراردادی که سررسید شده
  // اصلاً دیده نمی‌شود.
  const notArchived146 = await load({ universe: async () => ({ archived: false, rows: rows146 }) });
  check('فهرستِ غیربایگانی صریح علامت می‌خورد',
    notArchived146.archived === false
    && notArchived146.warnings.some((w) => w.includes('بایگانی')),
    notArchived146.warnings.join(' | '));
  check('و فهرستِ بایگانی هشدارِ بی‌مورد نمی‌سازد',
    out146.archived === true
    && !out146.warnings.some((w) => w.includes('بایگانی')));
  const code146 = readSrc('../ui/portfolio-snapshot-data.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('واکشی فهرست همیشه تاریخ‌دار است',
    /universe\?date=\$\{encodeURIComponent/.test(code146));

  // ── بند ۴: شکستِ واکشی صریح ─────────────────────────────────────────
  const broken146 = await load({
    universe: async () => { throw new Error('سرور جواب نداد'); },
  });
  check('شکستِ واکشی خاموش ادامه نمی‌دهد',
    broken146.ok === false && broken146.rows.length === 0
    && broken146.warnings.some((w) => w.includes('سرور جواب نداد')),
    broken146.warnings.join(' | '));
  check('و علتش در متن می‌ماند', broken146.why.length > 0);
  const blind146 = await load({}, { blind: true });
  check('وقتی هیچ قراردادی قیمت نگیرد، صریح گفته می‌شود',
    blind146.warnings.some((w) => w.includes('هیچ‌کدام')),
    blind146.warnings.join(' | '));
  check('ولی ردیف‌ها حذف نمی‌شوند — سازندهٔ عکس خودش «فاقد داده» می‌زند',
    blind146.rows.length === out146.rows.length
    && blind146.rows.every((row) => row.book === null && row.close === null));
  check('نبودِ قیمت پایه هم علامت می‌خورد',
    blind146.spot === null
    && blind146.warnings.some((w) => w.includes('قیمت پایه')));
  check('نماد پایهٔ نامعلوم، واکشی نمی‌کند',
    (await loadMomentContracts({ ...session146, baseIns: '' }, at146, {}))
      .ok === false);

  // ── بند ۵: کرانهٔ صریح ──────────────────────────────────────────────
  // زنجیرهٔ واقعی صدها قرارداد دارد و واکشیِ همه تب را می‌بندد.
  const bounded146 = await load({ limit: 4 });
  check('کرانهٔ واکشی رعایت می‌شود',
    bounded146.rows.length === 4 && bounded146.dropped === 6,
    `${bounded146.rows.length} / ${bounded146.dropped}`);
  check('و کنارگذاشتن پنهان نمی‌ماند',
    bounded146.warnings.some((w) => w.includes('کرانهٔ واکشی')),
    bounded146.warnings.join(' | '));
  // نزدیک‌ترین اعمال‌ها به قیمت پایه می‌مانند؛ اعمالِ خیلی دور نه
  // نقدشونده است نه انتخاب می‌شود.
  check('نزدیک‌ترین اعمال‌ها به قیمت پایه می‌مانند',
    bounded146.rows.every((row) => Math.abs(row.strike - 10_200) <= 500),
    bounded146.rows.map((r) => r.strike).join('، '));
  check('کرانهٔ پیش‌فرض عددِ صریح است، نه «هرچه شد»',
    Number.isInteger(DEFAULT_CONTRACT_LIMIT) && DEFAULT_CONTRACT_LIMIT > 0
    && new RegExp(`DEFAULT_CONTRACT_LIMIT = ${DEFAULT_CONTRACT_LIMIT}`).test(code146));
  check('فهرستِ کوتاه‌تر از کرانه، چیزی از دست نمی‌دهد',
    out146.dropped === 0 && !out146.warnings.some((w) => w.includes('کرانهٔ واکشی')));

  // ── بند ۲: قیمت با روز قبل پر نمی‌شود ───────────────────────────────
  check('لایه خودش قیمتی نمی‌سازد',
    !/previous|lastKnown|carryForward|\|\|\s*0\.\d/.test(code146)
    && !/close:\s*[^n]/.test(code146.replace(/close: null/g, '')));

  // ── بند ۶: از سر تا ته ──────────────────────────────────────────────
  // این همان شکافی است که تا امروز باز بود: عکس شروع در برنامهٔ زنده
  // اصلاً `contracts` نداشت.
  const tabSrc146 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب این لایه را در ساخت عکس شروع صدا می‌زند',
    /loadMomentContracts\(session, at, \{ days: dates \}\)/.test(tabSrc146));
  check('و هر سه میدانِ لازمِ موتورها را در عکس می‌گذارد',
    /spot: priced\.spot/.test(tabSrc146)
    && /contracts: priced\.rows\.map/.test(tabSrc146)
    && /capitalInputs: \{/.test(tabSrc146));
  check('نرخ کارمزد و پارامتر تضمین از تنظیمات قفل می‌شوند',
    /feesOf\(settings\)/.test(tabSrc146) && /marginParamsOf\(settings\)/.test(tabSrc146));
  check('هشدارهای این لایه به کیفیت عکس شروع می‌رسند',
    /priced\.warnings\.length\) failures\.push\(\.\.\.priced\.warnings\)/.test(tabSrc146));
  // شکل قرارداد باید همان شکلی باشد که موتورها می‌خوانند.
  check('شکل قرارداد در عکس همان شکل مصرفیِ موتورهاست',
    /optionDailyValueRial: valueRial\(row\.trade\?\.value\)/.test(tabSrc146)
    && /quote: row\.quote/.test(tabSrc146));
}
