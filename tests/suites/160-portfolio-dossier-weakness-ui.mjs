// ۱۶۰. کارت ضعف‌های مستند در پرونده

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { portfolioDossierWeaknesses } from '../../core/portfolio-dossier-weakness.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';
import { portfolioDossierWeaknessView } from '../../ui/portfolio-dossier-weakness-view.mjs';

group('۱۶۰. کارت ضعف‌های مستند در پرونده');
{
  const fx160 = portfolioFixture('dossier-weakness-ui-160');
  const mission160 = fx160.sessionWith(BULLISH_OUTLOOK, WIDE_RISK);
  const closed160 = closeoutPortfolioSession(mission160, fx160.evidence, { force: true });
  const dossier160 = JSON.parse(JSON.stringify(closed160.dossier));
  dossier160.positions = { total: 1, open: 1, closed: 0, openIds: ['p-160'], openQty: 2 };
  dossier160.alerts = [
    { code: 'margin', label: 'وجه تضمین', state: 'breached', stateLabel: 'شکسته', limitRial: 5_000_000, currentRial: 5_500_000 },
    { code: 'loss', label: 'زیان', state: 'near', stateLabel: 'نزدیک شکستن', limitPct: 20, currentPct: 18 },
    { code: 'value', label: 'ارزش‌گذاری', state: 'unknown', stateLabel: 'نامعلوم', why: 'قیمت کافی نیست' },
  ];
  const model160 = portfolioDossierWeaknessView(
    portfolioDossierWeaknesses(closed160.session, dossier160),
  );
  check('مدل چندشدتی ردیف‌های قابل نمایش دارد',
    model160.ok && ['critical', 'warning', 'notice']
      .every((severity) => model160.rows.some((row) => row.severity === severity)));
  check('شاهدهای پولی و درصدی پیش از DOM قالب شده‌اند',
    model160.rows.flatMap((row) => row.evidence).some((row) => row.valueText.includes('تومان'))
    && model160.rows.flatMap((row) => row.evidence).some((row) => row.valueText.endsWith('٪')));

  const calmSession160 = JSON.parse(JSON.stringify(mission160));
  calmSession160.lockedMission.objective.targetReturnPct = 0;
  const calmClosed160 = closeoutPortfolioSession(calmSession160, fx160.evidence, {
    at: calmSession160.end,
  });
  const calm160 = portfolioDossierWeaknessView(
    portfolioDossierWeaknesses(calmClosed160.session, calmClosed160.dossier),
  );
  check('مدل آرام پیام دارد ولی ردیف ساختگی ندارد',
    calm160.ok && calm160.quiet && calm160.rows.length === 0
    && calm160.summaryText.includes('یافته‌ای ندارد'));

  const tab160 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('کارت یافته و خانه‌هایش در پرونده هستند',
    ['pt-dossier-weakness', 'pt-dossier-weakness-title',
      'pt-dossier-weakness-summary', 'pt-dossier-weakness-rows']
      .every((id) => tab160.includes(`id="${id}"`)));
  check('تب استخراج‌گر و مدل نمایش موجود را مصرف می‌کند',
    tab160.includes("from '../../core/portfolio-dossier-weakness.mjs'")
    && tab160.includes("from '../portfolio-dossier-weakness-view.mjs'")
    && /portfolioDossierWeaknesses\(view\.session, view\.dossier\)/.test(tab160)
    && /portfolioDossierWeaknessView\(/.test(tab160));
  check('همان paintDossier مشترک کارت را رسم می‌کند',
    (tab160.match(/function paintDossier\b/g) || []).length === 1
    && tab160.includes('paintDossier(persisted.view)')
    && tab160.includes('paintDossier(restored)'));
  check('کد فنی دیده نمی‌شود و فقط صفت ممیزی است',
    /data-code="\$\{esc\(row\.code\)\}"/.test(tab160)
    && !/>\$\{esc\(row\.code\)\}</.test(tab160));
  check('عنوان، شدت، شرح و شاهد هر یافته رسم می‌شوند',
    /\$\{esc\(row\.title\)\}/.test(tab160)
    && /\$\{esc\(row\.severityLabel\)\}/.test(tab160)
    && /\$\{esc\(row\.description\)\}/.test(tab160)
    && /row\.evidence\.map/.test(tab160));
  check('تب روی شاهد خام حساب نمی‌کند',
    tab160.includes('${esc(item.valueText)}')
    && !/item\.valueText\s*[*+\-\/]/.test(tab160));

  const css160 = readSrc('../ui/style.css');
  check('سه شدت از سه توکن متمایز می‌آیند',
    /data-severity="critical"[^}]*\{[^}]*var\(--loss\)/.test(css160)
    && /data-severity="warning"[^}]*\{[^}]*var\(--accent\)/.test(css160)
    && /data-severity="notice"[^}]*\{[^}]*var\(--muted\)/.test(css160));
  check('کارت رنگ سخت‌کدشده ندارد',
    !/\.pt-dossier-weakness[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(css160));
  check('خروجی آرام ردیف‌خانه خالی را پنهان می‌کند',
    /\.pt-dossier-weakness-rows:empty \{ display: none; \}/.test(css160));
  check('موبایل یک‌ستونه و بدون عرض اجباری است',
    /\.pt-dossier-weakness-rows \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css160)
    && /\.pt-dossier-weakness \{ min-width: 0;/.test(css160));
  check('کارت کنترل تعاملی تازه ندارد',
    !/<(?:button|input|select)[^>]*pt-dossier-weakness/.test(tab160));
}
