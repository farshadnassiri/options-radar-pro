// ۱۸۶. صفرِ مشاهده‌شده با نبودِ داده یکی نیست

import { check, group, readSrc } from '../harness.mjs';
import { portfolioEligibility } from '../../core/portfolio-eligible.mjs';

const tab186 = readSrc('../ui/tabs/portfolio-time.mjs');
const data186 = readSrc('../ui/portfolio-snapshot-data.mjs');

const quality = (kind) => ({
  version: 1, kind, label: kind,
  observed: kind === 'observed', executable: kind === 'executable',
  estimated: false, missing: kind === 'missing',
  source: 'test', asOf: { date: 14050601, second: 39600 },
  sufficient: kind !== 'missing', stale: false, reason: '', reasons: [], details: {},
});

const mission = {
  version: 1, id: 'm1', context: {},
  liquidity: {
    minUnderlyingDailyValueRial: 1000, minOptionDailyValueRial: 1000,
    minOpenInterest: 0, maxSpreadPct: 50, maxBookTakePct: 50, requireFullBook: false,
  },
};

const candidate = (optionValue) => ({
  id: 'c1', side: 'buy', quality: quality('observed'),
  underlyingDailyValueRial: 5000, optionDailyValueRial: optionValue,
  quote: {
    quality: quality('executable'),
    book: [{ bidPrice: 100, bidQty: 10, askPrice: 101, askQty: 10 }],
  },
});

const codesFor = (value) => {
  const verdict = portfolioEligibility(mission, [candidate(value)], { now: { date: 14050601, second: 39600 } });
  return verdict.ok ? (verdict.results[0].reasons || []).map((row) => row.code) : ['NOT_OK'];
};

group('۱۸۶. صفرِ مشاهده‌شده در برابر نبودِ داده');
{
  // موتور از اول این دو را جدا می‌کرد؛ رابط بود که یکی‌شان می‌کرد.
  check('قراردادِ معامله‌نشده «کمتر از کف» است، نه «موجود نیست»',
    codesFor(0).includes('optionValueLow') && !codesFor(0).includes('optionValueMissing'));
  check('نبودِ واقعی عدد همچنان «موجود نیست» می‌ماند',
    codesFor(null).includes('optionValueMissing') && !codesFor(null).includes('optionValueLow'));

  // `Number(0) || null` صفر را به `null` می‌انداخت، پس هر قراردادِ
  // معامله‌نشده به‌دروغ «فاقد داده» گزارش می‌شد و کاربر دنبال خرابیِ خوراک
  // می‌گشت. خط `openInterest` از اول درست بود و حالا هر سه یک‌شکل‌اند.
  check('ارزش ریالی عکس با نگهبان عدد ساخته می‌شود، نه با `|| null`',
    tab186.includes('const valueRial = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);')
    && tab186.includes('underlyingDailyValueRial: valueRial(')
    && tab186.includes('optionDailyValueRial: valueRial(row.trade?.value),'));
  check('هیچ ارزش ریالی عکس دیگر با `|| null` صفر را دور نمی‌ریزد',
    !/(?:underlying|option)DailyValueRial: Number\([^)]*\) \|\| null/.test(tab186));

  // شکستِ واکشی و «معامله‌ای نشد» هر دو `[]` می‌دادند و از هم جدا نبودند.
  check('شکست هر لودر ثبت می‌شود، نه اینکه بی‌صدا به فهرست خالی تبدیل شود',
    data186.includes('const loadFailures = new Map();')
    && data186.includes('catch (error) { noteFailure(kind, error); return []; }'));
  check('علتِ شکستِ واکشی در هشدارهای عکس گزارش می‌شود',
    data186.includes('for (const [kind, why] of loadFailures) {')
    && data186.includes('نبودِ داده در این عکس لزوماً یعنی «نرسید»، نه «نبود»'));
  check('هر سه لودر از همان نگهبان رد می‌شوند',
    data186.includes("dailies: guarded('روزانه', loaders.dailies),")
    && data186.includes("trades: guarded('ریزمعامله', loaders.trades),")
    && data186.includes("book: guarded('دفتر سفارش', loaders.book),"));

  // برچسب «روزانه» گمراه‌کننده بود: عدد سنجیده‌شده تجمعی تا لحظهٔ شروع است
  // (عمدی، تا نقدشوندگیِ ساعت ده با عدد پایان روز بیش‌برآورد نشود). حالا
  // برچسب همان چیزی را می‌گوید که واقعاً سنجیده می‌شود.
  check('برچسب دو کف نقدشوندگی «تا لحظهٔ شروع» است، نه «روزانه»',
    tab186.includes('حداقل ارزش معامله‌شدهٔ نماد پایه تا لحظهٔ شروع')
    && tab186.includes('حداقل ارزش معامله‌شدهٔ اختیار تا لحظهٔ شروع')
    && !tab186.includes('حداقل ارزش روزانه نماد پایه')
    && !tab186.includes('حداقل ارزش روزانه اختیار'));
  check('راهنما می‌گوید عدد تجمعی است و برای شروع زودهنگام کف باید کوچک‌تر باشد',
    tab186.includes('ارزش از ابتدای جلسه تا همان لحظهٔ شروع جمع می‌شود، نه کل روز'));
}
