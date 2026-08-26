// ۱۵. قرارداد پیام‌رسانی ریسه اسکن
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { defaults } from '../../core/settings.mjs';


group('۱۵. قرارداد پیام‌رسانی ریسه اسکن');
{
  // ریسه را در نود سوار می‌کنیم، با یک self ساختگی. اینطور پروتکل پیام‌ها
  // بدون مرورگر آزمون می‌شود و خطای کلون‌شدن داده هم بیرون می‌آید.
  const out = [];
  globalThis.self = { onmessage: null, postMessage: (m) => out.push(m) };
  await import('../../worker/scan-worker.mjs');
  const send = (m) => globalThis.self.onmessage({ data: m });

  const mkRow = (strike, days, cBid, pBid) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000,
    insCode_C: `c${strike}_${days}`, insCode_P: `p${strike}_${days}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days,
    pMeDem_C: cBid, qTitMeDem_C: 100, pMeOf_C: cBid * 1.05, qTitMeOf_C: 100,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 10,
    pMeDem_P: pBid, qTitMeDem_P: 100, pMeOf_P: pBid * 1.05, qTitMeOf_P: 100,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 10,
  });
  const rows = [];
  for (const k of [90000, 95000, 100000, 105000, 110000]) {
    rows.push(mkRow(k, 30, Math.max(300, 104000 - k), Math.max(300, k - 96000)));
    rows.push(mkRow(k, 90, Math.max(500, 107000 - k), Math.max(500, k - 93000)));
  }
  const st = defaults();

  send({ type: 'rows', id: 1, full: true, rows, at: Date.now() });
  const ch = out.find((m) => m.type === 'chain');
  check('ریسه زنجیره ساخت و فهرست نماد داد', !!ch && ch.list.length === 1 && ch.stats.contracts === 20,
    `${ch?.list.length} نماد | ${ch?.stats.contracts} قرارداد`);

  send({ type: 'scan', id: 2, defId: 'covered-call', uaKeys: ['1'], settings: st, qty: 1 });
  const sc = out.find((m) => m.type === 'scan');
  check('ریسه اسکن کرد و نوار تشخیص برگشت', sc.rows.length > 0 && sc.funnel.built > 0,
    `${sc.rows.length} ردیف در ${sc.ms}ms`);
  check('ردیف بین ریسه و نخ اصلی کلون می‌شود',
    (() => { try { structuredClone(sc.rows[0]); return true; } catch { return false; } })(),
    'شیء تابع‌دار در ردیف نمانده');
  check('ردیف، پاهای قیمت‌خورده را برای رسم نمودار همراه دارد',
    Array.isArray(sc.rows[0].__legs) && sc.rows[0].__legs.length === 2);

  // مرحله دو: عمق واقعی می‌نشیند و یونانی روشن می‌شود
  const target = sc.rows[0];
  const optIns = target.legIns[0];
  send({ type: 'overlay', id: 3, data: {
    1: { book: [{ level: 1, bid: 99000, bidQty: 50000, ask: 100000, askQty: 50000 },
                { level: 2, bid: 98500, bidQty: 90000, ask: 100500, askQty: 90000 }] },
    [optIns]: { book: [{ level: 1, bid: 4000, bidQty: 3, ask: 4200, askQty: 3 },
                       { level: 2, bid: 3900, bidQty: 400, ask: 4400, askQty: 400 }] },
  } });
  check('پوشش عمق پذیرفته شد', out.some((m) => m.type === 'overlay-ok'));

  send({ type: 'scan', id: 4, defId: 'covered-call', uaKeys: ['1'], settings: st, qty: 5, onlyIds: [target.id] });
  const sc2 = out.filter((m) => m.type === 'scan')[1];
  const r2 = sc2.rows[0];
  check('مرحله دو فقط همان ردیف را برمی‌گرداند', sc2.rows.length === 1 && r2.id === target.id);
  check('با عمق واقعی، افت مظنه محاسبه شد', Number.isFinite(r2.legPrices[1].slipPct),
    `${r2.legPrices[1].slipPct.toFixed(2)}٪`);
  check('در مرحله دو یونانی روشن می‌شود', Number.isFinite(r2.delta) && !r2.greeksIncomplete,
    `دلتا ${r2.delta.toFixed(1)}`);
  check('در مرحله یک یونانی خاموش است', !Number.isFinite(target.delta), 'صرفه‌جویی در تلاطم ضمنی');
  check('هشدار عمق پایه نامعلوم، پس از نشستن عمق برداشته شد',
    !r2.warn.includes('عمق پایه نامعلوم'), r2.warn.join(' , ') || 'بی‌هشدار');

  send({ type: 'chain-detail', id: 5, uaIns: '1' });
  const cd = out.find((m) => m.type === 'chain-detail');
  check('جزئیات زنجیره برای تب دیده‌بان', cd.ua.expiries.length === 2 && cd.ua.expiries[0].strikes.length === 5);

  send({ type: 'scan', id: 6, defId: 'ناشناخته', uaKeys: ['1'], settings: st });
  check('استراتژی ناشناخته، خطای تمیز می‌دهد',
    out.filter((m) => m.type === 'scan').some((m) => m.error));
  delete globalThis.self;
}
