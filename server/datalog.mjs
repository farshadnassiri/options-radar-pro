// انبارِ جریانِ داده (R5-21) — منطق در `core/datalog.mjs`.
//
// دو جا نگه داشته می‌شود:
//   حافظه   آخرین چند هزار ردیف، برای تبِ «جریان داده» با تازه‌سازیِ زنده؛
//   دیسک    `data/logs/datalog-YYYYMMDD.jsonl`، یک ردیف JSON در هر خط، تا
//           بستنِ صفحه یا سرور لاگ را نبرد و فایلش برای بررسی فرستاده شود.
//
// نوشتن دسته‌ای است (هر ثانیه یک بار)، نه ردیف‌به‌ردیف: بسته‌ای با صد
// درخواستِ بالادست نباید صد بار دیسک را بزند. فایلِ هر روز سقف دارد؛ پس از
// آن فقط حافظه ادامه می‌دهد و خودِ سقف در فایل ثبت می‌شود.
//
// زمینه (کدام درخواستِ مرورگر، کدام تب) با `AsyncLocalStorage` از ورودیِ
// درخواست تا هر `get` که برایش صدا زده می‌شود می‌رود. صفِ نرخ کار را بعداً
// و از زمینهٔ دیگری اجرا می‌کند، پس `get` زمینه را همان لحظهٔ صدا زدن
// برمی‌دارد و صریح پاس می‌دهد — به زمینهٔ لحظهٔ اجرا اعتماد نمی‌شود.

import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** روزِ تهران برای نامِ فایل — نیمه‌شبِ UTC وسطِ روزِ کاری نیست ولی ساعتِ ۳:۳۰ هست. */
export const tehranDay = (at = Date.now()) =>
  new Date(at + 3.5 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');

export function createDataLog({
  dir, enabled = () => true, cap = 8000, fileCapBytes = 200 * 1024 * 1024, flushMs = 1000,
} = {}) {
  const als = new AsyncLocalStorage();
  const ring = [];
  let seq = 0;
  let pending = [];
  let timer = null;
  const sizes = new Map();
  const capped = new Set();

  async function flush() {
    timer = null;
    const batch = pending;
    pending = [];
    if (!batch.length || !dir) return;
    const byDay = new Map();
    for (const row of batch) {
      const day = tehranDay(row.at);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(JSON.stringify(row));
    }
    try {
      await fs.mkdir(dir, { recursive: true });
      for (const [day, lines] of byDay) {
        if (capped.has(day)) continue;
        const file = path.join(dir, `datalog-${day}.jsonl`);
        if (!sizes.has(day)) sizes.set(day, await fs.stat(file).then((s) => s.size).catch(() => 0));
        let text = `${lines.join('\n')}\n`;
        if (sizes.get(day) + text.length > fileCapBytes) {
          capped.add(day);
          text = `${JSON.stringify({ kind: 'note', at: Date.now(), note: `سقفِ حجمِ فایلِ روز (${Math.round(fileCapBytes / 1048576)} مگابایت) پر شد؛ از اینجا فقط در حافظه ثبت می‌شود.` })}\n`;
        }
        await fs.appendFile(file, text, 'utf8');
        sizes.set(day, sizes.get(day) + text.length);
      }
    } catch {
      // لاگ نباید خودش منبعِ خطا شود؛ ردیف‌ها در حافظه می‌مانند.
    }
  }

  const schedule = () => { if (!timer) timer = setTimeout(flush, flushMs); };

  /**
   * هنگامِ بسته‌شدنِ سرور: ردیف‌های هنوز‌ننوشته هم‌گام نوشته می‌شوند. بی
   * این، آخرین ثانیه‌ها — همان‌هایی که شاید علتِ بستن بودند — گم می‌شدند.
   */
  function flushSync() {
    const batch = pending;
    pending = [];
    if (!batch.length || !dir) return;
    try {
      mkdirSync(dir, { recursive: true });
      const byDay = new Map();
      for (const row of batch) {
        const day = tehranDay(row.at);
        if (capped.has(day)) continue;
        byDay.set(day, `${byDay.get(day) || ''}${JSON.stringify(row)}\n`);
      }
      for (const [day, text] of byDay) appendFileSync(path.join(dir, `datalog-${day}.jsonl`), text, 'utf8');
    } catch { /* در حالِ بستن، کاری جز رهاکردن نمی‌ماند */ }
  }

  /**
   * هنگامِ بالا آمدن: لاگِ امروز از دیسک به حافظه برمی‌گردد و شماره‌گذاری
   * از همان‌جا ادامه می‌یابد. بی این، هر بار اجرای دوبارهٔ سرور تبِ «جریان
   * داده» را خالی می‌کرد و شماره‌ها در فایل تکراری می‌شدند.
   */
  async function restore(day = tehranDay()) {
    if (!dir) return 0;
    try {
      const file = path.join(dir, `datalog-${day}.jsonl`);
      const stat = await fs.stat(file);
      sizes.set(day, stat.size);
      const handle = await fs.open(file, 'r');
      const want = Math.min(stat.size, 40 * 1024 * 1024);
      const buf = Buffer.alloc(want);
      await handle.read(buf, 0, want, stat.size - want);
      await handle.close();
      const lines = buf.toString('utf8').split('\n');
      if (want < stat.size) lines.shift();
      const rows = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try { const row = JSON.parse(line); if (row && row.seq) rows.push(row); } catch { /* خطِ نیمه‌کاره */ }
      }
      for (const row of rows) seq = Math.max(seq, Number(row.seq) || 0);
      ring.push(...rows.slice(-cap));
      if (ring.length > cap) ring.splice(0, ring.length - cap);
      return rows.length;
    } catch { return 0; }
  }

  return {
    run: (ctx, fn) => als.run(ctx, fn),
    ctx: () => als.getStore() || null,
    on: () => enabled() !== false,
    push(entry) {
      if (enabled() === false) return null;
      const row = { seq: ++seq, at: Date.now(), ...entry };
      ring.push(row);
      if (ring.length > cap) ring.splice(0, ring.length - cap);
      pending.push(row);
      schedule();
      return row;
    },
    list({ since = 0, limit = 2000 } = {}) {
      const rows = ring.filter((row) => row.seq > since);
      return rows.slice(-Math.max(1, limit));
    },
    clear() { ring.length = 0; },
    stats: () => ({ seq, held: ring.length, cap, capped: [...capped] }),
    fileOf: (day) => path.join(dir, `datalog-${day}.jsonl`),
    restore,
    flushSync,
    async files() {
      try {
        const names = (await fs.readdir(dir)).filter((n) => /^datalog-\d{8}\.jsonl$/.test(n)).sort().reverse();
        return Promise.all(names.slice(0, 30).map(async (name) => ({
          day: name.slice(8, 16), bytes: await fs.stat(path.join(dir, name)).then((s) => s.size).catch(() => 0),
        })));
      } catch { return []; }
    },
    flush,
  };
}
