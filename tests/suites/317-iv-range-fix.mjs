// ۳۱۷. «بازه و تایم‌فریم کار نمی‌کند و نمودار را نمی‌سازد» (۱۴۰۵/۰۷/۱۱)
//
// بازتولید: پاسخ `/api/vol/intraday` برای هر روزِ ضبط‌شده پشت سرِ هم منتظر
// دامنهٔ مجاز آن روز از بالادست می‌ماند (اولویت پایین، پشت رصد لحظه‌ای) و
// رابط روی «در حال دریافت…» می‌ماند؛ هر تغییر بازه یا تایم‌فریم درخواست قبلی
// را لغو می‌کرد و تازه هم همان‌طور گیر می‌کرد. و دکمهٔ ساخت بازهٔ گشاد را
// می‌ساخت، روزهای در صف «ساخته‌نشده» می‌ماندند و نظرسنجی آغاز نمی‌شد، و
// روزِ شکست‌خورده علتی نداشت.
//
//   الف  سرور واقعی: پاسخ بی انتظار برای بالادست، و روزهای در صف علامت دارند
//   ب    منبع: دامنه در پس‌زمینه، شکست با علت، ساخت فقط روزهای نمایش‌داده

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import { recordFrame } from '../../core/iv-record.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UA = '90000000000317';
const DAY = 20240107;           // یکشنبه، روز معاملاتی؛ هیچ داده‌ای از آن در مخزن نیست
const PENDING = 20240108;
const liveFile = path.join(ROOT, 'data', 'iv-live', `${DAY}.jsonl`);

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close((e) => (e ? reject(e) : resolve(port))); });
  });
}
async function waitUntilReady(origin, child) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`سرور آزمایش زود بسته شد: ${child.exitCode}`);
    try { if ((await fetch(`${origin}/api/vol/calendar`)).ok) return; } catch { /* هنوز نه */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('سرور آزمایش آماده نشد');
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => { const t = setTimeout(resolve, 2000); child.once('exit', () => { clearTimeout(t); resolve(); }); child.kill(); });
}

group('۳۱۷-الف. سرور واقعی: بازه بی انتظار برای بالادست');
{
  const hadFile = fs.existsSync(liveFile);
  let child = null;
  try {
    if (!hadFile) {
      let prev = null, text = '';
      for (const second of [32460, 33300, 34200]) {
        const r = recordFrame([{ uaInsCode: UA, strikePrice: 10000, expiryGregorian: 20240221, insCode_C: '90000000000318', pDrCotVal_UA: 10000, pClosing_UA: 10000, qTotTran5J_UA: second,
          pMeDem_C: 990, pMeOf_C: 1010, pDrCotVal_C: 1000, qTotTran5J_C: second }], { second, prev });
        prev = r.state; text += `${JSON.stringify(r.frame)}\n`;
      }
      fs.mkdirSync(path.dirname(liveFile), { recursive: true });
      fs.writeFileSync(liveFile, text);
    }
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    await waitUntilReady(origin, child);
    const t0 = Date.now();
    const got = await (await fetch(`${origin}/api/vol/intraday?ua=${UA}&from=${DAY}&to=${PENDING}&grain=m15&mode=trades`)).json();
    const ms = Date.now() - t0;
    const rec = got.days?.find((d) => d.date === DAY);
    check('پاسخ بی انتظار برای دامنهٔ مجاز بالادست (زیر ۳ ثانیه)', ms < 3000 && rec?.source === 'record' && rec.moments.length > 0, `${ms}ms`);
    check('دامنهٔ هنوز نرسیده «نامعلوم» است و برچسب دارد، نه خطا', rec?.limits === null && rec?.limitsPending === true);
    const pend = got.days?.find((d) => d.date === PENDING);
    check('روز ضبط‌نشده: «ساخته‌نشده»، هزینهٔ هر روز گزارش می‌شود', pend?.source === 'pending' && pend.queued === false && got.cost?.perDay > 0);
    const queued = await (await fetch(`${origin}/api/vol/intraday?ua=${UA}&from=${PENDING}&to=${PENDING}&grain=m15&mode=trades&build=1`)).json();
    check('با build=1 همان پاسخ روزهای در صف را علامت می‌زند (تا رابط نظرسنجی کند)', queued.days?.[0]?.queued === true && (queued.build?.running || queued.build?.queued));
  } catch (e) {
    check('آزمون سرور واقعی اجرا شد', false, String(e?.message || e));
  } finally {
    await stop(child);
    if (!hadFile) { try { fs.unlinkSync(liveFile); } catch { /* رفته */ } }
  }
}

group('۳۱۷-ب. منبع');
{
  const server = readSrc('../server/server.mjs');
  const ep = server.slice(server.indexOf("p === '/api/vol/intraday'"), server.indexOf("p === '/api/history/universe'"));
  check('مسیر بازه منتظر دامنهٔ مجاز نمی‌ماند', !ep.includes('await thresholdLimits(') && ep.includes('limits: limitsNow(ua, day)'));
  check('روز شکست‌خورده با علت برمی‌گردد و فقط ساخت دوباره امتحانش می‌کند', ep.includes("source: 'failed', why: failed.why") && server.includes('ivBuildFailed.set(key, { why: String(e.message || e), at: Date.now() });'));
  check('خطای شبکهٔ پایه با «روزِ خالی» یکی نیست', server.includes('ریزمعاملهٔ پایه دریافت نشد') && server.includes('خالی آمد (تعطیل، توقف نماد یا سهمیهٔ بالادست)'));
  const view = readSrc('../ui/iv-charts-view.mjs');
  const load = view.slice(view.indexOf('async function fetchRangeSeries('), view.indexOf('/** وضعیت روزهای نمایش‌داده'));
  check('رابط: ساخت فقط روزهای نمایش‌داده (نه بازهٔ گشاد)', load.includes('const from = build && rangeView?.key === rangeKey(span) && rangeView.firstDay ? rangeView.firstDay : span.from;'));
  check('رابط: پاسخ ناهمخوان بی‌صدا گیر نمی‌کند', !load.includes("String(body.ins || '') !== ins) return;") && load.includes("throw new Error('پاسخ سرور مال نماد دیگری بود')"));
  check('رابط: کندی سرور گفته می‌شود', load.includes('سرور هنوز پاسخ نداده'));
  check('رابط: «رسم نمودار» روزهای ضبط‌نشده را با هزینهٔ نوشته‌شده می‌سازد', view.includes('if (go) loadRange({ build: go.dataset.build === \'1\' });') && view.includes('`رسم نمودار و ساخت روزهای ضبط‌نشده (حدود ${faDigits(fmt.int(st.cost))} درخواست)`'));
  check('رابط: تا وقتی روزی در صف است نظرسنجی ادامه دارد', view.includes('if (st.building || st.queued) arm();'));
}
