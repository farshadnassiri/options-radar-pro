// ۲۲۶. انتخاب استراتژی به نام خودش، نه به نام خانواده‌اش
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «لیست کشویی «خانواده» حذف و نام استراتژی جایش (Bull Call Spread و …).»
//
// کشویی قبلی شش خانواده داشت — «اسپرد عمودی»، «تلاطم — استرانگل» و …. دو
// ایراد داشت: کسی که دنبال Bull Call Spread است باید می‌دانست در کدام
// خانواده است، و انتخابِ «اسپرد عمودی» هشت استراتژی را با هم می‌ساخت که
// هیچ‌کدامشان خواسته نشده بود.
//
// حالا خودِ استراتژی‌ها انتخاب می‌شوند و خانواده فقط تیترِ گروه‌بندی است.
// این دسته می‌سنجد که فهرست از کاتالوگ بیاید نه از فهرستی دستی، و صافیِ
// ساخت روی شناسهٔ استراتژی بیفتد نه روی گروهش.

import { check, group, readSrc } from '../harness.mjs';
import { GAP_STRATEGY_IDS } from '../../core/spread-gap.mjs';
import { byId } from '../../strategies/catalog.mjs';
import { buildChain } from '../../core/chain.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildRadarHistory } from '../../core/radar-history.mjs';

group('۲۲۶. کشویی استراتژی در رادار فاصله');

const src = readSrc('../ui/tabs/spread-radar.mjs');

check('کشویی، خانواده را انتخاب‌شدنی نمی‌کند؛ فقط تیترِ گروه است',
  !/<option value="\$\{esc\(group\)\}"/.test(src)
  && /<optgroup label="\$\{esc\(groupLabel\(group\)\)\}"/.test(src));
check('گزینه‌های انتخاب‌شدنی، شناسه و نام خودِ استراتژی‌اند',
  /<option value="\$\{esc\(def\.id\)\}">\$\{esc\(def\.name\)\}<\/option>/.test(src));
check('صافیِ ساخت روی شناسهٔ استراتژی می‌افتد، نه روی گروهش',
  src.includes('def.id === strategy') && !src.includes('def.group === family'));
check('برچسب کنترل و گزینهٔ «همه» هم دیگر نام خانواده را نمی‌برند',
  src.includes('<label>استراتژی<select id="gr-strategy">')
  && src.includes('همهٔ استراتژی‌های فاصله‌دار')
  && !src.includes('همهٔ خانواده‌های فاصله‌دار'));
check('دامنهٔ هشدار هم «یک استراتژی» است، نه «یک خانواده»',
  src.includes('فقط یک استراتژی') && !src.includes('فقط یک خانواده'));

// فهرست از کاتالوگ می‌آید، پس استراتژی فاصله‌دارِ تازه خودبه‌خود در کشویی
// می‌نشیند. اگر روزی شناسه‌ای در کاتالوگ نباشد، اینجا لو می‌رود.
const defs = GAP_STRATEGY_IDS.map((id) => byId(id));
check('هر شناسهٔ فاصله‌دار در کاتالوگ نام و گروه دارد',
  defs.length > 0 && defs.every((def) => def && def.name && def.group));
check('نام‌ها همان چیزی‌اند که کاربر خواست، نه ترجمهٔ خانواده',
  byId('bull-call-spread').name === 'Bull Call Spread'
  && byId('short-strangle').name === 'Short Strangle');

// ── و رفتار، نه فقط متن: یک شناسه، یک استراتژی ────────────────────────
const range = { from: 20240622, to: 20240918 };
const settings = defaults();
const ua = buildChain([16000, 20000].map((strike) => ({
  uaInsCode: '7', lval30_UA: 'اهرم', pDrCotVal_UA: 18000, pClosing_UA: 18000,
  insCode_C: `c${strike}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}`, lVal18AFC_P: `ط${strike}`,
  strikePrice: strike, contractSize: 1000, remainedDay: 89, endDate: 20240919,
}))).get('7');
const daily = (date, close) => ({ date, close, last: close, vol: 1000, value: 1000000 });
const seriesByIns = {
  7: [daily(range.from, 18000), daily(range.to, 18000)],
  c16000: [daily(range.from, 3000), daily(range.to, 2500)],
  c20000: [daily(range.from, 800), daily(range.to, 600)],
  p16000: [], p20000: [],
};
const one = await buildRadarHistory({ ua, range, settings, seriesByIns, defs: [byId('bull-call-spread')] });
const two = await buildRadarHistory({ ua, range, settings, seriesByIns,
  defs: [byId('bull-call-spread'), byId('bear-call-spread')] });
check('انتخاب یک استراتژی، فقط ردیف‌های همان استراتژی را می‌سازد',
  one.rows.length === 1 && one.rows.every((row) => row.def.id === 'bull-call-spread'));
check('و انتخاب همه، هم‌خانواده‌ها را جدا از هم می‌سازد',
  two.rows.length === 2 && new Set(two.rows.map((row) => row.def.id)).size === 2);
