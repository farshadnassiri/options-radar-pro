// ۲۶۳. دفترچهٔ معاملات
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import {
  JOURNAL_ACTIONS, JOURNAL_CAP, JOURNAL_REASONS, JOURNAL_VERSION,
  appendEntry, filterJournal, journalAction, journalActionLabel, journalSummary,
  makeEntry, normalizeJournal,
} from '../../core/journal.mjs';

group('۲۶۳. دفترچهٔ معاملات');
{
  check('نسخهٔ قرارداد اعلام شده', JOURNAL_VERSION === 1);
  check('هفت کنش تعریف شده و هرکدام برچسب فارسی دارد',
    JOURNAL_ACTIONS.length === 7 && JOURNAL_ACTIONS.every(([, label]) => label.length > 2));
  check('کنش ناشناخته به «یادداشت» می‌افتد، نه undefined',
    journalAction('هرچی') === 'note' && journalActionLabel('هرچی') === 'یادداشت');

  // ردیفی که ساعتش را خودش بسازد، در آزمون قابل سنجش نیست.
  const made = makeEntry({ at: 1000, action: 'close', positionId: 'p1', title: 'کاوردکال', uaName: 'اهرم', qty: 2, pnlTotal: 5e5, note: 'به هدف رسید' });
  check('ردیف با زمانِ داده‌شده ساخته می‌شود', made.ok === true && made.entry.at === 1000);
  check('بی زمان، ردیفی ساخته نمی‌شود',
    makeEntry({ at: 0 }).why === JOURNAL_REASONS.noTime && makeEntry({ at: 0 }).entry === null);
  // عددِ نبوده باید «نبوده» بماند تا جدول «—» بگذارد، نه صفر.
  const bare = makeEntry({ at: 10, action: 'note', note: 'x' }).entry;
  check('عددِ نداده null می‌ماند، نه صفر',
    bare.qty === null && bare.pnlTotal === null && bare.price === null);
  check('هر ردیف شناسهٔ یکتا می‌گیرد',
    makeEntry({ at: 1 }).entry.id !== makeEntry({ at: 1 }).entry.id);

  // ——— فقط افزودن ———
  let list = [];
  list = appendEntry(list, made.entry);
  list = appendEntry(list, makeEntry({ at: 2000, action: 'open', title: 'بول کال' }).entry);
  check('تازه‌ترین اول می‌نشیند', list[0].at === 2000 && list.length === 2);
  check('ردیف بی‌زمان دفترچه را دست نمی‌زند', appendEntry(list, null).length === 2);
  let many = [];
  for (let i = 1; i <= JOURNAL_CAP + 5; i += 1) {
    many = appendEntry(many, makeEntry({ at: i, action: 'note' }).entry);
  }
  check('دفترچه سقف دارد و تازه‌ها می‌مانند',
    many.length === JOURNAL_CAP && many[0].at === JOURNAL_CAP + 5);

  // ردیفِ کهنه هم باید بخواند، حتی اگر میدان‌هایش ناقص باشند.
  const restored = normalizeJournal([
    { at: 5, action: 'ناشناخته', qty: '3' },
    { at: 0, action: 'open' },
    null,
  ]);
  check('ردیف بی‌زمان از فایل هم رد می‌شود', restored.length === 1);
  check('کنش ناشناختهٔ ذخیره‌شده به «یادداشت» می‌افتد', restored[0].action === 'note');
  check('عدد رشته‌ای خوانده می‌شود', restored[0].qty === 3);

  // ——— آماره ———
  const book = [
    makeEntry({ at: 100, action: 'open', title: 'الف' }).entry,
    makeEntry({ at: 200, action: 'close', title: 'الف', pnlTotal: 1e6 }).entry,
    makeEntry({ at: 300, action: 'close', title: 'ب', pnlTotal: -4e5 }).entry,
    // ردیف ویرایش هم عدد دارد؛ نباید در سود تحقق‌یافته جمع شود.
    makeEntry({ at: 400, action: 'edit', title: 'ج', pnlTotal: 9e9 }).entry,
  ];
  const sum = journalSummary(book);
  check('سود تحقق‌یافته فقط از ردیف‌های بستن جمع می‌شود',
    near(sum.realized, 6e5), `${sum.realized}`);
  check('شمار بستن‌ها درست است', sum.closedCount === 2);
  check('برد و باخت و نرخ برد', sum.wins === 1 && sum.losses === 1 && near(sum.winRatePct, 50));
  check('شمار هر کنش جدا نگه داشته می‌شود',
    sum.byAction.open === 1 && sum.byAction.close === 2 && sum.byAction.edit === 1);
  check('اولین و آخرین زمان گزارش می‌شوند', sum.first === 100 && sum.last === 400);
  check('دفترچهٔ خالی، سود تحقق‌یافته نمی‌سازد',
    Number.isNaN(journalSummary([]).realized) && journalSummary([]).count === 0);
  check('بازهٔ زمانی آماره را می‌برد',
    journalSummary(book, { from: 300 }).count === 2);

  // ——— پالایه ———
  check('پالایهٔ کنش کار می‌کند', filterJournal(book, { action: 'close' }).length === 2);
  check('جست‌وجو در متن و عنوان می‌گردد', filterJournal(book, { text: 'الف' }).length === 2);
  check('پالایهٔ موقعیت، فقط ردیف‌های همان موقعیت را می‌دهد',
    filterJournal([makeEntry({ at: 1, positionId: 'p1' }).entry,
      makeEntry({ at: 2, positionId: 'p2' }).entry], { positionId: 'p1' }).length === 1);
  check('بی پالایه، همه می‌آیند', filterJournal(book, {}).length === 4);

  // ——— قرارداد سرور و تب‌ها ———
  const server = readSrc('../server/server.mjs');
  check('مسیر دفترچه فقط GET و POST دارد — نه ویرایش و نه حذف',
    server.includes("if (p === '/api/journal')")
    && !/api\/journal[\s\S]{0,900}method === 'DELETE'/.test(server));
  // ساعتِ مرورگر می‌تواند عقب یا جلو باشد و ترتیب دفترچه تنها چیزی است که
  // معنایش را نگه می‌دارد.
  check('زمان ردیف از سرور می‌آید، نه از بدنهٔ درخواست',
    server.includes('makeEntry({ ...body, at: Date.now() })'));

  const positions = readSrc('../ui/tabs/positions.mjs');
  for (const action of ['open', 'edit', 'close', 'reopen', 'delete', 'alert']) {
    check(`کنش «${action}» در دفترچه ثبت می‌شود`, positions.includes(`journal('${action}'`));
  }
  // بعد از حذف، عنوان و نماد و تعداد در دست نیست و ردیف به هیچ اشاره می‌کند.
  check('ردیف حذف پیش از خودِ حذف نوشته می‌شود',
    positions.indexOf("journal('delete'") < positions.indexOf('positions.splice(i, 1)'));
  // دفترچه ثبتِ کناری است؛ خرابی‌اش نباید کار اصلی کاربر را بخورد.
  check('شکست نوشتن در دفترچه، ذخیرهٔ موقعیت را نمی‌خورد',
    positions.includes("catch (error) { logError('positions:journal', error); }"));

  const tab = readSrc('../ui/tabs/journal.mjs');
  check('تب دفترچه دکمهٔ ویرایش یا حذف ردیف ندارد',
    !tab.includes('data-edit') && !tab.includes('data-drop') && !tab.includes('data-del'));
  check('و صریح می‌گوید چرا', tab.includes('برای اصلاح، ردیف تازه بنویس'));

  check('تب در مسیریاب ثبت شده',
    readSrc('../ui/app.mjs').includes("id: 'journal'"));
}
