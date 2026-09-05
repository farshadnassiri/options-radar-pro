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

/**
 * مقیاسِ نمایش — انتخابِ کاربر، نه حکمِ برنامه.
 *
 * ═══ چرا این هست ═══
 *
 * نسخهٔ اول همیشه در اندازهٔ قرارداد ضرب می‌کرد و عدد را به ریال می‌داد.
 * گزارش صاحب پروژه: «ضرب کردن در اندازه قرارداد و حجم رو در اختیار کاربر
 * بذار که انتخاب بکنه یا نکنه.»
 *
 * حق با اوست، و دلیلش از سلیقه بالاتر است: معامله‌گر روی تابلو **قیمت
 * خام قرارداد** را می‌بیند. وقتی کالِ ۵۰ روی ۳٬۲۰۰ است و کالِ ۵۴ روی
 * ۸۰۰، آنچه او با چشمش کم می‌کند ۲٬۴۰۰ است. عددِ ۲٬۴۰۰٬۰۰۰ همان است
 * ضربدر هزار، ولی با هیچ عددی روی تابلو جور درنمی‌آید و باید هر بار در
 * ذهن تقسیم شود.
 *
 * ═══ نکتهٔ مهم: نسبت‌ها تغییر نمی‌کنند ═══
 *
 * چون **هم** فاصلهٔ اعمال و **هم** ارزش کنونی با یک ضریب بزرگ می‌شوند،
 * «چند درصد پر شده» در هر سه مقیاس یک عدد است. مقیاس فقط واحدِ نمایش را
 * عوض می‌کند، نه حکم را. هر چیز دیگری اشتباه بود.
 */
export const GAP_SCALES = [
  { id: 'raw', label: 'قیمت خام قرارداد', unit: 'ریال',
    hint: 'همان عددی که روی تابلو می‌بینی. تفاضل دو نرخ، بی هیچ ضربی.' },
  { id: 'size', label: '× اندازهٔ قرارداد', unit: 'ریال',
    hint: 'ارزش ریالیِ یک قرارداد کامل. برای مقایسه با وجه تضمین و سرمایهٔ درگیر.' },
  { id: 'qty', label: '× اندازه × تعداد', unit: 'ریال',
    hint: 'ارزش ریالیِ کل موقعیت با تعدادی که خودت گذاشته‌ای.' },
];

const SCALE_BY_ID = new Map(GAP_SCALES.map((row) => [row.id, row]));
export const DEFAULT_SCALE = 'raw';
export const gapScale = (id) => SCALE_BY_ID.get(String(id ?? '')) || SCALE_BY_ID.get(DEFAULT_SCALE);

/**
 * ضریبِ مقیاس برای یک ترکیب.
 *
 * اندازه از کوچک‌ترین پا می‌آید — همان که پوششِ کامل را محدود می‌کند —
 * و وقتی پاها اندازهٔ متفاوت دارند (پس از افزایش سرمایه رخ می‌دهد)،
 * `mixedSize` علامت می‌خورد تا رابط بگوید عدد تقریبی است.
 */
export function gapMultiplier({ scale = DEFAULT_SCALE, size = 1, units = 1 } = {}) {
  const id = gapScale(scale).id;
  if (id === 'raw') return 1;
  const one = Math.max(1, num(size, 1));
  return id === 'qty' ? one * Math.max(1, Math.trunc(num(units, 1))) : one;
}

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
 * ارزشِ این ساختار جمعِ دو نرخ است یا تفاضلشان؟
 *
 * پاسخ از سمتِ پاها می‌آید نه از نامِ استراتژی: هر ترکیبی که همهٔ پاهایش
 * خریده (یا همه فروخته) باشند، جمعِ علامت‌دارش جمعِ ساده است. اسپرد عمودی
 * یک خریده و یک فروخته دارد، پس تفاضل. باترفلای هر دو را دارد، پس تفاضل.
 */
export function combineOf(legs = []) {
  const sides = new Set(legs.filter((leg) => leg && leg.kind !== 'underlying')
    .map((leg) => (leg.side === 'sell' ? 'sell' : 'buy')));
  return sides.size === 1 ? 'sum' : 'diff';
}

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
export function strikeAnchor(legs = [], kind = 'vertical', mult = 1) {
  const strikes = [...new Set(legs
    .filter((leg) => leg && leg.kind !== 'underlying' && finite(num(leg.strike, NaN)))
    .map((leg) => num(leg.strike, 0)))].sort((a, b) => a - b);
  if (strikes.length < 2) return { ok: false, why: 'این ترکیب کمتر از دو قیمت اعمال دارد، پس فاصله‌ای ندارد', anchor: NaN, strikes };
  // اندازه از خودِ پاها می‌آید. پس از افزایش سرمایه دو پای یک ترکیب
  // می‌توانند دو اندازه داشته باشند؛ کوچک‌ترین را می‌گیریم چون همان است
  // که پوششِ کامل را محدود می‌کند.
  const sizes = legs.filter((leg) => leg && leg.kind !== 'underlying' && num(leg.size, 0) > 0)
    .map((leg) => num(leg.size, 0));
  const size = sizes.length ? Math.min(...sizes) : 1;
  const mixedSize = new Set(sizes).size > 1;
  const factor = Math.max(0, num(mult, 1));

  if (kind === 'wing') {
    // بالِ باترفلای و کندور. اگر بال‌ها نامساوی باشند، باریک‌ترین بال
    // سقفِ ارزش را می‌سازد — نه میانگین، نه پهن‌ترین.
    const widths = strikes.slice(1).map((k, i) => k - strikes[i]);
    const width = Math.min(...widths);
    return {
      ok: width > 0, why: width > 0 ? '' : 'دو قیمت اعمالِ ترکیب یکی‌اند',
      anchor: width * factor, raw: width, strikes, size, mixedSize,
      wingWidths: widths.map((w) => w * factor), equalWings: new Set(widths).size === 1,
    };
  }

  const width = strikes[strikes.length - 1] - strikes[0];
  return {
    ok: width > 0, why: width > 0 ? '' : 'دو قیمت اعمالِ ترکیب یکی‌اند',
    anchor: width * factor, raw: width, strikes, size, mixedSize,
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
export function structureValue(legs = [], prices = {}, mult = 1) {
  const factor = Math.max(0, num(mult, 1));
  let signed = 0;
  const missing = [];
  const perLeg = [];
  for (const leg of legs) {
    if (!leg || leg.kind === 'underlying') continue;
    const raw = prices[String(leg.ins)];
    const price = num(raw, NaN);
    if (!finite(price)) { missing.push(leg.name || String(leg.ins)); continue; }
    const ratio = num(leg.ratio, 1);
    const sign = leg.side === 'sell' ? -1 : 1;
    signed += sign * price * ratio * factor;
    // قیمتِ تک‌تکِ پاها برمی‌گردد، چون «تفاضل دو نرخ» را نمی‌شود بدون
    // خودِ آن دو نرخ نشان داد — و نمودارِ فاصله‌ای دقیقاً همان دو خط و
    // فضای میانشان است.
    perLeg.push({
      ins: String(leg.ins), name: leg.name || String(leg.ins),
      kind: leg.kind, side: leg.side, strike: num(leg.strike, NaN),
      price, ratio, scaled: price * ratio * factor,
    });
  }
  if (missing.length) {
    return { ok: false, why: `این پاها قیمت ندارند: ${missing.join('، ')}`, value: NaN, signed: NaN, side: '', missing, perLeg };
  }
  return {
    ok: true, why: '', value: Math.abs(signed), signed, perLeg,
    // بدهکار یعنی پول داده‌اید (جمعِ علامت‌دار مثبت است)، بستانکار یعنی
    // گرفته‌اید. این دو، جهتِ «پر شدن» را تعیین می‌کنند.
    side: signed > 0 ? 'debit' : signed < 0 ? 'credit' : 'flat', missing: [],
  };
}

/**
 * فاصله، کامل — همان چیزی که رابط نشان می‌دهد.
 *
 * ═══ دو خانواده، دو لنگرِ متفاوت ═══
 *
 * این تفاوت از خودِ ساختار می‌آید، نه از سلیقه:
 *
 *   اسپرد عمودی   دو نرخ داریم و **از هم کم** می‌شوند. اگر آن تفاضل به
 *                 تفاضلِ دو قیمت اعمال برسد، ساختار به سقفش رسیده و یک
 *                 ریال بیشتر نمی‌دهد. پس لنگر، فاصلهٔ اعمال است و
 *                 «باقی‌مانده» همان سودِ نگرفته.
 *
 *   استرانگل      دو نرخ داریم و **با هم جمع** می‌شوند. آن جمع در لحظهٔ
 *                 فروش، بیشینهٔ سود است؛ و هرچه در طول زمان کمتر شود،
 *                 همان‌قدر سود محقق شده. اینجا فاصلهٔ اعمال سقفِ ارزش
 *                 نیست — دهانهٔ راهروی خنثاست و به عنوانِ بستر می‌آید،
 *                 نه به عنوان لنگر.
 *
 * پس `anchorSource` می‌گوید لنگرِ این ردیف از کجاست: `strike` یا `entry`.
 * استرانگلی که قیمت ورود ندارد، لنگرِ درستش را ندارد و همین گفته می‌شود
 * — به‌جای اینکه بی‌صدا روی دهانهٔ اعمال بیفتد و عددی بدهد که معنی‌اش
 * چیز دیگری است.
 *
 * @param scale مقیاس نمایش: `raw` (پیش‌فرض)، `size`، یا `qty`
 * @param units تعداد موقعیت — فقط در مقیاس `qty` اثر دارد
 */
export function measureGap({
  legs = [], prices = {}, strategyId = '', entry = NaN, daysLeft = NaN,
  scale = DEFAULT_SCALE, units = 1,
} = {}) {
  const kind = gapKind(strategyId) || 'vertical';
  const meta = GAP_KINDS[kind];
  const scaleMeta = gapScale(scale);
  // اندازه را یک بار بی‌ضریب می‌گیریم تا ضریب از خودش ساخته شود.
  const probe = strikeAnchor(legs, kind, 1);
  const mult = gapMultiplier({ scale: scaleMeta.id, size: probe.size, units });
  const anchor = strikeAnchor(legs, kind, mult);
  const now = structureValue(legs, prices, mult);
  const base = {
    ok: false, why: '', kind, kindLabel: meta.label, anchorLabel: meta.anchorLabel,
    scale: scaleMeta.id, scaleLabel: scaleMeta.label, mult,
    size: anchor.size ?? NaN, units: Math.max(1, Math.trunc(num(units, 1))),
    strikeGap: anchor.anchor, strikeGapRaw: anchor.raw, strikes: anchor.strikes,
    anchor: anchor.anchor, anchorSource: 'strike', anchored: false,
    mixedSize: !!anchor.mixedSize, equalWings: anchor.equalWings,
    current: NaN, coverage: NaN, coveragePct: NaN, room: NaN, roomPct: NaN,
    coverageLabel: '', roomLabel: '',
    // «جمع» یا «تفریق» — از خودِ پاها، نه از نامِ خانواده. هر ترکیبی که
    // همهٔ پاهایش یک‌سمت باشند (هر دو خریده یا هر دو فروخته) ارزشش جمعِ
    // دو نرخ است؛ بقیه تفاضل‌اند. نمودارِ «دو نرخ و فاصله‌شان» از همین
    // یک کلمه می‌فهمد ناحیه بکشد یا نوار.
    combine: combineOf(legs),
    side: '', entry: num(entry, NaN), filledPct: NaN, upside: NaN, upsidePct: NaN,
    gained: NaN, gainedPct: NaN, maxProfit: NaN, maxLoss: NaN,
    unbounded: false, underwater: false,
    perDay: NaN, daysLeft: num(daysLeft, NaN), perLeg: [],
  };
  if (!anchor.ok) return { ...base, why: anchor.why };
  if (!now.ok) return { ...base, why: now.why, missing: now.missing, perLeg: now.perLeg };

  const current = now.value;
  // ── ارزشِ صفر، فاصله نیست ─────────────────────────────────────────────
  //
  // جمعِ علامت‌دارِ صفر یعنی دو پا دقیقاً هم‌قیمت‌اند: ساختاری که نه بهایی
  // دارد نه بستانکاری، و نه می‌شود واردش شد نه از آن خارج.
  if (!(current > 0)) {
    return { ...base, why: 'ارزش خالص این ساختار صفر است؛ دو پا هم‌قیمت‌اند و فاصله‌ای برای سنجیدن نمی‌ماند', perLeg: now.perLeg };
  }

  const out = {
    ...base, ok: true, current, side: now.side, signed: now.signed, perLeg: now.perLeg,
  };
  const paid = num(entry, NaN);
  const hasEntry = finite(paid) && paid > 0;
  if (hasEntry) out.entry = paid;

  // ── لنگر ─────────────────────────────────────────────────────────────
  //
  // ═══ چرا استرانگل دیگر روی «قیمت ورود» لنگر نمی‌اندازد ═══
  //
  // نسخهٔ پیشین برای استرانگل، جمعِ پرمیوم در نخستین روزِ بازه را لنگر
  // می‌گرفت و رویش «چند درصد سود گرفته‌ای» می‌ساخت. گزارش صاحب پروژه:
  // «قسمت short strangle درست نمایش داده نمی‌شود؛ اصولاً لنگر نداریم.»
  //
  // و درست بود. آن روز، **ورودِ کسی نبود**. رادار ترکیب‌هایی را نشان
  // می‌دهد که هنوز باز نشده‌اند؛ نخستین روزِ بازه فقط مرزِ نمودار است.
  // ساختنِ «۲۲٪ از سودت را گرفته‌ای» روی موقعیتی که اصلاً باز نشده، عددی
  // است که هیچ‌چیز در بازار با آن جور درنمی‌آید.
  //
  // آنچه برای استرانگل **همیشه** هست، دهانهٔ اعمال است: راهروی خنثایی که
  // در فروشش شرط می‌بندی. پس همان لنگر می‌شود و نسبت، معنیِ روشنی
  // می‌گیرد: **پرمیومی که می‌گیری چند درصدِ دهانه را می‌پوشاند.** این
  // برای مقایسهٔ دو استرانگل روی یک نماد دقیقاً همان کاری را می‌کند که
  // «پر شدن» برای دو اسپرد می‌کند، و به هیچ ورودِ خیالی‌ای نیاز ندارد.
  //
  // «هرچه این جمع کمتر شود سود است» — که خواستهٔ اصلی بود — از بین نرفت:
  // در `gained` می‌آید (نسبت به مبدأ مقایسه، با نامِ خودش) و در نمودار
  // مسیر و نمودار دو نرخ، که خودِ آب‌شدن را نشان می‌دهند.
  out.anchorSource = 'strike';
  out.anchored = true;
  if (kind === 'strangle') {
    out.anchorLabel = 'دهانهٔ اعمال';
    out.coverageLabel = now.side === 'credit' ? 'پوشش پرمیوم از دهانه' : 'بهای پرداختی از دهانه';
    out.roomLabel = 'دهانهٔ بی‌پوشش';
  } else {
    out.coverageLabel = 'پر شده';
    out.roomLabel = 'جا برای پر شدن';
  }

  // ── دو درصد ──────────────────────────────────────────────────────────
  //
  // ارزشِ کنونی بر لنگرِ ساختاری. در اسپرد یعنی «چقدر از راه رفته‌ام» و در
  // استرانگل یعنی «پرمیوم چقدر از دهانه را می‌پوشاند». یک ریاضی، دو جمله،
  // و هر جمله برچسبِ خودش را دارد — چون یکی‌شان را به نامِ دیگری گفتن،
  // همان جایی است که گزارش‌های مالی دروغ می‌گویند بی آنکه عددی غلط باشد.
  out.coverage = current / out.anchor;
  out.room = out.anchor - current;
  out.coveragePct = out.coverage * 100;
  out.roomPct = 100 - out.coveragePct;

  // ── بیشینهٔ سود و زیانِ «اگر همین حالا وارد شوی» ──────────────────────
  //
  // مبنا قیمتِ **اکنون** است نه قیمتِ روز ورود، چون کسی که امروز به این
  // ردیف نگاه می‌کند امروز وارد می‌شود. برای عددهای دقیق‌تر — با کارمزد
  // تسویه، سربه‌سری، وجه تضمین و سرمایه — `core/radar-metrics.mjs` همان
  // خط لولهٔ مشترکِ برنامه را اجرا می‌کند؛ اینجا فقط شکلِ ساختاری است.
  if (kind === 'strangle') {
    // فروش: بستانکارِ امروز سقفِ سود است و زیان سقف ندارد.
    // خرید: بهای امروز سقفِ زیان است و سود سقف ندارد.
    out.maxProfit = now.side === 'credit' ? current : Infinity;
    out.maxLoss = now.side === 'credit' ? -Infinity : -current;
    out.unbounded = true;
    out.upside = NaN;
  } else if (now.side === 'debit') {
    out.maxProfit = out.anchor - current;
    out.maxLoss = -current;
    out.upside = out.anchor - current;
  } else {
    out.maxProfit = current;
    out.maxLoss = -(out.anchor - current);
    out.upside = current;
  }

  // ── نسبت به مبدأ مقایسه ──────────────────────────────────────────────
  //
  // `entry` ورودِ واقعیِ کاربر نیست و ادعا هم نمی‌کند که هست: نخستین روزِ
  // بازه با قیمت معتبرِ همهٔ پاهاست. با آن یک چیز گفتنی است و فقط همان:
  // از آن روز تا امروز، ارزشِ ساختار چقدر به نفع یا زیانِ دارندهٔ آن
  // موقعیت حرکت کرده.
  if (hasEntry) {
    out.gained = now.side === 'credit' ? paid - current : current - paid;
    out.gainedPct = (out.gained / paid) * 100;
    out.underwater = out.gained < 0;
    out.filledPct = finite(out.maxProfit) && out.maxProfit !== 0
      ? (out.gained / out.maxProfit) * 100 : NaN;
  }

  // ── سودِ باقی‌مانده، فقط جایی که مخرج دارد ────────────────────────────
  //
  // برای اسپرد و بال، سرمایهٔ درگیرِ همین لحظه معلوم است. برای استرانگل
  // نیست: سرمایهٔ فروشنده وجه تضمین است نه بستانکار، و تقسیم بر بستانکار
  // «۳۳۳٪ بازده» می‌داد برای موقعیتی که در زیان بود. آنجا عددی ساخته
  // نمی‌شود و `radar-metrics` بازده را روی وجه تضمینِ واقعی می‌دهد.
  if (kind === 'strangle') return out;
  const atRisk = now.side === 'debit' ? current : out.anchor - current;
  out.upsidePct = atRisk > 0 && finite(out.upside) ? (out.upside / atRisk) * 100 : NaN;
  const days = num(daysLeft, NaN);
  if (finite(days) && days > 0 && finite(out.upsidePct)) out.perDay = out.upsidePct / days;
  return out;

}

/**
 * نامِ نمادِ هر پا، با جهتش.
 *
 * ═══ چرا این هست ═══
 *
 * جدول رادار تا امروز ترکیب را با «نام استراتژی + قیمت اعمال» می‌شناساند.
 * برای کسی که می‌خواهد سفارش بگذارد این کافی نیست: روی تابلو نمادی به نام
 * «ضهرم۵۰۳۳» می‌خرد، نه «اسپرد صعودی کال ۵۰٬۰۰۰». خواستهٔ صاحب پروژه هم
 * همین بود — «نام نمادها در جدول‌ها و نمودارها بیاید».
 *
 * پای دارایی پایه کنار گذاشته می‌شود چون نمادِ قابل سفارش این ترکیب نیست؛
 * و نامِ نداشته با شناسهٔ ابزار جایگزین می‌شود نه با نامی ساختگی.
 */
export function comboSymbols(legs = []) {
  return legs
    .filter((leg) => leg && leg.kind !== 'underlying')
    .map((leg) => ({
      ins: String(leg.ins),
      name: String(leg.name ?? '').trim() || String(leg.ins),
      side: leg.side === 'sell' ? 'sell' : 'buy',
      sideLabel: leg.side === 'sell' ? 'فروش' : 'خرید',
      ratio: Math.max(1, num(leg.ratio, 1)),
    }));
}

/** یک سطرِ متنی از نمادهای ترکیب — برای عنوان نمودار، اعلان، و کشویی. */
export function comboSymbolText(legs = [], sep = ' · ') {
  return comboSymbols(legs)
    .map((leg) => `${leg.sideLabel} ${leg.name}${leg.ratio > 1 ? ` ×${leg.ratio}` : ''}`)
    .join(sep);
}

/**
 * جملهٔ فارسیِ فاصله — همان که بالای کارت و در راهنمای نمودار می‌نشیند.
 *
 * جمله برای هر خانواده متن خودش را دارد، چون عددها یک چیز نمی‌گویند:
 * در اسپرد «تفاضلِ دو نرخ در برابر تفاضلِ دو اعمال» و در استرانگل
 * «جمعِ دو نرخ در برابر جمعِ روز ورود».
 */
export function gapNote(gap) {
  if (!gap) return '';
  if (!gap.ok) return gap.why || 'فاصله محاسبه نشد';
  const iso = (n) => `⁨${Number(n).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}⁩`;
  const round = (n) => iso(Math.round(n));
  const parts = [];

  if (gap.kind === 'strangle') {
    const what = gap.side === 'credit' ? 'جمعِ پرمیومی که می‌گیری' : 'جمعِ پرمیومی که می‌دهی';
    parts.push(`دهانهٔ اعمال ${round(gap.anchor)}؛ ${what} اکنون ${round(gap.current)} — ${iso(gap.coveragePct)}٪ دهانه`);
    parts.push(gap.side === 'credit'
      ? 'بیشینهٔ سود همین بستانکار است و هرچه این جمع آب شود، همان‌قدر محقق می‌شود؛ زیانش سقف ندارد'
      : 'بیشترین زیان همین بهاست و سود سقف ندارد');
  } else {
    parts.push(`فاصلهٔ اعمال ${round(gap.anchor)}؛ تفاضل دو نرخ اکنون ${round(gap.current)} — ${iso(gap.coveragePct)}٪ پر شده و ${iso(gap.roomPct)}٪ جا دارد`);
  }

  if (finite(gap.gained)) {
    parts.push(gap.underwater
      ? `از مبدأ مقایسه ${round(Math.abs(gap.gained))} در زیان است (${iso(Math.abs(gap.gainedPct))}٪)`
      : `از مبدأ مقایسه ${round(gap.gained)} به سودِ دارندهٔ آن موقعیت حرکت کرده (${iso(gap.gainedPct)}٪)`);
  }
  if (finite(gap.upsidePct)) parts.push(`سودِ باقی‌مانده ${iso(gap.upsidePct)}٪ سرمایهٔ همین لحظه`);
  if (finite(gap.perDay)) parts.push(`${iso(gap.perDay)}٪ در هر روزِ مانده`);
  return `${parts.join('؛ ')}. عددها به ${gap.scale === 'raw' ? 'قیمت خام قرارداد' : gap.scale === 'size' ? 'ریالِ یک قرارداد' : 'ریالِ کل موقعیت'}.`;
}
