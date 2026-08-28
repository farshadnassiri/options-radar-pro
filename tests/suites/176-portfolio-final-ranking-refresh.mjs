// ۱۷۶. پایان بازی، سرمایه نهایی و رتبه پس از refresh

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { check, group, near, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { portfolioDossierAnalysis } from '../../core/portfolio-dossier-analysis.mjs';
import { portfolioFinalRanking } from '../../core/portfolio-final-ranking.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import {
  loadPortfolioDossierSave, savePortfolioDossier,
} from '../../server/portfolio-dossier-store.mjs';
import { dossierRecordView } from '../../ui/portfolio-closeout-view.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';

group('۱۷۶. پایان بازی، سرمایه نهایی و رتبه پس از refresh');
{
  const fx176 = portfolioFixture('final-ranking-176');
  const roomy176 = JSON.parse(JSON.stringify(fx176.baseSession));
  roomy176.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session176 = {
    ...roomy176,
    lockedMission: fx176.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const plans176 = portfolioRankedPlans(session176, fx176.evidence);
  const candidate176 = plans176.ranking.ranked[0].candidateId;
  const opened176 = commitPortfolioPlan(session176, fx176.evidence, candidate176, { quantity: 2 });

  const end176 = { ...session176.end };
  const endQuality176 = makeDataQuality({
    kind: 'executable', source: 'best-limits-history', asOf: end176, sufficient: true,
    details: { levelsKnown: 2, levelsTotal: 2 },
  });
  const endContracts176 = fx176.contracts.map((contract, index) => ({
    ...contract,
    quote: {
      ...contract.quote,
      book: contract.quote.book.map((level) => ({
        ...level,
        bid: level.bid + (index % 3) * 8,
        ask: level.ask + (index % 3) * 8,
        second: end176.second,
      })),
      quality: endQuality176,
    },
  }));
  const atEnd176 = {
    ...opened176.session,
    now: end176,
    momentSnapshot: {
      at: end176, spot: fx176.baseSession.startSnapshot.spot,
      contracts: endContracts176,
      capitalInputs: fx176.capitalInputs,
      quality: endQuality176,
    },
  };
  const endEvidence176 = JSON.parse(JSON.stringify(fx176.evidence));
  endEvidence176.now = end176;
  const shut176 = closePortfolioPosition(atEnd176, endEvidence176, opened176.positionId);
  const out176 = closeoutPortfolioSession(shut176.session, endEvidence176, {
    at: end176, startEvidence: fx176.evidence,
  });
  const ranking176 = out176.dossier.finalRanking;
  const analysis176 = portfolioDossierAnalysis(out176.session, out176.dossier);

  check('پیش‌شرط: پایان فقط پس از آفست واقعی موقعیت ساخته می‌شود',
    opened176.ok && shut176.ok && shut176.status === 'closed'
    && out176.ok && out176.session.state === 'closed', out176.why || shut176.why);
  check('سرمایه نهایی از سود تحقق‌یافته immutable ساخته می‌شود',
    analysis176.complete && Number.isFinite(shut176.realizedRial)
    && analysis176.realizedRial === shut176.realizedRial
    && analysis176.finalCapitalRial
      === analysis176.initialCapitalRial + shut176.realizedRial);
  check('همه گزینه‌های شروع با یک واحد و یک مبنای بازده رتبه می‌گیرند',
    ranking176.ok && ranking176.ranked.length > 1
    && ranking176.ranked.every((row, index) => row.rank === index + 1
      && Number.isFinite(row.returnPct) && row.capitalRial > 0)
    && ranking176.best.rank === 1
    && ranking176.worst.rank === ranking176.ranked.length, ranking176.why);
  check('انتخاب کاربر با رتبه و صدک خودش میان گزینه‌های قابل مقایسه پیدا می‌شود',
    ranking176.selected.length === 1
    && ranking176.selected[0].candidateId === candidate176
    && Number.isInteger(ranking176.selected[0].rank)
    && Number.isFinite(ranking176.selected[0].percentile));
  check('رتبه از گزینه‌های اجراپذیر شروع می‌آید، نه گزینه‌های پایان',
    ranking176.ranked.every((row) => plans176.ranking.ranked
      .some((start) => start.candidateId === row.candidateId)));

  const missingBook176 = JSON.parse(JSON.stringify(atEnd176));
  missingBook176.momentSnapshot.contracts[0].quote.book = null;
  const incomplete176 = portfolioFinalRanking(missingBook176, fx176.evidence);
  check('دفتر پایان گمشده بازده صفر نمی‌گیرد و در بدون‌رتبه با علت می‌ماند',
    incomplete176.ok && incomplete176.withoutRank.length > ranking176.withoutRank.length
    && incomplete176.withoutRank.some((row) => /دفتر پایان/.test(row.why)));
  const staleStart176 = JSON.parse(JSON.stringify(fx176.evidence));
  staleStart176.now.second += 1;
  check('مدرک ناهم‌لحظه شروع اجازه استفاده از آینده را نمی‌دهد',
    portfolioFinalRanking(atEnd176, staleStart176).reason === 'staleStartEvidence');

  const dir176 = await fs.mkdtemp(path.join(os.tmpdir(), 'options-radar-final-ranking-'));
  try {
    const saved176 = await savePortfolioDossier(dir176, out176.session, out176.dossier, {
      savedAt: 7_000,
    });
    const loaded176 = await loadPortfolioDossierSave(dir176, out176.session.id);
    const view176 = loaded176.ok ? dossierRecordView(loaded176.record) : loaded176;
    check('پرونده ابتدا روی سرور ثبت و سپس با همان رتبه‌ها بازیابی می‌شود',
      saved176.ok && loaded176.ok && view176.ok && view176.ranking.available
      && JSON.stringify(loaded176.record.dossier.finalRanking) === JSON.stringify(ranking176));
    check('بهترین، بدترین و انتخاب کاربر پس از refresh آماده نمایش‌اند',
      view176.ranking.best && view176.ranking.worst
      && view176.ranking.selected.length === 1
      && !/[0-9]/.test(view176.ranking.selected[0].rankText));
    check('درخواست تکراری پرونده دوم نمی‌سازد',
      !(await savePortfolioDossier(dir176, out176.session, out176.dossier,
        { savedAt: 8_000 })).ok);
  } finally {
    await fs.rm(dir176, { recursive: true, force: true });
  }
  check('دایرکتوری دقیق آزمون پرونده نهایی پاک می‌شود',
    await fs.access(dir176).then(() => false, () => true));

  const core176 = readSrc('../core/portfolio-final-ranking.mjs');
  check('موتور رتبه از دفتر واقعی پایان می‌خواند و قیمت پایانی/مدل نمی‌سازد',
    /walkBook/.test(core176) && !/lastPrice|closingPrice|pnlAtExpiry|BlackScholes/.test(core176));
  const tab176 = readSrc('../ui/tabs/portfolio-time.mjs');
  const close176 = tab176.slice(tab176.indexOf("$('pt-closeout').onclick"),
    tab176.indexOf('function paintWatch'));
  check('رابط مدرک شروع را جدا می‌سازد و پیش از نمایش پرونده منتظر سرور می‌ماند',
    close176.includes('snapshot: proposalSession.startSnapshot')
    && close176.indexOf('await persistDossierView') < close176.indexOf('paintDossier(persisted.view)'));
}
