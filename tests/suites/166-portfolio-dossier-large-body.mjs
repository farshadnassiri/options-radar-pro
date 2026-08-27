// ۱۶۶. ذخیره HTTP پروندهٔ واقعی بزرگ

import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERAL_LIMIT = 1024 * 1024;
const DOSSIER_LIMIT = 16 * 1024 * 1024;

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
      const response = await fetch(`${origin}/api/portfolio/dossiers`);
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

group('۱۶۶. ذخیره HTTP پروندهٔ واقعی بزرگ');
{
  const serverSrc = readSrc('../server/server.mjs');
  const dossierStart = serverSrc.indexOf("if (p === '/api/portfolio/dossier')");
  const sessionStart = serverSrc.indexOf("if (p === '/api/portfolio/session')", dossierStart);
  const dossierRoute = serverSrc.slice(dossierStart, sessionStart);

  check('سقف ۱۶ مگابایتی نام‌دار و محدود برای پرونده تعریف شده است',
    serverSrc.includes('const PORTFOLIO_DOSSIER_MAX_BODY = 16 * 1024 * 1024;'));
  check('فقط PUT پرونده از سقف اختصاصی استفاده می‌کند',
    dossierRoute.includes('readBody(req, PORTFOLIO_DOSSIER_MAX_BODY)')
    && serverSrc.split('readBody(req, PORTFOLIO_DOSSIER_MAX_BODY)').length === 2);
  check('سقف عمومی یک مگابایت برای endpointهای دیگر پابرجاست',
    serverSrc.includes('const MAX_BODY = 1024 * 1024;')
    && serverSrc.includes("if (p === '/api/settings')")
    && serverSrc.includes("readBody(req, MAX_BODY) || '{}'")
    && sessionStart > dossierStart
    && serverSrc.slice(sessionStart).includes('readBody(req, MAX_BODY)'));
  check('پاسخ ۴۱۳ و اعتبارسنجی نسخه و هویت پرونده دست‌نخورده‌اند',
    serverSrc.includes('if (e instanceof BodyTooLarge) return sendJson(res, 413')
    && dossierRoute.includes('body.schemaVersion !== PORTFOLIO_DOSSIER_SAVE_VERSION')
    && dossierRoute.includes('body.session?.id !== id || body.dossier?.sessionId !== id'));

  const tag = `large-166-${process.pid}-${Date.now()}`;
  const fx = portfolioFixture(tag);
  const mission = fx.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const closed = closeoutPortfolioSession(mission, fx.evidence, { force: true });
  // فیلد افزوده‌شده عمداً بخشی از اسنپ‌شات حسابرسی است؛ بازپخش آن را
  // نادیده نمی‌گیرد یا حذف نمی‌کند، ولی روی منطق مالی اثر هم ندارد.
  closed.session.startSnapshot.bodyLimitProbe = 'پ'.repeat(600_000);
  const payload = JSON.stringify({
    schemaVersion: 1, session: closed.session, dossier: closed.dossier,
  });
  const payloadBytes = Buffer.byteLength(payload);
  const id = closed.session.id;
  const savedFile = path.join(ROOT, 'data', 'portfolio-dossiers', `${id}.json`);
  let child = null;

  check('چیدمان آزمایش واقعاً از سقف عمومی بزرگ‌تر و از سقف پرونده کوچک‌تر است',
    payloadBytes > GENERAL_LIMIT && payloadBytes < DOSSIER_LIMIT, `${payloadBytes} بایت`);

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

    const put = await fetch(`${origin}/api/portfolio/dossier?id=${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload,
    });
    const putBody = await put.json();
    check('PUT واقعی پرونده بزرگ را ذخیره می‌کند',
      put.status === 200 && putBody?.id === id, `${put.status}: ${putBody?.error || ''}`);

    const get = await fetch(`${origin}/api/portfolio/dossier?id=${encodeURIComponent(id)}`);
    const restored = await get.json();
    check('GET واقعی همان پرونده و اسنپ‌شات بزرگ را بدون حذف برمی‌گرداند',
      get.status === 200 && restored?.id === id
      && restored.session?.startSnapshot?.bodyLimitProbe?.length === 600_000);

    const overLimitBody = JSON.stringify({ padding: 'x'.repeat(DOSSIER_LIMIT) });
    const tooLarge = await fetch(`${origin}/api/portfolio/dossier?id=${encodeURIComponent(id)}-oversize`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: overLimitBody,
    });
    const tooLargeBody = await tooLarge.json();
    check('درخواست بزرگ‌تر از سقف اختصاصی با پیام فارسی ۴۱۳ می‌گیرد',
      tooLarge.status === 413
      && tooLargeBody?.error === `بدنه درخواست از سقف ${DOSSIER_LIMIT} بایت گذشت`,
      `${tooLarge.status}: ${tooLargeBody?.error || ''}`);
  } catch (error) {
    check('سرور آزمایش ذخیره بزرگ بدون خطای اجرایی کامل می‌شود', false, error?.stack || error?.message);
  } finally {
    await stop(child);
    await fs.rm(savedFile, { force: true });
  }

  check('فایل دقیق آزمایش پس از پایان پاک می‌شود', await fs.access(savedFile).then(() => false, () => true));
}
