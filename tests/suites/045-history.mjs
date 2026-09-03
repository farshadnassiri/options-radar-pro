// ۴۴. سررسید با سقف پر در تحلیل تاریخی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { buildChain, withoutBlockedExpiries } from '../../core/chain.mjs';
import {
  flattenActiveContracts, generateHistoricalCombos as histCombos, normalizeHistoryDate,
} from '../../core/history.mjs';
import { blockedExpirySet, scan as scanFn } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { byId } from '../../strategies/catalog.mjs';
import {
  SETTINGS_CHANGED_EVENT, changedSettingKeys, createSettingsSaver,
} from '../../ui/settings-sync.mjs';


// ═══════════ ۴۴. سررسید با سقف پر، از تحلیل تاریخی هم بیرون است ═══════════
//
// باگ گزارش‌شده کاربر: تیک «سقف موقعیت پر» زده می‌شد ولی همان سررسید باز در
// فیلترهای تحلیل تاریخی می‌آمد و وارد محاسبه می‌شد. علتش این بود که قید فقط
// در مسیر زنده (`core/scan.mjs`) اعمال می‌شد و کل خانواده تحلیل تاریخی —
// تحلیل تاریخی، بک‌تست سریع، بک‌تست سبد — آن را اصلاً نمی‌دید.
//
// سقف پر یعنی امروز نمی‌شود روی آن سررسید موقعیت فزاینده گرفت. پس عددی که
// از بازپخش گذشته‌اش درمی‌آید، تصمیمی را تغذیه می‌کند که اجرایش ممکن نیست.
group('۴۴. سررسید با سقف پر در تحلیل تاریخی');
{
  const mkRow = (strike, days, endDate) => ({
    uaInsCode: '7', lval30_UA: 'اهرم', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate,
    pMeDem_C: 5000, qTitMeDem_C: 500, pMeOf_C: 5200, qTitMeOf_C: 500,
    pDrCotVal_C: 5100, pClosing_C: 5100, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: 4000, qTitMeDem_P: 500, pMeOf_P: 4200, qTitMeOf_P: 500,
    pDrCotVal_P: 4100, pClosing_P: 4100, oP_P: 400, qTotTran5J_P: 800,
  });
  const NEAR = 20260901, FAR = 20261101;
  const rows = [];
  for (const k of [95000, 100000, 105000]) {
    rows.push(mkRow(k, 30, NEAR));
    rows.push(mkRow(k, 90, FAR));
  }
  const ua44 = buildChain(rows, defaults()).get('7');
  const blockNear = `7:${NEAR}`;

  // ——— لایه مشترک ———
  const trimmed = withoutBlockedExpiries(ua44, blockedExpirySet(blockNear));
  check('سررسید پرشده از فهرست سررسیدها بیرون می‌رود',
    trimmed.expiryList.length === 1 && trimmed.expiryList[0].endDate === FAR,
    `${trimmed.expiryList.length} سررسید ماند`);
  check('بدون قید، همان شیء برمی‌گردد و کپی بیهوده ساخته نمی‌شود',
    withoutBlockedExpiries(ua44, blockedExpirySet('')) === ua44);

  // ——— فهرست قرارداد فعال ———
  const all44 = flattenActiveContracts(ua44);
  const kept44 = flattenActiveContracts(ua44, blockNear);
  check('فهرست قرارداد، سررسید پرشده را حذف می‌کند',
    all44.length === 12 && kept44.length === 6, `${all44.length} → ${kept44.length}`);
  check('و هیچ قرارداد سررسید پرشده باقی نمی‌ماند',
    kept44.every((c) => c.expiryRaw === FAR));

  // دفتر واقعی `endDate` را جلالی و تاریخ متناظر را در
  // `expiryGregorian` می‌دهد، در حالی که تیک نوار بالا با تاریخ میلادی
  // ذخیره می‌شود. این دقیقاً همان شکلی است که برای اهرم نشتی داشت.
  const ARCHIVE_NEAR = 20260916;
  const archiveRows44 = [];
  for (const k of [95000, 100000, 105000]) {
    archiveRows44.push({ ...mkRow(k, 30, 14050625), expiryGregorian: ARCHIVE_NEAR });
    archiveRows44.push(mkRow(k, 90, FAR));
  }
  const archiveUa44 = buildChain(archiveRows44, defaults()).get('7');
  const archiveKept44 = flattenActiveContracts(archiveUa44, `7:${ARCHIVE_NEAR}`);
  check('تاریخ میلادی دفتر، کلید مشترک سررسید تاریخی و تیک سقف‌پر است',
    archiveUa44.expiryList.some((expiry) => expiry.endDate === ARCHIVE_NEAR));
  check('تیک میلادی، ردیف تاریخی با endDate جلالی را هم کامل حذف می‌کند',
    archiveKept44.length === 6 && archiveKept44.every((contract) => contract.expiryRaw === FAR),
    `${archiveKept44.length} قرارداد ماند`);

  // ——— ترکیب‌سازی تاریخی ———
  const day = (date, close) => ({ date, close, last: close, low: close, high: close, vol: 1000, trades: 5, value: 1e6 });
  const series44 = { 7: [day(20260801, 100000), day(20260802, 100500)] };
  for (const c of all44) series44[c.ins] = [day(20260801, 5000), day(20260802, 5100)];

  const gen = (blockedExpiries) => histCombos({
    def: byId('bull-call-spread'), ua: { ...ua44, ins: '7' }, seriesByIns: series44,
    startDate: 20260801, entryBasis: 'CLOSE',
    settings: { ...defaults(), blockedExpiries }, filtered: false,
  });

  const free = gen('');
  const gated = gen(blockNear);
  check('بدون قید، ترکیب روی هر دو سررسید ساخته می‌شود',
    free.combos.length > gated.combos.length,
    `${free.combos.length} → ${gated.combos.length}`);
  const leaked = gated.combos.filter((c) =>
    c.legs.some((l) => l.kind !== 'underlying' && l.expiry === normalizeHistoryDate(NEAR)));
  check('هیچ ترکیب تاریخی روی سررسید پرشده ساخته نمی‌شود',
    leaked.length === 0, `${leaked.length} ترکیب نشتی`);
  check('و سررسید آزاد همچنان ترکیب می‌سازد', gated.combos.length > 0, `${gated.combos.length} ترکیب`);

  // ——— قید روی یک پایه، پایه دیگر را نمی‌بندد ———
  const otherBase = gen('999:20260901');
  check('قید یک پایه، پایه دیگر را کنار نمی‌گذارد',
    otherBase.combos.length === free.combos.length,
    `${otherBase.combos.length} برابر ${free.combos.length}`);

  // ——— مسیر زنده هم همان قید را دارد (رگرسیون) ———
  const liveBlocked = scanFn({
    def: byId('bull-call-spread'), chain: buildChain(rows, defaults()), uaKeys: ['7'],
    settings: { ...defaults(), blockedExpiries: blockNear }, qty: 1,
  });
  check('مسیر زنده هم سررسید پرشده را نمی‌سازد',
    liveBlocked.rows.every((r) => r.days !== 30), `${liveBlocked.rows.length} ردیف`);

  // ——— هیچ مسیر تاریخی‌ای بدون قید نماند ———
  const tabs = ['ui/tabs/history.mjs', 'ui/tabs/backtest.mjs', 'ui/tabs/portfolio-backtest.mjs'];
  const unguarded = tabs.filter((f) => {
    const src = readSrc(`../${f}`);
    return /flattenActiveContracts\(\s*(ua|analysisUa)\s*\)/.test(src);
  });
  check('هیچ تب تاریخی، فهرست قرارداد را بدون قید سقف نمی‌گیرد',
    unguarded.length === 0, unguarded.join('، '));

  // ——— تیک رابط، پیش از پایان ذخیره هم معتبر است ———
  let settings44 = { blockedExpiries: '', maxRows: 120 };
  const writes44 = [];
  const notices44 = [];
  const saver44 = createSettingsSaver({
    get: () => settings44,
    set: (value) => { settings44 = value; },
    notify: (before, after) => notices44.push(changedSettingKeys(before, after)),
    write: (value) => new Promise((resolve) => { writes44.push({ value, resolve }); }),
  });
  const firstSave44 = saver44.save({ ...settings44, blockedExpiries: blockNear });
  check('تیک سقف‌پر همان لحظه وارد حافظهٔ محاسبه می‌شود',
    settings44.blockedExpiries === blockNear);
  const secondKey44 = `7:${FAR}`;
  const secondSave44 = saver44.save({ ...settings44, blockedExpiries: `${blockNear},${secondKey44}` });
  check('دو تیک سریع همدیگر را پاک نمی‌کنند',
    settings44.blockedExpiries === `${blockNear},${secondKey44}`);
  // صف: تا اولی تمام نشود، دومی هنوز به نویسنده نرسیده است.
  await Promise.resolve();
  check('ذخیره‌های سریع به‌ترتیب نوشته می‌شوند', writes44.length === 1);
  writes44[0].resolve(writes44[0].value);
  await firstSave44;
  await Promise.resolve();
  check('پاسخ ذخیرهٔ قدیمی، تیک تازه را عقب نمی‌برد',
    settings44.blockedExpiries === `${blockNear},${secondKey44}` && writes44.length === 2);
  writes44[1].resolve(writes44[1].value);
  await secondSave44;
  check('پس از پایان صف، هر دو سررسید بسته‌اند',
    settings44.blockedExpiries === `${blockNear},${secondKey44}`);
  check('رویداد تغییر، کلید سقف سررسید را نام می‌برد',
    notices44.some((keys) => keys.includes('blockedExpiries')) && SETTINGS_CHANGED_EVENT.includes('settings-changed'));

  // ——— خودِ تب همه‌استراتژی، تنظیم کهنه را به Worker نمی‌دهد ———
  const portfolioTab44 = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('پیش از دریافت تاریخچه و پیش از اجرای همه، تنظیمات قطعی خوانده می‌شود',
    (portfolioTab44.match(/await api\.loadSettings\(\)/g) || []).length >= 2);
  check('تغییر سقف، گزارش قبلی را باطل می‌کند و اجرای میان‌راه را نمی‌پذیرد',
    portfolioTab44.includes('SETTINGS_CHANGED_EVENT')
    && portfolioTab44.includes('runEpoch !== settingsEpoch')
    && portfolioTab44.includes("includes('blockedExpiries')"));
}
