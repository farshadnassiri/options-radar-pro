// ترکیب‌ساز و اسکنر.
//
// تعداد ترکیب با تعداد پا رشد انفجاری دارد: کندور چهار قیمت اعمال می‌خواهد و
// روی پانزده قیمت اعمال، ۱۳۶۵ ترکیب در هر سررسید می‌سازد. سه مهار داریم:
//
//   ۱. پنجره قیمت اعمال — به‌طور پیش‌فرض فقط وقتی سقف مجبور کند
//      (`core/strike-window.mjs`؛ درصد ثابت هنوز هست ولی دیگر پیش‌فرض نیست)
//   ۲. بال مساوی برای باترفلای و کندور
//   ۳. سقف ترکیب هر سررسید و سقف ردیف کل
//
// و یک قاعده: هر ترکیبی که یک پایش مظنه ندارد، در مبنای دفتر سفارش می‌افتد.
// این حذف‌ها شمرده و در نوار تشخیص نمایش داده می‌شوند، چون در بازار ایران
// خالی بودن تب باترفلای خطای برنامه نیست، واقعیت نقدشوندگی است.

import { num, EPS } from './num.mjs';
import { evaluate } from './evaluate.mjs';
import { assetClassMap, assetClassOf } from './settings.mjs';
import {
  underlyingQuote, legContractSize, comboContractSize,
  blockedExpirySet, expiryBlocked,
} from './chain.mjs';
import { selectStrikes, fairShare, enumBudget } from './strike-window.mjs';

// سررسیدهای پرشده جای اصلی‌شان `core/chain.mjs` است، چون فقط مسیر زنده
// نیست که به آن نیاز دارد — تحلیل تاریخی و بک‌تست هم باید همان سررسید را
// کنار بگذارند. اینجا دوباره صادر می‌شود تا مصرف‌کننده‌های قبلی نشکنند.
export { blockedExpirySet, expiryBlocked };

/** انتخاب k عضوی از فهرست، به ترتیب صعودی. */
function combos(arr, k, cap) {
  const out = [];
  const pick = (start, acc) => {
    if (out.length >= cap) return;
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      pick(i + 1, acc);
      acc.pop();
      if (out.length >= cap) return;
    }
  };
  pick(0, []);
  return out;
}

/** بال مساوی: فاصله‌ها باید یکی باشند. باترفلای ۹۰-۱۰۰-۱۱۰ می‌ماند، ۹۰-۱۰۰-۱۳۰ می‌افتد. */
function equalWidth(ks) {
  if (ks.length < 3) return true;
  const w = ks[1] - ks[0];
  for (let i = 2; i < ks.length; i++) {
    if (Math.abs(ks[i] - ks[i - 1] - w) > Math.max(1, w * 0.02)) return false;
  }
  return true;
}

// سطل‌های شمارشیِ نوار تشخیص. `evaluated` هم شمارشی است و باید جمع شود —
// نبودنش در این فهرست یعنی نمای «برترین موقعیت‌ها» همیشه «۰ ترکیب ارزیابی
// شد» گزارش می‌کرد، در حالی که هزاران‌تا ارزیابی شده بود.
//
// `capped` عمداً اینجا نیست: بولی است نه عدد، و جمعش معنی ندارد. تجمیعش
// جداگانه با «یا» انجام می‌شود.
const FUNNEL_KEYS = ['built', 'noQuote', 'refBasis', 'noDepth', 'filtered', 'kept',
  'blockedExpiry', 'evaluated', 'outOfWindow'];


/**
 * چرا ردیف ادعای اجرا ندارد.
 *
 * قبلاً هر ردیف غیرقابل‌اجرا در سطل «عمق ناکافی» می‌افتاد. آن برچسب برای دو
 * حالت پرتکرار دروغ بود:
 *
 *   مبنای قیمت مرجع    پایانی و آخرین و کمترین و بیشترین، طبق طراحی ادعای
 *                      اجرا ندارند. هیچ ربطی به عمق ندارد و «خرابی» هم نیست،
 *                      ولی کاربر جز یک تب خالی چیزی نمی‌دید.
 *   حجم مظنه صفر       قیمت هست ولی حجمی پشتش نیست. این بی‌مظنه بودن است،
 *                      نه کم بودن عمق.
 *
 * علت واقعی از کیفیت ماشین‌خوان هر پا می‌آید، نه از متن برچسب.
 */
export function unexecutableReason(row) {
  const q = (row.legPrices || []).map((l) => l.quality);
  if (q.some((x) => x === 'reference')) return 'refBasis';
  if (q.some((x) => x === 'none')) return 'noQuote';
  return 'noDepth';
}

export function emptyFunnel() {
  return { built: 0, noQuote: 0, refBasis: 0, noDepth: 0, filtered: 0, kept: 0, blockedExpiry: 0, evaluated: 0, outOfWindow: 0, capped: false };
}

/**
 * ترکیب‌های یک استراتژی برای یک نماد پایه.
 * خروجی، ورودی آماده ارزیاب است: پاها، مظنه هر پا، و متن هویت.
 */
export function generateCombos(def, ua, s, funnel = emptyFunnel()) {
  const spot = ua.close || ua.last;
  if (!(spot > 0)) return [];

  // نقدشوندگی زنجیره: مجموع ارزش معاملات امروز کل زنجیره همین پایه، نه یک
  // قرارداد. پایه‌ای که کل زنجیره‌اش خوابیده، حتی اگر یک مظنه تنها زنده
  // مانده باشد، ارزش اسکن ندارد.
  if (s.minUaLiquidity > 0) {
    let uaValue = 0;
    for (const ex of ua.expiryList) {
      for (const row of ex.strikeList) uaValue += row.call.value + row.put.value;
    }
    if (uaValue < s.minUaLiquidity) return [];
  }

  const out = [];
  const needsStock = def.legs.some((l) => l.kind === 'underlying');
  const uaQ = underlyingQuote(ua);

  const blocked = blockedExpirySet(s.blockedExpiries);
  const inWindow = ua.expiryList.filter((ex) => ex.days >= s.minDays && ex.days <= s.maxDays);
  const expiries = inWindow.filter((ex) => !expiryBlocked(blocked, ua.ins, ex.endDate));
  funnel.blockedExpiry += inWindow.length - expiries.length;
  const pairs = def.expiries > 1
    ? expiries.flatMap((a, i) => expiries.slice(i + 1).map((b) => [a, b]))
    : expiries.map((a) => [a]);

  // سهم برابر هر سررسید از سقف ردیف. بی این، حلقه از نزدیک‌ترین سررسید
  // شروع می‌کرد و سقف را همان‌جا تمام می‌کرد؛ سررسید دور اصلاً نوبتش
  // نمی‌رسید و کاربر نبودنش را «قرارداد نیست» می‌خواند.
  const share = fairShare(s.maxRows, pairs.length, s.maxCombosPerExpiry);

  for (const exSet of pairs) {
    if (out.length >= s.maxRows) { funnel.capped = true; break; }
    const near = exSet[0];
    // قیمت اعمال باید در همه سررسیدهای این ترکیب موجود باشد
    const shared = near.strikeList.filter((row) => exSet.every((ex) => ex.strikes.has(row.strike)));
    // سقفِ پنجره بودجهٔ **شمارش** است، نه بودجهٔ خروجی. خروجی را
    // `made >= share` نگه می‌دارد و آن فقط ترکیبِ پذیرفته‌شده را می‌شمارد؛
    // اگر پنجره هم همان عدد را بگیرد، پیش از آزمونِ مظنه می‌بُرد و بودجه
    // صرفِ ترکیب‌هایی می‌شود که بی‌مظنه‌اند و اصلاً برنمی‌گردند.
    const budget = enumBudget(share);
    const pick = selectStrikes({
      strikes: shared.map((row) => row.strike), spot, legs: def.strikes, cap: budget,
      mode: s.comboWindowMode, pct: s.comboWindowPct, steps: s.comboWindowSteps,
    });
    funnel.outOfWindow += pick.dropped.length;
    if (pick.forced) funnel.capped = true;
    const inWin = new Set(pick.picked);
    const usable = shared.filter((row) => inWin.has(row.strike));
    if (usable.length < def.strikes) continue;

    const ks = usable.map((r) => r.strike);
    const sets = def.strikes === 1 ? ks.map((k) => [k]) : combos(ks, def.strikes, budget);

    let made = 0;
    for (const set of sets) {
      if (made >= share) { funnel.capped = true; break; }
      if (def.strikes >= 3 && s.wingsEqualWidth && !equalWidth(set)) continue;
      funnel.built += 1;

      // پاها و مظنه‌ها.
      //
      // اندازه هر پای اختیار از مشخصات خودِ همان قرارداد می‌آید. پای سهم
      // پایه اندازه اعلامی ندارد — تعداد سهمش باید با اندازه قراردادی بخواند
      // که پوشش می‌دهد — پس اول پاهای اختیار ساخته می‌شوند و اندازه پای سهم
      // از آن‌ها می‌آید، نه از `strikeList[0]` که قرارداد اول سررسید نزدیک
      // است و لزوماً در این ترکیب نیست.
      //
      // امروز این دو عدد یکی درمی‌آیند، چون استراتژی‌های دارای پای سهم همه
      // تک‌سررسیدی‌اند و افزایش سرمایه کل یک سری را با هم تعدیل می‌کند، پس
      // در یک سررسید همه قیمت‌های اعمال یک اندازه دارند. ولی منبع درست،
      // قراردادهای همین ترکیب است؛ با منبع غلط، اولین استراتژی چندسررسیدیِ
      // دارای سهم بی‌صدا می‌شکست.
      const legs = [];
      const quotes = [];
      let missing = false;
      let sizeAssumed = false;
      const optionSizes = [];
      let stockSlot = -1;
      for (const t of def.legs) {
        if (t.kind === 'underlying') {
          stockSlot = legs.length;
          legs.push({ kind: 'underlying', side: t.side, ratio: t.ratio, size: 0, price: 0 });
          quotes.push(uaQ);
          if (!(uaQ.bid > 0 || uaQ.ask > 0)) missing = true;
          continue;
        }
        const K = set[t.slot - 1];
        const ex = exSet[Math.min(t.exp, exSet.length - 1)];
        const row = ex.strikes.get(K);
        const q = t.kind === 'call' ? row.call : row.put;
        // فروش به بهترین تقاضا نیاز دارد، خرید به بهترین عرضه
        const px = t.side === 'sell' ? q.bid : q.ask;
        if (!(px > 0)) missing = true;
        if (t.side === 'sell' && (q.bidQty < s.minBidQty || q.oi < s.minOpenInt)) missing = true;
        if (q.vol < s.minLegVol || q.value < s.minLegValue) missing = true;
        const sz = legContractSize(row.size, s.contractSize);
        if (sz.assumed) sizeAssumed = true;
        optionSizes.push(row.size);
        legs.push({
          kind: t.kind, side: t.side, ratio: t.ratio, strike: K, size: sz.size,
          sizeAssumed: sz.assumed,
          days: ex.days, price: 0, ins: q.ins, name: q.name, exp: t.exp, slot: t.slot,
        });
        quotes.push(q);
      }

      const comboSize = comboContractSize(optionSizes, s.contractSize);
      if (stockSlot >= 0) {
        legs[stockSlot].size = comboSize.size;
        legs[stockSlot].sizeAssumed = comboSize.assumed;
        if (comboSize.assumed) sizeAssumed = true;
      }

      if (missing && !s.showUnexecutable) { funnel.noQuote += 1; continue; }
      made += 1;
      out.push({
        def, legs, quotes,
        underlying: ua.name, uaIns: ua.ins,
        days: near.days, endDate: near.endDate,
        expiryDays: exSet.map((e) => e.days),
        spot, spotClose: ua.close || ua.last,
        size: comboSize.size, sizeAssumed, sizeMixed: comboSize.mixed,
        strikes: set,
        hasQuoteGap: missing,
        needsStock,
      });
      if (out.length >= s.maxRows) { funnel.capped = true; break; }
    }
  }
  return out;
}

/** فیلترهای غربال روی ردیف ارزیابی‌شده. */
export function passesFilters(row, s) {
  // ردیف مطالعه‌ای، عدد اجرایی ندارد و فیلترهای بازده به آن نمی‌خورد؛
  // فقط برای این هست که ببینی چه ترکیبی وجود دارد و چرا اجرا نمی‌شود.
  if (!row.executable && s.showUnexecutable) return true;
  if (!Number.isFinite(row.capital) || row.capital <= 0) return false;
  // کف سرمایه. ترکیبی که سرمایه درگیرش چند ریال است، بازده درصدیِ بی‌معنی
  // می‌سازد و صدر جدول می‌نشیند — در حالی که با آن مبلغ اصلاً باز نمی‌شود.
  // پیش‌فرض صفر است: آستانه سلیقهٔ کاربر است، نه حکم مدل.
  if (num(s.minCapital, 0) > 0 && row.capital < s.minCapital) return false;
  if (Number.isFinite(s.minReturnPct) && row.retMaxPct < s.minReturnPct) return false;
  for (const l of row.legPrices) {
    if (Number.isFinite(l.spreadPct) && l.spreadPct > s.maxSpreadPct) return false;
  }
  return true;
}

/**
 * اسکن یک استراتژی روی چند نماد پایه.
 * تابع خالص است و در ریسه جدا هم اجرا می‌شود.
 */
export function scan({ def, chain, uaKeys, settings, sigmaByUa = {}, sigmaSourceByUa = {}, qty }) {
  const s = settings;
  const funnel = emptyFunnel();
  const rows = [];
  const t0 = Date.now();

  const classes = assetClassMap(s.assetClassMap);
  for (const key of uaKeys) {
    const ua = chain.get(key);
    if (!ua) continue;
    const cs = generateCombos(def, ua, s, funnel);
    for (const c of cs) {
      let row;
      try {
        row = evaluate({
          legs: c.legs.map((l) => ({ ...l, price: undefined })),
          quotes: c.quotes,
          ctx: {
            S: c.spot, Sclose: c.spotClose, days: c.days, size: c.size,
            sizeMixed: c.sizeMixed,
            qty: qty ?? s.qtyDefault, settings: s, def,
            underlying: c.underlying, sigmaHist: sigmaByUa[key], sigmaHistSource: sigmaSourceByUa[key],
            // نوع پایه، از نگاشت اعلامی کاربر. نرخ کارمزد پای سهم از همین
            // می‌آید و ردیف هم می‌گوید کدام نرخ خورده است.
            assetClass: assetClassOf(classes, ua),
            // سررسید تا امروز فقط به‌شکل «روز مانده» می‌رسید. دو ترکیب با
            // ۲۳ روز مانده می‌توانند دو سررسید متفاوت باشند و «روز» این را
            // نمی‌گوید؛ ستون «تاریخ سررسید» بدون این، خالی می‌ماند.
            endDate: c.endDate,
            greeks: s.greeksInScan,
          },
        });
      } catch { continue; }
      funnel.evaluated += 1;

      if (!row.executable && !s.showUnexecutable) { funnel[unexecutableReason(row)] += 1; continue; }
      if (!passesFilters(row, s)) { funnel.filtered += 1; continue; }

      row.uaIns = c.uaIns;
      row.legIns = c.legs.map((l) => l.ins).filter(Boolean);
      row.expiryDays = c.expiryDays;
      row.strikeSet = c.strikes;
      row.id = `${def.id}|${c.uaIns}|${c.expiryDays.join('-')}|${c.strikes.join('-')}`;
      rows.push(row);
      funnel.kept += 1;
    }
  }

  const by = s.rankBy || 'retMonthPct';
  rows.sort((a, b) => {
    const x = a[by], y = b[by];
    const xf = Number.isFinite(x) ? x : -Infinity;
    const yf = Number.isFinite(y) ? y : -Infinity;
    return yf - xf;
  });

  return { rows: rows.slice(0, s.topN), funnel, ms: Date.now() - t0, total: rows.length };
}

/**
 * غربال روی کل کاتالوگ یک‌جا — «برترین موقعیت‌ها». فقط مرحله یک، بدون عمق
 * دفتر سفارش؛ برای عدد اجرایی هنوز باید همان تب استراتژی را باز کرد و اسکن
 * دومرحله‌ای کامل زد. اجرای عمق برای ۳۱ استراتژی یک‌جا یعنی ۳۱ درخواست
 * دفتر سفارش پیاپی — هزینه‌ای که این نمای کلی اولیه توجیهش نمی‌کند.
 *
 * رتبه‌بندی مشترک همان `s.rankBy` است، دقیقاً همان معیاری که هر تب استراتژی
 * تنها روی خودش اعمال می‌کند؛ اینجا همان معیار روی همه ردیف‌های همه
 * استراتژی‌ها با هم اعمال می‌شود.
 */
export function scanAll({ defs, chain, uaKeys, settings, sigmaByUa = {}, sigmaSourceByUa = {}, qty, limit = 50 }) {
  const t0 = Date.now();
  const funnel = emptyFunnel();
  const rows = [];
  // شمار کل، جمع شمارِ هر استراتژی است — نه طول آرایهٔ نهایی. هر `scan`
  // ردیف‌هایش را در `topN` می‌بُرد، پس جمعِ آرایه‌های بریده‌شده «چند ترکیب
  // پیدا شد» را نمی‌گوید، «چند ترکیب از برش جان به در برد» را می‌گوید. با
  // topN=۵۰ و ۳۱ استراتژی، ۴۵۹۳ ترکیب «۳۲۸۸» گزارش می‌شد.
  let total = 0;
  for (const def of defs) {
    const res = scan({ def, chain, uaKeys, settings, sigmaByUa, sigmaSourceByUa, qty });
    for (const k of FUNNEL_KEYS) funnel[k] += res.funnel[k] || 0;
    // «به سقف خورد» بولی است: اگر حتی یک استراتژی به سقف بخورد، نمای کلی
    // هم به سقف خورده و هشدارش نباید پنهان بماند.
    if (res.funnel.capped) funnel.capped = true;
    total += res.total;
    rows.push(...res.rows);
  }

  const by = settings.rankBy || 'retMonthPct';
  rows.sort((a, b) => {
    const xf = Number.isFinite(a[by]) ? a[by] : -Infinity;
    const yf = Number.isFinite(b[by]) ? b[by] : -Infinity;
    return yf - xf;
  });

  return { rows: rows.slice(0, limit), total, funnel, ms: Date.now() - t0 };
}

export { FUNNEL_KEYS };
