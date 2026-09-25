#!/usr/bin/env node
// خلاصهٔ یک فایلِ «جریان داده» (R5-21).
//
//   node tools/datalog.mjs data/logs/datalog-14050703.jsonl
//   node tools/datalog.mjs <فایل> --tab backtest --problems
//
// همان جمع‌بندیِ تبِ «جریان داده»، روی فایلی که کاربر برای بررسی فرستاده:
// به تفکیکِ تب و سرویس، دسته‌بندیِ نتیجه‌ها، کندترین‌ها، و فهرستِ
// درخواست‌های مشکل‌دار با آدرسِ کاملِ TSETMC.

import fs from 'node:fs';
import {
  DL_CAT, DL_PROBLEM, DL_SLOW_LABEL, buildTree, summarizeLog, tabLabel,
} from '../core/datalog.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const flag = (name) => args.includes(`--${name}`);
if (!file) {
  console.log('کاربرد: node tools/datalog.mjs <فایل.jsonl> [--tab <شناسهٔ تب>] [--problems] [--limit 40]');
  process.exit(1);
}

const rows = [];
let bad = 0;
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { rows.push(JSON.parse(line)); } catch { bad += 1; }
}
const tab = opt('tab');
const limit = Number(opt('limit')) || 40;
const picked = tab ? buildTree(rows).filter((n) => n.tab === tab).flatMap((n) => [n.client, n.api, ...n.up].filter(Boolean)) : rows;
const sum = summarizeLog(picked);
const cats = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${DL_CAT[k] || k} ${n}`).join(' · ') || '—';
// ساعتِ تهران، هر جا که ابزار اجرا شود.
const clock = (at) => new Date(at + 3.5 * 3600 * 1000).toISOString().slice(11, 23);

const first = rows.find((r) => r.at)?.at, last = rows.at(-1)?.at;
console.log(`■ ${file} — ${rows.length} ردیف${bad ? ` (${bad} خطِ خراب)` : ''}${first ? ` · ${clock(first)} تا ${clock(last)} (تهران)` : ''}`);
for (const note of rows.filter((r) => r.kind === 'note')) console.log(`  یادداشت: ${note.note}`);
console.log(`\n■ درخواست‌های برنامه: ${sum.requests} — ${cats(sum.cats)}${sum.slow ? ` · ${DL_SLOW_LABEL} ${sum.slow}` : ''}`);
console.log(`■ درخواست‌ها به TSETMC: ${sum.upstream} — ${cats(sum.upCats)}`);

console.log('\n■ به تفکیکِ تب');
for (const [id, t] of Object.entries(sum.byTab).sort((a, b) => b[1].requests - a[1].requests)) {
  console.log(`  ${tabLabel(id)} (${id || '—'}): ${t.requests} درخواست [${cats(t.cats)}]${t.slow ? ` · دیر ${t.slow}` : ''} · TSETMC ${t.up} [${cats(t.upCats)}]`);
}

console.log('\n■ به تفکیکِ سرویسِ TSETMC');
for (const [path, p] of Object.entries(sum.byPath).sort((a, b) => b[1].count - a[1].count).slice(0, 25)) {
  console.log(`  ${path}: ${p.count} [${cats(p.cats)}] · میانگین ${Math.round(p.msTotal / Math.max(1, p.count))}ms · بیشینه ${p.msMax}ms${p.slow ? ` · دیر ${p.slow}` : ''}`);
}

const tree = buildTree(picked);
const problems = tree.filter((n) => DL_PROBLEM.has(n.cat) || n.slow || n.up.some((u) => DL_PROBLEM.has(u.cat)));
console.log(`\n■ درخواست‌های مشکل‌دار: ${problems.length}${problems.length > limit ? ` (${limit} تای آخر)` : ''}`);
if (flag('problems') || problems.length) {
  for (const n of problems.slice(-limit)) {
    const c = n.client, a = n.api;
    console.log(`  ${clock(n.at)} · ${tabLabel(n.tab)} · ${c?.action || a?.action || '—'} · ${c?.method || a?.method || 'TSETMC'} ${c?.url || a?.path || n.up[0]?.url || ''}`);
    console.log(`      نتیجه: ${DL_CAT[n.cat] || n.cat}${n.slow ? ` · ${DL_SLOW_LABEL}` : ''}${c ? ` · مرورگر ${c.ms}ms HTTP ${c.status || '—'}` : ''}${a ? ` · سرور ${a.ms}ms` : ''}${c?.error ? ` · ${c.error}` : ''}${a?.sum ? ` · ${JSON.stringify(a.sum)}` : ''}`);
    if (c?.src?.length) console.log(`      مبدأ: ${c.src.join(' ← ')}`);
    for (const u of n.up.filter((u) => DL_PROBLEM.has(u.cat) || u.slow).slice(0, 8)) {
      console.log(`      ↳ ${clock(u.at)}${u.name ? ` [${u.name}]` : ''} ${u.url || u.path} · تلاش ${u.attempt || '—'}/${u.of || '—'} · ${u.ms ?? '—'}ms · HTTP ${u.status || '—'} · ${DL_CAT[u.cat] || u.cat}${u.slow ? ' · دیر' : ''}${u.error ? ` · ${u.error}` : ''}`);
    }
  }
}

// ═══ R5-22: ریزمعامله به تفکیکِ ابزار و روز ═══
//
// همان جدولی که علتِ «نمودارِ ناقص» را نشان داد: کدام پا چند معامله داشت
// و از چه ساعتی تا چه ساعتی. پای کم‌معامله همین‌جا پیدا می‌شود.
const tapes = picked.filter((r) => r.kind === 'up' && /\/Trade\/GetTradeHistory\//.test(r.path || '') && r.sum);
if (tapes.length) {
  const seen = new Map();
  for (const r of tapes) {
    const [, , , ins, date, flag] = String(r.path).split('/');
    const key = `${date}|${ins}`;
    const prev = seen.get(key);
    // از هر ابزار/روز، پرردیف‌ترین پاسخ — پرچمِ `true` ممکن است بریده باشد.
    if (!prev || (r.sum.rows || 0) > (prev.sum.rows || 0)) seen.set(key, { ...r, ins, date, flag });
  }
  console.log(`\n■ ریزمعامله به تفکیکِ ابزار و روز (${seen.size})`);
  for (const r of [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.ins.localeCompare(b.ins)).slice(0, 80)) {
    console.log(`  ${r.date} · ${r.name || r.ins} · ${r.sum.rows ?? 0} معامله${r.sum.first ? ` · ${r.sum.first} تا ${r.sum.last}` : ''} · ${DL_CAT[r.cat] || r.cat}${r.flag === 'true' ? ' · پرچم true' : ''}`);
  }
}
