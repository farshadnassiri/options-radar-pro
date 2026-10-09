// ۳۴۲. مبنای پریمیوم و «همهٔ سررسیدها» در سربه‌سرِ «تصویر شفاف» (۱۴۰۵/۰۷/۱۷)
//
// پرسش صاحب پروژه: «نحوهٔ محاسبهٔ سربه‌سر وزنی در نگاه باز با تصویر شفاف فرق
// دارد؟» فرمول یکی بود، ورودی‌ها نه. دو پل ساخته شد: انتخابِ «مبنای پریمیوم:
// آخرین / پایانی» و ردیفِ «همهٔ سررسیدها» در سطح نماد، هم‌ارزِ شاخصِ کلِ نگاه
// باز. همراهش: دستگیرهٔ «زمان به‌روزرسانی» و فرمِ «فرض‌های مدل» حذف شدند.

import { check, group, near, readSrc } from '../harness.mjs';
import { withPremium, breakevenPicture, allExpiriesBreakeven, premiumBasis } from '../../core/clear-picture.mjs';
import { analyzeDailyOpenView } from '../../core/open-view.mjs';

const c = (o) => ({ ins: o.ins, name: o.ins, kind: o.kind, uaIns: o.ua || 'A', uaName: 'A', endDate: o.end, days: o.days, strike: o.strike, spot: 1000, last: o.last, close: o.close, value: o.value, volume: 1, trades: 1 });
const rows = [
  c({ ins: 'a', kind: 'call', end: 1, days: 10, strike: 900, last: 120, close: 110, value: 300 }),
  c({ ins: 'b', kind: 'call', end: 2, days: 40, strike: 1100, last: 20, close: 25, value: 100 }),
  c({ ins: 'p', kind: 'put', end: 1, days: 10, strike: 1100, last: 130, close: 140, value: 300 }),
];

group('۳۴۲. مبنای پریمیوم');
{
  check('پیش‌فرض «آخرین»؛ ناشناخته هم آخرین', premiumBasis() === 'last' && premiumBasis('x') === 'last' && premiumBasis('close') === 'close');
  check('«پایانی» پریمیوم را از پایانی می‌گیرد؛ بی پایانی، نامعلوم', withPremium(rows, 'close')[0].last === 110 && Number.isNaN(withPremium([{ ...rows[0], close: 0 }], 'close')[0].last));
  check('«آخرین» ردیف‌ها را دست نمی‌زند', withPremium(rows, 'last') === rows);
  const last = breakevenPicture(rows, { premium: 'last' }).expiries.find((e) => e.endDate === 1);
  const close = breakevenPicture(rows, { premium: 'close' }).expiries.find((e) => e.endDate === 1);
  check('سربه‌سرِ وزنی با مبنا عوض می‌شود', near(last.callBreakeven, 1020) && near(close.callBreakeven, 1010) && near(close.putBreakeven, 960));
}

group('۳۴۲. همهٔ سررسیدها');
{
  const all = allExpiriesBreakeven(rows);
  check('میانگینِ وزنیِ همهٔ سررسیدهای نماد، کال و پوت جدا', near(all.callBreakeven, (1020 * 300 + 1120 * 100) / 400) && near(all.putBreakeven, 970) && all.expiries === 2 && all.all);
  check('با مبنای پایانی هم', near(allExpiriesBreakeven(rows, { premium: 'close' }).callBreakeven, (1010 * 300 + 1125 * 100) / 400));
  check('دو نماد با هم میانگین نمی‌شوند', allExpiriesBreakeven([...rows, { ...rows[0], ins: 'z', uaIns: 'B' }]) === null);

  // همان عددِ شاخصِ کلِ «نگاه باز» (وزن ارزش، مبنای پایانی) برای یک روز.
  const date = 20261001;
  const contracts = rows.map((r) => ({ ins: r.ins, name: r.ins, kind: r.kind, strike: r.strike, expiry: 20261101 + r.end, size: 1000 }));
  const seriesByIns = {
    A: [{ date, close: 1000, last: 1000, first: 1000, value: 1 }],
    ...Object.fromEntries(rows.map((r) => [r.ins, [{ date, close: r.close, last: r.last, first: r.close, value: r.value }]])),
  };
  const ov = analyzeDailyOpenView({ ua: { ins: 'A' }, contracts, seriesByIns, from: date, to: date, basis: 'CLOSE' });
  const ours = allExpiriesBreakeven(rows, { premium: 'close' });
  check('هم‌ارزِ شاخصِ کلِ «نگاه باز» با همان مبنا و وزن', near(ov.rows[0].callBreakeven, ours.callBreakeven) && near(ov.rows[0].putBreakeven, ours.putBreakeven),
    `${ov.rows[0]?.callBreakeven} / ${ours.callBreakeven}`);
}

group('۳۴۲. سیم‌کشی');
{
  const view = readSrc('../ui/clear-picture-view.mjs');
  check('انتخاب مبنا کنار وزن، ذخیره‌شده، و روی کاشی و نردبان و قرارداد', view.includes('<select data-cp-be-premium>') && view.includes("store.set('options-radar:clear-picture-be-premium', bePremium);")
    && view.includes('breakevenLadder(withPremium(rows, bePremium), expiry)') && view.includes('const pricedContract = contract ? withPremium([contract], bePremium)[0] : null;')
    && view.includes('const cBe = c ? withPremium([c], bePremium)[0] : null;'));
  check('«همهٔ سررسیدها» فقط در سطح نماد، با توضیح، و در جدول اول', view.includes("const all = scope.level === 'underlying' ? allExpiriesBreakeven(rows,")
    && view.includes('(مثل شاخص کلِ «نگاه باز»)') && view.includes("{ ...all, title: 'همهٔ سررسیدها (با هم)', days: NaN }"));
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('دستگیرهٔ «زمان به‌روزرسانی» نیست، آهنگ از انتخابِ ذخیره‌شده', !dash.includes('id="dd-interval"') && !dash.includes('countdown') && dash.includes('timer = setTimeout(refresh, intervalSec * 1000);'));
  const ov = readSrc('../ui/tabs/open-view.mjs');
  check('«نگاه باز» فرمِ فرض‌های مدل ندارد و IV را با تنظیمات مرکزی می‌سازد', !ov.includes('open-view-model-settings') && !ov.includes('ov-apply-iv')
    && ov.includes('const s = state.settings || {};') && !readSrc('../ui/style.css').includes('.open-view-model-'));
}
