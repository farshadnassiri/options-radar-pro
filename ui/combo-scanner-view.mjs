// نمای «اسکنر آپشن» — فقط رشتهٔ HTML و SVG، بی DOM، تا در نود هم آزموده شود.
// رابط در `ui/tabs/combo-scanner.mjs`، موتور در `core/combo-scanner.mjs`.
//
// دور دوم خواسته‌های صاحب پروژه (۱۴۰۵/۰۷/۱۳):
//   • فاصله تا سربه‌سر با درصدش روی کارت
//   • با چه حجمی می‌شود اجرا کرد و ارزش ریالی‌اش؛ و پلکان دفتر سفارش:
//     «ممکن است با برخی سطرهایش فقط درصد خوبی به دست آید»
//   • سود و زیان بازه‌ای و شرطی، گرافیکی و تعاملی
//   • نمودار کوچک دقیق (پیش از این ۳۳ نقطهٔ نمونه بود و شکستگی‌ها را گم
//     می‌کرد، و شناسهٔ clipPath کارت‌های هم‌نماد یکی بود و رنگ کارت دیگری
//     روی این کارت می‌افتاد)

import { fmt, faDigits, faNum } from './fmt.mjs';
import { curveAt } from '../core/combo-scanner.mjs';
import { helpIcon } from './combo-scanner-help.mjs';

export const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
export const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const pct = (v, d = 1) => (fin(v) ? `${faNum(v.toFixed(d))}٪` : '—');
/** درصد علامت‌دار: «+۹٫۹٪» یا «−۶٫۲٪». */
export const spct = (v, d = 1) => (fin(v) ? `${v > 0 ? '+' : ''}${faNum(v.toFixed(d))}٪` : '—');
export const tone = (v) => (!fin(v) ? '' : v > 0 ? 'gain' : v < 0 ? 'loss' : '');
export const MILLION = 1e6;

/** ریال کوتاه برای کاشی به میلیون ریال: «۶٫۳ M»، زیر یک میلیون «۰٫۲۹ M»؛ عدد کامل ریالی در راهنمای هاور. */
export const shortRial = (v) => {
  if (!fin(v)) return '—';
  if (Math.abs(v) >= MILLION) return `${faNum((v / MILLION).toFixed(1))} M`;
  if (Math.abs(v) >= 1000) return `${faNum((v / MILLION).toFixed(2))} M`;
  return fmt.rialText(v);
};
const signedRial = (v) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${shortRial(Math.abs(v))}` : '—');

export const SIDE_FA = { buy: 'خرید', sell: 'فروش' };
export const legLine = (l) => `<li class="cs-leg ${l.side}"><b>${SIDE_FA[l.side]}</b> ${faDigits(String(l.ratio))} ${l.kind === 'underlying' ? `سهم ${esc(faDigits(l.name || ''))}` : esc(faDigits(l.name || ''))} <span>به ${fmt.money(l.price)}</span></li>`;

/** «هر ست» به زبان ساده: همهٔ پاها با نسبت خودشان، یک بار. */
export function setText(r) {
  const size = r.ctx?.size || r.contractSizes?.[0];
  const legs = (r.legsCard || []).map((l) => `${SIDE_FA[l.side]} ${faDigits(String(l.ratio))} ${l.kind === 'underlying' ? 'برابر سهم' : 'قرارداد'} ${esc(faDigits(l.name || ''))}`).join(' + ');
  return `هر ست = ${legs}${size ? ` (هر قرارداد ${fmt.int(size)} سهم)` : ''}`;
}

// ═════════════════════════ بازهٔ نمایش و منحنی ═════════════════════════

/** بازهٔ قیمتی که نمودار و خط‌کش نشان می‌دهند: دست‌کم ±۲۰٪، همهٔ سربه‌سرها و قیمت‌های اعمال نزدیک. */
export function priceWindow(r) {
  const S = r.spot;
  const marks = [...(r.beList || []).map((b) => b.price), ...(r.legsCard || []).filter((l) => l.kind !== 'underlying').map((l) => l.strike)]
    .filter((x) => x > S * 0.55 && x < S * 1.45);
  const lo = Math.max(S * 0.6, Math.min(S * 0.8, ...marks.map((x) => x * 0.96)));
  const hi = Math.min(S * 1.4, Math.max(S * 1.2, ...marks.map((x) => x * 1.04)));
  return { lo, hi };
}

/** نقاط دقیق منحنی در بازه: دو سر، همهٔ مرزهای تکه‌ها و سربه‌سرها. */
export function curvePoints(r, win = priceWindow(r)) {
  const xs = new Set([win.lo, win.hi]);
  for (const g of r.curve?.segs || []) {
    if (g.lo > win.lo && g.lo < win.hi) xs.add(g.lo);
    if (Number.isFinite(g.hi) && g.hi > win.lo && g.hi < win.hi) xs.add(g.hi);
  }
  for (const b of r.beList || []) if (b.price > win.lo && b.price < win.hi) xs.add(b.price);
  return [...xs].sort((a, b) => a - b).map((x) => [x, curveAt(r.curve, x)]);
}

/**
 * نمودار کوچک دقیق: تکه‌های خطیِ واقعی، ناحیهٔ سود سبز و زیان قرمز که در
 * ریشه‌ها بریده می‌شوند (بی clipPath — شناسهٔ مشترک بین کارت‌ها همان باگ
 * پیشین بود)، خط قیمت فعلی و تیک سربه‌سرها.
 */
export function sparkSvg(r, { w = 300, h = 64 } = {}) {
  if (!r?.curve?.segs?.length || !(r.spot > 0)) return '';
  const win = priceWindow(r);
  const pts = curvePoints(r, win).filter(([, y]) => fin(y));
  if (pts.length < 2) return '';
  const ys = pts.map(([, y]) => y);
  let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys);
  if (!(y1 > y0)) { y1 += 1; y0 -= 1; }
  const pad = (y1 - y0) * 0.08;
  y0 -= pad; y1 += pad;
  const X = (x) => ((x - win.lo) / (win.hi - win.lo)) * w;
  const Y = (y) => h - ((y - y0) / (y1 - y0)) * h;
  const zero = Y(0);
  // تکه‌تکه، بریده در صفر
  const polys = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    let [xa, ya] = pts[i];
    const [xb, yb] = pts[i + 1];
    if ((ya > 0 && yb < 0) || (ya < 0 && yb > 0)) {
      const xr = xa + ((xb - xa) * -ya) / (yb - ya);
      polys.push([xa, ya, xr, 0]);
      xa = xr; ya = 0;
    }
    polys.push([xa, ya, xb, yb]);
  }
  const area = polys.map(([xa, ya, xb, yb]) => {
    const cls = (ya + yb) / 2 >= 0 ? 'cs-spark-gain' : 'cs-spark-loss';
    return `<path class="${cls}" d="M${X(xa).toFixed(1)},${zero.toFixed(1)}L${X(xa).toFixed(1)},${Y(ya).toFixed(1)}L${X(xb).toFixed(1)},${Y(yb).toFixed(1)}L${X(xb).toFixed(1)},${zero.toFixed(1)}Z"/>`;
  }).join('');
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  const bes = (r.beList || []).filter((b) => b.price > win.lo && b.price < win.hi)
    .map((b) => `<line class="cs-spark-be" x1="${X(b.price).toFixed(1)}" x2="${X(b.price).toFixed(1)}" y1="${(zero - 6).toFixed(1)}" y2="${(zero + 6).toFixed(1)}"/>`).join('');
  return `<div class="cs-spark-box" data-cs-spark="${esc(r.id)}" data-lo="${win.lo}" data-hi="${win.hi}">
    <svg class="cs-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="منحنی سود و زیان سررسید">
      ${area}<line class="cs-spark-zero" x1="0" x2="${w}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}"/>
      ${bes}<line class="cs-spark-spot" x1="${X(r.spot).toFixed(1)}" x2="${X(r.spot).toFixed(1)}" y1="0" y2="${h}"/>
      <path class="cs-spark-line" d="${line}"/>
    </svg>
    <div class="cs-spark-axis"><span>${spct(((win.lo - r.spot) / r.spot) * 100, 0)}</span><span>قیمت فعلی ${helpIcon('card-spark')}</span><span>${spct(((win.hi - r.spot) / r.spot) * 100, 0)}</span></div>
  </div>`;
}

/** خوانش یک قیمت: «اگر به ۷٬۹۰۰ (−۲٫۵٪) برسد: سود ۱٫۲ M (۸٪ سرمایه)». */
export function readAt(r, S) {
  const v = curveAt(r.curve, S);
  const p = ((S - r.spot) / r.spot) * 100;
  const capPct = r.capital > 0 && fin(v) ? (v / r.capital) * 100 : NaN;
  return { price: S, movePct: p, pnl: v, capPct,
    text: `اگر ${faDigits(r.uaName || '')} در سررسید ${fmt.money(Math.round(S))} باشد (${spct(p)}): ${v >= 0 ? 'سود' : 'زیان'} ${fmt.rialText(Math.abs(v))}${fin(capPct) ? ` — ${spct(capPct)} سرمایه` : ''}` };
}

// ═════════════════════════ سناریوهای شرطی ═════════════════════════

const priceAndPct = (x, xPct) => `${fmt.money(Math.round(x))} (${spct(xPct)})`;

/**
 * سود و زیان به جمله‌های شرطی، بازه‌به‌بازه از پایین به بالا؛ هر جمله
 * علامت خودش را دارد تا رابط رنگش کند. بازه‌ای که کاملاً زیر نصف یا بالای
 * دو برابر قیمت فعلی است با بازهٔ کنارش یکی گفته می‌شود.
 */
export function scenarioLines(r) {
  const S = r.spot;
  const list = (r.scenarios || []).filter((p) => !(Number.isFinite(p.hi) && p.hi < S * 0.4));
  return list.map((p, i) => {
    const first = i === 0 || p.lo <= 0;
    const range = first && p.lo <= S * 0.4 ? `زیر ${priceAndPct(p.hi, p.hiPct)}`
      : p.open ? `بالای ${priceAndPct(p.lo, p.loPct)}`
        : `بین ${priceAndPct(p.lo, p.loPct)} و ${priceAndPct(p.hi, p.hiPct)}`;
    let outcome;
    const a = Math.abs(p.pnlLo), b = Math.abs(p.pnlHi);
    if (p.sign === 'zero') outcome = 'سربه‌سر';
    else if (p.trend === 'flat') outcome = `${p.sign === 'profit' ? 'سود ثابت' : 'زیان ثابت'} ${fmt.rialText(a)}`;
    else if (p.open && !Number.isFinite(p.pnlHi)) outcome = p.sign === 'profit' ? 'سود رو به افزایش، بی‌سقف' : 'زیان رو به افزایش';
    else outcome = `${p.sign === 'profit' ? 'سود' : 'زیان'} از ${fmt.rialText(Math.min(a, b))} تا ${fmt.rialText(Math.max(a, b))}`;
    const here = S >= p.lo && (S < p.hi || p.open);
    return { sign: p.sign, here, text: `${range}: ${outcome}${here ? ' — قیمت فعلی این‌جاست' : ''}` };
  });
}

/** جملهٔ کوتاه سربه‌سرها: «سربه‌سر ۷٬۶۰۰ (−۶٫۲٪) و ۸٬۹۰۰ (+۹٫۹٪)». */
export function breakevenText(r) {
  const list = r.beList || [];
  if (!list.length) return r.maxLoss <= 0 ? 'بی سربه‌سر — در همهٔ قیمت‌ها سود' : 'بی سربه‌سر';
  return list.slice(0, 3).map((b) => priceAndPct(b.price, b.pct)).join(' و ');
}

/**
 * خط‌کش سناریو: نوار افقی قیمت، هر بازه با رنگ سود یا زیان و شدتِ متناسب
 * با اندازه‌اش، سربه‌سرها با درصدشان، و نشانگر قیمت فعلی. `interactive`
 * یک لغزنده زیرش می‌گذارد که هر قیمتی را می‌خواند.
 */
export function rulerHtml(r, { interactive = false } = {}) {
  if (!r?.curve?.segs?.length) return '';
  const win = priceWindow(r);
  const W = (x) => ((Math.min(win.hi, Math.max(win.lo, x)) - win.lo) / (win.hi - win.lo)) * 100;
  const maxAbs = Math.max(1, ...curvePoints(r, win).map(([, y]) => Math.abs(y)).filter(fin));
  const bands = (r.scenarios || []).map((p) => {
    const a = W(p.lo), b = W(Number.isFinite(p.hi) ? p.hi : win.hi);
    if (b - a < 0.2) return '';
    const mid = Number.isFinite(p.hi) ? (Math.max(p.lo, win.lo) + Math.min(p.hi, win.hi)) / 2 : (Math.max(p.lo, win.lo) + win.hi) / 2;
    const strength = Math.min(1, Math.abs(curveAt(r.curve, mid)) / maxAbs);
    return `<i class="cs-band ${p.sign}" style="inset-inline-start:${a.toFixed(2)}%;width:${(b - a).toFixed(2)}%;--s:${(0.35 + strength * 0.65).toFixed(2)}"></i>`;
  }).join('');
  const bes = (r.beList || []).filter((b) => b.price > win.lo && b.price < win.hi)
    .map((b) => `<span class="cs-be-tick" style="inset-inline-start:${W(b.price).toFixed(2)}%"><b>${spct(b.pct)}</b></span>`).join('');
  return `<div class="cs-ruler${interactive ? ' live' : ''}" data-cs-ruler="${esc(r.id)}" dir="ltr">
    <div class="cs-ruler-bar">${bands}${bes}<span class="cs-now" style="left:${W(r.spot).toFixed(2)}%"></span></div>
    <div class="cs-ruler-axis"><span>${fmt.money(Math.round(win.lo))}</span><span>${fmt.money(Math.round(r.spot))}</span><span>${fmt.money(Math.round(win.hi))}</span></div>
    ${interactive ? `<input type="range" class="cs-ruler-slider" data-cs-slide="${esc(r.id)}" min="${win.lo}" max="${win.hi}" step="${(win.hi - win.lo) / 400}" value="${r.spot}" aria-label="قیمت پایه در سررسید">
    <p class="cs-readout" data-cs-readout dir="rtl">${esc(readAt(r, r.spot).text)}</p>` : ''}
  </div>`;
}

// ═════════════════════════ پلکان اجرا ═════════════════════════

/** خلاصهٔ پلکان: بیشترین حجمِ شدنی و ارزش ریالی‌اش. */
export function execSummary(r) {
  const ladder = r.ladder || [];
  const top = ladder[ladder.length - 1];
  if (!top) return { sets: r.maxQty, text: fin(r.maxQty) ? `تا ${fmt.int(r.maxQty)} ست` : 'حجم نامعلوم' };
  return { sets: top.n, contracts: top.contracts, netCash: top.netCash, capital: top.capital, ret: top.retStaticMonthPct,
    text: `تا ${fmt.int(top.n)} ست (${fmt.int(top.contracts)} قرارداد)` };
}

/**
 * پلکان به جدول کوچک: برای هر حجمِ شکستِ دفتر، بازده ماهانه، نقد امروز و
 * سرمایهٔ لازمِ کل. ردیفی که بازده‌اش زیر نصفِ ست اول افتاده کم‌رنگ است —
 * «فقط با سطرهای اول درصد خوب به دست می‌آید».
 */
export function ladderHtml(ladder = [], { compact = false } = {}) {
  if (!ladder.length) return '<p class="note">دفتر سفارش برای پلکان کافی نیست.</p>';
  const first = ladder[0].retStaticMonthPct;
  const rows = compact ? [ladder[0], ...(ladder.length > 2 ? [ladder[Math.floor(ladder.length / 2)]] : []), ...(ladder.length > 1 ? [ladder[ladder.length - 1]] : [])] : ladder;
  const weak = (x) => fin(first) && first > 0 && fin(x.retStaticMonthPct) && x.retStaticMonthPct < first / 2;
  if (compact) {
    return `<div class="cs-ladder-mini">${rows.map((x) => `<span class="${weak(x) ? 'weak' : ''}">تا <b>${fmt.int(x.n)}</b> ست: <b class="${tone(x.retStaticMonthPct)}">${pct(x.retStaticMonthPct)}</b></span>`).join('<i>·</i>')}</div>`;
  }
  return `<table class="cs-ladder"><thead><tr><th>تا</th><th>قرارداد</th><th>بازده ماهانه</th><th>احتمال سود</th><th>نقد امروز (کل)</th><th>سرمایهٔ لازم (کل)</th><th>بیشترین زیان (کل)</th></tr></thead><tbody>
    ${ladder.map((x) => `<tr class="${weak(x) ? 'weak' : ''}"><td>${fmt.int(x.n)} ست</td><td>${fmt.int(x.contracts)}</td><td class="${tone(x.retStaticMonthPct)}">${pct(x.retStaticMonthPct)}</td><td>${pct(x.popPct, 0)}</td><td class="${tone(x.netCash)}">${signedRial(x.netCash)}</td><td>${shortRial(x.capital)}</td><td class="loss">${shortRial(x.maxLoss)}</td></tr>`).join('')}
  </tbody></table>`;
}

// ═════════════════════════ کارت ═════════════════════════

/** کارت یک گروه. `rank` صفر یعنی بهترین، با قاب درخشان. */
export function cardHtml(group, rank = 0) {
  const r = group.best;
  const liq = r.liquidity || { score: 0, of: 4, parts: [] };
  const liqTitle = liq.parts.map((p) => `${p.ok ? '✔' : '✘'} ${p.label}`).join('، ');
  const more = group.count - 1;
  const ex = execSummary(r);
  const lines = scenarioLines(r);
  const near = lines.find((x) => x.here);
  return `<article class="cs-card${rank === 0 ? ' best' : ''}" data-cs-id="${esc(r.id)}" tabindex="0">
    <header class="cs-card-head">
      <div><b class="cs-ua">${esc(faDigits(r.uaName))}</b> <span class="cs-name">${esc(r.comboName)}${r.named ? '' : ' <small>(بی‌نام)</small>'}</span>${helpIcon('card-name')}</div>
      <div class="cs-tags"><span class="cs-view ${r.view}">${esc(r.viewLabel)}</span><span class="cs-days">${fmt.int(r.days)} روز</span></div>
    </header>
    <div class="cs-legs-wrap"><ul class="cs-legs">${r.legsCard.map(legLine).join('')}</ul>${helpIcon('card-legs')}</div>
    <div class="cs-metrics">
      <div class="cs-metric hero"><span>بازده ماهانه ${helpIcon('card-ret')}</span><b class="${tone(r.retStaticMonthPct)}">${pct(r.retStaticMonthPct)}</b><small>اگر قیمت ${esc(faDigits(r.uaName))} ثابت بماند</small></div>
      <div class="cs-metric"><span>احتمال سود ${helpIcon('card-pop')}</span><b>${pct(r.popPct)}</b><i class="cs-bar"><b style="--p:${fin(r.popPct) ? Math.min(100, r.popPct) : 0}%"></b></i></div>
      <div class="cs-metric"><span>بیشترین زیان ${helpIcon('card-loss')}</span><b class="loss" title="${esc(fmt.rialText(r.maxLoss))}">${shortRial(r.maxLoss)}</b><small>برای یک ست</small></div>
      <div class="cs-metric"><span>سرمایهٔ لازم ${helpIcon('card-capital')}</span><b title="${esc(fmt.rialText(r.capital))}">${shortRial(r.capital)}</b><small>یک ست، با وجه تضمین</small></div>
    </div>
    <div class="cs-be"><span>سربه‌سر ${helpIcon('card-be')}</span><b>${breakevenText(r)}</b></div>
    ${sparkSvg(r)}
    ${near ? `<p class="cs-scn ${near.sign}">${esc(near.text)}</p>` : ''}
    <div class="cs-exec">
      <div><span>اجرای شدنی ${helpIcon('card-exec')}</span><b>${esc(ex.text)}</b>${fin(ex.netCash) ? `<small>نقد امروز ${signedRial(ex.netCash)} · سرمایهٔ لازم ${shortRial(ex.capital)}</small>` : ''}</div>
      ${r.ladder?.length > 1 ? `<div><span>پلکان دفتر ${helpIcon('card-ladder')}</span>${ladderHtml(r.ladder, { compact: true })}</div>` : ''}
    </div>
    <footer class="cs-card-foot">
      <span class="cs-liq" title="${esc(liqTitle)}">نقدشوندگی <b>${faDigits(`${liq.score}/${liq.of}`)}</b>${helpIcon('card-liq')}</span>
      <span class="cs-src ${r.bookLive ? 'live' : ''}" title="${r.bookLive ? 'قیمت و حجم از دفتر سفارش زندهٔ همین لحظه' : 'سرخط دیده‌بان؛ عمق فقط سطح اول'}">${r.bookLive ? 'دفتر زنده' : 'سرخط دیده‌بان'}</span>
      ${r.riskless ? '<span class="cs-warn" title="بدترین حالت هم سود است — معمولاً یعنی مظنه کهنه است؛ پیش از اجرا دفتر سفارش را ببین">بی‌ریسک؟ مظنه را چک کن</span>' : ''}
      <span class="sp"></span>
      ${more > 0 ? `<button type="button" class="ghost cs-mini" data-cs-variants="${esc(r.id)}" title="همین قراردادها با نسبت‌های دیگر">+${faDigits(String(more))}</button>` : ''}
      <button type="button" class="ghost cs-mini" data-cs-chart="${esc(r.id)}">📈 نمودار و سناریو</button>
    </footer>
  </article>`;
}

// ═════════════════════════ فیلتر و مرتب‌سازی نتیجه ═════════════════════════

export const RESULT_SORTS = [
  ['return', 'بازده ماهانه'], ['pop', 'احتمال سود'], ['loss', 'کمترین زیان'], ['sets', 'بیشترین حجم شدنی'],
  ['room', 'دورترین سربه‌سر (حاشیهٔ امن)'], ['rr', 'نسبت سود به زیان'], ['capital', 'کمترین سرمایه'],
];

export const emptyResultFilter = () => ({ q: '', ua: '', kind: 'all', cash: 'all', legs: 'all', minSets: 1, sort: '' });

const nearestBe = (r) => {
  const l = (r.beList || []).map((b) => Math.abs(b.pct));
  return l.length ? Math.min(...l) : Infinity;
};

/** فیلتر روی گروه‌های برگشتی، بی اسکن دوباره. */
export function filterGroups(groups = [], f = emptyResultFilter()) {
  const q = String(f.q || '').trim();
  const out = groups.filter((g) => {
    const r = g.best;
    if (f.ua && String(r.uaIns) !== String(f.ua)) return false;
    if (f.kind === 'named' && !r.named) return false;
    if (f.kind === 'custom' && r.named) return false;
    if (f.cash === 'credit' && !(r.netCash > 0)) return false;
    if (f.cash === 'debit' && !(r.netCash < 0)) return false;
    if (f.legs === '2' && r.legsCard.length !== 2) return false;
    if (f.legs === '3' && r.legsCard.length !== 3) return false;
    if (f.legs === 'stock' && !r.legsCard.some((l) => l.kind === 'underlying')) return false;
    if (f.legs === 'nostock' && r.legsCard.some((l) => l.kind === 'underlying')) return false;
    const sets = execSummary(r).sets;
    if (f.minSets > 1 && !(sets >= f.minSets)) return false;
    if (q && ![r.uaName, r.comboName, ...r.legsCard.map((l) => l.name)].some((t) => String(t || '').includes(q))) return false;
    return true;
  });
  const key = {
    return: (r) => r.retStaticMonthPct, pop: (r) => r.popPct, loss: (r) => -r.maxLoss, sets: (r) => execSummary(r).sets,
    room: (r) => nearestBe(r), rr: (r) => r.rewardRisk, capital: (r) => -r.capital,
  }[f.sort];
  if (key) {
    const v = (g) => { const x = key(g.best); return Number.isFinite(x) ? x : x === Infinity ? 1e12 : -Infinity; };
    out.sort((a, b) => v(b) - v(a));
  }
  return out;
}
