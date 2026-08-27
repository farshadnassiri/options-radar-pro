// ۱۶۹. گزارش چندجلسه‌ای روند سرمایه در Excel پرونده

import { inflateRawSync } from 'node:zlib';
import { check, group, readSrc } from '../harness.mjs';
import { portfolioCapitalContinuity } from '../../core/portfolio-capital-continuity.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  downloadPortfolioDossier, portfolioDossierWorkbook,
} from '../../ui/portfolio-dossier-export.mjs';
import { buildXlsx } from '../../ui/xlsx.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

const clone = (value) => structuredClone(value);
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

function close169(id, initialCapitalRial, realizedRial) {
  const fx = portfolioFixture(id);
  const mission = clone(fx.sessionWith(BULLISH_OUTLOOK, WIDE_RISK));
  mission.capital.initialRial = initialCapitalRial;
  mission.capital.allocatableRial = initialCapitalRial - mission.capital.reserveRial;
  const closed = closeoutPortfolioSession(mission, fx.evidence, { force: true });
  closed.dossier.realized.totalRial = realizedRial;
  return closed;
}

group('۱۶۹. گزارش چندجلسه‌ای روند سرمایه در Excel پرونده');
{
  const first169 = close169('growth-export-169-first', 10_000_000, 2_000_000);
  const firstContinuity169 = portfolioCapitalContinuity(first169.session, first169.dossier);
  const second169 = close169(
    'growth-export-169-second', firstContinuity169.finalCapitalRial, -3_000_000,
  );
  const continuity169 = portfolioCapitalContinuity(second169.session, second169.dossier, {
    previous: firstContinuity169,
  });
  const book169 = portfolioDossierWorkbook(second169.session, second169.dossier, {
    generatedAt: 169, capitalContinuity: continuity169,
  });
  const growth169 = byName(book169, 'روند سرمایه');

  check('پرونده دوم یک برگ نسخه‌دار با دو سفر قدیم به جدید دارد',
    book169.ok && growth169 && growth169.rows.length === 2
    && growth169.rows[0][0] === 1 && growth169.rows[0][1] === 1
    && growth169.rows[0][2] === first169.session.id
    && growth169.rows[1][1] === 2 && growth169.rows[1][2] === second169.session.id);
  check('هویت، لحظه و عددهای خام ریال در ستون‌های مستقل می‌مانند',
    growth169.rows[1][3] === second169.session.portfolioId
    && growth169.rows[1][4] === second169.session.baseIns
    && growth169.rows[1][5] === `${second169.session.closedAt.date}:${second169.session.closedAt.second}`
    && growth169.rows[1][6] === 12_000_000
    && growth169.rows[1][7] === -3_000_000
    && growth169.rows[1][8] === 9_000_000);
  check('تغییر سفر و تجمعی از مدل core با درصد خام و کد پایدار صادر می‌شوند',
    growth169.rows[0][9] === 2_000_000 && growth169.rows[0][10] === 20
    && growth169.rows[0][12] === 'growth'
    && growth169.rows[1][9] === -3_000_000 && growth169.rows[1][10] === -25
    && growth169.rows[1][12] === 'decline'
    && growth169.rows[1][13] === -1_000_000 && growth169.rows[1][14] === -10);

  const single169 = portfolioDossierWorkbook(first169.session, first169.dossier, {
    capitalContinuity: firstContinuity169,
  });
  check('پرونده مستقل با continuity خودش دقیقاً یک سفر صادر می‌کند',
    byName(single169, 'روند سرمایه').rows.length === 1);
  const legacy169 = portfolioDossierWorkbook(first169.session, first169.dossier);
  check('پرونده بدون continuity خروجی پیشین معتبر و بدون ردیف ساختگی می‌گیرد',
    legacy169.ok && !byName(legacy169, 'روند سرمایه') && legacy169.sheets.length === 8);

  const corrupt169 = clone(continuity169);
  corrupt169.lineage[1].initialCapitalRial -= 1;
  let calls169 = 0;
  const rejected169 = await downloadPortfolioDossier(second169.session, second169.dossier, {
    capitalContinuity: corrupt169,
    downloadImpl: async () => { calls169 += 1; return 1; },
  });
  const foreign169 = await downloadPortfolioDossier(first169.session, first169.dossier, {
    capitalContinuity: continuity169,
    downloadImpl: async () => { calls169 += 1; return 1; },
  });
  check('continuity خراب یا متعلق به پرونده دیگر پیش از ساخت blob رد می‌شود',
    !rejected169.ok && !foreign169.ok && calls169 === 0);

  const bytes169 = await buildXlsx(book169.sheets);
  const members169 = zipMembers(bytes169);
  check('فایل واقعی xlsx برگ روند و خانه‌های آن را در بسته معتبر دارد',
    bytes169[0] === 0x50 && members169.get('xl/workbook.xml')?.includes('روند سرمایه')
    && members169.get('xl/worksheets/sheet4.xml')?.includes('<sheetData>')
    && members169.get('xl/sharedStrings.xml')?.includes('تغییر تجمعی (درصد)'));

  const source169 = readSrc('../ui/portfolio-dossier-export.mjs');
  check('exporter فقط مدل رشد و نویسنده و sheet splitting موجود را مصرف می‌کند',
    source169.includes("from '../core/portfolio-capital-growth.mjs'")
    && /portfolioCapitalGrowth\(capitalContinuity\)/.test(source169)
    && /sheetParts\('روند سرمایه'/.test(source169)
    && !/function\s+portfolioCapitalGrowth|function\s+buildXlsx/.test(source169));
}
