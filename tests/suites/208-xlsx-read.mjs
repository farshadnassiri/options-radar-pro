// ۲۰۸. خواندن xlsx بدون وابستگی

import zlib from 'node:zlib';
import { check, group } from '../harness.mjs';
import {
  columnIndex, readXlsx, sharedStrings, sheetIndex, sheetRows, unescapeXml, unzip,
} from '../../core/xlsx-read.mjs';

/** ساختِ zip کمینه، فقط برای همین آزمون. */
function makeZip(entries) {
  const locals = [], central = [];
  let at = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(text, 'utf8');
    const body = zlib.deflateRawSync(raw);
    const crc = zlib.crc32 ? zlib.crc32(raw) : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0, 8); dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20); dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(at, 42);
    central.push(dir, nameBuf);
    at += local.length + nameBuf.length + body.length;
  }
  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralPart.length, 12); end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, end]);
}

group('۲۰۸-الف. zip و XML');
{
  const zip = makeZip([['a.txt', 'سلام'], ['b/c.txt', 'دوم']]);
  const files = unzip(zip);
  check('هر دو پرونده از فهرست مرکزی درآمدند', files.size === 2 && files.has('b/c.txt'));
  check('محتوای فارسی سالم است', files.get('a.txt').toString('utf8') === 'سلام');
  let threw = false;
  try { unzip(Buffer.from('این zip نیست')); } catch { threw = true; }
  check('ورودیِ غیر-zip خطا می‌دهد، نه پروندهٔ خالی', threw);

  check('نویسه‌های فراری برمی‌گردند', unescapeXml('a &amp; b &lt;c&gt; &#65; &#x42;') === 'a & b <c> A B');
  check('نویسهٔ ناشناخته دست‌نخورده می‌ماند', unescapeXml('&nope;') === '&nope;');
  check('ستون تک‌حرفی و چندحرفی', columnIndex('A1') === 0 && columnIndex('Z9') === 25 && columnIndex('AA1') === 26 && columnIndex('BC12') === 54);
  check('ارجاع بدشکل، منفی می‌دهد', columnIndex('12') === -1);
}

group('۲۰۸-ب. سلولِ خودبسته سلولِ بعدی را نمی‌بلعد');
{
  // این دقیقاً روی فایل واقعی صاحب پروژه رخ داد: openpyxl سلولِ خالی را
  // `<c r="J2" t="inlineStr" />` می‌نویسد. با ویرگولِ حریص، خودِ `/` داخل
  // ویژگی‌ها می‌افتاد، شاخهٔ خودبسته رد می‌شد و تطبیق تا `</c>` سلولِ
  // بعدی جلو می‌رفت. نتیجه: سه ستون بلعیده شدند و آدرس اینترنتی داخل
  // ستونِ CIsin نشست — ستون‌ها یکی‌درمیان جابه‌جا شده بودند.
  const xml = '<row r="2">'
    + '<c r="A2" t="inlineStr"><is><t>یک</t></is></c>'
    + '<c r="B2" t="inlineStr" />'
    + '<c r="C2" t="inlineStr" />'
    + '<c r="D2" t="inlineStr"><is><t>چهار</t></is></c>'
    + '</row>';
  const rows = sheetRows(xml);
  check('چهار خانه، نه دو', rows[0].length === 4, JSON.stringify(rows[0]));
  check('خانهٔ چهارم سرِ جای خودش است', rows[0][3] === 'چهار', String(rows[0][3]));
  check('خانهٔ خالی، خالی می‌ماند', rows[0][1] === null && rows[0][2] === null);

  // ── جای سلول از `r` می‌آید، نه از ترتیب ─────────────────────────────
  const gap = sheetRows('<row r="1"><c r="A1"><v>1</v></c><c r="D1"><v>4</v></c></row>');
  check('ستونِ نانوشته جای ستون‌های بعدی را جابه‌جا نمی‌کند',
    gap[0].length === 4 && gap[0][0] === 1 && gap[0][3] === 4, JSON.stringify(gap[0]));

  check('رشتهٔ مشترک از شمارهٔ خانه درمی‌آید',
    sheetRows('<row><c r="A1" t="s"><v>1</v></c></row>', ['صفر', 'یک'])[0][0] === 'یک');
  check('عدد، عدد می‌ماند نه متن', sheetRows('<row><c r="A1"><v>3.5</v></c></row>')[0][0] === 3.5);
  check('بولین خوانده می‌شود',
    sheetRows('<row><c r="A1" t="b"><v>1</v></c><c r="B1" t="b"><v>0</v></c></row>')[0].join() === 'true,false');

  // ── `si` چندتکه ──────────────────────────────────────────────────────
  //
  // متنی که وسطش قالبش عوض شده، چند `<t>` می‌شود. اگر فقط اولی خوانده
  // شود، نامِ قرارداد از وسط قیچی می‌شود — و نام، منبعِ قیمت اعمال و
  // سررسید است.
  const si = sharedStrings('<sst><si><t>اختیارخ </t><t>اهرم-42000</t></si><si/><si><t>ب</t></si></sst>');
  check('تکه‌های یک رشته به هم می‌چسبند', si[0] === 'اختیارخ اهرم-42000', si[0]);
  check('رشتهٔ خالی جا نمی‌افتد و ترتیب را جابه‌جا نمی‌کند', si.length === 3 && si[1] === '' && si[2] === 'ب');
}

group('۲۰۸-ج. کتاب کامل');
{
  const book = makeZip([
    ['xl/workbook.xml', '<workbook><sheets><sheet name="یک" sheetId="1" r:id="rId1"/><sheet name="دو" sheetId="2" r:id="rId2"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>نام</t></si><si><t>اختیارخ اهرم-42000-1404/04/08</t></si></sst>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="inlineStr"><is><t>InsCode</t></is></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Strike</t></is></c></row>'
      + '<row r="2"><c r="A2" t="inlineStr"><is><t>123</t></is></c><c r="B2" t="s"><v>1</v></c><c r="C2"><v>42000</v></c></row>'
      + '</sheetData></worksheet>'],
    ['xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>خالی</t></is></c></row></sheetData></worksheet>'],
  ]);

  const idx = sheetIndex(unzip(book));
  check('نام و مسیر هر برگه از rels درمی‌آید',
    idx.length === 2 && idx[0].name === 'یک' && idx[0].path === 'xl/worksheets/sheet1.xml', JSON.stringify(idx));

  const out = readXlsx(book, 'یک');
  check('سرستون‌ها از سطر اول', out.header.join(',') === 'InsCode,نام,Strike', out.header.join(','));
  check('ردیف به شکل شیء با کلیدِ سرستون',
    out.rows.length === 1 && out.rows[0].InsCode === '123' && out.rows[0].Strike === 42000
    && out.rows[0]['نام'] === 'اختیارخ اهرم-42000-1404/04/08', JSON.stringify(out.rows[0]));
  check('فهرست همهٔ برگه‌ها همراه جواب می‌آید', out.sheets.join(',') === 'یک,دو');
  check('برگه با شماره هم انتخاب می‌شود', readXlsx(book, 1).sheet === 'دو');

  // برگهٔ اشتباه، بی‌صدا با برگهٔ اول جایگزین نمی‌شود.
  let threw = '';
  try { readXlsx(book, 'نیست'); } catch (e) { threw = e.message; }
  check('نامِ برگهٔ نادرست خطا می‌دهد و برگه‌های موجود را نام می‌برد',
    /نیست/.test(threw) && /یک/.test(threw), threw);
}
