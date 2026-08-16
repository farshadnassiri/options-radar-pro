// نگهبان پیام کامیت.
//
// تاریخچه، تنها جایی است که «چرا» را نگه می‌دارد. دیف می‌گوید چه چیزی عوض
// شد؛ هیچ‌وقت نمی‌گوید چرا آن تصمیم به‌جای تصمیم دیگر گرفته شد. پس بدنه
// اجباری است، نه تعارف.
//
// این نگهبان فقط کامیت‌های تازهٔ همین شاخه را می‌بیند — بازهٔ base..HEAD.
// تاریخچهٔ قدیمی مخزن دست‌نخورده می‌ماند و هرگز اینجا قرمز نمی‌شود.
//
// اجرا:  node tests/commits.mjs
//        BASE_SHA=<sha> node tests/commits.mjs

import { execFileSync } from 'node:child_process';

const MAX_SUBJECT = 72;
const MIN_BODY = 20;
const TYPES = ['feat', 'fix', 'style', 'docs', 'chore', 'test', 'refactor', 'perf'];
const SUBJECT_RE = new RegExp(`^(${TYPES.join('|')})(\\([^)]+\\))?: \\S`);

// این‌ها متادیتای گیت‌اند، نه شرح تغییر. در سنجش طول بدنه حساب نمی‌شوند.
const TRAILER_RE = /^(Co-Authored-By|Signed-off-by|Claude-Session|Generated-by):/i;

let pass = 0, fail = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { pass += 1; results.push(['✔', name, detail]); }
  else { fail += 1; results.push(['✘', name, detail]); }
}
function group(t) { results.push(['—', t, '']); }

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function tryGit(...args) {
  try { return git(...args).trim(); } catch { return null; }
}

// ═════════════════════ یافتن بازهٔ کامیت‌ها ═════════════════════
//
// در CI پایه از خود PR می‌آید. محلی، آخرین main مرجع است.
let base = process.env.BASE_SHA || null;
if (base && !tryGit('rev-parse', '--verify', `${base}^{commit}`)) base = null;
if (!base) base = tryGit('rev-parse', '--verify', 'origin/main^{commit}');
if (!base) base = tryGit('rev-parse', '--verify', 'main^{commit}');

if (!base) {
  // در CI این یعنی checkout کم‌عمق است و نگهبان کور شده — سکوت جایز نیست.
  const msg = 'پایهٔ مقایسه پیدا نشد (origin/main در دسترس نیست)';
  if (process.env.CI) {
    console.error(`\n✘ نگهبان پیام کامیت: ${msg}.`);
    console.error('  در CI باید actions/checkout با fetch-depth: 0 اجرا شود.\n');
    process.exit(1);
  }
  console.log(`\nنگهبان پیام کامیت رد شد: ${msg}. محلی، این خطا نیست.\n`);
  process.exit(0);
}

// جداکننده‌ها با کد فرار خودِ گیت نوشته می‌شوند، نه بایت خام: بایت NUL در
// argv مجاز نیست و Node آن را پس می‌زند — نتیجه‌اش «صفر کامیت» بود، یعنی
// سبزِ دروغین. اینجا خطا هم بلعیده نمی‌شود؛ base از قبل تأیید شده، پس هر
// شکستی در این فرمان یک نقص واقعی است و باید بترکد.
const REC = '\x1e', FLD = '\x1f';
const raw = git('log', '--format=%H%x1f%P%x1f%B%x1e', `${base}..HEAD`);

const commits = raw
  .split(REC)
  .map((r) => r.replace(/^\n+/, ''))
  .filter((r) => r.trim())
  .map((r) => {
    const [sha, parents, ...rest] = r.split(FLD);
    return { sha: sha.trim(), parents: parents.trim().split(/\s+/), message: rest.join(FLD) };
  })
  .filter((c) => c.parents.length < 2);   // کامیت ادغام را گیت‌هاب می‌سازد، نه عامل

// ═════════════════════ سنجش ═════════════════════
group(`کامیت‌های تازه نسبت به ${base.slice(0, 7)} — ${commits.length} مورد`);

if (commits.length === 0) {
  check('چیزی برای سنجش نیست', true, 'شاخه با پایه یکی است');
}

for (const c of commits) {
  const lines = c.message.replace(/\s+$/, '').split('\n');
  const subject = (lines[0] || '').trim();
  const short = c.sha.slice(0, 7);
  const label = subject.length > 30 ? subject.slice(0, 30) + '…' : subject;

  check(`${short} پیشوند و موضوع درست دارد`, SUBJECT_RE.test(subject),
    SUBJECT_RE.test(subject) ? '' : `«${label}» — پیشوند مجاز: ${TYPES.join('، ')}`);

  check(`${short} موضوع از ${MAX_SUBJECT} نویسه بلندتر نیست`, subject.length <= MAX_SUBJECT,
    subject.length > MAX_SUBJECT ? `${subject.length} نویسه` : '');

  const hasBlank = lines.length > 1 && lines[1].trim() === '';
  check(`${short} بین موضوع و بدنه خط خالی دارد`, hasBlank || lines.length === 1,
    !hasBlank && lines.length > 1 ? 'خط دوم باید خالی باشد' : '');

  const body = lines.slice(2)
    .filter((l) => !TRAILER_RE.test(l.trim()))
    .join('\n')
    .trim();
  check(`${short} بدنه دارد و شرح تغییر را می‌گوید`, body.length >= MIN_BODY,
    body.length === 0
      ? `«${label}» بدنه ندارد — بنویسید چه عوض شد و چرا`
      : (body.length < MIN_BODY ? `بدنه فقط ${body.length} نویسه است` : ''));
}

// ═══════════════════════════ گزارش ═══════════════════════════
const W = 62;
console.log('\n' + '═'.repeat(W));
console.log('  نگهبان پیام کامیت');
console.log('═'.repeat(W));
for (const [mark, name, detail] of results) {
  if (mark === '—') { console.log('\n' + name); continue; }
  const pad = name.length > 46 ? name.slice(0, 46) : name.padEnd(46, ' ');
  console.log(` ${mark} ${pad} ${detail}`);
}
console.log('\n' + '─'.repeat(W));
console.log(`  قبول ${pass}   رد ${fail}`);
console.log('─'.repeat(W) + '\n');
process.exit(fail ? 1 : 0);
