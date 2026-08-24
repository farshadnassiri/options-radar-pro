// موتور وجه تضمین.
//
// مبنای مقرراتی: ضوابط وجه تضمین قرارداد اختیار معامله سهام در بورس تهران و
// فرابورس. این بخش با شش مشاهده تابلوی کارگزاری تثبیت شده است:
//
//   مقدار در زیان بودن قرارداد  کال = max(0, K - S)   پوت = max(0, S - K)
//   base   = max( A*S - OTM , B*S ) * اندازه قرارداد
//   IM     = گردکردن base به بالا، به مضرب C          ← تنها جای گردکردن
//   RM     = IM + قیمت پایانی اختیار * اندازه قرارداد  ← گرد نمی‌شود
//   MM     = ضریب نگهداشت * RM
//
// چهار نکته‌ای که تابلو تثبیت کرد:
//   ۱. گردکردن فقط روی وجه تضمین اولیه است
//   ۲. C برابر ۱۰٫۰۰۰ ریال است، نه ۱۰۰٫۰۰۰
//   ۳. گردکردن استاندارد به بالا است، نه «همیشه یک واحد اضافه»
//   ۴. جزء B بر قیمت پایانی دارایی پایه بنا شده، نه قیمت اعمال
//
// ——— قاعده چندپا ———
// بستانکار خالص  → وجه تضمین گرفته می‌شود
// بدهکار خالص    → وجه تضمین گرفته نمی‌شود
//
// ملاک، بستانکاری است نه جهت استراتژی. این دو یکی نیستند: اسپرد پوت صعودی
// بستانکار است و اسپرد پوت نزولی بدهکار، هر دو صعودی و نزولی بودنشان
// برخلاف انتظار در قاعده وجه تضمین بی‌اثر است.

import { num, ok, ceilTo, nearly, EPS } from './num.mjs';
import { grossCash, signedQty } from './payoff.mjs';

export const DEFAULT_PARAMS = { A: 0.20, B: 0.10, C: 10000, maint: 0.70, bBasis: 'STRIKE' };

export function otmAmount(S, K, kind) {
  return kind === 'call' ? Math.max(0, K - S) : Math.max(0, S - K);
}

/**
 * پایه وجه تضمین و اینکه کدام جزء مقید کرده است.
 *
 * ——— مبنای جزء B ———
 *
 * متن ضوابط منتشرشده، جزء B را بر قیمت اعمال می‌نویسد. شش مشاهدهٔ تابلوی
 * کارگزاری با مبنای قیمت پایه بازتولید شده‌اند، اما آن نمونه‌ها زمان و منبع
 * برداشت ندارند و برای کنارگذاشتن متن ضوابط کافی نیستند. حسابرسی مستقل روی
 * ۷٬۹۲۵ پای فروش، بیشینه اختلاف ۷٫۳۴ میلیون ریال برای یک محاسبه شمرد.
 *
 * انتخاب برای تطبیق با صورتحساب کارگزار صریح می‌ماند، ولی پیش‌فرض مقرراتی
 * `STRIKE` است. `SPOT` فقط حالت سازگاری با نمونه‌های قدیمی تابلوست.
 */
export function marginBase(S, K, size, kind, p = DEFAULT_PARAMS) {
  const legA = (p.A * S - otmAmount(S, K, kind)) * size;
  const legB = p.B * (p.bBasis === 'STRIKE' ? K : S) * size;
  return { base: Math.max(legA, legB), legA, legB, binding: legA >= legB ? 'A' : 'B' };
}

export function initialMargin(S, K, size, kind, p = DEFAULT_PARAMS) {
  return ceilTo(marginBase(S, K, size, kind, p).base, p.C);
}

export function requiredMargin(S, K, size, kind, optClose, p = DEFAULT_PARAMS) {
  return initialMargin(S, K, size, kind, p) + num(optClose) * size;
}

export function minMargin(rm, p = DEFAULT_PARAMS) {
  return p.maint * rm;
}

/**
 * قیمت تقریبی پایه که در آن حساب کال مارجین می‌شود.
 * فرض: قیمت پایانی اختیار در سناریو دست‌کم برابر ارزش ذاتی همان قیمت است.
 * پس عدد خروجی کف است نه سقف، چون ارزش زمانی لحاظ نشده.
 * وجه تضمین لازم در S یکنواست، پس تنصیف جواب می‌دهد و پیمایش لازم نیست.
 */
export function marginCallPrice(S, K, size, kind, optClose, equity, p = DEFAULT_PARAMS) {
  if (!(equity > 0)) return NaN;
  const need = (s) => {
    const intr = kind === 'call' ? Math.max(0, s - K) : Math.max(0, K - s);
    return minMargin(requiredMargin(s, K, size, kind, Math.max(num(optClose), intr), p), p);
  };
  const dir = kind === 'call' ? 1 : -1;
  let lo = S;
  let hi = kind === 'call' ? S * 3 : S * 0.02;
  if (need(hi) <= equity) return NaN;              // حتی در انتها هم کال مارجین نمی‌شود
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (need(mid) > equity) hi = mid; else lo = mid;
  }
  return dir === 1 ? hi : hi;
}

// ——————————————— اعتبارسنجی با تابلو ———————————————

/** اجزای محاسبه در برابر اعداد تابلو. */
export function verifyMargin({ S, K, size, kind, optClose, imRef, rmRef, params = DEFAULT_PARAMS, tol = 5e-3 }) {
  const mb = marginBase(S, K, size, kind, params);
  const im = initialMargin(S, K, size, kind, params);
  const rm = requiredMargin(S, K, size, kind, optClose, params);
  const rows = [
    ['مقدار در زیان بودن قرارداد', otmAmount(S, K, kind) * size],
    [`جزء A  (${params.A} × S − OTM)`, mb.legA],
    [`جزء B  (${params.B} × ${params.bBasis === 'STRIKE' ? 'قیمت اعمال' : 'S'})`, mb.legB],
    ['پایه انتخابی (بزرگ‌تر)', mb.base],
    [`گردشده به مضرب ${params.C}`, im],
    ['قیمت پایانی اختیار × اندازه', num(optClose) * size],
    ['وجه تضمین لازم', rm],
    ['حداقل وجه تضمین', minMargin(rm, params)],
  ];
  return {
    rows, im, rm, binding: mb.binding,
    imOk: imRef == null ? null : nearly(im, imRef, tol),
    rmOk: rmRef == null ? null : nearly(rm, rmRef, tol),
    identityOk: rmRef == null || imRef == null ? null : nearly(imRef + num(optClose) * size, rmRef, tol),
  };
}

/**
 * بازه قیمت پایانی پایه که وجه تضمین اولیه تابلو را بازتولید می‌کند.
 *
 * وجه تضمین اولیه در S یکنوا و ناکاهنده است — جزء A برای S زیر قیمت اعمال
 * برابر 1.2S−K و بالای آن 0.2S است، جزء B برابر 0.1S، و هر سه صعودی‌اند.
 * پس به‌جای پیمایش سه‌صد‌هزار نقطه‌ای، دو تنصیف کافی است.
 */
export function impliedUnderlying({ K, size, kind, imRef, params = DEFAULT_PARAMS, sMaxMult = 8 }) {
  const f = (s) => initialMargin(s, K, size, kind, params);
  const hiS = K * sMaxMult;
  if (f(hiS) < imRef || f(1e-6) > imRef) return { ok: false, lo: null, hi: null, binding: '' };

  // کوچک‌ترین S با f(S) >= imRef
  const firstAtLeast = (target) => {
    let lo = 0, hi = hiS;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) >= target) hi = mid; else lo = mid;
    }
    return hi;
  };
  const lo = firstAtLeast(imRef);
  const hi = firstAtLeast(imRef + params.C);       // اولین S که یک پله بالاتر می‌رود
  if (f(lo) !== imRef) return { ok: false, lo: null, hi: null, binding: '' };
  const mb = marginBase((lo + hi) / 2, K, size, kind, params);
  return { ok: true, lo, hi, binding: mb.binding };
}

// ——————————————— پوشش موقعیت چندپا ———————————————

/**
 * برای هر پای فروش، دنبال پای خریدِ محافظ می‌گردد.
 *
 * شرط اعتبار پوشش:
 *   هم‌نوع   کال با کال، پوت با پوت
 *   سررسید  سررسید پای خرید ≥ سررسید پای فروش
 *   نسبت    تعداد پای خرید ≥ تعداد پای فروش
 *
 * قیمت اعمال شرط پوشش نیست، اندازه زیان را تعیین می‌کند. هر کال خریداری‌شده،
 * زیان نامحدود یک کال فروخته‌شده را می‌بندد؛ اگر اعمالش بالاتر باشد زیان به
 * فاصله دو قیمت اعمال محدود می‌شود و اگر پایین‌تر باشد زیانی نمی‌ماند.
 *   فاصله موثر  کال = max(0, اعمال خرید − اعمال فروش)
 *               پوت = max(0, اعمال فروش − اعمال خرید)
 *
 * پای فروش کال با سهم پایه هم پوشش می‌گیرد — همان کاوردکال.
 * هر بخشی که پوشش نداشته باشد، لخت است و وجه تضمین کامل می‌گیرد،
 * حتی اگر کل ترکیب بدهکار باشد. نسبت‌اسپرد با فروش بیشتر، نمونه اصلی‌اش است.
 */
/** فاصله موثر بین پای فروش و پای محافظ. همان بیشترین زیان هر واحد پوشش. */
export function effWidth(kind, kShort, kLong) {
  return kind === 'call' ? Math.max(0, kLong - kShort) : Math.max(0, kShort - kLong);
}

export function coverage(legs, contractSize = 1000) {
  const shorts = [];
  const pool = legs
    .filter((l) => l.side === 'buy' && (l.kind === 'call' || l.kind === 'put'))
    .map((l) => ({ leg: l, left: num(l.ratio, 1) }));
  let shares = legs
    .filter((l) => l.kind === 'underlying' && l.side === 'buy')
    .reduce((s, l) => s + num(l.ratio, 1) * num(l.size, 1), 0);

  for (const s of legs.filter((l) => l.side === 'sell' && (l.kind === 'call' || l.kind === 'put'))) {
    let need = num(s.ratio, 1);
    const rec = { leg: s, covered: 0, naked: 0, by: [] };

    if (s.kind === 'call' && shares > 0) {
      const canCover = Math.min(need, shares / num(s.size, contractSize));
      if (canCover > 0) {
        shares -= canCover * num(s.size, contractSize);
        need -= canCover;
        rec.covered += canCover;
        rec.by.push({ what: 'underlying', ratio: canCover });
      }
    }

    const ok2 = (b) =>
      b.leg.kind === s.kind &&
      num(b.leg.days, num(s.days, 0)) >= num(s.days, 0) - EPS;

    // محافظی که کمترین فاصله موثر را بسازد، بهترین پوشش است
    const cands = pool.filter((b) => b.left > 0 && ok2(b)).sort((x, y) =>
      s.kind === 'call'
        ? num(x.leg.strike) - num(y.leg.strike)
        : num(y.leg.strike) - num(x.leg.strike)
    );
    for (const b of cands) {
      if (need <= EPS) break;
      const take = Math.min(need, b.left);
      b.left -= take;
      need -= take;
      rec.covered += take;
      rec.by.push({ what: 'option', strike: num(b.leg.strike), ratio: take });
    }
    rec.naked = Math.max(0, need);
    shorts.push(rec);
  }

  const nakedRatio = shorts.reduce((a, r) => a + r.naked, 0);
  const shortRatio = shorts.reduce((a, r) => a + num(r.leg.ratio, 1), 0);
  return {
    shorts,
    nakedRatio,
    state: shortRatio === 0 ? 'none' : nakedRatio <= EPS ? 'full' : nakedRatio >= shortRatio - EPS ? 'naked' : 'partial',
  };
}

/**
 * وجه تضمین کل استراتژی.
 *
 * ctx: { S, closes: {byLegIndex}, params, creditMode, includeCredit }
 *   S         قیمت پایانی دارایی پایه
 *   closes    قیمت پایانی هر پای اختیار، مبنای جزء دوم وجه تضمین لازم
 *   creditMode  FULL | LESS_WIDTH | WIDTH  ← مقدار وجه تضمین اسپرد بستانکار
 *
 * خروجی، به‌علاوه یک ستون شرطی: اگر پوشش از بین برود، چقدر وجه تضمین ناگهان
 * مطالبه می‌شود. آن عدد هشدار نقدینگی است، نه مخرج بازده.
 */
export function strategyMargin(legs, ctx = {}) {
  const p = ctx.params || DEFAULT_PARAMS;
  const S = num(ctx.S);
  const closes = ctx.closes || {};
  const mode = ctx.creditMode || 'FULL';
  const contractSize = num(ctx.contractSize, 1000);
  const cov = coverage(legs, contractSize);
  const cash = grossCash(legs);
  const isCredit = cash > EPS;

  const perLeg = [];
  let total = 0;
  let conditional = 0;

  legs.forEach((l, i) => {
    if (l.side !== 'sell' || l.kind === 'underlying') return;
    const size = num(l.size, contractSize);
    const kind = l.kind;
    const close = num(closes[i], num(l.price, 0));
    const rmOne = requiredMargin(S, num(l.strike), size, kind, close, p);
    const rec = cov.shorts.find((r) => r.leg === l) || { covered: 0, naked: num(l.ratio, 1), by: [] };

    // بخش لخت: همیشه وجه تضمین کامل، حتی در ترکیب بدهکار
    let due = rmOne * rec.naked;

    // بخش پوشش‌دار
    if (rec.covered > EPS) {
      const byOpt = rec.by.filter((b) => b.what === 'option');
      if (isCredit && byOpt.length) {
        const width = byOpt.reduce((w, b) => w + effWidth(kind, num(l.strike), b.strike) * b.ratio, 0) * size;
        if (mode === 'FULL') due += rmOne * rec.covered;
        else if (mode === 'LESS_WIDTH') due += Math.max(0, rmOne * rec.covered - width);
        else due += width;
      }
      // پوشش با سهم پایه — کاوردکال — وجه تضمین نقدی ندارد
      // ترکیب بدهکار با پوشش اختیار — وجه تضمین ندارد
    }

    // اگر پای محافظ از بین برود، همین پا کامل مطالبه می‌شود
    conditional += rmOne * num(l.ratio, 1);

    total += due;
    perLeg.push({
      index: i, strike: num(l.strike), kind, size, ratio: num(l.ratio, 1),
      initial: initialMargin(S, num(l.strike), size, kind, p),
      required: rmOne,
      premium: close * size,
      minimum: minMargin(rmOne, p),
      covered: rec.covered, naked: rec.naked, due,
      days: num(l.days, NaN),
      nakedDue: rmOne * rec.naked,
    });
  });

  // ——— قاعدهٔ ترکیبی فروش کال و پوت ———
  //
  // بندهای ۶ و ۷ ضوابط، استرادل و استرانگل فروش هم‌ماه را یک راهبرد
  // می‌شناسند: بزرگ‌ترِ وجه تضمین لازم دو سمت، به‌علاوهٔ قیمت پایانی
  // قراردادی که وجه تضمین اولیه کمتری دارد. بنابراین جمع دو وجه تضمین،
  // مبنای راهبردی نیست. فقط تعداد برابر کال و پوت با هم جفت می‌شود؛ مازاد
  // هر سمت همچنان فروش لخت مستقل است.
  // استرانگل هم فقط وقتی شناخته می‌شود که اعمال کال بالاتر از اعمال پوت
  // باشد. ترکیب وارونه در جدول ضوابط نیامده و اینجا عدد مقرراتی نمی‌سازد.
  const comboMode = ctx.nakedComboMargin || 'MAX_PLUS_PREMIUM';
  let comboRule = 'SUM';
  let components = perLeg
    .filter((l) => l.due > EPS)
    .map((l) => ({ type: 'leg', amount: l.due, legIndexes: [l.index], sortIndex: l.index }));
  if (comboMode === 'MAX_PLUS_PREMIUM') {
    const nakedCalls = perLeg.filter((l) => l.kind === 'call' && l.naked > EPS);
    const nakedPuts = perLeg.filter((l) => l.kind === 'put' && l.naked > EPS);
    // فقط ترکیب تمیزِ یک کال و یک پوتِ کاملاً لخت و هم‌سررسید. پای
    // نیمه‌پوشیده و چندسررسید بیرون می‌مانند، چون ضوابط آن‌ها را راهبرد ۶
    // یا ۷ نمی‌شناسد.
    if (nakedCalls.length === 1 && nakedPuts.length === 1
      && nakedCalls[0].covered <= EPS && nakedPuts[0].covered <= EPS
      && nakedCalls[0].days === nakedPuts[0].days
      && nakedCalls[0].strike >= nakedPuts[0].strike) {
      const c = nakedCalls[0], u = nakedPuts[0];
      const paired = Math.min(c.naked, u.naked);
      // ضوابط صریحاً «قرارداد با وجه تضمین اولیه کمتر» را نام می‌برد؛ نه
      // لزوماً پای با RM کمتر. در تساوی IM (استرادل)، پای با RM کمتر همان
      // «پای دیگر» است و پریمیوم آن افزوده می‌شود.
      const lowerInitial = c.initial < u.initial - EPS ? c
        : u.initial < c.initial - EPS ? u
          : c.required <= u.required ? c : u;
      const pairedDue = (Math.max(c.required, u.required) + lowerInitial.premium) * paired;
      const cExtra = c.required * Math.max(0, c.naked - paired);
      const uExtra = u.required * Math.max(0, u.naked - paired);
      const after = pairedDue + cExtra + uExtra;
      total += after - (c.nakedDue + u.nakedDue);
      comboRule = 'MAX_PLUS_PREMIUM';
      components = components.filter((part) => !part.legIndexes.includes(c.index) && !part.legIndexes.includes(u.index));
      if (pairedDue > EPS) components.push({
        type: 'combo', amount: pairedDue, legIndexes: [c.index, u.index],
        sortIndex: Math.min(c.index, u.index),
      });
      if (cExtra > EPS) components.push({ type: 'leg', amount: cExtra, legIndexes: [c.index], sortIndex: c.index + 0.1 });
      if (uExtra > EPS) components.push({ type: 'leg', amount: uExtra, legIndexes: [u.index], sortIndex: u.index + 0.1 });
    }
  }
  components.sort((a, b) => a.sortIndex - b.sortIndex);

  // سهمی که به‌عنوان پوشش قفل شده — «دارایی مسدودی» تابلو. از همان
  // تفکیک پوشش می‌آید که بالا حساب شد، پس محاسبه دوباره لازم نیست.
  const sharesLocked = cov.shorts.reduce((a, r) => a
    + r.by.filter((b) => b.what === 'underlying').reduce((x, b) => x + b.ratio, 0)
      * num(r.leg.size, contractSize), 0);
  // وجه تضمین لازم کل: مجموع پاها، پیش از تخفیف پوشش و پیش از کسر بستانکار.
  const requiredTotal = perLeg.reduce((a, l) => a + l.required * l.ratio, 0);

  const credit = Math.max(0, cash);
  return {
    isCredit,
    grossCash: cash,
    coverage: cov.state,
    nakedRatio: cov.nakedRatio,
    sharesLocked,
    requiredTotal,
    margin: total,
    marginNet: ctx.capitalMode === 'GROSS' ? total : Math.max(0, total - credit),
    conditionalMargin: conditional,          // اگر پوشش از بین برود
    creditMode: mode,
    comboRule,
    components,
    perLeg,
    note: (!isCredit
      ? (total > 0
        // بدهکارِ دارای فروش برهنه: «بدهکار یعنی بی‌تعهد» فقط برای ترکیب
        // پوشیده درست است. اگر پایی لخت مانده، وجه تضمین گرفته می‌شود.
        ? 'بدهکار خالص با فروش برهنه — وجه تضمین گرفته می‌شود'
        : 'بدهکار خالص — وجه تضمین گرفته نمی‌شود')
      : mode === 'FULL'
        ? 'بستانکار خالص — مبنای الف، تأییدنشده با تابلو'
        : 'بستانکار خالص — مبنای انتخابی تو، تأییدنشده با تابلو')
      + (comboRule === 'MAX_PLUS_PREMIUM' ? ' · قاعدهٔ ترکیبی متن ضوابط' : '')
      + (p.bBasis === 'STRIKE' ? ' · جزء B بر قیمت اعمال' : ''),
  };
}

/**
 * مخرج بازده. تعریف قفل‌شده:
 *   بدهکار    بیشینه( بدهکار خالص پرداختی ، سرمایه بلوکه‌شده ، بیشترین زیان )
 *   بستانکار  بیشینه( سرمایه بلوکه‌شده ، بیشترین زیان ممکن )
 *   دارای سهم پایه  بهای تمام‌شده سهم منهای پریمیوم دریافتی
 *
 * دلیل آن «بیشینه»: وجه تضمین و بیشترین زیان دو عدد مستقل‌اند و هیچ‌کدام
 * همیشه بزرگ‌تر نیست. اگر وجه تضمین کمتر باشد، مابه‌التفاوت را خودت باید
 * کنار بگذاری وگرنه در سررسید نقدینگی نداری.
 *
 * سمت بدهکار تا امروز فقط پریمیوم پرداختی را می‌شمرد، انگار «بدهکار» یعنی
 * «بی‌تعهد». برای نسبت‌اسپرد غلط بود: دو پا فروخته‌ای و یکی خریده، پس بخشی
 * از فروش برهنه می‌ماند. یک نمونه واقعی از اسکن ۳۱ استراتژی، بدهکار خالصِ
 * ۲٬۰۰۰ ریال با وجه تضمین ۱۹٬۰۰۴٬۵۰۰ و بیشترین زیانِ ۹۰٬۱۴۷٬۰۰۰ داشت. مخرج
 * ۲٬۰۰۰ ریالی، بازده ماهانهٔ ۲۲۹٬۷۶۸٪ می‌ساخت و آن ردیف صدر جدول می‌نشست —
 * در حالی که با ۲٬۰۰۰ ریال اصلاً نمی‌شود بازش کرد.
 *
 * نخستین اصلاح، «بیشینه» را فقط وقتی اعمال می‌کرد که وجه تضمین مثبت باشد،
 * تا اسپردِ پوشیده دست‌نخورده بماند. حسابرسی نشان داد همان استثنا خودش یک
 * خانوادهٔ کامل را باز می‌گذارد: اسپرد پوت نزولی با بدهکارِ ۸٫۲۴ ریال، وجه
 * تضمین صفر و بیشترین زیانِ ۴٬۴۴۷٫۶۹ ریال، بازده ماهانهٔ ۳٬۶۲۳٬۲۶۰٪ می‌داد.
 * وجه تضمین صفر بود چون پوشش برقرار بود؛ ولی بیشترین زیان چهل‌برابرِ بدهکاری
 * بود، چون هزینهٔ تسویه در سررسید پول واقعی است و از جیب همین حساب می‌رود.
 *
 * پس شرط برداشته شد و تعریفِ بالا بی‌استثنا اجرا می‌شود. بهایش این است که
 * مخرجِ هر اسپرد بدهکارِ ساده هم به «بدهکاری + هزینهٔ تسویه» می‌رود، نه فقط
 * بدهکاری. این تغییرِ خواسته است نه عارضه: پولی که سر سررسید باید داشته
 * باشی، سرمایهٔ درگیر است. ستون «مبنای سرمایه» می‌گوید کدام جزء مقید کرده.
 *
 * «بازده» یعنی سود به ازای پولی که درگیر می‌کنی، نه به ازای پولی که دستِ
 * فروشنده می‌گذاری. پولی که کارگزار بلوکه می‌کند، درگیر است حتی اگر اسمش
 * پرداخت نباشد.
 */
export function capitalBase({ legs, netCash, marginNet, maxLoss }) {
  const hasStock = legs.some((l) => l.kind === 'underlying');
  if (hasStock) {
    // پول واقعی که از جیب رفته: بهای سهم منهای پریمیوم
    return { value: Math.max(0, -netCash), kind: 'STOCK_NET', label: 'بهای سهم منهای پریمیوم' };
  }
  if (netCash < -EPS) {
    const debit = -netCash;
    const blocked = num(marginNet, 0);
    const loss = Number.isFinite(maxLoss) ? maxLoss : 0;
    const value = Math.max(debit, blocked, loss);
    // کدام جزء مقید کرده — همان چیزی که کاربر باید ببیند تا بداند مخرجش
    // از کجا آمده. ترتیب، ترتیب بزرگی نیست؛ ترتیب صراحت است: زیان ممکن
    // گویاتر از وجه تضمین است و وجه تضمین گویاتر از خودِ بدهکاری.
    const kind = value > debit + EPS ? 'DEBIT_BLOCKED' : 'DEBIT';
    const label = value <= debit + EPS
      ? 'بدهکار خالص پرداختی'
      : loss >= blocked
        ? 'بدهکار خالص — بیشترین زیان ممکن'
        : 'بدهکار خالص + وجه تضمین بلوکه‌شده';
    return { value, kind, label };
  }
  const ml = Number.isFinite(maxLoss) ? maxLoss : Infinity;
  const value = Math.max(num(marginNet, 0), Number.isFinite(ml) ? ml : num(marginNet, 0));
  return {
    value,
    kind: 'CREDIT',
    label: Number.isFinite(ml) && ml >= num(marginNet, 0)
      ? 'بیشترین زیان ممکن'
      : 'وجه تضمین بلوکه‌شده',
  };
}
