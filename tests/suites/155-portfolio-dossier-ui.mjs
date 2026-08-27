// ۱۵۵. اتصال ذخیره پرونده به بستن جلسه

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { portfolioFixture } from '../fixtures/portfolio.mjs';
import { closeoutView } from '../../ui/portfolio-closeout-view.mjs';
import { persistDossierView } from '../../ui/portfolio-dossier-data.mjs';

group('۱۵۵. اتصال ذخیره پرونده به بستن جلسه');
{
  const fx155 = portfolioFixture('dossier-ui-155');
  const core155 = closeoutPortfolioSession(fx155.baseSession, fx155.evidence, { force: true });
  const view155 = closeoutView(fx155.baseSession, fx155.evidence, { force: true });
  check('پیش‌شرط: مدل بستن معتبر است', core155.ok && view155.ok, view155.why);
  check('مدل نمایش سند خام موتور را برای ذخیره نگه می‌دارد',
    JSON.stringify(view155.dossier) === JSON.stringify(core155.dossier)
    && view155.dossier.sessionId === view155.session.id);
  check('سند خام، متن نمایشیِ تومان نیست',
    Number.isFinite(view155.dossier.realized.totalRial)
    && !('totalText' in view155.dossier.realized));

  let failedCalls155 = 0;
  const failed155 = await persistDossierView(view155, {
    saveImpl: async () => {
      failedCalls155 += 1;
      return { ok: false, why: 'شبکه قطع است', conflict: false, savedAt: null };
    },
  });
  check('شکست ذخیره مدل موفق یا جلسه بسته پس نمی‌دهد',
    failedCalls155 === 1 && !failed155.ok && failed155.view === null
    && failed155.session === null && failed155.savedAt === null
    && /شبکه قطع/.test(failed155.why));

  const conflict155 = await persistDossierView(view155, {
    saveImpl: async () => ({ ok: false, why: 'پرونده از پیش هست', conflict: true }),
  });
  check('تعارض هم موفق جا زده نمی‌شود',
    !conflict155.ok && conflict155.conflict === true && conflict155.view === null);

  let sentSession155 = null;
  let sentDossier155 = null;
  const saved155 = await persistDossierView(view155, {
    saveImpl: async (session, dossier) => {
      sentSession155 = session;
      sentDossier155 = dossier;
      return { ok: true, why: '', savedAt: 5_000 };
    },
  });
  check('فقط تأیید معتبر سرور مدل و جلسه بسته را تحویل می‌دهد',
    saved155.ok && saved155.savedAt === 5_000 && saved155.view === view155
    && saved155.session === view155.session);
  check('همان جلسه و سند خام برای ذخیره فرستاده می‌شوند',
    sentSession155 === view155.session && sentDossier155 === view155.dossier);
  const invalid155 = await persistDossierView({ ok: true, session: fx155.baseSession });
  check('مدل ناقص اصلاً وارد شبکه نمی‌شود', !invalid155.ok && invalid155.session === null);

  const tab155 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب ذخیره را از مرز داده می‌گیرد و مستقیم fetch نمی‌زند',
    tab155.includes("from '../portfolio-dossier-data.mjs'")
    && tab155.includes('persistDossierView')
    && !tab155.includes("fetch('/api/portfolio/dossier")
    && !tab155.includes('fetch(`/api/portfolio/dossier'));
  check('دستگیره بستن ناهمگام است و ذخیره را منتظر می‌ماند',
    /\$\('pt-closeout'\)\.onclick = async \(\) =>/.test(tab155)
    && /await persistDossierView\(view\)/.test(tab155));
  check('قفل درخواست پیش از await گرفته و پس از آن آزاد می‌شود', (() => {
    const locked = tab155.indexOf('closeoutSaving = true');
    const awaited = tab155.indexOf('await persistDossierView(view)');
    const unlocked = tab155.indexOf('closeoutSaving = false', awaited);
    return locked >= 0 && locked < awaited && awaited < unlocked
      && tab155.includes('if (closeoutSaving) return;');
  })());
  check('در حال ذخیره با متن روشن و دکمه خاموش دیده می‌شود',
    /button\.disabled = true/.test(tab155) && tab155.includes('در حال ذخیره پرونده روی سرور'));
  check('شکست، امکان تلاش دوباره و جلسه فعال قبلی را نگه می‌دارد', (() => {
    const failed = tab155.indexOf('if (!persisted.ok)');
    const assigned = tab155.indexOf('proposalSession = persisted.session');
    const retry = tab155.indexOf('button.disabled = false', failed);
    const returned = tab155.indexOf('return;', failed);
    return failed >= 0 && retry > failed && returned > retry && assigned > returned
      && tab155.includes('paintCloseout(proposalSession)')
      && tab155.includes('پرونده روی سرور ثبت نشد');
  })());
  check('جلسه محلی و کنترل‌ها فقط پس از موفقیت عوض می‌شوند',
    /proposalSession = persisted\.session[\s\S]{0,220}?control\.disabled = true/.test(tab155)
    && /paintDossier\(persisted\.view\)/.test(tab155));
}
