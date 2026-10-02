// ۳۱۳. زمینهٔ تلاطم در نماهای تاریخی
//
//   الف  روزِ همان تاریخ، یا آخرین روز پیش از آن تا یک هفته (حمل‌شده)؛ هرگز
//        روزی از بعد (آ۴)؛ رتبه و صدک همان ردیف از روزهای پیش از خودش
//   ب    «پس‌نگری» جداست: تحقق‌یافتهٔ بعدی در زمینه نمی‌نشیند، فقط در
//        `hindsight`، و رابط نامش را می‌گوید
//   ج    گروه‌بندی نتیجه با پلهٔ تلاطم ورود
//   د    سیم‌کشی: آزمایشگاه، تحلیل تاریخی، آزمون همه، خروجی، موقعیت‌ها

import { check, group, near, readSrc } from '../harness.mjs';
import { volRankSeries, volParams } from '../../core/vol-rank.mjs';
import { volContextAt, volContextBetween, regimeBuckets } from '../../core/vol-context.mjs';

// تاریخچهٔ ساختگی به شکل خروجی `buildVolHistory`: ۴۰ روز کاری با IV صعودی.
const dates = [];
{
  const d = new Date(Date.UTC(2026, 6, 1));
  while (dates.length < 40) {
    if (![4, 5].includes(d.getUTCDay())) dates.push(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
const iv = dates.map((_, i) => (i === 12 ? NaN : 30 + i));
const params = volParams({ lookback: 20 });
const ranks = volRankSeries(iv, params);
const history = {
  params,
  rows: dates.map((date, i) => ({
    date, ivPct: iv[i], ivr: ranks[i].ivr, ivp: ranks[i].ivp, hvMatch: 25, hvp: 50, spread: iv[i] - 25, ratio: iv[i] / 25, spot: 1000,
    flags: [], fwdRv: 99, fwdEdge: iv[i] - 99, why: Number.isFinite(iv[i]) ? 'ok' : 'noPanel',
  })),
};

group('۳۱۳-الف. زمینه در یک روز');
{
  const at = volContextAt(history, dates[35]);
  check('روز همان تاریخ', at.ok && at.date === dates[35] && !at.carried && at.ivPct === 65);
  check('رتبه همان ردیف (فقط از روزهای قبل): صعودی → IVR ۱۰۰', near(at.ivr, 100, 1e-9) && at.regime.id === 'very-high');
  const gap = volContextAt(history, dates[12]);
  check('روز بی‌شاخص → آخرین روز پیش از آن، حمل‌شده', gap.ok && gap.date === dates[11] && gap.carried && gap.ivPct === 41);
  check('آ۴ هرگز روزی از بعد: روز پیش از نخستین ردیف خالی است', !volContextAt(history, 20260601).ok && volContextAt(history, 20260601).why === 'noIndexBefore');
  check('کهنه‌تر از یک هفته: خالی با علت', volContextAt(history, 20261201).why === 'tooOld');
  check('بی تاریخچه: علت «ساخته نشده»', volContextAt({ rows: [] }, dates[0]).why === 'noHistory');
  const between = volContextBetween(history, dates[20], dates[30]);
  check('ورود و خروج و تغییر', between.entry.ivPct === 50 && between.exit.ivPct === 60 && between.ivChange === 10);
}

group('۳۱۳-ب. پس‌نگری جداست');
{
  const at = volContextAt(history, dates[5]);
  check('تحقق‌یافتهٔ بعدی فقط در hindsight', at.hindsight.fwdRv === 99 && !('fwdRv' in at) && !('fwdEdge' in at));
  const ui = readSrc('../ui/vol-context.mjs');
  check('نوار آن را «پس‌نگری» می‌نامد و جدا می‌کشد', ui.includes('VOL_HINDSIGHT_LABEL') && ui.includes('vc-hindsight'));
  check('برگ خروجی ستون پس‌نگری را با نام جدا دارد', ui.includes('`${VOL_HINDSIGHT_LABEL}: تحقق‌یافتهٔ روزهای بعد ٪`'));
  const rank = readSrc('../ui/vol-rank-view.mjs');
  check('تب رتبه هم نمودار و ستون‌های آینده را «پس‌نگری» می‌نامد', (rank.match(/پس‌نگری/g) || []).length >= 4);
  const lab = readSrc('../ui/tabs/backtest.mjs');
  check('آزمایشگاه هنگام انتخاب ورود پس‌نگری نشان نمی‌دهد', lab.includes("entry, settings: state.settings, hindsight: false"));
}

group('۳۱۳-ج. نتیجه بر حسب وضعیت ورود');
{
  const rows = regimeBuckets([
    { regimeId: 'low', value: 2 }, { regimeId: 'low', value: -1 }, { regimeId: 'very-high', value: 5 },
    { regimeId: 'unknown', value: 3 }, { regimeId: 'bogus', value: NaN },
  ]);
  const low = rows.find((r) => r.id === 'low');
  check('میانگین و درصد سودده هر پله', low.n === 2 && near(low.mean, 0.5, 1e-9) && near(low.winPct, 50, 1e-9));
  check('پلهٔ بی‌نتیجه نمی‌آید؛ نامعلوم جدا', !rows.some((r) => r.id === 'mid') && rows.some((r) => r.id === 'unknown' && r.n === 1));
  check('ترتیب از ارزان به گران', rows.map((r) => r.id).join() === 'low,very-high,unknown');
}

group('۳۱۳-د. سیم‌کشی');
{
  const lab = readSrc('../ui/tabs/backtest.mjs');
  check('آزمایشگاه: ورود/خروج نتیجه و روز ورود', lab.includes("paintVolContext($('bt-vol-context')") && lab.includes("paintVolContext($('bt-entry-vol')"));
  const hist = readSrc('../ui/tabs/history.mjs');
  check('تحلیل تاریخی: نوار موقعیت، خانهٔ ماتریس، و جدول وضعیت ورود', hist.includes("host.querySelector('[data-frozen-vol]')") && hist.includes("host.querySelector('[data-trade-vol]')") && hist.includes('renderVolRegime(result)'));
  check('خروجی ماتریس ستون‌های تلاطم ورود دارد', hist.includes("['IVP ورود',") && hist.includes("['وضعیت تلاطم ورود',"));
  const pb = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('آزمون همه استراتژی‌ها: زمینهٔ تلاطم بازه', pb.includes("paintVolContext($('pb-vol-context')"));
  const de = readSrc('../ui/tabs/data-export.mjs');
  check('خروجی دیتا: برگ تلاطم هر پایه', de.includes('...await volSheets(prepared)') || de.includes('const vol = await volSheets(prepared);'));
  const pos = readSrc('../ui/tabs/positions.mjs');
  check('موقعیت‌ها: تلاطم ورود در برابر امروز، فقط با عوض‌شدن موقعیت', pos.includes("if (!sameRow) paintVolContext(root.querySelector('#det-vol')"));
  const ctx = readSrc('../ui/vol-context.mjs');
  check('زمینه هیچ ساختی آغاز نمی‌کند (build=0)', ctx.includes('&build=0') && !ctx.includes('build=1'));
  check('همان پارامترهای تب رتبه (یک عدد همه‌جا)', ctx.includes("localStorage?.getItem('options-radar:vol-rank')"));
}
