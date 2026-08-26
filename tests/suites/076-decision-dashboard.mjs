// ۷۵. تابلوی اختیارهای پرمعامله
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import {
  BOARD_METRICS, activeOptionsBoard, contractBreakeven, moneynessDistribution,
} from '../../core/decision-dashboard.mjs';
import { fmt as uiFmt } from '../../ui/fmt.mjs';



// ═════════ ۷۵. تابلوی اختیارهای پرمعامله ═════════
//
// خواسته کاربر: بخشی از داشبورد که اختیارهای پرمعامله را بدهد — سنجه‌اش را
// خود کاربر عوض کند (حجم، ارزش، …) — و برای هر سررسید میانگین وزنی سربه‌سر
// و فاصله‌اش از قیمت جاری را بدهد، با تفکیک کال، پوت و هر دو.
group('۷۵. تابلوی اختیارهای پرمعامله');
{
  const board75 = (rows, opt) => activeOptionsBoard(rows, opt);
  const c = (over) => ({ ins: '1', name: 'ض', kind: 'call', uaIns: '9', uaName: 'نمونه',
    endDate: 20260101, days: 30, strike: 1000, last: 100, spot: 1000,
    value: 1000, volume: 10, trades: 2, oi: 50, ivPct: 40, ...over });

  // ——— سربه‌سر هر قرارداد ———
  check('سربه‌سر کال، اعمال به‌علاوه پریمیوم است و پوت، اعمال منهای آن',
    contractBreakeven(c({ strike: 1000, last: 120 })) === 1120
    && contractBreakeven(c({ kind: 'put', strike: 1000, last: 120 })) === 880);
  // بدون پریمیوم اجرایی، سربه‌سر ساخته نمی‌شود (قاعده ۲-۴)
  check('بی‌پریمیوم، سربه‌سر ساخته نمی‌شود نه اینکه برابر اعمال گرفته شود',
    Number.isNaN(contractBreakeven(c({ last: 0 }))));

  // ——— فاصله، از دید همان سمت ———
  const sided = board75([c({ last: 100 }), c({ ins: '2', kind: 'put', last: 100 })]).rows;
  const callRow = sided.find((row) => row.kind === 'call'), putRow = sided.find((row) => row.kind === 'put');
  check('فاصله تا سربه‌سر از دید همان سمت خوانده می‌شود، پس هر دو مثبت‌اند',
    near(callRow.breakevenGapPct, 10) && near(putRow.breakevenGapPct, 10),
    `${uiFmt.pct(callRow.breakevenGapPct)} / ${uiFmt.pct(putRow.breakevenGapPct)}`);

  // ——— سنجه انتخابی، هم رتبه می‌دهد هم وزن ———
  const many = [
    c({ ins: 'a', strike: 1000, last: 100, value: 100, volume: 900 }),
    c({ ins: 'b', strike: 1200, last: 100, value: 900, volume: 100 }),
  ];
  check('رتبه‌بندی با سنجه انتخابی عوض می‌شود',
    board75(many, { metric: 'value' }).rows[0].ins === 'b'
    && board75(many, { metric: 'volume' }).rows[0].ins === 'a');
  // وزن شاخص هم باید همان سنجه باشد، وگرنه عددی که کاربر می‌بیند جواب
  // سؤالی نیست که پرسیده. سربه‌سر a برابر ۱۱۰۰ و b برابر ۱۳۰۰ است، پس:
  //   وزن ارزش  (۱۱۰۰×۱۰۰ + ۱۳۰۰×۹۰۰) ÷ ۱۰۰۰ = ۱۲۸۰
  //   وزن حجم   (۱۱۰۰×۹۰۰ + ۱۳۰۰×۱۰۰) ÷ ۱۰۰۰ = ۱۱۲۰
  check('وزن شاخص سربه‌سر هم همان سنجه است، نه همیشه ارزش',
    near(board75(many, { metric: 'value' }).expiries[0].callBreakeven, 1280)
    && near(board75(many, { metric: 'volume' }).expiries[0].callBreakeven, 1120),
    `${board75(many, { metric: 'volume' }).expiries[0].callBreakeven}`);
  check('سنجه ناشناخته به ارزش برمی‌گردد و نمی‌ترکد',
    board75(many, { metric: 'چیزی-که-نیست' }).metric === 'value' && BOARD_METRICS.includes('oi'));

  // ——— تفکیک سمت ———
  const mixed = [c({ ins: 'a' }), c({ ins: 'b', kind: 'put' })];
  check('تفکیک کال و پوت و هر دو، ردیف‌ها را درست فیلتر می‌کند',
    board75(mixed, { side: 'both' }).rows.length === 2
    && board75(mixed, { side: 'call' }).rows.every((row) => row.kind === 'call')
    && board75(mixed, { side: 'put' }).rows.every((row) => row.kind === 'put'));
  // در حالت «هر دو» هم شاخص هر سمت جدا می‌ماند: میانگین سربه‌سر کال و پوت
  // با هم، عددی است که هیچ قراردادی ندارد.
  const both = board75(mixed, { side: 'both' }).expiries[0];
  check('در حالت هر دو، شاخص هر سمت جدا می‌ماند',
    Number.isFinite(both.callBreakeven) && Number.isFinite(both.putBreakeven)
    && both.callBreakeven !== both.putBreakeven);
  check('باند سربه‌سر، فاصله پوت تا کال است',
    near(both.band, both.callBreakeven - both.putBreakeven)
    && near(both.bandPct, (both.band / 1000) * 100));

  // ——— گروه‌بندی سررسید ———
  // دو پایه با دو سطح قیمت کاملاً متفاوت نباید در یک شاخص سربه‌سر جمع شوند.
  const twoUa = [c({ ins: 'a', uaIns: '9', spot: 1000, strike: 1000, last: 100 }),
    c({ ins: 'b', uaIns: '8', uaName: 'دیگری', spot: 50000, strike: 50000, last: 5000 })];
  check('گروه سررسید با کلید «پایه:سررسید» ساخته می‌شود، نه فقط سررسید',
    board75(twoUa).expiries.length === 2);

  // ——— هیستوگرام فاصله از قیمت جاری ———
  const dist = moneynessDistribution([
    c({ strike: 1000, spot: 1000, value: 100 }),
    c({ kind: 'put', strike: 1120, spot: 1000, value: 300 }),
    c({ strike: 700, spot: 1000, value: 50 }),
  ], 'value');
  const atm = dist.find((b) => b.from === 0 && b.to === 5);
  const far = dist.find((b) => b.from === 10 && b.to === 20);
  check('توزیع، هر قرارداد را در سطل فاصله‌اش می‌گذارد و کال و پوت را جدا نگه می‌دارد',
    atm.call === 100 && atm.put === 0 && far.put === 300 && far.call === 0);
  check('سطل‌های بیرون از دامنه هم جا دارند',
    dist[0].total === 50 && dist.reduce((sum, b) => sum + b.total, 0) === 450);

  // ——— رابط ———
  const ui75 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const boardViews75 = (/const boardViews = \[((?:.|\n)*?)\n\];/.exec(ui75)?.[1] || '').match(/^\s*\['/gm) || [];
  check('حالت تابلو نماهای منحصر به خودش را دارد، نه رونوشت بیست‌تایی',
    boardViews75.length === 8 && ui75.includes("id: 'board'") && ui75.includes('board: true'),
    `${boardViews75.length} نما`);
  check('سنجه و تفکیک سمت، کنترل کاربر دارند و ذخیره می‌شوند',
    ui75.includes('id="dd-board-metric"') && ui75.includes('data-board-side')
    && ui75.includes("localStorage.setItem('options-radar:board-metric'")
    && ui75.includes("localStorage.setItem('options-radar:board-side'"));
  // شکل نمودار باید با سؤالش بخواند: هیستوگرام و پراکنش و میله انباشته،
  // نه اینکه همه‌چیز میله رتبه‌ای شود.
  check('نمودارهای تازه از شکل‌های متفاوت‌اند، نه همه میله رتبه‌ای',
    ui75.includes('function stackedBars(') && ui75.includes('function scatterChart(')
    && ui75.includes('moneynessDistribution(') && ui75.includes("'board-smile'"));
  check('جدول تابلو و جدول سررسید، ستون‌های خودشان را دارند',
    /const COLS_BOARD = \[/.test(ui75) && /const COLS_BOARD_EXPIRY = \[/.test(ui75)
    && ui75.includes("col('breakevenGapPct'") && ui75.includes("col('callGapPct'"));
  check('عوض‌شدن سنجه، لنگر مرتب‌سازی تابلو را هم تازه می‌کند',
    ui75.includes("if (key.startsWith('board:')) entry.table.__seeded = false"));
}
