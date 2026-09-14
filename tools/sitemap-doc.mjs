// سازندهٔ «نقشهٔ سایت» — سندی برای معامله‌گر، نه برای عامل.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۶/۲۵، قلم ۴): «یک فایل درست کن که داخلش نقشهٔ
// سایت باشد… برای یک معامله‌گر آپشن به زبان ساده… خلاصه داشته باشد و
// جزئیات… خروجی PDF.»
//
// ═══ چرا سازنده، نه یک PDF دستی ═══
//
// عددهای این سند — ۳۶ استراتژی، ۵۶ ستون، ۵۰ نما — از **خودِ کد** خوانده
// می‌شوند، نه از حافظهٔ کسی. سندِ دستی روزی که یک استراتژی اضافه شود
// بی‌صدا دروغ می‌گوید؛ این یکی با یک بار اجرا دوباره درست می‌شود.
//
// اجرا (به دروازه وصل نیست و بخشی از برنامه هم نیست):
//   node tools/sitemap-doc.mjs           HTML در docs/SITE-MAP.html
//   node tools/sitemap-doc.mjs --pdf     و PDF کنارش

import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const { CATALOG } = await import(`${ROOT}strategies/catalog.mjs`);
const GROUP_FA = {
  single: 'تک‌پایه', income: 'کسب درآمد', vertical: 'اسپرد عمودی', calendar: 'اسپرد تقویمی',
  vol: 'تلاطم', wing: 'باترفلای و کندور', ratio: 'نسبت و بک‌اسپرد', hedge: 'پوشش ریسک',
  arb: 'آربیتراژ و همبستگی',
};
const dashSrc = fs.readFileSync(`${ROOT}ui/tabs/live-market-dashboard.mjs`, 'utf8');
const contractBlock = /const COLS_CONTRACT = \[([\s\S]*?)\n\];/.exec(dashSrc)[1];
const colList = [...contractBlock.matchAll(/col\('(\w+)', '([^']*)', '(\w+)', \{ group: '([^']*)'/g)];
const colsByGroup = {};
for (const m of colList) (colsByGroup[m[4]] = colsByGroup[m[4]] || []).push(m[2]);
const D = {
  cat: CATALOG.map((s) => ({ fa: s.fa, en: s.name, group: GROUP_FA[s.group] || s.group,
    dir: s.dir, legs: s.legs.length, expect: s.expect, note: s.note })),
  cols: colsByGroup,
  views: [...dashSrc.matchAll(/const (\w+Views) = \[([\s\S]*?)\n\];/g)].map((m) => ({
    name: m[1], items: [...m[2].matchAll(/\['[^']+', '([^']+)'/g)].map((x) => x[1]),
  })),
};
const fa = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ————— بخش‌های برنامه: چه سؤالی جواب می‌دهند —————
const SECTIONS = [
  ['رصد لحظه‌ای بازار', 'کل بازار اختیار همین حالا کجاست؟', 'نقشهٔ بازار، زنجیرهٔ دوطرفه، کندل روزانه، ۵۰ جدول و نمودار تحلیلی، تابلوی پرمعامله، دیده‌بان زنجیره و برترین موقعیت‌ها — همه در یک صفحهٔ تب‌بندی‌شده.', 'شروع هر روز. پیش از اینکه بدانی چه می‌خواهی بزنی.'],
  ['۳۶ تب استراتژی', 'این استراتژی امروز روی کدام نماد جواب می‌دهد؟', 'برای هر استراتژی یک تب: غربال همهٔ ترکیب‌های ممکن روی کل بازار، با سود/زیان، سربه‌سر، وجه تضمین و بازده. رصد زنده و رصد تاریخی در همان تب.', 'وقتی دیدگاه داری (صعودی/نزولی/خنثی) و دنبال بهترین اجرای آن می‌گردی.'],
  ['آزمایشگاه آپشن', 'اگر این موقعیت را در گذشته باز کرده بودم چه می‌شد؟', 'بک‌تست یک ترکیب مشخص روی بازهٔ تاریخی، ثانیه به ثانیه، با قیمت‌های واقعی مشاهده‌شده. رصد زندهٔ همان موقعیت از یک ورود تاریخی.', 'پیش از اینکه پول واقعی بگذاری. یا بعد از ورود، برای دنبال‌کردن موقعیت.'],
  ['آزمون همه استراتژی‌ها', 'کدام استراتژی در این بازه بهترین بود؟', 'همان بک‌تست، ولی روی هر ۳۶ استراتژی و همهٔ ترکیب‌هایشان با هم؛ خروجی، رتبه‌بندی استراتژی‌هاست نه یک ترکیب.', 'وقتی می‌خواهی سبک معاملاتی‌ات را انتخاب کنی، نه یک معامله.'],
  ['رصد یونانی و تلاطم', 'حساسیت موقعیتم به قیمت، زمان و نوسان چقدر است؟', 'دلتا، گاما، تتا، وگا و تلاطم ضمنی یک موقعیت در طول عمرش — نه در یک لحظه.', 'بعد از ورود، برای مدیریت ریسک. مخصوصاً وقتی چند پا داری.'],
  ['رادار فاصله', 'فاصلهٔ اسپرد یا استرانگل کِی به شرط من می‌رسد؟', 'شرط‌گذاری روی فاصله — عدد مشخص، درصد پرشدن، درصد از کف امروز، یا صدک تاریخی — با رصد هر ده ثانیه و اعلان.', 'وقتی منتظر یک قیمت خاصی و نمی‌خواهی تابلو را ساعت‌ها نگاه کنی.'],
  ['دیده‌بان شرطی', 'کِی شرط من روی هر سنجه‌ای برقرار می‌شود؟', 'همان ایده، ولی روی هر سنجه‌ای: قیمت، تلاطم، موقعیت باز، وسعت بازار.', 'برای شرط‌هایی که رادار فاصله پوشش نمی‌دهد.'],
  ['سفره پر برکت بازار', 'فرصت‌های کم‌ریسکِ امروز کجاست؟', 'غربال ویژهٔ موقعیت‌هایی با نسبت سود به ریسک بالا و رویدادهای قابل شناسایی.', 'مرور سریع روزانه، برای کسی که وقت غربال کامل ندارد.'],
  ['استودیوی سفر زمانی سبد', 'اگر سبدم را از فلان تاریخ می‌ساختم، امروز کجا بودم؟', 'شبیه‌سازی یک سبد چندموقعیتی در طول زمان، با تخصیص سرمایه و قواعد ورود و خروج.', 'برای برنامه‌ریزی سبد، نه یک معامله.'],
  ['موقعیت‌های من و تحلیل رول', 'موقعیت باز من الان چه وضعی دارد و کِی باید غلتانده شود؟', 'ثبت موقعیت واقعی، سود و زیان جاری، و مقایسهٔ گزینه‌های رول (تمدید سررسید یا جابه‌جایی اعمال).', 'بعد از ورود تا خروج.'],
  ['تنظیمات', 'فرض‌های محاسبه چیست؟', 'کارمزد، اندازهٔ قرارداد، نرخ بدون ریسک، بازده نقدی، روزهای سال، دامنهٔ تلاطم، بازهٔ رصد.', 'یک بار در شروع، و هر وقت فرضی عوض شد — این اعداد روی همهٔ خروجی‌ها اثر دارند.'],
  ['دفتر خطاها', 'چه چیزی از بالادست نیامد؟', 'هر خطای دریافت داده با زمان و محل، تا بدانی کدام عدد ناقص است.', 'وقتی عددی مشکوک یا خالی است.'],
];

const FLOWS = [
  ['شروع روز', ['تنظیمات را یک بار چک کن', 'رصد لحظه‌ای → نقشهٔ بازار: پول کجاست؟', 'یک نماد را از نقشه انتخاب کن', 'زنجیرهٔ دوطرفه: کدام اعمال تعهد سنگین دارد؟', 'تب «نبض و جهت»: بازار امروز کدام طرف است؟']],
  ['دیدگاه دارم، اجرا می‌خواهم', ['تب استراتژیِ متناسب با دیدگاه را باز کن', 'اسکن بزن؛ جدول را روی «بازده» یا «سود به ریسک» مرتب کن', 'ردیف مشکوک را باز کن و نمودار سود و زیانش را ببین', 'با «آزمایشگاه آپشن» همان ترکیب را روی گذشته بیازما']],
  ['وارد شدم، مدیریت می‌خواهم', ['موقعیت را در «موقعیت‌های من» ثبت کن', '«رصد یونانی» را برای دنبال‌کردن دلتا و تتا باز کن', 'در «رادار فاصله» شرط خروج بگذار تا اعلان بگیری', 'نزدیک سررسید، «تحلیل رول» گزینه‌ها را مقایسه می‌کند']],
  ['می‌خواهم سبکم را انتخاب کنم', ['«آزمون همه استراتژی‌ها» را روی یک بازهٔ معنادار اجرا کن', 'رتبه‌بندی استراتژی‌ها را ببین، نه یک ترکیب', '«استودیوی سفر زمانی سبد» برای ترکیب چند موقعیت']],
];

const RULES = [
  ['عدد نداشته، ساخته نمی‌شود', 'اگر قیمتی نیامده، خانه «—» می‌ماند. با پایانی دیروز، VWAP یا قیمت مدل پر نمی‌شود. «نمی‌دانیم» با «صفر» یکی نیست.'],
  ['هر عدد، منبعش معلوم است', 'ستون «علت نبود تلاطم» می‌گوید چرا خانه‌ای خالی است: قیمت زیر کف نظری، بالاتر از دامنه، بدون معامله، یا ورودی ناقص.'],
  ['مشاهده‌ای و اجرایی جدا', 'تلاطم و دلتای «آخرین معامله» ممکن است با قیمت پایه هم‌زمان نباشند. ستون‌های «اجرایی» از میانهٔ مظنه می‌آیند که همین حالای دفتر سفارش است.'],
  ['قیمت تاریخی، قیمت اجرا نیست', 'بک‌تست از معاملات مشاهده‌شده ساخته می‌شود. تضمین نمی‌کند در آن لحظه می‌شد همان قیمت را زد.'],
  ['قرارداد سررسیدشده معامله‌پذیر نیست', 'حتی اگر بالادست آخرین قیمتش را تکرار کند.'],
  ['زمان عکس، زمان پاسخ نیست', 'نوار بالای داشبورد هر دو را می‌گوید. عکس کهنه، قرمز می‌شود.'],
];

const GLOSSARY = [
  ['سربه‌سر', 'قیمتی از پایه که در آن، در سررسید، نه سود می‌کنی نه زیان. کال: اعمال + پریمیوم. پوت: اعمال − پریمیوم.'],
  ['فاصله تا سربه‌سر', 'پایه چقدر باید حرکت کند تا به سربه‌سر برسد. در هر دو سمت، مثبت یعنی هنوز نرسیده‌ایم.'],
  ['در سود (ITM)', 'کال وقتی اعمالش زیر قیمت جاری است؛ پوت وقتی بالای آن. ارزش ذاتی دارد.'],
  ['ارزش ذاتی و ارزش زمانی', 'ذاتی همان سودِ همین‌حالای اعمال است؛ زمانی، مابقی پریمیوم — که تا سررسید می‌سوزد.'],
  ['تلاطم ضمنی (IV)', 'نوسانی که قیمت بازار، در مدل بلک–شولز، به آن قرارداد نسبت می‌دهد. گران یا ارزان بودن اختیار را می‌گوید.'],
  ['دلتا', 'یک واحد حرکت پایه، چند واحد روی پریمیوم می‌نشیند. کال مثبت، پوت منفی.'],
  ['گاما', 'دلتا خودش چقدر سریع عوض می‌شود. نزدیک پول و نزدیک سررسید بیشینه است.'],
  ['تتا', 'هر روز چقدر از ارزش زمانی می‌سوزد. برای خریدار منفی، برای فروشنده مثبت.'],
  ['وگا', 'یک درصد تغییر تلاطم، چقدر روی پریمیوم اثر دارد.'],
  ['اهرم مؤثر', 'اهرم ساده (پایه ÷ پریمیوم) ضربدر قدرمطلق دلتا. یعنی «یک درصد حرکت پایه، چند درصد روی پریمیوم».'],
  ['موقعیت باز (OI)', 'تعداد قراردادهای بازِ تسویه‌نشده. تجمع سنگین روی یک اعمال، مثل سطح حمایت یا مقاومت رفتار می‌کند.'],
  ['بیشترین درد (Max Pain)', 'قیمتی که در آن مجموع ارزش ذاتی تعهدهای باز کمینه می‌شود. ادعای پیش‌بینی نیست؛ می‌گوید سنگینی تعهد کجاست.'],
  ['کف نظری', 'کمترین قیمتی که مدل برای آن قرارداد مجاز می‌داند. قیمت زیر آن، یعنی تلاطم ضمنی حل نمی‌شود.'],
];

const groups = [...new Set(D.cat.map((s) => s.group))];
const catRows = groups.map((g) => {
  const list = D.cat.filter((s) => s.group === g);
  return `<tr class="grp"><th colspan="5">${esc(g)} — ${fa(list.length)} استراتژی</th></tr>` + list.map((s) => `<tr>
    <td class="nm"><b>${esc(s.fa)}</b><small>${esc(s.en)}</small></td>
    <td>${esc(s.dir)}</td><td class="c">${fa(s.legs)}</td>
    <td>${s.expect === 'debit' ? 'پرداخت' : s.expect === 'credit' ? 'دریافت' : '—'}</td>
    <td class="note">${esc(s.note || '')}</td></tr>`).join('');
}).join('');

const colRows = Object.entries(D.cols).map(([g, list]) => `<tr>
  <th>${esc(g)}</th><td class="c">${fa(list.length)}</td><td class="note">${list.map(esc).join(' · ')}</td></tr>`).join('');

const viewNames = { pulseViews: 'نبض و جهت بازار', liquidityViews: 'نقدینگی و سررسید', volatilityViews: 'تلاطم و انتظارات', boardViews: 'اختیارهای پرمعامله' };
const viewRows = D.views.map((v) => `<tr>
  <th>${esc(viewNames[v.name] || v.name)}</th><td class="c">${fa(v.items.length)}</td>
  <td class="note">${v.items.map(esc).join(' · ')}</td></tr>`).join('');

// ————— نمودار نقشهٔ سایت —————
const NODE = (x, y, w, h, title, sub, tone) => `
  <g class="node ${tone}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
    <text x="${x + w / 2}" y="${y + 24}" class="nt">${esc(title)}</text>
    ${sub ? `<text x="${x + w / 2}" y="${y + 42}" class="ns">${esc(sub)}</text>` : ''}
  </g>`;
const ARROW = (x1, y1, x2, y2) => `<path class="edge" d="M${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}" marker-end="url(#ar)"/>`;

const MAP = `<svg viewBox="0 0 900 560" class="sitemap" role="img" aria-label="نقشهٔ مسیر کار در برنامه">
  <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#64748b"/></marker></defs>
  ${NODE(350, 10, 200, 56, 'تنظیمات', 'کارمزد · نرخ · اندازهٔ قرارداد', 'base')}
  ${ARROW(450, 66, 450, 106)}
  ${NODE(310, 106, 280, 56, 'رصد لحظه‌ای بازار', 'نقشه ← نماد ← سررسید ← قرارداد', 'hub')}
  ${ARROW(370, 162, 170, 212)} ${ARROW(450, 162, 450, 212)} ${ARROW(530, 162, 730, 212)}
  ${NODE(50, 212, 240, 56, '۳۶ تب استراتژی', 'غربال ترکیب‌های ممکن', 'act')}
  ${NODE(330, 212, 240, 56, 'آزمایشگاه آپشن', 'بک‌تست یک ترکیب', 'act')}
  ${NODE(610, 212, 240, 56, 'آزمون همه استراتژی‌ها', 'رتبه‌بندی سبک‌ها', 'act')}
  ${ARROW(170, 268, 450, 318)} ${ARROW(450, 268, 450, 318)} ${ARROW(730, 268, 450, 318)}
  ${NODE(330, 318, 240, 56, 'تصمیم و اجرا', 'بیرون از برنامه', 'gate')}
  ${ARROW(450, 374, 450, 414)}
  ${NODE(330, 414, 240, 56, 'موقعیت‌های من', 'ثبت موقعیت واقعی', 'hold')}
  ${ARROW(370, 470, 170, 500)} ${ARROW(450, 470, 450, 500)} ${ARROW(530, 470, 730, 500)}
  ${NODE(50, 500, 240, 50, 'رصد یونانی', 'دلتا · تتا · وگا', 'hold')}
  ${NODE(330, 500, 240, 50, 'رادار فاصله و دیده‌بان', 'شرط و اعلان', 'hold')}
  ${NODE(610, 500, 240, 50, 'تحلیل رول', 'تمدید یا جابه‌جایی', 'hold')}
</svg>`;

// ————— نمودار نمونهٔ سود و زیان —————
const payoff = (() => {
  const K = 100, prem = 8, lo = 70, hi = 135;
  const x = (s) => 40 + ((s - lo) / (hi - lo)) * 700;
  const pnl = (s) => Math.max(0, s - K) - prem;
  const y = (p) => 150 - (p / 30) * 110;
  const pts = [];
  for (let s = lo; s <= hi; s += 0.5) pts.push(`${x(s).toFixed(1)},${y(pnl(s)).toFixed(1)}`);
  return `<svg viewBox="0 0 780 240" class="chart" role="img" aria-label="نمودار سود و زیان خرید کال">
    <line class="ax" x1="40" y1="${y(0)}" x2="760" y2="${y(0)}"/>
    <line class="grid" x1="${x(K)}" y1="20" x2="${x(K)}" y2="200"/>
    <line class="be" x1="${x(K + prem)}" y1="20" x2="${x(K + prem)}" y2="200"/>
    <polyline class="pnl" points="${pts.join(' ')}"/>
    <text class="lb" x="${x(K)}" y="215" text-anchor="middle">اعمال ${fa(K)}</text>
    <text class="lb be-t" x="${x(K + prem)}" y="15" text-anchor="middle">سربه‌سر ${fa(K + prem)}</text>
    <text class="lb" x="748" y="${y(0) - 8}" text-anchor="end">سود</text>
    <text class="lb" x="748" y="${y(0) + 18}" text-anchor="end">زیان</text>
    <text class="lb" x="600" y="228" text-anchor="middle">← قیمت پایهٔ نماد در روز سررسید</text>
    <text class="lb loss-t" x="${(x(lo) + x(K)) / 2}" y="${y(-prem) - 12}" text-anchor="middle">بیشترین زیان = پریمیوم ${fa(prem)}</text>
  </svg>`;
})();

const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>نقشهٔ سایت — رصد استراتژی آپشن</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Sans", sans-serif; color: #0f172a; font-size: 10.5px; line-height: 1.85; }
  h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: -.3px; }
  h2 { margin: 26px 0 10px; padding-block-end: 6px; border-block-end: 2px solid #4338ca; color: #312e81; font-size: 16px; }
  h3 { margin: 16px 0 6px; color: #1e293b; font-size: 12.5px; }
  p { margin: 0 0 8px; }
  .cover { padding: 22px 20px; border-radius: 14px; background: linear-gradient(135deg, #eef2ff, #f8fafc); border: 1px solid #c7d2fe; }
  .cover .sub { color: #4338ca; font-weight: bold; font-size: 12px; margin-bottom: 8px; }
  .cover .lead { font-size: 12px; color: #334155; }
  .meta { margin-top: 10px; color: #64748b; font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 9.5px; }
  th, td { padding: 5px 7px; border: 1px solid #e2e8f0; vertical-align: top; text-align: right; }
  thead th { background: #eef2ff; color: #312e81; font-size: 9.5px; }
  tbody th { background: #f8fafc; white-space: nowrap; }
  tr.grp th { background: #4338ca; color: #fff; text-align: center; font-size: 10px; }
  td.c { text-align: center; white-space: nowrap; }
  td.nm b { display: block; } td.nm small { color: #64748b; direction: ltr; display: block; }
  td.note, .note { color: #475569; font-size: 9px; line-height: 1.7; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .card { padding: 9px 11px; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff; break-inside: avoid; }
  .card b { color: #312e81; display: block; margin-bottom: 2px; }
  .card .q { color: #0369a1; font-weight: bold; font-size: 9.5px; display: block; margin-bottom: 3px; }
  .card .w { color: #475569; font-size: 9px; }
  .card .when { display: block; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1; color: #166534; font-size: 9px; }
  ol.flow { margin: 4px 0 0; padding-inline-start: 18px; } ol.flow li { margin-bottom: 2px; font-size: 9.5px; }
  .sitemap { width: 100%; height: auto; margin: 6px 0 10px; }
  .node rect { fill: #fff; stroke: #cbd5e1; stroke-width: 1.4; }
  .node.base rect { fill: #f1f5f9; stroke: #94a3b8; }
  .node.hub rect { fill: #eef2ff; stroke: #4338ca; stroke-width: 2.2; }
  .node.act rect { fill: #ecfdf5; stroke: #059669; }
  .node.gate rect { fill: #fef3c7; stroke: #d97706; stroke-dasharray: 5 4; }
  .node.hold rect { fill: #faf5ff; stroke: #7c3aed; }
  .nt { font-size: 13px; font-weight: bold; fill: #0f172a; text-anchor: middle; }
  .ns { font-size: 10px; fill: #64748b; text-anchor: middle; }
  .edge { fill: none; stroke: #94a3b8; stroke-width: 1.5; }
  .chart { width: 100%; height: auto; }
  .chart .ax { stroke: #334155; stroke-width: 1.2; }
  .chart .grid { stroke: #cbd5e1; stroke-dasharray: 4 4; }
  .chart .be { stroke: #d97706; stroke-dasharray: 5 3; stroke-width: 1.4; }
  .chart .pnl { fill: none; stroke: #059669; stroke-width: 2.6; }
  .chart { direction: ltr; }
  .chart .lb { font-size: 10px; fill: #475569; }
  .chart .be-t { fill: #b45309; font-weight: bold; }
  .chart .loss-t { fill: #b91c1c; }
  .rule { display: grid; grid-template-columns: 170px 1fr; gap: 8px; padding: 6px 0; border-block-end: 1px dashed #e2e8f0; }
  .rule b { color: #b91c1c; font-size: 10px; }
  .gl { display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 9.5px; }
  .gl b { color: #312e81; }
  .pg { break-before: page; }
  .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 8.5px; text-align: center; }
  .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 14px; }
  .kpi div { padding: 8px; border: 1px solid #c7d2fe; border-radius: 9px; background: #eef2ff; text-align: center; }
  .kpi b { display: block; color: #312e81; font-size: 19px; }
  .kpi span { color: #475569; font-size: 8.5px; }
</style></head><body>

<section class="cover">
  <p class="sub">راهنمای یک‌جای برنامه، برای معامله‌گر آپشن</p>
  <h1>رصد استراتژی آپشن — نقشهٔ سایت</h1>
  <p class="lead">این برنامه یک <b>دفتر محاسبه</b> است، نه تابلوی تبلیغ. کارش این است که همان اعدادی را که
  خودت روی کاغذ حساب می‌کنی — سربه‌سر، بیشترین زیان، وجه تضمین، دلتا، بازده — برای <b>همهٔ ترکیب‌های ممکن</b>
  روی کل بازار اختیار، هم‌زمان حساب کند و مرتب جلویت بگذارد. هیچ عددی را نمی‌سازد: اگر داده‌ای نیامده باشد،
  خانه «—» می‌ماند و می‌گوید چرا.</p>
  <p class="meta">این سند از روی خودِ کد ساخته شده — شمار استراتژی‌ها، ستون‌ها و نماها، همان‌هایی است که در برنامه هست.</p>
</section>

<div class="kpi">
  <div><b>${fa(D.cat.length)}</b><span>استراتژی، هرکدام یک تب</span></div>
  <div><b>${fa(Object.values(D.cols).reduce((n, l) => n + l.length, 0))}</b><span>ستون انتخابی برای هر قرارداد</span></div>
  <div><b>${fa(D.views.reduce((n, v) => n + v.items.length, 0))}</b><span>جدول و نمودار تحلیلی</span></div>
  <div><b>${fa(SECTIONS.length)}</b><span>بخش اصلی</span></div>
</div>

<h2>۱. خلاصه در یک نگاه</h2>
<p>اگر فقط یک صفحه وقت داری، همین است. هر بخش، یک سؤال مشخص را جواب می‌دهد:</p>
<div class="cards">
${SECTIONS.map((s) => `<div class="card"><b>${esc(s[0])}</b><span class="q">${esc(s[1])}</span>
  <span class="w">${esc(s[2])}</span><span class="when">کِی: ${esc(s[3])}</span></div>`).join('')}
</div>

<h2 class="pg">۲. نقشهٔ مسیر کار</h2>
<p>ترتیبِ طبیعیِ کار در برنامه از بالا به پایین است: فرض‌ها را یک بار تنظیم می‌کنی، از رصد بازار شروع
می‌کنی، یکی از سه مسیر تحلیل را می‌روی، تصمیم می‌گیری (که <b>بیرون از برنامه</b> اتفاق می‌افتد)، و بعد
موقعیت را تا خروج دنبال می‌کنی.</p>
${MAP}
<p class="note">کادر نقطه‌چین زرد عمداً آنجاست: برنامه تصمیم نمی‌گیرد و سفارش نمی‌زند. عدد می‌دهد و می‌گوید
هر عدد از کجا آمده.</p>

<h2>۳. مسیرهای کاری نمونه</h2>
<div class="cards">
${FLOWS.map((f) => `<div class="card"><b>${esc(f[0])}</b><ol class="flow">${f[1].map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>`).join('')}
</div>

<h2 class="pg">۴. صفحهٔ رصد لحظه‌ای — قلب برنامه</h2>
<p>این صفحه هفت تب دارد. تب نخست <b>نقشه و زنجیره</b> است و بقیه تحلیل‌های تخصصی روی همان انتخاب.
نکتهٔ مهم: <b>نماد را فقط یک بار انتخاب می‌کنی</b> — روی نقشه — و همهٔ تب‌های دیگر از همان انتخاب
تغذیه می‌شوند.</p>

<h3>نقشهٔ بازار</h3>
<p class="note">هر خانه یک نماد پایه است. اندازه از سنجهٔ انتخابی می‌آید (ارزش کال، ارزش پوت، حجم، …) و
رنگ از جهت آخرین معامله. گزینهٔ «همه هم‌اندازه» اندازه را از داده جدا می‌کند تا نمادهای کم‌معامله هم دیده
و کلیک شوند — نقشهٔ وزنی «پول کجاست» را جواب می‌دهد و «چه چیزهایی هست» را اصلاً.</p>

<h3>زنجیرهٔ دوطرفه</h3>
<p class="note">کال و پوتِ هر قیمت اعمال روی یک ردیف — همان چیدمانی که هر تابلوی اختیار حرفه‌ای دارد،
چون سؤال معامله‌گر قرینه است: «روی این اعمال، کال گران‌تر است یا پوت؟». خانه‌های پررنگ «در سود»اند،
نوار زیر موقعیت باز سنگینی تعهد را نشان می‌دهد («دیوار»)، و خط‌چین جای قیمت جاری پایه است.
با کلیک روی هر سرستون مرتب می‌شود؛ چون هر ردیف دو مقدار دارد، سرستونِ سمت کال با کال مرتب می‌کند و
سمت پوت با پوت. «فقط کال» یا «فقط پوت» سمت دیگر را کاملاً حذف می‌کند، نه اینکه با «—» پر کند.</p>

<h3>${fa(Object.values(D.cols).reduce((n, l) => n + l.length, 0))} ستون، در ده دسته</h3>
<table><thead><tr><th>دسته</th><th>تعداد</th><th>ستون‌ها</th></tr></thead><tbody>${colRows}</tbody></table>

<h3>تب‌های تحلیلی</h3>
<table><thead><tr><th>تب</th><th>نما</th><th>فهرست</th></tr></thead><tbody>${viewRows}</tbody></table>
<p class="note">به‌علاوهٔ دو تب ادغام‌شده: <b>دیده‌بان زنجیره</b> (کل بازار اختیار در یک درخواست) و
<b>برترین موقعیت‌ها</b> (غربال روی کل کاتالوگ استراتژی).</p>

<h2 class="pg">۵. سود و زیان — چیزی که همهٔ تب‌های استراتژی می‌سازند</h2>
<p>هر تب استراتژی، برای هر ترکیبِ ممکن، همین نمودار را می‌سازد و از رویش سربه‌سر، بیشترین سود،
بیشترین زیان و بازده را بیرون می‌کشد. نمونهٔ زیر سادهٔ همه است: خرید یک کال با اعمال ۱۰۰ و پریمیوم ۸.</p>
${payoff}
<p class="note">زیر اعمال، تمام پریمیوم می‌سوزد (خط صاف). از اعمال به بالا، هر ریال حرکتِ پایه یک ریال به
موقعیت اضافه می‌کند، ولی تا <b>سربه‌سر = اعمال + پریمیوم</b> هنوز در زیانی. بالای سربه‌سر، سود بی‌سقف است.
برای پوت همه‌چیز آینه می‌شود و سربه‌سر «اعمال − پریمیوم».</p>

<h2>۶. ${fa(D.cat.length)} استراتژی، در ${fa(groups.length)} گروه</h2>
<p class="note">«پا» یعنی تعداد قراردادهای تشکیل‌دهنده. «پرداخت» یعنی برای باز کردن پول می‌دهی،
«دریافت» یعنی پول می‌گیری و در عوض تعهد و وجه تضمین داری.</p>
<table><thead><tr><th>استراتژی</th><th>دیدگاه</th><th>پا</th><th>جریان نقد</th><th>نکته</th></tr></thead>
<tbody>${catRows}</tbody></table>

<h2 class="pg">۷. قواعدی که برنامه زیرشان نمی‌زند</h2>
<p>این‌ها تصمیم‌های عمدی‌اند، نه محدودیت. اگر جایی عددی ندیدی، یکی از این‌ها دلیلش است:</p>
${RULES.map((r) => `<div class="rule"><b>${esc(r[0])}</b><span class="note">${esc(r[1])}</span></div>`).join('')}

<h2>۸. واژه‌نامه</h2>
<div class="gl">${GLOSSARY.map((g) => `<b>${esc(g[0])}</b><span class="note">${esc(g[1])}</span>`).join('')}</div>

<p class="foot">رصد استراتژی آپشن — نقشهٔ سایت · ساخته‌شده از روی کد مخزن · این سند راهنمای استفاده است و توصیهٔ معاملاتی نیست.</p>
</body></html>`;

const out = `${ROOT}docs/SITE-MAP.html`;
fs.writeFileSync(out, html);
console.log(`HTML → ${out} (${(html.length / 1024).toFixed(1)} KB)`);

if (process.argv.includes('--pdf')) {
  const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto(`file://${out}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.pdf({
    path: `${ROOT}docs/SITE-MAP.pdf`, format: 'A4', printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#94a3b8;text-align:center;font-family:DejaVu Sans"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  await browser.close();
  console.log(`PDF  → ${ROOT}docs/SITE-MAP.pdf`);
}
