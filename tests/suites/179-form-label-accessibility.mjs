// ۱۷۹. اتصال برچسب‌های فرم موقعیت و رول به کنترل‌ها

import { check, group, readSrc } from '../harness.mjs';

group('۱۷۹. اتصال برچسب‌های فرم موقعیت و رول به کنترل‌ها');
{
  const positionsSrc179 = readSrc('../ui/tabs/positions.mjs');
  const rollSrc179 = readSrc('../ui/tabs/roll.mjs');
  const styleSrc179 = readSrc('../ui/style.css');

  check('برچسب فیلدهای انتخابی و عددی موقعیت به شناسه کنترل وصل است',
    positionsSrc179.includes('<label for="${controlId}">${label}</label>')
    && positionsSrc179.includes('id="${controlId}"'));
  check('تاریخ‌گردان به‌جای label نامعتبر نام دسترسی‌پذیر گروه دارد',
    positionsSrc179.includes('class="field-label" id="${labelId}"')
    && positionsSrc179.includes('role="group" aria-labelledby="${labelId}"'));
  check('برچسب قیمت پایه ورود کنترل خودش را فوکوس می‌کند',
    positionsSrc179.includes('<label for="entry-risk-spot">')
    && positionsSrc179.includes('id="entry-risk-spot"'));
  check('هر قیمت اختیار ورود شناسه یکتا و برچسب متصل دارد',
    positionsSrc179.includes('<label for="entry-risk-close-${i}">')
    && positionsSrc179.includes('id="entry-risk-close-${i}" data-entry-close="${i}"'));
  check('پنج انتخاب‌گر تحلیل رول برچسب متصل دارند',
    ['pos', 'leg', 'exp', 'new', 'exp2'].every((id) => (
      rollSrc179.includes(`<label for="${id}">`)
      && rollSrc179.includes(`<select id="${id}">`)
    )));
  check('برچسب دیداری تاریخ‌گردان سبک یکسان فیلد را حفظ می‌کند',
    styleSrc179.includes('.field label, .field .field-label'));
}
