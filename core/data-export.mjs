// هستهٔ خالص تب «خروجی دیتا»: کشف ابزار، ساخت درخواست‌ها و ردیف‌های خروجی.

import { num } from './num.mjs';
import { batchKey, BATCH_PAIR_CAP } from './trades-source.mjs';

const n = (value) => num(value, 0);
const code = (value) => String(value ?? '').trim();

export const DATA_EXPORT_KIND_LABEL = {
  underlying: 'دارایی پایه', call: 'اختیار خرید', put: 'اختیار فروش',
};

/** همه پایه‌ها و قراردادهای کال/پوتِ پایه‌های انتخابی، یکتا و مرتب. */
export function discoverDataExportInstruments(rows = [], selectedBases = [], { declaredSize = 0 } = {}) {
  const selected = new Set((selectedBases || []).map(code).filter(Boolean));
  const all = selected.size === 0;
  const byKey = new Map();
  const put = (item) => {
    if (!item.ins) return;
    const key = `${item.kind}:${item.ins}`;
    const old = byKey.get(key);
    if (!old) { byKey.set(key, item); return; }
    const starts = [old.activeFrom, item.activeFrom].filter((value) => n(value) > 0);
    old.activeFrom = starts.length ? Math.min(...starts) : 0;
    old.activeTo = Math.max(n(old.activeTo), n(item.activeTo));
  };

  for (const row of rows || []) {
    const baseIns = code(row?.uaInsCode);
    if (!baseIns || (!all && !selected.has(baseIns))) continue;
    const baseName = code(row?.lval30_UA) || 'دارایی پایه بدون نام';
    put({
      ins: baseIns, name: baseName, baseIns, baseName, kind: 'underlying',
      strike: null, expiry: null, activeFrom: n(row?.activeFrom), activeTo: n(row?.activeTo),
      size: 1, sizeAssumed: false,
    });
    const officialSize = n(row?.contractSize);
    const size = officialSize > 0 ? officialSize : n(declaredSize);
    for (const [suffix, kind] of [['C', 'call'], ['P', 'put']]) {
      const ins = code(row?.[`insCode_${suffix}`]);
      if (!ins) continue;
      put({
        ins,
        name: code(row?.[`lVal18AFC_${suffix}`]) || code(row?.[`lVal30_${suffix}`]) || `قرارداد ${kind === 'call' ? 'کال' : 'پوت'}`,
        baseIns, baseName, kind,
        strike: n(row?.strikePrice) || null,
        expiry: n(row?.expiryGregorian) || n(row?.endDate) || null,
        activeFrom: n(row?.activeFrom), activeTo: n(row?.activeTo),
        size: size > 0 ? size : 0,
        sizeAssumed: !(officialSize > 0),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.baseName !== b.baseName) return a.baseName.localeCompare(b.baseName, 'fa');
    if (a.kind === 'underlying' && b.kind !== 'underlying') return -1;
    if (b.kind === 'underlying' && a.kind !== 'underlying') return 1;
    return (n(a.expiry) - n(b.expiry)) || (n(a.strike) - n(b.strike)) || a.kind.localeCompare(b.kind);
  });
}

/** پایه در کل بازه و اختیار فقط در عمر ثبت‌شدهٔ خودش درخواست می‌شود. */
export function dataExportPairs(instruments = [], dates = []) {
  const out = [], seen = new Set();
  const orderedDates = [...new Set((dates || []).map((value) => Math.trunc(n(value))).filter(Boolean))].sort((a, b) => a - b);
  for (const date of orderedDates) {
    for (const item of instruments || []) {
      if (!item?.ins) continue;
      if (item.kind !== 'underlying') {
        const from = n(item.activeFrom), to = n(item.activeTo) || n(item.expiry);
        if ((from > 0 && date < from) || (to > 0 && date > to)) continue;
      }
      const key = batchKey(item.ins, date);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ins: String(item.ins), date, key });
    }
  }
  return out;
}

export function dataExportPairBatches(pairs = [], cap = BATCH_PAIR_CAP) {
  const size = Math.max(1, Math.trunc(n(cap)) || BATCH_PAIR_CAP), out = [];
  for (let at = 0; at < (pairs || []).length; at += size) out.push(pairs.slice(at, at + size));
  return out;
}

/** ریزمعامله‌های یک ابزار، با ارزش خام و ارزش مبتنی بر اندازه قرارداد. */
export function dataExportTradeRows(instrument, pairs = [], items = {}) {
  const size = instrument?.kind === 'underlying' ? 1 : n(instrument?.size);
  const out = [];
  for (const pair of pairs || []) {
    if (String(pair.ins) !== String(instrument?.ins)) continue;
    const hit = items?.[pair.key];
    if (!hit || hit.error || !Array.isArray(hit.rows)) continue;
    for (const row of hit.rows) {
      const price = n(row?.price), quantity = n(row?.quantity);
      if (!(price > 0) || !(quantity > 0) || !(n(row?.time) > 0)) continue;
      out.push({
        date: pair.date, time: Math.trunc(n(row.time)), sequence: Math.trunc(n(row.sequence)),
        price, quantity, rawValue: price * quantity,
        contractSize: size > 0 ? size : NaN,
        contractValue: size > 0 ? price * quantity * size : NaN,
        canceled: row?.canceled === true, canceledKnown: row?.canceledKnown !== false,
        source: String(hit.source || 'history'),
      });
    }
  }
  return out.sort((a, b) => a.date - b.date || a.time - b.time || a.sequence - b.sequence);
}

/** پوشش هر ابزار/روز؛ خالیِ معتبر با خطا یکی نمی‌شود. */
export function dataExportCoverageRows(instruments = [], pairs = [], items = {}) {
  const byIns = new Map((instruments || []).map((item) => [String(item.ins), item]));
  return (pairs || []).map((pair) => {
    const instrument = byIns.get(String(pair.ins)) || {}, hit = items?.[pair.key];
    const rows = Array.isArray(hit?.rows) ? hit.rows : [];
    return {
      baseName: instrument.baseName || '', name: instrument.name || '', kind: instrument.kind || '',
      ins: String(pair.ins), date: pair.date,
      rows: hit && Array.isArray(hit.rows) ? rows.length : null,
      active: hit && Array.isArray(hit.rows) ? rows.filter((row) => row && row.canceled !== true).length : null,
      canceled: hit && Array.isArray(hit.rows) ? rows.filter((row) => row?.canceled === true).length : null,
      status: !hit ? 'درخواست نرفت' : hit.error ? 'خطا' : rows.length ? 'داده آمد' : 'بدون معامله',
      error: String(hit?.error || ''), source: String(hit?.source || ''),
    };
  });
}
