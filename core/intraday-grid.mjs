// شبکهٔ لحظه‌های درون‌روزی — دانه‌بندی ریزتر از «روز».
//
// تا اینجا کوچک‌ترین واحد زمان یک روز بود. برای کسی که می‌خواهد ببیند سبدش
// در ساعت ده و ربع کجا بوده، «روز» دانه‌بندی درشتی است.
//
// یک محدودیت که پنهان نمی‌شود: دانه‌بندی درون‌روزی فقط روی **یک روز** کار
// می‌کند. ریزمعاملهٔ هر ابزار برای هر روز یک درخواست است؛ ده روز در شصت
// ابزار یعنی ششصد درخواست، و آن دیگر تحلیل نیست، سنگین‌کردن تابلوست. پس
// روز سنجش ریز می‌شود و بقیهٔ بازه همان‌طور که هست می‌ماند.

import { INTRADAY_END_SECOND, INTRADAY_START_SECOND } from './backtest.mjs';

export const INTRADAY_GRID_VERSION = 1;

/** دانه‌بندی‌ها، از درشت به ریز. `minutes: 0` یعنی همان روزانهٔ همیشگی. */
export const MOMENT_GRAINS = [
  { id: 'day', label: 'روزانه', minutes: 0, hint: 'یک ستون برای هر روز معاملاتی؛ همان رفتار همیشگی' },
  { id: 'm60', label: 'شصت دقیقه', minutes: 60, hint: 'روز سنجش به ساعت‌ها شکسته می‌شود' },
  { id: 'm30', label: 'سی دقیقه', minutes: 30, hint: 'نیم‌ساعت‌های روز سنجش' },
  { id: 'm15', label: 'پانزده دقیقه', minutes: 15, hint: 'ربع‌ساعت‌های روز سنجش' },
  { id: 'm5', label: 'پنج دقیقه', minutes: 5, hint: 'برای دیدن تکان‌های کوتاه؛ ستون‌ها زیاد می‌شوند' },
  { id: 'm1', label: 'یک دقیقه', minutes: 1, hint: 'ریزترین دانه؛ بیشتر خانه‌ها خالی‌اند چون هر دقیقه معامله‌ای نیست' },
];

const BY_ID = new Map(MOMENT_GRAINS.map((row) => [row.id, row]));
export const DEFAULT_GRAIN = 'day';
export const normalizeGrain = (id) => (BY_ID.has(String(id ?? '')) ? String(id) : DEFAULT_GRAIN);
export const grainMeta = (id) => BY_ID.get(String(id ?? '')) || null;
export const isIntradayGrain = (id) => (grainMeta(normalizeGrain(id))?.minutes ?? 0) > 0;

const pad = (value) => String(value).padStart(2, '0');

/** `34200` → `۰۹:۳۰` — برچسب لحظه، با رقم فارسی. */
export function momentLabel(second) {
  const value = Math.max(0, Math.trunc(Number(second) || 0));
  const text = `${pad(Math.floor(value / 3600))}:${pad(Math.floor((value % 3600) / 60))}`;
  return text.replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

/**
 * لحظه‌های یک روز با دانه‌بندی خواسته‌شده.
 *
 * نخستین لحظه، **پایانِ** نخستین بازه است نه آغاز جلسه: در ثانیهٔ صفرِ
 * جلسه هنوز هیچ معامله‌ای نشده و ستونی که همیشه خالی است، ستون نیست.
 * آخرین لحظه هم به پایان جلسه چسبانده می‌شود تا آخرین معامله‌های روز جا
 * بمانند.
 */
export function momentsFor(grain) {
  const meta = grainMeta(normalizeGrain(grain));
  if (!meta || meta.minutes <= 0) return [];
  const step = meta.minutes * 60;
  const out = [];
  for (let second = INTRADAY_START_SECOND + step; second < INTRADAY_END_SECOND; second += step) out.push(second);
  out.push(INTRADAY_END_SECOND);
  return out;
}

/**
 * شمار درخواست‌های لازم — پیش از آنکه کاربر دکمه را بزند.
 *
 * عددی که بعد از فشردن دکمه معلوم شود، هشدار نیست؛ عذرخواهی است.
 */
export function intradayCost({ instruments = 0, grain = DEFAULT_GRAIN } = {}) {
  const count = Math.max(0, Math.trunc(Number(instruments) || 0));
  const moments = momentsFor(grain).length;
  return { requests: count, moments, replays: moments };
}

/**
 * کلید ستون یک لحظه — تاریخ و ثانیه، در یک عدد مرتب‌شدنی.
 *
 * ستون‌های درون‌روزی باید کنار ستون‌های روزانه مرتب بمانند، پس تاریخ در
 * بالا و ثانیه در پایین می‌نشیند: `۲۰۲۶۰۸۰۱` با ثانیهٔ ۳۴۲۰۰ می‌شود
 * `۲۰۲۶۰۸۰۱۰۳۴۲۰۰`. جمع‌کردن این دو در یک عدد، مرتب‌سازی را رایگان می‌کند.
 */
export const momentKey = (date, second) => (Number(date) * 1e6) + Math.max(0, Math.trunc(Number(second) || 0));
export const momentDate = (key) => Math.trunc(Number(key) / 1e6);
export const momentSecond = (key) => Math.trunc(Number(key) % 1e6);
