// ۱۷۳. سفر یک‌میلیاردی — رفت‌وبرگشت کامل جلسه active

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
import { resumeMissionRecord } from '../../ui/portfolio-mission-resume.mjs';
import { portfolioSessionEligibility } from '../../ui/portfolio-eligibility.mjs';
import { portfolioSessionProposals } from '../../ui/portfolio-proposals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

group('۱۷۳. سفر یک‌میلیاردی — رفت‌وبرگشت کامل جلسه active');
{
  const id = `billion-173-${process.pid}-${Date.now()}`;
  const setup = createPortfolioStepOneDraft({
    id, baseIns: 'IRO1KHOD0001', capitalToman: '1000000000', reserveToman: '100000000',
    startDate: 20260521, startSecond: 9 * 3600 + 30 * 60,
    endDate: 20260621, endSecond: 12 * 3600,
    grain: 'halfHour', createdAt: 173,
  });
  const outlook = createPortfolioOutlookDraft(setup.draft, {
    direction: 'bullish', targetPriceToman: '4250', rangeLowToman: '3800',
    rangeHighToman: '4500', volatilityView: 'higher', expectedVolatilityPct: '38.5',
    confidencePct: '72', thesis: 'فرض صریح کاربر برای سفر یک‌میلیاردی',
  });
  const risk = createPortfolioRiskDraft(outlook.draft, {
    maxLossPct: '9', maxDrawdownPct: '14', minFreeCapitalPct: '10',
    maxMarginUsePct: '65', allowUnlimitedRisk: 'yes',
    minUnderlyingDailyValueToman: '25000000000',
    minOptionDailyValueToman: '250000000', minOpenInterest: '50',
    maxSpreadPct: '7.5', maxBookTakePct: '25', requireFullBook: 'yes',
  });
  const allocation = createPortfolioAllocationDraft(risk.draft, [
    { familyId: 'income', pct: '30' },
    { familyId: 'vertical', pct: '40' },
    { familyId: 'vol', pct: '30' },
  ]);
  const mission = createPortfolioMissionDraft(allocation.draft, {
    objectiveMode: 'growth', returnBase: 'initial',
    targetReturnPct: '18', maxHoldingDays: '31',
  });
  const qualityReasons = [
    'دفتر سفارش کامل همان لحظه در آرشیو موجود نیست',
    'قیمت قابل اجرای همه قراردادها قابل اثبات نیست',
  ];
  const snapshot = {
    universe: { rows: [], quality: makeDataQuality({
      kind: 'missing', source: 'watch-archive', asOf: setup.draft.session.start,
      reasons: qualityReasons,
    }) },
    quality: makeDataQuality({
      kind: 'missing', source: 'portfolio-start-feed', asOf: setup.draft.session.start,
      reasons: qualityReasons,
    }),
    contracts: [], spot: null,
    // کاراکتر فارسی دو بایت UTF-8 است؛ snapshot واقعاً از یک مگابایت می‌گذرد.
    archiveEvidence: 'پ'.repeat(600_000),
  };
  const active = activatePortfolioMissionDraft(mission.draft, snapshot);
  const payload = JSON.stringify({ schemaVersion: 1, draft: active.draft });
  const payloadBytes = Buffer.byteLength(payload);
  const savedFile = path.join(ROOT, 'data', 'portfolio-missions', `${id}.json`);
  let child = null;

  check('تمام مراحل سفر یک‌میلیاردی معتبر ساخته می‌شوند',
    setup.ok && outlook.ok && risk.ok && allocation.ok && mission.ok && active.ok,
    [setup, outlook, risk, allocation, mission, active].find((row) => !row.ok)?.why || '');
  check('یک میلیارد تومان دقیقاً ده میلیارد ریال می‌ماند',
    active.draft?.session?.capital?.initialRial === 10_000_000_000);
  check('تخصیص ۳۰/۴۰/۳۰ بدون باقیمانده و بازتوزیع پنهان قفل می‌شود',
    active.draft?.session?.lockedAllocations?.map((row) => row.pct).join('/') === '30/40/30'
    && active.draft.session.capital.unassignedRial === 0);
  check('بدنه active واقعاً بزرگ‌تر از یک مگابایت است', payloadBytes > 1024 * 1024,
    `${payloadBytes} بایت`);

  try {
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/server.mjs'], {
      cwd: ROOT, env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    });
    await waitUntilReady(origin, child);

    const put = await fetch(`${origin}/api/portfolio/session?id=${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload,
    });
    const putBody = await put.json();
    check('سرور فقط پس از اعتبارسنجی active پاسخ موفق و زمان ثبت می‌دهد',
      put.status === 200 && putBody?.id === id && putBody?.step === 'active'
      && putBody?.state === 'active' && Number.isInteger(putBody?.savedAt),
      `${put.status}: ${putBody?.error || ''}`);

    const listedResponse = await fetch(`${origin}/api/portfolio/sessions`);
    const listed = await listedResponse.json();
    const matching = (listed.sessions || []).filter((row) => row.id === id);
    check('refresh همان یک جلسه را در فهرست با مرحله active می‌بیند',
      listedResponse.ok && matching.length === 1
      && matching[0].step === 'active' && matching[0].state === 'active');

    const get = await fetch(`${origin}/api/portfolio/session?id=${encodeURIComponent(id)}`);
    const restored = await get.json();
    const resumed = resumeMissionRecord(restored);
    check('GET و ادامه، رکورد active بزرگ را به فرم قفل‌شده برمی‌گردانند',
      get.ok && resumed.ok && resumed.record?.readOnly === true, resumed.why);
    check('هویت Session/Portfolio و سرمایه پس از refresh عیناً ثابت‌اند',
      restored.id === id && restored.draft.session.id === id
      && restored.draft.session.portfolioId === active.draft.session.portfolioId
      && restored.draft.session.capital.initialRial === 10_000_000_000);

    const inputs = resumed.record?.inputs;
    check('نماد، دو لحظه و تایم‌فریم بدون تغییر به ورودی فرم برمی‌گردند',
      inputs?.setup?.baseIns === 'IRO1KHOD0001'
      && inputs.setup.startDate === 20260521 && inputs.setup.startSecond === 34200
      && inputs.setup.endDate === 20260621 && inputs.setup.endSecond === 43200
      && inputs.setup.grain === 'halfHour' && inputs.setup.capitalToman === '1000000000');
    check('انتظار، ریسک، نقدشوندگی و هدف بدون پیش‌فرض تازه بازسازی می‌شوند',
      inputs?.outlook?.targetPriceToman === '4250'
      && inputs.outlook.expectedVolatilityPct === '38.5'
      && inputs.risk.maxLossPct === '9' && inputs.risk.requireFullBook === 'yes'
      && inputs.mission.targetReturnPct === '18' && inputs.mission.maxHoldingDays === '31');
    check('سه تخصیص ۳۰/۴۰/۳۰ پس از JSON/server round-trip همان‌اند',
      inputs?.allocation?.map((row) => `${row.familyId}:${row.pct}`).join('|')
      === 'income:30|vertical:40|vol:30');
    check('snapshot بزرگ و علت‌های کیفیت پس از refresh عیناً حفظ می‌شوند',
      restored.draft.snapshot.archiveEvidence.length === 600_000
      && JSON.stringify(restored.draft.snapshot.quality.reasons)
        === JSON.stringify(active.draft.snapshot.quality.reasons)
      && JSON.stringify(restored.draft.snapshot) === JSON.stringify(active.draft.snapshot));

    const evidence = portfolioSessionEligibility(restored.draft.session);
    const proposals = portfolioSessionProposals(restored.draft.session, evidence);
    check('داده ناکافی هیچ پیشنهاد یا قیمت ساختگی نمی‌سازد',
      evidence.rows.length === 0 && proposals.shortlist.length === 0
      && proposals.setAside.length === 0);

    const secondGet = await fetch(`${origin}/api/portfolio/session?id=${encodeURIComponent(id)}`);
    const secondRecord = await secondGet.json();
    const afterList = await (await fetch(`${origin}/api/portfolio/sessions`)).json();
    check('ادامه و refresh جلسه یا شناسه تازه‌ای نمی‌سازند',
      secondGet.ok && secondRecord.id === id
      && (afterList.sessions || []).filter((row) => row.id === id).length === 1);
  } catch (error) {
    check('مسیر HTTP سفر یک‌میلیاردی بدون خطای اجرایی کامل می‌شود', false,
      error?.stack || error?.message);
  } finally {
    await stop(child);
    await fs.rm(savedFile, { force: true });
  }

  check('فایل دقیق آزمایش پس از پایان پاک می‌شود',
    await fs.access(savedFile).then(() => false, () => true));

  const tabSrc = readSrc('../ui/tabs/portfolio-time.mjs');
  check('autosaveهای مراحل در صف ترتیبی قرار می‌گیرند',
    tabSrc.includes('let persistQueue = Promise.resolve()')
    && tabSrc.includes('persistQueue.then(() => persistNow(next))'));
  const activeHandler = tabSrc.slice(tabSrc.indexOf("$('pt-start-mission').onclick"));
  check('رابط پیش از پاسخ موفق سرور active را رسم و قفل نمی‌کند',
    activeHandler.indexOf('await persist(active.draft)')
      < activeHandler.indexOf('draft = active.draft')
    && activeHandler.includes("if (!saved?.ok) throw new Error"));
  check('ادامه active ساعت، دفتر سرمایه و پیشنهادها را از همان session بازسازی می‌کند',
    /if \(record\.readOnly\)[\s\S]{0,220}paintSnapshot\(record\.session\.startSnapshot\)/.test(tabSrc)
    && /paintEligibility\(record\.session\);\s*paintProposals\(record\.session\)/.test(tabSrc)
    && /paintProposals[\s\S]{0,420}paintClock\(session\);\s*paintLedger\(session\)/.test(tabSrc));
}
