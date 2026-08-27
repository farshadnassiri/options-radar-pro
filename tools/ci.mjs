// وضعیت CI روی همان کامیتی که همین الان پوش شده.
//
// چرا هست: نوبت‌های ساعتی در جلسه‌های تازه اجرا می‌شوند و آن جلسه‌ها ابزار
// گیت‌هاب ندارند. بدون این، عامل نمی‌تواند بفهمد پوشش CI را قرمز کرده یا
// نه — و «تا سبز نشده نوبت تمام نیست» تبدیل می‌شود به حرفی که کسی
// نمی‌تواند اجرا کند.
//
// مخزن عمومی است، پس API گیت‌هاب بدون توکن جواب می‌دهد. هیچ وابستگی npm
// و هیچ توکنی لازم نیست.
//
// اجرا:
//   node tools/ci.mjs           وضعیت همین حالا
//   node tools/ci.mjs --wait    منتظر بماند تا اجراها تمام شوند
//
// خروج ۰ یعنی همه سبز · ۱ یعنی دست‌کم یکی قرمز · ۲ یعنی هنوز در حال اجرا
// (فقط بدون `--wait`) · ۳ یعنی نشد پرسید.

import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// `fetch` داخلی نود متغیر HTTPS_PROXY را نمی‌خواند و در محیط پروکسی‌دار
// مستقیم می‌رود و ۴۰۳ می‌گیرد. این متغیر فقط هنگام بالا آمدن نود خوانده
// می‌شود، پس اگر لازم بود همین‌جا خودمان را دوباره اجرا می‌کنیم. عاملی که
// این را نداند، «۴۰۳» را با «CI قرمز» اشتباه می‌گیرد.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && process.env.NODE_USE_ENV_PROXY !== '1') {
  const child = spawnSync(process.execPath, ['--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(child.status ?? 3);
}

const API = 'https://api.github.com';
const WAIT = process.argv.includes('--wait');
const MAX_WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 20 * 1000;

const git = (args) => execSync(`git ${args}`, { encoding: 'utf8' }).trim();

/** `owner/repo` را از remote درمی‌آورد؛ هر دو شکل ssh و https. */
function repoSlug() {
  const url = git('remote get-url origin');
  const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error(`شکل remote شناخته نشد: ${url}`);
  return `${match[1]}/${match[2]}`;
}

async function checkRuns(slug, sha) {
  const res = await fetch(`${API}/repos/${slug}/commits/${sha}/check-runs`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'options-radar-pro-ci' },
  });
  if (!res.ok) throw new Error(`API گیت‌هاب ${res.status}`);
  const body = await res.json();
  return Array.isArray(body.check_runs) ? body.check_runs : [];
}

const MARK = { success: '✔', failure: '✘', cancelled: '✘', timed_out: '✘', neutral: '•', skipped: '•' };

let slug;
let sha;
try {
  slug = repoSlug();
  sha = git('rev-parse HEAD');
} catch (error) {
  console.error(`نشد وضعیت CI را پرسید: ${error.message}`);
  process.exit(3);
}

const started = Date.now();
let runs = [];
for (;;) {
  try {
    runs = await checkRuns(slug, sha);
  } catch (error) {
    console.error(`نشد وضعیت CI را پرسید: ${error.message}`);
    process.exit(3);
  }
  const pending = runs.filter((run) => run.status !== 'completed');
  // فهرست خالی هم انتظار است، نه پایان: گیت‌هاب چند ثانیه پس از پوش هنوز
  // اجرایی ثبت نکرده. اگر اینجا برگردیم، `--wait` دقیقاً در همان لحظه‌ای
  // که بیشترین کاربرد را دارد بی‌فایده می‌شود.
  const settled = runs.length > 0 && pending.length === 0;
  if (!WAIT || settled || Date.now() - started > MAX_WAIT_MS) break;
  const note = runs.length === 0 ? 'هنوز اجرایی ثبت نشده' : `${pending.length} اجرا هنوز تمام نشده`;
  console.log(`… ${note} — دوباره در ${POLL_MS / 1000} ثانیه`);
  await new Promise((resolve) => { setTimeout(resolve, POLL_MS); });
}

if (runs.length === 0) {
  // هنوز شروع نشده هم یعنی «نمی‌دانم»، نه «سبز». این دو را یکی کردن،
  // دقیقاً همان اشتباهی است که نوبت را زودتر تمام‌شده نشان می‌دهد.
  console.log(`CI روی ${sha.slice(0, 7)} — هنوز اجرایی ثبت نشده`);
  process.exit(WAIT ? 1 : 2);
}

for (const run of runs) {
  const mark = run.status === 'completed' ? (MARK[run.conclusion] ?? '✘') : '…';
  console.log(` ${mark} ${run.name} — ${run.status === 'completed' ? run.conclusion : run.status}`);
}

const failed = runs.filter((run) => run.status === 'completed'
  && !['success', 'neutral', 'skipped'].includes(run.conclusion));
const pending = runs.filter((run) => run.status !== 'completed');

if (failed.length) {
  console.log(`\n✘ CI روی ${sha.slice(0, 7)} قرمز است — ${failed.map((r) => r.name).join(' ،')}`);
  for (const run of failed) console.log(`   ${run.html_url}`);
  process.exit(1);
}
if (pending.length) {
  console.log(`\n… CI روی ${sha.slice(0, 7)} هنوز تمام نشده`);
  process.exit(2);
}
console.log(`\n✔ CI روی ${sha.slice(0, 7)} سبز است`);
