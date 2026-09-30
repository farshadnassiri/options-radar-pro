// ۳۰۶. مقایسهٔ یک قرارداد با هم‌زنجیره‌هایش (تب «مقایسه در زنجیره»)
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۰۸): «هر قرارداد در قیاس با سایر قراردادهای
// همان زنجیره سنجیده شود… بهترند یا بدتر؟» و رتبه در ارزش، حجم، موقعیت باز،
// خوش‌معاملگی، گرانی و ارزانی. تصمیم‌ها: گروه قابل انتخاب (پیش‌فرض
// هم‌سررسید و هم‌نوع) و دیدگاه خرید/فروش با کاربر.
//
// ورودی هم‌شکل ردیف واقعی داشبورد است و یک بار از JSON رد می‌شود.

import { check, group, readSrc } from '../harness.mjs';
import {
  PEER_MODES, COMPARE_METRICS, peerGroup, fitSmile, rankMetric, enrichPeers, chainScorecard,
} from '../../core/chain-compare.mjs';
import { reviveDashboardUniverse } from '../../core/decision-dashboard.mjs';
import { compareRankHtml, compareVerdictHtml, compareAltHtml, metricText } from '../../ui/chain-compare-view.mjs';

const S = 80000;
const row = (i, over = {}) => ({
  ins: `C${i}`, name: `ضفزر${i}`, kind: 'call', uaIns: 'U1', endDate: 20261020, days: 20,
  strike: 60000 + i * 5000, size: 1000, spot: S, last: 5000 + i * 100, close: 5000, yday: 4800,
  bid: 4900, ask: 5100, bidQty: 10 + i, askQty: 20 - i, spreadPct: 1 + i, mid: 5000,
  volume: 100 * i, trades: 10 * i, value: 1e9 * i, oi: 50 * i, oiYday: 40 * i, oiChange: 10 * i,
  ivPct: 40 + (i - 4) ** 2, ivMidPct: 40 + (i - 4) ** 2, premiumPctSpot: 6, changePct: 1,
  ...over,
});
const base = [1, 2, 3, 4, 5, 6, 7].map((i) => row(i));
const wire = (rows) => reviveDashboardUniverse(JSON.parse(JSON.stringify({ contracts: rows }))).contracts;

group('۳۰۶. گروه مقایسه');
{
  const all = [...base,
    row(8, { ins: 'P1', kind: 'put', name: 'طفزر1' }),
    row(9, { ins: 'L1', endDate: 20261120, days: 50, name: 'ضفزر-دور' }),
    row(10, { ins: 'X1', uaIns: 'U2', name: 'دیگری' })];
  const focus = all[3];
  const ids = (mode) => peerGroup(all, focus, mode).map((r) => r.ins).join(',');
  check('پیش‌فرض: هم‌پایه، هم‌سررسید، هم‌نوع', ids('expiry-kind') === 'C1,C2,C3,C4,C5,C6,C7');
  check('همهٔ سررسیدها، هم‌نوع: سررسید دور می‌آید، پوت و پایهٔ دیگر نه',
    ids('ua-kind').includes('L1') && !ids('ua-kind').includes('P1') && !ids('ua-kind').includes('X1'));
  check('هم‌سررسید، کال و پوت: پوت هم هست', ids('expiry-both').includes('P1') && !ids('expiry-both').includes('L1'));
  check('حالت ناشناخته همان پیش‌فرض است', ids('bogus') === ids('expiry-kind') && PEER_MODES[0][0] === 'expiry-kind');
}

group('۳۰۶. رتبه، صدک و جهت دیدگاه');
{
  const rows = enrichPeers(wire(base), { perspective: 'buy', params: { yearDays: 365 } });
  const value = rankMetric(rows, 'C4', 'value', 'buy');
  check('ارزش معامله: بزرگ‌تر بهتر، رتبهٔ ۴ از ۷ با صدک ۵۰', value.rank === 4 && value.known === 7 && value.percentile === 50);
  const spread = rankMetric(rows, 'C2', 'spreadPct', 'buy');
  check('فاصلهٔ مظنه: کوچک‌تر بهتر — دومین تنگ‌ترین رتبهٔ ۲ است و «بهتر»', spread.rank === 2 && spread.verdict === 'better');
  const ivBuy = rankMetric(rows, 'C1', 'ivMidPct', 'buy');
  const ivSell = rankMetric(rows, 'C1', 'ivMidPct', 'sell');
  check('تلاطم بالا برای خریدار بد است و برای فروشنده خوب',
    ivBuy.verdict === 'worse' && ivSell.verdict === 'better' && Math.abs(ivBuy.percentile + ivSell.percentile - 100) < 1e-9);
  const neutral = rankMetric(rows, 'C4', 'oiChange', 'buy');
  check('سنجهٔ خنثی رتبه دارد ولی حکم «بهتر/بدتر» نمی‌گیرد', neutral.rank === 4 && neutral.verdict === 'neutral');
  const holed = enrichPeers(wire(base.map((r) => (r.ins === 'C4' ? { ...r, ivMidPct: NaN, ivPct: NaN } : r))), { params: { yearDays: 365 } });
  const unknown = rankMetric(holed, 'C4', 'ivMidPct', 'buy');
  check('IV نامعلوم پس از JSON رتبه نمی‌گیرد و صفر شمرده نمی‌شود',
    unknown.rank === null && unknown.verdict === 'unknown' && unknown.known === 6);
  // بی مرزِ احیا هم: ردیفِ خامِ JSON که IV نامعلومش `null` است.
  const rawJson = JSON.parse(JSON.stringify(base.map((r) => (r.ins === 'C4' ? { ...r, ivMidPct: NaN, ivPct: NaN } : r))));
  const rawRank = rankMetric(enrichPeers(rawJson), 'C4', 'ivMidPct', 'buy');
  check('حتی JSON خام: `null` صفر خوانده نمی‌شود', rawRank.rank === null && rawRank.known === 6);
  const sellRows = enrichPeers(wire(base), { perspective: 'sell' });
  check('عمق سمت اجرا: خریدار عرضه را می‌بیند، فروشنده تقاضا را',
    rows.find((r) => r.ins === 'C2').execQty === 18 && sellRows.find((r) => r.ins === 'C2').execQty === 12);
}

group('۳۰۶. منحنی لبخند: گران و ارزانِ نسبی');
{
  const exact = fitSmile([-0.2, -0.1, 0, 0.1, 0.2].map((x) => ({ x, y: 30 + 2 * x + 50 * x * x })));
  check('سهمی دقیق بازسازی می‌شود', exact && exact.degree === 2 && Math.abs(exact.at(0.15) - (30 + 0.3 + 50 * 0.0225)) < 1e-9);
  check('کمتر از دو نقطه، منحنی نیست', fitSmile([{ x: 0, y: 1 }]) === null);
  const bumped = base.map((r) => (r.ins === 'C5' ? { ...r, ivMidPct: r.ivMidPct + 8 } : r));
  const rows = enrichPeers(wire(bumped), { params: { yearDays: 365 } });
  const c5 = rows.find((r) => r.ins === 'C5');
  check('قراردادِ بالای منحنی فاصلهٔ مثبت دارد (گران)', c5.ivResidualPct > 3, String(c5.ivResidualPct));
  check('و از دید خریدار بدترین، از دید فروشنده بهترین است',
    rankMetric(rows, 'C5', 'ivResidualPct', 'buy').rank === 7 && rankMetric(rows, 'C5', 'ivResidualPct', 'sell').rank === 1);
  const twoExpiries = enrichPeers(wire([...base, row(9, { ins: 'L1', endDate: 20261120, days: 50, ivMidPct: 90 })]));
  check('منحنی هر سررسید جداست — سررسید دیگر منحنیِ این سررسید را کج نمی‌کند',
    Math.abs(twoExpiries.find((r) => r.ins === 'C5').ivFitPct - rows.find((r) => r.ins === 'C5').ivFitPct) < 3);
}

group('۳۰۶. کارنامه و جایگزین‌ها');
{
  check('قرارداد نیامده کارنامه نمی‌سازد', chainScorecard(wire(base), 'ZZ').ok === false);
  const card = chainScorecard(wire(base), 'C2', { perspective: 'buy', params: { yearDays: 365 } });
  check('کارنامه همهٔ سنجه‌ها و سه گروه را دارد',
    card.ok && card.metrics.length === COMPARE_METRICS.length && card.groups.length === 3 && card.rows.length === 7);
  check('رتبهٔ کلی از تعداد معلوم‌ها بیرون نمی‌زند', card.overall.rank >= 1 && card.overall.rank <= card.overall.of);
  check('هر جایگزین امتیاز کلیِ بالاتری دارد و دلیل «بهتر در» دارد',
    card.alternatives.length > 0 && card.alternatives.every((a) => a.score > card.overall.score && a.betterIn.length > 0));
  check('امتیاز هر ردیف در همین گروه برای جدول هست', Object.keys(card.scores).length === 7
    && Math.abs(card.scores.C2 - card.overall.score) < 1e-9);
  const sell = chainScorecard(wire(base), 'C2', { perspective: 'sell', params: { yearDays: 365 } });
  check('برگرداندنِ دیدگاه حکم گرانی را برمی‌گرداند',
    card.groups.find((g) => g.id === 'valuation').score + sell.groups.find((g) => g.id === 'valuation').score > 99
    && card.groups.find((g) => g.id === 'valuation').score !== sell.groups.find((g) => g.id === 'valuation').score);

  const rank = compareRankHtml(card);
  check('جدول رتبه یک ردیف برای هر سنجه و سرگروه دارد',
    (rank.match(/<tr data-tone=/g) || []).length === COMPARE_METRICS.length && rank.includes('گرانی و ارزانی'));
  check('حکم با متن گفته می‌شود، نه فقط رنگ', /بهتر از بیشترِ زنجیره|بدتر از بیشترِ زنجیره|میانهٔ زنجیره/.test(rank)
    && compareVerdictHtml(card).includes('رتبهٔ'));
  check('جایگزین قابل کلیک است و «بهتر در/بدتر در» دارد',
    compareAltHtml(card).includes('data-cc-pick=') && compareAltHtml(card).includes('بهتر در:'));
  check('واحدها: ارزش ریال (بزرگ‌ها میلیون ریال)، درصد با ٪',
    metricText('value', 4e9) === '۴,۰۰۰ میلیون ریال' && metricText('spreadPct', 2.5) === '۲٫۵۰٪' && metricText('value', NaN) === '—');
}

group('۳۰۶. اتصال به رصد لحظه‌ای');
{
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('تب «مقایسه در زنجیره» کنار نقشه ثبت شده',
    dash.includes("{ id: 'compare', title: 'مقایسه در زنجیره'") && dash.includes('if (mode?.compare) { compare().paint(); return; }'));
  check('انتخاب از همان نقشه می‌آید و به همان برمی‌گردد (یک منبع انتخاب)',
    dash.includes('getSelection: () => marketExplorer.selection()') && dash.includes('marketExplorer.pickContract(row)'));
  const map = readSrc('../ui/live-market-map.mjs');
  check('نقشه انتخاب بیرونی را بی پرش صفحه می‌پذیرد', map.includes('pickContract(row) {'));
  const table = readSrc('../ui/table.mjs');
  const css = readSrc('../ui/style.css');
  check('ردیف کانون در جدول نشان دارد و رنگش از توکن است',
    table.includes("if (r.__focus) return 'focus';") && /tr\.focus \{[^}]*var\(--accent-soft\)[^}]*var\(--accent\)/.test(css));
}
