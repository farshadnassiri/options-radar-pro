// ۱۶۲. قرارداد نسخه‌دار دادهٔ Excel پرونده

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  PORTFOLIO_DOSSIER_EXPORT_VERSION, portfolioDossierWorkbook,
} from '../../ui/portfolio-dossier-export.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const byName = (book, name) => book.sheets.find((row) => row.name === name);

group('۱۶۲. قرارداد نسخه‌دار دادهٔ Excel پرونده');
{
  const fx162 = portfolioFixture('dossier-export-162');
  const mission162 = fx162.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const closed162 = closeoutPortfolioSession(mission162, fx162.evidence, {
    at: mission162.end,
  });
  const dossier162 = clone(closed162.dossier);
  dossier162.realized.totalRial = 1_250_000;
  dossier162.realized.rows = [{
    id: 'position-2', defId: 'long-call', familyId: 'single', closedQty: 2,
    exitCashRial: 2_000_000, exitFeeRial: 20_000, entryShareRial: -700_000,
    entryFeeShareRial: 30_000, realizedRial: 1_250_000,
  }];
  dossier162.realized.unknown = ['position-9'];
  dossier162.positions = {
    total: 2, open: 2, closed: 0, openIds: ['position-8', 'position-3'], openQty: 3,
  };
  dossier162.alerts = [
    { code: 'z-limit', label: 'قید آخر', state: 'unknown', stateLabel: 'نامعلوم', limitPct: 40, currentPct: null, why: 'داده کافی نیست' },
    { code: 'a-limit', label: 'قید اول', state: 'breached', stateLabel: 'شکسته', limitRial: 5_000_000, currentRial: 5_500_000, headroomRial: -500_000 },
  ];

  const book162 = portfolioDossierWorkbook(closed162.session, dossier162, {
    generatedAt: 1_777_777_777_777,
  });
  check('قرارداد نسخه، هویت و زمان ساخت صریح دارد',
    book162.ok && book162.version === PORTFOLIO_DOSSIER_EXPORT_VERSION
    && book162.sessionId === closed162.session.id
    && book162.generatedAt === 1_777_777_777_777, book162.why);
  check('ترتیب هشت برگ ثابت است',
    book162.sheets.map((row) => row.name).join('|')
      === 'سرشناسه|مأموریت|سرمایه|حسابداری|تحقق‌یافته|تعهدهای باز|هشدارها|یافته‌ها');
  check('هر برگ همان قرارداد sheet نویسنده xlsx را دارد',
    book162.sheets.every((row) => Array.isArray(row.headers) && Array.isArray(row.rows)
      && Array.isArray(row.widths)));

  const missionSheet162 = byName(book162, 'مأموریت');
  check('مأموریت قفل‌شده و تخصیص‌ها بدون قالب نمایشی می‌آیند',
    missionSheet162.rows.some((row) => row[0] === 'lockedMission.objective.targetReturnPct'
      && row[1] === 25 && row[2] === 'عدد')
    && missionSheet162.rows.some((row) => /lockedMission\.outlook\.thesis/.test(row[0])
      && row[1] === BULLISH_OUTLOOK.thesis)
    && missionSheet162.rows.some((row) => /lockedAllocations\[0\]\.familyId/.test(row[0])));
  check('کلیدهای مأموریت برای diff ترتیب پایدار دارند', (() => {
    const keys = missionSheet162.rows.map((row) => row[0]);
    const objective = keys.filter((key) => key.startsWith('lockedMission.objective.'));
    return objective.every((key, index) => index === 0
      || objective[index - 1].localeCompare(key) <= 0);
  })());

  const capital162 = byName(book162, 'سرمایه');
  const capitalValue162 = (code) => capital162.rows.find((row) => row[0] === code);
  check('پول در خانه عددی و با واحد ریال می‌ماند',
    capitalValue162('initialCapitalRial')[2] === 10_000_000
    && capitalValue162('initialCapitalRial')[3] === 'ریال'
    && typeof capitalValue162('realizedRial')[2] === 'number');
  check('درصد عدد خام است نه رشته فارسی',
    capitalValue162('targetReturnPct')[2] === 25
    && capitalValue162('targetReturnPct')[3] === 'درصد');
  check('تحلیل نامعلوم خانه خالی و علت مجاور دارد',
    Number.isNaN(capitalValue162('finalCapitalRial')[2])
    && capitalValue162('finalCapitalRial')[4].length > 0);

  const realized162 = byName(book162, 'تحقق‌یافته');
  check('ردیف تحقق‌یافته همه اجزای عددی سند را نگه می‌دارد',
    realized162.rows[0][0] === 'position-2'
    && realized162.rows[0][4] === 2_000_000
    && realized162.rows[0][8] === 1_250_000);
  check('موقعیت با سند ناقص صفر نمی‌گیرد',
    realized162.rows.some((row) => row[0] === 'position-9'
      && Number.isNaN(row[3]) && Number.isNaN(row[8]) && row[9].includes('کامل نیست')));

  const commitments162 = byName(book162, 'تعهدهای باز');
  check('جمع تعهد و شناسه‌های مرتب، ادعای حجم هر موقعیت نمی‌سازند',
    commitments162.rows[0][2] === 2 && commitments162.rows[0][3] === 3
    && commitments162.rows[1][1] === 'position-3'
    && Number.isNaN(commitments162.rows[1][2]) && Number.isNaN(commitments162.rows[1][3]));
  const alerts162 = byName(book162, 'هشدارها');
  check('هشدارها با کد مرتب و عدد نامعلوم خالی‌اند',
    alerts162.rows[0][0] === 'a-limit' && alerts162.rows[1][0] === 'z-limit'
    && Number.isNaN(alerts162.rows[1][6]) && alerts162.rows[1][16] === 'داده کافی نیست');
  const findings162 = byName(book162, 'یافته‌ها');
  check('کد، شدت و شاهد ماشینی یافته‌ها در خروجی هستند',
    findings162.rows.some((row) => row[0] === 'open-commitment'
      && row[1] === 'critical' && JSON.parse(row[4]).openCount === 2)
    && findings162.rows.some((row) => row[0] === 'risk-breached:a-limit'));

  check('نسخه ناشناخته، هویت ناسازگار و زمان ساخت نامعتبر رد می‌شوند', (() => {
    const badVersion = clone(dossier162), badId = clone(dossier162);
    badVersion.version = 99;
    badId.sessionId = 'other-162';
    return !portfolioDossierWorkbook(closed162.session, badVersion).ok
      && !portfolioDossierWorkbook(closed162.session, badId).ok
      && !portfolioDossierWorkbook(closed162.session, dossier162, { generatedAt: -1 }).ok;
  })());

  const source162 = readSrc('../ui/portfolio-dossier-export.mjs');
  check('سازنده تحلیل سرمایه، ضعف و sheet موجود را مصرف می‌کند',
    source162.includes("from '../core/portfolio-dossier-analysis.mjs'")
    && source162.includes("from '../core/portfolio-dossier-weakness.mjs'")
    && source162.includes("from './xlsx.mjs'")
    && /portfolioDossierAnalysis\(session, dossier\)/.test(source162)
    && /portfolioDossierWeaknesses\(session, dossier\)/.test(source162));
  const builderSource162 = source162.slice(0, source162.indexOf('const safeFilePart'));
  check('سازنده برگ‌ها خالص است و شبکه، DOM یا دانلود ندارد',
    !/fetch\(|document\.|querySelector|await downloadImpl|Blob\(|URL\.createObjectURL/.test(builderSource162));
  check('نامعلوم به NaN می‌رود و صفر جایگزین نمی‌شود',
    /Number\.isFinite\(value\) \? value : NaN/.test(source162)
    && !/\?\s*value\s*:\s*0/.test(source162));
}
