// ۱۱۵. پوسته UI مأموریت — مرحله نخست
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { generateCandidates } from '../../core/bereket-candidates.mjs';
import { buildChain, underlyingList } from '../../core/chain.mjs';
import { historyDateLabel } from '../../core/history.mjs';
import {
  createPortfolioStepOneDraft, parseTomanInput, previewPortfolioCapital, tomanToRial,
} from '../../ui/portfolio-mission-form.mjs';


// ═══════════════════════ ۱۱۵. پوسته UI مأموریت — مرحله نخست ═══════════════════════
//
// این برش هنوز پیشنهاد یا فعال‌سازی ندارد. فقط باید ورودی تومان، نماد و
// لحظه را به draft واقعی session تحویل دهد و در رابط فارسی دیده شود.
group('۱۱۵. پوسته UI مأموریت — مرحله نخست');
{
  check('ورودی یک میلیارد تومان با رقم فارسی خوانده می‌شود',
    parseTomanInput('۱٬۰۰۰٬۰۰۰٬۰۰۰') === 1_000_000_000);
  check('رقم عربی و فاصله هم بدون اعشار خوانده می‌شوند',
    parseTomanInput('١ ٢٣٤') === 1234);
  check('متن و اعشار سرمایه عدد معتبر ساخته نمی‌کنند',
    Number.isNaN(parseTomanInput('یک میلیارد')) && Number.isNaN(parseTomanInput('۱۲٫۵')));
  check('تومان فقط یک بار به ریال تبدیل می‌شود', tomanToRial('۱٬۰۰۰') === 10_000);
  check('عدد بیرون بازه امن ریال پذیرفته نمی‌شود', Number.isNaN(tomanToRial(Number.MAX_SAFE_INTEGER)));

  const preview = previewPortfolioCapital({
    capitalToman: '۱٬۰۰۰٬۰۰۰٬۰۰۰', reserveToman: '۲۰۰٬۰۰۰٬۰۰۰',
  });
  check('خلاصه زنده سرمایه از همان مدل session می‌آید',
    preview.ok && preview.plan.initialRial === 10_000_000_000
    && preview.plan.reserveRial === 2_000_000_000
    && preview.plan.allocatableRial === 8_000_000_000);
  check('ذخیره بیشتر از سرمایه در پیش‌نمایش رد می‌شود',
    !previewPortfolioCapital({ capitalToman: '۱۰۰', reserveToman: '۱۰۱' }).ok);

  const stepArgs = {
    id: 'pt-ui-test', baseIns: '900001',
    capitalToman: '۱٬۰۰۰٬۰۰۰٬۰۰۰', reserveToman: '۲۰۰٬۰۰۰٬۰۰۰',
    startDate: 20260521, startSecond: 9 * 3600,
    endDate: 20260621, endSecond: 12 * 3600 + 1800,
    grain: 'halfHour', createdAt: 123,
  };
  const draft = createPortfolioStepOneDraft(stepArgs);
  check('مرحله نخست draft واقعی session می‌سازد',
    draft.ok && draft.draft.step === 'setup' && draft.draft.session.state === 'draft');
  check('سرمایه UI داخل draft ریالی است',
    draft.draft.session.capital.initialRial === 10_000_000_000
    && draft.draft.session.capital.allocatableRial === 8_000_000_000);
  check('تایم‌فریم نیم‌ساعته به هزار و هشتصد ثانیه می‌رسد',
    draft.draft.replay.grain === 'halfHour' && draft.draft.replay.grainSeconds === 1800);
  check('تایم‌فریم نامعتبر بی‌صدا روزانه نمی‌شود',
    !createPortfolioStepOneDraft({ ...stepArgs, grain: 'weekly' }).ok);
  check('پایان پیش از شروع در آداپتر UI هم رد می‌شود',
    !createPortfolioStepOneDraft({ ...stepArgs, endDate: 20260520 }).ok);
  check('نماد خالی draft نمی‌سازد',
    !createPortfolioStepOneDraft({ ...stepArgs, baseIns: '' }).ok);

  const app = readSrc('../ui/app.mjs');
  const icons = readSrc('../ui/icons.mjs');
  const tab = readSrc('../ui/tabs/portfolio-time.mjs');
  const css = readSrc('../ui/style.css');
  check('تب مستقل به‌صورت lazy در ریل ثبت شده',
    app.includes("id: 'portfolio-time'") && app.includes("mod: '/ui/tabs/portfolio-time.mjs'"));
  check('تب آیکون هم‌خانواده سبد دارد', icons.includes("'portfolio-time': 'layers'"));
  check('مرحله نخست همه ورودی‌های خواسته‌شده را دارد',
    ['pt-capital', 'pt-reserve', 'pt-base', 'pt-start-date', 'pt-start-time',
      'pt-end-date', 'pt-end-time', 'pt-grain', 'pt-save-step']
      .every((id) => tab.includes(`id=\"${id}\"`)));
  check('نماد و تاریخ از موتورهای مشترک برنامه می‌آیند',
    tab.includes('buildChain(') && tab.includes('underlyingList(')
    && tab.includes('mountDateWheel(') && tab.includes('/api/dailies?'));
  check('رقم‌های خلاصه از formatter مشترک رابط عبور می‌کنند',
    tab.includes('fmt.int(') && tab.includes('fmt.pct(') && tab.includes('faDigits('));
  check('گذرنامه تاریخ‌های مرور را با برچسب جلالی نشان می‌دهد',
    tab.includes('historyDateLabel(start)') && tab.includes('historyDateLabel(end)'));
  check('خطای ذخیره مرکب به خود فیلد ذخیره نسبت داده می‌شود',
    tab.indexOf("text.includes('ذخیره')") < tab.indexOf("text.includes('سرمایه شروع')"));
  check('مرحله نخست مستقلاً مأموریت یا پیشنهاد تولید نمی‌کند',
    tab.includes('createPortfolioStepOneDraft({') && !tab.includes('generateCandidates'));
  check('draft فقط در حافظه ماژول تب نگه داشته می‌شود',
    tab.includes('let chain = new Map()') && tab.includes('draft = result.draft')
    && !tab.includes('localStorage') && !tab.includes('saveSession'));
  check('چیدمان استودیو در نمایش باریک تک‌ستونه می‌شود',
    css.includes('.pt-layout { grid-template-columns: 1fr; }')
    && css.includes('.pt-money-grid, .pt-capital-board, .pt-date-grid { grid-template-columns: 1fr; }'));
}
