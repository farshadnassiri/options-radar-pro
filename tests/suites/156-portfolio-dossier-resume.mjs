// ۱۵۶. بازکردن پروندهٔ ذخیره‌شده پس از refresh

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';
import { createPortfolioDossierSave } from '../../server/portfolio-dossier-store.mjs';
import {
  closeoutView, dossierRecordView, portfolioDossierView,
} from '../../ui/portfolio-closeout-view.mjs';

group('۱۵۶. بازکردن پروندهٔ ذخیره‌شده پس از refresh');
{
  const fx156 = portfolioFixture('dossier-resume-156');
  const closed156 = closeoutPortfolioSession(fx156.baseSession, fx156.evidence, { force: true });
  const record156 = createPortfolioDossierSave(
    closed156.session, closed156.dossier, { savedAt: 6_000 },
  ).record;
  const live156 = closeoutView(fx156.baseSession, fx156.evidence, { force: true });
  const resumed156 = dossierRecordView(JSON.parse(JSON.stringify(record156)));
  check('پرونده نسخه‌دار سرور به مدل نمایش برمی‌گردد',
    resumed156.ok && resumed156.session.state === 'closed' && resumed156.savedAt === 6_000,
    resumed156.why);
  check('پرونده زنده و خوانده‌شده یک مدل نمایش دارند',
    ['headlineText', 'accountingText', 'positionsText', 'openText']
      .every((key) => resumed156[key] === live156[key])
    && JSON.stringify(resumed156.realized) === JSON.stringify(live156.realized));
  check('نسخه ناشناخته حدس زده نمی‌شود', (() => {
    const row = JSON.parse(JSON.stringify(record156));
    row.schemaVersion = 99;
    const out = dossierRecordView(row);
    return !out.ok && /نسخه/.test(out.why);
  })());
  check('ناهمخوانی شناسه رکورد و پرونده رد می‌شود', (() => {
    const row = JSON.parse(JSON.stringify(record156));
    row.dossier.sessionId = 'dossier-other';
    return !dossierRecordView(row).ok;
  })());
  check('ردیف مالی ناقص با صفر نمایشی پر نمی‌شود', (() => {
    const row = JSON.parse(JSON.stringify(record156));
    row.dossier.realized.rows = [{ id: 'position-1', closedQty: null }];
    return !dossierRecordView(row).ok;
  })());
  check('جمع نامعلوم همان خط تیره می‌ماند، نه صفر', (() => {
    const dossier = JSON.parse(JSON.stringify(closed156.dossier));
    dossier.realized.totalRial = null;
    dossier.realized.unknown = ['position-unknown'];
    const out = portfolioDossierView(closed156.session, dossier);
    return out.ok && out.realized.totalText === '—' && out.realized.tone === '';
  })());

  const tab156 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('فهرست ادامه، جلسه و پرونده را از دو کلاینت داده می‌گیرد',
    /Promise\.all\(\[listMissionSaves\(\), listDossiers\(\)\]\)/.test(tab156)
    && tab156.includes("data-kind=\"dossier\"")
    && tab156.includes("data-kind=\"mission\""));
  check('پرونده خراب در فهرست نام برده ولی انتخاب‌پذیر نیست',
    /data-kind=\"broken\" disabled>پرونده خراب/.test(tab156));
  check('بازکردن پرونده فقط از کلاینت داده عبور می‌کند',
    tab156.includes("from '../portfolio-dossier-data.mjs'")
    && /kind === 'dossier'[\s\S]{0,180}?await loadDossier\(id\)/.test(tab156)
    && !tab156.includes("fetch('/api/portfolio/dossier")
    && !tab156.includes('fetch(`/api/portfolio/dossier'));
  check('خطای خواندن پیش از تغییر وضعیت تب برمی‌گردد', (() => {
    const branch = tab156.indexOf("if (kind === 'dossier')");
    const failed = tab156.indexOf('if (!loaded.ok)', branch);
    const painted = tab156.indexOf("paintProgress('active')", branch);
    const returned = tab156.indexOf('return;', failed);
    return branch >= 0 && failed > branch && returned > failed && painted > returned
      && tab156.includes('پرونده خوانده نشد');
  })());
  check('رکورد ناقص هم پیش از رسم صریح رد می‌شود',
    /const restored = dossierRecordView\(loaded\.record\)[\s\S]{0,160}?if \(!restored\.ok\)/.test(tab156)
    && tab156.includes('این پرونده نمایش‌پذیر نیست'));
  check('پرونده معتبر رسم و همه کنترل‌های زنده خاموش می‌شوند',
    /paintProposals\(restored\.session\)[\s\S]{0,100}?paintDossier\(restored\)/.test(tab156)
    && /\[data-pt-commit\], \[data-pt-close\], \[data-pt-step\]/.test(tab156)
    && /control\.disabled = true/.test(tab156)
    && /\$\('pt-closeout-do'\)\.hidden = true/.test(tab156));
  check('پیام موفق می‌گوید پرونده فقط‌خواندنی است',
    tab156.includes('پرونده بسته‌شده از سرور باز شد؛ همه کنترل‌های معامله فقط‌خواندنی‌اند.'));

  const view156 = readSrc('../ui/portfolio-closeout-view.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('نمایش پرونده قیمت بازار یا شبکه نمی‌خواند',
    !/fetch\(|portfolioSessionEligibility|walkBook|buildChain/.test(view156));
  const shown156 = [resumed156.headlineText, resumed156.accountingText,
    resumed156.positionsText, resumed156.realized.totalText];
  check('متن پرونده رقم لاتین یا ریال ندارد',
    shown156.every((value) => !/[0-9]/.test(value) && !String(value).includes('ریال')));
}
