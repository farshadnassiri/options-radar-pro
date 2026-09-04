// فاصله — همان چیزی که «اسپرد» در لغت یعنی.
//
// ═══ چرا این فایل هست ═══
//
// در سراسر این برنامه «اسپرد» تا امروز دو معنی داشت و هیچ‌کدام معنیِ
// لغویش نبود: یکی نام خانوادهٔ استراتژی («اسپرد عمودی») و یکی فاصلهٔ
// مظنه («اسپرد خرید و فروش»). آنچه نبود، خودِ فاصله بود: **بین دو قیمت
// اعمال چقدر جا هست، و ساختار همین حالا چقدر از آن جا را پر کرده.**
//
// این عدد برای اسپرد عمودی، تمام تصمیم است. اسپرد صعودی کالی که دو پله
// عرض دارد، در سررسید — اگر هر دو پا در سود باشند — دقیقاً به همان عرض
// می‌رسد و یک ریال بیشتر نه. پس عرض، سقفِ ارزش است، و «الان چقدرش پر
// شده» یعنی «چقدر از راه رفته‌ام» و «چقدر مانده» یعنی سودِ باقی‌مانده.
//
// کاربر همین را خواست: «عدد فاصله اکنون را بر فاصله بین اعمال‌ها تقسیم
// کن… درصد هر دو را مشخص کن… یعنی این فاصله چقدر پر شده و چقدر جا داره
// پر بشه (یعنی میزان سود مورد انتظار).»
//
// ═══ دو لنگر، نه یکی ═══
//
// یک نسبت کافی نیست، چون دو پرسش متفاوت‌اند و جوابشان یکی نیست:
//
//   ساختاری   فاصلهٔ اکنون بر فاصلهٔ اعمال. لنگرش خودِ ساختار است و به
//             اینکه شما کِی و به چه بهایی وارد شدید کاری ندارد. برای
//             مقایسهٔ دو ترکیبِ مختلف روی یک نردبان، همین درست است.
//   موقعیتی   سودِ محقق‌شده بر بیشینهٔ سودِ ممکن. لنگرش قیمت ورودِ
//             **شماست**. برای «چقدر از سودم را گرفته‌ام» همین درست است.
//
// هر دو برمی‌گردند و هر دو برچسب خودشان را دارند. یکی‌شان را «درصد پر
// شدن» نامیدن و دیگری را پنهان کردن، همان جایی است که گزارش‌های مالی
// دروغ می‌گویند بی آنکه عددی غلط باشد.
//
// ═══ استرانگل هم فاصله دارد ═══
//
// استرانگل به عرضِ اعمال همگرا نمی‌شود — پس «سقفِ ارزش» ندارد. ولی
// فاصله دارد و همان فاصله، تمامِ ساختار است: دهانهٔ بین پوت و کال، همان
// راهروی خنثایی که در فروشش شرط می‌بندید. و پرمیوم — عددی که کاربر
// «موقع فروش ۳۰۰، یک دقیقه بعد ۳۱۰» گفت — سهمی از همان دهانه است.
//
// پس یک تعریف، دو لنگر، و همان ریاضی برای هر دو. آنچه فرق می‌کند فقط
// نامِ لنگر است و جهتی که «پر شدن» در آن معنی می‌دهد.
//
// ═══ مرزی که رد نمی‌شود ═══
//
// هیچ عددی ساخته نمی‌شود. پایی که قیمت ندارد، فاصله ندارد؛ `ok: false`
// با `why` برمی‌گردد و رابط همان را می‌نویسد. صفر گذاشتنِ پای بی‌قیمت،
// فاصله‌ای می‌سازد که در بازار وجود ندارد — و بدتر: فاصله‌ای که همیشه
// «جای زیادی برای پر شدن» نشان می‌دهد.

import { num } from './num.mjs';

/** نوعِ فاصله — چه چیزی لنگر است. */
export const GAP_KINDS = {
  vertical: { id: 'vertical', anchorLabel: 'فاصلهٔ اعمال', label: 'اسپرد عمودی' },
  strangle: { id: 'strangle', anchorLabel: 'دهانهٔ استرانگل', label: 'استرانگل' },
  wing: { id: 'wing', anchorLabel: 'عرض بال', label: 'باترفلای و کندور' },
  calendar: { id: 'calendar', anchorLabel: 'فاصلهٔ اعمال', label: 'تقویمی و مورب' },
};

/** استراتژی‌هایی که فاصله دارند، و لنگرِ هرکدام. */
const KIND_BY_STRATEGY = new Map([
  ['bull-call-spread', 'vertical'], ['bear-call-spread', 'vertical'],
  ['bull-put-spread', 'vertical'], ['bear-put-spread', 'vertical'],
  ['long-strangle', 'strangle'], ['short-strangle', 'strangle'],
  ['long-call-butterfly', 'wing'], ['short-call-butterfly', 'wing'],
  ['long-put-butterfly', 'wing'], ['iron-butterfly', 'wing'],
  ['iron-condor', 'wing'], ['long-call-condor', 'wing'], ['long-put-condor', 'wing'],
  ['diagonal-call', 'calendar'], ['diagonal-put', 'calendar'],
  ['call-ratio-spread', 'vertical'], ['put-ratio-spread', 'vertical'],
  ['call-backspread', 'vertical'], ['put-backspread', 'vertical'],
  ['box', 'vertical'],
]);

/** آیا این استراتژی اصلاً فاصله دارد؟ تک‌پا و استرادل ندارند. */
export const hasGap = (strategyId) => KIND_BY_STRATEGY.has(String(strategyId ?? ''));

/** نوعِ فاصلهٔ یک استراتژی، یا `null` اگر فاصله ندارد. */
export const gapKind = (strategyId) => KIND_BY_STRATEGY.get(String(strategyId ?? '')) || null;

/** فهرست شناسه‌های فاصله‌دار — رابط از همین می‌سازد، نه از فهرست دستی. */
export const GAP_STRATEGY_IDS = [...KIND_BY_STRATEGY.keys()];

const finite = (value) => Number.isFinite(value);

/**
 * لنگرِ ساختاری: فاصلهٔ میان دورترین دو قیمت اعمالِ ترکیب، به ریالِ هر واحد.
 *
 * چرا «دورترین دو»: کندور چهار اعمال دارد و بین هر جفت یک فاصله هست، ولی
 * آنچه سقفِ ارزش را می‌سازد پهنای کل نیست — پهنای هر بال است. برای کندور
 * و باترفلای، `wingWidth` جدا حساب می‌شود و همان لنگر است. برای عمودی و
 * استرانگل، دورترین دو همان تنها دوتاست.
 *
 * اندازهٔ قرارداد ضرب می‌شود چون همه‌جای این برنامه عددِ پولی به ریالِ
 * واقعی است، نه به «واحد قیمت اعمال». بی آن، فاصله و ارزشِ ترکیب دو
 * مقیاس متفاوت داشتند و نسبتشان بی‌معنی می‌شد.
 */
export function strikeAnchor(legs = [], kind = 'vertical') {
  const strikes = [...new Set(legs
    .filter((leg) => leg && leg.kind !== 'underlying' && finite(num(leg.strike, NaN)))
    .map((leg) => num(leg.strike, 0)))].sort((a, b) => a - b);
  if (strikes.length < 2) return { ok: false, why: 'این ترکیب کمتر از دو قیمت اعمال دارد، پس فاصله‌ای ندارد', anchor: NaN, strikes };
  // اندازه از خودِ پاها می‌آید. پس از افزایش سرمایه دو پای یک ترکیب
  // می‌توانند دو اندازه داشته باشند؛ کوچک‌ترین را می‌گیریم چون همان است
  // که پوششِ کامل را محدود می‌کند.
  const sizes = legs.filter((leg) => leg && leg.kind !== 'underlying' && num(leg.size, 0) > 0)
    .map((leg) => num(leg.size, 0));
  if (!sizes.length) return { ok: false, why: 'اندازهٔ قرارداد هیچ پایی اعلام نشده', anchor: NaN, strikes };
  const size = Math.min(...sizes);
  const mixedSize = new Set(sizes).size > 1;

  if (kind === 'wing') {
    // بالِ باترفلای و کندور. اگر بال‌ها نامساوی باشند، باریک‌ترین بال
    // سقفِ ارزش را می‌سازد — نه میانگین، نه پهن‌ترین.
    const widths = strikes.slice(1).map((k, i) => k - strikes[i]);
    const width = Math.min(...widths);
    return {
      ok: width > 0, why: width > 0 ? '' : 'دو قیمت اعمالِ ترکیب یکی‌اند',
      anchor: width * size, strikes, size, mixedSize,
      wingWidths: widths.map((w) => w * size), equalWings: new Set(widths).size === 1,
    };
  }

  const width = strikes[strikes.length - 1] - strikes[0];
  return {
    ok: width > 0, why: width > 0 ? '' : 'دو قیمت اعمالِ ترکیب یکی‌اند',
    anchor: width * size, strikes, size, mixedSize,
  };
}

/**
 * ارزش خالصِ ساختار در یک لحظه — «فاصلهٔ اکنون».
 *
 * جمعِ علامت‌دارِ قیمتِ پاها: خریده مثبت، فروخته منفی، ضرب در نسبت و
 * اندازه. قدرمطلقش گرفته می‌شود چون فاصله جهت ندارد؛ جهت را `side`
 * می‌گوید.
 *
 * `prices` نگاشتِ شناسهٔ ابزار به قیمت است. پایی که در آن نباشد یا
 * قیمتش عدد نباشد، کلِ محاسبه را `ok: false` می‌کند — نه اینکه صفر
 * بگیرد. صفر گرفتن، فاصله‌ای می‌سازد که در بازار نیست.
 */
export function structureValue(legs = [], prices = {}) {
  let signed = 0;
  const missing = [];
  for (const leg of legs) {
    if (!leg || leg.kind === 'underlying') continue;
    const raw = prices[String(leg.ins)];
    const price = num(raw, NaN);
    if (!finite(price)) { missing.push(leg.name || String(leg.ins)); continue; }
    const qty = num(leg.ratio, 1) * num(leg.size, 1);
    signed += (leg.side === 'sell' ? -1 : 1) * price * qty;
  }
  if (missing.length) {
    return { ok: false, why: `این پاها قیمت ندارند: ${missing.join('، ')}`, value: NaN, signed: NaN, side: '', missing };
  }
  return {
    ok: true, why: '', value: Math.abs(signed), signed,
    // بدهکار یعنی پول داده‌اید (جمعِ علامت‌دار مثبت است)، بستانکار یعنی
    // گرفته‌اید. این دو، جهتِ «پر شدن» را تعیین می‌کنند.
    side: signed > 0 ? 'debit' : signed < 0 ? 'credit' : 'flat', missing: [],
  };
}

/**
 * فاصله، کامل — همان چیزی که رابط نشان می‌دهد.
 *
 * @param legs      پاهای ترکیب، با `ins`، `strike`، `side`، `ratio`، `size`
 * @param prices    قیمت هر پا در این لحظه، به کلید `ins`
 * @param strategyId شناسهٔ استراتژی، برای پیدا کردن نوع لنگر
 * @param entry     ارزش خالصِ ورود، اگر می‌خواهید نسبتِ موقعیتی هم بیاید
 * @param daysLeft  روز تا سررسید، برای «سود روزانهٔ باقی‌مانده»
 */
export function measureGap({ legs = [], prices = {}, strategyId = '', entry = NaN, daysLeft = NaN } = {}) {
  const kind = gapKind(strategyId) || 'vertical';
  const meta = GAP_KINDS[kind];
  const anchor = strikeAnchor(legs, kind);
  const now = structureValue(legs, prices);
  const base = {
    ok: false, why: '', kind, kindLabel: meta.label, anchorLabel: meta.anchorLabel,
    anchor: anchor.anchor, strikes: anchor.strikes, size: anchor.size ?? NaN,
    mixedSize: !!anchor.mixedSize, equalWings: anchor.equalWings,
    current: NaN, coverage: NaN, coveragePct: NaN, room: NaN, roomPct: NaN,
    side: '', entry: num(entry, NaN), filledPct: NaN, upside: NaN, upsidePct: NaN,
    perDay: NaN, daysLeft: num(daysLeft, NaN),
  };
  if (!anchor.ok) return { ...base, why: anchor.why };
  if (!now.ok) return { ...base, why: now.why, missing: now.missing };

  const current = now.value;
  const coverage = current / anchor.anchor;
  const room = anchor.anchor - current;

  const out = {
    ...base, ok: true, current, coverage,
    coveragePct: coverage * 100,
    room, roomPct: (room / anchor.anchor) * 100,
    side: now.side, signed: now.signed,
  };

  // ── لنگر موقعیتی: فقط اگر قیمت ورود را بدانیم ────────────────────────
  //
  // بی آن، «چند درصد از سودم را گرفته‌ام» پرسشِ بی‌جوابی است و عددِ ساختگی
  // برایش گذاشته نمی‌شود.
  const paid = num(entry, NaN);
  if (!finite(paid) || paid <= 0) return out;
  out.entry = paid;

  if (now.side === 'debit') {
    // بدهکار: بهای ورود کفِ ارزش است و عرضِ اعمال سقفش. سود بیشینه فاصلهٔ
    // این دو، و آنچه تا حالا گرفته‌اید فاصلهٔ ورود تا اکنون.
    out.maxProfit = anchor.anchor - paid;
    out.maxLoss = -paid;
    out.gained = current - paid;
    out.upside = anchor.anchor - current;
  } else {
    // بستانکار: بستانکارِ ورود بیشینهٔ سود است و ارزش باید به صفر برود.
    // آنچه مانده، خودِ ارزشِ کنونی است.
    out.maxProfit = paid;
    out.maxLoss = -(anchor.anchor - paid);
    out.gained = paid - current;
    out.upside = current;
  }
  out.filledPct = finite(out.maxProfit) && out.maxProfit !== 0
    ? (out.gained / out.maxProfit) * 100 : NaN;
  // سودِ باقی‌مانده بر سرمایه‌ای که **همین حالا** درگیرش می‌شوید — نه بر
  // سرمایهٔ روز ورود. کسی که امروز نگاه می‌کند، امروز وارد می‌شود.
  const atRisk = now.side === 'debit' ? current : (anchor.anchor - current);
  out.upsidePct = atRisk > 0 ? (out.upside / atRisk) * 100 : NaN;
  const days = num(daysLeft, NaN);
  if (finite(days) && days > 0 && finite(out.upsidePct)) out.perDay = out.upsidePct / days;
  return out;
}

/**
 * جملهٔ فارسیِ فاصله — همان که بالای کارت و در راهنمای نمودار می‌نشیند.
 *
 * جمله عمداً هر دو نسبت را می‌گوید. اگر فقط یکی می‌آمد، خواننده همان را
 * «درصد سود» می‌خواند و آن دو یکی نیستند.
 */
export function gapNote(gap) {
  if (!gap) return '';
  if (!gap.ok) return gap.why || 'فاصله محاسبه نشد';
  const iso = (n) => `⁨${Number(n).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}⁩`;
  const parts = [
    `${gap.anchorLabel} ${iso(Math.round(gap.anchor))} ریال؛ فاصلهٔ اکنون ${iso(Math.round(gap.current))} — ${iso(gap.coveragePct)}٪ پر شده و ${iso(gap.roomPct)}٪ جا دارد`,
  ];
  if (finite(gap.upsidePct)) {
    parts.push(`سودِ باقی‌مانده تا پرشدنِ کامل ${iso(gap.upsidePct)}٪ سرمایهٔ همین لحظه`);
  }
  if (finite(gap.perDay)) parts.push(`${iso(gap.perDay)}٪ در هر روزِ مانده`);
  return `${parts.join('؛ ')}.`;
}
