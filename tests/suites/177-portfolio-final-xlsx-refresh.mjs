// ۱۷۷. Excel بازی کامل پس از بازیابی پرونده

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { check, group } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import {
  loadPortfolioDossierSave, savePortfolioDossier,
} from '../../server/portfolio-dossier-store.mjs';
import { portfolioDossierWorkbook } from '../../ui/portfolio-dossier-export.mjs';
import { buildXlsx } from '../../ui/xlsx.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';

const byName = (book, name) => book.sheets.find((row) => row.name === name);
const u16 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);
const u32 = (bytes, at) => (u16(bytes, at) | (u16(bytes, at + 2) << 16)) >>> 0;

function zipMembers(bytes) {
  const files = new Map();
  let at = 0;
  while (u32(bytes, at) === 0x04034b50) {
    const method = u16(bytes, at + 8);
    const packedSize = u32(bytes, at + 18);
    const nameSize = u16(bytes, at + 26);
    const extraSize = u16(bytes, at + 28);
    const nameAt = at + 30;
    const bodyAt = nameAt + nameSize + extraSize;
    const name = new TextDecoder().decode(bytes.slice(nameAt, nameAt + nameSize));
    const packed = bytes.slice(bodyAt, bodyAt + packedSize);
    const body = method === 8 ? inflateRawSync(Buffer.from(packed)) : packed;
    files.set(name, new TextDecoder().decode(body));
    at = bodyAt + packedSize;
  }
  return files;
}

group('۱۷۷. Excel بازی کامل پس از بازیابی پرونده');
{
  const fx177 = portfolioFixture('final-xlsx-refresh-177');
  const roomy177 = structuredClone(fx177.baseSession);
  roomy177.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session177 = {
    ...roomy177,
    lockedMission: fx177.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const plans177 = portfolioRankedPlans(session177, fx177.evidence);
  const candidate177 = plans177.ranking.ranked[0].candidateId;
  const opened177 = commitPortfolioPlan(session177, fx177.evidence, candidate177, { quantity: 2 });

  const end177 = { ...session177.end };
  const quality177 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: end177, sufficient: true,
    details: { levelsKnown: 2, levelsTotal: 2 },
  });
  const endContracts177 = fx177.contracts.map((contract, index) => ({
    ...contract,
    quote: {
      ...contract.quote,
      book: contract.quote.book.map((level) => ({
        ...level,
        bid: level.bid + (index % 3) * 8,
        ask: level.ask + (index % 3) * 8,
        second: end177.second,
      })),
      quality: quality177,
    },
  }));
  const atEnd177 = {
    ...opened177.session,
    now: end177,
    momentSnapshot: {
      at: end177,
      spot: fx177.baseSession.startSnapshot.spot,
      contracts: endContracts177,
      capitalInputs: fx177.capitalInputs,
      quality: quality177,
    },
  };
  const endEvidence177 = structuredClone(fx177.evidence);
  endEvidence177.now = end177;
  const shut177 = closePortfolioPosition(atEnd177, endEvidence177, opened177.positionId);
  const out177 = closeoutPortfolioSession(shut177.session, endEvidence177, {
    at: end177, startEvidence: fx177.evidence,
  });

  const dir177 = await fs.mkdtemp(path.join(os.tmpdir(), 'options-radar-final-xlsx-'));
  try {
    const saved177 = await savePortfolioDossier(dir177, out177.session, out177.dossier, {
      savedAt: 177_000,
    });
    const loaded177 = await loadPortfolioDossierSave(dir177, out177.session.id);
    const restored177 = loaded177.record;
    const book177 = portfolioDossierWorkbook(restored177.session, restored177.dossier, {
      generatedAt: 177_177,
    });

    check('پیش‌شرط: پرونده کامل از سرور بازیابی و سپس دفترکار ساخته می‌شود',
      opened177.ok && shut177.ok && out177.ok && saved177.ok && loaded177.ok && book177.ok,
      book177.why || loaded177.why);
    check('manifest نسخه، واحد، روابط و هشدار آموزشی را صریح می‌کند', (() => {
      const rows = byName(book177, 'راهنمای AI')?.rows || [];
      return rows.some((row) => row[0] === 'schema' && row[2] === book177.version)
        && rows.some((row) => row[0] === 'units' && /ریال/.test(row[2]))
        && rows.some((row) => row[0] === 'warning' && /نه توصیه مالی/.test(row[2]))
        && rows.some((row) => row[0] === 'لات‌های FIFO' && /تراکنش/.test(row[4]));
    })());
    check('هویت‌های بازیابی‌شده بدون تولید شناسه تازه در برگ‌ها می‌مانند', (() => {
      const transactions = byName(book177, 'تراکنش‌ها').rows;
      const executions = byName(book177, 'اجراها').rows;
      const lots = byName(book177, 'لات‌های FIFO').rows;
      const eventIds = new Set(restored177.session.events.map((row) => row.id));
      const transactionIds = new Set(restored177.session.events.map((row) => row.transactionId));
      const executionIds = new Set(restored177.session.events.flatMap((row) => row.executions)
        .map((row) => row.id));
      return transactions.every((row) => eventIds.has(row[0]) && transactionIds.has(row[1]))
        && executions.every((row) => executionIds.has(row[0]) && transactionIds.has(row[1]))
        && lots.length === 1 && lots[0][0] === opened177.lotId
        && lots[0][1] === opened177.positionId && lots[0][2] === opened177.transactionId;
    })());
    check('مأموریت، تخصیص، snapshot و کیفیت بازار شروع جدا و عدد خام‌اند',
      byName(book177, 'مأموریت').rows.some((row) => row[0]
        === 'lockedMission.risk.maxLossPct' && row[1] === WIDE_RISK.maxLossPct)
      && byName(book177, 'تخصیص‌ها').rows.some((row) => row[0] === 'single'
        && row[2] === 80 && row[3] === 8_000_000)
      && byName(book177, 'عکس شروع').rows.some((row) => row[0] === 'spotRial'
        && row[2] === fx177.baseSession.startSnapshot.spot && row[4] === 'ریال')
      && byName(book177, 'قراردادهای شروع').rows.every((row) => row[0]
        && Number.isFinite(row[6]) && row[11] === 'executable'));
    check('تراکنش، پا، اجرا، FIFO و همه اجزای مالی ورود و خروج مستقل‌اند', (() => {
      const transactions = byName(book177, 'تراکنش‌ها').rows;
      const open = transactions.find((row) => row[3] === 'open');
      const close = transactions.find((row) => row[3] === 'close');
      const lot = byName(book177, 'لات‌های FIFO').rows[0];
      return Number.isFinite(open[9]) && Number.isFinite(open[10])
        && Number.isFinite(open[13]) && Number.isNaN(open[14])
        && Number.isFinite(close[14]) && Number.isFinite(close[16])
        && Number.isFinite(close[17]) && Number.isNaN(close[18]) && close[20]
        && byName(book177, 'پاها').rows.length === byName(book177, 'اجراها').rows.length
        && lot[4] === 2 && lot[5] === 0 && lot[6] === 2
        && lot[7] === shut177.transactionId;
    })());
    check('مسیر سرمایه فقط نقاط تغییر را با تایم‌فریم، حجم، درگیر و آزاد نگه می‌دارد', (() => {
      const rows = byName(book177, 'مسیر سرمایه').rows;
      return rows.length === restored177.session.events.length + 1
        && rows.every((row) => row[1] === 'daily')
        && rows[0][6] === 'start' && rows[0][7] === 0 && rows[0][8] === 0
        && rows[1][7] === 2 && rows[1][8] > 0 && rows[1][12] < 10_000_000
        && rows.at(-1)[7] === -2 && rows.at(-1)[8] === 0
        && Number.isFinite(rows.at(-1)[13]) && Number.isNaN(rows.at(-1)[14]);
    })());
    check('رتبه کاربر، صدک، بهترین/بدترین و بی‌رتبه‌ها با مبنای یکسان صادر می‌شوند', (() => {
      const ranked = byName(book177, 'رتبه نهایی').rows;
      const without = byName(book177, 'بدون رتبه').rows;
      return ranked.length === restored177.dossier.finalRanking.ranked.length
        && without.length === restored177.dossier.finalRanking.withoutRank.length
        && ranked.some((row) => row[11] === 'بله' && Number.isFinite(row[2])
          && Number.isFinite(row[3]))
        && ranked.some((row) => row[12] === 'بهترین')
        && ranked.some((row) => row[12] === 'بدترین')
        && ranked.every((row) => row[13] === `${session177.start.date}:${session177.start.second}`
          && row[14] === `${end177.date}:${end177.second}`);
    })());

    const bytes177 = await buildXlsx(book177.sheets);
    const members177 = zipMembers(bytes177);
    const workbook177 = members177.get('xl/workbook.xml') || '';
    const relations177 = members177.get('xl/_rels/workbook.xml.rels') || '';
    const shared177 = members177.get('xl/sharedStrings.xml') || '';
    check('ZIP/XML واقعی همه برگ‌ها و رابطه یک‌به‌یک معتبر دارد',
      bytes177[0] === 0x50
      && (workbook177.match(/<sheet /g) || []).length === book177.sheets.length
      && (relations177.match(/relationships\/worksheet/g) || []).length === book177.sheets.length
      && shared177.includes(restored177.session.id)
      && shared177.includes(opened177.positionId)
      && shared177.includes(opened177.transactionId)
      && shared177.includes(opened177.lotId));
    check('فایل کامل فشرده و بدون جدول خام تکراری زیر سقف صریح می‌ماند',
      bytes177.length > 0 && bytes177.length < 80_000, `اندازه ${bytes177.length} بایت`);
  } finally {
    await fs.rm(dir177, { recursive: true, force: true });
  }
  check('دایرکتوری دقیق آزمون Excel نهایی پاک می‌شود',
    await fs.access(dir177).then(() => false, () => true));
}
