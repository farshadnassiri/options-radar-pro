// ۱۶۵. اتصال سرمایه قطعی به فرم جلسه بعد

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { createPortfolioStepOneDraft } from '../../ui/portfolio-mission-form.mjs';
import {
  attachPortfolioCapitalContinuity, portfolioCapitalContinuityView,
} from '../../ui/portfolio-capital-continuity-view.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';

group('۱۶۵. اتصال سرمایه قطعی به فرم جلسه بعد');
{
  const fx165 = portfolioFixture('continuity-ui-165');
  const mission165 = fx165.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const closed165 = closeoutPortfolioSession(mission165, fx165.evidence, { force: true });
  const view165 = portfolioCapitalContinuityView(closed165.session, closed165.dossier);

  check('پرونده کامل، اقدام آماده با سرمایه قطعی می‌سازد',
    view165.ok && view165.available && view165.state === 'ready'
    && view165.capitalText === '۱٬۰۰۰٬۰۰۰ تومان'
    && view165.capitalInputText === '۱٬۰۰۰٬۰۰۰');
  check('نماد، جلسه، سبد و لحظه منشأ برای نمایش آماده‌اند',
    view165.baseText === '۹۰۰۰۰۱'
    && view165.sourceSessionText.includes('۱۶۵')
    && view165.sourcePortfolioText.includes('۱۶۵')
    && view165.closedAtText.includes('۱۴۰۵'));
  check('متن‌های مدل رقم لاتین و واحد ریال ندارند',
    [view165.capitalText, view165.capitalInputText, view165.baseText,
      view165.sourceSessionText, view165.sourcePortfolioText, view165.closedAtText]
      .every((value) => !/[0-9]/.test(value) && !String(value).includes('ریال')));

  const step165 = createPortfolioStepOneDraft({
    id: 'pt-next-165', baseIns: 'new-base',
    capitalToman: view165.capitalInputText, reserveToman: '۰',
    startDate: 20260621, startSecond: 36_000,
    endDate: 20260622, endSecond: 43_200,
    grain: 'daily', createdAt: 2_000,
  });
  const attached165 = attachPortfolioCapitalContinuity(step165.draft, view165.continuity);
  check('lineage فقط به draft تازه و هم‌سرمایه وصل می‌شود',
    attached165.ok
    && attached165.draft.capitalContinuity.sourceSessionId === closed165.session.id
    && attached165.draft.session.capital.initialRial === view165.continuity.finalCapitalRial);
  check('شناسه جلسه و سبد تازه از منشأ مستقل‌اند',
    attached165.draft.session.id !== view165.continuity.sourceSessionId
    && attached165.draft.session.portfolioId !== view165.continuity.sourcePortfolioId);
  check('اتصال، draft یا قرارداد ورودی را mutate نمی‌کند', (() => {
    const draft = structuredClone(step165.draft);
    const continuity = structuredClone(view165.continuity);
    const beforeDraft = JSON.stringify(draft), beforeContinuity = JSON.stringify(continuity);
    const out = attachPortfolioCapitalContinuity(draft, continuity);
    return out.ok && JSON.stringify(draft) === beforeDraft
      && JSON.stringify(continuity) === beforeContinuity
      && out.draft.capitalContinuity !== continuity;
  })());
  check('سرمایه دست‌کاری‌شده و شناسه تکراری رد می‌شوند', (() => {
    const wrong = createPortfolioStepOneDraft({
      id: 'pt-wrong-165', baseIns: 'new-base', capitalToman: '۹۹۹', reserveToman: '۰',
      startDate: 20260621, startSecond: 36_000, endDate: 20260622, endSecond: 43_200,
      grain: 'daily',
    });
    const duplicate = { ...step165.draft, session: { ...step165.draft.session, id: closed165.session.id } };
    return !attachPortfolioCapitalContinuity(wrong.draft, view165.continuity).ok
      && !attachPortfolioCapitalContinuity(duplicate, view165.continuity).ok;
  })());

  check('سرمایه صفر exhausted است و اقدام قابل کلیک نمی‌سازد', (() => {
    const session = structuredClone(closed165.session);
    session.capital.initialRial = 1_000;
    const dossier = structuredClone(closed165.dossier);
    dossier.realized.totalRial = -1_000;
    const view = portfolioCapitalContinuityView(session, dossier);
    return view.ok && !view.available && view.state === 'exhausted'
      && view.capitalText === '۰ تومان' && view.why.includes('صفر');
  })());
  check('پرونده ناقص هیچ سرمایه یا lineage برای فرم نمی‌دهد', (() => {
    const dossier = structuredClone(closed165.dossier);
    dossier.positions = { total: 1, open: 1, closed: 0, openIds: ['open'], openQty: 1 };
    const view = portfolioCapitalContinuityView(closed165.session, dossier);
    return !view.ok && !view.available && view.capitalText === '—' && view.continuity === null;
  })());

  const model165 = readSrc('../ui/portfolio-capital-continuity-view.mjs');
  check('مدل نمایش فقط قرارداد هسته و formatter مشترک را مصرف می‌کند',
    model165.includes('portfolioCapitalContinuity(session, dossier)')
    && model165.includes("from './fmt.mjs'") && model165.includes("from './portfolio-clock-view.mjs'"));
  check('مدل نمایش fetch، DOM یا محاسبه دوباره سرمایه ندارد',
    !/fetch\(|document\.|window\.|initialCapitalRial\s*\+|realizedRial\s*\+/.test(model165));

  const tab165 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('کارت تداوم، منشأ، وضعیت و اقدام دسترس‌پذیر دارد',
    ['pt-capital-continuity', 'pt-capital-continuity-title',
      'pt-capital-continuity-amount', 'pt-capital-continuity-source',
      'pt-capital-continuity-state', 'pt-capital-continuity-do']
      .every((id) => tab165.includes(`id="${id}"`))
    && tab165.includes('aria-describedby="pt-capital-continuity-state"'));
  check('پرونده زنده و بازیابی‌شده همان paintDossier و مدل را مصرف می‌کنند',
    (tab165.match(/function paintDossier\b/g) || []).length === 1
    && tab165.includes('paintDossier(persisted.view)')
    && tab165.includes('paintDossier(restored)')
    && /portfolioCapitalContinuityView\(view\.session, view\.dossier\)/.test(tab165));
  check('اقدام فقط سرمایه را پر و نماد و تاریخ‌ها را خالی می‌کند',
    /capital\.value = view\.capitalInputText;/.test(tab165)
    && /reserve\.value = '۰';/.test(tab165)
    && /base\.value = '';/.test(tab165)
    && /\$\('pt-start-date'\)\.dataset\.value = '';/.test(tab165)
    && /\$\('pt-end-date'\)\.dataset\.value = '';/.test(tab165));
  check('میان‌بر کارت‌های جمع‌شده مرحله نخست را برای ویرایش باز می‌کند',
    /root\.querySelectorAll\('\[data-pt-setup\]'\)\.forEach/.test(tab165)
    && /card\.dataset\.collapsed = 'false';/.test(tab165));
  check('شناسه تازه یک بار ساخته و کلیک تکراری بی‌اثر می‌شود',
    /capitalContinuitySeed\?\.sourceSessionId === view\.continuity\.sourceSessionId/.test(tab165)
    && /draftId = `pt-ui-\$\{Date\.now\(\)\}-\$\{continuityDraftCounter\}`/.test(tab165)
    && /\$\('pt-capital-continuity-do'\)\.disabled = true;/.test(tab165));
  check('draft مرحله نخست قرارداد را از آداپتر خالص می‌گیرد',
    /attachPortfolioCapitalContinuity\(made\.draft, capitalContinuitySeed\)/.test(tab165));
  check('ویرایش دستی سرمایه lineage خودکار را جدا می‌کند',
    /capital\.oninput = \(\) => \{\s*capitalContinuitySeed = null;/.test(tab165)
    && /\$\('pt-capital-source'\)\.hidden = true;/.test(tab165));

  const css165 = readSrc('../ui/style.css');
  check('کارت و بنر منشأ فقط رنگ توکنی و عرض منعطف دارند',
    /\.pt-capital-continuity \{ min-width: 0;/.test(css165)
    && /\.pt-capital-source \{ min-width: 0;/.test(css165)
    && !/\.pt-capital-(?:continuity|source)[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(css165));
  check('کارت در موبایل یک‌ستونه و اقدام تمام‌عرض است',
    /\.pt-capital-continuity-source \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css165)
    && /\.pt-capital-continuity button \{ justify-self: stretch; width: 100%; \}/.test(css165));
}
