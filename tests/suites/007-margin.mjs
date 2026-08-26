// ۶. مخرج بازده
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { capitalBase } from '../../core/margin.mjs';


group('۶. مخرج بازده');
{
  const size = 1000;
  const debit = capitalBase({ legs: [{ kind: 'call' }], netCash: -7000, marginNet: 0, maxLoss: 7000 });
  check('بدهکار → مخرج، بدهکار خالص', debit.kind === 'DEBIT' && debit.value === 7000);

  const credit = capitalBase({ legs: [{ kind: 'call' }], netCash: 4000, marginNet: 2000, maxLoss: 6000 });
  check('بستانکار → مخرج، بیشینه وجه تضمین و بیشترین زیان', credit.value === 6000, credit.label);

  const credit2 = capitalBase({ legs: [{ kind: 'call' }], netCash: 4000, marginNet: 9000, maxLoss: 6000 });
  check('اگر وجه تضمین بزرگ‌تر باشد، همان مخرج است', credit2.value === 9000, credit2.label);

  const stock = capitalBase({ legs: [{ kind: 'underlying' }], netCash: -950000, marginNet: 0, maxLoss: 950000 });
  check('دارای سهم → مخرج، بهای سهم منهای پریمیوم', stock.kind === 'STOCK_NET' && stock.value === 950000);

  // ——— بدهکارِ دارای فروشِ برهنه ———
  //
  // گزارش آزمون واقعی: یک نسبت‌اسپرد پوت با بدهکار خالصِ ۵۵۷ ریال، وجه
  // تضمین ۱۳٬۶۴۲٬۰۰۰ و بیشترین زیانِ ۳۸٬۰۶۵٬۵۵۷، بازده ماهانهٔ ۳۳۱٬۹۰۵٪
  // نشان می‌داد و صدر جدول می‌نشست.
  //
  // ریشه: سمت بدهکار فقط پریمیوم پرداختی را می‌شمرد، انگار «بدهکار» یعنی
  // «بی‌تعهد». با ۵۵۷ ریال نمی‌شود موقعیتی را باز کرد که کارگزار برایش
  // ۱۳٫۶ میلیون بلوکه می‌کند.
  const naked = capitalBase({ legs: [{ kind: 'put' }], netCash: -2000, marginNet: 19004500, maxLoss: 90147000 });
  check('بدهکارِ دارای فروش برهنه، پول بلوکه‌شده را هم می‌شمرد',
    naked.kind === 'DEBIT_BLOCKED' && naked.value === 90147000, naked.label);
  check('و بازده را از عددِ نجومی به عدد واقعی برمی‌گرداند',
    (5000 / naked.value) * 100 < (5000 / 2000) * 100 / 1000);
  // وقتی وجه تضمین از بیشترین زیان بزرگ‌تر است، خودش لنگر می‌شود
  const nakedBigMargin = capitalBase({ legs: [{ kind: 'put' }], netCash: -2000, marginNet: 40000, maxLoss: 30000 });
  check('اگر وجه تضمین از بیشترین زیان بزرگ‌تر باشد، همان مخرج است',
    nakedBigMargin.value === 40000, nakedBigMargin.label);
  // زیان نامحدود عدد نمی‌سازد؛ وجه تضمین تنها لنگر واقعی است
  const nakedUnlimited = capitalBase({ legs: [{ kind: 'call' }], netCash: -2000, marginNet: 25000, maxLoss: Infinity });
  check('با زیان نامحدود، وجه تضمین لنگر می‌ماند و مخرج بی‌نهایت نمی‌شود',
    nakedUnlimited.value === 25000 && Number.isFinite(nakedUnlimited.value));

  // ——— بدهکارِ پوشیده، با وجه تضمین صفر ———
  //
  // مرحلهٔ اول این اصلاح، «بیشینه» را فقط وقتی اعمال می‌کرد که وجه تضمین
  // مثبت باشد، تا اسپرد پوشیده جابه‌جا نشود. حسابرسی نشان داد همان استثنا
  // یک خانوادهٔ کامل را باز می‌گذارد: اسپرد پوت نزولی با بدهکارِ ۸٫۲۴ ریال،
  // وجه تضمین صفر و بیشترین زیانِ ۴٬۴۴۷٫۶۹، بازده ماهانهٔ ۳٬۶۲۳٬۲۶۰٪ می‌داد.
  // وجه تضمین صفر است چون پوشش برقرار است؛ ولی هزینهٔ تسویه در سررسید پول
  // واقعی است و مخرج باید ببیندش.
  const coveredDebit = capitalBase({ legs: [{ kind: 'call' }], netCash: -4100000, marginNet: 0, maxLoss: 5030000 });
  check('اسپرد بدهکارِ پوشیده هم بیشترین زیان را در مخرج می‌آورد',
    coveredDebit.kind === 'DEBIT_BLOCKED' && coveredDebit.value === 5030000, coveredDebit.label);

  const tinyDebit = capitalBase({ legs: [{ kind: 'put' }], netCash: -8.24, marginNet: 0, maxLoss: 4447.69 });
  check('بدهکارِ ناچیز با زیانِ چندصدبرابر، دیگر بازده نجومی نمی‌سازد',
    tinyDebit.value === 4447.69 && (300 / tinyDebit.value) < (300 / 8.24) / 500, tinyDebit.label);

  // و آن‌جا که بدهکاری خودش بزرگ‌ترین جزء است، هیچ‌چیز عوض نمی‌شود
  const plainDebit = capitalBase({ legs: [{ kind: 'call' }], netCash: -4100000, marginNet: 0, maxLoss: 4100000 });
  check('وقتی بدهکاری خودش بزرگ‌ترین جزء است، مخرج همان بدهکاری می‌ماند',
    plainDebit.kind === 'DEBIT' && plainDebit.value === 4100000, plainDebit.label);
}
