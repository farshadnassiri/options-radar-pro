// قرارداد دادهٔ Excel پرونده — برش نخست فاز ۷.
//
// این ماژول فایل دانلود نمی‌کند. خروجی فقط توصیف نسخه‌دار برگ‌هاست تا
// دکمه دانلود، آزمون و مصرف ماشینی همه یک داده را به نویسنده xlsx بدهند.
// عددهای مالی ریال و درصدها عدد خام می‌مانند؛ قالب نمایشی وارد Excel نمی‌شود.

import { portfolioDossierAnalysis } from '../core/portfolio-dossier-analysis.mjs';
import { portfolioCapitalGrowth } from '../core/portfolio-capital-growth.mjs';
import { portfolioDossierWeaknesses } from '../core/portfolio-dossier-weakness.mjs';
import { portfolioCapitalLedger } from '../core/portfolio-ledger.mjs';
import { portfolioSessionPositions } from '../core/portfolio-positions.mjs';
import { portfolioDossierView } from './portfolio-closeout-view.mjs';
import { downloadXlsx, sheet, sheetParts } from './xlsx.mjs';

export const PORTFOLIO_DOSSIER_EXPORT_VERSION = 2;

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

const missing = (value, why = 'مقدار در سند ثبت نشده') => [
  Number.isFinite(value) ? value : NaN,
  Number.isFinite(value) ? '' : why,
];

function qualityCells(quality) {
  return [
    text(quality?.kind), text(quality?.source), moment(quality?.asOf),
    quality?.sufficient === true ? 'بله' : quality?.sufficient === false ? 'خیر' : '',
    [...(quality?.reasons || []), quality?.reason].map(text).filter(Boolean).join('؛ '),
  ];
}

function topBook(contract) {
  const book = contract?.quote?.book;
  if (!Array.isArray(book) || !book.length) {
    return [NaN, NaN, NaN, NaN, 'دفتر سفارش شروع ثبت نشده'];
  }
  const first = book[0] || {};
  return [finite(first.bid), finite(first.bidQty), finite(first.ask), finite(first.askQty), ''];
}

function manifestSheet(session, dossier) {
  const rows = [
    ['schema', 'نسخه ساختار خروجی', PORTFOLIO_DOSSIER_EXPORT_VERSION, '', '', ''],
    ['session-schema', 'نسخه ساختار جلسه', finite(session.schemaVersion), '', '', ''],
    ['dossier-schema', 'نسخه ساختار پرونده', finite(dossier.version), '', '', ''],
    ['warning', 'هشدار استفاده', 'این سند برای قضاوت آموزشی است، نه توصیه مالی', '', '', ''],
    ['missing', 'قرارداد مقدار گمشده', 'سلول عددی خالی است و علت در ستون مجاور می‌آید', '', '', ''],
    ['units', 'قرارداد واحد', 'پول=ریال؛ درصد=عدد خام؛ زمان=date:second', '', '', ''],
    ['سرشناسه', 'هویت جلسه و پرونده', 'شناسه جلسه', '', 'جلسه ← همه برگ‌ها', ''],
    ['مأموریت', 'مأموریت و ورودی‌های ریسک/نقدشوندگی', 'مسیر فیلد', '', 'جلسه', ''],
    ['تخصیص‌ها', 'بودجه قفل‌شده خانواده‌ها', 'خانواده', 'ریال/درصد', 'جلسه', ''],
    ['عکس شروع', 'نماد پایه، سرمایه و کیفیت شروع', 'شناسه جلسه', 'ریال', 'جلسه', ''],
    ['قراردادهای شروع', 'شاهد فشرده بازار شروع؛ فقط سرِ دفتر', 'شناسه قرارداد', 'ریال', 'عکس شروع', ''],
    ['موقعیت‌ها', 'هویت و نتیجه موقعیت', 'شناسه موقعیت', 'ریال', 'جلسه', ''],
    ['تراکنش‌ها', 'دفتر immutable ورود/خروج', 'شناسه تراکنش', 'ریال', 'موقعیت‌ها', ''],
    ['پاها', 'پاهای مستند هر تراکنش', 'شناسه تراکنش+ردیف', 'ریال', 'تراکنش‌ها', ''],
    ['اجراها', 'اجرای واقعی ثبت‌شده', 'شناسه اجرا', 'ریال', 'تراکنش‌ها', ''],
    ['لات‌های FIFO', 'Lot و مصرف FIFO بدون شناسه تازه', 'شناسه Lot', '', 'موقعیت‌ها/تراکنش‌ها', ''],
    ['مسیر سرمایه', 'نقاط تغییر حجم و آفست در تایم‌فریم مأموریت', 'ترتیب رویداد', 'ریال', 'تراکنش‌ها', ''],
    ['رتبه نهایی', 'همه گزینه‌های دارای مبنای یکسان', 'شناسه نامزد', 'ریال/درصد', 'پرونده', ''],
    ['بدون رتبه', 'گزینه‌های فاقد عدد همراه علت', 'شناسه نامزد', '', 'پرونده', ''],
  ];
  return sheet('راهنمای AI', [
    'کد', 'تعریف', 'مقدار/کلید اصلی', 'واحد', 'رابطه کلیدها', 'یادداشت',
  ], rows, [130, 280, 330, 120, 230, 250]);
}

function fullGameSheets(session, dossier) {
  const ranking = dossier.finalRanking;
  if (!ranking || ranking.ok !== true) return [];
  const positions = portfolioSessionPositions(session);
  if (!positions.ok) return [];

  const allocationRows = [...(session.lockedAllocations || [])]
    .sort((left, right) => text(left?.familyId).localeCompare(text(right?.familyId)))
    .map((row) => [row.familyId || '', row.label || '', finite(row.pct), finite(row.targetRial)]);

  const snapshot = session.startSnapshot || {};
  const snapshotRows = [
    ['sessionId', 'شناسه جلسه', session.id, '', ''],
    ['portfolioId', 'شناسه سبد', session.portfolioId, '', ''],
    ['baseIns', 'نماد پایه', session.baseIns, '', ''],
    ['start', 'لحظه شروع', moment(session.start), '', ''],
    ['snapshotAt', 'لحظه عکس شروع', moment(snapshot.at), '', ''],
    ['spotRial', 'قیمت نماد پایه در شروع', ...missing(finite(snapshot.spot)), 'ریال'],
    ['qualityKind', 'نوع کیفیت عکس شروع', text(snapshot.quality?.kind), '', ''],
    ['qualitySource', 'منبع عکس شروع', text(snapshot.quality?.source), '', ''],
    ['qualityReasons', 'علت‌ها و هشدارهای کیفیت', [
      ...(session.dataWarnings || []), ...(snapshot.quality?.reasons || []), snapshot.quality?.reason,
    ].map(text).filter(Boolean).join('؛ '), '', ''],
  ];
  const contractRows = [...(snapshot.contracts || [])]
    .sort((left, right) => text(left?.ins).localeCompare(text(right?.ins)))
    .map((row) => [
      row.ins || '', row.kind || '', finite(row.strike), finite(row.expiry), finite(row.size),
      finite(row.quote?.close), ...topBook(row), ...qualityCells(row.quote?.quality),
    ]);

  const positionRows = positions.positions.map((row) => [
    row.id, row.status, row.strategyId, row.familyId, row.candidateId,
    moment(row.openedAt), moment(row.closedAt), finite(row.initialQty), finite(row.openQty),
    finite(row.capitalRial), finite(row.entryCashRial), finite(row.openEntryFeeRial),
    finite(row.realizedRial), NaN,
    row.realizedWhy || '', 'ارزش تحقق‌نیافته موقعیت در سند پایان ثبت نشده',
  ]);

  const transactionRows = [];
  const legRows = [];
  const executionRows = [];
  const consumedByLot = new Map();
  for (const event of session.events || []) {
    if (event?.type !== 'transaction') continue;
    const data = event.data || {};
    const capital = data.capital?.components || {};
    const entryFee = data.commitVersion ? capital.feeRial : NaN;
    const exitFee = data.closeVersion ? data.feeRial : NaN;
    transactionRows.push([
      event.id || '', event.transactionId || '', event.positionId || '',
      event.transactionKind || '', event.transactionLabel || '', moment(event.at), finite(event.qty),
      event.lotId || '', data.operationId || '', finite(data.capitalRial),
      finite(capital.debitRial), finite(capital.creditRial), finite(capital.marginRial),
      finite(entryFee), finite(exitFee), finite(data.entryCashRial), finite(data.exitCashRial),
      finite(data.realizedRial), NaN, data.realizedWhy || '',
      'ارزش تحقق‌نیافته برای تراکنش immutable ثبت نشده',
    ]);
    (data.legs || []).forEach((leg, index) => legRows.push([
      event.transactionId || '', index + 1, event.positionId || '', leg.ins || '',
      leg.kind || '', leg.side || '', leg.entrySide || '', finite(leg.ratio), finite(leg.size),
      finite(leg.strike), finite(leg.expiry), finite(leg.vwap), finite(leg.filled),
      finite(leg.top), finite(leg.levels),
    ]));
    (event.executions || []).forEach((execution) => executionRows.push([
      execution.id || '', event.transactionId || '', event.positionId || '',
      execution.ins || '', execution.side || '', finite(execution.qty), finite(execution.price),
    ]));
    for (const used of event.consumedLots || []) {
      const row = consumedByLot.get(text(used?.lotId)) || { qty: 0, transactions: [] };
      row.qty += Number(used?.qty) || 0;
      row.transactions.push(event.transactionId || '');
      consumedByLot.set(text(used?.lotId), row);
    }
  }

  const lotRows = positions.positions.flatMap((position) => (position.lots || []).map((lot) => {
    const used = consumedByLot.get(text(lot.id)) || { qty: 0, transactions: [] };
    return [
      lot.id || '', position.id, lot.transactionId || '', moment(lot.openedAt),
      finite(lot.initialQty), finite(lot.remainingQty), used.qty,
      used.transactions.filter(Boolean).join('|'),
    ];
  }));

  const grain = text(session.lockedMission?.replay?.grain);
  const pathRows = [];
  const events = (session.events || []).filter((event) => event?.type === 'transaction');
  for (let index = 0; index <= events.length; index += 1) {
    const event = index ? events[index - 1] : null;
    const partial = { ...session, events: events.slice(0, index) };
    const ledger = portfolioCapitalLedger(partial);
    const reason = ledger.ok && ledger.unpriced.count === 0
      ? '' : ledger.why || `عدد ${ledger.unpriced.count} رویداد سرمایه کامل نیست`;
    pathRows.push([
      index, grain, moment(event?.at || session.start), event?.id || '', event?.transactionId || '',
      event?.positionId || '', event?.transactionKind || 'start',
      event ? (['open', 'increase', 'rollIn'].includes(event.transactionKind)
        ? finite(event.qty) : -finite(event.qty)) : 0,
      ledger.ok ? finite(ledger.committed.totalRial) : NaN,
      ledger.ok ? finite(ledger.committed.debitRial) : NaN,
      ledger.ok ? finite(ledger.committed.feeRial) : NaN,
      ledger.ok ? finite(ledger.committed.marginRial) : NaN,
      ledger.ok ? finite(ledger.free.rial) : NaN,
      finite(event?.data?.realizedRial), NaN, reason,
      'ارزش تحقق‌نیافته مسیر در دفتر immutable ثبت نشده',
    ]);
  }

  const selectedIds = new Set((ranking.selected || []).map((row) => text(row?.candidateId)));
  const rankingRows = (ranking.ranked || []).map((row) => [
    row.candidateId || '', row.defId || '', finite(row.rank), finite(row.percentile),
    finite(row.capitalRial), finite(row.entryCashRial), finite(row.entryFeeRial),
    finite(row.exitCashRial), finite(row.exitFeeRial), finite(row.realizedRial),
    finite(row.returnPct), selectedIds.has(text(row.candidateId)) ? 'بله' : 'خیر',
    row.candidateId === ranking.best?.candidateId ? 'بهترین'
      : row.candidateId === ranking.worst?.candidateId ? 'بدترین' : '',
    moment(ranking.start), moment(ranking.end),
  ]);
  const withoutRankRows = (ranking.withoutRank || []).map((row) => [
    row.candidateId || '', row.defId || '', row.why || '',
    selectedIds.has(text(row.candidateId)) ? 'بله' : 'خیر', moment(ranking.start), moment(ranking.end),
  ]);

  return [
    manifestSheet(session, dossier),
    sheet('تخصیص‌ها', ['خانواده', 'عنوان', 'درصد خام', 'بودجه هدف (ریال)'], allocationRows),
    sheet('عکس شروع', ['کد', 'عنوان', 'مقدار خام', 'علت نبود', 'واحد'], snapshotRows),
    ...sheetParts('قراردادهای شروع', [
      'شناسه قرارداد', 'نوع', 'اعمال (ریال)', 'سررسید', 'اندازه قرارداد',
      'قیمت پایانی شروع (ریال)', 'بهترین خرید', 'حجم خرید', 'بهترین فروش', 'حجم فروش',
      'علت نبود دفتر', 'نوع کیفیت', 'منبع کیفیت', 'لحظه کیفیت', 'کفایت', 'علت کیفیت',
    ], contractRows),
    ...sheetParts('موقعیت‌ها', [
      'شناسه موقعیت', 'وضعیت', 'استراتژی', 'خانواده', 'شناسه نامزد', 'شروع', 'پایان',
      'حجم اولیه', 'حجم باز', 'سرمایه ورود (ریال)', 'نقد ورود (ریال)',
      'کارمزد مبنای باز (ریال)', 'تحقق‌یافته (ریال)', 'تحقق‌نیافته (ریال)',
      'علت نبود تحقق‌یافته', 'علت نبود تحقق‌نیافته',
    ], positionRows),
    ...sheetParts('تراکنش‌ها', [
      'شناسه رویداد', 'شناسه تراکنش', 'شناسه موقعیت', 'کد نوع', 'عنوان نوع', 'لحظه',
      'حجم', 'شناسه Lot تازه', 'شناسه عملیات', 'سرمایه لازم (ریال)', 'بدهکار (ریال)',
      'بستانکار (ریال)', 'وجه تضمین (ریال)', 'کارمزد ورود (ریال)', 'کارمزد خروج (ریال)',
      'نقد ورود (ریال)', 'نقد خروج (ریال)', 'تحقق‌یافته (ریال)', 'تحقق‌نیافته (ریال)',
      'علت نبود تحقق‌یافته', 'علت نبود تحقق‌نیافته',
    ], transactionRows),
    ...sheetParts('پاها', [
      'شناسه تراکنش', 'ردیف پا', 'شناسه موقعیت', 'شناسه قرارداد', 'نوع دارایی',
      'سمت ثبت', 'سمت ورود', 'نسبت', 'اندازه', 'اعمال', 'سررسید', 'VWAP', 'حجم پرشده',
      'سر دفتر', 'تعداد سطح',
    ], legRows),
    ...sheetParts('اجراها', [
      'شناسه اجرا', 'شناسه تراکنش', 'شناسه موقعیت', 'شناسه قرارداد', 'سمت', 'حجم', 'قیمت',
    ], executionRows),
    ...sheetParts('لات‌های FIFO', [
      'شناسه Lot', 'شناسه موقعیت', 'تراکنش سازنده', 'لحظه ساخت', 'حجم اولیه',
      'حجم باقی‌مانده', 'حجم مصرف‌شده', 'تراکنش‌های مصرف‌کننده',
    ], lotRows),
    ...sheetParts('مسیر سرمایه', [
      'ترتیب', 'تایم‌فریم', 'لحظه', 'شناسه رویداد', 'شناسه تراکنش', 'شناسه موقعیت',
      'کد تغییر', 'تغییر حجم', 'سرمایه درگیر (ریال)', 'بدهکار درگیر (ریال)',
      'کارمزد درگیر (ریال)', 'وجه تضمین درگیر (ریال)', 'سرمایه آزاد (ریال)',
      'تحقق‌یافته این تغییر (ریال)', 'تحقق‌نیافته (ریال)', 'علت نبود سرمایه',
      'علت نبود تحقق‌نیافته',
    ], pathRows),
    ...sheetParts('رتبه نهایی', [
      'شناسه نامزد', 'تعریف', 'رتبه', 'صدک', 'مبنای سرمایه (ریال)', 'نقد ورود (ریال)',
      'کارمزد ورود (ریال)', 'نقد خروج (ریال)', 'کارمزد خروج (ریال)',
      'تحقق‌یافته (ریال)', 'بازده (درصد)', 'انتخاب کاربر', 'کران', 'شروع مبنا', 'پایان مبنا',
    ], rankingRows),
    ...sheetParts('بدون رتبه', [
      'شناسه نامزد', 'تعریف', 'علت', 'انتخاب کاربر', 'شروع مبنا', 'پایان مبنا',
    ], withoutRankRows),
  ];
}

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
      ...fullGameSheets(session, dossier),
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
