// ۳۴۰. تابلوی آخرین جلسه، سربه‌سر و زیرتب‌های «تصویر شفاف»، کندلِ پرارزش‌ها (۱۴۰۵/۰۷/۱۷)
//
// ۱. «اگر قراردادی در آخرین روز کاری سررسید شده و امروز تعطیل باشد، در
//    محاسبات لحاظ می‌شود؟» حالا تابلوی جلسه ذخیره و بیرون از جلسه بار می‌شود.
// ۲. سربه‌سرها «با منطق سایر قسمت‌های برنامه» در «تصویر شفاف».
// ۳. زیرتب برای هر بخش و ۵. کال/پوت/هر دو در همه‌جا.
// ۶. «رتبه و صدک تلاطم» زیرتبِ «نوسان ضمنی».
// ۷ و ۸. پرارزش‌ترین‌های بازار در نمودار مادر و گزینشگرِ حرفه‌ای‌تر.

import { check, group, near, readSrc } from '../harness.mjs';
import { sessionBoardDue, sessionBoardRecord, seedDay, validSessionBoard, expiringRows, expiringCount, SESSION_BOARD_EVERY_MS } from '../../core/session-board.mjs';
import { breakevenPicture, breakevenLadder, bySide, pictureTotals, pictureSample, pictureSeries } from '../../core/clear-picture.mjs';
import { contractBreakeven, activeOptionsBoard } from '../../core/decision-dashboard.mjs';
import { topCandlePool, expiryBook, filterCandles } from '../../core/contract-candles.mjs';

group('۳۴۰. تابلوی آخرین جلسه');
{
  const now = 1_000_000_000;
  check('در جلسه هر چند دقیقه ذخیره می‌شود، نه هر دور', sessionBoardDue({ phase: 'open', today: 1, now, last: { day: 1, at: now - 1000 } }) === false
    && sessionBoardDue({ phase: 'open', today: 1, now, last: { day: 1, at: now - SESSION_BOARD_EVERY_MS } }) === true);
  check('پس از بستن هر دور (تا عکس نهایی ثابت شود) و روزِ تازه بی‌درنگ', sessionBoardDue({ phase: 'after', today: 1, now, last: { day: 1, at: now } })
    && sessionBoardDue({ phase: 'open', today: 2, now, last: { day: 1, at: now } }));
  check('بیرون از جلسه چیزی ذخیره نمی‌شود', !sessionBoardDue({ phase: 'holiday', today: 2, now }) && !sessionBoardDue({ phase: 'before', today: 2, now }));
  check('تعطیل: تازه‌ترین روزِ پیش از امروز بار می‌شود', seedDay({ phase: 'holiday', today: 20261009, days: [20261005, 20261007, 20261006] }) === 20261007);
  check('پس از بستن، امروز هم پذیرفته است؛ در جلسهٔ باز هیچ', seedDay({ phase: 'after', today: 20261007, days: [20261006, 20261007] }) === 20261007
    && seedDay({ phase: 'before', today: 20261007, days: [20261007] }) === 0 && seedDay({ phase: 'open', today: 20261009, days: [20261007] }) === 0);
  const rows = [
    { insCode_C: 'C1', insCode_P: 'P1', remainedDay: 0, expiryGregorian: 20261007 },
    { insCode_C: 'C2', insCode_P: 'P2', remainedDay: 28, expiryGregorian: 20261104 },
    { insCode_C: 'C3', remainedDay: '', endDate: 20261007 },
  ];
  check('قراردادِ هم‌روزِ سررسید (روزِ مانده صفر یا سررسید ≤ روزِ جلسه)', expiringRows(rows, 20261007).length === 2 && expiringCount(rows, 20261007) === 3);
  const rec = sessionBoardRecord({ day: 20261007, at: 5, phase: 'after', final: true, rows });
  check('پروندهٔ ذخیره‌شده معتبر است؛ خالی یا بی‌روز نه', validSessionBoard(rec) && !validSessionBoard({ ...rec, rows: [] }) && !validSessionBoard({ ...rec, day: 0 }) && !validSessionBoard(null));

  const server = readSrc('../server/server.mjs');
  check('سرور در هر دور ذخیره و پیش از نخستین دور بار می‌کند', server.includes("saveSessionBoard(rows, gate.phase, today).catch(")
    && server.includes("seedWatchFromDisk().catch((e) => logErr('بار کردن تابلوی جلسه', e)).finally(() => watchLoop());"));
  check('تابلوی بارشده دورِ بعد کامل پخش می‌شود، عکسِ کهنه ذخیره نمی‌شود', server.includes('const first = watch.rows.length === 0 || Boolean(watch.seeded);')
    && server.includes('if (watch.rowsStale) return;'));
  check('پاسخ داشبورد شمارِ سررسیدشده‌های همان جلسه را می‌گوید', server.includes('expiring: session.current ? 0 : expiringCount(sourceRows, session.date),'));
  check('رابط آن را در خط وضعیت و «تصویر شفاف» می‌نویسد', readSrc('../ui/tabs/live-market-dashboard.mjs').includes('قرارداد که در همان جلسه سررسید شد')
    && readSrc('../ui/clear-picture-view.mjs').includes('قراردادِ سررسیدشده در همان جلسه هم در جمع هست'));
}

const c = (o) => ({ ins: o.ins, name: o.ins, kind: o.kind, uaIns: 'A', uaName: 'A', endDate: 20261101, days: 20, strike: o.strike, spot: 1000, last: o.last, tradeLast: o.last, yday: o.yday ?? o.last, value: o.value, volume: o.value ? 1 : 0, trades: o.value ? 1 : 0, oi: 10 });
const chain = [
  c({ ins: 'c900', kind: 'call', strike: 900, last: 120, value: 300 }),
  c({ ins: 'c1100', kind: 'call', strike: 1100, last: 20, value: 100 }),
  c({ ins: 'p900', kind: 'put', strike: 900, last: 10, value: 100, yday: 12 }),
  c({ ins: 'p1100', kind: 'put', strike: 1100, last: 130, value: 300, yday: 120 }),
];

group('۳۴۰. سربه‌سر — همان منطقِ بقیهٔ برنامه');
{
  const be = breakevenPicture(chain, { metric: 'value' });
  const ref = activeOptionsBoard(chain, { metric: 'value', limit: 10 }).expiries[0];
  check('سربه‌سرِ وزنی همان `activeOptionsBoard` است', near(be.expiries[0].callBreakeven, ref.callBreakeven) && near(be.expiries[0].putBreakeven, ref.putBreakeven));
  check('کال: (۱۰۲۰×۳۰۰ + ۱۱۲۰×۱۰۰)/۴۰۰ = ۱۰۴۵؛ پوت: (۸۹۰×۱۰۰ + ۹۷۰×۳۰۰)/۴۰۰ = ۹۵۰',
    near(be.expiries[0].callBreakeven, 1045) && near(be.expiries[0].putBreakeven, 950));
  check('سربه‌سرِ هر قرارداد همان `contractBreakeven`', be.contracts.every((row) => near(row.breakeven, contractBreakeven(row))));
  check('فیلترِ سمت: فقط کال، سربه‌سر پوت ندارد', Number.isNaN(breakevenPicture(chain, { side: 'call' }).expiries[0].putBreakeven)
    && breakevenPicture(chain, { side: 'call' }).contracts.every((row) => row.kind === 'call'));
  const ladder = breakevenLadder(chain, be.expiries[0]);
  check('نردبان: هر اعمال کال و پوتش کنار هم', ladder.length === 2 && ladder[0].strike === 900 && ladder[0].callBreakeven === 1020 && ladder[0].putBreakeven === 890);
  check('فاصلهٔ سربه‌سرِ وزنی از هر اعمال و درصدش', near(ladder[0].wCallFromStrike, 145) && near(ladder[0].wCallFromStrikePct, (1045 / 900 - 1) * 100)
    && near(ladder[1].wPutFromStrike, -150) && near(ladder[1].wPutFromStrikePct, (950 / 1100 - 1) * 100));
  check('بی سربه‌سرِ وزنی، فاصله نامعلوم است نه صفر', Number.isNaN(breakevenLadder(chain, null)[0].wCallFromStrike));
}

group('۳۴۰. کال، پوت یا هر دو');
{
  check('فیلترِ سمت', bySide(chain, 'put').length === 2 && bySide(chain, 'both').length === 4 && bySide(chain, 'x').length === 4);
  const t = pictureTotals(chain);
  check('جهتِ هر سمت جدا شمرده می‌شود', t.callFlat === 2 && t.putPositive === 1 && t.putNegative === 1 && t.positive === 1 && t.negative === 1);
  const series = pictureSeries([pictureSample(chain, 32400)], 'm')[0];
  check('مسیر روز درصدِ هر سمت را دارد', near(series.putPositivePct, 50) && near(series.callPositivePct, 0) && near(series.positivePct, 25));
  check('نمونهٔ قدیمیِ بی‌تفکیک نامعلوم می‌ماند، نه صفر', Number.isNaN(pictureSeries([{ t: 1, s: { m: [1, 1, 0, 2, 5, 5, 2, 2] } }], 'm')[0].callPositivePct));
}

group('۳۴۰. سیم‌کشی «تصویر شفاف»');
{
  const view = readSrc('../ui/clear-picture-view.mjs');
  check('شش زیرتب، یکی سربه‌سر', view.includes("['overview', 'نمای کلی'], ['intraday', 'در طول روز'], ['parts', 'سهم اجزا'],")
    && view.includes("['leaders', 'ترین‌ها'], ['breakeven', 'سربه‌سر'], ['spread', 'تمرکز و توزیع'],"));
  check('سمت روی ردیف‌های همهٔ بخش‌ها اعمال می‌شود و ذخیره می‌شود', view.includes('const rows = bySide(all, side);')
    && view.includes("store.set('options-radar:clear-picture-side', side);"));
  check('کاشی‌ها عدد و واحد را جدا و شکستنی می‌نویسند', view.includes('<p><strong>${value}</strong>${unit ?')
    && readSrc('../ui/style.css').includes('.cp-tile strong { color: var(--ink); font-size: var(--fs-2xl); font-weight: 900; line-height: 1.25; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }'));
  check('سررسید: خط‌کشِ قیمت و نردبانِ اعمال؛ کل بازار و نماد: جدولِ وزنی هر سررسید', view.includes('export function priceRuler(')
    && view.includes("tableIn('be-table', `be-ladder-${side}`, ladderCols(side)") && view.includes("tableIn('be-table', `be-expiries-${side}`, beExpiryCols(side)"));
}

group('۳۴۰. کندل: پرارزش‌ترین‌های بازار');
{
  const rows = [
    { ins: 'a', kind: 'call', uaIns: 'U1', endDate: 1, days: 5, value: 50, volume: 9, trades: 1 },
    { ins: 'b', kind: 'put', uaIns: 'U2', endDate: 2, days: 40, value: 90, volume: 1, trades: 1 },
    { ins: 'c', kind: 'call', uaIns: 'U2', endDate: 2, days: 40, value: 70, volume: 5, trades: 1 },
    { ins: 'd', kind: 'call', uaIns: 'U3', endDate: 1, days: 5, value: NaN, volume: 3, trades: 1 },
    { ins: 'e', kind: 'call', uaIns: 'U3', endDate: 1, days: 5, value: 10, volume: 0, trades: 0 },
  ];
  check('N برترِ کل بازار با سنجهٔ انتخابی', topCandlePool(rows, { n: 2 }).map((r) => r.ins).join() === 'b,c'
    && topCandlePool(rows, { n: 2, rankBy: 'volume' }).map((r) => r.ins).join() === 'a,c');
  check('بی عدد در آن سنجه رتبه نمی‌گیرد؛ نوع اعمال می‌شود', !topCandlePool(rows, { n: 9 }).some((r) => r.ins === 'd')
    && topCandlePool(rows, { n: 9, side: 'put' }).map((r) => r.ins).join() === 'b');
  check('منبعِ «top» گزینشِ نماد و سررسید را کنار می‌گذارد و بی‌معامله را نه می‌آورد', filterCandles(rows, { source: 'top', topN: 5, underlyings: ['U1'] }).map((r) => r.ins).join() === 'b,c,a');
  const book = expiryBook(rows);
  check('دفتر سررسید: هر تاریخ با روز، ارزش، قرارداد و نماد؛ و هر نماد جدا', book.dates.length === 2 && book.dates[0].endDate === '1' && book.dates[0].uas === 2
    && book.dates[1].value === 160 && book.byUa.get('U2')[0].contracts === 2 && book.dates[0].traded === 2);

  const view = readSrc('../ui/contract-candles-view.mjs');
  check('دو منبع گزینش و میانبرهای N', view.includes('data-ccv-source="pick"') && view.includes('data-ccv-source="top"') && view.includes('const TOP_QUICK = [10, 20, 30, 50, 100];'));
  check('گزینشگر: فهرستِ نماد با وزن، سررسید با روز و ارزش، برچسبِ ✕ و جمع‌بندی', view.includes('class="ccv-ua-row"') && view.includes('class="ccv-exp-pill"')
    && view.includes('data-ccv-clear-all') && view.includes('قرارداد معامله‌شده</p>'));
  check('شکستِ دریافتِ کمینه/بیشینه به حلقهٔ بی‌وقفهٔ درخواست تبدیل نمی‌شود', view.includes("for (const id of stale) if (staleInfoIds([id], infoCache, tried, INFO_TTL_MS).length) infoCache.set(id, { at: tried, info: infoCache.get(id)?.info || null });"));
}
