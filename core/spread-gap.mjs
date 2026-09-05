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
    side: '', entry: num(entry, NaN), filledPct: NaN, upside: NaN, upsidePct: NaN,
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
  if (kind === 'strangle') {
    if (!hasEntry) {
      // دهانهٔ اعمال هست و نشان داده می‌شود، ولی لنگر نیست و ادعایی
      // رویش ساخته نمی‌شود.
      // `ok` می‌ماند چون جمعِ کنونی **سنجیده شد** و خودش عددِ درستی
      // است؛ آنچه نیست، لنگر است. `anchored: false` همین تفکیک را
      // حمل می‌کند تا رابط جمع را نشان دهد و درصدی نسازد.
      return {
        ...out, anchor: NaN, anchorSource: 'entry', anchored: false,
        anchorLabel: 'جمع پرمیوم ورود',
        why: 'برای استرانگل، لنگر جمعِ پرمیوم در لحظهٔ ورود است؛ بی آن، «چقدر سود گرفته‌ای» پرسشِ بی‌جوابی است و درصدی ساخته نمی‌شود',
      };
    }
    out.anchor = paid;
    out.anchorSource = 'entry';
    out.anchored = true;
    // ═══ خریده یا فروخته — دو جهتِ کاملاً وارونه ═══
    //
    // خواستهٔ کاربر دربارهٔ استرانگلِ **فروش** بود: «جمع دو تا قرارداد
    // (که فروختیم) بیشینه سود، و هرچی در طول زمان این جمع کمتر بشه
    // می‌شه سود استراتژی.»
    //
    // ولی استرانگلِ خرید هم در کاتالوگ هست و آنجا همه‌چیز وارونه است:
    // پرمیوم را **داده‌ای**، و سود از **بیشتر شدنِ** همان جمع می‌آید.
    // نسخهٔ اول این تفکیک را نداشت و هر دو را «فروخته» فرض می‌کرد؛
    // نتیجه‌اش در اجرای مرورگر دیده شد: یک استرانگلِ خرید که ۲۱۵ خریده
    // شده و حالا ۷۱۷ است — یعنی سه برابر شده — «‎−۲۳۳٪ سود گرفته‌شده»
    // نشان می‌داد.
    //
    // و یک تفاوتِ دوم که پنهان‌کردنش بدتر بود: استرانگلِ فروش سقفِ سود
    // دارد (همان بستانکار) ولی استرانگلِ خرید ندارد — پایه می‌تواند هر
    // قدر برود. پس «چند درصد مانده» برای خرید جواب ندارد و ساخته
    // نمی‌شود، به‌جای اینکه عددی بی‌معنی بگیرد.
    out.anchorLabel = now.side === 'credit' ? 'جمع پرمیوم ورود' : 'جمع پرمیوم پرداختی';
    if (now.side === 'credit') {
      out.coverageLabel = 'سودِ گرفته‌شده';
      // ── چرا «سودِ باقی‌مانده» نیست ──────────────────────────────────
      //
      // این عدد `جمعِ کنونی ÷ جمعِ ورود` است. وقتی موقعیت در سود است
      // (جمع کوچک‌تر شده) زیر صد می‌ماند و «سودِ باقی‌مانده» خواندنش
      // بی‌ضرر است. ولی وقتی جمع **بزرگ‌تر** از ورود شده — یعنی موقعیت
      // در زیان است — از صد رد می‌شود و «۳۳۳٪ سود باقی‌مانده» یک ادعای
      // کاملاً غلط است: سودِ فروشندهٔ استرانگل هرگز از خودِ بستانکارِ
      // ورود بیشتر نمی‌شود.
      //
      // اجرای مرورگر دقیقاً همین را نشان داد. آنچه این عدد واقعاً
      // می‌گوید «چقدر ارزش هنوز باید آب شود» است، و همان نوشته می‌شود.
      out.roomLabel = 'ارزشی که باید آب شود';
    } else {
      out.coverageLabel = 'نسبت به پرمیوم پرداختی';
      out.roomLabel = '';
      out.unbounded = true;
    }
  } else {
    out.anchorSource = 'strike';
    out.anchored = true;
    out.coverageLabel = 'پر شده';
    out.roomLabel = 'جا برای پر شدن';
  }

  // ── دو درصد ──────────────────────────────────────────────────────────
  //
  // در اسپرد: ارزشِ کنونی بر فاصلهٔ اعمال. در استرانگل: سودی که تا حالا
  // از آبِ‌شدنِ پرمیوم گرفته‌ای، بر بیشینهٔ سود. هر دو یک جمله می‌گویند —
  // «چقدر از راه رفته‌ام» — ولی مخرجشان یکی نیست و برچسبشان هم.
  if (kind === 'strangle' && now.side === 'credit') {
    // فروخته: جمع باید آب شود. آنچه آب شده، سود است.
    out.coverage = (paid - current) / paid;
    out.room = current;
  } else if (kind === 'strangle') {
    // خریده: جمع باید بزرگ شود، و سقفی ندارد. پس «نسبت به پرداختی»
    // گفته می‌شود و «باقی‌مانده» ساخته نمی‌شود.
    out.coverage = current / paid;
    out.coveragePct = out.coverage * 100;
    out.room = NaN;
    out.roomPct = NaN;
    out.gained = current - paid;
    out.maxProfit = NaN;
    out.maxLoss = -paid;
    out.upside = NaN;
    out.upsidePct = NaN;
    return out;
  } else {
    out.coverage = current / out.anchor;
    out.room = out.anchor - current;
  }
  out.coveragePct = out.coverage * 100;
  out.roomPct = 100 - out.coveragePct;

  if (!hasEntry) return out;

  // ── لنگر موقعیتی ─────────────────────────────────────────────────────
  if (now.side === 'debit') {
    out.maxProfit = out.anchorSource === 'strike' ? out.anchor - paid : NaN;
    out.maxLoss = -paid;
    out.gained = current - paid;
    out.upside = out.anchorSource === 'strike' ? out.anchor - current : NaN;
  } else {
    // بستانکار: بستانکارِ ورود بیشینهٔ سود است و ارزش باید به صفر برود.
    out.maxProfit = paid;
    out.maxLoss = out.anchorSource === 'strike' ? -(out.anchor - paid) : NaN;
    out.gained = paid - current;
    out.upside = current;
  }
  out.filledPct = finite(out.maxProfit) && out.maxProfit !== 0
    ? (out.gained / out.maxProfit) * 100 : NaN;
  // زیر آب بودن، خودش یک حالت است و باید نامش را داشته باشد — نه اینکه
  // با یک درصدِ منفی وسطِ ستونی از درصدهای مثبت پنهان بماند.
  out.underwater = finite(out.gained) && out.gained < 0;
  // ── لنگرِ ورودی، مخرجی برای «بازده» ندارد ────────────────────────────
  //
  // برای اسپرد، سرمایهٔ درگیرِ همین لحظه معلوم است و «سود باقی‌مانده بر
  // آن» عدد درستی است. برای استرانگل نیست: سرمایهٔ فروشنده وجه تضمین
  // است، نه بستانکار. تقسیم بر بستانکار، «۳۳۳٪ بازده» می‌داد برای
  // موقعیتی که در زیان بود. مخرجِ مدافع‌پذیر نداریم، پس عددی هم ساخته
  // نمی‌شود — و `upside` به ریال می‌ماند که خودش صادق است.
  if (out.anchorSource === 'entry') {
    out.upsidePct = NaN;
    out.perDay = NaN;
    return out;
  }
  // سودِ باقی‌مانده بر سرمایه‌ای که **همین حالا** درگیرش می‌شوید — نه بر
  // سرمایهٔ روز ورود. کسی که امروز نگاه می‌کند، امروز وارد می‌شود.
  const atRisk = now.side === 'debit'
    ? current
    : (finite(out.anchor) && out.anchorSource === 'strike' ? out.anchor - current : paid);
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
  const iso = (n) => `\u2068${Number(n).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}\u2069`;
  const parts = [];

  if (gap.anchorSource === 'entry') {
    if (gap.unbounded) {
      parts.push(`جمع پرمیومِ پرداختی ${iso(Math.round(gap.entry))} بود و اکنون ${iso(Math.round(gap.current))} است — ${iso(gap.coveragePct)}٪ آن. سودِ استرانگلِ خرید سقف ندارد، پس «باقی‌مانده» ساخته نمی‌شود`);
    } else if (gap.underwater) {
      parts.push(`جمع پرمیومِ ورود ${iso(Math.round(gap.entry))} بود و اکنون ${iso(Math.round(gap.current))} — یعنی جمع بزرگ‌تر شده و موقعیت در زیان است؛ ${iso(Math.abs(gap.coveragePct))}٪ از بیشینهٔ سود از دست رفته و ${iso(gap.roomPct)}٪ ارزش هنوز باید آب شود`);
    } else {
      parts.push(`جمع پرمیومِ ورود ${iso(Math.round(gap.entry))} بود و اکنون ${iso(Math.round(gap.current))} است — ${iso(gap.coveragePct)}٪ از بیشینهٔ سود گرفته شده و ${iso(gap.roomPct)}٪ ارزش هنوز باید آب شود`);
    }
    if (finite(gap.strikeGap)) parts.push(`دهانهٔ اعمال ${iso(Math.round(gap.strikeGap))}`);
  } else {
    parts.push(`فاصلهٔ اعمال ${iso(Math.round(gap.anchor))}؛ تفاضل دو نرخ اکنون ${iso(Math.round(gap.current))} — ${iso(gap.coveragePct)}٪ پر شده و ${iso(gap.roomPct)}٪ جا دارد`);
  }
  if (finite(gap.upsidePct)) {
    parts.push(`سودِ باقی‌مانده ${iso(gap.upsidePct)}٪ سرمایهٔ همین لحظه`);
  }
  if (finite(gap.perDay)) parts.push(`${iso(gap.perDay)}٪ در هر روزِ مانده`);
  return `${parts.join('؛ ')}. عددها به ${gap.scale === 'raw' ? 'قیمت خام قرارداد' : gap.scale === 'size' ? 'ریالِ یک قرارداد' : 'ریالِ کل موقعیت'}.`;
}
