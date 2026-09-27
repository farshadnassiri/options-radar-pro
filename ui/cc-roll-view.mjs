// نمای دستیار رول کاوردکال — جمله، جدول و گزینهٔ نمودار.
//
// موتورش `core/cc-roll.mjs` است و این‌جا فقط شکل است. هر عددی که به
// کاربر می‌رسد از `ui/fmt.mjs` رد می‌شود و هر رنگی از توکن.
//
// ترتیب نمایش همان ترتیب تصمیم است: اول حکم (رول بکنم یا نه)، بعد «به
// کدام سررسید» (نردبان)، بعد جزئیات پنج‌بخشی نوت‌بوک برای کسی که می‌خواهد
// دلیل هر عدد را ببیند.

import { fmt, faDigits, signTone } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

export const money = (v) => fmt.money(v);
export const pct = (v) => (fin(v) ? `${fmt.pct(v)}٪` : '—');
const signed = (v) => (fin(v) ? `${v > 0 ? '+' : ''}${fmt.money(v)}` : '—');
const days = (d) => `${faDigits(Math.round(d))} روز`;
const tone = (v) => signTone(v);

/** عدد بزرگ ریالی، خوانا: «۱٫۲۵ میلیون». */
export function compact(v) {
  if (!fin(v)) return '—';
  const a = Math.abs(v);
  for (const [div, suf] of [[1e9, 'میلیارد'], [1e6, 'میلیون'], [1e3, 'هزار']]) {
    if (a >= div) return `${v < 0 ? '−' : ''}${fmt.num(a / div)} ${suf}`;
  }
  return fmt.money(v);
}

/** محدودهٔ سودآوری رول، به زبان قیمت پایه. */
export function rangeText(ranges = []) {
  if (!ranges.length) return 'هیچ قیمتی';
  const parts = [];
  for (const r of ranges) {
    if (r.from == null && r.to == null) return 'هر قیمتی';
    if (r.from == null) parts.push(`زیر ${fmt.money(r.to)}`);
    else if (r.to == null) parts.push(`بالای ${fmt.money(r.from)}`);
    else parts.push(`بین ${fmt.money(r.from)} و ${fmt.money(r.to)}`);
  }
  return parts.join(' یا ');
}

const flowText = (netFlow) => (netFlow >= 0
  ? `<span class="gain">بستانکار ${compact(netFlow)}</span>`
  : `<span class="loss">بدهکار ${compact(-netFlow)}</span>`);

const expiryTag = (row, base) => (row.same
  ? 'همان سررسید'
  : `${days(row.extraDays)} دیرتر از سررسید فعلی (${days(row.days)} مانده)`);

const verdictTag = (v) => ({
  now: '<span class="tag gain">با قیمت امروز به نفع</span>',
  conditional: '<span class="tag warn">مشروط به حرکت قیمت</span>',
  never: '<span class="tag loss">هرگز به نفع نیست</span>',
}[v] || '');

// ————————————————————————— حکم —————————————————————————

const TIMING_TEXT = {
  ripe: 'کال فعلی تقریباً همهٔ ارزش زمانی‌اش را داده؛ نگه‌داشتنش درآمدی نمی‌سازد. زمان رول رسیده است.',
  ready: 'بخش بزرگی از پریمیوم برداشت شده؛ رول از این‌جا به بعد منطقی است.',
  early: 'هنوز ارزش زمانی قابل‌توجهی در کال فعلی مانده؛ اگر رول ضروری نیست، عجله لازم نیست.',
};

/**
 * جعبهٔ حکم: رول بکنم یا نه، به کدام، با چه هزینه و ریسکی.
 * `uaName` نام پایه است و فقط در جمله می‌نشیند.
 */
export function verdictHtml(verdict, plan, uaName = 'پایه') {
  if (!verdict || verdict.action === 'none') {
    return `<div class="ccr-verdict tone-flat"><div class="ccr-v-title">حکمی نیست</div>
      <p>${esc(verdict?.reason || plan?.reason || 'داده‌ای برای سنجش نیست.')}</p></div>`;
  }
  const b = plan.baseline;
  const p = verdict.pick;
  const ua = esc(uaName);
  const lines = [];
  const timing = verdict.timing ? `<li>زمان‌بندی: ${TIMING_TEXT[verdict.timing.stage]}
    (پریمیوم برداشت‌شده ${pct(verdict.timing.capturedPct)} · ارزش زمانی باقی‌مانده
    ${compact(verdict.timing.timeValueLeft)})</li>` : '';
  const odds = (r) => (fin(r?.prob)
    ? `<li>احتمال به‌نفع‌بودن تا سررسید پای تازه: <b>${pct(r.prob * 100)}</b> · امید سود اضافه:
       <b class="${tone(r.expected)}">${signed(r.expected)}</b> <span class="unit">لگاریتم-نرمال، روند صفر</span></li>`
    : '');
  if (verdict.action === 'roll') {
    lines.push(`<li>هزینه: ${flowText(p.netFlow)} — بستن کال فعلی ${compact(b.payOut)}، فروش تازه ${compact(p.cashIn)}</li>`);
    lines.push(`<li>سود اضافه اگر ${ua} همین‌جا (${fmt.money(b.spot)}) بماند: <b class="gain">${signed(p.dNow)}</b></li>`);
    lines.push(`<li>ریسک: بدترین حالت نسبت به رول‌نکردن <b class="${tone(p.dMin)}">${signed(p.dMin)}</b> ·
      بهترین حالت <b class="gain">${signed(p.dMax)}</b></li>`);
    lines.push(`<li>رول وقتی جلوتر است که ${ua} در سررسید <b>${rangeText(p.ranges)}</b> باشد</li>`);
    lines.push(`<li>بهای تمام‌شدهٔ هر سهم: ${fmt.money(b.nc0)} ← <b>${fmt.money(p.nc)}</b> ·
      سقف سود کل: ${compact(b.maxProfit)} ← <b>${compact(p.maxProfit)}</b></li>`);
    if (verdict.dilutes) {
      lines.push(`<li class="warn">سود کل بیشتر است ولی سود روزانه در ثبات کمتر:
        ${compact(b.flatPerDay)} در روز الان، ${compact(p.flatPerDay)} در روز پس از رول — بخشی از برتری فقط از افق بلندتر است.</li>`);
    }
    lines.push(odds(p));
    if (verdict.sameExpiry) {
      lines.push(`<li>بهترین رول در همان سررسید: <b>${esc(verdict.sameExpiry.name)}</b>
        (${flowText(verdict.sameExpiry.netFlow)}، سود اضافه ${signed(verdict.sameExpiry.dNow)})</li>`);
    }
    if (verdict.credit) {
      lines.push(`<li>اگر نمی‌خواهید پول تازه بگذارید: <b>${esc(verdict.credit.name)}</b>
        (${flowText(verdict.credit.netFlow)}، سود اضافه ${signed(verdict.credit.dNow)})</li>`);
    }
    return `<div class="ccr-verdict tone-gain">
      <div class="ccr-v-title">رول کن → ${esc(p.name)}</div>
      <div class="ccr-v-sub">اعمال ${fmt.money(p.strike)} · ${expiryTag(p, b)}${p.flags.length ? ` · ${esc(p.flags.join('، '))}` : ''}</div>
      <ul>${lines.join('')}${timing}</ul></div>`;
  }
  if (verdict.action === 'conditional') {
    lines.push(`<li>با قیمت امروز هیچ رولی از رول‌نکردن جلوتر نیست؛ این گزینه فقط با رشد ${ua} توجیه دارد.</li>`);
    lines.push(`<li>هزینه: ${flowText(p.netFlow)} · در قیمت امروز ${signed(p.dNow)} نسبت به رول‌نکردن</li>`);
    lines.push(`<li>رول وقتی جلوتر است که ${ua} در سررسید <b>${rangeText(p.ranges)}</b> باشد
      (${fin(p.edgePct) ? `${pct(p.edgePct)} فاصله از قیمت امروز` : '—'})</li>`);
    lines.push(`<li>ریسک: بدترین حالت <b class="loss">${signed(p.dMin)}</b> · بهترین حالت <b class="gain">${signed(p.dMax)}</b></li>`);
    lines.push(odds(p));
    return `<div class="ccr-verdict tone-warn">
      <div class="ccr-v-title">رول مشروط — فقط با دید صعودی: ${esc(p.name)}</div>
      <div class="ccr-v-sub">اعمال ${fmt.money(p.strike)} · ${expiryTag(p, b)}</div>
      <ul>${lines.join('')}${timing}</ul></div>`;
  }
  // hold
  if (p) {
    lines.push(`<li>بهترین رول اجراپذیر (${esc(p.name)}) با قیمت امروز ${signed(p.dNow)} نسبت به رول‌نکردن است.</li>`);
  }
  if (verdict.betterEstimate) {
    lines.push(`<li class="warn">${esc(verdict.betterEstimate.name)} فقط با قیمت مرجع جلوتر است و در دفتر سفارش
      اجرا نمی‌شود — تا مظنهٔ واقعی نیاید، حساب نمی‌شود.</li>`);
  }
  lines.push(`<li>با نگه‌داشتن، سود فعلی ${compact(b.nowProfit)} است و سقف سود ${compact(b.maxProfit)}؛
    ${ua} می‌تواند تا ${fmt.money(b.nc0)} (${pct(b.cushionPct)} پایین‌تر) بیفتد و کل معامله هنوز زیان ندهد.</li>`);
  return `<div class="ccr-verdict tone-loss">
    <div class="ccr-v-title">رول نکن — نگه دار</div>
    <div class="ccr-v-sub">هیچ رولی نه امروز جلوتر است، نه با تلاطم فعلی امید مثبت دارد.</div>
    <ul>${lines.join('')}${timing}</ul></div>`;
}

/** نوار شاخص‌های موقعیت فعلی. */
export function baselineKpis(plan, settle) {
  const b = plan.baseline;
  const k = (label, value, sub = '', cls = '') =>
    `<div class="kpi"><div class="k">${label}</div><div class="v ${cls}">${value}</div><div class="s">${sub}</div></div>`;
  return [
    k('قیمت پایه', fmt.money(b.spot), `اعمال فعلی ${fmt.money(b.K)}`),
    k('روز تا سررسید', faDigits(b.days), `${fmt.int(b.shares)} سهم · ${faDigits(b.contracts)} قرارداد`),
    k('بهای تمام‌شدهٔ هر سهم', fmt.money(b.nc0), `حاشیهٔ امن ${pct(b.cushionPct)}`),
    k('هزینهٔ بستن کال فعلی', compact(b.payOut), `${fmt.money(b.buyback)} هر سهم${b.buybackOk ? '' : ' · بدون مظنهٔ اجرا'}`, 'loss'),
    k('سود اگر نگه داری و پایه بماند', compact(b.nowProfit), `${compact(b.flatPerDay)} در روز`, tone(b.nowProfit)),
    k('سقف سود رول‌نکردن', compact(b.maxProfit), `${pct(b.retPct)} روی سرمایه`, tone(b.maxProfit)),
    k('پریمیوم برداشت‌شده', pct(b.capturedPct),
      b.capturedPct < 0 ? 'کال از قیمت فروش شما گران‌تر شده' : `ارزش زمانی مانده ${compact(b.timeValue * b.shares)}`, tone(b.capturedPct)),
    settle ? k('اگر اعمال شود', compact(settle.ifAssigned), `اگر بی‌ارزش منقضی شود ${compact(settle.ifExpire)}`, tone(settle.ifAssigned)) : '',
  ].join('');
}

// ————————————————————————— نردبان سررسید —————————————————————————

export function ladderHtml(ladder, plan) {
  const b = plan.baseline;
  if (!ladder.length) return '<p class="empty-note">هیچ سررسیدی نامزد قیمت‌دار نداشت.</p>';
  const best = ladder.reduce((x, y) => (y.best.dNow > x.best.dNow ? y : x));
  return `<table class="data"><thead><tr>
    <th>سررسید</th><th>نامزد</th><th>بهترین گزینه</th><th>خالص رول</th>
    <th>سود اضافه با قیمت امروز</th><th title="سود اضافه تقسیم بر روزهایی که افق بلندتر می‌شود">سود اضافه هر روز تمدید</th>
    <th>بدترین حالت</th><th>حداقل قیمت لازم</th><th>احتمال به نفع</th><th>امید سود اضافه</th>
    <th title="سود موقعیت پس از رول اگر پایه ثابت بماند، تقسیم بر افقش">سود روزانه در ثبات</th><th></th>
  </tr></thead><tbody>
    <tr class="picked"><td>فعلی — ${days(b.days)}</td><td class="n">—</td><td>رول‌نکردن</td><td class="n">—</td>
      <td class="n">۰</td><td class="n">—</td><td class="n">۰</td><td class="n">—</td><td class="n">—</td><td class="n">—</td>
      <td class="n">${compact(b.flatPerDay)}</td><td></td></tr>
    ${ladder.map((x) => {
    const r = x.best;
    return `<tr>
      <td>${x.extraDays > 0 ? `+${days(x.extraDays)} (${days(x.days)})` : `همان سررسید (${days(x.days)})`}</td>
      <td class="n">${faDigits(x.count)}${x.executable < x.count ? `<span class="unit">${faDigits(x.executable)} اجراپذیر</span>` : ''}</td>
      <td>${esc(r.name)} <span class="unit">اعمال ${fmt.money(r.strike)}</span></td>
      <td class="n">${flowText(r.netFlow)}</td>
      <td class="n ${tone(r.dNow)}">${signed(r.dNow)}</td>
      <td class="n">${fin(r.perExtraDay) ? signed(r.perExtraDay) : '—'}</td>
      <td class="n ${tone(r.dMin)}">${signed(r.dMin)}</td>
      <td class="n">${fin(r.edge) ? fmt.money(r.edge) : esc(rangeText(r.ranges))}</td>
      <td class="n">${fin(r.prob) ? pct(r.prob * 100) : '—'}</td>
      <td class="n ${tone(r.expected)}">${signed(r.expected)}</td>
      <td class="n ${r.flatPerDay >= b.flatPerDay ? 'gain' : 'loss'}">${compact(r.flatPerDay)}</td>
      <td>${x === best && r.dNow > 0 ? '<span class="tag gain">بهترین سررسید</span>' : ''}${r.executable ? '' : '<span class="tag warn">تخمینی</span>'}</td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

// ————————————————————————— بخش اول: جدول تصمیم —————————————————————————

const whyText = (r) => {
  switch (r.whyKind) {
    case 'base': return 'سود قفل‌شده و بدون سرمایهٔ جدید';
    case 'never': return 'در هیچ قیمت پایانی از رول‌نکردن جلو نمی‌زند';
    case 'dominated': return 'گزینهٔ دیگری با پول تازهٔ تقریباً برابر، سقف سود بالاتری دارد';
    case 'bestFlat': return `${compact(r.dflat)} سود اضافه بدون نیاز به رشد`;
    case 'marginal': return 'در قیمت فعلی عملاً سربه‌سر است';
    case 'good': return fin(r.eff) ? `${pct(r.eff * 100)} بازده روی پول تازه در قیمت فعلی` : 'بستانکار و در قیمت فعلی جلوتر';
    case 'heavy': return 'بیشترین پول تازه و بیشترین زیان بالقوه';
    default: return `در قیمت فعلی ${compact(-r.dflat)} بدتر از رول‌نکردن`;
  }
};

export function decisionTableHtml(drows, plan, uaName = 'پایه') {
  const b = plan.baseline;
  const cand = drows.filter((r) => !r.isBase);
  const starEdge = cand.map((r) => r.edge).filter(fin).sort((x, y) => x - y)[0];
  const starFlat = Math.max(...drows.map((r) => r.flat));
  const starMax = Math.max(...drows.map((r) => r.maxp));
  const body = drows.map((r) => {
    const money = r.isBase ? '★ بدون وجه تازه'
      : r.pay > 0 ? `${r.risky ? '⚠ ' : ''}${compact(r.pay)} پرداخت` : `بستانکار ${compact(r.credit)}`;
    const cross = r.isBase ? '— (خط مبنا)'
      : fin(r.edge) ? `${fin(starEdge) && Math.abs(r.edge - starEdge) < 1 ? '★ ' : ''}${fmt.money(r.edge)}` : esc(rangeText(r.ranges));
    const cond = b.spot >= r.K ? `${esc(uaName)} بالای ${fmt.money(r.K)} (هم‌اکنون محقق)`
      : `${esc(uaName)} بالای ${fmt.money(r.K)} — رشد ${pct(((r.K - b.spot) / b.spot) * 100)}`;
    return `<tr class="${r.isBase ? 'picked' : ''}">
      <td><b>${r.isBase ? `رول‌نکردن — اعمال ${fmt.money(r.K)}` : `${esc(r.name)} — اعمال ${fmt.money(r.K)}`}</b>${r.risky ? ' ⚠' : ''}
        ${r.isBase ? '' : `<span class="unit">${r.extraDays > 0 ? `+${days(r.extraDays)}` : 'همان سررسید'}</span>`}</td>
      <td class="n ${r.pay > 0 ? 'loss' : 'gain'}">${money}</td>
      <td class="n">${cross}</td>
      <td class="n ${r.flat >= starFlat ? 'gain' : r.dflat < 0 ? 'loss' : ''}">${r.flat === starFlat ? '★ ' : ''}${compact(r.flat)}</td>
      <td class="n">${r.maxp === starMax ? '★ ' : ''}${compact(r.maxp)}${r.isBase ? '' : `<span class="unit">${signed(r.dmax)} نسبت به رول‌نکردن</span>`}</td>
      <td>${cond}</td>
      <td>${esc(r.view)}</td>
      <td><b>${esc(r.label)}</b><span class="unit">${whyText(r)}</span></td>
    </tr>`;
  }).join('');
  return `<table class="data"><thead><tr>
    <th>گزینه</th><th>پول تازهٔ لازم</th><th>حداقل قیمت لازم برای بهترشدن رول</th>
    <th>سود در ثبات ${esc(uaName)} (${fmt.money(b.spot)})</th><th>حداکثر سود</th>
    <th>شرط تحقق حداکثر سود</th><th>مناسب برای چه دیدی</th><th>ارزیابی نهایی</th>
  </tr></thead><tbody>${body}</tbody></table>
  <p class="note">«بهای تمام‌شدهٔ هر سهم» ${fmt.money(b.nc0)} است — قیمتی که کل معامله از روز ورود در آن به صفر
    می‌رسد. ستون سوم چیز دیگری است: می‌گوید رول از چه قیمتی به بعد از رول‌نکردن جلو می‌زند.
    ★ بهترین مقدار ستون · ⚠ گزینهٔ پرریسک یا سرمایه‌بر.</p>`;
}

// ————————————————————————— بخش دوم: سناریو —————————————————————————

export function scenarioHtml(table, drows, uaName = 'پایه') {
  const body = table.map((s) => {
    const why = s.best.isBase
      ? `هیچ رولی جلو نمی‌زند؛ اختلاف با ${esc(s.second?.name || '—')} برابر ${compact(s.bestValue - s.secondValue)}`
      : `${compact(s.gain)} بالاتر از رول‌نکردن${s.best.pay > 0 ? ` با ${compact(s.best.pay)} پول تازه` : ' و بستانکار'}${fin(s.effPct) ? `؛ بازده ${pct(s.effPct)} روی پول تازه` : ''}`;
    return `<tr class="${s.isSpot ? 'picked' : ''}">
      <td class="n"><b>${fmt.money(s.S)}</b>${s.isSpot ? '<span class="unit">فعلی</span>' : ''}</td>
      <td class="gain"><b>${esc(s.best.name)}</b></td>
      <td class="n ${tone(s.bestValue)}">${fmt.money(s.bestValue)}</td>
      <td>${esc(s.second?.name || '—')} <span class="unit">${compact(s.secondValue)}</span></td>
      <td>${why}</td></tr>`;
  }).join('');
  const worst = Math.max(0, ...drows.filter((r) => !r.isBase).map((r) => -r.dlo));
  return `<table class="data"><thead><tr><th>قیمت ${esc(uaName)} در سررسید</th><th>بهترین گزینه</th>
    <th>سود بهترین گزینه</th><th>گزینهٔ دوم</th><th>دلیل انتخاب</th></tr></thead><tbody>${body}</tbody></table>
    <p class="note">زیان هر رول نسبت به رول‌نکردن سقف دارد — در بدترین حالت این گروه تا
    <b>${compact(worst)}</b> عقب‌افتادگی. برای رول بدهکار، این سقف همان پول تازه‌ای است که می‌پردازید.</p>`;
}

// ————————————————————————— بخش سوم: ماتریس —————————————————————————

export function matrixHtml(items, uaName = 'پایه') {
  if (!items.length) return '<p class="empty-note">گزینهٔ رولی در این گروه نیست.</p>';
  const row = (it) => {
    const name = it.pick.isBase ? 'رول‌نکردن' : it.pick.name;
    switch (it.kind) {
      case 'drop': return ['انتظار افت سهم', name, `زیر ${fmt.money(it.price)} هیچ رولی جلو نمی‌زند`];
      case 'flat': return [`انتظار ثبات حوالی ${fmt.money(it.price)}`, name,
        it.pick.isBase ? 'هیچ رولی در قیمت فعلی جلو نمی‌زند' : `${compact(it.gain)} سود اضافه بدون نیاز به رشد`];
      case 'grow': return [`انتظار رشد ${esc(uaName)} تا ${fmt.money(it.price)}`, name,
        it.pick.isBase ? 'در این قیمت هم رول‌نکردن جلوتر است' : `${compact(it.gain)} بالاتر از رول‌نکردن در آن قیمت`];
      case 'unsure': return ['عدم اطمینان از جهت بازار', name,
        it.pick.isBase ? 'هیچ رولی در قیمت فعلی سودآور نیست' : 'کمترین پول تازه در میان گزینه‌هایی که هم‌اکنون در سودند'];
      default: return ['عدم تمایل به ورود پول تازه', name,
        it.pick.isBase ? 'همهٔ گزینه‌های این گروه بدهکارند؛ رول بستانکار در دسترس نیست' : `بستانکار، و ${compact(it.gain)} سود اضافه در قیمت فعلی`];
    }
  };
  return `<table class="data"><thead><tr><th>انتظار معامله‌گر از سهم</th><th>اقدام پیشنهادی</th><th>دلیل</th></tr></thead>
    <tbody>${items.map((it) => { const [a, c, d] = row(it); return `<tr><td>${a}</td><td><b>${esc(c)}</b></td><td>${d}</td></tr>`; }).join('')}</tbody></table>`;
}

// ————————————————————————— بخش چهارم: شاخص‌ها —————————————————————————

export function metricsHtml(metrics, plan) {
  const b = plan.baseline;
  if (!metrics.length) return '<p class="empty-note">گزینهٔ رولی در این گروه نیست.</p>';
  const lines = [
    ['هزینهٔ رول هر سهم', (m) => fmt.money(m.costPerShare)],
    ['افزایش قیمت اعمال', (m) => signed(m.strikeUp)],
    ['منفعت اضافهٔ سقف هر سهم', (m) => fmt.money(m.capGainPerShare)],
    ['بهای تمام‌شدهٔ جدید هر سهم', (m) => fmt.money(m.ncNew)],
    ['سرمایهٔ درگیر جدید', (m) => compact(m.capitalNew)],
    ['بازده حداکثر بر سرمایهٔ جدید', (m) => pct(m.retOnNewCapital)],
    ['بازده روی پول تازه در بهترین حالت', (m) => pct(m.retOnNewMoney)],
    ['ارزش زمانی اختیار جدید', (m) => fmt.money(m.timeValue)],
  ];
  const table = `<table class="data"><thead><tr><th>شاخص</th>${metrics.map((m) => `<th>${esc(m.name)}</th>`).join('')}</tr></thead>
    <tbody>${lines.map(([label, f]) => `<tr><td><b>${label}</b></td>${metrics.map((m) => `<td class="n">${f(m)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const note = `<p class="note">هزینهٔ بستن کال فعلی با کارمزد <b>${compact(b.payOut)}</b> است. ارزش ذاتی آن
    ${fmt.money(b.intrinsic)} و ارزش زمانی‌اش <b>${fmt.money(b.timeValue)}</b> هر سهم است؛ یعنی بخش ذاتیِ این پرداخت
    بازگشت سودی است که سهم کرده، نه هزینهٔ واقعی خروج. افت ممکن قیمت تا بهای تمام‌شده: <b>${pct(b.cushionPct)}</b>.</p>`;
  return table + note;
}

export function issuesHtml(issues = []) {
  const text = (it) => {
    switch (it.kind) {
      case 'tvOrder': return `ارزش زمانی ${esc(it.b)} از ${esc(it.a)} کمتر نیست، در حالی که اعمال بالاتری دارد؛ یکی از دو قیمت مشکوک است.`;
      case 'tvFlat': return `کاهش ارزش زمانی بین ${esc(it.a)} و ${esc(it.b)} غیرعادی تخت است (${fmt.num(it.ratio)} در برابر ${fmt.num(it.prev)} در پلهٔ قبل)؛ معمولاً نشانهٔ کم‌معامله یا کهنه بودن قیمت است.`;
      case 'noQuote': return `این نمادها در مبنای انتخابی دفتر سفارش کافی ندارند و قیمتشان تخمینی است: ${esc(it.names.join('، '))}`;
      case 'buyback': return 'کال فعلی عرضهٔ کافی ندارد؛ هزینهٔ بستن آن تخمینی است و همهٔ ردیف‌ها «تخمینی» می‌شوند.';
      default: return it.withOdds
        ? 'احتمال‌ها از مدل لگاریتم-نرمال با تلاطم ضمنی کال فعلی و روند صفرند؛ دامنهٔ نوسان، توقف نماد و پرش‌های بازار در آن نیست. مقایسهٔ سررسیدهای متفاوت در یک قیمت پایانی واحد است و ریسک افق بلندتر در سود اضافه قیمت‌گذاری نشده.'
        : 'تلاطم ضمنی در دست نیست، پس هیچ احتمالی تخمین زده نشده؛ همهٔ اعداد شرطی‌اند نه پیش‌بینی.';
    }
  };
  return `<div class="ccr-issues"><b>بررسی ناسازگاری و کمبود داده</b><ul>${issues.map((it) => `<li>${text(it)}</li>`).join('')}</ul></div>`;
}

// ————————————————————————— بخش پنجم: جمع‌بندی —————————————————————————

export function summaryHtml(sum, plan, uaName = 'پایه') {
  if (!sum) return '<p class="empty-note">گزینهٔ رولی برای جمع‌بندی نیست.</p>';
  const b = plan.baseline;
  const ua = esc(uaName);
  const items = [];
  items.push(sum.flatBest.isBase
    ? ['بهترین انتخاب در صورت ثبات سهم', 'رول‌نکردن', `هیچ رولی در قیمت ${fmt.money(b.spot)} از سود ${compact(b.nowProfit)} فعلی جلو نمی‌زند.`]
    : ['بهترین انتخاب در صورت ثبات سهم', sum.flatBest.name, `سود کل ${compact(sum.flatBest.flat)} در برابر ${compact(b.nowProfit)} رول‌نکردن؛ ${compact(sum.flatBest.dflat)} بیشتر ${sum.flatBest.pay > 0 ? `با ${compact(sum.flatBest.pay)} پول تازه` : 'و بستانکار'}. این سود به هیچ رشدی نیاز ندارد.`]);
  if (sum.mid) {
    items.push(['بهترین انتخاب در صورت رشد متوسط', sum.mid.name,
      `مشروط به رسیدن ${ua} به ${fmt.money(sum.mid.K)} (رشد ${pct(((sum.mid.K - b.spot) / b.spot) * 100)}). سود اضافه در آن قیمت ${compact(sum.midGain)} و پول تازهٔ لازم ${compact(sum.mid.pay)}.`]);
  }
  items.push(['بهترین انتخاب در صورت رشد قوی', sum.strong.name,
    `مشروط به رسیدن ${ua} به ${fmt.money(sum.strong.K)} (رشد ${pct(((sum.strong.K - b.spot) / b.spot) * 100)}) با ${compact(sum.strong.pay)} پول تازه؛ سود اضافه ${compact(sum.strong.dhi)}.`]);
  items.push(['انتخاب محافظه‌کارانه', sum.conservative ? sum.conservative.name : 'رول‌نکردن',
    sum.conservative
      ? `${sum.conservative.pay > 0 ? `با ${compact(sum.conservative.pay)} پول تازه` : 'بستانکار'} ${compact(sum.conservative.dflat)} اضافه می‌آورد و هم‌اکنون در سود است؛ کم‌ریسک‌ترین رول ممکن.`
      : `سود ${compact(b.nowProfit)} هم‌اکنون قفل شده و تا افت به ${fmt.money(b.nc0)} در خطر نیست.`]);
  if (sum.bad.length) {
    items.push(['انتخاب نامناسب', sum.bad.map((r) => r.name).join('، '), sum.bad.map((r) => `${esc(r.name)}: ${whyText(r)}`).join('؛ ')]);
  }
  const lines = [];
  if (!sum.flatBest.isBase) lines.push(`اگر انتظار دارید ${ua} تا سررسید حوالی همین قیمت بماند، <b>${esc(sum.flatBest.name)}</b> مناسب‌ترین است.`);
  if (sum.mid) lines.push(`اگر انتظار رشد تا ${fmt.money(sum.mid.K)} دارید، <b>${esc(sum.mid.name)}</b> منطقی می‌شود.`);
  lines.push(`اگر انتظار رشد تا ${fmt.money(sum.strong.K)} یا بالاتر دارید، <b>${esc(sum.strong.name)}</b> سقف سود را واقعاً باز می‌کند.`);
  lines.push(`اگر نسبت به جهت بازار مطمئن نیستید، <b>${esc(sum.conservative ? sum.conservative.name : 'رول‌نکردن')}</b>.`);
  lines.push('اگر نمی‌خواهید پول تازه وارد کنید، <b>رول‌نکردن</b> یا یک رول بستانکار.');
  const quick = [`رول‌نکردن وقتی بهتر است که انتظار افت یا ثبات زیر ${fmt.money(sum.lowK)} داشته باشید؛ در آن ناحیه هیچ رولی جلو نمی‌زند.`];
  if (!sum.flatBest.isBase) quick.push(`برای ثبات یا رشد محدود، <b>${esc(sum.flatBest.name)}</b>: ${compact(sum.flatBest.dflat)} سود اضافه بدون نیاز به رشد.`);
  if (sum.negative.length) {
    quick.push(`این گزینه‌ها فقط با رشد جدی توجیه دارند و در قیمت امروز بدترند: ${sum.negative.map((r) => `${esc(r.name)} (${compact(-r.dflat)} بدتر)`).join('، ')}.`);
  }
  if (sum.heavy.pay > 0) quick.push(`بیشترین پول تازه مال <b>${esc(sum.heavy.name)}</b> است با ${compact(sum.heavy.pay)}.`);
  quick.push(`مهم‌ترین ریسک: پول تازه‌ای که می‌پردازید سقف زیان شما نسبت به رول‌نکردن است و اگر ${ua} تا ${days(b.days)} دیگر پایین بیاید کاملاً از دست می‌رود.`);
  return `<table class="data"><thead><tr><th>موضوع</th><th>گزینه</th><th>دلیل عددی</th></tr></thead><tbody>
    ${items.map(([a, c, d]) => `<tr><td><b>${a}</b></td><td><b>${esc(c)}</b></td><td>${d}</td></tr>`).join('')}</tbody></table>
    <h4>پیشنهاد نهایی — شرطی</h4><ul class="ccr-lines">${lines.map((t) => `<li>${t}</li>`).join('')}</ul>
    <div class="ccr-quick"><b>اگر فقط ۳۰ ثانیه وقت دارید</b><ul>${quick.map((t) => `<li>${t}</li>`).join('')}</ul></div>`;
}

// ————————————————————————— همهٔ نامزدها —————————————————————————

export function candidatesHtml(plan) {
  if (!plan.rows.length) return '<p class="empty-note">هیچ نامزد رولی با این فیلترها قیمت نداشت.</p>';
  const head = ['تصمیم', 'نماد', 'نوع رول', 'سررسید', 'اعمال', 'محدودهٔ سودآوری رول', 'فاصله تا مرز', 'روز اضافه',
    'پرداختی', 'دریافتی', 'خالص رول', 'سود کل در سررسید', 'بازده کل', 'سالانه‌شده', 'سود اضافه با قیمت امروز',
    'بیشترین سود اضافه', 'بیشترین زیان اضافه', 'بهای تمام‌شدهٔ جدید', 'تغییر بهای تمام‌شده', 'فاصلهٔ اعمال',
    'حجم', 'موقعیت باز', 'هشدار'];
  return `<table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${plan.rows.map((r) => `<tr>
      <td>${verdictTag(r.verdict)}</td><td><b>${esc(r.name)}</b></td><td>${r.same ? 'همان سررسید' : 'سررسید بعدی'}</td>
      <td class="n">${days(r.days)}</td><td class="n">${fmt.money(r.strike)}</td><td>${esc(rangeText(r.ranges))}</td>
      <td class="n">${pct(r.edgePct)}</td><td class="n">${faDigits(r.extraDays)}</td>
      <td class="n loss">${fmt.money(r.payOut)}</td><td class="n gain">${fmt.money(r.cashIn)}</td>
      <td class="n ${tone(r.netFlow)}">${fmt.money(r.netFlow)}</td><td class="n">${fmt.money(r.maxProfit)}</td>
      <td class="n">${pct(r.retPct)}</td><td class="n">${pct(r.annPct)}</td>
      <td class="n ${tone(r.dNow)}">${fmt.money(r.dNow)}</td><td class="n">${fmt.money(r.dMax)}</td>
      <td class="n ${tone(r.dMin)}">${fmt.money(r.dMin)}</td><td class="n">${fmt.money(r.nc)}</td>
      <td class="n">${signed(r.ncChange)}</td><td class="n">${pct(r.strikeDistPct)}</td>
      <td class="n">${fmt.int(r.vol)}</td><td class="n">${fmt.int(r.oi)}</td><td>${esc(r.flags.join('، '))}</td>
    </tr>`).join('')}</tbody></table>`;
}

// ————————————————————————— احتمال —————————————————————————

export function oddsHtml(plan) {
  if (!plan.rows.length) return '<p class="empty-note">نامزدی نیست.</p>';
  const has = fin(plan.sigma) && plan.sigma > 0;
  const rows = [...plan.rows].sort((a, b) => (fin(b.expected) ? b.expected : -Infinity) - (fin(a.expected) ? a.expected : -Infinity));
  return `${has ? '' : '<p class="note">تلاطم ضمنی کال فعلی درنیامد؛ ستون‌های احتمال خالی می‌مانند (عدد ساختگی نمی‌سازیم). تلاطم دستی را می‌شود در تنظیمات گذاشت.</p>'}
    <table class="data"><thead><tr><th>نماد</th><th>سررسید</th><th>اعمال</th><th>محدودهٔ به‌نفع</th>
      <th>فاصلهٔ قیمت امروز تا مرز</th><th>رشد لازم تا اعمال تازه</th><th>احتمال به نفع</th><th>امید سود اضافه</th>
      <th>سود اضافه با قیمت امروز</th><th>وضعیت</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td class="n">${days(r.days)}</td><td class="n">${fmt.money(r.strike)}</td>
      <td>${esc(rangeText(r.ranges))}</td><td class="n">${pct(r.edgePct)}</td><td class="n">${pct(r.strikeDistPct)}</td>
      <td class="n">${fin(r.prob) ? pct(r.prob * 100) : '—'}</td><td class="n ${tone(r.expected)}">${signed(r.expected)}</td>
      <td class="n ${tone(r.dNow)}">${signed(r.dNow)}</td><td>${verdictTag(r.verdict)}</td></tr>`).join('')}
    </tbody></table>
    <p class="note">«احتمال به نفع» یعنی احتمال اینکه پایه در سررسید پای تازه داخل «محدودهٔ به‌نفع» باشد؛ «امید» میانگین
      وزنی سود اضافه روی همهٔ قیمت‌های ممکن است. تلاطم: ${has ? `${pct(plan.sigma * 100)} سالانه` : '—'}.</p>`;
}

// ————————————————————————— نقشهٔ سررسید × اعمال —————————————————————————

export const GRID_METRICS = [
  { id: 'dNow', label: 'سود اضافه با قیمت امروز' },
  { id: 'expected', label: 'امید سود اضافه' },
  { id: 'prob', label: 'احتمال به نفع' },
  { id: 'netFlow', label: 'خالص نقدی رول' },
  { id: 'dMin', label: 'بدترین حالت' },
];

export function gridHtml(grid, plan) {
  if (!grid.days.length) return '<p class="empty-note">نامزدی نیست.</p>';
  const isProb = grid.metric === 'prob';
  const show = (v) => (isProb ? (fin(v) ? pct(v * 100) : '—') : compact(v));
  const heat = (v) => {
    if (!fin(v)) return '';
    if (isProb) {
      const t = Math.round(Math.abs(v - 0.5) * 2 * 40);
      return `background:color-mix(in srgb, var(${v >= 0.5 ? '--gain' : '--loss'}) ${t}%, transparent)`;
    }
    const side = v >= 0 ? grid.hi : -grid.lo;
    if (!(side > 0)) return '';
    const t = Math.round(Math.sqrt(Math.min(1, Math.abs(v) / side)) * 40);
    return `background:color-mix(in srgb, var(${v >= 0 ? '--gain' : '--loss'}) ${t}%, transparent)`;
  };
  const b = plan.baseline;
  return `<table class="data ccr-grid"><thead><tr><th>اعمال \\ سررسید</th>${grid.days.map((d) =>
    `<th>${days(d)}${Math.abs(d - b.days) < 1e-9 ? '<span class="unit">فعلی</span>' : ''}</th>`).join('')}</tr></thead><tbody>
    ${grid.strikes.map((k) => `<tr><td class="n"><b>${fmt.money(k)}</b>${Math.abs(k - b.K) < 1e-9 ? '<span class="unit">اعمال فعلی</span>' : ''}${k < b.spot ? '<span class="unit">درون پول</span>' : ''}</td>
      ${grid.days.map((d) => {
    const r = grid.at(d, k);
    if (!r) return '<td class="n">·</td>';
    const v = r[grid.metric];
    return `<td class="n" style="${heat(v)}" title="${esc(r.name)}${r.executable ? '' : ' — تخمینی'}">${show(v)}${r.executable ? '' : '<span class="unit">؟</span>'}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}

// ————————————————————————— پنجرهٔ اجرا —————————————————————————

const SOURCE_TEXT = {
  depth: 'کامل در دفتر', partial: 'عمق ناکافی', l1: 'سطح اول', ref: 'قیمت مرجع — بدون مظنه', none: '—',
};

export function executionHtml(plan) {
  const b = plan.baseline;
  const top = plan.rows.slice(0, 14);
  const buy = b.buybackWalk;
  const bbLine = `برای بستن کال فعلی باید <b>${faDigits(b.contracts)}</b> قرارداد بخرید. سطح اول عرضه
    <b>${fin(b.buybackL1) && b.buybackL1 > 0 ? fmt.money(b.buybackL1) : 'ندارد'}</b> و قیمت مبنای محاسبه
    <b>${fmt.money(b.buyback)}</b> است (${SOURCE_TEXT[b.buybackSource] || '—'}${buy ? ` · ${faDigits(buy.levels)} سطح مصرف شد${buy.full ? '' : ` · کسری ${fmt.num(buy.short)} قرارداد`}` : ''}).`;
  return `<table class="data"><thead><tr><th>نماد</th><th>منبع قیمت</th><th>قرارداد لازم</th><th>مظنهٔ سطح اول</th>
    <th>قیمت اجرای مبنا</th><th>افت مظنه</th><th>سطح مصرفی</th><th>کسری حجم</th><th title="چقدر از سود رول فقط به‌خاطر نازکی دفتر سفارش از دست می‌رود">هزینهٔ پنهان عمق</th></tr></thead><tbody>
    ${top.map((r) => `<tr><td><b>${esc(r.name)}</b></td>
      <td>${r.executable ? '<span class="tag gain">قابل اجرا</span>' : '<span class="tag warn">تخمینی</span>'} <span class="unit">${SOURCE_TEXT[r.premiumSource] || '—'}</span></td>
      <td class="n">${fmt.num(r.contracts)}</td><td class="n">${r.premiumL1 > 0 ? fmt.money(r.premiumL1) : '—'}</td>
      <td class="n"><b>${fmt.money(r.premium)}</b></td><td class="n ${fin(r.slipPct) && Math.abs(r.slipPct) > 5 ? 'loss' : ''}">${fin(r.slipPct) ? pct(Math.abs(r.slipPct)) : '—'}</td>
      <td class="n">${faDigits(r.levels)}</td><td class="n">${r.shortQty > 0 ? fmt.num(r.shortQty) : '—'}</td>
      <td class="n loss">${fin(r.depthCost) ? compact(r.depthCost) : '—'}</td></tr>`).join('')}</tbody></table>
    <p class="note">${bbLine} «هزینهٔ پنهان عمق» فقط در مبنای «عمق دفتر سفارش» ساخته می‌شود؛ عددی است که در محاسبهٔ
      سطح‌اولی اصلاً دیده نمی‌شود. دو پای رول هم‌زمان اجرا نمی‌شوند؛ بین بستن و فروش تازه ریسک قیمت هست.</p>`;
}

// ————————————————————————— سود و زیان تاریخی —————————————————————————

export function trackKpis(cc, breakdown, settle) {
  const s = breakdown?.summary;
  if (!s) return '';
  const k = (label, value, sub = '', cls = '') =>
    `<div class="kpi"><div class="k">${label}</div><div class="v ${cls}">${value}</div><div class="s">${sub}</div></div>`;
  return [
    k('سود خالص (پایانی)', compact(s.pnl), `${pct(s.retPct)} روی سرمایهٔ ${compact(cc.capital)}`, tone(s.pnl)),
    k('خرید و نگهداری سهم', compact(s.bh), 'اگر کال نمی‌فروختید', tone(s.bh)),
    k('ارزش افزودهٔ فروش کال', compact(s.valueAdded), 'سود کاوردکال منهای خرید و نگهداری', tone(s.valueAdded)),
    k('جزء سهم پایه', compact(s.stockLeg), 'پیش از کارمزد خروج', tone(s.stockLeg)),
    k('جزء اختیار', compact(s.optionLeg), 'پیش از کارمزد خروج', tone(s.optionLeg)),
    k('حداکثر افت از قله', compact(s.maxDD), `روزهای در سود ${pct(s.daysInProfitPct)}`, s.maxDD < 0 ? 'loss' : ''),
    k('فاصله از سربه‌سری', pct(settle.toBreakevenPct), `سربه‌سری با کارمزد ${fmt.money(settle.breakeven)}`, tone(settle.toBreakevenPct)),
  ].join('');
}

export function trackTableHtml(breakdown, tail = 15) {
  const rows = (breakdown?.rows || []).slice(-tail).reverse();
  if (!rows.length) return '';
  const date = (d) => { const s = String(d); return faDigits(`${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`); };
  return `<table class="data"><thead><tr><th>تاریخ (میلادی)</th><th>پایه</th><th>کال</th><th>سود خالص</th><th>بازده</th>
    <th>جزء سهم</th><th>جزء اختیار</th><th>خرید و نگهداری</th><th>ارزش افزوده</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="n">${date(r.date)}</td><td class="n">${fmt.money(r.spot)}</td><td class="n">${fmt.money(r.call)}</td>
      <td class="n ${tone(r.pnl)}">${fmt.money(r.pnl)}</td><td class="n">${pct(r.retPct)}</td>
      <td class="n ${tone(r.stockLeg)}">${fmt.money(r.stockLeg)}</td><td class="n ${tone(r.optionLeg)}">${fmt.money(r.optionLeg)}</td>
      <td class="n ${tone(r.bh)}">${fmt.money(r.bh)}</td><td class="n ${tone(r.valueAdded)}">${fmt.money(r.valueAdded)}</td></tr>`).join('')}
    </tbody></table>`;
}

// ————————————————————————— گزینه‌های نمودار —————————————————————————

const dateLabel = (d) => { const s = String(d); return faDigits(`${s.slice(4, 6)}/${s.slice(6, 8)}`); };
const axisMoney = (v) => compact(v);

/** سود کاوردکال در برابر خرید و نگهداری، و دو جزء آن. */
export function trackOption(breakdown, tokens) {
  const rows = breakdown?.rows || [];
  if (rows.length < 2) return null;
  const x = rows.map((r) => dateLabel(r.date));
  const line = (name, key, color, extra = {}) => ({
    name, type: 'line', showSymbol: false, data: rows.map((r) => r[key]), lineStyle: { width: 2, color }, itemStyle: { color }, ...extra,
  });
  return {
    tooltip: { trigger: 'axis', valueFormatter: chartFormat.money },
    legend: { top: 0, textStyle: { color: tokens.ink } },
    xAxis: { type: 'category', data: x, axisLabel: { color: tokens.muted } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: axisMoney }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [
      line('کاوردکال', 'pnl', tokens.accent, { lineStyle: { width: 3, color: tokens.accent },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: tokens.loss } } }),
      line('خرید و نگهداری', 'bh', tokens.muted, { lineStyle: { width: 2, type: 'dashed', color: tokens.muted } }),
      line('جزء سهم', 'stockLeg', tokens.series[1]),
      line('جزء اختیار', 'optionLeg', tokens.series[2]),
    ],
  };
}

/** مسیر قیمت پایه در برابر ورود، بهای تمام‌شده و اعمال. */
export function levelsOption(breakdown, cc, tokens) {
  const rows = breakdown?.rows || [];
  if (rows.length < 2) return null;
  const mark = (name, y, color) => ({ name, yAxis: y, lineStyle: { color, type: 'dashed' },
    label: { formatter: `${name} ${fmt.money(y)}`, color, position: 'insideEndTop' } });
  return {
    tooltip: { trigger: 'axis', valueFormatter: chartFormat.money },
    xAxis: { type: 'category', data: rows.map((r) => dateLabel(r.date)), axisLabel: { color: tokens.muted } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: tokens.muted, formatter: chartFormat.money }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      name: 'قیمت پایانی پایه', type: 'line', showSymbol: false, data: rows.map((r) => r.spot),
      lineStyle: { width: 2, color: tokens.accent }, itemStyle: { color: tokens.accent },
      markLine: { silent: true, symbol: 'none', data: [
        mark('ورود', cc.S0, tokens.muted), mark('بهای تمام‌شده', cc.nc0, tokens.loss), mark('اعمال', cc.K, tokens.series[3]),
      ] },
    }],
  };
}

/** موازنهٔ ریسک: بدترین حالت در برابر بهترین حالت هر نامزد، به تفکیک سررسید. */
export function tradeoffOption(plan, tokens) {
  if (!plan.rows.length) return null;
  const groups = [...new Set(plan.rows.map((r) => r.days))].sort((a, b) => a - b);
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => `${esc(p.data.name)}<br>بدترین حالت ${fmt.money(p.data.value[0])}<br>بهترین حالت ${fmt.money(p.data.value[1])}<br>با قیمت امروز ${fmt.money(p.data.now)}`,
    },
    legend: { top: 0, textStyle: { color: tokens.ink } },
    grid: { left: 64, right: 24, top: 64, bottom: 56, containLabel: true },
    xAxis: { type: 'value', name: 'بدترین حالت نسبت به رول‌نکردن', nameLocation: 'middle', nameGap: 28,
      axisLabel: { color: tokens.muted, formatter: axisMoney }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'value', name: 'بهترین حالت', nameLocation: 'middle', nameGap: 72, axisLabel: { color: tokens.muted, formatter: axisMoney }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: groups.map((d, i) => ({
      name: Math.abs(d - plan.baseline.days) < 1e-9 ? `همان سررسید (${days(d)})` : days(d),
      type: 'scatter', symbolSize: 14, itemStyle: { color: tokens.palette[i % tokens.palette.length] },
      data: plan.rows.filter((r) => r.days === d).map((r) => ({ name: r.name, value: [r.dMin, r.dMax], now: r.dNow })),
      label: { show: true, formatter: (p) => esc(p.data.name), position: 'top', color: tokens.muted },
      markLine: i ? undefined : { silent: true, symbol: 'none', lineStyle: { color: tokens.line }, data: [{ xAxis: 0 }, { yAxis: 0 }] },
    })),
  };
}

/** نردبان سررسید به شکل ستون: سود اضافهٔ بهترین گزینهٔ هر سررسید و بدترین حالتش. */
export function ladderOption(ladder, tokens) {
  if (!ladder.length) return null;
  const x = ladder.map((l) => (l.extraDays > 0 ? `+${days(l.extraDays)}` : 'همان سررسید'));
  return {
    tooltip: { trigger: 'axis', valueFormatter: chartFormat.money },
    legend: { top: 0, textStyle: { color: tokens.ink } },
    xAxis: { type: 'category', data: x, axisLabel: { color: tokens.muted } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: axisMoney }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [
      { name: 'سود اضافه با قیمت امروز', type: 'bar', data: ladder.map((l) => ({
        value: l.best.dNow, itemStyle: { color: l.best.dNow >= 0 ? tokens.gain : tokens.loss } })) },
      { name: 'امید سود اضافه', type: 'bar', data: ladder.map((l) => (fin(l.best.expected) ? l.best.expected : null)),
        itemStyle: { color: tokens.accent } },
      { name: 'بدترین حالت', type: 'line', data: ladder.map((l) => l.best.dMin), lineStyle: { color: tokens.warn, type: 'dashed' },
        itemStyle: { color: tokens.warn } },
    ],
  };
}
