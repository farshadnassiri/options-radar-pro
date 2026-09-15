// دامنهٔ داده: «تا آخرین روز بسته‌شده» یا «تا همین لحظه».
//
// چهار تب — نگاه باز، تحلیل تاریخی استراتژی، رصد یونانی و آزمون همه
// استراتژی‌ها — همین انتخاب را دارند و همه باید دقیقاً یک رفتار نشان
// بدهند. اگر هرکدام نسخهٔ خودش را می‌داشت، شش ماه بعد یکی روز جاری را جور
// دیگری می‌چسباند و هیچ‌کس نمی‌فهمید کدام درست است. پس مسیر یکی است و
// اینجا می‌نشیند. مسیرهایی هم که سری کامل نمی‌سازند از `liveDaySnapshot`
// مستقیم می‌خوانند، نه از نسخهٔ خودشان.
//
// این ماژول فقط «گرفتن و چسباندن» را انجام می‌دهد؛ خودِ قاعده — کدام ابزار
// ردیف می‌گیرد، کدام روز مهر می‌خورد — در `core/live-day.mjs` است و جدا
// آزمون می‌شود.

import { liveDayOf, liveDayRows, liveTapeCodes, mergeLiveDay } from '../core/live-day.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { fmt, faClock, faDigits } from './fmt.mjs';

export const SCOPE_CLOSED = 'closed';
export const SCOPE_LIVE = 'live';

/**
 * گزینه‌های انتخابگر.
 *
 * ═══ چرا پیش‌فرض عوض شد ═══
 *
 * گزارش صاحب پروژه (۱۴۰۵/۰۶/۲۵): «در تقویم انتخابگر تا ۲۳ آمده در حالی که
 * امروز ۲۴ است… ما برای روزهای قبل دیتای تاریخی داریم و برای روز جاری هم
 * قیمت‌ها را داریم.»
 *
 * درست بود، و علتش همین پیش‌فرض بود. دفتر روزانهٔ بالادست ردیفِ یک روز را
 * تا **پایان** همان روز منتشر نمی‌کند، پس تا شب، امروز در هیچ فهرست تاریخی
 * نیست. عکس زندهٔ تابلو اما قیمت امروز را دارد.
 *
 * وقتی این گزینه ساخته شد، محافظه‌کاری درست بود: قابلیت تازه نباید رفتار
 * موجود را عوض کند. حالا که کار می‌کند و جمله‌اش هم صریح می‌گوید روزِ جاری
 * بسته نشده، پیش‌فرض همان چیزی است که کاربر انتظار دارد. گزینهٔ «تا آخرین
 * روز بسته‌شده» سر جایش است برای کسی که عددِ نهایی می‌خواهد.
 */
export const SCOPE_OPTIONS = [
  [SCOPE_LIVE, 'از روز مبدأ تا همین لحظه (شامل امروز)'],
  [SCOPE_CLOSED, 'فقط تا آخرین روز بسته‌شده'],
];

export const scopeOptionsMarkup = (selected = SCOPE_LIVE) => SCOPE_OPTIONS
  .map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`)
  .join('');

// سقفِ خودِ `/api/live-trades` برای هر درخواست. تکه‌تکه می‌رود تا بازهٔ
// چندنمادی هم بتواند ردیف امروزش را بگیرد.
const TAPE_CHUNK = 24;

/**
 * خلاصهٔ نوار معاملهٔ چند ابزار.
 *
 * هیچ‌وقت پرتاب نمی‌کند: نوارِ نرسیده یعنی «ردیف امروزِ این ابزارها ساخته
 * نشد»، نه «تحلیل خراب شد». قراردادهای اختیار ردیفشان را از خودِ تابلو
 * دارند و مستقل از این مسیرند.
 */
export async function loadTapeSummaries(codes = [], fetcher = fetch) {
  const list = [...new Set((codes || []).map((code) => String(code || '')).filter(Boolean))];
  const summaries = {};
  const errors = [];
  for (let at = 0; at < list.length; at += TAPE_CHUNK) {
    const part = list.slice(at, at + TAPE_CHUNK);
    try {
      const response = await fetcher(`/api/live-trades?ins=${part.join(',')}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `پاسخ ${response.status}`);
      for (const [ins, item] of Object.entries(payload.items || {})) {
        if (item?.summary) summaries[ins] = item.summary;
        else if (item?.error) errors.push(String(item.error));
      }
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }
  return { summaries, errors };
}

/**
 * ردیف امروزِ ابزارهای خواسته‌شده — دو منبع، یک خروجی.
 *
 * ═══ چرا دو درخواست، نه یکی ═══
 *
 * عکس زنجیره قیمت و فعالیتِ خودِ قراردادها را دارد ولی برای نماد پایه فقط
 * قیمت می‌دهد، بی حجم و بی تعداد معامله. یعنی از رویش نمی‌شود فهمید پایه
 * امروز اصلاً معامله شده یا تابلو دارد قیمت دیروزش را حمل می‌کند. نوار
 * معامله همان مدرک را دارد — و «اولین/کمترین/بیشترین» روز را هم.
 *
 * نوار فقط برای ابزارهایی گرفته می‌شود که **هم** روی تابلوی امروزند **هم**
 * فراخوان خواسته‌شان.
 *
 * `tapeFor` هزینه را تعیین می‌کند:
 *
 *   'bases' — فقط نماد پایه. ارزان، و برای «امروز در تقویم باشد» کافی:
 *             قراردادها قیمت و حجمشان را از خودِ تابلو دارند.
 *   'all'   — قراردادهای معامله‌شده هم. گران‌تر، ولی تنها راهی که مبنای
 *             «اولین/کمترین/بیشترین» برای روز جاری عدد داشته باشد.
 *
 * `tapeCap` سقفِ سختِ درخواست است. عبور از آن، نوارِ قراردادها را خاموش
 * می‌کند و در `tapeCapped` گزارش می‌شود — نه اینکه بی‌صدا چند صد درخواست
 * به بالادست بفرستد.
 *
 * `ok: false` یعنی «نمی‌دانیم عکس مال کدام روز است» و هیچ ردیفی ساخته
 * نمی‌شود؛ هرگز پرتاب نمی‌کند.
 */
export async function liveDaySnapshot({ wanted = [], fetcher = fetch, tapeFor = 'bases', tapeCap = 140 } = {}) {
  const keys = new Set((wanted || []).map((code) => String(code || '')).filter(Boolean));
  try {
    const response = await fetcher('/api/history/universe', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'عکس لحظه‌ای دریافت نشد');
    const day = liveDayOf(payload.market, payload.at, payload);
    if (!day.ok) {
      return {
        ok: false, date: 0, at: payload.at ?? null, rows: {}, tapeErrors: [],
        why: `عکس لحظه‌ای به روز جاری نسبت داده نشد${day.why ? ` — ${day.why}` : ''}`,
      };
    }
    const withContracts = tapeFor === 'all';
    let codes = liveTapeCodes(payload.rows, keys, { withContracts });
    let tapeCapped = false;
    if (withContracts && codes.length > tapeCap) {
      codes = liveTapeCodes(payload.rows, keys, { withContracts: false });
      tapeCapped = true;
    }
    const tape = codes.length ? await loadTapeSummaries(codes, fetcher) : { summaries: {}, errors: [] };
    return {
      ok: true, date: day.date, at: payload.at ?? null,
      rows: liveDayRows(payload.rows, { date: day.date, tapeByIns: tape.summaries }),
      taped: codes.length, tapeCapped, tapeErrors: tape.errors, why: '',
    };
  } catch (error) {
    return {
      ok: false, date: 0, at: null, rows: {}, tapeErrors: [],
      why: `عکس لحظه‌ای دریافت نشد (${error.message})`,
    };
  }
}

/**
 * ردیف روز جاری را روی سری‌های روزانه می‌نشاند.
 *
 * هیچ‌وقت پرتاب نمی‌کند. شکست — چه شبکه، چه روزی که به عکس نمی‌چسبد —
 * یعنی `ok: false` و برگشتِ **همان** سری‌های ورودی: حالت قبلی هرگز به‌خاطر
 * این قابلیت خراب نمی‌شود. `note` می‌گوید چه شد.
 */
export async function applyLiveScope(seriesByIns, { fetcher = fetch, tapeFor = 'bases' } = {}) {
  const wanted = Object.keys(seriesByIns || {});
  const snap = await liveDaySnapshot({ wanted, fetcher, tapeFor });
  if (!snap.ok) {
    return {
      ok: false, series: seriesByIns, date: 0, at: snap.at,
      note: `${snap.why}؛ همان روزهای بسته‌شده مبنا ماند.`,
    };
  }
  const merged = mergeLiveDay(seriesByIns, snap.rows, { date: snap.date });
  return {
    ok: true, ...merged, at: snap.at,
    note: scopeNote(merged, {
      total: wanted.length, at: snap.at, tapeErrors: snap.tapeErrors, tapeCapped: snap.tapeCapped,
    }),
  };
}

/**
 * جمله‌ای که کاربر می‌خواند. جدا و خالص است چون تنها چیزی است که از صحت
 * این مسیر می‌بیند، و باید مستقیم آزمون شود نه از دل رابط بیرون کشیده شود.
 *
 * هرگز بیش از عدد ادعا نمی‌کند: اگر هیچ نمادی امروز معامله نشده باشد،
 * جمله همین را می‌گوید — نه «به‌روز شد». نوارِ نرسیده هم پنهان نمی‌ماند،
 * چون نبودش دقیقاً یعنی ردیف امروزِ نماد پایه ساخته نشده.
 */
export function scopeNote(result, { total = 0, at = null, tapeErrors = [], tapeCapped = false } = {}) {
  // برچسب تاریخ هم رقم فارسی می‌گیرد؛ همان کاری که تقویم برنامه می‌کند
  const label = faDigits(historyDateLabel(result?.date));
  const clock = Number.isFinite(Number(at)) && Number(at) > 0 ? ` (ساعت ${faClock(new Date(Number(at)))})` : '';
  const tape = (tapeErrors || []).length
    ? ` نوار معاملهٔ نماد پایه کامل نرسید (${faDigits(tapeErrors.length)} خطا)، پس ردیف امروزِ بعضی پایه‌ها ساخته نشد.`
    : '';
  const touched = (result?.added || 0) + (result?.updated || 0);
  if (!touched) {
    return `تا ${label}${clock} هیچ‌کدام از ${fmt.int(total)} نماد امروز معامله‌ای نداشتند؛ ردیف لحظه‌ای ساخته نشد.${tape}`;
  }
  const parts = [];
  if (result.added) parts.push(`${fmt.int(result.added)} نماد ردیف تازهٔ امروز گرفت`);
  if (result.updated) parts.push(`${fmt.int(result.updated)} نماد ردیف امروزش تازه شد`);
  // چرا ردیفِ ناقص را می‌گوییم: عکس تابلو «اولین/کمترین/بیشترین» روز را
  // ندارد و ما جعلش نمی‌کنیم. نتیجهٔ عملی‌اش این است که با آن مبناها،
  // امروز اصلاً پیشنهاد نمی‌شود — و کاربر باید علتش را بداند، نه اینکه
  // ببیند روزی که دیروز بود امروز نیست.
  const partial = result.partial > 0
    ? ` ${fmt.int(result.partial)} ردیف فقط «آخرین» و «پایانی» دارد؛ با مبنای اولین، کمترین یا بیشترین، امروز پیشنهاد نمی‌شود.${tapeCapped ? ' (شمار ابزارها از سقف ریزمعامله گذشت، پس فقط نماد پایه کامل شد.)' : ''}`
    : '';
  return `تا ${label}${clock} · ${parts.join(' و ')} از ${fmt.int(total)} نماد. این روز بسته نشده و ارقامش نهایی نیست.${partial}${tape}`;
}
