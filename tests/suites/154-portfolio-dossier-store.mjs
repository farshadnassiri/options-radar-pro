// ۱۵۴. ماندگاری پروندهٔ پایان جلسه

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';
import {
  PORTFOLIO_DOSSIER_SAVE_VERSION, createPortfolioDossierSave,
  listPortfolioDossierSaves, loadPortfolioDossierSave,
  restorePortfolioDossierSave, savePortfolioDossier,
} from '../../server/portfolio-dossier-store.mjs';
import { listDossiers, loadDossier, saveDossier } from '../../ui/portfolio-dossier-data.mjs';

group('۱۵۴. ماندگاری پروندهٔ پایان جلسه');
{
  const fx154 = portfolioFixture('dossier-154');
  const closed154 = closeoutPortfolioSession(fx154.baseSession, fx154.evidence, { force: true });
  check('پیش‌شرط: موتور جلسه را می‌بندد و پرونده می‌سازد', closed154.ok, closed154.why);
  const made154 = createPortfolioDossierSave(closed154.session, closed154.dossier, { savedAt: 1_000 });
  check('پرونده با نسخه، شناسه و زمان سرور بسته‌بندی می‌شود',
    made154.ok && made154.record.schemaVersion === PORTFOLIO_DOSSIER_SAVE_VERSION
    && made154.record.id === closed154.session.id && made154.record.savedAt === 1_000,
    made154.why);
  check('نسخه ناشناخته خوانده نمی‌شود', (() => {
    const row = JSON.parse(JSON.stringify(made154.record));
    row.schemaVersion = 99;
    return !restorePortfolioDossierSave(row).ok;
  })());
  check('نسخه ناشناخته خود پرونده هم رد می‌شود', (() => {
    const row = JSON.parse(JSON.stringify(made154.record));
    row.dossier.version = 99;
    return !restorePortfolioDossierSave(row).ok;
  })());
  check('شناسه رکورد، جلسه و پرونده باید یکی باشد', (() => {
    const row = JSON.parse(JSON.stringify(made154.record));
    row.dossier.sessionId = 'dossier-other';
    return !restorePortfolioDossierSave(row).ok;
  })());
  check('شناسه پیمایش مسیر پیش از ساخت نام فایل رد می‌شود',
    !createPortfolioDossierSave(
      { ...closed154.session, id: '../escape' },
      { ...closed154.dossier, sessionId: '../escape' }, { savedAt: 1_001 },
    ).ok);

  const temp154 = fs.mkdtempSync(path.join(os.tmpdir(), 'options-radar-dossier-store-'));
  try {
    const first154 = await savePortfolioDossier(
      temp154, closed154.session, closed154.dossier, { savedAt: 2_000 },
    );
    const loaded154 = await loadPortfolioDossierSave(temp154, closed154.session.id);
    check('پرونده ذخیره و بدون حدس بازیابی می‌شود',
      first154.ok && loaded154.ok
      && JSON.stringify(first154.record) === JSON.stringify(loaded154.record));
    const overwrite154 = await savePortfolioDossier(
      temp154, closed154.session, closed154.dossier, { savedAt: 3_000 },
    );
    check('پرونده موجود بی‌صدا بازنویسی نمی‌شود',
      !overwrite154.ok && overwrite154.conflict === true);

    const fxLater154 = portfolioFixture('dossier-154-later');
    const laterAt154 = {
      date: Number(fxLater154.baseSession.end.date) + 1,
      second: fxLater154.baseSession.end.second,
    };
    const later154 = closeoutPortfolioSession(
      fxLater154.baseSession, fxLater154.evidence, { at: laterAt154, force: true },
    );
    await savePortfolioDossier(temp154, later154.session, later154.dossier, { savedAt: 1_500 });
    fs.writeFileSync(path.join(temp154, 'broken.json'), '{', 'utf8');
    const listed154 = await listPortfolioDossierSaves(temp154);
    check('فهرست بر اساس زمان بستن مرتب است، نه زمان ذخیره',
      listed154.ok && listed154.records[0].id === later154.session.id
      && listed154.records[1].id === closed154.session.id);
    check('فایل خراب کل فهرست را نمی‌شکند و با نام خودش رد می‌شود',
      listed154.records.some((row) => row.id === 'broken' && row.broken && row.why));
  } finally {
    fs.rmSync(temp154, { recursive: true, force: true });
  }

  const jsonResponse = (status, body) => ({
    ok: status >= 200 && status < 300, status, json: async () => body,
  });
  const offline154 = await saveDossier(closed154.session, closed154.dossier, {
    fetchImpl: async () => { throw new Error('شبکه قطع است'); },
  });
  check('قطع شبکه هرگز شبیه ذخیره موفق نیست',
    !offline154.ok && offline154.savedAt === null && /شبکه قطع/.test(offline154.why));
  const conflict154 = await saveDossier(closed154.session, closed154.dossier, {
    fetchImpl: async () => jsonResponse(409, { error: 'پرونده از پیش هست' }),
  });
  check('بازنویسی سمت سرور به‌عنوان تعارض برمی‌گردد',
    !conflict154.ok && conflict154.conflict === true);
  const lying154 = await saveDossier(closed154.session, closed154.dossier, {
    fetchImpl: async () => jsonResponse(200, { ok: true }),
  });
  check('پاسخ ۲۰۰ بدون زمان ثبت موفق حساب نمی‌شود',
    !lying154.ok && lying154.savedAt === null);
  let body154 = null;
  const good154 = await saveDossier(closed154.session, closed154.dossier, {
    fetchImpl: async (url, options) => {
      body154 = JSON.parse(options.body);
      return jsonResponse(200, { ok: true, savedAt: 4_000 });
    },
  });
  check('ذخیره موفق فقط با مدرک زمان سرور برمی‌گردد', good154.ok && good154.savedAt === 4_000);
  check('نسخه و دو سند کامل در بدنه فرستاده می‌شوند',
    body154?.schemaVersion === 1 && body154.session?.state === 'closed'
    && body154.dossier?.sessionId === closed154.session.id);
  const listedUi154 = await listDossiers({
    fetchImpl: async () => jsonResponse(200, { dossiers: [{ id: closed154.session.id }] }),
  });
  check('کلاینت فهرست پرونده‌ها را می‌خواند', listedUi154.ok && listedUi154.dossiers.length === 1);
  const missing154 = await loadDossier('dossier-missing', {
    fetchImpl: async () => jsonResponse(404, { error: 'پرونده پیدا نشد' }),
  });
  check('پرونده نبوده صریح گزارش می‌شود', !missing154.ok && missing154.notFound === true);

  const server154 = readSrc('../server/server.mjs');
  check('سرور دو مسیر فهرست و پرونده دارد و حذف ارائه نمی‌کند',
    server154.includes("p === '/api/portfolio/dossiers'")
    && server154.includes("p === '/api/portfolio/dossier'")
    && /savePortfolioDossier\(\s*PORTFOLIO_DOSSIER_DIR/.test(server154)
    && !server154.includes("p === '/api/portfolio/dossier' && req.method === 'DELETE'"));
}
