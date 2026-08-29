// ۱۸۷. نماد پایه در سند با نام شناخته می‌شود، نه فقط با کد

import { check, group, readSrc } from '../harness.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';
import { loadMomentContracts } from '../../ui/portfolio-snapshot-data.mjs';

const tab187 = readSrc('../ui/tabs/portfolio-time.mjs');
const export187 = readSrc('../ui/portfolio-dossier-export.mjs');

group('۱۸۷. نامِ نماد پایه در سند');
{
  const fx187 = portfolioFixture('base-name-187');
  const at187 = fx187.at;
  const session187 = { ...fx187.session, baseIns: '900001' };

  const rowsWith = (uaName) => [{
    uaInsCode: '900001', lval30_UA: uaName, pClosing_UA: 10_200,
    strikePrice: 10_000, remainedDay: 30, endDate: 20260620, contractSize: 1000,
    insCode_C: 'call-10000', lVal18AFC_C: 'ض10000', pClosing_C: 70,
    insCode_P: 'put-10000', lVal18AFC_P: 'ط10000', pClosing_P: 80,
  }];
  const fakeGate = () => ({
    snapshot: async (ins) => ({
      quote: { book: null },
      trade: { price: ins === '900001' ? 10_200 : 70, second: at187.second - 1, value: 0 },
    }),
  });
  const loadWith = (uaName) => loadMomentContracts(session187, at187, {
    days: [at187.date],
    universe: async () => ({ archived: true, rows: rowsWith(uaName) }),
    makeGate: fakeGate,
  });

  const named = await loadWith('اهرم');
  check('نام نماد پایه از زنجیرهٔ همان تاریخ خوانده می‌شود',
    named.baseName === 'اهرم', String(named.baseName));

  // ── جانشینِ رابط نباید به سند نشت کند ───────────────────────────────
  // `buildChain` وقتی تابلو نامی نداده رشتهٔ «دارایی پایه بدون نام» می‌گذارد
  // تا منو خالی نماند. اگر همان رشته در پرونده ثبت شود، خواننده‌ای که
  // ماه‌ها بعد بازش می‌کند آن را نامِ واقعی می‌خواند.
  const unnamed = await loadWith('');
  check('نبودِ نام روی تابلو، `null` می‌ماند و جانشینِ منو ثبت نمی‌شود',
    unnamed.baseName === null, String(unnamed.baseName));

  const echoed = await loadWith('900001');
  check('نامی که فقط تکرارِ کد است، نام حساب نمی‌شود',
    echoed.baseName === null, String(echoed.baseName));

  check('نبودِ نماد پایه هم همان میدان را با `null` برمی‌گرداند',
    (await loadMomentContracts({ ...session187, baseIns: '' }, at187, {})).baseName === null);

  // ── مسیر رسیدنش به عکس شروع ─────────────────────────────────────────
  check('عکس شروع نام را از همان واکشی برمی‌دارد و چیزی حدس نمی‌زند',
    /baseName: priced\.baseName \?\? null/.test(tab187));

  // ── سند ───────────────────────────────────────────────────────────
  check('سند نام را از عکس شروع می‌خواند، نه از فهرست امروز',
    /function baseNameOf\(session\) \{\s*\n\s*return text\(session\?\.startSnapshot\?\.baseName\);/.test(export187));
  check('سرشناسه وقتی نام ثبت نشده، «نامعلوم» می‌نویسد نه نامی ساختگی',
    /'نام نماد پایه', baseNameOf\(session\) \|\| 'نامعلوم — نام در پرونده ثبت نشده'/.test(export187));
  check('برگهٔ عکس شروع علتِ نبودِ نام را در ستون خودش می‌گذارد',
    /baseNameOf\(session\) \? '' : 'نام در زنجیرهٔ آن تاریخ نبود'/.test(export187));
}
