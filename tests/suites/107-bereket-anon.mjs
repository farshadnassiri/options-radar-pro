// ۱۰۶. حالت ناشناس
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  aliasMap, anonContract, dayLabel, indexSeries, leakCheck, makeAlias, moneynessLabel, moneynessPct, reveal, sizeLabel,
} from '../../core/bereket-anon.mjs';
import { blankSession, closeSession } from '../../core/bereket-session.mjs';


// ═══════════════════ ۱۰۶. حالت ناشناس ═══════════════════
//
// ادعای این گروه: پنهان‌کردن نام کافی نیست. معامله‌گر فعالِ این بازار از
// سطح قیمت، شبکهٔ قیمت اعمال و اندازهٔ غیراستاندارد قرارداد هم نماد را
// می‌شناسد. اگر آن‌ها بمانند، حالت ناشناس تزئینی است.
group('۱۰۶. حالت ناشناس');
{
  // ——— نام مستعار ———
  check('نام مستعار در یک جلسه ثابت است',
    makeAlias('جلسه-۱', '17765240') === makeAlias('جلسه-۱', '17765240'));
  check('نام مستعار بین دو جلسه فرق می‌کند',
    makeAlias('جلسه-۱', '17765240') !== makeAlias('جلسه-۲', '17765240'));
  check('دو ابزار در یک جلسه دو نام می‌گیرند',
    makeAlias('ج', '111') !== makeAlias('ج', '222'));
  check('نام مستعار رقم لاتین ندارد', /^[^0-9]*$/.test(makeAlias('ج', '111')));
  check('نگاشت نام مستعار، تکراری نمی‌سازد', (() => {
    const map = aliasMap('ج', ['111', '222', '111']);
    return Object.keys(map).length === 2 && map['111'] === makeAlias('ج', '111');
  })());

  // ——— محور قیمت ———
  {
    const rows = [{ date: 1, close: 5200 }, { date: 2, close: 5460 }, { date: 3, close: 5044 }];
    const indexed = indexSeries(rows);
    check('سری از صد شاخص می‌شود', Math.abs(indexed.rows[0].close - 100) < 1e-9);
    check('شکل نمودار دست‌نخورده می‌ماند', (() => {
      const rawPct = (rows[1].close - rows[0].close) / rows[0].close;
      const idxPct = (indexed.rows[1].close - indexed.rows[0].close) / indexed.rows[0].close;
      return Math.abs(rawPct - idxPct) < 1e-12;
    })());
    check('قیمت واقعی برای گزارش پایانی نگه داشته می‌شود',
      indexed.rows[0].closeRaw === 5200 && indexed.base === 5200);
    check('سری خالی، پایه نمی‌سازد', Number.isNaN(indexSeries([]).base));
  }

  // ——— قیمت اعمال ———
  check('فاصله از پایه به‌جای قیمت اعمال می‌نشیند',
    Math.abs(moneynessPct(11_000, 10_000) - 10) < 1e-9
    && Math.abs(moneynessPct(9_000, 10_000) + 10) < 1e-9);
  check('برچسب فاصله، باارزش و بی‌ارزش را هم می‌گوید',
    moneynessLabel(11_000, 10_000, 'call').includes('بی‌ارزش')
    && moneynessLabel(9_000, 10_000, 'call').includes('باارزش')
    && moneynessLabel(11_000, 10_000, 'put').includes('باارزش'));
  check('برچسب فاصله رقم لاتین و نقطهٔ لاتین ندارد',
    /^[^0-9.]*$/.test(moneynessLabel(11_000, 10_000, 'call')));
  check('بدون قیمت، فاصله ساخته نمی‌شود',
    moneynessLabel(0, 10_000) === '—' && Number.isNaN(moneynessPct(11_000, 0)));

  // ——— اندازهٔ قرارداد ———
  check('اندازهٔ استاندارد و تعدیل‌شده فقط برچسب می‌گیرند، نه عدد',
    sizeLabel(1000) === 'استاندارد' && sizeLabel(1187) === 'تعدیل‌شده'
    && !/\d/.test(sizeLabel(1187)));
  check('اندازهٔ نامعتبر «نامعلوم» است', sizeLabel(0) === 'نامعلوم' && sizeLabel(NaN) === 'نامعلوم');

  // ——— تاریخ ———
  check('تاریخ به «روز n جلسه» تبدیل می‌شود',
    dayLabel(20260521, 20260519, [20260519, 20260520, 20260521]) === 'روز ۳ جلسه');
  check('روز شروع، روز یک است',
    dayLabel(20260519, 20260519, [20260519, 20260520]) === 'روز ۱ جلسه');
  check('برچسب روز، تاریخ واقعی را جایی نمی‌آورد',
    !dayLabel(20260521, 20260519, [20260519, 20260520, 20260521]).includes('۲۰۲۶'));

  // ——— نگهبان نشت ———
  {
    const secrets = { names: ['خودرو', 'شستا'], dates: [20260521] };
    check('نشت نام گرفته می‌شود', leakCheck('روند نماد خودرو صعودی بود', secrets).clean === false);
    check('نشت تاریخ فشرده گرفته می‌شود', leakCheck('در 20260521 بسته شد', secrets).clean === false);
    check('نشت تاریخ با جداکننده هم گرفته می‌شود',
      leakCheck('در 2026/05/21 بسته شد', secrets).clean === false
      && leakCheck('در 2026-05-21 بسته شد', secrets).clean === false);
    check('متن پاک، پاک اعلام می‌شود',
      leakCheck('نماد الف-۷ در روز ۳ جلسه صعودی بود', secrets).clean === true);
    check('نشت، نوع و مقدارش را می‌گوید', (() => {
      const out = leakCheck('خودرو در 20260521', secrets);
      return out.found.some((f) => f.kind === 'name') && out.found.some((f) => f.kind === 'date');
    })());
    check('نام تک‌حرفی نگهبان را بی‌جهت شلیک نمی‌کند',
      leakCheck('نماد الف-۷', { names: ['خ'], dates: [] }).clean === true);
  }

  // ——— دید قرارداد ———
  {
    const contract = {
      ins: '17765240', kind: 'call', strike: 11_000, size: 1187, daysToExpiry: 42,
      ivPct: 44.2, ivPercentile: 78, openInterest: 12_000, volume: 3_400, value: 9.9e9, spreadPct: 3.1,
    };
    const aliases = aliasMap('ج', ['17765240']);
    const view = anonContract(contract, { spot: 10_000, aliases, on: true });
    check('قیمت اعمال در دید ناشناس نیست', !('strike' in view));
    check('اندازهٔ عددی قرارداد در دید ناشناس نیست',
      !('size' in view) && view.sizeLabel === 'تعدیل‌شده');
    check('تصمیم‌سازها می‌مانند',
      view.ivPct === 44.2 && view.ivPercentile === 78 && view.openInterest === 12_000
      && view.volume === 3_400 && view.spreadPct === 3.1 && view.daysToExpiry === 42);
    check('فهرست آنچه پنهان شده به کاربر گفته می‌شود',
      view.hidden.includes('قیمت اعمال') && view.hidden.includes('نام نماد'));
    check('خاموش‌بودن حالت ناشناس، قرارداد را دست‌نخورده می‌گذارد', (() => {
      const raw = anonContract(contract, { spot: 10_000, aliases, on: false });
      return raw.strike === 11_000 && raw.size === 1187 && raw.anonymous === false;
    })());
    check('دید ناشناس هیچ نشتی ندارد',
      leakCheck(JSON.stringify(view), { names: [], dates: [] }).clean === true
      && !JSON.stringify(view).includes('11000'));
  }

  // ——— افشا ———
  {
    const start = { date: 20260519, second: 9 * 3600 };
    let s = blankSession({ id: 'ج', start });
    const aliases = aliasMap('ج', ['17765240']);
    check('تا جلسه باز است، افشایی در کار نیست',
      reveal({ session: s, aliases, names: { '17765240': 'خودرو' } }).ok === false);
    s = closeSession(s).session;
    const out = reveal({ session: s, aliases, names: { '17765240': 'خودرو' } });
    check('پس از بستن جلسه، نام و تاریخ فاش می‌شوند',
      out.ok === true && out.startDate === 20260519 && out.symbols[0].name === 'خودرو');
    check('افشا، نام مستعار را هم کنار نام واقعی می‌گذارد',
      out.symbols[0].alias === aliases['17765240']);
    check('جلسهٔ رهاشده هم قابل افشاست',
      reveal({ session: closeSession(blankSession({ id: 'x', start }), { abandoned: true }).session, aliases: {} }).ok === true);
  }
}
