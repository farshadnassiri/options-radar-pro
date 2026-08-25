// بایگانی دیده‌بان — درمانِ سوگیری بقا.
//
// `GetInstrumentOptionMarketWatch` فهرست **امروز** را می‌دهد و هیچ نسخهٔ
// تاریخ‌داری ندارد. نتیجه‌اش یک نشت بی‌صداست: جلسه‌ای که به سه ماه پیش
// می‌رود، فقط قراردادهایی را می‌بیند که تا امروز زنده مانده‌اند. آن‌هایی
// که داخل همان بازه سررسید شده‌اند — یعنی مرتبط‌ترین‌ها — اصلاً وجود
// ندارند، و دانستنِ اینکه کدام‌ها زنده ماندند خودش خبری از آینده است.
//
// راه‌حل بیرونی ندارد: بالادست آن داده را نمی‌دهد. تنها کاری که می‌شود
// کرد این است که **از امروز** هر روز یک بار فهرست را ذخیره کنیم. بایگانی
// روز اول خالی است و هر روز یک روز کامل‌تر می‌شود. صادقانه‌ترین چیزی که
// می‌شود گفت همین است، و رابط هم دقیقاً همین را می‌گوید.
//
// ═══ چرا فشرده ═══
//
// هر ردیف دیده‌بان ده‌ها میدان دارد که بیشترشان قیمت لحظه‌ای‌اند و برای
// «کدام قرارداد آن روز وجود داشت» به کار نمی‌آیند. نگه‌داشتن همه، روزی
// چند مگابایت است برای چیزی که چند کیلوبایتش کافی است. آنچه می‌ماند فقط
// هویت و مشخصات قرارداد است — و همان هم عمداً بدون قیمت، تا کسی وسوسه
// نشود قیمتِ آن روز را از این فایل بردارد؛ قیمت جای خودش را دارد
// (`/api/hist`) و آنجا واقعی است.

import { num } from './num.mjs';

/** نسخهٔ ساختار فایل. اگر شکل عوض شد، خواننده باید بفهمد. */
export const ARCHIVE_VERSION = 1;

/** تاریخ فشردهٔ میلادی هشت‌رقمی — همان قراردادی که همهٔ مسیرهای تاریخی دارند. */
export function validArchiveDate(value) {
  return typeof value === 'string' && /^(?:19|20)\d{6}$/.test(value);
}

export function archiveName(date) {
  return validArchiveDate(String(date)) ? `${date}.json` : null;
}

/**
 * فشرده‌کردن یک ردیف دیده‌بان.
 *
 * `null` برمی‌گرداند برای ردیفی که هویت کامل ندارد — بدون کد پایه یا
 * بدون قیمت اعمال، ردیف به درد بازسازی زنجیره نمی‌خورد و نگه‌داشتنش فقط
 * فایل را بزرگ می‌کند.
 */
export function compactWatchRow(row) {
  const uaIns = String(row?.uaInsCode ?? '').trim();
  const strike = num(row?.strikePrice, 0);
  if (!uaIns || !(strike > 0)) return null;
  return {
    ua: uaIns,
    uaName: String(row?.lval30_UA ?? '').trim(),
    c: String(row?.insCode_C ?? '').trim(),
    p: String(row?.insCode_P ?? '').trim(),
    cName: String(row?.lVal18AFC_C ?? '').trim(),
    pName: String(row?.lVal18AFC_P ?? '').trim(),
    k: strike,
    size: num(row?.contractSize, 0),
    end: num(row?.endDate, 0),
    days: Math.round(num(row?.remainedDay, 0)),
  };
}

/**
 * فشرده‌کردن کل عکس، بدون تکرار.
 *
 * کلید یکتایی، سه‌تایی «پایه، قیمت اعمال، سررسید» است. یک عکس نباید
 * تکراری داشته باشد، ولی اگر داشت، دومی چیز تازه‌ای نمی‌گوید و فقط
 * بازسازی زنجیره را دو برابر می‌کند.
 */
export function compactWatch(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const compact = compactWatchRow(row);
    if (!compact) continue;
    const key = `${compact.ua}|${compact.k}|${compact.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(compact);
  }
  return out;
}

/** پروندهٔ یک روز، آمادهٔ نوشتن. */
export function makeArchive(date, rows = [], { at = 0 } = {}) {
  const compact = compactWatch(rows);
  return {
    version: ARCHIVE_VERSION,
    date: Number(date) || 0,
    at: num(at, 0),
    count: compact.length,
    rows: compact,
  };
}

/**
 * بازسازی ردیف‌های دیده‌بان از بایگانی.
 *
 * خروجی همان شکلی است که `buildChain` می‌خواهد، ولی **بدون قیمت**: هر
 * میدان قیمتی صفر می‌ماند. این عمدی است و مهم — بایگانی برای پاسخ به
 * «کدام قرارداد آن روز بود» ساخته شده، نه «چند بود». قیمتِ آن روز از
 * مسیرهای تاریخ‌دار می‌آید و آنجا واقعی است؛ اگر اینجا هم عددی می‌گذاشتیم،
 * روزی یکی رویش حساب می‌کرد.
 */
export function chainRowsFrom(archive) {
  const rows = archive?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    uaInsCode: row.ua, lval30_UA: row.uaName || '',
    insCode_C: row.c, insCode_P: row.p,
    lVal18AFC_C: row.cName || '', lVal18AFC_P: row.pName || '',
    lVal30_C: row.cName || '', lVal30_P: row.pName || '',
    strikePrice: row.k, contractSize: row.size, endDate: row.end, remainedDay: row.days,
    // همهٔ میدان‌های قیمتی صفر می‌مانند — بایگانی قیمت نگه نمی‌دارد.
    pDrCotVal_UA: 0, pClosing_UA: 0, priceYesterday_UA: 0,
    pDrCotVal_C: 0, pClosing_C: 0, priceYesterday_C: 0,
    pDrCotVal_P: 0, pClosing_P: 0, priceYesterday_P: 0,
    zTotTran_C: 0, qTotTran5J_C: 0, qTotCap_C: 0, oP_C: 0,
    zTotTran_P: 0, qTotTran5J_P: 0, qTotCap_P: 0, oP_P: 0,
    pMeDem_C: 0, qTitMeDem_C: 0, pMeOf_C: 0, qTitMeOf_C: 0,
    pMeDem_P: 0, qTitMeDem_P: 0, pMeOf_P: 0, qTitMeOf_P: 0,
    fromArchive: true,
  }));
}

/**
 * جملهٔ صداقت — چه چیزی به دست مصرف‌کننده رسید.
 *
 * سه حالت و سه جملهٔ متفاوت. حالت میانی خطرناک‌ترین است: بایگانی هست ولی
 * برای آن تاریخ نیست، و اگر بی‌صدا فهرست امروز جایش بنشیند، همان سوگیری
 * بقا برمی‌گردد — این بار با ظاهرِ حل‌شده.
 */
export function archiveNote({ wanted, found, firstDate = 0, count = 0 } = {}) {
  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (found) {
    return `فهرست قراردادها از بایگانی همان روز آمد — ${fa(count)} ردیف. سوگیری بقا در این جلسه وجود ندارد.`;
  }
  if (firstDate) {
    return `برای ${fa(wanted)} بایگانی نداریم؛ ضبط روزانه از ${fa(firstDate)} شروع شده. فهرست از دیده‌بان امروز ساخته شد، پس قراردادی که داخل این بازه سررسید شده دیده نمی‌شود — عدد جلسه با آن خوش‌بین‌تر از واقعیت است.`;
  }
  return 'هنوز هیچ بایگانی دیده‌بانی ضبط نشده. فهرست از دیده‌بان امروز می‌آید و سوگیری بقا دارد؛ از امروز که سرور روشن بماند، هر روز یک روز به بایگانی اضافه می‌شود.';
}
