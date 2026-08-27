// قرارداد دادهٔ Excel پرونده — برش نخست فاز ۷.
//
// این ماژول فایل دانلود نمی‌کند. خروجی فقط توصیف نسخه‌دار برگ‌هاست تا
// دکمه دانلود، آزمون و مصرف ماشینی همه یک داده را به نویسنده xlsx بدهند.
// عددهای مالی ریال و درصدها عدد خام می‌مانند؛ قالب نمایشی وارد Excel نمی‌شود.

import { portfolioDossierAnalysis } from '../core/portfolio-dossier-analysis.mjs';
import { portfolioCapitalGrowth } from '../core/portfolio-capital-growth.mjs';
import { portfolioDossierWeaknesses } from '../core/portfolio-dossier-weakness.mjs';
import { portfolioDossierView } from './portfolio-closeout-view.mjs';
import { downloadXlsx, sheet, sheetParts } from './xlsx.mjs';

export const PORTFOLIO_DOSSIER_EXPORT_VERSION = 1;

const text = (value) => String(value ?? '').trim();
const finite = (value) => (Number.isFinite(value) ? value : NaN);
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function fail(why) {
  return {
    version: PORTFOLIO_DOSSIER_EXPORT_VERSION,
    ok: false,
    why,
    sessionId: null,
    generatedAt: null,
    sheets: [],
  };
}

function moment(value) {
  const date = Number(value?.date), second = Number(value?.second);
  return Number.isFinite(date) && Number.isFinite(second) ? `${date}:${second}` : '';
}

/**
 * شیء نسخه‌دار را بدون حذف فیلد به ردیف‌های پایدار تبدیل می‌کند.
 * null/undefined خانه عددی خالی می‌سازند و وضعیت مجاور علت نبود را نگه
 * می‌دارد. کلیدهای شیء مرتب‌اند؛ ترتیب آرایه چون بخشی از سند است حفظ می‌شود.
 */
function flatten(value, prefix = '', rows = []) {
  if (value === null || value === undefined) {
    rows.push([prefix, NaN, 'نامعلوم', 'مقدار در سند ثبت نشده']);
    return rows;
  }
  if (Array.isArray(value)) {
    if (!value.length) rows.push([prefix, '', 'فهرست', 'فهرست خالی']);
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, rows));
    return rows;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
    if (!keys.length) rows.push([prefix, '', 'شیء', 'شیء خالی']);
    keys.forEach((key) => flatten(value[key], prefix ? `${prefix}.${key}` : key, rows));
    return rows;
  }
  if (typeof value === 'number') {
    rows.push([prefix, Number.isFinite(value) ? value : NaN, 'عدد',
      Number.isFinite(value) ? '' : 'عدد در سند معتبر نیست']);
    return rows;
  }
  if (typeof value === 'boolean') {
    rows.push([prefix, value ? 'بله' : 'خیر', 'بولی', '']);
    return rows;
  }
  rows.push([prefix, String(value), 'متن', '']);
  return rows;
}

const flatSheet = (name, value) => sheet(
  name, ['مسیر فیلد', 'مقدار خام', 'نوع', 'وضعیت'], flatten(value), [250, 250, 90, 260],
);

/** جلسه بسته و پرونده خام → برگ‌های پایدار دفترکار. */
export function portfolioDossierWorkbook(session, dossier, {
  generatedAt = Date.now(), capitalContinuity,
} = {}) {
  const valid = portfolioDossierView(session, dossier);
  if (!valid.ok) return fail(valid.why);
  if (!Number.isInteger(generatedAt) || generatedAt < 0) {
    return fail('زمان ساخت دفترکار معتبر نیست');
  }
  const analysis = portfolioDossierAnalysis(session, dossier);
  const weakness = portfolioDossierWeaknesses(session, dossier);
  if (!analysis.ok || !weakness.ok) return fail(analysis.why || weakness.why);

  const allocations = copy(session.lockedAllocations || [])
    .sort((left, right) => text(left?.familyId).localeCompare(text(right?.familyId)));
  const mission = { lockedMission: copy(session.lockedMission), lockedAllocations: allocations };
  const capitalRows = [
    ['initialCapitalRial', 'سرمایه شروع', finite(analysis.initialCapitalRial), 'ریال', ''],
    ['reserveRial', 'ذخیره سرمایه', finite(session.capital?.reserveRial), 'ریال', ''],
    ['allocatableRial', 'سرمایه قابل تخصیص', finite(session.capital?.allocatableRial), 'ریال', ''],
    ['realizedRial', 'سود و زیان تحقق‌یافته', finite(analysis.realizedRial), 'ریال',
      Number.isFinite(analysis.realizedRial) ? '' : analysis.why],
    ['finalCapitalRial', 'سرمایه نهایی', finite(analysis.finalCapitalRial), 'ریال',
      Number.isFinite(analysis.finalCapitalRial) ? '' : analysis.why],
    ['returnBaseRial', 'مبنای بازده', finite(analysis.returnBaseRial), 'ریال',
      Number.isFinite(analysis.returnBaseRial) ? '' : analysis.why],
    ['realizedReturnPct', 'بازده تحقق‌یافته', finite(analysis.realizedReturnPct), 'درصد',
      Number.isFinite(analysis.realizedReturnPct) ? '' : analysis.why],
    ['targetReturnPct', 'هدف بازده', finite(analysis.targetReturnPct), 'درصد', ''],
    ['targetProfitRial', 'سود هدف', finite(analysis.targetProfitRial), 'ریال',
      Number.isFinite(analysis.targetProfitRial) ? '' : analysis.why],
    ['targetGapPct', 'فاصله درصدی از هدف', finite(analysis.targetGapPct), 'درصد',
      Number.isFinite(analysis.targetGapPct) ? '' : analysis.why],
    ['targetGapRial', 'فاصله پولی از هدف', finite(analysis.targetGapRial), 'ریال',
      Number.isFinite(analysis.targetGapRial) ? '' : analysis.why],
  ];

  const realizedRows = [...dossier.realized.rows]
    .sort((left, right) => text(left?.id).localeCompare(text(right?.id)))
    .map((row) => [
      row.id, row.defId || '', row.familyId || '', finite(row.closedQty),
      finite(row.exitCashRial), finite(row.exitFeeRial), finite(row.entryShareRial),
      finite(row.entryFeeShareRial), finite(row.realizedRial), '',
    ]);
  for (const id of [...dossier.realized.unknown].map(text).filter(Boolean).sort()) {
    realizedRows.push([id, '', '', NaN, NaN, NaN, NaN, NaN, NaN,
      'سند تحقق‌یافته این موقعیت کامل نیست']);
  }

  const commitmentRows = [
    ['summary', '', dossier.positions.open, dossier.positions.openQty],
    ...[...dossier.positions.openIds].map(text).filter(Boolean).sort()
      .map((id) => ['position', id, NaN, NaN]),
  ];
  const alertRows = [...dossier.alerts]
    .sort((left, right) => text(left?.code).localeCompare(text(right?.code)))
    .map((row) => [
      row.code || '', row.label || '', row.state || '', row.stateLabel || '', row.basis || '',
      finite(row.limitPct), finite(row.currentPct), finite(row.headroomPct),
      finite(row.limitRial), finite(row.currentRial), finite(row.headroomRial),
      row.unlimitedLoss === true ? 'بله' : row.unlimitedLoss === false ? 'خیر' : '',
      finite(row.atWorstPrice), finite(row.atCommitRial), finite(row.changeRial),
      finite(row.unrealizedRial), row.why || '',
    ]);
  const findingRows = weakness.findings.map((row) => [
    row.code, row.severity, row.title, row.description, JSON.stringify(row.evidence || {}),
  ]);

  let growthSheets = [];
  if (capitalContinuity !== undefined) {
    const growth = portfolioCapitalGrowth(capitalContinuity);
    if (!growth.ok) return fail(`روند سرمایه معتبر نیست: ${growth.why}`);
    const current = growth.rows.at(-1);
    if (current.sessionId !== session.id
      || current.portfolioId !== session.portfolioId
      || current.baseIns !== session.baseIns
      || moment(current.closedAt) !== moment(session.closedAt)
      || current.initialCapitalRial !== analysis.initialCapitalRial
      || current.realizedRial !== analysis.realizedRial
      || current.finalCapitalRial !== analysis.finalCapitalRial) {
      return fail('روند سرمایه به همین پرونده بسته‌شده تعلق ندارد');
    }
    const growthRows = growth.rows.map((row) => [
      growth.version, row.index, row.sessionId, row.portfolioId, row.baseIns,
      moment(row.closedAt), row.initialCapitalRial, row.realizedRial, row.finalCapitalRial,
      row.changeRial, finite(row.changePct), row.percentageWhy, row.state,
      row.cumulativeChangeRial, finite(row.cumulativeChangePct),
      row.cumulativePercentageWhy,
    ]);
    growthSheets = sheetParts('روند سرمایه', [
      'نسخه مدل', 'ترتیب سفر', 'شناسه جلسه', 'شناسه سبد', 'نماد پایه',
      'لحظه بستن', 'سرمایه شروع (ریال)', 'تحقق‌یافته (ریال)',
      'سرمایه نهایی (ریال)', 'تغییر سفر (ریال)', 'تغییر سفر (درصد)',
      'علت نبود درصد سفر', 'کد وضعیت', 'تغییر تجمعی (ریال)',
      'تغییر تجمعی (درصد)', 'علت نبود درصد تجمعی',
    ], growthRows, [
      85, 85, 210, 210, 110, 150, 145, 145, 145, 145, 130, 250, 95, 155, 140, 250,
    ]);
  }

  return {
    version: PORTFOLIO_DOSSIER_EXPORT_VERSION,
    ok: true,
    why: '',
    sessionId: session.id,
    generatedAt,
    sheets: [
      sheet('سرشناسه', ['شاخص', 'مقدار'], [
        ['نسخه خروجی', PORTFOLIO_DOSSIER_EXPORT_VERSION],
        ['نسخه پرونده', dossier.version],
        ['شناسه جلسه', session.id],
        ['شناسه سبد', session.portfolioId],
        ['نماد پایه', session.baseIns],
        ['شروع', moment(session.start)],
        ['پایان برنامه', moment(session.end)],
        ['لحظه بستن', moment(session.closedAt)],
        ['بستن زودهنگام', dossier.early ? 'بله' : 'خیر'],
        ['زمان ساخت یونیکس میلی‌ثانیه', generatedAt],
      ], [220, 320]),
      flatSheet('مأموریت', mission),
      sheet('سرمایه', ['کد', 'عنوان', 'مقدار خام', 'واحد', 'علت نبود'], capitalRows),
      ...growthSheets,
      flatSheet('حسابداری', {
        accounting: copy(dossier.accounting), accountingWhy: dossier.accountingWhy,
      }),
      ...sheetParts('تحقق‌یافته', [
        'شناسه موقعیت', 'تعریف', 'خانواده', 'حجم بسته‌شده', 'نقد خروج (ریال)',
        'کارمزد خروج (ریال)', 'سهم نقد ورود (ریال)', 'سهم کارمزد ورود (ریال)',
        'سود و زیان تحقق‌یافته (ریال)', 'علت نبود',
      ], realizedRows),
      ...sheetParts('تعهدهای باز', [
        'نوع ردیف', 'شناسه موقعیت', 'تعداد کل موقعیت باز', 'حجم باز کل',
      ], commitmentRows),
      ...sheetParts('هشدارها', [
        'کد', 'عنوان', 'وضعیت', 'عنوان وضعیت', 'مبنا', 'حد (درصد)',
        'مقدار (درصد)', 'فاصله (درصد)', 'حد (ریال)', 'مقدار (ریال)',
        'فاصله (ریال)', 'زیان بی‌سقف', 'قیمت بدترین نقطه', 'مقدار ثبت (ریال)',
        'تغییر (ریال)', 'تحقق‌نیافته (ریال)', 'علت نبود',
      ], alertRows),
      ...sheetParts('یافته‌ها', ['کد پایدار', 'شدت', 'عنوان', 'شرح', 'شاهد JSON'], findingRows),
    ],
  };
}

const safeFilePart = (value, fallback) => {
  const cleaned = text(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return cleaned || fallback;
};

/** نام پایدار و امن فایل؛ شناسه جلسه عمداً وارد مسیر نمی‌شود. */
export function portfolioDossierFilename(session, dossier) {
  const base = safeFilePart(session?.baseIns, 'base');
  const date = Number(dossier?.closedAt?.date);
  return `portfolio-dossier-${base}-${Number.isInteger(date) && date > 0 ? date : 'unknown-date'}`;
}

/** ساخت قرارداد و تحویل آن به نویسنده xlsx موجود. */
export async function downloadPortfolioDossier(session, dossier, {
  generatedAt = Date.now(), downloadImpl = downloadXlsx, capitalContinuity,
} = {}) {
  const workbook = portfolioDossierWorkbook(session, dossier, {
    generatedAt, capitalContinuity,
  });
  if (!workbook.ok) return { ok: false, why: workbook.why, name: '', bytes: null };
  const name = portfolioDossierFilename(session, dossier);
  try {
    const bytes = await downloadImpl(name, workbook.sheets);
    if (!Number.isFinite(bytes) || bytes < 0) {
      return { ok: false, why: 'نویسنده Excel اندازه فایل معتبر برنگرداند', name, bytes: null };
    }
    return { ok: true, why: '', name, bytes };
  } catch (error) {
    return {
      ok: false,
      why: `فایل Excel ساخته نشد: ${error?.message || 'خطای نامعلوم'}`,
      name,
      bytes: null,
    };
  }
}
