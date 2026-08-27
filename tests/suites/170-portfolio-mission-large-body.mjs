// ۱۷۰. ذخیره HTTP مأموریت فعال با snapshot واقعی بزرگ

import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import { makeDataQuality } from '../../core/data-quality.mjs';
import {
  activatePortfolioMissionDraft, createPortfolioAllocationDraft,
  createPortfolioMissionDraft, createPortfolioOutlookDraft,
  createPortfolioRiskDraft, createPortfolioStepOneDraft,
} from '../../ui/portfolio-mission-form.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERAL_LIMIT = 1024 * 1024;
const MISSION_LIMIT = 16 * 1024 * 1024;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitUntilReady(origin, child) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`سرور آزمایش زود بسته شد: ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/portfolio/sessions`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('سرور آزمایش در مهلت مقرر آماده نشد');
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill();
  });
}

function activeDraft170(id) {
  const setup = createPortfolioStepOneDraft({
    id, baseIns: '900001', capitalToman: '1000000000', reserveToman: '0',
    startDate: 20260622, startSecond: 9 * 3600,
    endDate: 20260722, endSecond: 12 * 3600,
    grain: 'halfHour', createdAt: 170,
  });
  const outlook = createPortfolioOutlookDraft(setup.draft, {
    direction: 'bullish', targetPriceToman: '12000', rangeLowToman: '11000',
    rangeHighToman: '13000', volatilityView: 'higher', expectedVolatilityPct: '40',
    confidencePct: '70', thesis: 'آزمون snapshot بزرگ مأموریت فعال',
  });
  const risk = createPortfolioRiskDraft(outlook.draft, {
    maxLossPct: '10', maxDrawdownPct: '20', minFreeCapitalPct: '10',
    maxMarginUsePct: '50', allowUnlimitedRisk: 'no',
    minUnderlyingDailyValueToman: '10000000', minOptionDailyValueToman: '1000000',
    minOpenInterest: '10', maxSpreadPct: '8', maxBookTakePct: '30',
    requireFullBook: 'no',
  });
  const allocation = createPortfolioAllocationDraft(risk.draft, [
    { familyId: 'income', pct: '50' },
  ]);
  const mission = createPortfolioMissionDraft(allocation.draft, {
    objectiveMode: 'growth', returnBase: 'initial',
    targetReturnPct: '10', maxHoldingDays: '20',
  });
  const snapshot = {
    quality: makeDataQuality({
      kind: 'observed', source: 'mission-large-body-test',
      asOf: setup.draft.session.start, sufficient: true,
    }),
    bodyLimitProbe: 'پ'.repeat(600_000),
  };
  return activatePortfolioMissionDraft(mission.draft, snapshot);
}

group('۱۷۰. ذخیره HTTP مأموریت فعال با snapshot واقعی بزرگ');
{
  const serverSrc = readSrc('../server/server.mjs');
  const sessionStart = serverSrc.indexOf("if (p === '/api/portfolio/session')");
  const sessionEnd = serverSrc.indexOf("if (p === '/api/bereket/sessions')", sessionStart);
  const sessionRoute = serverSrc.slice(sessionStart, sessionEnd);

  check('سقف ۱۶ مگابایتی نام‌دار و مستقل برای مأموریت تعریف شده است',
    serverSrc.includes('const PORTFOLIO_MISSION_MAX_BODY = 16 * 1024 * 1024;'));
  check('فقط PUT مأموریت از سقف اختصاصی خودش استفاده می‌کند',
    sessionRoute.includes('readBody(req, PORTFOLIO_MISSION_MAX_BODY)')
    && serverSrc.split('readBody(req, PORTFOLIO_MISSION_MAX_BODY)').length === 2);
  check('سقف عمومی و سقف پرونده پایان دست‌نخورده‌اند',
    serverSrc.includes('const MAX_BODY = 1024 * 1024;')
    && serverSrc.includes('const PORTFOLIO_DOSSIER_MAX_BODY = 16 * 1024 * 1024;')
    && serverSrc.includes('readBody(req, PORTFOLIO_DOSSIER_MAX_BODY)'));
  check('اعتبارسنج نسخه، هویت و ذخیره‌ساز مأموریت پس از خواندن بدنه می‌مانند',
    sessionRoute.includes('body.schemaVersion !== PORTFOLIO_MISSION_SAVE_VERSION')
    && sessionRoute.includes('body.draft?.session?.id !== id')
    && sessionRoute.includes('savePortfolioMissionDraft(PORTFOLIO_MISSION_DIR'));

  const tag = `large-170-${process.pid}-${Date.now()}`;
  const active = activeDraft170(tag);
  const payload = JSON.stringify({ schemaVersion: 1, draft: active.draft });
  const payloadBytes = Buffer.byteLength(payload);
  const id = active.draft.session.id;
  const savedFile = path.join(ROOT, 'data', 'portfolio-missions', `${id}.json`);
  const oversizeId = `${id}-oversize`;
  const oversizeFile = path.join(ROOT, 'data', 'portfolio-missions', `${oversizeId}.json`);
  let child = null;

  check('چیدمان معتبر active واقعاً از سقف عمومی بزرگ‌تر و از حد مأموریت کوچک‌تر است',
    active.ok && payloadBytes > GENERAL_LIMIT && payloadBytes < MISSION_LIMIT,
    active.why || `${payloadBytes} بایت`);

  try {
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/server.mjs'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    await waitUntilReady(origin, child);

    const put = await fetch(`${origin}/api/portfolio/session?id=${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload,
    });
    const putBody = await put.json();
    check('PUT واقعی مأموریت active بزرگ را پس از اعتبارسنجی ذخیره می‌کند',
      put.status === 200 && putBody?.id === id && putBody?.step === 'active',
      `${put.status}: ${putBody?.error || ''}`);

    const get = await fetch(`${origin}/api/portfolio/session?id=${encodeURIComponent(id)}`);
    const restored = await get.json();
    check('GET همان snapshot بزرگ را در draft و قفل جلسه بدون تغییر برمی‌گرداند',
      get.status === 200
      && restored.draft?.snapshot?.bodyLimitProbe?.length === 600_000
      && restored.draft?.session?.startSnapshot?.bodyLimitProbe?.length === 600_000
      && JSON.stringify(restored.draft.snapshot) === JSON.stringify(active.draft.snapshot));

    const unknownVersion = JSON.stringify({
      schemaVersion: 99, draft: active.draft,
    });
    const invalid = await fetch(`${origin}/api/portfolio/session?id=${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: unknownVersion,
    });
    const invalidBody = await invalid.json();
    check('بدنه بزرگ همچنان نسخه ناشناخته را با خطای اعتبارسنجی رد می‌کند',
      invalid.status === 400 && invalidBody?.error?.includes('نسخه ذخیره مأموریت'));

    const overLimitBody = JSON.stringify({ padding: 'x'.repeat(MISSION_LIMIT) });
    const tooLarge = await fetch(`${origin}/api/portfolio/session?id=${encodeURIComponent(oversizeId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: overLimitBody,
    });
    const tooLargeBody = await tooLarge.json();
    check('بالاتر از سقف مأموریت ۴۱۳ فارسی می‌گیرد و فایل نمی‌سازد',
      tooLarge.status === 413
      && tooLargeBody?.error === `بدنه درخواست از سقف ${MISSION_LIMIT} بایت گذشت`
      && await fs.access(oversizeFile).then(() => false, () => true),
      `${tooLarge.status}: ${tooLargeBody?.error || ''}`);

    const general = await fetch(`${origin}/api/settings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(GENERAL_LIMIT) }),
    });
    const generalBody = await general.json();
    check('endpoint عمومی همچنان بالاتر از یک مگابایت را رد می‌کند',
      general.status === 413
      && generalBody?.error === `بدنه درخواست از سقف ${GENERAL_LIMIT} بایت گذشت`,
      `${general.status}: ${generalBody?.error || ''}`);
  } catch (error) {
    check('سرور آزمایش مأموریت بزرگ بدون خطای اجرایی کامل می‌شود', false,
      error?.stack || error?.message);
  } finally {
    await stop(child);
    await fs.rm(savedFile, { force: true });
    await fs.rm(oversizeFile, { force: true });
  }

  check('فایل‌های دقیق آزمایش پس از پایان پاک می‌شوند',
    await fs.access(savedFile).then(() => false, () => true)
    && await fs.access(oversizeFile).then(() => false, () => true));
}
