// ۱۳۸. بستن موقعیت در تب

import { check, group, readSrc } from '../harness.mjs';
import { BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture } from '../fixtures/portfolio.mjs';
import { portfolioRankedPlans } from '../../core/portfolio-plans.mjs';
import { commitPortfolioPlan } from '../../core/portfolio-commit.mjs';
import { closePortfolioPosition } from '../../core/portfolio-close.mjs';
import {
  closeDoneText, closeFailureText, portfolioSessionPositionsView,
} from '../../ui/portfolio-positions-view.mjs';

group('۱۳۸. بستن موقعیت در تب');
{
  const fx138 = portfolioFixture('close-ui-138');
  const roomy138 = JSON.parse(JSON.stringify(fx138.baseSession));
  roomy138.lockedAllocations = [
    { familyId: 'single', pct: 80, targetRial: 8_000_000 },
    { familyId: 'vol', pct: 20, targetRial: 2_000_000 },
  ];
  const session138 = {
    ...roomy138,
    lockedMission: fx138.sessionWith(BULLISH_OUTLOOK, WIDE_RISK).lockedMission,
  };
  const done138 = commitPortfolioPlan(session138, fx138.evidence,
    portfolioRankedPlans(session138, fx138.evidence).ranking.ranked[0].candidateId);
  check('پیش‌شرط: یک طرح ثبت شد', done138.ok, done138.why);
  const posId138 = done138.positionId;

  // ── بند ۱: دکمه فقط روی موقعیت باز ──────────────────────────────────
  const openView138 = portfolioSessionPositionsView(done138.session);
  check('موقعیت باز، بستنی علامت می‌خورد',
    openView138.rows[0].closable === true && openView138.rows[0].statusLabel === 'باز');
  const closed138 = closePortfolioPosition(done138.session, fx138.evidence, posId138);
  check('پیش‌شرط: موقعیت بسته شد', closed138.ok, closed138.why);
  const closedView138 = portfolioSessionPositionsView(closed138.session);
  check('موقعیت بسته، دکمهٔ بستن نمی‌گیرد',
    closedView138.rows[0].closable === false
    && closedView138.rows[0].statusLabel === 'بسته');

  // ── بند ۵: خبر موفقیت با علامت درست ─────────────────────────────────
  const doneText138 = closeDoneText(closed138);
  check('خبر بستن کامل، حجم و نقد و کارمزد را می‌گوید',
    doneText138.includes('موقعیت بسته شد') && doneText138.includes('نقد خروج')
    && doneText138.includes('کارمزد') && doneText138.includes('تومان'), doneText138);
  // نقدِ مثبت یعنی پول وارد شد. عوض‌کردن علامت در لایهٔ نمایش یعنی ساختن
  // عددی که موتور نگفته.
  check('علامت نقد خروج دست‌نخورده می‌ماند',
    closed138.exitCashRial > 0 && !doneText138.includes('نقد خروج −'), doneText138);
  const part138 = closePortfolioPosition(done138.session, fx138.evidence, posId138, { qty: 10 });
  const partText138 = closeDoneText(part138);
  check('خروج جزئی «حجم کم شد» می‌گوید و باقی‌مانده را نشان می‌دهد',
    partText138.includes('حجم کم شد') && partText138.includes('باقی‌مانده'), partText138);
  check('و خروج کامل باقی‌مانده نشان نمی‌دهد',
    !doneText138.includes('باقی‌مانده'), doneText138);
  check('نتیجهٔ ناموفق، خبر موفقیت نمی‌سازد',
    closeDoneText({ ok: false }) === '' && closeDoneText(null) === '');

  // ── بند ۳: شکست با علت، و عددِ ممکن ─────────────────────────────────
  const thin138 = JSON.parse(JSON.stringify(fx138.evidence));
  for (const row of thin138.rows) row.executableQty = 7;
  const thinOut138 = closePortfolioPosition(done138.session, thin138, posId138);
  check('پیش‌شرط: دفتر کم‌عمق، خروج را رد می‌کند',
    !thinOut138.ok && thinOut138.reason === 'insufficientBook', thinOut138.why);
  const thinText138 = closeFailureText(thinOut138);
  check('متن شکست، بیشترین حجم ممکن را می‌گوید',
    thinText138.includes('بیشترین حجم ممکن') && thinText138.includes('۷')
    && thinText138.includes('۴۰'), thinText138);
  const tooBig138 = closePortfolioPosition(done138.session, fx138.evidence, posId138, { qty: 41 });
  check('حجم بیش از حد، علت خودش را می‌گوید',
    closeFailureText(tooBig138).includes('حجم باز'), closeFailureText(tooBig138));
  check('علت‌های دیگر هم متن می‌گیرند، نه سکوت',
    closeFailureText(closePortfolioPosition(closed138.session, fx138.evidence, posId138))
      .includes('بسته'));
  check('نتیجهٔ موفق، متن شکست نمی‌سازد',
    closeFailureText(closed138) === '' && closeFailureText(null) === '');

  // ── بند ۴: رقم فارسی، واحد تومان ────────────────────────────────────
  const texts138 = [doneText138, partText138, thinText138,
    closeFailureText(tooBig138)];
  check('هیچ رقم لاتینی در متن‌های بستن نیست',
    texts138.every((value) => !/[0-9]/.test(value)),
    texts138.filter((v) => /[0-9]/.test(v)).slice(0, 2).join(' | ') || 'هیچ');
  const viewCode138 = readSrc('../ui/portfolio-positions-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const rialMath138 = viewCode138.match(/Rial[A-Za-z]*\s*[*+\-]/g) || [];
  const rialDiv138 = (viewCode138.match(/Rial[A-Za-z]*\s*\/\s*[0-9]+/g) || [])
    .filter((hit) => !/\/\s*10$/.test(hit));
  check('لایهٔ نمایش روی عدد ریالی جز تقسیم بر ده حساب نمی‌کند',
    rialMath138.length === 0 && rialDiv138.length === 0,
    [...rialMath138, ...rialDiv138].join(' ،') || 'هیچ');
  check('و خودش موتور بستن را صدا نمی‌زند — فقط نتیجه‌اش را قالب می‌دهد',
    !/closePortfolioPosition/.test(viewCode138));

  // ── اتصال به تب ─────────────────────────────────────────────────────
  const tabSrc138 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب موتور بستن و متن‌هایش را وارد می‌کند',
    /closePortfolioPosition/.test(tabSrc138)
    && /closeFailureText/.test(tabSrc138) && /closeDoneText/.test(tabSrc138)
    && /from '\.\.\/\.\.\/core\/portfolio-close\.mjs'/.test(tabSrc138));
  const positionsHead138 = tabSrc138
    .slice(tabSrc138.indexOf('<table class="pt-positions-table">'));
  const headCells138 = (positionsHead138.slice(0, positionsHead138.indexOf('</thead>'))
    .match(/<th>/g) || []).length;
  const emptySpans138 = [...tabSrc138.matchAll(/pt-positions-empty"><td colspan="(\d+)"/g)]
    .map((hit) => Number(hit[1]));
  check('ستون بستن در سرستون جدول هست',
    tabSrc138.includes('<th>بستن</th>') && tabSrc138.includes('data-label="بستن"'));
  check('و colspan هر ردیف خالی با شمار سرستون‌ها می‌خواند',
    headCells138 > 0 && emptySpans138.length > 0
    && emptySpans138.every((span) => span === headCells138),
    `${emptySpans138.join(' ،')} در برابر ${headCells138}`);
  check('دکمه فقط برای ردیف بستنی ساخته می‌شود',
    /row\.closable[\s\S]{0,120}?data-pt-close=/.test(tabSrc138));
  // بند ۲: پس از بستن، سرمایهٔ آزاد عوض شده است؛ رسم‌کردن فقط جدول
  // موقعیت‌ها یعنی نوار سرمایه عددِ کهنه نشان می‌دهد.
  const handler138 = tabSrc138.slice(tabSrc138.indexOf("$('pt-positions').onclick"));
  check('پس از بستن، هر سه بخش با جلسهٔ تازه دوباره رسم می‌شوند',
    /paintProposals\(done\.session\);/.test(handler138.slice(0, 900)));
  check('و شکست هیچ‌وقت شبیه موفقیت نشان داده نمی‌شود',
    /if \(!done\.ok\)[\s\S]{0,260}?closeFailureText\(done\)[\s\S]{0,80}?return;/
      .test(handler138));
  check('قفل ویرایشگر مأموریت، بخش موقعیت‌ها را غیرفعال نمی‌کند',
    /!control\.closest\('#pt-positions'\)/.test(tabSrc138));
  check('شناسهٔ دستگیره یکتا است',
    (tabSrc138.match(/\$\('pt-positions'\)\.onclick/g) || []).length === 1
    && (tabSrc138.match(/data-pt-close=/g) || []).length === 1);
  check('تب هیچ عدد مالی تازه‌ای برای بستن حساب نمی‌کند',
    !/\/\s*10|exitCashRial\s*[*+\-]/.test(handler138.slice(0, 900)));
}
