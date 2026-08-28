// ۱۶۳. دانلود XLSX پرونده از کارت پایان

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  downloadPortfolioDossier, portfolioDossierFilename,
} from '../../ui/portfolio-dossier-export.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

group('۱۶۳. دانلود XLSX پرونده از کارت پایان');
{
  const fx163 = portfolioFixture('dossier-export-ui-163');
  const mission163 = fx163.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const closed163 = closeoutPortfolioSession(mission163, fx163.evidence, {
    at: mission163.end,
  });

  const called163 = [];
  const downloaded163 = await downloadPortfolioDossier(
    closed163.session, closed163.dossier, {
      generatedAt: 1_800_000_000_000,
      downloadImpl: async (name, sheets) => {
        called163.push({ name, sheets });
        return 12_345;
      },
    },
  );
  check('دانلود موفق نام، برگ‌ها و اندازه را برمی‌گرداند',
    downloaded163.ok && downloaded163.bytes === 12_345
    && called163.length === 1 && called163[0].sheets.length === 8);
  check('نام فایل نماد و تاریخ بستن دارد ولی شناسه جلسه ندارد',
    called163[0].name === 'portfolio-dossier-900001-20260620'
    && !called163[0].name.includes(closed163.session.id));
  check('پسوند را تابع downloadXlsx می‌افزاید نه نام قرارداد',
    !called163[0].name.endsWith('.xlsx'));
  check('نویسه‌های مسیر و کنترل از نام فایل پاک می‌شوند', (() => {
    const unsafeSession = { ...closed163.session, baseIns: '  90/00:*?  ' };
    const name = portfolioDossierFilename(unsafeSession, closed163.dossier);
    return name.includes('90-00') && !/[<>:"/\\|?*\u0000-\u001f]/.test(name);
  })());

  let invalidCalls163 = 0;
  const invalid163 = await downloadPortfolioDossier(
    closed163.session, { ...closed163.dossier, version: 99 }, {
      downloadImpl: async () => { invalidCalls163 += 1; return 1; },
    },
  );
  check('پرونده نامعتبر پیش از نویسنده فایل رد می‌شود',
    !invalid163.ok && invalidCalls163 === 0);
  const failed163 = await downloadPortfolioDossier(
    closed163.session, closed163.dossier, {
      downloadImpl: async () => { throw new Error('disk unavailable'); },
    },
  );
  check('شکست نویسنده به نتیجه قابل تلاش دوباره تبدیل می‌شود',
    !failed163.ok && failed163.why.includes('disk unavailable')
    && failed163.name === called163[0].name);

  const export163 = readSrc('../ui/portfolio-dossier-export.mjs');
  check('تابع دانلود قرارداد موجود و downloadXlsx را به‌ترتیب مصرف می‌کند',
    export163.indexOf('portfolioDossierWorkbook(session, dossier, {')
      < export163.indexOf('await downloadImpl(name, workbook.sheets)')
    && export163.includes("import { downloadXlsx, sheet, sheetParts } from './xlsx.mjs'"));
  check('تابع دانلود شبکه یا مسیر فایل خام ندارد',
    !/fetch\(|writeFile|session\.id.*portfolioDossierFilename/.test(export163));

  const tab163 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('کنترل دانلود و وضعیت دسترس‌پذیر در کارت پرونده هستند',
    tab163.includes('id="pt-dossier-export"')
    && tab163.includes('id="pt-dossier-export-do"')
    && tab163.includes('aria-describedby="pt-dossier-export-state"')
    && tab163.includes('id="pt-dossier-export-state"')
    && /id="pt-dossier-export-do"[^>]*disabled/.test(tab163));
  check('همان paintDossier پرونده زنده و بازیابی‌شده را آماده دانلود می‌کند',
    (tab163.match(/function paintDossier\b/g) || []).length === 1
    && /dossierExportView = view;/.test(tab163)
    && tab163.includes('paintDossier(persisted.view)')
    && tab163.includes('paintDossier(restored)'));
  check('تب جلسه، سند خام و continuity معتبر مدل فعلی را به دانلود می‌دهد',
    /downloadPortfolioDossier\(view\.session, view\.dossier, \{[\s\S]*?capitalContinuity: dossierContinuity\?\.continuity/.test(tab163)
    && !/portfolioDossierWorkbook\(/.test(tab163)
    && !/downloadXlsx\(/.test(tab163));
  check('هنگام ساخت کنترل قفل و پس از نتیجه برای تلاش دوباره آزاد می‌شود',
    /dossierExportBusy = true;[\s\S]*?button\.disabled = true;/.test(tab163)
    && /dossierExportBusy = false;[\s\S]*?button\.disabled = false;/.test(tab163));
  check('شکست دانلود پیام مستقل می‌دهد و پرونده را پاک نمی‌کند',
    /if \(!result\.ok\) \{[\s\S]*?status\.dataset\.error[\s\S]*?return;/.test(tab163)
    && !/if \(!result\.ok\)[\s\S]{0,220}(?:box\.hidden|dossierExportView\s*=\s*null)/.test(tab163));
  check('خطای غیرمنتظره یا تغییر پرونده قفل دانلود را برای همیشه باز نمی‌گذارد',
    /try \{[\s\S]*?downloadPortfolioDossier\(view\.session, view\.dossier[\s\S]*?\} catch \(error\)[\s\S]*?\} finally \{[\s\S]*?dossierExportBusy = false;[\s\S]*?button\.disabled = false;/.test(tab163)
    && /if \(view !== dossierExportView\) return;/.test(tab163));
  const exportHandler163 = tab163.slice(
    tab163.indexOf("$('pt-dossier-export-do').onclick"),
    tab163.indexOf('async function paintPreviousDossierComparison'),
  );
  check('مسیر خروجی fetch یا حساب مالی تازه ندارد',
    !/fetch\(|[*\/]\s*10|targetGap|realizedReturn/.test(exportHandler163));

  const css163 = readSrc('../ui/style.css');
  check('کنترل بدون سرریز و در موبایل تمام‌عرض است',
    /\.pt-dossier-export \{ min-width: 0;/.test(css163)
    && /\.pt-dossier-export button \{ flex: 0 0 auto; max-width: 100%; \}/.test(css163)
    && /\.pt-dossier-export button \{ width: 100%; \}/.test(css163));
}
