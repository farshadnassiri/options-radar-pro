// ۱۵۸. کارت سرمایه و هدف در پرونده

import { check, group, readSrc } from '../harness.mjs';
import { closeoutPortfolioSession } from '../../core/portfolio-closeout.mjs';
import { portfolioDossierAnalysis } from '../../core/portfolio-dossier-analysis.mjs';
import {
  BULLISH_OUTLOOK, WIDE_RISK, portfolioFixture,
} from '../fixtures/portfolio.mjs';
import { portfolioDossierAnalysisView } from '../../ui/portfolio-dossier-analysis-view.mjs';

group('۱۵۸. کارت سرمایه و هدف در پرونده');
{
  const fx158 = portfolioFixture('dossier-analysis-ui-158');
  const closed158 = closeoutPortfolioSession(
    fx158.sessionWith(BULLISH_OUTLOOK, WIDE_RISK), fx158.evidence, { force: true },
  );
  const full158 = portfolioDossierAnalysisView(
    portfolioDossierAnalysis(closed158.session, closed158.dossier),
  );
  check('مدل کامل همه عددهای کارت را آماده می‌کند',
    full158.ok && full158.complete && full158.initialText.includes('تومان')
    && full158.realizedText.includes('تومان') && full158.finalText.includes('تومان')
    && full158.returnBaseText.includes('تومان') && full158.targetGapText.includes('تومان'));
  check('حکم و لحن فاصله از مدل می‌آیند',
    full158.targetState === 'missed' && full158.targetStateLabel === 'هدف محقق نشد'
    && full158.targetTone === 'loss');

  const open158 = JSON.parse(JSON.stringify(closed158.dossier));
  open158.positions = { total: 1, open: 1, closed: 0, openIds: ['position-open'], openQty: 1 };
  const unknown158 = portfolioDossierAnalysisView(
    portfolioDossierAnalysis(closed158.session, open158),
  );
  check('حالت نامعلوم خط تیره دارد و حکم شکست هدف نمی‌سازد',
    unknown158.ok && !unknown158.complete && unknown158.finalText === '—'
    && unknown158.realizedReturnText === '—' && unknown158.targetGapText === '—'
    && unknown158.targetState === null && unknown158.targetStateLabel === 'نتیجه نامعلوم');
  check('علت نامعلوم برای نمایش آماده است',
    unknown158.issues.some((row) => row.code === 'openPositions' && row.label.includes('تعهد')));

  const tab158 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('کارت و خانه‌هایش در نشانه‌گذاری پرونده هستند',
    ['pt-dossier-analysis', 'pt-dossier-analysis-title', 'pt-dossier-analysis-figures',
      'pt-dossier-analysis-state', 'pt-dossier-analysis-issues']
      .every((id) => tab158.includes(`id="${id}"`)));
  check('تب موتور و مدل نمایش موجود را مصرف می‌کند',
    tab158.includes("from '../../core/portfolio-dossier-analysis.mjs'")
    && tab158.includes("from '../portfolio-dossier-analysis-view.mjs'")
    && /portfolioDossierAnalysis\(view\.session, view\.dossier\)/.test(tab158)
    && /portfolioDossierAnalysisView\(analysis\)/.test(tab158));
  check('هر دو مسیر همان paintDossier مشترک را مصرف می‌کنند',
    (tab158.match(/function paintDossier\b/g) || []).length === 1
    && tab158.includes('paintDossier(persisted.view)')
    && tab158.includes('paintDossier(restored)'));
  check('علت‌های نامعلوم زیر کارت رسم می‌شوند',
    /analyzed\.issues\.map/.test(tab158) && /issues\.hidden =/.test(tab158));
  check('تب روی عددهای ریالی تحلیل حساب نمی‌کند', (() => {
    const start = tab158.indexOf('function paintDossier');
    const end = tab158.indexOf("$('pt-closeout').onclick", start);
    const code = tab158.slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return !/analysis\.[A-Za-z]+Rial\s*[*+\-\/]/.test(code)
      && !/view\.dossier[^;\n]*[*+\-\/]/.test(code);
  })());

  const shown158 = [full158.initialText, full158.realizedText, full158.finalText,
    full158.returnBaseText, full158.targetReturnText, full158.targetGapText,
    unknown158.finalText, unknown158.targetStateLabel];
  check('متن کارت رقم لاتین و ریال ندارد',
    shown158.every((value) => !/[0-9]/.test(value) && !String(value).includes('ریال')));

  const css158 = readSrc('../ui/style.css');
  check('رنگ کارت فقط از توکن‌های موجود می‌آید',
    /\.pt-dossier-analysis-figures dd\.gain \{ color: var\(--gain\)/.test(css158)
    && /\.pt-dossier-analysis-figures dd\.loss \{ color: var\(--loss\)/.test(css158)
    && !/\.pt-dossier-analysis[^{]*\{[^}]*#[0-9a-fA-F]{3}/.test(css158));
  check('کارت در موبایل یک‌ستونه و بدون عرض اجباری می‌شود',
    /\.pt-dossier-analysis-figures \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css158)
    && /\.pt-dossier-analysis \{ min-width: 0;/.test(css158));
  check('کارت کنترل تعاملی تازه ندارد',
    !/<(?:button|input|select)[^>]*pt-dossier-analysis/.test(tab158));
}
