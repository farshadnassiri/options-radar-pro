// نمای «اسکنر آپشن» — فقط رشتهٔ HTML و SVG، بی DOM، تا در نود هم آزموده شود.
// رابط در `ui/tabs/combo-scanner.mjs`، موتور در `core/combo-scanner.mjs`.

import { fmt, faDigits, faNum } from './fmt.mjs';

export const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
export const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const pct = (v, d = 1) => (fin(v) ? `${faNum(v.toFixed(d))}٪` : '—');
export const tone = (v) => (!fin(v) ? '' : v > 0 ? 'gain' : v < 0 ? 'loss' : '');
export const MILLION = 1e6;

/** ریال کوتاه برای کاشی به میلیون ریال: «۶٫۳ M» مثل تصویر صاحب پروژه، زیر یک میلیون «۰٫۲۹ M»؛ عدد کامل ریالی در راهنمای هاور. */
export const shortRial = (v) => {
  if (!fin(v)) return '—';
  if (Math.abs(v) >= MILLION) return `${faNum((v / MILLION).toFixed(1))} M`;
  if (Math.abs(v) >= 1000) return `${faNum((v / MILLION).toFixed(2))} M`;
  return fmt.rialText(v);
};

export const SIDE_FA = { buy: 'خرید', sell: 'فروش' };
export const legLine = (l) => `<li class="cs-leg ${l.side}"><b>${SIDE_FA[l.side]}</b> ${faDigits(String(l.ratio))} ${l.kind === 'underlying' ? `سهم ${esc(faDigits(l.name || ''))}` : esc(faDigits(l.name || ''))} <span>به ${fmt.money(l.price)}</span></li>`;

/** منحنی کوچک سود و زیان سررسید: سبز بالای صفر، قرمز زیر آن، خط قیمت پایه. */
export function sparkSvg(spark = [], spot = NaN, { w = 220, h = 54 } = {}) {
  const pts = spark.filter(([x, y]) => fin(x) && fin(y));
  if (pts.length < 2) return '';
  const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys);
  if (!(y1 > y0)) { y1 += 1; y0 -= 1; }
  const X = (x) => ((x - x0) / (x1 - x0)) * w;
  const Y = (y) => h - 3 - ((y - y0) / (y1 - y0)) * (h - 6);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  const zero = Y(0).toFixed(1);
  const area = `${line}L${X(x1).toFixed(1)},${zero}L${X(x0).toFixed(1)},${zero}Z`;
  const sx = fin(spot) ? X(spot).toFixed(1) : null;
  return `<svg class="cs-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><clipPath id="cs-up-${Math.round(spot)}-${pts.length}"><rect x="0" y="0" width="${w}" height="${zero}"/></clipPath></defs>
    <path class="cs-spark-loss" d="${area}"/>
    <path class="cs-spark-gain" d="${area}" clip-path="url(#cs-up-${Math.round(spot)}-${pts.length})"/>
    <line class="cs-spark-zero" x1="0" x2="${w}" y1="${zero}" y2="${zero}"/>
    ${sx ? `<line class="cs-spark-spot" x1="${sx}" x2="${sx}" y1="0" y2="${h}"/>` : ''}
    <path class="cs-spark-line" d="${line}"/>
  </svg>`;
}

/** کارت یک گروه. `rank` صفر یعنی بهترین، با قاب درخشان. */
export function cardHtml(group, rank = 0) {
  const r = group.best;
  const liq = r.liquidity || { score: 0, of: 4, parts: [] };
  const liqTitle = liq.parts.map((p) => `${p.ok ? '✔' : '✘'} ${p.label}`).join('، ');
  const more = group.count - 1;
  return `<article class="cs-card${rank === 0 ? ' best' : ''}" data-cs-id="${esc(r.id)}" tabindex="0">
    <header class="cs-card-head">
      <div><b class="cs-ua">${esc(faDigits(r.uaName))}</b> <span class="cs-name">${esc(r.comboName)}${r.named ? '' : ' <small>(بی‌نام)</small>'}</span></div>
      <div class="cs-tags"><span class="cs-view ${r.view}">${esc(r.viewLabel)}</span><span class="cs-days">${fmt.int(r.days)} روز</span></div>
    </header>
    <ul class="cs-legs">${r.legsCard.map(legLine).join('')}</ul>
    <div class="cs-metrics">
      <div class="cs-metric hero"><span>بازده ماهانه</span><b class="${tone(r.retStaticMonthPct)}">${pct(r.retStaticMonthPct)}</b><small>اگر قیمت ${esc(faDigits(r.uaName))} ثابت بماند</small></div>
      <div class="cs-metric"><span>احتمال سود</span><b>${pct(r.popPct)}</b><i class="cs-bar"><b style="--p:${fin(r.popPct) ? Math.min(100, r.popPct) : 0}%"></b></i></div>
      <div class="cs-metric"><span>بیشترین زیان</span><b class="loss" title="${esc(fmt.rialText(r.maxLoss))}">${shortRial(r.maxLoss)}</b><small>هر ست</small></div>
      <div class="cs-metric"><span>سرمایهٔ لازم</span><b title="${esc(fmt.rialText(r.capital))}">${shortRial(r.capital)}</b><small>با وجه تضمین</small></div>
    </div>
    ${sparkSvg(r.spark, r.spot)}
    <footer class="cs-card-foot">
      <span title="بیشترین ستی که سرخط همین لحظه جا دارد">قابل اجرا <b>${fin(r.maxQty) ? fmt.int(r.maxQty) : '—'}</b> ست</span>
      <span class="cs-liq" title="${esc(liqTitle)}">نقدشوندگی <b>${faDigits(`${liq.score}/${liq.of}`)}</b></span>
      ${r.riskless ? '<span class="cs-warn" title="بدترین حالت هم سود است — معمولاً یعنی مظنه کهنه است؛ پیش از اجرا دفتر سفارش را ببین">بی‌ریسک؟ مظنه را چک کن</span>' : ''}
      <span class="sp"></span>
      ${more > 0 ? `<button type="button" class="ghost cs-mini" data-cs-variants="${esc(r.id)}" title="همین قراردادها با نسبت‌های دیگر">+${faDigits(String(more))}</button>` : ''}
      <button type="button" class="ghost cs-mini" data-cs-chart="${esc(r.id)}">📈 نمودار</button>
    </footer>
  </article>`;
}

